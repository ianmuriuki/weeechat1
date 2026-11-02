// Finds web links in message text. Only http, https and www links are recognised.

export type LinkPart = { text: string; url?: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

function count(s: string, ch: string) {
  let n = 0;
  for (const x of s) if (x === ch) n++;
  return n;
}

// Trailing punctuation and an unmatched closing bracket are not part of the link.
function trimUrl(raw: string) {
  let u = raw;
  while (u.length) {
    const last = u[u.length - 1];
    if ('.,;:!?\'"]}'.includes(last)) u = u.slice(0, -1);
    else if (last === ')' && count(u, '(') < count(u, ')')) u = u.slice(0, -1);
    else break;
  }
  return u;
}

function isLink(u: string) {
  if (/^https?:\/\//i.test(u)) return u.replace(/^https?:\/\//i, '').length > 0;
  return /^www\.[^\s./]+\.[^\s./]{2,}/i.test(u);
}

export function splitLinks(text: string): LinkPart[] {
  const re = new RegExp(URL_RE.source, 'gi');
  const out: LinkPart[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = trimUrl(m[0]);
    if (!isLink(url)) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: url, url });
    last = m.index + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

export function firstLink(text: string): string | null {
  return splitLinks(text).find((p) => p.url)?.url ?? null;
}

export function hrefFor(url: string) {
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}
