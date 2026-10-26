// Ponte com as IAs (MCP): a tela fica ligada ao programa "ponte"
// (HAXYS_CAD/ponte/haxys-ponte.mjs, porta 27186 deste computador) e faz o que
// a IA pedir, SÓ por uma lista fechada de ações de CAD (caixa, cilindro,
// esboço, extrusão, furo...). Não roda código vindo de fora.
// A ligação é "long poll": a tela pergunta "tem pedido?" e a ponte segura a
// pergunta até chegar um pedido (ou 25 s). Funciona com a aba em segundo plano.
import type { Projeto } from "../nucleo/projeto";
import type { Vista } from "../vista/cena";
import type { MenuArquivo } from "../arquivo/menuArquivo";
import { criarApi } from "./consoleScript";
import { resumoDoProjeto } from "./voz";
import { PLANOS_ORIGEM, perfisDeMaterial, type DadosEsboco, type PlanoEsboco, type V3 } from "../nucleo/esboco";
import { escreverTexto } from "../nucleo/texto";
import { criarEsbocoDeCorte, planoDeslocadoDaOrigem } from "../comandos/secaoMalha";
import { APARENCIAS, MATERIAIS } from "../nucleo/materiais";
import { mesaEscolhida } from "../comandos/bambu";
import { enviarAoLaser, svgDoLaser } from "../comandos/laser";
import { comandoPosicao, definirContato, duplicarComJuntas, moverJunta } from "../comandos/montagem";

// No celular a ponte passa pela porta do celular (mesmo endereço da página; ver vite.config.ts).
const ENDERECO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://127.0.0.1:27186" : "";

type Args = Record<string, unknown>;
interface Passo extends Args {
  acao: string;
}
interface Pedido {
  id: string;
  tipo: "passos" | "estado" | "captura";
  passos?: Passo[];
  enquadrar?: boolean;
}

// Conferência dos valores que chegam da IA.
const num = (a: Args, k: string, obrig = false): number | undefined => {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (obrig) throw new Error(`falta "${k}"`);
    return undefined;
  }
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || Math.abs(n) > 100000) throw new Error(`"${k}" precisa ser um número em mm`);
  return n;
};
const txt = (a: Args, k: string, obrig = false): string | undefined => {
  const v = a[k];
  if (v === undefined || v === null || v === "") {
    if (obrig) throw new Error(`falta "${k}"`);
    return undefined;
  }
  if (typeof v !== "string" && typeof v !== "number") throw new Error(`"${k}" precisa ser texto`);
  return String(v).slice(0, 200);
};
const MODOS = ["novo", "unir", "cortar", "intersecao"];
const modo = (a: Args) => {
  const m = txt(a, "modo");
  if (m && !MODOS.includes(m)) throw new Error(`modo deve ser ${MODOS.join(", ")}`);
  return m;
};
const posicao = (a: Args) => ({ x: num(a, "x") ?? 0, y: num(a, "y") ?? 0, z: num(a, "z") ?? 0 });
const pontos = (v: unknown, k: string): [number, number][] => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 2000) throw new Error(`"${k}" precisa ser uma lista de [u, v]`);
  return v.map((p) => {
    if (!Array.isArray(p) || p.length !== 2) throw new Error(`cada ponto de "${k}" é [u, v]`);
    return [num({ u: p[0] }, "u", true)!, num({ v: p[1] }, "v", true)!];
  });
};
const circulos = (v: unknown) => {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 500) throw new Error(`"circulos" precisa ser uma lista de {u, v, r}`);
  return v.map((c: Args) => ({ u: num(c, "u", true)!, v: num(c, "v", true)!, r: num(c, "r", true)! }));
};

const eixoXYZ = (a: Args, k: string, padrao: string) => {
  const v = (txt(a, k) ?? padrao).toUpperCase();
  if (!["X", "Y", "Z"].includes(v)) throw new Error(`"${k}" deve ser "X", "Y" ou "Z"`);
  return v as "X" | "Y" | "Z";
};
const sim = (a: Args, k: string) => a[k] === true || a[k] === "sim";
const inteiro = (a: Args, k: string, padrao: number, min: number, max: number) => {
  const n = Math.round(num(a, k) ?? padrao);
  if (n < min || n > max) throw new Error(`"${k}" deve ser de ${min} a ${max}`);
  return n;
};

// Arestas e faces escolhidas pela posição (a IA não vê os números de cada uma).
type FiltroArestas = "todas" | "verticais" | "de_cima" | "de_baixo";
function referenciasDe(projeto: Projeto, nome: string, tipo: "aresta" | "face", filtro: string) {
  const m = projeto.estado.corposBase.find((c) => c.nome === nome);
  if (!m) throw new Error(`${nome} não existe`);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < m.vertices.length; i += 3) (ymin = Math.min(ymin, m.vertices[i])), (ymax = Math.max(ymax, m.vertices[i]));
  const tol = Math.max(1e-3, (ymax - ymin) * 1e-4);
  const refs: { corpo: string; tipo: "aresta" | "face"; indice: number }[] = [];
  const grupos = tipo === "aresta" ? m.gruposArestas : m.gruposFaces;
  for (let g = 0; g < grupos.length / 2; g++) {
    const ini = grupos[2 * g], q = grupos[2 * g + 1];
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = ini; k < ini + q; k++) {
      const base = tipo === "aresta" ? 3 * k : 3 * m.triangulos[k];
      const fonte = tipo === "aresta" ? m.arestas : m.vertices;
      for (let e = 0; e < 3; e++) (mn[e] = Math.min(mn[e], fonte[base + e])), (mx[e] = Math.max(mx[e], fonte[base + e]));
    }
    const vertical = mx[0] - mn[0] < tol && mx[2] - mn[2] < tol && mx[1] - mn[1] > tol;
    const cima = mn[1] > ymax - tol;
    const baixo = mx[1] < ymin + tol;
    if (filtro === "todas" || (filtro === "verticais" && vertical) || ((filtro === "de_cima" || filtro === "cima") && cima) || ((filtro === "de_baixo" || filtro === "baixo") && baixo))
      refs.push({ corpo: nome, tipo, indice: g });
  }
  if (!refs.length) throw new Error(`${nome} não tem ${tipo === "aresta" ? "arestas" : "face"} "${filtro}"`);
  return refs;
}

