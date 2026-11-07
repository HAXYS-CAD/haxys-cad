// Janela "Convidar" (só o dono, no PC): cria o convite na nuvem e abre o WhatsApp e o e-mail já
// escritos. Quem toca em enviar é o dono: nada é enviado sozinho. Embaixo, a lista para bloquear.
import { montarMensagens, numeroWhatsApp } from "../../../nuvem/logica.mjs";

interface Convite {
  codigo: string;
  nome: string;
  criado: string;
  bloqueado: boolean;
}

const escapar = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `o servidor respondeu ${r.status}`);
  return j as T;
}

export function abrirConvidar(avisar: (t: string) => void) {
  if (document.querySelector(".janela-convidar")) return;
  const j = document.createElement("div");
  j.className = "janela-parametros janela-convidar";
  j.setAttribute("role", "dialog");
  j.innerHTML = `
    <div class="jp-titulo"><span>Convidar</span><button class="fechar" title="Fechar (Esc)">✕</button></div>
    <div class="jp-corpo">
      <label class="jp-nome">Nome <input class="nome" maxlength="80" autocomplete="off"></label>
      <label class="jp-nome">WhatsApp <input class="whatsapp" inputmode="tel" placeholder="(11) 98765-4321" autocomplete="off"></label>
      <label class="jp-nome">E-mail <input class="email" type="email" autocomplete="off"></label>
      <p class="jp-dica estado">O convidado não faz cadastro: só toca no link.</p>
      <ul class="jp-lista convidados"></ul>
    </div>
    <div class="jp-botoes"><button class="ok">Convidar</button></div>`;
  document.body.appendChild(j);
  const campo = (c: string) => j.querySelector<HTMLInputElement>(`.${c}`)!;
  const estado = j.querySelector<HTMLElement>(".estado")!;
  const lista = j.querySelector<HTMLElement>(".convidados")!;
  campo("nome").focus();

  const listar = async () => {
    try {
      const { convites } = await pedir<{ convites: Convite[] }>("/api/nuvem-pc/convites", { cache: "no-store" });
      lista.innerHTML =
        convites
          .map(
            (c) =>
              `<li data-codigo="${c.codigo}"><span>${escapar(c.nome)}${c.bloqueado ? " (bloqueado)" : ""}</span><em>${new Date(c.criado).toLocaleDateString("pt-BR")}</em>` +
              `<button class="secundario">${c.bloqueado ? "Desbloquear" : "Bloquear"}</button></li>`,
          )
          .join("") || `<li class="vazio">Ninguém convidado ainda.</li>`;
      lista.querySelectorAll<HTMLElement>("li[data-codigo]").forEach((li) =>
        li.querySelector("button")!.addEventListener("click", async () => {
          const acao = li.querySelector("button")!.textContent === "Bloquear" ? "bloquear" : "desbloquear";
          try {
            await pedir(`/api/nuvem-pc/convites/${li.dataset.codigo}/${acao}`, { method: "POST" });
            await listar();
          } catch (e) {
            estado.textContent = e instanceof Error ? e.message : String(e);
          }
        }),
      );
    } catch (e) {
      lista.innerHTML = `<li class="vazio">Não foi possível ler os convidados: ${escapar(e instanceof Error ? e.message : String(e))}</li>`;
    }
  };
  void listar();

  const convidar = async () => {
    const nome = campo("nome").value.trim();
    if (!nome) return campo("nome").focus();
    const whatsapp = campo("whatsapp").value.trim(), email = campo("email").value.trim();
    const numero = whatsapp ? numeroWhatsApp(whatsapp) : null;
    if (whatsapp && !numero) return (estado.textContent = "WhatsApp: escreva o DDD e o número, ex.: (11) 98765-4321."), campo("whatsapp").focus();
    estado.textContent = "Criando o convite…";
    try {
      const c = await pedir<{ link: string; linkInstalar: string }>("/api/nuvem-pc/convites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nome, whatsapp, email }),
      });
      const m = montarMensagens({ nome, link: c.link, linkInstalar: c.linkInstalar });
      // No programa instalado o window.open vira o WhatsApp/e-mail do Windows (electron/main.cjs).
      if (numero) window.open(`https://wa.me/${numero}?text=${encodeURIComponent(m.whatsapp)}`, "_blank");
      if (email) window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(m.assunto)}&body=${encodeURIComponent(m.email)}`, "_blank");
      estado.textContent = numero || email ? `Convite de ${nome} criado. Confira e toque em enviar no WhatsApp/e-mail.` : `Convite de ${nome} criado: ${c.link}`;
      avisar(`Convite de ${nome} criado.`);
      campo("nome").value = campo("whatsapp").value = campo("email").value = "";
      await listar();
    } catch (e) {
      estado.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  const fechar = () => (document.removeEventListener("keydown", tecla, true), j.remove());
  const tecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") e.stopPropagation(), fechar();
    else if (e.key === "Enter") e.stopPropagation(), e.preventDefault(), void convidar();
  };
  document.addEventListener("keydown", tecla, true);
  j.querySelector(".fechar")!.addEventListener("click", fechar);
  j.querySelector(".ok")!.addEventListener("click", () => void convidar());
}
