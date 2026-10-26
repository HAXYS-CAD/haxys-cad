// Resolvedor de restrições do esboço.
// Cada restrição vira uma ou mais "equações que devem dar zero". O resolvedor mexe
// nos pontos (e nos raios dos círculos) o mínimo possível até todas darem zero,
// pelo método de Levenberg-Marquardt. O ponto da origem (id 0) e os pontos com
// "Fixo" não se mexem. Se não achar solução, não muda nada e devolve false.
import { beziersDaSpline, type CotaEsboco, type CurvaEsboco, type DadosEsboco } from "./esboco";

// Pontos de uma curva (igual a idsDaCurva de esboco.ts; repetido aqui para não
// criar importação circular).
const idsCurva = (c: CurvaEsboco): number[] =>
  c.tipo === "linha" ? [c.a, c.b] : c.tipo === "circulo" ? [c.centro] : c.tipo === "arco" ? [c.centro, c.a, c.b] : c.tipo === "elipse" ? [c.centro, c.a] : [c.a, ...c.internos, c.b];

export type Restricao =
  | { id: number; tipo: "coincidente"; ponto: number; curva: number } // ponto em cima da curva
  | { id: number; tipo: "tangente"; c1: number; c2: number; interna?: boolean }
  | { id: number; tipo: "igual"; c1: number; c2: number }
  | { id: number; tipo: "paralelo"; c1: number; c2: number }
  | { id: number; tipo: "perpendicular"; c1: number; c2: number }
  | { id: number; tipo: "colinear"; c1: number; c2: number }
  | { id: number; tipo: "concentrico"; c1: number; c2: number }
  | { id: number; tipo: "fixo"; ponto: number }
  | { id: number; tipo: "pontoMedio"; ponto: number; curva: number }
  | { id: number; tipo: "simetria"; p1: number; p2: number; curva: number }
  // Curvatura (G2): spline (c1) e linha/arco (c2) com uma ponta em comum: mesma
  // direção e mesma curvatura nessa ponta.
  | { id: number; tipo: "curvatura"; c1: number; c2: number }
  // Polígono: as linhas de um laço fechado ficam iguais e com os cantos no mesmo
  // círculo (polígono regular).
  | { id: number; tipo: "poligono"; curvas: number[] };

export const TIPOS_RESTRICAO = [
  "coincidente", "tangente", "igual", "paralelo", "perpendicular", "colinear",
  "concentrico", "fixo", "pontoMedio", "simetria", "curvatura", "poligono",
] as const;

type Vec = [number, number];

// ---- Montagem das variáveis ----

interface Sistema {
  x: number[];
  escala: number[]; // quanto cada variável "pode" se mexer (preferidos mexem mais)
  ponto(id: number, x: number[]): Vec;
  raio(curva: number, x: number[]): number;
  gravar(x: number[]): void;
  indice(ponto: number): number | undefined; // posição do u do ponto em x (v vem logo depois)
  indiceRaio(curva: number): number | undefined;
}

function montarSistema(e: DadosEsboco, preferidos?: Set<number>, pesoOutros = 0.05): Sistema {
  const fixos = new Set<number>([0]);
  for (const r of e.restricoes ?? []) if (r.tipo === "fixo") fixos.add(r.ponto);
  const x: number[] = [];
  const escala: number[] = [];
  // Sem preferência, tudo pode se mexer igual; com preferência, o resto mexe 20 vezes
  // menos (ou nada, com pesoOutros = 0).
  const peso = (id: number) => (!preferidos || preferidos.has(id) ? 1 : pesoOutros);
  const indicePonto = new Map<number, number>();
  for (const p of e.pontos) {
    if (fixos.has(p.id)) continue;
    indicePonto.set(p.id, x.length);
    x.push(p.u, p.v);
    escala.push(peso(p.id), peso(p.id));
  }
  const indiceRaio = new Map<number, number>();
  for (const c of e.curvas) {
    if (c.tipo !== "circulo") continue;
    indiceRaio.set(c.id, x.length);
    x.push(c.raio);
    escala.push(!preferidos || preferidos.has(c.centro) ? 1 : pesoOutros);
  }
  const constantes = new Map(e.pontos.map((p) => [p.id, [p.u, p.v] as Vec]));
  return {
    x,
    escala,
    ponto(id, xs) {
      const i = indicePonto.get(id);
      return i === undefined ? constantes.get(id)! : [xs[i], xs[i + 1]];
    },
    raio(curva, xs) {
      return xs[indiceRaio.get(curva)!];
    },
    indice: (id) => indicePonto.get(id),
    indiceRaio: (id) => indiceRaio.get(id),
    gravar(xs) {
      for (const p of e.pontos) {
        const i = indicePonto.get(p.id);
        if (i !== undefined) (p.u = xs[i]), (p.v = xs[i + 1]);
      }
      for (const c of e.curvas) if (c.tipo === "circulo") c.raio = xs[indiceRaio.get(c.id)!];
    },
  };
}

