// Corpos de malha (aba MALHA): só triângulos, sem as faces exatas de um sólido.
// Tudo aqui é conta pura (sem OpenCascade): ler STL/OBJ, soldar pontos,
// inverter, separar, suavizar (Taubin), reduzir (colapso de arestas com
// quádricas de erro), reparar (soldar, tirar triângulos ruins, acertar o
// sentido, tapar buracos) e cortar por um plano (com ou sem tampa).
import { ShapeUtils, Vector2 } from "three";

export interface Malha {
  pos: Float32Array; // x, y, z de cada ponto
  tri: Uint32Array; // 3 pontos por triângulo, anti-horário visto de fora
}

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const ponto = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tam = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const P = (m: { pos: ArrayLike<number> }, i: number): V3 => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];

// ---- Ler arquivos ----

// Junta pontos iguais (até "tol") de uma sopa de triângulos (9 números cada).
export function soldarSopa(sopa: ArrayLike<number>, tol = 1e-6): Malha {
  const mapa = new Map<string, number>();
  const pos: number[] = [];
  const tri: number[] = [];
  for (let i = 0; i < sopa.length; i += 3) {
    const x = sopa[i], y = sopa[i + 1], z = sopa[i + 2];
    const k = `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`;
    let id = mapa.get(k);
    if (id === undefined) {
      id = pos.length / 3;
      mapa.set(k, id);
      pos.push(x, y, z);
    }
    tri.push(id);
    // Triângulo que ficou com ponto repetido (ex.: no polo de uma esfera) sai.
    const n = tri.length;
    if (n % 3 === 0 && (tri[n - 1] === tri[n - 2] || tri[n - 1] === tri[n - 3] || tri[n - 2] === tri[n - 3])) tri.length = n - 3;
  }
  return compactar(pos, tri);
}

// Junta pontos iguais de uma malha que já tem índices (ex.: costuras entre faces).
export function soldarMalha(m: Malha, tol = 1e-6): Malha {
  const sopa = new Float32Array(m.tri.length * 3);
  for (let i = 0; i < m.tri.length; i++) sopa.set(P(m, m.tri[i]), i * 3);
  return soldarSopa(sopa, tol);
}

export function lerSTL(bytes: Uint8Array): Malha {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.length >= 84 ? dv.getUint32(80, true) : -1;
  if (n >= 0 && 84 + n * 50 === bytes.length) {
    const sopa = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) sopa[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
    return soldarSopa(sopa);
  }
  const texto = new TextDecoder().decode(bytes);
  const nums: number[] = [];
  for (const m of texto.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) nums.push(+m[1], +m[2], +m[3]);
  if (!nums.length || nums.length % 9 || nums.some((v) => !Number.isFinite(v))) throw new Error("Arquivo STL inválido");
  return soldarSopa(nums);
}

export function lerOBJ(texto: string): Malha {
  const pos: number[] = [];
  const tri: number[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const p = linha.trim().split(/\s+/);
    if (p[0] === "v") pos.push(+p[1], +p[2], +p[3]);
    else if (p[0] === "f") {
      const n = pos.length / 3;
      const ids = p.slice(1).map((s) => {
        const i = parseInt(s.split("/")[0], 10);
        return i < 0 ? n + i : i - 1;
      });
      for (let k = 1; k + 1 < ids.length; k++) tri.push(ids[0], ids[k], ids[k + 1]); // polígono vira leque
    }
  }
  if (!tri.length || pos.some((v) => !Number.isFinite(v)) || tri.some((i) => !(i >= 0 && i < pos.length / 3))) throw new Error("Arquivo OBJ inválido");
  return { pos: new Float32Array(pos), tri: new Uint32Array(tri) };
}

// ---- Medidas ----

export function volumeMalha(m: Malha): number {
  let v = 0;
  for (let t = 0; t < m.tri.length; t += 3) v += ponto(P(m, m.tri[t]), cruz(P(m, m.tri[t + 1]), P(m, m.tri[t + 2])));
  return v / 6;
}

export function areaMalha(m: Malha): number {
  let a = 0;
  for (let t = 0; t < m.tri.length; t += 3) {
    const p0 = P(m, m.tri[t]);
    a += tam(cruz(sub(P(m, m.tri[t + 1]), p0), sub(P(m, m.tri[t + 2]), p0))) / 2;
  }
  return a;
}

export function caixaMalha(m: Malha): [V3, V3] {
  const mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], m.pos[i + k]);
      mx[k] = Math.max(mx[k], m.pos[i + k]);
    }
  return [mn, mx];
}

// Arestas da borda (usadas por um triângulo só): sinal de buraco.
export function bordas(m: Malha): number {
  const cont = contarArestas(m);
  let n = 0;
  for (const v of cont.values()) if (v === 1) n++;
  return n;
}

function contarArestas(m: Malha): Map<number, number> {
  const nv = m.pos.length / 3;
  const cont = new Map<number, number>();
  for (let t = 0; t < m.tri.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.tri[t + k], b = m.tri[t + ((k + 1) % 3)];
      const ch = Math.min(a, b) * nv + Math.max(a, b);
      cont.set(ch, (cont.get(ch) ?? 0) + 1);
    }
  return cont;
}

// ---- Transformações simples ----

export function transformarMalha(m: Malha, f: (p: V3) => V3): Malha {
  const pos = new Float32Array(m.pos.length);
  for (let i = 0; i < m.pos.length; i += 3) pos.set(f([m.pos[i], m.pos[i + 1], m.pos[i + 2]]), i);
  return { pos, tri: m.tri.slice() };
}

export function inverterMalha(m: Malha): Malha {
  const tri = m.tri.slice();
  for (let t = 0; t < tri.length; t += 3) [tri[t + 1], tri[t + 2]] = [tri[t + 2], tri[t + 1]];
  return { pos: m.pos.slice(), tri };
}

