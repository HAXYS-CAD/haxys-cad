// Dados de um esboço e cálculo dos perfis (regiões fechadas).
// Usado pela tela e pelo worker, por isso não depende de Three.js nem do OpenCascade.

import { medidaCota, resolver, type Restricao } from "./restricoes";

export type V3 = [number, number, number];
export type P2 = [number, number];

// Plano do esboço. Ponto (u, v) do esboço = origem + u·eixoX + v·(normal × eixoX).
export interface PlanoEsboco {
  origem: V3;
  eixoX: V3;
  normal: V3;
  nome: string; // "XY", "XZ", "YZ" ou "Face"
}

export const PLANOS_ORIGEM: Record<"XY" | "XZ" | "YZ", PlanoEsboco> = {
  XY: { nome: "XY", origem: [0, 0, 0], eixoX: [1, 0, 0], normal: [0, 0, 1] },
  XZ: { nome: "XZ", origem: [0, 0, 0], eixoX: [1, 0, 0], normal: [0, 1, 0] },
  YZ: { nome: "YZ", origem: [0, 0, 0], eixoX: [0, 0, -1], normal: [1, 0, 0] },
};

export interface PontoEsboco {
  id: number;
  u: number;
  v: number;
}

export type CurvaEsboco =
  // h/v = restrição horizontal/vertical (o Fusion põe sozinho em linhas quase retas)
  | { id: number; tipo: "linha"; a: number; b: number; restricao?: "h" | "v" }
  | { id: number; tipo: "circulo"; centro: number; raio: number }
  // Arco no sentido anti-horário, do ponto "a" até o ponto "b". Raio = distância centro→a.
  | { id: number; tipo: "arco"; centro: number; a: number; b: number }
  // Spline por pontos: passa por a, internos..., b (a === b = fechada).
  // controle = os pontos são de controle (a curva só passa pelas pontas).
  | { id: number; tipo: "spline"; a: number; b: number; internos: number[]; controle?: boolean }
  // Elipse: centro, "a" = ponta do eixo maior, "menor" = meia medida do outro eixo.
  | { id: number; tipo: "elipse"; centro: number; a: number; menor: number };

// Todos os pontos que uma curva usa (pontas, centro, pontos da spline).
export function idsDaCurva(c: CurvaEsboco): number[] {
  if (c.tipo === "linha") return [c.a, c.b];
  if (c.tipo === "circulo") return [c.centro];
  if (c.tipo === "arco") return [c.centro, c.a, c.b];
  if (c.tipo === "elipse") return [c.centro, c.a];
  return c.a === c.b ? [c.a, ...c.internos] : [c.a, ...c.internos, c.b];
}

// ---- Spline ----
// Curva suave que passa pelos pontos clicados (Catmull-Rom), guardada como
// trechos de Bézier cúbica: a tela e o núcleo 3D usam exatamente a mesma conta.
// Diferença do Fusion: a dele é C2 (curvatura contínua); esta é C1 (tangente contínua).

export type Bezier = [P2, P2, P2, P2]; // início, controle 1, controle 2, fim

