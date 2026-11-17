const db = require('../config/db');
const { decrypt } = require('../utils/crypto');

const PRIORIDADES_VALIDAS = ['baja', 'normal', 'alta'];
const ESTADOS_PEDIDO_TALLER = [
    'aceptado', 'rechazado', 'en_produccion', 'terminado', 'entregado', 'cancelado',
    'solicitud_recibida', 'pendiente_revision', 'cotizacion_aprobacion',
    'preparacion_materiales', 'corte', 'confeccion',
    'control_calidad_pruebas', 'lista_entrega', 'entregada',
    'suspendido', 'pendiente_informacion', 'pendiente_materiales',
    'requiere_ajustes', 'requiere_aprobacion_cliente'
];
const ESTADOS_CONFECCION = ['pendiente', 'asignado', 'en_proceso', 'terminado'];

// =====================================================================
// 1. CREAR PEDIDO (Cliente o Admin/Supervisor en mostrador)
// =====================================================================
const MULTIPLICADOR_COMPLEJIDAD = { baja: 1.20, media: 1.35, alta: 1.50 };
const MULTIPLICADOR_CALIDAD = { basica: 1.00, estandar: 1.15, premium: 1.30 };

exports.crearPedido = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { rol, id: usuarioId, taller_id: tallerUsuario } = req.usuario;
        const { taller_id: tallerBody, cliente_id: clienteBody, prioridad = 'normal', items } = req.body;

        const taller_id = rol === 'cliente' ? tallerBody : tallerUsuario;
        const cliente_id = rol === 'cliente' ? usuarioId : clienteBody;

        if (!taller_id || !cliente_id) {
            return res.status(400).json({ error: 'taller_id y cliente_id son obligatorios.' });
        }

        if (!PRIORIDADES_VALIDAS.includes(prioridad)) {
            return res.status(400).json({ error: `Prioridad inválida: ${PRIORIDADES_VALIDAS.join(', ')}` });
        }

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El pedido debe incluir al menos un ítem en items.' });
        }

        await connection.beginTransaction();

        const [tallerRows] = await connection.query(
            "SELECT taller_id FROM taller WHERE taller_id = ? AND estado = 'activo'",
            [taller_id]
        );
        if (tallerRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'El taller indicado no existe o está inactivo.' });
        }

        const [clienteRows] = await connection.query(
            "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND rol = 'cliente' AND estado = 'activo'",
            [cliente_id]
        );
        if (clienteRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'El cliente indicado no existe o está inactivo.' });
        }

        // Determinar si todos los ítems son compra directa de inventario terminado
        const todoEnInventario = items.every((it) => Boolean(it.variante_id));
        const naceAceptado = rol !== 'cliente' || todoEnInventario;
        const estadoInicial = naceAceptado ? 'aceptado' : 'solicitado';
        const gestionadoPor = rol !== 'cliente' ? usuarioId : null;
        const fechaRespuesta = naceAceptado ? new Date() : null;

        const [pedidoResult] = await connection.query(
            `INSERT INTO pedido (cliente_id, taller_id, estado, prioridad, gestionado_por, fecha_respuesta, costo_total)
             VALUES (?, ?, ?, ?, ?, ?, 0.00)`,
            [cliente_id, taller_id, estadoInicial, prioridad, gestionadoPor, fechaRespuesta]
        );

        const pedido_id = pedidoResult.insertId;
        let costoTotalPedido = 0;
        const resumenItems = [];

        for (const item of items) {
            const { prenda_id, variante_id = null, talla = null, cantidad = 1, descripcion = null } = item;

            if (!prenda_id || Number(cantidad) <= 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Cada ítem requiere prenda_id y cantidad > 0.' });
            }

            const [prendaRows] = await connection.query(
                `SELECT prenda_id, nombre, tipo_prenda, color, calidad, complejidad,
                        precio, tarifa_mano_obra, disponible, es_personalizada, solicitado_por
                 FROM prenda
                 WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL`,
                [prenda_id, taller_id]
            );

            if (prendaRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: `La prenda ID ${prenda_id} no existe en este taller.` });
            }

            const prenda = prendaRows[0];

            if (!prenda.es_personalizada && !prenda.disponible) {
                await connection.rollback();
                return res.status(400).json({ error: `La prenda '${prenda.nombre}' no está disponible.` });
            }

            if (prenda.es_personalizada && prenda.solicitado_por !== Number(cliente_id)) {
                await connection.rollback();
                return res.status(403).json({ error: `La prenda personalizada ID ${prenda_id} pertenece a otro cliente.` });
            }

            const cantNum = Number(cantidad);
            let tallaFinal = talla;
            let descripcionFinal = descripcion;
            let estadoConfeccionInicial = 'pendiente';
            let desdeInventario = false;

            // Si viene de inventario terminado (variante_id), validar y descontar stock con bloqueo de fila
            if (variante_id) {
                const [varRows] = await connection.query(
                    `SELECT variante_id, talla, color, tela, stock_disponible
                     FROM prenda_inventario
                     WHERE variante_id = ? AND prenda_id = ?
                     FOR UPDATE`,
                    [variante_id, prenda_id]
                );

                if (varRows.length === 0) {
                    await connection.rollback();
                    return res.status(404).json({ error: 'La variante de inventario seleccionada no existe.' });
                }

                const variante = varRows[0];
                if (variante.stock_disponible < cantNum) {
                    await connection.rollback();
                    return res.status(400).json({
                        error: `Stock insuficiente para '${prenda.nombre}' (${variante.color} - ${variante.tela}, Talla ${variante.talla}). Disponibles: ${variante.stock_disponible}.`
                    });
                }

                await connection.query(
                    'UPDATE prenda_inventario SET stock_disponible = stock_disponible - ? WHERE variante_id = ?',
                    [cantNum, variante.variante_id]
                );

                tallaFinal = variante.talla;
                const etiquetaStock = `[Compra directa inventario: ${variante.color} / ${variante.tela}]`;
                descripcionFinal = descripcion ? `${etiquetaStock} ${descripcion}` : etiquetaStock;
                estadoConfeccionInicial = 'terminado';
                desdeInventario = true;
            }

            // Consultar ficha técnica para costos internos
            const [materialesPrenda] = await connection.query(
                `SELECT m.nombre, m.categoria, m.unidad, m.precio_unitario,
                        COALESCE(pm.cantidad_estimada, 0) AS cantidad_estimada,
                        ROUND(COALESCE(pm.cantidad_estimada, 0) * m.precio_unitario, 2) AS costo_insumo
                 FROM prenda_material pm
                 JOIN material m ON m.material_id = pm.material_id AND m.taller_id = pm.taller_id
                 WHERE pm.prenda_id = ? AND pm.taller_id = ? AND m.eliminado_en IS NULL`,
                [prenda_id, taller_id]
            );

            const costoMatUnit = materialesPrenda.reduce((acc, m) => acc + Number(m.costo_insumo), 0);
            const manoObraUnit = Number(prenda.tarifa_mano_obra || 0);
            const costoBaseUnit = costoMatUnit + manoObraUnit;

            let precioUnitario;
            let origenPrecio;

            if (prenda.precio !== null) {
                precioUnitario = Number(prenda.precio);
                origenPrecio = desdeInventario ? 'Compra directa de inventario terminado' : 'Precio fijo de catálogo';
            } else {
                const factorComp = MULTIPLICADOR_COMPLEJIDAD[prenda.complejidad] || 1.35;
                const factorCal = MULTIPLICADOR_CALIDAD[prenda.calidad] || 1.15;
                precioUnitario = Number((costoBaseUnit * factorComp * factorCal).toFixed(2));
                origenPrecio = `Calculado por materiales + mano de obra x complejidad (${prenda.complejidad}) x calidad (${prenda.calidad})`;
            }

            const costo_materiales = Number((costoMatUnit * cantNum).toFixed(2));
            const costo_mano_obra = Number((manoObraUnit * cantNum).toFixed(2));
            const subtotal = Number((precioUnitario * cantNum).toFixed(2));
            costoTotalPedido += subtotal;

            const [detResult] = await connection.query(
                `INSERT INTO detalle_pedido (
                    pedido_id, taller_id, prenda_id, talla, cantidad, descripcion,
                    costo_materiales, costo_mano_obra, subtotal, estado_confeccion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    pedido_id, taller_id, prenda_id, tallaFinal, cantNum, descripcionFinal,
                    costo_materiales, costo_mano_obra, subtotal, estadoConfeccionInicial
                ]
            );

            resumenItems.push({
                detalle_id: detResult.insertId,
                prenda_id: prenda.prenda_id,
                nombre: prenda.nombre,
                tipo_prenda: prenda.tipo_prenda,
                calidad: prenda.calidad,
                complejidad: prenda.complejidad,
                talla: tallaFinal,
                cantidad: cantNum,
                desde_inventario: desdeInventario,
                materiales_ficha_tecnica: materialesPrenda,
                precio_unitario_aplicado: precioUnitario,
                origen_precio: origenPrecio,
                subtotal
            });
        }

        costoTotalPedido = Number(costoTotalPedido.toFixed(2));
        await connection.query(
            'UPDATE pedido SET costo_total = ? WHERE pedido_id = ? AND taller_id = ?',
            [costoTotalPedido, pedido_id, taller_id]
        );

        await connection.commit();

        res.status(201).json({
            mensaje: todoEnInventario
                ? 'Compra directa registrada. Stock reservado y pedido listo para pago.'
                : 'Pedido registrado exitosamente.',
            pedido_id,
            taller_id,
            estado: estadoInicial,
            costo_total: costoTotalPedido,
            desglose_items: resumenItems
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al crear pedido:', error);
        res.status(500).json({ error: 'Error interno al registrar el pedido.' });
    } finally {
        connection.release();
    }
};
// =====================================================================
// 2. CONSULTAR PEDIDOS (Según rol: Cliente ve los suyos, Taller los suyos)
// =====================================================================
exports.obtenerPedidos = async (req, res) => {
    try {
        const { rol, id: usuarioId, taller_id } = req.usuario;
        const { estado, prioridad } = req.query;

        let query = `
            SELECT p.pedido_id, p.cliente_id, p.taller_id, t.nombre AS taller_nombre,
                   p.estado, p.prioridad, p.fecha_solicitud, p.fecha_respuesta,
                   p.motivo_rechazo, p.costo_total,
                   u.nombres_cifrado AS cli_nombres, u.apellidos_cifrado AS cli_apellidos
            FROM pedido p
            JOIN taller t ON t.taller_id = p.taller_id
            JOIN usuario u ON u.usuario_id = p.cliente_id
            WHERE 1=1
        `;
        const params = [];

        if (rol === 'cliente') {
            query += ' AND p.cliente_id = ?';
            params.push(usuarioId);
        } else if (rol === 'operario') {
            // El operario ve los pedidos donde tiene al menos una prenda asignada
            query += ' AND p.taller_id = ? AND EXISTS (SELECT 1 FROM detalle_pedido dp WHERE dp.pedido_id = p.pedido_id AND dp.asignado_a = ?)';
            params.push(taller_id, usuarioId);
        } else {
            // admin_local y supervisor ven todos los pedidos de su taller
            query += ' AND p.taller_id = ?';
            params.push(taller_id);
        }

        if (estado) {
            query += ' AND p.estado = ?';
            params.push(estado);
        }
        if (prioridad) {
            query += ' AND p.prioridad = ?';
            params.push(prioridad);
        }

        query += ' ORDER BY p.fecha_solicitud DESC';

        const [rows] = await db.query(query, params);

        const pedidos = rows.map(row => ({
            pedido_id: row.pedido_id,
            taller_id: row.taller_id,
            taller_nombre: row.taller_nombre,
            cliente_id: row.cliente_id,
            cliente_nombre: `${decrypt(row.cli_nombres)} ${decrypt(row.cli_apellidos)}`,
            estado: row.estado,
            prioridad: row.prioridad,
            fecha_solicitud: row.fecha_solicitud,
            fecha_respuesta: row.fecha_respuesta,
            motivo_rechazo: row.motivo_rechazo,
            costo_total: row.costo_total
        }));

        res.json(pedidos);

    } catch (error) {
        console.error('Error al obtener pedidos:', error);
        res.status(500).json({ error: 'Error interno al consultar los pedidos.' });
    }
};

// =====================================================================
// 3. OBTENER DETALLE COMPLETO DE UN PEDIDO (Cabecera + Ítems)
// =====================================================================
exports.obtenerDetallePedido = async (req, res) => {
    try {
        const { id } = req.params;
        const { rol, id: usuarioId, taller_id } = req.usuario;

        const [pedidoRows] = await db.query(
            `SELECT p.*, t.nombre AS taller_nombre,
                    u.nombres_cifrado AS cli_nombres, u.apellidos_cifrado AS cli_apellidos, u.cedula_cifrada AS cli_cedula
             FROM pedido p
             JOIN taller t ON t.taller_id = p.taller_id
             JOIN usuario u ON u.usuario_id = p.cliente_id
             WHERE p.pedido_id = ?`,
            [id]
        );

        if (pedidoRows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const pedido = pedidoRows[0];

        // Control de acceso multi-tenant y por propietario
        if (rol === 'cliente' && pedido.cliente_id !== usuarioId) {
            return res.status(403).json({ error: 'No tienes permiso para ver este pedido.' });
        }
        if (rol !== 'cliente' && rol !== 'super_admin' && pedido.taller_id !== taller_id) {
            return res.status(403).json({ error: 'Este pedido pertenece a otro taller.' });
        }

        // Consulta de ítems con su imagen (referencia personalizada o catálogo)
        const [itemsRows] = await db.query(
            `SELECT dp.detalle_id, dp.prenda_id, pr.nombre AS prenda_nombre, pr.tipo_prenda,
                    pr.es_personalizada, pr.calidad, pr.complejidad,
                    dp.talla, dp.cantidad, dp.descripcion,
                    dp.costo_materiales, dp.costo_mano_obra, dp.subtotal,
                    dp.asignado_a, op.nombres_cifrado AS op_nombres, op.apellidos_cifrado AS op_apellidos,
                    dp.estado_confeccion, dp.iniciado_en, dp.terminado_en, dp.horas_trabajo,
                    COALESCE(
                        (SELECT i.ruta FROM detalle_pedido_imagen dpi JOIN imagen i ON i.imagen_id = dpi.imagen_id WHERE dpi.detalle_id = dp.detalle_id LIMIT 1),
                        (SELECT i2.ruta FROM prenda_imagen pi JOIN imagen i2 ON i2.imagen_id = pi.imagen_id WHERE pi.prenda_id = dp.prenda_id LIMIT 1)
                    ) AS imagen_ruta
             FROM detalle_pedido dp
             JOIN prenda pr ON pr.prenda_id = dp.prenda_id
             LEFT JOIN usuario op ON op.usuario_id = dp.asignado_a
             WHERE dp.pedido_id = ?`,
            [id]
        );

        const items = itemsRows.map(it => ({
            detalle_id: it.detalle_id,
            prenda_id: it.prenda_id,
            prenda_nombre: it.prenda_nombre,
            tipo_prenda: it.tipo_prenda,
            talla: it.talla,
            cantidad: it.cantidad,
            descripcion: it.descripcion,
            // Ocultamos costos internos de fabricación al cliente; solo el taller los ve
            ...(rol !== 'cliente' && {
                costo_materiales: it.costo_materiales,
                costo_mano_obra: it.costo_mano_obra
            }),
            subtotal: it.subtotal,
            asignado_a: it.asignado_a,
            operario_nombre: it.op_nombres ? `${decrypt(it.op_nombres)} ${decrypt(it.op_apellidos)}` : null,
            estado_confeccion: it.estado_confeccion,
            iniciado_en: it.iniciado_en,
            terminado_en: it.terminado_en,
            horas_trabajo: it.horas_trabajo
        }));

        res.json({
            pedido: {
                pedido_id: pedido.pedido_id,
                taller_id: pedido.taller_id,
                taller_nombre: pedido.taller_nombre,
                cliente_id: pedido.cliente_id,
                cliente_nombre: `${decrypt(pedido.cli_nombres)} ${decrypt(pedido.cli_apellidos)}`,
                cliente_cedula: decrypt(pedido.cli_cedula),
                estado: pedido.estado,
                prioridad: pedido.prioridad,
                fecha_solicitud: pedido.fecha_solicitud,
                fecha_respuesta: pedido.fecha_respuesta,
                motivo_rechazo: pedido.motivo_rechazo,
                costo_total: pedido.costo_total
            },
            items
        });

    } catch (error) {
        console.error('Error al obtener detalle del pedido:', error);
        res.status(500).json({ error: 'Error interno al consultar el detalle del pedido.' });
    }
};

// =====================================================================
// 4. GESTIONAR ESTADO DEL PEDIDO (Admin/Supervisor del taller)
// =====================================================================
exports.gestionarEstadoPedido = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado, motivo_rechazo = null } = req.body;
        const taller_id = req.usuario.taller_id;
        const gestionado_por = req.usuario.id;

        if (!ESTADOS_PEDIDO_TALLER.includes(estado)) {
            return res.status(400).json({
                error: `Estado inválido. Valores permitidos para el taller: ${ESTADOS_PEDIDO_TALLER.join(', ')}`
            });
        }

        if (estado === 'rechazado' && (!motivo_rechazo || !motivo_rechazo.trim())) {
            return res.status(400).json({
                error: 'Debes indicar el motivo_rechazo cuando el estado es rechazado.'
            });
        }

        const [rows] = await db.query(
            'SELECT estado, fecha_respuesta FROM pedido WHERE pedido_id = ? AND taller_id = ?',
            [id, taller_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado en este taller.' });
        }

        const actual = rows[0];
        if (['cancelado', 'rechazado', 'entregado'].includes(actual.estado)) {
            return res.status(400).json({
                error: `No se puede modificar un pedido que ya está en estado '${actual.estado}'.`
            });
        }

        // Si aún no tenía fecha_respuesta (estaba en 'solicitado'), la registramos ahora para medir tiempo de atención
        const definirFechaRespuesta = actual.fecha_respuesta === null && ['aceptado', 'rechazado'].includes(estado);

        const query = `
            UPDATE pedido
            SET estado = ?,
                gestionado_por = ?,
                motivo_rechazo = ?,
                fecha_respuesta = ${definirFechaRespuesta ? 'NOW()' : 'fecha_respuesta'}
            WHERE pedido_id = ? AND taller_id = ?
        `;

        await db.query(query, [
            estado,
            gestionado_por,
            estado === 'rechazado' ? motivo_rechazo.trim() : null,
            id,
            taller_id
        ]);

        res.json({
            mensaje: `Estado del pedido actualizado a '${estado}'.`,
            pedido_id: Number(id),
            estado
        });

    } catch (error) {
        console.error('Error al gestionar estado del pedido:', error);
        res.status(500).json({ error: 'Error interno al actualizar el estado del pedido.' });
    }
};

// =====================================================================
// 5. CANCELAR PEDIDO (El cliente cancela únicamente antes de ser aprobado)
// =====================================================================
exports.cancelarPedidoCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const cliente_id = req.usuario.id;

        const [rows] = await db.query(
            'SELECT estado FROM pedido WHERE pedido_id = ? AND cliente_id = ?',
            [id, cliente_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        if (rows[0].estado !== 'solicitado') {
            return res.status(400).json({
                error: 'Este pedido ya fue aprobado o entró en gestión. Para cancelarlo debes comunicarte directamente con el taller.'
            });
        }

        await db.query(
            "UPDATE pedido SET estado = 'cancelado' WHERE pedido_id = ? AND cliente_id = ?",
            [id, cliente_id]
        );

        res.json({
            mensaje: 'Tu solicitud de pedido ha sido cancelada correctamente.',
            pedido_id: Number(id)
        });

    } catch (error) {
        console.error('Error al cancelar pedido:', error);
        res.status(500).json({ error: 'Error interno al cancelar el pedido.' });
    }
};
// =====================================================================
// 6. ASIGNAR OPERARIO A UN ÍTEM DEL PEDIDO (Admin/Supervisor)
// =====================================================================
exports.asignarOperarioDetalle = async (req, res) => {
    try {
        const { detalle_id } = req.params;
        const { asignado_a } = req.body;
        const taller_id = req.usuario.taller_id;
        const gestionado_por = req.usuario.id;

        if (!asignado_a) {
            return res.status(400).json({ error: 'Debes indicar el ID del operario (asignado_a).' });
        }

        // 1. Verificar que el operario pertenezca al mismo taller y esté activo
        const [opRows] = await db.query(
            "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND taller_id = ? AND rol IN ('operario','supervisor','admin_local') AND estado = 'activo'",
            [asignado_a, taller_id]
        );
        if (opRows.length === 0) {
            return res.status(404).json({ error: 'El operario indicado no pertenece a este taller o está inactivo.' });
        }

        // 2. Verificar que el detalle exista en este taller y su pedido no esté rechazado/cancelado
        const [detRows] = await db.query(
            `SELECT dp.detalle_id, dp.pedido_id, p.estado AS pedido_estado
             FROM detalle_pedido dp
             JOIN pedido p ON p.pedido_id = dp.pedido_id
             WHERE dp.detalle_id = ? AND dp.taller_id = ?`,
            [detalle_id, taller_id]
        );

        if (detRows.length === 0) {
            return res.status(404).json({ error: 'Ítem de pedido no encontrado en este taller.' });
        }

        if (['rechazado', 'cancelado', 'entregado'].includes(detRows[0].pedido_estado)) {
            return res.status(400).json({
                error: `No se puede asignar operario porque el pedido está '${detRows[0].pedido_estado}'.`
            });
        }

        // 3. Asignar operario (cumpliendo chk_detalle_asignacion)
        await db.query(
            `UPDATE detalle_pedido
             SET asignado_a = ?, estado_confeccion = 'asignado'
             WHERE detalle_id = ? AND taller_id = ?`,
            [asignado_a, detalle_id, taller_id]
        );

        // Si el pedido estaba en 'solicitado', pasarlo automáticamente a 'aceptado'
        if (detRows[0].pedido_estado === 'solicitado') {
            await db.query(
                `UPDATE pedido
                 SET estado = 'aceptado', gestionado_por = ?, fecha_respuesta = COALESCE(fecha_respuesta, NOW())
                 WHERE pedido_id = ? AND taller_id = ?`,
                [gestionado_por, detRows[0].pedido_id, taller_id]
            );
        }

        res.json({
            mensaje: 'Operario asignado exitosamente al ítem del pedido.',
            detalle_id: Number(detalle_id),
            asignado_a: Number(asignado_a),
            estado_confeccion: 'asignado'
        });

    } catch (error) {
        console.error('Error al asignar operario:', error);
        res.status(500).json({ error: 'Error interno al asignar el operario.' });
    }
};

// =====================================================================
// 7. ACTUALIZAR AVANCE DE CONFECCIÓN (Operario / Supervisor / Admin)
// =====================================================================
exports.actualizarEstadoConfeccion = async (req, res) => {
    try {
        const { detalle_id } = req.params;
        const { estado_confeccion, horas_trabajo = null } = req.body;
        const { rol, id: usuarioId, taller_id } = req.usuario;

        if (!ESTADOS_CONFECCION.includes(estado_confeccion) || estado_confeccion === 'pendiente') {
            return res.status(400).json({
                error: "Estado de confección inválido. Usa 'asignado', 'en_proceso' o 'terminado'."
            });
        }

        const [detRows] = await db.query(
            'SELECT detalle_id, pedido_id, asignado_a, iniciado_en FROM detalle_pedido WHERE detalle_id = ? AND taller_id = ?',
            [detalle_id, taller_id]
        );

        if (detRows.length === 0) {
            return res.status(404).json({ error: 'Ítem de pedido no encontrado en este taller.' });
        }

        const detalle = detRows[0];

        if (!detalle.asignado_a) {
            return res.status(400).json({ error: 'Este ítem aún no tiene un operario asignado.' });
        }

        // Un operario solo puede actualizar los ítems asignados a él mismo
        if (rol === 'operario' && detalle.asignado_a !== usuarioId) {
            return res.status(403).json({ error: 'Solo puedes actualizar el avance de las prendas asignadas a ti.' });
        }

        if (estado_confeccion === 'en_proceso') {
            await db.query(
                `UPDATE detalle_pedido
                 SET estado_confeccion = 'en_proceso',
                     iniciado_en = COALESCE(iniciado_en, NOW())
                 WHERE detalle_id = ? AND taller_id = ?`,
                [detalle_id, taller_id]
            );

            // Subir automáticamente el pedido padre a 'en_produccion' si estaba en 'aceptado'
            await db.query(
                `UPDATE pedido
                 SET estado = 'en_produccion'
                 WHERE pedido_id = ? AND taller_id = ? AND estado = 'aceptado'`,
                [detalle.pedido_id, taller_id]
            );
        } else if (estado_confeccion === 'terminado') {
            await db.query(
                `UPDATE detalle_pedido
                 SET estado_confeccion = 'terminado',
                     iniciado_en = COALESCE(iniciado_en, NOW()),
                     terminado_en = NOW(),
                     horas_trabajo = COALESCE(?, ROUND(TIMESTAMPDIFF(MINUTE, COALESCE(iniciado_en, NOW()), NOW()) / 60, 2))
                 WHERE detalle_id = ? AND taller_id = ?`,
                [horas_trabajo, detalle_id, taller_id]
            );

            // Verificar si TODOS los ítems del pedido ya están 'terminado' para marcar el pedido como 'terminado'
            const [pendientes] = await db.query(
                "SELECT COUNT(*) AS faltantes FROM detalle_pedido WHERE pedido_id = ? AND estado_confeccion <> 'terminado'",
                [detalle.pedido_id]
            );

            if (pendientes[0].faltantes === 0) {
                await db.query(
                    "UPDATE pedido SET estado = 'terminado' WHERE pedido_id = ? AND taller_id = ? AND estado = 'en_produccion'",
                    [detalle.pedido_id, taller_id]
                );
            }
        } else {
            await db.query(
                'UPDATE detalle_pedido SET estado_confeccion = ? WHERE detalle_id = ? AND taller_id = ?',
                [estado_confeccion, detalle_id, taller_id]
            );
        }

        res.json({
            mensaje: `Confección actualizada a '${estado_confeccion}'.`,
            detalle_id: Number(detalle_id),
            estado_confeccion
        });

    } catch (error) {
        console.error('Error al actualizar confección:', error);
        res.status(500).json({ error: 'Error interno al actualizar el estado de confección.' });
    }
};
// =====================================================================
// 8. CREAR SOLICITUD DE PRENDA PERSONALIZADA (A medida / por foto y descripción)
// =====================================================================
exports.crearSolicitudPersonalizada = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { rol, id: usuarioId, taller_id: tallerUsuario } = req.usuario;
        const {
            taller_id: tallerBody,
            cliente_id: clienteBody,
            prioridad = 'normal',
            nombre_prenda,
            tipo_prenda,
            color = null,
            calidad = 'estandar',
            complejidad = 'media',
            talla = null,
            cantidad = 1,
            descripcion,
            imagen_referencia = null // { ruta, nombre_original, tipo_mime, tamano_bytes, texto_alternativo }
        } = req.body;

        const taller_id = rol === 'cliente' ? tallerBody : tallerUsuario;
        const cliente_id = rol === 'cliente' ? usuarioId : clienteBody;

        const TIPOS_VALIDOS = ['falda', 'pantalon', 'blusa', 'vestido', 'polo', 'chaqueta', 'calzado', 'otro'];
        const CALIDADES_VALIDAS = ['basica', 'estandar', 'premium'];
        const COMPLEJIDADES_VALIDAS = ['baja', 'media', 'alta'];

        if (!taller_id || !cliente_id || !nombre_prenda || !tipo_prenda || !descripcion) {
            return res.status(400).json({
                error: 'taller_id, cliente_id, nombre_prenda, tipo_prenda y descripcion son obligatorios.'
            });
        }

        if (!TIPOS_VALIDOS.includes(tipo_prenda) || !CALIDADES_VALIDAS.includes(calidad) || !COMPLEJIDADES_VALIDAS.includes(complejidad)) {
            return res.status(400).json({ error: 'tipo_prenda, calidad o complejidad fuera de los valores permitidos.' });
        }

        if (Number(cantidad) <= 0) {
            return res.status(400).json({ error: 'La cantidad debe ser mayor a 0.' });
        }

        await connection.beginTransaction();

        // 1. Crear la prenda como personalizada (es_personalizada = TRUE, precio = NULL, solicitado_por = cliente_id)
        const [prendaRes] = await connection.query(
            `INSERT INTO prenda (
                taller_id, nombre, descripcion, tipo_prenda, color, calidad, complejidad,
                precio, tarifa_mano_obra, disponible, es_personalizada, solicitado_por, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, FALSE, TRUE, ?, ?)`,
            [taller_id, nombre_prenda.trim(), descripcion, tipo_prenda, color, calidad, complejidad, cliente_id, usuarioId]
        );
        const prenda_id = prendaRes.insertId;

        // 2. Crear cabecera del pedido en estado 'solicitado' con costo_total = 0.00 (pendiente de cotización)
        const [pedidoRes] = await connection.query(
            `INSERT INTO pedido (cliente_id, taller_id, estado, prioridad, costo_total)
             VALUES (?, ?, 'solicitado', ?, 0.00)`,
            [cliente_id, taller_id, prioridad]
        );
        const pedido_id = pedidoRes.insertId;

        // 3. Crear detalle_pedido vinculado a la prenda personalizada
        const [detalleRes] = await connection.query(
            `INSERT INTO detalle_pedido (
                pedido_id, taller_id, prenda_id, talla, cantidad, descripcion,
                costo_materiales, costo_mano_obra, subtotal, estado_confeccion
            ) VALUES (?, ?, ?, ?, ?, ?, 0.00, 0.00, 0.00, 'pendiente')`,
            [pedido_id, taller_id, prenda_id, talla, Number(cantidad), descripcion]
        );
        const detalle_id = detalleRes.insertId;

        // 4. Si envió metadatos de imagen de referencia, registrarla en imagen + detalle_pedido_imagen
        let imagen_id = null;
        if (imagen_referencia && imagen_referencia.ruta) {
            const {
                ruta,
                nombre_original = null,
                tipo_mime = 'image/jpeg',
                tamano_bytes = 1024,
                texto_alternativo = nombre_prenda
            } = imagen_referencia;

            const [imgRes] = await connection.query(
                `INSERT INTO imagen (ruta, nombre_original, tipo_mime, tamano_bytes, texto_alternativo, subida_por)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [ruta, nombre_original, tipo_mime, tamano_bytes, texto_alternativo, usuarioId]
            );
            imagen_id = imgRes.insertId;

            await connection.query(
                `INSERT INTO detalle_pedido_imagen (detalle_id, imagen_id, tipo_imagen)
                 VALUES (?, ?, 'referencia')`,
                [detalle_id, imagen_id]
            );
        }

        await connection.commit();

        res.status(201).json({
            mensaje: 'Solicitud de prenda personalizada registrada exitosamente. Pendiente de cotización del taller.',
            pedido_id,
            detalle_id,
            prenda_id,
            imagen_id,
            estado: 'solicitado',
            costo_total: 0
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al crear solicitud personalizada:', error);
        res.status(500).json({ error: 'Error interno al registrar la solicitud personalizada.' });
    } finally {
        connection.release();
    }
};
// =====================================================================
// 9. COTIZAR Y APROBAR PEDIDO (Acuerdo con el cliente + anticipo mínimo)
// =====================================================================
exports.cotizarYAprobarPedido = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const { items, anticipo_minimo = 0, notas_cotizacion = null, prioridad = null } = req.body;
        const taller_id = req.usuario.taller_id;
        const gestionado_por = req.usuario.id;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Debes incluir el desglose cotizado de los ítems.' });
        }

        await connection.beginTransaction();

        const [pedidoRows] = await connection.query(
            'SELECT pedido_id, estado FROM pedido WHERE pedido_id = ? AND taller_id = ? FOR UPDATE',
            [id, taller_id]
        );

        if (pedidoRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado en este taller.' });
        }

        if (['cancelado', 'rechazado', 'entregado'].includes(pedidoRows[0].estado)) {
            await connection.rollback();
            return res.status(400).json({ error: `No se puede cotizar un pedido en estado '${pedidoRows[0].estado}'.` });
        }

        let costoTotalNuevo = 0;

        for (const it of items) {
            const {
                detalle_id,
                talla = null,
                descripcion = null,
                costo_materiales = 0,
                costo_mano_obra = 0,
                subtotal
            } = it;

            const subtotalNum = Number(subtotal);
            if (!detalle_id || Number.isNaN(subtotalNum) || subtotalNum <= 0) {
                await connection.rollback();
                return res.status(400).json({ error: 'Cada ítem debe tener un subtotal acordado mayor a 0.' });
            }

            await connection.query(
                `UPDATE detalle_pedido
                 SET talla = COALESCE(?, talla),
                     descripcion = COALESCE(?, descripcion),
                     costo_materiales = ?,
                     costo_mano_obra = ?,
                     subtotal = ?
                 WHERE detalle_id = ? AND pedido_id = ? AND taller_id = ?`,
                [
                    talla,
                    descripcion,
                    Number(costo_materiales || 0),
                    Number(costo_mano_obra || 0),
                    subtotalNum,
                    detalle_id,
                    id,
                    taller_id
                ]
            );

            costoTotalNuevo += subtotalNum;
        }

        costoTotalNuevo = Number(costoTotalNuevo.toFixed(2));
        const anticipoNum = Number(Number(anticipo_minimo || 0).toFixed(2));

        if (anticipoNum < 0 || anticipoNum > costoTotalNuevo) {
            await connection.rollback();
            return res.status(400).json({ error: 'El anticipo mínimo no puede ser negativo ni superar el costo total.' });
        }

        await connection.query(
            `UPDATE pedido
             SET costo_total = ?,
                 anticipo_minimo = ?,
                 notas_cotizacion = ?,
                 prioridad = COALESCE(?, prioridad),
                 estado = 'aceptado',
                 gestionado_por = ?,
                 fecha_respuesta = COALESCE(fecha_respuesta, NOW())
             WHERE pedido_id = ? AND taller_id = ?`,
            [costoTotalNuevo, anticipoNum, notas_cotizacion, prioridad, gestionado_por, id, taller_id]
        );

        await connection.commit();

        res.json({
            mensaje: 'Cotización guardada y pedido aprobado. El cliente ya puede registrar su anticipo.',
            pedido_id: Number(id),
            costo_total: costoTotalNuevo,
            anticipo_minimo: anticipoNum,
            estado: 'aceptado'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al cotizar pedido:', error);
        res.status(500).json({ error: 'Error interno al registrar la cotización del pedido.' });
    } finally {
        connection.release();
    }
};