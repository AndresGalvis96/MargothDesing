const multer = require('multer');
const path = require('path');
const fs = require('fs');

const TIPOS_MIME_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

const crearAlmacenamiento = (subcarpeta) => {
    const directorioDestino = path.join(__dirname, '..', '..', 'uploads', subcarpeta);

    // Crear carpeta si no existe
    if (!fs.existsSync(directorioDestino)) {
        fs.mkdirSync(directorioDestino, { recursive: true });
    }

    return multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, directorioDestino);
        },
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const sufijoUnico = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `${subcarpeta}-${sufijoUnico}${ext}`);
        }
    });
};

const filtroImagen = (req, file, cb) => {
    if (TIPOS_MIME_PERMITIDOS.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato no permitido. Solo se aceptan imágenes JPEG, PNG o WEBP.'), false);
    }
};

const uploadPrenda = multer({
    storage: crearAlmacenamiento('prendas'),
    fileFilter: filtroImagen,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB máximo
});

const uploadPedido = multer({
    storage: crearAlmacenamiento('pedidos'),
    fileFilter: filtroImagen,
    limits: { fileSize: 5 * 1024 * 1024 } // 5 MB máximo
});

// Wrapper para capturar errores de Multer (peso excedido o formato inválido) como JSON limpio
const manejarSubida = (multerMiddleware) => (req, res, next) => {
    multerMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'La imagen supera el tamaño máximo permitido de 5 MB.' });
            }
            return res.status(400).json({ error: `Error al subir archivo: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
};

module.exports = {
    subirFotoPrenda: manejarSubida(uploadPrenda.single('imagen')),
    subirFotoPedido: manejarSubida(uploadPedido.single('imagen'))
};