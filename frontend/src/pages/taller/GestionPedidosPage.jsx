import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { solicitudService, imagenService } from '../../api/services';
import { API_BASE_URL } from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import {
    Search, Filter, RefreshCw, AlertTriangle, Calculator, Users,
    Clock, CheckCircle2, ChevronDown, ChevronRight,
    Plus, History, Ruler, FileText, ArrowLeft, ExternalLink, MoreVertical,
    BarChart3, Layers, X, Shirt, Wallet, UserCheck
} from 'lucide-react';

const MOTIVOS_RECOTIZACION = [
    'Error en el cálculo',
    'Cambio solicitado por el cliente',
    'Modificación de materiales',
    'Cambio en las especificaciones de la prenda',
    'Ajuste de mano de obra',
    'Otro motivo'
];

const PARTES_PRENDA = [
    'General / Preparación y corte',
    'Cuerpo / Torso',
    'Mangas',
    'Cuello / Solapas',
    'Falda / Pantalón',
    'Cierres / Botonadura',
    'Forro / Entretela',
    'Acabados y terminaciones',
    'Revisión y ajustes'
];

export default function GestionPedidosPage() {
    const auth = useAuth();
    const usuarioActual = auth?.usuario || auth?.user || null;
    const navigate = useNavigate();

    const puedeCotizarYAdmin = ['admin_local', 'supervisor'].includes(usuarioActual?.rol);
    const puedeAsignar = ['admin_local', 'supervisor', 'encargado'].includes(usuarioActual?.rol);

    // Listado y filtros
    const [solicitudes, setSolicitudes] = useState([]);
    const [kpis, setKpis] = useState({ nuevas_revision: 0, pendientes_cotizacion: 0, esperando_cliente: 0, aprobadas_sin_asignar: 0 });
    const [cargando, setCargando] = useState(true);
    const [tabLista, setTabLista] = useState('por_atender'); // 'por_atender' | 'aprobadas' | 'historial'
    const [kpiActivo, setKpiActivo] = useState(''); // '' | 'nuevas' | 'sin_cotizar' | 'esperando_cliente' | 'sin_asignar'
    const [historialDesplegado, setHistorialDesplegado] = useState({ canceladas: false, rechazadas: false });

    const [busqueda, setBusqueda] = useState('');
    const [mostrarFiltros, setMostrarFiltros] = useState(false);
    const [filtros, setFiltros] = useState({
        prioridad: '',
        sin_medidas: '',
        sin_cotizar: ''
    });

    // Selección y Panel Derecho (Maestro-Detalle)
    const [pedidoSeleccionadoId, setPedidoSeleccionadoId] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [tabDetalle, setTabDetalle] = useState('informacion'); // 'informacion' | 'medidas' | 'cotizaciones' | 'pagos' | 'historial'
    const [menuMasId, setMenuMasId] = useState(null);
    const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

    // Modal Cotización / Re-cotización
    const [modalCotizacion, setModalCotizacion] = useState(null);
    const [guardandoCot, setGuardandoCot] = useState(false);

    // Modal Distribuidor de Tareas por Prenda + Balance de Carga
    const [modalDistribuidor, setModalDistribuidor] = useState(null);
    const [balanceCarga, setBalanceCarga] = useState([]);
    const [modalBalance, setModalBalance] = useState(false);
    const [formTarea, setFormTarea] = useState({
        nombre: '',
        parte_prenda: 'Cuerpo / Torso',
        descripcion: '',
        responsable_id: '',
        complejidad: 'media',
        horas_estimadas: 2,
        prioridad: 'normal',
        fecha_inicio_prevista: '',
        fecha_limite: '',
        dependencia_tarea_id: '',
        observaciones: ''
    });
    const [advertenciaDuplicado, setAdvertenciaDuplicado] = useState('');

    // Modal Rechazo
    const [modalRechazo, setModalRechazo] = useState({ abierto: false, pedidoId: null, cliente: '', motivo: '', observaciones: '' });

    const cargarSolicitudes = async () => {
        setCargando(true);
        try {
            const { data } = await solicitudService.listar({
                q: busqueda,
                prioridad: filtros.prioridad,
                sin_medidas: filtros.sin_medidas,
                sin_cotizar: filtros.sin_cotizar
            });
            setSolicitudes(data.solicitudes || []);
            setKpis(data.kpis || { nuevas_revision: 0, pendientes_cotizacion: 0, esperando_cliente: 0, aprobadas_sin_asignar: 0 });
        } catch {
            setMensaje({ tipo: 'error', texto: 'No se pudieron cargar las solicitudes del taller.' });
        } finally {
            setCargando(false);
        }
    };

    const cargarBalance = async () => {
        try {
            const { data } = await solicitudService.obtenerBalanceCarga();
            setBalanceCarga(data || []);
        } catch { /* sin datos */ }
    };

    const cargarDetalle = async (pedidoId) => {
        if (!pedidoId) return;
        try {
            const { data } = await solicitudService.obtenerDetalle(pedidoId);
            if (Array.isArray(data?.items)) {
                await Promise.all(
                    data.items.map(async (it) => {
                        if (!it.imagen_ruta && it.detalle_id) {
                            try {
                                const r = await imagenService.listarDetallePedido(it.detalle_id);
                                if (r.data?.length > 0) it.imagen_ruta = r.data[0].ruta;
                            } catch { /* sin foto */ }
                        }
                    })
                );
            }
            setDetalle(data);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al cargar el detalle.' });
        }
    };

    useEffect(() => {
        cargarSolicitudes();
        cargarBalance();
    }, [busqueda, filtros.prioridad, filtros.sin_medidas, filtros.sin_cotizar]);

    useEffect(() => {
        if (pedidoSeleccionadoId) {
            cargarDetalle(pedidoSeleccionadoId);
        } else {
            setDetalle(null);
        }
    }, [pedidoSeleccionadoId]);

    // Clasificación por pestañas (los contadores de pestañas NO desaparecen al usar tarjetas KPI)
    const listasBasePorPestana = useMemo(() => {
        const estadosPorAtender = [
            'solicitado', 'pendiente', 'pendiente_revision', 'cotizacion_aprobacion',
            'cotizado', 'pendiente_informacion', 'pendiente_materiales', 'requiere_aprobacion_cliente'
        ];

        return {
            por_atender: solicitudes.filter((s) => estadosPorAtender.includes(s.estado)),
            aprobadas: solicitudes.filter((s) => ['aceptado', 'aprobado', 'requiere_ajustes', 'suspendido'].includes(s.estado)),
            canceladas: solicitudes.filter((s) => s.estado === 'cancelado'),
            rechazadas: solicitudes.filter((s) => s.estado === 'rechazado')
        };
    }, [solicitudes]);

    const listaVisibleActual = useMemo(() => {
        const base = listasBasePorPestana[tabLista] || [];
        if (!kpiActivo) return base;
        if (kpiActivo === 'nuevas') return base.filter((s) => s.es_nueva);
        if (kpiActivo === 'sin_cotizar') return base.filter((s) => !s.tiene_cotizacion);
        if (kpiActivo === 'esperando_cliente') return base.filter((s) => ['cotizacion_aprobacion', 'cotizado', 'requiere_aprobacion_cliente'].includes(s.estado));
        if (kpiActivo === 'sin_asignar') return base.filter((s) => !s.tiene_responsable);
        return base;
    }, [listasBasePorPestana, tabLista, kpiActivo]);

    const toggleTarjetaKpi = (claveKpi, pestanaDestino) => {
        if (kpiActivo === claveKpi) {
            setKpiActivo('');
        } else {
            setTabLista(pestanaDestino);
            setKpiActivo(claveKpi);
        }
    };

    // Abrir modal de Cotización o Re-cotización
    const abrirCotizacion = async (pedidoId, esRecotizacion = false) => {
        let info = detalle;
        if (!info || info.pedido.pedido_id !== pedidoId) {
            const { data } = await solicitudService.obtenerDetalle(pedidoId);
            info = data;
        }
        const ultima = info.cotizaciones?.[0];
        setModalCotizacion({
            pedido: info.pedido,
            esRecotizacion: Boolean(ultima) || esRecotizacion,
            versionActual: ultima ? ultima.numero_version : 0,
            items: info.items.map((it) => ({
                detalle_id: it.detalle_id,
                prenda_nombre: it.prenda_nombre,
                cantidad: it.cantidad,
                talla: it.talla || 'M',
                descripcion: it.descripcion || '',
                costo_materiales: Number(it.costo_materiales || 0),
                costo_mano_obra: Number(it.costo_mano_obra || 0),
                subtotal: Number(it.subtotal || 0)
            })),
            costos_adicionales: Number(ultima?.costos_adicionales || 0),
            anticipo_minimo: Number(ultima?.anticipo_minimo || info.pedido.anticipo_minimo || 0),
            tiempo_estimado_dias: Number(ultima?.tiempo_estimado_dias || info.pedido.tiempo_estimado_dias || 5),
            observaciones_cliente: ultima?.observaciones_cliente || info.pedido.notas_cotizacion || '',
            motivo_cambio: '',
            detalle_motivo: ''
        });
    };

    const handleGuardarCotizacion = async (e) => {
        e.preventDefault();
        if (!modalCotizacion) return;
        setGuardandoCot(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            await solicitudService.guardarCotizacion(modalCotizacion.pedido.pedido_id, {
                items: modalCotizacion.items,
                costos_adicionales: Number(modalCotizacion.costos_adicionales || 0),
                anticipo_minimo: Number(modalCotizacion.anticipo_minimo || 0),
                tiempo_estimado_dias: Number(modalCotizacion.tiempo_estimado_dias || 5),
                observaciones_cliente: modalCotizacion.observaciones_cliente,
                motivo_cambio: modalCotizacion.esRecotizacion ? modalCotizacion.motivo_cambio : null,
                detalle_motivo: modalCotizacion.detalle_motivo
            });
            setMensaje({ tipo: 'exito', texto: 'Cotización guardada y enviada al cliente para aprobación.' });
            const pId = modalCotizacion.pedido.pedido_id;
            setModalCotizacion(null);
            await cargarSolicitudes();
            if (pedidoSeleccionadoId === pId) await cargarDetalle(pId);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar la cotización.' });
        } finally {
            setGuardandoCot(false);
        }
    };

    // Asignar operario directamente a una prenda
    const handleAsignarPrendaDirecto = async (detalleId, nuevoResponsableId, yaTeniaResponsable) => {
        if (!nuevoResponsableId || !detalle) return;
        let motivo = '';
        if (yaTeniaResponsable) {
            motivo = window.prompt('Esta prenda ya tiene un responsable asignado. Indica el motivo del cambio:');
            if (!motivo || !motivo.trim()) return;
        }
        try {
            await solicitudService.ejecutarAccion(detalle.pedido.pedido_id, {
                accion: 'asignar_prenda_directo',
                detalle_id: detalleId,
                responsable_id: Number(nuevoResponsableId),
                motivo
            });
            setMensaje({ tipo: 'exito', texto: 'Responsable asignado a la prenda y carga actualizada.' });
            await cargarDetalle(detalle.pedido.pedido_id);
            await cargarBalance();
            await cargarSolicitudes();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo asignar el responsable.' });
        }
    };

    // Abrir Distribuidor de Tareas por Prenda
    const abrirDistribuidorPrenda = async (detalleId) => {
        await cargarBalance();
        setAdvertenciaDuplicado('');
        setModalDistribuidor({ detalleId });
    };

    const handleCrearTarea = async (e, forzarDuplicado = false) => {
        if (e) e.preventDefault();
        if (!detalle || !modalDistribuidor) return;
        try {
            await solicitudService.crearTareaPrenda(detalle.pedido.pedido_id, modalDistribuidor.detalleId, {
                ...formTarea,
                confirmar_duplicado: forzarDuplicado
            });
            setFormTarea({
                nombre: '',
                parte_prenda: 'Cuerpo / Torso',
                descripcion: '',
                responsable_id: '',
                complejidad: 'media',
                horas_estimadas: 2,
                prioridad: 'normal',
                fecha_inicio_prevista: '',
                fecha_limite: '',
                dependencia_tarea_id: '',
                observaciones: ''
            });
            setAdvertenciaDuplicado('');
            setMensaje({ tipo: 'exito', texto: 'Tarea agregada a la prenda y balance actualizado.' });
            await cargarDetalle(detalle.pedido.pedido_id);
            await cargarBalance();
            await cargarSolicitudes();
        } catch (err) {
            if (err.response?.status === 409 && err.response?.data?.advertencia_duplicado) {
                setAdvertenciaDuplicado(err.response.data.mensaje);
            } else {
                setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al crear la tarea.' });
            }
        }
    };

    const handleReasignarTarea = async (tareaId, nuevoResponsableId, yaTeniaResponsable) => {
        if (!nuevoResponsableId) return;
        let motivo = '';
        if (yaTeniaResponsable) {
            motivo = window.prompt('Esta tarea ya tiene responsable. Indica el motivo del cambio:');
            if (!motivo || !motivo.trim()) return;
        }
        try {
            await solicitudService.reasignarTarea(tareaId, {
                nuevo_responsable_id: Number(nuevoResponsableId),
                motivo
            });
            setMensaje({ tipo: 'exito', texto: 'Responsable actualizado y registrado en auditoría.' });
            await cargarDetalle(detalle.pedido.pedido_id);
            await cargarBalance();
            await cargarSolicitudes();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al asignar responsable.' });
        }
    };

    const handleCambiarPrioridad = async (pedidoId, nuevaPrioridad) => {
        try {
            await solicitudService.ejecutarAccion(pedidoId, {
                accion: 'cambiar_prioridad',
                prioridad: nuevaPrioridad
            });
            setMenuMasId(null);
            await cargarSolicitudes();
            if (pedidoSeleccionadoId === pedidoId) await cargarDetalle(pedidoId);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo cambiar la prioridad.' });
        }
    };

    const handleConfirmarRechazo = async (e) => {
        e.preventDefault();
        try {
            await solicitudService.ejecutarAccion(modalRechazo.pedidoId, {
                accion: 'rechazar',
                motivo: modalRechazo.motivo,
                observaciones: modalRechazo.observaciones
            });
            setMensaje({ tipo: 'exito', texto: `Solicitud #${modalRechazo.pedidoId} rechazada y movida al historial.` });
            setModalRechazo({ abierto: false, pedidoId: null, cliente: '', motivo: '', observaciones: '' });
            if (pedidoSeleccionadoId === modalRechazo.pedidoId) setPedidoSeleccionadoId(null);
            await cargarSolicitudes();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al rechazar solicitud.' });
        }
    };

    const handleEnviarProduccion = async (pedidoId) => {
        try {
            await solicitudService.ejecutarAccion(pedidoId, { accion: 'enviar_a_produccion' });
            setMensaje({ tipo: 'exito', texto: 'Solicitud validada y enviada a la Agenda de Producción.' });
            await cargarSolicitudes();
            await cargarDetalle(pedidoId);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Faltan requisitos para iniciar producción.' });
        }
    };

    const totalModalCot = modalCotizacion
        ? modalCotizacion.items.reduce((acc, it) => acc + Number(it.subtotal || 0), 0) + Number(modalCotizacion.costos_adicionales || 0)
        : 0;

    return (
        <div className="space-y-4">
            {/* 2.1 ENCABEZADO SUPERIOR */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Gestión de solicitudes</h2>
                    <p className="text-xs text-slate-500">
                        Revisa solicitudes, gestiona cotizaciones, verifica abonos y asigna el trabajo del taller
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Pedido #, cliente, teléfono o prenda..."
                            className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 w-64 focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => setMostrarFiltros((v) => !v)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold ${
                            mostrarFiltros ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <Filter className="w-3.5 h-3.5" /> Filtros
                    </button>

                    <button
                        type="button"
                        onClick={() => { cargarBalance(); setModalBalance(true); }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                    >
                        <BarChart3 className="w-3.5 h-3.5 text-blue-600" /> Balance de carga
                    </button>

                    <button
                        type="button"
                        onClick={() => { cargarSolicitudes(); cargarBalance(); }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                        title="Actualizar solicitudes"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                </div>
            </div>

            {/* 2.2 TARJETAS KPI INTERACTIVAS (Los números permanecen estables; al hacer clic filtran sin borrar los demás contadores) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                    type="button"
                    onClick={() => toggleTarjetaKpi('nuevas', 'por_atender')}
                    className={`text-left p-3.5 rounded-xl bg-white border transition shadow-sm ${
                        kpiActivo === 'nuevas' ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-400'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Nuevas / Pendientes revisión</span>
                    <span className="text-2xl font-extrabold text-blue-600">{kpis.nuevas_revision}</span>
                </button>
                <button
                    type="button"
                    onClick={() => toggleTarjetaKpi('sin_cotizar', 'por_atender')}
                    className={`text-left p-3.5 rounded-xl bg-white border transition shadow-sm ${
                        kpiActivo === 'sin_cotizar' ? 'border-amber-600 ring-2 ring-amber-100' : 'border-slate-200 hover:border-amber-400'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Pendientes de cotización</span>
                    <span className="text-2xl font-extrabold text-amber-600">{kpis.pendientes_cotizacion}</span>
                </button>
                <button
                    type="button"
                    onClick={() => toggleTarjetaKpi('esperando_cliente', 'por_atender')}
                    className={`text-left p-3.5 rounded-xl bg-white border transition shadow-sm ${
                        kpiActivo === 'esperando_cliente' ? 'border-slate-700 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-400'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Esperando respuesta cliente</span>
                    <span className="text-2xl font-extrabold text-slate-800">{kpis.esperando_cliente}</span>
                </button>
                <button
                    type="button"
                    onClick={() => toggleTarjetaKpi('sin_asignar', 'aprobadas')}
                    className={`text-left p-3.5 rounded-xl bg-white border transition shadow-sm ${
                        kpiActivo === 'sin_asignar' ? 'border-emerald-600 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-400'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Aprobadas sin asignar</span>
                    <span className="text-2xl font-extrabold text-emerald-600">{kpis.aprobadas_sin_asignar}</span>
                </button>
            </div>

            {/* Indicador de filtro KPI activo */}
            {kpiActivo && (
                <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800">
                    <span>
                        Filtro rápido activo: <strong>
                            {kpiActivo === 'nuevas' && 'Nuevas / Pendientes de revisión'}
                            {kpiActivo === 'sin_cotizar' && 'Pendientes de cotización'}
                            {kpiActivo === 'esperando_cliente' && 'Esperando respuesta del cliente'}
                            {kpiActivo === 'sin_asignar' && 'Aprobadas sin responsable asignado'}
                        </strong>
                    </span>
                    <button type="button" onClick={() => setKpiActivo('')} className="font-bold hover:underline">
                        Mostrar todas
                    </button>
                </div>
            )}

            {/* 2.6 BARRA DE FILTROS COMBINABLES */}
            {mostrarFiltros && (
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 text-xs">
                    <select
                        value={filtros.prioridad}
                        onChange={(e) => setFiltros({ ...filtros, prioridad: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                        <option value="">Todas las prioridades</option>
                        <option value="alta">Prioridad alta</option>
                        <option value="normal">Prioridad normal</option>
                        <option value="baja">Prioridad baja</option>
                    </select>

                    <select
                        value={filtros.sin_cotizar}
                        onChange={(e) => setFiltros({ ...filtros, sin_cotizar: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                        <option value="">Estado cotización: Todos</option>
                        <option value="1">Sin cotizar</option>
                    </select>

                    <select
                        value={filtros.sin_medidas}
                        onChange={(e) => setFiltros({ ...filtros, sin_medidas: e.target.value })}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                    >
                        <option value="">Medidas: Todas</option>
                        <option value="1">Con medidas pendientes</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => {
                            setBusqueda('');
                            setKpiActivo('');
                            setFiltros({ prioridad: '', sin_medidas: '', sin_cotizar: '' });
                        }}
                        className="ml-auto text-blue-600 font-semibold hover:underline"
                    >
                        Limpiar filtros
                    </button>
                </div>
            )}

            {mensaje.texto && (
                <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                    mensaje.tipo === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                    <span>{mensaje.texto}</span>
                    <button type="button" onClick={() => setMensaje({ tipo: '', texto: '' })}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* 2.3 ÁREA PRINCIPAL DE DOS COLUMNAS (MAESTRO-DETALLE) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* COLUMNA IZQUIERDA: PESTAÑAS Y TARJETAS DE SOLICITUDES */}
                <div className={`lg:col-span-5 space-y-3 ${pedidoSeleccionadoId ? 'hidden lg:block' : 'block'}`}>
                    <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
                        {[
                            { id: 'por_atender', label: `Por atender (${listasBasePorPestana.por_atender.length})` },
                            { id: 'aprobadas', label: `Aprobadas (${listasBasePorPestana.aprobadas.length})` },
                            { id: 'historial', label: `Historial (${listasBasePorPestana.canceladas.length + listasBasePorPestana.rechazadas.length})` }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => { setTabLista(tab.id); setKpiActivo(''); }}
                                className={`flex-1 py-2 px-2.5 rounded-lg text-xs font-bold transition ${
                                    tabLista === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* PESTAÑA HISTORIAL */}
                    {tabLista === 'historial' ? (
                        <div className="space-y-3">
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setHistorialDesplegado((p) => ({ ...p, canceladas: !p.canceladas }))}
                                    className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100"
                                >
                                    <span>Canceladas por el cliente ({listasBasePorPestana.canceladas.length})</span>
                                    {historialDesplegado.canceladas ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                {historialDesplegado.canceladas && (
                                    <div className="divide-y divide-slate-100">
                                        {listasBasePorPestana.canceladas.length === 0 ? (
                                            <p className="p-4 text-xs text-slate-400">Sin solicitudes canceladas.</p>
                                        ) : (
                                            listasBasePorPestana.canceladas.map((sol) => (
                                                <div
                                                    key={sol.pedido_id}
                                                    onClick={() => setPedidoSeleccionadoId(sol.pedido_id)}
                                                    className="p-3 text-xs cursor-pointer hover:bg-slate-50 flex justify-between items-center"
                                                >
                                                    <div>
                                                        <p className="font-bold text-slate-800">#{sol.pedido_id} · {sol.cliente_nombre}</p>
                                                        <p className="text-slate-500">{sol.prendas_resumen}</p>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold text-[10px]">
                                                        Solo consulta
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setHistorialDesplegado((p) => ({ ...p, rechazadas: !p.rechazadas }))}
                                    className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100"
                                >
                                    <span>Rechazadas por el taller ({listasBasePorPestana.rechazadas.length})</span>
                                    {historialDesplegado.rechazadas ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                {historialDesplegado.rechazadas && (
                                    <div className="divide-y divide-slate-100">
                                        {listasBasePorPestana.rechazadas.length === 0 ? (
                                            <p className="p-4 text-xs text-slate-400">Sin solicitudes rechazadas.</p>
                                        ) : (
                                            listasBasePorPestana.rechazadas.map((sol) => (
                                                <div
                                                    key={sol.pedido_id}
                                                    onClick={() => setPedidoSeleccionadoId(sol.pedido_id)}
                                                    className="p-3 text-xs cursor-pointer hover:bg-slate-50 flex justify-between items-center"
                                                >
                                                    <div>
                                                        <p className="font-bold text-slate-800">#{sol.pedido_id} · {sol.cliente_nombre}</p>
                                                        <p className="text-slate-500 line-clamp-1">Motivo: {sol.motivo_rechazo || 'Sin detalle'}</p>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold text-[10px]">
                                                        Rechazada
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* LISTADO DE SOLICITUDES */
                        <div className="space-y-2.5 max-h-[75vh] overflow-y-auto pr-1">
                            {listaVisibleActual.length === 0 ? (
                                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
                                    No hay solicitudes que coincidan con esta vista.
                                </div>
                            ) : (
                                listaVisibleActual.map((sol) => {
                                    const seleccionada = pedidoSeleccionadoId === sol.pedido_id;
                                    return (
                                        <div
                                            key={sol.pedido_id}
                                            onClick={() => setPedidoSeleccionadoId(sol.pedido_id)}
                                            className={`bg-white p-3.5 rounded-xl border transition cursor-pointer relative ${
                                                seleccionada
                                                    ? 'border-blue-600 ring-2 ring-blue-100'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-extrabold text-sm text-slate-900">#{sol.pedido_id}</span>
                                                    {sol.prioridad === 'alta' && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                                                            <AlertTriangle className="w-3 h-3" /> Prioridad alta
                                                        </span>
                                                    )}
                                                    {sol.es_nueva && (
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                                                            Por revisar
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] text-slate-400">
                                                    {new Date(sol.fecha_solicitud).toLocaleDateString('es-CO')}
                                                </span>
                                            </div>

                                            <p className="text-xs font-bold text-slate-800">{sol.cliente_nombre}</p>
                                            <p className="text-xs text-slate-500 line-clamp-1 mb-2">{sol.prendas_resumen || 'Prenda personalizada'}</p>

                                            {/* Indicadores operativos y financieros */}
                                            <div className="flex flex-wrap gap-1.5 mb-3 text-[10px] font-semibold">
                                                <span className={`px-2 py-0.5 rounded ${
                                                    sol.tiene_cotizacion ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                                                }`}>
                                                    {sol.tiene_cotizacion
                                                        ? `Cotizada v${sol.total_versiones_cotizacion || 1} ($${Number(sol.costo_total || 0).toLocaleString('es-CO')})`
                                                        : 'Sin cotizar'}
                                                </span>

                                                {sol.total_abonado > 0 && (
                                                    <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800">
                                                        Abonado: ${Number(sol.total_abonado).toLocaleString('es-CO')}
                                                    </span>
                                                )}

                                                {sol.faltan_medidas && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-100 text-orange-800">
                                                        <Ruler className="w-3 h-3" /> Faltan medidas
                                                    </span>
                                                )}

                                                <span className={`px-2 py-0.5 rounded ${
                                                    sol.responsables_resumen ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                    {sol.responsables_resumen ? `Operario: ${sol.responsables_resumen}` : 'Sin operario asignado'}
                                                </span>
                                            </div>

                                            {/* Acciones directas */}
                                            <div
                                                className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => setPedidoSeleccionadoId(sol.pedido_id)}
                                                    className="px-2.5 py-1 rounded-lg border border-slate-300 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                    Gestionar
                                                </button>

                                                {puedeCotizarYAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirCotizacion(sol.pedido_id, sol.tiene_cotizacion)}
                                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                                            sol.tiene_cotizacion
                                                                ? 'bg-slate-800 text-white hover:bg-slate-900'
                                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                                        }`}
                                                    >
                                                        {sol.tiene_cotizacion ? 'Re-cotizar' : 'Cotizar'}
                                                    </button>
                                                )}

                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMenuMasId(menuMasId === sol.pedido_id ? null : sol.pedido_id)}
                                                        className="p-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                                                    >
                                                        <MoreVertical className="w-3.5 h-3.5" />
                                                    </button>
                                                    {menuMasId === sol.pedido_id && (
                                                        <div className="absolute right-0 bottom-8 z-20 w-44 bg-white rounded-xl border border-slate-200 shadow-lg py-1 text-xs">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCambiarPrioridad(sol.pedido_id, sol.prioridad === 'alta' ? 'normal' : 'alta')}
                                                                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700"
                                                            >
                                                                {sol.prioridad === 'alta' ? 'Cambiar a prioridad normal' : 'Marcar prioridad alta'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setPedidoSeleccionadoId(sol.pedido_id); setTabDetalle('historial'); setMenuMasId(null); }}
                                                                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700"
                                                            >
                                                                Consultar historial
                                                            </button>
                                                            {puedeCotizarYAdmin && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setModalRechazo({
                                                                            abierto: true,
                                                                            pedidoId: sol.pedido_id,
                                                                            cliente: sol.cliente_nombre,
                                                                            motivo: '',
                                                                            observaciones: ''
                                                                        });
                                                                        setMenuMasId(null);
                                                                    }}
                                                                    className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 font-semibold"
                                                                >
                                                                    Rechazar solicitud
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                {/* COLUMNA DERECHA: PANEL LATERAL DE DETALLE PERSISTENTE */}
                <div className={`lg:col-span-7 ${pedidoSeleccionadoId ? 'block' : 'hidden lg:block'}`}>
                    {!detalle ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 space-y-2">
                            <FileText className="w-8 h-8 mx-auto text-slate-300" />
                            <p className="text-sm font-semibold text-slate-600">Selecciona una solicitud del listado</p>
                            <p className="text-xs">Aquí podrás cotizar, revisar medidas, verificar abonos y asignar operarios o tareas.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            {/* Cabecera del detalle */}
                            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setPedidoSeleccionadoId(null)}
                                        className="lg:hidden p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-bold text-slate-900">Solicitud #{detalle.pedido.pedido_id}</h3>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-bold uppercase">
                                                {detalle.pedido.estado.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            Cliente: <strong>{detalle.pedido.cliente_nombre}</strong> · Tel: {detalle.pedido.cliente_telefono || 'N/A'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {puedeCotizarYAdmin && !['cancelado', 'rechazado'].includes(detalle.pedido.estado) && (
                                        <button
                                            type="button"
                                            onClick={() => abrirCotizacion(detalle.pedido.pedido_id, detalle.cotizaciones.length > 0)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                        >
                                            <Calculator className="w-3.5 h-3.5" />
                                            {detalle.cotizaciones.length > 0 ? 'Re-cotizar' : 'Cotizar solicitud'}
                                        </button>
                                    )}

                                    {['preparacion_materiales', 'corte', 'confeccion', 'en_produccion', 'control_calidad_pruebas', 'lista_entrega'].includes(detalle.pedido.estado) ? (
                                        <button
                                            type="button"
                                            onClick={() => navigate('/taller/produccion')}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" /> Ver en Agenda
                                        </button>
                                    ) : (
                                        puedeCotizarYAdmin && !['cancelado', 'rechazado'].includes(detalle.pedido.estado) && (
                                            <button
                                                type="button"
                                                onClick={() => handleEnviarProduccion(detalle.pedido.pedido_id)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Enviar a Producción
                                            </button>
                                        )
                                    )}
                                </div>
                            </div>

                            {/* Checklist de estado operativo del pedido */}
                            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 text-[11px] font-semibold">
                                <span className={`px-2 py-0.5 rounded-full ${detalle.requisitosProduccion?.cotizacion_aprobada ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {detalle.requisitosProduccion?.cotizacion_aprobada ? '✓ Cotización aprobada' : '• Pendiente aprobación cliente'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full ${detalle.requisitosProduccion?.medidas_ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                    {detalle.requisitosProduccion?.medidas_ok ? '✓ Medidas listas' : '⚠ Faltan medidas'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full ${detalle.requisitosProduccion?.asignacion_ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                                    {detalle.requisitosProduccion?.asignacion_ok ? '✓ Operario asignado' : '• Sin operario asignado'}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full ${detalle.resumenFinanciero?.anticipo_cubierto ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {detalle.resumenFinanciero?.anticipo_cubierto
                                        ? `✓ Anticipo OK ($${Number(detalle.resumenFinanciero?.total_abonado || 0).toLocaleString('es-CO')})`
                                        : `• Anticipo pendiente ($${Number(detalle.resumenFinanciero?.anticipo_minimo || 0).toLocaleString('es-CO')})`}
                                </span>
                            </div>

                            {/* Pestañas del panel derecho */}
                            <div className="flex border-b border-slate-200 px-4 bg-white overflow-x-auto">
                                {[
                                    { id: 'informacion', label: 'Prendas y Asignación', icon: Shirt },
                                    { id: 'medidas', label: `Medidas (${detalle.mediciones.length})`, icon: Ruler },
                                    { id: 'cotizaciones', label: `Cotizaciones (${detalle.cotizaciones.length})`, icon: Calculator },
                                    { id: 'pagos', label: `Pagos y Abonos (${detalle.pagos?.length || 0})`, icon: Wallet },
                                    { id: 'historial', label: `Historial (${detalle.historial.length})`, icon: History }
                                ].map((t) => {
                                    const Icon = t.icon;
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setTabDetalle(t.id)}
                                            className={`inline-flex items-center gap-1.5 px-3.5 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
                                                tabDetalle === t.id
                                                    ? 'border-blue-600 text-blue-600'
                                                    : 'border-transparent text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            <Icon className="w-3.5 h-3.5" /> {t.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* CONTENIDO PESTAÑAS DEL PANEL DERECHO */}
                            <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
                                {/* 4.1 PESTAÑA INFORMACIÓN (Prendas + Asignación directa de operario + Distribuir tareas) */}
                                {tabDetalle === 'informacion' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                            <div>
                                                <span className="text-slate-400 block">Recepción</span>
                                                <strong>{new Date(detalle.pedido.fecha_solicitud).toLocaleString('es-CO')}</strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block">Correo cliente</span>
                                                <strong className="break-all">{detalle.pedido.cliente_email}</strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block">Total / Saldo</span>
                                                <strong>
                                                    ${Number(detalle.resumenFinanciero?.costo_total || 0).toLocaleString('es-CO')}
                                                    {' · '}
                                                    <span className="text-rose-600">
                                                        Debe ${Number(detalle.resumenFinanciero?.saldo_pendiente || 0).toLocaleString('es-CO')}
                                                    </span>
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold uppercase text-slate-500">
                                                Prendas solicitadas ({detalle.items.length})
                                            </h4>
                                            {detalle.items.map((item) => {
                                                const tareasPrenda = detalle.tareas.filter((t) => t.detalle_id === item.detalle_id && t.estado !== 'cancelada');
                                                return (
                                                    <div key={item.detalle_id} className="p-3.5 rounded-xl border border-slate-200 space-y-3">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div className="flex gap-3">
                                                                {item.imagen_ruta && (
                                                                    <img
                                                                        src={`${API_BASE_URL}${item.imagen_ruta.startsWith('/') ? '' : '/'}${item.imagen_ruta}`}
                                                                        alt={item.prenda_nombre}
                                                                        className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                                                                    />
                                                                )}
                                                                <div>
                                                                    <p className="text-sm font-bold text-slate-900">
                                                                        {item.prenda_nombre} (x{item.cantidad})
                                                                    </p>
                                                                    <p className="text-xs text-slate-500">
                                                                        Talla: <strong>{item.talla || 'A medida'}</strong> · {Number(item.es_personalizada) === 1 ? 'Confección a medida' : 'Catálogo'}
                                                                    </p>
                                                                    <p className="text-xs text-slate-600 mt-1">{item.descripcion || 'Sin especificaciones adicionales.'}</p>
                                                                </div>
                                                            </div>

                                                            {puedeAsignar && !['cancelado', 'rechazado'].includes(detalle.pedido.estado) && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => abrirDistribuidorPrenda(item.detalle_id)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0"
                                                                >
                                                                    <Layers className="w-3.5 h-3.5" /> Dividir tareas ({tareasPrenda.length})
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Asignación directa de responsable a la prenda */}
                                                        {puedeAsignar && !['cancelado', 'rechazado'].includes(detalle.pedido.estado) && (
                                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-xs">
                                                                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                                                                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                                                                    Operario / Sastre responsable:
                                                                </span>
                                                                <select
                                                                    value={item.asignado_a || ''}
                                                                    onChange={(e) => handleAsignarPrendaDirecto(item.detalle_id, e.target.value, Boolean(item.asignado_a))}
                                                                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 min-w-[220px]"
                                                                >
                                                                    <option value="">Seleccionar operario...</option>
                                                                    {balanceCarga.map((op) => (
                                                                        <option key={op.usuario_id} value={op.usuario_id}>
                                                                            {op.nombre} ({op.porcentaje_carga}% carga · {op.horas_restantes}h disp.)
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}

                                                        {/* Resumen de tareas asignadas a esta prenda */}
                                                        {tareasPrenda.length > 0 && (
                                                            <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5 text-xs">
                                                                <p className="font-bold text-slate-700">Tareas definidas en esta prenda:</p>
                                                                {tareasPrenda.map((t) => (
                                                                    <div key={t.tarea_id} className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1.5 rounded border border-slate-200">
                                                                        <span>
                                                                            <strong>{t.parte_prenda}:</strong> {t.nombre} ({t.horas_estimadas}h)
                                                                        </span>
                                                                        <span className="font-semibold text-blue-700">
                                                                            {t.responsable_nombre || 'Sin asignar'}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 4.2 PESTAÑA MEDIDAS */}
                                {tabDetalle === 'medidas' && (
                                    <div className="space-y-4">
                                        {!detalle.requisitosProduccion.medidas_ok ? (
                                            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-bold">Faltan medidas validadas del cliente para confeccionar.</p>
                                                    <p className="mt-0.5">El pedido incluye prendas a medida y el cliente aún no tiene mediciones registradas en su expediente.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
                                                Medidas disponibles y validadas para las prendas solicitadas.
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/taller/clientes/${detalle.pedido.cliente_id}`)}
                                                className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                            >
                                                Abrir Expediente / Registrar medidas del cliente
                                            </button>
                                        </div>

                                        {detalle.mediciones.length > 0 && (
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-bold uppercase text-slate-500">Historial de mediciones del cliente</h4>
                                                {detalle.mediciones.map((m) => {
                                                    const vals = typeof m.valores_json === 'string' ? JSON.parse(m.valores_json) : m.valores_json;
                                                    return (
                                                        <div key={m.medida_id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
                                                            <p className="font-bold text-slate-800">
                                                                Toma del {new Date(m.fecha_medicion).toLocaleDateString('es-CO')} ({m.unidad || 'cm'})
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {Object.entries(vals || {})
                                                                    .filter(([k, v]) => v !== null && v !== '' && !['medida_id', 'usuario_id', 'cliente_id', 'taller_id', 'fecha_actualizacion', 'fecha_creacion'].includes(k))
                                                                    .map(([k, v]) => (
                                                                        <span key={k} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                                                            {k.replace(/_/g, ' ')}: <strong>{v}</strong>
                                                                        </span>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 4.3 PESTAÑA COTIZACIONES */}
                                {tabDetalle === 'cotizaciones' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold uppercase text-slate-500">Versiones de Cotización</h4>
                                            {puedeCotizarYAdmin && !['cancelado', 'rechazado'].includes(detalle.pedido.estado) && (
                                                <button
                                                    type="button"
                                                    onClick={() => abrirCotizacion(detalle.pedido.pedido_id, detalle.cotizaciones.length > 0)}
                                                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                                >
                                                    {detalle.cotizaciones.length > 0 ? 'Re-cotizar (Nueva versión)' : 'Crear cotización'}
                                                </button>
                                            )}
                                        </div>

                                        {detalle.cotizaciones.length === 0 ? (
                                            <div className="p-6 rounded-xl border border-dashed border-slate-300 text-center space-y-2">
                                                <p className="text-xs text-slate-500">Aún no se ha generado ninguna cotización para esta solicitud.</p>
                                                {puedeCotizarYAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirCotizacion(detalle.pedido.pedido_id, false)}
                                                        className="px-3.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                                    >
                                                        Cotizar ahora
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {detalle.cotizaciones.map((v, index) => {
                                                    const anterior = detalle.cotizaciones[index + 1];
                                                    const diff = anterior ? Number(v.valor_total) - Number(anterior.valor_total) : null;
                                                    return (
                                                        <div
                                                            key={v.version_id}
                                                            className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                                                                v.estado === 'vigente' ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200 bg-slate-50/50 opacity-80'
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-extrabold text-slate-900">
                                                                    Versión v{v.numero_version} · ${Number(v.valor_total).toLocaleString('es-CO')}
                                                                    {diff !== null && (
                                                                        <span className={`ml-2 text-[11px] ${diff >= 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                                                            ({diff >= 0 ? '+' : ''}${diff.toLocaleString('es-CO')})
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                                                                    v.estado === 'vigente' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                                                }`}>
                                                                    {v.estado}
                                                                </span>
                                                            </div>
                                                            <p className="text-slate-600">
                                                                Materiales: ${Number(v.costo_materiales).toLocaleString('es-CO')} · Mano de obra: ${Number(v.costo_mano_obra).toLocaleString('es-CO')} · Anticipo mín: ${Number(v.anticipo_minimo || 0).toLocaleString('es-CO')} · Tiempo: {v.tiempo_estimado_dias} días
                                                            </p>
                                                            {v.motivo_cambio && (
                                                                <p className="text-slate-700"><strong>Motivo:</strong> {v.motivo_cambio} {v.detalle_motivo ? `(${v.detalle_motivo})` : ''}</p>
                                                            )}
                                                            <p className="text-[11px] text-slate-400">
                                                                Creada por {v.creador_nombre} el {new Date(v.creado_en).toLocaleString('es-CO')}
                                                            </p>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 4.4 PESTAÑA PAGOS Y ABONOS REALES */}
                                {tabDetalle === 'pagos' && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                                                <span className="text-slate-400 block">Valor Cotizado</span>
                                                <strong className="text-sm text-slate-900">
                                                    ${Number(detalle.resumenFinanciero?.costo_total || 0).toLocaleString('es-CO')}
                                                </strong>
                                            </div>
                                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                                                <span className="text-slate-400 block">Anticipo Mínimo</span>
                                                <strong className="text-sm text-slate-900">
                                                    ${Number(detalle.resumenFinanciero?.anticipo_minimo || 0).toLocaleString('es-CO')}
                                                </strong>
                                            </div>
                                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                                                <span className="text-emerald-700 block">Abonado Aprobado</span>
                                                <strong className="text-sm text-emerald-800">
                                                    ${Number(detalle.resumenFinanciero?.total_abonado || 0).toLocaleString('es-CO')}
                                                </strong>
                                            </div>
                                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                                                <span className="text-rose-700 block">Saldo Pendiente</span>
                                                <strong className="text-sm text-rose-800">
                                                    ${Number(detalle.resumenFinanciero?.saldo_pendiente || 0).toLocaleString('es-CO')}
                                                </strong>
                                            </div>
                                        </div>

                                        {(!detalle.pagos || detalle.pagos.length === 0) ? (
                                            <p className="text-xs text-slate-500">El cliente aún no ha registrado pagos ni abonos para este pedido.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {detalle.pagos.map((pg) => (
                                                    <div key={pg.pago_id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                                                        <div>
                                                            <p className="font-bold text-slate-900">
                                                                Abono #{pg.pago_id} · ${Number(pg.monto).toLocaleString('es-CO')}
                                                            </p>
                                                            <p className="text-slate-500">
                                                                Método: {pg.metodo_pago || 'Transferencia'} · Fecha: {new Date(pg.fecha_pago).toLocaleString('es-CO')}
                                                            </p>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                                                            pg.estado === 'aprobado' ? 'bg-emerald-100 text-emerald-800' :
                                                            pg.estado === 'rechazado' ? 'bg-rose-100 text-rose-800' :
                                                            'bg-amber-100 text-amber-800'
                                                        }`}>
                                                            {pg.estado}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 4.5 PESTAÑA HISTORIAL CRONOLÓGICO */}
                                {tabDetalle === 'historial' && (
                                    <div className="space-y-2.5">
                                        {detalle.historial.length === 0 ? (
                                            <p className="text-xs text-slate-500">Sin movimientos registrados todavía.</p>
                                        ) : (
                                            detalle.historial.map((h) => (
                                                <div key={h.historial_id} className="p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-bold text-slate-800 uppercase text-[10px] px-2 py-0.5 rounded bg-slate-100">
                                                            {h.tipo_accion.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="text-[11px] text-slate-400">
                                                            {new Date(h.creado_en).toLocaleString('es-CO')}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-800">{h.descripcion}</p>
                                                    {h.motivo && <p className="text-slate-600"><strong>Motivo:</strong> {h.motivo}</p>}
                                                    <p className="text-[11px] text-slate-500">Responsable: {h.usuario_nombre}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL 1: CREACIÓN / RE-COTIZACIÓN CON VERSIONADO */}
            {modalCotizacion && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <form onSubmit={handleGuardarCotizacion} className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">
                                    {modalCotizacion.esRecotizacion
                                        ? `Re-cotizar Solicitud #${modalCotizacion.pedido.pedido_id} (Generará v${modalCotizacion.versionActual + 1})`
                                        : `Nueva Cotización — Solicitud #${modalCotizacion.pedido.pedido_id}`}
                                </h3>
                                <p className="text-xs text-slate-500">Cliente: {modalCotizacion.pedido.cliente_nombre}</p>
                            </div>
                            <button type="button" onClick={() => setModalCotizacion(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>

                        {modalCotizacion.esRecotizacion && (
                            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5">
                                <label className="block text-xs font-bold text-amber-900">Motivo obligatorio de la nueva versión *</label>
                                <select
                                    required
                                    value={modalCotizacion.motivo_cambio}
                                    onChange={(e) => setModalCotizacion({ ...modalCotizacion, motivo_cambio: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs"
                                >
                                    <option value="">Selecciona un motivo...</option>
                                    {MOTIVOS_RECOTIZACION.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                                {modalCotizacion.motivo_cambio === 'Otro motivo' && (
                                    <input
                                        type="text"
                                        required
                                        placeholder="Describe el motivo del cambio..."
                                        value={modalCotizacion.detalle_motivo}
                                        onChange={(e) => setModalCotizacion({ ...modalCotizacion, detalle_motivo: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs"
                                    />
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            {modalCotizacion.items.map((it, idx) => (
                                <div key={it.detalle_id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                                    <p className="text-xs font-bold text-slate-900">{it.prenda_nombre} (x{it.cantidad})</p>
                                    <div className="grid grid-cols-3 gap-2.5 text-xs">
                                        <div>
                                            <label className="block text-[11px] text-slate-600 mb-1">Materiales ($)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={it.costo_materiales}
                                                onChange={(e) => {
                                                    const mat = Number(e.target.value || 0);
                                                    const items = [...modalCotizacion.items];
                                                    items[idx] = { ...it, costo_materiales: mat, subtotal: mat + Number(it.costo_mano_obra || 0) };
                                                    setModalCotizacion({ ...modalCotizacion, items });
                                                }}
                                                className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] text-slate-600 mb-1">Mano de Obra ($)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                value={it.costo_mano_obra}
                                                onChange={(e) => {
                                                    const mo = Number(e.target.value || 0);
                                                    const items = [...modalCotizacion.items];
                                                    items[idx] = { ...it, costo_mano_obra: mo, subtotal: Number(it.costo_materiales || 0) + mo };
                                                    setModalCotizacion({ ...modalCotizacion, items });
                                                }}
                                                className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-blue-800 mb-1">Subtotal ($)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                required
                                                value={it.subtotal}
                                                onChange={(e) => {
                                                    const items = [...modalCotizacion.items];
                                                    items[idx] = { ...it, subtotal: Number(e.target.value || 0) };
                                                    setModalCotizacion({ ...modalCotizacion, items });
                                                }}
                                                className="w-full px-2.5 py-1.5 rounded border border-blue-400 bg-white font-bold"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Costos adicionales ($)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={modalCotizacion.costos_adicionales}
                                    onChange={(e) => setModalCotizacion({ ...modalCotizacion, costos_adicionales: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                                />
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="font-semibold text-slate-700">Anticipo mínimo ($)</label>
                                    {totalModalCot > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setModalCotizacion({ ...modalCotizacion, anticipo_minimo: Math.round(totalModalCot * 0.5) })}
                                            className="text-[10px] font-bold text-blue-600 hover:underline"
                                        >
                                            50%
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min={0}
                                    value={modalCotizacion.anticipo_minimo}
                                    onChange={(e) => setModalCotizacion({ ...modalCotizacion, anticipo_minimo: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">Tiempo estimado (días)</label>
                                <input
                                    type="number"
                                    min={1}
                                    value={modalCotizacion.tiempo_estimado_dias}
                                    onChange={(e) => setModalCotizacion({ ...modalCotizacion, tiempo_estimado_dias: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Observaciones para el cliente</label>
                            <textarea
                                rows={2}
                                placeholder="Detalles sobre telas incluidas, pruebas de entalle, condiciones de entrega..."
                                value={modalCotizacion.observaciones_cliente}
                                onChange={(e) => setModalCotizacion({ ...modalCotizacion, observaciones_cliente: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                            <p className="text-sm font-extrabold text-slate-900">
                                Total Cotizado: ${totalModalCot.toLocaleString('es-CO')}
                            </p>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setModalCotizacion(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={guardandoCot} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">
                                    {guardandoCot ? 'Guardando...' : 'Guardar y enviar cotización'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL 2: DISTRIBUIDOR DE TAREAS POR PRENDA + ASIGNACIÓN EQUILIBRADA */}
            {modalDistribuidor && detalle && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-xl space-y-5 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">
                                    Distribuir tareas por prenda — Pedido #{detalle.pedido.pedido_id}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Divide la prenda en actividades concretas sin duplicar trabajo y asigna según carga real en horas.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {detalle.items.length > 1 && (
                                    <select
                                        value={modalDistribuidor.detalleId}
                                        onChange={(e) => setModalDistribuidor({ detalleId: Number(e.target.value) })}
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold"
                                    >
                                        {detalle.items.map((it) => (
                                            <option key={it.detalle_id} value={it.detalle_id}>{it.prenda_nombre}</option>
                                        ))}
                                    </select>
                                )}
                                <button type="button" onClick={() => setModalDistribuidor(null)}><X className="w-5 h-5 text-slate-400" /></button>
                            </div>
                        </div>

                        {(() => {
                            const tareasPrenda = detalle.tareas.filter((t) => t.detalle_id === modalDistribuidor.detalleId && t.estado !== 'cancelada');
                            const totalHoras = tareasPrenda.reduce((s, t) => s + Number(t.horas_estimadas || 0), 0);
                            return (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-bold text-slate-700">
                                        <span>Tareas definidas ({tareasPrenda.length})</span>
                                        <span>Horas estimadas totales: {totalHoras}h</span>
                                    </div>
                                    {tareasPrenda.length === 0 ? (
                                        <p className="text-xs text-slate-400 p-3 rounded-xl bg-slate-50">Aún no se han definido tareas para esta prenda.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {tareasPrenda.map((t) => (
                                                <div key={t.tarea_id} className="p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                    <div>
                                                        <p className="font-bold text-slate-900">{t.nombre} <span className="text-slate-400">({t.parte_prenda})</span></p>
                                                        <p className="text-slate-500">
                                                            {t.horas_estimadas}h · Estado: <strong className="uppercase">{t.estado.replace(/_/g, ' ')}</strong>
                                                            {t.dependencia_nombre && ` · Depende de: ${t.dependencia_nombre}`}
                                                        </p>
                                                    </div>
                                                    <select
                                                        value={t.responsable_id || ''}
                                                        onChange={(e) => handleReasignarTarea(t.tarea_id, e.target.value, Boolean(t.responsable_id))}
                                                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold"
                                                    >
                                                        <option value="">Sin asignar...</option>
                                                        {balanceCarga.map((op) => (
                                                            <option key={op.usuario_id} value={op.usuario_id}>
                                                                {op.nombre} ({op.porcentaje_carga}% carga · {op.horas_restantes}h disp.)
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        <form onSubmit={(e) => handleCrearTarea(e, false)} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                            <h4 className="text-xs font-extrabold uppercase text-blue-700">Agregar nueva tarea a esta prenda</h4>

                            {advertenciaDuplicado && (
                                <div className="p-3 rounded-lg bg-amber-100 border border-amber-300 text-xs text-amber-900 flex items-center justify-between gap-2">
                                    <span>{advertenciaDuplicado}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleCrearTarea(null, true)}
                                        className="px-3 py-1 rounded bg-amber-800 text-white font-bold shrink-0"
                                    >
                                        Confirmar actividad distinta
                                    </button>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Parte de la prenda *</label>
                                    <select
                                        value={formTarea.parte_prenda}
                                        onChange={(e) => setFormTarea({ ...formTarea, parte_prenda: e.target.value })}
                                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                                    >
                                        {PARTES_PRENDA.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Nombre de la tarea *</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej. Confección de mangas"
                                        value={formTarea.nombre}
                                        onChange={(e) => setFormTarea({ ...formTarea, nombre: e.target.value })}
                                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Tiempo estimado (horas) *</label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0.5"
                                        required
                                        value={formTarea.horas_estimadas}
                                        onChange={(e) => setFormTarea({ ...formTarea, horas_estimadas: e.target.value })}
                                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Responsable (Sastre/Encargado)</label>
                                    <select
                                        value={formTarea.responsable_id}
                                        onChange={(e) => setFormTarea({ ...formTarea, responsable_id: e.target.value })}
                                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                                    >
                                        <option value="">Asignar después...</option>
                                        {balanceCarga.map((op) => {
                                            const nuevaCarga = Math.round(((op.horas_comprometidas + Number(formTarea.horas_estimadas || 0)) / op.horas_disponibles) * 100);
                                            return (
                                                <option key={op.usuario_id} value={op.usuario_id}>
                                                    {op.nombre} · Actual {op.porcentaje_carga}% → Quedará {nuevaCarga}%
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Depende de tarea anterior</label>
                                    <select
                                        value={formTarea.dependencia_tarea_id}
                                        onChange={(e) => setFormTarea({ ...formTarea, dependencia_tarea_id: e.target.value })}
                                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                                    >
                                        <option value="">Ninguna (puede iniciar ya)</option>
                                        {detalle.tareas
                                            .filter((t) => t.detalle_id === modalDistribuidor.detalleId && t.estado !== 'cancelada')
                                            .map((t) => (
                                                <option key={t.tarea_id} value={t.tarea_id}>{t.nombre}</option>
                                            ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">Fecha límite</label>
                                    <input
                                        type="date"
                                        value={formTarea.fecha_limite}
                                        onChange={(e) => setFormTarea({ ...formTarea, fecha_limite: e.target.value })}
                                        className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">
                                    <Plus className="w-4 h-4" /> Agregar tarea
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 3: BALANCE DE CARGA DEL TALLER */}
            {modalBalance && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-lg font-bold text-slate-900">Balance de Carga de Sastres y Encargados</h3>
                            <button type="button" onClick={() => setModalBalance(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-600 uppercase">
                                    <tr>
                                        <th className="py-2.5 px-3">Responsable</th>
                                        <th className="py-2.5 px-3">Disponibles</th>
                                        <th className="py-2.5 px-3">Comprometidas</th>
                                        <th className="py-2.5 px-3">Restantes</th>
                                        <th className="py-2.5 px-3">Carga</th>
                                        <th className="py-2.5 px-3">Tareas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {balanceCarga.map((op) => (
                                        <tr key={op.usuario_id}>
                                            <td className="py-2.5 px-3 font-bold text-slate-900">{op.nombre}</td>
                                            <td className="py-2.5 px-3">{op.horas_disponibles}h</td>
                                            <td className="py-2.5 px-3">{op.horas_comprometidas}h</td>
                                            <td className="py-2.5 px-3 font-semibold">{op.horas_restantes}h</td>
                                            <td className="py-2.5 px-3">
                                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                                    op.nivel_carga === 'sobrecarga' ? 'bg-rose-100 text-rose-800' :
                                                    op.nivel_carga === 'alta' ? 'bg-amber-100 text-amber-800' :
                                                    op.nivel_carga === 'equilibrada' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-emerald-100 text-emerald-800'
                                                }`}>
                                                    {op.porcentaje_carga}% ({op.nivel_carga})
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3">{op.tareas_pendientes}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 4: RECHAZO DE SOLICITUD CON MOTIVO OBLIGATORIO */}
            {modalRechazo.abierto && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <form onSubmit={handleConfirmarRechazo} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
                        <h3 className="text-lg font-bold text-rose-700">Rechazar Solicitud #{modalRechazo.pedidoId}</h3>
                        <p className="text-xs text-slate-600">Cliente: <strong>{modalRechazo.cliente}</strong>. Esta acción moverá la solicitud al historial de rechazadas (solo consulta).</p>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Motivo del rechazo *</label>
                            <input
                                type="text"
                                required
                                placeholder="Ej. Capacidad del taller cubierta para la fecha solicitada..."
                                value={modalRechazo.motivo}
                                onChange={(e) => setModalRechazo({ ...modalRechazo, motivo: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones adicionales</label>
                            <textarea
                                rows={2}
                                value={modalRechazo.observaciones}
                                onChange={(e) => setModalRechazo({ ...modalRechazo, observaciones: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setModalRechazo({ abierto: false, pedidoId: null, cliente: '', motivo: '', observaciones: '' })} className="px-4 py-2 rounded-xl bg-slate-100 text-xs font-semibold">
                                Cancelar
                            </button>
                            <button type="submit" className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700">
                                Confirmar rechazo
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}