# Proposta de reorganização do Caderno de Aprovação

## Decisão principal

O produto deve deixar de apresentar pequenos blocos de demonstração e passar a operar por **acervo de provas**. A área intermediadora passa a ser uma única lista pesquisável, com seleção múltipla e ações em lote. A área estudante passa a ser uma biblioteca de provas e tentativas, sem a noção ambígua de “prova selecionada”.

> **Regra de produto:** uma prova é uma entidade independente, com metadados, questões, revisão, tentativas e resultados próprios. Um pacote de estudante é apenas uma seleção exportável dessas provas.

## Capacidade para dezenas de provas

| Tema | Estado atual | Mudança necessária | Resultado esperado |
|---|---|---|---|
| Catálogo de provas | A prévia já possui identificador e metadados por prova, mas mostra poucas em cartões separados. | Lista virtualmente simples, pesquisa, filtros e paginação visual de 25 a 50 linhas. | Dezenas ou centenas de provas continuam localizáveis. |
| Duplicidades | Há uma impressão digital baseada em metadados. | Aplicar a verificação antes de gravar e oferecer “substituir”, “mesclar” ou “cancelar” se houver conflito. | A mesma prova não entra repetidamente no acervo. |
| Imagens e textos longos | A prévia usa armazenamento simples do navegador. | Migrar provas, imagens e histórico para **IndexedDB**, mantendo apenas preferências pequenas em `localStorage`. | Catálogo local mais confiável e sem bloqueios visíveis ao salvar lotes grandes. |
| Pesquisa | Não há índice de consulta. | Criar índices por cargo, ano, órgão, cidade, banca e situação de revisão. | Consultas como `Engenheiro Civil` ou `Pedagogo 2025` funcionam diretamente. |

A versão atual não deve ser tratada como pronta para dezenas de provas com imagens: ela é um protótipo funcional, mas guarda coleções no armazenamento simples. O `localStorage` é síncrono e pode bloquear a interface com volumes maiores; IndexedDB armazena objetos estruturados e blobs, opera de forma assíncrona e permite índices para pesquisa. [1] [2]

## Área intermediadora: um acervo único

### Cabeçalho compacto

O cabeçalho terá apenas quatro controles: **Importar retorno JSON**, **Colar retorno JSON**, **Copiar prompt** e **Mostrar prompt**. O prompt continua oculto por padrão. “Colar retorno JSON” abre uma caixa de texto para o usuário colar a resposta da IA; esta alternativa é mais previsível do que tentar ler a área de transferência automaticamente, pois navegadores podem negar essa permissão.

### Pesquisa, filtros e operações em lote

| Elemento | Comportamento proposto |
|---|---|
| Campo de pesquisa | Pesquisa única por cargo, órgão, cidade, UF, ano, banca, status e título. Exemplo: `Pedagogo 2025`. |
| Filtros | Situação de revisão, cargo, ano, município/órgão e banca. |
| Seleção | Caixa em cada linha; “selecionar todos os resultados filtrados”; contador de itens marcados. |
| Ações em lote | **Exportar pacote**, **excluir selecionadas** e, futuramente, aplicar rótulos. |
| Ações da linha | **Revisar**, **Testar no estudante** e menu “mais” contendo duplicar, exportar somente esta e excluir. |
| Exclusão | Modal de confirmação com quantidade, títulos afetados e opção de cancelar. Não colocar o ícone de lixeira ao lado do botão principal de estudo. |

Cada linha deverá exibir: caixa de seleção, cargo/título, órgão/cidade, ano, banca, quantidade de questões, situação de revisão e última alteração. A revisão abre a prova escolhida e, ao concluir, retorna à própria lista preservando a busca e os filtros aplicados.

## Área estudante: biblioteca sem “prova selecionada”

Não deve existir uma prova global “selecionada”. A biblioteca apresenta cada prova com o botão principal **Iniciar prova** ou **Retomar tentativa**, seguido de um menu secundário. A exclusão fica dentro desse menu e sempre pede confirmação, informando que apagará também o histórico local daquela prova.

A paleta passa a ser um grupo compacto de três botões identificados por texto: **Papel**, **Azul** e **Noturna**. Ela deve ficar no topo da biblioteca ou em um menu de preferências, sem o bloco explicativo atual.

Na parte superior da biblioteca, três indicadores condensados substituem o espaço hoje usado pela paleta:

