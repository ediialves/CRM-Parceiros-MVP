import { formatCohortWeekLabel, HeatDomain } from './heatmap';

/**
 * Cálculo das tabelas de coorte (safra = segunda-feira da semana de `plans.created_at`).
 *
 * Extraído de `DashboardGerencialV2.tsx` para o Dashboard de Coortes, onde a mesma
 * computação é executada duas vezes (coluna A e coluna B) com conjuntos de filtros
 * independentes, permitindo comparação lado a lado (ex.: BAU x playbook oficial).
 *
 * Diferença em relação ao V2: aqui não existe filtro de "existência de plano" —
 * a coorte é sempre construída a partir de planos.
 */

export interface CohortFilters {
  /** Segmento ("Plano" na UI), travado no snapshot de S0. */
  selectedPlanos: string[];
  selectedGerentes: string[];
  /** BAU (plano sem playbook) x playbook oficial/automático. */
  origemPlaybook: 'todos' | 'playbooks_novos' | 'bau';
  /** Playbooks oficiais específicos (`plans.playbook_id`). Vazio = todos. */
  selectedPlaybookIds: string[];
  selectedFila: 'todos' | 'RETENÇÃO' | 'EXPANSÃO';
  statusEtapaPlano: 'criado' | 'iniciado' | 'finalizado';
  statusConclusao: 'todos' | 'sucesso' | 'sem_sucesso' | 'nao_classificado';
}

export const emptyCohortFilters = (): CohortFilters => ({
  selectedPlanos: [],
  selectedGerentes: [],
  origemPlaybook: 'todos',
  selectedPlaybookIds: [],
  selectedFila: 'todos',
  statusEtapaPlano: 'criado',
  statusConclusao: 'todos',
});

export const countActiveCohortFilters = (f: CohortFilters): number => {
  let count = 0;
  if (f.selectedPlanos.length > 0) count++;
  if (f.selectedGerentes.length > 0) count++;
  if (f.origemPlaybook !== 'todos') count++;
  if (f.selectedPlaybookIds.length > 0) count++;
  if (f.selectedFila !== 'todos') count++;
  if (f.statusEtapaPlano !== 'criado') count++;
  if (f.statusConclusao !== 'todos') count++;
  return count;
};

export interface CohortRawData {
  partners: any[];
  basePlans: any[];
  partnerSnapshots: any[];
  tasks: any[];
  managersList: any[];
}

/**
 * A coorte de licenças só é confiável a partir da data em que os snapshots passaram
 * a ser completos; safras anteriores são descartadas nessa tabela.
 */
const DATA_CORTE_SNAPSHOTS = '2026-05-11';

const getMondayOfWeek = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return '';
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
  return monday.toISOString().split('T')[0];
};

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

const diffDaysBetween = (startStr: string, endStr: string): number => {
  const d1 = new Date(startStr + 'T00:00:00Z');
  const d2 = new Date(endStr + 'T00:00:00Z');
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
};

type Snap = {
  importedAtDateStr: string;
  licencas: number;
  licencas_engajadas: number;
  plano: string | null;
};

type PlanEntry = { planId: string; partnerId: string; semanaEntrada: string };

interface CohortSummary {
  rangeLabel: string;
  planCountSum: number;
  totalLicencasSum: number;
  averages: (number | null)[];
  count: number;
}

export interface EngagementWeek {
  weekIndex: number;
  avgEngagement: number | null;
  sumEngajadas: number;
  sumLicencas: number;
}

export interface EngagementCohort {
  semanaEntrada: string;
  label: string;
  rawDateString: string;
  planCount: number;
  totalLicencas: number;
  weeksData: EngagementWeek[];
}

export interface LicencasCohort {
  semanaEntrada: string;
  label: string;
  rawDateString: string;
  planCount: number;
  totalLicencas: number;
  weeksData: Array<{ weekIndex: number; sumLicencas: number | null }>;
}

