// Falar com a IA (painel HAXYS): conversa por voz ou texto que modela a peça,
// sem chave paga.
// - Microfone: reconhecimento de fala do navegador em português (Chrome/Edge;
//   o áudio é transcrito pelo serviço do navegador). "Áudio aberto" fica
//   ouvindo sem parar e responde a cada frase.
// - Modo "Codex" (padrão) e "Claude": o pedido vai para o serviço local
//   /api/ia (app/vite.config.ts), que roda o Codex (login do ChatGPT) ou o
//   Claude Code (login da assinatura do Claude) neste computador. A IA constrói
//   pela ponte MCP do HAXYS CAD e responde em poucas frases. As últimas trocas
//   vão junto, para a IA lembrar da conversa. Fotos anexadas (até 30): só no
//   Codex; ficam anexadas até tirar. "Replicar peça da foto" manda replica:true.
// - Modo "Comandos": sem internet, frases simples (ver nucleo/comandosVoz.ts).
// - "Responder falando": lê a resposta em voz alta.
import type { Projeto } from "../nucleo/projeto";
import { EXEMPLOS_VOZ, interpretar } from "../nucleo/comandosVoz";
import { executarScript } from "./consoleScript";
import { preferencias } from "../comandos/bambu";
import { abrirAssistenteIA, estadoIA } from "./assistenteIA";
import { noCelular } from "./celular";

interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

const ler = (k: string) => {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
};
const gravar = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento */
  }
};

// Texto do estado do projeto para a IA saber o que já existe.
export function resumoDoProjeto(projeto: Projeto): string {
  const ops = projeto.estado.historico
    .filter((o) => o.tipo !== "parametros")
    .map((o) => {
      const p = Object.entries(o.params)
        .map(([k, v]) => `${k}=${+v.toFixed(3)}`)
        .join(" ");
      return `- ${o.nome} (${o.tipo}${o.modo && o.modo !== "novo" ? `, ${o.modo}` : ""})${p ? `: ${p}` : ""}${projeto.estado.erros[o.id] ? ` [ERRO: ${projeto.estado.erros[o.id]}]` : ""}`;
    });
  const corpos = projeto.estado.corposBase.map((c) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < c.vertices.length; i += 3)
      for (let k = 0; k < 3; k++) (mn[k] = Math.min(mn[k], c.vertices[i + k])), (mx[k] = Math.max(mx[k], c.vertices[i + k]));
    const f = (v: number) => +v.toFixed(2);
    return `- ${c.nome}${c.ehMalha ? " (malha)" : c.ehSuperficie ? " (superfície)" : ""}: de [${mn.map(f)}] a [${mx.map(f)}]`;
  });
  const pars = projeto.parametros().map((p) => `- ${p.nome} = ${p.expressao}`);
  return [
    "Operações (linha do tempo):",
    ...(ops.length ? ops : ["(nenhuma)"]),
    "Corpos (caixa em volta, mm, Y para cima):",
    ...(corpos.length ? corpos : ["(nenhum)"]),
    ...(pars.length ? ["Parâmetros do usuário:", ...pars] : []),
  ].join("\n");
}

let aberto: HTMLElement | null = null;
const NOMES_IA: Record<string, string> = { chave: "IA", codex: "Codex", claude: "Claude" };
const MAX_FOTOS = 30;

// Abre a IA no painel completo, em Codex, com as fotos anexadas e o formulário
// de réplica aberto (usado por "Peça a partir de imagem" com várias fotos).
export function replicarComFotos(projeto: Projeto, avisar: (t: string) => void, arqs: File[]) {
  abrirVoz(projeto, avisar);
  const el = aberto as (HTMLElement & { anexar: (a: Iterable<File>) => Promise<void> }) | null;
  if (!el) return;
  el.classList.remove("compacta");
  const modo = el.querySelector<HTMLSelectElement>(".voz-modo")!;
  if (modo.value !== "codex") (modo.value = "codex"), modo.dispatchEvent(new Event("change"));
  if (el.querySelector<HTMLElement>(".voz-form-replica")!.hidden) el.querySelector<HTMLElement>(".voz-replicar")!.click();
  void el.anexar(arqs);
}

