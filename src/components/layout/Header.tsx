import React from 'react';
import { Menu, User, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuClick }) => {
  const { user, signOut } = useAuth();

  if (!user) return null;

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="lg:hidden p-2 hover:bg-background rounded-md text-text-secondary"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
        <span className="lg:hidden font-bold text-primary">ParceiroCRM</span>
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-background rounded-md text-text-secondary">
          <Bell size={20} />
        </button>
        
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="flex flex-col items-end hidden sm:flex">
            <span className="text-sm font-medium text-text-primary leading-tight">{user.nome}</span>
            <Badge variant={user.role === 'admin' ? 'primary' : 'neutral'} className="text-[10px] py-0">
              {user.role.toUpperCase()}
            </Badge>
          </div>
          <div className="group relative">
            <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center text-white cursor-pointer">
              <User size={18} />
            </div>
            <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <button 
                onClick={() => signOut()}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-danger hover:bg-danger/5 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                Sair da Conta
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
