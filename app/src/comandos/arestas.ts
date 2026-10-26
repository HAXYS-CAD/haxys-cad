// Comandos Arredondamento e Chanfro (painel Modificar).
// Usa as arestas e faces selecionadas (face = todas as arestas dela).
// Com a janela aberta, clicar em mais arestas soma; Ctrl + clique retira.
// Chanfro: Distância igual, Duas distâncias ou Distância e ângulo (a primeira
// distância vale na face de referência: a mais deitada ou a mais em pé).
// Arredondamento: raio constante ou variável (do começo ao fim da aresta).
// A cadeia tangente é sempre seguida (o OpenCascade não deixa desligar).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Operacao, Referencia } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Selecao } from "../vista/selecao";

type Tipo = "arredondamento" | "chanfro";

export const COMANDOS_ARESTAS: Record<string, Tipo> = {
  FusionFilletEdgesCommand: "arredondamento",
  FusionChamferCommand: "chanfro",
};

let ativo: { dialogo: Dialogo; aoSelecao: (itens: ItemSelecionado[]) => void } | null = null;

// Chamado pela tela sempre que a seleção muda.
export function selecaoMudou(itens: ItemSelecionado[]) {
  ativo?.aoSelecao(itens);
}

function paraReferencias(itens: ItemSelecionado[]): Referencia[] {
  return itens
    .filter((i): i is ItemSelecionado & { tipo: "aresta" | "face" } => i.tipo !== "corpo")
    .map((i) => ({ corpo: i.corpo, tipo: i.tipo, indice: i.indice }));
}

function textoSelecao(refs: Referencia[]): string {
  if (refs.length === 0) return "Nenhuma — clique nas arestas";
  const a = refs.filter((r) => r.tipo === "aresta").length;
  const f = refs.length - a;
  return [a && `${a} aresta${a > 1 ? "s" : ""}`, f && `${f} face${f > 1 ? "s" : ""}`]
    .filter(Boolean)
    .join(" + ");
}

export function comandoArestas(
  raiz: HTMLElement,
  projeto: Projeto,
  selecao: Selecao,
  tipo: Tipo,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const base = tipo === "arredondamento" ? "Arredondamento" : "Chanfro";
  const nome = existente?.nome ?? projeto.proximoNome(base);
  const chave = tipo === "arredondamento" ? "raio" : "distancia";
  // Ao editar, as arestas ficam as da operação (a seleção atual é de outro momento).
  let refs = existente?.referencias ?? paraReferencias(selecao.itens());

  let opcoes: Record<string, string> = existente?.opcoes ?? {};
  const montar = (params: Record<string, number>): Operacao => ({
    id,
    tipo,
    nome,
    modo: "unir",
    params,
    opcoes,
    referencias: refs,
    suprimida: existente?.suprimida,
  });

  let valores: Record<string, number> = {};
  const fechar = () => {
    ativo = null;
    selecao.definirSempreSomar(false);
    selecao.limpar();
  };
  if (!existente) selecao.definirSempreSomar(true);
  const dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : base,
    campos: [
      {
        chave,
        rotulo: tipo === "arredondamento" ? "Raio" : "Distância",
        valor: existente?.params[chave] ?? (tipo === "arredondamento" ? 2 : 1),
      },
      ...(tipo === "arredondamento" ? [{ chave: "raio2", rotulo: "Raio final (variável)", valor: existente?.params.raio2 ?? 4 }] : []),
      ...(tipo === "chanfro"
        ? [
            { chave: "distancia2", rotulo: "Distância 2 (Duas distâncias)", valor: existente?.params.distancia2 ?? 1 },
            { chave: "angulo", rotulo: "Ângulo (Distância e ângulo)", valor: existente?.params.angulo ?? 45, unidade: "°" },
          ]
        : []),
    ],
    escolhas:
      tipo === "arredondamento"
        ? [
            { chave: "tipoRaio", rotulo: "Tipo de raio", opcoes: [["constante", "Constante"], ["variavel", "Variável"]], valor: opcoes.tipoRaio ?? "constante" },
          ]
        : tipo === "chanfro"
        ? [
            { chave: "tipoChanfro", rotulo: "Tipo de chanfro", opcoes: [["igual", "Distância igual"], ["duas", "Duas distâncias"], ["angulo", "Distância e ângulo"]], valor: opcoes.tipoChanfro ?? "igual" },
            { chave: "faceReferencia", rotulo: "1ª distância na face", opcoes: [["horizontal", "Mais deitada"], ["vertical", "Mais em pé"]], valor: opcoes.faceReferencia ?? "horizontal" },
          ]
        : undefined,
    modo: "unir",
    semModo: true,
    selecao: textoSelecao(refs),
    aoMudar: (params, _modo, esc) => {
      valores = params;
      opcoes = esc;
      projeto.previsualizar(refs.length ? montar(params) : null);
    },
    aoOK: (params, _modo, esc) => {
      opcoes = esc;
      fechar();
      if (!refs.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar(params));
      else projeto.adicionar(montar(params));
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  ativo = existente
    ? null // editar: só muda a medida
    : {
        dialogo,
        aoSelecao: (itens) => {
          refs = paraReferencias(itens);
          dialogo.definirSelecao(textoSelecao(refs));
          projeto.previsualizar(refs.length ? montar(valores) : null);
        },
      };
}
