// Medir (painel Inspecionar). Clique em 1 item (corpo, face ou aresta) para ver
// volume/área/comprimento, ou em 2 itens para ver a distância mínima (e o ângulo,
// se forem faces planas ou arestas retas). As contas são exatas (OpenCascade).
// Com mais de 2 itens, vale o par dos 2 últimos clicados.
// Diferenças do Fusion, por enquanto: sem medir ponto/vértice, sem mostrar a
// linha da distância no 3D, sem escolher a precisão.
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Selecao } from "../vista/selecao";

export const COMANDO_MEDIR = "MeasureCommand";

let ativo: { aoSelecao: (itens: ItemSelecionado[]) => void } | null = null;

export function selecaoMudouMedir(itens: ItemSelecionado[]) {
  ativo?.aoSelecao(itens);
}

export function comandoMedir(raiz: HTMLElement, projeto: Projeto, selecao: Selecao) {
  let pedido = 0;
  const fechar = () => {
    ativo = null;
    selecao.definirSempreSomar(false);
    selecao.limpar();
  };
  selecao.definirSempreSomar(true);

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: "Medir",
    campos: [],
    modo: "novo",
    semModo: true,
    selecao: "Clique em 1 ou 2 itens (corpo, face ou aresta)",
    rotuloSelecao: "Resultado",
    aoMudar: () => {},
    aoOK: fechar,
    aoCancelar: fechar,
  });

  const medir = async (itens: ItemSelecionado[]) => {
    const par = itens.slice(-2);
    if (!par.length) return dialogo.definirSelecao("Clique em 1 ou 2 itens (corpo, face ou aresta)");
    const meu = ++pedido;
    dialogo.definirSelecao("Medindo…");
    try {
      const linhas = await projeto.medir(par.map((i) => ({ corpo: i.corpo, tipo: i.tipo, indice: i.indice })));
      if (meu === pedido) dialogo.definirSelecao(linhas.join("\n"));
    } catch (e) {
      if (meu === pedido) dialogo.definirSelecao(`Não deu para medir: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  ativo = { aoSelecao: medir };
  medir(selecao.itens());
}
