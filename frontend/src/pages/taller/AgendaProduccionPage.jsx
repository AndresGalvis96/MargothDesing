import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { produccionService, expedienteService } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import {
    Kanban, Calendar, AlertTriangle, Lock, CheckCircle2, Clock,
    Plus, Archive, History, FolderOpen, Sparkles, Scissors, UserCheck, X
} from 'lucide-react';

const COLUMNAS_KANBAN = [
    { id: 'solicitud_recibida', titulo: 'Solicitud Recibida', color: 'border-slate-300 bg-slate-50/60' },
    { id: 'pendiente_revision', titulo: 'Pendiente Revisión', color: 'border-amber-300 bg-amber-50/40' },
    { id: 'cotizacion_aprobacion', titulo: 'Cotización / Aprob.', color: 'border-yellow-300 bg-yellow-50/40' },
    { id: 'preparacion_materiales', titulo: 'Prep. Materiales', color: 'border-sky-300 bg-sky-50/40' },
    { id: 'corte', titulo: 'Corte', color: 'border-indigo-300 bg-indigo-50/40' },
    { id: 'confeccion', titulo: 'Confección', color: 'border-violet-300 bg-violet-50/40' },
    { id: 'control_calidad_pruebas', titulo: 'Control Calidad / Prueba', color: 'border-fuchsia-300 bg-fuchsia-50/40' },
    { id: 'lista_entrega', titulo: 'Lista para Entrega', color: 'border-teal-300 bg-teal-50/40' },
    { id: 'entregada', titulo: 'Entregada', color: 'border-emerald-300 bg-emerald-50/40' },
];

const ESTADOS_ESPECIALES = [
    { value: 'pendiente_informacion', label: 'Pendiente información cliente' },
    { value: 'pendiente_materiales', label: 'Pendiente materiales / telas' },
    { value: 'requiere_ajustes', label: 'Requiere ajustes de prueba' },
    { value: 'requiere_aprobacion_cliente', label: 'Requiere aprobación cliente' },
    { value: 'suspendido', label: 'Suspendido temporalmente' },
    { value: 'cancelado', label: 'Cancelar pedido' },
];

const CATEGORIAS_AGENDA = [
    { value: 'cita_cliente', label: 'Cita con Cliente (Medidas / Asesoría)' },
    { value: 'prueba_vestuario', label: 'Prueba de Vestuario' },
    { value: 'proveedor', label: 'Proveedor / Entrega de Insumos' },
    { value: 'personal_postulante', label: 'Personal / Entrevista Postulante' },
    { value: 'otro', label: 'Otro (Especificar)' },
];

const ACCIONES_PRENDA_SUGERIDAS = [
    'Bordar detalle / monograma',
    'Tejer acabado / puño',
    'Poner pedrería / aplicaciones',
    'Forrar prenda completa',
    'Entretelar cuello y solapas',
    'Hacer ojales y pegar botones',
    'Planchado técnico y vaporizado',
];

