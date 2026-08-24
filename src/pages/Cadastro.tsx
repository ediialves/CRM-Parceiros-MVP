import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { UserPlus } from 'lucide-react';

export const Cadastro: React.FC = () => {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    password: '',
    invite_code: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const codigoNormalizado = formData.invite_code.toUpperCase().trim();

    try {
      // 1. Validar código via RPC
      const { data: inviteData, error: inviteError } = await supabase
        .rpc('validate_invite_code', { code: codigoNormalizado });

      if (inviteError || !inviteData || inviteData.length === 0) {
        setError('Código de convite inválido ou já utilizado.');
        setLoading(false);
        return;
      }

      // 2. Criar conta no Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password
      });

      if (authError || !authData.user) {
        setError('Erro ao criar conta: ' + (authError?.message || 'Erro desconhecido'));
        setLoading(false);
        return;
      }

      // 3. Vincular via RPC
      const { data: updateSuccess, error: updateError } = await supabase
        .rpc('complete_invite_signup', {
          invite_code_input: codigoNormalizado,
          new_user_id: authData.user.id
        });

      if (updateError || !updateSuccess) {
        setError('Erro ao ativar conta. Entre em contato com o administrador.');
        setLoading(false);
        return;
      }

      // 4. Redirecionar
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro no cadastro.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 bg-surface p-8 rounded-2xl shadow-xl border border-border">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <UserPlus className="text-primary" size={32} />
          </div>
          <h1 className="text-2xl font-black text-primary uppercase tracking-tight">Criar Conta Gerente</h1>
          <p className="text-text-secondary mt-2">Use seu código de convite para começar</p>
        </div>

        <form onSubmit={handleCadastro} className="space-y-4">
          {error && (
            <div className="bg-danger/10 border border-danger p-3 rounded-lg text-danger text-sm text-center">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-semibold text-text-primary">Código de Convite</label>
            <input
              type="text"
              value={formData.invite_code}
              onChange={(e) => setFormData({ ...formData, invite_code: e.target.value })}
              required
              className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all uppercase placeholder:normal-case font-mono"
              placeholder="Ex: AB12CD34"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-text-primary">Nome Completo</label>
            <input
              type="text"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              required
              className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder="Seu nome"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-text-primary">E-mail</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder="email@exemplo.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-text-primary">Senha</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={6}
              className="w-full p-3 rounded-lg border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <Button type="submit" className="w-full h-12 mt-4" isLoading={loading}>
            Cadastrar e Entrar
          </Button>

          <p className="text-center text-sm text-text-secondary pt-2">
            Já tem conta?{' '}
            <Link to="/login" className="text-primary font-bold hover:underline">
              Fazer Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};
