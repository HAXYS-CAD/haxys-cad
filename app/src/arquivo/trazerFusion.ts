// Trazer do Fusion: o servidor (/api/fusion) lê pela porta 27185 o desenho aberto
// no Fusion e devolve a linha do tempo e a malha das faces de cada operação.
// Aqui vira um passo "malhaFusion" por operação (mesmo nome), cada um com seu
// grupo de faces: passar o mouse na peça destaca o pedaço daquela operação.
// Diferença do Fusion: só para ver; as medidas não se editam aqui.
import type { Operacao } from "../nucleo/tipos";

export interface DesenhoFusion {
  documento: string;
  passos: { nome: string; tipo: string; suprimido: boolean }[];
  corpos: { nome: string; grupos: { passo: number; pos: string; tri: string }[] }[];
}

// Tipo do Fusion → ícone parecido do HAXYS CAD na linha do tempo.
const ICONES: Record<string, string> = {
  Sketch: "esboco",
  ExtrudeFeature: "extrusao",
  RevolveFeature: "revolucao",
  FilletFeature: "arredondamento",
  ChamferFeature: "chanfro",
  CircularPatternFeature: "padraoCircular",
  RectangularPatternFeature: "padraoRetangular",
  MirrorFeature: "espelhar",
  ConstructionPlane: "plano",
  ConstructionAxis: "eixo",
  ConstructionPoint: "ponto",
  OffsetFacesFeature: "deslocarFace",
  ShellFeature: "casca",
  HoleFeature: "furo",
  SweepFeature: "varredura",
  LoftFeature: "transicao",
  CombineFeature: "combinar",
};

export async function lerDoFusion(): Promise<DesenhoFusion> {
  const r = await fetch("/api/fusion", { method: "POST" });
  const d = await r.json().catch(() => ({ erro: `resposta inválida (${r.status})` }));
  if (!r.ok) throw new Error(d.erro ?? `erro ${r.status}`);
  return d as DesenhoFusion;
}

export function paraOperacoes(d: DesenhoFusion): Operacao[] {
  const malhaDe = (passo: number) =>
    d.corpos.flatMap((c) => c.grupos.filter((g) => g.passo === passo).map((g) => ({ corpo: c.nome, pos: g.pos, tri: g.tri })));
  const ops: Operacao[] = d.passos.map((p, i) => ({
    id: crypto.randomUUID(),
    tipo: "malhaFusion",
    nome: p.nome,
    modo: "novo",
    params: {},
    opcoes: { icone: ICONES[p.tipo] ?? "", tipoFusion: p.tipo },
    fusion: malhaDe(i),
    suprimida: p.suprimido || undefined,
  }));
  // Faces que nenhuma operação diz ter feito (o Fusion devolve -1).
  const soltas = malhaDe(-1);
  if (soltas.length) ops.push({ id: crypto.randomUUID(), tipo: "malhaFusion", nome: "Outras faces", modo: "novo", params: {}, opcoes: { icone: "" }, fusion: soltas });
  return ops;
}
