const ACTIVATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
const ACTIVATION_SECRET = "FOCO-POSSE-ATIVACAO-2027";

export const STUDENT_ACTIVATION_STORAGE_KEY = "kuaa-activation-v2";
export const ACTIVATION_MONTH_OPTIONS = Array.from({ length: 24 }, (_, index) => index + 1);
const ACTIVATION_MONTH_MARKERS = ACTIVATION_ALPHABET.slice(0, ACTIVATION_MONTH_OPTIONS.length);
const ONLINE_TIME_ENDPOINT = "https://time.now/developer/api/timezone/Etc/UTC";

export type ActivationGrant = {
  activatedAt: string;
  expiresAt: string;
  months: number;
};

export function isStudentActivationRequired(now = new Date()) {
  return now.getTime() >= new Date(2027, 0, 10, 0, 0, 0, 0).getTime();
}

export function normalizeActivationValue(value: string) {
  return value.toUpperCase().replace(/[^A-Z1-9]/g, "").slice(0, 5);
}

export function createActivationCode() {
  const values = new Uint32Array(5);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else for (let index = 0; index < values.length; index += 1) values[index] = Math.floor(Math.random() * 2 ** 32);
  return Array.from(values, (value) => ACTIVATION_ALPHABET[value % ACTIVATION_ALPHABET.length]).join("");
}

export function passwordForActivationCode(value: string, months = 1) {
  const code = normalizeActivationValue(value);
  if (code.length !== 5 || !ACTIVATION_MONTH_OPTIONS.includes(months)) return "";
  let state = 2166136261;
  for (const character of `${ACTIVATION_SECRET}|${code}`) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  let password = ACTIVATION_MONTH_MARKERS[months - 1];
  for (let index = 0; index < 4; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    password += ACTIVATION_ALPHABET[(state >>> 0) % ACTIVATION_ALPHABET.length];
  }
  return password;
}

export function monthsForActivationPassword(codeValue: string, passwordValue: string) {
  const password = normalizeActivationValue(passwordValue);
  const months = ACTIVATION_MONTH_MARKERS.indexOf(password[0]) + 1;
  return ACTIVATION_MONTH_OPTIONS.includes(months) && passwordForActivationCode(codeValue, months) === password ? months : null;
}

function addMonths(start: Date, months: number) {
  const result = new Date(start);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const finalDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, finalDay));
  return result;
}

export function createActivationGrant(months: number, current: ActivationGrant | null = null, now = new Date()): ActivationGrant {
  const currentExpiry = current ? new Date(current.expiresAt) : null;
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return { activatedAt: now.toISOString(), expiresAt: addMonths(base, months).toISOString(), months };
}

export function isActivationGrantValid(grant: ActivationGrant | null, now = new Date()) {
  return Boolean(grant && Number.isFinite(new Date(grant.expiresAt).getTime()) && new Date(grant.expiresAt).getTime() > now.getTime());
}

export async function fetchOnlineUtcTime(signal?: AbortSignal) {
  const response = await fetch(ONLINE_TIME_ENDPOINT, { method: "GET", mode: "cors", cache: "no-store", signal });
  if (!response.ok) throw new Error("Fonte de horário indisponível");
  const payload = await response.json() as { utc_datetime?: unknown; datetime?: unknown };
  const candidate = typeof payload.utc_datetime === "string" ? payload.utc_datetime : typeof payload.datetime === "string" ? payload.datetime : "";
  const parsed = new Date(candidate);
  if (!candidate || !Number.isFinite(parsed.getTime())) throw new Error("Resposta de horário inválida");
  return parsed;
}
