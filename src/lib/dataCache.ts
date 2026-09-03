/**
 * Cache de dados em memória, no escopo do módulo.
 *
 * O problema que isto resolve: nenhuma tela guardava dado fora do `useState` do
 * componente. Ao trocar de rota, o React Router desmonta a página, o estado morre
 * junto e voltar para ela refaz o fetch inteiro do zero — o "troco de tela e volto,
 * e volta o loading". Como o cache vive no módulo (e não na árvore de componentes),
 * ele sobrevive à desmontagem e a volta é instantânea.
 *
 * Escolha deliberada de não usar react-query: a troca resolveria isto e mais coisas,
 * mas exigiria reescrever o fetch de 8 páginas grandes de uma vez. Aqui cada página
 * só embrulha a função de busca que já tinha.
 *
 * O que este cache NÃO é: persistência. Ele morre no reload da aba, o que é o
 * comportamento desejado — dado do CRM muda com importação e edição, e ninguém quer
 * ver número velho depois de recarregar a página de propósito.
 */

interface Entrada<T> {
  valor?: T;
  expiraEm: number;
  /** Promessa em voo, para duas telas pedirem a mesma coisa sem duplicar a requisição. */
  emVoo?: Promise<T>;
}

const cache = new Map<string, Entrada<any>>();

/** 5 minutos: curto o bastante para não mostrar número velho, longo o bastante para cobrir navegação. */
export const TTL_PADRAO = 5 * 60 * 1000;

/**
 * Devolve o valor cacheado se ainda estiver válido; senão executa `buscar()`.
 *
 * Chamadas concorrentes com a mesma chave compartilham uma única requisição.
 */
export const buscarComCache = async <T>(
  chave: string,
  buscar: () => Promise<T>,
  ttl: number = TTL_PADRAO
): Promise<T> => {
  const agora = Date.now();
  const atual = cache.get(chave);

  if (atual) {
    if (atual.emVoo) return atual.emVoo as Promise<T>;
    if (atual.expiraEm > agora && 'valor' in atual) return atual.valor as T;
  }

  const emVoo = buscar()
    .then(valor => {
      cache.set(chave, { valor, expiraEm: Date.now() + ttl });
      return valor;
    })
    .catch(err => {
      // Erro não vira cache: a próxima tentativa tem que ir no banco de novo.
      cache.delete(chave);
      throw err;
    });

  cache.set(chave, { expiraEm: agora + ttl, emVoo });
  return emVoo;
};

/** Já existe valor válido para esta chave? Usado para não piscar "carregando" à toa. */
export const temCacheValido = (chave: string): boolean => {
  const e = cache.get(chave);
  return !!e && !e.emVoo && e.expiraEm > Date.now() && 'valor' in e;
};

/**
 * Invalida entradas do cache.
 *
 * Sem argumento limpa tudo (usar no logout, para o próximo usuário não ver dado do
 * anterior). Com prefixo, limpa só o que casa — use depois de gravar algo que muda
 * o que as telas mostram (importação, criação de plano, conclusão de task).
 */
export const invalidarCache = (prefixo?: string): void => {
  if (!prefixo) {
    cache.clear();
    return;
  }
  for (const chave of Array.from(cache.keys())) {
    if (chave.startsWith(prefixo)) cache.delete(chave);
  }
};
