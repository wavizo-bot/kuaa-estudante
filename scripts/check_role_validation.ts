/** Caderno de Aprovação — validação de cargos profissionais e bloqueio de identificadores. */
import fs from "node:fs";
import { inferExamRole, isUnresolvedRole } from "../client/src/lib/examMetadata.ts";

type PackageExam = { role?: string; title?: string; questions?: { subject?: string; text?: string }[] };
const path = process.argv[2] || "/home/ubuntu/upload/pacote-caderno-estudante.json";
const payload = JSON.parse(fs.readFileSync(path, "utf8")) as { exams?: PackageExam[] };
const exams = payload.exams || [];
const valid = exams.filter((exam) => !isUnresolvedRole(inferExamRole({ role: exam.role, title: exam.title, evidence: exam.questions }))).length;
const inferred = inferExamRole({ role: "1", title: "Prova tipo 1", evidence: [{ subject: "Conhecimentos Específicos — Terapeuta Ocupacional" }] });
const blocked = inferExamRole({ role: "1", title: "Prova tipo 1", evidence: [] });

if (inferred !== "Terapeuta Ocupacional") throw new Error(`Inferência inesperada: ${inferred}`);
if (!isUnresolvedRole(blocked)) throw new Error(`Cargo numérico sem evidência deveria ser bloqueado: ${blocked}`);
console.log(JSON.stringify({ exams: exams.length, validRolesInPackage: valid, numericWithEvidence: inferred, numericWithoutEvidence: blocked }, null, 2));
