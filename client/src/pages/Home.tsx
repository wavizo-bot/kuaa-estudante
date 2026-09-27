/**
 * kuaa — revisão editorial de provas, papel marfim, azul-tinta e verde marca-texto.
 * A prévia mantém dados no navegador e demonstra fluxo assistido, sem expor chaves de serviços de IA.
 */
import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Clock3,
  Clock,
  FileCheck2,
  FileInput,
  FileJson,
  FileKey2,
  FileText,
  GraduationCap,
  ImagePlus,
  LayoutDashboard,
  Play,
  RotateCcw,
  Sparkles,
  Settings2,
  HelpCircle,
  Tags,
  Trash2,
  X,
} from "lucide-react";

// ---- Armazenamento grande (IndexedDB) ----
// O app é um PWA: localStorage tem um teto baixo (poucos MB) e some rápido quando há muitas provas
// com imagem, pacotes de som e temas com fundo. Esses três guardam os dados grandes no IndexedDB
// (limite muito maior) e mantêm só um resíduo pequeno no localStorage enquanto a migração acontece.
const IDB_NAME = "kuaa-store";
const IDB_STORE_NAME = "kv";
let idbOpenPromise: Promise<IDBDatabase> | null = null;
function openIdb(): Promise<IDBDatabase> {
  if (!idbOpenPromise) {
    idbOpenPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB indisponível neste ambiente")); return; }
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(IDB_STORE_NAME); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return idbOpenPromise;
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openIdb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const request = tx.objectStore(IDB_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  } catch { return undefined; }
}
async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { organizeSubjects } from "@/lib/subjectTaxonomy";
import { inferExamRole, isUnresolvedRole } from "@/lib/examMetadata";
import { type ActivationGrant, createActivationCode, createActivationGrant, fetchOnlineUtcTime, isActivationGrantValid, isStudentActivationRequired, monthsForActivationPassword, normalizeActivationValue, STUDENT_ACTIVATION_STORAGE_KEY } from "@/lib/activation";
import { calcularPontuacaoAdaptativa, pesoBase, type QuestaoRespondida } from "@/lib/triAdaptativa";
import { loadPerformanceHistory, savePerformanceRecord, clearPerformanceHistory, lastNProvas, countProvasByMonth, bestAndWorstSubjects, lastQuizResults, type PerformanceRecord } from "@/lib/performanceHistory";

type View = "admin" | "student";
type StudentScreen = "library" | "exam" | "exam-closed" | "summary" | "quick-setup" | "quick" | "settings" | "quiz" | "quiz-setup" | "quiz-result-detail" | "formulario" | "form-stats" | "prova-filters";
type Answer = string;
type StudentTheme = "caderno" | "paisagem" | "noite";
type StudentPalette = "papel" | "escola" | "ardosia" | "lago" | "terracota" | "bosque" | "grafite" | "ameixa" | "ambar";
type CustomThemePalette = { id: string; nome: string; cores: { fundo: string; superficie: string; texto: string; textoSuave: string; linha: string; destaque: string; textoDestaque: string; fundoSuave: string } };
type CustomTheme = { id: string; nome: string; backgroundImage?: string; palettes: CustomThemePalette[] };
const STUDENT_EXAM_PAGE_SIZE = 5;
const SYNTHETIC_STUDENT_BATCH_SIZE = 50;

function isSyntheticStudyExam(exam: ExamRecord) {
  return Boolean(exam.booklet?.startsWith("Banco sintético")) || (exam.title === "Estudo para concurso" && exam.role === "Estudante") || (exam.title === "Estudo para concursos" && exam.role === "Banco de questões geradas por IA");
}

const STUDENT_THEMES: Record<StudentTheme, { label: string; palettes: { id: StudentPalette; label: string }[] }> = {
  caderno: { label: "Caderno", palettes: [{ id: "papel", label: "Papel" }, { id: "escola", label: "Escola" }, { id: "ardosia", label: "Ardósia" }] },
  paisagem: { label: "Atlas", palettes: [{ id: "lago", label: "Lago" }, { id: "terracota", label: "Terracota" }, { id: "bosque", label: "Bosque" }] },
  noite: { label: "Vigília", palettes: [{ id: "grafite", label: "Grafite" }, { id: "ameixa", label: "Ameixa" }, { id: "ambar", label: "Âmbar" }] },
};

const isStudentTheme = (value: string | null): value is StudentTheme => value === "caderno" || value === "paisagem" || value === "noite";
const isStudentPalette = (value: string | null): value is StudentPalette => Boolean(value && Object.values(STUDENT_THEMES).some((theme) => theme.palettes.some((palette) => palette.id === value)));

export type ExamRecord = {
  id: string;
  title: string;
  city: string;
  state: string;
  year: string;
  board?: string;
  booklet?: string;
  role: string;
  status: string;
  questions: Question[];
  updatedAt: string;
  pointsByDifficulty?: Record<Difficulty, number>;
  ungraded?: boolean;
  kind?: "prova" | "quiz" | "formulario";
  quizFinais?: { id: string; titulo: string; texto: string }[];
  quizDesempate?: 1 | 2;
  formAnonimo?: boolean;
};

type Difficulty = "facil" | "media" | "dificil";
const DEFAULT_POINTS_BY_DIFFICULTY: Record<Difficulty, number> = { facil: 1, media: 1, dificil: 1 };
const DIFFICULTY_LABELS: Record<Difficulty, string> = { facil: "Fácil", media: "Média", dificil: "Difícil" };

const FAQ_ENTRIES: { pergunta: string; resposta: string }[] = [
  { pergunta: "Como funcionam as Questões Rápidas?", resposta: "Elas priorizam as questões que você já errou antes, sem depender de texto de apoio. É a forma mais rápida de revisar entre uma tarefa e outra." },
  { pergunta: "Preciso de internet para usar o app?", resposta: "Não. Depois que uma prova é importada, tudo funciona 100% offline neste aparelho." },
  { pergunta: "O que acontece quando eu excluo as provas?", resposta: "Só o banco de questões é apagado. Suas estatísticas, histórico de acertos/erros e o recorde de sequência perfeita continuam guardados." },
  { pergunta: "Como funcionam as Medalhas?", resposta: "Cada categoria (Maratona, Combinação, Hábito, Simulado) tem 3 níveis, avaliados dentro do mês. Toque numa medalha na tela inicial para ver os detalhes e o progresso atual." },
  { pergunta: "O que é a Sequência Perfeita?", resposta: "É a contagem de acertos seguidos na Questão Rápida. A cada 5 acertos em fileira, um banner comemorativo aparece (isso pode ser ajustado em Configurações)." },
  { pergunta: "Posso mudar as cores e o som do app?", resposta: "Sim, em Configurações você encontra temas, paletas, vibração e pacotes de som personalizados." },
  { pergunta: "Qual a diferença entre Prova, Quiz e Formulário?", resposta: "Prova tem gabarito e pontuação. Quiz de personalidade te leva a um resultado com base nas suas respostas, sem certo ou errado. Formulário coleta respostas para pesquisas, sem gabarito." },
];

type Question = {
  id: number;
  originalNumber?: string;
  label: string;
  text: string;
  alternatives: { id: string; text: string; kind?: "discursiva"; maxLength?: number; placeholder?: string; pontos?: Record<string, number> }[];
  correct: Answer;
  subject: string;
  baseText?: string;
  imageRequired?: boolean;
  imageUrl?: string;
  imageName?: string;
  visualStatus?: "pending" | "needed" | "not_needed";
  visualNotes?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  expectedAnswer?: string;
  points?: number;
  estimatedMinutes?: number;
  minSelect?: number;
  maxSelect?: number;
};
type QuestionType = "unica" | "multipla" | "discursiva";

type QuickQuestion = Question & {
  sourceExam: {
    id: string;
    title: string;
    role: string;
    city: string;
    state: string;
    year: string;
    board?: string;
    questionKey: string;
  };
};

type AttemptRecord = {
  id: string;
  examId: string;
  score: number;
  durationSeconds: number;
  completedAt: string;
  subjectDurations: Record<string, number[]>;
  questionResults?: AttemptQuestionResult[];
  subjectSummary?: Record<string, AttemptSubjectSummary>;
  scores?: ScoreVariants;
  quizResultIds?: string[];
  quizAffinity?: number;
  quizSecondPlaceId?: string;
  quizSecondPlacePct?: number;
  // Campos TRI adaptativa (update3.txt §DESISTIR DO CAMPO TRI) — disponíveis no resumo
  triSimplificada?: number;       // 0-1000 (1000 = 100% de acerto)
  triPercentual?: number;          // 0-100
  triDetalhes?: Array<{ id: string | number; materia: string; pontuacaoBase: number; pontuacaoObtida: number; pontuacaoFinal: number; penalidade: number; motivo: string }>;
};

// Uma resposta registrada de Formulário: sempre um respondente por vez, no mesmo aparelho.
type FormResponse = { id: string; respondent: string; completedAt: string; choices: Record<number, string>; texts: Record<string, string> };

type ScoreVariants = {
  percentual: number;
  simples: number;
  simplesMax: number;
  tri: number;
  triMax: number;
  certoErrado: number;
};

type AttemptQuestionResult = {
  questionId: number;
  originalNumber: string;
  subject: string;
  status: "correct" | "wrong" | "blank" | "ungraded";
  durationSeconds: number;
};

type AttemptSubjectSummary = {
  correct: number;
  wrong: number;
  blank: number;
  score: number;
  averageDurationSeconds: number | null;
};

type QuickEvent = {
  id: string;
  questionId: string;
  subject: string;
  correct: boolean;
  answeredAt: string;
};

const INITIAL_QUESTIONS: Question[] = [
  {
    id: 1,
    originalNumber: "01",
    label: "Questão 01",
    subject: "Português",
    text: "Considerando as informações apresentadas no texto-base da prova, assinale a alternativa que expressa corretamente a relação entre as regras constitutivas e as regras imperativas.",
    alternatives: [
      { id: "A", text: "As regras constitutivas organizam ações e as imperativas determinam condutas obrigatórias." },
      { id: "B", text: "As regras imperativas são apenas sugestões, sem efeito sobre a conduta social." },
      { id: "C", text: "As duas categorias possuem significado idêntico no texto." },
      { id: "D", text: "As regras constitutivas são sempre dispensáveis em ambientes públicos." },
    ],
    correct: "A",
    baseText: "Leia o texto-base abaixo para responder às questões 01 e 02. As regras sociais organizam a convivência e atribuem significado a determinadas práticas coletivas.",
    visualStatus: "not_needed",
  },
  {
    id: 2,
    originalNumber: "02",
    label: "Questão 02",
    subject: "Raciocínio lógico",
    text: "Em uma sequência de atendimento, quatro fichas são organizadas de acordo com uma regra. Se a primeira e a terceira posições já estão ocupadas, qual alternativa respeita a condição indicada?",
    alternatives: [
      { id: "A", text: "A ficha B ocupa a segunda posição e a ficha D ocupa a quarta." },
      { id: "B", text: "A ficha C ocupa simultaneamente a segunda e a quarta posições." },
      { id: "C", text: "A ficha A pode ser repetida nas duas posições restantes." },
      { id: "D", text: "A ordem das posições deixa de ter relevância para a regra." },
    ],
    correct: "A",
    baseText: "Leia o texto-base abaixo para responder às questões 01 e 02. As regras sociais organizam a convivência e atribuem significado a determinadas práticas coletivas.",
    visualStatus: "pending",
  },
  {
    id: 3,
    originalNumber: "14",
    label: "Questão 03",
    subject: "Matemática",
    imageRequired: true,
    text: "Observe o gráfico fornecido na prova e considere que a equipe precisa concluir 5 quilômetros de estrada. No primeiro dia, realizou 1.800 metros. Se pretende concluir exatamente metade do total no dia seguinte, quantos metros deverá realizar?",
    alternatives: [
      { id: "A", text: "700 metros." },
      { id: "B", text: "1.700 metros." },
      { id: "C", text: "2.500 metros." },
      { id: "D", text: "3.200 metros." },
    ],
    correct: "A",
    visualStatus: "needed",
    visualNotes: "Confirmar se o gráfico da página 4 é indispensável para a resolução.",
  },
  {
    id: 4,
    originalNumber: "27",
    label: "Questão 04",
    subject: "Específicas · Enfermeiro",
    text: "Na assistência de enfermagem, a identificação correta do paciente antes de um procedimento é uma medida prioritária de segurança porque:",
    alternatives: [
      { id: "A", text: "substitui a necessidade de registro em prontuário." },
      { id: "B", text: "reduz a possibilidade de intervenções em pessoa incorreta." },
      { id: "C", text: "dispensa a conferência da prescrição profissional." },
      { id: "D", text: "permite antecipar qualquer procedimento sem autorização." },
    ],
    correct: "B",
    visualStatus: "not_needed",
  },
];

const EXAMS = [
  { title: "Enfermeiro", city: "São Lourenço do Sul · RS", year: "2026", count: 40, score: 77.5, time: "2h 48min", state: "Gabarito oficial" },
  { title: "Enfermeiro", city: "Candelária · RS", year: "2026", count: 40, score: 70, time: "3h 12min", state: "Gabarito preliminar" },
  { title: "Enfermeiro", city: "Caxias do Sul · RS", year: "2026", count: 50, score: null, time: null, state: "Aguardando tentativa" },
];

const INITIAL_EXAM_RECORDS: ExamRecord[] = EXAMS.map((exam, index) => ({
  id: `enfermeiro-${index === 0 ? "sao-lourenco-sul" : index === 1 ? "candelaria" : "caxias-do-sul"}-2026`,
  title: `Concurso · ${exam.title}`,
  city: exam.city,
  state: index === 0 ? "RS" : "RS",
  year: exam.year,
  role: exam.title,
  status: exam.state,
  updatedAt: "2026-08-19T00:00:00.000Z",
  questions: INITIAL_QUESTIONS.map((question) => ({ ...question, id: question.id })),
}));

function examFingerprint(exam: Pick<ExamRecord, "title" | "city" | "year" | "role" | "booklet">) {
  return [exam.title, exam.city, exam.year, exam.role, exam.booklet || ""].join("|").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const PROMPT_UNICO = `Você receberá dois PDFs anexados na mesma conversa: uma PROVA objetiva e um GABARITO correspondente. Analise os dois documentos em conjunto. Primeiro, identifique qual arquivo é a prova e qual é o gabarito; depois, localize o bloco de gabarito que realmente corresponde à prova, confirmando órgão/município, UF, concurso ou edital, ano, banca, cargo, versão/caderno e quantidade de questões. Não deduza uma resposta se houver dúvida. Extraia TODAS as questões objetivas que pertencem à prova; quatro a seis é a quantidade esperada de alternativas POR QUESTÃO, não a quantidade de questões da prova.

Retorne SOMENTE um objeto JSON válido, sem Markdown, com esta estrutura: {"exam":{"organization":"","city":"","state":"","contest":"","year":"","board":"","role":"","booklet":"","questionCount":0,"sourceFiles":{"exam":"","answerKey":""}},"baseTexts":[{"id":"T1","title":"","text":"","examPage":1}],"suggestedSubjects":[""],"questions":[{"number":1,"baseTextId":"T1 ou null","subjectSuggested":"","statement":"","alternatives":[{"id":"A","text":""}],"correctAnswer":"A","answerStatus":"correct","visualStatus":"pending","imageDescription":"","examPage":1,"answerKeyPage":1,"confidence":"high","reviewNotes":""}]}. Use correctAnswer como A–F apenas quando a resposta estiver confirmada no gabarito correto; use null e answerStatus "not_found" se não localizar a resposta; use correctAnswer "ANULADA" e answerStatus "annulled" quando o gabarito usar X, anulação ou equivalente. Use baseTexts para textos, poemas, leis, tabelas ou instruções compartilhadas que apareçam antes das questões e aponte baseTextId em todas as questões relacionadas. Para cada questão, sugira um assunto curto e útil para estudo, como "Português", "Raciocínio lógico", "Matemática", "Específicas · Enfermeiro" ou "Específicas · Servidores de Jundiaí". Em visualStatus use "needed" quando a resolução depender claramente de figura, tabela, mapa, gráfico, esquema ou ilustração; use "not_needed" quando a inexistência for clara; e use "pending" quando a relação for ambígua ou a página exigir conferência humana. Preserve o texto; não invente trechos ilegíveis, alternativas, metadados ou respostas.`;

function shuffle<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function formatCompletedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

// Vibração tátil (usa a Vibration API do navegador; funciona no WebView do Android
// com a permissão android.permission.VIBRATE já adicionada no AndroidManifest.xml).
function vibrate(pattern: number | number[]) {
  try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern); } catch { /* dispositivo sem suporte, ignora silenciosamente */ }
}

// ---- Sistema de Conquistas (Medalhas) — Seção 5 do relatório do produto ----
type AchievementCategory = "maratona" | "combinacao" | "habito" | "simulado";
type AchievementLevel = "bronze" | "prata" | "ouro";
const ACHIEVEMENT_LEVELS: AchievementLevel[] = ["bronze", "prata", "ouro"];
const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = ["maratona", "combinacao", "habito", "simulado"];
const ACHIEVEMENT_META: Record<AchievementCategory, { nomeCategoria: string; metas: Record<AchievementLevel, number>; nomesPorNivel: Record<AchievementLevel, string>; descricoes: Record<AchievementLevel, string> }> = {
  maratona: { nomeCategoria: "Maratona", metas: { bronze: 250, prata: 500, ouro: 1000 }, nomesPorNivel: { bronze: "Iniciante na Maratona", prata: "Maratonista Intermediário", ouro: "Maratonista Elite" }, descricoes: {
    bronze: "Uma medalha para registrar que você respondeu ao menos 250 Questões Rápidas ⚡️ dentro de um único mês. Quantas mais você consegue?",
    prata: "Uma medalha para registrar que você respondeu ao menos 500 Questões Rápidas ⚡️ dentro de um único mês. Você está dominando o ritmo!",
    ouro: "Uma medalha para registrar que você respondeu ao menos 1000 Questões Rápidas ⚡️ dentro de um único mês. Poucos chegam aqui. Você é a exceção.",
  } },
  combinacao: { nomeCategoria: "Combinação", metas: { bronze: 25, prata: 50, ouro: 100 }, nomesPorNivel: { bronze: "Explorador", prata: "Versátil", ouro: "Mestre da Versatilidade" }, descricoes: {
    bronze: "Uma medalha para registrar que você respondeu ao menos 25 Questões Rápidas e 25 questões de prova no mesmo dia. Versatilidade é o primeiro passo!",
    prata: "Uma medalha para registrar que você respondeu ao menos 50 Questões Rápidas e 50 questões de prova no mesmo dia. Você não escolhe entre velocidade e profundidade — você domina ambas.",
    ouro: "Uma medalha para registrar que você respondeu ao menos 100 Questões Rápidas e 100 questões de prova no mesmo dia. Um dia lendário. Você escreveu seu nome na história.",
  } },
  habito: { nomeCategoria: "Hábito", metas: { bronze: 10, prata: 15, ouro: 25 }, nomesPorNivel: { bronze: "Início de Hábito", prata: "Hábito Consolidado", ouro: "Hábito Inquebrável" }, descricoes: {
    bronze: "Uma medalha para registrar que você respondeu ao menos 5 questões em 10 dias diferentes dentro de um único mês. A consistência começa aqui.",
    prata: "Uma medalha para registrar que você respondeu ao menos 5 questões em 15 dias diferentes dentro de um único mês. Você não estuda quando tem tempo — você faz tempo para estudar.",
    ouro: "Uma medalha para registrar que você respondeu ao menos 5 questões em 25 dias diferentes dentro de um único mês. Quase todos os dias. Isso não é mais hábito — é disciplina de ferro.",
  } },
  simulado: { nomeCategoria: "Simulado", metas: { bronze: 10, prata: 20, ouro: 30 }, nomesPorNivel: { bronze: "Simulador Iniciante", prata: "Simulador Experiente", ouro: "Simulador Pro" }, descricoes: {
    bronze: "Uma medalha para registrar que você completou ao menos 10 provas (com 40+ questões cada) dentro de um único mês. Cada prova é um passo mais perto da aprovação.",
    prata: "Uma medalha para registrar que você completou ao menos 20 provas (com 40+ questões cada) dentro de um único mês. Você não está apenas estudando — está se preparando para vencer.",
    ouro: "Uma medalha para registrar que você completou ao menos 30 provas (com 40+ questões cada) dentro de um único mês. Uma prova por dia. Você não está se preparando — você já está aprovado.",
  } },
};
const ACHIEVEMENT_COLORS: Record<AchievementLevel, string> = { bronze: "#B87333", prata: "#C0C0C0", ouro: "#FFD700" };
const ACHIEVEMENT_MEDAL_EMOJI: Record<AchievementLevel, string> = { bronze: "🥉", prata: "🥈", ouro: "🥇" };
const ACHIEVEMENT_IMAGE_BASE = "/medals";

type AchievementHistoryEntry = { data: string; nivel: AchievementLevel };
type AchievementState = {
  nivelMaximoHistorico: AchievementLevel | null;
  progressoMensal: number;
  historicoDatas: AchievementHistoryEntry[];
  totalConquistas: number;
  ultimoResetMensal: string;
  progressoDiario: { data: string; qrHoje: number; provasHoje: number; respondidasHoje: number };
  niveisLogadosEsteMes: AchievementLevel[];
};
type AchievementBook = Record<AchievementCategory, AchievementState>;

// Usa componentes de data LOCAIS (não UTC) — "dia do mês" precisa ser o dia no fuso do
// próprio aparelho, não o dia em UTC (que pode virar até 3h antes da meia-noite local no Brasil).
const monthKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const dayKeyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function freshAchievementState(monthKey: string, dayKey: string): AchievementState {
  return { nivelMaximoHistorico: null, progressoMensal: 0, historicoDatas: [], totalConquistas: 0, ultimoResetMensal: monthKey, progressoDiario: { data: dayKey, qrHoje: 0, provasHoje: 0, respondidasHoje: 0 }, niveisLogadosEsteMes: [] };
}

function loadAchievementBook(): AchievementBook {
  const now = new Date();
  const monthKey = monthKeyOf(now);
  const dayKey = dayKeyOf(now);
  try {
    const saved = JSON.parse(window.localStorage.getItem("kuaa-achievements") || "null") as AchievementBook | null;
    if (saved && ACHIEVEMENT_CATEGORIES.every((category) => saved[category])) return saved;
  } catch { /* dados corrompidos, recomeça do zero */ }
  return Object.fromEntries(ACHIEVEMENT_CATEGORIES.map((category) => [category, freshAchievementState(monthKey, dayKey)])) as AchievementBook;
}

function resetIfNeeded(state: AchievementState, monthKey: string, dayKey: string): AchievementState {
  let next = state;
  if (next.ultimoResetMensal !== monthKey) next = { ...next, progressoMensal: 0, niveisLogadosEsteMes: [], ultimoResetMensal: monthKey, progressoDiario: { data: dayKey, qrHoje: 0, provasHoje: 0, respondidasHoje: 0 } };
  if (next.progressoDiario.data !== dayKey) next = { ...next, progressoDiario: { data: dayKey, qrHoje: 0, provasHoje: 0, respondidasHoje: 0 } };
  return next;
}

function promoteIfCrossed(category: AchievementCategory, state: AchievementState, dayKey: string): AchievementState {
  const metas = ACHIEVEMENT_META[category].metas;
  let next = state;
  for (const level of ACHIEVEMENT_LEVELS) {
    if (next.progressoMensal >= metas[level] && !next.niveisLogadosEsteMes.includes(level)) {
      const levelOrdinal = ACHIEVEMENT_LEVELS.indexOf(level);
      const currentMaxOrdinal = next.nivelMaximoHistorico ? ACHIEVEMENT_LEVELS.indexOf(next.nivelMaximoHistorico) : -1;
      next = { ...next, niveisLogadosEsteMes: [...next.niveisLogadosEsteMes, level], historicoDatas: [...next.historicoDatas, { data: dayKey, nivel: level }].slice(-20), totalConquistas: next.totalConquistas + 1, nivelMaximoHistorico: levelOrdinal > currentMaxOrdinal ? level : next.nivelMaximoHistorico };
    }
  }
  return next;
}

