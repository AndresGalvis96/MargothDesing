const db = require('../config/db');
const { decrypt } = require('../utils/crypto');

const intentarDescifrar = (valor) => {
    if (!valor) return '';
    try {
        return decrypt(valor);
    } catch {
        return String(valor);
    }
};

const descifrarNombre = (u) => {
    if (!u) return 'Sin nombre';
    const nom = intentarDescifrar(u.nombres_cifrado || u.nombres || u.nombre);
    const ape = intentarDescifrar(u.apellidos_cifrado || u.apellidos);
    return `${nom} ${ape}`.trim() || 'Sin nombre';
};

const extraerContacto = (u) => ({
    cliente_email: intentarDescifrar(u.correo || u.email || u.correo_cifrado || u.email_cifrado) || 'Sin correo',
    cliente_telefono: intentarDescifrar(u.telefono || u.celular || u.telefono_cifrado || u.celular_cifrado) || '',
    cliente_direccion: intentarDescifrar(u.direccion || u.direccion_cifrada) || '',
    cliente_cedula: intentarDescifrar(u.cedula || u.cedula_cifrado || u.documento || u.documento_cifrado) || ''
});

const getActorId = (req) => req.usuario?.id || req.usuario?.usuario_id;

// Helper de auditoría inmutable
async function registrarHistorial(conn, { pedido_id, usuario_id, tipo_accion, registro_afectado = null, valor_anterior = null, valor_nuevo = null, motivo = null, descripcion }) {
    try {
        await conn.query(
            `INSERT INTO pedido_historial 
             (pedido_id, usuario_id, tipo_accion, registro_afectado, valor_anterior, valor_nuevo, motivo, descripcion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [pedido_id, usuario_id, tipo_accion, registro_afectado, valor_anterior, valor_nuevo, motivo, descripcion]
        );
    } catch (e) {
        console.warn('Advertencia registrarHistorial:', e.message);
    }
}

// Helper seguro para obtener mediciones del cliente (historial inmutable + fallback a medidas_corporales)
async function obtenerMedicionesCliente(connOrDb, clienteId, tallerId) {
    let mediciones = [];
    try {
        const [hist] = await connOrDb.query(
            `SELECT m.*, u.nombres_cifrado, u.apellidos_cifrado
             FROM cliente_medida_historial m
             LEFT JOIN usuario u ON m.registrado_por = u.usuario_id
             WHERE m.cliente_id = ? AND m.taller_id = ?
             ORDER BY m.fecha_medicion DESC`,
            [clienteId, tallerId]
        );
        mediciones = hist.map((m) => ({
            ...m,
            registrado_por_nombre: m.nombres_cifrado ? descifrarNombre(m) : null,
            valores_json: typeof m.valores_json === 'string' ? JSON.parse(m.valores_json) : (m.valores_json || {})
        }));
    } catch {
        mediciones = [];
    }

    if (mediciones.length === 0) {
        try {
            const [base] = await connOrDb.query(
                `SELECT * FROM medidas_corporales WHERE usuario_id = ?`,
                [clienteId]
            );
            mediciones = base.map((m, idx) => ({
                medida_id: m.medida_id || m.id || idx + 1,
                fecha_medicion: m.fecha_actualizacion || m.fecha_creacion || m.creado_en || new Date(),
                unidad: 'cm',
                valores_json: m
            }));
        } catch {
            mediciones = [];
        }
    }

    return mediciones;
}

// 1. Listar solicitudes clasificadas y ordenadas según especificación
exports.listarSolicitudes = async (req, res) => {
    try {
        const { taller_id } = req.usuario;
        const { q = '', prioridad = '', sin_medidas = '', sin_cotizar = '', responsable_id = '' } = req.query;

        const [pedidosRows] = await db.query(
            `SELECT p.*,
                    (SELECT COUNT(*) FROM detalle_pedido dp JOIN prenda pr ON dp.prenda_id = pr.prenda_id WHERE dp.pedido_id = p.pedido_id AND pr.es_personalizada = 1) AS tiene_personalizadas,
                    GROUP_CONCAT(DISTINCT pr.nombre SEPARATOR ', ') AS prendas_resumen,
                    GROUP_CONCAT(DISTINCT dp.asignado_a SEPARATOR ',') AS items_asignados_ids
             FROM pedido p
             LEFT JOIN detalle_pedido dp ON p.pedido_id = dp.pedido_id
             LEFT JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             WHERE p.taller_id = ?
             GROUP BY p.pedido_id
             ORDER BY 
                CASE COALESCE(p.prioridad, 'normal') WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END ASC,
                CASE WHEN p.revisado_por IS NULL THEN 0 ELSE 1 END ASC,
                p.fecha_solicitud ASC`,
            [taller_id]
        );

        // Cargar todos los usuarios relevantes (clientes + operarios asignados)
        const [usuariosRows] = await db.query(
            `SELECT u.* FROM usuario u WHERE u.taller_id = ? OR u.usuario_id IN (SELECT cliente_id FROM pedido WHERE taller_id = ?)`,
            [taller_id, taller_id]
        );
        const usuariosMap = new Map();
        const nombresMap = new Map();
        for (const u of usuariosRows) {
            nombresMap.set(u.usuario_id, descifrarNombre(u));
            usuariosMap.set(u.usuario_id, {
                cliente_nombre: descifrarNombre(u),
                ...extraerContacto(u)
            });
        }

        // Contadores auxiliares tolerantes
        const cotizacionesCount = new Map();
        try {
            const [cotRows] = await db.query(
                `SELECT pedido_id, COUNT(*) AS total FROM pedido_cotizacion_version GROUP BY pedido_id`
            );
            for (const r of cotRows) cotizacionesCount.set(r.pedido_id, Number(r.total));
        } catch { /* opcional */ }

        const medidasCount = new Map();
        try {
            const [histRows] = await db.query(
                `SELECT cliente_id, COUNT(*) AS total FROM cliente_medida_historial WHERE taller_id = ? GROUP BY cliente_id`,
                [taller_id]
            );
            for (const r of histRows) medidasCount.set(r.cliente_id, (medidasCount.get(r.cliente_id) || 0) + Number(r.total));
        } catch { /* opcional */ }
        try {
            const [corpRows] = await db.query(
                `SELECT usuario_id, COUNT(*) AS total FROM medidas_corporales GROUP BY usuario_id`
            );
            for (const r of corpRows) medidasCount.set(r.usuario_id, (medidasCount.get(r.usuario_id) || 0) + Number(r.total));
        } catch { /* opcional */ }

        const tareasStats = new Map();
        try {
            const [tRows] = await db.query(
                `SELECT pedido_id,
                        COUNT(*) AS total_tareas,
                        SUM(CASE WHEN responsable_id IS NOT NULL THEN 1 ELSE 0 END) AS tareas_asignadas,
                        GROUP_CONCAT(DISTINCT responsable_id SEPARATOR ',') AS resp_ids
                 FROM prenda_tarea
                 WHERE taller_id = ? AND estado != 'cancelada'
                 GROUP BY pedido_id`,
                [taller_id]
            );
            for (const r of tRows) {
                tareasStats.set(r.pedido_id, {
                    total_tareas: Number(r.total_tareas || 0),
                    tareas_asignadas: Number(r.tareas_asignadas || 0),
                    resp_ids: r.resp_ids ? r.resp_ids.split(',').map(Number) : []
                });
            }
        } catch { /* opcional */ }

        const pagosMap = new Map();
        try {
            const [pRows] = await db.query(
                `SELECT pg.pedido_id,
                        COALESCE(SUM(CASE WHEN pg.estado = 'aprobado' THEN pg.monto ELSE 0 END), 0) AS total_abonado,
                        COALESCE(SUM(CASE WHEN pg.estado = 'pendiente' THEN pg.monto ELSE 0 END), 0) AS abono_por_verificar
                 FROM pago pg
                 INNER JOIN pedido p ON pg.pedido_id = p.pedido_id
                 WHERE p.taller_id = ?
                 GROUP BY pg.pedido_id`,
                [taller_id]
            );
            for (const r of pRows) pagosMap.set(r.pedido_id, r);
        } catch { /* opcional */ }

        const todasEnriquecidas = pedidosRows.map((p) => {
            const infoCli = usuariosMap.get(p.cliente_id) || {
                cliente_nombre: 'Cliente sin registro',
                cliente_email: '',
                cliente_telefono: '',
                cliente_direccion: '',
                cliente_cedula: ''
            };
            const tStat = tareasStats.get(p.pedido_id) || { total_tareas: 0, tareas_asignadas: 0, resp_ids: [] };
            const itemsRespIds = p.items_asignados_ids
                ? p.items_asignados_ids.split(',').filter(Boolean).map(Number)
                : [];
            const allRespIds = [...new Set([...tStat.resp_ids, ...itemsRespIds])];
            const responsables_resumen = allRespIds
                .map((id) => nombresMap.get(id))
                .filter(Boolean)
                .join(', ');

            const pagoInfo = pagosMap.get(p.pedido_id) || { total_abonado: 0, abono_por_verificar: 0 };
            const totalVersiones = cotizacionesCount.get(p.pedido_id) || 0;
            const totalMediciones = medidasCount.get(p.cliente_id) || 0;

            const requiereMedidas = Number(p.tiene_personalizadas) > 0;
            const faltanMedidas = requiereMedidas && totalMediciones === 0;
            const tieneCotizacion = totalVersiones > 0 || Number(p.costo_total) > 0;

            const estadosRecepcion = ['solicitado', 'pendiente', 'pendiente_revision', 'pendiente_informacion'];
            const esNueva = estadosRecepcion.includes(p.estado) && (!p.revisado_por || !tieneCotizacion);
            const tieneResponsable = tStat.tareas_asignadas > 0 || itemsRespIds.length > 0;

            return {
                ...p,
                ...infoCli,
                prioridad: p.prioridad || 'normal',
                total_versiones_cotizacion: totalVersiones,
                total_mediciones_cliente: totalMediciones,
                total_tareas: tStat.total_tareas,
                tareas_asignadas: tStat.tareas_asignadas,
                tiene_responsable: tieneResponsable,
                responsables_resumen,
                total_abonado: Number(pagoInfo.total_abonado || 0),
                abono_por_verificar: Number(pagoInfo.abono_por_verificar || 0),
                saldo_pendiente: Math.max(0, Number(p.costo_total || 0) - Number(pagoInfo.total_abonado || 0)),
                requiere_medidas: requiereMedidas,
                faltan_medidas: faltanMedidas,
                tiene_cotizacion: tieneCotizacion,
                es_nueva: esNueva
            };
        });

        // KPIs calculados ANTES de aplicar filtros para que las tarjetas informativas NO se alteren al hacer clic
        const estadosPorAtender = [
            'solicitado', 'pendiente', 'pendiente_revision', 'cotizacion_aprobacion',
            'cotizado', 'pendiente_informacion', 'pendiente_materiales', 'requiere_aprobacion_cliente'
        ];
        const kpis = {
            nuevas_revision: todasEnriquecidas.filter((p) => estadosPorAtender.includes(p.estado) && p.es_nueva).length,
            pendientes_cotizacion: todasEnriquecidas.filter((p) => estadosPorAtender.includes(p.estado) && !p.tiene_cotizacion).length,
            esperando_cliente: todasEnriquecidas.filter((p) => ['cotizacion_aprobacion', 'cotizado', 'requiere_aprobacion_cliente'].includes(p.estado)).length,
            aprobadas_sin_asignar: todasEnriquecidas.filter((p) => ['aceptado', 'aprobado'].includes(p.estado) && !p.tiene_responsable).length
        };

        // Aplicar filtros combinables solo a la lista devuelta
        let resultados = [...todasEnriquecidas];
        if (q.trim()) {
            const term = q.trim().toLowerCase();
            resultados = resultados.filter((p) =>
                String(p.pedido_id).includes(term) ||
                (p.cliente_nombre || '').toLowerCase().includes(term) ||
                (p.cliente_cedula || '').toLowerCase().includes(term) ||
                (p.cliente_telefono || '').toLowerCase().includes(term) ||
                (p.prendas_resumen || '').toLowerCase().includes(term)
            );
        }
        if (prioridad) resultados = resultados.filter((p) => p.prioridad === prioridad);
        if (sin_medidas === '1') resultados = resultados.filter((p) => p.faltan_medidas);
        if (sin_cotizar === '1') resultados = resultados.filter((p) => !p.tiene_cotizacion);
        if (responsable_id) {
            resultados = resultados.filter((p) =>
                (p.responsables_resumen || '').toLowerCase().includes(responsable_id.toLowerCase())
            );
        }

        res.json({ solicitudes: resultados, kpis });
    } catch (err) {
        console.error('Error listarSolicitudes:', err);
        res.status(500).json({ error: 'Error al cargar solicitudes.', detalle: err.message });
    }
};

// 2. Obtener detalle completo (Información, Medidas, Pagos/Abonos, Cotizaciones, Tareas e Historial)
exports.obtenerDetalleSolicitud = async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const { taller_id } = req.usuario;
        const actorId = getActorId(req);

        const [[rawPedido]] = await db.query(
            `SELECT p.* FROM pedido p WHERE p.pedido_id = ? AND p.taller_id = ?`,
            [pedidoId, taller_id]
        );

        if (!rawPedido) return res.status(404).json({ error: 'Solicitud no encontrada en este taller.' });

        const [[rawCli]] = await db.query(`SELECT u.* FROM usuario u WHERE u.usuario_id = ?`, [rawPedido.cliente_id]);
        const pedido = {
            ...rawPedido,
            prioridad: rawPedido.prioridad || 'normal',
            cliente_nombre: descifrarNombre(rawCli),
            ...extraerContacto(rawCli || {})
        };

        if (!pedido.revisado_por && ['admin_local', 'supervisor'].includes(req.usuario.rol)) {
            try {
                await db.query(
                    `UPDATE pedido SET revisado_por = ?, fecha_revision = NOW() WHERE pedido_id = ?`,
                    [actorId, pedidoId]
                );
                await registrarHistorial(db, {
                    pedido_id: pedidoId,
                    usuario_id: actorId,
                    tipo_accion: 'revision',
                    descripcion: 'Solicitud revisada por primera vez en el panel administrativo.'
                });
            } catch { /* ignorar si la columna no existe */ }
        }

        const [itemsRows] = await db.query(
            `SELECT dp.*, pr.nombre AS prenda_nombre, pr.tipo_prenda, pr.es_personalizada,
                    resp.nombres_cifrado AS resp_nombres_cif, resp.apellidos_cifrado AS resp_apellidos_cif
             FROM detalle_pedido dp
             JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             LEFT JOIN usuario resp ON dp.asignado_a = resp.usuario_id
             WHERE dp.pedido_id = ?`,
            [pedidoId]
        );

        const items = itemsRows.map((it) => ({
            ...it,
            responsable_nombre: it.resp_nombres_cif
                ? descifrarNombre({ nombres_cifrado: it.resp_nombres_cif, apellidos_cifrado: it.resp_apellidos_cif })
                : null
        }));

        const mediciones = await obtenerMedicionesCliente(db, pedido.cliente_id, taller_id);

        // Pagos y abonos reales del pedido
        let pagos = [];
        try {
            const [rowsPagos] = await db.query(
                `SELECT * FROM pago WHERE pedido_id = ? ORDER BY fecha_pago DESC`,
                [pedidoId]
            );
            pagos = rowsPagos;
        } catch { pagos = []; }

        const totalAbonado = pagos
            .filter((pg) => pg.estado === 'aprobado')
            .reduce((acc, pg) => acc + Number(pg.monto || 0), 0);
        const abonosPendientesVerificar = pagos
            .filter((pg) => pg.estado === 'pendiente')
            .reduce((acc, pg) => acc + Number(pg.monto || 0), 0);
        const costoTotal = Number(pedido.costo_total || 0);
        const anticipoMinimo = Number(pedido.anticipo_minimo || 0);

        const resumenFinanciero = {
            costo_total: costoTotal,
            anticipo_minimo: anticipoMinimo,
            total_abonado: totalAbonado,
            abonos_pendientes_verificar: abonosPendientesVerificar,
            saldo_pendiente: Math.max(0, costoTotal - totalAbonado),
            anticipo_cubierto: anticipoMinimo === 0 || totalAbonado >= anticipoMinimo
        };

        let cotizaciones = [];
        try {
            const [cotizacionesRows] = await db.query(
                `SELECT v.*, u.nombres_cifrado, u.apellidos_cifrado
                 FROM pedido_cotizacion_version v
                 JOIN usuario u ON v.creado_por = u.usuario_id
                 WHERE v.pedido_id = ?
                 ORDER BY v.numero_version DESC`,
                [pedidoId]
            );
            cotizaciones = cotizacionesRows.map((v) => ({
                ...v,
                creador_nombre: descifrarNombre(v)
            }));
        } catch { cotizaciones = []; }

        let tareas = [];
        try {
            const [tareasRows] = await db.query(
                `SELECT pt.*,
                        u.nombres_cifrado, u.apellidos_cifrado,
                        dep.nombre AS dependencia_nombre,
                        dep.estado AS dependencia_estado
                 FROM prenda_tarea pt
                 LEFT JOIN usuario u ON pt.responsable_id = u.usuario_id
                 LEFT JOIN prenda_tarea dep ON pt.dependencia_tarea_id = dep.tarea_id
                 WHERE pt.pedido_id = ?
                 ORDER BY pt.detalle_id ASC, pt.tarea_id ASC`,
                [pedidoId]
            );
            tareas = tareasRows.map((t) => ({
                ...t,
                responsable_nombre: t.nombres_cifrado ? descifrarNombre(t) : null
            }));
        } catch { tareas = []; }

        let historial = [];
        try {
            const [historialRows] = await db.query(
                `SELECT h.*, u.nombres_cifrado, u.apellidos_cifrado, u.rol AS usuario_rol
                 FROM pedido_historial h
                 JOIN usuario u ON h.usuario_id = u.usuario_id
                 WHERE h.pedido_id = ?
                 ORDER BY h.creado_en DESC`,
                [pedidoId]
            );
            historial = historialRows.map((h) => ({
                ...h,
                usuario_nombre: descifrarNombre(h)
            }));
        } catch { historial = []; }

        const tienePersonalizada = items.some((i) => Number(i.es_personalizada) === 1);
        const medidasDisponibles = mediciones.length > 0;
        const cotizacionAceptada = ['aceptado', 'aprobado', 'preparacion_materiales', 'corte', 'confeccion', 'en_produccion', 'control_calidad_pruebas', 'lista_entrega', 'terminado', 'entregado', 'entregada'].includes(pedido.estado);
        const tareasActivas = tareas.filter((t) => t.estado !== 'cancelada');
        const tieneAsignacion = tareasActivas.some((t) => t.responsable_id) || items.some((i) => i.asignado_a);

        const requisitosProduccion = {
            cotizacion_aprobada: cotizacionAceptada,
            medidas_ok: !tienePersonalizada || medidasDisponibles,
            asignacion_ok: tieneAsignacion,
            anticipo_ok: resumenFinanciero.anticipo_cubierto,
            listo_para_agenda: cotizacionAceptada && (!tienePersonalizada || medidasDisponibles) && tieneAsignacion
        };

        res.json({
            pedido,
            items,
            mediciones,
            pagos,
            resumenFinanciero,
            cotizaciones,
            tareas,
            historial,
            requisitosProduccion
        });
    } catch (err) {
        console.error('Error obtenerDetalleSolicitud:', err);
        res.status(500).json({ error: 'Error al obtener el detalle de la solicitud.', detalle: err.message });
    }
};

// 3. Crear Cotización o Re-cotizar (crea nueva versión inmutable)
exports.guardarVersionCotizacion = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { pedidoId } = req.params;
        const { taller_id, rol } = req.usuario;
        const actorId = getActorId(req);

        if (!['admin_local', 'supervisor'].includes(rol)) {
            await conn.rollback();
            return res.status(403).json({ error: 'No tienes permisos para cotizar solicitudes.' });
        }

        const { items, anticipo_minimo = 0, costos_adicionales = 0, tiempo_estimado_dias = 5, observaciones_cliente = '', motivo_cambio = null, detalle_motivo = '' } = req.body;

        const [[pedido]] = await conn.query(`SELECT * FROM pedido WHERE pedido_id = ? AND taller_id = ?`, [pedidoId, taller_id]);
        if (!pedido) {
            await conn.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const [[ultimaVer]] = await conn.query(
            `SELECT * FROM pedido_cotizacion_version WHERE pedido_id = ? ORDER BY numero_version DESC LIMIT 1`,
            [pedidoId]
        );

        const esRecotizacion = Boolean(ultimaVer);
        if (esRecotizacion && !motivo_cambio) {
            await conn.rollback();
            return res.status(400).json({ error: 'Debes indicar obligatoriamente el motivo de la re-cotización.' });
        }

        if (ultimaVer) {
            await conn.query(
                `UPDATE pedido_cotizacion_version SET estado = 'reemplazada' WHERE version_id = ?`,
                [ultimaVer.version_id]
            );
        }

        let totalMateriales = 0;
        let totalManoObra = 0;
        let subtotalItems = 0;

        for (const it of items) {
            const mat = Number(it.costo_materiales || 0);
            const mo = Number(it.costo_mano_obra || 0);
            const sub = Number(it.subtotal || (mat + mo));
            totalMateriales += mat;
            totalManoObra += mo;
            subtotalItems += sub;

            await conn.query(
                `UPDATE detalle_pedido SET costo_materiales = ?, costo_mano_obra = ?, subtotal = ?, talla = ?, descripcion = ? WHERE detalle_id = ? AND pedido_id = ?`,
                [mat, mo, sub, it.talla || 'M', it.descripcion || '', it.detalle_id, pedidoId]
            );
        }

        const valorTotal = subtotalItems + Number(costos_adicionales || 0);
        const nuevoNumeroVersion = ultimaVer ? ultimaVer.numero_version + 1 : 1;

        await conn.query(
            `INSERT INTO pedido_cotizacion_version
             (pedido_id, numero_version, costo_materiales, costo_mano_obra, costos_adicionales, valor_total, anticipo_minimo, tiempo_estimado_dias, observaciones_cliente, items_snapshot, motivo_cambio, detalle_motivo, estado, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'vigente', ?)`,
            [
                pedidoId, nuevoNumeroVersion, totalMateriales, totalManoObra, Number(costos_adicionales || 0),
                valorTotal, Number(anticipo_minimo || 0), Number(tiempo_estimado_dias || 5),
                observaciones_cliente, JSON.stringify(items), motivo_cambio, detalle_motivo, actorId
            ]
        );

        const nuevoEstadoPedido = ['aceptado', 'aprobado'].includes(pedido.estado)
            ? 'requiere_aprobacion_cliente'
            : 'cotizacion_aprobacion';

        await conn.query(
            `UPDATE pedido SET costo_total = ?, anticipo_minimo = ?, notas_cotizacion = ?, tiempo_estimado_dias = ?, estado = ? WHERE pedido_id = ?`,
            [valorTotal, Number(anticipo_minimo || 0), observaciones_cliente, Number(tiempo_estimado_dias || 5), nuevoEstadoPedido, pedidoId]
        );

        await registrarHistorial(conn, {
            pedido_id: pedidoId,
            usuario_id: actorId,
            tipo_accion: esRecotizacion ? 'recotizacion' : 'cotizacion_creada',
            registro_afectado: `Cotización v${nuevoNumeroVersion}`,
            valor_anterior: ultimaVer ? `$${Number(ultimaVer.valor_total).toLocaleString('es-CO')}` : null,
            valor_nuevo: `$${valorTotal.toLocaleString('es-CO')}`,
            motivo: motivo_cambio ? `${motivo_cambio}${detalle_motivo ? `: ${detalle_motivo}` : ''}` : 'Cotización inicial',
            descripcion: esRecotizacion
                ? `Nueva versión de cotización v${nuevoNumeroVersion} generada por $${valorTotal.toLocaleString('es-CO')}.`
                : `Cotización v1 creada por $${valorTotal.toLocaleString('es-CO')}.`
        });

        await conn.commit();
        res.json({ mensaje: `Cotización v${nuevoNumeroVersion} guardada correctamente.`, version: nuevoNumeroVersion });
    } catch (err) {
        await conn.rollback();
        console.error('Error guardarVersionCotizacion:', err);
        res.status(500).json({ error: 'Error al guardar la versión de cotización.', detalle: err.message });
    } finally {
        conn.release();
    }
};

// 4. Balance de Carga de Sastres y Encargados (Excluye admin_local)
exports.obtenerBalanceCarga = async (req, res) => {
    try {
        const { taller_id } = req.usuario;

        const [operarios] = await db.query(
            `SELECT u.*
             FROM usuario u
             WHERE u.taller_id = ?
               AND u.estado = 'activo'
               AND u.rol IN ('operario', 'supervisor', 'encargado')`,
            [taller_id]
        );

        const cargasMap = new Map();
        try {
            const [cargas] = await db.query(
                `SELECT pt.responsable_id,
                        COALESCE(SUM(pt.horas_estimadas - COALESCE(pt.horas_trabajadas, 0)), 0) AS horas_comprometidas,
                        COUNT(*) AS tareas_pendientes,
                        MIN(pt.fecha_limite) AS proxima_fecha_limite
                 FROM prenda_tarea pt
                 WHERE pt.taller_id = ?
                   AND pt.responsable_id IS NOT NULL
                   AND pt.estado IN ('pendiente', 'esperando_dependencia', 'en_progreso')
                 GROUP BY pt.responsable_id`,
                [taller_id]
            );
            for (const c of cargas) cargasMap.set(c.responsable_id, c);
        } catch { /* ignorar */ }

        const balance = operarios.map((op) => {
            const c = cargasMap.get(op.usuario_id) || {};
            const disponibles = Number(op.horas_semanales_disponibles || 40);
            const comprometidas = Math.max(0, Number(c.horas_comprometidas || 0));
            const porcentaje = disponibles > 0 ? Math.round((comprometidas / disponibles) * 100) : 0;

            let nivel = 'baja';
            if (porcentaje > 100) nivel = 'sobrecarga';
            else if (porcentaje >= 80) nivel = 'alta';
            else if (porcentaje >= 60) nivel = 'equilibrada';

            return {
                usuario_id: op.usuario_id,
                nombre: descifrarNombre(op),
                rol: op.rol,
                especialidades: op.especialidades || null,
                tareas_pendientes: Number(c.tareas_pendientes || 0),
                proxima_fecha_limite: c.proxima_fecha_limite || null,
                horas_disponibles: disponibles,
                horas_comprometidas: comprometidas,
                horas_restantes: Math.max(0, disponibles - comprometidas),
                porcentaje_carga: porcentaje,
                nivel_carga: nivel
            };
        }).sort((a, b) => a.porcentaje_carga - b.porcentaje_carga);

        res.json(balance);
    } catch (err) {
        console.error('Error obtenerBalanceCarga:', err);
        res.status(500).json({ error: 'Error al calcular balance de carga.', detalle: err.message });
    }
};

// 5. Crear tarea en una prenda (con validación anti-duplicidad y dependencias)
exports.crearTareaPrenda = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { pedidoId, detalleId } = req.params;
        const { taller_id } = req.usuario;
        const actorId = getActorId(req);
        const {
            nombre, descripcion = '', parte_prenda, alcance_trabajo = '',
            responsable_id = null, complejidad = 'media', horas_estimadas = 2,
            prioridad = 'normal', fecha_inicio_prevista = null, fecha_limite = null,
            dependencia_tarea_id = null, observaciones = '', confirmar_duplicado = false
        } = req.body;

        if (!nombre || !parte_prenda) {
            await conn.rollback();
            return res.status(400).json({ error: 'El nombre y la parte de la prenda son obligatorios.' });
        }

        if (responsable_id) {
            const [[respUser]] = await conn.query(`SELECT rol FROM usuario WHERE usuario_id = ?`, [responsable_id]);
            if (!respUser || respUser.rol === 'admin_local') {
                await conn.rollback();
                return res.status(400).json({ error: 'El administrador local no puede ser asignado como confeccionista.' });
            }
        }

        const alcanceNorm = (alcance_trabajo || nombre).trim().toLowerCase();

        if (!confirmar_duplicado) {
            const [similares] = await conn.query(
                `SELECT tarea_id, nombre, parte_prenda FROM prenda_tarea
                 WHERE detalle_id = ? AND estado != 'cancelada'
                   AND LOWER(parte_prenda) = LOWER(?)
                   AND (LOWER(alcance_trabajo) = ? OR LOWER(nombre) = LOWER(?))`,
                [detalleId, parte_prenda, alcanceNorm, nombre.trim()]
            );
            if (similares.length > 0) {
                await conn.rollback();
                return res.status(409).json({
                    advertencia_duplicado: true,
                    mensaje: `Ya existe una tarea similar ("${similares[0].nombre}") sobre "${parte_prenda}". Confirma si es una actividad distinta.`
                });
            }
        }

        let estadoInicial = 'pendiente';
        if (dependencia_tarea_id) {
            const [[dep]] = await conn.query(`SELECT estado FROM prenda_tarea WHERE tarea_id = ?`, [dependencia_tarea_id]);
            if (dep && dep.estado !== 'completada') {
                estadoInicial = 'esperando_dependencia';
            }
        }

        await conn.query(
            `INSERT INTO prenda_tarea
             (pedido_id, detalle_id, taller_id, nombre, descripcion, parte_prenda, alcance_trabajo, responsable_id, complejidad, horas_estimadas, prioridad, fecha_inicio_prevista, fecha_limite, dependencia_tarea_id, observaciones, estado, creado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                pedidoId, detalleId, taller_id, nombre.trim(), descripcion, parte_prenda, alcanceNorm,
                responsable_id || null, complejidad, Number(horas_estimadas || 2), prioridad,
                fecha_inicio_prevista || null, fecha_limite || null, dependencia_tarea_id || null,
                observaciones, estadoInicial, actorId
            ]
        );

        // Sincronizar responsable principal en detalle_pedido si aún no tiene uno
        if (responsable_id) {
            await conn.query(
                `UPDATE detalle_pedido SET asignado_a = COALESCE(asignado_a, ?) WHERE detalle_id = ?`,
                [responsable_id, detalleId]
            );
        }

        await registrarHistorial(conn, {
            pedido_id: pedidoId,
            usuario_id: actorId,
            tipo_accion: 'tarea_creada',
            registro_afectado: `${parte_prenda}: ${nombre}`,
            descripcion: `Tarea "${nombre}" (${horas_estimadas}h) creada para ${parte_prenda}.`
        });

        await conn.commit();
        res.json({ mensaje: 'Tarea registrada en la prenda.' });
    } catch (err) {
        await conn.rollback();
        console.error('Error crearTareaPrenda:', err);
        res.status(500).json({ error: 'Error al crear la tarea de la prenda.', detalle: err.message });
    } finally {
        conn.release();
    }
};

