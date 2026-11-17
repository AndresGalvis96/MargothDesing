import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { expedienteService } from '../../api/services';
import { Users, Search, FolderOpen, Phone, MapPin } from 'lucide-react';

export default function ClientesTallerPage() {
    const navigate = useNavigate();
    const [clientes, setClientes] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);
    const [errorApi, setErrorApi] = useState(null);

    useEffect(() => {
        expedienteService.listarClientes()
            .then(({ data }) => {
                setClientes(Array.isArray(data) ? data : []);
                setErrorApi(null);
            })
            .catch((err) => {
                const msg = err.response?.data?.detalle || err.response?.data?.error || err.message;
                setErrorApi(msg);
                setClientes([]);
            })
            .finally(() => setCargando(false));
    }, []);

    const clientesFiltrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return clientes;
        return clientes.filter((c) =>
            c.nombre?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.telefono?.toLowerCase().includes(q)
        );
    }, [clientes, busqueda]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Directorio y Expedientes de Clientes</h2>
                    <p className="text-xs text-slate-500">
                        Consulta historial de prendas, fichas antropométricas, comparador de medidas y bitácora CRM
                    </p>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, teléfono o correo..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                    />
                </div>
            </div>

            {errorApi && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                    Error del servidor: {errorApi}
                </div>
            )}

            {cargando ? (
                <div className="bg-white p-8 rounded-2xl border border-slate-200 text-sm text-slate-500">
                    Cargando clientes del taller...
                </div>
            ) : clientesFiltrados.length === 0 ? (
                <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center space-y-2">
                    <Users className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500">No se encontraron clientes registrados en este taller.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                                <tr>
                                    <th className="py-3 px-4">Cliente</th>
                                    <th className="py-3 px-4">Contacto Preferido</th>
                                    <th className="py-3 px-4">Dirección</th>
                                    <th className="py-3 px-4">Pedidos</th>
                                    <th className="py-3 px-4">Saldo Pendiente</th>
                                    <th className="py-3 px-4 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {clientesFiltrados.map((c) => (
                                    <tr key={c.usuario_id} className="hover:bg-slate-50/70">
                                        <td className="py-3 px-4">
                                            <p className="font-bold text-slate-900 text-sm">{c.nombre}</p>
                                            <p className="text-slate-500">{c.email}</p>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="inline-block px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold uppercase text-[10px]">
                                                {c.medio_contacto_preferido || 'whatsapp'}
                                            </span>
                                            {c.telefono && (
                                                <p className="text-slate-600 mt-1 flex items-center gap-1">
                                                    <Phone className="w-3 h-3" /> {c.telefono}
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-600">
                                            {c.direccion ? (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="w-3 h-3 shrink-0" /> {c.direccion}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400">Sin dirección</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-800">{c.total_pedidos}</td>
                                        <td className="py-3 px-4 font-bold">
                                            <span className={Number(c.saldo_pendiente) > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                                ${Number(c.saldo_pendiente || 0).toLocaleString('es-CO')}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/taller/clientes/${c.usuario_id}`)}
                                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-sm"
                                            >
                                                <FolderOpen className="w-3.5 h-3.5" />
                                                Expediente
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}