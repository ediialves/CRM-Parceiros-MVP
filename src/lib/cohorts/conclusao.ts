/**
 * Status de conclusão de um plano, como recorte de análise.
 *
 * Definição única no código — usada pelas coortes do Dashboard de Coortes
 * (`computeCohorts.ts`) e pelas coortes dentro do acompanhamento de um playbook
 * (`PlaybookAcompanhamento.tsx`), para as duas telas nunca divergirem sobre o
 * que conta como "não classificado".
 */
export type CohortConclusao = 'todos' | 'sucesso' | 'sem_sucesso' | 'nao_classificado';

/**
 * "Não classificado" é o plano que terminou (todas as tasks concluídas) mas
 * ficou sem `status_conclusao` preenchido — encerrou e ninguém classificou o
 * desfecho. Um plano ainda em andamento não é "não classificado": ele só ainda
 * não chegou lá.
 */
export const planPassesConclusao = (
  plan: { status_conclusao?: string | null },
  conclusao: CohortConclusao,
  todasTasksConcluidas: boolean
): boolean => {
  if (conclusao === 'todos') return true;
  if (conclusao === 'sucesso') return plan.status_conclusao === 'sucesso';
  if (conclusao === 'sem_sucesso') return plan.status_conclusao === 'sem_sucesso';
  return todasTasksConcluidas && (!plan.status_conclusao || plan.status_conclusao === '');
};

export const CONCLUSAO_OPTIONS: Array<{ value: CohortConclusao; label: string; title: string }> = [
  { value: 'todos', label: 'Todos', title: 'Todos os planos, independente do desfecho.' },
  { value: 'sucesso', label: 'Sucesso', title: 'Planos encerrados com status de conclusão "Sucesso".' },
  { value: 'sem_sucesso', label: 'Sem sucesso', title: 'Planos encerrados com status de conclusão "Sem Sucesso".' },
  { value: 'nao_classificado', label: 'Não classificado', title: 'Planos com todas as tasks concluídas, mas sem status de conclusão preenchido.' },
];
