import * as service from '../services/pedidos.service.js';
import { pedidoSchema } from '../validators/pedido.validator.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const listar = asyncHandler(async (_req, res) => {
  res.json(await service.listarPedidos());
});

export const crear = asyncHandler(async (req, res) => {
  const data = pedidoSchema.parse(req.body);
  const pedido = await service.crearPedido(data);
  res.status(201).json(pedido);
});
