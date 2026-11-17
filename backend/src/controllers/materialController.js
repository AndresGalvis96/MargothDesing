const db = require('../config/db');
const { decrypt } = require('../utils/crypto');

const CATEGORIAS_VALIDAS = ['tela', 'hilo', 'boton', 'ojalete', 'cordon', 'cierre', 'metal', 'cristal', 'otro'];
const UNIDADES_VALIDAS = ['metro', 'unidad', 'cono', 'gramo', 'par'];

// =====================================================================
// INVENTARIO DE MATERIALES (material)
// =====================================================================

// Crear un nuevo material en el taller
exports.crearMaterial = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const creado_por = req.usuario.id;
        const {
            nombre,
            categoria,
            descripcion = null,
            unidad,
            precio_unitario,
            stock_actual = 0,
            stock_minimo = 0
        } = req.body;

        if (!nombre || !categoria || !unidad || precio_unitario === undefined) {
            return res.status(400).json({
                error: 'Nombre, categoria, unidad y precio_unitario son obligatorios.'
            });
        }

        if (!CATEGORIAS_VALIDAS.includes(categoria)) {
            return res.status(400).json({
                error: `Categoría inválida. Valores permitidos: ${CATEGORIAS_VALIDAS.join(', ')}`
            });
        }

        if (!UNIDADES_VALIDAS.includes(unidad)) {
            return res.status(400).json({
                error: `Unidad inválida. Valores permitidos: ${UNIDADES_VALIDAS.join(', ')}`
            });
        }

        if (Number(precio_unitario) < 0 || Number(stock_actual) < 0 || Number(stock_minimo) < 0) {
            return res.status(400).json({
                error: 'El precio unitario, stock actual y stock mínimo no pueden ser negativos.'
            });
        }

        const query = `
            INSERT INTO material (
                taller_id, nombre, categoria, descripcion, unidad,
                precio_unitario, stock_actual, stock_minimo, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(query, [
            taller_id,
            nombre.trim(),
            categoria,
            descripcion,
            unidad,
            precio_unitario,
            stock_actual,
            stock_minimo,
            creado_por
        ]);

        res.status(201).json({
            mensaje: 'Material registrado exitosamente en el inventario.',
            material_id: result.insertId,
            taller_id
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un material con ese nombre en este taller.' });
        }
        console.error('Error al crear material:', error);
        res.status(500).json({ error: 'Error interno al registrar el material.' });
    }
};

// Listar materiales del taller (permite filtrar por ?categoria=tela&solo_stock_bajo=true)
exports.obtenerMaterialesTaller = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { categoria, solo_stock_bajo } = req.query;

        let query = `
            SELECT material_id, taller_id, nombre, categoria, descripcion, unidad,
                   precio_unitario, stock_actual, stock_minimo, creado_en, actualizado_en
            FROM material
            WHERE taller_id = ? AND eliminado_en IS NULL
        `;
        const params = [taller_id];

        if (categoria) {
            query += ' AND categoria = ?';
            params.push(categoria);
        }

        if (solo_stock_bajo === 'true' || solo_stock_bajo === '1') {
            query += ' AND stock_actual <= stock_minimo';
        }

        query += ' ORDER BY nombre ASC';

        const [materiales] = await db.query(query, params);

        const respuesta = materiales.map(mat => ({
            ...mat,
            alerta_stock_bajo: Number(mat.stock_actual) <= Number(mat.stock_minimo)
        }));

        res.json(respuesta);

    } catch (error) {
        console.error('Error al obtener materiales:', error);
        res.status(500).json({ error: 'Error interno al consultar el inventario de materiales.' });
    }
};

// Actualizar datos maestros del material (sin alterar stock_actual directamente)
exports.actualizarMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;
        const actualizado_por = req.usuario.id;

        const [existe] = await db.query(
            'SELECT * FROM material WHERE material_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [id, taller_id]
        );

        if (existe.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado en este taller.' });
        }

        const actual = existe[0];
        const {
            nombre = actual.nombre,
            categoria = actual.categoria,
            descripcion = actual.descripcion,
            unidad = actual.unidad,
            precio_unitario = actual.precio_unitario,
            stock_minimo = actual.stock_minimo
        } = req.body;

        if (!CATEGORIAS_VALIDAS.includes(categoria)) {
            return res.status(400).json({ error: `Categoría inválida: ${CATEGORIAS_VALIDAS.join(', ')}` });
        }
        if (!UNIDADES_VALIDAS.includes(unidad)) {
            return res.status(400).json({ error: `Unidad inválida: ${UNIDADES_VALIDAS.join(', ')}` });
        }
        if (Number(precio_unitario) < 0 || Number(stock_minimo) < 0) {
            return res.status(400).json({ error: 'Precio unitario y stock mínimo no pueden ser negativos.' });
        }

        const query = `
            UPDATE material
            SET nombre = ?,
                categoria = ?,
                descripcion = ?,
                unidad = ?,
                precio_unitario = ?,
                stock_minimo = ?,
                actualizado_por = ?
            WHERE material_id = ? AND taller_id = ?
        `;

        await db.query(query, [
            nombre.trim(),
            categoria,
            descripcion,
            unidad,
            precio_unitario,
            stock_minimo,
            actualizado_por,
            id,
            taller_id
        ]);

        res.json({
            mensaje: 'Material actualizado correctamente.',
            material_id: Number(id)
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe otro material con ese nombre en el taller.' });
        }
        console.error('Error al actualizar material:', error);
        res.status(500).json({ error: 'Error interno al actualizar el material.' });
    }
};

// Registrar entrada de compra o ajuste de stock (Transacción: material + movimiento_material)
exports.registrarMovimientoStock = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;
        const usuario_id = req.usuario.id;
        const { tipo, cantidad, costo_unitario, observacion = null } = req.body;

        const TIPOS_MOV = ['entrada', 'ajuste_mas', 'ajuste_menos'];
        if (!TIPOS_MOV.includes(tipo)) {
            return res.status(400).json({
                error: "Tipo de movimiento inválido. Usa 'entrada', 'ajuste_mas' o 'ajuste_menos' (los consumos van ligados a un pedido)."
            });
        }

        const cantNum = Number(cantidad);
        if (!cantNum || cantNum <= 0) {
            return res.status(400).json({ error: 'La cantidad debe ser mayor a 0.' });
        }

        await connection.beginTransaction();

        // Bloquear fila para evitar condiciones de carrera en stock concurrente
        const [rows] = await connection.query(
            'SELECT stock_actual, precio_unitario FROM material WHERE material_id = ? AND taller_id = ? AND eliminado_en IS NULL FOR UPDATE',
            [id, taller_id]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Material no encontrado en este taller.' });
        }

        const stockActual = Number(rows[0].stock_actual);
        const costoFinal = costo_unitario !== undefined ? Number(costo_unitario) : Number(rows[0].precio_unitario);

        if (costoFinal < 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'El costo unitario no puede ser negativo.' });
        }

        const nuevoStock = tipo === 'ajuste_menos' ? stockActual - cantNum : stockActual + cantNum;

        if (nuevoStock < 0) {
            await connection.rollback();
            return res.status(400).json({
                error: `Stock insuficiente para realizar el ajuste. Stock actual: ${stockActual}`
            });
        }

        // 1. Actualizar stock (y precio_unitario si es una entrada de compra con nuevo precio)
        if (tipo === 'entrada' && costo_unitario !== undefined) {
            await connection.query(
                'UPDATE material SET stock_actual = ?, precio_unitario = ?, actualizado_por = ? WHERE material_id = ? AND taller_id = ?',
                [nuevoStock, costoFinal, usuario_id, id, taller_id]
            );
        } else {
            await connection.query(
                'UPDATE material SET stock_actual = ?, actualizado_por = ? WHERE material_id = ? AND taller_id = ?',
                [nuevoStock, usuario_id, id, taller_id]
            );
        }

        // 2. Insertar registro en el kardex (movimiento_material)
        const [movResult] = await connection.query(
            `INSERT INTO movimiento_material (taller_id, material_id, tipo, cantidad, costo_unitario, detalle_id, usuario_id, observacion)
             VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
            [taller_id, id, tipo, cantNum, costoFinal, usuario_id, observacion]
        );

        await connection.commit();

        res.status(201).json({
            mensaje: 'Movimiento de inventario registrado correctamente.',
            movimiento_id: movResult.insertId,
            material_id: Number(id),
            stock_anterior: stockActual,
            stock_actual: nuevoStock
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error en movimiento de stock:', error);
        res.status(500).json({ error: 'Error interno al procesar el movimiento de stock.' });
    } finally {
        connection.release();
    }
};

