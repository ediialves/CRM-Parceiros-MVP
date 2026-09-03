import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Users,
  Search,
  ChevronDown,
  X,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  Bookmark,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  BarChart2,
  Percent,
  Activity,
  Award,
  PieChart,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Filler,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Filler, Legend);

type Granularity = 'diario' | 'semanal' | 'mensal';

interface KPIResult {
  current: number;
  prev: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
  sparkline: number[];
}

export const PerformanceGerentes: React.FC = () => {
  const { user, isAdmin } = useAuth();

  // Granularity State (Default: semanal)
  const [granularity, setGranularity] = useState<Granularity>('semanal');

  // Filters State (Only active/visible for Admins)
  const [selectedPlanos, setSelectedPlanos] = useState<string[]>([]);
  const [selectedGerentes, setSelectedGerentes] = useState<string[]>([]);
  const [selectedPlaybookTipo, setSelectedPlaybookTipo] = useState<'todos' | 'playbooks_novos' | 'bau'>('todos');
  const [comPlano, setComPlano] = useState<'todos' | 'com_plano' | 'sem_plano'>('todos');
  const [statusEtapaPlano, setStatusEtapaPlano] = useState<'criado' | 'iniciado' | 'finalizado'>('criado');
  const [statusConclusao, setStatusConclusao] = useState<'todos' | 'sucesso' | 'sem_sucesso' | 'nao_classificado'>('todos');
  const [selectedFila, setSelectedFila] = useState<'todos' | 'RETENÇÃO' | 'EXPANSÃO'>('todos');

  // Dropdowns Open State
  const [isPlanoOpen, setIsPlanoOpen] = useState(false);
  const [isGerenteOpen, setIsGerenteOpen] = useState(false);
  const [planoSearch, setPlanoSearch] = useState('');
  const [gerenteSearch, setGerenteSearch] = useState('');

  const planoDropdownRef = useRef<HTMLDivElement>(null);
  const gerenteDropdownRef = useRef<HTMLDivElement>(null);

  // Saved Filters State
  const [savedFilters, setSavedFilters] = useState<any[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Table Pagination State
  const [tableCurrentPage, setTableCurrentPage] = useState(1);
  const rowsPerPage = 8;

  // Reset page when granularity or filters change
  useEffect(() => {
    setTableCurrentPage(1);
  }, [granularity, selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila]);

  // Raw Database Data State
  const [rawData, setRawData] = useState<{
    partners: any[];
    partnerSnapshots: any[];
    basePlans: any[];
    tasks: any[];
    managersList: any[];
    allUsers: any[];
  } | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (planoDropdownRef.current && !planoDropdownRef.current.contains(event.target as Node)) {
        setIsPlanoOpen(false);
      }
      if (gerenteDropdownRef.current && !gerenteDropdownRef.current.contains(event.target as Node)) {
        setIsGerenteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Saved Filters for Admin
  const fetchSavedFilters = async () => {
    if (!isAdmin) return;
    try {
      setLoadingFilters(true);
      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
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
    if (isAdmin) {
      fetchSavedFilters();
    }
  }, [isAdmin]);

  const handleSaveFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    try {
      setIsSavingFilter(true);
      const payload = {
        nome: newFilterName.trim(),
        planos: selectedPlanos,
        gerentes: selectedGerentes,
        origem_playbook: selectedPlaybookTipo,
        plano_existente: comPlano,
        status_etapa_plano: statusEtapaPlano,
        status_conclusao_filtro: statusConclusao,
        fila: selectedFila,
        user_id: user?.id,
      };

      const { error } = await supabase
        .from('saved_filters')
        .insert(payload);

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

  // Main Data Fetch
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoadingData(true);
        setErrorMsg(null);

        // Fetch users / managers
        let managersList: any[] = [];
        let allUsers: any[] = [];
        if (isAdmin) {
          const { data: fetchUsers, error: usersErr } = await supabase.rpc('get_all_users_for_admin');
          if (!usersErr && fetchUsers) {
            allUsers = fetchUsers;
            managersList = fetchUsers
              .filter((u: any) => u.role === 'gerente')
              .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
          }
        }

        // Fetch partners (paginated)
        const fetchAllPartners = async () => {
          let allPartners: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            let query = supabase
              .from('partners')
              .select('id, gerente_id, gerente, segmento, fila');
            
            // If manager, enforce partner ownership at query level
            if (!isAdmin) {
              query = query.eq('gerente_id', user.id);
            }

            const { data, error } = await query.range(from, from + limit - 1);
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

        // Fetch partner snapshots (paginated) with import_completo = true
        const fetchPartnerSnapshots = async () => {
          let allSnapshots: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('partner_snapshots')
              .select('partner_id, imported_at, licencas, licencas_engajadas, estoque, import_completo, plano')
              .eq('import_completo', true)
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
        };

        // Fetch base plans (paginated)
        const fetchAllBasePlans = async () => {
          let allPlans: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('plans')
              .select('id, ativo, status_conclusao, partner_id, created_at, playbook_id')
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

        // Fetch tasks (paginated)
        const fetchAllTasks = async () => {
          try {
            let allTasks: any[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;
            while (hasMore) {
              const { data, error } = await supabase
                .from('tasks')
                .select('id, status, deletada_em, plan_id')
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

        const [partners, partnerSnapshots, basePlans, tasks] = await Promise.all([
          fetchAllPartners(),
          fetchPartnerSnapshots(),
          fetchAllBasePlans(),
          fetchAllTasks()
        ]);

        if (!isMounted) return;

        setRawData({
          partners: partners || [],
          partnerSnapshots: partnerSnapshots || [],
          basePlans: basePlans || [],
          tasks: tasks || [],
          managersList,
          allUsers
        });
      } catch (err: any) {
        console.error('Erro ao carregar dados de PerformanceGerentes:', err);
        if (isMounted) {
          setErrorMsg(err.message || 'Falha ao carregar dados');
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
  }, [user?.id, isAdmin]);

  // Available Filter Options for Admin
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

  // Calculation of Qualified Partners based on Permissions and Active Filters
  const filteredPartnerIds = useMemo(() => {
    if (!rawData) return new Set<string>();
    const { partners, basePlans, tasks, managersList, allUsers } = rawData;

    // If Manager: strictly their own portfolio
    if (!isAdmin) {
      return new Set(
        partners
          .filter(p => p.gerente_id === user?.id)
          .map(p => p.id)
      );
    }

    // If Admin: evaluate all active filter criteria
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

    const passes = (partner: any) => {
      if (!partner) return false;

      const partnerGerenteNorm = partner.gerente ? partner.gerente.trim().toLowerCase() : '';
      if (!partnerGerenteNorm || !validUserNames.has(partnerGerenteNorm)) {
        return false;
      }

      const planoVal = partner.segmento?.trim() || '';
      if (selectedPlanos.length > 0 && !selectedPlanos.includes(planoVal)) return false;

      const managerObj = (managersList || []).find((m: any) => m.id === partner.gerente_id);
      const managerName = managerObj?.nome || 'Sem Gerente';
      if (selectedGerentes.length > 0 && !selectedGerentes.includes(managerName)) return false;

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

      if (selectedFila !== 'todos' && partner.fila !== selectedFila) return false;

      return true;
    };

    return new Set(partners.filter(passes).map(p => p.id));
  }, [rawData, isAdmin, user, selectedPlanos, selectedGerentes, selectedPlaybookTipo, comPlano, statusEtapaPlano, statusConclusao, selectedFila]);

  // Helper date functions for Granularities
  const getMondayOfWeek = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
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

  const getMonthKey = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length < 2) return dateStr;
    return `${parts[0]}-${parts[1]}-01`;
  };

  // Group snapshots by period according to granularity and compute the 4 KPIs
  const performanceKPIs = useMemo(() => {
    if (!rawData || !rawData.partnerSnapshots || filteredPartnerIds.size === 0) {
      return {
        totais: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        engajadas: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        desengajadas: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        taxa: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        hasData: false,
        totalPeriods: 0
      };
    }

    const { partnerSnapshots } = rawData;

    // Step 1: For each snapshot date (imported_at::date), sum metrics per partner then sum across all partners
    // dateStr -> Map<partner_id, { licencas, licencas_engajadas, estoque }>
    const importDatesMap = new Map<string, Map<string, { licencas: number; licencas_engajadas: number; estoque: number }>>();

    partnerSnapshots.forEach((ps: any) => {
      if (!filteredPartnerIds.has(ps.partner_id)) return;
      if (ps.import_completo === false) return;
      const rawDate = ps.imported_at;
      if (!rawDate) return;
      const dateKey = typeof rawDate === 'string' ? rawDate.split('T')[0] : String(rawDate).substring(0, 10);

      let pMap = importDatesMap.get(dateKey);
      if (!pMap) {
        pMap = new Map();
        importDatesMap.set(dateKey, pMap);
      }

      const prev = pMap.get(ps.partner_id) || { licencas: 0, licencas_engajadas: 0, estoque: 0 };
      pMap.set(ps.partner_id, {
        licencas: prev.licencas + (Number(ps.licencas) || 0),
        licencas_engajadas: prev.licencas_engajadas + (Number(ps.licencas_engajadas) || 0),
        estoque: prev.estoque + (Number(ps.estoque) || 0),
      });
    });

    // Step 2: Consolidate by granularity period
    // If multiple imports fall in the same period (e.g. same week or month), take the latest import date of that period
    const sortedImportDates = Array.from(importDatesMap.keys()).sort((a, b) => a.localeCompare(b));
    
    // periodKey -> latest import date in that period
    const periodToLatestDateMap = new Map<string, string>();
    sortedImportDates.forEach((dateKey) => {
      let periodKey = dateKey;
      if (granularity === 'semanal') {
        periodKey = getMondayOfWeek(dateKey);
      } else if (granularity === 'mensal') {
        periodKey = getMonthKey(dateKey);
      }
      periodToLatestDateMap.set(periodKey, dateKey);
    });

    const sortedPeriods = Array.from(periodToLatestDateMap.keys()).sort((a, b) => a.localeCompare(b));

    if (sortedPeriods.length === 0) {
      return {
        totais: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        engajadas: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        desengajadas: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        taxa: { current: 0, prev: null, deltaAbs: null, deltaPct: null, sparkline: [] } as KPIResult,
        hasData: false,
        totalPeriods: 0
      };
    }

    const periodsData = sortedPeriods.map(periodKey => {
      const latestDateOfPeriod = periodToLatestDateMap.get(periodKey)!;
      const partnerMap = importDatesMap.get(latestDateOfPeriod)!;

      let sumLicencas = 0;
      let sumEngajadas = 0;
      let sumEstoque = 0;

      partnerMap.forEach(item => {
        sumLicencas += item.licencas;
        sumEngajadas += item.licencas_engajadas;
        sumEstoque += item.estoque;
      });

      const taxa = sumLicencas > 0 ? (sumEngajadas / sumLicencas) * 100 : 0;

      return {
        periodKey,
        licencasTotais: sumLicencas,
        licencasEngajadas: sumEngajadas,
        licencasDesengajadas: sumEstoque,
        taxaEngajamento: taxa
      };
    });

    const lastIdx = periodsData.length - 1;
    const curr = periodsData[lastIdx];
    const prev = lastIdx > 0 ? periodsData[lastIdx - 1] : null;

    // Helper to compute KPI result with sparkline of last 8 periods
    const last8Periods = periodsData.slice(-8);

    const makeKPIResult = (
      extractVal: (p: typeof curr) => number,
      isTaxa = false
    ): KPIResult => {
      const currentVal = extractVal(curr);
      const prevVal = prev ? extractVal(prev) : null;
      const sparkline = last8Periods.map(extractVal);

      if (prevVal === null) {
        return {
          current: currentVal,
          prev: null,
          deltaAbs: null,
          deltaPct: null,
          sparkline
        };
      }

      const deltaAbs = currentVal - prevVal;
      let deltaPct: number | null = null;
      if (isTaxa) {
        // For rate, delta is in percentage points (p.p.)
        deltaPct = deltaAbs;
      } else {
        deltaPct = prevVal > 0 ? (deltaAbs / prevVal) * 100 : (deltaAbs === 0 ? 0 : null);
      }

      return {
        current: currentVal,
        prev: prevVal,
        deltaAbs,
        deltaPct,
        sparkline
      };
    };

    return {
      totais: makeKPIResult(p => p.licencasTotais),
      engajadas: makeKPIResult(p => p.licencasEngajadas),
      desengajadas: makeKPIResult(p => p.licencasDesengajadas),
      taxa: makeKPIResult(p => p.taxaEngajamento, true),
      hasData: true,
      totalPeriods: periodsData.length,
      periodsData,
      windowPeriods: last8Periods
    };
  }, [rawData, filteredPartnerIds, granularity]);

  // Helper date label formatter for charts
  const formatPeriodLabel = (periodKey: string, gran: Granularity): string => {
    if (!periodKey) return '';
    const parts = periodKey.split('-');
    if (parts.length !== 3) return periodKey;
    const [year, month, day] = parts;
    if (gran === 'mensal') {
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const mIdx = parseInt(month, 10) - 1;
      return `${monthNames[mIdx] || month}/${year.substring(2)}`;
    }
    return `${day}/${month}`;
  };

  // Custom Chart.js Plugin to draw permanent labels ONLY on the first and last points of each line
  const endPointsLabelsPlugin = {
    id: 'endPointsLabelsPlugin',
    afterDatasetsDraw(chart: any) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
        const meta = chart.getDatasetMeta(datasetIndex);
        if (!meta || meta.hidden) return;
        const totalPoints = meta.data.length;
        if (totalPoints === 0) return;

        const indicesToDraw = totalPoints === 1 ? [0] : [0, totalPoints - 1];

        indicesToDraw.forEach(index => {
          const element = meta.data[index];
          if (!element) return;
          const val = dataset.data[index];
          if (val === undefined || val === null) return;

          const isPercentage = dataset.isPercentage === true;
          const formattedVal = isPercentage
            ? `${Number(val).toFixed(1).replace('.', ',')}%`
            : Number(val).toLocaleString('pt-BR');

          ctx.save();
          ctx.font = 'bold 10px sans-serif';
          ctx.fillStyle = dataset.borderColor || '#6b7280';
          ctx.textAlign = index === 0 ? 'left' : 'right';
          ctx.textBaseline = 'bottom';

          const offsetX = index === 0 ? 4 : -4;
          const offsetY = -6;
          ctx.fillText(formattedVal, element.x + offsetX, element.y + offsetY);
          ctx.restore();
        });
      });
    }
  };

  // Prepare Data for Chart 1: Evolução da Carteira (3 Linhas, Mesmo Eixo Y)
  const evolucaoCarteiraChartData = useMemo(() => {
    const windowPeriods = (performanceKPIs as any).windowPeriods || [];
    const labels = windowPeriods.map((p: any) => formatPeriodLabel(p.periodKey, granularity));
    const totaisData = windowPeriods.map((p: any) => p.licencasTotais);
    const engajadasData = windowPeriods.map((p: any) => p.licencasEngajadas);
    const desengajadasData = windowPeriods.map((p: any) => p.licencasDesengajadas);

    return {
      labels,
      datasets: [
        {
          label: 'Licenças Totais',
          data: totaisData,
          borderColor: '#6366f1', // Roxo / Indigo
          backgroundColor: '#6366f110',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: (ctx: any) => {
            const idx = ctx.dataIndex;
            const count = ctx.dataset.data.length;
            return idx === 0 || idx === count - 1 ? 4.5 : 2;
          },
          pointHoverRadius: 6,
          pointBackgroundColor: '#6366f1',
          fill: false,
          isPercentage: false
        },
        {
          label: 'Licenças Engajadas',
          data: engajadasData,
          borderColor: '#10b981', // Verde
          backgroundColor: '#10b98110',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: (ctx: any) => {
            const idx = ctx.dataIndex;
            const count = ctx.dataset.data.length;
            return idx === 0 || idx === count - 1 ? 4.5 : 2;
          },
          pointHoverRadius: 6,
          pointBackgroundColor: '#10b981',
          fill: false,
          isPercentage: false
        },
        {
          label: 'Licenças Desengajadas',
          data: desengajadasData,
          borderColor: '#f97316', // Laranja
          backgroundColor: '#f9731610',
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: (ctx: any) => {
            const idx = ctx.dataIndex;
            const count = ctx.dataset.data.length;
            return idx === 0 || idx === count - 1 ? 4.5 : 2;
          },
          pointHoverRadius: 6,
          pointBackgroundColor: '#f97316',
          fill: false,
          isPercentage: false
        }
      ]
    };
  }, [performanceKPIs, granularity]);

  // Options for Chart 1 with Rich Tooltip (Volumes + Taxa de Engajamento + Variação vs. Anterior)
  const evolucaoCarteiraOptions = useMemo(() => {
    const windowPeriods = (performanceKPIs as any).windowPeriods || [];

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top' as const,
          align: 'end' as const,
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            font: { size: 11, weight: 'bold' as any },
            padding: 14,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { size: 12, weight: 'bold' as any },
          bodyFont: { size: 11 },
          padding: 12,
          cornerRadius: 8,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            title: (items: any[]) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const period = windowPeriods[idx];
              if (!period) return items[0].label;
              return `Período: ${formatPeriodLabel(period.periodKey, granularity)} (${period.periodKey})`;
            },
            label: (item: any) => {
              const datasetLabel = item.dataset.label || '';
              const val = Number(item.raw) || 0;
              return ` ${datasetLabel}: ${val.toLocaleString('pt-BR')}`;
            },
            afterBody: (items: any[]) => {
              if (!items.length) return [];
              const idx = items[0].dataIndex;
              const period = windowPeriods[idx];
              if (!period) return [];

              const lines: string[] = [
                '-----------------------------',
                ` Taxa de Engajamento: ${period.taxaEngajamento.toFixed(1).replace('.', ',')}%`
              ];

              if (idx > 0) {
                const prev = windowPeriods[idx - 1];
                const deltaTotais = period.licencasTotais - prev.licencasTotais;
                const deltaEngajadas = period.licencasEngajadas - prev.licencasEngajadas;
                const deltaDesengajadas = period.licencasDesengajadas - prev.licencasDesengajadas;
                const deltaTaxa = period.taxaEngajamento - prev.taxaEngajamento;

                lines.push(` Δ Totais vs. ant: ${deltaTotais >= 0 ? '+' : ''}${deltaTotais.toLocaleString('pt-BR')}`);
                lines.push(` Δ Engajadas vs. ant: ${deltaEngajadas >= 0 ? '+' : ''}${deltaEngajadas.toLocaleString('pt-BR')}`);
                lines.push(` Δ Desengajadas vs. ant: ${deltaDesengajadas >= 0 ? '+' : ''}${deltaDesengajadas.toLocaleString('pt-BR')}`);
                lines.push(` Δ Taxa vs. ant: ${deltaTaxa >= 0 ? '+' : ''}${deltaTaxa.toFixed(1).replace('.', ',')} p.p.`);
              } else {
                lines.push(' Variação: Primeiro ponto da janela');
              }

              return lines;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        },
        y: {
          grid: { color: 'rgba(156, 163, 175, 0.15)' },
          ticks: {
            font: { size: 11 },
            callback: (value: any) => Number(value).toLocaleString('pt-BR')
          }
        }
      }
    };
  }, [performanceKPIs, granularity]);

  // Calculations for Chart 2: Taxa de Engajamento & 4 Estatísticas de Apoio
  const taxaStats = useMemo(() => {
    const windowPeriods = (performanceKPIs as any).windowPeriods || [];
    if (windowPeriods.length === 0) {
      return {
        atual: 0,
        melhor: { taxa: 0, periodKey: '' },
        menor: { taxa: 0, periodKey: '' },
        media: 0
      };
    }

    const atual = windowPeriods[windowPeriods.length - 1].taxaEngajamento;

    let maxPeriod = windowPeriods[0];
    let minPeriod = windowPeriods[0];
    let sum = 0;

    windowPeriods.forEach((p: any) => {
      sum += p.taxaEngajamento;
      if (p.taxaEngajamento > maxPeriod.taxaEngajamento) {
        maxPeriod = p;
      }
      if (p.taxaEngajamento < minPeriod.taxaEngajamento) {
        minPeriod = p;
      }
    });

    const media = sum / windowPeriods.length;

    return {
      atual,
      melhor: {
        taxa: maxPeriod.taxaEngajamento,
        periodKey: maxPeriod.periodKey
      },
      menor: {
        taxa: minPeriod.taxaEngajamento,
        periodKey: minPeriod.periodKey
      },
      media
    };
  }, [performanceKPIs]);

  // Chart Data for Chart 2: Evolução da Taxa de Engajamento (%)
  const taxaChartData = useMemo(() => {
    const windowPeriods = (performanceKPIs as any).windowPeriods || [];
    const labels = windowPeriods.map((p: any) => formatPeriodLabel(p.periodKey, granularity));
    const data = windowPeriods.map((p: any) => Number(p.taxaEngajamento.toFixed(1)));

    return {
      labels,
      datasets: [
        {
          label: 'Taxa de Engajamento',
          data,
          borderColor: '#f59e0b', // Âmbar / Dourado
          backgroundColor: '#f59e0b15',
          borderWidth: 2.5,
          tension: 0.3,
          fill: true,
          pointRadius: (ctx: any) => {
            const idx = ctx.dataIndex;
            const count = ctx.dataset.data.length;
            return idx === 0 || idx === count - 1 ? 4.5 : 2;
          },
          pointHoverRadius: 6,
          pointBackgroundColor: '#f59e0b',
          isPercentage: true
        }
      ]
    };
  }, [performanceKPIs, granularity]);

  // Chart Options for Chart 2
  const taxaChartOptions = useMemo(() => {
    const windowPeriods = (performanceKPIs as any).windowPeriods || [];

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index' as const,
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleFont: { size: 12, weight: 'bold' as any },
          bodyFont: { size: 11 },
          padding: 10,
          cornerRadius: 8,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          callbacks: {
            title: (items: any[]) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const period = windowPeriods[idx];
              if (!period) return items[0].label;
              return `Período: ${formatPeriodLabel(period.periodKey, granularity)} (${period.periodKey})`;
            },
            label: (item: any) => {
              const val = Number(item.raw) || 0;
              return ` Taxa: ${val.toFixed(1).replace('.', ',')}%`;
            },
            afterBody: (items: any[]) => {
              if (!items.length) return [];
              const idx = items[0].dataIndex;
              const period = windowPeriods[idx];
              if (!period || idx === 0) return [];
              const prev = windowPeriods[idx - 1];
              const deltaTaxa = period.taxaEngajamento - prev.taxaEngajamento;
              return [
                ` Δ vs. ant: ${deltaTaxa >= 0 ? '+' : ''}${deltaTaxa.toFixed(1).replace('.', ',')} p.p.`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(156, 163, 175, 0.15)' },
          ticks: {
            font: { size: 10 },
            callback: (value: any) => `${value}%`
          }
        }
      }
    };
  }, [performanceKPIs, granularity]);

  // Calculations for Donut Chart (Distribution in Most Recent Period)
  const donutData = useMemo(() => {
    const periods = (performanceKPIs as any).periodsData || [];
    if (periods.length === 0) {
      return {
        total: 0,
        engajadas: 0,
        desengajadas: 0,
        pctEngajadas: 0,
        pctDesengajadas: 0,
        chartData: {
          labels: ['Engajadas', 'Desengajadas'],
          datasets: [{ data: [0, 0], backgroundColor: ['#10b981', '#f97316'], borderWidth: 0 }]
        }
      };
    }

    const latest = periods[periods.length - 1];
    const total = latest.licencasTotais || 0;
    const engajadas = latest.licencasEngajadas || 0;
    const desengajadas = latest.licencasDesengajadas || 0;

    const pctEngajadas = total > 0 ? (engajadas / total) * 100 : 0;
    const pctDesengajadas = total > 0 ? (desengajadas / total) * 100 : 0;

    return {
      total,
      engajadas,
      desengajadas,
      pctEngajadas,
      pctDesengajadas,
      chartData: {
        labels: ['Engajadas', 'Desengajadas'],
        datasets: [
          {
            data: [engajadas, desengajadas],
            backgroundColor: ['#10b981', '#f97316'],
            hoverBackgroundColor: ['#059669', '#ea580c'],
            borderWidth: 2,
            borderColor: 'var(--card-bg, #ffffff)',
          }
        ]
      }
    };
  }, [performanceKPIs]);

  const donutOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { size: 12, weight: 'bold' as any },
        bodyFont: { size: 11 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (item: any) => {
            const val = Number(item.raw) || 0;
            const total = donutData.total;
            const pct = total > 0 ? ((val / total) * 100).toFixed(1).replace('.', ',') : '0';
            return ` ${item.label}: ${val.toLocaleString('pt-BR')} (${pct}%)`;
          }
        }
      }
    }
  }), [donutData]);

  // Dynamic Insights Calculation (Max 3, strictly derived from data)
  interface InsightItem {
    id: string;
    text: string;
    type: 'positive' | 'negative' | 'neutral';
    direction: 'up' | 'down' | 'neutral';
  }

  const dynamicInsights = useMemo<InsightItem[]>(() => {
    const periods = (performanceKPIs as any).periodsData || [];
    if (periods.length === 0) return [];

    const latest = periods[periods.length - 1];
    const prev = periods.length > 1 ? periods[periods.length - 2] : null;
    const windowPeriods = (performanceKPIs as any).windowPeriods || [];

    const list: InsightItem[] = [];

    // 1. Mudança da taxa de engajamento (p.p. vs período anterior)
    if (prev) {
      const deltaTaxa = latest.taxaEngajamento - prev.taxaEngajamento;
      if (Math.abs(deltaTaxa) >= 0.05) {
        const isUp = deltaTaxa > 0;
        list.push({
          id: 'insight-taxa',
          text: `A taxa de engajamento ${isUp ? 'aumentou' : 'reduziu'} ${Math.abs(deltaTaxa).toFixed(1).replace('.', ',')} p.p. em relação ao período anterior (atingindo ${latest.taxaEngajamento.toFixed(1).replace('.', ',')}%).`,
          type: isUp ? 'positive' : 'negative',
          direction: isUp ? 'up' : 'down'
        });
      } else {
        list.push({
          id: 'insight-taxa-estavel',
          text: `A taxa de engajamento manteve-se estável em ${latest.taxaEngajamento.toFixed(1).replace('.', ',')}% em relação ao período anterior.`,
          type: 'neutral',
          direction: 'neutral'
        });
      }
    }

    // 2. Mudança absoluta de engajadas/desengajadas (Regra invertida para desengajadas)
    if (prev) {
      const deltaEng = latest.licencasEngajadas - prev.licencasEngajadas;
      const deltaDes = latest.licencasDesengajadas - prev.licencasDesengajadas;

      if (Math.abs(deltaEng) > 0) {
        const isUp = deltaEng > 0;
        list.push({
          id: 'insight-engajadas',
          text: `${isUp ? 'Foram adicionadas' : 'Houve redução de'} ${Math.abs(deltaEng).toLocaleString('pt-BR')} licença(s) engajada(s) na carteira.`,
          type: isUp ? 'positive' : 'negative',
          direction: isUp ? 'up' : 'down'
        });
      } else if (Math.abs(deltaDes) > 0) {
        // Redução em desengajadas é POSITIVO (verde)
        const isDown = deltaDes < 0;
        list.push({
          id: 'insight-desengajadas',
          text: `O volume de licenças desengajadas ${isDown ? 'diminuiu em' : 'aumentou em'} ${Math.abs(deltaDes).toLocaleString('pt-BR')} licença(s).`,
          type: isDown ? 'positive' : 'negative',
          direction: isDown ? 'down' : 'up'
        });
      }
    }

    // 3. Melhor ou pior período dentro da janela exibida
    if (windowPeriods.length >= 2) {
      let maxP = windowPeriods[0];
      let minP = windowPeriods[0];
      windowPeriods.forEach((p: any) => {
        if (p.taxaEngajamento > maxP.taxaEngajamento) maxP = p;
        if (p.taxaEngajamento < minP.taxaEngajamento) minP = p;
      });

      if (latest.periodKey === maxP.periodKey && maxP.taxaEngajamento > minP.taxaEngajamento) {
        list.push({
          id: 'insight-pico',
          text: `O período atual atingiu o pico de engajamento da janela recente (${maxP.taxaEngajamento.toFixed(1).replace('.', ',')}% em ${formatPeriodLabel(maxP.periodKey, granularity)}).`,
          type: 'positive',
          direction: 'up'
        });
      } else if (latest.periodKey === minP.periodKey && maxP.taxaEngajamento > minP.taxaEngajamento) {
        list.push({
          id: 'insight-vale',
          text: `O período atual registrou a menor taxa de engajamento da janela recente (${minP.taxaEngajamento.toFixed(1).replace('.', ',')}% em ${formatPeriodLabel(minP.periodKey, granularity)}).`,
          type: 'negative',
          direction: 'down'
        });
      } else {
        list.push({
          id: 'insight-recorde',
          text: `O melhor engajamento da janela foi registrado em ${formatPeriodLabel(maxP.periodKey, granularity)} (${maxP.taxaEngajamento.toFixed(1).replace('.', ',')}%).`,
          type: 'neutral',
          direction: 'neutral'
        });
      }
    }

    // 4. Mudança relevante no total de licenças (fallback se necessário)
    if (list.length < 3 && prev) {
      const deltaTot = latest.licencasTotais - prev.licencasTotais;
      if (deltaTot !== 0) {
        const isUp = deltaTot > 0;
        list.push({
          id: 'insight-totais',
          text: `A carteira total variou em ${isUp ? '+' : ''}${deltaTot.toLocaleString('pt-BR')} licença(s) (${((deltaTot / (prev.licencasTotais || 1)) * 100).toFixed(1).replace('.', ',')}%).`,
          type: isUp ? 'positive' : 'negative',
          direction: isUp ? 'up' : 'down'
        });
      }
    }

    return list.slice(0, 3);
  }, [performanceKPIs, granularity]);

  // Calculations for Detail Table (All periods sorted from newest to oldest, with pagination)
  const tableDataWithDeltas = useMemo(() => {
    const periods = (performanceKPIs as any).periodsData || [];
    if (periods.length === 0) return [];

    // Calculate delta vs previous chronologically
    const enriched = periods.map((item: any, idx: number) => {
      const prev = idx > 0 ? periods[idx - 1] : null;
      const deltaTaxa = prev !== null ? item.taxaEngajamento - prev.taxaEngajamento : null;
      return {
        ...item,
        deltaTaxa
      };
    });

    // Sort newest to oldest for the table view
    return enriched.slice().reverse();
  }, [performanceKPIs]);

  const totalTablePages = Math.max(1, Math.ceil(tableDataWithDeltas.length / rowsPerPage));
  const paginatedTableRows = useMemo(() => {
    const start = (tableCurrentPage - 1) * rowsPerPage;
    return tableDataWithDeltas.slice(start, start + rowsPerPage);
  }, [tableDataWithDeltas, tableCurrentPage, rowsPerPage]);

  // Mini Sparkline Render Component using Chart.js Line
  const renderSparkline = (data: number[], color: string) => {
    if (!data || data.length === 0) return null;
    const chartData = {
      labels: data.map((_, i) => String(i)),
      datasets: [
        {
          data,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 0,
          tension: 0.35,
          fill: true,
          backgroundColor: `${color}15`,
        }
      ]
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        x: { display: false },
        y: { display: false }
      },
      elements: {
        line: { tension: 0.35 }
      }
    };

    return (
      <div className="h-10 w-28">
        <Line data={chartData} options={chartOptions} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary p-6 space-y-6" id="page-performance-gerentes">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5" id="header-performance-gerentes">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Performance Gerentes
              </h1>
              <p className="text-sm text-text-secondary mt-0.5">
                {isAdmin
                  ? 'Acompanhamento consolidado e análise de desempenho das carteiras e gerentes.'
                  : 'Acompanhamento de métricas e evolução de engajamento da sua carteira de parceiros.'}
              </p>
            </div>
          </div>
        </div>

        {/* Granularity Pill Selector */}
        <div className="flex items-center self-start md:self-auto bg-bg-secondary/40 p-1 rounded-xl border border-border" id="toggle-granularidade">
          <button
            type="button"
            onClick={() => setGranularity('diario')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              granularity === 'diario'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60'
            }`}
            id="btn-granularity-diario"
          >
            Diário
          </button>
          <button
            type="button"
            onClick={() => setGranularity('semanal')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              granularity === 'semanal'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60'
            }`}
            id="btn-granularity-semanal"
          >
            Semanal
          </button>
          <button
            type="button"
            onClick={() => setGranularity('mensal')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              granularity === 'mensal'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/60'
            }`}
            id="btn-granularity-mensal"
          >
            Mensal
          </button>
        </div>
      </div>

      {/* Admin Global Filter Bar */}
      {isAdmin && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4" id="section-filtros-admin">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Filtros Globais
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedPlanos([]);
                setSelectedGerentes([]);
                setSelectedPlaybookTipo('todos');
                setComPlano('todos');
                setStatusEtapaPlano('criado');
                setStatusConclusao('todos');
                setSelectedFila('todos');
              }}
              className="text-xs text-text-secondary hover:text-indigo-600 dark:hover:text-indigo-400 font-medium transition-colors"
              id="btn-limpar-filtros"
            >
              Limpar Filtros
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Multi-Select: Plano/Segmento */}
            <div className="relative" ref={planoDropdownRef} id="filter-plano-segmento">
              <span className="text-xs font-semibold text-text-secondary mb-1.5 block">Segmento</span>
              <button
                type="button"
                onClick={() => setIsPlanoOpen(!isPlanoOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-bg-primary border border-border rounded-lg text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="btn-dropdown-plano"
              >
                <span className="truncate">
                  {selectedPlanos.length === 0
                    ? 'Todos os Segmentos'
                    : `${selectedPlanos.length} selecionado(s)`}
                </span>
                <ChevronDown className="h-4 w-4 text-text-secondary shrink-0" />
              </button>

              {isPlanoOpen && (
                <div className="absolute top-full mt-1.5 left-0 w-64 bg-card border border-border rounded-xl shadow-xl z-50 p-2 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Buscar segmento..."
                      value={planoSearch}
                      onChange={(e) => setPlanoSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-bg-secondary/40 border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredPlanos.map((p) => {
                      const isSelected = selectedPlanos.includes(p);
                      return (
                        <label
                          key={p}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-secondary/40 rounded-md cursor-pointer text-xs text-text-primary"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedPlanos(prev =>
                                isSelected ? prev.filter(item => item !== p) : [...prev, p]
                              );
                            }}
                            className="rounded border-border text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="truncate">{p}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Multi-Select: Gerente */}
            <div className="relative" ref={gerenteDropdownRef} id="filter-gerente">
              <span className="text-xs font-semibold text-text-secondary mb-1.5 block">Gerente</span>
              <button
                type="button"
                onClick={() => setIsGerenteOpen(!isGerenteOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-bg-primary border border-border rounded-lg text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="btn-dropdown-gerente"
              >
                <span className="truncate">
                  {selectedGerentes.length === 0
                    ? 'Todos os Gerentes'
                    : `${selectedGerentes.length} selecionado(s)`}
                </span>
                <ChevronDown className="h-4 w-4 text-text-secondary shrink-0" />
              </button>

              {isGerenteOpen && (
                <div className="absolute top-full mt-1.5 left-0 w-64 bg-card border border-border rounded-xl shadow-xl z-50 p-2 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Buscar gerente..."
                      value={gerenteSearch}
                      onChange={(e) => setGerenteSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-bg-secondary/40 border border-border rounded-lg text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredGerentes.map((g) => {
                      const isSelected = selectedGerentes.includes(g);
                      return (
                        <label
                          key={g}
                          className="flex items-center gap-2 px-2 py-1.5 hover:bg-bg-secondary/40 rounded-md cursor-pointer text-xs text-text-primary"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedGerentes(prev =>
                                isSelected ? prev.filter(item => item !== g) : [...prev, g]
                              );
                            }}
                            className="rounded border-border text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="truncate">{g}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Origem do Playbook */}
            <div id="filter-origem-playbook">
              <span className="text-xs font-semibold text-text-secondary mb-1.5 block">Origem do Playbook</span>
              <select
                value={selectedPlaybookTipo}
                onChange={(e) => setSelectedPlaybookTipo(e.target.value as any)}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="select-origem-playbook"
              >
                <option value="todos">Todos os Playbooks</option>
                <option value="playbooks_novos">Playbooks Novos</option>
                <option value="bau">BAU (Legados)</option>
              </select>
            </div>

            {/* Etapa do Plano */}
            <div id="filter-etapa-plano">
              <span className="text-xs font-semibold text-text-secondary mb-1.5 block">Etapa do Plano</span>
              <select
                value={statusEtapaPlano}
                onChange={(e) => setStatusEtapaPlano(e.target.value as any)}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-xs font-medium text-text-primary focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="select-etapa-plano"
              >
                <option value="criado">Criado (Todos)</option>
                <option value="iniciado">Iniciado</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>
          </div>

          {/* Saved Filters & Chips */}
          <div className="border-t border-border/40 pt-3 flex flex-wrap items-center justify-between gap-3" id="saved-filters-row">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                <Bookmark className="h-3.5 w-3.5 text-indigo-500" /> Filtros salvos:
              </span>

              {loadingFilters ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
              ) : (
                savedFilters.map((filter) => (
                  <div
                    key={filter.id}
                    onClick={() => handleApplyFilter(filter)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-border bg-bg-secondary/20 hover:bg-bg-secondary/40 cursor-pointer transition-all"
                    id={`chip-saved-filter-${filter.id}`}
                  >
                    <Bookmark className="h-3 w-3 text-indigo-500" />
                    <span className="truncate max-w-[130px]">{filter.nome}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteFilter(filter.id, e)}
                      className="p-0.5 hover:text-rose-500 text-text-secondary transition-colors"
                      title="Excluir filtro"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}

              {showSaveInput ? (
                <form onSubmit={handleSaveFilter} className="flex items-center gap-1.5 bg-card p-1 rounded-full border border-indigo-500">
                  <input
                    type="text"
                    placeholder="Nome do filtro..."
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                    className="rounded-full border-none bg-transparent px-2.5 py-0.5 text-xs text-text-primary focus:outline-none w-32"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isSavingFilter || !newFilterName.trim()}
                    className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSaveInput(false);
                      setNewFilterName('');
                    }}
                    className="rounded-full px-2 py-0.5 text-xs text-text-secondary hover:bg-bg-secondary/40"
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSaveInput(true)}
                  className="rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-text-secondary hover:text-indigo-600 hover:border-indigo-600 transition-colors"
                  id="btn-abrir-salvar-filtro"
                >
                  + Salvar filtro atual
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error States */}
      {loadingData ? (
        <div className="py-24 text-center text-text-secondary flex flex-col items-center justify-center bg-card border border-border rounded-xl" id="loading-state">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm font-semibold text-text-primary">Carregando métricas de performance...</p>
          <p className="text-xs text-text-secondary mt-1">Consolidando dados históricos e snapshots das carteiras.</p>
        </div>
      ) : errorMsg ? (
        <div className="p-8 text-center text-rose-500 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 rounded-xl" id="error-state">
          <p className="text-sm font-semibold">{errorMsg}</p>
        </div>
      ) : !performanceKPIs.hasData ? (
        <div className="p-12 text-center text-text-secondary bg-card border border-border rounded-xl" id="empty-state">
          <p className="text-base font-semibold text-text-primary">Nenhum dado encontrado para o período ou filtros selecionados.</p>
          <p className="text-xs mt-1">Verifique os filtros aplicados ou altere a granularidade temporal.</p>
        </div>
      ) : (
        /* The 4 KPIs Cards */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5" id="section-kpis-topo">
          {/* Card 1: Licenças Totais */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between hover:border-border/80 transition-all" id="card-kpi-licencas-totais">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Licenças Totais
                </span>
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-text-primary tracking-tight" id="val-kpi-totais">
                  {performanceKPIs.totais.current.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <div>
                {performanceKPIs.totais.deltaAbs !== null ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        performanceKPIs.totais.deltaAbs >= 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {performanceKPIs.totais.deltaAbs >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      {performanceKPIs.totais.deltaAbs >= 0 ? '+' : ''}
                      {performanceKPIs.totais.deltaAbs.toLocaleString('pt-BR')}
                      {performanceKPIs.totais.deltaPct !== null && (
                        <span className="text-[10px] opacity-80 font-semibold ml-0.5">
                          ({performanceKPIs.totais.deltaPct >= 0 ? '+' : ''}
                          {performanceKPIs.totais.deltaPct.toFixed(1).replace('.', ',')}%)
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-text-secondary font-medium">vs. anterior</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-secondary font-medium">Sem período anterior</span>
                )}
              </div>

              {renderSparkline(performanceKPIs.totais.sparkline, '#6366f1')}
            </div>
          </div>

          {/* Card 2: Licenças Engajadas */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between hover:border-border/80 transition-all" id="card-kpi-licencas-engajadas">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Licenças Engajadas
                </span>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight" id="val-kpi-engajadas">
                  {performanceKPIs.engajadas.current.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <div>
                {performanceKPIs.engajadas.deltaAbs !== null ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        performanceKPIs.engajadas.deltaAbs >= 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {performanceKPIs.engajadas.deltaAbs >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      {performanceKPIs.engajadas.deltaAbs >= 0 ? '+' : ''}
                      {performanceKPIs.engajadas.deltaAbs.toLocaleString('pt-BR')}
                      {performanceKPIs.engajadas.deltaPct !== null && (
                        <span className="text-[10px] opacity-80 font-semibold ml-0.5">
                          ({performanceKPIs.engajadas.deltaPct >= 0 ? '+' : ''}
                          {performanceKPIs.engajadas.deltaPct.toFixed(1).replace('.', ',')}%)
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-text-secondary font-medium">vs. anterior</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-secondary font-medium">Sem período anterior</span>
                )}
              </div>

              {renderSparkline(performanceKPIs.engajadas.sparkline, '#10b981')}
            </div>
          </div>

          {/* Card 3: Licenças Desengajadas (Regra de cor invertida: redução = verde/positivo) */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between hover:border-border/80 transition-all" id="card-kpi-licencas-desengajadas">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Licenças Desengajadas
                </span>
                <span className="h-2 w-2 rounded-full bg-rose-500" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight" id="val-kpi-desengajadas">
                  {performanceKPIs.desengajadas.current.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <div>
                {performanceKPIs.desengajadas.deltaAbs !== null ? (
                  <div className="flex items-center gap-1.5">
                    {/* INVERTED COLOR RULE: deltaAbs <= 0 is Positive (Green), deltaAbs > 0 is Negative (Rose) */}
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        performanceKPIs.desengajadas.deltaAbs <= 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {performanceKPIs.desengajadas.deltaAbs <= 0 ? (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      )}
                      {performanceKPIs.desengajadas.deltaAbs > 0 ? '+' : ''}
                      {performanceKPIs.desengajadas.deltaAbs.toLocaleString('pt-BR')}
                      {performanceKPIs.desengajadas.deltaPct !== null && (
                        <span className="text-[10px] opacity-80 font-semibold ml-0.5">
                          ({performanceKPIs.desengajadas.deltaPct > 0 ? '+' : ''}
                          {performanceKPIs.desengajadas.deltaPct.toFixed(1).replace('.', ',')}%)
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-text-secondary font-medium">vs. anterior</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-secondary font-medium">Sem período anterior</span>
                )}
              </div>

              {renderSparkline(performanceKPIs.desengajadas.sparkline, '#ef4444')}
            </div>
          </div>

          {/* Card 4: Taxa de Engajamento */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between hover:border-border/80 transition-all" id="card-kpi-taxa-engajamento">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Taxa de Engajamento
                </span>
                <span className="h-2 w-2 rounded-full bg-amber-500" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight" id="val-kpi-taxa">
                  {performanceKPIs.taxa.current.toFixed(1).replace('.', ',')}%
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
              <div>
                {performanceKPIs.taxa.deltaAbs !== null ? (
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-md ${
                        performanceKPIs.taxa.deltaAbs >= 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {performanceKPIs.taxa.deltaAbs >= 0 ? (
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5" />
                      )}
                      {performanceKPIs.taxa.deltaAbs >= 0 ? '+' : ''}
                      {performanceKPIs.taxa.deltaAbs.toFixed(1).replace('.', ',')} p.p.
                    </span>
                    <span className="text-[11px] text-text-secondary font-medium">vs. anterior</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-text-secondary font-medium">Sem período anterior</span>
                )}
              </div>

              {renderSparkline(performanceKPIs.taxa.sparkline, '#f59e0b')}
            </div>
          </div>
        </div>
      )}

      {/* Fase 2: Charts Section */}
      {!loadingData && !errorMsg && performanceKPIs.hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="section-graficos-performance">
          {/* Chart 1: Evolução da Carteira ao Longo do Tempo (2 Colunas no Desktop) */}
          <div
            className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between"
            id="card-grafico-evolucao-carteira"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-indigo-500" />
                  <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    Evolução da Carteira ao Longo do Tempo
                  </h2>
                </div>
                <p className="text-xs text-text-secondary mt-0.5">
                  Acompanhamento de volumes em mesmo eixo Y (primeiro e último ponto identificados).
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg-secondary/40 border border-border font-medium">
                  Janela: {evolucaoCarteiraChartData.labels.length} períodos
                </span>
              </div>
            </div>

            <div className="relative h-72 w-full pt-2" id="canvas-evolucao-carteira">
              <Line
                data={evolucaoCarteiraChartData}
                options={evolucaoCarteiraOptions}
                plugins={[endPointsLabelsPlugin]}
              />
            </div>
          </div>

          {/* Chart 2: Evolução da Taxa de Engajamento + Estatísticas de Apoio (1 Coluna no Desktop) */}
          <div
            className="lg:col-span-1 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between"
            id="card-grafico-taxa-engajamento"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    Taxa de Engajamento
                  </h2>
                </div>
              </div>
              <p className="text-xs text-text-secondary mb-3">
                Percentual de licenças ativas engajadas no período.
              </p>

              {/* Compact Line Chart */}
              <div className="relative h-44 w-full" id="canvas-taxa-engajamento">
                <Line
                  data={taxaChartData}
                  options={taxaChartOptions}
                  plugins={[endPointsLabelsPlugin]}
                />
              </div>
            </div>

            {/* 4 Supporting Statistics Cards */}
            <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 gap-3" id="stats-taxa-engajamento">
              {/* Stat 1: Taxa Atual */}
              <div className="bg-bg-secondary/30 p-2.5 rounded-lg border border-border/60" id="stat-taxa-atual">
                <span className="text-[11px] font-semibold text-text-secondary block">Taxa Atual</span>
                <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 block">
                  {taxaStats.atual.toFixed(1).replace('.', ',')}%
                </span>
              </div>

              {/* Stat 2: Média do Período */}
              <div className="bg-bg-secondary/30 p-2.5 rounded-lg border border-border/60" id="stat-taxa-media">
                <span className="text-[11px] font-semibold text-text-secondary block">Média do Período</span>
                <span className="text-base font-extrabold text-text-primary mt-0.5 block">
                  {taxaStats.media.toFixed(1).replace('.', ',')}%
                </span>
              </div>

              {/* Stat 3: Melhor Taxa */}
              <div className="bg-bg-secondary/30 p-2.5 rounded-lg border border-border/60" id="stat-taxa-melhor">
                <span className="text-[11px] font-semibold text-text-secondary block">Melhor Taxa</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                    {taxaStats.melhor.taxa.toFixed(1).replace('.', ',')}%
                  </span>
                  <span className="text-[10px] text-text-secondary truncate">
                    ({formatPeriodLabel(taxaStats.melhor.periodKey, granularity)})
                  </span>
                </div>
              </div>

              {/* Stat 4: Menor Taxa */}
              <div className="bg-bg-secondary/30 p-2.5 rounded-lg border border-border/60" id="stat-taxa-menor">
                <span className="text-[11px] font-semibold text-text-secondary block">Menor Taxa</span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="text-base font-extrabold text-rose-600 dark:text-rose-400">
                    {taxaStats.menor.taxa.toFixed(1).replace('.', ',')}%
                  </span>
                  <span className="text-[10px] text-text-secondary truncate">
                    ({formatPeriodLabel(taxaStats.menor.periodKey, granularity)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fase 3: Donut Distribution & Dynamic Insights (2 Columns) */}
      {!loadingData && !errorMsg && performanceKPIs.hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="section-donut-e-insights">
          {/* Card Donut: Distribuição da Carteira (Período Mais Recente) */}
          <div
            className="lg:col-span-1 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between"
            id="card-donut-distribuicao"
          >
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PieChart className="h-4 w-4 text-emerald-500" />
                <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                  Distribuição da Carteira
                </h2>
              </div>
              <p className="text-xs text-text-secondary mb-4">
                Composição de licenças no período mais recente ({formatPeriodLabel(donutData.chartData ? ((performanceKPIs as any).periodsData?.slice(-1)[0]?.periodKey || '') : '', granularity)}).
              </p>

              {/* Donut Chart with Centered Metric */}
              <div className="relative h-52 w-full flex items-center justify-center my-2" id="canvas-donut-distribuicao">
                <Doughnut data={donutData.chartData} options={donutOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    Total
                  </span>
                  <span className="text-2xl font-extrabold text-text-primary tracking-tight" id="donut-total-centro">
                    {donutData.total.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-[11px] text-text-secondary font-medium">licenças</span>
                </div>
              </div>
            </div>

            {/* Legend & Percentages */}
            <div className="mt-4 pt-4 border-t border-border/50 space-y-2.5" id="donut-legenda">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-semibold text-text-primary">Engajadas</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold text-text-primary">
                    {donutData.engajadas.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    ({donutData.pctEngajadas.toFixed(1).replace('.', ',')}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-orange-500 shrink-0" />
                  <span className="font-semibold text-text-primary">Desengajadas</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-extrabold text-text-primary">
                    {donutData.desengajadas.toLocaleString('pt-BR')}
                  </span>
                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                    ({donutData.pctDesengajadas.toFixed(1).replace('.', ',')}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card Insights: Insights Automáticos do Período */}
          <div
            className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between"
            id="card-insights-automaticos"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    Insights do Período
                  </h2>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50">
                  {dynamicInsights.length} {dynamicInsights.length === 1 ? 'destaque' : 'destaques'}
                </span>
              </div>
              <p className="text-xs text-text-secondary mb-5">
                Destaques calculados dinamicamente com base na evolução recente da carteira.
              </p>

              <div className="space-y-3.5" id="lista-insights">
                {dynamicInsights.length > 0 ? (
                  dynamicInsights.map((insight) => (
                    <div
                      key={insight.id}
                      className="p-3.5 rounded-xl border border-border bg-bg-secondary/20 flex items-start gap-3 transition-colors hover:bg-bg-secondary/40"
                      id={`item-${insight.id}`}
                    >
                      <div
                        className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                          insight.type === 'positive'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40'
                            : insight.type === 'negative'
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40'
                            : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40'
                        }`}
                      >
                        {insight.direction === 'up' ? (
                          <ArrowUp className="h-4 w-4" />
                        ) : insight.direction === 'down' ? (
                          <ArrowDown className="h-4 w-4" />
                        ) : (
                          <Activity className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs sm:text-sm font-medium text-text-primary leading-relaxed">
                          {insight.text}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-text-secondary italic py-4">
                    Insira mais períodos para gerar insights comparativos automáticos.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-text-secondary">
              <span>Atualizado a cada importação</span>
              <span className="font-semibold text-text-primary">Granularidade: {granularity}</span>
            </div>
          </div>
        </div>
      )}

      {/* Fase 3: Detalhamento por Período (Tabela Paginada) */}
      {!loadingData && !errorMsg && performanceKPIs.hasData && (
        <div
          className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4"
          id="card-tabela-detalhamento"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                Detalhamento por Período
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Histórico completo com volumes agregados e variação da taxa de engajamento (ordenado do mais recente para o mais antigo).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">
                Total de {tableDataWithDeltas.length} períodos registrados
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs" id="tabela-detalhamento-periodos">
              <thead className="bg-bg-secondary/40 text-text-secondary uppercase tracking-wider font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Licenças Totais</th>
                  <th className="px-4 py-3 text-right">Engajadas</th>
                  <th className="px-4 py-3 text-right">Desengajadas</th>
                  <th className="px-4 py-3 text-right">Taxa de Engajamento</th>
                  <th className="px-4 py-3 text-right">Variação (p.p.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedTableRows.map((row: any, index: number) => (
                  <tr
                    key={row.periodKey}
                    className="hover:bg-bg-secondary/20 transition-colors"
                    id={`linha-tabela-${row.periodKey}`}
                  >
                    <td className="px-4 py-3 font-semibold text-text-primary whitespace-nowrap">
                      {formatPeriodLabel(row.periodKey, granularity)}
                      <span className="text-[10px] text-text-secondary font-normal ml-1.5">
                        ({row.periodKey})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-text-primary">
                      {row.licencasTotais.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                      {row.licencasEngajadas.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-orange-600 dark:text-orange-400">
                      {row.licencasDesengajadas.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-text-primary">
                      {row.taxaEngajamento.toFixed(1).replace('.', ',')}%
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-bold">
                      {row.deltaTaxa !== null ? (
                        <span
                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md ${
                            row.deltaTaxa > 0
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'
                              : row.deltaTaxa < 0
                              ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400'
                              : 'bg-bg-secondary/40 text-text-secondary'
                          }`}
                        >
                          {row.deltaTaxa > 0 ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : row.deltaTaxa < 0 ? (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                          {row.deltaTaxa > 0 ? '+' : ''}
                          {row.deltaTaxa.toFixed(1).replace('.', ',')} p.p.
                        </span>
                      ) : (
                        <span className="text-text-secondary font-medium">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalTablePages > 1 && (
            <div
              className="flex items-center justify-between pt-3 border-t border-border/50 text-xs"
              id="paginacao-tabela"
            >
              <span className="text-text-secondary">
                Página <strong className="text-text-primary">{tableCurrentPage}</strong> de{' '}
                <strong className="text-text-primary">{totalTablePages}</strong>
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTableCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={tableCurrentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card text-text-primary hover:bg-bg-secondary/40 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  id="btn-pagina-anterior"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setTableCurrentPage((p) => Math.min(totalTablePages, p + 1))}
                  disabled={tableCurrentPage === totalTablePages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card text-text-primary hover:bg-bg-secondary/40 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                  id="btn-proxima-pagina"
                >
                  Próxima <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
