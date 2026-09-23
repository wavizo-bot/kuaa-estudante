# Alterações aplicadas — kuaa (batch 4)

Data: 2026-09-14
Base: `quest10-kuaa-batch3.zip` (batch 3) + `update4.txt` (batch 4) + imagem anexa

## Resumo

Implementação completa do `update4.txt` com 3 frentes administrativas e 5 frentes de estudante:

**Admin:**
1. Redesenho do synthetic-generator em 2 colunas (60/40) conforme imagem
2. Remoção de botões e reposicionamento na seção "Cole o JSON"
3. Revisão Humana: formulários não mostram "Gabarito confirmado"

**Student:**
4. Nova tela de filtros para "Iniciar prova" com gráfico de linhas, filtros, contadores e estatísticas
5. Novo botão "Hora do quiz" (ícone relógio) na tela inicial
6. Nova tela de filtros para quiz com temáticas e grade de quiz concluídos
7. Nova tela de detalhe do final do quiz
8. Persistência de histórico de performance (sobrevive à exclusão de provas)

Build Vite validado: ✓ 1636 módulos transformados.

---

## 1. Admin — Synthetic-generator em 2 colunas (60/40)

Conforme a imagem anexa, o formulário foi redesenhado:
- **Coluna esquerda (~60%)**: Perfil, Matéria do acervo, Ou digite uma matéria, Tabela de dificuldades, Radio Lote parcial/Prova sintética, Botão Copiar prompt
- **Coluna direita (~40%)**: Criatividade, Metodologia, Tipo de questão, Tempo/Qtd. alternativas (linha dupla), Checkboxes "Deixar IA sugerir", Regras diversas

CSS: `.generation-2col-layout` com `grid-template-columns: 1.5fr 1fr`. Em telas ≤820px colapsa para 1 coluna.

## 2. Admin — Seção "Cole o JSON" refatorada

- **Removidos**: botões "Ler área de transferência" e "Arquivo JSON"
- **Botão "Adicionar ao acervo"** agora aparece na mesma linha do "📋 Parser", depois dele
- Layout: `.template-skeleton-actions-inline` com radio Prova/Quiz/Formulário à esquerda e botões Prompt/Parser/Adicionar à direita

## 3. Admin — Revisão Humana: formulários sem "Gabarito confirmado"

O quadro "Gabarito confirmado" agora é condicional: `{!isFormulario && (...)}`. Formulários apenas coletam dados e não têm respostas corretas, então o quadro não aparece.

---

## 4. Student — Tela de filtros para "Iniciar prova" (nova)

Botão "Iniciar prova" agora leva à tela `prova-filters` (em vez de iniciar direto a prova sugerida). A tela contém:

### 4.1 Prova aleatória
- Texto "Prova aleatória" + botão "Começar uma prova" no topo e no final
- Sorteia uma prova do acervo que atende a todos os filtros ativos

