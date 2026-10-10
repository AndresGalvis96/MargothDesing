import { query } from '../config/database.js';

export async function listarPedidos() {
  return query(
    `SELECT p.id, p.cliente_id, c.nombre AS cliente_nombre, p.descripcion,
            p.fecha_entrega, p.prioridad, p.estado, p.valor, p.notas, p.creado_en
     FROM pedidos p
     INNER JOIN clientes c ON c.id = p.cliente_id
     ORDER BY
       CASE p.prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
       p.fecha_entrega IS NULL, p.fecha_entrega ASC, p.creado_en DESC`
  );
}

export async function crearPedido(data) {
  const result = await query(
    `INSERT INTO pedidos
      (cliente_id, descripcion, fecha_entrega, prioridad, estado, valor, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.cliente_id, data.descripcion, data.fecha_entrega, data.prioridad,
      data.estado, data.valor, data.notas
    ]
  );
  const rows = await query(
    `SELECT p.id, p.cliente_id, c.nombre AS cliente_nombre, p.descripcion,
            p.fecha_entrega, p.prioridad, p.estado, p.valor, p.notas, p.creado_en
     FROM pedidos p INNER JOIN clientes c ON c.id = p.cliente_id
     WHERE p.id = ?`,
    [result.insertId]
  );
  return rows[0];
}
