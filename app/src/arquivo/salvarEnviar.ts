// "Salvar e enviar…" (celular e nuvem): escolhe o formato e baixa no celular ou manda pelo WhatsApp,
// e-mail ou outro app. O arquivo é feito ao abrir/trocar o formato: o compartilhar do celular só abre
// logo depois do toque, sem esperar. Quem toca em enviar é a pessoa; nada sai sozinho.
import { baixarNoCelular } from "../ui/celular";

export type FormatoEnvio = "stl" | "3mf" | "step" | "haxys";

export function abrirSalvarEnviar(gerar: (formato: FormatoEnvio) => Promise<File>, avisar: (t: string) => void) {
  if (document.querySelector(".janela-salvar-enviar")) return;
  const j = document.createElement("div");
  j.className = "janela-parametros janela-salvar-enviar";
  j.setAttribute("role", "dialog");
  j.innerHTML = `
    <div class="jp-titulo"><span>Salvar e enviar</span><button class="fechar" title="Fechar">✕</button></div>
    <div class="jp-corpo">
      <label class="jp-nome">Formato <select class="formato">
        <option value="stl">STL (impressão 3D)</option>
        <option value="3mf">3MF (Bambu Studio)</option>
        <option value="step">STEP (outros CAD)</option>
        <option value="haxys">Peça do HAXYS CAD (.haxys)</option>
      </select></label>
      <p class="jp-dica estado">Preparando o arquivo…</p>
    </div>
    <div class="jp-botoes jp-botoes-envio">
      <button data-destino="baixar">Baixar no celular</button>
      <button data-destino="whatsapp">Enviar pelo WhatsApp</button>
      <button data-destino="email">Enviar por e-mail</button>
      <button data-destino="outros" class="secundario">Outros apps</button>
    </div>`;
  document.body.appendChild(j);
  const estado = j.querySelector<HTMLElement>(".estado")!;
  const botoes = [...j.querySelectorAll<HTMLButtonElement>("[data-destino]")];
  const formato = j.querySelector<HTMLSelectElement>(".formato")!;
  let arquivo: File | null = null;

  const preparar = async () => {
    arquivo = null;
    botoes.forEach((b) => (b.disabled = true));
    estado.textContent = "Preparando o arquivo…";
    const pedido = formato.value;
    try {
      const f = await gerar(pedido as FormatoEnvio);
      if (formato.value !== pedido) return; // trocou o formato no meio
      arquivo = f;
      estado.textContent = `Pronto: ${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)`;
      botoes.forEach((b) => (b.disabled = false));
    } catch (e) {
      estado.textContent = `Não foi possível fazer o arquivo: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  formato.addEventListener("change", () => void preparar());
  void preparar();

  const baixar = async (f: File) => baixarNoCelular(await f.arrayBuffer(), f.name);
  botoes.forEach((b) =>
    b.addEventListener("click", () => {
      const f = arquivo;
      if (!f) return;
      const destino = b.dataset.destino!;
      if (destino === "baixar") return void baixar(f).then(() => avisar(`Baixado no celular: ${f.name}`));
      // Folha de compartilhar do celular com o arquivo anexado (a pessoa escolhe WhatsApp, e-mail...).
      if (navigator.canShare?.({ files: [f] }))
        return void navigator.share({ files: [f], title: f.name }).catch((e) => {
          if (!(e instanceof DOMException && e.name === "AbortError")) avisar(`Não foi possível compartilhar: ${e instanceof Error ? e.message : String(e)}`);
        });
      // Sem compartilhar arquivo: baixa e abre o WhatsApp/e-mail com o lembrete de anexar.
      void baixar(f);
      const lembrete = `Anexe o arquivo ${f.name} que acabou de baixar.`;
      if (destino === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(lembrete)}`, "_blank");
      else if (destino === "email") window.open(`mailto:?subject=${encodeURIComponent(`Peça ${f.name} (HAXYS CAD)`)}&body=${encodeURIComponent(lembrete)}`, "_blank");
      avisar(destino === "outros" ? `Este aparelho não compartilha arquivo: ${f.name} foi baixado.` : `${f.name} foi baixado. ${lembrete}`);
    }),
  );
  j.querySelector(".fechar")!.addEventListener("click", () => j.remove());
}
