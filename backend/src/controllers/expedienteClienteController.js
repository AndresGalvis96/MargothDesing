const db = require('../config/db');
const { decrypt, encrypt } = require('../utils/crypto');

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
    email: intentarDescifrar(u.correo || u.email || u.correo_cifrado || u.email_cifrado) || 'Sin correo',
    telefono: intentarDescifrar(u.telefono || u.celular || u.telefono_cifrado || u.celular_cifrado) || '',
    direccion: intentarDescifrar(u.direccion || u.direccion_cifrada) || '',
    medio_contacto_preferido: u.medio_contacto_preferido || 'whatsapp',
    observaciones_internas: u.observaciones_internas || '',
    foto_perfil: u.foto_perfil || null,
    estado: u.estado || 'activo',
    creado_en: u.creado_en || u.fecha_registro || null
});

// ==========================================
// 1. Obtener Expediente Completo 360° de un Cliente
// ==========================================
exports.obtenerExpedienteCliente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const taller_id = req.usuario.taller_id;

        // A. Datos base y CRM del cliente (SELECT u.* evita errores por nombres de columna)
        const [clientes] = await db.query(
            `SELECT u.*
             FROM usuario u
             WHERE u.usuario_id = ? AND u.rol = 'cliente'
               AND (
                   u.taller_id = ?
                   OR EXISTS (
                       SELECT 1 FROM pedido p
                       WHERE p.cliente_id = u.usuario_id AND p.taller_id = ?
                   )
               )`,
            [clienteId, taller_id, taller_id]
        );

        if (clientes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado en este taller.' });
        }

        const rawCli = clientes[0];
        const cliente = {
            usuario_id: rawCli.usuario_id,
            nombre: descifrarNombre(rawCli),
            ...extraerContacto(rawCli)
        };

        // B. Pedidos y prendas del cliente en este taller
        const [detallesRows] = await db.query(
            `SELECT dp.detalle_id, dp.pedido_id, dp.prenda_id, dp.cantidad,
                    ROUND(dp.subtotal / GREATEST(dp.cantidad, 1), 2) AS precio_unitario,
                    dp.subtotal, dp.descripcion, dp.talla,
                    p.fecha_solicitud AS fecha_pedido, p.estado AS estado_pedido,
                    p.costo_total AS monto_total,
                    pr.nombre AS prenda_nombre, pr.tipo_prenda, pr.color AS prenda_color,
                    pr.es_personalizada, pr.calidad, pr.complejidad,
                    u_op.nombres_cifrado AS op_nombres, u_op.apellidos_cifrado AS op_apellidos
             FROM detalle_pedido dp
             INNER JOIN pedido p ON dp.pedido_id = p.pedido_id
             INNER JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             LEFT JOIN usuario u_op ON dp.asignado_a = u_op.usuario_id
             WHERE p.cliente_id = ? AND p.taller_id = ?
             ORDER BY p.fecha_solicitud DESC`,
            [clienteId, taller_id]
        );

        const detalles = detallesRows.map((d) => ({
            ...d,
            responsable_nombre: d.op_nombres
                ? descifrarNombre({ nombres_cifrado: d.op_nombres, apellidos_cifrado: d.op_apellidos })
                : null
        }));

        const prendasMedida = detalles.filter((d) => Boolean(d.es_personalizada));
        const prendasCatalogo = detalles.filter((d) => !Boolean(d.es_personalizada));

        // C. Pagos realizados por el cliente
        let pagos = [];
        try {
            const [rowsPagos] = await db.query(
                `SELECT pg.*
                 FROM pago pg
                 INNER JOIN pedido p ON pg.pedido_id = p.pedido_id
                 WHERE p.cliente_id = ? AND p.taller_id = ?
                 ORDER BY pg.fecha_pago DESC`,
                [clienteId, taller_id]
            );
            pagos = rowsPagos;
        } catch { pagos = []; }

        // D. Historial de mediciones antropométricas
        let medicionesParsed = [];
        try {
            const [mediciones] = await db.query(
                `SELECT m.*, u.nombres_cifrado, u.apellidos_cifrado
                 FROM cliente_medida_historial m
                 LEFT JOIN usuario u ON m.registrado_por = u.usuario_id
                 WHERE m.cliente_id = ? AND m.taller_id = ?
                 ORDER BY m.fecha_medicion DESC`,
                [clienteId, taller_id]
            );

            medicionesParsed = mediciones.map((m) => ({
                ...m,
                registrado_por_nombre: m.nombres_cifrado ? descifrarNombre(m) : null,
                valores_json: typeof m.valores_json === 'string' ? JSON.parse(m.valores_json) : (m.valores_json || {})
            }));
        } catch { medicionesParsed = []; }

        // E. Bitácora de comunicaciones
        let bitacora = [];
        try {
            const [bitacoraRows] = await db.query(
                `SELECT b.*, u.nombres_cifrado, u.apellidos_cifrado
                 FROM cliente_bitacora_comunicacion b
                 LEFT JOIN usuario u ON b.usuario_id = u.usuario_id
                 WHERE b.cliente_id = ? AND b.taller_id = ?
                 ORDER BY b.creado_en DESC`,
                [clienteId, taller_id]
            );

            bitacora = bitacoraRows.map((b) => ({
                ...b,
                usuario_nombre: b.nombres_cifrado ? descifrarNombre(b) : 'Sistema'
            }));
        } catch { bitacora = []; }

        // F. Resumen de pedidos únicos para KPIs y saldo pendiente
        const [pedidosUnicos] = await db.query(
            `SELECT p.pedido_id, p.estado, p.fecha_solicitud AS fecha_pedido, p.costo_total AS monto_total,
                    COALESCE((
                        SELECT SUM(pg.monto)
                        FROM pago pg
                        WHERE pg.pedido_id = p.pedido_id AND pg.estado = 'aprobado'
                    ), 0) AS monto_pagado
             FROM pedido p
             WHERE p.cliente_id = ? AND p.taller_id = ?
             ORDER BY p.fecha_solicitud DESC`,
            [clienteId, taller_id]
        );

        const saldoPendienteTotal = pedidosUnicos
            .filter((p) => !['cancelado', 'rechazado'].includes(p.estado))
            .reduce((acc, p) => acc + Math.max(0, Number(p.monto_total || 0) - Number(p.monto_pagado || 0)), 0);

        const pedidosPendientes = pedidosUnicos.filter((p) =>
            ['solicitado', 'aceptado', 'pendiente', 'cotizado', 'aprobado'].includes(p.estado)
        ).length;

        const pedidosEnConfeccion = pedidosUnicos.filter((p) =>
            ['en_produccion', 'preparacion_materiales', 'corte', 'confeccion', 'control_calidad_pruebas', 'requiere_ajustes'].includes(p.estado)
        ).length;

        const prendasListasEntrega = pedidosUnicos.filter((p) =>
            ['terminado', 'lista_entrega'].includes(p.estado)
        ).length;

        // Antecedentes de tallas frecuentes
        const tallasFrecuentes = {};
        for (const item of prendasCatalogo) {
            const tallaTexto = item.talla || (String(item.descripcion || '').match(/Talla\s+([A-Za-z0-9]+)/i)?.[1]);
            if (tallaTexto) {
                const clave = `${item.tipo_prenda}: Talla ${String(tallaTexto).toUpperCase()}`;
                tallasFrecuentes[clave] = (tallasFrecuentes[clave] || 0) + Number(item.cantidad || 1);
            }
        }

        // Alertas inteligentes
        const alertas = [];
        if (saldoPendienteTotal > 0) {
            alertas.push(`Saldo pendiente acumulado de $${saldoPendienteTotal.toLocaleString('es-CO')}.`);
        }
        if (prendasListasEntrega > 0) {
            alertas.push(`Tiene ${prendasListasEntrega} pedido(s) terminado(s) listo(s) para entregar.`);
        }
        if (medicionesParsed.length > 0) {
            const diasDesdeMedida = Math.floor(
                (Date.now() - new Date(medicionesParsed[0].fecha_medicion).getTime()) / (1000 * 60 * 60 * 24)
            );
            if (diasDesdeMedida > 180) {
                alertas.push(`Última toma de medidas hace ${diasDesdeMedida} días (> 6 meses). Se recomienda verificar medidas antes de cortar.`);
            }
        } else if (prendasMedida.length > 0) {
            alertas.push('Cliente con prendas a medida pero sin ficha antropométrica registrada.');
        }

        const kpis = {
            prendas_confeccionadas: prendasMedida.reduce((s, d) => s + Number(d.cantidad || 1), 0),
            prendas_catalogo: prendasCatalogo.reduce((s, d) => s + Number(d.cantidad || 1), 0),
            pedidos_pendientes: pedidosPendientes,
            pedidos_en_confeccion: pedidosEnConfeccion,
            prendas_listas_entrega: prendasListasEntrega,
            ultima_toma_medidas: medicionesParsed[0]?.fecha_medicion || null,
            ultima_visita_taller: bitacora.find((b) => b.canal === 'presencial')?.creado_en || pedidosUnicos[0]?.fecha_pedido || null,
            ultima_compra: pedidosUnicos[0]?.fecha_pedido || null,
            saldo_pendiente: saldoPendienteTotal,
            alertas
        };

        res.json({
            cliente,
            kpis,
            mediciones: medicionesParsed,
            prendas_medida: prendasMedida,
            prendas_catalogo: prendasCatalogo,
            tallas_frecuentes: Object.entries(tallasFrecuentes).map(([etiqueta, veces]) => ({ etiqueta, veces })),
            pagos,
            bitacora
        });
    } catch (error) {
        console.error('Error al obtener expediente del cliente:', error);
        res.status(500).json({ error: 'Error interno al cargar el expediente del cliente.', detalle: error.message });
    }
};

