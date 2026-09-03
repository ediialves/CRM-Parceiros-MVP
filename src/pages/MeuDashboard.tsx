import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchAllByIds } from '../lib/supabaseFetch';
import { buscarComCache, temCacheValido } from '../lib/dataCache';
import { 
  Users, 
  Target, 
  AlertCircle, 
  Activity, 
  CheckCircle2, 
  ClipboardList, 
  TrendingUp,
  FileText,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  TrendingDown,
  Clock,
  PauseCircle,
  Layers,
  ListTodo,
  Calendar,
  PlayCircle
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
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Badge } from '../components/ui/Badge';
import { ProgressBar } from '../components/ui/ProgressBar';

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

interface PartnerData {
  id: string;
  nome: string;
  accountancy_id: string;
  fila: 'RETENÇÃO' | 'EXPANSÃO';
  plano: string;
  percentual_engajamento: number;
  gerente_id?: string;
  plans: Array<{
    id: string;
    titulo: string;
    contexto: string | null;
    resultado: string | null;
    ativo: boolean;
    playbook_id?: string | null;
    status_conclusao?: string | null;
    data_inicio?: string | null;
    created_at?: string;
    playbooks?: {
      id: string;
      nome: string;
    } | null;
    tasks: Array<{
      id: string;
      titulo?: string;
      status: 'backlog' | 'agenda' | 'em_andamento' | 'concluida';
      created_at: string;
      data_conclusao_prevista?: string | null;
      deletada_em?: string | null;
    }>;
  }>;
}

