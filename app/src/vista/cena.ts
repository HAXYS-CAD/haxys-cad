// Janela 3D: cena, câmera, grade, eixos da origem e controles de mouse.
// Unidade: milímetro. Eixo Y para cima, como no Fusion.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MalhaCorpo } from "../nucleo/tipos";
import { APARENCIAS } from "../nucleo/materiais";
import { curvaturaDaMalha, materialDaAnalise, type Analise } from "./analises";

export type ModoNavegacao = "selecionar" | "orbitar" | "panoramica" | "zoom";

export interface Vista {
  camera: THREE.PerspectiveCamera;
  controles: OrbitControls;
  definirModo(modo: ModoNavegacao): void;
  sombra(ligada: boolean): void;
  ajustar(): void;
  orientar(direcao: THREE.Vector3): void;
  aoDesenhar(fn: () => void): void;
  // corpos = o que aparece (com prévia); base = o que a seleção pega (sem prévia).
  mostrarCorpos(corpos: MalhaCorpo[], ocultos: Set<string>, base: MalhaCorpo[]): void;
  // Usados pela seleção.
  cena: THREE.Scene;
  tela: HTMLCanvasElement;
  grupoCorpos: THREE.Group;
  grupoSelecionavel: THREE.Group; // fora da cena: só serve para o mouse achar faces/arestas
  modoAtual(): ModoNavegacao;
  // Análise de corte: esconde o que fica do lado positivo do plano (null = desliga).
  definirCorte(plano: { normal: [number, number, number]; constante: number } | null): void;
  // Marcador de um ponto (ex.: centro de massa); null tira.
  marcarPonto(p: [number, number, number] | null): void;
  // Análise visual (ângulo, zebra, curvatura...); null volta às cores normais.
  definirAnalise(a: Analise | null): void;
  analiseAtual(): Analise | null;
  // Foto da janela 3D (PNG em data URL); enquadrar = câmera mostra todos os corpos.
  capturar(enquadrar?: boolean): string;
  // Mostrar cores de componentes: cada corpo com uma cor da paleta (liga/desliga).
  alternarCoresPorCorpo(): boolean;
  // Mostrar grupos de faces das malhas (uma cor por grupo).
  alternarGruposMalha(): boolean;
  // Análise de pente de curvatura nas arestas curvas (liga/desliga).
  alternarPente(): boolean;
  // Linhas de análise (isocurvas); null apaga.
  mostrarIsocurvas(seg: Float32Array | null): void;
  // Tema escuro: grade mais clara sobre o fundo escuro (o fundo vem do CSS).
  temaEscuro(escuro: boolean): void;
}

// Pente de curvatura: em cada ponto das arestas curvas, um "dente" do tamanho
// da curvatura (1/raio), para o lado de fora da curva, e a linha que liga as
// pontas. Retas não ganham dentes. "escala" = mm de dente por 1/mm de curvatura.
export function linhasDoPente(corpos: MalhaCorpo[], escala?: number): Float32Array {
  const dentes: { p: number[]; d: number[]; k: number }[][] = [];
  let maior = 0;
  for (const c of corpos) {
    for (let g = 0; g < c.gruposArestas.length / 2; g++) {
      const ini = c.gruposArestas[2 * g], q = c.gruposArestas[2 * g + 1];
      if (q < 4) continue;
      const pts: number[][] = [];
      for (let k = ini; k < ini + q; k += 2) pts.push([c.arestas[3 * k], c.arestas[3 * k + 1], c.arestas[3 * k + 2]]);
      const ult = ini + q - 1;
      pts.push([c.arestas[3 * ult], c.arestas[3 * ult + 1], c.arestas[3 * ult + 2]]);
      const linha: { p: number[]; d: number[]; k: number }[] = [];
      for (let i = 1; i < pts.length - 1; i++) {
        const [a, b, cc] = [pts[i - 1], pts[i], pts[i + 1]];
        const ab = a.map((x, j) => x - b[j]), cb = cc.map((x, j) => x - b[j]), ac = cc.map((x, j) => x - a[j]);
        const cr = [ab[1] * cb[2] - ab[2] * cb[1], ab[2] * cb[0] - ab[0] * cb[2], ab[0] * cb[1] - ab[1] * cb[0]];
        const den = Math.hypot(...ab) * Math.hypot(...cb) * Math.hypot(...ac);
        const k = den > 1e-12 ? (2 * Math.hypot(...cr)) / den : 0; // 4·área / (a·b·c)
        const dentro = ab.map((x, j) => x + cb[j]); // aponta para o centro da curva
        const L = Math.hypot(...dentro) || 1;
        linha.push({ p: b, d: dentro.map((x) => -x / L), k });
        maior = Math.max(maior, k);
      }
      if (linha.some((t) => t.k > 1e-6)) dentes.push(linha);
    }
  }
  if (!dentes.length || maior <= 0) return new Float32Array(0);
  // Sem escala dada: o maior dente fica com 1/8 do tamanho da cena.
  let tamanho = 1;
  if (escala === undefined) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const c of corpos) for (let i = 0; i < c.vertices.length; i++) (lo[i % 3] = Math.min(lo[i % 3], c.vertices[i])), (hi[i % 3] = Math.max(hi[i % 3], c.vertices[i]));
    tamanho = Math.max(1, ...[0, 1, 2].map((j) => hi[j] - lo[j]));
  }
  const fator = escala ?? tamanho / 8 / maior;
  const seg: number[] = [];
  for (const linha of dentes) {
    const pontas = linha.map((t) => t.p.map((x, j) => x + t.d[j] * t.k * fator));
    linha.forEach((t, i) => seg.push(...t.p, ...pontas[i]));
    for (let i = 1; i < pontas.length; i++) seg.push(...pontas[i - 1], ...pontas[i]);
  }
  return new Float32Array(seg);
}

