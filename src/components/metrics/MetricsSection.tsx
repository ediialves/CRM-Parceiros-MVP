import React from 'react';
import { Partner } from '../../types';
import { MetricsCard } from './MetricsCard';

interface MetricsSectionProps {
  partner: Partner;
}

export const MetricsSection: React.FC<MetricsSectionProps> = ({ partner }) => {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-primary">Métricas Operacionais e Financeiras</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Linha 1 */}
        <MetricsCard label="CNPJs" value={partner.cnpjs || 0} />
        <MetricsCard label="CNPJs Livres" value={partner.cnpjs_livres || 0} />
        
        {/* Linha 2 */}
        <MetricsCard label="Licenças" value={partner.licencas} />
        <MetricsCard label="Licenças Engajadas" value={partner.licencas_engajadas} />
        
        {/* Linha 3 */}
        <MetricsCard label="Engajamento %" value={partner.percentual_engajamento} suffix="%" />
        <MetricsCard label="Estoque" value={partner.estoque} />
        
        {/* Linha 4 */}
        <MetricsCard label="Contas Potencial" value={partner.contas_potencial || 0} />
        <MetricsCard label="Ratio" value={partner.ratio || 0} decimals={2} />
        
        {/* Linha 5 */}
        <MetricsCard label="Plano" value={partner.plano || 'N/A'} highlight />
        <MetricsCard label="Perfil Parceiro" value={partner.perfil_parceiro} />

        {/* Linha 6 */}
        <MetricsCard label="Perfil Serviço" value={partner.perfil_servico} />
      </div>
    </section>
  );
};
