import React from 'react';
import { Copy, Check, AlertTriangle, EyeOff } from 'lucide-react';
import { Button } from '../ui/Button';
import { ImportDiagnostics } from '../../lib/import/parsePartners';

interface ImportPreviewProps {
  data: any[];
  type: 'partners' | 'managers';
  diagnostics?: ImportDiagnostics | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ImportPreview: React.FC<ImportPreviewProps> = ({ data, type, diagnostics, onConfirm, onCancel }) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (data.length === 0) return null;

  const warnings = diagnostics?.warnings ?? [];
  // Abas com o mesmo formato do parser, para o resumo por aba (rede de proteção).
  const schemaSheets = diagnostics?.sheets.filter(s => s.schemaOk) ?? [];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {warnings.length > 0 && (
        <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 space-y-2">
          <div className="flex items-center gap-2 font-bold text-warning">
            <AlertTriangle size={18} />
            <span>Atenção antes de confirmar</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-text-primary">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {schemaSheets.length > 1 && (
        <div className="bg-surface rounded-lg border border-border p-3 text-xs">
          <p className="font-bold text-text-secondary uppercase tracking-wider mb-2">
            Abas com o mesmo formato encontradas
          </p>
          <ul className="space-y-1">
            {schemaSheets.map(s => {
              const isSelected = s.name === diagnostics?.selectedSheet;
              return (
                <li
                  key={s.name}
                  className={`flex items-center gap-2 ${isSelected ? 'font-bold text-primary' : 'text-text-secondary'}`}
                >
                  {s.hidden ? <EyeOff size={12} /> : <span className="w-3" />}
                  <span>{s.name}</span>
                  <span className="text-text-secondary">· {s.uniquePartners} parceiros · {s.sumLicencas} licenças</span>
                  {isSelected && <span className="text-success">(importando)</span>}
                  {s.hidden ? <span className="text-warning">(oculta)</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
