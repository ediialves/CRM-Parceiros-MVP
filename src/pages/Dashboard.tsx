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

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        setLoading(true);
        const { data: partnersData, error: fetchError } = await supabase
          .from('partners')
          .select(`
            *,
            plans (
              *,
              tasks (*)
            )
          `)
          .order('nome');

        if (fetchError) throw fetchError;
        
        if (partnersData) {
          // Mapear parceiros para o tipo esperado (incluindo os dados aninhados para uso no List/Card)
          const mappedPartners = partnersData.map(p => ({
            ...p,
            id: p.accountancy_id, // ID de exibição (ex: 70801)
            id_banco: p.id        // Guardar UUID para referência interna se necessário
          }));

          setPartners(mappedPartners as any);
        }
      } catch (err: any) {
        console.error('Erro ao buscar dados do dashboard:', err);
        setError(err.message || 'Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchPartners();
  }, []);

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
        />
      )}
    </div>
  );
};

export default Dashboard;
