import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Playbook, PlaybookTask } from '../types';
import { User, Filter, AlertCircle, Loader2, ArrowRight, ChevronDown, Bookmark, Trash2, Plus, ArrowLeft, BookOpen, X, Calendar, TrendingUp, Clock } from 'lucide-react';
import { SalesforceLinkButton } from '../components/ui/SalesforceLinkButton';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
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
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const formatCohortWeekLabel = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
};

const getCohortHeatmapStyle = (val: number | null): { style: React.CSSProperties; className: string } => {
  if (val === null || val === undefined || isNaN(val)) {
    return { style: {}, className: '' };
  }

  const clamped = Math.max(0, Math.min(100, val));

  const stops: Array<{ pct: number; bg: [number, number, number] }> = [
    { pct: 0,   bg: [254, 202, 202] }, // Vermelho (Red-200)
    { pct: 59,  bg: [254, 226, 226] }, // Vermelho suave
    { pct: 60,  bg: [254, 215, 170] }, // Laranja claro (Orange-200)
    { pct: 65,  bg: [254, 240, 138] }, // Amarelo/bege (Yellow-200)
    { pct: 70,  bg: [187, 247, 208] }, // Verde claro (Green-200)
    { pct: 75,  bg: [134, 239, 172] }, // Verde médio (Green-300)
    { pct: 80,  bg: [34, 197, 94]   }, // Verde forte (Green-500)
    { pct: 100, bg: [21, 128, 61]   }, // Verde muito forte (Green-700)
  ];

  let lower = stops[0];
  let upper = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].pct && clamped <= stops[i + 1].pct) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  const range = upper.pct - lower.pct;
  const factor = range === 0 ? 0 : (clamped - lower.pct) / range;

  const r = Math.round(lower.bg[0] + factor * (upper.bg[0] - lower.bg[0]));
  const g = Math.round(lower.bg[1] + factor * (upper.bg[1] - lower.bg[1]));
  const b = Math.round(lower.bg[2] + factor * (upper.bg[2] - lower.bg[2]));

  let textColor = 'rgb(20, 83, 45)';
  if (clamped < 60) {
    textColor = 'rgb(153, 27, 27)';
  } else if (clamped < 65) {
    textColor = 'rgb(154, 52, 18)';
  } else if (clamped < 70) {
    textColor = 'rgb(113, 63, 18)';
  } else if (clamped >= 80) {
    textColor = 'rgb(255, 255, 255)';
  }

  let fontWeightClass = 'font-medium';
  if (clamped >= 80) fontWeightClass = 'font-bold';
  else if (clamped >= 70) fontWeightClass = 'font-semibold';

  return {
    style: {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      color: textColor,
    },
    className: fontWeightClass,
  };
};

const getMondayOfWeek = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  return monday.toISOString().split('T')[0];
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

interface Partner {
  id: string;
  accountancy_id: string;
  salesforce_id?: string | null;
  nome: string;
  gerente: string | null;
  segmento?: string | null;
  percentual_engajamento?: number | string | null;
}

interface PlanTask {
  id: string;
  plan_id: string;
  titulo: string;
  status: string;
  ordem: number;
  deletada_em: string | null;
}

interface PlanWithDetails {
  id: string;
  partner_id: string;
  playbook_id: string;
  ativo: boolean;
  status_conclusao?: 'sucesso' | 'sem_sucesso' | null;
  created_at: string;
  partners: Partner | null;
  tasks: PlanTask[];
}

interface KanbanCard {
  planId: string;
  partnerId: string;
  partnerName: string;
  accountancyId: string;
  salesforceId?: string | null;
  gerente: string;
  segmento?: string | null;
  percentualEngajamento?: number | string | null;
  ativo: boolean;
  status_conclusao?: 'sucesso' | 'sem_sucesso' | null;
  tasks: PlanTask[];
}

interface KanbanColumnData {
  id: string;
  titulo: string;
  ordem?: number;
  cards: KanbanCard[];
  colorClass: string;
  badgeClass: string;
}

interface StepCompletion {
  task_id: string;
  ordem: number;
  alterado_em: string;
}

interface StageMetrics {
  stageName: string;
  funilPartners: number;
  funilPct: number;
  stagePartners: number;
  stagePartnersPct: number;
  stageLicencasEngajadas: number;
  stageTotalLicencas: number;
  stageTaxaEngajamento: number;
}

interface ConcludedSubMetric {
  title: string;
  type: 'sucesso' | 'sem_sucesso' | 'nao_classificado';
  partnersCount: number;
  partnersPct: number;
  funilCount: number;
  funilPct: number;
  licencasEngajadas: number;
  totalLicencas: number;
  taxaEngajamento: number;
}

interface ConcludedMetrics {
  totalEncerradosPartners: number;
  totalEncerradosPct: number;
  funilPartners: number;
  funilPct: number;
  licencasEngajadas: number;
  totalLicencas: number;
  taxaEngajamento: number;
  subRows: ConcludedSubMetric[];
}

interface OverallKPIs {
  totalPartners: number;
  totalLicencas: number;
  totalLicencasEngajadas: number;
  taxaGeralEngajamento: number;
}

interface ImportEngagementPoint {
  dateStr: string;
  formattedDate: string;
  totalLicencas: number;
  totalEngajadas: number;
  taxa: number;
}

interface UnsuccessfulReasonCount {
  motivo: string;
  count: number;
}

const formatEngajamento = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    const norm = val <= 1 && val > 0 ? Math.round(val * 100) : Math.round(val);
    return `${norm}%`;
  }
  const str = String(val).trim().replace('%', '').replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return '—';
  const norm = num <= 1 && num > 0 ? Math.round(num * 100) : Math.round(num);
  return `${norm}%`;
};

