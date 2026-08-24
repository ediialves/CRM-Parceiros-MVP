import React, { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Line } from 'react-chartjs-2';
import { supabase } from '../../lib/supabase';

// Registrar componentes necessários do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartDataLabels
);

interface PartnerHistoryChartProps {
  partnerId?: string;
  partnerUuid?: string | null;
  accountancyId?: string | number | null;
}

interface SnapshotRecord {
  imported_at: string;
  licencas: number | null;
  licencas_engajadas: number | null;
  percentual_engajamento: number | null;
}

export const PartnerHistoryChart: React.FC<PartnerHistoryChartProps> = ({ 
  partnerId,
  partnerUuid,
  accountancyId 
}) => {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<{
    labels: string[];
    licencas: number[];
    licencasEngajadas: number[];
    percentualEngajamento: number[];
  } | null>(null);

  useEffect(() => {
    async function fetchHistoricalSnapshots() {
      const targetPartnerId = partnerUuid || partnerId;
      const targetAccountancyId = accountancyId || partnerId;

      if (!targetPartnerId && !targetAccountancyId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Buscar registros com import_completo = true para o partner_id ou accountancy_id
        let data: any[] | null = null;
        let fetchError = null;

        if (targetPartnerId) {
          const res = await supabase
            .from('partner_snapshots')
            .select('imported_at, licencas, licencas_engajadas, percentual_engajamento')
            .eq('partner_id', targetPartnerId)
            .eq('import_completo', true)
            .order('imported_at', { ascending: true });
          
          if (!res.error && res.data && res.data.length > 0) {
            data = res.data;
          } else {
            fetchError = res.error;
          }
        }

        // Se não encontrou por partner_id, tenta por accountancy_id
        if ((!data || data.length === 0) && targetAccountancyId) {
          const res = await supabase
            .from('partner_snapshots')
            .select('imported_at, licencas, licencas_engajadas, percentual_engajamento')
            .eq('accountancy_id', targetAccountancyId)
            .eq('import_completo', true)
            .order('imported_at', { ascending: true });
          
          if (!res.error && res.data && res.data.length > 0) {
            data = res.data;
          } else if (res.error) {
            fetchError = res.error;
          }
        }

        if (fetchError && (!data || data.length === 0)) {
          console.error('Erro ao buscar snapshots do parceiro:', fetchError);
          setChartData(null);
          return;
        }

        if (!data || data.length === 0) {
          setChartData(null);
          return;
        }

        // 2 & 3. Agrupar por data (YYYY-MM-DD) e pegar o snapshot mais recente (MAX imported_at) de cada dia
        const dayMap = new Map<string, SnapshotRecord>();

        data.forEach((row: any) => {
          if (!row.imported_at) return;
          const dateKey = row.imported_at.substring(0, 10); // YYYY-MM-DD
          const existing = dayMap.get(dateKey);
          
          if (!existing || new Date(row.imported_at).getTime() >= new Date(existing.imported_at).getTime()) {
            dayMap.set(dateKey, {
              imported_at: row.imported_at,
              licencas: Number(row.licencas) || 0,
              licencas_engajadas: Number(row.licencas_engajadas) || 0,
              percentual_engajamento: Number(row.percentual_engajamento) || 0,
            });
          }
        });

        // 4 & 5. Ordenar por data crescente e pegar os últimos 12 dias distintos
        const sortedDates = Array.from(dayMap.keys()).sort();
        const last12Dates = sortedDates.slice(-12);

        if (last12Dates.length === 0) {
          setChartData(null);
          return;
        }

        const labels: string[] = [];
        const licencas: number[] = [];
        const licencasEngajadas: number[] = [];
        const percentualEngajamento: number[] = [];

        last12Dates.forEach(dateKey => {
          const record = dayMap.get(dateKey)!;
          // Formatar data para dd/mm
          const parts = dateKey.split('-');
          const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateKey;
          
          labels.push(label);
          licencas.push(record.licencas ?? 0);
          licencasEngajadas.push(record.licencas_engajadas ?? 0);
          percentualEngajamento.push(Math.round((record.percentual_engajamento ?? 0) * 10) / 10);
        });

        setChartData({
          labels,
          licencas,
          licencasEngajadas,
          percentualEngajamento,
        });
      } catch (err) {
        console.error('Erro ao processar dados do gráfico histórico:', err);
        setChartData(null);
      } finally {
        setLoading(false);
      }
    }

    fetchHistoricalSnapshots();
  }, [partnerId]);

  const seriesColors = {
    licencas: '#2563eb',          // Azul
    licencasEngajadas: '#f97316', // Laranja
    percentualEngajamento: '#0d9488', // Verde / Aqua / Teal
  };

  if (loading) {
    return (
      <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
        <div className="h-6 w-48 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="h-64 flex items-center justify-center text-text-secondary text-sm">
          Carregando evolução histórica...
        </div>
      </div>
    );
  }

  if (!chartData || chartData.labels.length === 0) {
    return (
      <div className="bg-surface p-6 rounded-xl border border-border shadow-sm">
        <h2 className="text-lg font-semibold text-primary mb-4">Evolução Histórica</h2>
        <div className="h-44 flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-lg bg-surface/50">
          <p className="text-text-secondary italic text-sm">Sem histórico disponível</p>
          <span className="text-xs text-text-secondary/70 mt-1">
            Nenhum snapshot concluído foi registrado para este parceiro até o momento.
          </span>
        </div>
      </div>
    );
  }

  const data = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'Licenças',
        data: chartData.licencas,
        borderColor: seriesColors.licencas,
        backgroundColor: seriesColors.licencas,
        borderWidth: 2.5,
        tension: 0.2,
        pointRadius: 4.5,
        pointHoverRadius: 6,
        pointBackgroundColor: seriesColors.licencas,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        yAxisID: 'yLeft',
        datalabels: {
          align: 'top' as const,
          anchor: 'end' as const,
          offset: 4,
          color: seriesColors.licencas,
          font: {
            size: 10,
            weight: 'bold' as const,
          },
          formatter: (value: number) => value,
        },
      },
      {
        label: 'Licenças Engajadas',
        data: chartData.licencasEngajadas,
        borderColor: seriesColors.licencasEngajadas,
        backgroundColor: seriesColors.licencasEngajadas,
        borderWidth: 2.5,
        tension: 0.2,
        pointRadius: 4.5,
        pointHoverRadius: 6,
        pointBackgroundColor: seriesColors.licencasEngajadas,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        yAxisID: 'yLeft',
        datalabels: {
          align: 'top' as const,
          anchor: 'end' as const,
          offset: 4,
          color: seriesColors.licencasEngajadas,
          font: {
            size: 10,
            weight: 'bold' as const,
          },
          formatter: (value: number) => value,
        },
      },
      {
        label: 'Engajamento %',
        data: chartData.percentualEngajamento,
        borderColor: seriesColors.percentualEngajamento,
        backgroundColor: seriesColors.percentualEngajamento,
        borderWidth: 2.5,
        tension: 0.2,
        pointRadius: 4.5,
        pointHoverRadius: 6,
        pointBackgroundColor: seriesColors.percentualEngajamento,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        yAxisID: 'yRight',
        datalabels: {
          align: 'bottom' as const,
          anchor: 'start' as const,
          offset: 4,
          color: seriesColors.percentualEngajamento,
          font: {
            size: 10,
            weight: 'bold' as const,
          },
          formatter: (value: number) => `${value}%`,
        },
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 24,
        bottom: 8,
        left: 8,
        right: 8,
      },
    },
    plugins: {
      legend: {
        display: false, // Desabilitada legenda nativa do Chart.js conforme especificação
      },
      tooltip: {
        backgroundColor: '#1e293b',
        titleFont: { size: 12 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: function (context: any) {
            const label = context.dataset.label || '';
            const val = context.parsed.y;
            if (context.dataset.yAxisID === 'yRight') {
              return ` ${label}: ${val}%`;
            }
            return ` ${label}: ${val}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false, // Sem gridlines
          drawBorder: false,
        },
        ticks: {
          autoSkip: false, // Todos os labels visíveis
          font: {
            size: 11,
          },
          color: '#64748b',
        },
      },
      yLeft: {
        type: 'linear',
        position: 'left',
        grid: {
          display: false, // Sem gridlines
          drawBorder: false,
        },
        ticks: {
          precision: 0,
          font: {
            size: 11,
          },
          color: '#64748b',
        },
      },
      yRight: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 100, // Escala fixa 0-100
        grid: {
          display: false, // Sem gridlines
          drawBorder: false,
        },
        ticks: {
          stepSize: 20,
          callback: (val: number) => `${val}%`,
          font: {
            size: 11,
          },
          color: '#64748b',
        },
      },
    },
  };

  return (
    <div className="bg-surface p-6 rounded-xl border border-border shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Evolução Histórica</h2>
        
        {/* Legenda Customizada em HTML */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span 
              className="w-3 h-3 rounded-xs shrink-0" 
              style={{ backgroundColor: seriesColors.licencas }}
            />
            <span>Licenças</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span 
              className="w-3 h-3 rounded-xs shrink-0" 
              style={{ backgroundColor: seriesColors.licencasEngajadas }}
            />
            <span>Licenças Engajadas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span 
              className="w-3 h-3 rounded-xs shrink-0" 
              style={{ backgroundColor: seriesColors.percentualEngajamento }}
            />
            <span>Engajamento %</span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full pt-2">
        <Line data={data} options={options} />
      </div>
    </div>
  );
};
