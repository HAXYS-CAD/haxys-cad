// Painel Construir: planos, eixos e pontos de construção (além do Plano de
// deslocamento, que fica em plano.ts).
// Cada comando tem "entradas" (listas): um plano, um eixo ou um ponto. A lista
// já traz os planos/eixos da origem e os de construção; clicar na peça também
// serve: face plana vira plano, aresta reta ou face cilíndrica vira eixo,
// vértice (ponta de aresta) ou aresta circular (centro) vira ponto. O clique
// preenche a primeira entrada do mesmo tipo que ainda está vazia.
// Diferença do Fusion, por enquanto: o resultado guarda a posição da hora em que
// foi criado (se a peça mudar depois, o plano/eixo/ponto não acompanha).
import * as THREE from "three";
import { abrirDialogo, type Campo, type Dialogo } from "../ui/dialogo";
import { PLANOS_ORIGEM, type PlanoEsboco, type V3 } from "../nucleo/esboco";
import { planoDeslocado } from "../nucleo/construcao";
import type { MalhaCorpo, Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { Vista } from "../vista/cena";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";

type Tipo = "plano" | "eixo" | "ponto";
type Plano = { origem: V3; normal: V3 };
type Eixo = { origem: V3; direcao: V3 };
type Valor = { plano?: Plano; eixo?: Eixo; ponto?: V3 };

interface Def {
  titulo: string;
  base: string;
  cria: Tipo;
  entradas: { chave: string; rotulo: string; tipo: Tipo; padrao?: string }[];
  campos?: Campo[];
  calcular(v: Record<string, Valor>, p: Record<string, number>): Valor;
}

// ---- Contas ----
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const l = Math.hypot(...a);
  if (l < 1e-12) throw new Error("Direção indefinida (itens alinhados ou iguais)");
  return mul(a, 1 / l);
};
// Gira v em volta do eixo d (unitário) por ang graus (Rodrigues).
function girar(v: V3, d: V3, ang: number): V3 {
  const r = (ang * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return add(add(mul(v, c), mul(cross(d, v), s)), mul(d, dot(d, v) * (1 - c)));
}
// Uma direção perpendicular a d (de preferência num eixo do mundo).
function perpendicular(d: V3, preferida?: V3): V3 {
  for (const e of [preferida, [1, 0, 0], [0, 0, 1], [0, 1, 0]] as (V3 | undefined)[]) {
    if (!e) continue;
    const p = sub(e, mul(d, dot(e, d)));
    if (Math.hypot(...p) > 1e-6) return unit(p);
  }
  return [1, 0, 0];
}
// Interseção de dois planos (não paralelos) = eixo.
function eixoDeDoisPlanos(a: Plano, b: Plano): Eixo {
  const d = cross(a.normal, b.normal);
  if (Math.hypot(...d) < 1e-9) throw new Error("Os planos são paralelos (não se cruzam)");
  const da = dot(a.normal, a.origem), db = dot(b.normal, b.origem);
  // Ponto nos dois planos, o mais perto da origem do mundo.
  const n1 = a.normal, n2 = b.normal, d2 = dot(d, d);
  const p = mul(add(mul(cross(n2, d), da), mul(cross(d, n1), db)), 1 / d2);
  return { origem: p, direcao: unit(d) };
}
function pontoDeTresPlanos(a: Plano, b: Plano, c: Plano): V3 {
  const det = dot(a.normal, cross(b.normal, c.normal));
  if (Math.abs(det) < 1e-9) throw new Error("Os três planos não se cruzam num ponto só");
  const da = dot(a.normal, a.origem), db = dot(b.normal, b.origem), dc = dot(c.normal, c.origem);
  return mul(add(add(mul(cross(b.normal, c.normal), da), mul(cross(c.normal, a.normal), db)), mul(cross(a.normal, b.normal), dc)), 1 / det);
}
// Ponto mais perto entre duas retas (meio do menor segmento entre elas).
function pontoEntreRetas(a: Eixo, b: Eixo): V3 {
  const w = sub(a.origem, b.origem);
  const A = dot(a.direcao, a.direcao), B = dot(a.direcao, b.direcao), C = dot(b.direcao, b.direcao);
  const D = dot(a.direcao, w), E = dot(b.direcao, w);
  const den = A * C - B * B;
  if (Math.abs(den) < 1e-12) throw new Error("As arestas são paralelas");
  const s = (B * E - C * D) / den, t = (A * E - B * D) / den;
  return mul(add(add(a.origem, mul(a.direcao, s)), add(b.origem, mul(b.direcao, t))), 0.5);
}
const pedir = <T>(x: T | undefined, msg: string): T => {
  if (x === undefined) throw new Error(msg);
  return x;
};

const PL = (v: Record<string, Valor>, k: string) => pedir(v[k]?.plano, "Escolha os planos (lista ou clique numa face plana)");
const EX = (v: Record<string, Valor>, k: string) => pedir(v[k]?.eixo, "Escolha o eixo (lista, aresta reta ou face cilíndrica)");
const PT = (v: Record<string, Valor>, k: string) => pedir(v[k]?.ponto, "Escolha os pontos (clique perto de um vértice)");

export const COMANDOS_CONSTRUIR: Record<string, Def> = {
  ConstructionPlaneAtAngleCommand: {
    titulo: "Plano no ângulo", base: "Plano", cria: "plano",
    entradas: [{ chave: "eixo", rotulo: "Eixo (gira em volta)", tipo: "eixo", padrao: "X" }, { chave: "ref", rotulo: "Começa no plano", tipo: "plano", padrao: "XZ" }],
    campos: [{ chave: "angulo", rotulo: "Ângulo", valor: 45, unidade: "°" }],
    calcular(v, p) {
      const e = EX(v, "eixo"), ref = PL(v, "ref");
      const d = unit(e.direcao);
      const n0 = perpendicular(d, ref.normal);
      return { plano: { origem: e.origem, normal: girar(n0, d, p.angulo ?? 0) } };
    },
  },
  ConstructionMidPlaneCommand: {
    titulo: "Plano médio", base: "Plano", cria: "plano",
    entradas: [{ chave: "a", rotulo: "Plano A", tipo: "plano" }, { chave: "b", rotulo: "Plano B", tipo: "plano" }],
    calcular(v) {
      const a = PL(v, "a"), b = PL(v, "b");
      let nb = unit(b.normal);
      const na = unit(a.normal);
      if (dot(na, nb) < 0) nb = mul(nb, -1);
      if (Math.abs(Math.abs(dot(na, nb)) - 1) < 1e-9) {
        // Paralelos: no meio do caminho entre os dois.
        const dist = dot(sub(b.origem, a.origem), na);
        return { plano: { origem: add(a.origem, mul(na, dist / 2)), normal: na } };
      }
      // Cruzados: plano que divide o ângulo entre eles, pela reta onde se cruzam.
      const linha = eixoDeDoisPlanos(a, b);
      return { plano: { origem: linha.origem, normal: unit(sub(na, nb)) } };
    },
  },
  ConstructionTangentPlaneCommand: {
    titulo: "Plano tangente", base: "Plano", cria: "plano",
    entradas: [{ chave: "face", rotulo: "Face cilíndrica (eixo)", tipo: "eixo" }],
    campos: [{ chave: "angulo", rotulo: "Ângulo em volta", valor: 0, unidade: "°" }],
    calcular(v, p) {
      const e = pedir(v.face?.eixo, "Clique numa face cilíndrica");
      const r = pedir((v.face as Valor & { raio?: number }).raio, "Clique numa face cilíndrica (não numa aresta)");
      const d = unit(e.direcao);
      const u = girar(perpendicular(d), d, p.angulo ?? 0);
      return { plano: { origem: add(e.origem, mul(u, r)), normal: u } };
    },
  },
  ConstructionPlanePerpendicularToPlaneCommand: {
    titulo: "Plano perpendicular", base: "Plano", cria: "plano",
    entradas: [{ chave: "eixo", rotulo: "Passa pela aresta/eixo", tipo: "eixo", padrao: "Y" }, { chave: "ref", rotulo: "Perpendicular ao plano", tipo: "plano", padrao: "XZ" }],
    calcular(v) {
      const e = EX(v, "eixo"), ref = PL(v, "ref");
      return { plano: { origem: e.origem, normal: unit(cross(unit(e.direcao), ref.normal)) } };
    },
  },
  ConstructionPlaneFromTwoEdgesCommand: {
    titulo: "Plano através de duas arestas", base: "Plano", cria: "plano",
    entradas: [{ chave: "a", rotulo: "Aresta 1", tipo: "eixo" }, { chave: "b", rotulo: "Aresta 2", tipo: "eixo" }],
    calcular(v) {
      const a = EX(v, "a"), b = EX(v, "b");
      let n = cross(a.direcao, b.direcao);
      if (Math.hypot(...n) < 1e-9) n = cross(a.direcao, sub(b.origem, a.origem)); // paralelas
      n = unit(n);
      if (Math.abs(dot(n, sub(b.origem, a.origem))) > 1e-4) throw new Error("As duas arestas não ficam no mesmo plano");
      return { plano: { origem: a.origem, normal: n } };
    },
  },
  ConstructionPlaneFromThreePointsCommand: {
    titulo: "Plano através de três pontos", base: "Plano", cria: "plano",
    entradas: [{ chave: "a", rotulo: "Ponto 1", tipo: "ponto" }, { chave: "b", rotulo: "Ponto 2", tipo: "ponto" }, { chave: "c", rotulo: "Ponto 3", tipo: "ponto" }],
    calcular(v) {
      const a = PT(v, "a"), b = PT(v, "b"), c = PT(v, "c");
      return { plano: { origem: a, normal: unit(cross(sub(b, a), sub(c, a))) } };
    },
  },
  ConstructionPlaneAlongPathCommand: {
    titulo: "Plano ao longo do caminho", base: "Plano", cria: "plano",
    entradas: [{ chave: "caminho", rotulo: "Aresta (caminho)", tipo: "eixo" }],
    campos: [{ chave: "posicao", rotulo: "Posição (0 a 1)", valor: 0.5, unidade: "" }],
    calcular(v) {
      const g = pedir((v.caminho as Valor & { pontoT?: Eixo }).pontoT, "Clique numa aresta");
      return { plano: { origem: g.origem, normal: unit(g.direcao) } };
    },
  },
  ConstructionAxisThroughCylinderCommand: {
    titulo: "Eixo através do cilindro", base: "Eixo", cria: "eixo",
    entradas: [{ chave: "face", rotulo: "Face cilíndrica", tipo: "eixo" }],
    calcular: (v) => ({ eixo: EX(v, "face") }),
  },
  ConstructionAxisThroughEdgeCommand: {
    titulo: "Eixo através de aresta", base: "Eixo", cria: "eixo",
    entradas: [{ chave: "aresta", rotulo: "Aresta reta", tipo: "eixo" }],
    calcular: (v) => ({ eixo: EX(v, "aresta") }),
  },
  ConstructionAxisFromTwoPlanesCommand: {
    titulo: "Eixo através de dois planos", base: "Eixo", cria: "eixo",
    entradas: [{ chave: "a", rotulo: "Plano A", tipo: "plano", padrao: "XY" }, { chave: "b", rotulo: "Plano B", tipo: "plano", padrao: "XZ" }],
    calcular: (v) => ({ eixo: eixoDeDoisPlanos(PL(v, "a"), PL(v, "b")) }),
  },
  ConstructionAxisThroughTwoPointsCommand: {
    titulo: "Eixo através de dois pontos", base: "Eixo", cria: "eixo",
    entradas: [{ chave: "a", rotulo: "Ponto 1", tipo: "ponto" }, { chave: "b", rotulo: "Ponto 2", tipo: "ponto" }],
    calcular: (v) => ({ eixo: { origem: PT(v, "a"), direcao: unit(sub(PT(v, "b"), PT(v, "a"))) } }),
  },
  ConstructionAxisNormalToFaceCommand: {
    titulo: "Eixo perpendicular à face", base: "Eixo", cria: "eixo",
    entradas: [{ chave: "face", rotulo: "Face plana", tipo: "plano" }],
    calcular: (v) => ({ eixo: { origem: PL(v, "face").origem, direcao: unit(PL(v, "face").normal) } }),
  },
  ConstructionPointFromPointCommand: {
    titulo: "Ponto no vértice", base: "Ponto", cria: "ponto",
    entradas: [{ chave: "p", rotulo: "Vértice", tipo: "ponto" }],
    calcular: (v) => ({ ponto: PT(v, "p") }),
  },
  ConstructionPointThroughTwoEdgesCommand: {
    titulo: "Ponto através de duas arestas", base: "Ponto", cria: "ponto",
    entradas: [{ chave: "a", rotulo: "Aresta 1", tipo: "eixo" }, { chave: "b", rotulo: "Aresta 2", tipo: "eixo" }],
    calcular: (v) => ({ ponto: pontoEntreRetas(EX(v, "a"), EX(v, "b")) }),
  },
  ConstructionPointFromThreePlanesCommand: {
    titulo: "Ponto através de três planos", base: "Ponto", cria: "ponto",
    entradas: [
      { chave: "a", rotulo: "Plano A", tipo: "plano", padrao: "XY" },
      { chave: "b", rotulo: "Plano B", tipo: "plano", padrao: "XZ" },
      { chave: "c", rotulo: "Plano C", tipo: "plano", padrao: "YZ" },
    ],
    calcular: (v) => ({ ponto: pontoDeTresPlanos(PL(v, "a"), PL(v, "b"), PL(v, "c")) }),
  },
  ConstructionPointFromCircleOrSphereCommand: {
    titulo: "Ponto no centro do círculo", base: "Ponto", cria: "ponto",
    entradas: [{ chave: "p", rotulo: "Aresta redonda", tipo: "ponto" }],
    calcular: (v) => ({ ponto: PT(v, "p") }),
  },
  ConstructionPointAtEdgeAndPlaneCommand: {
    titulo: "Ponto na aresta e no plano", base: "Ponto", cria: "ponto",
    entradas: [{ chave: "a", rotulo: "Aresta", tipo: "eixo" }, { chave: "pl", rotulo: "Plano", tipo: "plano", padrao: "XZ" }],
    calcular(v) {
      const e = EX(v, "a"), pl = PL(v, "pl");
      const den = dot(pl.normal, e.direcao);
      if (Math.abs(den) < 1e-9) throw new Error("A aresta é paralela ao plano");
      return { ponto: add(e.origem, mul(e.direcao, dot(pl.normal, sub(pl.origem, e.origem)) / den)) };
    },
  },
  ConstructionPointAlongPathCommand: {
    titulo: "Ponto ao longo do caminho", base: "Ponto", cria: "ponto",
    entradas: [{ chave: "caminho", rotulo: "Aresta (caminho)", tipo: "eixo" }],
    campos: [{ chave: "posicao", rotulo: "Posição (0 a 1)", valor: 0.5, unidade: "" }],
    calcular: (v) => ({ ponto: pedir((v.caminho as Valor & { pontoT?: Eixo }).pontoT, "Clique numa aresta").origem }),
  },
};

// ---- Comando ----

let ativo: ((itens: ItemSelecionado[]) => void) | null = null;
export function selecaoMudouConstruir(itens: ItemSelecionado[]) {
  ativo?.(itens);
}

// Plano de esboço (com eixo X) a partir de origem + normal.
export function planoDeConstrucao(nome: string, p: Plano): PlanoEsboco {
  const n = unit(p.normal);
  const arred = (a: V3): V3 => a.map((x) => Math.round(x * 1e6) / 1e6) as V3;
  return { nome, origem: arred(p.origem), eixoX: arred(perpendicular(n, [1, 0, 0])), normal: arred(n) };
}

export function comandoConstruir(raiz: HTMLElement, projeto: Projeto, selecao: Selecao, vista: Vista, idComando: string) {
  const def = COMANDOS_CONSTRUIR[idComando];
  const id = crypto.randomUUID();
  const nome = projeto.proximoNome(def.base);
  // Candidatos por tipo: [chave, texto, valor].
  const candidatos: Record<Tipo, Map<string, { texto: string; valor: Valor }>> = { plano: new Map(), eixo: new Map(), ponto: new Map() };
  for (const [k, p] of Object.entries(PLANOS_ORIGEM)) candidatos.plano.set(k, { texto: `Plano ${k} da origem`, valor: { plano: p } });
  const eixosOrigem: [string, V3][] = [["X", [1, 0, 0]], ["Y", [0, 1, 0]], ["Z", [0, 0, 1]]];
  for (const [k, d] of eixosOrigem) candidatos.eixo.set(k, { texto: `Eixo ${k} da origem`, valor: { eixo: { origem: [0, 0, 0], direcao: d } } });
  candidatos.ponto.set("O", { texto: "Origem", valor: { ponto: [0, 0, 0] } });
  for (const op of projeto.estado.historico) {
    if (op.suprimida) continue;
    const pl = op.tipo === "plano" ? planoDeslocado(op) : null;
    if (pl) candidatos.plano.set(`op:${op.id}`, { texto: op.nome, valor: { plano: pl } });
    if (op.tipo === "eixo" && op.eixoConstrucao) candidatos.eixo.set(`op:${op.id}`, { texto: op.nome, valor: { eixo: op.eixoConstrucao } });
    if (op.tipo === "ponto" && op.pontoConstrucao) candidatos.ponto.set(`op:${op.id}`, { texto: op.nome, valor: { ponto: op.pontoConstrucao } });
  }
  const escolhidos: Record<string, string> = {};
  for (const e of def.entradas) escolhidos[e.chave] = e.padrao ?? "";
  const opcoesDe = (e: Def["entradas"][number]): [string, string][] => [
    ...(e.padrao ? [] : ([["", "(clique na peça ou escolha)"]] as [string, string][])),
    ...[...candidatos[e.tipo]].map(([k, c]) => [k, c.texto] as [string, string]),
  ];
  let params: Record<string, number> = Object.fromEntries((def.campos ?? []).map((c) => [c.chave, c.valor]));
  let contador = 0;

  const montar = (): Operacao | null => {
    const v: Record<string, Valor> = {};
    for (const e of def.entradas) {
      const c = candidatos[e.tipo].get(escolhidos[e.chave]);
      if (c) v[e.chave] = c.valor;
    }
    const r = def.calcular(v, params);
    const base = { id, nome, modo: "novo" as const, opcoes: { metodo: idComando } };
    if (def.cria === "plano") return { ...base, tipo: "plano", params: { distancia: 0 }, planoBase: planoDeConstrucao(def.titulo, r.plano!) };
    if (def.cria === "eixo") return { ...base, tipo: "eixo", params: {}, eixoConstrucao: { origem: r.eixo!.origem, direcao: unit(r.eixo!.direcao) } };
    return { ...base, tipo: "ponto", params: {}, pontoConstrucao: r.ponto! };
  };
  // A janela chama aoMudar já ao abrir, antes de "dialogo" existir: por isso o "?.".
  let dialogo: Dialogo | undefined;
  const atualizar = () => {
    try {
      const op = montar();
      projeto.previsualizar(op);
      dialogo?.definirSelecao("Pronto — OK para criar");
      return op;
    } catch (e) {
      projeto.previsualizar(null);
      dialogo?.definirSelecao(e instanceof Error ? e.message : String(e));
      return null;
    }
  };

  // Clique perto de um vértice (ponta de aresta) vale como ponto.
  let verticeSob: V3 | null = null;
  const temPonto = def.entradas.some((e) => e.tipo === "ponto");
  let apertou: { x: number; y: number } | null = null;
  let verticeEm = 0; // hora do último vértice usado (a seleção ignora o mesmo clique)
  const aoApertar = (ev: PointerEvent) => {
    apertou = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : null;
    verticeSob = temPonto ? verticePerto(vista, projeto.estado.corposBase, ev.clientX, ev.clientY) : null;
  };
  const aoSoltar = (ev: PointerEvent) => {
    if (!apertou || !verticeSob || Math.hypot(ev.clientX - apertou.x, ev.clientY - apertou.y) > 4) return;
    const p = verticeSob;
    verticeSob = null;
    verticeEm = performance.now();
    usar("ponto", `Vértice (${p.map((x) => x.toFixed(1)).join("; ")})`, { ponto: p });
  };
  vista.tela.addEventListener("pointerdown", aoApertar, true);
  vista.tela.addEventListener("pointerup", aoSoltar, true);

  const prioridadeAntes: Prioridade = selecao.prioridade();
  selecao.definirPrioridade("livre");
  selecao.definirSempreSomar(true);
  const fechar = () => {
    ativo = null;
    vista.tela.removeEventListener("pointerdown", aoApertar, true);
    vista.tela.removeEventListener("pointerup", aoSoltar, true);
    selecao.definirSempreSomar(false);
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };

  dialogo = abrirDialogo(raiz, {
    titulo: def.titulo,
    campos: def.campos ?? [],
    escolhas: def.entradas.map((e) => ({ chave: e.chave, rotulo: e.rotulo, opcoes: opcoesDe(e), valor: escolhidos[e.chave] })),
    modo: "novo",
    semModo: true,
    selecao: "Clique na peça ou escolha nas listas",
    rotuloSelecao: "Situação",
    aoMudar: (v, _m, esc) => {
      const mudouPosicao = v.posicao !== params.posicao;
      params = v;
      Object.assign(escolhidos, esc);
      // "Ao longo do caminho": a posição nova pede o ponto de novo ao núcleo.
      if (mudouPosicao && caminhoClicado) void refazerCaminho();
      else atualizar();
    },
    aoOK: (v, _m, esc) => {
      params = v;
      Object.assign(escolhidos, esc);
      const op = atualizar();
      fechar();
      if (op) projeto.adicionar(op);
      else projeto.previsualizar(null);
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  // Coloca um candidato novo na 1ª entrada vazia do tipo (ou na última do tipo).
  const usar = (tipo: Tipo, texto: string, valor: Valor) => {
    const entradas = def.entradas.filter((e) => e.tipo === tipo);
    if (!entradas.length) return false;
    const chave = `c${++contador}`;
    candidatos[tipo].set(chave, { texto, valor });
    const alvo = entradas.find((e) => !escolhidos[e.chave] || e.padrao === escolhidos[e.chave] && !escolhidos[`_${e.chave}`]) ?? entradas[entradas.length - 1];
    escolhidos[alvo.chave] = chave;
    escolhidos[`_${alvo.chave}`] = "clicado";
    for (const e of def.entradas) dialogo!.definirEscolha(e.chave, escolhidos[e.chave], opcoesDe(e));
    atualizar();
    return true;
  };

  let caminhoClicado: { item: ItemSelecionado; chave: string } | null = null;
  const refazerCaminho = async () => {
    const c = caminhoClicado!;
    const g = (await projeto.geometria({ corpo: c.item.corpo, tipo: c.item.tipo, indice: c.item.indice }, params.posicao ?? 0.5)) as Record<string, unknown>;
    const cand = candidatos.eixo.get(c.chave);
    if (cand) (cand.valor as Valor & { pontoT?: Eixo }).pontoT = { origem: g.ponto as V3, direcao: g.tangente as V3 };
    atualizar();
  };

  let vistos = 0;
  ativo = async (itens) => {
    // Vértice vale mesmo se o clique desmarcou algo (a seleção soma/tira).
    const novo = itens.length > vistos;
    vistos = itens.length;
    if (performance.now() - verticeEm < 400) return; // este clique já virou vértice
    if (!novo) return;
    const it = itens[itens.length - 1];
    if (it.tipo === "corpo") return;
    try {
      const g = (await projeto.geometria({ corpo: it.corpo, tipo: it.tipo, indice: it.indice }, (params.posicao ?? 0.5))) as Record<string, unknown>;
      const nomeIt = `${it.tipo === "face" ? "Face" : "Aresta"} de ${it.corpo}`;
      if (g.tipo === "plano") usar("plano", nomeIt, { plano: { origem: g.origem as V3, normal: g.normal as V3 } });
      else if (g.tipo === "cilindro") usar("eixo", `Eixo do cilindro (${it.corpo})`, { eixo: { origem: g.origem as V3, direcao: g.direcao as V3 }, ...({ raio: g.raio } as object) });
      else if (g.tipo === "reta" || it.tipo === "aresta") {
        const valor: Valor & { pontoT?: Eixo } = { pontoT: { origem: g.ponto as V3, direcao: g.tangente as V3 } };
        if (g.tipo === "reta") valor.eixo = { origem: g.a as V3, direcao: sub(g.b as V3, g.a as V3) };
        if (g.tipo === "circulo" && def.entradas.some((e) => e.tipo === "ponto") && !def.entradas.some((e) => e.tipo === "eixo"))
          usar("ponto", `Centro do círculo (${it.corpo})`, { ponto: g.centro as V3 });
        else if (g.tipo === "reta" || def.entradas.some((e) => e.chave === "caminho")) {
          usar("eixo", nomeIt, valor);
          if (def.entradas.some((e) => e.chave === "caminho")) caminhoClicado = { item: it, chave: `c${contador}` };
        }
        else dialogo!.definirSelecao("Essa aresta não é reta");
      } else dialogo!.definirSelecao("Essa face não serve aqui");
    } catch (e) {
      dialogo!.definirSelecao(e instanceof Error ? e.message : String(e));
    }
  };
  atualizar();
}

// Vértice (ponta de aresta) mais perto do mouse, até 10 px.
function verticePerto(vista: Vista, corpos: MalhaCorpo[], x: number, y: number): V3 | null {
  const r = vista.tela.getBoundingClientRect();
  const m = new THREE.Vector2(x - r.left, y - r.top);
  let melhor = 10;
  let achado: V3 | null = null;
  const v = new THREE.Vector3();
  for (const c of corpos) {
    for (let e = 0; e < c.gruposArestas.length / 2; e++) {
      const ini = c.gruposArestas[e * 2], qtd = c.gruposArestas[e * 2 + 1];
      for (const i of [ini, ini + qtd - 1]) {
        v.set(c.arestas[i * 3], c.arestas[i * 3 + 1], c.arestas[i * 3 + 2]);
        const p = v.clone().project(vista.camera);
        const s = new THREE.Vector2(((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height);
        const d = s.distanceTo(m);
        if (d < melhor) (melhor = d), (achado = [v.x, v.y, v.z]);
      }
    }
  }
  return achado;
}
