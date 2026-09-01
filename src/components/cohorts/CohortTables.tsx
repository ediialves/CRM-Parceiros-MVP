import React from 'react';
import { TrendingUp, Clock, Calendar } from 'lucide-react';
import { getCohortHeatmapStyle, getCohortBaseFixaHeatmapStyle } from '../../lib/cohorts/heatmap';
import { CohortDataset } from '../../lib/cohorts/computeCohorts';

/**
 * As 5 tabelas de coorte (engajamento, licenças, variação, diagnóstico e base fixa).
 *
 * Extraído de `DashboardGerencialV2.tsx` para que o Dashboard de Coortes possa
 * renderizar duas colunas independentes lado a lado.
 */
export const CohortTables: React.FC<{ data: CohortDataset }> = ({ data }) => {
  const {
    engagement: cohortEngagementData,
    licencas: cohortLicencasData,
    diagnostico: cohortDiagnosticoData,
    baseFixa: cohortBaseFixaData,
    engagementHeatDomain,
    baseFixaHeatDomain,
  } = data;

  return (
    <div className="flex flex-col">
        {/* Card: Coorte de Engajamento por Semana de Entrada */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm" id="card-coorte-engajamento">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6" id="header-coorte-engajamento">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-coorte-engajamento">
                Coorte de Engajamento
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Média de engajamento (% de licenças engajadas) por semana de entrada por plano.
              </p>
            </div>
          </div>

          {cohortEngagementData.status === 'loading' ? (
            <div className="p-8 text-center text-text-secondary">
              <p className="text-sm font-medium">Carregando dados da coorte...</p>
            </div>
          ) : cohortEngagementData.status === 'empty' || cohortEngagementData.cohorts.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
              <p className="font-semibold text-sm text-text-primary">Nenhuma coorte encontrada para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros de Plano, Gerente, Origem do Playbook ou Fila.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary/30">
                    <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                      Semanas
                    </th>
                    <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Planos
                    </th>
                    <th className="py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                      Lic. Cobertas
                    </th>
                    {Array.from({ length: (cohortEngagementData.maxWeeks ?? 8) + 1 }).map((_, i) => (
                      <th key={i} className="py-2.5 px-1.5 text-center min-w-[50px] font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        S{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cohortEngagementData.cohorts.map((cohort, idx) => {
                    const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                    const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                    return (
                      <tr key={cohort.semanaEntrada} className={rowBgClass}>
                        <td className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                            <span>{cohort.label}</span>
                          </div>
                        </td>
                        <td className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                          {cohort.planCount}
                        </td>
                        <td className="py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap border-b border-border/40">
                          {cohort.totalLicencas.toLocaleString('pt-BR')}
                        </td>
                        {cohort.weeksData.map((w) => {
                          const isNull = w.avgEngagement === null;
                          const valDisplay = isNull
                            ? ''
                            : `${Number(w.avgEngagement).toFixed(1).replace('.', ',')}%`;

                          const heat = isNull ? { style: {}, className: '' } : getCohortHeatmapStyle(w.avgEngagement, engagementHeatDomain);

                          return (
                            <td
                              key={w.weekIndex}
                              style={heat.style}
                              className={`py-2 px-1.5 text-center text-xs whitespace-nowrap transition-colors border-b border-border/40 ${heat.className}`}
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Rodapé: Linhas de resumo das médias de 4 semanas e 12 semanas */}
                {cohortEngagementData.summary4Weeks && cohortEngagementData.summary12Weeks && (
                  <tfoot className="border-t-2 border-border/80 bg-bg-secondary/30">
                    {/* Linha Média Últimas 4 Semanas */}
                    <tr className="bg-bg-secondary/20 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px] border-b border-border/60">
                        <div className="flex items-center gap-1" title={cohortEngagementData.summary4Weeks.rangeLabel ? `Período: ${cohortEngagementData.summary4Weeks.rangeLabel}` : undefined}>
                          <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>Média 4 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortEngagementData.summary4Weeks.count > 0 ? cohortEngagementData.summary4Weeks.planCountSum : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-text-secondary whitespace-nowrap border-b border-border/60">
                        {cohortEngagementData.summary4Weeks.count > 0 ? cohortEngagementData.summary4Weeks.totalLicencasSum.toLocaleString('pt-BR') : '—'}
                      </td>
                      {cohortEngagementData.summary4Weeks.averages.map((avg, i) => {
                        const heat = avg !== null ? getCohortHeatmapStyle(avg, engagementHeatDomain) : { style: {}, className: '' };
                        return (
                          <td
                            key={i}
                            style={heat.style}
                            className={`py-2 px-1.5 text-center text-xs whitespace-nowrap border-b border-border/60 ${heat.className}`}
                          >
                            {avg !== null ? `${avg.toFixed(1).replace('.', ',')}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Linha Média Últimas 12 Semanas */}
                    <tr className="bg-bg-secondary/40 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center gap-1" title={cohortEngagementData.summary12Weeks.rangeLabel ? `Período: ${cohortEngagementData.summary12Weeks.rangeLabel}` : undefined}>
                          <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Média 12 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortEngagementData.summary12Weeks.count > 0 ? cohortEngagementData.summary12Weeks.planCountSum : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-text-secondary whitespace-nowrap">
                        {cohortEngagementData.summary12Weeks.count > 0 ? cohortEngagementData.summary12Weeks.totalLicencasSum.toLocaleString('pt-BR') : '—'}
                      </td>
                      {cohortEngagementData.summary12Weeks.averages.map((avg, i) => {
                        const heat = avg !== null ? getCohortHeatmapStyle(avg, engagementHeatDomain) : { style: {}, className: '' };
                        return (
                          <td
                            key={i}
                            style={heat.style}
                            className={`py-2 px-1.5 text-center text-xs whitespace-nowrap ${heat.className}`}
                          >
                            {avg !== null ? `${avg.toFixed(1).replace('.', ',')}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Card: Coorte de Licenças por Semana de Entrada */}
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm" id="card-coorte-licencas">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6" id="header-coorte-licencas">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-coorte-licencas">
                Coorte de Licenças
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Total de licenças por safra de entrada, ao longo das semanas.
              </p>
            </div>
          </div>

          {cohortLicencasData.status === 'loading' ? (
            <div className="p-8 text-center text-text-secondary">
              <p className="text-sm font-medium">Carregando dados da coorte...</p>
            </div>
          ) : cohortLicencasData.status === 'empty' || cohortLicencasData.cohorts.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
              <p className="font-semibold text-sm text-text-primary">Nenhuma coorte encontrada para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros de Plano, Gerente, Origem do Playbook ou Fila.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary/30">
                    <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                      Semanas
                    </th>
                    <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Planos
                    </th>
                    {Array.from({ length: (cohortLicencasData.maxWeeks ?? 8) + 1 }).map((_, i) => (
                      <th key={i} className="py-2.5 px-1.5 text-right min-w-[50px] font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        S{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cohortLicencasData.cohorts.map((cohort, idx) => {
                    const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                    const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                    return (
                      <tr key={cohort.semanaEntrada} className={rowBgClass}>
                        <td className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                            <span>{cohort.label}</span>
                          </div>
                        </td>
                        <td className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                          {cohort.planCount}
                        </td>
                        {cohort.weeksData.map((w) => {
                          const isNull = w.sumLicencas === null;
                          const valDisplay = isNull
                            ? ''
                            : Number(w.sumLicencas).toLocaleString('pt-BR');

                          return (
                            <td
                              key={w.weekIndex}
                              className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-medium text-text-primary border-b border-border/40"
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Rodapé: Linhas de resumo das médias de 4 semanas e 12 semanas */}
                {cohortLicencasData.summary4Weeks && cohortLicencasData.summary12Weeks && (
                  <tfoot className="border-t-2 border-border/80 bg-bg-secondary/30">
                    {/* Linha Média Últimas 4 Semanas */}
                    <tr className="bg-bg-secondary/20 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px] border-b border-border/60">
                        <div className="flex items-center gap-1" title={cohortLicencasData.summary4Weeks.rangeLabel ? `Período: ${cohortLicencasData.summary4Weeks.rangeLabel}` : undefined}>
                          <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>Média 4 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortLicencasData.summary4Weeks.count > 0 ? cohortLicencasData.summary4Weeks.planCountSum : '—'}
                      </td>
                      {cohortLicencasData.summary4Weeks.averages.map((avg, i) => {
                        return (
                          <td
                            key={i}
                            className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-semibold text-text-primary border-b border-border/60"
                          >
                            {avg !== null ? Number(avg).toLocaleString('pt-BR') : '—'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Linha Média Últimas 12 Semanas */}
                    <tr className="bg-bg-secondary/40 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center gap-1" title={cohortLicencasData.summary12Weeks.rangeLabel ? `Período: ${cohortLicencasData.summary12Weeks.rangeLabel}` : undefined}>
                          <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Média 12 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortLicencasData.summary12Weeks.count > 0 ? cohortLicencasData.summary12Weeks.planCountSum : '—'}
                      </td>
                      {cohortLicencasData.summary12Weeks.averages.map((avg, i) => {
                        return (
                          <td
                            key={i}
                            className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-semibold text-text-primary"
                          >
                            {avg !== null ? Number(avg).toLocaleString('pt-BR') : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Card: Coorte de Variação de Licenças */}
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm" id="card-coorte-variacao-licencas">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6" id="header-coorte-variacao-licencas">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-coorte-variacao-licencas">
                Coorte de Variação de Licenças
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Crescimento ou queda de licenças em relação à semana anterior, por safra.
              </p>
            </div>
          </div>

          {cohortLicencasData.status === 'loading' ? (
            <div className="p-8 text-center text-text-secondary">
              <p className="text-sm font-medium">Carregando dados da coorte...</p>
            </div>
          ) : cohortLicencasData.status === 'empty' || cohortLicencasData.cohorts.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
              <p className="font-semibold text-sm text-text-primary">Nenhuma coorte encontrada para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros de Plano, Gerente, Origem do Playbook ou Fila.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary/30">
                    <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                      Semanas
                    </th>
                    <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Planos
                    </th>
                    {Array.from({ length: (cohortLicencasData.maxWeeks ?? 8) + 1 }).map((_, i) => (
                      <th key={i} className="py-2.5 px-1.5 text-right min-w-[50px] font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        S{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cohortLicencasData.cohorts.map((cohort, idx) => {
                    const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                    const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                    return (
                      <tr key={cohort.semanaEntrada} className={rowBgClass}>
                        <td className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                            <span>{cohort.label}</span>
                          </div>
                        </td>
                        <td className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                          {cohort.planCount}
                        </td>
                        {cohort.weeksData.map((w, colIdx) => {
                          // S0 é sempre marco zero
                          if (colIdx === 0) {
                            const isNull = w.sumLicencas === null;
                            return (
                              <td
                                key={w.weekIndex}
                                className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-medium text-text-secondary border-b border-border/40"
                              >
                                {isNull ? '' : '0'}
                              </td>
                            );
                          }

                          // Colunas S1 em diante: delta em relação à coluna anterior
                          const prevVal = cohort.weeksData[colIdx - 1]?.sumLicencas;
                          const currVal = w.sumLicencas;

                          // Se a coluna atual ou a anterior não tiver dado, fica vazia
                          if (currVal === null || currVal === undefined || prevVal === null || prevVal === undefined) {
                            return (
                              <td
                                key={w.weekIndex}
                                className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-medium text-text-secondary border-b border-border/40"
                              >
                                
                              </td>
                            );
                          }

                          const delta = currVal - prevVal;
                          let textClass = 'text-text-secondary font-medium';
                          let displayVal = '0';

                          if (delta > 0) {
                            textClass = 'text-emerald-600 dark:text-emerald-400 font-semibold';
                            displayVal = `+${delta.toLocaleString('pt-BR')}`;
                          } else if (delta < 0) {
                            textClass = 'text-rose-600 dark:text-rose-400 font-semibold';
                            displayVal = `${delta.toLocaleString('pt-BR')}`;
                          }

                          return (
                            <td
                              key={w.weekIndex}
                              className={`py-2 px-1.5 text-right text-xs whitespace-nowrap border-b border-border/40 ${textClass}`}
                            >
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Rodapé: Linhas de resumo das médias de 4 semanas e 12 semanas (Delta) */}
                {cohortLicencasData.summary4Weeks && cohortLicencasData.summary12Weeks && (
                  <tfoot className="border-t-2 border-border/80 bg-bg-secondary/30">
                    {/* Linha Média Últimas 4 Semanas */}
                    <tr className="bg-bg-secondary/20 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px] border-b border-border/60">
                        <div className="flex items-center gap-1" title={cohortLicencasData.summary4Weeks.rangeLabel ? `Período: ${cohortLicencasData.summary4Weeks.rangeLabel}` : undefined}>
                          <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>Média 4 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortLicencasData.summary4Weeks.count > 0 ? cohortLicencasData.summary4Weeks.planCountSum : '—'}
                      </td>
                      {cohortLicencasData.summary4Weeks.averages.map((avg, i) => {
                        if (i === 0) {
                          return (
                            <td
                              key={i}
                              className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-medium text-text-secondary border-b border-border/60"
                            >
                              {avg !== null ? '0' : '—'}
                            </td>
                          );
                        }

                        const prevAvg = cohortLicencasData.summary4Weeks!.averages[i - 1];
                        const currAvg = avg;

                        if (currAvg === null || currAvg === undefined || prevAvg === null || prevAvg === undefined) {
                          return (
                            <td
                              key={i}
                              className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-semibold text-text-secondary border-b border-border/60"
                            >
                              —
                            </td>
                          );
                        }

                        const delta = currAvg - prevAvg;
                        let textClass = 'text-text-secondary font-semibold';
                        let displayVal = '0';

                        if (delta > 0) {
                          textClass = 'text-emerald-600 dark:text-emerald-400 font-bold';
                          displayVal = `+${delta.toLocaleString('pt-BR')}`;
                        } else if (delta < 0) {
                          textClass = 'text-rose-600 dark:text-rose-400 font-bold';
                          displayVal = `${delta.toLocaleString('pt-BR')}`;
                        }

                        return (
                          <td
                            key={i}
                            className={`py-2 px-1.5 text-right text-xs whitespace-nowrap border-b border-border/60 ${textClass}`}
                          >
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Linha Média Últimas 12 Semanas */}
                    <tr className="bg-bg-secondary/40 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center gap-1" title={cohortLicencasData.summary12Weeks.rangeLabel ? `Período: ${cohortLicencasData.summary12Weeks.rangeLabel}` : undefined}>
                          <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Média 12 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortLicencasData.summary12Weeks.count > 0 ? cohortLicencasData.summary12Weeks.planCountSum : '—'}
                      </td>
                      {cohortLicencasData.summary12Weeks.averages.map((avg, i) => {
                        if (i === 0) {
                          return (
                            <td
                              key={i}
                              className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-medium text-text-secondary"
                            >
                              {avg !== null ? '0' : '—'}
                            </td>
                          );
                        }

                        const prevAvg = cohortLicencasData.summary12Weeks!.averages[i - 1];
                        const currAvg = avg;

                        if (currAvg === null || currAvg === undefined || prevAvg === null || prevAvg === undefined) {
                          return (
                            <td
                              key={i}
                              className="py-2 px-1.5 text-right text-xs whitespace-nowrap font-semibold text-text-secondary"
                            >
                              —
                            </td>
                          );
                        }

                        const delta = currAvg - prevAvg;
                        let textClass = 'text-text-secondary font-semibold';
                        let displayVal = '0';

                        if (delta > 0) {
                          textClass = 'text-emerald-600 dark:text-emerald-400 font-bold';
                          displayVal = `+${delta.toLocaleString('pt-BR')}`;
                        } else if (delta < 0) {
                          textClass = 'text-rose-600 dark:text-rose-400 font-bold';
                          displayVal = `${delta.toLocaleString('pt-BR')}`;
                        }

                        return (
                          <td
                            key={i}
                            className={`py-2 px-1.5 text-right text-xs whitespace-nowrap ${textClass}`}
                          >
                            {displayVal}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Card: Coorte de Diagnóstico de Engajamento */}
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm" id="card-coorte-diagnostico-engajamento">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6" id="header-coorte-diagnostico-engajamento">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-coorte-diagnostico-engajamento">
                Coorte de Diagnóstico de Engajamento
              </h3>
              <p className="text-xs text-text-secondary mt-0.5" id="desc-coorte-diagnostico-engajamento">
                Separa engajamento que cresceu de verdade do engajamento que só subiu por perda de licenças desengajadas — e o inverso.
              </p>
            </div>
          </div>

          {cohortDiagnosticoData.status === 'loading' ? (
            <div className="p-8 text-center text-text-secondary">
              <p className="text-sm font-medium">Carregando dados do diagnóstico...</p>
            </div>
          ) : cohortDiagnosticoData.status === 'empty' || cohortDiagnosticoData.cohorts.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
              <p className="font-semibold text-sm text-text-primary">Nenhuma coorte encontrada para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros de Plano, Gerente, Origem do Playbook ou Fila.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary/30">
                    <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                      Semanas
                    </th>
                    <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Planos
                    </th>
                    {Array.from({ length: (cohortDiagnosticoData.maxWeeks ?? 8) + 1 }).map((_, i) => (
                      <th key={i} className="py-2.5 px-1.5 text-center min-w-[68px] font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        S{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cohortDiagnosticoData.cohorts.map((cohort, idx) => {
                    const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                    const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                    return (
                      <tr key={cohort.semanaEntrada} className={rowBgClass}>
                        <td className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                            <span>{cohort.label}</span>
                          </div>
                        </td>
                        <td className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                          {cohort.planCount}
                        </td>
                        {cohort.weeksData.map((w) => {
                          if (w.category === 'sem_dado' || w.avgEngagement === null) {
                            return (
                              <td
                                key={w.weekIndex}
                                className="py-2 px-1.5 text-center text-xs whitespace-nowrap border-b border-border/40 text-text-secondary"
                              >
                                —
                              </td>
                            );
                          }

                          const engDisplay = `${w.avgEngagement.toFixed(1).replace('.', ',')}%`;

                          // S0: marco zero (neutro/cinza)
                          if (w.weekIndex === 0 || w.category === 'marco_zero') {
                            return (
                              <td
                                key={w.weekIndex}
                                className="py-1.5 px-1.5 text-center text-xs whitespace-nowrap border-b border-border/40 bg-bg-secondary/30"
                              >
                                <div className="font-semibold text-text-primary text-[11px] leading-tight">
                                  {engDisplay}
                                </div>
                                <div className="text-[9px] text-text-secondary leading-tight mt-0.5">
                                  marco zero
                                </div>
                              </td>
                            );
                          }

                          // S1+: Estilo por Categoria
                          let bgClass = 'bg-bg-secondary/20';
                          let titleText = 'Estável';
                          let deltaLicText = '';
                          let mainTextClass = 'text-text-primary';
                          let subTextClass = 'text-text-secondary';

                          if (w.deltaLic !== null && w.deltaLic !== undefined) {
                            const sign = w.deltaLic > 0 ? '+' : '';
                            deltaLicText = `lic ${sign}${w.deltaLic.toLocaleString('pt-BR')}`;
                          }

                          if (w.category === 'crescimento_real') {
                            bgClass = 'bg-emerald-100 dark:bg-emerald-950/50';
                            mainTextClass = 'text-emerald-900 dark:text-emerald-200';
                            subTextClass = 'text-emerald-700 dark:text-emerald-400';
                            titleText = 'Crescimento real: mais licenças e mais engajamento';
                          } else if (w.category === 'diluicao_saudavel') {
                            bgClass = 'bg-blue-100 dark:bg-blue-950/50';
                            mainTextClass = 'text-blue-900 dark:text-blue-200';
                            subTextClass = 'text-blue-700 dark:text-blue-400';
                            titleText = 'Diluição saudável: vendeu novas licenças ainda não ativadas';
                          } else if (w.category === 'engajamento_inflado') {
                            bgClass = 'bg-amber-100 dark:bg-amber-950/50';
                            mainTextClass = 'text-amber-900 dark:text-amber-200';
                            subTextClass = 'text-amber-700 dark:text-amber-400';
                            titleText = 'Engajamento inflado: perdeu licença desengajada (base encolheu)';
                          } else if (w.category === 'perda_real') {
                            bgClass = 'bg-rose-100 dark:bg-rose-950/50';
                            mainTextClass = 'text-rose-900 dark:text-rose-200';
                            subTextClass = 'text-rose-700 dark:text-rose-400';
                            titleText = 'Perda real: perda de licenças e queda de engajamento';
                          } else {
                            // Estável
                            bgClass = 'bg-bg-secondary/30';
                            mainTextClass = 'text-text-primary';
                            subTextClass = 'text-text-secondary';
                            titleText = 'Estável: variação < 1 em licenças ou engajamento';
                          }

                          return (
                            <td
                              key={w.weekIndex}
                              title={titleText}
                              className={`py-1.5 px-1 text-center text-xs whitespace-nowrap border-b border-border/40 ${bgClass}`}
                            >
                              <div className={`font-bold text-[11px] leading-tight ${mainTextClass}`}>
                                {engDisplay}
                              </div>
                              <div className={`text-[9px] font-medium leading-tight mt-0.5 ${subTextClass}`}>
                                {deltaLicText || '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Legenda permanente obrigatória */}
          <div className="mt-6 pt-5 border-t border-border" id="legenda-coorte-diagnostico">
            <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3">
              Legenda do Diagnóstico de Engajamento
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
              <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                <span className="inline-block w-3 h-3 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-900 dark:text-emerald-200">Crescimento real</span>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                    Mais licenças vendidas e mais engajamento, ao mesmo tempo.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-blue-900 dark:text-blue-200">Diluição saudável</span>
                  <p className="text-[11px] text-blue-800 dark:text-blue-300 mt-0.5">
                    Vendeu licença nova; engajamento cai só porque ela ainda não foi ativada.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-900 dark:text-amber-200">Engajamento inflado por churn</span>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    Perdeu licença desengajada; o % sobe mas a base encolheu.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                <span className="inline-block w-3 h-3 rounded-full bg-rose-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-rose-900 dark:text-rose-200">Perda real</span>
                  <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5">
                    Perdendo licença engajada; queda genuína.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 p-2 rounded-lg bg-bg-secondary/40 border border-border">
                <span className="inline-block w-3 h-3 rounded-full bg-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-text-primary">Estável</span>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Variação pequena demais (&lt; 1 em licenças ou engajamento) para classificar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card: Coorte de Engajamento — Base Fixa */}
        <div className="mt-8 rounded-xl border border-border bg-card p-6 shadow-sm" id="card-coorte-engajamento-base-fixa">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6" id="header-coorte-engajamento-base-fixa">
            <div>
              <h3 className="text-lg font-bold text-text-primary" id="title-coorte-engajamento-base-fixa">
                Coorte de Engajamento — Base Fixa
              </h3>
              <p className="text-xs text-text-secondary mt-0.5" id="desc-coorte-engajamento-base-fixa">
                Mostra a evolução real do engajamento usando a base de licenças da entrada, sem distorção por ganho ou perda de licença na carteira.
              </p>
            </div>
          </div>

          {cohortBaseFixaData.status === 'loading' ? (
            <div className="p-8 text-center text-text-secondary">
              <p className="text-sm font-medium">Carregando dados da coorte...</p>
            </div>
          ) : cohortBaseFixaData.status === 'empty' || cohortBaseFixaData.cohorts.length === 0 ? (
            <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
              <p className="font-semibold text-sm text-text-primary">Nenhuma coorte encontrada para os filtros selecionados.</p>
              <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros de Plano, Gerente, Origem do Playbook ou Fila.</p>
            </div>
          ) : (
            <div className="overflow-x-auto relative">
              <table className="w-full text-left text-xs border-separate border-spacing-0">
                <thead>
                  <tr className="border-b border-border bg-bg-secondary/30">
                    <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                      Semanas
                    </th>
                    <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Planos
                    </th>
                    <th className="py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                      Lic. Cobertas
                    </th>
                    {Array.from({ length: (cohortBaseFixaData.maxWeeks ?? 8) + 1 }).map((_, i) => (
                      <th key={i} className="py-2.5 px-1.5 text-center min-w-[50px] font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        S{i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cohortBaseFixaData.cohorts.map((cohort, idx) => {
                    const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                    const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                    return (
                      <tr key={cohort.semanaEntrada} className={rowBgClass}>
                        <td className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                            <span>{cohort.label}</span>
                          </div>
                        </td>
                        <td className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}>
                          {cohort.planCount}
                        </td>
                        <td className="py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap border-b border-border/40">
                          {cohort.totalLicencas.toLocaleString('pt-BR')}
                        </td>
                        {cohort.weeksData.map((w) => {
                          const isNull = w.valPct === null;
                          const valDisplay = isNull
                            ? (w.semDado ? '—' : '')
                            : `${Number(w.valPct).toFixed(1).replace('.', ',')}%`;

                          const heat = isNull ? { style: {}, className: '' } : getCohortBaseFixaHeatmapStyle(w.valPct, baseFixaHeatDomain);

                          return (
                            <td
                              key={w.weekIndex}
                              style={heat.style}
                              className={`py-2 px-1.5 text-center text-xs whitespace-nowrap transition-colors border-b border-border/40 ${heat.className}`}
                            >
                              {valDisplay}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                {/* Rodapé: Linhas de resumo das médias de 4 semanas e 12 semanas */}
                {cohortBaseFixaData.summary4Weeks && cohortBaseFixaData.summary12Weeks && (
                  <tfoot className="border-t-2 border-border/80 bg-bg-secondary/30">
                    {/* Linha Média Últimas 4 Semanas */}
                    <tr className="bg-bg-secondary/20 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px] border-b border-border/60">
                        <div className="flex items-center gap-1" title={cohortBaseFixaData.summary4Weeks.rangeLabel ? `Período: ${cohortBaseFixaData.summary4Weeks.rangeLabel}` : undefined}>
                          <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>Média 4 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortBaseFixaData.summary4Weeks.count > 0 ? cohortBaseFixaData.summary4Weeks.planCountSum : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-text-secondary whitespace-nowrap border-b border-border/60">
                        {cohortBaseFixaData.summary4Weeks.count > 0 ? cohortBaseFixaData.summary4Weeks.totalLicencasSum.toLocaleString('pt-BR') : '—'}
                      </td>
                      {cohortBaseFixaData.summary4Weeks.averages.map((avg, i) => {
                        const heat = avg !== null ? getCohortBaseFixaHeatmapStyle(avg, baseFixaHeatDomain) : { style: {}, className: '' };
                        return (
                          <td
                            key={i}
                            style={heat.style}
                            className={`py-2 px-1.5 text-center text-xs whitespace-nowrap border-b border-border/60 ${heat.className}`}
                          >
                            {avg !== null ? `${avg.toFixed(1).replace('.', ',')}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Linha Média Últimas 12 Semanas */}
                    <tr className="bg-bg-secondary/40 font-semibold text-text-primary">
                      <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px]">
                        <div className="flex items-center gap-1" title={cohortBaseFixaData.summary12Weeks.rangeLabel ? `Período: ${cohortBaseFixaData.summary12Weeks.rangeLabel}` : undefined}>
                          <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Média 12 sem.</span>
                        </div>
                      </td>
                      <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        {cohortBaseFixaData.summary12Weeks.count > 0 ? cohortBaseFixaData.summary12Weeks.planCountSum : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-text-secondary whitespace-nowrap">
                        {cohortBaseFixaData.summary12Weeks.count > 0 ? cohortBaseFixaData.summary12Weeks.totalLicencasSum.toLocaleString('pt-BR') : '—'}
                      </td>
                      {cohortBaseFixaData.summary12Weeks.averages.map((avg, i) => {
                        const heat = avg !== null ? getCohortBaseFixaHeatmapStyle(avg, baseFixaHeatDomain) : { style: {}, className: '' };
                        return (
                          <td
                            key={i}
                            style={heat.style}
                            className={`py-2 px-1.5 text-center text-xs whitespace-nowrap ${heat.className}`}
                          >
                            {avg !== null ? `${avg.toFixed(1).replace('.', ',')}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

    </div>
  );
};
