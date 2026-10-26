// Cálculo da geometria em segundo plano, para a tela não travar.
// Usa o OpenCascade (via replicad). Recalcula o histórico inteiro a cada mudança.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import {
  setOC,
  deserializeShape,
  type FaceFinder,
  makeOffset,
  makeBox,
  makeCylinder,
  makeSphere,
  draw,
  drawCircle,
  Plane,
  Vector,
  basicFaceExtrusion,
  exportSTEP,
  makeCompound,
  measureArea,
  measureDistanceBetween,
  measureLength,
  measureShapeVolumeProperties,
  measureVolume,
  makeLine,
  makeVertex,
  makeFace,
  makeCircle,
  makeBezierCurve,
  makeEllipse,
  makeSolid,
  drawEllipse,
  makeThreePointArc,
  makeHelix,
  makePolygon,
  assembleWire,
  genericSweep,
  loft,
  cast,
  getOC,
  type Wire,
  type Drawing,
  type Edge,
  type Face,
  type Shape3D,
} from "replicad";
import {
  areaMalha,
  bordas,
  caixaMalha,
  soldarMalha,
  cortarMalha,
  inverterMalha,
  lerOBJ,
  lerSTL,
  reduzirMalha,
  repararMalha,
  compactar,
  cascaMalha,
  suavizarFronteira,
  gruposDeFaces,
  alinharMalha,
  ponteMalha,
  atrairMalha,
  grupoPorDirecao,
  quadsDaMalha,
  transformarMalha,
  separarMalha,
  stlBinario,
  suavizarMalha,
  volumeMalha,
  type Malha,
} from "./malhas";
import { gerar3MF } from "./tresmf";
import { ROSCAS_M } from "./roscas";
import { amostrarCurva, contornoDoLaco, beziersDaSpline, idsDaCurva, geoArco, perfis, paraMundo, PLANOS_ORIGEM, type DadosEsboco, type Laco, type P2, type PlanoEsboco, type V3 } from "./esboco";
import { planoDeslocado } from "./construcao";
import { APARENCIAS, MATERIAIS, MATERIAL_PADRAO, aparenciaDoCorpo } from "./materiais";
import type { MalhaCorpo, OpcoesExportar, Operacao, PedidoNucleo, Referencia, RespostaNucleo } from "./tipos";

const responder = (r: RespostaNucleo, transferir: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(r, transferir);

const inicio = performance.now();
const carregado = (async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oc = await (opencascade as any)({ locateFile: () => wasmUrl });
  setOC(oc);
  responder({ tipo: "pronto", segundos: (performance.now() - inicio) / 1000 });
})().catch((e) => responder({ tipo: "falha", mensagem: String(e) }));

// Arredondamento e Chanfro: muda os corpos citados nas referências.
function aplicarNasArestas(op: Operacao, corpos: Corpo[]) {
  const porCorpo = new Map<string, NonNullable<Operacao["referencias"]>>();
  for (const r of op.referencias ?? []) {
    porCorpo.set(r.corpo, [...(porCorpo.get(r.corpo) ?? []), r]);
  }
  if (porCorpo.size === 0) throw new Error("Nenhuma aresta escolhida");
  const medida = op.tipo === "arredondamento" ? op.params.raio : op.params.distancia;
  if (!(medida > 0)) throw new Error("A medida deve ser maior que zero");

  for (const [nome, refs] of porCorpo) {
    const corpo = corpos.find((c) => c.nome === nome);
    if (!corpo) throw new Error(`${nome} não existe mais`);
    const todas = corpo.forma.edges;
    const faces = corpo.forma.faces;
    const escolhidas: Edge[] = [];
    for (const r of refs) {
      if (r.tipo === "aresta") {
        if (!todas[r.indice]) throw new Error("Uma aresta escolhida não existe mais");
        escolhidas.push(todas[r.indice]);
      } else {
        if (!faces[r.indice]) throw new Error("Uma face escolhida não existe mais");
        escolhidas.push(...faces[r.indice].edges);
      }
    }
    // Cadeia tangente: o OpenCascade já segue sozinho as arestas que continuam
    // a escolhida sem quina (no Fusion dá para desligar; aqui sempre segue).
    // Chanfro como no Fusion: "igual" (uma distância), "duas" (distancia e
    // distancia2) ou "angulo" (distancia e angulo). A primeira distância vale
    // na face de referência: a mais deitada (padrão) ou a mais em pé.
    const o = op.opcoes ?? {};
    const tipoChanfro = op.tipo === "chanfro" ? (o.tipoChanfro ?? "igual") : "igual";
    if (tipoChanfro === "duas" && !((op.params.distancia2 ?? 0) > 0)) throw new Error("A segunda distância deve ser maior que zero");
    if (tipoChanfro === "angulo" && !((op.params.angulo ?? 0) > 0 && (op.params.angulo ?? 0) < 90)) throw new Error("O ângulo deve ficar entre 0° e 90°");
    const faceDaAresta = (e: Edge) => {
      const vizinhas = faces.filter((f) => f.edges.some((x) => x.isSame(e)));
      const deitada = (f: (typeof faces)[number]) => {
        try {
          return Math.abs(f.normalAt().y);
        } catch {
          return 0;
        }
      };
      vizinhas.sort((a, b) => (o.faceReferencia === "vertical" ? deitada(a) - deitada(b) : deitada(b) - deitada(a)));
      const alvo = vizinhas[0];
      // Filtro de face que fica só com a face escolhida.
      return (f: FaceFinder) => {
        (f as unknown as { filters: ((x: { element: unknown }) => boolean)[] }).filters.push(({ element }) => !!alvo && (element as typeof alvo).isSame(alvo));
        return f;
      };
    };
    // Arredondamento com raio variável: do raio (começo da aresta) ao raio2 (fim).
    const raio2 = op.tipo === "arredondamento" && op.opcoes?.tipoRaio === "variavel" ? op.params.raio2 ?? 0 : 0;
    if (op.tipo === "arredondamento" && op.opcoes?.tipoRaio === "variavel" && !(raio2 > 0)) throw new Error("O raio final deve ser maior que zero");
    const usar = (e: Edge) => {
      if (!escolhidas.some((x) => x.isSame(e))) return null;
      if (raio2 > 0) return [medida, raio2] as [number, number];
      if (tipoChanfro === "duas") return { distances: [medida, op.params.distancia2] as [number, number], selectedFace: faceDaAresta(e) };
      if (tipoChanfro === "angulo") return { distance: medida, angle: op.params.angulo, selectedFace: faceDaAresta(e) };
      return medida;
    };
    try {
      corpo.forma = op.tipo === "arredondamento" ? corpo.forma.fillet(usar as (e: Edge) => number | [number, number] | null) : corpo.forma.chamfer(usar as (e: Edge) => number | null);
    } catch {
      throw new Error(
        op.tipo === "arredondamento"
          ? "Não foi possível arredondar (raio grande demais?)"
          : "Não foi possível chanfrar (distância grande demais?)",
      );
    }
  }
}

// ---- Extrusão ----

// Arestas 3D de uma spline do esboço (um trecho de Bézier cada, igual à tela).
function arestasDaSpline(esboco: DadosEsboco, c: Extract<DadosEsboco["curvas"][number], { tipo: "spline" }>): Edge[] {
  const pts = idsDaCurva(c).map((id) => {
    const p = esboco.pontos.find((q) => q.id === id)!;
    return [p.u, p.v] as [number, number];
  });
  return beziersDaSpline(pts, c.a === c.b, c.controle).map((b) => makeBezierCurve(b.map((q) => paraMundo(esboco.plano, q[0], q[1]))));
}

function desenhoDoLaco(l: Laco): Drawing {
  if (l.tipo === "circulo") return drawCircle(l.raio).translate(l.centro[0], l.centro[1]);
  if (l.tipo === "elipse") {
    const maior = Math.hypot(l.ponta[0] - l.centro[0], l.ponta[1] - l.centro[1]);
    const ang = (Math.atan2(l.ponta[1] - l.centro[1], l.ponta[0] - l.centro[0]) * 180) / Math.PI;
    // drawEllipse quer o raio maior primeiro: se "menor" for maior, gira 90°.
    const d = l.menor > maior ? drawEllipse(l.menor, maior).rotate(ang + 90, [0, 0]) : drawEllipse(maior, l.menor).rotate(ang, [0, 0]);
    return d.translate(l.centro[0], l.centro[1]);
  }
  // Começa no início real da curva (a spline de controle fechada não passa pelo ponto "de").
  const s0 = l.segmentos[0];
  let caneta = draw(s0.tipo === "spline" ? beziersDaSpline(s0.pontos, s0.fechada, s0.controle)[0][0] : s0.de);
  l.segmentos.forEach((s, i) => {
    const ultimo = i === l.segmentos.length - 1;
    if (s.tipo === "spline") for (const b of beziersDaSpline(s.pontos, s.fechada, s.controle)) caneta = caneta.cubicBezierCurveTo(b[3], b[1], b[2]);
    else if (s.tipo === "arco") caneta = caneta.threePointsArcTo(s.para, s.meio);
    else if (!ultimo) caneta = caneta.lineTo(s.para);
  });
  return caneta.close(); // fecha com uma linha até o começo, se o último for linha
}

interface EsbocoNoPlano {
  extrude(d: number): Shape3D;
  revolve(eixo: V3, o: { origin: V3; angle: number }): Shape3D;
}

// Faz um sólido para cada perfil escolhido e junta todos.
function solidoDosPerfis(
  op: Operacao,
  esbocos: Map<string, DadosEsboco>,
  fazer: (s: EsbocoNoPlano) => Shape3D,
): Shape3D {
  const ref = op.perfis;
  const esboco = ref && esbocos.get(ref.esboco);
  if (!esboco) throw new Error("O esboço desta operação não existe mais");
  const lista = perfis(esboco);
  const { origem, eixoX, normal } = esboco.plano;
  const plano = new Plane(origem, eixoX, normal);
  let resultado: Shape3D | null = null;
  for (const i of ref.indices) {
    const perfil = lista[i];
    if (!perfil) throw new Error("Um perfil escolhido não existe mais no esboço");
    let desenho = desenhoDoLaco(perfil.externo);
    for (const furo of perfil.furos) desenho = desenho.cut(desenhoDoLaco(furo));
    const solido = fazer(desenho.sketchOnPlane(plano) as unknown as EsbocoNoPlano);
    resultado = resultado ? resultado.fuse(solido) : solido;
  }
  if (!resultado) throw new Error("Nenhum perfil escolhido");
  return resultado;
}

// Extrusão como no Fusion:
// - opcoes.extensao: "um" (padrão), "simetrico" (opcoes.medida "metade" = a
//   distância vale para cada lado, padrão do Fusion; "inteira" = total) ou
//   "doisLados" (params.distancia2 para o outro lado, params.afunilamento2);
// - params.afunilamento: ângulo em graus (positivo afina, negativo alarga);
// - params.inicio: o começo fica deslocado do plano do esboço (ao longo da normal).
function formaDaExtrusao(op: Operacao, esbocos: Map<string, DadosEsboco>, corpos: Corpo[] = []): Shape3D {
  const p = op.params, o = op.opcoes ?? {};
  const d = p.distancia;
  if (!d) throw new Error("A distância não pode ser zero");
  // "Até o objeto": vai no sentido da distância até encostar no corpo escolhido.
  if (o.extensao === "ateObjeto") {
    const alvo = corpos.find((c) => c.nome === o.objeto);
    if (!alvo) throw new Error("Escolha o corpo até onde a extrusão vai");
    const esb = op.perfis && esbocos.get(op.perfis.esboco);
    if (!esb) throw new Error("O esboço desta operação não existe mais");
    const n = esb.plano.normal, org = esb.plano.origem, sinal = Math.sign(d);
    const longo = solidoDosPerfis(op, esbocos, (s) => s.extrude(10000 * sinal));
    const resto = longo.cut(alvo.forma);
    const pedacos = (resto as unknown as { solids?: Shape3D[] }).solids ?? [resto];
    // Fica o pedaço que começa no plano do esboço (o de antes do corpo).
    const altura = (q: Shape3D) => {
      const [a, b] = q.boundingBox.bounds;
      let menor = Infinity;
      for (const x of [a[0], b[0]]) for (const y of [a[1], b[1]]) for (const z of [a[2], b[2]]) menor = Math.min(menor, ((x - org[0]) * n[0] + (y - org[1]) * n[1] + (z - org[2]) * n[2]) * sinal);
      return menor;
    };
    const perto = pedacos.filter((q) => Math.abs(altura(q)) < 1e-4);
    if (!perto.length || perto.some((q) => q.boundingBox.width > 9000 || q.boundingBox.height > 9000 || q.boundingBox.depth > 9000))
      throw new Error("A extrusão não encontra o corpo nesse sentido (troque o sinal da distância)");
    return perto.reduce((a, b) => a.fuse(b));
  }
  const a1 = p.afunilamento ?? 0, a2 = p.afunilamento2 ?? a1;
  if (Math.abs(a1) >= 89 || Math.abs(a2) >= 89) throw new Error("O afunilamento deve ficar entre -89° e 89°");
  const extensao = o.extensao ?? "um";
  // Trechos [começo, comprimento com sinal, ângulo], medidos a partir do plano de início.
  let trechos: [number, number, number][];
  if (extensao === "simetrico") {
    const h = o.medida === "inteira" ? d / 2 : d;
    trechos = [[0, h, a1], [0, -h, a1]];
  } else if (extensao === "doisLados") {
    const d2 = p.distancia2;
    if (!d2) throw new Error("A segunda distância não pode ser zero");
    trechos = [[0, d, a1], [0, -d2, a2]];
  } else trechos = [[0, d, a1]];
  const inicio = p.inicio ?? 0;
  if (!inicio && trechos.length === 1 && !a1) return solidoDosPerfis(op, esbocos, (s) => s.extrude(d)); // caminho de sempre

  const ref = op.perfis;
  const esboco = ref && esbocos.get(ref.esboco);
  if (!esboco) throw new Error("O esboço desta operação não existe mais");
  const lista = perfis(esboco);
  const { origem, eixoX, normal } = esboco.plano;
  const tam = Math.hypot(...normal) || 1;
  const n = normal.map((c) => c / tam) as V3;
  const planoEm = (z: number) => new Plane(origem.map((c, i) => c + n[i] * z) as V3, eixoX, normal);
  const naFolha = (dw: Drawing, z: number) => dw.sketchOnPlane(planoEm(z)) as unknown as EsbocoNoPlano & { loftWith(o: unknown, c: { ruled: boolean }): Shape3D };
  // Um trecho: perfil inteiro no começo; com ângulo, o perfil do fim é o deslocado (cantos vivos).
  const trecho = (dw: Drawing, z0: number, h: number, ang: number): Shape3D => {
    if (!ang) return naFolha(dw, z0).extrude(h);
    const desloc = -Math.abs(h) * Math.tan((ang * Math.PI) / 180);
    let fim: Drawing;
    try {
      fim = dw.offset(desloc, { lineJoinType: "miter" });
    } catch {
      throw new Error("Afunilamento grande demais para este perfil");
    }
    return naFolha(dw, z0).loftWith(naFolha(fim, z0 + h), { ruled: true });
  };
  let resultado: Shape3D | null = null;
  for (const i of ref.indices) {
    const perfil = lista[i];
    if (!perfil) throw new Error("Um perfil escolhido não existe mais no esboço");
    for (const [z, h, ang] of trechos) {
      let solido = trecho(desenhoDoLaco(perfil.externo), inicio + z, h, ang);
      // Furo do perfil: afina ao contrário (a parede mantém o ângulo).
      for (const furo of perfil.furos) solido = solido.cut(trecho(desenhoDoLaco(furo), inicio + z, h, -ang));
      resultado = resultado ? resultado.fuse(solido) : solido;
    }
  }
  if (!resultado) throw new Error("Nenhum perfil escolhido");
  return resultado;
}

const EIXOS: Record<"X" | "Y" | "Z", V3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

function formaDaRevolucao(op: Operacao, esbocos: Map<string, DadosEsboco>, eixos: Map<string, { origem: V3; direcao: V3 }>): Shape3D {
  const angulo = op.params.angulo;
  if (!angulo) throw new Error("O ângulo não pode ser zero");
  const e = op.eixo;
  if (!e) throw new Error("Escolha o eixo");
  let origem: V3 = [0, 0, 0];
  let direcao: V3;
  if (e.tipo === "origem") direcao = EIXOS[e.eixo];
  else if (e.tipo === "construcao") {
    const ex = eixos.get(e.op);
    if (!ex) throw new Error("O eixo de construção não existe mais");
    origem = ex.origem;
    direcao = ex.direcao;
  } else {
    const esboco = esbocos.get(e.esboco);
    const linha = esboco?.curvas.find((c) => c.id === e.curva);
    if (!esboco || !linha || linha.tipo !== "linha") throw new Error("A linha do eixo não existe mais");
    const pa = esboco.pontos.find((p) => p.id === linha.a)!;
    const pb = esboco.pontos.find((p) => p.id === linha.b)!;
    origem = paraMundo(esboco.plano, pa.u, pa.v);
    const fim = paraMundo(esboco.plano, pb.u, pb.v);
    direcao = [fim[0] - origem[0], fim[1] - origem[1], fim[2] - origem[2]];
  }
  // opcoes.extensao: "um" (padrão), "simetrico" (o ângulo é o total, metade
  // para cada lado) ou "doisLados" (params.angulo2 para o outro lado).
  const extensao = op.opcoes?.extensao ?? "um";
  const angulo2 = op.params.angulo2 ?? 0;
  if (extensao === "doisLados" && !angulo2) throw new Error("O segundo ângulo não pode ser zero");
  if (extensao !== "um" && Math.abs(angulo) + Math.abs(extensao === "doisLados" ? angulo2 : 0) > 360) throw new Error("A soma dos ângulos passa de 360°");
  let solido: Shape3D;
  try {
    if (extensao === "simetrico" && Math.abs(angulo) < 360)
      solido = solidoDosPerfis(op, esbocos, (s) => s.revolve(direcao, { origin: origem, angle: angulo })).rotate(-angulo / 2, origem, direcao);
    else if (extensao === "doisLados") {
      const a = solidoDosPerfis(op, esbocos, (s) => s.revolve(direcao, { origin: origem, angle: angulo }));
      solido = a.fuse(solidoDosPerfis(op, esbocos, (s) => s.revolve(direcao, { origin: origem, angle: Math.abs(angulo2) })).rotate(-Math.abs(angulo2), origem, direcao));
    } else solido = solidoDosPerfis(op, esbocos, (s) => s.revolve(direcao, { origin: origem, angle: angulo }));
  } catch (err) {
    if (err instanceof Error && /não existe|Nenhum/.test(err.message)) throw err;
    throw new Error("Não foi possível girar (o eixo corta o perfil?)");
  }
  return solido;
}

// ---- Espelhar, Padrões e Combinar: trabalham com corpos inteiros ----

const DIRECOES: Record<string, V3> = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };

function corposDaOperacao(op: Operacao, corpos: Corpo[]): Corpo[] {
  const nomes = op.corpos ?? [];
  if (!nomes.length) throw new Error("Nenhum corpo escolhido");
  return nomes.map((n) => {
    const c = corpos.find((x) => x.nome === n);
    if (!c) throw new Error(`${n} não existe mais`);
    return c;
  });
}

// Junta as cópias no corpo original (Unir) ou cria um corpo novo para cada uma.
function guardarCopias(op: Operacao, alvo: Corpo, copias: Shape3D[], criar: (f: Shape3D) => void) {
  if (op.opcoes?.operacao === "unir") for (const c of copias) alvo.forma = alvo.forma.fuse(c);
  else copias.forEach(criar);
}

function aplicarEspelhar(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void) {
  const plano = (op.opcoes?.plano ?? "YZ") as "XY" | "XZ" | "YZ";
  for (const alvo of corposDaOperacao(op, corpos)) {
    guardarCopias(op, alvo, [alvo.forma.clone().mirror(plano, [0, 0, 0])], criar);
  }
}

function aplicarPadraoRetangular(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void) {
  const n1 = Math.round(op.params.quantidade1 ?? 1), n2 = Math.round(op.params.quantidade2 ?? 1);
  if (n1 < 1 || n2 < 1 || n1 * n2 > 400) throw new Error("Quantidade deve ser de 1 a 400 cópias no total");
  // "Extensão" = distância total entre a 1ª e a última; "Espaçamento" = entre vizinhas.
  const passo = (d: number, n: number) => (op.opcoes?.tipoDistancia === "espacamento" || n < 2 ? d : d / (n - 1));
  const p1 = passo(op.params.distancia1 ?? 0, n1), p2 = passo(op.params.distancia2 ?? 0, n2);
  const e1 = DIRECOES[op.opcoes?.direcao1 ?? "X"], e2 = DIRECOES[op.opcoes?.direcao2 ?? "Z"];
  for (const alvo of corposDaOperacao(op, corpos)) {
    const copias: Shape3D[] = [];
    for (let i = 0; i < n1; i++)
      for (let j = 0; j < n2; j++) {
        if (!i && !j) continue;
        const v: V3 = [0, 1, 2].map((k) => e1[k] * p1 * i + e2[k] * p2 * j) as V3;
        copias.push(alvo.forma.clone().translate(v));
      }
    guardarCopias(op, alvo, copias, criar);
  }
}

function aplicarPadraoCircular(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void, eixos: Map<string, { origem: V3; direcao: V3 }>) {
  const n = Math.round(op.params.quantidade ?? 1);
  const total = op.params.angulo ?? 360;
  if (n < 2 || n > 400) throw new Error("Quantidade deve ser de 2 a 400");
  // Volta completa: divide 360° por n. Ângulo parcial: 1ª e última nas pontas.
  const passo = Math.abs(total) >= 360 ? 360 / n : total / (n - 1);
  const chave = op.opcoes?.eixo ?? "Y";
  let centro: V3 = [0, 0, 0];
  let eixo = DIRECOES[chave as "X"];
  if (chave.startsWith("op:")) {
    const ex = eixos.get(chave.slice(3));
    if (!ex) throw new Error("O eixo de construção não existe mais");
    (centro = ex.origem), (eixo = ex.direcao);
  }
  for (const alvo of corposDaOperacao(op, corpos)) {
    const copias = Array.from({ length: n - 1 }, (_, k) => alvo.forma.clone().rotate(passo * (k + 1), centro, eixo));
    guardarCopias(op, alvo, copias, criar);
  }
}


// ---- Padrão no caminho: cópias de corpos ao longo de curvas do esboço ----
// O caminho vira uma lista de pontos (por comprimento), na ordem da cadeia.

function pontosDoCaminho2D(esboco: DadosEsboco, ids: number[]): P2[] {
  const pos = (id: number): P2 => {
    const p = esboco.pontos.find((q) => q.id === id)!;
    return [p.u, p.v];
  };
  const trechos = ids.map((id) => {
    const c = esboco.curvas.find((x) => x.id === id);
    if (!c || c.tipo === "circulo" || c.tipo === "elipse") throw new Error("O caminho mudou no esboço");
    // Arco: pedaços de 0,25° (a direção sai quase exata); o resto como a tela.
    let pts = amostrarCurva(esboco, c);
    if (c.tipo === "arco") {
      const g = geoArco(esboco, c);
      const n = Math.max(8, Math.ceil((g.sweep * 180) / Math.PI / 0.25));
      pts = Array.from({ length: n + 1 }, (_, i) => {
        const t = g.inicio + (g.sweep * i) / n;
        return [g.centro[0] + g.raio * Math.cos(t), g.centro[1] + g.raio * Math.sin(t)] as P2;
      });
    }
    return { pts, a: pos(c.a), b: pos(c.b) };
  });
  // Encaixa cada trecho na ponta do anterior (inverte se precisar).
  const dist = (p: P2, q: P2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  let linha: P2[] = [];
  trechos.forEach((t, i) => {
    let pts = t.pts;
    if (i === 0 && trechos.length > 1) {
      const prox = trechos[1];
      const fim = pts[pts.length - 1];
      if (Math.min(dist(fim, prox.a), dist(fim, prox.b)) > Math.min(dist(pts[0], prox.a), dist(pts[0], prox.b))) pts = [...pts].reverse();
    } else if (i > 0) {
      const ult = linha[linha.length - 1];
      if (dist(pts[pts.length - 1], ult) < dist(pts[0], ult)) pts = [...pts].reverse();
      pts = pts.slice(1);
    }
    linha = linha.concat(pts);
  });
  return linha;
}

// Ponto e direção a "s" mm do começo da linha de pontos.
function noCaminho(pts: P2[], s: number): { p: P2; t: P2 } {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === pts.length - 1) {
      const k = L ? Math.min(1, s / L) : 0;
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: L ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : [1, 0] };
    }
    s -= L;
  }
  return { p: pts[0], t: [1, 0] };
}

