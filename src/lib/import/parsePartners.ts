import * as XLSX from 'xlsx';
import { Partner } from '../../types';

export interface ParsePartnersResult {
  data: Partner[];
  errors: string[];
}

function parsePercentual(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'string') {
    const limpo = parseFloat(valor.replace('%', '').trim());
    return isNaN(limpo) ? 0 : Math.round(limpo);
  }
  if (typeof valor === 'number') {
    // decimal entre 0 e 1 → multiplicar por 100
    if (valor > 0 && valor <= 1) return Math.round(valor * 100);
    return Math.round(valor);
  }
  return 0;
}

export const parsePartnersExcel = (file: File): Promise<ParsePartnersResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // 1. Ler exclusivamente a aba de nome "DB segmentado"
        const sheetName = "DB segmentado";
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
          reject(new Error("Aba 'DB segmentado' não encontrada no arquivo."));
          return;
        }

        // 2. Ignorar linha de cabeçalho e ler a partir da linha 2 (header: 1 retorna array de arrays)
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        const partners: Partner[] = [];
        const errors: string[] = [];

        // Começar da linha 2 (índice 1)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Mapeamento de colunas (índices 0-based conforme solicitado)
          const fila = row[3]; // coluna D
          const id = row[4];   // coluna E
          const nome = row[5]; // coluna F
          
          // Validamenteções obrigatórias
          if (!id) {
            errors.push(`Linha ${i + 1}: ID (coluna E) vazio. Linha ignorada.`);
            continue;
          }
          if (!nome) {
            errors.push(`Linha ${i + 1}: Nome (coluna F) vazio. Linha ignorada.`);
            continue;
          }

          const partner: Partner = {
            fila: (fila === 'RETENÇÃO' || fila === 'EXPANSÃO' ? fila : 'EXPANSÃO') as 'RETENÇÃO' | 'EXPANSÃO',
            id: String(id),
            nome: String(nome),
            gerente: String(row[6] || ""),
            nivel: String(row[7] || ""),
            perfil_parceiro: String(row[8] || ""),
            perfil_servico: String(row[9] || ""),
            segmentacao: String(row[10] || ""),
            faixa_engajamento: String(row[12] || ""),
            licencas: Number(row[21] || 0),
            licencas_engajadas: Number(row[22] || 0),
            estoque: Number(row[23] || 0),
            penetracao: parsePercentual(row[24]),
            percentual_engajamento: parsePercentual(row[25]),
            mrr: Number(row[27] || 0),
            exportacoes_90d: Number(row[41] || 0),
            gerente_responsavel_id: "", // Deixar vazio por enquanto conforme solicitado
          };

          partners.push(partner);
        }

        resolve({ data: partners, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsBinaryString(file);
  });
};