| Indicador | Regra |
|---|---|
| Melhor resultado | Melhor nota de cada prova, acompanhada da duração daquela tentativa. Em empate, vence a tentativa mais rápida. |
| Média recente | Média das cinco últimas tentativas **concluídas**, independentemente da prova. |
| Revisão rápida | Taxa de acerto dos últimos 50 registros de questões rápidas. |

## Tentativa de prova: navegação, tempo e finalização

Uma tentativa precisa ser um registro persistente, separado da prova. Ela terá `id`, `examId`, início, fim, tempo ativo, situação (`em_andamento`, `interrompida` ou `concluída`), respostas e tempo por questão.

| Requisito | Comportamento proposto |
|---|---|
| Temporizador geral | Exibido fixamente no cabeçalho durante toda a prova e contado somente enquanto a tentativa está aberta, ativa e visível. |
| Menu inicial ou fechamento | A tentativa é marcada como **interrompida** e o contador para; nada é contado em segundo plano. Ao reabrir, o aluno escolhe retomar ou descartar. |
| Navegador de questões | Questão atual: azul-tinta; respondida: preenchida em verde; em branco: círculo claro/contorno. A legenda informa as três situações e o cabeçalho mostra os totais. |
| Finalização | Botão **Finalizar prova** fixo no cabeçalho e também no rodapé. Ao acioná-lo, um diálogo informa respondidas e em branco antes de confirmar. |
| Questões em branco | São registradas como erro. Para estatística de tempo por assunto, cada questão deixada em branco recebe o tempo ativo acumulado desde o início até a finalização, conforme a regra solicitada. |
| Alternativas | A ordem é definida uma vez ao iniciar a tentativa e não muda até seu encerramento. Uma nova tentativa recebe novo embaralhamento. |

## Estatísticas do estudante

Será criada uma aba **Estatísticas** com quatro painéis:

| Painel | Conteúdo |
|---|---|
| Últimas 10 provas | Data, prova, nota, acertos, questões em branco, duração e situação. |
| Desempenho por assunto | Total respondido, acertos, erros, percentual de acerto e total de questões em branco. |
| Tempo por assunto | Tempo médio das questões respondidas e média incluindo as deixadas em branco pela regra acima. |
| Questões rápidas | Acertos das últimas 50 respostas, assuntos mais errados e itens que voltarão com prioridade. |

O histórico de questões rápidas deve gravar eventos, e não apenas um contador por questão: `questionId`, `examId`, assunto, resposta, correta/incorreta e data. Isso permite calcular corretamente os últimos 50 eventos, mesmo quando a mesma questão aparece mais de uma vez.

## Modelo mínimo de dados

| Entidade | Campos essenciais |
|---|---|
| `Exam` | `id`, órgão, cidade, UF, ano, banca, cargo, caderno, status, questões, revisão e data de alteração. |
| `Question` | Identificador original, assunto, texto-base, alternativas, gabarito, imagem e situação visual. |
| `Attempt` | `id`, `examId`, início/fim, segundos ativos, status, respostas, ordem das alternativas e tempos por questão. |
| `QuickEvent` | `id`, `questionId`, `examId`, assunto, data, resposta, correção e duração. |
| `StudentPackage` | Versão de formato, provas selecionadas, imagens/blobs, data de exportação e identificadores de origem. |

## Ordem recomendada de implementação

1. **Fundação de dados:** migrar o acervo e imagens para IndexedDB, preservar dados existentes e criar as entidades `Attempt` e `QuickEvent`.
2. **Acervo administrativo:** substituir os dois blocos atuais por lista pesquisável, seleção múltipla, revisão/teste por linha, importação de JSON e exclusão confirmada.
3. **Fluxo de prova:** criar tentativa persistente, temporizador fixo, estados de resposta, finalização fixa e retomada ou descarte de tentativa interrompida.
4. **Biblioteca e estatísticas:** simplificar paleta, separar ações perigosas, criar indicadores e painel estatístico.
5. **Pacotes:** manter JSON para começar e evoluir para ZIP quando houver muitas imagens; ambas as versões estudante importam o mesmo formato.

## Única decisão a confirmar

Recomendo **não descartar automaticamente** uma prova ao voltar ao menu ou fechar o programa. Ela deve ficar como “interrompida”, sem contar tempo fora da tela, para o aluno decidir depois entre **Retomar** e **Descartar**. Se a intenção for que essa ação descarte a tentativa imediatamente, a regra deve ser alterada antes da implementação.

## Referências

[1] [MDN — IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)

[2] [MDN — Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
