import axiosClient from './axiosClient';

export const authService = {
    login: ({ correo, password }) => axiosClient.post('/auth/login', { correo, contrasena: password }),
    registroCliente: (datos) => axiosClient.post('/auth/registro', {
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        cedula: datos.cedula,
        correo: datos.correo,
        fecha_nacimiento: datos.fecha_nacimiento,
        contrasena: datos.password
    }),
};

export const tallerService = {
    listar: () => axiosClient.get('/talleres'),
    crear: (datos) => axiosClient.post('/talleres', datos),
    actualizarEstado: (id, estado) => axiosClient.patch(`/talleres/${id}/estado`, { estado }),
};

export const empleadoService = {
    listar: () => axiosClient.get('/empleados'),
    crear: (datos) => axiosClient.post('/empleados', datos),
    actualizarEstado: (id, estado) => axiosClient.patch(`/empleados/${id}/estado`, { estado }),
};
export const prendaService = {
    catalogoPublico: (tallerId, params) => axiosClient.get(`/prendas/catalogo/${tallerId}`, { params }),
    listar: (params) => axiosClient.get('/prendas', { params }),
    obtenerPorId: (id) => axiosClient.get(`/prendas/${id}`),
    crear: (datos) => axiosClient.post('/prendas', datos),
    actualizar: (id, datos) => axiosClient.put(`/prendas/${id}`, datos),
    cambiarDisponibilidad: (id, disponible) => axiosClient.patch(`/prendas/${id}/disponibilidad`, { disponible }),
    eliminar: (id) => axiosClient.delete(`/prendas/${id}`),
    listarInventario: (id) => axiosClient.get(`/prendas/${id}/inventario`),
    agregarInventario: (id, datos) => axiosClient.post(`/prendas/${id}/inventario`, datos),
};

export const materialService = {
    listar: () => axiosClient.get('/materiales'),
    crear: (datos) => axiosClient.post('/materiales', datos),
    movimientoStock: (id, datos) => axiosClient.post(`/materiales/${id}/movimiento`, datos),
    registrarConsumo: (datos) => axiosClient.post('/materiales/consumo', datos),
    obtenerKardex: (params) => axiosClient.get('/materiales/kardex', { params }),
    obtenerFichaTecnica: (prendaId) => axiosClient.get(`/materiales/ficha-tecnica/${prendaId}`),
    asignarMaterialPrenda: (prendaId, datos) => axiosClient.post(`/materiales/ficha-tecnica/${prendaId}`, datos),
};

export const pedidoService = {
    listar: (params) => axiosClient.get('/pedidos', { params }),
    detalle: (id) => axiosClient.get(`/pedidos/${id}`),
    obtenerDetalle: (id) => axiosClient.get(`/pedidos/${id}`),
    crearEstandar: (datos) => axiosClient.post('/pedidos', datos),
    crearPersonalizado: (datos) => axiosClient.post('/pedidos/personalizado', datos),
    gestionarEstado: (id, datos) => axiosClient.patch(`/pedidos/${id}/estado`, datos),
    cotizar: (id, datos) => axiosClient.patch(`/pedidos/${id}/cotizar`, datos),
    cancelar: (id) => axiosClient.patch(`/pedidos/${id}/cancelar`),
    asignarOperario: (detalleId, datos) => axiosClient.patch(`/pedidos/detalle/${detalleId}/asignar`, datos),
    actualizarConfeccion: (detalleId, datos) => axiosClient.patch(`/pedidos/detalle/${detalleId}/confeccion`, datos),
};

export const pagoService = {
    listar: (params) => axiosClient.get('/pagos', { params }),
    listarPorPedido: (pedidoId) => axiosClient.get(`/pagos/pedido/${pedidoId}`), // o '/pagos', { params: { pedido_id: pedidoId } }
    registrar: (datos) => axiosClient.post('/pagos', datos),
    verificar: (id, datos) => axiosClient.patch(`/pagos/${id}/verificar`, datos),
};
export const medidaService = {
    registrar: (datos) => axiosClient.post('/medidas', datos),
    misMedidas: () => axiosClient.get('/medidas/mis-medidas'),
    porCliente: (clienteId) => axiosClient.get(`/medidas/cliente/${clienteId}`),
};

