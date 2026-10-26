import { defineConfig, type Connect, type Plugin } from "vite";
import { spawn } from "node:child_process";
import { randomBytes, X509Certificate } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createServerSeguro } from "node:https";
import { createServer as createServerTcp, type Server } from "node:net";
import selfsigned from "selfsigned";
import { networkInterfaces } from "node:os";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { montarProjeto } from "./bambuProjeto";

// Serviço local (só neste computador) para mandar a peça ao Bambu Studio:
// GET  /api/bambu → { instalado, caminho }
// POST /api/bambu (corpo = arquivo 3MF; cabeçalho x-nome) → grava em
//      HAXYS_CAD/saida/<nome>.3mf e abre o Bambu Studio com ele.
// Nada sai do computador. O caminho do programa pode ser trocado pela variável
// de ambiente BAMBU_STUDIO.
// Projetos, saídas e a ligação da IA: no programa instalado ficam em Documentos\HAXYS CAD
// (variável HAXYS_DADOS, posta pelo electron/main.cjs); aqui, na pasta HAXYS_CAD.
const PASTA_DADOS = process.env.HAXYS_DADOS ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_SAIDA = join(PASTA_DADOS, "saida");
const BAMBU = process.env.BAMBU_STUDIO ?? "C:\\Program Files\\Bambu Studio\\bambu-studio.exe";
const SUITE = process.env.BAMBU_SUITE ?? "C:\\Program Files\\Bambu Suite\\BambuSuite.exe";

// Impressoras Bambu: lidas dos perfis que vêm com o Bambu Studio (bico 0,4),
// seguindo "inherits" até achar a área e a altura. Área = retângulo [x0, y0,
// x1, y1] em mm; "bicos" = área e altura de cada bico (H2C/H2D).
interface Impressora {
  nome: string;
  area: [number, number, number, number];
  altura: number;
  bicos?: { area: [number, number, number, number]; altura: number }[];
}
function lerImpressoras(): Impressora[] {
  const pasta = join(dirname(BAMBU), "resources", "profiles", "BBL", "machine");
  if (!existsSync(pasta)) return [];
  const ler = (n: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(join(pasta, `${n}.json`), "utf8"));
    } catch {
      return null;
    }
  };
  const valor = (inicio: Record<string, unknown>, chave: string): unknown => {
    let d: Record<string, unknown> | null = inicio;
    for (let i = 0; d && i < 10; i++) {
      if (d[chave] !== undefined) return d[chave];
      d = typeof d.inherits === "string" ? ler(d.inherits) : null;
    }
    return undefined;
  };
  const retangulo = (pts: string[]): [number, number, number, number] => {
    const xy = pts.map((p) => p.split("x").map(Number));
    return [Math.min(...xy.map((q) => q[0])), Math.min(...xy.map((q) => q[1])), Math.max(...xy.map((q) => q[0])), Math.max(...xy.map((q) => q[1]))];
  };
  const lista: Impressora[] = [];
  for (const f of readdirSync(pasta).filter((f) => / 0\.4 nozzle\.json$/.test(f))) {
    const d = ler(f.slice(0, -5));
    const nome = d && (valor(d, "printer_model") as string);
    const area = d && (valor(d, "printable_area") as string[] | undefined);
    if (!d || !nome || !Array.isArray(area)) continue;
    const altura = Number(valor(d, "printable_height") ?? 0);
    const areasBico = valor(d, "extruder_printable_area") as string[] | undefined;
    const alturasBico = valor(d, "extruder_printable_height") as string[] | undefined;
    const imp: Impressora = { nome, area: retangulo(area), altura };
    if (Array.isArray(areasBico) && areasBico.length > 1)
      imp.bicos = areasBico.map((a, i) => ({ area: retangulo(a.split(",")), altura: Number(alturasBico?.[i] ?? altura) }));
    if (!lista.some((x) => x.nome === nome)) lista.push(imp);
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome));
}

// Pedido deste PC, ou do celular pareado (a porta do celular marca req.celular; ver servicoCelular).
const IPS_LOCAIS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
const doCelular = (req: Connect.IncomingMessage) => (req as { celular?: boolean }).celular === true;
const doPc = (req: Connect.IncomingMessage) => IPS_LOCAIS.includes(req.socket.remoteAddress ?? "") || doCelular(req);
// Página de origem aceita: a do HAXYS CAD neste PC ou, no celular, a do mesmo endereço do pedido.
function origemOk(req: Connect.IncomingMessage) {
  const origem = String(req.headers.origin ?? "");
  if (!origem) return true;
  return doCelular(req) ? [`https://${req.headers.host}`, `http://${req.headers.host}`].includes(origem) : /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

function lerCorpo(req: Connect.IncomingMessage, limite = 200 * 1024 * 1024): Promise<Buffer> {
  return new Promise((ok, falha) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > limite) falha(new Error("Arquivo grande demais"));
      else partes.push(c);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", falha);
  });
}