// ---- Esboço completo vindo da IA ----
// Pontos com a mesma posição viram o mesmo ponto (é assim que o esboço sabe
// que duas curvas se encontram e fecham um laço).
const PLANOS_FACE: Record<string, { plano: "XY" | "XZ" | "YZ"; eixo: 0 | 1 | 2; lado: "max" | "min" }> = {
  cima: { plano: "XZ", eixo: 1, lado: "max" },
  baixo: { plano: "XZ", eixo: 1, lado: "min" },
  frente: { plano: "XY", eixo: 2, lado: "max" },
  tras: { plano: "XY", eixo: 2, lado: "min" },
  direita: { plano: "YZ", eixo: 0, lado: "max" },
  esquerda: { plano: "YZ", eixo: 0, lado: "min" },
};
const ponto2 = (v: unknown, k: string): [number, number] => {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`"${k}" precisa ser [u, v]`);
  return [num({ u: v[0] }, "u", true)!, num({ v: v[1] }, "v", true)!];
};
function montarEsboco(projeto: Projeto, p: Args, ultimoCorpo: string | null): DadosEsboco {
  let nomePlano = (txt(p, "plano") ?? "XZ").toUpperCase();
  let desloc = num(p, "deslocamento") ?? 0;
  const face = txt(p, "naFace");
  if (face) {
    const f = PLANOS_FACE[face];
    if (!f) throw new Error(`naFace: ${Object.keys(PLANOS_FACE).join(", ")}`);
    const nome = txt(p, "corpo") ?? ultimoCorpo;
    const m = nome && projeto.estado.corposBase.find((c) => c.nome === nome);
    if (!m) throw new Error("naFace precisa de um corpo");
    let mn = Infinity, mx = -Infinity;
    for (let i = f.eixo; i < m.vertices.length; i += 3) (mn = Math.min(mn, m.vertices[i])), (mx = Math.max(mx, m.vertices[i]));
    nomePlano = f.plano;
    desloc += f.lado === "max" ? mx : mn;
  }
  if (!["XY", "XZ", "YZ"].includes(nomePlano)) throw new Error('plano deve ser "XY", "XZ" ou "YZ"');
  const base = PLANOS_ORIGEM[nomePlano as "XY"];
  const plano: PlanoEsboco = { ...base, origem: base.normal.map((c) => c * desloc) as V3 };
  const d: DadosEsboco = { plano, pontos: [{ id: 0, u: 0, v: 0 }], curvas: [], cotas: [] };
  const porPosicao = new Map<string, number>();
  const pt = (u: number, v: number) => {
    const chave = `${u.toFixed(6)},${v.toFixed(6)}`;
    const ja = porPosicao.get(chave);
    if (ja !== undefined) return ja;
    const id = d.pontos.length;
    d.pontos.push({ id, u, v });
    porPosicao.set(chave, id);
    return id;
  };
  const novaCurva = (c: Record<string, unknown>) => d.curvas.push({ id: d.curvas.length + 1, ...c } as DadosEsboco["curvas"][number]);
  const linha = (a: [number, number], b: [number, number]) => {
    const ia = pt(...a), ib = pt(...b);
    if (ia !== ib) novaCurva({ tipo: "linha", a: ia, b: ib });
  };
  // Arco por três pontos (de → meio → para): acha o centro e o sentido.
  const arco3 = (a: [number, number], m: [number, number], b: [number, number]) => {
    const [ax, ay] = a, [bx, by] = m, [cx, cy] = b;
    const dd = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(dd) < 1e-9) return linha(a, b);
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / dd;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / dd;
    const antiHorario = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0;
    const centro = pt(ux, uy);
    novaCurva(antiHorario ? { tipo: "arco", centro, a: pt(...a), b: pt(...b) } : { tipo: "arco", centro, a: pt(...b), b: pt(...a) });
  };
  const formas: Args[] = Array.isArray(p.formas) ? p.formas.slice(0, 500) : [];
  // Jeito antigo (ainda vale): "linhas" = um contorno, "circulos" = círculos.
  if (Array.isArray(p.linhas)) formas.push({ tipo: "linhas", pontos: p.linhas, fechado: p.fechado !== false });
  if (Array.isArray(p.circulos)) for (const c of p.circulos as Args[]) formas.push({ tipo: "circulo", ...c });
  if (!formas.length) throw new Error('o esboço precisa de "formas"');
  for (const f of formas) {
    const tipo = txt(f, "tipo", true);
    if (tipo === "linhas" || tipo === "contorno") {
      // contorno: pontos [u,v] ou {para:[u,v], meio:[u,v]} (arco por três pontos).
      const lista = Array.isArray(f.pontos) ? f.pontos.slice(0, 2000) : [];
      if (lista.length < 2) throw new Error(`"${tipo}" precisa de 2 pontos ou mais`);
      const pos = (x: unknown): { para: [number, number]; meio?: [number, number] } =>
        Array.isArray(x) ? { para: ponto2(x, "ponto") } : { para: ponto2((x as Args).para, "para"), meio: (x as Args).meio ? ponto2((x as Args).meio, "meio") : undefined };
      const itens = lista.map(pos);
      const fechar = f.fechado !== false && itens.length > 2;
      for (let i = 1; i < itens.length + (fechar ? 1 : 0); i++) {
        const de = itens[i - 1].para, alvo = itens[i % itens.length];
        if (alvo.meio) arco3(de, alvo.meio, alvo.para);
        else linha(de, alvo.para);
      }
    } else if (tipo === "retangulo") {
      let a: [number, number], b: [number, number];
      if (f.de !== undefined) (a = ponto2(f.de, "de")), (b = ponto2(f.ate, "ate"));
      else {
        const u = num(f, "u") ?? 0, v = num(f, "v") ?? 0, l = num(f, "largura", true)!, h = num(f, "altura", true)!;
        (a = [u - l / 2, v - h / 2]), (b = [u + l / 2, v + h / 2]);
      }
      const q: [number, number][] = [a, [b[0], a[1]], b, [a[0], b[1]]];
      q.forEach((c, i) => linha(c, q[(i + 1) % 4]));
    } else if (tipo === "circulo") {
      const r = num(f, "r") ?? (num(f, "diametro") !== undefined ? num(f, "diametro")! / 2 : undefined);
      if (!(r && r > 0)) throw new Error('círculo precisa de "r" ou "diametro"');
      novaCurva({ tipo: "circulo", centro: pt(num(f, "u") ?? 0, num(f, "v") ?? 0), raio: r });
    } else if (tipo === "arco") {
      // Arco solto: centro [u,v], raio, de/ate em graus (anti-horário).
      const [cu, cv] = ponto2(f.centro, "centro");
      const r = num(f, "raio", true)!, a0 = ((num(f, "de") ?? 0) * Math.PI) / 180, a1 = ((num(f, "ate") ?? 180) * Math.PI) / 180;
      novaCurva({ tipo: "arco", centro: pt(cu, cv), a: pt(cu + r * Math.cos(a0), cv + r * Math.sin(a0)), b: pt(cu + r * Math.cos(a1), cv + r * Math.sin(a1)) });
    } else if (tipo === "poligono") {
      const n = inteiro(f, "lados", 6, 3, 200), r = num(f, "r", true)!, u = num(f, "u") ?? 0, v = num(f, "v") ?? 0, g = ((num(f, "angulo") ?? 90) * Math.PI) / 180;
      const vs = Array.from({ length: n }, (_, i): [number, number] => [u + r * Math.cos(g + (2 * Math.PI * i) / n), v + r * Math.sin(g + (2 * Math.PI * i) / n)]);
      vs.forEach((c, i) => linha(c, vs[(i + 1) % n]));
    } else if (tipo === "ranhura") {
      const p1 = ponto2(f.de, "de"), p2 = ponto2(f.ate, "ate"), r = num(f, "largura", true)! / 2;
      const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (!(L > 0 && r > 0)) throw new Error("ranhura precisa de comprimento e largura");
      const n: [number, number] = [(-(p2[1] - p1[1]) / L) * r, ((p2[0] - p1[0]) / L) * r];
      const A: [number, number] = [p1[0] + n[0], p1[1] + n[1]], B: [number, number] = [p2[0] + n[0], p2[1] + n[1]];
      const C: [number, number] = [p2[0] - n[0], p2[1] - n[1]], D: [number, number] = [p1[0] - n[0], p1[1] - n[1]];
      linha(A, B);
      novaCurva({ tipo: "arco", centro: pt(...p2), a: pt(...C), b: pt(...B) });
      linha(C, D);
      novaCurva({ tipo: "arco", centro: pt(...p1), a: pt(...A), b: pt(...D) });
    } else if (tipo === "elipse") {
      const u = num(f, "u") ?? 0, v = num(f, "v") ?? 0, rx = num(f, "rx", true)!, ry = num(f, "ry", true)!, g = ((num(f, "angulo") ?? 0) * Math.PI) / 180;
      if (!(rx > 0 && ry > 0)) throw new Error("elipse precisa de rx e ry");
      novaCurva({ tipo: "elipse", centro: pt(u, v), a: pt(u + rx * Math.cos(g), v + rx * Math.sin(g)), menor: ry });
    } else if (tipo === "spline") {
      const lista = Array.isArray(f.pontos) ? f.pontos.slice(0, 500).map((x) => ponto2(x, "ponto")) : [];
      if (lista.length < 2) throw new Error("spline precisa de 2 pontos ou mais");
      const ids = lista.map((c) => pt(...c));
      const fechada = f.fechado === true;
      novaCurva({ tipo: "spline", a: ids[0], b: fechada ? ids[0] : ids[ids.length - 1], internos: fechada ? ids.slice(1) : ids.slice(1, -1) });
    } else if (tipo === "ponto") {
      // Ponto solto (usado pelo padrão geométrico).
      const u = num(f, "u") ?? 0, v = num(f, "v") ?? 0;
      const chave = `${u.toFixed(6)},${v.toFixed(6)}`;
      if (!porPosicao.has(chave)) {
        const id = d.pontos.length;
        d.pontos.push({ id, u, v });
        porPosicao.set(chave, id);
      }
    } else if (tipo === "texto") {
      // Letras (sem acento) como curvas: u/v = canto de baixo à esquerda, altura das letras.
      const texto = txt(f, "texto", true)!.slice(0, 100);
      escreverTexto(d, texto, [num(f, "u") ?? 0, num(f, "v") ?? 0], num(f, "altura") ?? 10);
    } else throw new Error(`forma "${tipo}" não existe (use linhas, contorno, retangulo, circulo, arco, poligono, ranhura, elipse, spline, texto)`);
  }
  return d;
}

