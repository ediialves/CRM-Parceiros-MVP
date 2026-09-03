/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Login } from './pages/Login';
import { useAuth } from './context/AuthContext';

/**
 * Cada pagina vira um chunk proprio, carregado so quando a rota e aberta.
 * Antes as 20 paginas eram importadas estaticamente e viravam um bundle unico de
 * ~1,9 MB baixado antes de qualquer pixel aparecer.
 */
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const DashboardGerencial = lazy(() => import('./pages/DashboardGerencial').then(m => ({ default: m.DashboardGerencial })));
const DashboardGerencialV2 = lazy(() => import('./pages/DashboardGerencialV2').then(m => ({ default: m.DashboardGerencialV2 })));
const DashboardCoortes = lazy(() => import('./pages/DashboardCoortes').then(m => ({ default: m.DashboardCoortes })));
const PerformanceGerentes = lazy(() => import('./pages/PerformanceGerentes').then(m => ({ default: m.PerformanceGerentes })));
const PlaybooksAutomaticos = lazy(() => import('./pages/PlaybooksAutomaticos').then(m => ({ default: m.PlaybooksAutomaticos })));
const PlaybookAcompanhamento = lazy(() => import('./pages/PlaybookAcompanhamento').then(m => ({ default: m.PlaybookAcompanhamento })));
const MeuDashboard = lazy(() => import('./pages/MeuDashboard').then(m => ({ default: m.MeuDashboard })));
const AccountPlanningPage = lazy(() => import('./pages/AccountPlanning').then(m => ({ default: m.AccountPlanningPage })));
const Importacao = lazy(() => import('./pages/Importacao').then(m => ({ default: m.Importacao })));
const PartnerDetail = lazy(() => import('./pages/PartnerDetail').then(m => ({ default: m.PartnerDetail })));
const Campanhas = lazy(() => import('./pages/Campanhas').then(m => ({ default: m.Campanhas })));
const CampanhaKanban = lazy(() => import('./pages/CampanhaKanban').then(m => ({ default: m.CampanhaKanban })));
const PlaybooksAnalytics = lazy(() => import('./pages/PlaybooksAnalytics').then(m => ({ default: m.PlaybooksAnalytics })));
const CampanhasAnalytics = lazy(() => import('./pages/CampanhasAnalytics').then(m => ({ default: m.CampanhasAnalytics })));
const Cadastro = lazy(() => import('./pages/Cadastro').then(m => ({ default: m.Cadastro })));
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha').then(m => ({ default: m.RedefinirSenha })));
const Playbook = lazy(() => import('./pages/Playbook'));
const GuiaCRM = lazy(() => import('./pages/GuiaCRM'));

const RouteFallback: React.FC = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode, adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const { user, loading, isAdmin } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
};


export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Cadastro />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="meu-dashboard" element={<MeuDashboard />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="dashboard-gerencial" element={<ProtectedRoute adminOnly><DashboardGerencial /></ProtectedRoute>} />
        <Route path="dashboard-gerencial-v2" element={<ProtectedRoute adminOnly><DashboardGerencialV2 /></ProtectedRoute>} />
        <Route path="dashboard-coortes" element={<ProtectedRoute adminOnly><DashboardCoortes /></ProtectedRoute>} />
        <Route path="performance-gerentes" element={<ProtectedRoute><PerformanceGerentes /></ProtectedRoute>} />
        <Route path="playbooks-automaticos" element={<ProtectedRoute><PlaybooksAutomaticos /></ProtectedRoute>} />
        <Route path="playbooks-automaticos/:id" element={<ProtectedRoute><PlaybookAcompanhamento /></ProtectedRoute>} />
        <Route path="playbooks-analytics" element={<ProtectedRoute adminOnly><PlaybooksAnalytics /></ProtectedRoute>} />
        <Route path="campanhas-analytics" element={<ProtectedRoute adminOnly><CampanhasAnalytics /></ProtectedRoute>} />
        <Route path="account-planning" element={<ProtectedRoute adminOnly><AccountPlanningPage /></ProtectedRoute>} />
        <Route path="importacao" element={<ProtectedRoute adminOnly><Importacao /></ProtectedRoute>} />
        <Route path="parceiros/:id" element={<PartnerDetail />} />
        <Route path="playbook" element={<ProtectedRoute adminOnly><Playbook /></ProtectedRoute>} />
        <Route path="guia-crm" element={<GuiaCRM />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="campanhas/:id" element={<CampanhaKanban />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
