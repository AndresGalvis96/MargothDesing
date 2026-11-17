import { useEffect, useState } from 'react';
import { empleadoService } from '../../api/services';
import StatusBadge from '../../components/shared/StatusBadge';

export default function EmpleadosPage() {
    const [empleados, setEmpleados] = useState([]);
    const [form, setForm] = useState({ nombres: '', apellidos: '', correo: '', telefono: '', password: '', rol: 'operario' });
    const [mensaje, setMensaje] = useState('');

    const cargar = () => {
        empleadoService.listar().then(({ data }) => setEmpleados(data)).catch(() => {});
    };

    useEffect(() => {
        cargar();
    }, []);

    const crearEmpleado = async (e) => {
        e.preventDefault();
        try {
            await empleadoService.crear(form);
            setMensaje('Empleado registrado correctamente.');
            setForm({ nombres: '', apellidos: '', correo: '', telefono: '', password: '', rol: 'operario' });
            cargar();
        } catch (err) {
            setMensaje(err.response?.data?.error || 'Error al registrar empleado.');
        }
    };

    const toggleEstado = async (emp) => {
        const nuevo = emp.estado === 'activo' ? 'inactivo' : 'activo';
        await empleadoService.actualizarEstado(emp.usuario_id, nuevo);
        cargar();
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900">Equipo del Taller</h2>
                <p className="text-sm text-slate-500">Gestiona supervisores y operarios de confección</p>
            </div>

            {mensaje && <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{mensaje}</div>}

            <form onSubmit={crearEmpleado} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <input required placeholder="Nombres" value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input required placeholder="Apellidos" value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input type="email" required placeholder="Correo" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input required placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <input type="password" required placeholder="Contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-3 py-2 rounded-lg border text-sm" />
                <div className="flex gap-2">
                    <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} className="px-2 py-2 rounded-lg border text-sm bg-white">
                        <option value="operario">Operario</option>
                        <option value="supervisor">Supervisor</option>
                    </select>
                    <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Crear</button>
                </div>
            </form>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b text-slate-600">
                        <tr>
                            <th className="px-4 py-3">Nombre</th>
                            <th className="px-4 py-3">Correo</th>
                            <th className="px-4 py-3">Rol</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {empleados.map((emp) => (
                            <tr key={emp.usuario_id}>
                                <td className="px-4 py-3 font-semibold">{emp.nombres} {emp.apellidos}</td>
                                <td className="px-4 py-3 text-slate-500">{emp.correo}</td>
                                <td className="px-4 py-3 capitalize">{emp.rol}</td>
                                <td className="px-4 py-3"><StatusBadge estado={emp.estado} /></td>
                                <td className="px-4 py-3 text-right">
                                    <button onClick={() => toggleEstado(emp)} className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-semibold">
                                        {emp.estado === 'activo' ? 'Desactivar' : 'Activar'}
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