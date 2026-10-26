// Histórico paramétrico: lista de operações recalculada em ordem.
// É o que alimenta a linha do tempo e o Navegador.

import type { DadosEsboco, PlanoEsboco, V3 } from "./esboco";
import type { Configuracao, Parametro, Regra } from "./parametros";

// Todos os tipos de operação (a leitura de arquivo .haxys confere por esta lista).
export const TIPOS_OPERACAO = [
  "caixa",
  "cilindro",
  "esfera",
  "arredondamento",
  "chanfro",
  "esboco",
  "extrusao",
  "revolucao",
  "casca",
  "pressionar",
  "espelhar",
  "padraoRetangular",
  "padraoCircular",
  "combinar",
  "plano",
  "furo",
  "mover",
  "varredura",
  "rosca",
  "transicao",
  "dividir",
  "inclinacao",
  "escala",
  "nervura",
  "teia",
  "bobina",
  "substituirFace",
  "moverFace",
  "toroide",
  "tubulacao",
  "delimitador",
  "volumeFluido", // Volume de fluido: o que cabe dentro da peça
  "padraoGeometrico", // cópias do corpo nos pontos de um esboço
  "removerRecursos", // tampa os furos redondos até um diâmetro
  "remover", // tira corpos do modelo (Excluir/Remover do Fusion)
  "eixo", // eixo de construção
  "ponto", // ponto de construção
  "deslocarFace",
  "removerFaces",
  "alinhar",
  "padraoCaminho",
  "altoRelevo",
  "componente", // agrupa corpos que andam juntos (Novo componente / Grupo rígido)
  "junta",
  "origemJunta", // Origem da junta: ponto numa face/aresta, usado pelas juntas
  "duplicarJuntas", // Duplicar com juntas: cópia do componente (a junta copiada vem depois)
  "contatos", // conjuntos de contato (fica fora da linha do tempo)
  "posicao", // posição capturada das juntas (fica fora da linha do tempo)
  "operacaoBase", // Operação base / Edição direta de malha: corpos congelados (sem histórico)
  "importado", // componente vindo de arquivo STEP/STL
  "substituirPrimitivo",
  "organizar", // arruma os corpos na mesa da impressora
  "fixador", // parafuso, porca, arruela
  "tela", // imagem de referência (Tela) ou colada numa face (Decalque); só visual
  // Corpos de malha (aba MALHA)
  "malhaInserir",
  "malhaTesselar",
  "malhaReduzir",
  "malhaSuavizar",
  "malhaReparar",
  "malhaCorte",
  "malhaInverter",
  "malhaSeparar",
  "malhaCombinar",
  "malhaConverter",
  "malhaEscala", // Dimensionar malha (fator por eixo)
  "malhaRemover",
  "malhaCasca",
  "malhaFronteira", // Suavizar fronteira
  "malhaGrupos", // Gerar grupos de faces
  "malhaApagar", // Apagar e preencher (grupos de faces escolhidos)
  "malhaCombinarGrupos",
  "malhaAlinhar", // Alinhamento de malha (melhor encaixe no alvo, ou centro com centro)
  "malhaPonte", // liga duas bordas abertas
  "malhaAtrair", // Atrair para referência (pontos perto do plano vão para ele)
  "malhaGrupoNovo", // Criar grupo de faces (triângulos virados para uma direção)
  "malhaQuad", // Converter em malha quadrilateral (pares de triângulos)
  "malhaFusion", // um passo da linha do tempo do Fusion (Trazer do Fusion): a malha das faces dele
  // Corpos de superfície (aba SUPERFÍCIE); Extrusão/Transição/primitivas usam opcoes.superficie = "sim"
  "superficieCosturar",
  "superficieRemendo",
  "superficieAparar",
  "superficieEstender",
  "anotacao", // texto 3D preso na peça (PMI); só visual
  "parametros", // lista de parâmetros do usuário (fica fora da linha do tempo)
  "dividirFace",
  "corteEncaixes", // Cortar (Bambu): divide por plano e põe pinos/cavilhas para montar
  "espessar",
  "aparencia", // não aparece na linha do tempo (como no Fusion)
  "material", // idem
] as const;
export type TipoOperacao = (typeof TIPOS_OPERACAO)[number];

