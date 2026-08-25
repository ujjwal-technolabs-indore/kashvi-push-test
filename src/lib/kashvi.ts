type Row = Record<string, unknown> & { id?: number };
export type User = { id: string; email: string; name?: string | null };

function cfg() {
  const k = (globalThis as any).__KASHVI__ || {};
  const sb = k.supabase && k.supabase.url && k.supabase.key
    ? { url: String(k.supabase.url).replace(/\/$/, ''), key: String(k.supabase.key) }
    : null;
  const fb = k.firebase && k.firebase.apiKey && k.firebase.projectId
    ? { apiKey: String(k.firebase.apiKey), projectId: String(k.firebase.projectId) }
    : null;
  return {
    apiBase: (k.apiBase || '') as string,
    projectId: (k.projectId || 'app') as string,
    env: (k.env === 'published' ? 'published' : 'preview') as 'preview' | 'published',
    sb,
    fb,
  };
}

// ---- session (shared by both drivers; separate key per backend) ----

const AUTH_KEY = () => 'kashvi.app.' + cfg().projectId + '.auth' + (cfg().sb ? '.sb' : cfg().fb ? '.fb' : '');
type AuthState = { token: string; refresh?: string; user: User } | null;
const listeners = new Set<(u: User | null) => void>();

function readAuth(): AuthState {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY()) || 'null'); } catch { return null; }
}
function writeAuth(s: AuthState) {
  if (s) localStorage.setItem(AUTH_KEY(), JSON.stringify(s));
  else localStorage.removeItem(AUTH_KEY());
  listeners.forEach((fn) => fn(s ? s.user : null));
}
function authHeaders(): Record<string, string> {
  const s = readAuth();
  return s ? { Authorization: 'Bearer ' + s.token } : {};
}
// Supabase: every request carries the publishable key; signed-in requests carry
// the user's JWT so RLS (auth.uid()) scopes them.
function sbHeaders(): Record<string, string> {
  const { sb } = cfg();
  const s = readAuth();
  return { apikey: sb!.key, Authorization: 'Bearer ' + (s ? s.token : sb!.key) };
}
function sbUser(u: any): User {
  return { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.name) || null };
}
function sbError(j: any, fallback: string): string {
  return (j && (j.msg || j.error_description || j.message || j.error)) || fallback;
}
// Runtime telemetry (fire-and-forget, sampled, deduped, PII-free): failures in
// PUBLISHED apps are invisible otherwise — this powers the platform's auto-heal.
const _tel = new Set<string>();
function tel(kind: string, detail: string) {
  try {
    const { apiBase, projectId } = cfg();
    const key = kind + '|' + detail;
    if (!apiBase || _tel.has(key) || Math.random() > 0.5) return;
    _tel.add(key);
    fetch(apiBase + '/telemetry/' + projectId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, detail: detail.slice(0, 280) }),
    }).catch(() => {});
  } catch {}
}
// GoTrue access tokens expire (~1h): refresh once on 401, else clean sign-out
// so the app never limps along with a dead session.
async function sbRefresh(): Promise<boolean> {
  const { sb } = cfg();
  const s = readAuth();
  if (!sb || !s || !s.refresh) return false;
  try {
    const r = await fetch(sb.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: sb.key },
      body: JSON.stringify({ refresh_token: s.refresh }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) { writeAuth(null); return false; }
    writeAuth({ token: j.access_token, refresh: j.refresh_token, user: s.user });
    return true;
  } catch { return false; }
}
async function sbFetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  const go = () => fetch(url, { ...(init || {}), headers: { ...sbHeaders(), ...((init && init.headers) || {}) } });
  let r = await go();
  if (r.status === 401 && readAuth() && (await sbRefresh())) r = await go();
  if (!r.ok && r.status !== 404) tel('sb_' + r.status, (init && init.method ? init.method + ' ' : '') + url.split('?')[0].slice(-90));
  return r;
}

