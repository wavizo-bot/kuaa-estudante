/**
 * kuaa — parser do formato kuaa/ (JSON + texto).
 *
 * Suporta DOIS formatos de entrada:
 *  - "kuaa/" (novo): JSON estruturado conforme update.txt
 *  - "caderno-aprovacao/" (legado): ainda aceito para compatibilidade com pacotes antigos
 *
 * Também suporta dois modos de entrada de texto (parser facilitado):
 *  - Parser kuaa/: sintaxe concisa com `chave: valor` e separador `///` entre seções
 *  - Parser legado (Quiz:, Formulario:, Cargo: ...): mantido para retrocompatibilidade
 *
 * O parser produz sempre um ExamRecord (do AdminPreviewNew.tsx) que pode ser salvo no acervo
 * ou exportado. A função `serializeKuaaJson` faz o caminho inverso (ExamRecord -> JSON kuaa/).
 * A função `serializeKuaaText` gera o parser facilitado (para humanos lerem/editarem).
 */
import type { ExamRecord } from "@/pages/Home";

// Tipos locais (espelham os de AdminPreviewNew para evitar cross-import de tipos não exportados).
type Question = ExamRecord["questions"][number];
type Difficulty = "facil" | "media" | "dificil";
type QuestionType = "unica" | "multipla" | "discursiva";

export type KuaaKind = "prova" | "quiz" | "formulario";

/** Novo formato kuaa/ — espelha o JSON do update.txt. */
export type KuaaPackage = {
  format: "kuaa/";
  tipo: KuaaKind;
  id: string;
  origem?: "sintetica" | "pronta" | "unificada" | "manual";
  banca?: string;
  orgao?: string;
  cargo?: string;
  ano?: number | string;
  pais?: string;
  cidade?: string;
  metodologia?: "padrao" | "ponderacao_materia" | "ponderacao_dificuldade" | "tri" | "fgv" | "cebraspe";
  quantidade_alternativas?: number;
  qualidade_alternativas?: "unica" | "multipla_total" | "multipla_parcial";
  peso_materia?: string;
  peso_dificuldade?: string;
  titulo?: string;
  tematica?: string;
  anonimato?: boolean;
  questoes?: KuaaQuestion[];
  finais?: KuaaFinal[];
  perguntas?: KuaaQuizQuestion[]; // quiz
  // Dados TRI (quando metodologia = "tri")
  tri_discriminacao?: number;
  tri_dificuldade?: number;
  tri_chute?: number;
};

export type KuaaQuestion = {
  id: string;
  numeracao?: number;
  quantidade?: number;
  qualidade?: "unica" | "multipla_total" | "multipla_parcial";
  pontuacao?: number;
  pontuacao_parcial?: number | null;
  dificuldade?: Difficulty;
  tempo?: number;
  materia?: string;
  assunto?: string;
  tema?: string;
  topico?: string;
  valores_tri?: string | null;
  enunciado: string;
  texto_apoio?: string;
  imagem?: string | null;
  dica_estudo?: string;
  alternativas: KuaaAlternative[];
};

export type KuaaAlternative = {
  id: string;
  texto: string;
  correta?: boolean;
  valores?: string; // quiz: "0,1,0,3"
};

export type KuaaFinal = { id: string; titulo: string; texto: string };

export type KuaaQuizQuestion = {
  id: string;
  enunciado: string;
  alternativas: KuaaAlternative[];
};

// ---------------------------------------------------------------------------
// PARSER DE TEXTO (formato kuaa/ facilitado)
// ---------------------------------------------------------------------------

const SECTION_DIVIDER = /^\s*\/\/\/\s*$/;
const KV_REGEX = /^([a-z_]+)\s*:\s*(.*)$/i;
const ALT_REGEX = /^alternativa\s*:\s*([^|]+)\|([^|]+)\|(.+)$/i;
const DISCURSIVA_REGEX = /^discursiva\s*:\s*([^|]+)\|(\d+)\|(.*)$/i;

