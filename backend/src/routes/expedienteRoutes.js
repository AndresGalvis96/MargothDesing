const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/authMiddleware');
const expedienteCtrl = require('../controllers/expedienteClienteController');

const ROLES_TALLER = ['admin_local', 'supervisor', 'operario'];

const validarPersonalTaller = (req, res, next) => {
    if (!req.usuario || !ROLES_TALLER.includes(req.usuario.rol)) {
        return res.status(403).json({ error: 'Acceso denegado. Solo personal del taller.' });
    }
    next();
};

router.get('/clientes/:clienteId', verificarToken, validarPersonalTaller, expedienteCtrl.obtenerExpedienteCliente);
router.put('/clientes/:clienteId/crm', verificarToken, validarPersonalTaller, expedienteCtrl.actualizarPerfilCRMCliente);
router.post('/clientes/:clienteId/medidas', verificarToken, validarPersonalTaller, expedienteCtrl.registrarMedicionCliente);
router.post('/clientes/:clienteId/bitacora', verificarToken, validarPersonalTaller, expedienteCtrl.registrarBitacoraCliente);
router.get('/clientes', verificarToken, validarPersonalTaller, expedienteCtrl.listarClientesTaller);

module.exports = router;