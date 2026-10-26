// Anotações 3D (painel "Criar PMI"): textos presos na peça.
// - Observação: escolha um ponto (face, aresta ou corpo) e digite o texto;
// - Nota de furo/rosca: escolha a face do furo: ⌀ e profundidade (e a rosca,
//   se o furo tiver uma);
// - Tamanhos e dimensões: uma aresta (comprimento ou ⌀), uma face cilíndrica
//   (⌀) ou dois itens (distância mínima);
// - Tolerância geométrica: escolha a face, o símbolo, o valor e a referência.
// Escolha os itens antes de chamar o comando. A etiqueta fica no ponto + o
// deslocamento (X, Y, Z). Só aparecem na tela.
// Diferenças do Fusion: o texto é guardado na hora (não acompanha se a peça
// mudar depois), sem arrastar a etiqueta com o mouse, sem planos de anotação
// e não sai no STEP.
import { abrirDialogo } from "../ui/dialogo";
import type { MalhaCorpo, Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Selecao } from "../vista/selecao";
import type { V3 } from "../nucleo/esboco";

export type TipoAnotacao = "observacao" | "furo" | "dimensao" | "tolerancia";
export const COMANDOS_ANOTACAO: Record<string, TipoAnotacao> = {
  LeaderLineNoteCommand: "observacao",
  HoleThreadNoteCommand: "furo",
  DimensionNoteCommand: "dimensao",
  GeometricToleranceNoteCommand: "tolerancia",
};

const SIMBOLOS: [string, string][] = [
  ["⏥", "⏥ Planeza"],
  ["⏤", "⏤ Retitude"],
  ["○", "○ Circularidade"],
  ["⌭", "⌭ Cilindricidade"],
  ["∥", "∥ Paralelismo"],
  ["⊥", "⊥ Perpendicularidade"],
  ["∠", "∠ Inclinação"],
  ["⌖", "⌖ Posição"],
  ["◎", "◎ Concentricidade"],
  ["⌯", "⌯ Simetria"],
  ["↗", "↗ Batimento"],
  ["⌓", "⌓ Perfil de linha"],
  ["⌒", "⌒ Perfil de superfície"],
];
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

// Centro do item na malha da tela: média dos triângulos (face), meio do
// caminho (aresta) ou centro da caixa (corpo).
export function centroDoItem(c: MalhaCorpo, it: ItemSelecionado): V3 {
  const P = (i: number): V3 => [c.vertices[i * 3], c.vertices[i * 3 + 1], c.vertices[i * 3 + 2]];
  if (it.tipo === "face") {
    const ini = c.gruposFaces[it.indice * 2], qtd = c.gruposFaces[it.indice * 2 + 1];
    const s = [0, 0, 0];
    let area = 0;
    for (let t = ini; t < ini + qtd; t += 3) {
      const [a, b, d] = [P(c.triangulos[t]), P(c.triangulos[t + 1]), P(c.triangulos[t + 2])];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const A = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
      for (let k = 0; k < 3; k++) s[k] += ((a[k] + b[k] + d[k]) / 3) * A;
      area += A;
    }
    return s.map((x) => x / (area || 1)) as V3;
  }
  if (it.tipo === "aresta") {
    const ini = c.gruposArestas[it.indice * 2], qtd = c.gruposArestas[it.indice * 2 + 1];
    const Q = (i: number): V3 => [c.arestas[i * 3], c.arestas[i * 3 + 1], c.arestas[i * 3 + 2]];
    const segs: [V3, V3, number][] = [];
    for (let i = ini; i + 1 < ini + qtd; i += 2) segs.push([Q(i), Q(i + 1), Math.hypot(...Q(i + 1).map((x, k) => x - Q(i)[k]))]);
    const total = segs.reduce((s, x) => s + x[2], 0);
    let falta = total / 2;
    for (const [a, b, L] of segs) {
      if (falta <= L) return a.map((x, k) => x + ((b[k] - x) * falta) / (L || 1)) as V3;
      falta -= L;
    }
    return segs[0]?.[0] ?? [0, 0, 0];
  }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < c.vertices.length; i += 3)
    for (let k = 0; k < 3; k++) (mn[k] = Math.min(mn[k], c.vertices[i + k])), (mx[k] = Math.max(mx[k], c.vertices[i + k]));
  return mn.map((x, k) => (x + mx[k]) / 2) as V3;
}

// Profundidade de uma face cilíndrica: quanto a face anda ao longo do eixo.
function alturaNoEixo(c: MalhaCorpo, indice: number, origem: V3, direcao: V3): number {
  const ini = c.gruposFaces[indice * 2], qtd = c.gruposFaces[indice * 2 + 1];
  let mn = Infinity, mx = -Infinity;
  for (let t = ini; t < ini + qtd; t++) {
    const i = c.triangulos[t];
    const s = (c.vertices[i * 3] - origem[0]) * direcao[0] + (c.vertices[i * 3 + 1] - origem[1]) * direcao[1] + (c.vertices[i * 3 + 2] - origem[2]) * direcao[2];
    mn = Math.min(mn, s);
    mx = Math.max(mx, s);
  }
  return mx - mn;
}

const numeroDe = (linhas: string[], rotulo: string) => linhas.find((l) => l.startsWith(rotulo))?.split(":")[1]?.replace("mm", "").trim();

