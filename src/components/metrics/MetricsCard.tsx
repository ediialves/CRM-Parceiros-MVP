import React from 'react';

interface MetricsCardProps {
  label: string;
  value: number | string;
  highlight?: boolean;
  suffix?: string;
  decimals?: number;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ label, value, highlight, suffix, decimals = 0 }) => {
  // Formatar se for número
  const displayValue = typeof value === 'number' && !isNaN(value)
    ? new Intl.NumberFormat('pt-BR', { 
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals
      }).format(value)
    : String(value);

  return (
    <div className={`p-4 rounded-xl border ${highlight ? 'bg-primary/5 border-primary/20' : 'bg-surface border-border'}`}>
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-1">
        {label}
      </span>
      <span className={`text-xl font-bold ${highlight ? 'text-primary' : 'text-text-primary'}`}>
        {displayValue}{suffix}
      </span>
    </div>
  );
};
