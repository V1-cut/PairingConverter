// Booking emails — pure parsing (no DOM), shared by the app and test/email.mjs.
//
//   pasted booking email  →  flight legs (local times + airport time zones → UTC)  →  iCal ICS (via ics.js)
//
// Line one of the paste may name the flight category (DH, Trng DH, Alt DH, GW, Alt GW).

import { AIRPORTS, AIRLINE_NAMES, AIRLINE_CODES } from './airports.js';
import { toCalendar, eventUid } from './ics.js';

const MIN = 60000, DAY = 86400000;
const pad = n => String(n).padStart(2, '0');

// ---------------------------------------------------------------- category (line one)

const CATEGORIES = [
  [/^(?:trng|training)\.?\s*(?:dh|deadhead)$/i, 'Trng DH'],
  [/^alt(?:ernate)?\.?\s*(?:dh|deadhead)$/i, 'Alt DH'],
  [/^alt(?:ernate)?\.?\s*(?:gw|gateway)$/i, 'Alt GW'],
  [/^(?:dh|deadhead)$/i, 'DH'],
  [/^(?:gw|gateway)$/i, 'GW'],
];
export const CATEGORY_LABELS = ['DH', 'Trng DH', 'Alt DH', 'GW', 'Alt GW'];

/** "Trng DH" → "Trng DH", "alt gateway:" → "Alt GW", anything else → null. */
export function readCategory(line) {
  const s = line.trim().replace(/[\s.:,-]+$/, '');
  for (const [re, label] of CATEGORIES) if (re.test(s)) return label;
  return null;
}

// ---------------------------------------------------------------- text → lines

export function cleanLines(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u00a0\u2007\u202f\t]/g, ' ')
    .split('\n')
    .map(l => l.replace(/^(?:\s*>)+ ?/, '').replace(/\s+$/, '')); // drop "> " forward/reply quoting
}

const HEADER = /^\s*(?:from|to|cc|bcc|date|sent|received|subject|reply-to)\s*:/i;
const NO_DATES = /issued|purchased|booked on|ticketed|issue date|purchase date|booking date|date of issue|expir/i;
const NO_TIMES = /board|check[- ]?in|layover|connection|duration|travel time|total|flight time|estimated time|gate (?:closes|opens)/i;

// ---------------------------------------------------------------- tokens

const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = s => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
const fullYear = s => (s == null ? null : s.length === 2 ? 2000 + +s : +s);

const DATE_RES = [
  // 2026-12-14
  [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g, m => ({ y: +m[1], m: +m[2], d: +m[3] })],
  // 12/14/2026 (US order)
  [/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g, m => ({ y: fullYear(m[3]), m: +m[1], d: +m[2] })],
  // Dec 14, 2026 · November 18 · Thursday, January 7
  [new RegExp(`\\b(${MON})\\.? +(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? +(\\d{4})\\b)?`, 'gi'),
    m => /^[A-Z]/.test(m[1]) && { y: fullYear(m[3]), m: monthOf(m[1]), d: +m[2] }],
  // 02 November 2026 · 18 Dec 2026 · 03DEC · 18NOV26
  [new RegExp(`\\b(\\d{1,2}) *(${MON})\\.?(?![a-z])(?:,? *(\\d{4}|\\d{2})(?![\\d:]))?`, 'gi'),
    m => /^[A-Z]/.test(m[2]) && { y: fullYear(m[3]), m: monthOf(m[2]), d: +m[1] }],
];

// 6:08AM · 10:05am · 2:05 PM · 23:55 · 02:35 (+1 day)
const TIME_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])(?: ?([ap])\.? ?(?:m\.?)?(?![a-z]))?(?: ?\(?([+-]) ?(\d)(?![\d:]) ?(?:days?)?\)?)?/gi;

// Three capitals that are also common words: only taken as airports when written "(CAN)".
const STOP = new Set(['CAN', 'FAT', 'MAN', 'LOS', 'SAL', 'BUD', 'HAM', 'ADD', 'ACT', 'BET', 'SAT', 'DAY', 'JAN']);
const NOT_AIRPORTS = new Set(['USD', 'CAD', 'EUR', 'GBP', 'MXN', 'PNR', 'AKA', 'TBD', 'TBA']);

