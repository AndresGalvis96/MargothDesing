const bcrypt = require('bcryptjs');
const db = require('../config/db');
// Asegúrate de que esta ruta coincida con donde tienes tu archivo de encriptación
const { encrypt, decrypt, hashField } = require('../utils/crypto');

exports.registrarEmpleado = async (req, res) => {
    try {
        const { nombres, apellidos, cedula, correo, contrasena, fecha_nacimiento, rol, taller_id } = req.body;

        // 1. Validaciones básicas
        if (!nombres || !apellidos || !cedula || !correo || !contrasena || !rol) {
            return res.status(400).json({ error: 'Todos los campos básicos son obligatorios' });
        }

        // 2. Validar que no le den rol de cliente por esta ruta
        const rolesValidos = ['operario', 'supervisor', 'admin_local'];
        if (!rolesValidos.includes(rol)) {
            return res.status(400).json({ error: 'Rol inválido para un empleado' });
        }

        // 3. Lógica de seguridad para el Taller
        // Si el que crea al empleado es un admin_local, forzamos a que el empleado 
        // quede registrado en su mismo taller por seguridad.
        const tallerAsignado = req.usuario.rol === 'admin_local' ? req.usuario.taller_id : taller_id;

        if (!tallerAsignado) {
            return res.status(400).json({ error: 'No se pudo determinar el taller para este empleado' });
        }

        // 4. Encriptación de datos sensibles (AES-256 y Hash Determinista)
        const correo_hash = hashField(correo);
        const cedula_hash = hashField(cedula);

        const nombres_cifrado = encrypt(nombres);
        const apellidos_cifrado = encrypt(apellidos);
        const cedula_cifrada = encrypt(cedula);
        const correo_cifrado = encrypt(correo);
        const fecha_nacimiento_cifrada = fecha_nacimiento ? encrypt(fecha_nacimiento) : null;

        // 5. Hash de la contraseña (Bcrypt)
        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(contrasena, salt);

        // 6. Insertar en la Base de Datos
        const query = `
            INSERT INTO usuario 
            (nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada, 
             correo_hash, correo_cifrado, contrasena_hash, fecha_nacimiento_cifrada, rol, taller_id, estado) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')
        `;

        const [result] = await db.query(query, [
            nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada,
            correo_hash, correo_cifrado, contrasena_hash, fecha_nacimiento_cifrada,
            rol, tallerAsignado
        ]);

        res.status(201).json({
            mensaje: 'Empleado registrado exitosamente',
            usuario_id: result.insertId,
            taller_id: tallerAsignado,
            rol: rol
        });

    } catch (error) {
        // Capturar error si el correo o cédula ya existen
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El correo o la cédula ya están registrados en el sistema.' });
        }
        console.error('Error al registrar empleado:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};
const desencriptarSeguro = (texto) => {
    if (!texto) return null; // Si no hay dato, devuelve null
    try {
        return decrypt(texto);
    } catch (error) {
        // Si no se puede desencriptar (ej. no tiene el IV correcto), asumimos que es texto plano viejo
        return texto;
    }
};

exports.obtenerEmpleadosPorTaller = async (req, res) => {
    try {
        // Obtenemos el taller del token del administrador
        const taller_id = req.usuario.taller_id;

        if (!taller_id) {
            return res.status(400).json({ error: 'El administrador no tiene un taller asignado.' });
        }

        // Buscamos a todos los usuarios de ese taller (excluyendo clientes)
        const query = `
            SELECT usuario_id, nombres_cifrado, apellidos_cifrado, cedula_cifrada, correo_cifrado, rol, estado 
            FROM usuario 
            WHERE taller_id = ? AND rol != 'cliente'
        `;
        const [empleados] = await db.query(query, [taller_id]);

        // Desencriptamos los datos "al vuelo" (on the fly) antes de enviarlos
        const empleadosDesencriptados = empleados.map(emp => {
            return {
                usuario_id: emp.usuario_id,
                nombres: decrypt(emp.nombres_cifrado),
                apellidos: decrypt(emp.apellidos_cifrado),
                cedula: decrypt(emp.cedula_cifrada),
                correo: decrypt(emp.correo_cifrado),
                rol: emp.rol,
                estado: emp.estado
            };
        });

        res.json(empleadosDesencriptados);

    } catch (error) {
        console.error('Error al obtener empleados:', error);
        res.status(500).json({ error: 'Error al obtener la lista de empleados' });
    }
};
// Actualizar datos personales y rol de un empleado
exports.actualizarEmpleado = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombres, apellidos, cedula, correo, fecha_nacimiento, rol } = req.body;
        const taller_id = req.usuario.taller_id;

        if (!nombres || !apellidos || !cedula || !correo || !rol) {
            return res.status(400).json({ error: 'Nombres, apellidos, cédula, correo y rol son obligatorios' });
        }

        const rolesValidos = ['operario', 'supervisor', 'admin_local'];
        if (!rolesValidos.includes(rol)) {
            return res.status(400).json({ error: 'Rol inválido para un empleado' });
        }

        // 1. Verificar que el empleado exista y pertenezca al mismo taller del admin
        const [existe] = await db.query(
            "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND taller_id = ? AND rol != 'cliente'",
            [id, taller_id]
        );

        if (existe.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado en este taller' });
        }

        // 2. Encriptar y hashear nuevamente los datos actualizados
        const correo_hash = hashField(correo);
        const cedula_hash = hashField(cedula);

        const nombres_cifrado = encrypt(nombres);
        const apellidos_cifrado = encrypt(apellidos);
        const cedula_cifrada = encrypt(cedula);
        const correo_cifrado = encrypt(correo);
        const fecha_nacimiento_cifrada = fecha_nacimiento ? encrypt(fecha_nacimiento) : null;

        // 3. Ejecutar actualización
        const query = `
            UPDATE usuario 
            SET nombres_cifrado = ?, 
                apellidos_cifrado = ?, 
                cedula_hash = ?, 
                cedula_cifrada = ?, 
                correo_hash = ?, 
                correo_cifrado = ?, 
                fecha_nacimiento_cifrada = ?, 
                rol = ?
            WHERE usuario_id = ? AND taller_id = ?
        `;

        await db.query(query, [
            nombres_cifrado, apellidos_cifrado, cedula_hash, cedula_cifrada,
            correo_hash, correo_cifrado, fecha_nacimiento_cifrada, rol,
            id, taller_id
        ]);

        res.json({
            mensaje: 'Datos del empleado actualizados correctamente',
            usuario_id: Number(id)
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El correo o la cédula ya pertenecen a otro usuario.' });
        }
        console.error('Error al actualizar empleado:', error);
        res.status(500).json({ error: 'Error interno al actualizar el empleado' });
    }
};

