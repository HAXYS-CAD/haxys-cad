// Tubulação (painel Criar): clique numa linha, arco ou spline de um esboço; as
// curvas ligadas ponta com ponta entram juntas (cadeia). O tubo é redondo, cheio
// ou oco (Parede > 0). Diferenças do Fusion, por enquanto: seção só redonda
// (o Fusion também tem quadrada e triangular), caminho só de esboço.
// Tubulação de superfície (aba SUPERFÍCIE): o mesmo tubo, só a parede de fora,
// sem tampas e sem volume.
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import { cadeiaDeCurvas } from "../nucleo/esboco";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import type { PerfilVisivel } from "./extrusao";

export const COMANDO_TUBULACAO = "PrimitivePipe";
export const COMANDO_TUBULACAO_SUPERFICIE = "SurfPrimitivePipe";

export function comandoTubulacao(
  raiz: HTMLElement,
  projeto: Projeto,
  _perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
  superficie = existente?.opcoes?.superficie === "sim",
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome(superficie ? "TubulaçãoSup" : "Tubulação");
  let caminho = existente?.caminho ? structuredClone(existente.caminho) : null;
  let ultimo: { params: Record<string, number>; modo: Operacao["modo"] } = {
    params: existente?.params ?? {},
    modo: existente?.modo ?? (projeto.estado.corposBase.length ? "unir" : "novo"),
  };
  const texto = () => (caminho ? `${caminho.curvas.length} curva(s)` : "Nenhum — clique numa linha/arco do esboço");
  const montar = (): Operacao => ({
    id,
    tipo: "tubulacao",
    nome,
    modo: superficie ? "novo" : ultimo.modo,
    ...(superficie ? { opcoes: { superficie: "sim" } } : {}),
    params: ultimo.params,
    caminho: structuredClone(caminho!),
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(caminho ? montar() : null);
  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Tubulação",
    campos: [
      { chave: "diametro", rotulo: "Diâmetro", valor: existente?.params.diametro ?? 10 },
      { chave: "espessura", rotulo: "Parede (0 = cheio)", valor: existente?.params.espessura ?? 0 },
    ],
    modo: ultimo.modo,
    selecao: texto(),
    rotuloSelecao: "Caminho",
    aoMudar: (params, modo) => {
      ultimo = { params, modo };
      mostrarPrevia();
    },
    aoOK: (params, modo) => {
      ultimo = { params, modo };
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
      if (!curvas.length) return true; // círculo/elipse não servem de caminho
      caminho = { esboco: e, curvas };
      dialogo.definirSelecao(texto());
      redesenhar();
      mostrarPrevia();
      return true;
    },
  });
  redesenhar();
}

// Mesma janela, para a Tubulação de superfície.
export const comandoTubulacaoSuperficie = (...a: Parameters<typeof comandoTubulacao>) => comandoTubulacao(a[0], a[1], a[2], a[3], a[4], a[5], true);