const NAMES = Object.keys(AIRLINE_NAMES).sort((a, b) => b.length - a.length);
const NAME_RE = new RegExp(
  `\\b(${NAMES.map(n => n.replace(/ /g, ' +')).join('|')})(?: +(?:air ?lines?|airways))? *(?:flight)? *(?:#|no\\.?|number)? *:? *(\\d{1,4})(?![\\d:]| *of\\b)`,
  'gi');
const CODE_RE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]|[0-9][A-Z]) ?(\d{1,4})(?![\d:])/g;
const BARE_RE = /\bflight *(?:(?:#|no\.?|number) *:? *(\d{1,4})|:? *(\d{2,4}))(?![\d:/]| *of\b)/gi;

const airlineCode = name => AIRLINE_NAMES[name.toLowerCase().replace(/ +/g, ' ')];

function lineTokens(line, li, defaultAirline) {
  const found = [];
  const add = (type, m, data) => found.push({ type, line: li, col: m.index, end: m.index + m[0].length, ...data });

  if (!NO_DATES.test(line)) {
    for (const [re, make] of DATE_RES) {
      for (const m of line.matchAll(re)) {
        const d = make(m);
        if (d && d.m >= 1 && d.m <= 12 && d.d >= 1 && d.d <= 31) add('date', m, { date: d });
      }
    }
  }
  if (!NO_TIMES.test(line)) {
    for (const m of line.matchAll(TIME_RE)) {
      let h = +m[1];
      const ap = m[3] && m[3].toLowerCase();
      if (ap && (h < 1 || h > 12)) continue;
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      add('time', m, { h, mi: +m[2], plus: m[4] ? (m[4] === '-' ? -1 : 1) * +m[5] : 0 });
    }
  }
  for (const m of line.matchAll(NAME_RE)) add('flight', m, { flight: airlineCode(m[1]) + +m[2] });
  for (const m of line.matchAll(CODE_RE)) {
    if (!AIRLINE_CODES.has(m[1])) continue;
    if (/\d:\d\d ?$/.test(line.slice(0, m.index))) continue; // "10:15 AM 12" is not Aeromexico
    add('flight', m, { flight: m[1] + +m[2] });
  }
  for (const m of line.matchAll(BARE_RE)) add('flight', m, { flight: defaultAirline + +(m[1] || m[2]) });

  for (const m of line.matchAll(/\b[A-Z]{3}\b/g)) {
    const code = m[0];
    const paren = line[m.index - 1] === '(' && line[m.index + 3] === ')';
    const ok = AIRPORTS[code] ? paren || !STOP.has(code) : paren && !NOT_AIRPORTS.has(code);
    if (ok) add('airport', m, { code });
  }

  // Overlaps: earlier types in this order win (a date beats a "flight" inside it, etc.)
  const order = { date: 0, time: 1, flight: 2, airport: 3 };
  found.sort((a, b) => order[a.type] - order[b.type] || a.col - b.col || b.end - a.end);
  const kept = [];
  for (const t of found) if (!kept.some(k => t.col < k.end && k.col < t.end)) kept.push(t);
  return kept.sort((a, b) => a.col - b.col);
}

// ---------------------------------------------------------------- dates & time zones

/** Nearest sensible year for a date written without one: up to ~1 month in the past, else the future. */
export function pickYear(m, d, ref) {
  const target = ref.getTime() + 150 * DAY;
  let best = null;
  for (let y = ref.getUTCFullYear() - 1; y <= ref.getUTCFullYear() + 1; y++) {
    const dist = Math.abs(Date.UTC(y, m - 1, d) - target);
    if (!best || dist < best.dist) best = { y, dist };
  }
  return best.y;
}

const offsetFmt = {};
function tzOffset(ms, tz) {
  const fmt = offsetFmt[tz] ||= new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / MIN) * MIN;
}

/** Wall-clock time in an IANA zone → UTC milliseconds. */
export function zonedToUtc({ y, m, d, h, mi }, tz) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - tzOffset(wall, tz);
  const again = wall - tzOffset(t, tz);
  if (again !== t) t = again;
  return t;
}

const addDays = ({ y, m, d }, n) => {
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
};

// ---------------------------------------------------------------- parse

