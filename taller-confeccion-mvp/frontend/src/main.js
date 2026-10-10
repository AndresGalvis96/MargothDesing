import { api } from './api.js';
import './styles.css';

const state = { clientes: [], pedidos: [], view: 'dashboard' };
const $ = (selector) => document.querySelector(selector);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]);
}

function showNotice(message, type = 'success') {
  const notice = $('#notice');
  notice.textContent = message;
  notice.className = `notice ${type}`;
  notice.hidden = false;
  window.setTimeout(() => { notice.hidden = true; }, 4000);
}

function money(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function date(value) {
  if (!value) return 'Sin fecha';
  // Evita desplazamientos de fecha por zona horaria al interpretar YYYY-MM-DD.
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function estadoLabel(estado) {
  return ({
    pendiente: 'Pendiente', en_proceso: 'En proceso', terminado: 'Terminado',
    entregado: 'Entregado', cancelado: 'Cancelado'
  })[estado] || estado;
}

function renderTable(headers, rows, emptyMessage) {
  if (!rows.length) return `<div class="empty-state"><span>✂</span><p>${escapeHtml(emptyMessage)}</p></div>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function renderClients() {
  const rows = state.clientes.map((client) => `
    <tr>
      <td><strong>${escapeHtml(client.nombre)}</strong><small class="cell-sub">${escapeHtml(client.correo || 'Sin correo')}</small></td>
      <td>${escapeHtml(client.telefono || '—')}</td>
      <td>${escapeHtml(client.direccion || '—')}</td>
      <td><button class="text-button danger" data-delete-client="${client.id}" aria-label="Desactivar cliente ${escapeHtml(client.nombre)}">Desactivar</button></td>
    </tr>`);

  $('#clients-table').innerHTML = renderTable(['Cliente', 'Teléfono', 'Dirección', 'Acciones'], rows, 'Todavía no hay clientes registrados.');
}

function renderOrders(target = '#orders-table', orders = state.pedidos) {
  const rows = orders.map((order) => `
    <tr>
      <td><strong>${escapeHtml(order.descripcion)}</strong><small class="cell-sub">${escapeHtml(order.cliente_nombre || '')}</small></td>
      <td><span class="pill ${escapeHtml(order.estado)}">${escapeHtml(estadoLabel(order.estado))}</span></td>
      <td><span class="priority ${escapeHtml(order.prioridad)}">${escapeHtml(order.prioridad)}</span></td>
      <td>${escapeHtml(date(order.fecha_entrega))}</td>
      <td>${escapeHtml(money(order.valor))}</td>
    </tr>`);
  $(target).innerHTML = renderTable(['Trabajo / Cliente', 'Estado', 'Prioridad', 'Entrega', 'Valor'], rows, 'Todavía no hay pedidos registrados.');
}

function renderDashboard() {
  $('#stat-clientes').textContent = state.clientes.length;
  $('#stat-pedidos').textContent = state.pedidos.length;
  $('#stat-pendientes').textContent = state.pedidos.filter((p) => ['pendiente', 'en_proceso'].includes(p.estado)).length;
  renderOrders('#recent-orders', state.pedidos.slice(0, 5));
}

function populateClientSelect() {
  const select = $('#order-client');
  const previous = select.value;
  select.innerHTML = '<option value="">Selecciona un cliente</option>' + state.clientes
    .map((client) => `<option value="${client.id}">${escapeHtml(client.nombre)}</option>`).join('');
  if (previous) select.value = previous;
}

async function refreshData() {
  const [clientes, pedidos] = await Promise.all([api.clientes(), api.pedidos()]);
  state.clientes = clientes;
  state.pedidos = pedidos;
  renderClients();
  renderOrders();
  renderDashboard();
  populateClientSelect();
}

function navigate(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.id !== `view-${view}`;
  });
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  $('#page-title').textContent = ({ dashboard: 'Resumen', clientes: 'Clientes', pedidos: 'Pedidos' })[view];
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormVisible(form, visible) {
  form.hidden = !visible;
  if (visible) form.querySelector('input, select, textarea')?.focus();
}

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => navigate(button.dataset.view));
});
document.querySelectorAll('[data-go]').forEach((button) => {
  button.addEventListener('click', () => navigate(button.dataset.go));
});

$('#show-client-form').addEventListener('click', () => setFormVisible($('#cliente-form'), true));
$('#cancel-client-form').addEventListener('click', () => {
  $('#cliente-form').reset();
  setFormVisible($('#cliente-form'), false);
});
$('#show-order-form').addEventListener('click', () => {
  if (!state.clientes.length) {
    showNotice('Primero registra al menos un cliente para crear un pedido.', 'error');
    navigate('clientes');
    return;
  }
  setFormVisible($('#pedido-form'), true);
});
$('#cancel-order-form').addEventListener('click', () => {
  $('#pedido-form').reset();
  setFormVisible($('#pedido-form'), false);
});

$('#cliente-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api.crearCliente(formObject(form));
    form.reset();
    setFormVisible(form, false);
    await refreshData();
    showNotice('Cliente registrado correctamente.');
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

$('#pedido-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = formObject(form);
  data.cliente_id = Number(data.cliente_id);
  data.valor = Number(data.valor || 0);
  data.fecha_entrega = data.fecha_entrega || null;
  try {
    await api.crearPedido(data);
    form.reset();
    setFormVisible(form, false);
    await refreshData();
    showNotice('Pedido registrado correctamente.');
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

$('#clients-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-client]');
  if (!button) return;
  if (!window.confirm('¿Deseas desactivar este cliente?')) return;
  try {
    await api.eliminarCliente(button.dataset.deleteClient);
    await refreshData();
    showNotice('Cliente desactivado.');
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

refreshData().catch((error) => {
  showNotice(`No se pudo conectar con la API: ${error.message}. Revisa la configuración y que el servidor esté iniciado.`, 'error');
});
