import React, { useState } from 'react';
import { NewMrrSale } from '../../types';
import { TrendingUp, ChevronDown, ChevronUp, Info } from 'lucide-react';

const formatBRL = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatSaleDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('T')[0].split('-');
  return `${day}/${month}/${year}`;
};

interface NewMrrPanelProps {
  sales?: NewMrrSale[];
}

export const NewMrrPanel: React.FC<NewMrrPanelProps> = ({ sales: salesProp }) => {
  const [showSales, setShowSales] = useState(false);

  const sales = salesProp ?? [];
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  const cutoff1m = daysAgo(30);
  const cutoff3m = daysAgo(90);
  const cutoff6m = daysAgo(180);

  const parseSaleDate = (s: NewMrrSale) =>
    new Date(`${s.data_venda.split('T')[0]}T00:00:00`);

  const aggregate = (cutoff: Date) => {
    let total = 0;
    let count = 0;
    for (const s of sales) {
      const d = parseSaleDate(s);
      if (d >= cutoff) {
        total += Number(s.valor_new_mrr) || 0;
        count += 1;
      }
    }
    return { total, count };
  };

  const mrr1m = aggregate(cutoff1m);
  const mrr3m = aggregate(cutoff3m);
  const mrr6m = aggregate(cutoff6m);

  const sortedSales = [...sales].sort(
    (a, b) => parseSaleDate(b).getTime() - parseSaleDate(a).getTime()
  );

  if (sales.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-success/5 border border-success/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-success" />
          <span className="text-[10px] uppercase tracking-wider text-success font-semibold">New MRR (vendas)</span>
          <Info
            className="w-3 h-3 text-text-secondary shrink-0 cursor-help"
            title="Soma das vendas novas por licença (BigQuery). Pode divergir levemente do New MRR oficial."
          />
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-text-primary">{formatBRL(mrr6m.total)}</span>
          <span className="text-[10px] text-text-secondary ml-1">
            · {mrr6m.count} {mrr6m.count === 1 ? 'venda' : 'vendas'} (6m)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-text-secondary">
        <span>
          1m: <span className="font-semibold text-text-primary">{formatBRL(mrr1m.total)}</span>
          <span className="ml-0.5">({mrr1m.count})</span>
        </span>
        <span>
          3m: <span className="font-semibold text-text-primary">{formatBRL(mrr3m.total)}</span>
          <span className="ml-0.5">({mrr3m.count})</span>
        </span>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowSales(prev => !prev);
        }}
        className="flex items-center gap-1 text-[10px] font-semibold text-success hover:text-success/80 transition-colors self-start"
      >
        {showSales ? (
          <>
            <ChevronUp className="w-3 h-3" /> Ocultar vendas
          </>
        ) : (
          <>
            <ChevronDown className="w-3 h-3" /> Ver vendas
          </>
        )}
      </button>

      {showSales && (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
          {sortedSales.map((s, idx) => (
            <div
              key={`${s.data_venda}-${idx}`}
              className="flex items-center justify-between gap-2 text-[10px] text-text-secondary border-b border-success/10 last:border-b-0 pb-1"
            >
              <span className="truncate">
                {formatSaleDate(s.data_venda)} · {s.produto || '—'} · {s.canal || '—'}
              </span>
              <span className="font-semibold text-text-primary whitespace-nowrap">
                {formatBRL(Number(s.valor_new_mrr) || 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NewMrrPanel;
