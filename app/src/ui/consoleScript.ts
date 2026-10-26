// Scripts e complementos: console para escrever e rodar scripts (JavaScript)
// que mexem no projeto pela API "haxys". É a base para, mais tarde, falar com
// o programa (voz) e para automatizar peças.
// Os scripts ficam salvos neste navegador (lista "Meus scripts").
// Diferenças do Fusion: a API é outra (em português e bem menor) e não há
// complementos que ficam rodando (só scripts que rodam e terminam).
import type { Projeto } from "../nucleo/projeto";
import type { Operacao, TipoOperacao } from "../nucleo/tipos";
import { PLANOS_ORIGEM, perfisDeMaterial, type DadosEsboco } from "../nucleo/esboco";
import { enviarAoBambu } from "../comandos/bambu";

const CHAVE = "haxys.scripts";
const EXEMPLO = `// Exemplo: uma placa com 4 furos. Ctrl+Enter roda.
const placa = await haxys.caixa({ comprimento: 60, largura: 60, altura: 6 });
for (const [x, z] of [[-20, -20], [20, -20], [-20, 20], [20, 20]])
  await haxys.cilindro({ diametro: 5, altura: 6, x, z, modo: "cortar" });
log("Corpos:", haxys.corpos());
log((await haxys.propriedades(haxys.corpos()[0])).join("\\n"));
`;

function lerSalvos(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
  } catch {
    return {};
  }
}
function gravarSalvos(s: Record<string, string>) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(s));
  } catch {
    /* sem armazenamento: só não salva */
  }
}

