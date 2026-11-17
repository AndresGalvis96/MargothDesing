const express = require('express');
const router = express.Router();
const { obtenerTalleres, crearTaller, actualizarEstadoTaller } = require('../controllers/tallerController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// Pública: permite a visitantes y clientes ver los talleres disponibles en la vitrina
router.get('/', obtenerTalleres);

// Solo administradores pueden crear talleres
router.post('/', verificarToken, autorizarRoles('admin_local', 'admin_global'), crearTaller);

// Solo administradores pueden cambiar el estado (activar/inactivar)
router.patch('/:id/estado', verificarToken, autorizarRoles('admin_local', 'admin_global'), actualizarEstadoTaller);

module.exports = router;