type TextSection = { kind: "kv" | "alternativa" | "discursiva" | "comment" | "blank"; key?: string; value?: string; raw: string };

function tokenizeKuaaText(raw: string): TextSection[] {
  const openIdx = raw.indexOf("{");
  const closeIdx = raw.lastIndexOf("}");
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) throw new Error('O texto precisa estar entre chaves "{" e "}".');
  const body = raw.slice(openIdx + 1, closeIdx);
  const out: TextSection[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) { out.push({ kind: "blank", raw: line }); continue; }
    if (SECTION_DIVIDER.test(trimmed) || trimmed.startsWith("//")) { out.push({ kind: "comment", raw: trimmed }); continue; }
    let m: RegExpMatchArray | null;
    if ((m = trimmed.match(ALT_REGEX))) {
      out.push({ kind: "alternativa", value: `${m[1].trim()}|${m[2].trim()}|${m[3].trim()}`, raw: trimmed });
      continue;
    }
    if ((m = trimmed.match(DISCURSIVA_REGEX))) {
      out.push({ kind: "discursiva", value: `${m[1].trim()}|${m[2].trim()}|${m[3].trim()}`, raw: trimmed });
      continue;
    }
    if ((m = trimmed.match(KV_REGEX))) {
      out.push({ kind: "kv", key: m[1].toLowerCase(), value: m[2], raw: trimmed });
      continue;
    }
    out.push({ kind: "kv", key: "_continuation", value: trimmed, raw: trimmed });
  }
  return out;
}

function parseDifficultyPt(value: string): Difficulty {
  const v = value.trim().toLowerCase();
  if (v === "1" || v === "facil" || v === "fácil") return "facil";
  if (v === "3" || v === "dificil" || v === "difícil") return "dificil";
  return "media";
}

function parseKuaaProvaText(raw: string, fallbackId: string): ExamRecord {
  const tokens = tokenizeKuaaText(raw);
  const exam: Record<string, string> = {};
  const questions: KuaaQuestion[] = [];
  let current: KuaaQuestion | null = null;
  let lastField: string | null = null;
  for (const tok of tokens) {
    if (tok.kind === "blank" || tok.kind === "comment") { lastField = null; continue; }
    if (tok.kind !== "kv") continue;
    const key = tok.key || "";
    const value = (tok.value || "").trim();
    if (key === "questao") {
      if (current) questions.push(current);
      current = { id: value, enunciado: "", alternativas: [] };
      lastField = null;
      continue;
    }
    if (key === "alternativa") {
      if (!current) throw new Error("alternativa sem questão anterior");
      const [id, texto, marca] = (tok.value || "").split("|").map((s) => s.trim());
      current.alternativas.push({ id, texto, correta: marca.toLowerCase() === "correta" });
      lastField = "alternativa";
      continue;
    }
    if (current && ["enunciado", "texto_apoio", "dica_estudo", "materia", "assunto", "tema", "topico"].includes(key)) {
      (current as Record<string, unknown>)[key] = value;
      lastField = key;
      continue;
    }
    if (current && key === "numeracao") { current.numeracao = Number(value) || undefined; lastField = null; continue; }
    if (current && key === "dificuldade") { current.dificuldade = parseDifficultyPt(value); lastField = null; continue; }
    if (current && key === "tempo") { current.tempo = Number(value) || undefined; lastField = null; continue; }
    if (current && key === "pontuacao") { current.pontuacao = Number(value) || undefined; lastField = null; continue; }
    if (current && key === "pontuacao_parcial") { current.pontuacao_parcial = value === "null" ? null : Number(value); lastField = null; continue; }
    if (current && key === "valores_tri") { current.valores_tri = value === "null" ? null : value; lastField = null; continue; }
    if (current && key === "_continuation" && lastField) {
      // Continuação de texto multi-linha (enunciado, texto_apoio, dica_estudo)
      (current as Record<string, unknown>)[lastField] = `${(current as Record<string, unknown>)[lastField] || ""}\n${value}`;
      continue;
    }
    if (!current) {
      exam[key] = value;
      lastField = null;
    }
  }
  if (current) questions.push(current);
  if (!questions.length) throw new Error("Nenhuma questão reconhecida no texto kuaa/.");
  return kuaaToExamRecord({ format: "kuaa/", tipo: "prova", id: exam.id || fallbackId, origem: (exam.origem as KuaaPackage["origem"]) || "manual", banca: exam.banca, orgao: exam.orgao, cargo: exam.cargo, ano: exam.ano, pais: exam.pais, cidade: exam.cidade, metodologia: exam.metodologia as KuaaPackage["metodologia"], questoes: questions });
}