export function ligarPonte(projeto: Projeto, vista: Vista, avisar: (t: string) => void, menu: MenuArquivo) {
  const tela = crypto.randomUUID();
  const marca = document.createElement("span");
  marca.className = "ponte-ia";
  marca.title = "Ponte com as IAs (ChatGPT, Claude, Gemini...) pela porta 27186 deste computador";
  marca.hidden = true;
  const barra = document.querySelector(".barra-app");
  if (barra) barra.insertBefore(marca, barra.querySelector(".marca"));
  else document.body.appendChild(marca);
  const mostrar = (estado: "ligada" | "outra" | "desligada") => {
    marca.hidden = estado === "desligada";
    marca.textContent = estado === "ligada" ? "● IA conectada" : "○ IA em outra janela";
    marca.classList.toggle("outra", estado === "outra");
  };
  const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

  // Corpo do passo (padrão: o último criado) e lista de corpos ("corpos" ou "corpo").
  const corpoDe = (api: ReturnType<typeof criarApi>, p: Passo) => {
    const nome = txt(p, "corpo") ?? api.ultimoCorpo();
    if (!nome) throw new Error("não há corpo");
    return nome;
  };
  const corposDe = (api: ReturnType<typeof criarApi>, p: Passo) =>
    Array.isArray(p.corpos) && p.corpos.length ? p.corpos.slice(0, 50).map((c) => String(c).slice(0, 100)) : [corpoDe(api, p)];

  // Faces escolhidas pela descrição: "cima", "baixo", "frente", "tras", "direita",
  // "esquerda" (face plana na ponta do corpo), "laterais" (planas em pé) ou
  // "cilindricas" (com raio = só as desse raio).
  const LADOS: Record<string, [number, "max" | "min"]> = { cima: [1, "max"], baixo: [1, "min"], frente: [2, "max"], tras: [2, "min"], direita: [0, "max"], esquerda: [0, "min"] };
  async function facesPor(nome: string, criterio: string, raio?: number) {
    const fs = await projeto.faces(nome);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const f of fs) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], f.min[k])), (hi[k] = Math.max(hi[k], f.max[k]));
    const tol = 1e-3;
    const escolhidas = fs.filter((f) => {
      const lado = LADOS[criterio];
      if (lado) {
        const [k, ponta] = lado;
        return f.tipo === "plano" && Math.abs(f.normal?.[k] ?? 0) > 0.999 && (ponta === "max" ? f.min[k] > hi[k] - tol : f.max[k] < lo[k] + tol);
      }
      if (criterio === "laterais") return f.tipo === "plano" && Math.abs(f.normal?.[1] ?? 1) < tol;
      if (criterio === "cilindricas") return f.tipo === "cilindro" && (f.raio ?? 0) > 0 && (raio === undefined || Math.abs((f.raio ?? 0) - raio) < 0.01);
      throw new Error(`faces: ${[...Object.keys(LADOS), "laterais", "cilindricas"].join(", ")}`);
    });
    if (!escolhidas.length) throw new Error(`${nome} não tem faces "${criterio}"${raio !== undefined ? ` de raio ${raio}` : ""}`);
    return escolhidas.map((f) => ({ corpo: nome, tipo: "face" as const, indice: f.indice }));
  }
  const esbocoPorNome = (nome: string | undefined, oQue: string) => {
    if (!nome) throw new Error(`falta o esboço de ${oQue}`);
    const e = projeto.estado.historico.find((o) => o.nome === nome && o.tipo === "esboco");
    if (!e?.esboco) throw new Error(`${nome} não é um esboço`);
    return e as typeof e & { esboco: DadosEsboco };
  };
  const curvasDe = (e: { esboco: DadosEsboco }) => e.esboco.curvas.map((c) => c.id);
  const lista = (v: unknown, k: string): string[] => {
    if (!Array.isArray(v) || !v.length) throw new Error(`"${k}" precisa ser uma lista`);
    return v.slice(0, 50).map((x) => String(x).slice(0, 100));
  };
  const escolha = (a: Args, k: string, validos: string[], padrao: string) => {
    const v = txt(a, k) ?? padrao;
    if (!validos.includes(v)) throw new Error(`${k}: ${validos.join(", ")}`);
    return v;
  };

  // ---- Projetos (pasta HAXYS_CAD/projetos) e exportação (HAXYS_CAD/saida) ----
  const pedirJson = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, init);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro ?? `erro ${r.status}`);
    return j;
  };
  const gravarProjeto = (nome: string, texto: string) =>
    pedirJson(`/api/projetos/${encodeURIComponent(nome)}`, { method: "POST", headers: { "content-type": "application/json" }, body: texto });
  // Antes de trocar de projeto: se há trabalho não salvo, guarda uma cópia.
  const guardarAntesDeTrocar = async () => {
    if (!projeto.modificado() || !projeto.estado.historico.some((o) => o.tipo !== "parametros")) return "";
    const d = new Date(), dd = (n: number) => String(n).padStart(2, "0");
    const nome = `copia ${menu.nome()} ${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())} ${dd(d.getHours())}h${dd(d.getMinutes())}`;
    await gravarProjeto(nome, menu.textoDoProjeto());
    return ` (o trabalho não salvo foi guardado como "${nome}")`;
  };

  // Apelidos dados pela IA (valem enquanto esta janela estiver aberta).
  const apelidos = new Map<string, string>();

  // Faz uma ação da lista fechada pela API haxys.
  async function fazer(api: ReturnType<typeof criarApi>, p: Passo, ultimoEsboco: { nome?: string }): Promise<unknown> {
    switch (p.acao) {
      case "caixa":
        return api.caixa({ comprimento: num(p, "comprimento", true), largura: num(p, "largura", true), altura: num(p, "altura", true), ...posicao(p), modo: modo(p) });
      case "cilindro":
        return api.cilindro({ diametro: num(p, "diametro", true), altura: num(p, "altura", true), ...posicao(p), modo: modo(p) });
      case "esfera":
        return api.esfera({ diametro: num(p, "diametro", true), ...posicao(p), modo: modo(p) });
      case "toroide":
        return api.toroide({ diametro: num(p, "diametro", true), diametroSecao: num(p, "diametroSecao", true), ...posicao(p), modo: modo(p) });
      case "esboco": {
        const nome = await api.adicionar({ tipo: "esboco", nome: "Esboço", params: {}, esboco: montarEsboco(projeto, p, api.ultimoCorpo()) });
        ultimoEsboco.nome = nome;
        return nome;
      }
      case "extrusao": {
        const esboco = txt(p, "esboco") ?? ultimoEsboco.nome;
        if (!esboco) throw new Error("falta o esboço (faça a ação esboco antes)");
        const esb = projeto.estado.historico.find((o) => o.nome === esboco && o.tipo === "esboco");
        if (!esb?.esboco) throw new Error(`${esboco} não é um esboço`);
        const indices = Array.isArray(p.perfis) ? p.perfis.map((i) => Math.trunc(num({ i }, "i", true)!)) : perfisDeMaterial(esb.esboco);
        const extensao = txt(p, "extensao") ?? "um";
        if (!["um", "simetrico", "doisLados", "ateObjeto"].includes(extensao)) throw new Error('extensao: "um", "simetrico", "doisLados" ou "ateObjeto"');
        const params: Record<string, number> = { distancia: num(p, "distancia", true)! };
        for (const k of ["distancia2", "afunilamento", "afunilamento2", "inicio"]) if (num(p, k) !== undefined) params[k] = num(p, k)!;
        return api.adicionar({ tipo: "extrusao", nome: "Extrusão", modo: (modo(p) ?? "novo") as "novo", params, perfis: { esboco: esb.id, indices }, opcoes: { extensao, medida: txt(p, "medida") === "inteira" ? "inteira" : "metade", ...(extensao === "ateObjeto" ? { objeto: txt(p, "objeto", true)! } : {}) } });
      }
      case "furo":
        return api.furo({ diametro: num(p, "diametro", true)!, corpo: txt(p, "corpo"), x: num(p, "x"), z: num(p, "z"), profundidade: num(p, "profundidade") });
      case "arredondar":
      case "chanfrar": {
        const filtro = (txt(p, "arestas") ?? "todas") as FiltroArestas;
        if (!["todas", "verticais", "de_cima", "de_baixo"].includes(filtro)) throw new Error('arestas: "todas", "verticais", "de_cima" ou "de_baixo"');
        const referencias = referenciasDe(projeto, corpoDe(api, p), "aresta", filtro);
        return p.acao === "arredondar"
          ? api.adicionar({
              tipo: "arredondamento",
              nome: "Arredondamento",
              params: { raio: num(p, "raio", true)!, ...(num(p, "raio2") !== undefined ? { raio2: num(p, "raio2")! } : {}) },
              referencias,
              opcoes: { tipoRaio: num(p, "raio2") !== undefined ? "variavel" : "constante" },
            })
          : api.adicionar({
              tipo: "chanfro",
              nome: "Chanfro",
              params: { distancia: num(p, "distancia", true)!, ...(num(p, "distancia2") !== undefined ? { distancia2: num(p, "distancia2")! } : {}), ...(num(p, "angulo") !== undefined ? { angulo: num(p, "angulo")! } : {}) },
              referencias,
              opcoes: { tipoChanfro: escolha(p, "tipoChanfro", ["igual", "duas", "angulo"], "igual"), faceReferencia: escolha(p, "faceReferencia", ["horizontal", "vertical"], "horizontal") },
            });
      }
      case "casca": {
        const abrir = escolha(p, "abrir", ["cima", "baixo", "nenhuma"], "cima");
        const direcao = escolha(p, "direcao", ["dentro", "fora"], "dentro");
        const nome = corpoDe(api, p);
        if (abrir === "nenhuma") return api.adicionar({ tipo: "casca", nome: "Casca", params: { espessura: num(p, "espessura", true)! }, corpos: [nome], opcoes: { direcao } });
        const referencias = referenciasDe(projeto, nome, "face", abrir);
        return api.adicionar({ tipo: "casca", nome: "Casca", params: { espessura: num(p, "espessura", true)! }, referencias, opcoes: { direcao } });
      }
      case "revolucao": {
        const nome = txt(p, "esboco") ?? ultimoEsboco.nome;
        if (!nome) throw new Error("falta o esboço (faça a ação esboco antes)");
        const esb = projeto.estado.historico.find((o) => o.nome === nome && o.tipo === "esboco");
        if (!esb?.esboco) throw new Error(`${nome} não é um esboço`);
        const indices = Array.isArray(p.perfis) ? p.perfis.map((i) => Math.trunc(num({ i }, "i", true)!)) : perfisDeMaterial(esb.esboco);
        return api.adicionar({ tipo: "revolucao", nome: "Revolução", modo: (modo(p) ?? "novo") as "novo", params: { angulo: num(p, "angulo") ?? 360, ...(num(p, "angulo2") !== undefined ? { angulo2: num(p, "angulo2")! } : {}) }, perfis: { esboco: esb.id, indices }, eixo: { tipo: "origem", eixo: eixoXYZ(p, "eixo", "Y") }, opcoes: { extensao: ["simetrico", "doisLados"].includes(txt(p, "extensao") ?? "") ? txt(p, "extensao")! : "um" } });
      }
      case "espelhar": {
        const plano = (txt(p, "plano") ?? "YZ").toUpperCase();
        if (!["XY", "XZ", "YZ"].includes(plano)) throw new Error('plano deve ser "XY", "XZ" ou "YZ"');
        return api.adicionar({ tipo: "espelhar", nome: "Espelhar", params: {}, corpos: corposDe(api, p), opcoes: { plano, ...(sim(p, "unir") ? { operacao: "unir" } : {}) } });
      }
      case "padrao_retangular":
        return api.adicionar({
          tipo: "padraoRetangular",
          nome: "Padrão retangular",
          params: { quantidade1: inteiro(p, "quantidade1", 2, 1, 400), distancia1: num(p, "distancia1") ?? 0, quantidade2: inteiro(p, "quantidade2", 1, 1, 400), distancia2: num(p, "distancia2") ?? 0 },
          corpos: corposDe(api, p),
          opcoes: { direcao1: eixoXYZ(p, "direcao1", "X"), direcao2: eixoXYZ(p, "direcao2", "Z"), tipoDistancia: "espacamento", ...(sim(p, "unir") ? { operacao: "unir" } : {}) },
        });
      case "padrao_circular":
        return api.adicionar({
          tipo: "padraoCircular",
          nome: "Padrão circular",
          params: { quantidade: inteiro(p, "quantidade", 4, 2, 400), angulo: num(p, "angulo") ?? 360 },
          corpos: corposDe(api, p),
          opcoes: { eixo: eixoXYZ(p, "eixo", "Y"), ...(sim(p, "unir") ? { operacao: "unir" } : {}) },
        });
      case "mover":
        return api.adicionar({
          tipo: "mover",
          nome: "Mover",
          params: { dx: num(p, "dx") ?? 0, dy: num(p, "dy") ?? 0, dz: num(p, "dz") ?? 0, rx: num(p, "rx") ?? 0, ry: num(p, "ry") ?? 0, rz: num(p, "rz") ?? 0 },
          corpos: corposDe(api, p),
          opcoes: { pivo: txt(p, "pivo") === "origem" ? "origem" : "centro", ...(sim(p, "copiar") ? { copiar: "sim" } : {}) },
        });
      case "escala": {
        const fator = num(p, "fator", true)!;
        if (!(fator > 0 && fator <= 1000)) throw new Error("fator deve ser maior que zero");
        return api.adicionar({ tipo: "escala", nome: "Escala", params: { fator }, corpos: corposDe(api, p), opcoes: { pivo: txt(p, "pivo") === "origem" ? "origem" : "centro", ...(sim(p, "copiar") ? { copiar: "sim" } : {}) } });
      }
      case "furo_detalhado": {
        // Furo do Fusion: na face (cima padrão) do corpo, nas posições dadas.
        const face = escolha(p, "naFace", Object.keys(LADOS), "cima");
        const nome = corpoDe(api, p);
        const m = projeto.estado.corposBase.find((c) => c.nome === nome);
        if (!m) throw new Error(`${nome} não existe`);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < m.vertices.length; i++) (lo[i % 3] = Math.min(lo[i % 3], m.vertices[i])), (hi[i % 3] = Math.max(hi[i % 3], m.vertices[i]));
        const [k, ponta] = LADOS[face];
        const nivel = ponta === "max" ? hi[k] : lo[k];
        const normal = [0, 0, 0] as V3;
        normal[k] = ponta === "max" ? 1 : -1;
        // posições: cima/baixo [x, z]; frente/tras [x, y]; direita/esquerda [z, y].
        const outros: [number, number] = k === 1 ? [0, 2] : k === 2 ? [0, 1] : [2, 1];
        const centro: [number, number] = [(lo[outros[0]] + hi[outros[0]]) / 2, (lo[outros[1]] + hi[outros[1]]) / 2];
        const posicoes: [number, number][] = Array.isArray(p.posicoes) ? p.posicoes.slice(0, 200).map((x) => ponto2(x, "posicoes")) : [centro];
        const furos = posicoes.map(([a, b]) => {
          const ponto = [0, 0, 0] as V3;
          (ponto[k] = nivel), (ponto[outros[0]] = a), (ponto[outros[1]] = b);
          return { ponto, normal };
        });
        const tipo = escolha(p, "tipo", ["simples", "rebaixo", "escareado"], "simples");
        const params: Record<string, number> = { diametro: num(p, "diametro", true)! };
        for (const c of ["profundidade", "diametroRebaixo", "profundidadeRebaixo", "diametroEscareado"]) if (num(p, c) !== undefined) params[c] = num(p, c)!;
        const atraves = params.profundidade === undefined;
        return api.adicionar({ tipo: "furo", nome: "Furo", params, furos, opcoes: { tipo, extensao: atraves ? "atraves" : "distancia", ponta: escolha(p, "ponta", ["118", "plana"], "118") } });
      }
      case "rosca": {
        const referencias = await facesPor(corpoDe(api, p), "cilindricas", num(p, "raio"));
        return api.adicionar({ tipo: "rosca", nome: "Rosca", params: {}, referencias: referencias.slice(0, 1), opcoes: { tamanho: txt(p, "tamanho") ?? "auto", modelada: p.modelada === false ? "nao" : "sim", mao: escolha(p, "mao", ["direita", "esquerda"], "direita") } });
      }
      case "fixador":
        return api.adicionar({
          tipo: "fixador",
          nome: "Fixador",
          modo: (modo(p) ?? "novo") as "novo",
          params: { comprimento: num(p, "comprimento") ?? 20, ...posicao(p) },
          opcoes: {
            tipo: escolha(p, "tipo", ["sextavado", "allen", "porca", "arruela"], "sextavado"),
            tamanho: escolha(p, "tamanho", ["M2", "M2.5", "M3", "M4", "M5", "M6", "M8", "M10", "M12"], "M6"),
            rosca: p.rosca === true ? "sim" : "nao",
          },
        });
      case "bobina":
        return api.adicionar({
          tipo: "bobina",
          nome: "Bobina",
          modo: (modo(p) ?? "novo") as "novo",
          params: { diametro: num(p, "diametro", true)!, voltas: num(p, "voltas", true)!, altura: num(p, "altura", true)!, secaoTamanho: num(p, "secaoTamanho", true)!, ...posicao(p) },
          opcoes: { secao: escolha(p, "secao", ["circulo", "quadrado", "triangulo"], "circulo"), posicao: escolha(p, "posicaoSecao", ["centro", "dentro", "fora"], "centro"), sentido: escolha(p, "sentido", ["direita", "esquerda"], "direita") },
        });
      case "varredura": {
        const perfil = esbocoPorNome(txt(p, "perfil"), "perfil");
        const caminho = esbocoPorNome(txt(p, "caminho"), "caminho");
        return api.adicionar({ tipo: "varredura", nome: "Varredura", modo: (modo(p) ?? "novo") as "novo", params: {}, perfis: { esboco: perfil.id, indices: perfisDeMaterial(perfil.esboco) }, caminho: { esboco: caminho.id, curvas: curvasDe(caminho) } });
      }
      case "tubulacao": {
        const caminho = esbocoPorNome(txt(p, "caminho") ?? ultimoEsboco.nome, "caminho");
        return api.adicionar({ tipo: "tubulacao", nome: "Tubulação", modo: sim(p, "superficie") ? "novo" : ((modo(p) ?? "novo") as "novo"), params: { diametro: num(p, "diametro", true)!, espessura: num(p, "espessura") ?? 0 }, caminho: { esboco: caminho.id, curvas: curvasDe(caminho) }, ...(sim(p, "superficie") ? { opcoes: { superficie: "sim" } } : {}) });
      }
      case "transicao": {
        const secoes = lista(p.secoes, "secoes").map((n) => {
          const e = esbocoPorNome(n, "seção");
          const mat = perfisDeMaterial(e.esboco);
          if (!mat.length) throw new Error(`${n} não tem perfil fechado`);
          return { esboco: e.id, indice: mat[0] };
        });
        if (secoes.length < 2) throw new Error("transição precisa de 2 seções ou mais");
        return api.adicionar({ tipo: "transicao", nome: "Transição", modo: (modo(p) ?? "novo") as "novo", params: {}, secoes, opcoes: { regrada: p.regrada === true ? "sim" : "nao" } });
      }
      case "nervura":
      case "teia": {
        const e = esbocoPorNome(txt(p, "esboco") ?? ultimoEsboco.nome, "linhas");
        return api.adicionar({ tipo: p.acao, nome: p.acao === "nervura" ? "Nervura" : "Teia", modo: "unir", params: { espessura: num(p, "espessura") ?? 3, profundidade: num(p, "profundidade") ?? 0 }, caminho: { esboco: e.id, curvas: e.esboco.curvas.filter((c) => c.tipo === "linha").map((c) => c.id) }, opcoes: { lado: p.inverter === true ? "inverter" : "auto" } });
      }
      case "relevo": {
        const e = esbocoPorNome(txt(p, "esboco") ?? ultimoEsboco.nome, "relevo");
        return api.adicionar({ tipo: "altoRelevo", nome: "Alto-relevo", params: { profundidade: num(p, "profundidade", true)! }, perfis: { esboco: e.id, indices: perfisDeMaterial(e.esboco) }, opcoes: { tipo: escolha(p, "tipo", ["relevo", "gravar"], "relevo") } });
      }
      case "padrao_caminho": {
        const caminho = esbocoPorNome(txt(p, "caminho"), "caminho");
        return api.adicionar({ tipo: "padraoCaminho", nome: "Padrão no caminho", params: { quantidade: inteiro(p, "quantidade", 3, 2, 400), distancia: num(p, "distancia") ?? 0 }, corpos: [corpoDe(api, p)], caminho: { esboco: caminho.id, curvas: curvasDe(caminho) }, opcoes: { orientacao: escolha(p, "orientacao", ["igual", "caminho"], "igual"), operacao: sim(p, "unir") ? "unir" : "novo" } });
      }
      case "corte_encaixes": {
        // Cortar com encaixes (como no Bambu Studio): plano da origem + deslocamento.
        return api.adicionar({
          tipo: "corteEncaixes",
          nome: "Corte",
          params: {
            deslocamento: num(p, "deslocamento") ?? 0,
            quantidade: num(p, "quantidade") ?? 2,
            diametro: num(p, "diametro") ?? 5,
            comprimento: num(p, "comprimento") ?? 10,
            folga: num(p, "folga") ?? 0.2,
            separar: num(p, "separar") ?? 10,
          },
          corpos: corposDe(api, p),
          opcoes: { plano: escolha(p, "plano", ["XY", "XZ", "YZ"], "XZ"), encaixe: escolha(p, "encaixe", ["pino", "cavilha", "nenhum"], "pino") },
        });
      }
      case "verificar_impressao": {
        // Se os corpos cabem na mesa da impressora escolhida pela pessoa (padrão H2C),
        // como estão e deitados na maior face plana.
        const corpos = Array.isArray(p.corpos) ? lista(p.corpos, "corpos") : projeto.estado.corposBase.map((c) => c.nome);
        if (!corpos.length) throw new Error("não há corpo");
        const { mesa, nome } = await mesaEscolhida();
        const linhas = [`Impressora: ${nome ?? "padrão 256 × 256 (Bambu Studio não encontrado)"}${mesa ? ` — área ${mesa.area[2] - mesa.area[0]} × ${mesa.area[3] - mesa.area[1]} × ${mesa.altura} mm` : ""}`];
        for (const deitar of [false, true]) {
          await projeto.exportar({ formato: "3mf", corpos, qualidade: "baixa", zParaCima: true, mesa, deitar });
          linhas.push(`${deitar ? "Deitada na maior face" : "Como está"}: ${projeto.avisoExportacao ?? "?"}`);
        }
        return linhas.join("\n");
      }
      case "dividir": {
        const plano = escolha(p, "plano", ["XY", "XZ", "YZ"], "YZ");
        const d = num(p, "deslocamento") ?? 0;
        let opcao = plano;
        if (d) {
          const nomePlano = await api.adicionar({ tipo: "plano", nome: "Plano", params: { distancia: d }, planoBase: PLANOS_ORIGEM[plano as "XY"] });
          opcao = `op:${projeto.estado.historico.find((o) => o.nome === nomePlano)!.id}`;
        }
        return api.adicionar({ tipo: "dividir", nome: "Dividir corpo", params: {}, corpos: corposDe(api, p), opcoes: { plano: opcao } });
      }
      case "pressionar":
        return api.adicionar({ tipo: "pressionar", nome: "Pressionar/puxar", params: { distancia: num(p, "distancia", true)! }, referencias: await facesPor(corpoDe(api, p), txt(p, "faces") ?? "cima") });
      case "inclinacao":
        return api.adicionar({ tipo: "inclinacao", nome: "Inclinação", params: { angulo: num(p, "angulo", true)! }, referencias: await facesPor(corpoDe(api, p), txt(p, "faces") ?? "laterais"), opcoes: { plano: escolha(p, "plano", ["XZ", "XY", "YZ"], "XZ"), inverter: p.inverter === true ? "sim" : "nao" } });
      case "espessar":
        return api.adicionar({ tipo: "espessar", nome: "Espessar", modo: (modo(p) ?? "novo") as "novo", params: { espessura: num(p, "espessura", true)! }, referencias: await facesPor(corpoDe(api, p), txt(p, "faces") ?? "cima"), opcoes: { direcao: escolha(p, "direcao", ["fora", "dentro", "simetrico"], "fora") } });
      case "deslocar_face":
        return api.adicionar({ tipo: "deslocarFace", nome: "Deslocar face", params: { distancia: num(p, "distancia", true)! }, referencias: await facesPor(corpoDe(api, p), txt(p, "faces") ?? "cima", num(p, "raio")) });
      case "tapar_furos":
        return api.adicionar({ tipo: "removerFaces", nome: "Remover", params: {}, referencias: await facesPor(corpoDe(api, p), "cilindricas", num(p, "raio")) });
      case "padrao_geometrico": {
        const e = esbocoPorNome(txt(p, "esboco") ?? ultimoEsboco.nome, "pontos");
        return api.adicionar({ tipo: "padraoGeometrico", nome: "Padrão geométrico", params: {}, corpos: corposDe(api, p), opcoes: { esboco: `esb:${e.id}`, operacao: sim(p, "unir") ? "unir" : "novo" } });
      }
      case "volume_fluido":
        return api.adicionar({ tipo: "volumeFluido", nome: "Fluido", params: {}, corpos: corposDe(api, p), opcoes: { tampa: escolha(p, "tampa", ["cima", "nenhuma", "baixo", "frente", "tras", "direita", "esquerda"], "cima") } });
      case "remover_recursos":
        return api.adicionar({ tipo: "removerRecursos", nome: "Remover recursos", params: { diametroMax: num(p, "diametroMax", true)! }, corpos: corposDe(api, p) });
      case "malha": {
        // Ferramentas da aba MALHA. tesselar: sólido → malha (o sólido fica).
        const qual = escolha(p, "operacao", ["tesselar", "escala", "casca", "fronteira", "grupos", "remover", "reduzir", "suavizar", "reparar", "inverter", "separar", "converter", "corte", "apagar", "alinhar", "ponte", "atrair", "grupo_direcao"], "tesselar");
        if (qual === "alinhar")
          return api.adicionar({ tipo: "malhaAlinhar", nome: "Alinhar malha", params: { passadas: num(p, "quantidade") ?? 60 }, corpos: [corpoDe(api, p), txt(p, "alvo", true)!], opcoes: { metodo: txt(p, "metodo") === "centro" ? "centro" : "ajuste" } });
        if (qual === "ponte") return api.adicionar({ tipo: "malhaPonte", nome: "Ponte", params: {}, corpos: corposDe(api, p) });
        if (qual === "atrair")
          return api.adicionar({ tipo: "malhaAtrair", nome: "Atrair", params: { distancia: num(p, "distancia") ?? 1, deslocamento: num(p, "deslocamento") ?? 0 }, corpos: corposDe(api, p), opcoes: { plano: escolha(p, "plano", ["XZ", "XY", "YZ"], "XZ") } });
        if (qual === "grupo_direcao")
          return api.adicionar({ tipo: "malhaGrupoNovo", nome: "Grupo de faces", params: { angulo: num(p, "angulo") ?? 20 }, corpos: corposDe(api, p), opcoes: { direcao: escolha(p, "direcao", ["+X", "-X", "+Y", "-Y", "+Z", "-Z"], "+Y") } });
        const tipos: Record<string, [string, string]> = {
          tesselar: ["malhaTesselar", "Malha"], escala: ["malhaEscala", "Dimensionar malha"], casca: ["malhaCasca", "Casca de malha"],
          fronteira: ["malhaFronteira", "Suavizar fronteira"], grupos: ["malhaGrupos", "Grupos de faces"], remover: ["malhaRemover", "Remover malha"],
          reduzir: ["malhaReduzir", "Reduzir"], suavizar: ["malhaSuavizar", "Suavizar"], reparar: ["malhaReparar", "Reparar"],
          inverter: ["malhaInverter", "Inverter normais"], separar: ["malhaSeparar", "Separar"], converter: ["malhaConverter", "Converter malha"], corte: ["malhaCorte", "Corte de malha"],
        };
        const params: Record<string, number> = {};
        for (const k of ["fatorX", "fatorY", "fatorZ", "espessura", "iteracoes", "angulo", "proporcao", "tolerancia", "deslocamento"]) if (num(p, k) !== undefined) params[k] = num(p, k)!;
        if (num(p, "fator") !== undefined) params.fatorX = params.fatorY = params.fatorZ = num(p, "fator")!;
        if (qual === "apagar") {
          // Apagar e preencher o grupo de faces de cima/baixo (gera os grupos antes, se precisar).
          const corpo = corpoDe(api, p);
          const m = projeto.estado.corposBase.find((c) => c.nome === corpo);
          if (m && m.gruposFaces.length <= 2) await api.adicionar({ tipo: "malhaGrupos", nome: "Grupos de faces", params: { angulo: num(p, "angulo") ?? 20 }, corpos: [corpo] });
          const referencias = referenciasDe(projeto, corpo, "face", escolha(p, "faces", ["cima", "baixo"], "cima"));
          return api.adicionar({ tipo: "malhaApagar", nome: "Apagar e preencher", params: {}, referencias });
        }
        const [tipo, nome] = tipos[qual];
        return api.adicionar({ tipo: tipo as "malhaEscala", nome, params, corpos: corposDe(api, p), opcoes: { pivo: txt(p, "pivo") === "origem" ? "origem" : "centro", plano: escolha(p, "plano", ["XZ", "XY", "YZ"], "XZ"), lado: txt(p, "lado") === "negativo" ? "negativo" : "positivo", tampar: p.tampar === false ? "nao" : "sim" } });
      }
      case "laser": {
        // SVG para o laser (Bambu Suite): esboço ou contorno de um corpo cortado na altura y.
        const esb = txt(p, "esboco");
        const op = esb ? esbocoPorNome(esb, "laser") : undefined;
        const fonte = op ? `esb:${op.id}` : `corpo:${corpoDe(api, p)}`;
        const r = await svgDoLaser(projeto, fonte, escolha(p, "gravacao", ["cortar", "gravar"], "cortar") === "gravar", num(p, "altura"));
        return enviarAoLaser(r, txt(p, "nome") ?? `${menu.nome()} - laser`);
      }
      case "montagem": {
        // Montagem: componente, junta, origem, mover_junta, contato, capturar, reverter, duplicar.
        const qual = escolha(p, "operacao", ["componente", "junta", "origem", "mover_junta", "contato", "capturar", "reverter", "duplicar"], "junta");
        const recado: string[] = [];
        const anotar = (t: string) => recado.push(t);
        if (qual === "componente") return api.adicionar({ tipo: "componente", nome: txt(p, "nome") ?? "Componente", params: {}, corpos: corposDe(api, p) });
        if (qual === "origem") {
          const corpo = corpoDe(api, p);
          const ref = (await facesPor(corpo, escolha(p, "faces", ["cima", "baixo", "frente", "tras", "direita", "esquerda"], "cima")))[0];
          const o = await projeto.origemJunta(ref);
          const d = { dx: num(p, "dx") ?? 0, dy: num(p, "dy") ?? 0, dz: num(p, "dz") ?? 0 };
          const ponto: V3 = [o.p[0] + d.dx, o.p[1] + d.dy, o.p[2] + d.dz];
          return api.adicionar({ tipo: "origemJunta", nome: "OrigemJunta", params: d, referencias: [ref], pontoConstrucao: ponto, eixoConstrucao: { origem: ponto, direcao: o.z } });
        }
        if (qual === "junta") {
          // corpo + faceCorpo = o que anda; alvo + faceAlvo = o que fica. origem/origemAlvo = nome de uma Origem da junta.
          const lado = (k: string) => escolha(p, k, ["cima", "baixo", "frente", "tras", "direita", "esquerda"], k === "faceAlvo" ? "cima" : "baixo");
          const anda = corpoDe(api, p), fixo = txt(p, "alvo", true)!;
          const origemPorNome = (k: string) => {
            const n = txt(p, k);
            if (!n) return undefined;
            const o = projeto.estado.historico.find((x) => x.tipo === "origemJunta" && x.nome === n);
            if (!o) throw new Error(`${n} não é uma Origem da junta`);
            return o;
          };
          const oa = origemPorNome("origem"), ob = origemPorNome("origemAlvo");
          const ra = oa?.referencias?.[0] ?? (await facesPor(anda, lado("faceCorpo")))[0];
          const rb = ob?.referencias?.[0] ?? (await facesPor(fixo, lado("faceAlvo")))[0];
          return api.adicionar({
            tipo: "junta",
            nome: "Junta",
            params: { angulo: num(p, "angulo") ?? 0, distancia: num(p, "distancia") ?? 0, afastamento: num(p, "afastamento") ?? 0 },
            opcoes: {
              tipo: escolha(p, "tipo", ["rigida", "giratoria", "deslizante", "cilindrica", "esferica", "planar"], "rigida"),
              inverter: p.inverter === true ? "sim" : "nao",
              comoEsta: p.comoEsta === true ? "sim" : "nao",
              origemA: oa?.id ?? "",
              origemB: ob?.id ?? "",
            },
            referencias: [ra, rb],
          });
        }
        if (qual === "mover_junta") {
          const r = await moverJunta(projeto, txt(p, "nome", true)!, num(p, "valor", true)!);
          await api.esperar();
          return r.batida ? `contato ${r.batida}: parou em ${r.valor}` : `junta em ${r.valor}`;
        }
        if (qual === "contato") {
          const modo = escolha(p, "modo", ["conjunto", "conjuntos", "todos", "desligado"], "conjunto");
          const tipo = modo === "conjunto" ? "novoContato" : modo === "conjuntos" ? "contatoConjuntos" : modo === "todos" ? "contatoTodos" : "contatoDesligado";
          definirContato(projeto, tipo, modo === "conjunto" ? corposDe(api, p) : [], anotar);
        } else if (qual === "capturar" || qual === "reverter") comandoPosicao(projeto, qual === "capturar", anotar);
        else if (qual === "duplicar") duplicarComJuntas(projeto, corpoDe(api, p), anotar);
        await api.esperar();
        return recado.join(" ");
      }
      case "secao_malha": {
        // Esboço com o contorno do corte do corpo por um plano (ajustado até "tolerancia").
        const plano = planoDeslocadoDaOrigem(escolha(p, "plano", ["XZ", "XY", "YZ"], "XZ") as "XZ", num(p, "deslocamento") ?? 0);
        const op = criarEsbocoDeCorte(projeto, corpoDe(api, p), plano, Math.max(0, num(p, "tolerancia") ?? 0));
        await api.esperar();
        ultimoEsboco.nome = op.nome;
        return `${op.nome} (${op.esboco!.curvas.length} linhas)`;
      }
      case "delimitador":
        return api.adicionar({ tipo: "delimitador", nome: "Delimitador", params: { folga: num(p, "folga") ?? 0 }, corpos: corposDe(api, p), opcoes: { forma: escolha(p, "forma", ["caixa", "cilindro"], "caixa") } });
      case "organizar":
        return api.adicionar({ tipo: "organizar", nome: "Organizar", params: { largura: num(p, "largura") ?? 256, profundidade: num(p, "profundidade") ?? 256, espaco: num(p, "espaco") ?? 5 }, corpos: Array.isArray(p.corpos) ? lista(p.corpos, "corpos") : [] });
      case "aparencia":
        return api.adicionar({ tipo: "aparencia", nome: "Aparência", params: {}, corpos: corposDe(api, p), opcoes: { aparencia: escolha(p, "aparencia", Object.keys(APARENCIAS), "plasticoAzul") } });
      case "material":
        return api.adicionar({ tipo: "material", nome: "Material", params: {}, corpos: corposDe(api, p), opcoes: { material: escolha(p, "material", Object.keys(MATERIAIS), "pla") } });
      case "remover_corpo":
        return api.adicionar({ tipo: "remover", nome: "Remover", params: {}, corpos: corposDe(api, p) });
      case "novo_projeto": {
        const aviso = await guardarAntesDeTrocar();
        menu.novoSemPerguntar();
        apelidos.clear();
        await api.esperar(); // o projeto vazio precisa terminar de carregar antes do próximo passo
        return `Projeto novo${aviso}`;
      }
      case "salvar_projeto": {
        const nome = txt(p, "nome") ?? menu.nome();
        if (!nome || nome === "Sem título") throw new Error('dê um "nome" ao projeto');
        const r = await gravarProjeto(nome, menu.textoDoProjeto(nome));
        menu.marcarSalvoComo(nome);
        return `Salvo em ${r.arquivo}`;
      }
      case "abrir_projeto": {
        const nome = txt(p, "nome", true)!;
        const r = await fetch(`/api/projetos/${encodeURIComponent(nome)}`);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? `o projeto "${nome}" não abriu`);
        const texto = await r.text();
        const aviso = await guardarAntesDeTrocar();
        const n = menu.carregarDeTexto(texto, nome);
        apelidos.clear();
        await api.esperar();
        return `Aberto: ${nome} (${n} operações)${aviso}`;
      }
      case "listar_projetos": {
        const j = await pedirJson("/api/projetos");
        return j.projetos.length ? j.projetos.map((x: { nome: string; salvoEm: string }) => `${x.nome} (salvo ${x.salvoEm.slice(0, 16).replace("T", " ")})`).join("\n") : "Nenhum projeto salvo ainda.";
      }
      case "exportar": {
        const formato = escolha(p, "formato", ["stl", "step", "3mf"], "3mf") as "stl";
        const corpos = Array.isArray(p.corpos) ? lista(p.corpos, "corpos") : projeto.estado.corposBase.map((c) => c.nome);
        if (!corpos.length) throw new Error("não há corpo para exportar");
        // 3MF: na mesa da impressora guardada (padrão H2C) e com o aviso de tamanho.
        const mesa = formato === ("3mf" as string) ? await mesaEscolhida() : { mesa: undefined, deitar: false };
        const dados = await projeto.exportar({ formato, corpos, qualidade: escolha(p, "qualidade", ["baixa", "media", "alta"], "media") as "media", zParaCima: true, mesa: mesa.mesa, deitar: p.deitar === true || mesa.deitar });
        const nome = txt(p, "nome") ?? (menu.nome() === "Sem título" ? "peca" : menu.nome());
        const r = await pedirJson(`/api/exportar/${encodeURIComponent(`${nome}.${formato}`)}`, { method: "POST", body: dados });
        return `Exportado: ${r.arquivo} (${(r.bytes / 1024).toFixed(0)} KB)${formato === ("3mf" as string) && projeto.avisoExportacao ? `. ${projeto.avisoExportacao}` : ""}`;
      }
      case "combinar": {
        const alvo = txt(p, "alvo", true)!;
        const ferramentas = Array.isArray(p.ferramentas) ? p.ferramentas.slice(0, 50).map((f) => String(f).slice(0, 100)) : [];
        if (!ferramentas.length) throw new Error('falta "ferramentas": lista de corpos');
        const operacao = txt(p, "operacao") ?? "unir";
        if (!["unir", "cortar", "intersecao"].includes(operacao)) throw new Error('operacao: "unir", "cortar" ou "intersecao"');
        return api.adicionar({ tipo: "combinar", nome: "Combinar", params: {}, corpos: [alvo, ...ferramentas], opcoes: { operacao, ...(sim(p, "manter") ? { manter: "sim" } : {}) } });
      }
      case "mudar":
        return api.mudar(txt(p, "operacao", true)!, txt(p, "medida", true)!, num(p, "valor", true)!);
      case "remover":
        return api.remover(txt(p, "operacao", true)!);
      case "parametro":
        return api.parametro(txt(p, "nome", true)!, txt(p, "expressao", true)!);
      case "desfazer":
        api.desfazer();
        return api.esperar();
      case "refazer":
        api.refazer();
        return api.esperar();
      case "propriedades":
        return (await api.propriedades(txt(p, "corpo") ?? api.ultimoCorpo() ?? "")).join("\n");
      case "imprimir":
        return api.imprimir();
      default:
        throw new Error(`ação "${p.acao}" não existe`);
    }
  }

  async function atender(p: Pedido): Promise<Record<string, unknown>> {
    if (p.tipo === "estado") return { estado: resumoDoProjeto(projeto) };
    if (p.tipo === "captura") {
      await projeto.quandoCalculado();
      return { imagem: vista.capturar(p.enquadrar !== false), estado: resumoDoProjeto(projeto) };
    }
    const passos = Array.isArray(p.passos) ? p.passos.slice(0, 200) : [];
    const logs: string[] = [];
    const api = criarApi(projeto, (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
    const feitos: string[] = [];
    const ultimoEsboco: { nome?: string } = {};
    avisar("A IA está construindo…");
    for (let i = 0; i < passos.length; i++) {
      const passo = passos[i];
      try {
        if (!passo || typeof passo !== "object" || typeof passo.acao !== "string") throw new Error('cada passo precisa de "acao"');
        // Apelidos: a IA dá nome ao que cria ("apelido") e usa nos passos seguintes.
        for (const k of ["corpo", "esboco", "perfil", "caminho", "alvo", "objeto"]) {
          const v = passo[k];
          if (typeof v === "string" && apelidos.has(v)) passo[k] = apelidos.get(v);
        }
        for (const k of ["corpos", "ferramentas", "secoes"]) {
          const v = passo[k];
          if (Array.isArray(v)) passo[k] = v.map((x) => (typeof x === "string" && apelidos.has(x) ? apelidos.get(x) : x));
        }
        const corposAntes = new Set(projeto.estado.corposBase.map((c) => c.nome));
        const r = await fazer(api, passo, ultimoEsboco);
        const apelido = txt(passo, "apelido");
        if (apelido) {
          // Esboço → nome do esboço; o resto → corpo novo (ou o nome que a ação devolveu).
          const novo = projeto.estado.corposBase.find((c) => !corposAntes.has(c.nome))?.nome;
          const alvo = passo.acao === "esboco" || passo.acao === "secao_malha" ? ultimoEsboco.nome : (novo ?? (typeof r === "string" ? r : undefined));
          if (alvo) apelidos.set(apelido, alvo);
        }
        feitos.push(`${i + 1}. ${passo.acao}: ok${typeof r === "string" ? ` (${r.length > 300 ? r.slice(0, 300) + "…" : r})` : ""}${apelido && apelidos.has(apelido) ? ` [${apelido} = ${apelidos.get(apelido)}]` : ""}`);
      } catch (e) {
        const erro = `passo ${i + 1} (${passo?.acao ?? "?"}): ${e instanceof Error ? e.message : String(e)}`;
        avisar(`Pedido da IA deu erro: ${erro}`);
        return { erro, feitos, logs, estado: resumoDoProjeto(projeto) };
      }
    }
    avisar("Pedido da IA feito.");
    return { erro: null, feitos, logs, estado: resumoDoProjeto(projeto) };
  }

  async function laco() {
    for (;;) {
      try {
        const r = await fetch(`${ENDERECO}/ponte/proximo?tela=${tela}&visivel=${document.visibilityState === "visible" ? 1 : 0}`, { cache: "no-store" });
        if (r.status !== 200 && r.status !== 204 && r.status !== 409) throw new Error(String(r.status));
        const corpo = r.status === 200 ? await r.json() : null;
        if (r.status === 409 || corpo?.outra) {
          mostrar("outra");
          await pausa(8000);
          continue;
        }
        mostrar("ligada");
        if (r.status === 204) continue;
        const pedido = corpo as Pedido;
        let resposta: Record<string, unknown>;
        try {
          resposta = await atender(pedido);
        } catch (e) {
          resposta = { erro: e instanceof Error ? e.message : String(e) };
        }
        await fetch(`${ENDERECO}/ponte/resposta?tela=${tela}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: pedido.id, ...resposta }),
        });
      } catch {
        mostrar("desligada");
        await pausa(4000);
      }
    }
  }
  void laco();
}
