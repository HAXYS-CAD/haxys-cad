// Cliques em esboços terminados, usados pela Extrusão e pela Revolução:
// - perfil (região laranja): clique escolhe/retira;
// - curva do esboço (só quando o comando pede: eixo da Revolução, caminho da Varredura).
import * as THREE from "three";
import type { Vista } from "../vista/cena";

export interface Escolhedor {
  perfilEscolhido(esboco: string, indice: number): boolean;
  aoClicarPerfil(esboco: string, indice: number): void;
  linhaEscolhida?(esboco: string, curva: number): boolean;
  // Só se o comando aceita curva. Devolve false se a curva não serve (o clique vira escolha de região).
  aoClicarLinha?(esboco: string, curva: number): boolean;
}

let ativo: Escolhedor | null = null;
let sobre: { esboco: string; indice: number } | null = null;

export function definirEscolhedor(e: Escolhedor | null) {
  ativo = e;
  sobre = null;
}

export function escolhaAberta(): boolean {
  return ativo !== null;
}

// A tela pergunta isto ao desenhar os perfis, para pintar os escolhidos.
export function estadoPerfil(esboco: string, indice: number): "escolhido" | "sobre" | "normal" {
  if (ativo?.perfilEscolhido(esboco, indice)) return "escolhido";
  if (sobre?.esboco === esboco && sobre.indice === indice) return "sobre";
  return "normal";
}

export function linhaEscolhida(esboco: string, curva: number): boolean {
  return ativo?.linhaEscolhida?.(esboco, curva) ?? false;
}

const PIXELS_LINHA = 8;

// Liga os cliques. "grupo" = todos os esboços visíveis; "redesenhar" pinta de novo.
export function ligarCliquesDePerfil(vista: Vista, grupo: THREE.Group, redesenhar: () => void) {
  const raio = new THREE.Raycaster();

  function linhaSob(x: number, y: number): { esboco: string; curva: number } | null {
    const r = vista.tela.getBoundingClientRect();
    const m = new THREE.Vector2(x - r.left, y - r.top);
    const naTela = (v: THREE.Vector3) => {
      const p = v.clone().project(vista.camera);
      return new THREE.Vector2(((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height);
    };
    let melhor = PIXELS_LINHA;
    let achou: { esboco: string; curva: number } | null = null;
    for (const esboco of grupo.children) {
      const curvas = esboco.getObjectByName("curvas");
      for (const linha of curvas?.children ?? []) {
        // Linha reta (2 pontos) ou arco/círculo (vários pontos): mede pedaço por pedaço.
        const pos = (linha as THREE.Line).geometry.getAttribute("position");
        for (let k = 0; k + 1 < pos.count; k++) {
          const a = naTela(new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(linha.matrixWorld));
          const b = naTela(new THREE.Vector3().fromBufferAttribute(pos, k + 1).applyMatrix4(linha.matrixWorld));
          const seg = b.clone().sub(a);
          const t = THREE.MathUtils.clamp(m.clone().sub(a).dot(seg) / Math.max(seg.lengthSq(), 1e-9), 0, 1);
          const d = a.clone().addScaledVector(seg, t).distanceTo(m);
          if (d < melhor) (melhor = d), (achou = { esboco: esboco.userData.esboco, curva: linha.userData.curva });
        }
      }
    }
    return achou;
  }

  function perfilSob(x: number, y: number) {
    const r = vista.tela.getBoundingClientRect();
    raio.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), vista.camera);
    const malhas: THREE.Object3D[] = [];
    grupo.traverse((o) => o.parent?.name === "perfis" && malhas.push(o));
    const acerto = raio.intersectObjects(malhas, false)[0];
    return acerto ? (acerto.object.userData as { esboco: string; indice: number }) : null;
  }

  let inicio: { x: number; y: number } | null = null;
  vista.tela.addEventListener("pointerdown", (e) => {
    inicio = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  });
  vista.tela.addEventListener("pointerup", (e) => {
    if (!ativo || !inicio || e.button !== 0 || vista.modoAtual() !== "selecionar") return;
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 4) return;
    if (ativo.aoClicarLinha) {
      const l = linhaSob(e.clientX, e.clientY);
      if (l && ativo.aoClicarLinha(l.esboco, l.curva)) return;
    }
    const p = perfilSob(e.clientX, e.clientY);
    if (p) ativo.aoClicarPerfil(p.esboco, p.indice);
  });
  vista.tela.addEventListener("pointermove", (e) => {
    if (!ativo || e.buttons) return;
    const p = perfilSob(e.clientX, e.clientY);
    if (p?.esboco === sobre?.esboco && p?.indice === sobre?.indice) return;
    sobre = p;
    redesenhar();
  });
}
