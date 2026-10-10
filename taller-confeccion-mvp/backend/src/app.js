import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import clienteRoutes from './routes/clientes.routes.js';
import pedidoRoutes from './routes/pedidos.routes.js';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware.js';

const app = express();

// Seguridad básica y límites de entrada para la API.
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', servicio: 'taller-confeccion-api' });
});

app.use('/api/clientes', clienteRoutes);
app.use('/api/pedidos', pedidoRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