function parseKuaaQuizText(raw: string, fallbackId: string): ExamRecord {
  const tokens = tokenizeKuaaText(raw);
  const top: Record<string, string> = {};
  const finais: KuaaFinal[] = [];
  const perguntas: KuaaQuizQuestion[] = [];
  let currentP: KuaaQuizQuestion | null = null;
  let lastField: string | null = null;
  let lastAlt: KuaaAlternative | null = null;
  for (const tok of tokens) {
    if (tok.kind === "blank" || tok.kind === "comment") { lastField = null; continue; }
    if (tok.kind !== "kv") continue;
    const key = tok.key || "";
    const value = (tok.value || "").trim();
    if (key === "pergunta") {
      if (currentP) perguntas.push(currentP);
      currentP = { id: value, enunciado: "", alternativas: [] };
      lastAlt = null;
      lastField = null;
      continue;
    }
    if (key === "alternativa") {
      if (!currentP) throw new Error("alternativa sem pergunta anterior");
      const parts = (tok.value || "").split("|").map((s) => s.trim());
      const id = parts[0];
      const texto = parts[1] || "";
      // Suporta "alternativa: A01 | texto | valores: 0,1,0"
      const valoresPart = parts.slice(2).join("|").replace(/^valores:\s*/i, "");
      lastAlt = { id, texto, valores: valoresPart || "" };
      currentP.alternativas.push(lastAlt);
      lastField = "alternativa";
      continue;
    }
    if (key === "valores" && lastAlt) { lastAlt.valores = value; lastField = null; continue; }
    if (key === "final") {
      const parts = (tok.value || "").split("|").map((s) => s.trim());
      const id = parts[0];
      const titulo = parts.slice(1).join("|");
      const existing = finais.find((f) => f.id === id);
      if (existing) existing.titulo = titulo;
      else finais.push({ id, titulo, texto: "" });
      lastField = "final_titulo";
      continue;
    }
    if (key === "final_texto") {
      const parts = (tok.value || "").split("|").map((s) => s.trim());
      const id = parts[0];
      const texto = parts.slice(1).join("|");
      const existing = finais.find((f) => f.id === id);
      if (existing) existing.texto = texto;
      else finais.push({ id, titulo: id, texto });
      lastField = "final_texto";
      continue;
    }
    if (currentP && key === "enunciado") { currentP.enunciado = value; lastField = "enunciado"; continue; }
    if (currentP && key === "_continuation") {
      if (lastField === "enunciado" && currentP) currentP.enunciado += "\n" + value;
      else if (lastAlt) lastAlt.texto += (lastAlt.texto ? "\n" : "") + value;
      continue;
    }
    if (!currentP) {
      top[key] = value;
      lastField = null;
    }
  }
  if (currentP) perguntas.push(currentP);
  if (!perguntas.length) throw new Error("Nenhuma pergunta reconhecida no texto kuaa/.");
  return kuaaToExamRecord({ format: "kuaa/", tipo: "quiz", id: top.id || fallbackId, titulo: top.titulo, tematica: top.tematica, finais, perguntas });
}

