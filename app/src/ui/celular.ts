// HAXYS CAD no celular (mesmo programa, layout de toque). O index.html põe "celular" no <html>
// quando a tela é de toque e pequena (ou com ?celular no endereço); o estilo.css faz o resto.
// No PC: botão 📱 abre o QR code que liga o celular ao HAXYS CAD deste PC (porta 5174, vite.config.ts).
import qrcode from "qrcode-generator";

export const noCelular = document.documentElement.classList.contains("celular");

// "Somar" (barra do celular): a seleção soma, como o Ctrl no PC.
export let somarNoToque = false;

// Barra flutuante do celular, "tocar e segurar" = botão direito, navegador começa recolhido.
export function ligarCelular() {
  if (!noCelular) return;
  const barra = document.createElement("div");
  barra.className = "barra-celular";
  barra.innerHTML = `
    <button class="cel-esc" title="Esc: cancela ou termina o comando">Esc</button>
    <button class="cel-somar" title="Somar: cada toque soma à seleção (como o Ctrl no PC)">＋ Somar</button>`;
  document.querySelector(".area-3d")!.appendChild(barra);
  barra.querySelector(".cel-esc")!.addEventListener("click", () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })),
  );
  barra.querySelector(".cel-somar")!.addEventListener("click", (e) => {
    somarNoToque = !somarNoToque;
    (e.currentTarget as HTMLElement).classList.toggle("ligado", somarNoToque);
  });

  // Toque não tem "passar o mouse": antes do toque, a janela 3D recebe um movimento no mesmo
  // ponto (destaque do plano, prévias do esboço e da seleção usam a última posição).
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch" || !e.isPrimary || !(e.target instanceof HTMLCanvasElement)) return;
      e.target.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: e.clientX, clientY: e.clientY, pointerType: "touch", isPrimary: true, buttons: 0 }));
    },
    true,
  );

  // O iPhone não manda "contextmenu" ao segurar o dedo; o Android manda (aí não repete).
  let timer = 0;
  let nativo = false;
  document.addEventListener("contextmenu", () => (nativo = true), true);
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    nativo = false;
    const { clientX, clientY } = e;
    const alvo = e.target as Element;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (nativo) return;
      alvo.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX, clientY, button: 2 }));
    }, 600);
    const cancelar = (ev: PointerEvent) => {
      if (ev.type === "pointermove" && Math.hypot(ev.clientX - clientX, ev.clientY - clientY) < 10) return;
      clearTimeout(timer);
      document.removeEventListener("pointermove", cancelar);
    };
    document.addEventListener("pointermove", cancelar);
    document.addEventListener("pointerup", cancelar, { once: true });
    document.addEventListener("pointercancel", cancelar, { once: true });
  });

  const recolher = document.querySelector<HTMLElement>(".navegador .recolher");
  if (recolher && !document.querySelector(".navegador")!.classList.contains("recolhido")) recolher.click();
}

// Exportação no celular: além de gravar na pasta do PC, baixa o arquivo no próprio celular.
export function baixarNoCelular(dados: ArrayBuffer, nome: string) {
  if (!noCelular) return;
  const url = URL.createObjectURL(new Blob([dados], { type: "application/octet-stream" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Janela do PC: liga a porta do celular e mostra o QR code.
export async function abrirParearCelular(avisar: (t: string) => void) {
  if (document.querySelector(".janela-celular")) return;
  let info: { ligado: boolean; porta: number; enderecos: { ip: string; rede: string }[]; codigo: string };
  try {
    const r = await fetch("/api/celular", { method: "POST" });
    if (!r.ok) throw new Error(String(r.status));
    info = await r.json();
  } catch {
    return avisar("Não deu para ligar o celular: o servidor do HAXYS CAD não respondeu.");
  }
  const el = document.createElement("div");
  el.className = "janela-parametros janela-celular";
  const titulo = `<div class="jp-titulo"><span>📱 HAXYS CAD no celular</span><button class="jp-fechar" title="Fechar">✕</button></div>`;
  if (!info.ligado || !info.enderecos.length) {
    el.innerHTML = `${titulo}<div class="jp-corpo"><p>${info.ligado ? "Este PC não está ligado a nenhuma rede (Wi-Fi ou cabo)." : `A porta ${info.porta} do celular não abriu (outro programa usando?).`}</p></div>`;
  } else {
    const url = (ip: string) => `https://${ip}:${info.porta}/?c=${info.codigo}`;
    const qr = qrcode(0, "M");
    qr.addData(url(info.enderecos[0].ip));
    qr.make();
    el.innerHTML = `${titulo}<div class="jp-corpo">
      <div class="cel-qr">${qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true })}</div>
      <ol>
        <li>O celular precisa estar na <b>mesma Wi-Fi</b> deste PC.</li>
        <li>Abra a <b>câmera</b> do celular e aponte para o QR code. Toque no link que aparecer.</li>
        <li>Na 1ª vez o celular avisa que a conexão "não é particular" (o certificado é deste PC, não da internet): toque em <b>Avançado</b> → <b>Continuar</b> (iPhone: <b>Mostrar detalhes</b> → <b>visitar este site</b>). É o que libera o microfone.</li>
        <li>Na 1ª vez o Windows pode perguntar se deixa o HAXYS CAD usar a rede: marque <b>Redes privadas</b> e toque em <b>Permitir</b>.</li>
        <li>No celular, para ter o ícone: menu do navegador → <b>Adicionar à tela inicial</b> (iPhone: botão Compartilhar → Adicionar à Tela de Início).</li>
      </ol>
      <p class="jp-dica">Endereço: <code>${info.enderecos[0].ip}:${info.porta}</code> (${info.enderecos[0].rede}). O PC precisa ficar ligado com o HAXYS CAD aberto.
      ${info.enderecos.length > 1 ? `<br>Outros endereços deste PC: ${info.enderecos.slice(1).map((e) => `<a href="#" data-ip="${e.ip}">${e.ip}</a> (${e.rede})`).join(", ")}` : ""}</p>
    </div>`;
    // Outro endereço (ex.: Tailscale): troca o QR code.
    el.querySelectorAll<HTMLAnchorElement>("[data-ip]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const q = qrcode(0, "M");
        q.addData(url(a.dataset.ip!));
        q.make();
        el.querySelector(".cel-qr")!.innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
        el.querySelector("code")!.textContent = `${a.dataset.ip}:${info.porta}`;
      }),
    );
  }
  el.querySelector(".jp-fechar")!.addEventListener("click", () => el.remove());
  document.body.appendChild(el);
}
