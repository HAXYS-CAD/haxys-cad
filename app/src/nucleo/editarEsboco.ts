// Ferramentas que copiam curvas do esboço: Deslocamento (offset), Espelhar e
// Padrão retangular/circular. Todas mexem direto nos dados do esboço.
// Diferenças do Fusion, por enquanto:
// - Deslocamento: o lado vem do sinal da distância (positivo = para fora numa
//   cadeia fechada, à esquerda numa aberta), não do mouse; não fica ligado ao
//   original (sem a cota de deslocamento);
// - Espelhar: liga os pontos com restrição de simetria (como o Fusion);
// - Padrões: as cópias não ficam ligadas (sem restrição de padrão), direções
//   só nos eixos do esboço.
import { analisarDefinicao, medidaCota, resolver } from "./restricoes";
import { cortesDaCurva, cruzamentosDaSemirreta, geoArco, idsDaCurva, limparReferencias, type CurvaEsboco, type DadosEsboco, type P2 } from "./esboco";

const novoId = (lista: { id: number }[]) => lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pos(d: DadosEsboco, id: number): P2 {
  const p = d.pontos.find((q) => q.id === id);
  if (!p) throw new Error("Ponto do esboço não encontrado");
  return [p.u, p.v];
}
function novoPonto(d: DadosEsboco, q: P2): number {
  const id = novoId(d.pontos);
  d.pontos.push({ id, u: q[0], v: q[1] });
  return id;
}

// ---- Cadeia: curvas ligadas ponta com ponta, em ordem e com sentido ----

type Borda = Exclude<CurvaEsboco, { tipo: "circulo" | "elipse" }>;
interface Item {
  c: Borda;
  inverso: boolean; // true = percorre de b para a
}
const inicioDe = (it: Item) => (it.inverso ? it.c.b : it.c.a);
const fimDe = (it: Item) => (it.inverso ? it.c.a : it.c.b);

export function cadeiaOrdenada(d: DadosEsboco, curvaId: number): { itens: Item[]; fechada: boolean } {
  const bordas = d.curvas.filter((c) => c.tipo !== "circulo" && c.tipo !== "elipse") as Borda[];
  const inicial = bordas.find((c) => c.id === curvaId);
  if (!inicial) return { itens: [], fechada: false };
  const vizinhas = (ponto: number, menos: Borda) => bordas.filter((c) => c !== menos && (c.a === ponto || c.b === ponto));
  const itens: Item[] = [{ c: inicial, inverso: false }];
  // Para frente, a partir da ponta "b".
  let p = inicial.b;
  let atual: Borda = inicial;
  let fechada = false;
  while (true) {
    const v = vizinhas(p, atual);
    if (v.length !== 1) break;
    if (v[0] === inicial) {
      fechada = true;
      break;
    }
    if (itens.some((it) => it.c === v[0])) break;
    atual = v[0];
    const inv = atual.b === p;
    itens.push({ c: atual, inverso: inv });
    p = inv ? atual.a : atual.b;
  }
  if (!fechada) {
    // Para trás, a partir da ponta "a".
    p = inicial.a;
    atual = inicial;
    while (true) {
      const v = vizinhas(p, atual);
      if (v.length !== 1 || itens.some((it) => it.c === v[0])) break;
      atual = v[0];
      const inv = atual.a === p; // chega pela ponta "a": percorre de b para a
      itens.unshift({ c: atual, inverso: inv });
      p = inv ? atual.b : atual.a;
    }
  }
  return { itens, fechada };
}

// ---- Deslocamento ----

type Suporte = { tipo: "reta"; p: P2; t: P2 } | { tipo: "circ"; c: P2; r: number };