function servicoBambu(): Plugin {
  const tratar: Connect.NextHandleFunction = async (req, res) => {
    const responder = (codigo: number, dados: unknown) => {
      res.statusCode = codigo;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(dados));
    };
    // Só aceita pedidos da própria máquina.
    if (!doPc(req)) return responder(403, { erro: "Só neste computador" });
    if (req.method === "GET") return responder(200, { instalado: existsSync(BAMBU), caminho: BAMBU, suite: existsSync(SUITE), impressoras: lerImpressoras() });
    if (req.method !== "POST") return responder(405, { erro: "Método não aceito" });
    try {
      const dados = await lerCorpo(req);
      if (dados.length < 22 || dados.readUInt32LE(0) !== 0x04034b50) return responder(400, { erro: "Não é um arquivo 3MF" });
      const nome = decodeURIComponent(String(req.headers["x-nome"] ?? "peca")).replace(/[^\p{L}\p{N} _.-]/gu, "_").slice(0, 80) || "peca";
      mkdirSync(PASTA_SAIDA, { recursive: true });
      const arquivo = join(PASTA_SAIDA, `${nome}.3mf`);
      writeFileSync(arquivo, dados);
      if (!existsSync(BAMBU)) return responder(200, { arquivo, aberto: false, erro: "Bambu Studio não encontrado" });
      // Com a impressora: vira projeto do Bambu Studio com as mesas (se falhar, abre o 3MF simples).
      const impressora = decodeURIComponent(String(req.headers["x-impressora"] ?? ""));
      const falhaMesas = impressora && lerImpressoras().some((i) => i.nome === impressora) ? await montarProjeto(BAMBU, dados, impressora, arquivo) : "sem impressora";
      spawn(BAMBU, [arquivo], { detached: true, stdio: "ignore" }).unref();
      responder(200, { arquivo, aberto: true, mesas: falhaMesas === null, erroMesas: falhaMesas ?? undefined });
    } catch (e) {
      responder(500, { erro: e instanceof Error ? e.message : String(e) });
    }
  };
  // POST /api/laser (corpo = SVG; cabeçalho x-nome) → grava em saida/<nome>.svg
  // e abre a Bambu Suite (programa do laser/corte) com ele.
  const laser: Connect.NextHandleFunction = async (req, res) => {
    const responder = (codigo: number, dados: unknown) => {
      res.statusCode = codigo;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(dados));
    };
    if (!doPc(req)) return responder(403, { erro: "Só neste computador" });
    if (req.method !== "POST") return responder(405, { erro: "Método não aceito" });
    try {
      const dados = await lerCorpo(req, 20 * 1024 * 1024);
      if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(dados.subarray(0, 300).toString("utf8"))) return responder(400, { erro: "Não é um SVG" });
      const nome = decodeURIComponent(String(req.headers["x-nome"] ?? "laser")).replace(/[^\p{L}\p{N} _.-]/gu, "_").slice(0, 80) || "laser";
      mkdirSync(PASTA_SAIDA, { recursive: true });
      const arquivo = join(PASTA_SAIDA, `${nome}.svg`);
      writeFileSync(arquivo, dados);
      if (!existsSync(SUITE)) return responder(200, { arquivo, aberto: false, erro: "Bambu Suite não encontrada" });
      spawn(SUITE, [arquivo], { detached: true, stdio: "ignore" }).unref();
      responder(200, { arquivo, aberto: true });
    } catch (e) {
      responder(500, { erro: e instanceof Error ? e.message : String(e) });
    }
  };
  return {
    name: "haxys-bambu",
    configureServer(s) {
      s.middlewares.use("/api/bambu", tratar);
      s.middlewares.use("/api/laser", laser);
    },
    configurePreviewServer(s) {
      s.middlewares.use("/api/bambu", tratar);
      s.middlewares.use("/api/laser", laser);
    },
  };
}

// Falar com a IA sem chave paga: o painel de voz manda o pedido para /api/ia e
// daqui roda o Codex (login do ChatGPT da pessoa) ou o Claude Code (login da
// assinatura do Claude) neste computador, com a ponte do HAXYS CAD como única
// ferramenta. A IA constrói pela ponte e devolve uma resposta curta.
// GET  /api/ia → { codex, claude } (qual programa existe aqui)
// POST /api/ia { ia: "codex"|"claude", texto, conversa?, imagem?: {tipo, base64} }
//      → { resposta } ou { erro }
// Segurança: só este computador e só a página do HAXYS CAD; os programas rodam
// sem pasta de trabalho gravável e sem comandos (Codex: sandbox só leitura;
// Claude: só as ferramentas mcp__haxys__*). Só as ferramentas do HAXYS CAD
// são liberadas sem pergunta.
const PONTE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ponte", "haxys-ponte.mjs");
const NODE_EXE = existsSync("C:\\Program Files\\nodejs\\node.exe") ? "C:\\Program Files\\nodejs\\node.exe" : process.execPath;
// No programa instalado pode não haver Node: o próprio HAXYS CAD.exe (Electron) roda a ponte como Node.
const COMO_NODE: Record<string, string> = NODE_EXE === process.execPath && process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
const CASA = process.env.USERPROFILE ?? "";
// O codex.exe junto do "code-mode host" (o da pasta .sandbox-bin não acha o host).
const CODEX = [join(CASA, ".codex", "plugins", ".plugin-appserver", "codex.exe"), join(CASA, ".codex", ".sandbox-bin", "codex.exe")].find((c) => existsSync(c)) ?? "";
const CLAUDE = (() => {
  const base = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  try {
    const pasta = readdirSync(base).find((d) => d.startsWith("Anthropic.ClaudeCode"));
    if (pasta && existsSync(join(base, pasta, "claude.exe"))) return join(base, pasta, "claude.exe");
  } catch {
    /* sem WinGet */
  }
  const local = join(CASA, ".local", "bin", "claude.exe");
  return existsSync(local) ? local : "";
})();