// ==========================================
// 2. Actualizar Perfil CRM y Observaciones Internas
// ==========================================
exports.actualizarPerfilCRMCliente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const taller_id = req.usuario.taller_id;
        const {
            nombre,
            telefono,
            direccion,
            medio_contacto_preferido,
            observaciones_internas
        } = req.body;

        const [existentes] = await db.query(
            `SELECT u.* FROM usuario u
             WHERE u.usuario_id = ? AND u.rol = 'cliente'
               AND (u.taller_id = ? OR EXISTS (SELECT 1 FROM pedido p WHERE p.cliente_id = u.usuario_id AND p.taller_id = ?))`,
            [clienteId, taller_id, taller_id]
        );

        if (existentes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado en este taller.' });
        }

        const row = existentes[0];
        const camposSet = [];
        const valores = [];

        if (nombre && nombre.trim()) {
            const partes = nombre.trim().split(/\s+/);
            const nombres = partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
            const apellidos = partes.slice(Math.ceil(partes.length / 2)).join(' ') || ' ';
            if ('nombres_cifrado' in row) {
                camposSet.push('nombres_cifrado = ?', 'apellidos_cifrado = ?');
                valores.push(encrypt(nombres), encrypt(apellidos));
            }
        }
        if ('telefono' in row) { camposSet.push('telefono = ?'); valores.push(telefono || null); }
        else if ('celular' in row) { camposSet.push('celular = ?'); valores.push(telefono || null); }

        if ('direccion' in row) { camposSet.push('direccion = ?'); valores.push(direccion || null); }
        if ('medio_contacto_preferido' in row) {
            camposSet.push('medio_contacto_preferido = ?');
            valores.push(medio_contacto_preferido || 'whatsapp');
        }
        if ('observaciones_internas' in row) {
            camposSet.push('observaciones_internas = ?');
            valores.push(observaciones_internas || null);
        }

        if (camposSet.length > 0) {
            valores.push(clienteId);
            await db.query(`UPDATE usuario SET ${camposSet.join(', ')} WHERE usuario_id = ?`, valores);
        }

        res.json({ mensaje: 'Perfil CRM y observaciones del cliente actualizados.' });
    } catch (error) {
        console.error('Error al actualizar perfil CRM:', error);
        res.status(500).json({ error: 'Error interno al actualizar datos del cliente.', detalle: error.message });
    }
};

