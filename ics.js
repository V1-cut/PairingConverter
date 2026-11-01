// iCal (RFC 5545) output shared by the pairing and booking-email converters, so both write
// identical calendars: same header, escaping, folding and UIDs.

const pad = n => String(n).padStart(2, '0');

/** UTC milliseconds → 20261119T213000Z */
export function icsStamp(ms) {
  const x = new Date(ms);
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}00Z`;
}

export function icsText(s) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const utf8Length = s => unescape(encodeURIComponent(s)).length;

export function fold(line) {
  // RFC 5545: max 75 octets per line, continuation lines start with a space
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (utf8Length(cur + ch) > 75) { out.push(cur); cur = ' ' + ch; }
    else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

/**
 * Stable UID from the UTC STD date, flight and route: re-importing an updated pairing (or the
 * booking for one of its commercial deadheads) replaces the event instead of duplicating it.
 */
export function eventUid(stdMs, flight, dep, arr) {
  return `${icsStamp(stdMs).slice(0, 8)}-${flight}-${dep}${arr}@pairing-converter`;
}

/** events: [{uid, start, end (UTC ms), summary, description, location}] → .ics text */
export function toCalendar(events, { now = new Date(), calName = 'Work' } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pairing Converter//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Apple Calendar can't be made to pick a calendar on import; this is the hint
    `X-WR-CALNAME:${icsText(calName)}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsStamp(e.start)}`,
      `DTEND:${icsStamp(e.end)}`,
      `SUMMARY:${icsText(e.summary)}`,
      `DESCRIPTION:${icsText(e.description)}`,
      `LOCATION:${icsText(e.location)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
