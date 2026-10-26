// Arraste de componente (painel Selecionar): com o botão ligado, segurar o
// botão esquerdo numa peça e arrastar move a peça (e o resto do componente dela)
// no plano da tela. Ao soltar, entra um "Mover" na linha do tempo (dá para
// desfazer e editar os números depois).
// Diferenças do Fusion: o movimento é livre no plano da tela (o Fusion respeita
// as juntas ao arrastar); corpos de malha não são arrastados.
import * as THREE from "three";
import type { Vista } from "./cena";
import type { Projeto } from "../nucleo/projeto";
import type { MalhaCorpo, Operacao } from "../nucleo/tipos";

export function criarArraste(vista: Vista, projeto: Projeto, avisar: (t: string) => void) {
  let ligado = false;
  let arrastando: { plano: THREE.Plane; inicio: THREE.Vector3; corpos: string[]; op: Operacao; enviado: number } | null = null;
  const raio = new THREE.Raycaster();
  const naTela = (e: PointerEvent) => {
    const r = vista.tela.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };

  // Corpos que andam junto: o componente do corpo (último Novo componente/Duplicar).
  const grupoDe = (nome: string): string[] => {
    for (const o of [...projeto.estado.historico].reverse()) {
      if (o.suprimida) continue;
      const nomes = o.tipo === "componente" ? (o.corpos ?? []) : o.tipo === "duplicarJuntas" ? (o.opcoes?.nomes ?? "").split(",") : [];
      if (nomes.includes(nome)) return nomes.filter(Boolean);
    }
    return [nome];
  };

  // Escutas "capture": chegam antes da seleção, que fica parada durante o arraste.
  vista.tela.addEventListener(
    "pointerdown",
    (e) => {
      if (!ligado || e.button !== 0 || vista.modoAtual() !== "selecionar") return;
      raio.setFromCamera(naTela(e), vista.camera);
      const acerto = raio.intersectObjects(vista.grupoCorpos.children, true).find((a) => (a.object as THREE.Mesh).userData?.corpo);
      if (!acerto) return;
      const c = (acerto.object as THREE.Mesh).userData.corpo as MalhaCorpo;
      if (c.ehMalha) return avisar("Corpo de malha não é arrastado (use Mover/copiar).");
      e.stopImmediatePropagation();
      const normal = vista.camera.getWorldDirection(new THREE.Vector3()).negate();
      const corpos = grupoDe(c.nome);
      arrastando = {
        plano: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, acerto.point),
        inicio: acerto.point.clone(),
        corpos,
        op: { id: crypto.randomUUID(), tipo: "mover", nome: projeto.proximoNome("Arrastar"), modo: "novo", params: { dx: 0, dy: 0, dz: 0 }, corpos, opcoes: { pivo: "centro", copiar: "nao" } },
        enviado: 0,
      };
      vista.tela.setPointerCapture(e.pointerId);
    },
    true,
  );
  const deslocamento = (e: PointerEvent) => {
    if (!arrastando) return null;
    raio.setFromCamera(naTela(e), vista.camera);
    const p = raio.ray.intersectPlane(arrastando.plano, new THREE.Vector3());
    if (!p) return null;
    const d = p.sub(arrastando.inicio);
    const r = (v: number) => Math.round(v * 100) / 100;
    return { dx: r(d.x), dy: r(d.y), dz: r(d.z) };
  };
  vista.tela.addEventListener(
    "pointermove",
    (e) => {
      if (!arrastando) return;
      e.stopImmediatePropagation();
      const d = deslocamento(e);
      // Uma prévia de cada vez (o núcleo recalcula a peça a cada uma).
      if (!d || projeto.estado.calculando) return;
      arrastando.op = { ...arrastando.op, params: d };
      projeto.previsualizar(arrastando.op);
    },
    true,
  );
  vista.tela.addEventListener(
    "pointerup",
    (e) => {
      if (!arrastando) return;
      e.stopImmediatePropagation();
      const d = deslocamento(e) ?? arrastando.op.params;
      const op = { ...arrastando.op, params: d };
      arrastando = null;
      projeto.previsualizar(null);
      if (!d.dx && !d.dy && !d.dz) return;
      projeto.adicionar(op);
      avisar(`${op.nome}: ${op.corpos!.join(", ")} andou ${[d.dx, d.dy, d.dz].map((v) => v.toLocaleString("pt-BR")).join(" / ")} mm (X/Y/Z).`);
    },
    true,
  );

  return {
    alternar() {
      ligado = !ligado;
      vista.tela.style.cursor = ligado ? "move" : "default";
      return ligado;
    },
    ligado: () => ligado,
  };
}