// Paleta das "cores de componentes" (como o Fusion, cores fortes e distintas).
const PALETA = [0xe6194b, 0x3cb44b, 0x4363d8, 0xf58231, 0x911eb4, 0x42d4f4, 0xf032e6, 0xbfef45, 0xfabed4, 0x469990, 0xdcbeff, 0x9a6324, 0xfffac8, 0x800000, 0xaaffc3, 0x808000];
// Feitos só na primeira vez (os planos de corte são declarados mais abaixo).
let materiaisPaleta: THREE.MeshStandardMaterial[] | null = null;
const corDaPaleta = (i: number) =>
  (materiaisPaleta ??= PALETA.map((cor) => new THREE.MeshStandardMaterial({ color: cor, metalness: 0.1, roughness: 0.6, clippingPlanes: planosCorte })))[i % PALETA.length];

// Planos da Análise de corte (a mesma lista vale para todos os materiais dos corpos).
const planosCorte: THREE.Plane[] = [];

// Material da tela para cada aparência (feito uma vez e guardado).
const materiaisTela = new Map<string, THREE.MeshStandardMaterial>();
// "chave:duplo" = mesma aparência com os dois lados das faces (corpos de superfície).
function materialDe(chave: string): THREE.MeshStandardMaterial {
  let m = materiaisTela.get(chave);
  if (!m) {
    const duplo = chave.endsWith(":duplo");
    const a = APARENCIAS[chave.replace(":duplo", "")] ?? APARENCIAS.aco;
    const opacidade = a.opacidade ?? 1;
    m = new THREE.MeshStandardMaterial({
      color: a.cor,
      metalness: a.metal,
      roughness: a.rugosidade,
      transparent: opacidade < 1,
      opacity: opacidade,
      depthWrite: opacidade >= 1,
      side: opacidade < 1 || duplo ? THREE.DoubleSide : THREE.FrontSide,
      polygonOffset: true, // deixa as arestas aparecerem por cima das faces
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      clippingPlanes: planosCorte,
    });
    m.userData.duplo = duplo;
    materiaisTela.set(chave, m);
  }
  return m;
}
const MATERIAL_CORPO = materialDe("aco");
const MATERIAL_ARESTA = new THREE.LineBasicMaterial({ color: 0x1d232b, clippingPlanes: planosCorte });

const ALVO_INICIAL = new THREE.Vector3(0, 0, 0);
const DIRECAO_INICIAL = new THREE.Vector3(1, 0.8, 1).normalize(); // frente-direita-cima
const DISTANCIA_INICIAL = 260;

