import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PartnerList } from '../components/partners/PartnerList';
import { supabase } from '../lib/supabase';
import { Partner, Plan, Task } from '../types';
import { AlertCircle, Loader2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPartners = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const fetchAllPartners = async () => {
        let allPartners: any[] = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error: fetchError } = await supabase
            .from('partners')
            .select('id, accountancy_id, salesforce_id, nome, gerente, nivel, perfil_parceiro, perfil_servico, fila, licencas, licencas_engajadas, estoque, percentual_engajamento, gerente_id, cnpjs, cnpjs_livres, contas_potencial, ratio, segmento, atribuidas, percentual_atribuidas')
            .order('nome')
            .range(from, from + limit - 1);
          if (fetchError) throw fetchError;
          if (data && data.length > 0) {
            allPartners = [...allPartners, ...data];
            if (data.length < limit) hasMore = false;
            else from += limit;
          } else {
            hasMore = false;
          }
        }
        return allPartners;
      };

      const fetchAllPlans = async () => {
        try {
          let allPlans: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error: fetchError } = await supabase
              .from('plans')
              .select('id, partner_id, titulo, ativo, created_at, playbook_id')
              .range(from, from + limit - 1);
            if (fetchError) throw fetchError;
            if (data && data.length > 0) {
              allPlans = [...allPlans, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allPlans;
        } catch (err) {
          console.warn('Erro ao carregar planos:', err);
          return [];
        }
      };

      const fetchAllTasks = async () => {
        try {
          let allTasks: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error: fetchError } = await supabase
              .from('tasks')
              .select('id, plan_id, status')
              .is('deletada_em', null)
              .range(from, from + limit - 1);
            if (fetchError) throw fetchError;
            if (data && data.length > 0) {
              allTasks = [...allTasks, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return allTasks;
        } catch (err) {
          console.warn('Erro ao carregar tarefas:', err);
          return [];
        }
      };

      const [partnersData, plansData, tasksData] = await Promise.all([
        fetchAllPartners(),
        fetchAllPlans(),
        fetchAllTasks()
      ]);

      const tasksByPlan = new Map<string, Task[]>();
      (tasksData || []).forEach((t: any) => {
        if (!tasksByPlan.has(t.plan_id)) {
          tasksByPlan.set(t.plan_id, []);
        }
        tasksByPlan.get(t.plan_id)!.push(t);
      });

      const plansByPartner = new Map<string, Plan[]>();
      (plansData || []).forEach((p: any) => {
        const planWithTasks = {
          ...p,
          tasks: tasksByPlan.get(p.id) || []
        };
        if (!plansByPartner.has(p.partner_id)) {
          plansByPartner.set(p.partner_id, []);
        }
        plansByPartner.get(p.partner_id)!.push(planWithTasks);
      });

      if (partnersData) {
        const mappedPartners = partnersData.map(p => ({
          ...p,
          id: p.accountancy_id, // ID de exibição (ex: 70801)
          id_banco: p.id,       // Guardar UUID para referência interna se necessário
          plans: plansByPartner.get(p.id) || []
        }));

        setPartners(mappedPartners as any);
      }
    } catch (err: any) {
      console.error('Erro ao buscar dados do dashboard:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners(true);

    const handlePlanCreated = () => {
      fetchPartners(false);
    };

    window.addEventListener('plan-created', handlePlanCreated);
    return () => {
      window.removeEventListener('plan-created', handlePlanCreated);
    };
  }, []);

  const uniquePlans = [...new Set(
    partners
      .map(p => p.segmento)
      .filter(Boolean)
  )].sort();

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Gestão de Parceiros</h1>
          <p className="text-text-secondary">
            Olá, {user?.nome}. Veja como está o engajamento da sua carteira.
          </p>
        </div>
      </header>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface rounded-xl border border-border">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
          <p className="text-text-secondary">Carregando parceiros...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 bg-danger/5 rounded-xl border border-danger/20 text-danger">
          <AlertCircle className="w-10 h-10 mb-4" />
          <p className="font-medium">Erro ao carregar parceiros</p>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      ) : partners.length === 0 ? (
        <div className="py-20 text-center bg-surface rounded-xl border border-dashed border-border">
          <p className="text-xl font-medium text-text-primary mb-2">Nenhum parceiro encontrado</p>
          <p className="text-text-secondary">Importe parceiros na tela de Importação para começar.</p>
        </div>
      ) : (
        <PartnerList 
          partners={partners}
          availablePlans={uniquePlans}
        />
      )}
    </div>
  );
};

export default Dashboard;
