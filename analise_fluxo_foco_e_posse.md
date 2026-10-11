# Análise de fluxo e experiência — Foco & Posse

## Visão de uso atual

O **Foco & Posse** organiza a preparação em dois percursos complementares. A intermediadora recebe o retorno estruturado de uma IA, permite corrigir cargo, gabarito, assunto e imagem, e entrega pacotes selecionáveis. O estudante usa as provas completas para simulação e as questões rápidas para revisão adaptativa. Essa separação é coerente porque mantém a edição delicada dos dados fora do ambiente de estudo.

| Momento | Fluxo atual | Resultado para a pessoa usuária |
|---|---|---|
| Preparação | Copiar prompt, usar uma IA externa e colar/importar o JSON | Prova entra no acervo local sem exposição de chaves ou automações externas ocultas. |
| Conferência | Revisar resposta, assunto, texto-base e imagem | A prova pode ser corrigida antes de ser compartilhada. |
| Distribuição | Selecionar e exportar provas | O administrador preserva uma cópia e monta pacotes específicos. |
| Estudo | Escolher prova ou Questão rápida | Ações principais estão juntas e o contador de questões rápidas permanece visível. |
| Continuidade | Usar o botão Android Voltar | O retorno percorre telas internas antes de permitir a saída do aplicativo. |

## Melhorias aplicadas nesta versão

Na biblioteca exclusiva do estudante, a barra superior que dizia apenas que aquela era a versão estudante foi removida. As ações **Iniciar prova** e **Questão rápida** agora formam uma coluna à esquerda; o total de questões rápidas aparece à direita. Em telefone, essa composição reduz a altura inicial sem esconder a informação relevante.

Os temas passaram a ter identidades mais reconhecíveis. **Caderno** permanece a leitura editorial conservadora; **Atlas** adota Newsreader e Space Grotesk, cartões de rota e superfícies cartográficas; **Vigília** usa Manrope e Nunito Sans com títulos condensados, maiúsculas e superfície escura de alta legibilidade. Todos mantêm o verde marca-texto como sinal de ação.

O mesmo APK é adequado para telefone e tablet Android. Ele não fixa orientação, e a interface se recompõe em largura maior: as ações e informações ocupam duas colunas quando há espaço, enquanto em telefone permanecem compactas. O botão físico **Voltar** agora segue esta ordem: questão rápida retorna ao filtro; filtro retorna ao acervo; prova aberta fecha o caderno; prova fechada finaliza a tentativa; no acervo, o Android pode encerrar o aplicativo.

## Melhorias recomendadas após os próximos testes

| Prioridade | Melhoria | Justificativa prática |
|---|---|---|
| Alta | Criar uma tela de confirmação resumida antes de finalizar a prova | Evita encerramento involuntário e mostra o número de questões em branco. |
| Alta | Mostrar uma busca por prova no estudante quando o acervo ultrapassar 20 itens | A paginação evita telas longas, mas busca reduz ainda mais o esforço de localização. |
| Média | Adicionar filtro de provas por cargo e assunto ao lado da busca | Ajuda um aluno que estuda para mais de um cargo a reduzir o acervo ativo. |
| Média | Criar uma cópia de segurança automática exportável na intermediadora | Reduz a dependência de lembrar de exportar antes de trocar de computador. |
| Média | Exibir uma frase curta de objetivo da sessão rápida | Por exemplo, “Hoje: priorizando questões ainda não respondidas”, para explicar a adaptação sem poluir a tela. |
| Baixa | Permitir ocultar as preferências de tema em uma aba compacta | Mantém a biblioteca ainda mais curta para quem já escolheu sua aparência preferida. |

> O próximo teste deve confirmar quatro comportamentos em aparelhos reais: instalação por cima da versão anterior, visibilidade do ícone **Foco & Posse**, retorno interno pelo botão Android e leitura em orientação horizontal no tablet.
