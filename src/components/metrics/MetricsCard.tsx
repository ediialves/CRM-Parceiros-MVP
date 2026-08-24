import React from 'react';

interface MetricsCardProps {
  label: string;
  value: number | string;
  subtitle?: string;
  highlight?: boolean;
  suffix?: string;
  decimals?: number;
  icon?: React.ReactNode;
  iconBgColor?: string;
  iconColor?: string;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({ 
  label, 
  value, 
  subtitle,
  highlight, 
  suffix, 
  decimals = 0,
  icon,
  iconBgColor = 'bg-primary/10',
  iconColor = 'text-primary'
}) => {
  // Formatar se for número
  const displayValue = typeof value === 'number' && !isNaN(value)
    ? new Intl.NumberFormat('pt-BR', { 
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals
      }).format(value)
    : String(value);

  return (
    <div className={`p-4 rounded-xl border flex items-start gap-3.5 transition-all ${
      highlight ? 'bg-primary/5 border-primary/20' : 'bg-surface border-border'
    }`}>
      {icon && (
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconBgColor} ${iconColor}`}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block mb-0.5 truncate">
          {label}
        </span>
        <div className={`text-xl font-bold leading-tight ${highlight ? 'text-primary' : 'text-text-primary'}`}>
          {displayValue}{suffix}
        </div>
        {subtitle && (
          <span className="text-xs text-text-secondary mt-1 block">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