// Registra uma ação do estudante (responder Questão Rápida e/ou finalizar uma prova) e atualiza
// as 4 categorias de conquistas de acordo com a Seção 5 do relatório. "examQuestions" só deve ser
// informado quando a prova tiver 40+ questões e tiver sido 100% respondida (mesma regra vale pra
// Combinação e Hábito, conforme a nota do relatório).
function recordAchievementActivity(book: AchievementBook, input: { qr?: number; examQuestions?: number; examQualifies?: boolean }): AchievementBook {
  const now = new Date();
  const monthKey = monthKeyOf(now);
  const dayKey = dayKeyOf(now);
  const next: AchievementBook = { ...book };

  let maratona = resetIfNeeded(next.maratona, monthKey, dayKey);
  if (input.qr) { maratona = { ...maratona, progressoMensal: maratona.progressoMensal + input.qr, progressoDiario: { ...maratona.progressoDiario, qrHoje: maratona.progressoDiario.qrHoje + input.qr } }; }
  next.maratona = promoteIfCrossed("maratona", maratona, dayKey);

  let combinacao = resetIfNeeded(next.combinacao, monthKey, dayKey);
  if (input.qr || input.examQuestions) {
    const qrHoje = combinacao.progressoDiario.qrHoje + (input.qr || 0);
    const provasHoje = combinacao.progressoDiario.provasHoje + (input.examQuestions || 0);
    combinacao = { ...combinacao, progressoDiario: { ...combinacao.progressoDiario, qrHoje, provasHoje }, progressoMensal: Math.max(combinacao.progressoMensal, Math.min(qrHoje, provasHoje)) };
  }
  next.combinacao = promoteIfCrossed("combinacao", combinacao, dayKey);

  let habito = resetIfNeeded(next.habito, monthKey, dayKey);
  const respondidasIncremento = (input.qr || 0) + (input.examQuestions || 0);
  if (respondidasIncremento) {
    const jaContavaHoje = habito.progressoDiario.respondidasHoje >= 5;
    const respondidasHoje = habito.progressoDiario.respondidasHoje + respondidasIncremento;
    habito = { ...habito, progressoDiario: { ...habito.progressoDiario, respondidasHoje }, progressoMensal: habito.progressoMensal + (!jaContavaHoje && respondidasHoje >= 5 ? 1 : 0) };
  }
  next.habito = promoteIfCrossed("habito", habito, dayKey);

  let simulado = resetIfNeeded(next.simulado, monthKey, dayKey);
  if (input.examQualifies) simulado = { ...simulado, progressoMensal: simulado.progressoMensal + 1 };
  next.simulado = promoteIfCrossed("simulado", simulado, dayKey);

  return next;
}

// Nível a exibir hoje para uma categoria: o maior nível já cruzado ESTE mês (colorido),
// ou, na ausência disso, o maior nível histórico em cinza (Regras 2 e 3 da Seção 5).
function displayedAchievementLevel(state: AchievementState): { nivel: AchievementLevel; colorido: boolean } | null {
  const nivelEsteMes = [...ACHIEVEMENT_LEVELS].reverse().find((level) => state.niveisLogadosEsteMes.includes(level));
  if (nivelEsteMes) return { nivel: nivelEsteMes, colorido: true };
  if (state.nivelMaximoHistorico) return { nivel: state.nivelMaximoHistorico, colorido: false };
  return null;
}

// ---- Sistema de Sequências Perfeitas — especificação completa fornecida pelo usuário ----
const STREAK_MILESTONE = 5;
type BannerSpeed = "rapido" | "normal" | "lento";
type BannerProfile = "classico" | "vibrante" | "minimalista";
const BANNER_DURATIONS: Record<BannerSpeed, { one: number; two: number }> = { rapido: { one: 1000, two: 1300 }, normal: { one: 1500, two: 2000 }, lento: { one: 2000, two: 2700 } };
const BANNER_SPEED_LABELS: Record<BannerSpeed, string> = { rapido: "Rápido", normal: "Normal", lento: "Lento" };
const BANNER_PROFILE_LABELS: Record<BannerProfile, string> = { classico: "Clássico", vibrante: "Vibrante", minimalista: "Minimalista" };
// Vibração de sequência perfeita concluída é fixa (Seção 9.1 da especificação): código Morse "VV".
// As vibrações de acerto/erro isoladas continuam configuráveis (item 4, já testado e aprovado).
const PERFECT_STREAK_VIBRATION = [60, 180, 60, 180, 60, 400, 60, 180, 60, 180, 60, 400]; // "...- ...-", repetido 2x

const STREAK_EMOJI_OPTIONS = { espera: ["🫣", "🫢", "😶", "😬"], acerto: ["😁", "🤩", "🥰", "🤗"], erro: ["🫠", "😔", "😭", "😓"] } as const;

// ---- Tabela canônica de emojis de Sequência Perfeita (update.txt, linhas 58-109) ----
// 5 slots que evoluem a cada nova sequência perfeita (contadorAtual).
//   0           -> 5x😶 (nenhuma)
//   1..5   (😊) -> substitui 😶 da esquerda pra direita
//   6..10  (😁) -> recomeça do zero (back=😶)
//   11..15 (🥰) -> idem
//   16..20 (😍) · 21..25 (🤩) · 26..30 (😎) · 31..35 (🥳) · 36..40 (👩‍🚀) · 41..45 (🚀)
//   46..49 (⭐) -> back=🚀 (continua do tier anterior)
//   50+         -> 5x⭐ (topo)
const PERFECT_STREAK_TIERS = ["😊", "😁", "🥰", "😍", "🤩", "😎", "🥳", "👩\u200D🚀", "🚀", "⭐"] as const;
const STREAK_BLANK_EMOJI = "😶";
function perfectStreakEmojis(count: number): string[] {
  if (count <= 0) return Array.from({ length: STREAK_MILESTONE }, () => STREAK_BLANK_EMOJI);
  if (count >= 50) return Array.from({ length: STREAK_MILESTONE }, () => PERFECT_STREAK_TIERS[PERFECT_STREAK_TIERS.length - 1]);
  if (count >= 46) {
    const filled = count - 45; // 46->1, 47->2, 48->3, 49->4
    return Array.from({ length: STREAK_MILESTONE }, (_, idx) => idx < filled ? "⭐" : "🚀");
  }
  const tier = Math.min(Math.floor((count - 1) / 5), PERFECT_STREAK_TIERS.length - 2); // 0..8
  const tierEmoji = PERFECT_STREAK_TIERS[tier];
  const positionInTier = (count - 1) % 5; // 0..4
  const filled = positionInTier + 1;
  return Array.from({ length: STREAK_MILESTONE }, (_, idx) => idx < filled ? tierEmoji : STREAK_BLANK_EMOJI);
}
// Frases do painel de status (update.txt, linhas 18-56).
function streakStatusPhrase(count: number): string {
  if (count <= 0) return "Você ainda não conseguiu nenhuma sequência perfeita";
  if (count === 1) return "Você já atingiu sua primeira sequência perfeita";
  if (count === 2) return "Você já atingiu sua segunda sequência perfeita";
  return `Você tem um recorde atual de ${count} sequências perfeitas`;
}
// Normaliza texto para busca fuzzy (sem acentos, sem caixa, sem espaços extras).
function normalizeSearchText(value: string): string {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
type StreakEmojiSet = { espera: string; acerto: string; erro: string };
function pickWeightedEmoji(options: readonly string[], previous?: string, twoBack?: string): string {
  const weights = options.map((option, altIndex) => (option === previous ? 0 : option === twoBack ? 20 : 40));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let roll = Math.random() * total;
  for (let index = 0; index < options.length; index++) { if (roll < weights[index]) return options[index]; roll -= weights[index]; }
  return options[options.length - 1];
}
function pickStreakEmojis(history: StreakEmojiSet[]): StreakEmojiSet {
  const previous = history[history.length - 1];
  const twoBack = history[history.length - 2];
  return { espera: pickWeightedEmoji(STREAK_EMOJI_OPTIONS.espera, previous?.espera, twoBack?.espera), acerto: pickWeightedEmoji(STREAK_EMOJI_OPTIONS.acerto, previous?.acerto, twoBack?.acerto), erro: pickWeightedEmoji(STREAK_EMOJI_OPTIONS.erro, previous?.erro, twoBack?.erro) };
}

const CORRECT_PHRASES = ["Você sabe o que está fazendo!", "Um passo mais perto do objetivo", "Ponto para você", "Acertou 🎉 acertou 🥳 acertou", "Eu sabia que você sabia 😎", "Está muito fácil?", "Mandou bem demais!", "Isso aí, continua assim!", "Resposta certa na mosca!", "Tá afiado hoje!"];
const WRONG_PHRASES = ["Quase lá, na próxima vai!", "Errou, mas aprendeu!", "Foco na próxima!", "Não foi dessa vez...", "Respira e tenta de novo!", "Essa era difícil mesmo!", "Anota aí pra não esquecer!", "Todo mundo erra, segue o jogo!", "Calma que a próxima é sua!", "Ops! Essa escapou."];
const PERFECT_STREAK_PHRASES: Record<number, string> = { 1: "1ª sequência perfeita! 🙏", 2: "2ª sequência perfeita, muito bem! 🫶", 3: "3ª sequência perfeita, ótimo! 🔥", 4: "4ª sequência perfeita, ao céus! 🚀", 5: "5ª sequência perfeita, IMPARÁVEL! ✨" };
function perfectStreakPhrase(count: number) { return PERFECT_STREAK_PHRASES[count] || `${count}ª sequência perfeita, IMPARÁVEL! ✨`; }
function randomFrom<T>(list: T[]): T { return list[Math.floor(Math.random() * list.length)]; }

type BannerData = { phrase: string; slots: ("espera" | "acerto" | "erro")[]; emojis: StreakEmojiSet; completedCount: number | null };

// Recorde de 30 dias corridos (Seção 7): reseta o contador do ciclo (não o histórico) quando o
// ciclo atual já passou de 30 dias desde que começou.
type PerfectStreakRecord = { contadorAtual: number; dataInicioCiclo: string | null; totalHistorico: number };
function todayIso() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }
function daysBetweenIso(startIso: string, endIso: string) { return Math.floor((new Date(`${endIso}T00:00:00`).getTime() - new Date(`${startIso}T00:00:00`).getTime()) / 86400000); }
function applyCycleExpiry(record: PerfectStreakRecord): PerfectStreakRecord {
  if (!record.dataInicioCiclo) return record;
  if (daysBetweenIso(record.dataInicioCiclo, todayIso()) >= 30) return { contadorAtual: 0, dataInicioCiclo: null, totalHistorico: record.totalHistorico };
  return record;
}
function loadPerfectStreakRecord(): PerfectStreakRecord {
  try { const saved = JSON.parse(window.localStorage.getItem("kuaa-perfect-streak-record") || "null"); if (saved && typeof saved.contadorAtual === "number" && typeof saved.totalHistorico === "number") return applyCycleExpiry(saved); } catch { /* dados corrompidos */ }
  return { contadorAtual: 0, dataInicioCiclo: null, totalHistorico: 0 };
}


// Resolve o(s) final(is) vencedor(es) de um Quiz de personalidade. "progressao" traz, para cada
// final, os pontos ganhos em CADA questão (0 quando a alternativa escolhida não pontuava para ele).
// Desempate 1 = vence quem chegou na pontuação máxima primeiro (ou, se dois pontuaram juntos na
// mesma questão, quem pontuou mais alto nela); Desempate 2 = mostra todos os finais empatados.
// Texto adaptativo conforme o percentual de afinidade do resultado do Quiz (Solução 2 sugerida).
function quizAffinityTierText(titulo: string, pct: number): string {
  if (pct >= 80) return `Você É ${titulo}. Sem sombra de dúvida.`;
  if (pct >= 60) return `Você é basicamente ${titulo}, com pequenos traços das outras.`;
  if (pct >= 40) return `Você tem muito de ${titulo} em você, mas também aspectos das outras.`;
  return `Você é uma mistura única, mas ${titulo} é sua faceta mais forte.`;
}

function resolveQuizWinners(finalIds: string[], progressao: Record<string, number[]>, desempate: 1 | 2): string[] {
  const totals: Record<string, number> = {};
  for (const id of finalIds) totals[id] = (progressao[id] || []).reduce((sum, value) => sum + value, 0);
  const maxScore = Math.max(...finalIds.map((id) => totals[id]), 0);
  const tied = finalIds.filter((id) => totals[id] === maxScore);
  if (tied.length <= 1 || desempate === 2) return tied;
  const firstScoringIndex: Record<string, number> = {};
  for (const id of tied) { const arr = progressao[id] || []; const index = arr.findIndex((value) => value > 0); firstScoringIndex[id] = index === -1 ? Infinity : index; }
  const minIndex = Math.min(...tied.map((id) => firstScoringIndex[id]));
  const earliest = tied.filter((id) => firstScoringIndex[id] === minIndex);
  if (earliest.length === 1) return earliest;
  let best = earliest[0];
  for (const id of earliest) { if ((progressao[id]?.[minIndex] || 0) > (progressao[best]?.[minIndex] || 0)) best = id; }
  return [best];
}

function buildSubjectSummary(results: AttemptQuestionResult[], subjectDurations: Record<string, number[]>) {
  const subjects = new Set([...results.map((item) => item.subject || "Sem matéria"), ...Object.keys(subjectDurations)]);
  return Object.fromEntries(Array.from(subjects).map((subject) => {
    const subjectResults = results.filter((item) => (item.subject || "Sem matéria") === subject);
    const correct = subjectResults.filter((item) => item.status === "correct").length;
    const wrong = subjectResults.filter((item) => item.status === "wrong").length;
    const blank = subjectResults.filter((item) => item.status === "blank").length;
    const valid = correct + wrong + blank;
    const durations = subjectDurations[subject] || [];
    return [subject, { correct, wrong, blank, score: valid ? Number(((correct / valid) * 100).toFixed(1)) : 0, averageDurationSeconds: durations.length ? Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length) : null } satisfies AttemptSubjectSummary];
  }));
}

// Calcula os quatro veredictos de uma tentativa (simples, percentual, TRI e certo-ou-errado).
// O aluno não escolhe um método: todos são calculados e exibidos juntos no resumo.
function computeScoreVariants(questions: Question[], results: AttemptQuestionResult[], pointsByDifficulty?: Record<Difficulty, number>): ScoreVariants {
  const table = { ...DEFAULT_POINTS_BY_DIFFICULTY, ...pointsByDifficulty };
  const byId = new Map(questions.map((item) => [item.id, item]));
  const pointsOf = (questionId: number) => { const found = byId.get(questionId); return typeof found?.points === "number" ? found.points : table[found?.difficulty || "media"] ?? 1; };
  const valid = results.filter((item) => item.status !== "ungraded");
  const correctCount = valid.filter((item) => item.status === "correct").length;
  const percentual = valid.length ? Number(((correctCount / valid.length) * 100).toFixed(1)) : 0;

  let simples = 0;
  let simplesMax = 0;
  let certoErrado = 0;
  for (const item of valid) {
    const points = pointsOf(item.questionId);
    simplesMax += points;
    if (item.status === "correct") { simples += points; certoErrado += points; }
    else if (item.status === "wrong") { certoErrado -= points; }
  }

  // TRI: por assunto, cada questão FÁCIL errada retira o próprio valor de uma questão
  // acertada mais valiosa do mesmo assunto (primeiro tenta uma DIFÍCIL, depois uma MÉDIA),
  // sem deixar nenhuma questão valer menos que zero.
  const subjects = new Set(valid.map((item) => item.subject || "Sem matéria"));
  let tri = 0;
  const triMax = simplesMax;
  for (const subject of subjects) {
    const subjectResults = valid.filter((item) => (item.subject || "Sem matéria") === subject);
    const remaining = new Map(subjectResults.filter((item) => item.status === "correct").map((item) => [item.questionId, pointsOf(item.questionId)]));
    const wrongFaceis = subjectResults.filter((item) => item.status === "wrong" && byId.get(item.questionId)?.difficulty === "facil");
    for (const wrongItem of wrongFaceis) {
      let penalty = pointsOf(wrongItem.questionId);
      for (const targetDifficulty of ["dificil", "media"] as Difficulty[]) {
        if (penalty <= 0) break;
        for (const item of subjectResults) {
          if (penalty <= 0) break;
          if (item.status !== "correct" || byId.get(item.questionId)?.difficulty !== targetDifficulty) continue;
          const current = remaining.get(item.questionId) ?? 0;
          const reduction = Math.min(current, penalty);
          remaining.set(item.questionId, current - reduction);
          penalty -= reduction;
        }
      }
    }
    for (const value of remaining.values()) tri += value;
  }

  return { percentual, simples, simplesMax, tri, triMax, certoErrado };
}

function requiresExternalText(question: Question) {
  if (question.baseText?.trim()) return true;
  return /(texto[-\s]?base|texto acima|texto a seguir|texto apresentado|conforme o texto|leia o texto|texto abaixo)/i.test(question.text);
}

// Botão "Atalho de conteúdo da questão" (update3.txt §ATALHO PARA BUSCAR O CONTEÚDO DE UMA QUESTÃO).
// Mostra assunto/tema/tópico (e dica de estudo ao clicar). Segundo clique copia matéria + subgrupos + dica.
// - Em PROVA: volta à visão inicial ao avançar para outra questão e voltar.
// - Em QUIZ: NÃO volta à visão inicial (permite apenas copiar).
function QuestionShortcutButton({ question, kind }: { question: Question; kind: "prova" | "quiz" }) {
  const materia = question.subject?.trim() || "";
  // Assunto/tema/tópico: o tipo Question não tem campos separados ainda, então derivamos do subject.
  // Se o subject tiver " > " ou " — " separamos os níveis; senão, consideramos só a matéria.
  const parts = materia ? materia.split(/\s*[>—–-]\s*/).map((s) => s.trim()).filter(Boolean) : [];
  const [expanded, setExpanded] = useState(false);
  // Em PROVA, resetamos ao mudar de questão (key muda).
  useEffect(() => {
    if (kind === "prova") setExpanded(false);
  }, [question.id, kind]);

  const dica = (question as Question & { dica_estudo?: string }).dica_estudo?.trim() || "";
  // Atualiza o update3.txt: se não tem subgrupos (assunto/tema/tópico) nem dica, não mostra o botão.
  if (!materia && !dica) return null;
  // Também não mostra se só tem matéria mas nenhum subgrupo e nenhuma dica (situação 3 só aparece se tiver dica).
  const hasSubgroups = parts.length > 1;
  if (!hasSubgroups && !dica) return null;

  const handleClick = async () => {
    if (!expanded && dica) {
      setExpanded(true);
      return;
    }
    // Segundo clique (ou primeiro se não tem dica): copia matéria + subgrupos + dica
    const todosParts = parts.length ? parts : [materia];
    const copyText = [...todosParts, ...(dica ? [dica] : [])].filter(Boolean).join(" + ");
    try {
      await navigator.clipboard.writeText(copyText);
      toast.success("Conteúdo copiado para a área de transferência", { description: copyText });
    } catch {
      toast.error("Não foi possível copiar", { description: "Selecione e copie o texto manualmente." });
    }
    if (kind === "quiz") setExpanded(true); // quiz mantém expandido
  };

  const displayLabel = parts.length > 1 ? parts.slice(1).join(" / ") : materia;
  return (
    <button className="question-shortcut-btn" onClick={handleClick} aria-label="Atalho de conteúdo da questão">
      {expanded && dica ? dica : displayLabel || "Ver dica de estudo"}
    </button>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  // Texto do nome do app removido da logomarca por decisão editorial (update.txt §TELA INICIAL).
  // O logo kuaa vive sozinho; medalhas compartilham a mesma linha do logo.
  void compact;
  return <div className="brand-lockup" aria-label="kuaa"><span className="brand-symbol-shell"><img src="/icons/kuaa-192.png" alt="Símbolo kuaa" className="brand-symbol" /></span></div>;
}

function readActivationGrant(): ActivationGrant | null {
  // Migração: se a key nova (kuaa-activation-v2) estiver vazia mas a key antiga
  // (foco-posse-student-activation-v2) tiver dados, copia para a nova e remove a antiga.
  try {
    const current = window.localStorage.getItem(STUDENT_ACTIVATION_STORAGE_KEY);
    if (!current) {
      const legacy = window.localStorage.getItem("foco-posse-student-activation-v2");
      if (legacy) {
        window.localStorage.setItem(STUDENT_ACTIVATION_STORAGE_KEY, legacy);
        window.localStorage.removeItem("foco-posse-student-activation-v2");
      }
    }
    // Mesma lógica para o código de ativação legado (foco-posse-student-activation-code-v1 -> kuaa-activation-code-v1).
    const codeCurrent = window.localStorage.getItem("kuaa-activation-code-v1");
    if (!codeCurrent) {
      const legacyCode = window.localStorage.getItem("foco-posse-student-activation-code-v1");
      if (legacyCode) {
        window.localStorage.setItem("kuaa-activation-code-v1", legacyCode);
        window.localStorage.removeItem("foco-posse-student-activation-code-v1");
      }
    }
  } catch { /* ignora se localStorage indisponível */ }
  try {
    const raw = JSON.parse(window.localStorage.getItem(STUDENT_ACTIVATION_STORAGE_KEY) || "null") as Partial<ActivationGrant> | null;
    if (!raw || typeof raw.expiresAt !== "string" || typeof raw.activatedAt !== "string" || typeof raw.months !== "number") return null;
    return { activatedAt: raw.activatedAt, expiresAt: raw.expiresAt, months: raw.months };
  } catch { return null; }
}

function formatActivationDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(date) : "data indisponível";
}

function StudentTimeCheck() {
  return <main className="student-activation-screen"><section className="student-activation-card student-time-check"><div className="student-activation-brand"><BrandMark /></div><p className="eyebrow">VERIFICAÇÃO DE DATA</p><h1>Preparando seu acervo.</h1><p>O aplicativo está conferindo a data para manter a ativação atualizada.</p><span className="time-check-indicator" aria-label="Verificando data" /></section></main>;
}

