import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { BarChart2, Loader2 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface PlanItem {
  id: string;
  partner_id: string;
  playbook_id: string;
  created_at: string;
  playbooks: {
    id: string;
    nome: string;
  } | null;
}

interface TaskItem {
  id: string;
  plan_id: string;
  ordem: number;
  status?: string;
}

interface HistoryItem {
  task_id: string;
  status_novo: string;
  alterado_em: string;
}

interface StartedPlanItem {
  plan_id: string;
  partner_id: string;
  playbook_id: string;
  started_at: string;
}

interface CompletedPlanItem {
  plan_id: string;
  partner_id: string;
  playbook_id: string;
  completed_at: string;
}

export const PlaybooksAnalytics: React.FC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [periodMode, setPeriodMode] = useState<'wow' | 'mom'>('wow');

  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loadingPlans, setLoadingPlans] = useState<boolean>(true);

  const [startedPlans, setStartedPlans] = useState<StartedPlanItem[]>([]);
  const [loadingStarted, setLoadingStarted] = useState<boolean>(true);

  const [completedPlans, setCompletedPlans] = useState<CompletedPlanItem[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState<boolean>(true);

  // Cohort Analytics State
  const [selectedCohortPlaybookId, setSelectedCohortPlaybookId] = useState<string>('');
  const [loadingCohort, setLoadingCohort] = useState<boolean>(false);

  interface CohortRow {
    weekLabel: string;
    weekStart: Date;
    planCount: number;
    progressByWeek: (number | null)[];
  }
  const [cohortData, setCohortData] = useState<CohortRow[]>([]);

  // Derived available playbooks from plans
  const availablePlaybooks = useMemo(() => {
    const map = new Map<string, string>();
    plans.forEach((p) => {
      if (p.playbook_id && p.playbooks?.nome) {
        map.set(p.playbook_id, p.playbooks.nome);
      }
    });
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [plans]);

  useEffect(() => {
    if (!selectedCohortPlaybookId) {
      setCohortData([]);
      setLoadingCohort(false);
      return;
    }

    let isMounted = true;

    async function fetchCohortData() {
      setLoadingCohort(true);
      try {
        let cohortPlans: { id: string; partner_id: string }[] = [];
        let fromPlans = 0;
        const pageSize = 1000;

        while (true) {
          const { data, error } = await supabase
            .from('plans')
            .select('id, partner_id')
            .eq('playbook_id', selectedCohortPlaybookId)
            .range(fromPlans, fromPlans + pageSize - 1);

          if (error) {
            console.error('Erro ao buscar planos para cohort:', error);
            break;
          }
          if (data) {
            cohortPlans = cohortPlans.concat(data as { id: string; partner_id: string }[]);
          }
          if (!data || data.length < pageSize) break;
          fromPlans += pageSize;
        }

        if (cohortPlans.length === 0) {
          if (isMounted) {
            setCohortData([]);
            setLoadingCohort(false);
          }
          return;
        }

        const planIds = cohortPlans.map((p) => p.id);
        const planIdsSet = new Set(planIds);

        let cohortTasks: TaskItem[] = [];
        let fromTasks = 0;

        while (true) {
          const { data, error } = await supabase
            .from('tasks')
            .select('id, plan_id, ordem, deletada_em')
            .is('deletada_em', null)
            .range(fromTasks, fromTasks + pageSize - 1);

          if (error) {
            console.error('Erro ao buscar tasks para cohort:', error);
            break;
          }
          if (data) {
            const filtered = (data as unknown as TaskItem[]).filter((t) => planIdsSet.has(t.plan_id));
            cohortTasks = cohortTasks.concat(filtered);
          }
          if (!data || data.length < pageSize) break;
          fromTasks += pageSize;
        }

        const tasksByPlanMap = new Map<string, TaskItem[]>();
        cohortTasks.forEach((t) => {
          const list = tasksByPlanMap.get(t.plan_id) || [];
          list.push(t);
          tasksByPlanMap.set(t.plan_id, list);
        });

        const minTaskByPlanMap = new Map<string, TaskItem>();
        tasksByPlanMap.forEach((tasks, pId) => {
          if (tasks.length === 0) return;
          let minTask = tasks[0];
          tasks.forEach((t) => {
            if (t.ordem < minTask.ordem) minTask = t;
          });
          minTaskByPlanMap.set(pId, minTask);
        });

        const allTaskIds = new Set(cohortTasks.map((t) => t.id));

        if (allTaskIds.size === 0) {
          if (isMounted) {
            setCohortData([]);
            setLoadingCohort(false);
          }
          return;
        }

        let cohortHistory: HistoryItem[] = [];
        let fromHistory = 0;

        while (true) {
          const { data, error } = await supabase
            .from('task_status_history')
            .select('task_id, status_novo, alterado_em')
            .eq('status_novo', 'concluida')
            .range(fromHistory, fromHistory + pageSize - 1);

          if (error) {
            console.error('Erro ao buscar histórico para cohort:', error);
            break;
          }
          if (data) {
            const filtered = (data as unknown as HistoryItem[]).filter((h) => allTaskIds.has(h.task_id));
            cohortHistory = cohortHistory.concat(filtered);
          }
          if (!data || data.length < pageSize) break;
          fromHistory += pageSize;
        }

        const earliestTaskCompletionMap = new Map<string, string>();
        cohortHistory.forEach((h) => {
          const existing = earliestTaskCompletionMap.get(h.task_id);
          if (!existing || new Date(h.alterado_em).getTime() < new Date(existing).getTime()) {
            earliestTaskCompletionMap.set(h.task_id, h.alterado_em);
          }
        });

        interface ProcessedPlan {
          plan_id: string;
          total_tasks: number;
          start_date: Date;
          cohort_monday: Date;
          task_completions: Date[];
        }

        const processedPlans: ProcessedPlan[] = [];

        cohortPlans.forEach((p) => {
          const planTasks = tasksByPlanMap.get(p.id);
          if (!planTasks || planTasks.length === 0) return;

          const minTask = minTaskByPlanMap.get(p.id);
          if (!minTask) return;

          const minTaskStartStr = earliestTaskCompletionMap.get(minTask.id);
          if (!minTaskStartStr) return;

          const startDate = new Date(minTaskStartStr);

          const day = startDate.getDay();
          const distToMon = day === 0 ? -6 : 1 - day;
          const monday = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + distToMon, 0, 0, 0, 0);

          const taskCompletions: Date[] = [];
          planTasks.forEach((t) => {
            const compStr = earliestTaskCompletionMap.get(t.id);
            if (compStr) {
              taskCompletions.push(new Date(compStr));
            }
          });

          processedPlans.push({
            plan_id: p.id,
            total_tasks: planTasks.length,
            start_date: startDate,
            cohort_monday: monday,
            task_completions: taskCompletions,
          });
        });

        if (processedPlans.length === 0) {
          if (isMounted) {
            setCohortData([]);
            setLoadingCohort(false);
          }
          return;
        }

        const cohortsMap = new Map<number, ProcessedPlan[]>();
        processedPlans.forEach((pp) => {
          const key = pp.cohort_monday.getTime();
          const list = cohortsMap.get(key) || [];
          list.push(pp);
          cohortsMap.set(key, list);
        });

        const sortedKeys = Array.from(cohortsMap.keys()).sort((a, b) => a - b);
        const now = new Date();

        const cohortRows: CohortRow[] = sortedKeys.map((key) => {
          const monday = new Date(key);
          const plansInCohort = cohortsMap.get(key)!;
          const count = plansInCohort.length;

          const startStr = `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`;
          const weekLabel = `${startStr} — ${count} ${count === 1 ? 'plano' : 'planos'}`;

          const progressByWeek: (number | null)[] = [];

          for (let N = 0; N <= 12; N++) {
            const dataCorte = new Date(monday.getTime() + (N + 1) * 7 * 24 * 60 * 60 * 1000);

            if (now.getTime() < dataCorte.getTime()) {
              progressByWeek.push(null);
            } else {
              let totalProgressSum = 0;
              plansInCohort.forEach((p) => {
                const completedByCorte = p.task_completions.filter((dt) => dt.getTime() <= dataCorte.getTime()).length;
                const planProgress = completedByCorte / p.total_tasks;
                totalProgressSum += planProgress;
              });
              const avgProgress = (totalProgressSum / count) * 100;
              progressByWeek.push(avgProgress);
            }
          }

          return {
            weekLabel,
            weekStart: monday,
            planCount: count,
            progressByWeek,
          };
        });

        if (isMounted) {
          setCohortData(cohortRows);
          setLoadingCohort(false);
        }
      } catch (err) {
        console.error('Erro ao calcular cohort:', err);
        if (isMounted) {
          setCohortData([]);
          setLoadingCohort(false);
        }
      }
    }

    fetchCohortData();

    return () => {
      isMounted = false;
    };
  }, [selectedCohortPlaybookId]);

  // Fetch all plans, tasks, and task_status_history with pagination
  useEffect(() => {
    let isMounted = true;

    async function fetchAllAnalyticsData() {
      setLoadingPlans(true);
      setLoadingStarted(true);
      setLoadingCompleted(true);
      try {
        // 1. Fetch plans
        let allPlans: PlanItem[] = [];
        let fromPlans = 0;
        const pageSize = 1000;

        while (true) {
          const { data, error } = await supabase
            .from('plans')
            .select('id, partner_id, playbook_id, created_at, playbooks(id, nome)')
            .not('playbook_id', 'is', null)
            .range(fromPlans, fromPlans + pageSize - 1);

          if (error) {
            console.error('Erro ao buscar planos:', error);
            break;
          }
          if (data) {
            allPlans = allPlans.concat(data as unknown as PlanItem[]);
          }
          if (!data || data.length < pageSize) break;
          fromPlans += pageSize;
        }

        if (isMounted) {
          setPlans(allPlans);
          setLoadingPlans(false);
        }

        if (allPlans.length === 0) {
          if (isMounted) {
            setStartedPlans([]);
            setLoadingStarted(false);
            setCompletedPlans([]);
            setLoadingCompleted(false);
          }
          return;
        }

        const validPlanIds = new Set(allPlans.map((p) => p.id));

        // 2. Fetch tasks (non-deleted)
        let allTasks: TaskItem[] = [];
        let fromTasks = 0;

        while (true) {
          const { data, error } = await supabase
            .from('tasks')
            .select('id, plan_id, ordem, status, deletada_em')
            .is('deletada_em', null)
            .range(fromTasks, fromTasks + pageSize - 1);

          if (error) {
            console.error('Erro ao buscar tasks:', error);
            break;
          }
          if (data) {
            allTasks = allTasks.concat(data as unknown as TaskItem[]);
          }
          if (!data || data.length < pageSize) break;
          fromTasks += pageSize;
        }

        // Find min order task per plan (for started plans)
        const minTaskByPlan = new Map<string, { id: string; ordem: number }>();
        // Group all tasks by plan_id (for completed plans check)
        const tasksByPlan = new Map<string, TaskItem[]>();

        allTasks.forEach((t) => {
          if (!validPlanIds.has(t.plan_id)) return;

          // min task
          const current = minTaskByPlan.get(t.plan_id);
          if (!current || t.ordem < current.ordem) {
            minTaskByPlan.set(t.plan_id, { id: t.id, ordem: t.ordem });
          }

          // group by plan
          const list = tasksByPlan.get(t.plan_id) || [];
          list.push(t);
          tasksByPlan.set(t.plan_id, list);
        });

        const minTaskIds = new Set(Array.from(minTaskByPlan.values()).map((t) => t.id));

        // 3. Fetch task_status_history with status_novo = 'concluida'
        let allHistory: HistoryItem[] = [];
        let fromHistory = 0;

        while (true) {
          const { data, error } = await supabase
            .from('task_status_history')
            .select('task_id, status_novo, alterado_em')
            .eq('status_novo', 'concluida')
            .range(fromHistory, fromHistory + pageSize - 1);

          if (error) {
            console.error('Erro ao buscar histórico de tasks:', error);
            break;
          }
          if (data) {
            allHistory = allHistory.concat(data as unknown as HistoryItem[]);
          }
          if (!data || data.length < pageSize) break;
          fromHistory += pageSize;
        }

        // Find earliest alterado_em for each minTask (for started plans)
        const earliestCompletionByTask = new Map<string, string>();
        // Find latest alterado_em for each task (for completed plans)
        const latestCompletionByTask = new Map<string, string>();

        allHistory.forEach((h) => {
          if (minTaskIds.has(h.task_id)) {
            const existingEarliest = earliestCompletionByTask.get(h.task_id);
            if (!existingEarliest || new Date(h.alterado_em).getTime() < new Date(existingEarliest).getTime()) {
              earliestCompletionByTask.set(h.task_id, h.alterado_em);
            }
          }

          const existingLatest = latestCompletionByTask.get(h.task_id);
          if (!existingLatest || new Date(h.alterado_em).getTime() > new Date(existingLatest).getTime()) {
            latestCompletionByTask.set(h.task_id, h.alterado_em);
          }
        });

        // Build list of started plans
        const startedList: StartedPlanItem[] = [];
        allPlans.forEach((p) => {
          const minTask = minTaskByPlan.get(p.id);
          if (minTask) {
            const startedAt = earliestCompletionByTask.get(minTask.id);
            if (startedAt) {
              startedList.push({
                plan_id: p.id,
                partner_id: p.partner_id,
                playbook_id: p.playbook_id,
                started_at: startedAt,
              });
            }
          }
        });

        // Build list of completed plans
        const completedList: CompletedPlanItem[] = [];
        allPlans.forEach((p) => {
          const planTasks = tasksByPlan.get(p.id);
          if (!planTasks || planTasks.length === 0) return;

          // Check if ALL tasks in this plan are completed
          const allCompleted = planTasks.every((t) => t.status === 'concluida');
          if (!allCompleted) return;

          // Find latest alterado_em among all tasks of this plan in task_status_history
          let maxCompletedAt: string | null = null;
          let hasHistory = false;

          for (const task of planTasks) {
            const taskCompletedAt = latestCompletionByTask.get(task.id);
            if (taskCompletedAt) {
              hasHistory = true;
              if (!maxCompletedAt || new Date(taskCompletedAt).getTime() > new Date(maxCompletedAt).getTime()) {
                maxCompletedAt = taskCompletedAt;
              }
            }
          }

          if (hasHistory && maxCompletedAt) {
            completedList.push({
              plan_id: p.id,
              partner_id: p.partner_id,
              playbook_id: p.playbook_id,
              completed_at: maxCompletedAt,
            });
          }
        });

        if (isMounted) {
          setStartedPlans(startedList);
          setLoadingStarted(false);
          setCompletedPlans(completedList);
          setLoadingCompleted(false);
        }
      } catch (err) {
        console.error('Erro ao carregar dados de analytics:', err);
        if (isMounted) {
          setPlans([]);
          setStartedPlans([]);
          setCompletedPlans([]);
          setLoadingPlans(false);
          setLoadingStarted(false);
          setLoadingCompleted(false);
        }
      }
    }

    fetchAllAnalyticsData();

    return () => {
      isMounted = false;
    };
  }, []);

  const stackedBarOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 12,
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
        padding: 10,
        cornerRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 10, family: 'Inter, sans-serif' },
        },
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(226, 232, 240, 0.4)' },
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: '#94a3b8',
          font: { size: 10, family: 'Inter, sans-serif' },
        },
      },
    },
  }), []);

  // Compute chart data for "Planos Criados"
  const createdPlansChartData = useMemo(() => {
    if (!plans || plans.length === 0) return null;

    // Collect all distinct playbooks
    const playbookMap = new Map<string, string>(); // playbook_id -> playbook_nome
    plans.forEach((p) => {
      if (p.playbook_id) {
        const name = p.playbooks?.nome || 'Playbook Sem Nome';
        playbookMap.set(p.playbook_id, name);
      }
    });

    const playbookIds = Array.from(playbookMap.keys());
    if (playbookIds.length === 0) return null;

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

    const now = new Date();

    if (periodMode === 'wow') {
      // Last 8 weeks, Monday to Sunday
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distanceToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      const timeBuckets: { label: string; start: Date; end: Date }[] = [];
      for (let i = 7; i >= 0; i--) {
        const wStart = new Date(currentMonday);
        wStart.setDate(currentMonday.getDate() - i * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        wEnd.setHours(23, 59, 59, 999);

        const startStr = `${String(wStart.getDate()).padStart(2, '0')}/${String(wStart.getMonth() + 1).padStart(2, '0')}`;
        const endStr = `${String(wEnd.getDate()).padStart(2, '0')}/${String(wEnd.getMonth() + 1).padStart(2, '0')}`;
        timeBuckets.push({
          label: `${startStr} - ${endStr}`,
          start: wStart,
          end: wEnd,
        });
      }

      const labels = timeBuckets.map((b) => b.label);

      const datasets = playbookIds.map((pbId, idx) => {
        const pbName = playbookMap.get(pbId) || 'Playbook';
        const color = colors[idx % colors.length];

        const seriesData = timeBuckets.map((bucket) => {
          const partnersSet = new Set<string>();
          plans.forEach((p) => {
            if (p.playbook_id === pbId && p.created_at) {
              const pDate = new Date(p.created_at);
              if (pDate >= bucket.start && pDate <= bucket.end && p.partner_id) {
                partnersSet.add(p.partner_id);
              }
            }
          });
          return partnersSet.size;
        });

        return {
          label: pbName,
          data: seriesData,
          backgroundColor: color,
          borderRadius: 2,
        };
      });

      return { labels, datasets };
    } else {
      // Last 6 calendar months
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const timeBuckets: { label: string; start: Date; end: Date }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const start = new Date(y, m, 1, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

        timeBuckets.push({
          label: `${monthNames[m]}/${String(y).slice(-2)}`,
          start,
          end,
        });
      }

      const labels = timeBuckets.map((b) => b.label);

      const datasets = playbookIds.map((pbId, idx) => {
        const pbName = playbookMap.get(pbId) || 'Playbook';
        const color = colors[idx % colors.length];

        const seriesData = timeBuckets.map((bucket) => {
          const partnersSet = new Set<string>();
          plans.forEach((p) => {
            if (p.playbook_id === pbId && p.created_at) {
              const pDate = new Date(p.created_at);
              if (pDate >= bucket.start && pDate <= bucket.end && p.partner_id) {
                partnersSet.add(p.partner_id);
              }
            }
          });
          return partnersSet.size;
        });

        return {
          label: pbName,
          data: seriesData,
          backgroundColor: color,
          borderRadius: 2,
        };
      });

      return { labels, datasets };
    }
  }, [plans, periodMode]);

  // Compute chart data for "Planos Iniciados"
  const startedPlansChartData = useMemo(() => {
    if (!startedPlans || startedPlans.length === 0 || !plans || plans.length === 0) return null;

    // Collect all distinct playbooks
    const playbookMap = new Map<string, string>(); // playbook_id -> playbook_nome
    plans.forEach((p) => {
      if (p.playbook_id) {
        const name = p.playbooks?.nome || 'Playbook Sem Nome';
        playbookMap.set(p.playbook_id, name);
      }
    });

    const playbookIds = Array.from(playbookMap.keys());
    if (playbookIds.length === 0) return null;

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

    const now = new Date();

    if (periodMode === 'wow') {
      // Last 8 weeks, Monday to Sunday
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distanceToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      const timeBuckets: { label: string; start: Date; end: Date }[] = [];
      for (let i = 7; i >= 0; i--) {
        const wStart = new Date(currentMonday);
        wStart.setDate(currentMonday.getDate() - i * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        wEnd.setHours(23, 59, 59, 999);

        const startStr = `${String(wStart.getDate()).padStart(2, '0')}/${String(wStart.getMonth() + 1).padStart(2, '0')}`;
        const endStr = `${String(wEnd.getDate()).padStart(2, '0')}/${String(wEnd.getMonth() + 1).padStart(2, '0')}`;
        timeBuckets.push({
          label: `${startStr} - ${endStr}`,
          start: wStart,
          end: wEnd,
        });
      }

      const labels = timeBuckets.map((b) => b.label);

      let totalCount = 0;
      const datasets = playbookIds.map((pbId, idx) => {
        const pbName = playbookMap.get(pbId) || 'Playbook';
        const color = colors[idx % colors.length];

        const seriesData = timeBuckets.map((bucket) => {
          const partnersSet = new Set<string>();
          startedPlans.forEach((sp) => {
            if (sp.playbook_id === pbId && sp.started_at) {
              const sDate = new Date(sp.started_at);
              if (sDate >= bucket.start && sDate <= bucket.end && sp.partner_id) {
                partnersSet.add(sp.partner_id);
              }
            }
          });
          totalCount += partnersSet.size;
          return partnersSet.size;
        });

        return {
          label: pbName,
          data: seriesData,
          backgroundColor: color,
          borderRadius: 2,
        };
      });

      if (totalCount === 0) return null;

      return { labels, datasets };
    } else {
      // Last 6 calendar months
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const timeBuckets: { label: string; start: Date; end: Date }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const start = new Date(y, m, 1, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

        timeBuckets.push({
          label: `${monthNames[m]}/${String(y).slice(-2)}`,
          start,
          end,
        });
      }

      const labels = timeBuckets.map((b) => b.label);

      let totalCount = 0;
      const datasets = playbookIds.map((pbId, idx) => {
        const pbName = playbookMap.get(pbId) || 'Playbook';
        const color = colors[idx % colors.length];

        const seriesData = timeBuckets.map((bucket) => {
          const partnersSet = new Set<string>();
          startedPlans.forEach((sp) => {
            if (sp.playbook_id === pbId && sp.started_at) {
              const sDate = new Date(sp.started_at);
              if (sDate >= bucket.start && sDate <= bucket.end && sp.partner_id) {
                partnersSet.add(sp.partner_id);
              }
            }
          });
          totalCount += partnersSet.size;
          return partnersSet.size;
        });

        return {
          label: pbName,
          data: seriesData,
          backgroundColor: color,
          borderRadius: 2,
        };
      });

      if (totalCount === 0) return null;

      return { labels, datasets };
    }
  }, [plans, startedPlans, periodMode]);

  // Compute chart data for "Planos Concluídos"
  const completedPlansChartData = useMemo(() => {
    if (!completedPlans || completedPlans.length === 0 || !plans || plans.length === 0) return null;

    // Collect all distinct playbooks
    const playbookMap = new Map<string, string>(); // playbook_id -> playbook_nome
    plans.forEach((p) => {
      if (p.playbook_id) {
        const name = p.playbooks?.nome || 'Playbook Sem Nome';
        playbookMap.set(p.playbook_id, name);
      }
    });

    const playbookIds = Array.from(playbookMap.keys());
    if (playbookIds.length === 0) return null;

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

    const now = new Date();

    if (periodMode === 'wow') {
      // Last 8 weeks, Monday to Sunday
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distanceToMonday);
      currentMonday.setHours(0, 0, 0, 0);

      const timeBuckets: { label: string; start: Date; end: Date }[] = [];
      for (let i = 7; i >= 0; i--) {
        const wStart = new Date(currentMonday);
        wStart.setDate(currentMonday.getDate() - i * 7);
        const wEnd = new Date(wStart);
        wEnd.setDate(wStart.getDate() + 6);
        wEnd.setHours(23, 59, 59, 999);

        const startStr = `${String(wStart.getDate()).padStart(2, '0')}/${String(wStart.getMonth() + 1).padStart(2, '0')}`;
        const endStr = `${String(wEnd.getDate()).padStart(2, '0')}/${String(wEnd.getMonth() + 1).padStart(2, '0')}`;
        timeBuckets.push({
          label: `${startStr} - ${endStr}`,
          start: wStart,
          end: wEnd,
        });
      }

      const labels = timeBuckets.map((b) => b.label);

      let totalCount = 0;
      const datasets = playbookIds.map((pbId, idx) => {
        const pbName = playbookMap.get(pbId) || 'Playbook';
        const color = colors[idx % colors.length];

        const seriesData = timeBuckets.map((bucket) => {
          const partnersSet = new Set<string>();
          completedPlans.forEach((cp) => {
            if (cp.playbook_id === pbId && cp.completed_at) {
              const cDate = new Date(cp.completed_at);
              if (cDate >= bucket.start && cDate <= bucket.end && cp.partner_id) {
                partnersSet.add(cp.partner_id);
              }
            }
          });
          totalCount += partnersSet.size;
          return partnersSet.size;
        });

        return {
          label: pbName,
          data: seriesData,
          backgroundColor: color,
          borderRadius: 2,
        };
      });

      if (totalCount === 0) return null;

      return { labels, datasets };
    } else {
      // Last 6 calendar months
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const timeBuckets: { label: string; start: Date; end: Date }[] = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const start = new Date(y, m, 1, 0, 0, 0, 0);
        const end = new Date(y, m + 1, 0, 23, 59, 59, 999);

        timeBuckets.push({
          label: `${monthNames[m]}/${String(y).slice(-2)}`,
          start,
          end,
        });
      }

      const labels = timeBuckets.map((b) => b.label);

      let totalCount = 0;
      const datasets = playbookIds.map((pbId, idx) => {
        const pbName = playbookMap.get(pbId) || 'Playbook';
        const color = colors[idx % colors.length];

        const seriesData = timeBuckets.map((bucket) => {
          const partnersSet = new Set<string>();
          completedPlans.forEach((cp) => {
            if (cp.playbook_id === pbId && cp.completed_at) {
              const cDate = new Date(cp.completed_at);
              if (cDate >= bucket.start && cDate <= bucket.end && cp.partner_id) {
                partnersSet.add(cp.partner_id);
              }
            }
          });
          totalCount += partnersSet.size;
          return partnersSet.size;
        });

        return {
          label: pbName,
          data: seriesData,
          backgroundColor: color,
          borderRadius: 2,
        };
      });

      if (totalCount === 0) return null;

      return { labels, datasets };
    }
  }, [plans, completedPlans, periodMode]);

  if (authLoading) return null;
  if (!user || !isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8 space-y-6" id="playbooks-analytics-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" id="playbooks-analytics-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary" id="playbooks-analytics-title">
            Analytics de Playbooks
          </h1>
          <p className="text-sm text-text-secondary mt-1" id="playbooks-analytics-desc">
            Acompanhe métricas de criação, início e conclusão de planos de ação por período.
          </p>
        </div>

        {/* Toggle WoW / MoM */}
        <div className="inline-flex p-1 bg-card border border-border rounded-xl shadow-sm self-start md:self-auto" id="period-toggle-container">
          <button
            type="button"
            onClick={() => setPeriodMode('wow')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              periodMode === 'wow'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            id="btn-toggle-wow"
          >
            Semana a Semana
          </button>
          <button
            type="button"
            onClick={() => setPeriodMode('mom')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              periodMode === 'mom'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            id="btn-toggle-mom"
          >
            Mês a Mês
          </button>
        </div>
      </div>

      {/* Grid de 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="analytics-cards-grid">
        {/* Card 1: Planos Criados */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col h-[340px]" id="card-planos-criados">
          <div className="mb-2">
            <h2 className="text-base font-bold tracking-tight text-text-primary" id="title-planos-criados">
              Planos Criados
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              Evolução do volume de planos criados ({periodMode === 'wow' ? 'semanal' : 'mensal'}).
            </p>
          </div>

          <div className="flex-1 w-full flex flex-col justify-center items-center" id="chart-planos-criados-container">
            {loadingPlans ? (
              <div className="flex flex-col items-center justify-center py-12" id="loading-planos-criados">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando planos criados...</span>
              </div>
            ) : createdPlansChartData ? (
              <div className="h-[230px] w-full" id="wrapper-chart-planos-criados">
                <Bar data={createdPlansChartData} options={stackedBarOptions} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/20 p-6 text-center w-full" id="empty-planos-criados">
                <BarChart2 className="h-6 w-6 text-slate-400 mb-2 opacity-60" />
                <span className="text-xs text-text-secondary font-medium">Nenhum plano de playbook registrado</span>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Planos Iniciados */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col h-[340px]" id="card-planos-iniciados">
          <div className="mb-2">
            <h2 className="text-base font-bold tracking-tight text-text-primary" id="title-planos-iniciados">
              Planos Iniciados
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              Evolução do volume de planos iniciados ({periodMode === 'wow' ? 'semanal' : 'mensal'}).
            </p>
          </div>

          <div className="flex-1 w-full flex flex-col justify-center items-center" id="chart-planos-iniciados-container">
            {loadingStarted ? (
              <div className="flex flex-col items-center justify-center py-12" id="loading-planos-iniciados">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando planos iniciados...</span>
              </div>
            ) : startedPlansChartData ? (
              <div className="h-[230px] w-full" id="wrapper-chart-planos-iniciados">
                <Bar data={startedPlansChartData} options={stackedBarOptions} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/20 p-6 text-center w-full" id="empty-planos-iniciados">
                <BarChart2 className="h-6 w-6 text-slate-400 mb-2 opacity-60" />
                <span className="text-xs text-text-secondary font-medium px-4">
                  Ainda não há planos com etapa inicial registrada. O rastreamento começou em {new Date().toLocaleDateString('pt-BR')}.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Planos Concluídos */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col h-[340px]" id="card-planos-concluidos">
          <div className="mb-2">
            <h2 className="text-base font-bold tracking-tight text-text-primary" id="title-planos-concluidos">
              Planos Concluídos
            </h2>
            <p className="text-xs text-text-secondary mt-1">
              Evolução do volume de planos concluídos ({periodMode === 'wow' ? 'semanal' : 'mensal'}).
            </p>
          </div>

          <div className="flex-1 w-full flex flex-col justify-center items-center" id="chart-planos-concluidos-container">
            {loadingCompleted ? (
              <div className="flex flex-col items-center justify-center py-12" id="loading-planos-concluidos">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mb-2" />
                <span className="text-xs text-text-secondary font-medium">Carregando planos concluídos...</span>
              </div>
            ) : completedPlansChartData ? (
              <div className="h-[230px] w-full" id="wrapper-chart-planos-concluidos">
                <Bar data={completedPlansChartData} options={stackedBarOptions} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 border border-dashed border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/20 p-6 text-center w-full" id="empty-planos-concluidos">
                <BarChart2 className="h-6 w-6 text-slate-400 mb-2 opacity-60" />
                <span className="text-xs text-text-secondary font-medium px-4">
                  Ainda não há planos concluídos com data registrada. O rastreamento começou em {new Date().toLocaleDateString('pt-BR')}.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seção Cohort de Avanço */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4" id="section-cohort-avanco">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="cohort-header">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-text-primary" id="title-cohort-avanco">
              Cohort de Avanço por Playbook
            </h2>
            <p className="text-xs text-text-secondary mt-1" id="desc-cohort-avanco">
              Acompanhe a taxa média de conclusão de tarefas ao longo das semanas a partir da data de início dos planos.
            </p>
          </div>

          {/* Selector de Playbook */}
          <div className="flex items-center gap-2" id="cohort-playbook-select-container">
            <span className="text-xs font-semibold text-text-primary whitespace-nowrap">Playbook:</span>
            <select
              value={selectedCohortPlaybookId}
              onChange={(e) => setSelectedCohortPlaybookId(e.target.value)}
              className="p-2 rounded-lg border border-border bg-card text-xs text-text-primary focus:border-indigo-500 outline-none transition-all min-w-[200px]"
              id="select-cohort-playbook"
            >
              <option value="">Selecione um playbook...</option>
              {availablePlaybooks.map((pb) => (
                <option key={pb.id} value={pb.id}>
                  {pb.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Conteúdo do Cohort */}
        {!selectedCohortPlaybookId ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/20 p-8 text-center" id="cohort-empty-no-select">
            <BarChart2 className="h-6 w-6 text-slate-400 mb-2 opacity-60" />
            <span className="text-xs text-text-secondary font-medium">
              Selecione um playbook acima para visualizar a análise de cohort de avanço.
            </span>
          </div>
        ) : loadingCohort ? (
          <div className="flex flex-col items-center justify-center py-12" id="cohort-loading">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500 mb-2" />
            <span className="text-xs text-text-secondary font-medium">Calculando cohort de avanço...</span>
          </div>
        ) : cohortData.length === 0 ? (
          <div className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg bg-slate-50/50 dark:bg-slate-900/20 p-8 text-center" id="cohort-empty-no-data">
            <BarChart2 className="h-6 w-6 text-slate-400 mb-2 opacity-60" />
            <span className="text-xs text-text-secondary font-medium px-4">
              Ainda não há planos iniciados com data registrada para o playbook selecionado.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs" id="cohort-table-wrapper">
            <table className="w-full text-left border-collapse text-xs" id="cohort-table">
              <thead className="bg-bg-secondary/60 text-text-secondary font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                <tr>
                  <th className="py-3 px-4 min-w-[150px] sticky left-0 bg-bg-secondary z-10 border-r border-border">
                    Coorte (Início)
                  </th>
                  {Array.from({ length: 13 }).map((_, i) => (
                    <th key={i} className="py-3 px-3 text-center min-w-[70px] border-r border-border/50 last:border-r-0 whitespace-nowrap">
                      Semana {i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cohortData.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-bg-secondary/20 transition-colors">
                    <td className="py-3 px-4 font-bold text-text-primary sticky left-0 bg-card z-10 border-r border-border whitespace-nowrap">
                      {row.weekLabel}
                    </td>
                    {row.progressByWeek.map((val, cIdx) => {
                      if (val === null) {
                        return (
                          <td key={cIdx} className="py-3 px-3 text-center border-r border-border/40 last:border-r-0 text-slate-300 dark:text-slate-700">
                            -
                          </td>
                        );
                      }
                      const roundedVal = Math.round(val);
                      const isComplete = roundedVal >= 100;

                      return (
                        <td key={cIdx} className="py-3 px-3 text-center border-r border-border/40 last:border-r-0 font-medium">
                          {isComplete ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              100%
                            </span>
                          ) : (
                            <span className="text-text-primary font-semibold">
                              {roundedVal}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaybooksAnalytics;
