import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../api/services';
import { useAuth } from '../../context/AuthContext';
import { Scissors, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
    const [correo, setCorreo] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);

    const { iniciarSesion, rutaInicioPorRol } = useAuth();
    const navigate = useNavigate();

    const prendaPendiente = JSON.parse(localStorage.getItem('prenda_pendiente') || 'null');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setCargando(true);
        try {
            const { data } = await authService.login({ correo, password });
            iniciarSesion(data.token, data.usuario || { correo });
            const rol = data.usuario?.rol || JSON.parse(atob(data.token.split('.')[1])).rol;

            if (rol === 'cliente' && prendaPendiente) {
                navigate('/catalogo');
            } else {
                navigate(rutaInicioPorRol(rol));
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Credenciales incorrectas. Verifica tus datos.');
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

                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center mb-3">
                        <Scissors className="w-6 h-6" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900">Iniciar Sesión</h2>
                    <p className="text-sm text-slate-500 mt-1">Plataforma Multi-Taller de Confección</p>
                </div>

                {prendaPendiente && (
                    <div className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium">
                        Inicia sesión o crea tu cuenta para completar tu pedido de <strong>{prendaPendiente.nombre}</strong>.
                    </div>
                )}

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Correo electrónico</label>
                        <input
                            type="email"
                            required
                            value={correo}
                            onChange={(e) => setCorreo(e.target.value)}
                            placeholder="usuario@taller.com"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={cargando}
                        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                    >
                        {cargando ? 'Ingresando...' : 'Entrar al sistema'}
                    </button>
                </form>

                <p className="text-center text-sm text-slate-600 mt-6">
                    ¿Eres cliente nuevo?{' '}
                    <Link to="/registro" className="text-indigo-600 font-semibold hover:underline">
                        Crear cuenta aquí
                    </Link>
                </p>
            </div>
        </div>
    );
}