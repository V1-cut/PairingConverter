// Pairing Converter — core logic (no DOM, no pdf.js). Shared by the app and the Node tests.
//
// Pipeline:  pdf.js text items  →  rows (by y)  →  legs (by header x-columns)
//            LCL legs + UTC legs →  merged legs  →  LogTen Pro CSV  /  iCal ICS

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY = 1440; // minutes

// ---------------------------------------------------------------- PDF rows

/**
 * Group pdf.js text items into rows. `items` are {str, x, y} (x/y = transform[4]/[5]).
 * Returns rows top-to-bottom, each an array of {str, x} sorted left-to-right.
 */
export function groupRows(items, tol = 3) {
  const rows = [];
  for (const it of items) {
    const str = it.str.trim();
    if (!str) continue;
    let row = rows.find(r => Math.abs(r.y - it.y) <= tol);
    if (!row) rows.push(row = { y: it.y, cells: [] });
    row.cells.push({ str, x: it.x });
  }
  rows.sort((a, b) => b.y - a.y); // PDF y grows upwards
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  return rows.map(r => r.cells);
}

const HEADER_KEYS = {
  Flight: 'flight', DEP: 'dep', ARR: 'arr', STD: 'std', STA: 'sta', Date: 'date', Day: 'tripDay',
  Art: 'art', Ftp: 'ftp', Cpl: 'cpl', DH: 'dh', 'Tail #': 'tail', Tail: 'tail', AC: 'ac',
  Hrs: 'block', Limit: 'fdp', Beg: 'beg', End: 'end',
};

/** Parse the rows of one pairing PDF (all pages, in order) into legs. */
export function parseLegs(rows, refDate) {
  let cols = null;
  const legs = [];
  let lastDate = null;

  for (const cells of rows) {
    // Header row (repeats on every page)
    const names = cells.map(c => c.str);
    if (names.includes('Flight') && names.includes('DEP') && names.includes('ARR')) {
      cols = cells.filter(c => HEADER_KEYS[c.str]).map(c => ({ key: HEADER_KEYS[c.str], x: c.x }))
        .sort((a, b) => a.x - b.x);
      continue;
    }
    if (!cols) continue;

    const rec = {};
    for (const c of cells) {
      let col = null;
      for (const h of cols) if (h.x <= c.x + 3) col = h; // left-aligned columns
      if (col) rec[col.key] = rec[col.key] ? rec[col.key] + ' ' + c.str : c.str;
    }

    // A leg row has IATA codes and a 4-digit STD
    if (!/^[A-Z]{3}$/.test(rec.dep || '') || !/^[A-Z]{3}$/.test(rec.arr || '') || !/^\d{4}$/.test(rec.std || '')) continue;

    const sta = /^(\d{4})([+-]\d)?$/.exec(rec.sta || '');
    if (!sta) throw new Error(`Can't read STA "${rec.sta}" for flight ${rec.flight}`);

    // A blank Dep Date means "same date as the leg above"
    let date = rec.date ? parseDepDate(rec.date, refDate) : lastDate;
    if (!date) throw new Error(`Missing departure date for flight ${rec.flight}`);
    lastDate = date;

    legs.push({
      flight: normaliseFlight(rec.flight),
      dep: rec.dep,
      arr: rec.arr,
      dh: /\bDH\b/.test(rec.dh || ''),
      tail: (rec.tail || '').trim(),
      date,                                   // {y, m (1-12), d}
      std: rec.std,
      sta: sta[1],
      staOffset: sta[2] ? parseInt(sta[2], 10) : 0,
      signOn: clock(rec.beg),
      signOff: clock(rec.end),
    });
  }
  return legs;
}

function clock(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s || '').trim());
  return m ? m[1].padStart(2, '0') + m[2] : '';
}

export function normaliseFlight(f) {
  f = (f || '').replace(/\s+/g, '').toUpperCase();
  if (/^\d{1,4}$/.test(f)) return '5Y' + f;           // no airline prefix → Atlas Air
  return f;
}

