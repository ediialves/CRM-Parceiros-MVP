import { Plan } from '../../types';

export const mockPlans: Plan[] = [
  { id: 'pl1', partner_id: 'p1', titulo: 'Expansão Sul', ativo: true, created_at: '2026-01-10' },
  { id: 'pl1-v2', partner_id: 'p1', titulo: 'Fidelização 2026', ativo: true, created_at: '2026-05-01' },
  { id: 'pl2', partner_id: 'p2', titulo: 'Recuperação de Churn', ativo: true, created_at: '2026-02-15' },
  { id: 'pl4', partner_id: 'p4', titulo: 'Estratégia VIP', ativo: true, created_at: '2026-03-20' },
  { id: 'pl5', partner_id: 'p5', titulo: 'Aculturamento Digital', ativo: true, created_at: '2026-04-05' },
  { id: 'pl7', partner_id: 'p7', titulo: 'Fidelização 2026', ativo: true, created_at: '2025-12-01' },
  { id: 'pl8', partner_id: 'p8', titulo: 'Maximização de Engajamento', ativo: true, created_at: '2026-01-05' },
  { id: 'pl10', partner_id: 'p10', titulo: 'Plano de Boas Vindas', ativo: true, created_at: '2026-04-20' },
  // p3, p6, p9 sem plano ativo
];