export function abrirVoz(projeto: Projeto, avisar: (t: string) => void) {
  if (aberto) return;
  const SR = !isSecureContext ? undefined : (window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: new () => Reconhecedor }).webkitSpeechRecognition;
  const el = document.createElement("div");
  el.className = "janela-parametros janela-voz";
  el.innerHTML = `
    <div class="jp-titulo" title="Arraste para mudar de lugar"><span>HAXYS CAD · IA</span><span><button class="voz-encolher" title="Painel completo / aparelho pequeno">⤢</button><button class="jp-fechar" title="Fechar">✕</button></span></div>
    <div class="jp-corpo">
      <div class="voz-aparelho">
        <button class="voz-mic-grande" title="Falar / parar">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg>
        </button>
        <div class="voz-lcd"><div class="voz-eq"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><button class="voz-chip" title="Conversa aberta: fica ouvindo e responde a cada frase. 1 frase: para depois de cada pedido."></button></div><div class="voz-tela"></div></div>
      </div>
      <div class="voz-linha voz-opcoes">
        <label>IA <select class="voz-modo">
          <option value="chave">Minha IA (ligada no Ligar IA)</option>
          <option value="codex">Codex (sua conta do ChatGPT)</option>
          <option value="claude">Claude (sua assinatura do Claude)</option>
          <option value="local">Comandos simples (sem internet)</option>
        </select></label>
        <label>Voz <select class="voz-voz"></select></label>
        <button class="voz-ligar" hidden title="Escolher e ligar uma IA (grátis, com a sua chave ou com a conta deste PC)">⚡ Ligar IA</button>
      </div>
      <div class="voz-conversa"></div>
      <div class="voz-linha voz-anexo" hidden></div>
      <div class="voz-linha voz-opcoes">
        <button class="voz-mic" title="Falar">🎤 Falar</button>
        <label><input type="checkbox" class="voz-aberto"> Áudio aberto</label>
        <label><input type="checkbox" class="voz-falar" checked> Responder falando</label>
        <button class="voz-imagem voz-so-codex" title="Anexar fotos (Codex): marque várias com Ctrl+A ou Ctrl+clique, ou arraste da pasta para esta janela. Ficam anexadas até tirar no ✕.">🖼 Fotos</button>
        <button class="voz-replicar voz-so-codex" title="A IA estuda as fotos, pesquisa a peça e constrói (Codex)">📷 Replicar peça da foto</button>
      </div>
      <div class="voz-form-replica" hidden>
        <label>O que é a peça <input class="rp-oque" placeholder="ex.: suporte de prateleira, tampa de controle"></label>
        <label>Para que serve / como se usa <input class="rp-uso" placeholder="ex.: segura uma tábua de 18 mm, parafusa na parede"></label>
        <label>Medidas que você sabe <input class="rp-medidas" placeholder="ex.: largura 60 mm, furo 5 mm (deixe vazio se não souber)"></label>
        <div class="voz-info">Fotos: clique em 🖼 Fotos e, na pasta, aperte Ctrl+A (todas) ou segure Ctrl e clique em cada uma; ou arraste as fotos da pasta e solte nesta janela. Até 30.</div>
        <div class="voz-info rp-impressora"></div>
        <div class="voz-linha"><button class="rp-enviar">Replicar</button><button class="rp-cancelar">Cancelar</button></div>
      </div>
      <div class="voz-linha voz-pedido">${noCelular ? `<button class="voz-anexar voz-so-codex" title="Mandar imagem" aria-label="Mandar imagem">🖼</button>` : ""}<input class="voz-texto" placeholder="${noCelular ? "Descreva a peça…" : "Fale ou digite: faça um cubo de 30 mm com um furo de 10 no meio"}">${noCelular ? `<button class="voz-teclado" title="Falar com a IA" aria-label="Falar com a IA">🎤</button>` : ""}<button class="voz-enviar"${noCelular ? ` aria-label="Enviar"` : ""}>${noCelular ? "➤" : "Enviar"}</button></div>
    </div>`;
  document.body.appendChild(el);
  aberto = el;
  const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const conversa = $<HTMLDivElement>(".voz-conversa");
  const campo = $<HTMLInputElement>(".voz-texto");
  const modo = $<HTMLSelectElement>(".voz-modo");
  modo.value = ["chave", "codex", "claude", "local"].includes(ler("haxys.vozModo")) ? ler("haxys.vozModo") : "codex";
  const comFotos = () => modo.value === "codex" || modo.value === "chave";
  const mostrarModo = () => el.querySelectorAll<HTMLElement>(".voz-so-codex").forEach((x) => (x.hidden = !comFotos()));
  $(".voz-ligar").addEventListener("click", () => abrirAssistenteIA());
  // O assistente ligou uma IA: a caixa passa a usar ela.
  const ligada = (e: Event) => {
    if (!el.isConnected) return removeEventListener("haxys-ia-ligada", ligada);
    const m = (e as CustomEvent<string>).detail;
    if (m) (modo.value = m), gravar("haxys.vozModo", m), mostrarModo(), ($(".voz-ligar").hidden = true), escrever("info", "IA ligada. Toque no microfone e fale.");
  };
  addEventListener("haxys-ia-ligada", ligada);
  mostrarModo();
  modo.addEventListener("change", () => (gravar("haxys.vozModo", modo.value), mostrarModo()));
  for (const i of el.querySelectorAll("input")) i.addEventListener("keydown", (e) => e.stopPropagation());

  // Aparelho pequeno (padrão) que se arrasta pelo título ou pelo corpo;
  // ⤢ abre o painel completo. Lugar e modo ficam lembrados.
  const tela = $<HTMLDivElement>(".voz-tela");
  const colocar = (x: number, y: number) => {
    x = Math.max(0, Math.min(x, innerWidth - el.offsetWidth));
    y = Math.max(0, Math.min(y, innerHeight - 40));
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto" });
  };
  try {
    const p = JSON.parse(ler("haxys.vozLugar") || "null") as [number, number] | null;
    if (p) colocar(p[0], p[1]);
  } catch {
    /* lugar inválido: fica no canto padrão */
  }
  el.addEventListener("pointerdown", (e) => {
    const alvo = e.target as HTMLElement;
    if (!alvo.closest(".jp-titulo, .voz-aparelho") || alvo.closest("button, .voz-tela")) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    el.setPointerCapture(e.pointerId);
    const mover = (m: PointerEvent) => colocar(m.clientX - dx, m.clientY - dy);
    const soltar = () => {
      el.removeEventListener("pointermove", mover);
      const q = el.getBoundingClientRect();
      gravar("haxys.vozLugar", JSON.stringify([Math.round(q.left), Math.round(q.top)]));
    };
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar, { once: true });
  });
  // No celular abre completa: a voz é o 🎤 do teclado, na caixa de texto.
  el.classList.toggle("compacta", !noCelular && ler("haxys.vozCompleta") !== "1");
  const encolher = $<HTMLButtonElement>(".voz-encolher");
  // Celular: a IA é a tela principal; — minimiza para um pontinho (a peça fica à vista).
  if (noCelular) (encolher.textContent = "—"), (encolher.title = "Minimizar (vira um pontinho)");
  encolher.addEventListener("click", () => {
    const compacta = el.classList.toggle("compacta");
    if (noCelular) return campo.blur();
    gravar("haxys.vozCompleta", compacta ? "0" : "1");
  });
  // Sem reconhecimento de fala (celular pelo endereço http antigo): o 🎤 abre o teclado e o ditado dele.
  const peloTeclado = () => (el.classList.remove("compacta"), campo.focus(), escrever("info", "Toque no 🎤 do teclado e fale. Depois toque em ➤."));
  $(".voz-mic-grande").addEventListener("click", () => (noCelular && !SR ? peloTeclado() : $(".voz-mic").click()));
  if (noCelular) {
    $(".voz-anexar").addEventListener("click", () => $(".voz-imagem").click());
    // 🎤 da tela: já abre o microfone, sem teclado, e a caixa vira o pontinho (vermelho enquanto ouve).
    $(".voz-teclado").addEventListener("click", () => {
      if (!SR) return peloTeclado();
      $(".voz-mic").click();
      if (ouvindo) el.classList.add("compacta");
    });
    // Pontinho: tocar abre a caixa; arrastar muda de lugar (fica lembrado).
    const ponto = (x: number, y: number) => {
      el.style.setProperty("--px", `${Math.max(0, Math.min(x, innerWidth - 44))}px`);
      el.style.setProperty("--py", `${Math.max(0, Math.min(y, innerHeight - 44))}px`);
    };
    try {
      const p = JSON.parse(ler("haxys.pontoLugar") || "null") as [number, number] | null;
      if (p) ponto(p[0], p[1]);
    } catch {
      /* lugar inválido: fica no canto padrão */
    }
    el.addEventListener("pointerdown", (e) => {
      if (!el.classList.contains("compacta")) return;
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      let arrastou = false;
      el.setPointerCapture(e.pointerId);
      const mover = (m: PointerEvent) => {
        if (!arrastou && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 8) return;
        arrastou = true;
        ponto(m.clientX - dx, m.clientY - dy);
      };
      const soltar = (u: PointerEvent) => {
        el.removeEventListener("pointermove", mover);
        el.removeEventListener("pointerup", soltar);
        el.removeEventListener("pointercancel", soltar);
        const q = el.getBoundingClientRect();
        if (arrastou) gravar("haxys.pontoLugar", JSON.stringify([Math.round(q.left), Math.round(q.top)]));
        else if (u.type === "pointerup") el.classList.remove("compacta");
      };
      el.addEventListener("pointermove", mover);
      el.addEventListener("pointerup", soltar);
      el.addEventListener("pointercancel", soltar);
    });
  }
  // O celular só toca som que começa num toque: a 1ª fala (vazia) sai no 1º toque na caixa.
  let falaLiberada = false;
  el.addEventListener("click", () => {
    if (falaLiberada || !("speechSynthesis" in window)) return;
    falaLiberada = true;
    speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(" "), { volume: 0 }));
  }, true);

  const escrever = (quem: "voce" | "haxys" | "erro" | "info", texto: string) => {
    const d = document.createElement("div");
    d.className = `voz-msg voz-${quem}`;
    d.textContent = texto;
    conversa.appendChild(d);
    conversa.scrollTop = conversa.scrollHeight;
    tela.textContent = (quem === "voce" ? "Você: " : quem === "haxys" ? "IA: " : "") + texto;
    tela.className = `voz-tela voz-tela-${quem}`;
    tela.scrollTop = 0;
    return d;
  };
  escrever("info", noCelular
    ? "Toque no 🎤 e fale a peça que você quer, ou escreva. Ex.: caixa de 30 por 20 por 10 mm com furo de 5 no meio. 🖼 manda imagem. A IA responde falando. — vira um pontinho para ver a peça; toque nele para voltar."
    : "Peça do seu jeito: toque no 🎤 microfone e fale, ou digite. A IA usa a sua conta e leva uns 15 a 60 segundos por pedido.");
  tela.textContent = "Toque no microfone e diga o que quer construir.";
  if (!SR) escrever("info", noCelular ? "No celular, toque na caixa de texto e use o microfone do teclado para falar." : "Este navegador não tem reconhecimento de fala: digite as frases (Chrome e Edge têm).");
  void estadoIA().then((j) => {
    if (!j) return escrever("erro", "Sem o serviço local (abra o HAXYS CAD pelo atalho ou pelo INICIAR.bat): só o modo Comandos funciona.");
    // Sem escolha guardada nesta tela: usa a IA ligada no assistente.
    if (!ler("haxys.vozModo") && j.ligada) (modo.value = j.ligada), mostrarModo();
    // "Ligar IA" só aparece enquanto não há IA ligada.
    if (!j.ligada && !j.codex && !j.claude) {
      escrever("info", "Nenhuma IA ligada ainda. Disponível quando você ligar a IA.");
      $(".voz-ligar").hidden = false;
      $(".voz-ligar").classList.add("chamar");
    } else if (modo.value === "codex" && !j.codex) escrever("info", "Codex não encontrado neste computador.");
    else if (modo.value === "claude" && !j.claude) escrever("info", "Claude Code não encontrado neste computador.");
  });

  // ---- Fala (resposta em voz alta) ----
  // Vozes em português, as mais naturais primeiro: "Natural/Online" (Edge) e
  // "Google" (Chrome) soam humanas; as instaladas no Windows soam robóticas.
  const caixaVoz = $<HTMLSelectElement>(".voz-voz");
  const nota = (v: SpeechSynthesisVoice) => (/natural/i.test(v.name) ? 0 : /online|google/i.test(v.name) ? 1 : 2) + (v.lang.toLowerCase() === "pt-br" ? 0 : 0.5);
  const vozes = () => ("speechSynthesis" in window ? speechSynthesis.getVoices() : []).filter((v) => v.lang.startsWith("pt")).sort((a, b) => nota(a) - nota(b));
  const listarVozes = () => {
    const vs = vozes();
    caixaVoz.replaceChildren(...vs.map((v) => new Option(`${v.name.replace(/^Microsoft /, "").replace(/ - Portuguese.*| \(Brazil\)/g, "")}${nota(v) < 2 ? " ★" : ""}`, v.name)));
    caixaVoz.value = vs.some((v) => v.name === ler("haxys.vozNome")) ? ler("haxys.vozNome") : (vs[0]?.name ?? "");
  };
  listarVozes();
  if ("speechSynthesis" in window) speechSynthesis.addEventListener("voiceschanged", listarVozes);
  caixaVoz.addEventListener("change", () => (gravar("haxys.vozNome", caixaVoz.value), void falar("Olá! Esta é a minha voz.")));
  let falando = false;
  const falar = (texto: string) =>
    new Promise<void>((ok) => {
      if (!$<HTMLInputElement>(".voz-falar").checked || !texto || !("speechSynthesis" in window)) return ok();
      // Sem os símbolos de formatação (** e `) que a IA às vezes manda.
      const u = new SpeechSynthesisUtterance(texto.replace(/[*`_#]/g, "").slice(0, 400));
      u.lang = "pt-BR";
      const voz = vozes().find((v) => v.name === caixaVoz.value) ?? vozes()[0];
      if (voz) u.voice = voz;
      falando = true;
      pausarEscuta();
      let fim = false;
      const terminar = () => {
        if (fim) return;
        fim = true;
        falando = false;
        retomarEscuta();
        ok();
      };
      u.onend = u.onerror = terminar;
      // Alguns navegadores não avisam o fim da fala: sem isso o painel travava.
      setTimeout(terminar, 2000 + u.text.length * 120);
      speechSynthesis.speak(u);
    });

  // ---- Fotos anexadas (Codex): ficam até a pessoa tirar no ✕; até MAX_FOTOS (mesmo limite do /api/ia) ----
  const fotos: { tipo: string; base64: string; nome: string }[] = [];
  const mostrarAnexo = () => {
    const caixa = $<HTMLDivElement>(".voz-anexo");
    caixa.hidden = !fotos.length;
    // Celular: uma linha só (miniaturas ocupam a tela pequena).
    if (noCelular) {
      caixa.innerHTML = `<span>📎 ${fotos.length} foto${fotos.length > 1 ? "s" : ""} anexada${fotos.length > 1 ? "s" : ""}</span><button title="Tirar as fotos">✕</button>`;
      return caixa.querySelector("button")!.addEventListener("click", () => (fotos.splice(0), mostrarAnexo()));
    }
    caixa.replaceChildren(
      ...fotos.map((f, i) => {
        const d = document.createElement("span");
        d.className = "voz-foto";
        d.title = f.nome;
        d.innerHTML = `<img class="voz-miniatura" alt=""><button title="Tirar esta foto">✕</button>`;
        d.querySelector("img")!.src = `data:${f.tipo};base64,${f.base64}`;
        d.querySelector("button")!.addEventListener("click", () => (fotos.splice(i, 1), mostrarAnexo()));
        return d;
      }),
    );
  };
  // Foto de celular é grande: reduz para 2.400 px no lado maior (JPEG), o que
  // ainda deixa ler o paquímetro e mantém 30 fotos dentro do limite do /api/ia.
  const reduzir = async (f: File) => {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const url = c.toDataURL("image/jpeg", 0.9);
    return url.slice(url.indexOf(",") + 1);
  };
  let chegando = 0;
  const anexar = async (arqs: Iterable<File>) => {
    for (const f of arqs) {
      if (fotos.length + chegando >= MAX_FOTOS) return escrever("erro", `No máximo ${MAX_FOTOS} fotos.`);
      if (!f.type.startsWith("image/")) { escrever("erro", `${f.name}: não é foto.`); continue; }
      if (f.size > 40 * 1024 * 1024) { escrever("erro", `${f.name}: grande demais (até 40 MB).`); continue; }
      chegando++;
      try {
        fotos.push({ tipo: "image/jpeg", base64: await reduzir(f), nome: f.name });
      } catch {
        escrever("erro", `${f.name}: o navegador não abre esse tipo de foto (use JPG ou PNG).`);
      } finally {
        chegando--;
      }
      mostrarAnexo();
    }
    if (fotos.length) escrever("info", `${fotos.length} foto(s) anexada(s).`);
  };
  // Arrastar várias fotos da pasta do Windows e soltar em cima da janela.
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("soltando");
  });
  el.addEventListener("dragleave", (e) => {
    if (!el.contains(e.relatedTarget as Node)) el.classList.remove("soltando");
  });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("soltando");
    if (e.dataTransfer?.files.length) void anexar(e.dataTransfer.files);
  });
  $(".voz-imagem").addEventListener("click", () => {
    const i = document.createElement("input");
    i.type = "file";
    i.multiple = true;
    i.accept = "image/*";
    i.addEventListener("change", () => void anexar(i.files ?? []));
    i.click();
  });

  // ---- Replicar peça da foto (formulário guiado) ----
  const form = $<HTMLDivElement>(".voz-form-replica");
  $(".voz-replicar").addEventListener("click", () => {
    const p = preferencias();
    $(".rp-impressora").textContent = `Impressora: ${p.impressora}, bico ${p.bico} (troque em Imprimir 3D).`;
    form.hidden = !form.hidden;
  });
  $(".rp-cancelar").addEventListener("click", () => (form.hidden = true));
  $(".rp-enviar").addEventListener("click", () => {
    if (!fotos.length) return escrever("erro", "Anexe pelo menos uma foto da peça (botão 🖼 Fotos). Com o marcador HAXYS ao lado, as medidas ficam certas.");
    const v = (s: string) => $<HTMLInputElement>(s).value.trim();
    const p = preferencias();
    const frase = [
      `Replique a peça das ${fotos.length} foto(s).`,
      v(".rp-oque") && `O que é: ${v(".rp-oque")}.`,
      v(".rp-uso") && `Uso: ${v(".rp-uso")}.`,
      v(".rp-medidas") && `Medidas que eu sei: ${v(".rp-medidas")}.`,
      `Impressora: ${p.impressora}, bico ${p.bico}.`,
    ].filter(Boolean).join(" ");
    form.hidden = true;
    void processar(frase, true);
  });

  // ---- Processar uma frase ----
  const trocas: string[] = []; // "Pessoa: ..." / "IA: ..." (as últimas vão para a IA)
  let ocupado = false;
  async function pedirAIA(frase: string, replica: boolean): Promise<string> {
    const imagens = comFotos() ? fotos.map(({ tipo, base64 }) => ({ tipo, base64 })) : [];
    const r = await fetch("/api/ia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ia: modo.value, texto: frase, conversa: trocas.slice(-8).join("\n"), imagens, replica }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro ?? `A IA respondeu ${r.status}`);
    return String(j.resposta ?? "");
  }
  async function processar(frase: string, replica = false) {
    frase = frase.trim();
    if (!frase) return;
    if (ocupado) return void (tela.textContent = "Espere: ainda estou fazendo o pedido anterior.");
    ocupado = true;
    escrever("voce", frase);
    campo.value = "";
    try {
      if (modo.value === "local") {
        const i = interpretar(frase);
        if (!i) {
          escrever("haxys", "Não entendi. Tente: " + EXEMPLOS_VOZ.slice(0, 3).join(" · ") + " (ou troque para o Codex).");
          await falar("Não entendi.");
        } else if (!i.script) {
          escrever("haxys", i.resposta);
          await falar(i.resposta);
        } else {
          const linhas: string[] = [];
          const r = await executarScript(i.script, projeto, (...a) => linhas.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")));
          for (const l of linhas) escrever("info", l);
          const msg = r.erro ? `Não deu: ${r.erro}` : typeof r.valor === "string" ? r.valor : i.resposta;
          escrever(r.erro ? "erro" : "haxys", msg);
          await falar(msg);
        }
        return;
      }
      const espera = escrever("info", `${NOMES_IA[modo.value] ?? "IA"} trabalhando…`);
      const inicio = performance.now();
      const relogio = setInterval(() => (espera.textContent = `${NOMES_IA[modo.value] ?? "IA"} trabalhando… ${Math.round((performance.now() - inicio) / 1000)} s`), 1000);
      let resposta: string;
      try {
        resposta = await pedirAIA(frase, replica);
      } finally {
        clearInterval(relogio);
        espera.remove();
      }
      trocas.push(`Pessoa: ${frase}`, `IA: ${resposta}`);
      escrever("haxys", resposta);
      await falar(resposta);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      escrever("erro", m);
      await falar("Deu um problema.");
    } finally {
      ocupado = false;
    }
  }

  // ---- Microfone ----
  let rec: Reconhecedor | null = null;
  let ouvindo = false;
  const botaoMic = $<HTMLButtonElement>(".voz-mic");
  // Conversa aberta é o padrão (fica lembrada); o chip do aparelho troca.
  const caixaAberta = $<HTMLInputElement>(".voz-aberto");
  const chip = $<HTMLButtonElement>(".voz-chip");
  const mostrarAberta = () => {
    chip.textContent = caixaAberta.checked ? "CONVERSA" : "1 FRASE";
    chip.classList.toggle("ligado", caixaAberta.checked);
  };
  caixaAberta.checked = ler("haxys.vozAberta") !== "0";
  mostrarAberta();
  caixaAberta.addEventListener("change", () => (gravar("haxys.vozAberta", caixaAberta.checked ? "1" : "0"), mostrarAberta()));
  chip.addEventListener("click", () => ((caixaAberta.checked = !caixaAberta.checked), caixaAberta.dispatchEvent(new Event("change"))));
  const aberta = () => caixaAberta.checked;
  function pausarEscuta() {
    if (rec && ouvindo) rec.stop();
  }
  function retomarEscuta() {
    if (rec && ouvindo && aberta() && !falando) {
      try {
        rec.start();
      } catch {
        /* já estava ouvindo */
      }
    }
  }
  const pararMic = () => {
    ouvindo = false;
    botaoMic.textContent = "🎤 Falar";
    botaoMic.classList.remove("ativo");
    rec?.stop();
  };
  botaoMic.addEventListener("click", () => {
    if (!SR) return escrever("erro", noCelular ? "No celular, use o microfone do teclado: toque na caixa de texto e depois no 🎤 do teclado." : "Sem reconhecimento de fala neste navegador. Digite a frase.");
    if (ouvindo) return pararMic();
    rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = aberta();
    rec.interimResults = true;
    rec.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) void processar(r[0].transcript);
        else parcial += r[0].transcript;
      }
      campo.value = parcial;
      if (parcial) tela.textContent = parcial + "…";
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") (escrever("erro", "O microfone não foi liberado no navegador."), pararMic());
      else if (e.error !== "no-speech" && e.error !== "aborted") escrever("erro", `Microfone: ${e.error}`);
    };
    rec.onend = () => {
      if (ouvindo && aberta() && !falando) retomarEscuta();
      else if (!aberta() && !falando) pararMic();
    };
    ouvindo = true;
    botaoMic.textContent = "⏹ Parar";
    botaoMic.classList.add("ativo");
    tela.textContent = aberta() ? "Ouvindo. Pode falar à vontade; toque de novo para parar." : "Ouvindo. Fale o pedido.";
    rec.start();
  });

  // Celular: depois de pedir, o teclado fecha para ver a peça.
  const enviar = () => (noCelular && campo.blur(), void processar(campo.value));
  $(".voz-enviar").addEventListener("click", enviar);
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") enviar();
  });
  $(".jp-fechar").addEventListener("click", () => {
    pararMic();
    speechSynthesis?.cancel();
    el.remove();
    aberto = null;
  });
  // Para testes e para o console: processar uma frase sem microfone.
  Object.assign(el, { processar, anexar });
  void avisar;
}
