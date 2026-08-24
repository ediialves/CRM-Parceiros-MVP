import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export const RedefinirSenha: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if there is an active session or recovery token
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setHasValidSession(true);
        }
      } catch (err) {
        console.error('Error checking recovery session:', err);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();

    // Listen to PASSWORD_RECOVERY event from Supabase auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasValidSession(true);
        setCheckingSession(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      
      // Sign out to ensure clean state with new password
      await supabase.auth.signOut();

      // Redirect after brief delay
      setTimeout(() => {
        navigate('/login', {
          state: { message: 'Senha redefinida com sucesso! Faça login com a sua nova senha.' }
        });
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Erro ao redefinir senha. Tente solicitar um novo link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-surface p-8 rounded-2xl shadow-xl border border-border">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <KeyRound className="text-primary" size={32} />
          </div>
          <h1 className="text-2xl font-black text-primary uppercase tracking-tight">Redefinir Senha</h1>
          <p className="text-text-secondary mt-2">Crie uma nova senha para sua conta</p>
        </div>

        {checkingSession ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
            <p className="text-sm text-text-secondary">Validando link de recuperação...</p>
          </div>
        ) : success ? (
          <div className="space-y-6">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                Senha redefinida com sucesso!
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Redirecionando para a página de login...
              </p>
            </div>

            <Button
              type="button"
              className="w-full h-12"
              onClick={() => navigate('/login')}
            >
              Ir para o Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            {error && (
              <div className="bg-danger/10 border border-danger p-3 rounded-lg text-danger text-sm text-center">
                {error}
              </div>
            )}

            {!hasValidSession && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 rounded-lg text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Certifique-se de ter acessado esta página através do link enviado para seu e-mail.
                </span>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-text-primary">Nova Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-text-primary">Confirmar Nova Senha</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>

            <Button type="submit" className="w-full h-12" isLoading={loading}>
              Salvar Nova Senha
            </Button>

            <p className="text-center text-sm text-text-secondary">
              Lembrou sua senha?{' '}
              <Link to="/login" className="text-primary font-bold hover:underline">
                Voltar para o Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
