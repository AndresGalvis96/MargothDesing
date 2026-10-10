export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    error: 'Ruta no encontrada',
    ruta: req.originalUrl
  });
}

export function errorHandler(error, _req, res, _next) {
  console.error(error);

  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: 'Datos inválidos',
      detalles: error.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message
      }))
    });
  }

  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ error: 'El cliente indicado no existe.' });
  }

  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({
      error: 'No se puede eliminar el cliente porque tiene pedidos asociados.'
    });
  }

  return res.status(500).json({
    error: 'Error interno del servidor'
  });
}
