const express = require('express');
const router = express.Router();
const {
    registrarPago,
    obtenerPagosPorPedido,
    actualizarEstadoPago,
    obtenerIngresosTaller
} = require('../controllers/pagoController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// POST: Registrar abono o pago total (Cliente reporta transferencia o Admin/Supervisor cobra en caja)
router.post('/', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor'), registrarPago);

// GET: Reporte de ingresos confirmados del taller (Usa vw_ingresos)
router.get('/ingresos', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerIngresosTaller);

// GET: Consultar historial de pagos y saldo pendiente de un pedido
router.get('/pedido/:pedido_id', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor'), obtenerPagosPorPedido);

// PATCH: Confirmar, rechazar o reembolsar un pago (Admin/Supervisor)
router.patch('/:id/estado', verificarToken, autorizarRoles('admin_local', 'supervisor'), actualizarEstadoPago);

module.exports = router;