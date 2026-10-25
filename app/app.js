import './polyfills.js'; // must come first (Safari)
import * as pdfjs from './vendor/pdf.min.mjs';
import { groupRows, convert, detectKind } from './core.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdf-worker.js', import.meta.url).href;

const files = { LCL: null, UTC: null };
const $ = id => document.getElementById(id);
let output = null;

// ---------------------------------------------------------------- picking

$('pickAll').addEventListener('change', e => {
  const picked = [...e.target.files].filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  e.target.value = '';
  if (!picked.length) return;
  const unknown = [];
  for (const f of picked) {
    const kind = detectKind(f.name);
    if (kind) files[kind] = f; else unknown.push(f);
  }
  // Files without LCL/UTC in the name fill whichever slot is still empty
  for (const f of unknown) {
    const free = !files.LCL ? 'LCL' : !files.UTC ? 'UTC' : null;
    if (free) files[free] = f;
  }
  update();
});

document.querySelectorAll('input[data-slot]').forEach(input => {
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) { files[input.dataset.slot] = f; update(); }
  });
});

$('swap').addEventListener('click', () => {
  [files.LCL, files.UTC] = [files.UTC, files.LCL];
  update();
});

function renderSlots() {
  for (const kind of ['LCL', 'UTC']) {
    const f = files[kind];
    const slot = document.querySelector(`.slot[data-kind=${kind}]`);
    slot.classList.toggle('filled', !!f);
    $('name' + kind).textContent = f ? f.name : (kind === 'LCL' ? 'Local-time pairing' : 'UTC pairing');
    $('state' + kind).textContent = f ? '✓' : '—';
  }
  $('swap').hidden = !(files.LCL && files.UTC);
}

// ---------------------------------------------------------------- converting

async function readRows(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const rows = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    rows.push(...groupRows(tc.items.map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5] }))));
  }
  return rows;
}

async function update() {
  renderSlots();
  showError('');
  $('result').hidden = true;
  output = null;
  if (!files.LCL || !files.UTC) return;

  try {
    const [lclRows, utcRows] = await Promise.all([readRows(files.LCL), readRows(files.UTC)]);
    output = convert({ lclRows, utcRows, lclName: files.LCL.name, utcName: files.UTC.name });
    renderResult(output);
  } catch (err) {
    console.error(err);
    const msg = /Invalid PDF|password/i.test(err.message) ? `Couldn't open one of the PDFs (${err.message}).` : err.message;
    showError(msg);
  }
}

function showError(msg) {
  $('error').textContent = msg;
  $('error').hidden = !msg;
}

// ---------------------------------------------------------------- preview

const DAY = 1440;
const pad = n => String(n).padStart(2, '0');
const hm = m => pad(Math.floor((((m % DAY) + DAY) % DAY) / 60)) + ':' + pad((((m % DAY) + DAY) % DAY) % 60);
const rel = (m, base) => { const d = Math.floor(m / DAY) - base; return d ? (d > 0 ? '+' : '') + d : ''; };
const dateLabel = m => new Date(Math.floor(m / DAY) * 86400000)
  .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function renderResult({ legs, names }) {
  const dh = legs.filter(l => l.dh).length;
  $('summary').textContent = `${legs.length} flights` + (dh ? ` · ${dh} deadhead${dh > 1 ? 's' : ''}` : '');

  const box = $('legs');
  box.replaceChildren();
  for (const leg of legs) {
    const u = leg.utc, base = Math.floor(u.std / DAY);
    const t = m => (m == null ? '<b class="empty">—</b>' : `${hm(m)}<sup>${rel(m, base)}</sup>`);
    const badge = leg.dh ? `<span class="badge">${leg.commercialDH ? 'DH · COMM' : 'DH'}</span>` : '';
    const el = document.createElement('article');
    el.className = 'leg';
    el.innerHTML = `
      <div class="leg-top">
        <div><span class="leg-flight">${leg.flight}${leg.dh ? '*' : ''}</span>${badge}</div>
        <div class="leg-route">${leg.dep} → ${leg.arr}</div>
      </div>
      <div class="leg-date">${dateLabel(u.std)} UTC</div>
      <div class="leg-times">
        <div><span>Sign on</span>${t(u.on)}</div>
        <div><span>STD</span>${t(u.std)}</div>
        <div><span>STA</span>${t(u.sta)}</div>
        <div><span>Sign off</span>${t(u.off)}</div>
      </div>`;
    box.append(el);
  }
  $('icsName').textContent = names.ics;
  $('csvName').textContent = names.csv;
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------- share / download

function makeFile(kind) {
  if (kind === 'ics') return new File([output.ics], output.names.ics, { type: 'text/calendar' });
  return new File([output.csv], output.names.csv, { type: 'text/csv' });
}

async function share(kind) {
  if (!output) return;
  const file = makeFile(kind);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  if (kind === 'ics') {
    // Opening a calendar file directly makes iOS/macOS offer "Add All" to Calendar
    location.href = URL.createObjectURL(file);
    return;
  }
  download(kind);
}

function download(kind) {
  if (!output) return;
  const file = makeFile(kind);
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('shareIcs').addEventListener('click', () => {
  // On iPhone, opening the .ics adds it straight to Calendar; elsewhere use the share sheet
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && output) { location.href = URL.createObjectURL(makeFile('ics')); return; }
  share('ics');
});
$('shareCsv').addEventListener('click', () => share('csv'));
$('dlIcs').addEventListener('click', () => download('ics'));
$('dlCsv').addEventListener('click', () => download('csv'));

if (!(navigator.canShare)) $('shareCsv').textContent = 'Save CSV';

// ---------------------------------------------------------------- shared from another app (Android)

(async () => {
  if (!new URLSearchParams(location.search).has('shared') || !('caches' in self)) return;
  const cache = await caches.open('shared-files');
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const name = decodeURIComponent(res.headers.get('x-name') || 'shared.pdf');
    const f = new File([await res.blob()], name, { type: 'application/pdf' });
    const kind = detectKind(name) || (!files.LCL ? 'LCL' : 'UTC');
    files[kind] = f;
    await cache.delete(req);
  }
  history.replaceState(null, '', location.pathname);
  update();
})();

// ---------------------------------------------------------------- offline

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker not registered', err));
}
