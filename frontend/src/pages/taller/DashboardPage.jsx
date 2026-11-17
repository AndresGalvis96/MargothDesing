import { useEffect, useState } from 'react';
import { reporteService } from '../../api/services';
import { AlertTriangle, Clock, DollarSign, Scissors, PackageX } from 'lucide-react';

export default function DashboardPage() {
    const [kpis, setKpis] = useState(null);
    const [stockBajo, setStockBajo] = useState([]);

    useEffect(() => {
        reporteService.dashboard().then(({ data }) => setKpis(data.kpis)).catch(() => {});
        reporteService.stockBajo().then(({ data }) => setStockBajo(data.materiales_criticos || [])).catch(() => {});
    }, []);

    if (!kpis) return <p className="text-sm text-slate-500">Cargando indicadores del taller...</p>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Panel de Control del Taller</h2>
                <p className="text-sm text-slate-500">Indicadores operativos y financieros en tiempo real</p>
            </div>

            {kpis.alerta_umbral_superado && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-center gap-3 text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm font-medium">
                        Alerta de capacidad: Tienes <strong>{kpis.pedidos_pendientes_respuesta}</strong> pedidos sin responder (el más antiguo lleva <strong>{kpis.max_horas_espera_pendiente} h</strong>).
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase">
                        <span>Pendientes de Respuesta</span>
                        <Clock className="w-4 h-4 text-amber-500" />
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 mt-2">{kpis.pedidos_pendientes_respuesta}</p>
                    <p className="text-xs text-slate-400 mt-1">Resp. promedio: {kpis.tiempo_promedio_respuesta_min} min</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase">
                        <span>En Producción Activa</span>
                        <Scissors className="w-4 h-4 text-indigo-600" />
                    </div>
                    <p className="text-3xl font-extrabold text-indigo-600 mt-2">{kpis.pedidos_activos_produccion}</p>
                    <p className="text-xs text-slate-400 mt-1">Órdenes aceptadas o en taller</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase">
                        <span>Ingresos del Mes</span>
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-3xl font-extrabold text-emerald-600 mt-2">
                        ${Number(kpis.ingresos_mes_actual).toLocaleString('es-CO')}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Pagos confirmados en caja</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center text-slate-500 text-xs font-semibold uppercase">
                        <span>Materiales Stock Bajo</span>
                        <PackageX className="w-4 h-4 text-rose-600" />
                    </div>
                    <p className="text-3xl font-extrabold text-rose-600 mt-2">{kpis.materiales_stock_bajo}</p>
                    <p className="text-xs text-slate-400 mt-1">Requieren reposición inmediata</p>
                </div>
            </div>

            {stockBajo.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="px-5 py-3.5 border-b bg-rose-50 font-bold text-sm text-rose-800">
                        Insumos en Stock Crítico
                    </div>
                    <table className="w-full text-left text-sm">
                        <thead className="border-b text-xs uppercase text-slate-500">
                            <tr>
                                <th className="px-5 py-2.5">Material</th>
                                <th className="px-5 py-2.5">Categoría</th>
                                <th className="px-5 py-2.5">Stock Actual</th>
                                <th className="px-5 py-2.5">Mínimo</th>
                                <th className="px-5 py-2.5">Déficit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {stockBajo.map((m) => (
                                <tr key={m.material_id}>
                                    <td className="px-5 py-2.5 font-semibold">{m.nombre}</td>
                                    <td className="px-5 py-2.5 capitalize">{m.categoria}</td>
                                    <td className="px-5 py-2.5 text-rose-600 font-bold">{m.stock_actual} {m.unidad}</td>
                                    <td className="px-5 py-2.5">{m.stock_minimo} {m.unidad}</td>
                                    <td className="px-5 py-2.5 font-semibold text-amber-700">-{m.deficit} {m.unidad}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}