// ---- Firebase driver (BYO): Identity Toolkit (auth) + Firestore (data) over raw
// REST, so it runs in the sandbox preview and on device — no firebase npm SDK.
// Rows carry a synthesized numeric id (Firestore doc ids are strings; app code does
// Number(id)) and an owner_uid for per-user scoping (enforced by Firestore rules).
const FB_IDT = 'https://identitytoolkit.googleapis.com/v1/accounts';
function fbDocs() { const { fb } = cfg(); return 'https://firestore.googleapis.com/v1/projects/' + fb!.projectId + '/databases/(default)/documents'; }
function fbEnc(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fbEnc) } };
  if (typeof v === 'object') { const f: any = {}; for (const k in v) f[k] = fbEnc(v[k]); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
function fbEncFields(o: any) { const f: any = {}; for (const k in o) f[k] = fbEnc(o[k]); return f; }
function fbDec(val: any): any {
  if (!val) return null;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fbDec);
  if ('mapValue' in val) { const o: any = {}; const fields = val.mapValue.fields || {}; for (const k in fields) o[k] = fbDec(fields[k]); return o; }
  return null;
}
function fbHeaders(): Record<string, string> {
  const st = readAuth();
  return st ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.token } : { 'Content-Type': 'application/json' };
}
function fbSerialize(doc: any): Row {
  const fields = doc.fields || {}; const f: any = {}; for (const k in fields) f[k] = fbDec(fields[k]);
  const rawId = Number(f.id);
  const out: any = { id: Number.isFinite(rawId) ? rawId : null };
  for (const k in f) if (k !== 'id' && k !== 'owner_uid' && k !== '_created') out[k] = f[k];
  out._user = f.owner_uid == null ? null : f.owner_uid;
  out._created = f._created || doc.createTime || null;
  return out;
}
async function fbSignUp(email: string, password: string, name?: string) {
  const { fb } = cfg();
  const r = await fetch(FB_IDT + ':signUp?key=' + fb!.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const j = await r.json();
  if (j.error) return { user: null as User | null, error: (j.error.message || 'Signup failed') as string | null };
  const user: User = { id: j.localId, email, name: name || null };
  writeAuth({ token: j.idToken, refresh: j.refreshToken, user });
  return { user, error: null as string | null };
}
async function fbSignIn(email: string, password: string) {
  const { fb } = cfg();
  const r = await fetch(FB_IDT + ':signInWithPassword?key=' + fb!.apiKey, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const j = await r.json();
  if (j.error) return { user: null as User | null, error: (j.error.message || 'Login failed') as string | null };
  const user: User = { id: j.localId, email, name: null };
  writeAuth({ token: j.idToken, refresh: j.refreshToken, user });
  return { user, error: null as string | null };
}
function fbCurrentUid(): string | null { const st = readAuth(); return st ? st.user.id : null; }
async function fbList(table: string, mine?: boolean): Promise<Row[]> {
  // No server orderBy (Firestore needs a composite index for where+orderBy on
  // different fields) — filter by owner_uid, sort by id client-side.
  const q: any = { structuredQuery: { from: [{ collectionId: table }] } };
  if (mine) { const uid = fbCurrentUid(); if (!uid) return []; q.structuredQuery.where = { fieldFilter: { field: { fieldPath: 'owner_uid' }, op: 'EQUAL', value: { stringValue: uid } } }; }
  const r = await fetch(fbDocs() + ':runQuery', { method: 'POST', headers: fbHeaders(), body: JSON.stringify(q) });
  const d = await r.json();
  return (Array.isArray(d) ? d : []).filter((x: any) => x.document).map((x: any) => fbSerialize(x.document)).sort((a: Row, b: Row) => ((a.id ?? Infinity) - (b.id ?? Infinity)));
}
let _fbSeq = Math.floor(Math.random() * 1000);
async function fbInsert(table: string, row: Row): Promise<Row | null> {
  // Number-safe synthesized id: time * 1000 + a monotonic per-client counter so
  // rapid same-millisecond inserts from one client never collide (a server counter
  // doc would also close the rare cross-client case — deferred).
  const id = Date.now() * 1000 + (_fbSeq = (_fbSeq + 1) % 1000);
  const clean: any = {}; for (const k in row) if (k !== 'id' && k !== '_user' && k !== '_created') clean[k] = (row as any)[k];
  clean.id = id; clean.owner_uid = fbCurrentUid(); clean._created = new Date().toISOString();
  const r = await fetch(fbDocs() + '/' + table, { method: 'POST', headers: fbHeaders(), body: JSON.stringify({ fields: fbEncFields(clean) }) });
  const doc = await r.json();
  if (doc.error) { tel('fb_write', 'insert ' + table + ' ' + (doc.error.message || '')); return null; }
  return fbSerialize(doc);
}
async function fbFindDoc(table: string, id: number, mine?: boolean): Promise<any> {
  const filters: any[] = [{ fieldFilter: { field: { fieldPath: 'id' }, op: 'EQUAL', value: { integerValue: String(id) } } }];
  if (mine) { const uid = fbCurrentUid(); if (!uid) return null; filters.push({ fieldFilter: { field: { fieldPath: 'owner_uid' }, op: 'EQUAL', value: { stringValue: uid } } }); }
  const r = await fetch(fbDocs() + ':runQuery', { method: 'POST', headers: fbHeaders(), body: JSON.stringify({ structuredQuery: { from: [{ collectionId: table }], where: { compositeFilter: { op: 'AND', filters } }, limit: 1 } }) });
  const d = await r.json();
  const hit = (Array.isArray(d) ? d : []).find((x: any) => x.document);
  return hit ? hit.document : null;
}
async function fbUpdate(table: string, id: number, patch: Row, mine?: boolean): Promise<Row | null> {
  const doc = await fbFindDoc(table, id, mine); if (!doc) return null;
  const clean: any = {}; for (const k in patch) if (k !== 'id' && k !== '_user' && k !== '_created') clean[k] = (patch as any)[k];
  // An empty writable patch must be a no-op: a PATCH with no updateMask makes
  // Firestore REPLACE the doc with an empty body (erasing owner_uid/id — data loss).
  if (Object.keys(clean).length === 0) return fbSerialize(doc);
  const mask = Object.keys(clean).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch('https://firestore.googleapis.com/v1/' + doc.name + '?' + mask, { method: 'PATCH', headers: fbHeaders(), body: JSON.stringify({ fields: fbEncFields(clean) }) });
  const upd = await r.json();
  return upd.error ? null : fbSerialize(upd);
}
async function fbRemove(table: string, id: number, mine?: boolean): Promise<void> {
  const doc = await fbFindDoc(table, id, mine); if (!doc) return;
  await fetch('https://firestore.googleapis.com/v1/' + doc.name, { method: 'DELETE', headers: fbHeaders() });
}

/** The credentials object form: auth.signUp({ email, password }). */
export type Credentials = { email: string; password: string; name?: string };
export type AuthOutcome = { user: User | null; error: string | null };

/**
 * Real user accounts. BOTH call shapes work and BOTH are typed:
 *   auth.signUp('a@b.com', 'pw', 'Ada')       // positional
 *   auth.signUp({ email, password, name })    // object
 * These are overloads, not a widening: a number where the email goes, or an
 * object with no password, is still a compile error.
 */
export interface AuthApi {
  signUp(email: string, password: string, name?: string): Promise<AuthOutcome>;
  signUp(creds: Credentials): Promise<AuthOutcome>;
  signIn(email: string, password: string): Promise<AuthOutcome>;
  signIn(creds: Credentials): Promise<AuthOutcome>;
  signOut(): Promise<void>;
  getUser(): User | null;
  onChange(fn: (user: User | null) => void): () => void;
}

/** Normalise either call shape to { email, password, name }. Missing or
 *  non-string parts come back empty so the caller can refuse the call instead
 *  of sending the server something it must reject. */
function toCreds(a: string | Credentials, password?: string, name?: string): Credentials {
  const o = typeof a === 'string' ? { email: a, password, name } : a || ({} as Credentials);
  return {
    email: typeof o.email === 'string' ? o.email.trim() : '',
    password: typeof o.password === 'string' ? o.password : '',
    name: typeof o.name === 'string' && o.name ? o.name : undefined,
  };
}

const MISSING_CREDS = 'Email and password are required.';

/** Real user accounts: auth.signUp / signIn / signOut / getUser / onChange. */
export const auth: AuthApi = {
  /** Create an account and sign in. Returns { user, error }. */
  async signUp(emailOrCreds: string | Credentials, passwordArg?: string, nameArg?: string): Promise<AuthOutcome> {
    const { email, password, name } = toCreds(emailOrCreds, passwordArg, nameArg);
    if (!email || !password) return { user: null, error: MISSING_CREDS };
    const { apiBase, projectId, sb } = cfg();
    if (cfg().fb) return fbSignUp(email, password, name);
    if (sb) {
      const r = await fetch(sb.url + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: sb.key },
        body: JSON.stringify({ email, password, data: name ? { name } : undefined }),
      });
      const j = await r.json();
      if (!r.ok) return { user: null, error: sbError(j, 'Signup failed') };
      if (j.access_token && j.user) {
        writeAuth({ token: j.access_token, refresh: j.refresh_token, user: sbUser(j.user) });
        return { user: sbUser(j.user), error: null };
      }
      // email confirmation ON → no session yet; try signing in, else tell the user
      const signed = await auth.signIn(email, password);
      if (signed.user) return signed;
      return { user: null, error: 'Check your email to confirm the account, then log in.' };
    }
    const r = await fetch(apiBase + '/app-auth/' + projectId + '/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const j = await r.json();
    if (!j.ok) return { user: null, error: j.error || 'Signup failed' };
    writeAuth({ token: j.token, user: j.user });
    return { user: j.user, error: null };
  },
  /** Sign in an existing user. Returns { user, error }. */
  async signIn(emailOrCreds: string | Credentials, passwordArg?: string): Promise<AuthOutcome> {
    const { email, password } = toCreds(emailOrCreds, passwordArg);
    if (!email || !password) return { user: null, error: MISSING_CREDS };
    const { apiBase, projectId, sb } = cfg();
    if (cfg().fb) return fbSignIn(email, password);
    if (sb) {
      const r = await fetch(sb.url + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: sb.key },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok || !j.access_token) return { user: null, error: sbError(j, 'Login failed') };
      writeAuth({ token: j.access_token, refresh: j.refresh_token, user: sbUser(j.user) });
      return { user: sbUser(j.user), error: null };
    }
    const r = await fetch(apiBase + '/app-auth/' + projectId + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!j.ok) return { user: null, error: j.error || 'Login failed' };
    writeAuth({ token: j.token, user: j.user });
    return { user: j.user, error: null };
  },
  /** Sign out (clears the session locally and on the server). */
  async signOut(): Promise<void> {
    const { apiBase, projectId, sb } = cfg();
    if (cfg().fb) { writeAuth(null); return; }
    const h = authHeaders();
    if (sb) {
      const hdrs = sbHeaders();
      writeAuth(null);
      if (h.Authorization) {
        try { await fetch(sb.url + '/auth/v1/logout', { method: 'POST', headers: hdrs }); } catch {}
      }
      return;
    }
    writeAuth(null);
    if (h.Authorization) {
      try { await fetch(apiBase + '/app-auth/' + projectId + '/logout', { method: 'POST', headers: h }); } catch {}
    }
  },
  /** The signed-in user (from local session), or null. Synchronous. */
  getUser(): User | null {
    const s = readAuth();
    return s ? s.user : null;
  },
  /** Subscribe to sign-in/out changes. Returns an unsubscribe function. */
  onChange(fn: (user: User | null) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

// ---- data (real backend CRUD; rows are attributed to the signed-in user) ----

/** db.from('todos').list() / .list({ mine: true }) / .insert({...}) / .update(id, patch) / .remove(id). */
export const db = {
  from(table: string) {
    const { apiBase, projectId, sb } = cfg();
    if (cfg().fb) return {
      async list(opts?: { mine?: boolean }): Promise<Row[]> { return fbList(table, opts && opts.mine); },
      async insert(row: Row): Promise<Row | null> { return fbInsert(table, row); },
      async update(id: number, patch: Row, opts?: { mine?: boolean }): Promise<Row | null> { return fbUpdate(table, id, patch, opts && opts.mine); },
      async remove(id: number, opts?: { mine?: boolean }): Promise<void> { return fbRemove(table, id, opts && opts.mine); },
    };
    if (sb) {
      const base = sb.url + '/rest/v1/' + table;
      const mineQ = (opts?: { mine?: boolean }) => {
        const s = readAuth();
        return opts && opts.mine && s ? '&user_id=eq.' + s.user.id : '';
      };
      const write = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
      // Typed Postgres is stricter than the jsonb data plane: server-defaulted
      // timestamp fields sent as epoch numbers, or columns the table doesn't
      // have, hard-fail the whole write. Clean + drop-and-retry keeps legacy
      // app code working instead of silently losing the row.
      const cleanRow = (row: Row): Row => {
        const out: Row = {};
        for (const k in row) {
          const v = (row as any)[k];
          if ((k === 'created_at' || k === 'updated_at' || k === 'id') && typeof v === 'number') continue;
          (out as any)[k] = v;
        }
        return out;
      };
      const sbWrite = async (url: string, method: string, row: Row): Promise<Row | null> => {
        const body: Row = cleanRow(row);
        for (let attempt = 0; attempt < 3; attempt++) {
          const r = await sbFetch(url, { method, headers: write, body: JSON.stringify(body) });
          const j = await r.json().catch(() => null);
          if (r.ok) return Array.isArray(j) ? j[0] || null : j || null;
          const m = j && j.message && String(j.message).match(/'([^']+)' column/);
          if (r.status === 400 && m && m[1] in body) { delete (body as any)[m[1]]; continue; }
          tel('write_failed', method + ' ' + url.split('?')[0].slice(-60) + ' ' + ((j && j.message) || r.status));
          return null;
        }
        tel('write_failed', method + ' retries exhausted');
        return null;
      };
      return {
        async list(opts?: { mine?: boolean }): Promise<Row[]> {
          const r = await sbFetch(base + '?select=*&order=id.asc' + mineQ(opts));
          const j = await r.json();
          return Array.isArray(j) ? j : [];
        },
        async insert(row: Row): Promise<Row | null> {
          return sbWrite(base, 'POST', row);
        },
        async update(id: number, patch: Row, opts?: { mine?: boolean }): Promise<Row | null> {
          return sbWrite(base + '?id=eq.' + id + mineQ(opts), 'PATCH', patch);
        },
        async remove(id: number, opts?: { mine?: boolean }): Promise<void> {
          await sbFetch(base + '?id=eq.' + id + mineQ(opts), { method: 'DELETE' });
        },
      };
    }
    const base = apiBase + '/data/' + projectId + '/' + table;
    return {
      /** All rows — or only the signed-in user's with { mine: true }. */
      async list(opts?: { mine?: boolean }): Promise<Row[]> {
        const r = await fetch(base + (opts && opts.mine ? '?mine=1' : ''), { headers: authHeaders() });
        const j = await r.json();
        return j.rows || [];
      },
      async insert(row: Row): Promise<Row | null> {
        const r = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ row }),
        });
        const j = await r.json();
        return j.row || null;
      },
      /** Merge-patch a row (edit / toggle) — with { mine: true } only the signed-in user's row. */
      async update(id: number, patch: Row, opts?: { mine?: boolean }): Promise<Row | null> {
        const r = await fetch(base + '/' + id + (opts && opts.mine ? '?mine=1' : ''), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ row: patch }),
        });
        const j = await r.json();
        return j.row || null;
      },
      /** Delete a row — with { mine: true } only if it belongs to the signed-in user. */
      async remove(id: number, opts?: { mine?: boolean }): Promise<void> {
        await fetch(base + '/' + id + (opts && opts.mine ? '?mine=1' : ''), {
          method: 'DELETE',
          headers: authHeaders(),
        });
      },
    };
  },
};