export function beziersDaSpline(pts: P2[], fechada: boolean, controle = false): Bezier[] {
  if (controle) return beziersDeControle(pts, fechada);
  const n = pts.length;
  const lista: Bezier[] = [];
  const segs = fechada ? n : n - 1;
  const P = (i: number): P2 => (fechada ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    lista.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return lista;
}

// Spline por pontos de controle: B-spline cúbica uniforme. Aberta: começa no 1º
// ponto e termina no último (nós repetidos nas pontas) e é puxada pelos do meio.
// Fechada: periódica (não passa por nenhum ponto). Vira trechos de Bézier
// inserindo nós (Boehm) até cada nó do meio ficar triplo.
// Diferença do Fusion: o grau é sempre 3 (o Fusion também tem grau 5).
export function beziersDeControle(pts: P2[], fechada: boolean): Bezier[] {
  const n = pts.length;
  const mix = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (fechada) {
    if (n < 3) return [];
    return pts.map((_, i) => {
      const p0 = pts[i], p1 = pts[(i + 1) % n], p2 = pts[(i + 2) % n], p3 = pts[(i + 3) % n];
      const b1 = mix(p1, p2, 1 / 3), b2 = mix(p1, p2, 2 / 3);
      return [mix(mix(p0, p1, 2 / 3), b1, 0.5), b1, b2, mix(b2, mix(p2, p3, 1 / 3), 0.5)] as Bezier;
    });
  }
  if (n < 2) return [];
  if (n === 2) return [[pts[0], mix(pts[0], pts[1], 1 / 3), mix(pts[0], pts[1], 2 / 3), pts[1]]];
  if (n === 3) return [[pts[0], mix(pts[0], pts[1], 2 / 3), mix(pts[2], pts[1], 2 / 3), pts[2]]]; // grau 2 elevado
  const m = n - 3; // trechos
  let P = pts.slice();
  const U = [0, 0, 0, 0, ...Array.from({ length: m - 1 }, (_, i) => i + 1), m, m, m, m];
  for (let k = 1; k < m; k++)
    for (let vez = 0; vez < 2; vez++) {
      const r = U.lastIndexOf(k);
      const Q: P2[] = [];
      for (let i = 0; i <= P.length; i++) {
        if (i <= r - 3) Q.push(P[i]);
        else if (i <= r) Q.push(mix(P[i - 1], P[i], (k - U[i]) / (U[i + 3] - U[i])));
        else Q.push(P[i - 1]);
      }
      U.splice(r + 1, 0, k);
      P = Q;
    }
  return Array.from({ length: m }, (_, j) => [P[3 * j], P[3 * j + 1], P[3 * j + 2], P[3 * j + 3]] as Bezier);
}

export function pontoBezier(b: Bezier, t: number): P2 {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((i) => k[0] * b[0][i] + k[1] * b[1][i] + k[2] * b[2][i] + k[3] * b[3][i]) as P2;
}

function amostrarBeziers(bs: Bezier[], porTrecho = 16): P2[] {
  const pts: P2[] = [];
  bs.forEach((b, i) => {
    for (let k = i ? 1 : 0; k <= porTrecho; k++) pts.push(pontoBezier(b, k / porTrecho));
  });
  return pts;
}

// Cota do esboço. "valor" = medida que manda (sem valor = só mostra a medida atual).
// "sinal" guarda o lado/sentido escolhido na hora de criar, para a conta não "virar".
// "expressao": a medida veio de uma expressão com parâmetros (ex.: "largura / 2").
export type CotaEsboco = { expressao?: string } & (
  // linha = comprimento, círculo = diâmetro, arco = raio
  | { id: number; tipo?: "curva"; curva: number; valor?: number }
  // ângulo entre duas linhas, em graus
  // ângulo entre duas linhas, em graus ("suplemento" = mede o lado de 180° menos o ângulo)
  | { id: number; tipo: "angulo"; c1: number; c2: number; sinal: number; suplemento?: boolean; valor?: number }
  // distância entre dois pontos: alinhada, só horizontal (h) ou só vertical (v)
  | { id: number; tipo: "pontos"; p1: number; p2: number; eixo: "livre" | "h" | "v"; sinal: number; valor?: number }
  // distância de um ponto até uma linha (também usada para linhas paralelas)
  | { id: number; tipo: "pontoLinha"; ponto: number; curva: number; sinal: number; valor?: number }
);

export interface DadosEsboco {
  plano: PlanoEsboco;
  pontos: PontoEsboco[];
  curvas: CurvaEsboco[];
  cotas: CotaEsboco[];
  restricoes?: Restricao[]; // Coincidente, Tangente, Paralelo... (H/V fica na própria linha)
}

// ---- Plano ----

const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function eixoY(p: PlanoEsboco): V3 {
  return cross(p.normal, p.eixoX);
}

export function paraMundo(p: PlanoEsboco, u: number, v: number): V3 {
  const y = eixoY(p);
  return [0, 1, 2].map((i) => p.origem[i] + u * p.eixoX[i] + v * y[i]) as V3;
}

export function paraPlano(p: PlanoEsboco, w: V3): P2 {
  const d: V3 = [w[0] - p.origem[0], w[1] - p.origem[1], w[2] - p.origem[2]];
  const y = eixoY(p);
  return [d[0] * p.eixoX[0] + d[1] * p.eixoX[1] + d[2] * p.eixoX[2], d[0] * y[0] + d[1] * y[1] + d[2] * y[2]];
}

// ---- Geometria do arco ----

const DOIS_PI = Math.PI * 2;
const EPS = 1e-6;

export const angulo = (c: P2, p: P2) => Math.atan2(p[1] - c[1], p[0] - c[0]);
// Quanto se gira no sentido anti-horário para ir de a0 até a1 (0 a 2π).
export const varredura = (a0: number, a1: number) => (((a1 - a0) % DOIS_PI) + DOIS_PI) % DOIS_PI;
const noCirculo = (c: P2, r: number, a: number): P2 => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

export function amostrarArco(c: P2, r: number, a0: number, sweep: number, n = 48): P2[] {
  const passos = Math.max(2, Math.ceil((n * sweep) / DOIS_PI));
  return Array.from({ length: passos + 1 }, (_, i) => noCirculo(c, r, a0 + (sweep * i) / passos));
}

// Centro do círculo que passa por três pontos (null se estão alinhados).
export function centroDe3Pontos(p1: P2, p2: P2, p3: P2): P2 | null {
  const d = 2 * (p1[0] * (p2[1] - p3[1]) + p2[0] * (p3[1] - p1[1]) + p3[0] * (p1[1] - p2[1]));
  if (Math.abs(d) < EPS) return null;
  const q = (p: P2) => p[0] * p[0] + p[1] * p[1];
  return [
    (q(p1) * (p2[1] - p3[1]) + q(p2) * (p3[1] - p1[1]) + q(p3) * (p1[1] - p2[1])) / d,
    (q(p1) * (p3[0] - p2[0]) + q(p2) * (p1[0] - p3[0]) + q(p3) * (p2[0] - p1[0])) / d,
  ];
}

const posicao = (e: DadosEsboco, id: number): P2 => {
  const p = e.pontos.find((q) => q.id === id)!;
  return [p.u, p.v];
};

export interface GeoArco {
  centro: P2;
  raio: number;
  inicio: number; // ângulo do ponto a
  sweep: number; // anti-horário até b
}

export function geoArco(e: DadosEsboco, c: Extract<CurvaEsboco, { tipo: "arco" }>): GeoArco {
  const centro = posicao(e, c.centro);
  const a = posicao(e, c.a);
  const b = posicao(e, c.b);
  const inicio = angulo(centro, a);
  const s = varredura(inicio, angulo(centro, b));
  return { centro, raio: Math.hypot(a[0] - centro[0], a[1] - centro[1]), inicio, sweep: s < EPS ? DOIS_PI : s };
}

// Pontos para desenhar uma curva (no plano do esboço).
export function amostrarCurva(e: DadosEsboco, c: CurvaEsboco): P2[] {
  if (c.tipo === "linha") return [posicao(e, c.a), posicao(e, c.b)];
  if (c.tipo === "elipse") return amostrarElipse(posicao(e, c.centro), posicao(e, c.a), c.menor, 96);
  if (c.tipo === "spline") return amostrarBeziers(beziersDaSpline(idsDaCurva(c).map((id) => posicao(e, id)), c.a === c.b, c.controle));
  if (c.tipo === "circulo") return amostrarArco(posicao(e, c.centro), c.raio, 0, DOIS_PI, 64);
  const g = geoArco(e, c);
  return amostrarArco(g.centro, g.raio, g.inicio, g.sweep);
}

// Pontos de uma elipse (volta inteira; o último repete o primeiro).
export function amostrarElipse(centro: P2, ponta: P2, menor: number, n = 64): P2[] {
  const ex: P2 = [ponta[0] - centro[0], ponta[1] - centro[1]];
  const maior = Math.hypot(ex[0], ex[1]) || 1;
  const ey: P2 = [(-ex[1] / maior) * menor, (ex[0] / maior) * menor];
  const pts: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (2 * Math.PI * i) / n;
    pts.push([centro[0] + ex[0] * Math.cos(t) + ey[0] * Math.sin(t), centro[1] + ex[1] * Math.cos(t) + ey[1] * Math.sin(t)]);
  }
  return pts;
}

