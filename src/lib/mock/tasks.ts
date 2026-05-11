import { Task } from '../../types';

export const mockTasks: Task[] = [
  // Plan pl1 (p1) - 3 concluídas de 4 total = 75%
  { id: 't1', plan_id: 'pl1', titulo: 'Reunião de Alinhamento', status: 'concluida', responsavel: 'gerente', created_at: '2026-01-11' },
  { id: 't2', plan_id: 'pl1', titulo: 'Treinamento Equipe A', status: 'concluida', responsavel: 'camisa_10', created_at: '2026-01-15' },
  { id: 't3', plan_id: 'pl1', titulo: 'Configuração de Dashboard', status: 'concluida', responsavel: 'parceiro', created_at: '2026-01-20' },
  { id: 't4', plan_id: 'pl1', titulo: 'Workshop VIP', status: 'backlog', responsavel: 'gerente', created_at: '2026-01-25' },
  
  // Plan pl1-v2 (p1) - 1 concluída de 2 total
  { id: 't25', plan_id: 'pl1-v2', titulo: 'Nova Task Plano 2', status: 'concluida', responsavel: 'gerente', created_at: '2026-05-02' },
  { id: 't26', plan_id: 'pl1-v2', titulo: 'Segunda Task Plano 2', status: 'backlog', responsavel: 'parceiro', created_at: '2026-05-03' },

  // Plan pl2 (p2) - 1 concluída de 5 total = 20%
  { id: 't5', plan_id: 'pl2', titulo: 'Call Urgente', status: 'concluida', responsavel: 'gerente', created_at: '2026-02-16' },
  { id: 't6', plan_id: 'pl2', titulo: 'Análise de Motivos', status: 'agenda', responsavel: 'gerente', created_at: '2026-02-17' },
  { id: 't7', plan_id: 'pl2', titulo: 'Nova Proposta', status: 'em_andamento', responsavel: 'parceiro', created_at: '2026-02-20' },
  { id: 't8', plan_id: 'pl2', titulo: 'Follow-up 1', status: 'backlog', responsavel: 'gerente', created_at: '2026-02-25' },
  { id: 't9', plan_id: 'pl2', titulo: 'Follow-up 2', status: 'backlog', responsavel: 'gerente', created_at: '2026-03-01' },

  // Plan pl4 (p4) - 5 de 5 = 100%
  { id: 't10', plan_id: 'pl4', titulo: 'T1', status: 'concluida', responsavel: 'gerente', created_at: '2026-03-21' },
  { id: 't11', plan_id: 'pl4', titulo: 'T2', status: 'concluida', responsavel: 'gerente', created_at: '2026-03-22' },
  { id: 't12', plan_id: 'pl4', titulo: 'T3', status: 'concluida', responsavel: 'gerente', created_at: '2026-03-23' },
  { id: 't13', plan_id: 'pl4', titulo: 'T4', status: 'concluida', responsavel: 'gerente', created_at: '2026-03-24' },
  { id: 't14', plan_id: 'pl4', titulo: 'T5', status: 'concluida', responsavel: 'gerente', created_at: '2026-03-25' },

  // Plan pl5 (p5) - 2 de 4 = 50%
  { id: 't15', plan_id: 'pl5', titulo: 'Checklist', status: 'concluida', responsavel: 'gerente', created_at: '2026-04-06' },
  { id: 't16', plan_id: 'pl5', titulo: 'Entrevista', status: 'concluida', responsavel: 'parceiro', created_at: '2026-04-07' },
  { id: 't17', plan_id: 'pl5', titulo: 'Ajuste Sistêmico', status: 'em_andamento', responsavel: 'outros', created_at: '2026-04-10' },
  { id: 't18', plan_id: 'pl5', titulo: 'Finalização', status: 'backlog', responsavel: 'gerente', created_at: '2026-04-15' },

  // Plan pl7 (pl7) - 1 de 2 = 50%
  { id: 't19', plan_id: 'pl7', titulo: 'Visita Presencial', status: 'concluida', responsavel: 'gerente', created_at: '2025-12-05' },
  { id: 't20', plan_id: 'pl7', titulo: 'Almoço Executivo', status: 'agenda', responsavel: 'parceiro', created_at: '2025-12-10' },

  // Plan pl8 (pl8) - 1 de 1 = 100%
  { id: 't21', plan_id: 'pl8', titulo: 'Ajuste de ROI', status: 'concluida', responsavel: 'gerente', created_at: '2026-01-06' },

  // Plan pl10 (pl10) - 0 de 3 = 0%
  { id: 't22', plan_id: 'pl10', titulo: 'Boas Vindas 1', status: 'agenda', responsavel: 'gerente', created_at: '2026-04-21' },
  { id: 't23', plan_id: 'pl10', titulo: 'Boas Vindas 2', status: 'backlog', responsavel: 'gerente', created_at: '2026-04-22' },
  { id: 't24', plan_id: 'pl10', titulo: 'Boas Vindas 3', status: 'backlog', responsavel: 'gerente', created_at: '2026-04-23' },
];