function intersecoes(a: Suporte, b: Suporte): P2[] {
  if (a.tipo === "reta" && b.tipo === "reta") {
    const den = a.t[0] * b.t[1] - a.t[1] * b.t[0];
    if (Math.abs(den) < 1e-12) return [];
    const s = ((b.p[0] - a.p[0]) * b.t[1] - (b.p[1] - a.p[1]) * b.t[0]) / den;
    return [[a.p[0] + a.t[0] * s, a.p[1] + a.t[1] * s]];
  }
  if (a.tipo === "circ" && b.tipo === "reta") return intersecoes(b, a);
  if (a.tipo === "reta" && b.tipo === "circ") {
    const f: P2 = [a.p[0] - b.c[0], a.p[1] - b.c[1]];
    const B = f[0] * a.t[0] + f[1] * a.t[1];
    const C = f[0] ** 2 + f[1] ** 2 - b.r ** 2;
    const disc = B * B - C;
    if (disc < 0) return [];
    const r = Math.sqrt(disc);
    return [-B - r, -B + r].map((s) => [a.p[0] + a.t[0] * s, a.p[1] + a.t[1] * s] as P2);
  }
  const A = a as { c: P2; r: number }, Bc = b as { c: P2; r: number };
  const D = dist(A.c, Bc.c);
  if (D < 1e-12 || D > A.r + Bc.r || D < Math.abs(A.r - Bc.r)) return [];
  const x = (D * D + A.r * A.r - Bc.r * Bc.r) / (2 * D);
  const h = Math.sqrt(Math.max(A.r * A.r - x * x, 0));
  const u: P2 = [(Bc.c[0] - A.c[0]) / D, (Bc.c[1] - A.c[1]) / D];
  const m: P2 = [A.c[0] + u[0] * x, A.c[1] + u[1] * x];
  return [
    [m[0] - u[1] * h, m[1] + u[0] * h],
    [m[0] + u[1] * h, m[1] - u[0] * h],
  ];
}

// distancia > 0: para fora (cadeia fechada ou círculo) ou à esquerda (cadeia aberta).
// Devolve os ids das curvas novas.
export function deslocar(d: DadosEsboco, curvaId: number, distancia: number): number[] {
  if (!distancia) throw new Error("A distância não pode ser zero");
  const alvo = d.curvas.find((c) => c.id === curvaId);
  if (!alvo) throw new Error("Curva não encontrada");
  if (alvo.tipo === "elipse") throw new Error("Por enquanto o deslocamento não funciona com elipse");
  if (alvo.tipo === "circulo") {
    const r = alvo.raio + distancia;
    if (r <= 0) throw new Error("O círculo ficaria com raio zero ou negativo");
    const id = novoId(d.curvas);
    d.curvas.push({ id, tipo: "circulo", centro: alvo.centro, raio: r });
    return [id];
  }
  const { itens, fechada } = cadeiaOrdenada(d, curvaId);
  // Sentido da cadeia fechada (área com sinal): anti-horária = a esquerda é o lado de dentro.
  let o = distancia;
  if (fechada) {
    let area = 0;
    for (const it of itens) {
      const s = pos(d, inicioDe(it)), e = pos(d, fimDe(it));
      area += s[0] * e[1] - e[0] * s[1];
      if (it.c.tipo === "arco") {
        // O arco aumenta a área do lado de fora da corda (anti-horário = à direita da corda).
        const g = geoArco(d, it.c);
        const seg = (g.raio * g.raio * (g.sweep - Math.sin(g.sweep))) / 2;
        area += 2 * (it.inverso ? -seg : seg);
      }
    }
    o = area > 0 ? -distancia : distancia;
  }
  // Cada item deslocado à esquerda (do sentido de percurso) por "o".
  if (itens.some((it) => it.c.tipo === "spline")) throw new Error("Por enquanto o deslocamento não funciona com spline");
  const desl = itens.map((it) => {
    const s = pos(d, inicioDe(it)), e = pos(d, fimDe(it));
    if (it.c.tipo === "linha") {
      const L = dist(s, e);
      const t: P2 = [(e[0] - s[0]) / L, (e[1] - s[1]) / L];
      const n: P2 = [-t[1], t[0]];
      const S: P2 = [s[0] + n[0] * o, s[1] + n[1] * o], E: P2 = [e[0] + n[0] * o, e[1] + n[1] * o];
      return { it, S, E, sup: { tipo: "reta", p: S, t } as Suporte, juntaOriginal: [s, e] as [P2, P2] };
    }
    const arco = it.c as Extract<CurvaEsboco, { tipo: "arco" }>;
    const c = pos(d, arco.centro);
    const r0 = dist(c, s);
    // Anti-horário (não invertido): a esquerda aponta para o centro.
    const r = it.inverso ? r0 + o : r0 - o;
    if (r <= 0) throw new Error("Um arco ficaria com raio zero ou negativo");
    const em = (q: P2): P2 => {
      const k = r / dist(c, q);
      return [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k];
    };
    return { it, S: em(s), E: em(e), sup: { tipo: "circ", c, r } as Suporte, juntaOriginal: [s, e] as [P2, P2] };
  });
  // Juntas: onde um pedaço deslocado termina e o próximo começa.
  const n = desl.length;
  const juntas: (number | null)[] = new Array(n).fill(null); // ponto no começo de cada item
  const pontoFim: number[] = new Array(n);
  const extras: [number, number][] = []; // linhas de ligação quando não há encontro
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    if (j === n && !fechada) break;
    const A = desl[i], B = desl[j % n];
    let q: P2;
    let ligar = false;
    if (dist(A.E, B.S) < 1e-6) q = A.E;
    else {
      const opcoes = intersecoes(A.sup, B.sup);
      const ref = A.juntaOriginal[1];
      if (opcoes.length) q = opcoes.reduce((m, x) => (dist(x, ref) < dist(m, ref) ? x : m));
      else (q = A.E), (ligar = true);
    }
    const id = novoPonto(d, q);
    pontoFim[i] = id;
    if (ligar) {
      const id2 = novoPonto(d, B.S);
      extras.push([id, id2]);
      juntas[j % n] = id2;
    } else juntas[j % n] = id;
  }
  if (!fechada) {
    juntas[0] = novoPonto(d, desl[0].S);
    pontoFim[n - 1] = novoPonto(d, desl[n - 1].E);
  }
  const criadas: number[] = [];
  desl.forEach((x, i) => {
    const s = juntas[i]!, e = pontoFim[i];
    const id = novoId(d.curvas);
    if (x.it.c.tipo === "linha") d.curvas.push({ id, tipo: "linha", a: s, b: e });
    else {
      // Arco guardado sempre anti-horário de "a" para "b".
      const [a, b] = x.it.inverso ? [e, s] : [s, e];
      d.curvas.push({ id, tipo: "arco", centro: (x.it.c as Extract<CurvaEsboco, { tipo: "arco" }>).centro, a, b });
    }
    criadas.push(id);
  });
  for (const [a, b] of extras) {
    const id = novoId(d.curvas);
    d.curvas.push({ id, tipo: "linha", a, b });
    criadas.push(id);
  }
  return criadas;
}

