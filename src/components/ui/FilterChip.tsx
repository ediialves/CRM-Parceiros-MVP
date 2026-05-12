import React from 'react';
import { X } from 'lucide-react';

interface FilterChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}

export const FilterChip: React.FC<FilterChipProps> = ({ label, value, onRemove }) => {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-background border border-border rounded-full shadow-sm animate-in fade-in zoom-in duration-200">
      <span className="text-xs font-medium text-text-primary">
        {label}: <span className="text-text-secondary font-normal">{value}</span>
      </span>
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-red-50 text-text-secondary hover:text-red-500 rounded-full transition-colors"
        title="Remover filtro"
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  );
};
