// Furo (painel Criar). Com a janela aberta, clique numa face plana: cada clique
// põe um furo ali (o último pode ter a posição X/Y/Z ajustada na janela).
// Tipos: simples, rebaixo (counterbore) e escareado (countersink, 90°);
// ponta de broca 118° ou plana; extensão por distância ou "Através de tudo".
// Diferenças do Fusion, por enquanto: sem rosca, sem cotar a posição a partir
// das arestas (usa X/Y/Z), sem furo a partir de pontos de esboço.
import * as THREE from "three";
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import { planoDaFace } from "../nucleo/construcao";
import type { MalhaCorpo, Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { Vista } from "../vista/cena";
import type { V3 } from "../nucleo/esboco";

export const COMANDO_FURO = "FusionHoleCommand";

type Furo = { ponto: V3; normal: V3 };

let ativo: { furos: Furo[]; aoClicar(f: Furo): void } | null = null;

export function furoAberto() {
  return ativo !== null;
}

// Pontos dos furos do comando aberto (a tela desenha uma marquinha em cada um).
export function marcasDeFuro(): V3[] {
  return ativo?.furos.map((f) => f.ponto) ?? [];
}

const arred = (v: number) => Math.round(v * 1000) / 1000;

// Liga o clique nas faces (uma vez só, no começo do programa).
export function ligarCliquesDeFuro(vista: Vista, avisar: (t: string) => void) {
  const raio = new THREE.Raycaster();
  let inicio: { x: number; y: number } | null = null;
  vista.tela.addEventListener("pointerdown", (e) => {
    inicio = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  });
  vista.tela.addEventListener("pointerup", (e) => {
    if (!ativo || !inicio || e.button !== 0 || vista.modoAtual() !== "selecionar") return;
    if (Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 4) return;
    const r = vista.tela.getBoundingClientRect();
    raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), vista.camera);
    const acerto = raio.intersectObjects(vista.grupoSelecionavel.children, false)[0];
    if (!acerto || acerto.faceIndex == null) return;
    const c = acerto.object.userData.corpo as MalhaCorpo;
    const pos = acerto.faceIndex * 3;
    let f = -1;
    for (let i = 0; i < c.gruposFaces.length / 2; i++)
      if (pos >= c.gruposFaces[i * 2] && pos < c.gruposFaces[i * 2] + c.gruposFaces[i * 2 + 1]) f = i;
    const plano = f >= 0 ? planoDaFace(c, f) : null;
    if (!plano) return avisar("O furo precisa de uma face plana.");
    const p = acerto.point;
    ativo.aoClicar({ ponto: [arred(p.x), arred(p.y), arred(p.z)], normal: plano.normal });
  });
}

export function comandoFuro(raiz: HTMLElement, projeto: Projeto, aoMudarMarcas: () => void, existente?: Operacao) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Furo");
  const furos: Furo[] = structuredClone(existente?.furos ?? []);
  let ultimo: { params: Record<string, number>; opcoes: Record<string, string> } = { params: {}, opcoes: {} };

  const montar = (): Operacao => ({
    id,
    tipo: "furo",
    nome,
    modo: "cortar",
    params: ultimo.params,
    opcoes: ultimo.opcoes,
    furos: structuredClone(furos),
    suprimida: existente?.suprimida,
  });
  const texto = () => (furos.length ? `${furos.length} furo${furos.length > 1 ? "s" : ""}` : "Nenhum — clique numa face plana");
  const mostrarPrevia = () => projeto.previsualizar(furos.length ? montar() : null);

  const fechar = () => {
    ativo = null;
    aoMudarMarcas();
  };

  const p = existente?.params ?? {};
  const o = existente?.opcoes ?? {};
  const ult = furos[furos.length - 1]?.ponto ?? [0, 0, 0];
  const dialogo: Dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Furo",
    campos: [
      { chave: "diametro", rotulo: "Diâmetro", valor: p.diametro ?? 6 },
      { chave: "profundidade", rotulo: "Profundidade", valor: p.profundidade ?? 10 },
      { chave: "diametroRebaixo", rotulo: "Ø do rebaixo", valor: p.diametroRebaixo ?? 10 },
      { chave: "profundidadeRebaixo", rotulo: "Prof. do rebaixo", valor: p.profundidadeRebaixo ?? 3 },
      { chave: "diametroEscareado", rotulo: "Ø do escareado", valor: p.diametroEscareado ?? 10 },
      { chave: "posX", rotulo: "Último furo X", valor: ult[0] },
      { chave: "posY", rotulo: "Último furo Y", valor: ult[1] },
      { chave: "posZ", rotulo: "Último furo Z", valor: ult[2] },
    ],
    escolhas: [
      { chave: "tipo", rotulo: "Tipo", opcoes: [["simples", "Simples"], ["rebaixo", "Rebaixo"], ["escareado", "Escareado (90°)"]], valor: o.tipo ?? "simples" },
      { chave: "extensao", rotulo: "Extensão", opcoes: [["distancia", "Distância"], ["atraves", "Através de tudo"]], valor: o.extensao ?? "distancia" },
      { chave: "ponta", rotulo: "Ponta", opcoes: [["118", "Broca (118°)"], ["plana", "Plana"]], valor: o.ponta ?? "118" },
    ],
    modo: "cortar",
    semModo: true,
    selecao: texto(),
    rotuloSelecao: "Posição",
    aoMudar: (params, _m, opcoes) => {
      const { posX, posY, posZ, ...resto } = params;
      ultimo = { params: resto, opcoes };
      // Campos X/Y/Z mexem no último furo clicado.
      const f = furos[furos.length - 1];
      if (f && [posX, posY, posZ].every(Number.isFinite)) f.ponto = [posX, posY, posZ];
      aoMudarMarcas();
      mostrarPrevia();
    },
    aoOK: (params, _m, opcoes) => {
      const { posX: _x, posY: _y, posZ: _z, ...resto } = params;
      ultimo = { params: resto, opcoes };
      fechar();
      if (!furos.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else projeto.adicionar(montar());
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  ativo = {
    furos,
    aoClicar(f) {
      furos.push(f);
      dialogo.definirSelecao(texto());
      dialogo.definirCampo("posX", f.ponto[0]);
      dialogo.definirCampo("posY", f.ponto[1]);
      dialogo.definirCampo("posZ", f.ponto[2]);
      aoMudarMarcas();
      mostrarPrevia();
    },
  };
  aoMudarMarcas();
}
