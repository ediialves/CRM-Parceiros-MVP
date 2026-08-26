import React, { useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  TrendingUp,
  Filter,
  ChevronDown,
  Loader2,
  Calendar,
  Clock,
  Megaphone,
  Users,
  Package,
  Target,
  Activity,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// ---------------------------------------------------------------------------
// Helpers copiados do Dashboard Gerencial V2 (o V2 não extrai helpers em
// componentes; para manter paridade de comportamento os replicamos aqui).
// ---------------------------------------------------------------------------

const formatCohortWeekLabel = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
};

// Segunda-feira (ISO) da semana de uma data YYYY-MM-DD, em UTC.
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

type HeatDomain = { min: number; max: number };

// Escala branco -> verde claro (Green-400) com domínio dinâmico, idêntica ao V2.
const getCohortHeatmapStyle = (
  val: number | null,
  domain?: HeatDomain
): { style: React.CSSProperties; className: string } => {
  if (val === null || val === undefined || isNaN(val)) {
    return { style: {}, className: '' };
  }

  const min = domain?.min ?? 0;
  const max = domain?.max ?? 100;
  const span = max - min || 1;
  const clamped = Math.max(min, Math.min(max, val));
  const factor = (clamped - min) / span;

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

const fmtPct = (val: number | null): string =>
  val === null || val === undefined || isNaN(val)
    ? '—'
    : `${Number(val).toFixed(1).replace('.', ',')}%`;

// Campos de entrada em fase de um card (campaign_partners). A ordem reflete a
// progressão do funil; o menor não-nulo é o momento mais antigo do card.
const ENTRY_PHASE_FIELDS = [
  'entrou_nao_abordado_em',
  'entrou_abordado_em',
  'entrou_reuniao_marcada_em',
  'entrou_proposta_apresentada_em',
  'entrou_converteu_em',
  'entrou_perdeu_em',
] as const;

// Data de ENTRADA na campanha (âncora da safra), NÃO a data de conversão.
// Regra robusta: 1) `entrou_nao_abordado_em` (preenchido no UPSERT de importação em
// Campanhas.tsx, l.164-169, portanto é a data de entrada na campanha); 2) fallback =
// menor (mais antigo) `entrou_X_em` não-nulo do card (cobre cards inseridos direto em
// fase avançada, cujo backfill retroativo preenche as fases anteriores). Não usamos
// created_at/criado_em como fallback final porque essas colunas não são lidas por
// nenhuma tela existente e selecioná-las quebraria a query caso não existam no banco.
const getEntryDate = (cp: any): string | null => {
  if (cp.entrou_nao_abordado_em) {
    return String(cp.entrou_nao_abordado_em).split('T')[0];
  }
  const candidates = ENTRY_PHASE_FIELDS.map((f) => cp[f])
    .filter(Boolean)
    .map((v: any) => String(v));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.localeCompare(b));
  return candidates[0].split('T')[0];
};

interface SnapshotEntry {
  importedAtDateStr: string;
  licencas: number;
  licencas_engajadas: number;
}

// Snapshot mais recente com imported_at <= dataReferencia (busca reversa numa lista
// já ordenada asc por data). Reproduz a lógica de cohortEngagementData do V2.
const getSnapshotAt = (
  list: SnapshotEntry[] | undefined,
  refDateStr: string
): SnapshotEntry | null => {
  if (!list || list.length === 0) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].importedAtDateStr <= refDateStr) return list[i];
  }
  return null;
};

// ---------------------------------------------------------------------------
// Multi-select reutilizável (mesmo visual do V2, ~l.4516-4589)
// ---------------------------------------------------------------------------

interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  placeholderNone: string;
  placeholderPluralUnit: string;
  searchPlaceholder: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  placeholderNone,
  placeholderPluralUnit,
  searchPlaceholder,
  options,
  selected,
  onChange,
  open,
  setOpen,
  search,
  setSearch,
}) => {
  const filtered = useMemo(
    () =>
      options.filter((o) =>
        o.label.toLowerCase().includes(search.toLowerCase())
      ),
    [options, search]
  );

  const buttonLabel =
    selected.length === 0
      ? placeholderNone
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label || '1 selecionado'
      : `${selected.length} ${placeholderPluralUnit}`;

  return (
    <div className="relative flex-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm text-text-primary shadow-sm hover:bg-bg-secondary/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
      >
        <span className="truncate">{buttonLabel}</span>
        <ChevronDown
          className={`h-4 w-4 text-text-secondary transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1.5 z-20 w-full min-w-[240px] rounded-lg border border-border bg-surface p-2 shadow-lg max-h-60 overflow-y-auto scroll-minimal">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full mb-2 rounded border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <div className="flex flex-col gap-1">
              {filtered.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-bg-secondary/40 cursor-pointer text-sm text-text-primary"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          onChange(selected.filter((v) => v !== opt.value));
                        } else {
                          onChange([...selected, opt.value]);
                        }
                      }}
                      className="rounded border-border text-indigo-600 focus:ring-indigo-500/20 h-4 w-4"
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <span className="text-xs text-text-secondary text-center py-2">
                  Nenhum resultado encontrado
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface CampaignRow {
  id: string;
  name: string;
  encerrada_em: string | null;
  created_at: string | null;
}

interface NormalizedCampaignPartner {
  id: string;
  campaign_id: string;
  partner_id: string;
  status: string;
  licencas_convertidas: number;
  entryDate: string | null; // data de entrada na campanha (YYYY-MM-DD)
  gerente: string; // partners.gerente (texto)
  segmento: string; // partners.segmento (rótulo "Plano")
  fila: string | null;
}

interface RawData {
  campaigns: CampaignRow[];
  campaignPartners: NormalizedCampaignPartner[];
  partners: any[]; // id, gerente, segmento, fila (base completa)
  snapshotsByPartner: Map<string, SnapshotEntry[]>;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export const CampanhasAnalytics: React.FC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawData, setRawData] = useState<RawData | null>(null);

  // Filtros globais
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([]);
  const [selectedGerentes, setSelectedGerentes] = useState<string[]>([]);
  const [selectedSegmentos, setSelectedSegmentos] = useState<string[]>([]);
  const [selectedFila, setSelectedFila] = useState<'todos' | 'RETENÇÃO' | 'EXPANSÃO'>('todos');

  // Universo das coortes (engajamento + licenças) e da 1ª série do gráfico de
  // comparação. 'convertidos' = apenas cards com status 'converteu' (padrão,
  // comportamento original); 'todos' = todos os parceiros que entraram em qualquer
  // campanha, independentemente do status.
  const [universe, setUniverse] = useState<'convertidos' | 'todos'>('convertidos');

  // Dropdown / busca
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [gerenteDropdownOpen, setGerenteDropdownOpen] = useState(false);
  const [gerenteSearch, setGerenteSearch] = useState('');
  const [segmentoDropdownOpen, setSegmentoDropdownOpen] = useState(false);
  const [segmentoSearch, setSegmentoSearch] = useState('');

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCampaigns.length > 0) count++;
    if (selectedGerentes.length > 0) count++;
    if (selectedSegmentos.length > 0) count++;
    if (selectedFila !== 'todos') count++;
    return count;
  }, [selectedCampaigns, selectedGerentes, selectedSegmentos, selectedFila]);

  // -------------------------------------------------------------------------
  // Carregamento de dados
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !isAdmin) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoadingData(true);
        setErrorMsg(null);

        // Campanhas
        const fetchCampaigns = async (): Promise<CampaignRow[]> => {
          const { data, error } = await supabase
            .from('campaigns')
            .select('id, name, encerrada_em, created_at')
            .order('created_at', { ascending: false });
          if (error) throw error;
          return (data || []) as CampaignRow[];
        };

        // Vínculos parceiro<->campanha (paginado, lotes de 1000 como o V2)
        const fetchCampaignPartners = async (): Promise<NormalizedCampaignPartner[]> => {
          let all: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('campaign_partners')
              .select(
                `id, campaign_id, partner_id, status, licencas_convertidas, gerente_id,
                 entrou_nao_abordado_em, entrou_abordado_em, entrou_reuniao_marcada_em,
                 entrou_proposta_apresentada_em, entrou_converteu_em, entrou_perdeu_em,
                 partners ( id, gerente, segmento, fila )`
              )
              .order('id', { ascending: true })
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              all = [...all, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return all.map((cp: any) => {
            const partner = Array.isArray(cp.partners) ? cp.partners[0] : cp.partners;
            return {
              id: cp.id,
              campaign_id: cp.campaign_id,
              partner_id: cp.partner_id,
              status: cp.status,
              licencas_convertidas: Number(cp.licencas_convertidas) || 0,
              entryDate: getEntryDate(cp),
              gerente: partner?.gerente ? String(partner.gerente).trim() : '',
              segmento: partner?.segmento ? String(partner.segmento).trim() : '',
              fila: partner?.fila ?? null,
            } as NormalizedCampaignPartner;
          });
        };

        // Base completa de parceiros (para identificar o "resto da base")
        const fetchAllPartners = async (): Promise<any[]> => {
          let all: any[] = [];
          let from = 0;
          const limit = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from('partners')
              .select('id, gerente, segmento, fila')
              .order('id', { ascending: true })
              .range(from, from + limit - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              all = [...all, ...data];
              if (data.length < limit) hasMore = false;
              else from += limit;
            } else {
              hasMore = false;
            }
          }
          return all;
        };

        const [campaigns, campaignPartners, partners] = await Promise.all([
          fetchCampaigns(),
          fetchCampaignPartners(),
          fetchAllPartners(),
        ]);

        // Snapshots de engajamento para todos os parceiros relevantes
        // (convertidos + base). Buscamos em chunks de ~200 partner_id, como o
        // CampanhaKanban faz.
        const relevantPartnerIds = Array.from(
          new Set<string>([
            ...campaignPartners.map((cp) => cp.partner_id).filter(Boolean),
            ...partners.map((p: any) => p.id).filter(Boolean),
          ])
        );

        const snapshotsByPartner = new Map<string, SnapshotEntry[]>();
        const chunkSize = 200;
        for (let i = 0; i < relevantPartnerIds.length; i += chunkSize) {
          const chunk = relevantPartnerIds.slice(i, i + chunkSize);
          const { data: snaps, error: snapsErr } = await supabase
            .from('partner_snapshots')
            .select('partner_id, imported_at, licencas, licencas_engajadas')
            .in('partner_id', chunk);
          if (snapsErr) {
            console.warn('Aviso ao buscar lote de partner_snapshots:', snapsErr);
            continue;
          }
          (snaps || []).forEach((ps: any) => {
            if (!ps.partner_id || !ps.imported_at) return;
            const dateStr =
              typeof ps.imported_at === 'string'
                ? ps.imported_at.split('T')[0]
                : String(ps.imported_at).substring(0, 10);
            const list = snapshotsByPartner.get(ps.partner_id) || [];
            list.push({
              importedAtDateStr: dateStr,
              licencas: Number(ps.licencas) || 0,
              licencas_engajadas: Number(ps.licencas_engajadas) || 0,
            });
            snapshotsByPartner.set(ps.partner_id, list);
          });
        }
        snapshotsByPartner.forEach((list) =>
          list.sort((a, b) => a.importedAtDateStr.localeCompare(b.importedAtDateStr))
        );

        if (!isMounted) return;

        setRawData({ campaigns, campaignPartners, partners, snapshotsByPartner });
      } catch (err: any) {
        console.error('Erro ao buscar dados do Analytics de Campanhas:', err);
        if (isMounted) {
          setErrorMsg(err.message || 'Erro ao carregar dados do banco');
        }
      } finally {
        if (isMounted) setLoadingData(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [user, isAdmin]);

  // -------------------------------------------------------------------------
  // Opções dos filtros
  // -------------------------------------------------------------------------
  const campaignOptions = useMemo<MultiSelectOption[]>(() => {
    if (!rawData) return [];
    return rawData.campaigns.map((c) => ({ value: c.id, label: c.name || 'Sem nome' }));
  }, [rawData]);

  const gerenteOptions = useMemo<MultiSelectOption[]>(() => {
    if (!rawData) return [];
    // Gerente vem sempre de partners.gerente (texto) — nunca de join com users
    // (regra recorrente do CLAUDE.md).
    const set = new Set<string>();
    rawData.campaignPartners.forEach((cp) => {
      if (cp.gerente) set.add(cp.gerente);
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((g) => ({ value: g, label: g }));
  }, [rawData]);

  const segmentoOptions = useMemo<MultiSelectOption[]>(() => {
    if (!rawData) return [];
    const set = new Set<string>();
    rawData.campaignPartners.forEach((cp) => {
      if (cp.segmento) set.add(cp.segmento);
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((s) => ({ value: s, label: s }));
  }, [rawData]);

  // Filtro a nível de parceiro (gerente / segmento / fila) — aplicável tanto ao
  // universo de convertidos quanto ao "resto da base".
  const passesPartnerFilters = (gerente: string, segmento: string, fila: string | null): boolean => {
    if (selectedGerentes.length > 0 && !selectedGerentes.includes(gerente)) return false;
    if (selectedSegmentos.length > 0 && !selectedSegmentos.includes(segmento)) return false;
    if (selectedFila !== 'todos' && fila !== selectedFila) return false;
    return true;
  };

  // Filtro completo de um card (inclui campanha) — usado no universo de convertidos.
  const cardPassesFilters = (cp: NormalizedCampaignPartner): boolean => {
    if (selectedCampaigns.length > 0 && !selectedCampaigns.includes(cp.campaign_id)) return false;
    return passesPartnerFilters(cp.gerente, cp.segmento, cp.fila);
  };

  // Card pertence ao universo selecionado (toggle Convertidos / Todos da campanha).
  // 'convertidos' restringe a status 'converteu'; 'todos' aceita qualquer status.
  const cardInUniverse = (cp: NormalizedCampaignPartner): boolean =>
    universe === 'convertidos' ? cp.status === 'converteu' : true;

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // -------------------------------------------------------------------------
  // KPIs
  // -------------------------------------------------------------------------
  const kpis = useMemo(() => {
    if (!rawData) {
      return {
        totalLicencasVendidas: 0,
        numConvertidos: 0,
        numCampanhas: 0,
        taxaConversao: null as number | null,
        engajamentoMedio: null as number | null,
      };
    }

    const cardsInScope = rawData.campaignPartners.filter(cardPassesFilters);
    const convertedCards = cardsInScope.filter((cp) => cp.status === 'converteu');

    const convertedPartnerIds = new Set(convertedCards.map((cp) => cp.partner_id));
    const totalLicencasVendidas = convertedCards.reduce(
      (acc, cp) => acc + (cp.licencas_convertidas || 0),
      0
    );
    const numCampanhas = new Set(cardsInScope.map((cp) => cp.campaign_id)).size;
    const taxaConversao =
      cardsInScope.length > 0 ? (convertedCards.length / cardsInScope.length) * 100 : null;

    // Engajamento atual: snapshot mais recente (<= hoje) de cada parceiro convertido.
    let sumEng = 0;
    let sumLic = 0;
    convertedPartnerIds.forEach((pid) => {
      const snap = getSnapshotAt(rawData.snapshotsByPartner.get(pid), todayStr);
      if (snap) {
        sumEng += snap.licencas_engajadas;
        sumLic += snap.licencas;
      }
    });
    const engajamentoMedio = sumLic > 0 ? (sumEng / sumLic) * 100 : null;

    return {
      totalLicencasVendidas,
      numConvertidos: convertedPartnerIds.size,
      numCampanhas,
      taxaConversao,
      engajamentoMedio,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, selectedCampaigns, selectedGerentes, selectedSegmentos, selectedFila, todayStr]);

  // -------------------------------------------------------------------------
  // Coorte de engajamento pós-entrada (universo = convertidos)
  // -------------------------------------------------------------------------
  const cohortData = useMemo(() => {
    if (!rawData) return { status: 'loading' as const, cohorts: [] as any[] };

    const scopedCards = rawData.campaignPartners.filter(
      (cp) => cardInUniverse(cp) && cardPassesFilters(cp)
    );

    // Agrupa parceiros do universo selecionado pela segunda-feira da semana de
    // ENTRADA na campanha. Dedupe por partner_id dentro da mesma semana (um parceiro
    // pode ter entrado/convertido em mais de uma campanha na mesma semana).
    const cohortMap = new Map<string, Set<string>>();
    scopedCards.forEach((cp) => {
      if (!cp.entryDate) return;
      const monday = getMondayOfWeek(cp.entryDate);
      if (!monday) return;
      const set = cohortMap.get(monday) || new Set<string>();
      set.add(cp.partner_id);
      cohortMap.set(monday, set);
    });

    const sortedWeeks = Array.from(cohortMap.keys()).sort((a, b) => a.localeCompare(b));
    if (sortedWeeks.length === 0) {
      return { status: 'empty' as const, cohorts: [] as any[] };
    }

    const maxWeeksAvailable = Math.max(
      8,
      ...sortedWeeks.map((w) => Math.max(0, Math.floor(diffDaysBetween(w, todayStr) / 7)))
    );

    const cohorts = sortedWeeks.map((semanaEntrada) => {
      const partnerIds = Array.from(cohortMap.get(semanaEntrada)!);
      const label = formatCohortWeekLabel(semanaEntrada);
      const planCount = partnerIds.length;

      // Total de licenças cobertas (snapshot mais recente <= hoje).
      let totalLicencas = 0;
      partnerIds.forEach((pid) => {
        const snap = getSnapshotAt(rawData.snapshotsByPartner.get(pid), todayStr);
        if (snap) totalLicencas += snap.licencas;
      });

      const weeksData: Array<{
        weekIndex: number;
        avgEngagement: number | null;
        sumEngajadas: number;
        sumLicencas: number;
      }> = [];

      for (let N = 0; N <= maxWeeksAvailable; N++) {
        // S0 usa o domingo da semana de entrada (semana+6); Sn = +N*7 (idêntico ao V2).
        const dataReferencia = N === 0 ? addDays(semanaEntrada, 6) : addDays(semanaEntrada, N * 7);
        if (todayStr < (N === 0 ? semanaEntrada : dataReferencia)) {
          weeksData.push({ weekIndex: N, avgEngagement: null, sumEngajadas: 0, sumLicencas: 0 });
          continue;
        }
        let sumEng = 0;
        let sumLic = 0;
        partnerIds.forEach((pid) => {
          const snap = getSnapshotAt(rawData.snapshotsByPartner.get(pid), dataReferencia);
          if (snap) {
            sumEng += snap.licencas_engajadas;
            sumLic += snap.licencas;
          }
        });
        const avg = sumLic > 0 ? (sumEng / sumLic) * 100 : null;
        weeksData.push({ weekIndex: N, avgEngagement: avg, sumEngajadas: sumEng, sumLicencas: sumLic });
      }

      return { semanaEntrada, label, rawDateString: semanaEntrada, planCount, totalLicencas, weeksData };
    });

    // Médias por coluna (4 e 12 semanas) — mesma lógica de calculateColumnBasedAverages do V2.
    const calculateColumnBasedAverages = (maxCount: number) => {
      const sortedCohorts = [...cohorts].sort((a, b) =>
        a.rawDateString.localeCompare(b.rawDateString)
      );
      const averages: (number | null)[] = [];
      const usedCohortsSet = new Set<string>();

      for (let wIdx = 0; wIdx <= maxWeeksAvailable; wIdx++) {
        const validCohorts = sortedCohorts.filter((c) => {
          const val = c.weeksData[wIdx]?.avgEngagement;
          return val !== null && val !== undefined;
        });
        const lastNCohorts = validCohorts.slice(-maxCount);
        if (lastNCohorts.length === 0) {
          averages.push(null);
        } else {
          const totalEng = lastNCohorts.reduce((acc, c) => acc + (c.weeksData[wIdx].sumEngajadas || 0), 0);
          const totalLic = lastNCohorts.reduce((acc, c) => acc + (c.weeksData[wIdx].sumLicencas || 0), 0);
          if (totalLic > 0) averages.push(Number(((totalEng / totalLic) * 100).toFixed(1)));
          else averages.push(null);
          lastNCohorts.forEach((c) => usedCohortsSet.add(c.rawDateString));
        }
      }

      if (usedCohortsSet.size === 0) {
        return { rangeLabel: '', planCountSum: 0, totalLicencasSum: 0, averages, count: 0 };
      }
      const usedCohortsList = sortedCohorts.filter((c) => usedCohortsSet.has(c.rawDateString));
      const firstDate = formatCohortWeekLabel(usedCohortsList[0].rawDateString);
      const lastDate = formatCohortWeekLabel(usedCohortsList[usedCohortsList.length - 1].rawDateString);
      return {
        rangeLabel: `(${firstDate} a ${lastDate})`,
        planCountSum: usedCohortsList.reduce((acc, c) => acc + c.planCount, 0),
        totalLicencasSum: usedCohortsList.reduce((acc, c) => acc + c.totalLicencas, 0),
        averages,
        count: usedCohortsList.length,
      };
    };

    return {
      status: 'ok' as const,
      cohorts,
      maxWeeks: maxWeeksAvailable,
      summary4Weeks: calculateColumnBasedAverages(4),
      summary12Weeks: calculateColumnBasedAverages(12),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, selectedCampaigns, selectedGerentes, selectedSegmentos, selectedFila, universe, todayStr]);

  const cohortHeatDomain = useMemo<HeatDomain>(() => {
    const vals: number[] = [];
    (cohortData.cohorts || []).forEach((c: any) =>
      c.weeksData.forEach((w: any) => {
        if (w.avgEngagement !== null && !isNaN(w.avgEngagement)) vals.push(w.avgEngagement);
      })
    );
    if (cohortData.status === 'ok') {
      [cohortData.summary4Weeks, cohortData.summary12Weeks].forEach((s: any) =>
        s?.averages.forEach((a: number | null) => {
          if (a !== null && !isNaN(a)) vals.push(a);
        })
      );
    }
    if (vals.length === 0) return { min: 0, max: 100 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [cohortData]);

  // -------------------------------------------------------------------------
  // Coorte de LICENÇAS pós-entrada — evolução do total de licenças (Σ licencas do
  // snapshot mais recente <= data de referência de cada coluna) dos parceiros de
  // cada safra. Mesma mecânica temporal e mesmo universo (toggle) da coorte de
  // engajamento; a diferença é a métrica exibida na célula.
  //
  // ESCOLHA (absoluto vs. delta): exibimos o TOTAL ABSOLUTO de licenças por célula,
  // com S0 servindo de base de referência. A leitura horizontal (S0 -> Sn) já
  // evidencia o aumento de licenças pós-entrada sem precisar transformar em delta,
  // e o valor absoluto preserva a magnitude (importante porque licenças NÃO são
  // 0–100 e o heatmap usa domínio dinâmico sobre o range real dos valores).
  // -------------------------------------------------------------------------
  const licencasCohortData = useMemo(() => {
    if (!rawData) return { status: 'loading' as const, cohorts: [] as any[], maxWeeks: 8 };

    const scopedCards = rawData.campaignPartners.filter(
      (cp) => cardInUniverse(cp) && cardPassesFilters(cp)
    );

    // Mesmo agrupamento/dedupe por safra da coorte de engajamento.
    const cohortMap = new Map<string, Set<string>>();
    scopedCards.forEach((cp) => {
      if (!cp.entryDate) return;
      const monday = getMondayOfWeek(cp.entryDate);
      if (!monday) return;
      const set = cohortMap.get(monday) || new Set<string>();
      set.add(cp.partner_id);
      cohortMap.set(monday, set);
    });

    const sortedWeeks = Array.from(cohortMap.keys()).sort((a, b) => a.localeCompare(b));
    if (sortedWeeks.length === 0) {
      return { status: 'empty' as const, cohorts: [] as any[], maxWeeks: 8 };
    }

    const maxWeeksAvailable = Math.max(
      8,
      ...sortedWeeks.map((w) => Math.max(0, Math.floor(diffDaysBetween(w, todayStr) / 7)))
    );

    const cohorts = sortedWeeks.map((semanaEntrada) => {
      const partnerIds = Array.from(cohortMap.get(semanaEntrada)!);
      const label = formatCohortWeekLabel(semanaEntrada);
      const planCount = partnerIds.length;

      const weeksData: Array<{ weekIndex: number; totalLicencas: number | null }> = [];
      for (let N = 0; N <= maxWeeksAvailable; N++) {
        const dataReferencia = N === 0 ? addDays(semanaEntrada, 6) : addDays(semanaEntrada, N * 7);
        // Coluna no futuro em relação a hoje => sem dado.
        if (todayStr < (N === 0 ? semanaEntrada : dataReferencia)) {
          weeksData.push({ weekIndex: N, totalLicencas: null });
          continue;
        }
        let total = 0;
        let hasData = false;
        partnerIds.forEach((pid) => {
          const snap = getSnapshotAt(rawData.snapshotsByPartner.get(pid), dataReferencia);
          if (snap) {
            total += snap.licencas;
            hasData = true;
          }
        });
        // Se nenhum parceiro da safra tem snapshot até a data => célula "sem dado".
        weeksData.push({ weekIndex: N, totalLicencas: hasData ? total : null });
      }

      return { semanaEntrada, label, rawDateString: semanaEntrada, planCount, weeksData };
    });

    return { status: 'ok' as const, cohorts, maxWeeks: maxWeeksAvailable };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, selectedCampaigns, selectedGerentes, selectedSegmentos, selectedFila, universe, todayStr]);

  // Domínio dinâmico do heatmap de licenças (min/max reais — licenças não são 0–100).
  const licencasHeatDomain = useMemo<HeatDomain>(() => {
    const vals: number[] = [];
    (licencasCohortData.cohorts || []).forEach((c: any) =>
      c.weeksData.forEach((w: any) => {
        if (w.totalLicencas !== null && !isNaN(w.totalLicencas)) vals.push(w.totalLicencas);
      })
    );
    if (vals.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [licencasCohortData]);

  // -------------------------------------------------------------------------
  // Comparação: em campanha vs. resto da base (últimas 12 semanas)
  // -------------------------------------------------------------------------
  const comparisonData = useMemo(() => {
    if (!rawData) return null;

    // Grupo A: parceiros do universo selecionado (convertidos, ou todos os que
    // entraram em campanha), passando filtros — inclusive campanha.
    const convertedPartnerIds = new Set<string>(
      rawData.campaignPartners
        .filter((cp) => cardInUniverse(cp) && cardPassesFilters(cp))
        .map((cp) => cp.partner_id)
    );

    // Grupo B: "resto da base" = parceiros que NUNCA passaram por nenhuma campanha.
    // Os filtros de campanha não se aplicam à base (ela não está em campanhas);
    // aplicamos só os filtros a nível de parceiro (gerente/segmento/fila).
    const everInCampaign = new Set<string>(rawData.campaignPartners.map((cp) => cp.partner_id));
    const basePartnerIds = new Set<string>(
      rawData.partners
        .filter(
          (p: any) =>
            !everInCampaign.has(p.id) &&
            passesPartnerFilters(
              p.gerente ? String(p.gerente).trim() : '',
              p.segmento ? String(p.segmento).trim() : '',
              p.fila ?? null
            )
        )
        .map((p: any) => p.id)
    );

    // Últimas 12 segundas-feiras (semanas ISO).
    const currentMonday = getMondayOfWeek(todayStr);
    const weeks: string[] = [];
    for (let i = 11; i >= 0; i--) weeks.push(addDays(currentMonday, -i * 7));

    const engagementForGroup = (ids: Set<string>, refDateStr: string): number | null => {
      let sumEng = 0;
      let sumLic = 0;
      ids.forEach((pid) => {
        const snap = getSnapshotAt(rawData.snapshotsByPartner.get(pid), refDateStr);
        if (snap) {
          sumEng += snap.licencas_engajadas;
          sumLic += snap.licencas;
        }
      });
      return sumLic > 0 ? (sumEng / sumLic) * 100 : null;
    };

    const labels = weeks.map(formatCohortWeekLabel);
    const convertedSeries: (number | null)[] = [];
    const baseSeries: (number | null)[] = [];
    weeks.forEach((monday) => {
      // Referência = domingo da semana (monday+6), limitada a hoje.
      const sunday = addDays(monday, 6);
      const ref = sunday > todayStr ? todayStr : sunday;
      convertedSeries.push(engagementForGroup(convertedPartnerIds, ref));
      baseSeries.push(engagementForGroup(basePartnerIds, ref));
    });

    return {
      labels,
      convertedSeries,
      baseSeries,
      convertedCount: convertedPartnerIds.size,
      baseCount: basePartnerIds.size,
      // Rótulo dinâmico da 1ª série conforme o toggle de universo.
      groupALabel: universe === 'convertidos' ? 'Convertidos' : 'Em campanha (todos)',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, selectedCampaigns, selectedGerentes, selectedSegmentos, selectedFila, universe, todayStr]);

  // -------------------------------------------------------------------------
  // Ranking por campanha
  // -------------------------------------------------------------------------
  const rankingData = useMemo(() => {
    if (!rawData) return [];

    const campaignsInScope =
      selectedCampaigns.length > 0
        ? rawData.campaigns.filter((c) => selectedCampaigns.includes(c.id))
        : rawData.campaigns;

    const rows = campaignsInScope.map((campaign) => {
      const cards = rawData.campaignPartners.filter(
        (cp) => cp.campaign_id === campaign.id && passesPartnerFilters(cp.gerente, cp.segmento, cp.fila)
      );
      const convertedCards = cards.filter((cp) => cp.status === 'converteu');
      const convertedPartnerIds = new Set(convertedCards.map((cp) => cp.partner_id));

      const licencasVendidas = convertedCards.reduce(
        (acc, cp) => acc + (cp.licencas_convertidas || 0),
        0
      );
      const taxaConversao = cards.length > 0 ? (convertedCards.length / cards.length) * 100 : null;

      let sumEng = 0;
      let sumLic = 0;
      convertedPartnerIds.forEach((pid) => {
        const snap = getSnapshotAt(rawData.snapshotsByPartner.get(pid), todayStr);
        if (snap) {
          sumEng += snap.licencas_engajadas;
          sumLic += snap.licencas;
        }
      });
      const engajamentoMedio = sumLic > 0 ? (sumEng / sumLic) * 100 : null;

      return {
        id: campaign.id,
        name: campaign.name || 'Sem nome',
        encerrada: !!campaign.encerrada_em,
        numConvertidos: convertedPartnerIds.size,
        licencasVendidas,
        taxaConversao,
        engajamentoMedio,
      };
    });

    // Ordenável por licenças vendidas desc por padrão.
    return rows.sort((a, b) => b.licencasVendidas - a.licencasVendidas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, selectedCampaigns, selectedGerentes, selectedSegmentos, selectedFila, todayStr]);

  const comparisonChart = useMemo(() => {
    if (!comparisonData) return null;

    // Cores neutras legíveis em tema claro/escuro (slate) para eixos/grade/legenda,
    // já que o chart.js não lê os tokens Tailwind/CSS-vars do tema.
    const axisColor = 'rgba(100, 116, 139, 0.9)'; // slate-500
    const gridColor = 'rgba(148, 163, 184, 0.18)'; // slate-400 translúcido

    return {
      // labels: exatamente as ~12 semanas em dd/MM (mesmo tamanho das séries).
      data: {
        labels: comparisonData.labels,
        datasets: [
          {
            label: `${comparisonData.groupALabel} (${comparisonData.convertedCount})`,
            data: comparisonData.convertedSeries,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            tension: 0.3,
            spanGaps: true,
            pointRadius: 3,
          },
          {
            label: `Resto da base (${comparisonData.baseCount})`,
            data: comparisonData.baseSeries,
            borderColor: '#94a3b8',
            backgroundColor: 'rgba(148, 163, 184, 0.1)',
            tension: 0.3,
            spanGaps: true,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index' as const, intersect: false },
        plugins: {
          legend: { position: 'top' as const, labels: { color: axisColor } },
          tooltip: {
            callbacks: {
              label: (ctx: any) =>
                `${ctx.dataset.label}: ${
                  ctx.parsed.y === null || ctx.parsed.y === undefined
                    ? 'sem dado'
                    : `${Number(ctx.parsed.y).toFixed(1).replace('.', ',')}%`
                }`,
            },
          },
        },
        scales: {
          // Eixo X categórico: as ~12 semanas (dd/MM). autoSkip evita sobreposição
          // de rótulos e maxRotation:0 mantém as datas na horizontal e legíveis.
          x: {
            type: 'category' as const,
            grid: { color: gridColor },
            ticks: {
              color: axisColor,
              autoSkip: true,
              maxRotation: 0,
              minRotation: 0,
              maxTicksLimit: 12,
              autoSkipPadding: 8,
            },
          },
          y: {
            beginAtZero: true,
            max: 100,
            grid: { color: gridColor },
            ticks: { color: axisColor, callback: (v: any) => `${v}%` },
          },
        },
      },
    };
  }, [comparisonData]);

  // -------------------------------------------------------------------------
  // Guard admin-only
  // -------------------------------------------------------------------------
  if (authLoading) return null;
  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const maxWeeks = cohortData.status === 'ok' ? cohortData.maxWeeks ?? 8 : 8;
  const maxWeeksLic = licencasCohortData.status === 'ok' ? licencasCohortData.maxWeeks ?? 8 : 8;

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8">
      <style>{`
        .scroll-minimal::-webkit-scrollbar { width: 6px; height: 6px; }
        .scroll-minimal::-webkit-scrollbar-thumb { background-color: rgba(156, 163, 175, 0.3); border-radius: 9999px; }
        .scroll-minimal::-webkit-scrollbar-thumb:hover { background-color: rgba(156, 163, 175, 0.5); }
        .scroll-minimal::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* Header */}
      <div className="mb-8 flex items-center justify-between border-b border-border border-opacity-50 pb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">
              Analytics de Campanhas
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Engajamento pós-venda dos parceiros convertidos, por safra de entrada na campanha.
            </p>
          </div>
        </div>
      </div>

      {loadingData ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-secondary">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm font-medium">Carregando dados de campanhas...</p>
        </div>
      ) : errorMsg ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 p-6 text-rose-700 dark:text-rose-300">
          <p className="font-semibold">Erro ao carregar dados</p>
          <p className="text-sm mt-1">{errorMsg}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Barra de Filtros */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-border border-opacity-30 pb-3">
              <div className="flex items-center gap-2.5">
                <Filter className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-text-primary">Filtros de Análise</h3>
              </div>
              <div className="flex items-center gap-3 ml-auto">
                <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                  {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro ativo' : 'filtros ativos'}
                </span>
                <button
                  type="button"
                  disabled={activeFiltersCount === 0}
                  onClick={() => {
                    setSelectedCampaigns([]);
                    setSelectedGerentes([]);
                    setSelectedSegmentos([]);
                    setSelectedFila('todos');
                  }}
                  className={`text-xs font-semibold transition-colors ${
                    activeFiltersCount > 0
                      ? 'text-rose-500 hover:text-rose-600 cursor-pointer'
                      : 'text-text-secondary opacity-40 cursor-not-allowed'
                  }`}
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-5">
              {/* Campanha */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Campanha
                </span>
                <MultiSelectDropdown
                  placeholderNone="Todas as campanhas"
                  placeholderPluralUnit="campanhas selecionadas"
                  searchPlaceholder="Buscar campanha..."
                  options={campaignOptions}
                  selected={selectedCampaigns}
                  onChange={setSelectedCampaigns}
                  open={campaignDropdownOpen}
                  setOpen={(v) => {
                    setCampaignDropdownOpen(v);
                    setGerenteDropdownOpen(false);
                    setSegmentoDropdownOpen(false);
                  }}
                  search={campaignSearch}
                  setSearch={setCampaignSearch}
                />
              </div>

              {/* Gerente */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Gerente
                </span>
                <MultiSelectDropdown
                  placeholderNone="Todos os gerentes"
                  placeholderPluralUnit="gerentes selecionados"
                  searchPlaceholder="Buscar gerente..."
                  options={gerenteOptions}
                  selected={selectedGerentes}
                  onChange={setSelectedGerentes}
                  open={gerenteDropdownOpen}
                  setOpen={(v) => {
                    setGerenteDropdownOpen(v);
                    setCampaignDropdownOpen(false);
                    setSegmentoDropdownOpen(false);
                  }}
                  search={gerenteSearch}
                  setSearch={setGerenteSearch}
                />
              </div>

              {/* Plano / Segmento */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Plano / Segmento
                </span>
                <MultiSelectDropdown
                  placeholderNone="Todos os planos"
                  placeholderPluralUnit="planos selecionados"
                  searchPlaceholder="Buscar plano..."
                  options={segmentoOptions}
                  selected={selectedSegmentos}
                  onChange={setSelectedSegmentos}
                  open={segmentoDropdownOpen}
                  setOpen={(v) => {
                    setSegmentoDropdownOpen(v);
                    setCampaignDropdownOpen(false);
                    setGerenteDropdownOpen(false);
                  }}
                  search={segmentoSearch}
                  setSearch={setSegmentoSearch}
                />
              </div>

              {/* Fila */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  Fila
                </span>
                <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 h-[38px] shadow-sm">
                  {(['todos', 'RETENÇÃO', 'EXPANSÃO'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSelectedFila(f)}
                      className={`flex-1 rounded-md py-1 px-2 text-xs font-semibold whitespace-nowrap transition-all ${
                        selectedFila === f
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                      }`}
                    >
                      {f === 'todos' ? 'Todas' : f === 'RETENÇÃO' ? 'Retenção' : 'Expansão'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                icon: Package,
                label: 'Licenças vendidas',
                value: kpis.totalLicencasVendidas.toLocaleString('pt-BR'),
                color: 'text-emerald-600 dark:text-emerald-400',
                bg: 'bg-emerald-50 dark:bg-emerald-950/40',
              },
              {
                icon: Users,
                label: 'Parceiros convertidos',
                value: kpis.numConvertidos.toLocaleString('pt-BR'),
                color: 'text-indigo-600 dark:text-indigo-400',
                bg: 'bg-indigo-50 dark:bg-indigo-950/40',
              },
              {
                icon: Megaphone,
                label: 'Campanhas',
                value: kpis.numCampanhas.toLocaleString('pt-BR'),
                color: 'text-sky-600 dark:text-sky-400',
                bg: 'bg-sky-50 dark:bg-sky-950/40',
              },
              {
                icon: Target,
                label: 'Taxa de conversão média',
                value: fmtPct(kpis.taxaConversao),
                color: 'text-amber-600 dark:text-amber-400',
                bg: 'bg-amber-50 dark:bg-amber-950/40',
              },
              {
                icon: Activity,
                label: 'Engajamento atual dos convertidos',
                value: fmtPct(kpis.engajamentoMedio),
                color: 'text-fuchsia-600 dark:text-fuchsia-400',
                bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40',
              },
            ].map((kpi, idx) => (
              <div key={idx} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`rounded-lg p-1.5 ${kpi.bg} ${kpi.color}`}>
                    <kpi.icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    {kpi.label}
                  </span>
                </div>
                <p className="text-2xl font-extrabold text-text-primary">{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Toggle de universo das coortes (Convertidos / Todos da campanha) */}
          <div className="rounded-xl border border-border bg-card px-6 py-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Universo das coortes</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Define quais parceiros entram nas tabelas de coorte (engajamento e licenças) e na
                  1ª série do gráfico de comparação.
                </p>
              </div>
            </div>
            <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 shadow-sm shrink-0">
              {([
                { key: 'convertidos', label: 'Convertidos' },
                { key: 'todos', label: 'Todos da campanha' },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setUniverse(opt.key)}
                  className={`rounded-md py-1.5 px-3 text-xs font-semibold whitespace-nowrap transition-all ${
                    universe === opt.key
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Coorte de Engajamento pós-entrada */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-text-primary">
                Coorte de Engajamento pós-entrada
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Engajamento médio (% de licenças engajadas) dos parceiros{' '}
                {universe === 'convertidos' ? 'convertidos' : 'que entraram em campanha'}, por semana
                de entrada na campanha (S0 = semana de entrada; Sn = N semanas depois).
              </p>
            </div>

            {cohortData.status === 'loading' ? (
              <div className="p-8 text-center text-text-secondary">
                <p className="text-sm font-medium">Carregando dados da coorte...</p>
              </div>
            ) : cohortData.status === 'empty' || cohortData.cohorts.length === 0 ? (
              <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
                <p className="font-semibold text-sm text-text-primary">
                  {universe === 'convertidos'
                    ? 'Nenhum parceiro convertido encontrado para os filtros selecionados.'
                    : 'Nenhum parceiro em campanha encontrado para os filtros selecionados.'}
                </p>
                <p className="text-xs mt-1 text-text-secondary">
                  Ajuste os filtros de Campanha, Gerente, Plano ou Fila.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto relative">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead>
                    <tr className="border-b border-border bg-bg-secondary/30">
                      <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                        Safra (entrada)
                      </th>
                      <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        Parceiros
                      </th>
                      <th className="py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        Lic. Cobertas
                      </th>
                      {Array.from({ length: maxWeeks + 1 }).map((_, i) => (
                        <th
                          key={i}
                          className="py-2.5 px-1.5 text-center min-w-[50px] font-bold text-text-secondary whitespace-nowrap border-b border-border"
                        >
                          S{i}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {cohortData.cohorts.map((cohort: any, idx: number) => {
                      const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                      const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                      return (
                        <tr key={cohort.semanaEntrada} className={rowBgClass}>
                          <td
                            className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                              <span>{cohort.label}</span>
                            </div>
                          </td>
                          <td
                            className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}
                          >
                            {cohort.planCount}
                          </td>
                          <td className="py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap border-b border-border/40">
                            {cohort.totalLicencas.toLocaleString('pt-BR')}
                          </td>
                          {cohort.weeksData.map((w: any) => {
                            const isNull = w.avgEngagement === null;
                            const heat = isNull
                              ? { style: {}, className: '' }
                              : getCohortHeatmapStyle(w.avgEngagement, cohortHeatDomain);
                            return (
                              <td
                                key={w.weekIndex}
                                style={heat.style}
                                className={`py-2 px-1.5 text-center text-xs whitespace-nowrap transition-colors border-b border-border/40 ${heat.className}`}
                              >
                                {isNull ? '' : fmtPct(w.avgEngagement)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  {cohortData.status === 'ok' &&
                    cohortData.summary4Weeks &&
                    cohortData.summary12Weeks && (
                      <tfoot className="border-t-2 border-border/80 bg-bg-secondary/30">
                        <tr className="bg-bg-secondary/20 font-semibold text-text-primary">
                          <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px] border-b border-border/60">
                            <div
                              className="flex items-center gap-1"
                              title={
                                cohortData.summary4Weeks.rangeLabel
                                  ? `Período: ${cohortData.summary4Weeks.rangeLabel}`
                                  : undefined
                              }
                            >
                              <TrendingUp className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                              <span>Média 4 sem.</span>
                            </div>
                          </td>
                          <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {cohortData.summary4Weeks.count > 0
                              ? cohortData.summary4Weeks.planCountSum
                              : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-center text-text-secondary whitespace-nowrap border-b border-border/60">
                            {cohortData.summary4Weeks.count > 0
                              ? cohortData.summary4Weeks.totalLicencasSum.toLocaleString('pt-BR')
                              : '—'}
                          </td>
                          {cohortData.summary4Weeks.averages.map((avg: number | null, i: number) => {
                            const heat =
                              avg !== null
                                ? getCohortHeatmapStyle(avg, cohortHeatDomain)
                                : { style: {}, className: '' };
                            return (
                              <td
                                key={i}
                                style={heat.style}
                                className={`py-2 px-1.5 text-center text-xs whitespace-nowrap border-b border-border/60 ${heat.className}`}
                              >
                                {fmtPct(avg)}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="bg-bg-secondary/40 font-semibold text-text-primary">
                          <td className="sticky left-0 z-20 bg-card py-2.5 px-2 whitespace-nowrap min-w-[100px]">
                            <div
                              className="flex items-center gap-1"
                              title={
                                cohortData.summary12Weeks.rangeLabel
                                  ? `Período: ${cohortData.summary12Weeks.rangeLabel}`
                                  : undefined
                              }
                            >
                              <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Média 12 sem.</span>
                            </div>
                          </td>
                          <td className="sticky left-[100px] z-20 bg-card py-2.5 px-2 text-center text-text-secondary whitespace-nowrap min-w-[65px] border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {cohortData.summary12Weeks.count > 0
                              ? cohortData.summary12Weeks.planCountSum
                              : '—'}
                          </td>
                          <td className="py-2.5 px-2 text-center text-text-secondary whitespace-nowrap">
                            {cohortData.summary12Weeks.count > 0
                              ? cohortData.summary12Weeks.totalLicencasSum.toLocaleString('pt-BR')
                              : '—'}
                          </td>
                          {cohortData.summary12Weeks.averages.map((avg: number | null, i: number) => {
                            const heat =
                              avg !== null
                                ? getCohortHeatmapStyle(avg, cohortHeatDomain)
                                : { style: {}, className: '' };
                            return (
                              <td
                                key={i}
                                style={heat.style}
                                className={`py-2 px-1.5 text-center text-xs whitespace-nowrap ${heat.className}`}
                              >
                                {fmtPct(avg)}
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

          {/* Coorte de Licenças pós-entrada (evolução do total de licenças) */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-text-primary">
                Coorte de Licenças — evolução pós-entrada
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Total absoluto de licenças dos parceiros de cada safra ao longo das semanas após a
                entrada na campanha (S0 = semana de entrada; Sn = N semanas depois). A leitura
                horizontal (S0 → Sn) evidencia o aumento de licenças; o heatmap usa domínio dinâmico
                pelo range real dos valores. Célula em branco (—) = safra sem snapshot até a data.
              </p>
            </div>

            {licencasCohortData.status === 'loading' ? (
              <div className="p-8 text-center text-text-secondary">
                <p className="text-sm font-medium">Carregando dados da coorte...</p>
              </div>
            ) : licencasCohortData.status === 'empty' || licencasCohortData.cohorts.length === 0 ? (
              <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
                <p className="font-semibold text-sm text-text-primary">
                  {universe === 'convertidos'
                    ? 'Nenhum parceiro convertido encontrado para os filtros selecionados.'
                    : 'Nenhum parceiro em campanha encontrado para os filtros selecionados.'}
                </p>
                <p className="text-xs mt-1 text-text-secondary">
                  Ajuste os filtros de Campanha, Gerente, Plano ou Fila.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto relative">
                <table className="w-full text-left text-xs border-separate border-spacing-0">
                  <thead>
                    <tr className="border-b border-border bg-bg-secondary/30">
                      <th className="sticky left-0 z-30 bg-card py-2.5 px-2 font-bold text-text-secondary whitespace-nowrap min-w-[100px] border-b border-border">
                        Safra (entrada)
                      </th>
                      <th className="sticky left-[100px] z-30 bg-card py-2.5 px-2 text-center font-bold text-text-secondary whitespace-nowrap min-w-[65px] border-b border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        Parceiros
                      </th>
                      {Array.from({ length: maxWeeksLic + 1 }).map((_, i) => (
                        <th
                          key={i}
                          className="py-2.5 px-1.5 text-center min-w-[50px] font-bold text-text-secondary whitespace-nowrap border-b border-border"
                        >
                          S{i}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {licencasCohortData.cohorts.map((cohort: any, idx: number) => {
                      const rowBgClass = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10';
                      const stickyCellBg = idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/30';
                      return (
                        <tr key={cohort.semanaEntrada} className={rowBgClass}>
                          <td
                            className={`sticky left-0 z-20 ${stickyCellBg} py-2.5 px-2 font-semibold text-text-primary whitespace-nowrap min-w-[100px] border-b border-border/40`}
                          >
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-text-secondary shrink-0" />
                              <span>{cohort.label}</span>
                            </div>
                          </td>
                          <td
                            className={`sticky left-[100px] z-20 ${stickyCellBg} py-2.5 px-2 text-center font-medium text-text-primary whitespace-nowrap min-w-[65px] border-b border-r border-border/60 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]`}
                          >
                            {cohort.planCount}
                          </td>
                          {cohort.weeksData.map((w: any) => {
                            const isNull = w.totalLicencas === null;
                            const heat = isNull
                              ? { style: {}, className: '' }
                              : getCohortHeatmapStyle(w.totalLicencas, licencasHeatDomain);
                            return (
                              <td
                                key={w.weekIndex}
                                style={heat.style}
                                className={`py-2 px-1.5 text-center text-xs whitespace-nowrap transition-colors border-b border-border/40 ${heat.className}`}
                              >
                                {isNull ? '—' : w.totalLicencas.toLocaleString('pt-BR')}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Sem rodapé de média: para licenças (contagem absoluta) uma "média por
                      coluna" não tem leitura de negócio clara; a comparação relevante é a
                      evolução horizontal por safra. */}
                </table>
              </div>
            )}
          </div>

          {/* Comparação convertidos vs. resto da base */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-text-primary">
                Convertidos vs. resto da base
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Engajamento (% de licenças engajadas) nas últimas 12 semanas:{' '}
                {universe === 'convertidos'
                  ? 'parceiros convertidos em campanha'
                  : 'todos os parceiros que entraram em campanha'}{' '}
                vs. parceiros que nunca passaram por nenhuma campanha.
              </p>
            </div>
            {comparisonChart ? (
              <div className="h-72">
                <Line data={comparisonChart.data} options={comparisonChart.options as any} />
              </div>
            ) : (
              <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
                <p className="text-sm">Sem dados para exibir.</p>
              </div>
            )}
          </div>

          {/* Ranking por campanha */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-text-primary">Ranking por campanha</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Uma linha por campanha (respeitando os filtros), ordenada por licenças vendidas.
              </p>
            </div>
            {rankingData.length === 0 ? (
              <div className="p-8 text-center text-text-secondary bg-bg-secondary/20 rounded-lg">
                <p className="text-sm">Nenhuma campanha encontrada para os filtros selecionados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="border-b border-border bg-bg-secondary/30">
                      <th className="py-2.5 px-3 font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        Campanha
                      </th>
                      <th className="py-2.5 px-3 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        Convertidos
                      </th>
                      <th className="py-2.5 px-3 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        Licenças vendidas
                      </th>
                      <th className="py-2.5 px-3 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        Taxa de conversão
                      </th>
                      <th className="py-2.5 px-3 text-center font-bold text-text-secondary whitespace-nowrap border-b border-border">
                        Engaj. atual
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {rankingData.map((row, idx) => (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-bg-secondary/10'}>
                        <td className="py-2.5 px-3 font-semibold text-text-primary whitespace-nowrap border-b border-border/40">
                          <div className="flex items-center gap-2">
                            <span>{row.name}</span>
                            {row.encerrada && (
                              <span className="inline-flex items-center rounded-full bg-bg-secondary/40 px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                                Encerrada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center text-text-primary whitespace-nowrap border-b border-border/40">
                          {row.numConvertidos.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap border-b border-border/40">
                          {row.licencasVendidas.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-2.5 px-3 text-center text-text-primary whitespace-nowrap border-b border-border/40">
                          {fmtPct(row.taxaConversao)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-text-primary whitespace-nowrap border-b border-border/40">
                          {fmtPct(row.engajamentoMedio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CampanhasAnalytics;