/** "Thu19Nov" → {y,m,d}; year inferred from refDate (nearest year, handles Dec→Jan). */
export function parseDepDate(s, refDate) {
  const m = /^(?:[A-Za-z]{3})?(\d{1,2})([A-Za-z]{3})$/.exec(s.trim());
  if (!m) throw new Error(`Can't read date "${s}"`);
  const mon = MONTHS.indexOf(m[2].toUpperCase()) + 1;
  if (!mon) throw new Error(`Can't read month in "${s}"`);
  const ref = refDate || { y: new Date().getUTCFullYear(), m: new Date().getUTCMonth() + 1 };
  let y = ref.y;
  if (mon - ref.m > 6) y--;
  if (ref.m - mon > 6) y++;
  return { y, m: mon, d: parseInt(m[1], 10) };
}

/** Reference date from a filename like "Pairing LCL 19NOV26.pdf" → {y:2026, m:11, d:19}. */
export function refDateFromName(name) {
  const m = /(\d{1,2})([A-Za-z]{3})(\d{2})(?!\d)/.exec(name || '');
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toUpperCase()) + 1;
  return mon ? { y: 2000 + parseInt(m[3], 10), m: mon, d: parseInt(m[1], 10) } : null;
}

export function detectKind(name) {
  const n = (name || '').toUpperCase();
  if (/\bLCL\b|LCL/.test(n)) return 'LCL';
  if (/\bUTC\b|UTC|GMT/.test(n)) return 'UTC';
  return null;
}

// ---------------------------------------------------------------- timeline

const hhmmToMin = s => parseInt(s.slice(0, 2), 10) * 60 + parseInt(s.slice(2), 10);
const dayNumber = ({ y, m, d }) => Math.floor(Date.UTC(y, m - 1, d) / 86400000);

/**
 * Absolute minutes for sign on / STD / STA / sign off of a leg in its own file's clock.
 * Sign on is the latest matching clock time at/before STD; sign off the earliest at/after STA.
 */
export function timeline(leg) {
  const day = dayNumber(leg.date);
  const std = day * DAY + hhmmToMin(leg.std);
  const sta = (day + leg.staOffset) * DAY + hhmmToMin(leg.sta);
  let on = null, off = null;
  if (leg.signOn) { on = day * DAY + hhmmToMin(leg.signOn); if (on > std) on -= DAY; }
  if (leg.signOff) { off = Math.floor(sta / DAY) * DAY + hhmmToMin(leg.signOff); if (off < sta) off += DAY; }
  return { day, on, std, sta, off };
}

