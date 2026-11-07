// HAXYS CAD — ponte MCP para as IAs (ChatGPT/Codex, Claude, Gemini...).
// MCP = protocolo padrão que as IAs usam para mexer em programas (o mesmo do
// conector do Fusion). A IA pede "abra o HAXYS e faça uma peça assim"; a ponte
// liga o HAXYS se precisar e manda as ações para a tela.
//
// Jeitos de rodar (Node, sem pacotes extras):
//   node haxys-ponte.mjs           → servidor na porta 27186 deste computador
//                                     (MCP em http://127.0.0.1:27186/mcp)
//   node haxys-ponte.mjs --stdio   → para apps que ligam o conector sozinhos
//                                     (Codex, Claude Desktop, Gemini CLI):
//                                     repassa ao servidor e o liga se precisar.
// Segurança:
//   - só escuta em 127.0.0.1 (nada de fora entra direto);
//   - pela internet (túnel) só entra quem usa a URL com a senha de
//     ponte/segredo.txt (feita aqui na primeira vez);
//   - a IA só tem ações de CAD fechadas (não roda código).
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
// Ferramentas (lista, descrições, esquemas) e o texto de cada resposta: comuns com a página da nuvem.
import { FERRAMENTAS, textoDaFerramenta } from "./ferramentas.mjs";

const PORTA = 27186;
const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_APP = join(AQUI, "..", "app");
// Ponte que veio com o programa instalado (resources\ponte): abre o próprio HAXYS CAD.exe.
const PROGRAMA = join(AQUI, "..", "..", "HAXYS CAD.exe");
const ENDERECO_APP = "http://localhost:5173/";
const ORIGENS_TELA = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);
// Node de verdade para ligar a ponte (o app da IA pode rodar com outro Node embutido).
const NODE_INSTALADO = join(process.env.ProgramFiles ?? "C:/Program Files", "nodejs", "node.exe");
const NODE = existsSync(NODE_INSTALADO) ? NODE_INSTALADO : process.execPath;
const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];

// Senha e URL do túnel ficam junto da ponte; se o Windows não deixa gravar ali
// (programa instalado em Program Files), ficam em %LOCALAPPDATA%\HAXYS CAD.
const PASTA_SENHA = (() => {
  try {
    const teste = join(AQUI, ".gravavel");
    writeFileSync(teste, "");
    unlinkSync(teste);
    return AQUI;
  } catch {
    const pasta = join(process.env.LOCALAPPDATA ?? homedir(), "HAXYS CAD");
    mkdirSync(pasta, { recursive: true });
    return pasta;
  }
})();

function segredo() {
  const arq = join(PASTA_SENHA, "segredo.txt");
  if (!existsSync(arq)) writeFileSync(arq, randomBytes(18).toString("base64url"));
  return readFileSync(arq, "utf8").trim();
}


// ----------------------------------------------------------- ligação com a tela
let telaAtiva = null; // id da aba que atende
let ativaVisivel = false; // a aba que atende está à vista?
const conhecidas = new Set(); // abas que já perguntaram alguma vez
let vistaEm = 0; // última vez que a aba ativa perguntou
let segurada = null; // { res, tela, timer } pergunta da aba esperando pedido
const fila = []; // pedidos esperando a aba
const esperando = new Map(); // id → { ok, falha, timer }

const conectada = () => !!segurada || Date.now() - vistaEm < 30000;

function entregar() {
  if (!segurada || !fila.length) return;
  const { res, timer } = segurada;
  segurada = null;
  clearTimeout(timer);
  responder(res, 200, fila.shift());
}

function pedirATela(pedido, ms) {
  const id = randomUUID();
  return new Promise((ok, falha) => {
    const timer = setTimeout(() => {
      esperando.delete(id);
      const i = fila.findIndex((p) => p.id === id);
      if (i >= 0) fila.splice(i, 1);
      falha(new Error("O HAXYS não respondeu a tempo (a janela dele está aberta?)."));
    }, ms);
    esperando.set(id, { ok, falha, timer });
    fila.push({ id, ...pedido });
    entregar();
  });
}

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function appNoAr() {
  for (const u of [ENDERECO_APP, "http://127.0.0.1:5173/"]) {
    try {
      // /api/ia só existe no HAXYS CAD: outro programa na 5173 (ex.: painel do JARVIS) não conta.
      const r = await fetch(`${u}api/ia`, { signal: AbortSignal.timeout(1500) });
      // Lê a resposta até o fim: resposta não lida de servidor que fecha a conexão derruba o Node 24 (undici).
      await r.arrayBuffer();
      if (r.ok) return true;
    } catch {
      /* ainda não */
    }
  }
  return false;
}
const iniciar = (cmd, args, cwd) => spawn(cmd, args, { cwd, detached: true, stdio: "ignore", windowsHide: true }).unref();

