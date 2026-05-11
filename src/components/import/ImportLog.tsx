import React from 'react';
import { History, FileCheck } from 'lucide-react';
import { ImportLog as ILog } from '../../types';

interface ImportLogProps {
  logs: ILog[];
}

export const ImportLog: React.FC<ImportLogProps> = ({ logs }) => {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-xs">
      <div className="p-4 border-b border-border flex items-center gap-2 bg-background/50">
        <History size={18} className="text-text-secondary" />
        <h3 className="font-bold text-text-primary text-sm uppercase tracking-tight">Log de Importação (Sessão)</h3>
      </div>
      
      <div className="divide-y divide-border">
        {logs.length > 0 ? (
          [...logs].reverse().map((log) => (
            <div key={log.id} className="p-4 flex items-center justify-between hover:bg-background/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center text-success">
                  <FileCheck size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary leading-tight">{log.arquivo_nome}</p>
                  <p className="text-[10px] text-text-secondary">{log.tipo} • {new Date(log.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
              <span className="text-[10px] bg-background px-2 py-1 rounded text-text-secondary font-mono">
                BY: {log.importado_por}
              </span>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-text-secondary text-sm italic">
            Nenhuma atividade de importação nesta sessão.
          </div>
        )}
      </div>
    </div>
  );
};
