import React, { useState, useEffect } from 'react';
import { Pencil, Plus, ChevronRight, Trash2, CheckCircle2 } from 'lucide-react';
import { Plan, Task } from '../../types';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import { TaskList } from '../tasks/TaskList';

interface PlanCardProps {
  plan: Plan | undefined;
  tasks: Task[];
  progress: number;
  isExpanded?: boolean;
  onToggle?: () => void;
  onPlanUpdate?: (updatedPlan: Plan) => void;
  onAddTask?: () => void;
  onDeletePlan?: () => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onToggleTaskStatus?: (taskId: string) => void;
  onConcludePlan?: () => void;
  canEdit?: boolean;
  canConclude?: boolean;
}

export const PlanCard: React.FC<PlanCardProps> = ({ 
  plan, 
  tasks, 
  progress, 
  isExpanded, 
  onToggle, 
  onPlanUpdate,
  onAddTask,
  onDeletePlan,
  onEditTask,
  onDeleteTask,
  onToggleTaskStatus,
  onConcludePlan,
  canEdit,
  canConclude
}) => {
  const [isEditingContexto, setIsEditingContexto] = useState(false);
  const [isEditingTitulo, setIsEditingTitulo] = useState(false);
  const [contextoValue, setContextoValue] = useState(plan?.contexto || '');
  const [tituloValue, setTituloValue] = useState(plan?.titulo || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setContextoValue(plan.contexto || '');
      setTituloValue(plan.titulo || '');
    }
  }, [plan]);

  if (!plan) {
    return (
      <div className="p-6 bg-background-secondary rounded-xl border border-dashed border-danger/30 flex flex-col items-center justify-center text-center gap-2">
        <div className="w-12 h-12 rounded-full bg-danger/10 flex items-center justify-center text-danger font-bold text-xl">
          !
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Sem Plano de Ação</h3>
          <p className="text-sm text-text-secondary">Este parceiro ainda não possui um plano de engajamento ativo.</p>
        </div>
      </div>
    );
  }

  const isConcluded = !plan.ativo || !!plan.status_conclusao;

  const handleSaveContexto = async (value: string) => {
    const currentValue = plan.contexto || '';
    if (value.trim() === currentValue.trim()) {
      setIsEditingContexto(false);
      return;
    }

    try {
      setIsSaving(true);
      const { data, error } = await supabase
        .from('plans')
        .update({ contexto: value })
        .eq('id', plan.id)
        .select()
        .single();

      if (error) throw error;

      if (data && onPlanUpdate) {
        onPlanUpdate(data);
      }
    } catch (err) {
      console.error('Erro ao salvar contexto:', err);
    } finally {
      setIsSaving(false);
      setIsEditingContexto(false);
    }
  };

  const handleContextoKeyDown = (e: React.KeyboardEvent, value: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveContexto(value);
    }
  };

  const handleSaveTitulo = async (value: string) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setTituloValue(plan.titulo || '');
      setIsEditingTitulo(false);
      return;
    }

    if (trimmed === (plan.titulo || '').trim()) {
      setIsEditingTitulo(false);
      return;
    }

    try {
      setIsSaving(true);
      const { data, error } = await supabase
        .from('plans')
        .update({ titulo: trimmed })
        .eq('id', plan.id)
        .select()
        .single();

      if (error) throw error;

      if (data && onPlanUpdate) {
        onPlanUpdate(data);
      }
    } catch (err) {
      console.error('Erro ao salvar titulo do plano:', err);
    } finally {
      setIsSaving(false);
      setIsEditingTitulo(false);
    }
  };

  const handleTituloKeyDown = (e: React.KeyboardEvent, value: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitulo(value);
    } else if (e.key === 'Escape') {
      setTituloValue(plan.titulo || '');
      setIsEditingTitulo(false);
    }
  };

  const counts = {
    backlog: tasks.filter(t => t.status === 'backlog').length,
    agenda: tasks.filter(t => t.status === 'agenda').length,
    em_andamento: tasks.filter(t => t.status === 'em_andamento').length,
    concluida: tasks.filter(t => t.status === 'concluida').length,
  };

  return (
    <div className={`overflow-hidden border rounded-2xl transition-all duration-300 ${
      isExpanded 
        ? 'bg-background-primary border-border shadow-sm' 
        : 'bg-background-secondary border-transparent hover:border-border cursor-pointer'
    }`}>
      {/* Header Colapsável */}
      <div 
        onClick={onToggle}
        className={`px-6 py-4 flex items-center justify-between gap-4 select-none ${isExpanded ? 'border-b border-border' : ''}`}
      >
        <div className="flex-1 min-w-0" onClick={(e) => { if (isEditingTitulo) e.stopPropagation(); }}>
          <div className="flex items-center gap-3">
            {isEditingTitulo && canEdit && !isConcluded ? (
              <input
                type="text"
                autoFocus
                className="text-sm font-bold text-text-primary border-b border-primary bg-transparent outline-none py-0.5 w-full max-w-xs focus:ring-0 focus:border-primary select-text"
                value={tituloValue}
                onChange={(e) => setTituloValue(e.target.value)}
                onBlur={() => handleSaveTitulo(tituloValue)}
                onKeyDown={(e) => handleTituloKeyDown(e, tituloValue)}
                onClick={(e) => e.stopPropagation()}
                disabled={isSaving}
              />
            ) : (
              <div className="flex items-center gap-1.5 group/title max-w-full min-w-0">
                <h3 className={`text-sm font-bold truncate transition-colors ${isExpanded ? 'text-primary' : 'text-text-primary'}`}>
                  {plan.titulo}
                </h3>
                {canEdit && !isConcluded && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingTitulo(true);
                    }}
                    className="p-1 text-text-secondary hover:text-primary hover:bg-primary/5 rounded opacity-0 group-hover/title:opacity-100 focus:opacity-100 transition-opacity shrink-0 cursor-pointer"
                    title="Editar título"
                  >
                    <Pencil size={11} />
                  </button>
                )}
              </div>
            )}

            {/* Badges de Status / Conclusão */}
            {plan.status_conclusao === 'sucesso' ? (
              <Badge variant="success" className="scale-90 origin-left shrink-0">
                Sucesso
              </Badge>
            ) : plan.status_conclusao === 'sem_sucesso' ? (
              <Badge variant="danger" className="scale-90 origin-left shrink-0">
                Sem Sucesso
              </Badge>
            ) : !plan.ativo ? (
              <Badge variant="default" className="scale-90 origin-left shrink-0">
                Inativo
              </Badge>
            ) : (
              <Badge variant={progress === 100 ? 'success' : 'primary'} className="scale-90 origin-left shrink-0">
                {progress === 100 ? '100% Concluído' : 'Em Execução'}
              </Badge>
            )}
          </div>
          
          {/* Contexto Truncado no estado fechado */}
          {!isExpanded && plan.contexto && (
            <p className="text-xs text-text-secondary truncate mt-1 max-w-md">
              {plan.contexto}
            </p>
          )}
        </div>

        <div className="flex items-center gap-6">
          {/* Progresso visível no estado fechado */}
          <div className="hidden sm:flex items-center gap-3 w-48">
            <ProgressBar progress={progress} className="h-1.5" />
            <span className="text-xs font-bold text-text-primary w-8">{Math.round(progress)}%</span>
          </div>

          <ChevronRight 
            size={18} 
            className={`text-text-secondary transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} 
          />
        </div>
      </div>

      {/* Conteúdo Expandido */}
      <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
        <div className="p-6 space-y-8">
          
          {/* Header de Ações */}
          <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Criado em</span>
                <span className="text-xs font-medium text-text-primary">{new Date(plan.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              {plan.concluido_em && (
                <div className="flex flex-col border-l border-border/50 pl-4">
                  <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Concluído em</span>
                  <span className="text-xs font-medium text-text-primary">{new Date(plan.concluido_em).toLocaleDateString('pt-BR')}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Botão Concluir Plano (Apenas para o gerente dono e plano ativo) */}
              {canConclude && (
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConcludePlan?.();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  id={`btn-concluir-plano-${plan.id}`}
                  title="Concluir este plano de engajamento"
                >
                  <CheckCircle2 size={14} />
                  Concluir Plano
                </button>
              )}

              {canEdit && !isConcluded && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePlan?.();
                  }}
                  className="p-2 text-text-secondary hover:text-danger hover:bg-danger/5 rounded-lg transition-all cursor-pointer"
                  title="Excluir plano"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Contexto e Resultado Area */}
          <div className="space-y-6">
            {/* Contexto (Edição inline continua preservada) */}
            <div className="group/field bg-gray-50/50 p-4 rounded-xl border border-transparent hover:border-border transition-all">
              {isEditingContexto ? (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-primary">Contexto do Plano</label>
                  <textarea
                    autoFocus
                    className="w-full p-3 text-sm border border-primary rounded-xl bg-white outline-none focus:ring-1 focus:ring-primary h-28 resize-none shadow-sm"
                    value={contextoValue}
                    onChange={(e) => setContextoValue(e.target.value)}
                    onBlur={() => handleSaveContexto(contextoValue)}
                    onKeyDown={(e) => handleContextoKeyDown(e, contextoValue)}
                    disabled={isSaving}
                    placeholder="Quais as dores ou objetivos deste plano?"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">Contexto</label>
                    {canEdit && (
                      <button 
                        onClick={() => setIsEditingContexto(true)}
                        className="p-1 px-2 text-[10px] font-bold text-text-secondary hover:text-primary hover:bg-primary/5 rounded flex items-center gap-1 opacity-0 group-hover/field:opacity-100 transition-all cursor-pointer"
                      >
                        <Pencil size={10} />
                        Editar
                      </button>
                    )}
                  </div>
                  {plan.contexto ? (
                    <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{plan.contexto}</p>
                  ) : (
                    canEdit ? (
                      <button 
                        onClick={() => setIsEditingContexto(true)}
                        className="text-xs text-text-secondary italic hover:text-primary transition-colors cursor-pointer"
                      >
                        Nenhum contexto definido. Clique para adicionar.
                      </button>
                    ) : (
                      <p className="text-xs text-text-secondary italic">Nenhum contexto definido.</p>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Resultado (Somente Leitura - populado pelo fluxo de conclusão) */}
            <div className="bg-gray-50/50 p-4 rounded-xl border border-transparent transition-all">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-wider">
                    Resultado Alcançado
                  </label>
                  {plan.status_conclusao && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        plan.status_conclusao === 'sucesso'
                          ? 'bg-success/10 text-success'
                          : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {plan.status_conclusao === 'sucesso' ? 'Concluído com Sucesso' : 'Concluído Sem Sucesso'}
                    </span>
                  )}
                </div>

                {plan.status_conclusao === 'sem_sucesso' && plan.motivo_insucesso && (
                  <div className="text-xs font-semibold text-danger bg-danger/5 p-2.5 rounded-lg border border-danger/10">
                    <span className="font-bold">Motivo:</span> {plan.motivo_insucesso}
                  </div>
                )}

                {plan.resultado ? (
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      plan.status_conclusao === 'sem_sucesso'
                        ? 'text-text-primary'
                        : plan.status_conclusao === 'sucesso'
                        ? 'font-medium text-success'
                        : 'text-text-primary'
                    }`}
                  >
                    {plan.resultado}
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary italic">
                    Aguardando conclusão do plano.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seção de Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
               <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Status da Execução</h4>
               <div className="flex items-center gap-3">
                  <span className="text-[10px] text-text-secondary"><span className="font-bold text-text-primary">{counts.concluida}</span>/{tasks.length} concluídas</span>
               </div>
            </div>

            <div className="grid grid-cols-4 gap-4 p-4 bg-gray-50/30 rounded-xl border border-border/50">
              {[
                { label: 'Backlog', count: counts.backlog, color: 'text-text-secondary' },
                { label: 'Agenda', count: counts.agenda, color: 'text-primary' },
                { label: 'Andamento', count: counts.em_andamento, color: 'text-amber-500' },
                { label: 'Concluído', count: counts.concluida, color: 'text-success' },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <span className={`block text-lg font-bold ${s.color}`}>{s.count}</span>
                  <span className="text-[9px] text-text-secondary uppercase font-medium">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
               <div className="bg-gray-50/50 px-4 py-2 border-b border-border text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                  Checklist Individual
               </div>
               <div className="p-2">
                 <TaskList 
                    tasks={tasks}
                    onEditTask={isConcluded ? undefined : onEditTask}
                    onDeleteTask={isConcluded ? undefined : onDeleteTask}
                    onToggleStatus={isConcluded ? undefined : onToggleTaskStatus}
                 />
                 {tasks.length === 0 && (
                   <div className="p-8 text-center">
                      <p className="text-xs text-text-secondary italic">Nenhuma task criada para este plano.</p>
                   </div>
                 )}

                 {canEdit && !isConcluded && (
                   <div className="mt-2 pt-2 border-t border-gray-50 flex justify-start">
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         onAddTask?.();
                       }}
                       className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-dark transition-all px-2 py-1.5 rounded cursor-pointer"
                     >
                       <Plus size={14} />
                       Nova Task
                     </button>
                   </div>
                 )}
               </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

