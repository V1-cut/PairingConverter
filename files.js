// Getting generated files off the device: Calendar, the share sheet, or a download.

export const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const android = /Android/i.test(navigator.userAgent);

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Share sheet where there is one; otherwise (or if it fails) download. */
export async function share(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  download(file);
}

/**
 * Hand an .ics to the calendar. Returns a note to show when the user still has a step to do.
 * iPhone: opening the file adds it straight to Calendar. Android: the share sheet offers the
 * calendar app. Mac/PC: the share sheet has no Calendar option, so save it; opening it imports it.
 */
export async function addToCalendar(file) {
  if (ios) { location.href = URL.createObjectURL(file); return ''; }
  if (android && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); return ''; }
    catch (err) { if (err.name === 'AbortError') return ''; }
  }
  download(file);
  return `Saved ${file.name} to Downloads. Open it to add it to Calendar.`;
}
