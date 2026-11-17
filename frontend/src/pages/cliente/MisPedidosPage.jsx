import { useEffect, useState } from 'react';
import { pedidoService, pagoService, imagenService } from '../../api/services';
import { API_BASE_URL } from '../../api/axiosClient';
import {
    Package, ChevronRight, XCircle, PhoneCall, ShieldCheck,
    CreditCard, Shirt, FileText, X
} from 'lucide-react';

const BADGES_ESTADO = {
    solicitado: { label: 'Solicitado (Pendiente de revisión)', color: 'bg-amber-100 text-amber-800 border-amber-200' },
    aceptado: { label: 'Aprobado / Listo para anticipo', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    en_produccion: { label: 'En confección', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    terminado: { label: 'Terminado (Listo para entrega)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    entregado: { label: 'Entregado', color: 'bg-slate-200 text-slate-800 border-slate-300' },
    rechazado: { label: 'Rechazado por el taller', color: 'bg-rose-100 text-rose-800 border-rose-200' },
    cancelado: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function MisPedidosPage() {
    const [pedidos, setPedidos] = useState([]);
    const [pedidoActivo, setPedidoActivo] = useState(null); // { pedido, items }
    const [pagosPedido, setPagosPedido] = useState([]);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    const [mostrarTerminos, setMostrarTerminos] = useState(false);
    const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

    // Estado para reportar transferencia / abono
    const [abono, setAbono] = useState({ monto: '', metodo: 'transferencia', referencia: '' });
    const [enviandoPago, setEnviandoPago] = useState(false);

    const cargarPedidos = async () => {
        try {
            const { data } = await pedidoService.listar();
            setPedidos(data);
        } catch {
            setPedidos([]);
        }
    };

    useEffect(() => {
        cargarPedidos();
    }, []);

    const abrirDetallePedido = async (pedidoId) => {
        setCargandoDetalle(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            const detRes = await pedidoService.detalle(pedidoId);
            const detalleData = detRes.data;

            // Buscar imagen de referencia del detalle del pedido o foto de catálogo de la prenda
            if (Array.isArray(detalleData?.items)) {
                await Promise.all(
                    detalleData.items.map(async (it) => {
                        // 1. Primero buscar en las fotos adjuntas al detalle del pedido (referencias personalizadas)
                        if (!it.imagen_ruta && it.detalle_id) {
                            try {
                                const detImgRes = await imagenService.listarDetallePedido(it.detalle_id);
                                if (detImgRes.data?.length > 0) {
                                    it.imagen_ruta = detImgRes.data[0].ruta;
                                    return;
                                }
                            } catch { /* sin foto en detalle */ }
                        }

                        // 2. Si no tiene foto en el detalle, buscar en la galería de catálogo de la prenda
                        if (!it.imagen_ruta && it.prenda_id) {
                            try {
                                const imgRes = await imagenService.listarPrenda(it.prenda_id);
                                if (imgRes.data?.length > 0) {
                                    it.imagen_ruta = imgRes.data[0].ruta;
                                }
                            } catch { /* sin foto en prenda */ }
                        }
                    })
                );
            }

            setPedidoActivo(detalleData);

            // Cargar pagos de forma independiente para nunca bloquear el detalle
            try {
                if (typeof pagoService?.listarPorPedido === 'function') {
                    const pagosRes = await pagoService.listarPorPedido(pedidoId);
                    setPagosPedido(Array.isArray(pagosRes.data) ? pagosRes.data : (pagosRes.data?.pagos || []));
                } else if (typeof pagoService?.listar === 'function') {
                    const pagosRes = await pagoService.listar({ pedido_id: pedidoId });
                    setPagosPedido(Array.isArray(pagosRes.data) ? pagosRes.data : (pagosRes.data?.pagos || []));
                } else {
                    setPagosPedido([]);
                }
            } catch {
                setPagosPedido([]);
            }
        } catch (err) {
            console.error('Detalle error:', err);
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || err.message || 'No se pudo cargar el detalle del pedido.'
            });
        } finally {
            setCargandoDetalle(false);
        }
    };

    const handleCancelarSolicitud = async (pedidoId) => {
        if (!window.confirm('¿Seguro que deseas cancelar esta solicitud? Esta acción no se puede deshacer.')) return;
        try {
            await pedidoService.cancelar(pedidoId);
            setMensaje({ tipo: 'exito', texto: `La solicitud #${pedidoId} fue cancelada correctamente.` });
            await cargarPedidos();
            await abrirDetallePedido(pedidoId);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo cancelar el pedido.' });
        }
    };

    const handleReportarPago = async (e) => {
        e.preventDefault();
        if (!pedidoActivo?.pedido) return;
        setEnviandoPago(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            await pagoService.registrar({
                pedido_id: pedidoActivo.pedido.pedido_id,
                monto: Number(abono.monto),
                metodo_pago: abono.metodo,
                referencia_transaccion: abono.referencia.trim() || null
            });
            setMensaje({ tipo: 'exito', texto: 'Abono registrado. El taller verificará el comprobante.' });
            setAbono({ monto: '', metodo: 'transferencia', referencia: '' });
            await abrirDetallePedido(pedidoActivo.pedido.pedido_id);
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar el abono.' });
        } finally {
            setEnviandoPago(false);
        }
    };

    const totalAbonado = pagosPedido
        .filter((pg) => pg.estado !== 'rechazado')
        .reduce((sum, pg) => sum + Number(pg.monto || 0), 0);

    const costoTotal = Number(pedidoActivo?.pedido?.costo_total || 0);
    const saldoPendiente = Math.max(0, costoTotal - totalAbonado);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Mis Pedidos y Pagos</h2>
                    <p className="text-sm text-slate-500">
                        Haz clic en cualquier solicitud para ver su detalle, atención del taller y estado de abonos
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setMostrarTerminos(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Términos de Confección y Anticipos
                </button>
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUMNA IZQUIERDA: LISTA DE PEDIDOS */}
                <div className="lg:col-span-5 space-y-3">
                    {pedidos.length === 0 ? (
                        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
                            Aún no tienes pedidos registrados.
                        </div>
                    ) : (
                        pedidos.map((p) => {
                            const badge = BADGES_ESTADO[p.estado] || { label: p.estado, color: 'bg-slate-100 text-slate-700' };
                            const seleccionado = pedidoActivo?.pedido?.pedido_id === p.pedido_id;

                            return (
                                <button
                                    key={p.pedido_id}
                                    type="button"
                                    onClick={() => abrirDetallePedido(p.pedido_id)}
                                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                        seleccionado
                                            ? 'bg-indigo-50/60 border-indigo-500 shadow-sm'
                                            : 'bg-white border-slate-200 hover:border-indigo-300'
                                    }`}
                                >
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-900 text-sm">Pedido #{p.pedido_id}</span>
                                            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${badge.color}`}>
                                                {badge.label}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500">
                                            Taller: <strong className="text-slate-700">{p.taller_nombre}</strong> •{' '}
                                            {new Date(p.fecha_solicitud).toLocaleDateString('es-CO')}
                                        </p>
                                        <p className="text-sm font-extrabold text-slate-900">
                                            {Number(p.costo_total) > 0
                                                ? `$${Number(p.costo_total).toLocaleString('es-CO')}`
                                                : 'Por cotizar con el taller'}
                                        </p>
                                    </div>
                                    <ChevronRight className={`w-5 h-5 shrink-0 ${seleccionado ? 'text-indigo-600' : 'text-slate-400'}`} />
                                </button>
                            );
                        })
                    )}
                </div>

                {/* COLUMNA DERECHA: DETALLE COMPLETO DEL PEDIDO SELECCIONADO */}
                <div className="lg:col-span-7">
                    {cargandoDetalle ? (
                        <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-sm text-slate-500">
                            Cargando información de la solicitud...
                        </div>
                    ) : !pedidoActivo ? (
                        <div className="bg-white p-10 rounded-xl border border-dashed border-slate-300 text-center text-slate-500 space-y-2">
                            <Package className="w-10 h-10 text-slate-300 mx-auto" />
                            <p className="text-sm font-medium">Selecciona un pedido de la izquierda para ver sus detalles, fotos y estado de pago.</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden space-y-5 p-6">
                            {/* Cabecera del detalle */}
                            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h3 className="text-xl font-bold text-slate-900">
                                            Solicitud #{pedidoActivo.pedido.pedido_id}
                                        </h3>
                                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${
                                            (BADGES_ESTADO[pedidoActivo.pedido.estado] || {}).color || 'bg-slate-100'
                                        }`}>
                                            {(BADGES_ESTADO[pedidoActivo.pedido.estado] || {}).label || pedidoActivo.pedido.estado}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Taller: <strong>{pedidoActivo.pedido.taller_nombre}</strong> • Prioridad:{' '}
                                        <span className="capitalize">{pedidoActivo.pedido.prioridad}</span>
                                    </p>
                                </div>

                                {/* BOTÓN CANCELAR ÚNICAMENTE CUANDO NO HA SIDO APROBADO ('solicitado') */}
                                {pedidoActivo.pedido.estado === 'solicitado' && (
                                    <button
                                        type="button"
                                        onClick={() => handleCancelarSolicitud(pedidoActivo.pedido.pedido_id)}
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Cancelar Solicitud
                                    </button>
                                )}
                            </div>

                            {/* AVISO DE ATENCIÓN PRIORITARIA DE SASTRERÍA */}
                            {['solicitado', 'aceptado'].includes(pedidoActivo.pedido.estado) && (
                                <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-2">
                                    <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                                        <PhoneCall className="w-4 h-4 text-indigo-600 shrink-0" />
                                        <span>Atención Personalizada de tu Sastre de Confianza</span>
                                    </div>
                                    <p className="text-xs text-indigo-900/90 leading-relaxed">
                                        Un representante especializado de <strong>{pedidoActivo.pedido.taller_nombre}</strong> se comunicará contigo para confirmar medidas, telas, ajustes y definir el precio exacto según la complejidad de tu prenda.
                                    </p>
                                    <p className="text-xs text-indigo-900/90 leading-relaxed">
                                        Tras acordar los detalles, el taller fijará el <strong>abono mínimo de inicio</strong> (correspondiente al valor base de materiales) para comenzar la manufactura.{' '}
                                        <button
                                            type="button"
                                            onClick={() => setMostrarTerminos(true)}
                                            className="underline font-semibold hover:text-indigo-700"
                                        >
                                            Ver condiciones de anticipo y cancelación
                                        </button>.
                                    </p>
                                </div>
                            )}

                            {pedidoActivo.pedido.estado === 'rechazado' && pedidoActivo.pedido.motivo_rechazo && (
                                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                                    <strong>Motivo del taller:</strong> {pedidoActivo.pedido.motivo_rechazo}
                                </div>
                            )}

                            {/* PRENDAS / ÍTEMS SOLICITADOS CON SU IMAGEN */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Prendas en esta solicitud ({pedidoActivo.items.length})
                                </h4>
                                {pedidoActivo.items.map((it) => (
                                    <div key={it.detalle_id} className="flex gap-4 p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
                                        <div className="w-24 h-24 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                                            {it.imagen_ruta ? (
                                                <img
                                                    src={`${API_BASE_URL}${it.imagen_ruta.startsWith('/') ? '' : '/'}${it.imagen_ruta}`}
                                                    alt={it.prenda_nombre}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <Shirt className="w-8 h-8 text-slate-300" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="font-bold text-slate-900 text-sm">{it.prenda_nombre}</p>
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 capitalize">
                                                    Estado: {it.estado_confeccion.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-600">
                                                Tipo: <span className="capitalize">{it.tipo_prenda}</span> • Talla:{' '}
                                                <strong>{it.talla || 'Por acordar'}</strong> • Cantidad:{' '}
                                                <strong>{it.cantidad}</strong>
                                            </p>
                                            {it.descripcion && (
                                                <p className="text-xs text-slate-500 italic">"{it.descripcion}"</p>
                                            )}
                                            <p className="text-xs font-bold text-slate-800 pt-1">
                                                {Number(it.subtotal) > 0
                                                    ? `Subtotal acordado: $${Number(it.subtotal).toLocaleString('es-CO')}`
                                                    : 'Subtotal: Pendiente de cotización tras llamada con el taller'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* RESUMEN FINANCIERO Y ABONOS */}
                            <div className="border-t border-slate-100 pt-4 space-y-4">
                                <div className="grid grid-cols-3 gap-3 text-center">
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                        <p className="text-[11px] text-slate-500">Valor Total</p>
                                        <p className="text-base font-extrabold text-slate-900">
                                            {costoTotal > 0 ? `$${costoTotal.toLocaleString('es-CO')}` : 'Por definir'}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                                        <p className="text-[11px] text-emerald-700">Total Abonado</p>
                                        <p className="text-base font-extrabold text-emerald-800">
                                            ${totalAbonado.toLocaleString('es-CO')}
                                        </p>
                                    </div>
                                    <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200">
                                        <p className="text-[11px] text-amber-700">Saldo Pendiente</p>
                                        <p className="text-base font-extrabold text-amber-900">
                                            {costoTotal > 0 ? `$${saldoPendiente.toLocaleString('es-CO')}` : '—'}
                                        </p>
                                    </div>
                                </div>
                                {Number(pedidoActivo.pedido.anticipo_minimo) > 0 && totalAbonado < Number(pedidoActivo.pedido.anticipo_minimo) && (
    <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900">
        <strong>Anticipo mínimo requerido para iniciar confección:</strong>{' '}
        ${Number(pedidoActivo.pedido.anticipo_minimo).toLocaleString('es-CO')}.
        {pedidoActivo.pedido.notas_cotizacion && (
            <span className="block mt-1 italic">Acuerdo con el taller: "{pedidoActivo.pedido.notas_cotizacion}"</span>
        )}
    </div>
)}

                                {/* Formulario de reporte de abono cuando ya tiene costo asignado y no está cancelado/rechazado */}
                                {costoTotal > 0 && saldoPendiente > 0 && !['cancelado', 'rechazado'].includes(pedidoActivo.pedido.estado) && (
                                    <form onSubmit={handleReportarPago} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                                        <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <CreditCard className="w-4 h-4 text-indigo-600" />
                                            Registrar Anticipo o Pago de Saldo
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <input
                                                type="number"
                                                min={1000}
                                                max={saldoPendiente}
                                                required
                                                placeholder="Monto ($)"
                                                value={abono.monto}
                                                onChange={(e) => setAbono({ ...abono, monto: e.target.value })}
                                                className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                                            />
                                            <select
                                                value={abono.metodo}
                                                onChange={(e) => setAbono({ ...abono, metodo: e.target.value })}
                                                className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                                            >
                                                <option value="transferencia">Transferencia / Nequi / Daviplata</option>
                                                <option value="efectivo">Efectivo en taller</option>
                                                <option value="tarjeta">Tarjeta / Datáfono</option>
                                            </select>
                                            <input
                                                type="text"
                                                placeholder="N° Comprobante (opcional)"
                                                value={abono.referencia}
                                                onChange={(e) => setAbono({ ...abono, referencia: e.target.value })}
                                                className="px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={enviandoPago}
                                            className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                                        >
                                            {enviandoPago ? 'Registrando...' : 'Enviar Reporte de Pago'}
                                        </button>
                                    </form>
                                )}

                                {/* Nota de cancelación tras aprobación */}
                                {pedidoActivo.pedido.estado !== 'solicitado' && !['cancelado', 'rechazado', 'entregado'].includes(pedidoActivo.pedido.estado) && (
                                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                        <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span>
                                            Este pedido ya fue aprobado por el taller. Si necesitas solicitar una cancelación o cambio, comunícate directamente con el taller según nuestros{' '}
                                            <button type="button" onClick={() => setMostrarTerminos(true)} className="underline text-indigo-600 font-medium">
                                                Términos de Uso
                                            </button>.
                                        </span>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL DE TÉRMINOS DE CONFECCIÓN, ANTICIPOS Y ABANDONO */}
            {mostrarTerminos && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-lg font-bold text-slate-900">Términos de Confección a Medida y Pagos</h3>
                            <button onClick={() => setMostrarTerminos(false)} className="p-1 text-slate-400 hover:text-slate-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="font-bold text-slate-800 mb-1">1. Atención Personalizada y Cotización</p>
                                <p>
                                    Toda solicitud personalizada incluye comunicación directa con un representante del taller para validar medidas, telas y acabados. El precio final puede variar según la complejidad del diseño y los insumos seleccionados.
                                </p>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="font-bold text-slate-800 mb-1">2. Anticipo Mínimo para Iniciar Manufactura</p>
                                <p>
                                    Una vez acordado el valor total, el cliente podrá pagar la totalidad o realizar un abono mínimo equivalente al costo de los materiales definido por el taller. La confección inicia únicamente tras confirmarse dicho anticipo.
                                </p>
                            </div>

                            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                                <p className="font-bold text-slate-800 mb-1">3. Política de Cancelación</p>
                                <p>
                                    El cliente puede cancelar directamente desde la plataforma únicamente mientras la solicitud esté en estado <strong>Solicitado</strong> (antes de ser aprobada). Una vez aprobada y abonado el anticipo, cualquier cancelación deberá solicitarse directamente al taller exponiendo el motivo para evaluar el avance de corte y materiales.
                                </p>
                            </div>

                            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900">
                                <p className="font-bold mb-1">4. Plazo de Liquidación y Paso a Venta General</p>
                                <p>
                                    Si transcurrido el plazo establecido por el taller tras finalizar la prenda el cliente no completa el pago del saldo restante ni se comunica con el taller, la prenda personalizada podrá pasar a <strong>venta general</strong>. El cliente conservará la posibilidad de liquidar su saldo mientras la prenda siga disponible; una vez vendida a un tercero, no habrá lugar a devoluciones ni reclamos.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setMostrarTerminos(false)}
                            className="w-full py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}