// ---- Copiar curvas com uma transformação dos pontos ----

function copiarCurvas(d: DadosEsboco, ids: number[], mover: (q: P2) => P2, espelho: boolean, fica?: (id: number) => boolean) {
  const mapa = new Map<number, number>();
  const ponto = (id: number) => {
    if (fica?.(id)) return id;
    let n = mapa.get(id);
    if (n === undefined) mapa.set(id, (n = novoPonto(d, mover(pos(d, id)))));
    return n;
  };
  const criadas: number[] = [];
  for (const id of ids) {
    const c = d.curvas.find((x) => x.id === id);
    if (!c) continue;
    const nid = novoId(d.curvas);
    if (c.tipo === "linha") d.curvas.push({ id: nid, tipo: "linha", a: ponto(c.a), b: ponto(c.b) });
    else if (c.tipo === "circulo") d.curvas.push({ id: nid, tipo: "circulo", centro: ponto(c.centro), raio: c.raio });
    else if (c.tipo === "elipse") d.curvas.push({ id: nid, tipo: "elipse", centro: ponto(c.centro), a: ponto(c.a), menor: c.menor });
    else if (c.tipo === "spline") {
      // A ordem dos pontos não importa para a forma (a conta é simétrica).
      const a = ponto(c.a);
      d.curvas.push({ id: nid, tipo: "spline", a, b: c.a === c.b ? a : ponto(c.b), internos: c.internos.map(ponto), controle: c.controle });
    } else {
      // Espelhar inverte o giro: troca as pontas para continuar anti-horário.
      const [a, b] = espelho ? [ponto(c.b), ponto(c.a)] : [ponto(c.a), ponto(c.b)];
      d.curvas.push({ id: nid, tipo: "arco", centro: ponto(c.centro), a, b });
    }
    criadas.push(nid);
  }
  return { criadas, mapa };
}

// ---- Espelhar ----

