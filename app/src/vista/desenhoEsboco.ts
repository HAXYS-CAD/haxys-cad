// Desenha um esboço na cena: curvas, pontos e perfis (regiões fechadas sombreadas).
import * as THREE from "three";
import {
  amostrarCurva,
  contornoDoLaco,
  eixoY,
  idsDaCurva,
  perfis,
  type DadosEsboco,
  type PlanoEsboco,
} from "../nucleo/esboco";

export const COR_CURVA = 0x2a62c9; // curvas do esboço (azul, como no Fusion)
export const COR_PERFIL = 0xf2b56b; // regiões fechadas (laranja claro)

const MATERIAL_CURVA = new THREE.LineBasicMaterial({ color: COR_CURVA, depthTest: false });
// Curva totalmente definida (nada mais pode mexer nela): preta, como no Fusion.
const MATERIAL_CURVA_DEFINIDA = new THREE.LineBasicMaterial({ color: 0x111418, depthTest: false });
const MATERIAL_CONTROLE = new THREE.LineDashedMaterial({ color: 0x8a94a3, dashSize: 1.5, gapSize: 1, depthTest: false });
const MATERIAL_PONTO = new THREE.PointsMaterial({ color: COR_CURVA, size: 6, sizeAttenuation: false, depthTest: false });
export const MATERIAL_PERFIL = new THREE.MeshBasicMaterial({
  color: COR_PERFIL,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// Matriz que leva coordenadas do plano (u, v, 0) para o mundo.
export function matrizDoPlano(p: PlanoEsboco): THREE.Matrix4 {
  const x = new THREE.Vector3(...p.eixoX);
  const y = new THREE.Vector3(...eixoY(p));
  const z = new THREE.Vector3(...p.normal);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...p.origem);
}

export function pontosDaCurva(e: DadosEsboco, curvaId: number): THREE.Vector3[] {
  const c = e.curvas.find((x) => x.id === curvaId)!;
  return amostrarCurva(e, c).map(([u, v]) => new THREE.Vector3(u, v, 0));
}

export interface OpcoesDesenho {
  idOperacao?: string; // para a Extrusão saber de qual esboço é o perfil
  materialCurva?: THREE.LineBasicMaterial;
  definidas?: Set<number>; // ids das curvas totalmente definidas (ficam pretas)
  comPontos?: boolean;
}

// Grupo com as curvas (em "curvas") e os perfis (em "perfis", um Mesh por perfil).
export function desenharEsboco(e: DadosEsboco, o: OpcoesDesenho = {}): THREE.Group {
  const grupo = new THREE.Group();
  grupo.matrixAutoUpdate = false;
  grupo.matrix.copy(matrizDoPlano(e.plano));
  grupo.userData.esboco = o.idOperacao;

  const curvas = new THREE.Group();
  curvas.name = "curvas";
  for (const c of e.curvas) {
    const g = new THREE.BufferGeometry().setFromPoints(pontosDaCurva(e, c.id));
    const linha = new THREE.Line(g, o.materialCurva ?? (o.definidas?.has(c.id) ? MATERIAL_CURVA_DEFINIDA : MATERIAL_CURVA));
    linha.renderOrder = 4;
    linha.userData.curva = c.id;
    curvas.add(linha);
  }
  grupo.add(curvas);

  // Spline de pontos de controle: o polígono de controle aparece tracejado.
  if (o.comPontos !== false)
    for (const c of e.curvas) {
      if (c.tipo !== "spline" || !c.controle) continue;
      const ids = idsDaCurva(c);
      if (c.a === c.b) ids.push(c.a);
      const pts = ids.map((id) => e.pontos.find((p) => p.id === id)!).map((p) => new THREE.Vector3(p.u, p.v, 0));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), MATERIAL_CONTROLE);
      l.computeLineDistances();
      l.renderOrder = 4;
      grupo.add(l);
    }

  if (o.comPontos !== false && e.pontos.length) {
    const g = new THREE.BufferGeometry().setFromPoints(e.pontos.map((p) => new THREE.Vector3(p.u, p.v, 0)));
    const pts = new THREE.Points(g, MATERIAL_PONTO);
    pts.renderOrder = 5;
    grupo.add(pts);
  }

  const grupoPerfis = new THREE.Group();
  grupoPerfis.name = "perfis";
  perfis(e).forEach((perfil, indice) => {
    const forma = new THREE.Shape(contornoDoLaco(perfil.externo).map(([u, v]) => new THREE.Vector2(u, v)));
    for (const f of perfil.furos) {
      forma.holes.push(new THREE.Path(contornoDoLaco(f).map(([u, v]) => new THREE.Vector2(u, v))));
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(forma), MATERIAL_PERFIL);
    m.renderOrder = 3;
    m.userData = { esboco: o.idOperacao, indice };
    grupoPerfis.add(m);
  });
  grupo.add(grupoPerfis);
  grupo.updateMatrixWorld(true);
  return grupo;
}

export function liberar(grupo: THREE.Object3D) {
  grupo.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}