/**
 * Transactional email — send a real email from your app (welcome notes, order
 * confirmations, password resets). The API key lives on Kashvi's server, so
 * your app never handles secrets. Returns { ok, error } — check ok before
 * assuming delivery. From-address defaults to your Kashvi project sender; set a
 * verified custom domain from the studio to send as your own brand.
 */
export const email = {
  async send(msg: { to: string; subject: string; html?: string; text?: string; replyTo?: string }): Promise<{ ok: boolean; error: string | null }> {
    const { apiBase, projectId } = cfg();
    if (!apiBase) return { ok: false, error: 'Email is only available on a published app.' };
    try {
      const r = await fetch(apiBase + '/email/' + projectId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(msg),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: !!j.ok, error: j.ok ? null : (j.error || 'Email failed to send.') };
    } catch (e: any) {
      return { ok: false, error: (e && e.message) || 'Email request failed.' };
    }
  },
};

/**
 * Payments — take real money in your app (Stripe worldwide, Razorpay for INR/UPI).
 * The provider is chosen automatically from the currency; keys live on Kashvi's
 * server, so your app never handles a secret. Amounts are INTEGER smallest units
 * (500 = $5.00 / ₹5.00). Only works on a PUBLISHED app — preview returns
 * 'unavailable'. Always check res.status; grant goods ONLY when status === 'paid'.
 */