// Tira pontos que nenhum triângulo usa (renumera).
export function compactar(pos: ArrayLike<number>, tri: ArrayLike<number>): Malha {
  const novo = new Map<number, number>();
  const p: number[] = [];
  const t = new Uint32Array(tri.length);
  for (let i = 0; i < tri.length; i++) {
    let j = novo.get(tri[i]);
    if (j === undefined) {
      j = p.length / 3;
      novo.set(tri[i], j);
      p.push(pos[tri[i] * 3], pos[tri[i] * 3 + 1], pos[tri[i] * 3 + 2]);
    }
    t[i] = j;
  }
  return { pos: new Float32Array(p), tri: t };
}

// Pedaços soltos (triângulos ligados por pontos em comum) viram malhas separadas.
export function separarMalha(m: Malha): Malha[] {
  const nv = m.pos.length / 3;
  const pai = Array.from({ length: nv }, (_, i) => i);
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])));
  for (let t = 0; t < m.tri.length; t += 3) {
    const a = raiz(m.tri[t]);
    pai[raiz(m.tri[t + 1])] = a;
    pai[raiz(m.tri[t + 2])] = a;
  }
  const grupos = new Map<number, number[]>();
  for (let t = 0; t < m.tri.length; t += 3) {
    const g = raiz(m.tri[t]);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(m.tri[t], m.tri[t + 1], m.tri[t + 2]);
  }
  return [...grupos.values()].map((tri) => compactar(m.pos, tri));
}

// ---- Suavizar (Taubin: encolhe e incha de novo, sem perder tamanho) ----

export function suavizarMalha(m: Malha, iteracoes: number): Malha {
  const nv = m.pos.length / 3;
  const viz: Set<number>[] = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < m.tri.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.tri[t + k], b = m.tri[t + ((k + 1) % 3)];
      viz[a].add(b);
      viz[b].add(a);
    }
  // Pontos da borda ficam parados (o contorno do buraco não anda).
  const fixo = new Uint8Array(nv);
  for (const [ch, n] of contarArestas(m)) if (n === 1) (fixo[Math.floor(ch / nv)] = 1), (fixo[ch % nv] = 1);
  let pos = Float64Array.from(m.pos);
  const passo = (fator: number) => {
    const novo = pos.slice();
    for (let i = 0; i < nv; i++) {
      if (fixo[i] || !viz[i].size) continue;
      const media = [0, 0, 0];
      for (const j of viz[i]) for (let k = 0; k < 3; k++) media[k] += pos[j * 3 + k];
      for (let k = 0; k < 3; k++) novo[i * 3 + k] = pos[i * 3 + k] + fator * (media[k] / viz[i].size - pos[i * 3 + k]);
    }
    pos = novo;
  };
  for (let i = 0; i < iteracoes; i++) {
    passo(0.5);
    passo(-0.53);
  }
  return { pos: Float32Array.from(pos), tri: m.tri.slice() };
}

// ---- Reduzir (colapso de arestas pela quádrica do erro, Garland-Heckbert) ----

