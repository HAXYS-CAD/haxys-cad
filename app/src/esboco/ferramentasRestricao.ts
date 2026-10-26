// Ferramentas do painel RESTRIÇÕES do esboço: o que clicar e o que cada uma cria.
// Também os símbolos que aparecem no desenho (H, V, ∥, ⊥, =, T…), como no Fusion.
import { amostrarCurva, idsDaCurva, type CurvaEsboco, type DadosEsboco, type P2 } from "../nucleo/esboco";
import type { Restricao } from "../nucleo/restricoes";

export type TipoFerramentaRestricao =
  | "hv" | "coincidente" | "tangente" | "igual" | "paralelo" | "perpendicular"
  | "fixo" | "pontoMedio" | "concentrico" | "colinear" | "simetria" | "curvatura" | "poligono";

// Ids do Fusion → ferramenta.
export const FERRAMENTAS_RESTRICAO: Record<string, TipoFerramentaRestricao> = {
  ConstraintHorizontalVertical: "hv",
  ConstraintCoincident: "coincidente",
  ConstraintTangent: "tangente",
  ConstraintEqual: "igual",
  ConstraintParallel: "paralelo",
  ConstraintPerpendicular: "perpendicular",
  ConstraintFix: "fixo",
  ConstraintMidPoint: "pontoMedio",
  ConstraintConcentric: "concentrico",
  ConstraintCollinear: "colinear",
  ConstraintSymmetry: "simetria",
  ConstraintSmooth: "curvatura",
  SketchPolygonConstraintCmd: "poligono",
};

export const NOMES_RESTRICAO: Record<TipoFerramentaRestricao, string> = {
  hv: "Horizontal/vertical: clique numa linha",
  coincidente: "Coincidente: clique num ponto e depois noutro ponto ou numa curva",
  tangente: "Tangente: clique em duas curvas (uma redonda)",
  igual: "Igual: clique em duas linhas ou dois círculos/arcos",
  paralelo: "Paralelo: clique em duas linhas",
  perpendicular: "Perpendicular: clique em duas linhas",
  fixo: "Fixo: clique num ponto ou numa curva",
  pontoMedio: "Ponto médio: clique num ponto e numa linha",
  concentrico: "Concêntrico: clique em dois círculos/arcos",
  colinear: "Colinear: clique em duas linhas",
  simetria: "Simetria: clique em dois pontos e na linha do meio",
  curvatura: "Curvatura: clique numa spline e na linha/arco que encosta na ponta dela",
  poligono: "Polígono: clique numa linha de um contorno fechado só de linhas",
};

export type Escolha = { tipo: "ponto"; id: number } | { tipo: "curva"; id: number };

// Resultado: ainda falta clicar, deu errado, ou pronto (muda o esboço e diz quem pode se mexer).
export type Montagem =
  | { falta: string }
  | { erro: string }
  | { aplicar: (e: DadosEsboco) => Set<number> };

const curvaDe = (e: DadosEsboco, id: number) => e.curvas.find((c) => c.id === id)!;
const redonda = (c: CurvaEsboco) => c.tipo === "circulo" || c.tipo === "arco";

export function pontosDaCurvaIds(c: CurvaEsboco): number[] {
  return idsDaCurva(c);
}

const novoId = (lista: { id: number }[]) => lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;

// Restrição sem o id (o id é dado aqui). Vale para cada tipo da lista.
type SemId<T> = T extends unknown ? Omit<T, "id"> : never;

function adicionar(e: DadosEsboco, r: SemId<Restricao>) {
  e.restricoes ??= [];
  e.restricoes.push({ ...r, id: novoId(e.restricoes) } as Restricao);
}

