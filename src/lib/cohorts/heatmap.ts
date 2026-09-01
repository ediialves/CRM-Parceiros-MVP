import React from 'react';

export type HeatDomain = { min: number; max: number };

export const formatCohortWeekLabel = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
};

export const getCohortHeatmapStyle = (val: number | null, domain?: HeatDomain): { style: React.CSSProperties; className: string } => {
  if (val === null || val === undefined || isNaN(val)) {
    return { style: {}, className: '' };
  }

  // A escala usa o range real dos valores exibidos na tabela (em vez de assumir 0-100 fixo),
  // para que o contraste branco -> verde claro use toda a amplitude disponível.
  const min = domain?.min ?? 0;
  const max = domain?.max ?? 100;
  const span = max - min || 1;
  const clamped = Math.max(min, Math.min(max, val));
  const factor = (clamped - min) / span;

  // Escala contínua branco -> verde claro (menor valor do range = branco, maior = Green-400).
  // Mantida propositalmente clara em toda a faixa para que uma única cor de texto (slate-900)
  // funcione em toda célula, sem precisar alternar cor de fonte por contraste.
  const from: [number, number, number] = [255, 255, 255];
  const to: [number, number, number] = [74, 222, 128];

  const r = Math.round(from[0] + factor * (to[0] - from[0]));
  const g = Math.round(from[1] + factor * (to[1] - from[1]));
  const b = Math.round(from[2] + factor * (to[2] - from[2]));

  const textColor = 'rgb(15, 23, 42)';

  let fontWeightClass = 'font-medium';
  if (factor >= 0.85) fontWeightClass = 'font-bold';
  else if (factor >= 0.65) fontWeightClass = 'font-semibold';

  return {
    style: {
      backgroundColor: `rgb(${r}, ${g}, ${b})`,
      color: textColor,
    },
    className: fontWeightClass,
  };
};

// Mesma escala branco -> verde claro usada em todos os heatmaps de coorte.
export const getCohortBaseFixaHeatmapStyle = (val: number | null, domain?: HeatDomain): { style: React.CSSProperties; className: string } => {
  return getCohortHeatmapStyle(val, domain);
};