// ---- Equações ----

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
const len = (a: Vec) => Math.hypot(a[0], a[1]);
const cruz = (a: Vec, b: Vec) => a[0] * b[1] - a[1] * b[0];
const ponto2 = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1];

type Equacao = (x: number[]) => number;

function equacoes(e: DadosEsboco, s: Sistema): Equacao[] {
  const curva = (id: number) => e.curvas.find((c) => c.id === id);
  const eqs: Equacao[] = [];
  // Centro e raio de círculo/arco (arco: raio = distância centro→a).
  const circ = (c: CurvaEsboco, x: number[]): { c: Vec; r: number } | null => {
    if (c.tipo === "circulo") return { c: s.ponto(c.centro, x), r: s.raio(c.id, x) };
    if (c.tipo === "arco") {
      const centro = s.ponto(c.centro, x);
      return { c: centro, r: len(sub(s.ponto(c.a, x), centro)) };
    }
    return null;
  };
  const reta = (c: CurvaEsboco, x: number[]): { a: Vec; d: Vec } | null =>
    c.tipo === "linha" ? { a: s.ponto(c.a, x), d: sub(s.ponto(c.b, x), s.ponto(c.a, x)) } : null;

  for (const c of e.curvas) {
    if (c.tipo === "linha" && c.restricao === "h") eqs.push((x) => s.ponto(c.a, x)[1] - s.ponto(c.b, x)[1]);
    if (c.tipo === "linha" && c.restricao === "v") eqs.push((x) => s.ponto(c.a, x)[0] - s.ponto(c.b, x)[0]);
    // As duas pontas do arco ficam no mesmo raio.
    if (c.tipo === "arco")
      eqs.push((x) => len(sub(s.ponto(c.b, x), s.ponto(c.centro, x))) - len(sub(s.ponto(c.a, x), s.ponto(c.centro, x))));
  }

  for (const r of e.restricoes ?? []) {
    switch (r.tipo) {
      case "fixo":
        break; // já tratado: o ponto não é variável
      case "coincidente": {
        const c = curva(r.curva);
        if (!c) break;
        if (c.tipo === "linha")
          eqs.push((x) => {
            const l = reta(c, x)!;
            return cruz(sub(s.ponto(r.ponto, x), l.a), l.d) / (len(l.d) || 1);
          });
        else eqs.push((x) => { const k = circ(c, x)!; return len(sub(s.ponto(r.ponto, x), k.c)) - k.r; });
        break;
      }
      case "pontoMedio": {
        const c = curva(r.curva);
        if (!c || c.tipo !== "linha") break;
        eqs.push((x) => s.ponto(r.ponto, x)[0] - (s.ponto(c.a, x)[0] + s.ponto(c.b, x)[0]) / 2);
        eqs.push((x) => s.ponto(r.ponto, x)[1] - (s.ponto(c.a, x)[1] + s.ponto(c.b, x)[1]) / 2);
        break;
      }
      case "paralelo":
      case "perpendicular":
      case "colinear": {
        const c1 = curva(r.c1), c2 = curva(r.c2);
        if (!c1 || !c2 || c1.tipo !== "linha" || c2.tipo !== "linha") break;
        eqs.push((x) => {
          const d1 = reta(c1, x)!.d, d2 = reta(c2, x)!.d;
          const n = len(d1) * len(d2) || 1;
          return (r.tipo === "perpendicular" ? ponto2(d1, d2) : cruz(d1, d2)) / n;
        });
        if (r.tipo === "colinear")
          eqs.push((x) => { const l1 = reta(c1, x)!; return cruz(sub(s.ponto(c2.a, x), l1.a), l1.d) / (len(l1.d) || 1); });
        break;
      }
      case "igual": {
        const c1 = curva(r.c1), c2 = curva(r.c2);
        if (!c1 || !c2) break;
        if (c1.tipo === "linha" && c2.tipo === "linha") eqs.push((x) => len(reta(c1, x)!.d) - len(reta(c2, x)!.d));
        else eqs.push((x) => (circ(c1, x)?.r ?? 0) - (circ(c2, x)?.r ?? 0));
        break;
      }
      case "concentrico": {
        const c1 = curva(r.c1), c2 = curva(r.c2);
        if (!c1 || !c2) break;
        eqs.push((x) => circ(c1, x)!.c[0] - circ(c2, x)!.c[0]);
        eqs.push((x) => circ(c1, x)!.c[1] - circ(c2, x)!.c[1]);
        break;
      }
      case "tangente": {
        const c1 = curva(r.c1), c2 = curva(r.c2);
        if (!c1 || !c2) break;
        const linha = c1.tipo === "linha" ? c1 : c2.tipo === "linha" ? c2 : null;
        const redonda = linha === c1 ? c2 : c1;
        if (linha && redonda.tipo !== "linha") {
          // Distância do centro até a reta = raio (ao quadrado, para ficar suave).
          eqs.push((x) => {
            const l = reta(linha, x)!, k = circ(redonda, x)!;
            const d = cruz(sub(k.c, l.a), l.d) / (len(l.d) || 1);
            return d * d - k.r * k.r;
          });
        } else if (!linha) {
          eqs.push((x) => {
            const k1 = circ(c1, x)!, k2 = circ(c2, x)!;
            const d = len(sub(k1.c, k2.c));
            return r.interna ? d - Math.abs(k1.r - k2.r) : d - (k1.r + k2.r);
          });
        }
        break;
      }
      case "curvatura": {
        const sp = curva(r.c1), outra = curva(r.c2);
        if (!sp || !outra || sp.tipo !== "spline" || (outra.tipo !== "linha" && outra.tipo !== "arco")) break;
        const comum = [sp.a, sp.b].find((p) => p === outra.a || p === outra.b);
        if (comum === undefined) break;
        // Derivadas da spline na ponta comum (trecho de Bézier da ponta).
        const derivadas = (x: number[]): [Vec, Vec] => {
          let pts = [sp.a, ...sp.internos, sp.b].map((id) => s.ponto(id, x));
          if (comum === sp.b && sp.a !== sp.b) pts = pts.reverse();
          const [b0, b1, b2] = beziersDaSpline(pts, false, sp.controle)[0];
          return [
            [3 * (b1[0] - b0[0]), 3 * (b1[1] - b0[1])],
            [6 * (b2[0] - 2 * b1[0] + b0[0]), 6 * (b2[1] - 2 * b1[1] + b0[1])],
          ];
        };
        // Direção da outra curva na ponta comum.
        const direcao = (x: number[]): Vec => {
          const p = s.ponto(comum, x);
          if (outra.tipo === "linha") return sub(s.ponto(outra.a === comum ? outra.b : outra.a, x), p);
          const r0 = sub(p, s.ponto(outra.centro, x));
          return [-r0[1], r0[0]];
        };
        eqs.push((x) => {
          const [d1] = derivadas(x), d = direcao(x);
          return cruz(d1, d) / (len(d1) * len(d) || 1);
        });
        eqs.push((x) => {
          const [d1, d2] = derivadas(x);
          const k = cruz(d1, d2) / (len(d1) ** 3 || 1);
          if (outra.tipo === "linha") return k;
          // O arco curva para o centro: a curvatura da spline (com sinal, no lado
          // esquerdo da direção dela) tem que ser a do arco medida no mesmo lado.
          const p = s.ponto(comum, x), paraCentro = sub(s.ponto(outra.centro, x), p);
          const r2 = ponto2(paraCentro, paraCentro) || 1;
          const esquerda: Vec = [-d1[1] / (len(d1) || 1), d1[0] / (len(d1) || 1)];
          return k - ponto2(esquerda, paraCentro) / r2;
        });
        break;
      }
      case "poligono": {
        const linhas = r.curvas.map(curva).filter((c): c is Extract<CurvaEsboco, { tipo: "linha" }> => c?.tipo === "linha");
        if (linhas.length !== r.curvas.length || linhas.length < 3) break;
        const cantos = [...new Set(linhas.flatMap((l) => [l.a, l.b]))];
        const centro = (x: number[]): Vec => {
          const ps = cantos.map((id) => s.ponto(id, x));
          return [ps.reduce((t, p) => t + p[0], 0) / ps.length, ps.reduce((t, p) => t + p[1], 0) / ps.length];
        };
        for (const l of linhas.slice(1)) eqs.push((x) => len(reta(l, x)!.d) - len(reta(linhas[0], x)!.d));
        for (const p of cantos.slice(1))
          eqs.push((x) => {
            const c = centro(x);
            return len(sub(s.ponto(p, x), c)) - len(sub(s.ponto(cantos[0], x), c));
          });
        break;
      }
      case "simetria": {
        const c = curva(r.curva);
        if (!c || c.tipo !== "linha") break;
        eqs.push((x) => {
          const l = reta(c, x)!;
          const p1 = s.ponto(r.p1, x), p2 = s.ponto(r.p2, x);
          const m: Vec = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
          return cruz(sub(m, l.a), l.d) / (len(l.d) || 1);
        });
        eqs.push((x) => { const l = reta(c, x)!; return ponto2(sub(s.ponto(r.p2, x), s.ponto(r.p1, x)), l.d) / (len(l.d) || 1); });
        break;
      }
    }
  }

  // Cotas mandam: a medida atual menos o valor pedido tem que dar zero.
  for (const k of e.cotas) {
    if (k.valor === undefined) continue;
    const alvo = k.valor;
    if (k.tipo === "angulo") {
      // Diferença de ângulo "dando a volta" certo (−180° a 180°).
      eqs.push((x) => {
        const m = medidaCota(e, k, (id) => s.ponto(id, x), (c) => s.raio(c, x));
        const d = ((m - alvo) * Math.PI) / 180;
        return Math.atan2(Math.sin(d), Math.cos(d));
      });
    } else eqs.push((x) => medidaCota(e, k, (id) => s.ponto(id, x), (c) => s.raio(c, x)) - alvo);
  }
  return eqs;
}

