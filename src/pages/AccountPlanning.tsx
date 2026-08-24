import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { AccountPlanning } from '../types';
import { 
  List, 
  Kanban as KanbanIcon, 
  Filter, 
  Calendar as CalendarIcon, 
  Users, 
  Target, 
  Search, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  TrendingUp,
  Briefcase,
  HelpCircle,
  X,
  Trash2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const AccountPlanningPage: React.FC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [planningData, setPlanningData] = useState<AccountPlanning[]>([]);
  const [managers, setManagers] = useState<Array<{ id: string; nome: string }>>([]);
  const [allUsersList, setAllUsersList] = useState<Array<{ id: string; nome: string }>>([]);
  
  // View toggle: save to sessionStorage, default to kanban
  const [viewType, setViewType] = useState<'list' | 'kanban'>(() => {
    const saved = sessionStorage.getItem('account_planning_view');
    return (saved === 'list' || saved === 'kanban') ? saved : 'kanban';
  });

  // Manager filter: save to localStorage
  const [selectedManagers, setSelectedManagers] = useState<string[]>(() => {
    const saved = localStorage.getItem('account_planning_gerentes');
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState<string[]>(selectedManagers);

  // Sync tempSelected with selectedManagers when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      setTempSelected(selectedManagers);
    }
  }, [dropdownOpen, selectedManagers]);

  // Click outside filter dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#account-manager-filter-dropdown')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Fetch managers and plans
  useEffect(() => {
    if (authLoading) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch managers if admin
        if (isAdmin) {
          const { data: fetchUsers, error: usersErr } = await supabase
            .rpc('get_all_users_for_admin');

          if (usersErr) {
            console.error('Error fetching managers via RPC:', usersErr);
          } else if (fetchUsers) {
            setAllUsersList(fetchUsers);
            const filteredGerentes = fetchUsers
              .filter((u: any) => u.role === 'gerente')
              .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
            setManagers(filteredGerentes);
          }
        }

        // Fetch account_planning
        const { data: planningFetched, error: planErr } = await supabase
          .from('account_planning')
          .select(`
            *,
            partners(nome, accountancy_id, contas_potencial),
            users(nome)
          `)
          .order('semana', { ascending: false });

        if (planErr) throw planErr;
        setPlanningData(planningFetched || []);
      } catch (err) {
        console.error('Error fetching account planning data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [authLoading, isAdmin]);

  // Save view type change to sessionStorage
  const handleViewTypeChange = (type: 'list' | 'kanban') => {
    setViewType(type);
    sessionStorage.setItem('account_planning_view', type);
  };

  // Deletion States
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletionLoadingId, setDeletionLoadingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletionLoadingId(id);
    try {
      const { error } = await supabase
        .from('account_planning')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update the local state
      setPlanningData(prev => prev.filter(item => item.id !== id));
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting account plan:', err);
    } finally {
      setDeletionLoadingId(null);
    }
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AccountPlanning | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields State
  const [partnerType, setPartnerType] = useState<'sistema' | 'externo'>('sistema');
  const [selectedPartner, setSelectedPartner] = useState<any | null>(null);
  const [partnerSearchInput, setPartnerSearchInput] = useState('');
  const [partnerSearchResults, setPartnerSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [partnerExternoId, setPartnerExternoId] = useState('');
  const [partnerExternoNome, setPartnerExternoNome] = useState('');
  const [partnerExternoContas, setPartnerExternoContas] = useState<number | ''>('');

  const [semana, setSemana] = useState('');
  const [tipoPlano, setTipoPlano] = useState<'Engajar' | 'Substituir' | 'Vender'>('Engajar');
  const [objetivo, setObjetivo] = useState('');
  const [meta, setMeta] = useState<number | ''>('');
  const [status, setStatus] = useState<AccountPlanning['status']>('Backlog');
  const [resultado, setResultado] = useState<number | ''>('');
  const [selectedGerenteId, setSelectedGerenteId] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Dynamic partner search
  useEffect(() => {
    if (partnerType !== 'sistema' || !partnerSearchInput.trim()) {
      setPartnerSearchResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data, error } = await supabase
          .from('partners')
          .select('id, nome, accountancy_id, contas_potencial')
          .or(`nome.ilike.%${partnerSearchInput}%,accountancy_id.ilike.%${partnerSearchInput}%`)
          .limit(10);
        if (error) throw error;
        setPartnerSearchResults(data || []);
      } catch (err) {
        console.error('Error searching partners:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [partnerSearchInput, partnerType]);

  const getMondays2026 = () => {
    const mondays = [];
    const date = new Date('2026-05-04T12:00:00'); // primeira segunda de maio de 2026 com horário meio-dia para evitar DST
    while (date.getFullYear() === 2026) {
      mondays.push(new Date(date));
      date.setDate(date.getDate() + 7);
    }
    return mondays;
  };

  const mondaysList = useMemo(() => {
    return getMondays2026().map(d => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const value = `${year}-${month}-${day}`;
      return {
        value,
        label: `${day}/${month}/${year}`
      };
    });
  }, []);

  const handleOpenCreateModal = () => {
    setEditingItem(null);
    setPartnerType('sistema');
    setSelectedPartner(null);
    setPartnerSearchInput('');
    setPartnerSearchResults([]);
    setPartnerExternoId('');
    setPartnerExternoNome('');
    setPartnerExternoContas('');
    setSemana('');
    setTipoPlano('Engajar');
    setObjetivo('');
    setMeta('');
    setStatus('Backlog');
    setResultado('');
    setSelectedGerenteId(user?.id || '');
    setValidationErrors({});
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: AccountPlanning) => {
    setEditingItem(item);
    setPartnerSearchInput('');
    setPartnerSearchResults([]);
    setValidationErrors({});

    if (item.partner_id) {
      setPartnerType('sistema');
      setSelectedPartner({
        id: item.partner_id,
        nome: item.partners?.nome,
        accountancy_id: item.partners?.accountancy_id,
        contas_potencial: item.partners?.contas_potencial
      });
      setPartnerExternoId('');
      setPartnerExternoNome('');
      setPartnerExternoContas('');
    } else {
      setPartnerType('externo');
      setSelectedPartner(null);
      setPartnerExternoId(item.partner_externo_id || '');
      setPartnerExternoNome(item.partner_externo_nome || '');
      setPartnerExternoContas(item.partner_externo_contas_potencial ?? '');
    }

    setSemana(item.semana || '');
    setTipoPlano(item.tipo_plano || 'Engajar');
    setObjetivo(item.objetivo || '');
    setMeta(item.meta || '');
    setStatus(item.status || 'Backlog');
    setResultado(item.resultado ?? '');
    setSelectedGerenteId(item.gerente_id || '');
    setIsModalOpen(true);
  };

  const refreshData = async () => {
    try {
      const { data: planningFetched, error: planErr } = await supabase
        .from('account_planning')
        .select(`
          *,
          partners(nome, accountancy_id, contas_potencial),
          users(nome)
        `)
        .order('semana', { ascending: false });

      if (planErr) throw planErr;
      setPlanningData(planningFetched || []);
    } catch (err) {
      console.error('Error re-fetching account planning data:', err);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    const errors: Record<string, string> = {};

    if (partnerType === 'sistema') {
      if (!selectedPartner) {
        errors.partner = 'Selecione um parceiro no sistema';
      }
    } else {
      if (!partnerExternoId.trim()) {
        errors.partnerExternoId = 'ID do parceiro externo é obrigatório';
      }
      if (!partnerExternoNome.trim()) {
        errors.partnerExternoNome = 'Nome do parceiro externo é obrigatório';
      }
    }

    if (!semana) {
      errors.semana = 'Semana é obrigatória';
    }

    if (!tipoPlano) {
      errors.tipoPlano = 'Tipo de plano é obrigatório';
    }

    if (!objetivo.trim()) {
      errors.objetivo = 'Objetivo é obrigatório';
    }

    if (meta === '' || Number(meta) <= 0) {
      errors.meta = 'Meta deve ser maior que 0';
    }

    if (status === 'Feito') {
      if (resultado === '' || Number(resultado) < 0) {
        errors.resultado = 'Informe o resultado para marcar como Feito';
      }
    }

    const duplicateCheckFilter = planningData.some(item => {
      if (editingItem && item.id === editingItem.id) return false;
      if (item.semana !== semana) return false;
      
      if (partnerType === 'sistema') {
        return item.partner_id === selectedPartner?.id;
      } else {
        return item.partner_externo_id === partnerExternoId;
      }
    });

    if (duplicateCheckFilter) {
      errors.submit = 'Já existe um plano para este parceiro nesta semana';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const contasManual = partnerType === 'externo' && partnerExternoContas !== '' ? Number(partnerExternoContas) : null;
      const finalContasPotencial = partnerType === 'sistema' ? (selectedPartner?.contas_potencial ?? null) : contasManual;

      const payload = {
        gerente_id: selectedGerenteId || user?.id,
        partner_id: partnerType === 'sistema' ? selectedPartner.id : null,
        partner_externo_id: partnerType === 'externo' ? partnerExternoId : null,
        partner_externo_nome: partnerType === 'externo' ? partnerExternoNome : null,
        partner_externo_contas_potencial: partnerType === 'externo' ? contasManual : null,
        semana: semana,
        tipo_plano: tipoPlano,
        objetivo: objetivo,
        contas_potencial: finalContasPotencial,
        meta: Number(meta),
        status: status,
        resultado: status === 'Feito' && resultado !== '' ? Number(resultado) : null
      };

      if (editingItem) {
        const { error } = await supabase
          .from('account_planning')
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('account_planning')
          .insert(payload);

        if (error) throw error;
      }

      await refreshData();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving account plan:', err);
      setValidationErrors({ submit: 'Erro ao salvar o registro no banco de dados' });
    } finally {
      setSaving(false);
    }
  };

  // Helper functions for reading partners and metrics
  const getNomeParceiro = (item: AccountPlanning) =>
    item.partners?.nome ?? item.partner_externo_nome ?? '-';

  const getIdParceiro = (item: AccountPlanning) =>
    item.partners?.accountancy_id ?? item.partner_externo_id ?? '-';

  const getContasPotencial = (item: AccountPlanning) =>
    item.partners?.contas_potencial ?? item.partner_externo_contas_potencial ?? 0;

  const getSemanaFormatted = (semanaStr: string) => {
    if (!semanaStr) return '-';
    try {
      const parts = semanaStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(semanaStr);
      return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
      return semanaStr;
    }
  };

  const getGerenteNome = (item: AccountPlanning) => {
    if (item.users?.nome) return item.users.nome;
    if (item.gerente_id === user?.id) return user.nome;
    const found = allUsersList.find(u => u.id === item.gerente_id);
    if (found) return found.nome;
    const foundInManagers = managers.find(m => m.id === item.gerente_id);
    if (foundInManagers) return foundInManagers.nome;
    return '';
  };

  // Filter and process data
  const processedData = useMemo(() => {
    // 1. Filter by role/manager
    let data = planningData;
    if (isAdmin) {
      if (selectedManagers.length > 0) {
        data = data.filter(item => selectedManagers.includes(item.gerente_id));
      }
    } else if (user) {
      data = data.filter(item => item.gerente_id === user.id);
    }

    // 2. Filter history rows (Pausado, Feito, Cancelado) to last 4 weeks (28 days)
    const quatroSemanasAtras = new Date();
    quatroSemanasAtras.setDate(quatroSemanasAtras.getDate() - 28);
    quatroSemanasAtras.setHours(0, 0, 0, 0);

    return data.filter(item => {
      if (['Pausado', 'Feito', 'Cancelado'].includes(item.status)) {
        if (!item.semana) return false;
        const [year, month, day] = item.semana.split('-').map(Number);
        const itemDate = new Date(year, month - 1, day);
        return itemDate >= quatroSemanasAtras;
      }
      return true;
    });
  }, [planningData, isAdmin, selectedManagers, user]);

  // Derived dashboard quick metrics
  const stats = useMemo(() => {
    const total = processedData.length;
    const active = processedData.filter(d => d.status === 'Fazendo').length;
    const backlog = processedData.filter(d => d.status === 'Backlog').length;
    const feito = processedData.filter(d => d.status === 'Feito').length;
    
    const totalContas = processedData.reduce((acc, d) => {
      const p = getContasPotencial(d);
      return acc + (typeof p === 'number' ? p : 0);
    }, 0);

    return { total, active, backlog, feito, totalContas };
  }, [processedData]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p className="text-sm text-text-secondary">Carregando dados do Account Planning...</p>
      </div>
    );
  }

  // Kanban view logic
  const columns: Array<{ id: AccountPlanning['status']; label: string; color: string; bg: string; text: string }> = [
    { id: 'Backlog', label: 'Backlog', color: 'border-slate-300 dark:border-slate-700', bg: 'bg-slate-50 dark:bg-slate-900/45', text: 'text-slate-600 dark:text-slate-400' },
    { id: 'Fazendo', label: 'Fazendo', color: 'border-blue-400 dark:border-blue-700', bg: 'bg-blue-50/50 dark:bg-blue-900/10', text: 'text-blue-600 dark:text-blue-400' },
    { id: 'Pausado', label: 'Pausado', color: 'border-amber-400 dark:border-amber-700', bg: 'bg-amber-50/30 dark:bg-amber-900/5', text: 'text-amber-600 dark:text-amber-400' },
    { id: 'Feito', label: 'Feito', color: 'border-green-400 dark:border-green-700', bg: 'bg-green-50/30 dark:bg-green-900/5', text: 'text-green-600 dark:text-green-400' },
    { id: 'Cancelado', label: 'Cancelado', color: 'border-red-300 dark:border-red-700', bg: 'bg-red-50/30 dark:bg-red-900/5', text: 'text-red-600 dark:text-red-400' },
  ];

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Forecast Semanal</h1>
          <p className="text-text-secondary">Adicione commits semanais com cada parceiro para gerar a sua previsão de resultados.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Manager Filter Dropdown (admins only) */}
          {isAdmin && (
            <div className="relative inline-block" id="account-manager-filter-dropdown">
              <button
                type="button"
                onClick={() => setDropdownOpen(prev => !prev)}
                className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-gray-50 dark:hover:bg-background/25 border border-border rounded-lg text-sm font-medium text-text-primary shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <Filter size={16} className="text-text-secondary" />
                <span>
                  {selectedManagers.length === 0
                    ? 'Todos os gerentes'
                    : selectedManagers.length === 1
                      ? (managers.find(m => m.id === selectedManagers[0])?.nome || '1 gerente')
                      : `${selectedManagers.length} gerentes`}
                </span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-surface rounded-xl border border-border shadow-lg z-50 overflow-hidden divide-y divide-border animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-2">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-background/25 rounded-lg cursor-pointer text-sm font-medium text-text-primary select-none w-full">
                      <input
                        type="checkbox"
                        checked={tempSelected.length === 0}
                        onChange={() => setTempSelected([])}
                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                      <span>Todos os gerentes</span>
                    </label>
                  </div>
                  <div className="p-2 max-h-60 overflow-y-auto scrollbar-thin">
                    {managers.map(mgr => {
                      const isChecked = tempSelected.includes(mgr.id);
                      return (
                        <label
                          key={mgr.id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-background/25 rounded-lg cursor-pointer text-sm text-text-primary select-none w-full"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setTempSelected(prev => prev.filter(id => id !== mgr.id));
                              } else {
                                setTempSelected(prev => [...prev, mgr.id]);
                              }
                            }}
                            className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                          />
                          <span className="truncate">{mgr.nome}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="p-3 bg-gray-50/50 dark:bg-background/10 flex items-center justify-end gap-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setTempSelected([]);
                        setSelectedManagers([]);
                        localStorage.removeItem('account_planning_gerentes');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer bg-transparent rounded-lg hover:bg-gray-100 dark:hover:bg-background/25"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedManagers(tempSelected);
                        localStorage.setItem('account_planning_gerentes', JSON.stringify(tempSelected));
                        setDropdownOpen(false);
                      }}
                      className="px-4 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm hover:shadow transition-colors cursor-pointer flex items-center justify-center font-medium"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* View Type Toggle Buttons */}
          <div className="bg-surface border border-border p-1 rounded-lg flex items-center shadow-sm">
            <button
              onClick={() => handleViewTypeChange('kanban')}
              className={`p-1.5 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${viewType === 'kanban' ? 'bg-primary text-white shadow' : 'text-text-secondary hover:text-text-primary'}`}
              title="Visualização Kanban"
            >
              <KanbanIcon size={14} />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => handleViewTypeChange('list')}
              className={`p-1.5 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${viewType === 'list' ? 'bg-primary text-white shadow' : 'text-text-secondary hover:text-text-primary'}`}
              title="Visualização Lista"
            >
              <List size={14} />
              <span>Lista</span>
            </button>
          </div>

          {/* "+ Novo" Button */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-bold rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer"
          >
            <span className="text-sm font-bold">+</span>
            <span>Novo commit</span>
          </button>
        </div>
      </header>

      {/* Quick Summary Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total de Planos', value: stats.total, icon: Briefcase, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/20' },
          { label: 'Em Execução', value: stats.active, icon: Target, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20' },
          { label: 'No Backlog', value: stats.backlog, icon: Clock, color: 'text-slate-600 bg-slate-50 dark:bg-slate-950/20' },
          { label: 'Planos Feitos', value: stats.feito, icon: CheckCircle2, color: 'text-green-600 bg-green-50 dark:bg-green-950/20' },
          { label: 'Contas com Potencial', value: stats.totalContas, icon: TrendingUp, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface p-5 rounded-xl border border-border shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-text-secondary font-bold uppercase tracking-wider">{stat.label}</span>
              <div className={`p-2 rounded-lg ${stat.color}`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-text-primary mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {processedData.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center shadow-sm">
          <HelpCircle size={40} className="mx-auto text-text-secondary mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-text-primary">Nenhum plano encontrado</h3>
          <p className="text-sm text-text-secondary mt-1">Nenhum registro corresponde aos filtros de gerência ou ao limite de semanas atual.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {viewType === 'kanban' ? (
            <motion.div 
              key="kanban-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-4 overflow-x-auto pb-4 scrollbar-thin"
            >
              {columns.map(col => {
                const colItems = processedData.filter(item => item.status === col.id);
                return (
                  <div key={col.id} className="flex flex-col min-w-[250px] lg:min-w-0 bg-gray-50/50 dark:bg-background/25 border border-border rounded-xl h-[70vh] overflow-hidden">
                    {/* Column Header */}
                    <div className={`p-3 border-b-2 flex items-center justify-between font-bold text-xs uppercase tracking-wider ${col.color} bg-white dark:bg-surface`}>
                      <span className={col.text}>{col.label}</span>
                      <span className="bg-gray-100 dark:bg-background/60 px-2 py-0.5 rounded-full text-[10px] text-text-secondary">
                        {colItems.length}
                      </span>
                    </div>

                    {/* Cards Container */}
                    <div className="p-3 overflow-y-auto space-y-3 flex-1 scrollbar-thin">
                      {colItems.map(item => {
                        const labelType = item.tipo_plano;
                        let typeBadgeStyle = 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border-blue-200/50';
                        if (labelType === 'Engajar') {
                          typeBadgeStyle = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border-indigo-200/50';
                        } else if (labelType === 'Substituir') {
                          typeBadgeStyle = 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200/50';
                        }

                        return (
                          <div 
                            key={item.id}
                            onClick={() => handleOpenEditModal(item)}
                            className="bg-surface p-4 rounded-lg border border-border shadow-sm hover:shadow-md hover:border-primary/40 dark:hover:border-primary/40 transition-all flex flex-col gap-2 relative group cursor-pointer overflow-hidden"
                          >
                            {/* Inline Deletion Confirmation Overlay */}
                            {deletingId === item.id && (
                              <div 
                                onClick={(e) => e.stopPropagation()}
                                className="absolute inset-0 bg-surface/98 dark:bg-slate-900/98 p-4 rounded-lg flex flex-col items-center justify-center text-center gap-2.5 z-20 border border-red-500/30"
                              >
                                <p className="text-[11px] font-bold text-text-primary leading-snug">
                                  Tem certeza que deseja excluir este plano?
                                </p>
                                <div className="flex items-center gap-2 w-full">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingId(null);
                                    }}
                                    className="flex-1 py-1 px-2 border border-border hover:bg-gray-100 dark:hover:bg-background/25 text-[10px] font-bold text-text-secondary rounded-md cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await handleDelete(item.id);
                                    }}
                                    disabled={deletionLoadingId === item.id}
                                    className="flex-1 py-1 px-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[10px] font-bold rounded-md cursor-pointer flex items-center justify-center gap-1"
                                  >
                                    {deletionLoadingId === item.id ? (
                                      <>
                                        <Loader2 size={10} className="animate-spin" />
                                        <span>Excluindo...</span>
                                      </>
                                    ) : (
                                      <span>Excluir</span>
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}

                            <div className="flex items-start justify-between gap-2">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${typeBadgeStyle}`}>
                                {item.tipo_plano}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0 select-none">
                                <span className="text-[10px] text-text-secondary font-mono">
                                  {getSemanaFormatted(item.semana)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingId(item.id);
                                  }}
                                  className="p-1 text-text-secondary hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-background/25 rounded transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  title="Excluir Plano"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-0.5">
                              <h4 className="font-bold text-sm text-text-primary leading-snug truncate-2-lines line-clamp-2" title={getNomeParceiro(item)}>
                                {getNomeParceiro(item)}
                              </h4>
                              <p className="text-[11px] font-mono text-text-secondary flex items-center gap-1.5">
                                <span className="opacity-70">ID:</span>
                                <span>{getIdParceiro(item)}</span>
                              </p>
                            </div>

                            {getContasPotencial(item) > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                                <Users size={12} className="opacity-70 text-emerald-500" />
                                <span>Contas Potencial: <strong className="text-text-primary">{getContasPotencial(item)}</strong></span>
                              </div>
                            )}

                            <div className="my-1 border-t border-dashed border-border py-2 text-xs">
                              <p className="text-text-secondary italic line-clamp-3" title={item.objetivo}>
                                "{item.objetivo}"
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border">
                              <div>
                                <span className="text-[9px] uppercase tracking-wider text-text-secondary font-semibold">Meta</span>
                                <p className="font-bold text-text-primary">{item.meta}</p>
                              </div>
                              <div>
                                <span className="text-[9px] uppercase tracking-wider text-text-secondary font-semibold">Resultado</span>
                                <p className="font-bold text-text-primary">{item.resultado !== undefined && item.resultado !== null ? item.resultado : '-'}</p>
                              </div>
                            </div>

                            {/* Manager tag */}
                            {getGerenteNome(item) && (
                              <div className="pt-2 border-t border-border mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-text-secondary bg-gray-50/50 dark:bg-background/20 px-2 py-1 rounded">
                                <span className="opacity-70">Gerente:</span>
                                <span className="text-primary truncate">{getGerenteNome(item)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {colItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                          <p className="text-xs text-text-secondary/50 font-medium">Sem planos neste status</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key="list-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/70 dark:bg-background/25 border-b border-border text-[10px] uppercase font-bold text-text-secondary tracking-wider">
                      {isAdmin && <th className="p-4 py-3.5">Gerente</th>}
                      <th className="p-4 py-3.5">ID</th>
                      <th className="p-4 py-3.5">Nome Parceiro</th>
                      <th className="p-4 py-3.5">Semana</th>
                      <th className="p-4 py-3.5">Tipo</th>
                      <th className="p-4 py-3.5 max-w-xs">Ação Objetiva</th>
                      <th className="p-4 py-3.5 text-center">Contas Potencial</th>
                      <th className="p-4 py-3.5 text-right">Meta</th>
                      <th className="p-4 py-3.5 text-center">Status</th>
                      <th className="p-4 py-3.5 text-right">Resultado</th>
                      <th className="p-4 py-3.5 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm text-text-primary">
                    {(['Backlog', 'Fazendo', 'Pausado', 'Feito', 'Cancelado'] as AccountPlanning['status'][]).map(statusGroup => {
                      const groupItems = processedData.filter(item => item.status === statusGroup);
                      if (groupItems.length === 0) return null;

                      return (
                        <React.Fragment key={statusGroup}>
                          {/* Header Row for Category */}
                          <tr className="bg-gray-100/30 dark:bg-background/10">
                            <td colSpan={isAdmin ? 11 : 10} className="p-3 px-4 font-bold text-xs uppercase tracking-wider text-text-secondary border-y border-border">
                              <div className="flex items-center gap-2">
                                <span>{statusGroup}</span>
                                <span className="bg-gray-200 dark:bg-background/60 px-2 py-0.5 rounded-full text-[10px] text-text-secondary font-semibold">
                                  {groupItems.length}
                                </span>
                              </div>
                            </td>
                          </tr>
                          {groupItems.map(item => {
                            const labelType = item.tipo_plano;
                            let typeBadgeStyle = 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border-blue-200/50';
                            if (labelType === 'Engajar') {
                              typeBadgeStyle = 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/20 dark:text-indigo-400 border-indigo-200/50';
                            } else if (labelType === 'Substituir') {
                              typeBadgeStyle = 'bg-orange-50 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400 border-orange-200/50';
                            }

                            let statusBadgeStyle = 'bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400 border-slate-300/40';
                            if (item.status === 'Fazendo') {
                              statusBadgeStyle = 'bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400 border-blue-300/40';
                            } else if (item.status === 'Pausado') {
                              statusBadgeStyle = 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border-amber-300/40';
                            } else if (item.status === 'Feito') {
                              statusBadgeStyle = 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border-green-300/40';
                            } else if (item.status === 'Cancelado') {
                              statusBadgeStyle = 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border-red-350/40';
                            }

                            return (
                              <tr 
                                key={item.id} 
                                onClick={() => handleOpenEditModal(item)}
                                className="hover:bg-gray-50/50 dark:hover:bg-background/15 transition-all text-xs cursor-pointer"
                              >
                                {isAdmin && (
                                  <td className="p-4 font-semibold text-primary">{getGerenteNome(item) || '-'}</td>
                                )}
                                <td className="p-4 font-mono text-text-secondary">{getIdParceiro(item)}</td>
                                <td className="p-4 font-bold text-text-primary">{getNomeParceiro(item)}</td>
                                <td className="p-4 font-mono font-semibold text-text-secondary">{getSemanaFormatted(item.semana)}</td>
                                <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${typeBadgeStyle}`}>
                                    {item.tipo_plano}
                                  </span>
                                </td>
                                <td className="p-4 max-w-xs text-text-secondary truncate italic leading-relaxed" title={item.objetivo}>
                                  "{item.objetivo}"
                                </td>
                                <td className="p-4 text-center font-bold text-text-secondary">{getContasPotencial(item) || '-'}</td>
                                <td className="p-4 text-right font-bold text-text-primary">{item.meta}</td>
                                <td className="p-4 text-center">
                                  <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${statusBadgeStyle}`}>
                                    {item.status}
                                  </span>
                                </td>
                                <td className="p-4 text-right font-bold text-text-primary">
                                  {item.resultado !== undefined && item.resultado !== null ? item.resultado : '-'}
                                </td>
                                <td className="p-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                  {deletingId === item.id ? (
                                    <div className="flex items-center justify-center gap-2">
                                      <span className="text-[11px] font-bold text-red-500">
                                        Tem certeza que deseja excluir este plano?
                                      </span>
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          await handleDelete(item.id);
                                        }}
                                        disabled={deletionLoadingId === item.id}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-[10px] font-bold cursor-pointer flex items-center justify-center gap-1 shrink-0"
                                      >
                                        {deletionLoadingId === item.id ? (
                                          <Loader2 size={10} className="animate-spin" />
                                        ) : null}
                                        Excluir
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeletingId(null);
                                        }}
                                        className="px-2.5 py-1 border border-border hover:bg-gray-100 dark:hover:bg-background/25 text-text-secondary rounded text-[10px] font-semibold cursor-pointer shrink-0"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingId(item.id);
                                      }}
                                      className="p-1.5 text-text-secondary hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-950/20 cursor-pointer inline-flex items-center justify-center transition-colors"
                                      title="Excluir Plano"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      {/* Modal de Criação e Edição */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden my-8"
            >
              {/* Header */}
              <div className="p-5 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text-primary w-fit inline-block">
                    {editingItem ? 'Editar Commit' : 'Novo Commit'}
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {editingItem ? 'Altere as informações do commit selecionado' : 'Comprometa-se com uma ação objetiva que vai gerar resultado essa semana.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 px-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-background/25 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto scrollbar-thin">
                {validationErrors.submit && (
                  <div className="p-3.5 bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-900/40 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{validationErrors.submit}</span>
                  </div>
                )}

                {/* Partner Type Toggle */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-text-secondary uppercase">
                    Origem do Parceiro
                  </label>
                  <div className="grid grid-cols-2 p-1 bg-gray-100/55 dark:bg-background/30 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setPartnerType('sistema');
                        setValidationErrors(prev => {
                          const copy = { ...prev };
                          delete copy.partner;
                          delete copy.partnerExternoId;
                          delete copy.partnerExternoNome;
                          return copy;
                        });
                      }}
                      className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${partnerType === 'sistema' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      No Sistema
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPartnerType('externo');
                        setValidationErrors(prev => {
                          const copy = { ...prev };
                          delete copy.partner;
                          delete copy.partnerExternoId;
                          delete copy.partnerExternoNome;
                          return copy;
                        });
                      }}
                      className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${partnerType === 'externo' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                    >
                      Externo (Manual)
                    </button>
                  </div>
                </div>

                {/* Partner field */}
                {partnerType === 'sistema' ? (
                  <div className="space-y-2 relative">
                    <label className="block text-xs font-bold text-text-secondary uppercase">
                      Parceiro do Sistema
                    </label>
                    {selectedPartner ? (
                      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-background/15 border border-border rounded-lg">
                        <div className="truncate pr-4">
                          <p className="font-bold text-xs text-text-primary truncate">{selectedPartner.nome}</p>
                          <p className="text-[10px] font-mono text-text-secondary">
                            ID: {selectedPartner.accountancy_id} • Contas Potencial: {selectedPartner.contas_potencial ?? 0}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPartner(null);
                            setPartnerSearchInput('');
                          }}
                          className="text-xs text-red-500 hover:text-red-600 font-bold cursor-pointer shrink-0"
                        >
                          Limpar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={14} />
                          <input
                            type="text"
                            placeholder="Pesquise por nome ou id do parceiro..."
                            value={partnerSearchInput}
                            onChange={(e) => setPartnerSearchInput(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-border rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>

                        {/* Search Results Dropdown */}
                        {searchLoading && (
                          <div className="absolute left-0 right-0 p-3 bg-surface border border-border rounded-lg text-center text-xs text-text-secondary z-50">
                            Carregando...
                          </div>
                        )}

                        {partnerSearchResults.length > 0 && (
                          <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-surface border border-border rounded-lg shadow-lg z-50 divide-y divide-border">
                            {partnerSearchResults.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setSelectedPartner(p);
                                  setPartnerSearchInput('');
                                  setPartnerSearchResults([]);
                                }}
                                className="w-full text-left p-2.5 px-4 hover:bg-gray-50 dark:hover:bg-background/20 transition-all text-xs flex flex-col gap-0.5 cursor-pointer"
                              >
                                <span className="font-bold text-text-primary">{p.nome}</span>
                                <span className="text-[10px] font-mono text-text-disabled">ID: {p.accountancy_id} • Contas: {p.contas_potencial ?? 0}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {partnerSearchInput.trim() && !searchLoading && partnerSearchResults.length === 0 && (
                          <div className="absolute left-0 right-0 mt-1 p-3 bg-surface border border-border rounded-lg text-center text-xs text-text-secondary z-50">
                            Nenhum parceiro encontrado
                          </div>
                        )}
                      </>
                    )}
                    {validationErrors.partner && (
                      <p className="text-xs text-red-500 font-semibold mt-1">{validationErrors.partner}</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-text-secondary uppercase">
                        ID Parceiro Externo *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: EXT123"
                        value={partnerExternoId}
                        onChange={(e) => setPartnerExternoId(e.target.value)}
                        className={`w-full px-3 py-2 border ${validationErrors.partnerExternoId ? 'border-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
                      />
                      {validationErrors.partnerExternoId && (
                        <p className="text-[11px] text-red-500 font-medium">{validationErrors.partnerExternoId}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-text-secondary uppercase">
                        Nome Parceiro Externo *
                      </label>
                      <input
                        type="text"
                        placeholder="Nome do parceiro"
                        value={partnerExternoNome}
                        onChange={(e) => setPartnerExternoNome(e.target.value)}
                        className={`w-full px-3 py-2 border ${validationErrors.partnerExternoNome ? 'border-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
                      />
                      {validationErrors.partnerExternoNome && (
                        <p className="text-[11px] text-red-500 font-medium">{validationErrors.partnerExternoNome}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Semana and Tipo de Plano */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-text-secondary uppercase">
                      Semana *
                    </label>
                    <select
                      value={semana}
                      onChange={(e) => setSemana(e.target.value)}
                      className={`w-full px-3 py-2 border ${validationErrors.semana ? 'border-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer`}
                    >
                      <option value="">Selecione uma segunda-feira...</option>
                      {mondaysList.map(m => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {validationErrors.semana && (
                      <p className="text-[11px] text-red-500 font-medium">{validationErrors.semana}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-text-secondary uppercase">
                      Tipo de Ação *
                    </label>
                    <select
                      value={tipoPlano}
                      onChange={(e) => setTipoPlano(e.target.value as any)}
                      className={`w-full px-3 py-2 border ${validationErrors.tipoPlano ? 'border-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer`}
                    >
                      <option value="Engajar">Engajar</option>
                      <option value="Substituir">Substituir</option>
                      <option value="Vender">Vender</option>
                    </select>
                    {validationErrors.tipoPlano && (
                      <p className="text-[11px] text-red-500 font-medium">{validationErrors.tipoPlano}</p>
                    )}
                  </div>
                </div>

                {/* Objetivo */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-text-secondary uppercase">
                    Ação objetiva *
                  </label>
                  <textarea
                    placeholder="Descreva detalhadamente o objetivo deste plano..."
                    value={objetivo}
                    onChange={(e) => setObjetivo(e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 border ${validationErrors.objetivo ? 'border-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
                    required
                  />
                  {validationErrors.objetivo && (
                    <p className="text-[11px] text-red-500 font-medium">{validationErrors.objetivo}</p>
                  )}
                </div>

                {/* Contas Potencial and Meta */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-text-secondary uppercase">
                      Contas Potencial
                    </label>
                    <input
                      type="number"
                      placeholder="Automatico ou manual..."
                      value={
                        partnerType === 'sistema'
                          ? (selectedPartner?.contas_potencial ?? 0)
                          : partnerExternoContas
                      }
                      onChange={(e) => {
                        if (partnerType === 'externo') {
                          setPartnerExternoContas(e.target.value === '' ? '' : Number(e.target.value));
                        }
                      }}
                      disabled={partnerType === 'sistema'}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background/50 disabled:opacity-60 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-text-secondary uppercase">
                      Meta *
                    </label>
                    <input
                      type="number"
                      placeholder="Meta numérica para o plano..."
                      value={meta}
                      onChange={(e) => setMeta(e.target.value === '' ? '' : Number(e.target.value))}
                      className={`w-full px-3 py-2 border ${validationErrors.meta ? 'border-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
                      required
                    />
                    {validationErrors.meta && (
                      <p className="text-[11px] text-red-500 font-medium">{validationErrors.meta}</p>
                    )}
                  </div>
                </div>

                {/* Status and Gerente list (admins only) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-text-secondary uppercase">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                    >
                      <option value="Backlog">Backlog</option>
                      <option value="Fazendo">Fazendo</option>
                      <option value="Pausado">Pausado</option>
                      <option value="Feito">Feito</option>
                      <option value="Cancelado">Cancelado</option>
                    </select>
                  </div>

                  {isAdmin && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-text-secondary uppercase">
                        Gerente Responsável
                      </label>
                      <select
                        value={selectedGerenteId}
                        onChange={(e) => setSelectedGerenteId(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                      >
                        {managers.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                        {/* Fallback to logging user if not in managers or before loaded */}
                        {!managers.some(m => m.id === selectedGerenteId) && user && (
                          <option value={user.id}>{user.nome}</option>
                        )}
                      </select>
                    </div>
                  )}
                </div>

                {/* Resultado (Visible and required only if status === 'Feito') */}
                {status === 'Feito' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5 border-t border-dashed border-border pt-3"
                  >
                    <label className="block text-xs font-bold text-red-500 uppercase flex items-center gap-1">
                      <span>Resultado *</span>
                      <span className="text-[10px] lowercase text-text-secondary italic">(Obrigatório para status Feito)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Indique o resultado obtido."
                      value={resultado}
                      onChange={(e) => setResultado(e.target.value === '' ? '' : Number(e.target.value))}
                      className={`w-full px-3 py-2 border ${validationErrors.resultado ? 'border-red-500 ring-1 ring-red-500' : 'border-border'} rounded-lg bg-background text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20`}
                    />
                    {validationErrors.resultado ? (
                      <p className="text-[11px] text-red-600 font-semibold">{validationErrors.resultado}</p>
                    ) : (
                      <p className="text-[10px] text-text-secondary italic">Não é possível marcar como Feito se o resultado não estiver informado.</p>
                    )}
                  </motion.div>
                )}

                {/* Buttons */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-border rounded-lg text-xs font-bold text-text-secondary hover:bg-gray-50 dark:hover:bg-background/20 transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-60 text-white rounded-lg text-xs font-bold shadow-sm hover:shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <span>Salvar</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
