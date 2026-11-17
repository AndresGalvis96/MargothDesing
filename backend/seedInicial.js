require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // Si usas 'bcrypt', cámbialo a require('bcrypt')
const db = require('./src/config/db');
const { encrypt } = require('./src/utils/crypto');

const sha256 = (val) =>
    crypto.createHash('sha256').update(String(val).trim().toLowerCase()).digest('hex');

async function limpiarBaseDeDatos() {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    const [tablas] = await db.query(
        `SELECT table_name AS nombre
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`
    );
    for (const t of tablas) {
        await db.query(`TRUNCATE TABLE \`${t.nombre}\``);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`🧹 Base de datos vaciada (${tablas.length} tablas reiniciadas a ID 1).`);
}

async function crearUsuariosIniciales() {
    try {
        // 1. Limpiar por completo antes de crear
        await limpiarBaseDeDatos();

        // 2. Crear Taller principal
        const [resTaller] = await db.query(
            `INSERT INTO taller (nombre, slug, direccion, telefono, estado)
             VALUES (?, ?, ?, ?, 'activo')`,
            ['Taller Principal', 'taller-principal', 'Calle 10 # 20-30', '3001234567']
        );
        const tallerId = resTaller.insertId;
        console.log(`✅ Taller creado con ID: ${tallerId}`);

        // 3. Crear Super Admin y Admin Local con todos los campos obligatorios cifrados
        const passwordHash = await bcrypt.hash('Admin123*', 10);

        const insertarUsuario = async ({ taller_id, nombres, apellidos, cedula, correo, fechaNacimiento, telefono, rol }) => {
            const correoLimpio = correo.trim().toLowerCase();
            await db.query(
                `INSERT INTO usuario 
                 (taller_id, nombres_cifrado, apellidos_cifrado, cedula_cifrada, cedula_hash, correo_cifrado, correo_hash, fecha_nacimiento_cifrada, contrasena_hash, correo_verificado, telefono, rol, estado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'activo')`,
                [
                    taller_id,
                    encrypt(nombres),
                    encrypt(apellidos),
                    encrypt(cedula),
                    sha256(cedula),
                    encrypt(correoLimpio),
                    sha256(correoLimpio),
                    encrypt(fechaNacimiento),
                    passwordHash,
                    telefono || null,
                    rol
                ]
            );
        };

        await insertarUsuario({
            taller_id: null,
            nombres: 'Admin',
            apellidos: 'Global',
            cedula: '1000000001',
            correo: 'global@taller.com',
            fechaNacimiento: '1990-01-01',
            telefono: '3000000001',
            rol: 'super_admin'
        });
        console.log('✅ Super Admin creado -> Correo: global@taller.com | Clave: Admin123*');

        await insertarUsuario({
            taller_id: tallerId,
            nombres: 'Admin',
            apellidos: 'Local',
            cedula: '1000000002',
            correo: 'local@taller.com',
            fechaNacimiento: '1992-05-15',
            telefono: '3001234567',
            rol: 'admin_local'
        });
        console.log('✅ Admin Local creado -> Correo: local@taller.com  | Clave: Admin123*');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error en seedInicial:', error.message);
        process.exit(1);
    }
}

crearUsuariosIniciales();