import { supabase } from './supabase';

/**
 * Busca paginada robusta contra o teto de linhas do PostgREST.
 *
 * O teto (`pgrst.db_max_rows`) hoje é 5000, mas isso é config de servidor e já
 * mudou antes (o padrão do PostgREST é 1000). Por isso o loop aqui NÃO assume o
 * tamanho da página: ele avança pelo número de linhas que realmente voltaram e só
 * para quando vem uma página vazia.
 *
 * O padrão antigo, espalhado por ~30 loops nas páginas, parava quando
 * `data.length < limit`. Isso é seguro só enquanto `limit` for MENOR ou igual ao
 * teto do servidor: com `limit` acima do teto, a primeira página já volta "curta"
 * e o loop encerra achando que acabou — truncando o resultado em silêncio. Como
 * aqui pedimos páginas grandes de propósito (menos round-trips), a condição de
 * parada precisa ser "veio vazio", não "veio curto".
 *
 * Custo: uma requisição extra no fim (a que volta vazia). Em troca, o número de
 * round-trips cai ~5x e o código fica correto para qualquer valor de db_max_rows.
 */
const PAGE_SIZE = 5000;

export const fetchAllPaginated = async (
  table: string,
  columns: string,
  applyExtra?: (q: any) => any
): Promise<any[]> => {
  const all: any[] = [];
  let from = 0;

  // Guarda contra loop infinito caso o servidor ignore o range e devolva sempre
  // as mesmas linhas. 200 páginas * 5000 = 1M de linhas, muito acima do volume real.
  for (let guard = 0; guard < 200; guard++) {
    let query = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (applyExtra) query = applyExtra(query);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data);
    from += data.length; // avança pelo que veio, não pelo que foi pedido
  }

  return all;
};

/**
 * Igual à anterior, mas para filtros `.in(coluna, ids)` com muitos ids.
 *
 * Dois limites diferentes se somam aqui: a URL do PostgREST tem tamanho máximo
 * (por isso os ids vão em blocos) e a resposta tem teto de linhas (por isso cada
 * bloco ainda é paginado). Os blocos são buscados em paralelo — são requisições
 * independentes, e serializá-las era boa parte do tempo de abertura das telas.
 */
export const fetchAllByIds = async (
  table: string,
  columns: string,
  idColumn: string,
  ids: string[],
  applyExtra?: (q: any) => any,
  chunkSize = 300
): Promise<any[]> => {
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const resultados = await Promise.all(
    chunks.map(chunk =>
      fetchAllPaginated(table, columns, q => {
        const comIn = q.in(idColumn, chunk);
        return applyExtra ? applyExtra(comIn) : comIn;
      })
    )
  );

  return resultados.flat();
};
