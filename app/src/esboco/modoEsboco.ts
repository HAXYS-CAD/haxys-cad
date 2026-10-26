// Modo esboço, como no Fusion:
// 1. "Criar esboço" mostra os planos da origem; clique num plano ou numa face plana.
// 2. A vista vira de frente para o plano e a aba ESBOÇO abre.
// 3. Linha (L), Retângulo (R), Círculo (C), Arco, Polígono, Recortar (T), Cota (D).
//    Esc termina a ferramenta.
// 4. Sem ferramenta: clique numa curva seleciona; Delete apaga. Ctrl+Z desfaz.
// Os pontos grudam em pontos que já existem (a menos de 10 pixels).
// Linhas quase horizontais/verticais ficam retas e ganham a restrição h/v.
import * as THREE from "three";
import type { Vista } from "../vista/cena";
import type { MalhaCorpo } from "../nucleo/tipos";
import {
  amostrarCurva,
  amostrarElipse,
  beziersDaSpline,
  pontoBezier,
  idsDaCurva,
  paraPlano,
  valorCota,
  aplicarCota,
  limparReferencias,
  medirCota,
  amostrarArco,
  angulo,
  centroDe3Pontos,
  recortar,
  varredura,
  PLANOS_ORIGEM,
  type CotaEsboco,
  type CurvaEsboco,
  type DadosEsboco,
  type P2,
  type PlanoEsboco,
  type V3,
} from "../nucleo/esboco";
import { desenharEsboco, liberar, matrizDoPlano, pontosDaCurva } from "../vista/desenhoEsboco";
import { analisarDefinicao, resolver } from "../nucleo/restricoes";
import { projetarNoEsboco } from "../nucleo/projetar";
import {
  arredondarCanto,
  chanfrarCanto,
  circuloDuasTangentes,
  circuloTresTangentes,
  deslocar,
  escalarCurvas,
  espelhar,
  estenderLinha,
  padraoCircular,
  padraoRetangular,
  quebrarCurva,
  restringirAutomatico,
} from "../nucleo/editarEsboco";
import { escreverTexto } from "../nucleo/texto";
import {
  apagarSimbolo,
  montarRestricao,
  NOMES_RESTRICAO,
  simbolosDoEsboco,
  type Escolha,
  type TipoFerramentaRestricao,
} from "./ferramentasRestricao";

export type FerramentaEsboco =
  | "linha"
  | "retangulo"
  | "retanguloCentro"
  | "circulo"
  | "arco3"
  | "arcoCentro"
  | "poligonoInscrito"
  | "poligonoCircunscrito"
  | "recortar"
  | "cota"
  | "projetar"
  | "deslocamento"
  | "espelhar"
  | "padraoRetangular"
  | "padraoCircular"
  | "spline"
  | "ranhuraCentros"
  | "ranhuraGeral"
  | "ranhuraPontoCentral"
  | "elipse"
  | "fendaArco3"
  | "fendaArcoCentro"
  | "filete"
  | "chanfroIgual"
  | "chanfroDuas"
  | "chanfroAngulo"
  | "circulo2"
  | "circulo3"
  | "retangulo3"
  | "poligonoAresta"
  | "arcoTangente"
  | "ponto"
  | "linhaMeio"
  | "circuloTan2"
  | "circuloTan3"
  | "estender"
  | "quebrar"
  | "escalaEsboco"
  | "texto"
  | "splineControle"
  | "mesclagem"
  | "conica"
  | "intersecao"
  | "autoRestricao";

// Ferramentas de cliques em sequência (forma nova a cada N cliques).
const FORMAS_CLIQUE = ["circulo2", "circulo3", "retangulo3", "poligonoAresta", "arcoTangente", "ponto", "linhaMeio", "mesclagem", "conica"] as const;
const ehSpline = (f: FerramentaEsboco | null) => f === "spline" || f === "splineControle";
const ehFormaClique = (f: FerramentaEsboco | null): f is (typeof FORMAS_CLIQUE)[number] => (FORMAS_CLIQUE as readonly string[]).includes(f ?? "");

const ehFenda = (f: FerramentaEsboco | null) => f === "fendaArco3" || f === "fendaArcoCentro";
const ehRanhura = (f: FerramentaEsboco | null) => f === "ranhuraCentros" || f === "ranhuraGeral" || f === "ranhuraPontoCentral";

const FERRAMENTAS_COPIA = [
  "deslocamento", "espelhar", "padraoRetangular", "padraoCircular",
  "filete", "chanfroIgual", "chanfroDuas", "chanfroAngulo",
  "circuloTan2", "circuloTan3", "estender", "quebrar", "escalaEsboco", "texto",
] as const;
type FerramentaCopia = (typeof FERRAMENTAS_COPIA)[number];
const ehCopia = (f: FerramentaEsboco | null): f is FerramentaCopia => (FERRAMENTAS_COPIA as readonly string[]).includes(f ?? "");

// Ids das ferramentas do Fusion que já funcionam aqui.
export const FERRAMENTAS_ESBOCO: Record<string, FerramentaEsboco> = {
  DrawPolyline: "linha",
  ShapeRectangleTwoPoint: "retangulo",
  ShapeRectangleCenter: "retanguloCentro",
  CircleCenterRadius: "circulo",
  ArcThreePoint: "arco3",
  ArcCenterTwoPoint: "arcoCentro",
  ShapePolygonInscribed: "poligonoInscrito",
  ShapePolygonCircumscribed: "poligonoCircunscrito",
  TrimSketchCmd: "recortar",
  SketchDimension: "cota",
  ProjectNewCmd: "projetar",
  Offset: "deslocamento",
  MirrorSketchCommand: "espelhar",
  RectangularSketchPatternCommand: "padraoRetangular",
  CircularSketchPatternCommand: "padraoCircular",
  DrawSpline: "spline",
  ShapeSlotCenterToCenter: "ranhuraCentros",
  ShapeSlotOverall: "ranhuraGeral",
  ShapeSlotCenterPoint: "ranhuraPontoCentral",
  CircleElipse: "elipse",
  ShapeArcSlotThreePoint: "fendaArco3",
  ShapeArcSlotCenterTwoPoint: "fendaArcoCentro",
  FilletSketchCmd: "filete",
  ChamferSketchEqualDistance: "chanfroIgual",
  ChamferSketchDistanceDistance: "chanfroDuas",
  ChamferSketchDistanceAngle: "chanfroAngulo",
  CircleTwoPoint: "circulo2",
  CircleThreePoint: "circulo3",
  ShapeRectangleThreePoint: "retangulo3",
  ShapePolygonEdge: "poligonoAresta",
  ArcTangent: "arcoTangente",
  DrawPoint: "ponto",
  SketchMidpointLine: "linhaMeio",
  CircleTanTanRadius: "circuloTan2",
  CircleThreeTangent: "circuloTan3",
  ExtendSketchCmd: "estender",
  BreakSketchCmd: "quebrar",
  SketchScaleCmd: "escalaEsboco",
  MTextCmd: "texto",
  DrawCVMSpline3D: "splineControle",
  DrawCVMSpline5D: "splineControle",
  BlendG1CurveSketchCmd: "mesclagem",
  ConicCurveCmd: "conica",
  IntersectCmd: "intersecao",
  // Iguais no HAXYS CAD (esboço plano): a curva fica no plano do esboço.
  IntersectionCurve: "intersecao",
  Include3DGeometry: "projetar",
  SketchAutoConstraintAndDimCmd: "autoRestricao",
  SketchAutoConstraintAndDimFromDatumCmd: "autoRestricao",
};

const NOMES: Record<FerramentaEsboco, string> = {
  linha: "Linha",
  retangulo: "Retângulo de 2 pontos",
  retanguloCentro: "Retângulo central",
  circulo: "Círculo por diâmetro central",
  arco3: "Arco de 3 pontos: início, fim e um ponto do arco",
  arcoCentro: "Arco por centro: centro, início e fim",
  poligonoInscrito: "Polígono inscrito: centro e um canto",
  poligonoCircunscrito: "Polígono circunscrito: centro e o meio de um lado",
  recortar: "Recortar",
  cota: "Cota de esboço",
  projetar: "Projetar",
  deslocamento: "Deslocamento",
  espelhar: "Espelhar",
  padraoRetangular: "Padrão retangular",
  padraoCircular: "Padrão circular",
  spline: "Spline",
  ranhuraCentros: "Ranhura centro a centro",
  ranhuraGeral: "Ranhura geral",
  ranhuraPontoCentral: "Ranhura de ponto central",
  elipse: "Elipse",
  fendaArco3: "Fenda de arco por três pontos",
  fendaArcoCentro: "Fenda de arco por centro e ponto",
  filete: "Arredondamento",
  chanfroIgual: "Chanfro de distância igual",
  chanfroDuas: "Chanfro de duas distâncias",
  chanfroAngulo: "Chanfro de distância e ângulo",
  circulo2: "Círculo de 2 pontos",
  circulo3: "Círculo de 3 pontos",
  retangulo3: "Retângulo de 3 pontos",
  poligonoAresta: "Polígono de aresta",
  arcoTangente: "Arco tangente",
  ponto: "Ponto",
  linhaMeio: "Linha do ponto central",
  circuloTan2: "Círculo por 2 tangentes",
  circuloTan3: "Círculo por 3 tangentes",
  estender: "Estender",
  quebrar: "Quebrar",
  escalaEsboco: "Escala do esboço",
  texto: "Texto",
  splineControle: "Spline de pontos de controle",
  mesclagem: "Curva de mesclagem",
  conica: "Curva cônica",
  intersecao: "Intersecção",
  autoRestricao: "Restrição automática",
};

// Instruções curtas mostradas ao escolher a ferramenta.
const DICAS: Partial<Record<FerramentaEsboco, string>> = {
  recortar: "Recortar: clique no pedaço que deve sair (fica vermelho ao passar).",
  cota: "Cota: clique numa linha, círculo ou arco.",
  projetar: "Projetar: clique numa aresta ou face de um corpo (vira curva fixa do esboço). Esc termina.",
  deslocamento: "Deslocamento: digite a distância no alto e clique numa curva (a cadeia ligada a ela vai junto).",
  espelhar: "Espelhar: clique nas curvas, depois em \"Escolher linha\" e na linha de espelho.",
  padraoRetangular: "Padrão retangular: clique nas curvas, ajuste quantidades e distâncias no alto e clique em Aplicar.",
  padraoCircular: "Padrão circular: clique nas curvas, ajuste no alto (centro = origem ou um ponto) e clique em Aplicar.",
  spline: "Spline: clique nos pontos por onde a curva passa. Enter ou Esc termina; clicar no 1º ponto fecha a curva.",
  ranhuraCentros: "Ranhura centro a centro: clique no 1º centro, no 2º centro e depois na largura.",
  ranhuraGeral: "Ranhura geral: clique numa ponta, na outra ponta e depois na largura.",
  ranhuraPontoCentral: "Ranhura de ponto central: clique no meio, num dos centros e depois na largura.",
  elipse: "Elipse: clique no centro, na ponta de um eixo e depois na medida do outro eixo.",
  fendaArco3: "Fenda de arco: clique no início, no fim e num ponto do arco do meio; depois na largura.",
  fendaArcoCentro: "Fenda de arco: clique no centro, no início e no fim (anti-horário); depois na largura.",
  filete: "Arredondamento: digite o raio no alto e clique no canto (ou na linha, perto do canto).",
  chanfroIgual: "Chanfro: digite a distância no alto e clique no canto (ou na linha, perto do canto).",
  chanfroDuas: "Chanfro: a 1ª distância vale na linha clicada; clique na linha perto do canto.",
  chanfroAngulo: "Chanfro: a distância e o ângulo valem na linha clicada; clique na linha perto do canto.",
  circulo2: "Círculo de 2 pontos: clique nas duas pontas de um diâmetro.",
  circulo3: "Círculo de 3 pontos: clique em três pontos do círculo.",
  retangulo3: "Retângulo de 3 pontos: dois cliques fazem um lado; o 3º dá a altura.",
  poligonoAresta: "Polígono de aresta: dois cliques fazem um lado; o 3º diz de que lado fica.",
  arcoTangente: "Arco tangente: clique na ponta de uma linha/arco e depois no fim do arco.",
  ponto: "Ponto: cada clique cria um ponto.",
  linhaMeio: "Linha do ponto central: clique no meio e depois numa ponta.",
  circuloTan2: "Círculo por 2 tangentes: digite o raio e clique nas duas linhas (perto de onde o círculo deve ficar).",
  circuloTan3: "Círculo por 3 tangentes: clique nas três linhas (perto de onde o círculo deve ficar).",
  estender: "Estender: clique numa linha perto da ponta que deve crescer.",
  quebrar: "Quebrar: clique numa linha, arco ou círculo para cortar nos cruzamentos (os pedaços ficam).",
  escalaEsboco: "Escala: clique nas curvas, ajuste o fator e o centro no alto e clique em Aplicar.",
  texto: "Texto: digite no alto e clique onde o texto começa (canto de baixo à esquerda).",
  splineControle: "Spline de controle: clique nos pontos de controle (a curva passa só pelas pontas). Enter ou Esc termina; clicar no 1º ponto fecha.",
  mesclagem: "Curva de mesclagem: clique na ponta de uma curva e depois na ponta de outra (sai tangente às duas).",
  conica: "Curva cônica: clique no início, no fim e no vértice (onde as tangentes se cruzam). Rho no alto: 0,5 = parábola.",
  intersecao: "Intersecção: clique num corpo; o corte dele pelo plano do esboço vira curva fixa. Esc termina.",
};

