// Comandos Caixa, Cilindro, Esfera e Bobina (painel Criar).
// Diferença do Fusion, por enquanto: posição digitada (X, Y, Z) em vez de
// escolher o plano e desenhar com o mouse; a Bobina fica sempre em pé (eixo Y),
// com "voltas e altura" (o Fusion também aceita passo, e seção triangular interna).
import type { Campo, CampoEscolha } from "../ui/dialogo";
import { abrirDialogo } from "../ui/dialogo";
import type { Operacao, TipoOperacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";

interface Definicao {
  tipo: TipoOperacao;
  titulo: string;
  base: string; // prefixo do nome na linha do tempo
  campos: Campo[];
  escolhas?: CampoEscolha[];
}

const POSICAO: Campo[] = [
  { chave: "x", rotulo: "Posição X", valor: 0 },
  { chave: "y", rotulo: "Posição Y", valor: 0 },
  { chave: "z", rotulo: "Posição Z", valor: 0 },
];

export const PRIMITIVAS: Record<string, Definicao> = {
  PrimitiveBox: {
    tipo: "caixa",
    titulo: "Caixa",
    base: "Caixa",
    campos: [
      { chave: "comprimento", rotulo: "Comprimento", valor: 50 },
      { chave: "largura", rotulo: "Largura", valor: 50 },
      { chave: "altura", rotulo: "Altura", valor: 50 },
      ...POSICAO,
    ],
  },
  PrimitiveCylinder: {
    tipo: "cilindro",
    titulo: "Cilindro",
    base: "Cilindro",
    campos: [
      { chave: "diametro", rotulo: "Diâmetro", valor: 50 },
      { chave: "altura", rotulo: "Altura", valor: 50 },
      ...POSICAO,
    ],
  },
  PrimitiveSphere: {
    tipo: "esfera",
    titulo: "Esfera",
    base: "Esfera",
    campos: [{ chave: "diametro", rotulo: "Diâmetro", valor: 50 }, ...POSICAO],
  },
  FusionFastenersCommand: {
    tipo: "fixador",
    titulo: "Elemento de fixação",
    base: "Fixador",
    campos: [{ chave: "comprimento", rotulo: "Comprimento (parafuso)", valor: 20 }, ...POSICAO],
    escolhas: [
      {
        chave: "tipo",
        rotulo: "Tipo",
        opcoes: [["sextavado", "Parafuso sextavado (ISO 4017)"], ["allen", "Parafuso Allen (ISO 4762)"], ["porca", "Porca sextavada (ISO 4032)"], ["arruela", "Arruela lisa (ISO 7089)"]],
        valor: "sextavado",
      },
      { chave: "tamanho", rotulo: "Tamanho", opcoes: ["M2", "M2.5", "M3", "M4", "M5", "M6", "M8", "M10", "M12"].map((m) => [m, m] as [string, string]), valor: "M6" },
      { chave: "rosca", rotulo: "Rosca", opcoes: [["nao", "Só de enfeite (mais leve)"], ["sim", "Modelada"]], valor: "nao" },
    ],
  },
  PrimitiveTorus: {
    tipo: "toroide",
    titulo: "Toroide",
    base: "Toroide",
    campos: [
      { chave: "diametro", rotulo: "Diâmetro (do meio do tubo)", valor: 50 },
      { chave: "diametroSecao", rotulo: "Diâmetro do tubo", valor: 10 },
      ...POSICAO,
    ],
  },
  PrimitiveCoil: {
    tipo: "bobina",
    titulo: "Bobina",
    base: "Bobina",
    campos: [
      { chave: "diametro", rotulo: "Diâmetro", valor: 50 },
      { chave: "voltas", rotulo: "Voltas", valor: 5, unidade: "" },
      { chave: "altura", rotulo: "Altura", valor: 50 },
      { chave: "secaoTamanho", rotulo: "Tamanho da seção", valor: 5 },
      ...POSICAO,
    ],
    escolhas: [
      { chave: "secao", rotulo: "Seção", opcoes: [["circulo", "Circular"], ["quadrado", "Quadrada"], ["triangulo", "Triangular (externa)"]], valor: "circulo" },
      { chave: "posicao", rotulo: "Posição da seção", opcoes: [["centro", "No diâmetro"], ["dentro", "Dentro"], ["fora", "Fora"]], valor: "centro" },
      { chave: "sentido", rotulo: "Sentido", opcoes: [["direita", "Horário (direita)"], ["esquerda", "Anti-horário (esquerda)"]], valor: "direita" },
    ],
  },
};

const PorTipo = Object.values(PRIMITIVAS);

// Abre a janela para criar (sem "existente") ou editar uma operação.
export function comandoPrimitiva(
  raiz: HTMLElement,
  projeto: Projeto,
  idFerramenta: string | null,
  existente?: Operacao,
  superficie = existente?.opcoes?.superficie === "sim", // aba SUPERFÍCIE: só as faces, sem volume
) {
  const def = existente
    ? PorTipo.find((d) => d.tipo === existente.tipo)!
    : PRIMITIVAS[idFerramenta!];
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome(def.base);
  const temCorpos = projeto.estado.corpos.length > 0;

  let opcoes: Record<string, string> = existente?.opcoes ?? {};
  const montar = (params: Record<string, number>, modo: Operacao["modo"]): Operacao => ({
    id,
    tipo: def.tipo,
    nome,
    modo,
    params,
    ...(def.escolhas || superficie ? { opcoes: superficie ? { ...opcoes, superficie: "sim" } : opcoes } : {}),
    suprimida: existente?.suprimida,
  });

  abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : superficie ? `${def.titulo} (superfície)` : def.titulo,
    campos: def.campos.map((c) => ({ ...c, valor: existente?.params[c.chave] ?? c.valor })),
    escolhas: def.escolhas?.map((c) => ({ ...c, valor: opcoes[c.chave] ?? c.valor })),
    modo: superficie ? "novo" : (existente?.modo ?? (temCorpos ? "unir" : "novo")),
    semModo: superficie,
    aoMudar: (params, modo, esc) => {
      opcoes = esc;
      projeto.previsualizar(montar(params, modo));
    },
    aoOK: (params, modo, esc) => {
      opcoes = esc;
      if (existente) projeto.substituir(montar(params, modo));
      else projeto.adicionar(montar(params, modo));
    },
    aoCancelar: () => projeto.previsualizar(null),
  });
}