// ---- Perfis ----

export type Segmento =
  | { tipo: "linha"; de: P2; para: P2 }
  | { tipo: "arco"; de: P2; para: P2; meio: P2 }
  // pontos da spline no sentido do percurso (de ... para); fechada = volta inteira
  | { tipo: "spline"; de: P2; para: P2; pontos: P2[]; fechada: boolean; controle?: boolean };

export type Laco =
  | { tipo: "circulo"; centro: P2; raio: number }
  | { tipo: "elipse"; centro: P2; ponta: P2; menor: number }
  | { tipo: "contorno"; segmentos: Segmento[] };

export interface Perfil {
  externo: Laco;
  furos: Laco[];
}

// Contorno do laço como polígono (arcos viram vários pontinhos).
export function contornoDoLaco(l: Laco, n = 64): P2[] {
  if (l.tipo === "circulo") return amostrarArco(l.centro, l.raio, 0, DOIS_PI, n).slice(0, -1);
  if (l.tipo === "elipse") return amostrarElipse(l.centro, l.ponta, l.menor, n).slice(0, -1);
  const pts: P2[] = [];
  for (const s of l.segmentos) {
    if (s.tipo === "linha") pts.push(s.de);
    else if (s.tipo === "spline") pts.push(...amostrarBeziers(beziersDaSpline(s.pontos, s.fechada, s.controle)).slice(0, -1));
    else {
      const c = centroDe3Pontos(s.de, s.meio, s.para)!;
      const r = Math.hypot(s.de[0] - c[0], s.de[1] - c[1]);
      // Sentido: anti-horário se o "meio" fica dentro da varredura anti-horária.
      const a0 = angulo(c, s.de);
      const ccw = varredura(a0, angulo(c, s.meio)) < varredura(a0, angulo(c, s.para));
      const sw = ccw ? varredura(a0, angulo(c, s.para)) : -varredura(angulo(c, s.para), a0);
      const passos = Math.max(2, Math.ceil((n * Math.abs(sw)) / DOIS_PI));
      for (let i = 0; i < passos; i++) pts.push(noCirculo(c, r, a0 + (sw * i) / passos));
    }
  }
  return pts;
}

