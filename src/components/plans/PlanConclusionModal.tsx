import React, { useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';

export const MOTIVOS_INSUCESSO = [
  'Sem resposta',
  'Não quer seguir playbook',
  'Não é prioridade',
  'Playbook não aderente ao caso de uso',
  'Troca de camisa 10',
  'Insatisfeito com o produto',
  'Churn de licenças',
  'Churn total do parceiro',
  'Substituiu licença por outros produtos CA',
  'Outro',
] as const;

export type MotivoInsucesso = (typeof MOTIVOS_INSUCESSO)[number];

interface PlanConclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planTitle?: string;
  userId: string;
  onSuccess: () => void;
}

export const PlanConclusionModal: React.FC<PlanConclusionModalProps> = ({
  isOpen,
  onClose,
  planId,
  planTitle,
  userId,
  onSuccess,
}) => {
  const [statusChoice, setStatusChoice] = useState<'sucesso' | 'sem_sucesso' | null>(null);
  const [sucessoTexto, setSucessoTexto] = useState('');
  const [motivoInsucesso, setMotivoInsucesso] = useState<string>('');
  const [insucessoDescricao, setInsucessoDescricao] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSaving) return;
    setStatusChoice(null);
    setSucessoTexto('');
    setMotivoInsucesso('');
    setInsucessoDescricao('');
    setErrorMessage(null);
    onClose();
  };

  const isSucessoValid = statusChoice === 'sucesso' && sucessoTexto.trim().length >= 100;
  const isInsucessoValid =
    statusChoice === 'sem_sucesso' &&
    motivoInsucesso !== '' &&
    insucessoDescricao.trim().length >= 100;

  const canConfirm = isSucessoValid || isInsucessoValid;

  const handleConfirm = async () => {
    if (!canConfirm || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (statusChoice === 'sucesso') {
        const { error: planError } = await supabase
          .from('plans')
          .update({
            ativo: false,
            status_conclusao: 'sucesso',
            concluido_em: new Date().toISOString(),
            concluido_por: userId,
            resultado: sucessoTexto.trim(),
          })
          .eq('id', planId);

        if (planError) throw planError;

        const { error: taskError } = await supabase
          .from('tasks')
          .update({ status: 'concluida' })
          .eq('plan_id', planId)
          .is('deletada_em', null)
          .neq('status', 'concluida');

        if (taskError) throw taskError;
      } else if (statusChoice === 'sem_sucesso') {
        const { error: planError } = await supabase
          .from('plans')
          .update({
            ativo: false,
            status_conclusao: 'sem_sucesso',
            concluido_em: new Date().toISOString(),
            concluido_por: userId,
            motivo_insucesso: motivoInsucesso,
            resultado: insucessoDescricao.trim(),
          })
          .eq('id', planId);

        if (planError) throw planError;
      }

      onSuccess();
      handleClose();
    } catch (err: any) {
      console.error('Erro ao concluir plano:', err);
      setErrorMessage(err.message || 'Erro ao registrar a conclusão do plano.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
      id="modal-conclusao-plano"
    >
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-primary">Conclusão do Plano</h3>
            {planTitle && (
              <p className="text-xs text-text-secondary mt-0.5 truncate max-w-sm">
                {planTitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer p-1 rounded-lg hover:bg-gray-100"
            disabled={isSaving}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Escolha do Desfecho */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
              Como você avalia o desfecho deste plano? <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setStatusChoice('sucesso');
                  setErrorMessage(null);
                }}
                disabled={isSaving}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                  statusChoice === 'sucesso'
                    ? 'border-success bg-success/10 text-success shadow-xs'
                    : 'border-border bg-background-secondary/40 text-text-secondary hover:border-success/50 hover:bg-success/5'
                }`}
                id="btn-choice-sucesso"
              >
                <CheckCircle2 size={24} className={statusChoice === 'sucesso' ? 'text-success' : 'text-text-secondary'} />
                <span className="text-sm font-bold">Sucesso</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStatusChoice('sem_sucesso');
                  setErrorMessage(null);
                }}
                disabled={isSaving}
                className={`p-4 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                  statusChoice === 'sem_sucesso'
                    ? 'border-danger bg-danger/10 text-danger shadow-xs'
                    : 'border-border bg-background-secondary/40 text-text-secondary hover:border-danger/50 hover:bg-danger/5'
                }`}
                id="btn-choice-sem-sucesso"
              >
                <XCircle size={24} className={statusChoice === 'sem_sucesso' ? 'text-danger' : 'text-text-secondary'} />
                <span className="text-sm font-bold">Sem sucesso</span>
              </button>
            </div>
          </div>

          {/* Formulário Branch: Sucesso */}
          {statusChoice === 'sucesso' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  O que funcionou? <span className="text-danger">*</span>
                </label>
                <span
                  className={`text-[11px] font-semibold ${
                    sucessoTexto.trim().length >= 100 ? 'text-success' : 'text-text-secondary'
                  }`}
                >
                  {sucessoTexto.length}/100 mínimo
                </span>
              </div>
              <textarea
                autoFocus
                className="w-full p-3 text-sm border border-border rounded-xl outline-none focus:ring-2 focus:ring-success/30 focus:border-success h-32 resize-none bg-white transition-all"
                placeholder="Descreva detalhadamente o que funcionou, os aprendizados e os sucessos obtidos com a execução deste plano..."
                value={sucessoTexto}
                onChange={(e) => setSucessoTexto(e.target.value)}
                disabled={isSaving}
                id="input-sucesso-texto"
              />
              <p className="text-[11px] text-text-secondary">
                Ao confirmar com sucesso, todas as tasks pendentes deste plano serão marcadas como concluídas.
              </p>
            </div>
          )}

          {/* Formulário Branch: Sem Sucesso */}
          {statusChoice === 'sem_sucesso' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Select de Motivo */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary uppercase tracking-wider block">
                  Motivo <span className="text-danger">*</span>
                </label>
                <select
                  value={motivoInsucesso}
                  onChange={(e) => setMotivoInsucesso(e.target.value)}
                  disabled={isSaving}
                  className="w-full p-2.5 text-sm border border-border rounded-xl outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger bg-white transition-all cursor-pointer"
                  id="select-motivo-insucesso"
                >
                  <option value="">Selecione o motivo...</option>
                  {MOTIVOS_INSUCESSO.map((motivo) => (
                    <option key={motivo} value={motivo}>
                      {motivo}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descrição */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    Descrição <span className="text-danger">*</span>
                  </label>
                  <span
                    className={`text-[11px] font-semibold ${
                      insucessoDescricao.trim().length >= 100 ? 'text-success' : 'text-text-secondary'
                    }`}
                  >
                    {insucessoDescricao.length}/100 mínimo
                  </span>
                </div>
                <textarea
                  className="w-full p-3 text-sm border border-border rounded-xl outline-none focus:ring-2 focus:ring-danger/30 focus:border-danger h-32 resize-none bg-white transition-all"
                  placeholder="Descreva o que ocorreu, os obstáculos encontrados ou os motivos que impediram o avanço..."
                  value={insucessoDescricao}
                  onChange={(e) => setInsucessoDescricao(e.target.value)}
                  disabled={isSaving}
                  id="input-insucesso-descricao"
                />
              </div>
            </div>
          )}

          {/* Mensagem de Erro se houver */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-danger flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 bg-gray-50/50 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="flex-1 font-bold"
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className={`flex-1 font-bold ${
              statusChoice === 'sucesso'
                ? 'bg-success hover:bg-emerald-600 text-white'
                : statusChoice === 'sem_sucesso'
                ? 'bg-danger hover:bg-red-600 text-white'
                : 'bg-primary text-white'
            }`}
            disabled={!canConfirm || isSaving}
            id="btn-confirmar-conclusao-plano"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Concluindo...
              </span>
            ) : (
              'Confirmar'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
