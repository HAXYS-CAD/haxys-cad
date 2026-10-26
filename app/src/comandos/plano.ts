// Plano de deslocamento (painel Construir): um plano paralelo a outro, a uma
// distância. Base = plano da origem, outro plano de construção ou uma face plana
// (clique na face com a janela aberta). Depois serve para Criar esboço.
// Diferença do Fusion, por enquanto: se a face de base mudar depois, o plano
// não acompanha (ele guarda a posição da face na hora em que foi criado).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import { PLANOS_ORIGEM, type PlanoEsboco } from "../nucleo/esboco";
import { planoDaFace, planoDeslocado } from "../nucleo/construcao";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";

export const COMANDO_PLANO = "ConstructionPlaneOffsetFromPlaneCommand";

let ativo: { aoSelecao: (itens: ItemSelecionado[]) => void } | null = null;

export function selecaoMudouPlano(itens: ItemSelecionado[]) {
  ativo?.aoSelecao(itens);
}

export function comandoPlano(raiz: HTMLElement, projeto: Projeto, selecao: Selecao, existente?: Operacao) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Plano");
  // Opções da lista: planos da origem e planos de construção que vêm antes.
  const bases = new Map<string, PlanoEsboco>();
  const opcoes: [string, string][] = [];
  if (existente?.planoBase) {
    bases.set("atual", existente.planoBase);
    opcoes.push(["atual", `Base atual (${existente.planoBase.nome})`]);
  }
  for (const [n, p] of Object.entries(PLANOS_ORIGEM)) {
    bases.set(n, p);
    opcoes.push([n, `Plano ${n} da origem`]);
  }
  for (const op of projeto.estado.historico) {
    if (op.id === id) break;
    const p = op.tipo === "plano" && !op.suprimida ? planoDeslocado(op) : null;
    if (p) (bases.set(`op:${op.id}`, p), opcoes.push([`op:${op.id}`, op.nome]));
  }
  let base = existente ? "atual" : "XZ";
  let distancia = existente?.params.distancia ?? 10;
  const prioridadeAntes: Prioridade = selecao.prioridade();

  const montar = (): Operacao => ({
    id,
    tipo: "plano",
    nome,
    modo: "novo",
    params: { distancia },
    planoBase: bases.get(base)!,
    suprimida: existente?.suprimida,
  });

  const fechar = () => {
    ativo = null;
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  selecao.definirPrioridade("face");

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Plano de deslocamento",
    campos: [{ chave: "distancia", rotulo: "Distância", valor: distancia }],
    escolhas: [{ chave: "base", rotulo: "Plano base", opcoes, valor: base }],
    modo: "novo",
    semModo: true,
    selecao: "Escolha na lista ou clique numa face plana",
    rotuloSelecao: "Base",
    aoMudar: (v, _m, esc) => {
      distancia = v.distancia;
      if (bases.has(esc.base)) base = esc.base;
      projeto.previsualizar(montar());
    },
    aoOK: (v, _m, esc) => {
      distancia = v.distancia;
      if (bases.has(esc.base)) base = esc.base;
      fechar();
      if (existente) projeto.substituir(montar());
      else projeto.adicionar(montar());
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  ativo = {
    aoSelecao(itens) {
      const face = [...itens].reverse().find((i) => i.tipo === "face");
      if (!face) return;
      const malha = projeto.estado.corposBase.find((c) => c.nome === face.corpo);
      const p = malha && planoDaFace(malha, face.indice);
      if (!p) return dialogo.definirSelecao("Essa face não é plana");
      bases.set("face", p);
      if (!opcoes.some(([v]) => v === "face")) opcoes.push(["face", `Face de ${face.corpo}`]);
      base = "face";
      dialogo.definirEscolha("base", "face", opcoes);
      dialogo.definirSelecao(`Face de ${face.corpo}`);
      projeto.previsualizar(montar());
    },
  };
}