export type CategoryType =
  | 'crescimento_real'
  | 'diluicao_saudavel'
  | 'engajamento_inflado'
  | 'perda_real'
  | 'estavel'
  | 'marco_zero'
  | 'sem_dado';

export interface CohortDataset {
  engagement: {
    status: 'loading' | 'empty' | 'ok';
    cohorts: EngagementCohort[];
    maxWeeks?: number;
    summary4Weeks?: CohortSummary | null;
    summary12Weeks?: CohortSummary | null;
  };
  licencas: {
    status: 'loading' | 'empty' | 'ok';
    cohorts: LicencasCohort[];
    maxWeeks?: number;
    summary4Weeks?: CohortSummary | null;
    summary12Weeks?: CohortSummary | null;
  };
  diagnostico: {
    status: 'loading' | 'empty' | 'ok';
    cohorts: any[];
    maxWeeks: number;
  };
  baseFixa: {
    status: 'loading' | 'empty' | 'ok';
    cohorts: any[];
    maxWeeks: number;
    summary4Weeks: CohortSummary | null;
    summary12Weeks: CohortSummary | null;
  };
  engagementHeatDomain: HeatDomain;
  baseFixaHeatDomain: HeatDomain;
}

const LOADING_DATASET: CohortDataset = {
  engagement: { status: 'loading', cohorts: [] },
  licencas: { status: 'loading', cohorts: [] },
  diagnostico: { status: 'loading', cohorts: [], maxWeeks: 8 },
  baseFixa: { status: 'loading', cohorts: [], maxWeeks: 8, summary4Weeks: null, summary12Weeks: null },
  engagementHeatDomain: { min: 0, max: 100 },
  baseFixaHeatDomain: { min: 0, max: 100 },
};

const EMPTY_DATASET: CohortDataset = {
  engagement: { status: 'empty', cohorts: [] },
  licencas: { status: 'empty', cohorts: [] },
  diagnostico: { status: 'empty', cohorts: [], maxWeeks: 8 },
  baseFixa: { status: 'empty', cohorts: [], maxWeeks: 8, summary4Weeks: null, summary12Weeks: null },
  engagementHeatDomain: { min: 0, max: 100 },
  baseFixaHeatDomain: { min: 0, max: 100 },
};

const emptySummary = (averages: (number | null)[]): CohortSummary => ({
  rangeLabel: '',
  planCountSum: 0,
  totalLicencasSum: 0,
  averages,
  count: 0,
});

