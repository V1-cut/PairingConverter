// "Booking email" screen: pasted confirmation → calendar events (parsing in email.js).
import { convert, toICS, fileName, calendarFor } from './email.js';
import { addToCalendar, download } from './files.js';

const $ = id => document.getElementById(id);
let output = null;

// Time zones picked for airports that aren't in airports.js (per device, a convenience only)
const ZONE_KEY = 'pairing-converter.zones';
let zones = {};
try { zones = JSON.parse(localStorage.getItem(ZONE_KEY)) || {}; } catch { /* private mode */ }
const saveZones = () => { try { localStorage.setItem(ZONE_KEY, JSON.stringify(zones)); } catch { /* ignore */ } };

const ALL_ZONES = (Intl.supportedValuesOf && Intl.supportedValuesOf('timeZone')) || [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
];

// ---------------------------------------------------------------- input

let timer = null;
$('email').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 250); });
$('category').addEventListener('change', update);

$('paste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) { $('email').value = text; update(); }
  } catch {
    $('email').focus(); // clipboard blocked: let the user long-press → Paste
  }
});

$('clear').addEventListener('click', () => {
  $('email').value = '';
  $('category').value = '';
  update();
  $('email').focus();
});

// ---------------------------------------------------------------- converting

function update() {
  const text = $('email').value;
  $('eError').hidden = true;
  $('eCalHint').hidden = true;
  output = null;
  if (!text.trim()) { $('eResult').hidden = true; $('zones').hidden = true; return; }

  let result;
  try { result = convert(text, { tzOverrides: zones }); }
  catch (err) {
    $('eResult').hidden = true;
    $('zones').hidden = true;
    $('eError').textContent = err.message;
    $('eError').hidden = false;
    return;
  }

  const pick = $('category').value;
  if (pick) result.category = pick === '-' ? null : pick;
  renderZones(result.missing);
  if (!result.missing.length) {
    output = { ics: toICS(result), name: fileName(result) };
  }
  renderResult(result);
}

function renderZones(missing) {
  const box = $('zoneList');
  box.replaceChildren();
  $('zones').hidden = !missing.length;
  for (const code of missing) {
    const row = document.createElement('label');
    row.className = 'zone';
    const sel = document.createElement('select');
    sel.append(new Option('Choose time zone…', ''), ...ALL_ZONES.map(z => new Option(z.replace(/_/g, ' '), z)));
    sel.addEventListener('change', () => { if (sel.value) { zones[code] = sel.value; saveZones(); update(); } });
    const b = document.createElement('b');
    b.textContent = code;
    row.append(b, sel);
    box.append(row);
  }
}

const pad = n => String(n).padStart(2, '0');
const hhmm = t => `${pad(t.h)}:${pad(t.mi)}`;
const dateLabel = ({ y, m, d }) => new Date(Date.UTC(y, m - 1, d))
  .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const utc = ms => (ms == null ? '—' : new Date(ms).toISOString().slice(11, 16).replace(':', '') + 'z');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function renderResult(r) {
  $('eSummary').textContent = `${r.legs.length} flight${r.legs.length > 1 ? 's' : ''}` +
    (r.confirmation ? ` · ${r.confirmation}` : '');

  const box = $('eLegs');
  box.replaceChildren();
  for (const leg of r.legs) {
    const days = Math.round((Date.UTC(leg.arrLocal.y, leg.arrLocal.m - 1, leg.arrLocal.d) -
      Date.UTC(leg.depLocal.y, leg.depLocal.m - 1, leg.depLocal.d)) / 86400000);
    const el = document.createElement('article');
    el.className = 'leg';
    el.innerHTML = `
      <div class="leg-top">
        <div><span class="leg-flight">${esc(leg.flight)}${r.category ? '*' : ''}</span>${r.category ? `<span class="badge">${esc(r.category)}</span>` : ''}</div>
        <div class="leg-route">${esc(leg.dep)} → ${esc(leg.arr)}</div>
      </div>
      <div class="leg-date">${dateLabel(leg.depLocal)}</div>
      <div class="leg-times three">
        <div><span>STD</span>${hhmm(leg.depLocal)}<small>${utc(leg.std)}</small></div>
        <div><span>STA</span>${hhmm(leg.arrLocal)}${days ? `<sup>${days > 0 ? '+' : ''}${days}</sup>` : ''}<small>${utc(leg.sta)}</small></div>
        <div><span>Seat</span>${esc(leg.seat || '—')}</div>
      </div>`;
    box.append(el);
  }

  const warn = $('warnings');
  warn.replaceChildren(...r.warnings.map(w => Object.assign(document.createElement('li'), { textContent: `Skipped ${w}` })));
  warn.hidden = !r.warnings.length;

  $('calName').textContent = calendarFor(r.category);
  $('eIcsName').textContent = output ? output.name : 'Pick the missing time zones first';
  $('eShareIcs').disabled = $('eDlIcs').disabled = !output;
  $('eResult').hidden = false;
}

// ---------------------------------------------------------------- share / download

const makeFile = () => new File([output.ics], output.name, { type: 'text/calendar' });

$('eShareIcs').addEventListener('click', async () => {
  if (!output) return;
  const note = await addToCalendar(makeFile());
  $('eCalHint').textContent = note;
  $('eCalHint').hidden = !note;
});
$('eDlIcs').addEventListener('click', () => { if (output) download(makeFile()); });
