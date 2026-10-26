// Comandos que usam faces selecionadas (painel Modificar):
// - Inclinação: inclina faces planas pelo ângulo, a partir de um plano neutro;
// - Casca: tira as faces escolhidas e deixa paredes com a espessura dada, para dentro;
// - Pressionar/puxar: empurra ou puxa faces planas (positivo = para fora, cresce).
// Com a janela aberta, a seleção pega só faces e cada clique soma ou retira.
// Casca: para dentro ou para fora; "Corpo fechado" deixa oco sem abrir face (as
// faces clicadas só dizem qual corpo). Diferença: Pressionar/puxar só em face plana
// (no Fusion também muda raio de arredondamento e face curva).
// - Mover face (dentro de Mover/copiar, "Mover: Faces"): face plana anda e gira;
//   furo redondo inteiro anda.
import { abrirDialogo, fecharDialogo, type Campo, type Dialogo } from "../ui/dialogo";
import { comandoCorpos } from "./corpos";
import type { Operacao, Referencia } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";

type Tipo = "casca" | "pressionar" | "inclinacao" | "espessar" | "dividirFace" | "substituirFace" | "moverFace" | "deslocarFace" | "removerFaces" | "alinhar" | "malhaApagar" | "malhaCombinarGrupos";

export const COMANDOS_FACES: Record<string, Tipo> = {
  FusionShellBodyCommand: "casca",
  FusionPressPullCommand: "pressionar",
  FusionDraftCommand: "inclinacao",
  FusionSurfaceThickenCommand: "espessar",
  FusionSplitFaceCommand: "dividirFace",
  FusionReplaceFaceCommand: "substituirFace",
  FusionOffsetFacesCommand: "deslocarFace",
  FusionRemoveFacesCommand: "removerFaces",
  AlignCmd: "alinhar",
  // Malha: clique nos grupos de faces (Gerar grupos de faces antes).
  ParaMeshEraseAndFillCommand: "malhaApagar",
  ParaMeshMergeFaceGroupsCommand: "malhaCombinarGrupos",
};

const DADOS: Record<Tipo, { base: string; chave: string; rotulo: string; padrao: number; campos?: Campo[] }> = {
  casca: { base: "Casca", chave: "espessura", rotulo: "Espessura", padrao: 2 },
  pressionar: { base: "Pressionar", chave: "distancia", rotulo: "Distância", padrao: 5 },
  inclinacao: { base: "Inclinação", chave: "angulo", rotulo: "Ângulo", padrao: 3 },
  espessar: { base: "Espessar", chave: "espessura", rotulo: "Espessura", padrao: 2 },
  dividirFace: { base: "DividirFace", chave: "", rotulo: "", padrao: 0 }, // sem medida
  substituirFace: { base: "SubstituirFace", chave: "", rotulo: "", padrao: 0 },
  deslocarFace: { base: "DeslocarFace", chave: "distancia", rotulo: "Distância (+ pela normal)", padrao: 2 },
  removerFaces: { base: "RemoverFaces", chave: "", rotulo: "", padrao: 0 },
  alinhar: { base: "Alinhar", chave: "", rotulo: "", padrao: 0 },
  malhaApagar: { base: "Apagar e preencher", chave: "", rotulo: "", padrao: 0 },
  malhaCombinarGrupos: { base: "Combinar grupos", chave: "", rotulo: "", padrao: 0 },
  moverFace: {
    base: "MoverFace",
    chave: "",
    rotulo: "",
    padrao: 0,
    campos: [
      { chave: "distancia", rotulo: "Distância (pela normal)", valor: 5 },
      { chave: "dx", rotulo: "Distância X", valor: 0 },
      { chave: "dy", rotulo: "Distância Y", valor: 0 },
      { chave: "dz", rotulo: "Distância Z", valor: 0 },
      { chave: "rx", rotulo: "Girar em X", valor: 0, unidade: "°" },
      { chave: "ry", rotulo: "Girar em Y", valor: 0, unidade: "°" },
      { chave: "rz", rotulo: "Girar em Z", valor: 0, unidade: "°" },
    ],
  },
};