// Junta dois pontos num só (o "fica" continua; o "sai" some e quem usava passa a usar "fica").
function juntarPontos(e: DadosEsboco, sai: number, fica: number) {
  const troca = (id: number) => (id === sai ? fica : id);
  for (const c of e.curvas) {
    if (c.tipo === "linha") (c.a = troca(c.a)), (c.b = troca(c.b));
    else if (c.tipo === "circulo") c.centro = troca(c.centro);
    else if (c.tipo === "arco") (c.centro = troca(c.centro)), (c.a = troca(c.a)), (c.b = troca(c.b));
    else if (c.tipo === "elipse") (c.centro = troca(c.centro)), (c.a = troca(c.a));
    else (c.a = troca(c.a)), (c.b = troca(c.b)), (c.internos = c.internos.map(troca));
  }
  for (const r of e.restricoes ?? []) {
    if ("ponto" in r) r.ponto = troca(r.ponto);
    if (r.tipo === "simetria") (r.p1 = troca(r.p1)), (r.p2 = troca(r.p2));
  }
  e.pontos = e.pontos.filter((p) => p.id !== sai);
  // Linha com as duas pontas no mesmo ponto não existe mais.
  e.curvas = e.curvas.filter((c) => !(c.tipo === "linha" && c.a === c.b));
}

