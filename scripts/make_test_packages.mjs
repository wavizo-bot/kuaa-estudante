import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(projectRoot, "dist", "public");
const outputRoot = "/home/ubuntu/Downloads/foco-e-posse-testes";
const staticRoot = "/home/ubuntu/webdev-static-assets";
const execFileAsync = promisify(execFile);

const variants = [
  { folder: "computador-completo", zip: "foco-e-posse-computador-completo-teste.zip", label: "Foco & Posse — Computador completo", mode: "full", device: "desktop", view: "admin" },
  { folder: "computador-estudante", zip: "foco-e-posse-computador-estudante-teste.zip", label: "Foco & Posse — Computador estudante", mode: "student", device: "desktop", view: "student" },
  { folder: "telefone-estudante", zip: "foco-e-posse-telefone-estudante-teste.zip", label: "Foco & Posse — Telefone estudante", mode: "student", device: "phone", view: "student" },
  { folder: "tablet-estudante", zip: "foco-e-posse-tablet-estudante-teste.zip", label: "Foco & Posse — Tablet estudante", mode: "student", device: "tablet", view: "student" },
];

const imageMap = {
  "/manus-storage/caderno-aprovacao-logo_18795969.png": "assets/caderno-aprovacao-logo.png",
  "/manus-storage/caderno-aprovacao-paper-texture_1071e837.jpg": "assets/caderno-aprovacao-paper-texture.jpg",
  "/manus-storage/caderno-aprovacao-documents_6912e2cc.jpg": "assets/caderno-aprovacao-documents.jpg",
  "/manus-storage/caderno-aprovacao-study-markers_027f742b.jpg": "assets/caderno-aprovacao-study-markers.jpg",
  "/icons/caderno-logo-192-v2.png": "assets/foco-e-posse-logo.png",
};

async function replaceReferences(folder) {
  const assetFolder = path.join(folder, "assets");
  const entries = await readdir(assetFolder);
  const files = [
    path.join(folder, "index.html"),
    ...entries.filter((entry) => entry.endsWith(".js") || entry.endsWith(".css")).map((entry) => path.join(assetFolder, entry)),
  ];

  for (const file of files) {
    let content = await readFile(file, "utf8");
    for (const [remote, local] of Object.entries(imageMap)) content = content.split(remote).join(`./${local}`);
    await writeFile(file, content);
  }
}