export type PayResult = {
  ok: boolean;
  status: 'paid' | 'cancelled' | 'failed' | 'pending' | 'unavailable';
  paymentId: string | null;
  provider: 'stripe' | 'razorpay' | null;
  amount: number | null;
  currency: string | null;
  test: boolean;
  error: string | null;
};

let _payInFlight = false;

function _loadRazorpay(): Promise<boolean> {
  if ((window as any).Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export const pay = {
  async checkout(args: { amount: number; currency: string; label?: string; metadata?: Record<string, string | number>; email?: string }): Promise<PayResult> {
    const { apiBase, projectId, env } = cfg();
    const base = { paymentId: null, provider: null as any, amount: args.amount ?? null, currency: args.currency ?? null, test: false };
    if (!apiBase || env !== 'published')
      return { ok: false, status: 'unavailable', ...base, error: 'Publish your app to accept real payments.' };
    if (_payInFlight) return { ok: false, status: 'failed', ...base, error: 'A payment is already in progress.' };
    _payInFlight = true;
    try {
      const r = await fetch(apiBase + '/pay/' + projectId + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ ...args, client: 'web' }),
      });
      const intent = await r.json().catch(() => null);
      if (!intent || !intent.ok)
        return { ok: false, status: intent && intent.status === 'unavailable' ? 'unavailable' : 'failed', ...base, error: (intent && intent.error) || 'Could not start the payment.' };
      if (intent.provider === 'razorpay') return await _rzModal(intent, apiBase, projectId, base);
      if (intent.provider === 'stripe') return await _stripePopup(intent, apiBase, projectId, base);
      return { ok: false, status: 'failed', ...base, error: 'No payment method for ' + args.currency + '.' };
    } catch (e: any) {
      return { ok: false, status: 'failed', ...base, error: (e && e.message) || 'Payment request failed.' };
    } finally {
      _payInFlight = false;
    }
  },
  async available(): Promise<{ enabled: boolean; currencies: string[]; testMode: boolean }> {
    const { apiBase, projectId } = cfg();
    if (!apiBase) return { enabled: false, currencies: [], testMode: false };
    try {
      const j = await (await fetch(apiBase + '/pay/' + projectId + '/config')).json();
      return { enabled: !!j.enabled, currencies: j.currencies || [], testMode: !!j.testMode };
    } catch {
      return { enabled: false, currencies: [], testMode: false };
    }
  },
};

