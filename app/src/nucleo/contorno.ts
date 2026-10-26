// Peça a partir de imagem: a silhueta da imagem vira contornos (com furos).
// 1. cada pixel é "dentro" ou "fora" pelo limiar de claridade (Otsu acha um
//    limiar sozinho); transparente é sempre fora;
// 2. as bordas entre dentro e fora viram laços (dentro fica à esquerda: laço de
//    fora anti-horário, furo horário);
// 3. os laços são simplificados (Douglas-Peucker) e os muito pequenos saem.

export interface Mascara {
  largura: number;
  altura: number;
  dentro: Uint8Array; // 1 = pixel da peça
}

export function limiarOtsu(cinza: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of cinza) hist[v]++;
  const total = cinza.length;
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * hist[i];
  let sB = 0, wB = 0, melhor = 0, limiar = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sB += t * hist[t];
    const mB = sB / wB, mF = (soma - sB) / wF;
    const entre = wB * wF * (mB - mF) ** 2;
    if (entre > melhor) (melhor = entre), (limiar = t);
  }
  return limiar;
}

// RGBA → máscara. escuro = a peça é a parte escura (desenho preto no branco).
export function mascaraDaImagem(rgba: Uint8ClampedArray, largura: number, altura: number, limiar: number | null, escuro: boolean): { mascara: Mascara; limiar: number } {
  const cinza = new Uint8Array(largura * altura);
  const opaco = new Uint8Array(largura * altura);
  for (let i = 0; i < cinza.length; i++) {
    cinza[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    opaco[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
  }
  const L = limiar ?? limiarOtsu(cinza);
  const dentro = new Uint8Array(cinza.length);
  for (let i = 0; i < cinza.length; i++) dentro[i] = opaco[i] && (escuro ? cinza[i] <= L : cinza[i] > L) ? 1 : 0;
  return { mascara: { largura, altura, dentro }, limiar: L };
}

type Pt = [number, number];

// Laços pelas bordas dos pixels (coordenadas de canto de pixel, y para baixo).
export function lacosDaMascara(m: Mascara): Pt[][] {
  const { largura: W, altura: H, dentro } = m;
  const em = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && dentro[y * W + x] === 1;
  // Arestas dirigidas com o "dentro" à esquerda (y para baixo: anti-horário na tela vira horário aqui;
  // a orientação final é acertada no fim pela área).
  const saidas = new Map<number, number[]>(); // ponto → lista de pontos seguintes
  const chave = (x: number, y: number) => y * (W + 1) + x;
  const por = (ax: number, ay: number, bx: number, by: number) => {
    const k = chave(ax, ay);
    const l = saidas.get(k);
    if (l) l.push(chave(bx, by));
    else saidas.set(k, [chave(bx, by)]);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!em(x, y)) continue;
      if (!em(x, y - 1)) por(x, y, x + 1, y); // em cima: anda para a direita
      if (!em(x + 1, y)) por(x + 1, y, x + 1, y + 1); // direita: desce
      if (!em(x, y + 1)) por(x + 1, y + 1, x, y + 1); // embaixo: esquerda
      if (!em(x - 1, y)) por(x, y + 1, x, y); // esquerda: sobe
    }
  const ponto = (k: number): Pt => [k % (W + 1), Math.floor(k / (W + 1))];
  const lacos: Pt[][] = [];
  for (const [inicio] of saidas) {
    while ((saidas.get(inicio)?.length ?? 0) > 0) {
      const laco: Pt[] = [];
      let atual = inicio;
      let anterior: Pt | null = null;
      for (let guarda = 0; guarda < 4 * (W + 1) * (H + 1); guarda++) {
        const lista = saidas.get(atual);
        if (!lista || !lista.length) break;
        // Em cruzamento (pixels encostados na diagonal) vira para não juntar as duas peças.
        let i = 0;
        if (lista.length > 1 && anterior) {
          const p = ponto(atual);
          const d: Pt = [p[0] - anterior[0], p[1] - anterior[1]];
          i = lista.findIndex((k) => {
            const q = ponto(k);
            return (q[0] - p[0]) * d[1] - (q[1] - p[1]) * d[0] < 0;
          });
          if (i < 0) i = 0;
        }
        const prox = lista.splice(i, 1)[0];
        laco.push(ponto(atual));
        anterior = ponto(atual);
        atual = prox;
        if (atual === inicio) break;
      }
      if (laco.length >= 4) lacos.push(laco);
    }
  }
  return lacos;
}

export function areaLaco(l: Pt[]): number {
  let a = 0;
  for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Douglas-Peucker num laço fechado (começa pelos dois pontos mais distantes).
export function simplificar(l: Pt[], tol: number): Pt[] {
  if (l.length < 4) return l;
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    return L < 1e-12 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / L;
  };
  const dp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts;
    let max = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = dist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > max) (max = d), (idx = i);
    }
    if (max <= tol) return [pts[0], pts[pts.length - 1]];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  let j = 0, maior = 0;
  for (let i = 1; i < l.length; i++) {
    const d = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]);
    if (d > maior) (maior = d), (j = i);
  }
  const a = dp(l.slice(0, j + 1));
  const b = dp([...l.slice(j), l[0]]);
  let r = [...a.slice(0, -1), ...b.slice(0, -1)];
  // Tira pontos que ficaram no meio de uma reta.
  for (let mudou = true; mudou && r.length > 3; ) {
    mudou = false;
    for (let i = 0; i < r.length && r.length > 3; i++) {
      if (dist(r[i], r[(i - 1 + r.length) % r.length], r[(i + 1) % r.length]) <= tol * 0.5) {
        r.splice(i, 1);
        mudou = true;
      }
    }
  }
  return r.length >= 3 ? r : l;
}

