import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function localUploadApiPlugin() {
  return {
    name: 'local-upload-api',
    configureServer(server: any) {
      server.middlewares.use('/api/upload', (req: any, res: any) => {
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk: any) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              const body = JSON.parse(bodyStr || '{}');
              const image = body?.image;
              if (!image) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'No image provided' }));
              }
              const base64Clean = image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
              const formData = new FormData();
              formData.append('key', '6d207e02198a847aa98d0a2a901485a5');
              formData.append('action', 'upload');
              formData.append('source', base64Clean);
              formData.append('format', 'json');

              const response = await fetch('https://freeimage.host/api/1/upload', {
                method: 'POST',
                body: formData
              });
              const data: any = await response.json();
              const directUrl = data?.image?.display_url || data?.image?.url || data?.data?.url;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, url: directUrl }));
            } catch (err: any) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err?.message || String(err) }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      localUploadApiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png'],
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
          navigateFallbackDenylist: [/^\/__/, /^https:\/\/firestore\.googleapis\.com/],
          runtimeCaching: [
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
                }
              }
            }
          ]
        },
        manifest: {
          name: 'Just Smile - Dental B2B',
          short_name: 'Just Smile',
          description: 'منصة تجارة B2B لمستلزمات طب الأسنان',
          theme_color: '#06b6d4',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      target: 'esnext',
      cssCodeSplit: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react/') || id.includes('react-dom/') || id.includes('scheduler/')) {
                return 'vendor-react';
              }
              if (id.includes('firebase/') || id.includes('@firebase/')) {
                return 'vendor-firebase';
              }
              if (id.includes('lucide-react/')) {
                return 'vendor-icons';
              }
              if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify') || id.includes('qrcode')) {
                return 'vendor-pdf';
              }
              if (id.includes('xlsx')) {
                return 'vendor-excel';
              }
            }
          },
        },
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