export async function comandoAnotacao(
  tipo: TipoAnotacao,
  raiz: HTMLElement,
  projeto: Projeto,
  selecao: Selecao,
  avisar: (t: string) => void,
  existente?: Operacao,
) {
  const itens: ItemSelecionado[] = existente?.referencias ?? selecao.itens();
  const malha = (n: string) => projeto.estado.corposBase.find((c) => c.nome === n);
  const faltou = (t: string) => avisar(`${t} Escolha antes na peça e depois chame o comando.`);
  let texto = existente?.texto ?? "";
  let ancoras: V3[] = existente?.ancoras ?? [];
  if (!existente) {
    if (tipo === "dimensao" ? !itens.length || itens.length > 2 : itens.length !== 1)
      return faltou(tipo === "dimensao" ? "Tamanhos e dimensões: uma aresta, uma face ou dois itens." : "Escolha um item (face, aresta ou corpo).");
    if ((tipo === "furo" || tipo === "tolerancia") && itens[0].tipo !== "face") return faltou("Escolha uma face.");
    for (const it of itens) {
      const m = malha(it.corpo);
      if (!m) return avisar(`${it.corpo} não existe mais.`);
      ancoras.push(centroDoItem(m, it));
    }
    try {
      if (tipo === "observacao") {
        const t = prompt("Texto da observação:", "Observação");
        if (!t?.trim()) return;
        texto = t.trim();
      } else if (tipo === "furo") {
        const g = (await projeto.geometria(itens[0])) as { tipo: string; origem: V3; direcao: V3; raio: number };
        if (g.tipo !== "cilindro" || !(g.raio > 0)) return avisar("A face escolhida não é a parede de um furo (cilíndrica).");
        const prof = alturaNoEixo(malha(itens[0].corpo)!, itens[0].indice, g.origem, g.direcao);
        const rosca = projeto.estado.historico.find(
          (o) => o.tipo === "rosca" && !o.suprimida && o.referencias?.some((r) => r.corpo === itens[0].corpo && r.tipo === "face" && r.indice === itens[0].indice),
        );
        texto = rosca ? `M${rosca.opcoes?.tamanho ?? ""} ↧ ${fmt(prof)}` : `⌀${fmt(2 * g.raio)} ↧ ${fmt(prof)}`;
      } else if (tipo === "dimensao") {
        if (itens.length === 2) {
          const d = numeroDe(await projeto.medir(itens), "Distância mínima");
          if (!d) return avisar("Não foi possível medir a distância.");
          texto = d;
        } else {
          const it = itens[0];
          const g = it.tipo === "corpo" ? null : ((await projeto.geometria(it)) as { tipo: string; raio?: number });
          if (g?.tipo === "circulo" || g?.tipo === "cilindro") texto = `⌀${fmt(2 * (g.raio ?? 0))}`;
          else if (it.tipo === "aresta") texto = numeroDe(await projeto.medir([it]), "Comprimento") ?? "";
          else return avisar("Com um item só, escolha uma aresta ou uma face cilíndrica.");
          // Linha de cota de ponta a ponta da aresta reta.
          if (it.tipo === "aresta" && g?.tipo === "reta") {
            const r = g as unknown as { a: V3; b: V3 };
            ancoras = [r.a, r.b];
          }
        }
      }
    } catch (e) {
      return avisar(e instanceof Error ? e.message : String(e));
    }
  }
  const id = existente?.id ?? crypto.randomUUID();
  const base = { observacao: "Observação", furo: "NotaFuro", dimensao: "Dimensão", tolerancia: "Tolerância" }[tipo];
  const nome = existente?.nome ?? projeto.proximoNome(base);
  const montar = (v: Record<string, number>, esc: Record<string, string>): Operacao => ({
    id,
    tipo: "anotacao",
    nome,
    modo: "novo",
    params: { dx: v.dx, dy: v.dy, dz: v.dz, ...(tipo === "tolerancia" ? { tolerancia: v.tolerancia } : {}) },
    opcoes: { tipo, ...esc },
    texto: tipo === "tolerancia" ? [esc.simbolo, fmt(v.tolerancia), ...(esc.referencia !== "-" ? [esc.referencia] : [])].join("|") : texto,
    ancoras,
    referencias: itens.flatMap((i) => (i.tipo === "corpo" ? [] : [{ corpo: i.corpo, tipo: i.tipo, indice: i.indice }])),
    suprimida: existente?.suprimida,
  });
  const p = existente?.params;
  abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : { observacao: "Observação", furo: "Nota de furo/rosca", dimensao: "Tamanhos e dimensões", tolerancia: "Tolerância geométrica" }[tipo],
    campos: [
      ...(tipo === "tolerancia" ? [{ chave: "tolerancia", rotulo: "Tolerância", valor: p?.tolerancia ?? 0.05 }] : []),
      { chave: "dx", rotulo: "Etiqueta: deslocar X", valor: p?.dx ?? (tipo === "dimensao" ? 0 : 12) },
      { chave: "dy", rotulo: "Etiqueta: deslocar Y", valor: p?.dy ?? 12 },
      { chave: "dz", rotulo: "Etiqueta: deslocar Z", valor: p?.dz ?? 0 },
    ],
    escolhas:
      tipo === "tolerancia"
        ? [
            { chave: "simbolo", rotulo: "Característica", opcoes: SIMBOLOS, valor: existente?.opcoes?.simbolo ?? "⏥" },
            { chave: "referencia", rotulo: "Referência", opcoes: [["-", "Nenhuma"], ["A", "A"], ["B", "B"], ["C", "C"], ["A|B", "A e B"], ["A|B|C", "A, B e C"]], valor: existente?.opcoes?.referencia ?? "-" },
          ]
        : [],
    modo: "novo",
    semModo: true,
    rotuloSelecao: "Texto",
    selecao: tipo === "tolerancia" ? undefined : texto,
    aoMudar: (v, _m, esc) => projeto.previsualizar(montar(v, esc)),
    aoOK: (v, _m, esc) => (existente ? projeto.substituir(montar(v, esc)) : projeto.adicionar(montar(v, esc))),
    aoCancelar: () => projeto.previsualizar(null),
  });
}
