import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  nome: string;
  role: 'admin' | 'gerente';
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
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
        setUser(data as User);

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
      setUser(null);
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
          setUser(null);
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
          setUser(null);
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
        setUser(null);
        setLoading(false);
      });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('DEBUG [AuthContext]: Auth State Change:', event, session?.user?.id);
      if (event === 'SIGNED_OUT' || !session) {
        console.log('DEBUG [AuthContext]: No session, clearing user');
        loadedAuthIdRef.current = null;
        setUser(null);
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
      loadedAuthIdRef.current = null;
      setUser(null);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
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
