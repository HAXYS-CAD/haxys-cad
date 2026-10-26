// Análises visuais (painel Inspecionar): pintam a peça na tela, sem mudar nada.
// - Ângulo do modelo: verde = inclinação a favor da direção (≥ limite), amarelo
//   = entre −limite e +limite, vermelho = contra (≤ −limite). Com direção "para
//   cima" e 45°, o vermelho é o que precisa de suporte na impressão 3D;
// - Acessibilidade: verde = a face "vê" a direção, vermelho = de costas;
// - Zebra: listras de reflexo (mostram se as faces emendam lisas);
// - Mapa de ambiente: peça espelhada refletindo uma sala;
// - Mapa de curvatura: azul = plano, vermelho = curva fechada (raio pequeno);
//   com "raio mínimo", só o que tem raio menor que o limite fica vermelho.
// Diferenças do Fusion, por enquanto: a curvatura é estimada pela malha da tela;
// acessibilidade não considera o que fica escondido atrás de outras partes;
// sem pente de curvatura nem isocurvas.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { MalhaCorpo } from "../nucleo/tipos";

export type Analise =
  | { tipo: "angulo"; direcao: [number, number, number]; limite: number }
  | { tipo: "acessibilidade"; direcao: [number, number, number] }
  | { tipo: "zebra"; listras: number }
  | { tipo: "ambiente" }
  | { tipo: "curvatura"; raioMinimo: number }; // 0 = mapa contínuo

const VERTICE = `
  varying vec3 vNormalMundo;
  varying vec3 vPosMundo;
  varying vec3 vNormalVista;
  attribute float curvatura;
  varying float vCurv;
  void main() {
    vNormalMundo = normalize(mat3(modelMatrix) * normal);
    vNormalVista = normalize(normalMatrix * normal);
    vec4 pm = modelMatrix * vec4(position, 1.0);
    vPosMundo = pm.xyz;
    vCurv = curvatura;
    gl_Position = projectionMatrix * viewMatrix * pm;
  }`;

// Luz simples presa à câmera (como no resto do programa).
const LUZ = `float luz(vec3 nv) { return 0.45 + 0.55 * max(dot(normalize(nv), normalize(vec3(0.3, 0.6, 1.0))), 0.0); }`;

const FRAGMENTOS: Record<string, string> = {
  angulo: `
    uniform vec3 direcao; uniform float limite;
    varying vec3 vNormalMundo; varying vec3 vNormalVista; varying vec3 vPosMundo; varying float vCurv;
    ${LUZ}
    void main() {
      float a = degrees(asin(clamp(dot(normalize(vNormalMundo), normalize(direcao)), -1.0, 1.0)));
      vec3 cor = a >= limite ? vec3(0.25, 0.75, 0.3) : (a <= -limite ? vec3(0.85, 0.2, 0.2) : vec3(0.95, 0.8, 0.2));
      gl_FragColor = vec4(cor * luz(vNormalVista), 1.0);
    }`,
  acessibilidade: `
    uniform vec3 direcao;
    varying vec3 vNormalMundo; varying vec3 vNormalVista; varying vec3 vPosMundo; varying float vCurv;
    ${LUZ}
    void main() {
      float d = dot(normalize(vNormalMundo), normalize(direcao));
      vec3 cor = d > 1e-4 ? vec3(0.25, 0.75, 0.3) : vec3(0.85, 0.2, 0.2);
      gl_FragColor = vec4(cor * luz(vNormalVista), 1.0);
    }`,
  zebra: `
    uniform float listras;
    varying vec3 vNormalMundo; varying vec3 vNormalVista; varying vec3 vPosMundo; varying float vCurv;
    void main() {
      vec3 olho = normalize(vPosMundo - cameraPosition);
      vec3 r = reflect(olho, normalize(vNormalMundo));
      float s = step(0.5, fract(r.y * listras * 0.5 + 0.5));
      gl_FragColor = vec4(vec3(0.08 + 0.87 * s), 1.0);
    }`,
  curvatura: `
    uniform float raioMinimo;
    varying vec3 vNormalMundo; varying vec3 vNormalVista; varying vec3 vPosMundo; varying float vCurv;
    ${LUZ}
    void main() {
      vec3 cor;
      if (raioMinimo > 0.0) cor = (vCurv > 1.0 / raioMinimo) ? vec3(0.85, 0.2, 0.2) : vec3(0.75, 0.78, 0.82);
      else {
        float t = clamp(vCurv * 10.0, 0.0, 1.0); // curvatura 0,1/mm (raio 10) já é vermelho
        cor = t < 0.5 ? mix(vec3(0.2, 0.35, 0.9), vec3(0.2, 0.8, 0.3), t * 2.0) : mix(vec3(0.2, 0.8, 0.3), vec3(0.9, 0.2, 0.15), t * 2.0 - 1.0);
      }
      gl_FragColor = vec4(cor * luz(vNormalVista), 1.0);
    }`,
};

// Curvatura por vértice: média de |n_i − n_j| / |p_i − p_j| nas arestas dos triângulos.
export function curvaturaDaMalha(c: MalhaCorpo): Float32Array {
  const n = c.vertices.length / 3;
  const soma = new Float32Array(n), conta = new Float32Array(n);
  const t = c.triangulos;
  for (let i = 0; i < t.length; i += 3) {
    for (const [a, b] of [[t[i], t[i + 1]], [t[i + 1], t[i + 2]], [t[i + 2], t[i]]]) {
      const dp = Math.hypot(c.vertices[a * 3] - c.vertices[b * 3], c.vertices[a * 3 + 1] - c.vertices[b * 3 + 1], c.vertices[a * 3 + 2] - c.vertices[b * 3 + 2]);
      if (dp < 1e-9) continue;
      const dn = Math.hypot(c.normais[a * 3] - c.normais[b * 3], c.normais[a * 3 + 1] - c.normais[b * 3 + 1], c.normais[a * 3 + 2] - c.normais[b * 3 + 2]);
      const k = dn / dp;
      soma[a] += k; soma[b] += k; conta[a]++; conta[b]++;
    }
  }
  for (let i = 0; i < n; i++) soma[i] = conta[i] ? soma[i] / conta[i] : 0;
  return soma;
}

let materialAmbiente: THREE.MeshStandardMaterial | null = null;

// Material da análise (um só, reaproveitado; o ambiente precisa do renderizador).
export function materialDaAnalise(a: Analise, renderizador: THREE.WebGLRenderer): THREE.Material {
  if (a.tipo === "ambiente") {
    if (!materialAmbiente) {
      const pm = new THREE.PMREMGenerator(renderizador);
      materialAmbiente = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1,
        roughness: 0.08,
        envMap: pm.fromScene(new RoomEnvironment(), 0.04).texture,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
    }
    return materialAmbiente;
  }
  const uniforms: Record<string, THREE.IUniform> = {
    direcao: { value: new THREE.Vector3(...("direcao" in a ? a.direcao : [0, 1, 0])) },
    limite: { value: a.tipo === "angulo" ? a.limite : 0 },
    listras: { value: a.tipo === "zebra" ? a.listras : 8 },
    raioMinimo: { value: a.tipo === "curvatura" ? a.raioMinimo : 0 },
  };
  return new THREE.ShaderMaterial({
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTOS[a.tipo],
    uniforms,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}
