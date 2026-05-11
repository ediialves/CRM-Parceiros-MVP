import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, startDate: string) => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && startDate) {
      onSave(name, startDate);
      setName('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-primary">Novo Plano de Ação</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="planName" className="text-sm font-semibold text-text-primary">
              Nome do Plano
            </label>
            <input
              id="planName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder="Ex: Expansão Q3"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="startDate" className="text-sm font-semibold text-text-primary">
              Data de Início
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              Criar Plano
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
