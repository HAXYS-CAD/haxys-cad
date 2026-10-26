// Alto-relevo (painel Criar): escolha perfis (regiões laranja) de um esboço
// que fica de frente para a peça. Relevo = cresce para fora; Gravar = entra na
// peça. A face (plana ou cilíndrica) é achada sozinha: a primeira que o perfil
// encontra seguindo a normal do esboço.
// Diferença do Fusion: o desenho é projetado na face (não enrolado no cilindro).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import { EscolhaDePerfis, type PerfilVisivel } from "./extrusao";

export const COMANDO_ALTO_RELEVO = "EmbossCmd";

export function comandoAltoRelevo(
  raiz: HTMLElement,
  projeto: Projeto,
  perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("AltoRelevo");
  const escolha = new EscolhaDePerfis(existente?.perfis, perfisVisiveis());
  let ultimo = { params: existente?.params ?? {}, opcoes: existente?.opcoes ?? {} } as { params: Record<string, number>; opcoes: Record<string, string> };
  const montar = (): Operacao => ({
    id,
    tipo: "altoRelevo",
    nome,
    modo: "unir",
    params: ultimo.params,
    opcoes: ultimo.opcoes,
    perfis: escolha.dados(),
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(escolha.indices.length ? montar() : null);
  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };
  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Alto-relevo",
    campos: [{ chave: "profundidade", rotulo: "Profundidade", valor: existente?.params.profundidade ?? 1 }],
    escolhas: [{ chave: "tipo", rotulo: "Tipo", opcoes: [["relevo", "Relevo (cresce)"], ["gravar", "Gravar (entra)"]], valor: existente?.opcoes?.tipo ?? "relevo" }],
    modo: "unir",
    semModo: true,
    selecao: escolha.indices.length ? escolha.texto() : "Clique nas regiões do esboço",
    rotuloSelecao: "Perfis",
    aoMudar: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      mostrarPrevia();
    },
    aoOK: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      fechar();
      if (!escolha.indices.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else {
        projeto.adicionar(montar());
        aoTerminar(escolha.esboco);
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
      escolha.alternar(e, i);
      dialogo.definirSelecao(escolha.indices.length ? escolha.texto() : "Clique nas regiões do esboço");
      redesenhar();
      mostrarPrevia();
    },
  });
  redesenhar();
}
