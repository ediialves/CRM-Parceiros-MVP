import * as XLSX from 'xlsx';

export interface ParsePartnersResult {
  data: any[];
  errors: string[];
}

function parseNumber(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = Number(valor);
  return isNaN(n) ? 0 : n;
}

function parseNullableNumber(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return isNaN(n) ? null : n;
}

function parseDecimalPercent(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  
  if (typeof valor === 'string') {
    if (valor.includes('%')) {
      const limpo = parseFloat(valor.replace('%', '').trim());
      return isNaN(limpo) ? 0 : Math.round(limpo);
    }
    const parsed = parseFloat(valor);
    if (isNaN(parsed)) return 0;
    if (parsed > 0 && parsed <= 15) {
      return Math.round(parsed * 100);
    }
    return Math.round(parsed);
  }
  
  if (typeof valor === 'number') {
    if (valor > 0 && valor <= 15) {
      return Math.round(valor * 100);
    }
    return Math.round(valor);
  }
  
  return 0;
}

// Converte letra da coluna para índice 0-based (ex: 'A' -> 0, 'Z' -> 25, 'AA' -> 26)
function colLetterToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

export const parsePartnersExcel = (file: File): Promise<ParsePartnersResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // 1. Ler exclusivamente a aba de nome "Extração  - Base final diagnóst"
        const targetSheetName = "Extração  - Base final diagnóst";
        const sheetName = workbook.SheetNames.find(
          name => name.trim().toLowerCase() === targetSheetName.trim().toLowerCase()
        );

        if (!sheetName) {
          reject(new Error(`Aba '${targetSheetName}' não encontrada no arquivo.`));
          return;
        }

        const sheet = workbook.Sheets[sheetName];

        // 2. Ignorar linha de cabeçalho e ler a partir da linha 2 (header: 1 retorna array de arrays)
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        
        const partners: any[] = [];
        const errors: string[] = [];
        const seenIds = new Set<string>();

        // Começar da linha 2 (índice 1)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          // Validação obrigatória do ID (accountancy_id - Col A) e Nome (Col B)
          const id = row[colLetterToIndex('A')];
          const nome = row[colLetterToIndex('B')];
          
          if (id === undefined || id === null || String(id).trim() === '') {
            errors.push(`Linha ${i + 1}: ID (coluna A) vazio. Linha ignorada.`);
            continue;
          }
          if (nome === undefined || nome === null || String(nome).trim() === '') {
            errors.push(`Linha ${i + 1}: Nome (coluna B) vazio. Linha ignorada.`);
            continue;
          }

          const parsedId = String(id).trim();
          if (seenIds.has(parsedId)) {
            // Skip duplicates to prevent "ON CONFLICT DO UPDATE command cannot affect row a second time" error
            continue;
          }
          seenIds.add(parsedId);

          // usa_capro: texto "SIM" (case-insensitive, trim) -> true; "NÃO" ou vazio/null -> false
          const caproRaw = row[colLetterToIndex('BC')];
          const usaCapro = caproRaw ? String(caproRaw).trim().toLowerCase() === 'sim' : false;

          // fila: "RETENÇÃO" se o valor da coluna AX contiver ou for "RETENÇÃO", caso contrário "EXPANSÃO"
          const filaRaw = row[colLetterToIndex('AX')];
          const filaNormalized = String(filaRaw || '').trim().toUpperCase();
          const fila: 'RETENÇÃO' | 'EXPANSÃO' = (filaNormalized === 'RETENÇÃO' || filaNormalized === 'RETENCAO') ? 'RETENÇÃO' : 'EXPANSÃO';

          const partner = {
            id: parsedId,
            nome: String(nome).trim(),
            gerente: row[colLetterToIndex('C')] ? String(row[colLetterToIndex('C')]).trim() : null,
            nivel: row[colLetterToIndex('P')] ? String(row[colLetterToIndex('P')]).trim() : null,
            perfil_parceiro: row[colLetterToIndex('Q')] ? String(row[colLetterToIndex('Q')]).trim() : null,
            perfil_servico: row[colLetterToIndex('AV')] ? String(row[colLetterToIndex('AV')]).trim() : null,
            fila: fila,
            faixa_engajamento: row[colLetterToIndex('AQ')] ? String(row[colLetterToIndex('AQ')]).trim() : null,
            licencas: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('K')]))),
            licencas_engajadas: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('AF')]))),
            estoque: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('AG')]))),
            percentual_engajamento: Math.min(100, Math.max(0, parseDecimalPercent(row[colLetterToIndex('AH')]))),
            penetracao: Math.max(0, parseDecimalPercent(row[colLetterToIndex('AZ')])),
            exportacoes_90d: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('W')]))),
            cnpjs: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('BA')]))),
            cnpjs_livres: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('AU')]))),
            contas_potencial: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('BB')]))),
            ratio: parseNullableNumber(row[colLetterToIndex('AT')]),
            segmento: row[colLetterToIndex('AW')] ? String(row[colLetterToIndex('AW')]).trim() : null,
            atribuidas: Math.max(0, Math.round(parseNumber(row[colLetterToIndex('AI')]))),
            percentual_atribuidas: Math.max(0, parseDecimalPercent(row[colLetterToIndex('AY')])),
            usa_capro: usaCapro,
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
