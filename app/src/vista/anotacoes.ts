// Desenho das anotações 3D (PMI): linha de chamada (ou linha de cota) e uma
// etiqueta de texto que fica sempre de frente e do mesmo tamanho na tela.
// Tolerância geométrica: o texto "símbolo|valor|ref" vira caixinhas lado a lado.
import * as THREE from "three";
import type { Operacao } from "../nucleo/tipos";

const COR = "#1b4f9c";
const MAT_LINHA = new THREE.LineBasicMaterial({ color: COR, depthTest: false });
const MAT_PONTA = new THREE.MeshBasicMaterial({ color: COR, depthTest: false });
const texturas = new Map<string, { tex: THREE.CanvasTexture; prop: number }>();

function etiqueta(texto: string, caixas: boolean): { tex: THREE.CanvasTexture; prop: number } {
  const chave = `${caixas ? "C" : "T"}:${texto}`;
  const ja = texturas.get(chave);
  if (ja) return ja;
  const H = 64, pad = 14;
  const cv = document.createElement("canvas");
  const g = cv.getContext("2d")!;
  const fonte = "600 34px Segoe UI, Arial, sans-serif";
  g.font = fonte;
  const partes = caixas ? texto.split("|") : [texto];
  const larguras = partes.map((p) => g.measureText(p).width + pad * 2);
  cv.width = Math.ceil(larguras.reduce((s, w) => s + w, 0)) + 4;
  cv.height = H;
  g.font = fonte;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.fillRect(0, 0, cv.width, H);
  g.strokeStyle = COR;
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, cv.width - 3, H - 3);
  g.fillStyle = COR;
  g.textBaseline = "middle";
  let x = 2;
  partes.forEach((p, i) => {
    g.fillText(p, x + pad, H / 2 + 1);
    x += larguras[i];
    if (caixas && i < partes.length - 1) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const r = { tex, prop: cv.width / H };
  texturas.set(chave, r);
  return r;
}

const v = (p: number[]) => new THREE.Vector3(p[0], p[1], p[2]);

// Onde fica a etiqueta: ponto de base + deslocamento (dx, dy, dz) da operação.
export function baseDaAnotacao(op: Operacao): THREE.Vector3 {
  const a = op.ancoras ?? [];
  const base = op.opcoes?.tipo === "dimensao" && a.length >= 2 ? v(a[0]).add(v(a[1])).multiplyScalar(0.5) : v(a[0] ?? [0, 0, 0]);
  return base.add(new THREE.Vector3(op.params.dx ?? 0, op.params.dy ?? 0, op.params.dz ?? 0));
}

export function objetosDaAnotacao(op: Operacao): THREE.Object3D[] {
  const a = (op.ancoras ?? []).map(v);
  if (!a.length) return [];
  const rotulo = baseDaAnotacao(op);
  const lista: THREE.Object3D[] = [];
  const linha = (pts: THREE.Vector3[]) => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), MAT_LINHA);
    l.renderOrder = 9;
    lista.push(l);
  };
  if (op.opcoes?.tipo === "dimensao" && a.length >= 2) {
    // Linhas de chamada dos dois pontos até a linha de cota (afastada pelo deslocamento).
    const o = rotulo.clone().sub(a[0].clone().add(a[1]).multiplyScalar(0.5));
    const p1 = a[0].clone().add(o), p2 = a[1].clone().add(o);
    linha([a[0], p1]);
    linha([a[1], p2]);
    linha([p1, p2]);
    // Setas: dois risquinhos em cada ponta, no plano da cota.
    const d = p2.clone().sub(p1);
    const L = d.length();
    if (L > 1e-6) {
      d.normalize();
      const lado = o.lengthSq() > 1e-9 ? o.clone().normalize() : new THREE.Vector3(0, 1, 0).cross(d).normalize();
      const s = Math.min(3, L / 4);
      for (const [p, sinal] of [[p1, 1], [p2, -1]] as [THREE.Vector3, number][]) {
        linha([p.clone().addScaledVector(d, s * sinal).addScaledVector(lado, s * 0.35), p, p.clone().addScaledVector(d, s * sinal).addScaledVector(lado, -s * 0.35)]);
      }
    }
  } else {
    linha([a[0], rotulo]);
    const bola = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 10), MAT_PONTA);
    bola.position.copy(a[0]);
    bola.renderOrder = 9;
    lista.push(bola);
  }
  const { tex, prop } = etiqueta(op.texto ?? "", op.opcoes?.tipo === "tolerancia");
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
  const h = 0.032;
  sprite.scale.set(h * prop, h, 1);
  sprite.center.set(op.opcoes?.tipo === "dimensao" ? 0.5 : 0, 0.5);
  sprite.position.copy(rotulo);
  sprite.renderOrder = 10;
  lista.push(sprite);
  return lista;
}
