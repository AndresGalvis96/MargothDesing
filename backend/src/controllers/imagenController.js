const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// Helper para borrar archivo físico si falla la transacción o al eliminar
const eliminarArchivoFisico = (rutaRelativa) => {
    try {
        const rutaAbsoluta = path.join(__dirname, '..', '..', rutaRelativa.replace(/^\//, ''));
        if (fs.existsSync(rutaAbsoluta)) {
            fs.unlinkSync(rutaAbsoluta);
        }
    } catch (err) {
        console.error('No se pudo eliminar el archivo físico:', err.message);
    }
};

// =====================================================================
// 1. SUBIR IMAGEN PARA UNA PRENDA DEL TALLER (imagen + prenda_imagen)
// =====================================================================
exports.subirImagenPrenda = async (req, res) => {
    const connection = await db.getConnection();
    const rutaWeb = req.file ? `/uploads/prendas/${req.file.filename}` : null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Debes adjuntar un archivo en el campo "imagen".' });
        }

        const { prenda_id } = req.params;
        const taller_id = req.usuario.taller_id;
        const subida_por = req.usuario.id;
        const { texto_alternativo = null, es_principal = 'false', orden = 0 } = req.body;

        await connection.beginTransaction();

        // Verificar que la prenda pertenezca al taller
        const [prendaRows] = await connection.query(
            'SELECT prenda_id, nombre FROM prenda WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [prenda_id, taller_id]
        );

        if (prendaRows.length === 0) {
            await connection.rollback();
            eliminarArchivoFisico(rutaWeb);
            return res.status(404).json({ error: 'Prenda no encontrada en este taller.' });
        }

        const esPrincipalBool = es_principal === true || es_principal === 'true' || es_principal === '1';

        // Si esta imagen será la principal, desmarcar cualquier otra principal anterior de esa prenda
        if (esPrincipalBool) {
            await connection.query(
                'UPDATE prenda_imagen SET es_principal = FALSE WHERE prenda_id = ?',
                [prenda_id]
            );
        }

        // 1. Insertar metadatos en tabla imagen
        const [imgRes] = await connection.query(
            `INSERT INTO imagen (ruta, nombre_original, tipo_mime, tamano_bytes, texto_alternativo, subida_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                rutaWeb,
                req.file.originalname,
                req.file.mimetype,
                req.file.size,
                texto_alternativo || prendaRows[0].nombre,
                subida_por
            ]
        );

        const imagen_id = imgRes.insertId;

        // 2. Vincular en prenda_imagen
        await connection.query(
            `INSERT INTO prenda_imagen (prenda_id, imagen_id, es_principal, orden)
             VALUES (?, ?, ?, ?)`,
            [prenda_id, imagen_id, esPrincipalBool, Number(orden) || 0]
        );

        await connection.commit();

        res.status(201).json({
            mensaje: 'Imagen de prenda subida y vinculada exitosamente.',
            imagen_id,
            prenda_id: Number(prenda_id),
            ruta: rutaWeb,
            es_principal: esPrincipalBool,
            orden: Number(orden) || 0
        });

    } catch (error) {
        await connection.rollback();
        if (rutaWeb) eliminarArchivoFisico(rutaWeb);
        console.error('Error al subir imagen de prenda:', error);
        res.status(500).json({ error: 'Error interno al guardar la imagen de la prenda.' });
    } finally {
        connection.release();
    }
};

// =====================================================================
// 2. LISTAR IMÁGENES DE UNA PRENDA (Público / Catálogo y Taller)
// =====================================================================
exports.obtenerImagenesPrenda = async (req, res) => {
    try {
        const { prenda_id } = req.params;

        const [rows] = await db.query(
            `SELECT i.imagen_id, i.ruta, i.nombre_original, i.tipo_mime, i.tamano_bytes,
                    i.texto_alternativo, i.subida_en, pi.es_principal, pi.orden
             FROM prenda_imagen pi
             JOIN imagen i ON i.imagen_id = pi.imagen_id
             WHERE pi.prenda_id = ?
             ORDER BY pi.es_principal DESC, pi.orden ASC, i.imagen_id ASC`,
            [prenda_id]
        );

        res.json(rows);

    } catch (error) {
        console.error('Error al listar imágenes de prenda:', error);
        res.status(500).json({ error: 'Error interno al consultar las imágenes de la prenda.' });
    }
};

// =====================================================================
// 3. SUBIR IMAGEN A UN ÍTEM DE PEDIDO (referencia o resultado)
// =====================================================================
exports.subirImagenDetallePedido = async (req, res) => {
    const connection = await db.getConnection();
    const rutaWeb = req.file ? `/uploads/pedidos/${req.file.filename}` : null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Debes adjuntar un archivo en el campo "imagen".' });
        }

        const { detalle_id } = req.params;
        const { rol, id: usuarioId, taller_id } = req.usuario;
        const { tipo_imagen, texto_alternativo = null } = req.body;

        // Si es cliente solo puede subir 'referencia'; si es taller por defecto sube 'resultado'
        const tipoFinal = rol === 'cliente'
            ? 'referencia'
            : (['referencia', 'resultado'].includes(tipo_imagen) ? tipo_imagen : 'resultado');

        await connection.beginTransaction();

        const [detRows] = await connection.query(
            `SELECT dp.detalle_id, dp.taller_id, p.cliente_id
             FROM detalle_pedido dp
             JOIN pedido p ON p.pedido_id = dp.pedido_id
             WHERE dp.detalle_id = ?`,
            [detalle_id]
        );

        if (detRows.length === 0) {
            await connection.rollback();
            eliminarArchivoFisico(rutaWeb);
            return res.status(404).json({ error: 'Ítem de pedido no encontrado.' });
        }

        const detalle = detRows[0];

        if (rol === 'cliente' && detalle.cliente_id !== usuarioId) {
            await connection.rollback();
            eliminarArchivoFisico(rutaWeb);
            return res.status(403).json({ error: 'No tienes permiso para subir imágenes a este pedido.' });
        }
        if (rol !== 'cliente' && detalle.taller_id !== taller_id) {
            await connection.rollback();
            eliminarArchivoFisico(rutaWeb);
            return res.status(403).json({ error: 'Este pedido pertenece a otro taller.' });
        }

        // 1. Insertar metadatos en imagen
        const [imgRes] = await connection.query(
            `INSERT INTO imagen (ruta, nombre_original, tipo_mime, tamano_bytes, texto_alternativo, subida_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                rutaWeb,
                req.file.originalname,
                req.file.mimetype,
                req.file.size,
                texto_alternativo || `Imagen ${tipoFinal} detalle #${detalle_id}`,
                usuarioId
            ]
        );

        const imagen_id = imgRes.insertId;

        // 2. Vincular en detalle_pedido_imagen
        await connection.query(
            `INSERT INTO detalle_pedido_imagen (detalle_id, imagen_id, tipo_imagen)
             VALUES (?, ?, ?)`,
            [detalle_id, imagen_id, tipoFinal]
        );

        await connection.commit();

        res.status(201).json({
            mensaje: `Imagen de '${tipoFinal}' asociada exitosamente al ítem del pedido.`,
            imagen_id,
            detalle_id: Number(detalle_id),
            tipo_imagen: tipoFinal,
            ruta: rutaWeb
        });

    } catch (error) {
        await connection.rollback();
        if (rutaWeb) eliminarArchivoFisico(rutaWeb);
        console.error('Error al subir imagen de pedido:', error);
        res.status(500).json({ error: 'Error interno al guardar la imagen del pedido.' });
    } finally {
        connection.release();
    }
};

