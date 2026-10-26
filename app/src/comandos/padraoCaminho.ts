// Padrão no caminho (painel Criar → Padrão): cópias de um corpo ao longo de
// linhas/arcos/spline de um esboço (clique numa curva; a cadeia ligada vai
// junto). O corpo vem da lista. "Distância" 0 = espalha pelo caminho inteiro.
// "Orientação": iguais (só andam) ou acompanhando a curva (giram junto).
// Diferenças do Fusion, por enquanto: só corpos (não faces/operações), caminho
// só de esboço, a 1ª cópia fica onde o corpo já está (no começo do caminho).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import { cadeiaDeCurvas } from "../nucleo/esboco";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import type { PerfilVisivel } from "./extrusao";

export const COMANDO_PADRAO_CAMINHO = "PatternOnPath";

export function comandoPadraoCaminho(
  raiz: HTMLElement,
  projeto: Projeto,
  _perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("PadrãoCaminho");
  const corposLista = projeto.estado.corposBase.map((c) => [c.nome, c.nome] as [string, string]);
  if (!corposLista.length) return void alert("Não há corpos para copiar.");
  let caminho = existente?.caminho ? structuredClone(existente.caminho) : null;
  let ultimo = {
    params: existente?.params ?? {},
    opcoes: existente?.opcoes ?? {},
  } as { params: Record<string, number>; opcoes: Record<string, string> };
  const texto = () => (caminho ? `${caminho.curvas.length} curva(s)` : "Nenhum — clique numa linha/arco do esboço");
  const montar = (): Operacao => ({
    id,
    tipo: "padraoCaminho",
    nome,
    modo: "novo",
    params: ultimo.params,
    opcoes: ultimo.opcoes,
    corpos: [ultimo.opcoes.corpo ?? corposLista[0][0]],
    caminho: structuredClone(caminho!),
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(caminho ? montar() : null);
  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Padrão no caminho",
    campos: [
      { chave: "quantidade", rotulo: "Quantidade", valor: existente?.params.quantidade ?? 4, unidade: "" },
      { chave: "distancia", rotulo: "Distância (0 = tudo)", valor: existente?.params.distancia ?? 0 },
    ],
    escolhas: [
      { chave: "corpo", rotulo: "Corpo", opcoes: corposLista, valor: existente?.corpos?.[0] ?? corposLista[0][0] },
      { chave: "orientacao", rotulo: "Orientação", opcoes: [["igual", "Iguais (só andam)"], ["caminho", "Acompanham a curva"]], valor: existente?.opcoes?.orientacao ?? "igual" },
      { chave: "operacao", rotulo: "Operação", opcoes: [["novo", "Novos corpos"], ["unir", "Unir"]], valor: existente?.opcoes?.operacao ?? "novo" },
    ],
    modo: "novo",
    semModo: true,
    selecao: texto(),
    rotuloSelecao: "Caminho",
    aoMudar: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      mostrarPrevia();
    },
    aoOK: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      fechar();
      if (!caminho) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else {
        projeto.adicionar(montar());
        aoTerminar(caminho.esboco);
      }
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  definirEscolhedor({
    perfilEscolhido: () => false,
    aoClicarPerfil() {},
    linhaEscolhida: (e, c) => caminho?.esboco === e && caminho.curvas.includes(c),
    aoClicarLinha(e, c) {
      if (existente) return true;
      const dados = projeto.estado.historico.find((o) => o.id === e)?.esboco;
      const curvas = dados ? cadeiaDeCurvas(dados, c) : [];
      if (!curvas.length) return true;
      caminho = { esboco: e, curvas };
      dialogo.definirSelecao(texto());
      redesenhar();
      mostrarPrevia();
      return true;
    },
  });
  redesenhar();
}