export function montarRestricao(tipo: TipoFerramentaRestricao, esc: Escolha[], e: DadosEsboco): Montagem {
  const curvas = esc.filter((x) => x.tipo === "curva").map((x) => curvaDe(e, x.id));
  const pontos = esc.filter((x) => x.tipo === "ponto").map((x) => x.id);
  const ultima = esc[esc.length - 1];
  const linhas = curvas.filter((c) => c.tipo === "linha");

  switch (tipo) {
    case "hv": {
      if (!linhas.length) return esc.length ? { erro: "Escolha uma linha." } : { falta: NOMES_RESTRICAO.hv };
      const l = linhas[0] as Extract<CurvaEsboco, { tipo: "linha" }>;
      return {
        aplicar(d) {
          const c = curvaDe(d, l.id) as Extract<CurvaEsboco, { tipo: "linha" }>;
          const a = d.pontos.find((p) => p.id === c.a)!, b = d.pontos.find((p) => p.id === c.b)!;
          c.restricao = Math.abs(b.u - a.u) >= Math.abs(b.v - a.v) ? "h" : "v";
          return new Set([c.b]);
        },
      };
    }
    case "fixo": {
      if (!esc.length) return { falta: NOMES_RESTRICAO.fixo };
      const ids = ultima.tipo === "ponto" ? [ultima.id] : pontosDaCurvaIds(curvaDe(e, ultima.id));
      return { aplicar: (d) => (ids.forEach((p) => adicionar(d, { tipo: "fixo", ponto: p })), new Set()) };
    }
    case "coincidente": {
      if (esc.length < 2) return { falta: esc.length ? "Agora clique noutro ponto ou numa curva." : NOMES_RESTRICAO.coincidente };
      if (pontos.length === 2) {
        // O primeiro ponto vai até o segundo (a origem nunca sai do lugar).
        let [sai, fica] = pontos;
        if (sai === 0) [sai, fica] = [fica, sai];
        if (sai === fica) return { erro: "É o mesmo ponto." };
        return { aplicar: (d) => (juntarPontos(d, sai, fica), new Set(d.curvas.flatMap(pontosDaCurvaIds))) };
      }
      if (pontos.length !== 1 || curvas.length !== 1) return { erro: "Escolha um ponto e uma curva." };
      const p = pontos[0], c = curvas[0];
      if (pontosDaCurvaIds(c).includes(p) && c.tipo !== "circulo" && c.tipo !== "elipse") return { erro: "O ponto já é ponta dessa curva." };
      return { aplicar: (d) => (adicionar(d, { tipo: "coincidente", ponto: p, curva: c.id }), new Set([p])) };
    }
    case "pontoMedio": {
      if (esc.length < 2) return { falta: esc.length ? "Agora clique no outro (ponto ou linha)." : NOMES_RESTRICAO.pontoMedio };
      if (pontos.length !== 1 || linhas.length !== 1) return { erro: "Escolha um ponto e uma linha." };
      const p = pontos[0], l = linhas[0];
      return { aplicar: (d) => (adicionar(d, { tipo: "pontoMedio", ponto: p, curva: l.id }), new Set([p])) };
    }
    case "poligono": {
      if (!linhas.length) return esc.length ? { erro: "Escolha uma linha." } : { falta: NOMES_RESTRICAO.poligono };
      // Anda pelas linhas ligadas ponta com ponta até voltar ao começo.
      const todas = e.curvas.filter((c): c is Extract<CurvaEsboco, { tipo: "linha" }> => c.tipo === "linha");
      const laco = [linhas[0] as Extract<CurvaEsboco, { tipo: "linha" }>];
      let ponta = laco[0].b;
      while (ponta !== laco[0].a && laco.length <= todas.length) {
        const prox = todas.filter((l) => !laco.includes(l) && (l.a === ponta || l.b === ponta));
        if (prox.length !== 1) return { erro: "As linhas precisam formar um contorno fechado simples (cada canto com 2 linhas)." };
        laco.push(prox[0]);
        ponta = prox[0].a === ponta ? prox[0].b : prox[0].a;
      }
      if (ponta !== laco[0].a || laco.length < 3) return { erro: "O contorno não fecha (precisa de 3 linhas ou mais)." };
      const ids = laco.map((l) => l.id);
      return { aplicar: (d) => (adicionar(d, { tipo: "poligono", curvas: ids }), new Set(laco.flatMap((l) => [l.a, l.b]))) };
    }
    case "curvatura": {
      if (esc.length < 2) return { falta: esc.length ? "Agora clique na linha ou no arco." : NOMES_RESTRICAO.curvatura };
      const sp = curvas.find((c) => c.tipo === "spline");
      const outra = curvas.find((c) => c !== sp && (c.tipo === "linha" || c.tipo === "arco"));
      if (curvas.length !== 2 || !sp || sp.tipo !== "spline" || !outra || (outra.tipo !== "linha" && outra.tipo !== "arco"))
        return { erro: "Escolha uma spline e uma linha ou arco." };
      if (![sp.a, sp.b].some((p) => p === outra.a || p === outra.b))
        return { erro: "A spline e a outra curva precisam ter uma ponta em comum (use Coincidente antes)." };
      return { aplicar: (d) => (adicionar(d, { tipo: "curvatura", c1: sp.id, c2: outra.id }), new Set(pontosDaCurvaIds(curvaDe(d, sp.id)))) };
    }
    case "simetria": {
      if (esc.length < 3) return { falta: ["Clique no primeiro ponto.", "Agora o segundo ponto.", "Agora a linha do meio."][esc.length] };
      if (pontos.length !== 2 || linhas.length !== 1) return { erro: "Escolha dois pontos e uma linha." };
      const [p1, p2] = pontos, l = linhas[0];
      return { aplicar: (d) => (adicionar(d, { tipo: "simetria", p1, p2, curva: l.id }), new Set([p2])) };
    }
    default: {
      // Restrições entre duas curvas.
      if (esc.length < 2) return { falta: esc.length ? "Agora clique na segunda curva." : NOMES_RESTRICAO[tipo] };
      if (curvas.length !== 2 || curvas[0].id === curvas[1].id) return { erro: "Escolha duas curvas diferentes." };
      const [c1, c2] = curvas;
      const soLinhas = c1.tipo === "linha" && c2.tipo === "linha";
      const soRedondas = redonda(c1) && redonda(c2);
      if ((tipo === "paralelo" || tipo === "perpendicular" || tipo === "colinear") && !soLinhas)
        return { erro: "Escolha duas linhas." };
      if (tipo === "concentrico" && !soRedondas) return { erro: "Escolha dois círculos ou arcos." };
      if (tipo === "igual" && !soLinhas && !soRedondas) return { erro: "Escolha duas linhas ou dois círculos/arcos." };
      if (tipo === "tangente" && soLinhas) return { erro: "Uma das curvas precisa ser círculo ou arco." };
      let interna = false;
      if (tipo === "tangente" && soRedondas) {
        // Interna ou externa: a que estiver mais perto agora.
        const k = (c: CurvaEsboco) => {
          const pts = amostrarCurva(e, c);
          const ctr = c.tipo === "circulo" ? e.pontos.find((p) => p.id === c.centro)! : e.pontos.find((p) => p.id === (c as { centro: number }).centro)!;
          return { c: [ctr.u, ctr.v] as P2, r: Math.hypot(pts[0][0] - ctr.u, pts[0][1] - ctr.v) };
        };
        const a = k(c1), b = k(c2);
        const d = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]);
        interna = Math.abs(d - Math.abs(a.r - b.r)) < Math.abs(d - (a.r + b.r));
      }
      return {
        aplicar(d) {
          adicionar(d, { tipo, c1: c1.id, c2: c2.id, ...(tipo === "tangente" ? { interna } : {}) } as SemId<Restricao>);
          return new Set(pontosDaCurvaIds(curvaDe(d, c2.id)));
        },
      };
    }
  }
}

