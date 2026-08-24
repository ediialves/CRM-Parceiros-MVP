import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Megaphone, Calendar, Users, AlertCircle, Loader2, User, HelpCircle, HardDrive, X, MessageSquare, Clock, Trash2, Filter, TrendingUp, CheckCircle2, XCircle, Award, ArrowRight, Bell, ArrowUp } from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { CampaignFunnel } from '../components/campaigns/CampaignFunnel';
import { SalesforceLinkButton } from '../components/ui/SalesforceLinkButton';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Line } from 'react-chartjs-2';
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  DragEndEvent,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

type StatusType = 'nao_abordado' | 'abordado' | 'reuniao_marcada' | 'proposta_apresentada' | 'converteu' | 'perdeu';

interface ColumnType {
  status: StatusType;
  label: string;
  colorClass: string;
  badgeClass: string;
}

const KANBAN_COLUMNS: ColumnType[] = [
  { status: 'nao_abordado', label: 'Não Abordado', colorClass: 'border-t-slate-400 bg-slate-50/10', badgeClass: 'bg-slate-100 text-slate-700' },
  { status: 'abordado', label: 'Abordado', colorClass: 'border-t-blue-400 bg-blue-50/10', badgeClass: 'bg-blue-100 text-blue-700' },
  { status: 'reuniao_marcada', label: 'Reunião Marcada', colorClass: 'border-t-amber-400 bg-amber-50/10', badgeClass: 'bg-amber-100 text-amber-700' },
  { status: 'proposta_apresentada', label: 'Proposta Apresentada', colorClass: 'border-t-indigo-400 bg-indigo-50/10', badgeClass: 'bg-indigo-100 text-indigo-700' },
  { status: 'converteu', label: 'Converteu', colorClass: 'border-t-emerald-400 bg-emerald-50/10', badgeClass: 'bg-emerald-100 text-emerald-700' },
  { status: 'perdeu', label: 'Perdeu', colorClass: 'border-t-rose-400 bg-rose-50/10', badgeClass: 'bg-rose-100 text-rose-700' },
];

interface PartnerData {
  id: string;
  nome: string;
  accountancy_id: string;
  salesforce_id?: string | null;
  licencas: number;
  licencas_engajadas: number;
  cnpjs_livres?: number | null;
  gerente?: string | null;
  segmento?: string | null;
  perfil_parceiro?: string | null;
}

interface UserData {
  id: string;
  nome: string;
}

interface CampaignPartnerData {
  id: string;
  status: StatusType;
  ultimo_registro_em: string | null;
  campaign_id: string;
  partner_id: string;
  gerente_id: string;
  partners: PartnerData | null;
  users?: UserData | null;
  entrou_nao_abordado_em?: string | null;
  entrou_abordado_em?: string | null;
  entrou_reuniao_marcada_em?: string | null;
  entrou_proposta_apresentada_em?: string | null;
  entrou_converteu_em?: string | null;
  entrou_perdeu_em?: string | null;
  licencas_convertidas?: number | null;
  motivo_perda?: string | null;
  motivo_perda_padrao?: string | null;
}

const MOTIVOS_PERDA_PADRAO = [
  'Sem resposta / sem contato',
  'Não compareceu à reunião',
  'Clientes sem fit',
  'Parceiro usa outro ERP para BPO / Optou por concorrente',
  'Clientes não querem trocar ERP atual',
  'Achou caro / sem orçamento no momento',
  'Não é prioridade no momento',
  'Pausou projeto com a CA',
  'Outro',
] as const;

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  encerrada_em: string | null;
}

interface TimelineComment {
  id: string;
  comentario: string;
  criado_em: string;
  gerente_id: string;
  users?: {
    nome: string;
  } | null;
}

interface CampaignPartnerSnapshot {
  partner_id: string;
  imported_at: string;
  licencas: number;
  licencas_engajadas: number;
}

// Helper date formatter: dd/mm/yyyy HH:mm
const formatDateTime = (dateString: string | null) => {
  if (!dateString) return 'Sem registros';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Sem registros';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return 'Sem registros';
  }
};

interface DroppableColumnProps {
  column: ColumnType;
  list: CampaignPartnerData[];
  children: React.ReactNode;
}