// Eliminar material (Soft Delete)
exports.eliminarMaterial = async (req, res) => {
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;
        const eliminado_por = req.usuario.id;

        const [result] = await db.query(
            'UPDATE material SET eliminado_por = ?, eliminado_en = NOW() WHERE material_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [eliminado_por, id, taller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Material no encontrado o ya fue eliminado.' });
        }

        res.json({
            mensaje: 'Material eliminado del inventario.',
            material_id: Number(id)
        });

    } catch (error) {
        console.error('Error al eliminar material:', error);
        res.status(500).json({ error: 'Error interno al eliminar el material.' });
    }
};

// =====================================================================
// FICHA TÉCNICA DE PRENDA (prenda_material)
// =====================================================================

// Consultar la ficha técnica (lista de materiales y costo estimado) de una prenda
exports.obtenerFichaTecnicaPrenda = async (req, res) => {
    try {
        const { prenda_id } = req.params;
        const taller_id = req.usuario.taller_id;

        // Verificar que la prenda pertenezca al taller
        const [prendaRows] = await db.query(
            'SELECT prenda_id, nombre, tarifa_mano_obra FROM prenda WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [prenda_id, taller_id]
        );

        if (prendaRows.length === 0) {
            return res.status(404).json({ error: 'Prenda no encontrada en este taller.' });
        }

        const query = `
            SELECT pm.prenda_id, pm.material_id, m.nombre AS material, m.categoria,
                   m.unidad, m.precio_unitario, m.stock_actual,
                   pm.cantidad_estimada, pm.nota,
                   ROUND(COALESCE(pm.cantidad_estimada, 0) * m.precio_unitario, 2) AS costo_estimado_item
            FROM prenda_material pm
            JOIN material m ON m.material_id = pm.material_id AND m.taller_id = pm.taller_id
            WHERE pm.prenda_id = ? AND pm.taller_id = ? AND m.eliminado_en IS NULL
            ORDER BY m.categoria ASC, m.nombre ASC
        `;

        const [insumos] = await db.query(query, [prenda_id, taller_id]);

        const costoTotalMateriales = insumos.reduce(
            (acc, item) => acc + Number(item.costo_estimado_item),
            0
        );

        res.json({
            prenda: prendaRows[0],
            insumos,
            resumen_costos: {
                costo_estimado_materiales: Number(costoTotalMateriales.toFixed(2)),
                tarifa_mano_obra: Number(prendaRows[0].tarifa_mano_obra || 0),
                costo_base_produccion: Number(
                    (costoTotalMateriales + Number(prendaRows[0].tarifa_mano_obra || 0)).toFixed(2)
                )
            }
        });

    } catch (error) {
        console.error('Error al obtener ficha técnica:', error);
        res.status(500).json({ error: 'Error interno al consultar la ficha técnica de la prenda.' });
    }
};

