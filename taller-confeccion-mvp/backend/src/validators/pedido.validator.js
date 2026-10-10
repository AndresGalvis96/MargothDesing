import { z } from 'zod';

export const pedidoSchema = z.object({
  cliente_id: z.coerce.number().int().positive(),
  descripcion: z.string().trim().min(3).max(250),
  fecha_entrega: z.string().date().optional().nullable().or(z.literal('')).transform((v) => v || null),
  prioridad: z.enum(['baja', 'media', 'alta']).default('media'),
  estado: z.enum(['pendiente', 'en_proceso', 'terminado', 'entregado', 'cancelado']).default('pendiente'),
  valor: z.coerce.number().min(0).max(9999999999).default(0),
  notas: z.string().trim().max(2000).optional().nullable().transform((v) => v || null)
});
