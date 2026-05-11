import { User } from '../../types';

export const mockAdmin: User = {
  id: 'admin-123',
  nome: 'Edivaldo Alves (Admin)',
  email: 'edivaldo.admin@contaazul.com',
  role: 'admin',
  manager_external_id: null,
  invite_code: null,
  invite_used: true,
};

export const mockGerente: User = {
  id: 'gerente-456',
  nome: 'Lucas Gerente',
  email: 'lucas.gerente@contaazul.com',
  role: 'gerente',
  manager_external_id: 'manager-ext-001',
  invite_code: 'INVITE123',
  invite_used: true,
};

// Trocar entre mockAdmin e mockGerente para testar os dois fluxos
export const currentUser = mockAdmin;