class Fila {
  private h: { c: number; a: number; b: number; va: number; vb: number }[] = [];
  get tamanho() {
    return this.h.length;
  }
  por(x: { c: number; a: number; b: number; va: number; vb: number }) {
    const h = this.h;
    h.push(x);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p].c <= h[i].c) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  tirar() {
    const h = this.h;
    const topo = h[0];
    const ult = h.pop()!;
    if (h.length) {
      h[0] = ult;
      let i = 0;
      for (;;) {
        const e = 2 * i + 1, d = e + 1;
        let m = i;
        if (e < h.length && h[e].c < h[m].c) m = e;
        if (d < h.length && h[d].c < h[m].c) m = d;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return topo;
  }
}

// proporcao = fração de triângulos que fica (0,5 = metade).
export function reduzirMalha(m: Malha, proporcao: number): Malha {
  const nv = m.pos.length / 3;
  const nt = m.tri.length / 3;
  const alvo = Math.max(4, Math.floor(nt * proporcao));
  const pos = Float64Array.from(m.pos);
  const tri = Int32Array.from(m.tri);
  const vivo = new Uint8Array(nt).fill(1);
  const faces: Set<number>[] = Array.from({ length: nv }, () => new Set());
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) faces[tri[t * 3 + k]].add(t);
  const Q = new Float64Array(nv * 10);
  const v = (i: number): V3 => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const normal = (t: number, troca = -1, novo?: V3): V3 => {
    const q = [0, 1, 2].map((k) => (tri[t * 3 + k] === troca ? novo! : v(tri[t * 3 + k])));
    return cruz(sub(q[1], q[0]), sub(q[2], q[0]));
  };
  for (let t = 0; t < nt; t++) {
    const n = normal(t);
    const L = tam(n);
    if (L < 1e-15) continue;
    const [a, b, c] = [n[0] / L, n[1] / L, n[2] / L];
    const d = -ponto([a, b, c], v(tri[t * 3]));
    const q = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d];
    for (let k = 0; k < 3; k++) for (let j = 0; j < 10; j++) Q[tri[t * 3 + k] * 10 + j] += q[j];
  }
  const erro = (q: ArrayLike<number>, p: V3) => {
    const [x, y, z] = p;
    return q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x + q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y + q[7] * z * z + 2 * q[8] * z + q[9];
  };
  // Borda: pontos de arestas com um triângulo só não se mexem.
  const borda = new Uint8Array(nv);
  for (const [ch, n] of contarArestas(m)) if (n === 1) (borda[Math.floor(ch / nv)] = 1), (borda[ch % nv] = 1);
  const versao = new Uint32Array(nv);
  const melhor = (a: number, b: number): { c: number; p: V3 } | null => {
    if (borda[a] && borda[b]) return null;
    const q = new Float64Array(10);
    for (let j = 0; j < 10; j++) q[j] = Q[a * 10 + j] + Q[b * 10 + j];
    const mid: V3 = [(pos[a * 3] + pos[b * 3]) / 2, (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2];
    const cands: V3[] = borda[a] ? [v(a)] : borda[b] ? [v(b)] : [v(a), v(b), mid];
    let r = { c: Infinity, p: cands[0] };
    for (const p of cands) {
      const c = erro(q, p);
      if (c < r.c) r = { c, p };
    }
    return r;
  };
  const fila = new Fila();
  const porAresta = (a: number, b: number) => {
    const r = melhor(a, b);
    if (r) fila.por({ c: r.c, a, b, va: versao[a], vb: versao[b] });
  };
  for (let t = 0; t < nt; t++)
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      if (a < b) porAresta(a, b);
    }
  const vizinhos = (i: number) => {
    const s = new Set<number>();
    for (const t of faces[i]) for (let k = 0; k < 3; k++) if (tri[t * 3 + k] !== i) s.add(tri[t * 3 + k]);
    return s;
  };
  let vivos = nt;
  while (vivos > alvo && fila.tamanho) {
    const e = fila.tirar();
    const { a, b } = e;
    if (e.va !== versao[a] || e.vb !== versao[b] || !faces[a].size || !faces[b].size) continue;
    const comuns = [...faces[a]].filter((t) => faces[b].has(t));
    if (!comuns.length) continue;
    // Condição de ligação: só 2 vizinhos em comum (senão a malha dobra/fura).
    const va = vizinhos(a), vb = vizinhos(b);
    let n = 0;
    for (const x of va) if (vb.has(x)) n++;
    if (n !== comuns.length) continue;
    const r = melhor(a, b);
    if (!r) continue;
    // Não deixa nenhum triângulo virar do avesso.
    let vira = false;
    for (const i of [a, b])
      for (const t of faces[i]) {
        if (comuns.includes(t)) continue;
        const antes = normal(t);
        const depois = normal(t, i, r.p);
        if (ponto(antes, depois) <= 0.2 * tam(antes) * tam(depois)) vira = true;
      }
    if (vira) continue;
    pos.set(r.p, a * 3);
    for (let j = 0; j < 10; j++) Q[a * 10 + j] += Q[b * 10 + j];
    for (const t of comuns) {
      vivo[t] = 0;
      vivos--;
      for (let k = 0; k < 3; k++) faces[tri[t * 3 + k]].delete(t);
    }
    for (const t of faces[b]) {
      for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === b) tri[t * 3 + k] = a;
      faces[a].add(t);
    }
    faces[b].clear();
    versao[a]++;
    versao[b]++;
    for (const x of vizinhos(a)) porAresta(Math.min(a, x), Math.max(a, x));
  }
  const final: number[] = [];
  for (let t = 0; t < nt; t++) if (vivo[t]) final.push(tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]);
  return compactar(pos, final);
}

// ---- Reparar ----

export interface Relatorio {
  soldados: number;
  ruins: number;
  repetidos: number;
  virados: number;
  buracos: number;
}

export function repararMalha(m0: Malha): { malha: Malha; relatorio: Relatorio } {
  const [mn, mx] = caixaMalha(m0);
  const tol = Math.max(1e-6, tam(sub(mx, mn)) * 1e-7);
  const sopa = new Float32Array(m0.tri.length * 3);
  for (let i = 0; i < m0.tri.length; i++) sopa.set(P(m0, m0.tri[i]), i * 3);
  const m = soldarSopa(sopa, tol);
  const soldados = m0.pos.length / 3 - m.pos.length / 3;
  // Triângulos ruins (pontos repetidos ou sem área) e repetidos.
  const vistos = new Set<string>();
  const bons: number[] = [];
  let ruins = 0, repetidos = 0;
  for (let t = 0; t < m.tri.length; t += 3) {
    const [a, b, c] = [m.tri[t], m.tri[t + 1], m.tri[t + 2]];
    const area = tam(cruz(sub(P(m, b), P(m, a)), sub(P(m, c), P(m, a))));
    if (a === b || b === c || a === c || area < 1e-12) {
      ruins++;
      continue;
    }
    const ch = [a, b, c].sort((x, y) => x - y).join(",");
    if (vistos.has(ch)) {
      repetidos++;
      continue;
    }
    vistos.add(ch);
    bons.push(a, b, c);
  }
  const tri = Uint32Array.from(bons);
  const nt = tri.length / 3;
  const nv = m.pos.length / 3;
  // Sentido: vizinhos devem percorrer a aresta em comum em sentidos opostos.
  const porAresta = new Map<number, number[]>();
  for (let t = 0; t < nt; t++)
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      const ch = Math.min(a, b) * nv + Math.max(a, b);
      if (!porAresta.has(ch)) porAresta.set(ch, []);
      porAresta.get(ch)!.push(t);
    }
  const temAresta = (t: number, a: number, b: number) => {
    for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === a && tri[t * 3 + ((k + 1) % 3)] === b) return true;
    return false;
  };
  const visto = new Uint8Array(nt);
  let virados = 0;
  for (let s = 0; s < nt; s++) {
    if (visto[s]) continue;
    visto[s] = 1;
    const pilha = [s];
    const componente = [s];
    while (pilha.length) {
      const t = pilha.pop()!;
      for (let k = 0; k < 3; k++) {
        const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
        const lista = porAresta.get(Math.min(a, b) * nv + Math.max(a, b))!;
        if (lista.length !== 2) continue; // aresta com 3+ triângulos: não mexe
        const u = lista[0] === t ? lista[1] : lista[0];
        if (visto[u]) continue;
        visto[u] = 1;
        if (temAresta(u, a, b)) {
          [tri[u * 3 + 1], tri[u * 3 + 2]] = [tri[u * 3 + 2], tri[u * 3 + 1]];
          virados++;
        }
        pilha.push(u);
        componente.push(u);
      }
    }
    // Pedaço fechado com volume negativo: está todo do avesso.
    let vol = 0;
    for (const t of componente) vol += ponto(P(m, tri[t * 3]), cruz(P(m, tri[t * 3 + 1]), P(m, tri[t * 3 + 2])));
    if (vol < 0) for (const t of componente) [tri[t * 3 + 1], tri[t * 3 + 2]] = [tri[t * 3 + 2], tri[t * 3 + 1]];
  }
  // Buracos: a borda vira um leque a partir do centro do buraco.
  const pos = Array.from(m.pos);
  const lista = Array.from(tri);
  const { lacos } = lacosDaBorda({ pos: m.pos, tri });
  for (const laco of lacos) {
    if (laco.length === 3) {
      lista.push(laco[0], laco[1], laco[2]);
      continue;
    }
    const c = [0, 0, 0];
    for (const i of laco) for (let k = 0; k < 3; k++) c[k] += pos[i * 3 + k] / laco.length;
    const ic = pos.length / 3;
    pos.push(c[0], c[1], c[2]);
    for (let i = 0; i < laco.length; i++) lista.push(ic, laco[i], laco[(i + 1) % laco.length]);
  }
  return {
    malha: { pos: new Float32Array(pos), tri: Uint32Array.from(lista) },
    relatorio: { soldados, ruins, repetidos, virados, buracos: lacos.length },
  };
}

