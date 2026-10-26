// ViewCube: cubo pequeno no canto que gira junto com a vista.
// Como no Fusion: clicar no meio de uma face vira a câmera para aquela face;
// perto de uma aresta, para a vista entre as duas faces; num canto, para a vista
// isométrica dos três lados. A região sob o mouse fica destacada.
// Arrastar o cubo com o botão esquerdo gira a vista (e a peça) junto.
// O botão da casa volta à vista inicial.
import * as THREE from "three";
import type { Vista } from "./cena";

// Ordem das faces no BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
const FACES = ["DIREITA", "ESQUERDA", "SUPERIOR", "INFERIOR", "FRENTE", "TRÁS"];

function texturaDaFace(texto: string, destaque: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = destaque ? "#cfe3ff" : "#eef1f4";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#8a96a3";
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  g.fillStyle = "#3a4552";
  g.font = "bold 20px Segoe UI, Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(texto, 64, 66);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function criarViewCube(raiz: HTMLElement, vista: Vista) {
  const tamanho = 110;
  const renderizador = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderizador.setPixelRatio(window.devicePixelRatio);
  renderizador.setSize(tamanho, tamanho);
  raiz.appendChild(renderizador.domElement);

  const casa = document.createElement("button");
  casa.className = "casa";
  casa.title = "Vista inicial";
  casa.textContent = "⌂";
  casa.addEventListener("click", () => vista.ajustar());
  raiz.appendChild(casa);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const normais = FACES.map((f) => texturaDaFace(f, false));
  const realce = FACES.map((f) => texturaDaFace(f, true));
  const materiais = normais.map((t) => new THREE.MeshBasicMaterial({ map: t }));
  const cubo = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), materiais);
  cena.add(cubo);

  // Destaque de aresta/canto: caixinha azul clara por cima do cubo.
  const marca = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x8fbaf5, transparent: true, opacity: 0.75, depthTest: false }));
  marca.renderOrder = 1;
  marca.visible = false;
  cena.add(marca);

  const raio = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const MEIO = 0.8, FAIXA = 0.5; // meia aresta do cubo; perto da borda = |c| > FAIXA
  // Devolve a direção da vista (1, 2 ou 3 eixos) e a face do clique.
  function zonaSob(e: PointerEvent): { dir: THREE.Vector3; face: number } | null {
    const r = renderizador.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(mouse, camera);
    const acerto = raio.intersectObject(cubo)[0];
    if (!acerto?.face) return null;
    const p = acerto.point;
    const comp = [p.x, p.y, p.z].map((c) => (Math.abs(c) > FAIXA ? Math.sign(c) : 0));
    return { dir: new THREE.Vector3(...comp), face: acerto.face.materialIndex };
  }

  let sobre: string | null = null;
  let faceAcesa: number | null = null;
  const apagar = () => {
    if (faceAcesa !== null) materiais[faceAcesa].map = normais[faceAcesa];
    faceAcesa = null;
    marca.visible = false;
  };
  renderizador.domElement.addEventListener("pointermove", (e) => {
    const z = zonaSob(e);
    const chave = z ? z.dir.toArray().join(",") : null;
    if (chave === sobre) return;
    sobre = chave;
    apagar();
    renderizador.domElement.style.cursor = z ? "pointer" : "default";
    if (!z) return;
    const eixos = z.dir.toArray().filter((c) => c !== 0).length;
    if (eixos === 1) {
      faceAcesa = z.face;
      materiais[z.face].map = realce[z.face];
      return;
    }
    // Aresta ou canto: caixinha na borda (fina nos eixos da borda, comprida no outro).
    const tam = z.dir.toArray().map((c) => (c === 0 ? 2 * FAIXA : MEIO - FAIXA + 0.02));
    marca.scale.set(tam[0], tam[1], tam[2]);
    marca.position.set(...(z.dir.toArray().map((c) => c * (FAIXA + (MEIO - FAIXA) / 2)) as [number, number, number]));
    marca.visible = true;
  });
  renderizador.domElement.addEventListener("pointerleave", () => {
    apagar();
    sobre = null;
  });
  // Arrastar: gira a câmera principal em volta do alvo (como girar o cubo com a mão).
  let arraste: { x: number; y: number; moveu: boolean } | null = null;
  renderizador.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    arraste = { x: e.clientX, y: e.clientY, moveu: false };
    renderizador.domElement.setPointerCapture(e.pointerId);
  });
  renderizador.domElement.addEventListener("pointermove", (e) => {
    if (!arraste || !(e.buttons & 1)) return;
    const dx = e.clientX - arraste.x, dy = e.clientY - arraste.y;
    if (!arraste.moveu && Math.hypot(dx, dy) < 3) return;
    arraste = { x: e.clientX, y: e.clientY, moveu: true };
    const alvo = vista.controles.target;
    const s = new THREE.Spherical().setFromVector3(vista.camera.position.clone().sub(alvo));
    s.theta -= dx * 0.012;
    s.phi = THREE.MathUtils.clamp(s.phi - dy * 0.012, 0.01, Math.PI - 0.01);
    vista.camera.position.copy(alvo).add(new THREE.Vector3().setFromSpherical(s));
    vista.camera.lookAt(alvo);
    vista.controles.update();
  });
  renderizador.domElement.addEventListener("pointerup", () => setTimeout(() => (arraste = null)));
  renderizador.domElement.addEventListener("click", (e) => {
    if (arraste?.moveu) return; // foi arraste, não clique
    const z = zonaSob(e as PointerEvent);
    if (z) vista.orientar(z.dir.clone().normalize());
  });

  // A câmera do cubo olha na mesma direção da câmera principal.
  vista.aoDesenhar(() => {
    const dir = vista.camera.position.clone().sub(vista.controles.target).normalize();
    camera.position.copy(dir).multiplyScalar(5);
    camera.up.copy(vista.camera.up);
    camera.lookAt(0, 0, 0);
    renderizador.render(cena, camera);
  });
}
