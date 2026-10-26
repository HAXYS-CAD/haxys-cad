// Esboço de corte de malha (aba MALHA) e Ajustar curvas à seção da malha:
// corta um corpo (de malha ou sólido, pela malha da tela) por um plano e cria um
// esboço com o contorno. "Ajustar curvas" simplifica o contorno (menos linhas,
// até a tolerância), bom para redesenhar peças escaneadas.
// Diferença do Fusion: o ajuste vira só linhas retas (o Fusion também acha arcos
// e splines); o corte é sempre por um plano da origem deslocado.
import { abrirDialogo } from "../ui/dialogo";
import { PLANOS_ORIGEM, type DadosEsboco, type PlanoEsboco, type V3 } from "../nucleo/esboco";
import type { MalhaCorpo, Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";

type P2 = [number, number];

// Laços (listas de pontos u,v) onde o plano corta os triângulos do corpo.
export function cortarCorpo(m: MalhaCorpo, plano: PlanoEsboco): P2[][] {
  const { origem, eixoX, normal } = plano;
  const eixoY: V3 = [normal[1] * eixoX[2] - normal[2] * eixoX[1], normal[2] * eixoX[0] - normal[0] * eixoX[2], normal[0] * eixoX[1] - normal[1] * eixoX[0]];
  const v = m.vertices, t = m.triangulos;
  const pt = (i: number): V3 => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
  const dist = (p: V3) => (p[0] - origem[0]) * normal[0] + (p[1] - origem[1]) * normal[1] + (p[2] - origem[2]) * normal[2];
  const uv = (p: V3): P2 => {
    const d = [p[0] - origem[0], p[1] - origem[1], p[2] - origem[2]];
    return [d[0] * eixoX[0] + d[1] * eixoX[1] + d[2] * eixoX[2], d[0] * eixoY[0] + d[1] * eixoY[1] + d[2] * eixoY[2]];
  };
  const segs: [P2, P2][] = [];
  for (let i = 0; i < t.length; i += 3) {
    const ps = [pt(t[i]), pt(t[i + 1]), pt(t[i + 2])];
    // Desvio minúsculo evita ponto exatamente no plano (dá segmento duplo).
    const ds = ps.map((p) => dist(p) + 1e-9);
    const cortes: P2[] = [];
    for (let k = 0; k < 3; k++) {
      const a = ps[k], b = ps[(k + 1) % 3], da = ds[k], db = ds[(k + 1) % 3];
      if ((da < 0) !== (db < 0)) {
        const s = da / (da - db);
        cortes.push(uv([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]));
      }
    }
    if (cortes.length === 2) segs.push([cortes[0], cortes[1]]);
  }
  // Liga os segmentos ponta com ponta.
  const chave = (p: P2) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const porPonta = new Map<string, number[]>();
  segs.forEach((s, i) => s.forEach((p) => porPonta.set(chave(p), [...(porPonta.get(chave(p)) ?? []), i])));
  const usado = new Uint8Array(segs.length);
  const lacos: P2[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (usado[i]) continue;
    usado[i] = 1;
    const laco: P2[] = [segs[i][0], segs[i][1]];
    for (;;) {
      const ponta = laco[laco.length - 1];
      const prox = (porPonta.get(chave(ponta)) ?? []).find((j) => !usado[j]);
      if (prox === undefined) break;
      usado[prox] = 1;
      const [a, b] = segs[prox];
      laco.push(chave(a) === chave(ponta) ? b : a);
    }
    if (laco.length > 3 && chave(laco[0]) === chave(laco[laco.length - 1])) lacos.push(laco.slice(0, -1));
  }
  return lacos;
}

// Simplifica um laço fechado (Douglas-Peucker), mantendo a forma até "tol" mm.
export function simplificar(laco: P2[], tol: number): P2[] {
  if (tol <= 0 || laco.length < 4) return laco;
  const dp = (pts: P2[]): P2[] => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-12;
    let maior = -1, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
      if (d > maior) (maior = d), (idx = i);
    }
    if (maior <= tol) return [a, b];
    return [...dp(pts.slice(0, idx + 1)).slice(0, -1), ...dp(pts.slice(idx))];
  };
  // Laço fechado: parte no ponto mais longe do primeiro, para não perder cantos.
  let longe = 0;
  laco.forEach((p, i) => Math.hypot(p[0] - laco[0][0], p[1] - laco[0][1]) > Math.hypot(laco[longe][0] - laco[0][0], laco[longe][1] - laco[0][1]) && (longe = i));
  const r = [...dp([...laco.slice(0, longe + 1)]).slice(0, -1), ...dp([...laco.slice(longe), laco[0]]).slice(0, -1)];
  return r.length >= 3 ? r : laco;
}