const heatDomainOf = (vals: number[]): HeatDomain => {
  if (vals.length === 0) return { min: 0, max: 100 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
};

/**
 * Seleciona os planos elegíveis segundo os filtros e agrupa por safra
 * (segunda-feira da semana de `created_at`).
 */
const buildPlanEntries = (
  raw: CohortRawData,
  filters: CohortFilters,
  snapshotsByPartner: Map<string, Snap[]>
): PlanEntry[] => {
  const { partners = [], basePlans = [], tasks = [], managersList = [] } = raw;

  const partnerMap = new Map<string, any>();
  partners.forEach((pt: any) => {
    if (pt && pt.id) partnerMap.set(pt.id, pt);
  });

  const managerMap = new Map<string, string>();
  managersList.forEach((m: any) => {
    if (m && m.id) managerMap.set(m.id, m.nome || 'Sem Gerente');
  });

  const tasksByPlan = new Map<string, any[]>();
  tasks.forEach((t: any) => {
    if (!t.plan_id || t.deletada_em) return;
    const list = tasksByPlan.get(t.plan_id) || [];
    list.push(t);
    tasksByPlan.set(t.plan_id, list);
  });

  // Segmento do parceiro travado no snapshot mais recente até o fim da semana de S0.
  const getPartnerPlanoAtS0 = (partnerId: string, semanaEntrada: string): string | null => {
    const partnerSnaps = snapshotsByPartner.get(partnerId);
    if (!partnerSnaps || partnerSnaps.length === 0) return null;
    const dataRefS0 = addDays(semanaEntrada, 6);
    for (let i = partnerSnaps.length - 1; i >= 0; i--) {
      if (partnerSnaps[i].importedAtDateStr <= dataRefS0) {
        return partnerSnaps[i].plano || null;
      }
    }
    return null;
  };

  const playbookIdSet = new Set(filters.selectedPlaybookIds);
  const planEntries: PlanEntry[] = [];

  basePlans.forEach((p: any) => {
    if (!p || !p.partner_id) return;

    const partner = partnerMap.get(p.partner_id);
    if (!partner) return;

    // Gerente
    if (filters.selectedGerentes.length > 0) {
      const managerName = managerMap.get(partner.gerente_id) || 'Sem Gerente';
      if (!filters.selectedGerentes.includes(managerName)) return;
    }

    // Origem do playbook (BAU x playbook oficial), aplicada ao plano
    if (filters.origemPlaybook === 'playbooks_novos') {
      if (p.playbook_id == null) return;
    } else if (filters.origemPlaybook === 'bau') {
      if (p.playbook_id != null) return;
    }

    // Playbooks oficiais específicos
    if (playbookIdSet.size > 0) {
      if (p.playbook_id == null || !playbookIdSet.has(p.playbook_id)) return;
    }

    // Fila
    if (filters.selectedFila !== 'todos') {
      if (partner.fila !== filters.selectedFila) return;
    }

    // Etapa do plano
    const planTasks = tasksByPlan.get(p.id) || [];
    const todasTasksConcluidas = planTasks.length > 0 && planTasks.every((t: any) => t.status === 'concluida');
    const hasCompletedTask = planTasks.some((t: any) => t.status === 'concluida');

    if (filters.statusEtapaPlano === 'iniciado') {
      if (!(p.ativo === true && hasCompletedTask && !todasTasksConcluidas)) return;
    } else if (filters.statusEtapaPlano === 'finalizado') {
      if (!(p.ativo === false || todasTasksConcluidas)) return;
    }

    // Status de conclusão
    if (filters.statusConclusao === 'sucesso') {
      if (p.status_conclusao !== 'sucesso') return;
    } else if (filters.statusConclusao === 'sem_sucesso') {
      if (p.status_conclusao !== 'sem_sucesso') return;
    } else if (filters.statusConclusao === 'nao_classificado') {
      const hasNoClassification = !p.status_conclusao || p.status_conclusao === '';
      if (!(todasTasksConcluidas && hasNoClassification)) return;
    }

    // A data de entrada é SEMPRE plans.created_at
    if (!p.created_at) return;
    const entryDate = typeof p.created_at === 'string'
      ? p.created_at.split('T')[0]
      : String(p.created_at).substring(0, 10);
    if (!entryDate) return;

    const semanaEntrada = getMondayOfWeek(entryDate);
    if (!semanaEntrada) return;

    // Segmento ("Plano") — histórico travado no snapshot de S0
    if (filters.selectedPlanos.length > 0) {
      const planoS0 = getPartnerPlanoAtS0(p.partner_id, semanaEntrada);
      if (!planoS0 || !filters.selectedPlanos.includes(planoS0)) return;
    }

    planEntries.push({ planId: p.id, partnerId: p.partner_id, semanaEntrada });
  });

  return planEntries;
};

const buildSnapshotsByPartner = (partnerSnapshots: any[]): Map<string, Snap[]> => {
  const snapshotsByPartner = new Map<string, Snap[]>();

  (partnerSnapshots || []).forEach((ps: any) => {
    if (!ps.partner_id || !ps.imported_at) return;
    const dateStr = typeof ps.imported_at === 'string'
      ? ps.imported_at.split('T')[0]
      : String(ps.imported_at).substring(0, 10);

    const list = snapshotsByPartner.get(ps.partner_id) || [];
    list.push({
      importedAtDateStr: dateStr,
      licencas: Number(ps.licencas) || 0,
      licencas_engajadas: Number(ps.licencas_engajadas) || 0,
      plano: ps.plano ? String(ps.plano).trim() : null,
    });
    snapshotsByPartner.set(ps.partner_id, list);
  });

  snapshotsByPartner.forEach((list) => {
    list.sort((a, b) => a.importedAtDateStr.localeCompare(b.importedAtDateStr));
  });

  return snapshotsByPartner;
};

/** Snapshot mais recente do parceiro com `imported_at` <= data de referência. */
const snapAt = (snaps: Snap[] | undefined, dataReferencia: string): Snap | null => {
  if (!snaps || snaps.length === 0) return null;
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].importedAtDateStr <= dataReferencia) return snaps[i];
  }
  return null;
};

