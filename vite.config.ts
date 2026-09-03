import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          // Separa as bibliotecas grandes do codigo da aplicacao. Junto com as rotas
          // lazy do App.tsx, isso tira do caminho critico tudo que a tela atual nao usa
          // - em especial o xlsx (~325 KB), que so a tela de Importacao precisa.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (id.includes('xlsx')) return 'lib-xlsx';
            if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('chartjs-plugin')) return 'lib-chart';
            if (id.includes('@supabase')) return 'lib-supabase';
            if (id.includes('motion') || id.includes('framer')) return 'lib-motion';
            if (id.includes('lucide-react')) return 'lib-icons';
            if (id.includes('@dnd-kit')) return 'lib-dnd';
            if (id.includes('react-router')) return 'lib-router';
            if (id.includes('/react/') || id.includes('react-dom')) return 'lib-react';
            return 'lib-outros';
          },
        },
      },
    },
  };
});
