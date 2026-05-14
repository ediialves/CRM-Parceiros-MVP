import React, { useState, useEffect } from 'react';
import { Plan, Task } from '../../types';
import { ProgressBar } from '../ui/ProgressBar';
import { Badge } from '../ui/Badge';
import { Pencil, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PlanCardProps {
  plan: Plan | undefined;
  tasks: Task[];
  progress: number;
  onPlanUpdate?: (updatedPlan: Plan) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({ plan, tasks, progress, onPlanUpdate }) => {
  const [isEditingContexto, setIsEditingContexto] = useState(false);
  const [isEditingResultado, setIsEditingResultado] = useState(false);
  const [contextoValue, setContextoValue] = useState(plan?.contexto || '');
  const [resultadoValue, setResultadoValue] = useState(plan?.resultado || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setContextoValue(plan.contexto || '');
      setResultadoValue(plan.resultado || '');
    }
  }, [plan]);

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

  const handleSave = async (field: 'contexto' | 'resultado', value: string) => {
    const currentValue = plan[field] || '';
    if (value.trim() === currentValue.trim()) {
      setIsEditingContexto(false);
      setIsEditingResultado(false);
      return;
    }

    try {
      setIsSaving(true);
      const { data, error } = await supabase
        .from('plans')
        .update({ [field]: value })
        .eq('id', plan.id)
        .select()
        .single();

      if (error) throw error;

      if (data && onPlanUpdate) {
        onPlanUpdate(data);
      }
    } catch (err) {
      console.error(`Erro ao salvar ${field}:`, err);
    } finally {
      setIsSaving(false);
      setIsEditingContexto(false);
      setIsEditingResultado(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, field: 'contexto' | 'resultado', value: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave(field, value);
    }
  };

  const counts = {
    backlog: tasks.filter(t => t.status === 'backlog').length,
    agenda: tasks.filter(t => t.status === 'agenda').length,
    em_andamento: tasks.filter(t => t.status === 'em_andamento').length,
    concluida: tasks.filter(t => t.status === 'concluida').length,
  };

  const hasContent = plan.contexto || plan.resultado;

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

      {/* Contexto e Resultado Area */}
      <div className="space-y-4 py-2">
        {/* Contexto */}
        <div className="group/field">
          {isEditingContexto ? (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-primary">Contexto</label>
              <textarea
                autoFocus
                className="w-full p-2 text-sm border border-primary rounded-md outline-none focus:ring-1 focus:ring-primary h-24"
                value={contextoValue}
                onChange={(e) => setContextoValue(e.target.value)}
                onBlur={() => handleSave('contexto', contextoValue)}
                onKeyDown={(e) => handleKeyDown(e, 'contexto', contextoValue)}
                disabled={isSaving}
              />
            </div>
          ) : plan.contexto ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary">Contexto</label>
                <button 
                  onClick={() => setIsEditingContexto(true)}
                  className="p-0.5 text-text-secondary hover:text-primary opacity-0 group-hover/field:opacity-100 transition-opacity"
                >
                  <Pencil size={10} />
                </button>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{plan.contexto}</p>
            </div>
          ) : null}
        </div>

        {/* Resultado */}
        <div className="group/field">
          {isEditingResultado ? (
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-primary">Resultado</label>
              <textarea
                autoFocus
                className="w-full p-2 text-sm border border-primary rounded-md outline-none focus:ring-1 focus:ring-primary h-24"
                value={resultadoValue}
                onChange={(e) => setResultadoValue(e.target.value)}
                onBlur={() => handleSave('resultado', resultadoValue)}
                onKeyDown={(e) => handleKeyDown(e, 'resultado', resultadoValue)}
                disabled={isSaving}
              />
            </div>
          ) : plan.resultado ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary">Resultado</label>
                <button 
                  onClick={() => setIsEditingResultado(true)}
                  className="p-0.5 text-text-secondary hover:text-primary opacity-0 group-hover/field:opacity-100 transition-opacity"
                >
                  <Pencil size={10} />
                </button>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{plan.resultado}</p>
            </div>
          ) : null}
        </div>

        {/* Empty State Button */}
        {!hasContent && !isEditingContexto && !isEditingResultado && (
          <button
            onClick={() => setIsEditingContexto(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-primary transition-colors"
          >
            <Plus size={14} />
            Adicionar contexto
          </button>
        )}

        {/* Action icons when both exist but not editing */}
        {hasContent && !isEditingContexto && !isEditingResultado && !plan.resultado && (
          <button
            onClick={() => setIsEditingResultado(true)}
            className="flex items-center gap-1.5 text-[10px] font-bold text-text-secondary hover:text-primary transition-colors opacity-60 hover:opacity-100"
          >
            <Plus size={12} />
            Adicionar resultado
          </button>
        )}
      </div>

      <div className="space-y-2 pt-2">
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
