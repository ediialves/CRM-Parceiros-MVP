import React from 'react';
import { Eye, LogOut, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

/**
 * Faixa fixa que avisa que o admin está vendo o sistema como outra pessoa.
 *
 * É deliberadamente impossível de ignorar: o modo libera escrita, e uma ação
 * feita aqui é gravada com o id do gerente (ex.: `task_status_history.alterado_por`),
 * não com o do admin. Quem está no modo precisa saber disso o tempo todo.
 */
export const ModoVisaoBanner: React.FC = () => {
  const { user, realUser, impersonando, sairDoModoVisao } = useAuth();

  if (!impersonando || !user) return null;

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 shadow-sm z-40 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Eye size={18} className="shrink-0" />
        <p className="text-sm font-semibold truncate">
          Vendo o sistema como <span className="font-bold">{user.nome}</span>
          <span className="hidden md:inline font-normal opacity-80"> — você está logado como {realUser?.nome}</span>
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="hidden lg:flex items-center gap-1.5 text-xs font-medium opacity-90">
          <AlertTriangle size={14} />
          O que você fizer aqui é gravado como sendo dele(a)
        </span>
        <button
          type="button"
          onClick={sairDoModoVisao}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950 hover:bg-amber-900 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
        >
          <LogOut size={14} />
          Sair desse modo
        </button>
      </div>
    </div>
  );
};