const INSTRUCOES = `Você é o assistente do painel de voz do HAXYS CAD (CAD 3D parecido com o Autodesk Fusion).
Use só as ferramentas do servidor haxys (construir, estado_do_projeto, ver_tela) para olhar e mudar a peça.
Antes de mudar uma peça que já existe, veja o estado_do_projeto. Não apague nada sem a pessoa pedir.
A resposta final vai ser lida em voz alta: responda em português do Brasil, em 1 a 3 frases curtas, com os números importantes (medidas, volume).`;

// Pedido "Replicar peça da foto": a IA estuda as fotos (com o marcador HAXYS de
// 40 mm e a régua, se houver), pesquisa a peça na internet, constrói, confere e
// vê se cabe na impressora; se não couber, corta com encaixes.
const INSTRUCOES_REPLICA = `MODO REPLICAR PEÇA DA FOTO. Objetivo: replicar a peça das fotos com a maior precisão possível.
1. Estude todas as fotos anexadas. Medidas: se houver o marcador HAXYS (quadrado preto de 40 mm com quadrado branco de 20 mm no meio)
   ou a régua de 150 mm, use-os como escala (meça em pixels e converta). As medidas que a pessoa informou valem mais que as estimadas.
   Se a folha de referência inteira aparecer, confira a impressão: a folha A4 tem 210 mm de largura; se pela régua/marcador ela der
   outra largura, a impressão saiu encolhida: use a largura da folha (210 mm) como escala e avise a pessoa.
   A escala da folha só vale na altura do papel: partes altas da peça parecem maiores (mais perto da câmera).
   Paquímetro ou régua nas fotos: leia as medidas neles (escala principal + nônio) e prefira essas às da folha.
   Não copie medidas do projeto que já está aberto: ele pode ser outra peça. Sem nenhuma escala na foto, estime pelo
   tipo de peça (pesquisa de medidas padrão) e diga que é estimativa.
2. Pesquise na internet a peça (nome, uso, medidas padrão, normas, rosca, encaixes) para completar o que a foto não mostra.
3. Construa com a ferramenta construir (novo_projeto primeiro), em partes lógicas: base, furos, detalhes, arredondamentos.
4. Confira com ver_tela e estado_do_projeto, compare com a foto e corrija.
5. Rode verificar_impressao. Se não couber na impressora da pessoa, use corte_encaixes (pinos ou cavilhas) até caber e confira de novo.
   Encaixe imprimível: diâmetro do pino ≈ metade da espessura da peça no corte (mínimo 2 mm), comprimento ≈ 2 a 3 × o diâmetro,
   folga 0,2 mm; corte longe de furos. Se a peça tiver menos de 4 mm de espessura no corte, avise que o encaixe fica fraco.
6. Na resposta: diga as medidas principais que você usou e de onde vieram (marcador, informado, pesquisa ou estimado), se cabe
   inteira ou em quantas partes, e faça UMA pergunta curta sobre o que ajustar ou confirmar.`;

