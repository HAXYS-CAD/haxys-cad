// Transição / Loft (painel Criar): clique nos perfis (regiões laranja) de esboços
// diferentes, na ordem em que a peça deve passar por eles; clicar de novo tira.
// "Regrada" liga os perfis com faces retas em vez de curvas suaves.
// Diferenças do Fusion, por enquanto: sem trilhos/linha central, sem
// condições de tangência nas pontas, furos dos perfis são ignorados.
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import type { PerfilVisivel } from "./extrusao";

export const COMANDO_TRANSICAO = "SolidLoft";

export function comandoTransicao(
  raiz: HTMLElement,
  projeto: Projeto,
  _perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Transição");
  const secoes = structuredClone(existente?.secoes ?? []);
  let ultimo: { modo: Operacao["modo"]; opcoes: Record<string, string> } = {
    modo: existente?.modo ?? (projeto.estado.corposBase.length ? "unir" : "novo"),
    opcoes: existente?.opcoes ?? {},
  };
  const nomeEsboco = (idOp: string) => projeto.estado.historico.find((o) => o.id === idOp)?.nome ?? "?";
  const texto = () =>
    secoes.length ? secoes.map((s, i) => `${i + 1}) ${nomeEsboco(s.esboco)}`).join("  ") : "Nenhum — clique nos perfis em ordem";

  const montar = (): Operacao => ({
    id,
    tipo: "transicao",
    nome,
    modo: ultimo.modo,
    params: {},
    opcoes: ultimo.opcoes,
    secoes: structuredClone(secoes),
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(secoes.length >= 2 ? montar() : null);
  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Transição",
    campos: [],
    escolhas: [{ chave: "regrada", rotulo: "Regrada", opcoes: [["nao", "Não (suave)"], ["sim", "Sim (faces retas)"]], valor: ultimo.opcoes.regrada ?? "nao" }],
    modo: ultimo.modo,
    selecao: texto(),
    rotuloSelecao: "Perfis",
    aoMudar: (_p, modo, opcoes) => {
      ultimo = { modo, opcoes };
      mostrarPrevia();
    },
    aoOK: (_p, modo, opcoes) => {
      ultimo = { modo, opcoes };
      fechar();
      if (secoes.length < 2) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else {
        projeto.adicionar(montar());
        new Set(secoes.map((s) => s.esboco)).forEach(aoTerminar);
      }
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  definirEscolhedor({
    perfilEscolhido: (e, i) => secoes.some((s) => s.esboco === e && s.indice === i),
    aoClicarPerfil(e, i) {
      if (existente) return;
      const k = secoes.findIndex((s) => s.esboco === e && s.indice === i);
      if (k >= 0) secoes.splice(k, 1);
      else secoes.push({ esboco: e, indice: i });
      dialogo.definirSelecao(texto());
      redesenhar();
      mostrarPrevia();
    },
  });
  redesenhar();
}