function parseKuaaFormText(raw: string, fallbackId: string): ExamRecord {
  const tokens = tokenizeKuaaText(raw);
  const top: Record<string, string> = {};
  const perguntas: KuaaQuizQuestion[] = [];
  const metaByPergunta: Record<string, { minimo?: number; maximo?: number }> = {};
  let currentP: KuaaQuizQuestion | null = null;
  let lastField: string | null = null;
  for (const tok of tokens) {
    if (tok.kind === "blank" || tok.kind === "comment") { lastField = null; continue; }
    if (tok.kind !== "kv" && tok.kind !== "discursiva") continue;
    const key = tok.key || "";
    const value = (tok.value || "").trim();
    if (key === "pergunta" || (tok.kind === "kv" && key === "dados")) {
      if (currentP) perguntas.push(currentP);
      const pid = tok.kind === "kv" && key === "dados" ? value : value;
      currentP = { id: pid, enunciado: "", alternativas: [] };
      metaByPergunta[pid] = {};
      lastField = null;
      continue;
    }
    if (tok.kind === "discursiva") {
      if (!currentP) throw new Error("discursiva sem pergunta anterior");
      const parts = (tok.value || "").split("|").map((s) => s.trim());
      const id = parts[0];
      const limite = Number(parts[1]) || 500;
      const placeholder = parts[2] === "(vazio)" ? "" : parts[2];
      currentP.alternativas.push({ id, texto: "", correta: false, valores: `discursiva|${limite}|${placeholder}` });
      lastField = null;
      continue;
    }
    if (key === "alternativa") {
      if (!currentP) throw new Error("alternativa sem pergunta anterior");
      const parts = (tok.value || "").split("|").map((s) => s.trim());
      currentP.alternativas.push({ id: parts[0], texto: parts[1] || "", correta: false });
      lastField = "alternativa";
      continue;
    }
    if (currentP && key === "enunciado") { currentP.enunciado = value; lastField = "enunciado"; continue; }
    if (currentP && key === "minimo") { metaByPergunta[currentP.id].minimo = Number(value) || 0; lastField = null; continue; }
    if (currentP && key === "maximo") { metaByPergunta[currentP.id].maximo = Number(value) || 0; lastField = null; continue; }
    if (currentP && key === "_continuation" && lastField === "enunciado") { currentP.enunciado += "\n" + value; continue; }
    if (!currentP) { top[key] = value; lastField = null; }
  }
  if (currentP) perguntas.push(currentP);
  if (!perguntas.length) throw new Error("Nenhuma pergunta reconhecida no texto kuaa/.");
  // Converte para ExamRecord com campos minSelect/maxSelect
  const base = kuaaToExamRecord({ format: "kuaa/", tipo: "formulario", id: top.id || fallbackId, titulo: top.titulo, anonimato: top.anonimato === "permitido" || top.anonimato === "true", perguntas });
  // Ajusta minSelect/maxSelect
  base.questions.forEach((q) => {
    const meta = metaByPergunta[q.originalNumber || ""];
    if (meta) {
      q.minSelect = meta.minimo;
      q.maxSelect = meta.maximo;
    }
  });
  return base;
}

// ---------------------------------------------------------------------------
// PARSER DE JSON (formato kuaa/)
// ---------------------------------------------------------------------------

