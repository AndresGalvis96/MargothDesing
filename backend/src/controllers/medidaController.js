const db = require('../config/db');
const { decrypt } = require('../utils/crypto');

const UNIDADES_VALIDAS = ['cm', 'pulgadas', 'in', 'mm'];

// Normaliza el nombre de la medida (ej. "Contorno de Pecho" -> "contorno_pecho")
const normalizarTipoMedida = (texto) => {
    return String(texto)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_');
};

// =====================================================================
// 1. REGISTRAR MEDIDAS CORPORALES (En lote o individual)
// =====================================================================
exports.registrarMedidas = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { rol, id: usuarioAuthId } = req.usuario;
        const { cliente_id: clienteBody, medidas } = req.body;

        // Si es cliente, registra sus propias medidas y registrado_por queda en NULL
        const usuario_id = rol === 'cliente' ? usuarioAuthId : clienteBody;
        const registrado_por = rol === 'cliente' ? null : usuarioAuthId;

        if (!usuario_id) {
            return res.status(400).json({
                error: 'Debes indicar el cliente_id al registrar medidas desde el taller.'
            });
        }

        if (!Array.isArray(medidas) || medidas.length === 0) {
            return res.status(400).json({
                error: 'Debes enviar un arreglo medidas con al menos un elemento: [{ tipo_medida, valor, unidad }].'
            });
        }

        await connection.beginTransaction();

        // Validar que el usuario exista, tenga rol 'cliente' y esté activo
        const [clienteRows] = await connection.query(
            "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND rol = 'cliente' AND estado = 'activo'",
            [usuario_id]
        );

        if (clienteRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'El cliente especificado no existe o está inactivo.' });
        }

        const insertadas = [];

        for (const item of medidas) {
            const { tipo_medida, valor, unidad = 'cm' } = item;
            const valorNum = Number(valor);

            if (!tipo_medida || !String(tipo_medida).trim()) {
                await connection.rollback();
                return res.status(400).json({ error: 'Cada medida debe incluir tipo_medida.' });
            }

            if (isNaN(valorNum) || valorNum <= 0) {
                await connection.rollback();
                return res.status(400).json({
                    error: `El valor para '${tipo_medida}' debe ser mayor a 0 (chk_medidas_valor_positivo).`
                });
            }

            const unidadLimpia = String(unidad).trim().toLowerCase();
            if (!UNIDADES_VALIDAS.includes(unidadLimpia)) {
                await connection.rollback();
                return res.status(400).json({
                    error: `Unidad inválida '${unidad}'. Valores permitidos: ${UNIDADES_VALIDAS.join(', ')}`
                });
            }

            const tipoNormalizado = normalizarTipoMedida(tipo_medida);

            const [result] = await connection.query(
                `INSERT INTO medidas_corporales (usuario_id, tipo_medida, valor, unidad, registrado_por)
                 VALUES (?, ?, ?, ?, ?)`,
                [usuario_id, tipoNormalizado, valorNum, unidadLimpia, registrado_por]
            );

            insertadas.push({
                medida_id: result.insertId,
                tipo_medida: tipoNormalizado,
                valor: valorNum,
                unidad: unidadLimpia
            });
        }

        await connection.commit();

        res.status(201).json({
            mensaje: 'Medidas corporales registradas exitosamente.',
            cliente_id: Number(usuario_id),
            registrado_por: registrado_por === null ? 'El propio cliente' : registrado_por,
            medidas_registradas: insertadas
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al registrar medidas corporales:', error);
        res.status(500).json({ error: 'Error interno al registrar las medidas corporales.' });
    } finally {
        connection.release();
    }
};

// =====================================================================
// Función interna reutilizable para consultar vigentes + historial
// =====================================================================
const consultarMedidasCliente = async (cliente_id) => {
    // 1. Obtener datos básicos del cliente
    const [cliRows] = await db.query(
        "SELECT usuario_id, nombres_cifrado, apellidos_cifrado FROM usuario WHERE usuario_id = ? AND rol = 'cliente'",
        [cliente_id]
    );

    if (cliRows.length === 0) {
        return null;
    }

    // 2. Obtener medidas vigentes (la más reciente por cada tipo_medida usando medida_id más alto)
    const [vigentesRows] = await db.query(
        `SELECT m.medida_id, m.tipo_medida, m.valor, m.unidad, m.registrado_por, m.fecha_registro,
                u.nombres_cifrado AS reg_nombres, u.apellidos_cifrado AS reg_apellidos
         FROM medidas_corporales m
         INNER JOIN (
             SELECT tipo_medida, MAX(medida_id) AS ultima_id
             FROM medidas_corporales
             WHERE usuario_id = ?
             GROUP BY tipo_medida
         ) ult ON m.medida_id = ult.ultima_id
         LEFT JOIN usuario u ON u.usuario_id = m.registrado_por
         ORDER BY m.tipo_medida ASC`,
        [cliente_id]
    );

    // 3. Obtener historial completo ordenado cronológicamente
    const [historialRows] = await db.query(
        `SELECT m.medida_id, m.tipo_medida, m.valor, m.unidad, m.registrado_por, m.fecha_registro,
                u.nombres_cifrado AS reg_nombres, u.apellidos_cifrado AS reg_apellidos
         FROM medidas_corporales m
         LEFT JOIN usuario u ON u.usuario_id = m.registrado_por
         WHERE m.usuario_id = ?
         ORDER BY m.fecha_registro DESC, m.medida_id DESC`,
        [cliente_id]
    );

    const formatear = (row) => ({
        medida_id: row.medida_id,
        tipo_medida: row.tipo_medida,
        valor: Number(row.valor),
        unidad: row.unidad,
        tomada_por: row.registrado_por === null
            ? 'El propio cliente'
            : `${decrypt(row.reg_nombres)} ${decrypt(row.reg_apellidos)}`,
        fecha_registro: row.fecha_registro
    });

    return {
        cliente_id: Number(cliente_id),
        cliente_nombre: `${decrypt(cliRows[0].nombres_cifrado)} ${decrypt(cliRows[0].apellidos_cifrado)}`,
        medidas_vigentes: vigentesRows.map(formatear),
        historial_completo: historialRows.map(formatear)
    };
};

// =====================================================================
// 2. CONSULTAR MIS MEDIDAS (Endpoint para el cliente autenticado)
// =====================================================================
exports.obtenerMisMedidas = async (req, res) => {
    try {
        const cliente_id = req.usuario.id;
        const data = await consultarMedidasCliente(cliente_id);

        if (!data) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }

        res.json(data);
    } catch (error) {
        console.error('Error al consultar mis medidas:', error);
        res.status(500).json({ error: 'Error interno al consultar tus medidas corporales.' });
    }
};

// =====================================================================
// 3. CONSULTAR MEDIDAS DE UN CLIENTE (Endpoint para el taller)
// =====================================================================
exports.obtenerMedidasDeCliente = async (req, res) => {
    try {
        const { cliente_id } = req.params;
        const data = await consultarMedidasCliente(cliente_id);

        if (!data) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }

        res.json(data);
    } catch (error) {
        console.error('Error al consultar medidas del cliente:', error);
        res.status(500).json({ error: 'Error interno al consultar las medidas del cliente.' });
    }
};