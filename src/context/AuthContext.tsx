import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { invalidarCache } from '../lib/dataCache';

interface User {
  id: string;
  email: string;
  nome: string;
  role: 'admin' | 'gerente';
}

export interface GerenteResumo {
  id: string;
  nome: string;
  email: string;
  invite_used: boolean;
}

interface AuthContextType {
  /** Perfil EFETIVO: o gerente observado durante o modo de visão, senão o real. */
  user: User | null;
  /** Quem está de fato logado. Não muda no modo de visão. */
  realUser: User | null;
  /** Verdadeiro enquanto um admin está vendo o sistema como um gerente. */
  impersonando: boolean;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  verComoGerente: (gerente: GerenteResumo) => void;
  sairDoModoVisao: () => void;
}

// sessionStorage (e não localStorage) de propósito: o modo de visão morre junto
// com a aba. Um admin que fecha o navegador não volta dias depois ainda vendo a
// tela de outra pessoa sem perceber.
const CHAVE_IMPERSONACAO = 'capro:vendo-como-gerente';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [realUser, setRealUser] = useState<User | null>(null);
  const [gerenteObservado, setGerenteObservado] = useState<User | null>(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE_IMPERSONACAO);
      return salvo ? (JSON.parse(salvo) as User) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const hasLoggedAccess = useRef(false);
  // auth_id do perfil que ja esta carregado, para nao rebuscar o mesmo usuario.
  const loadedAuthIdRef = useRef<string | null>(null);

  /**
   * Rebusca o perfil so quando o usuario logado muda de fato.
   *
   * `getSession()` e `onAuthStateChange` disparam os dois no boot, e o Supabase ainda
   * emite TOKEN_REFRESHED sozinho (~1x/hora e ao voltar para a aba). Como cada
   * `setUser` criava um objeto novo, as paginas com `useEffect(..., [user])` refaziam
   * todo o fetch de dados a cada um desses eventos - a tela recarregava sozinha.
   */
  const fetchUserProfile = async (userId: string, force = false) => {
    if (!force && loadedAuthIdRef.current === userId) {
      setLoading(false);
      return;
    }
    loadedAuthIdRef.current = userId;
    console.log('DEBUG [AuthContext]: Fetching profile for', userId);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', userId)
        .single();
      
      if (error) {
        console.error('DEBUG [AuthContext]: Error fetching profile:', error);
        throw error;
      }
      
      console.log('DEBUG [AuthContext]: Profile loaded:', data);
      if (data) {
        setRealUser(data as User);

        // Log access once per session
        if (!hasLoggedAccess.current) {
          hasLoggedAccess.current = true;
          supabase
            .from('access_logs')
            .insert({ user_id: data.id })
            .then(({ error: logError }) => {
              if (logError) console.error('Error logging access:', logError);
            });
        }
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
      loadedAuthIdRef.current = null; // libera para nova tentativa
      setRealUser(null);
    } finally {
      setLoading(false);
    }
  };

  const cleanSupabaseLocalStorage = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.error('Error clearing local storage:', e);
    }
  };

  const limparImpersonacao = () => {
    try {
      sessionStorage.removeItem(CHAVE_IMPERSONACAO);
    } catch {
      /* aba privada / storage bloqueado: o estado em memória já basta */
    }
    setGerenteObservado(null);
  };

  /**
   * Entra no modo "ver como gerente".
   *
   * Não há troca de sessão nem de token: o admin continua autenticado como ele
   * mesmo e as policies de admin (`ALL` em todas as tabelas de dados) é que
   * liberam a leitura. O que muda é só o perfil EFETIVO que as telas enxergam —
   * como elas filtram por `user.id` (ex.: `.eq('gerente_id', user.id)` no
   * MeuDashboard), passar o id do gerente já reproduz a visão dele.
   *
   * `invalidarCache()` é obrigatório aqui: o `dataCache` tem chaves sem recorte
   * de usuário (`dashboard:parceiros`), então sem isso o admin veria os 4.5k
   * parceiros da base dentro da visão do gerente — ou o contrário ao sair.
   */
  const verComoGerente = (gerente: GerenteResumo) => {
    const perfil: User = {
      id: gerente.id,
      nome: gerente.nome,
      email: gerente.email,
      role: 'gerente'
    };
    invalidarCache();
    try {
      sessionStorage.setItem(CHAVE_IMPERSONACAO, JSON.stringify(perfil));
    } catch {
      /* idem: sem persistência, o modo dura só enquanto a página não recarregar */
    }
    setGerenteObservado(perfil);
  };

  const sairDoModoVisao = () => {
    invalidarCache();
    limparImpersonacao();
  };

  useEffect(() => {
    // Global listener for unhandled auth/token refresh rejection errors
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      const message = reason?.message || String(reason || '');
      if (
        message.includes('Invalid Refresh Token') ||
        message.includes('Refresh Token Not Found') ||
        message.includes('refresh_token_not_found') ||
        reason?.name === 'AuthSessionMissingError'
      ) {
        console.warn('DEBUG [AuthContext]: Intercepted invalid refresh token error, clearing session.');
        event.preventDefault(); // Prevent bubbling as uncaught error
        cleanSupabaseLocalStorage();
        supabase.auth.signOut().catch(() => {}).finally(() => {
          setRealUser(null);
          setLoading(false);
        });
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Check active session on mount
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.warn('DEBUG [AuthContext]: Error in getSession:', error.message);
        cleanSupabaseLocalStorage();
        supabase.auth.signOut().catch(() => {}).finally(() => {
          setRealUser(null);
          setLoading(false);
        });
        return;
      }
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.warn('DEBUG [AuthContext]: Exception in getSession:', err);
      cleanSupabaseLocalStorage();
      supabase.auth.signOut().catch(() => {}).finally(() => {
        setRealUser(null);
        setLoading(false);
      });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('DEBUG [AuthContext]: Auth State Change:', event, session?.user?.id);
      if (event === 'SIGNED_OUT' || !session) {
        console.log('DEBUG [AuthContext]: No session, clearing user');
        // Sem isto, o proximo usuario a logar nesta aba veria o dado cacheado do anterior.
        invalidarCache();
        loadedAuthIdRef.current = null;
        limparImpersonacao();
        setRealUser(null);
        setLoading(false);
      } else if (session) {
        fetchUserProfile(session.user.id);
      }
    });

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error during signOut:', err);
    } finally {
      cleanSupabaseLocalStorage();
      invalidarCache();
      loadedAuthIdRef.current = null;
      limparImpersonacao();
      setRealUser(null);
    }
  };

  // Só um admin de verdade pode estar observando alguém. A checagem contra
  // `realUser` evita que um estado velho no sessionStorage sobreviva a uma troca
  // de conta na mesma aba e coloque um gerente vendo a visão de outro.
  const impersonando = realUser?.role === 'admin' && gerenteObservado !== null;
  const user = impersonando ? gerenteObservado : realUser;

  // Cai para `false` durante o modo de visão de propósito: é isso que faz o menu
  // e as rotas `adminOnly` se comportarem como se comportam para o gerente —
  // que é justamente a visão que se quer inspecionar.
  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{ user, realUser, impersonando, isAdmin, loading, signOut, verComoGerente, sairDoModoVisao }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
