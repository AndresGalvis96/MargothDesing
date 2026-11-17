const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { encrypt, decrypt, hashField } = require('../utils/crypto');

// Registrar un nuevo cliente
exports.registrarCliente = async (req, res) => {
    try {
        const { nombres, apellidos, cedula, correo, fecha_nacimiento, contrasena } = req.body;
        const adminId = req.usuario.id;

        // 1. Validar campos obligatorios según restricciones NOT NULL de la tabla usuario
        if (!nombres || !apellidos || !cedula || !correo || !fecha_nacimiento) {
            return res.status(400).json({ 
                error: 'Nombres, apellidos, cédula, correo y fecha de nacimiento son obligatorios.' 
            });
        }

        // 2. Encriptar y hashear datos sensibles
        const correo_hash = hashField(correo);
        const cedula_hash = hashField(cedula);

        const nombres_cifrado = encrypt(nombres);
        const apellidos_cifrado = encrypt(apellidos);
        const cedula_cifrada = encrypt(cedula);
        const correo_cifrado = encrypt(correo);
        const fecha_nacimiento_cifrada = encrypt(fecha_nacimiento);

        // 3. Si el admin crea el cliente en mostrador y no envía contraseña, usamos la cédula como clave inicial
        const clavePlana = contrasena && contrasena.length >= 8 ? contrasena : String(cedula);
        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(clavePlana, salt);

        // 4. Insertar respetando chk_usuario_taller_por_rol (taller_id = NULL, jefe_id = NULL)
        const query = `
            INSERT INTO usuario (
                nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada,
                correo_hash, correo_cifrado, fecha_nacimiento_cifrada, contrasena_hash,
                rol, taller_id, jefe_id, estado, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cliente', NULL, NULL, 'activo', ?)
        `;

        const [result] = await db.query(query, [
            nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada,
            correo_hash, correo_cifrado, fecha_nacimiento_cifrada, contrasena_hash,
            adminId
        ]);

        res.status(201).json({
            mensaje: 'Cliente registrado exitosamente',
            usuario_id: result.insertId,
            rol: 'cliente',
            clave_inicial_por_defecto: !contrasena ? 'Número de cédula del cliente' : 'Personalizada'
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe un usuario registrado con esa cédula o correo.' });
        }
        console.error('Error al registrar cliente:', error);
        res.status(500).json({ error: 'Error interno al registrar el cliente.' });
    }
};

// Obtener lista de clientes
exports.obtenerClientes = async (req, res) => {
    try {
        const query = `
            SELECT usuario_id, nombres_cifrado, apellidos_cifrado, cedula_cifrada, 
                   correo_cifrado, fecha_nacimiento_cifrada, estado, creado_en
            FROM usuario 
            WHERE rol = 'cliente'
            ORDER BY creado_en DESC
        `;
        const [clientes] = await db.query(query);

        const clientesDesencriptados = clientes.map(cli => ({
            usuario_id: cli.usuario_id,
            nombres: decrypt(cli.nombres_cifrado),
            apellidos: decrypt(cli.apellidos_cifrado),
            cedula: decrypt(cli.cedula_cifrada),
            correo: decrypt(cli.correo_cifrado),
            fecha_nacimiento: decrypt(cli.fecha_nacimiento_cifrada),
            estado: cli.estado,
            creado_en: cli.creado_en
        }));

        res.json(clientesDesencriptados);

    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({ error: 'Error al obtener la lista de clientes.' });
    }
};

// Buscar cliente exacto por cédula (aprovechando cedula_hash indexado)
exports.buscarClientePorCedula = async (req, res) => {
    try {
        const { cedula } = req.params;
        const cedula_hash = hashField(cedula);

        const query = `
            SELECT usuario_id, nombres_cifrado, apellidos_cifrado, cedula_cifrada, 
                   correo_cifrado, fecha_nacimiento_cifrada, estado
            FROM usuario 
            WHERE cedula_hash = ? AND rol = 'cliente'
        `;
        const [rows] = await db.query(query, [cedula_hash]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'No se encontró ningún cliente con esa cédula.' });
        }

        const cli = rows[0];
        res.json({
            usuario_id: cli.usuario_id,
            nombres: decrypt(cli.nombres_cifrado),
            apellidos: decrypt(cli.apellidos_cifrado),
            cedula: decrypt(cli.cedula_cifrada),
            correo: decrypt(cli.correo_cifrado),
            fecha_nacimiento: decrypt(cli.fecha_nacimiento_cifrada),
            estado: cli.estado
        });

    } catch (error) {
        console.error('Error al buscar cliente por cédula:', error);
        res.status(500).json({ error: 'Error al buscar el cliente.' });
    }
};