const GRUDAR_PX = 10;
const ANGULO_RETO = (3 * Math.PI) / 180; // até 3° vira horizontal/vertical

export interface AcoesModoEsboco {
  aoComecar(): void; // abre a aba ESBOÇO
  aoConcluir(dados: DadosEsboco): void;
  aoSair(): void; // fecha a aba ESBOÇO
  avisar(texto: string): void;
  avaliar(texto: string): number; // expressão com os parâmetros do usuário
  planosConstrucao(): PlanoEsboco[]; // planos de deslocamento visíveis
  secao?(corpo: string, plano: PlanoEsboco): Promise<V3[][]>; // Intersecção
}

export interface ModoEsboco {
  ativo(): boolean;
  iniciar(): void;
  editar(dados: DadosEsboco): void;
  usarFerramenta(f: FerramentaEsboco): void;
  usarRestricao(t: TipoFerramentaRestricao): void;
  concluir(): void;
  tecla(e: KeyboardEvent): boolean; // true = a tecla foi usada aqui
}

type Etapa = "parado" | "plano" | "desenhando";

export function criarModoEsboco(vista: Vista, sobreposicao: HTMLElement, acoes: AcoesModoEsboco): ModoEsboco {
  let etapa: Etapa = "parado";
  let dados: DadosEsboco | null = null;
  let ferramenta: FerramentaEsboco | null = null;
  let ultimoPonto: number | null = null; // ponta da linha em andamento
  let primeiro: { pos: P2; id: number | null } | null = null; // 1º clique do retângulo/círculo/arco/polígono
  let segundo: { pos: P2; id: number | null } | null = null; // 2º clique dos arcos
  let terceiro: { pos: P2; id: number | null } | null = null; // 3º clique da fenda em arco
  let lados = 6; // lados do polígono (o Fusion também começa com 6)
  let recortePrevio: P2[] | null = null; // pedaço que o Recortar tiraria
  let ferramentaRestricao: TipoFerramentaRestricao | null = null;
  let escolhas: Escolha[] = []; // cliques já feitos na ferramenta de restrição
  let simboloSelecionado: string | null = null; // símbolo clicado (Delete apaga)
  let cursor: P2 | null = null;
  let curvaSelecionada: number | null = null;
  const desfazer: string[] = [];

  const raiz = new THREE.Group();
  vista.cena.add(raiz);
  let desenho: THREE.Group | null = null;
  const previa = new THREE.Group();
  raiz.add(previa);
  // Selo "totalmente definido" (no Fusion aparece um cadeado no esboço).
  const selo = document.createElement("div");
  selo.className = "selo-definido";
  selo.textContent = "🔒 Esboço totalmente definido";
  selo.hidden = true;
  sobreposicao.appendChild(selo);
  const rotulos = document.createElement("div");
  rotulos.className = "rotulos-cota";
  sobreposicao.appendChild(rotulos);

  // ---- Utilidades de tela ----

  const raio = new THREE.Raycaster();
  function raioDoMouse(x: number, y: number) {
    const r = vista.tela.getBoundingClientRect();
    raio.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), vista.camera);
    return r;
  }
  function naTela(w: THREE.Vector3): THREE.Vector2 {
    const r = vista.tela.getBoundingClientRect();
    const p = w.clone().project(vista.camera);
    return new THREE.Vector2(((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height);
  }
  const mundo = (u: number, v: number) => new THREE.Vector3(u, v, 0).applyMatrix4(matrizDoPlano(dados!.plano));

  function pontoNoPlano(x: number, y: number): P2 | null {
    raioDoMouse(x, y);
    const p = dados!.plano;
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...p.normal), new THREE.Vector3(...p.origem));
    const w = raio.ray.intersectPlane(plano, new THREE.Vector3());
    return w ? paraPlano(p, [w.x, w.y, w.z]) : null;
  }

  // Ponto existente perto do mouse (em pixels).
  function pontoPerto(x: number, y: number): number | null {
    const r = vista.tela.getBoundingClientRect();
    const m = new THREE.Vector2(x - r.left, y - r.top);
    let melhor = GRUDAR_PX;
    let id: number | null = null;
    for (const p of dados!.pontos) {
      const d = naTela(mundo(p.u, p.v)).distanceTo(m);
      if (d < melhor) (melhor = d), (id = p.id);
    }
    return id;
  }

  function curvaPerto(x: number, y: number): number | null {
    const r = vista.tela.getBoundingClientRect();
    const m = new THREE.Vector2(x - r.left, y - r.top);
    let melhor = GRUDAR_PX;
    let id: number | null = null;
    for (const c of dados!.curvas) {
      const pts = pontosDaCurva(dados!, c.id).map((p) => naTela(mundo(p.x, p.y)));
      for (let i = 0; i + 1 < pts.length; i++) {
        const seg = pts[i + 1].clone().sub(pts[i]);
        const t = THREE.MathUtils.clamp(m.clone().sub(pts[i]).dot(seg) / Math.max(seg.lengthSq(), 1e-9), 0, 1);
        const d = pts[i].clone().addScaledVector(seg, t).distanceTo(m);
        if (d < melhor) (melhor = d), (id = c.id);
      }
    }
    return id;
  }

  const novoId = (lista: { id: number }[]) => lista.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const ponto = (id: number) => dados!.pontos.find((p) => p.id === id)!;
  function criarPonto(pos: P2): number {
    const id = novoId(dados!.pontos);
    dados!.pontos.push({ id, u: pos[0], v: pos[1] });
    return id;
  }
  function guardar() {
    desfazer.push(JSON.stringify(dados));
  }

  // Deixa a linha reta se estiver quase horizontal/vertical.
  function endireitar(de: P2, para: P2): { pos: P2; restricao?: "h" | "v" } {
    const ang = Math.atan2(para[1] - de[1], para[0] - de[0]);
    const quase = (alvo: number) => Math.abs(Math.atan2(Math.sin(ang - alvo), Math.cos(ang - alvo))) < ANGULO_RETO;
    if (quase(0) || quase(Math.PI)) return { pos: [para[0], de[1]], restricao: "h" };
    if (quase(Math.PI / 2) || quase(-Math.PI / 2)) return { pos: [de[0], para[1]], restricao: "v" };
    return { pos: para };
  }

  // ---- Desenho ----

  function redesenhar() {
    if (desenho) (raiz.remove(desenho), liberar(desenho));
    const definicao = dados ? analisarDefinicao(dados) : null;
    desenho = dados ? desenharEsboco(dados, { definidas: definicao!.curvas }) : null;
    selo.hidden = !(etapa === "desenhando" && definicao?.tudo);
    if (desenho) {
      raiz.add(desenho);
      const destacar = new Set(escolhas.filter((x) => x.tipo === "curva").map((x) => x.id));
      if (curvaSelecionada !== null) destacar.add(curvaSelecionada);
      for (const id of marcadas) destacar.add(id);
      for (const l of desenho.getObjectByName("curvas")!.children) {
        if (destacar.has(l.userData.curva))
          (l as THREE.Line).material = new THREE.LineBasicMaterial({ color: 0x1f6fe0, depthTest: false });
      }
    }
    desenharRotulos();
    desenharPrevia();
  }

  function desenharPrevia() {
    for (const o of [...previa.children]) (previa.remove(o), liberar(o));
    if (!dados || !cursor || etapa !== "desenhando") return;
    previa.matrixAutoUpdate = false;
    previa.matrix.copy(matrizDoPlano(dados.plano));
    const linhas: P2[][] = [];
    if (ferramenta === "linha" && ultimoPonto !== null) {
      const a = ponto(ultimoPonto);
      linhas.push([[a.u, a.v], cursor]);
    } else if (primeiro && (ferramenta === "retangulo" || ferramenta === "retanguloCentro")) {
      const [a, b] = cantos(primeiro.pos, cursor);
      linhas.push([a, [b[0], a[1]], b, [a[0], b[1]], a]);
    } else if (primeiro && ferramenta === "circulo") {
      const r = Math.hypot(cursor[0] - primeiro.pos[0], cursor[1] - primeiro.pos[1]);
      linhas.push(amostrarArco(primeiro.pos, r, 0, Math.PI * 2, 64));
    } else if (primeiro && (ferramenta === "poligonoInscrito" || ferramenta === "poligonoCircunscrito")) {
      const v = verticesPoligono(primeiro.pos, cursor);
      linhas.push([...v, v[0]]);
    } else if (ehSpline(ferramenta) && pontosSpline.length) {
      const pts = [...pontosSpline.map((p) => p.pos), cursor];
      linhas.push(amostrarCurva({ ...dados, pontos: pts.map((q, i) => ({ id: -1 - i, u: q[0], v: q[1] })), curvas: [] }, {
        id: -1, tipo: "spline", a: -1, b: -pts.length, internos: pts.slice(1, -1).map((_, i) => -2 - i), controle: ferramenta === "splineControle",
      }));
      if (ferramenta === "splineControle") linhas.push(pts);
    } else if (primeiro && ehFormaClique(ferramenta)) {
      const g = geometriaForma(cursor);
      if (!g && !segundo) linhas.push([primeiro.pos, cursor]);
      else if (g?.circulo) linhas.push(amostrarArco(g.circulo.c, g.circulo.r, 0, Math.PI * 2, 64));
      else if (g?.arco) linhas.push(amostrarArco(g.arco.centro, g.arco.raio, g.arco.inicio, g.arco.sweep));
      else if (g) linhas.push(g.fechado ? [...g.pontos, g.pontos[0]] : g.pontos);
      else if (segundo) linhas.push([primeiro.pos, segundo.pos]);
    } else if (primeiro && ferramenta === "elipse") {
      if (!segundo) linhas.push([primeiro.pos, cursor]);
      else linhas.push(amostrarElipse(primeiro.pos, segundo.pos, distanciaAoEixo(primeiro.pos, segundo.pos, cursor), 96));
    } else if (primeiro && ehFenda(ferramenta)) {
      if (!segundo) linhas.push([primeiro.pos, cursor]);
      else if (!terceiro) {
        const g = geometriaArco(primeiro.pos, segundo.pos, cursor);
        if (g) linhas.push(amostrarArco(g.centro, g.raio, g.inicio, g.sweep));
      } else {
        const f = geometriaFenda(cursor);
        if (f) linhas.push(...f.contorno);
      }
    } else if (primeiro && ehRanhura(ferramenta)) {
      if (!segundo) linhas.push([primeiro.pos, cursor]);
      else {
        const g = geometriaRanhura(primeiro.pos, segundo.pos, cursor);
        if (g) {
          for (const c of g.curvas) linhas.push(c);
        }
      }
    } else if (primeiro && (ferramenta === "arco3" || ferramenta === "arcoCentro")) {
      if (!segundo) linhas.push([primeiro.pos, cursor]);
      else {
        const g = geometriaArco(primeiro.pos, segundo.pos, cursor);
        if (g) linhas.push(amostrarArco(g.centro, g.raio, g.inicio, g.sweep));
      }
    }
    const mat = new THREE.LineDashedMaterial({ color: 0x2a62c9, dashSize: 2, gapSize: 1.5, depthTest: false });
    for (const l of linhas) {
      const g = new THREE.BufferGeometry().setFromPoints(l.map(([u, v]) => new THREE.Vector3(u, v, 0)));
      const linha = new THREE.Line(g, mat);
      linha.computeLineDistances();
      linha.renderOrder = 6;
      previa.add(linha);
    }
    // Recortar: o pedaço que vai sair aparece em vermelho.
    if (ferramenta === "recortar" && recortePrevio) {
      const g = new THREE.BufferGeometry().setFromPoints(recortePrevio.map(([u, v]) => new THREE.Vector3(u, v, 0)));
      const linha = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xe03131, depthTest: false }));
      linha.renderOrder = 7;
      previa.add(linha);
    }
    previa.updateMatrixWorld(true);
  }

  // Cantos do polígono: inscrito = o clique é um canto; circunscrito = o meio de um lado.
  function verticesPoligono(centro: P2, clique: P2): P2[] {
    const r0 = Math.hypot(clique[0] - centro[0], clique[1] - centro[1]);
    const a0 = Math.atan2(clique[1] - centro[1], clique[0] - centro[0]);
    const inscrito = ferramenta === "poligonoInscrito";
    const r = inscrito ? r0 : r0 / Math.cos(Math.PI / lados);
    const inicio = inscrito ? a0 : a0 + Math.PI / lados;
    return Array.from({ length: lados }, (_, i) => {
      const a = inicio + (i * 2 * Math.PI) / lados;
      return [centro[0] + r * Math.cos(a), centro[1] + r * Math.sin(a)] as P2;
    });
  }

  // Arco a partir dos 3 cliques. arco3: início, fim, ponto do arco.
  // arcoCentro: centro, início, fim (vai pelo lado mais curto).
  // tres = arco por 3 pontos (início, fim, ponto do arco); senão: centro, início, fim.
  function geometriaArco(p1: P2, p2: P2, p3: P2, tres = ferramenta === "arco3" || ferramenta === "fendaArco3") {
    if (tres) {
      const centro = centroDe3Pontos(p1, p2, p3);
      if (!centro) return null;
      const raio = Math.hypot(p1[0] - centro[0], p1[1] - centro[1]);
      const a1 = angulo(centro, p1), a2 = angulo(centro, p2), a3 = angulo(centro, p3);
      const antiHorario = varredura(a1, a3) < varredura(a1, a2);
      return antiHorario
        ? { centro, raio, inicio: a1, sweep: varredura(a1, a2), a: p1, b: p2 }
        : { centro, raio, inicio: a2, sweep: varredura(a2, a1), a: p2, b: p1 };
    }
    const centro = p1;
    const raio = Math.hypot(p2[0] - centro[0], p2[1] - centro[1]);
    if (raio < 1e-6) return null;
    const a1 = angulo(centro, p2), a3 = angulo(centro, p3);
    const fim: P2 = [centro[0] + raio * Math.cos(a3), centro[1] + raio * Math.sin(a3)];
    return varredura(a1, a3) <= Math.PI
      ? { centro, raio, inicio: a1, sweep: varredura(a1, a3), a: p2, b: fim }
      : { centro, raio, inicio: a3, sweep: varredura(a3, a1), a: fim, b: p2 };
  }

  function cantos(p1: P2, p2: P2): [P2, P2] {
    if (ferramenta === "retanguloCentro") return [[2 * p1[0] - p2[0], 2 * p1[1] - p2[1]], p2];
    return [p1, p2];
  }

  // ---- Cotas (rótulos em HTML por cima do 3D) ----

  function meioDaLinha(id: number): P2 | null {
    const l = dados!.curvas.find((x) => x.id === id);
    if (!l || l.tipo !== "linha") return null;
    const a = ponto(l.a), b = ponto(l.b);
    return [(a.u + b.u) / 2, (a.v + b.v) / 2];
  }

  function posicaoRotulo(c: CotaEsboco): THREE.Vector3 | null {
    if (c.tipo === "angulo") {
      const m1 = meioDaLinha(c.c1), m2 = meioDaLinha(c.c2);
      return m1 && m2 ? mundo((m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2) : null;
    }
    if (c.tipo === "pontos") {
      const a = ponto(c.p1), b = ponto(c.p2);
      return mundo((a.u + b.u) / 2, (a.v + b.v) / 2);
    }
    if (c.tipo === "pontoLinha") {
      // Meio do caminho entre o ponto e o pé dele na linha.
      const l = dados!.curvas.find((x) => x.id === c.curva);
      if (!l || l.tipo !== "linha") return null;
      const p = ponto(c.ponto), a = ponto(l.a), b = ponto(l.b);
      const du = b.u - a.u, dv = b.v - a.v;
      const t = ((p.u - a.u) * du + (p.v - a.v) * dv) / (du * du + dv * dv || 1);
      return mundo((p.u + a.u + t * du) / 2, (p.v + a.v + t * dv) / 2);
    }
    const curva = dados!.curvas.find((x) => x.id === c.curva);
    if (!curva) return null;
    if (curva.tipo === "circulo") {
      const p = ponto(curva.centro);
      return mundo(p.u + curva.raio * 0.7071, p.v + curva.raio * 0.7071);
    }
    if (curva.tipo === "arco" || curva.tipo === "elipse") {
      const pts = pontosDaCurva(dados!, curva.id);
      const meio = pts[Math.floor(pts.length / 2)];
      return mundo(meio.x, meio.y);
    }
    const a = ponto(curva.a), b = ponto(curva.b);
    return mundo((a.u + b.u) / 2, (a.v + b.v) / 2);
  }

  function textoCota(c: CotaEsboco): string {
    // Cota ligada a parâmetro: "fx:" na frente, como no Fusion.
    return (c.expressao ? "fx: " : "") + textoMedida(c);
  }
  function textoMedida(c: CotaEsboco): string {
    const v = valorCota(dados!, c);
    if (c.tipo === "angulo") return `${v.toFixed(1)}°`;
    if (c.tipo === "pontos" || c.tipo === "pontoLinha") return v.toFixed(2);
    const curva = dados!.curvas.find((x) => x.id === c.curva);
    const prefixo = curva?.tipo === "circulo" ? "Ø" : curva?.tipo === "arco" ? "R" : "";
    return `${prefixo}${v.toFixed(2)}`;
  }

  function desenharRotulos() {
    rotulos.innerHTML = "";
    if (!dados || etapa !== "desenhando") return;
    // Símbolos das restrições (clique seleciona; Delete apaga).
    for (const sb of simbolosDoEsboco(dados)) {
      const el = document.createElement("div");
      el.className = "simbolo-restricao" + (sb.chave === simboloSelecionado ? " selecionado" : "");
      el.textContent = sb.texto;
      el.dataset.u = String(sb.pos[0]);
      el.dataset.v = String(sb.pos[1]);
      el.title = "Restrição (clique e aperte Delete para tirar)";
      el.addEventListener("click", () => {
        simboloSelecionado = sb.chave;
        curvaSelecionada = null;
        redesenhar();
      });
      rotulos.appendChild(el);
    }
    for (const c of dados.cotas) {
      const el = document.createElement("div");
      el.className = "rotulo-cota";
      el.textContent = textoCota(c);
      el.dataset.cota = String(c.id);
      el.title = "Clique duplo para mudar";
      el.addEventListener("dblclick", () => editarCota(c));
      rotulos.appendChild(el);
    }
    posicionarRotulos();
  }

  function posicionarRotulos() {
    if (!dados || etapa !== "desenhando") return;
    const ocupados = new Map<string, number>(); // símbolos no mesmo lugar ficam lado a lado
    for (const el of rotulos.children as HTMLCollectionOf<HTMLElement>) {
      let w: THREE.Vector3 | null = null;
      if (el.dataset.cota) {
        const c = dados.cotas.find((x) => x.id === Number(el.dataset.cota));
        w = c ? posicaoRotulo(c) : null;
      } else w = mundo(Number(el.dataset.u), Number(el.dataset.v));
      if (!w) continue;
      const s = naTela(w);
      let dx = 0;
      if (!el.dataset.cota) {
        const k = `${Math.round(s.x)}:${Math.round(s.y)}`;
        const n = ocupados.get(k) ?? 0;
        ocupados.set(k, n + 1);
        dx = n * 16;
      }
      el.style.left = `${s.x + dx}px`;
      el.style.top = `${s.y}px`;
    }
  }
  vista.aoDesenhar(posicionarRotulos);

  function editarCota(c: CotaEsboco) {
    const w = posicaoRotulo(c);
    if (!w) return;
    const s = naTela(w);
    const caixa = document.createElement("input");
    caixa.type = "text";
    caixa.inputMode = "decimal";
    caixa.spellcheck = false;
    caixa.className = "editor-cota";
    caixa.value = c.expressao ?? valorCota(dados!, c).toFixed(c.tipo === "angulo" ? 1 : 2);
    if (c.tipo === "pontos") caixa.title = "Tab: alinhada / horizontal / vertical";
    caixa.style.left = `${s.x}px`;
    caixa.style.top = `${s.y}px`;
    sobreposicao.appendChild(caixa);
    caixa.focus();
    caixa.select();
    const fechar = () => caixa.isConnected && caixa.remove(); // Enter fecha e o "blur" tenta de novo
    caixa.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") fechar();
      if (e.key === "Tab" && c.tipo === "pontos") {
        // Troca o tipo da distância e mostra a medida atual nesse tipo.
        e.preventDefault();
        const ordem = ["livre", "h", "v"] as const;
        const k = dados!.cotas.find((x) => x.id === c.id) as typeof c;
        k.eixo = ordem[(ordem.indexOf(k.eixo) + 1) % 3];
        const a = ponto(k.p1), b = ponto(k.p2);
        k.sinal = k.eixo === "h" ? Math.sign(b.u - a.u) || 1 : k.eixo === "v" ? Math.sign(b.v - a.v) || 1 : 1;
        k.valor = medirCota(dados!, { ...k, valor: undefined });
        caixa.value = k.valor.toFixed(2);
        caixa.select();
        redesenhar();
        acoes.avisar(k.eixo === "h" ? "Distância horizontal" : k.eixo === "v" ? "Distância vertical" : "Distância alinhada");
      }
      if (e.key === "Enter") {
        // Número ou expressão com parâmetros ("largura / 2").
        const texto = caixa.value.trim();
        const simples = /^-?\d+([.,]\d+)?$/.test(texto);
        let valor: number;
        try {
          valor = simples ? Number(texto.replace(",", ".")) : acoes.avaliar(texto);
        } catch (erro) {
          acoes.avisar(erro instanceof Error ? erro.message : String(erro));
          caixa.classList.add("invalido");
          return;
        }
        const ok = c.tipo === "angulo" ? valor > 0 && valor < 180 : valor > 0;
        if (ok) {
          guardar();
          if (aplicarCota(dados!, c, valor)) {
            const k = dados!.cotas.find((x) => x.id === c.id);
            if (k) {
              if (simples) delete k.expressao;
              else k.expressao = texto;
            }
            redesenhar();
          } else {
            desfazer.pop();
            acoes.avisar("Essa medida briga com outras restrições ou cotas.");
          }
        } else acoes.avisar(c.tipo === "angulo" ? "O ângulo deve ficar entre 0° e 180°." : "A medida deve ser maior que zero.");
        fechar();
      }
    });
    caixa.addEventListener("blur", fechar);
  }

  // ---- Escolher o plano ----

  let planos: THREE.Group | null = null;
  const MAT_PLANO = new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const MAT_PLANO_SOBRE = new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

  function mostrarPlanos() {
    planos = new THREE.Group();
    for (const [nome, p] of Object.entries(PLANOS_ORIGEM)) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).translate(30, 30, 0), MAT_PLANO);
      m.matrixAutoUpdate = false;
      m.matrix.copy(matrizDoPlano(p));
      // Os quadrados ficam no lado positivo dos eixos, como no Fusion.
      if (nome === "XZ") m.matrix.multiply(new THREE.Matrix4().makeScale(1, -1, 1));
      if (nome === "YZ") m.matrix.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
      m.userData.plano = p;
      planos.add(m);
    }
    // Planos de construção: quadrado centrado na origem do plano.
    for (const p of acoes.planosConstrucao()) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), MAT_PLANO);
      m.matrixAutoUpdate = false;
      m.matrix.copy(matrizDoPlano(p));
      m.userData.plano = p;
      m.userData.construcao = true;
      planos.add(m);
    }
    raiz.add(planos);
    raiz.updateMatrixWorld(true);
  }

  // Face plana de um corpo sob o mouse: devolve o plano dela.
  function planoDaFace(x: number, y: number): PlanoEsboco | null {
    raioDoMouse(x, y);
    const acerto = raio.intersectObjects(vista.grupoSelecionavel.children, false)[0];
    if (!acerto || acerto.faceIndex == null) return null;
    const c = acerto.object.userData.corpo as MalhaCorpo;
    const pos = acerto.faceIndex * 3;
    let f = -1;
    for (let i = 0; i < c.gruposFaces.length / 2; i++) {
      if (pos >= c.gruposFaces[i * 2] && pos < c.gruposFaces[i * 2] + c.gruposFaces[i * 2 + 1]) f = i;
    }
    if (f < 0) return null;
    // A face é plana se todos os triângulos têm a mesma normal.
    const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
    let n: THREE.Vector3 | null = null;
    let pontoFace: THREE.Vector3 | null = null;
    const inicio = c.gruposFaces[f * 2], qtd = c.gruposFaces[f * 2 + 1];
    for (let i = inicio; i < inicio + qtd; i += 3) {
      a.fromArray(c.vertices, c.triangulos[i] * 3);
      b.fromArray(c.vertices, c.triangulos[i + 1] * 3);
      d.fromArray(c.vertices, c.triangulos[i + 2] * 3);
      const ni = b.clone().sub(a).cross(d.clone().sub(a)).normalize();
      if (!n) (n = ni), (pontoFace = a.clone());
      else if (ni.dot(n) < 0.9999) return null;
    }
    if (!n || !pontoFace) return null;
    // Origem = origem do mundo projetada na face; eixo X = eixo do mundo mais "deitado" na face.
    const origem = new THREE.Vector3().sub(n.clone().multiplyScalar(n.dot(new THREE.Vector3().sub(pontoFace))));
    const eixos = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)];
    const ex = eixos.sort((p, q) => Math.abs(p.dot(n!)) - Math.abs(q.dot(n!)))[0];
    const eixoX = ex.clone().sub(n.clone().multiplyScalar(ex.dot(n))).normalize();
    const arred = (v: THREE.Vector3) => v.toArray().map((x) => Math.round(x * 1e6) / 1e6) as V3;
    return { nome: "Face", origem: arred(origem), eixoX: arred(eixoX), normal: arred(n) };
  }

  function planoSob(x: number, y: number): { plano: PlanoEsboco; malha?: THREE.Mesh } | null {
    if (!planos) return null;
    raioDoMouse(x, y);
    // Plano de construção tem preferência: os quadrados da origem costumam ficar na frente.
    const acertos = raio.intersectObjects(planos.children, false);
    const acertoPlano = acertos.find((a) => a.object.userData.construcao) ?? acertos[0];
    const face = planoDaFace(x, y);
    const acertoCorpo = raio.intersectObjects(vista.grupoSelecionavel.children, false)[0];
    if (acertoPlano && (!acertoCorpo || acertoPlano.distance < acertoCorpo.distance))
      return { plano: acertoPlano.object.userData.plano, malha: acertoPlano.object as THREE.Mesh };
    return face ? { plano: face } : null;
  }

  function comecarNoPlano(plano: PlanoEsboco, existente?: DadosEsboco) {
    if (planos) (raiz.remove(planos), liberar(planos), (planos = null));
    dados = existente ? structuredClone(existente) : { plano, pontos: [{ id: 0, u: 0, v: 0 }], curvas: [], cotas: [] };
    etapa = "desenhando";
    ferramenta = null;
    desfazer.length = 0;
    vista.orientar(new THREE.Vector3(...plano.normal));
    acoes.aoComecar();
    redesenhar();
  }

  // ---- Ferramenta Cota (como no Fusion) ----
  // Círculo/arco: um clique. Linha: 2º clique no vazio = comprimento; noutra linha =
  // ângulo (ou distância, se forem paralelas); num ponto = distância ponto-linha.
  // Ponto: 2º clique noutro ponto = distância entre pontos; numa linha = ponto-linha.

  function cliqueCota(x: number, y: number) {
    const d = dados!;
    const perto = pontoPerto(x, y);
    const curvaId = perto === null ? curvaPerto(x, y) : null;
    const atual: Escolha | null =
      perto !== null ? { tipo: "ponto", id: perto } : curvaId !== null ? { tipo: "curva", id: curvaId } : null;
    const curva = (id: number) => d.curvas.find((c) => c.id === id)!;

    if (!escolhas.length) {
      if (!atual) return acoes.avisar("Clique numa linha, círculo, arco ou ponto.");
      if (atual.tipo === "curva" && (curva(atual.id).tipo === "spline" || curva(atual.id).tipo === "elipse"))
        return acoes.avisar("Esta curva ainda não tem cota de tamanho: cote os pontos dela.");
      if (atual.tipo === "curva" && curva(atual.id).tipo !== "linha") return criarCota({ id: 0, curva: atual.id });
      escolhas = [atual];
      acoes.avisar(
        atual.tipo === "curva"
          ? "Agora: clique no vazio (comprimento), noutra linha (ângulo) ou num ponto (distância)."
          : "Agora clique noutro ponto ou numa linha.",
      );
      return redesenhar();
    }
    const primeiro = escolhas[0];
    escolhas = [];
    const linhaIds = (e: Escolha | null) => (e && e.tipo === "curva" && curva(e.id).tipo === "linha" ? e.id : null);
    const l1 = linhaIds(primeiro), l2 = linhaIds(atual);

    if (l1 !== null && (atual === null || l2 === l1)) return criarCota({ id: 0, curva: l1 });
    if (l1 !== null && l2 !== null) {
      const ang = medirCota(d, { id: 0, tipo: "angulo", c1: l1, c2: l2, sinal: 1 });
      if (Math.abs(Math.sin((ang * Math.PI) / 180)) < Math.sin(Math.PI / 180)) {
        // Paralelas: distância de uma ponta da 2ª linha até a 1ª.
        const outra = curva(l2) as Extract<CurvaEsboco, { tipo: "linha" }>;
        return criarCotaPontoLinha(outra.a, l1);
      }
      // Mostra o ângulo agudo (o lado menor), como o Fusion faz por padrão.
      return criarCota({ id: 0, tipo: "angulo", c1: l1, c2: l2, sinal: Math.sign(ang) || 1, suplemento: Math.abs(ang) > 90 });
    }
    const pontoEsc = primeiro.tipo === "ponto" ? primeiro.id : atual?.tipo === "ponto" ? atual.id : null;
    const linhaEsc = l1 ?? l2;
    if (pontoEsc !== null && linhaEsc !== null) return criarCotaPontoLinha(pontoEsc, linhaEsc);
    if (primeiro.tipo === "ponto" && atual?.tipo === "ponto" && atual.id !== primeiro.id) {
      const a = ponto(primeiro.id), b = ponto(atual.id);
      const eixo = Math.abs(b.u - a.u) < 1e-6 ? "v" : Math.abs(b.v - a.v) < 1e-6 ? "h" : "livre";
      const sinal = eixo === "h" ? Math.sign(b.u - a.u) || 1 : eixo === "v" ? Math.sign(b.v - a.v) || 1 : 1;
      return criarCota({ id: 0, tipo: "pontos", p1: primeiro.id, p2: atual.id, eixo, sinal });
    }
    acoes.avisar("Essa combinação não dá cota. Comece de novo.");
    redesenhar();
  }

  function criarCotaPontoLinha(p: number, linha: number) {
    const k: CotaEsboco = { id: 0, tipo: "pontoLinha", ponto: p, curva: linha, sinal: 1 };
    const m = medirCota(dados!, k);
    if (Math.abs(m) < 1e-6) return acoes.avisar("O ponto já está em cima da linha."), redesenhar();
    k.sinal = Math.sign(m);
    criarCota(k);
  }

  // Cria a cota com a medida atual (ela passa a mandar) e abre a caixa para mudar.
  function criarCota(nova: CotaEsboco) {
    const d = dados!;
    // Cota de comprimento/diâmetro que já existe: só abre para editar.
    const existente = (nova.tipo ?? "curva") === "curva"
      ? d.cotas.find((k) => (k.tipo ?? "curva") === "curva" && (k as { curva: number }).curva === (nova as { curva: number }).curva)
      : undefined;
    if (existente) return editarCota(existente);
    guardar();
    nova.id = novoId(d.cotas);
    nova.valor = medirCota(d, nova);
    d.cotas.push(nova);
    redesenhar();
    editarCota(nova);
  }

  // ---- Restrições ----

  function cliqueRestricao(x: number, y: number) {
    const perto = pontoPerto(x, y);
    const curva = curvaPerto(x, y);
    // Ponto tem preferência, menos no Horizontal/vertical (que só aceita linha).
    const escolha: Escolha | null =
      perto !== null && ferramentaRestricao !== "hv" ? { tipo: "ponto", id: perto } : curva !== null ? { tipo: "curva", id: curva } : null;
    if (!escolha) return acoes.avisar("Clique num ponto ou numa curva.");
    escolhas.push(escolha);
    const m = montarRestricao(ferramentaRestricao!, escolhas, dados!);
    if ("falta" in m) return acoes.avisar(m.falta), redesenhar();
    escolhas = [];
    if ("erro" in m) return acoes.avisar(m.erro), redesenhar();
    guardar();
    const copia: DadosEsboco = structuredClone(dados!);
    const preferidos = m.aplicar(copia);
    limparReferencias(copia);
    if (resolver(copia, preferidos)) {
      dados = copia;
      acoes.avisar("Restrição aplicada.");
    } else {
      desfazer.pop();
      acoes.avisar("Essa restrição briga com outras restrições ou cotas.");
    }
    redesenhar();
  }

  // ---- Cliques ----

  // Projetar: aresta perto do mouse (em pixels) ou, se não houver, a face clicada
  // (todas as arestas da borda dela). As arestas vêm da malha da tela.
  function cliqueProjetar(x: number, y: number) {
    const r = vista.tela.getBoundingClientRect();
    const m = new THREE.Vector2(x - r.left, y - r.top);
    const malhas = vista.grupoSelecionavel.children as THREE.Mesh[];
    const pontosDaAresta = (c: MalhaCorpo, e: number): V3[] => {
      const ini = c.gruposArestas[e * 2], qtd = c.gruposArestas[e * 2 + 1];
      const lista: V3[] = [];
      // A aresta vem em pedaços (pares de pontos): pega o 1º ponto e o fim de cada pedaço.
      for (let i = ini; i < ini + qtd; i += 2) {
        if (i === ini) lista.push([c.arestas[i * 3], c.arestas[i * 3 + 1], c.arestas[i * 3 + 2]]);
        const j = i + 1;
        lista.push([c.arestas[j * 3], c.arestas[j * 3 + 1], c.arestas[j * 3 + 2]]);
      }
      return lista;
    };
    let melhor = GRUDAR_PX;
    let escolhida: V3[] | null = null;
    for (const malha of malhas) {
      const c = malha.userData.corpo as MalhaCorpo;
      for (let e = 0; e < c.gruposArestas.length / 2; e++) {
        const pts = pontosDaAresta(c, e).map((p) => naTela(new THREE.Vector3(...p)));
        for (let i = 0; i + 1 < pts.length; i++) {
          const seg = pts[i + 1].clone().sub(pts[i]);
          const t = THREE.MathUtils.clamp(m.clone().sub(pts[i]).dot(seg) / Math.max(seg.lengthSq(), 1e-9), 0, 1);
          const dd = pts[i].clone().addScaledVector(seg, t).distanceTo(m);
          if (dd < melhor) (melhor = dd), (escolhida = pontosDaAresta(c, e));
        }
      }
    }
    let polilinhas: V3[][] = escolhida ? [escolhida] : [];
    if (!escolhida) {
      raioDoMouse(x, y);
      const acerto = raio.intersectObjects(malhas, false)[0];
      if (!acerto) return acoes.avisar("Clique numa aresta ou face de um corpo.");
      const c = (acerto.object as THREE.Mesh).userData.corpo as MalhaCorpo;
      const pos = (acerto.faceIndex ?? -1) * 3;
      let f = -1;
      for (let k = 0; k < c.gruposFaces.length / 2; k++)
        if (pos >= c.gruposFaces[k * 2] && pos < c.gruposFaces[k * 2 + 1] + c.gruposFaces[k * 2]) f = k;
      if (f < 0) return;
      // Arestas da borda da face: todos os pontos delas são vértices da face.
      const chave = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
      const vertices = new Set<string>();
      for (let i = c.gruposFaces[f * 2]; i < c.gruposFaces[f * 2] + c.gruposFaces[f * 2 + 1]; i++) {
        const v = c.triangulos[i] * 3;
        vertices.add(chave(c.vertices[v], c.vertices[v + 1], c.vertices[v + 2]));
      }
      for (let e = 0; e < c.gruposArestas.length / 2; e++) {
        const pts = pontosDaAresta(c, e);
        if (pts.every((p) => vertices.has(chave(...p)))) polilinhas.push(pts);
      }
    }
    guardar();
    const n = projetarNoEsboco(dados!, polilinhas);
    if (!n) {
      desfazer.pop();
      return acoes.avisar("Nada novo para projetar (já está no esboço, ou a aresta fica em pé em relação a ele).");
    }
    acoes.avisar(`${n} curva(s) projetada(s).`);
    redesenhar();
  }

  // ---- Spline (pontos por onde passa) ----

  let pontosSpline: { pos: P2; id: number | null }[] = [];

  // Cria a spline com os pontos clicados (precisa de pelo menos 2).
  function terminarSpline(fechar = false) {
    const lista = pontosSpline;
    pontosSpline = [];
    if (lista.length < (fechar ? 3 : 2)) return redesenhar();
    guardar();
    const ids = lista.map((p) => p.id ?? criarPonto(p.pos));
    const d = dados!;
    const controle = ferramenta === "splineControle" || undefined;
    d.curvas.push({ id: novoId(d.curvas), tipo: "spline", a: ids[0], b: fechar ? ids[0] : ids[ids.length - 1], internos: ids.slice(1, fechar ? undefined : -1), controle });
    acoes.avisar(fechar ? "Spline fechada criada." : "Spline criada.");
    redesenhar();
  }

  // ---- Formas de cliques em sequência ----

  // Geometria da forma em andamento (para a prévia e para criar). null = ainda não dá.
  function geometriaForma(p3: P2): { pontos: P2[]; fechado: boolean; circulo?: { c: P2; r: number }; arco?: ReturnType<typeof geometriaArco> } | null {
    const p1 = primeiro?.pos, p2 = segundo?.pos;
    if (!p1) return null;
    if (ferramenta === "circulo2") {
      const c: P2 = [(p1[0] + p3[0]) / 2, (p1[1] + p3[1]) / 2];
      const r = Math.hypot(p3[0] - p1[0], p3[1] - p1[1]) / 2;
      return r > 1e-6 ? { pontos: [], fechado: false, circulo: { c, r } } : null;
    }
    if (ferramenta === "linhaMeio") return { pontos: [[2 * p1[0] - p3[0], 2 * p1[1] - p3[1]], p3], fechado: false };
    if (ferramenta === "mesclagem" || ferramenta === "conica") {
      const ctl = controlesCurva(p3, null);
      if (!ctl) return null;
      return { pontos: Array.from({ length: 41 }, (_, i) => pontoBezier(ctl as [P2, P2, P2, P2], i / 40)), fechado: false };
    }
    if (ferramenta === "arcoTangente") {
      const t = tangenteNaPonta(primeiro!.id);
      if (!t) return null;
      // Centro na perpendicular à tangente: |C − fim| = |C − início|.
      const n: P2 = [-t[1], t[0]];
      const e: P2 = [p3[0] - p1[0], p3[1] - p1[1]];
      const den = 2 * (n[0] * e[0] + n[1] * e[1]);
      if (Math.abs(den) < 1e-9) return null;
      const k = (e[0] * e[0] + e[1] * e[1]) / den;
      const c: P2 = [p1[0] + n[0] * k, p1[1] + n[1] * k];
      // Sentido: anti-horário se o centro fica à esquerda da tangente.
      const r = Math.abs(k);
      const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a1 = Math.atan2(p3[1] - c[1], p3[0] - c[0]);
      const ccw = k > 0;
      const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const arco = ccw
        ? { centro: c, raio: r, inicio: a0, sweep: norm(a1 - a0), a: p1, b: p3 }
        : { centro: c, raio: r, inicio: a1, sweep: norm(a0 - a1), a: p3, b: p1 };
      return { pontos: [], fechado: false, arco };
    }
    if (!p2) return null;
    if (ferramenta === "circulo3") {
      const c = centroDe3Pontos(p1, p2, p3);
      return c ? { pontos: [], fechado: false, circulo: { c, r: Math.hypot(p1[0] - c[0], p1[1] - c[1]) } } : null;
    }
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    if (L < 1e-6) return null;
    const u: P2 = [(p2[0] - p1[0]) / L, (p2[1] - p1[1]) / L];
    const n: P2 = [-u[1], u[0]];
    const lado = (p3[0] - p1[0]) * n[0] + (p3[1] - p1[1]) * n[1];
    if (ferramenta === "retangulo3") {
      if (Math.abs(lado) < 1e-6) return null;
      const h: P2 = [n[0] * lado, n[1] * lado];
      return { pontos: [p1, p2, [p2[0] + h[0], p2[1] + h[1]], [p1[0] + h[0], p1[1] + h[1]]], fechado: true };
    }
    // Polígono de aresta: lado p1→p2, o resto vai para o lado do 3º clique.
    const s = lado >= 0 ? 1 : -1;
    const pts: P2[] = [p1, p2];
    let dir = u;
    for (let i = 2; i < lados; i++) {
      const a = (s * 2 * Math.PI) / lados;
      dir = [dir[0] * Math.cos(a) - dir[1] * Math.sin(a), dir[0] * Math.sin(a) + dir[1] * Math.cos(a)];
      const ult = pts[pts.length - 1];
      pts.push([ult[0] + dir[0] * L, ult[1] + dir[1] * L]);
    }
    return { pontos: pts, fechado: true };
  }

  // Direção da curva que chega no ponto (para o arco sair tangente).
  function tangenteNaPonta(id: number | null): P2 | null {
    if (id === null) return null;
    const c = dados!.curvas.find((k) => (k.tipo === "linha" || k.tipo === "arco" || (k.tipo === "spline" && k.a !== k.b)) && (k.a === id || k.b === id));
    if (!c) return null;
    const P = [ponto(id).u, ponto(id).v] as P2;
    if (c.tipo === "spline") {
      // Saindo pela ponta: do 1º controle da Bézier da ponta para a ponta.
      const bs = beziersDaSpline(idsDaCurva(c).map((k) => [ponto(k).u, ponto(k).v] as P2), false, c.controle);
      const b = c.a === id ? bs[0] : bs[bs.length - 1];
      if (!b) return null;
      const q = c.a === id ? (Math.hypot(b[1][0] - P[0], b[1][1] - P[1]) > 1e-9 ? b[1] : b[2]) : Math.hypot(b[2][0] - P[0], b[2][1] - P[1]) > 1e-9 ? b[2] : b[1];
      const L = Math.hypot(P[0] - q[0], P[1] - q[1]);
      return L > 1e-9 ? [(P[0] - q[0]) / L, (P[1] - q[1]) / L] : null;
    }
    if (c.tipo === "linha") {
      const outro = ponto(c.a === id ? c.b : c.a);
      const d: P2 = [P[0] - outro.u, P[1] - outro.v];
      const L = Math.hypot(d[0], d[1]);
      return [d[0] / L, d[1] / L];
    }
    if (c.tipo !== "arco") return null;
    const C = ponto(c.centro);
    const r: P2 = [P[0] - C.u, P[1] - C.v];
    const L = Math.hypot(r[0], r[1]);
    // Arco anti-horário de a para b: chegando em b a direção é +90° do raio; saindo por a, −90°.
    return c.b === id ? [-r[1] / L, r[0] / L] : [r[1] / L, -r[0] / L];
  }

  function cliqueForma(pos: P2, perto: number | null) {
    const d = dados!;
    if (ferramenta === "ponto") {
      guardar();
      criarPonto(pos);
      return redesenhar();
    }
    if (!primeiro) {
      if ((ferramenta === "arcoTangente" || ferramenta === "mesclagem") && !tangenteNaPonta(perto))
        return acoes.avisar(ferramenta === "mesclagem" ? "Comece na ponta de uma linha, arco ou spline." : "Comece na ponta de uma linha ou arco.");
      return (primeiro = { pos, id: perto }), redesenhar();
    }
    const doisCliques = ferramenta === "circulo2" || ferramenta === "linhaMeio" || ferramenta === "arcoTangente" || ferramenta === "mesclagem";
    if (!doisCliques && !segundo) return (segundo = { pos, id: perto }), redesenhar();
    if (ferramenta === "mesclagem" || ferramenta === "conica") return criarCurvaControle(pos, perto);
    const g = geometriaForma(pos);
    if (!g) {
      primeiro = segundo = null;
      return acoes.avisar("Forma inválida (pontos alinhados ou iguais?).");
    }
    guardar();
    const idDe = (p: P2) =>
      [primeiro, segundo, { pos, id: perto }].find((k) => k && k.id !== null && Math.hypot(k.pos[0] - p[0], k.pos[1] - p[1]) < 1e-9)?.id ?? criarPonto(p);
    if (g.circulo) d.curvas.push({ id: novoId(d.curvas), tipo: "circulo", centro: criarPonto(g.circulo.c), raio: g.circulo.r });
    else if (g.arco) {
      const id = novoId(d.curvas);
      d.curvas.push({ id, tipo: "arco", centro: criarPonto(g.arco.centro), a: idDe(g.arco.a), b: idDe(g.arco.b) });
      const outra = d.curvas.find((k) => k.id !== id && (k.tipo === "linha" || k.tipo === "arco") && (k.a === primeiro!.id || k.b === primeiro!.id));
      d.restricoes ??= [];
      if (outra) d.restricoes.push({ id: novoId(d.restricoes), tipo: "tangente", c1: outra.id, c2: id });
    } else {
      const ids = g.pontos.map(idDe);
      const n = g.fechado ? ids.length : ids.length - 1;
      const novas: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = ponto(ids[i]), b = ponto(ids[(i + 1) % ids.length]);
        const restricao = Math.abs(a.v - b.v) < 1e-9 ? "h" : Math.abs(a.u - b.u) < 1e-9 ? "v" : undefined;
        const id = novoId(d.curvas);
        d.curvas.push({ id, tipo: "linha", a: ids[i], b: ids[(i + 1) % ids.length], restricao });
        novas.push(id);
      }
      d.restricoes ??= [];
      if (ferramenta === "retangulo3") {
        d.restricoes.push({ id: novoId(d.restricoes), tipo: "perpendicular", c1: novas[0], c2: novas[1] });
        d.restricoes.push({ id: novoId(d.restricoes), tipo: "paralelo", c1: novas[0], c2: novas[2] });
        d.restricoes.push({ id: novoId(d.restricoes), tipo: "paralelo", c1: novas[1], c2: novas[3] });
      }
      if (ferramenta === "linhaMeio") {
        // Ponto do meio fica no meio da linha (restrição).
        const meio = primeiro!.id ?? criarPonto(primeiro!.pos);
        d.restricoes.push({ id: novoId(d.restricoes), tipo: "pontoMedio", ponto: meio, curva: novas[0] });
      }
    }
    primeiro = segundo = null;
    redesenhar();
  }

  // ---- Curva de mesclagem e cônica (Bézier com 4 pontos de controle) ----

  // Pontos de controle (null = ainda não dá). Mesclagem: sai tangente das duas
  // pontas, com "braços" de 1/3 da distância. Cônica: braços apontando para o
  // vértice com tamanho 4·rho/3 — a Bézier passa pelo ponto do ombro da cônica
  // (exata para rho = 0,5, parábola; nas outras, muito perto).
  function controlesCurva(p3: P2, idFim: number | null): P2[] | null {
    const a = primeiro!.pos;
    if (ferramenta === "mesclagem") {
      const tA = tangenteNaPonta(primeiro!.id);
      const k = Math.hypot(p3[0] - a[0], p3[1] - a[1]) / 3;
      if (!tA || k < 1e-9) return null;
      const p1: P2 = [a[0] + k * tA[0], a[1] + k * tA[1]];
      const tB = tangenteNaPonta(idFim);
      const p2: P2 = tB ? [p3[0] + k * tB[0], p3[1] + k * tB[1]] : [(p1[0] + 2 * p3[0]) / 3, (p1[1] + 2 * p3[1]) / 3];
      return [a, p1, p2, p3];
    }
    const e = segundo?.pos;
    const rho = valoresCopia.rho;
    if (!e || !(rho > 0 && rho < 1)) return null;
    const area = (e[0] - a[0]) * (p3[1] - a[1]) - (e[1] - a[1]) * (p3[0] - a[0]);
    if (Math.abs(area) < 1e-9) return null;
    const k = (4 * rho) / 3;
    return [a, [a[0] + k * (p3[0] - a[0]), a[1] + k * (p3[1] - a[1])], [e[0] + k * (p3[0] - e[0]), e[1] + k * (p3[1] - e[1])], e];
  }

  function criarCurvaControle(pos: P2, perto: number | null) {
    if (ferramenta === "mesclagem" && (!tangenteNaPonta(perto) || perto === primeiro!.id))
      return acoes.avisar("Termine na ponta de outra linha, arco ou spline.");
    const ctl = controlesCurva(pos, perto);
    if (!ctl) {
      primeiro = segundo = null;
      redesenhar();
      return acoes.avisar(ferramenta === "conica" ? "Cônica inválida (pontos alinhados ou Rho fora de 0 a 1)." : "Mesclagem inválida.");
    }
    guardar();
    const d = dados!;
    const a = primeiro!.id ?? criarPonto(ctl[0]);
    const b = ferramenta === "mesclagem" ? perto! : segundo!.id ?? criarPonto(ctl[3]);
    d.curvas.push({ id: novoId(d.curvas), tipo: "spline", a, b, internos: [criarPonto(ctl[1]), criarPonto(ctl[2])], controle: true });
    acoes.avisar(ferramenta === "conica" ? "Curva cônica criada." : "Curva de mesclagem criada.");
    primeiro = segundo = null;
    redesenhar();
  }

  // ---- Intersecção: corte de um corpo pelo plano do esboço ----

  function cliqueIntersecao(x: number, y: number) {
    raioDoMouse(x, y);
    const acerto = raio.intersectObjects(vista.grupoSelecionavel.children, false)[0];
    if (!acerto) return acoes.avisar("Clique num corpo.");
    const c = (acerto.object as THREE.Mesh).userData.corpo as MalhaCorpo;
    if (!acoes.secao) return;
    acoes.avisar(`Cortando ${c.nome} pelo plano do esboço...`);
    acoes.secao(c.nome, dados!.plano).then(
      (polilinhas) => {
        if (!dados) return;
        guardar();
        const n = projetarNoEsboco(dados, polilinhas);
        if (!n) {
          desfazer.pop();
          return acoes.avisar(polilinhas.length ? "Esse corte já está no esboço." : "O plano do esboço não corta esse corpo.");
        }
        acoes.avisar(`Intersecção: ${n} curva(s) nova(s).`);
        redesenhar();
      },
      (e) => acoes.avisar(e instanceof Error ? e.message : String(e)),
    );
  }

  // ---- Elipse ----

  // Distância de p até a reta do eixo (centro → ponta): é a medida do outro eixo.
  function distanciaAoEixo(c: P2, ponta: P2, p: P2): number {
    const L = Math.hypot(ponta[0] - c[0], ponta[1] - c[1]) || 1;
    return Math.abs(((p[0] - c[0]) * (ponta[1] - c[1]) - (p[1] - c[1]) * (ponta[0] - c[0])) / L);
  }

  function criarElipse(p3: P2) {
    const c = primeiro!, ponta = segundo!;
    const menor = distanciaAoEixo(c.pos, ponta.pos, p3);
    primeiro = segundo = null;
    if (menor < 1e-6 || Math.hypot(ponta.pos[0] - c.pos[0], ponta.pos[1] - c.pos[1]) < 1e-6)
      return acoes.avisar("Elipse inválida (um dos eixos ficou com medida zero).");
    guardar();
    const d = dados!;
    d.curvas.push({ id: novoId(d.curvas), tipo: "elipse", centro: c.id ?? criarPonto(c.pos), a: ponta.id ?? criarPonto(ponta.pos), menor });
    redesenhar();
  }

  // ---- Fenda em arco: dois arcos com o mesmo centro e duas pontas redondas ----

  function geometriaFenda(p4: P2) {
    const g = geometriaArco(primeiro!.pos, segundo!.pos, terceiro!.pos);
    if (!g || g.sweep < 1e-6) return null;
    const R = g.raio;
    const r = Math.abs(Math.hypot(p4[0] - g.centro[0], p4[1] - g.centro[1]) - R);
    if (r < 1e-6 || r >= R) return null;
    const t0 = g.inicio, t1 = g.inicio + g.sweep;
    const em = (raio: number, t: number): P2 => [g.centro[0] + raio * Math.cos(t), g.centro[1] + raio * Math.sin(t)];
    const E0 = em(R, t0), E1 = em(R, t1);
    return {
      g, r, E0, E1,
      O0: em(R + r, t0), O1: em(R + r, t1), I0: em(R - r, t0), I1: em(R - r, t1),
      contorno: [
        amostrarArco(g.centro, R + r, t0, g.sweep),
        amostrarArco(E1, r, t1, Math.PI),
        amostrarArco(g.centro, R - r, t0, g.sweep),
        amostrarArco(E0, r, t0 + Math.PI, Math.PI),
      ],
    };
  }

  function criarFenda(p4: P2) {
    const f = geometriaFenda(p4);
    const centroClicado = ferramenta === "fendaArcoCentro" ? primeiro!.id : null;
    primeiro = segundo = terceiro = null;
    if (!f) return acoes.avisar("Fenda inválida (largura zero ou maior que o raio?).");
    guardar();
    const d = dados!;
    const C = centroClicado ?? criarPonto(f.g.centro);
    const [e0, e1, o0, o1, i0, i1] = [f.E0, f.E1, f.O0, f.O1, f.I0, f.I1].map(criarPonto);
    const ids = [0, 1, 2, 3].map((k) => novoId(d.curvas) + k);
    d.curvas.push(
      { id: ids[0], tipo: "arco", centro: C, a: o0, b: o1 }, // de fora
      { id: ids[1], tipo: "arco", centro: e1, a: o1, b: i1 }, // ponta do fim
      { id: ids[2], tipo: "arco", centro: C, a: i0, b: i1 }, // de dentro
      { id: ids[3], tipo: "arco", centro: e0, a: i0, b: o0 }, // ponta do início
    );
    d.restricoes ??= [];
    // Ponta e arco de fora: tangentes por dentro; ponta e arco de dentro: por fora.
    for (const [ponta, arco, interna] of [[ids[1], ids[0], true], [ids[1], ids[2], false], [ids[3], ids[0], true], [ids[3], ids[2], false]] as const)
      d.restricoes.push({ id: novoId(d.restricoes), tipo: "tangente", c1: ponta, c2: arco, ...(interna ? { interna: true } : {}) });
    acoes.avisar(`Fenda em arco criada (largura ${(2 * f.r).toFixed(2)}).`);
    redesenhar();
  }

  // ---- Ranhura (slot): duas linhas e dois arcos tangentes ----

  function geometriaRanhura(p1: P2, p2: P2, p3: P2) {
    let c1 = p1, c2 = p2;
    if (ferramenta === "ranhuraPontoCentral") c1 = [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
    const L = Math.hypot(c2[0] - c1[0], c2[1] - c1[1]);
    if (L < 1e-6) return null;
    const u: P2 = [(c2[0] - c1[0]) / L, (c2[1] - c1[1]) / L];
    const n: P2 = [-u[1], u[0]];
    const r = Math.abs((p3[0] - c1[0]) * n[0] + (p3[1] - c1[1]) * n[1]);
    if (r < 1e-6) return null;
    if (ferramenta === "ranhuraGeral") {
      // As pontas clicadas são o fim da ranhura: os centros ficam um raio para dentro.
      if (L <= 2 * r) return null;
      c1 = [c1[0] + u[0] * r, c1[1] + u[1] * r];
      c2 = [c2[0] - u[0] * r, c2[1] - u[1] * r];
    }
    const mais = (c: P2, k: number): P2 => [c[0] + n[0] * r * k, c[1] + n[1] * r * k];
    const A1 = mais(c1, 1), A2 = mais(c1, -1), B1 = mais(c2, 1), B2 = mais(c2, -1);
    const ang = Math.atan2(u[1], u[0]);
    return {
      c1, c2, r, u, A1, A2, B1, B2,
      curvas: [[A1, B1], amostrarArco(c2, r, ang - Math.PI / 2, Math.PI), [B2, A2], amostrarArco(c1, r, ang + Math.PI / 2, Math.PI)] as P2[][],
    };
  }

  function criarRanhura(p3: P2) {
    const g = geometriaRanhura(primeiro!.pos, segundo!.pos, p3);
    if (!g) {
      primeiro = segundo = null;
      return acoes.avisar("Ranhura inválida (largura zero ou maior que o comprimento?).");
    }
    guardar();
    const d = dados!;
    // Centros: reaproveita o ponto clicado quando ele é o centro (centro a centro).
    const centro1 = ferramenta === "ranhuraCentros" && primeiro!.id !== null ? primeiro!.id : criarPonto(g.c1);
    const centro2 = ferramenta !== "ranhuraGeral" && segundo!.id !== null ? segundo!.id : criarPonto(g.c2);
    const [a1, a2, b1, b2] = [g.A1, g.A2, g.B1, g.B2].map(criarPonto);
    const reta = Math.abs(g.u[1]) < 1e-9 ? "h" : Math.abs(g.u[0]) < 1e-9 ? "v" : undefined;
    const ids = [1, 2, 3, 4].map((k) => novoId(d.curvas) + k - 1);
    d.curvas.push(
      { id: ids[0], tipo: "linha", a: a1, b: b1, restricao: reta },
      { id: ids[1], tipo: "arco", centro: centro2, a: b2, b: b1 },
      { id: ids[2], tipo: "linha", a: b2, b: a2, restricao: reta },
      { id: ids[3], tipo: "arco", centro: centro1, a: a1, b: a2 },
    );
    d.restricoes ??= [];
    for (const [l, a] of [[ids[0], ids[1]], [ids[0], ids[3]], [ids[2], ids[1]], [ids[2], ids[3]]])
      d.restricoes.push({ id: novoId(d.restricoes), tipo: "tangente", c1: l, c2: a });
    primeiro = segundo = null;
    acoes.avisar(`Ranhura criada (largura ${(2 * g.r).toFixed(2)}).`);
    redesenhar();
  }

  // ---- Deslocamento, Espelhar e Padrões (painel no alto da tela) ----

  let marcadas: number[] = []; // curvas escolhidas para espelhar/padrão
  let etapaCopia: "curvas" | "eixo" | "centro" = "curvas";
  let centroPadrao = 0; // ponto do centro do padrão circular (0 = origem)
  const valoresCopia: Record<string, number> = { distancia: 5, nx: 3, dx: 20, ny: 1, dy: 20, n: 6, angulo: 360, raio: 3, d1: 3, d2: 5, anguloChanfro: 45, fator: 2, altura: 10, rho: 0.5 };
  let textoDigitado = "HAXYS";
  let pistas: P2[] = []; // onde a pessoa clicou nas linhas (círculos por tangentes)

  const painelCopia = document.createElement("div");
  painelCopia.className = "caixa-lados painel-copia";
  painelCopia.hidden = true;
  sobreposicao.appendChild(painelCopia);

  function montarPainel() {
    const f = ferramenta;
    if (!ehCopia(f) && f !== "conica") return void (painelCopia.hidden = true);
    painelCopia.hidden = false;
    const campo = (chave: string, rotulo: string, passo = "1") =>
      `<label>${rotulo} <input data-chave="${chave}" type="number" step="${passo}" value="${valoresCopia[chave]}"></label>`;
    const qtd = marcadas.length ? `${marcadas.length} curva(s)` : "nenhuma curva";
    if (f === "conica") painelCopia.innerHTML = campo("rho", "Rho (0 a 1)", "0.05");
    else if (f === "deslocamento") painelCopia.innerHTML = campo("distancia", "Distância (+ fora / − dentro)", "0.5");
    else if (f === "filete") painelCopia.innerHTML = campo("raio", "Raio", "0.5");
    else if (f === "circuloTan2") painelCopia.innerHTML = `<span>${qtd}</span>` + campo("raio", "Raio", "0.5");
    else if (f === "circuloTan3") painelCopia.innerHTML = `<span>${qtd} de 3</span>`;
    else if (f === "estender" || f === "quebrar") painelCopia.innerHTML = `<span>${NOMES[f]}: clique na curva</span>`;
    else if (f === "texto")
      painelCopia.innerHTML = `<label>Texto <input data-texto type="text" value="${textoDigitado.replace(/"/g, "&quot;")}" style="width:140px"></label>` + campo("altura", "Altura", "1");
    else if (f === "escalaEsboco") {
      const nomeCentro = centroPadrao === 0 ? "origem" : `ponto ${centroPadrao}`;
      painelCopia.innerHTML =
        etapaCopia === "centro"
          ? `<span>Clique no ponto do centro</span><button data-acao="voltar">Voltar</button>`
          : `<span>${qtd}</span>${campo("fator", "Fator", "0.1")}<button data-acao="centro">Centro: ${nomeCentro}</button><button data-acao="aplicar">Aplicar</button>`;
    }
    else if (f === "chanfroIgual") painelCopia.innerHTML = campo("d1", "Distância", "0.5");
    else if (f === "chanfroDuas") painelCopia.innerHTML = campo("d1", "Distância 1", "0.5") + campo("d2", "Distância 2", "0.5");
    else if (f === "chanfroAngulo") painelCopia.innerHTML = campo("d1", "Distância", "0.5") + campo("anguloChanfro", "Ângulo", "5");
    else if (f === "espelhar")
      painelCopia.innerHTML =
        etapaCopia === "eixo"
          ? `<span>Agora clique na linha de espelho</span><button data-acao="voltar">Voltar</button>`
          : `<span>${qtd}</span><button data-acao="eixo">Escolher linha</button>`;
    else if (f === "padraoRetangular")
      painelCopia.innerHTML = `<span>${qtd}</span>${campo("nx", "Qtd. X")}${campo("dx", "Dist. X", "0.5")}${campo("ny", "Qtd. Y")}${campo("dy", "Dist. Y", "0.5")}<button data-acao="aplicar">Aplicar</button>`;
    else {
      const nomeCentro = centroPadrao === 0 ? "origem" : `ponto ${centroPadrao}`;
      painelCopia.innerHTML =
        etapaCopia === "centro"
          ? `<span>Clique no ponto do centro</span><button data-acao="voltar">Voltar</button>`
          : `<span>${qtd}</span>${campo("n", "Quantidade")}${campo("angulo", "Ângulo", "15")}<button data-acao="centro">Centro: ${nomeCentro}</button><button data-acao="aplicar">Aplicar</button>`;
    }
    const campoTexto = painelCopia.querySelector<HTMLInputElement>("input[data-texto]");
    campoTexto?.addEventListener("input", () => (textoDigitado = campoTexto.value));
    for (const e of painelCopia.querySelectorAll<HTMLInputElement>("input")) {
      e.addEventListener("keydown", (ev) => ev.stopPropagation());
      if (e.dataset.texto !== undefined) continue;
      e.addEventListener("input", () => {
        const v = Number(e.value);
        if (Number.isFinite(v)) valoresCopia[e.dataset.chave!] = v;
      });
    }
    for (const b of painelCopia.querySelectorAll<HTMLButtonElement>("button"))
      b.addEventListener("click", () => acaoPainel(b.dataset.acao!));
  }

  // Faz a mudança nos dados; se der erro, desfaz e avisa.
  function tentarMudar(fn: () => number[], texto: string) {
    guardar();
    try {
      const n = fn().length;
      acoes.avisar(`${texto}: ${n} curva(s) nova(s).`);
    } catch (e) {
      dados = JSON.parse(desfazer.pop()!);
      acoes.avisar(e instanceof Error ? e.message : String(e));
    }
    redesenhar();
  }

  function acaoPainel(acao: string) {
    const d = dados;
    if (!d) return;
    if (acao === "eixo") {
      if (!marcadas.length) return acoes.avisar("Clique antes nas curvas a espelhar.");
      etapaCopia = "eixo";
    } else if (acao === "centro") etapaCopia = "centro";
    else if (acao === "voltar") etapaCopia = "curvas";
    else if (acao === "aplicar") {
      if (!marcadas.length) return acoes.avisar("Clique antes nas curvas.");
      const ids = [...marcadas];
      const v = valoresCopia;
      if (ferramenta === "escalaEsboco") tentarMudar(() => escalarCurvas(d, ids, centroPadrao, v.fator), "Escala");
      else if (ferramenta === "padraoRetangular")
        tentarMudar(() => padraoRetangular(d, ids, Math.round(v.nx), v.dx, Math.round(v.ny), v.dy), "Padrão retangular");
      else tentarMudar(() => padraoCircular(dados!, ids, centroPadrao, Math.round(v.n), v.angulo), "Padrão circular");
      marcadas = [];
    }
    montarPainel();
    redesenhar();
  }

  // Arredondamento/chanfro: o canto é o ponto clicado ou a ponta mais perto da linha clicada.
  function cliqueCanto(x: number, y: number) {
    const d = dados!;
    let canto = pontoPerto(x, y);
    let primeira: number | undefined;
    if (canto === null) {
      const c = curvaPerto(x, y);
      const linha = c === null ? null : d.curvas.find((k) => k.id === c);
      const clique = pontoNoPlano(x, y);
      if (!linha || linha.tipo !== "linha" || !clique) return acoes.avisar("Clique no canto ou numa linha perto dele.");
      const perto = (id: number) => Math.hypot(ponto(id).u - clique[0], ponto(id).v - clique[1]);
      canto = perto(linha.a) <= perto(linha.b) ? linha.a : linha.b;
      primeira = linha.id;
    }
    const v = valoresCopia;
    const id = canto;
    if (ferramenta === "filete") return tentarMudar(() => arredondarCanto(dados!, id, v.raio), "Arredondamento");
    const tipo = ferramenta === "chanfroDuas" ? "duas" : ferramenta === "chanfroAngulo" ? "angulo" : "igual";
    tentarMudar(() => chanfrarCanto(dados!, id, { tipo, d1: v.d1, d2: v.d2, angulo: v.anguloChanfro, primeira }), "Chanfro");
  }

  function cliqueCopia(x: number, y: number) {
    if (ferramenta === "texto") {
      const p = pontoNoPlano(x, y);
      if (!p) return;
      return tentarMudar(() => Array.from({ length: escreverTexto(dados!, textoDigitado, p, valoresCopia.altura) }), "Texto");
    }
    if (ferramenta === "estender" || ferramenta === "quebrar") {
      const c = curvaPerto(x, y);
      const p = pontoNoPlano(x, y);
      if (c === null || !p) return acoes.avisar("Clique em cima de uma curva.");
      return tentarMudar(() => (ferramenta === "estender" ? estenderLinha(dados!, c, p) : quebrarCurva(dados!, c)), NOMES[ferramenta!]);
    }
    if (ferramenta === "circuloTan2" || ferramenta === "circuloTan3") {
      const c = curvaPerto(x, y);
      const p = pontoNoPlano(x, y);
      if (c === null || !p || dados!.curvas.find((k) => k.id === c)?.tipo !== "linha") return acoes.avisar("Clique numa linha reta.");
      if (marcadas.includes(c)) return;
      marcadas.push(c);
      pistas.push(p);
      const precisa = ferramenta === "circuloTan2" ? 2 : 3;
      if (marcadas.length === precisa) {
        const ls = [...marcadas];
        const pista: P2 = [pistas.reduce((s, q) => s + q[0], 0) / pistas.length, pistas.reduce((s, q) => s + q[1], 0) / pistas.length];
        marcadas = [];
        pistas = [];
        tentarMudar(
          () => (precisa === 2 ? circuloDuasTangentes(dados!, ls[0], ls[1], valoresCopia.raio, pista) : circuloTresTangentes(dados!, ls as [number, number, number], pista)),
          NOMES[ferramenta!],
        );
      }
      montarPainel();
      return redesenhar();
    }
    if ((ferramenta === "padraoCircular" || ferramenta === "escalaEsboco") && etapaCopia === "centro") {
      const p = pontoPerto(x, y);
      if (p === null) return acoes.avisar("Clique em cima de um ponto do esboço.");
      centroPadrao = p;
      etapaCopia = "curvas";
      return montarPainel();
    }
    if (ferramenta === "filete" || ferramenta?.startsWith("chanfro")) return cliqueCanto(x, y);
    const curva = curvaPerto(x, y);
    if (curva === null) return acoes.avisar("Clique em cima de uma curva.");
    if (ferramenta === "deslocamento")
      return tentarMudar(() => deslocar(dados!, curva, valoresCopia.distancia), "Deslocamento");
    if (ferramenta === "espelhar" && etapaCopia === "eixo") {
      const ids = [...marcadas];
      tentarMudar(() => espelhar(dados!, ids, curva), "Espelhar");
      marcadas = [];
      etapaCopia = "curvas";
      return montarPainel();
    }
    const k = marcadas.indexOf(curva);
    if (k >= 0) marcadas.splice(k, 1);
    else marcadas.push(curva);
    montarPainel();
    redesenhar();
  }

  function cliqueDesenhando(x: number, y: number, forcado?: P2) {
    const d = dados!;
    if (ferramenta === "projetar" && !ferramentaRestricao) return cliqueProjetar(x, y);
    if (ehCopia(ferramenta) && !ferramentaRestricao) return cliqueCopia(x, y);
    const perto = forcado ? null : pontoPerto(x, y);
    const livre = forcado ?? pontoNoPlano(x, y);
    if (!livre && perto === null) return;
    const pos: P2 = perto !== null ? [ponto(perto).u, ponto(perto).v] : livre!;

    if (ferramentaRestricao) return cliqueRestricao(x, y);
    if (ferramenta === "intersecao" && !ferramentaRestricao) return cliqueIntersecao(x, y);
    if (ehSpline(ferramenta) && !ferramentaRestricao) {
      // Clicar no 1º ponto fecha; clicar de novo no último termina.
      if (pontosSpline.length >= 3 && perto !== null && perto === pontosSpline[0].id) return terminarSpline(true);
      if (pontosSpline.length >= 3 && Math.hypot(pos[0] - pontosSpline[0].pos[0], pos[1] - pontosSpline[0].pos[1]) < 1e-9) return terminarSpline(true);
      const ultimo = pontosSpline[pontosSpline.length - 1];
      if (ultimo && Math.hypot(pos[0] - ultimo.pos[0], pos[1] - ultimo.pos[1]) < 1e-6) return terminarSpline();
      // O 1º ponto vira ponto do esboço já agora (para poder clicar nele e fechar).
      const id = perto ?? (pontosSpline.length === 0 ? (guardar(), criarPonto(pos)) : null);
      pontosSpline.push({ pos, id });
      return redesenhar();
    }
    if (ehFormaClique(ferramenta)) return cliqueForma(pos, perto);
    if (ferramenta === "elipse") {
      if (!primeiro) return (primeiro = { pos, id: perto }), redesenhar();
      if (!segundo) return (segundo = { pos, id: perto }), redesenhar();
      return criarElipse(pos);
    }
    if (ehFenda(ferramenta)) {
      if (!primeiro) return (primeiro = { pos, id: perto }), redesenhar();
      if (!segundo) return (segundo = { pos, id: perto }), redesenhar();
      if (!terceiro) {
        if (!geometriaArco(primeiro.pos, segundo.pos, pos)) return acoes.avisar("Arco inválido (pontos alinhados?).");
        return (terceiro = { pos, id: perto }), redesenhar();
      }
      return criarFenda(pos);
    }
    if (ehRanhura(ferramenta) && !ferramentaRestricao) {
      if (!primeiro) return (primeiro = { pos, id: perto }), redesenhar();
      if (!segundo) return (segundo = { pos, id: perto }), redesenhar();
      return criarRanhura(pos);
    }
    if (ferramenta === null) {
      curvaSelecionada = curvaPerto(x, y);
      simboloSelecionado = null;
      return redesenhar();
    }
    if (ferramenta === "recortar") {
      const curva = curvaPerto(x, y);
      if (curva === null || !livre) return acoes.avisar("Clique em cima de uma curva.");
      const r = recortar(d, curva, livre);
      if (!r) return;
      guardar();
      dados = r.novo;
      recortePrevio = null;
      return redesenhar();
    }
    if (ferramenta === "arco3" || ferramenta === "arcoCentro") {
      if (!primeiro) return (primeiro = { pos, id: perto }), redesenhar();
      if (!segundo) return (segundo = { pos, id: perto }), redesenhar();
      const g = geometriaArco(primeiro.pos, segundo.pos, pos);
      if (!g || g.sweep < 1e-6) {
        primeiro = segundo = null;
        return acoes.avisar("Arco inválido (pontos alinhados?).");
      }
      guardar();
      // Reaproveita os pontos clicados que grudaram em pontos existentes.
      const idDe = (p: P2) =>
        [primeiro, segundo, { pos, id: perto }].find((k) => k && k.id !== null && k.pos[0] === p[0] && k.pos[1] === p[1])?.id ??
        criarPonto(p);
      const centro = ferramenta === "arcoCentro" ? (primeiro.id ?? criarPonto(primeiro.pos)) : criarPonto(g.centro);
      d.curvas.push({ id: novoId(d.curvas), tipo: "arco", centro, a: idDe(g.a), b: idDe(g.b) });
      primeiro = segundo = null;
      return redesenhar();
    }
    if (ferramenta === "poligonoInscrito" || ferramenta === "poligonoCircunscrito") {
      if (!primeiro) return (primeiro = { pos, id: perto }), redesenhar();
      if (Math.hypot(pos[0] - primeiro.pos[0], pos[1] - primeiro.pos[1]) < 1e-6) return;
      guardar();
      const ids = verticesPoligono(primeiro.pos, pos).map(criarPonto);
      for (let i = 0; i < ids.length; i++) {
        const a = ponto(ids[i]), b = ponto(ids[(i + 1) % ids.length]);
        // Lado reto na horizontal/vertical ganha a restrição, como no Fusion.
        const restricao = Math.abs(a.v - b.v) < 1e-9 ? "h" : Math.abs(a.u - b.u) < 1e-9 ? "v" : undefined;
        d.curvas.push({ id: novoId(d.curvas), tipo: "linha", a: ids[i], b: ids[(i + 1) % ids.length], restricao });
      }
      primeiro = null;
      return redesenhar();
    }
    if (ferramenta === "cota") return cliqueCota(x, y);
    if (ferramenta === "linha") {
      if (ultimoPonto === null) {
        guardar();
        ultimoPonto = perto ?? criarPonto(pos);
        return redesenhar();
      }
      const de = ponto(ultimoPonto);
      let restricao: "h" | "v" | undefined;
      let fim = perto;
      if (fim === null) {
        const r = endireitar([de.u, de.v], pos);
        restricao = r.restricao;
        fim = criarPonto(r.pos);
      } else {
        const r = endireitar([de.u, de.v], pos);
        if (r.pos[0] === pos[0] && r.pos[1] === pos[1]) restricao = r.restricao;
      }
      if (fim === ultimoPonto) return (ultimoPonto = null), redesenhar();
      guardar();
      const fechou = d.curvas.some((c) => c.tipo !== "circulo" && c.tipo !== "elipse" && (c.a === fim || c.b === fim));
      d.curvas.push({ id: novoId(d.curvas), tipo: "linha", a: ultimoPonto, b: fim, restricao });
      ultimoPonto = fechou ? null : fim; // fechou um laço: termina a cadeia
      return redesenhar();
    }
    // Retângulo e círculo: dois cliques.
    if (!primeiro) {
      primeiro = { pos, id: perto };
      return redesenhar();
    }
    guardar();
    if (ferramenta === "circulo") {
      const r = Math.hypot(pos[0] - primeiro.pos[0], pos[1] - primeiro.pos[1]);
      if (r > 1e-6) {
        const centro = primeiro.id ?? criarPonto(primeiro.pos);
        d.curvas.push({ id: novoId(d.curvas), tipo: "circulo", centro, raio: r });
      }
    } else {
      const [a, b] = cantos(primeiro.pos, pos);
      if (Math.abs(b[0] - a[0]) > 1e-6 && Math.abs(b[1] - a[1]) > 1e-6) {
        const ids = [
          ferramenta === "retangulo" && primeiro.id !== null ? primeiro.id : criarPonto(a),
          criarPonto([b[0], a[1]]),
          perto ?? criarPonto(b),
          criarPonto([a[0], b[1]]),
        ];
        const restr: ("h" | "v")[] = ["h", "v", "h", "v"];
        for (let i = 0; i < 4; i++) {
          const linha: CurvaEsboco = { id: novoId(d.curvas), tipo: "linha", a: ids[i], b: ids[(i + 1) % 4], restricao: restr[i] };
          d.curvas.push(linha);
        }
      }
    }
    primeiro = null;
    redesenhar();
  }

  let inicio: { x: number; y: number } | null = null;
  vista.tela.addEventListener("pointerdown", (e) => {
    inicio = e.button === 0 && etapa !== "parado" ? { x: e.clientX, y: e.clientY } : null;
  });
  vista.tela.addEventListener("pointerup", (e) => {
    if (!inicio || e.button !== 0 || vista.modoAtual() !== "selecionar") return;
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 4) return;
    if (etapa === "plano") {
      const sob = planoSob(e.clientX, e.clientY);
      if (sob) comecarNoPlano(sob.plano);
      else acoes.avisar("Clique num plano da origem ou numa face plana.");
    } else if (etapa === "desenhando") cliqueDesenhando(e.clientX, e.clientY);
  });
  let sobre: THREE.Mesh | null = null;
  vista.tela.addEventListener("pointermove", (e) => {
    if (etapa === "plano") {
      const sob = planoSob(e.clientX, e.clientY);
      if (sobre) sobre.material = MAT_PLANO;
      sobre = sob?.malha ?? null;
      if (sobre) sobre.material = MAT_PLANO_SOBRE;
    } else if (etapa === "desenhando" && dados) {
      const perto = pontoPerto(e.clientX, e.clientY);
      let pos = perto !== null ? ([ponto(perto).u, ponto(perto).v] as P2) : pontoNoPlano(e.clientX, e.clientY);
      if (pos && perto === null && ferramenta === "linha" && ultimoPonto !== null) {
        const de = ponto(ultimoPonto);
        pos = endireitar([de.u, de.v], pos).pos;
      }
      cursorBruto = pos;
      cursor = pos ? comMedidas(pos) : pos;
      atualizarCaixaMedidas(e.clientX, e.clientY);
      recortePrevio = null;
      if (ferramenta === "recortar") {
        const curva = curvaPerto(e.clientX, e.clientY);
        const livre = pontoNoPlano(e.clientX, e.clientY);
        if (curva !== null && livre) recortePrevio = recortar(dados, curva, livre)?.removido ?? null;
      }
      vista.tela.style.cursor = perto !== null ? "pointer" : ferramenta ? "crosshair" : "default";
      desenharPrevia();
    }
  });

  // ---- Digitar a medida enquanto desenha (como no Fusion) ----
  // Linha: comprimento e ângulo. Retângulo: largura e altura. Círculo: diâmetro.
  // Digite um número a qualquer momento: ele vai para o 1º campo; Tab passa para o
  // próximo; Enter cria com essas medidas (e já põe a cota); Esc volta ao mouse.

  let cursorBruto: P2 | null = null;
  const travado: Record<string, number> = {}; // campos que a pessoa digitou

  interface CampoMedida { chave: string; rotulo: string; unidade: string; valor: number }

  function camposAtuais(alvo: P2 | null): CampoMedida[] {
    if (!alvo || !dados) return [];
    if (ferramenta === "linha" && ultimoPonto !== null) {
      const a = ponto(ultimoPonto);
      return [
        { chave: "comprimento", rotulo: "Comprimento", unidade: "mm", valor: Math.hypot(alvo[0] - a.u, alvo[1] - a.v) },
        { chave: "angulo", rotulo: "Ângulo", unidade: "°", valor: (Math.atan2(alvo[1] - a.v, alvo[0] - a.u) * 180) / Math.PI },
      ];
    }
    if (primeiro && (ferramenta === "retangulo" || ferramenta === "retanguloCentro")) {
      const k = ferramenta === "retanguloCentro" ? 2 : 1;
      return [
        { chave: "largura", rotulo: "Largura", unidade: "mm", valor: Math.abs(alvo[0] - primeiro.pos[0]) * k },
        { chave: "altura", rotulo: "Altura", unidade: "mm", valor: Math.abs(alvo[1] - primeiro.pos[1]) * k },
      ];
    }
    if (primeiro && ferramenta === "circulo") {
      return [{ chave: "diametro", rotulo: "Diâmetro", unidade: "mm", valor: 2 * Math.hypot(alvo[0] - primeiro.pos[0], alvo[1] - primeiro.pos[1]) }];
    }
    return [];
  }

  // Posição final usando o que foi digitado; o resto vem do mouse.
  function comMedidas(bruto: P2): P2 {
    if (!Object.keys(travado).length || !dados) return bruto;
    if (ferramenta === "linha" && ultimoPonto !== null) {
      const a = ponto(ultimoPonto);
      const comp = travado.comprimento ?? Math.hypot(bruto[0] - a.u, bruto[1] - a.v);
      const ang = travado.angulo !== undefined ? (travado.angulo * Math.PI) / 180 : Math.atan2(bruto[1] - a.v, bruto[0] - a.u);
      return [a.u + comp * Math.cos(ang), a.v + comp * Math.sin(ang)];
    }
    if (primeiro && (ferramenta === "retangulo" || ferramenta === "retanguloCentro")) {
      const k = ferramenta === "retanguloCentro" ? 2 : 1;
      const sx = Math.sign(bruto[0] - primeiro.pos[0]) || 1, sy = Math.sign(bruto[1] - primeiro.pos[1]) || 1;
      const w = travado.largura !== undefined ? travado.largura / k : Math.abs(bruto[0] - primeiro.pos[0]);
      const h = travado.altura !== undefined ? travado.altura / k : Math.abs(bruto[1] - primeiro.pos[1]);
      return [primeiro.pos[0] + sx * w, primeiro.pos[1] + sy * h];
    }
    if (primeiro && ferramenta === "circulo" && travado.diametro !== undefined) {
      const ang = Math.atan2(bruto[1] - primeiro.pos[1], bruto[0] - primeiro.pos[0]) || 0;
      const r = travado.diametro / 2;
      return [primeiro.pos[0] + r * Math.cos(ang), primeiro.pos[1] + r * Math.sin(ang)];
    }
    return bruto;
  }

  const caixaMedidas = document.createElement("div");
  caixaMedidas.className = "caixa-medidas";
  caixaMedidas.hidden = true;
  sobreposicao.appendChild(caixaMedidas);
  let chavesNaCaixa = "";

  function atualizarCaixaMedidas(mx?: number, my?: number) {
    const campos = camposAtuais(cursor);
    if (!campos.length) {
      caixaMedidas.hidden = true;
      chavesNaCaixa = "";
      return;
    }
    const chaves = campos.map((c) => c.chave).join(",");
    if (chaves !== chavesNaCaixa) {
      chavesNaCaixa = chaves;
      caixaMedidas.innerHTML = campos
        .map((c) => `<label>${c.rotulo} <input type="number" step="any" data-chave="${c.chave}"> ${c.unidade}</label>`)
        .join("");
      caixaMedidas.querySelectorAll("input").forEach((entrada, i, todas) => {
        entrada.addEventListener("input", () => {
          const v = Number(entrada.value);
          if (entrada.value !== "" && Number.isFinite(v)) travado[entrada.dataset.chave!] = v;
          else delete travado[entrada.dataset.chave!];
          if (cursorBruto) cursor = comMedidas(cursorBruto);
          desenharPrevia();
        });
        entrada.addEventListener("keydown", (ev) => {
          ev.stopPropagation();
          if (ev.key === "Tab") {
            ev.preventDefault();
            const prox = todas[(i + (ev.shiftKey ? todas.length - 1 : 1)) % todas.length];
            prox.focus();
            prox.select();
          } else if (ev.key === "Enter") {
            ev.preventDefault();
            confirmarMedidas();
          } else if (ev.key === "Escape") {
            for (const k of Object.keys(travado)) delete travado[k];
            entrada.blur();
            if (cursorBruto) cursor = cursorBruto;
            desenharPrevia();
          }
        });
      });
    }
    // Valores ao vivo nos campos que a pessoa não está digitando.
    for (const c of campos) {
      const entrada = caixaMedidas.querySelector<HTMLInputElement>(`input[data-chave="${c.chave}"]`)!;
      if (document.activeElement !== entrada && travado[c.chave] === undefined)
        entrada.value = c.valor.toFixed(c.unidade === "°" ? 1 : 2);
    }
    caixaMedidas.hidden = false;
    if (mx !== undefined && my !== undefined) {
      const r = sobreposicao.getBoundingClientRect();
      caixaMedidas.style.left = `${mx - r.left + 18}px`;
      caixaMedidas.style.top = `${my - r.top + 18}px`;
    }
  }

  function comecarDigitacao(tecla: string): boolean {
    if (caixaMedidas.hidden) return false;
    const primeiraLivre = caixaMedidas.querySelector<HTMLInputElement>("input");
    if (!primeiraLivre) return false;
    primeiraLivre.focus();
    primeiraLivre.value = tecla;
    primeiraLivre.dispatchEvent(new Event("input"));
    return true;
  }

  function confirmarMedidas() {
    if (!cursor || !dados) return;
    const ferramentaAntes = ferramenta;
    const antes = dados.curvas.reduce((m, c) => Math.max(m, c.id), 0);
    const medidas = { ...travado };
    for (const k of Object.keys(travado)) delete travado[k];
    (document.activeElement as HTMLElement | null)?.blur();
    cliqueDesenhando(0, 0, cursor);
    // As medidas digitadas viram cotas (como no Fusion).
    const novas = dados.curvas.filter((c) => c.id > antes);
    const cotar = (curva: number | undefined, valor: number | undefined) => {
      if (curva === undefined || valor === undefined) return;
      dados!.cotas.push({ id: dados!.cotas.reduce((m, k) => Math.max(m, k.id), 0) + 1, curva, valor });
    };
    if (ferramentaAntes === "linha") cotar(novas[0]?.id, medidas.comprimento);
    if (ferramentaAntes === "circulo") cotar(novas[0]?.id, medidas.diametro);
    if (ferramentaAntes === "retangulo" || ferramentaAntes === "retanguloCentro") {
      cotar(novas[0]?.id, medidas.largura);
      cotar(novas[1]?.id, medidas.altura);
    }
    // Acerta pequenas diferenças (ex.: linha que ficou reta sozinha) para bater com as cotas.
    resolver(dados, new Set(novas.flatMap((c) => (c.tipo === "linha" ? [c.b] : c.tipo === "circulo" ? [c.centro] : []))));
    caixaMedidas.hidden = true;
    chavesNaCaixa = "";
    redesenhar();
  }

  // Só para depurar no navegador (não vai para a versão final).
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__haxysEsboco = () => ({ etapa, ferramenta, primeiro, segundo, cursor, ultimoPonto, dados, pontosSpline });
  }

  function sair() {
    etapa = "parado";
    dados = null;
    ferramenta = null;
    ultimoPonto = null;
    primeiro = segundo = null;
    curvaSelecionada = null;
    caixaLados.hidden = true;
    marcadas = [];
    painelCopia.hidden = true;
    if (planos) (raiz.remove(planos), liberar(planos), (planos = null));
    redesenhar();
    vista.tela.style.cursor = "default";
    acoes.aoSair();
  }

  function terminarFerramenta(): boolean {
    for (const k of Object.keys(travado)) delete travado[k];
    caixaMedidas.hidden = true;
    chavesNaCaixa = "";
    if (pontosSpline.length) {
      terminarSpline();
      return true;
    }
    if (ultimoPonto !== null || primeiro) {
      ultimoPonto = null;
      primeiro = segundo = terceiro = null;
      desenharPrevia();
      return true;
    }
    if (ferramentaRestricao) {
      ferramentaRestricao = null;
      escolhas = [];
      vista.tela.style.cursor = "default";
      redesenhar();
      return true;
    }
    if (ferramenta) {
      ferramenta = null;
      recortePrevio = null;
      caixaLados.hidden = true;
      marcadas = [];
      painelCopia.hidden = true;
      vista.tela.style.cursor = "default";
      desenharPrevia();
      return true;
    }
    return false;
  }

  // Caixa "Lados" do Polígono (o Fusion mostra o mesmo campo enquanto desenha).
  const caixaLados = document.createElement("label");
  caixaLados.className = "caixa-lados";
  caixaLados.hidden = true;
  caixaLados.innerHTML = `Lados <input type="number" min="3" max="64" step="1" value="6">`;
  const entradaLados = caixaLados.querySelector("input")!;
  entradaLados.addEventListener("keydown", (e) => e.stopPropagation());
  entradaLados.addEventListener("input", () => {
    const n = Math.round(Number(entradaLados.value));
    if (n >= 3 && n <= 64) (lados = n), desenharPrevia();
  });
  sobreposicao.appendChild(caixaLados);

  return {
    ativo: () => etapa !== "parado",
    iniciar() {
      if (etapa !== "parado") return;
      etapa = "plano";
      mostrarPlanos();
      acoes.avisar("Escolha um plano ou uma face plana.");
    },
    editar(existente) {
      if (etapa !== "parado") return;
      comecarNoPlano(existente.plano, existente);
    },
    usarFerramenta(f) {
      if (etapa !== "desenhando") return acoes.avisar("Primeiro crie ou abra um esboço.");
      if (f === "autoRestricao") {
        guardar();
        const r = restringirAutomatico(dados!);
        if (!r.restricoes && !r.cotas) desfazer.pop();
        acoes.avisar(
          `Restrição automática: ${r.restricoes} restrição(ões) e ${r.cotas} cota(s). ` +
            (r.graus ? `Ainda sobram ${r.graus} grau(s) de liberdade.` : "Esboço totalmente definido."),
        );
        return redesenhar();
      }
      terminarFerramenta();
      ferramentaRestricao = null;
      escolhas = [];
      ferramenta = f;
      curvaSelecionada = null;
      vista.tela.style.cursor = "crosshair";
      caixaLados.hidden = !(f === "poligonoInscrito" || f === "poligonoCircunscrito");
      marcadas = [];
      etapaCopia = "curvas";
      centroPadrao = 0;
      montarPainel();
      acoes.avisar(DICAS[f] ?? `${NOMES[f]}. Esc termina.`);
      redesenhar();
    },
    usarRestricao(t) {
      if (etapa !== "desenhando") return acoes.avisar("Primeiro crie ou abra um esboço.");
      while (terminarFerramenta());
      ferramentaRestricao = t;
      escolhas = [];
      curvaSelecionada = null;
      vista.tela.style.cursor = "pointer";
      acoes.avisar(NOMES_RESTRICAO[t]);
      redesenhar();
    },
    concluir() {
      if (etapa === "plano") return sair();
      if (etapa !== "desenhando" || !dados) return;
      const final = dados;
      sair();
      acoes.aoConcluir(final);
    },
    tecla(e) {
      if (etapa === "parado") return false;
      const k = e.key.toLowerCase();
      if (k === "escape") {
        if (etapa === "plano") sair();
        else if (!terminarFerramenta() && curvaSelecionada !== null) (curvaSelecionada = null), redesenhar();
        return true;
      }
      if (etapa !== "desenhando") return false;
      if (!e.ctrlKey && /^[0-9.,-]$/.test(e.key) && comecarDigitacao(e.key === "," ? "." : e.key)) return true;
      if (k === "enter" && ehSpline(ferramenta) && pontosSpline.length) {
        terminarSpline();
        return true;
      }
      if (e.ctrlKey && k === "z") {
        const anterior = desfazer.pop();
        if (anterior) (dados = JSON.parse(anterior)), (ultimoPonto = null), (primeiro = segundo = null), redesenhar();
        return true;
      }
      if ((k === "delete" || k === "backspace") && simboloSelecionado !== null) {
        guardar();
        apagarSimbolo(dados!, simboloSelecionado);
        simboloSelecionado = null;
        redesenhar();
        return true;
      }
      if ((k === "delete" || k === "backspace") && curvaSelecionada !== null) {
        guardar();
        const d = dados!;
        d.curvas = d.curvas.filter((c) => c.id !== curvaSelecionada);
        const usados = new Set(d.curvas.flatMap(idsDaCurva));
        d.pontos = d.pontos.filter((p) => p.id === 0 || usados.has(p.id));
        limparReferencias(d);
        curvaSelecionada = null;
        redesenhar();
        return true;
      }
      const atalhos: Record<string, FerramentaEsboco> = { l: "linha", r: "retangulo", c: "circulo", d: "cota", t: "recortar" };
      if (!e.ctrlKey && atalhos[k]) {
        this.usarFerramenta(atalhos[k]);
        return true;
      }
      return false;
    },
  };
}