// Esboço com os laços (linhas retas fechadas).
export function esbocoDosLacos(plano: PlanoEsboco, lacos: P2[][]): DadosEsboco {
  const d: DadosEsboco = { plano, pontos: [{ id: 0, u: 0, v: 0 }], curvas: [], cotas: [] };
  for (const laco of lacos) {
    const ids = laco.map(([u, v]) => (d.pontos.push({ id: d.pontos.length, u, v }), d.pontos.length - 1));
    ids.forEach((a, i) => d.curvas.push({ id: d.curvas.length + 1, tipo: "linha", a, b: ids[(i + 1) % ids.length] }));
  }
  return d;
}

export function planoDeslocadoDaOrigem(nome: "XY" | "XZ" | "YZ", desloc: number): PlanoEsboco {
  const b = PLANOS_ORIGEM[nome];
  return { ...b, origem: b.normal.map((c) => c * desloc) as V3 };
}

// Cria a operação de esboço do corte; devolve a mensagem para o aviso.
export function criarEsbocoDeCorte(projeto: Projeto, corpo: string, plano: PlanoEsboco, tol: number): Operacao {
  const m = projeto.estado.corposBase.find((c) => c.nome === corpo);
  if (!m) throw new Error(`${corpo} não existe`);
  // Tolerância mínima: junta os pontos que ficam em linha reta (sem mudar a forma).
  const lacos = cortarCorpo(m, plano).map((l) => simplificar(l, Math.max(tol, 1e-6)));
  if (!lacos.length) throw new Error("O plano não corta o corpo (mude o deslocamento)");
  const op: Operacao = { id: crypto.randomUUID(), tipo: "esboco", nome: projeto.proximoNome("Esboço"), modo: "novo", params: {}, esboco: esbocoDosLacos(plano, lacos) };
  projeto.adicionar(op);
  return op;
}

export function comandoSecaoMalha(raiz: HTMLElement, projeto: Projeto, escolhido: string | null, ajustar: boolean, avisar: (t: string) => void) {
  const corpos = projeto.estado.corposBase.map((c) => c.nome);
  if (!corpos.length) return avisar("Não há corpo para cortar.");
  abrirDialogo(raiz, {
    titulo: ajustar ? "Ajustar curvas à seção da malha" : "Criar esboço de corte de malha",
    campos: [
      { chave: "deslocamento", rotulo: "Deslocamento do plano", valor: 0 },
      { chave: "tolerancia", rotulo: "Tolerância do ajuste", valor: ajustar ? 0.2 : 0 },
    ],
    escolhas: [
      { chave: "corpo", rotulo: "Corpo", opcoes: corpos.map((c) => [c, c]), valor: escolhido && corpos.includes(escolhido) ? escolhido : corpos[corpos.length - 1] },
      { chave: "plano", rotulo: "Plano", opcoes: [["XZ", "XZ (chão; corte na altura)"], ["XY", "XY (frente)"], ["YZ", "YZ (lado)"]], valor: "XZ" },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: () => {},
    aoCancelar: () => {},
    aoOK: (v, _m, esc) => {
      try {
        const op = criarEsbocoDeCorte(projeto, esc.corpo, planoDeslocadoDaOrigem(esc.plano as "XZ", v.deslocamento ?? 0), Math.max(0, v.tolerancia ?? 0));
        const n = op.esboco!.curvas.length;
        avisar(`${op.nome}: ${n} linha(s) do corte`);
      } catch (e) {
        avisar(e instanceof Error ? e.message : String(e));
      }
    },
  });
}