// Eixo da Revolução: um eixo da origem ou uma linha de um esboço.
export type Eixo =
  | { tipo: "origem"; eixo: "X" | "Y" | "Z" }
  | { tipo: "linha"; esboco: string; curva: number }
  | { tipo: "construcao"; op: string }; // eixo de construção (operação "eixo")

// Aresta ou face de um corpo, como estava antes da operação.
export interface Referencia {
  corpo: string; // ex.: "Corpo1"
  tipo: "aresta" | "face"; // face = todas as arestas da face
  indice: number;
}

// Como o resultado se junta aos corpos que já existem (igual ao Fusion).
export type ModoOperacao = "novo" | "unir" | "cortar" | "intersecao";

export interface Operacao {
  id: string;
  tipo: TipoOperacao;
  nome: string; // ex.: "Caixa1"
  modo: ModoOperacao;
  // Medidas em mm. Centro da base no ponto (x, y, z); Y é para cima.
  params: Record<string, number>;
  referencias?: Referencia[]; // arestas/faces usadas por Arredondamento e Chanfro
  esboco?: DadosEsboco; // só na operação "esboco"
  perfis?: { esboco: string; indices: number[] }; // perfis usados pela Extrusão/Revolução
  eixo?: Eixo; // só na Revolução
  corpos?: string[]; // corpos usados (Espelhar, Padrão; no Combinar o 1º é o alvo)
  opcoes?: Record<string, string>; // escolhas de lista (plano, eixo, tipo de distância...)
  planoBase?: PlanoEsboco; // Plano de deslocamento: plano de partida
  furos?: { ponto: V3; normal: V3 }[]; // Furo: centro na face e normal da face (para fora)
  caminho?: { esboco: string; curvas: number[] }; // Varredura: curvas do caminho, em ordem; Nervura/Teia: linhas
  secoes?: { esboco: string; indice: number }[]; // Transição: perfis na ordem em que foram clicados
  parametros?: Parametro[]; // só na operação "parametros"
  configuracoes?: Configuracao[]; // só na operação "parametros"
  configuracaoAtiva?: string; // só na operação "parametros"
  regras?: Regra[]; // só na operação "parametros": regras de configuração
  eixoConstrucao?: { origem: V3; direcao: V3 }; // só na operação "eixo"
  pontoConstrucao?: V3; // só na operação "ponto"
  arquivo?: { nome: string; formato: "step" | "stl" | "obj"; base64: string }; // "importado" e "malhaInserir"
  // Só em "malhaFusion": por corpo do Fusion, a malha (mm, Y para cima) das faces que o passo criou;
  // pos = Float32 e tri = Uint32 em base64. Esboço/plano: lista vazia.
  fusion?: { corpo: string; pos: string; tri: string }[];
  imagem?: string; // só em "tela": a imagem (data URL)
  texto?: string; // só em "anotacao"
  ancoras?: V3[]; // só em "anotacao": pontos na peça
  // Medidas digitadas como expressão (ex.: { altura: "largura * 2" }). O número em
  // "params" é o último resultado; o projeto recalcula antes de mandar ao núcleo.
  expressoes?: Record<string, string>;
  // Só em "operacaoBase": corpos congelados (sólido = BRep em texto; malha = pontos
  // e triângulos em base64). "corpos" = corpos que foram apagados dentro dela.
  congelados?: { nome: string; tipo: "solido" | "malha"; dados: string; tri?: string; material?: string; aparencia?: string }[];
  suprimida?: boolean;
}