export function areaLaco(l: Laco): number {
  if (l.tipo === "circulo") return Math.PI * l.raio * l.raio;
  if (l.tipo === "elipse") return Math.PI * Math.hypot(l.ponta[0] - l.centro[0], l.ponta[1] - l.centro[1]) * l.menor;
  const p = contornoDoLaco(l);
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function dentro(pt: P2, l: Laco): boolean {
  if (l.tipo === "circulo") return Math.hypot(pt[0] - l.centro[0], pt[1] - l.centro[1]) < l.raio;
  let c = false;
  const p = contornoDoLaco(l);
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (p[i][1] > pt[1] !== p[j][1] > pt[1] &&
      pt[0] < ((p[j][0] - p[i][0]) * (pt[1] - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
}

// Laço A está dentro de B se todos os pontos de A estão dentro de B.
function lacoDentro(a: Laco, b: Laco): boolean {
  return areaLaco(a) < areaLaco(b) && contornoDoLaco(a, 16).every((p) => dentro(p, b));
}

// Acha os laços fechados: cada círculo e cada ciclo simples de linhas e arcos
// (todos os pontos com exatamente duas curvas). Ramos e cruzamentos são ignorados.
export function lacos(e: DadosEsboco): Laco[] {
  const resultado: Laco[] = [];
  for (const c of e.curvas) {
    if (c.tipo === "circulo" && c.raio > 0) resultado.push({ tipo: "circulo", centro: posicao(e, c.centro), raio: c.raio });
    if (c.tipo === "elipse" && c.menor > 0) resultado.push({ tipo: "elipse", centro: posicao(e, c.centro), ponta: posicao(e, c.a), menor: c.menor });
  }
  const bordas = e.curvas.filter(
    (c): c is Exclude<CurvaEsboco, { tipo: "circulo" | "elipse" }> => c.tipo === "linha" || c.tipo === "arco" || c.tipo === "spline",
  );
  const porPonto = new Map<number, typeof bordas>();
  for (const c of bordas) {
    porPonto.set(c.a, [...(porPonto.get(c.a) ?? []), c]);
    porPonto.set(c.b, [...(porPonto.get(c.b) ?? []), c]);
  }
  const usadas = new Set<number>();
  for (const inicio of bordas) {
    if (usadas.has(inicio.id)) continue;
    // Anda pelo ciclo curva a curva; para se achar ponto com mais (ou menos) de duas curvas.
    const caminho: { curva: (typeof bordas)[number]; de: number; para: number }[] = [];
    let ponto = inicio.a;
    let curva = inicio;
    let fechado = false;
    for (let passo = 0; passo <= bordas.length; passo++) {
      if ((porPonto.get(ponto)?.length ?? 0) !== 2) break;
      const para = curva.a === ponto ? curva.b : curva.a;
      caminho.push({ curva, de: ponto, para });
      if ((porPonto.get(para)?.length ?? 0) !== 2) break;
      if (para === inicio.a) {
        fechado = true;
        break;
      }
      curva = porPonto.get(para)!.find((x) => x !== curva)!;
      ponto = para;
    }
    caminho.forEach((p) => usadas.add(p.curva.id));
    // Uma spline fechada sozinha também é um laço.
    if (!fechado || (caminho.length < 2 && caminho[0]?.curva.tipo !== "spline")) continue;
    const segmentos: Segmento[] = caminho.map(({ curva: c, de, para }) => {
      if (c.tipo === "linha") return { tipo: "linha", de: posicao(e, de), para: posicao(e, para) };
      if (c.tipo === "spline") {
        const ids = idsDaCurva(c);
        const pontos = ids.map((id) => posicao(e, id));
        // Percorrida ao contrário (de b para a): inverte os pontos.
        if (c.a !== c.b && de === c.b) pontos.reverse();
        return { tipo: "spline", de: posicao(e, de), para: posicao(e, para), pontos, fechada: c.a === c.b, controle: c.controle };
      }
      const g = geoArco(e, c);
      return { tipo: "arco", de: posicao(e, de), para: posicao(e, para), meio: noCirculo(g.centro, g.raio, g.inicio + g.sweep / 2) };
    });
    const laco: Laco = { tipo: "contorno", segmentos };
    if (areaLaco(laco) > EPS) resultado.push(laco);
  }
  return resultado;
}

// Perfil = laço menos os laços que estão logo dentro dele (furos).
export function perfis(e: DadosEsboco): Perfil[] {
  const ls = lacos(e);
  return ls.map((externo) => {
    const internos = ls.filter((l) => l !== externo && lacoDentro(l, externo));
    const furos = internos.filter((l) => !internos.some((o) => o !== l && lacoDentro(l, o)));
    return { externo, furos };
  });
}

// Números dos perfis que são material: o contorno de fora está dentro de um
// número par de outros laços (0 = peça, 1 = miolo de furo, 2 = ilha no furo...).
// É o que se quer quando ninguém escolhe as regiões (IA, voz, script).
export function perfisDeMaterial(e: DadosEsboco): number[] {
  const ls = lacos(e);
  return ls.flatMap((l, i) => (ls.filter((o) => o !== l && lacoDentro(l, o)).length % 2 === 0 ? [i] : []));
}

// ---- Cotas ----

// Medida atual no desenho (sem olhar o valor pedido).
export function medirCota(e: DadosEsboco, cota: CotaEsboco): number {
  return medidaCota(e, cota, (id) => posicao(e, id), (id) => {
    const c = e.curvas.find((x) => x.id === id);
    return c && c.tipo === "circulo" ? c.raio : 0;
  });
}

export function valorCota(e: DadosEsboco, cota: CotaEsboco): number {
  return cota.valor ?? medirCota(e, cota);
}

// Pontos que se mexem primeiro quando a cota muda.
function pontosDaCota(e: DadosEsboco, k: CotaEsboco): number[] {
  const pts = (id: number) => {
    const c = e.curvas.find((x) => x.id === id);
    // Arco: o centro também mexe primeiro (raio novo do arredondamento sem empurrar as linhas).
    return !c ? [] : c.tipo === "linha" ? [c.a, c.b] : idsDaCurva(c);
  };
  switch (k.tipo) {
    case "angulo": return pts(k.c2);
    case "pontos": return [k.p2];
    case "pontoLinha": return [k.ponto];
    default: return pts(k.curva);
  }
}

// Muda a medida e deixa o resolvedor acertar o resto (restrições e outras cotas).
// Devolve false, sem mudar nada, se a nova medida briga com o que já existe.
export function aplicarCota(e: DadosEsboco, cota: CotaEsboco, valor: number): boolean {
  if (!Number.isFinite(valor) || (cota.tipo !== "angulo" && !(valor > 0))) return false;
  const copia: DadosEsboco = structuredClone(e);
  const k = copia.cotas.find((x) => x.id === cota.id);
  if (!k) return false;
  k.valor = valor;
  if (!resolver(copia, new Set(pontosDaCota(copia, k)))) return false;
  Object.assign(e, copia);
  cota.valor = valor;
  return true;
}

// Tira cotas e restrições que citam curvas ou pontos que não existem mais.
export function limparReferencias(e: DadosEsboco) {
  const curvas = new Set(e.curvas.map((c) => c.id));
  const pontos = new Set(e.pontos.map((p) => p.id));
  e.cotas = e.cotas.filter((k) => {
    switch (k.tipo) {
      case "angulo": return curvas.has(k.c1) && curvas.has(k.c2);
      case "pontos": return pontos.has(k.p1) && pontos.has(k.p2);
      case "pontoLinha": return pontos.has(k.ponto) && curvas.has(k.curva);
      default: return curvas.has(k.curva);
    }
  });
  e.restricoes = (e.restricoes ?? []).filter((r) => {
    switch (r.tipo) {
      case "fixo":
        return pontos.has(r.ponto);
      case "coincidente":
      case "pontoMedio":
        return pontos.has(r.ponto) && curvas.has(r.curva);
      case "simetria":
        return pontos.has(r.p1) && pontos.has(r.p2) && curvas.has(r.curva);
      case "poligono":
        return r.curvas.every((c) => curvas.has(c));
      default:
        return curvas.has(r.c1) && curvas.has(r.c2);
    }
  });
}

// ---- Cadeia de curvas (caminho da Varredura) ----
// A partir de uma linha/arco, junta as curvas ligadas ponta com ponta (sem
// bifurcação) e devolve em ordem, de uma ponta da cadeia até a outra.
export function cadeiaDeCurvas(e: DadosEsboco, curvaId: number): number[] {
  const bordas = e.curvas.filter((c) => c.tipo !== "circulo" && c.tipo !== "elipse") as Exclude<CurvaEsboco, { tipo: "circulo" | "elipse" }>[];
  const inicial = bordas.find((c) => c.id === curvaId);
  if (!inicial) return [];
  const porPonto = new Map<number, typeof bordas>();
  for (const c of bordas) for (const p of [c.a, c.b]) porPonto.set(p, [...(porPonto.get(p) ?? []), c]);
  const andar = (de: (typeof bordas)[number], ponto: number) => {
    const lista: (typeof bordas)[number][] = [];
    let atual = de, p = ponto;
    while (true) {
      const vizinhas = (porPonto.get(p) ?? []).filter((c) => c !== atual);
      if (vizinhas.length !== 1 || lista.includes(vizinhas[0]) || vizinhas[0] === inicial) break;
      atual = vizinhas[0];
      lista.push(atual);
      p = atual.a === p ? atual.b : atual.a;
    }
    return lista;
  };
  const paraTras = andar(inicial, inicial.a).reverse();
  const paraFrente = andar(inicial, inicial.b);
  return [...paraTras, inicial, ...paraFrente].map((c) => c.id);
}

// ---- Recortar ----

// Forma geométrica de uma curva: segmento, ou círculo com faixa de ângulos.
type Forma =
  | { tipo: "seg"; a: P2; b: P2 }
  | { tipo: "circ"; c: P2; r: number; inicio: number; sweep: number };

function formaDa(e: DadosEsboco, c: Exclude<CurvaEsboco, { tipo: "spline" | "elipse" }>): Forma {
  if (c.tipo === "linha") return { tipo: "seg", a: posicao(e, c.a), b: posicao(e, c.b) };
  if (c.tipo === "circulo") return { tipo: "circ", c: posicao(e, c.centro), r: c.raio, inicio: 0, sweep: DOIS_PI };
  const g = geoArco(e, c);
  return { tipo: "circ", c: g.centro, r: g.raio, inicio: g.inicio, sweep: g.sweep };
}

const TOL = 1e-7;

function naForma(f: Forma, p: P2): boolean {
  if (f.tipo === "seg") {
    const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1];
    const l2 = dx * dx + dy * dy;
    const t = ((p[0] - f.a[0]) * dx + (p[1] - f.a[1]) * dy) / l2;
    const q: P2 = [f.a[0] + t * dx, f.a[1] + t * dy];
    return t >= -1e-6 && t <= 1 + 1e-6 && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-5 * Math.max(1, Math.sqrt(l2));
  }
  const d = Math.hypot(p[0] - f.c[0], p[1] - f.c[1]);
  if (Math.abs(d - f.r) > 1e-5 * Math.max(1, f.r)) return false;
  if (f.sweep >= DOIS_PI - TOL) return true;
  // Ponta do arco conta como "no arco" (o ângulo pode dar quase 360° em vez de 0°).
  const v = varredura(f.inicio, angulo(f.c, p));
  return v <= f.sweep + 1e-6 || v >= DOIS_PI - 1e-6;
}

// Pontos onde duas formas se cruzam ou se tocam.
function cruzamentos(f: Forma, g: Forma): P2[] {
  const candidatos: P2[] = [];
  if (f.tipo === "seg" && g.tipo === "seg") {
    const [x1, y1] = f.a, [x2, y2] = f.b, [x3, y3] = g.a, [x4, y4] = g.b;
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) > 1e-12) {
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      candidatos.push([x1 + t * (x2 - x1), y1 + t * (y2 - y1)]);
    }
    candidatos.push(f.a, f.b, g.a, g.b); // pontas encostadas (T)
  } else if (f.tipo === "circ" && g.tipo === "circ") {
    const dx = g.c[0] - f.c[0], dy = g.c[1] - f.c[1];
    const d = Math.hypot(dx, dy);
    if (d > EPS && d <= f.r + g.r + 1e-9 && d >= Math.abs(f.r - g.r) - 1e-9) {
      const a = (f.r * f.r - g.r * g.r + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, f.r * f.r - a * a));
      const mx = f.c[0] + (a * dx) / d, my = f.c[1] + (a * dy) / d;
      candidatos.push([mx + (h * dy) / d, my - (h * dx) / d], [mx - (h * dy) / d, my + (h * dx) / d]);
    }
  } else {
    const s = (f.tipo === "seg" ? f : g) as Extract<Forma, { tipo: "seg" }>;
    const c = (f.tipo === "circ" ? f : g) as Extract<Forma, { tipo: "circ" }>;
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
    const fx = s.a[0] - c.c[0], fy = s.a[1] - c.c[1];
    const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - c.r * c.r;
    const disc = B * B - 4 * A * C;
    if (disc >= -1e-9) {
      const r = Math.sqrt(Math.max(0, disc));
      for (const t of [(-B - r) / (2 * A), (-B + r) / (2 * A)]) candidatos.push([s.a[0] + t * dx, s.a[1] + t * dy]);
    }
    candidatos.push(s.a, s.b);
  }
  return candidatos.filter((p) => naForma(f, p) && naForma(g, p));
}

