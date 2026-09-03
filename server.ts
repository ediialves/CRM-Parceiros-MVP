import express from "express";
import compression from "compression";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Modo de desenvolvimento é OPT-IN explícito (NODE_ENV=development).
 *
 * Antes a condição era `NODE_ENV !== "production"`, ou seja: qualquer deploy que
 * esquecesse de setar NODE_ENV subia servindo o Vite dev server — 70 módulos soltos,
 * transpilados um a um sob demanda, sem bundle. Invertida para que o padrão (variável
 * ausente) seja o modo de produção, que é o único que faz sentido no Cloud Run.
 */
const isDev = process.env.NODE_ENV === "development";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Gzip/deflate. Sem isso o bundle sai cru (~1,9 MB em vez de ~525 KB) mesmo
    // quando o navegador manda `Accept-Encoding: gzip`.
    app.use(compression());

    const distPath = path.join(process.cwd(), 'dist');

    // Os arquivos em /assets têm hash de conteúdo no nome (index-<hash>.js), então
    // podem ser cacheados para sempre: um deploy novo gera um nome novo. O restante
    // (principalmente o index.html, que aponta para esses nomes) precisa revalidar,
    // senão o navegador serve um HTML velho apontando para assets que não existem mais.
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }));

    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));

    // Fallback para SPA: todas as rotas não encontradas retornam o index.html
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Mode: ${isDev ? 'development (vite middleware)' : 'production (dist)'}`);
  });
}

startServer();
