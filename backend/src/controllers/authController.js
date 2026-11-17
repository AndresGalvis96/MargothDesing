const db = require('../config/db'); 
const bcrypt = require('bcryptjs'); 
const { encrypt, decrypt, hashField } = require('../utils/crypto');
const jwt = require('jsonwebtoken');


// Controlador para registro (Ahora con la lógica real conectada a MySQL)
exports.registro = async (req, res) => {
    try {
        const { nombres, apellidos, cedula, correo, fecha_nacimiento, contrasena } = req.body;

        // 1. Validaciones básicas
        if (!nombres || !apellidos || !cedula || !correo || !contrasena || !fecha_nacimiento) {
            return res.status(400).json({ error: 'Todos los campos obligatorios deben ser proporcionados.' });
        }

        // 2. Hashes para búsquedas exactas (únicas) y contraseñas seguras
        const cedula_hash = hashField(cedula);
        const correo_hash = hashField(correo);
        const contrasena_hash = await bcrypt.hash(contrasena, 10);

        // 3. Encriptación reversible de datos sensibles
        const nombres_cifrado = encrypt(nombres);
        const apellidos_cifrado = encrypt(apellidos);
        const cedula_cifrada = encrypt(cedula);
        const correo_cifrado = encrypt(correo);
        const fecha_nacimiento_cifrada = encrypt(fecha_nacimiento);

        // Por defecto, todo registro público es de tipo 'cliente'
        const rol = 'cliente';

        // 4. Inserción en la base de datos
        const query = `
            INSERT INTO usuario 
            (nombres_cifrado, apellidos_cifrado, cedula_cifrada, cedula_hash, correo_cifrado, correo_hash, fecha_nacimiento_cifrada, contrasena_hash, rol) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await db.query(query, [
            nombres_cifrado, apellidos_cifrado, cedula_cifrada, cedula_hash, 
            correo_cifrado, correo_hash, fecha_nacimiento_cifrada, contrasena_hash, rol
        ]);

        res.status(201).json({ 
            mensaje: 'Usuario registrado exitosamente', 
            usuario_id: result.insertId 
        });

    } catch (error) {
        console.error('Error en el registro:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El correo o la cédula ya están registrados.' });
        }
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

exports.login = async (req, res) => {
    try {
        const { correo, contrasena } = req.body;

        if (!correo || !contrasena) {
            return res.status(400).json({ error: 'Correo y contraseña son obligatorios' });
        }

        const correo_hash = hashField(correo);

        // 👇 CAMBIO 1: Agregamos taller_id en el SELECT
        const query = 'SELECT usuario_id, contrasena_hash, rol, taller_id, estado FROM usuario WHERE correo_hash = ?';
        const [usuarios] = await db.query(query, [correo_hash]);

        if (usuarios.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = usuarios[0];

        if (usuario.estado !== 'activo') {
            return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
        }

        const validPassword = await bcrypt.compare(contrasena, usuario.contrasena_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // 👇 CAMBIO 2: Agregamos taller_id al payload (el interior) del token
        const payload = {
            id: usuario.usuario_id,
            rol: usuario.rol,
            taller_id: usuario.taller_id 
        };

        // Creamos el token (sin expiración como mencionaste)
        const token = jwt.sign(payload, process.env.JWT_SECRET);

        res.json({
            mensaje: 'Login exitoso',
            token,
            rol: usuario.rol,
            taller_id: usuario.taller_id // También lo devolvemos en la respuesta para que el frontend lo sepa
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
};
// Controlador de perfil (Ampliado y conectado a MySQL)
exports.perfil = async (req, res) => {
    try {
        // 1. El ID viene del token que ya verificó el middleware
        // (Nota: En el login lo guardamos como req.usuario.id)
        const usuarioId = req.usuario.id; 

        // 2. Buscar al usuario en la base de datos
        const query = 'SELECT * FROM usuario WHERE usuario_id = ?';
        const [rows] = await db.query(query, [usuarioId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const usuario = rows[0];

        // 3. Desencriptar toda la información personal
        const nombres = decrypt(usuario.nombres_cifrado);
        const apellidos = decrypt(usuario.apellidos_cifrado);
        const cedula = decrypt(usuario.cedula_cifrada);
        const correo = decrypt(usuario.correo_cifrado);
        const fecha_nacimiento = decrypt(usuario.fecha_nacimiento_cifrada);

        // 4. Enviar la respuesta omitiendo contraseñas y hashes (por seguridad)
        res.json({
            mensaje: 'Perfil cargado exitosamente',
            usuario: {
                id: usuario.usuario_id,
                nombres: nombres,
                apellidos: apellidos,
                cedula: cedula,
                correo: correo,
                fecha_nacimiento: fecha_nacimiento,
                rol: usuario.rol,
                estado: usuario.estado,
                taller_id: usuario.taller_id // Será null para los clientes, pero útil para operarios
            }
        });

    } catch (error) {
        console.error('Error al cargar el perfil:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};
// Cambiar la contraseña propia del usuario autenticado
exports.cambiarMiContrasena = async (req, res) => {
    try {
        const userId = req.usuario.id;
        const { contrasena_actual, nueva_contrasena } = req.body;

        if (!contrasena_actual || !nueva_contrasena) {
            return res.status(400).json({ error: 'Debes ingresar la contraseña actual y la nueva.' });
        }

        if (nueva_contrasena.length < 8) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
        }

        if (contrasena_actual === nueva_contrasena) {
            return res.status(400).json({ error: 'La nueva contraseña no puede ser igual a la actual.' });
        }

        // 1. Obtener el hash actual del usuario desde la BD
        const [rows] = await db.query(
            'SELECT contrasena_hash FROM usuario WHERE usuario_id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        // 2. Validar que la contraseña actual coincida
        const esValida = await bcrypt.compare(contrasena_actual, rows[0].contrasena_hash);
        if (!esValida) {
            return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
        }

        // 3. Hashear y guardar la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const nuevo_hash = await bcrypt.hash(nueva_contrasena, salt);

        await db.query(
            'UPDATE usuario SET contrasena_hash = ? WHERE usuario_id = ?',
            [nuevo_hash, userId]
        );

        res.json({ mensaje: 'Tu contraseña ha sido actualizada exitosamente.' });

    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error interno al actualizar la contraseña.' });
    }
};