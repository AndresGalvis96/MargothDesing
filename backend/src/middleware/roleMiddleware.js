const autorizarRoles = (...rolesPermitidos) => {
    return (req, res, next) => {
        // req.usuario es creado previamente por verificarToken
        if (!req.usuario || !req.usuario.rol) {
            return res.status(401).json({ error: 'No se pudo identificar el rol del usuario.' });
        }

        // Verificamos si el rol del usuario actual está dentro del arreglo de roles permitidos
        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({ 
                error: `Acceso denegado. Se requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}.` 
            });
        }

        // Si tiene el rol adecuado, lo dejamos pasar
        next();
    };
};

module.exports = { autorizarRoles };