const express = require('express');
const router = express.Router();
const { 
    registrarEmpleado, 
    obtenerEmpleadosPorTaller, 
    obtenerEmpleadoPorId,
    actualizarEmpleado, 
    cambiarEstadoEmpleado,
    restablecerContrasenaEmpleado
} = require('../controllers/empleadoController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// GET: Ver lista de empleados del taller (Admin y Supervisor)
router.get('/', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerEmpleadosPorTaller);

router.get('/:id', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerEmpleadoPorId);

// POST: Registrar nuevo empleado (Solo Admin)
router.post('/', verificarToken, autorizarRoles('admin_local'), registrarEmpleado);

// PUT: Actualizar datos y rol de un empleado (Solo Admin)
router.put('/:id', verificarToken, autorizarRoles('admin_local'), actualizarEmpleado);

// PATCH: Activar o desactivar empleado (Solo Admin)
router.patch('/:id/estado', verificarToken, autorizarRoles('admin_local'), cambiarEstadoEmpleado);

router.patch('/:id/contrasena', verificarToken, autorizarRoles('admin_local'), restablecerContrasenaEmpleado);
module.exports = router;