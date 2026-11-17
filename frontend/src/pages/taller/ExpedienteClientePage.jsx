import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { expedienteService } from '../../api/services';
import {
    ArrowLeft, User, Ruler, Scissors, ShoppingBag, MessageSquare,
    AlertTriangle, Save, Plus, ArrowLeftRight, Phone, MapPin, CheckCircle2, X
} from 'lucide-react';

const REGIONES_MEDIDAS = [
    {
        region: 'Cuello',
        campos: [{ key: 'contorno_cuello', label: 'Contorno de cuello' }]
    },
    {
        region: 'Hombros',
        campos: [
            { key: 'ancho_hombros', label: 'Ancho de hombros' },
            { key: 'caida_hombros', label: 'Caída de hombros' }
        ]
    },
    {
        region: 'Torso',
        campos: [
            { key: 'pecho', label: 'Pecho / Busto' },
            { key: 'cintura', label: 'Cintura' },
            { key: 'abdomen', label: 'Abdomen' },
            { key: 'cadera', label: 'Cadera' }
        ]
    },
    {
        region: 'Brazos',
        campos: [
            { key: 'largo_manga', label: 'Largo de manga' },
            { key: 'contorno_brazo', label: 'Contorno de brazo' },
            { key: 'puno', label: 'Puño' }
        ]
    },
    {
        region: 'Espalda',
        campos: [
            { key: 'ancho_espalda', label: 'Ancho de espalda' },
            { key: 'largo_espalda', label: 'Largo de espalda' }
        ]
    },
    {
        region: 'Piernas',
        campos: [
            { key: 'tiro', label: 'Tiro' },
            { key: 'entrepierna', label: 'Entrepierna' },
            { key: 'largo_exterior', label: 'Largo exterior pantalón' },
            { key: 'contorno_muslo', label: 'Contorno de muslo' }
        ]
    },
    {
        region: 'Otras',
        campos: [
            { key: 'largo_falda_vestido', label: 'Largo falda / vestido' },
            { key: 'altura_total', label: 'Estatura / Altura total' }
        ]
    }
];

const TODOS_CAMPOS_MEDIDAS = REGIONES_MEDIDAS.flatMap((r) => r.campos);