function parseKuaaJson(raw: Record<string, unknown>, fallbackId: string): ExamRecord {
  const tipo = (raw.tipo === "quiz" || raw.tipo === "formulario" ? raw.tipo : "prova") as KuaaKind;
  const pkg: KuaaPackage = {
    format: "kuaa/",
    tipo,
    id: String(raw.id || fallbackId),
    origem: (raw.origem as KuaaPackage["origem"]) || "manual",
    banca: raw.banca ? String(raw.banca) : undefined,
    orgao: raw.orgao ? String(raw.orgao) : undefined,
    cargo: raw.cargo ? String(raw.cargo) : undefined,
    ano: raw.ano as number | string | undefined,
    pais: raw.pais ? String(raw.pais) : undefined,
    cidade: raw.cidade ? String(raw.cidade) : undefined,
    metodologia: raw.metodologia as KuaaPackage["metodologia"],
    titulo: raw.titulo ? String(raw.titulo) : undefined,
    tematica: raw.tematica ? String(raw.tematica) : undefined,
    anonimato: typeof raw.anonimato === "boolean" ? raw.anonimato : undefined,
  };
  if (tipo === "prova" && Array.isArray(raw.questoes)) {
    pkg.questoes = (raw.questoes as Record<string, unknown>[]).map((q) => parseKuaaQuestion(q));
  } else if (tipo === "quiz") {
    if (Array.isArray(raw.finais)) pkg.finais = (raw.finais as Record<string, unknown>[]).map((f) => ({ id: String(f.id || ""), titulo: String(f.titulo || ""), texto: String(f.texto || "") }));
    if (Array.isArray(raw.perguntas)) pkg.perguntas = (raw.perguntas as Record<string, unknown>[]).map((p) => ({ id: String(p.id || ""), enunciado: String(p.enunciado || ""), alternativas: Array.isArray(p.alternativas) ? (p.alternativas as Record<string, unknown>[]).map((a) => ({ id: String(a.id || ""), texto: String(a.texto || ""), valores: typeof a.valores === "string" ? a.valores : undefined })) : [] }));
  } else if (tipo === "formulario" && Array.isArray(raw.perguntas)) {
    pkg.perguntas = (raw.perguntas as Record<string, unknown>[]).map((p) => ({
      id: String(p.id || ""),
      enunciado: String(p.enunciado || ""),
      alternativas: Array.isArray(p.alternativas) ? (p.alternativas as Record<string, unknown>[]).map((a) => ({
        id: String(a.id || ""),
        texto: String(a.texto || ""),
        correta: false,
        valores: a.tipo === "discursiva" ? `discursiva|${Number(a.limite) || 500}|${String(a.placeholder || "")}` : undefined,
      })) : [],
    }));
  }
  return kuaaToExamRecord(pkg);
}

function parseKuaaQuestion(raw: Record<string, unknown>): KuaaQuestion {
  return {
    id: String(raw.id || ""),
    numeracao: typeof raw.numeracao === "number" ? raw.numeracao : undefined,
    dificuldade: ["facil", "media", "dificil"].includes(String(raw.dificuldade)) ? (raw.dificuldade as Difficulty) : undefined,
    tempo: typeof raw.tempo === "number" ? raw.tempo : undefined,
    materia: typeof raw.materia === "string" ? raw.materia : undefined,
    assunto: typeof raw.assunto === "string" ? raw.assunto : undefined,
    tema: typeof raw.tema === "string" ? raw.tema : undefined,
    topico: typeof raw.topico === "string" ? raw.topico : undefined,
    valores_tri: typeof raw.valores_tri === "string" ? raw.valores_tri : null,
    enunciado: String(raw.enunciado || ""),
    texto_apoio: typeof raw.texto_apoio === "string" ? raw.texto_apoio : undefined,
    dica_estudo: typeof raw.dica_estudo === "string" ? raw.dica_estudo : undefined,
    pontuacao: typeof raw.pontuacao === "number" ? raw.pontuacao : undefined,
    pontuacao_parcial: raw.pontuacao_parcial === null || raw.pontuacao_parcial === undefined ? null : Number(raw.pontuacao_parcial),
    alternativas: Array.isArray(raw.alternativas) ? (raw.alternativas as Record<string, unknown>[]).map((a) => ({ id: String(a.id || ""), texto: String(a.texto || ""), correta: Boolean(a.correta) })) : [],
  };
}

// ---------------------------------------------------------------------------
// CONVERSÃO KUAA -> ExamRecord
// ---------------------------------------------------------------------------