// Actualizar datos de un cliente
exports.actualizarCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombres, apellidos, cedula, correo, fecha_nacimiento } = req.body;
        const adminId = req.usuario.id;

        if (!nombres || !apellidos || !cedula || !correo || !fecha_nacimiento) {
            return res.status(400).json({ 
                error: 'Nombres, apellidos, cédula, correo y fecha de nacimiento son obligatorios.' 
            });
        }

        const correo_hash = hashField(correo);
        const cedula_hash = hashField(cedula);

        const query = `
            UPDATE usuario 
            SET nombres_cifrado = ?,
                apellidos_cifrado = ?,
                cedula_hash = ?,
                cedula_cifrada = ?,
                correo_hash = ?,
                correo_cifrado = ?,
                fecha_nacimiento_cifrada = ?,
                actualizado_por = ?
            WHERE usuario_id = ? AND rol = 'cliente'
        `;

        const [result] = await db.query(query, [
            encrypt(nombres),
            encrypt(apellidos),
            cedula_hash,
            encrypt(cedula),
            correo_hash,
            encrypt(correo),
            encrypt(fecha_nacimiento),
            adminId,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }

        res.json({
            mensaje: 'Datos del cliente actualizados correctamente',
            usuario_id: Number(id)
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'La cédula o el correo ya pertenecen a otro usuario.' });
        }
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ error: 'Error interno al actualizar el cliente.' });
    }
};