export function espelhar(d: DadosEsboco, ids: number[], eixoId: number): number[] {
  const eixo = d.curvas.find((c) => c.id === eixoId);
  if (!eixo || eixo.tipo !== "linha") throw new Error("A linha de espelho precisa ser uma linha reta");
  const A = pos(d, eixo.a), B = pos(d, eixo.b);
  const L = dist(A, B);
  const t: P2 = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const refletir = (q: P2): P2 => {
    const s = (q[0] - A[0]) * t[0] + (q[1] - A[1]) * t[1];
    const p: P2 = [A[0] + t[0] * s, A[1] + t[1] * s];
    return [2 * p[0] - q[0], 2 * p[1] - q[1]];
  };
  const naLinha = (id: number) => {
    const q = pos(d, id);
    return Math.abs((q[0] - A[0]) * t[1] - (q[1] - A[1]) * t[0]) < 1e-6;
  };
  const { criadas, mapa } = copiarCurvas(d, ids.filter((i) => i !== eixoId), refletir, true, naLinha);
  d.restricoes ??= [];
  for (const [p1, p2] of mapa) d.restricoes.push({ id: novoId(d.restricoes), tipo: "simetria", p1, p2, curva: eixoId });
  return criadas;
}

// ---- Padrões ----

export function padraoRetangular(d: DadosEsboco, ids: number[], nx: number, dx: number, ny: number, dy: number): number[] {
  if (!(nx >= 1 && ny >= 1) || nx * ny < 2) throw new Error("A quantidade precisa dar pelo menos 2 cópias no total");
  const criadas: number[] = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!i && !j) continue;
      criadas.push(...copiarCurvas(d, ids, (q) => [q[0] + i * dx, q[1] + j * dy], false).criadas);
    }
  return criadas;
}

// angulo total em graus; 360 = volta inteira (sem repetir a primeira).
export function padraoCircular(d: DadosEsboco, ids: number[], centroId: number, n: number, angulo: number): number[] {
  if (!(n >= 2)) throw new Error("A quantidade precisa ser pelo menos 2");
  const c = pos(d, centroId);
  const cheio = Math.abs(Math.abs(angulo) - 360) < 1e-9;
  const passo = ((angulo / (cheio ? n : n - 1)) * Math.PI) / 180;
  const criadas: number[] = [];
  for (let k = 1; k < n; k++) {
    const a = passo * k, co = Math.cos(a), si = Math.sin(a);
    const girar = (q: P2): P2 => [c[0] + (q[0] - c[0]) * co - (q[1] - c[1]) * si, c[1] + (q[0] - c[0]) * si + (q[1] - c[1]) * co];
    criadas.push(...copiarCurvas(d, ids, girar, false, (id) => id === centroId).criadas);
  }
  return criadas;
}

// ---- Arredondamento (filete) e Chanfro de canto ----
// Canto = ponto onde duas linhas se encontram (e nenhuma outra curva).
// As duas linhas encolhem até o começo do arco (ou do chanfro).
// Diferença do Fusion, por enquanto: só canto de duas linhas (não arco).

interface Canto {
  p: P2;
  l1: Extract<CurvaEsboco, { tipo: "linha" }>;
  l2: Extract<CurvaEsboco, { tipo: "linha" }>;
  u1: P2; // direção do canto para a outra ponta de l1
  u2: P2;
  len1: number;
  len2: number;
  angulo: number; // entre as duas linhas (rad)
}

function acharCanto(d: DadosEsboco, pontoId: number, primeira?: number): Canto {
  const usam = d.curvas.filter((c) => idsDaCurva(c).includes(pontoId));
  const linhas = usam.filter((c): c is Extract<CurvaEsboco, { tipo: "linha" }> => c.tipo === "linha");
  if (usam.length !== 2 || linhas.length !== 2) throw new Error("Escolha um canto onde só duas linhas se encontram");
  if (primeira !== undefined && linhas[1].id === primeira) linhas.reverse();
  const [l1, l2] = linhas;
  const p = pos(d, pontoId);
  const outra = (l: typeof l1) => pos(d, l.a === pontoId ? l.b : l.a);
  const v1 = outra(l1), v2 = outra(l2);
  const len1 = dist(p, v1), len2 = dist(p, v2);
  const u1: P2 = [(v1[0] - p[0]) / len1, (v1[1] - p[1]) / len1];
  const u2: P2 = [(v2[0] - p[0]) / len2, (v2[1] - p[1]) / len2];
  const angulo = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
  if (angulo < 1e-6 || angulo > Math.PI - 1e-6) throw new Error("As duas linhas estão alinhadas: não há canto");
  return { p, l1, l2, u1, u2, len1, len2, angulo };
}

