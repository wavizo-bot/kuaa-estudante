# Direção visual — Duolingo de Concurso

## Três abordagens exploradas

### 1. Caderno de Aprovação

**Muito Breve Intro:** Um ambiente de estudo que parece um caderno de cursinho bem organizado, com marcações de revisão, margens úteis e sinais de progresso. A intenção é reduzir a ansiedade e transformar prova em rotina visível.

**Probabilidade:** 0.07

### 2. Sala de Comando

**Muito Breve Intro:** Uma estética operacional inspirada em painéis de controle e arquivos públicos, com alta densidade de informação e decisões explícitas. Transmite rigor para quem administra um acervo de provas.

**Probabilidade:** 0.04

### 3. Biblioteca Cívica

**Muito Breve Intro:** Uma interface editorial inspirada em fichários, lombadas e carimbos de biblioteca municipal. A sensação é de acervo confiável, calmo e pessoal, sem parecer uma planilha burocrática.

**Probabilidade:** 0.09

---

## Abordagem escolhida: Caderno de Aprovação

### Design Movement

Editorial utilitário contemporâneo, inspirado em cadernos de preparação, boletins de prova e tipografia de materiais didáticos.

### Core Principles

1. Cada tela deve evidenciar a próxima decisão do usuário, sem esconder o processo de estudo em painéis abstratos.
2. O conteúdo é o protagonista: questões, provas e progresso recebem contraste e espaço respirável.
3. Estados de revisão usam sinais claros de cor, forma e texto, nunca apenas ícones.
4. O produto alterna concentração serena no estudante e organização metódica no intermediador.

### Color Philosophy

O azul-tinta profundo comunica concentração e confiança; o papel marfim reduz fadiga visual; o verde-limão de marca atua como marcador de aprovação e avanço; terracota sinaliza pendências sem transformar a interface em alerta permanente. A cor de assinatura é **Verde Marca-texto #B9E34D**.

### Layout Paradigm

Estrutura em trilho lateral assimétrico. No administrador, uma barra vertical de etapas prende a leitura e um painel de trabalho ocupa o restante. No estudante, a questão tem largura de leitura confortável e o mapa da prova fica em uma faixa lateral que se recolhe no celular.

### Signature Elements

1. Linhas de caderno discretas e números de margem em painéis de conteúdo.
2. Pílulas retangulares com cantos mínimos, como etiquetas coladas em uma folha.
3. Um marcador circular verde, semelhante a um marca-texto, para o estado atual e a nota.

### Interaction Philosophy

As ações principais são sempre objetivas e verbais: “Preparar prompt”, “Iniciar prova”, “Ver próxima questão”. A interface confirma mudanças com pequenos deslocamentos e feedback direto, sem gamificação infantil.

### Animation

Transições de 180–240 ms, usando opacidade e deslocamento curto de 8 px. A troca de etapa no administrador desliza horizontalmente; a seleção de alternativa recebe uma borda e preenchimento gradual. Respeitar `prefers-reduced-motion` e não animar a troca rápida entre questões por teclado.

### Typography System

**Fraunces** para títulos e métricas de destaque, trazendo personalidade editorial. **DM Sans** para interface, campos e corpo de texto pela legibilidade em telas pequenas. Títulos usam contraste serifado; informações operacionais usam caixa alta moderada e espaçamento de letras controlado.

### Brand Essence

Um caderno digital de concursos para organizar provas reais e estudar com clareza, controle e repetição. **Metódico, encorajador, confiável.**

### Brand Voice

Os textos são diretos, calmos e específicos; tratam a preparação como prática contínua, não como urgência vazia.

Exemplos: “Transforme um par de PDFs em um lote revisável.” e “Cada tentativa deixa um rastro útil para a próxima.”

### Wordmark & Logo

O logotipo combina o nome “Caderno” com uma marca gráfica de duas folhas sobrepostas, atravessadas por uma pequena faixa verde inclinada, como um marcador. O símbolo funciona sem texto no cabeçalho e no favicon.

## Style Decisions

- Evitar gradientes roxos, cartões excessivamente arredondados e layouts totalmente centralizados.
- Usar superfícies claras, bordas finas em azul-tinta translúcido e sombra suave apenas para elevar áreas interativas.
- Todos os componentes e folhas de estilo devem iniciar com um comentário que relembre a estética editorial “Caderno de Aprovação”.
- Todas as superfícies principais devem parecer artefatos de papel: fundo marfim, regras finas em azul-tinta, índices de margem visíveis e etiquetas retangulares coladas têm prioridade sobre cartões flutuantes arredondados.
- O Verde Marca-texto `#B9E34D` fica reservado a aprovação, progresso, melhor nota, etapa atual e principal próxima ação.
- As áreas estudante e intermediadora devem compartilhar a gramática de caderno: índices de margem, etiquetas de prova/pacote, sequenciamento editorial e divisores em todas as grandes seções.
- Imagens devem ser exclusivamente de artefatos documentais de estudo, como provas, gabaritos, marcações, clipes e folhas empilhadas; nunca decoração genérica de produtividade.
- O símbolo de duas folhas e marca-texto verde deve manter leitura clara em cabeçalhos e na barra lateral, funcionando como assinatura do produto.
- As superfícies administrativas devem parecer fichas ou folhas de revisão antes de se parecerem com cartões de painel.
- Variantes de tema podem mudar o clima de fundo e a fonte operacional, mas preservam títulos em Fraunces, margens de caderno, linhas pautadas, superfícies de ficha e o Verde Marca-texto como único sinal de ação, aprovação e progresso.
- Imagens de destaque precisam retratar provas, gabaritos, folhas marcadas, clipes, pastas ou papel empilhado; ilustrações genéricas de produtividade não serão usadas como protagonista.