function rodar(exe: string, args: string[], cwd: string, limiteMs: number): Promise<{ codigo: number; saida: string }> {
  return new Promise((ok) => {
    const p = spawn(exe, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let saida = "";
    p.stdout.on("data", (d: Buffer) => (saida += d.toString("utf8")));
    p.stderr.on("data", (d: Buffer) => (saida += d.toString("utf8")));
    const relogio = setTimeout(() => p.kill(), limiteMs);
    p.on("close", (codigo) => (clearTimeout(relogio), ok({ codigo: codigo ?? -1, saida })));
    p.on("error", (e) => (clearTimeout(relogio), ok({ codigo: -1, saida: String(e) })));
  });
}

// IA com a chave da própria pessoa: qualquer serviço no formato "chat completions"
// da OpenAI (OpenAI, Gemini, Claude, OpenRouter, Groq, Ollama, LM Studio...).
// A ligação fica em <dados>/ia.json, só neste PC (fora do git); a chave nunca
// volta para a tela. A IA recebe as ferramentas da ponte e este servidor as chama.
interface Ligacao { modo?: string; base?: string; modelo?: string; chave?: string }
const ARQ_LIGACAO = join(PASTA_DADOS, "ia.json");
function lerLigacao(): Ligacao {
  try {
    return JSON.parse(readFileSync(ARQ_LIGACAO, "utf8"));
  } catch {
    return {};
  }
}
const PONTE_HTTP = "http://127.0.0.1:27186";
async function garantirPonte() {
  const viva = () => fetch(`${PONTE_HTTP}/saude`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  if (await viva()) return;
  spawn(NODE_EXE, [PONTE], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, ...COMO_NODE } }).unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((ok) => setTimeout(ok, 250));
    if (await viva()) return;
  }
  throw new Error("A ponte do HAXYS CAD não ligou.");
}
interface RespostaPonte { tools?: { name: string; description: string; inputSchema: unknown }[]; content?: { type: string; text?: string }[]; isError?: boolean }
let idPonte = 0;
async function chamarPonte(method: string, params: unknown): Promise<RespostaPonte> {
  const r = await fetch(`${PONTE_HTTP}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++idPonte, method, params }), signal: AbortSignal.timeout(300000) });
  const j = (await r.json()) as { result?: RespostaPonte; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result ?? {};
}
function erroDaEmpresa(codigo: number, j: { error?: { message?: string } | string } | null): string {
  const msg = (typeof j?.error === "string" ? j.error : j?.error?.message ?? "").slice(0, 300);
  if (codigo === 401 || codigo === 403) return `A empresa da IA não aceitou a chave. Confira se colou a chave inteira. (${msg})`;
  if (codigo === 429) return `Limite da sua conta atingido (cota grátis ou créditos). Espere um pouco ou confira o plano no site da empresa. (${msg})`;
  if (codigo === 404) return `Modelo ou endereço não encontrado: confira o nome do modelo. (${msg})`;
  return `A IA respondeu com erro ${codigo}. ${msg}`;
}
async function conversarComChave(c: Ligacao, pedido: string, imagens: { tipo: string; base64: string }[], comFerramentas = true): Promise<string> {
  let ferramentas: unknown[] | undefined;
  if (comFerramentas) {
    await garantirPonte();
    const { tools = [] } = await chamarPonte("tools/list", {});
    ferramentas = tools.filter((t) => t.name !== "abrir_haxys").map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  }
  const conteudo = imagens.length ? [{ type: "text", text: pedido }, ...imagens.map((im) => ({ type: "image_url", image_url: { url: `data:${im.tipo};base64,${im.base64}` } }))] : pedido;
  const msgs: unknown[] = [{ role: "user", content: conteudo }];
  for (let volta = 0; volta < 20; volta++) {
    let r: Response;
    try {
      r = await fetch(`${c.base!.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(c.chave ? { authorization: `Bearer ${c.chave}` } : {}) },
        body: JSON.stringify({ model: c.modelo, messages: msgs, ...(ferramentas ? { tools: ferramentas } : {}) }),
        signal: AbortSignal.timeout(240000),
      });
    } catch (e) {
      throw new Error(/localhost|127\.0\.0\.1/.test(c.base!) ? "A IA deste PC (Ollama / LM Studio) não respondeu: abra o programa dela e tente de novo." : `Sem ligação com a empresa da IA: ${e instanceof Error ? e.message : e}`);
    }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(erroDaEmpresa(r.status, j));
    const m = j?.choices?.[0]?.message as { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments?: string } }[] } | undefined;
    if (!m) throw new Error("A IA mandou uma resposta vazia.");
    msgs.push(m);
    if (!m.tool_calls?.length) return String(m.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim() || "(a IA não escreveu resposta)";
    for (const t of m.tool_calls) {
      let texto: string;
      try {
        const res = await chamarPonte("tools/call", { name: t.function.name, arguments: JSON.parse(t.function.arguments || "{}") });
        // shortcut: a foto do ver_tela não vai para a IA (nem todo modelo aceita imagem); mandar quando houver opção "modelo com visão".
        texto = (res.content ?? []).filter((x) => x.type === "text").map((x) => x.text).join("\n") || "(feito)";
        if (res.isError) texto = `ERRO: ${texto}`;
      } catch (e) {
        texto = `ERRO: ${e instanceof Error ? e.message : e}`;
      }
      msgs.push({ role: "tool", tool_call_id: t.id, content: texto });
    }
  }
  return "Parei depois de 20 passos sem terminar. Veja a peça e peça para continuar.";
}