function aplicarPadraoCaminho(op: Operacao, corpos: Corpo[], esbocos: Map<string, DadosEsboco>, criar: (f: Shape3D) => void) {
  const c = op.caminho;
  const esboco = c && esbocos.get(c.esboco);
  if (!esboco || !c.curvas.length) throw new Error("Escolha o caminho (linhas/arcos de um esboço)");
  const n = Math.round(op.params.quantidade ?? 3);
  if (n < 2 || n > 400) throw new Error("Quantidade deve ser de 2 a 400");
  const pts = pontosDoCaminho2D(esboco, c.curvas);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const pedida = op.params.distancia ?? 0;
  const extensao = pedida > 0 ? Math.min(pedida, total) : total; // 0 = caminho inteiro
  const seguir = op.opcoes?.orientacao === "caminho";
  const pl = esboco.plano;
  const inicio = noCaminho(pts, 0);
  const p0 = paraMundo(pl, inicio.p[0], inicio.p[1]);
  for (const alvo of corposDaOperacao(op, corpos)) {
    const copias: Shape3D[] = [];
    for (let k = 1; k < n; k++) {
      const s = (extensao * k) / (n - 1);
      const aqui = noCaminho(pts, s);
      const pk = paraMundo(pl, aqui.p[0], aqui.p[1]);
      let f = alvo.forma.clone().translate(vsub(pk, p0));
      if (seguir) {
        // Gira em volta da normal do esboço pelo ângulo entre as direções.
        const ang = (Math.atan2(aqui.t[1], aqui.t[0]) - Math.atan2(inicio.t[1], inicio.t[0])) * (180 / Math.PI);
        if (Math.abs(ang) > 1e-9) f = f.rotate(ang, pk, pl.normal);
      }
      copias.push(f);
    }
    guardarCopias(op, alvo, copias, criar);
  }
}

function aplicarCombinar(op: Operacao, corpos: Corpo[]) {
  const [alvo, ...ferramentas] = corposDaOperacao(op, corpos);
  if (!ferramentas.length) throw new Error("Escolha o corpo alvo e pelo menos uma ferramenta");
  const modo = op.opcoes?.operacao ?? "unir";
  for (const f of ferramentas) {
    alvo.forma = modo === "cortar" ? alvo.forma.cut(f.forma) : modo === "intersecao" ? alvo.forma.intersect(f.forma) : alvo.forma.fuse(f.forma);
    // Sem "Manter ferramentas", o corpo usado como ferramenta some (como no Fusion).
    if (op.opcoes?.manter !== "sim") corpos.splice(corpos.indexOf(f), 1);
  }
}

// ---- Mover/copiar ----
// Gira em volta do pivô (centro do corpo ou origem) em X, depois Y, depois Z,
// e então anda dx, dy, dz. "Criar cópia" deixa o original no lugar.

function aplicarMover(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void) {
  const p = op.params, o = op.opcoes ?? {};
  for (const alvo of corposDaOperacao(op, corpos)) {
    let f = alvo.forma.clone();
    const [mn, mx] = alvo.forma.boundingBox.bounds;
    const pivo: V3 = o.pivo === "origem" ? [0, 0, 0] : [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    if (p.rx) f = f.rotate(p.rx, pivo, [1, 0, 0]);
    if (p.ry) f = f.rotate(p.ry, pivo, [0, 1, 0]);
    if (p.rz) f = f.rotate(p.rz, pivo, [0, 0, 1]);
    if (p.dx || p.dy || p.dz) f = f.translate([p.dx ?? 0, p.dy ?? 0, p.dz ?? 0]);
    if (o.copiar === "sim") criar(f);
    else alvo.forma = f;
  }
}

// ---- Geometria exata de uma face/aresta (para os comandos de Construir) ----

// Intersecção (esboço): corta o corpo exato pelo plano do esboço e devolve
// cada aresta do corte como lista de pontos (reta = 2 pontos; curva = 49).
function secaoDoCorpo(historico: Operacao[], nome: string, pl: { origem: V3; eixoX: V3; normal: V3 }): string[] {
  const { corpos } = construir(historico);
  const c = corpos.find((x) => x.nome === nome);
  if (!c) throw new Error(`${nome} não existe`);
  return linhasDaSecao(c.forma, pl).map((l) => JSON.stringify(l));
}

// Arestas do corte da forma pelo plano (reta = 2 pontos; curva = 49).
function linhasDaSecao(forma: Shape3D, pl: { origem: V3; eixoX: V3; normal: V3 }): V3[][] {
  const c = { forma };
  const oc = getOC() as unknown as { BRepAlgoAPI_Section: new (a: unknown, b: unknown, agora: boolean) => { Shape(): unknown; IsDone(): boolean } };
  const [mn, mx] = c.forma.boundingBox.bounds;
  const L = 4 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + 4 * Math.hypot(...(pl.origem.map((o, i) => o - (mn[i] + mx[i]) / 2) as V3)) + 10;
  const y = [pl.normal[1] * pl.eixoX[2] - pl.normal[2] * pl.eixoX[1], pl.normal[2] * pl.eixoX[0] - pl.normal[0] * pl.eixoX[2], pl.normal[0] * pl.eixoX[1] - pl.normal[1] * pl.eixoX[0]];
  const canto = (su: number, sv: number): V3 => [0, 1, 2].map((i) => pl.origem[i] + su * L * pl.eixoX[i] + sv * L * y[i]) as V3;
  const faca = makePolygon([canto(-1, -1), canto(1, -1), canto(1, 1), canto(-1, 1)]);
  const sec = new oc.BRepAlgoAPI_Section(c.forma.wrapped, faca.wrapped, true);
  if (!sec.IsDone()) throw new Error("Não deu para cortar o corpo pelo plano");
  const v = (p: { x: number; y: number; z: number }): V3 => [p.x, p.y, p.z];
  return cast(sec.Shape() as never).edges.map((e: Edge) =>
    e.geomType === "LINE" ? [v(e.startPoint), v(e.endPoint)] : Array.from({ length: 49 }, (_, i) => v(e.pointAt(i / 48))),
  );
}

// ---- Corte com encaixes (como o "Cortar" do Bambu Studio) ----
// O corpo é dividido por um plano (da origem ou de construção, com
// deslocamento). Na face do corte entram os encaixes, nos pontos com mais
// material em volta (o mais longe da borda e uns dos outros):
// - "pino": o lado de cima (para onde a normal aponta) ganha pinos; o de baixo,
//   furos com folga;
// - "cavilha": furos com folga nos dois lados e cavilhas soltas (corpos novos);
// - "nenhum": só o corte.
// "separar" afasta a parte de baixo (mm) para imprimir as duas.
function pontosDosEncaixes(forma: Shape3D, pl: PlanoEsboco, raio: number, folga: number, quantos: number): V3[] {
  const y = cruzar(pl.normal, pl.eixoX);
  const uv = (p: V3): [number, number] => [vdot(vsub(p, pl.origem), pl.eixoX), vdot(vsub(p, pl.origem), y)];
  const segs: [number, number, number, number][] = [];
  for (const l of linhasDaSecao(forma, pl))
    for (let i = 0; i + 1 < l.length; i++) {
      const a = uv(l[i]), b = uv(l[i + 1]);
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  if (!segs.length) throw new Error("O plano não corta o corpo");
  const dentro = (u: number, v: number) => {
    let n = false;
    for (const [x1, y1, x2, y2] of segs) if (y1 > v !== y2 > v && u < ((x2 - x1) * (v - y1)) / (y2 - y1) + x1) n = !n;
    return n;
  };
  const distBorda = (u: number, v: number) => {
    let d = Infinity;
    for (const [x1, y1, x2, y2] of segs) {
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((u - x1) * dx + (v - y1) * dy) / L2));
      d = Math.min(d, Math.hypot(u - x1 - t * dx, v - y1 - t * dy));
    }
    return d;
  };
  const us = segs.flatMap((s) => [s[0], s[2]]), vs = segs.flatMap((s) => [s[1], s[3]]);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const passo = Math.max((u1 - u0) / 40, (v1 - v0) / 40, 0.2);
  const margem = raio + folga + 1.2; // parede mínima em volta do furo
  const cand: { u: number; v: number; d: number }[] = [];
  for (let u = u0 + passo / 2; u < u1; u += passo)
    for (let v = v0 + passo / 2; v < v1; v += passo) {
      if (!dentro(u, v)) continue;
      const d = distBorda(u, v);
      if (d >= margem) cand.push({ u, v, d });
    }
  if (!cand.length) throw new Error("A face do corte é pequena demais para encaixes desse diâmetro");
  // O 1º no ponto mais fundo; os outros, o mais longe possível dos já escolhidos.
  const escolhidos = [cand.reduce((a, b) => (b.d > a.d ? b : a))];
  while (escolhidos.length < quantos) {
    let melhor: (typeof cand)[number] | null = null, longe = 2 * margem;
    for (const c of cand) {
      const d = Math.min(...escolhidos.map((e) => Math.hypot(e.u - c.u, e.v - c.v)));
      if (d > longe) (longe = d), (melhor = c);
    }
    if (!melhor) break;
    escolhidos.push(melhor);
  }
  return escolhidos.map((c) => [0, 1, 2].map((k) => pl.origem[k] + c.u * pl.eixoX[k] + c.v * y[k]) as V3);
}

function aplicarCorteEncaixes(op: Operacao, corpos: Corpo[], planos: Map<string, PlanoEsboco>, criar: (f: Shape3D) => void): string {
  const base = planoDaOpcao(op.opcoes?.plano ?? "XZ", planos);
  if (!base) throw new Error("O plano de corte não existe mais");
  const d = op.params.deslocamento ?? 0;
  const pl: PlanoEsboco = { ...base, origem: base.origem.map((o, k) => o + base.normal[k] * d) as V3 };
  const n = vunit(pl.normal);
  const tipo = op.opcoes?.encaixe ?? "pino";
  const raio = (op.params.diametro ?? 5) / 2, h = op.params.comprimento ?? 10, folga = op.params.folga ?? 0.2;
  const quantos = Math.max(0, Math.min(12, Math.round(op.params.quantidade ?? 2)));
  if (tipo !== "nenhum" && !(raio > 0 && h > 0)) throw new Error("Diâmetro e comprimento do encaixe devem ser maiores que zero");
  const plano = new Plane(pl.origem, pl.eixoX, pl.normal);
  const alvos = corposDaOperacao(op, corpos);
  let total = 0;
  for (const alvo of alvos) {
    const cima = alvo.forma.clone().cutPlane(plano, 0, "positive") as Shape3D | undefined;
    const baixo = alvo.forma.clone().cutPlane(plano, 0, "negative") as Shape3D | undefined;
    if (!cima || !baixo || measureVolume(cima) < 1e-9 || measureVolume(baixo) < 1e-9) throw new Error(`O plano não atravessa ${alvo.nome}`);
    let a = cima, b = baixo;
    const pontos = tipo === "nenhum" || !quantos ? [] : pontosDosEncaixes(alvo.forma, pl, raio, folga, quantos);
    const cilindro = (r: number, de: number, ate: number, p: V3) => makeCylinder(r, ate - de, vadd(p, vmul(n, de)), n) as Shape3D;
    const pinos: Shape3D[] = [];
    for (const p of pontos) {
      if (tipo === "pino") {
        // Pino no lado de cima, entrando no de baixo; furo com folga no de baixo.
        a = a.fuse(cilindro(raio, -h / 2, 0.01, p));
        b = b.cut(cilindro(raio + folga, -h / 2 - folga, 0.01, p));
      } else {
        a = a.cut(cilindro(raio + folga, -0.01, h / 2 + folga, p));
        b = b.cut(cilindro(raio + folga, -h / 2 - folga, 0.01, p));
        pinos.push(cilindro(raio, -h / 2, h / 2, p));
      }
    }
    const sep = op.params.separar ?? 0;
    alvo.forma = a;
    criar(sep ? b.translate(vmul(n, -sep)) : b);
    // Cavilhas soltas: deitadas ao lado da peça de baixo, para imprimir.
    pinos.forEach((pino) => criar(sep ? pino.translate(vmul(n, -sep)) : pino));
    total += pontos.length;
  }
  return `${total} encaixe(s)`;
}

// Isocurvas (análise): nas faces curvas, linhas de u constante e de v constante
// (5 de cada), como segmentos [x,y,z, x,y,z, ...] num texto JSON por corpo.
function isocurvas(historico: Operacao[]): string[] {
  const { corpos } = construir(historico);
  const N = 5, P = 24;
  return corpos.map((c) => {
    const seg: number[] = [];
    for (const f of c.forma.faces) {
      if (f.geomType === "PLANE") continue;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        for (const porU of [true, false]) {
          let ant: number[] | null = null;
          for (let j = 0; j <= P; j++) {
            const s = j / P;
            let q: { x: number; y: number; z: number };
            try {
              q = porU ? f.pointOnSurface(t, s) : f.pointOnSurface(s, t);
            } catch {
              ant = null;
              continue;
            }
            const atual = [q.x, q.y, q.z];
            if (ant) seg.push(...ant, ...atual);
            ant = atual;
          }
        }
      }
    }
    return JSON.stringify(seg.map((x) => +x.toFixed(4)));
  });
}

// Todas as faces de um corpo de uma vez (para a IA escolher por tipo, direção e raio).
function descreverFaces(historico: Operacao[], corpo: string): string[] {
  const { corpos } = construir(historico);
  const c = corpos.find((x) => x.nome === corpo);
  if (!c) throw new Error(`${corpo} não existe`);
  return c.forma.faces.map((f, i) => {
    const g = geometriaDaForma(c, { corpo, tipo: "face", indice: i });
    const [mn, mx] = f.boundingBox.bounds;
    return JSON.stringify({ indice: i, ...g, min: mn, max: mx });
  });
}

function geometria(historico: Operacao[], item: { corpo: string; tipo: string; indice: number }, t = 0.5) {
  const { corpos } = construir(historico);
  const c = corpos.find((x) => x.nome === item.corpo);
  if (!c) throw new Error(`${item.corpo} não existe`);
  return geometriaDaForma(c, item, t);
}

function geometriaDaForma(c: Corpo, item: { corpo: string; tipo: string; indice: number }, t = 0.5) {
  const v = (p: { x: number; y: number; z: number }): V3 => [p.x, p.y, p.z];
  if (item.tipo === "face") {
    const f = c.forma.faces[item.indice];
    if (!f) throw new Error("A face não existe mais");
    if (f.geomType === "PLANE") return { tipo: "plano", origem: v(f.center), normal: v(f.normalAt()) };
    if (f.geomType === "CYLINDRE" || f.geomType === "CONE") {
      const oc = getOC() as unknown as {
        BRepAdaptor_Surface: new (f: unknown, r: boolean) => {
          Cylinder(): { Radius(): number; Axis(): { Location(): { X(): number; Y(): number; Z(): number }; Direction(): { X(): number; Y(): number; Z(): number } } };
          Cone(): { Axis(): { Location(): { X(): number; Y(): number; Z(): number }; Direction(): { X(): number; Y(): number; Z(): number } } };
        };
      };
      const ad = new oc.BRepAdaptor_Surface(f.wrapped, true);
      const ax = f.geomType === "CYLINDRE" ? ad.Cylinder().Axis() : ad.Cone().Axis();
      const L = ax.Location(), D = ax.Direction();
      return { tipo: "cilindro", origem: [L.X(), L.Y(), L.Z()], direcao: [D.X(), D.Y(), D.Z()], raio: f.geomType === "CYLINDRE" ? ad.Cylinder().Radius() : 0 };
    }
    return { tipo: f.geomType.toLowerCase(), origem: v(f.center) };
  }
  const e = c.forma.edges[item.indice];
  if (!e) throw new Error("A aresta não existe mais");
  const ponto = v(e.pointAt(t)), tangente = v(e.tangentAt(t));
  if (e.geomType === "LINE") return { tipo: "reta", a: v(e.startPoint), b: v(e.endPoint), ponto, tangente };
  if (e.geomType === "CIRCLE") {
    const [p1, p2, p3] = [0, 1 / 3, 2 / 3].map((k) => v(e.pointAt(k)));
    const a = vsub(p2, p1), b = vsub(p3, p1);
    const n = cruzar(a, b);
    const n2 = vdot(n, n);
    // Centro do círculo que passa por 3 pontos (fórmula em 3D).
    const centro = vadd(p1, vmul(vadd(vmul(cruzar(n, a), vdot(b, b)), vmul(cruzar(b, n), vdot(a, a))), 1 / (2 * n2)));
    return { tipo: "circulo", centro, normal: vunit(n), raio: Math.hypot(...vsub(p1, centro)), ponto, tangente };
  }
  return { tipo: e.geomType.toLowerCase(), a: v(e.startPoint), b: v(e.endPoint), ponto, tangente };
}

// ---- Análise da pilha de elementos de fixação ----
// Para cada corpo feito por um Elemento de fixação: os corpos que ele toca ou
// atravessa (distância < 0,01 mm), com o volume em comum quando há sobreposição.
function pilhaFixadores(historico: Operacao[]): string[] {
  const { corpos } = construir(historico);
  const ids = new Set(historico.filter((o) => o.tipo === "fixador" && !o.suprimida).map((o) => o.id));
  const fixadores = corpos.filter((c) => c.origem && ids.has(c.origem));
  if (!fixadores.length) return ["Não há elementos de fixação (Inserir > Elemento de fixação)."];
  const linhas: string[] = [];
  for (const f of fixadores) {
    const nome = historico.find((o) => o.id === f.origem)?.nome ?? "";
    const toques: string[] = [];
    for (const c of corpos) {
      if (c === f || !tocam(f.forma, c.forma)) continue;
      if (measureDistanceBetween(f.forma, c.forma) > 0.01) continue;
      const v = measureVolume(f.forma.intersect(c.forma));
      toques.push(v > 1e-6 ? `${c.nome} (sobrepõe ${fmt(v)} mm³)` : `${c.nome} (encosta)`);
    }
    linhas.push(`${f.nome} — ${nome}: ${toques.length ? toques.join(", ") : "solto (não toca em nada)"}`);
  }
  return linhas;
}

// ---- Interferência: onde os corpos escolhidos se sobrepõem ----

function interferencia(historico: Operacao[], nomes: string[]): string[] {
  const { corpos } = construir(historico);
  const lista = nomes.length ? corpos.filter((c) => nomes.includes(c.nome)) : corpos;
  if (lista.length < 2) throw new Error("Escolha pelo menos 2 corpos");
  const linhas: string[] = [];
  for (let i = 0; i < lista.length; i++)
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (!tocam(a.forma, b.forma)) continue;
      const comum = a.forma.intersect(b.forma);
      const v = measureVolume(comum);
      if (v > 1e-6) linhas.push(`${a.nome} × ${b.nome}: ${fmt(v)} mm³`);
    }
  return linhas.length ? [`${linhas.length} interferência(s):`, ...linhas] : ["Nenhuma interferência entre os corpos escolhidos."];
}

// Centro de massa do conjunto (cada corpo pesa pelo seu material). Devolve
// [JSON com x, y, z e massa, texto] — a tela usa o JSON para desenhar o ponto.
function centroDeMassa(historico: Operacao[], nomes: string[]): string[] {
  const { corpos } = construir(historico);
  const lista = nomes.length ? corpos.filter((c) => nomes.includes(c.nome)) : corpos;
  if (!lista.length) throw new Error("Não há corpos");
  let massa = 0;
  const soma = [0, 0, 0];
  for (const c of lista) {
    const props = measureShapeVolumeProperties(c.forma);
    const m = (props.volume * MATERIAIS[c.material ?? MATERIAL_PADRAO].densidade) / 1000;
    massa += m;
    props.centerOfMass.forEach((v, i) => (soma[i] += v * m));
  }
  const p = soma.map((v) => (massa ? v / massa : 0));
  return [
    JSON.stringify({ x: p[0], y: p[1], z: p[2], massa }),
    `Centro de massa (${lista.map((c) => c.nome).join(", ")}):`,
    `X ${fmt(p[0], 3)} · Y ${fmt(p[1], 3)} · Z ${fmt(p[2], 3)} mm`,
    `Massa: ${fmt(massa)} g`,
  ];
}

// ---- Propriedades do corpo (janela "Propriedades" do Navegador, como no Fusion) ----

function propriedades(historico: Operacao[], nome: string): string[] {
  const { corpos, malhas } = construir(historico);
  const c = corpos.find((x) => x.nome === nome);
  const corpoMalha = malhas.find((x) => x.nome === nome);
  if (!c && corpoMalha) {
    const cm = corpoMalha;
    const mat = MATERIAIS[cm.material ?? MATERIAL_PADRAO];
    const vol = volumeMalha(cm.malha);
    const [mn, mx] = caixaMalha(cm.malha);
    const f = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    return [
      `${nome} (corpo de malha)`,
      `Material físico: ${mat.nome}`,
      `Triângulos: ${(cm.malha.tri.length / 3).toLocaleString("pt-BR")} · Pontos: ${(cm.malha.pos.length / 3).toLocaleString("pt-BR")}`,
      `Arestas abertas (buracos): ${bordas(cm.malha)}`,
      `Volume: ${f(vol)} mm³`,
      `Massa: ${f((vol * mat.densidade) / 1000)} g`,
      `Área: ${f(areaMalha(cm.malha))} mm²`,
      "Caixa delimitadora:",
      ...["X", "Y", "Z"].map((e, k) => `  ${e}: ${f(mx[k] - mn[k])} mm (de ${f(mn[k])} a ${f(mx[k])})`),
    ];
  }
  if (!c) throw new Error(`${nome} não existe`);
  if (!ehSolido(c.forma)) {
    const [mn, mx] = c.forma.boundingBox.bounds;
    const f = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const { livres } = costurarFormas(c.forma.faces.map((x) => x.wrapped));
    return [
      `${nome} (corpo de superfície, sem volume)`,
      `Área: ${f(measureArea(c.forma))} mm²`,
      `Faces: ${c.forma.faces.length} · Arestas abertas: ${livres.length}`,
      "Caixa delimitadora:",
      ...["X", "Y", "Z"].map((e, k) => `  ${e}: ${f(mx[k] - mn[k])} mm (de ${f(mn[k])} a ${f(mx[k])})`),
    ];
  }
  const mat = MATERIAIS[c.material ?? MATERIAL_PADRAO];
  const ap = APARENCIAS[aparenciaDoCorpo(c)];
  const props = measureShapeVolumeProperties(c.forma);
  const vol = props.volume;
  const rho = mat.densidade / 1000; // g/mm³
  const [mn, mx] = c.forma.boundingBox.bounds;
  const cm = props.centerOfMass.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
  // Momento de inércia em volta de um eixo que passa pelo centro de massa.
  // O OpenCascade usa densidade 1 (mm⁵); vezes a densidade = g·mm².
  // (A matriz pronta do OpenCascade não vem nesta versão: os produtos saem de
  // eixos diagonais: ∫xy = (Ixx + Iyy)/2 − I(eixo entre x e y).)
  const oc = getOC() as unknown as {
    gp_Ax1: new (p: unknown, d: unknown) => unknown;
    gp_Pnt: new (x: number, y: number, z: number) => unknown;
    gp_Dir: new (x: number, y: number, z: number) => unknown;
  };
  const gp = props.wrapped as unknown as { MomentOfInertia(a: unknown): number };
  const em = (d: V3) => gp.MomentOfInertia(new oc.gp_Ax1(new oc.gp_Pnt(cm[0], cm[1], cm[2]), new oc.gp_Dir(...d))) * rho;
  const limpo = (v: number) => (Math.abs(v) < 1e-6 ? 0 : v);
  const [ixx, iyy, izz] = [em([1, 0, 0]), em([0, 1, 0]), em([0, 0, 1])];
  const pxy = limpo((ixx + iyy) / 2 - em([1, 1, 0]));
  const pyz = limpo((iyy + izz) / 2 - em([0, 1, 1]));
  const pxz = limpo((ixx + izz) / 2 - em([1, 0, 1]));
  return [
    nome,
    `Material físico: ${mat.nome}`,
    `Aparência: ${ap.nome}`,
    `Densidade: ${fmt(mat.densidade, 3)} g/cm³`,
    `Massa: ${fmt(vol * rho)} g`,
    `Volume: ${fmt(vol)} mm³`,
    `Área: ${fmt(measureArea(c.forma))} mm²`,
    `Faces: ${c.forma.faces.length} · Arestas: ${c.forma.edges.length}`,
    "Caixa delimitadora:",
    `  X: ${fmt(mx[0] - mn[0])} mm (de ${fmt(mn[0], 2)} a ${fmt(mx[0], 2)})`,
    `  Y: ${fmt(mx[1] - mn[1])} mm (de ${fmt(mn[1], 2)} a ${fmt(mx[1], 2)})`,
    `  Z: ${fmt(mx[2] - mn[2])} mm (de ${fmt(mn[2], 2)} a ${fmt(mx[2], 2)})`,
    `Centro de massa: (${cm.map((v) => fmt(v, 3)).join("; ")}) mm`,
    "Momentos de inércia no centro de massa (g·mm²):",
    `  Ixx ${fmt(ixx)}`,
    `  Iyy ${fmt(iyy)}`,
    `  Izz ${fmt(izz)}`,
    "Produtos de inércia (∫xy dm, g·mm²):",
    `  Pxy ${fmt(pxy)} · Pyz ${fmt(pyz)} · Pxz ${fmt(pxz)}`,
  ];
}

// ---- Medir (medidas exatas do OpenCascade, como no Fusion) ----