function StudentActivationGate({ currentGrant, now, onActivate }: { currentGrant: ActivationGrant | null; now: Date; onActivate: (grant: ActivationGrant) => void }) {
  const [code] = useState(() => {
    const stored = normalizeActivationValue(window.localStorage.getItem("kuaa-activation-code-v1") || "");
    if (stored.length === 5) return stored;
    const generated = createActivationCode();
    window.localStorage.setItem("kuaa-activation-code-v1", generated);
    return generated;
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const activate = () => {
    const months = monthsForActivationPassword(code, password);
    if (!months) {
      setError("A senha não corresponde ao código deste dispositivo.");
      return;
    }
    const grant = createActivationGrant(months, currentGrant, now);
    window.localStorage.setItem(STUDENT_ACTIVATION_STORAGE_KEY, JSON.stringify(grant));
    onActivate(grant);
  };
  return <main className="student-activation-screen"><section className="student-activation-card"><div className="student-activation-brand"><BrandMark /></div><p className="eyebrow">ATIVAÇÃO DO DISPOSITIVO</p><h1>Continue seu estudo.</h1><p>Informe este código à administração e digite abaixo a senha de ativação recebida. A senha define por quantos meses o aplicativo ficará liberado.</p><div className="activation-code"><span>CÓDIGO DE ATIVAÇÃO</span><strong>{code}</strong></div><label className="activation-password">SENHA DE ATIVAÇÃO<input value={password} onChange={(event) => { setPassword(normalizeActivationValue(event.target.value)); setError(""); }} autoCapitalize="characters" autoComplete="off" maxLength={5} placeholder="ABCDE" aria-describedby={error ? "activation-error" : undefined} /></label>{error && <p id="activation-error" className="activation-error">{error}</p>}<Button className="lime-button" disabled={password.length !== 5} onClick={activate}>Ativar aplicativo</Button><small>O código e a senha possuem cinco caracteres, usando letras maiúsculas e números de 1 a 9. Após a validade, o mesmo código pode receber uma nova senha.</small></section></main>;
}

function StatCard({ value, label, helper, accent }: { value: string; label: string; helper: string; accent?: boolean }) {
  return <Card className={`stat-card ${accent ? "stat-card-accent" : ""}`}><CardContent className="p-0"><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-helper">{helper}</p></CardContent></Card>;
}

function StudentCredit() {
  return <footer className="student-credit">Este programa é uma gentileza do agente comunitário de saúde Maico, Clínica da Família II, em Jundiaí-SP. Contato 11 978831938</footer>;
}

function StudentStats({ attempts, quickEvents }: { attempts: AttemptRecord[]; quickEvents: QuickEvent[] }) {
  const latestQuick = quickEvents.slice(-50);
  const quickAccuracy = latestQuick.length ? Math.round((latestQuick.filter((item) => item.correct).length / latestQuick.length) * 100) : null;
  const latestAttempts = attempts.slice(-10);
  const attemptAverage = latestAttempts.length ? Math.round(latestAttempts.reduce((sum, item) => sum + item.score, 0) / latestAttempts.length) : null;
  const slowestSubjects = Object.entries(latestAttempts.reduce<Record<string, number[]>>((all, item) => {
    Object.entries(item.subjectDurations || {}).forEach(([subject, durations]) => { all[subject] = [...(all[subject] || []), ...durations]; });
    return all;
  }, {})).map(([subject, durations]) => ({ subject, average: Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) })).sort((first, second) => second.average - first.average).slice(0, 3);
  return <section className="student-statistics-panel"><div><p className="eyebrow">ESTATÍSTICAS</p><h2>Resultados que já foram concluídos.</h2></div><div className="student-metrics"><StatCard value={quickAccuracy === null ? "—" : `${quickAccuracy}%`} label="QUESTÕES RÁPIDAS" helper={latestQuick.length ? `Últimas ${latestQuick.length} respostas` : "Aguardando respostas"} accent /><StatCard value={attemptAverage === null ? "—" : `${attemptAverage}%`} label="PROVAS" helper={latestAttempts.length ? `Média das últimas ${latestAttempts.length} provas` : "Aguardando prova concluída"} /><Card className="stat-card subject-time-card"><CardContent className="p-0"><p className="stat-label">TEMPOS POR ASSUNTO</p>{slowestSubjects.length ? <ol>{slowestSubjects.map((item) => <li key={item.subject}><span>{item.subject}</span><strong>{formatDuration(item.average)}</strong></li>)}</ol> : <p className="stat-helper">As três maiores médias das últimas 10 provas aparecerão aqui.</p>}</CardContent></Card></div></section>;
}

function AdminImportPanel({ onImport }: { onImport: (value: string) => void }) {
  const [value, setValue] = useState("");
  const importText = () => { if (!value.trim()) { toast.error("Cole a resposta em JSON antes de importar"); return; } onImport(value); setValue(""); };
  const readClipboard = async () => { try { const text = await navigator.clipboard.readText(); setValue(text); toast.success("Resposta lida da área de transferência"); } catch { toast.error("Não foi possível acessar a área de transferência", { description: "Cole o JSON no campo abaixo." }); } };
  return <section className="ai-response-import"><div><p className="eyebrow">RESPOSTA DA IA</p><h2>Adicione uma prova sem salvar arquivo.</h2><p>Cole o JSON retornado pela IA ou leia diretamente da área de transferência. O arquivo JSON continua disponível como alternativa.</p></div><div className="ai-response-controls"><textarea value={value} onChange={(event) => setValue(event.target.value)} placeholder="Cole aqui o JSON retornado pela IA" aria-label="Resposta JSON da IA" /><div><Button variant="outline" onClick={readClipboard}><Clipboard size={16} /> Ler área de transferência</Button><Button className="lime-button" onClick={importText}><FileJson size={16} /> Adicionar prova</Button></div></div></section>;
}



function normalizeExamPayload(raw: Record<string, unknown>, fallback = "prova-importada"): ExamRecord {
  const rawExam = (raw.exam && typeof raw.exam === "object" ? raw.exam : raw) as Record<string, unknown>;
  const baseTexts = new Map(Array.isArray(raw.baseTexts) ? raw.baseTexts.map((item) => {
    const value = item as Record<string, unknown>;
    return [String(value.id || ""), String(value.text || "")];
  }) : []);
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).map((item, index): Question => {
    const value = item as Record<string, unknown>;
    const alternatives = Array.isArray(value.alternatives) ? value.alternatives.map((option) => {
      const alternative = option as Record<string, unknown>;
      const kind = alternative.kind === "discursiva" ? "discursiva" as const : undefined;
      const pontos = alternative.pontos && typeof alternative.pontos === "object" ? alternative.pontos as Record<string, number> : undefined;
      return { id: String(alternative.id || ""), text: String(alternative.text || ""), kind, maxLength: typeof alternative.maxLength === "number" ? alternative.maxLength : undefined, placeholder: typeof alternative.placeholder === "string" ? alternative.placeholder : undefined, pontos };
    }).filter((option) => option.id && (option.text || option.kind === "discursiva")) : [];
    const answer = String(value.correctAnswer || value.correct || "");
    const visual = value.visualStatus === "needed" || value.visualStatus === "not_needed" ? value.visualStatus : "pending";
    const number = String(value.number || value.originalNumber || index + 1);
    const difficulty = ["facil", "media", "dificil"].includes(String(value.difficulty)) ? (value.difficulty as Difficulty) : undefined;
    const type = ["unica", "multipla", "discursiva"].includes(String(value.type)) ? (value.type as QuestionType) : "unica";
    // Aceita o gabarito se: for "ANULADA", for ID legado (A-F, ou AC/ABDE...), ou for ID kuaa/ (A01, A02...)
    // que corresponde a uma das alternativas da questão.
    const altIds = alternatives.map((a) => a.id);
    const isValidCorrect = answer === "ANULADA" || ["A", "B", "C", "D", "E", "F"].includes(answer) || /^[A-F]{2,}$/.test(answer) || (answer && altIds.some((aid) => aid === answer || answer.split(",").includes(aid)));
    return { id: Number(value.id) || index + 1, originalNumber: number, label: `Questão ${number}`, text: String(value.statement || value.text || ""), alternatives, correct: isValidCorrect ? answer : "", subject: String(value.subjectSuggested || value.subject || ""), baseText: String(value.baseText || baseTexts.get(String(value.baseTextId || "")) || ""), imageRequired: visual === "needed", imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined, imageName: typeof value.imageName === "string" ? value.imageName : undefined, visualStatus: visual, visualNotes: String(value.imageDescription || value.visualNotes || value.reviewNotes || ""), difficulty, type, expectedAnswer: typeof value.expectedAnswer === "string" ? value.expectedAnswer : undefined, points: typeof value.points === "number" ? value.points : undefined, estimatedMinutes: typeof value.estimatedMinutes === "number" ? value.estimatedMinutes : undefined, minSelect: typeof value.minSelect === "number" ? value.minSelect : undefined, maxSelect: typeof value.maxSelect === "number" ? value.maxSelect : undefined };
  });
  const city = String(rawExam.city || raw.city || "Município não informado");
  const title = String(rawExam.title || rawExam.organization || rawExam.contest || raw.title || "Prova importada");
  const kind = raw.kind === "quiz" || raw.kind === "formulario" ? raw.kind : "prova";
  // Quiz e Formulário não têm cargo profissional de verdade — pular inferExamRole evita bloqueios
  // por regras pensadas só para provas (ex.: títulos de quiz que contêm palavras comuns).
  const role = kind === "prova" ? inferExamRole({ role: rawExam.role || raw.role, cargo: rawExam.cargo, title, evidence: questions }) : String(rawExam.role || raw.role || title);
  const pointsByDifficulty = raw.pointsByDifficulty && typeof raw.pointsByDifficulty === "object" ? raw.pointsByDifficulty as Record<Difficulty, number> : undefined;
  const quizFinais = Array.isArray(raw.quizFinais) ? raw.quizFinais.map((item) => { const value = item as Record<string, unknown>; return { id: String(value.id || ""), titulo: String(value.titulo || ""), texto: String(value.texto || "") }; }) : undefined;
  const quizDesempate = raw.quizDesempate === 2 ? 2 : raw.quizDesempate === 1 ? 1 : undefined;
  const formAnonimo = typeof raw.formAnonimo === "boolean" ? raw.formAnonimo : undefined;
  const record = { id: String(raw.id || ""), title, city, state: String(rawExam.state || raw.state || ""), year: String(rawExam.year || raw.year || ""), board: String(rawExam.board || raw.board || ""), booklet: String(rawExam.booklet || raw.booklet || ""), role, status: String(raw.status || "Revisão pendente"), questions, updatedAt: String(raw.updatedAt || new Date().toISOString()), pointsByDifficulty, ungraded: typeof raw.ungraded === "boolean" ? raw.ungraded : undefined, kind: kind as ExamRecord["kind"], quizFinais, quizDesempate, formAnonimo };
  return { ...record, id: record.id || examFingerprint(record) || fallback };
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

function ReviewWorkspace({ exams, selectedExamId, onChange, onClose }: { exams: ExamRecord[]; selectedExamId: string; onChange: (records: ExamRecord[]) => void; onClose: () => void }) {
  const [examId, setExamId] = useState(selectedExamId || exams[0]?.id || "");
  const [questionIndex, setQuestionIndex] = useState(0);
  const exam = exams.find((item) => item.id === examId) || exams[0];
  const question = exam?.questions[questionIndex];
  useEffect(() => { setExamId(selectedExamId || exams[0]?.id || ""); setQuestionIndex(0); }, [selectedExamId, exams]);
  if (!exam || !question) return <main className="workspace review-workspace"><p>Nenhuma prova disponível para revisão.</p><Button onClick={onClose}>Voltar ao acervo</Button></main>;
  const updateQuestion = (patch: Partial<Question>) => onChange(exams.map((item) => item.id !== exam.id ? item : { ...item, updatedAt: new Date().toISOString(), questions: item.questions.map((current) => current.id === question.id ? { ...current, ...patch } : current) }));
  const attachImage = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => updateQuestion({ imageUrl: String(reader.result || ""), imageName: file.name, imageRequired: true, visualStatus: "needed" }); reader.readAsDataURL(file); };
  const reviewed = exam.questions.filter((item) => item.correct && item.subject.trim()).length;
  return <main className="workspace review-workspace"><section className="review-heading"><div><button className="back-link" onClick={onClose}><ArrowLeft size={17} /> Voltar ao acervo</button><p className="eyebrow">REVISÃO HUMANA · {exam.role}</p><h1>Revise a prova certa, no ponto exato.</h1><p>Escolha qualquer prova do acervo; todas as alterações ficam vinculadas a ela e serão levadas para o pacote do estudante.</p></div><div className="review-progress"><span>CONFERIDAS</span><strong>{reviewed}/{exam.questions.length}</strong><div><i style={{ width: `${exam.questions.length ? reviewed / exam.questions.length * 100 : 0}%` }} /></div></div></section><section className="review-exam-selector"><label>PROVA EM REVISÃO<select value={exam.id} onChange={(event) => { setExamId(event.target.value); setQuestionIndex(0); }}>{exams.map((item) => <option key={item.id} value={item.id}>{item.role} · {item.city} · {item.year}</option>)}</select></label><span>{exam.questions.length} questões · {exam.status}</span></section><section className="review-board"><aside className="review-queue"><p className="card-caption"><span>01</span> FILA ORIGINAL</p>{exam.questions.map((item, index) => <button key={item.id} className={index === questionIndex ? "is-current" : ""} onClick={() => setQuestionIndex(index)}><span>{item.originalNumber || index + 1}</span><div><strong>Questão {item.originalNumber || index + 1}</strong><small>{item.subject || "Sem matéria"} · {item.correct || "sem gabarito"}</small></div>{item.visualStatus !== "not_needed" && <ImagePlus size={14} />}</button>)}</aside><section className="review-sheet"><div className="review-sheet-top"><Badge>Prova {exam.role} · questão {question.originalNumber || questionIndex + 1}</Badge><span>{question.visualStatus === "needed" ? "Imagem necessária" : question.visualStatus === "pending" ? "Visual a conferir" : "Sem imagem obrigatória"}</span></div><h2>{question.text}</h2><div className="review-fields"><section><div className="field-title"><FileKey2 size={17} /><div><strong>Gabarito confirmado</strong><span>Selecione ou corrija manualmente.</span></div></div><div className="answer-picker">{["A", "B", "C", "D", "E", "F"].map((answer) => <button key={answer} className={question.correct === answer ? "is-selected" : ""} onClick={() => updateQuestion({ correct: answer as Answer })}>{answer}</button>)}<button className={question.correct === "ANULADA" ? "is-annulled" : ""} onClick={() => updateQuestion({ correct: "ANULADA" })}>Anulada</button><button className={!question.correct ? "is-unknown" : ""} onClick={() => updateQuestion({ correct: "" })}>Sem gabarito</button></div></section><section><div className="field-title"><Tags size={17} /><div><strong>Matéria para estudo</strong><span>Usado pelos filtros e pelo modo rápido.</span></div></div><input value={question.subject} onChange={(event) => updateQuestion({ subject: event.target.value })} placeholder="Ex.: Raciocínio lógico" /></section><section className="base-text-callout"><div><FileText size={16} /><strong>Texto-base associado</strong><span>Deixe em branco somente se esta questão não depender de texto prévio.</span></div><textarea value={question.baseText || ""} onChange={(event) => updateQuestion({ baseText: event.target.value })} /></section><section className="image-editor"><div className="field-title"><ImagePlus size={17} /><div><strong>Referência visual</strong><span>Associe uma imagem mesmo quando o enunciado não a mencionar.</span></div></div><label className={`image-dropzone ${question.imageUrl ? "has-image" : ""}`}>{question.imageUrl ? <img src={question.imageUrl} alt="Imagem vinculada à questão" /> : <><ImagePlus size={24} /><span>Selecionar imagem</span></>}<input type="file" accept="image/*" onChange={attachImage} />{question.imageName && <small>{question.imageName}</small>}</label><div className="visual-status-picker"><button className={question.visualStatus === "needed" ? "is-active" : ""} onClick={() => updateQuestion({ visualStatus: "needed", imageRequired: true })}>Precisa de imagem</button><button className={question.visualStatus === "not_needed" ? "is-active" : ""} onClick={() => updateQuestion({ visualStatus: "not_needed", imageRequired: false })}>Não precisa</button><button className={question.visualStatus === "pending" ? "is-active" : ""} onClick={() => updateQuestion({ visualStatus: "pending" })}>Conferir</button></div></section></div><footer className="review-footer"><Button variant="outline" disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => value - 1)}><ChevronLeft size={17} /> Anterior</Button><span>Alterações salvas na prova selecionada.</span><Button className="lime-button" onClick={() => { if (questionIndex < exam.questions.length - 1) setQuestionIndex((value) => value + 1); else { toast.success("Revisão concluída", { description: `${exam.role} voltou ao acervo e está pronta para exportação.` }); onClose(); } }}>{questionIndex === exam.questions.length - 1 ? "Concluir e voltar ao acervo" : "Salvar e próxima"}<ChevronRight size={17} /></Button></footer></section></section></main>;
}

