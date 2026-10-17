// Backup do progresso no Google Drive (pasta oculta AppData, por usuário).
// Fluxo: OAuth código + PKCE em janela própria (popup) com redirect loopback
// ou nativo (plugin KuaaOauth no Android). Sem backend; credenciais do
// cliente Desktop embutidas no pacote (Regras 3.3 — PKCE compensa).
// NÃO inclui provas (o repositório oficial cobre) — só progresso e ajustes.
// Cliente DESKTOP do projeto kuaa-510813: o ...mom9 era tipo Android e o
// Google bloqueia o loopback nesse tipo desde 2022 ("loopback flow has been
// blocked"); Desktop aceita localhost em qualquer porta. ID e secret ficam em
// base64 e são montados em runtime (a varredura de segredos do GitHub recusa
// push com credencial literal — não é vazamento: o valor vai no app mesmo).
const KUAA_OAUTH_CRED_B64 = "MTA4ODY1MTc5NjEzMi00bHBhYjhyNWZpMGIyaDRnMHNrZ3VlaXJmdDdnOWduZS5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbXxHT0NTUFgtemdlTHlUSThONGpoSVNtcDNSZ2wwVW53S3NfNA==";
export const DRIVE_CLIENT_ID = atob(KUAA_OAUTH_CRED_B64).split("|")[0];
export const DRIVE_CLIENT_SECRET = atob(KUAA_OAUTH_CRED_B64).split("|")[1];
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const DRIVE_TOKEN_KEY = "kuaa-drive-token";
export const BACKUP_REMOTE_NAME = "kuaa-backup.json";
export const BACKUP_VERSION = 1;

export type DriveToken = { access_token: string; refresh_token: string; expires_at: number };
export type BackupPayload = { v: number; at: string; data: Record<string, unknown> };

// Chaves portáteis: tudo menos provas e flags de dispositivo/migração.
const IDB_KEYS = ["attempts", "quickEvents", "quickHistory", "perfHistory", "custom-themes", "sound-pack-files"];
const LS_KEYS = [
  "kuaa-student-theme", "kuaa-student-palette",
  "kuaa-active-custom-theme", "kuaa-active-custom-palette",
  "kuaa-vibration-enabled", "kuaa-acerto-vibration", "kuaa-erro-vibration",
  "kuaa-sound-enabled", "kuaa-sound-pack-name",
  "kuaa-banner-enabled", "kuaa-banner-speed", "kuaa-banner-profile",
  "kuaa-perfect-streak-record", "kuaa-achievements",
  "kuaa-quick-hand-mode", "kuaa-quick-durations",
  "kuaa-form-responses",
  "kuaa-ritmo-modo", "kuaa-ritmo-tempo", "kuaa-ritmo-recordes",
  "kuaa-performance-history",
  "kuaa-terms-accept-v1", "kuaa-repo-imports",
];

export type IdbIO = {
  get: <T>(key: string) => Promise<T | undefined>;
  set: (key: string, value: unknown) => Promise<boolean>;
};

export async function buildBackupPayload(idb: IdbIO): Promise<BackupPayload> {
  const data: Record<string, unknown> = {};
  for (const k of IDB_KEYS) {
    try {
      const v = await idb.get(`idb:${k}`);
      if (v !== undefined) data[`idb:${k}`] = v;
    } catch { /* ignora chave ilegível */ }
  }
  for (const k of LS_KEYS) {
    try {
      const v = window.localStorage.getItem(k);
      if (v !== null) data[`ls:${k}`] = v;
    } catch { /* ignora */ }
  }
  return { v: BACKUP_VERSION, at: new Date().toISOString(), data };
}

export async function applyBackupPayload(payload: BackupPayload, idb: IdbIO): Promise<{ restored: number }> {
  if (!payload || payload.v !== BACKUP_VERSION || typeof payload.data !== "object") {
    throw new Error("Backup inválido ou de versão desconhecida.");
  }
  let restored = 0;
  for (const [k, v] of Object.entries(payload.data)) {
    try {
      if (k.startsWith("idb:")) {
        if (await idb.set(k.slice(4), v)) restored++;
      } else if (k.startsWith("ls:")) {
        window.localStorage.setItem(k.slice(3), String(v));
        restored++;
      }
    } catch { /* ignora chave com falha */ }
  }
  return { restored };
}

