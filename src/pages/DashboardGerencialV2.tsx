import React, { useEffect, useState, useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getMondayOfWeek } from '../lib/cohorts/computeCohorts';
import { formatCohortWeekLabel } from '../lib/cohorts/heatmap';
import { Layout, Users, FileText, CheckCircle2, AlertTriangle, Loader2, ChevronDown, Filter, Bookmark, Trash2, Plus, TrendingUp } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ManagerStat {
  id: string;
  nome: string;
  partnersCount: number;
  plansCount: number;
  coverage: number | null;
  delayedCount: number;
  onTimeCount: number;
}

interface SegmentStat {
  segment: string;
  partnersCount: number;
  plansCount: number;
  coverage: number | null;
}

interface WeeklyStat {
  key: string;
  label: string;
  count: number;
  managers: Record<string, number>;
}

interface CompletedTasksWeeklyStat {
  key: string;
  label: string;
  total: number;
  managers: Record<string, number>;
}

interface FinishedPlansStat {
  manager: string;
  count: number;
}

interface TasksStatusStat {
  manager: string;
  backlog: number;
  agenda: number;
  em_andamento: number;
  concluida: number;
  total: number;
}

// Card "Planos Criados por Fila": identificador do tipo de plano manual (sem playbook_id).
const BAU_TIPO_ID = '__bau__';
const BAU_TIPO_LABEL = 'Manual (BAU)';

// Janela fixa do relatório semanal de planos criados.
const SEMANAS_HISTORICO_PLANOS = 20;

// Filas exibidas no relatório. "Sem fila" só aparece quando houver planos sem fila.
const FILA_RETENCAO = 'RETENÇÃO';
const FILA_EXPANSAO = 'EXPANSÃO';
const FILA_SEM = 'Sem fila';

const FILA_CORES: Record<string, string> = {
  [FILA_RETENCAO]: '#4f46e5', // indigo-600
  [FILA_EXPANSAO]: '#059669', // emerald-600
  [FILA_SEM]: '#94a3b8'       // slate-400
};

const FILA_LABELS: Record<string, string> = {
  [FILA_RETENCAO]: 'Retenção',
  [FILA_EXPANSAO]: 'Expansão',
  [FILA_SEM]: 'Sem fila'
};

// Paleta usada quando as colunas são empilhadas por tipo de plano.
const TIPO_PLANO_CORES = [
  '#4f46e5', // indigo-600
  '#059669', // emerald-600
  '#f59e0b', // amber-500
  '#e11d48', // rose-600
  '#0284c7', // sky-600
  '#7c3aed', // violet-600
  '#0d9488', // teal-600
  '#ea580c', // orange-600
  '#c026d3', // fuchsia-600
  '#65a30d', // lime-600
  '#64748b', // slate-500
];

const normalizeFila = (fila: any): string => {
  const raw = (fila || '').toString().trim().toUpperCase();
  if (raw.startsWith('RETEN')) return FILA_RETENCAO;
  if (raw.startsWith('EXPANS')) return FILA_EXPANSAO;
  return FILA_SEM;
};