// Laços da borda no sentido de quem tapa (o triângulo novo usa a aresta ao contrário).
function lacosDaBorda(m: Malha, filtro?: (i: number) => boolean): { lacos: number[][] } {
  const dirigidas = new Set<string>();
  for (let t = 0; t < m.tri.length; t += 3) for (let k = 0; k < 3; k++) dirigidas.add(`${m.tri[t + k]},${m.tri[t + ((k + 1) % 3)]}`);
  const proximo = new Map<number, number>();
  for (let t = 0; t < m.tri.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.tri[t + k], b = m.tri[t + ((k + 1) % 3)];
      if (dirigidas.has(`${b},${a}`)) continue;
      if (filtro && !(filtro(a) && filtro(b))) continue;
      proximo.set(b, a); // ao contrário: b → a
    }
  const lacos: number[][] = [];
  const usado = new Set<number>();
  for (const inicio of proximo.keys()) {
    if (usado.has(inicio)) continue;
    const laco: number[] = [];
    let i: number | undefined = inicio;
    while (i !== undefined && !usado.has(i)) {
      usado.add(i);
      laco.push(i);
      i = proximo.get(i);
    }
    if (i === inicio && laco.length >= 3) lacos.push(laco);
  }
  return { lacos };
}

// ---- Corte por plano ----

// Fica o lado para onde a normal aponta (manterPositivo) ou o outro. Com
// "tampar", o buraco do corte vira uma tampa plana (com furos, se houver).
export function cortarMalha(m: Malha, origem: V3, normal: V3, manterPositivo: boolean, tampar: boolean): Malha {
  const L = tam(normal);
  const n: V3 = [normal[0] / L, normal[1] / L, normal[2] / L];
  const s = manterPositivo ? 1 : -1;
  const [mn, mx] = caixaMalha(m);
  const eps = Math.max(1e-9, tam(sub(mx, mn)) * 1e-9);
  const pos = Array.from(m.pos);
  const dist = (i: number) => {
    const d = s * ponto(sub([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], origem), n);
    return Math.abs(d) < eps ? 0 : d;
  };
  const d0 = Array.from({ length: m.pos.length / 3 }, (_, i) => dist(i));
  const noPlano = new Set<number>(d0.flatMap((d, i) => (d === 0 ? [i] : [])));
  const cache = new Map<string, number>();
  const cruzamento = (a: number, b: number) => {
    const ch = a < b ? `${a},${b}` : `${b},${a}`;
    let i = cache.get(ch);
    if (i === undefined) {
      const t = d0[a] / (d0[a] - d0[b]);
      i = pos.length / 3;
      for (let k = 0; k < 3; k++) pos.push(pos[a * 3 + k] + t * (pos[b * 3 + k] - pos[a * 3 + k]));
      cache.set(ch, i);
      noPlano.add(i);
    }
    return i;
  };
  const novos: number[] = [];
  for (let t = 0; t < m.tri.length; t += 3) {
    const v = [m.tri[t], m.tri[t + 1], m.tri[t + 2]];
    if (v.every((i) => d0[i] >= 0)) {
      novos.push(...v);
      continue;
    }
    if (v.every((i) => d0[i] <= 0)) continue;
    // Recorta o triângulo pelo semiespaço (Sutherland-Hodgman) e faz um leque.
    const poli: number[] = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      if (d0[a] >= 0) poli.push(a);
      if ((d0[a] > 0 && d0[b] < 0) || (d0[a] < 0 && d0[b] > 0)) poli.push(cruzamento(a, b));
    }
    for (let k = 1; k + 1 < poli.length; k++) novos.push(poli[0], poli[k], poli[k + 1]);
  }
  let r = compactarComMarca(pos, novos, noPlano);
  if (!r.malha.tri.length) throw new Error("O plano deixa a malha vazia desse lado");
  if (tampar) {
    const { lacos } = lacosDaBorda(r.malha, (i) => r.noPlano.has(i));
    if (lacos.length) r = { ...r, malha: tampa(r.malha, lacos, [-s * n[0], -s * n[1], -s * n[2]]) };
  }
  return r.malha;
}

function compactarComMarca(pos: number[], tri: number[], marca: Set<number>) {
  const novo = new Map<number, number>();
  const p: number[] = [];
  const t = tri.map((i) => {
    let j = novo.get(i);
    if (j === undefined) {
      j = p.length / 3;
      novo.set(i, j);
      p.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    }
    return j;
  });
  const noPlano = new Set<number>();
  for (const [a, b] of novo) if (marca.has(a)) noPlano.add(b);
  return { malha: { pos: new Float32Array(p), tri: Uint32Array.from(t) }, noPlano };
}