export function parseEmail(text, { now = new Date(), tzOverrides = {} } = {}) {
  let lines = cleanLines(text);
  const warnings = [];

  const first = lines.findIndex(l => l.trim());
  const category = first >= 0 ? readCategory(lines[first]) : null;
  if (category) lines[first] = '';

  // Reference date for year-less dates: the email's own Date:/Sent: header, else today
  let ref = now;
  for (const l of lines) {
    const h = l.match(/^\s*(?:date|sent)\s*:(.*)$/i);
    if (!h) continue;
    const d = lineTokens(h[1], 0, '').find(t => t.type === 'date' && t.date.y);
    if (d) { ref = new Date(Date.UTC(d.date.y, d.date.m - 1, d.date.d)); break; }
  }

  const whole = lines.join('\n');
  const nameHit = whole.match(new RegExp(`\\b(${NAMES.map(n => n.replace(/ /g, ' +')).join('|')})\\b`, 'i'));
  const defaultAirline = nameHit ? airlineCode(nameHit[1]) : '';

  const tokens = lines.flatMap((l, i) => (HEADER.test(l) ? [] : lineTokens(l, i, defaultAirline)));
  for (const t of tokens) if (t.type === 'date' && !t.date.y) t.date.y = pickYear(t.date.m, t.date.d, ref);

  // Each flight number starts a segment that runs to the line of the next one
  const anchors = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'flight') continue;
    const prev = anchors[anchors.length - 1];
    const between = prev ? tokens.slice(prev.idx + 1, i) : [];
    if (prev && prev.flight === t.flight && !between.some(x => x.type === 'airport' || x.type === 'time')) continue;
    anchors.push({ ...t, idx: i });
  }

  const legs = [];
  anchors.forEach((a, k) => {
    const startLine = a.line, endLine = k + 1 < anchors.length ? anchors[k + 1].line : Infinity;
    if (endLine === startLine) return;
    const seg = tokens.filter(t => t.line >= startLine && t.line < endLine);
    const before = tokens.filter(t => t.line < startLine && t.type === 'date');
    const leg = buildLeg(a.flight, seg, before[before.length - 1], lines.slice(startLine, endLine), tzOverrides);
    if (leg.problem) warnings.push(`${a.flight}: ${leg.problem}`);
    else legs.push(leg);
  });

  const seen = new Set();
  const unique = legs.filter(l => {
    const key = `${l.flight}|${l.dep}|${l.depLocal.y}-${l.depLocal.m}-${l.depLocal.d}`;
    return !seen.has(key) && seen.add(key);
  });

  return { category, confirmation: findConfirmation(whole), legs: unique, warnings };
}

