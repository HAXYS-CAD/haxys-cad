// Inserir DXF e SVG: lê o arquivo e devolve formas 2D (em mm), que viram um
// esboço. Pontas iguais são juntadas, então contornos fechados viram perfis.
// DXF: LINE, CIRCLE, ARC, LWPOLYLINE/POLYLINE (com "bulge" = arco), SPLINE
// (vira linhas), ELLIPSE (inteira = elipse; pedaço = linhas), POINT.
// SVG: path (M L H V C S Q T A Z), rect, circle, ellipse, line, polyline,
// polygon, com as transformações do arquivo. Curvas viram linhas curtas,
// menos círculos/elipses inteiros. O eixo Y do SVG é invertido (para cima).
import type { DadosEsboco, P2, PlanoEsboco } from "./esboco";

export type Forma2D =
  | { tipo: "linha"; a: P2; b: P2 }
  | { tipo: "circulo"; c: P2; r: number }
  | { tipo: "arco"; c: P2; r: number; ini: number; fim: number } // radianos, anti-horário de ini até fim
  | { tipo: "elipse"; c: P2; ponta: P2; menor: number }
  | { tipo: "ponto"; p: P2 };

const PASSOS = 12; // pedaços retos por curva (Bézier/spline/arco de SVG)

function polilinha(pts: P2[], fechada: boolean): Forma2D[] {
  const out: Forma2D[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push({ tipo: "linha", a: pts[i], b: pts[i + 1] });
  if (fechada && pts.length > 2) out.push({ tipo: "linha", a: pts[pts.length - 1], b: pts[0] });
  return out.filter((f) => f.tipo !== "linha" || Math.hypot(f.a[0] - f.b[0], f.a[1] - f.b[1]) > 1e-9);
}

// Arco entre p1 e p2 com "bulge" (tangente de 1/4 do ângulo; positivo = anti-horário).
function arcoBulge(p1: P2, p2: P2, bulge: number): Forma2D {
  const ang = 4 * Math.atan(bulge);
  const corda = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const r = corda / (2 * Math.sin(Math.abs(ang) / 2));
  const meio: P2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const d = Math.sqrt(Math.max(r * r - (corda / 2) ** 2, 0)) * Math.sign(bulge) * (Math.abs(ang) > Math.PI ? -1 : 1);
  const u: P2 = [(p2[0] - p1[0]) / corda, (p2[1] - p1[1]) / corda];
  const c: P2 = [meio[0] - u[1] * d, meio[1] + u[0] * d];
  const a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
  return bulge > 0 ? { tipo: "arco", c, r, ini: a1, fim: a2 } : { tipo: "arco", c, r, ini: a2, fim: a1 };
}

// ---- DXF ----
export function lerDXF(texto: string): Forma2D[] {
  const linhas = texto.split(/\r?\n/);
  const pares: [number, string][] = [];
  for (let i = 0; i + 1 < linhas.length; i += 2) pares.push([parseInt(linhas[i].trim(), 10), linhas[i + 1].trim()]);
  const formas: Forma2D[] = [];
  let i = pares.findIndex(([c, v]) => c === 2 && v === "ENTITIES");
  if (i < 0) i = 0;
  // Junta os pares de cada entidade.
  const entidades: { tipo: string; g: [number, string][] }[] = [];
  for (; i < pares.length; i++) {
    const [c, v] = pares[i];
    if (c === 0) {
      if (v === "ENDSEC" && entidades.length) break;
      entidades.push({ tipo: v, g: [] });
    } else entidades[entidades.length - 1]?.g.push([c, v]);
  }
  const num = (g: [number, string][], c: number, padrao = 0) => {
    const p = g.find(([k]) => k === c);
    return p ? Number(p[1]) : padrao;
  };
  let poli: { pts: P2[]; bulges: number[]; fechada: boolean } | null = null;
  const fecharPoli = () => {
    if (!poli) return;
    const { pts, bulges, fechada } = poli;
    const n = fechada ? pts.length : pts.length - 1;
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], bu = bulges[k] ?? 0;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) continue;
      formas.push(Math.abs(bu) > 1e-9 ? arcoBulge(a, b, bu) : { tipo: "linha", a, b });
    }
    poli = null;
  };
  for (const e of entidades) {
    const g = e.g;
    if (e.tipo === "LINE") formas.push({ tipo: "linha", a: [num(g, 10), num(g, 20)], b: [num(g, 11), num(g, 21)] });
    else if (e.tipo === "CIRCLE") formas.push({ tipo: "circulo", c: [num(g, 10), num(g, 20)], r: num(g, 40) });
    else if (e.tipo === "ARC")
      formas.push({ tipo: "arco", c: [num(g, 10), num(g, 20)], r: num(g, 40), ini: (num(g, 50) * Math.PI) / 180, fim: (num(g, 51) * Math.PI) / 180 });
    else if (e.tipo === "POINT") formas.push({ tipo: "ponto", p: [num(g, 10), num(g, 20)] });
    else if (e.tipo === "LWPOLYLINE") {
      const pts: P2[] = [], bulges: number[] = [];
      for (const [c, v] of g) {
        if (c === 10) pts.push([Number(v), 0]), bulges.push(0);
        else if (c === 20 && pts.length) pts[pts.length - 1][1] = Number(v);
        else if (c === 42 && pts.length) bulges[pts.length - 1] = Number(v);
      }
      poli = { pts, bulges, fechada: (num(g, 70) & 1) === 1 };
      fecharPoli();
    } else if (e.tipo === "POLYLINE") poli = { pts: [], bulges: [], fechada: (num(g, 70) & 1) === 1 };
    else if (e.tipo === "VERTEX" && poli) {
      poli.pts.push([num(g, 10), num(g, 20)]);
      poli.bulges.push(num(g, 42));
    } else if (e.tipo === "SEQEND") fecharPoli();
    else if (e.tipo === "SPLINE") {
      // Usa os pontos de ajuste (11/21); sem eles, os de controle (10/20).
      const ajuste: P2[] = [], controle: P2[] = [];
      for (const [c, v] of g) {
        if (c === 11) ajuste.push([Number(v), 0]);
        else if (c === 21 && ajuste.length) ajuste[ajuste.length - 1][1] = Number(v);
        else if (c === 10) controle.push([Number(v), 0]);
        else if (c === 20 && controle.length) controle[controle.length - 1][1] = Number(v);
      }
      formas.push(...polilinha(ajuste.length >= 2 ? ajuste : controle, (num(g, 70) & 1) === 1));
    } else if (e.tipo === "ELLIPSE") {
      const c: P2 = [num(g, 10), num(g, 20)], eixo: P2 = [num(g, 11), num(g, 21)];
      const razao = num(g, 40, 1), t0 = num(g, 41, 0), t1 = num(g, 42, 2 * Math.PI);
      const maior = Math.hypot(eixo[0], eixo[1]);
      if (Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6 || (t0 === 0 && Math.abs(t1 - 2 * Math.PI) < 1e-6))
        formas.push({ tipo: "elipse", c, ponta: [c[0] + eixo[0], c[1] + eixo[1]], menor: maior * razao });
      else {
        const ey: P2 = [-eixo[1] * razao, eixo[0] * razao];
        const fim = t1 < t0 ? t1 + 2 * Math.PI : t1;
        const pts = Array.from({ length: PASSOS * 2 + 1 }, (_, k) => {
          const t = t0 + ((fim - t0) * k) / (PASSOS * 2);
          return [c[0] + eixo[0] * Math.cos(t) + ey[0] * Math.sin(t), c[1] + eixo[1] * Math.cos(t) + ey[1] * Math.sin(t)] as P2;
        });
        formas.push(...polilinha(pts, false));
      }
    }
  }
  fecharPoli();
  return formas;
}