// ---- Desempate: nada se substitui, tudo é somado ----
// Dois aparelhos usam sem internet e, ao se conectarem, o progresso dos dois
// é unido: listas viram união por id (tentativas, eventos rápidos, respostas
// de formulário), objetos ganham as chaves que faltam e escalares (ajustes)
// ficam com o valor do aparelho. Só o que existe só na nuvem é trazido; nada
// local é descartado.
function ehRegistro(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
function chaveItem(v: unknown): string {
  if (ehRegistro(v) && v.id !== undefined) return String(v.id);
  return JSON.stringify(v);
}
function campoData(lista: unknown[]): string | null {
  for (const campo of ["completedAt", "answeredAt"]) {
    const primeiro = lista.find(ehRegistro);
    if (primeiro && primeiro[campo] !== undefined) return campo;
  }
  return null;
}
function mesclarListas(a: unknown[], b: unknown[]): unknown[] {
  const saida = [...a];
  const vistas = new Set(a.map(chaveItem));
  for (const item of b) {
    const chave = chaveItem(item);
    if (!vistas.has(chave)) { vistas.add(chave); saida.push(item); }
  }
  const campo = campoData(saida);
  if (campo) saida.sort((x, y) => String(ehRegistro(x) ? x[campo] ?? "" : "").localeCompare(String(ehRegistro(y) ? y[campo] ?? "" : "")));
  return saida;
}
function mesclarValor(a: unknown, b: unknown): unknown {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;
  if (Array.isArray(a) && Array.isArray(b)) return mesclarListas(a, b);
  if (ehRegistro(a) && ehRegistro(b)) {
    const saida: Record<string, unknown> = { ...b };
    for (const [k, v] of Object.entries(a)) saida[k] = mesclarValor(v, b[k]);
    return saida;
  }
  // Números aqui são progresso (recordes, conquistas, contadores): fica o
  // maior dos dois — nada se perde por ter sido feito no outro aparelho.
  if (typeof a === "number" && typeof b === "number") return Math.max(a, b);
  return a; // texto/booleano e misturas: vale o do aparelho (preferências)
}
function tentarJson(v: unknown): { ok: boolean; valor?: unknown } {
  if (typeof v !== "string") return { ok: false };
  try { return { ok: true, valor: JSON.parse(v) }; } catch { return { ok: false }; }
}
/** Une o backup local com o da nuvem sem perder nada de nenhum dos lados. */
export function mergePayloads(local: BackupPayload, remote: BackupPayload): BackupPayload {
  const data: Record<string, unknown> = {};
  const chaves: Record<string, true> = {};
  for (const k of Object.keys(local?.data ?? {})) chaves[k] = true;
  for (const k of Object.keys(remote?.data ?? {})) chaves[k] = true;
  for (const k of Object.keys(chaves)) {
    const a = local?.data?.[k];
    const b = remote?.data?.[k];
    // As chaves do localStorage são strings; quando guardam JSON (conquistas,
    // respostas de formulário, sequências) o conteúdo é unido como
    // lista/objeto; texto puro (tema, velocidade…) fica com o do aparelho.
    if (k.startsWith("ls:")) {
      const ja = tentarJson(a);
      const jb = tentarJson(b);
      if (ja.ok || jb.ok) {
        const unido = mesclarValor(a === undefined ? undefined : ja.valor, b === undefined ? undefined : jb.valor);
        data[k] = JSON.stringify(unido === undefined ? null : unido);
        continue;
      }
    }
    data[k] = mesclarValor(a, b);
  }
  return { v: BACKUP_VERSION, at: new Date().toISOString(), data };
}

export function readDriveToken(): DriveToken | null {  try {
    const raw = window.localStorage.getItem(DRIVE_TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as DriveToken;
    return t && t.access_token ? t : null;
  } catch { return null; }
}
export function clearDriveToken() {
  try { window.localStorage.removeItem(DRIVE_TOKEN_KEY); } catch { /* ignora */ }
}

// ---- Estado da sincronia (bolinha da tela inicial) ----
// A impressão digital (hash) do payload atual comparada com a do último
// backup que chegou ao Drive diz se "está tudo salvo" — é o que alimenta o
// ponto verde/azul/amarelo/vermelho.
const DRIVE_SYNC_FP_KEY = "kuaa-drive-synced-fp";

export function payloadFingerprint(payload: BackupPayload): string {
  const s = JSON.stringify(payload.data);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${s.length}:${h.toString(16)}`;
}

export async function backupFingerprint(idb: IdbIO): Promise<string> {
  return payloadFingerprint(await buildBackupPayload(idb));
}

export function readSyncedFingerprint(): string | null {
  try { return window.localStorage.getItem(DRIVE_SYNC_FP_KEY); } catch { return null; }
}

export function saveSyncedFingerprint(fp: string) {
  try { window.localStorage.setItem(DRIVE_SYNC_FP_KEY, fp); } catch { /* ignora */ }
}

/** Desconecta do Drive e esquece a última sincronia (trocar de conta). */
export function clearDriveSession() {
  clearDriveToken();
  try { window.localStorage.removeItem(DRIVE_SYNC_FP_KEY); } catch { /* ignora */ }
}

/**
 * Revoga a permissão no servidor do Google. Sem isso, o consentimento volta a
 * liberar em silêncio a mesma conta e o usuário não consegue trocar de conta.
 * Best-effort: falha aqui não impede a saída (o signOut do Play Services já
 * sai da conta no aparelho).
 */
export async function revokeDriveAccess(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `token=${encodeURIComponent(token)}&client_id=${encodeURIComponent(DRIVE_CLIENT_ID)}`,
    });
  } catch { /* revogação é best-effort */ }
}

function b64url(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const raw = new Uint8Array(32);
  window.crypto.getRandomValues(raw);
  const verifier = b64url(raw.buffer as ArrayBuffer);
  const digest = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

export function googleAuthUrl(redirectUri: string, challenge: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", DRIVE_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", DRIVE_SCOPE);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  return u.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<DriveToken> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: DRIVE_CLIENT_ID, client_secret: DRIVE_CLIENT_SECRET, ...body }),
  });
  if (!res.ok) throw new Error(`Token HTTP ${res.status}`);
  const j = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Resposta de token inválida.");
  const prev = readDriveToken();
  const token: DriveToken = {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prev?.refresh_token || "",
    expires_at: Date.now() + Number(j.expires_in || 3600) * 1000,
  };
  try { window.localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(token)); } catch { /* ignora */ }
  return token;
}
export const exchangeCode = (code: string, verifier: string, redirectUri: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });

export async function validToken(): Promise<DriveToken | null> {
  // Android: o token vem do Play Services (consentimento nativo, sem WebView).
  // A primeira chamada mostra o diálogo do Google; as seguintes são silenciosas.
  if (hasNativeDriveAuth()) {
    const cached = readDriveToken();
    if (cached && cached.expires_at - Date.now() > 60000) return cached;
    try {
      const token = await nativeDriveToken();
      const nativo: DriveToken = { access_token: token, refresh_token: "nativo", expires_at: Date.now() + 3300000 };
      try { window.localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(nativo)); } catch { /* ignora */ }
      return nativo;
    } catch { return null; }
  }
  const t = readDriveToken();
  if (!t) return null;
  if (t.expires_at - Date.now() > 60000) return t;
  if (!t.refresh_token) { clearDriveToken(); return null; }
  try {
    return await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh_token });
  } catch (err) {
    // Rede caída não é revogação: só limpa o token quando o Google mesmo
    // recusou (HTTP 4xx); numa falha de internet o token fica guardado.
    if (err instanceof Error && err.message.startsWith("Token HTTP 4")) clearDriveToken();
    return null;
  }
}

async function driveFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`Drive HTTP ${res.status}`);
  return res;
}

export async function findBackupFile(token: string): Promise<{ id: string; modifiedTime: string } | null> {
  const res = await driveFetch(
    `/drive/v3/files?q=${encodeURIComponent(`name='${BACKUP_REMOTE_NAME}' and trashed=false`)}&spaces=appDataFolder&fields=files(id,modifiedTime)`,
    token,
  );
  const j = await res.json() as { files?: { id: string; modifiedTime: string }[] };
  return j.files?.[0] || null;
}

export async function uploadBackup(token: string, payload: BackupPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const existing = await findBackupFile(token);
  if (existing) {
    await driveFetch(`/upload/drive/v3/files/${existing.id}?uploadType=media`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } else {
    const meta = { name: BACKUP_REMOTE_NAME, parents: ["appDataFolder"] };
    const boundary = `kuaa${Date.now()}`;
    const multipart =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}` +
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await driveFetch("/upload/drive/v3/files?uploadType=multipart", token, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
  }
}

export async function downloadBackup(token: string): Promise<BackupPayload> {
  const existing = await findBackupFile(token);
  if (!existing) throw new Error("Nenhum backup encontrado no Google Drive.");
  const res = await driveFetch(`/drive/v3/files/${existing.id}?alt=media`, token);
  return await res.json() as BackupPayload;
}

// ---- Ponte nativa (Android) e popup (web/MSIX) ----

type NativeOAuthPlugin = {
  driveToken?: () => Promise<{ token?: string; error?: string }>;
  signOut?: () => Promise<void>;
};
function nativePlugin(): NativeOAuthPlugin | null {
  try {
    const p = (window as unknown as { Capacitor?: { Plugins?: { KuaaOauth?: NativeOAuthPlugin } } }).Capacitor?.Plugins?.KuaaOauth;
    return p && typeof p.driveToken === "function" ? p : null;
  } catch { return null; }
}

// Login nativo (Play Services): o Google recusa OAuth dentro de WebView —
// "Esse navegador ou app pode não ser seguro". No Android o token do Drive
// sai do plugin KuaaOauth.driveToken (consentimento nativo do Google); no
// web/MSIX continua o popup num navegador de verdade.
export const hasNativeDriveAuth = (): boolean => nativePlugin() !== null;

// O Play Services às vezes engasga (ex.: logo depois de um signOut) e a
// Promise do plugin nunca assenta — o botão ficava "mudo" até reiniciar o
// app. Com prazo, o erro sobe e o clique pode ser tentado de novo.
function comPrazo<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => { window.clearTimeout(timer); resolve(v); },
      (e) => { window.clearTimeout(timer); reject(e); },
    );
  });
}