// Tudo junto: laços em mm, y para cima, centrados na origem, largura total = larguraMm.
export function contornosEmMm(
  m: Mascara,
  larguraMm: number,
  tolPx = 1,
  areaMinPx = 12,
): { lacos: Pt[][]; alturaMm: number; mmPorPixel: number; centroPx: Pt } {
  const brutos = lacosDaMascara(m).filter((l) => Math.abs(areaLaco(l)) >= areaMinPx);
  if (!brutos.length) throw new Error("Não achei a peça na imagem (tente mudar o limiar ou escuro/claro)");
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of brutos)
    for (const [x, y] of l) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  const k = larguraMm / Math.max(1, x1 - x0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const lacos = brutos.map((l) => simplificar(l, tolPx).map(([x, y]) => [+((x - cx) * k).toFixed(4), +((cy - y) * k).toFixed(4)] as Pt));
  return { lacos, alturaMm: (y1 - y0) * k, mmPorPixel: k, centroPx: [cx, cy] };
}

// ---- Curvas: círculo exato, spline nos trechos curvos, linha no resto ----
// Um laço vira:
// - círculo, se todos os pontos ficam perto de um círculo (furo redondo);
// - senão, os pontos simplificados, cada um marcado "liso" (no meio de uma
//   curva: vira ponto de spline) ou não (canto: linhas e splines começam e
//   terminam nele). Canto = vira mais de 40°, ou fica na ponta de um lado reto
//   (24 px ou mais e 2,5 vezes maior que o menor vizinho: numa curva suave os
//   trechos vizinhos têm tamanhos parecidos).
export type LacoCurvo = { tipo: "circulo"; centro: Pt; raio: number } | { tipo: "contorno"; pontos: Pt[]; liso: boolean[] };

// Círculo pelos mínimos quadrados (método de Kåsa).
export function ajustarCirculo(pts: Pt[]): { centro: Pt; raio: number; erro: number } {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  const n = pts.length;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  // Resolve [sxx sxy sx; sxy syy sy; sx sy n]·[a b c] = [sxz syz sz] (Cramer).
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], v = [sxz, syz, sz];
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-9) return { centro: [0, 0], raio: 0, erro: Infinity };
  const col = (k: number) => M.map((l, i) => l.map((x, j) => (j === k ? v[i] : x)));
  const a = det(col(0)) / D, b = det(col(1)) / D, c = det(col(2)) / D;
  const centro: Pt = [a / 2, b / 2];
  const raio = Math.sqrt(Math.max(0, c + centro[0] ** 2 + centro[1] ** 2));
  let erro = 0;
  for (const p of pts) erro = Math.max(erro, Math.abs(Math.hypot(p[0] - centro[0], p[1] - centro[1]) - raio));
  return { centro, raio, erro };
}

