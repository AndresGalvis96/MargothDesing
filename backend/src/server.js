const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const tallerRoutes = require('./routes/tallerRoutes'); 
const empleadoRoutes = require('./routes/empleadoRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const prendaRoutes = require('./routes/prendaRoutes');
const materialRoutes = require('./routes/materialRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const pagoRoutes = require('./routes/pagoRoutes');
const medidaRoutes = require('./routes/medidaRoutes');
const reporteRoutes = require('./routes/reporteRoutes');
const path = require('path');
const imagenRoutes = require('./routes/imagenRoutes');
const expedienteRoutes = require('./routes/expedienteRoutes');
const produccionRoutes = require('./routes/produccionRoutes');
const solicitudRoutes = require('./routes/solicitudesRoutes'); 

const app = express();

// Middlewares
const origenesPermitidos = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://192.168.1.8:5173',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Permitir peticiones sin origin (Postman/curl) o desde los orígenes de desarrollo permitidos
        if (!origin || origenesPermitidos.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true
}));
app.use(express.json()); // Parse JSON bodies

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/talleres', tallerRoutes);
app.use('/api/empleados', empleadoRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/prendas', prendaRoutes);
app.use('/api/materiales', materialRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/pagos', pagoRoutes);
app.use('/api/medidas', medidaRoutes);
app.use('/api/reportes', reporteRoutes);
app.use('/api/imagenes', imagenRoutes);
app.use('/api/expedientes', expedienteRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/solicitudes', solicitudRoutes);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Ruta de prueba
app.get('/', (req, res) => {
    res.json({ message: 'API del Sistema de Confección funcionando correctamente' });
});

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Algo salió mal en el servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});