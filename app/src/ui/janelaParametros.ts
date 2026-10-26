// Janela "Alterar parâmetros" (painel Modificar), como a do Fusion:
// - Parâmetros do usuário: nome, expressão, valor e comentário; + cria, 🗑 apaga;
// - Parâmetros do modelo: as medidas de cada operação e as cotas dos esboços,
//   que aceitam número ou expressão com os parâmetros do usuário.
// Cada mudança entra no desfazer. A peça é recalculada na hora.
// Diferenças do Fusion, por enquanto: sem unidade por parâmetro (tudo em mm ou
// graus), sem favoritos, sem filtro. Medidas do modelo entram nas expressões
// como Operação.medida (Caixa1.altura) e Esboço1.d2 (cota 2 do esboço).
// Configurações: tabela com um conjunto de valores por linha; "Ativar" copia
// os valores para os parâmetros (a peça muda). O Fusion também configura
// supressão de operações, aparências e materiais; aqui só os parâmetros.
// Regras de configuração: "se <condição> então <parâmetro> = <expressão>" (ex.:
// se largura > 50 então espessura = 4); valem por cima do valor do parâmetro.
import type { Projeto } from "../nucleo/projeto";
import { avaliar, NOME_VALIDO, type Parametro } from "../nucleo/parametros";
import { valorCota } from "../nucleo/esboco";

const ESCONDIDAS = new Set(["parametros", "aparencia", "material", "esboco", "contatos", "posicao"]);
const fmt = (v: number | undefined) =>
  v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

let aberta: HTMLElement | null = null;

export function janelaParametrosAberta() {
  return aberta !== null;
}

