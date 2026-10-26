// Operação base (aba Sólido) e Edição direta de malha (aba Malha), como no Fusion:
// - Criar operação base / Edição direta / Criar recurso de malha base: começa;
//   a faixa mostra a aba "SÓLIDO DO RECURSO BASE" (ou "Edição direta de malha");
// - os comandos usados enquanto isso entram normalmente;
// - Concluir: tudo o que foi feito vira UMA operação na linha do tempo, com os
//   corpos congelados (sem histórico: não dá mais para editar as medidas).
// Diferenças do Fusion: esboços feitos dentro somem junto (no Fusion ficam
// dentro da operação base); editar a operação base depois não é possível
// (dá para suprimir ou apagar, como qualquer operação).
import type { Projeto } from "../nucleo/projeto";
import type { MalhaCorpo, Operacao } from "../nucleo/tipos";

let inicio: { tamanho: number; assinaturas: Map<string, string>; malha: boolean } | null = null;

export const COMANDOS_BASE: Record<string, "solido" | "malha" | "concluir"> = {
  BaseFeatureCreationCommand: "solido",
  ParaMeshBaseFeatureCreateCommand: "malha",
  ParaMeshEmptyBaseFeatureCommand: "malha",
  BaseFeatureStop: "concluir",
  ParaMeshBaseFeatureStopCommand: "concluir",
};

// "Impressão digital" da forma mostrada (muda quando o corpo muda).
function assinatura(c: MalhaCorpo): string {
  let s = 0;
  for (let i = 0; i < c.vertices.length; i += 7) s = (s * 31 + Math.round(c.vertices[i] * 1000)) | 0;
  return `${c.vertices.length}:${c.triangulos.length}:${s}`;
}

export function emOperacaoBase(): boolean {
  return inicio !== null;
}

export async function comandoOperacaoBase(
  qual: "solido" | "malha" | "concluir",
  projeto: Projeto,
  abas: { abrir(id: string): void; fechar(): void },
  avisar: (t: string) => void,
) {
  if (qual !== "concluir") {
    if (inicio) return avisar("Já há uma operação base aberta: conclua antes.");
    await projeto.quandoCalculado();
    inicio = {
      tamanho: projeto.estado.historico.length,
      assinaturas: new Map(projeto.estado.corposBase.map((c) => [c.nome, assinatura(c)])),
      malha: qual === "malha",
    };
    abas.abrir(qual === "malha" ? "ParaMeshBaseFeatureTab" : "BasefeatureSolidTab");
    return avisar(qual === "malha" ? "Edição direta de malha: use as ferramentas e depois Concluir edição direta." : "Operação base aberta: o que fizer agora fica sem histórico ao Concluir.");
  }
  if (!inicio) return avisar("Não há operação base aberta.");
  const { tamanho, assinaturas, malha } = inicio;
  inicio = null;
  abas.fechar();
  await projeto.quandoCalculado();
  const h = projeto.estado.historico;
  // Operações que ficam de fora (não mudam corpos): aparência, material, parâmetros...
  const dentro = h.slice(tamanho).filter((o) => !["parametros", "contatos", "posicao", "aparencia", "material"].includes(o.tipo));
  if (!dentro.length) return avisar("A operação base ficou vazia (nada foi feito).");
  const agora = projeto.estado.corposBase;
  const mudados = agora.filter((c) => assinaturas.get(c.nome) !== assinatura(c)).map((c) => c.nome);
  const apagados = [...assinaturas.keys()].filter((n) => !agora.some((c) => c.nome === n));
  try {
    const congelados = await projeto.congelar(mudados, h);
    const nome = projeto.proximoNome(malha ? "EdiçãoDireta" : "OperaçãoBase");
    const op: Operacao = { id: crypto.randomUUID(), tipo: "operacaoBase", nome, modo: "novo", params: {}, congelados, corpos: apagados };
    const fora = new Set(dentro.map((o) => o.id));
    projeto.carregarComDesfazer([...h.filter((o) => !fora.has(o.id)), op]);
    avisar(`${nome}: ${dentro.length} operação(ões) viraram 1 (${congelados.length} corpo(s) congelado(s)).`);
  } catch (e) {
    avisar(`Não deu para concluir: ${e instanceof Error ? e.message : String(e)}`);
  }
}
