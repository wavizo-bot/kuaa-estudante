# Contrato de tentativa do estudante

## Princípio

> **A prova simula uma situação de concurso:** existe um único cronômetro geral, iniciado quando o aluno abre a prova pela primeira vez e encerrado somente na finalização. Não há pausa desse cronômetro.

Fechar a prova é uma ação de interface, não uma pausa. Ela serve para interromper a medição individual da questão atual, mas o tempo total da prova continua passando. Sair para o menu inicial, trocar de área, fechar o programa ou executar uma ação equivalente finaliza a tentativa.

## Estados da tentativa

| Estado | Tela e tempo geral | Tempo por assunto | Próxima ação possível |
|---|---|---|---|
| `não_iniciada` | A tela mostra **Abrir prova** e os números das questões. O cronômetro geral é `00:00:00`. | Não há medição. | Abrir prova. |
| `aberta` | A questão atual está visível; o cronômetro geral corre desde a primeira abertura. | A permanência na questão atual é medida. | Marcar resposta, navegar, fechar prova ou finalizar. |
| `fechada` | A prova não exibe enunciado; o cronômetro geral continua correndo. | Nenhum assunto recebe tempo. | Reabrir na última questão visitada ou finalizar. |
| `finalizada` | O cronômetro geral para e o resultado é consolidado. | Nenhuma nova medição. | Ver resumo e estatísticas. |

Ao **reabrir** a prova, o aplicativo retorna à última questão visitada e reinicia a medição individual daquela questão. A ordem das alternativas permanece a mesma durante toda a tentativa.

## Finalização obrigatória

As ações abaixo são equivalentes a **Finalizar prova**:

| Ação | Consequência |
|---|---|
| Botão fixo “Finalizar prova” | Abre confirmação com totais de respondidas e em branco; ao confirmar, finaliza. |
| Retornar ao menu inicial | Finaliza imediatamente após confirmação de segurança. |
| Ir para outra área do programa | Finaliza imediatamente após confirmação de segurança. |
| Fechar a janela, a aba ou o aplicativo | A tentativa é finalizada com o último instante salvo localmente; não se contabiliza tempo após o fechamento. |

Toda questão sem alternativa definida no momento da finalização é registrada como **erro**. Ela entra na nota, na taxa de acerto por assunto e na listagem de itens em branco; não recebe tempo individual se nunca foi aberta.

## Cronômetro geral e persistência

O cronômetro geral é calculado por marcas de data e hora, não apenas por incrementos visuais de um segundo. Assim, ele continua correto enquanto a prova estiver fechada, o aplicativo estiver em segundo plano ou a janela estiver temporariamente sem foco.

O aplicativo salvará uma marca de segurança periódica da tentativa ativa. Caso o navegador seja encerrado de forma abrupta e não permita executar uma rotina de saída, a próxima abertura finaliza a tentativa usando o último instante salvo. Isto evita que o tempo após o fechamento seja acrescentado por engano.

## Tempo válido por assunto

O tempo por assunto é uma métrica de análise, não uma informação exibida durante a prova. Ele é formado por **visitas à questão**, e não pela simples existência de uma resposta marcada.

| Evento | Efeito no tempo do assunto |
|---|---|
| Abrir uma questão com a prova aberta | Inicia uma visita individual. |
| Marcar ou trocar alternativa | Não interrompe a visita. |
| Ir para outra questão | Fecha a visita atual e avalia seu tempo. |
| Fechar a prova | Fecha a visita atual sem contar tempo para o assunto. |
| Finalizar a prova | Fecha a visita atual e avalia seu tempo normalmente. |
| Reabrir prova | Inicia uma nova visita na última questão. |

Uma visita só entra no cálculo do assunto quando respeita as duas regras:

1. Ela dura **mais de 5 segundos**.
2. Ela não excede o teto de tempo configurado para uma única visita.

Visitas de até cinco segundos são tratadas como navegação rápida e descartadas. Visitas acima do teto também são descartadas da média por assunto, pois podem incluir pausa, leitura extraordinariamente longa ou atividade fora da questão. Elas nunca alteram o tempo geral da prova.

### Parâmetro que falta definir

O limite mínimo já está definido em **5 segundos**. Falta escolher o teto da visita. Recomendo iniciar com **20 minutos por questão**, editável nas configurações administrativas. Esse valor descarta pausas longas sem eliminar o tempo de resolução de itens mais trabalhosos. O valor pode ser alterado depois sem invalidar o histórico bruto, pois cada visita será salva com sua duração original.

## Cálculo de nota e indicadores de prova

| Indicador | Regra |
|---|---|
| Nota da tentativa | `(acertos / questões válidas) × 100`, considerando questões em branco como erro. Questões anuladas não entram no denominador. |
| Melhor resultado da prova | Maior nota já concluída para aquela prova. Em empate de nota, vence o menor tempo geral. |
| Média recente | Média das últimas cinco tentativas concluídas, em ordem de finalização. |
| Últimas 10 provas | Lista de tentativas concluídas com prova, data, nota, questões em branco e tempo geral. |
| Por assunto | Acertos, erros, percentual de acerto, tempo médio de visitas válidas e quantidade de visitas descartadas. |

## Questão rápida

Questão rápida não usa cronômetro. Fechar, voltar ou abandonar a pergunta sem responder **não cria evento** e não altera a pontuação.

| Indicador | Regra |
|---|---|
| Pontuação principal | Média de acerto das últimas **50 respostas** registradas em questão rápida. |
| Estatística por assunto | Média de acerto das últimas **200 respostas de cada assunto**. Cada assunto mantém sua própria janela de 200 eventos. |
| Priorização | Questões erradas recebem peso maior na seleção futura, preservando os filtros de assunto escolhidos. |
| Ordem de alternativas | Embaralhada a cada nova questão rápida, mas estável enquanto ela estiver aberta. |

## Dados que precisam ser persistidos

| Entidade | Campos essenciais |
|---|---|
| `Attempt` | `id`, `examId`, estado, início, finalização, último instante salvo, tempo geral, questão atual e respostas. |
| `QuestionVisit` | `attemptId`, `questionId`, assunto, início, fim, duração, motivo de encerramento e se entrou na média. |
| `QuickEvent` | `id`, `examId`, `questionId`, assunto, resposta, correta/incorreta e data. |
| `AttemptSummary` | nota, acertos, erros, em branco, tempo geral, melhor resultado e referências de estatísticas por assunto. |

## Critérios de aceitação

1. Abrir uma prova pela primeira vez inicia o cronômetro geral; fechá-la mantém o cronômetro geral correndo e zera apenas a medição individual ativa.
2. Reabrir mostra a última questão visitada e só inicia novo tempo por assunto quando a questão permanece aberta.
3. Navegar por uma questão por 5 segundos ou menos não altera a média de tempo do assunto.
4. Finalizar, voltar ao menu, mudar de área ou fechar o programa encerra a tentativa; itens sem resposta entram como erros.
5. Uma questão nunca aberta e deixada em branco altera a nota, mas não altera a média de tempo de seu assunto.
6. Questão rápida sem resposta não entra nas janelas de 50 ou 200 eventos.
7. A ordem das alternativas não muda dentro da mesma tentativa de prova.
