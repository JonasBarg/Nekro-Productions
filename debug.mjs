// Headless Chrome CDP harness. Self-terminating. Writes to debug.out.txt AND stdout.
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = 'debug.out.txt';
const CHROME =
  process.env.CHROME ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = process.env.APP_URL || 'http://127.0.0.1:5173/';
const DEBUG_PORT = 9333;

function out(...a) {
  const line = a.join(' ');
  console.log(line);
  appendFileSync(OUT, line + '\n');
}

function withTimeout(p, ms) {
  return Promise.race([
    p,
    new Promise((res) => setTimeout(() => res(null), ms)),
  ]);
}

async function fetchJSON(u) {
  const r = await fetch(u);
  return r.json();
}

async function main() {
  appendFileSync(OUT, '\n========= RUN ' + new Date().toISOString() + ' =========\n');
  const child = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=C:\\temp\\cdp-profile',
    'about:blank',
  ], { stdio: 'pipe' });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => {
    const s = d.toString();
    if (/error|exception|failed|crash/i.test(s)) out('[chrome.stderr] ' + s.trim().slice(0, 200));
  });

  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await fetchJSON(`http://127.0.0.1:${DEBUG_PORT}/json/version`); break; }
    catch { await wait(250); }
  }
  if (!version) { out('CHROME DID NOT START'); child.kill('SIGKILL'); process.exit(2); }
  out('devtools ws:', version.webSocketDebuggerUrl);

  const targets = await fetchJSON(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
  const tab = targets.find((t) => t.type === 'page');
  if (!tab) { out('no page target'); child.kill('SIGKILL'); process.exit(2); }

  out('target ws url set:', !!tab.webSocketDebuggerUrl);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) { const { resolve } = pending.get(msg.id); pending.delete(msg.id); resolve(msg.result || {}); }
      if (msg.method === 'Runtime.exceptionThrown') {
        const e = msg.params?.exceptionDetails;
        out('EXCEPTION:', e?.exception?.description || e?.text || 'exception');
        if (e?.exception?.stack) out('  ', e.exception.stack.split('\n').slice(0, 6).join('\n  '));
        if (e?.stackTrace?.callFrames) out('  frames:', e.stackTrace.callFrames.slice(0,4).map((f)=>`${f.functionName||'?'} ${f.url}:${f.lineNumber}:${f.columnNumber}`).join(' | '));
      } else if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Log.entryAdded') {
        const args = msg.params?.args || [];
        const txt = args.map((a) => a?.value ?? a?.description ?? '').join(' ');
        out('CONSOLE [' + (msg.params?.level || msg.params?.type || '?') + ']:', txt);
      }
    } catch {}
  });
  ws.on('error', (e) => out('WS ERROR:', e.message));

  await new Promise((res) => { ws.on('open', res); setTimeout(() => res(null), 4000); });
  if (ws.readyState !== WebSocket.OPEN) { out('WS not open'); child.kill('SIGKILL'); process.exit(2); }

  const send = (method, params = {}) =>
    withTimeout(new Promise((res) => { const id = msgId++; pending.set(id, { resolve: res }); ws.send(JSON.stringify({ id, method, params })); }), 4000);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');

  await send('Page.navigate', { url: URL });
  let loaded = false;
  const loadP = new Promise((res) => {
    const h = (data) => { try { const m=JSON.parse(data.toString()); if (m.method==='Page.frameStoppedLoading'||m.method==='Page.loadEventFired'){res(true);} } catch {} };
    ws.on('message', h);
  });
  await Promise.race([loadP, wait(12000)]).catch(() => {});
  out('loaded event seen:', loaded);
  await wait(4000); // let React render / errors surface

  const dom = await send('DOM.getDocument');
  let html = '';
  if (dom?.root?.nodeId) {
    const oh = await send('DOM.getOuterHTML', { nodeId: dom.root.nodeId });
    html = oh?.root?.outerHTML || '';
  }
  out('--- DOM root HTML (first 1500 chars) ---');
  out(html.slice(0, 1500));
  out('--- END ---');
  ws.close();
  child.kill('SIGKILL');
  process.exit(0);
}

main().catch((e) => { out('harness error:', e?.stack || e); process.exit(3); });
