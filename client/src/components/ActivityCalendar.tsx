import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

/**
 * Calendário de atividade de estudo (spec do usuário — etapa 47).
 *
 * Compacto: 4 quadrados fixos (D-3, D-2, D-1, Hoje) sob "questões disponíveis".
 * Modal: grade de 8 semanas × 7 dias, com Girar (vertical ↔ horizontal) e
 * Expandir/Retrair (mostra a contagem de questões).
 *
 * A intensidade de cor é relativa ao histórico do próprio usuário:
 * VMR = média das questões dos dias na 2ª e 5ª posição do ranking decrescente
 * dos últimos 56 dias (o 1º, possível outlier, é descartado). Com menos de 5
 * dias ativos, todos os dias ativos ficam em 100% ("iniciante sempre 100%").
 */

/** Dimensões copiadas de um quadrado já existente: o botão .library-nav-btn
 *  da Seleção de Provas (38×38 no desktop; no mobile os nav-btns viram 34px,
 *  e o CSS espelha isso em --kuaa-square). */
export const SQUARE_SIZE_SOURCE = 38;

const JANELA_DIAS = 56; // 8 semanas, incluindo hoje
const ORIENTACAO_KEY = "kuaa-atividade-orientacao";
const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const HOJE_ROTULO = ["hoje", "ontem", "há 2 dias", "há 3 dias"];

type Nivel = 0 | 20 | 40 | 60 | 80 | 100;

// Tipos estruturais: o componente recebe os registros do Home sem depender dele.
type RegistroProva = {
  completedAt?: string;
  questionResults?: unknown[];
  subjectSummary?: Record<string, { correct?: number; wrong?: number; blank?: number }>;
};
type RegistroRapido = { answeredAt?: string };
type RegistroFormulario = { completedAt?: string; choices?: object | null };
export type ActivityCalendarProps = {
  attempts: RegistroProva[];
  quickEvents: RegistroRapido[];
  formResponses: Record<string, RegistroFormulario[]>;
};

// ---------------------------------------------------------------- paleta
// As três paletas exatas da spec (azul/amarelo/vermelho) são usadas quando a
// cor primária do tema (CSS --student-accent) casa com a faixa de matiz delas.
// Para qualquer outra cor base, os níveis são mistura da base com branco
// (mesma regra) e o texto branco só entra quando o contraste ≥ 3:1.
const PALETA_AZUL: Record<Nivel, [string, string]> = {
  0: ["#FFFFFF", "#1A1A1A"],
  20: ["#D2E3F8", "#1A1A1A"],
  40: ["#A5C7F1", "#1A1A1A"],
  60: ["#78ABEA", "#1A1A1A"],
  80: ["#4B8FE3", "#FFFFFF"],
  100: ["#1E6FD9", "#FFFFFF"],
};
const PALETA_AMARELO: Record<Nivel, [string, string]> = {
  0: ["#FFFFFF", "#1A1A1A"],
  20: ["#FDF0C2", "#1A1A1A"],
  40: ["#FAE185", "#1A1A1A"],
  60: ["#F7D248", "#1A1A1A"],
  80: ["#F2B705", "#1A1A1A"], // amarelo puro não comporta texto branco AA
  100: ["#C99400", "#FFFFFF"],
};
const PALETA_VERMELHO: Record<Nivel, [string, string]> = {
  0: ["#FFFFFF", "#1A1A1A"],
  20: ["#F8D2CF", "#1A1A1A"],
  40: ["#F1A5A0", "#1A1A1A"],
  60: ["#EA7871", "#1A1A1A"],
  80: ["#E24B42", "#FFFFFF"],
  100: ["#D93025", "#FFFFFF"],
};

function paraRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "").trim();
  const completo = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  const n = Number.parseInt(completo.slice(0, 6) || "0", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function paraHex([r, g, b]: [number, number, number]): string {
  const p = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}
function mistura(base: string, branco: string, parte: number): string {
  const a = paraRgb(base);
  const b = paraRgb(branco);
  return paraHex([a[0] * parte + b[0] * (1 - parte), a[1] * parte + b[1] * (1 - parte), a[2] * parte + b[2] * (1 - parte)]);
}
function luminancia(hex: string): number {
  const [r, g, b] = paraRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}
function matizSaturacao(hex: string): { h: number; s: number } {
  const [r, g, b] = paraRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0 };
  let h = 0;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max };
}
function paletaDoTema(accent: string): Record<Nivel, [string, string]> {
  const { h, s } = matizSaturacao(accent);
  if (s >= 0.25 && h >= 180 && h <= 260) return PALETA_AZUL;
  if (s >= 0.25 && h >= 38 && h <= 66) return PALETA_AMARELO;
  if (s >= 0.25 && (h <= 20 || h >= 335)) return PALETA_VERMELHO;
  const generica = {} as Record<Nivel, [string, string]>;
  for (const nivel of [0, 20, 40, 60, 80, 100] as Nivel[]) {
    if (nivel === 0) { generica[0] = ["#FFFFFF", "#1A1A1A"]; continue; }
    const bg = mistura(accent, "#FFFFFF", nivel / 100);
    generica[nivel] = [bg, contraste("#FFFFFF", bg) >= 3 ? "#FFFFFF" : "#1A1A1A"];
  }
  return generica;
}
function lerAccent(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--student-accent").trim();
    return v || "#b9e34d";
  } catch { return "#b9e34d"; }
}