const DroppableColumn: React.FC<DroppableColumnProps> = ({
  column,
  list,
  children
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.status,
  });

  return (
    <div
      ref={setNodeRef}
      id={`kanban-column-${column.status}`}
      className={`w-[320px] shrink-0 flex flex-col rounded-xl border border-border border-t-4 ${column.colorClass} shadow-xs transition-all ${
        isOver ? 'ring-2 ring-primary/50 bg-primary/[0.02] border-primary/40' : ''
      }`}
    >
      {/* Column Name Header sticky */}
      <div className="p-4 border-b border-border bg-white flex items-center justify-between rounded-t-lg shrink-0">
        <span className="text-sm font-bold text-text-primary truncate">
          {column.label}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold leading-none ${column.badgeClass}`}>
          {list.length}
        </span>
      </div>

      {/* Column Cards scroll list container */}
      <div className={`flex-1 overflow-y-auto p-3 space-y-3 max-h-[calc(100vh-16rem)] transition-colors ${
        isOver ? 'bg-primary/[0.03]' : ''
      }`}>
        {children}
      </div>
    </div>
  );
}

interface DraggableCardProps {
  item: CampaignPartnerData;
  onOpenTimeline: (card: CampaignPartnerData) => void;
  onDelete: (card: CampaignPartnerData) => void;
}

const DraggableCard: React.FC<DraggableCardProps> = ({
  item,
  onOpenTimeline,
  onDelete
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 50,
  } : undefined;

  const resolvedPartner = item.partners;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Clicks will open the dialog perfectly
        onOpenTimeline(item);
      }}
      className={`relative bg-white p-4 rounded-xl border border-border shadow-xs hover:shadow-md hover:border-primary/20 transition-all flex flex-col gap-2 group duration-200 cursor-grab active:cursor-grabbing select-none ${
        isDragging ? 'opacity-40 border-primary bg-primary/[0.02] shadow-lg scale-95 z-50 pointer-events-none' : ''
      }`}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(item);
        }}
        className="absolute top-3.5 right-3.5 p-1 rounded-md text-text-secondary hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-10"
        title="Remover parceiro"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="min-w-0 pr-6">
        <h4 className="font-bold text-sm text-text-primary leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {resolvedPartner?.nome || 'Parceiro desconhecido'}
        </h4>
      </div>

      <div className="flex flex-col gap-1 mt-1 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 w-fit px-1.5 py-0.5 rounded border border-border/40">
            ID: {resolvedPartner?.accountancy_id || 'N/A'}
          </span>
          <span className="text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 w-fit px-1.5 py-0.5 rounded border border-indigo-200/60 dark:border-indigo-800/60">
            {resolvedPartner?.segmento?.trim() || 'Sem segmento'}
          </span>
          <span className="text-[11px] font-medium bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 w-fit px-1.5 py-0.5 rounded border border-violet-200/60 dark:border-violet-800/60">
            {resolvedPartner?.perfil_parceiro?.trim() || 'Sem perfil'}
          </span>
          <SalesforceLinkButton salesforceId={resolvedPartner?.salesforce_id} />
        </div>

        <div className="flex items-center gap-1.5 mt-1">
          <User className="w-3.5 h-3.5 text-text-secondary/70 shrink-0" />
          <span className="truncate">
            Gerente: <span className="font-semibold text-text-primary">{resolvedPartner?.gerente || 'Sem gerente'}</span>
          </span>
        </div>

        <div className="flex items-center justify-between mt-1 text-[11px] bg-surface p-1.5 rounded-lg border border-border/40">
          <span className="text-text-secondary/80">CNPJs Livres:</span>
          <span className="font-bold text-primary">{resolvedPartner?.cnpjs_livres ?? 0}</span>
        </div>
      </div>

      <div className="pt-2 border-t border-border/50 text-[10px] text-text-secondary/70 flex items-center gap-1">
        <Calendar className="w-3 h-3 shrink-0" />
        <span>Último: {formatDateTime(item.ultimo_registro_em)}</span>
      </div>
    </div>
  );
}

export function CampanhaKanban() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [partnersData, setPartnersData] = useState<CampaignPartnerData[]>([]);
  const [snapshotsData, setSnapshotsData] = useState<CampaignPartnerSnapshot[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for Timeline Modal
  const [selectedCardForTimeline, setSelectedCardForTimeline] = useState<CampaignPartnerData | null>(null);
  const [timelineComments, setTimelineComments] = useState<TimelineComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  // State for status movement flow/modals
  const [partnerToMove, setPartnerToMove] = useState<CampaignPartnerData | null>(null);
  const [pendingStatus, setPendingStatus] = useState<StatusType | null>(null);
  const [licencasConvertidas, setLicencasConvertidas] = useState<number>(1);
  const [isConverteuModalOpen, setIsConverteuModalOpen] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState('');
  const [motivoPerdaPadrao, setMotivoPerdaPadrao] = useState('');
  const [isPerdeuModalOpen, setIsPerdeuModalOpen] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  // State for card deletion
  const [partnerToDelete, setPartnerToDelete] = useState<CampaignPartnerData | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // State for Admin Manager Filter
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [tempSelected, setTempSelected] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // State for Partner Profile Filter
  const [selectedPerfis, setSelectedPerfis] = useState<string[]>([]);
  const [tempSelectedPerfis, setTempSelectedPerfis] = useState<string[]>([]);
  const [perfilDropdownOpen, setPerfilDropdownOpen] = useState(false);

  // State for Fase 3 (Saúde da Operação - Threshold de dias parados)
  const [thresholdDiasParado, setThresholdDiasParado] = useState<number>(7);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const destStatus = over.id as StatusType;

    const card = partnersData.find(p => p.id === cardId);
    if (!card) return;

    if (card.status === destStatus) return;

    if (destStatus === 'converteu') {
      setPartnerToMove(card);
      setPendingStatus('converteu');
      setLicencasConvertidas(1);
      setIsConverteuModalOpen(true);
      setMovementError(null);
    } else if (destStatus === 'perdeu') {
      setPartnerToMove(card);
      setPendingStatus('perdeu');
      setMotivoPerda('');
      setMotivoPerdaPadrao('');
      setIsPerdeuModalOpen(true);
      setMovementError(null);
    } else {
      executeMove(card, destStatus);
    }
  };

  const fetchData = async () => {
    if (!campaignId) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Campaign details
      const { data: campaignRes, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .maybeSingle();

      if (campaignError) {
        throw campaignError;
      }

      if (!campaignRes) {
        setError('Campanha não encontrada.');
        setLoading(false);
        return;
      }

      setCampaign(campaignRes as Campaign);

      // 2. Fetch Campaign Partners with JOIN parameters on partners table (using partners.gerente instead of users table)
      const { data: partnersRes, error: partnersError } = await supabase
        .from('campaign_partners')
        .select(`
          id,
          status,
          ultimo_registro_em,
          campaign_id,
          partner_id,
          gerente_id,
          entrou_nao_abordado_em,
          entrou_abordado_em,
          entrou_reuniao_marcada_em,
          entrou_proposta_apresentada_em,
          entrou_converteu_em,
          entrou_perdeu_em,
          licencas_convertidas,
          motivo_perda,
          motivo_perda_padrao,
          partners (
            id,
            nome,
            accountancy_id,
            salesforce_id,
            licencas,
            licencas_engajadas,
            cnpjs_livres,
            gerente,
            segmento,
            perfil_parceiro
          )
        `)
        .eq('campaign_id', campaignId);

      if (partnersError) {
        throw partnersError;
      }

      if (partnersRes) {
        setPartnersData(partnersRes as unknown as CampaignPartnerData[]);

        // 3. Fetch partner_snapshots for all partner_ids in this campaign
        const partnerIds = (partnersRes as any[])
          .map((p: any) => p.partner_id)
          .filter((id: string | null | undefined): id is string => Boolean(id));

        if (partnerIds.length > 0) {
          try {
            setLoadingSnapshots(true);
            let allSnaps: CampaignPartnerSnapshot[] = [];
            const chunkSize = 200;
            for (let i = 0; i < partnerIds.length; i += chunkSize) {
              const chunk = partnerIds.slice(i, i + chunkSize);
              const { data: snaps, error: snapsErr } = await supabase
                .from('partner_snapshots')
                .select('partner_id, imported_at, licencas, licencas_engajadas')
                .in('partner_id', chunk);

              if (!snapsErr && snaps) {
                allSnaps = [...allSnaps, ...(snaps as CampaignPartnerSnapshot[])];
              }
            }
            setSnapshotsData(allSnaps);
          } catch (snapErr) {
            console.error('Erro ao buscar partner_snapshots:', snapErr);
          } finally {
            setLoadingSnapshots(false);
          }
        } else {
          setSnapshotsData([]);
          setLoadingSnapshots(false);
        }
      }

    } catch (err: any) {
      console.error('Erro ao buscar dados do Kanban:', err);
      setError(err.message || 'Erro ao carregar o quadro de Kanban. Por favor, tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchData();
  }, [campaignId, authLoading]);

  // Extract unique manager names from cards in memory
  const uniqueManagers = Array.from(
    new Set(
      partnersData
        .map(p => p.partners?.gerente)
        .filter((g): g is string => !!g)
    )
  ).sort();

  // Extract unique partner profiles from cards in memory
  const uniquePerfis = Array.from(
    new Set<string>(
      partnersData
        .map(p => p.partners?.perfil_parceiro?.trim() || 'Sem perfil')
    )
  ).sort((a, b) => {
    if (a === 'Sem perfil') return 1;
    if (b === 'Sem perfil') return -1;
    return a.localeCompare(b);
  });

  // Group partners by status column
  const getPartnersByStatus = (status: StatusType) => {
    const isAdmin = user?.role === 'admin';
    let filtered = partnersData;
    if (isAdmin && selectedManagers.length > 0) {
      filtered = filtered.filter(p => p.partners?.gerente && selectedManagers.includes(p.partners.gerente));
    }
    if (selectedPerfis.length > 0) {
      filtered = filtered.filter(p => {
        const perfil = p.partners?.perfil_parceiro?.trim();
        return selectedPerfis.some(sel => {
          if (sel === 'Sem perfil') {
            return !perfil || perfil === 'Sem perfil';
          }
          return perfil === sel;
        });
      });
    }
    return filtered.filter(p => p.status === status);
  };

  const getFilteredTotal = () => {
    const isAdmin = user?.role === 'admin';
    let filtered = partnersData;
    if (isAdmin && selectedManagers.length > 0) {
      filtered = filtered.filter(p => p.partners?.gerente && selectedManagers.includes(p.partners.gerente));
    }
    if (selectedPerfis.length > 0) {
      filtered = filtered.filter(p => {
        const perfil = p.partners?.perfil_parceiro?.trim();
        return selectedPerfis.some(sel => {
          if (sel === 'Sem perfil') {
            return !perfil || perfil === 'Sem perfil';
          }
          return perfil === sel;
        });
      });
    }
    return filtered.length;
  };

  // Base list of partners considering manager and perfil filters (same scope as Kanban view)
  const dashboardPartners = React.useMemo(() => {
    const isAdmin = user?.role === 'admin';
    let filtered = partnersData;
    if (isAdmin && selectedManagers.length > 0) {
      filtered = filtered.filter(p => p.partners?.gerente && selectedManagers.includes(p.partners.gerente));
    }
    if (selectedPerfis.length > 0) {
      filtered = filtered.filter(p => {
        const perfil = p.partners?.perfil_parceiro?.trim();
        return selectedPerfis.some(sel => {
          if (sel === 'Sem perfil') {
            return !perfil || perfil === 'Sem perfil';
          }
          return perfil === sel;
        });
      });
    }
    return filtered;
  }, [partnersData, selectedManagers, selectedPerfis, user]);

  // 4.2 — 4 KPIs calculation
  const dashboardKpis = React.useMemo(() => {
    const totalCampanha = dashboardPartners.length;
    const convertidosList = dashboardPartners.filter(p => p.status === 'converteu');
    const totalConvertidos = convertidosList.length;
    const totalLicencasConvertidas = convertidosList.reduce((acc, p) => acc + (p.licencas_convertidas || 0), 0);
    const taxaConversaoTotal = totalCampanha > 0 ? (totalConvertidos / totalCampanha) * 100 : 0;

    const perdidosList = dashboardPartners.filter(p => p.status === 'perdeu');
    const totalPerdidos = perdidosList.length;
    const totalAbordados = dashboardPartners.filter(p => !!p.entrou_abordado_em).length;
    const pctPerdidosSobreAbordados = totalAbordados > 0 ? (totalPerdidos / totalAbordados) * 100 : 0;

    return {
      totalLicencasConvertidas,
      taxaConversaoTotal,
      totalConvertidos,
      totalPerdidos,
      totalAbordados,
      pctPerdidosSobreAbordados,
      totalCampanha
    };
  }, [dashboardPartners]);

  // 4.3 Bloco 1 — Motivos de perda (agrupados por motivo_perda_padrao)
  const motivosPerdaStats = React.useMemo(() => {
    const perdidos = dashboardPartners.filter(p => p.status === 'perdeu');
    const totalPerdidos = perdidos.length;
    if (totalPerdidos === 0) return [];

    const counts: Record<string, number> = {};
    perdidos.forEach(p => {
      const motivo = p.motivo_perda_padrao?.trim() || 'Não informado';
      counts[motivo] = (counts[motivo] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([motivo, count]) => ({
        motivo,
        count,
        percentual: (count / totalPerdidos) * 100
      }))
      .sort((a, b) => b.count - a.count);
  }, [dashboardPartners]);

  // 4.3 Bloco 2 — Tempo médio em cada fase
  const tempoMedioFases = React.useMemo(() => {
    const fases: Array<{ key: string; label: string; dateKey: keyof CampaignPartnerData; nextSeqKey: keyof CampaignPartnerData }> = [
      { key: 'nao_abordado', label: 'Não Abordado', dateKey: 'entrou_nao_abordado_em', nextSeqKey: 'entrou_abordado_em' },
      { key: 'abordado', label: 'Abordado', dateKey: 'entrou_abordado_em', nextSeqKey: 'entrou_reuniao_marcada_em' },
      { key: 'reuniao_marcada', label: 'Reunião Marcada', dateKey: 'entrou_reuniao_marcada_em', nextSeqKey: 'entrou_proposta_apresentada_em' },
      { key: 'proposta_apresentada', label: 'Proposta Apresentada', dateKey: 'entrou_proposta_apresentada_em', nextSeqKey: 'entrou_converteu_em' },
    ];

    const results = fases.map(fase => {
      const durations: number[] = [];

      dashboardPartners.forEach(card => {
        const entrouFaseStr = card[fase.dateKey] as string | null | undefined;
        if (!entrouFaseStr) return;
        const dataEntrouFase = new Date(entrouFaseStr).getTime();
        if (isNaN(dataEntrouFase)) return;

        // Próximas datas candidatas
        const nextCandidates: number[] = [];
        const nextSeqStr = card[fase.nextSeqKey] as string | null | undefined;
        if (nextSeqStr) {
          const t = new Date(nextSeqStr).getTime();
          if (!isNaN(t) && t > dataEntrouFase) nextCandidates.push(t);
        }

        const perdeuStr = card.entrou_perdeu_em;
        if (perdeuStr) {
          const t = new Date(perdeuStr).getTime();
          if (!isNaN(t) && t > dataEntrouFase) nextCandidates.push(t);
        }

        if (nextCandidates.length > 0) {
          const proximaData = Math.min(...nextCandidates);
          const diffDays = (proximaData - dataEntrouFase) / (1000 * 60 * 60 * 24);
          if (diffDays >= 0) {
            durations.push(diffDays);
          }
        }
      });

      const count = durations.length;
      const mediaDias = count > 0 ? durations.reduce((a, b) => a + b, 0) / count : 0;

      return {
        key: fase.key,
        label: fase.label,
        mediaDias: Number(mediaDias.toFixed(1)),
        count
      };
    });

    // Identificar maior tempo médio para destacar gargalo (apenas se houver tempo > 0)
    const maxTempo = Math.max(...results.map(r => r.mediaDias));

    return {
      fases: results,
      maxTempo: maxTempo > 0 ? maxTempo : 0
    };
  }, [dashboardPartners]);

  // 4.3 Bloco 3 — Taxa de conversão entre fases consecutivas
  const conversaoFases = React.useMemo(() => {
    const transitions: Array<{ fromLabel: string; toLabel: string; fromKey: keyof CampaignPartnerData; toKey: keyof CampaignPartnerData }> = [
      { fromLabel: 'Não Abordado', toLabel: 'Abordado', fromKey: 'entrou_nao_abordado_em', toKey: 'entrou_abordado_em' },
      { fromLabel: 'Abordado', toLabel: 'Reunião Marcada', fromKey: 'entrou_abordado_em', toKey: 'entrou_reuniao_marcada_em' },
      { fromLabel: 'Reunião Marcada', toLabel: 'Proposta Apresentada', fromKey: 'entrou_reuniao_marcada_em', toKey: 'entrou_proposta_apresentada_em' },
      { fromLabel: 'Proposta Apresentada', toLabel: 'Converteu', fromKey: 'entrou_proposta_apresentada_em', toKey: 'entrou_converteu_em' },
    ];

    return transitions.map(t => {
      const fromCount = dashboardPartners.filter(p => !!p[t.fromKey]).length;
      const toCount = dashboardPartners.filter(p => !!p[t.toKey]).length;
      const taxa = fromCount > 0 ? (toCount / fromCount) * 100 : 0;

      return {
        fromLabel: t.fromLabel,
        toLabel: t.toLabel,
        fromCount,
        toCount,
        taxa: Number(taxa.toFixed(1))
      };
    });
  }, [dashboardPartners]);

  // 4.3 Bloco 4 — Comparativo entre gerentes
  const comparativoGerentes = React.useMemo(() => {
    const groups: Record<string, {
      gerenteNome: string;
      carteira: number;
      convertidos: number;
      licencas: number;
      perdidos: number;
    }> = {};

    dashboardPartners.forEach(card => {
      const gerenteNome = card.partners?.gerente?.trim() || 'Sem gerente';
      if (!groups[gerenteNome]) {
        groups[gerenteNome] = {
          gerenteNome,
          carteira: 0,
          convertidos: 0,
          licencas: 0,
          perdidos: 0
        };
      }
      groups[gerenteNome].carteira += 1;
      if (card.status === 'converteu') {
        groups[gerenteNome].convertidos += 1;
        groups[gerenteNome].licencas += card.licencas_convertidas || 0;
      }
      if (card.status === 'perdeu') {
        groups[gerenteNome].perdidos += 1;
      }
    });

    return Object.values(groups)
      .map(item => ({
        ...item,
        taxaConversao: item.carteira > 0 ? (item.convertidos / item.carteira) * 100 : 0
      }))
      .sort((a, b) => b.taxaConversao - a.taxaConversao || b.carteira - a.carteira);
  }, [dashboardPartners]);

  // Fase 2 — Avanço da campanha: Gráficos de barras empilhadas (não acumulado)
  const avancoCampanhaData = React.useMemo(() => {
    // 5 segmentos padronizados com cores consistentes
    const segments = [
      { key: 'abordado', label: 'Abordado', field: 'entrou_abordado_em', color: '#3b82f6', bgClass: 'bg-blue-500' },
      { key: 'reuniao_marcada', label: 'Reunião Marcada', field: 'entrou_reuniao_marcada_em', color: '#8b5cf6', bgClass: 'bg-purple-500' },
      { key: 'proposta_apresentada', label: 'Proposta Apresentada', field: 'entrou_proposta_apresentada_em', color: '#f59e0b', bgClass: 'bg-amber-500' },
      { key: 'converteu', label: 'Converteu', field: 'entrou_converteu_em', color: '#10b981', bgClass: 'bg-emerald-500' },
      { key: 'perdeu', label: 'Perdeu', field: 'entrou_perdeu_em', color: '#f43f5e', bgClass: 'bg-rose-500' },
    ] as const;

    const now = new Date();

    // 1. Diário: exatamente os últimos 8 dias corridos (do mais antigo ao mais recente)
    const dailyPeriods: Array<{
      key: string;
      label: string;
      fullDateLabel: string;
      start: Date;
      end: Date;
    }> = [];

    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const dayStr = String(start.getDate()).padStart(2, '0');
      const monthStr = String(start.getMonth() + 1).padStart(2, '0');

      dailyPeriods.push({
        key: `${start.getFullYear()}-${monthStr}-${dayStr}`,
        label: `${dayStr}/${monthStr}`,
        fullDateLabel: start.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
        start,
        end,
      });
    }

    const dailyData = dailyPeriods.map(p => {
      const counts: Record<string, number> = {
        abordado: 0,
        reuniao_marcada: 0,
        proposta_apresentada: 0,
        converteu: 0,
        perdeu: 0,
      };

      dashboardPartners.forEach(card => {
        segments.forEach(seg => {
          const dateStr = card[seg.field as keyof CampaignPartnerData] as string | null | undefined;
          if (dateStr) {
            const t = new Date(dateStr);
            if (!isNaN(t.getTime()) && t >= p.start && t <= p.end) {
              counts[seg.key] += 1;
            }
          }
        });
      });

      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      return {
        ...p,
        counts,
        total,
      };
    });

    // 2. Semanal: exatamente as últimas 8 semanas corridas (do mais antigo ao mais recente)
    const weeklyPeriods: Array<{
      key: string;
      label: string;
      fullDateLabel: string;
      start: Date;
      end: Date;
    }> = [];

    // Determinar início da semana atual (segunda-feira)
    const currentDay = now.getDay();
    const distanceToMonday = (currentDay + 6) % 7;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() - distanceToMonday);
    currentMonday.setHours(0, 0, 0, 0);

    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(currentMonday);
      wStart.setDate(currentMonday.getDate() - (i * 7));
      wStart.setHours(0, 0, 0, 0);

      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);

      const sDay = String(wStart.getDate()).padStart(2, '0');
      const sMonth = String(wStart.getMonth() + 1).padStart(2, '0');
      const eDay = String(wEnd.getDate()).padStart(2, '0');
      const eMonth = String(wEnd.getMonth() + 1).padStart(2, '0');

      weeklyPeriods.push({
        key: `sem-${i}`,
        label: i === 0 ? 'Atual' : `Sem -${i}`,
        fullDateLabel: `${sDay}/${sMonth} a ${eDay}/${eMonth}`,
        start: wStart,
        end: wEnd,
      });
    }

    const weeklyData = weeklyPeriods.map(p => {
      const counts: Record<string, number> = {
        abordado: 0,
        reuniao_marcada: 0,
        proposta_apresentada: 0,
        converteu: 0,
        perdeu: 0,
      };

      dashboardPartners.forEach(card => {
        segments.forEach(seg => {
          const dateStr = card[seg.field as keyof CampaignPartnerData] as string | null | undefined;
          if (dateStr) {
            const t = new Date(dateStr);
            if (!isNaN(t.getTime()) && t >= p.start && t <= p.end) {
              counts[seg.key] += 1;
            }
          }
        });
      });

      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      return {
        ...p,
        counts,
        total,
      };
    });

    const maxDaily = Math.max(...dailyData.map(d => d.total), 1);
    const maxWeekly = Math.max(...weeklyData.map(w => w.total), 1);

    return {
      segments,
      dailyData,
      weeklyData,
      maxDaily,
      maxWeekly,
    };
  }, [dashboardPartners]);

  // Fase 3 — Saúde da Operação: Cards Parados e Alerta
  const saudeOperacaoData = React.useMemo(() => {
    const agora = new Date().getTime();
    const activeStatuses: StatusType[] = ['nao_abordado', 'abordado', 'reuniao_marcada', 'proposta_apresentada'];

    // Label amigável do status
    const statusLabels: Record<StatusType, string> = {
      nao_abordado: 'Não Abordado',
      abordado: 'Abordado',
      reuniao_marcada: 'Reunião Marcada',
      proposta_apresentada: 'Proposta Apresentada',
      converteu: 'Converteu',
      perdeu: 'Perdeu',
    };

    // 1. Filtrar parceiros ativos da campanha
    const activePartners = dashboardPartners.filter(p => activeStatuses.includes(p.status));

    // 2. Mapear cálculo de dias parado para cada um
    const processedCards = activePartners.map(p => {
      const dataRefStr = p.ultimo_registro_em ?? p.entrou_nao_abordado_em;
      let diasParado = 0;

      if (dataRefStr) {
        const t = new Date(dataRefStr).getTime();
        if (!isNaN(t)) {
          const diffMs = agora - t;
          diasParado = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        }
      }

      return {
        id: p.id,
        parceiroNome: p.partners?.nome || 'Parceiro desconhecido',
        segmento: p.partners?.segmento,
        gerenteNome: p.partners?.gerente?.trim() || 'Sem gerente',
        status: p.status,
        statusLabel: statusLabels[p.status] || p.status,
        ultimoRegistroEm: p.ultimo_registro_em,
        diasParado,
        originalItem: p,
      };
    });

    // 3. Ordenar por dias_parado decrescente
    const sortedCards = [...processedCards].sort((a, b) => b.diasParado - a.diasParado);

    // 4. Filtrar pelos thresholds
    const filteredByActiveThreshold = sortedCards.filter(c => c.diasParado > thresholdDiasParado);
    const countParadosPadrao7 = sortedCards.filter(c => c.diasParado > 7).length;

    return {
      allActiveCount: activePartners.length,
      sortedCards,
      filteredCards: filteredByActiveThreshold,
      totalFiltrados: filteredByActiveThreshold.length,
      countParadosPadrao7,
    };
  }, [dashboardPartners, thresholdDiasParado]);

  // Gráficos de Evolução Histórica (Total de Licenças & Licenças Engajadas)
  const activeCampaignPartnerIds = React.useMemo(() => {
    return new Set(dashboardPartners.map(p => p.partner_id).filter(Boolean));
  }, [dashboardPartners]);

  const historicalLicensesStats = React.useMemo(() => {
    if (snapshotsData.length === 0 || activeCampaignPartnerIds.size === 0) {
      return { dates: [], labels: [], fullDateLabels: [], totalLicencas: [], totalEngajadas: [] };
    }

    // Filtrar snapshots pertencentes aos parceiros ativos no filtro do dashboard
    const filteredSnapshots = snapshotsData.filter(s => activeCampaignPartnerIds.has(s.partner_id));

    if (filteredSnapshots.length === 0) {
      return { dates: [], labels: [], fullDateLabels: [], totalLicencas: [], totalEngajadas: [] };
    }

    // Agrupar por imported_at::date (YYYY-MM-DD), mantendo o snapshot mais recente por parceiro por data
    const dateMap = new Map<string, Map<string, { licencas: number; licencas_engajadas: number }>>();

    filteredSnapshots.forEach(s => {
      if (!s.imported_at) return;
      const dateKey = typeof s.imported_at === 'string' ? s.imported_at.split('T')[0] : String(s.imported_at).substring(0, 10);
      if (!dateKey || dateKey.length < 10) return;

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, new Map());
      }
      const partnerMap = dateMap.get(dateKey)!;
      partnerMap.set(s.partner_id, {
        licencas: Number(s.licencas) || 0,
        licencas_engajadas: Number(s.licencas_engajadas) || 0
      });
    });

    // Filtrar estritamente a partir de 30/07 (considerando data no formato YYYY-MM-DD)
    const allDates = Array.from(dateMap.keys()).sort((a, b) => a.localeCompare(b));
    const datesFromJuly30 = allDates.filter(d => {
      const parts = d.split('-');
      if (parts.length === 3) {
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        // Apenas a partir de 30 de julho (mês 7 e dia >= 30, ou meses >= 8)
        if (month === 7) return day >= 30;
        if (month > 7) return true;
        return false;
      }
      return d >= '2024-07-30';
    });

    // Pegar as últimas 8 importações dessa seleção
    const sortedDates = (datesFromJuly30.length > 0 ? datesFromJuly30 : allDates).slice(-8);

    const labels = sortedDates.map(d => {
      const parts = d.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}`;
      }
      return d;
    });

    const fullDateLabels = sortedDates.map(d => {
      const parts = d.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return d;
    });

    const totalLicencas = sortedDates.map(d => {
      const partnerMap = dateMap.get(d)!;
      let sum = 0;
      partnerMap.forEach(item => {
        sum += item.licencas;
      });
      return sum;
    });

    const totalEngajadas = sortedDates.map(d => {
      const partnerMap = dateMap.get(d)!;
      let sum = 0;
      partnerMap.forEach(item => {
        sum += item.licencas_engajadas;
      });
      return sum;
    });

    return {
      dates: sortedDates,
      labels,
      fullDateLabels,
      totalLicencas,
      totalEngajadas
    };
  }, [snapshotsData, activeCampaignPartnerIds]);

  const chartTotalLicencasData = React.useMemo(() => {
    return {
      labels: historicalLicensesStats.labels,
      datasets: [
        {
          label: 'Total de Licenças',
          data: historicalLicensesStats.totalLicencas,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          fill: true,
          tension: 0, // Linhas retas e precisas sem curvatura que distorça os pontos
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#4f46e5',
          pointBorderWidth: 2,
        }
      ]
    };
  }, [historicalLicensesStats]);

  const chartEngajadasData = React.useMemo(() => {
    return {
      labels: historicalLicensesStats.labels,
      datasets: [
        {
          label: 'Licenças Engajadas',
          data: historicalLicensesStats.totalEngajadas,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.08)',
          fill: true,
          tension: 0, // Linhas retas e precisas sem curvatura que distorça os pontos
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#059669',
          pointBorderWidth: 2,
        }
      ]
    };
  }, [historicalLicensesStats]);

  const chartTotalLicencasOptions = React.useMemo(() => {
    const data = historicalLicensesStats.totalLicencas;
    const minVal = data.length > 0 ? Math.min(...data) : 0;
    const maxVal = data.length > 0 ? Math.max(...data) : 0;
    const range = maxVal - minVal;
    const padding = range === 0 ? Math.max(1, Math.round(maxVal * 0.1)) : Math.round(range * 0.15);
    const dynamicMin = Math.max(0, minVal - padding);
    const dynamicMax = maxVal + padding;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 12,
          left: 6,
          bottom: 4
        }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          align: 'top' as const,
          anchor: 'center' as const,
          offset: 4,
          color: '#4338ca',
          font: {
            size: 10,
            weight: 'bold' as const,
            family: 'Inter, sans-serif'
          },
          formatter: (value: any) => {
            return Number(value).toLocaleString('pt-BR');
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#f1f5f9',
          padding: 10,
          cornerRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          callbacks: {
            title: (items: any) => {
              const idx = items[0]?.dataIndex;
              return idx !== undefined && historicalLicensesStats.fullDateLabels[idx]
                ? `Importação: ${historicalLicensesStats.fullDateLabels[idx]}`
                : items[0]?.label || '';
            },
            label: (item: any) => `• Total: ${Number(item.raw).toLocaleString('pt-BR')} licenças`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11, family: 'Inter, sans-serif' }
          }
        },
        y: {
          min: dynamicMin,
          max: dynamicMax,
          grid: {
            color: '#f1f5f9',
            drawTicks: false
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 11, family: 'Inter, sans-serif' },
            precision: 0,
            callback: (value: any) => Number(value).toLocaleString('pt-BR')
          }
        }
      }
    };
  }, [historicalLicensesStats]);

  const chartEngajadasOptions = React.useMemo(() => {
    const data = historicalLicensesStats.totalEngajadas;
    const minVal = data.length > 0 ? Math.min(...data) : 0;
    const maxVal = data.length > 0 ? Math.max(...data) : 0;
    const range = maxVal - minVal;
    const padding = range === 0 ? Math.max(1, Math.round(maxVal * 0.1)) : Math.round(range * 0.15);
    const dynamicMin = Math.max(0, minVal - padding);
    const dynamicMax = maxVal + padding;

    return {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 20,
          right: 12,
          left: 6,
          bottom: 4
        }
      },
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          align: 'top' as const,
          anchor: 'center' as const,
          offset: 4,
          color: '#047857',
          font: {
            size: 10,
            weight: 'bold' as const,
            family: 'Inter, sans-serif'
          },
          formatter: (value: any) => {
            return Number(value).toLocaleString('pt-BR');
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#f1f5f9',
          padding: 10,
          cornerRadius: 8,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          callbacks: {
            title: (items: any) => {
              const idx = items[0]?.dataIndex;
              return idx !== undefined && historicalLicensesStats.fullDateLabels[idx]
                ? `Importação: ${historicalLicensesStats.fullDateLabels[idx]}`
                : items[0]?.label || '';
            },
            label: (item: any) => `• Engajadas: ${Number(item.raw).toLocaleString('pt-BR')} licenças`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#94a3b8',
            font: { size: 11, family: 'Inter, sans-serif' }
          }
        },
        y: {
          min: dynamicMin,
          max: dynamicMax,
          grid: {
            color: '#f1f5f9',
            drawTicks: false
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 11, family: 'Inter, sans-serif' },
            precision: 0,
            callback: (value: any) => Number(value).toLocaleString('pt-BR')
          }
        }
      }
    };
  }, [historicalLicensesStats]);

  const fetchComments = async (partnerId: string) => {
    try {
      setLoadingComments(true);
      setCommentError(null);
      
      const { data, error: timelineError } = await supabase
        .from('campaign_timeline')
        .select(`
          id,
          comentario,
          criado_em,
          gerente_id,
          users (
            nome
          )
        `)
        .eq('campaign_partner_id', partnerId)
        .order('criado_em', { ascending: false });

      if (timelineError) {
        throw timelineError;
      }

      setTimelineComments((data as unknown as TimelineComment[]) || []);
    } catch (err: any) {
      console.error('Erro ao buscar timeline:', err);
      setCommentError(err.message || 'Erro ao carregar a linha do tempo.');
    } finally {
      setLoadingComments(false);
    }
  };

  const handleOpenTimeline = (card: CampaignPartnerData) => {
    setSelectedCardForTimeline(card);
    setNewCommentText('');
    setCommentError(null);
    fetchComments(card.id);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCardForTimeline || !user) return;
    if (!newCommentText.trim()) return;

    try {
      setIsSavingComment(true);
      setCommentError(null);

      const nowString = new Date().toISOString();

      const { error: insertError } = await supabase
        .from('campaign_timeline')
        .insert({
          campaign_partner_id: selectedCardForTimeline.id,
          gerente_id: user.id,
          comentario: newCommentText.trim(),
          criado_em: nowString
        });

      if (insertError) {
        throw insertError;
      }

      const { error: updateError } = await supabase
        .from('campaign_partners')
        .update({
          ultimo_registro_em: nowString
        })
        .eq('id', selectedCardForTimeline.id);

      if (updateError) {
        throw updateError;
      }

      await fetchComments(selectedCardForTimeline.id);

      setPartnersData(prev => prev.map(p => {
        if (p.id === selectedCardForTimeline.id) {
          return {
            ...p,
            ultimo_registro_em: nowString
          };
        }
        return p;
      }));

      setSelectedCardForTimeline(prev => {
        if (!prev) return null;
        return {
          ...prev,
          ultimo_registro_em: nowString
        };
      });

      setNewCommentText('');
    } catch (err: any) {
      console.error('Erro ao adicionar comentário:', err);
      setCommentError(err.message || 'Erro ao registrar o comentário.');
    } finally {
      setIsSavingComment(false);
    }
  };

  const executeMove = async (
    card: CampaignPartnerData,
    destStatus: StatusType,
    extraData?: { licencas_convertidas?: number; motivo_perda?: string; motivo_perda_padrao?: string }
  ) => {
    try {
      setIsMoving(true);
      setMovementError(null);

      const nowString = new Date().toISOString();

      // Ordem fixa das fases para cálculo de datas anteriores:
      // nao_abordado → abordado → reuniao_marcada → proposta_apresentada → converteu
      const phasesOrder: StatusType[] = [
        'nao_abordado',
        'abordado',
        'reuniao_marcada',
        'proposta_apresentada',
        'converteu'
      ];

      // Passo 3 — Montar objeto de atualização:
      const updateData: any = {
        status: destStatus,
        [`entrou_${destStatus}_em`]: nowString
      };

      // Se destStatus é uma das fases progressivas, vamos preencher as fases anteriores nulas.
      const destIndex = phasesOrder.indexOf(destStatus);
      if (destIndex !== -1) {
        for (let i = 0; i < destIndex; i++) {
          const phase = phasesOrder[i];
          const currentVal = card[`entrou_${phase}_em` as keyof CampaignPartnerData];
          if (currentVal === null || currentVal === undefined) {
            updateData[`entrou_${phase}_em`] = nowString;
          }
        }
      }

      // Se converteu: incluir licencas_convertidas
      if (destStatus === 'converteu' && extraData?.licencas_convertidas !== undefined) {
        updateData.licencas_convertidas = extraData.licencas_convertidas;
      }

      // Se perdeu: incluir motivo_perda e motivo_perda_padrao
      if (destStatus === 'perdeu') {
        if (extraData?.motivo_perda !== undefined) {
          updateData.motivo_perda = extraData.motivo_perda;
        }
        if (extraData?.motivo_perda_padrao !== undefined) {
          updateData.motivo_perda_padrao = extraData.motivo_perda_padrao;
        }
      }

      // Passo 4 — Executar UPDATE
      const { error: updateError } = await supabase
        .from('campaign_partners')
        .update(updateData)
        .eq('id', card.id);

      if (updateError) {
        throw updateError;
      }

      // Se perdeu: registrar automaticamente o motivo na timeline
      if (destStatus === 'perdeu' && extraData?.motivo_perda) {
        const { error: timelineError } = await supabase
          .from('campaign_timeline')
          .insert({
            campaign_partner_id: card.id,
            gerente_id: user?.id,
            comentario: `Motivo de perda: ${extraData.motivo_perda.trim()}`,
            criado_em: nowString
          });

        if (timelineError) {
          console.error('Erro ao registrar motivo de perda na timeline:', timelineError);
          throw timelineError;
        }

        // Se o card estiver atualmente aberto na timeline, recarregar os comentários
        if (selectedCardForTimeline && selectedCardForTimeline.id === card.id) {
          await fetchComments(card.id);
        }
      }

      // Passo 5 — Após UPDATE bem-sucedido: atualizar estado local movendo o card sem recarregar
      setPartnersData(prev => prev.map(p => {
        if (p.id === card.id) {
          return {
            ...p,
            ...updateData,
            status: destStatus
          };
        }
        return p;
      }));

      // If this card is currently open in the Timeline Modal, update it as well!
      if (selectedCardForTimeline && selectedCardForTimeline.id === card.id) {
        setSelectedCardForTimeline(prev => {
          if (!prev) return null;
          return {
            ...prev,
            ...updateData,
            status: destStatus
          };
        });
      }

      // Close modals
      setIsConverteuModalOpen(false);
      setIsPerdeuModalOpen(false);
      setPartnerToMove(null);
      setPendingStatus(null);
    } catch (err: any) {
      console.error('Erro ao mover card:', err);
      setMovementError(err.message || 'Erro ao atualizar o status do parceiro.');
    } finally {
      setIsMoving(false);
    }
  };

  const executeDelete = async (card: CampaignPartnerData) => {
    try {
      setIsDeleting(true);
      setDeleteError(null);

      // 1. DELETE em campaign_timeline WHERE campaign_partner_id = card.id
      const { error: timelineDeleteError } = await supabase
        .from('campaign_timeline')
        .delete()
        .eq('campaign_partner_id', card.id);

      if (timelineDeleteError) {
        throw timelineDeleteError;
      }

      // 2. DELETE em campaign_partners WHERE id = card.id
      const { error: partnerDeleteError } = await supabase
        .from('campaign_partners')
        .delete()
        .eq('id', card.id);

      if (partnerDeleteError) {
        throw partnerDeleteError;
      }

      // 3. Após ambos os deletes bem-sucedidos: remover card do estado local sem reload
      setPartnersData(prev => prev.filter(p => p.id !== card.id));

      // Close modal
      setIsDeleteModalOpen(false);
      setPartnerToDelete(null);
    } catch (err: any) {
      console.error('Erro ao deletar parceiro da campanha:', err);
      setDeleteError(err.message || 'Erro ao remover parceiro da campanha.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-6 min-h-[calc(100vh-4rem)] flex flex-col gap-6">
      {/* Upper header action section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/campanhas')}
            className="p-2 bg-surface hover:bg-surface/80 border border-border text-text-secondary hover:text-text-primary rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold text-text-primary">
                {loading ? 'Carregando Campanha...' : campaign?.name}
              </h1>
              {!loading && campaign && (
                <Badge variant={!campaign.encerrada_em ? 'success' : 'danger'}>
                  {!campaign.encerrada_em ? 'Ativa' : 'Encerrada'}
                </Badge>
              )}
            </div>
            {campaign?.description && (
              <p className="text-sm text-text-secondary mt-1">{campaign.description}</p>
            )}
          </div>
        </div>

        {!loading && (
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <div className="relative inline-block" id="manager-filter-dropdown">
                <button
                  type="button"
                  onClick={() => setDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-gray-50 border border-border rounded-lg text-xs font-semibold text-text-primary shadow-xs hover:shadow-sm transition-all cursor-pointer h-8"
                >
                  <Filter size={14} className="text-text-secondary" />
                  <span>
                    {selectedManagers.length === 0
                      ? 'Todos os gerentes'
                      : selectedManagers.length === 1
                        ? selectedManagers[0]
                        : `${selectedManagers.length} gerentes`}
                  </span>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-surface rounded-xl border border-border shadow-lg z-50 overflow-hidden divide-y divide-border">
                    <div className="p-2">
                      <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-xs font-medium text-text-primary select-none w-full">
                        <input
                          type="checkbox"
                          checked={tempSelected.length === 0}
                          onChange={() => setTempSelected([])}
                          className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        />
                        <span>Todos os gerentes</span>
                      </label>
                    </div>
                    <div className="p-2 max-h-60 overflow-y-auto">
                      {uniqueManagers.length === 0 ? (
                        <p className="text-xs text-text-secondary p-2 text-center">Nenhum gerente encontrado</p>
                      ) : (
                        uniqueManagers.map(mgr => {
                          const isChecked = tempSelected.includes(mgr);
                          return (
                            <label
                              key={mgr}
                              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-xs text-text-primary select-none w-full"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setTempSelected(prev => prev.filter(name => name !== mgr));
                                  } else {
                                    setTempSelected(prev => [...prev, mgr]);
                                  }
                                }}
                                className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                              />
                              <span className="truncate">{mgr}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <div className="p-3 bg-gray-50 flex items-center justify-end gap-2 border-t border-border">
                      <button
                        type="button"
                        onClick={() => {
                          setTempSelected([]);
                          setSelectedManagers([]);
                          setDropdownOpen(false);
                        }}
                        className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 hover:text-gray-700 transition-colors cursor-pointer bg-transparent rounded-lg hover:bg-gray-100"
                      >
                        Limpar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedManagers(tempSelected);
                          setDropdownOpen(false);
                        }}
                        className="px-4 py-1.5 text-[10px] font-semibold text-white bg-primary hover:bg-primary/95 rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer flex items-center justify-center"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Perfil do Parceiro Filter */}
            <div className="relative inline-block" id="perfil-filter-dropdown">
              <button
                type="button"
                onClick={() => setPerfilDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-gray-50 border border-border rounded-lg text-xs font-semibold text-text-primary shadow-xs hover:shadow-sm transition-all cursor-pointer h-8"
              >
                <Filter size={14} className="text-text-secondary" />
                <span>
                  {selectedPerfis.length === 0
                    ? 'Todos os perfis'
                    : selectedPerfis.length === 1
                      ? selectedPerfis[0]
                      : `${selectedPerfis.length} perfis`}
                </span>
              </button>

              {perfilDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-surface rounded-xl border border-border shadow-lg z-50 overflow-hidden divide-y divide-border">
                  <div className="p-2">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-xs font-medium text-text-primary select-none w-full">
                      <input
                        type="checkbox"
                        checked={tempSelectedPerfis.length === 0}
                        onChange={() => setTempSelectedPerfis([])}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                      <span>Todos os perfis</span>
                    </label>
                  </div>
                  <div className="p-2 max-h-60 overflow-y-auto">
                    {uniquePerfis.length === 0 ? (
                      <p className="text-xs text-text-secondary p-2 text-center">Nenhum perfil encontrado</p>
                    ) : (
                      uniquePerfis.map(perf => {
                        const isChecked = tempSelectedPerfis.includes(perf);
                        return (
                          <label
                            key={perf}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-xs text-text-primary select-none w-full"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setTempSelectedPerfis(prev => prev.filter(p => p !== perf));
                                } else {
                                  setTempSelectedPerfis(prev => [...prev, perf]);
                                }
                              }}
                              className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                            />
                            <span className="truncate">{perf}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div className="p-3 bg-gray-50 flex items-center justify-end gap-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setTempSelectedPerfis([]);
                        setSelectedPerfis([]);
                        setPerfilDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 hover:text-gray-700 transition-colors cursor-pointer bg-transparent rounded-lg hover:bg-gray-100"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPerfis(tempSelectedPerfis);
                        setPerfilDropdownOpen(false);
                      }}
                      className="px-4 py-1.5 text-[10px] font-semibold text-white bg-primary hover:bg-primary/95 rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer flex items-center justify-center"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-semibold text-text-secondary h-8">
              <Users className="w-4 h-4 text-primary" />
              Total: <span className="text-text-primary font-bold">{getFilteredTotal()}</span> parceiros
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-surface rounded-xl border border-border shadow-sm">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
          <p className="text-sm text-text-secondary">Montando quadro de Kanban...</p>
        </div>
      ) : error ? (
        <div className="p-5 bg-danger/5 border border-danger/20 rounded-xl text-danger flex items-start gap-3 shrink-0">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Erro ao carregar os dados</h3>
            <p className="text-xs mt-1 text-danger/80">{error}</p>
            <button
              onClick={fetchData}
              className="mt-2 text-xs font-bold underline hover:text-danger/90 block text-left"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <>
          <CampaignFunnel
            partnersData={partnersData}
            selectedManagers={selectedManagers}
            selectedPerfis={selectedPerfis}
            isAdmin={user?.role === 'admin'}
          />

          {/* Kanban Board Grid scroll container */}
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div id="kanban-board-container" className="flex-1 overflow-x-auto overflow-y-hidden pb-4 flex gap-4 items-stretch select-none">
              {KANBAN_COLUMNS.map((column) => {
                const list = getPartnersByStatus(column.status);

                return (
                  <DroppableColumn key={column.status} column={column} list={list}>
                    {list.length === 0 ? (
                      <div className="h-28 border border-dashed border-border/80 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                        <p className="text-xs text-text-secondary/60">Lista vazia</p>
                      </div>
                    ) : (
                      list.map((item) => (
                        <DraggableCard
                          key={item.id}
                          item={item}
                          onOpenTimeline={handleOpenTimeline}
                          onDelete={(card) => {
                            setPartnerToDelete(card);
                            setIsDeleteModalOpen(true);
                            setDeleteError(null);
                          }}
                        />
                      ))
                    )}
                  </DroppableColumn>
                );
              })}
            </div>
          </DndContext>

          {/* DASHBOARD SECTION */}
          <div className="mt-8 pt-8 border-t border-border flex flex-col gap-6" id="campanha-dashboard-section">
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold text-text-primary tracking-tight">Dashboard</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Acompanhe a performance comercial, evolução do funil e saúde da operação.
              </p>
            </div>

            {/* 4 KPIs: Compact horizontal row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="dashboard-kpis-grid">
              {/* KPI 1: Licenças convertidas */}
              <div className="bg-white p-4 rounded-xl border border-border shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Licenças Convertidas</span>
                  <Award className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-text-primary">
                    {dashboardKpis.totalLicencasConvertidas.toLocaleString('pt-BR')}
                  </span>
                  <p className="text-[11px] text-text-secondary mt-0.5">Soma de licenças de parceiros convertidos</p>
                </div>
              </div>

              {/* KPI 2: Taxa de conversão total */}
              <div className="bg-white p-4 rounded-xl border border-border shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Taxa de Conversão Total</span>
                  <TrendingUp className="w-4 h-4 text-primary" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-text-primary">
                    {dashboardKpis.taxaConversaoTotal.toFixed(1).replace('.', ',')}%
                  </span>
                  <p className="text-[11px] text-text-secondary mt-0.5">Não Abordado → Converteu</p>
                </div>
              </div>

              {/* KPI 3: Parceiros convertidos */}
              <div className="bg-white p-4 rounded-xl border border-border shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Parceiros Convertidos</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-emerald-600">
                    {dashboardKpis.totalConvertidos}
                  </span>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    de {dashboardKpis.totalCampanha} parceiros na campanha
                  </p>
                </div>
              </div>

              {/* KPI 4: Parceiros perdidos */}
              <div className="bg-white p-4 rounded-xl border border-border shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Parceiros Perdidos</span>
                  <XCircle className="w-4 h-4 text-rose-600" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold text-rose-600">
                    {dashboardKpis.totalPerdidos}
                  </span>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    {dashboardKpis.pctPerdidosSobreAbordados.toFixed(1).replace('.', ',')}% do total abordado ({dashboardKpis.totalAbordados})
                  </p>
                </div>
              </div>
            </div>

            {/* Gráficos de Evolução Histórica (Total de Licenças & Licenças Engajadas) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" id="dashboard-charts-evolucao-grid">
              {/* Gráfico 1: Total de Licenças */}
              <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col min-h-[300px]" id="card-chart-total-licencas">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">Total de Licenças</h4>
                    <p className="text-xs text-text-secondary">Evolução histórica do volume total de licenças dos parceiros da campanha</p>
                  </div>
                  {historicalLicensesStats.totalLicencas.length > 0 && (
                    <div className="text-right">
                      <span className="text-sm font-bold text-indigo-600">
                        {historicalLicensesStats.totalLicencas[historicalLicensesStats.totalLicencas.length - 1].toLocaleString('pt-BR')}
                      </span>
                      <span className="block text-[10px] text-text-secondary">última importação</span>
                    </div>
                  )}
                </div>

                {loadingSnapshots ? (
                  <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-xs text-text-secondary">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400 mb-2" />
                    <span>Carregando histórico...</span>
                  </div>
                ) : historicalLicensesStats.dates.length === 0 ? (
                  <div className="flex-1 min-h-[200px] flex items-center justify-center text-xs text-text-secondary border border-dashed border-border rounded-lg bg-surface/50 p-4 text-center">
                    Nenhum snapshot de importação encontrado para os parceiros desta campanha.
                  </div>
                ) : (
                  <div className="h-[220px] w-full mt-auto">
                    <Line data={chartTotalLicencasData} options={chartTotalLicencasOptions} plugins={[ChartDataLabels]} />
                  </div>
                )}
              </div>

              {/* Gráfico 2: Licenças Engajadas */}
              <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col min-h-[300px]" id="card-chart-licencas-engajadas">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">Licenças Engajadas</h4>
                    <p className="text-xs text-text-secondary">Evolução histórica do engajamento de licenças dos parceiros da campanha</p>
                  </div>
                  {historicalLicensesStats.totalEngajadas.length > 0 && (
                    <div className="text-right">
                      <span className="text-sm font-bold text-emerald-600">
                        {historicalLicensesStats.totalEngajadas[historicalLicensesStats.totalEngajadas.length - 1].toLocaleString('pt-BR')}
                      </span>
                      <span className="block text-[10px] text-text-secondary">última importação</span>
                    </div>
                  )}
                </div>

                {loadingSnapshots ? (
                  <div className="flex-1 min-h-[200px] flex flex-col items-center justify-center text-xs text-text-secondary">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400 mb-2" />
                    <span>Carregando histórico...</span>
                  </div>
                ) : historicalLicensesStats.dates.length === 0 ? (
                  <div className="flex-1 min-h-[200px] flex items-center justify-center text-xs text-text-secondary border border-dashed border-border rounded-lg bg-surface/50 p-4 text-center">
                    Nenhum snapshot de importação encontrado para os parceiros desta campanha.
                  </div>
                ) : (
                  <div className="h-[220px] w-full mt-auto">
                    <Line data={chartEngajadasData} options={chartEngajadasOptions} plugins={[ChartDataLabels]} />
                  </div>
                )}
              </div>
            </div>

            {/* Performance de Vendas (Grade de 4 Blocos) */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider text-text-secondary">
                Performance de Vendas
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bloco 1 — Motivos de perda */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">Motivos de Perda</h4>
                      <p className="text-xs text-text-secondary">Distribuição dos motivos registrados em parceiros perdidos</p>
                    </div>
                    <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-200">
                      {dashboardKpis.totalPerdidos} perdas
                    </span>
                  </div>

                  {motivosPerdaStats.length === 0 ? (
                    <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs text-text-secondary border border-dashed border-border rounded-lg bg-surface/50">
                      Nenhum parceiro perdido registrado nesta campanha.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {motivosPerdaStats.map((item) => (
                        <div key={item.motivo} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-text-primary truncate pr-2 max-w-[70%]" title={item.motivo}>
                              {item.motivo}
                            </span>
                            <span className="font-semibold text-text-secondary shrink-0">
                              {item.count} <span className="text-text-secondary/60">({item.percentual.toFixed(1).replace('.', ',')}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-rose-500 h-full rounded-full transition-all duration-300"
                              style={{ width: `${Math.max(item.percentual, 3)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Bloco 2 — Tempo médio em cada fase */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">Tempo Médio em Cada Fase</h4>
                      <p className="text-xs text-text-secondary">Duração média (em dias) até transição ou encerramento</p>
                    </div>
                  </div>

                  <div className="space-y-3.5 flex-1 justify-center flex flex-col">
                    {tempoMedioFases.fases.map((fase) => {
                      const isGargalo = tempoMedioFases.maxTempo > 0 && fase.mediaDias === tempoMedioFases.maxTempo;
                      const barWidth = tempoMedioFases.maxTempo > 0 ? (fase.mediaDias / tempoMedioFases.maxTempo) * 100 : 0;

                      return (
                        <div key={fase.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-text-primary">{fase.label}</span>
                              {isGargalo && (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  Gargalo
                                </span>
                              )}
                            </div>
                            <span className="font-semibold text-text-primary">
                              {fase.count > 0 ? (
                                <>
                                  {fase.mediaDias.toString().replace('.', ',')} <span className="text-text-secondary font-normal">dias ({fase.count} {fase.count === 1 ? 'card' : 'cards'})</span>
                                </>
                              ) : (
                                <span className="text-text-secondary/60 font-normal">Sem transições</span>
                              )}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isGargalo ? 'bg-amber-500' : 'bg-primary'
                              }`}
                              style={{ width: `${Math.max(barWidth, fase.count > 0 ? 3 : 0)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bloco 3 — Taxa de conversão entre fases */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">Conversão Entre Fases</h4>
                      <p className="text-xs text-text-secondary">Taxa de avanço de uma etapa para a etapa seguinte</p>
                    </div>
                  </div>

                  <div className="space-y-3.5 flex-1 justify-center flex flex-col">
                    {conversaoFases.map((trans, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-medium text-text-primary">
                            <span>{trans.fromLabel}</span>
                            <ArrowRight className="w-3 h-3 text-text-secondary" />
                            <span>{trans.toLabel}</span>
                          </div>
                          <span className="font-semibold text-text-primary">
                            {trans.taxa.toFixed(1).replace('.', ',')}%
                            <span className="text-[11px] text-text-secondary font-normal ml-1">
                              ({trans.toCount}/{trans.fromCount})
                            </span>
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.max(trans.taxa, trans.fromCount > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bloco 4 — Comparativo entre gerentes */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">Comparativo Entre Gerentes</h4>
                      <p className="text-xs text-text-secondary">Desempenho comercial e volume por gerente na campanha</p>
                    </div>
                  </div>

                  {comparativoGerentes.length === 0 ? (
                    <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs text-text-secondary border border-dashed border-border rounded-lg bg-surface/50">
                      Nenhum dado de gerente disponível.
                    </div>
                  ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[220px] scrollbar-thin">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-white z-10 shadow-xs">
                          <tr className="border-b border-border text-text-secondary uppercase text-[10px] tracking-wider bg-white">
                            <th className="py-2 pr-2 font-semibold">Gerente</th>
                            <th className="py-2 px-2 font-semibold text-center">Carteira</th>
                            <th className="py-2 px-2 font-semibold text-center text-emerald-700">Conv.</th>
                            <th className="py-2 px-2 font-semibold text-center">Licenças</th>
                            <th className="py-2 px-2 font-semibold text-center text-rose-700">Perd.</th>
                            <th className="py-2 pl-2 font-semibold text-right min-w-[120px]">Tx. Conversão</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {comparativoGerentes.map((g) => (
                            <tr key={g.gerenteNome} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-2.5 pr-2 font-medium text-text-primary truncate max-w-[140px]" title={g.gerenteNome}>
                                {g.gerenteNome}
                              </td>
                              <td className="py-2.5 px-2 text-center text-text-secondary font-semibold">
                                {g.carteira}
                              </td>
                              <td className="py-2.5 px-2 text-center font-bold text-emerald-600">
                                {g.convertidos}
                              </td>
                              <td className="py-2.5 px-2 text-center font-medium text-text-primary">
                                {g.licencas}
                              </td>
                              <td className="py-2.5 px-2 text-center font-medium text-rose-600">
                                {g.perdidos}
                              </td>
                              <td className="py-2.5 pl-2 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="font-semibold text-text-primary shrink-0 w-10 text-right">
                                    {g.taxaConversao.toFixed(1).replace('.', ',')}%
                                  </span>
                                  <div className="w-14 bg-slate-100 h-1.5 rounded-full overflow-hidden shrink-0">
                                    <div
                                      className="bg-emerald-500 h-full rounded-full"
                                      style={{ width: `${Math.max(g.taxaConversao, g.carteira > 0 ? 3 : 0)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fase 2 — Seção "Avanço da campanha" */}
            <div className="flex flex-col gap-4 mt-2" id="dashboard-avanco-campanha-section">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider text-text-secondary">
                    Avanço da campanha
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Evolução do volume movimentado no funil ao longo do tempo (movimento não acumulado).
                  </p>
                </div>

                {/* Legenda compartilhada dos 5 segmentos */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
                  {avancoCampanhaData.segments.map(seg => (
                    <div key={seg.key} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-xs ${seg.bgClass}`} />
                      <span className="font-medium text-text-primary">{seg.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dois gráficos de barras empilhadas lado a lado */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Gráfico A — Diário · últimos 8 dias */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">Diário · últimos 8 dias</h4>
                      <p className="text-xs text-text-secondary">Movimentações diárias por fase</p>
                    </div>
                    <span className="text-[11px] font-semibold text-text-secondary bg-slate-100 px-2 py-1 rounded">
                      {avancoCampanhaData.dailyData.reduce((acc, d) => acc + d.total, 0)} ações no período
                    </span>
                  </div>

                  {/* Visualização de barras empilhadas */}
                  <div className="h-56 flex items-end gap-2 sm:gap-3 pt-6 pb-2 border-b border-border/80">
                    {avancoCampanhaData.dailyData.map((d) => {
                      const heightPercent = avancoCampanhaData.maxDaily > 0 ? (d.total / avancoCampanhaData.maxDaily) * 100 : 0;

                      return (
                        <div key={d.key} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                          {/* Tooltip flutuante ao passar o mouse */}
                          <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col z-30 bg-slate-900 text-white text-[11px] p-2.5 rounded-lg shadow-xl pointer-events-none min-w-[170px] border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
                            <div className="font-bold border-b border-slate-700 pb-1 mb-1.5 flex justify-between items-center">
                              <span>{d.fullDateLabel}</span>
                              <span className="text-emerald-400 font-semibold">{d.total} total</span>
                            </div>
                            <div className="space-y-1">
                              {avancoCampanhaData.segments.map(seg => {
                                const val = d.counts[seg.key] || 0;
                                return (
                                  <div key={seg.key} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${seg.bgClass}`} />
                                      <span className="text-slate-300 text-[10px]">{seg.label}:</span>
                                    </div>
                                    <span className="font-bold">{val}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Total no topo da barra */}
                          <span className={`text-[10px] font-semibold mb-1 transition-opacity ${d.total > 0 ? 'text-text-primary' : 'text-text-secondary/40'}`}>
                            {d.total}
                          </span>

                          {/* Coluna empilhada */}
                          <div
                            className="w-full max-w-[42px] bg-slate-100 rounded-t-sm flex flex-col-reverse overflow-hidden transition-all duration-300 group-hover:ring-2 group-hover:ring-primary/40"
                            style={{ height: `${Math.max(heightPercent, d.total > 0 ? 6 : 2)}%` }}
                          >
                            {d.total > 0 ? (
                              avancoCampanhaData.segments.map(seg => {
                                const count = d.counts[seg.key] || 0;
                                if (count === 0) return null;
                                const segPercent = (count / d.total) * 100;
                                return (
                                  <div
                                    key={seg.key}
                                    className={`${seg.bgClass} transition-all duration-200`}
                                    style={{ height: `${segPercent}%` }}
                                    title={`${seg.label}: ${count}`}
                                  />
                                );
                              })
                            ) : (
                              <div className="w-full h-full bg-slate-100" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Eixo X: Datas */}
                  <div className="flex justify-between gap-2 sm:gap-3 pt-2">
                    {avancoCampanhaData.dailyData.map((d) => (
                      <div key={d.key} className="flex-1 text-center">
                        <span className="text-[11px] font-medium text-text-secondary block truncate" title={d.fullDateLabel}>
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gráfico B — Semanal · últimas 8 semanas */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">Semanal · últimas 8 semanas</h4>
                      <p className="text-xs text-text-secondary">Movimentações semanais por fase</p>
                    </div>
                    <span className="text-[11px] font-semibold text-text-secondary bg-slate-100 px-2 py-1 rounded">
                      {avancoCampanhaData.weeklyData.reduce((acc, w) => acc + w.total, 0)} ações no período
                    </span>
                  </div>

                  {/* Visualização de barras empilhadas */}
                  <div className="h-56 flex items-end gap-2 sm:gap-3 pt-6 pb-2 border-b border-border/80">
                    {avancoCampanhaData.weeklyData.map((w) => {
                      const heightPercent = avancoCampanhaData.maxWeekly > 0 ? (w.total / avancoCampanhaData.maxWeekly) * 100 : 0;

                      return (
                        <div key={w.key} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                          {/* Tooltip flutuante ao passar o mouse */}
                          <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col z-30 bg-slate-900 text-white text-[11px] p-2.5 rounded-lg shadow-xl pointer-events-none min-w-[180px] border border-slate-700 animate-in fade-in zoom-in-95 duration-150">
                            <div className="font-bold border-b border-slate-700 pb-1 mb-1.5 flex justify-between items-center">
                              <span>{w.fullDateLabel}</span>
                              <span className="text-emerald-400 font-semibold">{w.total} total</span>
                            </div>
                            <div className="space-y-1">
                              {avancoCampanhaData.segments.map(seg => {
                                const val = w.counts[seg.key] || 0;
                                return (
                                  <div key={seg.key} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`w-2 h-2 rounded-full ${seg.bgClass}`} />
                                      <span className="text-slate-300 text-[10px]">{seg.label}:</span>
                                    </div>
                                    <span className="font-bold">{val}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Total no topo da barra */}
                          <span className={`text-[10px] font-semibold mb-1 transition-opacity ${w.total > 0 ? 'text-text-primary' : 'text-text-secondary/40'}`}>
                            {w.total}
                          </span>

                          {/* Coluna empilhada */}
                          <div
                            className="w-full max-w-[42px] bg-slate-100 rounded-t-sm flex flex-col-reverse overflow-hidden transition-all duration-300 group-hover:ring-2 group-hover:ring-primary/40"
                            style={{ height: `${Math.max(heightPercent, w.total > 0 ? 6 : 2)}%` }}
                          >
                            {w.total > 0 ? (
                              avancoCampanhaData.segments.map(seg => {
                                const count = w.counts[seg.key] || 0;
                                if (count === 0) return null;
                                const segPercent = (count / w.total) * 100;
                                return (
                                  <div
                                    key={seg.key}
                                    className={`${seg.bgClass} transition-all duration-200`}
                                    style={{ height: `${segPercent}%` }}
                                    title={`${seg.label}: ${count}`}
                                  />
                                );
                              })
                            ) : (
                              <div className="w-full h-full bg-slate-100" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Eixo X: Semanas */}
                  <div className="flex justify-between gap-2 sm:gap-3 pt-2">
                    {avancoCampanhaData.weeklyData.map((w) => (
                      <div key={w.key} className="flex-1 text-center">
                        <span className="text-[11px] font-medium text-text-secondary block truncate" title={w.fullDateLabel}>
                          {w.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Fase 3 — Seção "Saúde da Operação" */}
            <div className="flex flex-col gap-4 mt-2" id="dashboard-saude-operacao-section">
              <div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider text-text-secondary">
                  Saúde da Operação
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Identifique parceiros sem atualização recente para acelerar o avanço no funil.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Tabela de Cards Parados (ocupa 2 colunas no desktop) */}
                <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-text-primary">Cards Parados</h4>
                        <p className="text-xs text-text-secondary">
                          Parceiros em fases ativas sem novo comentário ou movimentação
                        </p>
                      </div>

                      {/* Filtros de threshold (pills) */}
                      <div className="flex items-center gap-1.5 flex-wrap bg-slate-100/80 p-1 rounded-lg border border-border/50 self-start sm:self-auto">
                        {[
                          { days: 3, label: '> 3 dias' },
                          { days: 7, label: '> 7 dias' },
                          { days: 14, label: '> 14 dias' },
                          { days: 30, label: '> 30 dias' },
                        ].map(pill => (
                          <button
                            key={pill.days}
                            type="button"
                            onClick={() => setThresholdDiasParado(pill.days)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                              thresholdDiasParado === pill.days
                                ? 'bg-white text-primary shadow-xs'
                                : 'text-text-secondary hover:text-text-primary hover:bg-white/50'
                            }`}
                          >
                            {pill.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Tabela */}
                    {saudeOperacaoData.filteredCards.length === 0 ? (
                      <div className="min-h-[220px] flex flex-col items-center justify-center text-xs text-text-secondary border border-dashed border-border rounded-lg bg-surface/50 p-6 text-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2 opacity-80" />
                        <span className="font-semibold text-text-primary">Nenhum card parado acima de {thresholdDiasParado} dias</span>
                        <span className="text-[11px] text-text-secondary mt-0.5">Todos os parceiros ativos receberam interações recentes.</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-border text-text-secondary uppercase text-[10px] tracking-wider">
                              <th className="py-2.5 pr-2 font-semibold">Parceiro</th>
                              <th className="py-2.5 px-2 font-semibold">Fase Atual</th>
                              <th className="py-2.5 px-2 font-semibold">Último Comentário</th>
                              <th className="py-2.5 px-2 font-semibold text-center">Dias Parado</th>
                              <th className="py-2.5 pl-2 font-semibold">Gerente</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {saudeOperacaoData.filteredCards.slice(0, 8).map(card => {
                              const isAlert = card.diasParado > thresholdDiasParado;

                              return (
                                <tr key={card.id} className="hover:bg-slate-50/60 transition-colors">
                                  <td className="py-2.5 pr-2">
                                    <div className="flex flex-col">
                                      <span className="font-semibold text-text-primary truncate max-w-[160px]" title={card.parceiroNome}>
                                        {card.parceiroNome}
                                      </span>
                                      {card.segmento && (
                                        <span className="text-[10px] text-text-secondary truncate max-w-[160px]">
                                          {card.segmento}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                      {card.statusLabel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 text-text-secondary whitespace-nowrap">
                                    {card.ultimoRegistroEm ? (
                                      formatDateTime(card.ultimoRegistroEm)
                                    ) : (
                                      <span className="text-text-secondary/60 italic text-[11px]">Sem registros</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2 text-center">
                                    <span
                                      className={`inline-flex items-center justify-center font-bold px-2 py-0.5 rounded-full text-[11px] ${
                                        isAlert
                                          ? 'bg-rose-50 text-rose-700 border border-rose-200 font-extrabold'
                                          : 'bg-slate-100 text-text-primary'
                                      }`}
                                    >
                                      {card.diasParado} {card.diasParado === 1 ? 'dia' : 'dias'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 pl-2 text-text-secondary font-medium truncate max-w-[130px]" title={card.gerenteNome}>
                                    {card.gerenteNome}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Rodapé da tabela com contagem total e link */}
                  {saudeOperacaoData.totalFiltrados > 0 && (
                    <div className="pt-3 mt-3 border-t border-border/60 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">
                        Mostrando {Math.min(8, saudeOperacaoData.totalFiltrados)} de {saudeOperacaoData.totalFiltrados} cards parados (&gt; {thresholdDiasParado} dias)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const kanbanElem = document.getElementById('kanban-board-container');
                          if (kanbanElem) {
                            kanbanElem.scrollIntoView({ behavior: 'smooth' });
                          }
                        }}
                        className="text-primary hover:text-primary/80 font-semibold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        Ver todos os cards parados ({saudeOperacaoData.totalFiltrados}) →
                      </button>
                    </div>
                  )}
                </div>

                {/* Card de Alerta (ao lado da tabela) */}
                <div className="bg-white p-5 rounded-xl border border-border shadow-xs flex flex-col justify-between">
                  <div className="flex flex-col gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                      <Bell className="w-5 h-5" />
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-text-primary">
                        Atenção: {saudeOperacaoData.countParadosPadrao7} {saudeOperacaoData.countParadosPadrao7 === 1 ? 'card está parado' : 'cards estão parados'}
                      </h4>
                      <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        Cards sem atualização há mais de 7 dias tendem a ter menor chance de conversão na campanha.
                      </p>
                    </div>

                    <div className="p-3 bg-slate-50 border border-border rounded-lg text-xs space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary">Total em fases ativas:</span>
                        <span className="font-bold text-text-primary">{saudeOperacaoData.allActiveCount}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary">Parados &gt; 7 dias:</span>
                        <span className="font-bold text-rose-600">{saudeOperacaoData.countParadosPadrao7}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-text-secondary">Parados no filtro atual (&gt; {thresholdDiasParado}d):</span>
                        <span className="font-bold text-primary">{saudeOperacaoData.totalFiltrados}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => {
                        const kanbanElem = document.getElementById('kanban-board-container');
                        if (kanbanElem) {
                          kanbanElem.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-lg text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      Acessar Kanban
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TIMELINE MODAL */}
      {selectedCardForTimeline && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div
            id="modal-timeline-parceiro"
            className="bg-white border border-border rounded-xl shadow-xl w-full max-w-2xl p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[90vh]"
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedCardForTimeline(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer animate-none"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            {/* Header */}
            <div className="border-b border-border pb-4">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-bold text-text-primary">
                  {selectedCardForTimeline.partners?.nome || 'Parceiro desconhecido'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-text-secondary font-medium">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                  ID: {selectedCardForTimeline.partners?.accountancy_id || 'N/A'}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 opacity-70" />
                  Gerente: <span className="font-semibold text-text-primary">{selectedCardForTimeline.partners?.gerente || 'N/A'}</span>
                </span>
                <span className="flex items-center gap-1">
                  Status: <span className="font-bold text-primary">
                    {KANBAN_COLUMNS.find(c => c.status === selectedCardForTimeline.status)?.label || selectedCardForTimeline.status}
                  </span>
                </span>
              </div>
            </div>

            {/* Content scroll container */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[50vh]">
              {/* Comment submission form */}
              <form onSubmit={handleAddComment} className="space-y-3 bg-surface p-4 rounded-xl border border-border">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Novo Registro</h3>
                <textarea
                  required
                  disabled={isSavingComment}
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Escreva um novo registro ou comentário para o histórico..."
                  rows={3}
                  className="w-full p-3 border border-border rounded-lg text-sm bg-white text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingComment || !newCommentText.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isSavingComment ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      'Registrar'
                    )}
                  </button>
                </div>
              </form>

              {/* Loader and error indicators */}
              {commentError && (
                <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{commentError}</span>
                </div>
              )}

              {/* Historic messages/comment list */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">Histórico</h3>
                {loadingComments ? (
                  <div className="flex flex-col items-center justify-center p-8 text-text-secondary">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
                    <p className="text-xs">Buscando histórico...</p>
                  </div>
                ) : timelineComments.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-xl text-text-secondary text-sm">
                    Nenhum registro ainda
                  </div>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-xl bg-white px-4">
                    {timelineComments.map((cmt) => (
                      <div key={cmt.id} className="py-4 flex flex-col gap-2">
                        <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed">{cmt.comentario}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary/75">
                          <span className="flex items-center gap-1 font-medium text-text-secondary">
                            <User className="w-3.5 h-3.5 opacity-70" />
                            {cmt.users?.nome || 'Gerente'}
                          </span>
                          <span className="text-text-secondary/40">•</span>
                          <span className="flex items-center gap-1 font-mono text-[11px] text-text-secondary">
                            <Clock className="w-3.5 h-3.5 opacity-70" />
                            {formatDateTime(cmt.criado_em)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lower Close action */}
            <div className="border-t border-border pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedCardForTimeline(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold rounded-lg text-sm shadow-sm transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONVERTEU MODAL */}
      {isConverteuModalOpen && partnerToMove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white border border-border rounded-xl shadow-xl w-full max-w-md p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsConverteuModalOpen(false);
                setPartnerToMove(null);
                setPendingStatus(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
            <h2 className="text-lg font-bold text-text-primary">Registrar Conversão</h2>
            <p className="text-sm text-text-secondary">
              Parceiro: <span className="font-semibold text-text-primary">{partnerToMove.partners?.nome}</span>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (licencasConvertidas < 1) return;
                executeMove(partnerToMove, 'converteu', { licencas_convertidas: licencasConvertidas });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                  Licenças convertidas
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  value={licencasConvertidas}
                  onChange={(e) => setLicencasConvertidas(parseInt(e.target.value) || 1)}
                  className="w-full p-2.5 border border-border rounded-lg text-sm bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                />
              </div>
              {movementError && (
                <p className="text-xs text-danger font-medium">{movementError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsConverteuModalOpen(false);
                    setPartnerToMove(null);
                    setPendingStatus(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isMoving || licencasConvertidas < 1}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isMoving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PERDEU MODAL */}
      {isPerdeuModalOpen && partnerToMove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white border border-border rounded-xl shadow-xl w-full max-w-lg p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsPerdeuModalOpen(false);
                setPartnerToMove(null);
                setPendingStatus(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
            <h2 className="text-lg font-bold text-text-primary">Registrar Perda</h2>
            <p className="text-sm text-text-secondary">
              Parceiro: <span className="font-semibold text-text-primary">{partnerToMove.partners?.nome}</span>
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!motivoPerdaPadrao || motivoPerda.trim().length < 75) return;
                executeMove(partnerToMove, 'perdeu', {
                  motivo_perda: motivoPerda.trim(),
                  motivo_perda_padrao: motivoPerdaPadrao,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                  Motivo <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={motivoPerdaPadrao}
                  onChange={(e) => setMotivoPerdaPadrao(e.target.value)}
                  className="w-full p-2.5 border border-border rounded-lg text-sm bg-white text-text-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                >
                  <option value="" disabled>
                    Selecione um motivo...
                  </option>
                  {MOTIVOS_PERDA_PADRAO.map((motivo) => (
                    <option key={motivo} value={motivo}>
                      {motivo}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1">
                  Motivo da perda (Mínimo 75 caracteres) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  value={motivoPerda}
                  onChange={(e) => setMotivoPerda(e.target.value)}
                  rows={4}
                  placeholder="Por favor, detalhe os motivos da perda do parceiro nesta campanha..."
                  className="w-full p-3 border border-border rounded-lg text-sm bg-white text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className={`text-xs font-semibold ${motivoPerda.length >= 75 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {motivoPerda.length}/75 caracteres
                  </span>
                  {motivoPerda.length < 75 && (
                    <span className="text-[11px] text-text-secondary">
                      Faltam {75 - motivoPerda.length} caracteres
                    </span>
                  )}
                </div>
              </div>
              {movementError && (
                <p className="text-xs text-danger font-medium">{movementError}</p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPerdeuModalOpen(false);
                    setPartnerToMove(null);
                    setPendingStatus(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isMoving || !motivoPerdaPadrao || motivoPerda.trim().length < 75}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isMoving ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION FOR DELETION MODAL */}
      {isDeleteModalOpen && partnerToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200" onClick={(e) => e.stopPropagation()}>
          <div className="bg-white border border-border rounded-xl shadow-xl w-full max-w-md p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setPartnerToDelete(null);
                setDeleteError(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
            <h2 className="text-lg font-bold text-text-primary">Confirmar Remoção</h2>
            <p className="text-sm text-text-secondary leading-normal">
              Tem certeza que deseja remover <span className="font-semibold text-text-primary">{partnerToDelete.partners?.nome}</span> desta campanha? Esta ação não pode ser desfeita.
            </p>
            {deleteError && (
              <p className="text-xs text-danger font-medium">{deleteError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setPartnerToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold rounded-lg text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeDelete(partnerToDelete)}
                disabled={isDeleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1 animate-none"
              >
                {isDeleting ? 'Removendo...' : 'Remover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
