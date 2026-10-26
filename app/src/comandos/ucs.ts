// Sistema de coordenadas do usuário (UCS): uma origem nova (X, Y, Z) girada em
// volta de Y (vertical). Cria 3 planos e 3 eixos de construção no lugar, que
// servem para esboçar, dividir, espelhar por eixo etc.
// Diferença do Fusion: o UCS do Fusion é um objeto só (com setas na tela) e
// pode girar em qualquer direção; aqui são 6 itens de construção comuns e o
// giro é só em volta do eixo vertical.
import { abrirDialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { V3 } from "../nucleo/esboco";

export function criarUCS(projeto: Projeto, origem: V3, giroY: number): string[] {
  const a = (giroY * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // Eixos girados em volta de Y.
  const X: V3 = [c, 0, -s], Y: V3 = [0, 1, 0], Z: V3 = [s, 0, c];
  const base = projeto.proximoNome("UCS");
  const ops: Operacao[] = [
    { id: crypto.randomUUID(), tipo: "plano", nome: `${base} XY`, modo: "novo", params: { distancia: 0 }, planoBase: { nome: "XY", origem, eixoX: X, normal: Z } },
    { id: crypto.randomUUID(), tipo: "plano", nome: `${base} XZ`, modo: "novo", params: { distancia: 0 }, planoBase: { nome: "XZ", origem, eixoX: X, normal: Y } },
    { id: crypto.randomUUID(), tipo: "plano", nome: `${base} YZ`, modo: "novo", params: { distancia: 0 }, planoBase: { nome: "YZ", origem, eixoX: [-Z[0], -Z[1], -Z[2]], normal: X } },
    { id: crypto.randomUUID(), tipo: "eixo", nome: `${base} eixo X`, modo: "novo", params: {}, eixoConstrucao: { origem, direcao: X } },
    { id: crypto.randomUUID(), tipo: "eixo", nome: `${base} eixo Y`, modo: "novo", params: {}, eixoConstrucao: { origem, direcao: Y } },
    { id: crypto.randomUUID(), tipo: "eixo", nome: `${base} eixo Z`, modo: "novo", params: {}, eixoConstrucao: { origem, direcao: Z } },
  ];
  for (const op of ops) projeto.adicionar(op);
  return ops.map((o) => o.nome);
}

export function comandoUCS(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  abrirDialogo(raiz, {
    titulo: "Sistema de coordenadas do usuário (UCS)",
    campos: [
      { chave: "x", rotulo: "Origem X", valor: 0 },
      { chave: "y", rotulo: "Origem Y", valor: 0 },
      { chave: "z", rotulo: "Origem Z", valor: 0 },
      { chave: "giro", rotulo: "Girar em volta de Y", valor: 0, unidade: "°" },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: () => {},
    aoCancelar: () => {},
    aoOK: (v) => {
      const nomes = criarUCS(projeto, [v.x ?? 0, v.y ?? 0, v.z ?? 0], v.giro ?? 0);
      avisar(`Criados: ${nomes.join(", ")}`);
    },
  });
}
