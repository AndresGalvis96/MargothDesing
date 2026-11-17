const db = require('../config/db');

// Obtener todos los talleres
exports.obtenerTalleres = async (req, res) => {
    try {
        // Le quitamos fecha_creacion para evitar el error
        const query = 'SELECT taller_id, nombre, slug, direccion, telefono, estado FROM taller';
        const [talleres] = await db.query(query);
        res.json(talleres);
    } catch (error) {
        console.error('Error al obtener talleres:', error);
        res.status(500).json({ error: 'Error al obtener los talleres' });
    }
};

// Crear un nuevo taller
exports.crearTaller = async (req, res) => {
    try {
        const { nombre, slug, direccion, telefono } = req.body;
        
        // Validación básica
        if (!nombre || !slug || !direccion) {
            return res.status(400).json({ error: 'Nombre, slug y dirección son obligatorios' });
        }

        const query = 'INSERT INTO taller (nombre, slug, direccion, telefono, estado) VALUES (?, ?, ?, ?, "activo")';
        const [resultado] = await db.query(query, [nombre, slug, direccion, telefono || null]);
        
        res.status(201).json({ 
            mensaje: 'Taller creado exitosamente',
            taller_id: resultado.insertId 
        });
    } catch (error) {
        // Error de duplicidad (slug o nombre único)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El nombre o el slug del taller ya existen' });
        }
        console.error('Error al crear taller:', error);
        res.status(500).json({ error: 'Error al crear el taller' });
    }
};

// Actualizar estado de un taller (Soft Delete / Activación)
exports.actualizarEstadoTaller = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body; // 'activo' o 'inactivo'

        if (estado !== 'activo' && estado !== 'inactivo') {
            return res.status(400).json({ error: 'El estado debe ser activo o inactivo' });
        }

        const query = 'UPDATE taller SET estado = ? WHERE taller_id = ?';
        const [resultado] = await db.query(query, [estado, id]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Taller no encontrado' });
        }

        res.json({ mensaje: `Estado del taller actualizado a ${estado}` });
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        res.status(500).json({ error: 'Error al actualizar el taller' });
    }
};