export const PlaybookAcompanhamento: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [loadingPlaybook, setLoadingPlaybook] = useState(true);

  // Step Evolution Period Toggle State
  const [stepPeriodMode, setStepPeriodMode] = useState<'dod' | 'wow' | 'mom'>('dod');

  const [columns, setColumns] = useState<KanbanColumnData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter states
  const [selectedPlanos, setSelectedPlanos] = useState<string[]>([]);
  const [selectedGerentes, setSelectedGerentes] = useState<string[]>([]);

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

  // Raw data from fetch
  const [rawPlans, setRawPlans] = useState<PlanWithDetails[]>([]);
  const [playbookTasks, setPlaybookTasks] = useState<PlaybookTask[]>([]);
  const [stepCompletions, setStepCompletions] = useState<StepCompletion[]>([]);

  // Stage Metrics State
  const [stageMetrics, setStageMetrics] = useState<StageMetrics[]>([]);
  const [concludedMetrics, setConcludedMetrics] = useState<ConcludedMetrics | null>(null);
  const [isConcluidoExpanded, setIsConcluidoExpanded] = useState<boolean>(false);
  const [overallKPIs, setOverallKPIs] = useState<OverallKPIs>({
    totalPartners: 0,
    totalLicencas: 0,
    totalLicencasEngajadas: 0,
    taxaGeralEngajamento: 0,
  });
  const [engagementTimeline, setEngagementTimeline] = useState<ImportEngagementPoint[]>([]);
  const [unsuccessfulReasons, setUnsuccessfulReasons] = useState<UnsuccessfulReasonCount[]>([]);
  const [loadingStageData, setLoadingStageData] = useState<boolean>(false);

  // Cohort states
  const [cohortEngEtapa, setCohortEngEtapa] = useState<'criado' | 'iniciado' | 'finalizado'>('criado');
  const [cohortLicEtapa, setCohortLicEtapa] = useState<'criado' | 'iniciado' | 'finalizado'>('criado');
  const [cohortRawPlans, setCohortRawPlans] = useState<any[]>([]);
  const [cohortRawSnapshots, setCohortRawSnapshots] = useState<any[]>([]);
  const [cohortTasksByPlan, setCohortTasksByPlan] = useState<Map<string, any[]>>(new Map());

  // Fetch Playbook Data
  useEffect(() => {
    async function loadPlaybook() {
      if (!id) return;
      try {
        setLoadingPlaybook(true);
        const { data, error } = await supabase
          .from('playbooks')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setPlaybook(data);
      } catch (err) {
        console.error('Erro ao carregar playbook:', err);
        setErrorMsg('Playbook não encontrado.');
      } finally {
        setLoadingPlaybook(false);
      }
    }

    loadPlaybook();
  }, [id]);

  const fetchSavedFilters = async () => {
    try {
      setLoadingFilters(true);
      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .eq('dashboard', 'playbook_kanban')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedFilters(data || []);
    } catch (err) {
      console.error('Erro ao buscar filtros salvos do playbook kanban:', err);
    } finally {
      setLoadingFilters(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchSavedFilters();
    }
  }, [user]);

  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    if (selectedPlanos.length === 0 && selectedGerentes.length === 0) return;

    try {
      setIsSavingFilter(true);
      const { error } = await supabase
        .from('saved_filters')
        .insert({
          user_id: user?.id,
          dashboard: 'playbook_kanban',
          nome: newFilterName.trim(),
          planos: selectedPlanos,
          gerentes: selectedGerentes,
          plano_modo: 'incluir',
          gerente_modo: 'incluir'
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

  const handleDeleteFilter = async (filterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', filterId);

      if (error) throw error;
      await fetchSavedFilters();
    } catch (err) {
      console.error('Erro ao excluir filtro:', err);
    }
  };

  const handleApplyFilter = (filter: any) => {
    setSelectedPlanos(filter.planos || []);
    setSelectedGerentes(filter.gerentes || []);
  };

  const availablePlanos = useMemo(() => {
    const set = new Set<string>();
    rawPlans.forEach(plan => {
      if (plan.partners?.segmento) {
        set.add(plan.partners.segmento.trim());
      }
    });
    return Array.from(set).sort();
  }, [rawPlans]);

  const availableGerentes = useMemo(() => {
    const set = new Set<string>();
    rawPlans.forEach(plan => {
      if (plan.partners?.gerente) {
        set.add(plan.partners.gerente.trim());
      }
    });
    return Array.from(set).sort();
  }, [rawPlans]);

  const filteredPlanos = useMemo(() => {
    if (!planoSearch.trim()) return availablePlanos;
    return availablePlanos.filter(p => p.toLowerCase().includes(planoSearch.toLowerCase().trim()));
  }, [availablePlanos, planoSearch]);

  const filteredGerentes = useMemo(() => {
    if (!gerenteSearch.trim()) return availableGerentes;
    return availableGerentes.filter(g => g.toLowerCase().includes(gerenteSearch.toLowerCase().trim()));
  }, [availableGerentes, gerenteSearch]);

  // Load stage metrics and chart data
  useEffect(() => {
    if (!playbook?.id) {
      return;
    }

    let isMounted = true;

    async function loadStageMetrics() {
      setLoadingStageData(true);
      try {
        const pageSize = 1000;

        // 1. Fetch playbook tasks
        const { data: pbTasks, error: pbTasksErr } = await supabase
          .from('playbook_tasks')
          .select('id, titulo, ordem')
          .eq('playbook_id', playbook.id)
          .order('ordem', { ascending: true });

        if (pbTasksErr) throw pbTasksErr;
        const playbookTasksList = (pbTasks || []) as { id: string; titulo: string; ordem: number }[];

        // 2. Fetch plans with partners details
        let allPlaybookPlans: {
          id: string;
          partner_id: string;
          ativo: boolean;
          status_conclusao?: string | null;
          motivo_insucesso?: string | null;
          concluido_em?: string | null;
          created_at: string;
          partners: { id: string; segmento: string | null; gerente: string | null } | null;
        }[] = [];
        let fromP = 0;
        while (true) {
          const { data: pData, error: pErr } = await supabase
            .from('plans')
            .select(`
              id,
              partner_id,
              ativo,
              status_conclusao,
              motivo_insucesso,
              concluido_em,
              created_at,
              partners (
                id,
                segmento,
                gerente
              )
            `)
            .eq('playbook_id', playbook.id)
            .range(fromP, fromP + pageSize - 1);

          if (pErr) break;
          if (pData) allPlaybookPlans = allPlaybookPlans.concat(pData as any);
          if (!pData || pData.length < pageSize) break;
          fromP += pageSize;
        }

        console.log('[COHORT_DIAGNOSTIC] allPlaybookPlans.length:', allPlaybookPlans.length);
        console.log('[COHORT_DIAGNOSTIC] First 5 created_at:', allPlaybookPlans.slice(0, 5).map(p => p.created_at));

        // Fetch partner_snapshots for all partners in this playbook for cohorts
        const allPlaybookPartnerIds = Array.from(new Set(allPlaybookPlans.map(p => p.partner_id).filter(Boolean)));
        let allSnapshots: { partner_id: string; imported_at: string; licencas: number; licencas_engajadas: number; plano: string | null }[] = [];
        if (allPlaybookPartnerIds.length > 0) {
          for (let i = 0; i < allPlaybookPartnerIds.length; i += pageSize) {
            const chunk = allPlaybookPartnerIds.slice(i, i + pageSize);
            let fromSnap = 0;
            while (true) {
              const { data: snapData, error: snapErr } = await supabase
                .from('partner_snapshots')
                .select('partner_id, imported_at, licencas, licencas_engajadas, plano')
                .in('partner_id', chunk)
                .range(fromSnap, fromSnap + pageSize - 1);

              if (snapErr) break;
              if (snapData) allSnapshots = allSnapshots.concat(snapData as any);
              if (!snapData || snapData.length < pageSize) break;
              fromSnap += pageSize;
            }
          }
        }

        // Fetch non-deleted tasks for all plans in this playbook for cohorts
        const allPlaybookPlanIds = allPlaybookPlans.map((p) => p.id);
        const tasksByPlanMap = new Map<string, { id: string; plan_id: string; ordem: number; status: string; deletada_em?: string | null }[]>();

        for (let i = 0; i < allPlaybookPlanIds.length; i += pageSize) {
          const chunk = allPlaybookPlanIds.slice(i, i + pageSize);
          const { data: tData, error: tErr } = await supabase
            .from('tasks')
            .select('id, plan_id, ordem, status, deletada_em')
            .is('deletada_em', null)
            .in('plan_id', chunk);

          if (tErr) break;
          tData?.forEach((t: any) => {
            const list = tasksByPlanMap.get(t.plan_id) || [];
            list.push(t);
            tasksByPlanMap.set(t.plan_id, list);
          });
        }

        const selectedPlanosSet = new Set(selectedPlanos);
        const selectedGerentesNormSet = new Set(selectedGerentes.map(g => g.trim().toLowerCase()).filter(Boolean));

        const activePlans = allPlaybookPlans.filter(p => {
          if (selectedPlanosSet.size > 0) {
            const seg = p.partners?.segmento?.trim();
            if (!seg || !selectedPlanosSet.has(seg)) return false;
          }
          if (selectedGerentesNormSet.size > 0) {
            const ger = (p.partners?.gerente || '').trim().toLowerCase();
            if (!ger || !selectedGerentesNormSet.has(ger)) return false;
          }
          return true;
        });

        if (activePlans.length === 0) {
          if (isMounted) {
            setCohortRawPlans(allPlaybookPlans);
            setCohortRawSnapshots(allSnapshots);
            setCohortTasksByPlan(tasksByPlanMap);
            setStageMetrics([]);
            setConcludedMetrics(null);
            setOverallKPIs({
              totalPartners: 0,
              totalLicencas: 0,
              totalLicencasEngajadas: 0,
              taxaGeralEngajamento: 0,
            });
            setEngagementTimeline([]);
            setUnsuccessfulReasons([]);
            setLoadingStageData(false);
          }
          return;
        }

        // 3. Fetch partners
        const partnerIds = Array.from(new Set(activePlans.map((p) => p.partner_id)));
        const partnerMap = new Map<string, { licencas: number; licencasEngajadas: number }>();

        for (let i = 0; i < partnerIds.length; i += pageSize) {
          const chunk = partnerIds.slice(i, i + pageSize);
          const { data: partData, error: partErr } = await supabase
            .from('partners')
            .select('id, licencas, licencas_engajadas')
            .in('id', chunk);

          if (partErr) break;
          partData?.forEach((pt: any) => {
            partnerMap.set(pt.id, {
              licencas: Number(pt.licencas) || 0,
              licencasEngajadas: Number(pt.licencas_engajadas) || 0,
            });
          });
        }

        // 3b. Calculate engagement timeline for active partnerIds from allSnapshots
        let engagementPoints: ImportEngagementPoint[] = [];
        if (partnerIds.length > 0) {
          const activePartnerIdSet = new Set(partnerIds);
          const dayGroupMap = new Map<string, { sumLicencas: number; sumEngajadas: number }>();
          allSnapshots.forEach((s) => {
            if (!s.imported_at || !activePartnerIdSet.has(s.partner_id)) return;
            const dateStr = typeof s.imported_at === 'string'
              ? s.imported_at.split('T')[0]
              : String(s.imported_at).substring(0, 10);

            const curr = dayGroupMap.get(dateStr) || { sumLicencas: 0, sumEngajadas: 0 };
            curr.sumLicencas += Number(s.licencas) || 0;
            curr.sumEngajadas += Number(s.licencas_engajadas) || 0;
            dayGroupMap.set(dateStr, curr);
          });

          const sortedDates = Array.from(dayGroupMap.keys()).sort((a, b) => a.localeCompare(b));
          engagementPoints = sortedDates.map((dateStr) => {
            const data = dayGroupMap.get(dateStr)!;
            const taxa = data.sumLicencas > 0 ? (data.sumEngajadas / data.sumLicencas) * 100 : 0;
            const parts = dateStr.split('-');
            const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;

            return {
              dateStr,
              formattedDate,
              totalLicencas: data.sumLicencas,
              totalEngajadas: data.sumEngajadas,
              taxa: Number(taxa.toFixed(1)),
            };
          });
        }

        // Compute overall KPIs
        let totalLic = 0;
        let totalEng = 0;
        activePlans.forEach((plan) => {
          const pInfo = partnerMap.get(plan.partner_id) || { licencas: 0, licencasEngajadas: 0 };
          totalLic += pInfo.licencas;
          totalEng += pInfo.licencasEngajadas;
        });

        const totalPartnersCount = activePlans.length;
        const overallRate = totalLic > 0 ? Math.round((totalEng / totalLic) * 100) : 0;

        // Map: stageIndex -> { partnersCount, totalLicencas, licencasEngajadas }
        const metricsMap = new Map<number, { partnersCount: number; totalLicencas: number; licencasEngajadas: number }>();
        for (let idx = 0; idx <= playbookTasksList.length; idx++) {
          metricsMap.set(idx, { partnersCount: 0, totalLicencas: 0, licencasEngajadas: 0 });
        }

        const planMaxCompletedOrdemMap = new Map<string, number>();

        activePlans.forEach((plan) => {
          const partnerInfo = partnerMap.get(plan.partner_id) || { licencas: 0, licencasEngajadas: 0 };
          const planTasks = tasksByPlanMap.get(plan.id) || [];

          let maxCompletedOrdem = -1;
          planTasks.forEach((t) => {
            if (t.status === 'concluida' && t.ordem > maxCompletedOrdem) {
              maxCompletedOrdem = t.ordem;
            }
          });

          planMaxCompletedOrdemMap.set(plan.id, maxCompletedOrdem);

          const todasTasksConcluidas = planTasks.length > 0 && planTasks.every((t) => t.status === 'concluida');
          const isEncerrado = plan.ativo === false || todasTasksConcluidas;

          if (isEncerrado) {
            return;
          }

          let stageIdx = 0;
          if (maxCompletedOrdem !== -1) {
            const foundIdx = playbookTasksList.findIndex((pt) => pt.ordem === maxCompletedOrdem);
            if (foundIdx !== -1) {
              stageIdx = foundIdx + 1;
            } else {
              const fallbackIdx = playbookTasksList.findIndex((pt) => pt.ordem <= maxCompletedOrdem);
              stageIdx = fallbackIdx !== -1 ? fallbackIdx + 1 : 0;
            }
          }

          const curr = metricsMap.get(stageIdx) || { partnersCount: 0, totalLicencas: 0, licencasEngajadas: 0 };
          curr.partnersCount += 1;
          curr.totalLicencas += partnerInfo.licencas;
          curr.licencasEngajadas += partnerInfo.licencasEngajadas;
          metricsMap.set(stageIdx, curr);
        });

        const getFunilCount = (stageIndex: number) => {
          if (stageIndex === 0) return totalPartnersCount;
          const targetOrdem = playbookTasksList[stageIndex - 1].ordem;
          let count = 0;
          planMaxCompletedOrdemMap.forEach((maxOrdem) => {
            if (maxOrdem >= targetOrdem) {
              count++;
            }
          });
          return count;
        };

        const finalMetrics: StageMetrics[] = [];

        // Stage 0 = "Não iniciado"
        const unstarted = metricsMap.get(0) || { partnersCount: 0, totalLicencas: 0, licencasEngajadas: 0 };
        const funil0 = getFunilCount(0);
        finalMetrics.push({
          stageName: 'Não iniciado',
          funilPartners: funil0,
          funilPct: totalPartnersCount > 0 ? Math.round((funil0 / totalPartnersCount) * 100) : 0,
          stagePartners: unstarted.partnersCount,
          stagePartnersPct: totalPartnersCount > 0 ? Math.round((unstarted.partnersCount / totalPartnersCount) * 100) : 0,
          stageLicencasEngajadas: unstarted.licencasEngajadas,
          stageTotalLicencas: unstarted.totalLicencas,
          stageTaxaEngajamento: unstarted.totalLicencas > 0 ? Math.round((unstarted.licencasEngajadas / unstarted.totalLicencas) * 100) : 0,
        });

        // Stages 1..N
        playbookTasksList.forEach((pt, i) => {
          const m = metricsMap.get(i + 1) || { partnersCount: 0, totalLicencas: 0, licencasEngajadas: 0 };
          const funilCount = getFunilCount(i + 1);
          finalMetrics.push({
            stageName: `${i + 1}. ${pt.titulo}`,
            funilPartners: funilCount,
            funilPct: totalPartnersCount > 0 ? Math.round((funilCount / totalPartnersCount) * 100) : 0,
            stagePartners: m.partnersCount,
            stagePartnersPct: totalPartnersCount > 0 ? Math.round((m.partnersCount / totalPartnersCount) * 100) : 0,
            stageLicencasEngajadas: m.licencasEngajadas,
            stageTotalLicencas: m.totalLicencas,
            stageTaxaEngajamento: m.totalLicencas > 0 ? Math.round((m.licencasEngajadas / m.totalLicencas) * 100) : 0,
          });
        });

        const partnerConcludedMap = new Map<string, {
          plan: typeof activePlans[0];
          statusClassification: 'sucesso' | 'sem_sucesso' | 'nao_classificado';
        }>();

        activePlans.forEach(p => {
          const pTasks = tasksByPlanMap.get(p.id) || [];
          const todasTasksConcluidas = pTasks.length > 0 && pTasks.every((t) => t.status === 'concluida');
          const isEncerrado = p.ativo === false || todasTasksConcluidas;

          if (isEncerrado) {
            let statusClassification: 'sucesso' | 'sem_sucesso' | 'nao_classificado' = 'nao_classificado';
            if (p.status_conclusao === 'sucesso') {
              statusClassification = 'sucesso';
            } else if (p.status_conclusao === 'sem_sucesso') {
              statusClassification = 'sem_sucesso';
            }
            partnerConcludedMap.set(p.partner_id, {
              plan: p,
              statusClassification,
            });
          }
        });

        const totalEncerradosPartnersCount = partnerConcludedMap.size;
        let encerradosTotalLic = 0;
        let encerradosTotalEng = 0;

        const subBuckets: Record<'sucesso' | 'sem_sucesso' | 'nao_classificado', {
          count: number;
          totalLic: number;
          totalEng: number;
        }> = {
          sucesso: { count: 0, totalLic: 0, totalEng: 0 },
          sem_sucesso: { count: 0, totalLic: 0, totalEng: 0 },
          nao_classificado: { count: 0, totalLic: 0, totalEng: 0 },
        };

        partnerConcludedMap.forEach(({ statusClassification }, partnerId) => {
          const pInfo = partnerMap.get(partnerId) || { licencas: 0, licencasEngajadas: 0 };
          encerradosTotalLic += pInfo.licencas;
          encerradosTotalEng += pInfo.licencasEngajadas;

          subBuckets[statusClassification].count += 1;
          subBuckets[statusClassification].totalLic += pInfo.licencas;
          subBuckets[statusClassification].totalEng += pInfo.licencasEngajadas;
        });

        const concludedTaxa = encerradosTotalLic > 0 ? Math.round((encerradosTotalEng / encerradosTotalLic) * 100) : 0;
        const concludedFunilPct = totalPartnersCount > 0 ? Math.round((totalEncerradosPartnersCount / totalPartnersCount) * 100) : 0;
        const concludedPartnersPct = totalPartnersCount > 0 ? Math.round((totalEncerradosPartnersCount / totalPartnersCount) * 100) : 0;

        const subRowsData: ConcludedSubMetric[] = [
          {
            title: 'Concluído com Sucesso',
            type: 'sucesso',
            partnersCount: subBuckets.sucesso.count,
            partnersPct: totalPartnersCount > 0 ? Math.round((subBuckets.sucesso.count / totalPartnersCount) * 100) : 0,
            funilCount: subBuckets.sucesso.count,
            funilPct: totalPartnersCount > 0 ? Math.round((subBuckets.sucesso.count / totalPartnersCount) * 100) : 0,
            licencasEngajadas: subBuckets.sucesso.totalEng,
            totalLicencas: subBuckets.sucesso.totalLic,
            taxaEngajamento: subBuckets.sucesso.totalLic > 0 ? Math.round((subBuckets.sucesso.totalEng / subBuckets.sucesso.totalLic) * 100) : 0,
          },
          {
            title: 'Concluído sem Sucesso',
            type: 'sem_sucesso',
            partnersCount: subBuckets.sem_sucesso.count,
            partnersPct: totalPartnersCount > 0 ? Math.round((subBuckets.sem_sucesso.count / totalPartnersCount) * 100) : 0,
            funilCount: subBuckets.sem_sucesso.count,
            funilPct: totalPartnersCount > 0 ? Math.round((subBuckets.sem_sucesso.count / totalPartnersCount) * 100) : 0,
            licencasEngajadas: subBuckets.sem_sucesso.totalEng,
            totalLicencas: subBuckets.sem_sucesso.totalLic,
            taxaEngajamento: subBuckets.sem_sucesso.totalLic > 0 ? Math.round((subBuckets.sem_sucesso.totalEng / subBuckets.sem_sucesso.totalLic) * 100) : 0,
          },
          {
            title: 'Não Classificado',
            type: 'nao_classificado',
            partnersCount: subBuckets.nao_classificado.count,
            partnersPct: totalPartnersCount > 0 ? Math.round((subBuckets.nao_classificado.count / totalPartnersCount) * 100) : 0,
            funilCount: subBuckets.nao_classificado.count,
            funilPct: totalPartnersCount > 0 ? Math.round((subBuckets.nao_classificado.count / totalPartnersCount) * 100) : 0,
            licencasEngajadas: subBuckets.nao_classificado.totalEng,
            totalLicencas: subBuckets.nao_classificado.totalLic,
            taxaEngajamento: subBuckets.nao_classificado.totalLic > 0 ? Math.round((subBuckets.nao_classificado.totalEng / subBuckets.nao_classificado.totalLic) * 100) : 0,
          },
        ];

        const calculatedConcludedMetrics: ConcludedMetrics = {
          totalEncerradosPartners: totalEncerradosPartnersCount,
          totalEncerradosPct: concludedPartnersPct,
          funilPartners: totalEncerradosPartnersCount,
          funilPct: concludedFunilPct,
          licencasEngajadas: encerradosTotalEng,
          totalLicencas: encerradosTotalLic,
          taxaEngajamento: concludedTaxa,
          subRows: subRowsData,
        };

        // Group by motivo_insucesso for plans with status_conclusao === 'sem_sucesso'
        const reasonCountsMap = new Map<string, number>();
        activePlans.forEach((p) => {
          if (p.status_conclusao === 'sem_sucesso') {
            const rawMotivo = p.motivo_insucesso && p.motivo_insucesso.trim() ? p.motivo_insucesso.trim() : 'Não informado';
            reasonCountsMap.set(rawMotivo, (reasonCountsMap.get(rawMotivo) || 0) + 1);
          }
        });

        const sortedReasonsList: UnsuccessfulReasonCount[] = Array.from(reasonCountsMap.entries())
          .map(([motivo, count]) => ({ motivo, count }))
          .sort((a, b) => b.count - a.count);

        if (isMounted) {
          setCohortRawPlans(allPlaybookPlans);
          setCohortRawSnapshots(allSnapshots);
          setCohortTasksByPlan(tasksByPlanMap);
          setStageMetrics(finalMetrics);
          setConcludedMetrics(calculatedConcludedMetrics);
          setOverallKPIs({
            totalPartners: totalPartnersCount,
            totalLicencas: totalLic,
            totalLicencasEngajadas: totalEng,
            taxaGeralEngajamento: overallRate,
          });
          setEngagementTimeline(engagementPoints);
          setUnsuccessfulReasons(sortedReasonsList);
          setLoadingStageData(false);
        }
      } catch (err) {
        console.error('Erro ao carregar engajamento por etapa:', err);
        if (isMounted) {
          setStageMetrics([]);
          setConcludedMetrics(null);
          setOverallKPIs({
            totalPartners: 0,
            totalLicencas: 0,
            totalLicencasEngajadas: 0,
            taxaGeralEngajamento: 0,
          });
          setEngagementTimeline([]);
          setUnsuccessfulReasons([]);
          setLoadingStageData(false);
        }
      }
    }

    loadStageMetrics();

    return () => {
      isMounted = false;
    };
  }, [playbook?.id, selectedPlanos, selectedGerentes]);

  // Cohort Engajamento calculation
  const cohortEngagementData = useMemo(() => {
    if (!cohortRawPlans || cohortRawPlans.length === 0) {
      return { status: 'empty' as const, cohorts: [], maxWeeks: 0, summary4Weeks: null, summary12Weeks: null };
    }

    const getMondayOfWeek = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00Z');
      if (isNaN(d.getTime())) return '';
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      return monday.toISOString().split('T')[0];
    };

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().split('T')[0];
    };

    const DATA_CORTE_SNAPSHOTS = '2026-05-11';

    const tasksByPlan = cohortTasksByPlan;

    const snapshotsByPartner = new Map<string, Array<{ importedAtDateStr: string; licencas: number; licencas_engajadas: number }>>();
    (cohortRawSnapshots || []).forEach((ps: any) => {
      if (!ps.partner_id || !ps.imported_at) return;
      const dateStr = typeof ps.imported_at === 'string' ? ps.imported_at.split('T')[0] : String(ps.imported_at).substring(0, 10);
      const list = snapshotsByPartner.get(ps.partner_id) || [];
      list.push({ importedAtDateStr: dateStr, licencas: Number(ps.licencas) || 0, licencas_engajadas: Number(ps.licencas_engajadas) || 0 });
      snapshotsByPartner.set(ps.partner_id, list);
    });
    snapshotsByPartner.forEach((list) => list.sort((a, b) => a.importedAtDateStr.localeCompare(b.importedAtDateStr)));

    const planEntries: Array<{ planId: string; partnerId: string; semanaEntrada: string }> = [];
    (cohortRawPlans || []).forEach((p: any) => {
      if (!p || !p.partner_id || !p.created_at) return;

      const planTasks = tasksByPlan.get(p.id) || [];
      const todasTasksConcluidas = planTasks.length > 0 && planTasks.every((t: any) => t.status === 'concluida');
      const hasCompletedTask = planTasks.some((t: any) => t.status === 'concluida');

      if (cohortEngEtapa === 'iniciado') {
        if (!(p.ativo === true && hasCompletedTask && !todasTasksConcluidas)) return;
      } else if (cohortEngEtapa === 'finalizado') {
        if (!(p.ativo === false || todasTasksConcluidas)) return;
      }

      const entryDate = typeof p.created_at === 'string' ? p.created_at.split('T')[0] : String(p.created_at).substring(0, 10);
      const semanaEntrada = getMondayOfWeek(entryDate);
      if (!semanaEntrada || semanaEntrada < DATA_CORTE_SNAPSHOTS) return;

      planEntries.push({ planId: p.id, partnerId: p.partner_id, semanaEntrada });
    });

    if (planEntries.length === 0) {
      return { status: 'empty' as const, cohorts: [], maxWeeks: 0, summary4Weeks: null, summary12Weeks: null };
    }

    const cohortMap = new Map<string, Array<{ planId: string; partnerId: string }>>();
    planEntries.forEach((entry) => {
      const list = cohortMap.get(entry.semanaEntrada) || [];
      list.push({ planId: entry.planId, partnerId: entry.partnerId });
      cohortMap.set(entry.semanaEntrada, list);
    });

    const sortedCohortWeeks = Array.from(cohortMap.keys()).sort((a, b) => a.localeCompare(b));
    const hojeStr = new Date().toISOString().split('T')[0];
    const diffDaysBetween = (startStr: string, endStr: string): number => {
      const d1 = new Date(startStr + 'T00:00:00Z');
      const d2 = new Date(endStr + 'T00:00:00Z');
      return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    };
    const maxWeeksAvailable = Math.max(8, ...sortedCohortWeeks.map((w) => Math.max(0, Math.floor(diffDaysBetween(w, hojeStr) / 7))));

    const cohorts = sortedCohortWeeks.map((semanaEntrada) => {
      const cohortPlans = cohortMap.get(semanaEntrada)!;
      const parts = semanaEntrada.split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : semanaEntrada;
      const planCount = cohortPlans.length;

      let totalLicencas = 0;
      cohortPlans.forEach((item) => {
        const partnerSnaps = snapshotsByPartner.get(item.partnerId);
        if (partnerSnaps && partnerSnaps.length > 0) {
          let latestSnap = partnerSnaps[partnerSnaps.length - 1];
          for (let i = partnerSnaps.length - 1; i >= 0; i--) {
            if (partnerSnaps[i].importedAtDateStr <= hojeStr) { latestSnap = partnerSnaps[i]; break; }
          }
          totalLicencas += (latestSnap.licencas || 0);
        }
      });

      const weeksData: Array<{ weekIndex: number; avgEngagement: number | null; sumEngajadas: number; sumLicencas: number }> = [];
      for (let N = 0; N <= maxWeeksAvailable; N++) {
        const dataReferencia = N === 0 ? addDays(semanaEntrada, 6) : addDays(semanaEntrada, N * 7);
        if (hojeStr < (N === 0 ? semanaEntrada : dataReferencia)) {
          weeksData.push({ weekIndex: N, avgEngagement: null, sumEngajadas: 0, sumLicencas: 0 });
        } else {
          let sumEngajadas = 0, sumLicencas = 0;
          cohortPlans.forEach((item) => {
            const partnerSnaps = snapshotsByPartner.get(item.partnerId);
            if (!partnerSnaps || partnerSnaps.length === 0) return;
            let validSnap: { licencas: number; licencas_engajadas: number } | null = null;
            for (let i = partnerSnaps.length - 1; i >= 0; i--) {
              if (partnerSnaps[i].importedAtDateStr <= dataReferencia) { validSnap = partnerSnaps[i]; break; }
            }
            if (validSnap) { sumEngajadas += (validSnap.licencas_engajadas || 0); sumLicencas += (validSnap.licencas || 0); }
          });
          const avg = sumLicencas > 0 ? (sumEngajadas / sumLicencas) * 100 : null;
          weeksData.push({ weekIndex: N, avgEngagement: avg, sumEngajadas, sumLicencas });
        }
      }

      return { semanaEntrada, label, rawDateString: semanaEntrada, planCount, totalLicencas, weeksData };
    });

    const calculateColumnBasedAverages = (maxCount: number) => {
      const sortedCohorts = [...cohorts].sort((a, b) => a.rawDateString.localeCompare(b.rawDateString));
      const averages: (number | null)[] = [];
      const usedCohortsSet = new Set<string>();

      for (let wIdx = 0; wIdx <= maxWeeksAvailable; wIdx++) {
        const validCohorts = sortedCohorts.filter(c => { const v = c.weeksData[wIdx]?.avgEngagement; return v !== null && v !== undefined; });
        const lastNCohorts = validCohorts.slice(-maxCount);
        if (lastNCohorts.length === 0) { averages.push(null); }
        else {
          const totalEngajadas = lastNCohorts.reduce((acc, c) => acc + (c.weeksData[wIdx].sumEngajadas || 0), 0);
          const totalLic = lastNCohorts.reduce((acc, c) => acc + (c.weeksData[wIdx].sumLicencas || 0), 0);
          averages.push(totalLic > 0 ? Number(((totalEngajadas / totalLic) * 100).toFixed(1)) : null);
          lastNCohorts.forEach(c => usedCohortsSet.add(c.rawDateString));
        }
      }

      if (usedCohortsSet.size === 0) {
        return { rangeLabel: '', planCountSum: 0, totalLicencasSum: 0, averages, count: 0 };
      }
      const usedCohortsList = sortedCohorts.filter(c => usedCohortsSet.has(c.rawDateString));
      const firstDate = formatCohortWeekLabel(usedCohortsList[0].rawDateString);
      const lastDate = formatCohortWeekLabel(usedCohortsList[usedCohortsList.length - 1].rawDateString);
      const rangeLabel = `(${firstDate} a ${lastDate})`;
      return {
        rangeLabel,
        planCountSum: usedCohortsList.reduce((acc, c) => acc + c.planCount, 0),
        totalLicencasSum: usedCohortsList.reduce((acc, c) => acc + c.totalLicencas, 0),
        averages,
        count: usedCohortsList.length
      };
    };

    return {
      status: 'ok' as const,
      cohorts,
      maxWeeks: maxWeeksAvailable,
      summary4Weeks: calculateColumnBasedAverages(4),
      summary12Weeks: calculateColumnBasedAverages(12)
    };
  }, [cohortRawPlans, cohortRawSnapshots, cohortTasksByPlan, cohortEngEtapa]);

  // Cohort Licenças calculation
  const cohortLicencasData = useMemo(() => {
    if (!cohortRawPlans || cohortRawPlans.length === 0) {
      return { status: 'empty' as const, cohorts: [], maxWeeks: 0, summary4Weeks: null, summary12Weeks: null };
    }

    const getMondayOfWeek = (dateStr: string) => {
      if (!dateStr) return '';
      const d = new Date(dateStr + 'T00:00:00Z');
      if (isNaN(d.getTime())) return '';
      const day = d.getUTCDay();
      const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      return monday.toISOString().split('T')[0];
    };

    const addDays = (dateStr: string, days: number): string => {
      const d = new Date(dateStr + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().split('T')[0];
    };

    const DATA_CORTE_SNAPSHOTS = '2026-05-11';

    const tasksByPlan = cohortTasksByPlan;

    const snapshotsByPartner = new Map<string, Array<{ importedAtDateStr: string; licencas: number }>>();
    (cohortRawSnapshots || []).forEach((ps: any) => {
      if (!ps.partner_id || !ps.imported_at) return;
      const dateStr = typeof ps.imported_at === 'string' ? ps.imported_at.split('T')[0] : String(ps.imported_at).substring(0, 10);
      const list = snapshotsByPartner.get(ps.partner_id) || [];
      list.push({ importedAtDateStr: dateStr, licencas: Number(ps.licencas) || 0 });
      snapshotsByPartner.set(ps.partner_id, list);
    });
    snapshotsByPartner.forEach((list) => list.sort((a, b) => a.importedAtDateStr.localeCompare(b.importedAtDateStr)));

    const planEntries: Array<{ planId: string; partnerId: string; semanaEntrada: string }> = [];
    (cohortRawPlans || []).forEach((p: any) => {
      if (!p || !p.partner_id || !p.created_at) return;

      const planTasks = tasksByPlan.get(p.id) || [];
      const todasTasksConcluidas = planTasks.length > 0 && planTasks.every((t: any) => t.status === 'concluida');
      const hasCompletedTask = planTasks.some((t: any) => t.status === 'concluida');

      if (cohortLicEtapa === 'iniciado') {
        if (!(p.ativo === true && hasCompletedTask && !todasTasksConcluidas)) return;
      } else if (cohortLicEtapa === 'finalizado') {
        if (!(p.ativo === false || todasTasksConcluidas)) return;
      }

      const entryDate = typeof p.created_at === 'string' ? p.created_at.split('T')[0] : String(p.created_at).substring(0, 10);
      const semanaEntrada = getMondayOfWeek(entryDate);
      if (!semanaEntrada || semanaEntrada < DATA_CORTE_SNAPSHOTS) return;

      planEntries.push({ planId: p.id, partnerId: p.partner_id, semanaEntrada });
    });

    if (planEntries.length === 0) {
      return { status: 'empty' as const, cohorts: [], maxWeeks: 0, summary4Weeks: null, summary12Weeks: null };
    }

    const cohortMap = new Map<string, Array<{ planId: string; partnerId: string }>>();
    planEntries.forEach((entry) => {
      const list = cohortMap.get(entry.semanaEntrada) || [];
      list.push({ planId: entry.planId, partnerId: entry.partnerId });
      cohortMap.set(entry.semanaEntrada, list);
    });

    const sortedCohortWeeks = Array.from(cohortMap.keys()).sort((a, b) => a.localeCompare(b));
    const hojeStr = new Date().toISOString().split('T')[0];
    const diffDaysBetween = (startStr: string, endStr: string): number => {
      const d1 = new Date(startStr + 'T00:00:00Z');
      const d2 = new Date(endStr + 'T00:00:00Z');
      return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    };
    const maxWeeksAvailable = Math.max(8, ...sortedCohortWeeks.map((w) => Math.max(0, Math.floor(diffDaysBetween(w, hojeStr) / 7))));

    const cohorts = sortedCohortWeeks.map((semanaEntrada) => {
      const cohortPlans = cohortMap.get(semanaEntrada)!;
      const parts = semanaEntrada.split('-');
      const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : semanaEntrada;
      const planCount = cohortPlans.length;

      let totalLicencas = 0;
      cohortPlans.forEach((item) => {
        const partnerSnaps = snapshotsByPartner.get(item.partnerId);
        if (partnerSnaps && partnerSnaps.length > 0) {
          let latestSnap = partnerSnaps[partnerSnaps.length - 1];
          for (let i = partnerSnaps.length - 1; i >= 0; i--) {
            if (partnerSnaps[i].importedAtDateStr <= hojeStr) { latestSnap = partnerSnaps[i]; break; }
          }
          totalLicencas += (latestSnap.licencas || 0);
        }
      });

      const weeksData: Array<{ weekIndex: number; sumLicencas: number | null }> = [];
      for (let N = 0; N <= maxWeeksAvailable; N++) {
        const dataReferencia = N === 0 ? addDays(semanaEntrada, 6) : addDays(semanaEntrada, N * 7);
        if (hojeStr < (N === 0 ? semanaEntrada : dataReferencia)) {
          weeksData.push({ weekIndex: N, sumLicencas: null });
        } else {
          let sumLicencas = 0;
          let hasAnySnapshot = false;
          cohortPlans.forEach((item) => {
            const partnerSnaps = snapshotsByPartner.get(item.partnerId);
            if (!partnerSnaps || partnerSnaps.length === 0) return;
            let validSnap: { licencas: number } | null = null;
            for (let i = partnerSnaps.length - 1; i >= 0; i--) {
              if (partnerSnaps[i].importedAtDateStr <= dataReferencia) { validSnap = partnerSnaps[i]; break; }
            }
            if (validSnap) {
              sumLicencas += (validSnap.licencas || 0);
              hasAnySnapshot = true;
            }
          });
          weeksData.push({ weekIndex: N, sumLicencas: hasAnySnapshot ? sumLicencas : 0 });
        }
      }

      return { semanaEntrada, label, rawDateString: semanaEntrada, planCount, totalLicencas, weeksData };
    });

    const calculateColumnBasedAverages = (maxCount: number) => {
      const sortedCohorts = [...cohorts].sort((a, b) => a.rawDateString.localeCompare(b.rawDateString));
      const averages: (number | null)[] = [];
      const usedCohortsSet = new Set<string>();

      for (let wIdx = 0; wIdx <= maxWeeksAvailable; wIdx++) {
        const validCohorts = sortedCohorts.filter(c => { const val = c.weeksData[wIdx]?.sumLicencas; return val !== null && val !== undefined; });
        const lastNCohorts = validCohorts.slice(-maxCount);
        if (lastNCohorts.length === 0) { averages.push(null); }
        else {
          const sumOfTotals = lastNCohorts.reduce((acc, c) => acc + (c.weeksData[wIdx].sumLicencas || 0), 0);
          const avg = sumOfTotals / lastNCohorts.length;
          averages.push(Math.round(avg));
          lastNCohorts.forEach(c => usedCohortsSet.add(c.rawDateString));
        }
      }

      if (usedCohortsSet.size === 0) {
        return { rangeLabel: '', planCountSum: 0, totalLicencasSum: 0, averages, count: 0 };
      }
      const usedCohortsList = sortedCohorts.filter(c => usedCohortsSet.has(c.rawDateString));
      const firstDate = formatCohortWeekLabel(usedCohortsList[0].rawDateString);
      const lastDate = formatCohortWeekLabel(usedCohortsList[usedCohortsList.length - 1].rawDateString);
      const rangeLabel = `(${firstDate} a ${lastDate})`;
      return {
        rangeLabel,
        planCountSum: usedCohortsList.reduce((acc, c) => acc + c.planCount, 0),
        totalLicencasSum: usedCohortsList.reduce((acc, c) => acc + c.totalLicencas, 0),
        averages,
        count: usedCohortsList.length
      };
    };

    return {
      status: 'ok' as const,
      cohorts,
      maxWeeks: maxWeeksAvailable,
      summary4Weeks: calculateColumnBasedAverages(4),
      summary12Weeks: calculateColumnBasedAverages(12)
    };
  }, [cohortRawPlans, cohortRawSnapshots, cohortTasksByPlan, cohortLicEtapa]);

  // Fetch Kanban Data
  const fetchKanbanData = async () => {
    if (!playbook) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      // 1. Fetch playbook tasks
      const { data: pTasks, error: pTasksError } = await supabase
        .from('playbook_tasks')
        .select('*')
        .eq('playbook_id', playbook.id)
        .order('ordem', { ascending: true });

      if (pTasksError) throw pTasksError;
      const tasksList = pTasks || [];
      setPlaybookTasks(tasksList);

      // 2. Fetch plans with nested partners and tasks
      let allPlans: PlanWithDetails[] = [];
      let fromPlans = 0;
      const pageSize = 1000;

      while (true) {
        const { data: plansData, error: plansError } = await supabase
          .from('plans')
          .select(`
            id,
            partner_id,
            playbook_id,
            ativo,
            status_conclusao,
            created_at,
            partners (
              id,
              accountancy_id,
              salesforce_id,
              nome,
              gerente,
              segmento,
              percentual_engajamento
            ),
            tasks (
              id,
              plan_id,
              titulo,
              status,
              ordem,
              deletada_em
            )
          `)
          .eq('playbook_id', playbook.id)
          .range(fromPlans, fromPlans + pageSize - 1);

        if (plansError) throw plansError;
        if (plansData) {
          allPlans = allPlans.concat(plansData as unknown as PlanWithDetails[]);
        }
        if (!plansData || plansData.length < pageSize) break;
        fromPlans += pageSize;
      }

      setRawPlans(allPlans);

      // 3. Fetch task_status_history for step completions analytics
      const taskIdToOrdemMap = new Map<string, number>();
      allPlans.forEach(plan => {
        (plan.tasks || []).forEach(t => {
          if (t.deletada_em === null) {
            taskIdToOrdemMap.set(t.id, t.ordem);
          }
        });
      });

      if (taskIdToOrdemMap.size > 0) {
        let allHistory: { task_id: string; alterado_em: string }[] = [];
        let fromHistory = 0;

        while (true) {
          const { data: histData, error: histError } = await supabase
            .from('task_status_history')
            .select('task_id, alterado_em')
            .eq('status_novo', 'concluida')
            .range(fromHistory, fromHistory + pageSize - 1);

          if (histError) {
            console.error('Erro ao buscar histórico de tarefas:', histError);
            break;
          }
          if (histData) {
            allHistory = allHistory.concat(histData as { task_id: string; alterado_em: string }[]);
          }
          if (!histData || histData.length < pageSize) break;
          fromHistory += pageSize;
        }

        const completionsList: StepCompletion[] = [];
        allHistory.forEach(h => {
          const ordem = taskIdToOrdemMap.get(h.task_id);
          if (ordem !== undefined && h.alterado_em) {
            completionsList.push({
              task_id: h.task_id,
              ordem,
              alterado_em: h.alterado_em,
            });
          }
        });

        setStepCompletions(completionsList);
      } else {
        setStepCompletions([]);
      }

    } catch (err: any) {
      console.error('Erro ao buscar dados do Kanban do playbook:', err);
      setErrorMsg('Não foi possível carregar o quadro Kanban deste playbook.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (playbook) {
      fetchKanbanData();
    }
  }, [playbook]);

  // Build Kanban columns dynamically
  useEffect(() => {
    if (!playbook) return;

    const selectedPlanosSet = new Set(selectedPlanos);
    const selectedGerentesNormSet = new Set(selectedGerentes.map(g => g.trim().toLowerCase()).filter(Boolean));

    const filteredPlans = rawPlans.filter(plan => {
      if (selectedPlanosSet.size > 0) {
        const seg = plan.partners?.segmento?.trim();
        if (!seg || !selectedPlanosSet.has(seg)) return false;
      }

      if (selectedGerentesNormSet.size > 0) {
        const ger = (plan.partners?.gerente || '').trim().toLowerCase();
        if (!ger || !selectedGerentesNormSet.has(ger)) return false;
      }

      return true;
    });

    const cards: KanbanCard[] = filteredPlans.map(plan => {
      const activeTasks = (plan.tasks || []).filter(t => t.deletada_em === null);
      return {
        planId: plan.id,
        partnerId: plan.partner_id,
        partnerName: plan.partners?.nome || 'Parceiro sem nome',
        accountancyId: String(plan.partners?.accountancy_id || ''),
        salesforceId: plan.partners?.salesforce_id,
        gerente: plan.partners?.gerente || 'Sem gerente',
        segmento: plan.partners?.segmento,
        percentualEngajamento: plan.partners?.percentual_engajamento,
        ativo: plan.ativo,
        status_conclusao: plan.status_conclusao,
        tasks: activeTasks,
      };
    });

    const colMap: Record<string, KanbanCard[]> = {
      nao_iniciado: [],
      concluido: [],
    };
    playbookTasks.forEach(pt => {
      colMap[pt.id] = [];
    });

    cards.forEach(card => {
      const { tasks, ativo } = card;

      const totalTasksCount = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'concluida');
      const completedCount = completedTasks.length;
      const todasTasksConcluidas = totalTasksCount > 0 && completedCount === totalTasksCount;
      const isEncerrado = ativo === false || todasTasksConcluidas;

      if (isEncerrado) {
        colMap.concluido.push(card);
        return;
      }

      if (tasks.length === 0 || completedCount === 0) {
        colMap.nao_iniciado.push(card);
        return;
      }

      const maxCompletedOrdem = Math.max(...completedTasks.map(t => t.ordem));
      const matchingPlaybookTask = playbookTasks.find(pt => pt.ordem === maxCompletedOrdem);
      
      if (matchingPlaybookTask && colMap[matchingPlaybookTask.id]) {
        colMap[matchingPlaybookTask.id].push(card);
      } else {
        colMap.nao_iniciado.push(card);
      }
    });

    const dynamicColumns: KanbanColumnData[] = [
      {
        id: 'nao_iniciado',
        titulo: 'Não iniciado',
        cards: colMap.nao_iniciado || [],
        colorClass: 'border-t-slate-400 bg-slate-50/10',
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
      },
      ...playbookTasks.map((pt, index) => {
        const colors = [
          { color: 'border-t-blue-400 bg-blue-50/10', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/45 dark:text-blue-300' },
          { color: 'border-t-indigo-400 bg-indigo-50/10', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/45 dark:text-indigo-300' },
          { color: 'border-t-purple-400 bg-purple-50/10', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950/45 dark:text-purple-300' },
        ];
        const chosen = colors[index % colors.length];

        return {
          id: pt.id,
          titulo: pt.titulo,
          ordem: pt.ordem,
          cards: colMap[pt.id] || [],
          colorClass: chosen.color,
          badgeClass: chosen.badge,
        };
      }),
      {
        id: 'concluido',
        titulo: 'Concluído',
        cards: colMap.concluido || [],
        colorClass: 'border-t-emerald-400 bg-emerald-50/10',
        badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300',
      },
    ];

    setColumns(dynamicColumns);
  }, [rawPlans, playbookTasks, selectedPlanos, selectedGerentes, playbook]);

  // Compute time buckets for "Evolução por Etapa"
  const stepTimeBuckets = useMemo(() => {
    const now = new Date();
    if (stepPeriodMode === 'dod') {
      const buckets: { label: string; start: Date; end: Date }[] = [];
      for (let i = 13; i >= 0; i--) {
        const dStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
        const dEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59, 999);
        const dayStr = String(dStart.getDate()).padStart(2, '0');
        const monthStr = String(dStart.getMonth() + 1).padStart(2, '0');
        buckets.push({
          label: `${dayStr}/${monthStr}`,
          start: dStart,
          end: dEnd,
        });
      }
      return buckets;
    } else if (stepPeriodMode === 'wow') {
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distanceToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      const buckets: { label: string; start: Date; end: Date }[] = [];
      for (let i = 7; i >= 0; i--) {
        const wStart = new Date(currentMonday);
        wStart.setDate(currentMonday.getDate() - i * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        wEnd.setHours(23, 59, 59, 999);

        const startStr = `${String(wStart.getDate()).padStart(2, '0')}/${String(wStart.getMonth() + 1).padStart(2, '0')}`;
        const endStr = `${String(wEnd.getDate()).padStart(2, '0')}/${String(wEnd.getMonth() + 1).padStart(2, '0')}`;
        buckets.push({
          label: `${startStr} - ${endStr}`,
          start: wStart,
          end: wEnd,
        });
      }
      return buckets;
    } else {
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const buckets: { label: string; start: Date; end: Date }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const start = new Date(y, m, 1, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

        buckets.push({
          label: `${monthNames[m]}/${String(y).slice(-2)}`,
          start,
          end,
        });
      }
      return buckets;
    }
  }, [stepPeriodMode]);

  const filteredTaskIdsSet = useMemo(() => {
    const set = new Set<string>();
    columns.forEach(col => {
      col.cards.forEach(card => {
        card.tasks.forEach(t => set.add(t.id));
      });
    });
    return set;
  }, [columns]);

  // Compute matrix for "Evolução por Etapa"
  const stepMatrix = useMemo(() => {
    if (!playbookTasks || playbookTasks.length === 0 || !stepCompletions) {
      return { matrix: [], totalCompletions: 0 };
    }

    let grandTotal = 0;
    const matrix = playbookTasks.map((pt) => {
      const rowCounts = stepTimeBuckets.map((bucket) => {
        let count = 0;
        stepCompletions.forEach((comp) => {
          if (comp.ordem === pt.ordem && comp.alterado_em && (filteredTaskIdsSet.size === 0 || filteredTaskIdsSet.has(comp.task_id))) {
            const dt = new Date(comp.alterado_em);
            if (dt >= bucket.start && dt <= bucket.end) {
              count++;
            }
          }
        });
        grandTotal += count;
        return count;
      });

      return {
        task: pt,
        counts: rowCounts,
        totalRow: rowCounts.reduce((a, b) => a + b, 0),
      };
    });

    return { matrix, totalCompletions: grandTotal };
  }, [playbookTasks, stepCompletions, stepTimeBuckets, filteredTaskIdsSet]);

  const engagementChartData = useMemo(() => {
    if (!engagementTimeline || engagementTimeline.length === 0) return null;

    const labels = engagementTimeline.map((item) => {
      const parts = item.dateStr.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : item.dateStr;
    });

    const dataValues = engagementTimeline.map((item) => item.taxa);

    return {
      labels,
      datasets: [
        {
          label: 'Taxa de Engajamento (%)',
          data: dataValues,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          borderWidth: 2,
          pointBackgroundColor: '#4f46e5',
          pointBorderColor: '#ffffff',
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#4f46e5',
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.2,
          fill: true,
        },
      ],
    };
  }, [engagementTimeline]);

  const engagementChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: (tooltipItems: any[]) => {
              const idx = tooltipItems[0]?.dataIndex;
              if (idx !== undefined && engagementTimeline[idx]) {
                return `Importação: ${engagementTimeline[idx].formattedDate}`;
              }
              return '';
            },
            label: (context: any) => {
              const idx = context.dataIndex;
              if (idx !== undefined && engagementTimeline[idx]) {
                const item = engagementTimeline[idx];
                return [
                  `Taxa de Engajamento: ${item.taxa.toString().replace('.', ',')}%`,
                  `Licenças Engajadas: ${item.totalEngajadas.toLocaleString('pt-BR')} de ${item.totalLicencas.toLocaleString('pt-BR')}`
                ];
              }
              return `Taxa: ${context.parsed.y}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: { size: 11 },
            color: '#94a3b8',
          },
        },
        y: {
          min: (() => {
            if (!engagementTimeline || engagementTimeline.length === 0) return 0;
            const valores = engagementTimeline.map(d => d.taxa);
            const min = Math.min(...valores);
            const max = Math.max(...valores);
            const margem = Math.max((max - min) * 0.2, 3);
            return Math.max(0, Math.floor(min - margem));
          })(),
          max: (() => {
            if (!engagementTimeline || engagementTimeline.length === 0) return 100;
            const valores = engagementTimeline.map(d => d.taxa);
            const min = Math.min(...valores);
            const max = Math.max(...valores);
            const margem = Math.max((max - min) * 0.2, 3);
            return Math.min(100, Math.ceil(max + margem));
          })(),
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
          ticks: {
            font: { size: 11 },
            color: '#94a3b8',
            callback: (value: any) => `${value}%`,
          },
        },
      },
    };
  }, [engagementTimeline]);

  const unsuccessfulReasonsChartData = useMemo(() => {
    if (!unsuccessfulReasons || unsuccessfulReasons.length === 0) return null;

    const labels = unsuccessfulReasons.map((item) => item.motivo);
    const dataValues = unsuccessfulReasons.map((item) => item.count);

    return {
      labels,
      datasets: [
        {
          label: 'Planos Sem Sucesso',
          data: dataValues,
          backgroundColor: 'rgba(244, 63, 94, 0.85)',
          borderColor: '#e11d48',
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 26,
        },
      ],
    };
  }, [unsuccessfulReasons]);

  const unsuccessfulReasonsChartOptions = useMemo(() => {
    return {
      indexAxis: 'y' as const,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            title: (tooltipItems: any[]) => {
              const item = tooltipItems[0];
              return item?.label || '';
            },
            label: (context: any) => {
              const count = context.parsed.x;
              return `${count} ${count === 1 ? 'plano' : 'planos'}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
          ticks: {
            precision: 0,
            font: { size: 11 },
            color: '#94a3b8',
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            font: { size: 11 },
            color: '#94a3b8',
            autoSkip: false,
          },
        },
      },
    };
  }, []);

  const allFilteredCards = columns.reduce((acc, col) => acc + col.cards.length, 0);
  const naoIniciadosCount = columns.find(c => c.id === 'nao_iniciado')?.cards.length || 0;
  const concluidosCount = columns.find(c => c.id === 'concluido')?.cards.length || 0;

  const handleCardClick = (accountancyId: string) => {
    navigate(`/parceiros/${accountancyId}`);
  };

  if (loadingPlaybook) {
    return (
      <div className="min-h-screen bg-bg-primary p-6 md:p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <span className="text-sm text-text-secondary font-medium">Carregando dados do playbook...</span>
      </div>
    );
  }

  if (!playbook) {
    return (
      <div className="min-h-screen bg-bg-primary p-6 md:p-8">
        <div className="max-w-md mx-auto p-6 bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-100 dark:border-rose-950/50 flex flex-col items-center text-center gap-3">
          <AlertCircle className="h-10 w-10 text-rose-500" />
          <h2 className="text-base font-bold text-text-primary">Playbook não encontrado</h2>
          <p className="text-xs text-text-secondary">{errorMsg || 'O playbook solicitado não existe ou foi removido.'}</p>
          <Button onClick={() => navigate('/playbooks-automaticos')} variant="secondary" className="mt-2 text-xs">
            Voltar para Playbooks
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8 space-y-8" id="playbook-acompanhamento-page">
      {/* Header with Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="playbook-acompanhamento-header">
        <div className="space-y-1">
          <button
            onClick={() => navigate('/playbooks-automaticos')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-2 cursor-pointer"
            id="btn-voltar-playbooks"
          >
            <ArrowLeft size={14} />
            <span>Voltar para Playbooks Automáticos</span>
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-500" />
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Acompanhamento Playbook: <span className="text-indigo-500 font-extrabold">{playbook.nome}</span>
            </h1>
          </div>
          <p className="text-sm text-text-secondary">
            Acompanhe o andamento por parceiro e a evolução histórica de conclusões por etapa.
          </p>
        </div>
      </div>

      {/* Filtros de Análise e Stats Bar */}
      <div className="rounded-2xl border border-border bg-card shadow-xs p-6 flex flex-col gap-4" id="container-filtros-kanban">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border border-opacity-30 pb-3">
          <div className="flex items-center gap-2.5">
            <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" id="icon-filtros-kanban" />
            <div>
              <h3 className="text-sm font-bold text-text-primary" id="title-filtros-kanban">
                Filtros de Análise
              </h3>
              <p className="text-[11px] text-text-secondary">
                Filtre os parceiros do Playbook por Plano (Segmento) ou Gerente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Limpar filtros */}
            {(selectedPlanos.length > 0 || selectedGerentes.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPlanos([]);
                  setSelectedGerentes([]);
                }}
                className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                id="btn-limpar-filtros-kanban"
              >
                Limpar filtros
              </button>
            )}

            {/* Stats Badges */}
            <div className="flex items-center gap-2 text-xs" id="kanban-stats-indicators">
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary/20 border border-border rounded-lg shadow-xs">
                <span className="text-text-secondary font-medium">Total:</span>
                <strong className="text-text-primary text-xs">{allFilteredCards}</strong>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary/20 border border-border rounded-lg shadow-xs">
                <span className="text-text-secondary font-medium text-amber-600 dark:text-amber-400">Não iniciado:</span>
                <strong className="text-text-primary text-xs">{naoIniciadosCount}</strong>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-bg-secondary/20 border border-border rounded-lg shadow-xs">
                <span className="text-text-secondary font-medium text-emerald-600 dark:text-emerald-400">Concluído:</span>
                <strong className="text-text-primary text-xs">{concluidosCount}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Grid de Filtros: Plano & Gerente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" id="grid-filtros-kanban">
          {/* Bloco Plano */}
          <div className="flex flex-col gap-1.5" id="bloco-filtro-plano-kanban">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Plano / Segmento
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setPlanoDropdownOpen(!planoDropdownOpen);
                  setGerenteDropdownOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                id="btn-dropdown-plano-kanban"
              >
                <span className="truncate">
                  {selectedPlanos.length === 0
                    ? 'Todos os planos'
                    : selectedPlanos.length === 1
                    ? selectedPlanos[0]
                    : `${selectedPlanos.length} planos selecionados`}
                </span>
                <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${planoDropdownOpen ? 'rotate-180' : ''}`} id="chevron-plano-kanban" />
              </button>

              {planoDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPlanoDropdownOpen(false)} id="overlay-plano-kanban" />
                  <div className="absolute left-0 mt-1.5 z-40 w-full min-w-[220px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-56 overflow-y-auto scrollbar-thin" id="menu-dropdown-plano-kanban">
                    <input
                      type="text"
                      placeholder="Buscar plano..."
                      value={planoSearch}
                      onChange={(e) => setPlanoSearch(e.target.value)}
                      className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      id="input-busca-plano-kanban"
                    />
                    <div className="flex flex-col gap-1">
                      {filteredPlanos.map((plano) => {
                        const isSelected = selectedPlanos.includes(plano);
                        return (
                          <label
                            key={plano}
                            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-secondary/40 cursor-pointer text-xs text-text-primary"
                            id={`label-opt-plano-kanban-${plano.replace(/\s+/g, '-').toLowerCase()}`}
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
                              className="rounded border-border text-indigo-600 focus:ring-indigo-500/20 h-3.5 w-3.5"
                              id={`checkbox-plano-kanban-${plano.replace(/\s+/g, '-').toLowerCase()}`}
                            />
                            <span className="truncate">{plano}</span>
                          </label>
                        );
                      })}
                      {filteredPlanos.length === 0 && (
                        <span className="text-xs text-text-secondary text-center py-2" id="no-plano-found-kanban">Nenhum plano encontrado</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Bloco Gerente */}
          <div className="flex flex-col gap-1.5" id="bloco-filtro-gerente-kanban">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
              Gerente
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setGerenteDropdownOpen(!gerenteDropdownOpen);
                  setPlanoDropdownOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                id="btn-dropdown-gerente-kanban"
              >
                <span className="truncate">
                  {selectedGerentes.length === 0
                    ? 'Todos os gerentes'
                    : selectedGerentes.length === 1
                    ? selectedGerentes[0]
                    : `${selectedGerentes.length} gerentes selecionados`}
                </span>
                <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${gerenteDropdownOpen ? 'rotate-180' : ''}`} id="chevron-gerente-kanban" />
              </button>

              {gerenteDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setGerenteDropdownOpen(false)} id="overlay-gerente-kanban" />
                  <div className="absolute left-0 mt-1.5 z-40 w-full min-w-[220px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-56 overflow-y-auto scrollbar-thin" id="menu-dropdown-gerente-kanban">
                    <input
                      type="text"
                      placeholder="Buscar gerente..."
                      value={gerenteSearch}
                      onChange={(e) => setGerenteSearch(e.target.value)}
                      className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      id="input-busca-gerente-kanban"
                    />
                    <div className="flex flex-col gap-1">
                      {filteredGerentes.map((gerente) => {
                        const isSelected = selectedGerentes.includes(gerente);
                        return (
                          <label
                            key={gerente}
                            className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-secondary/40 cursor-pointer text-xs text-text-primary"
                            id={`label-opt-gerente-kanban-${gerente.replace(/\s+/g, '-').toLowerCase()}`}
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
                              className="rounded border-border text-indigo-600 focus:ring-indigo-500/20 h-3.5 w-3.5"
                              id={`checkbox-gerente-kanban-${gerente.replace(/\s+/g, '-').toLowerCase()}`}
                            />
                            <span className="truncate">{gerente}</span>
                          </label>
                        );
                      })}
                      {filteredGerentes.length === 0 && (
                        <span className="text-xs text-text-secondary text-center py-2" id="no-gerente-found-kanban">Nenhum gerente encontrado</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Saved Filters Row */}
        <div className="border-t border-border border-opacity-30 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" id="row-saved-filters-kanban">
          <div className="flex flex-col gap-1 flex-1" id="saved-filters-list-container-kanban">
            <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1">
              <Bookmark className="h-3 w-3 text-indigo-500" /> Filtros Salvos
            </span>
            {loadingFilters ? (
              <div className="flex items-center gap-1.5 text-xs text-text-secondary py-0.5" id="loading-filters-indicator-kanban">
                <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
                <span>Carregando filtros...</span>
              </div>
            ) : savedFilters.length === 0 ? (
              <span className="text-xs text-text-secondary italic py-0.5" id="no-saved-filters-kanban">
                Nenhum filtro salvo.
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5" id="saved-filters-chips-kanban">
                {savedFilters.map((filter) => {
                  const isApplied =
                    selectedPlanos.length === filter.planos?.length &&
                    selectedPlanos.every(p => filter.planos?.includes(p)) &&
                    selectedGerentes.length === filter.gerentes?.length &&
                    selectedGerentes.every(g => filter.gerentes?.includes(g));

                  return (
                    <div
                      key={filter.id}
                      onClick={() => handleApplyFilter(filter)}
                      className={`group flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border cursor-pointer transition-all ${
                        isApplied
                          ? 'bg-indigo-500 text-white border-indigo-500 shadow-xs'
                          : 'bg-bg-secondary/10 text-text-primary border-border hover:bg-bg-secondary/30'
                      }`}
                      id={`saved-filter-chip-kanban-${filter.id}`}
                    >
                      <span className="truncate max-w-[130px]" title={filter.nome}>
                        {filter.nome}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteFilter(filter.id, e)}
                        className={`rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer ${
                          isApplied ? 'text-indigo-100 hover:text-white' : 'text-text-secondary hover:text-rose-500'
                        }`}
                        title="Excluir filtro"
                        id={`btn-delete-saved-filter-kanban-${filter.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center" id="action-salvar-filtro-kanban">
            {showSaveInput ? (
              <form onSubmit={handleSaveFilter} className="flex items-center gap-1.5 bg-bg-secondary/10 p-1 rounded-lg border border-border" id="form-salvar-filtro-kanban">
                <input
                  type="text"
                  placeholder="Nome do filtro..."
                  value={newFilterName}
                  onChange={(e) => setNewFilterName(e.target.value)}
                  className="rounded border border-border bg-card px-2 py-1 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                  autoFocus
                  required
                  id="input-novo-filtro-kanban"
                />
                <button
                  type="submit"
                  disabled={isSavingFilter || !newFilterName.trim()}
                  className="rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
                  id="btn-confirm-salvar-filtro-kanban"
                >
                  {isSavingFilter ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveInput(false);
                    setNewFilterName('');
                  }}
                  className="rounded px-1.5 py-1 text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                  id="btn-cancel-salvar-filtro-kanban"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowSaveInput(true)}
                disabled={selectedPlanos.length === 0 && selectedGerentes.length === 0}
                className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-text-primary hover:bg-bg-secondary/20 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-colors cursor-pointer"
                id="btn-abrir-salvar-filtro-kanban"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-500" />
                <span>Salvar Filtro Atual</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SEÇÃO 1: QUADRO KANBAN */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col" id="secao-quadro-kanban">
        <div className="p-6 border-b border-border bg-card">
          <h2 className="text-lg font-bold text-text-primary">Quadro Kanban</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Visualize os parceiros distribuídos pelas etapas do checklist e status de conclusão.
          </p>
        </div>

        <div className="p-6 bg-bg-secondary/10 overflow-hidden flex flex-col" id="kanban-board-wrapper">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              <span className="text-sm text-text-secondary font-medium">Processando e montando quadro Kanban...</span>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center p-6 text-center gap-3 max-w-md mx-auto py-12">
              <AlertCircle className="h-10 w-10 text-rose-500" />
              <h3 className="text-base font-bold text-text-primary">Erro ao montar quadro</h3>
              <p className="text-xs text-text-secondary">{errorMsg}</p>
            </div>
          ) : allFilteredCards === 0 && rawPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center gap-4 max-w-sm mx-auto py-12">
              <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-500">
                <User size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-text-primary">Sem parceiros vinculados</h3>
                <p className="text-xs text-text-secondary">
                  Nenhum plano foi gerado ainda para este playbook modelo.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto p-2 flex gap-4 items-start scrollbar-thin min-h-[500px]" id="kanban-columns-container">
              {columns.map((column) => (
                <div
                  key={column.id}
                  className={`w-72 shrink-0 flex flex-col rounded-xl border border-border border-t-4 ${column.colorClass} shadow-xs bg-card/60 backdrop-blur-xs max-h-[750px]`}
                  id={`kanban-modal-column-${column.id}`}
                >
                  {/* Column Header */}
                  <div className="p-4 border-b border-border bg-card flex items-center justify-between rounded-t-lg shrink-0">
                    <span className="text-xs font-bold text-text-primary truncate max-w-[80%]" title={column.titulo}>
                      {column.titulo}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold leading-none ${column.badgeClass}`}>
                      {column.cards.length}
                    </span>
                  </div>

                  {/* Cards List container scroll */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                    {column.cards.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-center border border-dashed border-border/60 rounded-xl bg-bg-secondary/5 text-[10px] text-text-secondary">
                        Nenhum parceiro nesta etapa
                      </div>
                    ) : (
                      column.cards.map((card) => {
                        const completedTasksCount = card.tasks.filter(t => t.status === 'concluida').length;
                        const totalTasksCount = card.tasks.length;

                        return (
                          <div
                            key={card.planId}
                            onClick={() => handleCardClick(card.accountancyId)}
                            className="bg-card p-4 rounded-xl border border-border shadow-xs hover:shadow-md hover:border-indigo-500/30 transition-all flex flex-col gap-2.5 cursor-pointer group duration-200"
                            id={`kanban-card-${card.planId}`}
                          >
                            <div className="min-w-0 flex items-start justify-between gap-1.5">
                              <h4 className="font-bold text-xs text-text-primary leading-snug group-hover:text-indigo-500 transition-colors line-clamp-2">
                                {card.partnerName}
                              </h4>
                              {(!card.ativo || (totalTasksCount > 0 && completedTasksCount === totalTasksCount)) && (
                                card.status_conclusao === 'sucesso' ? (
                                  <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border border-emerald-500/20 shrink-0">
                                    Sucesso
                                  </span>
                                ) : card.status_conclusao === 'sem_sucesso' ? (
                                  <span className="bg-rose-500/10 text-rose-700 dark:text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border border-rose-500/20 shrink-0">
                                    Sem Sucesso
                                  </span>
                                ) : (
                                  <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider border border-amber-500/10 shrink-0">
                                    Encerrado
                                  </span>
                                )
                              )}
                            </div>

                            <div className="flex flex-col gap-1.5 text-[10px] text-text-secondary">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[9px] bg-bg-secondary/50 text-text-secondary w-fit px-1.5 py-0.5 rounded border border-border/30">
                                  ID: {card.accountancyId}
                                </span>
                                <SalesforceLinkButton salesforceId={card.salesforceId} />
                              </div>

                              <div className="flex items-center gap-1.5 mt-0.5">
                                <User className="w-3.5 h-3.5 text-text-secondary/70 shrink-0" />
                                <span className="truncate">
                                  Gerente: <span className="font-semibold text-text-primary">{card.gerente}</span>
                                </span>
                              </div>

                              {/* Progress miniature indicator */}
                              <div className="mt-1 pt-2 border-t border-border border-opacity-30 flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-text-secondary">
                                    Progresso: <strong>{completedTasksCount}/{totalTasksCount}</strong> tasks
                                  </span>
                                  <span className="text-[9px] font-bold text-indigo-500">
                                    {totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0}%
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-text-secondary">
                                    Engajamento:
                                  </span>
                                  <span className="text-[9px] font-bold text-text-primary">
                                    {formatEngajamento(card.percentualEngajamento)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="hidden group-hover:flex items-center justify-end text-[9px] text-indigo-500 font-semibold gap-0.5 animate-fade-in">
                              Ir para perfil <ArrowRight size={10} />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SEÇÃO 2: EVOLUÇÃO POR ETAPA */}
      <div className="space-y-6" id="secao-evolucao-etapa">
        {/* 4 Cards de KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="modal-kpi-cards">
          <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
              Parceiros no playbook
            </span>
            <div className="text-2xl font-bold text-text-primary mt-1">
              {overallKPIs.totalPartners.toLocaleString('pt-BR')}
            </div>
            <span className="text-[10px] text-text-secondary mt-0.5 block">100% do total</span>
          </div>

          <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
              Licenças totais
            </span>
            <div className="text-2xl font-bold text-text-primary mt-1">
              {overallKPIs.totalLicencas.toLocaleString('pt-BR')}
            </div>
            <span className="text-[10px] text-text-secondary mt-0.5 block">100% do total</span>
          </div>

          <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
              Licenças engajadas
            </span>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              {overallKPIs.totalLicencasEngajadas.toLocaleString('pt-BR')}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5 block">
              {overallKPIs.taxaGeralEngajamento}% do total
            </span>
          </div>

          <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
              Taxa geral de engajamento
            </span>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              {overallKPIs.taxaGeralEngajamento}%
            </div>
            <span className="text-[10px] text-text-secondary mt-0.5 block">
              {overallKPIs.totalLicencasEngajadas.toLocaleString('pt-BR')} de {overallKPIs.totalLicencas.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>

        {/* Tabela de Dados por Etapa */}
        <div className="bg-card rounded-2xl border border-border shadow-xs overflow-hidden" id="modal-stage-table-container">
          <div className="p-6 border-b border-border bg-card">
            <h3 className="text-base font-bold text-text-primary">Engajamento de Licenças por Etapa</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Proporção e distribuição de licenças e parceiros em cada etapa do playbook ativo.
            </p>
          </div>

          {loadingStageData ? (
            <div className="flex items-center justify-center py-12 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              <span className="text-xs text-text-secondary">Carregando dados por etapa...</span>
            </div>
          ) : stageMetrics.length === 0 ? (
            <div className="text-center py-10 text-xs text-text-secondary">
              Nenhum plano ativo encontrado para este playbook.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary/40 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    <th className="py-3 px-4">Etapa do playbook</th>
                    <th className="py-3 px-4">Funil de Parceiros</th>
                    <th className="py-3 px-4">Parceiros</th>
                    <th className="py-3 px-4">Licenças Engajadas</th>
                    <th className="py-3 px-4">Taxa de Engajamento</th>
                    <th className="py-3 px-4 text-right">Licenças</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {stageMetrics.map((m, idx) => {
                    const isZeroLic = m.stageTotalLicencas === 0;
                    const taxa = m.stageTaxaEngajamento;

                    let taxaTextColor = 'text-text-secondary font-medium';
                    let taxaBarBg = 'bg-slate-300 dark:bg-slate-700';

                    if (!isZeroLic) {
                      if (taxa >= 75) {
                        taxaTextColor = 'text-emerald-600 dark:text-emerald-400 font-bold';
                        taxaBarBg = 'bg-emerald-500';
                      } else if (taxa >= 50) {
                        taxaTextColor = 'text-amber-600 dark:text-amber-400 font-bold';
                        taxaBarBg = 'bg-amber-500';
                      } else {
                        taxaTextColor = 'text-red-600 dark:text-red-400 font-bold';
                        taxaBarBg = 'bg-red-500';
                      }
                    }

                    return (
                      <tr key={idx} className="hover:bg-bg-secondary/20 transition-colors">
                        <td className="py-3 px-4 font-semibold text-text-primary">{m.stageName}</td>
                        <td className="py-3 px-4 font-medium text-text-primary">
                          <div className="flex items-center gap-2.5">
                            <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, m.funilPct))}%` }}
                              />
                            </div>
                            <span className="whitespace-nowrap">
                              {m.funilPartners.toLocaleString('pt-BR')} <span className="text-text-secondary font-normal">({m.funilPct}%)</span>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-text-primary">
                          {m.stagePartners.toLocaleString('pt-BR')} <span className="text-text-secondary font-normal">({m.stagePartnersPct}%)</span>
                        </td>
                        <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                          {m.stageLicencasEngajadas.toLocaleString('pt-BR')} <span className="text-text-secondary font-normal">de {m.stageTotalLicencas.toLocaleString('pt-BR')}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-16 sm:w-20 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${taxaBarBg}`}
                                style={{ width: `${Math.min(100, Math.max(0, isZeroLic ? 0 : taxa))}%` }}
                              />
                            </div>
                            <span className={`whitespace-nowrap ${taxaTextColor}`}>
                              {taxa}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-text-primary text-right">
                          {m.stageLicencasEngajadas.toLocaleString('pt-BR')} / {m.stageTotalLicencas.toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Concluído Row & Sub-rows */}
                  {concludedMetrics && (
                    <>
                      <tr
                        className="hover:bg-bg-secondary/20 transition-colors cursor-pointer group"
                        onClick={() => setIsConcluidoExpanded((prev) => !prev)}
                      >
                        <td className="py-3 px-4 font-semibold text-text-primary">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="p-0.5 -ml-1 text-text-secondary hover:text-text-primary rounded transition-transform"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsConcluidoExpanded((prev) => !prev);
                              }}
                              aria-label={isConcluidoExpanded ? 'Recolher detalhes de conclusão' : 'Expandir detalhes de conclusão'}
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-text-secondary transition-transform duration-200 ${
                                  isConcluidoExpanded ? 'transform rotate-0' : 'transform -rotate-90'
                                }`}
                              />
                            </button>
                            <span>Concluído</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-text-primary">
                          <div className="flex items-center gap-2.5">
                            <div className="w-16 sm:w-24 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, concludedMetrics.funilPct))}%` }}
                              />
                            </div>
                            <span className="whitespace-nowrap">
                              {concludedMetrics.funilPartners.toLocaleString('pt-BR')} <span className="text-text-secondary font-normal">({concludedMetrics.funilPct}%)</span>
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-text-primary">
                          {concludedMetrics.totalEncerradosPartners.toLocaleString('pt-BR')} <span className="text-text-secondary font-normal">({concludedMetrics.totalEncerradosPct}%)</span>
                        </td>
                        <td className="py-3 px-4 font-medium text-emerald-600 dark:text-emerald-400">
                          {concludedMetrics.licencasEngajadas.toLocaleString('pt-BR')} <span className="text-text-secondary font-normal">de {concludedMetrics.totalLicencas.toLocaleString('pt-BR')}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-16 sm:w-20 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  concludedMetrics.totalLicencas === 0
                                    ? 'bg-slate-300 dark:bg-slate-700'
                                    : concludedMetrics.taxaEngajamento >= 75
                                    ? 'bg-emerald-500'
                                    : concludedMetrics.taxaEngajamento >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, concludedMetrics.totalLicencas === 0 ? 0 : concludedMetrics.taxaEngajamento))}%` }}
                              />
                            </div>
                            <span
                              className={`whitespace-nowrap ${
                                concludedMetrics.totalLicencas === 0
                                  ? 'text-text-secondary font-medium'
                                  : concludedMetrics.taxaEngajamento >= 75
                                  ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                  : concludedMetrics.taxaEngajamento >= 50
                                  ? 'text-amber-600 dark:text-amber-400 font-bold'
                                  : 'text-red-600 dark:text-red-400 font-bold'
                              }`}
                            >
                              {concludedMetrics.taxaEngajamento}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-text-primary text-right">
                          {concludedMetrics.licencasEngajadas.toLocaleString('pt-BR')} / {concludedMetrics.totalLicencas.toLocaleString('pt-BR')}
                        </td>
                      </tr>

                      {/* Sub-linhas expansíveis */}
                      {isConcluidoExpanded &&
                        concludedMetrics.subRows.map((sub, sIdx) => {
                          const isZeroSubLic = sub.totalLicencas === 0;
                          const subTaxa = sub.taxaEngajamento;
                          let subTaxaTextColor = 'text-text-secondary font-normal';
                          let subTaxaBarBg = 'bg-slate-300 dark:bg-slate-700';

                          if (!isZeroSubLic) {
                            if (subTaxa >= 75) {
                              subTaxaTextColor = 'text-emerald-600/90 dark:text-emerald-400/90 font-medium';
                              subTaxaBarBg = 'bg-emerald-500/80';
                            } else if (subTaxa >= 50) {
                              subTaxaTextColor = 'text-amber-600/90 dark:text-amber-400/90 font-medium';
                              subTaxaBarBg = 'bg-amber-500/80';
                            } else {
                              subTaxaTextColor = 'text-red-600/90 dark:text-red-400/90 font-medium';
                              subTaxaBarBg = 'bg-red-500/80';
                            }
                          }

                          return (
                            <tr
                              key={sIdx}
                              className="bg-bg-secondary/15 hover:bg-bg-secondary/30 transition-colors text-[11px]"
                            >
                              <td className="py-2.5 px-4 pl-9 text-text-secondary font-normal">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                                  <span>{sub.title}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-text-secondary font-normal">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-16 sm:w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                                    <div
                                      className="h-full bg-indigo-400/80 rounded-full transition-all duration-300"
                                      style={{ width: `${Math.min(100, Math.max(0, sub.funilPct))}%` }}
                                    />
                                  </div>
                                  <span className="whitespace-nowrap">
                                    {sub.funilCount.toLocaleString('pt-BR')}{' '}
                                    <span className="text-text-secondary/70">({sub.funilPct}%)</span>
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-text-secondary font-normal">
                                {sub.partnersCount.toLocaleString('pt-BR')}{' '}
                                <span className="text-text-secondary/70">({sub.partnersPct}%)</span>
                              </td>
                              <td className="py-2.5 px-4 text-emerald-600/80 dark:text-emerald-400/80 font-normal">
                                {sub.licencasEngajadas.toLocaleString('pt-BR')}{' '}
                                <span className="text-text-secondary/70">de {sub.totalLicencas.toLocaleString('pt-BR')}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-16 sm:w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${subTaxaBarBg}`}
                                      style={{
                                        width: `${Math.min(100, Math.max(0, isZeroSubLic ? 0 : subTaxa))}%`,
                                      }}
                                    />
                                  </div>
                                  <span className={`whitespace-nowrap ${subTaxaTextColor}`}>
                                    {subTaxa}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-text-secondary font-normal text-right">
                                {sub.licencasEngajadas.toLocaleString('pt-BR')} / {sub.totalLicencas.toLocaleString('pt-BR')}
                              </td>
                            </tr>
                          );
                        })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Control Bar & Tabela de Conclusões por Etapa no Tempo */}
        <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden flex flex-col" id="secao-conclusoes-tempo">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 border-b border-border bg-card">
            <div>
              <h3 className="text-base font-bold text-text-primary">Conclusões por Etapa no Tempo</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Quantidade de vezes que cada etapa do playbook foi marcada como concluída em cada período.
              </p>
            </div>

            {/* Toggle DoD / WoW / MoM */}
            <div className="inline-flex p-1 bg-bg-secondary/50 border border-border rounded-xl shadow-2xs self-start sm:self-auto" id="step-period-toggle-container">
              <button
                type="button"
                onClick={() => setStepPeriodMode('dod')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  stepPeriodMode === 'dod'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                id="btn-step-toggle-dod"
              >
                Dia a Dia
              </button>
              <button
                type="button"
                onClick={() => setStepPeriodMode('wow')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  stepPeriodMode === 'wow'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                id="btn-step-toggle-wow"
              >
                Semana a Semana
              </button>
              <button
                type="button"
                onClick={() => setStepPeriodMode('mom')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  stepPeriodMode === 'mom'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                id="btn-step-toggle-mom"
              >
                Mês a Mês
              </button>
            </div>
          </div>

          <div className="overflow-x-auto relative" id="evolucao-etapa-table-container">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center p-12 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <span className="text-xs text-text-secondary font-medium">Carregando dados de evolução por etapa...</span>
              </div>
            ) : stepMatrix.totalCompletions === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
                <AlertCircle className="h-8 w-8 text-slate-400 opacity-60" />
                <span className="text-xs text-text-secondary font-medium max-w-md">
                  Ainda não há dados de conclusão registrados para este playbook.
                </span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-bg-secondary/60 text-text-secondary font-semibold uppercase tracking-wider text-[10px] sticky top-0 z-10 backdrop-blur-xs border-b border-border">
                  <tr>
                    <th className="py-3 px-4 min-w-[200px] max-w-[300px] sticky left-0 bg-bg-secondary/90 backdrop-blur-xs z-20 border-r border-border">
                      Etapa do Playbook
                    </th>
                    {stepTimeBuckets.map((bucket, idx) => (
                      <th key={idx} className="py-3 px-3 text-center min-w-[90px] border-r border-border/50 last:border-r-0 whitespace-nowrap">
                        {bucket.label}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-center min-w-[80px] bg-bg-secondary/90 z-10 font-bold text-text-primary">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stepMatrix.matrix.map((row) => (
                    <tr key={row.task.id} className="hover:bg-bg-secondary/20 transition-colors">
                      <td className="py-3 px-4 font-semibold text-text-primary sticky left-0 bg-card z-10 border-r border-border shadow-xs truncate max-w-[280px]" title={row.task.titulo}>
                        <span className="text-indigo-500 font-extrabold mr-1.5">{row.task.ordem}.</span>
                        {row.task.titulo}
                      </td>
                      {row.counts.map((count, cIdx) => (
                        <td key={cIdx} className="py-3 px-3 text-center border-r border-border/40 last:border-r-0 font-medium">
                          {count > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              {count}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">-</span>
                          )}
                        </td>
                      ))}
                      <td className="py-3 px-4 text-center font-bold text-text-primary bg-bg-secondary/10">
                        {row.totalRow}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Coorte de Engajamento */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-6" id="card-coorte-engajamento">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="header-coorte-engajamento">
            <div>
              <h3 className="text-base font-bold text-text-primary" id="title-coorte-engajamento">
                Coorte de Engajamento
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Média ponderada do engajamento (% de licenças engajadas) das contas que entraram em cada safra semanal (S0 a Smax) vinculada a este playbook.
              </p>
            </div>

            {/* Filtro local Etapa do Plano */}
            <div className="flex items-center gap-2" id="filtro-etapa-coorte-engajamento">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                Etapa:
              </span>
              <div className="inline-flex p-1 bg-bg-secondary/50 border border-border rounded-xl shadow-2xs">
                <button
                  type="button"
                  onClick={() => setCohortEngEtapa('criado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    cohortEngEtapa === 'criado'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  id="btn-cohort-eng-etapa-criado"
                >
                  Criado
                </button>
                <button
                  type="button"
                  onClick={() => setCohortEngEtapa('iniciado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    cohortEngEtapa === 'iniciado'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  id="btn-cohort-eng-etapa-iniciado"
                >
                  Em Andamento
                </button>
                <button
                  type="button"
                  onClick={() => setCohortEngEtapa('finalizado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    cohortEngEtapa === 'finalizado'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  id="btn-cohort-eng-etapa-finalizado"
                >
                  Concluído
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Coorte Engajamento */}
          <div className="overflow-x-auto border border-border rounded-xl" id="table-wrapper-coorte-engajamento">
            {loadingStageData ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-xs text-text-secondary font-medium">Carregando coorte de engajamento...</span>
              </div>
            ) : cohortEngagementData.status === 'empty' || cohortEngagementData.cohorts.length === 0 ? (
              <div className="p-8 text-center bg-bg-secondary/10">
                <span className="text-xs text-text-secondary font-medium">
                  Nenhum dado de coorte de engajamento disponível para o playbook e filtros selecionados.
                </span>
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse" id="table-coorte-engajamento">
                <thead>
                  <tr className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider border-b border-border text-2xs">
                    <th className="py-3 px-3 sticky left-0 bg-bg-secondary z-20 min-w-[90px] border-r border-border">
                      Semanas
                    </th>
                    <th className="py-3 px-3 sticky left-[90px] bg-bg-secondary z-20 text-center min-w-[70px] border-r border-border">
                      Planos
                    </th>
                    <th className="py-3 px-3 text-center min-w-[90px] border-r border-border">
                      Lic. Cobertas
                    </th>
                    {Array.from({ length: cohortEngagementData.maxWeeks + 1 }).map((_, wIdx) => (
                      <th key={wIdx} className="py-3 px-2 text-center min-w-[65px] border-r border-border/50 last:border-r-0 whitespace-nowrap">
                        S{wIdx}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cohortEngagementData.cohorts.map((cohort: any) => (
                    <tr key={cohort.rawDateString} className="hover:bg-bg-secondary/20 transition-colors">
                      <td className="py-2 px-3 font-semibold text-text-primary sticky left-0 bg-card z-10 border-r border-border whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                          <span>{cohort.label}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-text-secondary sticky left-[90px] bg-card z-10 border-r border-border">
                        {cohort.planCount}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-text-secondary border-r border-border">
                        {cohort.totalLicencas.toLocaleString('pt-BR')}
                      </td>
                      {cohort.weeksData.map((w: any) => {
                        const hasVal = w.avgEngagement !== null && w.avgEngagement !== undefined;
                        const valDisplay = hasVal ? `${Number(w.avgEngagement).toFixed(1).replace('.', ',')}%` : '-';
                        const heat = getCohortHeatmapStyle(w.avgEngagement);
                        return (
                          <td
                            key={w.weekIndex}
                            style={heat.style}
                            className={`py-2 px-2 text-right text-2xs border-r border-border/30 last:border-r-0 ${heat.className}`}
                            title={hasVal ? `Safra: ${cohort.label} | S${w.weekIndex} | Engajamento: ${valDisplay} (${w.sumEngajadas}/${w.sumLicencas} licenças)` : undefined}
                          >
                            {valDisplay}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* FOOTER MÉDIAS 4 E 12 SEMANAS */}
                {(cohortEngagementData.summary4Weeks || cohortEngagementData.summary12Weeks) && (
                  <tfoot className="border-t-2 border-border/80 bg-bg-secondary/40 font-bold text-2xs">
                    {cohortEngagementData.summary4Weeks && (
                      <tr className="hover:bg-bg-secondary/60 transition-colors border-b border-border/50">
                        <td className="py-2.5 px-3 font-bold text-text-primary sticky left-0 bg-bg-secondary z-10 border-r border-border whitespace-nowrap">
                          <div className="flex items-center gap-1.5" title={`Média das últimas 4 safras ${cohortEngagementData.summary4Weeks.rangeLabel}`}>
                            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Média 4 sem. <span className="font-normal text-text-secondary text-[10px]">{cohortEngagementData.summary4Weeks.rangeLabel}</span></span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-text-primary sticky left-[90px] bg-bg-secondary z-10 border-r border-border">
                          {cohortEngagementData.summary4Weeks.planCountSum}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-text-primary border-r border-border">
                          {cohortEngagementData.summary4Weeks.totalLicencasSum.toLocaleString('pt-BR')}
                        </td>
                        {cohortEngagementData.summary4Weeks.averages.map((avgVal: number | null, aIdx: number) => {
                          const hasVal = avgVal !== null && avgVal !== undefined;
                          const valDisplay = hasVal ? `${Number(avgVal).toFixed(1).replace('.', ',')}%` : '-';
                          const heat = getCohortHeatmapStyle(avgVal);
                          return (
                            <td
                              key={aIdx}
                              style={heat.style}
                              className={`py-2.5 px-2 text-right font-bold border-r border-border/30 last:border-r-0 ${heat.className}`}
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {cohortEngagementData.summary12Weeks && (
                      <tr className="hover:bg-bg-secondary/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-text-primary sticky left-0 bg-bg-secondary z-10 border-r border-border whitespace-nowrap">
                          <div className="flex items-center gap-1.5" title={`Média das últimas 12 safras ${cohortEngagementData.summary12Weeks.rangeLabel}`}>
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Média 12 sem. <span className="font-normal text-text-secondary text-[10px]">{cohortEngagementData.summary12Weeks.rangeLabel}</span></span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-text-primary sticky left-[90px] bg-bg-secondary z-10 border-r border-border">
                          {cohortEngagementData.summary12Weeks.planCountSum}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-text-primary border-r border-border">
                          {cohortEngagementData.summary12Weeks.totalLicencasSum.toLocaleString('pt-BR')}
                        </td>
                        {cohortEngagementData.summary12Weeks.averages.map((avgVal: number | null, aIdx: number) => {
                          const hasVal = avgVal !== null && avgVal !== undefined;
                          const valDisplay = hasVal ? `${Number(avgVal).toFixed(1).replace('.', ',')}%` : '-';
                          const heat = getCohortHeatmapStyle(avgVal);
                          return (
                            <td
                              key={aIdx}
                              style={heat.style}
                              className={`py-2.5 px-2 text-right font-bold border-r border-border/30 last:border-r-0 ${heat.className}`}
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>

        {/* Coorte de Licenças (Volume) */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-6" id="card-coorte-licencas">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="header-coorte-licencas">
            <div>
              <h3 className="text-base font-bold text-text-primary" id="title-coorte-licencas">
                Coorte de Licenças
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Soma de licenças cobertas das contas que entraram em cada safra semanal (S0 a Smax) vinculada a este playbook.
              </p>
            </div>

            {/* Filtro local Etapa do Plano */}
            <div className="flex items-center gap-2" id="filtro-etapa-coorte-licencas">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider whitespace-nowrap">
                Etapa:
              </span>
              <div className="inline-flex p-1 bg-bg-secondary/50 border border-border rounded-xl shadow-2xs">
                <button
                  type="button"
                  onClick={() => setCohortLicEtapa('criado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    cohortLicEtapa === 'criado'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  id="btn-cohort-lic-etapa-criado"
                >
                  Criado
                </button>
                <button
                  type="button"
                  onClick={() => setCohortLicEtapa('iniciado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    cohortLicEtapa === 'iniciado'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  id="btn-cohort-lic-etapa-iniciado"
                >
                  Em Andamento
                </button>
                <button
                  type="button"
                  onClick={() => setCohortLicEtapa('finalizado')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    cohortLicEtapa === 'finalizado'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  id="btn-cohort-lic-etapa-finalizado"
                >
                  Concluído
                </button>
              </div>
            </div>
          </div>

          {/* Tabela de Coorte Licenças */}
          <div className="overflow-x-auto border border-border rounded-xl" id="table-wrapper-coorte-licencas">
            {loadingStageData ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-xs text-text-secondary font-medium">Carregando coorte de licenças...</span>
              </div>
            ) : cohortLicencasData.status === 'empty' || cohortLicencasData.cohorts.length === 0 ? (
              <div className="p-8 text-center bg-bg-secondary/10">
                <span className="text-xs text-text-secondary font-medium">
                  Nenhum dado de coorte de licenças disponível para o playbook e filtros selecionados.
                </span>
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse" id="table-coorte-licencas">
                <thead>
                  <tr className="bg-bg-secondary/60 text-text-secondary font-bold uppercase tracking-wider border-b border-border text-2xs">
                    <th className="py-3 px-3 sticky left-0 bg-bg-secondary z-20 min-w-[90px] border-r border-border">
                      Semanas
                    </th>
                    <th className="py-3 px-3 sticky left-[90px] bg-bg-secondary z-20 text-center min-w-[70px] border-r border-border">
                      Planos
                    </th>
                    {Array.from({ length: cohortLicencasData.maxWeeks + 1 }).map((_, wIdx) => (
                      <th key={wIdx} className="py-3 px-2 text-center min-w-[75px] border-r border-border/50 last:border-r-0 whitespace-nowrap">
                        S{wIdx}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cohortLicencasData.cohorts.map((cohort: any) => (
                    <tr key={cohort.rawDateString} className="hover:bg-bg-secondary/20 transition-colors">
                      <td className="py-2 px-3 font-semibold text-text-primary sticky left-0 bg-card z-10 border-r border-border whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-text-tertiary" />
                          <span>{cohort.label}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center font-medium text-text-secondary sticky left-[90px] bg-card z-10 border-r border-border">
                        {cohort.planCount}
                      </td>
                      {cohort.weeksData.map((w: any) => {
                        const hasVal = w.sumLicencas !== null && w.sumLicencas !== undefined;
                        const valDisplay = hasVal ? Number(w.sumLicencas).toLocaleString('pt-BR') : '-';
                        return (
                          <td
                            key={w.weekIndex}
                            className="py-2 px-2 text-right text-2xs border-r border-border/30 last:border-r-0 font-medium text-text-primary"
                            title={hasVal ? `Safra: ${cohort.label} | S${w.weekIndex} | Licenças: ${valDisplay}` : undefined}
                          >
                            {valDisplay}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* FOOTER MÉDIAS 4 E 12 SEMANAS */}
                {(cohortLicencasData.summary4Weeks || cohortLicencasData.summary12Weeks) && (
                  <tfoot className="border-t-2 border-border/80 bg-bg-secondary/40 font-bold text-2xs">
                    {cohortLicencasData.summary4Weeks && (
                      <tr className="hover:bg-bg-secondary/60 transition-colors border-b border-border/50">
                        <td className="py-2.5 px-3 font-bold text-text-primary sticky left-0 bg-bg-secondary z-10 border-r border-border whitespace-nowrap">
                          <div className="flex items-center gap-1.5" title={`Média das últimas 4 safras ${cohortLicencasData.summary4Weeks.rangeLabel}`}>
                            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Média 4 sem. <span className="font-normal text-text-secondary text-[10px]">{cohortLicencasData.summary4Weeks.rangeLabel}</span></span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-text-primary sticky left-[90px] bg-bg-secondary z-10 border-r border-border">
                          {cohortLicencasData.summary4Weeks.planCountSum}
                        </td>
                        {cohortLicencasData.summary4Weeks.averages.map((avgVal: number | null, aIdx: number) => {
                          const hasVal = avgVal !== null && avgVal !== undefined;
                          const valDisplay = hasVal ? Number(avgVal).toLocaleString('pt-BR') : '-';
                          return (
                            <td
                              key={aIdx}
                              className="py-2.5 px-2 text-right font-bold text-text-primary border-r border-border/30 last:border-r-0"
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                    {cohortLicencasData.summary12Weeks && (
                      <tr className="hover:bg-bg-secondary/60 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-text-primary sticky left-0 bg-bg-secondary z-10 border-r border-border whitespace-nowrap">
                          <div className="flex items-center gap-1.5" title={`Média das últimas 12 safras ${cohortLicencasData.summary12Weeks.rangeLabel}`}>
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Média 12 sem. <span className="font-normal text-text-secondary text-[10px]">{cohortLicencasData.summary12Weeks.rangeLabel}</span></span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-text-primary sticky left-[90px] bg-bg-secondary z-10 border-r border-border">
                          {cohortLicencasData.summary12Weeks.planCountSum}
                        </td>
                        {cohortLicencasData.summary12Weeks.averages.map((avgVal: number | null, aIdx: number) => {
                          const hasVal = avgVal !== null && avgVal !== undefined;
                          const valDisplay = hasVal ? Number(avgVal).toLocaleString('pt-BR') : '-';
                          return (
                            <td
                              key={aIdx}
                              className="py-2.5 px-2 text-right font-bold text-text-primary border-r border-border/30 last:border-r-0"
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tfoot>
                )}
              </table>
            )}
          </div>
        </div>

        {/* Card: Taxa de Engajamento */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-4" id="card-taxa-engajamento-importacoes">
          <div>
            <h3 className="text-base font-bold text-text-primary">Taxa de Engajamento</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Taxa de engajamento das licenças de parceiros que estão no playbook.
            </p>
          </div>

          <div className="h-72 w-full relative" id="chart-taxa-engajamento-wrapper">
            {loadingStageData ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-xs text-text-secondary font-medium">Carregando histórico de engajamento...</span>
              </div>
            ) : !engagementChartData || engagementTimeline.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-lg bg-bg-secondary/10">
                <span className="text-xs text-text-secondary font-medium">
                  Nenhum histórico de importação/snapshot encontrado para os parceiros deste playbook.
                </span>
              </div>
            ) : (
              <Line data={engagementChartData} options={engagementChartOptions} />
            )}
          </div>
        </div>

        {/* Card: Motivos de Insucesso */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col gap-4" id="card-motivos-insucesso">
          <div>
            <h3 className="text-base font-bold text-text-primary">Motivos de Insucesso</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Planos concluídos sem sucesso, por motivo.
            </p>
          </div>

          <div
            className="w-full relative"
            id="chart-motivos-insucesso-wrapper"
            style={{ minHeight: '220px', height: `${Math.max(220, (unsuccessfulReasons?.length || 0) * 44)}px` }}
          >
            {loadingStageData ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-12">
                <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
                <span className="text-xs text-text-secondary font-medium">Carregando motivos de insucesso...</span>
              </div>
            ) : !unsuccessfulReasonsChartData || unsuccessfulReasons.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-border rounded-lg bg-bg-secondary/10 min-h-[160px]">
                <span className="text-xs text-text-secondary font-medium">
                  Nenhum plano sem sucesso registrado ainda.
                </span>
              </div>
            ) : (
              <Bar data={unsuccessfulReasonsChartData} options={unsuccessfulReasonsChartOptions} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default PlaybookAcompanhamento;
