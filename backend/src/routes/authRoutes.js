const express = require('express');
const router = express.Router();

const { registro, login, perfil, cambiarMiContrasena } = require('../controllers/authController');
const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware'); 

// Rutas públicas
router.post('/registro', registro);
router.post('/login', login);

// Rutas privadas
router.get('/perfil', verificarToken, perfil);

// Ruta de prueba solo para administradores y supervisores
router.get('/admin-test', 
    verificarToken, 
    autorizarRoles('admin_local', 'supervisor'),
    (req, res) => {
        res.json({ mensaje: '¡Éxito! Tienes permisos de administrador para ver esto.' });
    }
);

// Cambiar contraseña propia
router.patch('/cambiar-contrasena', verificarToken, cambiarMiContrasena);

module.exports = router;