/**
 * kuaa — histórico de performance (update4.txt §Tela inicial).
 *
 * Persiste um registro de cada prova/quiz concluído para que as estatísticas
 * (gráfico de últimas 20 provas, contadores mensais, melhor/matéria mais difícil)
 * continuem disponíveis mesmo se as provas forem excluídas do acervo.
 *
 * Armazenamento: localStorage (key "kuaa-performance-history").
 */

export interface PerformanceRecord {
  attemptId: string;
  examId: string;
  examTitle: string;
  examRole: string;       // cargo
  examBoard: string;      // banca
  examYear: string;
  examKind: "prova" | "quiz" | "formulario";
  completedAt: string;    // ISO
  score: number;           // 0-100 (percentual de acertos)
  triSimplificada?: number; // 0-1000
  triPercentual?: number;
  // Para quiz:
  quizResultIds?: string[];
  quizResultTitles?: string[];  // títulos dos finais encontrados
  quizAffinity?: number;
  quizSecondPlaceId?: string;
  quizSecondPlaceTitle?: string;
  quizSecondPlacePct?: number;
  // Para prova — dados por matéria:
  subjectSummary?: Record<string, { correct: number; wrong: number; blank: number; score: number; averageDurationSeconds: number | null }>;
}

const STORAGE_KEY = "kuaa-performance-history";

export function loadPerformanceHistory(): PerformanceRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function savePerformanceRecord(record: PerformanceRecord): void {
  try {
    const history = loadPerformanceHistory();
    // Evita duplicar pelo attemptId
    const filtered = history.filter((r) => r.attemptId !== record.attemptId);
    filtered.push(record);
    // Mantém no máximo 200 registros para não estourar localStorage
    const trimmed = filtered.slice(-200);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* ignora se localStorage cheio */ }
}

export function clearPerformanceHistory(): void {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignora */ }
}

/**
 * Retorna as últimas N provas (excluindo quiz/formulario) para o gráfico de linhas.
 * Ordenadas da mais antiga para a mais recente (para o gráfico da esquerda para direita).
 */
export function lastNProvas(n: number): PerformanceRecord[] {
  const history = loadPerformanceHistory().filter((r) => r.examKind === "prova" || !r.examKind);
  return history.slice(-n);
}

/**
 * Conta provas concluídas no mês atual e no mês anterior.
 */
export function countProvasByMonth(): { thisMonth: number; lastMonth: number } {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
  const lastMonth = lastMonthDate.getMonth();
  const lastMonthYear = lastMonthDate.getFullYear();
  let thisCount = 0;
  let lastCount = 0;
  for (const r of loadPerformanceHistory()) {
    if (r.examKind !== "prova" && r.examKind) continue;
    const d = new Date(r.completedAt);
    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) thisCount++;
    else if (d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) lastCount++;
  }
  return { thisMonth: thisCount, lastMonth: lastCount };
}

/**
 * Calcula a melhor matéria (maior percentual de acertos) e a matéria com mais dificuldade
 * (menor percentual de acertos). Desempate: mais acertos → menor tempo médio → ordem alfabética.
 */
export function bestAndWorstSubjects(): {
  best: { subject: string; correct: number; score: number; avgDuration: number } | null;
  worst: { subject: string; correct: number; score: number; avgDuration: number } | null;
} {
  const history = loadPerformanceHistory().filter((r) => r.examKind === "prova" || !r.examKind);
  const subjectStats: Record<string, { correct: number; wrong: number; blank: number; totalScore: number; count: number; totalDuration: number; durationCount: number }> = {};
  for (const r of history) {
    if (!r.subjectSummary) continue;
    for (const [subject, s] of Object.entries(r.subjectSummary)) {
      if (!subjectStats[subject]) subjectStats[subject] = { correct: 0, wrong: 0, blank: 0, totalScore: 0, count: 0, totalDuration: 0, durationCount: 0 };
      subjectStats[subject].correct += s.correct;
      subjectStats[subject].wrong += s.wrong;
      subjectStats[subject].blank += s.blank;
      subjectStats[subject].totalScore += s.score;
      subjectStats[subject].count += 1;
      if (s.averageDurationSeconds !== null && s.averageDurationSeconds > 0) {
        subjectStats[subject].totalDuration += s.averageDurationSeconds;
        subjectStats[subject].durationCount += 1;
      }
    }
  }
  const entries = Object.entries(subjectStats).map(([subject, s]) => ({
    subject,
    correct: s.correct,
    score: s.count > 0 ? Math.round(s.totalScore / s.count) : 0,
    avgDuration: s.durationCount > 0 ? Math.round(s.totalDuration / s.durationCount) : 0,
    totalQuestions: s.correct + s.wrong + s.blank,
  }));
  if (!entries.length) return { best: null, worst: null };
  // Ordena por score desc, depois correct desc, depois avgDuration asc, depois subject asc
  const sorted = entries.sort((a, b) => b.score - a.score || b.correct - a.correct || a.avgDuration - b.avgDuration || a.subject.localeCompare(b.subject, "pt-BR"));
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

/**
 * Lista de quiz concluídos (máx 10, do mais recente ao mais antigo).
 */
export function lastQuizResults(n: number): PerformanceRecord[] {
  const history = loadPerformanceHistory().filter((r) => r.examKind === "quiz");
  return history.slice(-n).reverse();
}