function StudentPreview({ exams, selectedExamId, onChange, onSelected, attempts, onAttempt, onQuickEvent }: { exams: ExamRecord[]; selectedExamId: string; onChange: (records: ExamRecord[]) => void; onSelected: (id: string) => void; attempts: AttemptRecord[]; onAttempt: (attempt: AttemptRecord) => void; onQuickEvent: (event: QuickEvent) => void }) {
  // Migração one-shot de chaves localStorage caderno-* -> kuaa-*. Executa uma única vez
  // (marcador em kuaa-migrated) para evitar percorrer localStorage a cada render.
  // Quem já tinha dados no app antigo (Caderno de Aprovação / Foco & Posse) não perde nada.
  useEffect(() => {
    try {
      if (window.localStorage.getItem("kuaa-migrated-v1")) return;
      const legacyMap: Record<string, string> = {
        "caderno-achievements": "kuaa-achievements",
        "caderno-perfect-streak-record": "kuaa-perfect-streak-record",
        "caderno-best-score": "kuaa-best-score",
        "caderno-quick-history": "kuaa-quick-history",
        "caderno-student-palette": "kuaa-student-palette",
        "caderno-student-theme": "kuaa-student-theme",
        "caderno-vibration-enabled": "kuaa-vibration-enabled",
        "caderno-acerto-vibration": "kuaa-acerto-vibration",
        "caderno-erro-vibration": "kuaa-erro-vibration",
        "caderno-banner-enabled": "kuaa-banner-enabled",
        "caderno-banner-speed": "kuaa-banner-speed",
        "caderno-banner-profile": "kuaa-banner-profile",
        "caderno-sound-enabled": "kuaa-sound-enabled",
        "caderno-sound-pack-name": "kuaa-sound-pack-name",
        "caderno-sound-pack-files": "kuaa-sound-pack-files",
        "caderno-form-responses": "kuaa-form-responses",
        "caderno-quick-durations": "kuaa-quick-durations",
        "caderno-quick-hand-mode": "kuaa-quick-hand-mode",
        "caderno-custom-themes": "kuaa-custom-themes",
        "caderno-active-custom-theme": "kuaa-active-custom-theme",
        "caderno-active-custom-palette": "kuaa-active-custom-palette",
        "caderno-exams": "kuaa-exams",
        "caderno-attempts": "kuaa-attempts",
        "caderno-quick-events": "kuaa-quick-events",
      };
      for (const [oldKey, newKey] of Object.entries(legacyMap)) {
        const legacy = window.localStorage.getItem(oldKey);
        if (legacy !== null && window.localStorage.getItem(newKey) === null) {
          window.localStorage.setItem(newKey, legacy);
        }
        if (legacy !== null) window.localStorage.removeItem(oldKey);
      }
      window.localStorage.setItem("kuaa-migrated-v1", new Date().toISOString());
    } catch { /* ignora se localStorage indisponível */ }
  }, []);
  const [screen, setScreen] = useState<StudentScreen>("library");
  const [palette, setPalette] = useState<StudentPalette>(() => {
    const requested = new URLSearchParams(window.location.search).get("palette");
    const saved = window.localStorage.getItem("kuaa-student-palette");
    return isStudentPalette(requested) ? requested : isStudentPalette(saved) ? saved : "papel";
  });
  const [activeId, setActiveId] = useState(selectedExamId || exams[0]?.id || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [examIndex, setExamIndex] = useState(0);
  const [attemptOrder, setAttemptOrder] = useState<Record<number, string[]>>({});
  const [quickQuestion, setQuickQuestion] = useState<QuickQuestion | null>(null);
  const [quickAnswered, setQuickAnswered] = useState(false);
  const [quickRevealing, setQuickRevealing] = useState(false);
  const [quickOrder, setQuickOrder] = useState<string[]>([]);
  const [quickHistory, setQuickHistory] = useState<Record<string, { correct: number; wrong: number }>>(() => { try { return JSON.parse(window.localStorage.getItem("kuaa-quick-history") || "{}"); } catch { return {}; } });
  const [achievements, setAchievements] = useState<AchievementBook>(() => loadAchievementBook());
  useEffect(() => { window.localStorage.setItem("kuaa-achievements", JSON.stringify(achievements)); }, [achievements]);
  const registerActivity = (input: { qr?: number; examQuestions?: number; examQualifies?: boolean }) => setAchievements((current) => {
    const next = recordAchievementActivity(current, input);
    const prevTotal = ACHIEVEMENT_CATEGORIES.reduce((sum, category) => sum + current[category].totalConquistas, 0);
    const nextTotal = ACHIEVEMENT_CATEGORIES.reduce((sum, category) => sum + next[category].totalConquistas, 0);
    if (nextTotal > prevTotal) playSound("conquista");
    return next;
  });
  const [openAchievement, setOpenAchievement] = useState<AchievementCategory | null>(null);
  const [medalDrag, setMedalDrag] = useState(0);
  const [medalDragging, setMedalDragging] = useState(false);
  const medalStripRef = useRef<HTMLDivElement>(null);
  const medalStartX = useRef(0);
  const medalMaxRef = useRef(80);
  const onMedalPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { medalMaxRef.current = (medalStripRef.current?.offsetWidth || 300) * 0.2; medalStartX.current = event.clientX; setMedalDragging(true); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); };
  const onMedalPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { if (!medalDragging) return; const raw = event.clientX - medalStartX.current; const max = medalMaxRef.current; const half = max * 0.5; const abs = Math.abs(raw); const travel = Math.min(abs <= half ? abs : half + (abs - half) * 0.5, max); setMedalDrag(Math.sign(raw) * travel); };
  const onMedalPointerUp = () => { if (!medalDragging) return; setMedalDragging(false); setMedalDrag(0); };
  const [vibrationEnabled, setVibrationEnabled] = useState(() => window.localStorage.getItem("kuaa-vibration-enabled") === "1");
  useEffect(() => { window.localStorage.setItem("kuaa-vibration-enabled", vibrationEnabled ? "1" : "0"); }, [vibrationEnabled]);
  const [acertoVibrationMs, setAcertoVibrationMs] = useState<20 | 30 | 50>(() => { const saved = Number(window.localStorage.getItem("kuaa-acerto-vibration")); return saved === 20 || saved === 50 ? saved : 30; });
  useEffect(() => { window.localStorage.setItem("kuaa-acerto-vibration", String(acertoVibrationMs)); }, [acertoVibrationMs]);
  const [erroVibrationMs, setErroVibrationMs] = useState<80 | 100 | 150>(() => { const saved = Number(window.localStorage.getItem("kuaa-erro-vibration")); return saved === 80 || saved === 150 ? saved : 100; });
  useEffect(() => { window.localStorage.setItem("kuaa-erro-vibration", String(erroVibrationMs)); }, [erroVibrationMs]);
  const [bannerEnabled, setBannerEnabled] = useState(() => window.localStorage.getItem("kuaa-banner-enabled") !== "0");
  useEffect(() => { window.localStorage.setItem("kuaa-banner-enabled", bannerEnabled ? "1" : "0"); }, [bannerEnabled]);
  const [bannerSpeed, setBannerSpeed] = useState<BannerSpeed>(() => { const saved = window.localStorage.getItem("kuaa-banner-speed"); return saved === "rapido" || saved === "lento" ? saved : "normal"; });
  useEffect(() => { window.localStorage.setItem("kuaa-banner-speed", bannerSpeed); }, [bannerSpeed]);
  const [bannerProfile, setBannerProfile] = useState<BannerProfile>(() => { const saved = window.localStorage.getItem("kuaa-banner-profile"); return saved === "vibrante" || saved === "minimalista" ? saved : "classico"; });
  useEffect(() => { window.localStorage.setItem("kuaa-banner-profile", bannerProfile); }, [bannerProfile]);
  // Streak em andamento (Seção 8.1): NUNCA persiste entre sessões — sempre começa em 0 ao abrir o app.
  const [inProgressStreak, setInProgressStreak] = useState(0);
  const [streakEmojiHistory, setStreakEmojiHistory] = useState<StreakEmojiSet[]>([]);
  const [currentStreakEmojis, setCurrentStreakEmojis] = useState<StreakEmojiSet>(() => pickStreakEmojis([]));
  const [perfectStreakRecord, setPerfectStreakRecord] = useState<PerfectStreakRecord>(() => loadPerfectStreakRecord());
  useEffect(() => { window.localStorage.setItem("kuaa-perfect-streak-record", JSON.stringify(perfectStreakRecord)); }, [perfectStreakRecord]);
  const [banner, setBanner] = useState<BannerData | null>(null);
  const bannerTimeoutRef = useRef<number | null>(null);
  const dismissBanner = () => { if (bannerTimeoutRef.current) window.clearTimeout(bannerTimeoutRef.current); setBanner(null); };
  const showBanner = (data: BannerData) => {
    if (!bannerEnabled) return;
    if (bannerTimeoutRef.current) window.clearTimeout(bannerTimeoutRef.current);
    setBanner(data);
    const duration = BANNER_DURATIONS[bannerSpeed][data.completedCount ? "two" : "one"];
    bannerTimeoutRef.current = window.setTimeout(() => setBanner(null), duration);
  };
  const registerQuickAnswer = (correct: boolean) => {
    const slotsBefore = inProgressStreak;
    const slots: ("espera" | "acerto" | "erro")[] = Array.from({ length: STREAK_MILESTONE }, (_, index) => index < slotsBefore ? "acerto" : index === slotsBefore ? (correct ? "acerto" : "erro") : "espera");
    const emojisForBanner = currentStreakEmojis;
    let completedCount: number | null = null;
    if (correct) {
      const nextCount = slotsBefore + 1;
      if (nextCount >= STREAK_MILESTONE) {
        setPerfectStreakRecord((current) => {
          const base = applyCycleExpiry(current);
          const contadorAtual = base.contadorAtual + 1;
          const dataInicioCiclo = base.dataInicioCiclo || todayIso();
          completedCount = contadorAtual;
          return { contadorAtual, dataInicioCiclo, totalHistorico: base.totalHistorico + 1 };
        });
        setInProgressStreak(0);
        setStreakEmojiHistory((history) => { const next = [...history, currentStreakEmojis].slice(-2); setCurrentStreakEmojis(pickStreakEmojis(next)); return next; });
      } else {
        setInProgressStreak(nextCount);
      }
    } else {
      setInProgressStreak(0);
      setStreakEmojiHistory((history) => { const next = [...history, currentStreakEmojis].slice(-2); setCurrentStreakEmojis(pickStreakEmojis(next)); return next; });
    }
    if (completedCount) { if (vibrationEnabled) vibrate(PERFECT_STREAK_VIBRATION); playSound("sequencia"); }
    else { if (vibrationEnabled) vibrate(correct ? acertoVibrationMs : erroVibrationMs); playSound(correct ? "acerto" : "erro"); }
    const phrase = correct ? randomFrom(CORRECT_PHRASES) : randomFrom(WRONG_PHRASES);
    window.setTimeout(() => showBanner({ phrase, slots, emojis: emojisForBanner, completedCount }), 350);
  };
  const [soundEnabled, setSoundEnabled] = useState(() => window.localStorage.getItem("kuaa-sound-enabled") === "1");
  useEffect(() => { window.localStorage.setItem("kuaa-sound-enabled", soundEnabled ? "1" : "0"); }, [soundEnabled]);
  const [soundPackName, setSoundPackName] = useState(() => window.localStorage.getItem("kuaa-sound-pack-name") || "Padrão (sem sons)");
  const [soundPack, setSoundPack] = useState<Record<string, string>>(() => { try { return JSON.parse(window.localStorage.getItem("kuaa-sound-pack-files") || "{}"); } catch { return {}; } });
  const [soundPackHydratedFromIdb, setSoundPackHydratedFromIdb] = useState(false);
  useEffect(() => { let cancelled = false; idbGet<Record<string, string>>("sound-pack-files").then((stored) => { if (cancelled) return; if (stored && Object.keys(stored).length) setSoundPack(stored); setSoundPackHydratedFromIdb(true); }).catch(() => setSoundPackHydratedFromIdb(true)); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (!soundPackHydratedFromIdb) return; idbSet("sound-pack-files", soundPack).then((ok) => { if (ok) { try { window.localStorage.removeItem("kuaa-sound-pack-files"); } catch { /* ignora */ } } }); }, [soundPack, soundPackHydratedFromIdb]);
  const playSound = (slot: "acerto" | "erro" | "fim" | "sequencia" | "conquista") => { if (!soundEnabled) return; const source = soundPack[slot]; if (!source) return; try { const audio = new Audio(source); void audio.play(); } catch { /* dispositivo sem suporte, ignora silenciosamente */ } };
  const importSoundPack = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const wanted: Record<string, RegExp> = { acerto: /^acerto\.(mp3|wav|ogg|m4a)$/i, erro: /^erro\.(mp3|wav|ogg|m4a)$/i, fim: /^fim\.(mp3|wav|ogg|m4a)$/i, sequencia: /^sequencia\.(mp3|wav|ogg|m4a)$/i, conquista: /^conquista\.(mp3|wav|ogg|m4a)$/i };
      const slots: Record<string, string> = {};
      for (const [path, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const base = path.split("/").pop() || path;
        const slot = (Object.keys(wanted) as (keyof typeof wanted)[]).find((key) => wanted[key].test(base));
        if (!slot) continue;
        const blob = await entry.async("blob");
        slots[slot] = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
      }
      if (!Object.keys(slots).length) { toast.error("Nenhum som reconhecido", { description: "O pacote precisa ter ao menos um arquivo chamado acerto, erro ou fim (mp3, wav, ogg ou m4a)." }); return; }
      setSoundPack(slots);
      setSoundPackName(file.name);
      window.localStorage.setItem("kuaa-sound-pack-name", file.name);
      setSoundEnabled(true);
      toast.success("Pacote de som importado", { description: `${Object.keys(slots).length} som(ns) reconhecido(s) em "${file.name}". A importação substitui o pacote anterior.` });
    } catch { toast.error("Não foi possível ler o pacote", { description: "Confirme que é um arquivo .zip válido." }); }
    event.target.value = "";
  };
  const [examStartedAt, setExamStartedAt] = useState<number | null>(null);
  const [mixedDiscursiveText, setMixedDiscursiveText] = useState<Record<number, string>>({});
  const [formResponses, setFormResponses] = useState<Record<string, FormResponse[]>>(() => { try { return JSON.parse(window.localStorage.getItem("kuaa-form-responses") || "{}"); } catch { return {}; } });
  useEffect(() => { window.localStorage.setItem("kuaa-form-responses", JSON.stringify(formResponses)); }, [formResponses]);
  const [formIndex, setFormIndex] = useState(0);
  const [formChoices, setFormChoices] = useState<Record<number, string>>({});
  const [formTexts, setFormTexts] = useState<Record<string, string>>({});
  const [formStep, setFormStep] = useState<"questions" | "identify" | "done">("questions");
  const [formStatsFilter, setFormStatsFilter] = useState<string>("");
  const [formRespondentName, setFormRespondentName] = useState("");
  const startForm = (examId: string) => { chooseExam(examId); setFormIndex(0); setFormChoices({}); setFormTexts({}); setFormRespondentName(""); setFormStep("questions"); setScreen("formulario"); };
  const submitForm = (respondent: string) => {
    if (!activeExam) return;
    const response: FormResponse = { id: `${activeExam.id}-${Date.now()}`, respondent: respondent.trim() || "Anônimo", completedAt: new Date().toISOString(), choices: formChoices, texts: formTexts };
    setFormResponses((current) => ({ ...current, [activeExam.id]: [...(current[activeExam.id] || []), response] }));
    playSound("fim");
    setFormStep("done");
  };
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quickDurations, setQuickDurations] = useState<number[]>(() => { try { const value = JSON.parse(window.localStorage.getItem("kuaa-quick-durations") || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } });
  useEffect(() => { window.localStorage.setItem("kuaa-quick-durations", JSON.stringify(quickDurations.slice(-300))); }, [quickDurations]);
  const quickStartedAtRef = useRef(Date.now());
  const [showFaq, setShowFaq] = useState(false);
  const [showStreakInfo, setShowStreakInfo] = useState(false);
  // Modo "MÃO" para Questões Rápidas (update.txt §6, §7): "right" = padrão destro
  // (Próxima à direita, Voltar à esquerda); "left" = canhoto (inverte a ordem).
  const [quickHandMode, setQuickHandMode] = useState<"right" | "left">(() => window.localStorage.getItem("kuaa-quick-hand-mode") === "left" ? "left" : "right");
  useEffect(() => { window.localStorage.setItem("kuaa-quick-hand-mode", quickHandMode); }, [quickHandMode]);
  // Busca fuzzy na biblioteca (update.txt §TELA INICIAL): abre com 🔍, debounce 1s.
  const [searchOpen, setSearchOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const searchDebounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => setAppliedSearch(librarySearch), 1000);
    return () => { if (searchDebounceRef.current) window.clearTimeout(searchDebounceRef.current); };
  }, [librarySearch]);
  const clearLibrarySearch = () => { setLibrarySearch(""); setAppliedSearch(""); };
  // Expansão das medalhas no cabeçalho (update.txt §TELA INICIAL): 3+ medalhas mostram (+).
  const [medalsExpanded, setMedalsExpanded] = useState(false);
  // Ordem alfabética da biblioteca (update.txt §BARRA DE NAVEGAÇÃO): botão 🔠 alterna entre
  // data de importação (padrão, mais recentes primeiro) e ordem alfabética.
  const [alphabeticalOrder, setAlphabeticalOrder] = useState(false);
  // Filtros de prova (update4.txt §Tela inicial — Prova aleatória)
  const [provaFilterBancas, setProvaFilterBancas] = useState<string[]>([]);
  const [provaFilterCargos, setProvaFilterCargos] = useState<string[]>([]);
  const [provaFilterAnos, setProvaFilterAnos] = useState<string[]>([]);
  const [provaFilterStatus, setProvaFilterStatus] = useState<"ineditas" | "concluidas" | "abaixo90" | null>(null);
  // Filtros de quiz (update4.txt §Tela inicial — Hora do quiz)
  const [quizFilterTematicas, setQuizFilterTematicas] = useState<string[]>([]);
  // Quiz result detail (update4.txt — tela de detalhe do final do quiz)
  const [quizDetailAttemptId, setQuizDetailAttemptId] = useState<string | null>(null);
  // Performance history (update4.txt — persiste mesmo após excluir provas)
  const [perfHistory, setPerfHistory] = useState<PerformanceRecord[]>(() => loadPerformanceHistory());
  // Espelho durável do histórico de performance no IndexedDB: a lib continua
  // síncrona no localStorage (várias telas leem em render), mas o IDB guarda a
  // cópia que sobrevive ao teto e à limpeza automática do localStorage;
  // hidrata quando o IDB tem mais registros que o resíduo local.
  const [perfHistoryHydratedFromIdb, setPerfHistoryHydratedFromIdb] = useState(false);
  useEffect(() => {
    let cancelled = false;
    idbGet<PerformanceRecord[]>("perfHistory").then((stored) => {
      if (cancelled) return;
      if (Array.isArray(stored) && stored.length > loadPerformanceHistory().length) {
        setPerfHistory(stored);
        try { window.localStorage.setItem("kuaa-performance-history", JSON.stringify(stored.slice(-200))); } catch { /* ignora */ }
      }
      setPerfHistoryHydratedFromIdb(true);
    }).catch(() => setPerfHistoryHydratedFromIdb(true));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!perfHistoryHydratedFromIdb) return;
    idbSet("perfHistory", perfHistory.slice(-200));
  }, [perfHistory, perfHistoryHydratedFromIdb]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizQuestionOrder, setQuizQuestionOrder] = useState<number[]>([]);
  const [quizAlternativeOrder, setQuizAlternativeOrder] = useState<Record<number, string[]>>({});
  const startQuiz = (examId: string) => { chooseExam(examId); setQuizAnswers({}); setQuizIndex(0); const exam = studyExams.find((item) => item.id === examId); const items = exam?.questions || []; setQuizQuestionOrder(shuffle(items.map((item) => item.id))); setQuizAlternativeOrder(Object.fromEntries(items.map((item) => [item.id, shuffle(item.alternatives.map((alt) => alt.id))]))); setScreen("quiz"); };
  const finishQuiz = () => {
    if (!activeExam || !activeExam.quizFinais?.length) return;
    const finalIds = activeExam.quizFinais.map((item) => item.id);
    const progressao: Record<string, number[]> = Object.fromEntries(finalIds.map((id) => [id, []]));
    activeExam.questions.forEach((question) => {
      const chosen = quizAnswers[question.id] || "";
      // CORREÇÃO: suporta IDs multi-caractere (A01, A02...) do formato kuaa/ e IDs de 1 caractere (A, B...)
      // do formato legado. Usa vírgula como separador para múltipla escolha; para única escolha, o valor
      // é um único ID sem vírgula.
      const chosenIds = chosen ? chosen.split(",").filter(Boolean) : [];
      for (const finalId of finalIds) {
        const pontos = chosenIds.reduce((sum, altId: string) => { const alt = question.alternatives.find((item) => item.id === altId); return sum + (alt?.pontos?.[finalId] || 0); }, 0);
        progressao[finalId].push(pontos);
      }
    });
    const winners = resolveQuizWinners(finalIds, progressao, activeExam.quizDesempate === 2 ? 2 : 1);
    const totals = Object.fromEntries(finalIds.map((id) => [id, progressao[id].reduce((sum, value) => sum + value, 0)]));
    const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
    const quizAffinity = Math.round((totals[winners[0]] / grandTotal) * 100);
    const runnerUp = finalIds.filter((id) => !winners.includes(id)).sort((first, second) => totals[second] - totals[first])[0];
    // Mostra o 2º lugar sempre que existir (não só quando afinidade < 70), conforme update4.txt
    const quizSecondPlaceId = runnerUp ? runnerUp : undefined;
    const quizSecondPlacePct = quizSecondPlaceId ? Math.round((totals[quizSecondPlaceId] / grandTotal) * 100) : undefined;
    const attempt: AttemptRecord = { id: `${activeExam.id}-${Date.now()}`, examId: activeExam.id, score: 0, durationSeconds: 0, completedAt: new Date().toISOString(), subjectDurations: {}, quizResultIds: winners, quizAffinity, quizSecondPlaceId, quizSecondPlacePct };
    onAttempt(attempt);
    // Persiste quiz no histórico de performance (update4.txt)
    const winnerFinals = (activeExam.quizFinais || []).filter((f) => winners.includes(f.id));
    const secondFinal = (activeExam.quizFinais || []).find((f) => f.id === quizSecondPlaceId);
    savePerformanceRecord({
      attemptId: attempt.id,
      examId: activeExam.id,
      examTitle: activeExam.title,
      examRole: activeExam.role,
      examBoard: activeExam.board || "",
      examYear: activeExam.year,
      examKind: "quiz",
      completedAt: attempt.completedAt,
      score: 0,
      quizResultIds: winners,
      quizResultTitles: winnerFinals.map((f) => f.titulo),
      quizAffinity,
      quizSecondPlaceId,
      quizSecondPlaceTitle: secondFinal?.titulo,
      quizSecondPlacePct,
    });
    setPerfHistory(loadPerformanceHistory());
    playSound("fim");
    setSummaryAttempt(attempt);
    setScreen("summary");
  };
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastExamActionAt, setLastExamActionAt] = useState<number | null>(null);
  const [autoClosed, setAutoClosed] = useState(false);
  const [questionOpenedAt, setQuestionOpenedAt] = useState<number | null>(null);
  const [subjectDurations, setSubjectDurations] = useState<Record<string, number[]>>({});
  const [questionDurations, setQuestionDurations] = useState<Record<string, number>>({});
  const [summaryAttempt, setSummaryAttempt] = useState<AttemptRecord | null>(null);
  const [examPage, setExamPage] = useState(0);
  const [kindFilter, setKindFilter] = useState<"prova" | "quiz" | "formulario" | null>(null);
  useEffect(() => { setExamPage(0); }, [kindFilter]);
  const toggleKindFilter = (kind: "prova" | "quiz" | "formulario") => setKindFilter((current) => current === kind ? null : kind);
  const questionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const studyExams = useMemo(() => exams.filter((exam) => !isSyntheticStudyExam(exam) || exam.questions.length >= SYNTHETIC_STUDENT_BATCH_SIZE), [exams]);
  useEffect(() => { if (kindFilter && !studyExams.some((exam) => (exam.kind || "prova") === kindFilter)) setKindFilter(null); }, [studyExams, kindFilter]);
  const activeExam = studyExams.find((item) => item.id === activeId) || studyExams[0];
  const [examQuestionOrder, setExamQuestionOrder] = useState<number[]>([]);
  const baseQuestions = activeExam?.questions || [];
  const questions = examQuestionOrder.length ? examQuestionOrder.map((id) => baseQuestions.find((item) => item.id === id)).filter((item): item is Question => Boolean(item)) : baseQuestions;
  const quickEligible = useMemo<QuickQuestion[]>(() => exams.filter((exam) => (exam.kind || "prova") === "prova").flatMap((exam) => exam.questions.filter((item) => !requiresExternalText(item) && item.type !== "discursiva" && item.type !== "multipla" && Boolean(item.correct) && item.correct !== "ANULADA").map((item) => ({ ...item, sourceExam: { id: exam.id, title: exam.title, role: exam.role, city: exam.city, state: exam.state, year: exam.year, board: exam.board, questionKey: `${exam.id}:${item.id}` } }))), [exams]);
  const allQuestionCount = useMemo(() => exams.reduce((total, exam) => total + exam.questions.length, 0), [exams]);
  const quickOrganization = useMemo(() => organizeSubjects(quickEligible.map((item) => ({ subject: item.subject, role: item.sourceExam.role }))), [quickEligible]);
  const quickSubjectByKey = useMemo(() => new Map(quickEligible.map((item, index) => [item.sourceExam.questionKey, quickOrganization.resolved[index] || item.subject.trim() || "Sem matéria"])), [quickEligible, quickOrganization]);
  const subjectGroups = quickOrganization.groups;
  const [quickSubjects, setQuickSubjects] = useState<string[]>([]);
  const [quickDifficulties, setQuickDifficulties] = useState<Difficulty[]>([]);
  // Filtros de Bancas e Cargo da tela Questão Rápida (mesmos conceitos da tela de
  // filtros de "Iniciar prova"). Estados próprios: cada tela guarda a própria seleção.
  const [quickFilterBancas, setQuickFilterBancas] = useState<string[]>([]);
  const [quickFilterCargos, setQuickFilterCargos] = useState<string[]>([]);
  const availableQuickBancas = useMemo(() => Array.from(new Set(quickEligible.map((item) => item.sourceExam.board || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [quickEligible]);
  const availableQuickCargos = useMemo(() => Array.from(new Set(quickEligible.map((item) => item.sourceExam.role || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [quickEligible]);
  // Se uma prova for excluída, descarta seleções que já não existem no acervo
  // (evita um pool vazio "misterioso" com o botão Começar desabilitado).
  useEffect(() => { setQuickFilterBancas((values) => values.filter((value) => availableQuickBancas.includes(value))); }, [availableQuickBancas]);
  useEffect(() => { setQuickFilterCargos((values) => values.filter((value) => availableQuickCargos.includes(value))); }, [availableQuickCargos]);
  const quickPool = (quickSubjects.length ? quickEligible.filter((item) => quickSubjects.includes(quickSubjectByKey.get(item.sourceExam.questionKey) || "")) : quickEligible)
    .filter((item) => !quickDifficulties.length || quickDifficulties.includes(item.difficulty || "media"))
    .filter((item) => !quickFilterBancas.length || quickFilterBancas.includes(item.sourceExam.board || ""))
    .filter((item) => !quickFilterCargos.length || quickFilterCargos.includes(item.sourceExam.role || ""));
  // Contador de Questão Rápida por matéria: respondidas (certas + erradas) e
  // acertos, calculado do histórico de respostas já existente (quickHistory)
  // cruzado com a matéria resolvida de cada questão. Alimenta o cartão do
  // carrossel (nome / respondidas / % de acerto) e a ordenação por uso.
  const quickSubjectStats = useMemo(() => {
    const stats = new Map<string, { answered: number; correct: number }>();
    Object.entries(quickHistory).forEach(([questionKey, record]) => {
      const label = quickSubjectByKey.get(questionKey);
      if (!label) return;
      const entry = stats.get(label) || { answered: 0, correct: 0 };
      entry.answered += record.correct + record.wrong;
      entry.correct += record.correct;
      stats.set(label, entry);
    });
    return stats;
  }, [quickHistory, quickSubjectByKey]);
  // Ordenação por uso: snapshot lido UMA vez por sessão (na primeira montagem).
  // Assim a migração alfabética -> mais respondidas primeiro acontece ao fechar
  // e reabrir o programa, mantendo a ordem estável durante a sessão.
  const subjectAnsweredOrderRef = useRef<Map<string, number> | null>(null);
  if (subjectAnsweredOrderRef.current === null) {
    const snapshot = new Map<string, number>();
    quickSubjectStats.forEach((value, label) => snapshot.set(label, value.answered));
    subjectAnsweredOrderRef.current = snapshot;
  }
  const carouselSubjects = useMemo(() => [...subjectGroups].sort((first, second) => {
    const usage = (subjectAnsweredOrderRef.current?.get(second.label) || 0) - (subjectAnsweredOrderRef.current?.get(first.label) || 0);
    if (usage !== 0) return usage;
    return first.label.localeCompare(second.label, "pt-BR");
  }), [subjectGroups]);
  // Marca/desmarca a matéria no carrossel vertical.
  const toggleCarouselSubject = (label: string) => {
    setQuickSubjects((values) => values.includes(label) ? values.filter((item) => item !== label) : [...values, label]);
  };
  // Arrasto com o mouse (o toque já rola nativamente): arrastar move o carrossel
  // vertical e evita que o clique solto no fim do arrasto selecione uma matéria.
  const subjectDragRef = useRef({ active: false, startY: 0, startScroll: 0, moved: false });
  const subjectDragSuppressRef = useRef(false);
  const handleSubjectPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    subjectDragRef.current = { active: true, startY: event.clientY, startScroll: event.currentTarget.scrollTop, moved: false };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sem suporte, ignora */ }
  };
  const handleSubjectPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = subjectDragRef.current;
    if (!drag.active) return;
    const delta = event.clientY - drag.startY;
    if (Math.abs(delta) > 5) drag.moved = true;
    event.currentTarget.scrollTop = drag.startScroll - delta;
  };
  const handleSubjectPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = subjectDragRef.current;
    if (!drag.active) return;
    drag.active = false;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* ignora */ }
    if (drag.moved) {
      subjectDragSuppressRef.current = true;
      window.setTimeout(() => { subjectDragSuppressRef.current = false; }, 150);
    }
  };
  const quickTotals = Object.values(quickHistory).reduce((total, item) => ({ correct: total.correct + item.correct, wrong: total.wrong + item.wrong }), { correct: 0, wrong: 0 });
  const quickAnswers = quickTotals.correct + quickTotals.wrong;
  const quickAccuracy = quickAnswers ? Math.round((quickTotals.correct / quickAnswers) * 100) : 0;
  const filteredLibraryExams = useMemo(() => {
    let list = kindFilter ? studyExams.filter((exam) => (exam.kind || "prova") === kindFilter) : studyExams;
    const query = normalizeSearchText(appliedSearch);
    if (query) {
      list = list.filter((exam) => {
        const haystack = normalizeSearchText([exam.title, exam.role, exam.city, exam.state, exam.year, exam.board, exam.booklet, exam.kind || "prova"].filter(Boolean).join(" "));
        return haystack.includes(query);
      });
    }
    // Padrão: mais recentes primeiro (ordem de importação reversa). Com 🔠 ativo, alfabético.
    if (alphabeticalOrder) {
      list = [...list].sort((a, b) => normalizeSearchText(a.title).localeCompare(normalizeSearchText(b.title), "pt-BR"));
    } else {
      list = [...list].reverse();
    }
    return list;
  }, [studyExams, kindFilter, appliedSearch, alphabeticalOrder]);
  const examPageCount = Math.max(1, Math.ceil(filteredLibraryExams.length / STUDENT_EXAM_PAGE_SIZE));
  const safeExamPage = Math.min(examPage, examPageCount - 1);
  const visibleLibraryExams = filteredLibraryExams.slice(safeExamPage * STUDENT_EXAM_PAGE_SIZE, (safeExamPage + 1) * STUDENT_EXAM_PAGE_SIZE);
  const suggestedExam = useMemo(() => {
    const uncompleted = studyExams.filter((exam) => !attempts.some((attempt) => attempt.examId === exam.id));
    if (uncompleted.length) {
      const exam = uncompleted[Math.floor(Math.random() * uncompleted.length)];
      return { exam, reason: "ainda sem tentativa concluída" };
    }
    if (!studyExams.length) return null;
    const weighted = studyExams.map((exam) => {
      const examAttempts = attempts.filter((attempt) => attempt.examId === exam.id);
      const average = examAttempts.length ? examAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / examAttempts.length : 0;
      return { exam, average, weight: 1 + (100 - average) / 10 };
    });
    let draw = Math.random() * weighted.reduce((sum, item) => sum + item.weight, 0);
    const chosen = weighted.find((item) => { draw -= item.weight; return draw <= 0; }) || weighted[weighted.length - 1];
    return { exam: chosen.exam, reason: `priorizada pela média de ${Math.round(chosen.average)}%` };
  }, [attempts, studyExams]);
  useEffect(() => { setActiveId(selectedExamId || exams[0]?.id || ""); }, [selectedExamId, exams]);
  useEffect(() => { setExamPage((page) => Math.min(page, examPageCount - 1)); }, [examPageCount]);
  useEffect(() => { window.localStorage.setItem("kuaa-student-palette", palette); }, [palette]);
  // Histórico de Questão Rápida em IndexedDB (sem teto de tamanho): hidrata na
  // abertura e grava no IDB; o resíduo do localStorage some após a migração.
  const [quickHistoryHydratedFromIdb, setQuickHistoryHydratedFromIdb] = useState(false);
  useEffect(() => {
    let cancelled = false;
    idbGet<Record<string, { correct: number; wrong: number }>>("quickHistory").then((stored) => {
      if (cancelled) return;
      if (stored && typeof stored === "object" && Object.keys(stored).length) setQuickHistory(stored);
      setQuickHistoryHydratedFromIdb(true);
    }).catch(() => setQuickHistoryHydratedFromIdb(true));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!quickHistoryHydratedFromIdb) return;
    idbSet("quickHistory", quickHistory).then((ok) => { if (ok) { try { window.localStorage.removeItem("kuaa-quick-history"); } catch { /* ignora */ } } });
  }, [quickHistory, quickHistoryHydratedFromIdb]);
  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (screen === "exam" || screen === "quick") {
        questionHeadingRef.current?.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
        return;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [screen, examIndex, quickQuestion?.sourceExam.questionKey]);
  const chooseExam = (id: string) => { setActiveId(id); onSelected(id); setQuickSubjects([]); };
  const startExam = (id = activeExam?.id) => { if (!id) return; chooseExam(id); const exam = studyExams.find((item) => item.id === id); const items = exam?.questions || []; setAnswers({}); setExamIndex(0); setExamStartedAt(null); setElapsedSeconds(0); setLastExamActionAt(null); setAutoClosed(false); setQuestionOpenedAt(null); setSubjectDurations({}); setQuestionDurations({}); setSummaryAttempt(null); setExamQuestionOrder(items.map((item) => item.id)); setAttemptOrder(Object.fromEntries(items.map((item) => [item.id, shuffle(item.alternatives.map((alternative) => alternative.id))]))); setScreen("exam-closed"); };
  const registerExamAction = () => { if (screen === "exam") setLastExamActionAt(Date.now()); };
  const measuredQuestionMetrics = () => {
    const current = questions[examIndex];
    if (!questionOpenedAt || !current) return { subjects: subjectDurations, questions: questionDurations };
    const seconds = Math.floor((Date.now() - questionOpenedAt) / 1000);
    const measuredQuestions = { ...questionDurations, [current.id]: (questionDurations[current.id] || 0) + seconds };
    if (!current.subject.trim() || seconds <= 5 || seconds >= 300) return { subjects: subjectDurations, questions: measuredQuestions };
    return { subjects: { ...subjectDurations, [current.subject]: [...(subjectDurations[current.subject] || []), seconds] }, questions: measuredQuestions };
  };
  const changeQuestion = (nextIndex: number) => { const measured = measuredQuestionMetrics(); setSubjectDurations(measured.subjects); setQuestionDurations(measured.questions); setExamIndex(nextIndex); setQuestionOpenedAt(Date.now()); registerExamAction(); };
  const openExam = () => { const now = Date.now(); setExamStartedAt((value) => value || now); setLastExamActionAt(now); setQuestionOpenedAt(now); setAutoClosed(false); setScreen("exam"); };
  const closeExam = (automatic = false) => { setAutoClosed(automatic); setLastExamActionAt(null); setQuestionOpenedAt(null); setScreen("exam-closed"); if (automatic) toast("Caderno fechado por inatividade", { description: "O cronômetro geral continua correndo; reabra quando quiser continuar." }); };
  const finishExam = () => {
    const measured: { subjects: Record<string, number[]>; questions: Record<string, number> } = screen === "exam" ? measuredQuestionMetrics() : { subjects: subjectDurations, questions: questionDurations };
    const wasOpened = Boolean(activeExam && examStartedAt);
    if (activeExam && examStartedAt) {
      const results: AttemptQuestionResult[] = questions.map((item) => {
        const selected = answers[item.id];
        const status = !item.correct || item.correct === "ANULADA" ? "ungraded" : selected === item.correct ? "correct" : selected ? "wrong" : "blank";
        return { questionId: item.id, originalNumber: item.originalNumber || String(item.id), subject: item.subject || "Sem matéria", status, durationSeconds: measured.questions[String(item.id)] || 0 };
      });
      const valid = results.filter((item) => item.status !== "ungraded");
      const correct = valid.filter((item) => item.status === "correct").length;
      const scores = computeScoreVariants(questions, results, activeExam.pointsByDifficulty);
      // Cálculo TRI adaptativo (update3.txt §DESISTIR DO CAMPO TRI): sempre calcula para ter o valor disponível,
      // mas só substitui o score se a prova usar metodologia "tri" (inferida pelo booklet ou pointsByDifficulty).
      const triQuestoes: QuestaoRespondida[] = questions.map((q) => {
        const r = results.find((x) => x.questionId === q.id);
        const base = pesoBase(q.difficulty, activeExam.pointsByDifficulty);
        const correta = r?.status === "correct";
        return {
          id: q.id,
          materia: q.subject || "Sem matéria",
          dificuldade: q.difficulty || "media",
          pontuacaoBase: base,
          pontuacaoObtida: correta ? base : 0,
          correta,
        };
      });
      const triResultado = calcularPontuacaoAdaptativa(triQuestoes);
      const attempt: AttemptRecord = {
        id: `${activeExam.id}-${Date.now()}`,
        examId: activeExam.id,
        score: valid.length ? Number(((correct / valid.length) * 100).toFixed(1)) : 0,
        durationSeconds: Math.max(elapsedSeconds, Math.floor((Date.now() - examStartedAt) / 1000)),
        completedAt: new Date().toISOString(),
        subjectDurations: measured.subjects,
        questionResults: results,
        subjectSummary: buildSubjectSummary(results, measured.subjects),
        scores,
        // triSimplificada e triPercentual para o resumo (update3.txt)
        ...( { triSimplificada: triResultado.triSimplificada, triPercentual: triResultado.percentual, triDetalhes: triResultado.detalhes } as Partial<AttemptRecord>),
      };
      onAttempt(attempt);
      // Persiste no histórico de performance (update4.txt — sobrevive à exclusão da prova)
      savePerformanceRecord({
        attemptId: attempt.id,
        examId: activeExam.id,
        examTitle: activeExam.title,
        examRole: activeExam.role,
        examBoard: activeExam.board || "",
        examYear: activeExam.year,
        examKind: "prova",
        completedAt: attempt.completedAt,
        score: attempt.score,
        triSimplificada: triResultado.triSimplificada,
        triPercentual: triResultado.percentual,
        subjectSummary: attempt.subjectSummary,
      });
      setPerfHistory(loadPerformanceHistory());
      const answeredCount = Object.keys(answers).length;
      const examQualifies = questions.length >= 40 && answeredCount === questions.length;
      registerActivity({ examQuestions: examQualifies ? questions.length : 0, examQualifies });
      if (vibrationEnabled) vibrate([40, 50, 40, 50, 80]);
      playSound("fim");
      setSummaryAttempt(attempt);
      setScreen("summary");
    } else {
      setScreen("library");
    }
    setSubjectDurations({}); setQuestionDurations({}); setQuestionOpenedAt(null); setExamStartedAt(null); setLastExamActionAt(null); setAutoClosed(false);
    if (wasOpened) toast.success("Prova finalizada", { description: "Questões sem resposta foram consideradas erro nesta tentativa." }); else toast("Prova não iniciada", { description: "Como o caderno não foi aberto, nenhum dado foi registrado nas estatísticas." });
  };
  useEffect(() => { if ((screen !== "exam" && screen !== "exam-closed") || !examStartedAt) return; const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - examStartedAt) / 1000))); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, [examStartedAt, screen]);
  useEffect(() => { if (screen !== "exam" || !lastExamActionAt) return; const watcher = window.setInterval(() => { if (Date.now() - lastExamActionAt >= 300000) closeExam(true); }, 1000); return () => window.clearInterval(watcher); }, [lastExamActionAt, screen]);
  useEffect(() => { if (screen !== "exam") return; const signalActivity = () => registerExamAction(); window.addEventListener("pointerdown", signalActivity); window.addEventListener("keydown", signalActivity); window.addEventListener("touchstart", signalActivity); window.addEventListener("scroll", signalActivity, true); return () => { window.removeEventListener("pointerdown", signalActivity); window.removeEventListener("keydown", signalActivity); window.removeEventListener("touchstart", signalActivity); window.removeEventListener("scroll", signalActivity, true); }; }, [screen]);
  const selectQuick = (exclude?: string) => { const candidates = quickPool.filter((item) => item.sourceExam.questionKey !== exclude || quickPool.length === 1); const priority = (item: QuickQuestion) => { const history = quickHistory[item.sourceExam.questionKey]; if (!history) return 3; return history.wrong > 0 ? 2 : 1; }; const next = shuffle(candidates).sort((a, b) => { const first = quickHistory[a.sourceExam.questionKey] || { correct: 0, wrong: 0 }; const second = quickHistory[b.sourceExam.questionKey] || { correct: 0, wrong: 0 }; return priority(b) - priority(a) || (first.correct + first.wrong) - (second.correct + second.wrong); })[0]; setQuickQuestion(next || null); setQuickOrder(next ? shuffle(next.alternatives.map((item) => item.id)) : []); setQuickAnswered(false); setQuickRevealing(false); setAnswers({}); quickStartedAtRef.current = Date.now(); };
  const startQuick = () => { selectQuick(); setScreen("quick"); };
  const importPackage = async (event: ChangeEvent<HTMLInputElement>) => {
    // Importação múltipla: o input agora aceita vários JSONs de uma vez;
    // percorre todos, deduplica entre eles e mostra um resumo no toast.
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const MAX_SILENT_IMPORT_BYTES = 400 * 1024;
    const knownIds = new Set(exams.map((item) => item.id));
    let accumulated = [...exams];
    let imported = 0; let duplicates = 0; let unresolvedTotal = 0; let failed = 0;
    for (const file of files) {
      if (file.size > MAX_SILENT_IMPORT_BYTES) {
        const proceed = window.confirm(`${file.name} é grande (>400KB). A importação pode ser lenta. Deseja continuar?`);
        if (!proceed) continue;
      }
      try {
        const raw = JSON.parse(await file.text()) as Record<string, unknown>;
        const entries = Array.isArray(raw.exams) ? raw.exams : [raw];
        const candidates = entries.map((item, index) => normalizeExamPayload(item as Record<string, unknown>, `prova-${Date.now()}-${files.indexOf(file)}-${index}`));
        const unresolved = candidates.filter((candidate) => (candidate.kind || "prova") === "prova" && isUnresolvedRole(candidate.role)).length;
        const fresh = candidates.filter((candidate) => ((candidate.kind || "prova") !== "prova" || !isUnresolvedRole(candidate.role)) && !knownIds.has(candidate.id));
        fresh.forEach((candidate) => knownIds.add(candidate.id));
        accumulated = [...accumulated, ...fresh];
        imported += fresh.length;
        duplicates += candidates.length - fresh.length - unresolved;
        unresolvedTotal += unresolved;
      } catch { failed += 1; }
    }
    event.target.value = "";
    if (imported > 0) {
      onChange(accumulated);
      chooseExam(accumulated[exams.length]?.id || "");
      toast.success(`${imported} prova(s) importada(s)`, { description: `${files.length} arquivo(s) analisado(s). ${duplicates} duplicidade(s) ignorada(s).${unresolvedTotal ? ` ${unresolvedTotal} prova(s) sem cargo válido bloqueada(s).` : ""}${failed ? ` ${failed} arquivo(s) não reconhecido(s).` : ""}` });
    } else {
      toast.error("Nenhuma prova importada", { description: unresolvedTotal ? "Os pacotes não contêm cargo profissional válido. Corrija o campo role na intermediadora." : failed ? "Nenhum arquivo foi reconhecido. Use arquivos exportados pelo intermediador." : "Os pacotes já estão no seu acervo." });
    }
  };
  const deleteExam = (id: string) => { const exam = exams.find((item) => item.id === id); if (!exam || !window.confirm(`Excluir ${exam.role} · ${exam.city}?`)) return; const remaining = exams.filter((item) => item.id !== id); onChange(remaining); chooseExam(remaining[0]?.id || ""); toast.success("Prova excluída do dispositivo"); };
  const deleteAllExams = () => {
    if (!exams.length) return;
    const confirmation = window.prompt(`Você está prestes a excluir ${exams.length} prova(s), tentativas e histórico de Questões rápidas deste dispositivo. Esta ação não pode ser desfeita.\n\nDigite EXCLUIR para confirmar.`);
    if (confirmation !== "EXCLUIR") { toast("Exclusão total cancelada"); return; }
    onChange([]); onSelected(""); setActiveId(""); setQuickHistory({}); setQuickSubjects([]); setExamPage(0); window.dispatchEvent(new Event("kuaa-clear-history"));
    toast.success("Acervo local apagado", { description: "As provas e os históricos deste dispositivo foram removidos." });
  };
  const openSummary = (examId: string, attempt: AttemptRecord) => { chooseExam(examId); setSummaryAttempt(attempt); setScreen("summary"); };
  useEffect(() => {
    const handleNativeBack = () => {
      if (screen === "library") { window.dispatchEvent(new Event("kuaa-exit")); return; }
      if (screen === "quick-setup") { setScreen("library"); return; }
      if (screen === "quick") { setScreen("quick-setup"); return; }
      if (screen === "exam") { closeExam(false); return; }
      if (screen === "exam-closed") { finishExam(); return; }
      setScreen("library");
    };
    window.addEventListener("kuaa-back", handleNativeBack);
    return () => window.removeEventListener("kuaa-back", handleNativeBack);
  }, [screen, closeExam, finishExam]);
  const [theme, setTheme] = useState<StudentTheme>(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    const saved = window.localStorage.getItem("kuaa-student-theme");
    return isStudentTheme(requested) ? requested : isStudentTheme(saved) ? saved : "caderno";
  });
  useEffect(() => { window.localStorage.setItem("kuaa-student-theme", theme); }, [theme]);
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>(() => { try { return JSON.parse(window.localStorage.getItem("kuaa-custom-themes") || "[]"); } catch { return []; } });
  const [customThemesHydratedFromIdb, setCustomThemesHydratedFromIdb] = useState(false);
  useEffect(() => { let cancelled = false; idbGet<CustomTheme[]>("custom-themes").then((stored) => { if (cancelled) return; if (Array.isArray(stored) && stored.length) setCustomThemes(stored); setCustomThemesHydratedFromIdb(true); }).catch(() => setCustomThemesHydratedFromIdb(true)); return () => { cancelled = true; }; }, []);
  useEffect(() => { if (!customThemesHydratedFromIdb) return; idbSet("custom-themes", customThemes).then((ok) => { if (ok) { try { window.localStorage.removeItem("kuaa-custom-themes"); } catch { /* ignora */ } } }); }, [customThemes, customThemesHydratedFromIdb]);
  const [activeCustomThemeId, setActiveCustomThemeId] = useState<string | null>(() => window.localStorage.getItem("kuaa-active-custom-theme") || null);
  useEffect(() => { if (activeCustomThemeId) window.localStorage.setItem("kuaa-active-custom-theme", activeCustomThemeId); else window.localStorage.removeItem("kuaa-active-custom-theme"); }, [activeCustomThemeId]);
  const [activeCustomPaletteId, setActiveCustomPaletteId] = useState<string | null>(() => window.localStorage.getItem("kuaa-active-custom-palette") || null);
  useEffect(() => { if (activeCustomPaletteId) window.localStorage.setItem("kuaa-active-custom-palette", activeCustomPaletteId); else window.localStorage.removeItem("kuaa-active-custom-palette"); }, [activeCustomPaletteId]);
  const activeCustomTheme = customThemes.find((item) => item.id === activeCustomThemeId) || null;
  const activeCustomPalette = activeCustomTheme?.palettes.find((item) => item.id === activeCustomPaletteId) || activeCustomTheme?.palettes[0] || null;
  useEffect(() => {
    const root = document.documentElement.style;
    const keys: (keyof CustomThemePalette["cores"])[] = ["fundo", "superficie", "texto", "textoSuave", "linha", "destaque", "textoDestaque", "fundoSuave"];
    const cssVar: Record<keyof CustomThemePalette["cores"], string> = { fundo: "--student-bg", superficie: "--student-surface", texto: "--student-ink", textoSuave: "--student-muted", linha: "--student-line", destaque: "--student-accent", textoDestaque: "--student-accent-ink", fundoSuave: "--student-soft" };
    if (activeCustomTheme && activeCustomPalette) {
      for (const key of keys) root.setProperty(cssVar[key], activeCustomPalette.cores[key]);
      if (activeCustomTheme.backgroundImage) { root.setProperty("--student-bg-pattern", `url("${activeCustomTheme.backgroundImage}")`); document.documentElement.dataset.customBg = "1"; } else { root.removeProperty("--student-bg-pattern"); delete document.documentElement.dataset.customBg; }
    } else { for (const key of keys) root.removeProperty(cssVar[key]); root.removeProperty("--student-bg-pattern"); delete document.documentElement.dataset.customBg; }
  }, [activeCustomTheme, activeCustomPalette]);
  const importCustomTheme = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const zip = await JSZip.loadAsync(file);
      const manifestEntry = Object.entries(zip.files).find(([path, entry]) => !entry.dir && path.split("/").pop()?.toLowerCase() === "tema.json");
      if (!manifestEntry) { toast.error("Arquivo tema.json não encontrado", { description: "O .zip precisa conter um arquivo tema.json na raiz." }); return; }
      const raw = JSON.parse(await manifestEntry[1].async("string")) as { nome?: string; palettes?: { nome?: string; cores?: Record<string, string> }[] };
      const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
      const keys: (keyof CustomThemePalette["cores"])[] = ["fundo", "superficie", "texto", "textoSuave", "linha", "destaque", "textoDestaque", "fundoSuave"];
      const paletasBrutas = Array.isArray(raw.palettes) ? raw.palettes : [];
      if (!paletasBrutas.length) { toast.error("Nenhuma paleta encontrada", { description: 'tema.json precisa de uma lista "palettes" com ao menos 1 paleta de cores.' }); return; }
      const palettes: CustomThemePalette[] = [];
      for (let index = 0; index < paletasBrutas.length; index++) {
        const cores = paletasBrutas[index].cores || {};
        const missing = keys.filter((key) => !hex.test(String(cores[key] || "")));
        if (missing.length) { toast.error(`Paleta ${index + 1}: cores inválidas ou faltando`, { description: `Precisa das 8 cores em hexadecimal: ${keys.join(", ")}. Faltando ou inválida(s): ${missing.join(", ")}.` }); return; }
        palettes.push({ id: `custom-palette-${Date.now()}-${index}`, nome: String(paletasBrutas[index].nome || `Paleta ${index + 1}`), cores: Object.fromEntries(keys.map((key) => [key, cores[key]])) as CustomThemePalette["cores"] });
      }
      const imageEntry = Object.entries(zip.files).find(([path, entry]) => !entry.dir && /\.(png|jpe?g|webp)$/i.test(path));
      let backgroundImage: string | undefined;
      if (imageEntry) { const blob = await imageEntry[1].async("blob"); backgroundImage = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }
      const nome = String(raw.nome || file.name.replace(/\.zip$/i, ""));
      const novo: CustomTheme = { id: `custom-theme-${Date.now()}`, nome, backgroundImage, palettes };
      setCustomThemes((current) => [...current, novo]);
      setActiveCustomThemeId(novo.id);
      setActiveCustomPaletteId(palettes[0].id);
      toast.success("Tema importado", { description: `"${nome}" já está ativo, com ${palettes.length} paleta(s)${backgroundImage ? " e imagem de fundo" : ""}.` });
    } catch { toast.error("Não foi possível ler o tema", { description: "Confirme que é um arquivo .zip com um tema.json válido." }); }
    event.target.value = "";
  };
  const deleteCustomTheme = (id: string) => { setCustomThemes((current) => current.filter((item) => item.id !== id)); if (activeCustomThemeId === id) { setActiveCustomThemeId(null); setActiveCustomPaletteId(null); } };
  useEffect(() => {
    document.documentElement.dataset.studentTheme = theme;
    document.documentElement.dataset.studentPalette = palette;
  }, [theme, palette]);
  const changeTheme = (nextTheme: StudentTheme) => { setActiveCustomThemeId(null); setActiveCustomPaletteId(null); setTheme(nextTheme); setPalette(STUDENT_THEMES[nextTheme].palettes[0].id); };
  const chooseCustomTheme = (customTheme: CustomTheme) => { setActiveCustomThemeId(customTheme.id); setActiveCustomPaletteId(customTheme.palettes[0].id); };
  const paletteControls = <div className="appearance-controls" aria-label="Aparência do estudante"><div className="theme-controls"><span>Tema</span>{(Object.keys(STUDENT_THEMES) as StudentTheme[]).map((item) => <button key={item} className={theme === item && !activeCustomThemeId ? "is-active" : ""} onClick={() => changeTheme(item)}>{STUDENT_THEMES[item].label}</button>)}{customThemes.map((customTheme) => <button key={customTheme.id} className={activeCustomThemeId === customTheme.id ? "is-active" : ""} onClick={() => chooseCustomTheme(customTheme)}>{customTheme.nome}</button>)}</div><div className="palette-controls"><span>Paleta</span>{activeCustomTheme ? activeCustomTheme.palettes.map((item) => <button key={item.id} className={activeCustomPaletteId === item.id ? "is-active" : ""} onClick={() => setActiveCustomPaletteId(item.id)}>{item.nome}</button>) : STUDENT_THEMES[theme].palettes.map((item) => <button key={item.id} className={palette === item.id ? "is-active" : ""} onClick={() => setPalette(item.id)}>{item.label}</button>)}</div></div>;
  if (studyExams.length === 0 && screen === "library") return <main className={`workspace student-theme-${palette} student-workspace`}><section className="quick-setup-sheet quick-empty-state"><div className="student-hero-brand"><BrandMark /></div><p className="eyebrow">ACERVO DE TREINO</p><h1>Não há uma prova completa disponível.</h1><p>{quickEligible.length ? "As questões de lotes sintéticos parciais já podem ser respondidas em Questões rápidas. Quando um banco atingir 50 questões, ele aparecerá aqui como prova." : "Importe um pacote de provas do intermediador para começar."}</p>{quickEligible.length ? <Button className="lime-button" onClick={() => setScreen("quick-setup")}><Sparkles size={17} /> Questões rápidas ({quickEligible.length})</Button> : null}<label className="button file-action student-import-action"><FileInput size={17} /> Importar<input type="file" multiple accept="application/json,.json" onChange={importPackage} /></label>{exams.length ? <Button variant="outline" className="danger-button clear-all-exams" onClick={deleteAllExams}><Trash2 size={16} /> Excluir provas</Button> : null}<div className="student-fixed-actions"><Button variant="outline" onClick={() => setScreen("settings")}><Settings2 size={16} /> Configurações</Button><Button variant="outline" onClick={() => setShowFaq(true)}><HelpCircle size={16} /> FAQ</Button></div></section>{showFaq && <div className="faq-overlay" onClick={() => setShowFaq(false)}><div className="faq-panel" onClick={(event) => event.stopPropagation()}><div className="faq-heading"><h2>Perguntas frequentes</h2><button onClick={() => setShowFaq(false)} aria-label="Fechar"><X size={18} /></button></div><dl>{FAQ_ENTRIES.map((entry) => <div key={entry.pergunta} className="faq-item"><dt>{entry.pergunta}</dt><dd>{entry.resposta}</dd></div>)}</dl></div></div>}</main>;
  if (screen === "quick-setup") { const startButton = <Button className="lime-button" disabled={!quickPool.length} onClick={startQuick}><Play size={17} /> Começar revisão rápida</Button>; const streakPhrase = streakStatusPhrase(perfectStreakRecord.contadorAtual); const streakEmojis = perfectStreakEmojis(perfectStreakRecord.contadorAtual); return <main className={`workspace student-theme-${palette} quick-setup-workspace`}><section className="quick-setup-sheet"><div className="quick-setup-topbar"><button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Voltar ao acervo</button><span className="quick-start-summary">{quickSubjects.length ? `${quickSubjects.length} matéria(s)` : "Todas as matérias"}</span>{startButton}</div><div className="streak-status-panel"><p>{streakPhrase}</p><div className="streak-status-row"><div className="streak-status-emojis" aria-label={`Sequências perfeitas: ${perfectStreakRecord.contadorAtual}`}>{streakEmojis.map((emoji, index) => <i key={index}>{emoji}</i>)}</div><button type="button" className="streak-info-link" aria-label="Como funcionam as sequências perfeitas?" title="Como funcionam as sequências perfeitas?" onClick={() => setShowStreakInfo(true)}>❓</button></div></div><p className="eyebrow">QUESTÃO RÁPIDA · ACERVO COMPLETO</p>{subjectGroups.length > 0 && <><div className="subject-choice"><button className={`subject-choice-all ${!quickSubjects.length ? "is-active" : ""}`} onClick={() => setQuickSubjects([])}><span>✦</span><div><strong>Todas as matérias</strong><small>Revisão adaptativa no acervo</small></div></button></div><div className="subject-vertical-scroll" onPointerDown={handleSubjectPointerDown} onPointerMove={handleSubjectPointerMove} onPointerUp={handleSubjectPointerUp} onPointerCancel={handleSubjectPointerUp}><div className="subject-vertical-list">{carouselSubjects.map((subject) => { const stats = quickSubjectStats.get(subject.label); const answered = stats?.answered || 0; const pct = answered ? Math.round(((stats?.correct || 0) / answered) * 100) : null; return <button key={subject.label} type="button" className={`subject-vertical-card ${quickSubjects.includes(subject.label) ? "is-active" : ""}`} onClick={() => { if (subjectDragSuppressRef.current) return; toggleCarouselSubject(subject.label); }}><span className="subject-vertical-card-info"><strong>{subject.label}</strong><small>{subject.count} questão{subject.count === 1 ? "" : "s"}</small></span><span className="subject-vertical-card-pct">{pct === null ? <i>–</i> : <><b>{pct}</b><i>%</i></>}</span></button>; })}</div></div></>}{availableQuickBancas.length >= 2 && <div className="prova-filter-row"><span className="prova-filter-label">Bancas</span><div className="prova-filter-buttons"><button className={!quickFilterBancas.length ? "is-active" : ""} onClick={() => setQuickFilterBancas([])}>Todas as bancas</button>{availableQuickBancas.map((banca) => <button key={banca} className={quickFilterBancas.includes(banca) ? "is-active" : ""} onClick={() => setQuickFilterBancas((values) => values.includes(banca) ? values.filter((item) => item !== banca) : [...values, banca])}>{banca}</button>)}</div></div>}{availableQuickCargos.length >= 2 && <div className="prova-filter-row"><span className="prova-filter-label">Cargos</span><div className="prova-filter-buttons"><button className={!quickFilterCargos.length ? "is-active" : ""} onClick={() => setQuickFilterCargos([])}>Todos os cargos</button>{availableQuickCargos.map((cargo) => <button key={cargo} className={quickFilterCargos.includes(cargo) ? "is-active" : ""} onClick={() => setQuickFilterCargos((values) => values.includes(cargo) ? values.filter((item) => item !== cargo) : [...values, cargo])}>{cargo}</button>)}</div></div>}<div className="quick-difficulty-choice"><span>Dificuldade</span><div className="quick-filter-buttons">{(["facil", "media", "dificil"] as Difficulty[]).map((level) => <button key={level} className={quickDifficulties.includes(level) ? "is-active" : ""} onClick={() => setQuickDifficulties((values) => values.includes(level) ? values.filter((item) => item !== level) : [...values, level])}>{DIFFICULTY_LABELS[level]}</button>)}</div></div><div className="quick-difficulty-choice quick-hand-choice"><span>Mão</span><div className="quick-filter-buttons"><button className={quickHandMode === "left" ? "is-active" : ""} onClick={() => setQuickHandMode("left")} title="Próxima à esquerda (canhoto)">Próxima/Voltar</button><button className={quickHandMode === "right" ? "is-active" : ""} onClick={() => setQuickHandMode("right")} title="Próxima à direita (destro)">Voltar/Próxima</button></div></div><div className="quick-setup-footer"><span>{quickSubjects.length ? `${quickSubjects.length} matéria(s) selecionada(s)` : "Todas as matérias elegíveis"}</span>{startButton}</div></section>{showStreakInfo && <div className="faq-overlay" onClick={() => setShowStreakInfo(false)}><div className="faq-panel streak-info-panel" onClick={(event) => event.stopPropagation()}><div className="faq-heading"><h2>Como funcionam as sequências perfeitas?</h2></div><p>Sequências perfeitas são 5 perguntas respondidas corretamente aqui na parte de Questões Rápidas. Continue sem errar para somar mais sequências e aumentar o seu recorde.</p><p>Provas difíceis e concursos costumam exigir um nível alto de preparo e acertos acima de 90%. Como as Questões Rápidas são pensadas para momentos do dia com pouco tempo, vamos registrar uma sequência de 5 acertos.</p><p><strong>Como funciona:</strong></p><ul><li>Acerte 5 questões seguidas para completar uma sequência perfeita.</li><li>Se errar uma questão antes de completar as 5, a sequência é reiniciada.</li><li>Se sair do app antes de finalizar a sequência, ela também é reiniciada.</li></ul><p><strong>Seu recorde:</strong></p><ul><li>O recorde é contado pela quantidade de sequências perfeitas que você conseguiu acumular em seguida.</li><li>Um número alto não será fácil de alcançar — exige concentração e conhecimento.</li><li>Você pode sair do app assim que atingir uma sequência perfeita se não tiver tempo para responder mais 5 questões.</li></ul><p><strong>Validade do recorde:</strong></p><ul><li>O recorde registrado hoje valerá por 30 dias corridos, excluindo o dia em que o recorde foi atingido.</li><li>Isso porque 30 dias é um tempo comum para nos prepararmos para uma prova.</li><li>Depois desse período, será hora de iniciar um novo recorde!</li></ul><p>Dica: Se não quiser ver a caixa de texto informando sobre erros, acertos e sequências durante as questões, é possível desativar o banner na tela principal, em configurações.</p><Button className="ink-button" onClick={() => setShowStreakInfo(false)}>Entendi</Button></div></div>}</main>; }
  if (screen === "quick" && quickQuestion) { const options = quickOrder.length ? quickOrder.map((id) => quickQuestion.alternatives.find((item) => item.id === id)!).filter(Boolean) : quickQuestion.alternatives; const selected = answers[quickQuestion.sourceExam.questionKey]; const quickSubject = quickSubjectByKey.get(quickQuestion.sourceExam.questionKey) || quickQuestion.subject || "Sem matéria"; const correctPosition = options.findIndex((option) => option.id === quickQuestion.correct); const correctLetter = correctPosition >= 0 ? String.fromCharCode(65 + correctPosition) : "—"; const origin = [quickQuestion.sourceExam.title, quickQuestion.sourceExam.role, quickQuestion.sourceExam.city, quickQuestion.sourceExam.state, quickQuestion.sourceExam.year, quickQuestion.sourceExam.board].filter(Boolean).join(" · "); const quickNextButton = <Button className="ink-button quick-nav-next" onClick={() => { dismissBanner(); selectQuick(quickQuestion.sourceExam.questionKey); }}>Próxima <ArrowRight size={16} /></Button>; const quickBackButton = <Button variant="outline" className="quick-nav-back" onClick={() => { dismissBanner(); setScreen("library"); }}>Voltar</Button>; return <main className={`workspace student-theme-${palette} student-session`}>{banner && <div className={`perfect-banner profile-${bannerProfile} ${banner.completedCount ? "is-perfect" : ""}`}><span className="perfect-banner-phrase">{banner.phrase}</span><span className="perfect-banner-slots">{banner.slots.map((slot, index) => <i key={index}>{banner.emojis[slot]}</i>)}</span>{banner.completedCount ? <span className="perfect-banner-celebrate">{perfectStreakPhrase(banner.completedCount)}</span> : null}</div>}<header className="session-header"><button className="back-link" onClick={() => { dismissBanner(); setScreen("quick-setup"); }}><ArrowLeft size={17} /> Alterar filtro</button><div className="session-title"><span>REVISÃO RÁPIDA</span><strong>{quickQuestion.sourceExam.role}</strong></div></header><div className="session-layout quick-session-layout"><section className="exam-paper quick-paper"><div className="quick-origin"><div><span>ORIGEM DA QUESTÃO</span><strong>{origin || "Prova sem metadados"}</strong></div><b>Questão {quickQuestion.originalNumber || quickQuestion.id}</b></div><div className="question-topline"><Badge className="question-theme-badge" style={{ backgroundColor: "#17324d", color: "#ffffff", border: 0 }}>{quickSubject}</Badge>{quickAnswered && <strong className={`quick-inline-result ${selected === quickQuestion.correct ? "is-correct" : "is-wrong"}`}>{selected === quickQuestion.correct ? "Acertou" : `Errou · correta: ${correctLetter}`}</strong>}</div><h1 ref={questionHeadingRef}>{quickQuestion.text}</h1>{quickQuestion.imageUrl ? <figure className="student-question-image"><img src={quickQuestion.imageUrl} alt={quickQuestion.imageName || `Imagem da questão ${quickQuestion.originalNumber || quickQuestion.id}`} /><figcaption>{quickQuestion.imageName || "Recurso visual da questão"}</figcaption></figure> : null}<div className="alternatives">{options.map((option, index) => { const right = quickAnswered && option.id === quickQuestion.correct; const wrong = quickAnswered && selected === option.id && option.id !== quickQuestion.correct; const displayLetter = String.fromCharCode(65 + index); return <button key={option.id} disabled={quickAnswered || quickRevealing} onClick={() => { if (quickAnswered || quickRevealing) return; const correct = option.id === quickQuestion.correct; setQuickRevealing(true); registerActivity({ qr: 1 }); registerQuickAnswer(correct); setQuickDurations((durations) => [...durations, Math.max(0, (Date.now() - quickStartedAtRef.current) / 1000)]); setAnswers({ [quickQuestion.sourceExam.questionKey]: option.id }); setQuickHistory((history) => { const item = history[quickQuestion.sourceExam.questionKey] || { correct: 0, wrong: 0 }; return { ...history, [quickQuestion.sourceExam.questionKey]: correct ? { ...item, correct: item.correct + 1 } : { ...item, wrong: item.wrong + 1 } }; }); onQuickEvent({ id: `${quickQuestion.sourceExam.questionKey}-${Date.now()}`, questionId: quickQuestion.sourceExam.questionKey, subject: quickSubject, correct, answeredAt: new Date().toISOString() }); window.setTimeout(() => { setQuickAnswered(true); setQuickRevealing(false); }, 300); }} className={`alternative ${right ? "is-correct" : ""} ${wrong ? "is-wrong" : ""} ${quickRevealing ? "is-revealing" : ""}`}>{quickAnswered && (right || wrong) ? <i className="alternative-result-icon">{right ? "✅" : "❌"}</i> : null}<span>{displayLetter}</span><p>{option.text}</p></button>; })}</div><footer className="exam-footer quick-nav-footer">{quickHandMode === "left" ? <>{quickNextButton}{quickBackButton}</> : <>{quickBackButton}{quickNextButton}</>}</footer></section></div></main>; }
  if (screen === "settings") return <main className={`workspace student-theme-${palette} quick-setup-workspace`}><section className="quick-setup-sheet settings-sheet"><button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Voltar ao acervo</button><p className="eyebrow">CONFIGURAÇÕES</p><h1>Ajuste o que o app faz por trás das respostas.</h1><div className="settings-block"><div className="settings-block-heading"><h2>Banner de sequência perfeita</h2><label className="settings-switch"><input type="checkbox" checked={bannerEnabled} onChange={(event) => setBannerEnabled(event.target.checked)} /><span>{bannerEnabled ? "Ativado" : "Desativado"}</span></label></div><p>Aparece por cima da tela após cada resposta na Questão Rápida. Mesmo desativado, a sequência continua sendo contada por dentro (recorde atual: {perfectStreakRecord.contadorAtual}).</p><label>Velocidade<select value={bannerSpeed} onChange={(event) => setBannerSpeed(event.target.value as BannerSpeed)}>{(["rapido", "normal", "lento"] as BannerSpeed[]).map((speed) => <option key={speed} value={speed}>{BANNER_SPEED_LABELS[speed]}</option>)}</select></label><label>Perfil visual<select value={bannerProfile} onChange={(event) => setBannerProfile(event.target.value as BannerProfile)}>{(["classico", "vibrante", "minimalista"] as BannerProfile[]).map((profile) => <option key={profile} value={profile}>{BANNER_PROFILE_LABELS[profile]}</option>)}</select></label></div><div className="settings-block"><div className="settings-block-heading"><h2>Retorno tátil (vibração)</h2><label className="settings-switch"><input type="checkbox" checked={vibrationEnabled} onChange={(event) => setVibrationEnabled(event.target.checked)} /><span>{vibrationEnabled ? "Ativada" : "Desativada"}</span></label></div><p>O celular vibra ao responder Questão Rápida, ao marcar uma alternativa e ao finalizar uma prova.</p><label>Padrão para acerto<select value={acertoVibrationMs} onChange={(event) => setAcertoVibrationMs(Number(event.target.value) as 20 | 30 | 50)}><option value={20}>20 ms</option><option value={30}>30 ms</option><option value={50}>50 ms</option></select></label><label>Padrão para erro<select value={erroVibrationMs} onChange={(event) => setErroVibrationMs(Number(event.target.value) as 80 | 100 | 150)}><option value={80}>80 ms</option><option value={100}>100 ms</option><option value={150}>150 ms</option></select></label></div><div className="settings-block"><div className="settings-block-heading"><h2>Som</h2><label className="settings-switch"><input type="checkbox" checked={soundEnabled} onChange={(event) => setSoundEnabled(event.target.checked)} /><span>{soundEnabled ? "Ativado" : "Desativado"}</span></label></div><p>Pacote ativo: <strong>{soundPackName}</strong></p><label className="button file-action student-import-action"><FileInput size={16} /> Importar pacote de sons (.zip)<input type="file" accept=".zip,application/zip" onChange={importSoundPack} /></label><small className="settings-hint">O .zip deve conter arquivos chamados acerto, erro, fim, sequencia e/ou conquista (mp3, wav, ogg ou m4a). "Fim" toca ao terminar prova, formulário ou quiz; "sequencia" toca a cada sequência perfeita completa; "conquista" toca ao ganhar uma medalha nova. A importação substitui o pacote anterior por inteiro; não é possível remover um som sozinho, só desativar tudo na chave acima.</small></div><div className="settings-block"><div className="settings-block-heading"><h2>Temas importados</h2><label className="button file-action student-import-action"><FileInput size={16} /> Importar tema (.zip)<input type="file" accept=".zip,application/zip" onChange={importCustomTheme} /></label></div><p>O tema nativo (Caderno, Atlas, Vigília) continua disponível na tela inicial. Um tema importado funciona como um 4º tema completo, com paleta(s) própria(s) e, se o .zip trouxer uma imagem, um fundo repetido sutil.</p>{customThemes.length ? <ul className="settings-theme-list">{customThemes.map((item) => <li key={item.id}><span className="settings-theme-swatch" style={{ background: item.palettes[0].cores.fundo, borderColor: item.palettes[0].cores.linha }}><i style={{ background: item.palettes[0].cores.destaque }} /></span><strong>{item.nome}<small className="settings-theme-meta">{item.palettes.length} paleta(s){item.backgroundImage ? " · com fundo" : ""}</small></strong>{activeCustomThemeId === item.id ? <span className="settings-theme-active-tag">Em uso</span> : <Button variant="outline" onClick={() => chooseCustomTheme(item)}>Usar</Button>}<Button variant="outline" className="danger-button" onClick={() => deleteCustomTheme(item.id)}><Trash2 size={15} /></Button></li>)}</ul> : <small className="settings-hint">Nenhum tema importado ainda. O .zip precisa de um tema.json com "nome", uma lista "palettes" (cada uma com "nome" e 8 cores em hexadecimal: fundo, superficie, texto, textoSuave, linha, destaque, textoDestaque, fundoSuave) e, opcionalmente, uma imagem (.png/.jpg/.webp) pro fundo repetido.</small>}</div></section></main>;
  if (screen === "formulario" && activeExam?.kind === "formulario") {
    if (formStep === "done") return <main className={`workspace student-theme-${palette} quick-setup-workspace`}><section className="quiz-question-sheet"><p className="eyebrow">OBRIGADO</p><h1>Resposta registrada.</h1><p>Responder novamente este formulário?</p><div className="quiz-nav"><Button className="ink-button" onClick={() => startForm(activeExam.id)}>Sim, responder</Button><Button variant="outline" onClick={() => setScreen("library")}>Não, retornar</Button></div></section></main>;
    if (formStep === "identify") return <main className={`workspace student-theme-${palette} quick-setup-workspace`}><section className="quiz-question-sheet"><button className="back-link" onClick={() => setFormStep("questions")}><ArrowLeft size={17} /> Voltar às perguntas</button><p className="eyebrow">ÚLTIMA ETAPA</p><h1>Como você quer ser identificado?</h1><input value={formRespondentName} onChange={(event) => setFormRespondentName(event.target.value)} placeholder="Seu nome" /><div className="quiz-nav"><Button className="ink-button" disabled={!formRespondentName.trim()} onClick={() => submitForm(formRespondentName)}>Confirmar</Button>{activeExam.formAnonimo && <Button variant="outline" onClick={() => submitForm("Anônimo")}>Resposta anônima</Button>}</div></section></main>;
    const question = activeExam.questions[formIndex];
    const isLast = formIndex === activeExam.questions.length - 1;
    const chosen = formChoices[question.id] || "";
    const isMultipla = question.type === "multipla";
    const selectedCount = chosen.length;
    const minOk = question.minSelect === undefined || selectedCount >= question.minSelect;
    const maxReached = question.maxSelect !== undefined && selectedCount >= question.maxSelect;
    const hasDissertativa = question.alternatives.some((option) => option.kind === "discursiva");
    const canAdvance = minOk || hasDissertativa;
    const toggleFormAlternative = (optionId: string) => {
      setFormChoices((values) => {
        const current = values[question.id] || "";
        if (!isMultipla) return { ...values, [question.id]: current === optionId ? "" : optionId };
        if (current.includes(optionId)) return { ...values, [question.id]: current.split("").filter((id) => id !== optionId).join("") };
        if (question.maxSelect !== undefined && current.length >= question.maxSelect) return values;
        return { ...values, [question.id]: [...current.split(""), optionId].sort().join("") };
      });
    };
    return <main className={`workspace student-theme-${palette} student-session`}><header className="session-header"><button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Sair do formulário</button><div className="session-title"><span>{activeExam.title}</span></div></header>
      <section className="quiz-question"><p className="eyebrow">PERGUNTA {formIndex + 1} DE {activeExam.questions.length}{question.minSelect || question.maxSelect ? ` · escolha ${question.minSelect === question.maxSelect ? `exatamente ${question.minSelect}` : question.maxSelect ? `até ${question.maxSelect}` : `ao menos ${question.minSelect}`}` : ""}</p><h2>{question.text}</h2><div className="alternatives">{question.alternatives.map((option) => {
        if (option.kind === "discursiva") return <div key={option.id} className="alternative-discursiva"><span>{String.fromCharCode(65 + altIndex)}</span><textarea placeholder={option.placeholder || "Escreva sua resposta..."} maxLength={option.maxLength} value={formTexts[`${question.id}:${option.id}`] || ""} onChange={(event) => setFormTexts((values) => ({ ...values, [`${question.id}:${option.id}`]: event.target.value }))} /></div>;
        const isSelected = chosen.includes(option.id);
        const disabled = isMultipla && !isSelected && maxReached;
        return <button key={option.id} disabled={disabled} className={`alternative ${isSelected ? "is-selected" : ""}`} onClick={() => toggleFormAlternative(option.id)}><span>{String.fromCharCode(65 + altIndex)}</span><p>{option.text}</p></button>;
      })}</div>
      <div className="quiz-nav">{formIndex > 0 && <Button variant="outline" onClick={() => setFormIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={16} /> Anterior</Button>}<Button className="ink-button" disabled={!canAdvance} onClick={() => { if (isLast) setFormStep("identify"); else setFormIndex((index) => index + 1); }}>{isLast ? "Concluir" : "Próxima"} <ArrowRight size={16} /></Button></div></section>
    </main>;
  }
  if (screen === "form-stats" && activeExam?.kind === "formulario") {
    const responses = formResponses[activeExam.id] || [];
    const respondentNames = Array.from(new Set(responses.map((response) => response.respondent)));
    const singleResponse = formStatsFilter ? responses.find((response) => response.id === formStatsFilter) : null;
    const scopedResponses = singleResponse ? [singleResponse] : responses;
    return <main className={`workspace student-theme-${palette} quick-setup-workspace`}><section className="quiz-question-sheet form-stats-sheet"><button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Voltar ao acervo</button><p className="eyebrow">ESTATÍSTICAS</p><h1>{activeExam.title}</h1><p>{responses.length} resposta(s) registrada(s) neste aparelho.</p>{respondentNames.length > 0 && <label className="form-stats-filter">Ver resposta de<select value={formStatsFilter} onChange={(event) => setFormStatsFilter(event.target.value)}><option value="">Todos (agregado)</option>{responses.map((response) => <option key={response.id} value={response.id}>{response.respondent} — {new Date(response.completedAt).toLocaleDateString("pt-BR")}</option>)}</select></label>}{activeExam.questions.map((question) => <div key={question.id} className="form-stats-question"><h3>{question.text}</h3>{question.alternatives.map((option) => {
      if (option.kind === "discursiva") { const texts = scopedResponses.map((response) => response.texts[`${question.id}:${option.id}`]).filter((value) => value && value.trim()); return <div key={option.id} className="form-stats-dissertativa"><strong>{singleResponse ? "Resposta escrita" : `Respostas escritas (${texts.length})`}</strong>{texts.length ? <ul>{texts.map((text, index) => <li key={index}>{text}</li>)}</ul> : <p>Nenhuma resposta escrita ainda.</p>}</div>; }
      const count = scopedResponses.filter((response) => (response.choices[question.id] || "").includes(option.id)).length;
      const pct = scopedResponses.length ? Math.round((count / scopedResponses.length) * 100) : 0;
      return singleResponse ? <div key={option.id} className={`form-stats-choice-row ${count ? "is-chosen" : ""}`}><span>{option.id}. {option.text}</span>{count ? <span className="form-stats-chosen-tag">Marcada</span> : null}</div> : <div key={option.id} className="form-stats-bar-row"><span>{option.id}. {option.text}</span><div className="form-stats-bar"><span style={{ width: `${pct}%` }} /></div><small>{count} ({pct}%)</small></div>;
    })}</div>)}</section></main>;
  }
  if (screen === "quiz" && activeExam?.kind === "quiz") {
    const orderedQuizQuestions = quizQuestionOrder.length ? quizQuestionOrder.map((id) => activeExam.questions.find((item) => item.id === id)).filter((item): item is Question => Boolean(item)) : activeExam.questions;
    const question = orderedQuizQuestions[quizIndex];
    const isLast = quizIndex === orderedQuizQuestions.length - 1;
    const chosen = quizAnswers[question.id] || "";
    const isMultipla = question.type === "multipla";
    const alternativeIds = quizAlternativeOrder[question.id];
    const orderedAlternatives = alternativeIds?.length ? alternativeIds.map((id) => question.alternatives.find((alt) => alt.id === id)).filter((alt): alt is Question["alternatives"][number] => Boolean(alt)) : question.alternatives;
    const canAdvance = chosen.length > 0;
    const selectAlternative = (optionId: string) => {
      if (vibrationEnabled) vibrate(15);
      setQuizAnswers((values) => {
        if (!isMultipla) return { ...values, [question.id]: optionId };
        // CORREÇÃO: usa vírgula como separador para suportar IDs multi-caractere (A01, A02...)
        const current = values[question.id] || "";
        const currentIds = current ? current.split(",").filter(Boolean) : [];
        const next = currentIds.includes(optionId) ? currentIds.filter((id) => id !== optionId) : [...currentIds, optionId];
        return { ...values, [question.id]: next.join(",") };
      });
    };
    return <main className={`workspace student-theme-${palette} student-session`}><header className="session-header"><button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Sair do quiz</button><div className="session-title"><span>{activeExam.title}</span></div></header>
      <section className="quiz-question"><p className="eyebrow">PERGUNTA {quizIndex + 1} DE {orderedQuizQuestions.length}</p><h2>{question.text}</h2><div className="alternatives">{orderedAlternatives.map((option, altIndex) => <button key={option.id} className={`alternative ${(isMultipla ? chosen.split(",").includes(option.id) : chosen === option.id) ? "is-selected" : ""}`} onClick={() => selectAlternative(option.id)}><span>{String.fromCharCode(65 + altIndex)}</span><p>{option.text}</p></button>)}</div>
      <div className="quiz-nav">{quizIndex > 0 && <Button variant="outline" onClick={() => setQuizIndex((index) => Math.max(0, index - 1))}><ArrowLeft size={16} /> Anterior</Button>}<Button className="ink-button quiz-nav-next" disabled={!canAdvance} onClick={() => { if (isLast) finishQuiz(); else setQuizIndex((index) => index + 1); }}>{isLast ? "Ver resultado" : "Próxima"} <ArrowRight size={16} /></Button></div><QuestionShortcutButton question={question} kind="quiz" /></section>
    </main>;
  }
  if (screen === "summary" && summaryAttempt) {
    if (activeExam?.kind === "quiz" && summaryAttempt.quizResultIds) {
      const winners = (activeExam.quizFinais || []).filter((item) => summaryAttempt.quizResultIds?.includes(item.id));
      const secondPlaceFinal = summaryAttempt.quizSecondPlaceId ? (activeExam.quizFinais || []).find((item) => item.id === summaryAttempt.quizSecondPlaceId) : null;
      return <main className={`workspace student-theme-${palette} quick-setup-workspace`}><section className="quiz-question-sheet"><button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Voltar ao acervo</button><p className="eyebrow">RESULTADO</p><h1>{activeExam.title}</h1>{winners.map((winner) => <div key={winner.id} className="quiz-result-card"><h2>{winner.titulo}</h2>{typeof summaryAttempt.quizAffinity === "number" && winners.length === 1 && <p className="quiz-affinity">{summaryAttempt.quizAffinity}% de afinidade</p>}{typeof summaryAttempt.quizAffinity === "number" && winners.length === 1 && <p className="quiz-affinity-tier">{quizAffinityTierText(winner.titulo, summaryAttempt.quizAffinity)}</p>}<p>{winner.texto}</p></div>)}{winners.length > 1 && <p className="quiz-tie-note">Empate entre {winners.length} resultados.</p>}{secondPlaceFinal && <div className="quiz-second-place"><span>2º lugar: {secondPlaceFinal.titulo} ({summaryAttempt.quizSecondPlacePct}%)</span></div>}<div className="quiz-result-actions"><Button variant="outline" onClick={() => setScreen("library")}>Início</Button><Button className="ink-button" onClick={() => startQuiz(activeExam.id)}><Play size={16} /> Refazer</Button></div></section></main>;
    }
    const results = summaryAttempt.questionResults || [];
    const validResults = results.filter((item) => item.status !== "ungraded");
    const correctCount = validResults.filter((item) => item.status === "correct").length;
    const wrongCount = validResults.filter((item) => item.status === "wrong").length;
    const blankCount = validResults.filter((item) => item.status === "blank").length;
    const allExamAttempts = [...attempts, summaryAttempt].filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index);
    const bestAttempt = [...allExamAttempts.filter((item) => item.examId === summaryAttempt.examId)].sort((first, second) => second.score - first.score || first.durationSeconds - second.durationSeconds)[0] || summaryAttempt;
    const subjectSummary = summaryAttempt.subjectSummary || (results.length ? buildSubjectSummary(results, summaryAttempt.subjectDurations || {}) : {});
    const statusLabel = { correct: "Acertou", wrong: "Errou", blank: "Em branco", ungraded: "Sem gabarito" } as const;
    return <main className={`workspace student-theme-${palette} student-summary-workspace`}><section className="student-summary-hero"><button className="back-link" onClick={() => { setSummaryAttempt(null); setScreen("library"); }}><ArrowLeft size={17} /> Voltar ao acervo</button><p className="eyebrow">RESUMO DA PROVA</p><h1>{activeExam?.role || "Prova concluída"}</h1><p>{activeExam ? `${activeExam.city} · ${activeExam.year}` : "Tentativa concluída"} · {formatCompletedAt(summaryAttempt.completedAt)}</p></section><section className="student-summary-verdicts"><div className="student-summary-heading"><div><p className="eyebrow">VEREDICTOS</p><h2>Quatro formas de olhar para o mesmo resultado.</h2></div></div>{summaryAttempt.scores ? <div className="student-verdict-grid"><article><span>PONTUAÇÃO SIMPLES</span><strong>{summaryAttempt.scores.simples}</strong><small>de {summaryAttempt.scores.simplesMax} pontos possíveis</small></article><article><span>PONTUAÇÃO PERCENTUAL</span><strong>{summaryAttempt.scores.percentual}%</strong><small>acertos sobre o total de questões com gabarito</small></article><article><span>TRI SIMPLIFICADA</span><strong>{summaryAttempt.triSimplificada ?? chr(8212)}</strong><small>{summaryAttempt.triPercentual ?? 0}% - escala 0-1000</small></article><article><span>CERTO OU ERRADO</span><strong>{summaryAttempt.scores.certoErrado}</strong><small>errar retira o que a questão valia</small></article></div> : <p className="student-summary-empty">Esta tentativa foi salva antes dos quatro veredictos. As próximas provas mostrarão todos os resultados.</p>}</section><section className="student-summary-scoreboard"><Card className="student-summary-score"><CardContent className="p-0"><span>NOTA DA TENTATIVA</span><strong>{summaryAttempt.score}%</strong><small>{correctCount} acertos em {validResults.length} questões com gabarito</small></CardContent></Card><Card className="student-summary-best"><CardContent className="p-0"><span>MELHOR TENTATIVA</span><strong>{bestAttempt.score}%</strong><small>{formatDuration(bestAttempt.durationSeconds)} · {bestAttempt.id === summaryAttempt.id ? "tentativa atual" : formatCompletedAt(bestAttempt.completedAt)}</small></CardContent></Card><Card className="student-summary-time"><CardContent className="p-0"><span>TEMPO TOTAL</span><strong>{formatDuration(summaryAttempt.durationSeconds)}</strong><small>tempo contínuo da prova</small></CardContent></Card></section><section className="student-summary-counts"><div><span>ACERTOU</span><strong>{correctCount}</strong></div><div><span>ERROU</span><strong>{wrongCount}</strong></div><div><span>NÃO RESPONDEU</span><strong>{blankCount}</strong></div><div><span>SEM GABARITO</span><strong>{results.filter((item) => item.status === "ungraded").length}</strong></div></section><section className="student-summary-section"><div className="student-summary-heading"><div><p className="eyebrow">DESEMPENHO POR TEMA</p><h2>Nota média e tempo médio de resposta.</h2></div><span>O tempo médio considera somente visitas acima de 5 segundos e abaixo de 5 minutos.</span></div>{Object.keys(subjectSummary).length ? <div className="student-subject-summary">{Object.entries(subjectSummary).map(([subject, item]) => <article key={subject}><h3>{subject}</h3><div><span>NOTA MÉDIA</span><strong>{item.score}%</strong></div><p>{item.correct} acerto(s) · {item.wrong} erro(s) · {item.blank} em branco</p><small>{item.averageDurationSeconds === null ? "Sem tempo elegível" : `Tempo médio por questão: ${formatDuration(item.averageDurationSeconds)}`}</small></article>)}</div> : <p className="student-summary-empty">Esta tentativa foi salva antes do detalhamento por tema. As próximas provas exibirão a análise completa.</p>}</section><section className="student-summary-section student-question-summary"><div className="student-summary-heading"><div><p className="eyebrow">QUESTÃO POR QUESTÃO</p><h2>Resultado e tempo total em cada questão.</h2></div></div>{results.length ? <div className="student-question-results student-question-results-2col">{results.map((item) => <article key={`${summaryAttempt.id}-${item.questionId}`} className={`is-${item.status}`}><div><span>QUESTÃO {item.originalNumber}</span><strong>{item.subject}</strong></div><Badge className={item.status === "correct" ? "success-badge" : item.status === "blank" ? "blank-badge" : item.status === "ungraded" ? "blank-badge" : "error-badge"}>{statusLabel[item.status]}</Badge><time>{formatDuration(item.durationSeconds)}</time></article>)}</div> : <p className="student-summary-empty">O detalhamento por questão começa a ser armazenado a partir desta atualização.</p>}</section><div className="student-summary-actions"><Button variant="outline" onClick={() => { setSummaryAttempt(null); setScreen("library"); }}><ArrowLeft size={16} /> Seleção de provas</Button><Button className="ink-button" onClick={() => startExam(summaryAttempt.examId)}><RotateCcw size={16} /> Nova tentativa</Button></div></main>;
  }

  // ===== Tela de filtros de PROVA (update4.txt §Tela inicial — Prova aleatória) =====
  if (screen === "prova-filters") {
    const provasNoAcervo = studyExams.filter((e) => (e.kind || "prova") === "prova");
    const bancas = Array.from(new Set(provasNoAcervo.map((e) => e.board || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const cargos = Array.from(new Set(provasNoAcervo.map((e) => e.role || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const anos = Array.from(new Set(provasNoAcervo.map((e) => e.year || "").filter(Boolean))).sort((a, b) => b.localeCompare(a));
    const completedExamIds = new Set(perfHistory.filter((r) => r.examKind === "prova").map((r) => r.examId));
    const completedBelow90 = new Set(perfHistory.filter((r) => r.examKind === "prova" && r.score < 90).map((r) => r.examId));
    const ineditasCount = provasNoAcervo.filter((e) => !completedExamIds.has(e.id)).length;
    const concluidasCount = provasNoAcervo.filter((e) => completedExamIds.has(e.id)).length;
    const abaixo90Count = provasNoAcervo.filter((e) => completedBelow90.has(e.id)).length;
    const filteredProvas = provasNoAcervo.filter((e) => {
      if (provaFilterBancas.length && !provaFilterBancas.includes(e.board || "")) return false;
      if (provaFilterCargos.length && !provaFilterCargos.includes(e.role || "")) return false;
      if (provaFilterAnos.length && !provaFilterAnos.includes(e.year || "")) return false;
      if (provaFilterStatus === "ineditas" && completedExamIds.has(e.id)) return false;
      if (provaFilterStatus === "concluidas" && !completedExamIds.has(e.id)) return false;
      if (provaFilterStatus === "abaixo90" && !completedBelow90.has(e.id)) return false;
      return true;
    });
    const startRandomProva = () => {
      if (!filteredProvas.length) { toast.error("Nenhuma prova atende aos filtros", { description: "Ajuste os filtros ou importe novas provas." }); return; }
      const chosen = filteredProvas[Math.floor(Math.random() * filteredProvas.length)];
      startExam(chosen.id);
    };
    const last20 = lastNProvas(20);
    const monthCounts = countProvasByMonth();
    const bw = bestAndWorstSubjects();
    // SVG do gráfico de linhas (percentual 0-100 + TRI 0-1000)
    const chartWidth = 320;
    const chartHeight = 120;
    const maxIdx = Math.max(last20.length - 1, 1);
    const scorePoints = last20.map((r, i) => `${(i / maxIdx) * chartWidth},${chartHeight - (r.score / 100) * chartHeight}`).join(" ");
    const triPoints = last20.map((r, i) => `${(i / maxIdx) * chartWidth},${chartHeight - ((r.triSimplificada || 0) / 1000) * chartHeight}`).join(" ");
    return <main className={`workspace student-theme-${palette} quick-setup-workspace`}>
      <section className="quick-setup-sheet">
        <button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Voltar ao acervo</button>
        <p className="eyebrow">PROVA ALEATÓRIA</p>
        <h1>Inicie uma prova que atende aos seus filtros.</h1>
        <p>Escolha bancas, cargos, anos e status. O botão abaixo sorteia uma prova do acervo que atenda a todos os critérios.</p>
        <div className="prova-random-cta"><span>Prova aleatória</span><Button className="lime-button" onClick={startRandomProva}><Play size={16} /> Começar uma prova</Button></div>

        <section className="prova-chart-section">
          <p className="eyebrow">RESULTADO DAS ÚLTIMAS PROVAS</p>
          {last20.length > 0 ? (
            <svg className="prova-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label="Gráfico de linhas das últimas 20 provas">
              <polyline points={scorePoints} fill="none" stroke="#17324d" strokeWidth="2" />
              <polyline points={triPoints} fill="none" stroke="#b9e34d" strokeWidth="2" strokeDasharray="3,2" />
            </svg>
          ) : <p className="prova-chart-empty">Nenhuma prova concluída ainda. O gráfico aparece após a primeira finalização.</p>}
          <div className="prova-chart-legend"><span style={{ color: "#17324d" }}>━ Percentual de acertos (0-100%)</span><span style={{ color: "#5a7a2a" }}>┄ TRI simplificada (0-1000)</span></div>
        </section>

        {bancas.length >= 2 && <div className="prova-filter-row"><span className="prova-filter-label">Bancas</span><div className="prova-filter-buttons"><button className={!provaFilterBancas.length ? "is-active" : ""} onClick={() => setProvaFilterBancas([])}>Todas as bancas</button>{bancas.map((b) => <button key={b} className={provaFilterBancas.includes(b) ? "is-active" : ""} onClick={() => setProvaFilterBancas((v) => v.includes(b) ? v.filter((x) => x !== b) : [...v, b])}>{b}</button>)}</div></div>}
        {cargos.length >= 2 && <div className="prova-filter-row"><span className="prova-filter-label">Cargos</span><div className="prova-filter-buttons"><button className={!provaFilterCargos.length ? "is-active" : ""} onClick={() => setProvaFilterCargos([])}>Todos os cargos</button>{cargos.map((c) => <button key={c} className={provaFilterCargos.includes(c) ? "is-active" : ""} onClick={() => setProvaFilterCargos((v) => v.includes(c) ? v.filter((x) => x !== c) : [...v, c])}>{c}</button>)}</div></div>}
        {anos.length >= 2 && <div className="prova-filter-row"><span className="prova-filter-label">Anos</span><div className="prova-filter-buttons"><button className={!provaFilterAnos.length ? "is-active" : ""} onClick={() => setProvaFilterAnos([])}>Todos os anos</button>{anos.map((a) => <button key={a} className={provaFilterAnos.includes(a) ? "is-active" : ""} onClick={() => setProvaFilterAnos((v) => v.includes(a) ? v.filter((x) => x !== a) : [...v, a])}>{a}</button>)}</div></div>}
        <div className="prova-filter-row"><span className="prova-filter-label">Status</span><div className="prova-filter-buttons"><button disabled={ineditasCount === 0} className={provaFilterStatus === "ineditas" ? "is-active" : ""} onClick={() => setProvaFilterStatus(provaFilterStatus === "ineditas" ? null : "ineditas")}>Inéditas ({ineditasCount})</button><button disabled={concluidasCount === 0} className={provaFilterStatus === "concluidas" ? "is-active" : ""} onClick={() => setProvaFilterStatus(provaFilterStatus === "concluidas" ? null : "concluidas")}>Concluídas ({concluidasCount})</button><button disabled={abaixo90Count === 0} className={provaFilterStatus === "abaixo90" ? "is-active" : ""} onClick={() => setProvaFilterStatus(provaFilterStatus === "abaixo90" ? null : "abaixo90")}>Acerto &lt;90% ({abaixo90Count})</button></div></div>

        <section className="prova-monthly-counts">
          <p className="eyebrow">PROVAS CONCLUÍDAS</p>
          <p className="prova-counts-text">Nesse mês: <strong>{String(monthCounts.thisMonth).padStart(2, "0")}</strong> · Mês anterior: <strong>{String(monthCounts.lastMonth).padStart(2, "0")}</strong></p>
        </section>

        {bw.best && bw.worst && <section className="prova-subject-cards">
          <div className="prova-subject-card">
            <span className="eyebrow">MELHOR MATÉRIA</span>
            <strong>{bw.best.subject}</strong>
            <p>Acertos: {bw.best.correct}</p>
            <p>Percentual: {bw.best.score}%</p>
            <p>Tempo médio: {formatDuration(bw.best.avgDuration)}</p>
          </div>
          <div className="prova-subject-card prova-subject-worst">
            <span className="eyebrow">MAIS DIFICULDADE</span>
            <strong>{bw.worst.subject}</strong>
            <p>Acertos: {bw.worst.correct}</p>
            <p>Percentual: {bw.worst.score}%</p>
            <p>Tempo médio: {formatDuration(bw.worst.avgDuration)}</p>
          </div>
        </section>}

        <Button variant="outline" className="prova-reset-btn" onClick={() => { if (window.confirm("Reiniciar acompanhamento? Todas as estatísticas de performance serão apagadas (as provas permanecem no acervo).")) { clearPerformanceHistory(); setPerfHistory([]); toast.success("Acompanhamento reiniciado"); } }}><RotateCcw size={16} /> Reiniciar acompanhamento</Button>

        <div className="prova-random-cta"><span>Prova aleatória</span><Button className="lime-button" onClick={startRandomProva}><Play size={16} /> Começar uma prova</Button></div>
      </section>
    </main>;
  }

  // ===== Tela de filtros de QUIZ (update4.txt §Tela inicial — Hora do quiz) =====
  if (screen === "quiz-setup") {
    const quizzes = studyExams.filter((e) => e.kind === "quiz");
    const tematicas = Array.from(new Set(quizzes.map((e) => e.booklet || "").filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const filteredQuizzes = quizzes.filter((e) => !quizFilterTematicas.length || quizFilterTematicas.includes(e.booklet || ""));
    const startRandomQuiz = () => {
      if (!filteredQuizzes.length) { toast.error("Nenhum quiz atende aos filtros", { description: "Ajuste os filtros ou importe novos quizzes." }); return; }
      const chosen = filteredQuizzes[Math.floor(Math.random() * filteredQuizzes.length)];
      startQuiz(chosen.id);
    };
    const quizResults = lastQuizResults(10);
    return <main className={`workspace student-theme-${palette} quick-setup-workspace`}>
      <section className="quick-setup-sheet">
        <button className="back-link" onClick={() => setScreen("library")}><ArrowLeft size={17} /> Voltar ao acervo</button>
        <p className="eyebrow">QUIZ ALEATÓRIO</p>
        <h1>Inicie um quiz que atende aos seus filtros.</h1>
        <div className="prova-random-cta"><span>Quiz aleatório</span><Button className="lime-button" onClick={startRandomQuiz}><Play size={16} /> Começar um quiz</Button></div>

        {tematicas.length >= 2 && <div className="prova-filter-row"><span className="prova-filter-label">Temáticas</span><div className="prova-filter-buttons"><button className={!quizFilterTematicas.length ? "is-active" : ""} onClick={() => setQuizFilterTematicas([])}>Todas as temáticas</button>{tematicas.map((t) => <button key={t} className={quizFilterTematicas.includes(t) ? "is-active" : ""} onClick={() => setQuizFilterTematicas((v) => v.includes(t) ? v.filter((x) => x !== t) : [...v, t])}>{t}</button>)}</div></div>}

        {quizResults.length > 0 && <section className="quiz-history-grid">
          <p className="eyebrow">QUIZ CONCLUÍDOS</p>
          <div className="quiz-history-cards">
            {quizResults.map((r) => {
              const examExists = studyExams.some((e) => e.id === r.examId);
              const winnerTitle = r.quizResultTitles?.[0] || "—";
              return <button key={r.attemptId} className="quiz-history-card" disabled={!examExists} onClick={() => { setQuizDetailAttemptId(r.attemptId); setScreen("quiz-result-detail"); }}>
                <strong>{r.examTitle}</strong>
                <span>{r.quizAffinity || 0}% de afinidade</span>
                <small>{winnerTitle}{!examExists ? " · indisponível" : ""}</small>
              </button>;
            })}
          </div>
        </section>}

        <div className="prova-random-cta"><span>Quiz aleatório</span><Button className="lime-button" onClick={startRandomQuiz}><Play size={16} /> Começar um quiz</Button></div>
      </section>
    </main>;
  }

  // ===== Tela de detalhe do final do quiz (update4.txt) =====
  if (screen === "quiz-result-detail" && quizDetailAttemptId) {
    const record = perfHistory.find((r) => r.attemptId === quizDetailAttemptId);
    if (!record) { setScreen("quiz-setup"); return null; }
    const examExists = studyExams.some((e) => e.id === record.examId);
    const exam = studyExams.find((e) => e.id === record.examId);
    const winnerFinal = exam?.quizFinais?.find((f) => record.quizResultIds?.includes(f.id));
    const secondFinal = record.quizSecondPlaceId ? exam?.quizFinais?.find((f) => f.id === record.quizSecondPlaceId) : null;
    return <main className={`workspace student-theme-${palette} quick-setup-workspace`}>
      <section className="quiz-question-sheet">
        <div className="quiz-detail-actions"><Button variant="outline" onClick={() => setScreen("quiz-setup")}><ArrowLeft size={16} /> Voltar</Button><Button className="ink-button" disabled={!examExists} onClick={() => { if (examExists) startQuiz(record.examId); }}><RotateCcw size={16} /> Refazer quiz</Button></div>
        <p className="eyebrow">RESULTADO DO QUIZ</p>
        <h1>{winnerFinal?.titulo || record.quizResultTitles?.[0] || record.examTitle}</h1>
        <p className="quiz-affinity">{record.quizAffinity || 0}% de afinidade</p>
        <p className="quiz-detail-intro">Você é uma mistura única...</p>
        {winnerFinal && <p className="quiz-detail-text">{winnerFinal.texto}</p>}
        {secondFinal && <div className="quiz-detail-second"><span>2º Lugar: {record.quizSecondPlacePct || 0}% de afinidade</span><strong>{secondFinal.titulo}</strong></div>}
        <div className="quiz-detail-actions"><Button variant="outline" onClick={() => setScreen("quiz-setup")}><ArrowLeft size={16} /> Voltar</Button><Button className="ink-button" disabled={!examExists} onClick={() => { if (examExists) startQuiz(record.examId); }}><RotateCcw size={16} /> Refazer quiz</Button></div>
      </section>
    </main>;
  }

  if (screen === "exam" || screen === "exam-closed") {
    const question = questions[examIndex];
    if (!question) { setScreen("library"); return null; }
    const isOpen = screen === "exam";
    const options = (attemptOrder[question.id] || question.alternatives.map((item) => item.id)).map((id) => question.alternatives.find((item) => item.id === id)!).filter(Boolean);
    const answerCount = Object.keys(answers).length;
    return <main className={`workspace student-theme-${palette} student-session exam-attempt ${isOpen ? "is-open" : "is-closed"}`}>
      <header className="session-header">
        <button className="back-link" onClick={finishExam}><ArrowLeft size={17} /> Finalizar e voltar</button>
        <div className="session-title"><span>{isOpen ? "PROVA ABERTA" : "PROVA FECHADA"}</span><strong>{activeExam.role} · {activeExam.city}</strong></div>
        <div className="attempt-timer"><Clock3 size={16} /><span>{formatDuration(elapsedSeconds)}</span></div>
      </header>
      <div className="attempt-status"><span>{answerCount}/{questions.length} respondidas</span><span>{questions.length - answerCount} em branco</span><span>{isOpen ? "Caderno aberto" : examStartedAt ? "Cronômetro geral em andamento" : "Cronômetro ainda não iniciado"}</span><Button className="finish-fixed" onClick={finishExam}>Finalizar prova</Button></div>
      <div className="session-layout">
        <aside className="question-rail"><p>QUESTÕES</p><div className="question-dots">{questions.map((item, index) => <button key={item.id} className={`${index === examIndex ? "is-current" : ""} ${answers[item.id] ? "is-answered" : "is-blank"}`} onClick={() => { if (isOpen) changeQuestion(index); else setExamIndex(index); }}>{item.originalNumber || index + 1}</button>)}</div><div className="rail-legend"><span><i className="legend-current" /> atual</span><span><i className="legend-answered" /> respondida</span><span><i className="legend-blank" /> em branco</span></div></aside>
        {isOpen ? <section className="exam-paper"><div className="question-topline"><Badge className="question-theme-badge" style={{ backgroundColor: "#17324d", color: "#ffffff", border: 0 }}>{question.subject || "Sem matéria"}</Badge><span>Questão {question.originalNumber || examIndex + 1}</span></div>{question.baseText && <aside className="student-base-text"><strong>Texto-base</strong><p>{question.baseText}</p></aside>}<h1 ref={questionHeadingRef}>{question.text}</h1>{question.imageUrl ? <figure className="student-question-image"><img src={question.imageUrl} alt={question.imageName || `Imagem da questão ${question.originalNumber || examIndex + 1}`} /><figcaption>{question.imageName || "Recurso visual da questão"}</figcaption></figure> : null}<div className="alternatives">{question.type === "discursiva" ? (() => { const slot = question.alternatives.find((item) => item.kind === "discursiva"); return <textarea className="discursiva-answer" maxLength={slot?.maxLength} placeholder={slot?.placeholder || "Escreva sua resposta..."} value={answers[question.id] || ""} onChange={(event) => { registerExamAction(); setAnswers((values) => ({ ...values, [question.id]: event.target.value })); }} />; })() : options.map((option, altIndex) => { if (option.kind === "discursiva") { const chosen = question.type === "multipla" ? (answers[question.id] || "").split(",").includes(option.id) : answers[question.id] === option.id; return <div key={option.id} className={`alternative alternative-discursiva ${chosen ? "is-selected" : ""}`}><span>{String.fromCharCode(65 + altIndex)}</span><textarea placeholder={option.placeholder || "Escreva sua resposta..."} maxLength={option.maxLength} value={mixedDiscursiveText[question.id] || ""} onFocus={() => { registerExamAction(); if (question.type === "multipla") { setAnswers((values) => { const current = values[question.id] || ""; return current.includes(option.id) ? values : { ...values, [question.id]: [...current.split(""), option.id].sort().join("") }; }); } else { setAnswers((values) => ({ ...values, [question.id]: option.id })); } }} onChange={(event) => setMixedDiscursiveText((values) => ({ ...values, [question.id]: event.target.value }))} /></div>; } const selected = question.type === "multipla" ? (answers[question.id] || "").split(",").includes(option.id) : answers[question.id] === option.id; return <button key={option.id} onClick={() => { registerExamAction(); if (vibrationEnabled) vibrate(15); if (question.type === "multipla") { setAnswers((values) => { const current = values[question.id] || ""; const next = current.includes(option.id) ? current.split("").filter((id) => id !== option.id).join("") : [...current.split(""), option.id].sort().join(""); return { ...values, [question.id]: next }; }); } else { setAnswers((values) => ({ ...values, [question.id]: option.id })); } }} className={`alternative ${selected ? "is-selected" : ""}`}><span>{String.fromCharCode(65 + altIndex)}</span><p>{option.text}</p></button>; })}</div><footer className="exam-footer"><Button variant="outline" disabled={examIndex === 0} onClick={() => changeQuestion(examIndex - 1)}><ArrowLeft size={16} /> Anterior</Button><Button variant="outline" onClick={() => closeExam(false)}>Fechar caderno</Button>{examIndex === questions.length - 1 ? <Button className="ink-button" onClick={finishExam}>Finalizar prova <ChevronRight size={16} /></Button> : <Button className="ink-button" onClick={() => changeQuestion(examIndex + 1)}>Próxima <ArrowRight size={16} /></Button>}</footer><QuestionShortcutButton question={question} kind="prova" /></section> : <section className="exam-paper exam-closed-sheet"><div><p className="eyebrow">{autoClosed ? "INATIVIDADE DETECTADA" : "PRONTA PARA COMEÇAR"}</p><h1>{autoClosed ? "O caderno foi fechado após cinco minutos sem ação." : examStartedAt ? "O caderno está fechado." : "Abra a prova quando estiver pronto."}</h1><p>{examStartedAt ? "O tempo geral continua correndo. Ao reabrir, você retorna à última questão e a nova visita passa a contar para o assunto somente se durar mais de cinco segundos." : "Você já pode navegar pelos números. O cronômetro geral começa apenas na primeira abertura."}</p><Button className="lime-button" onClick={openExam}><Play size={17} /> {examStartedAt ? "Reabrir prova" : "Abrir prova"}</Button></div></section>}
      </div>
    </main>;
  }
  const averageLastFive = attempts.length >= 5 ? Math.round(attempts.slice(-5).reduce((sum, item) => sum + item.score, 0) / 5) : null;
  const presentKinds = (["prova", "quiz", "formulario"] as const).filter((kind) => studyExams.some((exam) => (exam.kind || "prova") === kind));
  const showKindFilters = presentKinds.length > 1;
  const kindFilterIcon: Record<"prova" | "quiz" | "formulario", string> = { prova: "📚", quiz: "🧐", formulario: "📝" };
  const showPagination = filteredLibraryExams.length > STUDENT_EXAM_PAGE_SIZE;
  const libraryPagination = (showPagination || showKindFilters) ? <nav className="collection-pagination student-pagination" aria-label="Páginas de provas"><div className="library-nav-row">{showPagination ? <button className="library-nav-btn" disabled={safeExamPage === 0} onClick={() => setExamPage((page) => Math.max(0, page - 1))} aria-label="Provas anteriores" title="Anteriores">⬅️</button> : <span />}{showPagination && <button className={`library-nav-btn library-sort-toggle ${alphabeticalOrder ? "is-active" : ""}`} onClick={() => { setAlphabeticalOrder((v) => !v); setExamPage(0); }} aria-label={alphabeticalOrder ? "Voltar à ordem por data" : "Ordenar por ordem alfabética"} title={alphabeticalOrder ? "Voltar à ordem por data" : "Ordem alfabética"}>🔠</button>}{showKindFilters ? <div className="library-kind-filters">{presentKinds.map((kind) => <button key={kind} className={kindFilter === kind ? "is-active" : ""} onClick={() => toggleKindFilter(kind)} aria-label={kind}>{kindFilterIcon[kind]}</button>)}</div> : <span className="library-nav-info">Provas {safeExamPage * STUDENT_EXAM_PAGE_SIZE + 1}–{Math.min((safeExamPage + 1) * STUDENT_EXAM_PAGE_SIZE, filteredLibraryExams.length)} de {filteredLibraryExams.length}</span>}{showPagination ? <button className="library-nav-btn" disabled={safeExamPage >= examPageCount - 1} onClick={() => setExamPage((page) => Math.min(examPageCount - 1, page + 1))} aria-label="Próximas provas" title="Próximas">➡️</button> : <span />}<button className={`library-nav-btn library-search-toggle ${searchOpen ? "is-active" : ""}`} onClick={() => setSearchOpen((value) => !value)} aria-label="Buscar provas" title="Buscar">🔍</button></div>{searchOpen && <div className="library-search-row"><button className="library-nav-btn" onClick={() => { clearLibrarySearch(); }} aria-label="Limpar busca" title="Limpar">❌</button><input className="library-search-input" value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Buscar por título, cidade, ano, banca..." aria-label="Campo de busca" onKeyDown={(event) => { if (event.key === "Enter") setAppliedSearch(librarySearch); }} /><button className="library-nav-btn" onClick={() => setAppliedSearch(librarySearch)} aria-label="Buscar agora" title="Buscar">🔍</button></div>}{appliedSearch && <p className="library-search-status">{filteredLibraryExams.length} resultado(s) para "{appliedSearch}" — {kindFilter ? `filtrado por ${kindFilter}` : "todos os tipos"}{filteredLibraryExams.length === 0 && " (limpe a busca ou troque o filtro)"}</p>}</nav> : null;
  const visibleAchievements = ACHIEVEMENT_CATEGORIES.map((category) => { const display = displayedAchievementLevel(achievements[category]); return display ? { category, ...display } : null; }).filter((item): item is { category: AchievementCategory; nivel: AchievementLevel; colorido: boolean } => item !== null);
  const provaAttempts = attempts.filter((attempt) => { const found = exams.find((item) => item.id === attempt.examId); return !found || (found.kind || "prova") === "prova"; });
  const provaAccuracyPct = provaAttempts.length ? Math.round(provaAttempts.reduce((sum, item) => sum + item.score, 0) / provaAttempts.length) : null;
  const subjectAccuracy: Record<string, { correct: number; total: number }> = {};
  provaAttempts.forEach((attempt) => { Object.entries(attempt.subjectSummary || {}).forEach(([subject, summary]) => { const entry = subjectAccuracy[subject] || { correct: 0, total: 0 }; entry.correct += summary.correct; entry.total += summary.correct + summary.wrong + summary.blank; subjectAccuracy[subject] = entry; }); });
  const worstSubject = Object.entries(subjectAccuracy).filter(([, item]) => item.total > 0).map(([subject, item]) => ({ subject, pct: Math.round((item.correct / item.total) * 100) })).sort((first, second) => first.pct - second.pct)[0] || null;
  return (
    <main className={`workspace student-theme-${palette} student-workspace`}>
      <section className="student-hero student-hero-library">
        <div className="student-hero-copy">
          <div className="student-hero-brand-row">
            <div className="student-hero-brand"><BrandMark /></div>
            {visibleAchievements.length > 0 && !medalsExpanded && <div className="medal-strip-inline" ref={medalStripRef} onPointerDown={onMedalPointerDown} onPointerMove={onMedalPointerMove} onPointerUp={onMedalPointerUp} onPointerCancel={onMedalPointerUp} style={{ transform: `translateX(${medalDrag}px)`, transition: medalDragging ? "none" : "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}>{visibleAchievements.slice(0, 2).map(({ category, nivel, colorido }) => <button key={category} className={`achievement-medal ${colorido ? "" : "is-grey"}`} onClick={() => setOpenAchievement(category)}><img src={`${ACHIEVEMENT_IMAGE_BASE}/${category}-${nivel}.png`} alt={ACHIEVEMENT_META[category].nomesPorNivel[nivel]} /></button>)}{visibleAchievements.length > 2 && <button className="medal-more-btn" onClick={() => setMedalsExpanded(true)} aria-label={`Ver todas as ${visibleAchievements.length} medalhas`} title={`Ver todas as ${visibleAchievements.length} medalhas`}>(+)</button>}</div>}
            {visibleAchievements.length > 2 && medalsExpanded && <button className="medal-more-btn medal-collapse-btn" onClick={() => setMedalsExpanded(false)} aria-label="Recolher medalhas" title="Recolher">(-)</button>}
          </div>
          {medalsExpanded && visibleAchievements.length > 2 && <div className="medal-grid-expanded"><div className="medal-grid-inner">{visibleAchievements.map(({ category, nivel, colorido }) => <button key={category} className={`achievement-medal ${colorido ? "" : "is-grey"}`} onClick={() => setOpenAchievement(category)}><img src={`${ACHIEVEMENT_IMAGE_BASE}/${category}-${nivel}.png`} alt={ACHIEVEMENT_META[category].nomesPorNivel[nivel]} /></button>)}</div></div>}
          <p className="eyebrow"><span className="pulse-dot" /> kuaa v0.9 · ACERVO LOCAL</p>
          <h1>Repetição útil, não repetição ao acaso.</h1>
          <div className="student-hero-quick-actions">
            <div className="student-hero-actions">
              <Button className="lime-button" onClick={() => setScreen("prova-filters")}><Play size={17} /> Iniciar prova</Button>
              <Button variant="outline" onClick={() => setScreen("quick-setup")}><Sparkles size={17} /> Questão rápida</Button>
              <Button variant="outline" onClick={() => setScreen("quiz-setup")}><Clock size={17} /> Hora do quiz</Button>
            </div>
            <div className="quick-count-card"><span>REVISÃO RÁPIDA</span><strong>{quickEligible.length}</strong><small>questões disponíveis</small></div>
          </div>
        </div>
      </section>
      <section className="student-preferences"><p className="eyebrow">TEMA E PALETA</p>{paletteControls}</section>
      <section className="library-section">
        <div className="section-heading">
          <div><p className="eyebrow">SELEÇÃO DE PROVAS</p><h2>Seu acervo neste dispositivo.</h2>{averageLastFive !== null && <p className="attempt-average-note">Média das últimas 5 tentativas: <strong>{averageLastFive}%</strong></p>}</div>
          <div className="student-library-actions"><label className="button file-action student-import-action"><FileInput size={16} /> Importar<input type="file" multiple accept="application/json,.json" onChange={importPackage} /></label><Button variant="outline" className="danger-button" onClick={deleteAllExams}><Trash2 size={16} /> Excluir provas</Button></div>
        </div>
        {libraryPagination}
        <div className="exam-library">{visibleLibraryExams.map((exam, index) => {
          const examAttempts = attempts.filter((item) => item.examId === exam.id);
          const best = examAttempts.length ? [...examAttempts].sort((first, second) => second.score - first.score || first.durationSeconds - second.durationSeconds)[0] : null;
          const latest = examAttempts.length ? [...examAttempts].sort((first, second) => new Date(second.completedAt).valueOf() - new Date(first.completedAt).valueOf())[0] : null;
          const examLabel = exam.title || exam.role;
          const location = exam.state && !exam.city.includes(exam.state) ? `${exam.city} · ${exam.state}` : exam.city;
          const kind = exam.kind || "prova";
          const studyLabel = kind === "quiz" ? "Descubra" : kind === "formulario" ? "📝 Responder" : "Estudar";
          const summaryLabel = kind === "quiz" ? "🧐 Veja!" : kind === "formulario" ? "📊 Estatísticas" : "Último resumo";
          const handleStudyClick = () => { if (kind === "prova") { startExam(exam.id); return; } if (kind === "quiz") { startQuiz(exam.id); return; } startForm(exam.id); };
          const formResponseCount = (formResponses[exam.id] || []).length;
          const showSummaryButton = kind === "formulario" ? formResponseCount > 0 : Boolean(latest);
          const handleSummaryClick = () => { if (kind === "formulario") { chooseExam(exam.id); setFormStatsFilter(""); setScreen("form-stats"); return; } if (latest) openSummary(exam.id, latest); };
          const quizWinnerTitles = kind === "quiz" && latest?.quizResultIds ? latest.quizResultIds.map((id) => exam.quizFinais?.find((item) => item.id === id)?.titulo).filter(Boolean).join(" / ") : "";
          const cardNumber = safeExamPage * STUDENT_EXAM_PAGE_SIZE + index + 1;
          return <Card key={exam.id} className={`exam-card ${exam.id === activeExam.id ? "is-active" : ""}`}><CardContent className="p-0"><div className="exam-card-top"><button className="exam-main" onClick={() => chooseExam(exam.id)}><h3><span className="exam-inline-index">{cardNumber}.</span> {examLabel}</h3>{kind === "prova" ? <><p>{[exam.role || "Cargo não informado", exam.booklet && !/^\d+$/.test(exam.booklet) ? exam.booklet : "Órgão não informado", exam.board || "Banca não informada"].join(" · ")}</p><p>{`${location} · ${exam.year || "Ano não informado"} · ${exam.questions.length} questões`}</p></> : <p>{`${exam.questions.length} pergunta(s)`}</p>}</button><div className={`exam-score ${kind !== "prova" || best ? "has-best-score" : ""}`}>{kind === "prova" ? (best ? <><span>MELHOR NOTA</span><strong>{best.score}%</strong><small>{formatDuration(best.durationSeconds)}</small></> : <><span>STATUS</span><strong>Nova</strong><small>sem tentativa</small></>) : kind === "quiz" ? <><span>STATUS</span><strong className="exam-score-title">{quizWinnerTitles || "Nova"}</strong></> : <><span>STATUS</span><strong>{String(formResponseCount).padStart(2, "0")}</strong><small>completos</small></>}</div></div><div className="exam-card-actions"><Button className="ink-button" onClick={handleStudyClick}><Play size={16} /> {studyLabel}</Button>{showSummaryButton && <Button variant="outline" className="last-summary-action" onClick={handleSummaryClick}><FileCheck2 size={16} /> {summaryLabel}</Button>}<Button variant="outline" className="delete-exam" onClick={() => deleteExam(exam.id)} aria-label={`Excluir ${examLabel}`}><Trash2 size={16} /><span>Excluir</span></Button></div></CardContent></Card>;
        })}</div>
        {libraryPagination}
      </section>
      <section className="student-statistics-panel"><div><p className="eyebrow">ESTATÍSTICAS</p><h2>Resumo rápido do seu progresso.</h2></div><div className="student-metrics"><StatCard value={quickAnswers ? `${quickAccuracy}%` : "—"} label="ACERTO · QR" helper={quickAnswers ? `${quickAnswers} resposta(s)` : "Aguardando respostas"} accent /><StatCard value={provaAccuracyPct === null ? "—" : `${provaAccuracyPct}%`} label="ACERTO · PROVAS" helper={provaAttempts.length ? `${provaAttempts.length} tentativa(s)` : "Aguardando prova concluída"} /><StatCard value={worstSubject ? `${worstSubject.pct}%` : "—"} label="PIOR ASSUNTO" helper={worstSubject ? worstSubject.subject : "Ainda sem dados suficientes"} /></div></section>
      <section className="student-fixed-actions"><Button variant="outline" onClick={() => setScreen("settings")}><Settings2 size={16} /> Configurações</Button><Button variant="outline" onClick={() => setShowFaq(true)}><HelpCircle size={16} /> FAQ</Button></section>
      {showFaq && <div className="faq-overlay" onClick={() => setShowFaq(false)}><div className="faq-panel" onClick={(event) => event.stopPropagation()}><div className="faq-heading"><h2>Perguntas frequentes</h2><button onClick={() => setShowFaq(false)} aria-label="Fechar"><X size={18} /></button></div><dl>{FAQ_ENTRIES.map((entry) => <div key={entry.pergunta} className="faq-item"><dt>{entry.pergunta}</dt><dd>{entry.resposta}</dd></div>)}</dl></div></div>}
      {openAchievement && (() => {
        const category = openAchievement;
        const state = achievements[category];
        const meta = ACHIEVEMENT_META[category];
        const nivelDescoberto = state.nivelMaximoHistorico ?? "bronze";
        const nextLevel = ACHIEVEMENT_LEVELS.find((level) => state.progressoMensal < meta.metas[level]) ?? "ouro";
        const metaNumero = meta.metas[nextLevel];
        const ultimasVezes = [...state.historicoDatas].slice(-3).reverse();
        const totalPorNivel: Record<AchievementLevel, number> = { bronze: 0, prata: 0, ouro: 0 };
        state.historicoDatas.forEach((entry) => { totalPorNivel[entry.nivel] += 1; });
        const nivelLabel: Record<AchievementLevel, string> = { bronze: "Bronze", prata: "Prata", ouro: "Ouro" };
        const currentIndex = visibleAchievements.findIndex((item) => item.category === category);
        const goTo = (step: number) => { if (currentIndex === -1 || !visibleAchievements.length) return; const nextIndex = (currentIndex + step + visibleAchievements.length) % visibleAchievements.length; setOpenAchievement(visibleAchievements[nextIndex].category); };
        return <div className="achievement-modal-overlay" onClick={() => setOpenAchievement(null)}>
          <div className="achievement-modal" onClick={(event) => event.stopPropagation()}>
            <div className="achievement-modal-nav"><button disabled={visibleAchievements.length < 2} onClick={() => goTo(-1)}><ArrowLeft size={15} /> Anterior</button><Button variant="outline" onClick={() => setOpenAchievement(null)}>Fechar</Button><button disabled={visibleAchievements.length < 2} onClick={() => goTo(1)}>Próxima <ArrowRight size={15} /></button></div>
            <img className="achievement-modal-image" src={`${ACHIEVEMENT_IMAGE_BASE}/${category}-${nivelDescoberto}.png`} alt={meta.nomesPorNivel[nivelDescoberto]} />
            <h2>{ACHIEVEMENT_MEDAL_EMOJI[nivelDescoberto]} {meta.nomesPorNivel[nivelDescoberto]}</h2>
            <p className="achievement-modal-category">Categoria: {meta.nomeCategoria}</p>
            <p className="achievement-modal-criterio">{meta.descricoes[nivelDescoberto]}</p>
            <div className="achievement-modal-progress"><div className="achievement-modal-progress-bar"><span style={{ width: `${Math.min(100, (state.progressoMensal / metaNumero) * 100)}%`, background: ACHIEVEMENT_COLORS[nextLevel] }} /></div><small>Nesse mês {state.progressoMensal}/{metaNumero} — 🥉{meta.metas.bronze} | 🥈{meta.metas.prata} | 🥇{meta.metas.ouro}</small></div>
            <div className="achievement-modal-blocks">
              <div className="achievement-modal-block"><h3>🏆 Últimas vezes</h3>{ultimasVezes.length ? <ul>{ultimasVezes.map((entry, index) => <li key={index}>{new Date(`${entry.data}T00:00:00`).toLocaleDateString("pt-BR")} - {nivelLabel[entry.nivel]} {ACHIEVEMENT_MEDAL_EMOJI[entry.nivel]}</li>)}</ul> : <p>Nenhuma conquista registrada ainda.</p>}</div>
              <div className="achievement-modal-block"><h3>🏅 Total de conquistas</h3><ul><li>Ouro: {totalPorNivel.ouro} 🥇</li><li>Prata: {totalPorNivel.prata} 🥈</li><li>Bronze: {totalPorNivel.bronze} 🥉</li></ul></div>
            </div>
          </div>
        </div>;
      })()}
    </main>
  );
}

export default function Home() {
  const embedded = window as Window & { __KUAA_MODE__?: string; __KUAA_DEVICE__?: string; __KUAA_VIEW__?: string };
  const startup = new URLSearchParams(window.location.search);
  // kuaa-app: pacote exclusivo do estudante — sem área administrativa.
  const studentOnly = true;
  const requestedDevice = embedded.__KUAA_DEVICE__ || startup.get("device");
  const device = requestedDevice === "phone" ? "phone" : requestedDevice === "tablet" ? "tablet" : "desktop";
  const [view, setView] = useState<View>("student");
  const nativeStudentShell = studentOnly && (window.location.protocol === "capacitor:" || Boolean((window as Window & { Capacitor?: unknown }).Capacitor));
  const [activationGrant, setActivationGrant] = useState<ActivationGrant | null>(() => readActivationGrant());
  const forceActivationPreview = startup.get("activation") === "preview";
  const [activationClock, setActivationClock] = useState<{ now: Date; source: "checking" | "online" | "local" }>(() => ({ now: new Date(), source: studentOnly && !forceActivationPreview ? "checking" : "local" }));
  const activationRequired = studentOnly && (forceActivationPreview || isStudentActivationRequired(activationClock.now));
  const [exams, setExams] = useState<ExamRecord[]>(() => {
    const saved = window.localStorage.getItem("kuaa-exams");
    if (saved) { try { const parsed = JSON.parse(saved) as ExamRecord[]; if (Array.isArray(parsed) && parsed.length) return parsed; } catch { window.localStorage.removeItem("kuaa-exams"); } }
    const legacy = window.localStorage.getItem("kuaa-review-questions");
    if (legacy) { try { const questions = JSON.parse(legacy) as Question[]; if (Array.isArray(questions) && questions.length) return [{ ...INITIAL_EXAM_RECORDS[0], questions }]; } catch { /* use the demonstrative acervo */ } }
    return INITIAL_EXAM_RECORDS;
  });
  const [selectedExamId, setSelectedExamId] = useState(() => exams[0]?.id || "");
  const [attempts, setAttempts] = useState<AttemptRecord[]>(() => { try { const value = JSON.parse(window.localStorage.getItem("kuaa-attempts") || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } });
  const [quickEvents, setQuickEvents] = useState<QuickEvent[]>(() => { try { const value = JSON.parse(window.localStorage.getItem("kuaa-quick-events") || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } });
  useEffect(() => { window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" })); }, [view]);
  const [examsHydratedFromIdb, setExamsHydratedFromIdb] = useState(false);
  useEffect(() => {
    let cancelled = false;
    idbGet<ExamRecord[]>("exams").then((stored) => {
      if (cancelled) return;
      if (Array.isArray(stored) && stored.length) setExams(stored);
      setExamsHydratedFromIdb(true);
    }).catch(() => setExamsHydratedFromIdb(true));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!examsHydratedFromIdb) return; // espera checar o IndexedDB antes de gravar, senão sobrescreve com o valor inicial (só localStorage) antes de saber se já havia algo salvo
    idbSet("exams", exams).then((ok) => { if (ok) { try { window.localStorage.removeItem("kuaa-exams"); } catch { /* ignora */ } } });
  }, [exams, examsHydratedFromIdb]);
  // Tentativas e eventos rápidos em IndexedDB (padrão já usado pelas provas):
  // hidrata na abertura e grava no IDB; o resíduo do localStorage só serve para
  // a primeira migração e some assim que a gravação dá certo (evita estourar o
  // teto de poucos MB do localStorage com dezenas de quizzes e centenas de questões).
  const [quickStorageHydratedFromIdb, setQuickStorageHydratedFromIdb] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([idbGet<AttemptRecord[]>("attempts"), idbGet<QuickEvent[]>("quickEvents")]).then(([storedAttempts, storedQuickEvents]) => {
      if (cancelled) return;
      if (Array.isArray(storedAttempts) && storedAttempts.length) setAttempts(storedAttempts);
      if (Array.isArray(storedQuickEvents) && storedQuickEvents.length) setQuickEvents(storedQuickEvents);
      setQuickStorageHydratedFromIdb(true);
    }).catch(() => setQuickStorageHydratedFromIdb(true));
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!quickStorageHydratedFromIdb) return;
    idbSet("attempts", attempts.slice(-200)).then((ok) => { if (ok) { try { window.localStorage.removeItem("kuaa-attempts"); } catch { /* ignora */ } } });
    idbSet("quickEvents", quickEvents.slice(-200)).then((ok) => { if (ok) { try { window.localStorage.removeItem("kuaa-quick-events"); } catch { /* ignora */ } } });
  }, [attempts, quickEvents, quickStorageHydratedFromIdb]);
  useEffect(() => {
    const clearHistory = () => { setAttempts([]); setQuickEvents([]); window.localStorage.removeItem("kuaa-quick-history"); };
    window.addEventListener("kuaa-clear-history", clearHistory);
    return () => window.removeEventListener("kuaa-clear-history", clearHistory);
  }, []);
  useEffect(() => {
    if (!nativeStudentShell || window.localStorage.getItem("kuaa-native-preload-v1") === "loaded") return;
    let active = true;
    fetch("/initial-student-package.json")
      .then((response) => response.ok ? response.json() as Promise<Record<string, unknown>> : Promise.reject(new Error("Pacote inicial indisponível")))
      .then((payload) => {
        if (!active) return;
        const entries = Array.isArray(payload.exams) ? payload.exams : [payload];
        const loaded = entries.map((entry, index) => normalizeExamPayload(entry as Record<string, unknown>, `pre-instalada-${index + 1}`)).filter((exam) => exam.questions.length > 0);
        if (!loaded.length) return;
        setExams(loaded);
        setSelectedExamId(loaded[0]?.id || "");
        window.localStorage.setItem("kuaa-native-preload-v1", "loaded");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [nativeStudentShell]);
  useEffect(() => {
    document.documentElement.dataset.mode = studentOnly ? "student" : "full";
    document.documentElement.dataset.device = device;
  }, [device, studentOnly]);
  useEffect(() => {
    if (!studentOnly || forceActivationPreview) return;
    let mounted = true;
    const controller = new AbortController();
    const fallback = window.setTimeout(() => {
      controller.abort();
      if (mounted) setActivationClock({ now: new Date(), source: "local" });
    }, 3000);
    fetchOnlineUtcTime(controller.signal)
      .then((now) => { if (mounted) setActivationClock({ now, source: "online" }); })
      .catch(() => { if (mounted) setActivationClock({ now: new Date(), source: "local" }); })
      .finally(() => window.clearTimeout(fallback));
    return () => { mounted = false; controller.abort(); window.clearTimeout(fallback); };
  }, [forceActivationPreview, studentOnly]);
  const openStudent = (examId: string) => { setSelectedExamId(examId); setView("student"); };
  const openReview = (examId: string) => { setSelectedExamId(examId); setView("admin"); window.localStorage.setItem("kuaa-review-target", examId); };
  if (studentOnly && activationClock.source === "checking" && !forceActivationPreview) return <StudentTimeCheck />;
  if (activationRequired && !isActivationGrantValid(activationGrant, activationClock.now)) return <StudentActivationGate currentGrant={activationGrant} now={activationClock.now} onActivate={setActivationGrant} />;
  return <div className="app-shell">{!studentOnly && <><aside className="app-sidebar"><BrandMark /><nav aria-label="Áreas da prévia" className="sidebar-nav"><button className={view === "admin" ? "is-active" : ""} onClick={() => setView("admin")}><LayoutDashboard size={19} /><span>Intermediadora</span><i>01</i></button><button className={view === "student" ? "is-active" : ""} onClick={() => setView("student")}><GraduationCap size={19} /><span>Estudante</span><i>02</i></button></nav><div className="sidebar-bottom"><div className="backup-card"><Archive size={18} /><p><strong>Dados locais</strong><span>Revisão sem internet</span></p></div><p className="sidebar-note">A IA é usada apenas quando você decide enviar o par de PDFs a um serviço externo. A revisão e o estudo continuam locais.</p></div></aside><header className="mobile-header"><BrandMark compact /><div className="mobile-tabs"><button className={view === "admin" ? "is-active" : ""} onClick={() => setView("admin")}>Intermediadora</button><button className={view === "student" ? "is-active" : ""} onClick={() => setView("student")}>Estudante</button></div></header></>}<div className="app-main"><><StudentPreview exams={exams} selectedExamId={selectedExamId} onChange={setExams} onSelected={setSelectedExamId} attempts={attempts} onAttempt={(attempt) => setAttempts((items) => [...items, attempt])} onQuickEvent={(event) => setQuickEvents((items) => [...items, event])} /><StudentCredit /></></div></div>;
}
