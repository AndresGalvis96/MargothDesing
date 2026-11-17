import { useEffect, useState } from 'react';
import { tallerService } from '../../api/services';
import StatusBadge from '../../components/shared/StatusBadge';

export default function TalleresGlobalPage() {
    const [talleres, setTalleres] = useState([]);
    const [form, setForm] = useState({ nombre: '', direccion: '', telefono: '', correo_contacto: '' });
    const [mensaje, setMensaje] = useState('');

    const cargar = () => {
        tallerService.listar().then(({ data }) => setTalleres(data)).catch(() => {});
    };

    useEffect(() => {
        cargar();
    }, []);

    const crearTaller = async (e) => {
        e.preventDefault();
        try {
            await tallerService.crear(form);
            setMensaje('Nuevo taller registrado en la plataforma.');
            setForm({ nombre: '', direccion: '', telefono: '', correo_contacto: '' });
            cargar();
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error al crear taller.');
        }
    };

    const cambiarEstado = async (t) => {
        const nuevo = t.estado === 'activo' ? 'inactivo' : 'activo';
        await tallerService.actualizarEstado(t.taller_id, nuevo);
        cargar();
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Administración Multi-Taller</h2>
                <p className="text-sm text-slate-500">Gestiona los talleres independientes registrados en la plataforma</p>
            </div>

            {mensaje && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{mensaje}</div>}

            <form onSubmit={crearTaller} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-5 gap-3">
                <input required placeholder="Nombre del taller" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input required placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input required placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input type="email" required placeholder="Correo contacto" value={form.correo_contacto} onChange={(e) => setForm({ ...form, correo_contacto: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <button type="submit" className="py-2 px-4 rounded-lg bg-indigo-600 text-white text-sm font-semibold">+ Registrar Taller</button>
            </form>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b text-slate-600">
                        <tr>
                            <th className="px-4 py-3">ID</th>
                            <th className="px-4 py-3">Nombre</th>
                            <th className="px-4 py-3">Dirección</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {talleres.map((t) => (
                            <tr key={t.taller_id}>
                                <td className="px-4 py-3 font-bold">#{t.taller_id}</td>
                                <td className="px-4 py-3 font-semibold">{t.nombre}</td>
                                <td className="px-4 py-3 text-slate-500">{t.direccion}</td>
                                <td className="px-4 py-3"><StatusBadge estado={t.estado} /></td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => cambiarEstado(t)} className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-semibold">
                                        {t.estado === 'activo' ? 'Suspender' : 'Activar'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}