export function curvasDoLaco(bruto: Pt[], tolPx: number, comCurvas: boolean): LacoCurvo {
  if (!comCurvas || bruto.length < 16) {
    const pontos = simplificar(bruto, tolPx);
    return { tipo: "contorno", pontos, liso: pontos.map(() => false) };
  }
  // Os pontos de canto de pixel formam "escadinha": vale o meio de cada degrau,
  // e depois a média com os vizinhos (tira o serrilhado dos lados inclinados).
  const meios = bruto.map((p, i) => {
    const q = bruto[(i + 1) % bruto.length];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as Pt;
  });
  const c = ajustarCirculo(meios);
  if (c.raio >= 3 && c.erro <= Math.max(0.9, 0.03 * c.raio)) return { tipo: "circulo", centro: c.centro, raio: c.raio };
  const m = meios.length;
  const lisos = meios.map((_, i) => {
    let x = 0, y = 0;
    for (let k = -2; k <= 2; k++) (x += meios[(i + k + m) % m][0] / 5), (y += meios[(i + k + m) % m][1] / 5);
    return [x, y] as Pt;
  });
  const pontos = simplificar(lisos, tolPx);
  const n = pontos.length;
  const comp = (i: number) => Math.hypot(pontos[(i + 1) % n][0] - pontos[i][0], pontos[(i + 1) % n][1] - pontos[i][1]);
  const reto = (i: number) => {
    const L = comp(i);
    return L >= 24 && L > 2.5 * Math.min(comp((i - 1 + n) % n), comp((i + 1) % n));
  };
  const liso = pontos.map((p, i) => {
    if (n < 5) return false; // poucos pontos: polígono (só cantos)
    const a = pontos[(i - 1 + n) % n], b = pontos[(i + 1) % n];
    const d1: Pt = [p[0] - a[0], p[1] - a[1]], d2: Pt = [b[0] - p[0], b[1] - p[1]];
    const ang = Math.abs(Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]));
    return ang < (40 * Math.PI) / 180 && !reto((i - 1 + n) % n) && !reto(i);
  });
  // O alisamento "chanfra" os cantos vivos: cada canto volta para o ponto do
  // contorno original (canto de pixel) mais longe da reta entre os vizinhos.
  const perto = (p: Pt) => {
    let melhor = 0, d = Infinity;
    meios.forEach((q, k) => {
      const e = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
      if (e < d) (d = e), (melhor = k);
    });
    return melhor;
  };
  const final = pontos.map((p, i) => {
    if (liso[i]) return p;
    const a = pontos[(i - 1 + n) % n], b = pontos[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const longe = (q: Pt) => Math.abs(dx * (a[1] - q[1]) - dy * (a[0] - q[0])) / L;
    const k0 = perto(p);
    let melhor = p;
    // Os cantos de pixel (bruto) têm o canto vivo de verdade (o meio do degrau corta meio pixel).
    for (let k = -6; k <= 7; k++) {
      const q = bruto[(k0 + k + m) % m];
      if (longe(q) > longe(melhor)) melhor = q;
    }
    return melhor;
  });
  // Dois cantos que caíram no mesmo lugar viram um só.
  const pts: Pt[] = [], flags: boolean[] = [];
  final.forEach((p, i) => {
    const q = pts[pts.length - 1];
    if (q && !liso[i] && !flags[flags.length - 1] && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5) return;
    pts.push(p);
    flags.push(liso[i]);
  });
  if (pts.length > 3 && !flags[0] && !flags[flags.length - 1] && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1.5) (pts.pop(), flags.pop());
  return { tipo: "contorno", pontos: pts, liso: flags };
}

// Igual a contornosEmMm, mas com círculos e splines (em mm, y para cima, centro na origem).
export function contornosCurvosEmMm(
  m: Mascara,
  larguraMm: number,
  tolPx = 1,
  comCurvas = true,
  areaMinPx = 12,
  referencia?: { x0: number; x1: number; y0: number; y1: number },
  mmPorPixelFixo?: number, // escala pelo marcador (então larguraMm não conta)
): { lacos: LacoCurvo[]; alturaMm: number; mmPorPixel: number; centroPx: Pt; caixaPx: { x0: number; x1: number; y0: number; y1: number } } {
  const brutos = lacosDaMascara(m).filter((l) => Math.abs(areaLaco(l)) >= areaMinPx);
  if (!brutos.length) throw new Error("Não achei a peça na imagem (tente mudar o limiar ou escuro/claro)");
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of brutos)
    for (const [x, y] of l) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  // "referencia": a escala e o centro de outra camada (alturas pelo tom usam a da base).
  const caixa = referencia ?? { x0, x1, y0, y1 };
  const k = mmPorPixelFixo ?? larguraMm / Math.max(1, caixa.x1 - caixa.x0);
  const cx = (caixa.x0 + caixa.x1) / 2, cy = (caixa.y0 + caixa.y1) / 2;
  const mm = ([x, y]: Pt): Pt => [+((x - cx) * k).toFixed(4), +((cy - y) * k).toFixed(4)];
  const lacos = brutos.map((l) => {
    const c = curvasDoLaco(l, tolPx, comCurvas);
    return c.tipo === "circulo" ? { ...c, centro: mm(c.centro), raio: +(c.raio * k).toFixed(4) } : { ...c, pontos: c.pontos.map(mm) };
  });
  return { lacos, alturaMm: (caixa.y1 - caixa.y0) * k, mmPorPixel: k, centroPx: [cx, cy], caixaPx: caixa };
}

