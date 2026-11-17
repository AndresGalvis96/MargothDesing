const crypto = require('crypto');

// Obtenemos la clave del .env y la convertimos en un Buffer
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16; // El vector de inicialización para AES es de 16 bytes

// 1. Encriptación reversible (Para nombres, apellidos, correo)
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Retornamos el IV y el texto encriptado unidos por dos puntos
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// 2. Desencriptación (Para leer los datos en el backend)
// 2. Desencriptación (Para leer los datos en el backend)
function decrypt(text) {
    if (!text) return null;
    
    // Si MySQL devuelve un Buffer en lugar de un String, lo convertimos a texto
    if (Buffer.isBuffer(text)) {
        text = text.toString('utf8');
    }
    
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// 3. Hash determinista (Para búsquedas exactas como "cedula_hash" o "correo_hash")
function hashField(text) {
    if (!text) return null;
    return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { encrypt, decrypt, hashField };