// Troca, na linha, o ponto do canto por um ponto novo; tira o ponto do canto se ninguém usa.
function encurtar(d: DadosEsboco, c: Canto, pontoId: number, q1: P2, q2: P2): [number, number] {
  const n1 = novoPonto(d, q1), n2 = novoPonto(d, q2);
  for (const [l, n] of [[c.l1, n1], [c.l2, n2]] as const) {
    if (l.a === pontoId) l.a = n;
    else l.b = n;
  }
  if (pontoId !== 0 && !d.curvas.some((x) => idsDaCurva(x).includes(pontoId))) d.pontos = d.pontos.filter((p) => p.id !== pontoId);
  limparReferencias(d); // cotas/restrições que usavam o canto saem
  return [n1, n2];
}

export function arredondarCanto(d: DadosEsboco, pontoId: number, raio: number): number[] {
  if (!(raio > 0)) throw new Error("O raio deve ser maior que zero");
  const c = acharCanto(d, pontoId);
  const t = raio / Math.tan(c.angulo / 2); // do canto até onde o arco encosta
  if (t >= c.len1 - 1e-9 || t >= c.len2 - 1e-9) throw new Error("Raio grande demais para essas linhas");
  const T1: P2 = [c.p[0] + c.u1[0] * t, c.p[1] + c.u1[1] * t];
  const T2: P2 = [c.p[0] + c.u2[0] * t, c.p[1] + c.u2[1] * t];
  const b: P2 = [c.u1[0] + c.u2[0], c.u1[1] + c.u2[1]];
  const lb = Math.hypot(b[0], b[1]);
  const h = raio / Math.sin(c.angulo / 2); // do canto até o centro
  const C: P2 = [c.p[0] + (b[0] / lb) * h, c.p[1] + (b[1] / lb) * h];
  const [n1, n2] = encurtar(d, c, pontoId, T1, T2);
  const centro = novoPonto(d, C);
  // Arco curto, guardado anti-horário de "a" para "b".
  const giro = (T1[0] - C[0]) * (T2[1] - C[1]) - (T1[1] - C[1]) * (T2[0] - C[0]);
  const [a, bb] = giro > 0 ? [n1, n2] : [n2, n1];
  const id = novoId(d.curvas);
  d.curvas.push({ id, tipo: "arco", centro, a, b: bb });
  d.restricoes ??= [];
  d.restricoes.push({ id: novoId(d.restricoes), tipo: "tangente", c1: c.l1.id, c2: id });
  d.restricoes.push({ id: novoId(d.restricoes), tipo: "tangente", c1: c.l2.id, c2: id });
  // Cota do raio, como o Fusion põe no arredondamento.
  d.cotas.push({ id: novoId(d.cotas), curva: id, valor: raio });
  return [id];
}

// tipo "igual": d1 nas duas linhas; "duas": d1 na 1ª e d2 na 2ª;
// "angulo": d1 na 1ª e o chanfro faz "angulo" graus com ela.
export function chanfrarCanto(
  d: DadosEsboco,
  pontoId: number,
  o: { tipo: "igual" | "duas" | "angulo"; d1: number; d2?: number; angulo?: number; primeira?: number },
): number[] {
  const c = acharCanto(d, pontoId, o.primeira);
  let a = o.d1, b = o.d1;
  if (o.tipo === "duas") b = o.d2 ?? o.d1;
  if (o.tipo === "angulo") {
    const alfa = ((o.angulo ?? 45) * Math.PI) / 180;
    const resto = Math.PI - alfa - c.angulo; // ângulo no outro canto do triângulo
    if (!(alfa > 0) || resto <= 1e-9) throw new Error("Ângulo do chanfro impossível para esse canto");
    b = (a * Math.sin(alfa)) / Math.sin(resto);
  }
  if (!(a > 0 && b > 0)) throw new Error("As distâncias devem ser maiores que zero");
  if (a >= c.len1 - 1e-9 || b >= c.len2 - 1e-9) throw new Error("Chanfro grande demais para essas linhas");
  const [n1, n2] = encurtar(d, c, pontoId, [c.p[0] + c.u1[0] * a, c.p[1] + c.u1[1] * a], [c.p[0] + c.u2[0] * b, c.p[1] + c.u2[1] * b]);
  const id = novoId(d.curvas);
  d.curvas.push({ id, tipo: "linha", a: n1, b: n2 });
  return [id];
}

