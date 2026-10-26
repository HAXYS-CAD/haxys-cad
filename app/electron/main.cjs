// HAXYS CAD como programa do Windows (Electron).
// 1. Liga o servidor local na porta 5173: o mesmo do vite.config.ts (Bambu, IA,
//    projetos, Fusion), servindo o app já compilado (dist). Se a porta já estiver
//    ligada (ex.: INICIAR.bat de desenvolvimento), usa ela.
// 2. Liga a ponte das IAs (porta 27186) com o próprio executável como Node.
// 3. Abre a janela: Microsoft Edge em modo aplicativo (o reconhecimento de voz do
//    microfone não funciona dentro do Electron). Sem Edge, janela do Electron.
// 4. Fechou a janela → desliga tudo.
// Projetos e saídas ficam em Documentos\HAXYS CAD (variável HAXYS_DADOS).
const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, unlinkSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

const PORTA = 5173;
const ENDERECO = `http://localhost:${PORTA}/`;
const RAIZ = join(__dirname, ".."); // pasta do app (dist, servidor.mjs)
const PONTE = app.isPackaged ? join(process.resourcesPath, "ponte", "haxys-ponte.mjs") : join(RAIZ, "..", "ponte", "haxys-ponte.mjs");
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

if (!app.requestSingleInstanceLock()) app.quit();
process.env.HAXYS_DADOS ??= join(app.getPath("documents"), "HAXYS CAD");
mkdirSync(process.env.HAXYS_DADOS, { recursive: true });

const noAr = (url) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);

async function ligarServidor() {
  if (await noAr(`${ENDERECO}api/ia`)) return null;
  const { preview } = await import("vite");
  const config = (await import(pathToFileURL(join(RAIZ, "servidor.mjs")).href)).default;
  return preview({ ...config, configFile: false, root: RAIZ, logLevel: "error", preview: { port: PORTA, strictPort: true, host: "localhost" } });
}

let ponte = null;
async function ligarPonte() {
  if (await noAr("http://127.0.0.1:27186/saude")) return;
  // ELECTRON_RUN_AS_NODE: o HAXYS CAD.exe roda o script como se fosse o Node.
  ponte = spawn(process.execPath, [PONTE], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  ponte.unref();
}
app.on("will-quit", () => ponte?.kill()); // a ponte que este programa ligou desliga junto

function acharEdge() {
  const pastas = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  return pastas.map((p) => join(p, "Microsoft", "Edge", "Application", "msedge.exe")).find((p) => existsSync(p));
}

// Janela do Edge ainda aberta? Os processos dela levam a pasta de perfil do HAXYS CAD na linha de comando.
const PERFIL_EDGE = join(app.getPath("userData"), "janela");
function edgeAberto() {
  return new Promise((ok) => {
    const conta = "@(Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:HAXYS_PERFIL) }).Count";
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", conta], { windowsHide: true, env: { ...process.env, HAXYS_PERFIL: PERFIL_EDGE } });
    let saida = "";
    ps.stdout.on("data", (d) => (saida += d));
    ps.on("close", () => ok(Number(saida.trim()) > 0 || saida.trim() === ""));
    ps.on("error", () => ok(true));
  });
}

// Escolheu "ligar a IA" no instalador: a primeira abertura começa pelo assistente.
function primeiraPagina() {
  const marca = join(dirname(process.execPath), "ligar-ia.flag");
  if (!app.isPackaged || !existsSync(marca)) return ENDERECO;
  try {
    unlinkSync(marca);
  } catch {
    /* fica para a próxima */
  }
  return `${ENDERECO}ligar-ia.html`;
}

function abrirNoEdge(edge) {
  const p = spawn(edge, [`--app=${primeiraPagina()}`, `--user-data-dir=${PERFIL_EDGE}`, "--no-first-run", "--no-default-browser-check", "--start-maximized"], { stdio: "ignore" });
  // O Edge pode passar a janela para outro processo dele e sair na hora: então,
  // depois que o processo sair, confere a cada 5 s se ainda há janela do HAXYS CAD.
  p.on("exit", async () => {
    while (await edgeAberto()) await pausa(5000);
    app.quit();
  });
}

function abrirNoElectron() {
  const janela = new BrowserWindow({ width: 1400, height: 900, show: false, icon: join(RAIZ, "build", "icon.png"), autoHideMenuBar: true, title: "HAXYS CAD" });
  janela.webContents.session.setPermissionRequestHandler((_w, permissao, ok) => ok(permissao === "media"));
  janela.webContents.setWindowOpenHandler(({ url }) => (shell.openExternal(url), { action: "deny" }));
  janela.once("ready-to-show", () => (janela.maximize(), janela.show()));
  janela.loadURL(primeiraPagina());
  janela.on("closed", () => app.quit());
}

app.on("window-all-closed", () => {}); // a vida do programa segue a janela (Edge ou Electron)

app.whenReady().then(async () => {
  try {
    await ligarServidor();
    await ligarPonte();
  } catch (e) {
    dialog.showErrorBox("HAXYS CAD", `O HAXYS CAD não conseguiu ligar o servidor local (porta ${PORTA}).\n\n${e instanceof Error ? e.message : e}`);
    return app.quit();
  }
  const edge = process.env.HAXYS_JANELA === "electron" ? null : acharEdge();
  if (edge) abrirNoEdge(edge);
  else abrirNoElectron();
  // Atualização automática: só funciona quando houver um lugar publicado com as
  // versões (configuração "publish" do instalador). Sem isso, não faz nada.
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  } catch {
    /* sem atualização */
  }
});
