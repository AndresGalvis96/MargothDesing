const express = require('express');
const router = express.Router();
const {
    crearPrenda,
    obtenerPrendasTaller,
    obtenerCatalogoPublicoTaller,
    obtenerPrendaPorId,
    actualizarPrenda,
    cambiarDisponibilidadPrenda,
    eliminarPrenda,
    obtenerVariantesPrenda,
    agregarVarianteStock
} = require('../controllers/prendaController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// ==========================================
// RUTA PÚBLICA (Vitrina / Clientes)
// ==========================================
router.get('/catalogo/:taller_id', obtenerCatalogoPublicoTaller);

// ==========================================
// RUTAS PRIVADAS DEL TALLER
// ==========================================
router.get('/', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerPrendasTaller);
router.get('/:id', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerPrendaPorId);

router.get('/:id/inventario', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerVariantesPrenda);
router.post('/:id/inventario', verificarToken, autorizarRoles('admin_local', 'supervisor'), agregarVarianteStock);

// POST y PUT: Crear y actualizar prenda (Admin y Supervisor)
router.post('/', verificarToken, autorizarRoles('admin_local', 'supervisor'), crearPrenda);
router.put('/:id', verificarToken, autorizarRoles('admin_local', 'supervisor'), actualizarPrenda);

// PATCH y DELETE: Quitar de la vista o eliminar (ÚNICAMENTE admin_local)
router.patch('/:id/disponibilidad', verificarToken, autorizarRoles('admin_local'), cambiarDisponibilidadPrenda);
router.delete('/:id', verificarToken, autorizarRoles('admin_local'), eliminarPrenda);

module.exports = router;