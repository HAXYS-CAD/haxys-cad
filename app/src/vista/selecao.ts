// Seleção com o mouse na janela 3D: corpo, face e aresta.
// Passar o mouse destaca em azul claro; clicar seleciona em azul.
// Ctrl ou Shift + clique soma/retira da seleção. Clicar no vazio ou Esc limpa.
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { MalhaCorpo } from "../nucleo/tipos";
import type { Vista } from "./cena";
import { somarNoToque } from "../ui/celular";

// "livre" = o que estiver mais perto do mouse (aresta ganha se estiver a poucos pixels).
export type Prioridade = "livre" | "corpo" | "face" | "aresta";

export interface ItemSelecionado {
  corpo: string; // nome do corpo, ex.: "Corpo1"
  tipo: "corpo" | "face" | "aresta";
  indice: number; // número da face/aresta no corpo; -1 para o corpo inteiro
}

export interface Selecao {
  itens(): ItemSelecionado[];
  definirPrioridade(p: Prioridade): void;
  prioridade(): Prioridade;
  limpar(): void;
  alternarCorpo(nome: string, somar: boolean): void;
  // Dentro de um comando (ex.: Arredondamento) cada clique soma ou retira.
  definirSempreSomar(sim: boolean): void;
  // Desligada enquanto o esboço ou a Extrusão usam o mouse.
  definirAtiva(sim: boolean): void;
  // Chamar depois que os corpos forem redesenhados.
  corposMudaram(): void;
  // Troca a lista inteira (Inverter seleção, Por tamanho, Por nome...).
  definirItens(itens: ItemSelecionado[]): void;
}

const DISTANCIA_ARESTA_PX = 6;

const COR_PASSANDO = 0x6fb2ff;
const COR_SELECIONADO = 0x1f6fe0;