### 4.2 Gráfico de linhas (SVG)
- Mostra as últimas 20 provas concluídas
- **Linha sólida** (azul-tinta #17324d): percentual de acertos (0-100%)
- **Linha tracejada** (verde #b9e34d): TRI simplificada (0-1000)
- Legenda abaixo do gráfico
- Se não houver provas: mostra mensagem "Nenhuma prova concluída ainda"

### 4.3 Filtros
- **Bancas**: só aparece se houver ≥2 bancas no acervo. Botão "Todas as bancas" + um por banca
- **Cargos**: só aparece se houver ≥2 cargos. Mesma lógica
- **Anos**: só aparece se houver ≥2 anos. Mesma lógica
- **Status** (sempre aparece): Inéditas / Concluídas / Acerto <90%
  - Cada botão mostra a contagem entre parênteses
  - Desabilitado se contagem = 0

### 4.4 Contadores mensais
- "PROVAS CONCLUÍDAS — Nesse mês: ## · Mês anterior: ##"
- Mínimo 2 dígitos, começando por 00

### 4.5 Quadros melhor matéria / mais dificuldade
- Dois cards lado a lado
- **Melhor matéria**: maior percentual de acertos (desempate: mais acertos → menor tempo médio → ordem alfabética)
- **Mais dificuldade**: menor percentual de acertos (mesmo critério de desempate)
- Cada card mostra: nome, acertos, percentual, tempo médio

### 4.6 Botão "Reiniciar acompanhamento"
- Limpa todo o histórico de performance (as provas permanecem no acervo)
- Confirmação antes de apagar

---

## 5. Student — Botão "Hora do quiz" (novo)

Novo botão na tela inicial, entre "Questão rápida" e o cartão de contagem:
- Ícone: `Clock` (relógio) do lucide-react
- Texto: "Hora do quiz"
- Leva à tela `quiz-setup`

## 6. Student — Tela de filtros para quiz (nova)

### 6.1 Quiz aleatório
- Texto "Quiz aleatório" + botão "Começar um quiz" no topo e no final
- Sorteia um quiz que atende aos filtros

### 6.2 Filtro por temáticas
- Só aparece se houver ≥2 temáticas no acervo
- Botão "Todas as temáticas" + um por temática

### 6.3 Grade de quiz concluídos
- Máximo 10 quiz, do mais recente ao mais antigo
- Grid de 2 colunas (1 coluna em telas ≤600px)
- Cada card mostra: título do quiz, % de afinidade, título do final encontrado
- Clicar abre a tela de detalhe do final
- Se o quiz foi excluído do acervo: card fica desabilitado com "indisponível"

---

## 7. Student — Tela de detalhe do final do quiz (nova)

Acessada ao clicar em um card de quiz concluído. Contém:
- **Botões "Voltar" e "Refazer quiz"** no topo e no final
- Título do final da última vez que o quiz foi respondido
- % de afinidade
- Texto pré-determinado "Você é uma mistura única..."
- Texto que explica o final encontrado
- 2º Lugar: % de afinidade + título do segundo lugar
- Botão "Refazer quiz" fica indisponível se o quiz foi excluído do acervo

---

## 8. Persistência de histórico de performance (novo módulo)

### 8.1 `client/src/lib/performanceHistory.ts` (novo arquivo, ~140 linhas)

Armazena um `PerformanceRecord` para cada prova/quiz concluído em `localStorage` (key `kuaa-performance-history`):

```typescript
interface PerformanceRecord {
  attemptId: string;
  examId: string;
  examTitle: string;
  examRole: string;       // cargo
  examBoard: string;      // banca
  examYear: string;
  examKind: "prova" | "quiz" | "formulario";
  completedAt: string;    // ISO
  score: number;           // 0-100
  triSimplificada?: number; // 0-1000
  triPercentual?: number;
  subjectSummary?: Record<string, {...}>;  // para prova
  quizResultIds?: string[];                  // para quiz
  quizResultTitles?: string[];
  quizAffinity?: number;
  quizSecondPlaceId?: string;
  quizSecondPlaceTitle?: string;
  quizSecondPlacePct?: number;
}
```

Funções: `loadPerformanceHistory`, `savePerformanceRecord`, `clearPerformanceHistory`, `lastNProvas`, `countProvasByMonth`, `bestAndWorstSubjects`, `lastQuizResults`.

### 8.2 Integração no `finishExam` e `finishQuiz`
- Toda prova finalizada chama `savePerformanceRecord` com dados da prova + TRI + subjectSummary
- Todo quiz finalizado chama `savePerformanceRecord` com dados do quiz + finais + afinidade

### 8.3 Sobrevivência à exclusão
O histórico é independente do acervo de provas. Se uma prova for excluída, o registro de performance permanece — apenas o botão "Refazer" fica indisponível na tela de detalhe do quiz.

---

## Validação

```
$ npx vite build
✓ 1636 modules transformed.
✓ built in 3.63s

../dist/public/index.html                 368.32 kB │ gzip: 105.75 kB
../dist/public/assets/index-*.css         231.84 kB │ gzip:  39.27 kB
../dist/public/assets/index-*.js          671.98 kB │ gzip: 195.28 kB
```

---

## Arquivos modificados

| Arquivo | Tipo de mudança |
|---|---|
| `client/src/pages/AdminPreviewNew.tsx` | Redesenhar synthetic-generator (2 colunas 60/40), remover 2 botões da seção "Cole o JSON", reposicionar "Adicionar ao acervo", esconder "Gabarito confirmado" em formulários |
| `client/src/pages/Home.tsx` | Adicionar botão "Hora do quiz", criar 3 novas telas (prova-filters, quiz-setup, quiz-result-detail), integrar performanceHistory no finishExam/finishQuiz, adicionar estados de filtros |
| `client/src/lib/performanceHistory.ts` | **NOVO ARQUIVO** (~140 linhas) — persistência de histórico de performance |
| `client/src/index.css` | Adicionar estilos para `generation-2col-layout`, `generation-col-left/right`, `template-skeleton-actions-inline`, `prova-random-cta`, `prova-chart`, `prova-filter-row`, `prova-filter-buttons`, `prova-monthly-counts`, `prova-subject-cards`, `quiz-history-cards`, `quiz-detail-actions`, `quiz-detail-text`, etc. |
