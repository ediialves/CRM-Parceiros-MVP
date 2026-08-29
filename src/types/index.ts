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
  id: string;
  accountancy_id?: string;
  salesforce_id?: string | null;
  nome: string;
  gerente: string;
  nivel: string;
  perfil_parceiro: string;
  perfil_servico: string;
  fila: 'RETENÇÃO' | 'EXPANSÃO';
  licencas: number;
  licencas_engajadas: number;
  estoque: number;
  percentual_engajamento: number;
  gerente_id?: string;
  id_banco?: string;
  cnpjs?: number;
  cnpjs_livres?: number;
  contas_potencial?: number;
  ratio?: number;
  segmento?: string;
  atribuidas?: number;
  percentual_atribuidas?: number;
}

export interface Plan {
  id: string;
  partner_id: string;
  titulo: string;
  contexto?: string;
  resultado?: string;
  ativo: boolean;
  created_at: string;
  playbook_id?: string | null;
  status_conclusao?: 'sucesso' | 'sem_sucesso' | null;
  concluido_em?: string | null;
  concluido_por?: string | null;
  motivo_insucesso?: string | null;
}

export interface Task {
  id: string;
  plan_id: string;
  titulo: string;
  status: 'backlog' | 'agenda' | 'em_andamento' | 'concluida';
  responsavel: 'gerente' | 'camisa_10' | 'parceiro' | 'outros';
  observacao?: string;
  data_conclusao_prevista?: string | null;
  data_conclusao_original?: string | null;
  deletada_em?: string | null;
  created_at: string;
}

export interface NewMrrSale {
  accountancy_id: string;
  data_venda: string; // DATE ISO (yyyy-mm-dd)
  valor_new_mrr: number;
  produto: string | null;
  canal: string | null;
}

export interface ImportLog {
  id: string;
  tipo: string;
  arquivo_nome: string;
  importado_por: string;
  created_at: string;
}

export interface AccountPlanning {
  id: string;
  gerente_id: string;
  partner_id?: string | null;
  partner_externo_id?: string | null;
  partner_externo_nome?: string | null;
  partner_externo_contas_potencial?: number | null;
  semana: string; // DATE ISO
  tipo_plano: 'Engajar' | 'Substituir' | 'Vender';
  objetivo: string;
  contas_potencial?: number | null;
  meta: number;
  status: 'Backlog' | 'Fazendo' | 'Pausado' | 'Feito' | 'Cancelado';
  resultado?: number | null;
  created_at?: string;
  updated_at?: string;
  // joins
  partners?: { nome: string; accountancy_id: string; contas_potencial?: number | null } | null;
  users?: { nome: string } | null;
}

export interface Playbook {
  id: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
}

export interface PlaybookTask {
  id: string;
  playbook_id: string;
  titulo: string;
  responsavel: 'gerente' | 'camisa_10' | 'parceiro' | 'outros';
  ordem: number;
}