const fmt = (n: number, casas = 3) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function medir(p: Extract<PedidoNucleo, { tipo: "medir" }>): string[] {
  const { corpos } = construir(p.historico);
  const pegar = (it: { corpo: string; tipo: string; indice: number }) => {
    const c = corpos.find((x) => x.nome === it.corpo);
    if (!c) throw new Error(`${it.corpo} não existe`);
    if (it.tipo === "face") return { tipo: "face" as const, forma: c.forma.faces[it.indice], nome: `Face de ${it.corpo}` };
    if (it.tipo === "aresta") return { tipo: "aresta" as const, forma: c.forma.edges[it.indice], nome: `Aresta de ${it.corpo}` };
    return { tipo: "corpo" as const, forma: c.forma, nome: it.corpo, material: MATERIAIS[c.material ?? MATERIAL_PADRAO] };
  };
  const itens = p.itens.map(pegar);
  if (itens.some((i) => !i.forma)) throw new Error("Item não encontrado");
  const linhas: string[] = [];
  if (itens.length === 1) {
    const [i] = itens;
    linhas.push(i.nome);
    if (i.tipo === "corpo") {
      const f = i.forma as Shape3D;
      const vol = measureVolume(f);
      linhas.push(`Volume: ${fmt(vol)} mm³`, `Área total: ${fmt(measureArea(f))} mm²`);
      if ("material" in i && i.material) {
        // mm³ × g/cm³ ÷ 1000 = gramas
        linhas.push(`Material: ${i.material.nome} (${fmt(i.material.densidade, 2)} g/cm³)`, `Massa: ${fmt((vol * i.material.densidade) / 1000)} g`);
      }
      const c = measureShapeVolumeProperties(f).centerOfMass;
      linhas.push(`Centro de massa: (${c.map((v) => fmt(Math.abs(v) < 1e-9 ? 0 : v, 2)).join("; ")})`);
    } else if (i.tipo === "face") {
      const f = i.forma as Face;
      linhas.push(`Área: ${fmt(measureArea(f))} mm²`, `Tipo: ${f.geomType === "PLANE" ? "plana" : f.geomType === "CYLINDRE" ? "cilíndrica" : f.geomType.toLowerCase()}`);
    } else {
      const e = i.forma as Edge;
      linhas.push(`Comprimento: ${fmt(measureLength(e))} mm`, `Tipo: ${e.geomType === "LINE" ? "reta" : e.geomType === "CIRCLE" ? "círculo/arco" : e.geomType.toLowerCase()}`);
    }
    return linhas;
  }
  const [a, b] = itens;
  linhas.push(`${a.nome} → ${b.nome}`);
  linhas.push(`Distância mínima: ${fmt(measureDistanceBetween(a.forma, b.forma))} mm`);
  // Ângulo: entre duas faces planas (normais) ou duas arestas retas (direções).
  const direcao = (i: (typeof itens)[number]): V3 | null => {
    if (i.tipo === "face" && (i.forma as Face).geomType === "PLANE") {
      const n = (i.forma as Face).normalAt();
      return [n.x, n.y, n.z];
    }
    if (i.tipo === "aresta" && (i.forma as Edge).geomType === "LINE") {
      const e = i.forma as Edge;
      const s = e.startPoint, t = e.endPoint;
      return [t.x - s.x, t.y - s.y, t.z - s.z];
    }
    return null;
  };
  const da = direcao(a), db = direcao(b);
  if (da && db) {
    const dot = da[0] * db[0] + da[1] * db[1] + da[2] * db[2];
    const ang = (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(...da) * Math.hypot(...db))))) * 180) / Math.PI;
    linhas.push(`Ângulo: ${fmt(ang, 2)}°`);
  }
  return linhas;
}

// ---- Varredura: perfil de um esboço levado ao longo de um caminho ----

function fioDoCaminho(op: Operacao, esbocos: Map<string, DadosEsboco>): Wire {
  const c = op.caminho;
  const esboco = c && esbocos.get(c.esboco);
  if (!esboco || !c.curvas.length) throw new Error("Escolha o caminho (linha ou arco de um esboço)");
  const pos = (id: number) => {
    const p = esboco.pontos.find((q) => q.id === id)!;
    return paraMundo(esboco.plano, p.u, p.v);
  };
  const arestas = c.curvas.flatMap((id) => {
    const curva = esboco.curvas.find((x) => x.id === id);
    if (!curva || curva.tipo === "circulo" || curva.tipo === "elipse") throw new Error("O caminho mudou no esboço");
    if (curva.tipo === "linha") return [makeLine(pos(curva.a), pos(curva.b))];
    if (curva.tipo === "spline") return arestasDaSpline(esboco, curva);
    const g = geoArco(esboco, curva);
    const m = g.inicio + g.sweep / 2;
    const meio = paraMundo(esboco.plano, g.centro[0] + g.raio * Math.cos(m), g.centro[1] + g.raio * Math.sin(m));
    return [makeThreePointArc(pos(curva.a), meio, pos(curva.b))];
  });
  return assembleWire(arestas);
}

function formaDaVarredura(op: Operacao, esbocos: Map<string, DadosEsboco>): Shape3D {
  const caminho = fioDoCaminho(op, esbocos);
  const ref = op.perfis;
  const esboco = ref && esbocos.get(ref.esboco);
  if (!esboco || !ref.indices.length) throw new Error("Escolha o perfil (região de um esboço)");
  const { origem, eixoX, normal } = esboco.plano;
  const plano = new Plane(origem, eixoX, normal);
  const fio = (l: Laco) => (desenhoDoLaco(l).sketchOnPlane(plano) as unknown as { wire: Wire }).wire;
  let resultado: Shape3D | null = null;
  for (const i of ref.indices) {
    const perfil = perfis(esboco)[i];
    if (!perfil) throw new Error("O perfil não existe mais no esboço");
    let solido: Shape3D;
    try {
      solido = genericSweep(fio(perfil.externo), caminho, { frenet: true }, false);
      for (const furo of perfil.furos) solido = solido.cut(genericSweep(fio(furo), caminho, { frenet: true }, false));
    } catch {
      throw new Error("Não foi possível varrer (o perfil precisa encostar no começo do caminho?)");
    }
    resultado = resultado ? resultado.fuse(solido) : solido;
  }
  return resultado!;
}

// ---- Tubulação (pipe): tubo redondo ao longo de linhas/arcos/spline do esboço ----

function formaDaTubulacao(op: Operacao, esbocos: Map<string, DadosEsboco>): Shape3D {
  const caminho = fioDoCaminho(op, esbocos);
  const D = op.params.diametro ?? 0;
  const e = op.params.espessura ?? 0; // 0 = tubo cheio
  if (!(D > 0)) throw new Error("O diâmetro deve ser maior que zero");
  if (e < 0 || e >= D / 2) throw new Error("A parede deve ser menor que o raio");
  const inicio = caminho.startPoint;
  const t = caminho.tangentAt(0);
  const centro: V3 = [inicio.x, inicio.y, inicio.z];
  const dir: V3 = [t.x, t.y, t.z];
  const varrer = (r: number) => genericSweep(assembleWire([makeCircle(r, centro, dir)]), caminho, { frenet: true }, false) as Shape3D;
  try {
    const cheio = varrer(D / 2);
    return e > 0 ? cheio.cut(varrer(D / 2 - e)) : cheio;
  } catch {
    throw new Error("Não foi possível fazer o tubo (curva fechada demais para esse diâmetro?)");
  }
}

// Tubulação de superfície: só a parede de fora do tubo (sem as tampas planas).
function tuboDeSuperficie(op: Operacao, esbocos: Map<string, DadosEsboco>): Shape3D {
  const cheio = formaDaTubulacao({ ...op, params: { ...op.params, espessura: 0 } }, esbocos);
  const parede = cheio.faces.filter((f) => f.geomType !== "PLANE");
  if (!parede.length) throw new Error("Não foi possível fazer o tubo de superfície");
  return costurarFormas(parede.map((f) => f.wrapped)).forma;
}

// ---- Volume de fluido: o espaço dentro da peça (cavidades) vira corpo novo ----
// A caixa em volta dos corpos menos os corpos; ficam só os pedaços que não
// encostam nas paredes da caixa — menos no lado aberto ("tampa"), que é
// tampado pelo plano da caixa (ex.: copo aberto em cima).
function aplicarVolumeFluido(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void) {
  const alvos = corposDaOperacao(op, corpos);
  let uniao = alvos[0].forma.clone();
  for (const c of alvos.slice(1)) uniao = uniao.fuse(c.forma);
  const [mn, mx] = uniao.boundingBox.bounds;
  const resto = makeBox(mn as V3, mx as V3).cut(uniao);
  const pedacos = (resto as unknown as { solids: Shape3D[] }).solids ?? [resto];
  const tampa = op.opcoes?.tampa ?? "cima";
  const lados: Record<string, [number, 0 | 1]> = { cima: [1, 1], baixo: [1, 0], frente: [2, 1], tras: [2, 0], direita: [0, 1], esquerda: [0, 0] };
  const tol = 1e-3 * Math.max(1, ...[0, 1, 2].map((k) => mx[k] - mn[k]));
  const dentro = pedacos.filter((p) => {
    const [a, b] = p.boundingBox.bounds;
    return Object.entries(lados).every(([nome, [k, ponta]]) => {
      if (nome === tampa) return true;
      return ponta === 1 ? b[k] < mx[k] - tol : a[k] > mn[k] + tol;
    });
  });
  if (!dentro.length) throw new Error("Não achei espaço fechado dentro da peça (escolha o lado aberto certo)");
  dentro.forEach(criar);
}

// ---- Transição (Loft): liga perfis de esboços diferentes, na ordem clicada ----

function formaDaTransicao(op: Operacao, esbocos: Map<string, DadosEsboco>): Shape3D {
  const secoes = op.secoes ?? [];
  if (secoes.length < 2) throw new Error("Escolha pelo menos 2 perfis");
  const fios = secoes.map((s) => {
    const esboco = esbocos.get(s.esboco);
    const perfil = esboco && perfis(esboco)[s.indice];
    if (!esboco || !perfil) throw new Error("Um perfil escolhido não existe mais");
    const { origem, eixoX, normal } = esboco.plano;
    const desenho = desenhoDoLaco(perfil.externo); // furos do perfil são ignorados
    return (desenho.sketchOnPlane(new Plane(origem, eixoX, normal)) as unknown as { wire: Wire }).wire;
  });
  try {
    return loft(fios, { ruled: op.opcoes?.regrada === "sim" });
  } catch {
    throw new Error("Não foi possível fazer a transição entre esses perfis");
  }
}

// ---- Nervura (rib) e Teia (web) ----
// Nervura: a parede fica NO plano do esboço e cresce da linha até o corpo.
// Teia: a parede fica em pé, cresce na direção da normal do esboço até o corpo.
// Para cada linha: uma fatia larga no plano do esboço (espessura metade para
// cada lado), que sai da linha para um dos lados; as pontas da linha são
// esticadas até entrar no corpo. Tirando os corpos da fatia, o pedaço que
// encosta na linha é a nervura. Se esse pedaço não fica preso dentro da caixa
// dos corpos, a fatia "vazou": aquele lado não tem corpo, tenta o outro.

function formaDaNervura(op: Operacao, esbocos: Map<string, DadosEsboco>, corpos: Corpo[]): Shape3D {
  const c = op.caminho;
  const esboco = c && esbocos.get(c.esboco);
  const teia = op.tipo === "teia";
  const qual = teia ? "teia" : "nervura";
  if (!esboco || !c.curvas.length) throw new Error("Escolha uma linha reta de um esboço");
  if (!corpos.length) throw new Error(`A ${qual} precisa de um corpo para encostar`);
  const t = op.params.espessura ?? 3;
  const prof = op.params.profundidade ?? 0;
  if (!(t > 0)) throw new Error("A espessura deve ser maior que zero");
  if (prof < 0) throw new Error("A profundidade não pode ser negativa");
  const pl = esboco.plano;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const k of corpos) {
    const [a, b] = k.forma.boundingBox.bounds;
    for (let i = 0; i < 3; i++) (mn[i] = Math.min(mn[i], a[i])), (mx[i] = Math.max(mx[i], b[i]));
  }
  const D = 2 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + 10;
  const mundo = (q: P2) => paraMundo(pl, q[0], q[1]);
  const plano = new Plane(
    [pl.origem[0] - (pl.normal[0] * t) / 2, pl.origem[1] - (pl.normal[1] * t) / 2, pl.origem[2] - (pl.normal[2] * t) / 2],
    pl.eixoX,
    pl.normal,
  );
  const ponto = (id: number): P2 => {
    const p = esboco.pontos.find((q) => q.id === id);
    if (!p) throw new Error("A linha mudou no esboço");
    return [p.u, p.v];
  };
  // Quanto andar de P na direção dir (no esboço) até entrar no corpo (0 se não encontra).
  const esticar = (P: P2, dir: P2): P2 => {
    const a = mundo(P);
    const b = mundo([P[0] + dir[0] * D, P[1] + dir[1] * D]);
    const d3 = [(b[0] - a[0]) / D, (b[1] - a[1]) / D, (b[2] - a[2]) / D];
    const reta = makeLine(a, b);
    let menor = Infinity;
    for (const k of corpos) {
      try {
        const comum = k.forma.intersect(reta as never);
        for (const e of comum.edges)
          for (const q of [e.startPoint, e.endPoint]) {
            const d = (q.x - a[0]) * d3[0] + (q.y - a[1]) * d3[1] + (q.z - a[2]) * d3[2];
            if (d > -1e-6 && d < menor) menor = d;
          }
      } catch {
        // sem encontro com este corpo
      }
    }
    const s = menor < Infinity ? menor + 0.5 : 0;
    return [P[0] + dir[0] * s, P[1] + dir[1] * s];
  };
  const planoTeia = new Plane(pl.origem, pl.eixoX, pl.normal);
  // s = lado (+1/−1): na nervura é o lado da linha no plano; na teia, o lado da normal.
  const tentar = (A: P2, B: P2, u: P2, s: number, fundo: number) => {
    const p1 = esticar(A, [-u[0], -u[1]]);
    const p2 = esticar(B, u);
    const w: P2 = [-u[1], u[0]]; // perpendicular à linha, no plano (à esquerda)
    let fatia: Shape3D;
    let alvo: ReturnType<typeof makeVertex>;
    let longe: ReturnType<typeof makeVertex>[]; // pontos na ponta de longe da fatia
    if (teia) {
      const h = t / 2;
      const pts: P2[] = [
        [p1[0] - w[0] * h, p1[1] - w[1] * h],
        [p2[0] - w[0] * h, p2[1] - w[1] * h],
        [p2[0] + w[0] * h, p2[1] + w[1] * h],
        [p1[0] + w[0] * h, p1[1] + w[1] * h],
      ];
      fatia = draw(pts[0]).lineTo(pts[1]).lineTo(pts[2]).lineTo(pts[3]).close().sketchOnPlane(planoTeia).extrude(fundo) as Shape3D;
      if (s < 0) fatia = fatia.translate([-pl.normal[0] * fundo, -pl.normal[1] * fundo, -pl.normal[2] * fundo]);
      const no = (q: P2, k: number) => {
        const m = mundo(q);
        return makeVertex([m[0] + pl.normal[0] * s * k, m[1] + pl.normal[1] * s * k, m[2] + pl.normal[2] * s * k]);
      };
      alvo = no([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], 0.05);
      longe = [p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], p2].map((q) => no(q as P2, fundo - 0.05));
    } else {
      const n: P2 = [w[0] * s, w[1] * s];
      const p3: P2 = [p2[0] + n[0] * fundo, p2[1] + n[1] * fundo];
      const p4: P2 = [p1[0] + n[0] * fundo, p1[1] + n[1] * fundo];
      // Contorno sempre no sentido anti-horário (no outro sentido o corte não funciona).
      const pts = u[0] * n[1] - u[1] * n[0] > 0 ? [p1, p2, p3, p4] : [p1, p4, p3, p2];
      fatia = draw(pts[0]).lineTo(pts[1]).lineTo(pts[2]).lineTo(pts[3]).close().sketchOnPlane(plano).extrude(t) as Shape3D;
      alvo = makeVertex(mundo([(A[0] + B[0]) / 2 + n[0] * 0.05, (A[1] + B[1]) / 2 + n[1] * 0.05]));
      const k = fundo - 0.05;
      longe = [p1, [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as P2, p2].map((q) => makeVertex(mundo([q[0] + n[0] * k, q[1] + n[1] * k])));
    }
    let resto: Shape3D = fatia;
    for (const k of corpos) if (tocam(k.forma, resto)) resto = resto.cut(k.forma);
    const pedacos = (resto as unknown as { solids: Shape3D[] }).solids;
    let melhor: Shape3D | null = null;
    let dm = Infinity;
    for (const s of pedacos.length ? pedacos : [resto]) {
      const d = measureDistanceBetween(s, alvo);
      if (d < dm) (dm = d), (melhor = s);
    }
    if (!melhor) return null;
    // "Vazou" = o pedaço chega à ponta de longe da fatia (não encontrou corpo no caminho).
    const peca = melhor;
    const preso = longe.every((q) => measureDistanceBetween(peca, q) > 0.2);
    return { forma: melhor, preso };
  };
  let resultado: Shape3D | null = null;
  for (const id of c.curvas) {
    const curva = esboco.curvas.find((x) => x.id === id);
    if (!curva) throw new Error("A linha mudou no esboço");
    if (curva.tipo !== "linha") throw new Error(`Por enquanto a ${qual} só usa linhas retas`);
    const A = ponto(curva.a), B = ponto(curva.b);
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (len < 1e-6) throw new Error("Linha com comprimento zero");
    const u: P2 = [(B[0] - A[0]) / len, (B[1] - A[1]) / len];
    const lados = op.opcoes?.lado === "inverter" ? [-1, 1] : [1, -1];
    let feito: Shape3D | null = null;
    for (const s of lados) {
      const ate = tentar(A, B, u, s, D);
      if (!ate?.preso) continue;
      feito = prof > 0 ? tentar(A, B, u, s, prof)?.forma ?? null : ate.forma;
      break;
    }
    if (!feito)
      throw new Error(
        teia
          ? "A teia não encontra o corpo (o esboço precisa ficar de frente para a peça)"
          : "A nervura não encontra o corpo (a linha precisa ficar de frente para a peça)",
      );
    resultado = resultado ? resultado.fuse(feito) : feito;
  }
  return resultado!;
}

// ---- Substituir face ----
// A face escolhida passa a ficar no plano alvo, e o corpo cresce ou encolhe
// até lá. Conta usada: a "coluna" da face (prisma ao longo da normal dela) e o
// lado de dentro do alvo (meio-espaço H). Corpo novo = corpo − (coluna fora de H)
// + (coluna para fora da face, dentro de H). Só muda o que está em cima/baixo
// da face; o resto do corpo fica igual.

function aplicarSubstituirFace(op: Operacao, corpos: Corpo[], estado: Estado) {
  const refs = (op.referencias ?? []).filter((r) => r.tipo === "face");
  const chave = op.opcoes?.alvo ?? "XY";
  let P0: V3, m0: V3;
  let fontes = refs;
  if (chave === "ultima") {
    // Alvo = a última face clicada (de qualquer corpo); as outras são trocadas.
    if (refs.length < 2) throw new Error("Clique nas faces a trocar e, por último, na face alvo");
    const alvoRef = refs[refs.length - 1];
    fontes = refs.slice(0, -1);
    const f = corpos.find((c) => c.nome === alvoRef.corpo)?.forma.faces[alvoRef.indice];
    if (!f) throw new Error("A face alvo não existe mais");
    if (f.geomType !== "PLANE") throw new Error("Por enquanto a face alvo precisa ser plana");
    const n = f.normalAt(), c = f.center;
    P0 = [c.x, c.y, c.z];
    m0 = [n.x, n.y, n.z];
  } else {
    const p = planoDaOpcao(chave, estado.planos);
    if (!p) throw new Error("O plano alvo não existe mais");
    P0 = p.origem;
    m0 = p.normal;
  }
  for (const [corpo, faces] of facesPorCorpo({ ...op, referencias: fontes }, corpos))
    corpo.forma = trocarFacesPorPlanos(corpo.forma, faces.map((f) => ({ f, P0, m0 })));
}

const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vmul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vunit = (a: V3): V3 => vmul(a, 1 / Math.hypot(...a));

// Cada face plana passa a ficar no seu plano alvo (ponto P0, normal m0).
// Usado por Substituir face e Mover face.
function trocarFacesPorPlanos(forma0: Shape3D, pares: { f: Face; P0: V3; m0: V3 }[]): Shape3D {
  const [sub, dot, mul, add, unit] = [vsub, vdot, vmul, vadd, vunit];
  const [mn, mx] = forma0.boundingBox.bounds;
  const centro: V3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  {
    // Faz todas as ferramentas antes de mexer no corpo (as faces são do corpo original).
    const tarefas = pares.map(({ f, P0, m0 }) => {
      const L = 4 * (Math.hypot(...sub(mx as V3, mn as V3)) + Math.abs(dot(sub(centro, P0), unit(m0)))) + 10;
      if (f.geomType !== "PLANE") throw new Error("Por enquanto só faces planas podem ser trocadas");
      const nn = f.normalAt();
      const n: V3 = [nn.x, nn.y, nn.z];
      let m = unit(m0);
      if (dot(m, n) < 0) m = mul(m, -1);
      if (dot(m, n) < 1e-6) throw new Error("O alvo fica de lado em relação à face (paralelo à normal dela)");
      const a: V3 = Math.abs(m[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = unit(cruzar(m, a)), v = cruzar(m, u);
      const pc = sub(centro, mul(m, dot(sub(centro, P0), m))); // centro levado ao alvo
      const q = (s: number, t: number) => add(add(pc, mul(u, s * L)), mul(v, t * L));
      const quadrado = makeFace(
        assembleWire([makeLine(q(-1, -1), q(1, -1)), makeLine(q(1, -1), q(1, 1)), makeLine(q(1, 1), q(-1, 1)), makeLine(q(-1, 1), q(-1, -1))]),
      );
      const H = basicFaceExtrusion(quadrado, new Vector(mul(m, -2 * L))) as Shape3D;
      const coluna = basicFaceExtrusion(f.clone().translate(mul(n, -L)) as Face, new Vector(mul(n, 2 * L))) as Shape3D;
      const fora = basicFaceExtrusion(f, new Vector(mul(n, L))) as Shape3D;
      return { tirar: coluna.cut(H), por: fora.intersect(H) };
    });
    let forma = forma0;
    try {
      for (const t of tarefas) {
        forma = forma.cut(t.tirar);
        if (measureVolume(t.por) > 1e-9) forma = forma.fuse(t.por);
      }
    } catch {
      throw new Error("Não foi possível mudar a face");
    }
    if (measureVolume(forma) < 1e-9) throw new Error("O corpo sumiria (o alvo passa do outro lado da peça)");
    return forma;
  }
}


// ---- Cilindro de uma face (eixo, raio, altura) e se é furo (normal para o eixo) ----
function cilindroDaFace(f: Face) {
  const oc = getOC() as unknown as {
    BRepAdaptor_Surface: new (f: unknown, r: boolean) => {
      FirstUParameter(): number; LastUParameter(): number; FirstVParameter(): number; LastVParameter(): number;
      Value(u: number, v: number): { X(): number; Y(): number; Z(): number };
      Cylinder(): { Radius(): number; Axis(): { Location(): { X(): number; Y(): number; Z(): number }; Direction(): { X(): number; Y(): number; Z(): number } } };
    };
  };
  const ad = new oc.BRepAdaptor_Surface(f.wrapped, true);
  const cil = ad.Cylinder();
  const L = cil.Axis().Location(), D = cil.Axis().Direction();
  const p0: V3 = [L.X(), L.Y(), L.Z()], d: V3 = [D.X(), D.Y(), D.Z()];
  const v0 = ad.FirstVParameter(), v1 = ad.LastVParameter();
  const q = ad.Value((ad.FirstUParameter() + ad.LastUParameter()) / 2, (v0 + v1) / 2);
  const pq: V3 = [q.X(), q.Y(), q.Z()];
  const n = f.normalAt(pq);
  const t = vdot(vsub(pq, p0), d);
  const rad = vsub(vsub(pq, p0), vmul(d, t));
  const furo = vdot(rad, [n.x, n.y, n.z]) < 0;
  return { p0, d, raio: cil.Radius(), v0, v1, furo, volta: ad.LastUParameter() - ad.FirstUParameter() };
}

// Faces do mesmo cilindro (mesmo eixo e raio) somam uma volta inteira?
function voltaInteira(forma: Shape3D, c: ReturnType<typeof cilindroDaFace>): boolean {
  let soma = 0;
  for (const g of forma.faces) {
    if (g.geomType !== "CYLINDRE") continue;
    const o = cilindroDaFace(g);
    const dd = vsub(o.p0, c.p0);
    const fora = vsub(dd, vmul(c.d, vdot(dd, c.d)));
    if (Math.abs(o.raio - c.raio) < 1e-6 && Math.abs(Math.abs(vdot(o.d, c.d)) - 1) < 1e-9 && Math.hypot(...fora) < 1e-6) soma += o.volta;
  }
  return soma >= 2 * Math.PI - 1e-3;
}

// Anel (ou cilindro cheio se rIn = 0) entre os raios, na altura da face.
function anel(c: ReturnType<typeof cilindroDaFace>, rIn: number, rOut: number): Shape3D {
  const base = vadd(c.p0, vmul(c.d, c.v0));
  const h = c.v1 - c.v0;
  const fora = makeCylinder(rOut, h, base, c.d) as Shape3D;
  return rIn > 1e-9 ? fora.cut(makeCylinder(rIn, h, base, c.d) as Shape3D) : fora;
}

// ---- Face de deslocamento: a face anda "distancia" pela própria normal ----
// Plana: o plano anda (vizinhas acompanham). Cilíndrica inteira: o raio muda
// (furo: positivo fecha o furo; pino: positivo engrossa).
function aplicarDeslocarFace(op: Operacao, corpos: Corpo[]) {
  const dist = op.params.distancia ?? 0;
  if (!dist) throw new Error("A distância não pode ser zero");
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    const planas = faces.filter((f) => f.geomType === "PLANE");
    const cilindros = faces.filter((f) => f.geomType === "CYLINDRE");
    if (planas.length + cilindros.length < faces.length) throw new Error("Por enquanto só faces planas ou cilíndricas");
    const tarefas = cilindros.map((f) => {
      const c = cilindroDaFace(f);
      if (!voltaInteira(corpo.forma, c)) throw new Error("A face cilíndrica precisa dar uma volta inteira");
      const r2 = c.furo ? c.raio - dist : c.raio + dist;
      if (r2 <= 0) throw new Error("O raio ficaria zero ou negativo");
      // Material entra entre os dois raios (furo fechando / pino engrossando) ou sai.
      const cresce = c.furo ? dist > 0 : dist > 0;
      return { anel: anel(c, Math.min(c.raio, r2), Math.max(c.raio, r2)), unir: cresce };
    });
    let forma = corpo.forma;
    if (planas.length)
      forma = trocarFacesPorPlanos(
        forma,
        planas.map((f) => {
          const c = f.center, nn = f.normalAt();
          const n: V3 = [nn.x, nn.y, nn.z];
          return { f, P0: vadd([c.x, c.y, c.z], vmul(n, dist)), m0: n };
        }),
      );
    for (const t of tarefas) forma = t.unir ? forma.fuse(t.anel) : forma.cut(t.anel);
    corpo.forma = forma;
  }
}

// ---- Remover faces: por enquanto, tampa furos redondos (faces cilíndricas de furo) ----
function aplicarRemoverFaces(op: Operacao, corpos: Corpo[]) {
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    const tampas = faces.map((f) => {
      if (f.geomType !== "CYLINDRE") throw new Error("Por enquanto Remover faces só tampa furos redondos (escolha a parede do furo)");
      const c = cilindroDaFace(f);
      if (!c.furo) throw new Error("Essa face cilíndrica é de fora (pino), não de furo");
      if (!voltaInteira(corpo.forma, c)) throw new Error("O furo precisa ser uma volta inteira");
      return anel(c, 0, c.raio);
    });
    let forma = corpo.forma;
    for (const t of tampas) forma = forma.fuse(t);
    corpo.forma = forma;
  }
}