function kuaaToExamRecord(pkg: KuaaPackage): ExamRecord {
  const kind = (pkg.tipo === "quiz" || pkg.tipo === "formulario" ? pkg.tipo : "prova") as "prova" | "quiz" | "formulario";
  if (kind === "prova") {
    const questions: Question[] = (pkg.questoes || []).map((q, idx) => {
      const correctIds = q.alternativas.filter((a) => a.correta).map((a) => a.id);
      const type: QuestionType = correctIds.length > 1 ? "multipla" : "unica";
      return {
        id: idx + 1,
        originalNumber: String(q.numeracao || idx + 1),
        label: `Questão ${q.numeracao || idx + 1}`,
        text: q.enunciado,
        alternatives: q.alternativas.map((a) => ({ id: a.id, text: a.texto })),
        correct: correctIds.join(""),
        subject: q.materia || q.assunto || "",
        baseText: q.texto_apoio || undefined,
        difficulty: q.dificuldade,
        type,
        points: q.pontuacao,
        estimatedMinutes: q.tempo,
        visualStatus: "not_needed",
      };
    });
    // O "id" do formato kuaa/ (ex: "quiz_identidade_estilo_pessoal_2026") torna-se o "title" visível.
    const title = pkg.id || pkg.cargo || pkg.banca || "Prova importada";
    return {
      id: pkg.id,
      title,
      city: pkg.cidade || "",
      state: pkg.pais || "",
      year: String(pkg.ano || ""),
      board: pkg.banca || "",
      booklet: pkg.origem ? `Origem: ${pkg.origem}` : "",
      role: pkg.cargo || title,
      status: "Revisão pendente",
      questions,
      updatedAt: new Date().toISOString(),
      kind,
    };
  }
  if (kind === "quiz") {
    const finais = (pkg.finais || []).map((f) => ({ id: f.id, titulo: f.titulo, texto: f.texto }));
    const questions: Question[] = (pkg.perguntas || []).map((p, idx) => ({
      id: idx + 1,
      originalNumber: p.id,
      label: `Pergunta ${p.id}`,
      text: p.enunciado,
      alternatives: p.alternativas.map((a) => ({
        id: a.id,
        text: a.texto,
        pontos: a.valores ? parseValoresToPontos(a.valores, finais) : {},
      })),
      correct: "",
      subject: "",
      type: "unica",
    }));
    const title = pkg.titulo || "Quiz";
    return {
      id: pkg.id,
      title,
      city: "",
      state: "",
      year: "",
      board: "",
      booklet: pkg.tematica || "",
      role: title,
      status: "Revisão pendente",
      questions,
      updatedAt: new Date().toISOString(),
      kind: "quiz",
      quizFinais: finais,
      quizDesempate: 1,
    };
  }
  // formulario
  const questions: Question[] = (pkg.perguntas || []).map((p, idx) => {
    const alts = p.alternativas.map((a) => {
      if (a.valores && a.valores.startsWith("discursiva|")) {
        const [, limite, placeholder] = a.valores.split("|");
        return { id: a.id, text: "", kind: "discursiva" as const, maxLength: Number(limite) || 500, placeholder: placeholder || undefined };
      }
      return { id: a.id, text: a.texto };
    });
    return {
      id: idx + 1,
      originalNumber: p.id,
      label: `Dados ${p.id}`,
      text: p.enunciado,
      alternatives: alts,
      correct: "",
      subject: "",
      type: "multipla",
      minSelect: 0,
      maxSelect: 0,
    };
  });
  const title = pkg.titulo || "Formulário";
  return {
    id: pkg.id,
    title,
    city: "",
    state: "",
    year: "",
    board: "",
    booklet: "",
    role: title,
    status: "Revisão pendente",
    questions,
    updatedAt: new Date().toISOString(),
    kind: "formulario",
    formAnonimo: pkg.anonimato,
  };
}

function parseValoresToPontos(valores: string, finais: KuaaFinal[]): Record<string, number> {
  const parts = valores.split(",").map((s) => Number(s.trim()) || 0);
  const out: Record<string, number> = {};
  parts.forEach((v, idx) => {
    // Armazena TODOS os valores (inclusive 0) para que a serialização funcione corretamente.
    if (idx < finais.length) out[finais[idx].id] = v;
  });
  return out;
}

// ---------------------------------------------------------------------------
// SERIALIZE ExamRecord -> kuaa/ (JSON + texto)
// ---------------------------------------------------------------------------