export function criarVista(raiz: HTMLElement): Vista {
  const renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderizador.localClippingEnabled = true;
  renderizador.setPixelRatio(window.devicePixelRatio);
  raiz.appendChild(renderizador.domElement);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
  camera.position.copy(DIRECAO_INICIAL).multiplyScalar(DISTANCIA_INICIAL);

  // Grade como a do Fusion: 700 × 700 mm (±350), linha fina a cada 25 mm,
  // forte a cada 50 mm, e a régua (números a cada 25 mm) nas duas bordas da frente.
  const MEIA = 350;
  let fina: THREE.GridHelper, forte: THREE.GridHelper, regua: THREE.Group;
  function grade(escuro: boolean) {
    if (fina) {
      cena.remove(fina, forte, regua), fina.dispose(), forte.dispose();
      regua.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose(), o.material.map?.dispose(), o.material.dispose();
      });
    }
    // Cores 10% mais contrastadas que o fundo (pedido do usuário: linhas fracas demais).
    fina = new THREE.GridHelper(2 * MEIA, (2 * MEIA) / 25, escuro ? 0x434a54 : 0xafb4bb, escuro ? 0x3a4049 : 0xbfc3c9);
    forte = new THREE.GridHelper(2 * MEIA, (2 * MEIA) / 50, escuro ? 0x626b77 : 0x989fa8, escuro ? 0x626b77 : 0x989fa8);
    (fina.material as THREE.Material).transparent = true;
    (fina.material as THREE.Material).opacity = 0.77;
    regua = new THREE.Group();
    const corTexto = escuro ? "#8d96a1" : "#6b7480";
    const ALTURA = 11; // mm da letra no chão
    for (let p = -MEIA; p <= MEIA; p += 25) {
      if (!p) continue;
      const texto = String(Math.abs(p));
      const c = document.createElement("canvas");
      c.width = 32 * texto.length + 8;
      c.height = 56;
      const g = c.getContext("2d")!;
      g.font = "600 48px Segoe UI, Arial, sans-serif";
      g.fillStyle = corTexto;
      g.textBaseline = "middle";
      g.fillText(texto, 4, 30);
      const larg = (ALTURA * c.width) / c.height;
      const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false });
      // Texto deitado no chão, lendo para fora da borda.
      const naFrente = new THREE.Mesh(new THREE.PlaneGeometry(larg, ALTURA), mat);
      naFrente.rotation.set(-Math.PI / 2, 0, -Math.PI / 2, "YXZ");
      naFrente.position.set(p, 0, MEIA + 4 + larg / 2);
      const naDireita = new THREE.Mesh(new THREE.PlaneGeometry(larg, ALTURA), mat.clone());
      naDireita.rotation.x = -Math.PI / 2;
      naDireita.position.set(MEIA + 4 + larg / 2, 0, p);
      regua.add(naFrente, naDireita);
    }
    // Contorno da mesa mais claro, como no Fusion.
    const m = MEIA;
    regua.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-m, 0, -m), new THREE.Vector3(m, 0, -m), new THREE.Vector3(m, 0, m), new THREE.Vector3(-m, 0, m)]),
      new THREE.LineBasicMaterial({ color: escuro ? 0xaab2bc : 0x8a939e }),
    ));
    cena.add(fina, forte, regua);
  }
  grade(false);

  // Eixos da origem: X vermelho, Y verde, Z azul.
  const eixos = new THREE.Group();
  const eixo = (fim: THREE.Vector3, cor: number) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), fim]);
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: cor, depthTest: false }));
  };
  eixos.add(
    eixo(new THREE.Vector3(MEIA, 0, 0), 0xd23b3b),
    eixo(new THREE.Vector3(0, MEIA, 0), 0x3aa63a),
    eixo(new THREE.Vector3(0, 0, MEIA), 0x2f6fd8),
  );
  eixos.renderOrder = 1;
  cena.add(eixos);
  const ponto = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c }),
  );
  cena.add(ponto);

  // Luz de ambiente como no Fusion: uma "sala" de estúdio refletida nas peças
  // (brilho e reflexo no metal). Feita uma vez; não pesa a cada quadro.
  const pm = new THREE.PMREMGenerator(renderizador);
  cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  cena.environmentIntensity = 1.15;
  pm.dispose();
  cena.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.6));
  // Luz presa à câmera: a face virada para você fica sempre iluminada.
  const luz = new THREE.DirectionalLight(0xffffff, 1);
  luz.position.set(0.3, 0.6, 1);
  camera.add(luz);
  cena.add(camera);

  // Marcador (bolinha laranja que aparece por cima de tudo).
  const marcador = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8621c, depthTest: false }),
  );
  marcador.renderOrder = 10;
  marcador.visible = false;
  cena.add(marcador);

  const grupoCorpos = new THREE.Group();
  cena.add(grupoCorpos);

  // Sombra no chão (plano da grade, y = 0): luz fixa de cima só para a sombra
  // (intensidade 0 não muda a cor das peças). O mapa de sombra só é refeito
  // quando os corpos mudam (a luz não segue a câmera).
  renderizador.shadowMap.enabled = true;
  renderizador.shadowMap.type = THREE.PCFSoftShadowMap;
  renderizador.shadowMap.autoUpdate = false;
  const luzSombra = new THREE.DirectionalLight(0xffffff, 0);
  luzSombra.castShadow = true;
  luzSombra.shadow.mapSize.set(2048, 2048);
  luzSombra.shadow.radius = 6;
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.35, depthWrite: false }));
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = 0.02;
  chao.receiveShadow = true;
  cena.add(luzSombra, luzSombra.target, chao);
  function ajustarSombra() {
    const caixa = new THREE.Box3().setFromObject(grupoCorpos);
    chao.visible = luzSombra.visible && !caixa.isEmpty();
    if (!chao.visible) return;
    const esfera = caixa.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(esfera.radius, 1);
    luzSombra.target.position.set(esfera.center.x, 0, esfera.center.z);
    // Luz baixa, da esquerda e da frente: a sombra cai para a direita e para trás, à vista (luz alta escondia a sombra embaixo da peça).
    luzSombra.position.set(esfera.center.x - r * 1.6, Math.max(esfera.center.y, 0) + r * 1.3, esfera.center.z + r * 0.6);
    const cam = luzSombra.shadow.camera;
    [cam.left, cam.right, cam.top, cam.bottom, cam.near, cam.far] = [-r * 2.5, r * 2.5, r * 2.5, -r * 2.5, 0.1, r * 6 + Math.abs(caixa.min.y)];
    cam.updateProjectionMatrix();
    chao.scale.set(r * 6, r * 6, 1);
    chao.position.x = esfera.center.x;
    chao.position.z = esfera.center.z;
    renderizador.shadowMap.needsUpdate = true;
  }
  const grupoSelecionavel = new THREE.Group();

  function limpar(grupo: THREE.Group) {
    for (const filho of [...grupo.children]) {
      grupo.remove(filho);
      filho.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
  }

  let analise: Analise | null = null;
  let coresPorCorpo = false;
  let gruposMalha = false;
  let penteLigado = false;
  const iso = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x1565c0 }));
  const pente = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc2185b }));
  pente.visible = false;
  const atualizarPente = (corpos: MalhaCorpo[]) => {
    pente.geometry.dispose();
    pente.geometry = new THREE.BufferGeometry();
    if (penteLigado) pente.geometry.setAttribute("position", new THREE.BufferAttribute(linhasDoPente(corpos), 3));
    pente.visible = penteLigado;
  };
  const materialGrupos = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.05, roughness: 0.7, clippingPlanes: planosCorte });
  let materialAnalise: THREE.Material | null = null;
  let ultimos: { corpos: MalhaCorpo[]; ocultos: Set<string>; base: MalhaCorpo[] } | null = null;

  function mostrarCorpos(corpos: MalhaCorpo[], ocultos: Set<string>, base: MalhaCorpo[]) {
    ultimos = { corpos, ocultos, base };
    if (penteLigado) atualizarPente(corpos.filter((c) => !ocultos.has(c.nome)));
    limpar(grupoCorpos);
    limpar(grupoSelecionavel);
    for (const c of base) {
      if (ocultos.has(c.nome)) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(c.vertices, 3));
      g.setIndex(new THREE.BufferAttribute(c.triangulos, 1));
      const m = new THREE.Mesh(g, MATERIAL_CORPO);
      m.name = c.nome;
      m.userData.corpo = c;
      grupoSelecionavel.add(m);
    }
    for (const c of corpos) {
      if (ocultos.has(c.nome)) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(c.vertices, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(c.normais, 3));
      g.setIndex(new THREE.BufferAttribute(c.triangulos, 1));
      if (analise?.tipo === "curvatura") g.setAttribute("curvatura", new THREE.BufferAttribute(curvaturaDaMalha(c), 1));
      else if (analise) g.setAttribute("curvatura", new THREE.BufferAttribute(new Float32Array(c.vertices.length / 3), 1));
      const comGrupos = gruposMalha && c.ehMalha && c.gruposFaces.length > 2;
      if (comGrupos) {
        // Cor de cada grupo (mesma paleta das cores de componentes).
        const cores = new Float32Array(c.vertices.length);
        const cor = new THREE.Color();
        for (let k = 0; k < c.gruposFaces.length / 2; k++) {
          cor.setHex(PALETA[k % PALETA.length]);
          const ini = c.gruposFaces[2 * k], q = c.gruposFaces[2 * k + 1];
          for (let j = ini; j < ini + q; j++) cores.set([cor.r, cor.g, cor.b], c.triangulos[j] * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(cores, 3));
      }
      const malha = new THREE.Mesh(
        g,
        analise && materialAnalise
          ? materialAnalise
          : comGrupos
            ? materialGrupos
            : coresPorCorpo
            ? corDaPaleta(corpos.indexOf(c))
            : materialDe(c.ehSuperficie ? `${c.aparencia}:duplo` : c.aparencia),
      );
      malha.name = c.nome;
      malha.userData.corpo = c;
      const ga = new THREE.BufferGeometry();
      ga.setAttribute("position", new THREE.BufferAttribute(c.arestas, 3));
      malha.add(new THREE.LineSegments(ga, MATERIAL_ARESTA));
      malha.castShadow = true;
      grupoCorpos.add(malha);
    }
    ajustarSombra();
  }

  // Mouse (pedido do usuário): esquerdo arrastado = orbitar (clique simples continua
  // selecionando); direito ou meio arrastado = arrastar a vista; Shift + meio = orbitar
  // (como no Fusion); roda = zoom. Shift/Ctrl + esquerdo arrastado = janela de seleção.
  const controles = new OrbitControls(camera, renderizador.domElement);
  controles.target.copy(ALVO_INICIAL);
  controles.enableDamping = false;
  controles.screenSpacePanning = true;
  controles.zoomToCursor = true;
  controles.rotateSpeed = 0.6; // giro mais calmo, perto do Fusion

  let modoAtual: ModoNavegacao = "selecionar";
  function definirModo(modo: ModoNavegacao) {
    modoAtual = modo;
    const esquerdo = {
      selecionar: THREE.MOUSE.ROTATE,
      orbitar: THREE.MOUSE.ROTATE,
      panoramica: THREE.MOUSE.PAN,
      zoom: THREE.MOUSE.DOLLY,
    }[modo];
    controles.mouseButtons = {
      LEFT: esquerdo as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    renderizador.domElement.style.cursor = modo === "selecionar" ? "default" : "grab";
  }
  definirModo("selecionar");
  // Shift/Ctrl + esquerdo no modo selecionar: a janela de seleção (selecao.ts) usa o arraste.
  renderizador.domElement.addEventListener(
    "pointerdown",
    (e) => {
      controles.enabled = !(e.button === 0 && (e.shiftKey || e.ctrlKey) && modoAtual === "selecionar");
    },
    true,
  );

  // Animação curta da câmera até uma nova direção, mantendo a distância.
  let animacao: { de: THREE.Vector3; para: THREE.Vector3; inicio: number } | null = null;
  function moverPara(direcao: THREE.Vector3, distancia: number, alvo: THREE.Vector3) {
    controles.target.copy(alvo);
    const para = direcao.clone().normalize();
    // Evita a direção exatamente vertical, onde a órbita fica indefinida.
    // O desvio para +Z deixa a FRENTE embaixo na vista superior, como no Fusion.
    if (Math.abs(para.y) > 0.9999) para.set(0, Math.sign(para.y), 0.001).normalize();
    animacao = {
      de: camera.position.clone().sub(alvo).normalize(),
      para: para.multiplyScalar(distancia),
      inicio: performance.now(),
    };
  }

  const ouvintes: (() => void)[] = [];

  function redimensionar() {
    const { clientWidth: l, clientHeight: a } = raiz;
    renderizador.setSize(l, a, false);
    camera.aspect = l / Math.max(a, 1);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionar).observe(raiz);
  redimensionar();

  renderizador.setAnimationLoop((agora) => {
    if (animacao) {
      const t = Math.min((agora - animacao.inicio) / 300, 1);
      const suave = t * t * (3 - 2 * t);
      const distancia = animacao.para.length();
      const dir = animacao.de.clone().lerp(animacao.para.clone().normalize(), suave).normalize();
      camera.position.copy(controles.target).addScaledVector(dir, distancia);
      camera.lookAt(controles.target);
      if (t === 1) animacao = null;
    }
    controles.update();
    renderizador.render(cena, camera);
    ouvintes.forEach((fn) => fn());
  });

  return {
    camera,
    controles,
    definirModo,
    sombra(ligada) {
      luzSombra.visible = ligada;
      ajustarSombra();
    },
    // Como no Fusion: enquadra todos os corpos visíveis (sem corpos, a vista inicial).
    ajustar: () => {
      const caixa = new THREE.Box3().setFromObject(grupoCorpos);
      if (caixa.isEmpty()) return moverPara(DIRECAO_INICIAL, DISTANCIA_INICIAL, ALVO_INICIAL);
      const esfera = caixa.getBoundingSphere(new THREE.Sphere());
      const meioAngulo = THREE.MathUtils.degToRad(camera.fov / 2) * Math.min(1, camera.aspect);
      moverPara(DIRECAO_INICIAL, Math.max((esfera.radius / Math.sin(meioAngulo)) * 1.1, 50), esfera.center);
    },
    orientar: (direcao) =>
      moverPara(direcao, camera.position.distanceTo(controles.target), controles.target.clone()),
    aoDesenhar: (fn) => ouvintes.push(fn),
    mostrarCorpos,
    cena,
    tela: renderizador.domElement,
    grupoCorpos,
    grupoSelecionavel,
    modoAtual: () => modoAtual,
    definirCorte(plano) {
      planosCorte.length = 0;
      if (plano) planosCorte.push(new THREE.Plane(new THREE.Vector3(...plano.normal), plano.constante));
      // Com corte, o lado de dentro das faces aparece (parece a peça "aberta").
      for (const m of [...materiaisTela.values(), MATERIAL_ARESTA]) {
        if (m instanceof THREE.MeshStandardMaterial && (m.opacity ?? 1) >= 1 && !m.userData.duplo) m.side = plano ? THREE.DoubleSide : THREE.FrontSide;
        m.needsUpdate = true;
      }
    },
    definirAnalise(a) {
      analise = a;
      materialAnalise = a ? materialDaAnalise(a, renderizador) : null;
      if (ultimos) mostrarCorpos(ultimos.corpos, ultimos.ocultos, ultimos.base);
    },
    analiseAtual: () => analise,
    mostrarIsocurvas(seg) {
      iso.geometry.dispose();
      iso.geometry = new THREE.BufferGeometry();
      if (seg) iso.geometry.setAttribute("position", new THREE.BufferAttribute(seg, 3));
      if (!iso.parent) cena.add(iso);
      iso.visible = !!seg;
    },
    alternarPente() {
      penteLigado = !penteLigado;
      if (!pente.parent) cena.add(pente);
      atualizarPente(ultimos ? ultimos.corpos.filter((c) => !ultimos!.ocultos.has(c.nome)) : []);
      return penteLigado;
    },
    alternarGruposMalha() {
      gruposMalha = !gruposMalha;
      if (ultimos) mostrarCorpos(ultimos.corpos, ultimos.ocultos, ultimos.base);
      return gruposMalha;
    },
    alternarCoresPorCorpo() {
      coresPorCorpo = !coresPorCorpo;
      if (ultimos) mostrarCorpos(ultimos.corpos, ultimos.ocultos, ultimos.base);
      return coresPorCorpo;
    },
    temaEscuro: grade,
    capturar(enquadrar = true) {
      const caixa = new THREE.Box3().setFromObject(grupoCorpos);
      if (enquadrar && !caixa.isEmpty()) {
        const esfera = caixa.getBoundingSphere(new THREE.Sphere());
        const dir = camera.position.clone().sub(controles.target).normalize();
        const distancia = (esfera.radius * 1.25) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
        animacao = null;
        controles.target.copy(esfera.center);
        camera.position.copy(esfera.center).addScaledVector(dir, distancia);
        camera.lookAt(esfera.center);
        controles.update();
      }
      renderizador.render(cena, camera);
      return renderizador.domElement.toDataURL("image/png");
    },
    marcarPonto(p) {
      marcador.visible = !!p;
      if (p) marcador.position.set(...p);
    },
  };
}
