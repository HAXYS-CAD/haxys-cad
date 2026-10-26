// Janela de projetos (como o painel de dados do Fusion): lista HAXYS_CAD/projetos.
// Abrir: escolhe um da lista ou "Outro arquivo do computador…".
// Salvar como: digita o nome (clicar na lista copia o nome).
import { listarProjetos, urlImagemProjeto, type ProjetoNaPasta } from "./disco";

export const OUTRO_ARQUIVO = Symbol("outro");
export type EscolhaProjeto = { nome: string; existe: boolean } | typeof OUTRO_ARQUIVO | null;

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function escolherProjeto(modo: "abrir" | "salvar", nomeAtual: string): Promise<EscolhaProjeto> {
  let lista: ProjetoNaPasta[] = [];
  let pasta = "";
  let erro = "";
  try {
    ({ projetos: lista, pasta } = await listarProjetos());
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  const j = document.createElement("div");
  j.className = "janela-parametros janela-projetos";
  j.setAttribute("role", "dialog");
  j.innerHTML = `
    <div class="jp-titulo"><span>${modo === "abrir" ? "Abrir projeto" : "Salvar como"}</span><button class="fechar" title="Fechar (Esc)">✕</button></div>
    <div class="jp-corpo">
      <div class="jp-dica">Pasta: ${escapar(pasta || "HAXYS_CAD\\projetos")}</div>
      ${erro ? `<p class="erro">Não foi possível ler a pasta: ${escapar(erro)}</p>` : ""}
      <ul class="jp-lista">${
        lista
          .map(
            (p, i) =>
              `<li data-i="${i}" tabindex="0" title="${escapar(p.nome)}"><div class="jp-foto"><img alt="" src="${urlImagemProjeto(p.nome, p.salvoEm)}" onerror="this.replaceWith('⬡')"></div><span>${escapar(p.nome)}</span><em>${new Date(p.salvoEm).toLocaleString("pt-BR")}</em></li>`,
          )
          .join("") ||
        `<li class="vazio">Nenhum projeto salvo ainda.</li>`
      }</ul>
      ${modo === "salvar" ? `<label class="jp-nome">Nome <input value="${escapar(nomeAtual)}" maxlength="80"></label>` : ""}
    </div>
    <div class="jp-botoes">
      ${modo === "abrir" ? `<button class="outro secundario">Outro arquivo do computador…</button>` : ""}
      <button class="ok">${modo === "abrir" ? "Abrir" : "Salvar"}</button>
    </div>`;
  document.body.appendChild(j);

  const entrada = j.querySelector<HTMLInputElement>(".jp-nome input");
  let escolhido = -1;
  const marcar = (i: number) => {
    escolhido = i;
    j.querySelectorAll("li[data-i]").forEach((li) => li.classList.toggle("ativa", Number((li as HTMLElement).dataset.i) === i));
    if (entrada) entrada.value = lista[i].nome;
  };
  if (entrada) entrada.select();
  else if (lista.length) marcar(0);

  return new Promise((resolver) => {
    const fim = (r: EscolhaProjeto) => {
      document.removeEventListener("keydown", tecla, true);
      j.remove();
      resolver(r);
    };
    const confirmar = () => {
      if (entrada) {
        const nome = entrada.value.trim();
        if (!nome) return entrada.focus();
        return fim({ nome, existe: lista.some((p) => p.nome === nome) });
      }
      if (escolhido >= 0) fim({ nome: lista[escolhido].nome, existe: true });
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.stopPropagation(), fim(null);
      else if (e.key === "Enter") e.stopPropagation(), e.preventDefault(), confirmar();
    };
    document.addEventListener("keydown", tecla, true);
    j.querySelector(".fechar")!.addEventListener("click", () => fim(null));
    j.querySelector(".ok")!.addEventListener("click", confirmar);
    j.querySelector(".outro")?.addEventListener("click", () => fim(OUTRO_ARQUIVO));
    j.querySelectorAll<HTMLElement>("li[data-i]").forEach((li) => {
      const i = Number(li.dataset.i);
      li.addEventListener("click", () => marcar(i));
      li.addEventListener("dblclick", () => (marcar(i), confirmar()));
    });
  });
}
