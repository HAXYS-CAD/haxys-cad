// Projetar no esboço: arestas de corpos (como listas de pontos 3D, vindas da
// malha da tela) viram curvas do esboço, achatadas no plano dele.
// Cada aresta projetada é reconhecida como linha, círculo ou arco; o resto
// (elipse, curva livre) vira uma sequência de linhas curtas.
// Os pontos novos ficam fixos, como a geometria projetada (roxa) do Fusion.
// Diferenças do Fusion, por enquanto: a cópia não acompanha mudanças do corpo
// (não é associativa) e o raio do círculo projetado não fica travado.
import { paraPlano, type CurvaEsboco, type DadosEsboco, type P2, type V3 } from "./esboco";

const MAX_LINHAS = 64; // curva livre: no máximo isto de linhas por aresta

function circuloPor3(a: P2, b: P2, c: P2): { centro: P2; raio: number } | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2;
  const centro: P2 = [
    (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d,
    (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d,
  ];
  return { centro, raio: Math.hypot(a[0] - centro[0], a[1] - centro[1]) };
}

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Devolve quantas curvas foram criadas.
export function projetarNoEsboco(d: DadosEsboco, polilinhas: V3[][]): number {
  d.restricoes ??= [];
  const novoId = (lista: { id: number }[]) => lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const criados = new Set<number>();
  // Reaproveita ponto que já está no lugar (as pontas das arestas vizinhas se ligam).
  const pontoEm = (q: P2): number => {
    const achado = d.pontos.find((p) => p.id !== 0 && Math.hypot(p.u - q[0], p.v - q[1]) < 1e-4);
    if (achado) return achado.id;
    const id = novoId(d.pontos);
    d.pontos.push({ id, u: q[0], v: q[1] });
    criados.add(id);
    return id;
  };
  let n = 0;
  // Não repete curva que já existe (projetar a mesma aresta duas vezes).
  const repetida = (c: CurvaEsboco) =>
    d.curvas.some((x) =>
      x.tipo === "linha" && c.tipo === "linha"
        ? (x.a === c.a && x.b === c.b) || (x.a === c.b && x.b === c.a)
        : x.tipo === "circulo" && c.tipo === "circulo"
          ? x.centro === c.centro && Math.abs(x.raio - c.raio) < 1e-4
          : x.tipo === "arco" && c.tipo === "arco" && x.centro === c.centro && x.a === c.a && x.b === c.b,
    );
  const juntar = (c: CurvaEsboco) => {
    if (repetida(c)) return;
    d.curvas.push(c);
    n++;
  };
  const linha = (a: P2, b: P2) => {
    if (dist(a, b) < 1e-6) return;
    juntar({ id: novoId(d.curvas), tipo: "linha", a: pontoEm(a), b: pontoEm(b) });
  };

  for (const poli of polilinhas) {
    const pts: P2[] = [];
    for (const w of poli) {
      const q = paraPlano(d.plano, w);
      if (!pts.length || dist(pts[pts.length - 1], q) > 1e-6) pts.push(q);
    }
    if (pts.length < 2) continue; // aresta em pé (vira um ponto): nada a desenhar
    const [ini, fim] = [pts[0], pts[pts.length - 1]];
    const fechada = pts.length > 3 && dist(ini, fim) < 1e-4;
    const tamanho = pts.reduce((s, p, i) => (i ? s + dist(p, pts[i - 1]) : 0), 0);
    if (tamanho < 1e-6) continue;
    const tol = 1e-3 + tamanho * 1e-5;

    // Reta: todos os pontos em cima do segmento início–fim.
    if (!fechada) {
      const L = dist(ini, fim);
      const u: P2 = [(fim[0] - ini[0]) / L, (fim[1] - ini[1]) / L];
      if (L > 1e-6 && pts.every((p) => Math.abs((p[0] - ini[0]) * u[1] - (p[1] - ini[1]) * u[0]) < tol)) {
        linha(ini, fim);
        continue;
      }
    }
    // Círculo/arco: todos os pontos à mesma distância de um centro.
    const k = pts.length;
    const c = k >= 3 ? circuloPor3(pts[0], pts[Math.floor(k / 3)], pts[Math.floor((2 * k) / 3)]) : null;
    if (c && pts.every((p) => Math.abs(dist(p, c.centro) - c.raio) < tol)) {
      const centro = pontoEm(c.centro);
      if (fechada) {
        juntar({ id: novoId(d.curvas), tipo: "circulo", centro, raio: c.raio });
      } else {
        // O arco do esboço vai no sentido anti-horário de "a" até "b".
        let giro = 0;
        for (let i = 1; i < k; i++) {
          const a0 = Math.atan2(pts[i - 1][1] - c.centro[1], pts[i - 1][0] - c.centro[0]);
          const a1 = Math.atan2(pts[i][1] - c.centro[1], pts[i][0] - c.centro[0]);
          let dg = a1 - a0;
          if (dg > Math.PI) dg -= 2 * Math.PI;
          if (dg < -Math.PI) dg += 2 * Math.PI;
          giro += dg;
        }
        const [a, b] = giro >= 0 ? [ini, fim] : [fim, ini];
        juntar({ id: novoId(d.curvas), tipo: "arco", centro, a: pontoEm(a), b: pontoEm(b) });
      }
      continue;
    }
    // Outra curva: linhas curtas (no máximo MAX_LINHAS).
    const passo = Math.max(1, Math.ceil((pts.length - 1) / MAX_LINHAS));
    let anterior = ini;
    for (let i = passo; i < pts.length; i += passo) {
      linha(anterior, pts[i]);
      anterior = pts[i];
    }
    if (dist(anterior, fim) > 1e-6) linha(anterior, fim);
  }
  for (const id of criados) d.restricoes.push({ id: novoId(d.restricoes), tipo: "fixo", ponto: id });
  return n;
}