// ---- Remover recursos: tampa sozinho os furos redondos até um diâmetro ----
// (o Fusion também tira arredondamentos e chanfros; o OpenCascade desta versão
// não tem essa função, então aqui são só os furos).
function aplicarRemoverRecursos(op: Operacao, corpos: Corpo[]) {
  const max = op.params.diametroMax ?? 0;
  if (!(max > 0)) throw new Error("O diâmetro máximo deve ser maior que zero");
  let total = 0;
  for (const corpo of corposDaOperacao(op, corpos)) {
    let forma = corpo.forma;
    for (const f of corpo.forma.faces) {
      if (f.geomType !== "CYLINDRE") continue;
      const c = cilindroDaFace(f);
      if (!c.furo || 2 * c.raio > max + 1e-6 || !voltaInteira(corpo.forma, c)) continue;
      forma = forma.fuse(anel(c, 0, c.raio));
      total++;
    }
    corpo.forma = forma;
  }
  if (!total) throw new Error(`Nenhum furo redondo de até ${max} mm`);
}

// ---- Padrão geométrico: cópias do corpo nos pontos de um esboço ----
// Pontos soltos do esboço (sem curva); se não houver, os centros dos círculos.
// O centro do corpo vai para cada ponto (só no plano do esboço).
function aplicarPadraoGeometrico(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void, esbocos: Map<string, DadosEsboco>) {
  const ref = (op.opcoes?.esboco ?? "").replace(/^esb:/, "");
  const e = esbocos.get(ref);
  if (!e) throw new Error("Escolha o esboço com os pontos");
  const usados = new Set(e.curvas.flatMap((c) => idsDaCurva(c)));
  let pts = e.pontos.filter((p) => p.id !== 0 && !usados.has(p.id));
  if (!pts.length) pts = e.curvas.filter((c) => c.tipo === "circulo").map((c) => e.pontos.find((p) => p.id === (c as { centro: number }).centro)!);
  if (!pts.length) throw new Error("O esboço não tem pontos soltos nem círculos");
  if (pts.length > 400) throw new Error("No máximo 400 pontos");
  const n = e.plano.normal;
  for (const alvo of corposDaOperacao(op, corpos)) {
    const [mn, mx] = alvo.forma.boundingBox.bounds;
    const centro: V3 = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2) as V3;
    const copias = pts.map((p) => {
      const w = paraMundo(e.plano, p.u, p.v);
      let d: V3 = [w[0] - centro[0], w[1] - centro[1], w[2] - centro[2]];
      const ao = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / (n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
      d = [d[0] - ao * n[0], d[1] - ao * n[1], d[2] - ao * n[2]];
      return alvo.forma.clone().translate(d);
    });
    guardarCopias(op, alvo, copias, criar);
  }
}

// ---- Alinhar: a 1ª face (do corpo que anda) encosta na 2ª face (alvo) ----
// O corpo gira para as faces ficarem de frente (normais opostas; "inverter"
// deixa no mesmo sentido) e anda até os centros das faces coincidirem.
function aplicarAlinhar(op: Operacao, corpos: Corpo[]) {
  const refs = (op.referencias ?? []).filter((r) => r.tipo === "face");
  if (refs.length < 2) throw new Error("Clique na face do corpo que vai andar e depois na face alvo");
  const [ra, rb] = [refs[0], refs[refs.length - 1]];
  const ca = corpos.find((c) => c.nome === ra.corpo), cb = corpos.find((c) => c.nome === rb.corpo);
  const fa = ca?.forma.faces[ra.indice], fb = cb?.forma.faces[rb.indice];
  if (!ca || !fa || !fb) throw new Error("Uma face escolhida não existe mais");
  if (ca === cb) throw new Error("As duas faces são do mesmo corpo");
  if (fa.geomType !== "PLANE" || fb.geomType !== "PLANE") throw new Error("Por enquanto só faces planas");
  const na0 = fa.normalAt(), nb0 = fb.normalAt();
  const na: V3 = [na0.x, na0.y, na0.z];
  const alvo: V3 = op.opcoes?.inverter === "sim" ? [nb0.x, nb0.y, nb0.z] : [-nb0.x, -nb0.y, -nb0.z];
  const pa: V3 = [fa.center.x, fa.center.y, fa.center.z], pb: V3 = [fb.center.x, fb.center.y, fb.center.z];
  let forma = ca.forma.clone();
  const cosAng = Math.max(-1, Math.min(1, vdot(na, alvo)));
  if (cosAng < 1 - 1e-12) {
    let eixo = cruzar(na, alvo);
    if (Math.hypot(...eixo) < 1e-9) eixo = Math.abs(na[0]) < 0.9 ? cruzar(na, [1, 0, 0]) : cruzar(na, [0, 1, 0]); // 180°
    forma = forma.rotate((Math.acos(cosAng) * 180) / Math.PI, pa, vunit(eixo));
  }
  ca.forma = forma.translate(vsub(pb, pa));
}


// ---- Alto-relevo (emboss) projetado ----
// O perfil do esboço "atravessa" a peça na direção da normal do esboço; a face
// alvo é a primeira face plana (paralela ao esboço) ou cilíndrica (eixo de lado)
// que o centro do perfil encontra. Relevo: cresce "profundidade" para fora da
// face; gravar: entra "profundidade" na peça.
// Diferença do Fusion: o Fusion enrola o desenho no cilindro; aqui ele é
// projetado (no cilindro, letras longe do centro ficam um pouco esticadas).
function aplicarAltoRelevo(op: Operacao, corpos: Corpo[], esbocos: Map<string, DadosEsboco>) {
  const prof = op.params.profundidade ?? 0;
  if (!(prof > 0)) throw new Error("A profundidade deve ser maior que zero");
  const ref = op.perfis;
  const esboco = ref && esbocos.get(ref.esboco);
  if (!esboco || !ref.indices.length) throw new Error("Escolha o perfil (região de um esboço)");
  const pl = esboco.plano;
  const n = vunit(pl.normal);
  // Centro dos perfis escolhidos (média dos contornos), no mundo.
  const lista = perfis(esboco);
  let su = 0, sv = 0, k = 0;
  for (const i of ref.indices) {
    const pf = lista[i];
    if (!pf) throw new Error("O perfil não existe mais no esboço");
    for (const q of contornoDoLaco(pf.externo, 32)) (su += q[0]), (sv += q[1]), k++;
  }
  const centro = paraMundo(pl, su / k, sv / k);
  // Face alvo: a mais perto ao longo da normal (dos dois lados).
  type Alvo = { corpo: Corpo; t: number; plano?: { p: V3; m: V3 }; cil?: ReturnType<typeof cilindroDaFace> };
  let melhor: Alvo | null = null;
  for (const corpo of corpos) {
    for (const f of corpo.forma.faces) {
      let t: number | null = null;
      let alvo: Alvo | null = null;
      if (f.geomType === "PLANE") {
        const nn = f.normalAt();
        const m: V3 = [nn.x, nn.y, nn.z];
        const den = vdot(m, n);
        if (Math.abs(den) < 0.999) continue; // só faces paralelas ao esboço
        const c = f.center;
        t = vdot(vsub([c.x, c.y, c.z], centro), m) / den;
        alvo = { corpo, t, plano: { p: [c.x, c.y, c.z], m } };
      } else if (f.geomType === "CYLINDRE") {
        const c = cilindroDaFace(f);
        if (Math.abs(vdot(c.d, n)) > 1e-6) continue; // eixo precisa ficar de lado
        // Reta centro + n·t contra o cilindro.
        const w = vsub(centro, c.p0);
        const wp = vsub(w, vmul(c.d, vdot(w, c.d)));
        const B = vdot(wp, n), C = vdot(wp, wp) - c.raio * c.raio;
        const disc = B * B - C;
        if (disc < 0) continue;
        const ts = [-B - Math.sqrt(disc), -B + Math.sqrt(disc)];
        t = ts.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b));
        alvo = { corpo, t, cil: c };
      }
      if (t === null || !alvo) continue;
      // O ponto encontrado precisa estar dentro da face (não só na superfície).
      const ponto = vadd(centro, vmul(n, t));
      if (measureDistanceBetween(f, makeVertex(ponto)) > 1e-3) continue;
      if (!melhor || Math.abs(t) < Math.abs(melhor.t)) melhor = alvo;
    }
  }
  if (!melhor) throw new Error("O perfil não encontra nenhuma face plana paralela ou cilíndrica de lado");
  const [mn, mx] = melhor.corpo.forma.boundingBox.bounds;
  const L = 2 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + Math.abs(melhor.t) + 10;
  // Perfil esticado pela normal, bem comprido para os dois lados.
  const prisma = solidoDosPerfis(op, esbocos, (s) => s.extrude(L)).fuse(solidoDosPerfis(op, esbocos, (s) => s.extrude(-L)));
  const gravar = op.opcoes?.tipo === "gravar";
  let regiao: Shape3D;
  if (melhor.plano) {
    const { p, m } = melhor.plano;
    const a: V3 = Math.abs(m[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = vunit(cruzar(m, a)), v = cruzar(m, u);
    const q = (s: number, t: number) => vadd(vadd(p, vmul(u, s * L)), vmul(v, t * L));
    const quadrado = makeFace(assembleWire([makeLine(q(-1, -1), q(1, -1)), makeLine(q(1, -1), q(1, 1)), makeLine(q(1, 1), q(-1, 1)), makeLine(q(-1, 1), q(-1, -1))]));
    regiao = basicFaceExtrusion(quadrado, new Vector(vmul(m, gravar ? -prof : prof))) as Shape3D;
  } else {
    const c = melhor.cil!;
    const base = vsub(c.p0, vmul(c.d, L));
    const casca = gravar
      ? (makeCylinder(c.raio, 2 * L, base, c.d) as Shape3D).cut(makeCylinder(Math.max(c.raio - prof, 1e-3), 2 * L, base, c.d) as Shape3D)
      : (makeCylinder(c.raio + prof, 2 * L, base, c.d) as Shape3D).cut(makeCylinder(c.raio, 2 * L, base, c.d) as Shape3D);
    // Só a metade do cilindro virada para o esboço.
    const lado = vsub(vsub(centro, c.p0), vmul(c.d, vdot(vsub(centro, c.p0), c.d)));
    const m = vunit(lado);
    const u = c.d, v = cruzar(m, u);
    const q = (s: number, t: number) => vadd(vadd(c.p0, vmul(u, s * L)), vmul(v, t * L));
    const quadrado = makeFace(assembleWire([makeLine(q(-1, -1), q(1, -1)), makeLine(q(1, -1), q(1, 1)), makeLine(q(1, 1), q(-1, 1)), makeLine(q(-1, 1), q(-1, -1))]));
    const metade = basicFaceExtrusion(quadrado, new Vector(vmul(m, L))) as Shape3D;
    regiao = casca.intersect(metade);
  }
  const peca = prisma.intersect(regiao);
  if (measureVolume(peca) < 1e-9) throw new Error("O perfil não cai em cima da face");
  melhor.corpo.forma = gravar ? melhor.corpo.forma.cut(peca) : melhor.corpo.forma.fuse(peca);
}


// ---- Montagem: componentes, juntas e componente importado (STEP/STL) ----

// Origem e eixo Z de uma junta tirados de uma face/aresta:
// face plana = centro e normal; face cilíndrica = meio do eixo e direção do eixo;
// aresta circular = centro e normal do círculo; aresta reta = meio e direção.
function origemDeJunta(forma: Shape3D, ref: { tipo: string; indice: number }): { p: V3; z: V3 } {
  const v = (q: { x: number; y: number; z: number }): V3 => [q.x, q.y, q.z];
  if (ref.tipo === "face") {
    const f = forma.faces[ref.indice];
    if (!f) throw new Error("A face da junta não existe mais");
    if (f.geomType === "PLANE") return { p: v(f.center), z: v(f.normalAt()) };
    if (f.geomType === "CYLINDRE") {
      const c = cilindroDaFace(f);
      return { p: vadd(c.p0, vmul(c.d, (c.v0 + c.v1) / 2)), z: c.d };
    }
    return { p: v(f.center), z: v(f.normalAt()) };
  }
  const e = forma.edges[ref.indice];
  if (!e) throw new Error("A aresta da junta não existe mais");
  if (e.geomType === "CIRCLE") {
    const [p1, p2, p3] = [0, 1 / 3, 2 / 3].map((k) => v(e.pointAt(k)));
    const a = vsub(p2, p1), b = vsub(p3, p1);
    const n = cruzar(a, b);
    const centro = vadd(p1, vmul(vadd(vmul(cruzar(n, a), vdot(b, b)), vmul(cruzar(b, n), vdot(a, a))), 1 / (2 * vdot(n, n))));
    return { p: centro, z: vunit(n) };
  }
  return { p: v(e.pointAt(0.5)), z: vunit(v(e.tangentAt(0.5))) };
}

// Corpos que andam juntos com este (o componente dele, ou só ele).
function grupoDoCorpo(nome: string, corpos: Corpo[], componentes: Map<string, string[]>): Corpo[] {
  for (const lista of componentes.values()) if (lista.includes(nome)) return corpos.filter((c) => lista.includes(c.nome));
  return corpos.filter((c) => c.nome === nome);
}

function aplicarComponente(op: Operacao, corpos: Corpo[], componentes: Map<string, string[]>) {
  const nomes = (op.corpos ?? []).filter((n) => corpos.some((c) => c.nome === n));
  if (!nomes.length) throw new Error("Escolha os corpos do componente");
  // Um corpo fica em um componente só.
  for (const [k, lista] of componentes) componentes.set(k, lista.filter((n) => !nomes.includes(n)));
  componentes.set(op.nome, nomes);
}

// Junta: o componente da 1ª referência vai até a 2ª (eixos Z de frente; "inverter"
// deixa no mesmo sentido), afastado "afastamento", e depois se mexe pelo tipo:
// giratória/esférica giram "angulo", deslizante anda "distancia" no eixo,
// cilíndrica faz os dois, planar anda "distancia" de lado, rígida fica parada.
// "Como está" (as-built): não leva até lá, só aplica o movimento em volta da 2ª.
function aplicarJunta(op: Operacao, corpos: Corpo[], componentes: Map<string, string[]>, origens: Map<string, { ref: Referencia; d: V3 }>) {
  const refs = op.referencias ?? [];
  if (refs.length < 2) throw new Error("Escolha uma face/aresta em cada componente");
  // Origem da junta escolhida no lugar do clique (opcoes.origemA/origemB = id da Origem).
  const origem = (chave: "origemA" | "origemB") => {
    const id = op.opcoes?.[chave];
    if (!id) return null;
    const o = origens.get(id);
    if (!o) throw new Error("A origem da junta escolhida não existe (ou vem depois da junta)");
    return o;
  };
  const og = [origem("origemA"), origem("origemB")];
  const [ra, rb] = [og[0]?.ref ?? refs[0], og[1]?.ref ?? refs[refs.length - 1]];
  const ca = corpos.find((c) => c.nome === ra.corpo), cb = corpos.find((c) => c.nome === rb.corpo);
  if (!ca || !cb) throw new Error("Um corpo da junta não existe mais");
  const grupo = grupoDoCorpo(ca.nome, corpos, componentes);
  if (grupo.includes(cb)) throw new Error("As duas escolhas estão no mesmo componente");
  const deslocar = (o: { p: V3; z: V3 }, d?: V3) => (d ? { p: vadd(o.p, d), z: o.z } : o);
  const oa = deslocar(origemDeJunta(ca.forma, ra), og[0]?.d), ob = deslocar(origemDeJunta(cb.forma, rb), og[1]?.d);
  const tipo = op.opcoes?.tipo ?? "rigida";
  const p = op.params;
  const zb = vunit(ob.z);
  const comoEsta = op.opcoes?.comoEsta === "sim";
  const destino = vadd(ob.p, vmul(zb, p.afastamento ?? 0));
  const mexer = (f: Shape3D): Shape3D => {
    let s = f.clone();
    if (!comoEsta) {
      const alvo = op.opcoes?.inverter === "sim" ? zb : vmul(zb, -1);
      const za = vunit(oa.z);
      const cosA = Math.max(-1, Math.min(1, vdot(za, alvo)));
      if (cosA < 1 - 1e-12) {
        let eixo = cruzar(za, alvo);
        if (Math.hypot(...eixo) < 1e-9) eixo = Math.abs(za[0]) < 0.9 ? cruzar(za, [1, 0, 0]) : cruzar(za, [0, 1, 0]);
        s = s.rotate((Math.acos(cosA) * 180) / Math.PI, oa.p, vunit(eixo));
      }
      s = s.translate(vsub(destino, oa.p));
    }
    const centro = comoEsta ? ob.p : destino;
    if ((tipo === "giratoria" || tipo === "cilindrica" || tipo === "esferica") && p.angulo) s = s.rotate(p.angulo, centro, zb);
    if ((tipo === "deslizante" || tipo === "cilindrica") && p.distancia) s = s.translate(vmul(zb, p.distancia));
    if (tipo === "planar" && p.distancia) {
      const lado = vunit(Math.abs(zb[0]) < 0.9 ? cruzar(zb, [1, 0, 0]) : cruzar(zb, [0, 1, 0]));
      s = s.translate(vmul(lado, p.distancia));
    }
    return s;
  };
  for (const c of grupo) c.forma = mexer(c.forma);
}

// Duplicar com juntas: cópia dos corpos do componente, com os nomes que a tela
// escolheu (opcoes.nomes, separados por vírgula), num componente novo. A tela
// cria depois a junta copiada, que leva a cópia para outro lugar.
function aplicarDuplicar(op: Operacao, corpos: Corpo[], componentes: Map<string, string[]>) {
  const origem = op.corpos ?? [];
  const nomes = (op.opcoes?.nomes ?? "").split(",").filter(Boolean);
  if (!origem.length || nomes.length !== origem.length) throw new Error("Escolha o componente a duplicar");
  origem.forEach((n, i) => {
    const c = corpos.find((x) => x.nome === n);
    if (!c) throw new Error(`${n} não existe`);
    if (corpos.some((x) => x.nome === nomes[i])) throw new Error(`Já existe um corpo ${nomes[i]}`);
    corpos.push({ ...c, id: `${op.id}:${i}`, nome: nomes[i], forma: c.forma.clone() });
  });
  componentes.set(op.nome, nomes);
}

// ---- Operação base (sólido) e Edição direta (malha) ----
// Os corpos feitos/mudados dentro da operação base ficam "congelados": a forma
// exata (BRep do OpenCascade) ou os triângulos vão dentro da operação, sem o
// histórico que os criou (como no Fusion: operação base não é paramétrica).

const paraBase64 = (b: ArrayBufferView) => {
  const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const deBase64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0)).buffer;

function congelar(historico: Operacao[], nomes: string[]): string[] {
  const { corpos, malhas } = construir(historico);
  return nomes.map((n) => {
    const c = corpos.find((x) => x.nome === n);
    if (c) return JSON.stringify({ nome: n, tipo: "solido", dados: c.forma.serialize(), material: c.material, aparencia: c.aparencia });
    const m = malhas.find((x) => x.nome === n);
    if (!m) throw new Error(`${n} não existe`);
    return JSON.stringify({ nome: n, tipo: "malha", dados: paraBase64(m.malha.pos), tri: paraBase64(m.malha.tri), material: m.material, aparencia: m.aparencia });
  });
}

function aplicarOperacaoBase(op: Operacao, estado: Estado) {
  const fora = new Set([...(op.corpos ?? []), ...(op.congelados ?? []).map((c) => c.nome)]);
  estado.corpos = estado.corpos.filter((c) => !fora.has(c.nome));
  estado.malhas = estado.malhas.filter((c) => !fora.has(c.nome));
  (op.congelados ?? []).forEach((c, i) => {
    const id = `${op.id}:${i}`;
    if (c.tipo === "solido") estado.corpos.push({ id, nome: c.nome, forma: deserializeShape(c.dados) as Shape3D, material: c.material, aparencia: c.aparencia });
    else estado.malhas.push({ id, nome: c.nome, malha: { pos: new Float32Array(deBase64(c.dados)), tri: new Uint32Array(deBase64(c.tri ?? "")) }, material: c.material, aparencia: c.aparencia });
    // Os nomes "CorpoN" congelados não podem ser repetidos pelos corpos seguintes.
    const n = Number(/^Corpo(\d+)$/.exec(c.nome)?.[1] ?? 0);
    estado.contador = Math.max(estado.contador, n);
  });
}

// Componente importado: o arquivo vai junto na operação (base64).
function formaImportada(op: Operacao): Shape3D {
  const arq = op.arquivo;
  if (!arq) throw new Error("A operação não tem arquivo");
  const oc = getOC() as unknown as {
    FS: { writeFile(n: string, d: Uint8Array): void; unlink(n: string): void };
    STEPControl_Reader: new () => { ReadFile(n: string): number; TransferRoots(r: unknown): void; OneShape(): unknown };
    StlAPI_Reader: new () => { Read(s: unknown, n: string): boolean };
    TopoDS_Shell: new () => unknown;
    ShapeUpgrade_UnifySameDomain: new (s: unknown, a: boolean, b: boolean, c: boolean) => { Build(): void; Shape(): unknown };
    BRepBuilderAPI_MakeSolid: new () => { Add(s: unknown): void; Solid(): unknown };
    TopoDS: { Shell(s: unknown): unknown };
    Message_ProgressRange: new () => unknown;
  };
  const bytes = Uint8Array.from(atob(arq.base64), (c) => c.charCodeAt(0));
  const nome = `/importado_${op.id.replace(/[^a-z0-9]/gi, "")}`;
  let etapa = "gravar o arquivo";
  oc.FS.writeFile(nome, bytes);
  let forma: Shape3D;
  try {
    if (arq.formato === "step") {
      etapa = "abrir o STEP";
      const leitor = new oc.STEPControl_Reader();
      const st = leitor.ReadFile(nome) as unknown;
      if (String((st as { constructor?: unknown }) && (typeof st === "string" ? st : (st as { value?: unknown }).value ?? st)).includes("Error")) throw new Error("Não foi possível ler o STEP");
      etapa = "converter o STEP";
      leitor.TransferRoots(new oc.Message_ProgressRange());
      etapa = "pegar a forma do STEP";
      forma = cast(leitor.OneShape() as never) as Shape3D;
    } else {
      etapa = "ler o STL";
      const leitor = new oc.StlAPI_Reader();
      const casca = new oc.TopoDS_Shell();
      if (!leitor.Read(casca, nome)) throw new Error("Não foi possível ler o STL");
      // Junta triângulos do mesmo plano e costura as faces num sólido.
      etapa = "montar o sólido do STL";
      const unir = new oc.ShapeUpgrade_UnifySameDomain(casca, true, true, false);
      unir.Build();
      forma = makeSolid(cast(unir.Shape() as never).faces) as unknown as Shape3D;
    }
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error(`Falha ao ${etapa} (${bytes.length} bytes)`);
  } finally {
    oc.FS.unlink(nome);
  }
  // Arquivos de impressora/CAD costumam ter Z para cima: gira para Y para cima.
  if (op.opcoes?.zParaCima !== "nao") forma = forma.rotate(-90, [0, 0, 0], [1, 0, 0]);
  const p = op.params;
  if (p.x || p.y || p.z) forma = forma.translate([p.x ?? 0, p.y ?? 0, p.z ?? 0]);
  return forma;
}


