/**
 * Geração do código de convite do gerente.
 *
 * O código é a credencial de acesso: é com ele que a pessoa se cadastra em
 * `/cadastro`. Duas restrições vêm de fora e não podem mudar aqui sem mexer no
 * resto do fluxo:
 *
 * 1. **Maiúsculo.** `validate_invite_code(code)` compara `invite_code = code`
 *    com igualdade exata (case-sensitive) e o formulário de cadastro faz
 *    `.toUpperCase()` no que a pessoa digita. Um código gravado em minúsculo
 *    nunca seria resgatável.
 * 2. **Único.** `users.invite_code` tem UNIQUE (`users_invite_code_key`), então
 *    colisão vira erro 23505 — quem chama deve tentar outro código, não falhar.
 *
 * Usa `crypto.getRandomValues` em vez de `Math.random`: são 36^8 combinações,
 * mas isto é uma credencial de acesso e o gerador do `Math.random` é previsível.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const TAMANHO = 8;

export const gerarInviteCode = (): string => {
  const bytes = new Uint32Array(TAMANHO);
  crypto.getRandomValues(bytes);

  let codigo = '';
  for (let i = 0; i < TAMANHO; i++) {
    codigo += ALFABETO.charAt(bytes[i] % ALFABETO.length);
  }
  return codigo;
};
