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

const descifrarNombre = (nombresCif, apellidosCif) => {
    const nom = intentarDescifrar(nombresCif);
    const ape = intentarDescifrar(apellidosCif);
    return `${nom} ${ape}`.trim() || 'Sin nombre';
};

const ESTADOS_VALIDOS = [
    'solicitado', 'aceptado', 'en_produccion', 'terminado', 'entregado',
    'solicitud_recibida', 'pendiente_revision', 'cotizacion_aprobacion',
    'preparacion_materiales', 'corte', 'confeccion',
    'control_calidad_pruebas', 'lista_entrega', 'entregada',
    'suspendido', 'cancelado', 'rechazado',
    'pendiente_informacion', 'pendiente_materiales',
    'requiere_ajustes', 'requiere_aprobacion_cliente'
];

const ESTADOS_ESPECIALES_BLOQUEO = [
    'suspendido',
    'pendiente_informacion',
    'pendiente_materiales',
    'requiere_ajustes',
    'requiere_aprobacion_cliente'
];

const ESTADOS_CERRADOS = ['cancelado', 'rechazado'];

const ESTADOS_AVANCE_PRODUCCION = [
    'corte',
    'confeccion',
    'en_produccion',
    'control_calidad_pruebas',
    'lista_entrega',
    'terminado',
    'entregada',
    'entregado'
];

// Normaliza estados legacy a las columnas del tablero Kanban
const mapearColumnaKanban = (estado) => {
    const mapa = {
        solicitado: 'solicitud_recibida',
        aceptado: 'preparacion_materiales',
        en_produccion: 'confeccion',
        terminado: 'lista_entrega',
        entregado: 'entregada'
    };
    return mapa[estado] || estado;
};

// Evalúa reglas de negocio, alertas y candados operativos de un pedido
const evaluarPedidoOperativo = (p) => {
    const motivosAtencion = [];
    const candadosBloqueo = [];
    const columnaKanban = mapearColumnaKanban(p.estado);

    const esCerrado = ESTADOS_CERRADOS.includes(p.estado);
    const esEntregado = ['entregado', 'entregada'].includes(p.estado);

    if (esCerrado || esEntregado) {
        return {
            columna_kanban: columnaKanban,
            requiere_atencion: false,
            bloqueado_avance: false,
            motivos_atencion: [],
            candados_bloqueo: []
        };
    }

    // 1. Estados especiales explícitos
    if (ESTADOS_ESPECIALES_BLOQUEO.includes(p.estado)) {
        const etiquetas = {
            suspendido: 'Pedido suspendido',
            pendiente_informacion: 'Falta información del cliente',
            pendiente_materiales: 'Faltan telas o insumos',
            requiere_ajustes: 'Requiere ajustes de prueba',
            requiere_aprobacion_cliente: 'Esperando aprobación del cliente'
        };
        motivosAtencion.push(etiquetas[p.estado] || p.estado);
    }

    // 2. Prioridad alta
    if (p.prioridad === 'alta') {
        motivosAtencion.push('Prioridad ALTA');
    }

    // 3. Más de 24 horas en solicitud sin ser atendido
    if (['solicitado', 'solicitud_recibida'].includes(p.estado) && p.fecha_solicitud) {
        const horasTranscurridas = (Date.now() - new Date(p.fecha_solicitud).getTime()) / (1000 * 60 * 60);
        if (horasTranscurridas > 24) {
            motivosAtencion.push(`Sin atender hace ${Math.floor(horasTranscurridas)}h (> 24h)`);
        }
    }

    // 4. Candados para pedidos ya aceptados o en flujo activo (distintos a solicitud inicial)
    const yaAceptadoOActivo = !['solicitado', 'solicitud_recibida', 'pendiente_revision', 'cotizacion_aprobacion'].includes(p.estado);

    if (yaAceptadoOActivo) {
        // A. Sin sastre / operario asignado en al menos una prenda
        if (Number(p.items_sin_operario || 0) > 0) {
            const msg = `Falta asignar sastre/operario (${p.items_sin_operario} prenda(s))`;
            motivosAtencion.push(msg);
            candadosBloqueo.push(msg);
        }

        // B. Prenda personalizada a medida sin ficha de medidas registrada
        if (Number(p.tiene_personalizada || 0) > 0 && Number(p.total_mediciones_cliente || 0) === 0) {
            const msg = 'Falta registrar medidas antropométricas del cliente';
            motivosAtencion.push(msg);
            candadosBloqueo.push(msg);
        }

        // C. Sin abono registrado (alerta comercial / revisión)
        if (Number(p.costo_total || 0) > 0 && Number(p.monto_pagado || 0) <= 0) {
            motivosAtencion.push('Sin abono / anticipo registrado');
        }
    }

    return {
        columna_kanban: columnaKanban,
        requiere_atencion: motivosAtencion.length > 0,
        bloqueado_avance: candadosBloqueo.length > 0,
        motivos_atencion: motivosAtencion,
        candados_bloqueo: candadosBloqueo
    };
};

