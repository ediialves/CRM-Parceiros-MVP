import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { LogIn } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-surface p-8 rounded-2xl shadow-xl border border-border">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <LogIn className="text-primary" size={32} />
          </div>
          <h1 className="text-2xl font-black text-primary uppercase tracking-tight">Login Parceiros</h1>
          <p className="text-text-secondary mt-2">Plataforma de Engajamento ContaAzul</p>
        </div>

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
              <label className="text-sm font-semibold text-text-primary">Senha</label>
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

          <Button type="submit" className="w-full h-12" loading={loading}>
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
    </div>
  );
};
