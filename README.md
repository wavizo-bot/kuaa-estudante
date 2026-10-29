# kuaa Estudante

App de estudo para concursos e provas do público: acervo de provas e quizzes **offline**, modos prova, questão rápida, ritmo e quiz, filtros por banca/cargo e nível de dificuldade alinhado à BNCC, com backup opcional no Google Drive.

![Feature graphic do kuaa Estudante](1024x500.jpg)

## O que tem

- **Acervo offline**: provas e quizzes no próprio aparelho (contrato `kuaa/` em JSON); pacotes novos podem ser baixados dentro do app.
- **Modos de estudo**: prova cronometrada, questão rápida, ritmo (estudo em sequência) e quiz.
- **Filtros**: por banca e por cargo, além de busca por matéria/assunto.
- **Dificuldade BNCC**: cada questão tem nível de dificuldade 1–5 com rótulo exibido na hora.
- **Progresso local**: tentativas, atividade e estatísticas salvas no dispositivo.
- **Backup no Google Drive** (opcional): login único por dispositivo, escopo mínimo `drive.appdata`, sincronização automática e invisível.

## Privacidade e armazenamento

- Os dados de estudo ficam **no dispositivo**; a nuvem só é usada se o usuário conectar o Google Drive.
- Com OAuth/Drive usa-se apenas o escopo `drive.appdata`, com PKCE; o conteúdo **não** é lido para publicidade (Limited Use do Google).
- Documentos legais (servidos pelo app em `client/public/`):
  [Política de Privacidade](client/public/politica-privacidade.html) ·
  [Termos de Serviço](client/public/termos-de-servico.html) ·
  [Aviso Legal](client/public/aviso-legal.html)

## Requisitos

- Android 7 ou superior (app empacotado com Capacitor) ou navegador moderno (versão web).
- Windows 10/11 com WebView2 (versão MSIX publicada no repositório irmão [Kuaa-app-MSIX](https://github.com/wavizo-bot/Kuaa-app-MSIX)).
- Funciona offline; a internet só é necessária para baixar pacotes de provas e para o backup em nuvem.

## Como executar em desenvolvimento

```bash
pnpm install
pnpm dev      # dev server local
```

## Como gerar o build

```bash
pnpm build    # build web de produção (barra de aceite: exit 0)
```

- **Android**: build web + `npx cap sync android` + `gradlew assembleRelease` (R8 com otimizações ativas); o artefato final (AAB) deve ser testado no aparelho antes do envio.
- **Windows/MSIX**: a fonte web é copiada para o repositório irmão `Kuaa-app-MSIX` pelo script `sync-msix.ps1` (em `scripts/` na raiz do ecossistema) e empacotada lá.

## Estrutura de pastas

- `client/` — app React (páginas, libs, componentes)
- `client/public/` — pacote inicial de provas e documentos legais
- `shared/` — código compartilhado (motor de dificuldade em `shared/dificuldade/`)
- `android/` — projeto Capacitor (versão em `android/app/build.gradle`)
- `entregas/` — pacotes prontos: `play\` (AAB) e `windows\` (MSIX), com `historico\`

## Versão atual

**1.8 (versionCode 14)** — publicada na Google Play (alpha); pacote `app-release-vC14-1.8.aab` em `entregas/play/`. Histórico completo em [CHANGES.md](CHANGES.md).

## Links

- Repositório: https://github.com/wavizo-bot/kuaa-estudante
- Banco de dados de provas: https://github.com/wavizo-bot/KuaaRepo
- Landing page (GitHub Pages): ainda não publicada — pendência registrada no log (regra GH3).
- Loja: app publicado na Google Play (applicationId `com.kuaa.estudante`).

## Contato

E-mail **mmr05@hotmail.com** · Telefone **11978831938**

---

## English summary

**kuaa Estudante** is an offline study app for Brazilian public-exam candidates: an on-device bank of exams and quizzes (prova, quick question, rhythm and quiz modes), filters by exam board and role, BNCC-aligned difficulty levels, and optional Google Drive backup (PKCE, `drive.appdata` scope only). Data stays on the device; the web build is packaged with Capacitor (Android) and WebView2 (Windows/MSIX). Free demo for one month after first install; licensing available on request — contact mmr05@hotmail.com.
