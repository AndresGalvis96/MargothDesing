const express = require('express');
const router = express.Router();
const {
    obtenerResumenDashboard,
    obtenerProduccionOperarios,
    obtenerConsumoMateriales,
    obtenerAlertasStockBajo,
    obtenerTiemposAtencion
} = require('../controllers/reporteController');

const { verificarToken } = require('../middleware/authMiddleware');
const { autorizarRoles } = require('../middleware/roleMiddleware');

// GET: Indicadores KPI generales para el dashboard del taller
router.get('/dashboard', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerResumenDashboard);

// GET: Producción y tiempos por operario (?fecha_inicio=2026-11-01&fecha_fin=2026-11-30&operario_id=3)
router.get('/produccion-operarios', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerProduccionOperarios);

// GET: Consumo acumulado de materiales (?categoria=tela&fecha_inicio=2026-11-01&fecha_fin=2026-11-30)
router.get('/consumo-materiales', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerConsumoMateriales);

// GET: Materiales en stock mínimo o agotados (vw_stock_bajo)
router.get('/stock-bajo', verificarToken, autorizarRoles('admin_local', 'supervisor', 'operario'), obtenerAlertasStockBajo);

// GET: Tiempos de respuesta y cola de pedidos pendientes (vw_tiempos_atencion + vw_pedidos_pendientes)
router.get('/tiempos-atencion', verificarToken, autorizarRoles('admin_local', 'supervisor'), obtenerTiemposAtencion);

module.exports = router;