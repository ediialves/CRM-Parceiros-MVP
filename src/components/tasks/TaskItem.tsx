import React from 'react';
import { CheckCircle2, Circle, Clock, PlayCircle, Edit2, Trash2 } from 'lucide-react';
import { Task } from '../../types';
import { Badge } from '../ui/Badge';

interface TaskItemProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, onEdit, onDelete, onToggleStatus }) => {
  const getStatusIcon = () => {
    switch (task.status) {
      case 'concluida': return <CheckCircle2 size={18} className="text-success" />;
      case 'em_andamento': return <PlayCircle size={18} className="text-primary-light" />;
      case 'agenda': return <Clock size={18} className="text-accent" />;
      default: return <Circle size={18} className="text-gray-300" />;
    }
  };

  const getStatusTag = () => {
    switch (task.status) {
      case 'concluida': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-success/10 text-success uppercase">Concluída</span>;
      case 'em_andamento': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase">Em Andamento</span>;
      case 'agenda': 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent/10 text-accent uppercase">Agenda</span>;
      default: 
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-background text-text-secondary uppercase">Backlog</span>;
    }
  };

  const getResponsavelLabel = () => {
    switch (task.responsavel) {
      case 'gerente': return 'Gerente';
      case 'camisa_10': return 'Camisa 10';
      case 'parceiro': return 'Parceiro';
      default: return 'Outros';
    }
  };

  const isCompleted = task.status === 'concluida';

  return (
    <div className={`group flex items-center justify-between py-3 px-2 border-b border-border hover:bg-background transition-all min-h-[44px] ${isCompleted ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex items-center gap-4 flex-1">
        <button 
          onClick={() => onToggleStatus(task.id)}
          className="flex items-center justify-center transition-colors"
          title={isCompleted ? "Reabrir task" : "Concluir task"}
        >
          {getStatusIcon()}
        </button>
        
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1">
          <p className={`text-sm font-medium transition-all ${isCompleted ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
            {task.titulo}
          </p>
          {getStatusTag()}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 text-[11px] text-text-secondary">
          <span className="font-semibold">{getResponsavelLabel()}</span>
          <span className="text-gray-300">•</span>
          <span>{new Date(task.created_at).toLocaleDateString('pt-BR')}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onEdit(task)}
            className="p-1.5 text-text-secondary hover:text-primary-light hover:bg-primary-light/5 rounded"
            title="Editar task"
          >
            <Edit2 size={14} />
          </button>
          <button 
            onClick={() => onDelete(task.id)}
            className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/5 rounded"
            title="Excluir task"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