function servicoIA(): Plugin {
  const tratar: Connect.NextHandleFunction = async (req, res) => {
    const responder = (codigo: number, dados: unknown) => {
      res.statusCode = codigo;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(dados));
    };
    if (!doPc(req)) return responder(403, { erro: "Só neste computador" });
    if (!origemOk(req)) return responder(403, { erro: "Só a página do HAXYS CAD" });
    const rota = (req.url ?? "/").split("?")[0];
    if (req.method === "GET") {
      const c = lerLigacao();
      return responder(200, { codex: !!CODEX, claude: !!CLAUDE, ligada: c.modo ?? "", base: c.base ?? "", modelo: c.modelo ?? "", temChave: !!c.chave });
    }
    if (req.method !== "POST") return responder(405, { erro: "Método não aceito" });
    try {
      if (rota === "/config" || rota === "/teste") {
        const q = JSON.parse((await lerCorpo(req, 64 * 1024)).toString("utf8")) as Ligacao;
        const antes = lerLigacao();
        const modo = ["chave", "codex", "claude", "local"].includes(String(q.modo)) ? String(q.modo) : "";
        const base = String(q.base ?? "").trim();
        if (modo === "chave" && !/^https?:\/\/\S+$/.test(base)) return responder(400, { erro: "Endereço do serviço inválido (precisa começar com https://)." });
        // Chave em branco = manter a que já estava guardada para o mesmo endereço.
        const chave = String(q.chave ?? "").trim().slice(0, 500) || (antes.base === base ? antes.chave : "") || "";
        const nova: Ligacao = modo === "chave" ? { modo, base, modelo: String(q.modelo ?? "").trim().slice(0, 120), chave } : { modo };
        if (rota === "/teste") {
          if (modo !== "chave") return responder(400, { erro: "O teste é só para a IA com chave." });
          return responder(200, { resposta: await conversarComChave(nova, "Responda só com a palavra: ok", [], false) });
        }
        mkdirSync(PASTA_DADOS, { recursive: true });
        writeFileSync(ARQ_LIGACAO, JSON.stringify(nova, null, 2));
        return responder(200, { ok: true });
      }
      const p = JSON.parse((await lerCorpo(req, 80 * 1024 * 1024)).toString("utf8")) as {
        ia?: string;
        texto?: string;
        conversa?: string;
        imagem?: { tipo: string; base64: string };
        imagens?: { tipo: string; base64: string }[];
        replica?: boolean;
      };
      const texto = String(p.texto ?? "").slice(0, 4000).trim();
      if (!texto) return responder(400, { erro: "Pedido vazio" });
      const conversa = String(p.conversa ?? "").slice(-6000);
      const pedido = `${INSTRUCOES}\n${p.replica ? `\n${INSTRUCOES_REPLICA}\n` : ""}${conversa ? `\nConversa recente:\n${conversa}\n` : ""}\nPedido da pessoa: ${texto}`;
      const pasta = join(PASTA_SAIDA, ".ia");
      mkdirSync(pasta, { recursive: true });
      if (p.ia === "chave") {
        const c = lerLigacao();
        if (c.modo !== "chave" || !c.base) return responder(400, { erro: "Nenhuma IA com chave ligada. Use o botão Ligar IA." });
        const imagens = [...(p.imagens ?? []), ...(p.imagem ? [p.imagem] : [])].filter((im) => im?.base64 && /^image\/(png|jpeg|webp|gif)$/.test(im.tipo)).slice(0, 30);
        return responder(200, { resposta: await conversarComChave(c, pedido, imagens) });
      }
      if (p.ia === "claude") {
        if (!CLAUDE) return responder(400, { erro: "O Claude Code não está instalado neste computador." });
        const mcp = JSON.stringify({ mcpServers: { haxys: { command: NODE_EXE, args: [PONTE, "--stdio"], env: COMO_NODE } } });
        const r = await rodar(CLAUDE, ["-p", pedido, "--output-format", "json", "--mcp-config", mcp, "--strict-mcp-config", "--allowedTools", "mcp__haxys__construir mcp__haxys__estado_do_projeto mcp__haxys__ver_tela mcp__haxys__abrir_haxys"], pasta, 300000);
        let j: { result?: string; is_error?: boolean } = {};
        try {
          j = JSON.parse(r.saida.slice(r.saida.indexOf("{")));
        } catch {
          /* não veio JSON */
        }
        if (/not logged in|\/login/i.test(j.result ?? r.saida))
          return responder(401, { erro: 'O Claude Code deste computador não está logado. Na pasta HAXYS_CAD\\ponte, dê dois cliques em ENTRAR_NO_CLAUDE.bat e entre com a sua conta do Claude (uma vez só).' });
        if (j.is_error || !j.result) return responder(502, { erro: `O Claude não respondeu: ${(j.result ?? r.saida).slice(0, 300)}` });
        return responder(200, { resposta: j.result });
      }
      if (!CODEX) return responder(400, { erro: "O Codex não está instalado neste computador." });
      const resposta = join(pasta, "resposta.txt");
      writeFileSync(resposta, "");
      const args = [
        "exec", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "-s", "read-only",
        "-c", `mcp_servers.haxys.command='${NODE_EXE}'`,
        "-c", `mcp_servers.haxys.args=['${PONTE}','--stdio']`,
        "-c", "mcp_servers.haxys.startup_timeout_sec=60",
        "-c", "mcp_servers.haxys.tool_timeout_sec=240",
        "-c", 'mcp_servers.haxys.default_tools_approval_mode="approve"',
        ...(COMO_NODE.ELECTRON_RUN_AS_NODE ? ["-c", 'mcp_servers.haxys.env={ELECTRON_RUN_AS_NODE="1"}'] : []),
        // Pesquisa na internet (para conhecer a peça: medidas padrão, uso, normas).
        "-c", 'web_search="live"',
        "-o", resposta,
      ];
      // Fotos anexadas (até 30), gravadas em saida/.ia e passadas com -i.
      const imagens = [...(p.imagens ?? []), ...(p.imagem ? [p.imagem] : [])].filter((im) => im?.base64 && /^image\/(png|jpeg|webp|gif)$/.test(im.tipo)).slice(0, 30);
      imagens.forEach((im, i) => {
        const img = join(pasta, `imagem${i + 1}.${im.tipo.split("/")[1]}`);
        writeFileSync(img, Buffer.from(im.base64, "base64"));
        args.push("-i", img);
      });
      // "--": o -i aceita vários arquivos e engolia o pedido como se fosse foto.
      args.push("--", pedido);
      // Réplica de foto leva mais tempo (pesquisa + várias etapas): até 15 minutos.
      const r = await rodar(CODEX, args, pasta, p.replica ? 900000 : 300000);
      const final = readFileSync(resposta, "utf8").trim();
      if (!final) return responder(502, { erro: `O Codex não respondeu (${r.codigo}): ${r.saida.slice(-300)}` });
      responder(200, { resposta: final });
    } catch (e) {
      responder(500, { erro: e instanceof Error ? e.message : String(e) });
    }
  };
  return {
    name: "haxys-ia",
    configureServer(s) {
      s.middlewares.use("/api/ia", tratar);
    },
    configurePreviewServer(s) {
      s.middlewares.use("/api/ia", tratar);
    },
  };
}

