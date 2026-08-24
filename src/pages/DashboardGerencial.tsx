import React, { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { 
  BarChart3, 
  Users, 
  Target, 
  Calendar, 
  Activity,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Award,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  ClipboardList
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement,
} from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  PointElement,
  LineElement,
  ArcElement
);

const customDatalabelsPlugin = {
  id: 'customDatalabels',
  afterDatasetsDraw(chart: any) {
    const { ctx } = chart;
    ctx.save();
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#64748b'; // slate-500
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const isStacked = chart.options?.scales?.x?.stacked || chart.options?.scales?.y?.stacked;

    if (isStacked) {
      const activeMeta = chart.data.datasets
        .map((_: any, i: number) => chart.getDatasetMeta(i))
        .filter((meta: any) => !meta.hidden && meta.type === 'bar');

      if (activeMeta.length === 0) {
        ctx.restore();
        return;
      }

      const numDataPoints = chart.data.labels?.length || 0;

      for (let i = 0; i < numDataPoints; i++) {
        let sum = 0;
        let topY = Infinity;
        let targetX = 0;
        let hasValue = false;

        activeMeta.forEach((meta: any) => {
          const element = meta.data[i];
          const val = chart.data.datasets[meta.index].data[i];
          if (element && typeof val === 'number') {
            sum += val;
            hasValue = true;
            if (element.y < topY) {
              topY = element.y;
              targetX = element.x;
            }
          }
        });

        if (hasValue && sum > 0) {
          const displaySum = Math.round(sum * 10) / 10;
          ctx.fillText(displaySum.toString(), targetX, topY - 2);
        }
      }
    } else {
      chart.data.datasets.forEach((dataset: any, dsIndex: number) => {
        const meta = chart.getDatasetMeta(dsIndex);
        if (meta.hidden || meta.type !== 'bar') return;

        meta.data.forEach((element: any, i: number) => {
          const val = dataset.data[i];
          if (typeof val === 'number' && val > 0) {
            const displayVal = Math.round(val * 10) / 10;
            ctx.fillText(displayVal.toString(), element.x, element.y - 2);
          }
        });
      });
    }
    ctx.restore();
  }
};

