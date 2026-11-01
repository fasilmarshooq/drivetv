import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}public/vendor/libmedia`;
const revision = '152f629d3021fd8013efa464fcb7b55f9fbe7753';
const checksums = JSON.parse(await readFile(new URL('./libmedia-sha256.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
await cp(`${root}node_modules/@libmedia/avplayer/dist/esm`, output, { recursive: true });
await cp(`${root}node_modules/@libmedia/avnetwork/COPYING.LGPLv3`, `${output}/COPYING.LGPLv3`);
const assets = ['decode/eac3.wasm', 'decode/ac3.wasm', 'decode/aac.wasm', 'decode/h264.wasm', 'decode/hevc.wasm', 'decode/mjpeg.wasm', 'resample/resample.wasm', 'stretchpitch/stretchpitch.wasm'];
await Promise.all(assets.map(async asset => {
  const target = `${output}/wasm/${asset}`;
  let data;
  try { data = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!data) {
    const response = await fetch(`https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@${revision}/dist/${asset}`, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Could not prepare decoder ${asset}: HTTP ${response.status}`);
    data = new Uint8Array(await response.arrayBuffer());
  }
  if (createHash('sha256').update(data).digest('hex') !== checksums[asset]) {
    throw new Error(`Integrity check failed for decoder ${asset}. Remove the cached asset and investigate before rebuilding.`);
  }
  await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
  await writeFile(target, data);
}));
await writeFile(`${output}/NOTICE.txt`, `libmedia / AVPlayer 1.3.1, Copyright (C) 2024-present Gaoxing Zhao and contributors.\nLGPL-3.0-or-later; see COPYING.LGPLv3.\nUnmodified, separately loaded library and decoder modules.\nExact source and build instructions: https://github.com/zhaohappy/libmedia/tree/${revision}\nSource archive: https://github.com/zhaohappy/libmedia/archive/${revision}.tar.gz\nDecoder dependencies and corresponding source/build inputs are identified in that revision's build scripts and external directories.\n`);
console.log('Prepared the pinned libmedia player and decoder/support assets.');