// =====================================================================
// 1. OBTENER TABLERO KANBAN, AGENDA (SOLO ADMIN/SUP) Y TAREAS PRENDA
// =====================================================================
exports.obtenerAgendaYKanban = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { rol, id: usuarioId } = req.usuario;

        // A. Pedidos activos (excluye entregas ya archivadas)
        const [pedidosRows] = await db.query(
            `SELECT p.pedido_id, p.cliente_id, p.estado, p.archivado_entrega, p.prioridad,
                    p.fecha_solicitud, p.costo_total,
                    u.nombres_cifrado, u.apellidos_cifrado,
                    GROUP_CONCAT(CONCAT(pr.nombre, ' (x', dp.cantidad, ')') SEPARATOR ' + ') AS prendas_resumen,
                    SUM(CASE WHEN dp.asignado_a IS NULL THEN 1 ELSE 0 END) AS items_sin_operario,
                    MAX(CASE WHEN pr.es_personalizada = 1 THEN 1 ELSE 0 END) AS tiene_personalizada,
                    (SELECT COUNT(*) FROM cliente_medida_historial cm
                     WHERE cm.cliente_id = p.cliente_id AND cm.taller_id = p.taller_id) AS total_mediciones_cliente,
                    COALESCE((SELECT SUM(pg.monto) FROM pago pg
                              WHERE pg.pedido_id = p.pedido_id AND pg.estado = 'aprobado'), 0) AS monto_pagado
             FROM pedido p
             INNER JOIN usuario u ON p.cliente_id = u.usuario_id
             LEFT JOIN detalle_pedido dp ON p.pedido_id = dp.pedido_id
             LEFT JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             WHERE p.taller_id = ? AND COALESCE(p.archivado_entrega, 0) = 0
             GROUP BY p.pedido_id, p.cliente_id, p.estado, p.archivado_entrega, p.prioridad,
                      p.fecha_solicitud, p.costo_total, u.nombres_cifrado, u.apellidos_cifrado
             ORDER BY p.fecha_solicitud DESC`,
            [taller_id]
        );

        const pedidosProcesados = pedidosRows.map((p) => {
            const evalOp = evaluarPedidoOperativo(p);
            return {
                pedido_id: p.pedido_id,
                cliente_id: p.cliente_id,
                cliente_nombre: descifrarNombre(p.nombres_cifrado, p.apellidos_cifrado),
                estado: p.estado,
                columna_kanban: evalOp.columna_kanban,
                prioridad: p.prioridad,
                fecha_solicitud: p.fecha_solicitud,
                costo_total: Number(p.costo_total || 0),
                monto_pagado: Number(p.monto_pagado || 0),
                prendas_resumen: p.prendas_resumen || 'Sin prendas',
                requiere_atencion: evalOp.requiere_atencion,
                bloqueado_avance: evalOp.bloqueado_avance,
                motivos_atencion: evalOp.motivos_atencion,
                candados_bloqueo: evalOp.candados_bloqueo
            };
        });

        // B. Agenda de citas del taller (SOLO admin_local y supervisor)
        let agendaCitas = [];
        if (['admin_local', 'supervisor'].includes(rol)) {
            const [citasRows] = await db.query(
                `SELECT c.*,
                        u_cli.nombres_cifrado AS cli_nom, u_cli.apellidos_cifrado AS cli_ape,
                        u_resp.nombres_cifrado AS resp_nom, u_resp.apellidos_cifrado AS resp_ape
                 FROM taller_agenda_citas c
                 LEFT JOIN usuario u_cli ON c.cliente_id = u_cli.usuario_id
                 LEFT JOIN usuario u_resp ON c.responsable_id = u_resp.usuario_id
                 WHERE c.taller_id = ?
                 ORDER BY CASE WHEN c.estado = 'pendiente' THEN 0 ELSE 1 END ASC, c.fecha_hora ASC`,
                [taller_id]
            );

            agendaCitas = citasRows.map((c) => ({
                ...c,
                cliente_nombre: c.cliente_id ? descifrarNombre(c.cli_nom, c.cli_ape) : null,
                responsable_nombre: c.responsable_id ? descifrarNombre(c.resp_nom, c.resp_ape) : null
            }));
        }

        // C. Tareas técnicas por prenda (Disponible para TODO el personal del taller)
        let queryTareas = `
            SELECT t.*, pr.nombre AS prenda_nombre, dp.talla,
                   p.cliente_id, u_cli.nombres_cifrado AS cli_nom, u_cli.apellidos_cifrado AS cli_ape,
                   u_resp.nombres_cifrado AS resp_nom, u_resp.apellidos_cifrado AS resp_ape
            FROM prenda_tarea t
            INNER JOIN detalle_pedido dp ON t.detalle_id = dp.detalle_id
            INNER JOIN pedido p ON t.pedido_id = p.pedido_id
            INNER JOIN prenda pr ON dp.prenda_id = pr.prenda_id
            LEFT JOIN usuario u_cli ON p.cliente_id = u_cli.usuario_id
            LEFT JOIN usuario u_resp ON t.responsable_id = u_resp.usuario_id
            WHERE t.taller_id = ?
        `;
        const paramsTareas = [taller_id];

        // Si es operario, prioriza sus tareas asignadas o sin asignar
        if (rol === 'operario') {
            queryTareas += ' AND (t.responsable_id = ? OR t.responsable_id IS NULL)';
            paramsTareas.push(usuarioId);
        }

        queryTareas += `
            ORDER BY CASE WHEN t.estado = 'completada' THEN 1 ELSE 0 END ASC,
                     t.fecha_limite IS NULL ASC,
                     t.fecha_limite ASC,
                     t.tarea_id DESC
        `;

        const [tareasRows] = await db.query(queryTareas, paramsTareas);
        const tareasPrenda = tareasRows.map((t) => ({
            ...t,
            cliente_nombre: descifrarNombre(t.cli_nom, t.cli_ape),
            responsable_nombre: t.responsable_id ? descifrarNombre(t.resp_nom, t.resp_ape) : 'Sin asignar'
        }));

        // D. Catálogos de apoyo para formularios (empleados activos, prendas activas en pedidos, clientes)
        const [empRows] = await db.query(
            `SELECT usuario_id, nombres_cifrado, apellidos_cifrado, rol
             FROM usuario
             WHERE taller_id = ? AND rol IN ('admin_local', 'supervisor', 'operario') AND estado = 'activo'`,
            [taller_id]
        );
        const empleados = empRows.map((e) => ({
            usuario_id: e.usuario_id,
            nombre: descifrarNombre(e.nombres_cifrado, e.apellidos_cifrado),
            rol: e.rol
        }));

        const [prendasActivasRows] = await db.query(
            `SELECT dp.detalle_id, dp.pedido_id, dp.talla, dp.cantidad,
                    pr.nombre AS prenda_nombre,
                    u.nombres_cifrado, u.apellidos_cifrado
             FROM detalle_pedido dp
             INNER JOIN pedido p ON dp.pedido_id = p.pedido_id
             INNER JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             INNER JOIN usuario u ON p.cliente_id = u.usuario_id
             WHERE p.taller_id = ?
               AND p.estado NOT IN ('cancelado', 'rechazado', 'entregado', 'entregada')
             ORDER BY p.pedido_id DESC, dp.detalle_id ASC`,
            [taller_id]
        );
        const prendasEnCurso = prendasActivasRows.map((item) => ({
            detalle_id: item.detalle_id,
            pedido_id: item.pedido_id,
            prenda_nombre: item.prenda_nombre,
            talla: item.talla,
            cantidad: item.cantidad,
            cliente_nombre: descifrarNombre(item.nombres_cifrado, item.apellidos_cifrado)
        }));

        res.json({
            pedidos_kanban: pedidosProcesados,
            agenda_citas: agendaCitas,
            tareas_prenda: tareasPrenda,
            empleados,
            prendas_en_curso: prendasEnCurso
        });
    } catch (error) {
        console.error('Error al cargar agenda y kanban:', error);
        res.status(500).json({ error: 'Error interno al obtener tablero de producción.', detalle: error.message });
    }
};