export default function ExpedienteClientePage() {
    const { clienteId } = useParams();
    const navigate = useNavigate();

    const [expediente, setExpediente] = useState(null);
    const [tabActiva, setTabActiva] = useState('crm');
    const [tarjetaActiva, setTarjetaActiva] = useState(null); // 'medida' | 'catalogo' | 'confeccion' | 'entregas' | 'saldo' | null
    const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
    const [guardando, setGuardando] = useState(false);

    // Estado Formulario CRM
    const [formCRM, setFormCRM] = useState({
        nombre: '',
        telefono: '',
        direccion: '',
        medio_contacto_preferido: 'whatsapp',
        observaciones_internas: ''
    });

    // Estado Nueva Toma de Medidas
    const [unidadMedida, setUnidadMedida] = useState('cm');
    const [valoresMedida, setValoresMedida] = useState({});
    const [obsMedida, setObsMedida] = useState('');

    // Estado Comparador de Dos Mediciones
    const [medidaBaseId, setMedidaBaseId] = useState('');
    const [medidaCompId, setMedidaCompId] = useState('');

    // Estado Bitácora
    const [formBitacora, setFormBitacora] = useState({
        canal: 'whatsapp',
        tipo: 'nota',
        resumen: '',
        fecha_recordatorio: ''
    });

    const toggleTarjeta = (clave) => {
        setTarjetaActiva((prev) => (prev === clave ? null : clave));
    };

    const cargarExpediente = async () => {
        try {
            const { data } = await expedienteService.obtenerCliente(clienteId);
            setExpediente(data);
            setFormCRM({
                nombre: data.cliente.nombre || '',
                telefono: data.cliente.telefono || '',
                direccion: data.cliente.direccion || '',
                medio_contacto_preferido: data.cliente.medio_contacto_preferido || 'whatsapp',
                observaciones_internas: data.cliente.observaciones_internas || ''
            });

            if (data.mediciones?.length >= 2) {
                setMedidaBaseId(String(data.mediciones[1].medida_id));
                setMedidaCompId(String(data.mediciones[0].medida_id));
            } else if (data.mediciones?.length === 1) {
                setMedidaBaseId(String(data.mediciones[0].medida_id));
                setMedidaCompId(String(data.mediciones[0].medida_id));
            }
        } catch {
            setMensaje({ tipo: 'error', texto: 'No se pudo cargar el expediente del cliente.' });
        }
    };

    useEffect(() => {
        cargarExpediente();
    }, [clienteId]);

    const handleGuardarCRM = async (e) => {
        e.preventDefault();
        setGuardando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            await expedienteService.actualizarCRM(clienteId, formCRM);
            setMensaje({ tipo: 'exito', texto: 'Perfil CRM y observaciones internas actualizadas.' });
            await cargarExpediente();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar datos CRM.' });
        } finally {
            setGuardando(false);
        }
    };

    const handleRegistrarMedicion = async (e) => {
        e.preventDefault();
        const valoresLimpios = {};
        Object.entries(valoresMedida).forEach(([k, v]) => {
            if (v !== '' && v !== null && !Number.isNaN(Number(v))) {
                valoresLimpios[k] = Number(v);
            }
        });

        if (Object.keys(valoresLimpios).length === 0) {
            setMensaje({ tipo: 'error', texto: 'Ingresa al menos un valor de medida antes de guardar.' });
            return;
        }

        setGuardando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            await expedienteService.registrarMedidas(clienteId, {
                unidad: unidadMedida,
                valores_json: valoresLimpios,
                observaciones: obsMedida.trim() || null
            });
            setMensaje({ tipo: 'exito', texto: 'Toma de medidas registrada correctamente en el historial.' });
            setValoresMedida({});
            setObsMedida('');
            await cargarExpediente();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar medidas.' });
        } finally {
            setGuardando(false);
        }
    };

    const handleRegistrarBitacora = async (e) => {
        e.preventDefault();
        setGuardando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            await expedienteService.registrarBitacora(clienteId, formBitacora);
            setMensaje({ tipo: 'exito', texto: 'Comunicación registrada en la bitácora.' });
            setFormBitacora({ canal: 'whatsapp', tipo: 'nota', resumen: '', fecha_recordatorio: '' });
            await cargarExpediente();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar bitácora.' });
        } finally {
            setGuardando(false);
        }
    };

    // Comparación dinámica entre dos registros de medidas
    const comparacionMediciones = useMemo(() => {
        if (!expediente?.mediciones?.length) return [];
        const m1 = expediente.mediciones.find((m) => String(m.medida_id) === String(medidaBaseId));
        const m2 = expediente.mediciones.find((m) => String(m.medida_id) === String(medidaCompId));
        if (!m1 || !m2) return [];

        return TODOS_CAMPOS_MEDIDAS
            .filter((c) => m1.valores_json[c.key] !== undefined || m2.valores_json[c.key] !== undefined)
            .map((c) => {
                const v1 = m1.valores_json[c.key] ?? null;
                const v2 = m2.valores_json[c.key] ?? null;
                const diff = v1 !== null && v2 !== null ? Number((v2 - v1).toFixed(1)) : null;
                return { label: c.label, v1, v2, diff, unidad: m2.unidad };
            });
    }, [expediente, medidaBaseId, medidaCompId]);

    if (!expediente) {
        return <div className="p-8 text-sm text-slate-500">Cargando expediente del cliente...</div>;
    }

    const {
        cliente,
        kpis,
        pedidos_unicos = [],
        mediciones,
        prendas_medida,
        prendas_catalogo,
        tallas_frecuentes,
        bitacora
    } = expediente;

    // Listados filtrados para cada tarjeta KPI interactiva
    const listaMedidaActiva = (prendas_medida || []).filter(
        (d) => !['cancelado', 'rechazado'].includes(d.estado_pedido)
    );

    const listaCatalogoActiva = (prendas_catalogo || []).filter(
        (d) => !['cancelado', 'rechazado'].includes(d.estado_pedido)
    );

    const listaAprobadasEnConfeccion = pedidos_unicos.filter((p) =>
        ['aceptado', 'aprobado', 'en_produccion', 'preparacion_materiales', 'corte', 'confeccion', 'control_calidad_pruebas', 'requiere_ajustes'].includes(p.estado)
    );

    const listaEntregasYEntregadas = pedidos_unicos.filter((p) =>
        ['terminado', 'lista_entrega', 'entregado', 'entregada'].includes(p.estado)
    );

    const listaConSaldoPendiente = pedidos_unicos.filter(
        (p) => Number(p.saldo_pendiente || 0) > 0
    );

    return (
        <div className="space-y-6">
            {/* Barra superior */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/taller/clientes')}
                        className="p-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Expediente: {cliente.nombre}</h2>
                        <p className="text-xs text-slate-500">
                            Cliente #{cliente.usuario_id} · Registrado el {cliente.creado_en ? new Date(cliente.creado_en).toLocaleDateString('es-CO') : 'N/A'} · Contacto preferido: <strong className="uppercase text-indigo-600">{cliente.medio_contacto_preferido}</strong>
                        </p>
                    </div>
                </div>
            </div>

            {mensaje.texto && (
                <div className={`p-3.5 rounded-lg border text-sm font-medium ${
                    mensaje.tipo === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                    {mensaje.texto}
                </div>
            )}

            {/* Alertas automáticas */}
            {kpis.alertas?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                    <p className="text-xs font-bold uppercase text-amber-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Alertas y recomendaciones de seguimiento
                    </p>
                    <ul className="list-disc list-inside text-xs text-amber-900 space-y-0.5">
                        {kpis.alertas.map((alerta, i) => <li key={i}>{alerta}</li>)}
                    </ul>
                </div>
            )}

            {/* 5 TARJETAS KPI INTERACTIVAS (FUNCIONAN COMO BOTONES DE DESPLIEGUE) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <button
                    type="button"
                    onClick={() => toggleTarjeta('medida')}
                    className={`text-left p-3.5 rounded-xl border transition shadow-sm ${
                        tarjetaActiva === 'medida'
                            ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200'
                            : 'bg-white border-slate-200 hover:border-indigo-300'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Confeccionadas a medida</span>
                    <span className="text-xl font-extrabold text-indigo-700">{kpis.prendas_confeccionadas}</span>
                    <span className="text-[10px] text-indigo-600 block mt-0.5 font-medium">
                        {tarjetaActiva === 'medida' ? 'Ocultar detalle ▲' : 'Ver solicitudes ▼'}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => toggleTarjeta('catalogo')}
                    className={`text-left p-3.5 rounded-xl border transition shadow-sm ${
                        tarjetaActiva === 'catalogo'
                            ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200'
                            : 'bg-white border-slate-200 hover:border-sky-300'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Compradas de catálogo</span>
                    <span className="text-xl font-extrabold text-slate-900">{kpis.prendas_catalogo}</span>
                    <span className="text-[10px] text-sky-600 block mt-0.5 font-medium">
                        {tarjetaActiva === 'catalogo' ? 'Ocultar detalle ▲' : 'Ver compras ▼'}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => toggleTarjeta('confeccion')}
                    className={`text-left p-3.5 rounded-xl border transition shadow-sm ${
                        tarjetaActiva === 'confeccion'
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200'
                            : 'bg-white border-slate-200 hover:border-amber-300'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Pendientes / En confección</span>
                    <span className="text-xl font-extrabold text-amber-600">
                        {kpis.pedidos_pendientes} / {kpis.pedidos_en_confeccion}
                    </span>
                    <span className="text-[10px] text-amber-700 block mt-0.5 font-medium">
                        {tarjetaActiva === 'confeccion' ? 'Ocultar detalle ▲' : 'Ver aprobadas en curso ▼'}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => toggleTarjeta('entregas')}
                    className={`text-left p-3.5 rounded-xl border transition shadow-sm ${
                        tarjetaActiva === 'entregas'
                            ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
                            : 'bg-white border-slate-200 hover:border-emerald-300'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Listas / Entregadas</span>
                    <span className="text-xl font-extrabold text-emerald-600">
                        {kpis.prendas_listas_entrega}{' '}
                        <span className="text-xs font-bold text-slate-500">
                            / {kpis.prendas_entregadas || 0} ent.
                        </span>
                    </span>
                    <span className="text-[10px] text-emerald-700 block mt-0.5 font-medium">
                        {tarjetaActiva === 'entregas' ? 'Ocultar detalle ▲' : 'Ver listas y entregadas ▼'}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => toggleTarjeta('saldo')}
                    className={`text-left p-3.5 rounded-xl border transition shadow-sm ${
                        tarjetaActiva === 'saldo'
                            ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200'
                            : 'bg-white border-slate-200 hover:border-rose-300'
                    }`}
                >
                    <span className="text-[11px] font-semibold text-slate-500 block">Saldo pendiente</span>
                    <span className={`text-xl font-extrabold ${kpis.saldo_pendiente > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        ${Number(kpis.saldo_pendiente || 0).toLocaleString('es-CO')}
                    </span>
                    <span className="text-[10px] text-rose-600 block mt-0.5 font-medium">
                        {tarjetaActiva === 'saldo' ? 'Ocultar detalle ▲' : 'Ver solicitudes con saldo ▼'}
                    </span>
                </button>
            </div>

            {/* PANEL DESPLEGABLE SEGÚN LA TARJETA PRESIONADA */}
            {tarjetaActiva && (
                <div className="bg-white rounded-2xl border border-slate-300 p-4 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h4 className="text-sm font-bold text-slate-900">
                            {tarjetaActiva === 'medida' && `Solicitudes Confeccionadas a Medida (${listaMedidaActiva.length})`}
                            {tarjetaActiva === 'catalogo' && `Compras de Catálogo (${listaCatalogoActiva.length})`}
                            {tarjetaActiva === 'confeccion' && `Solicitudes Aprobadas y en Confección (${listaAprobadasEnConfeccion.length})`}
                            {tarjetaActiva === 'entregas' && `Listas para Entregar y Entregadas Anteriormente (${listaEntregasYEntregadas.length})`}
                            {tarjetaActiva === 'saldo' && `Solicitudes con Saldo Pendiente (${listaConSaldoPendiente.length})`}
                        </h4>
                        <button
                            type="button"
                            onClick={() => setTarjetaActiva(null)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                        >
                            Cerrar <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* 1. CONFECCIONADAS A MEDIDA (Cualquier estado menos canceladas/rechazadas) */}
                    {tarjetaActiva === 'medida' && (
                        listaMedidaActiva.length === 0 ? (
                            <p className="text-xs text-slate-500">No tiene solicitudes confeccionadas a medida activas o entregadas.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 text-xs">
                                {listaMedidaActiva.map((d) => (
                                    <div key={d.detalle_id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="font-bold text-slate-900">
                                                Pedido #{d.pedido_id} · {d.prenda_nombre} (x{d.cantidad})
                                            </p>
                                            <p className="text-slate-500">
                                                Fecha: {new Date(d.fecha_pedido).toLocaleDateString('es-CO')} · Responsable: {d.responsable_nombre || 'Sin asignar'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold uppercase text-[10px]">
                                                {d.estado_pedido}
                                            </span>
                                            <p className="font-bold text-slate-800 mt-1">${Number(d.subtotal || 0).toLocaleString('es-CO')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* 2. COMPRADAS DE CATÁLOGO */}
                    {tarjetaActiva === 'catalogo' && (
                        listaCatalogoActiva.length === 0 ? (
                            <p className="text-xs text-slate-500">No tiene compras registradas desde el catálogo.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 text-xs">
                                {listaCatalogoActiva.map((d) => (
                                    <div key={d.detalle_id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="font-bold text-slate-900">
                                                Pedido #{d.pedido_id} · {d.prenda_nombre} {d.talla ? `(Talla ${d.talla})` : ''} · x{d.cantidad}
                                            </p>
                                            <p className="text-slate-500">
                                                Fecha: {new Date(d.fecha_pedido).toLocaleDateString('es-CO')}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 font-bold uppercase text-[10px]">
                                                {d.estado_pedido}
                                            </span>
                                            <p className="font-bold text-slate-800 mt-1">${Number(d.subtotal || 0).toLocaleString('es-CO')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* 3. APROBADAS / EN CONFECCIÓN */}
                    {tarjetaActiva === 'confeccion' && (
                        listaAprobadasEnConfeccion.length === 0 ? (
                            <p className="text-xs text-slate-500">No tiene solicitudes aprobadas actualmente en confección.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 text-xs">
                                {listaAprobadasEnConfeccion.map((p) => (
                                    <div key={p.pedido_id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="font-bold text-slate-900">Pedido #{p.pedido_id} · {p.prendas_resumen}</p>
                                            <p className="text-slate-500">Solicitado: {new Date(p.fecha_pedido).toLocaleDateString('es-CO')}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold uppercase text-[10px]">
                                                {p.estado}
                                            </span>
                                            <p className="font-bold text-slate-800 mt-1">${Number(p.monto_total || 0).toLocaleString('es-CO')}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* 4. LISTAS PARA ENTREGAR + ENTREGADAS */}
                    {tarjetaActiva === 'entregas' && (
                        listaEntregasYEntregadas.length === 0 ? (
                            <p className="text-xs text-slate-500">No tiene solicitudes listas para entregar ni entregadas anteriormente.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 text-xs">
                                {listaEntregasYEntregadas.map((p) => {
                                    const yaEntregado = ['entregado', 'entregada'].includes(p.estado);
                                    return (
                                        <div key={p.pedido_id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <p className="font-bold text-slate-900">Pedido #{p.pedido_id} · {p.prendas_resumen}</p>
                                                <p className="text-slate-500">Fecha solicitud: {new Date(p.fecha_pedido).toLocaleDateString('es-CO')}</p>
                                            </div>
                                            <div className="text-right">
                                                <span
                                                    className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                                        yaEntregado
                                                            ? 'bg-slate-100 text-slate-700'
                                                            : 'bg-emerald-100 text-emerald-800'
                                                    }`}
                                                >
                                                    {yaEntregado ? 'Entregada' : 'Lista para entrega'}
                                                </span>
                                                <p className="font-bold text-slate-800 mt-1">${Number(p.monto_total || 0).toLocaleString('es-CO')}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    )}

                    {/* 5. SALDO PENDIENTE */}
                    {tarjetaActiva === 'saldo' && (
                        listaConSaldoPendiente.length === 0 ? (
                            <p className="text-xs text-emerald-700 font-medium">Este cliente no tiene solicitudes con saldo pendiente.</p>
                        ) : (
                            <div className="divide-y divide-slate-100 text-xs">
                                {listaConSaldoPendiente.map((p) => (
                                    <div key={p.pedido_id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="font-bold text-slate-900">Pedido #{p.pedido_id} · {p.prendas_resumen}</p>
                                            <p className="text-slate-500">
                                                Total: ${Number(p.monto_total).toLocaleString('es-CO')} · Abonado: ${Number(p.monto_pagado).toLocaleString('es-CO')}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold uppercase text-[10px]">
                                                {p.estado}
                                            </span>
                                            <p className="font-bold text-rose-600 mt-1">
                                                Saldo: ${Number(p.saldo_pendiente).toLocaleString('es-CO')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                <div>
                    <span className="text-slate-400">Última toma de medidas: </span>
                    <strong className="text-slate-800">
                        {kpis.ultima_toma_medidas ? new Date(kpis.ultima_toma_medidas).toLocaleDateString('es-CO') : 'Sin registros'}
                    </strong>
                </div>
                <div>
                    <span className="text-slate-400">Última visita / contacto: </span>
                    <strong className="text-slate-800">
                        {kpis.ultima_visita_taller ? new Date(kpis.ultima_visita_taller).toLocaleDateString('es-CO') : 'Sin registros'}
                    </strong>
                </div>
                <div>
                    <span className="text-slate-400">Última compra: </span>
                    <strong className="text-slate-800">
                        {kpis.ultima_compra ? new Date(kpis.ultima_compra).toLocaleDateString('es-CO') : 'Sin compras'}
                    </strong>
                </div>
            </div>

            {/* PESTAÑAS DEL EXPEDIENTE */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                {[
                    { id: 'crm', label: 'Perfil CRM y Notas Internas', icon: User },
                    { id: 'medidas', label: `Medidas y Comparador (${mediciones.length})`, icon: Ruler },
                    { id: 'historial', label: `Historial Prendas (${prendas_medida.length + prendas_catalogo.length})`, icon: Scissors },
                    { id: 'bitacora', label: `Bitácora Comunicaciones (${bitacora.length})`, icon: MessageSquare }
                ].map((t) => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTabActiva(t.id)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                                tabActiva === t.id
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: PERFIL CRM Y OBSERVACIONES INTERNAS */}
            {tabActiva === 'crm' && (
                <form onSubmit={handleGuardarCRM} className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4 max-w-3xl">
                    <h3 className="text-base font-bold text-slate-900">Datos de Contacto y Observaciones Confidenciales del Taller</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre completo</label>
                            <input
                                type="text"
                                value={formCRM.nombre}
                                onChange={(e) => setFormCRM({ ...formCRM, nombre: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Correo electrónico</label>
                            <input
                                type="text"
                                disabled
                                value={cliente.email}
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono</label>
                            <div className="relative">
                                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={formCRM.telefono}
                                    onChange={(e) => setFormCRM({ ...formCRM, telefono: e.target.value })}
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Medio de contacto preferido</label>
                            <select
                                value={formCRM.medio_contacto_preferido}
                                onChange={(e) => setFormCRM({ ...formCRM, medio_contacto_preferido: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                            >
                                <option value="whatsapp">WhatsApp</option>
                                <option value="llamada">Llamada telefónica</option>
                                <option value="correo">Correo electrónico</option>
                                <option value="sms">Mensaje SMS</option>
                                <option value="presencial">Presencial en taller</option>
                                <option value="otro">Otro</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Dirección de residencia / envío</label>
                        <div className="relative">
                            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Calle, número, barrio, ciudad..."
                                value={formCRM.direccion}
                                onChange={(e) => setFormCRM({ ...formCRM, direccion: e.target.value })}
                                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
                            />
                        </div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                        <label className="block text-xs font-bold text-amber-900">
                            Observaciones internas del cliente (solo visible para personal del taller)
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Ej. Particularidades posturales o anatómicas, horarios en que responde, historial de cumplimiento de pagos, preferencias de holgura..."
                            value={formCRM.observaciones_internas}
                            onChange={(e) => setFormCRM({ ...formCRM, observaciones_internas: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={guardando}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {guardando ? 'Guardando...' : 'Guardar Ficha CRM'}
                    </button>
                </form>
            )}

            {/* TAB 2: MEDIDAS ANTROPOMÉTRICAS POR REGIONES + COMPARADOR */}
            {tabActiva === 'medidas' && (
                <div className="space-y-6">
                    {mediciones.length >= 2 && (
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
                                    <h3 className="text-base font-bold text-slate-900">Comparador Evolutivo de Medidas</h3>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <select
                                        value={medidaBaseId}
                                        onChange={(e) => setMedidaBaseId(e.target.value)}
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                                    >
                                        {mediciones.map((m) => (
                                            <option key={m.medida_id} value={m.medida_id}>
                                                Base: {new Date(m.fecha_medicion).toLocaleDateString('es-CO')}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="font-bold text-slate-400">vs</span>
                                    <select
                                        value={medidaCompId}
                                        onChange={(e) => setMedidaCompId(e.target.value)}
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                                    >
                                        {mediciones.map((m) => (
                                            <option key={m.medida_id} value={m.medida_id}>
                                                Comparar: {new Date(m.fecha_medicion).toLocaleDateString('es-CO')}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-600 uppercase">
                                        <tr>
                                            <th className="py-2 px-3">Medida</th>
                                            <th className="py-2 px-3">Registro Base</th>
                                            <th className="py-2 px-3">Registro Comparado</th>
                                            <th className="py-2 px-3">Diferencia</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {comparacionMediciones.map((row) => (
                                            <tr key={row.label}>
                                                <td className="py-2 px-3 font-semibold text-slate-800">{row.label}</td>
                                                <td className="py-2 px-3">{row.v1 !== null ? `${row.v1} ${row.unidad}` : '-'}</td>
                                                <td className="py-2 px-3">{row.v2 !== null ? `${row.v2} ${row.unidad}` : '-'}</td>
                                                <td className={`py-2 px-3 font-bold ${
                                                    row.diff > 0 ? 'text-amber-600' : row.diff < 0 ? 'text-emerald-600' : 'text-slate-400'
                                                }`}>
                                                    {row.diff === null ? '-' : (row.diff > 0 ? `+${row.diff} ${row.unidad}` : `${row.diff} ${row.unidad}`)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleRegistrarMedicion} className="bg-white p-6 rounded-2xl border border-slate-200 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900">Nueva Toma de Medidas por Región Anatómica</h3>
                            <select
                                value={unidadMedida}
                                onChange={(e) => setUnidadMedida(e.target.value)}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold"
                            >
                                <option value="cm">Centímetros (cm)</option>
                                <option value="pulgadas">Pulgadas (in)</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {REGIONES_MEDIDAS.map((grupo) => (
                                <div key={grupo.region} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-700">
                                        {grupo.region}
                                    </h4>
                                    {grupo.campos.map((campo) => (
                                        <div key={campo.key} className="flex items-center justify-between gap-2">
                                            <label className="text-xs text-slate-700">{campo.label}</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                placeholder="0.0"
                                                value={valoresMedida[campo.key] ?? ''}
                                                onChange={(e) => setValoresMedida({ ...valoresMedida, [campo.key]: e.target.value })}
                                                className="w-24 px-2.5 py-1 rounded border border-slate-300 bg-white text-xs text-right"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones de la medición</label>
                            <input
                                type="text"
                                placeholder="Ej. Medido sobre camisa ligera, cliente prefiere holgura de +2cm en cintura..."
                                value={obsMedida}
                                onChange={(e) => setObsMedida(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                            {guardando ? 'Guardando...' : 'Guardar Toma de Medidas'}
                        </button>
                    </form>
                </div>
            )}

            {/* TAB 3: HISTORIAL DE PRENDAS (A MEDIDA VS CATÁLOGO + TALLAS HABITUALES) */}
            {tabActiva === 'historial' && (
                <div className="space-y-6">
                    {tallas_frecuentes?.length > 0 && (
                        <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-indigo-900">Antecedentes de ajuste en catálogo:</span>
                            {tallas_frecuentes.map((tf) => (
                                <span key={tf.etiqueta} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-indigo-700 border border-indigo-200">
                                    {tf.etiqueta} ({tf.veces}x)
                                </span>
                            ))}
                        </div>
                    )}

                    {/* 3.1 Prendas Personalizadas / A Medida */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Scissors className="w-4 h-4 text-indigo-600" />
                            Prendas Personalizadas o Confeccionadas a Medida ({prendas_medida.length})
                        </h3>
                        {prendas_medida.length === 0 ? (
                            <p className="text-xs text-slate-500">El cliente aún no tiene prendas confeccionadas a medida.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-600 uppercase">
                                        <tr>
                                            <th className="py-2 px-3">Pedido</th>
                                            <th className="py-2 px-3">Prenda / Diseño</th>
                                            <th className="py-2 px-3">Fecha</th>
                                            <th className="py-2 px-3">Precio</th>
                                            <th className="py-2 px-3">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {prendas_medida.map((pm) => (
                                            <tr key={pm.detalle_id}>
                                                <td className="py-2.5 px-3 font-bold">#{pm.pedido_id}</td>
                                                <td className="py-2.5 px-3">
                                                    <p className="font-bold text-slate-900">{pm.prenda_nombre}</p>
                                                    <p className="text-slate-500 line-clamp-1">{pm.descripcion}</p>
                                                </td>
                                                <td className="py-2.5 px-3">{new Date(pm.fecha_pedido).toLocaleDateString('es-CO')}</td>
                                                <td className="py-2.5 px-3 font-bold">${Number(pm.subtotal || 0).toLocaleString('es-CO')}</td>
                                                <td className="py-2.5 px-3 uppercase font-bold text-indigo-700">{pm.estado_pedido}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* 3.2 Prendas Compradas de Catálogo */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <ShoppingBag className="w-4 h-4 text-sky-600" />
                            Prendas Compradas de Catálogo ({prendas_catalogo.length})
                        </h3>
                        {prendas_catalogo.length === 0 ? (
                            <p className="text-xs text-slate-500">El cliente aún no tiene compras de catálogo.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 text-slate-600 uppercase">
                                        <tr>
                                            <th className="py-2 px-3">Pedido</th>
                                            <th className="py-2 px-3">Prenda</th>
                                            <th className="py-2 px-3">Talla</th>
                                            <th className="py-2 px-3">Fecha</th>
                                            <th className="py-2 px-3">Precio</th>
                                            <th className="py-2 px-3">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {prendas_catalogo.map((pc) => (
                                            <tr key={pc.detalle_id}>
                                                <td className="py-2.5 px-3 font-bold">#{pc.pedido_id}</td>
                                                <td className="py-2.5 px-3 font-bold text-slate-900">{pc.prenda_nombre} (x{pc.cantidad})</td>
                                                <td className="py-2.5 px-3">{pc.talla || '-'}</td>
                                                <td className="py-2.5 px-3">{new Date(pc.fecha_pedido).toLocaleDateString('es-CO')}</td>
                                                <td className="py-2.5 px-3 font-bold">${Number(pc.subtotal || 0).toLocaleString('es-CO')}</td>
                                                <td className="py-2.5 px-3 uppercase font-bold text-sky-700">{pc.estado_pedido}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: BITÁCORA DE COMUNICACIONES */}
            {tabActiva === 'bitacora' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <form onSubmit={handleRegistrarBitacora} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 h-fit">
                        <h3 className="text-base font-bold text-slate-900">Registrar Nueva Comunicación</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <select
                                value={formBitacora.canal}
                                onChange={(e) => setFormBitacora({ ...formBitacora, canal: e.target.value })}
                                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                            >
                                <option value="whatsapp">WhatsApp</option>
                                <option value="llamada">Llamada</option>
                                <option value="presencial">Presencial</option>
                                <option value="correo">Correo</option>
                            </select>
                            <select
                                value={formBitacora.tipo}
                                onChange={(e) => setFormBitacora({ ...formBitacora, tipo: e.target.value })}
                                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs"
                            >
                                <option value="nota">Nota general</option>
                                <option value="cotizacion">Cotización</option>
                                <option value="prueba_vestuario">Prueba de vestuario</option>
                                <option value="aviso_entrega">Aviso de entrega</option>
                                <option value="recordatorio_pago">Recordatorio de pago</option>
                            </select>
                        </div>

                        <textarea
                            rows={3}
                            required
                            placeholder="Resumen de lo conversado o acordado con el cliente..."
                            value={formBitacora.resumen}
                            onChange={(e) => setFormBitacora({ ...formBitacora, resumen: e.target.value })}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                        />

                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">Fecha de seguimiento (opcional)</label>
                            <input
                                type="datetime-local"
                                value={formBitacora.fecha_recordatorio}
                                onChange={(e) => setFormBitacora({ ...formBitacora, fecha_recordatorio: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={guardando}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                        >
                            <CheckCircle2 className="w-4 h-4" /> Guardar en Bitácora
                        </button>
                    </form>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                        <h3 className="text-base font-bold text-slate-900">Historial de Seguimiento ({bitacora.length})</h3>
                        {bitacora.length === 0 ? (
                            <p className="text-xs text-slate-500">Aún no hay registros en la bitácora de este cliente.</p>
                        ) : (
                            <div className="space-y-2.5 max-h-[450px] overflow-y-auto">
                                {bitacora.map((b) => (
                                    <div key={b.bitacora_id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1">
                                        <div className="flex items-center justify-between text-[11px]">
                                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold uppercase">
                                                {b.canal} · {b.tipo}
                                            </span>
                                            <span className="text-slate-400">
                                                {new Date(b.creado_en).toLocaleString('es-CO')}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-800">{b.resumen}</p>
                                        <p className="text-[10px] text-slate-500">Registrado por: {b.usuario_nombre}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}