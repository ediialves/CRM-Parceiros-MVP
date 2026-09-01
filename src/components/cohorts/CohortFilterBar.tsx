import React, { useMemo, useState } from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { CohortFilters, countActiveCohortFilters, emptyCohortFilters } from '../../lib/cohorts/computeCohorts';

export interface PlaybookOption {
  id: string;
  nome: string;
}

interface Props {
  /** Rótulo da coluna, ex.: "Coluna A". */
  title: string;
  /** Cor de destaque (classe Tailwind base, ex.: 'indigo' | 'amber'). */
  accent: 'indigo' | 'amber';
  filters: CohortFilters;
  onChange: (next: CohortFilters) => void;
  availablePlanos: string[];
  availableGerentes: string[];
  availablePlaybooks: PlaybookOption[];
  /** Sufixo para ids do DOM, evitando colisão entre as duas colunas. */
  idSuffix: string;
}

const ACCENT = {
  indigo: {
    icon: 'text-indigo-600 dark:text-indigo-400',
    badge: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
    active: 'bg-indigo-600 text-white shadow-xs',
    ring: 'focus:ring-indigo-500/20',
    checkbox: 'text-indigo-600 focus:ring-indigo-500/20',
    bar: 'bg-indigo-500',
  },
  amber: {
    icon: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    active: 'bg-amber-600 text-white shadow-xs',
    ring: 'focus:ring-amber-500/20',
    checkbox: 'text-amber-600 focus:ring-amber-500/20',
    bar: 'bg-amber-500',
  },
} as const;

const slug = (s: string) => s.replace(/\s+/g, '-').toLowerCase();

