import { useEffect, useState } from 'react';
import { materialService } from '../../api/services';
import { useAuth } from '../../context/AuthContext';

export default function InventarioKardexPage() {
    const { usuario } = useAuth();
    const [materiales, setMateriales] = useState([]);
    const [kardex, setKardex] = useState([]);
    const [nuevoMat, setNuevoMat] = useState({ nombre: '', categoria: 'tela', unidad: 'metros', stock_actual: '', stock_minimo: '', costo_unitario: '' });
    const [mov, setMov] = useState({ material_id: '', tipo: 'entrada', cantidad: '', motivo: '' });
    const [mensaje, setMensaje] = useState('');

    const puedeEditar = ['admin_local', 'supervisor'].includes(usuario?.rol);

    const cargar = () => {
        materialService.listar().then(({ data }) => setMateriales(data)).catch(() => {});
        materialService.obtenerKardex().then(({ data }) => setKardex(data)).catch(() => {});
    };

    useEffect(() => {
        cargar();
    }, []);

    const crearMaterial = async (e) => {
        e.preventDefault();
        try {
            await materialService.crear({
                ...nuevoMat,
                stock_actual: Number(nuevoMat.stock_actual),
                stock_minimo: Number(nuevoMat.stock_minimo),
                costo_unitario: Number(nuevoMat.costo_unitario)
            });
            setMensaje('Material registrado en inventario.');
            setNuevoMat({ nombre: '', categoria: 'tela', unidad: 'metros', stock_actual: '', stock_minimo: '', costo_unitario: '' });
            cargar();
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error al registrar material.');
        }
    };

    const registrarMovimiento = async (e) => {
        e.preventDefault();
        try {
            await materialService.movimientoStock(mov.material_id, {
                tipo: mov.tipo,
                cantidad: Number(mov.cantidad),
                motivo: mov.motivo
            });
            setMensaje('Movimiento registrado en Kardex.');
            setMov({ material_id: '', tipo: 'entrada', cantidad: '', motivo: '' });
            cargar();
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error en movimiento de stock.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Inventario de Materiales y Kardex</h2>
                <p className="text-sm text-slate-500">Control de existencias, compras y trazabilidad de salidas</p>
            </div>

            {mensaje && <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm">{mensaje}</div>}

            {puedeEditar && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <form onSubmit={crearMaterial} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h3 className="font-bold text-sm text-slate-800">Registrar Nuevo Insumo</h3>
                        <div className="grid grid-cols-3 gap-2">
                            <input required placeholder="Nombre" value={nuevoMat.nombre} onChange={(e) => setNuevoMat({ ...nuevoMat, nombre: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                            <input required placeholder="Categoría (tela, hilo...)" value={nuevoMat.categoria} onChange={(e) => setNuevoMat({ ...nuevoMat, categoria: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                            <input required placeholder="Unidad (metros, und)" value={nuevoMat.unidad} onChange={(e) => setNuevoMat({ ...nuevoMat, unidad: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <input type="number" step="0.01" required placeholder="Stock inicial" value={nuevoMat.stock_actual} onChange={(e) => setNuevoMat({ ...nuevoMat, stock_actual: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                            <input type="number" step="0.01" required placeholder="Stock mínimo" value={nuevoMat.stock_minimo} onChange={(e) => setNuevoMat({ ...nuevoMat, stock_minimo: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                            <input type="number" step="0.01" required placeholder="Costo unitario" value={nuevoMat.costo_unitario} onChange={(e) => setNuevoMat({ ...nuevoMat, costo_unitario: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                        </div>
                        <button type="submit" className="w-full py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Guardar Insumo</button>
                    </form>

                    <form onSubmit={registrarMovimiento} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h3 className="font-bold text-sm text-slate-800">Entrada / Ajuste de Stock</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <select required value={mov.material_id} onChange={(e) => setMov({ ...mov, material_id: e.target.value })} className="px-3 py-2 rounded border text-xs bg-white">
                                <option value="">Material...</option>
                                {materiales.map((m) => <option key={m.material_id} value={m.material_id}>{m.nombre}</option>)}
                            </select>
                            <select value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value })} className="px-3 py-2 rounded border text-xs bg-white">
                                <option value="entrada">Entrada (Compra)</option>
                                <option value="ajuste">Ajuste positivo</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input type="number" step="0.01" required placeholder="Cantidad" value={mov.cantidad} onChange={(e) => setMov({ ...mov, cantidad: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                            <input required placeholder="Motivo / Factura" value={mov.motivo} onChange={(e) => setMov({ ...mov, motivo: e.target.value })} className="px-3 py-2 rounded border text-xs" />
                        </div>
                        <button type="submit" className="w-full py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold">Aplicar Movimiento</button>
                    </form>
                </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b bg-slate-50 font-bold text-sm">Existencias Actuales</div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-4 py-2.5">Material</th>
                            <th className="px-4 py-2.5">Categoría</th>
                            <th className="px-4 py-2.5">Disponible</th>
                            <th className="px-4 py-2.5">Mínimo</th>
                            <th className="px-4 py-2.5">Costo Unit.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {materiales.map((m) => (
                            <tr key={m.material_id}>
                                <td className="px-4 py-2.5 font-semibold">{m.nombre}</td>
                                <td className="px-4 py-2.5 capitalize">{m.categoria}</td>
                                <td className={`px-4 py-2.5 font-bold ${Number(m.stock_actual) <= Number(m.stock_minimo) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {m.stock_actual} {m.unidad}
                                </td>
                                <td className="px-4 py-2.5">{m.stock_minimo} {m.unidad}</td>
                                <td className="px-4 py-2.5">${Number(m.costo_unitario).toLocaleString('es-CO')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b bg-slate-50 font-bold text-sm">Historial de Movimientos (Kardex)</div>
                <table className="w-full text-left text-xs">
                    <thead className="border-b text-slate-500 uppercase">
                        <tr>
                            <th className="px-4 py-2.5">Fecha</th>
                            <th className="px-4 py-2.5">Material</th>
                            <th className="px-4 py-2.5">Tipo</th>
                            <th className="px-4 py-2.5">Cantidad</th>
                            <th className="px-4 py-2.5">Motivo</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {kardex.map((k) => (
                            <tr key={k.movimiento_id}>
                                <td className="px-4 py-2 text-slate-500">{new Date(k.fecha).toLocaleString()}</td>
                                <td className="px-4 py-2 font-semibold">{k.material_nombre || `#${k.material_id}`}</td>
                                <td className="px-4 py-2 uppercase font-bold">{k.tipo}</td>
                                <td className="px-4 py-2 font-semibold">{k.cantidad}</td>
                                <td className="px-4 py-2 text-slate-600">{k.motivo}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}