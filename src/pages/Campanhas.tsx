import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Megaphone, Calendar, Users, AlertCircle, Loader2, Plus, X, Upload, CheckCircle, Columns } from 'lucide-react';
import { Badge } from '../components/ui/Badge';

interface CampaignPartner {
  id: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  encerrada_em: string | null;
  campaign_partners?: CampaignPartner[] | { count: number }[] | null;
}

export function Campanhas() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  // State for listing campanhas
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for Nova Campanha Modal
  const [isNewCampaignModalOpen, setIsNewCampaignModalOpen] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);

  // State for Importar Parceiros Modal
  const [selectedCampaignForImport, setSelectedCampaignForImport] = useState<Campaign | null>(null);
  const [partnerIdsText, setPartnerIdsText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; notFound: number } | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('campaigns')
        .select(`
          *,
          campaign_partners (
            id
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      if (data) {
        setCampaigns(data as Campaign[]);
      }
    } catch (err: any) {
      console.error('Erro ao buscar campanhas:', err);
      setError(err.message || 'Erro ao carregar as campanhas. Por favor, tente novamente mais tarde.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    fetchCampaigns();
  }, [authLoading]);

  // Handle Nova Campanha submission
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) {
      setCampaignError('O nome da campanha é obrigatório.');
      return;
    }
    if (!user) {
      setCampaignError('Sessão de usuário inválida.');
      return;
    }

    try {
      setIsSavingCampaign(true);
      setCampaignError(null);

      const { error: insertError } = await supabase
        .from('campaigns')
        .insert({
          name: campaignName.trim(),
          description: campaignDescription.trim() || null,
          criado_por: user.id
        });

      if (insertError) {
        throw insertError;
      }

      // Success
      setIsNewCampaignModalOpen(false);
      setCampaignName('');
      setCampaignDescription('');
      await fetchCampaigns();
    } catch (err: any) {
      console.error('Erro ao instanciar campanha:', err);
      setCampaignError(err.message || 'Ocorreu um erro ao criar a nova campanha.');
    } finally {
      setIsSavingCampaign(false);
    }
  };

  // Handle Importar Parceiros
  const handleImportPartners = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaignForImport) return;
    if (!partnerIdsText.trim()) {
      setImportError('Por favor, insira pelo menos um ID de parceiro.');
      return;
    }

    try {
      setIsImporting(true);
      setImportError(null);

      // Parse IDs using comma, semicolon, or newline separators
      const parsedIds = partnerIdsText
        .replace(/[;\n]/g, ',')
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

      if (parsedIds.length === 0) {
        setImportError('Nenhum ID de parceiro válido encontrado no texto digitado.');
        return;
      }

      // 1. Fetch matching partners from Supabase to resolve IDs and gerente_ids
      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select('id, gerente_id, accountancy_id')
        .in('accountancy_id', parsedIds);

      if (partnersError) {
        throw partnersError;
      }

      const foundPartners = partnersData || [];
      const totalRequested = parsedIds.length;
      
      // Calculate how many requested accountancy_ids were actually resolved to database records
      const resolvedAccountancyIds = new Set(foundPartners.map(p => p.accountancy_id));
      const notFoundCount = parsedIds.filter(id => !resolvedAccountancyIds.has(id)).length;

      if (foundPartners.length > 0) {
        // 2. Prepare campaign_partners items
        const campaignPartnersToInsert = foundPartners.map(p => ({
          campaign_id: selectedCampaignForImport.id,
          partner_id: p.id,
          gerente_id: null,
          status: 'nao_abordado',
          entrou_nao_abordado_em: new Date().toISOString()
        }));

        // 3. Upsert into database, ignoring duplicates on conflict (campaign_id, partner_id)
        const { error: upsertError } = await supabase
          .from('campaign_partners')
          .upsert(campaignPartnersToInsert, { 
            onConflict: 'campaign_id,partner_id', 
            ignoreDuplicates: true 
          });

        if (upsertError) {
          throw upsertError;
        }
      }

      // Record result to display inside modal
      setImportResult({
        imported: foundPartners.length,
        notFound: notFoundCount
      });

    } catch (err: any) {
      console.error('Erro ao importar parceiros para campanha:', err);
      setImportError(err.message || 'Ocorreu um erro ao processar a importação de parceiros.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCloseImportModal = () => {
    setSelectedCampaignForImport(null);
    setPartnerIdsText('');
    setImportError(null);
    setImportResult(null);
    fetchCampaigns(); // refresh list to show updated totals
  };

  // Helper function to format ISO date timestamp to dd/mm/yyyy
  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return 'N/A';
    }
  };

  // Helper to parse the campaign partners count in a robust way
  const getPartnersCount = (campaign: Campaign) => {
    if (!campaign.campaign_partners) return 0;
    if (Array.isArray(campaign.campaign_partners)) {
      if (campaign.campaign_partners.length > 0) {
        const first = campaign.campaign_partners[0];
        if (first && typeof first === 'object' && 'count' in first) {
          return (first as any).count;
        }
      }
      return campaign.campaign_partners.length;
    }
    return 0;
  };

  return (
    <div className="p-6">
      {/* Header section with same aesthetic styling */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            Campanhas
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Acompanhe o engajamento e progresso das campanhas vigentes.
          </p>
        </div>

        {/* Action button visible only to admin */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsNewCampaignModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nova Campanha
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-surface rounded-xl border border-border shadow-sm">
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
          <p className="text-sm text-text-secondary">Buscando campanhas...</p>
        </div>
      ) : error ? (
        <div className="p-5 bg-danger/5 border border-danger/20 rounded-xl text-danger flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Erro ao carregar campanhas</h3>
            <p className="text-xs mt-1 text-danger/80">{error}</p>
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 bg-surface rounded-xl border border-border shadow-sm text-center">
          <Megaphone className="w-12 h-12 text-text-secondary opacity-40 mb-3" />
          <h3 className="text-base font-semibold text-text-primary">Nenhuma campanha encontrada</h3>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            Não há campanhas ativas ou cadastradas no momento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((campaign) => {
            const isAtiva = !campaign.encerrada_em;
            const partnersCount = getPartnersCount(campaign);

            return (
              <div
                key={campaign.id}
                id={`campaign-card-${campaign.id}`}
                className="bg-surface p-5 rounded-xl border border-border shadow-sm hover:shadow-md transition-all flex flex-col gap-4 group"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-text-primary leading-tight group-hover:text-primary transition-colors truncate">
                      {campaign.name}
                    </h3>
                  </div>
                  <Badge variant={isAtiva ? 'success' : 'danger'}>
                    {isAtiva ? 'Ativa' : 'Encerrada'}
                  </Badge>
                </div>

                {campaign.description && (
                  <p className="text-sm text-text-secondary line-clamp-2">
                    {campaign.description}
                  </p>
                )}

                <div className="pt-3 border-t border-border mt-auto flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Calendar className="w-4 h-4 text-text-secondary opacity-70" />
                      Criada em
                    </span>
                    <span className="font-semibold text-text-primary">
                      {formatDate(campaign.created_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-text-secondary mb-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Users className="w-4 h-4 text-text-secondary opacity-70" />
                      Parceiros participantes
                    </span>
                    <span className="font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                      {partnersCount}
                    </span>
                  </div>

                  {/* Option to view/open Kanban for everyone */}
                  <button
                    type="button"
                    onClick={() => navigate(`/campanhas/${campaign.id}`)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/95 text-white font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    <Columns className="w-3.5 h-3.5" /> Abrir Kanban
                  </button>

                  {/* Option to import partners on this campaign, admin-only */}
                  {isAdmin && isAtiva && (
                    <button
                      type="button"
                      onClick={() => setSelectedCampaignForImport(campaign)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-primary/5 border border-border hover:border-primary/20 hover:text-primary text-text-secondary font-semibold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" /> Importar Parceiros
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: NOVA CAMPANHA */}
      {isNewCampaignModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div
            id="modal-nova-campanha"
            className="bg-white border border-border rounded-xl shadow-xl w-full max-w-md p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200"
          >
            <button
              onClick={() => {
                setIsNewCampaignModalOpen(false);
                setCampaignName('');
                setCampaignDescription('');
                setCampaignError(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            <div>
              <h2 className="text-lg font-bold text-text-primary">Criação de Campanha</h2>
              <p className="text-xs text-text-secondary mt-1">Crie uma nova campanha de engajamento para os parceiros.</p>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              {campaignError && (
                <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{campaignError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-primary">Nome da Campanha *</label>
                <input
                  type="text"
                  required
                  disabled={isSavingCampaign}
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ex: Campanha Expansão 2026"
                  className="w-full h-10 px-3 border border-border rounded-lg text-sm bg-surface text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-primary">Descrição (Opcional)</label>
                <textarea
                  disabled={isSavingCampaign}
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  placeholder="Ex: Campanhas para incentivo de adoção do sistema..."
                  rows={3}
                  className="w-full p-3 border border-border rounded-lg text-sm bg-surface text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSavingCampaign}
                  onClick={() => {
                    setIsNewCampaignModalOpen(false);
                    setCampaignName('');
                    setCampaignDescription('');
                    setCampaignError(null);
                  }}
                  className="px-4 py-2 bg-surface hover:bg-surface/80 border border-border text-text-primary font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingCampaign || !campaignName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSavingCampaign ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORTAR PARCEIROS */}
      {selectedCampaignForImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div
            id="modal-importar-parceiros"
            className="bg-white border border-border rounded-xl shadow-xl w-full max-w-lg p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200"
          >
            <button
              onClick={handleCloseImportModal}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>

            <div>
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-1.5">
                <Upload className="w-5 h-5 text-primary" />
                Importar Parceiros
              </h2>
              <p className="text-xs text-text-secondary mt-1">
                Campanha: <span className="font-semibold text-text-primary">{selectedCampaignForImport.name}</span>
              </p>
            </div>

            {importResult ? (
              // STEP 2: SUMMARY / RESUMO SCREEN
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center gap-2">
                  <CheckCircle className="w-12 h-12 text-emerald-500" />
                  <h3 className="font-bold text-lg text-text-primary">Processo Concluído</h3>
                  <p className="text-sm font-semibold text-text-secondary max-w-sm mt-1">
                    {importResult.imported} parceiros importados, {importResult.notFound} não encontrados
                  </p>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleCloseImportModal}
                    className="px-5 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              // STEP 1: PARSE AND IMPORT FORM
              <form onSubmit={handleImportPartners} className="space-y-4">
                {importError && (
                  <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger flex items-start gap-2 text-xs">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}

                <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg text-xs leading-relaxed text-text-secondary space-y-1">
                  <p className="font-bold text-text-primary mb-1">Como funciona a importação:</p>
                  <p>• Cole a lista de <span className="font-semibold text-text-primary">accountancy_ids</span> (ID da contabilidade).</p>
                  <p>• Pode separar as entradas por vírgula, ponto e vírgula ou uma por linha.</p>
                  <p>• O sistema buscará o id do parceiro e clonará seu gerente_id no registro da campanha.</p>
                  <p>• Registros duplicados na mesma campanha serão desconsiderados automaticamente.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-primary">Lista de accountancy_ids</label>
                  <textarea
                    required
                    disabled={isImporting}
                    value={partnerIdsText}
                    onChange={(e) => setPartnerIdsText(e.target.value)}
                    placeholder="Cole os IDs aqui..."
                    rows={8}
                    className="w-full p-3 border border-border rounded-lg text-sm font-mono bg-surface text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={handleCloseImportModal}
                    className="px-4 py-2 bg-surface hover:bg-surface/80 border border-border text-text-primary font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isImporting || !partnerIdsText.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      'Confirmar'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
