import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Playbook } from '../../types';
import { X, Loader2, CheckCircle } from 'lucide-react';

interface AddPlaybookModalProps {
  partnerId: string; // O UUID do parceiro (id_banco)
  partnerName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AddPlaybookModal: React.FC<AddPlaybookModalProps> = ({
  partnerId,
  partnerName,
  onClose,
  onSuccess,
}) => {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<string>('');
  const [loadingPlaybooks, setLoadingPlaybooks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlaybooks = async () => {
      try {
        setLoadingPlaybooks(true);
        setErrorMsg(null);
        const { data, error } = await supabase
          .from('playbooks')
          .select('*')
          .eq('ativo', true)
          .order('nome', { ascending: true });

        if (error) throw error;
        setPlaybooks(data || []);
        if (data && data.length > 0) {
          setSelectedPlaybookId(data[0].id);
        }
      } catch (err: any) {
        console.error('Erro ao carregar playbooks:', err);
        setErrorMsg('Não foi possível carregar os playbooks.');
      } finally {
        setLoadingPlaybooks(false);
      }
    };

    fetchPlaybooks();
  }, []);

  const handleAddPlaybook = async () => {
    if (!selectedPlaybookId) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // 1. Verificar se o playbook já está ativo para este parceiro
      const { data: existingPlans, error: checkError } = await supabase
        .from('plans')
        .select('id')
        .eq('partner_id', partnerId)
        .eq('playbook_id', selectedPlaybookId)
        .eq('ativo', true);

      if (checkError) throw checkError;

      if (existingPlans && existingPlans.length > 0) {
        setErrorMsg('Esse playbook já está em execução para esse parceiro');
        setIsSubmitting(false);
        return;
      }

      // 2. Buscar tarefas do template para esse playbook
      const { data: templateTasks, error: tasksFetchError } = await supabase
        .from('playbook_tasks')
        .select('*')
        .eq('playbook_id', selectedPlaybookId)
        .order('ordem', { ascending: true });

      if (tasksFetchError) throw tasksFetchError;

      const selectedPlaybook = playbooks.find(p => p.id === selectedPlaybookId);
      if (!selectedPlaybook) {
        throw new Error('Playbook selecionado não encontrado');
      }

      // 3. String de hoje com salvaguarda de fuso horário
      const todayStr = new Date(new Date().toLocaleDateString('en-CA') + 'T12:00:00').toISOString();

      // 4. Inserir o plano
      const { data: newPlan, error: planInsertError } = await supabase
        .from('plans')
        .insert({
          partner_id: partnerId,
          titulo: selectedPlaybook.nome,
          playbook_id: selectedPlaybookId,
          data_inicio: todayStr,
          ativo: true,
          contexto: null,
          resultado: null
        })
        .select()
        .single();

      if (planInsertError) throw planInsertError;

      // 5. Inserir tarefas para esse plano (se houver)
      if (templateTasks && templateTasks.length > 0 && newPlan) {
        const tasksToInsert = templateTasks.map(t => ({
          plan_id: newPlan.id,
          titulo: t.titulo,
          responsavel: t.responsavel,
          status: 'backlog',
          created_at: new Date().toISOString(),
          data_conclusao_prevista: null,
          data_conclusao_original: null,
          deletada_em: null,
          ordem: t.ordem
        }));

        const { error: tasksInsertError } = await supabase
          .from('tasks')
          .insert(tasksToInsert);

        if (tasksInsertError) throw tasksInsertError;
      }

      setSuccessMsg('Playbook aplicado com sucesso!');
      
      // Despacha o evento global para atualizar o dashboard e outros ouvintes
      window.dispatchEvent(new CustomEvent('plan-created'));
      
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);

    } catch (err: any) {
      console.error('Erro ao aplicar playbook:', err);
      setErrorMsg(err.message || 'Erro ao aplicar o playbook ao parceiro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-surface rounded-xl border border-border shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-surface">
          <h3 className="font-bold text-text-primary text-base">Aplicar Playbook</h3>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg text-text-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto bg-surface">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">
              Parceiro
            </label>
            <div className="text-sm font-medium text-text-primary bg-gray-50 p-3 rounded-lg border border-border">
              {partnerName}
            </div>
          </div>

          {loadingPlaybooks ? (
            <div className="py-6 flex flex-col items-center justify-center text-text-secondary bg-surface">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
              <p className="text-xs">Buscando playbooks disponíveis...</p>
            </div>
          ) : errorMsg && !playbooks.length ? (
            <div className="p-3 bg-danger/5 border border-danger/10 text-danger text-xs rounded-lg bg-surface">
              {errorMsg}
            </div>
          ) : (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-text-secondary font-semibold block mb-1">
                Selecione o Playbook
              </label>
              {playbooks.length === 0 ? (
                <div className="text-xs text-text-secondary italic">
                  Nenhum playbook ativo encontrado.
                </div>
              ) : (
                <select
                  value={selectedPlaybookId}
                  onChange={(e) => {
                    setSelectedPlaybookId(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full text-sm p-3 bg-surface border border-border rounded-lg text-text-primary focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all cursor-pointer"
                  disabled={isSubmitting || !!successMsg}
                >
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {errorMsg && playbooks.length > 0 && (
            <div className="p-3 bg-danger/5 border border-danger/10 text-danger text-xs rounded-lg font-medium">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg font-medium flex items-center gap-2">
              <CheckCircle size={16} />
              {successMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-2 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-gray-100 text-text-secondary transition-colors cursor-pointer"
            disabled={isSubmitting || !!successMsg}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAddPlaybook}
            disabled={isSubmitting || !selectedPlaybookId || !!successMsg}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Aplicando...
              </>
            ) : (
              'Aplicar Playbook'
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