// ==========================================
// 3. Registrar Nueva Toma de Medidas por Regiones
// ==========================================
exports.registrarMedicionCliente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const taller_id = req.usuario.taller_id;
        const registrado_por = req.usuario.id;
        const {
            unidad = 'cm',
            valores_json,
            observaciones = null,
            estado_validacion = 'validada'
        } = req.body;

        if (!valores_json || typeof valores_json !== 'object') {
            return res.status(400).json({ error: 'Debe enviar los valores de medición.' });
        }

        const [result] = await db.query(
            `INSERT INTO cliente_medida_historial
             (taller_id, cliente_id, registrado_por, unidad, valores_json, observaciones, estado_validacion)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [taller_id, clienteId, registrado_por, unidad, JSON.stringify(valores_json), observaciones, estado_validacion]
        );

        res.status(201).json({
            mensaje: 'Toma de medidas registrada en el historial del cliente.',
            medida_id: result.insertId
        });
    } catch (error) {
        console.error('Error al registrar medidas:', error);
        res.status(500).json({ error: 'Error interno al guardar la toma de medidas.', detalle: error.message });
    }
};

// ==========================================
// 4. Registrar Entrada en Bitácora de Comunicaciones
// ==========================================
exports.registrarBitacoraCliente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const taller_id = req.usuario.taller_id;
        const usuario_id = req.usuario.id;
        const {
            canal = 'whatsapp',
            tipo = 'nota',
            resumen,
            fecha_recordatorio = null
        } = req.body;

        if (!resumen || !resumen.trim()) {
            return res.status(400).json({ error: 'El resumen de la comunicación es obligatorio.' });
        }

        const [result] = await db.query(
            `INSERT INTO cliente_bitacora_comunicacion
             (taller_id, cliente_id, usuario_id, canal, tipo, resumen, fecha_recordatorio)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [taller_id, clienteId, usuario_id, canal, tipo, resumen.trim(), fecha_recordatorio || null]
        );

        res.status(201).json({
            mensaje: 'Registro agregado a la bitácora del cliente.',
            bitacora_id: result.insertId
        });
    } catch (error) {
        console.error('Error al guardar bitácora:', error);
        res.status(500).json({ error: 'Error interno al registrar comunicación.', detalle: error.message });
    }
};

