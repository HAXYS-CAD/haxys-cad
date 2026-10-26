// Comando Revolução (painel Criar). Escolha o perfil (região laranja) e o eixo:
// um eixo da origem (X, Y, Z) na lista, ou clique numa linha reta de um esboço.
// Direção: Um lado, Simétrico (o ângulo é o total) ou Dois lados (segundo
// ângulo), como no Fusion. Diferença: sem usar aresta de corpo como eixo.
import { abrirDialogo } from "../ui/dialogo";
import type { Eixo, Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";
import { EscolhaDePerfis, type PerfilVisivel } from "./extrusao";

const OPCOES_ORIGEM: [string, string][] = [
  ["Y", "Eixo Y (vertical)"],
  ["X", "Eixo X"],
  ["Z", "Eixo Z"],
];

export function comandoRevolucao(
  raiz: HTMLElement,
  projeto: Projeto,
  perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Revolução");
  const escolha = new EscolhaDePerfis(existente?.perfis, perfisVisiveis());
  let eixo: Eixo = existente?.eixo ?? { tipo: "origem", eixo: "Y" };

  // Eixos de construção que vêm antes desta operação.
  const eixosConstrucao: [string, string][] = [];
  for (const o of projeto.estado.historico) {
    if (o.id === id) break;
    if (o.tipo === "eixo" && !o.suprimida) eixosConstrucao.push([`op:${o.id}`, o.nome]);
  }
  const opcoesEixo = (): [string, string][] => [
    ...OPCOES_ORIGEM,
    ...eixosConstrucao,
    ...(eixo.tipo === "linha" ? ([["linha", "Linha do esboço"]] as [string, string][]) : []),
  ];
  const valorEixo = () => (eixo.tipo === "linha" ? "linha" : eixo.tipo === "construcao" ? `op:${eixo.op}` : eixo.eixo);

  let opcoes: Record<string, string> = { extensao: existente?.opcoes?.extensao ?? "um" };
  const montar = (params: Record<string, number>, modo: Operacao["modo"]): Operacao => ({
    id,
    tipo: "revolucao",
    nome,
    modo,
    params,
    opcoes,
    perfis: escolha.dados(),
    eixo,
    suprimida: existente?.suprimida,
  });

  let ultimo: { params: Record<string, number>; modo: Operacao["modo"] } = { params: {}, modo: "novo" };
  const mostrarPrevia = () =>
    projeto.previsualizar(escolha.indices.length ? montar(ultimo.params, ultimo.modo) : null);

  // Lista de eixos: escolher X/Y/Z troca o eixo; "linha" fica até clicar noutra.
  const lerEixo = (escolhas: Record<string, string>) => {
    opcoes = { extensao: escolhas.extensao ?? "um" };
    const v = escolhas.eixo;
    if (v === "X" || v === "Y" || v === "Z") eixo = { tipo: "origem", eixo: v };
    else if (v.startsWith("op:")) eixo = { tipo: "construcao", op: v.slice(3) };
  };

  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Revolução",
    campos: [
      { chave: "angulo", rotulo: "Ângulo", valor: existente?.params.angulo ?? 360, unidade: "°" },
      { chave: "angulo2", rotulo: "Ângulo (lado 2)", valor: existente?.params.angulo2 ?? 90, unidade: "°" },
    ],
    escolhas: [
      { chave: "eixo", rotulo: "Eixo", opcoes: opcoesEixo(), valor: valorEixo() },
      { chave: "extensao", rotulo: "Direção", opcoes: [["um", "Um lado"], ["simetrico", "Simétrico"], ["doisLados", "Dois lados"]], valor: existente?.opcoes?.extensao ?? "um" },
    ],
    modo: existente?.modo ?? (projeto.estado.corposBase.length ? "unir" : "novo"),
    selecao: escolha.texto(),
    rotuloSelecao: "Perfis",
    aoMudar: (params, modo, escolhas) => {
      lerEixo(escolhas);
      ultimo = { params, modo };
      redesenhar();
      mostrarPrevia();
    },
    aoOK: (params, modo, escolhas) => {
      lerEixo(escolhas);
      fechar();
      if (!escolha.indices.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar(params, modo));
      else {
        projeto.adicionar(montar(params, modo));
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
      dialogo.definirSelecao(escolha.texto());
      redesenhar();
      mostrarPrevia();
    },
    linhaEscolhida: (e, c) => eixo.tipo === "linha" && eixo.esboco === e && eixo.curva === c,
    aoClicarLinha(e, c) {
      // O eixo precisa ser uma linha reta.
      const curva = projeto.estado.historico.find((o) => o.id === e)?.esboco?.curvas.find((x) => x.id === c);
      if (curva?.tipo !== "linha") return false;
      eixo = { tipo: "linha", esboco: e, curva: c };
      dialogo.definirEscolha("eixo", "linha", opcoesEixo());
      redesenhar();
      mostrarPrevia();
      return true;
    },
  });
  redesenhar();
}
