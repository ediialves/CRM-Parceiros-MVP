import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Plus, Play, Loader2, AlertCircle, Trash2, X } from 'lucide-react';
import { Task, Plan, Partner } from '../types';
import { PartnerHeader } from '../components/partners/PartnerHeader';
import { MetricsSection } from '../components/metrics/MetricsSection';
import { PartnerHistoryChart } from '../components/partners/PartnerHistoryChart';
import { TaskList } from '../components/tasks/TaskList';
import { TaskModal } from '../components/tasks/TaskModal';
import { PlanModal } from '../components/plans/PlanModal';
import { PlanCard } from '../components/plans/PlanCard';
import { PlanConclusionModal } from '../components/plans/PlanConclusionModal';
import { useAuth } from '../context/AuthContext';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Button } from '../components/ui/Button';
import { supabase } from '../lib/supabase';
import { AddPlaybookModal } from '../components/playbooks/AddPlaybookModal';

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
  const [isPlaybookModalOpen, setIsPlaybookModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [isConclusionModalOpen, setIsConclusionModalOpen] = useState(false);
  const [planToConclude, setPlanToConclude] = useState<Plan | null>(null);

  const fetchPartnerData = async (showLoading = true) => {
    if (!id) return;

    try {
      if (showLoading) setLoading(true);
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

        // Buscar todos os planos reais no Supabase - USANDO data.id (UUID real) ordenados por data
        const { data: plansData, error: plansError } = await supabase
          .from('plans')
          .select('*')
          .eq('partner_id', data.id)
          .order('created_at', { ascending: false });

        if (plansError) throw plansError;
        setLocalPlans(plansData || []);

        if (plansData && plansData.length > 0) {
          const planIds = plansData.map(p => p.id);
          setExpandedPlanId(prev => prev || planIds[0]); // Primeiro plano aberto por padrão se nenhum aberto
          const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .select('*')
            .in('plan_id', planIds)
            .is('deletada_em', null);

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
      if (showLoading) setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchPartnerData(true);
  }, [id]);

  // Calculating consolidated progress
  const consolidatedProgress = useMemo(() => {
    if (partnerTasks.length === 0) return 0;
    const completed = partnerTasks.filter(t => t.status === 'concluida').length;
    return (completed / partnerTasks.length) * 100;
  }, [partnerTasks]);

  // Check if current taskToEdit belongs to an automatic plan (created via playbook)
  const isTaskToEditAutomatic = useMemo(() => {
    if (!taskToEdit) return false;
    const parentPlan = localPlans.find(p => p.id === taskToEdit.plan_id);
    return !!(parentPlan && parentPlan.playbook_id);
  }, [taskToEdit, localPlans]);

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

  // Permission checks
  const isOwnerManager = Boolean(user && partner && user.id === partner.gerente_id);
  const canCreatePlan = isAdmin || isOwnerManager;

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
        setLocalPlans(prev => [data, ...prev]);
        setExpandedPlanId(data.id);
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
        .update({ deletada_em: new Date().toISOString() })
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

    // Toggle logic
    if (task.status === 'concluida') {
      // Reopening a task - normal flow
      try {
        const { error: updateError } = await supabase
          .from('tasks')
          .update({ status: 'backlog' })
          .eq('id', taskId);

        if (updateError) throw updateError;

        setPartnerTasks(prev => prev.map(t => 
          t.id === taskId ? { ...t, status: 'backlog' } : t
        ));
      } catch (err: any) {
        console.error('Erro ao atualizar status:', err);
      }
      return;
    }

    // Attempting to complete a task
    const plan = localPlans.find(p => p.id === task.plan_id);
    const tasksForPlan = partnerTasks.filter(t => t.plan_id === task.plan_id);
    const remainingTasks = tasksForPlan.filter(t => t.status !== 'concluida');

    // Trigger automático ao concluir a última task pendente de um plano ativo
    if (remainingTasks.length === 1 && remainingTasks[0].id === taskId && plan && plan.ativo && !plan.status_conclusao) {
      setPlanToConclude(plan);
      setIsConclusionModalOpen(true);
      return;
    }

    // Normal flow
    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: 'concluida' })
        .eq('id', taskId);

      if (updateError) throw updateError;

      setPartnerTasks(prev => prev.map(t => 
        t.id === taskId ? { ...t, status: 'concluida' } : t
      ));
    } catch (err: any) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const handleSaveTask = async (taskDataArray: Partial<Task>[]) => {
    try {
      if (taskToEdit) {
        // Para edição, pegamos apenas o primeiro item
        const taskData = taskDataArray[0];
        const { error: updateError } = await supabase
          .from('tasks')
          .update(taskData)
          .eq('id', taskToEdit.id);

        if (updateError) throw updateError;

        setPartnerTasks(prev => prev.map(t => 
          t.id === taskToEdit.id ? { ...t, ...taskData } as Task : t
        ));
      } else {
        // Para criação, inserimos todos os itens do array
        const { data, error: insertError } = await supabase
          .from('tasks')
          .insert(taskDataArray.map(t => ({
            plan_id: selectedPlanId || 'manual',
            titulo: t.titulo || '',
            status: t.status || 'backlog',
            responsavel: t.responsavel || 'gerente',
            created_at: new Date().toISOString(),
            data_conclusao_prevista: t.data_conclusao_prevista || null,
            data_conclusao_original: t.data_conclusao_prevista || null,
          })))
          .select();

        if (insertError) throw insertError;

        if (data) {
          setPartnerTasks(prev => [...prev, ...data]);
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
      
      <PartnerHistoryChart 
        partnerId={id} 
        partnerUuid={partnerUuid} 
        accountancyId={partner?.accountancy_id || id} 
      />

      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h2 className="text-xl font-bold text-primary">Planos de Engajamento</h2>
            <p className="text-sm text-text-secondary">Acompanhe e crie estratégias para este parceiro.</p>
          </div>
          {canCreatePlan && (
            <div className="flex flex-wrap items-center gap-2">
              <Button 
                onClick={() => setIsPlaybookModalOpen(true)} 
                variant="secondary"
                className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary border-none"
              >
                <Play size={14} className="fill-current" />
                Aplicar Playbook
              </Button>
              <Button onClick={handleAddPlan} className="flex items-center gap-2">
                <Plus size={18} />
                Novo Plano
              </Button>
            </div>
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
            Baseado em {partnerTasks.length} tasks totais em {localPlans.length} planos.
          </p>
        </div>

        <div className="space-y-4">
          {localPlans.length > 0 ? (
            localPlans.map(plan => {
              const tasksForPlan = partnerTasks.filter(t => t.plan_id === plan.id);
              const planProgress = tasksForPlan.length > 0 
                ? (tasksForPlan.filter(t => t.status === 'concluida').length / tasksForPlan.length) * 100
                : 0;

              // Botão Concluir Plano: visível para admin ou gerente dono se o plano estiver ativo e sem status_conclusao
              const canConclude = (isAdmin || isOwnerManager) && plan.ativo === true && !plan.status_conclusao;

              return (
                <PlanCard 
                  key={plan.id}
                  plan={plan}
                  tasks={tasksForPlan}
                  progress={planProgress}
                  isExpanded={expandedPlanId === plan.id}
                  onToggle={() => setExpandedPlanId(prev => prev === plan.id ? null : plan.id)}
                  onPlanUpdate={(updated) => setLocalPlans(prev => prev.map(p => p.id === updated.id ? updated : p))}
                  onAddTask={() => handleAddTask(plan.id)}
                  onDeletePlan={() => {
                    setPlanToDelete(plan);
                    setIsDeleteDialogOpen(true);
                  }}
                  onEditTask={handleEditTask}
                  onDeleteTask={handleDeleteTask}
                  onToggleTaskStatus={handleToggleTaskStatus}
                  onConcludePlan={() => {
                    setPlanToConclude(plan);
                    setIsConclusionModalOpen(true);
                  }}
                  canEdit={canCreatePlan}
                  canConclude={canConclude}
                />
              );
            })
          ) : (
            <div className="p-12 text-center bg-surface rounded-xl border border-dashed border-border mt-8">
              <p className="text-text-secondary italic">Nenhum plano de ação ativo.</p>
              {canCreatePlan && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <Button 
                    variant="ghost" 
                    onClick={() => setIsPlaybookModalOpen(true)} 
                    className="text-primary text-sm font-bold flex items-center gap-1.5"
                  >
                    <Play size={12} className="fill-current" />
                    Aplicar Playbook
                  </Button>
                  <span className="text-text-secondary text-xs">•</span>
                  <Button variant="ghost" onClick={handleAddPlan} className="text-primary text-sm font-bold">
                    Começar agora
                  </Button>
                </div>
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
        isAutomatic={isTaskToEditAutomatic}
      />

      <PlanModal 
        isOpen={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        onSave={handleSavePlan}
      />

      {isPlaybookModalOpen && partner && (
        <AddPlaybookModal
          partnerId={partnerUuid || partner.id_banco || partner.id}
          partnerName={partner.nome}
          onClose={() => setIsPlaybookModalOpen(false)}
          onSuccess={() => fetchPartnerData(false)}
        />
      )}

      {/* Modal de Conclusão de Plano */}
      {isConclusionModalOpen && planToConclude && user && (
        <PlanConclusionModal
          isOpen={isConclusionModalOpen}
          onClose={() => {
            setIsConclusionModalOpen(false);
            setPlanToConclude(null);
          }}
          planId={planToConclude.id}
          planTitle={planToConclude.titulo}
          userId={user.id}
          onSuccess={() => fetchPartnerData(false)}
        />
      )}

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
