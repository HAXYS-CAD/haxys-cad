// Tela (imagem de referência num plano) e Decalque (imagem colada numa face
// plana). Só aparecem na tela: não mudam a peça. A imagem vai dentro do
// projeto. Largura em mm (a altura segue a proporção da imagem); deslocamento
// e giro no plano; opacidade para desenhar por cima.
// Diferenças do Fusion, por enquanto: sem calibrar por dois pontos clicados,
// decalque só em face plana (não dobra em face curva), não sai no STEP/STL.
import { abrirDialogo } from "../ui/dialogo";
import { PLANOS_ORIGEM, type PlanoEsboco } from "../nucleo/esboco";
import { planoDaFace } from "../nucleo/construcao";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import type { Selecao } from "../vista/selecao";

export const COMANDOS_TELA: Record<string, "tela" | "decalque"> = { FusionAddCanvasCommand: "tela", FusionAddEditDecalCommand: "decalque" };

function escolherImagem(aoLer: (nome: string, url: string) => void) {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = "image/png,image/jpeg,image/webp,image/gif";
  entrada.addEventListener("change", () => {
    const arq = entrada.files?.[0];
    if (!arq) return;
    const leitor = new FileReader();
    leitor.onload = () => aoLer(arq.name, String(leitor.result));
    leitor.readAsDataURL(arq);
  });
  entrada.click();
}

export function comandoTela(
  tipo: "tela" | "decalque",
  raiz: HTMLElement,
  projeto: Projeto,
  selecao: Selecao,
  planosConstrucao: () => [string, PlanoEsboco][],
  avisar: (t: string) => void,
  existente?: Operacao,
) {
  // Decalque: a face plana escolhida antes vira o plano (um pouquinho para fora).
  let planoFace: PlanoEsboco | null = null;
  if (tipo === "decalque" && !existente) {
    const face = [...selecao.itens()].reverse().find((i) => i.tipo === "face");
    const malha = face && projeto.estado.corposBase.find((c) => c.nome === face.corpo);
    const p = malha && planoDaFace(malha, face!.indice);
    if (!p) return avisar("Para o Decalque, escolha antes uma face plana (clique nela) e depois o comando.");
    planoFace = { ...p, nome: `Face de ${face!.corpo}`, origem: p.origem.map((v, i) => v + p.normal[i] * 0.05) as typeof p.origem };
  }
  const abrir = (nomeArq: string, url: string) => {
    const id = existente?.id ?? crypto.randomUUID();
    const nome = existente?.nome ?? projeto.proximoNome(tipo === "tela" ? "Tela" : "Decalque");
    const construcao = planosConstrucao();
    const planoDe = (k: string): PlanoEsboco =>
      k === "face" && planoFace ? planoFace : k === "atual" && existente?.planoBase ? existente.planoBase : PLANOS_ORIGEM[k as "XY"] ?? construcao.find(([c]) => c === k)?.[1] ?? PLANOS_ORIGEM.XZ;
    const opcoesPlano: [string, string][] = [
      ...(existente?.planoBase ? ([["atual", `Atual (${existente.planoBase.nome})`]] as [string, string][]) : []),
      ...(planoFace ? ([["face", planoFace.nome]] as [string, string][]) : []),
      ["XY", "Plano XY (frente)"],
      ["XZ", "Plano XZ (chão)"],
      ["YZ", "Plano YZ (lado)"],
      ...construcao.map(([k, p]) => [k, p.nome] as [string, string]),
    ];
    const montar = (v: Record<string, number>, esc: Record<string, string>): Operacao => ({
      id,
      tipo: "tela",
      nome,
      modo: "novo",
      params: { largura: v.largura, dx: v.dx, dy: v.dy, giro: v.giro, opacidade: v.opacidade },
      opcoes: { decalque: tipo === "decalque" ? "sim" : "nao" },
      planoBase: planoDe(esc.plano),
      imagem: url,
      suprimida: existente?.suprimida,
    });
    abrirDialogo(raiz, {
      titulo: existente ? `Editar ${nome}` : tipo === "tela" ? `Tela: ${nomeArq}` : `Decalque: ${nomeArq}`,
      campos: [
        { chave: "largura", rotulo: "Largura", valor: existente?.params.largura ?? 100 },
        { chave: "dx", rotulo: "Deslocamento X", valor: existente?.params.dx ?? 0 },
        { chave: "dy", rotulo: "Deslocamento Y", valor: existente?.params.dy ?? 0 },
        { chave: "giro", rotulo: "Girar", valor: existente?.params.giro ?? 0, unidade: "°" },
        { chave: "opacidade", rotulo: "Opacidade", valor: existente?.params.opacidade ?? (tipo === "tela" ? 50 : 100), unidade: "%" },
      ],
      escolhas: [{ chave: "plano", rotulo: "Plano", opcoes: opcoesPlano, valor: opcoesPlano[0][0] }],
      modo: "novo",
      semModo: true,
      aoMudar: (v, _m, esc) => projeto.previsualizar(montar(v, esc)),
      aoOK: (v, _m, esc) => (existente ? projeto.substituir(montar(v, esc)) : projeto.adicionar(montar(v, esc))),
      aoCancelar: () => projeto.previsualizar(null),
    });
  };
  if (existente?.imagem) return abrir(existente.nome, existente.imagem);
  escolherImagem(abrir);
}