// =====================================================================
// 2. ACTUALIZAR ESTADO DEL PEDIDO (CON VALIDACIÓN DE CANDADOS)
// =====================================================================
exports.actualizarEstadoPedido = async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const { estado, nota_bitacora, forzar = false } = req.body;
        const taller_id = req.usuario.taller_id;
        const usuario_id = req.usuario.id;

        if (!ESTADOS_VALIDOS.includes(estado)) {
            return res.status(400).json({ error: 'Estado de pedido no válido.' });
        }

        const [rows] = await db.query(
            `SELECT p.pedido_id, p.cliente_id, p.estado, p.prioridad, p.fecha_solicitud, p.costo_total,
                    SUM(CASE WHEN dp.asignado_a IS NULL THEN 1 ELSE 0 END) AS items_sin_operario,
                    MAX(CASE WHEN pr.es_personalizada = 1 THEN 1 ELSE 0 END) AS tiene_personalizada,
                    (SELECT COUNT(*) FROM cliente_medida_historial cm
                     WHERE cm.cliente_id = p.cliente_id AND cm.taller_id = p.taller_id) AS total_mediciones_cliente,
                    COALESCE((SELECT SUM(pg.monto) FROM pago pg
                              WHERE pg.pedido_id = p.pedido_id AND pg.estado = 'aprobado'), 0) AS monto_pagado
             FROM pedido p
             LEFT JOIN detalle_pedido dp ON p.pedido_id = dp.pedido_id
             LEFT JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             WHERE p.pedido_id = ? AND p.taller_id = ?
             GROUP BY p.pedido_id, p.cliente_id, p.estado, p.prioridad, p.fecha_solicitud, p.costo_total`,
            [pedidoId, taller_id]
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado.' });
        const pedido = rows[0];

        // Verificar candados si intenta avanzar a corte/confección/producción
        const columnaDestino = mapearColumnaKanban(estado);
        if (!forzar && ESTADOS_AVANCE_PRODUCCION.includes(columnaDestino)) {
            const evalOp = evaluarPedidoOperativo({ ...pedido, estado: 'aceptado' });
            if (evalOp.bloqueado_avance) {
                return res.status(409).json({
                    error: 'Pedido bloqueado para avanzar a producción.',
                    candados: evalOp.candados_bloqueo
                });
            }
        }

        await db.query(
            `UPDATE pedido
             SET estado = ?,
                 gestionado_por = COALESCE(gestionado_por, ?),
                 fecha_respuesta = CASE
                     WHEN fecha_respuesta IS NULL AND ? NOT IN ('solicitado', 'solicitud_recibida') THEN NOW()
                     ELSE fecha_respuesta
                 END,
                 fecha_entrega_real = CASE WHEN ? IN ('entregado', 'entregada') THEN NOW() ELSE fecha_entrega_real END
             WHERE pedido_id = ? AND taller_id = ?`,
            [estado, usuario_id, estado, estado, pedidoId, taller_id]
        );

        if (nota_bitacora && nota_bitacora.trim()) {
            try {
                await db.query(
                    `INSERT INTO cliente_bitacora_comunicacion (taller_id, cliente_id, usuario_id, canal, tipo, resumen)
                     VALUES (?, ?, ?, 'sistema', 'nota', ?)`,
                    [taller_id, pedido.cliente_id, usuario_id, `Pedido #${pedidoId} cambió a "${estado}": ${nota_bitacora.trim()}`]
                );
            } catch { /* opcional */ }
        }

        res.json({ mensaje: `Estado del pedido #${pedidoId} actualizado a ${estado}.` });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ error: 'Error interno al actualizar estado del pedido.', detalle: error.message });
    }
};

