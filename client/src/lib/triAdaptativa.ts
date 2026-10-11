/**
 * kuaa - cálculo de pontuação TRI adaptativa (update3.txt - DESISTIR DO CAMPO TRI PREENCHIDO POR IA).
 *
 * Regras prÃprias (NÃO pede valores TRI Ã© IA):
 * - Cada erro adicional reduz MENOS que o anterior (sÃrie geomÃtrica desescalante 1, 1/2, 1/4, 1/8, ...)
 * - Limite finito: nunca reduz 100% -" converge para 25- a primeira reduÃÃo (capado em 95%)
 * - Isolado por matÃria: erros em PortuguÃs nÃo afetam MatemÃtica
 * - Calculada ao final: sÃo se aplica apÃs concluir a prova inteira
 * - Considera acertos parciais: questÃo parcialmente acertada conta como "erro parcial" proporcional
 *
 * NormalizaÃÃo: pontuaÃÃo_raw / pontuaÃÃo_mÃxima - 1000 = TRI simplificada (0-1000, onde 1000 = 100%).
 */

export type Difficulty = "facil" | "media" | "dificil";

export const PESOS_PADRAO: Record<Difficulty, number> = { facil: 2, media: 3, dificil: 5 };

export interface QuestaoRespondida {
  id: string | number;
  materia: string;
  dificuldade: Difficulty;
  pontuacaoBase: number;      // peso base da questÃo (ex.: 2, 3 ou 5)
  pontuacaoObtida: number;    // 0 se errou, pontuacaoBase se acertou, parcial se mÃltipla escolha
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
    const m = q.materia || "Sem matÃria";
    if (!grupos[m]) grupos[m] = [];
    grupos[m].push(q);
  }
  return grupos;
}

/**
 * Calcula a pontuaÃÃo TRI adaptativa de uma prova concluÃda.
 *
 * Algoritmo:
 * 1. Agrupa questÃes por matÃria.
 * 2. Para cada matÃria, identifica erros (questÃes com pontuacaoObtida < pontuacaoBase).
 * 3. Para cada questÃo acertada (total ou parcialmente), aplica penalidade:
 *    reduÃÃo_total =L (erro_efetivo_i / maior_acerto) - (1/2)^i, para i = 0, 1, 2, ...
 *    onde erro_efetivo_i sÃo os erros ordenados do menor para o maior.
 * 4. Limita reduÃÃo_total a 95% (nunca reduz 100%).
 * 5. pontuacaoFinal = pontuacaoObtida - (1 - reduÃÃo_total).
 * 6. Normaliza: tri_simplificada = (pontuacaoRaw / pontuacaoMaxima) - 1000.
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
          motivo: "Sem inconsistÃncia"
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
          ? `Reduzido em ${(reducaoTotal * 100).toFixed(1)}% por inconsistÃncia`
          : "Sem inconsistÃncia"
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
 * Resolve o peso base de uma questÃo a partir de sua dificuldade e da tabela de pesos da prova.
 * Se a prova nÃo definir pesos, usa PESOS_PADRAO (facil=2, media=3, dificil=5).
 */
export function pesoBase(dificuldade: Difficulty | undefined, pontosPorDificuldade?: Record<Difficulty, number>): number {
  if (pontosPorDificuldade && typeof pontosPorDificuldade[dificuldade || "media"] === "number") {
    return pontosPorDificuldade[dificuldade || "media"];
  }
  return PESOS_PADRAO[dificuldade || "media"];
}

export type RitmoPressaoModo = "aquecimento" | "ritmo" | "pressao";

export interface RitmoPressaoResultado {
  pontuacao: number;
  sequenciaAtualizada: number;
  sequenciaPunicaoAtualizada: number;
  mensagem: string;
  bonus?: number;
  penalidade?: number;
}

export const RITMO_PRESSAO_PESOS: Record<RitmoPressaoModo, Record<Difficulty, number>> = {
  aquecimento: { facil: 2, media: 3, dificil: 5 },
  ritmo: { facil: 2, media: 3, dificil: 5 },
  pressao: { facil: 1, media: 2, dificil: 4 },
};

export function calcularPontuacaoRitmoPressao(
  dificuldade: Difficulty,
  tipoModo: RitmoPressaoModo,
  acertou: boolean,
  pulou: boolean,
  sequenciaAtual: number,
  sequenciaPunicaoAtual: number
): RitmoPressaoResultado {
  const peso = RITMO_PRESSAO_PESOS[tipoModo][dificuldade] ?? RITMO_PRESSAO_PESOS[tipoModo].media;
  if (tipoModo === "aquecimento") {
    if (acertou) {
      const novaSequencia = sequenciaAtual + 1;
      const bonus = novaSequencia >= 5 && novaSequencia % 5 === 0 ? 5 : 0;
      const mensagem = bonus > 0
        ? "+" + peso + " pontos + bonus +5 por sequencia de " + novaSequencia + " acertos"
        : "+" + peso + " pontos";
      return { pontuacao: peso + bonus, sequenciaAtualizada: novaSequencia, sequenciaPunicaoAtualizada: 0, mensagem, bonus };
    }
    const perda = pulou ? 1 : 0;
    const mensagem = pulou ? "-1 ponto por pular" : "Errou, sequencia reiniciada";
    return { pontuacao: -perda, sequenciaAtualizada: 0, sequenciaPunicaoAtualizada: 0, mensagem, penalidade: perda };
  }
  if (tipoModo === "ritmo") {
    if (acertou) {
      const novaSequencia = sequenciaAtual + 1;
      const bonus = novaSequencia >= 5 && novaSequencia % 5 === 0 ? 2 : 0;
      const mensagem = bonus > 0
        ? "+" + peso + " pontos + bonus +2 por sequencia de " + novaSequencia + " acertos"
        : "+" + peso + " pontos";
      return { pontuacao: peso + bonus, sequenciaAtualizada: novaSequencia, sequenciaPunicaoAtualizada: 0, mensagem, bonus };
    }
    const perda = pulou ? 2 : 1;
    const mensagem = pulou ? "-2 pontos por pular" : "-1 ponto por erro";
    return { pontuacao: -perda, sequenciaAtualizada: 0, sequenciaPunicaoAtualizada: 0, mensagem, penalidade: perda };
  }
  if (acertou) {
    const novaSequencia = sequenciaAtual + 1;
    const mensagem = "+" + peso + " pontos";
    return { pontuacao: peso, sequenciaAtualizada: novaSequencia, sequenciaPunicaoAtualizada: 0, mensagem, penalidade: 0 };
  }
  const proximaPunicao = Math.min(sequenciaPunicaoAtual + 1, 3);
  const perda = proximaPunicao <= 0 ? 1 : proximaPunicao;
  const mensagem = "-" + perda + " ponto" + (perda > 1 ? "s" : "");
  return { pontuacao: -perda, sequenciaAtualizada: 0, sequenciaPunicaoAtualizada: proximaPunicao, mensagem, penalidade: perda };
}