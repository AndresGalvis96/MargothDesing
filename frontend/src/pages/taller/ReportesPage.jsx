import { useEffect, useState } from 'react';
import { reporteService } from '../../api/services';

export default function ReportesPage() {
    const [produccion, setProduccion] = useState([]);
    const [consumo, setConsumo] = useState({ costo_total_insumos_periodo: 0, detalle_por_material: [] });

    useEffect(() => {
        reporteService.produccionOperarios().then(({ data }) => setProduccion(data)).catch(() => {});
        reporteService.consumoMateriales().then(({ data }) => setConsumo(data)).catch(() => {});
    }, []);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Reportes Analíticos del Taller</h2>
                <p className="text-sm text-slate-500">Rendimiento de confección por operario y costo de insumos consumidos</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b bg-slate-50 font-bold text-sm">Producción Terminada por Operario</div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-5 py-3">Operario</th>
                            <th className="px-5 py-3">Tipo Prenda</th>
                            <th className="px-5 py-3">Prendas Terminadas</th>
                            <th className="px-5 py-3">Promedio Minutos</th>
                            <th className="px-5 py-3">Mano de Obra</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {produccion.length === 0 ? (
                            <tr><td colSpan={5} className="px-5 py-4 text-center text-slate-400">Aún no hay ítems terminados registrados.</td></tr>
                        ) : (
                            produccion.map((r, i) => (
                                <tr key={i}>
                                    <td className="px-5 py-3 font-semibold">{r.operario_nombre}</td>
                                    <td className="px-5 py-3 capitalize">{r.tipo_prenda}</td>
                                    <td className="px-5 py-3 font-bold text-indigo-600">{r.prendas_confeccionadas}</td>
                                    <td className="px-5 py-3">{r.promedio_minutos_por_item} min</td>
                                    <td className="px-5 py-3 font-semibold">${Number(r.total_mano_obra).toLocaleString('es-CO')}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3.5 border-b bg-slate-50 flex justify-between items-center">
                    <span className="font-bold text-sm">Consumo Acumulado de Materiales</span>
                    <span className="text-sm font-bold text-indigo-600">
                        Costo total insumos: ${Number(consumo.costo_total_insumos_periodo).toLocaleString('es-CO')}
                    </span>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-5 py-3">Material</th>
                            <th className="px-5 py-3">Categoría</th>
                            <th className="px-5 py-3">Cantidad Usada</th>
                            <th className="px-5 py-3">Veces Utilizado</th>
                            <th className="px-5 py-3">Costo Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {consumo.detalle_por_material.map((m) => (
                            <tr key={m.material_id}>
                                <td className="px-5 py-3 font-semibold">{m.material}</td>
                                <td className="px-5 py-3 capitalize">{m.categoria}</td>
                                <td className="px-5 py-3">{m.cantidad_total_consumida}</td>
                                <td className="px-5 py-3">{m.veces_utilizado}</td>
                                <td className="px-5 py-3 font-semibold">${Number(m.costo_total_consumido).toLocaleString('es-CO')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}