const pad = n => String(n).padStart(2, '0');
function hm(min, colon = true) {
  const t = ((min % DAY) + DAY) % DAY;
  return pad(Math.floor(t / 60)) + (colon ? ':' : '') + pad(t % 60);
}
function suffix(min, baseDay) {
  const diff = Math.floor(min / DAY) - baseDay;
  return diff === 0 ? '' : (diff > 0 ? '+' : '') + diff;
}
function ymd(min) {
  const dt = new Date(Math.floor(min / DAY) * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

// ---------------------------------------------------------------- merge

/** Pair LCL and UTC legs (same order) and check they describe the same flights. */
export function mergeLegs(lcl, utc) {
  if (lcl.length !== utc.length) {
    throw new Error(`The LCL file has ${lcl.length} flights but the UTC file has ${utc.length}. Are they the same pairing?`);
  }
  let dutyStart = null;
  return lcl.map((l, i) => {
    const u = utc[i];
    if (l.flight !== u.flight || l.dep !== u.dep || l.arr !== u.arr) {
      throw new Error(`Flight ${i + 1} doesn't match: ${l.flight} ${l.dep}-${l.arr} (LCL) vs ${u.flight} ${u.dep}-${u.arr} (UTC). Are they the same pairing?`);
    }
    const ut = timeline(u);
    // Legs without their own sign on belong to the duty that started on an earlier leg
    if (ut.on != null || dutyStart == null) dutyStart = ut.on ?? ut.std;
    return {
      flight: u.flight, dep: u.dep, arr: u.arr,
      dutyStartUtc: dutyStart,
      dh: l.dh || u.dh,
      tail: u.tail || l.tail,
      commercialDH: (l.dh || u.dh) && !(u.tail || l.tail),
      local: { ...timeline(l), signOn: l.signOn, signOff: l.signOff },
      utc: { ...ut, signOn: u.signOn, signOff: u.signOff },
    };
  });
}

// ---------------------------------------------------------------- CSV (LogTen Pro, UTC)

export const CSV_HEADERS = ['Date', 'Flight', 'From', 'To', 'Positioning', 'Sign On', 'STD', 'STA', 'Sign Off',
  'Flight Type', 'Flight Detail', 'Flight Rules', 'SIC'];

export function toCSV(legs) {
  const lines = [CSV_HEADERS.join(',')];
  for (const leg of legs) {
    const t = leg.utc;
    const d = ymd(leg.dutyStartUtc); // LogTen date = UTC date the duty began
    lines.push([
      `${pad(d.m)}/${pad(d.d)}/${d.y}`,
      leg.flight,
      leg.dep,
      leg.arr,
      leg.dh ? 'Y' : '',
      t.on != null ? hm(t.on) : '',
      hm(t.std),
      hm(t.sta),
      t.off != null ? hm(t.off) : '',
      leg.dh ? 'Positioning' : 'Line Ops',
      '',
      leg.dh ? '' : 'IFR',
      'Self',
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function csvCell(v) {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ---------------------------------------------------------------- ICS (Apple Calendar)

export function eventFields(leg) {
  const L = leg.local, U = leg.utc;
  const localDay = Math.floor(L.std / DAY);
  const lt = m => (m == null ? '' : hm(m) + suffix(m, localDay));

  let description =
    `Sign on: ${lt(L.on)}\nSTD: ${lt(L.std)}\nSTA: ${lt(L.sta)}\nSign off: ${lt(L.off)}\n\n*all times Local`;
  if (leg.commercialDH) description += '\n\nBRN:  \nSeat:  \nMeal:  ';

  const utcDay = Math.floor(U.std / DAY);
  const location = `[${hm(U.std, false)}z - ${hm(U.sta, false)}z${suffix(U.sta, utcDay)}]` + (leg.dh ? '  DH' : '');

  return {
    start: U.on ?? U.std,
    end: U.off ?? U.sta,
    summary: `${leg.flight}${leg.dh ? '*' : ''}  ${leg.dep} ${leg.arr}`,
    description,
    location,
  };
}

function icsStamp(min) {
  const d = ymd(min);
  return `${d.y}${pad(d.m)}${pad(d.d)}T${hm(min, false)}00Z`;
}
function icsNow(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsText(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function fold(line) {
  // RFC 5545: max 75 octets per line, continuation lines start with a space
  const enc = new TextEncoder();
  const out = [];
  let cur = '', limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) { out.push(cur); cur = ' ' + ch; limit = 75; }
    else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export function toICS(legs, { now = new Date(), calName = 'Work' } = {}) {
  const stamp = icsNow(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pairing Converter//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(calName)}`,
  ];
  for (const leg of legs) {
    const f = eventFields(leg);
    // Stable UID: re-importing an updated pairing replaces events instead of duplicating them
    const uid = `${icsStamp(leg.utc.std).slice(0, 8)}-${leg.flight}-${leg.dep}${leg.arr}@pairing-converter`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsStamp(f.start)}`,
      `DTEND:${icsStamp(f.end)}`,
      `SUMMARY:${icsText(f.summary)}`,
      `DESCRIPTION:${icsText(f.description)}`,
      `LOCATION:${icsText(f.location)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- file names

/** "Pairing LCL 19NOV26.pdf" → "NOV26"; falls back to the first leg's UTC month. */
export function periodTag(names, legs) {
  for (const n of names) {
    const m = /\d{1,2}([A-Za-z]{3})(\d{2})(?!\d)/.exec(n || '');
    if (m) return m[1].toUpperCase() + m[2];
  }
  if (legs && legs.length) {
    const d = ymd(legs[0].utc.std);
    return MONTHS[d.m - 1] + String(d.y).slice(2);
  }
  return 'PAIRING';
}

export function outputNames(tag) {
  return { csv: `Pairing LTP UTC ${tag}.csv`, ics: `Pairing ${tag}.ics` };
}

/** Convenience: whole conversion from the two files' rows. */
export function convert({ lclRows, utcRows, lclName = '', utcName = '', now }) {
  const ref = refDateFromName(lclName) || refDateFromName(utcName);
  const lcl = parseLegs(lclRows, ref);
  const utc = parseLegs(utcRows, ref);
  if (!lcl.length || !utc.length) throw new Error('No flights found. Is this a pairing PDF?');
  const legs = mergeLegs(lcl, utc);
  const tag = periodTag([lclName, utcName], legs);
  return { legs, csv: toCSV(legs), ics: toICS(legs, { now }), names: outputNames(tag) };
}