async function makeStandaloneHtml(folder) {
  const assetFolder = path.join(folder, "assets");
  const entries = await readdir(assetFolder);
  const jsName = entries.find((entry) => entry.endsWith(".js"));
  const cssName = entries.find((entry) => entry.endsWith(".css"));
  if (!jsName || !cssName) throw new Error("Compiled JS or CSS asset not found");

  const imageUris = {
    "./assets/caderno-aprovacao-logo.png": `data:image/png;base64,${(await readFile(path.join(assetFolder, "caderno-aprovacao-logo.png"))).toString("base64")}`,
    "./assets/caderno-aprovacao-paper-texture.jpg": `data:image/jpeg;base64,${(await readFile(path.join(assetFolder, "caderno-aprovacao-paper-texture.jpg"))).toString("base64")}`,
    "./assets/caderno-aprovacao-documents.jpg": `data:image/jpeg;base64,${(await readFile(path.join(assetFolder, "caderno-aprovacao-documents.jpg"))).toString("base64")}`,
    "./assets/caderno-aprovacao-study-markers.jpg": `data:image/jpeg;base64,${(await readFile(path.join(assetFolder, "caderno-aprovacao-study-markers.jpg"))).toString("base64")}`,
    "./assets/foco-e-posse-logo.png": `data:image/png;base64,${(await readFile(path.join(assetFolder, "foco-e-posse-logo.png"))).toString("base64")}`,
  };

  let css = await readFile(path.join(assetFolder, cssName), "utf8");
  let js = await readFile(path.join(assetFolder, jsName), "utf8");
  for (const [local, uri] of Object.entries(imageUris)) {
    css = css.split(local).join(uri);
    js = js.split(local).join(uri);
  }
  js = js.replaceAll("</script", "<\\/script");

  const indexPath = path.join(folder, "index.html");
  let index = await readFile(indexPath, "utf8");
  index = index
    .replace(new RegExp(`<script defer crossorigin src="\\./assets/${jsName}"></script>`), "")
    .replace(new RegExp(`<link rel="stylesheet" crossorigin href="\\./assets/${cssName}">`), "")
    .replace(/\s*<link rel="manifest"[^>]*>/, "")
    .replace("</head>", () => `<style>${css}</style></head>`)
    .replace("</body>", () => `<script>${js}</script></body>`);
  await writeFile(indexPath, index);
  await rm(assetFolder, { recursive: true, force: true });
  await rm(path.join(folder, "service-worker.js"), { force: true });
  await rm(path.join(folder, "manifest.webmanifest"), { force: true });
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const variant of variants) {
  const folder = path.join(outputRoot, variant.folder);
  await cp(buildRoot, folder, { recursive: true });
  await mkdir(path.join(folder, "assets"), { recursive: true });
  await cp(path.join(staticRoot, "caderno-aprovacao-logo.png"), path.join(folder, "assets", "caderno-aprovacao-logo.png"));
  await cp(path.join(staticRoot, "caderno-aprovacao-paper-texture.jpg"), path.join(folder, "assets", "caderno-aprovacao-paper-texture.jpg"));
  await cp(path.join(staticRoot, "caderno-aprovacao-documents.jpg"), path.join(folder, "assets", "caderno-aprovacao-documents.jpg"));
  await cp(path.join(staticRoot, "caderno-aprovacao-study-markers.jpg"), path.join(folder, "assets", "caderno-aprovacao-study-markers.jpg"));
  await cp(path.join(projectRoot, "client", "public", "icons", "caderno-logo-192-v2.png"), path.join(folder, "assets", "foco-e-posse-logo.png"));
  await replaceReferences(folder);

  const indexPath = path.join(folder, "index.html");
  let index = await readFile(indexPath, "utf8");
  const config = `<script>window.__CADERNO_MODE__=${JSON.stringify(variant.mode)};window.__CADERNO_DEVICE__=${JSON.stringify(variant.device)};window.__CADERNO_VIEW__=${JSON.stringify(variant.view)};</script>`;
  index = index
    .replace("</head>", () => `${config}</head>`)
    .replace(/\s*<script\s+defer[\s\S]*?data-website-id="[^"]*"><\/script>/, "")
    .replace(/<script\s+id="manus-runtime">[\s\S]*?<\/script>/, "")
    .replace(/\s*<script\s+src="\/__manus__\/debug-collector\.js"\s+defer><\/script>/, "")
    .replaceAll('href="/assets/', 'href="./assets/')
    .replaceAll('src="/assets/', 'src="./assets/')
    .replaceAll('type="module" ', "defer ");
  await writeFile(indexPath, index);
  await makeStandaloneHtml(folder);

  const readme = `# ${variant.label}\n\nAbra **index.html** em Chrome, Edge ou outro navegador moderno. Esta é uma versão de teste local e autossuficiente: os dados permanecem no navegador deste dispositivo.\n\n- Modo: ${variant.mode === "full" ? "intermediadora + estudante" : "somente estudante"}.\n- Enquadramento: ${variant.device}.\n- Para o teste em Android, descompacte a pasta e abra index.html pelo navegador. A conversão em APK/PWA instalável será feita na próxima etapa.\n`;
  await writeFile(path.join(folder, "LEIA-ME.txt"), readme);
  await execFileAsync("zip", ["-rq", path.join(outputRoot, variant.zip), "."], { cwd: folder });
}

console.log(JSON.stringify({ outputRoot, variants }, null, 2));