// Agregar o actualizar un material en la ficha técnica de una prenda (Upsert compuesto)
exports.asignarMaterialAPrenda = async (req, res) => {
    try {
        const { prenda_id } = req.params;
        const taller_id = req.usuario.taller_id;
        const { material_id, cantidad_estimada = null, nota = null } = req.body;

        if (!material_id) {
            return res.status(400).json({ error: 'El material_id es obligatorio.' });
        }

        if (cantidad_estimada !== null && Number(cantidad_estimada) <= 0) {
            return res.status(400).json({ error: 'La cantidad_estimada debe ser mayor a 0.' });
        }

        // Validar que tanto la prenda como el material existan y pertenezcan al mismo taller
        const [prenda] = await db.query(
            'SELECT prenda_id FROM prenda WHERE prenda_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [prenda_id, taller_id]
        );
        if (prenda.length === 0) {
            return res.status(404).json({ error: 'La prenda no existe en este taller.' });
        }

        const [material] = await db.query(
            'SELECT material_id FROM material WHERE material_id = ? AND taller_id = ? AND eliminado_en IS NULL',
            [material_id, taller_id]
        );
        if (material.length === 0) {
            return res.status(404).json({ error: 'El material no existe en este taller.' });
        }

        // Insertar o actualizar si ya existía en la ficha técnica (pk_prenda_material)
        const query = `
            INSERT INTO prenda_material (prenda_id, material_id, taller_id, cantidad_estimada, nota)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                cantidad_estimada = VALUES(cantidad_estimada),
                nota = VALUES(nota)
        `;

        await db.query(query, [prenda_id, material_id, taller_id, cantidad_estimada, nota]);

        res.status(201).json({
            mensaje: 'Ficha técnica de la prenda actualizada correctamente.',
            prenda_id: Number(prenda_id),
            material_id: Number(material_id)
        });

    } catch (error) {
        console.error('Error al asignar material a prenda:', error);
        res.status(500).json({ error: 'Error interno al actualizar la ficha técnica.' });
    }
};