// ---- Símbolos no desenho ----

export interface Simbolo {
  chave: string; // "r:<id>" (restrição) ou "hv:<curva>" (horizontal/vertical da linha)
  texto: string;
  pos: P2; // no plano do esboço
}

const TEXTO: Record<Restricao["tipo"], string> = {
  coincidente: "●", tangente: "T", igual: "=", paralelo: "∥", perpendicular: "⊥",
  colinear: "≡", concentrico: "◎", fixo: "🔒", pontoMedio: "M", simetria: "S",
  curvatura: "G2", poligono: "⬡",
};

function ancora(e: DadosEsboco, c: CurvaEsboco): P2 {
  const pts = amostrarCurva(e, c);
  if (pts.length === 2) return [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]; // meio da linha
  return pts[Math.floor(pts.length / 2)];
}

export function simbolosDoEsboco(e: DadosEsboco): Simbolo[] {
  const lista: Simbolo[] = [];
  const pos = (id: number): P2 => {
    const p = e.pontos.find((q) => q.id === id)!;
    return [p.u, p.v];
  };
  for (const c of e.curvas) {
    if (c.tipo === "linha" && c.restricao) lista.push({ chave: `hv:${c.id}`, texto: c.restricao.toUpperCase(), pos: ancora(e, c) });
  }
  for (const r of e.restricoes ?? []) {
    const chave = `r:${r.id}`;
    const texto = TEXTO[r.tipo];
    if (r.tipo === "fixo" || r.tipo === "coincidente" || r.tipo === "pontoMedio") lista.push({ chave, texto, pos: pos(r.ponto) });
    else if (r.tipo === "simetria") lista.push({ chave, texto, pos: pos(r.p1) }, { chave, texto, pos: pos(r.p2) });
    else if (r.tipo === "poligono") {
      const c = e.curvas.find((x) => x.id === r.curvas[0]);
      if (c) lista.push({ chave, texto, pos: ancora(e, c) });
    }
    else
      for (const id of [r.c1, r.c2]) {
        const c = e.curvas.find((x) => x.id === id);
        if (c) lista.push({ chave, texto, pos: ancora(e, c) });
      }
  }
  return lista;
}

export function apagarSimbolo(e: DadosEsboco, chave: string) {
  const [tipo, id] = chave.split(":");
  if (tipo === "hv") {
    const c = e.curvas.find((x) => x.id === Number(id));
    if (c && c.tipo === "linha") delete c.restricao;
  } else e.restricoes = (e.restricoes ?? []).filter((r) => r.id !== Number(id));
}
