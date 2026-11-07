// HAXYS CAD do PC (caminho B): as peças salvas no celular chegam sozinhas em projetos/
// (servicoNuvem no app/vite.config.ts). Aqui: a janela "Ligar ao meu celular" e o aviso de peças novas.
export interface EstadoNuvemPc {
  ligado: boolean;
  admin: boolean;
  novas: string[];
  recebidas: string[];
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `o servidor respondeu ${r.status}`);
  return j as T;
}
const postar = <T>(url: string, dados: unknown = {}) => pedir<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });

export const lerNuvemPc = () => pedir<EstadoNuvemPc>("/api/nuvem-pc", { cache: "no-store" });
export const marcarVistas = () => postar<EstadoNuvemPc>("/api/nuvem-pc/vistas");

// Ao abrir e a cada 5 min: avisa quando chegam peças novas (o servidor sincroniza no mesmo ritmo).
export function vigiarCelular(avisar: (t: string) => void) {
  let avisadas = 0;
  const olhar = () =>
    lerNuvemPc()
      .then(({ novas }) => {
        if (novas.length && novas.length !== avisadas)
          avisar(`${novas.length === 1 ? "1 peça nova" : `${novas.length} peças novas`} do celular. Veja em Arquivo > Do celular.`);
        avisadas = novas.length;
      })
      .catch(() => {});
  void olhar();
  setInterval(olhar, 5 * 60 * 1000);
}

// Janela "Ligar ao meu celular": cola o link do convite (o mesmo que abre o HAXYS CAD no celular).
export function abrirLigarCelular(avisar: (t: string) => void) {
  if (document.querySelector(".janela-ligar-celular")) return;
  const j = document.createElement("div");
  j.className = "janela-parametros janela-ligar-celular";
  j.setAttribute("role", "dialog");
  j.innerHTML = `
    <div class="jp-titulo"><span>Ligar ao meu celular</span><button class="fechar" title="Fechar (Esc)">✕</button></div>
    <div class="jp-corpo">
      <p>Cole o link do seu convite (o mesmo que abre o HAXYS CAD no celular). As peças que você salvar no celular aparecem sozinhas aqui.</p>
      <label class="jp-nome">Link <input class="link" autocomplete="off" spellcheck="false"></label>
      <p class="jp-dica estado"></p>
    </div>
    <div class="jp-botoes"><button class="ok">Ligar</button></div>`;
  document.body.appendChild(j);
  const entrada = j.querySelector<HTMLInputElement>(".link")!;
  const estado = j.querySelector<HTMLElement>(".estado")!;
  void lerNuvemPc().then((e) => (estado.textContent = e.ligado ? "Já está ligado. Colar outro link troca o convite." : ""), () => {});
  entrada.focus();
  const fechar = () => (document.removeEventListener("keydown", tecla, true), j.remove());
  const ligar = async () => {
    if (!entrada.value.trim()) return entrada.focus();
    estado.textContent = "Ligando…";
    try {
      const r = await postar<EstadoNuvemPc & { sincronizou: boolean }>("/api/nuvem-pc/ligar", { texto: entrada.value });
      fechar();
      if (!r.sincronizou) return avisar("Ligado. A nuvem não respondeu agora: tento de novo a cada 5 minutos.");
      avisar(r.novas.length ? `Ligado. ${r.novas.length === 1 ? "1 peça nova" : `${r.novas.length} peças novas`} do celular. Veja em Arquivo > Do celular.` : "Ligado. As peças salvas no celular vão aparecer aqui.");
    } catch (e) {
      estado.textContent = e instanceof Error ? e.message : String(e);
    }
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") e.stopPropagation(), fechar();
    else if (e.key === "Enter" && !(e.target as Element).closest?.(".senha-admin")) e.stopPropagation(), e.preventDefault(), void ligar();
  };
  document.addEventListener("keydown", tecla, true);
  j.querySelector(".fechar")!.addEventListener("click", fechar);
  j.querySelector(".ok")!.addEventListener("click", () => void ligar());

  // Só o dono: Shift+clique no título mostra a senha de administrador (libera Arquivo > Convidar).
  j.querySelector(".jp-titulo span")!.addEventListener("click", (e) => {
    if (!(e as MouseEvent).shiftKey || j.querySelector(".senha-admin")) return;
    const p = document.createElement("p");
    p.className = "senha-admin";
    p.innerHTML = `<label class="jp-nome">Senha de administrador <input type="password" autocomplete="off"></label> <button class="secundario">Salvar senha</button>`;
    j.querySelector(".jp-corpo")!.appendChild(p);
    const senha = p.querySelector("input")!;
    senha.focus();
    senha.addEventListener("keydown", (ev) => ev.key === "Enter" && (ev.stopPropagation(), ev.preventDefault(), p.querySelector("button")!.click()));
    p.querySelector("button")!.addEventListener("click", async () => {
      estado.textContent = "Conferindo a senha…";
      try {
        await postar("/api/nuvem-pc/admin", { senha: senha.value });
        fechar();
        avisar("Senha guardada. Arquivo > Convidar já aparece.");
      } catch (err) {
        estado.textContent = err instanceof Error ? err.message : String(err);
      }
    });
  });
}
