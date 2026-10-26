// Inserir DXF / Inserir SVG (painel Inserir): escolhe o arquivo, mostra uma
// janela com o plano, a escala e o deslocamento, e cria um esboço com as curvas.
// Diferenças do Fusion, por enquanto: sem prévia na tela antes do OK; curvas
// do SVG (e splines do DXF) viram linhas curtas; textos e cotas do arquivo são
// ignorados.
import { abrirDialogo } from "../ui/dialogo";
import { PLANOS_ORIGEM, type PlanoEsboco } from "../nucleo/esboco";
import { esbocoDasFormas, lerDXF, lerSVG, type Forma2D } from "../nucleo/importar2d";
import type { Projeto } from "../nucleo/projeto";

export const COMANDOS_IMPORTAR: Record<string, "dxf" | "svg"> = { ImportDxfFileCommand: "dxf", SketchImportSVG: "svg" };

// Abre o seletor de arquivo do sistema.
export function comandoImportar(tipo: "dxf" | "svg", raiz: HTMLElement, projeto: Projeto, planosConstrucao: () => [string, PlanoEsboco][], avisar: (t: string) => void) {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = tipo === "dxf" ? ".dxf" : ".svg";
  entrada.addEventListener("change", async () => {
    const arq = entrada.files?.[0];
    if (!arq) return;
    importarTexto(tipo, arq.name, await arq.text(), raiz, projeto, planosConstrucao, avisar);
  });
  entrada.click();
}

// Depois de ler o arquivo (separado para dar para testar sem o seletor).
export function importarTexto(
  tipo: "dxf" | "svg",
  nomeArquivo: string,
  texto: string,
  raiz: HTMLElement,
  projeto: Projeto,
  planosConstrucao: () => [string, PlanoEsboco][],
  avisar: (t: string) => void,
) {
  let formas: Forma2D[];
  let escalaPadrao = 1;
  try {
    if (tipo === "dxf") formas = lerDXF(texto);
    else {
      const r = lerSVG(texto);
      formas = r.formas;
      escalaPadrao = +r.mmPorUnidade.toFixed(6);
    }
  } catch (e) {
    return avisar(`Não deu para ler ${nomeArquivo}: ${e instanceof Error ? e.message : e}`);
  }
  if (!formas.length) return avisar(`Nada para inserir em ${nomeArquivo} (sem linhas, arcos ou círculos).`);
  const construcao = planosConstrucao();
  const planoDe = (k: string): PlanoEsboco => PLANOS_ORIGEM[k as "XY"] ?? construcao.find(([c]) => c === k)?.[1] ?? PLANOS_ORIGEM.XZ;
  const contagem = formas.reduce<Record<string, number>>((m, f) => ((m[f.tipo] = (m[f.tipo] ?? 0) + 1), m), {});
  abrirDialogo(raiz, {
    titulo: `Inserir ${tipo.toUpperCase()}`,
    campos: [
      { chave: "escala", rotulo: "Escala (mm por unidade)", valor: escalaPadrao, unidade: "" },
      { chave: "dx", rotulo: "Deslocamento X", valor: 0 },
      { chave: "dy", rotulo: "Deslocamento Y", valor: 0 },
    ],
    escolhas: [
      {
        chave: "plano",
        rotulo: "Plano",
        opcoes: [["XZ", "Plano XZ (chão)"], ["XY", "Plano XY"], ["YZ", "Plano YZ"], ...construcao.map(([k, p]) => [k, p.nome] as [string, string])],
        valor: "XZ",
      },
    ],
    modo: "novo",
    semModo: true,
    selecao: `${nomeArquivo}: ${Object.entries(contagem).map(([k, n]) => `${n} ${k}`).join(", ")}`,
    rotuloSelecao: "Arquivo",
    aoMudar: () => {},
    aoOK: (v, _m, esc) => {
      const esboco = esbocoDasFormas(formas, planoDe(esc.plano), v.escala || 1, [v.dx ?? 0, v.dy ?? 0]);
      projeto.adicionar({ id: crypto.randomUUID(), tipo: "esboco", nome: projeto.proximoNome("Esboço"), modo: "novo", params: {}, esboco });
      avisar(`Esboço criado com ${esboco.curvas.length} curva(s) de ${nomeArquivo}.`);
    },
    aoCancelar: () => {},
  });
}
