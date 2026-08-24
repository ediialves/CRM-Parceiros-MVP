import React, { useState } from 'react';
import { useNavigate, Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { LogIn, Mail, ArrowLeft, CheckCircle2, X } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Forgot password modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = (location.state as { message?: string } | null)?.message;

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;
      
      console.log('DEBUG [Login]: Auth successful', authData.user?.id);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message === 'Invalid login credentials' ? 'Credenciais inválidas. Verifique seu e-mail e senha.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;

    setForgotLoading(true);
    try {
      // Direct client-side call to Supabase native auth reset
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
    } catch (err) {
      console.error('Error requesting password reset:', err);
    } finally {
      setForgotLoading(false);
      setForgotSubmitted(true);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-surface p-8 rounded-2xl shadow-xl border border-border relative">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <LogIn className="text-primary" size={32} />
          </div>
          <h1 className="text-2xl font-black text-primary uppercase tracking-tight">Login Parceiros</h1>
          <p className="text-text-secondary mt-2">Plataforma de Engajamento ContaAzul</p>
        </div>

        {successMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3 rounded-lg text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-danger/10 border border-danger p-3 rounded-lg text-danger text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-text-primary">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="seu@e-mail.com"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-text-primary">Senha</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotSubmitted(false);
                    setIsForgotModalOpen(true);
                  }}
                  className="text-xs text-primary font-medium hover:underline cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <Button type="submit" className="w-full h-12" isLoading={loading}>
            Acessar Plataforma
          </Button>

          <p className="text-center text-sm text-text-secondary">
            Não tem uma conta?{' '}
            <Link to="/cadastro" className="text-primary font-bold hover:underline">
              Cadastrar com convite
            </Link>
          </p>
        </form>
      </div>

      {/* Modal de Esqueci Minha Senha */}
      {isForgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button
              type="button"
              onClick={() => setIsForgotModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                <Mail className="text-primary" size={24} />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Recuperar Senha</h2>
              <p className="text-sm text-text-secondary mt-1">
                Digite seu e-mail para receber as instruções de redefinição
              </p>
            </div>

            {forgotSubmitted ? (
              <div className="space-y-6">
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                    Solicitação enviada
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">
                    Se o e-mail informado estiver cadastrado, você receberá um link com instruções para redefinir sua senha em instantes.
                  </p>
                </div>

                <Button
                  type="button"
                  className="w-full h-11"
                  onClick={() => setIsForgotModalOpen(false)}
                >
                  Voltar ao Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-text-primary">E-mail cadastrado</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoFocus
                    className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                    placeholder="seu@e-mail.com"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-1/2 h-11"
                    onClick={() => setIsForgotModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="w-1/2 h-11"
                    isLoading={forgotLoading}
                  >
                    Enviar Link
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
