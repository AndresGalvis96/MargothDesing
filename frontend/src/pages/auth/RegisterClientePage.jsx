import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { ArrowLeft } from 'lucide-react';

export default function RegisterClientePage() {
    const [form, setForm] = useState({
        nombres: '',
        apellidos: '',
        cedula: '',
        correo: '',
        fecha_nacimiento: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);

    const { iniciarSesion } = useAuth();
    const navigate = useNavigate();
    const prendaPendiente = JSON.parse(localStorage.getItem('prenda_pendiente') || 'null');

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            await authService.registroCliente(form);
            // Auto-login inmediato tras crear la cuenta
            const { data } = await authService.login({ correo: form.correo, password: form.password });
            iniciarSesion(data.token, data.usuario || { correo: form.correo, nombres: form.nombres });
            navigate('/catalogo');
        } catch (err) {
            setError(err.response?.data?.error || 'Error al registrar la cuenta.');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 mb-4">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Volver al catálogo público
                </Link>

                <h2 className="text-2xl font-bold text-slate-900 text-center">Registro de Cliente</h2>
                <p className="text-sm text-slate-500 text-center mt-1 mb-6">
                    Crea tu perfil para solicitar prendas y guardar tus medidas
                </p>

                {prendaPendiente && (
                    <div className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium">
                        Crea tu cuenta para completar tu pedido de <strong>{prendaPendiente.nombre}</strong>.
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Nombres</label>
                            <input name="nombres" required onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Apellidos</label>
                            <input name="apellidos" required onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Cédula / Documento</label>
                            <input name="cedula" required onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de nacimiento</label>
                            <input type="date" name="fecha_nacimiento" required onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Correo electrónico</label>
                        <input type="email" name="correo" required onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Contraseña</label>
                        <input type="password" name="password" required minLength={6} onChange={handleChange} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm mt-2 disabled:opacity-50"
                    >
                        {cargando ? 'Registrando...' : 'Registrarme y Continuar'}
                    </button>
                </form>

                <p className="text-center text-sm text-slate-600 mt-5">
                    ¿Ya tienes cuenta?{' '}
                    <Link to="/login" className="text-indigo-600 font-semibold hover:underline">Inicia sesión</Link>
                </p>
            </div>
        </div>
    );
}