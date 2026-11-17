const db = require('../config/db');

const TIPOS_VALIDOS = ['falda', 'pantalon', 'blusa', 'vestido', 'polo', 'chaqueta', 'calzado', 'otro'];
const PUBLICOS_VALIDOS = ['hombre', 'mujer', 'nino', 'nina', 'unisex_adultos', 'unisex_ninos'];
const CALIDADES_VALIDAS = ['basica', 'estandar', 'premium'];
const COMPLEJIDADES_VALIDAS = ['baja', 'media', 'alta'];

const normalizarTallas = (tallas) => {
    if (Array.isArray(tallas)) {
        const limpias = tallas.map((t) => String(t).trim()).filter(Boolean);
        return limpias.length > 0 ? limpias.join(',') : null;
    }
    if (typeof tallas === 'string') {
        const limpias = tallas.split(',').map((t) => t.trim()).filter(Boolean);
        return limpias.length > 0 ? limpias.join(',') : null;
    }
    return null;
};

// ==========================================
// 1. Crear prenda (Catálogo del taller o Personalizada)
// ==========================================
exports.crearPrenda = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const creado_por = req.usuario.id;

        const {
            nombre,
            descripcion = null,
            tipo_prenda,
            publico_objetivo = 'unisex_adultos',
            color = null,
            tallas_disponibles = null,
            calidad = 'estandar',
            complejidad = 'media',
            precio = null,
            tarifa_mano_obra = null,
            disponible = true,
            es_personalizada = false,
            solicitado_por = null,
            confeccionado_por = null
        } = req.body;

        if (!nombre || !tipo_prenda) {
            return res.status(400).json({ error: 'El nombre y el tipo_prenda son obligatorios.' });
        }
        if (!TIPOS_VALIDOS.includes(tipo_prenda)) {
            return res.status(400).json({ error: `tipo_prenda inválido. Valores permitidos: ${TIPOS_VALIDOS.join(', ')}` });
        }
        if (!PUBLICOS_VALIDOS.includes(publico_objetivo)) {
            return res.status(400).json({ error: `publico_objetivo inválido. Valores permitidos: ${PUBLICOS_VALIDOS.join(', ')}` });
        }
        if (!CALIDADES_VALIDAS.includes(calidad)) {
            return res.status(400).json({ error: `calidad inválida. Valores permitidos: ${CALIDADES_VALIDAS.join(', ')}` });
        }
        if (!COMPLEJIDADES_VALIDAS.includes(complejidad)) {
            return res.status(400).json({ error: `complejidad inválida. Valores permitidos: ${COMPLEJIDADES_VALIDAS.join(', ')}` });
        }

        const esPers = Boolean(es_personalizada);

        if (!esPers) {
            if (precio === null || precio === undefined || Number(precio) < 0) {
                return res.status(400).json({ error: 'Las prendas de catálogo requieren un precio válido (>= 0).' });
            }
            if (solicitado_por !== null) {
                return res.status(400).json({ error: 'Una prenda de catálogo no puede tener solicitado_por.' });
            }
        } else {
            if (!solicitado_por) {
                return res.status(400).json({ error: 'Una prenda personalizada requiere el ID del cliente (solicitado_por).' });
            }
            const [clienteRows] = await db.query(
                "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND rol = 'cliente' AND estado = 'activo'",
                [solicitado_por]
            );
            if (clienteRows.length === 0) {
                return res.status(404).json({ error: 'El cliente especificado en solicitado_por no existe o está inactivo.' });
            }
        }

        if (tarifa_mano_obra !== null && Number(tarifa_mano_obra) < 0) {
            return res.status(400).json({ error: 'La tarifa_mano_obra no puede ser negativa.' });
        }

        if (confeccionado_por) {
            const [opRows] = await db.query(
                "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND taller_id = ? AND rol IN ('operario','supervisor','admin_local') AND estado = 'activo'",
                [confeccionado_por, taller_id]
            );
            if (opRows.length === 0) {
                return res.status(404).json({ error: 'El confeccionista indicado no pertenece a este taller o está inactivo.' });
            }
        }

        const tallasNormalizadas = normalizarTallas(tallas_disponibles);

        const query = `
            INSERT INTO prenda (
                taller_id, nombre, descripcion, tipo_prenda, publico_objetivo, color,
                tallas_disponibles, calidad, complejidad,
                precio, tarifa_mano_obra, disponible, es_personalizada,
                solicitado_por, confeccionado_por, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(query, [
            taller_id,
            nombre.trim(),
            descripcion,
            tipo_prenda,
            publico_objetivo,
            color,
            tallasNormalizadas,
            calidad,
            complejidad,
            precio,
            tarifa_mano_obra,
            Boolean(disponible),
            esPers,
            esPers ? solicitado_por : null,
            confeccionado_por,
            creado_por
        ]);

        res.status(201).json({
            mensaje: esPers ? 'Prenda personalizada registrada exitosamente.' : 'Prenda agregada al catálogo exitosamente.',
            prenda_id: result.insertId,
            taller_id
        });
    } catch (error) {
        console.error('Error al crear prenda:', error);
        res.status(500).json({ error: 'Error interno al registrar la prenda.' });
    }
};

// ==========================================
// 2. Obtener prendas del taller (personal interno)
// ==========================================
exports.obtenerPrendasTaller = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { tipo_prenda, publico_objetivo, es_personalizada, disponible } = req.query;

        let query = `
            SELECT prenda_id, taller_id, nombre, descripcion, tipo_prenda, publico_objetivo, color,
                   tallas_disponibles, calidad, complejidad, precio, tarifa_mano_obra,
                   disponible, es_personalizada, solicitado_por, confeccionado_por, creado_en
            FROM prenda
            WHERE taller_id = ? AND eliminado_en IS NULL
        `;
        const params = [taller_id];

        if (tipo_prenda) {
            query += ' AND tipo_prenda = ?';
            params.push(tipo_prenda);
        }
        if (publico_objetivo) {
            query += ' AND publico_objetivo = ?';
            params.push(publico_objetivo);
        }
        if (es_personalizada !== undefined) {
            query += ' AND es_personalizada = ?';
            params.push(es_personalizada === 'true' || es_personalizada === '1' ? 1 : 0);
        }
        if (disponible !== undefined) {
            query += ' AND disponible = ?';
            params.push(disponible === 'true' || disponible === '1' ? 1 : 0);
        }

        query += ' ORDER BY creado_en DESC';

        const [prendas] = await db.query(query, params);
        res.json(prendas);
    } catch (error) {
        console.error('Error al obtener prendas del taller:', error);
        res.status(500).json({ error: 'Error interno al obtener las prendas.' });
    }
};

// ==========================================
// 3. Catálogo Público con Tallas Reales y Variantes en Stock
// ==========================================
exports.obtenerCatalogoPublicoTaller = async (req, res) => {
    try {
        const { taller_id } = req.params;

        const [prendas] = await db.query(
            `SELECT prenda_id, taller_id, nombre, descripcion, tipo_prenda, publico_objetivo, color,
                    tallas_disponibles, calidad, complejidad, precio
             FROM prenda
             WHERE taller_id = ? AND es_personalizada = 0 AND disponible = 1 AND eliminado_en IS NULL
             ORDER BY creado_en DESC`,
            [taller_id]
        );

        if (prendas.length === 0) {
            return res.json([]);
        }

        const prendaIds = prendas.map((p) => p.prenda_id);
        const [variantes] = await db.query(
            `SELECT variante_id, prenda_id, talla, color, tela, stock_disponible
             FROM prenda_inventario
             WHERE prenda_id IN (?) AND stock_disponible > 0
             ORDER BY color ASC, talla ASC`,
            [prendaIds]
        );

        const variantesPorPrenda = {};
        for (const v of variantes) {
            if (!variantesPorPrenda[v.prenda_id]) {
                variantesPorPrenda[v.prenda_id] = [];
            }
            variantesPorPrenda[v.prenda_id].push(v);
        }

        const resultado = prendas.map((p) => ({
            ...p,
            variantes_stock: variantesPorPrenda[p.prenda_id] || []
        }));

        res.json(resultado);
    } catch (error) {
        console.error('Error al obtener catálogo público con inventario:', error);
        res.status(500).json({ error: 'Error interno al cargar el catálogo.' });
    }
};

// ==========================================
// 4. Listar variantes de stock de una prenda (Taller)
// ==========================================
exports.obtenerVariantesPrenda = async (req, res) => {
    try {
        const { id } = req.params;
        const [variantes] = await db.query(
            `SELECT variante_id, prenda_id, talla, color, tela, stock_disponible
             FROM prenda_inventario
             WHERE prenda_id = ?
             ORDER BY color ASC, talla ASC`,
            [id]
        );
        res.json(variantes);
    } catch (error) {
        console.error('Error al consultar variantes:', error);
        res.status(500).json({ error: 'Error al obtener variantes de inventario.' });
    }
};

// ==========================================
// 5. Cargar o sumar lote terminado al inventario (Taller)
// ==========================================
exports.agregarVarianteStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { talla, color, tela, cantidad } = req.body;

        if (!talla || !color || !tela || !cantidad || Number(cantidad) <= 0) {
            return res.status(400).json({ error: 'Talla, color, tela y una cantidad positiva son obligatorios.' });
        }

        const [existente] = await db.query(
            `SELECT variante_id, stock_disponible
             FROM prenda_inventario
             WHERE prenda_id = ? AND LOWER(talla) = LOWER(?) AND LOWER(color) = LOWER(?) AND LOWER(tela) = LOWER(?)`,
            [id, talla.trim(), color.trim(), tela.trim()]
        );

        if (existente.length > 0) {
            const nuevoStock = existente[0].stock_disponible + Number(cantidad);
            await db.query(
                'UPDATE prenda_inventario SET stock_disponible = ? WHERE variante_id = ?',
                [nuevoStock, existente[0].variante_id]
            );
            return res.json({
                mensaje: 'Stock sumado al lote existente.',
                variante_id: existente[0].variante_id,
                stock_disponible: nuevoStock
            });
        }

        const [result] = await db.query(
            `INSERT INTO prenda_inventario (prenda_id, talla, color, tela, stock_disponible)
             VALUES (?, ?, ?, ?, ?)`,
            [id, talla.trim(), color.trim(), tela.trim(), Number(cantidad)]
        );

        res.status(201).json({
            mensaje: 'Variante de inventario registrada exitosamente.',
            variante_id: result.insertId
        });
    } catch (error) {
        console.error('Error al agregar variante de inventario:', error);
        res.status(500).json({ error: 'Error interno al registrar inventario terminado.' });
    }
};

// ==========================================
// 6. Obtener detalle de una prenda por ID
// ==========================================
exports.obtenerPrendaPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;

        const [rows] = await db.query(
            'SELECT * FROM prenda WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [id, taller_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Prenda no encontrada en este taller.' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener prenda:', error);
        res.status(500).json({ error: 'Error interno al consultar la prenda.' });
    }
};

// ==========================================
// 7. Actualizar prenda (admin_local y supervisor)
// ==========================================
exports.actualizarPrenda = async (req, res) => {
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;
        const actualizado_por = req.usuario.id;

        const [existe] = await db.query(
            'SELECT * FROM prenda WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [id, taller_id]
        );

        if (existe.length === 0) {
            return res.status(404).json({ error: 'Prenda no encontrada en este taller.' });
        }

        const actual = existe[0];
        const {
            nombre = actual.nombre,
            descripcion = actual.descripcion,
            tipo_prenda = actual.tipo_prenda,
            publico_objetivo = actual.publico_objetivo || 'unisex_adultos',
            color = actual.color,
            tallas_disponibles = actual.tallas_disponibles,
            calidad = actual.calidad,
            complejidad = actual.complejidad,
            precio = actual.precio,
            tarifa_mano_obra = actual.tarifa_mano_obra,
            disponible = actual.disponible,
            confeccionado_por = actual.confeccionado_por
        } = req.body;

        if (!TIPOS_VALIDOS.includes(tipo_prenda)) {
            return res.status(400).json({ error: `tipo_prenda inválido. Valores permitidos: ${TIPOS_VALIDOS.join(', ')}` });
        }
        if (!PUBLICOS_VALIDOS.includes(publico_objetivo)) {
            return res.status(400).json({ error: `publico_objetivo inválido. Valores permitidos: ${PUBLICOS_VALIDOS.join(', ')}` });
        }
        if (!CALIDADES_VALIDAS.includes(calidad)) {
            return res.status(400).json({ error: `calidad inválida. Valores permitidos: ${CALIDADES_VALIDAS.join(', ')}` });
        }
        if (!COMPLEJIDADES_VALIDAS.includes(complejidad)) {
            return res.status(400).json({ error: `complejidad inválida. Valores permitidos: ${COMPLEJIDADES_VALIDAS.join(', ')}` });
        }

        if (!actual.es_personalizada && (precio === null || precio === undefined || Number(precio) < 0)) {
            return res.status(400).json({ error: 'Una prenda de catálogo debe mantener un precio válido (>= 0).' });
        }

        const tallasNormalizadas = req.body.tallas_disponibles !== undefined
            ? normalizarTallas(req.body.tallas_disponibles)
            : actual.tallas_disponibles;

        const query = `
            UPDATE prenda
            SET nombre = ?,
                descripcion = ?,
                tipo_prenda = ?,
                publico_objetivo = ?,
                color = ?,
                tallas_disponibles = ?,
                calidad = ?,
                complejidad = ?,
                precio = ?,
                tarifa_mano_obra = ?,
                disponible = ?,
                confeccionado_por = ?,
                actualizado_por = ?
            WHERE prenda_id = ? AND taller_id = ?
        `;

        await db.query(query, [
            nombre.trim(),
            descripcion,
            tipo_prenda,
            publico_objetivo,
            color,
            tallasNormalizadas,
            calidad,
            complejidad,
            precio,
            tarifa_mano_obra,
            Boolean(disponible),
            confeccionado_por,
            actualizado_por,
            id,
            taller_id
        ]);

        res.json({
            mensaje: 'Prenda actualizada correctamente.',
            prenda_id: Number(id)
        });
    } catch (error) {
        console.error('Error al actualizar prenda:', error);
        res.status(500).json({ error: 'Error interno al actualizar la prenda.' });
    }
};

// ==========================================
// 8. Cambiar disponibilidad rápida (ocultar/mostrar - solo admin_local)
// ==========================================
exports.cambiarDisponibilidadPrenda = async (req, res) => {
    try {
        const { id } = req.params;
        const { disponible } = req.body;
        const taller_id = req.usuario.taller_id;
        const actualizado_por = req.usuario.id;

        if (typeof disponible !== 'boolean') {
            return res.status(400).json({ error: 'El campo disponible debe ser true o false.' });
        }

        const [result] = await db.query(
            'UPDATE prenda SET disponible = ?, actualizado_por = ? WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [disponible, actualizado_por, id, taller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Prenda no encontrada en este taller.' });
        }

        res.json({
            mensaje: `Disponibilidad de la prenda actualizada a ${disponible ? 'visible' : 'oculta'}.`,
            prenda_id: Number(id),
            disponible
        });
    } catch (error) {
        console.error('Error al cambiar disponibilidad de prenda:', error);
        res.status(500).json({ error: 'Error interno al cambiar la disponibilidad.' });
    }
};

// ==========================================
// 9. Eliminar prenda (Soft Delete - solo admin_local)
// ==========================================
exports.eliminarPrenda = async (req, res) => {
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;
        const eliminado_por = req.usuario.id;

        const [result] = await db.query(
            `UPDATE prenda 
             SET eliminado_por = ?, eliminado_en = NOW(), disponible = FALSE 
             WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL`,
            [eliminado_por, id, taller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Prenda no encontrada o ya fue eliminada.' });
        }

        res.json({
            mensaje: 'Prenda eliminada correctamente del catálogo.',
            prenda_id: Number(id)
        });
    } catch (error) {
        console.error('Error al eliminar prenda:', error);
        res.status(500).json({ error: 'Error interno al eliminar la prenda.' });
    }
};