export const computeCohortData = (
  raw: CohortRawData | null,
  filters: CohortFilters
): CohortDataset => {
  if (!raw) return LOADING_DATASET;

  const snapshotsByPartner = buildSnapshotsByPartner(raw.partnerSnapshots || []);
  const planEntries = buildPlanEntries(raw, filters, snapshotsByPartner);

  if (planEntries.length === 0) return EMPTY_DATASET;

  const cohortMap = new Map<string, PlanEntry[]>();
  planEntries.forEach((entry) => {
    const list = cohortMap.get(entry.semanaEntrada) || [];
    list.push(entry);
    cohortMap.set(entry.semanaEntrada, list);
  });

  const allWeeks = Array.from(cohortMap.keys()).sort((a, b) => a.localeCompare(b));
  if (allWeeks.length === 0) return EMPTY_DATASET;

  const hojeStr = new Date().toISOString().split('T')[0];

  const maxWeeksFor = (weeks: string[]) =>
    Math.max(8, ...weeks.map((w) => Math.max(0, Math.floor(diffDaysBetween(w, hojeStr) / 7))));

  /** Total de licenças cobertas hoje pelos planos da safra. */
  const totalLicencasHoje = (entries: PlanEntry[]) => {
    let total = 0;
    entries.forEach((item) => {
      const snaps = snapshotsByPartner.get(item.partnerId);
      if (!snaps || snaps.length === 0) return;
      const snap = snapAt(snaps, hojeStr) || snaps[snaps.length - 1];
      total += snap.licencas || 0;
    });
    return total;
  };

  /** Data de referência da coluna Sn: fim da semana de entrada em S0, +N*7 dias depois. */
  const refDateFor = (semanaEntrada: string, N: number) =>
    N === 0 ? addDays(semanaEntrada, 6) : addDays(semanaEntrada, N * 7);

  const weekNotReached = (semanaEntrada: string, N: number) =>
    hojeStr < (N === 0 ? semanaEntrada : refDateFor(semanaEntrada, N));

  // ---------- 1. Coorte de Engajamento ----------
  const engMaxWeeks = maxWeeksFor(allWeeks);

  const engagementCohorts: EngagementCohort[] = allWeeks.map((semanaEntrada) => {
    const entries = cohortMap.get(semanaEntrada)!;
    const weeksData: EngagementWeek[] = [];

    for (let N = 0; N <= engMaxWeeks; N++) {
      if (weekNotReached(semanaEntrada, N)) {
        weeksData.push({ weekIndex: N, avgEngagement: null, sumEngajadas: 0, sumLicencas: 0 });
        continue;
      }
      const dataReferencia = refDateFor(semanaEntrada, N);
      let sumEngajadas = 0;
      let sumLicencas = 0;
      entries.forEach((item) => {
        const snap = snapAt(snapshotsByPartner.get(item.partnerId), dataReferencia);
        if (snap) {
          sumEngajadas += snap.licencas_engajadas || 0;
          sumLicencas += snap.licencas || 0;
        }
      });
      const avg = sumLicencas > 0 ? (sumEngajadas / sumLicencas) * 100 : null;
      weeksData.push({ weekIndex: N, avgEngagement: avg, sumEngajadas, sumLicencas });
    }

    return {
      semanaEntrada,
      label: formatCohortWeekLabel(semanaEntrada),
      rawDateString: semanaEntrada,
      planCount: entries.length,
      totalLicencas: totalLicencasHoje(entries),
      weeksData,
    };
  });

  /**
   * Média por coluna das últimas N safras com dado válido.
   * `weighted` = razão dos somatórios (engajamento %); caso contrário, média aritmética
   * dos totais (licenças).
   */
  const summarize = <T extends { rawDateString: string; planCount: number; totalLicencas: number; weeksData: any[] }>(
    cohorts: T[],
    maxWeeks: number,
    maxCount: number,
    valueOf: (c: T, wIdx: number) => number | null | undefined,
    aggregate: (rows: T[], wIdx: number) => number | null
  ): CohortSummary => {
    const sorted = [...cohorts].sort((a, b) => a.rawDateString.localeCompare(b.rawDateString));
    const averages: (number | null)[] = [];
    const usedSet = new Set<string>();

    for (let wIdx = 0; wIdx <= maxWeeks; wIdx++) {
      const valid = sorted.filter((c) => {
        const v = valueOf(c, wIdx);
        return v !== null && v !== undefined;
      });
      const lastN = valid.slice(-maxCount);
      if (lastN.length === 0) {
        averages.push(null);
      } else {
        averages.push(aggregate(lastN, wIdx));
        lastN.forEach((c) => usedSet.add(c.rawDateString));
      }
    }

    if (usedSet.size === 0) return emptySummary(averages);

    const used = sorted.filter((c) => usedSet.has(c.rawDateString));
    const rangeLabel = `(${formatCohortWeekLabel(used[0].rawDateString)} a ${formatCohortWeekLabel(used[used.length - 1].rawDateString)})`;

    return {
      rangeLabel,
      planCountSum: used.reduce((acc, c) => acc + c.planCount, 0),
      totalLicencasSum: used.reduce((acc, c) => acc + c.totalLicencas, 0),
      averages,
      count: used.length,
    };
  };

  const engagementSummary = (maxCount: number) =>
    summarize(
      engagementCohorts,
      engMaxWeeks,
      maxCount,
      (c, wIdx) => c.weeksData[wIdx]?.avgEngagement,
      (rows, wIdx) => {
        const totalEngajadas = rows.reduce((acc, c) => acc + (c.weeksData[wIdx].sumEngajadas || 0), 0);
        const totalLicencas = rows.reduce((acc, c) => acc + (c.weeksData[wIdx].sumLicencas || 0), 0);
        return totalLicencas > 0 ? Number(((totalEngajadas / totalLicencas) * 100).toFixed(1)) : null;
      }
    );

  const engagement: CohortDataset['engagement'] = {
    status: 'ok',
    cohorts: engagementCohorts,
    maxWeeks: engMaxWeeks,
    summary4Weeks: engagementSummary(4),
    summary12Weeks: engagementSummary(12),
  };

  // ---------- 2. Coorte de Licenças ----------
  const licWeeks = allWeeks.filter((semana) => semana >= DATA_CORTE_SNAPSHOTS);
  let licencas: CohortDataset['licencas'];

  if (licWeeks.length === 0) {
    licencas = { status: 'empty', cohorts: [] };
  } else {
    const licMaxWeeks = maxWeeksFor(licWeeks);

    const licencasCohorts: LicencasCohort[] = licWeeks.map((semanaEntrada) => {
      const entries = cohortMap.get(semanaEntrada)!;
      const weeksData: Array<{ weekIndex: number; sumLicencas: number | null }> = [];

      for (let N = 0; N <= licMaxWeeks; N++) {
        if (weekNotReached(semanaEntrada, N)) {
          weeksData.push({ weekIndex: N, sumLicencas: null });
          continue;
        }
        const dataReferencia = refDateFor(semanaEntrada, N);
        let sumLicencas = 0;
        entries.forEach((item) => {
          const snap = snapAt(snapshotsByPartner.get(item.partnerId), dataReferencia);
          if (snap) sumLicencas += snap.licencas || 0;
        });
        weeksData.push({ weekIndex: N, sumLicencas });
      }

      return {
        semanaEntrada,
        label: formatCohortWeekLabel(semanaEntrada),
        rawDateString: semanaEntrada,
        planCount: entries.length,
        totalLicencas: totalLicencasHoje(entries),
        weeksData,
      };
    });

    const licencasSummary = (maxCount: number) =>
      summarize(
        licencasCohorts,
        licMaxWeeks,
        maxCount,
        (c, wIdx) => c.weeksData[wIdx]?.sumLicencas,
        (rows, wIdx) => Math.round(
          rows.reduce((acc, c) => acc + (c.weeksData[wIdx].sumLicencas || 0), 0) / rows.length
        )
      );

    licencas = {
      status: 'ok',
      cohorts: licencasCohorts,
      maxWeeks: licMaxWeeks,
      summary4Weeks: licencasSummary(4),
      summary12Weeks: licencasSummary(12),
    };
  }

  // ---------- 3. Coorte de Diagnóstico (derivada de 1 + 2) ----------
  let diagnostico: CohortDataset['diagnostico'];

  if (licencas.status !== 'ok') {
    diagnostico = { status: 'empty', cohorts: [], maxWeeks: 8 };
  } else {
    const licencasByWeekMap = new Map<string, Array<{ weekIndex: number; sumLicencas: number | null }>>();
    licencas.cohorts.forEach((c) => licencasByWeekMap.set(c.semanaEntrada, c.weeksData));

    const diagnosticoCohorts = engagementCohorts.map((engCohort) => {
      const licRows = licencasByWeekMap.get(engCohort.semanaEntrada) || [];

      const weeksData = engCohort.weeksData.map((w, idx) => {
        const engCurr = w.avgEngagement;
        const licCurr = licRows[idx]?.sumLicencas ?? null;

        if (engCurr === null || licCurr === null) {
          return { weekIndex: w.weekIndex, avgEngagement: null, sumLicencas: null, deltaEng: null, deltaLic: null, category: 'sem_dado' as CategoryType };
        }

        if (idx === 0) {
          return { weekIndex: w.weekIndex, avgEngagement: engCurr, sumLicencas: licCurr, deltaEng: 0, deltaLic: 0, category: 'marco_zero' as CategoryType };
        }

        const engPrev = engCohort.weeksData[idx - 1]?.avgEngagement;
        const licPrev = licRows[idx - 1]?.sumLicencas ?? null;

        if (engPrev === null || engPrev === undefined || licPrev === null || licPrev === undefined) {
          return { weekIndex: w.weekIndex, avgEngagement: engCurr, sumLicencas: licCurr, deltaEng: null, deltaLic: null, category: 'sem_dado' as CategoryType };
        }

        const deltaEng = engCurr - engPrev;
        const deltaLic = licCurr - licPrev;

        let category: CategoryType = 'estavel';
        // Margem de estabilidade: se |Δ Licenças| < 1 OU |Δ% Engajamento| < 1
        if (Math.abs(deltaLic) < 1 || Math.abs(deltaEng) < 1) category = 'estavel';
        else if (deltaLic > 0 && deltaEng > 0) category = 'crescimento_real';
        else if (deltaLic > 0 && deltaEng < 0) category = 'diluicao_saudavel';
        else if (deltaLic < 0 && deltaEng > 0) category = 'engajamento_inflado';
        else if (deltaLic < 0 && deltaEng < 0) category = 'perda_real';

        return { weekIndex: w.weekIndex, avgEngagement: engCurr, sumLicencas: licCurr, deltaEng, deltaLic, category };
      });

      return {
        semanaEntrada: engCohort.semanaEntrada,
        label: engCohort.label,
        planCount: engCohort.planCount,
        weeksData,
      };
    });

    diagnostico = {
      status: 'ok',
      cohorts: diagnosticoCohorts,
      maxWeeks: Math.max(engMaxWeeks, licencas.maxWeeks ?? 8),
    };
  }

  // ---------- 4. Coorte de Engajamento — Base Fixa (derivada de 1) ----------
  // Denominador travado no S0: elimina a distorção de % quando o parceiro ganha ou
  // perde licença desengajada sem mudança real de engajamento.
  const baseFixaCohorts = engagementCohorts.map((engCohort) => {
    const s0Licencas = engCohort.weeksData[0]?.sumLicencas ?? 0;

    const weeksData = engCohort.weeksData.map((w) => {
      if (w.avgEngagement === null) {
        return { weekIndex: w.weekIndex, valPct: null as number | null, sumEngajadas: w.sumEngajadas, s0Licencas, semDado: false };
      }
      if (s0Licencas === 0) {
        return { weekIndex: w.weekIndex, valPct: null as number | null, sumEngajadas: w.sumEngajadas, s0Licencas: 0, semDado: true };
      }
      return { weekIndex: w.weekIndex, valPct: (w.sumEngajadas / s0Licencas) * 100, sumEngajadas: w.sumEngajadas, s0Licencas, semDado: false };
    });

    return {
      semanaEntrada: engCohort.semanaEntrada,
      label: engCohort.label,
      rawDateString: engCohort.rawDateString,
      planCount: engCohort.planCount,
      totalLicencas: engCohort.totalLicencas,
      s0Licencas,
      weeksData,
    };
  });

  const baseFixaSummary = (maxCount: number) =>
    summarize(
      baseFixaCohorts,
      engMaxWeeks,
      maxCount,
      (c, wIdx) => c.weeksData[wIdx]?.valPct,
      (rows, wIdx) => {
        const totalEngajadas = rows.reduce((acc, c) => acc + (c.weeksData[wIdx].sumEngajadas || 0), 0);
        const totalS0 = rows.reduce((acc, c) => acc + (c.s0Licencas || 0), 0);
        return totalS0 > 0 ? Number(((totalEngajadas / totalS0) * 100).toFixed(1)) : null;
      }
    );

  const baseFixa: CohortDataset['baseFixa'] = {
    status: 'ok',
    cohorts: baseFixaCohorts,
    maxWeeks: engMaxWeeks,
    summary4Weeks: baseFixaSummary(4),
    summary12Weeks: baseFixaSummary(12),
  };

  // ---------- Domínios do heatmap ----------
  // A escala de cor usa o range real dos valores exibidos, em vez de assumir 0-100 fixo.
  const engVals: number[] = [];
  engagementCohorts.forEach((c) => c.weeksData.forEach((w) => {
    if (w.avgEngagement !== null && !isNaN(w.avgEngagement)) engVals.push(w.avgEngagement);
  }));
  [engagement.summary4Weeks, engagement.summary12Weeks].forEach((s) => {
    s?.averages.forEach((a) => { if (a !== null && a !== undefined && !isNaN(a)) engVals.push(a); });
  });

  const bfVals: number[] = [];
  baseFixaCohorts.forEach((c) => c.weeksData.forEach((w) => {
    if (w.valPct !== null && !isNaN(w.valPct)) bfVals.push(w.valPct);
  }));
  [baseFixa.summary4Weeks, baseFixa.summary12Weeks].forEach((s) => {
    s?.averages.forEach((a) => { if (a !== null && a !== undefined && !isNaN(a)) bfVals.push(a); });
  });

  return {
    engagement,
    licencas,
    diagnostico,
    baseFixa,
    engagementHeatDomain: heatDomainOf(engVals),
    baseFixaHeatDomain: heatDomainOf(bfVals),
  };
};