export function serializeKuaaJson(exam: ExamRecord): KuaaPackage {
  if (exam.kind === "quiz") {
    return {
      format: "kuaa/",
      tipo: "quiz",
      id: exam.id,
      titulo: exam.title,
      tematica: exam.booklet || "Diversos",
      finais: (exam.quizFinais || []).map((f) => ({ id: f.id, titulo: f.titulo, texto: f.texto })),
      perguntas: exam.questions.map((q, idx) => ({
        id: q.originalNumber || `P${String(idx + 1).padStart(2, "0")}`,
        enunciado: q.text,
        alternativas: q.alternatives.map((a) => ({
          id: a.id,
          texto: a.text,
          valores: (exam.quizFinais || []).map((f) => String(a.pontos?.[f.id] || 0)).join(","),
        })),
      })),
    };
  }
  if (exam.kind === "formulario") {
    return {
      format: "kuaa/",
      tipo: "formulario",
      id: exam.id,
      titulo: exam.title,
      anonimato: exam.formAnonimo ?? true,
      perguntas: exam.questions.map((q, idx) => ({
        id: q.originalNumber || `dados${String(idx + 1).padStart(2, "0")}`,
        enunciado: q.text,
        alternativas: q.alternatives.map((a) => {
          if (a.kind === "discursiva") return { id: a.id, texto: "", correta: false, valores: `discursiva|${a.maxLength || 500}|${a.placeholder || ""}` };
          return { id: a.id, texto: a.text, correta: false };
        }),
      })),
    };
  }
  // prova
  return {
    format: "kuaa/",
    tipo: "prova",
    id: exam.id,
    origem: exam.booklet?.startsWith("Origem: ") ? (exam.booklet.slice(8) as KuaaPackage["origem"]) : "manual",
    banca: exam.board,
    orgao: undefined,
    cargo: exam.role,
    ano: Number(exam.year) || exam.year,
    pais: exam.state,
    cidade: exam.city,
    metodologia: "padrao",
    questoes: exam.questions.map((q, idx) => ({
      id: `${exam.id}Q${String(idx + 1).padStart(3, "0")}`,
      numeracao: idx + 1,
      dificuldade: q.difficulty,
      tempo: q.estimatedMinutes,
      materia: q.subject,
      enunciado: q.text,
      texto_apoio: q.baseText || "",
      dica_estudo: undefined,
      alternativas: q.alternatives.map((a, aIdx) => ({
        id: `A${String(aIdx + 1).padStart(2, "0")}`,
        texto: a.text,
        correta: q.correct.includes(a.id),
      })),
    })),
  };
}

