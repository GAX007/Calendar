// A calendar link the user pastes (Google, iCloud, Outlook). The server downloads it, so only
// public https addresses are accepted: webcal:// (what iPhone copies) and http:// become https://,
// and local or private network addresses are refused so the server cannot be used to reach them.

const HOSTS_PRIVADOS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function ipv4Privada(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function normalizarUrlCalendario(raw: string): string | null {
  const limpio = (raw || '').trim().replace(/^["'`<]+|["'`>]+$/g, '').replace(/&amp;/gi, '&');
  if (!limpio) return null;
  const conEsquema = limpio.replace(/^(webcals?|http):\/\//i, 'https://');
  let url: URL;
  try { url = new URL(conEsquema); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || host.includes(':') || HOSTS_PRIVADOS.test(host) || ipv4Privada(host)) return null;
  return url.toString();
}
