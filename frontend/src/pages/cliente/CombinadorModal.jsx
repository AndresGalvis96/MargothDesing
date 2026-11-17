import { useState, useMemo } from 'react';
import { API_BASE_URL } from '../../api/axiosClient';
import { ChevronLeft, ChevronRight, X, Shirt, ShoppingBag, Sparkles, Layers } from 'lucide-react';

const TIPOS_SUPERIOR = ['blusa', 'polo', 'chaqueta', 'vestido'];
const TIPOS_INFERIOR = ['pantalon', 'falda', 'calzado', 'otro'];

const obtenerTallasPrenda = (prenda) => {
    if (!prenda) return ['M'];
    if (prenda.tallas_disponibles) {
        return String(prenda.tallas_disponibles).split(',').map((t) => t.trim()).filter(Boolean);
    }
    if (prenda.variantes_stock?.length > 0) {
        return [...new Set(prenda.variantes_stock.map((v) => v.talla))];
    }
    return ['S', 'M', 'L'];
};

export default function CombinadorModal({
    abierto,
    onCerrar,
    prendas,
    imagenesMap,
    onComprarConjunto,
    onSolicitarCambiosConjunto,
    enviando
}) {
    const superiores = useMemo(() => {
        const filtradas = prendas.filter((p) => TIPOS_SUPERIOR.includes(p.tipo_prenda));
        return filtradas.length > 0 ? filtradas : prendas;
    }, [prendas]);

    const inferiores = useMemo(() => {
        const filtradas = prendas.filter((p) => TIPOS_INFERIOR.includes(p.tipo_prenda));
        return filtradas.length > 0 ? filtradas : prendas;
    }, [prendas]);

    const [idxSup, setIdxSup] = useState(0);
    const [idxInf, setIdxInf] = useState(0);
    const [tallaSup, setTallaSup] = useState('');
    const [tallaInf, setTallaInf] = useState('');

    if (!abierto || prendas.length === 0) return null;

    const prendaSup = superiores[idxSup % superiores.length];
    const prendaInf = inferiores[idxInf % inferiores.length];

    const tallasSupDisponibles = obtenerTallasPrenda(prendaSup);
    const tallasInfDisponibles = obtenerTallasPrenda(prendaInf);

    const tallaSupActiva = tallasSupDisponibles.includes(tallaSup) ? tallaSup : tallasSupDisponibles[0];
    const tallaInfActiva = tallasInfDisponibles.includes(tallaInf) ? tallaInf : tallasInfDisponibles[0];

    const totalConjunto = Number(prendaSup?.precio || 0) + Number(prendaInf?.precio || 0);

    const navegar = (tipo, delta) => {
        if (tipo === 'sup') {
            setIdxSup((prev) => (prev + delta + superiores.length) % superiores.length);
            setTallaSup('');
        } else {
            setIdxInf((prev) => (prev + delta + inferiores.length) % inferiores.length);
            setTallaInf('');
        }
    };

    const construirPayloadConjunto = () => ({
        superior: { ...prendaSup, tallaSeleccionada: tallaSupActiva },
        inferior: { ...prendaInf, tallaSeleccionada: tallaInfActiva },
        total: totalConjunto
    });

    const renderSlide = (prenda, etiqueta, tallasLista, tallaActual, onCambiarTalla, onPrev, onNext) => (
        <div className="relative bg-slate-50 rounded-2xl border border-slate-200 p-3 flex items-center gap-3">
            <button
                type="button"
                onClick={onPrev}
                className="p-2 rounded-full bg-white border border-slate-300 shadow-sm hover:bg-indigo-50 text-slate-700 shrink-0"
                title="Anterior"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                    {imagenesMap[prenda.prenda_id] ? (
                        <img
                            src={`${API_BASE_URL}${imagenesMap[prenda.prenda_id].startsWith('/') ? '' : '/'}${imagenesMap[prenda.prenda_id]}`}
                            alt={prenda.nombre}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <Shirt className="w-10 h-10 text-slate-300" />
                    )}
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                        {etiqueta} • {prenda.tipo_prenda}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base">{prenda.nombre}</h4>
                    <p className="text-sm font-extrabold text-slate-800">
                        ${Number(prenda.precio || 0).toLocaleString('es-CO')}
                    </p>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1 pt-1">
                        <span className="text-[11px] font-semibold text-slate-500 mr-1">Talla:</span>
                        {tallasLista.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => onCambiarTalla(t)}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                    tallaActual === t
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <button
                type="button"
                onClick={onNext}
                className="p-2 rounded-full bg-white border border-slate-300 shadow-sm hover:bg-indigo-50 text-slate-700 shrink-0"
                title="Siguiente"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <Layers className="w-5 h-5 text-indigo-600" />
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Combinador de Prendas</h3>
                            <p className="text-xs text-slate-500">Desliza las prendas superiores e inferiores hasta armar tu conjunto ideal</p>
                        </div>
                    </div>
                    <button type="button" onClick={onCerrar} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Carril Superior sobre Carril Inferior */}
                <div className="space-y-2.5">
                    {renderSlide(
                        prendaSup,
                        'Prenda Superior',
                        tallasSupDisponibles,
                        tallaSupActiva,
                        setTallaSup,
                        () => navegar('sup', -1),
                        () => navegar('sup', 1)
                    )}

                    {renderSlide(
                        prendaInf,
                        'Prenda Inferior',
                        tallasInfDisponibles,
                        tallaInfActiva,
                        setTallaInf,
                        () => navegar('inf', -1),
                        () => navegar('inf', 1)
                    )}
                </div>

                {/* Resumen y Acciones */}
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <span className="text-xs text-slate-500 block">Total estimado del conjunto</span>
                        <span className="text-xl font-extrabold text-slate-900">
                            ${totalConjunto.toLocaleString('es-CO')}
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={enviando}
                            onClick={() => onSolicitarCambiosConjunto(construirPayloadConjunto())}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-indigo-600 text-indigo-700 hover:bg-indigo-50 text-xs font-bold disabled:opacity-50"
                        >
                            <Sparkles className="w-4 h-4" />
                            Solicitar cambios
                        </button>
                        <button
                            type="button"
                            disabled={enviando}
                            onClick={() => onComprarConjunto(construirPayloadConjunto())}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                        >
                            <ShoppingBag className="w-4 h-4" />
                            {enviando ? 'Procesando...' : 'Comprar este conjunto'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}