let abrindo = null;
async function abrirHaxys() {
  if (conectada() && ativaVisivel) return "O HAXYS já está aberto e ligado à ponte.";
  abrindo ??= (async () => {
    const passos = [];
    const instalado = existsSync(PROGRAMA);
    if (!(await appNoAr())) {
      if (instalado) iniciar(PROGRAMA, [], dirname(PROGRAMA));
      else iniciar("cmd.exe", ["/d", "/c", "npx", "vite", "--port", "5173", "--strictPort"], PASTA_APP);
      passos.push(instalado ? "abri o HAXYS CAD" : "liguei o servidor do HAXYS");
      for (let i = 0; i < 60 && !(await appNoAr()); i++) await pausa(1000);
      if (!(await appNoAr())) throw new Error(instalado ? "O HAXYS CAD não abriu. Abra o programa e tente de novo." : "O servidor do HAXYS não ligou (confira a pasta HAXYS_CAD\\app).");
    }
    // Uma janela que já estava aberta (ou o programa que acabou de abrir) pode se ligar enquanto isso.
    for (let i = 0; i < (instalado ? 60 : 6) && !conectada(); i++) await pausa(1000);
    if (conectada() && ativaVisivel) return `Pronto: ${[...passos, "o HAXYS já estava aberto"].join(" e ")}.`;
    iniciar("cmd.exe", ["/d", "/c", "start", "", ENDERECO_APP]);
    passos.push("abri o HAXYS no navegador");
    const antes = telaAtiva;
    for (let i = 0; i < 90 && !(conectada() && telaAtiva !== antes); i++) await pausa(1000);
    if (!conectada() || telaAtiva === antes) throw new Error("O HAXYS abriu, mas a janela não se ligou à ponte em 90 s.");
    return `Pronto: ${passos.join(" e ")}.`;
  })().finally(() => (abrindo = null));
  return abrindo;
}

// ------------------------------------------------------------------ MCP
const texto = (t, erro = false) => ({ content: [{ type: "text", text: t }], ...(erro ? { isError: true } : {}) });

async function chamarFerramenta(nome, args = {}) {
  try {
    if (nome === "abrir_haxys") return texto(await abrirHaxys());
    if (!conectada()) await abrirHaxys();
    if (nome === "construir") {
      if (!Array.isArray(args.passos) || !args.passos.length) return texto('Mande "passos": uma lista de ações.', true);
      const t = textoDaFerramenta(nome, await pedirATela({ tipo: "passos", passos: args.passos }, 180000));
      return texto(t.texto, t.erro);
    }
    if (nome === "estado_do_projeto") {
      const t = textoDaFerramenta(nome, await pedirATela({ tipo: "estado" }, 30000));
      return texto(t.texto, t.erro);
    }
    if (nome === "ver_tela") {
      const t = textoDaFerramenta(nome, await pedirATela({ tipo: "captura", enquadrar: args.enquadrar !== false }, 60000));
      if (!t.imagem) return texto(t.texto, true);
      return { content: [{ type: "image", data: t.imagem, mimeType: "image/png" }, { type: "text", text: t.texto }] };
    }
    return texto(`Ferramenta "${nome}" não existe.`, true);
  } catch (e) {
    return texto(e instanceof Error ? e.message : String(e), true);
  }
}

