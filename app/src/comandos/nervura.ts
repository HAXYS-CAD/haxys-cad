// Nervura (painel Criar): clique em linhas retas de um esboço desenhado de lado
// (o plano do esboço corta a peça). Cada linha vira uma parede com a espessura
// dada (metade para cada lado do plano), que vai da linha até encostar no corpo;
// as pontas da linha também se esticam até o corpo. Clicar de novo tira a linha.
// "Profundidade" 0 = até o corpo; outro valor = parede com essa altura.
// Diferenças do Fusion, por enquanto: só linhas retas (não arcos), espessura
// só simétrica, sem a opção "normal ao esboço" (a parede fica sempre no plano).
// Teia (mesma janela): a parede fica em pé e cresce pela normal do esboço até
// o corpo (esboço acima da peça, linhas cruzando por cima dela).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import type { PerfilVisivel } from "./extrusao";

export const COMANDO_NERVURA = "FusionRibCommand";
export const COMANDO_TEIA = "FusionWebCommand";

export function comandoNervura(
  raiz: HTMLElement,
  projeto: Projeto,
  _perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
  teia = existente?.tipo === "teia",
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome(teia ? "Teia" : "Nervura");
  let linhas = existente?.caminho ? structuredClone(existente.caminho) : null;
  let ultimo: { params: Record<string, number>; opcoes: Record<string, string> } = {
    params: existente?.params ?? {},
    opcoes: existente?.opcoes ?? {},
  };

  const texto = () => (linhas?.curvas.length ? `${linhas.curvas.length} linha(s)` : "Nenhuma — clique em linhas retas do esboço");
  const montar = (): Operacao => ({
    id,
    tipo: teia ? "teia" : "nervura",
    nome,
    modo: "unir",
    params: ultimo.params,
    opcoes: ultimo.opcoes,
    caminho: structuredClone(linhas!),
    suprimida: existente?.suprimida,
  });
  const pronto = () => !!linhas?.curvas.length;
  const mostrarPrevia = () => projeto.previsualizar(pronto() ? montar() : null);
  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : teia ? "Teia" : "Nervura",
    campos: [
      { chave: "espessura", rotulo: "Espessura", valor: existente?.params.espessura ?? 3 },
      { chave: "profundidade", rotulo: "Profundidade (0 = até o corpo)", valor: existente?.params.profundidade ?? 0 },
    ],
    escolhas: [
      { chave: "lado", rotulo: "Direção", opcoes: [["auto", "Automática"], ["inverter", "Inverter"]], valor: ultimo.opcoes.lado ?? "auto" },
    ],
    modo: "unir",
    semModo: true,
    selecao: texto(),
    rotuloSelecao: "Curvas",
    aoMudar: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      mostrarPrevia();
    },
    aoOK: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      fechar();
      if (!pronto()) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else {
        projeto.adicionar(montar());
        aoTerminar(linhas!.esboco);
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
    linhaEscolhida: (e, c) => linhas?.esboco === e && linhas.curvas.includes(c),
    aoClicarLinha(e, c) {
      if (existente) return true;
      const curva = projeto.estado.historico.find((o) => o.id === e)?.esboco?.curvas.find((x) => x.id === c);
      if (curva?.tipo !== "linha") return true; // só linhas retas
      if (!linhas || linhas.esboco !== e) linhas = { esboco: e, curvas: [] };
      const k = linhas.curvas.indexOf(c);
      if (k >= 0) linhas.curvas.splice(k, 1);
      else linhas.curvas.push(c);
      dialogo.definirSelecao(texto());
      redesenhar();
      mostrarPrevia();
      return true;
    },
  });
  redesenhar();
}