// ---- Totalmente definido ----
// Um ponto está "definido" quando nenhuma mudança pequena dele mantém todas as
// equações em zero. Conta: acha as direções livres (núcleo do jacobiano) e vê se
// alguma mexe no ponto. Curva definida = todos os seus pontos (e o raio) definidos.

export interface Definicao {
  pontos: Set<number>;
  curvas: Set<number>;
  tudo: boolean; // o esboço inteiro está definido
  graus: number; // graus de liberdade que sobram (0 = nada mais mexe)
}

export function analisarDefinicao(e: DadosEsboco): Definicao {
  const s = montarSistema(e);
  const eqs = equacoes(e, s);
  const n = s.x.length;
  const livres = new Array(n).fill(false);
  let graus = n;
  if (n) {
    // Jacobiano (sem escala) por diferença central: sem o ruído da diferença simples.
    const J = eqs.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-5 * Math.max(1, Math.abs(s.x[j]));
      const mais = [...s.x], menos = [...s.x];
      mais[j] += h;
      menos[j] -= h;
      eqs.forEach((f, i) => (J[i][j] = (f(mais) - f(menos)) / (2 * h)));
    }
    // Forma escalonada reduzida para achar as colunas sem pivô (direções livres).
    const M = J.map((l) => [...l]);
    const pivos: number[] = [];
    let linha = 0;
    for (let c = 0; c < n && linha < M.length; c++) {
      let p = linha;
      for (let i = linha + 1; i < M.length; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
      if (Math.abs(M[p][c]) < 1e-5) continue;
      [M[linha], M[p]] = [M[p], M[linha]];
      const piv = M[linha][c];
      for (let j = c; j < n; j++) M[linha][j] /= piv;
      for (let i = 0; i < M.length; i++) {
        if (i === linha || !M[i][c]) continue;
        const f = M[i][c];
        for (let j = c; j < n; j++) M[i][j] -= f * M[linha][j];
      }
      pivos[linha] = c;
      linha++;
    }
    const ehPivo = new Set(pivos);
    graus = n - pivos.length;
    for (let f = 0; f < n; f++) {
      if (ehPivo.has(f)) continue;
      // Vetor do núcleo para a coluna livre f: mexe em f e nas colunas-pivô ligadas.
      livres[f] = true;
      pivos.forEach((c, i) => {
        if (Math.abs(M[i][f]) > 1e-5) livres[c] = true;
      });
    }
  }
  const pontos = new Set<number>();
  for (const p of e.pontos) {
    const i = s.indice(p.id);
    if (i === undefined || (!livres[i] && !livres[i + 1])) pontos.add(p.id);
  }
  const curvas = new Set<number>();
  for (const c of e.curvas) {
    const pts = idsCurva(c);
    const raioLivre = c.tipo === "circulo" && livres[s.indiceRaio(c.id)!];
    if (pts.every((p) => pontos.has(p)) && !raioLivre) curvas.add(c.id);
  }
  const usados = new Set(e.curvas.flatMap(idsCurva));
  const tudo = e.curvas.length > 0 && e.curvas.every((c) => curvas.has(c.id)) && [...usados].every((p) => pontos.has(p));
  return { pontos, curvas, tudo, graus };
}

