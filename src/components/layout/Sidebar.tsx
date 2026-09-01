import React from 'react';
import { NavLink } from 'react-router-dom';
import { Users, FileUp, LayoutDashboard, LayoutGrid, X, BookOpen, FileText, Calendar, Megaphone, BarChart2, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { isAdmin } = useAuth();

  const navItems = [
    ...(!isAdmin ? [
      { label: 'Meu Dashboard', icon: LayoutDashboard, path: '/meu-dashboard' }
    ] : []),
    { label: 'Parceiros', icon: Users, path: '/dashboard', end: true },
    { label: 'Performance Gerentes', icon: BarChart2, path: '/performance-gerentes' },
    { label: 'Campanhas', icon: Megaphone, path: '/campanhas' },
    { label: 'Playbooks Automáticos', icon: BookOpen, path: '/playbooks-automaticos' },
    { label: 'Guia do CRM', icon: FileText, path: '/guia-crm' },
    ...(isAdmin ? [
      { label: 'Dashboard gerencial', icon: LayoutDashboard, path: '/dashboard-gerencial' },
      { label: 'Dashboard gerencial V2', icon: LayoutDashboard, path: '/dashboard-gerencial-v2' },
      { label: 'Dashboard de Coortes', icon: LayoutGrid, path: '/dashboard-coortes' },
      { label: 'Analytics de Playbooks', icon: BarChart2, path: '/playbooks-analytics' },
      { label: 'Analytics de Campanhas', icon: TrendingUp, path: '/campanhas-analytics' },
      { label: 'Forecast semanal', icon: Calendar, path: '/account-planning' },
      { label: 'Playbook', icon: BookOpen, path: '/playbook' },
      { label: 'Importação', icon: FileUp, path: '/importacao' }
    ] : []),
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}

      <aside className={`
        fixed top-0 left-0 bottom-0 w-64 bg-primary text-white z-50 transition-transform duration-300 transform
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        <div className="h-14 flex items-center justify-between px-6 border-b border-primary-light">
          <span className="font-bold text-xl tracking-tight">ParceiroCRM</span>
          <button 
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-primary-light rounded-md"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              onClick={() => {
                if (window.innerWidth < 1024) onClose();
              }}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2 rounded-md transition-colors
                ${isActive 
                  ? 'bg-primary-light text-white font-medium' 
                  : 'text-white/70 hover:bg-primary-light hover:text-white'
                }
              `}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary-light">
          <div className="text-xs text-white/50 text-center">
            v1.0.0 Alpha
          </div>
        </div>
      </aside>
    </>
  );
};