// Projetos e exportações gravados nas pastas do HAXYS CAD (usado pela ponte das IAs):
// GET  /api/projetos            → lista de HAXYS_CAD/projetos/*.haxys
// GET  /api/projetos/<nome>     → o arquivo
// POST /api/projetos/<nome>     → grava (precisa ser um projeto do HAXYS CAD)
// POST /api/exportar/<nome.ext> → grava em HAXYS_CAD/saida (ext: stl, step, 3mf)
// Só aceita pedidos deste computador E da própria página do HAXYS CAD (outro
// site aberto no navegador não consegue gravar nada).
const PASTA_PROJETOS = join(PASTA_DADOS, "projetos");
const nomeSeguro = (n: string) => decodeURIComponent(n).replace(/[^\p{L}\p{N} _-]/gu, "_").trim().slice(0, 80);

function servicoArquivos(): Plugin {
  const tratar: Connect.NextHandleFunction = async (req, res) => {
    const responder = (codigo: number, dados: unknown) => {
      res.statusCode = codigo;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(dados));
    };
    if (!doPc(req)) return responder(403, { erro: "Só neste computador" });
    const host = String(req.headers.host ?? "");
    if (!origemOk(req) || (!doCelular(req) && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)))
      return responder(403, { erro: "Só a página do HAXYS CAD" });
    // req.url aqui vem sem o prefixo /api.
    const url = new URL(req.url ?? "/", "http://x");
    const partes = url.pathname.split("/").filter(Boolean);
    try {
      if (partes[0] === "projetos") {
        mkdirSync(PASTA_PROJETOS, { recursive: true });
        if (partes.length === 1 && req.method === "GET") {
          const lista = readdirSync(PASTA_PROJETOS)
            .filter((f) => f.toLowerCase().endsWith(".haxys"))
            .map((f) => ({ nome: f.slice(0, -6), tamanho: statSync(join(PASTA_PROJETOS, f)).size, salvoEm: statSync(join(PASTA_PROJETOS, f)).mtime.toISOString() }))
            .sort((a, b) => b.salvoEm.localeCompare(a.salvoEm));
          return responder(200, { pasta: PASTA_PROJETOS, projetos: lista });
        }
        const nome = nomeSeguro(partes[1] ?? "");
        if (!nome) return responder(400, { erro: "Nome inválido" });
        // Imagem do projeto (para a janela Abrir): projetos/.miniaturas/<nome>.png
        if (partes[2] === "imagem") {
          const pasta = join(PASTA_PROJETOS, ".miniaturas");
          const png = join(pasta, `${nome}.png`);
          if (req.method === "GET") {
            if (!existsSync(png)) return responder(404, { erro: "Sem imagem" });
            res.setHeader("Content-Type", "image/png");
            res.setHeader("Cache-Control", "no-cache");
            return res.end(readFileSync(png));
          }
          if (req.method === "POST") {
            const dados = await lerCorpo(req, 5 * 1024 * 1024);
            if (dados.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return responder(400, { erro: "Não é PNG" });
            mkdirSync(pasta, { recursive: true });
            writeFileSync(png, dados);
            return responder(200, { arquivo: png });
          }
        }
        const arquivo = join(PASTA_PROJETOS, `${nome}.haxys`);
        if (req.method === "GET") {
          if (!existsSync(arquivo)) return responder(404, { erro: `O projeto "${nome}" não existe` });
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          return res.end(readFileSync(arquivo));
        }
        if (req.method === "POST") {
          const dados = await lerCorpo(req, 50 * 1024 * 1024);
          const texto = dados.toString("utf8");
          let formato = "";
          try {
            formato = JSON.parse(texto).formato;
          } catch {
            /* não é JSON */
          }
          if (formato !== "haxys-cad") return responder(400, { erro: "Não é um projeto do HAXYS CAD" });
          writeFileSync(arquivo, dados);
          return responder(200, { arquivo });
        }
      }
      if (partes[0] === "exportar" && req.method === "POST") {
        const m = /^(.+)\.(stl|step|3mf)$/i.exec(decodeURIComponent(partes[1] ?? ""));
        const nome = m && nomeSeguro(m[1]);
        if (!m || !nome) return responder(400, { erro: "Nome inválido (use nome.stl, nome.step ou nome.3mf)" });
        const dados = await lerCorpo(req);
        mkdirSync(PASTA_SAIDA, { recursive: true });
        const arquivo = join(PASTA_SAIDA, `${nome}.${m[2].toLowerCase()}`);
        writeFileSync(arquivo, dados);
        return responder(200, { arquivo, bytes: dados.length });
      }
      responder(404, { erro: "Não existe" });
    } catch (e) {
      responder(500, { erro: e instanceof Error ? e.message : String(e) });
    }
  };
  return {
    name: "haxys-arquivos",
    configureServer(s) {
      s.middlewares.use("/api/projetos", (req, res, next) => ((req.url = `/projetos${req.url === "/" ? "" : req.url}`), tratar(req, res, next)));
      s.middlewares.use("/api/exportar", (req, res, next) => ((req.url = `/exportar${req.url}`), tratar(req, res, next)));
    },
    configurePreviewServer(s) {
      s.middlewares.use("/api/projetos", (req, res, next) => ((req.url = `/projetos${req.url === "/" ? "" : req.url}`), tratar(req, res, next)));
      s.middlewares.use("/api/exportar", (req, res, next) => ((req.url = `/exportar${req.url}`), tratar(req, res, next)));
    },
  };
}

