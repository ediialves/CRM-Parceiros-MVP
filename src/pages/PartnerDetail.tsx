import React, { useState, useMemo, useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Task, Plan } from '../types';
import { mockPartners } from '../lib/mock/partners';
import { mockPlans } from '../lib/mock/plans';
import { mockTasks } from '../lib/mock/tasks';
import { PartnerHeader } from '../components/partners/PartnerHeader';
import { MetricsSection } from '../components/metrics/MetricsSection';
import { TaskList } from '../components/tasks/TaskList';
import { TaskModal } from '../components/tasks/TaskModal';
import { PlanModal } from '../components/plans/PlanModal';
import { useAuth } from '../context/AuthContext';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Button } from '../components/ui/Button';

export const PartnerDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  
  // Local state for partners-related data
  const [localPlans, setLocalPlans] = useState<Plan[]>([]);
  const [partnerTasks, setPartnerTasks] = useState<Task[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const partner = useMemo(() => mockPartners.find(p => p.id === id), [id]);

  // Initial load
  useEffect(() => {
    if (id) {
      const plans = mockPlans.filter(p => p.partner_id === id && p.ativo);
      setLocalPlans(plans);
      
      const planIds = plans.map(p => p.id);
      const initialTasks = mockTasks.filter(t => planIds.includes(t.plan_id));
      setPartnerTasks(initialTasks);
    }
  }, [id]);

  if (!partner) {
    return <Navigate to="/dashboard" replace />;
  }

  // Permission check for "Novo Plano" - Allow Manager or Admin
  const canCreatePlan = isAdmin || user.id === partner.gerente_responsavel_id;

  // Calculating consolidated progress
  const consolidatedProgress = useMemo(() => {
    if (partnerTasks.length === 0) return 0;
    const completed = partnerTasks.filter(t => t.status === 'concluida').length;
    return (completed / partnerTasks.length) * 100;
  }, [partnerTasks]);

  // Plan actions
  const handleAddPlan = () => setIsPlanModalOpen(true);
  
  const handleSavePlan = (name: string, startDate: string) => {
    const newPlan: Plan = {
      id: `pl-new-${Date.now()}`,
      partner_id: partner.id,
      titulo: name,
      ativo: true,
      created_at: startDate,
    };
    setLocalPlans(prev => [...prev, newPlan]);
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

  const handleDeleteTask = (taskId: string) => {
    setPartnerTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleToggleTaskStatus = (taskId: string) => {
    setPartnerTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newStatus: Task['status'] = t.status === 'concluida' ? 'backlog' : 'concluida';
        return { ...t, status: newStatus };
      }
      return t;
    }));
  };

  const handleSaveTask = (taskData: Partial<Task>) => {
    if (taskToEdit) {
      setPartnerTasks(prev => prev.map(t => 
        t.id === taskToEdit.id ? { ...t, ...taskData } as Task : t
      ));
    } else {
      const newTask: Task = {
        id: `t-new-${Date.now()}`,
        plan_id: selectedPlanId || 'manual',
        titulo: taskData.titulo || '',
        status: taskData.status || 'backlog',
        responsavel: taskData.responsavel || 'gerente',
        created_at: new Date().toISOString(),
      };
      setPartnerTasks(prev => [...prev, newTask]);
    }
    setIsTaskModalOpen(false);
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
                      <h3 className="text-lg font-bold text-text-primary">{plan.titulo}</h3>
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <span className="hidden sm:inline text-gray-300">|</span>
                        <span>Início: {new Date(plan.created_at).toLocaleDateString('pt-BR')}</span>
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
    </div>
  );
};

export default PartnerDetail;
