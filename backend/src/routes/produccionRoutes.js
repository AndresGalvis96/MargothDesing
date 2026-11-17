const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middlewares/authMiddleware');
const prodCtrl = require('../controllers/produccionController');

const ROLES_TALLER = ['admin_local', 'supervisor', 'operario'];
const ROLES_GESTION = ['admin_local', 'supervisor'];

const validarPersonalTaller = (req, res, next) => {
    if (!req.usuario || !ROLES_TALLER.includes(req.usuario.rol)) {
        return res.status(403).json({ error: 'Acceso denegado. Solo personal del taller.' });
    }
    next();
};

const validarGestionTaller = (req, res, next) => {
    if (!req.usuario || !ROLES_GESTION.includes(req.usuario.rol)) {
        return res.status(403).json({ error: 'Acceso restringido a Administrador o Supervisor.' });
    }
    next();
};

// Tablero Kanban, Agenda y Tareas
router.get('/agenda-kanban', verificarToken, validarPersonalTaller, prodCtrl.obtenerAgendaYKanban);
router.put('/pedidos/:pedidoId/estado', verificarToken, validarGestionTaller, prodCtrl.actualizarEstadoPedido);

// Histórico de Entregas y Cancelados
router.post('/pedidos/archivar-entregados', verificarToken, validarGestionTaller, prodCtrl.archivarPedidosEntregados);
router.get('/pedidos/historico', verificarToken, validarGestionTaller, prodCtrl.obtenerHistoricoPedidos);

// Agenda de Citas (Solo Admin Local y Supervisor)
router.post('/agenda/citas', verificarToken, validarGestionTaller, prodCtrl.crearCitaAgenda);
router.put('/agenda/citas/:citaId', verificarToken, validarGestionTaller, prodCtrl.actualizarEstadoCitaAgenda);

// Tareas Operativas por Prenda (Todo el taller)
router.post('/tareas', verificarToken, validarPersonalTaller, prodCtrl.crearTareaPrenda);
router.put('/tareas/:tareaId', verificarToken, validarPersonalTaller, prodCtrl.actualizarTareaPrenda);

module.exports = router;