// Últimas N segundas-feiras (mais antiga primeiro), terminando na semana corrente.
const getUltimasSemanas = (n: number): string[] => {
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const semanaAtual = getMondayOfWeek(hojeStr);
  if (!semanaAtual) return [];

  const semanas: string[] = [];
  const cursor = new Date(semanaAtual + 'T00:00:00Z');
  for (let i = 0; i < n; i++) {
    semanas.push(cursor.toISOString().split('T')[0]);
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return semanas.reverse();
};

export const DashboardGerencialV2: React.FC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  
  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [managerStats, setManagerStats] = useState<ManagerStat[]>([]);
  const [segmentStats, setSegmentStats] = useState<SegmentStat[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStat[]>([]);
  const [completedTasksStats, setCompletedTasksStats] = useState<CompletedTasksWeeklyStat[]>([]);
  const [delayedTasksStats, setDelayedTasksStats] = useState<CompletedTasksWeeklyStat[]>([]);
  const [finishedPlansStats, setFinishedPlansStats] = useState<FinishedPlansStat[]>([]);
  const [tasksStatusStats, setTasksStatusStats] = useState<TasksStatusStat[]>([]);
  const [funnelStats, setFunnelStats] = useState({
    m1: 0,
    m2: 0,
    m3: 0,
    m4: 0,
    m5: 0
  });

  const [rawData, setRawData] = useState<{
    managersList: any[];
    partners: any[];
    plans: any[];
    tasks: any[];
    weeklyPlansData: any[];
    completedTasksData: any[];
    delayedTasksData: any[];
    finishedPlansRaw: any[];
    tasksForStatusRaw: any[];
    basePlans: any[];
    snapshots: any[];
    partnerSnapshots: any[];
    funnelPartnerSnapshots?: any[];
    allUsers?: any[];
  } | null>(null);

  const [selectedPlanos, setSelectedPlanos] = useState<string[]>([]);
  const [selectedGerentes, setSelectedGerentes] = useState<string[]>([]);
  const [selectedPlaybookTipo, setSelectedPlaybookTipo] = useState<'todos' | 'playbooks_novos' | 'bau'>('todos');
  const [comPlano, setComPlano] = useState<'todos' | 'com_plano' | 'sem_plano'>('todos');
  const [statusEtapaPlano, setStatusEtapaPlano] = useState<'criado' | 'iniciado' | 'finalizado'>('criado');
  const [statusConclusao, setStatusConclusao] = useState<'todos' | 'sucesso' | 'sem_sucesso' | 'nao_classificado'>('todos');
  const [selectedFila, setSelectedFila] = useState<'todos' | 'RETENÇÃO' | 'EXPANSÃO'>('todos');
  const [evolucaoTab, setEvolucaoTab] = useState<'historico' | 'cobertura'>('historico');

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedPlanos.length > 0) count++;
    if (selectedGerentes.length > 0) count++;
    if (selectedPlaybookTipo !== 'todos') count++;
    if (comPlano !== 'todos') count++;
    if (statusEtapaPlano !== 'criado') count++;
    if (statusConclusao !== 'todos') count++;
    if (selectedFila !== 'todos') count++;
    return count;
  }, [selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila]);

  // Historic import count window state ('4' | '8' | 'all')
  const [historicImportCount, setHistoricImportCount] = useState<'4' | '8' | 'all'>('all');

  // Dropdown open states
  const [planoDropdownOpen, setPlanoDropdownOpen] = useState(false);
  const [gerenteDropdownOpen, setGerenteDropdownOpen] = useState(false);

  // Search input states
  const [planoSearch, setPlanoSearch] = useState('');
  const [gerenteSearch, setGerenteSearch] = useState('');

  // Saved filters state
  const [savedFilters, setSavedFilters] = useState<any[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Playbook step advance states
  const [playbooksList, setPlaybooksList] = useState<{ id: string; nome: string }[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');
  const [loadingStepData, setLoadingStepData] = useState<boolean>(false);
  const [stepTasks, setStepTasks] = useState<{ id: string; titulo: string; ordem: number }[]>([]);
  const [stepHistory, setStepHistory] = useState<any[]>([]);

  // Filtros próprios do relatório "Planos Criados por Fila" (independentes da barra de filtros global)
  // Guarda os "tipos de plano" EXCLUÍDOS da análise: cada item é um playbook.id ou BAU_TIPO_ID.
  const [excludedTiposPlano, setExcludedTiposPlano] = useState<string[]>([]);
  const [tipoPlanoDropdownOpen, setTipoPlanoDropdownOpen] = useState(false);
  const [tipoPlanoSearch, setTipoPlanoSearch] = useState('');
  // Dimensão do empilhamento das colunas semanais.
  const [empilharPor, setEmpilharPor] = useState<'fila' | 'tipo'>('fila');

  const fetchSavedFilters = async () => {
    try {
      setLoadingFilters(true);
      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .eq('dashboard', 'dashboard_gerencial_v2')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedFilters(data || []);
    } catch (err) {
      console.error('Erro ao buscar filtros salvos:', err);
    } finally {
      setLoadingFilters(false);
    }
  };

  useEffect(() => {
    if (user && isAdmin) {
      fetchSavedFilters();
    }
  }, [user, isAdmin]);

  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    if (
      selectedPlanos.length === 0 &&
      selectedGerentes.length === 0 &&
      selectedPlaybookTipo === 'todos' &&
      comPlano === 'todos' &&
      statusEtapaPlano === 'criado' &&
      statusConclusao === 'todos' &&
      selectedFila === 'todos'
    ) return;

    try {
      setIsSavingFilter(true);
      const { error } = await supabase
        .from('saved_filters')
        .insert({
          user_id: user?.id,
          dashboard: 'dashboard_gerencial_v2',
          nome: newFilterName.trim(),
          planos: selectedPlanos,
          gerentes: selectedGerentes,
          plano_modo: 'incluir',
          gerente_modo: 'incluir',
          origem_playbook: selectedPlaybookTipo,
          plano_existente: comPlano,
          status_etapa_plano: statusEtapaPlano,
          status_conclusao_filtro: statusConclusao,
          fila: selectedFila
        });

      if (error) throw error;

      setNewFilterName('');
      setShowSaveInput(false);
      await fetchSavedFilters();
    } catch (err) {
      console.error('Erro ao salvar filtro:', err);
    } finally {
      setIsSavingFilter(false);
    }
  };

  const handleDeleteFilter = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchSavedFilters();
    } catch (err) {
      console.error('Erro ao excluir filtro:', err);
    }
  };

  const handleApplyFilter = (filter: any) => {
    setSelectedPlanos(filter.planos || []);
    setSelectedGerentes(filter.gerentes || []);
    setSelectedPlaybookTipo(filter.origem_playbook || 'todos');
    setComPlano(filter.plano_existente || 'todos');
    setStatusEtapaPlano(filter.status_etapa_plano || 'criado');
    setStatusConclusao(filter.status_conclusao_filtro || 'todos');
    setSelectedFila(filter.fila || 'todos');
  };

  const availablePlanos = useMemo(() => {
    if (!rawData) return [];
    const planos = rawData.partners.map(p => p.segmento?.trim()).filter(Boolean);
    return Array.from(new Set(planos)).sort();
  }, [rawData]);

  const availableGerentes = useMemo(() => {
    if (!rawData) return [];
    const gerentes = rawData.managersList.map(m => m.nome).filter(Boolean);
    return Array.from(new Set(gerentes)).sort();
  }, [rawData]);

  const filteredPlanos = useMemo(() => {
    return availablePlanos.filter(p =>
      p.toLowerCase().includes(planoSearch.toLowerCase())
    );
  }, [availablePlanos, planoSearch]);

  const filteredGerentes = useMemo(() => {
    return availableGerentes.filter(g =>
      g.toLowerCase().includes(gerenteSearch.toLowerCase())
    );
  }, [availableGerentes, gerenteSearch]);

  useEffect(() => {
    if (!user || !isAdmin) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoadingData(true);
        setErrorMsg(null);

        // 1. Get gerentes alfabeticamente usando RPC para contornar RLS
        const { data: fetchUsers, error: usersErr } = await supabase
          .rpc('get_all_users_for_admin');

        if (usersErr) throw usersErr;
        const managersList = (fetchUsers || [])
          .filter((u: any) => u.role === 'gerente')
          .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));

        // 2. Paginated fetch of partners (gerente_id, segmento, gerente)
        const fetchAllPartners = async () => {
          let allPartners: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('partners')
              .select('id, gerente_id, gerente, segmento, fila')
              .order('id', { ascending: true })
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              allPartners = [...allPartners, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allPartners;
        };

        // 3. Paginated fetch of all base plans
        const fetchAllBasePlans = async () => {
          let allPlans: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('plans')
              .select('id, ativo, status_conclusao, partner_id, created_at, playbook_id')
              .order('id', { ascending: true })
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              allPlans = [...allPlans, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allPlans;
        };

        // 4. Paginated fetch of non-deleted tasks
        const fetchAllTasks = async () => {
          try {
            let allTasks: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
              const { data, error } = await supabase
                .from('tasks')
                .select('id, status, deletada_em, data_conclusao_original, plan_id, ordem')
                .is('deletada_em', null)
                .order('id', { ascending: true })
                .range(from, from + limit - 1);
              if (error) {
                console.warn('Aviso ao buscar lote de tasks:', error);
                break;
              }
              if (data && data.length > 0) {
                allTasks = [...allTasks, ...data];
                if (data.length < limit) hasMore = false;
                else from += limit;
              } else {
                hasMore = false;
              }
            }
            return allTasks;
          } catch (err) {
            console.warn('Falha ao buscar tasks:', err);
            return [];
          }
        };

        const fetchSnapshots = async () => {
          try {
            const { data, error } = await supabase
              .from('playbook_funnel_snapshots')
              .select('semana, segmento, parceiros_no_segmento, parceiros_com_plano_criado, parceiros_com_plano_ativo, parceiros_ativo_atrasado, parceiros_finalizado')
              .order('semana', { ascending: true });
            if (error) throw error;
            return data || [];
          } catch (err) {
            console.warn('Falha ao buscar snapshots da tabela playbook_funnel_snapshots:', err);
            return [];
          }
        };

        const fetchPlaybooks = async () => {
          try {
            const { data, error } = await supabase
              .from('playbooks')
              .select('id, nome')
              .order('nome', { ascending: true });
            if (error) throw error;
            return data || [];
          } catch (err) {
            console.warn('Falha ao buscar playbooks:', err);
            return [];
          }
        };

        const fetchPartnerSnapshots = async () => {
          try {
            let allSnapshots: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
              const { data, error } = await supabase
                .from('partner_snapshots')
                .select('partner_id, imported_at, licencas, licencas_engajadas, import_completo, plano')
                .range(from, from + limit - 1);
              if (error) throw error;
              if (data && data.length > 0) {
                allSnapshots = [...allSnapshots, ...data];
                if (data.length < limit) hasMore = false;
                else from += limit;
              } else {
                hasMore = false;
              }
            }
            return allSnapshots;
          } catch (err) {
            console.warn('Falha ao buscar partner_snapshots:', err);
            return [];
          }
        };

        const fetchFunnelPartnerSnapshots = async () => {
          try {
            let allSnapshots: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
              const { data, error } = await supabase
                .from('playbook_funnel_partner_snapshots')
                .select('semana, partner_id, gerente, segmento, origem_playbook, tem_plano_criado, tem_plano_finalizado')
                .range(from, from + limit - 1);
              if (error) throw error;
              if (data && data.length > 0) {
                allSnapshots = [...allSnapshots, ...data];
                if (data.length < limit) hasMore = false;
                else from += limit;
              } else {
                hasMore = false;
              }
            }
            return allSnapshots;
          } catch (err) {
            console.warn('Falha ao buscar playbook_funnel_partner_snapshots:', err);
            return [];
          }
        };

        // Calculate the date 8 weeks ago starting on Monday, T12:00:00
        const getMondays = () => {
          const mondays: Date[] = [];
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          const currentMonday = new Date(now.setDate(diff));
          currentMonday.setHours(12, 0, 0, 0);

          for (let i = 7; i >= 0; i--) {
            const d = new Date(currentMonday);
            d.setDate(d.getDate() - (i * 7));
            mondays.push(d);
          }
          return mondays;
        };

        const mondays = getMondays();
        const startOfWeek8WeeksAgo = mondays[0];
        const year = startOfWeek8WeeksAgo.getFullYear();
        const month = String(startOfWeek8WeeksAgo.getMonth() + 1).padStart(2, '0');
        const dayStr = String(startOfWeek8WeeksAgo.getDate()).padStart(2, '0');
        const gteDateString = `${year}-${month}-${dayStr}T12:00:00`;

        const wrapFetch = async (name: string, fn: () => Promise<any>) => {
          try {
            return await fn();
          } catch (e: any) {
            console.error(`Erro na busca [${name}]:`, e);
            throw new Error(`Erro na busca [${name}]: ${e.message || JSON.stringify(e)}`);
          }
        };

        const [partners, basePlans, tasks, snapshots, playbooksData, partnerSnapshots, funnelPartnerSnapshots] = await Promise.all([
          wrapFetch('fetchAllPartners', fetchAllPartners),
          wrapFetch('fetchAllBasePlans', fetchAllBasePlans),
          wrapFetch('fetchAllTasks', fetchAllTasks),
          wrapFetch('fetchSnapshots', fetchSnapshots),
          wrapFetch('fetchPlaybooks', fetchPlaybooks),
          wrapFetch('fetchPartnerSnapshots', fetchPartnerSnapshots),
          wrapFetch('fetchFunnelPartnerSnapshots', fetchFunnelPartnerSnapshots)
        ]);

        if (!isMounted) return;

        setPlaybooksList(playbooksData || []);

        // Map plans to only active ones for rawData.plans
        const plans = basePlans.filter((p: any) => p.ativo === true);

        // Map weeklyPlansData: plans created >= gteDateString with partners(gerente_id, gerente)
        const weeklyPlansData = basePlans
          .filter((p: any) => p.created_at && p.created_at >= gteDateString)
          .map((p: any) => {
            const partner = partners.find((pt: any) => pt.id === p.partner_id);
            return {
              id: p.id,
              created_at: p.created_at,
              partner_id: p.partner_id,
              partners: partner ? {
                gerente_id: partner.gerente_id,
                gerente: partner.gerente
              } : null
            };
          });

        // Map completedTasksData: tasks with status === 'concluida'
        const completedTasksData = tasks
          .filter((t: any) => t.status === 'concluida')
          .map((t: any) => {
            const plan = basePlans.find((pl: any) => pl.id === t.plan_id);
            const partner = plan ? partners.find((pt: any) => pt.id === plan.partner_id) : null;
            return {
              id: t.id,
              status: t.status,
              data_conclusao_original: t.data_conclusao_original,
              deletada_em: t.deletada_em,
              plan_id: t.plan_id,
              plans: plan ? {
                partner_id: plan.partner_id,
                partners: partner ? {
                  gerente: partner.gerente
                } : null
              } : null
            };
          });

        // Map delayedTasksData: tasks with status !== 'concluida' and data_conclusao_original < nowIso
        const nowIso = new Date().toISOString();
        const delayedTasksData = tasks
          .filter((t: any) => t.status !== 'concluida' && t.data_conclusao_original && t.data_conclusao_original < nowIso)
          .map((t: any) => {
            const plan = basePlans.find((pl: any) => pl.id === t.plan_id);
            const partner = plan ? partners.find((pt: any) => pt.id === plan.partner_id) : null;
            return {
              id: t.id,
              status: t.status,
              data_conclusao_original: t.data_conclusao_original,
              deletada_em: t.deletada_em,
              plan_id: t.plan_id,
              plans: plan ? {
                partner_id: plan.partner_id,
                partners: partner ? {
                  gerente: partner.gerente
                } : null
              } : null
            };
          });

        // Map finishedPlansRaw: all plans with partner(gerente) and tasks(status, deletada_em)
        const finishedPlansRaw = basePlans.map((p: any) => {
          const partner = partners.find((pt: any) => pt.id === p.partner_id);
          const planTasks = tasks.filter((t: any) => t.plan_id === p.id);
          return {
            id: p.id,
            ativo: p.ativo,
            partner_id: p.partner_id,
            partners: partner ? {
              gerente: partner.gerente
            } : null,
            tasks: planTasks.map((t: any) => ({
              status: t.status,
              deletada_em: t.deletada_em
            }))
          };
        });

        // Map tasksForStatusRaw: all tasks with plans(partner_id, partners(gerente))
        const tasksForStatusRaw = tasks.map((t: any) => {
          const plan = basePlans.find((pl: any) => pl.id === t.plan_id);
          const partner = plan ? partners.find((pt: any) => pt.id === plan.partner_id) : null;
          return {
            status: t.status,
            deletada_em: t.deletada_em,
            plan_id: t.plan_id,
            plans: plan ? {
              partner_id: plan.partner_id,
              partners: partner ? {
                gerente: partner.gerente
              } : null
            } : null
          };
        });

        setRawData({
          managersList,
          partners,
          plans,
          tasks,
          weeklyPlansData,
          completedTasksData,
          delayedTasksData,
          finishedPlansRaw,
          tasksForStatusRaw,
          basePlans,
          snapshots,
          partnerSnapshots,
          funnelPartnerSnapshots,
          allUsers: fetchUsers || []
        });
      } catch (err: any) {
        console.error('Erro ao buscar dados do dashboard gerencial V2:', err);
        if (isMounted) {
          setErrorMsg(err.message || 'Erro ao carregar dados do banco');
        }
      } finally {
        if (isMounted) {
          setLoadingData(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [user, isAdmin]);

  // Reactive calculations when rawData or filters change
  useEffect(() => {
    if (!rawData) return;

    const {
      managersList,
      partners,
      plans,
      tasks,
      weeklyPlansData,
      completedTasksData,
      delayedTasksData,
      finishedPlansRaw,
      tasksForStatusRaw,
      basePlans,
      partnerSnapshots,
      allUsers
    } = rawData;

    const validUserNames = new Set(
      (allUsers || managersList || []).map((u: any) => (u.nome || '').trim().toLowerCase()).filter(Boolean)
    );

    const getSingularJoin = (joinVal: any): any => {
      if (!joinVal) return null;
      if (Array.isArray(joinVal)) {
        return joinVal[0] || null;
      }
      return joinVal;
    };

    const getPluralJoin = (joinVal: any): any[] => {
      if (!joinVal) return [];
      if (Array.isArray(joinVal)) {
        return joinVal;
      }
      return [joinVal];
    };

    const hoje = new Date().toISOString().split('T')[0];

    // Pre-calculate partner IDs for "Playbooks novos"
    const playbooksNovosPartnerIds = new Set<string>();
    (basePlans || []).forEach((p: any) => {
      if (p.playbook_id != null && p.partner_id) {
        playbooksNovosPartnerIds.add(p.partner_id);
      }
    });

    // Map plans by partner_id
    const partnerToPlansMap = new Map<string, any[]>();
    (basePlans || []).forEach((p: any) => {
      if (p && p.id && p.partner_id) {
        const list = partnerToPlansMap.get(p.partner_id) || [];
        list.push(p);
        partnerToPlansMap.set(p.partner_id, list);
      }
    });

    // Map tasks by plan_id
    const planToTasksMap = new Map<string, any[]>();
    (tasks || []).forEach((t: any) => {
      if (t && t.plan_id && !t.deletada_em) {
        const list = planToTasksMap.get(t.plan_id) || [];
        list.push(t);
        planToTasksMap.set(t.plan_id, list);
      }
    });

    // Pre-calculate partner sets
    const partnersWithPlanIds = new Set<string>(
      (basePlans || []).map((p: any) => (p && p.id && p.partner_id ? p.partner_id : null)).filter(Boolean)
    );

    const partnersWithIniciadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === true && pTasks.some((t: any) => t.status === 'concluida') && !todasTasksConcluidas) {
          partnersWithIniciadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithFinalizadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === false || todasTasksConcluidas) {
          partnersWithFinalizadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithSucessoIds = new Set<string>();
    const partnersWithSemSucessoIds = new Set<string>();
    const partnersWithNaoClassificadoIds = new Set<string>();

    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        if (p.status_conclusao === 'sucesso') {
          partnersWithSucessoIds.add(partnerId);
        }
        if (p.status_conclusao === 'sem_sucesso') {
          partnersWithSemSucessoIds.add(partnerId);
        }
        const pTasks = planToTasksMap.get(p.id) || [];
        if (
          pTasks.length > 0 &&
          pTasks.every((t: any) => t.status === 'concluida') &&
          (!p.status_conclusao || p.status_conclusao === '')
        ) {
          partnersWithNaoClassificadoIds.add(partnerId);
        }
      }
    });

    // Helper to check if a partner passes the current filters
    const partnerPassesFilter = (partner: any) => {
      if (!partner) return false;

      // 1. Filter by Plano
      const planoVal = partner.segmento?.trim() || '';
      if (selectedPlanos.length > 0) {
        if (!selectedPlanos.includes(planoVal)) return false;
      }

      // 2. Filter by Gerente
      const managerObj = managersList.find((m: any) => m.id === partner.gerente_id);
      const managerName = managerObj?.nome || 'Sem Gerente';
      if (selectedGerentes.length > 0) {
        if (!selectedGerentes.includes(managerName)) return false;
      }

      // 3. Filter by Playbook Tipo (Todos / Playbooks novos / BAU)
      if (selectedPlaybookTipo === 'playbooks_novos') {
        if (!playbooksNovosPartnerIds.has(partner.id)) return false;
      } else if (selectedPlaybookTipo === 'bau') {
        if (playbooksNovosPartnerIds.has(partner.id)) return false;
      }

      // 4. Filter by Com Plano
      if (comPlano === 'com_plano') {
        if (!partnersWithPlanIds.has(partner.id)) return false;
      } else if (comPlano === 'sem_plano') {
        if (partnersWithPlanIds.has(partner.id)) return false;
      }

      // 5. Filter by Status do Plano
      if (statusEtapaPlano === 'iniciado') {
        if (!partnersWithIniciadoIds.has(partner.id)) return false;
      } else if (statusEtapaPlano === 'finalizado') {
        if (!partnersWithFinalizadoIds.has(partner.id)) return false;
      }

      // 6. Filter by Status de Conclusão
      if (statusConclusao === 'sucesso') {
        if (!partnersWithSucessoIds.has(partner.id)) return false;
      } else if (statusConclusao === 'sem_sucesso') {
        if (!partnersWithSemSucessoIds.has(partner.id)) return false;
      } else if (statusConclusao === 'nao_classificado') {
        if (!partnersWithNaoClassificadoIds.has(partner.id)) return false;
      }

      // 7. Filter by Fila (Retenção / Expansão)
      if (selectedFila !== 'todos') {
        if (partner.fila !== selectedFila) return false;
      }

      return true;
    };

    // Helper to check if a partner passes all filters except statusConclusao
    const partnerPassesFilterWithoutStatusConclusao = (partner: any) => {
      if (!partner) return false;

      // 1. Filter by Plano
      const planoVal = partner.segmento?.trim() || '';
      if (selectedPlanos.length > 0) {
        if (!selectedPlanos.includes(planoVal)) return false;
      }

      // 2. Filter by Gerente
      const managerObj = managersList.find((m: any) => m.id === partner.gerente_id);
      const managerName = managerObj?.nome || 'Sem Gerente';
      if (selectedGerentes.length > 0) {
        if (!selectedGerentes.includes(managerName)) return false;
      }

      // 3. Filter by Playbook Tipo (Todos / Playbooks novos / BAU)
      if (selectedPlaybookTipo === 'playbooks_novos') {
        if (!playbooksNovosPartnerIds.has(partner.id)) return false;
      } else if (selectedPlaybookTipo === 'bau') {
        if (playbooksNovosPartnerIds.has(partner.id)) return false;
      }

      // 4. Filter by Com Plano
      if (comPlano === 'com_plano') {
        if (!partnersWithPlanIds.has(partner.id)) return false;
      } else if (comPlano === 'sem_plano') {
        if (partnersWithPlanIds.has(partner.id)) return false;
      }

      // 5. Filter by Status do Plano
      if (statusEtapaPlano === 'iniciado') {
        if (!partnersWithIniciadoIds.has(partner.id)) return false;
      } else if (statusEtapaPlano === 'finalizado') {
        if (!partnersWithFinalizadoIds.has(partner.id)) return false;
      }

      // 6. Filter by Fila (Retenção / Expansão)
      if (selectedFila !== 'todos') {
        if (partner.fila !== selectedFila) return false;
      }

      return true;
    };

    const globalFilteredPartnerIds = new Set(partners.filter(partnerPassesFilterWithoutStatusConclusao).map(p => p.id));

    // Filtered list of partners
    const filteredPartners = partners.filter(partnerPassesFilter);
    const filteredPartnerIds = new Set(filteredPartners.map(p => p.id));

    // 1. "Execução por Gerente" calculations (using filtered partners)
    const partnersByManager = new Map<string, string[]>(); // gerente_id -> partner_ids[]
    filteredPartners.forEach(p => {
      if (p.gerente_id) {
        const list = partnersByManager.get(p.gerente_id) || [];
        list.push(p.id);
        partnersByManager.set(p.gerente_id, list);
      }
    });

    const plansByManager = new Map<string, any[]>(); // gerente_id -> plans[]
    plans.forEach(plan => {
      if (!filteredPartnerIds.has(plan.partner_id)) return;
      const partner = filteredPartners.find(p => p.id === plan.partner_id);
      if (partner && partner.gerente_id) {
        const mgrId = partner.gerente_id;
        const list = plansByManager.get(mgrId) || [];
        list.push(plan);
        plansByManager.set(mgrId, list);
      }
    });

    const delayedPlanIds = new Set<string>();
    tasks.forEach(t => {
      if (
        t.status !== 'concluida' &&
        t.data_conclusao_original &&
        t.data_conclusao_original < hoje
      ) {
        delayedPlanIds.add(t.plan_id);
      }
    });

    const stats: ManagerStat[] = managersList
      .map((user: any) => {
        const managerId = user.id;
        const partnersCount = (partnersByManager.get(managerId) || []).length;
        const activePlans = plansByManager.get(managerId) || [];
        const plansCount = new Set(activePlans.map((p: any) => p.partner_id)).size;
        
        const coverage = partnersCount > 0 ? (plansCount / partnersCount) * 100 : null;
        
        const delayedCount = new Set(activePlans.filter(p => delayedPlanIds.has(p.id)).map((p: any) => p.partner_id)).size;
        const onTimeCount = plansCount - delayedCount;

        return {
          id: managerId,
          nome: user.nome || 'Sem Nome',
          partnersCount,
          plansCount,
          coverage,
          delayedCount,
          onTimeCount
        };
      })
      .filter((stat: ManagerStat) => {
        if (selectedGerentes.length > 0) {
          return selectedGerentes.includes(stat.nome);
        }
        return true;
      });

    setManagerStats(stats);

    // 2. "Planos por Segmento" calculations (using filtered partners)
    const segmentsSet = new Set<string>();
    filteredPartners.forEach(p => {
      if (p.segmento && p.segmento.trim() !== '') {
        segmentsSet.add(p.segmento.trim());
      }
    });

    const partnersBySegment = new Map<string, string[]>();
    filteredPartners.forEach(p => {
      if (p.segmento && p.segmento.trim() !== '') {
        const seg = p.segmento.trim();
        const list = partnersBySegment.get(seg) || [];
        list.push(p.id);
        partnersBySegment.set(seg, list);
      }
    });

    const plansBySegment = new Map<string, any[]>();
    plans.forEach(plan => {
      if (!filteredPartnerIds.has(plan.partner_id)) return;
      const partner = filteredPartners.find(p => p.id === plan.partner_id);
      if (partner && partner.segmento && partner.segmento.trim() !== '') {
        const seg = partner.segmento.trim();
        const list = plansBySegment.get(seg) || [];
        list.push(plan);
        plansBySegment.set(seg, list);
      }
    });

    const calculatedSegmentStats: SegmentStat[] = Array.from(segmentsSet).map(seg => {
      const partnersCount = (partnersBySegment.get(seg) || []).length;
      const activePlans = plansBySegment.get(seg) || [];
      const plansCount = new Set(activePlans.map((p: any) => p.partner_id)).size;
      const coverage = partnersCount > 0 ? (plansCount / partnersCount) * 100 : null;

      return {
        segment: seg,
        partnersCount,
        plansCount,
        coverage
      };
    }).sort((a, b) => b.partnersCount - a.partnersCount);

    setSegmentStats(calculatedSegmentStats);

    // 3. "Planos Criados WoW" calculations (using filtered partners)
    const getMondayOfDate = (d: Date): string => {
      const dateCopy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
      const day = dateCopy.getDay();
      const diff = dateCopy.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dateCopy.setDate(diff));
      const y = monday.getFullYear();
      const m = String(monday.getMonth() + 1).padStart(2, '0');
      const rDay = String(monday.getDate()).padStart(2, '0');
      return `${y}-${m}-${rDay}`;
    };

    const getMondays = () => {
      const mondays: Date[] = [];
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const currentMonday = new Date(now.setDate(diff));
      currentMonday.setHours(12, 0, 0, 0);

      for (let i = 7; i >= 0; i--) {
        const d = new Date(currentMonday);
        d.setDate(d.getDate() - (i * 7));
        mondays.push(d);
      }
      return mondays;
    };

    const mondays = getMondays();
    const weekKeys = mondays.map(m => {
      const y = m.getFullYear();
      const mon = String(m.getMonth() + 1).padStart(2, '0');
      const d = String(m.getDate()).padStart(2, '0');
      return `${y}-${mon}-${d}`;
    });

    const calculatedWeeklyStats: WeeklyStat[] = weekKeys.map((key, idx) => {
      const m = mondays[idx];
      const label = `${String(m.getDate()).padStart(2, '0')}/${String(m.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label,
        count: 0,
        managers: {}
      };
    });

    weeklyPlansData.forEach(plan => {
      if (!plan.created_at) return;
      if (!filteredPartnerIds.has(plan.partner_id)) return;

      const planMondayKey = getMondayOfDate(new Date(plan.created_at));
      const weekStat = calculatedWeeklyStats.find(w => w.key === planMondayKey);
      if (weekStat) {
        weekStat.count += 1;
        const partnerObj = getSingularJoin(plan.partners);
        const managerName = partnerObj?.gerente || 'Sem Gerente';
        weekStat.managers[managerName] = (weekStat.managers[managerName] || 0) + 1;
      }
    });

    setWeeklyStats(calculatedWeeklyStats);

    // 4. Operational Reports cards (UNFILTERED AT THIS STAGE)
    const calculatedCompletedTasksWeekly: CompletedTasksWeeklyStat[] = weekKeys.map((key, idx) => {
      const m = mondays[idx];
      const label = `${String(m.getDate()).padStart(2, '0')}/${String(m.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label,
        total: 0,
        managers: {}
      };
    });

    const parseDateString = (dateStr: string): Date => {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        return new Date(y, m, d, 12, 0, 0);
      }
      return new Date(dateStr);
    };

    completedTasksData.forEach(task => {
      if (!task.data_conclusao_original) return;
      const planObj = getSingularJoin(task.plans);
      if (!planObj || !filteredPartnerIds.has(planObj.partner_id)) return;

      const dateObj = parseDateString(task.data_conclusao_original);
      const taskMondayKey = getMondayOfDate(dateObj);
      const weekStat = calculatedCompletedTasksWeekly.find(w => w.key === taskMondayKey);
      if (weekStat) {
        weekStat.total += 1;
        const partnerObj = getSingularJoin(planObj?.partners);
        const managerName = partnerObj?.gerente || 'Sem Gerente';
        weekStat.managers[managerName] = (weekStat.managers[managerName] || 0) + 1;
      }
    });

    setCompletedTasksStats(calculatedCompletedTasksWeekly);

    const calculatedDelayedTasksWeekly: CompletedTasksWeeklyStat[] = weekKeys.map((key, idx) => {
      const m = mondays[idx];
      const label = `${String(m.getDate()).padStart(2, '0')}/${String(m.getMonth() + 1).padStart(2, '0')}`;
      return {
        key,
        label,
        total: 0,
        managers: {}
      };
    });

    delayedTasksData.forEach(task => {
      if (!task.data_conclusao_original) return;
      const planObj = getSingularJoin(task.plans);
      if (!planObj || !filteredPartnerIds.has(planObj.partner_id)) return;

      const dateObj = parseDateString(task.data_conclusao_original);
      const taskMondayKey = getMondayOfDate(dateObj);
      const weekStat = calculatedDelayedTasksWeekly.find(w => w.key === taskMondayKey);
      if (weekStat) {
        weekStat.total += 1;
        const partnerObj = getSingularJoin(planObj?.partners);
        const managerName = partnerObj?.gerente || 'Sem Gerente';
        weekStat.managers[managerName] = (weekStat.managers[managerName] || 0) + 1;
      }
    });

    setDelayedTasksStats(calculatedDelayedTasksWeekly);

    const finishedPlansMap: Record<string, number> = {};
    finishedPlansRaw.forEach(plan => {
      if (!globalFilteredPartnerIds.has(plan.partner_id)) return;

      const nonDeletedTasks = (plan.tasks || []).filter((t: any) => !t.deletada_em);
      const todasTasksConcluidas = nonDeletedTasks.length > 0 && nonDeletedTasks.every((t: any) => t.status === 'concluida');

      if (plan.ativo === false || todasTasksConcluidas) {
        const partnerObj = getSingularJoin(plan.partners);
        const managerName = partnerObj?.gerente || 'Sem Gerente';
        finishedPlansMap[managerName] = (finishedPlansMap[managerName] || 0) + 1;
      }
    });

    const calculatedFinishedPlans: FinishedPlansStat[] = Object.entries(finishedPlansMap).map(([manager, count]) => ({
      manager,
      count
    })).sort((a, b) => b.count - a.count);

    setFinishedPlansStats(calculatedFinishedPlans);

    const tasksStatusMap: Record<string, { backlog: number; agenda: number; em_andamento: number; concluida: number; total: number }> = {};
    
    tasksForStatusRaw.forEach(task => {
      const planObj = getSingularJoin(task.plans);
      if (!planObj || !filteredPartnerIds.has(planObj.partner_id)) return;

      const partnerObj = getSingularJoin(planObj?.partners);
      const managerName = partnerObj?.gerente || 'Sem Gerente';
      const status = task.status;
      
      if (!tasksStatusMap[managerName]) {
        tasksStatusMap[managerName] = {
          backlog: 0,
          agenda: 0,
          em_andamento: 0,
          concluida: 0,
          total: 0
        };
      }
      
      if (status === 'backlog') {
        tasksStatusMap[managerName].backlog += 1;
        tasksStatusMap[managerName].total += 1;
      } else if (status === 'agenda') {
        tasksStatusMap[managerName].agenda += 1;
        tasksStatusMap[managerName].total += 1;
      } else if (status === 'em_andamento') {
        tasksStatusMap[managerName].em_andamento += 1;
        tasksStatusMap[managerName].total += 1;
      } else if (status === 'concluida') {
        tasksStatusMap[managerName].concluida += 1;
        tasksStatusMap[managerName].total += 1;
      }
    });

    const calculatedTasksStatus: TasksStatusStat[] = Object.entries(tasksStatusMap).map(([manager, counts]) => ({
      manager,
      ...counts
    })).sort((a, b) => b.total - a.total);

    setTasksStatusStats(calculatedTasksStatus);

    // Calculate Playbook Funnel statistics
    const pSnapshots = partnerSnapshots || [];
    let latestImportDate = '';
    pSnapshots.forEach((ps: any) => {
      if (!ps.imported_at) return;
      const dateStr = typeof ps.imported_at === 'string' ? ps.imported_at.split('T')[0] : String(ps.imported_at).substring(0, 10);
      if (!latestImportDate || dateStr > latestImportDate) {
        latestImportDate = dateStr;
      }
    });

    const latestPartnerIds = new Set<string>();
    if (latestImportDate) {
      pSnapshots.forEach((ps: any) => {
        if (!ps.imported_at) return;
        const dateStr = typeof ps.imported_at === 'string' ? ps.imported_at.split('T')[0] : String(ps.imported_at).substring(0, 10);
        if (dateStr === latestImportDate && ps.partner_id) {
          latestPartnerIds.add(ps.partner_id);
        }
      });
    }

    const funnelPartners = filteredPartners.filter((p: any) => {
      const partnerGerenteNorm = p.gerente ? p.gerente.trim().toLowerCase() : '';
      const hasValidGerente = partnerGerenteNorm !== '' && validUserNames.has(partnerGerenteNorm);
      if (!hasValidGerente) return false;

      if (latestPartnerIds.size > 0) {
        return latestPartnerIds.has(p.id);
      }
      return true;
    });
    const funnelPartnerIds = new Set(funnelPartners.map((p: any) => p.id));
    
    // 1. Parceiros no segmento
    const m1 = funnelPartners.length;

    // 2. Parceiros com plano criado (qualquer status, histórico incluído)
    const partnersWithPlanCreatedIds = new Set(
      basePlans
        .filter((p: any) => funnelPartnerIds.has(p.partner_id))
        .map((p: any) => p.partner_id)
    );
    const m2 = partnersWithPlanCreatedIds.size;

    // 3. Parceiros com plano ativo (plans.ativo = true)
    const partnersWithActivePlanIds = new Set(
      basePlans
        .filter((p: any) => p.ativo === true && funnelPartnerIds.has(p.partner_id))
        .map((p: any) => p.partner_id)
    );
    const m3 = partnersWithActivePlanIds.size;

    // 4. Parceiros com plano ativo mas atrasado (subset of item 3 with at least 1 task not completed, not deleted, and past data_conclusao_original)
    const delayedActivePlanIds = new Set(
      tasks
        .filter((t: any) => t.status !== 'concluida' && t.data_conclusao_original && t.data_conclusao_original < hoje)
        .map((t: any) => t.plan_id)
    );
    const activePlansOfFunnelPartners = basePlans.filter((p: any) => p.ativo === true && funnelPartnerIds.has(p.partner_id));
    const partnersWithActivePlanButDelayedIds = new Set(
      activePlansOfFunnelPartners
        .filter((p: any) => delayedActivePlanIds.has(p.id))
        .map((p: any) => p.partner_id)
    );
    const m4 = partnersWithActivePlanButDelayedIds.size;

    // 5. Parceiros com plano finalizado (at least one plan with ativo = false)
    const finishedPartnersSet = new Set<string>();
    basePlans.forEach((plan: any) => {
      if (!funnelPartnerIds.has(plan.partner_id)) return;
      if (plan.ativo === false) {
        finishedPartnersSet.add(plan.partner_id);
      }
    });
    const m5 = finishedPartnersSet.size;

    setFunnelStats({ m1, m2, m3, m4, m5 });

  }, [rawData, selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila]);

  const funnelLabel = useMemo(() => {
    if (selectedPlanos.length === 0) return 'Geral';
    if (selectedPlanos.length === 1) return selectedPlanos[0];
    return `Segmentos selecionados (${selectedPlanos.length})`;
  }, [selectedPlanos]);

  const historicalData = useMemo(() => {
    if (!rawData) return null;
    const fpSnapshots = rawData.funnelPartnerSnapshots || [];

    if (fpSnapshots.length === 0) {
      return { status: 'empty' as const, data: [] };
    }

    const selectedPlanosSet = new Set(selectedPlanos);
    const selectedGerentesNormSet = new Set(
      selectedGerentes.map(g => g.trim().toLowerCase()).filter(Boolean)
    );

    const partnerToPlansMap = new Map<string, any[]>();
    (rawData.basePlans || []).forEach((p: any) => {
      if (p && p.id && p.partner_id) {
        const list = partnerToPlansMap.get(p.partner_id) || [];
        list.push(p);
        partnerToPlansMap.set(p.partner_id, list);
      }
    });

    const planToTasksMap = new Map<string, any[]>();
    (rawData.tasks || []).forEach((t: any) => {
      if (t && t.plan_id && !t.deletada_em) {
        const list = planToTasksMap.get(t.plan_id) || [];
        list.push(t);
        planToTasksMap.set(t.plan_id, list);
      }
    });

    const playbooksNovosPartnerIds = new Set<string>();
    (rawData.basePlans || []).forEach((p: any) => {
      if (p.playbook_id != null && p.partner_id) {
        playbooksNovosPartnerIds.add(p.partner_id);
      }
    });

    const partnersWithPlanIds = new Set<string>(
      (rawData.basePlans || []).map((p: any) => (p && p.id && p.partner_id ? p.partner_id : null)).filter(Boolean)
    );

    const partnersWithIniciadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === true && pTasks.some((t: any) => t.status === 'concluida') && !todasTasksConcluidas) {
          partnersWithIniciadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithFinalizadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === false || todasTasksConcluidas) {
          partnersWithFinalizadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithSucessoIds = new Set<string>();
    const partnersWithSemSucessoIds = new Set<string>();
    const partnersWithNaoClassificadoIds = new Set<string>();

    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        if (p.status_conclusao === 'sucesso') {
          partnersWithSucessoIds.add(partnerId);
        }
        if (p.status_conclusao === 'sem_sucesso') {
          partnersWithSemSucessoIds.add(partnerId);
        }
        const pTasks = planToTasksMap.get(p.id) || [];
        if (
          pTasks.length > 0 &&
          pTasks.every((t: any) => t.status === 'concluida') &&
          (!p.status_conclusao || p.status_conclusao === '')
        ) {
          partnersWithNaoClassificadoIds.add(partnerId);
        }
      }
    });

    const partnerFilaMap = new Map<string, string>(
      (rawData.partners || []).map((p: any) => [p.id, p.fila]).filter(([id]) => Boolean(id))
    );

    const filteredRows = fpSnapshots.filter((s: any) => {
      // Ocultar a semana 2026-07-27 (primeiro snapshot, considerado incompleto)
      const rawSemana = s.semana;
      if (rawSemana) {
        const semanaKey = typeof rawSemana === 'string' ? rawSemana.split('T')[0] : String(rawSemana).substring(0, 10);
        if (semanaKey === '2026-07-27') {
          return false;
        }
      }

      // 1. Plano/Segmento filter
      if (selectedPlanosSet.size > 0) {
        if (!s.segmento || !selectedPlanosSet.has(s.segmento)) {
          return false;
        }
      }

      // 2. Gerente filter
      if (selectedGerentesNormSet.size > 0) {
        const rowGerenteNorm = (s.gerente || '').trim().toLowerCase();
        if (!rowGerenteNorm || !selectedGerentesNormSet.has(rowGerenteNorm)) {
          return false;
        }
      }

      // 3. Origem do Playbook filter
      if (selectedPlaybookTipo === 'playbooks_novos') {
        if (!s.partner_id || !playbooksNovosPartnerIds.has(s.partner_id)) {
          return false;
        }
      } else if (selectedPlaybookTipo === 'bau') {
        if (s.partner_id && playbooksNovosPartnerIds.has(s.partner_id)) {
          return false;
        }
      }

      // 4. Com Plano / Status do Plano filter
      if (comPlano === 'com_plano') {
        if (!s.partner_id || !partnersWithPlanIds.has(s.partner_id)) {
          return false;
        }
      } else if (comPlano === 'sem_plano') {
        if (s.partner_id && partnersWithPlanIds.has(s.partner_id)) {
          return false;
        }
      }

      if (statusEtapaPlano === 'iniciado') {
        if (!s.partner_id || !partnersWithIniciadoIds.has(s.partner_id)) {
          return false;
        }
      } else if (statusEtapaPlano === 'finalizado') {
        if (!s.partner_id || !partnersWithFinalizadoIds.has(s.partner_id)) {
          return false;
        }
      }

      // 5. Status de Conclusão filter
      if (statusConclusao === 'sucesso') {
        if (!s.partner_id || !partnersWithSucessoIds.has(s.partner_id)) {
          return false;
        }
      } else if (statusConclusao === 'sem_sucesso') {
        if (!s.partner_id || !partnersWithSemSucessoIds.has(s.partner_id)) {
          return false;
        }
      } else if (statusConclusao === 'nao_classificado') {
        if (!s.partner_id || !partnersWithNaoClassificadoIds.has(s.partner_id)) {
          return false;
        }
      }

      // 6. Fila filter
      if (selectedFila !== 'todos') {
        const partnerFila = partnerFilaMap.get(s.partner_id);
        if (partnerFila !== selectedFila) {
          return false;
        }
      }

      return true;
    });

    if (filteredRows.length === 0) {
      return { status: 'empty' as const, data: [] };
    }

    // Group by semana
    const weekMap = new Map<string, {
      parceirosNoSegmentoSet: Set<string>;
      parceirosComPlanoCriadoSet: Set<string>;
      parceirosFinalizadoSet: Set<string>;
    }>();

    filteredRows.forEach((s: any) => {
      const rawSemana = s.semana;
      if (!rawSemana) return;
      const semanaKey = typeof rawSemana === 'string' ? rawSemana.split('T')[0] : String(rawSemana).substring(0, 10);

      if (!weekMap.has(semanaKey)) {
        weekMap.set(semanaKey, {
          parceirosNoSegmentoSet: new Set(),
          parceirosComPlanoCriadoSet: new Set(),
          parceirosFinalizadoSet: new Set()
        });
      }

      const weekEntry = weekMap.get(semanaKey)!;
      if (s.partner_id) {
        weekEntry.parceirosNoSegmentoSet.add(s.partner_id);
        if (s.tem_plano_criado === true || s.tem_plano_criado === 'true') {
          weekEntry.parceirosComPlanoCriadoSet.add(s.partner_id);
        }
        if (s.tem_plano_finalizado === true || s.tem_plano_finalizado === 'true') {
          weekEntry.parceirosFinalizadoSet.add(s.partner_id);
        }
      }
    });

    const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => a.localeCompare(b));

    if (sortedWeeks.length === 0) {
      return { status: 'empty' as const, data: [] };
    }

    const columns = sortedWeeks.map(semanaKey => {
      const entry = weekMap.get(semanaKey)!;
      return {
        semana: semanaKey,
        parceiros_no_segmento: entry.parceirosNoSegmentoSet.size,
        parceiros_com_plano_criado: entry.parceirosComPlanoCriadoSet.size,
        parceiros_finalizado: entry.parceirosFinalizadoSet.size
      };
    });

    return { status: 'ok' as const, data: columns };
  }, [rawData, selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila]);

  const licenseCoverageData = useMemo(() => {
    if (!rawData) return { status: 'loading' as const, data: [] };
    const fpSnapshots = rawData.funnelPartnerSnapshots || [];
    const pSnapshots = rawData.partnerSnapshots || [];

    if (fpSnapshots.length === 0) {
      return { status: 'empty' as const, data: [] };
    }

    const selectedPlanosSet = new Set(selectedPlanos);
    const selectedGerentesNormSet = new Set(
      selectedGerentes.map(g => g.trim().toLowerCase()).filter(Boolean)
    );
    const playbooksNovosPartnerIds = new Set<string>();
    (rawData.basePlans || []).forEach((p: any) => {
      if (p.playbook_id != null && p.partner_id) {
        playbooksNovosPartnerIds.add(p.partner_id);
      }
    });
    const partnersWithPlanIds = new Set<string>(
      (rawData.basePlans || []).map((p: any) => p.partner_id).filter(Boolean)
    );
    const partnerFilaMap = new Map<string, string>(
      (rawData.partners || []).map((p: any) => [p.id, p.fila]).filter(([id]) => Boolean(id))
    );

    // Filter by Segmento, Gerente and Origem do Playbook (ignores global planoExistente)
    const filteredRows = fpSnapshots.filter((s: any) => {
      // Ocultar a semana 2026-07-27 (primeiro snapshot, considerado incompleto)
      const rawSemana = s.semana;
      if (rawSemana) {
        const semanaKey = typeof rawSemana === 'string' ? rawSemana.split('T')[0] : String(rawSemana).substring(0, 10);
        if (semanaKey === '2026-07-27') {
          return false;
        }
      }

      if (selectedPlanosSet.size > 0) {
        if (!s.segmento || !selectedPlanosSet.has(s.segmento)) {
          return false;
        }
      }

      if (selectedGerentesNormSet.size > 0) {
        const rowGerenteNorm = (s.gerente || '').trim().toLowerCase();
        if (!rowGerenteNorm || !selectedGerentesNormSet.has(rowGerenteNorm)) {
          return false;
        }
      }

      if (selectedPlaybookTipo === 'playbooks_novos') {
        if (!s.partner_id || !playbooksNovosPartnerIds.has(s.partner_id)) {
          return false;
        }
      } else if (selectedPlaybookTipo === 'bau') {
        if (s.partner_id && playbooksNovosPartnerIds.has(s.partner_id)) {
          return false;
        }
      }

      if (selectedFila !== 'todos') {
        const partnerFila = partnerFilaMap.get(s.partner_id);
        if (partnerFila !== selectedFila) {
          return false;
        }
      }

      return true;
    });

    if (filteredRows.length === 0) {
      return { status: 'empty' as const, data: [] };
    }

    // Pre-process partner_snapshots: group by partner_id and sort by imported_at asc
    const snapshotsByPartner = new Map<string, Array<{
      importedAtDateStr: string;
      licencas: number;
      licencas_engajadas: number;
    }>>();

    pSnapshots.forEach((ps: any) => {
      if (!ps.partner_id || !ps.imported_at) return;
      const dateStr = typeof ps.imported_at === 'string'
        ? ps.imported_at.split('T')[0]
        : String(ps.imported_at).substring(0, 10);

      const list = snapshotsByPartner.get(ps.partner_id) || [];
      list.push({
        importedAtDateStr: dateStr,
        licencas: Number(ps.licencas) || 0,
        licencas_engajadas: Number(ps.licencas_engajadas) || 0
      });
      snapshotsByPartner.set(ps.partner_id, list);
    });

    snapshotsByPartner.forEach((list) => {
      list.sort((a, b) => a.importedAtDateStr.localeCompare(b.importedAtDateStr));
    });

    // Group filteredRows by semana into two Sets of partner_ids: Com Plano vs Sem Plano
    const weekMapCom = new Map<string, Set<string>>();
    const weekMapSem = new Map<string, Set<string>>();
    const allWeeksSet = new Set<string>();

    filteredRows.forEach((s: any) => {
      const rawSemana = s.semana;
      if (!rawSemana || !s.partner_id) return;
      const semanaKey = typeof rawSemana === 'string' ? rawSemana.split('T')[0] : String(rawSemana).substring(0, 10);

      allWeeksSet.add(semanaKey);

      if (partnersWithPlanIds.has(s.partner_id)) {
        if (!weekMapCom.has(semanaKey)) weekMapCom.set(semanaKey, new Set());
        weekMapCom.get(semanaKey)!.add(s.partner_id);
      } else {
        if (!weekMapSem.has(semanaKey)) weekMapSem.set(semanaKey, new Set());
        weekMapSem.get(semanaKey)!.add(s.partner_id);
      }
    });

    const sortedWeeks = Array.from(allWeeksSet).sort((a, b) => a.localeCompare(b));

    if (sortedWeeks.length === 0) {
      return { status: 'empty' as const, data: [] };
    }

    const columns = sortedWeeks.map(semanaKey => {
      const comPartnerIds = weekMapCom.get(semanaKey) || new Set();
      const semPartnerIds = weekMapSem.get(semanaKey) || new Set();

      // Calculation for Com Plano
      let totalCobertasCom = 0;
      let totalEngajadasCom = 0;
      comPartnerIds.forEach(partnerId => {
        const partnerSnaps = snapshotsByPartner.get(partnerId);
        if (!partnerSnaps || partnerSnaps.length === 0) return;
        let validSnap: { licencas: number; licencas_engajadas: number } | null = null;
        for (let i = partnerSnaps.length - 1; i >= 0; i--) {
          if (partnerSnaps[i].importedAtDateStr <= semanaKey) {
            validSnap = partnerSnaps[i];
            break;
          }
        }
        if (validSnap) {
          totalCobertasCom += validSnap.licencas;
          totalEngajadasCom += validSnap.licencas_engajadas;
        }
      });
      const desengajadasCom = totalCobertasCom - totalEngajadasCom;
      const taxaEngajamentoCom = totalCobertasCom > 0 ? (totalEngajadasCom / totalCobertasCom) * 100 : null;

      // Calculation for Sem Plano
      let totalCobertasSem = 0;
      let totalEngajadasSem = 0;
      semPartnerIds.forEach(partnerId => {
        const partnerSnaps = snapshotsByPartner.get(partnerId);
        if (!partnerSnaps || partnerSnaps.length === 0) return;
        let validSnap: { licencas: number; licencas_engajadas: number } | null = null;
        for (let i = partnerSnaps.length - 1; i >= 0; i--) {
          if (partnerSnaps[i].importedAtDateStr <= semanaKey) {
            validSnap = partnerSnaps[i];
            break;
          }
        }
        if (validSnap) {
          totalCobertasSem += validSnap.licencas;
          totalEngajadasSem += validSnap.licencas_engajadas;
        }
      });
      const desengajadasSem = totalCobertasSem - totalEngajadasSem;
      const taxaEngajamentoSem = totalCobertasSem > 0 ? (totalEngajadasSem / totalCobertasSem) * 100 : null;

      // Total (Com + Sem)
      const totalCobertasTotal = totalCobertasCom + totalCobertasSem;
      const totalEngajadasTotal = totalEngajadasCom + totalEngajadasSem;
      const desengajadasTotal = totalCobertasTotal - totalEngajadasTotal;
      const taxaEngajamentoTotal = totalCobertasTotal > 0 ? (totalEngajadasTotal / totalCobertasTotal) * 100 : null;

      return {
        semana: semanaKey,
        licencas_cobertas_total: totalCobertasTotal,
        licencas_cobertas_com: totalCobertasCom,
        licencas_cobertas_sem: totalCobertasSem,
        licencas_desengajadas_total: desengajadasTotal < 0 ? 0 : desengajadasTotal,
        licencas_desengajadas_com: desengajadasCom < 0 ? 0 : desengajadasCom,
        licencas_desengajadas_sem: desengajadasSem < 0 ? 0 : desengajadasSem,
        taxa_engajamento_total: taxaEngajamentoTotal,
        taxa_engajamento_com: taxaEngajamentoCom,
        taxa_engajamento_sem: taxaEngajamentoSem,
      };
    });

    return { status: 'ok' as const, data: columns };
  }, [rawData, selectedPlanos, selectedGerentes, selectedPlaybookTipo, selectedFila]);

  // Ranking de Planos de Retenção por Tipo (Segmento Histórico no momento da criação do plano S0 que começa com 'R')
  const retentionPlanRanking = useMemo(() => {
    if (!rawData) {
      return { status: 'loading' as const, ranking: [] };
    }

    const { basePlans, partnerSnapshots } = rawData;

    // Helper functions para data
    const getMondayOfWeek = (dateStr: string): string => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return '';
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(Date.UTC(year, month, day, 12, 0, 0));
      const dayOfWeek = date.getUTCDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      date.setUTCDate(date.getUTCDate() + diff);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const addDays = (dateStr: string, days: number): string => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const date = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0));
      date.setUTCDate(date.getUTCDate() + days);
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    // Pre-process partner_snapshots by partner_id sorted by imported_at
    const snapshotsByPartner = new Map<string, Array<{
      importedAtDateStr: string;
      plano: string | null;
    }>>();

    (partnerSnapshots || []).forEach((ps: any) => {
      if (!ps.partner_id || !ps.imported_at) return;
      const dateStr = typeof ps.imported_at === 'string'
        ? ps.imported_at.split('T')[0]
        : String(ps.imported_at).substring(0, 10);

      const list = snapshotsByPartner.get(ps.partner_id) || [];
      list.push({
        importedAtDateStr: dateStr,
        plano: ps.plano ? String(ps.plano).trim() : null
      });
      snapshotsByPartner.set(ps.partner_id, list);
    });

    snapshotsByPartner.forEach((list) => {
      list.sort((a, b) => a.importedAtDateStr.localeCompare(b.importedAtDateStr));
    });

    // Helper to get partner's locked historical plano at S0
    const getPartnerPlanoAtS0 = (partnerId: string, semanaEntrada: string): string | null => {
      const partnerSnaps = snapshotsByPartner.get(partnerId);
      if (!partnerSnaps || partnerSnaps.length === 0) return null;
      const dataRefS0 = addDays(semanaEntrada, 6);
      let validSnap: { plano: string | null } | null = null;
      for (let i = partnerSnaps.length - 1; i >= 0; i--) {
        if (partnerSnaps[i].importedAtDateStr <= dataRefS0) {
          validSnap = partnerSnaps[i];
          break;
        }
      }
      return validSnap?.plano || null;
    };

    // Agrupamento por tipo de plano (todos os segmentos históricos)
    const typeMap = new Map<string, { createdPlans: number; partnersSet: Set<string> }>();

    (basePlans || []).forEach((p: any) => {
      if (!p || !p.partner_id || !p.created_at) return;

      const entryDate = typeof p.created_at === 'string' ? p.created_at.split('T')[0] : String(p.created_at).substring(0, 10);
      if (!entryDate) return;

      const semanaEntrada = getMondayOfWeek(entryDate);
      if (!semanaEntrada) return;

      const historicalPlano = getPartnerPlanoAtS0(p.partner_id, semanaEntrada);
      if (!historicalPlano) return;

      const trimmedPlano = historicalPlano.trim().toUpperCase();

      const current = typeMap.get(trimmedPlano) || { createdPlans: 0, partnersSet: new Set<string>() };
      current.createdPlans += 1;
      current.partnersSet.add(p.partner_id);
      typeMap.set(trimmedPlano, current);
    });

    const ranking = Array.from(typeMap.entries()).map(([tipo, data]) => ({
      tipo,
      totalPartners: data.partnersSet.size,
      createdPlans: data.createdPlans
    })).sort((a, b) => b.createdPlans - a.createdPlans);

    return {
      status: 'ok' as const,
      ranking
    };
  }, [rawData]);

  const chartWeeklyData = useMemo(() => {
    const colors = weeklyStats.map((_, idx) => 
      idx === weeklyStats.length - 1 ? '#4f46e5' : 'rgba(99, 102, 241, 0.25)'
    );
    const hoverColors = weeklyStats.map((_, idx) => 
      idx === weeklyStats.length - 1 ? '#4338ca' : 'rgba(99, 102, 241, 0.45)'
    );
    return {
      labels: weeklyStats.map(w => w.label),
      datasets: [
        {
          label: 'Planos Criados',
          data: weeklyStats.map(w => w.count),
          backgroundColor: colors,
          hoverBackgroundColor: hoverColors,
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.8
        }
      ]
    };
  }, [weeklyStats]);

  const partnerSnapshotsData = useMemo(() => {
    if (!rawData || !rawData.partnerSnapshots) {
      return {
        labels: [],
        totalLicencas: [],
        engajadasLicencas: [],
        taxaEngajamento: [],
        hasData: false,
        latestKpis: { totalLicencas: 0, engajadasLicencas: 0, taxaEngajamento: 0 },
        insightText: ''
      };
    }

    const { partnerSnapshots, partners, basePlans, tasks, managersList, allUsers } = rawData;

    const validUserNames = new Set(
      (allUsers || managersList || []).map((u: any) => (u.nome || '').trim().toLowerCase()).filter(Boolean)
    );

    const playbooksNovosPartnerIds = new Set<string>();
    (basePlans || []).forEach((p: any) => {
      if (p.playbook_id != null && p.partner_id) {
        playbooksNovosPartnerIds.add(p.partner_id);
      }
    });

    const partnerToPlansMap = new Map<string, any[]>();
    (basePlans || []).forEach((p: any) => {
      if (p && p.id && p.partner_id) {
        const list = partnerToPlansMap.get(p.partner_id) || [];
        list.push(p);
        partnerToPlansMap.set(p.partner_id, list);
      }
    });

    const planToTasksMap = new Map<string, any[]>();
    (tasks || []).forEach((t: any) => {
      if (t && t.plan_id && !t.deletada_em) {
        const list = planToTasksMap.get(t.plan_id) || [];
        list.push(t);
        planToTasksMap.set(t.plan_id, list);
      }
    });

    const partnersWithPlanIds = new Set<string>(
      (basePlans || []).map((p: any) => (p && p.id && p.partner_id ? p.partner_id : null)).filter(Boolean)
    );

    const partnersWithIniciadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === true && pTasks.some((t: any) => t.status === 'concluida') && !todasTasksConcluidas) {
          partnersWithIniciadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithFinalizadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === false || todasTasksConcluidas) {
          partnersWithFinalizadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithSucessoIds = new Set<string>();
    const partnersWithSemSucessoIds = new Set<string>();
    const partnersWithNaoClassificadoIds = new Set<string>();

    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        if (p.status_conclusao === 'sucesso') {
          partnersWithSucessoIds.add(partnerId);
        }
        if (p.status_conclusao === 'sem_sucesso') {
          partnersWithSemSucessoIds.add(partnerId);
        }
        const pTasks = planToTasksMap.get(p.id) || [];
        if (
          pTasks.length > 0 &&
          pTasks.every((t: any) => t.status === 'concluida') &&
          (!p.status_conclusao || p.status_conclusao === '')
        ) {
          partnersWithNaoClassificadoIds.add(partnerId);
        }
      }
    });

    const partnerPassesFilter = (partner: any) => {
      if (!partner) return false;

      // Restringir a parceiros cujo gerente corresponde a um usuário real cadastrado
      const partnerGerenteNorm = partner.gerente ? partner.gerente.trim().toLowerCase() : '';
      if (!partnerGerenteNorm || !validUserNames.has(partnerGerenteNorm)) {
        return false;
      }

      const planoVal = partner.segmento?.trim() || '';
      if (selectedPlanos.length > 0) {
        if (!selectedPlanos.includes(planoVal)) return false;
      }

      const managerObj = (managersList || []).find((m: any) => m.id === partner.gerente_id);
      const managerName = managerObj?.nome || 'Sem Gerente';
      if (selectedGerentes.length > 0) {
        if (!selectedGerentes.includes(managerName)) return false;
      }

      if (selectedPlaybookTipo === 'playbooks_novos') {
        if (!playbooksNovosPartnerIds.has(partner.id)) return false;
      } else if (selectedPlaybookTipo === 'bau') {
        if (playbooksNovosPartnerIds.has(partner.id)) return false;
      }

      if (comPlano === 'com_plano') {
        if (!partnersWithPlanIds.has(partner.id)) return false;
      } else if (comPlano === 'sem_plano') {
        if (partnersWithPlanIds.has(partner.id)) return false;
      }

      if (statusEtapaPlano === 'iniciado') {
        if (!partnersWithIniciadoIds.has(partner.id)) return false;
      } else if (statusEtapaPlano === 'finalizado') {
        if (!partnersWithFinalizadoIds.has(partner.id)) return false;
      }

      // Filter by Status de Conclusão
      if (statusConclusao === 'sucesso') {
        if (!partnersWithSucessoIds.has(partner.id)) return false;
      } else if (statusConclusao === 'sem_sucesso') {
        if (!partnersWithSemSucessoIds.has(partner.id)) return false;
      } else if (statusConclusao === 'nao_classificado') {
        if (!partnersWithNaoClassificadoIds.has(partner.id)) return false;
      }

      if (selectedFila !== 'todos') {
        if (partner.fila !== selectedFila) return false;
      }

      return true;
    };

    const filteredPartners = (partners || []).filter(partnerPassesFilter);
    const filteredPartnerIds = new Set(filteredPartners.map(p => p.id));

    const snapshotByDateMap = new Map<string, { totalLicencas: number; engajadasLicencas: number }>();

    partnerSnapshots.forEach((ps: any) => {
      if (!filteredPartnerIds.has(ps.partner_id)) return;
      if (ps.import_completo === false) return;
      const rawDate = ps.imported_at;
      if (!rawDate) return;
      const dateKey = typeof rawDate === 'string' ? rawDate.split('T')[0] : String(rawDate).substring(0, 10);

      const current = snapshotByDateMap.get(dateKey) || { totalLicencas: 0, engajadasLicencas: 0 };
      current.totalLicencas += Number(ps.licencas) || 0;
      current.engajadasLicencas += Number(ps.licencas_engajadas) || 0;
      snapshotByDateMap.set(dateKey, current);
    });

    let sortedDates = Array.from(snapshotByDateMap.keys()).sort((a, b) => a.localeCompare(b));

    // Janela "Últimas X importações"
    if (historicImportCount === '4') {
      sortedDates = sortedDates.slice(-4);
    } else if (historicImportCount === '8') {
      sortedDates = sortedDates.slice(-8);
    }

    const labels = sortedDates.map(dateStr => {
      const cleanDate = dateStr.split('T')[0];
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      return dateStr;
    });

    const totalLicencas = sortedDates.map(d => snapshotByDateMap.get(d)!.totalLicencas);
    const engajadasLicencas = sortedDates.map(d => snapshotByDateMap.get(d)!.engajadasLicencas);
    const taxaEngajamento = sortedDates.map(d => {
      const item = snapshotByDateMap.get(d)!;
      if (item.totalLicencas > 0) {
        return Number(((item.engajadasLicencas / item.totalLicencas) * 100).toFixed(1));
      }
      return 0;
    });

    const hasData = sortedDates.length > 0;

    let latestKpis = { totalLicencas: 0, engajadasLicencas: 0, taxaEngajamento: 0 };
    let insightText = '';

    if (hasData) {
      const latestIdx = sortedDates.length - 1;
      const latestTotal = totalLicencas[latestIdx];
      const latestEngaged = engajadasLicencas[latestIdx];
      const latestPct = taxaEngajamento[latestIdx];

      latestKpis = {
        totalLicencas: latestTotal,
        engajadasLicencas: latestEngaged,
        taxaEngajamento: latestPct
      };

      // Cálculo do insight dinâmico
      const minPct = Math.min(...taxaEngajamento);
      const minIndex = taxaEngajamento.indexOf(minPct);
      const minDateLabel = labels[minIndex];

      const maxPct = Math.max(...taxaEngajamento);

      if (sortedDates.length > 1) {
        const diffPP = Number((latestPct - minPct).toFixed(1));
        if (diffPP > 0 && latestIdx !== minIndex) {
          insightText = `O engajamento recuperou ${diffPP.toString().replace('.', ',')} p.p. desde ${minDateLabel} e se mantém em ${latestPct.toString().replace('.', ',')}%.`;
        } else if (diffPP === 0 && minPct === maxPct) {
          insightText = `O engajamento se manteve estável em ${latestPct.toString().replace('.', ',')}% durante todo o período visível.`;
        } else {
          const maxIndex = taxaEngajamento.indexOf(maxPct);
          const maxDateLabel = labels[maxIndex];
          const diffDrop = Number((maxPct - latestPct).toFixed(1));
          if (diffDrop > 0) {
            insightText = `O engajamento recuou ${diffDrop.toString().replace('.', ',')} p.p. em relação ao pico de ${maxPct.toString().replace('.', ',')}% em ${maxDateLabel} e se mantém em ${latestPct.toString().replace('.', ',')}%.`;
          } else {
            insightText = `O engajamento atual está em ${latestPct.toString().replace('.', ',')}%, variando ${diffPP.toString().replace('.', ',')} p.p. em relação ao menor ponto do período (${minDateLabel}).`;
          }
        }
      } else {
        insightText = `Engajamento atual em ${latestPct.toString().replace('.', ',')}% para a importação de ${labels[0]}.`;
      }
    }

    return {
      labels,
      totalLicencas,
      engajadasLicencas,
      taxaEngajamento,
      hasData,
      latestKpis,
      insightText
    };
  }, [rawData, selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila, historicImportCount]);

  // Evolução das Faixas de Engajamento por data de importação
  const engagementTiersData = useMemo(() => {
    if (!rawData || !rawData.partnerSnapshots) {
      return {
        labels: [],
        pctAbaixo50: [],
        pctAbaixo75: [],
        pctAcima75: [],
        hasData: false,
        latestKpis: { pctAbaixo50: 0, pctAbaixo75: 0, pctAcima75: 0, totalParceiros: 0 }
      };
    }

    const { partnerSnapshots, partners, basePlans, tasks, managersList, allUsers } = rawData;

    const validUserNames = new Set(
      (allUsers || managersList || []).map((u: any) => (u.nome || '').trim().toLowerCase()).filter(Boolean)
    );

    const playbooksNovosPartnerIds = new Set<string>();
    (basePlans || []).forEach((p: any) => {
      if (p.playbook_id != null && p.partner_id) {
        playbooksNovosPartnerIds.add(p.partner_id);
      }
    });

    const partnerToPlansMap = new Map<string, any[]>();
    (basePlans || []).forEach((p: any) => {
      if (p && p.id && p.partner_id) {
        const list = partnerToPlansMap.get(p.partner_id) || [];
        list.push(p);
        partnerToPlansMap.set(p.partner_id, list);
      }
    });

    const planToTasksMap = new Map<string, any[]>();
    (tasks || []).forEach((t: any) => {
      if (t && t.plan_id && !t.deletada_em) {
        const list = planToTasksMap.get(t.plan_id) || [];
        list.push(t);
        planToTasksMap.set(t.plan_id, list);
      }
    });

    const partnersWithPlanIds = new Set<string>(
      (basePlans || []).map((p: any) => (p && p.id && p.partner_id ? p.partner_id : null)).filter(Boolean)
    );

    const partnersWithIniciadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === true && pTasks.some((t: any) => t.status === 'concluida') && !todasTasksConcluidas) {
          partnersWithIniciadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithFinalizadoIds = new Set<string>();
    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        const pTasks = planToTasksMap.get(p.id) || [];
        const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t: any) => t.status === 'concluida');
        if (p.ativo === false || todasTasksConcluidas) {
          partnersWithFinalizadoIds.add(partnerId);
          break;
        }
      }
    });

    const partnersWithSucessoIds = new Set<string>();
    const partnersWithSemSucessoIds = new Set<string>();
    const partnersWithNaoClassificadoIds = new Set<string>();

    partnerToPlansMap.forEach((pList, partnerId) => {
      for (const p of pList) {
        if (p.status_conclusao === 'sucesso') {
          partnersWithSucessoIds.add(partnerId);
        }
        if (p.status_conclusao === 'sem_sucesso') {
          partnersWithSemSucessoIds.add(partnerId);
        }
        const pTasks = planToTasksMap.get(p.id) || [];
        if (
          pTasks.length > 0 &&
          pTasks.every((t: any) => t.status === 'concluida') &&
          (!p.status_conclusao || p.status_conclusao === '')
        ) {
          partnersWithNaoClassificadoIds.add(partnerId);
        }
      }
    });

    const partnerPassesFilter = (partner: any) => {
      if (!partner) return false;

      const partnerGerenteNorm = partner.gerente ? partner.gerente.trim().toLowerCase() : '';
      if (!partnerGerenteNorm || !validUserNames.has(partnerGerenteNorm)) {
        return false;
      }

      const planoVal = partner.segmento?.trim() || '';
      if (selectedPlanos.length > 0) {
        if (!selectedPlanos.includes(planoVal)) return false;
      }

      const managerObj = (managersList || []).find((m: any) => m.id === partner.gerente_id);
      const managerName = managerObj?.nome || 'Sem Gerente';
      if (selectedGerentes.length > 0) {
        if (!selectedGerentes.includes(managerName)) return false;
      }

      if (selectedPlaybookTipo === 'playbooks_novos') {
        if (!playbooksNovosPartnerIds.has(partner.id)) return false;
      } else if (selectedPlaybookTipo === 'bau') {
        if (playbooksNovosPartnerIds.has(partner.id)) return false;
      }

      if (comPlano === 'com_plano') {
        if (!partnersWithPlanIds.has(partner.id)) return false;
      } else if (comPlano === 'sem_plano') {
        if (partnersWithPlanIds.has(partner.id)) return false;
      }

      if (statusEtapaPlano === 'iniciado') {
        if (!partnersWithIniciadoIds.has(partner.id)) return false;
      } else if (statusEtapaPlano === 'finalizado') {
        if (!partnersWithFinalizadoIds.has(partner.id)) return false;
      }

      if (statusConclusao === 'sucesso') {
        if (!partnersWithSucessoIds.has(partner.id)) return false;
      } else if (statusConclusao === 'sem_sucesso') {
        if (!partnersWithSemSucessoIds.has(partner.id)) return false;
      } else if (statusConclusao === 'nao_classificado') {
        if (!partnersWithNaoClassificadoIds.has(partner.id)) return false;
      }

      if (selectedFila !== 'todos') {
        if (partner.fila !== selectedFila) return false;
      }

      return true;
    };

    const filteredPartners = (partners || []).filter(partnerPassesFilter);
    const filteredPartnerIds = new Set(filteredPartners.map(p => p.id));

    // Agrupar snapshots por data e por parceiro
    // dateKey -> Map<partner_id, { licencas: number, licencas_engajadas: number }>
    const snapshotsByDate = new Map<string, Map<string, { licencas: number; licencas_engajadas: number }>>();

    partnerSnapshots.forEach((ps: any) => {
      if (!filteredPartnerIds.has(ps.partner_id)) return;
      if (ps.import_completo === false) return;
      const rawDate = ps.imported_at;
      if (!rawDate) return;
      const dateKey = typeof rawDate === 'string' ? rawDate.split('T')[0] : String(rawDate).substring(0, 10);

      let dateMap = snapshotsByDate.get(dateKey);
      if (!dateMap) {
        dateMap = new Map();
        snapshotsByDate.set(dateKey, dateMap);
      }

      // Consolidar se houver múltiplos registros do mesmo parceiro na mesma data
      const prev = dateMap.get(ps.partner_id) || { licencas: 0, licencas_engajadas: 0 };
      dateMap.set(ps.partner_id, {
        licencas: prev.licencas + (Number(ps.licencas) || 0),
        licencas_engajadas: prev.licencas_engajadas + (Number(ps.licencas_engajadas) || 0)
      });
    });

    let sortedDates = Array.from(snapshotsByDate.keys()).sort((a, b) => a.localeCompare(b));

    if (historicImportCount === '4') {
      sortedDates = sortedDates.slice(-4);
    } else if (historicImportCount === '8') {
      sortedDates = sortedDates.slice(-8);
    }

    const labels = sortedDates.map(dateStr => {
      const cleanDate = dateStr.split('T')[0];
      const parts = cleanDate.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      return dateStr;
    });

    const pctAbaixo50: number[] = [];
    const pctAbaixo75: number[] = [];
    const pctAcima75: number[] = [];
    let latestTotalParceiros = 0;

    sortedDates.forEach((d, idx) => {
      const partnerMap = snapshotsByDate.get(d)!;
      let countValid = 0;
      let countBelow50 = 0;
      let countBelow75 = 0;
      let countAbove75 = 0;

      partnerMap.forEach(({ licencas, licencas_engajadas }) => {
        // Ignorar parceiros com licencas <= 0 (sem dado válido para engajamento)
        if (licencas <= 0) return;

        countValid += 1;
        const pctEng = (licencas_engajadas / licencas) * 100;

        if (pctEng < 50) {
          countBelow50 += 1;
        }
        if (pctEng < 75) {
          countBelow75 += 1;
        } else {
          countAbove75 += 1;
        }
      });

      if (countValid > 0) {
        const valBelow50 = Number(((countBelow50 / countValid) * 100).toFixed(1));
        const valBelow75 = Number(((countBelow75 / countValid) * 100).toFixed(1));
        // Garantir que pctAbaixo75 + pctAcima75 = 100.0%
        const valAbove75 = Number((100 - valBelow75).toFixed(1));

        pctAbaixo50.push(valBelow50);
        pctAbaixo75.push(valBelow75);
        pctAcima75.push(valAbove75);
      } else {
        pctAbaixo50.push(0);
        pctAbaixo75.push(0);
        pctAcima75.push(0);
      }

      if (idx === sortedDates.length - 1) {
        latestTotalParceiros = countValid;
      }
    });

    const hasData = sortedDates.length > 0;
    const latestIdx = sortedDates.length - 1;
    const latestKpis = hasData ? {
      pctAbaixo50: pctAbaixo50[latestIdx] || 0,
      pctAbaixo75: pctAbaixo75[latestIdx] || 0,
      pctAcima75: pctAcima75[latestIdx] || 0,
      totalParceiros: latestTotalParceiros
    } : { pctAbaixo50: 0, pctAbaixo75: 0, pctAcima75: 0, totalParceiros: 0 };

    return {
      labels,
      pctAbaixo50,
      pctAbaixo75,
      pctAcima75,
      hasData,
      latestKpis
    };
  }, [rawData, selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila, historicImportCount]);

  const chartEngagementTiersData = useMemo(() => {
    return {
      labels: engagementTiersData.labels,
      datasets: [
        {
          label: '% < 50% (Crítico)',
          data: engagementTiersData.pctAbaixo50,
          borderColor: '#ef4444',
          backgroundColor: '#ef4444',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#ef4444',
          pointHoverRadius: 6,
          tension: 0.2,
        },
        {
          label: '% < 75% (Abaixo da Meta - Cumulativo)',
          data: engagementTiersData.pctAbaixo75,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#f59e0b',
          pointHoverRadius: 6,
          tension: 0.2,
        },
        {
          label: '% ≥ 75% (Meta Atingida)',
          data: engagementTiersData.pctAcima75,
          borderColor: '#10b981',
          backgroundColor: '#10b981',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#10b981',
          pointHoverRadius: 6,
          tension: 0.2,
        },
      ],
    };
  }, [engagementTiersData]);

  const chartEngagementTiersOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#f1f5f9',
          padding: 12,
          cornerRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              return `${label}: ${val != null ? val.toFixed(1).replace('.', ',') : '0,0'}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#64748b',
          },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: {
            display: true,
            text: '% de Parceiros',
            font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
            color: '#64748b',
          },
          grid: { color: 'rgba(226, 232, 240, 0.4)' },
          ticks: {
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#64748b',
            callback: (value: any) => `${value}%`,
          },
          min: 0,
          max: 100,
        },
      },
    };
  }, []);

  const chartEngagementTiersPlugins = useMemo(() => [
    {
      id: 'floating-data-labels-tiers',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          
          meta.data.forEach((point: any, index: number) => {
            const val = dataset.data[index];
            if (val === undefined || val === null) return;
            
            const text = `${val.toFixed(1).replace('.', ',')}%`;
            
            ctx.font = '600 10px Inter, sans-serif';
            const textWidth = ctx.measureText(text).width;
            const paddingX = 5;
            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 16;
            
            let yOffset = -22;
            if (datasetIndex === 0) yOffset = 10;
            if (datasetIndex === 1) yOffset = -22;
            if (datasetIndex === 2) yOffset = -24;
            
            const boxX = point.x - boxWidth / 2;
            const boxY = point.y + yOffset - boxHeight / 2;
            
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, point.x, point.y + yOffset);
          });
        });
        
        ctx.restore();
      }
    }
  ], []);

  const chartLicenseHistoryData = useMemo(() => {
    return {
      labels: partnerSnapshotsData.labels,
      datasets: [
        {
          label: 'Licenças Totais',
          data: partnerSnapshotsData.totalLicencas,
          borderColor: '#6366f1',
          backgroundColor: '#6366f1',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#6366f1',
          pointHoverRadius: 6,
          tension: 0.2,
          yAxisID: 'y',
        },
        {
          label: 'Licenças Engajadas',
          data: partnerSnapshotsData.engajadasLicencas,
          borderColor: '#10b981',
          backgroundColor: '#10b981',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#10b981',
          pointHoverRadius: 6,
          tension: 0.2,
          yAxisID: 'y',
        },
        {
          label: '% de Engajamento',
          data: partnerSnapshotsData.taxaEngajamento,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          borderWidth: 2.5,
          borderDash: [5, 5],
          pointRadius: 4,
          pointBackgroundColor: '#f59e0b',
          pointHoverRadius: 6,
          tension: 0.2,
          yAxisID: 'y1',
        },
      ],
    };
  }, [partnerSnapshotsData]);

  const chartLicenseHistoryOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#f1f5f9',
          padding: 12,
          cornerRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          callbacks: {
            label: (context: any) => {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              if (label.includes('%')) {
                return `${label}: ${val.toFixed(1).replace('.', ',')}%`;
              }
              return `${label}: ${val != null ? val.toLocaleString('pt-BR') : 0}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#64748b',
          },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: {
            display: true,
            text: 'Licenças',
            font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
            color: '#64748b',
          },
          grid: { color: 'rgba(226, 232, 240, 0.4)' },
          ticks: {
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#64748b',
            callback: (val: any) => Number(val).toLocaleString('pt-BR'),
          },
          beginAtZero: true,
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          title: {
            display: true,
            text: '% Engajamento',
            font: { size: 11, weight: '600', family: 'Inter, sans-serif' },
            color: '#64748b',
          },
          grid: { drawOnChartArea: false },
          ticks: {
            font: { size: 11, family: 'Inter, sans-serif' },
            color: '#64748b',
            callback: (value: any) => `${value}%`,
          },
          min: 0,
          max: 100,
        },
      },
    };
  }, []);

  const chartLicenseHistoryPlugins = useMemo(() => [
    {
      id: 'floating-data-labels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          const isPercent = dataset.yAxisID === 'y1';
          
          meta.data.forEach((point: any, index: number) => {
            const val = dataset.data[index];
            if (val === undefined || val === null) return;
            
            const text = isPercent ? `${val.toFixed(1).replace('.', ',')}%` : val.toLocaleString('pt-BR');
            
            ctx.font = '600 10px Inter, sans-serif';
            const textWidth = ctx.measureText(text).width;
            const paddingX = 5;
            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 16;
            
            let yOffset = -22;
            if (datasetIndex === 1) yOffset = 10;
            if (datasetIndex === 2) yOffset = -24;
            
            const boxX = point.x - boxWidth / 2;
            const boxY = point.y + yOffset;
            
            ctx.fillStyle = datasetIndex === 0 ? '#eef2ff' : datasetIndex === 1 ? '#ecfdf5' : '#fffbeb';
            ctx.strokeStyle = datasetIndex === 0 ? '#6366f1' : datasetIndex === 1 ? '#10b981' : '#f59e0b';
            ctx.lineWidth = 1;
            
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
            } else {
              ctx.rect(boxX, boxY, boxWidth, boxHeight);
            }
            ctx.fill();
            ctx.stroke();
            
            ctx.fillStyle = datasetIndex === 0 ? '#3730a3' : datasetIndex === 1 ? '#065f46' : '#92400e';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, point.x, boxY + boxHeight / 2);
          });
        });
        
        ctx.restore();
      }
    }
  ], []);

  const chartWeeklyOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', // Slate-900
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        callbacks: {
          title: (items: any) => `Semana de ${items[0]?.label}`,
          label: (item: any) => `Total: ${item.formattedValue} plano${Number(item.formattedValue) !== 1 ? 's' : ''}`,
          afterBody: (items: any) => {
            const dataIndex = items[0]?.dataIndex;
            if (dataIndex === undefined || !weeklyStats[dataIndex]) return [];
            
            const managersMap = weeklyStats[dataIndex].managers;
            const ranking = (Object.entries(managersMap) as [string, number][])
               .map(([manager, count]) => ({ manager, count }))
               .filter(item => item.count > 0)
               .sort((a, b) => b.count - a.count);
            
            if (ranking.length === 0) return [];
            
            return [
              '', // empty line for spacing
              ...ranking.map(r => `• ${r.manager}: ${r.count} plano${r.count > 1 ? 's' : ''}`)
            ];
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' }
        }
      },
      y: {
        grid: {
          display: false,
          drawTicks: false
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
          precision: 0
        },
        grace: '15%',
        beginAtZero: true
      }
    }
  };

  const chartWeeklyPlugins = [
    {
      id: 'datalabels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          meta.data.forEach((bar: any, index: number) => {
            const value = dataset.data[index];
            if (value === undefined || value === null) return;
            
            ctx.font = 'bold 11px Inter, sans-serif';
            const isLastBar = index === dataset.data.length - 1;
            ctx.fillStyle = isLastBar ? '#4f46e5' : '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            
            const x = bar.x;
            const y = bar.y - 6; // Posiciona um pouco acima do topo da barra
            
            ctx.fillText(value.toString(), x, y);
          });
        });
        ctx.restore();
      }
    }
  ];

  const managerColorMap = useMemo(() => {
    // Extract unique manager names from both completed and delayed tasks to assign consistent colors
    const managersSet = new Set<string>();
    completedTasksStats.forEach(w => {
      Object.keys(w.managers).forEach(m => {
        managersSet.add(m);
      });
    });
    delayedTasksStats.forEach(w => {
      Object.keys(w.managers).forEach(m => {
        managersSet.add(m);
      });
    });
    const uniqueManagers = Array.from(managersSet).sort();

    const SOBER_COLORS = [
      '#4f46e5', // Indigo
      '#0ea5e9', // Sky blue
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#8b5cf6', // Violet
      '#ec4899', // Pink
      '#14b8a6', // Teal
      '#3b82f6', // Blue
      '#a855f7', // Purple
      '#f43f5e', // Rose
      '#06b6d4', // Cyan
      '#84cc16', // Lime
    ];
    
    const mapping: Record<string, string> = {};
    uniqueManagers.forEach((name, idx) => {
      mapping[name] = SOBER_COLORS[idx % SOBER_COLORS.length];
    });
    return mapping;
  }, [completedTasksStats, delayedTasksStats]);

  const chartCompletedTasksData = useMemo(() => {
    const uniqueManagers = Object.keys(managerColorMap).sort();

    // Build datasets
    const datasets = uniqueManagers.map(managerName => {
      const data = completedTasksStats.map(w => w.managers[managerName] || 0);
      return {
        label: managerName,
        data,
        backgroundColor: managerColorMap[managerName],
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8
      };
    });

    return {
      labels: completedTasksStats.map(w => w.label),
      datasets
    };
  }, [completedTasksStats, managerColorMap]);

  const chartDelayedTasksData = useMemo(() => {
    const uniqueManagers = Object.keys(managerColorMap).sort();

    // Build datasets
    const datasets = uniqueManagers.map(managerName => {
      const data = delayedTasksStats.map(w => w.managers[managerName] || 0);
      return {
        label: managerName,
        data,
        backgroundColor: managerColorMap[managerName],
        borderRadius: 4,
        barPercentage: 0.6,
        categoryPercentage: 0.8
      };
    });

    return {
      labels: delayedTasksStats.map(w => w.label),
      datasets
    };
  }, [delayedTasksStats, managerColorMap]);

  const chartCompletedTasksOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', // Slate-900
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        // Only show items where value > 0
        filter: (tooltipItem: any) => {
          return tooltipItem.raw > 0;
        },
        callbacks: {
          title: (items: any) => `Semana de ${items[0]?.label}`,
          label: (item: any) => `• ${item.dataset.label}: ${item.raw} task${item.raw !== 1 ? 's' : ''}`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' }
        }
      },
      y: {
        stacked: true,
        grid: {
          display: false,
          drawTicks: false
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
          precision: 0
        },
        grace: '15%',
        beginAtZero: true
      }
    }
  };

  const chartDelayedTasksOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', // Slate-900
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        // Only show items where value > 0
        filter: (tooltipItem: any) => {
          return tooltipItem.raw > 0;
        },
        callbacks: {
          title: (items: any) => `Semana de ${items[0]?.label}`,
          label: (item: any) => `• ${item.dataset.label}: ${item.raw} task${item.raw !== 1 ? 's' : ''}`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' }
        }
      },
      y: {
        stacked: true,
        grid: {
          display: false,
          drawTicks: false
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
          precision: 0
        },
        grace: '15%',
        beginAtZero: true
      }
    }
  };

  const chartCompletedTasksPlugins = [
    {
      id: 'datalabels-stacked',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        
        const totals: number[] = [];
        const topY: number[] = [];
        
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          meta.data.forEach((bar: any, index: number) => {
            const val = dataset.data[index] || 0;
            totals[index] = (totals[index] || 0) + val;
            if (val > 0) {
              if (topY[index] === undefined || bar.y < topY[index]) {
                topY[index] = bar.y;
              }
            }
          });
        });
        
        const meta0 = chart.getDatasetMeta(0);
        meta0.data.forEach((bar: any, index: number) => {
          const total = totals[index] || 0;
          if (total === 0) return;
          
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#4f46e5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          const y = topY[index] !== undefined ? topY[index] - 6 : bar.y - 6;
          ctx.fillText(total.toString(), bar.x, y);
        });
        
        ctx.restore();
      }
    }
  ];

  const chartDelayedTasksPlugins = [
    {
      id: 'datalabels-stacked-delayed',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        
        const totals: number[] = [];
        const topY: number[] = [];
        
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          meta.data.forEach((bar: any, index: number) => {
            const val = dataset.data[index] || 0;
            totals[index] = (totals[index] || 0) + val;
            if (val > 0) {
              if (topY[index] === undefined || bar.y < topY[index]) {
                topY[index] = bar.y;
              }
            }
          });
        });
        
        const meta0 = chart.getDatasetMeta(0);
        meta0.data.forEach((bar: any, index: number) => {
          const total = totals[index] || 0;
          if (total === 0) return;
          
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#e11d48'; // Rose/Red color for delayed totals
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          const y = topY[index] !== undefined ? topY[index] - 6 : bar.y - 6;
          ctx.fillText(total.toString(), bar.x, y);
        });
        
        ctx.restore();
      }
    }
  ];

  const chartFinishedPlansData = useMemo(() => {
    return {
      labels: finishedPlansStats.map(s => s.manager),
      datasets: [
        {
          label: 'Planos Finalizados',
          data: finishedPlansStats.map(s => s.count),
          backgroundColor: '#4f46e5',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.8
        }
      ]
    };
  }, [finishedPlansStats]);

  const chartFinishedPlansOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a', // Slate-900
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        callbacks: {
          title: (items: any) => items[0]?.label || '',
          label: (item: any) => `• Planos: ${item.raw}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' }
        }
      },
      y: {
        grid: {
          display: false,
          drawTicks: false
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
          precision: 0
        },
        grace: '15%',
        beginAtZero: true
      }
    }
  };

  const chartFinishedPlansPlugins = [
    {
      id: 'datalabels-finished-plans',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        const meta = chart.getDatasetMeta(0);
        meta.data.forEach((bar: any, index: number) => {
          const val = chart.data.datasets[0].data[index] || 0;
          if (val === 0) return;
          
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#4f46e5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          ctx.fillText(val.toString(), bar.x, bar.y - 6);
        });
        ctx.restore();
      }
    }
  ];

  const chartTasksStatusData = useMemo(() => {
    const labels = tasksStatusStats.map(s => s.manager);
    const backlogData = tasksStatusStats.map(s => s.backlog);
    const agendaData = tasksStatusStats.map(s => s.agenda);
    const emAndamentoData = tasksStatusStats.map(s => s.em_andamento);
    const concluidaData = tasksStatusStats.map(s => s.concluida);

    return {
      labels,
      datasets: [
        {
          label: 'Backlog',
          data: backlogData,
          backgroundColor: '#94a3b8',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.8
        },
        {
          label: 'Agenda',
          data: agendaData,
          backgroundColor: '#6366f1',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.8
        },
        {
          label: 'Em Andamento',
          data: emAndamentoData,
          backgroundColor: '#f97316',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.8
        },
        {
          label: 'Concluída',
          data: concluidaData,
          backgroundColor: '#10b981',
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.8
        }
      ]
    };
  }, [tasksStatusStats]);

  const chartTasksStatusOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
          boxWidth: 12,
          padding: 15
        }
      },
      tooltip: {
        backgroundColor: '#0f172a', // Slate-900
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        filter: (tooltipItem: any) => {
          return tooltipItem.raw > 0;
        },
        callbacks: {
          title: (items: any) => items[0]?.label || '',
          label: (item: any) => `• ${item.dataset.label}: ${item.raw} task${item.raw !== 1 ? 's' : ''}`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' }
        }
      },
      y: {
        stacked: true,
        grid: {
          display: false,
          drawTicks: false
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
          precision: 0
        },
        grace: '15%',
        beginAtZero: true
      }
    }
  };

  const chartTasksStatusPlugins = [
    {
      id: 'datalabels-stacked-status',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();
        
        const totals: number[] = [];
        const topY: number[] = [];
        
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          meta.data.forEach((bar: any, index: number) => {
            const val = dataset.data[index] || 0;
            totals[index] = (totals[index] || 0) + val;
            if (val > 0) {
              if (topY[index] === undefined || bar.y < topY[index]) {
                topY[index] = bar.y;
              }
            }
          });
        });
        
        const meta0 = chart.getDatasetMeta(0);
        meta0.data.forEach((bar: any, index: number) => {
          const total = totals[index] || 0;
          if (total === 0) return;
          
          ctx.font = 'bold 11px Inter, sans-serif';
          ctx.fillStyle = '#4f46e5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          
          const y = topY[index] !== undefined ? topY[index] - 6 : bar.y - 6;
          ctx.fillText(total.toString(), bar.x, y);
        });
        
        ctx.restore();
      }
    }
  ];

  // ==========================================================================
  // Relatório: Planos Criados por Fila — últimas 20 semanas
  // Conta os planos criados (ativos ou não) por semana de `plans.created_at`,
  // usando o mesmo critério de semana das coortes (segunda-feira da semana).
  // Cada coluna é uma semana; o empilhado separa por fila do parceiro
  // (Retenção / Expansão) ou por tipo de plano, conforme o seletor do card.
  // Filtro próprio: exclusão de um ou mais playbooks da análise. A barra de
  // filtros global do dashboard não afeta este relatório.
  // ==========================================================================
  const tiposPlanoDisponiveis = useMemo(() => {
    if (!rawData) return [] as { id: string; nome: string; total: number }[];

    const semanas = getUltimasSemanas(SEMANAS_HISTORICO_PLANOS);
    const semanaInicial = semanas[0];

    const playbookNomeById = new Map<string, string>();
    playbooksList.forEach((pb) => playbookNomeById.set(pb.id, pb.nome));

    // O contador ao lado de cada opção reflete a mesma janela do gráfico.
    const totais = new Map<string, { id: string; nome: string; total: number }>();
    rawData.basePlans.forEach((plan: any) => {
      if (!plan.created_at) return;
      const semana = getMondayOfWeek(plan.created_at.substring(0, 10));
      if (!semana || (semanaInicial && semana < semanaInicial)) return;

      const id = plan.playbook_id || BAU_TIPO_ID;
      const nome =
        id === BAU_TIPO_ID
          ? BAU_TIPO_LABEL
          : playbookNomeById.get(id) || 'Playbook sem nome';
      const atual = totais.get(id);
      if (atual) atual.total += 1;
      else totais.set(id, { id, nome, total: 1 });
    });

    return Array.from(totais.values()).sort((a, b) => b.total - a.total);
  }, [rawData, playbooksList]);

  const filteredTiposPlano = useMemo(() => {
    const termo = tipoPlanoSearch.trim().toLowerCase();
    if (!termo) return tiposPlanoDisponiveis;
    return tiposPlanoDisponiveis.filter((t) => t.nome.toLowerCase().includes(termo));
  }, [tiposPlanoDisponiveis, tipoPlanoSearch]);

  const planosPorFilaData = useMemo(() => {
    const vazio = {
      chartData: null as any,
      semanas: [] as string[],
      linhas: [] as { semana: string; label: string; porFila: Record<string, number>; total: number }[],
      filas: [] as string[],
      totaisPorFila: {} as Record<string, number>,
      totalGeral: 0
    };
    if (!rawData) return vazio;

    const semanas = getUltimasSemanas(SEMANAS_HISTORICO_PLANOS);
    if (semanas.length === 0) return vazio;
    const semanaInicial = semanas[0];
    const indexPorSemana = new Map<string, number>();
    semanas.forEach((sem, idx) => indexPorSemana.set(sem, idx));

    const filaByPartnerId = new Map<string, string>();
    rawData.partners.forEach((p: any) => filaByPartnerId.set(p.id, normalizeFila(p.fila)));

    const nomeById = new Map<string, string>();
    tiposPlanoDisponiveis.forEach((t) => nomeById.set(t.id, t.nome));

    // porFila[fila][indiceDaSemana] e porTipo[tipoId][indiceDaSemana]
    const porFila = new Map<string, number[]>();
    const porTipo = new Map<string, number[]>();
    const totaisPorFila: Record<string, number> = {
      [FILA_RETENCAO]: 0,
      [FILA_EXPANSAO]: 0,
      [FILA_SEM]: 0
    };
    let totalGeral = 0;

    rawData.basePlans.forEach((plan: any) => {
      const tipoId = plan.playbook_id || BAU_TIPO_ID;
      if (excludedTiposPlano.includes(tipoId)) return;
      if (!plan.created_at) return;

      const semana = getMondayOfWeek(plan.created_at.substring(0, 10));
      if (!semana || semana < semanaInicial) return;
      const idx = indexPorSemana.get(semana);
      if (idx === undefined) return; // plano criado depois da semana corrente

      const fila = filaByPartnerId.get(plan.partner_id) || FILA_SEM;

      const serieFila = porFila.get(fila) || new Array(semanas.length).fill(0);
      serieFila[idx] += 1;
      porFila.set(fila, serieFila);

      const serieTipo = porTipo.get(tipoId) || new Array(semanas.length).fill(0);
      serieTipo[idx] += 1;
      porTipo.set(tipoId, serieTipo);

      totaisPorFila[fila] = (totaisPorFila[fila] || 0) + 1;
      totalGeral += 1;
    });

    // Retenção e Expansão sempre aparecem; "Sem fila" só quando existir.
    const filas = [FILA_RETENCAO, FILA_EXPANSAO];
    if ((totaisPorFila[FILA_SEM] || 0) > 0) filas.push(FILA_SEM);

    const labels = semanas.map((sem) => formatCohortWeekLabel(sem));

    const datasets =
      empilharPor === 'fila'
        ? filas.map((fila) => ({
            label: FILA_LABELS[fila] || fila,
            data: porFila.get(fila) || new Array(semanas.length).fill(0),
            backgroundColor: FILA_CORES[fila] || '#94a3b8',
            borderRadius: 3,
            borderSkipped: false as const,
            barPercentage: 0.85,
            categoryPercentage: 0.85
          }))
        : Array.from(porTipo.entries())
            // Maior volume embaixo, para a pilha ficar legível.
            .map(([id, serie]) => ({
              id,
              nome: nomeById.get(id) || id,
              serie,
              total: serie.reduce((a, b) => a + b, 0)
            }))
            .sort((a, b) => b.total - a.total)
            .map((tipo, idx) => ({
              label: tipo.nome,
              data: tipo.serie,
              backgroundColor: TIPO_PLANO_CORES[idx % TIPO_PLANO_CORES.length],
              borderRadius: 3,
              borderSkipped: false as const,
              barPercentage: 0.85,
              categoryPercentage: 0.85
            }));

    // Tabela do relatório: uma linha por semana, sempre por fila.
    const linhas = semanas.map((semana, idx) => {
      const porFilaNaSemana: Record<string, number> = {};
      let total = 0;
      filas.forEach((fila) => {
        const qtd = (porFila.get(fila) || [])[idx] || 0;
        porFilaNaSemana[fila] = qtd;
        total += qtd;
      });
      return { semana, label: formatCohortWeekLabel(semana), porFila: porFilaNaSemana, total };
    });

    return {
      chartData: { labels, datasets },
      semanas,
      linhas,
      filas,
      totaisPorFila,
      totalGeral
    };
  }, [rawData, tiposPlanoDisponiveis, excludedTiposPlano, empilharPor]);

  const planosPorFilaOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 14,
          font: { size: 11, family: 'Inter, sans-serif' },
          usePointStyle: true
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        callbacks: {
          title: (items: any[]) => (items.length ? `Semana de ${items[0].label}` : ''),
          label: (ctx: any) => {
            const valor = ctx.parsed.y || 0;
            if (valor === 0) return '';
            return `${ctx.dataset.label}: ${valor} plano${valor === 1 ? '' : 's'}`;
          },
          footer: (items: any[]) => {
            const total = items.reduce((acc: number, it: any) => acc + (it.parsed.y || 0), 0);
            return `Total: ${total} plano${total === 1 ? '' : 's'}`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 10, family: 'Inter, sans-serif' },
          maxRotation: 0,
          autoSkip: false
        }
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grace: '12%',
        grid: { color: 'rgba(226, 232, 240, 0.4)' },
        ticks: {
          precision: 0,
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' }
        }
      }
    }
  }), []);

  // Escreve o total de planos criados acima de cada coluna empilhada.
  const planosPorFilaPlugins = [
    {
      id: 'datalabels-planos-por-fila',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart;
        ctx.save();

        const totals: number[] = [];
        const topY: number[] = [];

        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;
          meta.data.forEach((bar: any, index: number) => {
            const val = dataset.data[index] || 0;
            totals[index] = (totals[index] || 0) + val;
            if (val > 0) {
              if (topY[index] === undefined || bar.y < topY[index]) {
                topY[index] = bar.y;
              }
            }
          });
        });

        const meta0 = chart.getDatasetMeta(0);
        if (!meta0) {
          ctx.restore();
          return;
        }

        meta0.data.forEach((bar: any, index: number) => {
          const total = totals[index] || 0;
          if (total === 0) return;

          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillStyle = '#4f46e5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';

          const y = topY[index] !== undefined ? topY[index] - 5 : bar.y - 5;
          ctx.fillText(total.toString(), bar.x, y);
        });

        ctx.restore();
      }
    }
  ];

  // Fetch step tasks and task status history when selectedPlaybookId changes
  useEffect(() => {
    if (!selectedPlaybookId) {
      setStepTasks([]);
      setStepHistory([]);
      return;
    }

    let isMounted = true;
    setLoadingStepData(true);

    const fetchStepData = async () => {
      try {
        const [pbTasksRes, historyRes] = await Promise.all([
          supabase
            .from('playbook_tasks')
            .select('id, titulo, ordem')
            .eq('playbook_id', selectedPlaybookId)
            .order('ordem', { ascending: true }),
          supabase
            .from('task_status_history')
            .select('alterado_em, status_novo, tasks!inner(id, ordem, deletada_em, plan_id, plans!inner(playbook_id, partner_id))')
            .eq('status_novo', 'concluida')
            .eq('tasks.plans.playbook_id', selectedPlaybookId)
        ]);

        if (!isMounted) return;

        if (pbTasksRes.error) {
          console.warn('Erro ao buscar playbook_tasks:', pbTasksRes.error);
        }
        if (historyRes.error) {
          console.warn('Erro ao buscar task_status_history:', historyRes.error);
        }

        setStepTasks(pbTasksRes.data || []);
        setStepHistory(historyRes.data || []);
      } catch (err) {
        console.error('Erro ao carregar dados do playbook selecionado:', err);
        if (isMounted) {
          setStepTasks([]);
          setStepHistory([]);
        }
      } finally {
        if (isMounted) {
          setLoadingStepData(false);
        }
      }
    };

    fetchStepData();

    return () => {
      isMounted = false;
    };
  }, [selectedPlaybookId]);

  const stackedBarChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 16,
          font: { size: 11, family: 'Inter, sans-serif' },
          usePointStyle: true,
        },
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        callbacks: {
          title: (tooltipItems: any[]) => {
            if (!tooltipItems.length) return '';
            return `Data: ${tooltipItems[0].label}`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
        },
      },
      y: {
        stacked: true,
        grid: {
          color: 'rgba(226, 232, 240, 0.4)',
        },
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: '#94a3b8',
          font: { size: 11, family: 'Inter, sans-serif' },
        },
      },
    },
  }), []);

  const stepChartData = useMemo(() => {
    if (!selectedPlaybookId) {
      return { status: 'no_selection' as const, chartData: null };
    }

    const validHistory = stepHistory.filter((item: any) => {
      if (item.status_novo !== 'concluida') return false;
      if (!item.alterado_em) return false;
      const task = item.tasks;
      if (!task || task.deletada_em) return false;
      const plan = task.plans;
      if (!plan || plan.playbook_id !== selectedPlaybookId) return false;
      return true;
    });

    if (validHistory.length === 0) {
      return { status: 'empty' as const, chartData: null };
    }

    const dateStrs = validHistory.map((item: any) => item.alterado_em.substring(0, 10));
    dateStrs.sort();
    const minDateStr = dateStrs[0];

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const maxDateStr = `${yyyy}-${mm}-${dd}`;

    const dateList: string[] = [];
    let curr = new Date(minDateStr + 'T00:00:00');
    const endDate = new Date(maxDateStr + 'T00:00:00');

    while (curr <= endDate) {
      const cyyyy = curr.getFullYear();
      const cmm = String(curr.getMonth() + 1).padStart(2, '0');
      const cdd = String(curr.getDate()).padStart(2, '0');
      dateList.push(`${cyyyy}-${cmm}-${cdd}`);
      curr.setDate(curr.getDate() + 1);
    }

    const ordemsSet = new Set<number>();
    stepTasks.forEach((t) => ordemsSet.add(t.ordem));
    validHistory.forEach((item: any) => {
      if (item.tasks && typeof item.tasks.ordem === 'number') {
        ordemsSet.add(item.tasks.ordem);
      }
    });

    const sortedOrdems = Array.from(ordemsSet).sort((a, b) => a - b);

    const ordemTitles: { [key: number]: string } = {};
    sortedOrdems.forEach((ordem) => {
      const found = stepTasks.find((t) => t.ordem === ordem);
      ordemTitles[ordem] = found?.titulo || `Etapa ${ordem}`;
    });

    const colors = [
      '#4f46e5',
      '#10b981',
      '#f59e0b',
      '#ef4444',
      '#06b6d4',
      '#8b5cf6',
      '#ec4899',
      '#3b82f6',
      '#14b8a6',
      '#f97316',
    ];

    const labels = dateList.map((d) => {
      const parts = d.split('-');
      return `${parts[2]}/${parts[1]}`;
    });

    const datasets = sortedOrdems.map((ordem, idx) => {
      const seriesData = dateList.map((dayStr) => {
        return validHistory.filter((item: any) => {
          return item.alterado_em.startsWith(dayStr) && item.tasks?.ordem === ordem;
        }).length;
      });

      const color = colors[idx % colors.length];

      return {
        label: `${ordemTitles[ordem]}`,
        data: seriesData,
        backgroundColor: color,
        borderRadius: 2,
      };
    });

    return {
      status: 'ok' as const,
      chartData: {
        labels,
        datasets,
      },
    };
  }, [selectedPlaybookId, stepTasks, stepHistory]);

  // Protected route logic (admin-only)
  if (authLoading) return null;
  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8">
      <style>{`
        .scroll-minimal::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .scroll-minimal::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.3);
          border-radius: 9999px;
        }
        .scroll-minimal::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.5);
        }
        .scroll-minimal::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between border-b border-border border-opacity-50 pb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <Layout className="h-6 w-6" id="dashboard-v2-icon" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-primary" id="dashboard-v2-title">
              Dashboard Gerencial V2
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Visão consolidada e análises gerenciais da base de parceiros.
            </p>
            <p className="text-xs text-text-secondary mt-1.5">
              As tabelas de coorte agora vivem no{' '}
              <Link to="/dashboard-coortes" className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                Dashboard de Coortes
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Grid of sections */}
      <div className="flex flex-col gap-6">
        {/* Barra de Filtros */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col animate-fade-in" id="container-filtros-gerenciais">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-border border-opacity-30 pb-3">
            <div className="flex items-center gap-2.5">
              <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" id="icon-filtros" />
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary" id="title-filtros">
                  Filtros de Análise
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-auto" id="header-filter-actions">
              <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50" id="badge-active-filters">
                {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}
              </span>
              <button
                type="button"
                disabled={activeFiltersCount === 0}
                onClick={() => {
                  setSelectedPlanos([]);
                  setSelectedGerentes([]);
                  setSelectedPlaybookTipo('todos');
                  setComPlano('todos');
                  setStatusEtapaPlano('criado');
                  setStatusConclusao('todos');
                  setSelectedFila('todos');
                }}
                className={`text-xs font-semibold transition-colors ${
                  activeFiltersCount > 0
                    ? 'text-rose-500 hover:text-rose-600 cursor-pointer'
                    : 'text-text-secondary opacity-40 cursor-not-allowed'
                }`}
                id="btn-limpar-filtros"
              >
                Limpar filtros
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20 transition-all opacity-70 cursor-not-allowed"
                id="btn-adicionar-filtro"
                title="Adicionar filtro (Visual)"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar filtro
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 xl:gap-5" id="grid-filtros">
            {/* Bloco Plano */}
            <div className="flex flex-col gap-2" id="bloco-filtro-plano">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Plano / Segmento
              </span>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                {/* Multi-select Dropdown */}
                <div className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPlanoDropdownOpen(!planoDropdownOpen);
                      setGerenteDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    id="btn-dropdown-plano"
                  >
                    <span className="truncate">
                      {selectedPlanos.length === 0
                        ? 'Todos os planos'
                        : selectedPlanos.length === 1
                        ? selectedPlanos[0]
                        : `${selectedPlanos.length} planos selecionados`}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${planoDropdownOpen ? 'rotate-180' : ''}`} id="chevron-plano" />
                  </button>

                  {planoDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setPlanoDropdownOpen(false)} id="overlay-plano" />
                      <div className="absolute left-0 mt-1.5 z-20 w-full min-w-[240px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-60 overflow-y-auto scroll-minimal" id="menu-dropdown-plano">
                        <input
                          type="text"
                          placeholder="Buscar plano..."
                          value={planoSearch}
                          onChange={(e) => setPlanoSearch(e.target.value)}
                          className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          id="input-busca-plano"
                        />
                        <div className="flex flex-col gap-1">
                          {filteredPlanos.map((plano) => {
                            const isSelected = selectedPlanos.includes(plano);
                            return (
                              <label
                                key={plano}
                                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                                id={`label-opt-plano-${plano.replace(/\s+/g, '-').toLowerCase()}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setSelectedPlanos(selectedPlanos.filter(p => p !== plano));
                                    } else {
                                      setSelectedPlanos([...selectedPlanos, plano]);
                                    }
                                  }}
                                  className="rounded border-border text-indigo-600 focus:ring-indigo-500/20 h-4 w-4"
                                  id={`checkbox-plano-${plano.replace(/\s+/g, '-').toLowerCase()}`}
                                />
                                <span className="truncate">{plano}</span>
                              </label>
                            );
                          })}
                          {filteredPlanos.length === 0 && (
                            <span className="text-xs text-text-secondary text-center py-2" id="no-plano-found">Nenhum plano encontrado</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco Gerente */}
            <div className="flex flex-col gap-2" id="bloco-filtro-gerente">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Gerente
              </span>
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                {/* Multi-select Dropdown */}
                <div className="relative flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setGerenteDropdownOpen(!gerenteDropdownOpen);
                      setPlanoDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    id="btn-dropdown-gerente"
                  >
                    <span className="truncate">
                      {selectedGerentes.length === 0
                        ? 'Todos os gerentes'
                        : selectedGerentes.length === 1
                        ? selectedGerentes[0]
                        : `${selectedGerentes.length} gerentes selecionados`}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${gerenteDropdownOpen ? 'rotate-180' : ''}`} id="chevron-gerente" />
                  </button>

                  {gerenteDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setGerenteDropdownOpen(false)} id="overlay-gerente" />
                      <div className="absolute left-0 mt-1.5 z-20 w-full min-w-[240px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-60 overflow-y-auto scroll-minimal" id="menu-dropdown-gerente">
                        <input
                          type="text"
                          placeholder="Buscar gerente..."
                          value={gerenteSearch}
                          onChange={(e) => setGerenteSearch(e.target.value)}
                          className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          id="input-busca-gerente"
                        />
                        <div className="flex flex-col gap-1">
                          {filteredGerentes.map((gerente) => {
                            const isSelected = selectedGerentes.includes(gerente);
                            return (
                              <label
                                key={gerente}
                                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                                id={`label-opt-gerente-${gerente.replace(/\s+/g, '-').toLowerCase()}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setSelectedGerentes(selectedGerentes.filter(g => g !== gerente));
                                    } else {
                                      setSelectedGerentes([...selectedGerentes, gerente]);
                                    }
                                  }}
                                  className="rounded border-border text-indigo-600 focus:ring-indigo-500/20 h-4 w-4"
                                  id={`checkbox-gerente-${gerente.replace(/\s+/g, '-').toLowerCase()}`}
                                />
                                <span className="truncate">{gerente}</span>
                              </label>
                            );
                          })}
                          {filteredGerentes.length === 0 && (
                            <span className="text-xs text-text-secondary text-center py-2" id="no-gerente-found">Nenhum gerente encontrado</span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bloco Origem do Playbook */}
            <div className="flex flex-col gap-2" id="bloco-filtro-playbook-tipo">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Origem do Playbook
              </span>
              <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm" id="segmented-playbook-tipo">
                <button
                  type="button"
                  onClick={() => setSelectedPlaybookTipo('todos')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedPlaybookTipo === 'todos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-playbook-todos"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlaybookTipo('playbooks_novos')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedPlaybookTipo === 'playbooks_novos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-playbook-novos"
                >
                  Playbooks novos
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlaybookTipo('bau')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedPlaybookTipo === 'bau'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-playbook-bau"
                >
                  BAU
                </button>
              </div>
            </div>

            {/* Bloco Existência do Plano */}
            <div className="flex flex-col gap-2" id="bloco-filtro-com-plano">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Existência do Plano
              </span>
              <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm" id="segmented-com-plano">
                <button
                  type="button"
                  onClick={() => setComPlano('todos')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    comPlano === 'todos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-com-plano-todos"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setComPlano('com_plano')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    comPlano === 'com_plano'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-com-plano-com"
                >
                  Com Plano
                </button>
                <button
                  type="button"
                  onClick={() => setComPlano('sem_plano')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    comPlano === 'sem_plano'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-com-plano-sem"
                >
                  Sem Plano
                </button>
              </div>
            </div>

            {/* Bloco Etapa do Plano */}
            <div className="flex flex-col gap-2" id="bloco-filtro-status-etapa-plano">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Etapa do Plano
              </span>
              <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm" id="segmented-status-etapa-plano">
                <button
                  type="button"
                  onClick={() => setStatusEtapaPlano('criado')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusEtapaPlano === 'criado'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-etapa-criado"
                >
                  Plano Criado
                </button>
                <button
                  type="button"
                  onClick={() => setStatusEtapaPlano('iniciado')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusEtapaPlano === 'iniciado'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-etapa-iniciado"
                >
                  Em Execução
                </button>
                <button
                  type="button"
                  onClick={() => setStatusEtapaPlano('finalizado')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusEtapaPlano === 'finalizado'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-etapa-finalizado"
                >
                  Finalizado
                </button>
              </div>
            </div>

            {/* Bloco Status de Conclusão */}
            <div className="flex flex-col gap-2" id="bloco-filtro-status-conclusao">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Status de Conclusão
              </span>
              <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm overflow-x-auto" id="segmented-status-conclusao">
                <button
                  type="button"
                  onClick={() => setStatusConclusao('todos')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusConclusao === 'todos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-conclusao-todos"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setStatusConclusao('sucesso')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusConclusao === 'sucesso'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-conclusao-sucesso"
                >
                  Sucesso
                </button>
                <button
                  type="button"
                  onClick={() => setStatusConclusao('sem_sucesso')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusConclusao === 'sem_sucesso'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-conclusao-sem-sucesso"
                >
                  Sem sucesso
                </button>
                <button
                  type="button"
                  onClick={() => setStatusConclusao('nao_classificado')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    statusConclusao === 'nao_classificado'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-status-conclusao-nao-classificado"
                >
                  Não classificado
                </button>
              </div>
            </div>

            {/* Bloco Fila */}
            <div className="flex flex-col gap-2" id="bloco-filtro-fila">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Fila
              </span>
              <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm" id="segmented-fila">
                <button
                  type="button"
                  onClick={() => setSelectedFila('todos')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedFila === 'todos'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-fila-todos"
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFila('RETENÇÃO')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedFila === 'RETENÇÃO'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-fila-retencao"
                >
                  Retenção
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFila('EXPANSÃO')}
                  className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedFila === 'EXPANSÃO'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                  id="btn-toggle-fila-expansao"
                >
                  Expansão
                </button>
              </div>
            </div>
          </div>

          {/* Saved Filters Row */}
          <div className="border-t border-border border-opacity-30 mt-5 pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4" id="row-saved-filters">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1" id="saved-filters-list-container">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <Bookmark className="h-3.5 w-3.5 text-indigo-500" /> Filtros salvos:
              </span>

              {loadingFilters ? (
                <div className="flex items-center gap-1.5 text-xs text-text-secondary py-1" id="loading-filters-indicator">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                  <span>Carregando filtros...</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2" id="saved-filters-chips">
                  {savedFilters.map((filter) => {
                    const isApplied =
                      selectedPlanos.length === (filter.planos?.length || 0) &&
                      selectedPlanos.every(p => filter.planos?.includes(p)) &&
                      selectedGerentes.length === (filter.gerentes?.length || 0) &&
                      selectedGerentes.every(g => filter.gerentes?.includes(g)) &&
                      selectedPlaybookTipo === (filter.origem_playbook || 'todos') &&
                      comPlano === (filter.plano_existente || 'todos') &&
                      statusEtapaPlano === (filter.status_etapa_plano || 'criado') &&
                      statusConclusao === (filter.status_conclusao_filtro || 'todos') &&
                      selectedFila === (filter.fila || 'todos');

                    return (
                      <div
                        key={filter.id}
                        onClick={() => handleApplyFilter(filter)}
                        className={`group flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border cursor-pointer transition-all ${
                          isApplied
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-bg-secondary/20 text-text-primary border-border hover:bg-bg-secondary/50'
                        }`}
                        id={`saved-filter-chip-${filter.id}`}
                      >
                        <Bookmark className={`h-3 w-3 ${isApplied ? 'text-white' : 'text-indigo-500'}`} />
                        <span className="truncate max-w-[150px]" title={filter.nome}>
                          {filter.nome}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteFilter(filter.id, e)}
                          className={`rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${
                            isApplied ? 'text-indigo-100 hover:text-white' : 'text-text-secondary hover:text-rose-500'
                          }`}
                          title="Excluir filtro"
                          id={`btn-delete-saved-filter-${filter.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}

                  {showSaveInput ? (
                    <form onSubmit={handleSaveFilter} className="flex items-center gap-1.5 bg-card p-1 rounded-full border border-indigo-500 shadow-xs" id="form-salvar-filtro">
                      <input
                        type="text"
                        placeholder="Nome do filtro..."
                        value={newFilterName}
                        onChange={(e) => setNewFilterName(e.target.value)}
                        className="rounded-full border-none bg-transparent px-2.5 py-0.5 text-xs text-text-primary focus:outline-none w-36"
                        autoFocus
                        required
                        id="input-novo-filtro"
                      />
                      <button
                        type="submit"
                        disabled={isSavingFilter || !newFilterName.trim()}
                        className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        id="btn-confirmar-salvar-filtro"
                      >
                        {isSavingFilter ? '...' : 'Salvar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSaveInput(false);
                          setNewFilterName('');
                        }}
                        className="rounded-full px-2 py-0.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary/40 transition-colors"
                        id="btn-cancelar-salvar-filtro"
                      >
                        ✕
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      disabled={activeFiltersCount === 0}
                      onClick={() => setShowSaveInput(true)}
                      className="flex items-center justify-center h-7 w-7 rounded-full border border-dashed border-border text-text-secondary hover:text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      title={activeFiltersCount === 0 ? 'Selecione ao menos um filtro para salvar' : 'Salvar filtro atual'}
                      id="btn-salvar-filtro-plus"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0" id="link-gerenciar-filtros">
              <button
                type="button"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline opacity-70 cursor-not-allowed"
                id="btn-gerenciar-filtros"
                title="Gerenciar filtros salvos (Visual)"
              >
                Gerenciar filtros salvos
              </button>
            </div>
          </div>
        </div>

        {/* Card: Histórico de Licenças e Engajamento (Redesenhado) */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col gap-6" id="card-historico-licencas-chart">
          {/* Header + Dropdown de Janela de Importação */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="header-historico-licencas">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-historico-licencas">
                Histórico de Licenças e Engajamento
              </h3>
              <p className="text-xs text-text-secondary mt-0.5" id="desc-historico-licencas">
                Evolução temporal do total de licenças, licenças engajadas e taxa de engajamento por data de importação.
              </p>
            </div>

            {/* Dropdown: Últimas X importações */}
            <div className="shrink-0" id="wrapper-select-historico-import-count">
              <select
                value={historicImportCount}
                onChange={(e) => setHistoricImportCount(e.target.value as '4' | '8' | 'all')}
                className="h-9 px-3 bg-bg-primary border border-border rounded-lg text-xs font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                id="select-historico-import-count"
              >
                <option value="4">Últimas 4 importações</option>
                <option value="8">Últimas 8 importações</option>
                <option value="all">Todas as importações</option>
              </select>
            </div>
          </div>

          {loadingData ? (
            <div className="py-16 text-center text-text-secondary flex flex-col items-center justify-center" id="loading-historico-licencas">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mb-2" />
              <p className="text-xs font-medium">Carregando histórico...</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 text-center text-rose-500 text-xs font-medium" id="error-historico-licencas">
              {errorMsg}
            </div>
          ) : !partnerSnapshotsData.hasData ? (
            <div className="py-12 text-center text-text-secondary bg-bg-secondary/20 rounded-lg p-6" id="empty-historico-licencas">
              <p className="font-semibold text-sm text-text-primary">Nenhum snapshot encontrado para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros acima para expandir a busca.</p>
            </div>
          ) : (
            <>
              {/* 3 KPIs no topo (Valores da importação mais recente) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="kpis-historico-licencas">
                <div className="rounded-lg border border-border/80 bg-bg-secondary/15 p-4 flex flex-col justify-between" id="kpi-licencas-totais">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-600 inline-block shrink-0" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Licenças Totais
                    </span>
                  </div>
                  <span className="text-2xl font-extrabold text-text-primary tracking-tight">
                    {partnerSnapshotsData.latestKpis.totalLicencas.toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="rounded-lg border border-border/80 bg-bg-secondary/15 p-4 flex flex-col justify-between" id="kpi-licencas-engajadas">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      Licenças Engajadas
                    </span>
                  </div>
                  <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                    {partnerSnapshotsData.latestKpis.engajadasLicencas.toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="rounded-lg border border-border/80 bg-bg-secondary/15 p-4 flex flex-col justify-between" id="kpi-taxa-engajamento">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      % de Engajamento (média)
                    </span>
                  </div>
                  <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                    {partnerSnapshotsData.latestKpis.taxaEngajamento.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
              </div>

              {/* Legenda abaixo dos KPIs com ícones de linha */}
              <div className="flex flex-wrap items-center justify-center gap-6 pt-2 pb-1 border-y border-border/40 text-xs font-medium text-text-secondary" id="legenda-historico-licencas">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 bg-indigo-600 rounded-full" />
                  <span className="text-text-primary font-semibold">Licenças Totais</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 bg-emerald-500 rounded-full" />
                  <span className="text-text-primary font-semibold">Licenças Engajadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 border-b-2 border-dashed border-amber-500" />
                  <span className="text-text-primary font-semibold">% de Engajamento</span>
                </div>
              </div>

              {/* Gráfico de Linha com Eixo Duplo */}
              <div className="h-[380px] w-full pt-2" id="historico-licencas-chart-container">
                <Line
                  data={chartLicenseHistoryData}
                  options={chartLicenseHistoryOptions}
                  plugins={chartLicenseHistoryPlugins}
                />
              </div>

              {/* Insight calculated no rodapé */}
              {partnerSnapshotsData.insightText && (
                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/50 dark:border-indigo-900/40 dark:bg-indigo-950/20 p-3.5 flex items-start gap-3 text-xs text-indigo-900 dark:text-indigo-200" id="insight-historico-licencas">
                  <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <span className="font-medium leading-relaxed">
                    {partnerSnapshotsData.insightText}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Section: Evolução das Faixas de Engajamento */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col" id="card-evolucao-faixas-engajamento">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="header-evolucao-faixas-engajamento">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-evolucao-faixas-engajamento">
                Evolução das Faixas de Engajamento
              </h3>
              <p className="text-xs text-text-secondary mt-0.5" id="desc-evolucao-faixas-engajamento">
                Percentual de parceiros por faixa de engajamento ao longo das importações.
              </p>
            </div>

            {/* Dropdown: Últimas X importações */}
            <div className="shrink-0" id="wrapper-select-tiers-import-count">
              <select
                value={historicImportCount}
                onChange={(e) => setHistoricImportCount(e.target.value as '4' | '8' | 'all')}
                className="h-9 px-3 bg-bg-primary border border-border rounded-lg text-xs font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                id="select-tiers-import-count"
              >
                <option value="4">Últimas 4 importações</option>
                <option value="8">Últimas 8 importações</option>
                <option value="all">Todas as importações</option>
              </select>
            </div>
          </div>

          {loadingData ? (
            <div className="py-16 text-center text-text-secondary flex flex-col items-center justify-center" id="loading-evolucao-faixas-engajamento">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600 mb-2" />
              <p className="text-xs font-medium">Carregando evolução das faixas...</p>
            </div>
          ) : errorMsg ? (
            <div className="py-12 text-center text-rose-500 text-xs font-medium" id="error-evolucao-faixas-engajamento">
              {errorMsg}
            </div>
          ) : !engagementTiersData.hasData ? (
            <div className="py-12 text-center text-text-secondary bg-bg-secondary/20 rounded-lg p-6" id="empty-evolucao-faixas-engajamento">
              <p className="font-semibold text-sm text-text-primary">Nenhum snapshot encontrado para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros acima para expandir a busca.</p>
            </div>
          ) : (
            <>
              {/* 3 KPIs no topo (Valores da importação mais recente) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="kpis-evolucao-faixas-engajamento">
                <div className="rounded-lg border border-border/80 bg-bg-secondary/15 p-4 flex flex-col justify-between" id="kpi-tier-critico">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 inline-block shrink-0" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      % &lt; 50% (Crítico)
                    </span>
                  </div>
                  <span className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight">
                    {engagementTiersData.latestKpis.pctAbaixo50.toFixed(1).replace('.', ',')}%
                  </span>
                </div>

                <div className="rounded-lg border border-border/80 bg-bg-secondary/15 p-4 flex flex-col justify-between" id="kpi-tier-abaixo-meta">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block shrink-0" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      % &lt; 75% (Abaixo da Meta)
                    </span>
                  </div>
                  <span className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                    {engagementTiersData.latestKpis.pctAbaixo75.toFixed(1).replace('.', ',')}%
                  </span>
                </div>

                <div className="rounded-lg border border-border/80 bg-bg-secondary/15 p-4 flex flex-col justify-between" id="kpi-tier-meta-atingida">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                      % ≥ 75% (Meta Atingida)
                    </span>
                  </div>
                  <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                    {engagementTiersData.latestKpis.pctAcima75.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
              </div>

              {/* Legenda com ícones de linha */}
              <div className="flex flex-wrap items-center justify-center gap-6 pt-2 pb-1 border-y border-border/40 text-xs font-medium text-text-secondary" id="legenda-evolucao-faixas-engajamento">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 bg-rose-500 rounded-full" />
                  <span className="text-text-primary font-semibold">% &lt; 50%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 bg-amber-500 rounded-full" />
                  <span className="text-text-primary font-semibold">% &lt; 75% (Cumulativo)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-0.5 bg-emerald-500 rounded-full" />
                  <span className="text-text-primary font-semibold">% ≥ 75%</span>
                </div>
              </div>

              {/* Gráfico de Linha */}
              <div className="h-[380px] w-full pt-2" id="evolucao-faixas-chart-container">
                <Line
                  data={chartEngagementTiersData}
                  options={chartEngagementTiersOptions}
                  plugins={chartEngagementTiersPlugins}
                />
              </div>
            </>
          )}
        </div>

        {/* Section: Ranking de Planos por Tipo */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col" id="section-ranking-planos-retencao">
          <div className="mb-8">
            <h2 className="text-xl font-bold tracking-tight text-text-primary" id="section-ranking-planos-retencao-title">
              Ranking de Planos por Tipo
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Comparativo de adesão por classificação de plano, com base no segmento no momento da criação do plano.
            </p>
          </div>

          {retentionPlanRanking.status === 'loading' ? (
            <div className="flex h-64 items-center justify-center" id="ranking-planos-retencao-loading">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="text-sm text-text-secondary">Carregando ranking...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px] scroll-minimal rounded-lg border border-border border-opacity-40" id="ranking-planos-retencao-table-wrapper">
              <table className="w-full text-left text-sm border-collapse" id="ranking-planos-retencao-table">
                <thead>
                  <tr className="border-b border-border border-opacity-40 bg-bg-secondary/10">
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider pl-4 border-b border-border border-opacity-40 w-16" id="th-ranking-pos">
                      Pos
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider border-b border-border border-opacity-40" id="th-ranking-tipo">
                      Tipo de Plano
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-ranking-parceiros">
                      Total de Parceiros
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right pr-4 border-b border-border border-opacity-40" id="th-ranking-planos">
                      # de Planos Criados
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border divide-opacity-30">
                  {retentionPlanRanking.ranking.map((item, idx) => (
                    <tr key={item.tipo} className="hover:bg-bg-secondary/40 odd:bg-card even:bg-bg-secondary/10 transition-colors" id={`row-ranking-${item.tipo}`}>
                      <td className="py-4 px-4 whitespace-nowrap text-xs font-bold text-text-secondary pl-4" id={`cell-ranking-pos-${idx}`}>
                        #{idx + 1}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap" id={`cell-ranking-tipo-${idx}`}>
                        <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 rounded-md text-xs font-bold">
                          {item.tipo}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-text-secondary font-medium whitespace-nowrap" id={`cell-ranking-parceiros-${idx}`}>
                        {item.totalPartners}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap pr-4" id={`cell-ranking-planos-${idx}`}>
                        {item.createdPlans}
                      </td>
                    </tr>
                  ))}
                  {retentionPlanRanking.ranking.length === 0 && (
                    <tr id="row-no-ranking">
                      <td colSpan={4} className="py-8 text-center text-text-secondary">
                        Nenhum plano encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col" id="section-execucao-gerente">
          <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-text-primary" id="section-execucao-gerente-title">
                Execução por Gerente
              </h2>
              <p className="text-xs text-text-secondary mt-1">
                Cobertura de planos e nível de atraso de tarefas por gerente da base de parceiros.
              </p>
            </div>
          </div>

          {loadingData ? (
            <div className="flex h-64 items-center justify-center" id="execucao-gerente-loading">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="text-sm text-text-secondary">Carregando dados consolidados...</span>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="flex h-64 items-center justify-center text-sm text-red-500" id="execucao-gerente-error">
              {errorMsg}
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px] scroll-minimal rounded-lg border border-border border-opacity-40" id="execucao-gerente-table-wrapper">
              <table className="w-full text-left text-sm border-collapse" id="execucao-gerente-table">
                <thead>
                  <tr className="border-b border-border border-opacity-40 bg-bg-secondary/10">
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider pl-4 border-b border-border border-opacity-40" id="th-gerente">
                      Gerente
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-parceiros">
                      # Parceiros
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-planos">
                      Planos Ativos
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-cobertura">
                      % Cobertura
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right text-red-500 border-b border-border border-opacity-40" id="th-atrasados">
                      # Atrasados
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right text-emerald-600 pr-4 border-b border-border border-opacity-40" id="th-emdia">
                      # Em Dia
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border divide-opacity-30">
                  {managerStats.map((stat) => (
                    <tr key={stat.id} className="hover:bg-bg-secondary/40 odd:bg-card even:bg-bg-secondary/10 transition-colors" id={`row-gerente-${stat.id}`}>
                      <td className="py-4 px-4 font-semibold text-text-primary pl-4" id={`cell-nome-${stat.id}`}>
                        {stat.nome}
                      </td>
                      <td className="py-4 px-4 text-right text-text-secondary font-medium" id={`cell-partcount-${stat.id}`}>
                        {stat.partnersCount}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-text-primary" id={`cell-plancount-${stat.id}`}>
                        {stat.plansCount}
                      </td>
                      <td className="py-4 px-4 text-right" id={`cell-coverage-${stat.id}`}>
                        {stat.coverage !== null ? (
                          <div className="flex items-center justify-end gap-3">
                            <span className={`text-sm font-bold ${
                              stat.coverage < 50 ? 'text-rose-600 dark:text-rose-400' : stat.coverage < 80 ? 'text-amber-500' : 'text-emerald-600'
                            }`}>
                              {stat.coverage.toFixed(1)}%
                            </span>
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden hidden sm:block">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  stat.coverage < 50 ? 'bg-rose-500' : stat.coverage < 80 ? 'bg-amber-400' : 'bg-emerald-500'
                                }`} 
                                style={{ width: `${Math.min(100, stat.coverage)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-secondary text-sm font-medium">—</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right" id={`cell-delayed-${stat.id}`}>
                        <div className="flex justify-end">
                          {stat.delayedCount > 0 ? (
                            <span className="inline-flex items-center justify-center rounded-full bg-red-50 dark:bg-red-950/20 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 border border-red-100/50 dark:border-red-900/30">
                              {stat.delayedCount}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-900 px-2.5 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 border border-gray-100 dark:border-gray-800/30">
                              0
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right text-text-secondary pr-4 font-semibold" id={`cell-ontime-${stat.id}`}>
                        {stat.onTimeCount}
                      </td>
                    </tr>
                  ))}
                  {managerStats.length === 0 && (
                    <tr id="row-no-gerentes">
                      <td colSpan={6} className="py-8 text-center text-text-secondary">
                        Nenhum gerente encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2: Planos por Segmento */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm h-full flex flex-col" id="section-planos-segmento">
          <div className="mb-8">
            <h2 className="text-xl font-bold tracking-tight text-text-primary" id="section-planos-segmento-title">
              Planos por Segmento
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Distribuição e cobertura de planos ativos segmentados pela classificação do parceiro.
            </p>
          </div>

          {loadingData ? (
            <div className="flex h-64 items-center justify-center" id="planos-segmento-loading">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="text-sm text-text-secondary">Carregando dados dos segmentos...</span>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="flex h-64 items-center justify-center text-sm text-red-500" id="planos-segmento-error">
              {errorMsg}
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px] scroll-minimal flex-1 rounded-lg border border-border border-opacity-40" id="planos-segmento-table-wrapper">
              <table className="w-full text-left text-sm border-collapse" id="planos-segmento-table">
                <thead>
                  <tr className="border-b border-border border-opacity-40 bg-bg-secondary/10">
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider pl-4 border-b border-border border-opacity-40" id="th-segmento">
                      Segmento
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-seg-parceiros">
                      # Parceiros
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-seg-planos">
                      Planos Ativos
                    </th>
                    <th className="sticky top-0 bg-card z-10 py-3.5 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right pr-4 border-b border-border border-opacity-40" id="th-seg-cobertura">
                      % Cobertura
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border divide-opacity-30">
                  {segmentStats.map((stat, idx) => (
                    <tr key={idx} className="hover:bg-bg-secondary/40 odd:bg-card even:bg-bg-secondary/10 transition-colors" id={`row-segmento-${idx}`}>
                      <td className="py-4 px-4 font-semibold text-text-primary pl-4" id={`cell-seg-nome-${idx}`}>
                        {stat.segment}
                      </td>
                      <td className="py-4 px-4 text-right text-text-secondary font-medium" id={`cell-seg-partcount-${idx}`}>
                        {stat.partnersCount}
                      </td>
                      <td className="py-4 px-4 text-right font-bold text-text-primary" id={`cell-seg-plancount-${idx}`}>
                        {stat.plansCount}
                      </td>
                      <td className="py-4 px-4 text-right pr-4" id={`cell-seg-coverage-${idx}`}>
                        {stat.coverage !== null ? (
                          <div className="flex items-center justify-end gap-3">
                            <span className={`text-sm font-bold ${
                              stat.coverage < 50 ? 'text-rose-600 dark:text-rose-400' : stat.coverage < 80 ? 'text-amber-500' : 'text-emerald-600'
                            }`}>
                              {stat.coverage.toFixed(1)}%
                            </span>
                            <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden hidden sm:block">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  stat.coverage < 50 ? 'bg-rose-500' : stat.coverage < 80 ? 'bg-amber-400' : 'bg-emerald-500'
                                }`} 
                                style={{ width: `${Math.min(100, stat.coverage)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-text-secondary text-sm font-medium">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {segmentStats.length === 0 && (
                    <tr id="row-no-segmentos">
                      <td colSpan={4} className="py-8 text-center text-text-secondary">
                        Nenhum segmento com parceiros encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3: Planos Criados WoW */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm h-full flex flex-col" id="section-planos-criados-wow">
          <div className="mb-8">
            <h2 className="text-xl font-bold tracking-tight text-text-primary" id="section-planos-criados-wow-title">
              Planos Criados WoW
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              Quantidade semanal de novos planos criados, com ranking de gerentes ativos por período.
            </p>
          </div>

          {loadingData ? (
            <div className="flex h-64 items-center justify-center" id="planos-criados-loading">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="text-sm text-text-secondary">Carregando gráfico...</span>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="flex h-64 items-center justify-center text-sm text-red-500" id="planos-criados-error">
              {errorMsg}
            </div>
          ) : (
            <div className="h-72 w-full mt-auto" id="planos-criados-chart-wrapper">
              <Bar data={chartWeeklyData} options={chartWeeklyOptions} plugins={chartWeeklyPlugins} />
            </div>
          )}
        </div>
      </div>

      {/* Linha Divisória */}
      <div className="border-t border-border border-opacity-40 my-10" id="divider-planos-por-fila" />

      {/* Relatório: Planos Criados por Fila — últimas 20 semanas (filtros próprios) */}
      <div className="flex flex-col gap-6 mb-6" id="section-planos-por-fila">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4" id="header-planos-por-fila">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text-primary" id="title-planos-por-fila">
              Planos Criados por Fila — Últimas 20 Semanas
            </h2>
            <p className="text-sm text-text-secondary mt-1" id="desc-planos-por-fila">
              Quantidade de planos criados por semana em parceiros de cada fila (Retenção / Expansão),
              pela semana de criação do plano. Este relatório tem filtro próprio e <strong>não</strong> é
              afetado pela barra de filtros do topo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 lg:shrink-0" id="controles-planos-por-fila">
            {/* Dimensão do empilhamento */}
            <div className="flex flex-col gap-2" id="bloco-empilhar-por">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Empilhar por
              </span>
              <div className="flex rounded-lg border border-border bg-card p-1 shadow-sm" id="toggle-empilhar-por">
                <button
                  type="button"
                  onClick={() => setEmpilharPor('fila')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    empilharPor === 'fila'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-text-secondary hover:bg-bg-secondary/40'
                  }`}
                  id="btn-empilhar-fila"
                >
                  Fila
                </button>
                <button
                  type="button"
                  onClick={() => setEmpilharPor('tipo')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    empilharPor === 'tipo'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-text-secondary hover:bg-bg-secondary/40'
                  }`}
                  id="btn-empilhar-tipo"
                >
                  Tipo de plano
                </button>
              </div>
            </div>

            {/* Filtro próprio: exclusão de playbooks da análise */}
            <div className="w-full sm:w-72 flex flex-col gap-2" id="bloco-filtro-tipo-plano">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                Excluir playbooks da análise
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTipoPlanoDropdownOpen(!tipoPlanoDropdownOpen)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  id="btn-dropdown-tipo-plano"
                >
                  <span className="truncate">
                    {excludedTiposPlano.length === 0
                      ? 'Nenhum excluído'
                      : excludedTiposPlano.length === 1
                      ? '1 playbook excluído'
                      : `${excludedTiposPlano.length} playbooks excluídos`}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${tipoPlanoDropdownOpen ? 'rotate-180' : ''}`} id="chevron-tipo-plano" />
                </button>

                {tipoPlanoDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setTipoPlanoDropdownOpen(false)} id="overlay-tipo-plano" />
                    <div className="absolute right-0 mt-1.5 z-20 w-full min-w-[300px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-72 overflow-y-auto scroll-minimal" id="menu-dropdown-tipo-plano">
                      <input
                        type="text"
                        placeholder="Buscar playbook..."
                        value={tipoPlanoSearch}
                        onChange={(e) => setTipoPlanoSearch(e.target.value)}
                        className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        id="input-busca-tipo-plano"
                      />
                      <p className="px-2 pb-2 text-[11px] leading-snug text-text-secondary">
                        Marque para <strong>remover</strong> os planos daquele playbook do relatório.
                      </p>
                      <div className="flex flex-col gap-1">
                        {filteredTiposPlano.map((tipo) => {
                          const isExcluded = excludedTiposPlano.includes(tipo.id);
                          return (
                            <label
                              key={tipo.id}
                              className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                              id={`label-opt-tipo-plano-${tipo.id}`}
                            >
                              <input
                                type="checkbox"
                                checked={isExcluded}
                                onChange={() => {
                                  if (isExcluded) {
                                    setExcludedTiposPlano(excludedTiposPlano.filter(id => id !== tipo.id));
                                  } else {
                                    setExcludedTiposPlano([...excludedTiposPlano, tipo.id]);
                                  }
                                }}
                                className="rounded border-border text-indigo-600 focus:ring-indigo-500/20 h-4 w-4"
                                id={`checkbox-tipo-plano-${tipo.id}`}
                              />
                              <span className={`truncate flex-1 ${isExcluded ? 'line-through text-text-secondary' : ''}`}>{tipo.nome}</span>
                              <span className="text-xs text-text-secondary font-medium shrink-0">{tipo.total}</span>
                            </label>
                          );
                        })}
                        {filteredTiposPlano.length === 0 && (
                          <span className="text-xs text-text-secondary text-center py-2" id="no-tipo-plano-found">Nenhum playbook encontrado</span>
                        )}
                      </div>
                      {excludedTiposPlano.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExcludedTiposPlano([])}
                          className="mt-2 w-full rounded border border-border px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary/40"
                          id="btn-limpar-tipo-plano"
                        >
                          Limpar exclusões
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Card do Gráfico + Tabela */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col min-h-[420px]" id="card-planos-por-fila-chart">
          {loadingData ? (
            <div className="flex flex-1 items-center justify-center py-16" id="planos-por-fila-loading">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                <span className="text-sm text-text-secondary">Carregando planos por fila...</span>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-red-500" id="planos-por-fila-error">
              {errorMsg}
            </div>
          ) : planosPorFilaData.totalGeral === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center border border-dashed border-border rounded-lg bg-slate-50/30 dark:bg-slate-900/10 p-6" id="planos-por-fila-vazio">
              <span className="text-xs text-text-secondary font-medium max-w-md leading-relaxed">
                Nenhum plano criado nas últimas 20 semanas para o recorte atual. Verifique se você não
                excluiu todos os playbooks no filtro deste relatório.
              </span>
            </div>
          ) : (
            <>
              {/* KPIs da janela de 20 semanas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8" id="planos-por-fila-kpis">
                <div className="rounded-lg border border-border border-opacity-40 bg-bg-secondary/10 p-4" id="kpi-planos-total">
                  <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Planos criados (20 sem.)</span>
                  <p className="text-2xl font-bold text-text-primary mt-1">{planosPorFilaData.totalGeral}</p>
                </div>
                <div className="rounded-lg border border-border border-opacity-40 bg-bg-secondary/10 p-4" id="kpi-planos-retencao">
                  <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Retenção</span>
                  <p className="text-2xl font-bold text-text-primary mt-1">{planosPorFilaData.totaisPorFila['RETENÇÃO'] || 0}</p>
                </div>
                <div className="rounded-lg border border-border border-opacity-40 bg-bg-secondary/10 p-4" id="kpi-planos-expansao">
                  <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">Expansão</span>
                  <p className="text-2xl font-bold text-text-primary mt-1">{planosPorFilaData.totaisPorFila['EXPANSÃO'] || 0}</p>
                </div>
              </div>

              <div className="h-[380px] w-full" id="planos-por-fila-chart-wrapper">
                <Bar
                  data={planosPorFilaData.chartData as any}
                  options={planosPorFilaOptions as any}
                  plugins={planosPorFilaPlugins}
                />
              </div>

              {/* Tabela do relatório: semana a semana, sempre por fila */}
              <div className="mt-8 overflow-auto max-h-[420px] scroll-minimal rounded-lg border border-border border-opacity-40" id="planos-por-fila-table-wrapper">
                <table className="w-full text-left text-sm border-collapse" id="planos-por-fila-table">
                  <thead>
                    <tr className="border-b border-border border-opacity-40 bg-bg-secondary/10">
                      <th className="sticky top-0 bg-card z-10 py-3 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider border-b border-border border-opacity-40" id="th-semana-planos">
                        Semana
                      </th>
                      {planosPorFilaData.filas.map((fila) => (
                        <th
                          key={fila}
                          className="sticky top-0 bg-card z-10 py-3 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40"
                          id={`th-planos-${fila}`}
                        >
                          {FILA_LABELS[fila] || fila}
                        </th>
                      ))}
                      <th className="sticky top-0 bg-card z-10 py-3 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40" id="th-planos-total">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border divide-opacity-30">
                    {planosPorFilaData.linhas.map((linha, idx) => (
                      <tr key={linha.semana} className="hover:bg-bg-secondary/40 odd:bg-card even:bg-bg-secondary/10 transition-colors" id={`row-planos-semana-${idx}`}>
                        <td className="py-3 px-4 font-semibold text-text-primary" id={`cell-planos-semana-${idx}`}>
                          {linha.label}
                        </td>
                        {planosPorFilaData.filas.map((fila) => (
                          <td key={fila} className="py-3 px-4 text-right text-text-secondary font-medium" id={`cell-planos-${fila}-${idx}`}>
                            {linha.porFila[fila] || 0}
                          </td>
                        ))}
                        <td className="py-3 px-4 text-right font-bold text-text-primary" id={`cell-planos-total-${idx}`}>
                          {linha.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border border-opacity-40 bg-bg-secondary/20">
                      <td className="py-3 px-4 text-xs font-bold text-text-secondary uppercase tracking-wider" id="tfoot-planos-label">
                        Total
                      </td>
                      {planosPorFilaData.filas.map((fila) => (
                        <td key={fila} className="py-3 px-4 text-right font-bold text-text-primary" id={`tfoot-planos-${fila}`}>
                          {planosPorFilaData.totaisPorFila[fila] || 0}
                        </td>
                      ))}
                      <td className="py-3 px-4 text-right font-bold text-text-primary" id="tfoot-planos-total">
                        {planosPorFilaData.totalGeral}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Linha Divisória */}
      <div className="border-t border-border border-opacity-40 my-10" id="divider-relatorios" />

      {/* Seção: Relatórios Operacionais */}
      <div className="flex flex-col gap-6 mb-6" id="section-relatorios-operacionais">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary" id="section-relatorios-title">
            Relatórios Operacionais
          </h2>
          <p className="text-sm text-text-secondary mt-1" id="section-relatorios-desc">
            Visualizações detalhadas sobre o andamento de tarefas, conclusões e status por gerente.
          </p>
        </div>

        {/* Grid 2x2 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="relatorios-grid">
          {/* Card 1 */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col h-[400px]" id="card-relatorio-tasks-concluidas">
            <div className="mb-4">
              <h3 className="text-base font-bold tracking-tight text-text-primary" id="title-tasks-concluidas">
                Tasks Concluídas por Gerente (últimas 8 semanas)
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Evolução semanal de tarefas finalizadas com sucesso por cada integrante da equipe.
              </p>
            </div>
            {loadingData ? (
              <div className="flex flex-col items-center justify-center flex-1" id="placeholder-tasks-concluidas">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando dados...</span>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center justify-center flex-1 text-xs text-red-500 font-medium">
                Erro ao carregar dados
              </div>
            ) : (
              <div className="h-64 w-full mt-auto" id="tasks-concluidas-chart-wrapper">
                <Bar data={chartCompletedTasksData} options={chartCompletedTasksOptions} plugins={chartCompletedTasksPlugins} />
              </div>
            )}
          </div>

          {/* Card 2 */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col h-[400px]" id="card-relatorio-tasks-atrasadas">
            <div className="mb-4">
              <h3 className="text-base font-bold tracking-tight text-text-primary" id="title-tasks-atrasadas">
                Tasks Atrasadas por Gerente (últimas 8 semanas)
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Histórico de tarefas expiradas acumuladas por gerente ao longo do tempo.
              </p>
            </div>
            {loadingData ? (
              <div className="flex flex-col items-center justify-center flex-1" id="placeholder-tasks-atrasadas">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando dados...</span>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center justify-center flex-1 text-xs text-red-500 font-medium">
                Erro ao carregar dados
              </div>
            ) : (
              <div className="h-64 w-full mt-auto" id="tasks-atrasadas-chart-wrapper">
                <Bar data={chartDelayedTasksData} options={chartDelayedTasksOptions} plugins={chartDelayedTasksPlugins} />
              </div>
            )}
          </div>

          {/* Card 3 */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col h-[400px]" id="card-relatorio-planos-finalizados">
            <div className="mb-4">
              <h3 className="text-base font-bold tracking-tight text-text-primary" id="title-planos-finalizados">
                Planos Finalizados por Gerente
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Total consolidado de planos de ação inteiramente finalizados e entregues.
              </p>
            </div>
            {loadingData ? (
              <div className="flex flex-col items-center justify-center flex-1" id="placeholder-planos-finalizados">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando dados...</span>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center justify-center flex-1 text-xs text-red-500 font-medium">
                Erro ao carregar dados
              </div>
            ) : (
              <div className="h-64 w-full mt-auto" id="planos-finalizados-chart-wrapper">
                <Bar data={chartFinishedPlansData} options={chartFinishedPlansOptions} plugins={chartFinishedPlansPlugins} />
              </div>
            )}
          </div>

          {/* Card 4 */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col h-[400px]" id="card-relatorio-tasks-status">
            <div className="mb-4">
              <h3 className="text-base font-bold tracking-tight text-text-primary" id="title-tasks-status">
                Tasks por Status e Gerente
              </h3>
              <p className="text-xs text-text-secondary mt-1">
                Distribuição percentual e absoluta do status atual das tarefas por gestor.
              </p>
            </div>
            {loadingData ? (
              <div className="flex flex-col items-center justify-center flex-1" id="placeholder-tasks-status">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando dados...</span>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center justify-center flex-1 text-xs text-red-500 font-medium">
                Erro ao carregar dados
              </div>
            ) : (
              <div className="h-64 w-full mt-auto" id="tasks-status-chart-wrapper">
                <Bar data={chartTasksStatusData} options={chartTasksStatusOptions} plugins={chartTasksStatusPlugins} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Linha Divisória */}
      <div className="border-t border-border border-opacity-40 my-10" id="divider-evolucao-playbooks" />

      {/* Seção: Evolução dos Playbooks */}
      <div className="flex flex-col gap-6 mb-6" id="section-evolucao-playbooks">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text-primary" id="title-evolucao-playbooks">
            Evolução dos Playbooks
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Evolução semanal das métricas do playbook para os filtros selecionados.
          </p>
        </div>

        <div className="w-full" id="evolucao-playbooks-wrapper">
          {/* Card: Histórico de Métricas e Cobertura de Licenças */}
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col justify-between" id="card-evolucao-historico">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border border-opacity-30 pb-4">
              <div>
                <h3 className="text-base font-bold tracking-tight text-text-primary" id="title-historico-metricas">
                  {evolucaoTab === 'historico' ? 'Histórico de Métricas' : 'Cobertura de Licenças'}
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  {evolucaoTab === 'historico'
                    ? 'Evolução semanal das métricas do playbook para os filtros selecionados.'
                    : 'Acompanhamento semanal de licenças cobertas, desengajadas e taxa de engajamento dos parceiros com plano criado.'}
                </p>
              </div>

              {/* Abas */}
              <div className="flex items-center gap-1 bg-bg-secondary/20 p-1 rounded-lg border border-border shrink-0 self-start sm:self-auto" id="tabs-evolucao-playbooks">
                <button
                  type="button"
                  onClick={() => setEvolucaoTab('historico')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    evolucaoTab === 'historico'
                      ? 'bg-card text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  id="btn-tab-historico-metricas"
                >
                  Histórico de Métricas
                </button>
                <button
                  type="button"
                  onClick={() => setEvolucaoTab('cobertura')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                    evolucaoTab === 'cobertura'
                      ? 'bg-card text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                  id="btn-tab-cobertura-licencas"
                >
                  Cobertura de Licenças
                </button>
              </div>
            </div>

            {loadingData ? (
              <div className="flex flex-col items-center justify-center flex-1 py-12" id="placeholder-historico">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando histórico...</span>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center justify-center flex-1 text-xs text-red-500 font-medium py-12">
                Erro ao carregar dados
              </div>
            ) : evolucaoTab === 'historico' ? (
              (() => {
                const hist = historicalData;
                if (!hist || hist.status === 'empty') {
                  return (
                    <div className="flex flex-col items-center justify-center flex-1 text-center py-12 border border-dashed border-border rounded-lg p-6 bg-slate-50/30 dark:bg-slate-900/10" id="historico-vazio">
                      <span className="text-xs text-text-secondary font-medium max-w-sm">
                        O snapshot semanal é gerado automaticamente toda segunda-feira às 06:00. Nenhum registro disponível ainda para esta visão.
                      </span>
                    </div>
                  );
                }

                const columns = hist.data;
                const formatSemana = (semanaStr: string) => {
                  if (!semanaStr) return '';
                  const dateMatch = semanaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
                  if (dateMatch) {
                    const [, , month, day] = dateMatch;
                    return `${day}/${month}`;
                  }
                  return semanaStr;
                };

                const metricsDef = [
                  { label: "Parceiros no segmento", key: "parceiros_no_segmento" },
                  { label: "Parceiros com plano criado", key: "parceiros_com_plano_criado" },
                  { label: "Parceiros com plano finalizado", key: "parceiros_finalizado" }
                ];

                return (
                  <div className="overflow-auto scroll-minimal border border-border border-opacity-40 rounded-lg flex-1" id="historico-table-wrapper">
                    <table className="w-full text-left text-xs border-collapse" id="historico-table">
                      <thead>
                        <tr className="border-b border-border border-opacity-40 bg-bg-secondary/10">
                          <th className="py-2.5 px-3 font-bold text-text-secondary uppercase tracking-wider pl-4 border-b border-border border-opacity-40 sticky top-0 bg-card z-10">
                            Métrica
                          </th>
                          {columns.map((col: any, index: number) => (
                            <th key={index} className="py-2.5 px-3 font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40 pr-4 sticky top-0 bg-card z-10">
                              {formatSemana(col.semana)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border divide-opacity-30">
                        {metricsDef.map((metric, metricIdx) => (
                          <tr key={metricIdx} className="hover:bg-bg-secondary/40 odd:bg-card even:bg-bg-secondary/10 transition-colors">
                            <td className="py-3 px-3 font-medium text-text-primary pl-4 max-w-[200px] truncate">
                              {metric.label}
                            </td>
                            {columns.map((col: any, colIdx: number) => {
                              const val = Number(col[metric.key]) || 0;
                              let variationNode = null;

                              if (colIdx > 0) {
                                const prevCol = columns[colIdx - 1];
                                const prevVal = Number(prevCol[metric.key]) || 0;
                                const diff = val - prevVal;

                                if (diff > 0) {
                                  variationNode = (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] ml-1.5 whitespace-nowrap">
                                      +{diff} ▲
                                    </span>
                                  );
                                } else if (diff < 0) {
                                  variationNode = (
                                    <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px] ml-1.5 whitespace-nowrap">
                                      {diff} ▼
                                    </span>
                                  );
                                } else {
                                  variationNode = (
                                    <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                      —
                                    </span>
                                  );
                                }
                              }

                              return (
                                <td key={colIdx} className="py-3 px-3 text-right text-text-primary pr-4 font-semibold">
                                  <div className="inline-flex items-center justify-end">
                                    <span>{val}</span>
                                    {variationNode}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            ) : (
              (() => {
                const cob = licenseCoverageData;
                if (!cob || cob.status === 'empty') {
                  return (
                    <div className="flex flex-col items-center justify-center flex-1 text-center py-12 border border-dashed border-border rounded-lg p-6 bg-slate-50/30 dark:bg-slate-900/10" id="cobertura-vazia">
                      <span className="text-xs text-text-secondary font-medium max-w-sm">
                        Nenhum dado de cobertura de licenças disponível para os filtros selecionados.
                      </span>
                    </div>
                  );
                }

                const columns = cob.data;
                const formatSemana = (semanaStr: string) => {
                  if (!semanaStr) return '';
                  const dateMatch = semanaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
                  if (dateMatch) {
                    const [, , month, day] = dateMatch;
                    return `${day}/${month}`;
                  }
                  return semanaStr;
                };

                const metricsDef = [
                  { label: "Licenças Cobertas — Com Plano", key: "licencas_cobertas_com", isPercent: false },
                  { label: "Licenças Desengajadas — Com Plano", key: "licencas_desengajadas_com", isPercent: false },
                  { label: "Taxa de Engajamento — Com Plano", key: "taxa_engajamento_com", isPercent: true },
                  { label: "Licenças Cobertas — Sem Plano", key: "licencas_cobertas_sem", isPercent: false },
                  { label: "Licenças Desengajadas — Sem Plano", key: "licencas_desengajadas_sem", isPercent: false },
                  { label: "Taxa de Engajamento — Sem Plano", key: "taxa_engajamento_sem", isPercent: true }
                ];

                return (
                  <div className="overflow-auto scroll-minimal border border-border border-opacity-40 rounded-lg flex-1" id="cobertura-table-wrapper">
                    <table className="w-full text-left text-xs border-collapse" id="cobertura-table">
                      <thead>
                        <tr className="border-b border-border border-opacity-40 bg-bg-secondary/10">
                          <th className="py-2.5 px-3 font-bold text-text-secondary uppercase tracking-wider pl-4 border-b border-border border-opacity-40 sticky top-0 bg-card z-10">
                            Métrica
                          </th>
                          {columns.map((col: any, index: number) => (
                            <th key={index} className="py-2.5 px-3 font-bold text-text-secondary uppercase tracking-wider text-right border-b border-border border-opacity-40 pr-4 sticky top-0 bg-card z-10">
                              {formatSemana(col.semana)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border divide-opacity-30">
                        {metricsDef.map((metric, metricIdx) => (
                          <tr
                            key={metricIdx}
                            className={`hover:bg-bg-secondary/40 transition-colors ${
                              metricIdx === 3
                                ? 'border-t-2 border-border/80 bg-bg-secondary/20'
                                : 'odd:bg-card even:bg-bg-secondary/10'
                            }`}
                          >
                            <td className="py-3 px-3 font-semibold text-text-primary pl-4 max-w-[260px] truncate">
                              {metric.label}
                            </td>
                            {columns.map((col: any, colIdx: number) => {
                              const rawVal = col[metric.key];
                              const isNull = rawVal === null || rawVal === undefined;

                              let valDisplay = "—";
                              if (!isNull) {
                                if (metric.isPercent) {
                                  valDisplay = `${Number(rawVal).toFixed(1).replace('.', ',')}%`;
                                } else {
                                  valDisplay = `${Number(rawVal).toLocaleString('pt-BR')}`;
                                }
                              }

                              let variationNode = null;

                              if (colIdx > 0) {
                                const prevCol = columns[colIdx - 1];
                                const prevRawVal = prevCol[metric.key];
                                const prevIsNull = prevRawVal === null || prevRawVal === undefined;

                                if (!isNull && !prevIsNull) {
                                  const diff = Number(rawVal) - Number(prevRawVal);

                                  if (metric.isPercent) {
                                    const diffFixed = Number(diff.toFixed(1));
                                    if (diffFixed > 0) {
                                      variationNode = (
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] ml-1.5 whitespace-nowrap">
                                          +{diffFixed.toString().replace('.', ',')}% ▲
                                        </span>
                                      );
                                    } else if (diffFixed < 0) {
                                      variationNode = (
                                        <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px] ml-1.5 whitespace-nowrap">
                                          {diffFixed.toString().replace('.', ',')}% ▼
                                        </span>
                                      );
                                    } else {
                                      variationNode = (
                                        <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                          —
                                        </span>
                                      );
                                    }
                                  } else {
                                    if (diff > 0) {
                                      variationNode = (
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[10px] ml-1.5 whitespace-nowrap">
                                          +{diff.toLocaleString('pt-BR')} ▲
                                        </span>
                                      );
                                    } else if (diff < 0) {
                                      variationNode = (
                                        <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px] ml-1.5 whitespace-nowrap">
                                          {diff.toLocaleString('pt-BR')} ▼
                                        </span>
                                      );
                                    } else {
                                      variationNode = (
                                        <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                          —
                                        </span>
                                      );
                                    }
                                  }
                                } else {
                                  variationNode = (
                                    <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                      —
                                    </span>
                                  );
                                }
                              }

                              return (
                                <td key={colIdx} className="py-3 px-3 text-right text-text-primary pr-4 font-semibold">
                                  <div className="inline-flex items-center justify-end">
                                    <span>{valDisplay}</span>
                                    {variationNode}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* Novo Card: Cobertura de Licenças — Total vs Com/Sem Plano */}
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm" id="card-cobertura-total-vs-plano">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6" id="header-cobertura-total-vs-plano">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-cobertura-total-vs-plano">
                Cobertura de Licenças — Total vs Com/Sem Plano
              </h3>
              <p className="text-xs text-text-secondary mt-1" id="desc-cobertura-total-vs-plano">
                Visão consolidada do total e do desmembramento por parceiros Com Plano vs Sem Plano.
              </p>
            </div>
          </div>

          {!licenseCoverageData || licenseCoverageData.status === 'loading' ? (
            <div className="py-12 text-center text-text-secondary" id="cobertura-total-vs-plano-loading">
              Carregando cobertura de licenças...
            </div>
          ) : licenseCoverageData.status === 'empty' || !licenseCoverageData.data || licenseCoverageData.data.length === 0 ? (
            <div className="py-12 text-center text-text-secondary" id="cobertura-total-vs-plano-empty">
              Nenhum dado encontrado para o período/filtros selecionados.
            </div>
          ) : (
            (() => {
              const columns = licenseCoverageData.data;
              const formatSemana = (semanaStr: string) => {
                if (!semanaStr) return '';
                const dateMatch = semanaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                  const [, , month, day] = dateMatch;
                  return `${day}/${month}`;
                }
                return semanaStr;
              };

              const metricGroups = [
                {
                  groupTitle: "Licenças Cobertas",
                  isInverted: false,
                  rows: [
                    { label: "Licenças Cobertas", key: "licencas_cobertas_total", isPercent: false, isTotal: true },
                    { label: "Com Plano", key: "licencas_cobertas_com", isPercent: false, isTotal: false },
                    { label: "Sem Plano", key: "licencas_cobertas_sem", isPercent: false, isTotal: false },
                  ]
                },
                {
                  groupTitle: "Licenças Desengajadas",
                  isInverted: true, // Inverted variation color (subiu = vermelho, desceu = verde)
                  rows: [
                    { label: "Licenças Desengajadas", key: "licencas_desengajadas_total", isPercent: false, isTotal: true },
                    { label: "Com Plano", key: "licencas_desengajadas_com", isPercent: false, isTotal: false },
                    { label: "Sem Plano", key: "licencas_desengajadas_sem", isPercent: false, isTotal: false },
                  ]
                },
                {
                  groupTitle: "Taxa de Engajamento",
                  isInverted: false,
                  rows: [
                    { label: "Taxa de Engajamento", key: "taxa_engajamento_total", isPercent: true, isTotal: true },
                    { label: "Com Plano", key: "taxa_engajamento_com", isPercent: true, isTotal: false },
                    { label: "Sem Plano", key: "taxa_engajamento_sem", isPercent: true, isTotal: false },
                  ]
                }
              ];

              return (
                <div className="overflow-x-auto" id="table-cobertura-total-vs-plano-wrapper">
                  <table className="w-full text-xs text-left" id="table-cobertura-total-vs-plano">
                    <thead>
                      <tr className="border-b border-border border-opacity-40 bg-bg-secondary/20">
                        <th className="py-2.5 px-3 font-bold text-text-secondary uppercase tracking-wider pl-4 min-w-[200px]">
                          Métrica / Grupo
                        </th>
                        {columns.map((col: any, index: number) => (
                          <th key={index} className="py-2.5 px-3 font-bold text-text-secondary uppercase tracking-wider text-right pr-4 min-w-[120px]">
                            {formatSemana(col.semana)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border divide-opacity-30">
                      {metricGroups.map((group, groupIdx) => (
                        <React.Fragment key={groupIdx}>
                          {group.rows.map((row, rowIdx) => (
                            <tr
                              key={rowIdx}
                              className={`transition-colors ${
                                row.isTotal
                                  ? `bg-indigo-50/60 dark:bg-indigo-950/30 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/40 ${groupIdx > 0 ? 'border-t-2 border-border/60' : ''}`
                                  : 'hover:bg-bg-secondary/30 odd:bg-card even:bg-bg-secondary/10'
                              }`}
                            >
                              <td className={`py-2.5 px-3 truncate ${
                                row.isTotal
                                  ? 'font-bold text-sm text-indigo-950 dark:text-indigo-200 pl-4'
                                  : 'font-medium text-xs text-text-secondary pl-8'
                              }`}>
                                {row.label}
                              </td>
                              {columns.map((col: any, colIdx: number) => {
                                const rawVal = col[row.key];
                                const isNull = rawVal === null || rawVal === undefined;

                                let valDisplay = "—";
                                if (!isNull) {
                                  if (row.isPercent) {
                                    valDisplay = `${Number(rawVal).toFixed(1).replace('.', ',')}%`;
                                  } else {
                                    valDisplay = `${Number(rawVal).toLocaleString('pt-BR')}`;
                                  }
                                }

                                let variationNode = null;

                                if (colIdx > 0) {
                                  const prevCol = columns[colIdx - 1];
                                  const prevRawVal = prevCol[row.key];
                                  const prevIsNull = prevRawVal === null || prevRawVal === undefined;

                                  if (!isNull && !prevIsNull) {
                                    const diff = Number(rawVal) - Number(prevRawVal);

                                    const isPositive = diff > 0;
                                    const isNegative = diff < 0;

                                    let colorClass = "text-slate-400 dark:text-slate-500";
                                    if (isPositive) {
                                      colorClass = group.isInverted
                                        ? "text-rose-600 dark:text-rose-400"
                                        : "text-emerald-600 dark:text-emerald-400";
                                    } else if (isNegative) {
                                      colorClass = group.isInverted
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-rose-600 dark:text-rose-400";
                                    }

                                    if (row.isPercent) {
                                      const diffFixed = Number(diff.toFixed(1));
                                      if (diffFixed > 0) {
                                        variationNode = (
                                          <span className={`${colorClass} font-bold text-[10px] ml-1.5 whitespace-nowrap`}>
                                            +{diffFixed.toString().replace('.', ',')}% ▲
                                          </span>
                                        );
                                      } else if (diffFixed < 0) {
                                        variationNode = (
                                          <span className={`${colorClass} font-bold text-[10px] ml-1.5 whitespace-nowrap`}>
                                            {diffFixed.toString().replace('.', ',')}% ▼
                                          </span>
                                        );
                                      } else {
                                        variationNode = (
                                          <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                            —
                                          </span>
                                        );
                                      }
                                    } else {
                                      if (diff > 0) {
                                        variationNode = (
                                          <span className={`${colorClass} font-bold text-[10px] ml-1.5 whitespace-nowrap`}>
                                            +{diff.toLocaleString('pt-BR')} ▲
                                          </span>
                                        );
                                      } else if (diff < 0) {
                                        variationNode = (
                                          <span className={`${colorClass} font-bold text-[10px] ml-1.5 whitespace-nowrap`}>
                                            {diff.toLocaleString('pt-BR')} ▼
                                          </span>
                                        );
                                      } else {
                                        variationNode = (
                                          <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                            —
                                          </span>
                                        );
                                      }
                                    }
                                  } else {
                                    variationNode = (
                                      <span className="text-slate-400 dark:text-slate-500 font-medium text-[10px] ml-1.5 whitespace-nowrap">
                                        —
                                      </span>
                                    );
                                  }
                                }

                                return (
                                  <td
                                    key={colIdx}
                                    className={`py-2.5 px-3 text-right pr-4 ${
                                      row.isTotal
                                        ? 'font-bold text-sm text-text-primary'
                                        : 'font-medium text-xs text-text-secondary'
                                    }`}
                                  >
                                    <div className="inline-flex items-center justify-end">
                                      <span>{valDisplay}</span>
                                      {variationNode}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>
      </div>

      {/* Linha Divisória */}
      <div className="border-t border-border border-opacity-40 my-10" id="divider-avanco-diario" />

      {/* Seção: Avanço Diário por Etapa */}
      <div className="flex flex-col gap-6 mb-6" id="section-avanco-diario">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="header-avanco-diario">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text-primary" id="title-avanco-diario">
              Avanço Diário por Etapa
            </h2>
            <p className="text-sm text-text-secondary mt-1" id="desc-avanco-diario">
              Acompanhe a evolução acumulada dia a dia das conclusões de tarefas por etapa do playbook.
            </p>
          </div>

          {/* Dropdown de Seletor de Playbook */}
          <div className="w-full sm:w-72" id="seletor-playbook-wrapper">
            <select
              value={selectedPlaybookId}
              onChange={(e) => setSelectedPlaybookId(e.target.value)}
              className="w-full h-10 px-3 py-2 bg-card border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium cursor-pointer shadow-sm"
              id="seletor-playbook"
            >
              <option value="">Selecione um playbook...</option>
              {playbooksList.map((pb) => (
                <option key={pb.id} value={pb.id}>
                  {pb.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card do Gráfico / Estados Vazios */}
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col min-h-[420px]" id="card-avanco-diario-chart">
          {!selectedPlaybookId ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center border border-dashed border-border rounded-lg bg-slate-50/30 dark:bg-slate-900/10" id="avanco-diario-vazio-seletor">
              <span className="text-xs text-text-secondary font-medium max-w-sm">
                Selecione um playbook para ver o avanço diário
              </span>
            </div>
          ) : loadingStepData ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16" id="avanco-diario-loading">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
              <span className="text-xs text-text-secondary font-medium">Carregando avanço do playbook...</span>
            </div>
          ) : stepChartData.status === 'empty' ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-center border border-dashed border-border rounded-lg bg-slate-50/30 dark:bg-slate-900/10 p-6" id="avanco-diario-vazio-dados">
              <span className="text-xs text-text-secondary font-medium max-w-md leading-relaxed">
                Ainda não há dados de avanço registrados para este playbook. O rastreamento começou em {new Date().toLocaleDateString('pt-BR')} — os números vão aparecer conforme as tasks forem concluídas.
              </span>
            </div>
          ) : stepChartData.chartData ? (
            <div className="h-[360px] w-full" id="avanco-diario-chart-wrapper">
              <Bar data={stepChartData.chartData} options={stackedBarChartOptions} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