// A API que o script enxerga.
export function criarApi(projeto: Projeto, log: (...a: unknown[]) => void) {
  // Último corpo criado = o de número maior ("Corpo12"); a lista põe as malhas no fim.
  const ultimo = () => {
    let melhor: string | undefined, n = -1;
    for (const c of projeto.estado.corposBase) {
      const k = Number(/(\d+)$/.exec(c.nome)?.[1] ?? -1);
      if (k > n) (n = k), (melhor = c.nome);
    }
    return melhor;
  };
  const esperar = async () => {
    await Promise.resolve();
    await projeto.quandoCalculado();
  };
  const porNome = (nome: string) => {
    const op = projeto.estado.historico.find((o) => o.nome === nome);
    if (!op) throw new Error(`Operação "${nome}" não existe`);
    return op;
  };
  // Cria a operação, espera o cálculo e devolve o nome dela (com o erro, se houver).
  const criar = async (tipo: TipoOperacao, base: string, params: Record<string, number>, extra: Partial<Operacao> = {}) => {
    const { modo, ...resto } = params as Record<string, number> & { modo?: Operacao["modo"] };
    const op: Operacao = { id: crypto.randomUUID(), tipo, nome: projeto.proximoNome(base), modo: modo ?? "novo", params: resto, ...extra };
    projeto.adicionar(op);
    await esperar();
    const erro = projeto.estado.erros[op.id];
    if (erro) throw new Error(`${op.nome}: ${erro}`);
    return op.nome;
  };
  const com = (padrao: Record<string, number>, o: Record<string, unknown> = {}) => ({ x: 0, y: 0, z: 0, ...padrao, ...o }) as Record<string, number>;
  return {
    esperar,
    corpos: () => projeto.estado.corposBase.map((c) => c.nome),
    operacoes: () => projeto.estado.historico.map((o) => ({ nome: o.nome, tipo: o.tipo, modo: o.modo, params: { ...o.params } })),
    erros: () => Object.fromEntries(Object.entries(projeto.estado.erros).map(([id, e]) => [projeto.estado.historico.find((o) => o.id === id)?.nome ?? id, e])),
    caixa: (o?: Record<string, unknown>) => criar("caixa", "Caixa", com({ comprimento: 20, largura: 20, altura: 20 }, o)),
    cilindro: (o?: Record<string, unknown>) => criar("cilindro", "Cilindro", com({ diametro: 20, altura: 20 }, o)),
    esfera: (o?: Record<string, unknown>) => criar("esfera", "Esfera", com({ diametro: 20 }, o)),
    toroide: (o?: Record<string, unknown>) => criar("toroide", "Toroide", com({ diametro: 40, diametroSecao: 10 }, o)),
    // Esboço com linhas (lista de pontos [u, v]) e círculos ({ u, v, r }) num plano da origem.
    esboco: async (o: { plano?: "XY" | "XZ" | "YZ"; linhas?: [number, number][]; fechado?: boolean; circulos?: { u: number; v: number; r: number }[] }) => {
      const d: DadosEsboco = { plano: PLANOS_ORIGEM[o.plano ?? "XY"], pontos: [{ id: 0, u: 0, v: 0 }], curvas: [], cotas: [] };
      const novoPonto = (u: number, v: number) => (d.pontos.push({ id: d.pontos.length, u, v }), d.pontos.length - 1);
      const pts = (o.linhas ?? []).map(([u, v]) => novoPonto(u, v));
      for (let i = 0; i + 1 < pts.length; i++) d.curvas.push({ id: d.curvas.length + 1, tipo: "linha", a: pts[i], b: pts[i + 1] });
      if (o.fechado !== false && pts.length > 2) d.curvas.push({ id: d.curvas.length + 1, tipo: "linha", a: pts[pts.length - 1], b: pts[0] });
      for (const c of o.circulos ?? []) d.curvas.push({ id: d.curvas.length + 1, tipo: "circulo", centro: novoPonto(c.u, c.v), raio: c.r });
      return criar("esboco", "Esboço", {}, { esboco: d });
    },
    // Extrusão de todos os perfis de um esboço (ou só dos números em "perfis").
    extrusao: (o: { esboco: string; distancia: number; modo?: Operacao["modo"]; perfis?: number[] }) => {
      const esb = porNome(o.esboco);
      if (!esb.esboco) throw new Error(`${o.esboco} não é um esboço`);
      const indices = o.perfis ?? perfisDeMaterial(esb.esboco);
      return criar("extrusao", "Extrusão", { distancia: o.distancia, ...(o.modo ? { modo: o.modo as unknown as number } : {}) }, { perfis: { esboco: esb.id, indices } });
    },
    // Antes: o resto ia com nome/params/modo = undefined e apagava o nome e as medidas.
    adicionar: (op: Partial<Operacao> & { tipo: TipoOperacao }) => {
      const { nome, params, modo, id: _id, ...resto } = op;
      return criar(op.tipo, nome ?? op.tipo[0].toUpperCase() + op.tipo.slice(1), { ...(params ?? {}), ...(modo ? { modo: modo as unknown as number } : {}) }, resto);
    },
    mudar: async (nome: string, medida: string, valor: string | number) => {
      projeto.mudarMedida(porNome(nome).id, medida, String(valor));
      await esperar();
    },
    parametro: (nome: string, expressao: string | number) => {
      const lista = projeto.parametros().filter((p) => p.nome !== nome);
      const antes = projeto.parametros().findIndex((p) => p.nome === nome);
      lista.splice(antes < 0 ? lista.length : antes, 0, { nome, expressao: String(expressao) });
      projeto.definirParametros(lista);
    },
    remover: async (nome: string) => {
      projeto.remover(porNome(nome).id);
      await esperar();
    },
    desfazer: () => projeto.desfazerUltimo(),
    refazer: () => projeto.refazerUltimo(),
    propriedades: (corpo: string) => projeto.propriedades(corpo),
    medir: (itens: { corpo: string; tipo: "corpo" | "face" | "aresta"; indice: number }[]) => projeto.medir(itens),
    exportarSTL: async (arquivo = "peca.stl", corpos?: string[]) => {
      const buf = await projeto.exportar({ formato: "stl", corpos: corpos ?? projeto.estado.corposBase.map((c) => c.nome), qualidade: "media", zParaCima: true });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([buf], { type: "model/stl" }));
      a.download = arquivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      log(`${arquivo}: ${buf.byteLength.toLocaleString("pt-BR")} bytes`);
    },
    // Caixa em volta do corpo (pela malha da tela): { min: [x,y,z], max: [x,y,z], tamanho: [x,y,z] }.
    caixaDe,
    ultimoCorpo: () => ultimo() ?? null,
    // Furo vertical (eixo Y) que atravessa o corpo; sem x/z = no centro dele.
    furo: async (o: { diametro: number; corpo?: string; x?: number; z?: number; profundidade?: number }) => {
      const nome = o.corpo ?? ultimo();
      if (!nome) throw new Error("Não há corpo para furar");
      const c = caixaDe(nome);
      const altura = o.profundidade ?? c.tamanho[1] + 2;
      return criar("cilindro", "Furo", {
        diametro: o.diametro,
        altura,
        x: o.x ?? (c.min[0] + c.max[0]) / 2,
        y: o.profundidade ? c.max[1] - o.profundidade : c.min[1] - 1,
        z: o.z ?? (c.min[2] + c.max[2]) / 2,
        modo: "cortar" as unknown as number,
      });
    },
    // Arredondamento/chanfro em todas as arestas do corpo.
    arredondar: (raio: number, corpo?: string) => nasArestas("arredondamento", "Arredondamento", { raio }, corpo),
    chanfrar: (distancia: number, corpo?: string) => nasArestas("chanfro", "Chanfro", { distancia }, corpo),
    // Manda os corpos (todos, ou os nomes dados) para o Bambu Studio.
    imprimir: async (corpos?: string[]) => {
      const msg = await enviarAoBambu(projeto, corpos ?? projeto.estado.corposBase.map((c) => c.nome), "haxys-impressao");
      log(msg);
      return msg;
    },
    log,
  };
  function caixaDe(nome: string) {
    const m = projeto.estado.corposBase.find((c) => c.nome === nome);
    if (!m) throw new Error(`${nome} não existe`);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.vertices.length; i += 3)
      for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], m.vertices[i + k])), (max[k] = Math.max(max[k], m.vertices[i + k]));
    const r = (v: number) => +v.toFixed(4);
    return { min: min.map(r), max: max.map(r), tamanho: max.map((v, k) => r(v - min[k])) };
  }
  function nasArestas(tipo: TipoOperacao, base: string, params: Record<string, number>, corpo?: string) {
    const nome = corpo ?? ultimo();
    const m = nome && projeto.estado.corposBase.find((c) => c.nome === nome);
    if (!m) throw new Error("Não há corpo");
    const referencias = Array.from({ length: m.gruposArestas.length / 2 }, (_, i) => ({ corpo: m.nome, tipo: "aresta" as const, indice: i }));
    return criar(tipo, base, params, { referencias });
  }
}

