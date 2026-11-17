const db = require('../config/db');
const { decrypt } = require('../utils/crypto');

const METODOS_VALIDOS = ['efectivo', 'tienda', 'transferencia', 'pasarela'];
const ESTADOS_PAGO_VALIDOS = ['pendiente', 'confirmado', 'rechazado', 'reembolsado'];

// =====================================================================
// 1. REGISTRAR UN PAGO O ABONO A UN PEDIDO
// =====================================================================
exports.registrarPago = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { rol, id: usuarioId, taller_id } = req.usuario;
        const { pedido_id, monto, metodo, referencia = null, estado = null } = req.body;

        if (!pedido_id || monto === undefined || !metodo) {
            return res.status(400).json({
                error: 'pedido_id, monto y metodo son obligatorios.'
            });
        }

        const montoNum = Number(monto);
        if (isNaN(montoNum) || montoNum <= 0) {
            return res.status(400).json({ error: 'El monto del pago debe ser mayor a 0.' });
        }

        if (!METODOS_VALIDOS.includes(metodo)) {
            return res.status(400).json({
                error: `Método de pago inválido. Valores permitidos: ${METODOS_VALIDOS.join(', ')}`
            });
        }

        // Regla CHECK chk_pago_pasarela_referencia
        if (metodo === 'pasarela' && (!referencia || !String(referencia).trim())) {
            return res.status(400).json({
                error: "Los pagos por 'pasarela' requieren obligatoriamente un código de referencia."
            });
        }

        await connection.beginTransaction();

        // Bloquear pedido para calcular el saldo pendiente de forma atómica
        const [pedidoRows] = await connection.query(
            'SELECT pedido_id, cliente_id, taller_id, estado, costo_total FROM pedido WHERE pedido_id = ? FOR UPDATE',
            [pedido_id]
        );

        if (pedidoRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const pedido = pedidoRows[0];

        // Control de pertenencia
        if (rol === 'cliente' && pedido.cliente_id !== usuarioId) {
            await connection.rollback();
            return res.status(403).json({ error: 'No puedes registrar pagos sobre un pedido de otro cliente.' });
        }
        if (rol !== 'cliente' && pedido.taller_id !== taller_id) {
            await connection.rollback();
            return res.status(403).json({ error: 'Este pedido pertenece a otro taller.' });
        }

        if (['rechazado', 'cancelado'].includes(pedido.estado)) {
            await connection.rollback();
            return res.status(400).json({
                error: `No se pueden registrar pagos para un pedido en estado '${pedido.estado}'.`
            });
        }

        const costoTotal = Number(pedido.costo_total);
        if (costoTotal <= 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Este pedido aún tiene costo_total en 0 (pendiente de cotización del taller).'
            });
        }

        // Calcular total ya abonado/confirmado
        const [sumRows] = await connection.query(
            "SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pago WHERE pedido_id = ? AND estado = 'confirmado'",
            [pedido_id]
        );

        const totalPagado = Number(sumRows[0].total_pagado);
        const saldoPendiente = Number((costoTotal - totalPagado).toFixed(2));

        if (saldoPendiente <= 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Este pedido ya se encuentra pagado en su totalidad.' });
        }

        if (montoNum > saldoPendiente) {
            await connection.rollback();
            return res.status(400).json({
                error: `El monto ($${montoNum}) supera el saldo pendiente del pedido ($${saldoPendiente}).`
            });
        }

        // Si lo registra el taller en caja/tienda nace 'confirmado'; si lo reporta el cliente nace 'pendiente'
        let estadoFinal;
        if (rol === 'cliente') {
            estadoFinal = 'pendiente';
        } else {
            estadoFinal = estado && ESTADOS_PAGO_VALIDOS.includes(estado) ? estado : 'confirmado';
        }

        const [insertRes] = await connection.query(
            `INSERT INTO pago (pedido_id, monto, metodo, estado, referencia, registrado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [pedido_id, montoNum, metodo, estadoFinal, referencia ? String(referencia).trim() : null, usuarioId]
        );

        await connection.commit();

        const nuevoTotalPagado = estadoFinal === 'confirmado'
            ? Number((totalPagado + montoNum).toFixed(2))
            : totalPagado;
        const nuevoSaldo = Number((costoTotal - nuevoTotalPagado).toFixed(2));

        res.status(201).json({
            mensaje: estadoFinal === 'confirmado'
                ? 'Pago registrado y confirmado exitosamente.'
                : 'Comprobante de pago registrado en estado pendiente de verificación por el taller.',
            pago_id: insertRes.insertId,
            pedido_id: Number(pedido_id),
            monto: montoNum,
            metodo,
            estado: estadoFinal,
            resumen_financiero: {
                costo_total_pedido: costoTotal,
                total_pagado_confirmado: nuevoTotalPagado,
                saldo_pendiente: nuevoSaldo,
                pagado_completo: nuevoSaldo === 0
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al registrar pago:', error);
        res.status(500).json({ error: 'Error interno al registrar el pago.' });
    } finally {
        connection.release();
    }
};

// =====================================================================
// 2. CONSULTAR HISTORIAL DE PAGOS Y SALDO DE UN PEDIDO
// =====================================================================
exports.obtenerPagosPorPedido = async (req, res) => {
    try {
        const { pedido_id } = req.params;
        const { rol, id: usuarioId, taller_id } = req.usuario;

        const [pedidoRows] = await db.query(
            'SELECT pedido_id, cliente_id, taller_id, estado, costo_total FROM pedido WHERE pedido_id = ?',
            [pedido_id]
        );

        if (pedidoRows.length === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }

        const pedido = pedidoRows[0];

        if (rol === 'cliente' && pedido.cliente_id !== usuarioId) {
            return res.status(403).json({ error: 'No tienes permiso para ver los pagos de este pedido.' });
        }
        if (rol !== 'cliente' && pedido.taller_id !== taller_id) {
            return res.status(403).json({ error: 'Este pedido pertenece a otro taller.' });
        }

        const [pagosRows] = await db.query(
            `SELECT pa.pago_id, pa.pedido_id, pa.monto, pa.metodo, pa.estado,
                    pa.referencia, pa.registrado_por, pa.fecha_pago,
                    u.nombres_cifrado, u.apellidos_cifrado
             FROM pago pa
             LEFT JOIN usuario u ON u.usuario_id = pa.registrado_por
             WHERE pa.pedido_id = ?
             ORDER BY pa.fecha_pago DESC, pa.pago_id DESC`,
            [pedido_id]
        );

        const pagos = pagosRows.map(p => ({
            pago_id: p.pago_id,
            monto: Number(p.monto),
            metodo: p.metodo,
            estado: p.estado,
            referencia: p.referencia,
            registrado_por: p.nombres_cifrado
                ? `${decrypt(p.nombres_cifrado)} ${decrypt(p.apellidos_cifrado)}`
                : 'Sistema / Pasarela',
            fecha_pago: p.fecha_pago
        }));

        const costoTotal = Number(pedido.costo_total);
        const totalConfirmado = pagos
            .filter(p => p.estado === 'confirmado')
            .reduce((acc, p) => acc + p.monto, 0);
        const totalPendienteVerificacion = pagos
            .filter(p => p.estado === 'pendiente')
            .reduce((acc, p) => acc + p.monto, 0);

        const saldoPendiente = Number((costoTotal - totalConfirmado).toFixed(2));

        res.json({
            pedido_id: Number(pedido_id),
            estado_pedido: pedido.estado,
            resumen_financiero: {
                costo_total_pedido: costoTotal,
                total_pagado_confirmado: Number(totalConfirmado.toFixed(2)),
                total_pendiente_verificacion: Number(totalPendienteVerificacion.toFixed(2)),
                saldo_pendiente: saldoPendiente,
                pagado_completo: costoTotal > 0 && saldoPendiente === 0
            },
            pagos
        });

    } catch (error) {
        console.error('Error al obtener pagos del pedido:', error);
        res.status(500).json({ error: 'Error interno al consultar los pagos del pedido.' });
    }
};

// =====================================================================
// 3. CAMBIAR ESTADO DE UN PAGO (Confirmar transferencia / Rechazar / Reembolsar)
// =====================================================================
exports.actualizarEstadoPago = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const taller_id = req.usuario.taller_id;

        if (!ESTADOS_PAGO_VALIDOS.includes(estado)) {
            return res.status(400).json({
                error: `Estado de pago inválido. Valores permitidos: ${ESTADOS_PAGO_VALIDOS.join(', ')}`
            });
        }

        await connection.beginTransaction();

        const [pagoRows] = await connection.query(
            `SELECT pa.pago_id, pa.pedido_id, pa.monto, pa.estado AS estado_actual,
                    pe.taller_id, pe.costo_total
             FROM pago pa
             JOIN pedido pe ON pe.pedido_id = pa.pedido_id
             WHERE pa.pago_id = ?
             FOR UPDATE`,
            [id]
        );

        if (pagoRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Pago no encontrado.' });
        }

        const pago = pagoRows[0];

        if (pago.taller_id !== taller_id) {
            await connection.rollback();
            return res.status(403).json({ error: 'Este pago pertenece a otro taller.' });
        }

        // Si se va a confirmar un pago que estaba 'pendiente', verificar que no exceda el saldo pendiente
        if (estado === 'confirmado' && pago.estado_actual !== 'confirmado') {
            const [sumRows] = await connection.query(
                "SELECT COALESCE(SUM(monto), 0) AS total_pagado FROM pago WHERE pedido_id = ? AND estado = 'confirmado'",
                [pago.pedido_id]
            );
            const saldoActual = Number((Number(pago.costo_total) - Number(sumRows[0].total_pagado)).toFixed(2));
            if (Number(pago.monto) > saldoActual) {
                await connection.rollback();
                return res.status(400).json({
                    error: `No se puede confirmar este pago ($${pago.monto}) porque supera el saldo pendiente ($${saldoActual}).`
                });
            }
        }

        await connection.query('UPDATE pago SET estado = ? WHERE pago_id = ?', [estado, id]);

        await connection.commit();

        res.json({
            mensaje: `Estado del pago actualizado a '${estado}'.`,
            pago_id: Number(id),
            pedido_id: pago.pedido_id,
            estado
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al actualizar estado del pago:', error);
        res.status(500).json({ error: 'Error interno al actualizar el estado del pago.' });
    } finally {
        connection.release();
    }
};

// =====================================================================
// 4. LISTAR INGRESOS CONFIRMADOS DEL TALLER (Usa la vista vw_ingresos)
// =====================================================================
exports.obtenerIngresosTaller = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { metodo } = req.query;

        let query = `
            SELECT pago_id, pedido_id, metodo, monto, fecha_pago
            FROM vw_ingresos
            WHERE taller_id = ?
        `;
        const params = [taller_id];

        if (metodo) {
            query += ' AND metodo = ?';
            params.push(metodo);
        }

        query += ' ORDER BY fecha_pago DESC';

        const [ingresos] = await db.query(query, params);
        const totalRecaudado = ingresos.reduce((acc, row) => acc + Number(row.monto), 0);

        res.json({
            taller_id,
            total_ingresos_confirmados: Number(totalRecaudado.toFixed(2)),
            cantidad_pagos: ingresos.length,
            ingresos
        });

    } catch (error) {
        console.error('Error al obtener ingresos del taller:', error);
        res.status(500).json({ error: 'Error interno al consultar los ingresos.' });
    }
};