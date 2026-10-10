import { z } from 'zod';

export const clienteSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  telefono: z.string().trim().max(30).optional().nullable().transform((v) => v || null),
  correo: z.string().trim().email('El correo no tiene un formato válido').max(160).optional().nullable()
    .or(z.literal('')).transform((v) => v || null),
  direccion: z.string().trim().max(200).optional().nullable().transform((v) => v || null),
  notas: z.string().trim().max(2000).optional().nullable().transform((v) => v || null)
});
