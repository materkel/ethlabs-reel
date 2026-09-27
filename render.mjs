// Deterministic frame renderer: drives index.html via Chrome DevTools Protocol over a pipe,
// seeks window.seek(t) per frame, screenshots, pipes PNGs into ffmpeg.
//   node render.mjs stills 0.5 4.2 10      -> out/stills/*.png
//   node render.mjs video [fps] [from] [to] -> out/ethlabs.mp4
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || `${os.homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const FFMPEG = path.join(ROOT, 'bin/ffmpeg');
const W = 1920, H = 1080; const PAGE = process.env.PAGE || 'index.html';
const [mode = 'stills', ...rest] = process.argv.slice(2);
fs.mkdirSync(path.join(ROOT, 'out/stills'), { recursive: true });

const chrome = spawn(CHROME, [
  '--remote-debugging-pipe', '--single-process', '--no-sandbox', '--allow-file-access-from-files',
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--force-color-profile=srgb', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'elr-chrome-'))}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let errTail = '';
chrome.stderr.on('data', (d) => { errTail = (errTail + d).slice(-3000); });
chrome.on('exit', (code) => { console.error('chrome exited', code, errTail); process.exit(1); });

// --- minimal CDP client (NUL-delimited JSON over fd 3/4) ---
let nextId = 1, buf = '';
const pending = new Map(), waiters = [];
chrome.stdio[4].on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      for (const w of waiters.splice(0)) (w.method === msg.method ? w.res(msg.params) : waiters.push(w));
    }
  }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = nextId++;
  pending.set(id, { res, rej });
  chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
});
const waitFor = (method) => new Promise((res) => waiters.push({ method, res }));

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable');
await S('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const loaded = waitFor('Page.loadEventFired');
await S('Page.navigate', { url: pathToFileURL(path.join(ROOT, PAGE)).href + '?render' });
await loaded;
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const DUR = await evaluate('window.ready.then(() => window.DURATION)');
const shot = async (t) => {
  await evaluate(`window.seek(${t})`);
  const { data } = await S('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  return Buffer.from(data, 'base64');
};

if (mode === 'eval') { // node render.mjs eval 'expr' -> prints JSON
  console.log(JSON.stringify(await evaluate(rest.join(' '))));
} else if (mode === 'stills') {
  for (const t of rest.map(Number)) {
    const f = path.join(ROOT, `out/stills/t${t.toFixed(2).padStart(5, '0')}.png`);
    fs.writeFileSync(f, await shot(t));
    console.log(f);
  }
} else {
  const fps = Number(rest[0] || 60), from = Number(rest[1] || 0), to = Number(rest[2] || DUR);
  const outFile = path.resolve(ROOT, rest[3] || 'out/ethlabs.mp4');
  const wav = path.join(ROOT, 'out/audio.wav');
  const audio = fs.existsSync(wav) && !rest[3] ? ['-i', wav] : [];
  const ff = spawn(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...audio, '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-tune', 'film',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    ...(audio.length ? ['-c:a', 'aac', '-b:a', '320k', '-shortest'] : []), '-movflags', '+faststart', outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((to - from) * fps), t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const png = await shot(from + i / fps);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n}  ${((i + 1) / ((Date.now() - t0) / 1000)).toFixed(1)} fps`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(outFile, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
chrome.removeAllListeners('exit');
chrome.kill();
process.exit(0);