export const MeuDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<PartnerData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Radar de Risco: controle de qual card está expandido ('expansao' | 'sem_plano' | 'queda_engajamento' | 'tarefas_atrasadas' | 'planos_parados' | 'playbooks_travados' | null)
  type RiskGroupType = 'expansao' | 'sem_plano' | 'queda_engajamento' | 'tarefas_atrasadas' | 'planos_parados' | 'playbooks_travados' | null;
  const [expandedRiskGroup, setExpandedRiskGroup] = useState<RiskGroupType>(null);
  const [engagementDrops, setEngagementDrops] = useState<Array<{
    id: string;
    accountancy_id: string;
    nome: string;
    fila: string;
    currentEng: number;
    prevEng: number;
    diff: number;
  }>>([]);
  const [taskHistoryTimestamps, setTaskHistoryTimestamps] = useState<Map<string, number>>(new Map());
  const [selectedOverdueWeekIndex, setSelectedOverdueWeekIndex] = useState<number | null>(null);
  const [portfolioEngagement, setPortfolioEngagement] = useState<{
    currentAverage: number;
    variationPP: number;
    history: Array<{ date: string; label: string; average: number }>;
  } | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setLoading(!temCacheValido(`meu-dashboard:${user.id}`));
        setError(null);

        // So a query de parceiros entra no cache: ela e o embed aninhado caro, e as
        // duas buscas seguintes derivam dos ids que ela devolve.
        const { data: partnersRawData, error: partnersError } = await buscarComCache(
          `meu-dashboard:${user.id}`,
          async () => await supabase
          .from('partners')
          .select(`
            id,
            nome,
            accountancy_id,
            fila,
            segmento,
            percentual_engajamento,
            gerente_id,
            plans(
              id,
              titulo,
              contexto,
              resultado,
              ativo,
              playbook_id,
              status_conclusao,
              data_inicio,
              created_at,
              playbooks(
                id,
                nome
              ),
              tasks(
                id,
                titulo,
                status,
                created_at,
                data_conclusao_prevista,
                deletada_em
              )
            )
          `)
          // "Meu Dashboard" e a carteira DO gerente logado - a tela so aparece no
          // menu para nao-admin (ver Sidebar). Sem este filtro a query trazia os
          // ~4.4k parceiros da base inteira, dependendo so do RLS para cortar, e
          // encostava no teto de 5000 linhas do PostgREST: na proxima importacao
          // ela passaria a truncar em silencio.
          .eq('gerente_id', user.id)
        );

        if (partnersError) throw partnersError;

        const partnersData = (partnersRawData || []) as unknown as PartnerData[];
        setPartners(partnersData);

        // Extrair IDs de tarefas de planos ativos para buscar histórico de status
        const activePlanTaskIds: string[] = [];
        for (const p of partnersData) {
          for (const pl of (p.plans || [])) {
            if (pl.ativo && pl.tasks) {
              for (const t of pl.tasks) {
                if (!t.deletada_em) {
                  activePlanTaskIds.push(t.id);
                }
              }
            }
          }
        }

        const taskHistMap = new Map<string, number>();
        if (activePlanTaskIds.length > 0) {
          try {
            const histData = await fetchAllByIds(
              'task_status_history',
              'task_id, alterado_em',
              'task_id',
              activePlanTaskIds
            );

            if (histData) {
              for (const h of histData) {
                if (!h.task_id || !h.alterado_em) continue;
                const ts = new Date(h.alterado_em).getTime();
                const prev = taskHistMap.get(h.task_id) || 0;
                if (ts > prev) {
                  taskHistMap.set(h.task_id, ts);
                }
              }
            }
          } catch (histErr) {
            console.warn('Falha ao buscar task_status_history no MeuDashboard:', histErr);
          }
        }
        setTaskHistoryTimestamps(taskHistMap);

        // Buscar snapshots para os parceiros da carteira para calcular queda de engajamento
        const partnerIds = partnersData.map(p => p.id);
        if (partnerIds.length > 0) {
          try {
            const snaps = await fetchAllByIds(
              'partner_snapshots',
              'partner_id, percentual_engajamento, imported_at, import_completo',
              'partner_id',
              partnerIds,
              q => q.order('imported_at', { ascending: false })
            );

            if (snaps) {
              // Agrupar por partner_id -> imported_at::date pegando o mais recente do dia
              const partnerDaysMap = new Map<string, Map<string, { percentual_engajamento: number; imported_at: string }>>();

              for (const s of snaps) {
                if (!s.partner_id || s.percentual_engajamento === null || s.percentual_engajamento === undefined) continue;
                const day = s.imported_at ? s.imported_at.substring(0, 10) : '';
                if (!day) continue;

                if (!partnerDaysMap.has(s.partner_id)) {
                  partnerDaysMap.set(s.partner_id, new Map());
                }
                const days = partnerDaysMap.get(s.partner_id)!;
                if (!days.has(day)) {
                  days.set(day, {
                    percentual_engajamento: Number(s.percentual_engajamento) || 0,
                    imported_at: s.imported_at
                  });
                }
              }

              // Para cada parceiro, ordenar os dias decrescente e comparar mais recente vs anterior
              const drops: Array<{
                id: string;
                accountancy_id: string;
                nome: string;
                fila: string;
                currentEng: number;
                prevEng: number;
                diff: number;
              }> = [];

              for (const p of partnersData) {
                const days = partnerDaysMap.get(p.id);
                if (!days || days.size < 2) continue;

                const sortedDays = Array.from(days.entries()).sort((a, b) => b[0].localeCompare(a[0]));
                const latestSnap = sortedDays[0][1];
                const prevSnap = sortedDays[1][1];

                const currentEng = latestSnap.percentual_engajamento;
                const prevEng = prevSnap.percentual_engajamento;
                const diff = currentEng - prevEng;

                if (diff <= -5) {
                  drops.push({
                    id: p.id,
                    accountancy_id: p.accountancy_id,
                    nome: p.nome,
                    fila: p.fila,
                    currentEng,
                    prevEng,
                    diff
                  });
                }
              }

              // Ordenar por maior queda (diff mais negativo)
              drops.sort((a, b) => a.diff - b.diff);
              setEngagementDrops(drops);

              // Agrupamento para Engajamento da Carteira nos últimos 30 dias
              const hoje = new Date();
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(hoje.getDate() - 30);
              const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().substring(0, 10);

              // Mapeia: dia -> Map<partner_id, { percentual_engajamento, imported_at }>
              const dailyPortfolioMap = new Map<string, Map<string, { percentual_engajamento: number; imported_at: string }>>();

              for (const s of snaps) {
                if (!s.partner_id || s.percentual_engajamento === null || s.percentual_engajamento === undefined) continue;
                if (s.import_completo !== true) continue;
                const day = s.imported_at ? s.imported_at.substring(0, 10) : '';
                if (!day || day < thirtyDaysAgoStr) continue;

                if (!dailyPortfolioMap.has(day)) {
                  dailyPortfolioMap.set(day, new Map());
                }
                const dayPartners = dailyPortfolioMap.get(day)!;
                const existing = dayPartners.get(s.partner_id);
                if (!existing || (s.imported_at && s.imported_at > existing.imported_at)) {
                  dayPartners.set(s.partner_id, {
                    percentual_engajamento: Number(s.percentual_engajamento) || 0,
                    imported_at: s.imported_at
                  });
                }
              }

              const totalPortfolioPartnersCount = partnerIds.length;
              const minRequiredPartners = Math.ceil(totalPortfolioPartnersCount * 0.5);

              const sortedSnapDays = Array.from(dailyPortfolioMap.keys()).sort();
              const history = sortedSnapDays
                .filter(day => {
                  const dayPartners = dailyPortfolioMap.get(day);
                  const countInDay = dayPartners ? dayPartners.size : 0;
                  // O dia é descartado do cálculo se não atingir no mínimo 50% de cobertura da carteira
                  return countInDay >= minRequiredPartners;
                })
                .map(day => {
                  const dayPartners = dailyPortfolioMap.get(day)!;
                  const vals = Array.from(dayPartners.values()).map(v => v.percentual_engajamento);
                  const avg = vals.length > 0 ? vals.reduce((acc, v) => acc + v, 0) / vals.length : 0;
                  const parts = day.split('-');
                  const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : day;
                  return {
                    date: day,
                    label,
                    average: Math.round(avg * 10) / 10
                  };
                });

              if (history.length > 0) {
                const latestAvg = history[history.length - 1].average;
                const oldestAvg = history[0].average;
                const variationPP = Math.round((latestAvg - oldestAvg) * 10) / 10;
                setPortfolioEngagement({
                  currentAverage: latestAvg,
                  variationPP,
                  history
                });
              } else {
                const fallbackAvg = partnersData.length > 0
                  ? partnersData.reduce((acc, p) => acc + (p.percentual_engajamento || 0), 0) / partnersData.length
                  : 0;
                setPortfolioEngagement({
                  currentAverage: Math.round(fallbackAvg * 10) / 10,
                  variationPP: 0,
                  history: []
                });
              }
            }
          } catch (e) {
            console.warn('Falha ao processar partner_snapshots no MeuDashboard:', e);
          }
        }
      } catch (err: any) {
        console.error('Erro ao buscar dados do Meu Dashboard:', err);
        setError(err.message || 'Erro ao carregar os dados.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id]);

  // Lista de parceiros sem plano ativo
  const allPartnersWithoutPlan = useMemo(() => {
    return partners.filter(p => {
      const activePlans = p.plans?.filter(pl => pl.ativo) || [];
      return activePlans.length === 0;
    });
  }, [partners]);

  // Lista de parceiros em EXPANSÃO sem plano ativo
  const expansaoWithoutPlan = useMemo(() => {
    return allPartnersWithoutPlan.filter(p => p.fila === 'EXPANSÃO');
  }, [allPartnersWithoutPlan]);

  // Lista de tarefas atrasadas
  const overdueTasks = useMemo(() => {
    const list: Array<{
      taskId: string;
      taskTitulo: string;
      partnerId: string;
      partnerNome: string;
      accountancy_id: string;
      fila: string;
      dataPrevista: string;
      diasAtraso: number;
    }> = [];

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeTime = hoje.getTime();

    for (const p of partners) {
      if (!p.plans) continue;
      for (const plan of p.plans) {
        if (!plan.tasks) continue;
        for (const t of plan.tasks) {
          if (t.deletada_em) continue;
          if (t.status === 'concluida') continue;
          if (!t.data_conclusao_prevista) continue;

          const prevDate = new Date(t.data_conclusao_prevista);
          prevDate.setHours(0, 0, 0, 0);
          const prevTime = prevDate.getTime();

          if (prevTime < hojeTime) {
            const diasAtraso = Math.max(1, Math.floor((hojeTime - prevTime) / (1000 * 60 * 60 * 24)));
            list.push({
              taskId: t.id,
              taskTitulo: t.titulo || 'Tarefa sem título',
              partnerId: p.id,
              partnerNome: p.nome,
              accountancy_id: p.accountancy_id,
              fila: p.fila,
              dataPrevista: t.data_conclusao_prevista,
              diasAtraso
            });
          }
        }
      }
    }

    return list.sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [partners]);

  // Listas de planos parados 45+d e playbooks travados 15+d
  const { stalledPlans45, stalledPlaybooks15 } = useMemo(() => {
    const plans45: Array<{
      planId: string;
      planTitulo: string;
      partnerId: string;
      partnerNome: string;
      accountancy_id: string;
      fila: string;
      diasSemAtividade: number;
    }> = [];

    const playbooks15: Array<{
      planId: string;
      playbookNome: string;
      partnerId: string;
      partnerNome: string;
      accountancy_id: string;
      fila: string;
      diasSemAtividade: number;
    }> = [];

    const nowTs = Date.now();

    for (const p of partners) {
      if (!p.plans) continue;
      for (const plan of p.plans) {
        if (!plan.ativo) continue;

        let maxActivityTs = 0;
        if (plan.created_at) {
          maxActivityTs = Math.max(maxActivityTs, new Date(plan.created_at).getTime());
        }
        if (plan.data_inicio) {
          maxActivityTs = Math.max(maxActivityTs, new Date(plan.data_inicio).getTime());
        }

        const activeTasks = (plan.tasks || []).filter(t => !t.deletada_em);
        for (const t of activeTasks) {
          const histTs = taskHistoryTimestamps.get(t.id);
          if (histTs) {
            maxActivityTs = Math.max(maxActivityTs, histTs);
          } else if (t.created_at) {
            maxActivityTs = Math.max(maxActivityTs, new Date(t.created_at).getTime());
          }
        }

        const diasSemAtividade = maxActivityTs > 0 
          ? Math.floor((nowTs - maxActivityTs) / (1000 * 60 * 60 * 24)) 
          : 0;

        // Planos parados 45+ dias
        if (diasSemAtividade >= 45) {
          plans45.push({
            planId: plan.id,
            planTitulo: plan.titulo || 'Plano sem título',
            partnerId: p.id,
            partnerNome: p.nome,
            accountancy_id: p.accountancy_id,
            fila: p.fila,
            diasSemAtividade
          });
        }

        // Playbooks travados (playbook_id not null e dias >= 15)
        if (plan.playbook_id && diasSemAtividade >= 15) {
          playbooks15.push({
            planId: plan.id,
            playbookNome: plan.playbooks?.nome || plan.titulo || 'Playbook',
            partnerId: p.id,
            partnerNome: p.nome,
            accountancy_id: p.accountancy_id,
            fila: p.fila,
            diasSemAtividade
          });
        }
      }
    }

    plans45.sort((a, b) => b.diasSemAtividade - a.diasSemAtividade);
    playbooks15.sort((a, b) => b.diasSemAtividade - a.diasSemAtividade);

    return { stalledPlans45: plans45, stalledPlaybooks15: playbooks15 };
  }, [partners, taskHistoryTimestamps]);

  // Seção Kanban: Playbooks automáticos — consolidado (4 colunas baseadas em movimentação real de tarefas)
  const consolidatedPlaybooksKanban = useMemo(() => {
    const naoIniciado: Array<{
      planId: string;
      partnerNome: string;
      accountancy_id: string;
      playbookNome: string;
      progresso: number;
      diasSemAtividade: number;
      isAutomatic: boolean;
    }> = [];

    const emAndamento: Array<{
      planId: string;
      partnerNome: string;
      accountancy_id: string;
      playbookNome: string;
      progresso: number;
      diasSemAtividade: number;
      isAutomatic: boolean;
    }> = [];

    const parado: Array<{
      planId: string;
      partnerNome: string;
      accountancy_id: string;
      playbookNome: string;
      progresso: number;
      diasSemAtividade: number;
      isAutomatic: boolean;
    }> = [];

    const concluido: Array<{
      planId: string;
      partnerNome: string;
      accountancy_id: string;
      playbookNome: string;
      progresso: number;
      diasSemAtividade: number;
      isAutomatic: boolean;
    }> = [];

    const nowTs = Date.now();

    for (const p of partners) {
      if (!p.plans) continue;
      for (const plan of p.plans) {
        let maxHistoryTs = 0;
        let hasAnyTaskStatusHistory = false;

        const planTasks = (plan.tasks || []).filter(t => !t.deletada_em);
        for (const t of planTasks) {
          const histTs = taskHistoryTimestamps.get(t.id);
          if (histTs) {
            hasAnyTaskStatusHistory = true;
            maxHistoryTs = Math.max(maxHistoryTs, histTs);
          }
        }

        // Se houver histórico de movimentação real, usar o maior timestamp de task_status_history.
        // Se NÃO houver nenhuma linha em task_status_history para nenhuma task do plano, usar plan.created_at (ou data_inicio).
        let activityBenchmarkTs = 0;
        if (hasAnyTaskStatusHistory && maxHistoryTs > 0) {
          activityBenchmarkTs = maxHistoryTs;
        } else {
          if (plan.created_at) {
            activityBenchmarkTs = Math.max(activityBenchmarkTs, new Date(plan.created_at).getTime());
          }
          if (plan.data_inicio) {
            activityBenchmarkTs = Math.max(activityBenchmarkTs, new Date(plan.data_inicio).getTime());
          }
        }

        const diasSemMovimentacao = activityBenchmarkTs > 0 
          ? Math.floor((nowTs - activityBenchmarkTs) / (1000 * 60 * 60 * 24)) 
          : 0;

        const completedTasksCount = planTasks.filter(t => t.status === 'concluida').length;
        const progresso = planTasks.length > 0 ? (completedTasksCount / planTasks.length) * 100 : 0;
        const playbookNome = plan.playbooks?.nome || plan.titulo || 'Playbook';

        const item = {
          planId: plan.id,
          partnerNome: p.nome,
          accountancy_id: p.accountancy_id,
          playbookNome,
          progresso: Math.round(progresso),
          diasSemAtividade: diasSemMovimentacao,
          isAutomatic: plan.playbook_id != null
        };

        // Ordem de avaliação: Concluído → Parado → Não iniciado → Em andamento
        // 1. Concluído: plan.status_conclusao preenchido OU plan.ativo === false
        if (plan.status_conclusao || plan.ativo === false) {
          concluido.push(item);
        }
        // 2. Parado: plan.ativo = true E dias_sem_movimentacao >= 15 (prevalece sobre Não iniciado)
        else if (diasSemMovimentacao >= 15) {
          parado.push(item);
        }
        // 3. Não iniciado: plan.ativo = true E dias_sem_movimentacao < 15 E nenhuma linha em task_status_history
        else if (!hasAnyTaskStatusHistory) {
          naoIniciado.push(item);
        }
        // 4. Em andamento: plan.ativo = true E dias_sem_movimentacao < 15 E existe ao menos 1 linha em task_status_history
        else {
          emAndamento.push(item);
        }
      }
    }

    return { naoIniciado, emAndamento, parado, concluido };
  }, [partners, taskHistoryTimestamps]);

  // Estado para expandir a lista completa de "O que fazer agora"
  const [showAllActionItems, setShowAllActionItems] = useState(false);

  // Lista unificada de ações prioritárias ("O que fazer agora")
  // Ordem fixa de categorias:
  // 1. Expansão sem plano
  // 2. Queda de engajamento (maior queda primeiro)
  // 3. Tarefa atrasada (mais dias de atraso primeiro)
  // 4. Plano parado (mais dias parado primeiro)
  // 5. Playbook travado (mais dias travado primeiro)
  const unifiedActionItems = useMemo(() => {
    const items: Array<{
      id: string;
      category: 'expansao_sem_plano' | 'queda_engajamento' | 'tarefa_atrasada' | 'plano_parado' | 'playbook_travado';
      badgeLabel: string;
      badgeVariant: 'danger' | 'warning' | 'primary';
      badgeClasses: string;
      partnerNome: string;
      accountancy_id: string;
      detailText?: string;
    }> = [];

    // 1. Expansão sem plano
    for (const p of expansaoWithoutPlan) {
      items.push({
        id: `exp_${p.id}`,
        category: 'expansao_sem_plano',
        badgeLabel: 'Expansão · sem plano',
        badgeVariant: 'danger',
        badgeClasses: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800',
        partnerNome: p.nome,
        accountancy_id: p.accountancy_id,
        detailText: 'Sem nenhum plano ativo cadastrado'
      });
    }

    // 2. Queda de engajamento (já ordenado pela maior queda)
    for (const drop of engagementDrops) {
      items.push({
        id: `drop_${drop.id}`,
        category: 'queda_engajamento',
        badgeLabel: `Engajamento ${drop.diff > 0 ? `+${drop.diff}` : drop.diff}pp`,
        badgeVariant: 'danger',
        badgeClasses: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-800',
        partnerNome: drop.nome,
        accountancy_id: drop.accountancy_id,
        detailText: `${drop.prevEng}% → ${drop.currentEng}% (${drop.diff}pp)`
      });
    }

    // 3. Tarefas atrasadas (já ordenado pelos maiores atrasos)
    for (const ot of overdueTasks) {
      items.push({
        id: `task_${ot.taskId}`,
        category: 'tarefa_atrasada',
        badgeLabel: `Task atrasada ${ot.diasAtraso}d`,
        badgeVariant: 'danger',
        badgeClasses: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-400 border border-orange-200 dark:border-orange-800',
        partnerNome: ot.partnerNome,
        accountancy_id: ot.accountancy_id,
        detailText: ot.taskTitulo
      });
    }

    // 4. Planos parados 45+d (já ordenado pelos maiores tempos)
    for (const sp of stalledPlans45) {
      items.push({
        id: `plan_${sp.planId}`,
        category: 'plano_parado',
        badgeLabel: `Plano parado ${sp.diasSemAtividade}d`,
        badgeVariant: 'danger',
        badgeClasses: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400 border border-purple-200 dark:border-purple-800',
        partnerNome: sp.partnerNome,
        accountancy_id: sp.accountancy_id,
        detailText: sp.planTitulo
      });
    }

    // 5. Playbooks travados 15+d (já ordenado pelos maiores tempos)
    for (const pb of stalledPlaybooks15) {
      items.push({
        id: `pb_${pb.planId}`,
        category: 'playbook_travado',
        badgeLabel: `Playbook travado ${pb.diasSemAtividade}d`,
        badgeVariant: 'warning',
        badgeClasses: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
        partnerNome: pb.partnerNome,
        accountancy_id: pb.accountancy_id,
        detailText: pb.playbookNome
      });
    }

    return items;
  }, [expansaoWithoutPlan, engagementDrops, overdueTasks, stalledPlans45, stalledPlaybooks15]);

  // Seção 1: Cálculos de Resumo
  const stats = useMemo(() => {
    const totalPartners = partners.length;
    
    // Opção A: Parceiros com pelo menos 1 plano ativo onde playbook_id != null
    const comPlaybook = partners.filter(p => {
      const activePlans = p.plans?.filter(pl => pl.ativo) || [];
      return activePlans.some(pl => pl.playbook_id != null);
    }).length;

    const semPlaybook = totalPartners - comPlaybook;

    return {
      totalPartners,
      comPlaybook,
      semPlaybook
    };
  }, [partners]);

  // Seção — Qualidade dos planos
  const qualityData = useMemo(() => {
    // Obter todos os planos ativos
    const activePlans = partners.flatMap(p => p.plans?.filter(pl => pl.ativo) || []);
    const totalActivePlans = activePlans.length;

    const withContext = activePlans.filter(p => p.contexto && p.contexto.trim() !== '').length;
    const withResult = activePlans.filter(p => p.resultado && p.resultado.trim() !== '').length;

    const percentContext = totalActivePlans > 0 ? Math.round((withContext / totalActivePlans) * 100) : 0;
    const percentResult = totalActivePlans > 0 ? Math.round((withResult / totalActivePlans) * 100) : 0;

    return {
      totalActivePlans,
      withContext,
      withResult,
      percentContext,
      percentResult
    };
  }, [partners]);

  // Agrupamento de tarefas atrasadas por semana (últimas 8 semanas + Anteriores)
  const overdueWeeklyBuckets = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const currentDay = hoje.getDay(); // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
    const distToMon = currentDay === 0 ? -6 : 1 - currentDay;
    const currentMonday = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + distToMon, 0, 0, 0, 0);

    // Início da semana mais antiga das 8 semanas (semana -7)
    const oldestWeekStart = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - 7 * 7, 0, 0, 0, 0);

    const parseDateToLocalMidnight = (dateStr?: string | null) => {
      if (!dateStr) return new Date();
      const cleanStr = dateStr.split('T')[0];
      const parts = cleanStr.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0, 0);
      }
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const formatDDMM = (d: Date) => {
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Coluna 1: Anteriores (tarefas com data prevista anterior à janela de 8 semanas)
    const anterioresTasks = overdueTasks.filter(t => {
      const taskDate = parseDateToLocalMidnight(t.dataPrevista);
      return taskDate.getTime() < oldestWeekStart.getTime();
    });

    const buckets: Array<{
      index: number;
      key: string;
      label: string;
      fullLabel: string;
      startDate?: Date;
      endDate?: Date;
      tasks: typeof overdueTasks;
    }> = [
      {
        index: 0,
        key: 'anteriores',
        label: 'Anteriores',
        fullLabel: `Anteriores a ${formatDDMM(oldestWeekStart)}`,
        tasks: anterioresTasks
      }
    ];

    // Colunas 2 a 9: 8 semanas cronológicas (da semana -7 até semana 0 / corrente)
    for (let i = 0; i < 8; i++) {
      const offset = 7 - i;
      const weekStart = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() - offset * 7, 0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6, 23, 59, 59, 999);
      const nextWeekStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7, 0, 0, 0, 0);

      const weekTasks = overdueTasks.filter(t => {
        const taskTime = parseDateToLocalMidnight(t.dataPrevista).getTime();
        return taskTime >= weekStart.getTime() && taskTime < nextWeekStart.getTime();
      });

      const label = formatDDMM(weekStart);
      const fullLabel = offset === 0 
        ? `Semana Atual (${label} a ${formatDDMM(weekEnd)})`
        : `Semana de ${label} a ${formatDDMM(weekEnd)}`;

      buckets.push({
        index: i + 1,
        key: `week-${offset}`,
        label,
        fullLabel,
        startDate: weekStart,
        endDate: weekEnd,
        tasks: weekTasks
      });
    }

    return buckets;
  }, [overdueTasks]);

  const overdueWeeklyChartData = useMemo(() => {
    return {
      labels: overdueWeeklyBuckets.map(b => b.label),
      datasets: [
        {
          label: 'Tarefas Atrasadas',
          data: overdueWeeklyBuckets.map(b => b.tasks.length),
          backgroundColor: overdueWeeklyBuckets.map((_, idx) => 
            selectedOverdueWeekIndex === idx ? '#dc2626' : (idx === 0 ? '#ea580c' : '#ef4444')
          ),
          hoverBackgroundColor: '#b91c1c',
          borderRadius: 4,
          borderWidth: overdueWeeklyBuckets.map((_, idx) => 
            selectedOverdueWeekIndex === idx ? 2 : 0
          ),
          borderColor: '#991b1b',
        }
      ]
    };
  }, [overdueWeeklyBuckets, selectedOverdueWeekIndex]);

  const overdueWeeklyChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const clickedIndex = elements[0].index;
        setSelectedOverdueWeekIndex(prev => (prev === clickedIndex ? null : clickedIndex));
      }
    },
    onHover: (event: any, chartElement: any[]) => {
      if (event?.native?.target) {
        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
      }
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: (items: any[]) => {
            if (items.length > 0) {
              const idx = items[0].dataIndex;
              return overdueWeeklyBuckets[idx]?.fullLabel || items[0].label;
            }
            return '';
          },
          label: (context: any) => {
            const count = context.parsed.y;
            return ` ${count} ${count === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'} (clique para detalhar)`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 11, weight: 'bold' as const }
        }
      },
      y: {
        grid: { color: 'rgba(148, 163, 184, 0.15)' },
        ticks: { stepSize: 1, precision: 0 },
        beginAtZero: true
      }
    }
  }), [overdueWeeklyBuckets]);

  const overdueWeeklyChartPlugins = useMemo(() => [
    {
      id: 'overdueBarLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx, scales } = chart;
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        const datasets = chart.data.datasets;
        if (datasets.length === 0) return;

        const dataLength = datasets[0].data.length;
        const meta0 = chart.getDatasetMeta(0);

        for (let i = 0; i < dataLength; i++) {
          const val = datasets[0].data[i] || 0;
          if (val > 0 && meta0.data[i]) {
            const x = meta0.data[i].x;
            const y = scales.y.getPixelForValue(val);
            ctx.fillText(String(val), x, y - 4);
          }
        }
        ctx.restore();
      }
    }
  ], []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-red-50 text-red-600 rounded-xl border border-red-200">
        <AlertCircle className="w-8 h-8 mb-2" />
        <p className="font-semibold">Erro inesperado</p>
        <p className="text-sm opacity-80">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">
          Bom dia, {user?.nome || 'Gerente'}
        </h1>
        <p className="text-sm text-text-secondary">
          Você tem {stats.totalPartners} parceiro{stats.totalPartners !== 1 ? 's' : ''} na sua carteira
        </p>
      </header>

      {/* Radar de Risco */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-text-primary">Radar de Risco</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Expansão sem plano */}
          <div
            onClick={() => setExpandedRiskGroup(expandedRiskGroup === 'expansao' ? null : 'expansao')}
            className={`bg-surface p-5 rounded-xl border transition-all cursor-pointer select-none shadow-sm ${
              expandedRiskGroup === 'expansao'
                ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/10'
                : 'border-border hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Expansão sem plano
                  </span>
                  <Badge variant="danger" size="sm">Crítico</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary">
                  {expansaoWithoutPlan.length}
                </div>
                <p className="text-xs text-text-secondary">
                  Parceiros da fila EXPANSÃO que estão sem nenhum playbook ativo
                </p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{expandedRiskGroup === 'expansao' ? 'Ocultar parceiros' : 'Ver parceiros afetados'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedRiskGroup === 'expansao' ? 'rotate-180 text-red-500' : ''}`} />
            </div>
          </div>

          {/* Card 2: Sem plano ativo */}
          <div 
            onClick={() => setExpandedRiskGroup(expandedRiskGroup === 'sem_plano' ? null : 'sem_plano')}
            className={`bg-surface p-5 rounded-xl border transition-all cursor-pointer select-none shadow-sm ${
              expandedRiskGroup === 'sem_plano' 
                ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/10' 
                : 'border-border hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Sem plano ativo
                  </span>
                  <Badge variant="warning" size="sm">Atenção</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary">
                  {allPartnersWithoutPlan.length}
                </div>
                <p className="text-xs text-text-secondary">
                  Total de parceiros da sua carteira (todas as filas) sem playbook ativo
                </p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{expandedRiskGroup === 'sem_plano' ? 'Ocultar parceiros' : 'Ver parceiros afetados'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedRiskGroup === 'sem_plano' ? 'rotate-180 text-amber-500' : ''}`} />
            </div>
          </div>

          {/* Card 3: Queda de engajamento */}
          <div 
            onClick={() => setExpandedRiskGroup(expandedRiskGroup === 'queda_engajamento' ? null : 'queda_engajamento')}
            className={`bg-surface p-5 rounded-xl border transition-all cursor-pointer select-none shadow-sm ${
              expandedRiskGroup === 'queda_engajamento' 
                ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/10' 
                : 'border-border hover:border-rose-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Queda de engajamento
                  </span>
                  <Badge variant="danger" size="sm">≥ 5pp</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary">
                  {engagementDrops.length}
                </div>
                <p className="text-xs text-text-secondary">
                  Parceiros com queda de engajamento de 5pp ou mais vs snapshot anterior
                </p>
              </div>
              <div className="p-3 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
                <TrendingDown className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{expandedRiskGroup === 'queda_engajamento' ? 'Ocultar parceiros' : 'Ver parceiros afetados'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedRiskGroup === 'queda_engajamento' ? 'rotate-180 text-rose-500' : ''}`} />
            </div>
          </div>

          {/* Card 4: Tarefas atrasadas */}
          <div 
            onClick={() => setExpandedRiskGroup(expandedRiskGroup === 'tarefas_atrasadas' ? null : 'tarefas_atrasadas')}
            className={`bg-surface p-5 rounded-xl border transition-all cursor-pointer select-none shadow-sm ${
              expandedRiskGroup === 'tarefas_atrasadas' 
                ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/10' 
                : 'border-border hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Tarefas atrasadas
                  </span>
                  <Badge variant="danger" size="sm">Atrasadas</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary">
                  {overdueTasks.length}
                </div>
                <p className="text-xs text-text-secondary">
                  Tarefas abertas com data de conclusão prevista expirada
                </p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{expandedRiskGroup === 'tarefas_atrasadas' ? 'Ocultar tarefas' : 'Ver tarefas atrasadas'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedRiskGroup === 'tarefas_atrasadas' ? 'rotate-180 text-red-500' : ''}`} />
            </div>
          </div>

          {/* Card 5: Planos parados 45+d */}
          <div 
            onClick={() => setExpandedRiskGroup(expandedRiskGroup === 'planos_parados' ? null : 'planos_parados')}
            className={`bg-surface p-5 rounded-xl border transition-all cursor-pointer select-none shadow-sm ${
              expandedRiskGroup === 'planos_parados' 
                ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/10' 
                : 'border-border hover:border-rose-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Planos parados 45+d
                  </span>
                  <Badge variant="danger" size="sm">45+ dias</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary">
                  {stalledPlans45.length}
                </div>
                <p className="text-xs text-text-secondary">
                  Planos ativos sem nenhuma alteração ou atividade há mais de 45 dias
                </p>
              </div>
              <div className="p-3 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
                <PauseCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{expandedRiskGroup === 'planos_parados' ? 'Ocultar planos' : 'Ver planos parados'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedRiskGroup === 'planos_parados' ? 'rotate-180 text-rose-500' : ''}`} />
            </div>
          </div>

          {/* Card 6: Playbooks travados */}
          <div 
            onClick={() => setExpandedRiskGroup(expandedRiskGroup === 'playbooks_travados' ? null : 'playbooks_travados')}
            className={`bg-surface p-5 rounded-xl border transition-all cursor-pointer select-none shadow-sm ${
              expandedRiskGroup === 'playbooks_travados' 
                ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/10' 
                : 'border-border hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Playbooks travados
                  </span>
                  <Badge variant="warning" size="sm">15+ dias</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary">
                  {stalledPlaybooks15.length}
                </div>
                <p className="text-xs text-text-secondary">
                  Playbooks em execução sem movimentação recente há mais de 15 dias
                </p>
              </div>
              <div className="p-3 bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
                <Layers className="w-6 h-6" />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-text-secondary font-medium">
              <span>{expandedRiskGroup === 'playbooks_travados' ? 'Ocultar playbooks' : 'Ver playbooks travados'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedRiskGroup === 'playbooks_travados' ? 'rotate-180 text-amber-500' : ''}`} />
            </div>
          </div>
        </div>

        {/* Drilldown expandido compartilhado */}
        {expandedRiskGroup && (
          <div className="bg-surface rounded-xl border border-border p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary">
                  {expandedRiskGroup === 'expansao' && `Parceiros em Expansão sem plano (${expansaoWithoutPlan.length})`}
                  {expandedRiskGroup === 'sem_plano' && `Todos os parceiros sem plano ativo (${allPartnersWithoutPlan.length})`}
                  {expandedRiskGroup === 'queda_engajamento' && `Parceiros com queda de engajamento (${engagementDrops.length})`}
                  {expandedRiskGroup === 'tarefas_atrasadas' && `Tarefas atrasadas (${overdueTasks.length})`}
                  {expandedRiskGroup === 'planos_parados' && `Planos parados 45+ dias (${stalledPlans45.length})`}
                  {expandedRiskGroup === 'playbooks_travados' && `Playbooks travados 15+ dias (${stalledPlaybooks15.length})`}
                </h3>
                <span className="text-xs text-text-secondary">
                  (Clique em uma linha para abrir a página do parceiro)
                </span>
              </div>
              <button 
                onClick={() => setExpandedRiskGroup(null)}
                className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Fechar
              </button>
            </div>

            {expandedRiskGroup === 'queda_engajamento' && (
              engagementDrops.length === 0 ? (
                <p className="text-xs text-text-secondary py-4 text-center italic">
                  Nenhum parceiro com queda de engajamento recente identificada.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto pr-1">
                  {engagementDrops.map(p => (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/parceiros/${p.accountancy_id}`)}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                          {p.accountancy_id}
                        </span>
                        <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                          {p.nome}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded">
                          {p.diff > 0 ? `+${p.diff.toFixed(0)}pp` : `${p.diff.toFixed(0)}pp`}
                        </span>
                        <Badge 
                          variant={p.fila === 'RETENÇÃO' ? 'danger' : 'primary'}
                          size="sm"
                        >
                          {p.fila}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {expandedRiskGroup === 'tarefas_atrasadas' && (
              overdueTasks.length === 0 ? (
                <p className="text-xs text-text-secondary py-4 text-center italic">
                  Nenhuma tarefa atrasada encontrada.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto pr-1">
                  {overdueTasks.map(item => (
                    <div
                      key={item.taskId}
                      onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                          {item.accountancy_id}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                            {item.taskTitulo}
                          </span>
                          <span className="text-xs text-text-secondary truncate">
                            {item.partnerNome}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">
                          {item.diasAtraso}d de atraso
                        </span>
                        <Badge 
                          variant={item.fila === 'RETENÇÃO' ? 'danger' : 'primary'}
                          size="sm"
                        >
                          {item.fila}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {expandedRiskGroup === 'planos_parados' && (
              stalledPlans45.length === 0 ? (
                <p className="text-xs text-text-secondary py-4 text-center italic">
                  Nenhum plano parado há 45 dias ou mais.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto pr-1">
                  {stalledPlans45.map(item => (
                    <div
                      key={item.planId}
                      onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                          {item.accountancy_id}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                            {item.planTitulo}
                          </span>
                          <span className="text-xs text-text-secondary truncate">
                            {item.partnerNome}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded">
                          {item.diasSemAtividade}d sem atividade
                        </span>
                        <Badge 
                          variant={item.fila === 'RETENÇÃO' ? 'danger' : 'primary'}
                          size="sm"
                        >
                          {item.fila}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {expandedRiskGroup === 'playbooks_travados' && (
              stalledPlaybooks15.length === 0 ? (
                <p className="text-xs text-text-secondary py-4 text-center italic">
                  Nenhum playbook travado há 15 dias ou mais.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto pr-1">
                  {stalledPlaybooks15.map(item => (
                    <div
                      key={item.planId}
                      onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                          {item.accountancy_id}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                            {item.playbookNome}
                          </span>
                          <span className="text-xs text-text-secondary truncate">
                            {item.partnerNome}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded">
                          {item.diasSemAtividade}d sem atividade
                        </span>
                        <Badge 
                          variant={item.fila === 'RETENÇÃO' ? 'danger' : 'primary'}
                          size="sm"
                        >
                          {item.fila}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {(expandedRiskGroup === 'expansao' || expandedRiskGroup === 'sem_plano') && (
              ((expandedRiskGroup === 'expansao' ? expansaoWithoutPlan : allPartnersWithoutPlan).length === 0) ? (
                <p className="text-xs text-text-secondary py-4 text-center italic">
                  Nenhum parceiro encontrado neste grupo de risco.
                </p>
              ) : (
                <div className="divide-y divide-border max-h-80 overflow-y-auto pr-1">
                  {(expandedRiskGroup === 'expansao' ? expansaoWithoutPlan : allPartnersWithoutPlan).map(p => (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/parceiros/${p.accountancy_id}`)}
                      className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                          {p.accountancy_id}
                        </span>
                        <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                          {p.nome}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <Badge 
                          variant={p.fila === 'RETENÇÃO' ? 'danger' : 'primary'}
                          size="sm"
                        >
                          {p.fila}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* Seção Nova: O que fazer agora (Prioridades unificadas dos 5 grupos críticos de risco) */}
      <section className="bg-surface rounded-xl border border-border p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-text-primary">O que fazer agora</h2>
            <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
              {unifiedActionItems.length} {unifiedActionItems.length === 1 ? 'ação prioritária' : 'ações prioritárias'}
            </span>
          </div>
          <span className="text-xs text-text-secondary">
            Itens mais urgentes ranqueados por severidade e categoria
          </span>
        </div>

        {unifiedActionItems.length === 0 ? (
          <div className="py-6 text-center text-xs text-text-secondary italic">
            Nenhuma ação prioritária pendente no momento. Excelente trabalho!
          </div>
        ) : (
          <div className="space-y-3">
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-background">
              {(showAllActionItems ? unifiedActionItems : unifiedActionItems.slice(0, 5)).map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                  className="flex items-center justify-between py-3 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-text-secondary/60 w-5 shrink-0">
                      #{index + 1}
                    </span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${item.badgeClasses}`}>
                      {item.badgeLabel}
                    </span>
                    <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                      {item.accountancy_id}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                        {item.partnerNome}
                      </span>
                      {item.detailText && (
                        <span className="text-xs text-text-secondary truncate">
                          {item.detailText}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                      Abrir parceiro
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>

            {unifiedActionItems.length > 5 && (
              <div className="flex justify-center pt-1">
                <button
                  onClick={() => setShowAllActionItems(!showAllActionItems)}
                  className="text-xs font-semibold text-primary hover:text-primary/80 hover:underline flex items-center gap-1 py-1 px-3 rounded transition-colors"
                >
                  {showAllActionItems 
                    ? 'Mostrar apenas os 5 primeiros' 
                    : `Ver lista completa (${unifiedActionItems.length})`}
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllActionItems ? 'rotate-180' : ''}`} />
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Seção: Tarefas atrasadas por semana (últimas 8 semanas + Anteriores) */}
      <section className="bg-surface rounded-xl border border-border p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-bold text-text-primary">Tarefas atrasadas por semana</h2>
            <span className="text-xs bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-semibold px-2 py-0.5 rounded-full">
              {overdueTasks.length} {overdueTasks.length === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}
            </span>
          </div>
          <span className="text-xs text-text-secondary">
            {selectedOverdueWeekIndex !== null 
              ? 'Clique na mesma barra ou em "Fechar lista" para ocultar os detalhes' 
              : 'Clique em uma barra para filtrar e detalhar as tarefas'}
          </span>
        </div>

        <div className="h-64 w-full">
          <Bar 
            data={overdueWeeklyChartData} 
            options={overdueWeeklyChartOptions} 
            plugins={overdueWeeklyChartPlugins} 
          />
        </div>

        {/* Drilldown detalhado da semana selecionada */}
        {selectedOverdueWeekIndex !== null && (() => {
          const selectedBucket = overdueWeeklyBuckets[selectedOverdueWeekIndex];
          if (!selectedBucket) return null;

          return (
            <div className="mt-5 pt-4 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    {selectedBucket.fullLabel}
                  </span>
                  <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-text-secondary px-2 py-0.5 rounded-full">
                    {selectedBucket.tasks.length} {selectedBucket.tasks.length === 1 ? 'tarefa' : 'tarefas'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOverdueWeekIndex(null)}
                  className="text-xs font-medium text-text-secondary hover:text-text-primary hover:underline cursor-pointer"
                >
                  Fechar lista
                </button>
              </div>

              {selectedBucket.tasks.length === 0 ? (
                <div className="py-6 text-center text-xs text-text-secondary italic">
                  Nenhuma tarefa atrasada com data prevista nesta semana.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-background max-h-80 overflow-y-auto">
                  {selectedBucket.tasks.map((task) => (
                    <div
                      key={task.taskId}
                      onClick={() => navigate(`/parceiros/${task.accountancy_id}`)}
                      className="flex items-center justify-between py-2.5 px-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs text-text-secondary bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded shrink-0">
                          {task.accountancy_id}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                            {task.taskTitulo}
                          </span>
                          <span className="text-xs text-text-secondary truncate">
                            Parceiro: <span className="font-medium text-text-primary">{task.partnerNome}</span>
                            {task.dataPrevista && (
                              <> • Previsto: {task.dataPrevista.split('T')[0].split('-').reverse().join('/')}</>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded">
                          {task.diasAtraso}d de atraso
                        </span>
                        <Badge 
                          variant={task.fila === 'RETENÇÃO' ? 'danger' : 'primary'}
                          size="sm"
                        >
                          {task.fila}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-text-secondary/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* Visão geral da carteira — 6 cards unificados */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 1. Total Parceiros */}
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <span className="text-2xl sm:text-3xl font-bold text-text-primary">{stats.totalPartners}</span>
          <span className="text-xs text-text-secondary font-medium mt-1">Total Parceiros</span>
        </div>

        {/* 2. Com Playbook */}
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <span className="text-2xl sm:text-3xl font-bold text-text-primary">{stats.comPlaybook}</span>
          <span className="text-xs text-text-secondary font-medium mt-1">Com Playbook</span>
        </div>

        {/* 3. Sem Playbook */}
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <span className="text-2xl sm:text-3xl font-bold text-text-primary">{stats.semPlaybook}</span>
          <span className="text-xs text-text-secondary font-medium mt-1">Sem Playbook</span>
        </div>

        {/* 4. Engajamento da Carteira */}
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl sm:text-3xl font-bold text-text-primary">
              {portfolioEngagement ? `${portfolioEngagement.currentAverage}%` : '—'}
            </span>
            {portfolioEngagement && (
              <span className={`text-[11px] font-semibold flex items-center ${
                portfolioEngagement.variationPP > 0 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : portfolioEngagement.variationPP < 0 
                  ? 'text-red-600 dark:text-red-400' 
                  : 'text-text-secondary'
              }`}>
                {portfolioEngagement.variationPP > 0 ? `+${portfolioEngagement.variationPP}` : portfolioEngagement.variationPP} pp
              </span>
            )}
          </div>
          <span className="text-xs text-text-secondary font-medium mt-1">Engajamento da Carteira</span>
        </div>

        {/* 5. Contexto Preenchido */}
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <span className="text-2xl sm:text-3xl font-bold text-text-primary">{qualityData.percentContext}%</span>
          <span className="text-xs text-text-secondary font-medium mt-1">Contexto Preenchido</span>
        </div>

        {/* 6. Resultado Preenchido */}
        <div className="bg-surface p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between">
          <span className="text-2xl sm:text-3xl font-bold text-text-primary">{qualityData.percentResult}%</span>
          <span className="text-xs text-text-secondary font-medium mt-1">Resultado Preenchido</span>
        </div>
      </div>



      {/* Seção — Planos e playbooks consolidados (Kanban 4 colunas) */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
              Planos e playbooks consolidados
            </h3>
          </div>
          <span className="text-xs text-text-secondary font-medium">
            Total: {consolidatedPlaybooksKanban.naoIniciado.length + consolidatedPlaybooksKanban.emAndamento.length + consolidatedPlaybooksKanban.parado.length + consolidatedPlaybooksKanban.concluido.length} planos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Coluna 1: Não iniciado */}
          <div className="bg-gray-50/70 dark:bg-background/40 rounded-xl border border-border flex flex-col min-h-[220px]">
            <div className="p-3 border-b border-border flex flex-col gap-1 bg-gray-100/50 dark:bg-background/60 rounded-t-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Não iniciado
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                  {consolidatedPlaybooksKanban.naoIniciado.length}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                Criado, nenhuma tarefa executada ainda
              </p>
            </div>
            <div className="p-2.5 flex flex-col gap-2 overflow-y-auto max-h-[380px] flex-1">
              {consolidatedPlaybooksKanban.naoIniciado.map(item => (
                <div
                  key={item.planId}
                  onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                  className="bg-surface p-3 rounded-lg border border-border hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-text-primary truncate">{item.partnerNome}</span>
                    <span className="text-[10px] font-mono text-text-secondary whitespace-nowrap">({item.accountancy_id})</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-secondary truncate font-medium">
                      {item.playbookNome}
                    </span>
                    {item.isAutomatic ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                        Playbook
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 shrink-0">
                        Plano manual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-text-secondary">
                    <span>Progresso: {item.progresso}%</span>
                    <span>{item.diasSemAtividade}d sem atividade</span>
                  </div>
                </div>
              ))}
              {consolidatedPlaybooksKanban.naoIniciado.length === 0 && (
                <div className="py-8 text-center text-xs text-text-secondary italic">
                  Nenhum parceiro nesta etapa
                </div>
              )}
            </div>
          </div>

          {/* Coluna 2: Em andamento */}
          <div className="bg-gray-50/70 dark:bg-background/40 rounded-xl border border-border flex flex-col min-h-[220px]">
            <div className="p-3 border-b border-border flex flex-col gap-1 bg-gray-100/50 dark:bg-background/60 rounded-t-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Em andamento
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {consolidatedPlaybooksKanban.emAndamento.length}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                Teve movimentação de tarefa nos últimos 15 dias
              </p>
            </div>
            <div className="p-2.5 flex flex-col gap-2 overflow-y-auto max-h-[380px] flex-1">
              {consolidatedPlaybooksKanban.emAndamento.map(item => (
                <div
                  key={item.planId}
                  onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                  className="bg-surface p-3 rounded-lg border border-border hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-text-primary truncate">{item.partnerNome}</span>
                    <span className="text-[10px] font-mono text-text-secondary whitespace-nowrap">({item.accountancy_id})</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-secondary truncate font-medium">
                      {item.playbookNome}
                    </span>
                    {item.isAutomatic ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                        Playbook
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 shrink-0">
                        Plano manual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-text-secondary">
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Progresso: {item.progresso}%</span>
                    <span>{item.diasSemAtividade}d sem atividade</span>
                  </div>
                </div>
              ))}
              {consolidatedPlaybooksKanban.emAndamento.length === 0 && (
                <div className="py-8 text-center text-xs text-text-secondary italic">
                  Nenhum parceiro nesta etapa
                </div>
              )}
            </div>
          </div>

          {/* Coluna 3: Parado */}
          <div className="bg-gray-50/70 dark:bg-background/40 rounded-xl border border-border flex flex-col min-h-[220px]">
            <div className="p-3 border-b border-border flex flex-col gap-1 bg-gray-100/50 dark:bg-background/60 rounded-t-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Parado
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {consolidatedPlaybooksKanban.parado.length}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                15+ dias sem nenhuma movimentação de tarefa
              </p>
            </div>
            <div className="p-2.5 flex flex-col gap-2 overflow-y-auto max-h-[380px] flex-1">
              {consolidatedPlaybooksKanban.parado.map(item => (
                <div
                  key={item.planId}
                  onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                  className="bg-surface p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-700 hover:shadow-sm transition-all cursor-pointer flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-text-primary truncate">{item.partnerNome}</span>
                    <span className="text-[10px] font-mono text-text-secondary whitespace-nowrap">({item.accountancy_id})</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-secondary truncate font-medium">
                      {item.playbookNome}
                    </span>
                    {item.isAutomatic ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                        Playbook
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 shrink-0">
                        Plano manual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]">
                    <span className="text-text-secondary">Progresso: {item.progresso}%</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{item.diasSemAtividade}d parado</span>
                  </div>
                </div>
              ))}
              {consolidatedPlaybooksKanban.parado.length === 0 && (
                <div className="py-8 text-center text-xs text-text-secondary italic">
                  Nenhum parceiro nesta etapa
                </div>
              )}
            </div>
          </div>

          {/* Coluna 4: Concluído */}
          <div className="bg-gray-50/70 dark:bg-background/40 rounded-xl border border-border flex flex-col min-h-[220px]">
            <div className="p-3 border-b border-border flex flex-col gap-1 bg-gray-100/50 dark:bg-background/60 rounded-t-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  Concluído
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                  {consolidatedPlaybooksKanban.concluido.length}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary">
                Plano finalizado
              </p>
            </div>
            <div className="p-2.5 flex flex-col gap-2 overflow-y-auto max-h-[380px] flex-1">
              {consolidatedPlaybooksKanban.concluido.map(item => (
                <div
                  key={item.planId}
                  onClick={() => navigate(`/parceiros/${item.accountancy_id}`)}
                  className="bg-surface p-3 rounded-lg border border-border hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer flex flex-col gap-1.5 opacity-90 hover:opacity-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-text-primary truncate">{item.partnerNome}</span>
                    <span className="text-[10px] font-mono text-text-secondary whitespace-nowrap">({item.accountancy_id})</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-secondary truncate font-medium">
                      {item.playbookNome}
                    </span>
                    {item.isAutomatic ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
                        Playbook
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 shrink-0">
                        Plano manual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-text-secondary">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Concluído</span>
                    <span>{item.progresso}% final</span>
                  </div>
                </div>
              ))}
              {consolidatedPlaybooksKanban.concluido.length === 0 && (
                <div className="py-8 text-center text-xs text-text-secondary italic">
                  Nenhum parceiro nesta etapa
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeuDashboard;