// Alturas pelo tom: k-médias em 1D nos tons de cinza dos pixels opacos.
// Devolve os limiares entre os n+1 grupos (fundo + n níveis), do escuro ao claro.
export function limiaresDeNiveis(rgba: Uint8ClampedArray, n: number): number[] {
  const tons: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] >= 128) tons.push(Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]));
  const hist = new Array(256).fill(0);
  for (const t of tons) hist[t]++;
  const k = n + 1;
  let centros = Array.from({ length: k }, (_, i) => (255 * (i + 0.5)) / k);
  for (let it = 0; it < 50; it++) {
    const soma = new Array(k).fill(0), cont = new Array(k).fill(0);
    for (let t = 0; t < 256; t++) {
      if (!hist[t]) continue;
      let j = 0;
      for (let q = 1; q < k; q++) if (Math.abs(t - centros[q]) < Math.abs(t - centros[j])) j = q;
      soma[j] += t * hist[t];
      cont[j] += hist[t];
    }
    const novos = centros.map((c, j) => (cont[j] ? soma[j] / cont[j] : c));
    if (novos.every((c, j) => Math.abs(c - centros[j]) < 0.01)) break;
    centros = novos;
  }
  centros.sort((a, b) => a - b);
  return centros.slice(0, -1).map((c, i) => Math.floor((c + centros[i + 1]) / 2));
}

// ---- Marcador HAXYS (referência de medidas) ----
// Quadrado escuro de 40 mm com um quadrado claro de 20 mm no meio (folha
// public/referencia/folha-referencia.svg ou o bloco de duas cores). Na máscara
// (peça = escuro) ele aparece como um laço quase quadrado com um furo quase
// quadrado, concêntrico, com 1/4 da área. Devolve o tamanho de 1 pixel em mm
// e a caixa dele (para tirar da peça).
export const MARCADOR_MM = 40;

function quadrado(l: Pt[]): { lado: number; centro: Pt } | null {
  const q = simplificar(l, Math.max(1.5, Math.sqrt(Math.abs(areaLaco(l))) * 0.04));
  if (q.length !== 4) return null;
  const lados = q.map((p, i) => Math.hypot(q[(i + 1) % 4][0] - p[0], q[(i + 1) % 4][1] - p[1]));
  const media = lados.reduce((s, x) => s + x, 0) / 4;
  if (lados.some((x) => Math.abs(x - media) > 0.12 * media)) return null;
  // Cantos perto de 90°: as duas diagonais quase iguais.
  const d1 = Math.hypot(q[2][0] - q[0][0], q[2][1] - q[0][1]), d2 = Math.hypot(q[3][0] - q[1][0], q[3][1] - q[1][1]);
  if (Math.abs(d1 - d2) > 0.1 * Math.max(d1, d2)) return null;
  return { lado: media, centro: [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4] };
}

export function acharMarcador(m: Mascara): { mmPorPixel: number; caixa: [number, number, number, number]; ladoPx: number } | null {
  const lacos = lacosDaMascara(m).filter((l) => Math.abs(areaLaco(l)) >= 64);
  const quads = lacos.map((l) => ({ l, q: quadrado(l), a: Math.abs(areaLaco(l)) })).filter((x) => x.q);
  let melhor: { lado: number; centro: Pt } | null = null;
  for (const fora of quads)
    for (const dentro of quads) {
      if (fora === dentro) continue;
      const razao = dentro.a / fora.a;
      const longe = Math.hypot(fora.q!.centro[0] - dentro.q!.centro[0], fora.q!.centro[1] - dentro.q!.centro[1]);
      if (razao > 0.17 && razao < 0.33 && longe < 0.08 * fora.q!.lado && (!melhor || fora.q!.lado > melhor.lado)) melhor = fora.q;
    }
  if (!melhor) return null;
  const meio = melhor.lado / 2 + 3; // folga de 3 px em volta (borda serrilhada)
  return {
    mmPorPixel: MARCADOR_MM / melhor.lado,
    ladoPx: melhor.lado,
    caixa: [melhor.centro[0] - meio, melhor.centro[1] - meio, melhor.centro[0] + meio, melhor.centro[1] + meio],
  };
}

// Tira da máscara tudo o que está dentro da caixa (o marcador não é peça).
export function semMarcador(m: Mascara, caixa: [number, number, number, number]): Mascara {
  const dentro = m.dentro.slice();
  const [x0, y0, x1, y1] = caixa.map(Math.round);
  for (let y = Math.max(0, y0); y < Math.min(m.altura, y1); y++)
    for (let x = Math.max(0, x0); x < Math.min(m.largura, x1); x++) dentro[y * m.largura + x] = 0;
  return { ...m, dentro };
}