export const imagenService = {
    listarPrenda: (prendaId) => axiosClient.get(`/imagenes/prenda/${prendaId}`),
    subirPrenda: (prendaId, formData) => axiosClient.post(`/imagenes/prenda/${prendaId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    listarDetallePedido: (detalleId) => axiosClient.get(`/imagenes/pedido-detalle/${detalleId}`),
    subirDetallePedido: (detalleId, formData) => axiosClient.post(`/imagenes/pedido-detalle/${detalleId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    eliminar: (imagenId) => axiosClient.delete(`/imagenes/${imagenId}`),
};

export const reporteService = {
    dashboard: () => axiosClient.get('/reportes/dashboard'),
    produccionOperarios: (params) => axiosClient.get('/reportes/produccion-operarios', { params }),
    consumoMateriales: (params) => axiosClient.get('/reportes/consumo-materiales', { params }),
    stockBajo: () => axiosClient.get('/reportes/stock-bajo'),
    tiemposAtencion: () => axiosClient.get('/reportes/tiempos-atencion'),
};

export const expedienteService = {
    listarClientes: () => axiosClient.get('/expedientes/clientes'),
    obtenerCliente: (clienteId) => axiosClient.get(`/expedientes/clientes/${clienteId}`),
    actualizarCRM: (clienteId, payload) => axiosClient.put(`/expedientes/clientes/${clienteId}/crm`, payload),
    registrarMedidas: (clienteId, payload) => axiosClient.post(`/expedientes/clientes/${clienteId}/medidas`, payload),
    registrarBitacora: (clienteId, payload) => axiosClient.post(`/expedientes/clientes/${clienteId}/bitacora`, payload)
};

export const produccionService = {
    obtenerAgendaKanban: () => axiosClient.get('/produccion/agenda-kanban'),
    actualizarEstadoPedido: (pedidoId, data) => axiosClient.put(`/produccion/pedidos/${pedidoId}/estado`, data),
    archivarEntregados: (pedido_id = null) => axiosClient.post('/produccion/pedidos/archivar-entregados', { pedido_id }),
    obtenerHistorico: () => axiosClient.get('/produccion/pedidos/historico'),
    crearCitaAgenda: (data) => axiosClient.post('/produccion/agenda/citas', data),
    actualizarEstadoCita: (citaId, estado) => axiosClient.put(`/produccion/agenda/citas/${citaId}`, { estado }),
    crearTareaPrenda: (data) => axiosClient.post('/produccion/tareas', data),
    actualizarTareaPrenda: (tareaId, data) => axiosClient.put(`/produccion/tareas/${tareaId}`, data),
};
export const solicitudService = {
    listar: (params = {}) => axiosClient.get('/solicitudes', { params }),
    obtenerDetalle: (pedidoId) => axiosClient.get(`/solicitudes/${pedidoId}`),
    guardarCotizacion: (pedidoId, payload) => axiosClient.post(`/solicitudes/${pedidoId}/cotizaciones`, payload),
    obtenerBalanceCarga: () => axiosClient.get('/solicitudes/balance-carga'),
    crearTareaPrenda: (pedidoId, detalleId, payload) =>
        axiosClient.post(`/solicitudes/${pedidoId}/prendas/${detalleId}/tareas`, payload),
    reasignarTarea: (tareaId, payload) => axiosClient.put(`/solicitudes/tareas/${tareaId}/asignar`, payload),
    ejecutarAccion: (pedidoId, payload) => axiosClient.post(`/solicitudes/${pedidoId}/accion`, payload),
};