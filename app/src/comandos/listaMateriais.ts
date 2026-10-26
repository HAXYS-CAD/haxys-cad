// Lista de materiais (BOM): uma linha por corpo com componente, material,
// volume, massa e tamanho (caixa em volta). "Baixar CSV" salva a tabela
// (abre no Excel/Planilhas; separador ";" e vírgula decimal, padrão do Brasil).
// Diferença do Fusion: sem número de peça/descrição editáveis e sem agrupar
// peças iguais.
import type { Projeto } from "../nucleo/projeto";

const fmt = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export async function abrirListaMateriais(projeto: Projeto, avisar: (t: string) => void) {
  let linhas: Record<string, unknown>[];
  try {
    linhas = await projeto.listaMateriais();
  } catch (e) {
    return avisar(e instanceof Error ? e.message : String(e));
  }
  if (!linhas.length) return avisar("Não há corpos para listar.");
  const el = document.createElement("div");
  el.className = "janela-parametros";
  const total = linhas.reduce((s, l) => s + (l.massa as number), 0);
  const corpo = linhas
    .map((l) => {
      const t = l.tamanho as number[];
      return `<tr><td>${l.corpo}</td><td>${l.componente || "—"}</td><td>${l.material}</td><td>${fmt(l.volume as number)}</td><td>${fmt(l.massa as number)}</td><td>${t.map((x) => fmt(x, 1)).join(" × ")}</td></tr>`;
    })
    .join("");
  el.innerHTML = `
    <div class="jp-titulo">LISTA DE MATERIAIS <button class="jp-fechar" title="Fechar">✕</button></div>
    <div class="jp-corpo">
      <table><tr><th>Corpo</th><th>Componente</th><th>Material</th><th>Volume (mm³)</th><th>Massa (g)</th><th>Tamanho X × Y × Z (mm)</th></tr>${corpo}
      <tr class="grupo"><td colspan="4">Total (${linhas.length} corpo(s))</td><td>${fmt(total)}</td><td></td></tr></table>
    </div>
    <div class="jp-botoes"><button class="jp-csv" style="margin-right:8px;background:#5a6470">Baixar CSV</button><button class="jp-ok">OK</button></div>`;
  document.body.appendChild(el);
  const fechar = () => el.remove();
  el.querySelector(".jp-fechar")!.addEventListener("click", fechar);
  el.querySelector(".jp-ok")!.addEventListener("click", fechar);
  el.querySelector(".jp-csv")!.addEventListener("click", () => {
    const cab = "Corpo;Componente;Material;Volume (mm3);Massa (g);X (mm);Y (mm);Z (mm)";
    const csv = [cab, ...linhas.map((l) => {
      const t = l.tamanho as number[];
      return [l.corpo, l.componente, l.material, fmt(l.volume as number), fmt(l.massa as number), ...t.map((x) => fmt(x, 2))].join(";");
    })].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "lista-de-materiais.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
