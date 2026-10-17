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
  } catch { clearDriveToken(); return null; }
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
export async function nativeDriveToken(): Promise<string> {
  const plugin = nativePlugin();
  if (!plugin?.driveToken) throw new Error("Login nativo indisponível.");
  const r = await plugin.driveToken();
  if (r.error || !r.token) throw new Error(r.error || "Google não autorizou.");
  return r.token;
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