// ---- Estender, Quebrar e Escala do esboço ----

function pontoEm(d: DadosEsboco, q: P2): number {
  const achado = d.pontos.find((p) => Math.hypot(p.u - q[0], p.v - q[1]) < 1e-6);
  return achado ? achado.id : novoPonto(d, q);
}

// Estende a ponta da linha mais perto do clique até a primeira curva no caminho.
export function estenderLinha(d: DadosEsboco, curvaId: number, clique: P2): number[] {
  const l = d.curvas.find((c) => c.id === curvaId);
  if (!l || l.tipo !== "linha") throw new Error("Por enquanto só linhas retas se estendem");
  const A = pos(d, l.a), B = pos(d, l.b);
  const pontaB = dist(clique, B) < dist(clique, A);
  const [fixa, ponta, idPonta] = pontaB ? [A, B, l.b] : [B, A, l.a];
  const L = dist(fixa, ponta);
  const dir: P2 = [(ponta[0] - fixa[0]) / L, (ponta[1] - fixa[1]) / L];
  const frente = cruzamentosDaSemirreta(d, ponta, dir, curvaId)
    .map((q) => ({ q, t: (q[0] - ponta[0]) * dir[0] + (q[1] - ponta[1]) * dir[1] }))
    .filter((x) => x.t > 1e-6)
    .sort((x, y) => x.t - y.t);
  if (!frente.length) throw new Error("Não há curva no caminho para estender até ela");
  const alvo = frente[0].q;
  // Ponta ligada a outra curva: a linha ganha uma ponta nova (as outras ficam).
  const ligada = d.curvas.some((c) => c.id !== curvaId && idsDaCurva(c).includes(idPonta));
  if (ligada) {
    const novo = pontoEm(d, alvo);
    if (pontaB) l.b = novo;
    else l.a = novo;
  } else {
    const existente = d.pontos.find((x) => x.id !== idPonta && Math.hypot(x.u - alvo[0], x.v - alvo[1]) < 1e-6);
    if (existente) {
      if (pontaB) l.b = existente.id;
      else l.a = existente.id;
      d.pontos = d.pontos.filter((x) => x.id !== idPonta);
    } else {
      const p = d.pontos.find((x) => x.id === idPonta)!;
      p.u = alvo[0];
      p.v = alvo[1];
    }
  }
  limparReferencias(d);
  return [curvaId];
}

// Quebra a curva nos pontos onde ela cruza outras (as partes continuam lá).
export function quebrarCurva(d: DadosEsboco, curvaId: number): number[] {
  const c = d.curvas.find((x) => x.id === curvaId);
  if (!c) throw new Error("Curva não encontrada");
  const cortes = cortesDaCurva(d, curvaId);
  const criadas: number[] = [];
  const nova = (curva: CurvaEsboco) => {
    d.curvas.push(curva);
    criadas.push(curva.id);
  };
  if (c.tipo === "linha") {
    const A = pos(d, c.a), B = pos(d, c.b), L = dist(A, B);
    const ts = cortes.map((q) => ((q[0] - A[0]) * (B[0] - A[0]) + (q[1] - A[1]) * (B[1] - A[1])) / (L * L)).filter((t) => t > 1e-6 && t < 1 - 1e-6);
    if (!ts.length) throw new Error("A linha não cruza nenhuma curva");
    const marcos = [...new Set(ts.map((t) => +t.toFixed(9)))].sort((x, y) => x - y);
    const ids = [c.a, ...marcos.map((t) => pontoEm(d, [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t])), c.b];
    d.curvas = d.curvas.filter((x) => x.id !== curvaId);
    for (let i = 0; i + 1 < ids.length; i++) nova({ id: novoId(d.curvas), tipo: "linha", a: ids[i], b: ids[i + 1], restricao: c.restricao });
  } else if (c.tipo === "arco" || c.tipo === "circulo") {
    const C = pos(d, c.centro);
    const ang = (q: P2) => Math.atan2(q[1] - C[1], q[0] - C[0]);
    const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (c.tipo === "arco") {
      const g = geoArco(d, c);
      const rel = cortes.map((q) => norm(ang(q) - g.inicio)).filter((x) => x > 1e-6 && x < g.sweep - 1e-6);
      if (!rel.length) throw new Error("O arco não cruza nenhuma curva");
      const marcos = [...new Set(rel.map((x) => +x.toFixed(9)))].sort((x, y) => x - y);
      const ids = [c.a, ...marcos.map((x) => pontoEm(d, [C[0] + g.raio * Math.cos(g.inicio + x), C[1] + g.raio * Math.sin(g.inicio + x)])), c.b];
      d.curvas = d.curvas.filter((x) => x.id !== curvaId);
      for (let i = 0; i + 1 < ids.length; i++) nova({ id: novoId(d.curvas), tipo: "arco", centro: c.centro, a: ids[i], b: ids[i + 1] });
    } else {
      const angs = [...new Set(cortes.map((q) => +norm(ang(q)).toFixed(9)))].sort((x, y) => x - y);
      if (angs.length < 2) throw new Error("O círculo precisa cruzar outras curvas em pelo menos 2 pontos");
      const ids = angs.map((x) => pontoEm(d, [C[0] + c.raio * Math.cos(x), C[1] + c.raio * Math.sin(x)]));
      d.curvas = d.curvas.filter((x) => x.id !== curvaId);
      for (let i = 0; i < ids.length; i++) nova({ id: novoId(d.curvas), tipo: "arco", centro: c.centro, a: ids[i], b: ids[(i + 1) % ids.length] });
    }
  } else throw new Error("Por enquanto só linhas, arcos e círculos se quebram");
  limparReferencias(d);
  return criadas;
}