// Trazer do Fusion: POST /api/fusion roda ferramentas/fusion_trazer.py dentro do
// Fusion aberto (MCP oficial na porta 27185, modo só-leitura). O script grava
// saida/fusion_trazer.json (linha do tempo + malha de cada operação) e a
// resposta é esse arquivo. Igual ao ferramentas/fusion_mcp.py, em Node.
// Texto Python só com ASCII (o Fusion estraga letras como "Ã" escritas no script).
const textoPython = (s: string) => JSON.stringify(s).replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
function servicoFusion(): Plugin {
  const MCP = "http://127.0.0.1:27185/mcp";
  const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ferramentas", "fusion_trazer.py");
  const postar = async (corpo: unknown, sid?: string) => {
    const r = await fetch(MCP, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(sid ? { "Mcp-Session-Id": sid } : {}) },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const texto = await r.text();
    return { sid: r.headers.get("Mcp-Session-Id") ?? undefined, dados: texto.trim() ? JSON.parse(texto) : null };
  };
  const tratar: Connect.NextHandleFunction = async (req, res) => {
    const responder = (codigo: number, dados: unknown) => {
      res.statusCode = codigo;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(typeof dados === "string" ? dados : JSON.stringify(dados));
    };
    if (!doPc(req)) return responder(403, { erro: "Só neste computador" });
    if (req.method !== "POST") return responder(405, { erro: "Método não aceito" });
    try {
      const { sid } = await postar({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "haxys-cad", version: "0.1" } } }).catch(() => {
        throw new Error("O Fusion não respondeu. Abra o Fusion com o desenho e tente de novo.");
      });
      await postar({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);
      const saida = join(PASTA_SAIDA, "fusion_trazer.json");
      if (existsSync(saida)) unlinkSync(saida);
      const { dados } = await postar(
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "fusion_mcp_execute", arguments: { featureType: "script", object: { script: `SAIDA = ${textoPython(saida)}\n${readFileSync(SCRIPT, "utf8")}`, readOnly: true } } } },
        sid,
      );
      if (dados?.error) throw new Error(String(dados.error.message ?? dados.error));
      if (!existsSync(saida)) {
        const txt = (dados?.result?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
        throw new Error(/Abra um desenho/.test(txt) ? "Abra um desenho no Fusion." : `O Fusion não entregou a peça. ${txt.slice(-300)}`);
      }
      responder(200, readFileSync(saida, "utf8"));
    } catch (e) {
      responder(500, { erro: e instanceof Error ? e.message : String(e) });
    }
  };
  return { name: "haxys-fusion", configureServer: (s) => void s.middlewares.use("/api/fusion", tratar), configurePreviewServer: (s) => void s.middlewares.use("/api/fusion", tratar) };
}

