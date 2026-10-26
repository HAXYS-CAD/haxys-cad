// Aba SUPERFÍCIE: Extrusão e Transição de superfície (paredes sem tampa,
// a partir das curvas de esboços), primitivas como superfície (Caixa,
// Cilindro, Esfera, Toroide, Espiral: só as faces, sem volume). Costurar,
// Remendo, Aparar e Estender usam a janela comum de corpos (comandos/corpos.ts);
// Espessura usa a do Espessar (comandos/faces.ts).
// Diferenças do Fusion: a extrusão usa todas as curvas do esboço (não dá para
// escolher só algumas), sem afunilar; a transição liga esboços inteiros
// (o contorno do 1º perfil fechado ou as curvas em sequência), sem trilhos.
import { abrirDialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";

export const COMANDOS_SUPERFICIE: Record<string, "extrusao" | "transicao"> = { SurfaceExtrude: "extrusao", SurfaceLoft: "transicao" };
// Primitiva de superfície → a primitiva sólida de mesmo desenho.
export const PRIMITIVAS_SUPERFICIE: Record<string, string> = {
  SurfPrimitiveBox: "PrimitiveBox",
  SurfPrimitiveCylinder: "PrimitiveCylinder",
  SurfPrimitiveSphere: "PrimitiveSphere",
  SurfPrimitiveTorus: "PrimitiveTorus",
  SurfPrimitiveCoil: "PrimitiveCoil",
};

// Ferramentas que o inventário da faixa não trouxe (ficam em menus do Fusion).
export const EXTRAS_SUPERFICIE: { painel: string; nome: string; id: string }[] = [
  { painel: "SurfaceCreatePanel", nome: "Remendo", id: "SurfacePatchCommand" },
  { painel: "SurfaceModifyPanel", nome: "Costurar", id: "SurfaceStitchCommand" },
  { painel: "SurfaceModifyPanel", nome: "Aparar", id: "SurfaceTrimCommand" },
];

export function comandoSuperficie(tipo: "extrusao" | "transicao", raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void, existente?: Operacao) {
  const esbocos = projeto.estado.historico.filter((o) => o.tipo === "esboco" && !o.suprimida && o.id !== existente?.id);
  if (!esbocos.length) return avisar("Crie antes um esboço com as curvas.");
  if (tipo === "transicao" && esbocos.length < 2) return avisar("A transição precisa de dois esboços (um em cada ponta).");
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome(tipo === "extrusao" ? "ExtrusãoSup" : "TransiçãoSup");
  const lista = esbocos.map((o) => [o.id, o.nome] as [string, string]);
  const montar = (v: Record<string, number>, esc: Record<string, string>): Operacao =>
    tipo === "extrusao"
      ? { id, tipo, nome, modo: "novo", params: { distancia: v.distancia }, opcoes: { superficie: "sim", lado: esc.lado }, perfis: { esboco: esc.esboco, indices: [] }, suprimida: existente?.suprimida }
      : {
          id,
          tipo,
          nome,
          modo: "novo",
          params: {},
          opcoes: { superficie: "sim", regrada: esc.regrada },
          secoes: [{ esboco: esc.esboco, indice: 0 }, { esboco: esc.esboco2, indice: 0 }],
          suprimida: existente?.suprimida,
        };
  abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : tipo === "extrusao" ? "Extrusão de superfície" : "Transição de superfície",
    campos: tipo === "extrusao" ? [{ chave: "distancia", rotulo: "Distância", valor: existente?.params.distancia ?? 10 }] : [],
    escolhas:
      tipo === "extrusao"
        ? [
            { chave: "esboco", rotulo: "Esboço (todas as curvas)", opcoes: lista, valor: existente?.perfis?.esboco ?? lista[lista.length - 1][0] },
            { chave: "lado", rotulo: "Direção", opcoes: [["um", "Um lado"], ["simetrico", "Simétrico"]], valor: existente?.opcoes?.lado ?? "um" },
          ]
        : [
            { chave: "esboco", rotulo: "Esboço de início", opcoes: lista, valor: existente?.secoes?.[0]?.esboco ?? lista[lista.length - 2][0] },
            { chave: "esboco2", rotulo: "Esboço de fim", opcoes: lista, valor: existente?.secoes?.[1]?.esboco ?? lista[lista.length - 1][0] },
            { chave: "regrada", rotulo: "Paredes", opcoes: [["nao", "Suaves"], ["sim", "Retas (regrada)"]], valor: existente?.opcoes?.regrada ?? "nao" },
          ],
    modo: "novo",
    semModo: true,
    aoMudar: (v, _m, esc) => projeto.previsualizar(montar(v, esc)),
    aoOK: (v, _m, esc) => (existente ? projeto.substituir(montar(v, esc)) : projeto.adicionar(montar(v, esc))),
    aoCancelar: () => projeto.previsualizar(null),
  });
}
