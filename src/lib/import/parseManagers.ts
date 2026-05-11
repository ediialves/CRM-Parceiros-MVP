import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

const generateInviteCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

interface ParseResult {
  data: { nome: string; email: string; invite_code: string }[];
  errors: string[];
}

export const parseManagersExcel = (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];
        
        // Normalizar as chaves de cada linha para minúsculas
        const normalizedRows = rows.map(row => {
          const newRow: any = {};
          Object.keys(row).forEach(key => {
            newRow[key.toLowerCase()] = row[key];
          });
          return newRow;
        });

        if (normalizedRows.length > 0 && (!normalizedRows[0].nome || !normalizedRows[0].email)) {
          console.error('Colunas encontradas:', Object.keys(normalizedRows[0]));
          reject(new Error('Colunas "nome" e "email" são obrigatórias na planilha.'));
          return;
        }

        const managersData: { nome: string; email: string; invite_code: string }[] = [];
        const errors: string[] = [];

        for (const row of normalizedRows) {
          const email = row.email?.toString()?.trim()?.toLowerCase();
          const nome = row.nome?.toString()?.trim();

          if (!email || !nome) {
            errors.push(`Linha com dados incompletos ignorada.`);
            continue;
          }

          // Verificar duplicata no lote atual
          if (managersData.some(m => m.email === email)) {
            errors.push(`Gerente ${email} duplicado na planilha — ignorado.`);
            continue;
          }

          const inviteCode = generateInviteCode();
          managersData.push({ nome, email, invite_code: inviteCode });
        }

        resolve({
          data: managersData,
          errors
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
};
