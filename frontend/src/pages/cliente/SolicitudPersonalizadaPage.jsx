import { useEffect, useState } from 'react';
import { pedidoService, tallerService, imagenService } from '../../api/services';
import { Sparkles, Upload } from 'lucide-react';

const TIPOS_PRENDA = [
    { value: 'blusa', label: 'Blusa / Camisa' },
    { value: 'polo', label: 'Polo' },
    { value: 'pantalon', label: 'Pantalón' },
    { value: 'falda', label: 'Falda' },
    { value: 'vestido', label: 'Vestido' },
    { value: 'chaqueta', label: 'Chaqueta' },
    { value: 'calzado', label: 'Calzado' },
    { value: 'otro', label: 'Otro' },
];

export default function SolicitudPersonalizadaPage() {
    const [talleres, setTalleres] = useState([]);
    const [form, setForm] = useState({
        taller_id: '',
        nombre_prenda: '',
        tipo_prenda: 'vestido',
        color: '',
        calidad: 'estandar',
        complejidad: 'media',
        talla: 'M',
        cantidad: 1,
        prioridad: 'normal',
        descripcion: ''
    });
    const [archivo, setArchivo] = useState(null);
    const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        tallerService.listar().then(({ data }) => {
            const activos = data.filter((t) => t.estado === 'activo');
            setTalleres(activos);
            if (activos.length > 0) {
                setForm((prev) => ({ ...prev, taller_id: String(activos[0].taller_id) }));
            }
        }).catch(() => {});
    }, []);

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

 const handleSubmit = async (e) => {
        e.preventDefault();
        setMensaje({ tipo: '', texto: '' });
        setEnviando(true);

        try {
            // 1. Crear la solicitud personalizada para obtener el detalle_id
            const { data } = await pedidoService.crearPersonalizado({
                taller_id: Number(form.taller_id),
                prioridad: form.prioridad,
                nombre_prenda: form.nombre_prenda.trim(),
                tipo_prenda: form.tipo_prenda,
                color: form.color.trim() || null,
                calidad: form.calidad,
                complejidad: form.complejidad,
                talla: form.talla,
                cantidad: Number(form.cantidad),
                descripcion: form.descripcion.trim()
            });

            // 2. Si el cliente adjuntó foto de referencia, subirla al detalle_id recién creado
            let avisoImagen = '';
            if (archivo && data.detalle_id) {
                try {
                    const fd = new FormData();
                    fd.append('imagen', archivo); // Si uploadMiddleware usa 'foto', cámbialo a 'foto'
                    fd.append('tipo_imagen', 'referencia');
                    fd.append('texto_alternativo', form.nombre_prenda.trim());
                    await imagenService.subirDetallePedido(data.detalle_id, fd);
                } catch (imgErr) {
                    console.error('Error al subir imagen de referencia:', imgErr);
                    avisoImagen = ' (Nota: la solicitud se creó, pero no se pudo adjuntar la imagen).';
                }
            }

            setMensaje({
                tipo: 'exito',
                texto: `¡Solicitud personalizada #${data.pedido_id} enviada! El taller cotizará tu prenda antes de habilitar el pago.${avisoImagen}`
            });
            setForm((prev) => ({
                ...prev,
                nombre_prenda: '',
                color: '',
                cantidad: 1,
                descripcion: ''
            }));
            setArchivo(null);
        } catch (err) {
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || 'Error al enviar la solicitud personalizada.'
            });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-indigo-600" />
                    Solicitar Prenda Personalizada
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    Describe tu diseño a medida. El taller calculará materiales y mano de obra para enviarte la cotización.
                </p>
            </div>

            {mensaje.texto && (
                <div className={`p-3.5 rounded-lg border text-sm font-medium ${
                    mensaje.tipo === 'error'
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}>
                    {mensaje.texto}
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Taller destino *</label>
                        <select
                            name="taller_id"
                            required
                            value={form.taller_id}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                            {talleres.map((t) => (
                                <option key={t.taller_id} value={t.taller_id}>{t.nombre}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de prenda *</label>
                        <select
                            name="tipo_prenda"
                            required
                            value={form.tipo_prenda}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                            {TIPOS_PRENDA.map((tp) => (
                                <option key={tp.value} value={tp.value}>{tp.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre o título del diseño *</label>
                    <input
                        name="nombre_prenda"
                        required
                        value={form.nombre_prenda}
                        onChange={handleChange}
                        placeholder="Ej. Vestido de gala corte sirena en satín"
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Color</label>
                        <input
                            name="color"
                            value={form.color}
                            onChange={handleChange}
                            placeholder="Ej. Vino tinto"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Talla</label>
                        <select
                            name="talla"
                            value={form.talla}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                            {['XS', 'S', 'M', 'L', 'XL', 'A Medida'].map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Calidad tela</label>
                        <select
                            name="calidad"
                            value={form.calidad}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                            <option value="basica">Básica</option>
                            <option value="estandar">Estándar</option>
                            <option value="premium">Premium</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Cantidad *</label>
                        <input
                            type="number"
                            name="cantidad"
                            min={1}
                            required
                            value={form.cantidad}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Complejidad estimada</label>
                        <select
                            name="complejidad"
                            value={form.complejidad}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                            <option value="baja">Baja (corte sencillo)</option>
                            <option value="media">Media</option>
                            <option value="alta">Alta (forrado / bordado / gala)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Prioridad</label>
                        <select
                            name="prioridad"
                            value={form.prioridad}
                            onChange={handleChange}
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                        >
                            <option value="baja">Baja</option>
                            <option value="normal">Normal</option>
                            <option value="alta">Alta (Urgente)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Descripción detallada (tela, cortes, acabado) *</label>
                    <textarea
                        name="descripcion"
                        rows={3}
                        required
                        value={form.descripcion}
                        onChange={handleChange}
                        placeholder="Describe el tipo de tela, estilo de cuello, largo, bolsillos o cualquier detalle clave..."
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Imagen de referencia (opcional)</label>
                    <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-dashed border-slate-300 hover:border-indigo-400 cursor-pointer text-xs text-slate-600 bg-slate-50">
                        <Upload className="w-4 h-4 text-indigo-600" />
                        <span>{archivo ? archivo.name : 'Seleccionar foto de referencia (JPG/PNG)...'}</span>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                        />
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={enviando}
                    className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors disabled:opacity-50"
                >
                    {enviando ? 'Enviando solicitud...' : 'Enviar Solicitud de Cotización'}
                </button>
            </form>
        </div>
    );
}