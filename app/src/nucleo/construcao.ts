// Geometria de construção: planos de deslocamento e o plano de uma face plana.
// Sem Three.js nem OpenCascade (usado pela tela e pelo worker).
import type { PlanoEsboco, V3 } from "./esboco";
import type { MalhaCorpo, Operacao } from "./tipos";

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const escala = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const normalizar = (a: V3): V3 => escala(a, 1 / (Math.hypot(...a) || 1));
const arred = (a: V3): V3 => a.map((x) => Math.round(x * 1e6) / 1e6) as V3;

// Plano de deslocamento = plano base andando "distancia" na direção da normal.
export function planoDeslocado(op: Operacao): PlanoEsboco | null {
  const b = op.planoBase;
  if (op.tipo !== "plano" || !b) return null;
  const d = op.params.distancia ?? 0;
  return { nome: op.nome, origem: arred([0, 1, 2].map((i) => b.origem[i] + b.normal[i] * d) as V3), eixoX: b.eixoX, normal: b.normal };
}

// Planos de construção do histórico (até a operação "ate", sem incluir).
export function planosDeConstrucao(historico: Operacao[], ate?: string): PlanoEsboco[] {
  const lista: PlanoEsboco[] = [];
  for (const op of historico) {
    if (op.id === ate) break;
    if (op.tipo === "plano" && !op.suprimida) {
      const p = planoDeslocado(op);
      if (p) lista.push(p);
    }
  }
  return lista;
}

// Plano de uma face da malha, se ela for plana (todos os triângulos com a mesma normal).
// Origem = origem do mundo projetada na face; eixo X = eixo do mundo mais "deitado" nela.
export function planoDaFace(c: MalhaCorpo, f: number): PlanoEsboco | null {
  const inicio = c.gruposFaces[f * 2], qtd = c.gruposFaces[f * 2 + 1];
  if (qtd === undefined) return null;
  const v = (i: number): V3 => [c.vertices[i * 3], c.vertices[i * 3 + 1], c.vertices[i * 3 + 2]];
  let n: V3 | null = null;
  let ponto: V3 | null = null;
  for (let i = inicio; i < inicio + qtd; i += 3) {
    const a = v(c.triangulos[i]), b = v(c.triangulos[i + 1]), d = v(c.triangulos[i + 2]);
    const ni = cross(sub(b, a), sub(d, a));
    if (Math.hypot(...ni) < 1e-12) continue;
    const nn = normalizar(ni);
    if (!n) (n = nn), (ponto = a);
    else if (dot(nn, n) < 0.9999) return null;
  }
  if (!n || !ponto) return null;
  const origem = escala(n, dot(n, ponto));
  const eixos: V3[] = [[1, 0, 0], [0, 0, -1], [0, 1, 0]];
  const ex = eixos.sort((p, q) => Math.abs(dot(p, n!)) - Math.abs(dot(q, n!)))[0];
  const eixoX = normalizar(sub(ex, escala(n, dot(ex, n))));
  return { nome: "Face", origem: arred(origem), eixoX: arred(eixoX), normal: arred(n) };
}