// =====================================================================
// 4. LISTAR IMÁGENES DE UN ÍTEM DE PEDIDO (referencia + resultado)
// =====================================================================
exports.obtenerImagenesDetallePedido = async (req, res) => {
    try {
        const { detalle_id } = req.params;
        const { rol, id: usuarioId, taller_id } = req.usuario;

        const [detRows] = await db.query(
            `SELECT dp.detalle_id, dp.taller_id, p.cliente_id
             FROM detalle_pedido dp
             JOIN pedido p ON p.pedido_id = dp.pedido_id
             WHERE dp.detalle_id = ?`,
            [detalle_id]
        );

        if (detRows.length === 0) {
            return res.status(404).json({ error: 'Ítem de pedido no encontrado.' });
        }

        if (rol === 'cliente' && detRows[0].cliente_id !== usuarioId) {
            return res.status(403).json({ error: 'No tienes permiso para ver las imágenes de este pedido.' });
        }
        if (rol !== 'cliente' && detRows[0].taller_id !== taller_id) {
            return res.status(403).json({ error: 'Este pedido pertenece a otro taller.' });
        }

        const [rows] = await db.query(
            `SELECT i.imagen_id, i.ruta, i.nombre_original, i.tipo_mime, i.tamano_bytes,
                    i.texto_alternativo, i.subida_en, dpi.tipo_imagen
             FROM detalle_pedido_imagen dpi
             JOIN imagen i ON i.imagen_id = dpi.imagen_id
             WHERE dpi.detalle_id = ?
             ORDER BY dpi.tipo_imagen ASC, i.subida_en ASC`,
            [detalle_id]
        );

        res.json(rows);

    } catch (error) {
        console.error('Error al listar imágenes del pedido:', error);
        res.status(500).json({ error: 'Error interno al consultar las imágenes del pedido.' });
    }
};

// =====================================================================
// 5. ELIMINAR UNA IMAGEN (Borra en BD y elimina el archivo físico)
// =====================================================================
exports.eliminarImagen = async (req, res) => {
    try {
        const { imagen_id } = req.params;
        const { rol, id: usuarioId } = req.usuario;

        const [rows] = await db.query('SELECT imagen_id, ruta, subida_por FROM imagen WHERE imagen_id = ?', [imagen_id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Imagen no encontrada.' });
        }

        // Un cliente solo puede borrar imágenes que él mismo subió
        if (rol === 'cliente' && rows[0].subida_por !== usuarioId) {
            return res.status(403).json({ error: 'Solo puedes eliminar imágenes subidas por ti.' });
        }

        await db.query('DELETE FROM imagen WHERE imagen_id = ?', [imagen_id]);
        eliminarArchivoFisico(rows[0].ruta);

        res.json({
            mensaje: 'Imagen eliminada correctamente.',
            imagen_id: Number(imagen_id)
        });

    } catch (error) {
        console.error('Error al eliminar imagen:', error);
        res.status(500).json({ error: 'Error interno al eliminar la imagen.' });
    }
};