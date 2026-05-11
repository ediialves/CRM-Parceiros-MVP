import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileUpload } from '../components/import/FileUpload';
import { ImportPreview } from '../components/import/ImportPreview';
import { ImportLog } from '../components/import/ImportLog';
import { parsePartnersExcel } from '../lib/import/parsePartners';
import { parseManagersExcel } from '../lib/import/parseManagers';
import { ImportLog as ILog } from '../types';
import { ShieldAlert, Users, Target, CheckCircle2, XCircle } from 'lucide-react';
import { LoadingState } from '../components/ui/LoadingState';
import { supabase } from '../lib/supabase';

export const Importacao: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'partners' | 'managers'>('partners');
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [logs, setLogs] = useState<ILog[]>([]);
  const [currentFileName, setCurrentFileName] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  if (!isAdmin) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-16 h-16 bg-danger/10 flex items-center justify-center text-danger rounded-full">
          <ShieldAlert size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-primary">Acesso Negado</h2>
          <p className="text-text-secondary max-w-xs">
            Apenas administradores podem acessar o módulo de importação de dados.
          </p>
        </div>
      </div>
    );
  }

  const handleFileSelect = async (file: File) => {
    setImporting(true);
    setCurrentFileName(file.name);
    try {
      let data: any[] = [];
      if (activeTab === 'partners') {
        const result = await parsePartnersExcel(file);
        data = result.data;
        if (result.errors.length > 0) {
          console.warn('Avisos na importação de parceiros:', result.errors);
          alert(`Importação concluída com ${result.errors.length} avisos. Verifique o console para detalhes.`);
        }
      } else {
        const result = await parseManagersExcel(file);
        data = result.data;
        if (result.errors.length > 0) {
          console.warn('Avisos na importação de gerentes:', result.errors);
          alert(`Importação concluída com ${result.errors.length} avisos. Verifique o console para detalhes.`);
        }
      }
      
      console.log(`DEBUG [Importacao]: Setting previewData with ${data.length} items`);
      setPreviewData(data);
    } catch (err: any) {
      alert(err.message || 'Erro ao processar arquivo');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirm = async () => {
    setImporting(true);
    setMessage(null);
    
    try {
      if (activeTab === 'partners') {
        // Mapear dados para o formato do banco conforme solicitado
        const dataToUpsert = previewData.map(p => ({
          accountancy_id: p.id,
          nome: p.nome,
          gerente: p.gerente,
          gerente_id: null,
          nivel: p.nivel,
          perfil_parceiro: p.perfil_parceiro,
          perfil_servico: p.perfil_servico,
          segmentacao: p.segmentacao,
          fila: p.fila,
          faixa_engajamento: p.faixa_engajamento,
          licencas: p.licencas,
          licencas_engajadas: p.licencas_engajadas,
          estoque: p.estoque,
          penetracao: p.penetracao,
          percentual_engajamento: p.percentual_engajamento,
          mrr: p.mrr,
          exportacoes_90d: p.exportacoes_90d
        }));

        const deduplicated = Array.from(
          new Map(dataToUpsert.map(p => [p.accountancy_id, p])).values()
        );

        const { error: upsertError } = await supabase
          .from('partners')
          .upsert(deduplicated, { onConflict: 'accountancy_id' });

        if (upsertError) throw upsertError;

        // Registrar log de sucesso
        await supabase.from('import_logs').insert({
          user_id: user?.id,
          filename: currentFileName,
          status: 'sucesso',
          rows_count: deduplicated.length
        });

        setMessage({ 
          text: `${deduplicated.length} parceiros importados com sucesso`, 
          type: 'success' 
        });

        const newLog: ILog = {
          id: `log-${Date.now()}`,
          tipo: 'Parceiros/Métricas',
          arquivo_nome: currentFileName,
          importado_por: user?.nome || 'Admin',
          created_at: new Date().toISOString(),
        };
        
        setLogs(prev => [newLog, ...prev]);
        setPreviewData([]);
      } else {
        // Lógica para Gerentes
        let successCount = 0;
        const errors: string[] = [];

        for (const manager of previewData) {
          const { error } = await supabase
            .from('users')
            .insert({
              id: crypto.randomUUID(),
              email: manager.email,
              nome: manager.nome,
              role: 'gerente',
              invite_code: manager.invite_code,
              invite_used: false
            });

          if (error) {
            if (error.code === '23505') {
              errors.push(`Gerente ${manager.email} já existe.`);
            } else {
              errors.push(`Erro ao importar ${manager.email}: ${error.message}`);
            }
          } else {
            successCount++;
          }
        }

        // Registrar log
        await supabase.from('import_logs').insert({
          user_id: user?.id,
          filename: currentFileName,
          status: errors.length === previewData.length ? 'erro' : 'sucesso',
          rows_count: successCount
        });

        if (successCount > 0) {
          setMessage({ 
            text: `${successCount} gerentes importados com sucesso.${errors.length > 0 ? ` ${errors.length} erros ignorados.` : ''}`, 
            type: 'success' 
          });

          const newLog: ILog = {
            id: `log-${Date.now()}`,
            tipo: 'Gerentes/Convites',
            arquivo_nome: currentFileName,
            importado_por: user?.nome || 'Admin',
            created_at: new Date().toISOString(),
          };
          
          setLogs(prev => [newLog, ...prev]);
          setPreviewData([]);
        } else {
          setMessage({ 
            text: `Nenhum gerente importado. Erros: ${errors.join(', ')}`, 
            type: 'error' 
          });
        }
      }
    } catch (err: any) {
      console.error('Erro na importação:', err);
      
      // Registrar log de erro genérico se for erro de sistema
      await supabase.from('import_logs').insert({
        user_id: user?.id,
        filename: currentFileName,
        status: 'erro',
        rows_count: 0
      });

      setMessage({ 
        text: `Erro fatal ao importar: ${err.message || 'Erro desconhecido'}`, 
        type: 'error' 
      });
    } finally {
      setImporting(false);
    }
  };

  const handleCancel = () => {
    setPreviewData([]);
    setCurrentFileName('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-2xl font-bold text-primary">Importação de Dados</h1>
        <p className="text-text-secondary">Atualize a base de parceiros ou cadastre novos gerentes.</p>
      </header>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 animate-in slide-in-from-top-2 duration-300 ${
          message.type === 'success' ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <span className="font-medium">{message.text}</span>
          <button 
            onClick={() => setMessage(null)}
            className="ml-auto text-xs underline opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="flex bg-surface p-1 rounded-lg border border-border w-fit">
        <button 
          onClick={() => { setActiveTab('partners'); handleCancel(); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'partners' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-primary'}`}
        >
          <Target size={16} />
          Parceiros e Métricas
        </button>
        <button 
          onClick={() => { setActiveTab('managers'); handleCancel(); }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'managers' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-primary'}`}
        >
          <Users size={16} />
          Novos Gerentes
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          {importing ? (
            <div className="bg-surface p-12 rounded-xl border border-border">
              <LoadingState message="Lendo arquivo excel..." />
            </div>
          ) : previewData.length > 0 ? (
            <ImportPreview 
              data={previewData} 
              type={activeTab} 
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          ) : (
            <FileUpload 
              onFileSelect={handleFileSelect}
              title={activeTab === 'partners' ? "Upload de Parceiros" : "Upload de Gerentes"}
              description={
                activeTab === 'partners' 
                ? "Aba 'DB segmentado'. Colunas: D (Fila), E (ID), F (Nome), G (Gerente), H (Nível), etc."
                : "Colunas: nome, email. Códigos de convite serão gerados automaticamente."
              }
            />
          )}

          {activeTab === 'partners' && previewData.length === 0 && !importing && (
            <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
              <h4 className="text-sm font-bold text-primary mb-2 flex items-center gap-2">
                Dica de Formatação
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                Garanta que a coluna <strong>accountancy_id</strong> esteja presente e seja única por parceiro. 
                Os valores das métricas financeiras (MRR) devem ser numéricos simples, sem símbolos de moeda.
              </p>
            </div>
          )}
        </div>

        <div className="xl:col-span-1">
          <ImportLog logs={logs} />
        </div>
      </div>
    </div>
  );
};

export default Importacao;
