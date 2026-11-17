const jwt = require('jsonwebtoken');
const db = require('../config/db');

const verificarToken = async (req, res, next) => {
console.log('📥 [BACK] Ruta:', req.originalUrl, '| Header Authorization:', req.headers.authorization || 'NO LLEGÓ');    const authHeader = req.header('Authorization');
    if (!authHeader) {
        return res.status(401).json({ error: 'Acceso denegado. Se requiere un token.' });
    }

    try {
        // 2. Extraer el token (formato "Bearer eyJhbG...")
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

        // 3. Verificar si el token es válido usando nuestra clave secreta
        const verificado = jwt.verify(token, process.env.JWT_SECRET);
        const userId = verificado.id || verificado.usuario_id;

        // 4. Verificar en tiempo real en la BD que el usuario exista y siga activo
        const [rows] = await db.query(
            'SELECT usuario_id, rol, taller_id, estado FROM usuario WHERE usuario_id = ?',
            [userId]
        );

        if (rows.length === 0 || rows[0].estado !== 'activo') {
            return res.status(403).json({ error: 'Acceso revocado. Usuario inactivo o inexistente.' });
        }

        // 5. Guardar los datos frescos de la BD en la petición para que los controladores los usen
        req.usuario = {
            id: rows[0].usuario_id,
            rol: rows[0].rol,
            taller_id: rows[0].taller_id
        };

        // 6. Dar permiso para continuar
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token no válido o expirado.' });
    }
};

module.exports = { verificarToken };