export default function AgendaProduccionPage() {
    const navigate = useNavigate();
    const { usuario } = useAuth();
    const esGestion = ['admin_local', 'supervisor'].includes(usuario?.rol);

    const [vista, setVista] = useState('kanban'); // 'kanban' | 'agenda'
    const [pedidos, setPedidos] = useState([]);
    const [citas, setCitas] = useState([]);
    const [tareas, setTareas] = useState([]);
    const [empleados, setEmpleados] = useState([]);
    const [prendasEnCurso, setPrendasEnCurso] = useState([]);
    const [clientesTaller, setClientesTaller] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [alertaSistema, setAlertaSistema] = useState(null);
    const [pedidoArrastrado, setPedidoArrastrado] = useState(null);

    // Modal Histórico (Entregados archivados + Cancelados/Rechazados)
    const [modalHistorico, setModalHistorico] = useState(false);
    const [historico, setHistorico] = useState([]);
    const [tabHistorico, setTabHistorico] = useState('entregados');

    // Formulario Nueva Cita Agenda (Bloque A)
    const [formCita, setFormCita] = useState({
        titulo: '',
        categoria: 'cita_cliente',
        categoria_otro_detalle: '',
        cliente_id: '',
        contacto_externo: '',
        responsable_id: '',
        pedido_id: '',
        fecha_hora: '',
        notas: ''
    });

    // Formulario Nueva Tarea por Prenda (Bloque B)
    const [formTarea, setFormTarea] = useState({
        detalle_id: '',
        accion_preset: 'Bordar detalle / monograma',
        nombre_tarea: 'Bordar detalle / monograma',
        responsable_id: '',
        fecha_limite: '',
        observaciones: ''
    });

    const cargarDatos = async () => {
        try {
            const { data } = await produccionService.obtenerAgendaKanban();
            setPedidos(data.pedidos_kanban || []);
            setCitas(data.agenda_citas || []);
            setTareas(data.tareas_prenda || []);
            setEmpleados(data.empleados || []);
            setPrendasEnCurso(data.prendas_en_curso || []);
        } catch (err) {
            setAlertaSistema({
                tipo: 'error',
                titulo: 'Error al cargar tablero',
                mensajes: [err.response?.data?.error || err.message]
            });
        } finally {
            setCargando(false);
        }
    };

    useEffect(() => {
        cargarDatos();
        if (esGestion) {
            expedienteService.listarClientes()
                .then(({ data }) => setClientesTaller(Array.isArray(data) ? data : []))
                .catch(() => setClientesTaller([]));
        }
    }, [esGestion]);

    // Pedidos activos vs cerrados
    const pedidosActivos = useMemo(
        () => pedidos.filter((p) => !['cancelado', 'rechazado'].includes(p.estado)),
        [pedidos]
    );

    const pedidosRequierenAtencion = useMemo(
        () => pedidosActivos.filter((p) => p.requiere_atencion),
        [pedidosActivos]
    );

    // Mover pedido de estado (Drag & Drop o selector rápido)
    const cambiarEstadoPedido = async (pedido, nuevoEstado) => {
        if (!esGestion) {
            setAlertaSistema({
                tipo: 'error',
                titulo: 'Permiso requerido',
                mensajes: ['Solo Administrador o Supervisor pueden cambiar el estado global del pedido.']
            });
            return;
        }
        if (pedido.columna_kanban === nuevoEstado && pedido.estado === nuevoEstado) return;

        try {
            await produccionService.actualizarEstadoPedido(pedido.pedido_id, { estado: nuevoEstado });
            setAlertaSistema(null);
            await cargarDatos();
        } catch (err) {
            if (err.response?.status === 409) {
                setAlertaSistema({
                    tipo: 'bloqueo',
                    titulo: `Pedido #${pedido.pedido_id} (${pedido.cliente_nombre}) bloqueado para avanzar`,
                    mensajes: err.response.data.candados || ['Faltan requisitos operativos antes de pasar a producción.'],
                    clienteId: pedido.cliente_id
                });
            } else {
                setAlertaSistema({
                    tipo: 'error',
                    titulo: 'No se pudo cambiar el estado',
                    mensajes: [err.response?.data?.error || err.message]
                });
            }
        }
    };

    const handleArchivarEntregados = async (pedidoId = null) => {
        try {
            const { data } = await produccionService.archivarEntregados(pedidoId);
            setAlertaSistema({
                tipo: 'ok',
                titulo: 'Histórico actualizado',
                mensajes: [data.mensaje]
            });
            await cargarDatos();
        } catch (err) {
            setAlertaSistema({
                tipo: 'error',
                titulo: 'Error al archivar',
                mensajes: [err.response?.data?.error || err.message]
            });
        }
    };

    const abrirHistorico = async () => {
        setModalHistorico(true);
        try {
            const { data } = await produccionService.obtenerHistorico();
            setHistorico(Array.isArray(data) ? data : []);
        } catch {
            setHistorico([]);
        }
    };

    // Crear cita en Agenda (Bloque A)
    const handleCrearCita = async (e) => {
        e.preventDefault();
        try {
            await produccionService.crearCitaAgenda({
                ...formCita,
                cliente_id: formCita.cliente_id || null,
                responsable_id: formCita.responsable_id || null,
                pedido_id: formCita.pedido_id || null
            });
            setFormCita({
                titulo: '',
                categoria: 'cita_cliente',
                categoria_otro_detalle: '',
                cliente_id: '',
                contacto_externo: '',
                responsable_id: '',
                pedido_id: '',
                fecha_hora: '',
                notas: ''
            });
            await cargarDatos();
        } catch (err) {
            setAlertaSistema({
                tipo: 'error',
                titulo: 'Error al agendar compromiso',
                mensajes: [err.response?.data?.error || err.message]
            });
        }
    };

    // Crear tarea técnica por prenda (Bloque B)
    const handleCrearTarea = async (e) => {
        e.preventDefault();
        try {
            await produccionService.crearTareaPrenda({
                detalle_id: formTarea.detalle_id,
                nombre_tarea: formTarea.nombre_tarea,
                responsable_id: formTarea.responsable_id || null,
                fecha_limite: formTarea.fecha_limite || null,
                observaciones: formTarea.observaciones || null
            });
            setFormTarea((prev) => ({
                ...prev,
                observaciones: '',
                fecha_limite: ''
            }));
            await cargarDatos();
        } catch (err) {
            setAlertaSistema({
                tipo: 'error',
                titulo: 'Error al crear tarea de prenda',
                mensajes: [err.response?.data?.error || err.message]
            });
        }
    };

    const handleCambiarEstadoTarea = async (tareaId, nuevoEstado) => {
        try {
            await produccionService.actualizarTareaPrenda(tareaId, { estado: nuevoEstado });
            await cargarDatos();
        } catch (err) {
            setAlertaSistema({
                tipo: 'error',
                titulo: 'Error al actualizar tarea',
                mensajes: [err.response?.data?.error || err.message]
            });
        }
    };

    if (cargando) {
        return <div className="p-8 text-sm text-slate-500">Cargando tablero de producción y agenda...</div>;
    }

    const entregadosEnTablero = pedidosActivos.filter((p) => p.columna_kanban === 'entregada');

    return (
        <div className="space-y-6">
            {/* CABECERA */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Control de Producción y Agenda</h2>
                    <p className="text-xs text-slate-500">
                        Flujo Kanban con validación de medidas y operarios, agenda ejecutiva del taller y tareas técnicas por prenda
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {esGestion && (
                        <button
                            type="button"
                            onClick={abrirHistorico}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
                        >
                            <History className="w-4 h-4" />
                            Histórico (Entregas / Cancelados)
                        </button>
                    )}

                    <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                        <button
                            type="button"
                            onClick={() => setVista('kanban')}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                                vista === 'kanban' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                            }`}
                        >
                            <Kanban className="w-4 h-4" />
                            Tablero Kanban
                        </button>
                        <button
                            type="button"
                            onClick={() => setVista('agenda')}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                                vista === 'agenda' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600'
                            }`}
                        >
                            <Calendar className="w-4 h-4" />
                            {esGestion ? 'Agenda y Tareas' : 'Mis Tareas de Prenda'}
                        </button>
                    </div>
                </div>
            </div>

            {/* BANNER DE ALERTA / BLOQUEO OPERATIVO */}
            {alertaSistema && (
                <div
                    className={`p-4 rounded-2xl border flex flex-wrap items-start justify-between gap-4 ${
                        alertaSistema.tipo === 'ok'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-300 text-rose-900'
                    }`}
                >
                    <div className="space-y-1">
                        <p className="text-sm font-bold flex items-center gap-2">
                            {alertaSistema.tipo === 'bloqueo' && <Lock className="w-4 h-4 text-rose-600" />}
                            {alertaSistema.titulo}
                        </p>
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                            {alertaSistema.mensajes.map((m, idx) => (
                                <li key={idx}>{m}</li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex items-center gap-2">
                        {alertaSistema.clienteId && (
                            <button
                                type="button"
                                onClick={() => navigate(`/taller/clientes/${alertaSistema.clienteId}`)}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700"
                            >
                                Ir al Expediente 360°
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setAlertaSistema(null)}
                            className="p-1.5 rounded-lg hover:bg-black/5"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* =====================================================================
                VISTA 1: TABLERO KANBAN + BANDEJA "REQUIEREN ATENCIÓN"
               ===================================================================== */}
            {vista === 'kanban' && (
                <div className="space-y-6">
                    {/* BANDEJA: PEDIDOS QUE REQUIEREN ATENCIÓN / ESTADO ESPECIAL */}
                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                                <h3 className="text-sm font-bold text-amber-950">
                                    Pedidos que Requieren Atención / Estado Especial ({pedidosRequierenAtencion.length})
                                </h3>
                            </div>
                            <span className="text-[11px] text-amber-800">
                                Incluye prioridad alta, +24h sin atender, bloqueos por falta de sastre/medidas/abono y estados especiales
                            </span>
                        </div>

                        {pedidosRequierenAtencion.length === 0 ? (
                            <p className="text-xs text-amber-800/80">
                                Excelente: no hay pedidos bloqueados, atrasados ni con alertas pendientes en este momento.
                            </p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {pedidosRequierenAtencion.map((p) => (
                                    <div
                                        key={`atencion-${p.pedido_id}`}
                                        className="bg-white rounded-xl border border-amber-300 p-3.5 shadow-sm space-y-2"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <span className="text-[11px] font-bold text-indigo-600">Pedido #{p.pedido_id}</span>
                                                <p className="text-sm font-bold text-slate-900">{p.cliente_nombre}</p>
                                            </div>
                                            {p.bloqueado_avance && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold">
                                                    <Lock className="w-3 h-3" /> Bloqueado
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-xs text-slate-600 line-clamp-1">{p.prendas_resumen}</p>

                                        <div className="flex flex-wrap gap-1">
                                            {p.motivos_atencion.map((motivo, i) => (
                                                <span
                                                    key={i}
                                                    className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold"
                                                >
                                                    {motivo}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/taller/clientes/${p.cliente_id}`)}
                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
                                            >
                                                <FolderOpen className="w-3.5 h-3.5" /> Expediente
                                            </button>

                                            {esGestion && (
                                                <select
                                                    value={p.estado}
                                                    onChange={(e) => cambiarEstadoPedido(p, e.target.value)}
                                                    className="text-[11px] border border-slate-300 rounded-lg px-2 py-1 bg-slate-50"
                                                >
                                                    <option value={p.estado}>Mover / Estado...</option>
                                                    <optgroup label="Flujo Producción">
                                                        {COLUMNAS_KANBAN.map((col) => (
                                                            <option key={col.id} value={col.id}>{col.titulo}</option>
                                                        ))}
                                                    </optgroup>
                                                    <optgroup label="Estado Especial / Cerrar">
                                                        {ESTADOS_ESPECIALES.map((esp) => (
                                                            <option key={esp.value} value={esp.value}>{esp.label}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* COLUMNAS DEL TABLERO KANBAN (ARRASTRAR Y SOLTAR) */}
                    <div className="overflow-x-auto pb-4">
                        <div className="inline-flex gap-4 min-w-full">
                            {COLUMNAS_KANBAN.map((col) => {
                                const tarjetasCol = pedidosActivos.filter((p) => p.columna_kanban === col.id);

                                return (
                                    <div
                                        key={col.id}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={() => {
                                            if (pedidoArrastrado) {
                                                cambiarEstadoPedido(pedidoArrastrado, col.id);
                                                setPedidoArrastrado(null);
                                            }
                                        }}
                                        className={`w-72 shrink-0 rounded-2xl border-t-4 border border-slate-200 p-3 flex flex-col gap-3 min-h-[420px] ${col.color}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                                                    {col.titulo}
                                                </h4>
                                                <span className="text-[11px] text-slate-500">
                                                    {tarjetasCol.length} pedido(s)
                                                </span>
                                            </div>

                                            {col.id === 'entregada' && esGestion && entregadosEnTablero.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleArchivarEntregados()}
                                                    title="Mover pedidos entregados al Histórico de Entregas"
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold"
                                                >
                                                    <Archive className="w-3 h-3" /> Archivar ({entregadosEnTablero.length})
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-2.5 flex-1">
                                            {tarjetasCol.map((p) => (
                                                <div
                                                    key={p.pedido_id}
                                                    draggable={esGestion}
                                                    onDragStart={() => setPedidoArrastrado(p)}
                                                    onDragEnd={() => setPedidoArrastrado(null)}
                                                    className={`bg-white rounded-xl p-3 border shadow-sm space-y-2 transition ${
                                                        esGestion ? 'cursor-grab active:cursor-grabbing' : ''
                                                    } ${
                                                        p.bloqueado_avance
                                                            ? 'border-rose-300 ring-1 ring-rose-200'
                                                            : p.prioridad === 'alta'
                                                            ? 'border-amber-300'
                                                            : 'border-slate-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-[11px] font-bold text-indigo-600">
                                                            #{p.pedido_id}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            {p.prioridad === 'alta' && (
                                                                <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[9px] font-bold uppercase">
                                                                    Alta
                                                                </span>
                                                            )}
                                                            {p.bloqueado_avance && (
                                                                <span
                                                                    title={p.candados_bloqueo.join(' | ')}
                                                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold"
                                                                >
                                                                    <Lock className="w-2.5 h-2.5" /> Bloqueado
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <p className="text-xs font-bold text-slate-900">{p.cliente_nombre}</p>
                                                    <p className="text-[11px] text-slate-600 line-clamp-2">{p.prendas_resumen}</p>

                                                    {p.bloqueado_avance && (
                                                        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[10px] text-rose-800 space-y-0.5">
                                                            {p.candados_bloqueo.map((c, idx) => (
                                                                <p key={idx}>• {c}</p>
                                                            ))}
                                                        </div>
                                                    )}

                                                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                                                        <span className="font-bold text-slate-800">
                                                            ${Number(p.costo_total || 0).toLocaleString('es-CO')}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/taller/clientes/${p.cliente_id}`)}
                                                            className="text-indigo-600 hover:underline font-semibold"
                                                        >
                                                            Expediente
                                                        </button>
                                                    </div>

                                                    {esGestion && (
                                                        <select
                                                            value={col.id}
                                                            onChange={(e) => cambiarEstadoPedido(p, e.target.value)}
                                                            className="w-full text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700"
                                                        >
                                                            <optgroup label="Mover a etapa">
                                                                {COLUMNAS_KANBAN.map((c) => (
                                                                    <option key={c.id} value={c.id}>{c.titulo}</option>
                                                                ))}
                                                            </optgroup>
                                                            <optgroup label="Estado especial">
                                                                {ESTADOS_ESPECIALES.map((esp) => (
                                                                    <option key={esp.value} value={esp.value}>{esp.label}</option>
                                                                ))}
                                                            </optgroup>
                                                        </select>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* =====================================================================
                VISTA 2: AGENDA DEL TALLER (BLOQUE A) + TAREAS POR PRENDA (BLOQUE B)
               ===================================================================== */}
            {vista === 'agenda' && (
                <div className={`grid grid-cols-1 ${esGestion ? 'lg:grid-cols-2' : ''} gap-6`}>
                    {/* BLOQUE A: AGENDA DE CITAS Y COMPROMISOS (SOLO ADMIN Y SUPERVISOR) */}
                    {esGestion && (
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Calendar className="w-5 h-5 text-indigo-600" />
                                    Agenda Ejecutiva de Citas y Compromisos
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Citas con clientes, pruebas de vestuario, proveedores, entrevistas de postulantes y compromisos internos
                                </p>
                            </div>

                            <form onSubmit={handleCrearCita} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                                <p className="text-xs font-bold text-slate-800 uppercase">Registrar nueva entrada en agenda</p>

                                <input
                                    type="text"
                                    required
                                    placeholder="Título libre (ej. Reunión proveedor paños, Entrevista operario, Prueba vestido...)"
                                    value={formCita.titulo}
                                    onChange={(e) => setFormCita({ ...formCita, titulo: e.target.value })}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <select
                                        value={formCita.categoria}
                                        onChange={(e) => setFormCita({ ...formCita, categoria: e.target.value })}
                                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                    >
                                        {CATEGORIAS_AGENDA.map((cat) => (
                                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                                        ))}
                                    </select>

                                    <input
                                        type="datetime-local"
                                        required
                                        value={formCita.fecha_hora}
                                        onChange={(e) => setFormCita({ ...formCita, fecha_hora: e.target.value })}
                                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                    />
                                </div>

                                {formCita.categoria === 'otro' && (
                                    <input
                                        type="text"
                                        required
                                        placeholder="Especifica qué tipo de compromiso es 'Otro'..."
                                        value={formCita.categoria_otro_detalle}
                                        onChange={(e) => setFormCita({ ...formCita, categoria_otro_detalle: e.target.value })}
                                        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/40 text-xs"
                                    />
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <select
                                        value={formCita.cliente_id}
                                        onChange={(e) => setFormCita({ ...formCita, cliente_id: e.target.value })}
                                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                    >
                                        <option value="">-- Cliente (opcional) --</option>
                                        {clientesTaller.map((c) => (
                                            <option key={c.usuario_id} value={c.usuario_id}>{c.nombre}</option>
                                        ))}
                                    </select>

                                    <input
                                        type="text"
                                        placeholder="Persona / Proveedor / Postulante externo"
                                        value={formCita.contacto_externo}
                                        onChange={(e) => setFormCita({ ...formCita, contacto_externo: e.target.value })}
                                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <select
                                        value={formCita.responsable_id}
                                        onChange={(e) => setFormCita({ ...formCita, responsable_id: e.target.value })}
                                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                    >
                                        <option value="">-- Responsable en taller --</option>
                                        {empleados.map((emp) => (
                                            <option key={emp.usuario_id} value={emp.usuario_id}>
                                                {emp.nombre} ({emp.rol})
                                            </option>
                                        ))}
                                    </select>

                                    <input
                                        type="text"
                                        placeholder="Notas o detalles adicionales..."
                                        value={formCita.notas}
                                        onChange={(e) => setFormCita({ ...formCita, notas: e.target.value })}
                                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                                >
                                    <Plus className="w-4 h-4" /> Guardar en Agenda
                                </button>
                            </form>

                            {/* LISTA DE CITAS */}
                            <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                                {citas.length === 0 ? (
                                    <p className="text-xs text-slate-400 text-center py-6">No hay citas registradas en la agenda.</p>
                                ) : (
                                    citas.map((c) => (
                                        <div
                                            key={c.cita_id}
                                            className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                                                c.estado === 'completada'
                                                    ? 'bg-slate-50 border-slate-200 opacity-70'
                                                    : 'bg-white border-slate-200'
                                            }`}
                                        >
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase">
                                                        {c.categoria === 'otro' && c.categoria_otro_detalle
                                                            ? `Otro: ${c.categoria_otro_detalle}`
                                                            : c.categoria.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(c.fecha_hora).toLocaleString('es-CO')}
                                                    </span>
                                                </div>

                                                <p className="text-sm font-bold text-slate-900">{c.titulo}</p>

                                                <p className="text-[11px] text-slate-600">
                                                    {c.cliente_nombre && <span>Cliente: <b>{c.cliente_nombre}</b> · </span>}
                                                    {c.contacto_externo && <span>Contacto: <b>{c.contacto_externo}</b> · </span>}
                                                    {c.responsable_nombre && <span>Atiende: <b>{c.responsable_nombre}</b></span>}
                                                </p>

                                                {c.notas && <p className="text-[11px] text-slate-500 italic">{c.notas}</p>}
                                            </div>

                                            {c.estado === 'pendiente' ? (
                                                <button
                                                    type="button"
                                                    onClick={() => produccionService.actualizarEstadoCita(c.cita_id, 'completada').then(cargarDatos)}
                                                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Completar
                                                </button>
                                            ) : (
                                                <span className="text-[10px] font-bold uppercase text-emerald-600">Completada</span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* BLOQUE B: TAREAS TÉCNICAS POR PRENDA (TODO EL PERSONAL DEL TALLER) */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                <Scissors className="w-5 h-5 text-violet-600" />
                                Tareas Operativas por Prenda
                            </h3>
                            <p className="text-xs text-slate-500">
                                Asigna acciones específicas (bordar, tejer, poner pedrería, forrar, acabados) a cada prenda en confección
                            </p>
                        </div>

                        <form onSubmit={handleCrearTarea} className="p-4 rounded-xl bg-violet-50/40 border border-violet-200 space-y-3">
                            <p className="text-xs font-bold text-violet-950 uppercase">Nueva tarea técnica en prenda</p>

                            <select
                                required
                                value={formTarea.detalle_id}
                                onChange={(e) => setFormTarea({ ...formTarea, detalle_id: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                            >
                                <option value="">-- Selecciona la prenda de un pedido activo --</option>
                                {prendasEnCurso.map((item) => (
                                    <option key={item.detalle_id} value={item.detalle_id}>
                                        Pedido #{item.pedido_id} · {item.prenda_nombre} {item.talla ? `(Talla ${item.talla})` : ''} — Cliente: {item.cliente_nombre}
                                    </option>
                                ))}
                            </select>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <select
                                    value={formTarea.accion_preset}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormTarea({
                                            ...formTarea,
                                            accion_preset: val,
                                            nombre_tarea: val === 'personalizada' ? '' : val
                                        });
                                    }}
                                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                >
                                    {ACCIONES_PRENDA_SUGERIDAS.map((acc) => (
                                        <option key={acc} value={acc}>{acc}</option>
                                    ))}
                                    <option value="personalizada">+ Escribir acción personalizada...</option>
                                </select>

                                <input
                                    type="text"
                                    required
                                    placeholder="Nombre de la acción en la prenda..."
                                    value={formTarea.nombre_tarea}
                                    onChange={(e) => setFormTarea({ ...formTarea, nombre_tarea: e.target.value })}
                                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <select
                                    value={formTarea.responsable_id}
                                    onChange={(e) => setFormTarea({ ...formTarea, responsable_id: e.target.value })}
                                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                >
                                    <option value="">-- Asignar responsable --</option>
                                    {empleados.map((emp) => (
                                        <option key={emp.usuario_id} value={emp.usuario_id}>
                                            {emp.nombre} ({emp.rol})
                                        </option>
                                    ))}
                                </select>

                                <input
                                    type="datetime-local"
                                    value={formTarea.fecha_limite}
                                    onChange={(e) => setFormTarea({ ...formTarea, fecha_limite: e.target.value })}
                                    className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                                />
                            </div>

                            <input
                                type="text"
                                placeholder="Instrucciones técnicas (color de hilo, tipo de pedrería, referencia de forro...)"
                                value={formTarea.observaciones}
                                onChange={(e) => setFormTarea({ ...formTarea, observaciones: e.target.value })}
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
                            />

                            <button
                                type="submit"
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
                            >
                                <Sparkles className="w-4 h-4" /> Asignar Tarea a Prenda
                            </button>
                        </form>

                        {/* LISTADO DE TAREAS POR PRENDA */}
                        <div className="space-y-2.5 max-h-[460px] overflow-y-auto">
                            {tareas.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center py-6">No hay tareas técnicas registradas aún.</p>
                            ) : (
                                tareas.map((t) => (
                                    <div
                                        key={t.tarea_id}
                                        className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                                            t.estado === 'completada'
                                                ? 'bg-emerald-50/40 border-emerald-200'
                                                : 'bg-white border-slate-200'
                                        }`}
                                    >
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[11px] font-bold text-indigo-600">Pedido #{t.pedido_id}</span>
                                                <span className="text-xs font-bold text-slate-900">· {t.prenda_nombre}</span>
                                                {t.talla && (
                                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                                                        Talla {t.talla}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-sm font-semibold text-violet-900">{t.nombre_tarea}</p>

                                            <p className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center gap-1">
                                                    <UserCheck className="w-3 h-3" /> {t.responsable_nombre}
                                                </span>
                                                {t.fecha_limite && (
                                                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold">
                                                        <Clock className="w-3 h-3" /> Límite: {new Date(t.fecha_limite).toLocaleString('es-CO')}
                                                    </span>
                                                )}
                                            </p>

                                            {t.observaciones && (
                                                <p className="text-[11px] text-slate-500 italic">{t.observaciones}</p>
                                            )}
                                        </div>

                                        <select
                                            value={t.estado}
                                            onChange={(e) => handleCambiarEstadoTarea(t.tarea_id, e.target.value)}
                                            className={`text-xs font-semibold rounded-xl px-3 py-1.5 border ${
                                                t.estado === 'completada'
                                                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                                                    : t.estado === 'en_proceso'
                                                    ? 'bg-amber-100 border-amber-300 text-amber-800'
                                                    : 'bg-slate-50 border-slate-300 text-slate-700'
                                            }`}
                                        >
                                            <option value="pendiente">Pendiente</option>
                                            <option value="en_proceso">En proceso</option>
                                            <option value="bloqueada">Bloqueada</option>
                                            <option value="completada">Completada</option>
                                        </select>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* =====================================================================
                MODAL: HISTÓRICO DE ENTREGAS Y PEDIDOS CANCELADOS / RECHAZADOS
               ===================================================================== */}
            {modalHistorico && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-xl">
                        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-900">Histórico de Pedidos</h3>
                            <button type="button" onClick={() => setModalHistorico(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-4 pt-3 border-b border-slate-200 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setTabHistorico('entregados')}
                                className={`px-3 py-2 text-xs font-bold border-b-2 ${
                                    tabHistorico === 'entregados'
                                        ? 'border-emerald-600 text-emerald-700'
                                        : 'border-transparent text-slate-500'
                                }`}
                            >
                                Entregas Archivadas ({historico.filter((h) => h.archivado_entrega === 1).length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setTabHistorico('cancelados')}
                                className={`px-3 py-2 text-xs font-bold border-b-2 ${
                                    tabHistorico === 'cancelados'
                                        ? 'border-rose-600 text-rose-700'
                                        : 'border-transparent text-slate-500'
                                }`}
                            >
                                Cancelados y Rechazados ({historico.filter((h) => ['cancelado', 'rechazado'].includes(h.estado)).length})
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto space-y-2">
                            {historico
                                .filter((h) =>
                                    tabHistorico === 'entregados'
                                        ? h.archivado_entrega === 1
                                        : ['cancelado', 'rechazado'].includes(h.estado)
                                )
                                .map((item) => (
                                    <div key={item.pedido_id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                                        <div>
                                            <p className="font-bold text-slate-900">
                                                Pedido #{item.pedido_id} · {item.cliente_nombre}
                                            </p>
                                            <p className="text-slate-600">{item.prendas_resumen}</p>
                                            {item.motivo_rechazo && (
                                                <p className="text-rose-600 italic mt-0.5">Motivo: {item.motivo_rechazo}</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className="px-2 py-0.5 rounded bg-slate-100 font-bold uppercase text-[10px]">
                                                {item.estado}
                                            </span>
                                            <p className="font-bold text-slate-800 mt-1">
                                                ${Number(item.costo_total || 0).toLocaleString('es-CO')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}