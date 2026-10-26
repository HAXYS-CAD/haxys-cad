// Janelas de consulta (como no Fusion, só leitura aqui):
// - Gerenciar materiais: materiais físicos (densidade) e aparências (cor).
// - Gerenciar biblioteca de roscas: roscas métricas com passo e broca.
// - Análise de grau de liberdade: quanto cada componente ainda pode se mexer,
//   pelas juntas (rígida 0, giratória 1, deslizante 1, cilíndrica 2,
//   esférica 3, planar 3; sem junta = 6, livre).
// Diferença do Fusion: não dá para criar/editar material nem rosca.
import type { Projeto } from "../nucleo/projeto";
import { APARENCIAS, MATERIAIS } from "../nucleo/materiais";
import { ROSCAS_M } from "../nucleo/roscas";

const fmt = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function janela(titulo: string, html: string) {
  const el = document.createElement("div");
  el.className = "janela-parametros";
  el.innerHTML = `
    <div class="jp-titulo">${titulo} <button class="jp-fechar" title="Fechar">✕</button></div>
    <div class="jp-corpo">${html}</div>
    <div class="jp-botoes"><button class="jp-ok">OK</button></div>`;
  document.body.appendChild(el);
  const fechar = () => el.remove();
  el.querySelector(".jp-fechar")!.addEventListener("click", fechar);
  el.querySelector(".jp-ok")!.addEventListener("click", fechar);
}

export function abrirGerenciarMateriais() {
  const mats = Object.values(MATERIAIS)
    .map((m) => `<tr><td>${m.nome}</td><td style="text-align:right">${fmt(m.densidade, 3)}</td><td>${APARENCIAS[m.aparencia]?.nome ?? m.aparencia}</td></tr>`)
    .join("");
  const aps = Object.values(APARENCIAS)
    .map((a) => `<tr><td><span style="display:inline-block;width:14px;height:14px;border:1px solid #888;background:${a.cor};opacity:${a.opacidade ?? 1};vertical-align:middle"></span> ${a.nome}</td><td>${a.cor}</td><td style="text-align:right">${fmt(a.metal)}</td><td style="text-align:right">${fmt(a.rugosidade)}</td></tr>`)
    .join("");
  janela(
    "GERENCIAR MATERIAIS",
    `<b>Materiais físicos</b>
     <table><tr><th>Material</th><th>Densidade (g/cm³)</th><th>Aparência</th></tr>${mats}</table>
     <b>Aparências</b>
     <table><tr><th>Aparência</th><th>Cor</th><th>Metal</th><th>Rugosidade</th></tr>${aps}</table>`,
  );
}

export function abrirBibliotecaRoscas() {
  // Broca para rosca interna ≈ diâmetro − passo; menor externo ≈ d − 1,22687·P (ISO 68).
  const linhas = ROSCAS_M.map(([d, p]) => `<tr><td>M${String(d).replace(".", ",")}</td><td style="text-align:right">${fmt(p)}</td><td style="text-align:right">${fmt(d - p, 1)}</td><td style="text-align:right">${fmt(d - 1.22687 * p, 3)}</td></tr>`).join("");
  janela("BIBLIOTECA DE ROSCAS (MÉTRICA GROSSA)", `<table><tr><th>Rosca</th><th>Passo (mm)</th><th>Broca (mm)</th><th>Ø menor externo (mm)</th></tr>${linhas}</table>`);
}

const GRAUS: Record<string, [number, string]> = {
  rigida: [0, "Rígida"],
  giratoria: [1, "Giratória (gira 1 eixo)"],
  deslizante: [1, "Deslizante (anda 1 eixo)"],
  cilindrica: [2, "Cilíndrica (gira e anda)"],
  esferica: [3, "Esférica (gira em tudo)"],
  planar: [3, "Planar (anda no plano e gira)"],
};

export function abrirGrauDeLiberdade(projeto: Projeto, avisar: (t: string) => void) {
  const h = projeto.estado.historico.filter((o) => !o.suprimida);
  const comps = h.filter((o) => o.tipo === "componente");
  const juntas = h.filter((o) => o.tipo === "junta");
  if (!comps.length && !juntas.length) return avisar("Não há componentes nem juntas na montagem.");
  // Componente de cada corpo (corpo solto = ele mesmo).
  const doCorpo = new Map<string, string>();
  for (const c of comps) for (const b of c.corpos ?? []) doCorpo.set(b, c.nome);
  const nomeDe = (corpo: string) => doCorpo.get(corpo) ?? corpo;
  const linhas = new Map<string, { graus: number; como: string }>();
  for (const c of comps) linhas.set(c.nome, { graus: 6, como: "Sem junta (livre)" });
  for (const j of juntas) {
    const refs = j.referencias ?? [];
    if (refs.length < 2) continue;
    const quem = nomeDe(refs[0].corpo);
    const [g, texto] = GRAUS[j.opcoes?.tipo ?? "rigida"] ?? [0, "?"];
    const atual = linhas.get(quem);
    // Mais de uma junta no mesmo componente: fica o menor (mais preso).
    if (!atual || g < atual.graus || atual.como.startsWith("Sem junta")) linhas.set(quem, { graus: g, como: `${j.nome}: ${texto}` });
  }
  const html = [...linhas]
    .map(([n, l]) => `<tr><td>${n}</td><td style="text-align:right">${l.graus}</td><td>${l.como}</td></tr>`)
    .join("");
  janela("ANÁLISE DE GRAU DE LIBERDADE", `<table><tr><th>Componente</th><th>Graus livres</th><th>Por quê</th></tr>${html}</table><p>0 = preso; 6 = totalmente livre.</p>`);
}