// ---- Substituir por primitivos: cada corpo vira a caixa (ou cilindro em pé) em volta dele ----
function aplicarSubstituirPrimitivos(op: Operacao, corpos: Corpo[]) {
  for (const alvo of corposDaOperacao(op, corpos)) {
    const [mn, mx] = alvo.forma.boundingBox.bounds;
    if (op.opcoes?.forma === "cilindro") {
      const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
      const r = Math.max(mx[0] - mn[0], mx[2] - mn[2]) / 2;
      alvo.forma = makeCylinder(r, mx[1] - mn[1], [cx, mn[1], cz], [0, 1, 0]) as Shape3D;
    } else alvo.forma = makeBox(mn as V3, mx as V3) as Shape3D;
  }
}

// ---- Organizar: arruma os corpos lado a lado na mesa (plano XZ, apoiados em y = 0) ----
// Fileiras (do maior para o menor em profundidade), começando no canto da mesa.
function aplicarOrganizar(op: Operacao, corpos: Corpo[]) {
  const alvos = op.corpos?.length ? corposDaOperacao(op, corpos) : corpos;
  if (!alvos.length) throw new Error("Não há corpos para organizar");
  const L = op.params.largura ?? 256, P = op.params.profundidade ?? 256, esp = op.params.espaco ?? 5;
  // Caixa pela malha (a do OpenCascade é folgada em superfícies curvas e a peça
  // ficaria um pouco acima da mesa).
  const caixas = alvos.map((c) => {
    const v = malhaDe(c.forma).vertices;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) for (let j = 0; j < 3; j++) (mn[j] = Math.min(mn[j], v[i + j])), (mx[j] = Math.max(mx[j], v[i + j]));
    return { c, mn, w: mx[0] - mn[0], d: mx[2] - mn[2] };
  });
  caixas.sort((a, b) => b.d - a.d || b.w - a.w);
  let x = 0, z = 0, alturaFileira = 0;
  const lugar = new Map<Corpo, V3>();
  for (const k of caixas) {
    if (k.w > L || k.d > P) throw new Error(`${k.c.nome} não cabe na mesa (${k.w.toFixed(1)} × ${k.d.toFixed(1)} mm)`);
    if (x > 0 && x + k.w > L) (x = 0), (z += alturaFileira + esp), (alturaFileira = 0);
    if (z + k.d > P) throw new Error("Os corpos não cabem todos na mesa: aumente a mesa ou diminua o espaço");
    // Canto da mesa em (−L/2, −P/2): a mesa fica centrada na origem.
    lugar.set(k.c, [x - L / 2 - k.mn[0], -k.mn[1], z - P / 2 - k.mn[2]]);
    x += k.w + esp;
    alturaFileira = Math.max(alturaFileira, k.d);
  }
  // translate apaga a forma de entrada (que está guardada na memória): por isso a cópia.
  for (const [c, d] of lugar) if (d.some((v) => Math.abs(v) > 1e-9)) c.forma = c.forma.clone().translate(d);
}

// ---- Lista de materiais: uma linha por corpo (JSON) ----
function listaDeMateriais(historico: Operacao[]): string[] {
  const { corpos } = construir(historico);
  const componentes = passos.length ? passos[passos.length - 1].estado.componentes : new Map<string, string[]>();
  return corpos.map((c) => {
    const mat = MATERIAIS[c.material ?? MATERIAL_PADRAO];
    const vol = measureVolume(c.forma);
    const [mn, mx] = c.forma.boundingBox.bounds;
    let comp = "";
    for (const [k, lista] of componentes) if (lista.includes(c.nome)) comp = k;
    return JSON.stringify({
      corpo: c.nome,
      componente: comp,
      material: mat.nome,
      volume: vol,
      massa: (vol * mat.densidade) / 1000,
      tamanho: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]],
    });
  });
}


// ---- Elementos de fixação (métricos ISO) ----
// Medidas: s = sextavado (chave), k = cabeça sextavada, dk/kh = cabeça Allen,
// sa = sextavado interno (Allen), m = altura da porca, arruela d1/d2/h.
const FIXADORES: Record<string, { s: number; k: number; dk: number; kh: number; sa: number; m: number; d1: number; d2: number; h: number }> = {
  M2: { s: 4, k: 1.4, dk: 3.8, kh: 2, sa: 1.5, m: 1.6, d1: 2.2, d2: 5, h: 0.3 },
  "M2.5": { s: 5, k: 1.7, dk: 4.5, kh: 2.5, sa: 2, m: 2, d1: 2.7, d2: 6, h: 0.5 },
  M3: { s: 5.5, k: 2, dk: 5.5, kh: 3, sa: 2.5, m: 2.4, d1: 3.2, d2: 7, h: 0.5 },
  M4: { s: 7, k: 2.8, dk: 7, kh: 4, sa: 3, m: 3.2, d1: 4.3, d2: 9, h: 0.8 },
  M5: { s: 8, k: 3.5, dk: 8.5, kh: 5, sa: 4, m: 4.7, d1: 5.3, d2: 10, h: 1 },
  M6: { s: 10, k: 4, dk: 10, kh: 6, sa: 5, m: 5.2, d1: 6.4, d2: 12, h: 1.6 },
  M8: { s: 13, k: 5.3, dk: 13, kh: 8, sa: 6, m: 6.8, d1: 8.4, d2: 16, h: 1.6 },
  M10: { s: 16, k: 6.4, dk: 16, kh: 10, sa: 8, m: 8.4, d1: 10.5, d2: 20, h: 2 },
  M12: { s: 18, k: 7.5, dk: 18, kh: 12, sa: 10, m: 10.8, d1: 13, d2: 24, h: 2.5 },
};

// Prisma sextavado em pé (eixo Y), "s" entre faces, de y0 até y0 + altura.
function sextavado(s: number, altura: number, base: V3): Shape3D {
  const R = s / Math.sqrt(3); // raio até o canto
  const pts = Array.from({ length: 6 }, (_, i) => [R * Math.cos((i * Math.PI) / 3), R * Math.sin((i * Math.PI) / 3)] as [number, number]);
  let d = draw(pts[0]);
  for (let i = 1; i < 6; i++) d = d.lineTo(pts[i]);
  return (d.close().sketchOnPlane(new Plane(base, [1, 0, 0], [0, 1, 0])) as unknown as { extrude(n: number): Shape3D }).extrude(altura);
}

// Parafuso: ponto (x,y,z) = embaixo da cabeça; corpo desce "comprimento"; cabeça
// sobe. Porca/arruela: (x,y,z) = base, sobem pela espessura. Tudo no eixo Y.
function formaDoFixador(op: Operacao, base: V3): Shape3D {
  const tam = op.opcoes?.tamanho ?? "M6";
  const t = FIXADORES[tam];
  const rosca = ROSCAS_M.find(([m]) => `M${m}` === tam);
  if (!t || !rosca) throw new Error(`Tamanho ${tam} não está na tabela`);
  const d = rosca[0];
  const L = op.params.comprimento ?? 20;
  const tipo = op.opcoes?.tipo ?? "sextavado";
  const em = (dy: number): V3 => [base[0], base[1] + dy, base[2]];
  let forma: Shape3D;
  let faceRosca: (f: Face) => boolean;
  if (tipo === "porca") {
    if (!(t.m > 0)) throw new Error("Tamanho inválido");
    forma = sextavado(t.s, t.m, em(0)).cut(makeCylinder(d / 2, t.m + 2, em(-1), [0, 1, 0]) as Shape3D);
    faceRosca = (f) => f.geomType === "CYLINDRE";
  } else if (tipo === "arruela") {
    return (makeCylinder(t.d2 / 2, t.h, em(0), [0, 1, 0]) as Shape3D).cut(makeCylinder(t.d1 / 2, t.h + 2, em(-1), [0, 1, 0]) as Shape3D);
  } else {
    if (!(L > 0)) throw new Error("O comprimento deve ser maior que zero");
    const corpo = makeCylinder(d / 2, L, em(-L), [0, 1, 0]) as Shape3D;
    const cabeca =
      tipo === "allen"
        ? (makeCylinder(t.dk / 2, t.kh, em(0), [0, 1, 0]) as Shape3D).cut(sextavado(t.sa, t.kh * 0.6, em(t.kh * 0.4 + 0.001)))
        : sextavado(t.s, t.k, em(0));
    forma = corpo.fuse(cabeca);
    // Face da rosca: o cilindro do corpo (raio d/2, abaixo da cabeça).
    faceRosca = (f) => f.geomType === "CYLINDRE" && f.center.y < base[1] - 1e-6;
  }
  if (op.opcoes?.rosca === "sim") {
    const indice = forma.faces.findIndex(faceRosca);
    if (indice >= 0) {
      const temp: Corpo = { id: "fixador", nome: "__fixador", forma };
      aplicarRosca({ ...op, tipo: "rosca", referencias: [{ corpo: "__fixador", tipo: "face", indice }], opcoes: { tamanho: tam, modelada: "sim" } }, [temp]);
      forma = temp.forma;
    }
  }
  return forma;
}

// ---- Mover face ----
// Face plana: o plano dela anda (X/Y/Z e "distância" pela normal) e gira em volta
// do centro da face; as faces vizinhas se esticam ou encolhem até o plano novo
// (como no Fusion, andar "de lado" dentro do próprio plano não muda nada).
// Furo redondo inteiro: o furo é tampado e aberto de novo no lugar novo.

function girarVetor(v: V3, rx: number, ry: number, rz: number): V3 {
  const r = (g: number) => (g * Math.PI) / 180;
  let [x, y, z] = v;
  if (rx) [y, z] = [y * Math.cos(r(rx)) - z * Math.sin(r(rx)), y * Math.sin(r(rx)) + z * Math.cos(r(rx))];
  if (ry) [x, z] = [x * Math.cos(r(ry)) + z * Math.sin(r(ry)), -x * Math.sin(r(ry)) + z * Math.cos(r(ry))];
  if (rz) [x, y] = [x * Math.cos(r(rz)) - y * Math.sin(r(rz)), x * Math.sin(r(rz)) + y * Math.cos(r(rz))];
  return [x, y, z];
}

function aplicarMoverFace(op: Operacao, corpos: Corpo[]) {
  const oc = getOC() as unknown as {
    BRepAdaptor_Surface: new (f: unknown, r: boolean) => {
      FirstUParameter(): number; LastUParameter(): number; FirstVParameter(): number; LastVParameter(): number;
      Value(u: number, v: number): { X(): number; Y(): number; Z(): number };
      Cylinder(): { Radius(): number; Axis(): { Location(): { X(): number; Y(): number; Z(): number }; Direction(): { X(): number; Y(): number; Z(): number } } };
    };
  };
  const p = op.params;
  const desl: V3 = [p.dx ?? 0, p.dy ?? 0, p.dz ?? 0];
  const dist = p.distancia ?? 0;
  const [rx, ry, rz] = [p.rx ?? 0, p.ry ?? 0, p.rz ?? 0];
  if (!dist && !desl.some((v) => v) && !rx && !ry && !rz) throw new Error("Digite quanto a face anda ou gira");
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    const planas = faces.filter((f) => f.geomType === "PLANE");
    const cilindros = faces.filter((f) => f.geomType === "CYLINDRE");
    if (planas.length + cilindros.length < faces.length) throw new Error("Por enquanto só faces planas ou furos redondos");
    // Furos: calcula tudo com a forma de antes.
    const furos = cilindros.map((f) => {
      if (rx || ry || rz) throw new Error("Por enquanto furo redondo só anda (não gira)");
      const ad = new oc.BRepAdaptor_Surface(f.wrapped, true);
      const cil = ad.Cylinder();
      const L = cil.Axis().Location(), D = cil.Axis().Direction();
      const p0: V3 = [L.X(), L.Y(), L.Z()], d: V3 = [D.X(), D.Y(), D.Z()];
      const raio = cil.Radius();
      const v0 = ad.FirstVParameter(), v1 = ad.LastVParameter();
      const q = ad.Value((ad.FirstUParameter() + ad.LastUParameter()) / 2, (v0 + v1) / 2);
      const pq: V3 = [q.X(), q.Y(), q.Z()];
      const n = f.normalAt(pq);
      const t = vdot(vsub(pq, p0), d);
      const rad = vsub(vsub(pq, p0), vmul(d, t));
      if (vdot(rad, [n.x, n.y, n.z]) > 0) throw new Error("Por enquanto só furos andam (este cilindro é por fora da peça)");
      // O furo precisa estar inteiro: as faces do mesmo cilindro somam uma volta.
      const mesmas = corpo.forma.faces.filter((g) => {
        if (g.geomType !== "CYLINDRE") return false;
        const a2 = new oc.BRepAdaptor_Surface(g.wrapped, true);
        const c2 = a2.Cylinder();
        const l2 = c2.Axis().Location(), d2 = c2.Axis().Direction();
        const dd = vsub([l2.X(), l2.Y(), l2.Z()], p0);
        const fora = vsub(dd, vmul(d, vdot(dd, d)));
        return Math.abs(c2.Radius() - raio) < 1e-6 && Math.abs(Math.abs(vdot([d2.X(), d2.Y(), d2.Z()], d)) - 1) < 1e-9 && Math.hypot(...fora) < 1e-6;
      });
      const volta = mesmas.reduce((s, g) => {
        const a2 = new oc.BRepAdaptor_Surface(g.wrapped, true);
        return s + (a2.LastUParameter() - a2.FirstUParameter());
      }, 0);
      if (volta < 2 * Math.PI - 1e-3) throw new Error("O furo precisa ser uma volta inteira de cilindro");
      const inicio = vadd(p0, vmul(d, v0));
      const tampa = makeCylinder(raio, v1 - v0, inicio, d) as Shape3D;
      const novo = makeCylinder(raio, v1 - v0, vadd(vadd(inicio, desl), vmul(d, dist)), d) as Shape3D;
      return { tampa, novo };
    });
    let forma = corpo.forma;
    if (planas.length)
      forma = trocarFacesPorPlanos(
        forma,
        planas.map((f) => {
          const c = f.center, nn = f.normalAt();
          const n: V3 = [nn.x, nn.y, nn.z];
          return { f, P0: vadd(vadd([c.x, c.y, c.z], desl), vmul(n, dist)), m0: girarVetor(n, rx, ry, rz) };
        }),
      );
    for (const h of furos) forma = forma.fuse(h.tampa).cut(h.novo);
    corpo.forma = forma;
  }
}

// ---- Dividir face ----
// Acha as linhas onde a ferramenta cruza cada face escolhida (seção) e usa
// essas linhas para cortar a face em pedaços (Splitter). O corpo continua um
// só, com o mesmo volume; só ganha faces. Ferramenta: plano da origem, plano
// de construção ou todas as curvas de um esboço (estendidas pela normal dele).

function aplicarDividirFace(op: Operacao, corpos: Corpo[], estado: Estado) {
  const oc = getOC() as unknown as {
    BRepAlgoAPI_Section: new (a: unknown, b: unknown, agora: boolean) => { Shape(): unknown; IsDone(): boolean };
    BRepAlgoAPI_Splitter: new () => {
      SetArguments(l: unknown): void;
      SetTools(l: unknown): void;
      Build(r: unknown): void;
      IsDone(): boolean;
      Shape(): unknown;
    };
    NCollection_List_TopoDS_Shape: new () => { Append(s: unknown): void };
    BRepPrimAPI_MakePrism: new (s: unknown, v: unknown, copiar: boolean, canonizar: boolean) => { Shape(): unknown };
    gp_Vec: new (x: number, y: number, z: number) => unknown;
    gp_Pln: new (p: unknown, d: unknown) => unknown;
    gp_Pnt: new (x: number, y: number, z: number) => unknown;
    gp_Dir: new (x: number, y: number, z: number) => unknown;
    Message_ProgressRange: new () => unknown;
  };
  const chave = op.opcoes?.ferramenta ?? "YZ";
  // Ferramentas: um plano (gp_Pln) ou superfícies feitas das curvas do esboço.
  let ferramentas: unknown[];
  if (chave.startsWith("esboco:")) {
    const esboco = estado.esbocos.get(chave.slice(7));
    if (!esboco) throw new Error("O esboço da ferramenta não existe mais");
    const pl = esboco.plano;
    const D = 10000;
    const pos = (id: number) => {
      const p = esboco.pontos.find((q) => q.id === id)!;
      return paraMundo(pl, p.u, p.v);
    };
    ferramentas = esboco.curvas.flatMap((curva) => {
      let aresta: Edge;
      if (curva.tipo === "spline") {
        return arestasDaSpline(esboco, curva).map((ar) => {
          const baixo = ar.translate([-pl.normal[0] * D, -pl.normal[1] * D, -pl.normal[2] * D]);
          return new oc.BRepPrimAPI_MakePrism(baixo.wrapped, new oc.gp_Vec(pl.normal[0] * 2 * D, pl.normal[1] * 2 * D, pl.normal[2] * 2 * D), false, true).Shape();
        });
      }
      if (curva.tipo === "linha") aresta = makeLine(pos(curva.a), pos(curva.b));
      else if (curva.tipo === "elipse") {
        const c3 = pos(curva.centro), a3 = pos(curva.a);
        const eixo: V3 = [a3[0] - c3[0], a3[1] - c3[1], a3[2] - c3[2]];
        const maior = Math.hypot(...eixo);
        const outro = cruzar(pl.normal, eixo).map((v) => v / (maior || 1)) as V3;
        aresta = curva.menor > maior ? makeEllipse(curva.menor, maior, c3, pl.normal, outro) : makeEllipse(maior, curva.menor, c3, pl.normal, eixo);
      } else if (curva.tipo === "circulo") {
        const centro = pos(curva.centro);
        aresta = makeCircle(curva.raio, centro, pl.normal);
      } else {
        const g = geoArco(esboco, curva);
        const m = g.inicio + g.sweep / 2;
        aresta = makeThreePointArc(pos(curva.a), paraMundo(pl, g.centro[0] + g.raio * Math.cos(m), g.centro[1] + g.raio * Math.sin(m)), pos(curva.b));
      }
      const baixo = aresta.translate([-pl.normal[0] * D, -pl.normal[1] * D, -pl.normal[2] * D]);
      return [new oc.BRepPrimAPI_MakePrism(baixo.wrapped, new oc.gp_Vec(pl.normal[0] * 2 * D, pl.normal[1] * 2 * D, pl.normal[2] * 2 * D), false, true).Shape()];
    });
    if (!ferramentas.length) throw new Error("O esboço da ferramenta não tem curvas");
  } else {
    const p = planoDaOpcao(chave, estado.planos);
    if (!p) throw new Error("O plano da ferramenta não existe mais");
    ferramentas = [new oc.gp_Pln(new oc.gp_Pnt(...p.origem), new oc.gp_Dir(...p.normal))];
  }
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    const lista = new oc.NCollection_List_TopoDS_Shape();
    let n = 0;
    for (const f of faces)
      for (const fer of ferramentas) {
        const sec = new oc.BRepAlgoAPI_Section(f.wrapped, fer, true);
        if (!sec.IsDone()) continue;
        for (const e of cast(sec.Shape() as never).edges) {
          lista.Append(e.wrapped);
          n++;
        }
      }
    if (!n) throw new Error("A ferramenta não cruza as faces escolhidas");
    const sp = new oc.BRepAlgoAPI_Splitter();
    const args = new oc.NCollection_List_TopoDS_Shape();
    args.Append(corpo.forma.wrapped);
    sp.SetArguments(args);
    sp.SetTools(lista);
    sp.Build(new oc.Message_ProgressRange());
    if (!sp.IsDone()) throw new Error("Não foi possível dividir a face");
    const res = cast(sp.Shape() as never) as Shape3D;
    const solidos = (res as unknown as { solids: Shape3D[] }).solids;
    corpo.forma = solidos.length === 1 ? solidos[0] : res;
  }
}

// ---- Espessar ----
// Face plana: prisma ao longo da normal (para fora, para dentro ou metade de cada).
// Face curva: casca que tira todas as OUTRAS faces do corpo (espessura da casca
// positiva = para dentro, negativa = para fora).

function formaDoEspessar(op: Operacao, corpos: Corpo[]): Shape3D {
  const t = op.params.espessura ?? 0;
  if (!(t > 0)) throw new Error("A espessura deve ser maior que zero");
  const direcao = op.opcoes?.direcao ?? "fora";
  let resultado: Shape3D | null = null;
  const juntar = (p: Shape3D) => (resultado = resultado ? resultado.fuse(p) : p);
  for (const [corpo, todas] of facesPorCorpo(op, corpos)) {
    // Corpo de superfície: a casca inteira ganha espessura (vira sólido).
    if (!ehSolido(corpo.forma)) {
      juntar(direcao === "dentro" ? espessarSuperficie(corpo.forma, -t) : direcao === "fora" ? espessarSuperficie(corpo.forma, t) : espessarSuperficie(corpo.forma, t / 2).fuse(espessarSuperficie(corpo.forma, -t / 2)));
      continue;
    }
    const planas = todas.filter((f) => f.geomType === "PLANE");
    const faces = todas.filter((f) => f.geomType !== "PLANE");
    for (const f of planas) {
      const n = f.normalAt();
      const [de, ate] = direcao === "dentro" ? [-t, 0] : direcao === "fora" ? [0, t] : [-t / 2, t / 2];
      const base = de ? f.clone().translate([n.x * de, n.y * de, n.z * de]) : f;
      juntar(basicFaceExtrusion(base as Face, new Vector([n.x * (ate - de), n.y * (ate - de), n.z * (ate - de)])));
    }
    if (!faces.length) continue;
    const outras = corpo.forma.faces.filter((f) => !faces.some((e) => e.isSame(f)));
    const casca = (e: number): Shape3D => {
      let s = corpo.forma.shell(e, (f) => f.inList(outras));
      // Às vezes a casca sai "do avesso" (volume negativo): desvira.
      if (measureVolume(s) < 0) s = cast((s.wrapped as unknown as { Reversed(): never }).Reversed()) as Shape3D;
      return s;
    };
    let pedaco: Shape3D;
    try {
      pedaco = direcao === "dentro" ? casca(t) : direcao === "fora" ? casca(-t) : casca(t / 2).fuse(casca(-t / 2));
    } catch {
      throw new Error("Não foi possível espessar a face curva (espessura grande demais?)");
    }
    juntar(pedaco);
  }
  return resultado!;
}

// ---- Aparência e Material físico ----
// Só mudam dados do corpo, não a forma. Corpo que sumiu é ignorado (sem erro),
// porque estas operações não aparecem na linha do tempo.
// Trocar o material faz a aparência voltar a ser a do material (como no Fusion).

function aplicarAparencia(op: Operacao, corpos: Corpo[]) {
  for (const n of op.corpos ?? []) {
    const c = corpos.find((x) => x.nome === n);
    if (!c) continue;
    if (op.tipo === "aparencia") {
      const a = op.opcoes?.aparencia;
      if (a && APARENCIAS[a]) c.aparencia = a;
    } else {
      const m = op.opcoes?.material;
      if (m && MATERIAIS[m]) {
        c.material = m;
        c.aparencia = undefined;
      }
    }
  }
}

// ---- Inclinação (draft) ----
// Inclina as faces escolhidas pelo ângulo dado. O plano escolhido é o plano
// neutro (onde a face não muda) e a normal dele é a direção de "puxar".

function planoDaOpcao(chave: string, planos: Map<string, PlanoEsboco>): PlanoEsboco | undefined {
  return chave.startsWith("op:") ? planos.get(chave.slice(3)) : PLANOS_ORIGEM[chave as "XY" | "XZ" | "YZ"];
}

function aplicarInclinacao(op: Operacao, corpos: Corpo[], planos: Map<string, PlanoEsboco>) {
  const oc = getOC() as unknown as {
    BRepOffsetAPI_DraftAngle: new (s: unknown) => {
      Add(f: unknown, d: unknown, a: number, p: unknown, flag: boolean): void;
      Build(r: unknown): void;
      IsDone(): boolean;
      Shape(): unknown;
    };
    gp_Dir: new (x: number, y: number, z: number) => unknown;
    gp_Pnt: new (x: number, y: number, z: number) => unknown;
    gp_Pln: new (p: unknown, d: unknown) => unknown;
    Message_ProgressRange: new () => unknown;
  };
  const angulo = op.params.angulo ?? 0;
  if (!angulo || Math.abs(angulo) >= 89) throw new Error("O ângulo deve ficar entre 0° e 89°");
  const p = planoDaOpcao(op.opcoes?.plano ?? "XZ", planos);
  if (!p) throw new Error("O plano de referência não existe mais");
  const s = op.opcoes?.inverter === "sim" ? -1 : 1;
  const dir = new oc.gp_Dir(p.normal[0] * s, p.normal[1] * s, p.normal[2] * s);
  const pln = new oc.gp_Pln(new oc.gp_Pnt(...p.origem), dir);
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    const d = new oc.BRepOffsetAPI_DraftAngle(corpo.forma.wrapped);
    try {
      for (const f of faces) {
        if (f.geomType !== "PLANE") throw new Error("Por enquanto só faces planas");
        d.Add(f.wrapped, dir, (angulo * Math.PI) / 180, pln, true);
      }
      d.Build(new oc.Message_ProgressRange());
      if (!d.IsDone()) throw new Error("x");
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Por enquanto")) throw e;
      throw new Error("Não foi possível inclinar (face paralela ao plano? ângulo grande demais?)");
    }
    corpo.forma = cast(d.Shape() as never) as Shape3D;
  }
}

