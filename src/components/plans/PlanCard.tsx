import React from 'react';
import { Plan, Task } from '../../types';
import { ProgressBar } from '../ui/ProgressBar';
import { Badge } from '../ui/Badge';

interface PlanCardProps {
  plan: Plan | undefined;
  tasks: Task[];
  progress: number;
}

export const PlanCard: React.FC<PlanCardProps> = ({ plan, tasks, progress }) => {
  if (!plan) {
    return (
      <div className="p-6 bg-surface rounded-xl border border-dashed border-danger/30 flex flex-col items-center justify-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-danger">
          !
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Sem Plano de Ação</h3>
          <p className="text-sm text-text-secondary">Este parceiro ainda não possui um plano de engajamento ativo.</p>
        </div>
      </div>
    );
  }

  const counts = {
    backlog: tasks.filter(t => t.status === 'backlog').length,
    agenda: tasks.filter(t => t.status === 'agenda').length,
    em_andamento: tasks.filter(t => t.status === 'em_andamento').length,
    concluida: tasks.filter(t => t.status === 'concluida').length,
  };

  return (
    <div className="p-6 bg-surface rounded-xl border border-border shadow-sm space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-primary">{plan.titulo}</h3>
          <p className="text-xs text-text-secondary">Ativo desde {new Date(plan.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
        <Badge variant={progress === 100 ? 'success' : 'primary'}>
          {progress === 100 ? 'Concluído' : 'Em Execução'}
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-end">
          <span className="text-sm font-medium text-text-primary">Progresso do Plano</span>
          <span className="text-2xl font-bold text-primary">{Math.round(progress)}%</span>
        </div>
        <ProgressBar progress={progress} className="h-3" />
      </div>

      <div className="grid grid-cols-4 gap-2 pt-4 border-t border-gray-50">
        <div className="text-center">
          <span className="block text-lg font-bold text-text-primary">{counts.backlog}</span>
          <span className="text-[10px] text-text-secondary uppercase">Backlog</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-text-primary">{counts.agenda}</span>
          <span className="text-[10px] text-text-secondary uppercase">Agenda</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-primary-light">{counts.em_andamento}</span>
          <span className="text-[10px] text-text-secondary uppercase">Em Andamento</span>
        </div>
        <div className="text-center">
          <span className="block text-lg font-bold text-success">{counts.concluida}</span>
          <span className="text-[10px] text-text-secondary uppercase">Concluído</span>
        </div>
      </div>
    </div>
  );
};