function buildLeg(flight, seg, carry, segLines, tzOverrides) {
  const airports = seg.filter(t => t.type === 'airport');
  const dep = airports[0], arr = dep && airports.find(t => t.code !== dep.code);
  if (!arr) return { problem: 'couldn’t find both airports' };

  const times = seg.filter(t => t.type === 'time');
  if (times.length < 2) return { problem: 'couldn’t find departure and arrival times' };
  const [t1, t2] = times;

  const pos = t => t.line * 1e4 + t.col;
  const dates = seg.filter(t => t.type === 'date');
  const depDateTok = dates.filter(d => pos(d) < pos(t1)).pop() || carry || dates.find(d => pos(d) < pos(t2));
  if (!depDateTok) return { problem: 'couldn’t find the date' };
  const arrDateTok = dates.filter(d => d !== depDateTok && pos(d) > pos(t1) && pos(d) < pos(t2)).pop();

  const depTz = AIRPORTS[dep.code]?.tz || tzOverrides[dep.code] || null;
  const arrTz = AIRPORTS[arr.code]?.tz || tzOverrides[arr.code] || null;

  const depLocal = { ...depDateTok.date, h: t1.h, mi: t1.mi };
  let arrLocal = { ...(arrDateTok ? arrDateTok.date : addDays(depDateTok.date, t2.plus)), h: t2.h, mi: t2.mi };

  let std = null, sta = null;
  if (depTz && arrTz) {
    std = zonedToUtc(depLocal, depTz);
    sta = zonedToUtc(arrLocal, arrTz);
    // No arrival date and no "+1": an arrival that's before departure means next day
    for (let n = 0; !arrDateTok && !t2.plus && sta <= std && n < 2; n++) {
      arrLocal = { ...addDays(arrLocal, 1), h: t2.h, mi: t2.mi };
      sta = zonedToUtc(arrLocal, arrTz);
    }
  }

  const seatHit = segLines.join('\n').match(/\bseats?\b[ :#]*(\d{1,2}[A-K])\b/i);
  return {
    flight, dep: dep.code, arr: arr.code, depTz, arrTz, depLocal, arrLocal, std, sta,
    seat: seatHit ? seatHit[1].toUpperCase() : '',
    missingTz: [!depTz && dep.code, !arrTz && arr.code].filter(Boolean),
  };
}

const CONF_RE = /(?:confirmation|record locator|booking ref(?:erence)?|reservation|pnr|trip locator)(?: (?:number|code|no\.?))?[ :#.]*\n?[ ]*([A-Z0-9]{6})\b/gi;

export function findConfirmation(text) {
  for (const m of text.matchAll(CONF_RE)) {
    if (/^[A-Z0-9]{6}$/.test(m[1]) && /[A-Z]/.test(m[1])) return m[1];
  }
  return '';
}

// ---------------------------------------------------------------- ICS (Apple Calendar)

const hhmm = ({ h, mi }, colon = true) => pad(h) + (colon ? ':' : '') + pad(mi);
const dayNo = ({ y, m, d }) => Date.UTC(y, m - 1, d) / DAY;
const suffix = n => (n > 0 ? `+${n}` : n < 0 ? `${n}` : '');
const utcParts = ms => {
  const x = new Date(ms);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes() };
};

// Sign on before STD / sign off after STA, in minutes.
// Domestic = departs from AND arrives in the 50 states (Puerto Rico, USVI, Guam count as international).
// airports.js only files airports in the 50 states under these zones.
export const REPORT = { domestic: { on: 60, off: 15 }, international: { on: 90, off: 30 } };
const US_ZONES = new Set([
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu',
]);
export const isDomestic = leg => US_ZONES.has(leg.depTz) && US_ZONES.has(leg.arrTz);

const shift = (t, minutes) => utcParts(Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi) + minutes * MIN);

/** Same layout as the user's hand-made deadhead events (and pairing-converter's), so they sit side by side. */
export function eventFields(leg, { category = null, confirmation = '' } = {}) {
  const U1 = utcParts(leg.std), U2 = utcParts(leg.sta);
  const report = REPORT[isDomestic(leg) ? 'domestic' : 'international'];
  // Local times with +n/-n relative to the local departure date
  const local = t => hhmm(t) + suffix(dayNo(t) - dayNo(leg.depLocal));
  const description =
    `Sign on: ${local(shift(leg.depLocal, -report.on))}\nSTD: ${local(leg.depLocal)}\n` +
    `STA: ${local(leg.arrLocal)}\nSign off: ${local(shift(leg.arrLocal, report.off))}\n\n*all times Local` +
    `\n\nBRN: ${confirmation || ' '}\nSeat: ${leg.seat || ' '}\nMeal:  \n`;
  return {
    start: leg.std,
    end: leg.sta,
    summary: `${leg.flight}${category ? '*' : ''}  ${leg.dep} ${leg.arr}`,
    description,
    location: `[${hhmm(U1, false)}z - ${hhmm(U2, false)}z${suffix(dayNo(U2) - dayNo(U1))}]` + (category ? `  ${category}` : ''),
  };
}

// Same UIDs as pairing events (ics.js), so a booking for a commercial deadhead that's already on the
// calendar from a pairing replaces that event (now with BRN and seat) instead of duplicating it.
export function toICS(parsed, { now = new Date() } = {}) {
  return toCalendar(parsed.legs.map(leg => ({
    ...eventFields(leg, parsed),
    uid: eventUid(leg.std, leg.flight, leg.dep, leg.arr),
  })), { now, calName: calendarFor(parsed.category) });
}

/** Gateway flights go in the user's Home calendar, everything else in Work. */
export const calendarFor = category => (category === 'GW' || category === 'Alt GW' ? 'Home' : 'Work');

export function fileName(parsed) {
  const id = parsed.confirmation || parsed.legs[0]?.flight || 'Flights';
  return [parsed.category, id].filter(Boolean).join(' ') + '.ics';
}

/** Everything the app and tests need. Throws a readable Error when nothing usable was found. */
export function convert(text, opts = {}) {
  const parsed = parseEmail(text, opts);
  if (!parsed.legs.length) {
    throw new Error(parsed.warnings.length
      ? `Found flight numbers but couldn’t read them — ${parsed.warnings.join('; ')}.`
      : 'No flights found. Paste the whole confirmation email (flight number, airports, date and times).');
  }
  const missing = [...new Set(parsed.legs.flatMap(l => l.missingTz))];
  return { ...parsed, missing, ics: missing.length ? null : toICS(parsed, opts), name: fileName(parsed) };
}
