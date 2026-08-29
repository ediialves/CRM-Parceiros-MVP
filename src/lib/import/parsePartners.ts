import * as XLSX from 'xlsx';

// Diagnóstico por aba usado como "rede de proteção" da importação: permite
// enxergar todas as abas com o mesmo formato (inclusive ocultas) e comparar
// quantidade de parceiros antes de confirmar a importação.
export interface SheetDiagnostics {
  name: string;
  hidden: 0 | 1 | 2; // 0 = visível, 1 = oculta, 2 = muito oculta (veryHidden)
  schemaOk: boolean;
  uniquePartners: number;
  sumLicencas: number;
}

export interface ImportDiagnostics {
  selectedSheet: string;
  sheets: SheetDiagnostics[];
  warnings: string[];
}

export interface ParsePartnersResult {
  data: any[];
  errors: string[];
  diagnostics: ImportDiagnostics;
}

// Nome amigável da aba (o nome real na planilha vem truncado em 31 chars pelo Excel).
const TARGET_SHEET_DISPLAY_NAME = 'Extração - Base final diagnóstico';

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

// Detecta se a aba tem o schema esperado pelo parser, comparando o texto do
// cabeçalho (linha 1) nas posições-chave usadas na leitura: A (nk_accountancy_id),
// K (total_customers) e AF (engajadas). Confere por texto, não só por posição.
function hasExpectedSchema(rows: any[][]): boolean {
  const header = rows[0];
  if (!header) return false;
  const cell = (col: string) => String(header[colLetterToIndex(col)] ?? '').trim().toLowerCase();
  return (
    cell('A') === 'nk_accountancy_id' &&
    cell('K') === 'total_customers' &&
    cell('AF') === 'engajadas'
  );
}

// Contagem de parceiros únicos e soma de licenças de uma aba, reaproveitando a
// mesma lógica de dedup (coluna A, keep-first) e de números do parser principal,
// para que os números batam com o que seria efetivamente importado.
function computeSheetStats(rows: any[][]): { uniquePartners: number; sumLicencas: number } {
  const seen = new Set<string>();
  let uniquePartners = 0;
  let sumLicencas = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const id = row[colLetterToIndex('A')];
    const nome = row[colLetterToIndex('B')];
    if (id === undefined || id === null || String(id).trim() === '') continue;
    if (nome === undefined || nome === null || String(nome).trim() === '') continue;

    const parsedId = String(id).trim();
    if (seen.has(parsedId)) continue;
    seen.add(parsedId);

    uniquePartners++;
    sumLicencas += Math.max(0, Math.round(parseNumber(row[colLetterToIndex('K')])));
  }

  return { uniquePartners, sumLicencas };
}

export const parsePartnersExcel = (file: File): Promise<ParsePartnersResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // XLSX.read já popula workbook.Workbook.Sheets (metadados de visibilidade
        // por aba) por padrão para arquivos .xlsx — não é preciso opção extra.
        const workbook = XLSX.read(data, { type: 'binary' });

        // Metadados de visibilidade das abas (array alinhado por índice com SheetNames).
        // Hidden: 0 = visível, 1 = oculta, 2 = muito oculta (veryHidden).
        const wbSheetsMeta = workbook.Workbook?.Sheets;
        const getHidden = (idx: number): 0 | 1 | 2 =>
          (wbSheetsMeta?.[idx]?.Hidden ?? 0) as 0 | 1 | 2;

        // 1. Ler exclusivamente a aba de nome "Extração  - Base final diagnóst",
        //    mas apenas se ela estiver VISÍVEL. Uma aba antiga/oculta com o mesmo
        //    nome (após o truncamento de 31 chars do Excel) não deve ser lida em
        //    silêncio — foi exatamente esse o incidente que congelou o dashboard.
        const targetSheetName = "Extração  - Base final diagnóst";
        const norm = (s: string) => s.trim().toLowerCase();
        const targetNorm = norm(targetSheetName);

        const matchingSheets = workbook.SheetNames
          .map((name, idx) => ({ name, idx, hidden: getHidden(idx) }))
          .filter(o => norm(o.name) === targetNorm);

        if (matchingSheets.length === 0) {
          reject(new Error(`Aba '${targetSheetName}' não encontrada no arquivo.`));
          return;
        }

        const visibleMatch = matchingSheets.find(o => o.hidden === 0);
        if (!visibleMatch) {
          // O nome-alvo existe apenas como aba oculta/muito oculta: falha segura.
          reject(new Error(
            `A aba '${TARGET_SHEET_DISPLAY_NAME}' está oculta na planilha. ` +
            `Reexiba-a (ou remova cópias antigas) e importe de novo.`
          ));
          return;
        }

        const sheetName = visibleMatch.name;
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

        // 3. Diagnóstico por aba (rede de proteção): varre TODAS as abas, detecta
        //    quais têm o schema esperado e compara a contagem de parceiros com a
        //    aba efetivamente importada.
        const sheetsDiag: SheetDiagnostics[] = workbook.SheetNames.map((name, idx) => {
          const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }) as any[][];
          const schemaOk = hasExpectedSchema(sheetRows);
          const stats = schemaOk ? computeSheetStats(sheetRows) : { uniquePartners: 0, sumLicencas: 0 };
          return {
            name,
            hidden: getHidden(idx),
            schemaOk,
            uniquePartners: stats.uniquePartners,
            sumLicencas: stats.sumLicencas,
          };
        });

        const selectedDiag = sheetsDiag.find(s => s.name === sheetName);
        const importedCount = selectedDiag?.uniquePartners ?? partners.length;

        const warnings: string[] = [];
        for (const s of sheetsDiag) {
          if (s.name === sheetName || !s.schemaOk) continue;

          if (s.uniquePartners > importedCount) {
            // Outra aba com o mesmo formato tem MAIS parceiros que a importada.
            warnings.push(
              `Atenção: a aba '${s.name}'${s.hidden ? ' (oculta)' : ''} tem ${s.uniquePartners} parceiros, ` +
              `mais que a aba importada '${TARGET_SHEET_DISPLAY_NAME}' (${importedCount}). ` +
              `Confirme se está importando a aba certa.`
            );
          } else if (s.hidden) {
            // Aba oculta com o mesmo schema (mas não com mais parceiros): possível cópia antiga.
            warnings.push(
              `Atenção: existe uma aba oculta com o mesmo formato ('${s.name}', ${s.uniquePartners} parceiros). ` +
              `Verifique se não é uma cópia antiga antes de importar.`
            );
          }
        }

        const diagnostics: ImportDiagnostics = {
          selectedSheet: sheetName,
          sheets: sheetsDiag,
          warnings,
        };

        resolve({ data: partners, errors, diagnostics });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsBinaryString(file);
  });
};
