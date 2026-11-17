const express = require('express');
const router = express.Router();
const {
    registrarMedidas,
    obtenerMisMedidas,
    obtenerMedidasDeCliente
} = require('../controllers/medidaController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// POST: Registrar una o varias medidas (Cliente registra las suyas; Taller registra para cualquier cliente)
router.post('/', verificarToken, autorizarRoles('cliente', 'admin_local', 'supervisor', 'operario'), registrarMedidas);

// GET: El cliente consulta sus medidas vigentes y su historial completo
router.get('/mis-medidas', verificarToken, autorizarRoles('cliente'), obtenerMisMedidas);

// GET: El personal del taller consulta las medidas vigentes e historial de un cliente específico
router.get('/cliente/:cliente_id', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerMedidasDeCliente);

module.exports = router;