// "foco" = "configuracoes": rola até a tabela de configurações (botões Configurar
// e Exibir tabela de configuração do Fusion).
export function abrirJanelaParametros(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void, foco?: "configuracoes" | "regras") {
  const alvo = foco === "regras" ? ".jp-regras" : ".jp-config";
  if (aberta) {
    if (foco) aberta.querySelector(alvo)?.previousElementSibling?.scrollIntoView({ block: "start" });
    return;
  }
  const el = document.createElement("div");
  el.className = "janela-parametros";
  raiz.appendChild(el);
  aberta = el;

  const fechar = () => {
    el.remove();
    aberta = null;
    document.removeEventListener("keydown", teclas);
  };
  function teclas(e: KeyboardEvent) {
    if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) fechar();
  }
  document.addEventListener("keydown", teclas);

  function linhasUsuario(): string {
    const lista = projeto.parametros();
    const { valores, erros } = projeto.valoresParametros();
    if (!lista.length) return `<tr><td colspan="5" class="vazio">Nenhum parâmetro. Clique em + para criar.</td></tr>`;
    return lista
      .map(
        (p, i) => `<tr data-i="${i}">
          <td><input data-campo="nome" value="${esc(p.nome)}"></td>
          <td><input data-campo="expressao" value="${esc(p.expressao)}"></td>
          <td class="${erros[p.nome] ? "erro" : ""}" title="${esc(erros[p.nome] ?? "")}">${erros[p.nome] ? "erro" : fmt(valores.get(p.nome))}</td>
          <td><input data-campo="comentario" value="${esc(p.comentario ?? "")}"></td>
          <td><button data-apagar="${i}" title="Apagar">🗑</button></td>
        </tr>`,
      )
      .join("");
  }

  function linhasModelo(): string {
    const ops = projeto.estado.historico;
    const erros = projeto.estado.erros;
    const partes: string[] = [];
    for (const op of ops) {
      if (op.tipo === "esboco" && op.esboco?.cotas.length) {
        partes.push(`<tr class="grupo"><td colspan="3">${esc(op.nome)}${erros[op.id] ? ` <span class="erro" title="${esc(erros[op.id])}">⚠</span>` : ""}</td></tr>`);
        for (const c of op.esboco.cotas) {
          const v = valorCota(op.esboco, c);
          const nome = c.tipo === "angulo" ? "ângulo" : c.tipo === "pontos" ? "distância" : c.tipo === "pontoLinha" ? "distância à linha" : "medida";
          partes.push(`<tr><td title="Nas expressões: ${esc(op.nome)}.d${c.id}">d${c.id} (${nome})</td>
            <td><input data-op="${op.id}" data-cota="${c.id}" value="${esc(c.expressao ?? String(+v.toFixed(4)))}"></td><td>${fmt(v)}</td></tr>`);
        }
        continue;
      }
      if (ESCONDIDAS.has(op.tipo) || !Object.keys(op.params).length) continue;
      partes.push(`<tr class="grupo"><td colspan="3">${esc(op.nome)}${erros[op.id] ? ` <span class="erro" title="${esc(erros[op.id])}">⚠</span>` : ""}</td></tr>`);
      for (const [k, v] of Object.entries(op.params))
        partes.push(`<tr><td title="Nas expressões: ${esc(op.nome)}.${esc(k)}">${esc(k)}</td>
          <td><input data-op="${op.id}" data-chave="${esc(k)}" value="${esc(op.expressoes?.[k] ?? String(+v.toFixed(4)))}"></td><td>${fmt(v)}</td></tr>`);
    }
    return partes.join("") || `<tr><td colspan="3" class="vazio">Nenhuma medida no modelo ainda.</td></tr>`;
  }

  function linhasConfiguracoes(): string {
    const confs = projeto.configuracoes();
    const params = projeto.parametros();
    const ativa = projeto.configuracaoAtiva();
    const cab = `<tr><th>Configuração</th>${params.map((p) => `<th>${esc(p.nome)}</th>`).join("")}<th></th></tr>`;
    if (!confs.length) return cab + `<tr><td colspan="${params.length + 2}" class="vazio">Nenhuma. Ajuste os parâmetros e clique em "Salvar atual".</td></tr>`;
    return (
      cab +
      confs
        .map(
          (c) => `<tr data-conf="${esc(c.nome)}" class="${c.nome === ativa ? "ativa" : ""}">
          <td><button data-ativar="${esc(c.nome)}" title="Ativar">${c.nome === ativa ? "●" : "○"}</button> ${esc(c.nome)}</td>
          ${params.map((p) => `<td><input data-conf-param="${esc(p.nome)}" value="${esc(c.valores[p.nome] ?? p.expressao)}"></td>`).join("")}
          <td><button data-apagar-conf="${esc(c.nome)}" title="Apagar">🗑</button></td></tr>`,
        )
        .join("")
    );
  }

  function linhasRegras(): string {
    const regras = projeto.regras();
    const cab = `<tr><th>Se (condição)</th><th>Então</th><th>= expressão</th><th></th></tr>`;
    if (!regras.length) return cab + `<tr><td colspan="4" class="vazio">Nenhuma. Ex.: se <code>largura > 50</code> então espessura = 4.</td></tr>`;
    return (
      cab +
      regras
        .map(
          (g, i) => `<tr data-regra="${i}">
          <td><input data-regra-campo="se" value="${esc(g.se)}"></td>
          <td><input data-regra-campo="entao" value="${esc(g.entao)}"></td>
          <td><input data-regra-campo="expressao" value="${esc(g.expressao)}"></td>
          <td><button data-apagar-regra="${i}" title="Apagar">🗑</button></td></tr>`,
        )
        .join("")
    );
  }

  function desenhar() {
    el.innerHTML = `
      <div class="jp-titulo">ALTERAR PARÂMETROS <button class="jp-fechar" title="Fechar (Esc)">✕</button></div>
      <div class="jp-corpo">
        <div class="jp-secao">Parâmetros do usuário <button class="jp-novo" title="Novo parâmetro">+</button></div>
        <table class="jp-usuario"><tr><th>Nome</th><th>Expressão</th><th>Valor</th><th>Comentário</th><th></th></tr>${linhasUsuario()}</table>
        <div class="jp-secao">Configurações <button class="jp-salvar-conf" title="Salvar os valores de agora como configuração">Salvar atual</button></div>
        <table class="jp-config">${linhasConfiguracoes()}</table>
        <div class="jp-secao">Regras de configuração <button class="jp-nova-regra" title="Nova regra">+</button></div>
        <table class="jp-regras">${linhasRegras()}</table>
        <div class="jp-secao">Parâmetros do modelo</div>
        <table class="jp-modelo"><tr><th>Medida</th><th>Expressão</th><th>Valor</th></tr>${linhasModelo()}</table>
        <p class="jp-dica">Use os nomes nas medidas: <code>largura * 2</code>, <code>10 cm</code>, <code>sqrt(area)</code>, <code>max(a; b)</code>. Também vale digitar expressões nas janelas dos comandos.</p>
      </div>
      <div class="jp-botoes"><button class="jp-ok">OK</button></div>`;
    el.querySelector(".jp-fechar")!.addEventListener("click", fechar);
    el.querySelector(".jp-ok")!.addEventListener("click", fechar);
    el.querySelector(".jp-novo")!.addEventListener("click", () => {
      const lista = projeto.parametros();
      let n = 1;
      while (lista.some((p) => p.nome === `parametro${n}`)) n++;
      projeto.definirParametros([...lista, { nome: `parametro${n}`, expressao: "10" }]);
      desenhar();
      const ultimo = el.querySelectorAll<HTMLInputElement>('.jp-usuario input[data-campo="nome"]');
      ultimo[ultimo.length - 1]?.select();
    });
    el.querySelectorAll<HTMLButtonElement>("[data-apagar]").forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.apagar);
        const lista = projeto.parametros().filter((_, k) => k !== i);
        projeto.definirParametros(lista);
        desenhar();
      }),
    );
    // Parâmetros do usuário: grava ao sair do campo ou com Enter.
    el.querySelectorAll<HTMLInputElement>(".jp-usuario input").forEach((inp) => {
      const gravar = () => {
        const i = Number(inp.closest("tr")!.dataset.i);
        const lista: Parametro[] = projeto.parametros().map((p) => ({ ...p }));
        const p = lista[i];
        const campo = inp.dataset.campo as "nome" | "expressao" | "comentario";
        const texto = inp.value.trim();
        if ((p[campo] ?? "") === texto) return;
        if (campo === "nome") {
          if (!NOME_VALIDO.test(texto)) return avisar("Nome inválido: use letras, números e _ (começando com letra).");
          if (lista.some((x, k) => k !== i && x.nome === texto)) return avisar("Já existe um parâmetro com esse nome.");
          // Troca o nome também nas expressões que usavam o nome antigo.
          const antigo = p.nome;
          p.nome = texto;
          projeto.definirParametros(lista, [antigo, texto]);
          return desenhar();
        }
        if (campo === "comentario") p.comentario = texto || undefined;
        else p[campo] = texto;
        projeto.definirParametros(lista);
        desenhar();
      };
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") gravar();
      });
      inp.addEventListener("change", gravar);
    });
    // Configurações.
    el.querySelector(".jp-salvar-conf")!.addEventListener("click", () => {
      if (!projeto.parametros().length) return avisar("Crie antes um parâmetro do usuário.");
      let n = 1;
      while (projeto.configuracoes().some((c) => c.nome === `Configuração ${n}`)) n++;
      const nome = prompt("Nome da configuração:", `Configuração ${n}`)?.trim();
      if (!nome) return;
      projeto.salvarConfiguracao(nome);
      desenhar();
    });
    el.querySelectorAll<HTMLButtonElement>("[data-ativar]").forEach((b) =>
      b.addEventListener("click", () => {
        projeto.ativarConfiguracao(b.dataset.ativar!);
        desenhar();
      }),
    );
    el.querySelectorAll<HTMLButtonElement>("[data-apagar-conf]").forEach((b) =>
      b.addEventListener("click", () => {
        projeto.apagarConfiguracao(b.dataset.apagarConf!);
        desenhar();
      }),
    );
    el.querySelectorAll<HTMLInputElement>("[data-conf-param]").forEach((inp) => {
      const gravar = () => {
        const conf = inp.closest("tr")!.dataset.conf!;
        const texto = inp.value.trim();
        try {
          avaliar(texto, projeto.valoresParametros().valores); // só confere
        } catch (e) {
          inp.classList.add("invalido");
          return avisar(e instanceof Error ? e.message : String(e));
        }
        projeto.mudarConfiguracao(conf, inp.dataset.confParam!, texto);
        desenhar();
      };
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") gravar();
      });
      inp.addEventListener("change", gravar);
    });
    // Regras de configuração.
    el.querySelector(".jp-nova-regra")!.addEventListener("click", () => {
      const p = projeto.parametros()[0];
      if (!p) return avisar("Crie um parâmetro do usuário antes (+ em Parâmetros do usuário).");
      projeto.definirRegras([...projeto.regras(), { se: `${p.nome} > 0`, entao: p.nome, expressao: p.expressao }]);
      desenhar();
    });
    el.querySelectorAll<HTMLButtonElement>("[data-apagar-regra]").forEach((b) =>
      b.addEventListener("click", () => {
        projeto.definirRegras(projeto.regras().filter((_, i) => i !== Number(b.dataset.apagarRegra)));
        desenhar();
      }),
    );
    el.querySelectorAll<HTMLInputElement>("[data-regra-campo]").forEach((inp) => {
      const gravar = () => {
        const i = Number(inp.closest<HTMLElement>("[data-regra]")!.dataset.regra);
        const campo = inp.dataset.regraCampo as "se" | "entao" | "expressao";
        if (campo === "entao" && !projeto.parametros().some((p) => p.nome === inp.value.trim())) {
          inp.classList.add("invalido");
          return avisar(`"${inp.value}" não é um parâmetro do usuário.`);
        }
        projeto.definirRegras(projeto.regras().map((g, k) => (k === i ? { ...g, [campo]: inp.value.trim() } : g)));
        desenhar();
      };
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") gravar();
      });
      inp.addEventListener("change", gravar);
    });
    // Medidas do modelo.
    el.querySelectorAll<HTMLInputElement>(".jp-modelo input").forEach((inp) => {
      const gravar = () => {
        try {
          if (inp.dataset.cota) projeto.mudarCota(inp.dataset.op!, Number(inp.dataset.cota), inp.value);
          else projeto.mudarMedida(inp.dataset.op!, inp.dataset.chave!, inp.value);
          desenhar();
        } catch (e) {
          inp.classList.add("invalido");
          avisar(e instanceof Error ? e.message : String(e));
        }
      };
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") gravar();
      });
      inp.addEventListener("change", gravar);
    });
  }

  desenhar();
  if (foco) el.querySelector(alvo)?.previousElementSibling?.scrollIntoView({ block: "start" });
  // Depois do recálculo, atualiza os valores (se ninguém estiver digitando aqui).
  projeto.aoMudar(() => {
    if (aberta === el && !el.contains(document.activeElement)) desenhar();
  });
}
