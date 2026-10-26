// Painel Inspecionar: Interferência, Centro de massa e Análise de corte.
// - Interferência: clique nos corpos (nenhum = todos) e veja onde se sobrepõem;
// - Centro de massa: o ponto aparece em laranja (corpos clicados, ou todos);
// - Análise de corte: esconde o lado de um plano para ver por dentro. Fica
//   ligada até abrir de novo e escolher "Desligar".
// Diferenças do Fusion, por enquanto: a Interferência não cria corpos; o corte
// não pinta a superfície cortada (mostra o lado de dentro das faces) e não fica
// salvo no arquivo.
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Projeto } from "../nucleo/projeto";
import type { Vista } from "../vista/cena";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";
import { PLANOS_ORIGEM, type PlanoEsboco } from "../nucleo/esboco";

export const COMANDOS_INSPECAO: Record<string, "interferencia" | "centroMassa" | "corte"> = {
  InterferenceCheckCommand: "interferencia",
  FusionCenterOfMassCommand: "centroMassa",
  FusionHalfSectionViewCommand: "corte",
};

let ativo: ((itens: ItemSelecionado[]) => void) | null = null;
export function selecaoMudouInspecao(itens: ItemSelecionado[]) {
  ativo?.(itens);
}

const corposDe = (itens: ItemSelecionado[]) => [...new Set(itens.map((i) => i.corpo))];

// Interferência e Centro de massa: janela que recalcula a cada clique em corpo.
export function comandoInspecaoCorpos(
  raiz: HTMLElement,
  projeto: Projeto,
  selecao: Selecao,
  vista: Vista,
  tipo: "interferencia" | "centroMassa",
) {
  const prioridadeAntes: Prioridade = selecao.prioridade();
  selecao.definirPrioridade("corpo");
  selecao.definirSempreSomar(true);
  let pedido = 0;
  const fechar = () => {
    ativo = null;
    vista.marcarPonto(null);
    selecao.definirSempreSomar(false);
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: tipo === "interferencia" ? "Interferência" : "Centro de massa",
    campos: [],
    modo: "novo",
    semModo: true,
    selecao: "Calculando…",
    rotuloSelecao: "Resultado",
    aoMudar: () => {},
    aoOK: fechar,
    aoCancelar: fechar,
  });
  const calcular = async (itens: ItemSelecionado[]) => {
    const nomes = corposDe(itens);
    const meu = ++pedido;
    dialogo.definirSelecao("Calculando…");
    try {
      if (tipo === "interferencia") {
        const linhas = await projeto.interferencia(nomes);
        if (meu === pedido) dialogo.definirSelecao((nomes.length ? "" : "(todos os corpos)\n") + linhas.join("\n"));
      } else {
        const [json, ...linhas] = await projeto.centroMassa(nomes);
        const p = JSON.parse(json) as { x: number; y: number; z: number };
        if (meu !== pedido) return;
        vista.marcarPonto([p.x, p.y, p.z]);
        dialogo.definirSelecao(linhas.join("\n"));
      }
    } catch (e) {
      if (meu === pedido) dialogo.definirSelecao(e instanceof Error ? e.message : String(e));
    }
  };
  ativo = calcular;
  calcular(selecao.itens());
}

// Corte atual (para a janela abrir com os valores de antes).
let corte: { plano: string; distancia: number; lado: string } | null = null;

