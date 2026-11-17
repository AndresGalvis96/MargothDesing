import { useEffect, useState } from 'react';
import { medidaService } from '../../api/services';

export default function MisMedidasPage() {
    const [datos, setDatos] = useState({ medidas_vigentes: [], historial_completo: [] });
    const [nueva, setNueva] = useState({ tipo_medida: 'contorno_pecho', valor: '', unidad: 'cm' });
    const [mensaje, setMensaje] = useState('');

    const cargar = () => {
        medidaService.misMedidas().then(({ data }) => setDatos(data)).catch(() => {});
    };

    useEffect(() => {
        cargar();
    }, []);

    const guardarMedida = async (e) => {
        e.preventDefault();
        setMensaje('');
        try {
            await medidaService.registrar({
                medidas: [{ ...nueva, valor: Number(nueva.valor) }]
            });
            setMensaje('Medida registrada y actualizada como vigente.');
            setNueva({ ...nueva, valor: '' });
            cargar();
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error al guardar la medida.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Mis Medidas Corporales</h2>
                <p className="text-sm text-slate-500">Las medidas vigentes se usan automáticamente para tus prendas a medida</p>
            </div>

            {mensaje && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
                    {mensaje}
                </div>
            )}

            <form onSubmit={guardarMedida} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Parte del cuerpo</label>
                    <select
                        value={nueva.tipo_medida}
                        onChange={(e) => setNueva({ ...nueva, tipo_medida: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    >
                        {['contorno_pecho', 'cintura', 'cadera', 'largo_manga', 'espalda', 'largo_pantalon', 'cuello'].map((m) => (
                            <option key={m} value={m}>{m.replace('_', ' ')}</option>
                        ))}
                    </select>
                </div>
                <div className="w-32">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Valor</label>
                    <input
                        type="number"
                        step="0.1"
                        required
                        value={nueva.valor}
                        onChange={(e) => setNueva({ ...nueva, valor: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                </div>
                <div className="w-28">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Unidad</label>
                    <select
                        value={nueva.unidad}
                        onChange={(e) => setNueva({ ...nueva, unidad: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    >
                        <option value="cm">cm</option>
                        <option value="pulgadas">pulgadas</option>
                    </select>
                </div>
                <button type="submit" className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700">
                    Guardar Medida
                </button>
            </form>

            <div>
                <h3 className="text-lg font-bold text-slate-800 mb-3">Medidas Vigentes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {datos.medidas_vigentes.map((m) => (
                        <div key={m.medida_id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{m.tipo_medida.replace('_', ' ')}</p>
                            <p className="text-2xl font-extrabold text-indigo-600 mt-1">{m.valor} <span className="text-sm font-normal text-slate-500">{m.unidad}</span></p>
                            <p className="text-xs text-slate-400 mt-2">Por: {m.tomada_por}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b bg-slate-50 font-semibold text-sm text-slate-700">Historial Completo de Mediciones</div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b text-slate-500 text-xs uppercase">
                        <tr>
                            <th className="px-4 py-2.5">Medida</th>
                            <th className="px-4 py-2.5">Valor</th>
                            <th className="px-4 py-2.5">Tomada por</th>
                            <th className="px-4 py-2.5">Fecha</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {datos.historial_completo.map((h) => (
                            <tr key={h.medida_id}>
                                <td className="px-4 py-2.5 capitalize">{h.tipo_medida.replace('_', ' ')}</td>
                                <td className="px-4 py-2.5 font-semibold">{h.valor} {h.unidad}</td>
                                <td className="px-4 py-2.5 text-slate-600">{h.tomada_por}</td>
                                <td className="px-4 py-2.5 text-slate-400">{new Date(h.fecha_registro).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}