// Medida de uma cota com os pontos dados (assim o resolvedor e a tela usam a mesma conta).
// Linha: comprimento; círculo: diâmetro; arco: raio; ângulo em graus; distâncias em mm.
export function medidaCota(
  e: DadosEsboco,
  k: CotaEsboco,
  ponto: (id: number) => Vec,
  raio: (curva: number) => number,
): number {
  const curva = (id: number) => e.curvas.find((c) => c.id === id);
  const dirLinha = (c: CurvaEsboco | undefined): { a: Vec; d: Vec } | null =>
    c && c.tipo === "linha" ? { a: ponto(c.a), d: sub(ponto(c.b), ponto(c.a)) } : null;
  switch (k.tipo) {
    case "angulo": {
      const l1 = dirLinha(curva(k.c1)), l2 = dirLinha(curva(k.c2));
      if (!l1 || !l2) return 0;
      const graus = ((Math.atan2(cruz(l1.d, l2.d), ponto2(l1.d, l2.d)) * 180) / Math.PI) * k.sinal;
      return k.suplemento ? 180 - graus : graus;
    }
    case "pontos": {
      const d = sub(ponto(k.p2), ponto(k.p1));
      return k.eixo === "h" ? d[0] * k.sinal : k.eixo === "v" ? d[1] * k.sinal : len(d);
    }
    case "pontoLinha": {
      const l = dirLinha(curva(k.curva));
      if (!l) return 0;
      return (cruz(sub(ponto(k.ponto), l.a), l.d) / (len(l.d) || 1)) * k.sinal;
    }
    default: {
      const c = curva(k.curva);
      if (!c) return 0;
      if (c.tipo === "linha") return len(sub(ponto(c.b), ponto(c.a)));
      if (c.tipo === "circulo") return 2 * raio(c.id);
      if (c.tipo === "spline" || c.tipo === "elipse") return 0; // sem cota de tamanho (ainda)
      return len(sub(ponto(c.a), ponto(c.centro)));
    }
  }
}

