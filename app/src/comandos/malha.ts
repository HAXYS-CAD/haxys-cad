// Inserir malha (aba MALHA): traz um STL ou OBJ como corpo de malha (só
// triângulos). Unidade do arquivo, Z para cima e posição. O arquivo vai
// dentro do projeto. As outras ferramentas da aba (Reduzir, Suavizar,
// Reparar, Corte do plano, Reverter normais, Separar, Combinar, Tesselar e
// Converter) usam a janela comum de corpos (comandos/corpos.ts).
// Diferenças do Fusion: sem 3MF/PLY, sem grupos de faces, sem posicionar
// com as setas na tela (só números).
import { abrirDialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { Selecao } from "../vista/selecao";

export const COMANDO_INSERIR_MALHA = "ParaMeshInsertAlignCommand";

const UNIDADES: [string, string, number][] = [
  ["mm", "Milímetros", 1],
  ["cm", "Centímetros", 10],
  ["m", "Metros", 1000],
  ["in", "Polegadas", 25.4],
];

export function comandoInserirMalha(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = ".stl,.obj";
  entrada.addEventListener("change", async () => {
    const arq = entrada.files?.[0];
    if (!arq) return;
    inserirMalha(arq.name, new Uint8Array(await arq.arrayBuffer()), raiz, projeto, avisar);
  });
  entrada.click();
}

export function inserirMalha(nomeArq: string, bytes: Uint8Array, raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const formato = /\.obj$/i.test(nomeArq) ? "obj" : "stl";
  if (bytes.length > 40 * 1024 * 1024) return avisar("Arquivo grande demais (mais de 40 MB).");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const base64 = btoa(bin);
  const id = crypto.randomUUID();
  const nome = projeto.proximoNome("Malha");
  const montar = (p: Record<string, number>, esc: Record<string, string>): Operacao => ({
    id,
    tipo: "malhaInserir",
    nome,
    modo: "novo",
    params: { x: p.x, y: p.y, z: p.z, escala: UNIDADES.find(([k]) => k === esc.unidade)?.[2] ?? 1 },
    opcoes: { unidade: esc.unidade, zParaCima: esc.zParaCima },
    arquivo: { nome: nomeArq, formato, base64 },
  });
  abrirDialogo(raiz, {
    titulo: `Inserir malha: ${nomeArq}`,
    campos: [
      { chave: "x", rotulo: "Posição X", valor: 0 },
      { chave: "y", rotulo: "Posição Y", valor: 0 },
      { chave: "z", rotulo: "Posição Z", valor: 0 },
    ],
    escolhas: [
      { chave: "unidade", rotulo: "Unidade do arquivo", opcoes: UNIDADES.map(([k, t]) => [k, t] as [string, string]), valor: "mm" },
      { chave: "zParaCima", rotulo: "O arquivo tem", opcoes: [["sim", "Z para cima (impressora/CAD)"], ["nao", "Y para cima"]], valor: "sim" },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: (p, _m, esc) => projeto.previsualizar(montar(p, esc)),
    aoOK: (p, _m, esc) => projeto.adicionar(montar(p, esc)),
    aoCancelar: () => projeto.previsualizar(null),
  });
}

// Paleta de malhas (Selecionar > Paleta de malhas): janela pequena com o modo
// de seleção (corpo ou grupo de faces) e atalhos para os grupos das malhas já
// escolhidas: todos, inverter, limpar. Fica aberta até fechar no ✕.
// Diferença do Fusion: escolhe grupos de faces inteiros (o Fusion também
// escolhe triângulos soltos e "pinta" com pincel).
export function abrirPaletaMalhas(projeto: Projeto, selecao: Selecao, avisar: (t: string) => void) {
  document.querySelector(".paleta-malhas")?.remove();
  const el = document.createElement("div");
  el.className = "janela-parametros paleta-malhas";
  el.innerHTML = `
    <div class="jp-titulo">PALETA DE MALHAS <button class="jp-fechar" title="Fechar">✕</button></div>
    <div class="jp-corpo">
      <div class="jp-secao">Escolher por</div>
      <button data-p="corpo">Corpo inteiro</button> <button data-p="face">Grupo de faces</button>
      <div class="jp-secao">Grupos das malhas escolhidas</div>
      <button data-a="todos">Todos</button> <button data-a="inverter">Inverter</button> <button data-a="limpar">Limpar</button>
      <p class="jp-dica">Sem grupos? Use Preparar &gt; Gerar grupos de faces (ou Criar grupo de faces).</p>
    </div>`;
  document.body.appendChild(el);
  el.querySelector(".jp-fechar")!.addEventListener("click", () => el.remove());
  el.querySelectorAll<HTMLButtonElement>("[data-p]").forEach((b) =>
    b.addEventListener("click", () => {
      selecao.definirPrioridade(b.dataset.p as "corpo" | "face");
      avisar(b.dataset.p === "corpo" ? "Paleta: clique escolhe a malha inteira." : "Paleta: clique escolhe um grupo de faces.");
    }),
  );
  el.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.a === "limpar") return selecao.limpar();
      const itens = selecao.itens();
      const malhas = projeto.estado.corposBase.filter((c) => c.ehMalha && itens.some((i) => i.corpo === c.nome));
      if (!malhas.length) return avisar("Escolha antes uma malha (ou um grupo dela).");
      const novos = malhas.flatMap((c) =>
        Array.from({ length: c.gruposFaces.length / 2 }, (_, f) => f)
          .filter((f) => b.dataset.a === "todos" || !itens.some((i) => i.corpo === c.nome && i.tipo === "face" && i.indice === f))
          .map((f) => ({ corpo: c.nome, tipo: "face" as const, indice: f })),
      );
      selecao.definirPrioridade("face");
      selecao.definirItens(novos);
      avisar(`${novos.length} grupo(s) de faces escolhido(s).`);
    }),
  );
}
