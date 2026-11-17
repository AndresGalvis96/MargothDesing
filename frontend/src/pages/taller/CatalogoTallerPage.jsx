import { useEffect, useState, useMemo } from 'react';
import { prendaService, imagenService } from '../../api/services';
import { API_BASE_URL } from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import {
    Plus, Shirt, Eye, EyeOff, Trash2, Search,
    ChevronLeft, ChevronRight, ImagePlus, X, Pencil, RefreshCw
} from 'lucide-react';

const ITEMS_POR_PAGINA = 8;

const TIPOS_PRENDA = [
    { value: 'blusa', label: 'Blusa / Camisa' },
    { value: 'polo', label: 'Polo / Camiseta' },
    { value: 'pantalon', label: 'Pantalón / Short' },
    { value: 'falda', label: 'Falda' },
    { value: 'vestido', label: 'Vestido' },
    { value: 'chaqueta', label: 'Chaqueta / Blazer' },
    { value: 'calzado', label: 'Calzado' },
    { value: 'otro', label: 'Otro' }
];

const PUBLICOS_OBJETIVO = [
    { value: 'hombre', label: 'Hombre' },
    { value: 'mujer', label: 'Mujer' },
    { value: 'nino', label: 'Niño' },
    { value: 'nina', label: 'Niña' },
    { value: 'unisex_adultos', label: 'Unisex Adultos' },
    { value: 'unisex_ninos', label: 'Unisex Niños' }
];

const ETIQUETA_PUBLICO = Object.fromEntries(PUBLICOS_OBJETIVO.map((p) => [p.value, p.label]));

const TALLAS_OPCIONES = ['2', '4', '6', '8', '10', '12', '14', '16', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'A Medida'];

const parsearTallasReales = (tallasStr) => {
    if (!tallasStr) return [];
    return String(tallasStr).split(',').map((t) => t.trim()).filter(Boolean);
};

