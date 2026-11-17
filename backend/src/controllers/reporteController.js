const db = require('../config/db');
const { decrypt } = require('../utils/crypto');

// =====================================================================
// 1. RESUMEN EJECUTIVO PARA EL DASHBOARD DEL TALLER
// =====================================================================
exports.obtenerResumenDashboard = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;

        // Ejecutar todas las métricas clave en paralelo
        const [
            [pendientesRows],
            [enProduccionRows],
            [stockBajoRows],
            [ingresosMesRows],
            [tiempoAtencionRows],
            [umbralTallerRows]
        ] = await Promise.all([
            db.query(
                'SELECT COUNT(*) AS total, MAX(horas_espera) AS max_horas_espera FROM vw_pedidos_pendientes WHERE taller_id = ?',
                [taller_id]
            ),
            db.query(
                "SELECT COUNT(*) AS total FROM pedido WHERE taller_id = ? AND estado IN ('aceptado', 'en_produccion')",
                [taller_id]
            ),
            db.query(
                'SELECT COUNT(*) AS total FROM vw_stock_bajo WHERE taller_id = ?',
                [taller_id]
            ),
            db.query(
                `SELECT COALESCE(SUM(monto), 0) AS total_mes
                 FROM vw_ingresos
                 WHERE taller_id = ? AND YEAR(fecha_pago) = YEAR(CURDATE()) AND MONTH(fecha_pago) = MONTH(CURDATE())`,
                [taller_id]
            ),
            db.query(
                'SELECT ROUND(AVG(minutos_hasta_respuesta), 1) AS promedio_minutos FROM vw_tiempos_atencion WHERE taller_id = ?',
                [taller_id]
            ),
            db.query(
                'SELECT alerta_umbral_pendientes FROM taller WHERE taller_id = ?',
                [taller_id]
            )
        ]);

        const pendientes = Number(pendientesRows[0].total);
        const umbral = umbralTallerRows[0]?.alerta_umbral_pendientes || 10;

        res.json({
            taller_id,
            kpis: {
                pedidos_pendientes_respuesta: pendientes,
                alerta_umbral_superado: pendientes >= umbral,
                max_horas_espera_pendiente: pendientesRows[0].max_horas_espera || 0,
                pedidos_activos_produccion: Number(enProduccionRows[0].total),
                materiales_stock_bajo: Number(stockBajoRows[0].total),
                ingresos_mes_actual: Number(ingresosMesRows[0].total_mes),
                tiempo_promedio_respuesta_min: Number(tiempoAtencionRows[0].promedio_minutos || 0)
            }
        });

    } catch (error) {
        console.error('Error al obtener resumen del dashboard:', error);
        res.status(500).json({ error: 'Error interno al cargar los indicadores del dashboard.' });
    }
};

// =====================================================================
// 2. REPORTE DE PRODUCCIÓN POR OPERARIO (Usa vw_produccion_operario)
// =====================================================================
exports.obtenerProduccionOperarios = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { fecha_inicio, fecha_fin, operario_id } = req.query;

        let query = `
            SELECT v.operario_id,
                   u.nombres_cifrado,
                   u.apellidos_cifrado,
                   v.tipo_prenda,
                   COUNT(v.detalle_id) AS items_terminados,
                   SUM(v.cantidad) AS prendas_confeccionadas,
                   ROUND(SUM(v.costo_mano_obra), 2) AS total_mano_obra,
                   ROUND(AVG(v.minutos_confeccion), 1) AS promedio_minutos_por_item
            FROM vw_produccion_operario v
            LEFT JOIN usuario u ON u.usuario_id = v.operario_id
            WHERE v.taller_id = ?
        `;
        const params = [taller_id];

        if (operario_id) {
            query += ' AND v.operario_id = ?';
            params.push(operario_id);
        }
        if (fecha_inicio) {
            query += ' AND DATE(v.terminado_en) >= ?';
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ' AND DATE(v.terminado_en) <= ?';
            params.push(fecha_fin);
        }

        query += ' GROUP BY v.operario_id, u.nombres_cifrado, u.apellidos_cifrado, v.tipo_prenda ORDER BY prendas_confeccionadas DESC';

        const [rows] = await db.query(query, params);

        const reporte = rows.map(r => ({
            operario_id: r.operario_id,
            operario_nombre: r.nombres_cifrado
                ? `${decrypt(r.nombres_cifrado)} ${decrypt(r.apellidos_cifrado)}`
                : 'Sin asignar',
            tipo_prenda: r.tipo_prenda,
            items_terminados: Number(r.items_terminados),
            prendas_confeccionadas: Number(r.prendas_confeccionadas),
            total_mano_obra: Number(r.total_mano_obra),
            promedio_minutos_por_item: Number(r.promedio_minutos_por_item || 0)
        }));

        res.json(reporte);

    } catch (error) {
        console.error('Error en reporte de producción por operario:', error);
        res.status(500).json({ error: 'Error interno al generar el reporte de producción.' });
    }
};