// 6. Reasignar responsable de tarea
exports.reasignarTarea = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { tareaId } = req.params;
        const actorId = getActorId(req);
        const { nuevo_responsable_id, motivo = '' } = req.body;

        const [[tarea]] = await conn.query(
            `SELECT pt.*, u.nombres_cifrado, u.apellidos_cifrado
             FROM prenda_tarea pt
             LEFT JOIN usuario u ON pt.responsable_id = u.usuario_id
             WHERE pt.tarea_id = ?`,
            [tareaId]
        );
        if (!tarea) {
            await conn.rollback();
            return res.status(404).json({ error: 'Tarea no encontrada.' });
        }

        if (tarea.responsable_id && !motivo.trim()) {
            await conn.rollback();
            return res.status(400).json({ error: 'Debes indicar un motivo al cambiar un responsable ya asignado.' });
        }

        const [[nuevoUser]] = await conn.query(`SELECT u.* FROM usuario u WHERE u.usuario_id = ?`, [nuevo_responsable_id]);
        if (!nuevoUser || nuevoUser.rol === 'admin_local') {
            await conn.rollback();
            return res.status(400).json({ error: 'Responsable inválido para confección.' });
        }

        const anteriorNombre = tarea.nombres_cifrado ? descifrarNombre(tarea) : 'Sin asignar';
        const nuevoNombre = descifrarNombre(nuevoUser);

        await conn.query(`UPDATE prenda_tarea SET responsable_id = ? WHERE tarea_id = ?`, [nuevo_responsable_id, tareaId]);
        await conn.query(`UPDATE detalle_pedido SET asignado_a = ? WHERE detalle_id = ?`, [nuevo_responsable_id, tarea.detalle_id]);

        await registrarHistorial(conn, {
            pedido_id: tarea.pedido_id,
            usuario_id: actorId,
            tipo_accion: 'asignacion_responsable',
            registro_afectado: tarea.nombre,
            valor_anterior: anteriorNombre,
            valor_nuevo: nuevoNombre,
            motivo: motivo.trim() || 'Asignación inicial',
            descripcion: `Tarea "${tarea.nombre}" asignada a ${nuevoNombre}.`
        });

        await conn.commit();
        res.json({ mensaje: `Tarea asignada a ${nuevoNombre}.` });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: 'Error al asignar responsable.', detalle: err.message });
    } finally {
        conn.release();
    }
};