// ---- Escala (uniforme) ----
// ---- Sólido delimitador: caixa (ou cilindro em pé) em volta dos corpos ----
function aplicarDelimitador(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void) {
  const alvos = corposDaOperacao(op, corpos);
  const folga = op.params.folga ?? 0;
  if (folga < 0) throw new Error("A folga não pode ser negativa");
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const c of alvos) {
    const [a, b] = c.forma.boundingBox.bounds;
    for (let i = 0; i < 3; i++) (mn[i] = Math.min(mn[i], a[i] - folga)), (mx[i] = Math.max(mx[i], b[i] + folga));
  }
  if (op.opcoes?.forma === "cilindro") {
    // Cilindro em pé (eixo Y) que contém a caixa: raio = meia diagonal em XZ.
    const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
    const r = Math.hypot(mx[0] - mn[0], mx[2] - mn[2]) / 2;
    criar(makeCylinder(r, mx[1] - mn[1], [cx, mn[1], cz], [0, 1, 0]) as Shape3D);
  } else criar(makeBox(mn as V3, mx as V3) as Shape3D);
}

function aplicarEscala(op: Operacao, corpos: Corpo[], criar: (f: Shape3D) => void) {
  const fator = op.params.fator ?? 1;
  if (!(fator > 0)) throw new Error("O fator de escala deve ser maior que zero");
  for (const alvo of corposDaOperacao(op, corpos)) {
    const [mn, mx] = alvo.forma.boundingBox.bounds;
    const pivo: V3 = op.opcoes?.pivo === "origem" ? [0, 0, 0] : [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const nova = alvo.forma.clone().scale(fator, pivo); // scale apaga a forma de entrada: por isso a cópia
    if (op.opcoes?.copiar === "sim") criar(nova);
    else alvo.forma = nova;
  }
}

// ---- Dividir corpo por um plano ----
// O corpo vira dois: o lado de cá fica com o nome antigo, o outro vira corpo novo.

function aplicarDividir(op: Operacao, corpos: Corpo[], planos: Map<string, PlanoEsboco>, criar: (f: Shape3D) => void) {
  const p = planoDaOpcao(op.opcoes?.plano ?? "YZ", planos);
  if (!p) throw new Error("O plano de corte não existe mais");
  const plano = new Plane(p.origem, p.eixoX, p.normal);
  for (const alvo of corposDaOperacao(op, corpos)) {
    const lado1 = alvo.forma.clone().cutPlane(plano, 0, "positive");
    const lado2 = alvo.forma.clone().cutPlane(plano, 0, "negative");
    if (!lado1 || !lado2 || measureVolume(lado1 as Shape3D) < 1e-9 || measureVolume(lado2 as Shape3D) < 1e-9)
      throw new Error(`O plano não atravessa ${alvo.nome}`);
    alvo.forma = lado1 as Shape3D;
    criar(lado2 as Shape3D);
  }
}

// ---- Rosca (métrica ISO, passo grosso) ----
// Modelada: corta um sulco em V (60°) em hélice na face cilíndrica.
// Externa (haste) ou interna (furo) é descoberto pela direção da face.


function aplicarRosca(op: Operacao, corpos: Corpo[]) {
  const oc = getOC() as unknown as {
    BRepAdaptor_Surface: new (f: unknown, r: boolean) => {
      FirstUParameter(): number; LastUParameter(): number; FirstVParameter(): number; LastVParameter(): number;
      Value(u: number, v: number): { X(): number; Y(): number; Z(): number };
      Cylinder(): { Radius(): number; Axis(): { Location(): { X(): number; Y(): number; Z(): number }; Direction(): { X(): number; Y(): number; Z(): number } } };
    };
  };
  const refs = op.referencias ?? [];
  if (!refs.length) throw new Error("Escolha a face cilíndrica");
  if (op.opcoes?.modelada === "nao") return; // rosca só de enfeite: não muda a forma
  for (const r of refs) {
    const corpo = corpos.find((c) => c.nome === r.corpo);
    const face = corpo?.forma.faces[r.indice];
    if (!corpo || !face) throw new Error("A face escolhida não existe mais");
    if (face.geomType !== "CYLINDRE") throw new Error("A rosca precisa de uma face cilíndrica");
    const ad = new oc.BRepAdaptor_Surface(face.wrapped, true);
    const cil = ad.Cylinder();
    const L = cil.Axis().Location(), D = cil.Axis().Direction();
    const p0: V3 = [L.X(), L.Y(), L.Z()], d: V3 = [D.X(), D.Y(), D.Z()];
    const raio = cil.Radius();
    const v0 = ad.FirstVParameter(), v1 = ad.LastVParameter();
    // Externa se a normal da face aponta para fora do eixo.
    const q = ad.Value((ad.FirstUParameter() + ad.LastUParameter()) / 2, (v0 + v1) / 2);
    const pq: V3 = [q.X(), q.Y(), q.Z()];
    const n = face.normalAt(pq);
    const t = (pq[0] - p0[0]) * d[0] + (pq[1] - p0[1]) * d[1] + (pq[2] - p0[2]) * d[2];
    const rad: V3 = [0, 1, 2].map((i) => pq[i] - p0[i] - d[i] * t) as V3;
    const externa = rad[0] * n.x + rad[1] * n.y + rad[2] * n.z > 0;
    // Tamanho: o pedido, ou o mais perto do diâmetro (furo: diâmetro da broca = D − passo).
    let tamanho = ROSCAS_M.find(([m]) => `M${m}` === op.opcoes?.tamanho);
    if (!tamanho) {
      const alvo = 2 * raio;
      tamanho = [...ROSCAS_M].sort((a, b) => Math.abs((externa ? a[0] : a[0] - a[1]) - alvo) - Math.abs((externa ? b[0] : b[0] - b[1]) - alvo))[0];
    }
    const passo = tamanho[1];
    const altura = v1 - v0;
    const inicio: V3 = [0, 1, 2].map((i) => p0[i] + d[i] * v0) as V3;
    const helice = makeHelix(passo, altura, raio, inicio, d, op.opcoes?.mao === "esquerda");
    const s = helice.startPoint;
    const sp: V3 = [s.x, s.y, s.z];
    const ts = (sp[0] - inicio[0]) * d[0] + (sp[1] - inicio[1]) * d[1] + (sp[2] - inicio[2]) * d[2];
    const u0: V3 = [0, 1, 2].map((i) => sp[i] - inicio[i] - d[i] * ts) as V3;
    const nu = Math.hypot(...u0);
    const u: V3 = [u0[0] / nu, u0[1] / nu, u0[2] / nu];
    // Triângulo de 60° no plano (raio, eixo); a ponta entra no material.
    const prof = externa ? 0.6134 * passo : 0.5413 * passo;
    const folga = 0.3 * passo;
    const meia = (prof + folga) * Math.tan(Math.PI / 6);
    const pt = (du: number, dv: number): V3 => [0, 1, 2].map((i) => sp[i] + u[i] * du + d[i] * dv) as V3;
    const tri = externa
      ? makePolygon([pt(folga, -meia), pt(folga, meia), pt(-prof, 0)])
      : makePolygon([pt(-folga, -meia), pt(-folga, meia), pt(prof, 0)]);
    let sulco: Shape3D;
    try {
      sulco = genericSweep(tri.outerWire(), helice, { frenet: true }, false);
    } catch {
      throw new Error("Não foi possível fazer a rosca nessa face");
    }
    corpo.forma = corpo.forma.cut(sulco);
  }
}

// ---- Bobina (coil) ----
// Hélice em pé (eixo Y) e uma seção no plano que contém o eixo, levada pela
// hélice. "Posição": a seção fica no diâmetro, dentro ou fora dele.

function formaDaBobina(op: Operacao, base: V3): Shape3D {
  const { diametro: D, voltas, altura, secaoTamanho: s } = op.params;
  if (!(D > 0 && voltas > 0 && altura > 0 && s > 0)) throw new Error("Medidas devem ser maiores que zero");
  const passo = altura / voltas;
  const secao = op.opcoes?.secao ?? "circulo";
  // "s" é o tamanho da seção na direção do eixo: precisa caber num passo.
  if (s >= passo) throw new Error(`A seção (${s} mm) encosta na volta seguinte: o passo é ${passo.toFixed(2)} mm`);
  const pos = op.opcoes?.posicao ?? "centro";
  const h = secao === "triangulo" ? (s * Math.sqrt(3)) / 2 : s; // largura na direção do raio
  // Raio da hélice = onde fica o "centro" da seção (para o triângulo, o meio da base até a ponta).
  const raio = pos === "dentro" ? D / 2 - h / 2 : pos === "fora" ? D / 2 + h / 2 : D / 2;
  if (raio - h / 2 <= 0) throw new Error("A seção não cabe dentro do diâmetro");
  const helice = makeHelix(passo, altura, raio, base, [0, 1, 0], op.opcoes?.sentido === "esquerda");
  const sp = helice.startPoint;
  const ini: V3 = [sp.x, sp.y, sp.z];
  const r0 = Math.hypot(ini[0] - base[0], ini[2] - base[2]);
  const u: V3 = [(ini[0] - base[0]) / r0, 0, (ini[2] - base[2]) / r0]; // para fora (raio)
  const pt = (du: number, dv: number): V3 => [ini[0] + u[0] * du, ini[1] + dv, ini[2] + u[2] * du];
  let fio: Wire;
  if (secao === "circulo") {
    const normal: V3 = [-u[2], 0, u[0]]; // tangente ao giro: o círculo fica no plano do eixo
    fio = assembleWire([makeCircle(s / 2, ini, normal)]);
  } else if (secao === "quadrado") {
    fio = makePolygon([pt(-s / 2, -s / 2), pt(s / 2, -s / 2), pt(s / 2, s / 2), pt(-s / 2, s / 2)]).outerWire();
  } else {
    // Base virada para o eixo, ponta para fora.
    fio = makePolygon([pt(-h / 2, -s / 2), pt(h / 2, 0), pt(-h / 2, s / 2)]).outerWire();
  }
  try {
    return genericSweep(fio, helice, { frenet: true }, false) as Shape3D;
  } catch {
    throw new Error("Não foi possível fazer a bobina com essas medidas");
  }
}

// ---- Furo ----
// A ferramenta é o "meio corte" do furo girado em volta do eixo: serve para furo
// simples, com rebaixo ou escareado, com ponta de broca (118°) ou plana.

const cruzar = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function ferramentaDoFuro(op: Operacao, ponto: V3, normal: V3): Shape3D {
  const p = op.params, o = op.opcoes ?? {};
  const r = (p.diametro ?? 0) / 2;
  if (!(r > 0)) throw new Error("O diâmetro deve ser maior que zero");
  const atraves = o.extensao === "atraves";
  const prof = atraves ? 10000 : (p.profundidade ?? 0);
  if (!(prof > 0)) throw new Error("A profundidade deve ser maior que zero");
  const e = 0.01; // começa um pouquinho fora da face, para cortar limpo
  const pts: [number, number][] = [[0, -e]];
  if (o.tipo === "rebaixo") {
    const R = (p.diametroRebaixo ?? 0) / 2, pr = p.profundidadeRebaixo ?? 0;
    if (!(R > r && pr > 0 && pr < prof)) throw new Error("Rebaixo: diâmetro maior que o furo e profundidade menor");
    pts.push([R, -e], [R, pr], [r, pr]);
  } else if (o.tipo === "escareado") {
    const R = (p.diametroEscareado ?? 0) / 2;
    if (!(R > r)) throw new Error("Escareado: diâmetro maior que o furo");
    pts.push([R, -e], [R, 0], [r, R - r]); // cone de 90°
  } else pts.push([r, -e]);
  pts.push([r, prof]);
  if (!atraves && o.ponta !== "plana") pts.push([0, prof + r / Math.tan((59 * Math.PI) / 180)]);
  else pts.push([0, prof]);
  // Plano que contém o eixo: x = raio, y = profundidade (para dentro da peça).
  const d: V3 = [-normal[0], -normal[1], -normal[2]];
  const ref: V3 = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = cruzar(cruzar(d, ref), d);
  const nx = Math.hypot(...x);
  const eixoX: V3 = [x[0] / nx, x[1] / nx, x[2] / nx];
  const plano = new Plane(ponto, eixoX, cruzar(eixoX, d));
  let caneta = draw(pts[0]);
  for (const q of pts.slice(1)) caneta = caneta.lineTo(q);
  return (caneta.close().sketchOnPlane(plano) as unknown as EsbocoNoPlano).revolve(d, { origin: ponto, angle: 360 });
}

function aplicarFuro(op: Operacao, corpos: Corpo[]) {
  if (!op.furos?.length) throw new Error("Clique numa face para pôr o furo");
  let algum = false;
  for (const f of op.furos) {
    const ferramenta = ferramentaDoFuro(op, f.ponto, f.normal);
    for (const c of corpos.filter((x) => tocam(x.forma, ferramenta))) {
      c.forma = c.forma.cut(ferramenta);
      algum = true;
    }
  }
  if (!algum) throw new Error("O furo não toca em nenhum corpo");
}

// ---- Casca e Pressionar/puxar: usam faces escolhidas ----

function facesPorCorpo(op: Operacao, corpos: Corpo[]): Map<Corpo, Face[]> {
  const mapa = new Map<Corpo, Face[]>();
  for (const r of op.referencias ?? []) {
    if (r.tipo !== "face") continue;
    const corpo = corpos.find((c) => c.nome === r.corpo);
    if (!corpo) throw new Error(`${r.corpo} não existe mais`);
    const face = corpo.forma.faces[r.indice];
    if (!face) throw new Error("Uma face escolhida não existe mais");
    mapa.set(corpo, [...(mapa.get(corpo) ?? []), face]);
  }
  if (mapa.size === 0) throw new Error("Nenhuma face escolhida");
  return mapa;
}

function aplicarCasca(op: Operacao, corpos: Corpo[]) {
  const e = op.params.espessura;
  if (!(e > 0)) throw new Error("A espessura deve ser maior que zero");
  // opcoes.direcao: "dentro" (padrão: o tamanho de fora não muda) ou "fora".
  const fora = op.opcoes?.direcao === "fora";
  // Sem face escolhida (só corpos): casca fechada, oca por dentro (como no Fusion).
  if (!(op.referencias ?? []).some((r) => r.tipo === "face")) {
    if (!op.corpos?.length) throw new Error("Nenhuma face escolhida");
    for (const corpo of corposDaOperacao(op, corpos)) {
      try {
        const desloc = makeOffset(corpo.forma as unknown as Parameters<typeof makeOffset>[0], fora ? e : -e);
        corpo.forma = fora ? desloc.cut(corpo.forma) : corpo.forma.cut(desloc);
      } catch {
        throw new Error("Não foi possível fazer a casca fechada (espessura grande demais?)");
      }
    }
    return;
  }
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    try {
      // Espessura positiva = parede para dentro (o tamanho de fora não muda).
      corpo.forma = corpo.forma.shell(fora ? -e : e, (f) => f.inList(faces));
    } catch {
      throw new Error("Não foi possível fazer a casca (espessura grande demais?)");
    }
  }
}

function aplicarPressionar(op: Operacao, corpos: Corpo[]) {
  const d = op.params.distancia;
  if (!d) throw new Error("A distância não pode ser zero");
  for (const [corpo, faces] of facesPorCorpo(op, corpos)) {
    // Faz todos os prismas antes de mudar o corpo (as faces são do corpo original).
    const prismas = faces.map((f) => {
      if (f.geomType !== "PLANE") throw new Error("Por enquanto só faces planas");
      const n = f.normalAt();
      return basicFaceExtrusion(f, new Vector([n.x * d, n.y * d, n.z * d]));
    });
    let forma = corpo.forma;
    for (const p of prismas) forma = d > 0 ? forma.fuse(p) : forma.cut(p);
    corpo.forma = forma;
  }
}

// Forma da ferramenta de cada operação. Coordenadas com Y para cima, como na tela.
function formaDa(op: Operacao): Shape3D {
  const { x = 0, y = 0, z = 0 } = op.params;
  switch (op.tipo) {
    case "caixa": {
      const { comprimento: c, largura: l, altura: a } = op.params;
      if (!(c > 0 && l > 0 && a > 0)) throw new Error("Medidas devem ser maiores que zero");
      return makeBox([x - c / 2, y, z - l / 2], [x + c / 2, y + a, z + l / 2]);
    }
    case "cilindro": {
      const { diametro: d, altura: a } = op.params;
      if (!(d > 0 && a > 0)) throw new Error("Medidas devem ser maiores que zero");
      return makeCylinder(d / 2, a, [x, y, z], [0, 1, 0]);
    }
    case "esfera": {
      const { diametro: d } = op.params;
      if (!(d > 0)) throw new Error("Diâmetro deve ser maior que zero");
      return makeSphere(d / 2).translate([x, y, z]);
    }
    case "bobina":
      return formaDaBobina(op, [x, y, z]);
    case "fixador":
      return formaDoFixador(op, [x, y, z]);
    case "toroide": {
      // Círculo do tubo no plano XY, a "raio" do eixo Y, girado em volta do eixo Y.
      const { diametro: D, diametroSecao: d } = op.params;
      if (!(D > 0 && d > 0)) throw new Error("Medidas devem ser maiores que zero");
      if (d >= D) throw new Error("O tubo precisa ser mais fino que o diâmetro do toroide");
      return (drawCircle(d / 2).translate(D / 2, 0).sketchOnPlane("XY") as unknown as { revolve(e: V3): Shape3D })
        .revolve([0, 1, 0])
        .translate([x, y, z]);
    }
    default:
      throw new Error(`"${op.tipo}" não cria forma nova`);
  }
}

interface Corpo {
  id: string;
  nome: string;
  forma: Shape3D;
  material?: string; // sem valor = Aço (padrão)
  aparencia?: string; // sem valor = a do material
  origem?: string; // id da operação que criou o corpo (usado pela pilha de fixadores)
}

function tocam(a: Shape3D, b: Shape3D): boolean {
  return !a.boundingBox.isOut(b.boundingBox);
}

// ---- Recálculo com memória ----
// Cada passo do histórico guarda o resultado (corpos e esboços) junto com uma
// "impressão digital" da operação e de tudo que veio antes. Na próxima vez,
// começa do primeiro passo cuja impressão mudou: o resto é reaproveitado.
// (Funciona porque as formas antigas continuam válidas: cortar/unir/arredondar
// criam forma nova, e mover/girar/espelhar trabalham sempre numa cópia.)

// Corpo de malha: só triângulos (aba MALHA).
interface CorpoMalha {
  id: string;
  nome: string;
  malha: Malha;
  grupo?: Uint32Array; // grupo de faces de cada triângulo (Gerar grupos de faces)
  quad?: { malha: Malha; par: Int32Array }; // Converter em malha quadrilateral (vale só para esta malha)
  material?: string;
  aparencia?: string;
}

interface Estado {
  corpos: Corpo[];
  malhas: CorpoMalha[];
  esbocos: Map<string, DadosEsboco>;
  planos: Map<string, PlanoEsboco>; // planos de construção (para Dividir corpo)
  eixos: Map<string, { origem: V3; direcao: V3 }>; // eixos de construção
  componentes: Map<string, string[]>; // componente → nomes dos corpos
  origens: Map<string, { ref: Referencia; d: V3 }>; // Origem da junta (id da operação) → face/aresta + deslocamento
  erros: Record<string, string>;
  contador: number;
}

interface Passo {
  chave: string;
  estado: Estado;
}

let passos: Passo[] = [];

