import { createServer } from 'vite';
import { spawn } from 'node:child_process';

// Ignore real .env files: browser journeys must never contact services with real keys.
const server = await createServer({
  envFile: false,
  define: {
    'import.meta.env.VITE_GOOGLE_DRIVE_API_KEY': JSON.stringify(''),
    'import.meta.env.VITE_TMDB_READ_TOKEN': JSON.stringify('fake-tmdb-token'),
    'import.meta.env.VITE_GOOGLE_DRIVE_FOLDER': JSON.stringify(''),
  },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
await server.listen();
try {
  for (const file of ['focus.mjs', 'browser.mjs', 'artwork.mjs', 'player.mjs', 'library.mjs']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/${file}`], {
        stdio: 'inherit', env: { ...process.env, APP_URL: 'http://127.0.0.1:5175' },
      });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} failed (${code})`)));
    });
  }
} finally { await server.close(); }