// 7. Cambiar prioridad, asignar operario directo a prenda, rechazar o enviar a producción
exports.gestionarAccionAdministrativa = async (req, res) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const { pedidoId } = req.params;
        const { taller_id, rol } = req.usuario;
        const actorId = getActorId(req);
        const { accion, prioridad, motivo, observaciones = '', detalle_id, responsable_id } = req.body;

        const [[pedido]] = await conn.query(`SELECT * FROM pedido WHERE pedido_id = ? AND taller_id = ?`, [pedidoId, taller_id]);
        if (!pedido) {
            await conn.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        if (accion === 'cambiar_prioridad') {
            await conn.query(`UPDATE pedido SET prioridad = ? WHERE pedido_id = ?`, [prioridad, pedidoId]);
            await registrarHistorial(conn, {
                pedido_id: pedidoId,
                usuario_id: actorId,
                tipo_accion: 'cambio_prioridad',
                valor_anterior: pedido.prioridad || 'normal',
                valor_nuevo: prioridad,
                motivo: motivo || null,
                descripcion: `Prioridad cambiada de "${pedido.prioridad || 'normal'}" a "${prioridad}".`
            });
        } else if (accion === 'asignar_prenda_directo') {
            const [[nuevoUser]] = await conn.query(`SELECT u.* FROM usuario u WHERE u.usuario_id = ?`, [responsable_id]);
            if (!nuevoUser || nuevoUser.rol === 'admin_local') {
                await conn.rollback();
                return res.status(400).json({ error: 'Responsable inválido para confección.' });
            }
            const [[item]] = await conn.query(
                `SELECT dp.*, pr.nombre AS prenda_nombre FROM detalle_pedido dp JOIN prenda pr ON dp.prenda_id = pr.prenda_id WHERE dp.detalle_id = ? AND dp.pedido_id = ?`,
                [detalle_id, pedidoId]
            );
            if (!item) {
                await conn.rollback();
                return res.status(404).json({ error: 'Prenda no encontrada en el pedido.' });
            }
            if (item.asignado_a && !motivo?.trim()) {
                await conn.rollback();
                return res.status(400).json({ error: 'Debes indicar un motivo al reasignar una prenda.' });
            }

            await conn.query(`UPDATE detalle_pedido SET asignado_a = ? WHERE detalle_id = ?`, [responsable_id, detalle_id]);

            // Si aún no tiene tareas creadas, crear una tarea general inicial para reflejar la carga horaria
            const [tareasExistentes] = await conn.query(
                `SELECT tarea_id FROM prenda_tarea WHERE detalle_id = ? AND estado != 'cancelada'`,
                [detalle_id]
            );
            if (tareasExistentes.length === 0) {
                await conn.query(
                    `INSERT INTO prenda_tarea
                     (pedido_id, detalle_id, taller_id, nombre, parte_prenda, alcance_trabajo, responsable_id, complejidad, horas_estimadas, prioridad, estado, creado_por)
                     VALUES (?, ?, ?, ?, 'General / Preparación y corte', 'confeccion completa', ?, 'media', 4, ?, 'pendiente', ?)`,
                    [pedidoId, detalle_id, taller_id, `Confección integral: ${item.prenda_nombre}`, responsable_id, pedido.prioridad || 'normal', actorId]
                );
            }

            const nombreResp = descifrarNombre(nuevoUser);
            await registrarHistorial(conn, {
                pedido_id: pedidoId,
                usuario_id: actorId,
                tipo_accion: 'asignacion_responsable',
                registro_afectado: item.prenda_nombre,
                valor_nuevo: nombreResp,
                motivo: motivo?.trim() || 'Asignación directa de prenda',
                descripcion: `Prenda "${item.prenda_nombre}" asignada a ${nombreResp}.`
            });
        } else if (accion === 'rechazar') {
            if (!['admin_local', 'supervisor'].includes(rol)) {
                await conn.rollback();
                return res.status(403).json({ error: 'Solo el administrador local o supervisor puede rechazar solicitudes.' });
            }
            if (!motivo || !motivo.trim()) {
                await conn.rollback();
                return res.status(400).json({ error: 'El motivo del rechazo es obligatorio.' });
            }
            const textoMotivo = observaciones ? `${motivo.trim()} — ${observaciones.trim()}` : motivo.trim();
            await conn.query(
                `UPDATE pedido SET estado = 'rechazado', motivo_rechazo = ?, rechazado_por = ?, fecha_rechazo = NOW() WHERE pedido_id = ?`,
                [textoMotivo, actorId, pedidoId]
            );
            await registrarHistorial(conn, {
                pedido_id: pedidoId,
                usuario_id: actorId,
                tipo_accion: 'rechazo',
                valor_anterior: pedido.estado,
                valor_nuevo: 'rechazado',
                motivo: textoMotivo,
                descripcion: `Solicitud rechazada: ${textoMotivo}`
            });
        } else if (accion === 'enviar_a_produccion') {
            const [items] = await conn.query(
                `SELECT dp.*, pr.es_personalizada FROM detalle_pedido dp JOIN prenda pr ON dp.prenda_id = pr.prenda_id WHERE dp.pedido_id = ?`,
                [pedidoId]
            );
            const mediciones = await obtenerMedicionesCliente(conn, pedido.cliente_id, taller_id);
            const [tareas] = await conn.query(`SELECT * FROM prenda_tarea WHERE pedido_id = ? AND estado != 'cancelada'`, [pedidoId]);

            const tienePers = items.some((i) => Number(i.es_personalizada) === 1);
            if (tienePers && mediciones.length === 0) {
                await conn.rollback();
                return res.status(400).json({ error: 'No se puede iniciar producción porque faltan medidas validadas del cliente.' });
            }
            if (!['aceptado', 'aprobado'].includes(pedido.estado)) {
                await conn.rollback();
                return res.status(400).json({ error: 'El cliente debe aprobar la cotización antes de enviar a producción.' });
            }
            const tieneAsignacion = (tareas.length > 0 && tareas.every((t) => t.responsable_id)) || items.every((i) => i.asignado_a);
            if (!tieneAsignacion) {
                await conn.rollback();
                return res.status(400).json({ error: 'Debes asignar un responsable a todas las prendas o tareas antes de enviar a producción.' });
            }

            await conn.query(`UPDATE pedido SET estado = 'preparacion_materiales' WHERE pedido_id = ?`, [pedidoId]);
            await registrarHistorial(conn, {
                pedido_id: pedidoId,
                usuario_id: actorId,
                tipo_accion: 'enviado_produccion',
                valor_anterior: pedido.estado,
                valor_nuevo: 'preparacion_materiales',
                descripcion: 'Solicitud validada y enviada a la Agenda de Producción.'
            });
        }

        await conn.commit();
        res.json({ mensaje: 'Acción aplicada correctamente.' });
    } catch (err) {
        await conn.rollback();
        console.error('Error gestionarAccionAdministrativa:', err);
        res.status(500).json({ error: 'Error al procesar la acción.', detalle: err.message });
    } finally {
        conn.release();
    }
};