// Aumenta/diminui as curvas escolhidas em volta de um ponto (fator 2 = dobro).
export function escalarCurvas(d: DadosEsboco, ids: number[], centroId: number, fator: number): number[] {
  if (!(fator > 0)) throw new Error("O fator deve ser maior que zero");
  const C = pos(d, centroId);
  const curvas = d.curvas.filter((c) => ids.includes(c.id));
  const pontos = new Set(curvas.flatMap(idsDaCurva));
  pontos.delete(centroId);
  for (const p of d.pontos)
    if (pontos.has(p.id)) {
      p.u = C[0] + (p.u - C[0]) * fator;
      p.v = C[1] + (p.v - C[1]) * fator;
    }
  for (const c of curvas) {
    if (c.tipo === "circulo") c.raio *= fator;
    if (c.tipo === "elipse") c.menor *= fator;
  }
  // Cotas dessas curvas deixam de valer (o tamanho mudou de propósito).
  d.cotas = d.cotas.filter((k) => !("curva" in k && ids.includes(k.curva)));
  return ids;
}

// ---- Círculos por tangentes ----

function retaDe(d: DadosEsboco, id: number) {
  const l = d.curvas.find((c) => c.id === id);
  if (!l || l.tipo !== "linha") throw new Error("Escolha linhas retas");
  const A = pos(d, l.a), B = pos(d, l.b), L = dist(A, B);
  const n: P2 = [-(B[1] - A[1]) / L, (B[0] - A[0]) / L]; // normal unitária
  return { n, c: n[0] * A[0] + n[1] * A[1] }; // reta: n·x = c
}

function circuloComTangentes(d: DadosEsboco, centro: P2, raio: number, linhas: number[]): number[] {
  const id = novoId(d.curvas);
  d.curvas.push({ id, tipo: "circulo", centro: novoPonto(d, centro), raio });
  d.restricoes ??= [];
  for (const l of linhas) d.restricoes.push({ id: novoId(d.restricoes), tipo: "tangente", c1: l, c2: id });
  return [id];
}

// Círculo de raio dado tangente a duas linhas, do lado mais perto de "pista".
export function circuloDuasTangentes(d: DadosEsboco, l1: number, l2: number, raio: number, pista: P2): number[] {
  if (!(raio > 0)) throw new Error("O raio deve ser maior que zero");
  const a = retaDe(d, l1), b = retaDe(d, l2);
  const det = a.n[0] * b.n[1] - a.n[1] * b.n[0];
  if (Math.abs(det) < 1e-9) throw new Error("As linhas são paralelas");
  let melhor: P2 | null = null;
  for (const s1 of [1, -1])
    for (const s2 of [1, -1]) {
      const c1 = a.c + s1 * raio, c2 = b.c + s2 * raio;
      const q: P2 = [(c1 * b.n[1] - c2 * a.n[1]) / det, (a.n[0] * c2 - b.n[0] * c1) / det];
      if (!melhor || dist(q, pista) < dist(melhor, pista)) melhor = q;
    }
  return circuloComTangentes(d, melhor!, raio, [l1, l2]);
}

