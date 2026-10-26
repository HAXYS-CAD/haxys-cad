// Texto no esboço: cada letra vira o contorno dela em linhas (as curvas da fonte
// são divididas em pedacinhos retos). Os contornos fecham, então dá para
// extrudar (letras com buraco, como "O" e "A", ficam com o furo).
// Fonte: Helvetiker (MgOpen, licença livre; vem com o three.js).
// Diferenças do Fusion, por enquanto: o texto vira linhas comuns (não dá para
// editar as letras depois), uma fonte só, sem acentos (ã → a, ç → c).
import fonte from "three/examples/fonts/helvetiker_regular.typeface.json";
import type { DadosEsboco, P2 } from "./esboco";

interface Glifo {
  ha: number;
  o?: string;
}
const GLIFOS = (fonte as unknown as { glyphs: Record<string, Glifo> }).glyphs;
const PASSOS_CURVA = 4; // pedaços retos por curva da fonte

// Contornos de uma letra (cada um é uma lista de pontos, sem repetir o 1º no fim).
function contornos(o: string): P2[][] {
  const t = o.trim().split(/\s+/);
  const lista: P2[][] = [];
  let atual: P2[] = [];
  let ultimo: P2 = [0, 0];
  const num = (i: number) => Number(t[i]);
  for (let i = 0; i < t.length; ) {
    const c = t[i++];
    if (c === "m") {
      if (atual.length) lista.push(atual);
      ultimo = [num(i), num(i + 1)];
      atual = [ultimo];
      i += 2;
    } else if (c === "l") {
      ultimo = [num(i), num(i + 1)];
      atual.push(ultimo);
      i += 2;
    } else if (c === "q") {
      // "q x y cx cy": fim e depois o controle.
      const fim: P2 = [num(i), num(i + 1)], cp: P2 = [num(i + 2), num(i + 3)];
      const ini = ultimo;
      for (let k = 1; k <= PASSOS_CURVA; k++) {
        const s = k / PASSOS_CURVA, u = 1 - s;
        atual.push([u * u * ini[0] + 2 * u * s * cp[0] + s * s * fim[0], u * u * ini[1] + 2 * u * s * cp[1] + s * s * fim[1]]);
      }
      ultimo = fim;
      i += 4;
    } else if (c === "b") {
      // "b x y c1x c1y c2x c2y": fim, controle 1, controle 2.
      const fim: P2 = [num(i), num(i + 1)], c1: P2 = [num(i + 2), num(i + 3)], c2: P2 = [num(i + 4), num(i + 5)];
      const ini = ultimo;
      for (let k = 1; k <= PASSOS_CURVA; k++) {
        const s = k / PASSOS_CURVA, u = 1 - s;
        const w = [u * u * u, 3 * u * u * s, 3 * u * s * s, s * s * s];
        atual.push([w[0] * ini[0] + w[1] * c1[0] + w[2] * c2[0] + w[3] * fim[0], w[0] * ini[1] + w[1] * c1[1] + w[2] * c2[1] + w[3] * fim[1]]);
      }
      ultimo = fim;
      i += 6;
    } else if (c === "z") {
      // fecha o contorno (já tratado ao juntar)
    }
  }
  if (atual.length) lista.push(atual);
  // Tira pontos repetidos e o último igual ao primeiro.
  return lista
    .map((pts) => {
      const limpo: P2[] = [];
      for (const p of pts) if (!limpo.length || Math.hypot(p[0] - limpo[limpo.length - 1][0], p[1] - limpo[limpo.length - 1][1]) > 1e-9) limpo.push(p);
      if (limpo.length > 1 && Math.hypot(limpo[0][0] - limpo[limpo.length - 1][0], limpo[0][1] - limpo[limpo.length - 1][1]) < 1e-9) limpo.pop();
      return limpo;
    })
    .filter((pts) => pts.length >= 3);
}

// Escreve o texto no esboço a partir de "origem" (canto de baixo à esquerda).
// "altura" = altura das letras maiúsculas (mm). Devolve quantas linhas criou.
export function escreverTexto(d: DadosEsboco, texto: string, origem: P2, altura: number): number {
  if (!(altura > 0)) throw new Error("A altura deve ser maior que zero");
  const limpo = texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!limpo.trim()) throw new Error("Digite o texto");
  const escala = altura / 1000; // a fonte tem 1000 unidades por "M"
  const novoId = (lista: { id: number }[]) => lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  let x = 0;
  let n = 0;
  for (const ch of limpo) {
    const g = GLIFOS[ch] ?? GLIFOS["?"];
    if (!g) continue;
    for (const contorno of contornos(g.o ?? "")) {
      const ids = contorno.map(([u, v]) => {
        const id = novoId(d.pontos);
        d.pontos.push({ id, u: origem[0] + (x + u) * escala, v: origem[1] + v * escala });
        return id;
      });
      for (let i = 0; i < ids.length; i++) {
        d.curvas.push({ id: novoId(d.curvas), tipo: "linha", a: ids[i], b: ids[(i + 1) % ids.length] });
        n++;
      }
    }
    x += g.ha;
  }
  return n;
}
