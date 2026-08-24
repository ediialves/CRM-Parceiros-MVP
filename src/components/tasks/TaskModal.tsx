import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Lock } from 'lucide-react';
import { Task } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface TaskRow {
  titulo: string;
  status: Task['status'];
  responsavel: Task['responsavel'];
  data_conclusao_prevista: string;
  error?: string;
  dateError?: string;
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tasks: Partial<Task>[]) => void;
  taskToEdit?: Task | null;
  isAutomatic?: boolean;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, taskToEdit, isAutomatic = false }) => {
  const [tasks, setTasks] = useState<TaskRow[]>([
    { titulo: '', status: 'backlog', responsavel: 'gerente', data_conclusao_prevista: '' }
  ]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (taskToEdit) {
      setTasks([{
        titulo: taskToEdit.titulo,
        status: taskToEdit.status,
        responsavel: taskToEdit.responsavel,
        data_conclusao_prevista: taskToEdit.data_conclusao_prevista || ''
      }]);
    } else {
      setTasks([{ titulo: '', status: 'backlog', responsavel: 'gerente', data_conclusao_prevista: '' }]);
    }
  }, [taskToEdit, isOpen]);

  if (!isOpen) return null;

  const handleAddTaskRow = () => {
    setTasks([...tasks, { titulo: '', status: 'backlog', responsavel: 'gerente', data_conclusao_prevista: '' }]);
  };

  const handleRemoveTaskRow = (index: number) => {
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const handleUpdateTaskRow = (index: number, updates: Partial<TaskRow>) => {
    setTasks(tasks.map((task, i) => i === index ? { ...task, ...updates } : task));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    let hasError = false;
    const validatedTasks = tasks.map(task => {
      let titleErr = '';
      let dateErr = '';
      if (!task.titulo.trim()) {
        titleErr = 'O título é obrigatório.';
        hasError = true;
      }
      if (!task.data_conclusao_prevista) {
        dateErr = 'Prazo obrigatório.';
        hasError = true;
      }
      return { ...task, error: titleErr, dateError: dateErr };
    });

    if (hasError) {
      setTasks(validatedTasks);
      return;
    }

    try {
      setIsSaving(true);
      await onSave(tasks.map(t => ({
        titulo: t.titulo,
        status: t.status,
        responsavel: t.responsavel,
        data_conclusao_prevista: t.data_conclusao_prevista || null
      })));
    } catch (err) {
      console.error('Erro ao salvar tasks:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-3xl rounded-xl shadow-xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gray-50/50">
          <h3 className="text-lg font-bold text-primary">
            {taskToEdit ? 'Editar Task' : 'Novas Tasks'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-md text-text-secondary">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
          <div className="p-6 overflow-hidden flex flex-col flex-1">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_110px_110px_130px_40px] gap-3 px-2 mb-2">
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Título</span>
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Status</span>
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Responsável</span>
              <span className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Prazo</span>
              <span></span>
            </div>

            {/* List of Tasks */}
            <div className="overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {tasks.map((task, index) => (
                <div key={index} className="grid grid-cols-[1fr_110px_110px_130px_40px] gap-3 items-start animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      className={`w-full px-3 py-2 text-sm border ${task.error ? 'border-danger focus:ring-danger' : 'border-border focus:ring-primary'} rounded-lg focus:outline-none focus:ring-1 transition-all h-10 ${isAutomatic ? 'bg-gray-100 text-text-secondary cursor-not-allowed opacity-75' : 'bg-white'}`}
                      value={task.titulo}
                      onChange={(e) => handleUpdateTaskRow(index, { titulo: e.target.value })}
                      placeholder="Ex: Agendar treinamento..."
                      autoFocus={!taskToEdit && index === tasks.length - 1}
                      disabled={isAutomatic}
                    />
                    {task.error && <span className="text-[10px] text-danger font-medium ml-1">{task.error}</span>}
                    {isAutomatic && (
                      <span className="text-[10px] text-text-secondary font-medium ml-1 flex items-center gap-1">
                        <Lock size={12} className="text-text-secondary shrink-0" />
                        Título padronizado — não editável
                      </span>
                    )}
                  </div>

                  <select 
                    className="px-2 py-2 bg-white border border-border rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary h-10 cursor-pointer hover:bg-gray-50 transition-colors"
                    value={task.status}
                    onChange={(e) => handleUpdateTaskRow(index, { status: e.target.value as Task['status'] })}
                  >
                    <option value="backlog">Backlog</option>
                    <option value="agenda">Agenda</option>
                    <option value="em_andamento">Andamento</option>
                    <option value="concluida">Concluída</option>
                  </select>

                  <select 
                    className="px-2 py-2 bg-white border border-border rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary h-10 cursor-pointer hover:bg-gray-50 transition-colors"
                    value={task.responsavel}
                    onChange={(e) => handleUpdateTaskRow(index, { responsavel: e.target.value as Task['responsavel'] })}
                  >
                    <option value="gerente">Gerente</option>
                    <option value="camisa_10">C10</option>
                    <option value="parceiro">Parceiro</option>
                    <option value="outros">Outros</option>
                  </select>

                  <div className="flex flex-col gap-1">
                    <input
                      type="date"
                      className={`w-full px-2 py-2 text-xs bg-white border ${task.dateError ? 'border-danger focus:ring-danger' : 'border-border focus:ring-primary'} rounded-lg focus:outline-none focus:ring-1 transition-all h-10 cursor-pointer`}
                      value={task.data_conclusao_prevista}
                      onChange={(e) => handleUpdateTaskRow(index, { data_conclusao_prevista: e.target.value })}
                    />
                    {task.dateError && <span className="text-[10px] text-danger font-medium ml-1">{task.dateError}</span>}
                  </div>

                  <div className="flex items-center justify-center h-10">
                    {tasks.length > 1 && !taskToEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTaskRow(index)}
                        className="p-1.5 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-md transition-all"
                        title="Remover linha"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {!taskToEdit && (
                <button
                  type="button"
                  onClick={handleAddTaskRow}
                  className="flex items-center gap-2 text-xs font-bold text-primary hover:text-primary-dark transition-colors px-2 py-2 mt-1 w-fit"
                >
                  <Plus size={16} />
                  Adicionar mais uma task
                </button>
              )}
            </div>
          </div>

          <div className="p-6 bg-gray-50/50 border-t border-border flex gap-3">
            <Button type="button" variant="ghost" className="flex-1 font-bold" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 font-bold" disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

