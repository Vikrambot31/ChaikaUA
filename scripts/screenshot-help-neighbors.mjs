import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..').replace(/^\/([A-Za-z]:)/, '$1');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9331;
const TARGET_URL = 'http://localhost:9001/screen/help-neighbors';
const OUT = path.join(ROOT, 'tmp-help-neighbors-cdp.png');
const PROFILE = path.join(os.tmpdir(), `chaika-cdp-${Date.now()}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let chrome = null;

let chromeErr = '';

const waitJson = async (url, attempts = 150) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`CDP not ready: ${url}\n${chromeErr}`);
};

let seq = 0;
const pending = new Map();

const send = (ws, method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});

const waitEvent = (events, name, timeoutMs = 10000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    events.delete(name);
    reject(new Error(`Timed out waiting for ${name}`));
  }, timeoutMs);
  events.set(name, (payload) => {
    clearTimeout(timeout);
    events.delete(name);
    resolve(payload);
  });
});

try {
  let tabs;
  try {
    tabs = await waitJson(`http://127.0.0.1:${PORT}/json`, 5);
  } catch {
    chrome = spawn(CHROME, [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--window-size=430,900',
      'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr?.on('data', (chunk) => {
      chromeErr += String(chunk);
    });
    tabs = await waitJson(`http://127.0.0.1:${PORT}/json`);
  }
  console.log('CDP tabs:', tabs.length);
  const wsUrl = tabs[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  const events = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    const handler = events.get(msg.method);
    if (handler) handler(msg.params);
  });

  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  console.log('CDP connected');
  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');

  await send(ws, 'Page.navigate', { url: 'http://localhost:9001/' });
  console.log('Navigated root');
  await waitEvent(events, 'Page.loadEventFired', 15000).catch(() => {});
  await send(ws, 'Runtime.evaluate', {
    expression: `
      localStorage.setItem('@help_neighbors_first_visit_splash_seen', 'true');
      localStorage.setItem('@chaika:intro_video_shown', '1');
      localStorage.setItem('@chaika:onboarding:v1', 'true');
      localStorage.setItem('chaika_onboarding_completed', 'true');
      true;
    `,
  });

  await send(ws, 'Page.navigate', { url: TARGET_URL });
  console.log('Navigated target');
  await waitEvent(events, 'Page.loadEventFired', 15000).catch(() => {});
  await sleep(2500);

  await send(ws, 'Runtime.evaluate', {
    expression: `
      [...document.querySelectorAll('*')]
        .find((el) => /Пропуст|Skip/.test(el.textContent || ''))
        ?.click();
      true;
    `,
  }).catch(() => {});
  await sleep(3000);

  const info = await send(ws, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `
      ({
        text: document.body.innerText.slice(0, 2000),
        images: [...document.images].slice(0, 20).map((img) => ({
          src: img.currentSrc || img.src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          rect: (() => { const r = img.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; })()
        }))
      })
    `,
  });

  const screenshot = await send(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile(OUT, Buffer.from(screenshot.data, 'base64'));
  console.log(JSON.stringify({ out: OUT, info: info.result.value }, null, 2));
  ws.close();
} finally {
  chrome?.kill();
}