// Impressão digital rápida de um texto (cyrb53).
function impressao(texto: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Cópia do estado: a lista e os corpos são novos (as operações trocam corpo.forma).
const copiar = (e: Estado): Estado => ({
  corpos: e.corpos.map((c) => ({ ...c })),
  malhas: e.malhas.map((c) => ({ ...c })),
  esbocos: new Map(e.esbocos),
  planos: new Map(e.planos),
  eixos: new Map(e.eixos),
  componentes: new Map(e.componentes),
  origens: new Map(e.origens),
  erros: { ...e.erros },
  contador: e.contador,
});

export const estatisticas = { reaproveitados: 0, refeitos: 0 };

// Refaz o histórico (do ponto que mudou) e devolve as formas de cada corpo.
function construir(historico: Operacao[]) {
  const chaves: string[] = [];
  let anterior = "";
  for (const op of historico) chaves.push((anterior = impressao(anterior + JSON.stringify(op))));
  let k = 0;
  while (k < passos.length && k < historico.length && passos[k].chave === chaves[k]) k++;
  const estado: Estado = k
    ? copiar(passos[k - 1].estado)
    : { corpos: [], malhas: [], esbocos: new Map(), planos: new Map(), eixos: new Map(), componentes: new Map(), origens: new Map(), erros: {}, contador: 0 };
  const novos: Passo[] = passos.slice(0, k);
  estatisticas.reaproveitados = k;
  estatisticas.refeitos = historico.length - k;
  for (let i = k; i < historico.length; i++) {
    const op = historico[i];
    if (!op.suprimida) {
      try {
        aplicarOperacao(op, estado);
      } catch (e) {
        estado.erros[op.id] = e instanceof Error ? e.message : String(e);
      }
    }
    novos.push({ chave: chaves[i], estado: copiar(estado) });
  }
  passos = novos;
  return { corpos: estado.corpos, erros: estado.erros, malhas: estado.malhas };
}

function aplicarOperacao(op: Operacao, estado: Estado) {
  const { corpos, esbocos } = estado;
  const criar = (forma: Shape3D) => {
    estado.contador += 1;
    corpos.push({ id: `c${estado.contador}`, nome: `Corpo${estado.contador}`, forma, origem: op.id });
  };
  if (op.tipo === "rosca") {
    aplicarRosca(op, corpos);
    return;
  }
  if (op.tipo === "mover") {
    aplicarMover(op, corpos, criar);
    return;
  }
  if (op.tipo === "plano") {
    // Plano de construção: não muda os corpos, só fica guardado (Dividir corpo usa).
    const p = planoDeslocado(op);
    if (p) estado.planos.set(op.id, p);
    return;
  }
  if (op.tipo === "aparencia" || op.tipo === "material") {
    aplicarAparencia(op, [...corpos, ...estado.malhas] as unknown as Corpo[]);
    return;
  }
  if (op.tipo.startsWith("malha")) {
    aplicarMalha(op, estado);
    return;
  }
  if (op.tipo === "parametros") return; // os números já chegam calculados
  if (op.tipo === "tela" || op.tipo === "anotacao") return; // só aparecem na tela
  if (op.tipo === "substituirPrimitivo") {
    aplicarSubstituirPrimitivos(op, corpos);
    return;
  }
  if (op.tipo === "organizar") {
    aplicarOrganizar(op, corpos);
    return;
  }
  if (op.tipo === "componente") {
    aplicarComponente(op, corpos, estado.componentes);
    return;
  }
  if (op.tipo === "junta") {
    aplicarJunta(op, corpos, estado.componentes, estado.origens);
    return;
  }
  if (op.tipo === "origemJunta") {
    const ref = op.referencias?.[0];
    const c = ref && corpos.find((x) => x.nome === ref.corpo);
    if (!ref || !c) throw new Error("Escolha uma face ou aresta de um corpo");
    origemDeJunta(c.forma, ref); // confere se a face/aresta ainda existe
    estado.origens.set(op.id, { ref, d: [op.params.dx ?? 0, op.params.dy ?? 0, op.params.dz ?? 0] });
    return;
  }
  if (op.tipo === "duplicarJuntas") {
    aplicarDuplicar(op, corpos, estado.componentes);
    return;
  }
  if (op.tipo === "contatos" || op.tipo === "posicao") return; // só a tela usa
  if (op.tipo === "operacaoBase") {
    aplicarOperacaoBase(op, estado);
    return;
  }
  if (op.tipo === "altoRelevo") {
    aplicarAltoRelevo(op, corpos, esbocos);
    return;
  }
  if (op.tipo === "deslocarFace") {
    aplicarDeslocarFace(op, corpos);
    return;
  }
  if (op.tipo === "removerFaces") {
    aplicarRemoverFaces(op, corpos);
    return;
  }
  if (op.tipo === "alinhar") {
    aplicarAlinhar(op, corpos);
    return;
  }
  if (op.tipo === "moverFace") {
    aplicarMoverFace(op, corpos);
    return;
  }
  if (op.tipo === "substituirFace") {
    aplicarSubstituirFace(op, corpos, estado);
    return;
  }
  if (op.tipo === "dividirFace") {
    aplicarDividirFace(op, corpos, estado);
    return;
  }
  if (op.tipo === "inclinacao") {
    aplicarInclinacao(op, corpos, estado.planos);
    return;
  }
  if (op.tipo === "eixo") {
    if (!op.eixoConstrucao) throw new Error("Eixo sem posição");
    estado.eixos.set(op.id, op.eixoConstrucao);
    return;
  }
  if (op.tipo === "ponto") return; // ponto de construção: só desenho e referência
  if (op.tipo === "remover") {
    for (const c of corposDaOperacao(op, corpos)) corpos.splice(corpos.indexOf(c), 1);
    return;
  }
  if (op.tipo === "delimitador") {
    aplicarDelimitador(op, corpos, criar);
    return;
  }
  if (op.tipo === "volumeFluido") {
    aplicarVolumeFluido(op, corpos, criar);
    return;
  }
  if (op.tipo === "padraoGeometrico") {
    aplicarPadraoGeometrico(op, corpos, criar, esbocos);
    return;
  }
  if (op.tipo === "removerRecursos") {
    aplicarRemoverRecursos(op, corpos);
    return;
  }
  if (op.tipo === "escala") {
    aplicarEscala(op, corpos, criar);
    return;
  }
  if (op.tipo === "dividir") {
    aplicarDividir(op, corpos, estado.planos, criar);
    return;
  }
  if (op.tipo === "corteEncaixes") {
    aplicarCorteEncaixes(op, corpos, estado.planos, criar);
    return;
  }
  if (op.tipo === "furo") {
    aplicarFuro(op, corpos);
    return;
  }
  if (op.tipo === "espelhar") {
    aplicarEspelhar(op, corpos, criar);
    return;
  }
  if (op.tipo === "padraoRetangular") {
    aplicarPadraoRetangular(op, corpos, criar);
    return;
  }
  if (op.tipo === "padraoCircular") {
    aplicarPadraoCircular(op, corpos, criar, estado.eixos);
    return;
  }
  if (op.tipo === "padraoCaminho") {
    aplicarPadraoCaminho(op, corpos, esbocos, criar);
    return;
  }
  if (op.tipo === "combinar") {
    aplicarCombinar(op, corpos);
    return;
  }
  if (op.tipo === "arredondamento" || op.tipo === "chanfro") {
    aplicarNasArestas(op, corpos);
    return;
  }
  if (op.tipo === "casca") {
    aplicarCasca(op, corpos);
    return;
  }
  if (op.tipo === "pressionar") {
    aplicarPressionar(op, corpos);
    return;
  }
  if (op.tipo === "esboco") {
    if (op.esboco) esbocos.set(op.id, op.esboco);
    return;
  }
  if (op.tipo.startsWith("superficie")) {
    aplicarSuperficie(op, estado, criar);
    return;
  }
  if (op.opcoes?.superficie === "sim") {
    // Extrusão/Transição/primitiva como superfície: sempre corpo novo.
    criar(
      op.tipo === "extrusao"
        ? formaDaSuperficieExtrusao(op, esbocos)
        : op.tipo === "transicao"
          ? formaDaSuperficieTransicao(op, esbocos)
          : op.tipo === "tubulacao"
            ? tuboDeSuperficie(op, esbocos)
            : cascaDe(formaDa(op)),
    );
    return;
  }
  const ferramenta =
    op.tipo === "extrusao"
      ? formaDaExtrusao(op, esbocos, corpos)
      : op.tipo === "revolucao"
        ? formaDaRevolucao(op, esbocos, estado.eixos)
        : op.tipo === "varredura"
          ? formaDaVarredura(op, esbocos)
          : op.tipo === "transicao"
            ? formaDaTransicao(op, esbocos)
            : op.tipo === "tubulacao"
              ? formaDaTubulacao(op, esbocos)
              : op.tipo === "importado"
                ? formaImportada(op)
            : op.tipo === "nervura" || op.tipo === "teia"
              ? formaDaNervura(op, esbocos, corpos)
              : op.tipo === "espessar"
                ? formaDoEspessar(op, corpos)
                : formaDa(op);
  const alvos = corpos.filter((c) => tocam(c.forma, ferramenta));
  if (op.modo === "novo" || (op.modo === "unir" && alvos.length === 0)) {
    estado.contador += 1;
    corpos.push({ id: `${op.id}:${estado.contador}`, nome: `Corpo${estado.contador}`, forma: ferramenta, origem: op.id });
  } else if (op.modo === "unir") {
    // Junta a ferramenta e todos os corpos que ela toca no primeiro deles.
    let unido = alvos[0].forma.fuse(ferramenta);
    for (const outro of alvos.slice(1)) {
      unido = unido.fuse(outro.forma);
      corpos.splice(corpos.indexOf(outro), 1);
    }
    alvos[0].forma = unido;
  } else if (alvos.length === 0) {
    throw new Error("A ferramenta não toca em nenhum corpo");
  } else {
    for (const alvo of alvos) {
      alvo.forma =
        op.modo === "cortar" ? alvo.forma.cut(ferramenta) : alvo.forma.intersect(ferramenta);
    }
  }
}

// ---- Malhas: o corpo que não mudou reaproveita a malha já feita ----

interface MalhaGuardada {
  vertices: Float32Array;
  normais: Float32Array;
  triangulos: Uint32Array;
  arestas: Float32Array;
  gruposFaces: Uint32Array;
  gruposArestas: Uint32Array;
}
let malhasGuardadas = new Map<Shape3D, MalhaGuardada>();

function malhaDe(forma: Shape3D): MalhaGuardada {
  const ja = malhasGuardadas.get(forma);
  if (ja) return ja;
  const m = forma.mesh({ tolerance: 0.05, angularTolerance: 0.2 });
  const a = forma.meshEdges({ tolerance: 0.05, angularTolerance: 0.2 });
  const nova: MalhaGuardada = {
    vertices: new Float32Array(m.vertices),
    normais: new Float32Array(m.normals),
    triangulos: new Uint32Array(m.triangles),
    arestas: new Float32Array(a.lines),
    // A posição no grupo é o número da face/aresta (mesma ordem de forma.faces/edges).
    gruposFaces: new Uint32Array(m.faceGroups.flatMap((g) => [g.start, g.count])),
    gruposArestas: new Uint32Array(a.edgeGroups.flatMap((g) => [g.start, g.count])),
  };
  malhasGuardadas.set(forma, nova);
  return nova;
}


// ---- Corpos de superfície (aba SUPERFÍCIE) ----
// Superfície = faces sem volume (casca aberta ou fechada). Extrusão e Transição
// de superfície, primitivas como superfície, Costurar (vira sólido se fechar),
// Remendo (tapa bordas abertas ou faz face plana de um esboço), Aparar (corta
// por um plano), Estender (aumenta a face) e Espessura (em formaDoEspessar).

type OCSuperficie = {
  TopExp_Explorer: new (s: unknown, achar: unknown, evitar: unknown) => { More(): boolean; Current(): unknown; Next(): void; delete(): void };
  TopAbs_ShapeEnum: Record<string, unknown>;
  BRepBuilderAPI_Sewing: new (tol: number, a: boolean, b: boolean, c: boolean, d: boolean) => {
    Add(s: unknown): void;
    Perform(r: unknown): void;
    SewedShape(): unknown;
    NbFreeEdges(): number;
    FreeEdge(i: number): unknown;
  };
  BRepPrimAPI_MakePrism: new (s: unknown, v: unknown, copiar: boolean, canonizar: boolean) => { Shape(): unknown };
  BRepOffsetAPI_ThruSections: new (solido: boolean, regrada: boolean, tol: number) => { AddWire(w: unknown): void; Build(r: unknown): void; Shape(): unknown; IsDone(): boolean };
  BRepOffsetAPI_MakeFilling: new () => { Add(e: unknown, ordem: unknown, limite: boolean): number; Build(r: unknown): void; IsDone(): boolean; Shape(): unknown };
  BRepOffsetAPI_MakeThickSolid: new () => { MakeThickSolidBySimple(s: unknown, d: number): void; Build(r: unknown): void; Shape(): unknown; IsDone(): boolean };
  BRepLib: { ExtendFace(f: unknown, d: number, umin: boolean, umax: boolean, vmin: boolean, vmax: boolean, saida: unknown): void };
  TopoDS_Face: new () => unknown;
  GeomAbs_Shape: Record<string, unknown>;
  Message_ProgressRange: new () => unknown;
  gp_Vec: new (x: number, y: number, z: number) => unknown;
};
const ocSup = () => getOC() as unknown as OCSuperficie;

function temTipo(f: Shape3D, tipo: string): boolean {
  const oc = ocSup();
  const ex = new oc.TopExp_Explorer(f.wrapped, oc.TopAbs_ShapeEnum[tipo], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const r = ex.More();
  ex.delete();
  return r;
}
const ehSolido = (f: Shape3D) => temTipo(f, "TopAbs_SOLID");

// Junta faces/cascas pelas arestas em comum (tolerância em mm).
function costurarFormas(formas: unknown[], tol = 1e-3): { forma: Shape3D; livres: unknown[] } {
  const oc = ocSup();
  const s = new oc.BRepBuilderAPI_Sewing(tol, true, true, true, false);
  for (const f of formas) s.Add(f);
  s.Perform(new oc.Message_ProgressRange());
  const livres = Array.from({ length: s.NbFreeEdges() }, (_, i) => s.FreeEdge(i + 1));
  return { forma: cast(s.SewedShape() as never) as Shape3D, livres };
}

// Casca fechada → sólido (desvira se o volume sair negativo).
function solidoDaCasca(forma: Shape3D): Shape3D {
  let s = makeSolid(forma.faces) as unknown as Shape3D;
  if (measureVolume(s) < 0) s = cast((s.wrapped as unknown as { Reversed(): never }).Reversed()) as Shape3D;
  return s;
}

// Sólido → só as faces (corpo de superfície fechado, como as primitivas de superfície do Fusion).
function cascaDe(forma: Shape3D): Shape3D {
  return costurarFormas(forma.faces.map((f) => f.wrapped)).forma;
}

// Todas as curvas do esboço como arestas 3D.
function arestasDoEsboco(esboco: DadosEsboco): Edge[] {
  const pl = esboco.plano;
  const pos = (id: number) => {
    const p = esboco.pontos.find((q) => q.id === id)!;
    return paraMundo(pl, p.u, p.v);
  };
  return esboco.curvas.flatMap((curva): Edge[] => {
    if (curva.tipo === "spline") return arestasDaSpline(esboco, curva);
    if (curva.tipo === "linha") return [makeLine(pos(curva.a), pos(curva.b))];
    if (curva.tipo === "circulo") return [makeCircle(curva.raio, pos(curva.centro), pl.normal)];
    if (curva.tipo === "elipse") {
      const c3 = pos(curva.centro), a3 = pos(curva.a);
      const eixo: V3 = [a3[0] - c3[0], a3[1] - c3[1], a3[2] - c3[2]];
      const maior = Math.hypot(...eixo);
      const outro = cruzar(pl.normal, eixo).map((v) => v / (maior || 1)) as V3;
      return [curva.menor > maior ? makeEllipse(curva.menor, maior, c3, pl.normal, outro) : makeEllipse(maior, curva.menor, c3, pl.normal, eixo)];
    }
    const g = geoArco(esboco, curva);
    const m = g.inicio + g.sweep / 2;
    return [makeThreePointArc(pos(curva.a), paraMundo(pl, g.centro[0] + g.raio * Math.cos(m), g.centro[1] + g.raio * Math.sin(m)), pos(curva.b))];
  });
}

// Extrusão de superfície: cada curva do esboço vira uma parede (sem tampas).
function formaDaSuperficieExtrusao(op: Operacao, esbocos: Map<string, DadosEsboco>): Shape3D {
  const esboco = op.perfis && esbocos.get(op.perfis.esboco);
  if (!esboco) throw new Error("Escolha o esboço");
  const d = op.params.distancia ?? 10;
  if (!d) throw new Error("A distância não pode ser zero");
  const n = esboco.plano.normal;
  const simetrico = op.opcoes?.lado === "simetrico";
  const ini = simetrico ? -Math.abs(d) / 2 : 0;
  const total = simetrico ? Math.abs(d) : d;
  const oc = ocSup();
  const faces = arestasDoEsboco(esboco).map((ar) => {
    const base = ini ? ar.translate([n[0] * ini, n[1] * ini, n[2] * ini]) : ar;
    return new oc.BRepPrimAPI_MakePrism(base.wrapped, new oc.gp_Vec(n[0] * total, n[1] * total, n[2] * total), false, true).Shape();
  });
  if (!faces.length) throw new Error("O esboço não tem curvas");
  return costurarFormas(faces).forma;
}

// Fio de um esboço: o contorno do 1º perfil fechado, ou as curvas em sequência.
function fioDoEsboco(esboco: DadosEsboco): Wire {
  const perfil = perfis(esboco)[0];
  if (perfil) {
    const { origem, eixoX, normal } = esboco.plano;
    return (desenhoDoLaco(perfil.externo).sketchOnPlane(new Plane(origem, eixoX, normal)) as unknown as { wire: Wire }).wire;
  }
  try {
    return assembleWire(arestasDoEsboco(esboco));
  } catch {
    throw new Error("As curvas do esboço precisam formar uma linha contínua");
  }
}

function formaDaSuperficieTransicao(op: Operacao, esbocos: Map<string, DadosEsboco>): Shape3D {
  const secoes = op.secoes ?? [];
  if (secoes.length < 2) throw new Error("Escolha pelo menos 2 esboços");
  const oc = ocSup();
  const ts = new oc.BRepOffsetAPI_ThruSections(false, op.opcoes?.regrada === "sim", 1e-6);
  for (const s of secoes) {
    const esboco = esbocos.get(s.esboco);
    if (!esboco) throw new Error("Um esboço escolhido não existe mais");
    ts.AddWire(fioDoEsboco(esboco).wrapped);
  }
  ts.Build(new oc.Message_ProgressRange());
  if (!ts.IsDone()) throw new Error("Não foi possível fazer a transição entre esses esboços");
  return cast(ts.Shape() as never) as Shape3D;
}

// Arestas soltas viram laços (pontas que se encostam ficam no mesmo laço).
function lacosDeArestas(arestas: Edge[]): Edge[][] {
  const grupos: Edge[][] = [];
  const perto = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-3;
  for (const e of arestas) {
    const ligados = grupos.filter((g) => g.some((o) => [o.startPoint, o.endPoint].some((p) => perto(p, e.startPoint) || perto(p, e.endPoint))));
    const novo = [e, ...ligados.flat()];
    for (const g of ligados) grupos.splice(grupos.indexOf(g), 1);
    grupos.push(novo);
  }
  return grupos;
}

function aplicarSuperficie(op: Operacao, estado: Estado, criar: (f: Shape3D) => void) {
  const oc = ocSup();
  const { corpos } = estado;
  if (op.tipo === "superficieCosturar") {
    const alvos = corposDaOperacao(op, corpos);
    const { forma, livres } = costurarFormas(alvos.flatMap((c) => c.forma.faces.map((f) => f.wrapped)));
    let resultado = forma;
    if (op.opcoes?.solido !== "nao") {
      if (livres.length) throw new Error(`As superfícies não fecham um volume (${livres.length} aresta(s) aberta(s))`);
      resultado = solidoDaCasca(forma);
    }
    alvos[0].forma = resultado;
    for (const c of alvos.slice(1)) corpos.splice(corpos.indexOf(c), 1);
    return;
  }
  if (op.tipo === "superficieRemendo") {
    const fonte = op.opcoes?.fonte ?? "bordas";
    if (fonte.startsWith("esb:")) {
      // Face plana de cada perfil fechado do esboço.
      const esboco = estado.esbocos.get(fonte.slice(4));
      if (!esboco) throw new Error("O esboço não existe mais");
      const lista = perfis(esboco);
      if (!lista.length) throw new Error("O esboço não tem perfil fechado");
      const { origem, eixoX, normal } = esboco.plano;
      for (const p of lista) {
        let d = desenhoDoLaco(p.externo);
        for (const f of p.furos) d = d.cut(desenhoDoLaco(f));
        criar((d.sketchOnPlane(new Plane(origem, eixoX, normal)) as unknown as { face(): Shape3D }).face());
      }
      return;
    }
    for (const alvo of corposDaOperacao(op, corpos)) {
      const { livres } = costurarFormas(alvo.forma.faces.map((f) => f.wrapped));
      if (!livres.length) throw new Error(`${alvo.nome} não tem bordas abertas`);
      const tampas = lacosDeArestas(livres.map((e) => cast(e as never) as Edge)).map((laco) => {
        const f = new oc.BRepOffsetAPI_MakeFilling();
        for (const e of laco) f.Add(e.wrapped, oc.GeomAbs_Shape.GeomAbs_C0, true);
        f.Build(new oc.Message_ProgressRange());
        if (!f.IsDone()) throw new Error("Não foi possível tapar a borda");
        return f.Shape();
      });
      const { forma, livres: sobra } = costurarFormas([...alvo.forma.faces.map((f) => f.wrapped), ...tampas]);
      alvo.forma = !sobra.length && op.opcoes?.solido !== "nao" ? solidoDaCasca(forma) : forma;
    }
    return;
  }
  if (op.tipo === "superficieAparar") {
    const p = planoDaOpcao(op.opcoes?.plano ?? "XZ", estado.planos);
    if (!p) throw new Error("O plano não existe mais");
    const d = op.params.deslocamento ?? 0;
    const o = p.origem.map((v, k) => v + p.normal[k] * d) as V3;
    // Tira o lado que sai com um bloco enorme (o cutPlane do replicad só aceita sólido).
    const sai = op.opcoes?.lado === "negativo" ? 1 : -1;
    const y = cruzar(p.normal, p.eixoX);
    for (const alvo of corposDaOperacao(op, corpos)) {
      const [mn, mx] = alvo.forma.boundingBox.bounds;
      const L = 4 * (Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + Math.hypot(...(o.map((v, k) => v - (mn[k] + mx[k]) / 2) as V3))) + 10;
      const canto = (a: number, b: number): V3 => [0, 1, 2].map((k) => o[k] + a * L * p.eixoX[k] + b * L * y[k]) as V3;
      const base = makePolygon([canto(-1, -1), canto(1, -1), canto(1, 1), canto(-1, 1)]);
      const bloco = basicFaceExtrusion(base as Face, new Vector([p.normal[0] * sai * L, p.normal[1] * sai * L, p.normal[2] * sai * L]));
      const r = alvo.forma.cut(bloco);
      if (!r.faces.length) throw new Error(`O plano não deixa nada de ${alvo.nome} desse lado`);
      alvo.forma = r;
    }
    return;
  }
  if (op.tipo === "superficieEstender") {
    const dist = op.params.distancia ?? 5;
    if (!(dist > 0)) throw new Error("A distância deve ser maior que zero");
    const dir = op.opcoes?.direcao ?? "todas";
    const [u, v] = [dir !== "v", dir !== "u"];
    for (const alvo of corposDaOperacao(op, corpos)) {
      if (ehSolido(alvo.forma)) throw new Error(`${alvo.nome} é sólido: Estender é para superfícies`);
      if (alvo.forma.faces.length !== 1) throw new Error(`Estender, por enquanto, só em superfície de uma face (${alvo.nome} tem ${alvo.forma.faces.length})`);
      const saida = new oc.TopoDS_Face();
      oc.BRepLib.ExtendFace(alvo.forma.faces[0].wrapped, dist, u, u, v, v, saida);
      alvo.forma = cast(saida as never) as Shape3D;
    }
  }
}

// Espessura de um corpo de superfície (casca → sólido).
function espessarSuperficie(forma: Shape3D, t: number): Shape3D {
  const oc = ocSup();
  const m = new oc.BRepOffsetAPI_MakeThickSolid();
  m.MakeThickSolidBySimple(forma.wrapped, t);
  m.Build(new oc.Message_ProgressRange());
  if (!m.IsDone()) throw new Error("Não foi possível dar espessura a essa superfície");
  let s = cast(m.Shape() as never) as Shape3D;
  if (measureVolume(s) < 0) s = cast((s.wrapped as unknown as { Reversed(): never }).Reversed()) as Shape3D;
  return s;
}

// ---- Corpos de malha ----

// Malha vinda de arquivo STL/OBJ: escala da unidade, Z para cima → Y para cima, posição.
function malhaImportada(op: Operacao): Malha {
  const arq = op.arquivo;
  if (!arq) throw new Error("A operação não tem arquivo");
  const bytes = Uint8Array.from(atob(arq.base64), (c) => c.charCodeAt(0));
  const m = arq.formato === "obj" ? lerOBJ(new TextDecoder().decode(bytes)) : lerSTL(bytes);
  const k = op.params.escala || 1;
  const zCima = op.opcoes?.zParaCima !== "nao";
  const p = op.params;
  return transformarMalha(m, ([x, y, z]) => {
    const [a, b, c] = zCima ? [x, z, -y] : [x, y, z];
    return [a * k + (p.x ?? 0), b * k + (p.y ?? 0), c * k + (p.z ?? 0)];
  });
}

// Sólido feito dos triângulos (cada triângulo vira face; os do mesmo plano se juntam).
function solidoDaMalha(m: Malha): Shape3D {
  const oc = getOC() as unknown as {
    FS: { writeFile(n: string, d: Uint8Array): void; unlink(n: string): void };
    StlAPI_Reader: new () => { Read(s: unknown, n: string): boolean };
    TopoDS_Shell: new () => unknown;
    ShapeUpgrade_UnifySameDomain: new (s: unknown, a: boolean, b: boolean, c: boolean) => { Build(): void; Shape(): unknown };
  };
  const nome = "/malha_converter.stl";
  oc.FS.writeFile(nome, stlBinario([m]));
  try {
    const leitor = new oc.StlAPI_Reader();
    const casca = new oc.TopoDS_Shell();
    if (!leitor.Read(casca, nome)) throw new Error("Não foi possível converter a malha");
    const unir = new oc.ShapeUpgrade_UnifySameDomain(casca, true, true, false);
    unir.Build();
    const forma = makeSolid(cast(unir.Shape() as never).faces) as unknown as Shape3D;
    if (!(measureVolume(forma) > 0)) throw new Error("A malha não fecha um volume (use Reparar antes)");
    return forma;
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Não foi possível converter a malha (use Reparar antes)");
  } finally {
    oc.FS.unlink(nome);
  }
}

function malhaDoSolido(forma: Shape3D, tolerancia: number): Malha {
  const m = forma.mesh({ tolerance: tolerancia, angularTolerance: 0.2 });
  // Cada face vem com seus pontos: solda as costuras para a malha ficar fechada.
  return soldarMalha({ pos: new Float32Array(m.vertices), tri: new Uint32Array(m.triangles) }, 1e-5);
}

// Junta as faces de um passo do Fusion ao corpo de mesmo nome (cria na 1ª vez),
// com um grupo de faces novo. Troca malha e grupo por novos: cada passo guarda cópia rasa.
function juntarPassoFusion(f: { corpo: string; pos: string; tri: string }, estado: Estado) {
  const bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
  const pos = new Float32Array(bytes(f.pos)); // já vem com Y para cima, como no Fusion
  const tri = new Uint32Array(bytes(f.tri));
  const c = estado.malhas.find((m) => m.nome === f.corpo);
  if (!c) {
    estado.contador += 1;
    estado.malhas.push({ id: `c${estado.contador}`, nome: f.corpo, malha: { pos, tri }, grupo: new Uint32Array(tri.length / 3) });
    return;
  }
  const base = c.malha.pos.length / 3, nt = c.malha.tri.length / 3;
  const juntaP = new Float32Array(c.malha.pos.length + pos.length);
  juntaP.set(c.malha.pos);
  juntaP.set(pos, c.malha.pos.length);
  const juntaT = new Uint32Array(c.malha.tri.length + tri.length);
  juntaT.set(c.malha.tri);
  juntaT.set(tri.map((k) => k + base), c.malha.tri.length);
  const grupo = new Uint32Array(juntaT.length / 3);
  let novo = 1;
  if (c.grupo) for (const g of c.grupo) if (g >= novo) novo = g + 1;
  if (c.grupo) grupo.set(c.grupo);
  grupo.fill(novo, nt);
  c.malha = { pos: juntaP, tri: juntaT };
  c.grupo = grupo;
}

function aplicarMalha(op: Operacao, estado: Estado) {
  const nova = (malha: Malha, base?: { material?: string; aparencia?: string }) => {
    estado.contador += 1;
    estado.malhas.push({ id: `c${estado.contador}`, nome: `Corpo${estado.contador}`, malha, material: base?.material, aparencia: base?.aparencia });
  };
  if (op.tipo === "malhaInserir") return nova(malhaImportada(op));
  // Passo do Fusion: junta as faces dele ao corpo como um grupo de faces novo
  // (passar o mouse destaca o pedaço que essa operação fez).
  if (op.tipo === "malhaFusion") {
    for (const f of op.fusion ?? []) juntarPassoFusion(f, estado);
    return;
  }
  // Apagar e preencher / Combinar grupos: os grupos de faces vêm nas referências.
  if (op.tipo === "malhaApagar" || op.tipo === "malhaCombinarGrupos") {
    const porCorpo = new Map<string, Set<number>>();
    for (const r of op.referencias ?? []) if (r.tipo === "face") porCorpo.set(r.corpo, (porCorpo.get(r.corpo) ?? new Set()).add(r.indice));
    if (!porCorpo.size) throw new Error("Escolha grupos de faces da malha");
    for (const [nome, grupos] of porCorpo) {
      const c = estado.malhas.find((x) => x.nome === nome);
      if (!c) throw new Error(`${nome} não é uma malha`);
      if (!c.grupo) throw new Error("Gere os grupos de faces antes (Gerar grupos de faces)");
      const g = c.grupo;
      if (op.tipo === "malhaCombinarGrupos") {
        if (grupos.size < 2) throw new Error("Escolha dois grupos ou mais");
        const alvo = Math.min(...grupos);
        // Junta e renumera sem buracos (0, 1, 2...).
        const novos = Array.from(g, (x) => (grupos.has(x) ? alvo : x));
        const ids = [...new Set(novos)].sort((a, b) => a - b);
        const mapa = new Map(ids.map((x, i) => [x, i]));
        c.grupo = Uint32Array.from(novos, (x) => mapa.get(x)!);
      } else {
        const tri: number[] = [];
        for (let t = 0; t < c.malha.tri.length / 3; t++) if (!grupos.has(g[t])) tri.push(c.malha.tri[t * 3], c.malha.tri[t * 3 + 1], c.malha.tri[t * 3 + 2]);
        if (!tri.length) throw new Error("Isso apagaria a malha inteira");
        c.malha = repararMalha(compactar(c.malha.pos, tri)).malha; // reparar tapa o buraco
        c.grupo = undefined;
      }
    }
    return;
  }
  const nomes = op.corpos ?? [];
  if (!nomes.length) throw new Error("Nenhum corpo escolhido");
  if (op.tipo === "malhaTesselar") {
    // Sólido → malha (o sólido continua lá, como no Fusion).
    for (const n of nomes) {
      const c = estado.corpos.find((x) => x.nome === n);
      if (!c) throw new Error(`${n} não é um sólido`);
      nova(malhaDoSolido(c.forma, op.params.tolerancia || 0.05), c);
    }
    return;
  }
  const achar = (n: string) => {
    const i = estado.malhas.findIndex((c) => c.nome === n);
    if (i < 0) throw new Error(estado.corpos.some((c) => c.nome === n) ? `${n} é um sólido, não uma malha` : `${n} não existe mais`);
    return i;
  };
  if (op.tipo === "malhaCombinar") {
    // O 1º fica com todos os triângulos; os outros somem.
    const lista = nomes.map((n) => estado.malhas[achar(n)]);
    if (lista.length < 2) throw new Error("Escolha duas ou mais malhas");
    const pos: number[] = [], tri: number[] = [];
    for (const c of lista) {
      const base = pos.length / 3;
      pos.push(...c.malha.pos);
      for (const i of c.malha.tri) tri.push(i + base);
    }
    lista[0].malha = { pos: new Float32Array(pos), tri: new Uint32Array(tri) };
    estado.malhas = estado.malhas.filter((c) => !lista.slice(1).includes(c));
    return;
  }
  if (op.tipo === "malhaRemover") {
    const fora = new Set(nomes.map((n) => estado.malhas[achar(n)]));
    estado.malhas = estado.malhas.filter((c) => !fora.has(c));
    return;
  }
  if (op.tipo === "malhaAlinhar") {
    // 1º = a malha que anda; 2º = o alvo (malha ou sólido).
    if (nomes.length < 2) throw new Error("Escolha a malha que anda e depois o alvo");
    const c = estado.malhas[achar(nomes[0])];
    const alvoMalha = estado.malhas.find((x) => x.nome === nomes[1])?.malha;
    const alvoSolido = estado.corpos.find((x) => x.nome === nomes[1]);
    const alvo = alvoMalha ?? (alvoSolido ? malhaDoSolido(alvoSolido.forma, 0.05) : null);
    if (!alvo) throw new Error(`${nomes[1]} não existe`);
    if (op.opcoes?.metodo === "centro") {
      const [a0, a1] = caixaMalha(c.malha), [b0, b1] = caixaMalha(alvo);
      const d = [0, 1, 2].map((k) => (b0[k] + b1[k]) / 2 - (a0[k] + a1[k]) / 2);
      c.malha = transformarMalha(c.malha, (p) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]]);
    } else {
      // Pontos do alvo: vértices + centro de cada triângulo (alvo mais denso).
      const extra: number[] = Array.from(alvo.pos);
      for (let t = 0; t < alvo.tri.length; t += 3)
        for (let k = 0; k < 3; k++) extra.push((alvo.pos[alvo.tri[t] * 3 + k] + alvo.pos[alvo.tri[t + 1] * 3 + k] + alvo.pos[alvo.tri[t + 2] * 3 + k]) / 3);
      c.malha = alinharMalha(c.malha, extra, Math.max(5, Math.min(200, Math.round(op.params.passadas ?? 60)))).malha;
    }
    c.grupo = undefined;
    return;
  }
  if (op.tipo === "malhaPonte") {
    // Uma malha com 2 bordas, ou duas malhas (a 2ª entra na 1ª antes da ponte).
    const lista = nomes.map((n) => estado.malhas[achar(n)]);
    const c = lista[0];
    if (lista.length > 1) {
      const pos: number[] = Array.from(c.malha.pos), tri: number[] = Array.from(c.malha.tri);
      for (const o of lista.slice(1)) {
        const base = pos.length / 3;
        pos.push(...o.malha.pos);
        for (const i of o.malha.tri) tri.push(i + base);
      }
      c.malha = { pos: new Float32Array(pos), tri: new Uint32Array(tri) };
      estado.malhas = estado.malhas.filter((x) => !lista.slice(1).includes(x));
    }
    c.malha = ponteMalha(soldarMalha(c.malha));
    c.grupo = undefined;
    return;
  }
  for (const n of nomes) {
    const i = achar(n);
    const c = estado.malhas[i];
    // Mudou a malha: os grupos de faces antigos não valem mais.
    const trocar = (malha: Malha) => ((c.malha = malha), (c.grupo = undefined));
    if (op.tipo === "malhaReduzir") trocar(reduzirMalha(c.malha, Math.min(1, Math.max(0.01, (op.params.proporcao ?? 50) / 100))));
    else if (op.tipo === "malhaSuavizar") trocar(suavizarMalha(c.malha, Math.max(1, Math.min(100, Math.round(op.params.iteracoes ?? 5)))));
    else if (op.tipo === "malhaReparar") trocar(repararMalha(c.malha).malha);
    else if (op.tipo === "malhaInverter") trocar(inverterMalha(c.malha));
    else if (op.tipo === "malhaEscala") {
      const f = [op.params.fatorX ?? 1, op.params.fatorY ?? 1, op.params.fatorZ ?? 1];
      if (!f.every((x) => x > 0 && x <= 1000)) throw new Error("Os fatores devem ser maiores que zero");
      const [mn, mx] = caixaMalha(c.malha);
      const pivo = op.opcoes?.pivo === "origem" ? [0, 0, 0] : [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2);
      trocar(transformarMalha(c.malha, (p) => [0, 1, 2].map((k) => pivo[k] + (p[k] - pivo[k]) * f[k]) as V3));
    } else if (op.tipo === "malhaCasca") {
      const t = op.params.espessura ?? 0;
      if (!(t > 0)) throw new Error("A espessura deve ser maior que zero");
      trocar(cascaMalha(c.malha, t));
    } else if (op.tipo === "malhaFronteira") trocar(suavizarFronteira(c.malha, Math.max(1, Math.min(100, Math.round(op.params.iteracoes ?? 5)))));
    else if (op.tipo === "malhaAtrair") {
      const p = planoDaOpcao(op.opcoes?.plano ?? "XZ", estado.planos);
      if (!p) throw new Error("O plano de referência não existe mais");
      const d = op.params.deslocamento ?? 0;
      const lim = op.params.distancia ?? 1;
      if (!(lim > 0)) throw new Error("A distância deve ser maior que zero");
      const r = atrairMalha(c.malha, p.origem.map((v, k) => v + p.normal[k] * d) as V3, p.normal, lim);
      if (!r.movidos) throw new Error("Nenhum ponto está perto do plano (aumente a distância)");
      trocar(r.malha);
    } else if (op.tipo === "malhaQuad") {
      const r = quadsDaMalha(c.malha, op.params.angulo ?? 30);
      if (!r.quads) throw new Error("Nenhum par de triângulos virou quadrilátero");
      c.quad = { malha: c.malha, par: r.par };
    } else if (op.tipo === "malhaGrupoNovo") {
      const eixos: Record<string, V3> = { "+X": [1, 0, 0], "-X": [-1, 0, 0], "+Y": [0, 1, 0], "-Y": [0, -1, 0], "+Z": [0, 0, 1], "-Z": [0, 0, -1] };
      c.grupo = grupoPorDirecao(c.malha, c.grupo, eixos[op.opcoes?.direcao ?? "+Y"] ?? [0, 1, 0], op.params.angulo ?? 20).grupo;
    } else if (op.tipo === "malhaGrupos") {
      const r = gruposDeFaces(c.malha, op.params.angulo ?? 20);
      c.malha = r.malha;
      c.grupo = r.grupo;
    }
    else if (op.tipo === "malhaCorte") {
      const p = planoDaOpcao(op.opcoes?.plano ?? "XZ", estado.planos);
      if (!p) throw new Error("O plano de corte não existe mais");
      const d = op.params.deslocamento ?? 0;
      const origem = p.origem.map((v, k) => v + p.normal[k] * d) as V3;
      trocar(cortarMalha(c.malha, origem, p.normal, op.opcoes?.lado !== "negativo", op.opcoes?.tampar !== "nao"));
    } else if (op.tipo === "malhaSeparar") {
      const partes = separarMalha(c.malha);
      trocar(partes[0]);
      for (const m of partes.slice(1)) nova(m, c);
    } else if (op.tipo === "malhaConverter") {
      estado.malhas.splice(i, 1);
      estado.corpos.push({ id: c.id, nome: c.nome, forma: solidoDaMalha(c.malha), material: c.material, aparencia: c.aparencia });
    }
  }
}

