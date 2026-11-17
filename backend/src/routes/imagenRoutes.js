const express = require('express');
const router = express.Router();
const {
    subirImagenPrenda,
    obtenerImagenesPrenda,
    subirImagenDetallePedido,
    obtenerImagenesDetallePedido,
    eliminarImagen
} = require('../controllers/imagenController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');
const { subirFotoPrenda, subirFotoPedido } = require('../middleware/uploadMiddleware');

// ==========================================
// IMÁGENES DE PRENDAS (Catálogo)
// ==========================================
// GET público para que los clientes vean las fotos del catálogo
router.get('/prenda/:prenda_id', obtenerImagenesPrenda);

// POST privado para subir foto de una prenda (Admin / Supervisor)
router.post('/prenda/:prenda_id', verificarToken, autorizarRoles('admin_local', 'supervisor'), subirFotoPrenda, subirImagenPrenda);

// ==========================================
// IMÁGENES DE DETALLE DE PEDIDO (Referencia y Resultado)
// ==========================================
router.get('/pedido-detalle/:detalle_id', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor', 'operario'), obtenerImagenesDetallePedido);
router.post('/pedido-detalle/:detalle_id', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor', 'operario'), subirFotoPedido, subirImagenDetallePedido);

// ==========================================
// ELIMINAR IMAGEN
// ==========================================
router.delete('/:imagen_id', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor'), eliminarImagen);

module.exports = router;