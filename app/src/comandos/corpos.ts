// Comandos que trabalham com corpos inteiros: Espelhar, Padrão retangular,
// Padrão circular (painel Criar) e Combinar (painel Modificar).
// Com a janela aberta, clicar num corpo (ou no Navegador) soma ou retira.
// No Combinar, o 1º corpo clicado é o alvo e os outros são as ferramentas.
// Mover/copiar: anda X/Y/Z e gira em X/Y/Z (em volta do centro do corpo ou da origem).
// Diferenças do Fusion, por enquanto: só corpos (não operações nem faces),
// planos e eixos só os da origem, sem "Simétrico" nos padrões, sem as setas
// para arrastar no Mover (só números).
import { abrirDialogo, fecharDialogo, type CampoEscolha, type Campo, type Dialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";
import { APARENCIAS, MATERIAIS } from "../nucleo/materiais";
import { comandoFaces } from "./faces";

type Tipo = "espelhar" | "padraoRetangular" | "padraoCircular" | "combinar" | "mover" | "dividir" | "corteEncaixes" | "escala" | "aparencia" | "material" | "delimitador" | "substituirPrimitivo" | "organizar" | "volumeFluido" | "padraoGeometrico" | "removerRecursos"
  | "malhaTesselar" | "malhaReduzir" | "malhaSuavizar" | "malhaReparar" | "malhaCorte" | "malhaInverter" | "malhaSeparar" | "malhaCombinar" | "malhaConverter"
  | "malhaEscala" | "malhaRemover" | "malhaCasca" | "malhaFronteira" | "malhaGrupos"
  | "malhaAlinhar" | "malhaPonte" | "malhaAtrair" | "malhaGrupoNovo" | "malhaQuad"
  | "superficieCosturar" | "superficieRemendo" | "superficieAparar" | "superficieEstender";

export const COMANDOS_CORPOS: Record<string, Tipo> = {
  MirrorCommand: "espelhar",
  PatternRectangular: "padraoRetangular",
  PatternCircular: "padraoCircular",
  FusionCombineCommand: "combinar",
  FusionMoveCommand: "mover",
  FusionSplitBodyCommand: "dividir",
  HaxysCorteEncaixesCommand: "corteEncaixes",
  ModifyScale: "escala",
  AppearanceCommand: "aparencia",
  PhysicalMaterialCommand: "material",
  StockModelCommand: "delimitador",
  EnclosureCommand: "volumeFluido",
  FusionPatternGeometricCommand: "padraoGeometrico",
  FusionRemoveFeaturesCommand: "removerRecursos",
  ReplaceWithPrimitivesCommand: "substituirPrimitivo",
  ArrangeCommand: "organizar",
  // Aba MALHA
  ParaMeshTessellateCommand: "malhaTesselar",
  ParaMeshReduceCommand: "malhaReduzir",
  ParaMeshRemeshCommand: "malhaReduzir",
  ParaMeshSmoothCommand: "malhaSuavizar",
  ParaMeshScaleCommand: "malhaEscala",
  ParaMeshAlignCommand: "malhaAlinhar",
  ParaMeshBridgeCommand: "malhaPonte",
  ParaMeshAttractToReferenceCommand: "malhaAtrair",
  ParaMeshCreateFaceGroupCommand: "malhaGrupoNovo",
  ParaMeshToQuadMeshCommand: "malhaQuad",
  ParaMeshRemoveCommand: "malhaRemover",
  ParaMeshHollowCommand: "malhaCasca",
  ParaMeshSmoothBoundaryCommand: "malhaFronteira",
  ParaMeshCalculateFaceGroupsCommand: "malhaGrupos",
  ParaMeshRepairCommand: "malhaReparar",
  ParaMeshCloseCracksCommand: "malhaReparar",
  ParaMeshPlaneCutCommand: "malhaCorte",
  ParaMeshReverseNormalsCommand: "malhaInverter",
  ParaMeshExtractCommand: "malhaSeparar",
  ParaMeshCombineCommand: "malhaCombinar",
  ParaMeshConvertCommand: "malhaConverter",
  // Aba SUPERFÍCIE
  SurfaceSculpt: "superficieCosturar",
  SurfaceStitchCommand: "superficieCosturar",
  SurfacePatchCommand: "superficieRemendo",
  SurfaceTrimCommand: "superficieAparar",
  FusionExtendCommand: "superficieEstender",
};

const EIXOS: [string, string][] = [["X", "Eixo X"], ["Y", "Eixo Y (vertical)"], ["Z", "Eixo Z"]];
const NOVO_OU_UNIR: [string, string][] = [["novo", "Novo corpo"], ["unir", "Unir"]];

interface Definicao {
  titulo: string;
  base: string;
  campos: Campo[];
  escolhas: CampoEscolha[];
}

const DEFINICOES: Record<Tipo, Definicao> = {
  espelhar: {
    titulo: "Espelhar",
    base: "Espelhar",
    campos: [],
    escolhas: [
      { chave: "plano", rotulo: "Plano", opcoes: [["YZ", "YZ (lado a lado)"], ["XY", "XY (frente e trás)"], ["XZ", "XZ (chão: em cima e embaixo)"]], valor: "YZ" },
      { chave: "operacao", rotulo: "Operação", opcoes: NOVO_OU_UNIR, valor: "novo" },
    ],
  },
  padraoRetangular: {
    titulo: "Padrão retangular",
    base: "PadrãoRetangular",
    campos: [
      { chave: "quantidade1", rotulo: "Quantidade", valor: 3, unidade: "" },
      { chave: "distancia1", rotulo: "Distância", valor: 60 },
      { chave: "quantidade2", rotulo: "Quantidade 2", valor: 1, unidade: "" },
      { chave: "distancia2", rotulo: "Distância 2", valor: 60 },
    ],
    escolhas: [
      { chave: "direcao1", rotulo: "Direção", opcoes: EIXOS, valor: "X" },
      { chave: "direcao2", rotulo: "Direção 2", opcoes: EIXOS, valor: "Z" },
      { chave: "tipoDistancia", rotulo: "Tipo de distância", opcoes: [["extensao", "Extensão (total)"], ["espacamento", "Espaçamento"]], valor: "extensao" },
      { chave: "operacao", rotulo: "Operação", opcoes: NOVO_OU_UNIR, valor: "novo" },
    ],
  },
  padraoCircular: {
    titulo: "Padrão circular",
    base: "PadrãoCircular",
    campos: [
      { chave: "quantidade", rotulo: "Quantidade", valor: 6, unidade: "" },
      { chave: "angulo", rotulo: "Ângulo total", valor: 360, unidade: "°" },
    ],
    escolhas: [
      { chave: "eixo", rotulo: "Eixo", opcoes: EIXOS, valor: "Y" },
      { chave: "operacao", rotulo: "Operação", opcoes: NOVO_OU_UNIR, valor: "novo" },
    ],
  },
  mover: {
    titulo: "Mover/copiar",
    base: "Mover",
    campos: [
      { chave: "dx", rotulo: "Distância X", valor: 0 },
      { chave: "dy", rotulo: "Distância Y", valor: 0 },
      { chave: "dz", rotulo: "Distância Z", valor: 0 },
      { chave: "rx", rotulo: "Girar em X", valor: 0, unidade: "°" },
      { chave: "ry", rotulo: "Girar em Y", valor: 0, unidade: "°" },
      { chave: "rz", rotulo: "Girar em Z", valor: 0, unidade: "°" },
    ],
    escolhas: [
      { chave: "objeto", rotulo: "Mover", opcoes: [["corpos", "Corpos"], ["faces", "Faces"]], valor: "corpos" },
      { chave: "pivo", rotulo: "Girar em volta de", opcoes: [["centro", "Centro do corpo"], ["origem", "Origem"]], valor: "centro" },
      { chave: "copiar", rotulo: "Criar cópia", opcoes: [["nao", "Não"], ["sim", "Sim"]], valor: "nao" },
    ],
  },
  escala: {
    titulo: "Escala",
    base: "Escala",
    campos: [{ chave: "fator", rotulo: "Fator de escala", valor: 1, unidade: "×" }],
    escolhas: [
      { chave: "pivo", rotulo: "Ponto base", opcoes: [["centro", "Centro do corpo"], ["origem", "Origem"]], valor: "centro" },
      { chave: "copiar", rotulo: "Criar cópia", opcoes: [["nao", "Não"], ["sim", "Sim"]], valor: "nao" },
    ],
  },
  substituirPrimitivo: {
    titulo: "Substituir por primitivos",
    base: "Primitivo",
    campos: [],
    escolhas: [{ chave: "forma", rotulo: "Forma", opcoes: [["caixa", "Caixa"], ["cilindro", "Cilindro (em pé)"]], valor: "caixa" }],
  },
  malhaTesselar: {
    titulo: "Tesselar (sólido → malha)",
    base: "Tesselar",
    campos: [{ chave: "tolerancia", rotulo: "Tolerância (menor = mais triângulos)", valor: 0.05 }],
    escolhas: [],
  },
  malhaReduzir: {
    titulo: "Reduzir malha",
    base: "Reduzir",
    campos: [{ chave: "proporcao", rotulo: "Triângulos que ficam", valor: 50, unidade: "%" }],
    escolhas: [],
  },
  malhaEscala: {
    titulo: "Dimensionar malha",
    base: "Dimensionar malha",
    campos: [
      { chave: "fatorX", rotulo: "Fator X", valor: 1, unidade: "" },
      { chave: "fatorY", rotulo: "Fator Y", valor: 1, unidade: "" },
      { chave: "fatorZ", rotulo: "Fator Z", valor: 1, unidade: "" },
    ],
    escolhas: [{ chave: "pivo", rotulo: "Ponto base", opcoes: [["centro", "Centro da malha"], ["origem", "Origem"]], valor: "centro" }],
  },
  malhaRemover: { titulo: "Remover malha", base: "Remover malha", campos: [], escolhas: [] },
  // 1º corpo clicado = a malha que anda; 2º = o alvo (malha ou sólido).
  malhaAlinhar: {
    titulo: "Alinhamento de malha",
    base: "Alinhar malha",
    campos: [{ chave: "passadas", rotulo: "Passadas (melhor encaixe)", valor: 60, unidade: "" }],
    escolhas: [
      { chave: "metodo", rotulo: "Método", opcoes: [["ajuste", "Melhor encaixe (forma sobre forma)"], ["centro", "Centro com centro"]], valor: "ajuste" },
    ],
  },
  malhaQuad: {
    titulo: "Converter em malha quadrilateral",
    base: "Malha quadrilateral",
    campos: [{ chave: "angulo", rotulo: "Dobra máxima entre os dois triângulos", valor: 30, unidade: "°" }],
    escolhas: [],
  },
  malhaPonte: { titulo: "Ponte (liga duas bordas abertas)", base: "Ponte", campos: [], escolhas: [] },
  malhaAtrair: {
    titulo: "Atrair para referência",
    base: "Atrair",
    campos: [
      { chave: "distancia", rotulo: "Pontos até esta distância", valor: 1 },
      { chave: "deslocamento", rotulo: "Deslocamento do plano", valor: 0 },
    ],
    escolhas: [
      // A lista ganha os planos de construção na hora de abrir (ver comandoCorpos).
      { chave: "plano", rotulo: "Plano de referência", opcoes: [["XZ", "Plano XZ (Y)"], ["XY", "Plano XY (Z)"], ["YZ", "Plano YZ (X)"]], valor: "XZ" },
    ],
  },
  malhaGrupoNovo: {
    titulo: "Criar grupo de faces",
    base: "Grupo de faces",
    campos: [{ chave: "angulo", rotulo: "Desvio máximo da direção", valor: 20, unidade: "°" }],
    escolhas: [
      { chave: "direcao", rotulo: "Triângulos virados para", opcoes: [["+Y", "Cima (+Y)"], ["-Y", "Baixo (−Y)"], ["+X", "+X"], ["-X", "−X"], ["+Z", "+Z"], ["-Z", "−Z"]], valor: "+Y" },
    ],
  },
  malhaCasca: {
    titulo: "Casca (malha)",
    base: "Casca de malha",
    campos: [{ chave: "espessura", rotulo: "Espessura da parede", valor: 2 }],
    escolhas: [],
  },
  malhaFronteira: {
    titulo: "Suavizar fronteira",
    base: "Suavizar fronteira",
    campos: [{ chave: "iteracoes", rotulo: "Intensidade (passadas)", valor: 5, unidade: "" }],
    escolhas: [],
  },
  malhaGrupos: {
    titulo: "Gerar grupos de faces",
    base: "Grupos de faces",
    campos: [{ chave: "angulo", rotulo: "Ângulo máximo entre vizinhos", valor: 20, unidade: "°" }],
    escolhas: [],
  },
  malhaSuavizar: {
    titulo: "Suavizar malha",
    base: "Suavizar",
    campos: [{ chave: "iteracoes", rotulo: "Intensidade (passadas)", valor: 5, unidade: "" }],
    escolhas: [],
  },
  malhaReparar: {
    titulo: "Reparar malha",
    base: "Reparar",
    campos: [],
    escolhas: [],
  },
  malhaCorte: {
    titulo: "Corte do plano (malha)",
    base: "CorteMalha",
    campos: [{ chave: "deslocamento", rotulo: "Deslocamento do plano", valor: 0 }],
    escolhas: [
      // A lista ganha os planos de construção na hora de abrir (ver comandoCorpos).
      { chave: "plano", rotulo: "Plano", opcoes: [["XZ", "Plano XZ (corta em Y)"], ["XY", "Plano XY (corta em Z)"], ["YZ", "Plano YZ (corta em X)"]], valor: "XZ" },
      { chave: "lado", rotulo: "Fica o lado", opcoes: [["positivo", "Para onde a normal aponta"], ["negativo", "O outro lado"]], valor: "positivo" },
      { chave: "tampar", rotulo: "Preencher o corte", opcoes: [["sim", "Sim (fecha com tampa plana)"], ["nao", "Não (fica aberto)"]], valor: "sim" },
    ],
  },
  malhaInverter: {
    titulo: "Reverter normais",
    base: "Reverter",
    campos: [],
    escolhas: [],
  },
  malhaSeparar: {
    titulo: "Separar (pedaços soltos viram corpos)",
    base: "Separar",
    campos: [],
    escolhas: [],
  },
  malhaCombinar: {
    titulo: "Combinar malhas",
    base: "CombinarMalha",
    campos: [],
    escolhas: [],
  },
  malhaConverter: {
    titulo: "Converter malha em sólido",
    base: "Converter",
    campos: [],
    escolhas: [],
  },
  superficieCosturar: {
    titulo: "Costurar superfícies",
    base: "Costurar",
    campos: [],
    escolhas: [{ chave: "solido", rotulo: "Se fechar um volume", opcoes: [["sim", "Vira sólido"], ["nao", "Continua superfície"]], valor: "sim" }],
  },
  superficieRemendo: {
    titulo: "Remendo",
    base: "Remendo",
    campos: [],
    escolhas: [
      // A lista ganha os esboços na hora de abrir (ver comandoCorpos).
      { chave: "fonte", rotulo: "Tapar", opcoes: [["bordas", "Bordas abertas dos corpos escolhidos"]], valor: "bordas" },
      { chave: "solido", rotulo: "Se fechar um volume", opcoes: [["sim", "Vira sólido"], ["nao", "Continua superfície"]], valor: "sim" },
    ],
  },
  superficieAparar: {
    titulo: "Aparar superfície (por plano)",
    base: "Aparar",
    campos: [{ chave: "deslocamento", rotulo: "Deslocamento do plano", valor: 0 }],
    escolhas: [
      { chave: "plano", rotulo: "Plano", opcoes: [["XZ", "Plano XZ (corta em Y)"], ["XY", "Plano XY (corta em Z)"], ["YZ", "Plano YZ (corta em X)"]], valor: "XZ" },
      { chave: "lado", rotulo: "Fica o lado", opcoes: [["positivo", "Para onde a normal aponta"], ["negativo", "O outro lado"]], valor: "positivo" },
    ],
  },
  superficieEstender: {
    titulo: "Estender superfície",
    base: "Estender",
    campos: [{ chave: "distancia", rotulo: "Distância", valor: 5 }],
    escolhas: [{ chave: "direcao", rotulo: "Direções", opcoes: [["todas", "Todas as bordas"], ["u", "Só U"], ["v", "Só V"]], valor: "todas" }],
  },
  organizar: {
    titulo: "Organizar (mesa da impressora)",
    base: "Organizar",
    campos: [
      { chave: "largura", rotulo: "Mesa: largura (X)", valor: 256 },
      { chave: "profundidade", rotulo: "Mesa: profundidade (Z)", valor: 256 },
      { chave: "espaco", rotulo: "Espaço entre peças", valor: 5 },
    ],
    escolhas: [],
  },
  padraoGeometrico: {
    titulo: "Padrão geométrico",
    base: "Padrão geométrico",
    campos: [],
    escolhas: [
      { chave: "esboco", rotulo: "Pontos do esboço", opcoes: [], valor: "" },
      { chave: "operacao", rotulo: "Resultado", opcoes: [["novo", "Corpos novos"], ["unir", "Unir ao corpo"]], valor: "novo" },
    ],
  },
  removerRecursos: {
    titulo: "Remover recursos (furos)",
    base: "Remover recursos",
    campos: [{ chave: "diametroMax", rotulo: "Furos até o diâmetro", valor: 5 }],
    escolhas: [],
  },
  volumeFluido: {
    titulo: "Volume de fluido",
    base: "Fluido",
    campos: [],
    escolhas: [
      {
        chave: "tampa",
        rotulo: "Lado aberto (tampa)",
        opcoes: [["cima", "Em cima (ex.: copo)"], ["nenhuma", "Nenhum (cavidade fechada)"], ["baixo", "Embaixo"], ["frente", "Frente"], ["tras", "Trás"], ["direita", "Direita"], ["esquerda", "Esquerda"]],
        valor: "cima",
      },
    ],
  },
  delimitador: {
    titulo: "Sólido delimitador",
    base: "Delimitador",
    campos: [{ chave: "folga", rotulo: "Folga", valor: 0 }],
    escolhas: [{ chave: "forma", rotulo: "Forma", opcoes: [["caixa", "Caixa"], ["cilindro", "Cilindro (em pé)"]], valor: "caixa" }],
  },
  aparencia: {
    titulo: "Aparência",
    base: "Aparência",
    campos: [],
    escolhas: [
      { chave: "aparencia", rotulo: "Aparência", opcoes: Object.entries(APARENCIAS).map(([k, a]) => [k, a.nome]), valor: "plasticoAzul" },
    ],
  },
  material: {
    titulo: "Material físico",
    base: "Material",
    campos: [],
    escolhas: [
      {
        chave: "material",
        rotulo: "Material",
        opcoes: Object.entries(MATERIAIS).map(([k, m]) => [k, `${m.nome} — ${m.densidade.toLocaleString("pt-BR")} g/cm³`]),
        valor: "pla",
      },
    ],
  },
  dividir: {
    titulo: "Dividir corpo",
    base: "Dividir",
    campos: [],
    escolhas: [
      // A lista ganha os planos de construção na hora de abrir (ver comandoCorpos).
      { chave: "plano", rotulo: "Ferramenta de corte", opcoes: [["YZ", "Plano YZ (corta em X)"], ["XY", "Plano XY (corta em Z)"], ["XZ", "Plano XZ (corta em Y)"]], valor: "YZ" },
    ],
  },
  // Cortar com encaixes (como no Bambu Studio): para peça maior que a mesa.
  corteEncaixes: {
    titulo: "Cortar com encaixes",
    base: "Corte",
    campos: [
      { chave: "deslocamento", rotulo: "Deslocamento do plano", valor: 0 },
      { chave: "quantidade", rotulo: "Quantos encaixes", valor: 2, unidade: "" },
      { chave: "diametro", rotulo: "Diâmetro do encaixe", valor: 5 },
      { chave: "comprimento", rotulo: "Comprimento do encaixe", valor: 10 },
      { chave: "folga", rotulo: "Folga (furo maior)", valor: 0.2 },
      { chave: "separar", rotulo: "Afastar as partes", valor: 10 },
    ],
    escolhas: [
      // A lista ganha os planos de construção na hora de abrir (ver comandoCorpos).
      { chave: "plano", rotulo: "Plano de corte", opcoes: [["XZ", "Plano XZ (corta na altura Y)"], ["YZ", "Plano YZ (corta em X)"], ["XY", "Plano XY (corta em Z)"]], valor: "XZ" },
      { chave: "encaixe", rotulo: "Encaixe", opcoes: [["pino", "Pino e furo (macho/fêmea)"], ["cavilha", "Cavilhas soltas (furo nos dois lados)"], ["nenhum", "Sem encaixe"]], valor: "pino" },
    ],
  },
  combinar: {
    titulo: "Combinar",
    base: "Combinar",
    campos: [],
    escolhas: [
      { chave: "operacao", rotulo: "Operação", opcoes: [["unir", "Unir"], ["cortar", "Cortar"], ["intersecao", "Interseção"]], valor: "unir" },
      { chave: "manter", rotulo: "Manter ferramentas", opcoes: [["nao", "Não"], ["sim", "Sim"]], valor: "nao" },
    ],
  },
};

let ativo: { aoSelecao: (itens: ItemSelecionado[]) => void } | null = null;

export function selecaoMudouCorpos(itens: ItemSelecionado[]) {
  ativo?.aoSelecao(itens);
}

// Corpos da seleção, na ordem dos cliques e sem repetir (face/aresta valem pelo corpo).
const corposDe = (itens: ItemSelecionado[]) => [...new Set(itens.map((i) => i.corpo))];

function texto(tipo: Tipo, nomes: string[]): string {
  if (!nomes.length) return "Nenhum — clique nos corpos";
  if (tipo === "malhaAlinhar") return `Anda: ${nomes[0]}` + (nomes[1] ? ` · Alvo: ${nomes[1]}` : " · clique no alvo");
  if (tipo === "combinar") {
    const [alvo, ...ferr] = nomes;
    return `Alvo: ${alvo}` + (ferr.length ? ` · Ferramentas: ${ferr.join(", ")}` : " · clique nas ferramentas");
  }
  return nomes.join(", ");
}

export function comandoCorpos(
  raiz: HTMLElement,
  projeto: Projeto,
  selecao: Selecao,
  tipo: Tipo,
  existente?: Operacao,
) {
  const def = DEFINICOES[tipo];
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome(def.base);
  let nomes = existente?.corpos ?? corposDe(selecao.itens());
  const prioridadeAntes: Prioridade = selecao.prioridade();
  let ultimo: { params: Record<string, number>; opcoes: Record<string, string> } = { params: {}, opcoes: {} };

  const montar = (): Operacao => ({
    id,
    tipo,
    nome,
    modo: "novo",
    params: ultimo.params,
    opcoes: ultimo.opcoes,
    corpos: [...nomes],
    suprimida: existente?.suprimida,
  });
  // Organizar sem corpos escolhidos = todos.
  const pronto = () =>
    tipo === "organizar" || (tipo === "superficieRemendo" && (ultimo.opcoes.fonte ?? "").startsWith("esb:")) || nomes.length >= (tipo === "combinar" || tipo === "malhaCombinar" || tipo === "malhaAlinhar" ? 2 : 1);
  const mostrarPrevia = () => projeto.previsualizar(pronto() ? montar() : null);

  const fechar = () => {
    ativo = null;
    selecao.definirSempreSomar(false);
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  if (!existente) {
    selecao.definirPrioridade("corpo");
    selecao.definirSempreSomar(true);
  }

  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : def.titulo,
    campos: def.campos.map((c) => ({ ...c, valor: existente?.params[c.chave] ?? c.valor })),
    escolhas: def.escolhas.map((c) => {
      // Dividir: planos de construção do projeto também servem de faca.
      // Padrão circular: eixos de construção também servem.
      if (tipo === "padraoCircular" && c.chave === "eixo") {
        const eixos = projeto.estado.historico.filter((o) => o.tipo === "eixo" && o.id !== id).map((o) => [`op:${o.id}`, o.nome] as [string, string]);
        return { ...c, opcoes: [...c.opcoes, ...eixos], valor: existente?.opcoes?.[c.chave] ?? c.valor };
      }
      const opcoes =
        tipo === "superficieRemendo" && c.chave === "fonte"
          ? [
              ...c.opcoes,
              ...projeto.estado.historico
                .filter((o) => o.tipo === "esboco" && !o.suprimida)
                .map((o) => [`esb:${o.id}`, `Perfis fechados de ${o.nome}`] as [string, string]),
            ]
          : tipo === "padraoGeometrico" && c.chave === "esboco"
          ? projeto.estado.historico.filter((o) => o.tipo === "esboco" && !o.suprimida).map((o) => [`esb:${o.id}`, o.nome] as [string, string])
          : (tipo === "dividir" || tipo === "corteEncaixes" || tipo === "malhaCorte" || tipo === "malhaAtrair" || tipo === "superficieAparar") && c.chave === "plano"
          ? [
              ...c.opcoes,
              ...projeto.estado.historico
                .filter((o) => o.tipo === "plano" && o.id !== id)
                .map((o) => [`op:${o.id}`, o.nome] as [string, string]),
            ]
          : c.opcoes;
      return { ...c, opcoes, valor: existente?.opcoes?.[c.chave] ?? (c.valor || opcoes.at(-1)?.[0] || "") };
    }),
    modo: "novo",
    semModo: true,
    selecao: texto(tipo, nomes),
    rotuloSelecao: "Corpos",
    aoMudar: (params, _m, opcoes) => {
      // "Mover: Faces" troca para o Mover face.
      if (tipo === "mover" && opcoes.objeto === "faces" && !existente) {
        fecharDialogo(); // fecha como Cancelar (devolve a seleção) antes de abrir a outra
        return void setTimeout(() => comandoFaces(raiz, projeto, selecao, "moverFace"));
      }
      ultimo = { params, opcoes };
      mostrarPrevia();
    },
    aoOK: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      fechar();
      if (!pronto()) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else projeto.adicionar(montar());
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  ativo = existente
    ? null // editar: só muda medidas e opções
    : {
        aoSelecao(itens) {
          nomes = corposDe(itens);
          dialogo.definirSelecao(texto(tipo, nomes));
          mostrarPrevia();
        },
      };
}
