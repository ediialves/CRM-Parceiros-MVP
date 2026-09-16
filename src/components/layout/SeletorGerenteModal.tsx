import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth, GerenteResumo } from '../../context/AuthContext';
import { Eye, X, Loader2, Search, AlertCircle, UserCheck, UserX } from 'lucide-react';

interface SeletorGerenteModalProps {
  onClose: () => void;
}

export const SeletorGerenteModal: React.FC<SeletorGerenteModalProps> = ({ onClose }) => {
  const { verComoGerente } = useAuth();
  const [gerentes, setGerentes] = useState<GerenteResumo[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    // Via RPC, e não `from('users')`: o RLS de `users` só devolve o próprio
    // perfil, mesmo para admin. A função checa o papel no servidor e nunca
    // devolve `invite_code`.
    supabase.rpc('listar_gerentes').then(({ data, error }) => {
      if (!ativo) return;
      if (error) {
        console.error('Erro ao listar gerentes:', error);
        setErro(error.message || 'Não foi possível carregar a lista de gerentes.');
      } else {
        setGerentes((data || []) as GerenteResumo[]);
      }
      setCarregando(false);
    });

    return () => { ativo = false; };
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return gerentes;
    return gerentes.filter(
      g => g.nome.toLowerCase().includes(termo) || g.email.toLowerCase().includes(termo)
    );
  }, [gerentes, busca]);

  const selecionar = (g: GerenteResumo) => {
    verComoGerente(g);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-border rounded-xl shadow-xl w-full max-w-lg p-6 relative flex flex-col gap-4 max-h-[85vh] animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer"
        >
          <X className="w-4.5 h-4.5" />
        </button>

        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-1.5">
            <Eye className="w-5 h-5 text-primary" />
            Ver como gerente
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Abre o sistema com a visão dele(a), sem precisar da senha. Você continua logado na sua conta.
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/60" />
          <input
            type="text"
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full pl-9 pr-3 py-2.5 border border-border rounded-lg text-sm bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
        </div>

        {erro && (
          <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger flex items-start gap-2 text-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{erro}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando gerentes...
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-text-secondary italic">
              {gerentes.length === 0 ? 'Nenhum gerente cadastrado.' : 'Nenhum gerente corresponde à busca.'}
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
              {filtrados.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => selecionar(g)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-primary/5 transition-colors cursor-pointer group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate group-hover:text-primary transition-colors">
                      {g.nome}
                    </p>
                    <p className="text-[11px] text-text-secondary truncate">{g.email}</p>
                  </div>
                  {g.invite_used ? (
                    <span title="Já ativou a conta" className="shrink-0 text-emerald-600">
                      <UserCheck size={16} />
                    </span>
                  ) : (
                    <span title="Ainda não ativou a conta (convite pendente)" className="shrink-0 text-amber-500">
                      <UserX size={16} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