export interface MalhaCorpo {
  id: string;
  nome: string; // ex.: "Corpo1"
  aparencia: string; // chave em APARENCIAS (materiais.ts)
  material: string; // chave em MATERIAIS
  vertices: Float32Array;
  normais: Float32Array;
  triangulos: Uint32Array;
  arestas: Float32Array; // pares de pontos (linhas)
  // Face n = triângulos [inicio, inicio+quantidade) do índice. Pares [inicio, quantidade].
  gruposFaces: Uint32Array;
  // Aresta n = pontos [inicio, inicio+quantidade) de "arestas". Pares [inicio, quantidade].
  gruposArestas: Uint32Array;
  ehMalha?: boolean; // corpo de malha (só triângulos), não sólido
  ehSuperficie?: boolean; // corpo de superfície (faces sem volume)
}

// Mensagens trocadas com o cálculo em segundo plano (worker).
export interface OpcoesExportar {
  formato: "step" | "stl" | "3mf";
  corpos: string[]; // nomes, ex.: "Corpo1"
  qualidade: "baixa" | "media" | "alta"; // só STL
  zParaCima: boolean; // gira para Z para cima (impressoras 3D)
  // Só 3MF: mesa da impressora (área [x0, y0, x1, y1] e altura, em mm). As peças
  // são distribuídas em quantas mesas precisar (mesas do Bambu Studio), cada grupo
  // no meio da área; "cama" = mesa inteira (as mesas 2, 3… ficam a 1,2 × cama).
  // Sem mesa: 256 × 256.
  mesa?: { area: [number, number, number, number]; altura: number; cama?: [number, number] };
  deitar?: boolean; // só 3MF: cada sólido apoiado na sua maior face plana
}

export type PedidoNucleo =
  | { tipo: "recalcular"; historico: Operacao[]; versao: number; doZero?: boolean }
  | { tipo: "listaMateriais"; historico: Operacao[]; pedido: number }
  | ({ tipo: "exportar"; historico: Operacao[]; pedido: number } & OpcoesExportar)
  | { tipo: "medir"; historico: Operacao[]; pedido: number; itens: ItemMedida[] }
  | { tipo: "propriedades"; historico: Operacao[]; pedido: number; corpo: string }
  | { tipo: "interferencia"; historico: Operacao[]; pedido: number; corpos: string[] }
  | { tipo: "centroMassa"; historico: Operacao[]; pedido: number; corpos: string[] }
  // Forma exata de uma face/aresta (plano, cilindro, reta, círculo...). "t" = ponto ao longo da aresta (0 a 1).
  | { tipo: "geometria"; historico: Operacao[]; pedido: number; item: ItemMedida; t?: number }
  // Origem e eixo Z que uma junta usaria nesta face/aresta (JSON { p, z }).
  | { tipo: "origem"; historico: Operacao[]; pedido: number; item: ItemMedida }
  // Corpos congelados para a Operação base (uma linha JSON por corpo).
  | { tipo: "congelar"; historico: Operacao[]; pedido: number; nomes: string[] }
  | { tipo: "pilhaFixadores"; historico: Operacao[]; pedido: number }
  | { tipo: "faces"; historico: Operacao[]; pedido: number; corpo: string }
  | { tipo: "isocurvas"; historico: Operacao[]; pedido: number }
  // Intersecção do esboço: corte do corpo pelo plano (linhas de pontos 3D, em JSON)
  | { tipo: "secao"; historico: Operacao[]; pedido: number; corpo: string; plano: { origem: V3; eixoX: V3; normal: V3 } };

// Coisa a medir: corpo inteiro, face ou aresta (número dela no corpo).
export interface ItemMedida {
  corpo: string;
  tipo: "corpo" | "face" | "aresta";
  indice: number;
}

export type RespostaNucleo =
  | { tipo: "pronto"; segundos: number }
  | {
      tipo: "resultado";
      versao: number;
      corpos: MalhaCorpo[];
      erros: Record<string, string>;
      ms?: number; // tempo do recálculo
      reaproveitados?: number; // passos do histórico que não precisaram ser refeitos
    }
  | { tipo: "falha"; mensagem: string }
  | { tipo: "exportado"; pedido: number; dados?: ArrayBuffer; erro?: string; aviso?: string }
  | { tipo: "medido"; pedido: number; linhas?: string[]; erro?: string };