// Roda o texto do script; devolve o erro (ou null) e o valor devolvido pelo script.
export async function executarScript(codigo: string, projeto: Projeto, log: (...a: unknown[]) => void): Promise<{ erro: string | null; valor: unknown }> {
  const haxys = criarApi(projeto, log);
  try {
    const fn = new Function("haxys", "log", `"use strict"; return (async () => {\n${codigo}\n})();`) as (h: typeof haxys, l: typeof log) => Promise<unknown>;
    return { erro: null, valor: await fn(haxys, log) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e), valor: undefined };
  }
}

export async function rodarScript(codigo: string, projeto: Projeto, log: (...a: unknown[]) => void): Promise<string | null> {
  const r = await executarScript(codigo, projeto, log);
  if (r.valor !== undefined) log(r.valor);
  return r.erro;
}

let aberto: HTMLElement | null = null;

export function abrirConsoleScript(projeto: Projeto) {
  if (aberto) return;
  const el = document.createElement("div");
  el.className = "janela-parametros janela-script";
  el.innerHTML = `
    <div class="jp-titulo">SCRIPTS E COMPLEMENTOS <button class="jp-fechar" title="Fechar">✕</button></div>
    <div class="jp-corpo">
      <div class="js-barra">
        <select class="js-lista"><option value="">Meus scripts…</option></select>
        <button class="js-salvar">Salvar</button><button class="js-apagar">Apagar</button><button class="js-exemplo">Exemplo</button><button class="js-ajuda">API</button>
      </div>
      <textarea class="js-codigo" spellcheck="false"></textarea>
      <pre class="js-saida"></pre>
    </div>
    <div class="jp-botoes"><button class="js-limpar" style="margin-right:8px;background:#5a6470">Limpar saída</button><button class="jp-ok js-rodar">Executar (Ctrl+Enter)</button></div>`;
  document.body.appendChild(el);
  aberto = el;
  const codigo = el.querySelector<HTMLTextAreaElement>(".js-codigo")!;
  const saida = el.querySelector<HTMLPreElement>(".js-saida")!;
  const lista = el.querySelector<HTMLSelectElement>(".js-lista")!;
  codigo.value = EXEMPLO;
  const escrever = (texto: string, erro = false) => {
    const linha = document.createElement("div");
    linha.textContent = texto;
    if (erro) linha.className = "erro";
    saida.appendChild(linha);
    saida.scrollTop = saida.scrollHeight;
  };
  const log = (...a: unknown[]) => escrever(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  const atualizarLista = () => {
    const s = lerSalvos();
    lista.innerHTML = `<option value="">Meus scripts…</option>` + Object.keys(s).map((n) => `<option>${n.replace(/</g, "&lt;")}</option>`).join("");
  };
  atualizarLista();
  let rodando = false;
  const rodar = async () => {
    if (rodando) return;
    rodando = true;
    escrever("▶ executando…");
    const t0 = performance.now();
    const erro = await rodarScript(codigo.value, projeto, log);
    if (erro) escrever(`✖ ${erro}`, true);
    else escrever(`✔ terminou em ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    rodando = false;
  };
  const fechar = () => {
    el.remove();
    aberto = null;
  };
  el.querySelector(".jp-fechar")!.addEventListener("click", fechar);
  el.querySelector(".js-rodar")!.addEventListener("click", rodar);
  el.querySelector(".js-limpar")!.addEventListener("click", () => (saida.innerHTML = ""));
  el.querySelector(".js-exemplo")!.addEventListener("click", () => (codigo.value = EXEMPLO));
  el.querySelector(".js-ajuda")!.addEventListener("click", () =>
    escrever(
      [
        "API (use await nas que criam ou mudam):",
        "  haxys.caixa/cilindro/esfera/toroide({ medidas, x, y, z, modo: 'novo'|'unir'|'cortar'|'intersecao' })",
        "  haxys.esboco({ plano: 'XY'|'XZ'|'YZ', linhas: [[u,v],...], fechado, circulos: [{u,v,r}] })",
        "  haxys.extrusao({ esboco: 'Esboço1', distancia, modo, perfis: [0] })",
        "  haxys.adicionar({ tipo, params, opcoes, ... })   // qualquer operação",
        "  haxys.parametro(nome, expressão) · haxys.mudar(operação, medida, valor)",
        "  haxys.corpos() · haxys.operacoes() · haxys.erros() · haxys.propriedades(corpo)",
        "  haxys.medir([{ corpo, tipo, indice }]) · haxys.remover(operação)",
        "  haxys.desfazer() · haxys.refazer() · haxys.exportarSTL('arquivo.stl', corpos?)",
        "  haxys.caixaDe(corpo) · haxys.ultimoCorpo() · haxys.furo({ diametro, corpo?, x?, z?, profundidade? })",
        "  haxys.arredondar(raio, corpo?) · haxys.chanfrar(distancia, corpo?) · haxys.imprimir(corpos?)  // Bambu Studio",
        "  log(...)  // escreve aqui embaixo",
      ].join("\n"),
    ),
  );
  el.querySelector(".js-salvar")!.addEventListener("click", () => {
    const nome = prompt("Nome do script:", lista.value || "Meu script")?.trim();
    if (!nome) return;
    gravarSalvos({ ...lerSalvos(), [nome]: codigo.value });
    atualizarLista();
    lista.value = nome;
  });
  el.querySelector(".js-apagar")!.addEventListener("click", () => {
    if (!lista.value) return;
    const s = lerSalvos();
    delete s[lista.value];
    gravarSalvos(s);
    atualizarLista();
  });
  lista.addEventListener("change", () => {
    const s = lerSalvos();
    if (lista.value && s[lista.value] !== undefined) codigo.value = s[lista.value];
  });
  codigo.addEventListener("keydown", (e) => {
    e.stopPropagation(); // atalhos do programa não valem aqui dentro
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      void rodar();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const i = codigo.selectionStart;
      codigo.setRangeText("  ", i, codigo.selectionEnd, "end");
    }
  });
}
