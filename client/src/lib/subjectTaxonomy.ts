/**
 * kuaa — taxonomia de estudo: poucos rótulos úteis, legislação preservada
 * e conhecimentos específicos organizados primeiro pela profissão.
 */
export type SubjectReference = { subject: string; role?: string };
export type SubjectGroup = { label: string; count: number; priority: number };

type SubjectCandidate = {
  label: string;
  generic: string;
  kind: "priority" | "law" | "specific" | "general";
};

const MINIMUM_GROUP_SIZE = 20;

const titleCase = (value: string) => value
  .trim()
  .replace(/\s+/g, " ")
  .replace(/(^|\s)([A-Za-zÀ-ÖØ-öø-ÿ])/g, (_match, lead: string, letter: string) => `${lead}${letter.toLocaleUpperCase("pt-BR")}`);

const normalizeDash = (value: string) => value.trim().replace(/\s*[—–-]\s*/g, " — ").replace(/\s+/g, " ");

const splitTopLevelTopic = (value: string) => {
  const parts: string[] = [];
  let buffer = "";
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (character === "/" || character === "—" || character === "–")) {
      if (buffer.trim()) parts.push(buffer.trim());
      buffer = "";
      continue;
    }
    buffer += character;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
};

function subjectCandidate(subject: string, role = "") : SubjectCandidate | null {
  const raw = normalizeDash(subject);
  if (!raw) return null;
  const lower = raw.toLocaleLowerCase("pt-BR");

  if (/portugu[eê]s|l[ií]ngua portuguesa/.test(lower)) return { label: "Língua Portuguesa", generic: "Língua Portuguesa", kind: "priority" };
  if (/matem[aá]tica/.test(lower)) return { label: "Matemática", generic: "Matemática", kind: "priority" };
  if (/atualidades|conhecimentos gerais/.test(lower)) return { label: "Atualidades", generic: "Atualidades", kind: "general" };
  if (/legisla/.test(lower)) return { label: titleCase(raw), generic: titleCase(raw), kind: "law" };

  if (/(?:conhecimentos?\s+)?espec[ií]fic(?:a|o)s?/.test(lower)) {
    const tail = raw.replace(/(?:conhecimentos?\s+)?espec[ií]fic(?:a|o)s?/i, "").replace(/^\s*[\/—–·-]\s*/, "");
    const parts = splitTopLevelTopic(tail);
    const firstPart = parts[0] || role || "Profissão não informada";
    const parenthetical = firstPart.match(/^(.+?)\s*\((.+)\)$/);
    const profession = titleCase(parenthetical?.[1] || firstPart || role || "Profissão não informada");
    const generic = `Conhecimentos Específicos — ${profession}`;
    const detail = [parenthetical?.[2], ...parts.slice(1)].filter(Boolean).join(" — ");
    return { label: detail ? `${generic} — ${titleCase(detail)}` : generic, generic, kind: "specific" };
  }

  const generic = titleCase(raw.split(/\s*(?:\/|—|–)\s*/)[0] || raw);
  return { label: titleCase(raw), generic, kind: "general" };
}

/** Retorna rótulos alinhados aos itens; null indica assunto fora dos filtros, mas não excluído do acervo geral. */
export function organizeSubjects<T extends SubjectReference>(items: T[]): { resolved: (string | null)[]; groups: SubjectGroup[] } {
  const candidates = items.map((item) => subjectCandidate(item.subject, item.role));
  const genericCounts = new Map<string, number>();
  const detailedCounts = new Map<string, number>();
  candidates.forEach((candidate) => {
    if (!candidate) return;
    genericCounts.set(candidate.generic, (genericCounts.get(candidate.generic) || 0) + 1);
    detailedCounts.set(candidate.label, (detailedCounts.get(candidate.label) || 0) + 1);
  });

  const resolved = candidates.map((candidate) => {
    if (!candidate) return null;
    if (candidate.kind === "priority" || candidate.kind === "law") return candidate.label;
    if (candidate.kind === "specific") return (detailedCounts.get(candidate.label) || 0) >= MINIMUM_GROUP_SIZE ? candidate.label : candidate.generic;
    return (genericCounts.get(candidate.generic) || 0) >= MINIMUM_GROUP_SIZE ? candidate.generic : null;
  });

  const groupCounts = new Map<string, number>();
  resolved.forEach((label) => { if (label) groupCounts.set(label, (groupCounts.get(label) || 0) + 1); });
  const priority = (label: string) => label === "Língua Portuguesa" ? 0 : label === "Matemática" ? 1 : 2;
  const groups = Array.from(groupCounts.entries())
    .map(([label, count]) => ({ label, count, priority: priority(label) }))
    .sort((first, second) => first.priority - second.priority || first.label.localeCompare(second.label, "pt-BR"));
  return { resolved, groups };
}

/** Aplica a mesma regra ao rótulo salvo no acervo, sem remover assuntos que ainda não atingem o corte. */
export function canonicalSubjects<T extends SubjectReference>(items: T[]) {
  const organization = organizeSubjects(items);
  return items.map((item, index) => organization.resolved[index] || item.subject.trim());
}
