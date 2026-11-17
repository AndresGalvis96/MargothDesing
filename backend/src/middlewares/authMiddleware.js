const jwt = require('jsonwebtoken');
const db = require('../config/db');

exports.verificarToken = async (req, res, next) => {
    console.log("🚨 ENTRÓ AL MIDDLEWARE 🚨");
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Soporta tanto decoded.id como decoded.usuario_id
        const userId = decoded.id || decoded.usuario_id;

        const [rows] = await db.query(
            'SELECT usuario_id, rol, taller_id, estado FROM usuario WHERE usuario_id = ?',
            [userId]
        );

        console.log('🔍 Verificando token -> ID:', userId, '| Estado en BD:', rows[0]?.estado, '| Rol:', rows[0]?.rol);

        if (rows.length === 0 || rows[0].estado !== 'activo') {
            return res.status(403).json({ error: 'Acceso revocado. Usuario inactivo o inexistente.' });
        }

        req.usuario = {
            id: rows[0].usuario_id,
            rol: rows[0].rol,
            taller_id: rows[0].taller_id
        };

        next();
    } catch (error) {
        console.error('Error en verificarToken:', error.message);
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};