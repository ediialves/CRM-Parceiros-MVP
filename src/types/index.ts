/**
 * Interfaces para as entidades principais do sistema
 */

export interface User {
  id: string;
  nome: string;
  email: string;
  role: 'admin' | 'gerente';
  manager_external_id: string | null;
  invite_code: string | null;
  invite_used: boolean;
}

export interface Partner {
  id: string;                      // coluna E
  nome: string;                    // coluna F
  gerente: string;                 // coluna G
  nivel: string;                   // coluna H
  perfil_parceiro: string;         // coluna I
  perfil_servico: string;          // coluna J
  segmentacao: string;             // coluna K
  fila: 'RETENÇÃO' | 'EXPANSÃO';  // coluna D
  faixa_engajamento: string;       // coluna M
  licencas: number;                // coluna V
  licencas_engajadas: number;      // coluna W
  estoque: number;                 // coluna X
  penetracao: number;              // coluna Y
  percentual_engajamento: number;  // coluna Z
  mrr: number;                     // coluna AB
  exportacoes_90d: number;         // coluna AP
  gerente_id: string;               // ID do gerente para filtro de acesso
}

export interface Plan {
  id: string;
  partner_id: string;
  titulo: string;
  ativo: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  plan_id: string;
  titulo: string;
  status: 'backlog' | 'agenda' | 'em_andamento' | 'concluida';
  responsavel: 'gerente' | 'camisa_10' | 'parceiro' | 'outros';
  created_at: string;
}

export interface ImportLog {
  id: string;
  tipo: string;
  arquivo_nome: string;
  importado_por: string;
  created_at: string;
}