// =====================================================================
// 3. ARCHIVAR PEDIDOS ENTREGADOS Y CONSULTAR HISTÓRICO (ENTREGADOS + CANCELADOS)
// =====================================================================
exports.archivarPedidosEntregados = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { pedido_id = null } = req.body;

        let result;
        if (pedido_id) {
            [result] = await db.query(
                `UPDATE pedido
                 SET archivado_entrega = 1
                 WHERE pedido_id = ? AND taller_id = ? AND estado IN ('entregado', 'entregada')`,
                [pedido_id, taller_id]
            );
        } else {
            [result] = await db.query(
                `UPDATE pedido
                 SET archivado_entrega = 1
                 WHERE taller_id = ? AND estado IN ('entregado', 'entregada') AND COALESCE(archivado_entrega, 0) = 0`,
                [taller_id]
            );
        }

        res.json({
            mensaje: `Se movieron ${result.affectedRows} pedido(s) al Histórico de Entregas.`,
            archivados: result.affectedRows
        });
    } catch (error) {
        console.error('Error al archivar entregados:', error);
        res.status(500).json({ error: 'Error interno al archivar pedidos entregados.' });
    }
};

exports.obtenerHistoricoPedidos = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const [rows] = await db.query(
            `SELECT p.pedido_id, p.cliente_id, p.estado, p.archivado_entrega, p.prioridad,
                    p.fecha_solicitud, p.fecha_entrega_real, p.motivo_rechazo, p.costo_total,
                    u.nombres_cifrado, u.apellidos_cifrado,
                    GROUP_CONCAT(CONCAT(pr.nombre, ' (x', dp.cantidad, ')') SEPARATOR ' + ') AS prendas_resumen
             FROM pedido p
             INNER JOIN usuario u ON p.cliente_id = u.usuario_id
             LEFT JOIN detalle_pedido dp ON p.pedido_id = dp.pedido_id
             LEFT JOIN prenda pr ON dp.prenda_id = pr.prenda_id
             WHERE p.taller_id = ?
               AND (p.estado IN ('cancelado', 'rechazado') OR COALESCE(p.archivado_entrega, 0) = 1)
             GROUP BY p.pedido_id, p.cliente_id, p.estado, p.archivado_entrega, p.prioridad,
                      p.fecha_solicitud, p.fecha_entrega_real, p.motivo_rechazo, p.costo_total,
                      u.nombres_cifrado, u.apellidos_cifrado
             ORDER BY p.fecha_solicitud DESC`,
            [taller_id]
        );

        res.json(rows.map((r) => ({
            ...r,
            cliente_nombre: descifrarNombre(r.nombres_cifrado, r.apellidos_cifrado)
        })));
    } catch (error) {
        console.error('Error al consultar histórico:', error);
        res.status(500).json({ error: 'Error interno al consultar histórico de pedidos.' });
    }
};

