// Painel Selecionar: Inverter seleção, Selecionar por tamanho, por nome e
// Filtros de seleção. A seleção de janela é arrastando com o botão esquerdo
// (ver vista/selecao.ts); "forma livre" e "pintura" usam a mesma janela.
// Diferenças do Fusion, por enquanto: sem laço de forma livre nem pintura de
// verdade; "por tamanho" mede a diagonal da caixa em volta do corpo.
import { abrirDialogo } from "../ui/dialogo";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";
import type { MalhaCorpo } from "../nucleo/tipos";

export const COMANDOS_SELECIONAR = [
  "selectWindow", "selectFreeForm", "selectPaint", "SelectByInvertCommand",
  "FusionSelectBodiesBySizeCommand", "SelectByNameCommand", "SelectionFilterCommand",
];

function diagonal(c: MalhaCorpo): number {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < c.vertices.length; i += 3)
    for (let j = 0; j < 3; j++) (mn[j] = Math.min(mn[j], c.vertices[i + j])), (mx[j] = Math.max(mx[j], c.vertices[i + j]));
  return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
}

export function comandoSelecionar(id: string, raiz: HTMLElement, projeto: Projeto, selecao: Selecao, avisar: (t: string) => void) {
  const corpos = projeto.estado.corposBase;
  if (id === "selectWindow" || id === "selectFreeForm" || id === "selectPaint") {
    return avisar("Arraste com o botão esquerdo: para a direita pega o que fica todo dentro; para a esquerda, o que encosta.");
  }
  if (id === "SelectByInvertCommand") {
    const atuais = selecao.itens();
    const faces = atuais.filter((i) => i.tipo === "face");
    let novos: ItemSelecionado[];
    if (faces.length) {
      // Faces: as outras faces dos mesmos corpos.
      const nomes = [...new Set(faces.map((f) => f.corpo))];
      novos = nomes.flatMap((n) => {
        const c = corpos.find((x) => x.nome === n)!;
        return Array.from({ length: c.gruposFaces.length / 2 }, (_, f) => ({ corpo: n, tipo: "face" as const, indice: f })).filter(
          (it) => !faces.some((s) => s.corpo === it.corpo && s.indice === it.indice),
        );
      });
    } else {
      const tem = new Set(atuais.filter((i) => i.tipo === "corpo").map((i) => i.corpo));
      novos = corpos.filter((c) => !tem.has(c.nome)).map((c) => ({ corpo: c.nome, tipo: "corpo" as const, indice: -1 }));
    }
    selecao.definirItens(novos);
    return avisar(`${novos.length} item(ns) selecionado(s)`);
  }
  if (id === "FusionSelectBodiesBySizeCommand") {
    const maior = Math.max(1, ...corpos.map(diagonal));
    return abrirDialogo(raiz, {
      titulo: "Selecionar por tamanho",
      campos: [
        { chave: "min", rotulo: "Tamanho mínimo", valor: 0 },
        { chave: "max", rotulo: "Tamanho máximo", valor: +maior.toFixed(2) },
      ],
      modo: "novo",
      semModo: true,
      selecao: "Tamanho = diagonal da caixa em volta do corpo",
      rotuloSelecao: "Como mede",
      aoMudar: (v) => {
        const itens = corpos.filter((c) => diagonal(c) >= v.min - 1e-9 && diagonal(c) <= v.max + 1e-9).map((c) => ({ corpo: c.nome, tipo: "corpo" as const, indice: -1 }));
        selecao.definirItens(itens);
      },
      aoOK: () => avisar(`${selecao.itens().length} corpo(s) selecionado(s)`),
      aoCancelar: () => selecao.limpar(),
    });
  }
  if (id === "SelectByNameCommand") {
    if (!corpos.length) return avisar("Não há corpos.");
    return abrirDialogo(raiz, {
      titulo: "Selecionar por nome",
      campos: [],
      escolhas: [{ chave: "nome", rotulo: "Corpo", opcoes: corpos.map((c) => [c.nome, c.nome] as [string, string]), valor: corpos[0].nome }],
      modo: "novo",
      semModo: true,
      aoMudar: (_v, _m, esc) => selecao.definirItens([{ corpo: esc.nome, tipo: "corpo", indice: -1 }]),
      aoOK: () => {},
      aoCancelar: () => selecao.limpar(),
    });
  }
  if (id === "SelectionFilterCommand") {
    return abrirDialogo(raiz, {
      titulo: "Filtros de seleção",
      campos: [],
      escolhas: [
        {
          chave: "prioridade",
          rotulo: "O clique pega",
          opcoes: [["livre", "Aresta perto, senão face"], ["corpo", "Corpos"], ["face", "Faces"], ["aresta", "Arestas"]],
          valor: selecao.prioridade(),
        },
      ],
      modo: "novo",
      semModo: true,
      aoMudar: () => {},
      aoOK: (_v, _m, esc) => {
        selecao.definirPrioridade(esc.prioridade as Prioridade);
        avisar("Filtro de seleção trocado");
      },
      aoCancelar: () => {},
    });
  }
}