export function serializeKuaaText(exam: ExamRecord): string {
  const pkg = serializeKuaaJson(exam);
  const lines: string[] = ["{"];
  if (pkg.tipo === "prova") {
    lines.push(`format: kuaa/`);
    lines.push(`tipo: prova`);
    lines.push(`id: ${pkg.id}`);
    if (pkg.origem) lines.push(`origem: ${pkg.origem}`);
    if (pkg.banca) lines.push(`banca: ${pkg.banca}`);
    if (pkg.cargo) lines.push(`cargo: ${pkg.cargo}`);
    if (pkg.cidade) lines.push(`cidade: ${pkg.cidade}`);
    if (pkg.pais) lines.push(`pais: ${pkg.pais}`);
    if (pkg.ano) lines.push(`ano: ${pkg.ano}`);
    if (pkg.metodologia) lines.push(`metodologia: ${pkg.metodologia}`);
    for (const q of pkg.questoes || []) {
      lines.push("");
      lines.push("///");
      lines.push(`questao: ${q.id}`);
      if (q.numeracao) lines.push(`numeracao: ${q.numeracao}`);
      if (q.dificuldade) lines.push(`dificuldade: ${q.dificuldade}`);
      if (q.tempo) lines.push(`tempo: ${q.tempo}`);
      if (q.materia) lines.push(`materia: ${q.materia}`);
      if (q.assunto) lines.push(`assunto: ${q.assunto}`);
      if (q.tema) lines.push(`tema: ${q.tema}`);
      if (q.topico) lines.push(`topico: ${q.topico}`);
      if (q.valores_tri) lines.push(`valores_tri: ${q.valores_tri}`);
      if (q.enunciado) lines.push(`enunciado: ${q.enunciado}`);
      if (q.texto_apoio) lines.push(`texto_apoio: ${q.texto_apoio}`);
      if (q.dica_estudo) lines.push(`dica_estudo: ${q.dica_estudo}`);
      for (const a of q.alternativas) {
        lines.push(`alternativa: ${a.id} | ${a.texto} | ${a.correta ? "correta" : "errada"}`);
      }
    }
  } else if (pkg.tipo === "quiz") {
    lines.push(`format: kuaa/`);
    lines.push(`tipo: quiz`);
    lines.push(`id: ${pkg.id}`);
    lines.push(`titulo: ${pkg.titulo || ""}`);
    if (pkg.tematica) lines.push(`tematica: ${pkg.tematica}`);
    lines.push("");
    lines.push("///");
    lines.push("// FINAIS");
    for (const f of pkg.finais || []) {
      lines.push(`final: ${f.id} | ${f.titulo}`);
      lines.push(`final_texto: ${f.id} | ${f.texto}`);
    }
    lines.push("");
    lines.push("///");
    lines.push("// PERGUNTAS");
    for (const p of pkg.perguntas || []) {
      lines.push(`pergunta: ${p.id}`);
      lines.push(`enunciado: ${p.enunciado}`);
      for (const a of p.alternativas) {
        lines.push(`alternativa: ${a.id} | ${a.texto} | valores: ${a.valores || ""}`);
      }
    }
  } else {
    // formulario
    lines.push(`format: kuaa/`);
    lines.push(`tipo: formulario`);
    lines.push(`id: ${pkg.id}`);
    lines.push(`titulo: ${pkg.titulo || ""}`);
    lines.push(`anonimato: ${pkg.anonimato ? "permitido" : "negado"}`);
    for (const p of pkg.perguntas || []) {
      lines.push("");
      lines.push("///");
      lines.push(`pergunta: ${p.id}`);
      lines.push(`enunciado: ${p.enunciado}`);
      for (const a of p.alternativas) {
        if (a.valores && a.valores.startsWith("discursiva|")) {
          const [, limite, placeholder] = a.valores.split("|");
          lines.push(`discursiva: ${a.id} | ${limite} | ${placeholder || "(vazio)"}`);
        } else {
          lines.push(`alternativa: ${a.id} | ${a.texto}`);
        }
      }
    }
  }
  lines.push("}");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// PONTO DE ENTRADA: detecta o formato e despacha
// ---------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; exam: ExamRecord }
  | { ok: false; error: string };

export function parseKuaaText(raw: string, fallbackId: string): ExamRecord {
  // Detecta tipo pelo cabeçalho
  const isJson = /^\s*\{[\s\S]*"format"\s*:\s*"kuaa\/"/i.test(raw);
  if (isJson) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      return parseKuaaJson(obj, fallbackId);
    } catch (e) {
      throw new Error(`JSON kuaa/ inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Parser de texto
  const isProva = /^\s*format\s*:\s*kuaa\/\s*\n\s*tipo\s*:\s*prova/im.test(raw) || /questao\s*:/im.test(raw);
  const isQuiz = /tipo\s*:\s*quiz/im.test(raw) || /pergunta\s*:/im.test(raw);
  const isForm = /tipo\s*:\s*formulario/im.test(raw) || /dados\d+\s*:/im.test(raw);
  if (isQuiz && !isProva) return parseKuaaQuizText(raw, fallbackId);
  if (isForm && !isProva) return parseKuaaFormText(raw, fallbackId);
  return parseKuaaProvaText(raw, fallbackId);
}

/** Gera um ID kuaa/ a partir do prefixo (P/D/Q/F) + data/hora atual. */
export function generateKuaaId(prefix: "P" | "Q" | "F"): string {
  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${prefix}D${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}H${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