async function tratarMcp(msg) {
  const { id, method, params } = msg ?? {};
  const resposta = (result) => ({ jsonrpc: "2.0", id, result });
  if (id === undefined || id === null) return null; // aviso (notification): sem resposta
  switch (method) {
    case "initialize":
      return resposta({
        protocolVersion: VERSOES.includes(params?.protocolVersion) ? params.protocolVersion : VERSOES[0],
        capabilities: { tools: {} },
        serverInfo: { name: "haxys-cad", title: "HAXYS CAD", version: "1.0.0" },
        instructions: "HAXYS CAD: CAD 3D local. Para fazer uma peça use a ferramenta construir (abre o HAXYS sozinho), depois ver_tela para conferir. Fale com a pessoa em português do Brasil.",
      });
    case "ping":
      return resposta({});
    case "tools/list":
      return resposta({ tools: FERRAMENTAS });
    case "tools/call":
      return resposta(await chamarFerramenta(params?.name, params?.arguments ?? {}));
    case "resources/list":
      return resposta({ resources: [] });
    case "prompts/list":
      return resposta({ prompts: [] });
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método não existe: ${method}` } };
  }
}

// ------------------------------------------------------------------ HTTP
function responder(res, codigo, corpo, extra = {}) {
  if (res.writableEnded) return;
  const json = corpo === undefined ? "" : JSON.stringify(corpo);
  res.writeHead(codigo, { ...(json ? { "content-type": "application/json; charset=utf-8" } : {}), "cache-control": "no-store", ...extra });
  res.end(json);
}

function lerCorpo(req, max = 20 * 1024 * 1024) {
  return new Promise((ok, falha) => {
    const partes = [];
    let tamanho = 0;
    req.on("data", (p) => {
      tamanho += p.length;
      if (tamanho > max) {
        falha(new Error("grande demais"));
        req.destroy();
      } else partes.push(p);
    });
    req.on("end", () => ok(Buffer.concat(partes).toString("utf8")));
    req.on("error", falha);
  });
}

const igual = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function servidor() {
  const SEGREDO = segredo();
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const host = String(req.headers.host ?? "");
    // Local = deste computador, sem passar pelo túnel.
    const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "") &&
      !req.headers["cf-connecting-ip"] && !req.headers["x-forwarded-for"] &&
      [`127.0.0.1:${PORTA}`, `localhost:${PORTA}`].includes(host);

    // --- A tela do HAXYS (só a página em localhost:5173) ---
    if (url.pathname.startsWith("/ponte/")) {
      const origem = String(req.headers.origin ?? "");
      if (!local || !ORIGENS_TELA.has(origem)) return responder(res, 403, { erro: "só a tela do HAXYS" });
      const cors = { "access-control-allow-origin": origem, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", vary: "origin" };
      if (req.method === "OPTIONS") return responder(res, 204, undefined, cors);
      const tela = url.searchParams.get("tela") ?? "";
      if (url.pathname === "/ponte/proximo" && req.method === "GET") {
        // Quem atende: a janela mais nova (ex.: a que a IA acabou de abrir) ou
        // uma à vista quando a atual está escondida. As outras esperam (409).
        const nova = !conhecidas.has(tela);
        conhecidas.add(tela);
        const visivel = url.searchParams.get("visivel") === "1";
        const livre = !telaAtiva || telaAtiva === tela || nova || (visivel && !ativaVisivel) || (!segurada && Date.now() - vistaEm > 10000);
        // Resposta 200 com "outra" (409 aparecia como erro no console do navegador).
        if (!livre) return responder(res, 200, { outra: true }, cors);
        const trocou = telaAtiva !== tela;
        telaAtiva = tela;
        ativaVisivel = visivel;
        vistaEm = Date.now();
        if (segurada) (trocou ? responder(segurada.res, 200, { outra: true }, cors) : responder(segurada.res, 204, undefined, cors)), clearTimeout(segurada.timer), (segurada = null);
        if (fila.length) return responder(res, 200, fila.shift(), cors);
        const timer = setTimeout(() => {
          if (segurada?.res === res) segurada = null;
          vistaEm = Date.now();
          responder(res, 204, undefined, cors);
        }, 25000);
        segurada = { res, tela, timer };
        res.on("close", () => {
          if (segurada?.res === res) {
            clearTimeout(timer);
            segurada = null;
            vistaEm = Date.now();
          }
        });
        // A resposta vai com os cabeçalhos de CORS.
        const original = res.writeHead.bind(res);
        res.writeHead = (c, h = {}) => original(c, { ...cors, ...h });
        return;
      }
      if (url.pathname === "/ponte/resposta" && req.method === "POST") {
        try {
          const corpo = JSON.parse(await lerCorpo(req));
          const e = esperando.get(corpo.id);
          if (e) {
            esperando.delete(corpo.id);
            clearTimeout(e.timer);
            e.ok(corpo);
          }
          vistaEm = Date.now();
          return responder(res, 204, undefined, cors);
        } catch {
          return responder(res, 400, { erro: "resposta inválida" }, cors);
        }
      }
      return responder(res, 404, { erro: "não existe" }, cors);
    }

    if (url.pathname === "/saude") return responder(res, 200, { haxys: "ponte", tela: conectada() });

    // --- MCP (as IAs) ---
    const caminhoComSenha = url.pathname.startsWith("/mcp/") && igual(url.pathname.slice(5), SEGREDO);
    if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
      if (!caminhoComSenha && !(local && url.pathname === "/mcp")) return responder(res, 404, { erro: "não existe" });
      // Navegadores de outros sites não podem chamar direto.
      const origem = req.headers.origin;
      if (origem && !caminhoComSenha && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origem))) return responder(res, 403, { erro: "origem não permitida" });
      if (req.method === "GET" || req.method === "DELETE") return responder(res, 405, undefined, { allow: "POST" });
      if (req.method !== "POST") return responder(res, 405, undefined, { allow: "POST" });
      let msg;
      try {
        msg = JSON.parse(await lerCorpo(req, 2 * 1024 * 1024));
      } catch {
        return responder(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } });
      }
      const lista = Array.isArray(msg) ? msg : [msg];
      const respostas = (await Promise.all(lista.map(tratarMcp))).filter(Boolean);
      if (!respostas.length) return responder(res, 202);
      return responder(res, 200, Array.isArray(msg) ? respostas : respostas[0]);
    }
    responder(res, 404, { erro: "não existe" });
  });
  srv.requestTimeout = 0;
  srv.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.error(`A porta ${PORTA} já está em uso (a ponte já está ligada?).`);
      process.exit(0);
    }
    throw e;
  });
  srv.listen(PORTA, "127.0.0.1", () => {
    console.log(`Ponte HAXYS ligada: MCP local em http://127.0.0.1:${PORTA}/mcp`);
    console.log(`Pelo túnel: https://<endereço-do-túnel>/mcp/<senha de ${join(PASTA_SENHA, "segredo.txt")}>`);
  });
}

