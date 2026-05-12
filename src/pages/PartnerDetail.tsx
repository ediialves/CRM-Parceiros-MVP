import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Plus, Loader2, AlertCircle, Trash2, X } from 'lucide-react';
import { Task, Plan, Partner } from '../types';
import { PartnerHeader } from '../components/partners/PartnerHeader';
import { MetricsSection } from '../components/metrics/MetricsSection';
import { TaskList } from '../components/tasks/TaskList';
import { TaskModal } from '../components/tasks/TaskModal';
import { PlanModal } from '../components/plans/PlanModal';
import { useAuth } from '../context/AuthContext';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase';

export const PartnerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  
  // Local state for partners-related data
  const [partner, setPartner] = useState<Partner | null>(null);
  const [partnerUuid, setPartnerUuid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localPlans, setLocalPlans] = useState<Plan[]>([]);
  const [partnerTasks, setPartnerTasks] = useState<Task[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    const fetchPartnerData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        // Buscar parceiro no Supabase usando accountancy_id (que vem da URL)
        const { data, error: fetchError } = await supabase
          .from('partners')
          .select('*')
          .eq('accountancy_id', id)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          const mappedPartner: Partner = {
            ...data,
            id: data.accountancy_id // ID de exibição (70801)
          };
          setPartner(mappedPartner);
          setPartnerUuid(data.id); // UUID real para queries

          // Buscar planos reais no Supabase - USANDO data.id (UUID real)
          const { data: plansData, error: plansError } = await supabase
            .from('plans')
            .select('*')
            .eq('partner_id', data.id)
            .eq('ativo', true);

          if (plansError) throw plansError;
          setLocalPlans(plansData || []);

          if (plansData && plansData.length > 0) {
            const planIds = plansData.map(p => p.id);
            const { data: tasksData, error: tasksError } = await supabase
              .from('tasks')
              .select('*')
              .in('plan_id', planIds);

            if (tasksError) throw tasksError;
            setPartnerTasks(tasksData || []);
          } else {
            setPartnerTasks([]);
          }
        }
      } catch (err: any) {
        console.error('Erro ao buscar detalhes do parceiro:', err);
        setError(err.message || 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchPartnerData();
  }, [id]);

  // Calculating consolidated progress
  const consolidatedProgress = useMemo(() => {
    if (partnerTasks.length === 0) return 0;
    const completed = partnerTasks.filter(t => t.status === 'concluida').length;
    return (completed / partnerTasks.length) * 100;
  }, [partnerTasks]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-text-secondary">Carregando dados do parceiro...</p>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-danger">
        <AlertCircle className="w-12 h-12 mb-4" />
        <p className="text-lg font-bold">Ops! Parceiro não encontrado.</p>
        <p className="text-sm opacity-80 mb-6">{error || 'ID inválido ou inexistente.'}</p>
        <Button onClick={() => window.history.back()}>Voltar para Dashboard</Button>
      </div>
    );
  }

  // Permission check for "Novo Plano" - Allow Manager or Admin
  const canCreatePlan = isAdmin || (user && user.id === partner.gerente_id);

  // Plan actions
  const handleAddPlan = () => setIsPlanModalOpen(true);
  
  const handleSavePlan = async (name: string, startDate: string) => {
    if (!partnerUuid) return;
    try {
      const { data, error: insertError } = await supabase
        .from('plans')
        .insert({
          partner_id: partnerUuid,
          titulo: name,
          ativo: true,
          data_inicio: new Date(startDate).toISOString()
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        setLocalPlans(prev => [...prev, data]);
      }
    } catch (err: any) {
      console.error('Erro ao salvar plano:', err);
    }
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;

    try {
      setLoading(true);
      // 1. Deletar todas as tasks do plano
      const { error: tasksError } = await supabase
        .from('tasks')
        .delete()
        .eq('plan_id', planToDelete.id);

      if (tasksError) throw tasksError;

      // 2. Deletar o plano
      const { error: planError } = await supabase
        .from('plans')
        .delete()
        .eq('id', planToDelete.id);

      if (planError) throw planError;

      // 3. Atualizar estado local
      setLocalPlans(prev => prev.filter(p => p.id !== planToDelete.id));
      setPartnerTasks(prev => prev.filter(t => t.plan_id !== planToDelete.id));
      setIsDeleteDialogOpen(false);
      setPlanToDelete(null);
    } catch (err: any) {
      console.error('Erro ao excluir plano:', err);
    } finally {
      setLoading(false);
    }
  };

  // Task Actions
  const handleAddTask = (planId: string) => {
    setSelectedPlanId(planId);
    setTaskToEdit(null);
    setIsTaskModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setTaskToEdit(task);
    setIsTaskModalOpen(true);
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (deleteError) throw deleteError;
      setPartnerTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err: any) {
      console.error('Erro ao excluir task:', err);
    }
  };

  const handleToggleTaskStatus = async (taskId: string) => {
    const task = partnerTasks.find(t => t.id === taskId);
    if (!task) return;

    const newStatus: Task['status'] = task.status === 'concluida' ? 'backlog' : 'concluida';

    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskId);

      if (updateError) throw updateError;

      setPartnerTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, status: newStatus } : t
      ));
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    try {
      if (taskToEdit) {
        const { error: updateError } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', taskToEdit.id);

        if (updateError) throw updateError;

        setPartnerTasks(prev => prev.map(t => 
          t.id === taskToEdit.id ? { ...t, ...taskData } as Task : t
        ));
      } else {
        const { data, error: insertError } = await supabase
          .from('tasks')
          .insert({
            plan_id: selectedPlanId || 'manual',
            titulo: taskData.titulo || '',
            status: taskData.status || 'backlog',
            responsavel: taskData.responsavel || 'gerente',
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;

        if (data) {
          setPartnerTasks(prev => [...prev, data]);
        }
      }
      setIsTaskModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar task:', err);
    }
  };

  return (
    <div className="space-y-10 pb-20">
      <PartnerHeader partner={partner} />
      
      <MetricsSection partner={partner} />

      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold text-primary">Planos de Engajamento</h2>
            <p className="text-sm text-text-secondary">Acompanhe e crie estratégias para este parceiro.</p>
          </div>
          {canCreatePlan && (
            <Button onClick={handleAddPlan} className="flex items-center gap-2">
              <Plus size={18} />
              Novo Plano
            </Button>
          )}
        </div>

        {/* Consolidated Progress */}
        <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Progresso Consolidado</span>
            <span className="text-2xl font-black text-primary">{Math.round(consolidatedProgress)}%</span>
          </div>
          <ProgressBar progress={consolidatedProgress} className="h-4" />
          <p className="text-xs text-text-secondary mt-3">
            Baseado em {partnerTasks.length} tasks totais em {localPlans.length} planos ativos.
          </p>
        </div>

        <div className="space-y-2">
          {localPlans.length > 0 ? (
            localPlans.map(plan => {
              const tasksForPlan = partnerTasks.filter(t => t.plan_id === plan.id);
              return (
                <div key={plan.id} className="py-8 border-t border-border group/plan">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-text-primary">{plan.titulo}</h3>
                        {canCreatePlan && (
                          <button 
                            onClick={() => {
                              setPlanToDelete(plan);
                              setIsDeleteDialogOpen(true);
                            }}
                            className="p-1 text-text-secondary hover:text-danger opacity-0 group-hover/plan:opacity-100 transition-all"
                            title="Excluir plano"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="hidden sm:inline text-gray-300">|</span>
                        <span>Início: {new Date(plan.data_inicio || plan.created_at).toLocaleDateString('pt-BR')}</span>
                        <span>·</span>
                        <span className="font-medium">{tasksForPlan.length} tasks</span>
                      </div>
                    </div>
                    
                    <Button 
                      onClick={() => handleAddTask(plan.id)}
                      variant="ghost" 
                      className="text-primary hover:text-primary-dark text-xs font-bold py-1 h-auto flex items-center gap-1 opacity-0 group-hover/plan:opacity-100 transition-opacity"
                    >
                      <Plus size={14} />
                      Nova Task
                    </Button>
                  </div>

                  <div className="pl-2">
                    <TaskList 
                      tasks={tasksForPlan} 
                      onEditTask={handleEditTask}
                      onDeleteTask={handleDeleteTask}
                      onToggleStatus={handleToggleTaskStatus}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center bg-surface rounded-xl border border-dashed border-border mt-8">
              <p className="text-text-secondary italic">Nenhum plano de ação ativo.</p>
              {canCreatePlan && (
                <Button variant="ghost" onClick={handleAddPlan} className="mt-4 text-primary text-sm font-bold">
                  Começar agora
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      <TaskModal 
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleSaveTask}
        taskToEdit={taskToEdit}
      />

      <PlanModal 
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        onSave={handleSavePlan}
      />

      {/* Modal de Exclusão de Plano */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-border bg-gray-50/50">
              <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                <Trash2 size={20} className="text-danger" />
                Confirmar Exclusão
              </h3>
              <button 
                onClick={() => setIsDeleteDialogOpen(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-center sm:text-left">
              <p className="text-text-primary font-medium">
                Tem certeza que deseja excluir o plano <span className="text-primary">"{planToDelete?.titulo}"</span>?
              </p>
              <p className="text-sm text-text-secondary leading-relaxed bg-red-50 p-4 rounded-lg border border-red-100 flex items-start gap-3">
                <AlertCircle size={18} className="text-danger shrink-0 mt-0.5" />
                <span>Esta ação é irreversível. Todas as tasks vinculadas a este plano serão permanentemente removidas.</span>
              </p>
            </div>
            
            <div className="flex items-center gap-3 p-6 bg-gray-50/50 border-t border-border">
              <Button 
                variant="ghost" 
                onClick={() => setIsDeleteDialogOpen(false)}
                className="flex-1 font-bold"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleDeletePlan}
                className="flex-1 bg-danger hover:bg-red-600 text-white font-bold"
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerDetail;
