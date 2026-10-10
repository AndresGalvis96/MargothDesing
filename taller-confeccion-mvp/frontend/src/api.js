const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'No fue posible completar la solicitud.');
  }
  return payload;
}

export const api = {
  clientes: () => request('/clientes'),
  crearCliente: (data) => request('/clientes', { method: 'POST', body: JSON.stringify(data) }),
  eliminarCliente: (id) => request(`/clientes/${id}`, { method: 'DELETE' }),
  pedidos: () => request('/pedidos'),
  crearPedido: (data) => request('/pedidos', { method: 'POST', body: JSON.stringify(data) })
};
