import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/layout/MainLayout';

import LoginPage from './pages/auth/LoginPage';
import RegisterClientePage from './pages/auth/RegisterClientePage';

import CatalogoPage from './pages/cliente/CatalogoPage';
import SolicitudPersonalizadaPage from './pages/cliente/SolicitudPersonalizadaPage';
import MisPedidosPage from './pages/cliente/MisPedidosPage';
import MisMedidasPage from './pages/cliente/MisMedidasPage';

import DashboardPage from './pages/taller/DashboardPage';
import GestionPedidosPage from './pages/taller/GestionPedidosPage';
import CatalogoTallerPage from './pages/taller/CatalogoTallerPage';
import InventarioKardexPage from './pages/taller/InventarioKardexPage';
import PagosCajaPage from './pages/taller/PagosCajaPage';
import EmpleadosPage from './pages/taller/EmpleadosPage';
import ReportesPage from './pages/taller/ReportesPage';
import ExpedienteClientePage from './pages/taller/ExpedienteClientePage';
import ClientesTallerPage from './pages/taller/ClientesTallerPage';
import AgendaProduccionPage from './pages/taller/AgendaProduccionPage';

import TalleresGlobalPage from './pages/global/TalleresGlobalPage';

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
             <Routes>
    {/* Rutas Públicas (Vitrina sin cuenta + Auth) */}
    <Route path="/" element={<CatalogoPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/registro" element={<RegisterClientePage />} />

    {/* Rutas Protegidas con Sidebar */}
    <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        {/* Portal del Cliente */}
        <Route path="/catalogo" element={<ProtectedRoute rolesPermitidos={['cliente']}><CatalogoPage /></ProtectedRoute>} />
        <Route path="/mis-pedidos/personalizado" element={<ProtectedRoute rolesPermitidos={['cliente']}><SolicitudPersonalizadaPage /></ProtectedRoute>} />
        <Route path="/mis-pedidos" element={<ProtectedRoute rolesPermitidos={['cliente']}><MisPedidosPage /></ProtectedRoute>} />
        <Route path="/mis-medidas" element={<ProtectedRoute rolesPermitidos={['cliente']}><MisMedidasPage /></ProtectedRoute>} />

       {/* Operación del Taller */}
                    <Route path="/taller/dashboard" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor']}><DashboardPage /></ProtectedRoute>} />
                    <Route path="/taller/pedidos" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor', 'operario']}><GestionPedidosPage /></ProtectedRoute>} />
                    <Route path="/taller/prendas" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor']}><CatalogoTallerPage /></ProtectedRoute>} />
                    <Route path="/taller/inventario" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor', 'operario']}><InventarioKardexPage /></ProtectedRoute>} />
                    <Route path="/taller/pagos" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor']}><PagosCajaPage /></ProtectedRoute>} />
                    <Route path="/taller/empleados" element={<ProtectedRoute rolesPermitidos={['admin_local']}><EmpleadosPage /></ProtectedRoute>} />
                    <Route path="/taller/reportes" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor']}><ReportesPage /></ProtectedRoute>} />
                    <Route path="/taller/clientes" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor', 'operario']}><ClientesTallerPage /></ProtectedRoute>} />
                    <Route path="/taller/clientes/:clienteId" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor', 'operario']}><ExpedienteClientePage /></ProtectedRoute>} />
                    <Route path="/taller/agenda-produccion" element={<ProtectedRoute rolesPermitidos={['admin_local', 'supervisor', 'operario']}><AgendaProduccionPage /></ProtectedRoute>} />


        {/* Administración Global */}
        <Route path="/global/talleres" element={<ProtectedRoute rolesPermitidos={['admin_global']}><TalleresGlobalPage /></ProtectedRoute>} />
    </Route>

    {/* Cualquier ruta desconocida redirige a la vitrina pública */}
    <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}