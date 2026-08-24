import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Circle, Clock, PlayCircle, Edit2, Trash2, Pencil } from 'lucide-react';
import { Task } from '../../types';
import { supabase } from '../../lib/supabase';

interface TaskItemProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({ task, onEdit, onDelete, onToggleStatus }) => {
  const [isEditingObs, setIsEditingObs] = useState(false);
  const [obsValue, setObsValue] = useState(task.observacao || '');
  const [localTask, setLocalTask] = useState(task);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalTask(task);
    setObsValue(task.observacao || '');
  }, [task]);

  const handleSaveObs = async () => {
    const trimmedValue = obsValue.trim();
    const finalValue = trimmedValue === '' ? null : trimmedValue;

    if (finalValue === localTask.observacao) {
      setIsEditingObs(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ observacao: finalValue })
        .eq('id', task.id);

      if (error) throw error;

      setLocalTask(prev => ({ ...prev, observacao: finalValue as string | undefined }));
    } catch (err) {
      console.error('Erro ao salvar observação:', err);
      // Revert local value on error
      setObsValue(localTask.observacao || '');
    } finally {
      setIsEditingObs(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveObs();
    }
  };

  const getStatusIcon = () => {
    switch (localTask.status) {
      case 'concluida': return <CheckCircle2 size={18} className="text-success" />;
      case 'em_andamento': return <PlayCircle size={18} className="text-primary-light" />;
      case 'agenda': return <Clock size={18} className="text-accent" />;
      default: return <Circle size={18} className="text-gray-300" />;
    }
  };

  const getStatusTag = () => {
    switch (localTask.status) {
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
    switch (localTask.responsavel) {
      case 'gerente': return 'Gerente';
      case 'camisa_10': return 'Camisa 10';
      case 'parceiro': return 'Parceiro';
      default: return 'Outros';
    }
  };

  const isCompleted = localTask.status === 'concluida';

  const isOverdue = React.useMemo(() => {
    if (!localTask.data_conclusao_prevista || isCompleted) return false;
    const [year, month, day] = localTask.data_conclusao_prevista.split('-').map(Number);
    const deadline = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return deadline < today;
  }, [localTask.data_conclusao_prevista, isCompleted]);

  const formattedDeadline = React.useMemo(() => {
    if (!localTask.data_conclusao_prevista) return null;
    const parts = localTask.data_conclusao_prevista.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}`;
    }
    return localTask.data_conclusao_prevista;
  }, [localTask.data_conclusao_prevista]);

  return (
    <div className={`group flex flex-col py-3 px-2 border-b border-border hover:bg-background transition-all ${isCompleted ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <button 
            onClick={() => onToggleStatus(localTask.id)}
            className="flex items-center justify-center transition-colors"
            title={isCompleted ? "Reabrir task" : "Concluir task"}
          >
            {getStatusIcon()}
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1">
            <p className={`text-sm font-medium transition-all ${isCompleted ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
              {localTask.titulo}
            </p>
            {getStatusTag()}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="font-semibold">{getResponsavelLabel()}</span>
            <span className="text-gray-300">•</span>
            <span>{new Date(localTask.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            {formattedDeadline && (
              <>
                <span className="text-gray-300">•</span>
                <span className={isOverdue ? 'text-danger font-semibold' : ''}>
                  Prazo: {formattedDeadline}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setIsEditingObs(true)}
              className="p-1.5 text-text-secondary hover:text-primary-light hover:bg-primary-light/5 rounded"
              title="Adicionar observação"
            >
              <Pencil size={12} />
            </button>
            <button 
              onClick={() => onEdit(localTask)}
              className="p-1.5 text-text-secondary hover:text-primary-light hover:bg-primary-light/5 rounded"
              title="Editar task"
            >
              <Edit2 size={14} />
            </button>
            <button 
              onClick={() => onDelete(localTask.id)}
              className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/5 rounded"
              title="Excluir task"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Área de Observação */}
      <div className="pl-9 mt-1">
        {isEditingObs ? (
          <textarea
            ref={textareaRef}
            autoFocus
            className="w-full text-[11px] text-text-primary bg-white border border-primary/20 rounded p-1 outline-none focus:ring-1 focus:ring-primary/30 resize-none h-16"
            placeholder="Adicionar observação..."
            value={obsValue}
            onChange={(e) => setObsValue(e.target.value)}
            onBlur={handleSaveObs}
            onKeyDown={handleKeyDown}
          />
        ) : localTask.observacao ? (
          <p 
            className="text-[11px] text-text-secondary italic leading-tight cursor-text hover:text-text-primary transition-colors"
            onClick={() => setIsEditingObs(true)}
          >
            {localTask.observacao}
          </p>
        ) : null}
      </div>
    </div>
  );
};
