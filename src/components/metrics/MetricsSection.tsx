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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricsCard label="MRR Atual" value={partner.mrr} highlight />
        <MetricsCard label="Estoque (Licenças)" value={partner.estoque} />
        <MetricsCard label="Penetração" value={partner.penetracao} suffix="%" />
        <MetricsCard label="Exportações (90d)" value={partner.exportacoes_90d} />
        <div className="p-4 rounded-xl border bg-surface border-border flex flex-col justify-center">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
            Fila / Segmentação
          </span>
          <span className="text-sm font-bold text-primary">
            {partner.fila} • {partner.segmentacao.split(' - ')[0]}
          </span>
        </div>
      </div>
    </section>
  );
};