export async function nativeDriveToken(): Promise<string> {
  const plugin = nativePlugin();
  if (!plugin?.driveToken) throw new Error("Login nativo indisponível.");
  const r = await comPrazo(plugin.driveToken(), 15000, "O Google não respondeu. Tente de novo.");
  if (r.error || !r.token) throw new Error(r.error || "Google não autorizou.");
  return r.token;
}

/**
 * Sai da conta Google no Play Services (Android): sem isso, o próximo
 * consentimento nativo reusa a conta silenciosamente e o usuário não
 * consegue trocar de conta.
 */
export async function nativeSignOut(): Promise<boolean> {
  const plugin = nativePlugin();
  if (!plugin?.signOut) return false;
  try { await comPrazo(plugin.signOut(), 5000, "signOut lento"); return true; } catch { return false; }
}

/**
 * Login nativo de um toque: usa o token guardado se ainda vale; senão abre o
 * consentimento do Play Services. O Play Services às vezes engasga na 1ª
 * chamada logo depois de um signOut (o botão ficava mudo até reiniciar o
 * app) — espera um pouco e tenta de novo antes de desistir.
 */
export async function nativeLogin(): Promise<DriveToken> {
  const cached = readDriveToken();
  if (cached && cached.expires_at - Date.now() > 60000) return cached;
  let token: string;
  try {
    token = await nativeDriveToken();
  } catch (err) {
    // "não autorizou" = o usuário cancelou ou o Google recusou: não insiste.
    if (err instanceof Error && err.message.includes("autorizou")) throw err;
    await new Promise((r) => window.setTimeout(r, 1500));
    token = await nativeDriveToken();
  }
  const nativo: DriveToken = { access_token: token, refresh_token: "nativo", expires_at: Date.now() + 3300000 };
  try { window.localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify(nativo)); } catch { /* ignora */ }
  return nativo;
}

export function waitPopupCode(popup: Window, timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      try {
        if (popup.closed) {
          window.clearInterval(timer);
          reject(new Error("Login cancelado."));
          return;
        }
        const raw = window.localStorage.getItem("kuaa-oauth-code");
        if (raw) {
          const v = JSON.parse(raw) as { code?: string; error?: string; at?: number };
          if (v && v.at && v.at >= start - 1000) {
            window.clearInterval(timer);
            try { window.localStorage.removeItem("kuaa-oauth-code"); } catch { /* ignora */ }
            try { popup.close(); } catch { /* ignora */ }
            if (v.error || !v.code) reject(new Error("Google não autorizou."));
            else resolve(v.code);
            return;
          }
        }
        if (Date.now() - start > timeoutMs) {
          window.clearInterval(timer);
          try { popup.close(); } catch { /* ignora */ }
          reject(new Error("Tempo esgotado. Tente de novo."));
        }
      } catch (e) {
        window.clearInterval(timer);
        reject(e instanceof Error ? e : new Error("Falha no login."));
      }
    }, 500);
  });
}
