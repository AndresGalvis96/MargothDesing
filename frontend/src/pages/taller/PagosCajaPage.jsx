import { useEffect, useState } from 'react';
import { pagoService } from '../../api/services';
import StatusBadge from '../../components/shared/StatusBadge';

export default function PagosCajaPage() {
    const [ingresos, setIngresos] = useState([]);
    const [pedidoConsulta, setPedidoConsulta] = useState('');
    const [estadoCuenta, setEstadoCuenta] = useState(null);
    const [nuevoPago, setNuevoPago] = useState({ pedido_id: '', monto: '', metodo: 'efectivo', referencia: '' });
    const [mensaje, setMensaje] = useState('');

    const cargarIngresos = () => {
        pagoService.ingresosTaller().then(({ data }) => setIngresos(data.ingresos || data || [])).catch(() => {});
    };

    useEffect(() => {
        cargarIngresos();
    }, []);

    const buscarCuentaPedido = async (e) => {
        e?.preventDefault();
        if (!pedidoConsulta) return;
        try {
            const { data } = await pagoService.porPedido(pedidoConsulta);
            setEstadoCuenta(data);
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Pedido no encontrado.');
        }
    };

    const registrarAbono = async (e) => {
        e.preventDefault();
        setMensaje('');
        try {
            await pagoService.registrar({
                pedido_id: Number(nuevoPago.pedido_id),
                monto: Number(nuevoPago.monto),
                metodo: nuevoPago.metodo,
                referencia: nuevoPago.referencia || null
            });
            setMensaje('Abono registrado y confirmado en caja.');
            setPedidoConsulta(nuevoPago.pedido_id);
            setNuevoPago({ pedido_id: '', monto: '', metodo: 'efectivo', referencia: '' });
            cargarIngresos();
            const { data } = await pagoService.porPedido(pedidoConsulta || nuevoPago.pedido_id);
            setEstadoCuenta(data);
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error al registrar abono.');
        }
    };

    const confirmarTransferencia = async (pagoId) => {
        try {
            await pagoService.cambiarEstado(pagoId, 'confirmado');
            setMensaje(`Pago #${pagoId} confirmado.`);
            cargarIngresos();
            buscarCuentaPedido();
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error al confirmar pago.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Caja, Abonos e Ingresos</h2>
                <p className="text-sm text-slate-500">Registra pagos en mostrador y valida comprobantes de clientes</p>
            </div>

            {mensaje && <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm">{mensaje}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <form onSubmit={registrarAbono} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <h3 className="font-bold text-sm text-slate-800">Registrar Nuevo Abono</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" required placeholder="ID Pedido" value={nuevoPago.pedido_id} onChange={(e) => setNuevoPago({ ...nuevoPago, pedido_id: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                        <input type="number" required placeholder="Monto ($)" value={nuevoPago.monto} onChange={(e) => setNuevoPago({ ...nuevoPago, monto: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <select value={nuevoPago.metodo} onChange={(e) => setNuevoPago({ ...nuevoPago, metodo: e.target.value })} className="px-3 py-2 rounded-lg border text-sm bg-white">
                            <option value="efectivo">Efectivo</option>
                            <option value="transferencia">Transferencia</option>
                            <option value="tarjeta">Tarjeta</option>
                        </select>
                        <input placeholder="Referencia (opcional)" value={nuevoPago.referencia} onChange={(e) => setNuevoPago({ ...nuevoPago, referencia: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                    </div>
                    <button type="submit" className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Registrar Pago</button>
                </form>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                    <h3 className="font-bold text-sm text-slate-800">Consultar Saldo por Pedido</h3>
                    <form onSubmit={buscarCuentaPedido} className="flex gap-2">
                        <input type="number" required placeholder="N° de Pedido" value={pedidoConsulta} onChange={(e) => setPedidoConsulta(e.target.value)} className="flex-1 px-3 py-2 rounded-lg border text-sm" />
                        <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold">Buscar</button>
                    </form>

                    {estadoCuenta && (
                        <div className="space-y-2 pt-2">
                            <div className="flex justify-between text-xs font-bold">
                                <span>Total: ${Number(estadoCuenta.resumen_financiero.costo_total_pedido).toLocaleString('es-CO')}</span>
                                <span className="text-rose-600">Pendiente: ${Number(estadoCuenta.resumen_financiero.saldo_pendiente).toLocaleString('es-CO')}</span>
                            </div>
                            {estadoCuenta.pagos.map((pg) => (
                                <div key={pg.pago_id} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded border">
                                    <span>#{pg.pago_id} • ${Number(pg.monto).toLocaleString('es-CO')} ({pg.metodo})</span>
                                    <div className="flex items-center gap-2">
                                        <StatusBadge estado={pg.estado} />
                                        {pg.estado === 'pendiente' && (
                                            <button onClick={() => confirmarTransferencia(pg.pago_id)} className="px-2 py-1 bg-emerald-600 text-white rounded font-semibold">
                                                Confirmar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b bg-slate-50 font-bold text-sm">Historial de Ingresos Confirmados del Taller</div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-4 py-2.5">Pago #</th>
                            <th className="px-4 py-2.5">Pedido #</th>
                            <th className="px-4 py-2.5">Método</th>
                            <th className="px-4 py-2.5">Monto</th>
                            <th className="px-4 py-2.5">Fecha</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {ingresos.map((ing) => (
                            <tr key={ing.pago_id}>
                                <td className="px-4 py-2.5">#{ing.pago_id}</td>
                                <td className="px-4 py-2.5 font-semibold">#{ing.pedido_id}</td>
                                <td className="px-4 py-2.5 capitalize">{ing.metodo}</td>
                                <td className="px-4 py-2.5 font-bold text-emerald-600">${Number(ing.monto).toLocaleString('es-CO')}</td>
                                <td className="px-4 py-2.5 text-slate-500">{new Date(ing.fecha_pago).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}