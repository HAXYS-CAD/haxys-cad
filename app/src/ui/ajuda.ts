// Modo "O que é isto?" (botão ? da barra de cima) e tutorial breve.
// - Modo: onde o mouse PARAR, uma caixinha explica o recurso (textos em
//   ajudaTextos.ts; sem texto, usa a dica do botão). Clicar não executa nada.
//   Sai com Esc ou clicando no ? de novo.
// - Tutorial: 5 cartões, só na primeira vez (depois da abertura) e pelo ?
//   com o botão direito ou pelo link "Ver no tutorial".
import { TEXTOS_AJUDA } from "./ajudaTextos";
import { abrirAssistenteIA, estadoIA } from "./assistenteIA";
import { noCelular } from "./celular";

const lembrar = (k: string, v?: string) => {
  try {
    return v === undefined ? localStorage.getItem(k) : (localStorage.setItem(k, v), v);
  } catch {
    return null;
  }
};

let ligado = false;
let caixa: HTMLDivElement | null = null;
let rodape: HTMLDivElement | null = null;
let relogio = 0;

function explicar(alvo: HTMLElement): { titulo: string; texto: string; tutorial?: number } | null {
  // O recurso mais perto do mouse ganha: um botão com dica vale mais que a área em volta.
  for (let el: HTMLElement | null = alvo; el; el = el.parentElement) {
    const t = TEXTOS_AJUDA.find((x) => el!.matches(x.seletor));
    if (t) return t;
    if (el.title && el.matches("button, select, input, label")) {
      // Dica da faixa = "Nome" + linha "(IdDoComando)": o id não interessa à pessoa.
      const [titulo, ...resto] = el.title.split("\n").filter((l) => !/^\(\w+\)$/.test(l.trim()));
      return { titulo, texto: resto.join(" ") || "Saia da ajuda (Esc) e clique para usar." };
    }
  }
  return null;
}

