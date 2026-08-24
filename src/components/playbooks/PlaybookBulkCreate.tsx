import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Playbook, PlaybookTask } from '../../types';
import { Button } from '../ui/Button';
import { Clipboard, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react';

interface PlaybookBulkCreateProps {
  playbooks: Playbook[];
  allTasks: PlaybookTask[];
}

interface ValidPartner {
  id: string;
  accountancy_id: string;
  nome: string;
}

export const PlaybookBulkCreate: React.FC<PlaybookBulkCreateProps> = ({
  playbooks,
  allTasks,
}) => {
  const [rawIds, setRawIds] = useState('');
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showMissingDetails, setShowMissingDetails] = useState(false);

  // Validation results
  const [foundPartners, setFoundPartners] = useState<ValidPartner[]>([]);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [parsedCount, setParsedCount] = useState(0);

  // Execution Result
  const [creationResult, setCreationResult] = useState<{
    successCount: number;
    errorMsg?: string | null;
  } | null>(null);

  // List of active playbooks
  const activePlaybooks = playbooks.filter(p => p.ativo);

  const handleValidate = async () => {
    if (!rawIds.trim() || !selectedPlaybookId) return;

    try {
      setIsChecking(true);
      setIsValidated(false);
      setCreationResult(null);

      // Parse the input: split by line breaks or commas
      const rawTokens = rawIds.split(/[\n,]+/);
      const cleanIds: string[] = Array.from(
        new Set(
          rawTokens
            .map(id => id.trim())
            .filter(id => id !== '')
        )
      );

      setParsedCount(cleanIds.length);

      if (cleanIds.length === 0) {
        setFoundPartners([]);
        setMissingIds([]);
        setIsValidated(true);
        return;
      }

      // Query database for all matching partners by accountancy_id
      const { data: partners, error } = await supabase
        .from('partners')
        .select('id, accountancy_id, nome')
        .in('accountancy_id', cleanIds);

      if (error) throw error;

      const foundList: ValidPartner[] = (partners || []).map((p: any) => ({
        id: p.id,
        accountancy_id: String(p.accountancy_id || ''),
        nome: p.nome || 'Parceiro sem nome'
      }));

      // Find which IDs were not found
      const foundIdsSet = new Set(foundList.map(p => p.accountancy_id.toLowerCase()));
      const missingList = cleanIds.filter(id => !foundIdsSet.has(id.toLowerCase()));

      setFoundPartners(foundList);
      setMissingIds(missingList);
      setIsValidated(true);
    } catch (err) {
      console.error('Erro na validação de parceiros em lote:', err);
      alert('Ocorreu um erro ao validar os IDs informados.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (foundPartners.length === 0 || !selectedPlaybookId) return;

    const selectedPlaybook = playbooks.find(p => p.id === selectedPlaybookId);
    if (!selectedPlaybook) return;

    const playbookTasks = allTasks
      .filter(t => t.playbook_id === selectedPlaybookId)
      .sort((a, b) => a.ordem - b.ordem);

    try {
      setIsCreating(true);
      let successCount = 0;

      // Sequential insertion to prevent connection overload and ensure order/safety
      for (const partner of foundPartners) {
        // Today string with timezone safeguard
        const todayStr = new Date(new Date().toLocaleDateString('en-CA') + 'T12:00:00').toISOString();

        // 1. Insert plan
        const { data: plan, error: planError } = await supabase
          .from('plans')
          .insert({
            partner_id: partner.id,
            titulo: selectedPlaybook.nome,
            ativo: true,
            data_inicio: todayStr,
            contexto: null,
            resultado: null,
            playbook_id: selectedPlaybookId
          })
          .select()
          .single();

        if (planError) {
          console.error(`Erro ao criar plano para parceiro ${partner.accountancy_id}:`, planError);
          continue;
        }

        // 2. Insert tasks for this plan
        if (playbookTasks.length > 0 && plan) {
          const tasksToInsert = playbookTasks.map(t => ({
            plan_id: plan.id,
            titulo: t.titulo,
            responsavel: t.responsavel,
            status: 'backlog',
            created_at: new Date().toISOString(),
            data_conclusao_prevista: null,
            data_conclusao_original: null,
            deletada_em: null,
            ordem: t.ordem
          }));

          const { error: tasksError } = await supabase
            .from('tasks')
            .insert(tasksToInsert);

          if (tasksError) {
            console.error(`Erro ao criar tarefas do playbook para plano ${plan.id}:`, tasksError);
          }
        }

        successCount++;
      }

      setCreationResult({
        successCount,
        errorMsg: successCount < foundPartners.length ? 'Alguns planos não puderam ser criados.' : null,
      });

      // Clear fields on success
      setRawIds('');
      setSelectedPlaybookId('');
      setIsValidated(false);
    } catch (err: any) {
      console.error('Erro na criação em lote dos planos:', err);
      setCreationResult({
        successCount: 0,
        errorMsg: err.message || 'Erro inesperado na criação.',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleReset = () => {
    setRawIds('');
    setSelectedPlaybookId('');
    setIsValidated(false);
    setFoundPartners([]);
    setMissingIds([]);
    setCreationResult(null);
  };

  const selectedPlaybookObj = playbooks.find(p => p.id === selectedPlaybookId);
  const selectedTasksCount = allTasks.filter(t => t.playbook_id === selectedPlaybookId).length;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6 mt-10" id="playbook-bulk-create-section">
      <div className="border-b border-border border-opacity-40 pb-4">
        <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
          <Clipboard className="h-5 w-5 text-indigo-500" /> Geração em Lote de Planos por Playbook
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Gere planos e suas tarefas automaticamente para vários parceiros ao mesmo tempo colando os IDs de sistema (Accountancy ID).
        </p>
      </div>

      {creationResult && (
        <div
          className={`p-4 rounded-xl border flex flex-col gap-2 ${
            creationResult.errorMsg
              ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
              : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
          }`}
          id="bulk-creation-result-box"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-bold text-sm">Geração Concluída!</span>
          </div>
          <p className="text-xs">
            Foram criados <strong>{creationResult.successCount}</strong> planos com sucesso.
          </p>
          {missingIds.length > 0 && (
            <p className="text-xs italic">
              Nota: {missingIds.length} IDs não foram encontrados no banco e foram ignorados.
            </p>
          )}
          <button
            onClick={handleReset}
            className="mt-2 self-start text-xs font-bold underline cursor-pointer"
          >
            Fazer Nova Geração
          </button>
        </div>
      )}

      {!creationResult && !isValidated && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="bulk-inputs-container">
          {/* Field 1: IDs Textarea */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-primary flex items-center justify-between">
              <span>IDs dos Parceiros (Accountancy ID) <span className="text-rose-500">*</span></span>
              <span className="text-xs font-normal text-text-secondary">(Um por linha ou separado por vírgula)</span>
            </label>
            <textarea
              rows={6}
              value={rawIds}
              onChange={(e) => setRawIds(e.target.value)}
              className="w-full p-3 rounded-lg border border-border bg-card text-text-primary focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-xs font-mono"
              placeholder="Ex:&#10;11452&#10;10998, 12001, 13421&#10;14502"
              id="bulk-textarea-ids"
            />
          </div>

          {/* Field 2: Selection of Playbook and action */}
          <div className="flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-text-primary">
                Selecione o Playbook <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedPlaybookId}
                onChange={(e) => setSelectedPlaybookId(e.target.value)}
                className="w-full p-3 rounded-lg border border-border bg-card text-text-primary focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-sm"
                id="bulk-select-playbook"
              >
                <option value="">-- Selecione um Playbook Ativo --</option>
                {activePlaybooks.map(pb => (
                  <option key={pb.id} value={pb.id}>
                    {pb.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-4 border-t border-border border-opacity-30">
              <Button
                type="button"
                onClick={handleValidate}
                disabled={isChecking || !rawIds.trim() || !selectedPlaybookId}
                className="w-full flex items-center justify-center gap-2"
                id="btn-bulk-validate"
              >
                {isChecking ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validando IDs...
                  </>
                ) : (
                  'Validar e Ver Prévia'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Result Preview Box */}
      {isValidated && !creationResult && (
        <div className="space-y-5 bg-bg-secondary/10 p-5 rounded-xl border border-border" id="bulk-preview-box">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
              Prévia da Geração em Lote
            </h3>
            <button
              onClick={handleReset}
              className="text-xs text-indigo-500 hover:underline flex items-center gap-1 cursor-pointer"
              id="btn-bulk-back"
            >
              <RefreshCw size={12} /> Alterar Dados
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 p-3.5 bg-card border border-border rounded-lg shadow-sm">
              <span className="text-text-secondary font-medium block">Playbook Escolhido:</span>
              <span className="text-sm font-bold text-text-primary block">
                {selectedPlaybookObj?.nome}
              </span>
              <span className="text-text-secondary block">
                Esse playbook gerará <strong className="text-indigo-500">{selectedTasksCount} tasks</strong> automáticas em cada plano.
              </span>
            </div>

            <div className="space-y-1.5 p-3.5 bg-card border border-border rounded-lg shadow-sm">
              <span className="text-text-secondary font-medium block">Resumo dos Parceiros:</span>
              <div className="flex flex-wrap gap-4 mt-1">
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  ✓ {foundPartners.length} válidos
                </span>
                <span className="text-sm font-bold text-rose-500">
                  ✗ {missingIds.length} não encontrados
                </span>
              </div>
            </div>
          </div>

          {/* Collapsible Missing IDs Area */}
          {missingIds.length > 0 && (
            <div className="border border-rose-500/20 rounded-lg overflow-hidden bg-rose-500/5" id="bulk-missing-ids-accordion">
              <button
                type="button"
                onClick={() => setShowMissingDetails(!showMissingDetails)}
                className="w-full flex items-center justify-between p-3 text-left text-xs font-bold text-rose-600 dark:text-rose-400 focus:outline-none cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={14} /> Ver {missingIds.length} IDs não cadastrados no sistema
                </span>
                {showMissingDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showMissingDetails && (
                <div className="px-3 pb-3 border-t border-rose-500/10 pt-2 text-xs text-text-secondary max-h-36 overflow-y-auto">
                  <p className="mb-2 italic">Estes IDs não correspondem a nenhum parceiro no banco de dados e serão desconsiderados na criação:</p>
                  <div className="flex flex-wrap gap-1.5 font-mono">
                    {missingIds.map((id, index) => (
                      <span key={index} className="bg-rose-500/10 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded border border-rose-500/10">
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Validated Partners List Preview */}
          {foundPartners.length > 0 ? (
            <div className="space-y-2">
              <span className="text-xs font-semibold text-text-primary block">Planos que serão gerados ({foundPartners.length}):</span>
              <div className="bg-card border border-border rounded-lg max-h-48 overflow-y-auto p-3 space-y-1.5" id="bulk-preview-valid-list">
                {foundPartners.map((partner) => (
                  <div key={partner.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0 border-opacity-40">
                    <span className="font-medium text-text-primary truncate max-w-[70%]">
                      {partner.nome}
                    </span>
                    <span className="text-text-secondary font-mono text-[10px] bg-bg-secondary/35 px-2 py-0.5 rounded">
                      ID: {partner.accountancy_id}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-5 text-center border border-dashed border-rose-500/20 bg-rose-500/5 text-rose-500 rounded-lg text-xs" id="bulk-no-valid-partners">
              Nenhum parceiro válido encontrado para os IDs fornecidos. Não é possível gerar os planos.
            </div>
          )}

          {/* Confirmation Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border border-opacity-30">
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              disabled={isCreating}
              className="text-xs"
              id="btn-bulk-cancel-confirm"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCreate}
              disabled={isCreating || foundPartners.length === 0}
              className="px-6 flex items-center gap-2"
              id="btn-bulk-execute-confirm"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando Planos...
                </>
              ) : (
                `Confirmar Criação de ${foundPartners.length} Planos`
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
