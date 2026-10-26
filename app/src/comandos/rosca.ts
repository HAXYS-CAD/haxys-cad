// Rosca (painel Criar): clique na face cilíndrica de uma haste (rosca externa)
// ou de um furo (rosca interna). Métrica ISO de passo grosso; o tamanho vem
// sozinho pelo diâmetro (no furo, pelo diâmetro da broca = D − passo).
// "Modelada" corta o sulco em hélice de verdade (bom para impressão 3D).
// Diferenças do Fusion: aqui "Modelada" já vem ligada (no Fusion vem
// desligada e a rosca só aparece desenhada); sem polegadas, sem passo fino,
// sem comprimento parcial (vale a face inteira).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Operacao, Referencia } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";

export const COMANDO_ROSCA = "FusionThreadCommand";

const TAMANHOS = ["1.6", "2", "2.5", "3", "4", "5", "6", "8", "10", "12", "14", "16", "20", "24", "30", "36"];

let ativo: { aoSelecao: (itens: ItemSelecionado[]) => void } | null = null;

export function selecaoMudouRosca(itens: ItemSelecionado[]) {
  ativo?.aoSelecao(itens);
}

const soFaces = (itens: ItemSelecionado[]): Referencia[] =>
  itens.filter((i) => i.tipo === "face").map((i) => ({ corpo: i.corpo, tipo: "face" as const, indice: i.indice }));

export function comandoRosca(raiz: HTMLElement, projeto: Projeto, selecao: Selecao, existente?: Operacao) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Rosca");
  let refs = existente?.referencias ?? soFaces(selecao.itens());
  let opcoes: Record<string, string> = existente?.opcoes ?? {};
  const prioridadeAntes: Prioridade = selecao.prioridade();
  const texto = () => (refs.length ? `${refs.length} face${refs.length > 1 ? "s" : ""}` : "Nenhuma — clique na face cilíndrica");

  const montar = (): Operacao => ({
    id,
    tipo: "rosca",
    nome,
    modo: "cortar",
    params: {},
    opcoes,
    referencias: refs,
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(refs.length ? montar() : null);
  const fechar = () => {
    ativo = null;
    selecao.definirSempreSomar(false);
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  if (!existente) {
    selecao.definirPrioridade("face");
    selecao.definirSempreSomar(true);
  }

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Rosca",
    campos: [],
    escolhas: [
      { chave: "tamanho", rotulo: "Tamanho", opcoes: [["auto", "Automático (pelo diâmetro)"], ...TAMANHOS.map((t) => [`M${t}`, `M${t.replace(".", ",")}`] as [string, string])], valor: opcoes.tamanho ?? "auto" },
      { chave: "modelada", rotulo: "Modelada", opcoes: [["sim", "Sim (corta a rosca)"], ["nao", "Não (só anotação)"]], valor: opcoes.modelada ?? "sim" },
      { chave: "mao", rotulo: "Sentido", opcoes: [["direita", "Direita"], ["esquerda", "Esquerda"]], valor: opcoes.mao ?? "direita" },
    ],
    modo: "cortar",
    semModo: true,
    selecao: texto(),
    rotuloSelecao: "Faces",
    aoMudar: (_p, _m, esc) => {
      opcoes = esc;
      mostrarPrevia();
    },
    aoOK: (_p, _m, esc) => {
      opcoes = esc;
      fechar();
      if (!refs.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else projeto.adicionar(montar());
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  ativo = existente
    ? null
    : {
        aoSelecao(itens) {
          refs = soFaces(itens);
          dialogo.definirSelecao(texto());
          mostrarPrevia();
        },
      };
}
