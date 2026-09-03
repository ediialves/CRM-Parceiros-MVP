import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { LayoutGrid, Loader2, AlertTriangle, Columns2, Rows3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { CohortFilterBar, PlaybookOption } from '../components/cohorts/CohortFilterBar';
import { CohortTables } from '../components/cohorts/CohortTables';
import {
  CohortFilters,
  CohortRawData,
  computeCohortData,
  emptyCohortFilters,
} from '../lib/cohorts/computeCohorts';

/**
 * Dashboard de Coortes.
 *
 * Todas as tabelas de coorte saíram do Dashboard Gerencial V2 e vivem aqui, em
 * DUAS colunas independentes: cada coluna tem seu próprio conjunto de filtros e
 * suas próprias tabelas, para comparação lado a lado (o caso principal é
 * BAU x playbook oficial, mas serve para qualquer par de recortes).
 *
 * Diferença de escopo em relação ao V2: aqui não existe filtro de "existência de
 * plano" — a coorte é sempre construída a partir de planos. Em compensação existe
 * o filtro de playbooks oficiais/automáticos específicos.
 */

/** Busca paginada em lotes de 1000 (limite `pgrst.db_max_rows` do PostgREST). */
const fetchAllPaginated = async (
  table: string,
  columns: string,
  applyExtra?: (q: any) => any
): Promise<any[]> => {
  const all: any[] = [];
  const limit = 1000;
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + limit - 1);
    if (applyExtra) query = applyExtra(query);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < limit) break;
    from += limit;
  }

  return all;
};

