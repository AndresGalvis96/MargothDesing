const express = require('express');
const router = express.Router();
const {
    autoregistroCliente,
    obtenerMiPerfil,
    actualizarMiPerfil,
    registrarCliente,
    obtenerClientes,
    buscarClientePorCedula,
    actualizarCliente,
    cambiarEstadoCliente
} = require('../controllers/clienteController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// ==========================================
// RUTA PÚBLICA (Sin token)
// ==========================================
router.post('/registro', autoregistroCliente);

// ==========================================
// RUTAS DE AUTOGESTIÓN DEL CLIENTE
// ==========================================
router.get('/mi-perfil', verificarToken, autorizarRoles('cliente'), obtenerMiPerfil);
router.put('/mi-perfil', verificarToken, autorizarRoles('cliente'), actualizarMiPerfil);

// ==========================================
// RUTAS ADMINISTRATIVAS DEL TALLER
// ==========================================
router.get('/', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerClientes);
router.get('/buscar/:cedula', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), buscarClientePorCedula);
router.post('/', verificarToken, autorizarRoles('admin_local', 'supervisor'), registrarCliente);
router.put('/:id', verificarToken, autorizarRoles('admin_local', 'supervisor'), actualizarCliente);
router.patch('/:id/estado', verificarToken, autorizarRoles('admin_local'), cambiarEstadoCliente);

module.exports = router;