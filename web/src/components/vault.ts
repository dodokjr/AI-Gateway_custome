// Brankas token premium milik pengguna, hanya di browser ini.
// - "Ingat di perangkat ini" -> localStorage; jika tidak -> sessionStorage (hilang saat tab ditutup).
// - Token tidak pernah disimpan di server. Token hanya dikirim saat pengguna mengirim pesan.

export interface StoredToken {
  key: string;
  remember: boolean;
  savedAt: string;
}

export type TokenMap = Record<string, StoredToken>;

const name = (uid: string) => `aigw:tokens:${uid}`;

function read(store: Storage | null, uid: string): TokenMap {
  try {
    const raw = store?.getItem(name(uid));
    return raw ? (JSON.parse(raw) as TokenMap) : {};
  } catch {
    return {};
  }
}

function stores(): { local: Storage | null; session: Storage | null } {
  try {
    return { local: window.localStorage, session: window.sessionStorage };
  } catch {
    return { local: null, session: null };
  }
}

export function loadTokens(uid: string): TokenMap {
  const { local, session } = stores();
  return { ...read(local, uid), ...read(session, uid) };
}

function write(store: Storage | null, uid: string, map: TokenMap) {
  try {
    if (Object.keys(map).length === 0) store?.removeItem(name(uid));
    else store?.setItem(name(uid), JSON.stringify(map));
  } catch {
    /* penyimpanan penuh atau diblokir: abaikan */
  }
}

export function saveToken(uid: string, provider: string, key: string, remember: boolean) {
  const { local, session } = stores();
  const l = read(local, uid);
  const s = read(session, uid);
  delete l[provider];
  delete s[provider];
  const entry: StoredToken = { key, remember, savedAt: new Date().toISOString() };
  if (remember) l[provider] = entry;
  else s[provider] = entry;
  write(local, uid, l);
  write(session, uid, s);
}

export function removeToken(uid: string, provider: string) {
  const { local, session } = stores();
  const l = read(local, uid);
  const s = read(session, uid);
  delete l[provider];
  delete s[provider];
  write(local, uid, l);
  write(session, uid, s);
}

export function clearTokens(uid: string) {
  const { local, session } = stores();
  write(local, uid, {});
  write(session, uid, {});
}

export function maskToken(k: string): string {
  return k.length <= 10 ? "••••" : `${k.slice(0, 4)}…${k.slice(-4)}`;
}

/** Cek format sama seperti di server. */
export function tokenFormatProblem(k: string): string | null {
  if (!/^[\x21-\x7e]{8,512}$/.test(k)) return "token harus 8–512 karakter tanpa spasi";
  return null;
}
