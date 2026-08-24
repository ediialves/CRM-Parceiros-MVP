import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Playbook, PlaybookTask } from '../types';
import { PlaybookCard } from '../components/playbooks/PlaybookCard';
import { PlaybookForm } from '../components/playbooks/PlaybookForm';
import { PlaybookBulkCreate } from '../components/playbooks/PlaybookBulkCreate';
import { Plus, Loader2, BookOpen, AlertCircle, Trash2, X } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const PlaybooksAutomaticos: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [allTasks, setAllTasks] = useState<PlaybookTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [editingTasks, setEditingTasks] = useState<PlaybookTask[]>([]);

  // Delete Confirmation Modal State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [playbookToDelete, setPlaybookToDelete] = useState<Playbook | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);

      // Fetch all playbooks
      const { data: pData, error: pError } = await supabase
        .from('playbooks')
        .select('*')
        .order('nome', { ascending: true });

      if (pError) throw pError;

      // Fetch all playbook tasks
      const { data: tData, error: tError } = await supabase
        .from('playbook_tasks')
        .select('*')
        .order('ordem', { ascending: true });

      if (tError) throw tError;

      setPlaybooks(pData || []);
      setAllTasks(tData || []);
    } catch (err: any) {
      console.error('Erro ao buscar dados dos playbooks:', err);
      setErrorMsg('Não foi possível carregar os playbooks automáticos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Protected route logic (authenticated users only)
  if (authLoading) return null;
  if (!user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCreateNew = () => {
    setEditingPlaybook(null);
    setEditingTasks([]);
    setIsFormOpen(true);
  };

  const handleEdit = (playbook: Playbook) => {
    const tasksForPlaybook = allTasks.filter(t => t.playbook_id === playbook.id);
    setEditingPlaybook(playbook);
    setEditingTasks(tasksForPlaybook);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (playbook: Playbook) => {
    setPlaybookToDelete(playbook);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!playbookToDelete) return;

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('playbooks')
        .delete()
        .eq('id', playbookToDelete.id);

      if (error) throw error;

      setIsDeleteDialogOpen(false);
      setPlaybookToDelete(null);
      await fetchData();
    } catch (err) {
      console.error('Erro ao excluir playbook:', err);
      alert('Erro ao excluir o playbook.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePlaybook = async (formData: {
    nome: string;
    ativo: boolean;
    tasks: { id?: string; titulo: string; responsavel: string; ordem: number }[];
  }) => {
    try {
      if (editingPlaybook) {
        // 1. Update playbook
        const { error: pbError } = await supabase
          .from('playbooks')
          .update({ nome: formData.nome, ativo: formData.ativo })
          .eq('id', editingPlaybook.id);

        if (pbError) throw pbError;

        // 2. Delete existing tasks for this playbook
        const { error: delError } = await supabase
          .from('playbook_tasks')
          .delete()
          .eq('playbook_id', editingPlaybook.id);

        if (delError) throw delError;

        // 3. Insert newly saved tasks
        if (formData.tasks.length > 0) {
          const tasksToInsert = formData.tasks.map(t => ({
            playbook_id: editingPlaybook.id,
            titulo: t.titulo,
            responsavel: t.responsavel,
            ordem: t.ordem
          }));

          const { error: insError } = await supabase
            .from('playbook_tasks')
            .insert(tasksToInsert);

          if (insError) throw insError;
        }
      } else {
        // 1. Create playbook
        const { data: pbData, error: pbError } = await supabase
          .from('playbooks')
          .insert({ nome: formData.nome, ativo: formData.ativo })
          .select()
          .single();

        if (pbError) throw pbError;

        // 2. Insert tasks
        if (formData.tasks.length > 0 && pbData) {
          const tasksToInsert = formData.tasks.map(t => ({
            playbook_id: pbData.id,
            titulo: t.titulo,
            responsavel: t.responsavel,
            ordem: t.ordem
          }));

          const { error: insError } = await supabase
            .from('playbook_tasks')
            .insert(tasksToInsert);

          if (insError) throw insError;
        }
      }

      await fetchData();
    } catch (err) {
      console.error('Erro ao salvar playbook:', err);
      alert('Ocorreu um erro ao salvar o playbook e suas tasks.');
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary p-6 md:p-8" id="playbooks-automaticos-page">
      {/* Header Area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8" id="playbooks-header">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-500" />
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Playbooks Automáticos
            </h1>
          </div>
          <p className="text-sm text-text-secondary">
            Gerencie modelos de playbooks para criação automatizada de planos e checklists de engajamento de parceiros.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm self-start sm:self-center cursor-pointer"
            id="btn-new-playbook"
          >
            <Plus className="h-4 w-4" />
            Novo Playbook
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading && playbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3" id="loading-playbooks">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="text-sm text-text-secondary font-medium">Carregando playbooks...</span>
        </div>
      ) : errorMsg ? (
        <div className="max-w-md mx-auto p-6 bg-rose-50 dark:bg-rose-950/20 rounded-xl border border-rose-100 dark:border-rose-950/50 flex flex-col items-center text-center gap-3" id="error-playbooks">
          <AlertCircle className="h-10 w-10 text-rose-500" />
          <h2 className="text-base font-bold text-text-primary">Erro ao carregar playbooks</h2>
          <p className="text-xs text-text-secondary">{errorMsg}</p>
          <Button onClick={fetchData} variant="secondary" className="mt-2 text-xs">
            Tentar Novamente
          </Button>
        </div>
      ) : playbooks.length === 0 ? (
        <div className="max-w-md mx-auto py-16 px-6 bg-card border border-border border-dashed rounded-2xl flex flex-col items-center text-center gap-4" id="empty-playbooks">
          <div className="h-12 w-12 rounded-full bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-500">
            <BookOpen size={24} />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-text-primary">Nenhum playbook modelo cadastrado</h2>
            <p className="text-xs text-text-secondary">
              Os playbooks automáticos ajudam a iniciar planos de ação com checklists sequenciais predefinidos.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleCreateNew}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              id="btn-empty-create-playbook"
            >
              Adicionar Primeiro Playbook
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" id="playbooks-grid">
          {playbooks.map(playbook => {
            const count = allTasks.filter(t => t.playbook_id === playbook.id).length;
            return (
              <PlaybookCard
                key={playbook.id}
                playbook={playbook}
                tasksCount={count}
                onEdit={() => handleEdit(playbook)}
                onDelete={() => handleDeleteClick(playbook)}
                isAdmin={isAdmin}
                onClick={() => {
                  navigate(`/playbooks-automaticos/${playbook.id}`);
                }}
              />
            );
          })}
        </div>
      )}

      {/* Bulk Creation Section */}
      {isAdmin && <PlaybookBulkCreate playbooks={playbooks} allTasks={allTasks} />}

      {/* Form Dialog/Modal */}
      <PlaybookForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSavePlaybook}
        initialPlaybook={editingPlaybook}
        initialTasks={editingTasks}
      />

      {/* Modal de Confirmação de Exclusão de Playbook */}
      {isDeleteDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" id="delete-playbook-overlay">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95 duration-200" id="delete-playbook-content">
            <div className="flex items-center justify-between p-6 border-b border-border bg-gray-50/50">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Trash2 size={20} className="text-red-500" />
                Confirmar Exclusão
              </h3>
              <button 
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setPlaybookToDelete(null);
                }}
                className="text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                id="btn-close-delete-modal"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-center sm:text-left">
              <p className="text-text-primary font-medium">
                Tem certeza que deseja excluir o playbook <span className="text-indigo-600 font-semibold">"{playbookToDelete?.nome}"</span>?
              </p>
              <p className="text-sm text-text-secondary leading-relaxed bg-red-50 dark:bg-red-950/20 p-4 rounded-lg border border-red-100 dark:border-red-950/50 flex items-start gap-3">
                <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                <span>Esta ação é irreversível e removerá permanentemente o modelo e todas as suas tasks predefinidas.</span>
              </p>
            </div>
            
            <div className="flex items-center gap-3 p-6 bg-gray-50/50 border-t border-border">
              <Button 
                variant="ghost" 
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setPlaybookToDelete(null);
                }}
                className="flex-1 font-bold"
                id="btn-cancel-delete"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleDeleteConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
                id="btn-confirm-delete"
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
