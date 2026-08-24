import React from 'react';
import { 
  FileText, 
  Link, 
  Package, 
  TrendingUp, 
  Users, 
  Building2, 
  Star, 
  PieChart 
} from 'lucide-react';
import { Partner } from '../../types';
import { MetricsCard } from './MetricsCard';

interface MetricsSectionProps {
  partner: Partner;
}

export const MetricsSection: React.FC<MetricsSectionProps> = ({ partner }) => {
  return (
    <div className="space-y-8">
      {/* Seção 1: Visão Geral do Parceiro */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-primary">Visão Geral do Parceiro</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Linha 1 */}
          <MetricsCard 
            label="Licenças" 
            value={partner.licencas} 
            subtitle="licenças totais"
            icon={<FileText size={20} />}
            iconBgColor="bg-blue-50"
            iconColor="text-blue-600"
          />
          <MetricsCard 
            label="Licenças Engajadas" 
            value={partner.licencas_engajadas} 
            subtitle="em uso ativo"
            icon={<Link size={20} />}
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />
          <MetricsCard 
            label="Estoque" 
            value={partner.estoque} 
            subtitle="licenças disponíveis"
            icon={<Package size={20} />}
            iconBgColor="bg-amber-50"
            iconColor="text-amber-600"
          />
          <MetricsCard 
            label="Engajamento %" 
            value={partner.percentual_engajamento} 
            suffix="%" 
            subtitle="das licenças"
            icon={<TrendingUp size={20} />}
            iconBgColor="bg-indigo-50"
            iconColor="text-indigo-600"
          />
          
          {/* Linha 2 */}
          <MetricsCard 
            label="CNPJs" 
            value={partner.cnpjs || 0} 
            subtitle="carteira total"
            icon={<Users size={20} />}
            iconBgColor="bg-purple-50"
            iconColor="text-purple-600"
          />
          <MetricsCard 
            label="CNPJs Livres" 
            value={partner.cnpjs_livres || 0} 
            subtitle="sem sistema"
            icon={<Building2 size={20} />}
            iconBgColor="bg-cyan-50"
            iconColor="text-cyan-600"
          />
          <MetricsCard 
            label="Contas Potencial" 
            value={partner.contas_potencial || 0} 
            subtitle="para expansão"
            icon={<Star size={20} />}
            iconBgColor="bg-rose-50"
            iconColor="text-rose-600"
          />
          <MetricsCard 
            label="Ratio" 
            value={partner.ratio || 0} 
            decimals={2} 
            subtitle="licenças / cnpj"
            icon={<PieChart size={20} />}
            iconBgColor="bg-teal-50"
            iconColor="text-teal-600"
          />
        </div>
      </section>

      {/* Seção 2: Atributos do Parceiro */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-primary">Atributos do Parceiro</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricsCard label="Plano" value={partner.segmento || 'N/A'} highlight />
          <MetricsCard label="Perfil Serviço" value={partner.perfil_servico} />
          <MetricsCard label="% Atribuídas" value={partner.percentual_atribuidas || 0} suffix="%" />
          <MetricsCard label="Perfil Parceiro" value={partner.perfil_parceiro} />
          <MetricsCard label="Atribuídas" value={partner.atribuidas || 0} />
        </div>
      </section>
    </div>
  );
};

