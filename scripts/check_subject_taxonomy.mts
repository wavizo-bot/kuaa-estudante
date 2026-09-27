import { readFile } from "node:fs/promises";
import { organizeSubjects } from "../client/src/lib/subjectTaxonomy";

const input = JSON.parse(await readFile("/home/ubuntu/upload/pacote-caderno-estudante.json", "utf8")) as {
  exams: { role: string; questions: { subject: string }[] }[];
};

const items = input.exams.flatMap((exam) => exam.questions.map((question) => ({ subject: question.subject, role: exam.role })));
const result = organizeSubjects(items);
const examples = new Map<string, string>();
items.forEach((item, index) => {
  const label = result.resolved[index] || "oculto";
  if (!examples.has(`${label} ← ${item.subject}`)) examples.set(`${label} ← ${item.subject}`, item.role || "");
});

console.log(JSON.stringify({
  total_questions: items.length,
  visible_groups: result.groups,
  assigned_to_visible_group: result.resolved.filter(Boolean).length,
  examples: Array.from(examples.entries()).filter(([value]) => value.includes("Espec")).slice(0, 30),
}, null, 2));
