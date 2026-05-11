import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Partner } from '../../types';
import { mockPlans } from '../../lib/mock/plans';
import { mockTasks } from '../../lib/mock/tasks';
import { SearchInput } from '../ui/SearchInput';
import { PartnerCard } from './PartnerCard';

type FilterType = 'all' | 'low' | 'high';

interface PartnerListProps {
  partners: Partner[];
}

export const PartnerList: React.FC<PartnerListProps> = ({ partners }) => {
  const { user, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const filteredPartners = useMemo(() => {
    if (!user) return [];
    return partners.filter(partner => {
      // 1. Permissão: Gerente só vê seus parceiros
      if (!isAdmin && partner.gerente_responsavel_id !== user.id) {
        return false;
      }

      // 2. Busca: Nome ou ID
      const searchMatch = 
        partner.nome.toLowerCase().includes(search.toLowerCase()) ||
        partner.id.toLowerCase().includes(search.toLowerCase());
      
      if (!searchMatch) return false;

      // 3. Filtro de Progresso
      const partnerPlan = mockPlans.find(p => p.partner_id === partner.id && p.ativo);
      const planTasks = partnerPlan ? mockTasks.filter(t => t.plan_id === partnerPlan.id) : [];
      const progress = partnerPlan && planTasks.length > 0 
        ? (planTasks.filter(t => t.status === 'concluida').length / planTasks.length) * 100
        : 0;

      if (filter === 'low' && progress >= 50) return false;
      if (filter === 'high' && progress < 50) return false;

      return true;
    });
  }, [search, filter, isAdmin, user?.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 bg-surface p-4 rounded-xl border border-border shadow-xs">
        <SearchInput 
          placeholder="Buscar por nome ou ID..." 
          onSearch={setSearch}
        />
        
        <div className="flex bg-background p-1 rounded-lg border border-border">
          <button 
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Todos
          </button>
          <button 
            onClick={() => setFilter('low')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'low' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Abaixo 50%
          </button>
          <button 
            onClick={() => setFilter('high')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === 'high' ? 'bg-white text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
          >
            Acima 50%
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPartners.length > 0 ? (
          filteredPartners.map(partner => {
            const plan = mockPlans.find(p => p.partner_id === partner.id && p.ativo);
            const tasks = plan ? mockTasks.filter(t => t.plan_id === plan.id) : [];
            
            return (
              <PartnerCard 
                key={partner.id}
                partner={partner}
                plan={plan}
                tasks={tasks}
              />
            );
          })
        ) : (
          <div className="col-span-full py-20 text-center bg-surface rounded-xl border border-dashed border-border">
            <p className="text-text-secondary">Nenhum parceiro encontrado com os filtros atuais.</p>
          </div>
        )}
      </div>
    </div>
  );
};
