/**
 * kuaa — metadados confiáveis antes de apresentação.
 * Códigos de caderno, tipo de prova e folhas de resposta nunca podem ocupar o campo de cargo.
 */

type RoleEvidence = { subject?: string; text?: string };

const UNKNOWN_ROLE = "Cargo não identificado — revisar";

function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isInvalidRole(value: unknown) {
  const role = clean(value);
  if (!role || role.length < 3 || /^\d+$/.test(role)) return true;
  if (/^(n[aã]o informado|cargo n[aã]o informado|não se aplica)$/i.test(role)) return true;
  if (/\b(prova|caderno|folha|gabarito)\b/i.test(role)) return true;
  if (/\btipo\s+[a-z0-9]\b/i.test(role)) return true;
  if (/^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/i.test(role)) return true;
  return false;
}

function roleFromSpecificSubjects(evidence: RoleEvidence[]) {
  const content = evidence.map((item) => `${item.subject || ""} ${item.text || ""}`).join(" ");
  const labeled = content.match(/(?:conhecimentos?\s+)?espec[ií]fic(?:os|as)\s*(?:[·:—–/-]\s*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,55})/i)?.[1]?.trim();
  if (labeled && !/^(gerais|diversos|legisla[cç][aã]o)$/i.test(labeled)) return labeled.replace(/\s+(?:—|–|-).*$/, "").trim();
  if (/\benfermagem\b|\benfermeir[oa]\b/i.test(content)) return "Enfermeiro";
  if (/\bpedagog(?:ia|o|a)\b/i.test(content)) return "Pedagogo";
  if (/\bengenheir[oa]\s+civil\b/i.test(content)) return "Engenheiro Civil";
  return "";
}

export function inferExamRole(input: { role?: unknown; cargo?: unknown; title?: unknown; evidence?: RoleEvidence[] }) {
  const supplied = [input.role, input.cargo].map(clean).find((value) => !isInvalidRole(value));
  if (supplied) return supplied;
  const title = clean(input.title);
  const titleMatch = title.match(/(?:cargo|fun[cç][aã]o|emprego)\s*(?:de)?\s*[:—–-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{2,55})/i)?.[1]?.trim();
  if (titleMatch && !isInvalidRole(titleMatch)) return titleMatch;
  return roleFromSpecificSubjects(input.evidence || []) || UNKNOWN_ROLE;
}

export function isUnresolvedRole(value: unknown) {
  return clean(value) === UNKNOWN_ROLE;
}

export { UNKNOWN_ROLE };
