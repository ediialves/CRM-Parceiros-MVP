import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Partner, Plan, Task } from '../../types';
import { SearchInput } from '../ui/SearchInput';
import { PartnerCard } from './PartnerCard';
import { FilterDropdown } from '../ui/FilterDropdown';
import { FilterChip } from '../ui/FilterChip';

interface PartnerListProps {
  partners: Partner[];
}

export const PartnerList: React.FC<PartnerListProps> = ({ partners }) => {
  const { user, isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  
  const [filters, setFilters] = useState({
    engajamento: '' as string,
    nivel: [] as string[],
    fila: '' as string,
  });

  const activeFilters = useMemo(() => {
    const active: { id: string; label: string; value: string; type: keyof typeof filters }[] = [];
    
    if (filters.engajamento) {
      const labels: Record<string, string> = {
        '0-25': '0-25%',
        '26-50': '26-50%',
        '51-75': '51-75%',
        '+75': '+75%'
      };
      active.push({ id: 'engajamento', label: 'Engajamento', value: labels[filters.engajamento], type: 'engajamento' });
    }
    
    if (filters.nivel.length > 0) {
      active.push({ id: 'nivel', label: 'Nível', value: filters.nivel.join(', '), type: 'nivel' });
    }
    
    if (filters.fila) {
      active.push({ id: 'fila', label: 'Fila', value: filters.fila, type: 'fila' });
    }
    
    return active;
  }, [filters]);

  const clearFilter = (type: keyof typeof filters) => {
    setFilters(prev => ({
      ...prev,
      [type]: type === 'nivel' ? [] : ''
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      engajamento: '',
      nivel: [],
      fila: '',
    });
  };

  const filteredPartners = useMemo(() => {
    if (!user) return [];
    return partners.filter(partner => {
      // 1. Busca: Nome ou ID
      const searchMatch = !search ||
        partner.nome.toLowerCase().includes(search.toLowerCase()) ||
        partner.id.toLowerCase().includes(search.toLowerCase()) ||
        partner.accountancy_id?.toLowerCase().includes(search.toLowerCase());
      
      if (!searchMatch) return false;

      // 3. Filtros combinados
      const engValue = partner.percentual_engajamento || 0;
      const matchEngajamento = !filters.engajamento || (
        (filters.engajamento === '0-25' && engValue <= 25) ||
        (filters.engajamento === '26-50' && engValue >= 26 && engValue <= 50) ||
        (filters.engajamento === '51-75' && engValue >= 51 && engValue <= 75) ||
        (filters.engajamento === '+75' && engValue > 75)
      );

      const matchNivel = filters.nivel.length === 0 || filters.nivel.includes(partner.nivel);

      const matchFila = !filters.fila || partner.fila === filters.fila;

      return matchEngajamento && matchNivel && matchFila;
    });
  }, [search, isAdmin, user?.id, partners, filters]);

  const totalFiltered = filteredPartners.length;
  const totalPartners = partners.length;

  return (
    <div className="space-y-6">
      {/* Linha 1: Busca + Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <SearchInput 
            placeholder="Buscar por nome ou ID..." 
            onSearch={setSearch}
          />
        </div>
        <FilterDropdown 
          activeCount={activeFilters.length} 
          onClearAll={clearAllFilters}
        >
          {/* Faixa de Engajamento */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-tight">Faixa de Engajamento</h4>
            <div className="space-y-1">
              {[
                { id: '0-25', label: '0-25%' },
                { id: '26-50', label: '26-50%' },
                { id: '51-75', label: '51-75%' },
                { id: '+75', label: '+75%' }
              ].map(opt => (
                <label key={opt.id} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="engajamento"
                    checked={filters.engajamento === opt.id}
                    onChange={() => setFilters(prev => ({ ...prev, engajamento: opt.id }))}
                    className="w-4 h-4 text-primary border-border focus:ring-primary/20"
                  />
                  <span className="text-sm text-text-primary group-hover:text-primary transition-colors">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Nível */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-tight">Nível</h4>
            <div className="space-y-1">
              {['Associado', 'Certificado', 'Especialista', 'Referência', 'Elite'].map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={filters.nivel.includes(opt)}
                    onChange={(e) => {
                      const newNivel = e.target.checked 
                        ? [...filters.nivel, opt]
                        : filters.nivel.filter(n => n !== opt);
                      setFilters(prev => ({ ...prev, nivel: newNivel }));
                    }}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-primary/20"
                  />
                  <span className="text-sm text-text-primary group-hover:text-primary transition-colors">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Fila */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-tight">Fila</h4>
            <div className="space-y-1">
              {['RETENÇÃO', 'EXPANSÃO'].map(opt => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="fila"
                    checked={filters.fila === opt}
                    onChange={() => setFilters(prev => ({ ...prev, fila: opt }))}
                    className="w-4 h-4 text-primary border-border focus:ring-primary/20"
                  />
                  <span className="text-sm text-text-primary group-hover:text-primary transition-colors">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </FilterDropdown>
      </div>

      {/* Linha 2: Chips de Filtros Ativos */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
          {activeFilters.map(f => (
            <FilterChip 
              key={f.id}
              label={f.label}
              value={f.value}
              onRemove={() => clearFilter(f.type)}
            />
          ))}
          {activeFilters.length > 1 && (
            <button 
              onClick={clearAllFilters}
              className="text-xs text-primary hover:text-primary-hover font-bold ml-2 transition-colors"
            >
              Limpar todos
            </button>
          )}
        </div>
      )}

      {/* Linha 3: Contador de Resultados */}
      <div className="flex items-center text-xs text-text-secondary">
        <span>
          {search ? (
            <>
              Mostrando <span className="font-medium text-text-primary">{totalFiltered}</span> de <span className="font-medium text-text-primary">{totalPartners}</span> parceiros
            </>
          ) : (
            <>
              <span className="font-medium text-text-primary">{totalPartners}</span> parceiros
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPartners.length > 0 ? (
          filteredPartners.map(partner => {
            const allPlans = (partner as any).plans ?? [];
            const activePlan = allPlans.find((p: any) => p.ativo);
            // Consolidar todas as tasks de todos os planos para o progresso real (consolidado)
            const allTasks = allPlans.flatMap((p: any) => p.tasks ?? []);
            
            return (
              <PartnerCard 
                key={partner.id}
                partner={partner}
                plan={activePlan}
                tasks={allTasks}
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