export function comandoCorte(raiz: HTMLElement, projeto: Projeto, vista: Vista, planosConstrucao: () => [string, PlanoEsboco][]) {
  const construcao = planosConstrucao();
  const planoDe = (chave: string): PlanoEsboco | undefined =>
    PLANOS_ORIGEM[chave as "XY"] ?? construcao.find(([k]) => k === chave)?.[1];
  const aplicar = (v: Record<string, number>, esc: Record<string, string>) => {
    if (esc.ligado === "nao") return vista.definirCorte(null);
    const p = planoDe(esc.plano);
    if (!p) return;
    const s = esc.lado === "inverter" ? -1 : 1;
    const n = p.normal.map((x) => x * s) as [number, number, number];
    // Esconde o lado para onde a normal aponta, a partir de origem + distância.
    const ponto = p.origem.map((o, i) => o + p.normal[i] * (v.distancia ?? 0));
    const constante = n[0] * ponto[0] + n[1] * ponto[1] + n[2] * ponto[2];
    vista.definirCorte({ normal: [-n[0], -n[1], -n[2]], constante });
  };
  const antes = corte;
  abrirDialogo(raiz, {
    titulo: "Análise de corte",
    campos: [{ chave: "distancia", rotulo: "Deslocamento", valor: corte?.distancia ?? 0 }],
    escolhas: [
      {
        chave: "plano",
        rotulo: "Plano",
        opcoes: [["XY", "Plano XY"], ["XZ", "Plano XZ (chão)"], ["YZ", "Plano YZ"], ...construcao.map(([k, p]) => [k, p.nome] as [string, string])],
        valor: corte?.plano ?? "XY",
      },
      { chave: "lado", rotulo: "Lado escondido", opcoes: [["normal", "Para onde a normal aponta"], ["inverter", "O outro lado"]], valor: corte?.lado ?? "normal" },
      { chave: "ligado", rotulo: "Corte", opcoes: [["sim", "Ligado"], ["nao", "Desligar"]], valor: "sim" },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: (v, _m, esc) => aplicar(v, esc),
    aoOK: (v, _m, esc) => {
      aplicar(v, esc);
      corte = esc.ligado === "nao" ? null : { plano: esc.plano, distancia: v.distancia ?? 0, lado: esc.lado };
    },
    aoCancelar: () => {
      // Volta ao corte de antes (ou a nenhum).
      if (!antes) vista.definirCorte(null);
      else aplicar({ distancia: antes.distancia }, { plano: antes.plano, lado: antes.lado, ligado: "sim" });
    },
  });
  void projeto;
}

// ---- Análises visuais (ver vista/analises.ts) ----
export const COMANDOS_ANALISE: Record<string, "angulo" | "acessibilidade" | "zebra" | "ambiente" | "curvatura" | "raioMinimo"> = {
  FusionDraftAnalysisCommand: "angulo",
  FusionAccessibilityAnalysisCommand: "acessibilidade",
  FusionZebraAnalysisCommand: "zebra",
  FusionEnvironmentMapAnalysisCommand: "ambiente",
  FusionCurvatureMapAnalysisCommand: "curvatura",
  FusionMinimumRadiusAnalysisCommand: "raioMinimo",
};

const DIRECOES: [string, string][] = [["0,1,0", "Para cima (+Y)"], ["0,-1,0", "Para baixo (−Y)"], ["1,0,0", "+X"], ["-1,0,0", "−X"], ["0,0,1", "+Z"], ["0,0,-1", "−Z"]];

export function comandoAnalise(raiz: HTMLElement, vista: Vista, tipo: (typeof COMANDOS_ANALISE)[string]) {
  const antes = vista.analiseAtual();
  const titulos = {
    angulo: "Análise de ângulo do modelo",
    acessibilidade: "Análise de acessibilidade",
    zebra: "Análise zebra",
    ambiente: "Análise do mapa de ambiente",
    curvatura: "Análise do mapa de curvatura",
    raioMinimo: "Análise de raio mínimo",
  };
  const campos =
    tipo === "angulo"
      ? [{ chave: "limite", rotulo: "Ângulo limite", valor: 45, unidade: "°" }]
      : tipo === "zebra"
        ? [{ chave: "listras", rotulo: "Listras", valor: 8, unidade: "" }]
        : tipo === "raioMinimo"
          ? [{ chave: "raio", rotulo: "Raio mínimo", valor: 2 }]
          : [];
  const escolhas = [
    ...(tipo === "angulo" || tipo === "acessibilidade" ? [{ chave: "direcao", rotulo: "Direção", opcoes: DIRECOES, valor: "0,1,0" }] : []),
    { chave: "ligado", rotulo: "Análise", opcoes: [["sim", "Ligada"], ["nao", "Desligar"]] as [string, string][], valor: "sim" },
  ];
  const aplicar = (v: Record<string, number>, esc: Record<string, string>) => {
    if (esc.ligado === "nao") return vista.definirAnalise(null);
    const dir = (esc.direcao ?? "0,1,0").split(",").map(Number) as [number, number, number];
    if (tipo === "angulo") vista.definirAnalise({ tipo, direcao: dir, limite: v.limite ?? 45 });
    else if (tipo === "acessibilidade") vista.definirAnalise({ tipo, direcao: dir });
    else if (tipo === "zebra") vista.definirAnalise({ tipo, listras: v.listras || 8 });
    else if (tipo === "ambiente") vista.definirAnalise({ tipo });
    else vista.definirAnalise({ tipo: "curvatura", raioMinimo: tipo === "raioMinimo" ? v.raio || 1 : 0 });
  };
  abrirDialogo(raiz, {
    titulo: titulos[tipo],
    campos,
    escolhas,
    modo: "novo",
    semModo: true,
    selecao:
      tipo === "angulo"
        ? "Verde = a favor, amarelo = quase de lado, vermelho = contra (com 'para cima' e 45°: precisa de suporte)"
        : tipo === "acessibilidade"
          ? "Verde = vista da direção, vermelho = de costas"
          : tipo === "curvatura"
            ? "Azul = plano · verde · vermelho = raio pequeno"
            : tipo === "raioMinimo"
              ? "Vermelho = raio menor que o mínimo"
              : "Gire a peça para ver o reflexo",
    rotuloSelecao: "Cores",
    aoMudar: (v, _m, esc) => aplicar(v, esc),
    aoOK: (v, _m, esc) => aplicar(v, esc),
    aoCancelar: () => vista.definirAnalise(antes),
  });
}
