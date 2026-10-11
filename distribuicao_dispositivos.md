# Distribuição para computador, telefones e tablets

## Decisão recomendada

O sistema terá **dois pacotes independentes**. O primeiro será o **Intermediador**, destinado ao responsável pelo acervo e contendo a administração e a revisão. O segundo será o **Estudante**, menor e sem funções administrativas, destinado aos colegas. Ambos usarão o mesmo formato de pacote de prova, para que o conteúdo preparado no intermediador possa ser levado a qualquer dispositivo.

| Uso | Forma recomendada | Como abrir | Atualizações | Funciona sem internet? |
|---|---|---|---|---|
| Computador — Intermediador | Aplicação web estática/PWA | Link privado ou pasta local servida pelo computador | Reabrir o link atualizado | Sim, após o primeiro carregamento e cache local |
| Computador — Estudante | Aplicação web estática/PWA | Navegador, atalho instalado ou pasta local | Reabrir o link atualizado | Sim, após o primeiro carregamento e cache local |
| Telefone Android — Estudante | **PWA instalada** | Abrir o link no Chrome e usar “Instalar aplicativo” ou “Adicionar à tela inicial” | Atualiza ao abrir com internet | Sim, após instalar/carregar e importar os pacotes |
| Telefone/tablet Android — Estudante | **APK assinado**, se desejar arquivo no Drive | Baixar do Drive e instalar pelo gerenciador de arquivos | Baixar novo APK quando houver versão nova | Sim |

## Telefone e tablet: como funcionará

A versão do estudante será desenhada para a mesma base de dados, mas não será uma cópia comprimida da tela de computador. Em telefone vertical, a navegação de provas, os filtros e a questão ocuparão uma coluna; o cronômetro e a navegação ficam no topo e no rodapé para não cortar a leitura. Em tablets, a mesma aplicação usará duas regiões em modo horizontal — lista de questões à esquerda e folha da questão à direita — e voltará a uma coluna no modo vertical.

O modo recomendado é **PWA**. O estudante recebe um link privado, abre-o uma primeira vez com internet e escolhe a ação de instalar. O Android cria um ícone na tela inicial e passa a abrir a aplicação em uma janela própria. A instalação de uma PWA integra o aplicativo com o sistema de forma mais profunda do que um simples favorito; o suporte offline depende dos recursos que forem colocados no cache local [1]. O link do programa deve estar em uma hospedagem própria; o Google Drive é adequado para distribuir os **pacotes de provas**, mas não é a melhor origem para instalar a PWA.

Se a preferência for receber um arquivo pelo Google Drive, será criada uma versão **APK somente-estudante**. O colega baixa o APK, abre o arquivo e o Android solicita autorização para que Chrome ou o gerenciador de arquivos instale aplicativos recebidos de fontes externas. Essa permissão é específica do aplicativo que abriu o arquivo e deve ser desligada após a instalação; também será essencial compartilhar apenas APKs assinados e obtidos no Drive oficial do grupo [2]. A instalação por APK não exige Play Store.

## Como importar mais provas

O intermediador exportará um arquivo único, por exemplo `enfermeiro-sao-lourenco-2026.caderno.zip`. Ele conterá um manifesto JSON, todas as questões, alternativas, gabaritos revisados, textos-base, assuntos, referências visuais e as imagens necessárias. O estudante tocará em **Importar pacote**, escolherá o ZIP no seletor de arquivos do Android ou tablet e o conteúdo será adicionado ao acervo local. Quando o seletor do dispositivo apresentar o Google Drive, o arquivo poderá ser escolhido diretamente; caso contrário, o estudante primeiro faz download do Drive para a pasta Downloads e então seleciona o arquivo.

> A prévia atual já importa a resposta JSON da IA e mantém revisão, assuntos, textos-base e imagens no navegador. A exportação e a importação reais do pacote ZIP serão a próxima implementação para completar esse fluxo entre dispositivos.

## Referências

[1] [MDN — Installing and uninstalling web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing)

[2] [Samsung — How to Allow App Installs from Unknown Sources](https://www.samsung.com/ae/support/mobile-devices/how-to-enable-permission-to-install-apps-from-unknown-source-on-my-samsung-phone/)
