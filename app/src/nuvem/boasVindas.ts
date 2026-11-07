// Boas-vindas do convidado (só na nuvem): uma vez por aparelho, com o nome do convite.
const CHAVE = "haxys.boasVindas";

export async function mostrarBoasVindas() {
  try {
    if (localStorage.getItem(CHAVE)) return;
  } catch {
    return; // sem armazenamento: não dá para lembrar, melhor não mostrar sempre
  }
  let nome = "";
  try {
    const r = await fetch("/api/nuvem/eu", { cache: "no-store" });
    if (r.ok) nome = String(((await r.json()) as { nome?: unknown }).nome ?? "");
  } catch {
    /* sem nome: "Olá!" */
  }
  const el = document.createElement("div");
  el.className = "janela-parametros boas-vindas";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.innerHTML = `<div class="jp-corpo">
      <p class="bv-ola"></p>
      <p>Toque no 🎤 e diga a peça que quer fazer. Pode mandar fotos também.</p>
      <p class="jp-dica">A IA grátis é do Google; ele pode usar os pedidos para melhorar os produtos dele.</p>
      <button class="bv-comecar">Começar</button>
    </div>`;
  el.querySelector(".bv-ola")!.textContent = nome ? `Olá, ${nome}!` : "Olá!";
  document.body.appendChild(el);
  const botao = el.querySelector<HTMLButtonElement>(".bv-comecar")!;
  botao.focus();
  botao.addEventListener("click", () => {
    try {
      localStorage.setItem(CHAVE, "1");
    } catch {
      /* sem armazenamento */
    }
    el.remove();
  });
}