let ativo: { dialogo: Dialogo; aoSelecao: (itens: ItemSelecionado[]) => void } | null = null;

export function selecaoMudouFaces(itens: ItemSelecionado[]) {
  ativo?.aoSelecao(itens);
}

const soFaces = (itens: ItemSelecionado[]): Referencia[] =>
  itens.filter((i) => i.tipo === "face").map((i) => ({ corpo: i.corpo, tipo: "face" as const, indice: i.indice }));

const texto = (refs: Referencia[]) =>
  refs.length === 0 ? "Nenhuma — clique nas faces" : `${refs.length} face${refs.length > 1 ? "s" : ""}`;

export function comandoFaces(
  raiz: HTMLElement,
  projeto: Projeto,
  selecao: Selecao,
  tipo: Tipo,
  existente?: Operacao,
) {
  const d = DADOS[tipo];
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome(d.base);
  let refs = existente?.referencias ?? soFaces(selecao.itens());
  const prioridadeAntes: Prioridade = selecao.prioridade();

  let opcoes: Record<string, string> = existente?.opcoes ?? {};
  // Espessar escolhe a operação (como no Fusion, começa em "Novo corpo").
  let modo: Operacao["modo"] = existente?.modo ?? (tipo === "espessar" ? "novo" : "unir");
  // Casca de corpo fechado: sem faces, só os corpos (os das faces clicadas).
  const corposFechados: string[] = existente?.corpos ?? [];
  const fechada = () => tipo === "casca" && opcoes.fechada === "sim";
  const montar = (params: Record<string, number>): Operacao => ({
    id,
    tipo,
    nome,
    modo,
    params,
    opcoes,
    referencias: fechada() ? [] : refs,
    ...(fechada() ? { corpos: refs.length ? [...new Set(refs.map((r) => r.corpo))] : corposFechados } : {}),
    suprimida: existente?.suprimida,
  });
  // Inclinação: plano neutro (origem ou construção) e sentido de puxar.
  const escolhas =
    tipo === "inclinacao"
      ? [
          {
            chave: "plano",
            rotulo: "Plano neutro",
            opcoes: [
              ["XZ", "Plano XZ (chão; puxa para cima)"],
              ["XY", "Plano XY (puxa em Z)"],
              ["YZ", "Plano YZ (puxa em X)"],
              ...projeto.estado.historico.filter((o) => o.tipo === "plano").map((o) => [`op:${o.id}`, o.nome]),
            ] as [string, string][],
            valor: opcoes.plano ?? "XZ",
          },
          { chave: "inverter", rotulo: "Inverter direção", opcoes: [["nao", "Não"], ["sim", "Sim"]] as [string, string][], valor: opcoes.inverter ?? "nao" },
        ]
      : tipo === "espessar"
        ? [
            {
              chave: "direcao",
              rotulo: "Direção",
              opcoes: [["fora", "Para fora"], ["dentro", "Para dentro"], ["simetrico", "Simétrica"]] as [string, string][],
              valor: opcoes.direcao ?? "fora",
            },
          ]
        : tipo === "dividirFace"
          ? [
              {
                chave: "ferramenta",
                rotulo: "Ferramenta",
                opcoes: [
                  ["YZ", "Plano YZ (corta em X)"],
                  ["XY", "Plano XY (corta em Z)"],
                  ["XZ", "Plano XZ (corta em Y)"],
                  ...projeto.estado.historico.filter((o) => o.tipo === "plano").map((o) => [`op:${o.id}`, o.nome]),
                  ...projeto.estado.historico.filter((o) => o.tipo === "esboco").map((o) => [`esboco:${o.id}`, `${o.nome} (curvas)`]),
                ] as [string, string][],
                valor: opcoes.ferramenta ?? "YZ",
              },
            ]
          : tipo === "alinhar"
            ? [{ chave: "inverter", rotulo: "Sentido", opcoes: [["nao", "Faces de frente (encostar)"], ["sim", "Mesmo sentido"]] as [string, string][], valor: opcoes.inverter ?? "nao" }]
            : tipo === "moverFace"
            ? [{ chave: "objeto", rotulo: "Mover", opcoes: [["faces", "Faces"], ["corpos", "Corpos"]] as [string, string][], valor: "faces" }]
            : tipo === "casca"
            ? [
                { chave: "direcao", rotulo: "Direção", opcoes: [["dentro", "Para dentro"], ["fora", "Para fora"]] as [string, string][], valor: opcoes.direcao ?? "dentro" },
                { chave: "fechada", rotulo: "Corpo fechado (oco, sem abrir face)", opcoes: [["nao", "Não"], ["sim", "Sim"]] as [string, string][], valor: opcoes.fechada ?? (existente?.corpos?.length ? "sim" : "nao") },
              ]
            : tipo === "substituirFace"
            ? [
                {
                  chave: "alvo",
                  rotulo: "Alvo",
                  opcoes: [
                    ["ultima", "A última face clicada"],
                    ["XY", "Plano XY"],
                    ["XZ", "Plano XZ (chão)"],
                    ["YZ", "Plano YZ"],
                    ...projeto.estado.historico.filter((o) => o.tipo === "plano").map((o) => [`op:${o.id}`, o.nome]),
                  ] as [string, string][],
                  valor: opcoes.alvo ?? "ultima",
                },
              ]
            : [];
  const titulos: Record<Tipo, string> = {
    casca: "Casca",
    pressionar: "Pressionar/puxar",
    inclinacao: "Inclinação",
    espessar: "Espessar",
    dividirFace: "Dividir face",
    substituirFace: "Substituir face",
    moverFace: "Mover/copiar (faces)",
    deslocarFace: "Face de deslocamento",
    removerFaces: "Remover faces (tampar furo)",
    alinhar: "Alinhar (1ª face → 2ª face)",
    malhaApagar: "Apagar e preencher (grupos de faces)",
    malhaCombinarGrupos: "Combinar grupos de faces",
  };

  let valores: Record<string, number> = {};
  const fechar = () => {
    ativo = null;
    selecao.definirSempreSomar(false);
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  if (!existente) {
    selecao.definirPrioridade("face");
    selecao.definirSempreSomar(true);
  }

  const dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : titulos[tipo],
    campos: d.campos
      ? d.campos.map((c) => ({ ...c, valor: existente?.params[c.chave] ?? c.valor }))
      : d.chave ? [{ chave: d.chave, rotulo: d.rotulo, valor: existente?.params[d.chave] ?? d.padrao, unidade: tipo === "inclinacao" ? "°" : "mm" }] : [],
    escolhas,
    modo,
    semModo: tipo !== "espessar",
    selecao: texto(refs),
    rotuloSelecao: "Faces",
    aoMudar: (params, m, esc) => {
      // "Mover: Corpos" troca para o Mover/copiar de corpos (como no Fusion).
      if (tipo === "moverFace" && esc.objeto === "corpos" && !existente) {
        fecharDialogo(); // fecha como Cancelar (devolve a seleção) antes de abrir a outra
        return void setTimeout(() => comandoCorpos(raiz, projeto, selecao, "mover"));
      }
      valores = params;
      opcoes = esc;
      modo = m;
      projeto.previsualizar(refs.length ? montar(params) : null);
    },
    aoOK: (params, m, esc) => {
      opcoes = esc;
      modo = m;
      fechar();
      if (!refs.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar(params));
      else projeto.adicionar(montar(params));
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  ativo = existente
    ? null
    : {
        dialogo,
        aoSelecao: (itens) => {
          refs = soFaces(itens);
          dialogo.definirSelecao(texto(refs));
          projeto.previsualizar(refs.length ? montar(valores) : null);
        },
      };
}
