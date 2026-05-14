import * as XLSX from 'xlsx';
import { Partner } from '../../types';

export interface ParsePartnersResult {
  data: Partner[];
  errors: string[];
}

function parseNumber(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = Number(valor);
  return isNaN(n) ? 0 : n;
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
        
        // 1. Ler exclusivamente a aba de nome "DB segmentado micro"
        const sheetName = "DB segmentado micro";
        const sheet = workbook.Sheets[sheetName];

        if (!sheet) {
          reject(new Error("Aba 'DB segmentado micro' não encontrada no arquivo."));
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

          // Mapeamento de colunas (índices 0-based conforme cabeçalho real da aba "DB segmentado micro")
          const id = row[4];   // coluna E (accountancy_id)
          const nome = row[5]; // coluna F
          const fila = row[1]; // coluna B
          
          // Validação obrigatória do ID (accountancy_id - Col E)
          if (!id) {
            errors.push(`Linha ${i + 1}: ID (coluna E) vazio. Linha ignorada.`);
            continue;
          }
          if (!nome) {
            errors.push(`Linha ${i + 1}: Nome (coluna F) vazio. Linha ignorada.`);
            continue;
          }

          const partner: Partner = {
            id: String(id),
            nome: String(nome),
            gerente: String(row[6] || ""),
            nivel: String(row[7] || ""),
            perfil_parceiro: String(row[8] || ""),
            perfil_servico: String(row[9] || ""),
            fila: row[1] === 'RETENÇÃO' ? 'RETENÇÃO' : 'EXPANSÃO',
            licencas: parseNumber(row[24]),
            licencas_engajadas: parseNumber(row[25]),
            estoque: parseNumber(row[19]),
            percentual_engajamento: parsePercentual(row[20]),
            cnpjs: parseNumber(row[23]),
            cnpjs_livres: parseNumber(row[22]),
            contas_potencial: parseNumber(row[18]),
            ratio: parseNumber(row[17]),
            plano: String(row[2] || ""),
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