// ---- Levenberg-Marquardt ----

function resolverLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((linha, i) => [...linha, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) {
      const f = M[i][c] / M[c][c];
      if (f) for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

const norma2 = (v: number[]) => v.reduce((s, x) => s + x * x, 0);

// Mexe no esboço para cumprir as restrições. Devolve false (sem mudar nada) se não der.
// "preferidos" = ids de pontos que devem se mexer primeiro (ex.: a 2ª coisa clicada).
export function resolver(e: DadosEsboco, preferidos?: Set<number>): boolean {
  // Com preferidos: primeiro tenta mexer SÓ neles (o resto fica parado, como o
  // Fusion faz ao mudar uma cota); se não der, deixa o resto mexer um pouco.
  if (preferidos?.size && resolverCom(e, preferidos, 0)) return true;
  return resolverCom(e, preferidos, 0.05);
}

function resolverCom(e: DadosEsboco, preferidos: Set<number> | undefined, pesoOutros: number): boolean {
  const s = montarSistema(e, preferidos, pesoOutros);
  const eqs = equacoes(e, s);
  if (eqs.length === 0 || s.x.length === 0) return eqs.every((f) => Math.abs(f(s.x)) < 1e-6);
  let x = [...s.x];
  const residuo = (xs: number[]) => eqs.map((f) => f(xs));
  let r = residuo(x);
  let erro = norma2(r);
  let lambda = 1e-3;
  const n = x.length;
  for (let it = 0; it < 200 && erro > 1e-18; it++) {
    // Jacobiano por diferença finita.
    const J = eqs.map(() => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(x[j]));
      const xh = [...x];
      xh[j] += h;
      const rh = residuo(xh);
      // Coluna já multiplicada pela escala: o passo é calculado em "unidades de escala".
      for (let i = 0; i < eqs.length; i++) J[i][j] = ((rh[i] - r[i]) / h) * s.escala[j];
    }
    const JtJ = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => J.reduce((soma, linha) => soma + linha[a] * linha[b], 0)),
    );
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((soma, linha, i) => soma + linha[a] * r[i], 0));
    let melhorou = false;
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      // Amortecimento: lambda grande = passos curtos (mexe pouco nas coisas).
      const A = JtJ.map((linha, a) => linha.map((v, b) => (a === b ? v + lambda : v)));
      const dx = resolverLinear(A, Jtr.map((v) => -v));
      if (dx) {
        const xn = x.map((v, i) => v + dx[i] * s.escala[i]);
        const rn = residuo(xn);
        const en = norma2(rn);
        if (Number.isFinite(en) && en < erro) {
          x = xn;
          r = rn;
          erro = en;
          lambda = Math.max(lambda / 10, 1e-12);
          melhorou = true;
          break;
        }
      }
      lambda *= 10;
    }
    if (!melhorou) break;
  }
  if (Math.sqrt(erro) > 1e-6) return false;
  s.gravar(x);
  return true;
}
