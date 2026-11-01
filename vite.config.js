import { fileURLToPath } from 'node:url';

export default {
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [{
    name: 'production-browser-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: [
          "default-src 'none'", "base-uri 'self'", "object-src 'none'",
          "script-src 'self' blob: 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob: https://image.tmdb.org",
          "connect-src 'self' https://www.googleapis.com https://*.googleusercontent.com https://api.themoviedb.org",
          "media-src 'self' blob: https://www.googleapis.com https://*.googleusercontent.com",
          "worker-src 'self' blob:", "form-action 'none'",
        ].join('; ') }, injectTo: 'head-prepend' },
        { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head-prepend' },
      ];
    },
  }],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        compatibility: fileURLToPath(new URL('./compat.html', import.meta.url)),
      },
    },
  },
};
