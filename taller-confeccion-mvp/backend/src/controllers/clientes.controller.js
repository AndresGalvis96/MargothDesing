import * as service from '../services/clientes.service.js';
import { clienteSchema } from '../validators/cliente.validator.js';
import { asyncHandler } from '../middlewares/async-handler.js';

export const listar = asyncHandler(async (_req, res) => {
  res.json(await service.listarClientes());
});

export const obtener = asyncHandler(async (req, res) => {
  const cliente = await service.obtenerCliente(Number(req.params.id));
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }
  res.json(cliente);
});

export const crear = asyncHandler(async (req, res) => {
  const data = clienteSchema.parse(req.body);
  const cliente = await service.crearCliente(data);
  res.status(201).json(cliente);
});

export const eliminar = asyncHandler(async (req, res) => {
  const eliminado = await service.desactivarCliente(Number(req.params.id));
  if (!eliminado) {
    return res.status(404).json({ error: 'Cliente no encontrado.' });
  }
  res.status(204).send();
});
