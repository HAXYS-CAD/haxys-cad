// Janela de comando, no lado direito da janela 3D (como no Fusion).
// Cada mudança de valor chama aoMudar, para mostrar a prévia na hora.
// Os campos de medida aceitam expressões ("largura * 2", "10 cm"): o comando
// recebe o número; a expressão fica disponível em expressoesDaJanela() enquanto
// aoMudar/aoOK rodam, e o projeto a guarda junto da operação.
import type { ModoOperacao } from "../nucleo/tipos";
import { ehNumeroSimples } from "../nucleo/parametros";

// Calcula uma expressão com os parâmetros do projeto (a tela principal define).
let avaliador: (texto: string) => number = (t) => {
  if (!ehNumeroSimples(t)) throw new Error("Expressões ainda não ligadas");
  return Number(t.replace(",", "."));
};
export function definirAvaliador(fn: (texto: string) => number) {
  avaliador = fn;
}

// Expressões que a próxima janela deve mostrar no lugar dos números (ao editar).
let iniciais: Record<string, string> = {};
export function usarExpressoes(mapa: Record<string, string>) {
  iniciais = mapa;
}

let pendentes: Record<string, string> | null = null;
let chavesPendentes: string[] = []; // campos da janela aberta (com ou sem expressão)
export function expressoesDaJanela(): { expressoes: Record<string, string>; chaves: string[] } | null {
  return pendentes && { expressoes: pendentes, chaves: chavesPendentes };
}

export interface Campo {
  chave: string;
  rotulo: string;
  valor: number;
  unidade?: string;
}

// Campo de escolha (lista), ex.: Eixo X / Y / Z.
export interface CampoEscolha {
  chave: string;
  rotulo: string;
  opcoes: [string, string][]; // [valor, texto]
  valor: string;
}

export interface OpcoesDialogo {
  titulo: string;
  campos: Campo[];
  modo: ModoOperacao;
  semModo?: boolean; // esconde a linha "Operação" (Arredondamento, Chanfro)
  selecao?: string; // texto da linha de seleção, ex.: "2 arestas"
  rotuloSelecao?: string; // padrão "Arestas"
  escolhas?: CampoEscolha[];
  aoMudar(valores: Record<string, number>, modo: ModoOperacao, escolhas: Record<string, string>): void;
  aoOK(valores: Record<string, number>, modo: ModoOperacao, escolhas: Record<string, string>): void;
  aoCancelar(): void;
}

const MODOS: [ModoOperacao, string][] = [
  ["novo", "Novo corpo"],
  ["unir", "Unir"],
  ["cortar", "Cortar"],
  ["intersecao", "Interseção"],
];

const opcoesHtml = (opcoes: [string, string][], valor: string) =>
  opcoes.map(([v, t]) => `<option value="${v}"${v === valor ? " selected" : ""}>${t}</option>`).join("");

let fecharAtual: (() => void) | null = null;

export function dialogoAberto(): boolean {
  return fecharAtual !== null;
}

// Fecha a janela aberta como se a pessoa clicasse em Cancelar.
export function fecharDialogo() {
  fecharAtual?.();
}

export interface Dialogo {
  definirSelecao(texto: string): void;
  definirEscolha(chave: string, valor: string, opcoes?: [string, string][]): void;
  definirCampo(chave: string, valor: number): void;
  reavaliar(): void; // chama aoMudar de novo (ex.: a seleção mudou)
}