// ---- SVG ----
// Lê o caminho "d" em subcaminhos (listas de pontos), com curvas em pedaços.
function pontosDoCaminho(d: string): { pts: P2[]; fechado: boolean }[] {
  const tk = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const lista: { pts: P2[]; fechado: boolean }[] = [];
  let atual: P2[] = [];
  let p: P2 = [0, 0], inicio: P2 = [0, 0], ultimoCtrl: P2 | null = null, ultimoCmd = "";
  let i = 0;
  const n = () => Number(tk[i++]);
  const fechar = (fechado: boolean) => {
    if (atual.length > 1) lista.push({ pts: atual, fechado });
    atual = [];
  };
  let cmd = "";
  while (i < tk.length) {
    if (/^[a-zA-Z]$/.test(tk[i])) cmd = tk[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const rp = (x: number, y: number): P2 => (rel ? [p[0] + x, p[1] + y] : [x, y]);
    if (C === "Z") {
      fechar(true);
      p = inicio;
      ultimoCtrl = null;
      ultimoCmd = "Z";
      continue;
    }
    if (C === "M") {
      fechar(false);
      p = rp(n(), n());
      inicio = p;
      atual = [p];
      cmd = rel ? "l" : "L"; // pares seguintes são linhas
    } else if (C === "L") {
      p = rp(n(), n());
      atual.push(p);
    } else if (C === "H") {
      p = [rel ? p[0] + n() : n(), p[1]];
      atual.push(p);
    } else if (C === "V") {
      p = [p[0], rel ? p[1] + n() : n()];
      atual.push(p);
    } else if (C === "C" || C === "S") {
      const c1: P2 = C === "C" ? rp(n(), n()) : ultimoCtrl && /[CS]/i.test(ultimoCmd) ? [2 * p[0] - ultimoCtrl[0], 2 * p[1] - ultimoCtrl[1]] : p;
      const c2 = rp(n(), n()), fim = rp(n(), n());
      for (let k = 1; k <= PASSOS; k++) {
        const t = k / PASSOS, u = 1 - t;
        atual.push([u * u * u * p[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * fim[0], u * u * u * p[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * fim[1]]);
      }
      ultimoCtrl = c2;
      p = fim;
    } else if (C === "Q" || C === "T") {
      const c1: P2 = C === "Q" ? rp(n(), n()) : ultimoCtrl && /[QT]/i.test(ultimoCmd) ? [2 * p[0] - ultimoCtrl[0], 2 * p[1] - ultimoCtrl[1]] : p;
      const fim = rp(n(), n());
      for (let k = 1; k <= PASSOS; k++) {
        const t = k / PASSOS, u = 1 - t;
        atual.push([u * u * p[0] + 2 * u * t * c1[0] + t * t * fim[0], u * u * p[1] + 2 * u * t * c1[1] + t * t * fim[1]]);
      }
      ultimoCtrl = c1;
      p = fim;
    } else if (C === "A") {
      let rx = Math.abs(n()), ry = Math.abs(n());
      const fi = (n() * Math.PI) / 180, grande = n(), varre = n();
      const fim = rp(n(), n());
      // Conversão do arco "por pontas" para centro (SVG 1.1, apêndice F.6).
      const cs = Math.cos(fi), sn = Math.sin(fi);
      const dx = (p[0] - fim[0]) / 2, dy = (p[1] - fim[1]) / 2;
      const x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
      const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
      if (lam > 1) (rx *= Math.sqrt(lam)), (ry *= Math.sqrt(lam));
      const sinal = grande === varre ? -1 : 1;
      const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
      const co = sinal * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
      const cx1 = (co * rx * y1) / ry, cy1 = (-co * ry * x1) / rx;
      const cx = cs * cx1 - sn * cy1 + (p[0] + fim[0]) / 2, cy = sn * cx1 + cs * cy1 + (p[1] + fim[1]) / 2;
      const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
      let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
      if (!varre && dt > 0) dt -= 2 * Math.PI;
      if (varre && dt < 0) dt += 2 * Math.PI;
      const passos = Math.max(4, Math.ceil((Math.abs(dt) / (2 * Math.PI)) * PASSOS * 4));
      for (let k = 1; k <= passos; k++) {
        const t = t1 + (dt * k) / passos;
        const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
        atual.push([cs * ex - sn * ey + cx, sn * ex + cs * ey + cy]);
      }
      p = fim;
    } else {
      i++; // comando desconhecido: pula
      continue;
    }
    if (!/[CSQT]/.test(C)) ultimoCtrl = null;
    ultimoCmd = C;
  }
  fechar(false);
  return lista;
}

// Lê o SVG no próprio navegador (para usar as transformações do arquivo).
export function lerSVG(texto: string): { formas: Forma2D[]; mmPorUnidade: number } {
  const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
  const raizSvg = doc.documentElement as unknown as SVGSVGElement;
  if (raizSvg.nodeName.toLowerCase() !== "svg") throw new Error("O arquivo não é um SVG");
  // Põe na página (escondido) para o navegador calcular as transformações.
  const caixa = document.createElement("div");
  caixa.style.cssText = "position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden";
  const svg = document.importNode(raizSvg, true) as SVGSVGElement;
  caixa.appendChild(svg);
  document.body.appendChild(caixa);
  try {
    // Escala: largura em mm e viewBox → mm por unidade; senão 96 pontos por polegada.
    const largura = svg.getAttribute("width") ?? "";
    const vb = svg.viewBox?.baseVal;
    let mmPorUnidade = 25.4 / 96;
    const m = /^([\d.]+)\s*(mm|cm|in|px|pt)?$/.exec(largura.trim());
    if (m && vb && vb.width) {
      const fator = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 }[m[2] ?? "px"] ?? 25.4 / 96;
      mmPorUnidade = (Number(m[1]) * fator) / vb.width;
    } else if (vb && vb.width && !largura) mmPorUnidade = 1; // só viewBox: 1 unidade = 1 mm
    const formas: Forma2D[] = [];
    const raizCTM = svg.getCTM();
    const inv = raizCTM ? raizCTM.inverse() : null;
    for (const el of Array.from(svg.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon")) as SVGGraphicsElement[]) {
      const ctm = el.getCTM();
      const mtx = ctm && inv ? inv.multiply(ctm) : ctm;
      const tr = (q: P2): P2 => {
        if (!mtx) return [q[0], -q[1]];
        const x = mtx.a * q[0] + mtx.c * q[1] + mtx.e, y = mtx.b * q[0] + mtx.d * q[1] + mtx.f;
        return [x, -y];
      };
      const escalaUniforme = mtx ? Math.sqrt(Math.abs(mtx.a * mtx.d - mtx.b * mtx.c)) : 1;
      const giroLivre = mtx ? Math.abs(mtx.b) < 1e-9 && Math.abs(mtx.c) < 1e-9 && Math.abs(Math.abs(mtx.a) - Math.abs(mtx.d)) < 1e-9 : true;
      const a = (n: string) => Number(el.getAttribute(n) ?? 0);
      const nome = el.nodeName.toLowerCase();
      if (nome === "circle" && giroLivre) formas.push({ tipo: "circulo", c: tr([a("cx"), a("cy")]), r: a("r") * escalaUniforme });
      else if (nome === "ellipse" && giroLivre) {
        const c = tr([a("cx"), a("cy")]);
        const ponta = tr([a("cx") + a("rx"), a("cy")]);
        formas.push({ tipo: "elipse", c, ponta, menor: a("ry") * escalaUniforme });
      } else if (nome === "line") formas.push({ tipo: "linha", a: tr([a("x1"), a("y1")]), b: tr([a("x2"), a("y2")]) });
      else if (nome === "rect") {
        const x = a("x"), y = a("y"), w = a("width"), h = a("height");
        formas.push(...polilinha([tr([x, y]), tr([x + w, y]), tr([x + w, y + h]), tr([x, y + h])], true));
      } else if (nome === "polyline" || nome === "polygon") {
        const v = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).map(Number);
        const pts: P2[] = [];
        for (let k = 0; k + 1 < v.length; k += 2) pts.push(tr([v[k], v[k + 1]]));
        formas.push(...polilinha(pts, nome === "polygon"));
      } else {
        // path, ou círculo/elipse girado/esticado: vira caminho.
        let d = el.getAttribute("d") ?? "";
        if (nome === "circle") d = `M ${a("cx") - a("r")} ${a("cy")} A ${a("r")} ${a("r")} 0 1 0 ${a("cx") + a("r")} ${a("cy")} A ${a("r")} ${a("r")} 0 1 0 ${a("cx") - a("r")} ${a("cy")} Z`;
        if (nome === "ellipse") d = `M ${a("cx") - a("rx")} ${a("cy")} A ${a("rx")} ${a("ry")} 0 1 0 ${a("cx") + a("rx")} ${a("cy")} A ${a("rx")} ${a("ry")} 0 1 0 ${a("cx") - a("rx")} ${a("cy")} Z`;
        for (const sub of pontosDoCaminho(d)) formas.push(...polilinha(sub.pts.map(tr), sub.fechado));
      }
    }
    return { formas, mmPorUnidade };
  } finally {
    caixa.remove();
  }
}

// Formas 2D → esboço (pontas juntadas). "escala" e "deslocamento" já em mm.
export function esbocoDasFormas(formas: Forma2D[], plano: PlanoEsboco, escala: number, desl: P2): DadosEsboco {
  const d: DadosEsboco = { plano, pontos: [{ id: 0, u: 0, v: 0 }], curvas: [], cotas: [] };
  const tr = (q: P2): P2 => [q[0] * escala + desl[0], q[1] * escala + desl[1]];
  const chave = (q: P2) => `${Math.round(q[0] * 1e4)},${Math.round(q[1] * 1e4)}`;
  const mapa = new Map<string, number>();
  const ponto = (q0: P2): number => {
    const q = tr(q0);
    const k = chave(q);
    let id = mapa.get(k);
    if (id === undefined) {
      id = d.pontos.length;
      d.pontos.push({ id, u: q[0], v: q[1] });
      mapa.set(k, id);
    }
    return id;
  };
  let idCurva = 1;
  for (const f of formas) {
    if (f.tipo === "linha") {
      const a = ponto(f.a), b = ponto(f.b);
      if (a !== b) d.curvas.push({ id: idCurva++, tipo: "linha", a, b });
    } else if (f.tipo === "circulo" && f.r > 0) d.curvas.push({ id: idCurva++, tipo: "circulo", centro: ponto(f.c), raio: f.r * escala });
    else if (f.tipo === "arco" && f.r > 0) {
      const em = (t: number): P2 => [f.c[0] + f.r * Math.cos(t), f.c[1] + f.r * Math.sin(t)];
      d.curvas.push({ id: idCurva++, tipo: "arco", centro: ponto(f.c), a: ponto(em(f.ini)), b: ponto(em(f.fim)) });
    } else if (f.tipo === "elipse" && f.menor > 0) d.curvas.push({ id: idCurva++, tipo: "elipse", centro: ponto(f.c), a: ponto(f.ponta), menor: f.menor * escala });
    else if (f.tipo === "ponto") ponto(f.p);
  }
  return d;
}
