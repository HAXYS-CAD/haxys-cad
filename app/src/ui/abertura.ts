// Abertura: letreiro HAXYS CAD em ouro polido, apoiado na mesa de construção, com peças de metal
// paradas sobre a mesa ao fundo (desfocadas). Nada se move, só a luz: faixas passam sobre o letreiro
// enquanto o núcleo carrega; quando o main.ts avisa "haxys-pronto", uma última luz forte percorre o
// nome inteiro e a abertura some.
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import svgLogo from "./logoHaxysCad.svg?raw";

const TEMPO_MINIMO = 3200; // ms: dá tempo de ver pelo menos uma passada de luz
const TEMPO_MAXIMO = 30000; // se o núcleo travar, a abertura não prende a tela
const LUZ_FINAL = 1.3; // s: a passada que marca "carregou"

const caixa = document.createElement("div");
caixa.setAttribute("role", "status");
caixa.setAttribute("aria-label", "Abrindo HAXYS CAD");
caixa.style.cssText = "position:fixed;inset:0;z-index:99999;overflow:hidden;transition:opacity .8s;background:#0b1018";
const tela = document.createElement("canvas");
tela.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
const texto = document.createElement("div");
texto.textContent = "Carregando…";
texto.style.cssText =
  "position:absolute;left:0;right:0;bottom:7%;text-align:center;font:13px system-ui,sans-serif;" +
  "letter-spacing:.2em;color:#8f9bb0;text-transform:uppercase;transition:color .4s";
caixa.append(tela, texto);
document.body.append(caixa);

// Ambiente que o metal reflete: esfera azul-escura, painéis de luz fixos e as faixas que passam.
function criarAmbiente() {
  const amb = new THREE.Scene();
  const esfera = new THREE.SphereGeometry(50, 32, 16);
  const cores: number[] = [];
  const pos = esfera.attributes.position;
  const baixo = new THREE.Color("#05070b"), alto = new THREE.Color("#2a3a55");
  for (let i = 0; i < pos.count; i++) {
    const c = baixo.clone().lerp(alto, THREE.MathUtils.clamp(pos.getY(i) / 50 + 0.5, 0, 1));
    cores.push(c.r, c.g, c.b);
  }
  esfera.setAttribute("color", new THREE.Float32BufferAttribute(cores, 3));
  amb.add(new THREE.Mesh(esfera, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const painel = (w: number, h: number, forca: number, cor: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.material.color.set(cor).multiplyScalar(forca);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    amb.add(m);
    return m;
  };
  painel(30, 8, 4, "#fff6e8", 0, 30, 6); // luz de cima
  painel(6, 20, 2.5, "#ffe2b0", -28, 6, 14); // lado esquerdo quente
  painel(6, 20, 1.6, "#cfe0ff", 28, 4, 10); // lado direito frio
  painel(60, 14, 0.7, "#ffe9c4", 0, -6, 30); // reflexo na frente (faces de frente do letreiro)
  const faixas = [0, 1].map((i) => {
    const f = painel(3 - i * 1.5, 70, 22, "#ffffff", 999, 0, 22);
    f.rotation.set(0, 0, 0.45);
    return f;
  });
  return { amb, faixas };
}

// Fundo da cena: degradê azul-escuro/cinza como dentro do app.
function degrade() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(256, 200, 0, 256, 256, 380);
  r.addColorStop(0, "#22304a");
  r.addColorStop(0.55, "#131b28");
  r.addColorStop(1, "#080b10");
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Peças de metal paradas sobre a mesa, ao fundo, em lugares e giros sorteados.
function criarPecas() {
  const formas = [
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.IcosahedronGeometry(0.7),
    new THREE.TorusGeometry(0.6, 0.22, 16, 40),
    new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32),
    new THREE.OctahedronGeometry(0.75),
    new THREE.SphereGeometry(0.6, 32, 16),
  ];
  const metal = new THREE.MeshStandardMaterial({ color: "#aeb8c6", metalness: 1, roughness: 0.25 });
  const pecas = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const p = new THREE.Mesh(formas[i % formas.length], metal);
    p.scale.setScalar(0.6 + Math.random() * 0.9);
    p.rotation.set(i % 6 === 2 ? Math.PI / 2 : 0, Math.random() * 6, 0); // anel deitado
    p.position.set((Math.random() - 0.5) * 60, 0, -9 - Math.random() * 22);
    p.castShadow = true;
    p.updateMatrixWorld();
    p.position.y = -new THREE.Box3().setFromObject(p).min.y; // apoiada na mesa
    pecas.add(p);
  }
  return pecas;
}

function criarLogo() {
  const dados = new SVGLoader().parse(svgLogo);
  const ouro = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.07, clearcoat: 1, clearcoatRoughness: 0.03 });
  ouro.color.setRGB(1.0, 0.71, 0.29); // ouro (linear)
  const logo = new THREE.Group();
  const cervo: THREE.Mesh[] = [];
  let peCervo = 0;
  for (const caminho of dados.paths)
    for (const forma of SVGLoader.createShapes(caminho)) {
      const g = new THREE.ExtrudeGeometry(forma, {
        depth: 120, curveSegments: 8, bevelEnabled: true, bevelThickness: 6, bevelSize: 3, bevelSegments: 4,
      });
      const m = new THREE.Mesh(g, ouro);
      m.castShadow = true;
      g.computeBoundingBox();
      if (g.boundingBox!.max.x < 500) cervo.push(m), (peCervo = Math.max(peCervo, g.boundingBox!.max.y)); // cervo: x < 500 no SVG
      logo.add(m);
    }
  for (const m of cervo) m.position.y = 515 - peCervo; // sobe o cervo até o pé das letras (y 515 no SVG)
  logo.scale.set(1, -1, 1); // SVG tem Y para baixo
  const caixaLogo = new THREE.Box3().setFromObject(logo);
  const centro = caixaLogo.getCenter(new THREE.Vector3());
  logo.position.set(-centro.x, -caixaLogo.min.y, -centro.z); // apoiado na mesa
  const juntos = new THREE.Group();
  juntos.add(logo);
  juntos.scale.setScalar(10 / (caixaLogo.max.x - caixaLogo.min.x)); // 10 unidades de largura
  return juntos;
}