export function abrirDialogo(raiz: HTMLElement, o: OpcoesDialogo): Dialogo {
  fecharAtual?.();
  const comecar = iniciais;
  iniciais = {};
  const textoInicial = (c: Campo) => (comecar[c.chave] ?? String(c.valor)).replace(/"/g, "&quot;");
  const el = document.createElement("div");
  el.className = "dialogo";
  el.innerHTML = `
    <div class="dialogo-titulo">${o.titulo.toUpperCase()}</div>
    <div class="dialogo-corpo">
      ${o.selecao !== undefined ? `<label><span>${o.rotuloSelecao ?? "Arestas"}</span><b class="dialogo-selecao">${o.selecao}</b><em></em></label>` : ""}
      ${o.campos
        .map(
          (c) => `<label><span>${c.rotulo}</span>
            <input type="text" inputmode="decimal" spellcheck="false" data-chave="${c.chave}" value="${textoInicial(c)}">
            <em>${c.unidade ?? "mm"}</em></label>`,
        )
        .join("")}
      ${(o.escolhas ?? [])
        .map(
          (c) => `<label><span>${c.rotulo}</span>
            <select data-escolha="${c.chave}">${opcoesHtml(c.opcoes, c.valor)}</select><em></em></label>`,
        )
        .join("")}
      <label${o.semModo ? " hidden" : ""}><span>Operação</span>
        <select class="modo">${MODOS.map(([v, t]) => `<option value="${v}"${v === o.modo ? " selected" : ""}>${t}</option>`).join("")}</select>
        <em></em></label>
    </div>
    <div class="dialogo-botoes">
      <button class="ok">OK</button>
      <button class="cancelar">Cancelar</button>
    </div>`;
  raiz.appendChild(el);

  const ler = () => {
    const valores: Record<string, number> = {};
    const expressoes: Record<string, string> = {};
    let valido = true;
    el.querySelectorAll<HTMLInputElement>("input").forEach((i) => {
      const t = i.value.trim();
      const k = i.dataset.chave!;
      i.classList.remove("invalido", "com-expressao");
      i.title = "";
      if (ehNumeroSimples(t)) {
        valores[k] = Number(t.replace(",", "."));
        return;
      }
      try {
        valores[k] = avaliador(t);
        expressoes[k] = t;
        i.classList.add("com-expressao");
        i.title = `= ${valores[k].toLocaleString("pt-BR", { maximumFractionDigits: 4 })}`;
      } catch (e) {
        valores[k] = NaN;
        valido = false;
        i.classList.add("invalido");
        i.title = e instanceof Error ? e.message : String(e);
      }
    });
    const modo = el.querySelector<HTMLSelectElement>("select.modo")!.value as ModoOperacao;
    const escolhas: Record<string, string> = {};
    el.querySelectorAll<HTMLSelectElement>("select[data-escolha]").forEach((s) => {
      escolhas[s.dataset.escolha!] = s.value;
    });
    return { valores, modo, escolhas, expressoes, valido };
  };
  // Roda fn com as expressões disponíveis para o projeto (ver expressoesDaJanela).
  const comExpressoes = (expressoes: Record<string, string>, fn: () => void) => {
    pendentes = expressoes;
    chavesPendentes = o.campos.map((c) => c.chave);
    try {
      fn();
    } finally {
      pendentes = null;
    }
  };
  const avisarMudanca = () => {
    const { valores, modo, escolhas, expressoes, valido } = ler();
    if (!valido) return; // expressão com erro: espera a pessoa corrigir
    comExpressoes(expressoes, () => o.aoMudar(valores, modo, escolhas));
  };

  const fechar = () => {
    el.remove();
    document.removeEventListener("keydown", teclas);
    fecharAtual = null;
  };
  const ok = () => {
    const { valores, modo, escolhas, expressoes, valido } = ler();
    if (!valido) return; // o campo vermelho mostra o problema (passe o mouse)
    fechar();
    comExpressoes(expressoes, () => o.aoOK(valores, modo, escolhas));
  };
  const cancelar = () => {
    fechar();
    o.aoCancelar();
  };
  function teclas(e: KeyboardEvent) {
    if (e.key === "Enter") ok();
    if (e.key === "Escape") cancelar();
  }

  el.addEventListener("input", avisarMudanca);
  el.querySelector(".ok")!.addEventListener("click", ok);
  el.querySelector(".cancelar")!.addEventListener("click", cancelar);
  document.addEventListener("keydown", teclas);
  fecharAtual = cancelar;

  const primeiro = el.querySelector<HTMLInputElement>("input");
  primeiro?.focus();
  primeiro?.select();
  avisarMudanca();

  return {
    definirCampo(chave, valor) {
      const i = el.querySelector<HTMLInputElement>(`input[data-chave="${chave}"]`);
      if (i) i.value = String(valor);
    },
    definirSelecao(texto) {
      const b = el.querySelector(".dialogo-selecao");
      if (b) b.textContent = texto;
    },
    definirEscolha(chave, valor, opcoes) {
      const s = el.querySelector<HTMLSelectElement>(`select[data-escolha="${chave}"]`);
      if (!s) return;
      if (opcoes) s.innerHTML = opcoesHtml(opcoes, valor);
      s.value = valor;
    },
    reavaliar() {
      if (el.isConnected) avisarMudanca();
    },
  };
}