// Quitar un material de la ficha técnica de una prenda
exports.quitarMaterialDePrenda = async (req, res) => {
    try {
        const { prenda_id, material_id } = req.params;
        const taller_id = req.usuario.taller_id;

        const [result] = await db.query(
            'DELETE FROM prenda_material WHERE prenda_id = ? AND material_id = ? AND taller_id = ?',
            [prenda_id, material_id, taller_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ese material no está asociado a la prenda indicada.' });
        }

        res.json({
            mensaje: 'Material removido de la ficha técnica.',
            prenda_id: Number(prenda_id),
            material_id: Number(material_id)
        });

    } catch (error) {
        console.error('Error al quitar material de prenda:', error);
        res.status(500).json({ error: 'Error interno al remover el material de la ficha técnica.' });
    }
};
// =====================================================================
// KARDEX DE PRODUCCIÓN: CONSUMO REAL LIGADO A UN DETALLE DE PEDIDO
// =====================================================================

// Registrar consumo real de material(es) en un ítem de pedido (detalle_id)
exports.registrarConsumoProduccion = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { rol, id: usuario_id, taller_id } = req.usuario;
        const { detalle_id, consumos } = req.body;

        if (!detalle_id) {
            return res.status(400).json({ error: 'El detalle_id del pedido es obligatorio.' });
        }

        if (!Array.isArray(consumos) || consumos.length === 0) {
            return res.status(400).json({
                error: 'Debes enviar al menos un material en el arreglo consumos: [{ material_id, cantidad, observacion }].'
            });
        }

        await connection.beginTransaction();

        // 1. Verificar que el detalle_id exista en el taller y esté asignado/en proceso
        const [detRows] = await connection.query(
            `SELECT dp.detalle_id, dp.pedido_id, dp.asignado_a, dp.estado_confeccion, p.estado AS pedido_estado
             FROM detalle_pedido dp
             JOIN pedido p ON p.pedido_id = dp.pedido_id
             WHERE dp.detalle_id = ? AND dp.taller_id = ?`,
            [detalle_id, taller_id]
        );

        if (detRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'El ítem de pedido (detalle_id) no existe en este taller.' });
        }

        const detalle = detRows[0];

        if (['rechazado', 'cancelado', 'entregado'].includes(detalle.pedido_estado)) {
            await connection.rollback();
            return res.status(400).json({
                error: `No se pueden registrar consumos porque el pedido está '${detalle.pedido_estado}'.`
            });
        }

        if (detalle.estado_confeccion === 'pendiente' || !detalle.asignado_a) {
            await connection.rollback();
            return res.status(400).json({
                error: 'No se puede registrar consumo sobre un ítem que aún no tiene operario asignado.'
            });
        }

        if (rol === 'operario' && detalle.asignado_a !== usuario_id) {
            await connection.rollback();
            return res.status(403).json({
                error: 'Solo puedes registrar consumo de materiales en las prendas asignadas a ti.'
            });
        }

        const movimientosRegistrados = [];
        let costoTotalConsumo = 0;

        // 2. Procesar cada material consumido bloqueando su fila en inventario
        for (const item of consumos) {
            const { material_id, cantidad, observacion = null } = item;
            const cantNum = Number(cantidad);

            if (!material_id || !cantNum || cantNum <= 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'Cada elemento en consumos debe tener material_id válido y cantidad mayor a 0.'
                });
            }

            const [matRows] = await connection.query(
                `SELECT material_id, nombre, unidad, precio_unitario, stock_actual, stock_minimo
                 FROM material
                 WHERE material_id = ? AND taller_id = ? AND eliminado_en IS NULL
                 FOR UPDATE`,
                [material_id, taller_id]
            );

            if (matRows.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    error: `El material ID ${material_id} no existe en el inventario de este taller.`
                });
            }

            const mat = matRows[0];
            const stockActual = Number(mat.stock_actual);
            const costoUnitario = Number(mat.precio_unitario);

            if (stockActual < cantNum) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Stock insuficiente para '${mat.nombre}'. Disponible: ${stockActual} ${mat.unidad}, solicitado: ${cantNum} ${mat.unidad}.`
                });
            }

            const nuevoStock = Number((stockActual - cantNum).toFixed(2));
            const costoLinea = Number((cantNum * costoUnitario).toFixed(2));
            costoTotalConsumo += costoLinea;

            // Descontar del inventario
            await connection.query(
                'UPDATE material SET stock_actual = ?, actualizado_por = ? WHERE material_id = ? AND taller_id = ?',
                [nuevoStock, usuario_id, material_id, taller_id]
            );

            // Registrar en movimiento_material con tipo = 'consumo' y detalle_id obligatorio
            const [movRes] = await connection.query(
                `INSERT INTO movimiento_material (
                    taller_id, material_id, tipo, cantidad, costo_unitario, detalle_id, usuario_id, observacion
                 ) VALUES (?, ?, 'consumo', ?, ?, ?, ?, ?)`,
                [taller_id, material_id, cantNum, costoUnitario, detalle_id, usuario_id, observacion]
            );

            movimientosRegistrados.push({
                movimiento_id: movRes.insertId,
                material_id: mat.material_id,
                material: mat.nombre,
                unidad: mat.unidad,
                cantidad_consumida: cantNum,
                costo_unitario: costoUnitario,
                costo_total_linea: costoLinea,
                stock_anterior: stockActual,
                stock_restante: nuevoStock,
                alerta_stock_bajo: nuevoStock <= Number(mat.stock_minimo)
            });
        }

        await connection.commit();

        res.status(201).json({
            mensaje: 'Consumo de materiales registrado y descontado del inventario.',
            detalle_id: Number(detalle_id),
            pedido_id: detalle.pedido_id,
            costo_total_consumo: Number(costoTotalConsumo.toFixed(2)),
            movimientos: movimientosRegistrados
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al registrar consumo de producción:', error);
        res.status(500).json({ error: 'Error interno al registrar el consumo de materiales.' });
    } finally {
        connection.release();
    }
};

// Consultar historial de Kardex del taller (entradas, consumos y ajustes)
exports.obtenerKardexMateriales = async (req, res) => {
    try {
        const taller_id = req.usuario.taller_id;
        const { material_id, detalle_id, tipo } = req.query;

        let query = `
            SELECT mm.movimiento_id, mm.material_id, m.nombre AS material, m.unidad,
                   mm.tipo, mm.cantidad, mm.costo_unitario,
                   ROUND(mm.cantidad * mm.costo_unitario, 2) AS costo_total,
                   mm.detalle_id, mm.usuario_id,
                   u.nombres_cifrado, u.apellidos_cifrado,
                   mm.fecha, mm.observacion
            FROM movimiento_material mm
            JOIN material m ON m.material_id = mm.material_id
            JOIN usuario u ON u.usuario_id = mm.usuario_id
            WHERE mm.taller_id = ?
        `;
        const params = [taller_id];

        if (material_id) {
            query += ' AND mm.material_id = ?';
            params.push(material_id);
        }
        if (detalle_id) {
            query += ' AND mm.detalle_id = ?';
            params.push(detalle_id);
        }
        if (tipo) {
            query += ' AND mm.tipo = ?';
            params.push(tipo);
        }

        query += ' ORDER BY mm.fecha DESC, mm.movimiento_id DESC';

        const [rows] = await db.query(query, params);

        const historial = rows.map(r => ({
            movimiento_id: r.movimiento_id,
            material_id: r.material_id,
            material: r.material,
            unidad: r.unidad,
            tipo: r.tipo,
            cantidad: r.cantidad,
            costo_unitario: r.costo_unitario,
            costo_total: r.costo_total,
            detalle_id: r.detalle_id,
            registrado_por: `${decrypt(r.nombres_cifrado)} ${decrypt(r.apellidos_cifrado)}`,
            fecha: r.fecha,
            observacion: r.observacion
        }));

        res.json(historial);

    } catch (error) {
        console.error('Error al consultar Kardex:', error);
        res.status(500).json({ error: 'Error interno al consultar el Kardex de materiales.' });
    }
};