// ---------------------------------------------------------------- dados
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function somaDias(d: Date, dias: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + dias);
  return x;
}
function contarPorDia(
  attempts: RegistroProva[],
  quickEvents: RegistroRapido[],
  formResponses: Record<string, RegistroFormulario[]>,
): Map<string, number> {
  const mapa = new Map<string, number>();
  const soma = (chave: string, n: number) => { if (n > 0) mapa.set(chave, (mapa.get(chave) ?? 0) + n); };
  for (const a of attempts) {
    if (!a.completedAt) continue;
    const d = new Date(a.completedAt);
    if (Number.isNaN(d.getTime())) continue;
    let qtd = a.questionResults?.length ?? 0;
    if (!qtd && a.subjectSummary) {
      qtd = Object.values(a.subjectSummary).reduce((s, x) => s + (x.correct ?? 0) + (x.wrong ?? 0) + (x.blank ?? 0), 0);
    }
    if (!qtd) qtd = 1; // prova antiga sem detalhe: ao menos 1 questão respondida
    soma(chaveDia(d), qtd);
  }
  for (const q of quickEvents) {
    if (!q.answeredAt) continue;
    const d = new Date(q.answeredAt);
    if (Number.isNaN(d.getTime())) continue;
    soma(chaveDia(d), 1);
  }
  for (const lista of Object.values(formResponses)) {
    for (const r of lista) {
      if (!r?.completedAt || !r.choices) continue;
      const n = Object.keys(r.choices).length;
      if (n <= 0) continue;
      const d = new Date(r.completedAt);
      if (Number.isNaN(d.getTime())) continue;
      soma(chaveDia(d), n);
    }
  }
  return mapa;
}
function faixa(pct: number): Nivel {
  if (pct <= 0.2) return 20;
  if (pct <= 0.4) return 40;
  if (pct <= 0.6) return 60;
  if (pct <= 0.8) return 80;
  return 100;
}

type Calculo = { qtd: (d: Date) => number; nivel: (d: Date) => Nivel; vmr: number | null };
function calcular(
  attempts: RegistroProva[],
  quickEvents: RegistroRapido[],
  formResponses: Record<string, RegistroFormulario[]>,
  hoje: Date,
): Calculo {
  const mapa = contarPorDia(attempts, quickEvents, formResponses);
  const ativos: number[] = [];
  for (let i = 0; i < JANELA_DIAS; i++) {
    const q = mapa.get(chaveDia(somaDias(hoje, -i))) ?? 0;
    if (q > 0) ativos.push(q);
  }
  ativos.sort((a, b) => b - a); // ranking decrescente; dias com 0 nunca entram
  const vmr = ativos.length >= 5 ? (ativos[1] + ativos[4]) / 2 : null;
  const nivelDe = (q: number): Nivel => {
    if (q <= 0) return 0; // branco é exclusivamente 0 questões
    if (vmr === null) return 100; // iniciante: < 5 dias ativos → 100%
    return faixa(Math.min(q / vmr, 1)); // teto em 100%
  };
  return {
    qtd: (d) => mapa.get(chaveDia(d)) ?? 0,
    nivel: (d) => nivelDe(mapa.get(chaveDia(d)) ?? 0),
    vmr,
  };
}

