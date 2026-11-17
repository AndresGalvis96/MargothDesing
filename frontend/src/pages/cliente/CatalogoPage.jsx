import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { prendaService, imagenService, pedidoService, tallerService } from '../../api/services';
import { API_BASE_URL } from '../../api/axiosClient';
import { useAuth } from '../../context/AuthContext';
import CombinadorModal, { obtenerTallasRealesPrenda } from '../../components/cliente/CombinadorModal';
import {
    ShoppingBag, Shirt, Scissors, LogIn, UserPlus, Palette,
    CheckCircle2, Sparkles, ChevronLeft, ChevronRight, Search, Layers, X
} from 'lucide-react';

const ITEMS_POR_PAGINA = 6;

const ETIQUETA_PUBLICO = {
    hombre: 'Hombre',
    mujer: 'Mujer',
    nino: 'Niño',
    nina: 'Niña',
    unisex_adultos: 'Unisex Adultos',
    unisex_ninos: 'Unisex Niños'
};

export default function CatalogoPage() {
    const { token, usuario } = useAuth();
    const navigate = useNavigate();

    const [talleres, setTalleres] = useState([]);
    const [tallerSeleccionado, setTallerSeleccionado] = useState('');
    const [prendas, setPrendas] = useState([]);
    const [imagenesMap, setImagenesMap] = useState({});
    const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
    const [enviando, setEnviando] = useState(false);
    const [paginaActual, setPaginaActual] = useState(1);

    // Filtros del catálogo
    const [filtroTexto, setFiltroTexto] = useState('');
    const [filtroPublico, setFiltroPublico] = useState('todos');
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [filtroTalla, setFiltroTalla] = useState('todas');

    // Modales de combinador y de cambios sobre conjunto
    const [modalCombinador, setModalCombinador] = useState(false);
    const [conjuntoParaCambios, setConjuntoParaCambios] = useState(null);
    const [formCambiosConjunto, setFormCambiosConjunto] = useState({
        color_preferido: '',
        tipo_tela: '',
        detalles: ''
    });

    const [seleccion, setSeleccion] = useState({
        prenda_id: null,
        modo: 'inventario',
        variante_id: null,
        talla: '',
        cantidad: 1,
        color_preferido: '',
        tipo_tela: '',
        descripcion: ''
    });

    const cargarCatalogo = async (tallerId) => {
        if (!tallerId) return [];
        try {
            const { data } = await prendaService.catalogoPublico(tallerId);
            const lista = Array.isArray(data) ? data : (data?.prendas || []);
            setPrendas(lista);

            const imgs = {};
            await Promise.all(
                lista.map(async (p) => {
                    try {
                        const res = await imagenService.listarPrenda(p.prenda_id);
                        if (res.data?.length > 0) imgs[p.prenda_id] = res.data[0].ruta;
                    } catch { /* sin foto */ }
                })
            );
            setImagenesMap(imgs);
            return lista;
        } catch {
            setPrendas([]);
            return [];
        }
    };

    // Opciones dinámicas de tallas reales existentes en el catálogo cargado
    const tallasDisponiblesEnCatalogo = useMemo(() => {
        const setTallas = new Set();
        prendas.forEach((p) => {
            obtenerTallasRealesPrenda(p).forEach((t) => setTallas.add(t));
        });
        return [...setTallas];
    }, [prendas]);

    // Filtrado y paginación
    const prendasFiltradas = useMemo(() => {
        return prendas.filter((p) => {
            const coincideTexto = !filtroTexto.trim() ||
                p.nombre?.toLowerCase().includes(filtroTexto.toLowerCase()) ||
                p.descripcion?.toLowerCase().includes(filtroTexto.toLowerCase());
            const coincidePublico = filtroPublico === 'todos' ||
                (p.publico_objetivo || 'unisex_adultos') === filtroPublico;
            const coincideTipo = filtroTipo === 'todos' || p.tipo_prenda === filtroTipo;
            const tallasP = obtenerTallasRealesPrenda(p);
            const coincideTalla = filtroTalla === 'todas' || tallasP.includes(filtroTalla);
            return coincideTexto && coincidePublico && coincideTipo && coincideTalla;
        });
    }, [prendas, filtroTexto, filtroPublico, filtroTipo, filtroTalla]);

    const totalPaginas = Math.max(1, Math.ceil(prendasFiltradas.length / ITEMS_POR_PAGINA));
    const prendasPaginadas = prendasFiltradas.slice(
        (paginaActual - 1) * ITEMS_POR_PAGINA,
        paginaActual * ITEMS_POR_PAGINA
    );

    useEffect(() => {
        setPaginaActual(1);
    }, [filtroTexto, filtroPublico, filtroTipo, filtroTalla, tallerSeleccionado]);

    // Ejecutar compra directa de un conjunto (superior + inferior)
    const ejecutarCompraConjunto = async (conjunto, tallerIdDestino) => {
        setEnviando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            const items = [conjunto.superior, conjunto.inferior].map((item) => {
                const varianteCoincidente = (item.variantes_stock || []).find(
                    (v) => v.talla === item.tallaSeleccionada && v.stock_disponible > 0
                ) || (item.variantes_stock || [])[0];

                return {
                    prenda_id: item.prenda_id,
                    variante_id: varianteCoincidente ? varianteCoincidente.variante_id : null,
                    talla: item.tallaSeleccionada,
                    cantidad: 1,
                    descripcion: `Parte de conjunto combinado (Talla ${item.tallaSeleccionada})`
                };
            });

            const todasConVariante = items.every((it) => it.variante_id);
            if (todasConVariante) {
                const { data } = await pedidoService.crearEstandar({
                    taller_id: Number(tallerIdDestino),
                    prioridad: 'normal',
                    items
                });
                setMensaje({
                    tipo: 'exito',
                    texto: `¡Compra de conjunto #${data.pedido_id} registrada! Ve a "Mis Pedidos y Pagos" para completar el pago.`
                });
            } else {
                const { data } = await pedidoService.crearPersonalizado({
                    taller_id: Number(tallerIdDestino),
                    prioridad: 'normal',
                    nombre_prenda: `Conjunto: ${conjunto.superior.nombre} + ${conjunto.inferior.nombre}`,
                    tipo_prenda: conjunto.superior.tipo_prenda || 'otro',
                    calidad: conjunto.superior.calidad || 'estandar',
                    complejidad: 'media',
                    talla: `${conjunto.superior.tallaSeleccionada} / ${conjunto.inferior.tallaSeleccionada}`,
                    cantidad: 1,
                    descripcion: `Compra de conjunto: ${conjunto.superior.nombre} (Talla ${conjunto.superior.tallaSeleccionada}) + ${conjunto.inferior.nombre} (Talla ${conjunto.inferior.tallaSeleccionada}).`
                });
                setMensaje({
                    tipo: 'exito',
                    texto: `¡Pedido de conjunto #${data.pedido_id} creado! Revisa "Mis Pedidos y Pagos" para continuar.`
                });
            }
            setModalCombinador(false);
        } catch (err) {
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || 'No se pudo procesar la compra del conjunto.'
            });
        } finally {
            setEnviando(false);
        }
    };

    const inicializarSeleccionPrenda = (prenda) => {
        const variantes = prenda.variantes_stock || [];
        const tieneStock = variantes.length > 0;
        const tallasP = obtenerTallasRealesPrenda(prenda);

        setSeleccion({
            prenda_id: prenda.prenda_id,
            modo: tieneStock ? 'inventario' : 'personalizado',
            variante_id: tieneStock ? variantes[0].variante_id : null,
            talla: tieneStock ? variantes[0].talla : (tallasP[0] || ''),
            cantidad: 1,
            color_preferido: '',
            tipo_tela: '',
            descripcion: ''
        });
    };

    // 1. Cargar talleres y recuperar acciones pendientes tras login/registro
    useEffect(() => {
        const pendienteRaw = localStorage.getItem('prenda_pendiente');
        const pendiente = pendienteRaw ? JSON.parse(pendienteRaw) : null;

        const conjuntoRaw = localStorage.getItem('conjunto_pendiente');
        const conjuntoPend = conjuntoRaw ? JSON.parse(conjuntoRaw) : null;

        tallerService.listar().then(({ data }) => {
            const activos = Array.isArray(data) ? data.filter((t) => t.estado === 'activo') : [];
            setTalleres(activos);

            const tallerInicial = conjuntoPend?.taller_id || pendiente?.taller_id || activos[0]?.taller_id;
            if (tallerInicial) setTallerSeleccionado(String(tallerInicial));
        }).catch(() => {});
    }, []);

    // 2. Cargar catálogo y ejecutar acción pendiente si el usuario acaba de iniciar sesión
    useEffect(() => {
        if (!tallerSeleccionado) return;

        cargarCatalogo(tallerSeleccionado).then((listaPrendas) => {
            if (!token || usuario?.rol !== 'cliente') return;

            const pendienteRaw = localStorage.getItem('prenda_pendiente');
            if (pendienteRaw) {
                const pendiente = JSON.parse(pendienteRaw);
                const prendaEncontrada = listaPrendas.find((item) => item.prenda_id === pendiente.prenda_id);
                if (prendaEncontrada) inicializarSeleccionPrenda(prendaEncontrada);
                localStorage.removeItem('prenda_pendiente');
            }

            const conjuntoRaw = localStorage.getItem('conjunto_pendiente');
            if (conjuntoRaw) {
                const conj = JSON.parse(conjuntoRaw);
                localStorage.removeItem('conjunto_pendiente');
                if (conj.accion === 'comprar') {
                    ejecutarCompraConjunto(conj.conjunto, tallerSeleccionado);
                } else if (conj.accion === 'cambios') {
                    setConjuntoParaCambios(conj.conjunto);
                }
            }
        });
    }, [tallerSeleccionado, token, usuario]);

    const abrirFormularioPedido = (prenda) => {
        if (!token || !usuario) {
            localStorage.setItem('prenda_pendiente', JSON.stringify({
                prenda_id: prenda.prenda_id,
                taller_id: tallerSeleccionado || prenda.taller_id,
                nombre: prenda.nombre
            }));
            navigate('/login');
            return;
        }
        setMensaje({ tipo: '', texto: '' });
        inicializarSeleccionPrenda(prenda);
    };

    const handleComprarConjunto = (conjunto) => {
        if (!token || !usuario) {
            localStorage.setItem('conjunto_pendiente', JSON.stringify({
                accion: 'comprar',
                taller_id: tallerSeleccionado,
                conjunto
            }));
            navigate('/login');
            return;
        }
        ejecutarCompraConjunto(conjunto, tallerSeleccionado);
    };

    const handleSolicitarCambiosConjunto = (conjunto) => {
        if (!token || !usuario) {
            localStorage.setItem('conjunto_pendiente', JSON.stringify({
                accion: 'cambios',
                taller_id: tallerSeleccionado,
                conjunto
            }));
            navigate('/login');
            return;
        }
        setModalCombinador(false);
        setFormCambiosConjunto({ color_preferido: '', tipo_tela: '', detalles: '' });
        setConjuntoParaCambios(conjunto);
    };

    const enviarCambiosConjunto = async (e) => {
        e.preventDefault();
        if (!conjuntoParaCambios) return;

        setEnviando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            const desc = [
                `Conjunto combinado: ${conjuntoParaCambios.superior.nombre} (Talla ${conjuntoParaCambios.superior.tallaSeleccionada}) + ${conjuntoParaCambios.inferior.nombre} (Talla ${conjuntoParaCambios.inferior.tallaSeleccionada})`,
                formCambiosConjunto.tipo_tela ? `Tela solicitada: ${formCambiosConjunto.tipo_tela}` : '',
                formCambiosConjunto.detalles ? `Cambios solicitados: ${formCambiosConjunto.detalles}` : ''
            ].filter(Boolean).join('. ');

            const { data } = await pedidoService.crearPersonalizado({
                taller_id: Number(tallerSeleccionado),
                prioridad: 'normal',
                nombre_prenda: `Conjunto Personalizado: ${conjuntoParaCambios.superior.nombre} + ${conjuntoParaCambios.inferior.nombre}`,
                tipo_prenda: conjuntoParaCambios.superior.tipo_prenda || 'otro',
                color: formCambiosConjunto.color_preferido || null,
                calidad: 'estandar',
                complejidad: 'media',
                talla: `${conjuntoParaCambios.superior.tallaSeleccionada} / ${conjuntoParaCambios.inferior.tallaSeleccionada}`,
                cantidad: 1,
                descripcion: desc
            });

            setMensaje({
                tipo: 'exito',
                texto: `¡Solicitud de conjunto con cambios #${data.pedido_id} enviada! El taller cotizará tus ajustes.`
            });
            setConjuntoParaCambios(null);
        } catch (err) {
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || 'No se pudo enviar la solicitud de cambios.'
            });
        } finally {
            setEnviando(false);
        }
    };

    const confirmarCompraInventario = async (prenda) => {
        if (!seleccion.variante_id) {
            setMensaje({ tipo: 'error', texto: 'Selecciona una talla/variante disponible en stock.' });
            return;
        }

        setEnviando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            const { data } = await pedidoService.crearEstandar({
                taller_id: Number(tallerSeleccionado || prenda.taller_id),
                prioridad: 'normal',
                items: [{
                    prenda_id: prenda.prenda_id,
                    variante_id: Number(seleccion.variante_id),
                    cantidad: Number(seleccion.cantidad),
                    descripcion: seleccion.descripcion.trim() || null
                }]
            });

            setMensaje({
                tipo: 'exito',
                texto: `¡Compra directa #${data.pedido_id} registrada! Ve a "Mis Pedidos y Pagos" para realizar el pago.`
            });
            setSeleccion({ prenda_id: null, modo: 'inventario', variante_id: null, talla: '', cantidad: 1, color_preferido: '', tipo_tela: '', descripcion: '' });
            await cargarCatalogo(tallerSeleccionado);
        } catch (err) {
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || 'No se pudo procesar la compra directa.'
            });
        } finally {
            setEnviando(false);
        }
    };

    const confirmarSolicitudPersonalizada = async (prenda) => {
        if (!seleccion.talla || !seleccion.talla.trim()) {
            setMensaje({ tipo: 'error', texto: 'Indica o selecciona una talla para tu confección.' });
            return;
        }

        const descripcionCompleta = [
            `Basado en referencia de catálogo: ${prenda.nombre} (Talla ${seleccion.talla.trim()})`,
            seleccion.tipo_tela ? `Tela solicitada: ${seleccion.tipo_tela.trim()}` : '',
            seleccion.descripcion ? `Detalles: ${seleccion.descripcion.trim()}` : ''
        ].filter(Boolean).join('. ');

        setEnviando(true);
        setMensaje({ tipo: '', texto: '' });
        try {
            const { data } = await pedidoService.crearPersonalizado({
                taller_id: Number(tallerSeleccionado || prenda.taller_id),
                prioridad: 'normal',
                nombre_prenda: `${prenda.nombre} (Personalizada)`,
                tipo_prenda: prenda.tipo_prenda || 'otro',
                color: seleccion.color_preferido.trim() || null,
                calidad: prenda.calidad || 'estandar',
                complejidad: prenda.complejidad || 'media',
                talla: seleccion.talla.trim(),
                cantidad: Number(seleccion.cantidad),
                descripcion: descripcionCompleta
            });

            setMensaje({
                tipo: 'exito',
                texto: `¡Solicitud #${data.pedido_id} enviada! El taller revisará disponibilidad y te enviará la cotización antes del pago.`
            });
            setSeleccion({ prenda_id: null, modo: 'inventario', variante_id: null, talla: '', cantidad: 1, color_preferido: '', tipo_tela: '', descripcion: '' });
        } catch (err) {
            setMensaje({
                tipo: 'error',
                texto: err.response?.data?.error || 'No se pudo enviar la solicitud.'
            });
        } finally {
            setEnviando(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {!token && (
                <header className="bg-slate-900 text-white px-6 py-4 shadow-sm">
                    <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <Scissors className="w-6 h-6 text-indigo-400" />
                            <span className="font-bold text-lg tracking-tight">AtelierPro — Vitrina de Talleres</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link to="/login" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-200 hover:bg-slate-800">
                                <LogIn className="w-4 h-4" />
                                Iniciar Sesión
                            </Link>
                            <Link to="/registro" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">
                                <UserPlus className="w-4 h-4" />
                                Crear Cuenta
                            </Link>
                        </div>
                    </div>
                </header>
            )}

            <div className={`${!token ? 'max-w-7xl mx-auto p-6 lg:p-8' : ''} space-y-6`}>
                {/* Encabezado + Selector de Taller + Botón Combinar */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">Catálogo de Prendas</h2>
                        <p className="text-sm text-slate-500">
                            Explora prendas por categoría, público y talla real, o arma tu conjunto en el combinador
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {prendas.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setModalCombinador(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm"
                            >
                                <Layers className="w-4 h-4" />
                                Combinar Prendas
                            </button>
                        )}

                        {talleres.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase text-slate-500">Taller:</span>
                                <select
                                    value={tallerSeleccionado}
                                    onChange={(e) => setTallerSeleccionado(e.target.value)}
                                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium"
                                >
                                    {talleres.map((t) => (
                                        <option key={t.taller_id} value={t.taller_id}>{t.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* BARRA DE FILTROS DEL CATÁLOGO */}
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar prenda..."
                            value={filtroTexto}
                            onChange={(e) => setFiltroTexto(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
                        />
                    </div>

                    <select
                        value={filtroPublico}
                        onChange={(e) => setFiltroPublico(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                        <option value="todos">Todo el público</option>
                        <option value="mujer">Mujer</option>
                        <option value="hombre">Hombre</option>
                        <option value="nina">Niña</option>
                        <option value="nino">Niño</option>
                        <option value="unisex_adultos">Unisex Adultos</option>
                        <option value="unisex_ninos">Unisex Niños</option>
                    </select>

                    <select
                        value={filtroTipo}
                        onChange={(e) => setFiltroTipo(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                        <option value="todos">Todas las categorías</option>
                        <option value="blusa">Blusas / Camisas</option>
                        <option value="polo">Polos / Camisetas</option>
                        <option value="pantalon">Pantalones / Shorts</option>
                        <option value="falda">Faldas</option>
                        <option value="vestido">Vestidos</option>
                        <option value="chaqueta">Chaquetas</option>
                        <option value="calzado">Calzado</option>
                        <option value="otro">Otros</option>
                    </select>

                    <select
                        value={filtroTalla}
                        onChange={(e) => setFiltroTalla(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
                    >
                        <option value="todas">Todas las tallas disponibles</option>
                        {tallasDisponiblesEnCatalogo.map((t) => (
                            <option key={t} value={t}>Talla {t}</option>
                        ))}
                    </select>
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

                {prendasFiltradas.length === 0 ? (
                    <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-slate-500 text-sm">
                        No hay prendas que coincidan con los filtros seleccionados.
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {prendasPaginadas.map((p) => {
                                const variantes = p.variantes_stock || [];
                                const tallasProducto = obtenerTallasRealesPrenda(p);
                                const varianteActiva = variantes.find((v) => v.variante_id === Number(seleccion.variante_id));
                                const estaAbierta = seleccion.prenda_id === p.prenda_id;

                                return (
                                    <div key={p.prenda_id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col justify-between">
                                        <div>
                                            <div className="h-52 bg-slate-100 flex items-center justify-center overflow-hidden relative">
                                                {imagenesMap[p.prenda_id] ? (
                                                    <img
                                                        src={`${API_BASE_URL}${imagenesMap[p.prenda_id].startsWith('/') ? '' : '/'}${imagenesMap[p.prenda_id]}`}
                                                        alt={p.nombre}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <Shirt className="w-12 h-12 text-slate-300" />
                                                )}
                                                {variantes.length > 0 && (
                                                    <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-600 text-white shadow-sm">
                                                        Entrega inmediata
                                                    </span>
                                                )}
                                            </div>

                                            <div className="p-5">
                                                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
                                                    <span className="text-indigo-600">{p.tipo_prenda}</span>
                                                    <span className="text-slate-500">
                                                        {ETIQUETA_PUBLICO[p.publico_objetivo] || 'Unisex Adultos'}
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-900 mt-1">{p.nombre}</h3>
                                                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.descripcion}</p>

                                                {/* SOLO MUESTRA TALLAS REALES DE LA PRENDA */}
                                                {tallasProducto.length > 0 ? (
                                                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[11px] font-semibold text-slate-500">Tallas disponibles:</span>
                                                        {tallasProducto.map((t) => (
                                                            <span
                                                                key={t}
                                                                className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200"
                                                            >
                                                                {t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="mt-3 text-[11px] font-medium text-slate-400">
                                                        Tallas según disponibilidad o medidas del cliente
                                                    </p>
                                                )}

                                                {variantes.length > 0 ? (
                                                    <div className="mt-3 space-y-1.5">
                                                        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                            En inventario listo para envío:
                                                        </p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {variantes.map((v) => (
                                                                <span
                                                                    key={v.variante_id}
                                                                    className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
                                                                >
                                                                    {v.color} · {v.tela} ({v.talla}: {v.stock_disponible})
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg">
                                                        <Palette className="w-3.5 h-3.5 shrink-0" />
                                                        <span>Confección bajo pedido en tu talla y tela preferidas</span>
                                                    </div>
                                                )}

                                                <p className="text-xl font-extrabold text-slate-900 mt-3">
                                                    ${Number(p.precio || 0).toLocaleString('es-CO')}
                                                    <span className="text-xs font-normal text-slate-400 ml-1">precio base</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="p-5 pt-0">
                                            {estaAbierta ? (
                                                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-indigo-200">
                                                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg text-xs font-semibold">
                                                        <button
                                                            type="button"
                                                            disabled={variantes.length === 0}
                                                            onClick={() => setSeleccion({ ...seleccion, modo: 'inventario', cantidad: 1 })}
                                                            className={`py-1.5 rounded-md transition-colors ${
                                                                seleccion.modo === 'inventario'
                                                                    ? 'bg-white text-emerald-700 shadow-sm'
                                                                    : 'text-slate-600 disabled:opacity-40'
                                                            }`}
                                                        >
                                                            En Inventario ({variantes.length})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSeleccion({
                                                                ...seleccion,
                                                                modo: 'personalizado',
                                                                talla: tallasProducto[0] || '',
                                                                cantidad: 1
                                                            })}
                                                            className={`py-1.5 rounded-md transition-colors ${
                                                                seleccion.modo === 'personalizado'
                                                                    ? 'bg-white text-indigo-700 shadow-sm'
                                                                    : 'text-slate-600'
                                                            }`}
                                                        >
                                                            Bajo Pedido / Cambios
                                                        </button>
                                                    </div>

                                                    {seleccion.modo === 'inventario' && variantes.length > 0 ? (
                                                        <>
                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-700 mb-1">
                                                                    Talla / Color / Tela disponible
                                                                </label>
                                                                <select
                                                                    value={seleccion.variante_id || ''}
                                                                    onChange={(e) => setSeleccion({ ...seleccion, variante_id: Number(e.target.value), cantidad: 1 })}
                                                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs"
                                                                >
                                                                    {variantes.map((v) => (
                                                                        <option key={v.variante_id} value={v.variante_id}>
                                                                            Talla {v.talla} - {v.color} ({v.tela}) · {v.stock_disponible} disp.
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>

                                                            <div className="flex gap-2">
                                                                <div className="w-24">
                                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Cantidad</label>
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        max={varianteActiva?.stock_disponible || 1}
                                                                        value={seleccion.cantidad}
                                                                        onChange={(e) => setSeleccion({ ...seleccion, cantidad: e.target.value })}
                                                                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                    />
                                                                </div>
                                                                <div className="flex-1">
                                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Nota (opcional)</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Ej. Empaque regalo"
                                                                        value={seleccion.descripcion}
                                                                        onChange={(e) => setSeleccion({ ...seleccion, descripcion: e.target.value })}
                                                                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="flex gap-2 pt-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={enviando}
                                                                    onClick={() => confirmarCompraInventario(p)}
                                                                    className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                                                                >
                                                                    {enviando ? 'Procesando...' : 'Comprar Ahora'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSeleccion({ ...seleccion, prenda_id: null })}
                                                                    className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-medium"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Talla *</label>
                                                                    {tallasProducto.length > 0 ? (
                                                                        <select
                                                                            value={seleccion.talla}
                                                                            onChange={(e) => setSeleccion({ ...seleccion, talla: e.target.value })}
                                                                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 bg-white text-xs"
                                                                        >
                                                                            {tallasProducto.map((t) => (
                                                                                <option key={t} value={t}>{t}</option>
                                                                            ))}
                                                                        </select>
                                                                    ) : (
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Ej. M o A medida"
                                                                            value={seleccion.talla}
                                                                            onChange={(e) => setSeleccion({ ...seleccion, talla: e.target.value })}
                                                                            className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Cantidad</label>
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        value={seleccion.cantidad}
                                                                        onChange={(e) => setSeleccion({ ...seleccion, cantidad: e.target.value })}
                                                                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="grid grid-cols-2 gap-2">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Color preferido</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Ej. Azul marino"
                                                                        value={seleccion.color_preferido}
                                                                        onChange={(e) => setSeleccion({ ...seleccion, color_preferido: e.target.value })}
                                                                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-slate-700 mb-1">Tipo de tela</label>
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Ej. Lino, Seda"
                                                                        value={seleccion.tipo_tela}
                                                                        onChange={(e) => setSeleccion({ ...seleccion, tipo_tela: e.target.value })}
                                                                        className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <label className="block text-xs font-medium text-slate-700 mb-1">Ajustes o medidas especiales</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Ej. Largo 5cm más corto"
                                                                    value={seleccion.descripcion}
                                                                    onChange={(e) => setSeleccion({ ...seleccion, descripcion: e.target.value })}
                                                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs"
                                                                />
                                                            </div>

                                                            <div className="flex gap-2 pt-1">
                                                                <button
                                                                    type="button"
                                                                    disabled={enviando}
                                                                    onClick={() => confirmarSolicitudPersonalizada(p)}
                                                                    className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                                                                >
                                                                    {enviando ? 'Enviando...' : 'Solicitar Cotización'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSeleccion({ ...seleccion, prenda_id: null })}
                                                                    className="px-3 py-2 rounded-lg bg-slate-200 text-slate-700 text-xs font-medium"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => abrirFormularioPedido(p)}
                                                    className={`w-full py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                                                        variantes.length > 0
                                                            ? 'bg-emerald-600 hover:bg-emerald-700'
                                                            : 'bg-indigo-600 hover:bg-indigo-700'
                                                    }`}
                                                >
                                                    {variantes.length > 0 ? (
                                                        <>
                                                            <ShoppingBag className="w-4 h-4" />
                                                            {token ? 'Comprar / Personalizar' : 'Ingresar para Comprar'}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Sparkles className="w-4 h-4" />
                                                            {token ? 'Solicitar Confección / Cotizar' : 'Ingresar para Solicitar'}
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* PAGINACIÓN */}
                        {totalPaginas > 1 && (
                            <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200">
                                <p className="text-xs text-slate-500">
                                    Página <strong>{paginaActual}</strong> de <strong>{totalPaginas}</strong> ({prendasFiltradas.length} prendas)
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
                    </>
                )}
            </div>

            {/* MODAL COMBINADOR DE PRENDAS (Slide superior + inferior por público objetivo, sin vestidos) */}
            <CombinadorModal
                abierto={modalCombinador}
                onCerrar={() => setModalCombinador(false)}
                prendas={prendas}
                imagenesMap={imagenesMap}
                onComprarConjunto={handleComprarConjunto}
                onSolicitarCambiosConjunto={handleSolicitarCambiosConjunto}
                enviando={enviando}
            />

            {/* MODAL SOLICITAR CAMBIOS SOBRE CONJUNTO COMBINADO */}
            {conjuntoParaCambios && (
                <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
                    <form
                        onSubmit={enviarCambiosConjunto}
                        className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900">Solicitar Cambios en el Conjunto</h3>
                            <button
                                type="button"
                                onClick={() => setConjuntoParaCambios(null)}
                                className="p-1 text-slate-400 hover:text-slate-700"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-xs text-slate-700 space-y-1">
                            <p>
                                <strong>Superior:</strong> {conjuntoParaCambios.superior.nombre} (Talla {conjuntoParaCambios.superior.tallaSeleccionada})
                            </p>
                            <p>
                                <strong>Inferior:</strong> {conjuntoParaCambios.inferior.nombre} (Talla {conjuntoParaCambios.inferior.tallaSeleccionada})
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Color preferido</label>
                                <input
                                    type="text"
                                    placeholder="Ej. Blanco hueso / Azul marino"
                                    value={formCambiosConjunto.color_preferido}
                                    onChange={(e) => setFormCambiosConjunto({ ...formCambiosConjunto, color_preferido: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de tela deseada</label>
                                <input
                                    type="text"
                                    placeholder="Ej. Lino, Algodón, Dril"
                                    value={formCambiosConjunto.tipo_tela}
                                    onChange={(e) => setFormCambiosConjunto({ ...formCambiosConjunto, tipo_tela: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Detalle de los cambios o medidas *</label>
                                <textarea
                                    rows={3}
                                    required
                                    placeholder="Describe qué ajustes deseas en la prenda superior o inferior..."
                                    value={formCambiosConjunto.detalles}
                                    onChange={(e) => setFormCambiosConjunto({ ...formCambiosConjunto, detalles: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setConjuntoParaCambios(null)}
                                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={enviando}
                                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold disabled:opacity-50"
                            >
                                {enviando ? 'Enviando...' : 'Enviar Solicitud al Taller'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}