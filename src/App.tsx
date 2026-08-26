/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Dashboard } from './pages/Dashboard';
import { DashboardGerencial } from './pages/DashboardGerencial';
import { DashboardGerencialV2 } from './pages/DashboardGerencialV2';
import { PerformanceGerentes } from './pages/PerformanceGerentes';
import { PlaybooksAutomaticos } from './pages/PlaybooksAutomaticos';
import { PlaybookAcompanhamento } from './pages/PlaybookAcompanhamento';
import { MeuDashboard } from './pages/MeuDashboard';
import { AccountPlanningPage } from './pages/AccountPlanning';
import { Importacao } from './pages/Importacao';
import { PartnerDetail } from './pages/PartnerDetail';
import { Campanhas } from './pages/Campanhas';
import { CampanhaKanban } from './pages/CampanhaKanban';
import Playbook from './pages/Playbook';
import { PlaybooksAnalytics } from './pages/PlaybooksAnalytics';
import { CampanhasAnalytics } from './pages/CampanhasAnalytics';
import GuiaCRM from './pages/GuiaCRM';
import { Login } from './pages/Login';
import { Cadastro } from './pages/Cadastro';
import { RedefinirSenha } from './pages/RedefinirSenha';
import { useAuth } from './context/AuthContext';

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
  );
}
