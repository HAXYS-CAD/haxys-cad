// Varredura (painel Criar): leva um perfil (região laranja de um esboço) ao
// longo de um caminho (linha/arco de outro esboço; as curvas ligadas ponta com
// ponta entram juntas, como a "cadeia" do Fusion). O perfil deve ficar no
// começo do caminho, de preferência de frente para ele.
// Diferenças do Fusion, por enquanto: sem trilho guia, sem torção, sem
// "Distância" parcial, caminho só de esboço (não de arestas de corpo).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import { cadeiaDeCurvas } from "../nucleo/esboco";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import { EscolhaDePerfis, type PerfilVisivel } from "./extrusao";

export const COMANDO_VARREDURA = "Sweep";

export function comandoVarredura(
  raiz: HTMLElement,
  projeto: Projeto,
  perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Varredura");
  const escolha = new EscolhaDePerfis(existente?.perfis, []);
  let caminho = existente?.caminho ? structuredClone(existente.caminho) : null;
  let modo: Operacao["modo"] = existente?.modo ?? (projeto.estado.corposBase.length ? "unir" : "novo");
  void perfisVisiveis;

  const texto = () =>
    `${escolha.indices.length ? escolha.texto() : "clique numa região"} · Caminho: ${caminho ? `${caminho.curvas.length} curva(s)` : "clique numa linha/arco"}`;
  const pronto = () => escolha.indices.length > 0 && caminho !== null;
  const montar = (): Operacao => ({
    id,
    tipo: "varredura",
    nome,
    modo,
    params: {},
    perfis: escolha.dados(),
    caminho: caminho!,
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(pronto() ? montar() : null);
  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Varredura",
    campos: [],
    modo,
    selecao: texto(),
    rotuloSelecao: "Perfil",
    aoMudar: (_p, m) => {
      modo = m;
      mostrarPrevia();
    },
    aoOK: (_p, m) => {
      modo = m;
      fechar();
      if (!pronto()) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else {
        projeto.adicionar(montar());
        aoTerminar(escolha.esboco);
        if (caminho) aoTerminar(caminho.esboco);
      }
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  definirEscolhedor({
    perfilEscolhido: (e, i) => escolha.tem(e, i),
    aoClicarPerfil(e, i) {
      if (existente) return;
      // Varredura usa um perfil só: o novo clique troca.
      escolha.esboco = e;
      escolha.indices = [i];
      dialogo.definirSelecao(texto());
      redesenhar();
      mostrarPrevia();
    },
    linhaEscolhida: (e, c) => caminho?.esboco === e && caminho.curvas.includes(c),
    aoClicarLinha(e, c) {
      if (existente) return false;
      const dados = projeto.estado.historico.find((o) => o.id === e)?.esboco;
      const curvas = dados ? cadeiaDeCurvas(dados, c) : [];
      if (!curvas.length) return false; // círculo: não é caminho
      caminho = { esboco: e, curvas };
      dialogo.definirSelecao(texto());
      redesenhar();
      mostrarPrevia();
      return true;
    },
  });
  redesenhar();
}