function materialFace(cor: number, opacidade: number) {
  return new THREE.MeshBasicMaterial({
    color: cor,
    transparent: true,
    opacity: opacidade,
    depthWrite: false,
    polygonOffset: true, // desenha por cima da face original
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}
// Faces: passar o mouse clareia a peça (brilho de metal); selecionada fica
// mais clara, com um toque de azul para não confundir com a de passar.
const FACE_PASSANDO = materialFace(0xffffff, 0.28);
const FACE_SELECIONADA = materialFace(0xe3eeff, 0.5);
const ARESTA_PASSANDO = new LineMaterial({ color: COR_PASSANDO, linewidth: 4 });
const ARESTA_SELECIONADA = new LineMaterial({ color: COR_SELECIONADO, linewidth: 4 });

const mesmo = (a: ItemSelecionado, b: ItemSelecionado) =>
  a.corpo === b.corpo && a.tipo === b.tipo && a.indice === b.indice;

// ---- Geometria de uma face ou aresta, a partir dos grupos do núcleo ----

function geometriaFace(c: MalhaCorpo, faces: number[]): THREE.BufferGeometry {
  const indices: number[] = [];
  for (const f of faces) {
    const inicio = c.gruposFaces[f * 2];
    const qtd = c.gruposFaces[f * 2 + 1];
    for (let i = inicio; i < inicio + qtd; i++) indices.push(c.triangulos[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(c.vertices, 3));
  g.setIndex(indices);
  return g;
}

function pontosAresta(c: MalhaCorpo, aresta: number): Float32Array {
  const inicio = c.gruposArestas[aresta * 2];
  const qtd = c.gruposArestas[aresta * 2 + 1];
  return c.arestas.subarray(inicio * 3, (inicio + qtd) * 3);
}

function numeroDaFace(c: MalhaCorpo, triangulo: number): number {
  const pos = triangulo * 3;
  for (let f = 0; f < c.gruposFaces.length / 2; f++) {
    const inicio = c.gruposFaces[f * 2];
    if (pos >= inicio && pos < inicio + c.gruposFaces[f * 2 + 1]) return f;
  }
  return -1;
}

// Área da face (mm²) e comprimento da aresta (mm), para o resumo da seleção.
function areaFace(c: MalhaCorpo, f: number): number {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  const inicio = c.gruposFaces[f * 2];
  const qtd = c.gruposFaces[f * 2 + 1];
  let soma = 0;
  for (let i = inicio; i < inicio + qtd; i += 3) {
    a.fromArray(c.vertices, c.triangulos[i] * 3);
    b.fromArray(c.vertices, c.triangulos[i + 1] * 3);
    d.fromArray(c.vertices, c.triangulos[i + 2] * 3);
    soma += b.sub(a).cross(d.sub(a)).length() / 2;
  }
  return soma;
}

function comprimentoAresta(c: MalhaCorpo, e: number): number {
  const p = pontosAresta(c, e);
  let soma = 0;
  for (let i = 0; i + 5 < p.length; i += 6) {
    soma += Math.hypot(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]);
  }
  return soma;
}

export function descrever(itens: ItemSelecionado[], corpos: MalhaCorpo[]): string {
  if (itens.length === 0) return "";
  if (itens.length > 1) return `${itens.length} itens selecionados`;
  const [it] = itens;
  const c = corpos.find((x) => x.nome === it.corpo);
  if (!c) return "";
  if (it.tipo === "face") return `Face · ${it.corpo} · Área ${areaFace(c, it.indice).toFixed(2)} mm²`;
  if (it.tipo === "aresta")
    return `Aresta · ${it.corpo} · Comprimento ${comprimentoAresta(c, it.indice).toFixed(2)} mm`;
  return `Corpo · ${it.corpo}`;
}

export function criarSelecao(vista: Vista, aoMudar: (itens: ItemSelecionado[]) => void): Selecao {
  let prioridade: Prioridade = "livre";
  let selecionados: ItemSelecionado[] = [];
  let passando: ItemSelecionado | null = null;
  let sempreSomar = false;
  let ativa = true;

  const destaque = new THREE.Group();
  destaque.renderOrder = 2;
  vista.cena.add(destaque);

  const raio = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const corpos = (): THREE.Mesh[] => vista.grupoSelecionavel.children as THREE.Mesh[];
  const malhaDe = (nome: string) => corpos().find((m) => m.name === nome);

  // ---- Achar o que está sob o mouse ----

  function itemSob(x: number, y: number): ItemSelecionado | null {
    const r = vista.tela.getBoundingClientRect();
    mouse.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(mouse, vista.camera);
    const acerto = raio.intersectObjects(corpos(), false)[0];

    // Aresta mais próxima na tela, que não esteja escondida atrás de uma face.
    let aresta: ItemSelecionado | null = null;
    if (prioridade === "livre" || prioridade === "aresta") {
      let melhor = DISTANCIA_ARESTA_PX;
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      const sa = new THREE.Vector2(), sb = new THREE.Vector2();
      const pm = new THREE.Vector2(x - r.left, y - r.top);
      const limite = acerto ? acerto.distance + 0.5 : Infinity;
      const naTela = (v: THREE.Vector3, s: THREE.Vector2) => {
        const p = v.clone().project(vista.camera);
        s.set(((p.x + 1) / 2) * r.width, ((1 - p.y) / 2) * r.height);
        return p.z < 1;
      };
      for (const m of corpos()) {
        const c = m.userData.corpo as MalhaCorpo;
        for (let e = 0; e < c.gruposArestas.length / 2; e++) {
          const p = pontosAresta(c, e);
          for (let i = 0; i + 5 < p.length; i += 6) {
            a.fromArray(p, i);
            b.fromArray(p, i + 3);
            if (!naTela(a, sa) || !naTela(b, sb)) continue;
            // Distância do mouse ao segmento na tela.
            const seg = sb.clone().sub(sa);
            const t = THREE.MathUtils.clamp(pm.clone().sub(sa).dot(seg) / Math.max(seg.lengthSq(), 1e-9), 0, 1);
            const d = sa.clone().addScaledVector(seg, t).distanceTo(pm);
            if (d >= melhor) continue;
            const ponto = a.clone().lerp(b, t);
            if (ponto.distanceTo(raio.ray.origin) > limite) continue; // atrás da face
            melhor = d;
            aresta = { corpo: c.nome, tipo: "aresta", indice: e };
          }
        }
      }
    }
    if (aresta) return aresta;
    if (!acerto || prioridade === "aresta") return null;
    const c = (acerto.object as THREE.Mesh).userData.corpo as MalhaCorpo;
    if (prioridade === "corpo") return { corpo: c.nome, tipo: "corpo", indice: -1 };
    const f = numeroDaFace(c, acerto.faceIndex ?? -1);
    return f < 0 ? null : { corpo: c.nome, tipo: "face", indice: f };
  }

  // ---- Desenhar o destaque ----

  function desenharItem(it: ItemSelecionado, selecionado: boolean) {
    const m = malhaDe(it.corpo);
    if (!m) return;
    const c = m.userData.corpo as MalhaCorpo;
    if (it.tipo === "aresta") {
      const g = new LineSegmentsGeometry().setPositions(pontosAresta(c, it.indice));
      const linha = new LineSegments2(g, selecionado ? ARESTA_SELECIONADA : ARESTA_PASSANDO);
      linha.renderOrder = 3;
      destaque.add(linha);
    } else {
      const todas = Array.from({ length: c.gruposFaces.length / 2 }, (_, i) => i);
      const faces = it.tipo === "corpo" ? todas : [it.indice];
      destaque.add(new THREE.Mesh(geometriaFace(c, faces), selecionado ? FACE_SELECIONADA : FACE_PASSANDO));
    }
  }

  function redesenhar() {
    for (const o of [...destaque.children]) {
      destaque.remove(o);
      (o as THREE.Mesh).geometry.dispose();
    }
    selecionados.forEach((it) => desenharItem(it, true));
    if (passando && !selecionados.some((s) => mesmo(s, passando!))) desenharItem(passando, false);
  }

  // As linhas grossas precisam saber o tamanho da tela.
  vista.aoDesenhar(() => {
    const { width, height } = vista.tela;
    ARESTA_PASSANDO.resolution.set(width, height);
    ARESTA_SELECIONADA.resolution.set(width, height);
  });

  function mudar(novos: ItemSelecionado[]) {
    selecionados = novos;
    redesenhar();
    aoMudar(selecionados);
  }

  function clicar(it: ItemSelecionado | null, somar: boolean) {
    somar ||= sempreSomar;
    if (!it) return somar ? undefined : mudar([]);
    if (!somar) return mudar([it]);
    const ja = selecionados.some((s) => mesmo(s, it));
    mudar(ja ? selecionados.filter((s) => !mesmo(s, it)) : [...selecionados, it]);
  }

  // ---- Mouse ----

  let pendente = false;
  let ultimo = { x: 0, y: 0 };
  vista.tela.addEventListener("pointermove", (e) => {
    ultimo = { x: e.clientX, y: e.clientY };
    if (pendente) return;
    pendente = true;
    requestAnimationFrame(() => {
      pendente = false;
      const novo =
        ativa && vista.modoAtual() === "selecionar" && e.buttons === 0 ? itemSob(ultimo.x, ultimo.y) : null;
      if ((novo && passando && mesmo(novo, passando)) || novo === passando) return;
      passando = novo;
      redesenhar();
    });
  });
  vista.tela.addEventListener("pointerleave", () => {
    passando = null;
    redesenhar();
  });

  // Clique = apertar e soltar o botão esquerdo quase no mesmo lugar.
  // Shift/Ctrl + arrastar = seleção de janela (arrastar sem tecla orbita a vista):
  // da esquerda para a direita pega o que fica todo dentro; da direita para a
  // esquerda pega o que encosta (como no Fusion). Ctrl soma à seleção.
  let inicio: { x: number; y: number } | null = null;
  let comJanela = false;
  const janela = document.createElement("div");
  janela.className = "janela-selecao";
  janela.hidden = true;
  vista.tela.parentElement?.appendChild(janela);
  vista.tela.addEventListener("pointerdown", (e) => {
    inicio = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    comJanela = e.shiftKey || e.ctrlKey;
  });
  vista.tela.addEventListener("pointermove", (e) => {
    if (!inicio || !comJanela || !ativa || !(e.buttons & 1) || vista.modoAtual() !== "selecionar") return;
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) <= 6) return;
    const pai = vista.tela.getBoundingClientRect();
    const [x0, x1] = [Math.min(inicio.x, e.clientX), Math.max(inicio.x, e.clientX)];
    const [y0, y1] = [Math.min(inicio.y, e.clientY), Math.max(inicio.y, e.clientY)];
    janela.hidden = false;
    janela.classList.toggle("cruzando", e.clientX < inicio.x);
    Object.assign(janela.style, { left: `${x0 - pai.left}px`, top: `${y0 - pai.top}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  });
  vista.tela.addEventListener("pointerup", (e) => {
    const estava = !janela.hidden;
    janela.hidden = true;
    if (!ativa || !inicio || e.button !== 0 || vista.modoAtual() !== "selecionar") return;
    if (estava) return selecionarJanela(inicio, { x: e.clientX, y: e.clientY }, e.ctrlKey);
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > (e.pointerType === "touch" ? 12 : 4)) return;
    clicar(itemSob(e.clientX, e.clientY), e.ctrlKey || e.shiftKey || somarNoToque);
  });

  function selecionarJanela(a: { x: number; y: number }, b: { x: number; y: number }, somar: boolean) {
    const r = vista.tela.getBoundingClientRect();
    const [x0, x1] = [Math.min(a.x, b.x) - r.left, Math.max(a.x, b.x) - r.left];
    const [y0, y1] = [Math.min(a.y, b.y) - r.top, Math.max(a.y, b.y) - r.top];
    const cruzando = b.x < a.x;
    const v = new THREE.Vector3();
    const dentro = (arr: ArrayLike<number>, indices: Iterable<number>) => {
      let algum = false, todos = true;
      for (const i of indices) {
        v.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).project(vista.camera);
        const sx = ((v.x + 1) / 2) * r.width, sy = ((1 - v.y) / 2) * r.height;
        const ok = sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
        algum ||= ok;
        todos &&= ok;
      }
      return cruzando ? algum : todos;
    };
    const achados: ItemSelecionado[] = [];
    for (const m of corpos()) {
      const c = m.userData.corpo as MalhaCorpo;
      if (prioridade === "face") {
        for (let f = 0; f < c.gruposFaces.length / 2; f++) {
          const ini = c.gruposFaces[f * 2], qtd = c.gruposFaces[f * 2 + 1];
          const idx = Array.from({ length: qtd }, (_, k) => c.triangulos[ini + k]);
          if (dentro(c.vertices, idx)) achados.push({ corpo: c.nome, tipo: "face", indice: f });
        }
      } else if (prioridade === "aresta") {
        for (let e = 0; e < c.gruposArestas.length / 2; e++) {
          const ini = c.gruposArestas[e * 2], qtd = c.gruposArestas[e * 2 + 1];
          if (dentro(c.arestas, Array.from({ length: qtd }, (_, k) => ini + k))) achados.push({ corpo: c.nome, tipo: "aresta", indice: e });
        }
      } else if (dentro(c.vertices, Array.from({ length: c.vertices.length / 3 }, (_, k) => k))) achados.push({ corpo: c.nome, tipo: "corpo", indice: -1 });
    }
    const novos = somar || sempreSomar ? [...selecionados, ...achados.filter((x) => !selecionados.some((s) => mesmo(s, x)))] : achados;
    mudar(novos);
  }

  return {
    itens: () => selecionados,
    definirPrioridade(p) {
      prioridade = p;
      passando = null;
      redesenhar();
    },
    prioridade: () => prioridade,
    definirSempreSomar(sim) {
      sempreSomar = sim;
    },
    definirAtiva(sim) {
      ativa = sim;
      passando = null;
      if (!sim) mudar([]);
      else redesenhar();
    },
    limpar: () => mudar([]),
    definirItens: (itens) => mudar(itens),
    alternarCorpo(nome, somar) {
      clicar({ corpo: nome, tipo: "corpo", indice: -1 }, somar);
    },
    corposMudaram() {
      // Mantém só o que ainda existe depois do recálculo.
      passando = null;
      const validos = selecionados.filter((it) => {
        const m = malhaDe(it.corpo);
        if (!m) return false;
        const c = m.userData.corpo as MalhaCorpo;
        if (it.tipo === "face") return it.indice < c.gruposFaces.length / 2;
        if (it.tipo === "aresta") return it.indice < c.gruposArestas.length / 2;
        return true;
      });
      if (validos.length !== selecionados.length) mudar(validos);
      else redesenhar();
    },
  };
}
