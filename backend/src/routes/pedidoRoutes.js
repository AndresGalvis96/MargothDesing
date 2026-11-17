const express = require('express');
const router = express.Router();
const {
    crearPedido,
    obtenerPedidos,
    obtenerDetallePedido,
    gestionarEstadoPedido,
    cancelarPedidoCliente,
    asignarOperarioDetalle,
    actualizarEstadoConfeccion,
    crearSolicitudPersonalizada,
    cotizarYAprobarPedido
} = require('../controllers/pedidoController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// ==========================================
// RUTAS DE CABECERA DE PEDIDOS (pedido)
// ==========================================
// POST: Crear pedido (Cliente desde la web/app o Admin/Supervisor en mostrador)
router.post('/', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor'), crearPedido);

router.post('/personalizado', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor'), crearSolicitudPersonalizada);

// GET: Listar pedidos (filtrado automáticamente según rol)
router.get('/', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor', 'operario'), obtenerPedidos);

// GET: Ver detalle completo de un pedido e ítems
router.get('/:id', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor', 'operario'), obtenerDetallePedido);

// PATCH: Aceptar, rechazar o avanzar estado global del pedido (Admin/Supervisor)
router.patch('/:id/estado', verificarToken, autorizarRoles('admin_local', 'supervisor'), gestionarEstadoPedido);

router.patch('/:id/cotizar', verificarToken, autorizarRoles('admin_local', 'supervisor'), cotizarYAprobarPedido);

// PATCH: Cancelar pedido por parte del cliente (solo si está solicitado o aceptado)
router.patch('/:id/cancelar', verificarToken, autorizarRoles('cliente'), cancelarPedidoCliente);

// ==========================================
// RUTAS DE PRODUCCIÓN POR ÍTEM (detalle_pedido)
// ==========================================
// PATCH: Asignar un operario a un ítem del pedido (Admin/Supervisor)
router.patch('/detalle/:detalle_id/asignar', verificarToken, autorizarRoles('admin_local', 'supervisor'), asignarOperarioDetalle);

// PATCH: Reportar avance de confección: en_proceso / terminado (Operario/Supervisor/Admin)
router.patch('/detalle/:detalle_id/confeccion', verificarToken, autorizarRoles('operario', 'supervisor', 'admin_local'), actualizarEstadoConfeccion);

module.exports = router;