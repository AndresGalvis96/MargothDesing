const express = require('express');
const router = express.Router();
const {
    crearMaterial,
    obtenerMaterialesTaller,
    actualizarMaterial,
    registrarMovimientoStock,
    eliminarMaterial,
    obtenerFichaTecnicaPrenda,
    asignarMaterialAPrenda,
    quitarMaterialDePrenda,
    registrarConsumoProduccion,
    obtenerKardexMateriales
} = require('../controllers/materialController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// ==========================================
// KARDEX Y CONSUMO EN PRODUCCIÓN
// ==========================================
router.get('/kardex', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerKardexMateriales);
router.post('/consumo', verificarToken, autorizarRoles('operario', 'supervisor', 'admin_local'), registrarConsumoProduccion);

// ==========================================
// FICHA TÉCNICA (prenda_material)
// ==========================================
router.get('/ficha-tecnica/:prenda_id', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerFichaTecnicaPrenda);
router.post('/ficha-tecnica/:prenda_id', verificarToken, autorizarRoles('admin_local', 'supervisor'), asignarMaterialAPrenda);
router.delete('/ficha-tecnica/:prenda_id/:material_id', verificarToken, autorizarRoles('admin_local', 'supervisor'), quitarMaterialDePrenda);

// ==========================================
// INVENTARIO DE MATERIALES (material)
// ==========================================
router.get('/', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerMaterialesTaller);
router.post('/', verificarToken, autorizarRoles('admin_local', 'supervisor'), crearMaterial);
router.put('/:id', verificarToken, autorizarRoles('admin_local', 'supervisor'), actualizarMaterial);
router.post('/:id/movimiento', verificarToken, autorizarRoles('admin_local', 'supervisor'), registrarMovimientoStock);
router.delete('/:id', verificarToken, autorizarRoles('admin_local'), eliminarMaterial);

module.exports = router;