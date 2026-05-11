import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Task } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
  taskToEdit?: Task | null;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, taskToEdit }) => {
  const [titulo, setTitulo] = useState('');
  const [status, setStatus] = useState<Task['status']>('backlog');
  const [responsavel, setResponsavel] = useState<Task['responsavel']>('gerente');
  const [error, setError] = useState('');

  useEffect(() => {
    if (taskToEdit) {
      setTitulo(taskToEdit.titulo);
      setStatus(taskToEdit.status);
      setResponsavel(taskToEdit.responsavel);
    } else {
      setTitulo('');
      setStatus('backlog');
      setResponsavel('gerente');
    }
    setError('');
  }, [taskToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setError('O título é obrigatório.');
      return;
    }
    onSave({
      titulo,
      status,
      responsavel,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-xl shadow-xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-primary">
            {taskToEdit ? 'Editar Task' : 'Nova Task'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-md text-text-secondary">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input 
            label="Título da Task" 
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex: Agendar treinamento de equipe"
            error={error}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text-secondary">Status</label>
              <select 
                className="px-3 py-2 bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={status}
                onChange={(e) => setStatus(e.target.value as Task['status'])}
              >
                <option value="backlog">Backlog</option>
                <option value="agenda">Agenda</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluída</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text-secondary">Responsável</label>
              <select 
                className="px-3 py-2 bg-white border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value as Task['responsavel'])}
              >
                <option value="gerente">Gerente</option>
                <option value="camisa_10">Camisa 10</option>
                <option value="parceiro">Parceiro</option>
                <option value="outros">Outros</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              Salvar Alterações
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