// [início, quantidade] (em posições do índice, 3 por triângulo) de cada grupo seguido.
function gruposEmOrdem(gs: number[]): Uint32Array {
  const pares: number[] = [];
  let ini = 0;
  for (let i = 1; i <= gs.length; i++)
    if (i === gs.length || gs[i] !== gs[i - 1]) {
      pares.push(ini * 3, (i - ini) * 3);
      ini = i;
    }
  return new Uint32Array(pares);
}

// Malha quadrilateral: linhas de todas as arestas, menos as diagonais dos pares
// (assim a tela mostra os quadriláteros). Sem quads: nenhuma linha.
function arestasQuad(c: CorpoMalha): Float32Array {
  if (!c.quad || c.quad.malha !== c.malha) return new Float32Array(0);
  const { pos, tri } = c.malha, par = c.quad.par, nv = pos.length / 3;
  const vistas = new Set<number>(), saida: number[] = [];
  for (let t = 0; t < tri.length / 3; t++)
    for (let k = 0; k < 3; k++) {
      const a = tri[t * 3 + k], b = tri[t * 3 + ((k + 1) % 3)];
      const ch = Math.min(a, b) * nv + Math.max(a, b);
      if (vistas.has(ch)) continue;
      vistas.add(ch);
      const p = par[t];
      if (p >= 0 && [0, 1, 2].some((j) => tri[p * 3 + j] === a) && [0, 1, 2].some((j) => tri[p * 3 + j] === b)) continue; // diagonal
      saida.push(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2], pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]);
    }
  return new Float32Array(saida);
}

// Malha para a tela: cada triângulo com seus 3 pontos (fica facetado, como no Fusion).
function malhaParaTela(c: CorpoMalha): MalhaCorpo {
  const { pos, tri } = c.malha;
  const n = tri.length / 3;
  // Com grupos de faces: triângulos em ordem de grupo, um "face" por grupo.
  const g = c.grupo;
  const ordem = Array.from({ length: n }, (_, i) => i);
  if (g) ordem.sort((a, b) => g[a] - g[b]);
  const vertices = new Float32Array(n * 9), normais = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const o = ordem[t];
    const q = [0, 1, 2].map((k) => [pos[tri[o * 3 + k] * 3], pos[tri[o * 3 + k] * 3 + 1], pos[tri[o * 3 + k] * 3 + 2]]);
    const u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], w = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const L = Math.hypot(nn[0], nn[1], nn[2]) || 1;
    for (let k = 0; k < 3; k++) {
      vertices.set(q[k], t * 9 + k * 3);
      normais.set([nn[0] / L, nn[1] / L, nn[2] / L], t * 9 + k * 3);
    }
  }
  return {
    id: c.id,
    nome: c.nome,
    aparencia: aparenciaDoCorpo(c),
    material: c.material ?? MATERIAL_PADRAO,
    vertices,
    normais,
    triangulos: Uint32Array.from({ length: n * 3 }, (_, i) => i),
    arestas: arestasQuad(c),
    gruposFaces: g ? gruposEmOrdem(ordem.map((o) => g[o])) : new Uint32Array([0, n * 3]),
    gruposArestas: new Uint32Array(0),
    ehMalha: true,
  };
}

function recalcular(historico: Operacao[]) {
  const { corpos, erros, malhas: corposMalha } = construir(historico);
  const usadas = new Map<Shape3D, MalhaGuardada>();
  const malhas: MalhaCorpo[] = corpos.map((c) => {
    const g = malhaDe(c.forma);
    usadas.set(c.forma, g);
    // Manda cópias: as originais ficam guardadas aqui para a próxima vez.
    return {
      id: c.id,
      nome: c.nome,
      aparencia: aparenciaDoCorpo(c),
      material: c.material ?? MATERIAL_PADRAO,
      vertices: g.vertices.slice(),
      normais: g.normais.slice(),
      triangulos: g.triangulos.slice(),
      arestas: g.arestas.slice(),
      gruposFaces: g.gruposFaces.slice(),
      gruposArestas: g.gruposArestas.slice(),
      ehSuperficie: !ehSolido(c.forma),
    };
  });
  malhasGuardadas = usadas; // só guarda as malhas dos corpos de agora
  for (const c of corposMalha) malhas.push(malhaParaTela(c));
  return { malhas, erros };
}

// Qualidade da malha do STL: quanto menor a tolerância, mais triângulos.
const QUALIDADE_STL = {
  baixa: { tolerance: 0.2, angularTolerance: 0.5 },
  media: { tolerance: 0.05, angularTolerance: 0.2 },
  alta: { tolerance: 0.01, angularTolerance: 0.1 },
};

// O replicad lê a cor como "linear" e grava no STEP convertida para sRGB.
// Desfazendo isso antes, o arquivo sai com a mesma cor da tela.
function corParaStep(hex: string): string {
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const canal = (i: number) => Math.round(linear(parseInt(hex.slice(i, i + 2), 16) / 255) * 255).toString(16).padStart(2, "0");
  return `#${canal(1)}${canal(3)}${canal(5)}`;
}

// Gira o sólido para a maior face plana ficar virada para baixo (−Y aqui, que
// vira −Z na impressora).
function deitarNaMaiorFace(forma: Shape3D): Shape3D {
  let melhor: { area: number; n: V3 } | null = null;
  for (const f of forma.faces) {
    if (f.geomType !== "PLANE") continue;
    const area = measureArea(f);
    const q = f.normalAt();
    if (!melhor || area > melhor.area + 1e-6) melhor = { area, n: [q.x, q.y, q.z] };
  }
  if (!melhor) return forma;
  const alvo: V3 = [0, -1, 0];
  const cos = Math.max(-1, Math.min(1, vdot(vunit(melhor.n), alvo)));
  if (cos > 1 - 1e-9) return forma;
  let eixo = cruzar(melhor.n, alvo);
  if (Math.hypot(...eixo) < 1e-9) eixo = [1, 0, 0];
  return forma.clone().rotate((Math.acos(cos) * 180) / Math.PI, [0, 0, 0], vunit(eixo));
}

// Reparte as peças (já apoiadas em z = 0) nas mesas do Bambu Studio: fileiras,
// da mais funda para a mais rasa, 10 mm entre peças; gira 90° a peça que só cabe
// assim; abre mesa nova quando a peça não cabe na atual. Cada grupo vai para o
// meio da área do bico, e a mesa N fica deslocada como o Bambu Studio espera
// (colunas = arredondar para cima √total; passo 1,2 × cama; fileiras para −Y).
// shortcut: fileiras simples, não o melhor encaixe possível; trocar por arranjo 2D se sobrar muito espaço.
function distribuirNasMesas<T extends { nome: string; malha: Malha }>(objetos: T[], mesa: NonNullable<OpcoesExportar["mesa"]>) {
  const [x0, y0, x1, y1] = mesa.area;
  const L = x1 - x0, P = y1 - y0, esp = 10;
  const f1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const fora: string[] = [];
  const pecas = objetos.map((o) => {
    let m = o.malha;
    let [a, b] = caixaMalha(m);
    const cabe = (w: number, d: number) => w <= L + 1e-6 && d <= P + 1e-6;
    if (!cabe(b[0] - a[0], b[1] - a[1]) && cabe(b[1] - a[1], b[0] - a[0])) {
      m = transformarMalha(m, ([x, y, z]) => [-y, x, z]);
      [a, b] = caixaMalha(m);
    }
    const w = b[0] - a[0], d = b[1] - a[1], h = b[2] - a[2];
    if (!cabe(w, d) || h > mesa.altura + 1e-6) fora.push(`${o.nome} (${f1(w)} × ${f1(d)} × ${f1(h)} mm)`);
    return { o, m, a, w, d };
  });
  // Fileiras em cada mesa; guarda o canto de cada peça dentro da mesa.
  const lugares: { mesa: number; x: number; y: number }[] = [];
  const grupos: { w: number; d: number }[] = [];
  let x = 0, y = 0, fundo = 0;
  const ordem = pecas.map((_, i) => i).sort((i, j) => pecas[j].d - pecas[i].d || pecas[j].w - pecas[i].w);
  for (const i of ordem) {
    const k = pecas[i];
    if (grupos.length && x > 0 && x + k.w > L) (x = 0), (y += fundo + esp), (fundo = 0);
    if (!grupos.length || (y > 0 && y + k.d > P)) grupos.push({ w: 0, d: 0 }), (x = 0), (y = 0), (fundo = 0);
    const g = grupos.length - 1;
    lugares[i] = { mesa: g, x, y };
    grupos[g].w = Math.max(grupos[g].w, x + k.w);
    grupos[g].d = Math.max(grupos[g].d, y + k.d);
    x += k.w + esp;
    fundo = Math.max(fundo, k.d);
  }
  const colunas = Math.ceil(Math.sqrt(grupos.length));
  const [cw, cd] = mesa.cama ?? [x1, y1];
  const prontos = pecas.map((k, i) => {
    const { mesa: g, x, y } = lugares[i];
    const ox = (g % colunas) * cw * 1.2, oy = -Math.floor(g / colunas) * cd * 1.2;
    // Grupo no meio da área do bico.
    const dx = ox + x0 + (L - grupos[g].w) / 2 + x - k.a[0], dy = oy + y0 + (P - grupos[g].d) / 2 + y - k.a[1];
    return { ...k.o, malha: transformarMalha(k.m, ([px, py, pz]) => [px + dx, py + dy, pz]), mesa: g + 1 };
  });
  return { prontos, mesas: grupos.length, fora };
}

async function exportar(p: Extract<PedidoNucleo, { tipo: "exportar" }>): Promise<{ dados: ArrayBuffer; aviso?: string }> {
  const { corpos: todos, malhas } = construir(p.historico);
  const corpos = p.formato === "3mf" && p.deitar ? todos.map((c) => ({ ...c, forma: deitarNaMaiorFace(c.forma) })) : todos;
  const escolhidos = corpos.filter((c) => p.corpos.includes(c.nome));
  const malhasEscolhidas = malhas.filter((c) => p.corpos.includes(c.nome));
  if (p.formato === "3mf") {
    // Um objeto por corpo, com nome e cor; o conjunto vai para o meio da mesa
    // (256 × 256, Bambu A1/P1/X1) e apoiado em z = 0.
    const q = QUALIDADE_STL[p.qualidade];
    const objetos = [
      ...escolhidos.map((c) => ({ nome: c.nome, malha: malhaDoSolido(c.forma, q.tolerance), cor: APARENCIAS[aparenciaDoCorpo(c)].cor })),
      ...malhasEscolhidas.map((c) => ({ nome: c.nome, malha: c.malha, cor: APARENCIAS[aparenciaDoCorpo(c)].cor })),
    ];
    if (!objetos.length) throw new Error("Nenhum corpo para exportar");
    // Cada objeto apoiado em z = 0; o conjunto no meio da mesa escolhida.
    const girados = objetos.map((o) => {
      const m = p.zParaCima ? transformarMalha(o.malha, ([x, y, z]) => [x, -z, y]) : o.malha;
      const z0 = caixaMalha(m)[0][2];
      return { ...o, malha: transformarMalha(m, ([x, y, z]) => [x, y, z - z0]) };
    });
    const mesa = p.mesa ?? { area: [0, 0, 256, 256], altura: 256 };
    const { prontos, mesas, fora } = distribuirNasMesas(girados, mesa);
    const aviso =
      (mesas > 1 ? `${mesas} mesas (as peças não cabem juntas numa só). ` : "") +
      (fora.length ? `NÃO CABE na mesa: ${fora.join("; ")}.` : "Tudo cabe na mesa.");
    return { dados: gerar3MF(prontos).buffer as ArrayBuffer, aviso };
  }
  if (malhasEscolhidas.length) {
    // Com corpo de malha só sai STL (o STEP precisa de sólido: use Converter).
    if (p.formato === "step") throw new Error("Corpo de malha não vai para STEP: converta em sólido antes");
    const q = QUALIDADE_STL[p.qualidade];
    const todas = [...escolhidos.map((c) => malhaDoSolido(c.forma, q.tolerance)), ...malhasEscolhidas.map((c) => c.malha)];
    const girar = (m: Malha) => (p.zParaCima ? transformarMalha(m, ([x, y, z]) => [x, -z, y]) : m);
    return { dados: stlBinario(todas.map(girar)).buffer as ArrayBuffer };
  }
  if (!escolhidos.length) throw new Error("Nenhum corpo para exportar");
  // A tela usa Y para cima; impressoras 3D usam Z para cima: gira 90° no eixo X.
  const formas = escolhidos.map((c) => (p.zParaCima ? c.forma.clone().rotate(90, [0, 0, 0], [1, 0, 0]) : c.forma));
  let blob: Blob;
  if (p.formato === "step") {
    blob = exportSTEP(
      // Cor da aparência de cada corpo (sem cor o arquivo sai vermelho).
      formas.map((shape, i) => ({ shape, name: escolhidos[i].nome, color: corParaStep(APARENCIAS[aparenciaDoCorpo(escolhidos[i])].cor) })),
      { unit: "MM", modelUnit: "MM" },
    );
  } else {
    const junto = formas.length === 1 ? formas[0] : (makeCompound(formas) as Shape3D);
    blob = junto.blobSTL({ binary: true, ...QUALIDADE_STL[p.qualidade] });
  }
  return { dados: await blob.arrayBuffer() };
}

self.onmessage = async (e: MessageEvent<PedidoNucleo>) => {
  await carregado;
  const pedido = e.data;
  if (pedido.tipo === "listaMateriais") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: listaDeMateriais(pedido.historico) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "secao") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: secaoDoCorpo(pedido.historico, pedido.corpo, pedido.plano) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "isocurvas") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: isocurvas(pedido.historico) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "faces") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: descreverFaces(pedido.historico, pedido.corpo) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "pilhaFixadores") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: pilhaFixadores(pedido.historico) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "congelar") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: congelar(pedido.historico, pedido.nomes) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "origem") {
    try {
      const c = construir(pedido.historico).corpos.find((x) => x.nome === pedido.item.corpo);
      if (!c) throw new Error(`${pedido.item.corpo} não existe`);
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: [JSON.stringify(origemDeJunta(c.forma, pedido.item))] });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "geometria") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: [JSON.stringify(geometria(pedido.historico, pedido.item, pedido.t))] });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "interferencia" || pedido.tipo === "centroMassa") {
    try {
      const linhas = pedido.tipo === "interferencia" ? interferencia(pedido.historico, pedido.corpos) : centroDeMassa(pedido.historico, pedido.corpos);
      responder({ tipo: "medido", pedido: pedido.pedido, linhas });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "propriedades") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: propriedades(pedido.historico, pedido.corpo) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "medir") {
    try {
      responder({ tipo: "medido", pedido: pedido.pedido, linhas: medir(pedido) });
    } catch (err) {
      responder({ tipo: "medido", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo === "exportar") {
    try {
      const { dados, aviso } = await exportar(pedido);
      responder({ tipo: "exportado", pedido: pedido.pedido, dados, aviso }, [dados]);
    } catch (err) {
      responder({ tipo: "exportado", pedido: pedido.pedido, erro: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (pedido.tipo !== "recalcular") return;
  if (pedido.doZero) passos = []; // "Calcular todos": nada da memória é aproveitado
  try {
    const t0 = performance.now();
    const { malhas, erros } = recalcular(pedido.historico);
    const ms = Math.round(performance.now() - t0);
    const transferir = malhas.flatMap((m) => [
      m.vertices.buffer,
      m.normais.buffer,
      m.triangulos.buffer,
      m.arestas.buffer,
      m.gruposFaces.buffer,
      m.gruposArestas.buffer,
    ]);
    responder(
      { tipo: "resultado", versao: pedido.versao, corpos: malhas, erros, ms, reaproveitados: estatisticas.reaproveitados },
      transferir,
    );
  } catch (err) {
    responder({ tipo: "falha", mensagem: String(err) });
  }
};