// =====================================================================
// 4. AGENDA DE CITAS DEL TALLER (CRUD - SOLO ADMIN / SUPERVISOR)
// =====================================================================
exports.crearCitaAgenda = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const creado_por = req.usuario.id;
        const {
            titulo,
            categoria = 'cita_cliente',
            categoria_otro_detalle = null,
            contacto_externo = null,
            cliente_id = null,
            responsable_id = null,
            pedido_id = null,
            fecha_hora,
            notas = null
        } = req.body;

        if (!titulo || !titulo.trim() || !fecha_hora) {
            return res.status(400).json({ error: 'El título y la fecha/hora son obligatorios.' });
        }

        if (categoria === 'otro' && (!categoria_otro_detalle || !categoria_otro_detalle.trim())) {
            return res.status(400).json({ error: 'Cuando seleccionas "Otro", debes especificar el tipo de compromiso.' });
        }

        const [result] = await db.query(
            `INSERT INTO taller_agenda_citas
             (taller_id, creado_por, responsable_id, pedido_id, cliente_id, titulo,
              categoria, categoria_otro_detalle, contacto_externo, fecha_hora, notas)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                taller_id,
                creado_por,
                responsable_id || null,
                pedido_id || null,
                cliente_id || null,
                titulo.trim(),
                categoria,
                categoria === 'otro' ? categoria_otro_detalle.trim() : null,
                contacto_externo ? contacto_externo.trim() : null,
                fecha_hora,
                notas ? notas.trim() : null
            ]
        );

        res.status(201).json({ mensaje: 'Cita registrada en la agenda del taller.', cita_id: result.insertId });
    } catch (error) {
        console.error('Error al crear cita en agenda:', error);
        res.status(500).json({ error: 'Error interno al agendar cita.', detalle: error.message });
    }
};

exports.actualizarEstadoCitaAgenda = async (req, res) => {
    try {
        const { citaId } = req.params;
        const { estado } = req.body;
        const taller_id = req.usuario.taller_id;

        if (!['pendiente', 'completada', 'cancelada'].includes(estado)) {
            return res.status(400).json({ error: 'Estado de cita inválido.' });
        }

        await db.query(
            'UPDATE taller_agenda_citas SET estado = ? WHERE cita_id = ? AND taller_id = ?',
            [estado, citaId, taller_id]
        );

        res.json({ mensaje: 'Estado de cita actualizado.' });
    } catch (error) {
        console.error('Error al actualizar cita:', error);
        res.status(500).json({ error: 'Error interno al actualizar cita.' });
    }
};

// =====================================================================
// 5. TAREAS OPERATIVAS POR PRENDA (BORDAR, TEJER, PEDRERÍA, FORRAR, ETC.)
// =====================================================================
exports.crearTareaPrenda = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const {
            detalle_id,
            nombre_tarea,
            categoria_tecnica = 'confeccion',
            responsable_id = null,
            fecha_limite = null,
            observaciones = null
        } = req.body;

        if (!detalle_id || !nombre_tarea || !nombre_tarea.trim()) {
            return res.status(400).json({ error: 'Debes seleccionar la prenda y el nombre de la tarea.' });
        }

        const [detRows] = await db.query(
            'SELECT detalle_id, pedido_id FROM detalle_pedido WHERE detalle_id = ? AND taller_id = ?',
            [detalle_id, taller_id]
        );
        if (detRows.length === 0) {
            return res.status(404).json({ error: 'La prenda seleccionada no pertenece a este taller.' });
        }

        const [result] = await db.query(
            `INSERT INTO prenda_tarea
             (taller_id, pedido_id, detalle_id, nombre_tarea, categoria_tecnica, responsable_id, fecha_limite, observaciones)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                taller_id,
                detRows[0].pedido_id,
                detalle_id,
                nombre_tarea.trim(),
                categoria_tecnica,
                responsable_id || null,
                fecha_limite || null,
                observaciones ? observaciones.trim() : null
            ]
        );

        res.status(201).json({ mensaje: 'Tarea asignada a la prenda.', tarea_id: result.insertId });
    } catch (error) {
        console.error('Error al crear tarea de prenda:', error);
        res.status(500).json({ error: 'Error interno al crear tarea de prenda.', detalle: error.message });
    }
};

exports.actualizarTareaPrenda = async (req, res) => {
    try {
        const { tareaId } = req.params;
        const { estado, responsable_id, fecha_limite, observaciones } = req.body;
        const taller_id = req.usuario.taller_id;

        await db.query(
            `UPDATE prenda_tarea
             SET estado = COALESCE(?, estado),
                 responsable_id = COALESCE(?, responsable_id),
                 fecha_limite = COALESCE(?, fecha_limite),
                 observaciones = COALESCE(?, observaciones),
                 completada_en = CASE WHEN ? = 'completada' THEN NOW() ELSE completada_en END
             WHERE tarea_id = ? AND taller_id = ?`,
            [
                estado || null,
                responsable_id !== undefined ? (responsable_id || null) : null,
                fecha_limite !== undefined ? (fecha_limite || null) : null,
                observaciones !== undefined ? (observaciones || null) : null,
                estado || '',
                tareaId,
                taller_id
            ]
        );

        res.json({ mensaje: 'Tarea actualizada.' });
    } catch (error) {
        console.error('Error al actualizar tarea:', error);
        res.status(500).json({ error: 'Error interno al actualizar tarea.' });
    }
};