function mostrar(alvo: HTMLElement, x: number, y: number) {
  const t = explicar(alvo);
  if (!caixa || !t) return void caixa?.setAttribute("hidden", "");
  caixa.innerHTML = `<b></b><p></p>${t.tutorial ? '<button class="ajuda-tutorial">Ver no tutorial</button>' : ""}`;
  caixa.querySelector("b")!.textContent = t.titulo;
  caixa.querySelector("p")!.textContent = t.texto;
  caixa.querySelector(".ajuda-tutorial")?.addEventListener("click", () => (desligar(), abrirTutorial(t.tutorial! - 1)));
  caixa.removeAttribute("hidden");
  const r = caixa.getBoundingClientRect();
  caixa.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - r.width - 8))}px`;
  caixa.style.top = `${y + 18 + r.height > innerHeight - 40 ? Math.max(8, y - r.height - 10) : y + 18}px`;
}

const mover = (e: PointerEvent) => {
  const alvo = e.target as HTMLElement;
  if (alvo.closest(".ajuda-caixa")) return;
  clearTimeout(relogio);
  // "onde o mouse parar": espera 350 ms parado.
  relogio = window.setTimeout(() => mostrar(alvo, e.clientX, e.clientY), 350);
};
// Clique no modo não executa nada (só o ?, a caixinha e o rodapé funcionam).
const bloquear = (e: Event) => {
  const alvo = e.target as HTMLElement;
  if (alvo.closest(".botao-ajuda, .ajuda-caixa, .ajuda-rodape, .barra-celular")) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.type === "click") mostrar(alvo, (e as MouseEvent).clientX, (e as MouseEvent).clientY);
};
const tecla = (e: KeyboardEvent) => {
  if (e.key === "Escape") (e.preventDefault(), e.stopImmediatePropagation(), desligar());
};
const EVENTOS = ["pointerdown", "mousedown", "click", "dblclick", "contextmenu", "wheel", "pointerup", "mouseup"] as const;

export function ligarModoAjuda() {
  if (ligado) return desligar();
  ligado = true;
  document.body.classList.add("modo-ajuda");
  document.querySelector(".botao-ajuda")?.classList.add("ligado");
  caixa = document.createElement("div");
  caixa.className = "ajuda-caixa";
  caixa.setAttribute("role", "tooltip");
  caixa.hidden = true;
  rodape = document.createElement("div");
  rodape.className = "ajuda-rodape";
  rodape.innerHTML = `Modo "O que é isto?": ${noCelular ? "toque em algo" : "pare o mouse em cima de algo"}. <b>Esc</b> para sair da ajuda. <button class="ajuda-ver-tutorial">Ver tutorial</button>`;
  rodape.querySelector("button")!.addEventListener("click", () => (desligar(), abrirTutorial()));
  document.body.append(caixa, rodape);
  addEventListener("pointermove", mover, true);
  for (const ev of EVENTOS) addEventListener(ev, bloquear, { capture: true, passive: false });
  addEventListener("keydown", tecla, true);
}

function desligar() {
  ligado = false;
  clearTimeout(relogio);
  document.body.classList.remove("modo-ajuda");
  document.querySelector(".botao-ajuda")?.classList.remove("ligado");
  caixa?.remove();
  rodape?.remove();
  caixa = rodape = null;
  removeEventListener("pointermove", mover, true);
  for (const ev of EVENTOS) removeEventListener(ev, bloquear, true);
  removeEventListener("keydown", tecla, true);
}

// ---------------------------------------------------------------- tutorial
interface Cartao { titulo: string; texto: string; foco?: string; ia?: boolean }
const CARTOES: Cartao[] = [
  { titulo: "1. Girar a vista", foco: ".viewport", texto: "Na janela 3D: arraste com o botão esquerdo para girar, com o botão direito para mover e use a roda do mouse para zoom. O cubo no canto mostra as vistas (frente, cima…)." },
  { titulo: "2. Criar uma peça simples", foco: ".faixa", texto: "Na aba SÓLIDO, clique em Caixa (ou Cilindro). Escreva as medidas na janela que abre e clique em OK. A peça aparece na janela 3D e um passo novo entra na linha do tempo, embaixo." },
  { titulo: "3. Salvar e exportar", foco: ".botao-arquivo", texto: "Arquivo → Salvar guarda o projeto (Ctrl+S). Arquivo → Exportar gera STL, STEP ou 3MF para imprimir ou mandar para outro programa." },
  { titulo: "4. Chamar a IA pela voz", foco: ".botao-ligar-ia", ia: true, texto: "Abra a caixa da IA (aba SÓLIDO → painel HAXYS → Falar com a IA), toque no 🎤 botão de microfone e diga, por exemplo: \"faça uma placa de 60 por 40 com 4 furos de 5 mm\"." },
  { titulo: "5. O que é isto?", foco: ".botao-ajuda", texto: "Na dúvida, clique no ? da barra de cima e pare o mouse em cima de qualquer coisa: aparece o que ela faz. Esc para sair. Este tutorial também fica lá." },
];
// No celular: os mesmos cartões, com toque no lugar do mouse e do teclado.
if (noCelular)
  [
    "Na janela 3D: arraste um dedo para girar; com dois dedos, abra ou feche (pinça) para zoom e arraste para mover. O cubo no canto mostra as vistas. Tocar e segurar = botão direito.",
    "Na aba SÓLIDO, toque em CRIAR → Caixa (ou Cilindro). As faixas de cima rolam para o lado com o dedo. Escreva as medidas e toque em OK. A peça aparece e um passo novo entra na linha do tempo, embaixo.",
    "Arquivo → Salvar guarda o projeto na pasta do PC. Arquivo → Exportar gera STL, STEP ou 3MF: o arquivo é baixado no celular (para o Bambu Handy, WhatsApp…) e também fica no PC.",
    "Abra a caixa da IA (aba SÓLIDO → painel HAXYS → Falar com a IA). Para falar, toque na caixa de texto e use o 🎤 do teclado do celular. Ex.: \"faça uma placa de 60 por 40 com 4 furos de 5 mm\".",
    "Na dúvida, toque no ? da barra de cima e depois toque em qualquer coisa: aparece o que ela faz. Esc (botão no canto) para sair. Este tutorial também fica lá.",
  ].forEach((texto, i) => (CARTOES[i].texto = texto));

let tutorial: HTMLElement | null = null;
export function abrirTutorial(inicio = 0) {
  tutorial?.remove();
  const el = document.createElement("div");
  el.className = "janela-parametros tutorial";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Tutorial do HAXYS CAD");
  document.body.appendChild(el);
  tutorial = el;
  let i = inicio;
  const fechar = () => {
    lembrar("haxys.tutorialVisto", "1");
    document.querySelector(".tutorial-foco")?.classList.remove("tutorial-foco");
    el.remove();
    tutorial = null;
    removeEventListener("keydown", tecla, true);
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") (e.stopImmediatePropagation(), fechar());
  };
  addEventListener("keydown", tecla, true);
  const desenhar = async () => {
    const c = CARTOES[i];
    document.querySelector(".tutorial-foco")?.classList.remove("tutorial-foco");
    if (c.foco) document.querySelector(c.foco)?.classList.add("tutorial-foco");
    el.innerHTML = `<div class="jp-titulo"><span>PRIMEIROS PASSOS · ${i + 1} de ${CARTOES.length}</span><button class="jp-fechar" title="Fechar (Esc)">✕</button></div>
      <div class="jp-corpo"><p class="tut-titulo"></p><p class="tut-texto"></p><div class="tut-ia"></div>
      <div class="ai-botoes"><button class="tut-pular">Pular</button><span></span><button class="tut-voltar" ${i ? "" : "disabled"}>Voltar</button><button class="tut-proximo">${i === CARTOES.length - 1 ? "Terminar" : "Próximo"}</button></div></div>`;
    el.querySelector(".tut-titulo")!.textContent = c.titulo;
    el.querySelector(".tut-texto")!.textContent = c.texto;
    el.querySelector(".jp-fechar")!.addEventListener("click", fechar);
    el.querySelector(".tut-pular")!.addEventListener("click", fechar);
    el.querySelector(".tut-voltar")!.addEventListener("click", () => (i--, void desenhar()));
    el.querySelector(".tut-proximo")!.addEventListener("click", () => (i < CARTOES.length - 1 ? (i++, void desenhar()) : fechar()));
    if (c.ia) {
      const s = await estadoIA();
      if (!s?.ligada && tutorial === el && CARTOES[i] === c) {
        const caixaIA = el.querySelector<HTMLDivElement>(".tut-ia")!;
        caixaIA.innerHTML = '<p class="ai-aviso">Disponível quando você ligar a IA.</p><button class="tut-ligar">Ligar agora</button>';
        caixaIA.querySelector("button")!.addEventListener("click", () => (fechar(), abrirAssistenteIA()));
      }
    }
  };
  void desenhar();
}

// Barra de cima: botões "Ligar IA" e "?" (clique = modo ajuda; botão direito = tutorial).
// Tutorial sozinho só na primeira vez, depois da abertura.
export function ligarAjuda() {
  document.querySelector(".botao-ajuda")?.addEventListener("click", ligarModoAjuda);
  document.querySelector(".botao-ajuda")?.addEventListener("contextmenu", (e) => (e.preventDefault(), abrirTutorial()));
  document.querySelector(".botao-ligar-ia")?.addEventListener("click", () => abrirAssistenteIA());
  if (lembrar("haxys.tutorialVisto") !== "1" && !/[?&]sem-tutorial/.test(location.search))
    addEventListener("haxys-abertura-fim", () => !tutorial && abrirTutorial(), { once: true });
}
