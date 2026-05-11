import React from 'react';

interface MetricsCardProps {
  label: string;
  value: number;
  highlight?: boolean;
  suffix?: string;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ label, value, highlight, suffix }) => {
  // Formatar como número inteiro sem casas decimais
  const formattedValue = new Intl.NumberFormat('pt-BR', { 
    maximumFractionDigits: 0 
  }).format(value);

  return (
    <div className={`p-4 rounded-xl border ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-surface border-border'}`}>
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
        {label}
      </span>
      <span className={`text-xl font-bold ${highlight ? 'text-primary' : 'text-text-primary'}`}>
        {formattedValue}{suffix}
      </span>
    </div>
  );
};
