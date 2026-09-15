import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { gerarInviteCode } from '../../lib/inviteCode';
import { UserPlus, X, Loader2, CheckCircle2, Copy, Check, AlertCircle } from 'lucide-react';

interface NovoGerenteModalProps {
  onClose: () => void;
  onCadastrado: (nome: string) => void;
}

// Quantas vezes tentamos outro código quando o UNIQUE de `users.invite_code`
// reclama. Com 36^8 combinações a colisão é remota, mas ela é silenciosa e
// barata de tratar — o caro seria devolver "erro" para o admin sem motivo.
const MAX_TENTATIVAS_CODIGO = 5;

export const NovoGerenteModal: React.FC<NovoGerenteModalProps> = ({ onClose, onCadastrado }) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [codigoGerado, setCodigoGerado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<'codigo' | 'mensagem' | null>(null);

  const urlCadastro = `${window.location.origin}/cadastro`;

  const mensagemPronta = codigoGerado
    ? `Oi, ${nome.trim()}! Seu acesso ao CAPro está liberado.\n\n`
      + `Código de convite: ${codigoGerado}\n`
      + `Cadastre-se em: ${urlCadastro}\n\n`
      + `Use o e-mail ${email.trim().toLowerCase()} e escolha uma senha de no mínimo 6 caracteres. `
      + `O código funciona uma única vez.`
    : '';

  const copiar = async (texto: string, qual: 'codigo' | 'mensagem') => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('Não foi possível copiar automaticamente. Selecione o texto e copie à mão.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nomeLimpo = nome.trim();
    const emailLimpo = email.trim().toLowerCase();

    if (!nomeLimpo || !emailLimpo) {
      setErro('Preencha o nome e o e-mail.');
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      // Só criamos a linha em `users` com o convite pendente — a conta de
      // autenticação em si nasce quando a pessoa resgata o código em /cadastro
      // (signUp + complete_invite_signup). Criar o usuário no Auth daqui exigiria
      // a service role key, que não pode viver no frontend.
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_CODIGO; tentativa++) {
        const codigo = gerarInviteCode();

        const { error } = await supabase.from('users').insert({
          id: crypto.randomUUID(),
          nome: nomeLimpo,
          email: emailLimpo,
          role: 'gerente',
          invite_code: codigo,
          invite_used: false
        });

        if (!error) {
          setCodigoGerado(codigo);
          onCadastrado(nomeLimpo);
          return;
        }

        // 23505 = unique_violation. Precisa distinguir QUAL unique estourou:
        // colisão de código a gente resolve sozinho, e-mail repetido é decisão
        // do admin.
        if (error.code === '23505' && error.message.includes('users_invite_code_key')) {
          continue;
        }
        if (error.code === '23505') {
          throw new Error(`Já existe um usuário cadastrado com o e-mail ${emailLimpo}.`);
        }
        throw error;
      }

      throw new Error('Não foi possível gerar um código de convite único. Tente novamente.');
    } catch (err: any) {
      console.error('Erro ao cadastrar gerente:', err);
      setErro(err.message || 'Erro ao cadastrar o gerente.');
    } finally {
      setSalvando(false);
    }
  };

  const cadastrarOutro = () => {
    setNome('');
    setEmail('');
    setCodigoGerado(null);
    setErro(null);
    setCopiado(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-border rounded-xl shadow-xl w-full max-w-lg p-6 relative flex flex-col gap-4 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          disabled={salvando}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-surface text-text-secondary transition-colors cursor-pointer disabled:opacity-50"
        >
          <X className="w-4.5 h-4.5" />
        </button>

        <div>
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-1.5">
            <UserPlus className="w-5 h-5 text-primary" />
            Cadastrar Gerente
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Gera o código de convite de um gerente, sem precisar montar planilha.
          </p>
        </div>

        {codigoGerado ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center gap-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <h3 className="font-bold text-lg text-text-primary">{nome.trim()} cadastrado(a)</h3>
              <p className="text-xs text-text-secondary">Código de acesso:</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono font-bold text-2xl tracking-[0.2em] text-text-primary bg-white border border-border rounded-lg px-4 py-2">
                  {codigoGerado}
                </span>
                <button
                  type="button"
                  onClick={() => copiar(codigoGerado, 'codigo')}
                  title="Copiar código"
                  className="p-2.5 rounded-lg border border-border bg-white hover:bg-primary/5 hover:border-primary/20 hover:text-primary text-text-secondary transition-all cursor-pointer"
                >
                  {copiado === 'codigo' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-text-primary">Mensagem pronta para enviar</p>
                <button
                  type="button"
                  onClick={() => copiar(mensagemPronta, 'mensagem')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-white hover:bg-primary/5 hover:border-primary/20 hover:text-primary text-text-secondary text-xs font-semibold transition-all cursor-pointer"
                >
                  {copiado === 'mensagem' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado === 'mensagem' ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line font-mono">
                {mensagemPronta}
              </p>
            </div>

            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs leading-relaxed text-text-secondary flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
              <span>
                Guarde o código agora: ele não fica visível em nenhuma outra tela. Se perder, cadastre
                de novo com outro e-mail ou peça para alguém consultar no banco.
              </span>
            </div>

            {erro && (
              <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={cadastrarOutro}
                className="px-4 py-2 bg-surface hover:bg-surface/80 border border-border text-text-primary font-semibold rounded-lg text-sm transition-colors cursor-pointer"
              >
                Cadastrar outro
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {erro && (
              <div className="p-3 bg-danger/5 border border-danger/20 rounded-lg text-danger flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{erro}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-primary">Nome completo</label>
              <input
                type="text"
                required
                autoFocus
                disabled={salvando}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Carolina Guedert Ramos"
                className="w-full p-2.5 border border-border rounded-lg text-sm bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <p className="text-[11px] text-text-secondary">
                Use o nome completo, igual ao da planilha de parceiros — é por esse texto que o
                sistema mostra o gerente na carteira.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-primary">E-mail</label>
              <input
                type="email"
                required
                disabled={salvando}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@contaazul.com"
                className="w-full p-2.5 border border-border rounded-lg text-sm bg-surface text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>

            <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg text-xs leading-relaxed text-text-secondary space-y-1">
              <p className="font-bold text-text-primary mb-1">O que acontece ao concluir:</p>
              <p>• O sistema gera um código de convite de 8 caracteres e mostra na tela.</p>
              <p>• A pessoa se cadastra em <span className="font-mono">{urlCadastro}</span> com esse código e escolhe a própria senha.</p>
              <p>• O código vale uma única vez.</p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                disabled={salvando}
                onClick={onClose}
                className="px-4 py-2 bg-surface hover:bg-surface/80 border border-border text-text-primary font-semibold rounded-lg text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || !nome.trim() || !email.trim()}
                className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg text-sm shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {salvando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cadastrando...
                  </>
                ) : (
                  'Concluir'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
