import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Playbook, PlaybookTask } from '../../types';
import { Button } from '../ui/Button';

interface PlaybookFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (playbookData: {
    nome: string;
    ativo: boolean;
    tasks: { id?: string; titulo: string; responsavel: string; ordem: number }[];
  }) => Promise<void>;
  initialPlaybook?: Playbook | null;
  initialTasks?: PlaybookTask[];
}

export const PlaybookForm: React.FC<PlaybookFormProps> = ({
  isOpen,
  onClose,
  onSave,
  initialPlaybook,
  initialTasks = [],
}) => {
  const [nome, setNome] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [tasks, setTasks] = useState<{ id?: string; titulo: string; responsavel: string; ordem: number }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialPlaybook) {
        setNome(initialPlaybook.nome);
        setAtivo(initialPlaybook.ativo);
        // Sort tasks by order before setting
        const sortedTasks = [...initialTasks].sort((a, b) => a.ordem - b.ordem);
        setTasks(sortedTasks.map(t => ({
          id: t.id,
          titulo: t.titulo,
          responsavel: t.responsavel,
          ordem: t.ordem
        })));
      } else {
        setNome('');
        setAtivo(true);
        // Start with one empty task
        setTasks([{ titulo: '', responsavel: 'gerente', ordem: 1 }]);
      }
    }
  }, [isOpen, initialPlaybook, initialTasks]);

  if (!isOpen) return null;

  const handleAddTask = () => {
    const nextOrdem = tasks.length + 1;
    setTasks([...tasks, { titulo: '', responsavel: 'gerente', ordem: nextOrdem }]);
  };

  const handleRemoveTask = (index: number) => {
    const updated = tasks.filter((_, i) => i !== index);
    // Reorder remaining tasks
    const reordered = updated.map((task, i) => ({
      ...task,
      ordem: i + 1,
    }));
    setTasks(reordered);
  };

  const handleTaskChange = (index: number, field: 'titulo' | 'responsavel', value: string) => {
    const updated = [...tasks];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setTasks(updated);
  };

  const moveTask = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === tasks.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...tasks];
    
    // Swap items
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Correct the order field
    const reordered = updated.map((task, i) => ({
      ...task,
      ordem: i + 1,
    }));

    setTasks(reordered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    // Filter out completely empty tasks
    const validTasks = tasks
      .filter(t => t.titulo.trim() !== '')
      .map((t, idx) => ({
        ...t,
        titulo: t.titulo.trim(),
        ordem: idx + 1, // ensure contiguous 1-indexed order
      }));

    try {
      setIsSubmitting(true);
      await onSave({
        nome: nome.trim(),
        ativo,
        tasks: validTasks,
      });
      onClose();
    } catch (err) {
      console.error('Erro ao salvar playbook:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto" id="playbook-form-overlay">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200 my-8 flex flex-col max-h-[90vh]" id="playbook-form-container">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
          <h2 className="text-xl font-bold text-text-primary" id="playbook-form-title">
            {initialPlaybook ? 'Editar Playbook Automático' : 'Novo Playbook Automático'}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer" id="btn-close-playbook-form">
            <X size={24} />
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Playbook Header Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="playbook-basic-info">
            <div className="sm:col-span-2 space-y-2">
              <label htmlFor="playbookName" className="text-sm font-semibold text-text-primary">
                Nome do Playbook <span className="text-rose-500">*</span>
              </label>
              <input
                id="playbookName"
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-card text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                placeholder="Ex: Playbook de Onboarding"
                required
              />
            </div>

            <div className="flex flex-col justify-end space-y-2 pb-1" id="playbook-status-toggle">
              <span className="text-sm font-semibold text-text-primary">Status</span>
              <label className="relative inline-flex items-center cursor-pointer py-1">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[6px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                <span className="ml-3 text-sm font-medium text-text-secondary">
                  {ativo ? 'Ativo' : 'Inativo'}
                </span>
              </label>
            </div>
          </div>

          {/* Tasks List Section */}
          <div className="space-y-4" id="playbook-tasks-section">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                Tasks do Modelo
              </h3>
              <span className="text-xs text-text-secondary">
                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>

            <div className="space-y-3" id="playbook-tasks-list">
              {tasks.map((task, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-bg-secondary/10 p-3.5 rounded-xl border border-border shadow-sm group"
                  id={`playbook-task-row-${index}`}
                >
                  {/* Order & Reordering controls */}
                  <div className="flex sm:flex-col items-center gap-1 sm:gap-0 bg-bg-secondary/30 rounded px-2 py-1 select-none shrink-0" id="task-reorder-controls">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveTask(index, 'up')}
                      className="p-1 text-text-secondary hover:text-indigo-600 disabled:opacity-30 cursor-pointer"
                      title="Mover para cima"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 min-w-[16px] text-center">
                      {task.ordem}
                    </span>
                    <button
                      type="button"
                      disabled={index === tasks.length - 1}
                      onClick={() => moveTask(index, 'down')}
                      className="p-1 text-text-secondary hover:text-indigo-600 disabled:opacity-30 cursor-pointer"
                      title="Mover para baixo"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>

                  {/* Task title */}
                  <div className="flex-1 w-full space-y-1">
                    <input
                      type="text"
                      value={task.titulo}
                      onChange={(e) => handleTaskChange(index, 'titulo', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                      placeholder="Título da Task modelo (vazio ignora no envio)"
                    />
                  </div>

                  {/* Task Responsible dropdown */}
                  <div className="w-full sm:w-44 space-y-1 shrink-0">
                    <select
                      value={task.responsavel}
                      onChange={(e) => handleTaskChange(index, 'responsavel', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-text-primary focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                    >
                      <option value="gerente">Gerente</option>
                      <option value="camisa_10">Camisa 10</option>
                      <option value="parceiro">Parceiro</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>

                  {/* Remove Row Action */}
                  <button
                    type="button"
                    onClick={() => handleRemoveTask(index)}
                    className="p-2 text-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors shrink-0 self-end sm:self-auto cursor-pointer"
                    title="Remover task"
                    id={`btn-remove-task-${index}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              {tasks.length === 0 && (
                <div className="p-8 text-center border border-dashed border-border rounded-xl bg-bg-secondary/10" id="no-tasks-placeholder">
                  <p className="text-sm text-text-secondary italic">Nenhuma task adicionada ao modelo.</p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleAddTask}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline transition-all px-1 py-1"
              id="btn-add-task-row"
            >
              <Plus size={14} />
              Adicionar Nova Linha de Task
            </button>
          </div>
        </form>

        {/* Sticky footer */}
        <div className="flex gap-3 p-6 border-t border-border bg-surface shrink-0">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1" id="btn-cancel-playbook">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !nome.trim()}
            className="flex-1"
            id="btn-save-playbook"
          >
            {isSubmitting ? 'Salvando...' : initialPlaybook ? 'Salvar Alterações' : 'Criar Playbook'}
          </Button>
        </div>
      </div>
    </div>
  );
};