export const DashboardGerencial: React.FC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);

  const [managers, setManagers] = useState<Array<{ id: string; nome: string }>>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>(() => {
    const saved = localStorage.getItem('dashboard_gerencial_gerentes');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedManagers);
  const [projectedExpanded, setProjectedExpanded] = useState(false);
  const [realizedExpanded, setRealizedExpanded] = useState(false);

  useEffect(() => {
    if (dropdownOpen) {
      setTempSelected(selectedManagers);
    }
  }, [dropdownOpen, selectedManagers]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#manager-filter-dropdown')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const [tasksData, setTasksData] = useState<any[]>([]);
  const [plansData, setPlansData] = useState<any[]>([]);
  const [partnersData, setPartnersData] = useState<any[]>([]);
  const [accessLogs, setAccessLogs] = useState<any[]>([]);
  const [accountPlanningData, setAccountPlanningData] = useState<any[]>([]);
  
  const [tableFilter, setTableFilter] = useState<'all' | 'with_context' | 'without_context'>('all');

  useEffect(() => {
    if (!isAdmin) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const startOf14Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);

        // Fetch managers list using RPC
        const { data: fetchUsers, error: usersErr } = await supabase
          .rpc('get_all_users_for_admin');

        if (usersErr) throw usersErr;
        if (fetchUsers) {
          const filteredGerentes = fetchUsers
            .filter((u: any) => u.role === 'gerente')
            .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
          setManagers(filteredGerentes);
        }

        // Fetch paginated partners
        const fetchAllPartners = async () => {
          let allPartners: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('partners')
              .select('id, gerente, gerente_id, segmento, contas_potencial, fila')
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

        // Fetch paginated plans
        const fetchAllPlans = async () => {
          let allPlans: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('plans')
              .select('id, created_at, contexto, ativo, partner_id, partners(accountancy_id, nome, gerente, gerente_id, segmento, contas_potencial)')
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

        // Fetch paginated tasks
        const fetchAllTasks = async () => {
          let allTasks: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('tasks')
              .select('id, status, created_at, data_conclusao_prevista, data_conclusao_original, deletada_em, plan_id, plans(partner_id, partners(gerente, gerente_id, segmento))')
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              allTasks = [...allTasks, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allTasks;
        };

        // Fetch paginated logs
        const fetchAllLogs = async () => {
          let allLogs: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('access_logs')
              .select('user_id, accessed_at')
              .gte('accessed_at', startOf14Days.toISOString())
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              allLogs = [...allLogs, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allLogs;
        };

        // Fetch paginated account_planning
        const fetchAllAccountPlannings = async () => {
          let allPlannings: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('account_planning')
              .select('semana, tipo_plano, meta, resultado, status, gerente_id')
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              allPlannings = [...allPlannings, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allPlannings;
        };

        const [tasks, plans, partners, logs, plannings] = await Promise.all([
          fetchAllTasks(),
          fetchAllPlans(),
          fetchAllPartners(),
          fetchAllLogs(),
          fetchAllAccountPlannings()
        ]);

        setTasksData(tasks);
        setPlansData(plans);
        setPartnersData(partners);
        setAccessLogs(logs);
        setAccountPlanningData(plannings);

      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAdmin]);

  // Protected route logic
  if (authLoading) return null;
  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // --- Filtered Datasets Layer (useMemo) ---
  const filteredPartners = useMemo(() => {
    if (selectedManagers.length === 0) return partnersData;
    return partnersData.filter(p => {
      return (p.gerente_id && selectedManagers.includes(p.gerente_id)) || (p.gerente && selectedManagers.some(id => {
        const mgr = managers.find(m => m.id === id);
        return mgr && mgr.nome === p.gerente;
      }));
    });
  }, [partnersData, selectedManagers, managers]);

  const filteredPlans = useMemo(() => {
    if (selectedManagers.length === 0) return plansData;
    return plansData.filter(p => {
      const partner = p.partners;
      if (!partner) return false;
      return (partner.gerente_id && selectedManagers.includes(partner.gerente_id)) || (partner.gerente && selectedManagers.some(id => {
        const mgr = managers.find(m => m.id === id);
        return mgr && mgr.nome === partner.gerente;
      }));
    });
  }, [plansData, selectedManagers, managers]);

  const filteredTasks = useMemo(() => {
    const nonDeleted = tasksData.filter(t => !t.deletada_em);
    if (selectedManagers.length === 0) return nonDeleted;
    return nonDeleted.filter(t => {
      const partner = t.plans?.partners;
      if (!partner) return false;
      return (partner.gerente_id && selectedManagers.includes(partner.gerente_id)) || (partner.gerente && selectedManagers.some(id => {
        const mgr = managers.find(m => m.id === id);
        return mgr && mgr.nome === partner.gerente;
      }));
    });
  }, [tasksData, selectedManagers, managers]);

  const filteredLogs = useMemo(() => {
    if (selectedManagers.length === 0) return accessLogs;
    return accessLogs.filter(l => {
      return l.user_id && selectedManagers.includes(l.user_id);
    });
  }, [accessLogs, selectedManagers]);

  const filteredAccountPlanning = useMemo(() => {
    if (selectedManagers.length === 0) return accountPlanningData;
    return accountPlanningData.filter(item => {
      return item.gerente_id && selectedManagers.includes(item.gerente_id);
    });
  }, [accountPlanningData, selectedManagers]);

  // Generates the weeks array dynamically based on DB values + next 4 weeks futures
  const weeksInfo = useMemo(() => {
    // Unique weeks from raw accountPlanningData
    const databaseWeeks = [...new Set(accountPlanningData.map(item => item.semana).filter(Boolean) as string[])];

    // Add future weeks: next 4 Mondays from today
    const hoje = new Date();
    const diasParaSegunda = (1 - hoje.getDay() + 7) % 7;
    let proximaSegunda = new Date(hoje);
    proximaSegunda.setDate(hoje.getDate() + (diasParaSegunda === 0 ? 7 : diasParaSegunda));

    for (let i = 0; i < 4; i++) {
      const dateStr = proximaSegunda.toISOString().split('T')[0];
      if (!databaseWeeks.includes(dateStr)) {
        databaseWeeks.push(dateStr);
      }
      proximaSegunda.setDate(proximaSegunda.getDate() + 7);
    }

    // Sort all weeks cronologically
    databaseWeeks.sort();

    const getSegundaFeiraAtual = () => {
      const hoje = new Date();
      const diaSemana = hoje.getDay(); // 0 = domingo, 1 = segunda, ...
      const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
      const segunda = new Date(hoje);
      segunda.setDate(hoje.getDate() - diasDesdeSegunda);
      
      const year = segunda.getFullYear();
      const month = String(segunda.getMonth() + 1).padStart(2, '0');
      const dayVal = String(segunda.getDate()).padStart(2, '0');
      return `${year}-${month}-${dayVal}`;
    };
    const currentMondayStr = getSegundaFeiraAtual();

    return databaseWeeks.map(semana => {
      const parts = semana.split('-');
      const label = parts.length >= 3 ? `${parts[2]}/${parts[1]}` : semana;
      const isCurrent = semana === currentMondayStr;

      return {
        dbKey: semana,
        label,
        isCurrent
      };
    });
  }, [accountPlanningData]);

  // Compute forecast metrics for each week
  const forecastMetrics = useMemo(() => {
    const safeNum = (val: any) => {
      if (val === null || val === undefined) return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    return weeksInfo.map(week => {
      // Filter items matching this week key ("YYYY-MM-DD")
      const weekItems = filteredAccountPlanning.filter(item => item.semana === week.dbKey);

      // Previsto
      const previstoTotal = weekItems.reduce((sum, item) => sum + safeNum(item.meta), 0);
      const previstoEngajar = weekItems
        .filter(item => item.tipo_plano?.trim().toLowerCase() === 'engajar')
        .reduce((sum, item) => sum + safeNum(item.meta), 0);
      const previstoSubstituir = weekItems
        .filter(item => item.tipo_plano?.trim().toLowerCase() === 'substituir')
        .reduce((sum, item) => sum + safeNum(item.meta), 0);
      const previstoVender = weekItems
        .filter(item => item.tipo_plano?.trim().toLowerCase() === 'vender')
        .reduce((sum, item) => sum + safeNum(item.meta), 0);

      // Realizado (status === 'Feito')
      const realizadoTotal = weekItems
        .filter(item => item.status?.trim().toLowerCase() === 'feito')
        .reduce((sum, item) => sum + safeNum(item.resultado), 0);
      const realizadoEngajar = weekItems
        .filter(item => item.status?.trim().toLowerCase() === 'feito' && item.tipo_plano?.trim().toLowerCase() === 'engajar')
        .reduce((sum, item) => sum + safeNum(item.resultado), 0);
      const realizadoSubstituir = weekItems
        .filter(item => item.status?.trim().toLowerCase() === 'feito' && item.tipo_plano?.trim().toLowerCase() === 'substituir')
        .reduce((sum, item) => sum + safeNum(item.resultado), 0);
      const realizadoVender = weekItems
        .filter(item => item.status?.trim().toLowerCase() === 'feito' && item.tipo_plano?.trim().toLowerCase() === 'vender')
        .reduce((sum, item) => sum + safeNum(item.resultado), 0);

      // Aberto (status !== 'Feito' && status !== 'Cancelado')
      const abertoTotal = weekItems
        .filter(item => {
          const st = item.status?.trim().toLowerCase();
          return st !== 'feito' && st !== 'cancelado';
        })
        .reduce((sum, item) => sum + safeNum(item.meta), 0);

      // Forecast %
      const forecastPercent = previstoTotal > 0 ? (realizadoTotal / previstoTotal) * 100 : 0;

      return {
        ...week,
        previstoTotal,
        previstoEngajar,
        previstoSubstituir,
        previstoVender,
        realizadoTotal,
        realizadoEngajar,
        realizadoSubstituir,
        realizadoVender,
        abertoTotal,
        forecastPercent,
        hasPrevisto: previstoTotal > 0
      };
    });
  }, [weeksInfo, filteredAccountPlanning]);

  // --- Dynamic Dashboard-Wide Metrics Calculations ---
  const stats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const totalPartners = filteredPartners.length;
    const activePlans = filteredPlans.filter(p => p.ativo).length;

    // Retenção sem plano ativo
    const activePartnerIds = filteredPlans.filter(p => p.ativo).map(p => p.partner_id);
    const retencaoNoPlan = filteredPartners.filter(p => p.fila === 'RETENÇÃO' && !activePartnerIds.includes(p.id)).length;

    const tasksThisWeek = filteredTasks.filter(t => t.created_at && t.created_at >= startOfWeek).length;

    const todayLogs = filteredLogs.filter(l => l.accessed_at && l.accessed_at >= startOfDay);
    const activeManagersToday = new Set(todayLogs.map(l => l.user_id)).size;

    return {
      totalPartners,
      activePlans,
      retencaoNoPlan,
      tasksThisWeek,
      activeManagersToday
    };
  }, [filteredPartners, filteredPlans, filteredTasks, filteredLogs]);

  // --- Chart Calculations ---

  // Chart 1: Tasks per status and gerente (sorted by total tasks descending)
  const chart1Data = useMemo(() => {
    const managersListFromData = [...new Set(filteredTasks.map(t => t.plans?.partners?.gerente).filter(Boolean))];
    
    // Sort managers by total tasks descending
    const sortedManagers = managersListFromData
      .map(m => {
        const total = filteredTasks.filter(t => t.plans?.partners?.gerente === m).length;
        return { manager: m, total };
      })
      .sort((a, b) => b.total - a.total)
      .map(item => item.manager);

    const statuses = ['backlog', 'agenda', 'em_andamento', 'concluida'];
    
    return {
      labels: sortedManagers,
      datasets: statuses.map((status, idx) => ({
        label: status.replace('_', ' ').toUpperCase(),
        data: sortedManagers.map(m => filteredTasks.filter(t => t.status === status && t.plans?.partners?.gerente === m).length),
        backgroundColor: [
          '#94a3b8', // backlog
          '#6366f1', // agenda
          '#f59e0b', // em_andamento
          '#10b981'  // concluida
        ][idx]
      }))
    };
  }, [filteredTasks]);

  // Chart 2: Mean progress per gerente (sorted by highest progress to lowest)
  const chart2Data = useMemo(() => {
    const managersListFromData = [...new Set(filteredTasks.map(t => t.plans?.partners?.gerente).filter(Boolean))];
    const progressPerManager = managersListFromData.map(m => {
      const managerTasks = filteredTasks.filter(t => t.plans?.partners?.gerente === m);
      if (managerTasks.length === 0) return { manager: m, progress: 0 };
      const completed = managerTasks.filter(t => t.status === 'concluida').length;
      return { manager: m, progress: (completed / managerTasks.length) * 100 };
    });

    // Sort from highest progress to lowest
    progressPerManager.sort((a, b) => b.progress - a.progress);

    return {
      labels: progressPerManager.map(p => p.manager),
      datasets: [{
        label: 'Progresso Médio (%)',
        data: progressPerManager.map(p => p.progress),
        backgroundColor: '#3b82f6'
      }]
    };
  }, [filteredTasks]);

  // Chart 3: New plans per day (last 30 days grouped by manager)
  const chart3Data = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const managersListFromData = [...new Set(filteredPlans.map(p => p.partners?.gerente).filter(Boolean))];
    const managerColors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#06b6d4'];

    return {
      labels: last30Days.map(date => {
        const [year, month, day] = date.split('-');
        return `${day}/${month}`;
      }),
      datasets: managersListFromData.map((m, idx) => ({
        label: m,
        data: last30Days.map(date => filteredPlans.filter(p => p.created_at.startsWith(date) && p.partners?.gerente === m).length),
        backgroundColor: managerColors[idx % managerColors.length]
      }))
    };
  }, [filteredPlans]);

  // Chart 4: Plan ranking per gerente
  const chart4Data = useMemo(() => {
    const managerCounts = filteredPlans.reduce((acc: any, p) => {
      const m = p.partners?.gerente;
      if (m) acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {});

    const sorted = Object.entries(managerCounts).sort((a: any, b: any) => b[1] - a[1]);

    return {
      labels: sorted.map(s => s[0]),
      datasets: [{
        label: 'Total de Planos Histórico',
        data: sorted.map(s => s[1]),
        backgroundColor: '#6366f1'
      }]
    };
  }, [filteredPlans]);

  // Chart 5: Plans per day with/without contexto (percentage, stacked)
  const chart5Data = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return {
      labels: last7Days.map(date => {
        const [year, month, day] = date.split('-');
        return `${day}/${month}`;
      }),
      datasets: [
        {
          label: 'Com Contexto (%)',
          data: last7Days.map(date => {
            const dayPlans = filteredPlans.filter(p => p.created_at.startsWith(date));
            if (dayPlans.length === 0) return 0;
            const withContext = dayPlans.filter(p => p.contexto).length;
            return (withContext / dayPlans.length) * 100;
          }),
          backgroundColor: '#10b981'
        },
        {
          label: 'Sem Contexto (%)',
          data: last7Days.map(date => {
            const dayPlans = filteredPlans.filter(p => p.created_at.startsWith(date));
            if (dayPlans.length === 0) return 0;
            const withoutContext = dayPlans.filter(p => !p.contexto).length;
            return (withoutContext / dayPlans.length) * 100;
          }),
          backgroundColor: '#ef4444'
        }
      ]
    };
  }, [filteredPlans]);

  // Chart 6: Plans per gerente with/without contexto (sorted by manager total plans descending)
  const chart6Data = useMemo(() => {
    const managersListFromData = [...new Set(filteredPlans.map(p => p.partners?.gerente).filter(Boolean))];

    // Sort managers by total plans descending
    const sortedManagers = managersListFromData
      .map(m => {
        const total = filteredPlans.filter(p => p.partners?.gerente === m).length;
        return { manager: m, total };
      })
      .sort((a, b) => b.total - a.total)
      .map(item => item.manager);

    return {
      labels: sortedManagers,
      datasets: [
        {
          label: 'Com Contexto',
          data: sortedManagers.map(m => filteredPlans.filter(p => p.partners?.gerente === m && p.contexto).length),
          backgroundColor: '#10b981'
        },
        {
          label: 'Sem Contexto',
          data: sortedManagers.map(m => filteredPlans.filter(p => p.partners?.gerente === m && !p.contexto).length),
          backgroundColor: '#ef4444'
        }
      ]
    };
  }, [filteredPlans]);

  // Chart 7: Carteira per gerente and plano (grouped by managers, segmenting/stacked by plan types)
  const chart7Data = useMemo(() => {
    const managersListFromData = [...new Set(filteredPlans.map(p => p.partners?.gerente).filter(Boolean))];
    const planTypes = ['R1', 'E1', 'R2', 'E2'];
    const planColors: Record<string, string> = {
      'R1': '#6366f1', // Indigo
      'E1': '#10b981', // Emerald
      'R2': '#f59e0b', // Amber
      'E2': '#ef4444'  // Red
    };

    // Sort managers by total plans descending
    const sortedManagers = managersListFromData
      .map(m => {
        const total = filteredPlans.filter(p => p.partners?.gerente === m).length;
        return { manager: m, total };
      })
      .sort((a, b) => b.total - a.total)
      .map(item => item.manager);

    return {
      labels: sortedManagers,
      datasets: planTypes.map(type => ({
        label: type,
        data: sortedManagers.map(m => filteredPlans.filter(p => p.partners?.gerente === m && p.partners?.segmento === type).length),
        backgroundColor: planColors[type] || '#94a3b8'
      }))
    };
  }, [filteredPlans]);

  // Chart 30 Days (Atrasadas, Abertas e Concluídas) - replicated from individual dashboard
  const chart30DaysData = useMemo(() => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 29 + i);
      return d.toISOString().split('T')[0];
    });

    const hoje = new Date().toISOString().split('T')[0];

    const tasksPerDay = dates.map(date => {
      const dayTasks = filteredTasks.filter(t => {
        const dataReferencia = t.data_conclusao_original ?? t.created_at?.split('T')[0];
        return dataReferencia === date;
      });

      const atrasadas = dayTasks.filter(t => t.status !== 'concluida' && (t.data_conclusao_original ?? t.created_at?.split('T')[0]) < hoje).length;
      const abertas = dayTasks.filter(t => t.status !== 'concluida' && (t.data_conclusao_original ?? t.created_at?.split('T')[0]) >= hoje).length;
      const concluidas = dayTasks.filter(t => t.status === 'concluida').length;

      return { atrasadas, abertas, concluidas };
    });

    return {
      labels: dates.map(date => {
        const [_, month, day] = date.split('-');
        return `${day}/${month}`;
      }),
      datasets: [
        {
          label: 'Atrasadas',
          data: tasksPerDay.map(d => d.atrasadas),
          backgroundColor: '#E24B4A',
          borderRadius: 4,
        },
        {
          label: 'Abertas',
          data: tasksPerDay.map(d => d.abertas),
          backgroundColor: '#378ADD',
          borderRadius: 4,
        },
        {
          label: 'Concluídas',
          data: tasksPerDay.map(d => d.concluidas),
          backgroundColor: '#1D9E75',
          borderRadius: 4,
        }
      ]
    };
  }, [filteredTasks]);

  const chart30DaysOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          font: { size: 11 }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false }
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { stepSize: 1 }
      }
    }
  };

  const chart30DaysPlugins = [
    {
      id: 'barLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        const datasets = chart.data.datasets;
        if (datasets.length === 0) return;

        const dataLength = datasets[0].data.length;
        const meta0 = chart.getDatasetMeta(0);

        for (let i = 0; i < dataLength; i++) {
          let total = 0;
          datasets.forEach((dataset: any) => {
            total += (dataset.data[i] || 0);
          });

          if (total > 0 && meta0.data[i]) {
            const x = meta0.data[i].x;
            const y = scales.y.getPixelForValue(total);
            ctx.fillText(total, x, y - 4);
          }
        }
        ctx.restore();
      }
    }
  ];

  // --- Chart: Tasks Concluídas por Tipo de Plano (Últimos 30 Dias) ---
  const chartTasksConcluidas30DaysData = useMemo(() => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 29 + i);
      return d.toISOString().split('T')[0];
    });

    const concluidasTasks = filteredTasks.filter(t => t.status === 'concluida');

    const planTypes: string[] = Array.from(new Set(
      filteredTasks
        .map(t => t.plans?.partners?.segmento as string)
        .filter(Boolean)
    )).sort() as string[];

    const planColors: Record<string, string> = {
      'R1': '#6366f1',
      'E1': '#10b981',
      'R2': '#f59e0b',
      'E2': '#ef4444'
    };
    const colorPalette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#06b6d4'];

    const datasets = planTypes.map((type, idx) => {
      const data = dates.map(date => {
        return concluidasTasks.filter(t => {
          const dataReferencia = t.data_conclusao_original ?? t.created_at?.split('T')[0];
          return dataReferencia === date && t.plans?.partners?.segmento === type;
        }).length;
      });

      return {
        label: type,
        data,
        backgroundColor: planColors[type] || colorPalette[idx % colorPalette.length],
        borderRadius: 4,
      };
    });

    return {
      labels: dates.map(date => {
        const [_, month, day] = date.split('-');
        return `${day}/${month}`;
      }),
      datasets
    };
  }, [filteredTasks]);

  const chartTasksConcluidas30DaysOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: any) => items[0]?.label,
          label: () => '',
          labelColor: () => ({
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            borderWidth: 0,
            borderRadius: 0
          }),
          afterBody: (items: any) => {
            const dataIndex = items[0]?.dataIndex;
            if (dataIndex === undefined) return [];

            const ranking = chartTasksConcluidas30DaysData.datasets
              .map(dataset => ({
                planType: dataset.label,
                count: dataset.data[dataIndex] || 0
              }))
              .filter(item => item.count !== undefined && item.count > 0)
              .sort((a, b) => b.count - a.count);

            return ranking.map(r => `${r.planType}: ${r.count} task${r.count > 1 ? 's' : ''} concluída${r.count > 1 ? 's' : ''}`);
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false }
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { stepSize: 1 }
      }
    }
  };

  // --- Chart: Tasks Concluídas por Gerente e Plano (Últimos 30 Dias) ---
  const chartTasksConcluidasPorGerentePlanoData = useMemo(() => {
    const dates = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - 29 + i);
      return d.toISOString().split('T')[0];
    });
    const datesSet = new Set(dates);

    const completedLast30Days = filteredTasks.filter(t => {
      if (t.status !== 'concluida' || t.deletada_em) return false;
      const refDate = t.data_conclusao_original ?? t.created_at?.split('T')[0];
      return refDate && datesSet.has(refDate);
    });

    const planTypes: string[] = Array.from(new Set(
      completedLast30Days
        .map(t => t.plans?.partners?.segmento as string)
        .filter(Boolean)
    )).sort() as string[];

    const managersWithCompletedTasks = Array.from(new Set(
      completedLast30Days
        .map(t => t.plans?.partners?.gerente as string)
        .filter(Boolean)
    ));

    const managerTotals = managersWithCompletedTasks.map(m => {
      const count = completedLast30Days.filter(t => t.plans?.partners?.gerente === m).length;
      return { manager: m, total: count };
    });

    managerTotals.sort((a, b) => b.total - a.total);
    const sortedManagers = managerTotals.map(item => item.manager);

    const planColors: Record<string, string> = {
      'R1': '#6366f1',
      'E1': '#10b981',
      'R2': '#f59e0b',
      'E2': '#ef4444'
    };
    const colorPalette = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#06b6d4'];

    const datasets = planTypes.map((type, idx) => {
      const data = sortedManagers.map(m => {
        return completedLast30Days.filter(t => t.plans?.partners?.gerente === m && t.plans?.partners?.segmento === type).length;
      });

      return {
        label: type,
        data,
        backgroundColor: planColors[type] || colorPalette[idx % colorPalette.length],
        borderRadius: 4,
      };
    });

    return {
      labels: sortedManagers,
      datasets
    };
  }, [filteredTasks]);

  const chartTasksConcluidasPorGerentePlanoOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: any) => items[0]?.label,
          label: () => '',
          labelColor: () => ({
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            borderWidth: 0,
            borderRadius: 0
          }),
          afterBody: (items: any) => {
            const dataIndex = items[0]?.dataIndex;
            if (dataIndex === undefined) return [];

            const list = chartTasksConcluidasPorGerentePlanoData.datasets
              .map(dataset => ({
                planType: dataset.label,
                count: dataset.data[dataIndex] || 0
              }))
              .filter(item => item.count > 0);

            const totalForManager = list.reduce((sum, item) => sum + item.count, 0);
            if (totalForManager === 0) return [];

            const sortedList = list
              .map(item => ({
                ...item,
                percentage: Math.round((item.count / totalForManager) * 100)
              }))
              .sort((a, b) => b.count - a.count);

            return sortedList.map(item => `${item.planType}: ${item.count} (${item.percentage}%)`);
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false }
      },
      y: {
        stacked: true,
        grid: { display: false },
        ticks: { stepSize: 1 }
      }
    }
  };

  // Heatmap helper (last 14 days)
  const heatmapData = useMemo(() => {
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const getNome = (userId: string) => managers.find(m => m.id === userId)?.nome ?? null;
    const managersListFromLogs = [...new Set(filteredLogs.map(l => getNome(l.user_id)).filter(Boolean))];

    return {
      days: last14Days,
      managers: managersListFromLogs,
      matrix: last14Days.map(date => 
        managersListFromLogs.map(m => filteredLogs.filter(l => l.accessed_at.startsWith(date) && getNome(l.user_id) === m).length)
      )
    };
  }, [filteredLogs, managers]);

  // Table filtering
  const tableActivePlansFiltered = useMemo(() => {
    let list = filteredPlans.filter(p => p.ativo);
    if (tableFilter === 'with_context') list = list.filter(p => p.contexto);
    if (tableFilter === 'without_context') list = list.filter(p => !p.contexto);
    return list;
  }, [filteredPlans, tableFilter]);

  // Table: Ranking de planos por tipo de plano (só com planos ativos já criados)
  const planTypeRanking = useMemo(() => {
    const activePlans = filteredPlans.filter(p => p.ativo);
    const planTypesWithActivePlans = [...new Set(activePlans.map(p => p.partners?.segmento).filter(Boolean))];

    const ranking = planTypesWithActivePlans.map(type => {
      const partnersOfType = filteredPartners.filter(p => p.segmento === type);
      const totalPartners = partnersOfType.length;
      const plansOfType = filteredPlans.filter(p => p.partners?.segmento === type);
      const createdPlans = plansOfType.length;
      const sumPotential = partnersOfType.reduce((acc, p) => acc + (p.contas_potencial || 0), 0);

      // Calcular o potencial das contas dos parceiros que já tem planos criados (deduplicados por parceiro)
      const coveredPartnersMap = new Map<string, number>();
      plansOfType.forEach(p => {
        if (p.partner_id) {
          coveredPartnersMap.set(p.partner_id, p.partners?.contas_potencial || 0);
        }
      });
      const coveredPotential = Array.from(coveredPartnersMap.values()).reduce((sum, val) => sum + val, 0);

      return {
        type,
        totalPartners,
        createdPlans,
        sumPotential,
        coveredPotential
      };
    });

    return ranking.sort((a, b) => b.createdPlans - a.createdPlans);
  }, [filteredPlans, filteredPartners]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard Gerencial</h1>
          <p className="text-text-secondary">Visão consolidada de performance e engajamento</p>
        </div>

        {/* Manager Filter Dropdown */}
        <div className="relative inline-block" id="manager-filter-dropdown">
          <button
            type="button"
            onClick={() => setDropdownOpen(prev => !prev)}
            className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-gray-50 dark:hover:bg-background/25 border border-border rounded-lg text-sm font-medium text-text-primary shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <Filter size={16} className="text-text-secondary" />
            <span>
              {selectedManagers.length === 0
                ? 'Todos os gerentes'
                : selectedManagers.length === 1
                  ? (managers.find(m => m.id === selectedManagers[0])?.nome || '1 gerente')
                  : `${selectedManagers.length} gerentes`}
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-surface rounded-xl border border-border shadow-lg z-50 overflow-hidden divide-y divide-border">
              <div className="p-2">
                <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-background/25 rounded-lg cursor-pointer text-sm font-medium text-text-primary select-none w-full">
                  <input
                    type="checkbox"
                    checked={tempSelected.length === 0}
                    onChange={() => setTempSelected([])}
                    className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                  />
                  <span>Todos os gerentes</span>
                </label>
              </div>
              <div className="p-2 max-h-60 overflow-y-auto">
                {managers.map(mgr => {
                  const isChecked = tempSelected.includes(mgr.id);
                  return (
                    <label
                      key={mgr.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-background/25 rounded-lg cursor-pointer text-sm text-text-primary select-none w-full"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setTempSelected(prev => prev.filter(id => id !== mgr.id));
                          } else {
                            setTempSelected(prev => [...prev, mgr.id]);
                          }
                        }}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                      <span className="truncate">{mgr.nome}</span>
                    </label>
                  );
                })}
              </div>
              <div className="p-3 bg-gray-50/50 dark:bg-background/10 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setTempSelected([]);
                    setSelectedManagers([]);
                    localStorage.removeItem('dashboard_gerencial_gerentes');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer bg-transparent rounded-lg hover:bg-gray-100 dark:hover:bg-background/25"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedManagers(tempSelected);
                    localStorage.setItem('dashboard_gerencial_gerentes', JSON.stringify(tempSelected));
                    setDropdownOpen(false);
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#2563A8] hover:bg-[#1d4f87] rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer flex items-center justify-center"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Resumo Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Parceiros', value: stats.totalPartners, icon: Users, color: 'text-blue-600' },
          { label: 'Com Playbook', value: stats.activePlans, icon: Target, color: 'text-green-600' },
          { label: 'Retenção s/ Plano', value: stats.retencaoNoPlan, icon: AlertCircle, color: 'text-red-600' },
          { label: 'Tasks na Semana', value: stats.tasksThisWeek, icon: Activity, color: 'text-amber-600' },
          { label: 'Gerentes Ativos Hoje', value: stats.activeManagersToday, icon: Clock, color: 'text-indigo-600' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface p-6 rounded-xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-3xl font-bold text-text-primary">{stat.value}</p>
            <p className="text-xs text-text-secondary font-medium tracking-wide uppercase mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Forecast de Account Planning */}
      <div className="bg-surface p-6 rounded-xl border border-border shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#2563A8]" /> Forecast de Account Planning
          </h3>
        </div>

        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="min-w-full divide-y divide-border text-xs text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-background/40">
                <th className="p-3 font-semibold text-text-secondary uppercase select-none w-48 border-r border-border">Métrica</th>
                {forecastMetrics.map((m, idx) => (
                  <th 
                    key={idx} 
                    className={`p-3 font-semibold text-center select-none min-w-[70px] ${m.isCurrent ? 'bg-[#2563A8]/10 text-primary font-bold border-x border-[#2563A8]/20' : 'text-text-secondary'}`}
                  >
                    <div>{m.label}</div>
                    {m.isCurrent && <div className="text-[9px] uppercase tracking-wider font-extrabold text-[#2563A8]">Hoje</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {/* Valor Projetado */}
              <tr 
                onClick={() => setProjectedExpanded(!projectedExpanded)} 
                className="hover:bg-gray-50/50 dark:hover:bg-background/20 cursor-pointer transition-colors font-medium"
              >
                <td className="p-3 flex items-center gap-1 text-text-primary border-r border-border">
                  {projectedExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <span>Valor Projetado</span>
                </td>
                {forecastMetrics.map((m, idx) => (
                  <td 
                    key={idx} 
                    className={`p-3 text-center border-b border-border ${m.isCurrent ? 'bg-[#2563A8]/5 font-bold border-x border-[#2563A8]/20' : 'text-text-primary'}`}
                  >
                    {m.previstoTotal.toLocaleString('pt-BR')}
                  </td>
                ))}
              </tr>

              {/* Valor Projetado — Breakdown */}
              {projectedExpanded && (
                <>
                  <tr className="bg-gray-50/30 dark:bg-background/10 text-text-secondary text-[11px] italic">
                    <td className="p-2.5 pl-8 border-r border-border">↳ Engajar</td>
                    {forecastMetrics.map((m, idx) => (
                      <td 
                        key={idx} 
                        className={`p-2.5 text-center ${m.isCurrent ? 'bg-[#2563A8]/5 font-semibold text-text-primary border-x border-[#2563A8]/20' : ''}`}
                      >
                        {m.previstoEngajar.toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-gray-50/30 dark:bg-background/10 text-text-secondary text-[11px] italic">
                    <td className="p-2.5 pl-8 border-r border-border">↳ Substituir</td>
                    {forecastMetrics.map((m, idx) => (
                      <td 
                        key={idx} 
                        className={`p-2.5 text-center ${m.isCurrent ? 'bg-[#2563A8]/5 font-semibold text-text-primary border-x border-[#2563A8]/20' : ''}`}
                      >
                        {m.previstoSubstituir.toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-gray-50/30 dark:bg-background/10 text-text-secondary text-[11px] italic">
                    <td className="p-2.5 pl-8 border-r border-border">↳ Vender</td>
                    {forecastMetrics.map((m, idx) => (
                      <td 
                        key={idx} 
                        className={`p-2.5 text-center ${m.isCurrent ? 'bg-[#2563A8]/5 font-semibold text-text-primary border-x border-[#2563A8]/20' : ''}`}
                      >
                        {m.previstoVender.toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Realizado */}
              <tr 
                onClick={() => setRealizedExpanded(!realizedExpanded)} 
                className="hover:bg-gray-50/50 dark:hover:bg-background/20 cursor-pointer transition-colors font-medium border-t border-border"
              >
                <td className="p-3 flex items-center gap-1 text-text-primary border-r border-border">
                  {realizedExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                  <span>Realizado</span>
                </td>
                {forecastMetrics.map((m, idx) => (
                  <td 
                    key={idx} 
                    className={`p-3 text-center border-b border-border ${m.isCurrent ? 'bg-[#2563A8]/5 font-bold border-x border-[#2563A8]/20' : 'text-text-primary'}`}
                  >
                    {m.realizadoTotal.toLocaleString('pt-BR')}
                  </td>
                ))}
              </tr>

              {/* Realizado — Breakdown */}
              {realizedExpanded && (
                <>
                  <tr className="bg-gray-50/30 dark:bg-background/10 text-text-secondary text-[11px] italic">
                    <td className="p-2.5 pl-8 border-r border-border">↳ Engajar</td>
                    {forecastMetrics.map((m, idx) => (
                      <td 
                        key={idx} 
                        className={`p-2.5 text-center ${m.isCurrent ? 'bg-[#2563A8]/5 font-semibold text-text-primary border-x border-[#2563A8]/20' : ''}`}
                      >
                        {m.realizadoEngajar.toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-gray-50/30 dark:bg-background/10 text-text-secondary text-[11px] italic">
                    <td className="p-2.5 pl-8 border-r border-border">↳ Substituir</td>
                    {forecastMetrics.map((m, idx) => (
                      <td 
                        key={idx} 
                        className={`p-2.5 text-center ${m.isCurrent ? 'bg-[#2563A8]/5 font-semibold text-text-primary border-x border-[#2563A8]/20' : ''}`}
                      >
                        {m.realizadoSubstituir.toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-gray-50/30 dark:bg-background/10 text-text-secondary text-[11px] italic">
                    <td className="p-2.5 pl-8 border-r border-border">↳ Vender</td>
                    {forecastMetrics.map((m, idx) => (
                      <td 
                        key={idx} 
                        className={`p-2.5 text-center ${m.isCurrent ? 'bg-[#2563A8]/5 font-semibold text-text-primary border-x border-[#2563A8]/20' : ''}`}
                      >
                        {m.realizadoVender.toLocaleString('pt-BR')}
                      </td>
                    ))}
                  </tr>
                </>
              )}

              {/* Aberto */}
              <tr className="hover:bg-gray-50/50 dark:hover:bg-background/20 transition-colors font-medium border-t border-border">
                <td className="p-3 pl-4 text-text-primary border-r border-border">Aberto</td>
                {forecastMetrics.map((m, idx) => (
                  <td 
                    key={idx} 
                    className={`p-3 text-center border-b border-border ${m.isCurrent ? 'bg-[#2563A8]/5 font-bold border-x border-[#2563A8]/20' : 'text-text-primary'}`}
                  >
                    {m.abertoTotal.toLocaleString('pt-BR')}
                  </td>
                ))}
              </tr>

              {/* Forecast % */}
              <tr className="font-bold border-t-2 border-border bg-gray-50/40 dark:bg-background/20 font-mono">
                <td className="p-3 pl-4 text-text-primary border-r border-border">Forecast %</td>
                {forecastMetrics.map((m, idx) => {
                  let colorClass = 'text-[#E24B4A]'; // < 50
                  if (m.forecastPercent >= 80) {
                    colorClass = 'text-[#1D9E75]';
                  } else if (m.forecastPercent >= 50) {
                    colorClass = 'text-yellow-600 dark:text-amber-500';
                  }

                  return (
                    <td 
                      key={idx} 
                      className={`p-3 text-center ${colorClass} ${m.isCurrent ? 'bg-[#2563A8]/10 border-x border-[#2563A8]/30' : ''}`}
                    >
                      {m.hasPrevisto ? `${Math.round(m.forecastPercent)}%` : '-'}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Nova Seção — Tasks Concluídas por Tipo de Plano */}
      <div className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-emerald-500" /> Tasks Concluídas por Tipo de Plano — últimos 30 dias
          </h3>
        </div>
        <div className="h-72 w-full">
          <Bar data={chartTasksConcluidas30DaysData} options={chartTasksConcluidas30DaysOptions} plugins={[customDatalabelsPlugin]} />
        </div>
      </div>

      {/* Nova Seção — Tasks Concluídas por Gerente */}
      <div className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-emerald-500" /> Tasks Concluídas por Gerente — últimos 30 dias
          </h3>
        </div>
        <div className="h-72 w-full">
          <Bar data={chartTasksConcluidasPorGerentePlanoData} options={chartTasksConcluidasPorGerentePlanoOptions} plugins={[customDatalabelsPlugin]} />
        </div>
      </div>

      {/* Nova Seção — Tasks dos últimos 30 dias */}
      <div className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-500" /> Tasks — últimos 30 dias
          </h3>
        </div>
        <div className="h-72 w-full">
          <Bar data={chart30DaysData} options={chart30DaysOptions} plugins={chart30DaysPlugins} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Chart 1 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Tasks por Status e Gerente</h3>
          <div className="h-64">
            <Bar 
              data={chart1Data} 
              options={{ 
                maintainAspectRatio: false, 
                scales: { 
                  x: { stacked: true, grid: { display: false } }, 
                  y: { stacked: true, grid: { display: false } } 
                } 
              }} 
              plugins={[customDatalabelsPlugin]}
            />
          </div>
        </div>

        {/* Chart 2 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Progresso Médio por Gerente (%)</h3>
          <div className="h-64">
            <Bar 
              data={chart2Data} 
              options={{ 
                maintainAspectRatio: false, 
                indexAxis: 'y',
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { display: false } }
                }
              }} 
            />
          </div>
        </div>

        {/* Chart 3 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Novos Planos nos Últimos 30 Dias</h3>
          <div className="h-64">
            <Bar 
              data={chart3Data} 
              options={{ 
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      title: (items: any) => items[0]?.label,
                      label: () => '',
                      labelColor: () => ({
                        borderColor: 'transparent',
                        backgroundColor: 'transparent',
                        borderWidth: 0,
                        borderRadius: 0
                      }),
                      afterBody: (items: any) => {
                        const dataIndex = items[0]?.dataIndex;
                        if (dataIndex === undefined) return [];
                        
                        const ranking = chart3Data.datasets
                          .map(dataset => ({
                            manager: dataset.label,
                            count: dataset.data[dataIndex] || 0
                          }))
                          .filter(item => item.count !== undefined && item.count > 0)
                          .sort((a, b) => b.count - a.count);
                        
                        return ranking.map(r => `${r.manager}: ${r.count} plano${r.count > 1 ? 's' : ''}`);
                      }
                    }
                  }
                },
                scales: {
                  x: { stacked: true, grid: { display: false } },
                  y: { stacked: true, grid: { display: false } }
                }
              }} 
              plugins={[customDatalabelsPlugin]}
            />
          </div>
        </div>

        {/* Chart 4 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Ranking de Planos por Gerente (Histórico)</h3>
          <div className="h-64">
            <Bar 
              data={chart4Data} 
              options={{ 
                maintainAspectRatio: false,
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { display: false } }
                }
              }} 
            />
          </div>
        </div>

        {/* Chart 5 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Planos por Dia: Presença de Contexto (7d)</h3>
          <div className="h-64">
            <Bar 
              data={chart5Data} 
              options={{ 
                maintainAspectRatio: false, 
                scales: { 
                  x: { stacked: true, grid: { display: false } }, 
                  y: { 
                    stacked: true, 
                    grid: { display: false },
                    min: 0,
                    max: 100,
                    ticks: {
                      callback: (value: any) => `${value}%`
                    }
                  } 
                } 
              }} 
            />
          </div>
        </div>

        {/* Chart 6 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Planos por Gerente: Presença de Contexto</h3>
          <div className="h-64">
            <Bar 
              data={chart6Data} 
              options={{ 
                maintainAspectRatio: false, 
                scales: { 
                  x: { stacked: true, grid: { display: false } }, 
                  y: { stacked: true, grid: { display: false } } 
                } 
              }} 
              plugins={[customDatalabelsPlugin]}
            />
          </div>
        </div>

        {/* Chart 7 */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm xl:col-span-2">
          <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Carteira por Gerente e Plano (Tier)</h3>
          <div className="h-64">
            <Bar 
              data={chart7Data} 
              options={{ 
                maintainAspectRatio: false,
                scales: {
                  x: { stacked: true, grid: { display: false } },
                  y: { stacked: true, grid: { display: false } }
                }
              }} 
              plugins={[customDatalabelsPlugin]}
            />
          </div>
        </div>
      </div>

      {/* Heatmap Section */}
      <div className="bg-surface p-6 rounded-xl border border-border shadow-sm overflow-hidden">
        <h3 className="text-sm font-bold text-text-primary mb-6 uppercase tracking-wider">Heatmap de Acessos (Últimos 14 dias)</h3>
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-1 px-3 text-left">Gerente</th>
                  {heatmapData.days.map(day => (
                    <th key={day} className="p-1 text-center font-normal text-text-secondary whitespace-nowrap">
                      {new Date(day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapData.managers.map((m, mIdx) => (
                  <tr key={m}>
                    <td className="p-1 px-3 text-left font-medium">{m}</td>
                    {heatmapData.days.map((day, dIdx) => {
                      const getNome = (userId: string) => managers.find(mgr => mgr.id === userId)?.nome ?? null;
                      const count = filteredLogs.filter(l => l.accessed_at.startsWith(day) && getNome(l.user_id) === m).length;
                      let bgColor = 'bg-gray-50';
                      if (count > 0) bgColor = 'bg-blue-100';
                      if (count > 2) bgColor = 'bg-blue-300';
                      if (count > 5) bgColor = 'bg-blue-500';
                      
                      return (
                        <td key={day} className="p-1 division-center-cell">
                          <div className={`w-8 h-8 mx-auto rounded flex items-center justify-center ${bgColor} ${count > 2 ? 'text-white' : 'text-text-primary'}`}>
                            {count || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Ranking de Planos por Tipo de Plano */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Ranking de Planos por Tipo</h3>
          <p className="text-xs text-text-secondary mt-1">Comparativo de adesão e potencial por classificação de plano (apenas planos ativos)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3 text-left w-16">Pos</th>
                <th className="px-6 py-3 text-left">Tipo de Plano</th>
                <th className="px-6 py-3 text-right">Total de Parceiros</th>
                <th className="px-6 py-3 text-right"># de Planos Criados</th>
                <th className="px-6 py-3 text-right">Potencial Coberto (C/ Plano)</th>
                <th className="px-6 py-3 text-right">Potencial Total (Classe)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {planTypeRanking.map((item, index) => (
                <tr key={item.type} className="hover:bg-gray-50/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-text-secondary">#{index + 1}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2.5 py-1 bg-primary/10 text-primary rounded-md text-xs font-semibold">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-text-primary font-medium">{item.totalPartners}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-primary font-bold">{item.createdPlans}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-right font-mono font-bold ${
                    item.coveredPotential > 0 
                      ? 'text-green-600' 
                      : item.coveredPotential < 0 
                        ? 'text-red-500' 
                        : 'text-text-secondary font-normal'
                  }`}>
                    {item.coveredPotential}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-text-secondary font-mono">{item.sumPotential}</td>
                </tr>
              ))}
              {planTypeRanking.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">
                    Nenhum playbook ativo encontrado para os tipos de plano disponíveis.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Plans Table */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">Playbooks Ativos</h3>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-text-secondary" />
            <select 
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value as any)}
              className="text-xs border border-border rounded p-1 outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Todos</option>
              <option value="with_context">Com Contexto</option>
              <option value="without_context">Sem Contexto</option>
            </select>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-text-secondary uppercase tracking-wider">ID</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-text-secondary uppercase tracking-wider">Parceiro</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-text-secondary uppercase tracking-wider">Gerente</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-text-secondary uppercase tracking-wider">Plano</th>
                <th className="px-6 py-3 text-left text-[10px] font-bold text-text-secondary uppercase tracking-wider">Contexto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tableActivePlansFiltered.map(plan => (
                <tr key={plan.id} className="hover:bg-gray-50/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">{plan.partners?.accountancy_id}</td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-text-primary">{plan.partners?.nome}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-text-secondary">{plan.partners?.gerente}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-[10px] font-bold">
                      {plan.partners?.segmento}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {plan.contexto ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : (
                      <AlertCircle size={16} className="text-red-400" />
                    )}
                  </td>
                </tr>
              ))}
              {tableActivePlansFiltered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-text-secondary">
                    Nenhum playbook ativo encontrado com este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