// HAXYS CAD no celular: uma segunda porta (5174) na rede de casa, ligada pelo botão 📱 do PC.
// Só entra o celular pareado: o QR code leva /?c=<código> (guardado em celular.txt na pasta de
// dados), que vira um cookie. Com o cookie, o pedido segue para o mesmo servidor marcado como
// req.celular (doPc / origemOk aceitam). /ponte/* vai para a ponte das IAs (só aceita localhost).
// GET  /api/celular → { ligado, enderecos: [{ ip, rede }], codigo }  (só do próprio PC)
// POST /api/celular → liga a porta (e lembra: religa ao abrir o programa)
function servicoCelular(): Plugin {
  const PORTA = Number(process.env.HAXYS_PORTA_CELULAR) || 5174; // outra porta só para testes
  const ARQUIVO = join(PASTA_DADOS, "celular.txt");
  const CERTIFICADO = join(PASTA_DADOS, "celular-certificado.json");
  let servidor: Server | null = null;
  const codigo = () => {
    if (!existsSync(ARQUIVO)) writeFileSync(ARQUIVO, randomBytes(16).toString("hex"));
    return readFileSync(ARQUIVO, "utf8").trim();
  };
  // Endereços IPv4 deste PC na rede (sem os adaptadores virtuais); Wi-Fi/cabo de casa primeiro.
  const enderecos = () =>
    Object.entries(networkInterfaces())
      .filter(([nome]) => !/vEthernet|WSL|VirtualBox|VMware|Loopback/i.test(nome))
      .flatMap(([nome, lista]) => (lista ?? []).filter((e) => e.family === "IPv4" && !e.internal).map((e) => ({ ip: e.address, rede: nome })))
      .sort((a, b) => Number(!/^(192\.168|10)\./.test(a.ip)) - Number(!/^(192\.168|10)\./.test(b.ip)));
  // O navegador do celular só libera o microfone (reconhecimento de fala) em https: certificado
  // próprio deste PC, feito uma vez e guardado (o celular mostra um aviso só na primeira vez).
  // O iPhone recusa certificado com validade acima de 825 dias: refaz se passar disso ou faltar < 30 dias.
  const certificadoBom = () => {
    try {
      const x = new X509Certificate(JSON.parse(readFileSync(CERTIFICADO, "utf8")).cert);
      const fim = Date.parse(x.validTo), dia = 86400000;
      return fim - Date.parse(x.validFrom) <= 825 * dia && fim - Date.now() > 30 * dia;
    } catch { return false; }
  };
  const certificado = (): { key: string; cert: string } => {
    if (!certificadoBom()) {
      const altNames = [{ type: 2, value: "localhost" }, ...enderecos().map((e) => ({ type: 7, ip: e.ip }))];
      const c = selfsigned.generate([{ name: "commonName", value: "HAXYS CAD" }], {
        days: 800, keySize: 2048, algorithm: "sha256",
        extensions: [{ name: "basicConstraints", cA: false }, { name: "keyUsage", digitalSignature: true, keyEncipherment: true }, { name: "extKeyUsage", serverAuth: true }, { name: "subjectAltName", altNames }],
      });
      writeFileSync(CERTIFICADO, JSON.stringify({ key: c.private, cert: c.cert }));
    }
    return JSON.parse(readFileSync(CERTIFICADO, "utf8"));
  };
  const ligar = (app: Connect.Server) => {
    if (servidor) return;
    const segredo = codigo();
    const seguro = createServerSeguro(certificado(), async (req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      if (url.searchParams.get("c") === segredo) {
        res.writeHead(302, { "set-cookie": `haxys_celular=${segredo}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`, location: "/" });
        return res.end();
      }
      const cookie = /(?:^|;\s*)haxys_celular=([0-9a-f]+)/.exec(String(req.headers.cookie ?? ""))?.[1];
      if (cookie !== segredo) {
        res.writeHead(403, { "content-type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font:18px sans-serif;padding:24px;background:#1c2128;color:#eee"><h2>HAXYS CAD</h2><p>Este celular ainda não está ligado ao HAXYS CAD do PC.</p><p>No PC, toque no botão <b>📱</b> (barra de cima) e leia o QR code com a câmera do celular.</p>`);
      }
      if (url.pathname.startsWith("/ponte/")) {
        // A ponte só fala com a página do PC: o pedido vai como se fosse dela.
        const parar = new AbortController();
        res.on("close", () => parar.abort());
        try {
          const corpo = req.method === "POST" ? await lerCorpo(req, 50 * 1024 * 1024) : undefined;
          const r = await fetch(`http://127.0.0.1:27186${url.pathname}${url.search}`, {
            method: req.method,
            headers: { origin: "http://localhost:5173", "content-type": String(req.headers["content-type"] ?? "application/json") },
            body: corpo,
            signal: parar.signal,
          });
          res.writeHead(r.status, { "content-type": r.headers.get("content-type") ?? "application/json" });
          return res.end(Buffer.from(await r.arrayBuffer()));
        } catch {
          if (!res.headersSent) res.writeHead(502);
          return res.end();
        }
      }
      (req as { celular?: boolean }).celular = true;
      app(req, res);
    });
    // Endereço antigo (http, ícone já salvo no celular): manda para o https na mesma porta.
    const simples = createServer((req, res) => (res.writeHead(301, { location: `https://${req.headers.host}${req.url ?? "/"}` }), res.end()));
    // Uma porta só para os dois: o https começa com o byte 22 (handshake TLS).
    servidor = createServerTcp((sock) =>
      sock.once("data", (b) => {
        sock.pause();
        sock.unshift(b);
        (b[0] === 22 ? seguro : simples).emit("connection", sock);
        process.nextTick(() => sock.resume());
      }),
    );
    servidor.on("error", (e) => (console.error(`Porta do celular (${PORTA}): ${e.message}`), (servidor = null)));
    servidor.listen(PORTA, "0.0.0.0");
  };
  const montar = (app: Connect.Server) => {
    if (existsSync(ARQUIVO)) ligar(app); // já foi ligado antes: religa sozinho
    app.use("/api/celular", (req, res) => {
      const responder = (codigo: number, dados: unknown) => {
        res.statusCode = codigo;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(dados));
      };
      // Só o próprio PC (o celular não pode ver o código).
      if (doCelular(req) || !doPc(req) || !origemOk(req)) return responder(403, { erro: "Só neste computador" });
      if (req.method === "POST") ligar(app);
      responder(200, { ligado: !!servidor, porta: PORTA, enderecos: enderecos(), codigo: servidor ? codigo() : "" });
    });
  };
  return { name: "haxys-celular", configureServer: (s) => montar(s.middlewares), configurePreviewServer: (s) => montar(s.middlewares) };
}

export default defineConfig({
  plugins: [servicoBambu(), servicoIA(), servicoArquivos(), servicoFusion(), servicoCelular()],
  // O worker do núcleo usa import moderno (ES modules).
  worker: { format: "es" },
  // O OpenCascade carrega o próprio .wasm; não deixar o Vite reempacotar.
  optimizeDeps: { exclude: ["replicad-opencascadejs"] },
  // Duas páginas: o programa e o "Ligar a IA" do primeiro uso (escolhido no instalador).
  build: { rollupOptions: { input: { main: resolve(dirname(fileURLToPath(import.meta.url)), "index.html"), ligarIA: resolve(dirname(fileURLToPath(import.meta.url)), "ligar-ia.html") } } },
});