// =====================================================================
// 3. REPORTE DE CONSUMO DE MATERIALES (Usa vw_consumo_material)
// =====================================================================
exports.obtenerConsumoMateriales = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { fecha_inicio, fecha_fin, categoria } = req.query;

        let query = `
            SELECT material_id,
                   material,
                   categoria,
                   SUM(cantidad) AS cantidad_total_consumida,
                   ROUND(SUM(costo_total), 2) AS costo_total_consumido,
                   COUNT(*) AS veces_utilizado
            FROM vw_consumo_material
            WHERE taller_id = ?
        `;
        const params = [taller_id];

        if (categoria) {
            query += ' AND categoria = ?';
            params.push(categoria);
        }
        if (fecha_inicio) {
            query += ' AND DATE(fecha) >= ?';
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            query += ' AND DATE(fecha) <= ?';
            params.push(fecha_fin);
        }

        query += ' GROUP BY material_id, material, categoria ORDER BY costo_total_consumido DESC';

        const [rows] = await db.query(query, params);

        const costoGlobal = rows.reduce((acc, r) => acc + Number(r.costo_total_consumido), 0);

        res.json({
            taller_id,
            costo_total_insumos_periodo: Number(costoGlobal.toFixed(2)),
            detalle_por_material: rows.map(r => ({
                material_id: r.material_id,
                material: r.material,
                categoria: r.categoria,
                cantidad_total_consumida: Number(r.cantidad_total_consumida),
                costo_total_consumido: Number(r.costo_total_consumido),
                veces_utilizado: Number(r.veces_utilizado)
            }))
        });

    } catch (error) {
        console.error('Error en reporte de consumo de materiales:', error);
        res.status(500).json({ error: 'Error interno al generar el reporte de consumo de materiales.' });
    }
};

// =====================================================================
// 4. ALERTA DE MATERIALES CON STOCK BAJO (Usa vw_stock_bajo)
// =====================================================================
exports.obtenerAlertasStockBajo = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;

        const [rows] = await db.query(
            `SELECT material_id, nombre, categoria, unidad, stock_actual, stock_minimo,
                    ROUND(stock_minimo - stock_actual, 2) AS deficit
             FROM vw_stock_bajo
             WHERE taller_id = ?
             ORDER BY deficit DESC, nombre ASC`,
            [taller_id]
        );

        res.json({
            taller_id,
            total_alertas: rows.length,
            materiales_criticos: rows.map(r => ({
                material_id: r.material_id,
                nombre: r.nombre,
                categoria: r.categoria,
                unidad: r.unidad,
                stock_actual: Number(r.stock_actual),
                stock_minimo: Number(r.stock_minimo),
                deficit: Number(r.deficit)
            }))
        });

    } catch (error) {
        console.error('Error en reporte de stock bajo:', error);
        res.status(500).json({ error: 'Error interno al consultar alertas de stock bajo.' });
    }
};

// =====================================================================
// 5. REPORTE DE TIEMPOS DE ATENCIÓN Y PEDIDOS PENDIENTES
//    (Usa vw_tiempos_atencion y vw_pedidos_pendientes)
// =====================================================================
exports.obtenerTiemposAtencion = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;

        const [atendidosRows] = await db.query(
            `SELECT pedido_id, fecha_solicitud, fecha_respuesta, minutos_hasta_respuesta
             FROM vw_tiempos_atencion
             WHERE taller_id = ?
             ORDER BY fecha_respuesta DESC
             LIMIT 50`,
            [taller_id]
        );

        const [pendientesRows] = await db.query(
            `SELECT vp.pedido_id, vp.cliente_id, vp.prioridad, vp.fecha_solicitud, vp.horas_espera,
                    u.nombres_cifrado, u.apellidos_cifrado
             FROM vw_pedidos_pendientes vp
             JOIN usuario u ON u.usuario_id = vp.cliente_id
             WHERE vp.taller_id = ?
             ORDER BY vp.horas_espera DESC`,
            [taller_id]
        );

        const promedioMinutos = atendidosRows.length > 0
            ? atendidosRows.reduce((acc, r) => acc + Number(r.minutos_hasta_respuesta), 0) / atendidosRows.length
            : 0;

        res.json({
            taller_id,
            promedio_minutos_respuesta: Number(promedioMinutos.toFixed(1)),
            pedidos_sin_responder: pendientesRows.map(p => ({
                pedido_id: p.pedido_id,
                cliente_id: p.cliente_id,
                cliente_nombre: `${decrypt(p.nombres_cifrado)} ${decrypt(p.apellidos_cifrado)}`,
                prioridad: p.prioridad,
                fecha_solicitud: p.fecha_solicitud,
                horas_espera: Number(p.horas_espera)
            })),
            ultimos_pedidos_atendidos: atendidosRows.map(a => ({
                pedido_id: a.pedido_id,
                fecha_solicitud: a.fecha_solicitud,
                fecha_respuesta: a.fecha_respuesta,
                minutos_hasta_respuesta: Number(a.minutos_hasta_respuesta)
            }))
        });

    } catch (error) {
        console.error('Error en reporte de tiempos de atención:', error);
        res.status(500).json({ error: 'Error interno al consultar los tiempos de atención.' });
    }
};