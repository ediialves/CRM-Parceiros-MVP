import React from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface ImportPreviewProps {
  data: any[];
  type: 'partners' | 'managers';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ImportPreview: React.FC<ImportPreviewProps> = ({ data, type, onConfirm, onCancel }) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (data.length === 0) return null;

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-primary">
          Preview dos Dados ({data.length} registros)
        </h3>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onConfirm}>Confirmar Importação</Button>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-background text-text-secondary uppercase text-[10px] font-bold tracking-wider">
              <tr>
                {Object.keys(data[0]).map(key => (
                  <th key={key} className="px-4 py-3 border-b border-border">{key}</th>
                ))}
                {type === 'managers' && <th className="px-4 py-3 border-b border-border">Invite Code</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-background/50 transition-colors">
                  {Object.values(row).map((val: any, i) => (
                    <td key={i} className="px-4 py-3 text-text-primary whitespace-nowrap">
                      {typeof val === 'number' && !String(val).includes('.') ? val : String(val)}
                    </td>
                  ))}
                  {type === 'managers' && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="bg-primary/5 text-primary px-2 py-0.5 rounded font-bold">{row.invite_code}</code>
                        <button 
                          onClick={() => handleCopy(row.invite_code, idx)}
                          className="text-text-secondary hover:text-primary transition-colors"
                        >
                          {copiedIndex === idx ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