// Posição ao longo da curva: linha 0..1; círculo/arco = ângulo girado desde o início.
// Pontos onde a curva cruza as outras (Quebrar). Spline e elipse ficam de fora.
export function cortesDaCurva(e: DadosEsboco, curvaId: number): P2[] {
  const c = e.curvas.find((x) => x.id === curvaId);
  if (!c || c.tipo === "spline" || c.tipo === "elipse") return [];
  const f = formaDa(e, c);
  const pts: P2[] = [];
  for (const o of e.curvas) {
    if (o.id === curvaId || o.tipo === "spline" || o.tipo === "elipse") continue;
    pts.push(...cruzamentos(f, formaDa(e, o)));
  }
  return pts;
}

// Cruzamentos de uma semirreta (de "a" na direção "d") com as curvas, menos "ignorar" (Estender).
export function cruzamentosDaSemirreta(e: DadosEsboco, a: P2, d: P2, ignorar: number): P2[] {
  const f: Forma = { tipo: "seg", a, b: [a[0] + d[0] * 1e5, a[1] + d[1] * 1e5] };
  const pts: P2[] = [];
  for (const o of e.curvas) {
    if (o.id === ignorar || o.tipo === "spline" || o.tipo === "elipse") continue;
    pts.push(...cruzamentos(f, formaDa(e, o)));
  }
  return pts;
}