// ---------------------------------------------------------------- componente
export function ActivityCalendar({ attempts, quickEvents, formResponses }: ActivityCalendarProps) {
  const hoje = useMemo(() => new Date(), [attempts, quickEvents, formResponses]);
  const calculo = useMemo(() => calcular(attempts, quickEvents, formResponses, hoje), [attempts, quickEvents, formResponses, hoje]);
  const paleta = useMemo(() => paletaDoTema(lerAccent()), [hoje]);

  const [aberto, setAberto] = useState(false);
  const [orientacao, setOrientacao] = useState<"v" | "h">(() => {
    try { return window.localStorage.getItem(ORIENTACAO_KEY) === "h" ? "h" : "v"; } catch { return "v"; }
  });
  const [expandido, setExpandido] = useState(false); // reseta a cada abertura (modal desmonta)
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const [transborda, setTransborda] = useState(false);
  const arrasto = useRef({ ativo: false, x: 0, esq: 0 });

  // Botão voltar do Android/PWA: empurra um estado e fecha no popstate.
  useEffect(() => {
    if (!aberto) return;
    const aoVoltar = () => setAberto(false);
    window.addEventListener("popstate", aoVoltar);
    try { window.history.pushState({ kuaaAtividade: 1 }, ""); } catch { /* ignora */ }
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      const estado = window.history.state as { kuaaAtividade?: number } | null;
      if (estado?.kuaaAtividade) { try { window.history.back(); } catch { /* ignora */ } }
    };
  }, [aberto]);

  // Visão horizontal: mede se há semanas ocultas (para o desvanecer de borda).
  useEffect(() => {
    if (!aberto || orientacao !== "h") { setTransborda(false); return; }
    const el = gradeRef.current;
    if (!el) return;
    const medir = () => setTransborda(el.scrollWidth > el.clientWidth + 2);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [aberto, orientacao, expandido]);

  const coresDe = (nivel: Nivel) => {
    const [bg, fg] = paleta[nivel];
    return { background: bg, color: fg };
  };

  const ultimosQuatro = [3, 2, 1, 0].map((volta) => somaDias(hoje, -volta));
  const compacto = (
    <div
      className="kuaa-atividade"
      style={{ "--kuaa-square": `${SQUARE_SIZE_SOURCE}px` } as CSSProperties}
    >
      {ultimosQuatro.map((dia, i) => {
        const qtd = calculo.qtd(dia);
        const nivel = calculo.nivel(dia);
        return (
          <button
            key={chaveDia(dia)}
            type="button"
            className={`kuaa-atividade-celula${i === 3 ? " hoje" : ""}`}
            style={coresDe(nivel)}
            title={`${HOJE_ROTULO[i]}: ${qtd} questão(ões) — clique para ver o histórico`}
            aria-label={`Atividade ${HOJE_ROTULO[i]}: ${qtd} questões`}
            onClick={() => setAberto(true)}
          />
        );
      })}
    </div>
  );

  if (!aberto) return compacto;

  // 8 semanas: a atual primeiro; células emitidas semana a semana, domingo→sábado.
  const semanas: Date[][] = [];
  for (let w = 0; w < 8; w++) {
    const primeira = somaDias(hoje, -w * 7 - hoje.getDay());
    semanas.push([0, 1, 2, 3, 4, 5, 6].map((d) => somaDias(primeira, d)));
  }
  const celulas = semanas.flat();

  const fechar = () => setAberto(false);
  const girar = () => {
    setOrientacao((o) => {
      const proximo = o === "v" ? "h" : "v";
      try { window.localStorage.setItem(ORIENTACAO_KEY, proximo); } catch { /* ignora */ }
      return proximo;
    });
  };

  return (
    <>
      {compacto}
      <div
        className="kuaa-atividade-overlay"
        style={{ "--kuaa-square": `${SQUARE_SIZE_SOURCE}px` } as CSSProperties}
        onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}
      >
        <div className={`kuaa-atividade-modal${expandido ? " expandido" : ""}`} role="dialog" aria-label="Atividade de estudo">
          <div className="kuaa-atividade-head">
            <button type="button" onClick={fechar}>Voltar</button>
            <button type="button" onClick={girar}>Girar</button>
            <button type="button" onClick={() => setExpandido((v) => !v)}>{expandido ? "Retrair" : "Expandir"}</button>
          </div>
          <div
            ref={gradeRef}
            className={`kuaa-atividade-grade ${orientacao === "v" ? "vertical" : "horizontal"}${transborda ? " com-desvanecer" : ""}`}
            onPointerDown={(e) => {
              if (orientacao !== "h" || e.pointerType !== "mouse" || !gradeRef.current) return;
              arrasto.current = { ativo: true, x: e.clientX, esq: gradeRef.current.scrollLeft };
            }}
            onPointerMove={(e) => {
              const el = gradeRef.current;
              if (!arrasto.current.ativo || !el) return;
              el.scrollLeft = arrasto.current.esq - (e.clientX - arrasto.current.x);
            }}
            onPointerUp={() => { arrasto.current.ativo = false; }}
            onPointerLeave={() => { arrasto.current.ativo = false; }}
          >
            {celulas.map((dia) => {
              const futuro = dia.getTime() > hoje.getTime();
              const qtd = futuro ? 0 : calculo.qtd(dia);
              const nivel = futuro ? 0 : calculo.nivel(dia);
              const ehHoje = chaveDia(dia) === chaveDia(hoje);
              const data = `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}`;
              return (
                <div
                  key={chaveDia(dia)}
                  className={`kuaa-atividade-celula${ehHoje ? " hoje" : ""}${expandido ? " com-numero" : ""}`}
                  style={coresDe(nivel)}
                  title={`${data} (${DIAS_SEMANA[dia.getDay()]}): ${qtd} questão(ões)`}
                >
                  {expandido && qtd > 0 ? Math.min(999, qtd) : ""}
                </div>
              );
            })}
          </div>
          {calculo.vmr !== null && (
            <p className="kuaa-atividade-rodape">
              Referência (VMR): {Math.round(calculo.vmr)} questões/dia · últimos {JANELA_DIAS} dias
            </p>
          )}
        </div>
      </div>
    </>
  );
}
