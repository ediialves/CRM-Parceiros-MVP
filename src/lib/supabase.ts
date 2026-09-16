/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Pre-emptively intercept and handle invalid refresh token errors globally
// so background auto-refresh doesn't bubble up as an uncaught promise rejection
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const message = reason?.message || String(reason || '');
    if (
      message.includes('Invalid Refresh Token') ||
      message.includes('Refresh Token Not Found') ||
      message.includes('refresh_token_not_found') ||
      reason?.name === 'AuthSessionMissingError'
    ) {
      // Prevent browser error reporting
      event.preventDefault();
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        /* storage restricted */
      }
    }
  });
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL and Anon Key are missing in environment variables.');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
