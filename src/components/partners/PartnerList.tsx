import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Partner, Plan, Task } from '../../types';
import { SearchInput } from '../ui/SearchInput';
import { PartnerCard } from './PartnerCard';
import { FilterDropdown } from '../ui/FilterDropdown';
import { FilterChip } from '../ui/FilterChip';

const getMonday = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

interface PartnerListProps {
  partners: Partner[];
  availablePlans: string[];
}

export const PartnerList: React.FC<PartnerListProps> = ({ partners, availablePlans }) => {
  const { user, isAdmin } = useAuth();
  
  const [isPlanoOpen, setIsPlanoOpen] = useState(false);
  const planoRef = React.useRef<HTMLDivElement>(null);
  const [isGerenteOpen, setIsGerenteOpen] = useState(false);
  const gerenteRef = React.useRef<HTMLDivElement>(null);
  const [isStatusPlanoOpen, setIsStatusPlanoOpen] = useState(false);
  const statusPlanoRef = React.useRef<HTMLDivElement>(null);
  const [isSemanaCriacaoOpen, setIsSemanaCriacaoOpen] = useState(false);
  const semanaCriacaoRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (planoRef.current && !planoRef.current.contains(event.target as Node)) {
        setIsPlanoOpen(false);
      }
      if (gerenteRef.current && !gerenteRef.current.contains(event.target as Node)) {
        setIsGerenteOpen(false);
      }
      if (statusPlanoRef.current && !statusPlanoRef.current.contains(event.target as Node)) {
        setIsStatusPlanoOpen(false);
      }
      if (semanaCriacaoRef.current && !semanaCriacaoRef.current.contains(event.target as Node)) {
        setIsSemanaCriacaoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [search, setSearch] = useState(() => {
    return sessionStorage.getItem('dashboard_search') || '';
  });
  
  const [filters, setFilters] = useState(() => {
    const saved = sessionStorage.getItem('dashboard_filters');
    const defaultFilters = {
      engajamento: '' as string,
      nivel: [] as string[],
      fila: '' as string,
      segmento: [] as string[],
      gerente: [] as string[],
      statusPlano: '' as string,
      semanaCriacao: '' as string,
    };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed) {
          if (parsed.plano) {
            parsed.segmento = typeof parsed.plano === 'string' ? [parsed.plano] : parsed.plano;
            delete parsed.plano;
          }
          if (typeof parsed.segmento === 'string') {
            parsed.segmento = parsed.segmento ? [parsed.segmento] : [];
          }
          if (!parsed.gerente) {
            parsed.gerente = [];
          } else if (typeof parsed.gerente === 'string') {
            parsed.gerente = parsed.gerente ? [parsed.gerente] : [];
          }
          return {
            ...defaultFilters,
            ...parsed
          };
        }
      } catch (e) {
        // Ignorar erro de parsing
      }
    }
    return defaultFilters;
  });

  useEffect(() => {
    sessionStorage.setItem('dashboard_search', search);
  }, [search]);

  useEffect(() => {
    sessionStorage.setItem('dashboard_filters', JSON.stringify(filters));
  }, [filters]);

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

    if (filters.segmento && filters.segmento.length > 0) {
      active.push({ id: 'plano', label: 'Segmento', value: filters.segmento.join(', '), type: 'segmento' });
    }

    if (filters.gerente && filters.gerente.length > 0) {
      active.push({ id: 'gerente', label: 'Gerente', value: filters.gerente.join(', '), type: 'gerente' });
    }

    if (filters.statusPlano) {
      const labels: Record<string, string> = {
        'com_plano': 'Com playbook',
        'sem_plano': 'Sem playbook'
      };
      active.push({ id: 'statusPlano', label: 'Playbook', value: labels[filters.statusPlano], type: 'statusPlano' });
    }

    if (filters.semanaCriacao) {
      active.push({ id: 'semanaCriacao', label: 'Semana do Plano', value: formatDate(filters.semanaCriacao), type: 'semanaCriacao' });
    }
    
    return active;
  }, [filters]);

  const clearFilter = (type: keyof typeof filters) => {
    setFilters(prev => ({
      ...prev,
      [type]: type === 'nivel' || type === 'segmento' || type === 'gerente' ? [] : ''
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      engajamento: '',
      nivel: [],
      fila: '',
      segmento: [],
      gerente: [],
      statusPlano: '',
      semanaCriacao: '',
    });
  };

  const uniqueGerentes = useMemo(() => {
    const rawGerentes = partners
      .map(p => p.gerente)
      .filter((g): g is string => typeof g === 'string' && g.trim() !== '');
    const set = new Set<string>(rawGerentes);
    const list = Array.from(set);
    return list.sort((a, b) => a.localeCompare(b));
  }, [partners]);

  const uniqueWeeks = useMemo(() => {
    const weeksSet = new Set<string>();
    partners.forEach(partner => {
      const activePlans = ((partner as any).plans || []).filter((p: any) => p.ativo);
      activePlans.forEach((p: any) => {
        if (p.created_at) {
          const monday = getMonday(p.created_at);
          if (monday) {
            weeksSet.add(monday);
          }
        }
      });
    });
    return Array.from(weeksSet).sort((a, b) => b.localeCompare(a));
  }, [partners]);

  const filteredPartners = useMemo(() => {
    if (!user) return [];
    return partners.filter(partner => {
      // 1. Busca: Nome ou ID
      const searchMatch = !search ||
        partner.nome.toLowerCase().includes(search.toLowerCase()) ||
        partner.id.toLowerCase().includes(search.toLowerCase()) ||
        partner.accountancy_id?.toLowerCase().includes(search.toLowerCase());
      
      if (!searchMatch) return false;

      const activePlans = ((partner as any).plans || []).filter((p: any) => p.ativo);

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

      const matchPlano = filters.segmento.length === 0 || filters.segmento.includes(partner.segmento);

      const matchGerente = filters.gerente.length === 0 || filters.gerente.includes(partner.gerente);

      const matchStatusPlano =
        !filters.statusPlano ||
        (filters.statusPlano === 'com_plano' && activePlans.length > 0) ||
        (filters.statusPlano === 'sem_plano' && activePlans.length === 0);

      const matchSemanaCriacao =
        !filters.semanaCriacao ||
        activePlans.some((p: any) => getMonday(p.created_at) === filters.semanaCriacao);

      return matchEngajamento && matchNivel && matchFila && matchPlano && matchGerente && matchStatusPlano && matchSemanaCriacao;
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
            value={search}
          />
        </div>
        
        {/* Filtro de Plano */}
        <div className="relative w-full sm:w-auto min-w-[160px]" ref={planoRef}>
          <button
            type="button"
            onClick={() => setIsPlanoOpen(!isPlanoOpen)}
            className="w-full h-10 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="truncate">
              {filters.segmento.length === 0 
                ? 'Segmento: Todos' 
                : filters.segmento.length === 1
                  ? `Segmento: ${filters.segmento[0]}`
                  : `Segmento (${filters.segmento.length})`}
            </span>
            <svg
              className={`w-4 h-4 text-text-secondary transition-transform ${isPlanoOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isPlanoOpen && (
            <div className="absolute right-0 mt-1 w-[220px] bg-white border border-border rounded-lg shadow-lg py-2 z-50 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-medium text-text-primary">
                <input
                  type="checkbox"
                  checked={filters.segmento.length === 0}
                  focus-ring-primary-check="true"
                  onChange={() => setFilters(prev => ({ ...prev, segmento: [] }))}
                  className="w-4 h-4 rounded text-primary border-border focus:ring-primary/20 cursor-pointer"
                />
                <span className="select-none">Todos</span>
              </label>
              
              <div className="border-t border-border my-1" />

              {availablePlans.map(plano => {
                const isChecked = filters.segmento.includes(plano);
                return (
                  <label key={plano} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-normal text-text-primary">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const newPlano = e.target.checked
                          ? [...filters.segmento, plano]
                          : filters.segmento.filter(p => p !== plano);
                        setFilters(prev => ({ ...prev, segmento: newPlano }));
                      }}
                      className="w-4 h-4 rounded text-primary border-border focus:ring-primary/20 cursor-pointer"
                    />
                    <span className="select-none">{plano}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Filtro de Gerente */}
        {isAdmin && (
          <div className="relative w-full sm:w-auto min-w-[160px]" ref={gerenteRef}>
            <button
              type="button"
              onClick={() => setIsGerenteOpen(!isGerenteOpen)}
              className="w-full h-10 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {filters.gerente.length === 0 
                  ? 'Gerente: Todos' 
                  : filters.gerente.length === 1
                    ? `Gerente: ${filters.gerente[0]}`
                    : `Gerente (${filters.gerente.length})`}
              </span>
              <svg
                className={`w-4 h-4 text-text-secondary transition-transform ${isGerenteOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isGerenteOpen && (
              <div className="absolute right-0 mt-1 w-[220px] bg-white border border-border rounded-lg shadow-lg py-2 z-50 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200 max-h-[300px] overflow-y-auto">
                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-medium text-text-primary">
                  <input
                    type="checkbox"
                    checked={filters.gerente.length === 0}
                    onChange={() => setFilters(prev => ({ ...prev, gerente: [] }))}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-primary/20 cursor-pointer"
                  />
                  <span className="select-none">Todos</span>
                </label>
                
                <div className="border-t border-border my-1" />

                {uniqueGerentes.map(gerente => {
                  const isChecked = filters.gerente.includes(gerente);
                  return (
                    <label key={gerente} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-normal text-text-primary">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          const newGerente = e.target.checked
                            ? [...filters.gerente, gerente]
                            : filters.gerente.filter(g => g !== gerente);
                          setFilters(prev => ({ ...prev, gerente: newGerente }));
                        }}
                        className="w-4 h-4 rounded text-primary border-border focus:ring-primary/20 cursor-pointer"
                      />
                      <span className="select-none">{gerente}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Filtro Presença de Plano */}
        <div className="relative w-full sm:w-auto min-w-[160px]" ref={statusPlanoRef}>
          <button
            type="button"
            onClick={() => setIsStatusPlanoOpen(!isStatusPlanoOpen)}
            className="w-full h-10 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="truncate">
              {!filters.statusPlano 
                ? 'Playbook: Todos' 
                : filters.statusPlano === 'com_plano'
                  ? 'Com playbook'
                  : 'Sem playbook'}
            </span>
            <svg
              className={`w-4 h-4 text-text-secondary transition-transform ${isStatusPlanoOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isStatusPlanoOpen && (
            <div className="absolute right-0 mt-1 w-[220px] bg-white border border-border rounded-lg shadow-lg py-2 z-50 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-medium text-text-primary">
                <input
                  type="radio"
                  name="statusPlanoSelect"
                  checked={!filters.statusPlano}
                  onChange={() => {
                    setFilters(prev => ({ ...prev, statusPlano: '' }));
                    setIsStatusPlanoOpen(false);
                  }}
                  className="w-4 h-4 text-primary border-border focus:ring-primary/20 cursor-pointer"
                />
                <span className="select-none">Todos</span>
              </label>
              
              <div className="border-t border-border my-1" />

              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-normal text-text-primary">
                <input
                  type="radio"
                  name="statusPlanoSelect"
                  checked={filters.statusPlano === 'com_plano'}
                  onChange={() => {
                    setFilters(prev => ({ ...prev, statusPlano: 'com_plano' }));
                    setIsStatusPlanoOpen(false);
                  }}
                  className="w-4 h-4 text-primary border-border focus:ring-primary/20 cursor-pointer"
                />
                <span className="select-none">Com playbook</span>
              </label>

              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-normal text-text-primary">
                <input
                  type="radio"
                  name="statusPlanoSelect"
                  checked={filters.statusPlano === 'sem_plano'}
                  onChange={() => {
                    setFilters(prev => ({ ...prev, statusPlano: 'sem_plano' }));
                    setIsStatusPlanoOpen(false);
                  }}
                  className="w-4 h-4 text-primary border-border focus:ring-primary/20 cursor-pointer"
                />
                <span className="select-none">Sem playbook</span>
              </label>
            </div>
          )}
        </div>

        {/* Filtro por Semana de Criação */}
        <div className="relative w-full sm:w-auto min-w-[160px]" ref={semanaCriacaoRef}>
          <button
            type="button"
            onClick={() => setIsSemanaCriacaoOpen(!isSemanaCriacaoOpen)}
            className="w-full h-10 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="truncate">
              {!filters.semanaCriacao 
                ? 'Semana: Todas' 
                : `Semana: ${formatDate(filters.semanaCriacao)}`}
            </span>
            <svg
              className={`w-4 h-4 text-text-secondary transition-transform ${isSemanaCriacaoOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isSemanaCriacaoOpen && (
            <div className="absolute right-0 mt-1 w-[220px] bg-white border border-border rounded-lg shadow-lg py-2 z-50 space-y-1 animate-in fade-in slide-in-from-top-1 duration-200 max-h-[300px] overflow-y-auto">
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-medium text-text-primary">
                <input
                  type="radio"
                  name="semanaCriacaoSelect"
                  checked={!filters.semanaCriacao}
                  onChange={() => {
                    setFilters(prev => ({ ...prev, semanaCriacao: '' }));
                    setIsSemanaCriacaoOpen(false);
                  }}
                  className="w-4 h-4 text-primary border-border focus:ring-primary/20 cursor-pointer"
                />
                <span className="select-none">Todas</span>
              </label>
              
              <div className="border-t border-border my-1" />

              {uniqueWeeks.map(week => {
                const isSelected = filters.semanaCriacao === week;
                return (
                  <label key={week} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface transition-colors cursor-pointer text-sm font-normal text-text-primary">
                    <input
                      type="radio"
                      name="semanaCriacaoSelect"
                      checked={isSelected}
                      onChange={() => {
                        setFilters(prev => ({ ...prev, semanaCriacao: week }));
                        setIsSemanaCriacaoOpen(false);
                      }}
                      className="w-4 h-4 text-primary border-border focus:ring-primary/20 cursor-pointer"
                    />
                    <span className="select-none">{formatDate(week)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <FilterDropdown 
          activeCount={activeFilters.filter(f => f.type !== 'plano' && f.type !== 'gerente' && f.type !== 'statusPlano' && f.type !== 'semanaCriacao').length} 
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
          {totalFiltered < totalPartners ? (
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
            const activePlans = allPlans.filter((p: any) => p.ativo);
            
            return (
              <PartnerCard 
                key={partner.id}
                partner={partner}
                activePlans={activePlans}
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