// ==========================================
// 5. Listar todos los clientes asociados al taller
// ==========================================
exports.listarClientesTaller = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const [rows] = await db.query(
            `SELECT u.*,
                    (SELECT COUNT(*)
                     FROM pedido p
                     WHERE p.cliente_id = u.usuario_id
                       AND p.taller_id = ?) AS total_pedidos,
                    (SELECT COALESCE(SUM(
                        GREATEST(0, COALESCE(p.costo_total, 0) - COALESCE((
                            SELECT SUM(pg.monto) FROM pago pg
                            WHERE pg.pedido_id = p.pedido_id AND pg.estado = 'aprobado'
                        ), 0))
                     ), 0)
                     FROM pedido p
                     WHERE p.cliente_id = u.usuario_id
                       AND p.taller_id = ?
                       AND p.estado NOT IN ('cancelado', 'rechazado')) AS saldo_pendiente
             FROM usuario u
             WHERE u.rol = 'cliente'
               AND (
                   u.taller_id = ?
                   OR EXISTS (
                       SELECT 1 FROM pedido p2
                       WHERE p2.cliente_id = u.usuario_id
                         AND p2.taller_id = ?
                   )
               )`,
            [taller_id, taller_id, taller_id, taller_id]
        );

        const clientes = rows
            .map((r) => ({
                usuario_id: r.usuario_id,
                nombre: descifrarNombre(r),
                ...extraerContacto(r),
                total_pedidos: r.total_pedidos,
                saldo_pendiente: Number(r.saldo_pendiente || 0)
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));

        res.json(clientes);
    } catch (error) {
        console.error('Error al listar clientes del taller:', error);
        res.status(500).json({ error: 'Error interno al listar clientes.', detalle: error.message });
    }
};