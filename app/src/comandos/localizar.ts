// Ferramentas de procurar e contar (painéis Inspecionar/Utilidades):
// - Localizar operações: digite parte do nome ou do tipo; clicar abre a edição.
// - Localizar componentes semelhantes: corpos com o mesmo volume e o mesmo
//   tamanho (caixa em volta) do corpo escolhido. No Fusion a busca é na nuvem
//   (em todos os projetos); aqui é no projeto aberto.
// - Estatísticas da montagem: quantos corpos, componentes, juntas, operações,
//   esboços, faces e arestas, e a massa total.
import type { Projeto } from "../nucleo/projeto";
import type { Operacao } from "../nucleo/tipos";

const fmt = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
  return { el, fechar };
}

export function abrirLocalizarOperacoes(projeto: Projeto, editar: (op: Operacao) => void) {
  const { el, fechar } = janela(
    "LOCALIZAR OPERAÇÕES",
    `<input class="loc-busca" placeholder="Nome ou tipo (ex.: furo, Extrusão2)" style="width:100%;margin-bottom:6px">
     <table class="loc-lista"></table>`,
  );
  const busca = el.querySelector<HTMLInputElement>(".loc-busca")!;
  const lista = el.querySelector<HTMLTableElement>(".loc-lista")!;
  const mostrar = () => {
    const q = semAcento(busca.value.trim());
    const ops = projeto.estado.historico.filter((o) => o.tipo !== "parametros" && (!q || semAcento(`${o.nome} ${o.tipo}`).includes(q)));
    lista.innerHTML = ops.length
      ? `<tr><th>Operação</th><th>Tipo</th><th>Situação</th></tr>` +
        ops.map((o, i) => `<tr data-i="${i}" style="cursor:pointer"><td>${esc(o.nome)}</td><td>${esc(o.tipo)}</td><td>${o.suprimida ? "suprimida" : projeto.estado.erros[o.id] ? "com erro" : "ok"}</td></tr>`).join("")
      : `<tr><td>Nada encontrado.</td></tr>`;
    lista.querySelectorAll<HTMLTableRowElement>("tr[data-i]").forEach((tr) =>
      tr.addEventListener("click", () => {
        fechar();
        editar(ops[Number(tr.dataset.i)]);
      }),
    );
  };
  busca.addEventListener("input", mostrar);
  busca.addEventListener("keydown", (e) => e.stopPropagation());
  mostrar();
  busca.focus();
}

export async function abrirSemelhantes(projeto: Projeto, escolhido: string | null, avisar: (t: string) => void) {
  const linhas = await projeto.listaMateriais().catch((e: unknown) => (avisar(e instanceof Error ? e.message : String(e)), null));
  if (!linhas?.length) return avisar("Não há corpos.");
  const ref = linhas.find((l) => l.corpo === escolhido) ?? linhas[0];
  const vol = ref.volume as number;
  const tam = [...(ref.tamanho as number[])].sort((a, b) => a - b);
  const parecido = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.005 * Math.abs(b), 1e-6);
  const iguais = linhas.filter((l) => {
    if (l === ref) return false;
    const t = [...(l.tamanho as number[])].sort((a, b) => a - b);
    return parecido(l.volume as number, vol) && t.every((x, i) => parecido(x, tam[i]));
  });
  janela(
    "COMPONENTES SEMELHANTES",
    `<p>Referência: <b>${esc(String(ref.corpo))}</b> (${fmt(vol)} mm³)${escolhido ? "" : " — escolha um corpo antes para comparar com ele"}.</p>
     ${iguais.length ? `<table><tr><th>Corpo</th><th>Componente</th><th>Volume (mm³)</th></tr>${iguais.map((l) => `<tr><td>${esc(String(l.corpo))}</td><td>${esc(String(l.componente || "—"))}</td><td>${fmt(l.volume as number)}</td></tr>`).join("")}</table>` : "<p>Nenhum corpo igual (mesmo volume e mesmo tamanho, até 0,5% de diferença).</p>"}`,
  );
}

