import { query } from '../config/database.js';

export async function listarClientes() {
  return query(
    `SELECT id, nombre, telefono, correo, direccion, notas, activo, creado_en
     FROM clientes WHERE activo = TRUE ORDER BY nombre ASC`
  );
}

export async function obtenerCliente(id) {
  const rows = await query(
    `SELECT id, nombre, telefono, correo, direccion, notas, activo, creado_en
     FROM clientes WHERE id = ? AND activo = TRUE`,
    [id]
  );
  return rows[0] || null;
}

export async function crearCliente(data) {
  const result = await query(
    `INSERT INTO clientes (nombre, telefono, correo, direccion, notas)
     VALUES (?, ?, ?, ?, ?)`,
    [data.nombre, data.telefono, data.correo, data.direccion, data.notas]
  );
  return obtenerCliente(result.insertId);
}

export async function desactivarCliente(id) {
  const result = await query(
    'UPDATE clientes SET activo = FALSE WHERE id = ? AND activo = TRUE',
    [id]
  );
  return result.affectedRows > 0;
}