// Círculo tangente a três linhas (o mais perto de "pista": dentro ou fora do triângulo).
export function circuloTresTangentes(d: DadosEsboco, ls: [number, number, number], pista: P2): number[] {
  const r = ls.map((l) => retaDe(d, l));
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  let melhor: { c: P2; raio: number } | null = null;
  for (const s of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]]) {
    // n_i·x − s_i·raio = c_i  →  sistema 3×3 em (x, y, raio)
    const M = r.map((x, i) => [x.n[0], x.n[1], -s[i]]);
    const v = r.map((x) => x.c);
    const D = det3(M);
    if (Math.abs(D) < 1e-12) continue;
    const col = (k: number) => M.map((linha, i) => linha.map((x, j) => (j === k ? v[i] : x)));
    const [x, y, raio] = [0, 1, 2].map((k) => det3(col(k)) / D);
    if (raio <= 1e-9) continue;
    if (!melhor || dist([x, y], pista) < dist(melhor.c, pista)) melhor = { c: [x, y], raio };
  }
  if (!melhor) throw new Error("Não há círculo tangente a essas três linhas (paralelas?)");
  return circuloComTangentes(d, melhor.c, melhor.raio, ls);
}

// ---- Restrição automática ----
// Põe horizontal/vertical nas linhas quase retas (até 3°) e depois cotas
// (comprimento, diâmetro, raio e, por fim, distância H/V até a origem) só onde
// elas ainda tiram liberdade: nada fica repetido nem em conflito.
// Diferenças do Fusion: não junta pontos soltos, não põe tangente/igual/paralelo
// e as cotas de posição saem sempre da origem.
export function restringirAutomatico(d: DadosEsboco): { restricoes: number; cotas: number; graus: number } {
  d.restricoes ??= [];
  let graus = analisarDefinicao(d).graus;
  const tentar = (fazer: () => void, desfazer: () => void): boolean => {
    fazer();
    const g = analisarDefinicao(d).graus;
    if (g < graus) return (graus = g), true;
    desfazer();
    return false;
  };
  let nr = 0, nc = 0;
  const RETO = (3 * Math.PI) / 180;
  for (const c of d.curvas) {
    if (c.tipo !== "linha" || c.restricao) continue;
    const a = pos(d, c.a), b = pos(d, c.b);
    const ang = Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0]));
    const r = ang < RETO ? "h" : ang > Math.PI / 2 - RETO ? "v" : null;
    if (r && tentar(() => (c.restricao = r), () => delete c.restricao)) nr++;
  }
  if (nr) resolver(d);
  const pontoXY = (id: number) => pos(d, id);
  const raio = (id: number) => {
    const c = d.curvas.find((x) => x.id === id);
    return c?.tipo === "circulo" ? c.raio : 0;
  };
  const cota = (k: Parameters<typeof medidaCota>[1]) => {
    k.valor = medidaCota(d, k, pontoXY, raio);
    if (tentar(() => d.cotas.push(k), () => d.cotas.pop())) nc++;
  };
  for (const c of d.curvas) {
    if (c.tipo === "spline" || c.tipo === "elipse") continue;
    if (d.cotas.some((k) => (k.tipo ?? "curva") === "curva" && (k as { curva: number }).curva === c.id)) continue;
    cota({ id: novoId(d.cotas), curva: c.id });
  }
  const usados = new Set(d.curvas.flatMap(idsDaCurva));
  for (const p of d.pontos) {
    if (p.id === 0 || !usados.has(p.id)) continue;
    for (const eixo of ["h", "v"] as const) {
      const delta = eixo === "h" ? p.u : p.v;
      if (Math.abs(delta) < 1e-6) continue; // em cima do eixo: a cota daria zero
      cota({ id: novoId(d.cotas), tipo: "pontos", p1: 0, p2: p.id, eixo, sinal: Math.sign(delta) });
    }
  }
  return { restricoes: nr, cotas: nc, graus };
}