async function _rzModal(intent: any, apiBase: string, projectId: string, base: any): Promise<PayResult> {
  const loaded = await _loadRazorpay();
  if (!loaded) return { ok: false, status: 'failed', ...base, provider: 'razorpay', error: 'Could not load the payment window.' };
  return new Promise<PayResult>((resolve) => {
    const rz = new (window as any).Razorpay({
      key: intent.keyId,
      order_id: intent.orderId,
      amount: intent.amount,
      currency: intent.currency,
      name: intent.label || 'Payment',
      description: intent.label || '',
      prefill: intent.prefillEmail ? { email: intent.prefillEmail } : {},
      handler: async (resp: any) => {
        try {
          const v = await fetch(apiBase + '/pay/' + projectId + '/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ provider: 'razorpay', orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }),
          }).then((r) => r.json());
          resolve({ ...base, ...v, provider: 'razorpay' });
        } catch {
          resolve({ ok: false, status: 'pending', ...base, provider: 'razorpay', error: "We're confirming your payment — you'll get a receipt." });
        }
      },
      modal: { ondismiss: () => resolve({ ok: false, status: 'cancelled', ...base, provider: 'razorpay', error: null }) },
    });
    rz.open();
  });
}

async function _stripePopup(intent: any, apiBase: string, projectId: string, base: any): Promise<PayResult> {
  const win = window.open(intent.url, '_blank');
  if (!win) return { ok: false, status: 'failed', ...base, provider: 'stripe', error: 'Allow pop-ups to complete the payment.' };
  const ref = intent.reference;
  const started = Date.now();
  return new Promise<PayResult>((resolve) => {
    let done = false;
    const finish = (r: PayResult) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      clearTimeout(cap);
      resolve(r);
    };
    const poll = async () => {
      // Timeout is checked FIRST so a stalled /status fetch can never wedge the
      // flow past 10 min (a separate cap timer backs this up too).
      if (Date.now() - started > 600000) {
        finish({ ok: false, status: 'pending', ...base, provider: 'stripe', error: "We're confirming your payment — you'll get a receipt if it went through." });
        return;
      }
      try {
        const s = await fetch(apiBase + '/pay/' + projectId + '/status?reference=' + encodeURIComponent(ref)).then((r) => r.json());
        if (s && (s.status === 'paid' || s.status === 'cancelled' || (s.status === 'failed' && s.error))) {
          finish({ ...base, ...s, provider: 'stripe' });
          return;
        }
      } catch { /* keep polling */ }
      // Buyer closed the checkout tab without paying → confirm once, else cancelled.
      if (win.closed && !done) {
        try {
          const s = await fetch(apiBase + '/pay/' + projectId + '/status?reference=' + encodeURIComponent(ref)).then((r) => r.json());
          if (s && s.status === 'paid') { finish({ ...base, ...s, provider: 'stripe' }); return; }
        } catch { /* fall through to cancelled */ }
        finish({ ok: false, status: 'cancelled', ...base, provider: 'stripe', error: null });
      }
    };
    const timer = setInterval(poll, 2500);
    const cap = setTimeout(
      () => finish({ ok: false, status: 'pending', ...base, provider: 'stripe', error: "We're confirming your payment — you'll get a receipt if it went through." }),
      600000,
    );
    void poll();
  });
}