function parametro(f: Forma, p: P2): number {
  if (f.tipo === "seg") {
    const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1];
    return ((p[0] - f.a[0]) * dx + (p[1] - f.a[1]) * dy) / (dx * dx + dy * dy);
  }
  const v = varredura(f.inicio, angulo(f.c, p));
  return v >= DOIS_PI - 1e-6 ? 0 : v; // a ponta inicial é 0, não 360°
}

export interface ResultadoRecorte {
  novo: DadosEsboco;
  removido: P2[]; // pedaço que sai (para mostrar em vermelho)
}

// Recortar (como no Fusion): tira o pedaço da curva entre os cruzamentos mais
// próximos do ponto clicado. Sem cruzamentos, a curva inteira sai.
export function recortar(e: DadosEsboco, curvaId: number, clique: P2): ResultadoRecorte | null {
  const c = e.curvas.find((x) => x.id === curvaId);
  if (!c) return null;
  if (c.tipo === "spline" || c.tipo === "elipse") {
    // Spline e elipse saem inteiras (por enquanto não é cortada nos cruzamentos).
    const novo: DadosEsboco = structuredClone(e);
    novo.curvas = novo.curvas.filter((x) => x.id !== curvaId);
    const usados = new Set(novo.curvas.flatMap(idsDaCurva));
    novo.pontos = novo.pontos.filter((p) => p.id === 0 || usados.has(p.id));
    limparReferencias(novo);
    return { novo, removido: amostrarCurva(e, c) };
  }
  const f = formaDa(e, c);
  const cortes: number[] = [];
  for (const outra of e.curvas) {
    if (outra.id === curvaId || outra.tipo === "spline" || outra.tipo === "elipse") continue; // estas não cortam (ainda)
    for (const p of cruzamentos(f, formaDa(e, outra))) cortes.push(parametro(f, p));
  }
  const t = parametro(f, clique);
  const novo: DadosEsboco = structuredClone(e);
  const semCurva = () => (novo.curvas = novo.curvas.filter((x) => x.id !== curvaId));
  const pontoEm = (pos: P2): number => {
    const existe = novo.pontos.find((p) => Math.hypot(p.u - pos[0], p.v - pos[1]) < 1e-6);
    if (existe) return existe.id;
    const id = novo.pontos.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    novo.pontos.push({ id, u: pos[0], v: pos[1] });
    return id;
  };
  const novoId = () => novo.curvas.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  let removido: P2[];

  if (f.tipo === "seg") {
    const ts = [0, 1, ...cortes.filter((x) => x > 1e-6 && x < 1 - 1e-6)].sort((a, b) => a - b);
    let i = ts.findIndex((x, k) => k < ts.length - 1 && t >= x && t <= ts[k + 1]);
    if (i < 0) i = t < 0 ? 0 : ts.length - 2;
    const em = (s: number): P2 => [f.a[0] + s * (f.b[0] - f.a[0]), f.a[1] + s * (f.b[1] - f.a[1])];
    removido = [em(ts[i]), em(ts[i + 1])];
    semCurva();
    const linha = c as Extract<CurvaEsboco, { tipo: "linha" }>;
    if (ts[i] > 1e-6) novo.curvas.push({ id: novoId(), tipo: "linha", a: linha.a, b: pontoEm(em(ts[i])), restricao: linha.restricao });
    if (ts[i + 1] < 1 - 1e-6) novo.curvas.push({ id: novoId(), tipo: "linha", a: pontoEm(em(ts[i + 1])), b: linha.b, restricao: linha.restricao });
  } else {
    const inteiro = f.sweep >= DOIS_PI - TOL;
    const internos = [...new Set(cortes.filter((x) => (inteiro ? true : x > 1e-6 && x < f.sweep - 1e-6)).map((x) => +x.toFixed(9)))];
    const centro = c.tipo === "circulo" ? c.centro : (c as Extract<CurvaEsboco, { tipo: "arco" }>).centro;
    if (inteiro && internos.length < 2) {
      // Círculo com menos de dois cruzamentos: sai inteiro.
      removido = amostrarArco(f.c, f.r, 0, DOIS_PI, 64);
      semCurva();
    } else if (inteiro) {
      const ts = internos.sort((a, b) => a - b);
      // Faixa (anti-horária) entre dois cortes vizinhos que contém o clique.
      let i = ts.length - 1;
      for (let k = 0; k < ts.length - 1; k++) if (t >= ts[k] && t <= ts[k + 1]) i = k;
      const de = ts[i], ate = i === ts.length - 1 ? ts[0] + DOIS_PI : ts[i + 1];
      removido = amostrarArco(f.c, f.r, f.inicio + de, ate - de);
      semCurva();
      // Fica o resto: de "ate" até "de", no sentido anti-horário.
      novo.curvas.push({
        id: novoId(), tipo: "arco", centro,
        a: pontoEm(noCirculo(f.c, f.r, f.inicio + ate)),
        b: pontoEm(noCirculo(f.c, f.r, f.inicio + de)),
      });
    } else {
      const arco = c as Extract<CurvaEsboco, { tipo: "arco" }>;
      const ts = [0, f.sweep, ...internos].sort((a, b) => a - b);
      let i = ts.findIndex((x, k) => k < ts.length - 1 && t >= x && t <= ts[k + 1]);
      if (i < 0) i = 0;
      removido = amostrarArco(f.c, f.r, f.inicio + ts[i], ts[i + 1] - ts[i]);
      semCurva();
      if (ts[i] > 1e-6)
        novo.curvas.push({ id: novoId(), tipo: "arco", centro, a: arco.a, b: pontoEm(noCirculo(f.c, f.r, f.inicio + ts[i])) });
      if (ts[i + 1] < f.sweep - 1e-6)
        novo.curvas.push({ id: novoId(), tipo: "arco", centro, a: pontoEm(noCirculo(f.c, f.r, f.inicio + ts[i + 1])), b: arco.b });
    }
  }
  // Limpeza: cotas da curva tirada e pontos que ninguém usa (a origem fica).
  const usados = new Set(novo.curvas.flatMap(idsDaCurva)); // inclui pontos internos da spline
  novo.pontos = novo.pontos.filter((p) => p.id === 0 || usados.has(p.id));
  limparReferencias(novo);
  return { novo, removido };
}