export async function abrirEstatisticas(projeto: Projeto, avisar: (t: string) => void) {
  const h = projeto.estado.historico.filter((o) => o.tipo !== "parametros");
  const corpos = projeto.estado.corposBase;
  const linhas = await projeto.listaMateriais().catch(() => []);
  const massa = linhas.reduce((s, l) => s + (l.massa as number), 0);
  const conta = (f: (o: Operacao) => boolean) => h.filter(f).length;
  const itens: [string, string][] = [
    ["Corpos sólidos", String(corpos.filter((c) => !c.ehMalha && !c.ehSuperficie).length)],
    ["Corpos de malha", String(corpos.filter((c) => c.ehMalha).length)],
    ["Corpos de superfície", String(corpos.filter((c) => c.ehSuperficie).length)],
    ["Componentes", String(conta((o) => o.tipo === "componente"))],
    ["Juntas", String(conta((o) => o.tipo === "junta"))],
    ["Operações na linha do tempo", String(h.length)],
    ["  suprimidas", String(conta((o) => !!o.suprimida))],
    ["  com erro", String(conta((o) => !!projeto.estado.erros[o.id]))],
    ["Esboços", String(conta((o) => o.tipo === "esboco"))],
    ["Faces (todas)", String(corpos.reduce((s, c) => s + c.gruposFaces.length / 2, 0))],
    ["Arestas (todas)", String(corpos.reduce((s, c) => s + c.gruposArestas.length / 2, 0))],
    ["Massa total", `${fmt(massa)} g`],
  ];
  if (!h.length) avisar("O projeto está vazio.");
  janela("ESTATÍSTICAS DA MONTAGEM", `<table>${itens.map(([a, b]) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`).join("")}</table>`);
}

// Navegador de dependências (Inspecionar > Navegador): para cada operação, do
// que ela depende (esboços, planos, eixos, origens, corpos, medidas usadas nas
// expressões) e quem depende dela. Clicar abre a edição. O Fusion desenha um
// gráfico com caixas e setas; aqui é uma tabela.
export function abrirDependencias(projeto: Projeto, editar: (op: Operacao) => void) {
  const h = projeto.estado.historico.filter((o) => o.tipo !== "parametros" && o.tipo !== "contatos" && o.tipo !== "posicao");
  const porId = new Map(h.map((o) => [o.id, o]));
  const usa = (o: Operacao): string[] => {
    const ids = new Set<string>();
    if (o.perfis) ids.add(o.perfis.esboco);
    if (o.caminho) ids.add(o.caminho.esboco);
    for (const s of o.secoes ?? []) ids.add(s.esboco);
    if (o.eixo?.tipo === "linha") ids.add(o.eixo.esboco);
    if (o.eixo?.tipo === "construcao") ids.add(o.eixo.op);
    for (const v of Object.values(o.opcoes ?? {})) {
      if (v.startsWith("op:") || v.startsWith("esb:")) ids.add(v.slice(v.indexOf(":") + 1));
      else if (porId.has(v)) ids.add(v); // origemA/origemB
    }
    const nomes = [...ids].map((id) => porId.get(id)?.nome).filter((n): n is string => !!n && n !== o.nome);
    for (const t of Object.values(o.expressoes ?? {}))
      for (const m of t.matchAll(/([A-Za-zÀ-ú_][\wÀ-ú]*)\.\w+/g)) if (h.some((x) => x.nome === m[1]) && !nomes.includes(m[1])) nomes.push(m[1]);
    const corpos = [...new Set([...(o.corpos ?? []), ...(o.referencias ?? []).map((r) => r.corpo)])];
    return [...nomes, ...corpos.map((c) => `${c} (corpo)`)];
  };
  const deps = new Map(h.map((o) => [o.nome, usa(o)]));
  const usadoPor = (nome: string) => h.filter((o) => deps.get(o.nome)!.includes(nome)).map((o) => o.nome);
  const { el, fechar } = janela(
    "NAVEGADOR DE DEPENDÊNCIAS",
    h.length
      ? `<table class="loc-lista"><tr><th>Operação</th><th>Usa</th><th>Usada por</th></tr>${h
          .map((o, i) => `<tr data-i="${i}" style="cursor:pointer"><td>${esc(o.nome)}</td><td>${esc(deps.get(o.nome)!.join(", ") || "—")}</td><td>${esc(usadoPor(o.nome).join(", ") || "—")}</td></tr>`)
          .join("")}</table>`
      : "Projeto vazio.",
  );
  el.querySelectorAll<HTMLTableRowElement>("tr[data-i]").forEach((tr) =>
    tr.addEventListener("click", () => {
      fechar();
      editar(h[Number(tr.dataset.i)]);
    }),
  );
}

// Análise de conexão de componentes (e "Editar análise", que refaz a conta):
// cada componente (ou corpo solto), as juntas que o ligam aos outros e os que
// não estão ligados a nada. Componente = Novo componente/Grupo rígido/Duplicar.
export function abrirConexoes(projeto: Projeto) {
  const h = projeto.estado.historico.filter((o) => !o.suprimida);
  const dono = new Map<string, string>();
  for (const o of h) {
    const nomes = o.tipo === "componente" ? (o.corpos ?? []) : o.tipo === "duplicarJuntas" ? (o.opcoes?.nomes ?? "").split(",").filter(Boolean) : [];
    for (const n of nomes) dono.set(n, o.nome);
  }
  const grupo = (corpo: string) => dono.get(corpo) ?? corpo;
  const corpoDaRef = (j: Operacao, i: 0 | 1) => {
    const id = j.opcoes?.[i ? "origemB" : "origemA"];
    const origem = id ? h.find((o) => o.id === id) : undefined;
    return (origem?.referencias?.[0] ?? j.referencias?.[i])?.corpo;
  };
  const ligacoes = new Map<string, string[]>();
  const ligar = (a: string, texto: string) => ligacoes.set(a, [...(ligacoes.get(a) ?? []), texto]);
  for (const j of h.filter((o) => o.tipo === "junta")) {
    const a = corpoDaRef(j, 0), b = corpoDaRef(j, 1);
    if (!a || !b) continue;
    const tipo = j.opcoes?.tipo ?? "rigida";
    ligar(grupo(a), `${j.nome} (${tipo}) → ${grupo(b)}`);
    ligar(grupo(b), `${j.nome} (${tipo}) ← ${grupo(a)}`);
  }
  const todos = [...new Set(projeto.estado.corposBase.map((c) => grupo(c.nome)))];
  const soltos = todos.filter((g) => !ligacoes.has(g));
  janela(
    "ANÁLISE DE CONEXÃO DE COMPONENTES",
    todos.length
      ? `<table class="loc-lista"><tr><th>Componente / corpo</th><th>Ligações</th></tr>${todos
          .map((g) => `<tr><td>${esc(g)}</td><td>${ligacoes.has(g) ? esc(ligacoes.get(g)!.join("; ")) : "<b>sem ligação</b>"}</td></tr>`)
          .join("")}</table><p class="jp-dica">${soltos.length ? `${soltos.length} sem ligação: ${esc(soltos.join(", "))}.` : "Tudo está ligado por juntas."}</p>`
      : "Projeto vazio.",
  );
}

// Análise da pilha de elementos de fixação: o que cada parafuso/porca/arruela toca.
export async function abrirPilhaFixadores(projeto: Projeto, avisar: (t: string) => void) {
  const linhas = await projeto.pilhaFixadores().catch((e: unknown) => (avisar(e instanceof Error ? e.message : String(e)), null));
  if (!linhas) return;
  janela("ANÁLISE DA PILHA DE ELEMENTOS DE FIXAÇÃO", `<table class="loc-lista">${linhas.map((l) => `<tr><td>${esc(l)}</td></tr>`).join("")}</table>`);
}
