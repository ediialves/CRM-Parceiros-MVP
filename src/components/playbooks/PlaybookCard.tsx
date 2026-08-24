import React from 'react';
import { Pencil, Trash2, ListTodo, Calendar } from 'lucide-react';
import { Playbook } from '../../types';

interface PlaybookCardProps {
  playbook: Playbook;
  tasksCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
  isAdmin?: boolean;
}

export const PlaybookCard: React.FC<PlaybookCardProps> = ({
  playbook,
  tasksCount,
  onEdit,
  onDelete,
  onClick,
  isAdmin = false,
}) => {
  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-full group cursor-pointer hover:border-indigo-500/30"
      id={`playbook-card-${playbook.id}`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-text-primary line-clamp-2 group-hover:text-indigo-500 transition-colors" title={playbook.nome}>
            {playbook.nome}
          </h3>
          <span
            className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
              playbook.ativo
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-text-secondary/10 text-text-secondary'
            }`}
          >
            {playbook.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>

        <div className="flex flex-col gap-2 pt-2 text-xs text-text-secondary">
          <div className="flex items-center gap-1.5">
            <ListTodo className="h-4 w-4 text-indigo-500" />
            <span>
              <strong className="text-text-primary">{tasksCount}</strong> {tasksCount === 1 ? 'task cadastrada' : 'tasks cadastradas'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-indigo-500" />
            <span>
              Criado em: {new Date(playbook.criado_em).toLocaleDateString('pt-BR')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-5 pt-4 border-t border-border border-opacity-30">
        <span className="text-[10px] text-indigo-500 font-semibold group-hover:underline">
          Ver Acompanhamento Kanban
        </span>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-2 text-text-secondary hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
              title="Editar playbook"
              id={`btn-edit-playbook-${playbook.id}`}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-2 text-text-secondary hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors flex items-center justify-center cursor-pointer"
              title="Excluir playbook"
              id={`btn-delete-playbook-${playbook.id}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