// Cambiar estado del empleado (Soft Delete: activo / inactivo)
exports.cambiarEstadoEmpleado = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const taller_id = req.usuario.taller_id;

        if (!['activo', 'inactivo'].includes(estado)) {
            return res.status(400).json({ error: "El estado debe ser 'activo' o 'inactivo'" });
        }

        // Evitar que el administrador se bloquee a sí mismo
        if (Number(id) === req.usuario.id && estado === 'inactivo') {
            return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta de administrador' });
        }

        const query = `
            UPDATE usuario 
            SET estado = ? 
            WHERE usuario_id = ? AND taller_id = ? AND rol != 'cliente'
        `;

        const [result] = await db.query(query, [estado, id, taller_id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado en este taller' });
        }

        res.json({
            mensaje: `Estado del empleado actualizado a ${estado}`,
            usuario_id: Number(id),
            estado
        });

    } catch (error) {
        console.error('Error al cambiar estado del empleado:', error);
        res.status(500).json({ error: 'Error interno al actualizar el estado' });
    }
};
exports.obtenerEmpleadoPorId = async (req, res) => {
    try {
        const { id } = req.params;
        const taller_id = req.usuario.taller_id;

        const query = `
            SELECT usuario_id, nombres_cifrado, apellidos_cifrado, cedula_cifrada, correo_cifrado, fecha_nacimiento_cifrada, rol, estado 
            FROM usuario 
            WHERE usuario_id = ? AND taller_id = ? AND rol != 'cliente'
        `;
        const [rows] = await db.query(query, [id, taller_id]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado en este taller' });
        }

        const emp = rows[0];
        res.json({
            usuario_id: emp.usuario_id,
            nombres: decrypt(emp.nombres_cifrado),
            apellidos: decrypt(emp.apellidos_cifrado),
            cedula: decrypt(emp.cedula_cifrada),
            correo: decrypt(emp.correo_cifrado),
            fecha_nacimiento: emp.fecha_nacimiento_cifrada ? decrypt(emp.fecha_nacimiento_cifrada) : null,
            rol: emp.rol,
            estado: emp.estado
        });
    } catch (error) {
        console.error('Error al obtener empleado por ID:', error);
        res.status(500).json({ error: 'Error al obtener los datos del empleado' });
    }
};

// Restablecer contraseña de un empleado (Solo admin_local del mismo taller)
exports.restablecerContrasenaEmpleado = async (req, res) => {
    try {
        const { id } = req.params;
        const { nueva_contrasena } = req.body;
        const taller_id = req.usuario.taller_id;

        if (!nueva_contrasena || nueva_contrasena.length < 8) {
            return res.status(400).json({ 
                error: 'La nueva contraseña es obligatoria y debe tener al menos 8 caracteres.' 
            });
        }

        // 1. Verificar que el empleado exista y pertenezca al taller del admin
        const [existe] = await db.query(
            "SELECT usuario_id FROM usuario WHERE usuario_id = ? AND taller_id = ? AND rol != 'cliente'",
            [id, taller_id]
        );

        if (existe.length === 0) {
            return res.status(404).json({ error: 'Empleado no encontrado en este taller.' });
        }

        // 2. Hashear la nueva contraseña con Bcrypt
        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(nueva_contrasena, salt);

        // 3. Actualizar en la base de datos
        await db.query(
            'UPDATE usuario SET contrasena_hash = ? WHERE usuario_id = ? AND taller_id = ?',
            [contrasena_hash, id, taller_id]
        );

        res.json({
            mensaje: 'Contraseña del empleado restablecida correctamente.',
            usuario_id: Number(id)
        });

    } catch (error) {
        console.error('Error al restablecer contraseña:', error);
        res.status(500).json({ error: 'Error interno al restablecer la contraseña.' });
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