// Tampa plana: laços de fora (área +) com os furos (área −) dentro, triangulados.
function tampa(m: Malha, lacos: number[][], fora: V3): Malha {
  const ref: V3 = Math.abs(fora[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = cruz(ref, fora);
  const l1 = tam(e1);
  const u: V3 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const w = cruz(fora, u); // u × w = fora
  const em2D = (i: number) => new Vector2(ponto(P(m, i), u), ponto(P(m, i), w));
  const area = (pts: Vector2[]) => ShapeUtils.area(pts);
  const polis = lacos.map((l) => ({ ids: l, pts: l.map(em2D) }));
  const externos = polis.filter((p) => area(p.pts) > 0);
  const furos = polis.filter((p) => area(p.pts) < 0);
  const dentro = (q: Vector2, pts: Vector2[]) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      if (pts[i].y > q.y !== pts[j].y > q.y && q.x < ((pts[j].x - pts[i].x) * (q.y - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) c = !c;
    return c;
  };
  const tri = Array.from(m.tri);
  for (const ext of externos) {
    const meus = furos.filter((f) => dentro(f.pts[0], ext.pts));
    const ids = [...ext.ids, ...meus.flatMap((f) => f.ids)];
    const faces = ShapeUtils.triangulateShape(ext.pts, meus.map((f) => f.pts));
    for (const [a, b, c] of faces) {
      const [ia, ib, ic] = [ids[a], ids[b], ids[c]];
      const nn = cruz(sub(P(m, ib), P(m, ia)), sub(P(m, ic), P(m, ia)));
      if (ponto(nn, fora) >= 0) tri.push(ia, ib, ic);
      else tri.push(ia, ic, ib);
    }
  }
  return { pos: m.pos.slice(), tri: Uint32Array.from(tri) };
}

// STL binário (para o Converter em sólido e para exportar).
export function stlBinario(malhas: Malha[]): Uint8Array {
  const n = malhas.reduce((s, m) => s + m.tri.length / 3, 0);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  for (const m of malhas)
    for (let t = 0; t < m.tri.length; t += 3) {
      const a = P(m, m.tri[t]), b = P(m, m.tri[t + 1]), c = P(m, m.tri[t + 2]);
      const nn = cruz(sub(b, a), sub(c, a));
      const L = tam(nn) || 1;
      [nn[0] / L, nn[1] / L, nn[2] / L, ...a, ...b, ...c].forEach((v, k) => dv.setFloat32(o + k * 4, v, true));
      o += 50;
    }
  return new Uint8Array(buf);
}

// ---- Casca de malha: deixa a malha oca, com parede "t" para dentro ----
// Cada ponto anda para dentro de modo que fique a "t" de cada face plana em
// volta (resolve o sistema das normais; num canto de cubo anda t em cada eixo).
// A parede de dentro tem os triângulos virados (normal para dentro do oco).
export function cascaMalha(m0: Malha, t: number): Malha {
  const m = soldarMalha(m0);
  const nv = m.pos.length / 3, nt = m.tri.length / 3;
  const normais: V3[] = [];
  for (let i = 0; i < nt; i++) {
    const a = P(m, m.tri[i * 3]), b = P(m, m.tri[i * 3 + 1]), c = P(m, m.tri[i * 3 + 2]);
    const n = cruz(sub(b, a), sub(c, a));
    const L = tam(n) || 1;
    normais.push([n[0] / L, n[1] / L, n[2] / L]);
  }
  const porPonto: V3[][] = Array.from({ length: nv }, () => []);
  for (let i = 0; i < nt; i++)
    for (let k = 0; k < 3; k++) {
      const lista = porPonto[m.tri[i * 3 + k]];
      if (!lista.some((n) => ponto(n, normais[i]) > 0.9999)) lista.push(normais[i]);
    }
  const pos = new Float32Array(nv * 2 * 3);
  pos.set(m.pos);
  for (let v = 0; v < nv; v++) {
    // (Σ f fᵀ + εI) d = Σ t f
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
    for (const f of porPonto[v]) {
      for (let r = 0; r < 3; r++) {
        b[r] += t * f[r];
        for (let c = 0; c < 3; c++) M[r * 3 + c] += f[r] * f[c];
      }
    }
    for (let r = 0; r < 3; r++) M[r * 4] += 1e-6;
    const det = (q: number[]) => q[0] * (q[4] * q[8] - q[5] * q[7]) - q[1] * (q[3] * q[8] - q[5] * q[6]) + q[2] * (q[3] * q[7] - q[4] * q[6]);
    const D = det(M);
    const d = [0, 1, 2].map((k) => {
      const q = [...M];
      for (let r = 0; r < 3; r++) q[r * 3 + k] = b[r];
      return det(q) / D;
    });
    for (let k = 0; k < 3; k++) pos[(nv + v) * 3 + k] = m.pos[v * 3 + k] - d[k];
  }
  const tri = new Uint32Array(nt * 2 * 3);
  tri.set(m.tri);
  for (let i = 0; i < nt; i++) {
    tri[(nt + i) * 3] = m.tri[i * 3] + nv;
    tri[(nt + i) * 3 + 1] = m.tri[i * 3 + 2] + nv;
    tri[(nt + i) * 3 + 2] = m.tri[i * 3 + 1] + nv;
  }
  return { pos, tri };
}

// ---- Suavizar fronteira: arredonda as bordas abertas da malha ----
// Só os pontos da borda andam, para a média dos vizinhos na própria borda.
export function suavizarFronteira(m0: Malha, iteracoes: number): Malha {
  const m = soldarMalha(m0);
  const contagem = new Map<string, number>();
  const chave = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let i = 0; i < m.tri.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const c = chave(m.tri[i + k], m.tri[i + ((k + 1) % 3)]);
      contagem.set(c, (contagem.get(c) ?? 0) + 1);
    }
  const viz = new Map<number, number[]>();
  for (const [c, n] of contagem) {
    if (n !== 1) continue;
    const [a, b] = c.split(",").map(Number);
    viz.set(a, [...(viz.get(a) ?? []), b]);
    viz.set(b, [...(viz.get(b) ?? []), a]);
  }
  if (!viz.size) throw new Error("A malha não tem borda aberta");
  const pos = Float32Array.from(m.pos);
  for (let it = 0; it < iteracoes; it++) {
    const novo = Float32Array.from(pos);
    for (const [v, vs] of viz) {
      if (vs.length !== 2) continue;
      for (let k = 0; k < 3; k++) novo[v * 3 + k] = 0.5 * pos[v * 3 + k] + 0.25 * (pos[vs[0] * 3 + k] + pos[vs[1] * 3 + k]);
    }
    pos.set(novo);
  }
  return { pos, tri: m.tri };
}

// ---- Grupos de faces: triângulos vizinhos com normais parecidas (até "angulo") ----
// Devolve o número do grupo de cada triângulo.
export function gruposDeFaces(m0: Malha, angulo: number): { malha: Malha; grupo: Uint32Array; total: number } {
  const m = soldarMalha(m0);
  const nt = m.tri.length / 3;
  const normais: V3[] = [];
  for (let i = 0; i < nt; i++) {
    const a = P(m, m.tri[i * 3]), b = P(m, m.tri[i * 3 + 1]), c = P(m, m.tri[i * 3 + 2]);
    const n = cruz(sub(b, a), sub(c, a));
    const L = tam(n) || 1;
    normais.push([n[0] / L, n[1] / L, n[2] / L]);
  }
  const porAresta = new Map<string, number[]>();
  for (let i = 0; i < nt; i++)
    for (let k = 0; k < 3; k++) {
      const a = m.tri[i * 3 + k], b = m.tri[i * 3 + ((k + 1) % 3)];
      const c = a < b ? `${a},${b}` : `${b},${a}`;
      porAresta.set(c, [...(porAresta.get(c) ?? []), i]);
    }
  const vizinhos: number[][] = Array.from({ length: nt }, () => []);
  for (const ts of porAresta.values()) if (ts.length === 2) (vizinhos[ts[0]].push(ts[1]), vizinhos[ts[1]].push(ts[0]));
  const lim = Math.cos((angulo * Math.PI) / 180);
  const grupo = new Uint32Array(nt).fill(0xffffffff);
  let total = 0;
  for (let s = 0; s < nt; s++) {
    if (grupo[s] !== 0xffffffff) continue;
    const pilha = [s];
    grupo[s] = total;
    while (pilha.length) {
      const t = pilha.pop()!;
      for (const u of vizinhos[t])
        if (grupo[u] === 0xffffffff && ponto(normais[t], normais[u]) >= lim) {
          grupo[u] = total;
          pilha.push(u);
        }
    }
    total++;
  }
  return { malha: m, grupo, total };
}

// ---- Alinhamento de malha (melhor encaixe) ----
// ICP ("ponto mais próximo, repetido"): começa pondo o centro sobre o centro do
// alvo e, a cada passada, acha para cada ponto da malha o ponto mais próximo do
// alvo e calcula o giro + translação que melhor junta os pares (método de Horn,
// com quatérnio). Devolve a malha movida e o erro médio final (mm).
// Limite: só acha o encaixe se a malha já estiver mais ou menos virada para o
// lado certo (giros grandes, como 180°, podem parar num encaixe errado).
export function alinharMalha(m: Malha, alvo: ArrayLike<number>, passadas = 60): { malha: Malha; erro: number } {
  const amostra = (pos: ArrayLike<number>, max: number): V3[] => {
    const n = pos.length / 3, passo = Math.max(1, Math.floor(n / max));
    const r: V3[] = [];
    for (let i = 0; i < n; i += passo) r.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    return r;
  };
  const fonte = amostra(m.pos, 4000);
  const destino = amostra(alvo, 60000);
  if (fonte.length < 3 || destino.length < 3) throw new Error("Malhas pequenas demais para alinhar");
  const centro = (l: V3[]): V3 => {
    const c: V3 = [0, 0, 0];
    for (const p of l) for (let k = 0; k < 3; k++) c[k] += p[k] / l.length;
    return c;
  };
  // Grade para achar o ponto mais próximo do alvo depressa.
  const [mn, mx] = caixaPontos(destino);
  const lado = Math.max(1e-6, Math.cbrt(((mx[0] - mn[0] + 1e-6) * (mx[1] - mn[1] + 1e-6) * (mx[2] - mn[2] + 1e-6)) / destino.length) * 2);
  const celula = (p: V3) => p.map((v, k) => Math.floor((v - mn[k]) / lado)) as V3;
  const grade = new Map<string, number[]>();
  destino.forEach((p, i) => {
    const k = celula(p).join(",");
    (grade.get(k) ?? grade.set(k, []).get(k)!).push(i);
  });
  const maisProximo = (p: V3): V3 => {
    const c = celula(p);
    let melhor = -1, dist = Infinity;
    for (let r = 0; r < 64 && (melhor < 0 || (r - 1) * lado < Math.sqrt(dist)); r++) {
      for (let x = -r; x <= r; x++)
        for (let y = -r; y <= r; y++)
          for (let z = -r; z <= r; z++) {
            if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== r) continue;
            const l = grade.get(`${c[0] + x},${c[1] + y},${c[2] + z}`);
            if (!l) continue;
            for (const i of l) {
              const q = destino[i];
              const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
              if (d < dist) (dist = d), (melhor = i);
            }
          }
    }
    return destino[melhor < 0 ? 0 : melhor];
  };
  // Transformação acumulada: p' = R p + t.
  let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const cf = centro(fonte), cd = centro(destino);
  let t: V3 = sub(cd, cf);
  const aplicar = (p: V3): V3 => [
    R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0],
    R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1],
    R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2],
  ];
  let erro = Infinity;
  for (let it = 0; it < passadas; it++) {
    const a = fonte.map(aplicar);
    const b = a.map(maisProximo);
    const novoErro = a.reduce((s, p, i) => s + tam(sub(p, b[i])), 0) / a.length;
    const ca = centro(a), cb = centro(b);
    // Matriz de correlação S = Σ (a - ca)(b - cb)ᵀ e a matriz 4×4 de Horn.
    const S = new Array(9).fill(0);
    for (let i = 0; i < a.length; i++) {
      const p = sub(a[i], ca), q = sub(b[i], cb);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += p[r] * q[c];
    }
    const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
    const N = [
      [xx + yy + zz, yz - zy, zx - xz, xy - yx],
      [yz - zy, xx - yy - zz, xy + yx, zx + xz],
      [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
      [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
    ];
    const [w, x, y, z] = maiorAutovetor(N);
    const dR = [
      w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
    ];
    const giro = (p: V3): V3 => [dR[0] * p[0] + dR[1] * p[1] + dR[2] * p[2], dR[3] * p[0] + dR[4] * p[1] + dR[5] * p[2], dR[6] * p[0] + dR[7] * p[1] + dR[8] * p[2]];
    // Novo: p'' = dR (p' - ca) + cb  →  R = dR·R, t = dR·(t - ca) + cb.
    const nR = new Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) nR[r * 3 + c] += dR[r * 3 + k] * R[k * 3 + c];
    R = nR;
    const gt = giro(sub(t, ca));
    t = [gt[0] + cb[0], gt[1] + cb[1], gt[2] + cb[2]];
    if (Math.abs(erro - novoErro) < 1e-7) {
      erro = novoErro;
      break;
    }
    erro = novoErro;
  }
  const final = fonte.map(aplicar);
  erro = final.reduce((s, p) => s + tam(sub(p, maisProximo(p))), 0) / final.length;
  return { malha: transformarMalha(m, aplicar), erro };
}