// ------------------------------------------------------------------ stdio
async function pontePronta() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORTA}/saude`, { signal: AbortSignal.timeout(1500) });
    await r.arrayBuffer();
    return r.ok;
  } catch {
    return false;
  }
}

async function modoStdio() {
  if (!(await pontePronta())) {
    spawn(NODE, [fileURLToPath(import.meta.url)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 40 && !(await pontePronta()); i++) await pausa(250);
  }
  const linhas = readline.createInterface({ input: process.stdin });
  // Respostas na ordem dos pedidos (só "construir"/ferramentas longas correm em paralelo).
  let anterior = Promise.resolve();
  linhas.on("line", (linha) => {
    let metodo = "";
    try {
      metodo = JSON.parse(linha)?.method ?? "";
    } catch {
      /* tratado abaixo */
    }
    const feito = anterior.then(() => tratarLinha(linha));
    if (metodo !== "tools/call") anterior = feito.catch(() => {});
  });
  async function tratarLinha(linha) {
    if (!linha.trim()) return;
    let msg;
    try {
      msg = JSON.parse(linha);
    } catch {
      return process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }) + "\n");
    }
    try {
      if (!(await pontePronta())) {
        spawn(NODE, [fileURLToPath(import.meta.url)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
        for (let i = 0; i < 40 && !(await pontePronta()); i++) await pausa(250);
      }
      const r = await fetch(`http://127.0.0.1:${PORTA}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: linha });
      const texto = (await r.text()).trim();
      if (r.status === 202) return;
      process.stdout.write(texto + "\n");
    } catch (e) {
      if (msg?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: `Ponte HAXYS fora do ar: ${e.message}` } }) + "\n");
    }
  }
  linhas.on("close", () => process.exit(0));
}

// ------------------------------------------------------------------ túnel
// Liga a ponte (se precisar) e um túnel rápido do Cloudflare para as IAs da
// internet (ChatGPT, claude.ai, Gemini). O endereço muda a cada vez: fica
// anotado em ponte/URL_PARA_A_IA.txt. Feche esta janela para desligar o túnel.
async function modoTunel() {
  if (!(await pontePronta())) {
    spawn(NODE, [fileURLToPath(import.meta.url)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 40 && !(await pontePronta()); i++) await pausa(250);
  }
  const candidatos = [process.env.CLOUDFLARED, join(process.env.USERPROFILE ?? "", "Desktop", "3D", "HAXYS_TOOLS", "cloudflared.exe"), "cloudflared"].filter(Boolean);
  const exe = candidatos.find((c) => c === "cloudflared" || existsSync(c));
  console.log("Ligando o túnel do Cloudflare...");
  const cf = spawn(exe, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${PORTA}`], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let achou = false;
  const ler = (dados) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(dados));
    if (!m || achou) return;
    achou = true;
    const url = `${m[0]}/mcp/${segredo()}`;
    writeFileSync(join(PASTA_SENHA, "URL_PARA_A_IA.txt"), url + "\r\n");
    const linha = "=".repeat(64);
    console.log(["", linha,
      " Endereço do conector HAXYS para a IA (cole no ChatGPT/Claude/Gemini):",
      " " + url,
      ` (também anotado em ${join(PASTA_SENHA, "URL_PARA_A_IA.txt")})`,
      " Não mostre este endereço a ninguém: ele dá acesso ao seu HAXYS.",
      " Deixe esta janela aberta enquanto usar. Fechar = desligar o túnel.",
      linha, ""].join("\n"));
  };
  cf.stdout.on("data", ler);
  cf.stderr.on("data", ler);
  cf.on("error", (e) => {
    console.error(`Não achei o cloudflared (${e.message}). Instale o cloudflared ou ponha o caminho na variável CLOUDFLARED.`);
    process.exit(1);
  });
  cf.on("exit", (c) => {
    console.log(`O túnel parou (código ${c}).`);
    process.exit(c ?? 0);
  });
  process.on("SIGINT", () => cf.kill());
}

if (process.argv.includes("--stdio")) void modoStdio();
else if (process.argv.includes("--tunel")) void modoTunel();
else servidor();
