const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/solicitudGestionController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.use(verificarToken);

router.get('/', ctrl.listarSolicitudes);
router.get('/balance-carga', ctrl.obtenerBalanceCarga);
router.get('/:pedidoId', ctrl.obtenerDetalleSolicitud);
router.post('/:pedidoId/cotizaciones', ctrl.guardarVersionCotizacion);
router.post('/:pedidoId/prendas/:detalleId/tareas', ctrl.crearTareaPrenda);
router.put('/tareas/:tareaId/asignar', ctrl.reasignarTarea);
router.post('/:pedidoId/accion', ctrl.gestionarAccionAdministrativa);

module.exports = router;