export default function CatalogoTallerPage() {
    const { usuario } = useAuth();
    const esAdminLocal = usuario?.rol === 'admin_local';
    const puedeGestionar = ['admin_local', 'supervisor'].includes(usuario?.rol);

    const [prendas, setPrendas] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [paginaActual, setPaginaActual] = useState(1);
    const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

    // Modal de creación / edición de prenda
    const [modalAbierto, setModalAbierto] = useState(false);
    const [prendaEditando, setPrendaEditando] = useState(null); // null = crear, objeto = editar
    const [tallasEnStockReal, setTallasEnStockReal] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [archivoImagen, setArchivoImagen] = useState(null);
    const [previewImagen, setPreviewImagen] = useState('');
    const [formPrenda, setFormPrenda] = useState({
        nombre: '',
        tipo_prenda: 'blusa',
        publico_objetivo: 'mujer',
        color: '',
        tallas_disponibles: [],
        calidad: 'estandar',
        complejidad: 'media',
        precio: '',
        descripcion: '',
        disponible: true
    });

    const cargarPrendas = async () => {
        try {
            const { data } = await prendaService.listar();
            const lista = Array.isArray(data) ? data : (data?.prendas || []);

            await Promise.all(
                lista.map(async (p) => {
                    if (!p.imagen_ruta && p.prenda_id) {
                        try {
                            const imgRes = await imagenService.listarPrenda(p.prenda_id);
                            if (imgRes.data?.length > 0) {
                                p.imagen_ruta = imgRes.data[0].ruta;
                            }
                        } catch { /* sin foto */ }
                    }
                })
            );

            setPrendas(lista);
        } catch {
            setPrendas([]);
        }
    };

    useEffect(() => {
        cargarPrendas();
    }, []);

    const prendasFiltradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return prendas;
        return prendas.filter((p) =>
            p.nombre?.toLowerCase().includes(q) ||
            p.tipo_prenda?.toLowerCase().includes(q) ||
            p.publico_objetivo?.toLowerCase().includes(q) ||
            p.color?.toLowerCase().includes(q)
        );
    }, [prendas, busqueda]);

    const totalPaginas = Math.max(1, Math.ceil(prendasFiltradas.length / ITEMS_POR_PAGINA));
    const prendasPaginadas = useMemo(() => {
        const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
        return prendasFiltradas.slice(inicio, inicio + ITEMS_POR_PAGINA);
    }, [prendasFiltradas, paginaActual]);

    useEffect(() => {
        setPaginaActual(1);
    }, [busqueda]);

    const handleSeleccionarImagen = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setArchivoImagen(file);
        setPreviewImagen(URL.createObjectURL(file));
    };

    const abrirModalCrear = () => {
        setPrendaEditando(null);
        setTallasEnStockReal([]);
        setFormPrenda({
            nombre: '',
            tipo_prenda: 'blusa',
            publico_objetivo: 'mujer',
            color: '',
            tallas_disponibles: [],
            calidad: 'estandar',
            complejidad: 'media',
            precio: '',
            descripcion: '',
            disponible: true
        });
        setArchivoImagen(null);
        setPreviewImagen('');
        setModalAbierto(true);
    };

    const abrirModalEditar = async (prenda) => {
        setPrendaEditando(prenda);
        setTallasEnStockReal([]);
        setFormPrenda({
            nombre: prenda.nombre || '',
            tipo_prenda: prenda.tipo_prenda || 'blusa',
            publico_objetivo: prenda.publico_objetivo || 'unisex_adultos',
            color: prenda.color || '',
            tallas_disponibles: parsearTallasReales(prenda.tallas_disponibles),
            calidad: prenda.calidad || 'estandar',
            complejidad: prenda.complejidad || 'media',
            precio: prenda.precio ?? '',
            descripcion: prenda.descripcion || '',
            disponible: Boolean(prenda.disponible)
        });
        setArchivoImagen(null);
        setPreviewImagen(
            prenda.imagen_ruta
                ? `${API_BASE_URL}${prenda.imagen_ruta.startsWith('/') ? '' : '/'}${prenda.imagen_ruta}`
                : ''
        );
        setModalAbierto(true);

        // Consultar las tallas reales registradas en prenda_inventario para esta prenda
        try {
            const { data } = await prendaService.listarInventario(prenda.prenda_id);
            const tallasStock = [...new Set((data || []).filter((v) => v.stock_disponible > 0).map((v) => v.talla))];
            setTallasEnStockReal(tallasStock);
        } catch {
            setTallasEnStockReal([]);
        }
    };

    const toggleTallaForm = (talla) => {
        setFormPrenda((prev) => {
            const existe = prev.tallas_disponibles.includes(talla);
            const nuevas = existe
                ? prev.tallas_disponibles.filter((t) => t !== talla)
                : [...prev.tallas_disponibles, talla];
            return { ...prev, tallas_disponibles: nuevas };
        });
    };

    const sincronizarTallasDesdeStock = () => {
        if (tallasEnStockReal.length === 0) return;
        setFormPrenda((prev) => ({
            ...prev,
            tallas_disponibles: [...new Set([...prev.tallas_disponibles, ...tallasEnStockReal])]
        }));
    };

    const handleGuardarPrenda = async (e) => {
        e.preventDefault();
        setGuardando(true);
        setMensaje({ tipo: '', texto: '' });

        const payload = {
            nombre: formPrenda.nombre.trim(),
            tipo_prenda: formPrenda.tipo_prenda,
            publico_objetivo: formPrenda.publico_objetivo,
            color: formPrenda.color.trim() || null,
            tallas_disponibles: formPrenda.tallas_disponibles.length > 0
                ? formPrenda.tallas_disponibles.join(',')
                : null,
            calidad: formPrenda.calidad,
            complejidad: formPrenda.complejidad,
            precio: Number(formPrenda.precio),
            descripcion: formPrenda.descripcion.trim() || null,
            disponible: Boolean(formPrenda.disponible)
        };

        try {
            let prendaIdFinal = prendaEditando?.prenda_id;

            if (prendaEditando) {
                await prendaService.actualizar(prendaEditando.prenda_id, payload);
            } else {
                const { data } = await prendaService.crear({
                    ...payload,
                    es_personalizada: false
                });
                prendaIdFinal = data.prenda_id || data.id || data.prenda?.prenda_id;
            }

            let avisoFoto = '';
            if (archivoImagen && prendaIdFinal) {
                try {
                    const fd = new FormData();
                    fd.append('imagen', archivoImagen);
                    fd.append('texto_alternativo', formPrenda.nombre.trim());
                    await imagenService.subirPrenda(prendaIdFinal, fd);
                } catch {
                    avisoFoto = ' (Los datos se guardaron, pero no se pudo subir la imagen).';
                }
            }

            setMensaje({
                tipo: 'exito',
                texto: prendaEditando
                    ? `Prenda "${formPrenda.nombre}" actualizada correctamente.${avisoFoto}`
                    : `Prenda "${formPrenda.nombre}" agregada al catálogo correctamente.${avisoFoto}`
            });
            setModalAbierto(false);
            await cargarPrendas();
        } catch (err) {
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || 'No se pudo guardar la prenda.'
            });
        } finally {
            setGuardando(false);
        }
    };

    const handleToggleVisibilidad = async (prenda) => {
        if (!esAdminLocal) return;
        const nuevoEstado = !prenda.disponible;
        try {
            await prendaService.cambiarDisponibilidad(prenda.prenda_id, nuevoEstado);
            setMensaje({
                tipo: 'exito',
                texto: nuevoEstado
                    ? `"${prenda.nombre}" ahora está visible en la vitrina.`
                    : `"${prenda.nombre}" fue quitada de la vista pública.`
            });
            await cargarPrendas();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'Error al cambiar disponibilidad.' });
        }
    };

    const handleEliminarPrenda = async (prenda) => {
        if (!esAdminLocal) return;
        if (!window.confirm(`¿Eliminar "${prenda.nombre}" del catálogo?`)) return;

        try {
            await prendaService.eliminar(prenda.prenda_id);
            setMensaje({ tipo: 'exito', texto: `Prenda "${prenda.nombre}" eliminada.` });
            await cargarPrendas();
        } catch (err) {
            setMensaje({ tipo: 'error', texto: err.response?.data?.error || 'No se pudo eliminar la prenda.' });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Catálogo de Prendas del Taller</h2>
                    <p className="text-sm text-slate-500">
                        Administra prendas, tallas reales disponibles y público objetivo del catálogo
                    </p>
                </div>

                {puedeGestionar && (
                    <button
                        type="button"
                        onClick={abrirModalCrear}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Agregar Producto
                    </button>
                )}
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

            <div className="relative max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                    type="text"
                    placeholder="Buscar por nombre, tipo, público o color..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-sm"
                />
            </div>

            {prendasPaginadas.length === 0 ? (
                <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
                    No se encontraron prendas en el catálogo.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {prendasPaginadas.map((p) => {
                        const tallas = parsearTallasReales(p.tallas_disponibles);
                        return (
                            <div
                                key={p.prenda_id}
                                className={`bg-white rounded-2xl border overflow-hidden shadow-sm flex flex-col justify-between transition-all ${
                                    p.disponible ? 'border-slate-200' : 'border-amber-300 bg-amber-50/20 opacity-85'
                                }`}
                            >
                                <div>
                                    <div className="relative h-48 bg-slate-100 flex items-center justify-center overflow-hidden">
                                        {p.imagen_ruta ? (
                                            <img
                                                src={`${API_BASE_URL}${p.imagen_ruta.startsWith('/') ? '' : '/'}${p.imagen_ruta}`}
                                                alt={p.nombre}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Shirt className="w-12 h-12 text-slate-300" />
                                        )}

                                        <span className={`absolute top-2.5 right-2.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                            p.disponible
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : 'bg-amber-100 text-amber-800 border-amber-300'
                                        }`}>
                                            {p.disponible ? 'Visible en inicio' : 'Oculta'}
                                        </span>
                                    </div>

                                    <div className="p-4 space-y-1.5">
                                        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                                            <span>{p.tipo_prenda}</span>
                                            <span className="text-slate-500 font-semibold">
                                                {ETIQUETA_PUBLICO[p.publico_objetivo] || 'Unisex Adultos'}
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-slate-900 text-base line-clamp-1">{p.nombre}</h3>
                                        {p.descripcion && (
                                            <p className="text-xs text-slate-500 line-clamp-2">{p.descripcion}</p>
                                        )}

                                        {/* Tallas reales configuradas (sin rellenos falsos) */}
                                        <div className="pt-1">
                                            {tallas.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {tallas.map((t) => (
                                                        <span
                                                            key={t}
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                                        >
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                                                    Sin tallas asignadas
                                                </span>
                                            )}
                                        </div>

                                        <p className="text-lg font-extrabold text-slate-900 pt-1">
                                            ${Number(p.precio || 0).toLocaleString('es-CO')}
                                        </p>
                                    </div>
                                </div>

                                {/* ACCIONES: Editar (admin_local y supervisor) + Ocultar/Eliminar (solo admin_local) */}
                                {puedeGestionar && (
                                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => abrirModalEditar(p)}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold text-indigo-700"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Editar
                                        </button>

                                        {esAdminLocal && (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleVisibilidad(p)}
                                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
                                                    title={p.disponible ? 'Quitar de vista' : 'Mostrar'}
                                                >
                                                    {p.disponible ? (
                                                        <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                                                    ) : (
                                                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                                                    )}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleEliminarPrenda(p)}
                                                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200"
                                                    title="Eliminar producto"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {totalPaginas > 1 && (
                <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200">
                    <p className="text-xs text-slate-500">
                        Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong> ({prendasFiltradas.length} productos)
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={paginaActual === 1}
                            onClick={() => setPaginaActual((prev) => Math.max(1, prev - 1))}
                            className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((num) => (
                            <button
                                key={num}
                                type="button"
                                onClick={() => setPaginaActual(num)}
                                className={`w-8 h-8 rounded-lg text-xs font-bold ${
                                    paginaActual === num
                                        ? 'bg-indigo-600 text-white'
                                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                                {num}
                            </button>
                        ))}
                        <button
                            type="button"
                            disabled={paginaActual === totalPaginas}
                            onClick={() => setPaginaActual((prev) => Math.min(totalPaginas, prev + 1))}
                            className="p-1.5 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-50"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL CREAR / EDITAR PRENDA (admin_local y supervisor) */}
            {modalAbierto && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
                    <form
                        onSubmit={handleGuardarPrenda}
                        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-lg font-bold text-slate-900">
                                {prendaEditando ? `Editar: ${prendaEditando.nombre}` : 'Agregar Producto al Catálogo'}
                            </h3>
                            <button type="button" onClick={() => setModalAbierto(false)} className="p-1 text-slate-400 hover:text-slate-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre de la prenda *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej. Camisa lino manga larga"
                                    value={formPrenda.nombre}
                                    onChange={(e) => setFormPrenda({ ...formPrenda, nombre: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de prenda *</label>
                                    <select
                                        value={formPrenda.tipo_prenda}
                                        onChange={(e) => setFormPrenda({ ...formPrenda, tipo_prenda: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                                    >
                                        {TIPOS_PRENDA.map((t) => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Público objetivo *</label>
                                    <select
                                        value={formPrenda.publico_objetivo}
                                        onChange={(e) => setFormPrenda({ ...formPrenda, publico_objetivo: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                                    >
                                        {PUBLICOS_OBJETIVO.map((pub) => (
                                            <option key={pub.value} value={pub.value}>{pub.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Precio ($) *</label>
                                    <input
                                        type="number"
                                        min={0}
                                        required
                                        placeholder="150000"
                                        value={formPrenda.precio}
                                        onChange={(e) => setFormPrenda({ ...formPrenda, precio: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Color</label>
                                    <input
                                        type="text"
                                        placeholder="Ej. Blanco"
                                        value={formPrenda.color}
                                        onChange={(e) => setFormPrenda({ ...formPrenda, color: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Calidad</label>
                                    <select
                                        value={formPrenda.calidad}
                                        onChange={(e) => setFormPrenda({ ...formPrenda, calidad: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                                    >
                                        <option value="basica">Básica</option>
                                        <option value="estandar">Estándar</option>
                                        <option value="premium">Premium</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1">Complejidad</label>
                                    <select
                                        value={formPrenda.complejidad}
                                        onChange={(e) => setFormPrenda({ ...formPrenda, complejidad: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                                    >
                                        <option value="baja">Baja</option>
                                        <option value="media">Media</option>
                                        <option value="alta">Alta</option>
                                    </select>
                                </div>
                            </div>

                            {/* Selector múltiple de tallas reales */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-slate-700">
                                        Tallas disponibles en catálogo
                                    </label>
                                    {tallasEnStockReal.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={sincronizarTallasDesdeStock}
                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            Usar tallas de stock ({tallasEnStockReal.join(', ')})
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {TALLAS_OPCIONES.map((t) => {
                                        const activa = formPrenda.tallas_disponibles.includes(t);
                                        return (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => toggleTallaForm(t)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                                    activa
                                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                                        : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                                                }`}
                                            >
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                                {formPrenda.tallas_disponibles.length === 0 && (
                                    <p className="text-[11px] text-amber-700 mt-1">
                                        Ninguna talla seleccionada (se mostrará solo según variantes en inventario o sin talla fija).
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Descripción / Detalles</label>
                                <textarea
                                    rows={2}
                                    placeholder="Describe el diseño, tipo de tela o acabados..."
                                    value={formPrenda.descripcion}
                                    onChange={(e) => setFormPrenda({ ...formPrenda, descripcion: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    {prendaEditando ? 'Cambiar imagen (opcional)' : 'Imagen de la prenda'}
                                </label>
                                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-indigo-400 bg-slate-50/60">
                                    {previewImagen ? (
                                        <img src={previewImagen} alt="Vista previa" className="h-36 object-contain rounded-lg" />
                                    ) : (
                                        <div className="text-center space-y-1">
                                            <ImagePlus className="w-7 h-7 text-slate-400 mx-auto" />
                                            <p className="text-xs font-medium text-slate-600">Haz clic para seleccionar foto (JPG, PNG, WEBP)</p>
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handleSeleccionarImagen}
                                        className="hidden"
                                    />
                                </label>
                            </div>

                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 pt-1">
                                <input
                                    type="checkbox"
                                    checked={formPrenda.disponible}
                                    onChange={(e) => setFormPrenda({ ...formPrenda, disponible: e.target.checked })}
                                    className="rounded border-slate-300 text-indigo-600"
                                />
                                Visible en la pantalla inicial del sistema
                            </label>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setModalAbierto(false)}
                                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={guardando}
                                className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                                {guardando ? 'Guardando...' : (prendaEditando ? 'Guardar Cambios' : 'Guardar Producto')}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}