import React from 'react';
import { ArrowLeft, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Partner } from '../../types';

interface PartnerHeaderProps {
  partner: Partner;
}

export const PartnerHeader: React.FC<PartnerHeaderProps> = ({ partner }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4">
      <button 
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors w-fit"
      >
        <ArrowLeft size={16} />
        Voltar para a lista
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-text-secondary">{partner.id}</span>
          <h1 className="text-3xl font-bold text-primary">{partner.nome}</h1>
        </div>
        
        <div className="flex items-center gap-3 px-4 py-2 bg-surface rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-primary-light/10 flex items-center justify-center text-primary-light">
            <UserIcon size={18} />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-text-secondary block">Gerente Responsável</span>
            <span className="text-sm font-medium">ID: {partner.gerente_responsavel_id}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