function caixaPontos(l: V3[]): [V3, V3] {
  const mn: V3 = [Infinity, Infinity, Infinity], mx: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of l)
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], p[k]);
      mx[k] = Math.max(mx[k], p[k]);
    }
  return [mn, mx];
}

// Autovetor do maior autovalor de uma matriz 4×4 simétrica (método de Jacobi).
function maiorAutovetor(A0: number[][]): number[] {
  const A = A0.map((l) => l.slice());
  const V: number[][] = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => (i === j ? 1 : 0)));
  for (let varredura = 0; varredura < 50; varredura++) {
    let fora = 0;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) fora += A[p][q] ** 2;
    if (fora < 1e-20) break;
    for (let p = 0; p < 4; p++)
      for (let q = p + 1; q < 4; q++) {
        if (Math.abs(A[p][q]) < 1e-30) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const tt = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(tt * tt + 1), s = tt * c;
        for (let k = 0; k < 4; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 4; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 4; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  let m = 0;
  for (let i = 1; i < 4; i++) if (A[i][i] > A[m][m]) m = i;
  const v = [V[0][m], V[1][m], V[2][m], V[3][m]];
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

// ---- Ponte (liga duas bordas abertas) ----
// Acha as bordas (laços de arestas usadas por um triângulo só) e liga as duas
// maiores com uma faixa de triângulos, no sentido certo das faces. A faixa
// segue reta de uma borda à outra (sem curvar), como a Ponte do Fusion sem
// "suavidade".
export function ponteMalha(m: Malha): Malha {
  const lacos = lacosDeBorda(m);
  if (lacos.length < 2) throw new Error(`A malha precisa de 2 bordas abertas (tem ${lacos.length})`);
  lacos.sort((a, b) => b.length - a.length);
  const A = lacos[0].slice().reverse(), B = lacos[1];
  // B começa no ponto mais perto do começo de A.
  let k0 = 0, d0 = Infinity;
  B.forEach((v, k) => {
    const d = tam(sub(P(m, v), P(m, A[0])));
    if (d < d0) (d0 = d), (k0 = k);
  });
  const Q = [...B.slice(k0), ...B.slice(0, k0)];
  const nA = A.length, nB = Q.length;
  const tri = Array.from(m.tri);
  let i = 0, j = 0;
  while (i < nA || j < nB) {
    const a0 = A[i % nA], a1 = A[(i + 1) % nA], b0 = Q[j % nB], b1 = Q[(j + 1) % nB];
    // Avança do lado cuja diagonal nova é mais curta.
    const andaA = j >= nB || (i < nA && tam(sub(P(m, a1), P(m, b0))) <= tam(sub(P(m, a0), P(m, b1))));
    if (andaA) {
      tri.push(a0, a1, b0);
      i++;
    } else {
      tri.push(a0, b1, b0);
      j++;
    }
  }
  return { pos: m.pos.slice(), tri: new Uint32Array(tri) };
}

// Laços da borda, cada um na ordem das arestas dos triângulos (u → v).
export function lacosDeBorda(m: Malha): number[][] {
  const uso = contarArestas(m);
  const nv = m.pos.length / 3;
  const proximo = new Map<number, number>();
  for (let t = 0; t < m.tri.length; t += 3)
    for (let k = 0; k < 3; k++) {
      const a = m.tri[t + k], b = m.tri[t + ((k + 1) % 3)];
      if (uso.get(Math.min(a, b) * nv + Math.max(a, b)) === 1) proximo.set(a, b);
    }
  const lacos: number[][] = [];
  const visto = new Set<number>();
  for (const inicio of proximo.keys()) {
    if (visto.has(inicio)) continue;
    const laco: number[] = [];
    let v: number | undefined = inicio;
    while (v !== undefined && !visto.has(v)) {
      visto.add(v);
      laco.push(v);
      v = proximo.get(v);
    }
    if (laco.length >= 3 && v === inicio) lacos.push(laco);
  }
  return lacos;
}

// ---- Atrair para referência ----
// Pontos até "distancia" do plano vão para cima do plano (o resto fica).
export function atrairMalha(m: Malha, origem: V3, normal: V3, distancia: number): { malha: Malha; movidos: number } {
  const n = normal.map((x) => x / (tam(normal) || 1)) as V3;
  let movidos = 0;
  const malha = transformarMalha(m, (p) => {
    const d = ponto(sub(p, origem), n);
    if (Math.abs(d) > distancia || d === 0) return p;
    movidos++;
    return [p[0] - n[0] * d, p[1] - n[1] * d, p[2] - n[2] * d];
  });
  return { malha, movidos };
}

// ---- Criar grupo de faces ----
// Os triângulos virados para "direcao" (até "angulo" graus) viram um grupo
// novo; os outros ficam nos grupos que já tinham (ou no grupo 0).
export function grupoPorDirecao(m: Malha, grupoAntes: Uint32Array | undefined, direcao: V3, angulo: number): { grupo: Uint32Array; quantos: number } {
  const nt = m.tri.length / 3;
  const g = grupoAntes && grupoAntes.length === nt ? Uint32Array.from(grupoAntes) : new Uint32Array(nt);
  const novo = nt ? Math.max(...g) + 1 : 0;
  const lim = Math.cos((angulo * Math.PI) / 180);
  const d = direcao.map((x) => x / (tam(direcao) || 1)) as V3;
  let quantos = 0;
  for (let t = 0; t < nt; t++) {
    const a = P(m, m.tri[t * 3]), b = P(m, m.tri[t * 3 + 1]), c = P(m, m.tri[t * 3 + 2]);
    const n = cruz(sub(b, a), sub(c, a));
    const l = tam(n);
    if (l > 0 && ponto(n, d) / l >= lim) (g[t] = novo), quantos++;
  }
  if (!quantos) throw new Error("Nenhum triângulo virado para essa direção");
  // Renumera sem buracos (0, 1, 2...).
  const ids = [...new Set(g)].sort((x, y) => x - y);
  const mapa = new Map(ids.map((x, i) => [x, i]));
  return { grupo: Uint32Array.from(g, (x) => mapa.get(x)!), quantos };
}

// ---- Converter em malha quadrilateral ----
// Junta triângulos vizinhos dois a dois em quadriláteros: a aresta comum
// (diagonal) precisa ser a mais longa dos dois, as faces quase no mesmo plano
// (até "angulo" graus) e o quadrilátero convexo. Devolve, para cada triângulo,
// o par dele (-1 = ficou triângulo).
export function quadsDaMalha(m: Malha, angulo = 30): { par: Int32Array; quads: number } {
  const nt = m.tri.length / 3, nv = m.pos.length / 3;
  const par = new Int32Array(nt).fill(-1);
  const normal = (t: number): V3 => {
    const a = P(m, m.tri[t * 3]), b = P(m, m.tri[t * 3 + 1]), c = P(m, m.tri[t * 3 + 2]);
    const n = cruz(sub(b, a), sub(c, a));
    const l = tam(n) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  // Aresta → triângulos que a usam.
  const donos = new Map<number, number[]>();
  for (let t = 0; t < nt; t++)
    for (let k = 0; k < 3; k++) {
      const a = m.tri[t * 3 + k], b = m.tri[t * 3 + ((k + 1) % 3)];
      const ch = Math.min(a, b) * nv + Math.max(a, b);
      (donos.get(ch) ?? donos.set(ch, []).get(ch)!).push(t);
    }
  // Candidatos: arestas internas, da mais longa para a mais curta.
  const cand: { a: number; b: number; t1: number; t2: number; L: number }[] = [];
  for (const [ch, ts] of donos) {
    if (ts.length !== 2) continue;
    const a = Math.floor(ch / nv), b = ch % nv;
    cand.push({ a, b, t1: ts[0], t2: ts[1], L: tam(sub(P(m, a), P(m, b))) });
  }
  cand.sort((x, y) => y.L - x.L);
  const lim = Math.cos((angulo * Math.PI) / 180);
  const maiorAresta = (t: number) => {
    let L = 0;
    for (let k = 0; k < 3; k++) L = Math.max(L, tam(sub(P(m, m.tri[t * 3 + k]), P(m, m.tri[t * 3 + ((k + 1) % 3)]))));
    return L;
  };
  const oposto = (t: number, a: number, b: number) => [0, 1, 2].map((k) => m.tri[t * 3 + k]).find((v) => v !== a && v !== b)!;
  let quads = 0;
  for (const c of cand) {
    if (par[c.t1] >= 0 || par[c.t2] >= 0) continue;
    if (c.L + 1e-9 < Math.max(maiorAresta(c.t1), maiorAresta(c.t2))) continue;
    const n1 = normal(c.t1), n2 = normal(c.t2);
    if (ponto(n1, n2) < lim) continue;
    // Convexo: os dois cantos opostos ficam em lados diferentes da diagonal.
    const pa = P(m, c.a), pb = P(m, c.b), d = sub(pb, pa);
    const s1 = ponto(cruz(d, sub(P(m, oposto(c.t1, c.a, c.b)), pa)), n1);
    const s2 = ponto(cruz(d, sub(P(m, oposto(c.t2, c.a, c.b)), pa)), n1);
    if (s1 * s2 >= 0) continue;
    par[c.t1] = c.t2;
    par[c.t2] = c.t1;
    quads++;
  }
  return { par, quads };
}