// Cambiar estado del cliente (Soft Delete con trazabilidad de auditoría)
exports.cambiarEstadoCliente = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const adminId = req.usuario.id;

        if (!['activo', 'inactivo'].includes(estado)) {
            return res.status(400).json({ error: "El estado debe ser 'activo' o 'inactivo'." });
        }

        // Si se inactiva, registramos eliminado_por y eliminado_en; si se reactiva, los limpiamos
        const query = estado === 'inactivo'
            ? `UPDATE usuario SET estado = 'inactivo', eliminado_por = ?, eliminado_en = NOW() WHERE usuario_id = ? AND rol = 'cliente'`
            : `UPDATE usuario SET estado = 'activo', eliminado_por = NULL, eliminado_en = NULL, actualizado_por = ? WHERE usuario_id = ? AND rol = 'cliente'`;

        const [result] = await db.query(query, [adminId, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }

        res.json({
            mensaje: `Estado del cliente actualizado a ${estado}`,
            usuario_id: Number(id),
            estado
        });

    } catch (error) {
        console.error('Error al cambiar estado del cliente:', error);
        res.status(500).json({ error: 'Error interno al actualizar el estado del cliente.' });
    }
};// Autoregistro público de un cliente (sin token)
exports.autoregistroCliente = async (req, res) => {
    try {
        const { nombres, apellidos, cedula, correo, fecha_nacimiento, contrasena } = req.body;

        if (!nombres || !apellidos || !cedula || !correo || !fecha_nacimiento || !contrasena) {
            return res.status(400).json({ 
                error: 'Todos los campos son obligatorios: nombres, apellidos, cédula, correo, fecha de nacimiento y contraseña.' 
            });
        }

        if (contrasena.length < 8) {
            return res.status(400).json({ 
                error: 'La contraseña debe tener al menos 8 caracteres.' 
            });
        }

        const correo_hash = hashField(correo);
        const cedula_hash = hashField(cedula);

        const nombres_cifrado = encrypt(nombres);
        const apellidos_cifrado = encrypt(apellidos);
        const cedula_cifrada = encrypt(cedula);
        const correo_cifrado = encrypt(correo);
        const fecha_nacimiento_cifrada = encrypt(fecha_nacimiento);

        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(contrasena, salt);

        const query = `
            INSERT INTO usuario (
                nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada,
                correo_hash, correo_cifrado, fecha_nacimiento_cifrada, contrasena_hash,
                rol, taller_id, jefe_id, estado, creado_por
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cliente', NULL, NULL, 'activo', NULL)
        `;

        const [result] = await db.query(query, [
            nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada,
            correo_hash, correo_cifrado, fecha_nacimiento_cifrada, contrasena_hash
        ]);

        res.status(201).json({
            mensaje: 'Cuenta de cliente creada exitosamente. Ya puedes iniciar sesión.',
            usuario_id: result.insertId,
            rol: 'cliente'
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Ya existe una cuenta registrada con esa cédula o correo electrónico.' });
        }
        console.error('Error en autoregistro de cliente:', error);
        res.status(500).json({ error: 'Error interno al crear la cuenta.' });
    }
};

// Consultar el perfil propio del cliente autenticado
exports.obtenerMiPerfil = async (req, res) => {
    try {
        const clienteId = req.usuario.id;

        const query = `
            SELECT usuario_id, nombres_cifrado, apellidos_cifrado, cedula_cifrada, 
                   correo_cifrado, fecha_nacimiento_cifrada, correo_verificado, estado, creado_en
            FROM usuario 
            WHERE usuario_id = ? AND rol = 'cliente'
        `;
        const [rows] = await db.query(query, [clienteId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Perfil de cliente no encontrado.' });
        }

        const cli = rows[0];
        res.json({
            usuario_id: cli.usuario_id,
            nombres: decrypt(cli.nombres_cifrado),
            apellidos: decrypt(cli.apellidos_cifrado),
            cedula: decrypt(cli.cedula_cifrada),
            correo: decrypt(cli.correo_cifrado),
            fecha_nacimiento: decrypt(cli.fecha_nacimiento_cifrada),
            correo_verificado: Boolean(cli.correo_verificado),
            estado: cli.estado,
            creado_en: cli.creado_en
        });

    } catch (error) {
        console.error('Error al obtener perfil del cliente:', error);
        res.status(500).json({ error: 'Error interno al consultar tu perfil.' });
    }
};

// Actualizar los datos propios del cliente autenticado
exports.actualizarMiPerfil = async (req, res) => {
    try {
        const clienteId = req.usuario.id;
        const { nombres, apellidos, cedula, correo, fecha_nacimiento } = req.body;

        if (!nombres || !apellidos || !cedula || !correo || !fecha_nacimiento) {
            return res.status(400).json({ 
                error: 'Nombres, apellidos, cédula, correo y fecha de nacimiento son obligatorios.' 
            });
        }

        const correo_hash = hashField(correo);
        const cedula_hash = hashField(cedula);

        const query = `
            UPDATE usuario 
            SET nombres_cifrado = ?,
                apellidos_cifrado = ?,
                cedula_hash = ?,
                cedula_cifrada = ?,
                correo_hash = ?,
                correo_cifrado = ?,
                fecha_nacimiento_cifrada = ?,
                actualizado_por = ?
            WHERE usuario_id = ? AND rol = 'cliente'
        `;

        const [result] = await db.query(query, [
            encrypt(nombres),
            encrypt(apellidos),
            cedula_hash,
            encrypt(cedula),
            correo_hash,
            encrypt(correo),
            encrypt(fecha_nacimiento),
            clienteId,
            clienteId
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'No se pudo actualizar el perfil.' });
        }

        res.json({
            mensaje: 'Tu perfil ha sido actualizado exitosamente.',
            usuario_id: clienteId
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'La cédula o el correo ya están registrados por otro usuario.' });
        }
        console.error('Error al actualizar perfil del cliente:', error);
        res.status(500).json({ error: 'Error interno al actualizar tu perfil.' });
    }
};