function iniciar() {
  const r = new THREE.WebGLRenderer({ canvas: tela, antialias: true });
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setPixelRatio(Math.min(devicePixelRatio, 2));

  const cena = new THREE.Scene();
  cena.background = degrade();
  cena.fog = new THREE.Fog("#131b28", 26, 75);
  const { amb, faixas } = criarAmbiente();
  const alvoCubo = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType });
  const cameraCubo = new THREE.CubeCamera(0.1, 100, alvoCubo);
  cameraCubo.position.set(0, 1.5, 0);
  cena.environment = alvoCubo.texture;

  cena.add(criarLogo(), criarPecas());
  // Mesa de construção: grade 25/50 como no app, sumindo na névoa.
  const mesa = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: "#1b2536", metalness: 0, roughness: 0.7 }),
  );
  mesa.rotation.x = -Math.PI / 2;
  mesa.receiveShadow = true;
  const grade = new THREE.GridHelper(120, 240, "#33435a", "#2a374c");
  grade.position.y = 0.002;
  cena.add(mesa, grade);
  const sol = new THREE.DirectionalLight("#fff1dc", 1.2);
  sol.position.set(-4, 12, 7);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26 });
  sol.shadow.radius = 6;
  cena.add(sol);

  // Câmera parada; em tela estreita fica mais longe para o letreiro caber inteiro.
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const composicao = new EffectComposer(r);
  composicao.addPass(new RenderPass(cena, camera));
  const desfoque = new BokehPass(cena, camera, { focus: 13, aperture: 0.0006, maxblur: 0.008 });
  composicao.addPass(desfoque);
  composicao.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.2, 3)); // brilho só onde a luz bate forte
  composicao.addPass(new OutputPass());
  const redimensionar = () => {
    const w = innerWidth, h = innerHeight;
    r.setSize(w, h, false);
    composicao.setPixelRatio(r.getPixelRatio());
    composicao.setSize(w, h);
    camera.aspect = w / h;
    const d = Math.max(13, 13 * (1.6 / camera.aspect));
    camera.position.set(0, 3.2, d);
    camera.lookAt(0, 1.2, 0);
    camera.updateProjectionMatrix();
    (desfoque.uniforms as Record<string, THREE.IUniform>).focus.value = camera.position.distanceTo(new THREE.Vector3(0, 1, 0));
  };
  redimensionar();
  addEventListener("resize", redimensionar);

  const inicio = performance.now();
  let inicioFinal = -1; // segundos em que começou a luz final
  let rodando = true;
  const quadro = () => {
    if (!rodando) return;
    const t = (performance.now() - inicio) / 1000;
    if (inicioFinal < 0) {
      // Carregando: faixas atravessam a cada 2,6 s; a segunda vem logo atrás da primeira.
      faixas.forEach((f, i) => (f.position.x = -45 + (((t - i * 0.25) % 2.6) / 2.6) * 90));
    } else {
      // Carregou: uma faixa larga e forte percorre o nome inteiro uma vez.
      faixas[0].position.x = -45 + Math.min(1, (t - inicioFinal) / LUZ_FINAL) * 90;
      faixas[1].position.x = 999;
    }
    cameraCubo.update(r, amb);
    alvoCubo.texture.needsPMREMUpdate = true;
    composicao.render();
    requestAnimationFrame(quadro);
  };
  quadro();

  return {
    luzFinal() {
      inicioFinal = (performance.now() - inicio) / 1000;
      faixas[0].scale.x = 3;
      faixas[0].material.color.setScalar(16);
    },
    parar() {
      rodando = false;
      removeEventListener("resize", redimensionar);
      alvoCubo.dispose();
      composicao.dispose();
      r.dispose();
      r.forceContextLoss();
    },
  };
}

let abertura = { luzFinal() {}, parar() {} };
try {
  abertura = iniciar();
} catch (e) {
  console.warn("Abertura sem 3D:", e); // sem WebGL: o app abre normal
}

const inicioAbertura = performance.now();
let fechando = false;
function fechar() {
  if (fechando || (import.meta.env.DEV && location.search.includes("abertura"))) return; // ?abertura = fica aberta para ajustar
  fechando = true;
  setTimeout(() => {
    abertura.luzFinal();
    texto.textContent = "Pronto";
    texto.style.color = "#e8c27a";
    setTimeout(() => (caixa.style.opacity = "0"), LUZ_FINAL * 1000);
    setTimeout(() => (abertura.parar(), caixa.remove(), dispatchEvent(new Event("haxys-abertura-fim"))), LUZ_FINAL * 1000 + 850);
  }, Math.max(0, TEMPO_MINIMO - (performance.now() - inicioAbertura)));
}
addEventListener("haxys-pronto", fechar);
setTimeout(fechar, TEMPO_MAXIMO);
caixa.addEventListener("click", fechar); // clicar pula a abertura
// Só para testar: __haxysLuzFinal() mostra a luz final com ?abertura.
if (import.meta.env.DEV) Object.assign(window, { __haxysLuzFinal: () => abertura.luzFinal() });
