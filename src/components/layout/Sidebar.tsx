import React from 'react';
import { NavLink } from 'react-router-dom';
import { Users, FileUp, LayoutDashboard, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { isAdmin } = useAuth();

  const navItems = [
    { label: 'Parceiros', icon: Users, path: '/dashboard', end: true },
    ...(isAdmin ? [{ label: 'Importação', icon: FileUp, path: '/importacao' }] : []),
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
