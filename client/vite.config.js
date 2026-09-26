// Configuración de Vite. En desarrollo, /ws se redirige al servidor Node.
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Lee el .env de la raíz solo para saber el puerto del servidor (nada llega al navegador:
  // Vite solo expone variables con prefijo VITE_, y aquí no hay ninguna).
  const env = loadEnv(mode, '..', '');
  const serverPort = env.PORT || 3000;

  return {
    server: {
      port: 5173,
      proxy: {
        '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
        '/api': { target: `http://localhost:${serverPort}` },
      },
    },
    build: {
      outDir: 'dist',
      // Dos páginas: el hub (index.html) y la escena de juego (play.html)
      rollupOptions: {
        input: { hub: 'index.html', play: 'play.html' },
      },
      chunkSizeWarningLimit: 1500,
    },
  };
});