export const DashboardCoortes: React.FC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [loadingData, setLoadingData] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rawData, setRawData] = useState<CohortRawData | null>(null);
  const [playbooksList, setPlaybooksList] = useState<PlaybookOption[]>([]);

  const [filtersA, setFiltersA] = useState<CohortFilters>(() => ({
    ...emptyCohortFilters(),
    origemPlaybook: 'playbooks_novos',
  }));
  const [filtersB, setFiltersB] = useState<CohortFilters>(() => ({
    ...emptyCohortFilters(),
    origemPlaybook: 'bau',
  }));

  const [layout, setLayout] = useState<'lado-a-lado' | 'empilhado'>('lado-a-lado');

  useEffect(() => {
    if (!user || !isAdmin) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoadingData(true);
        setErrorMsg(null);

        // RPC para contornar RLS na listagem de usuários.
        const { data: allUsers, error: usersErr } = await supabase.rpc('get_all_users_for_admin');
        if (usersErr) throw usersErr;

        const managersList = (allUsers || [])
          .filter((u: any) => u.role === 'gerente')
          .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));

        const [partners, basePlans, tasks, partnerSnapshots, playbooks] = await Promise.all([
          fetchAllPaginated('partners', 'id, gerente_id, gerente, segmento, fila', (q) => q.order('id', { ascending: true })),
          fetchAllPaginated('plans', 'id, ativo, status_conclusao, partner_id, created_at, playbook_id', (q) => q.order('id', { ascending: true })),
          fetchAllPaginated('tasks', 'id, status, deletada_em, plan_id', (q) => q.is('deletada_em', null).order('id', { ascending: true })),
          fetchAllPaginated('partner_snapshots', 'partner_id, imported_at, licencas, licencas_engajadas, plano'),
          supabase.from('playbooks').select('id, nome').order('nome', { ascending: true }).then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          }),
        ]);

        if (!isMounted) return;

        setPlaybooksList(playbooks as PlaybookOption[]);
        setRawData({ partners, basePlans, tasks, partnerSnapshots, managersList });
      } catch (err: any) {
        console.error('Erro ao carregar dados das coortes:', err);
        if (isMounted) setErrorMsg(err?.message || 'Erro desconhecido ao carregar os dados.');
      } finally {
        if (isMounted) setLoadingData(false);
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [user?.id, isAdmin]);

  const availablePlanos = useMemo(() => {
    if (!rawData) return [];
    const planos = rawData.partners.map((p: any) => p.segmento?.trim()).filter(Boolean);
    return Array.from(new Set<string>(planos)).sort();
  }, [rawData]);

  const availableGerentes = useMemo(() => {
    if (!rawData) return [];
    const gerentes = rawData.managersList.map((m: any) => m.nome).filter(Boolean);
    return Array.from(new Set<string>(gerentes)).sort();
  }, [rawData]);

  const dataA = useMemo(() => computeCohortData(rawData, filtersA), [rawData, filtersA]);
  const dataB = useMemo(() => computeCohortData(rawData, filtersB), [rawData, filtersB]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const columns: Array<{
    key: 'A' | 'B';
    title: string;
    accent: 'indigo' | 'amber';
    filters: CohortFilters;
    setFilters: (f: CohortFilters) => void;
    data: ReturnType<typeof computeCohortData>;
  }> = [
    { key: 'A', title: 'Coluna A', accent: 'indigo', filters: filtersA, setFilters: setFiltersA, data: dataA },
    { key: 'B', title: 'Coluna B', accent: 'amber', filters: filtersB, setFilters: setFiltersB, data: dataB },
  ];

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8">
      <style>{`
        .scroll-minimal::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .scroll-minimal::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.3);
          border-radius: 9999px;
        }
        .scroll-minimal::-webkit-scrollbar-thumb:hover {
          background-color: rgba(156, 163, 175, 0.5);
        }
        .scroll-minimal::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border border-opacity-50 pb-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
            <LayoutGrid className="h-6 w-6" id="dashboard-coortes-icon" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-primary" id="dashboard-coortes-title">
              Dashboard de Coortes
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Evolução das safras de planos por semana de entrada. Duas colunas independentes para comparar recortes lado a lado — por exemplo, playbook oficial x BAU.
            </p>
          </div>
        </div>

        <div className="flex items-center rounded-lg border border-border bg-card p-1 gap-1 shadow-sm shrink-0" id="segmented-layout-coortes">
          <button
            type="button"
            onClick={() => setLayout('lado-a-lado')}
            className={`inline-flex items-center gap-1.5 rounded-md py-1.5 px-3 text-xs font-semibold whitespace-nowrap transition-all ${
              layout === 'lado-a-lado'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
            }`}
            id="btn-layout-lado-a-lado"
          >
            <Columns2 className="h-3.5 w-3.5" />
            Lado a lado
          </button>
          <button
            type="button"
            onClick={() => setLayout('empilhado')}
            className={`inline-flex items-center gap-1.5 rounded-md py-1.5 px-3 text-xs font-semibold whitespace-nowrap transition-all ${
              layout === 'empilhado'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary/20'
            }`}
            id="btn-layout-empilhado"
          >
            <Rows3 className="h-3.5 w-3.5" />
            Empilhado
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 p-4" id="erro-coortes">
          <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Erro ao carregar os dados das coortes</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{errorMsg}</p>
          </div>
        </div>
      )}

      {loadingData ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-16 shadow-sm" id="loading-coortes">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-text-secondary">Carregando safras, snapshots e planos...</p>
        </div>
      ) : (
        <div
          className={
            layout === 'lado-a-lado'
              ? 'grid grid-cols-1 2xl:grid-cols-2 gap-6 items-start'
              : 'flex flex-col gap-10'
          }
          id="grid-colunas-coortes"
        >
          {columns.map((col) => (
            <div className="flex flex-col gap-6 min-w-0" key={col.key} id={`coluna-coorte-${col.key}`}>
              <CohortFilterBar
                title={col.title}
                accent={col.accent}
                filters={col.filters}
                onChange={col.setFilters}
                availablePlanos={availablePlanos}
                availableGerentes={availableGerentes}
                availablePlaybooks={playbooksList}
                idSuffix={col.key.toLowerCase()}
              />
              <CohortTables data={col.data} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
