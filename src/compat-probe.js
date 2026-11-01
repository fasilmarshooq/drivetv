// An explicitly requested compatibility spike, separate from the normal player.
import { listVideos, mediaUrl } from './drive.js';
import { clockTime } from './media.js';
import { moveFocus } from './navigation.js';
import { initialConfig } from './config.js';
const appBase = new URL(import.meta.env.BASE_URL, location.href);
const $ = id => document.getElementById(id);
const log = message => { $('status').textContent = message; };
let player;
let file;
let config;
let starting = false;
let paused = false;
let interval;
const counts = { bytes: 0, requests: 0 };
const sampleMode = new URLSearchParams(location.search).get('sample') === '1';
if (sampleMode) {
  $('title').textContent = '12-second test pattern: HEVC 10-bit video, two Dolby 5.1 audio tracks, embedded English subtitles. Audio is a steady test tone.';
}
let operations = Promise.resolve();
function run(action) {
  operations = operations.then(async () => {
    const controls = [...document.querySelectorAll('button, select, input')];
    controls.forEach(control => { control.disabled = true; });
    try { await action(); }
    catch { log('That playback action could not finish. Try again or return to the library.'); }
    finally { controls.forEach(control => { control.disabled = false; }); }
  });
  return operations;
}

async function start() {
  if (starting) return;
  if (player) { await player.play(); paused = false; return; }
  starting = true;
  try {
    let localSource;
    if (sampleMode) {
      const response = await fetch(new URL('samples/compat-fixture.mkv', appBase));
      if (!response.ok) throw new Error('The test sample could not load.');
      localSource = new File([await response.blob()], 'Compatibility sample.mkv');
      file = { name: localSource.name, size: String(localSource.size) };
    } else {
      config = initialConfig();
      if (!config?.key) throw new Error('Connect your library on the main Drive TV page first.');
      log('Finding your movie…');
      const files = await listVideos(config);
      const requested = new URLSearchParams(location.search).get('file');
      file = requested ? files.find(item => item.id === requested) : files[0];
      if (!file) throw new Error('No videos were found in this folder.');
      $('title').textContent = file.name;
    }
    const moduleUrl = new URL('vendor/libmedia/avplayer.js', appBase).href;
    const { default: AVPlayer } = await import(/* @vite-ignore */ moduleUrl);
    AVPlayer.setLogLevel(3);
    class DriveLoader extends AVPlayer.IOLoader.CustomIOLoader {
      constructor() { super(); this.position = 0; this.cacheStart = -1; this.cache = new Uint8Array(); this.controller = null; this.stopped = false; }
      get ext() { return file.name.split('.').pop(); }
      get name() { return 'Drive original'; }
      async open() { this.stopped = false; return 0; }
      async size() { return BigInt(file.size); }
      async seek(position) { this.position = Number(position); return 0; }
      async read(buffer) {
        if (this.stopped || this.position >= Number(file.size)) return -1048576;
        if (this.position < this.cacheStart || this.position >= this.cacheStart + this.cache.length) {
          this.controller = new AbortController();
          const start = this.position;
          const end = Math.min(start + 1024 * 1024 - 1, Number(file.size) - 1);
          const response = await fetch(mediaUrl(file, config.key), { headers: { Range: `bytes=${start}-${end}` }, signal: this.controller.signal });
          if (response.status !== 206) throw new Error('Google did not return the requested video range.');
          this.cache = new Uint8Array(await response.arrayBuffer());
          this.cacheStart = start;
          counts.bytes += this.cache.length; counts.requests++;
        }
        const offset = this.position - this.cacheStart;
        const count = Math.min(buffer.length, this.cache.length - offset);
        buffer.set(this.cache.subarray(offset, offset + count));
        this.position += count;
        return count;
      }
      async stop() { this.stopped = true; this.controller?.abort(); }
    }
    const decoderNames = { 7: 'mjpeg', 27: 'h264', 173: 'hevc', 86018: 'aac', 86019: 'ac3', 86056: 'eac3' };
    player = new AVPlayer({
      container: $('screen'), enableHardware: true, enableWebCodecs: true,
      enableWorker: false, enableWebGPU: false, preLoadTime: 3,
      checkUseMSE: () => false,
      getWasm(type, codec) {
        if (type === 'decoder' && !decoderNames[codec]) return null;
        const asset = type === 'decoder' ? `decode/${decoderNames[codec]}` : type === 'resampler' ? 'resample/resample' : 'stretchpitch/stretchpitch';
        return new URL(`vendor/libmedia/wasm/${asset}.wasm`, appBase).href;
      },
    });
    window.compatProbe = { player, counts };
    player.on('error', () => log('The compatibility engine reported a playback error.'));
    player.on('firstAudioRendered', () => log('Audio samples reached the browser audio output. Check that you can hear them.'));
    player.on('firstVideoRendered', () => log('Video rendering started. Checking audio…'));
    player.on('ended', () => { paused = true; });
    log('Reading the MKV tracks…');
    await AVPlayer.startAudioContext();
    await player.load(localSource || new DriveLoader(), { maxProbeDuration: 1 });
    const streams = player.getStreams();
    window.compatProbe.tracks = streams.map(stream => ({ id: stream.id, type: stream.codecparProxy.codecType, codec: stream.codecparProxy.codecId, language: stream.metadata.language, title: stream.metadata.title }));
    for (const stream of streams) {
      if (![1, 3].includes(stream.codecparProxy.codecType)) continue;
      const option = document.createElement('option');
      option.value = String(stream.id);
      option.textContent = ({ hin: 'Hindi', tam: 'Tamil', eng: 'English' })[stream.metadata.language] || stream.metadata.title || stream.metadata.language || `Track ${stream.id}`;
      if (stream.codecparProxy.codecType === 1) { if ($('audio').options[0]?.value === '') $('audio').replaceChildren(); $('audio').append(option); }
      else $('subtitles').append(option);
    }
    $('seek').max = String(Number(player.getDuration()) / 1000);
    log('Starting video and Dolby audio decoder…');
    await player.play({ audio: true, video: true, subtitle: true });
    $('audio').value = String(player.getSelectedAudioStreamId());
    $('subtitles').value = player.hasSubtitle() ? String(player.getSelectedSubtitleStreamId()) : 'off';
    $('play').textContent = 'Play';
    interval = setInterval(() => {
      const stats = player.getStats();
      $('clock').textContent = `${clockTime(Number(player.currentTime) / 1000)} / ${clockTime(Number(player.getDuration()) / 1000)}`;
      if (document.activeElement !== $('seek')) $('seek').value = String(Number(player.currentTime) / 1000);
      $('stats').textContent = `Audio decoded: ${stats.audioFrameDecodeCount}; audio rendered: ${stats.audioFrameRenderCount}; audio decode errors: ${stats.audioDecodeErrorPacketCount}; video decoded: ${stats.videoFrameDecodeCount}; video rendered: ${stats.videoFrameRenderCount}; fetched: ${(counts.bytes / 1048576).toFixed(1)} MiB in ${counts.requests} ranges.`;
    }, 500);
  } catch (error) {
    log(error.message?.includes('Google') || error.message?.includes('Connect') ? error.message : 'Compatibility playback could not start. Check the browser support and connection.');
    if (player) { await player.destroy().catch(() => {}); player = null; }
  } finally { starting = false; }
}
$('play').onclick = () => run(start);
$('pause').onclick = () => run(async () => { if (!player || starting) return; if (paused) await player.play(); else await player.pause(); paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; });
async function seek(offset) { if (player && !starting) await player.seek(BigInt(Math.round(Math.max(0, Number(player.currentTime) + offset * 1000)))); }
$('rewind').onclick = () => run(() => seek(-10));
$('forward').onclick = () => run(() => seek(10));
$('seek').onchange = event => run(async () => { if (player && !starting) await player.seek(BigInt(Math.round(Number(event.target.value) * 1000))); });
$('audio').onchange = event => run(async () => { if (player && !starting) await player.selectAudio(Number(event.target.value)); });
$('subtitles').onchange = event => run(async () => {
  if (!player || starting) return;
  const off = event.target.value === 'off';
  if (!off && player.getSelectedSubtitleStreamId() !== Number(event.target.value)) await player.selectSubtitle(Number(event.target.value));
  player.setSubtitleEnable(!off);
});
$('fullscreen').onclick = () => run(() => $('screen').requestFullscreen());
window.addEventListener('pagehide', () => { clearInterval(interval); player?.destroy(); });
document.addEventListener('keydown', event => {
  if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) { event.preventDefault(); location.href = appBase.href; return; }
  moveFocus(event);
});