export type AiMessage = { role: 'user' | 'assistant'; content: string };

/**
 * In-app AI — a real assistant your app can use (chat, "chat with your data",
 * summarize, extract). The Anthropic key lives on Kashvi's server; your app just
 * calls these. It's funded by the project owner's credits (cheap — pennies per
 * message), so use it on a user action, not on every render. Every method ALWAYS
 * resolves (never throws): on an error you get { ok:false }, and when the owner
 * has turned it off or run out you get { degraded:true } — show a graceful
 * fallback in the UI.
 */
export const ai = {
  async chat(args: { messages: AiMessage[]; system?: string }): Promise<{ ok: boolean; reply: string | null; error: string | null; degraded: boolean }> {
    const { apiBase, projectId } = cfg();
    if (!apiBase) return { ok: false, reply: null, error: 'AI is only available on a running app.', degraded: true };
    try {
      const j = await (await fetch(apiBase + '/ai/' + projectId + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(args) })).json();
      return { ok: !!j.ok && !j.degraded, reply: j.reply ?? null, error: j.error ?? null, degraded: !!j.degraded };
    } catch { return { ok: false, reply: null, error: 'The assistant is unavailable right now.', degraded: false }; }
  },
  async ask(args: { question: string; tables?: string[] }): Promise<{ ok: boolean; answer: string | null; sources: { table: string; id: number }[]; error: string | null; degraded: boolean }> {
    const { apiBase, projectId } = cfg();
    if (!apiBase) return { ok: false, answer: null, sources: [], error: 'AI is only available on a running app.', degraded: true };
    try {
      const j = await (await fetch(apiBase + '/ai/' + projectId + '/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(args) })).json();
      return { ok: !!j.ok && !j.degraded, answer: j.answer ?? null, sources: j.sources ?? [], error: j.error ?? null, degraded: !!j.degraded };
    } catch { return { ok: false, answer: null, sources: [], error: 'The assistant is unavailable right now.', degraded: false }; }
  },
  async summarize(args: { text: string; style?: 'tldr' | 'bullets' | 'short' }): Promise<{ ok: boolean; text: string | null; error: string | null; degraded: boolean }> {
    const { apiBase, projectId } = cfg();
    if (!apiBase) return { ok: false, text: null, error: 'AI is only available on a running app.', degraded: true };
    try {
      const j = await (await fetch(apiBase + '/ai/' + projectId + '/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(args) })).json();
      return { ok: !!j.ok && !j.degraded, text: j.text ?? null, error: j.error ?? null, degraded: !!j.degraded };
    } catch { return { ok: false, text: null, error: 'The assistant is unavailable right now.', degraded: false }; }
  },
  async extract(args: { text: string; fields: string[] }): Promise<{ ok: boolean; data: Record<string, string>; error: string | null; degraded: boolean }> {
    const { apiBase, projectId } = cfg();
    if (!apiBase) return { ok: false, data: {}, error: 'AI is only available on a running app.', degraded: true };
    try {
      const j = await (await fetch(apiBase + '/ai/' + projectId + '/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify(args) })).json();
      return { ok: !!j.ok && !j.degraded, data: j.data ?? {}, error: j.error ?? null, degraded: !!j.degraded };
    } catch { return { ok: false, data: {}, error: 'The assistant is unavailable right now.', degraded: false }; }
  },
};
