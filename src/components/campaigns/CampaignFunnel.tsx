import React from 'react';
import { Trash2, TrendingUp, BarChart3 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ChartTitle,
  ChartTooltip,
  Legend
);

interface CampaignPartnerData {
  id: string;
  status: string;
  entrou_nao_abordado_em?: string | null;
  entrou_abordado_em?: string | null;
  entrou_reuniao_marcada_em?: string | null;
  entrou_proposta_apresentada_em?: string | null;
  entrou_converteu_em?: string | null;
  entrou_perdeu_em?: string | null;
  partners?: {
    gerente?: string | null;
    segmento?: string | null;
    perfil_parceiro?: string | null;
  } | null;
}

interface CampaignFunnelProps {
  partnersData: CampaignPartnerData[];
  selectedManagers?: string[];
  selectedPerfis?: string[];
  isAdmin?: boolean;
}

export const CampaignFunnel: React.FC<CampaignFunnelProps> = ({
  partnersData,
  selectedManagers = [],
  selectedPerfis = [],
  isAdmin = false,
}) => {
  // Filter data based on selected managers if admin and selected perfis
  const filteredData = partnersData.filter(p => {
    if (isAdmin && selectedManagers.length > 0) {
      if (!p.partners?.gerente || !selectedManagers.includes(p.partners.gerente)) {
        return false;
      }
    }
    if (selectedPerfis.length > 0) {
      const perfil = p.partners?.perfil_parceiro?.trim();
      const hasMatch = selectedPerfis.some(sel => {
        if (sel === 'Sem perfil') {
          return !perfil || perfil === 'Sem perfil';
        }
        return perfil === sel;
      });
      if (!hasMatch) return false;
    }
    return true;
  });

  const total = filteredData.length;

  const countAbordado = filteredData.filter(p => p.entrou_abordado_em != null).length;
  const countReuniao = filteredData.filter(p => p.entrou_reuniao_marcada_em != null).length;
  const countProposta = filteredData.filter(p => p.entrou_proposta_apresentada_em != null).length;
  const countConverteu = filteredData.filter(p => p.entrou_converteu_em != null).length;
  const countPerdeu = filteredData.filter(p => p.entrou_perdeu_em != null).length;

  const pctTotal = total > 0 ? 100 : 0;
  const pctAbordado = total > 0 ? Math.round((countAbordado / total) * 100) : 0;
  const pctReuniao = total > 0 ? Math.round((countReuniao / total) * 100) : 0;
  const pctProposta = total > 0 ? Math.round((countProposta / total) * 100) : 0;
  const pctConverteu = total > 0 ? Math.round((countConverteu / total) * 100) : 0;

  // Enforce tapering constraint and a minimum visual width of 20%
  const w0 = 100;
  const w1 = Math.max(Math.min(w0, total > 0 ? pctAbordado : 20), 20);
  const w2 = Math.max(Math.min(w1, total > 0 ? pctReuniao : 20), 20);
  const w3 = Math.max(Math.min(w2, total > 0 ? pctProposta : 20), 20);
  const w4 = Math.max(Math.min(w3, total > 0 ? pctConverteu : 20), 20);

  const getClipPath = (topWidth: number, bottomWidth: number) => {
    const topHalf = topWidth / 2;
    const bottomHalf = bottomWidth / 2;
    return `polygon(${50 - topHalf}% 0%, ${50 + topHalf}% 0%, ${50 + bottomHalf}% 100%, ${50 - bottomHalf}% 100%)`;
  };

  const stages = [
    { 
      label: 'Não Abordado', 
      count: total, 
      pct: pctTotal, 
      bgClass: 'bg-indigo-600 text-white', 
      dotClass: 'bg-indigo-600',
      clipPath: getClipPath(w0, w1)
    },
    { 
      label: 'Abordado', 
      count: countAbordado, 
      pct: pctAbordado, 
      bgClass: 'bg-indigo-500 text-white', 
      dotClass: 'bg-indigo-500',
      clipPath: getClipPath(w1, w2)
    },
    { 
      label: 'Reunião Marcada', 
      count: countReuniao, 
      pct: pctReuniao, 
      bgClass: 'bg-indigo-400 text-indigo-950', 
      dotClass: 'bg-indigo-400',
      clipPath: getClipPath(w2, w3)
    },
    { 
      label: 'Proposta Apresentada', 
      count: countProposta, 
      pct: pctProposta, 
      bgClass: 'bg-indigo-300 text-indigo-950', 
      dotClass: 'bg-indigo-300',
      clipPath: getClipPath(w3, w4)
    },
    { 
      label: 'Converteu', 
      count: countConverteu, 
      pct: pctConverteu, 
      bgClass: 'bg-indigo-200 text-indigo-900', 
      dotClass: 'bg-indigo-200',
      clipPath: getClipPath(w4, Math.max(w4 * 0.6, 12))
    },
  ];

  // Aggregating segment data
  const segmentCounts: Record<string, number> = {};
  filteredData.forEach((p) => {
    const seg = p.partners?.segmento?.trim() || 'Sem segmento';
    segmentCounts[seg] = (segmentCounts[seg] || 0) + 1;
  });

  const sortedSegments = Object.entries(segmentCounts).sort((a, b) => b[1] - a[1]);
  const segmentLabels = sortedSegments.map(([seg]) => seg);
  const segmentValues = sortedSegments.map(([, count]) => count);

  const barChartData = {
    labels: segmentLabels.length > 0 ? segmentLabels : ['Sem dados'],
    datasets: [
      {
        label: 'Parceiros',
        data: segmentValues.length > 0 ? segmentValues : [0],
        backgroundColor: '#6366f1',
        hoverBackgroundColor: '#4f46e5',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 32,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#f8fafc',
        padding: 8,
        cornerRadius: 8,
        callbacks: {
          label: (context: any) => ` ${context.raw} parceiro(s)`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#64748b',
          font: {
            size: 10,
            weight: 500,
          },
        },
        border: {
          display: false,
        },
      },
      y: {
        grid: {
          color: 'rgba(226, 232, 240, 0.6)',
        },
        ticks: {
          color: '#64748b',
          stepSize: 1,
          precision: 0,
          font: {
            size: 10,
          },
        },
        border: {
          display: false,
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 shadow-xs shrink-0" id="campaign-conversion-funnel">
      <div className="flex flex-col xl:flex-row gap-6 items-stretch">
        
        {/* BLOCK 1: FUNIL DE CONVERSÃO */}
        <div className="flex-[1.3] flex flex-col justify-between min-w-[300px]">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-text-primary">Funil de Conversão</h2>
            {isAdmin && selectedManagers.length > 0 && (
              <span className="text-[10px] text-text-secondary bg-gray-100 px-2 py-0.5 rounded-full font-semibold">
                Filtrado
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Column 1: Centered Trapezoidal Funnel (md:col-span-6) */}
            <div className="md:col-span-6 flex flex-col items-center justify-center gap-1.5 w-full min-h-[190px]">
              {stages.map((stage, idx) => (
                <div
                  key={idx}
                  style={{
                    width: '100%',
                    clipPath: stage.clipPath,
                  }}
                  className={`h-8 flex items-center justify-center font-bold text-xs shadow-xs transition-all duration-300 hover:brightness-105 select-none ${stage.bgClass}`}
                  title={`${stage.label}: ${stage.count} (${stage.pct}%)`}
                >
                  <span>{stage.count}</span>
                </div>
              ))}
            </div>

            {/* Column 2: Legends (md:col-span-6) */}
            <div className="md:col-span-6 flex flex-col justify-center gap-2 pl-0 md:pl-2">
              {stages.map((stage, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full border border-black/5 shrink-0 ${stage.dotClass}`} />
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="font-semibold text-text-primary truncate text-[11px]">
                      {stage.label}
                    </span>
                    <span className="text-text-secondary font-medium shrink-0 text-[11px]">
                      · {stage.pct}%
                    </span>
                    <span className="text-[10px] text-text-secondary/60 shrink-0">
                      ({stage.count})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Vertical divider line for desktop */}
        <div className="hidden xl:block w-px bg-border shrink-0 self-stretch" />

        {/* BLOCK 2: PARCEIROS POR SEGMENTO */}
        <div className="flex-1 flex flex-col min-w-[260px] justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-text-primary">Parceiros por Segmento</h2>
            </div>
            <span className="text-[11px] font-medium text-text-secondary">
              Total: {total}
            </span>
          </div>

          <div className="h-[185px] w-full pt-1">
            <Bar data={barChartData} options={barChartOptions} />
          </div>
        </div>

        {/* Vertical divider line for desktop */}
        <div className="hidden xl:block w-px bg-border shrink-0 self-stretch" />

        {/* BLOCK 3: PERDIDOS */}
        <div className="w-full xl:w-48 flex items-center justify-center shrink-0">
          <div className="flex flex-col items-center justify-center h-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/50 rounded-xl w-full min-h-[140px] shadow-xs">
            <div className="p-2.5 bg-rose-100 dark:bg-rose-900/30 rounded-full text-rose-600 mb-2">
              <Trash2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Perdidos</span>
            <span className="text-3xl font-black text-rose-600 mt-1" id="funnel-perdidos-count">
              {countPerdeu}
            </span>
            <span className="text-[10px] text-text-secondary/75 mt-1 font-medium text-center">
              Contatos não convertidos
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
