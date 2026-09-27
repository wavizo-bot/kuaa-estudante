/**
 * kuaa — cálculo de pontuação TRI adaptativa (update3.txt §DESISTIR DO CAMPO TRI PREENCHIDO POR IA).
 *
 * Regras próprias (NÃO pede valores TRI à IA):
 * - Cada erro adicional reduz MENOS que o anterior (série geométrica desescalante 1, 1/2, 1/4, 1/8, ...)
 * - Limite finito: nunca reduz 100% — converge para 2× a primeira redução (capado em 95%)
 * - Isolada por matéria: erros em Português não afetam Matemática
 * - Calculada ao final: só se aplica após concluir a prova inteira
 * - Considera acertos parciais: questão parcialmente acertada conta como "erro parcial" proporcional
 *
 * Normalização: pontuação_raw / pontuação_maxima × 1000 = TRI simplificada (0-1000, onde 1000 = 100%).
 */

export type Difficulty = "facil" | "media" | "dificil";

export const PESOS_PADRAO: Record<Difficulty, number> = { facil: 2, media: 3, dificil: 5 };

export interface QuestaoRespondida {
  id: string | number;
  materia: string;
  dificuldade: Difficulty;
  pontuacaoBase: number;      // peso base da questão (ex.: 2, 3 ou 5)
  pontuacaoObtida: number;    // 0 se errou, pontuacaoBase se acertou, parcial se múltipla escolha
  correta: boolean;
}

export interface DetalheQuestao extends QuestaoRespondida {
  pontuacaoFinal: number;
  penalidade: number;
  motivo: string;
}

export interface ResultadoProva {
  pontuacaoRaw: number;
  pontuacaoMaxima: number;
  triSimplificada: number;    // 0-1000 (1000 = 100% de acerto)
  percentual: number;          // 0-100
  detalhes: DetalheQuestao[];
  penalidadeTotal: number;
}

function agruparPorMateria(questoes: QuestaoRespondida[]): Record<string, QuestaoRespondida[]> {
  const grupos: Record<string, QuestaoRespondida[]> = {};
  for (const q of questoes) {
    const m = q.materia || "Sem matéria";
    if (!grupos[m]) grupos[m] = [];
    grupos[m].push(q);
  }
  return grupos;
}

/**
 * Calcula a pontuação TRI adaptativa de uma prova concluída.
 *
 * Algoritmo:
 * 1. Agrupa questões por matéria.
 * 2. Para cada matéria, identifica erros (questões com pontuacaoObtida < pontuacaoBase).
 * 3. Para cada questão acertada (total ou parcialmente), aplica penalidade:
 *    redução_total = Σ (erro_efetivo_i / maior_acerto) × (1/2)^i, para i = 0, 1, 2, ...
 *    onde erro_efetivo_i são os erros ordenados do menor para o maior.
 * 4. Limita redução_total a 95% (nunca reduz 100%).
 * 5. pontuacaoFinal = pontuacaoObtida × (1 - redução_total).
 * 6. Normaliza: tri_simplificada = (pontuacaoRaw / pontuacaoMaxima) × 1000.
 */
export function calcularPontuacaoAdaptativa(questoes: QuestaoRespondida[]): ResultadoProva {
  const porMateria = agruparPorMateria(questoes);
  let pontuacaoRaw = 0;
  let pontuacaoMaxima = 0;
  let penalidadeTotal = 0;
  const detalhes: DetalheQuestao[] = [];

  for (const [, qs] of Object.entries(porMateria)) {
    pontuacaoMaxima += qs.reduce((sum, q) => sum + q.pontuacaoBase, 0);

    const erros = qs
      .map((q) => ({ questao: q, erroEfetivo: q.pontuacaoBase - q.pontuacaoObtida }))
      .filter((e) => e.erroEfetivo > 0)
      .sort((a, b) => a.erroEfetivo - b.erroEfetivo);

    const maiorAcerto = Math.max(
      ...qs.filter((q) => q.pontuacaoObtida > 0).map((q) => q.pontuacaoBase),
      0
    );

    for (const q of qs) {
      if (q.pontuacaoObtida === 0) {
        detalhes.push({ ...q, pontuacaoFinal: 0, penalidade: 0, motivo: "Errada" });
        continue;
      }

      if (erros.length === 0 || maiorAcerto === 0) {
        detalhes.push({
          ...q,
          pontuacaoFinal: q.pontuacaoObtida,
          penalidade: 0,
          motivo: "Sem inconsistência"
        });
        pontuacaoRaw += q.pontuacaoObtida;
        continue;
      }

      let reducaoTotal = 0;
      for (let i = 0; i < erros.length; i++) {
        const erro = erros[i].erroEfetivo;
        const reducao = (erro / maiorAcerto) * Math.pow(0.5, i);
        reducaoTotal += reducao;
      }

      reducaoTotal = Math.min(reducaoTotal, 0.95);

      const pontuacaoFinal = q.pontuacaoObtida * (1 - reducaoTotal);
      const penalidade = q.pontuacaoObtida - pontuacaoFinal;

      detalhes.push({
        ...q,
        pontuacaoFinal,
        penalidade,
        motivo: penalidade > 0
          ? `Reduzido em ${(reducaoTotal * 100).toFixed(1)}% por inconsistência`
          : "Sem inconsistência"
      });

      pontuacaoRaw += pontuacaoFinal;
      penalidadeTotal += penalidade;
    }
  }

  const triSimplificada = pontuacaoMaxima > 0
    ? Math.round((pontuacaoRaw / pontuacaoMaxima) * 1000)
    : 0;

  const percentual = pontuacaoMaxima > 0
    ? Math.round((pontuacaoRaw / pontuacaoMaxima) * 100)
    : 0;

  return {
    pontuacaoRaw,
    pontuacaoMaxima,
    triSimplificada,
    percentual,
    detalhes,
    penalidadeTotal
  };
}

/**
 * Resolve o peso base de uma questão a partir de sua dificuldade e da tabela de pesos da prova.
 * Se a prova não definir pesos, usa PESOS_PADRAO (facil=2, media=3, dificil=5).
 */
export function pesoBase(dificuldade: Difficulty | undefined, pontosPorDificuldade?: Record<Difficulty, number>): number {
  if (pontosPorDificuldade && typeof pontosPorDificuldade[dificuldade || "media"] === "number") {
    return pontosPorDificuldade[dificuldade || "media"];
  }
  return PESOS_PADRAO[dificuldade || "media"];
}