export const CohortFilterBar: React.FC<Props> = ({
  title,
  accent,
  filters,
  onChange,
  availablePlanos,
  availableGerentes,
  availablePlaybooks,
  idSuffix,
}) => {
  const c = ACCENT[accent];

  const [planoDropdownOpen, setPlanoDropdownOpen] = useState(false);
  const [gerenteDropdownOpen, setGerenteDropdownOpen] = useState(false);
  const [playbookDropdownOpen, setPlaybookDropdownOpen] = useState(false);
  const [planoSearch, setPlanoSearch] = useState('');
  const [gerenteSearch, setGerenteSearch] = useState('');
  const [playbookSearch, setPlaybookSearch] = useState('');

  const activeFiltersCount = countActiveCohortFilters(filters);

  const filteredPlanos = useMemo(
    () => availablePlanos.filter((p) => p.toLowerCase().includes(planoSearch.toLowerCase())),
    [availablePlanos, planoSearch]
  );
  const filteredGerentes = useMemo(
    () => availableGerentes.filter((g) => g.toLowerCase().includes(gerenteSearch.toLowerCase())),
    [availableGerentes, gerenteSearch]
  );
  const filteredPlaybooks = useMemo(
    () => availablePlaybooks.filter((p) => (p.nome || '').toLowerCase().includes(playbookSearch.toLowerCase())),
    [availablePlaybooks, playbookSearch]
  );

  const set = <K extends keyof CohortFilters>(key: K, value: CohortFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  const closeAll = () => {
    setPlanoDropdownOpen(false);
    setGerenteDropdownOpen(false);
    setPlaybookDropdownOpen(false);
  };

  const segmented = <T extends string>(
    current: T,
    value: T,
    label: string,
    onPick: (v: T) => void,
    id: string
  ) => (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
        current === value ? c.active : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
      }`}
      id={id}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col animate-fade-in overflow-hidden" id={`container-filtros-coorte-${idSuffix}`}>
      <div className={`h-1 w-full ${c.bar}`} />
      <div className="p-5 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-border border-opacity-30 pb-3">
          <div className="flex items-center gap-2.5">
            <Filter className={`h-5 w-5 ${c.icon}`} id={`icon-filtros-${idSuffix}`} />
            <h3 className="text-base font-bold text-text-primary" id={`title-filtros-${idSuffix}`}>
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${c.badge}`} id={`badge-active-filters-${idSuffix}`}>
              {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}
            </span>
            <button
              type="button"
              disabled={activeFiltersCount === 0}
              onClick={() => onChange(emptyCohortFilters())}
              className={`text-xs font-semibold transition-colors ${
                activeFiltersCount > 0
                  ? 'text-rose-500 hover:text-rose-600 cursor-pointer'
                  : 'text-text-secondary opacity-40 cursor-not-allowed'
              }`}
              id={`btn-limpar-filtros-${idSuffix}`}
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Bloco Plano / Segmento */}
          <div className="flex flex-col gap-2" id={`bloco-filtro-plano-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Plano / Segmento
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !planoDropdownOpen;
                  closeAll();
                  setPlanoDropdownOpen(next);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 ${c.ring}`}
                id={`btn-dropdown-plano-${idSuffix}`}
              >
                <span className="truncate">
                  {filters.selectedPlanos.length === 0
                    ? 'Todos os planos'
                    : filters.selectedPlanos.length === 1
                    ? filters.selectedPlanos[0]
                    : `${filters.selectedPlanos.length} planos selecionados`}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${planoDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {planoDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPlanoDropdownOpen(false)} />
                  <div className="absolute left-0 mt-1.5 z-20 w-full min-w-[240px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-60 overflow-y-auto scroll-minimal">
                    <input
                      type="text"
                      placeholder="Buscar plano..."
                      value={planoSearch}
                      onChange={(e) => setPlanoSearch(e.target.value)}
                      className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col gap-1">
                      {filteredPlanos.map((plano) => {
                        const isSelected = filters.selectedPlanos.includes(plano);
                        return (
                          <label
                            key={plano}
                            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                            id={`label-opt-plano-${idSuffix}-${slug(plano)}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                set(
                                  'selectedPlanos',
                                  isSelected
                                    ? filters.selectedPlanos.filter((p) => p !== plano)
                                    : [...filters.selectedPlanos, plano]
                                )
                              }
                              className={`rounded border-border h-4 w-4 ${c.checkbox}`}
                            />
                            <span className="truncate">{plano}</span>
                          </label>
                        );
                      })}
                      {filteredPlanos.length === 0 && (
                        <span className="text-xs text-text-secondary text-center py-2">Nenhum plano encontrado</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bloco Gerente */}
          <div className="flex flex-col gap-2" id={`bloco-filtro-gerente-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Gerente
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const next = !gerenteDropdownOpen;
                  closeAll();
                  setGerenteDropdownOpen(next);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 ${c.ring}`}
                id={`btn-dropdown-gerente-${idSuffix}`}
              >
                <span className="truncate">
                  {filters.selectedGerentes.length === 0
                    ? 'Todos os gerentes'
                    : filters.selectedGerentes.length === 1
                    ? filters.selectedGerentes[0]
                    : `${filters.selectedGerentes.length} gerentes selecionados`}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${gerenteDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {gerenteDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setGerenteDropdownOpen(false)} />
                  <div className="absolute left-0 mt-1.5 z-20 w-full min-w-[240px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-60 overflow-y-auto scroll-minimal">
                    <input
                      type="text"
                      placeholder="Buscar gerente..."
                      value={gerenteSearch}
                      onChange={(e) => setGerenteSearch(e.target.value)}
                      className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col gap-1">
                      {filteredGerentes.map((gerente) => {
                        const isSelected = filters.selectedGerentes.includes(gerente);
                        return (
                          <label
                            key={gerente}
                            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                            id={`label-opt-gerente-${idSuffix}-${slug(gerente)}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() =>
                                set(
                                  'selectedGerentes',
                                  isSelected
                                    ? filters.selectedGerentes.filter((g) => g !== gerente)
                                    : [...filters.selectedGerentes, gerente]
                                )
                              }
                              className={`rounded border-border h-4 w-4 ${c.checkbox}`}
                            />
                            <span className="truncate">{gerente}</span>
                          </label>
                        );
                      })}
                      {filteredGerentes.length === 0 && (
                        <span className="text-xs text-text-secondary text-center py-2">Nenhum gerente encontrado</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bloco BAU x Playbook oficial */}
          <div className="flex flex-col gap-2" id={`bloco-filtro-origem-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Origem do plano
            </span>
            <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm">
              {segmented(filters.origemPlaybook, 'todos', 'Todos', (v) => set('origemPlaybook', v), `btn-origem-todos-${idSuffix}`)}
              {segmented(filters.origemPlaybook, 'playbooks_novos', 'Playbook oficial', (v) => set('origemPlaybook', v), `btn-origem-playbook-${idSuffix}`)}
              {segmented(filters.origemPlaybook, 'bau', 'BAU', (v) => set('origemPlaybook', v), `btn-origem-bau-${idSuffix}`)}
            </div>
          </div>

          {/* Bloco Playbooks oficiais específicos */}
          <div className="flex flex-col gap-2" id={`bloco-filtro-playbooks-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Playbooks oficiais
            </span>
            <div className="relative">
              <button
                type="button"
                disabled={filters.origemPlaybook === 'bau'}
                onClick={() => {
                  const next = !playbookDropdownOpen;
                  closeAll();
                  setPlaybookDropdownOpen(next);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm focus:outline-none focus:ring-2 ${c.ring} ${
                  filters.origemPlaybook === 'bau'
                    ? 'opacity-40 cursor-not-allowed'
                    : 'hover:bg-bg-secondary/20'
                }`}
                id={`btn-dropdown-playbook-${idSuffix}`}
                title={filters.origemPlaybook === 'bau' ? 'Indisponível: a origem está travada em BAU (planos sem playbook).' : undefined}
              >
                <span className="truncate">
                  {filters.selectedPlaybookIds.length === 0
                    ? 'Todos os playbooks'
                    : filters.selectedPlaybookIds.length === 1
                    ? availablePlaybooks.find((p) => p.id === filters.selectedPlaybookIds[0])?.nome || '1 playbook'
                    : `${filters.selectedPlaybookIds.length} playbooks selecionados`}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${playbookDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {playbookDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPlaybookDropdownOpen(false)} />
                  <div className="absolute left-0 mt-1.5 z-20 w-full min-w-[240px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-60 overflow-y-auto scroll-minimal">
                    <input
                      type="text"
                      placeholder="Buscar playbook..."
                      value={playbookSearch}
                      onChange={(e) => setPlaybookSearch(e.target.value)}
                      className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <div className="flex flex-col gap-1">
                      {filteredPlaybooks.map((pb) => {
                        const isSelected = filters.selectedPlaybookIds.includes(pb.id);
                        return (
                          <label
                            key={pb.id}
                            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                            id={`label-opt-playbook-${idSuffix}-${pb.id}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const nextIds = isSelected
                                  ? filters.selectedPlaybookIds.filter((id) => id !== pb.id)
                                  : [...filters.selectedPlaybookIds, pb.id];
                                // Escolher um playbook específico implica origem "playbook oficial".
                                onChange({
                                  ...filters,
                                  selectedPlaybookIds: nextIds,
                                  origemPlaybook: nextIds.length > 0 ? 'playbooks_novos' : filters.origemPlaybook,
                                });
                              }}
                              className={`rounded border-border h-4 w-4 ${c.checkbox}`}
                            />
                            <span className="truncate">{pb.nome}</span>
                          </label>
                        );
                      })}
                      {filteredPlaybooks.length === 0 && (
                        <span className="text-xs text-text-secondary text-center py-2">Nenhum playbook encontrado</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bloco Etapa do Plano */}
          <div className="flex flex-col gap-2" id={`bloco-filtro-etapa-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Etapa do plano
            </span>
            <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm">
              {segmented(filters.statusEtapaPlano, 'criado', 'Criado', (v) => set('statusEtapaPlano', v), `btn-etapa-criado-${idSuffix}`)}
              {segmented(filters.statusEtapaPlano, 'iniciado', 'Iniciado', (v) => set('statusEtapaPlano', v), `btn-etapa-iniciado-${idSuffix}`)}
              {segmented(filters.statusEtapaPlano, 'finalizado', 'Finalizado', (v) => set('statusEtapaPlano', v), `btn-etapa-finalizado-${idSuffix}`)}
            </div>
          </div>

          {/* Bloco Fila */}
          <div className="flex flex-col gap-2" id={`bloco-filtro-fila-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Fila
            </span>
            <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm">
              {segmented(filters.selectedFila, 'todos', 'Todos', (v) => set('selectedFila', v), `btn-fila-todos-${idSuffix}`)}
              {segmented(filters.selectedFila, 'RETENÇÃO', 'Retenção', (v) => set('selectedFila', v), `btn-fila-retencao-${idSuffix}`)}
              {segmented(filters.selectedFila, 'EXPANSÃO', 'Expansão', (v) => set('selectedFila', v), `btn-fila-expansao-${idSuffix}`)}
            </div>
          </div>

          {/* Bloco Status de Conclusão */}
          <div className="flex flex-col gap-2 md:col-span-2" id={`bloco-filtro-conclusao-${idSuffix}`}>
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Status de conclusão
            </span>
            <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm">
              {segmented(filters.statusConclusao, 'todos', 'Todos', (v) => set('statusConclusao', v), `btn-conclusao-todos-${idSuffix}`)}
              {segmented(filters.statusConclusao, 'sucesso', 'Sucesso', (v) => set('statusConclusao', v), `btn-conclusao-sucesso-${idSuffix}`)}
              {segmented(filters.statusConclusao, 'sem_sucesso', 'Sem sucesso', (v) => set('statusConclusao', v), `btn-conclusao-sem-sucesso-${idSuffix}`)}
              {segmented(filters.statusConclusao, 'nao_classificado', 'Não classificado', (v) => set('statusConclusao', v), `btn-conclusao-nao-classificado-${idSuffix}`)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
