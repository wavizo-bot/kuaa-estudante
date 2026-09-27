import { readFile } from "node:fs/promises";

const source = process.argv[2];
if (!source) throw new Error("Informe o caminho do pacote JSON.");

const payload = JSON.parse(await readFile(source, "utf8"));
const referencePattern = /(texto[-\s]?base|texto acima|texto a seguir|texto apresentado|conforme o texto|leia o texto|texto abaixo|parágrafo|trecho|autor|vocabulário empregado|período destacado)/i;
const exams = Array.isArray(payload.exams) ? payload.exams : [payload];

const details = exams.map((exam) => {
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const baseText = questions.filter((question) => String(question.baseText || "").trim().length > 0);
  const explicitReference = questions.filter((question) => referencePattern.test(String(question.text || "")));
  const currentlyEligible = questions.filter((question) => !String(question.baseText || "").trim() && !referencePattern.test(String(question.text || "")));
  const associatedButNotExplicit = questions.filter((question) => String(question.baseText || "").trim() && !referencePattern.test(String(question.text || "")));
  return {
    prova: `${exam.role || "Cargo não informado"} · ${exam.city || "Local não informado"} · ${exam.year || "Ano não informado"}`,
    total: questions.length,
    comTextoBase: baseText.length,
    referenciaExplicita: explicitReference.length,
    elegiveisPelaRegraAtual: currentlyEligible.length,
    textoAssociadoSemReferenciaExplicita: associatedButNotExplicit.length,
    exemplosAssociadosSemReferencia: associatedButNotExplicit.slice(0, 8).map((question) => ({ numero: question.originalNumber || question.id, texto: String(question.text || "").slice(0, 140) })),
  };
});

const total = details.reduce((sum, item) => sum + item.total, 0);
const currentEligible = details.reduce((sum, item) => sum + item.elegiveisPelaRegraAtual, 0);
const report = { totalQuestoes: total, elegiveisPelaRegraAtual: currentEligible, excluidasPelaRegraAtual: total - currentEligible, provas: details };
console.log(JSON.stringify(report, null, 2));
