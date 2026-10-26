// Assistente de ligação da IA (um só, três portas: tutorial/primeiro uso,
// botão "Ligar IA" da barra de cima e botão "Ligar IA" da caixa da IA).
// A pessoa escolhe o caminho e, se for chave de API, ELA cola a chave; o
// servidor local guarda em ia.json (só neste PC) e nunca devolve a chave.
// Ao salvar, avisa a tela com o evento "haxys-ia-ligada" (detail = modo).

export interface EstadoIA { codex: boolean; claude: boolean; ligada: string; base: string; modelo: string; temChave: boolean }

export async function estadoIA(): Promise<EstadoIA | null> {
  try {
    const r = await fetch("/api/ia");
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

interface Empresa { id: string; nome: string; base: string; modelo: string; chave?: string; preco?: string; gratis?: string; passos: string[] }
// Nomes de modelo são sugestões: a pessoa pode trocar no campo "Modelo".
const EMPRESAS: Empresa[] = [
  { id: "gemini", nome: "Gemini (Google)", base: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash", chave: "https://aistudio.google.com/apikey", preco: "https://ai.google.dev/gemini-api/docs/pricing",
    gratis: "Cota grátis com a sua conta Google. Perde: limite de pedidos por minuto e por dia; no plano grátis o Google pode usar os pedidos para melhorar os produtos dele.",
    passos: ["Abra o Google AI Studio (link abaixo) e entre com a sua conta Google.", "Clique em \"Create API key\" (Criar chave).", "Copie a chave e cole no campo Chave aqui embaixo."] },
  { id: "openai", nome: "OpenAI (GPT)", base: "https://api.openai.com/v1", modelo: "gpt-5-mini", chave: "https://platform.openai.com/api-keys", preco: "https://openai.com/api/pricing",
    passos: ["Abra a página de chaves da OpenAI (link abaixo) e entre.", "Clique em \"Create new secret key\".", "Copie a chave e cole no campo Chave. A OpenAI cobra por uso (créditos)."] },
  { id: "claude", nome: "Claude (Anthropic)", base: "https://api.anthropic.com/v1", modelo: "claude-sonnet-5-5", chave: "https://console.anthropic.com/settings/keys", preco: "https://www.anthropic.com/pricing",
    passos: ["Abra o Console da Anthropic (link abaixo) e entre.", "Clique em \"Create Key\".", "Copie a chave e cole no campo Chave. A Anthropic cobra por uso (créditos)."] },
  { id: "openrouter", nome: "OpenRouter (várias IAs)", base: "https://openrouter.ai/api/v1", modelo: "openrouter/auto", chave: "https://openrouter.ai/keys", preco: "https://openrouter.ai/models",
    gratis: "Tem modelos grátis (nome termina em \":free\"). Perde: os grátis são mais lentos e têm limite por dia.",
    passos: ["Abra o OpenRouter (link abaixo) e entre.", "Clique em \"Create Key\".", "Copie a chave e cole no campo Chave. Para usar um modelo grátis, escreva o nome dele (termina em :free) no campo Modelo."] },
  { id: "groq", nome: "Groq", base: "https://api.groq.com/openai/v1", modelo: "llama-3.3-70b-versatile", chave: "https://console.groq.com/keys", preco: "https://groq.com/pricing",
    gratis: "Cota grátis com conta Groq. Perde: limite de pedidos por minuto; não aceita fotos.",
    passos: ["Abra o console da Groq (link abaixo) e entre.", "Clique em \"Create API Key\".", "Copie a chave e cole no campo Chave."] },
  { id: "ollama", nome: "Ollama (IA neste PC)", base: "http://localhost:11434/v1", modelo: "qwen3:8b", chave: "https://ollama.com/download",
    gratis: "Sem conta e sem custo. Perde: precisa de PC mais forte (placa de vídeo) e é menos inteligente que as IAs da internet.",
    passos: ["Baixe e instale o Ollama (link abaixo).", "No terminal do Windows, rode: ollama pull qwen3:8b (baixa a IA, uns 5 GB).", "Deixe o Ollama aberto. Não precisa de chave: deixe o campo Chave vazio."] },
  { id: "lmstudio", nome: "LM Studio (IA neste PC)", base: "http://localhost:1234/v1", modelo: "qwen/qwen3-8b", chave: "https://lmstudio.ai",
    gratis: "Sem conta e sem custo. Perde: precisa de PC mais forte e é menos inteligente que as IAs da internet.",
    passos: ["Instale o LM Studio (link abaixo) e baixe um modelo (ex.: qwen/qwen3-8b).", "Na aba Developer, ligue o servidor (Start Server).", "Escreva no campo Modelo o nome que aparece lá. Não precisa de chave."] },
  { id: "outra", nome: "Outra (compatível com OpenAI)", base: "", modelo: "",
    passos: ["Escreva o endereço do serviço (termina em /v1, normalmente).", "Escreva o nome do modelo.", "Cole a chave (se o serviço pedir)."] },
];

const AVISO_CUSTO = `⚠️ A IA usa a <b>sua própria conta</b> (Claude, GPT, Gemini…). O HAXYS CAD não cobra nada por isso.
Dependendo do seu plano, a empresa da IA pode cobrar pelo uso. Confira no site dela antes de continuar.`;

let aberto: HTMLElement | null = null;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// aoFechar: usado na página do primeiro uso (ligar-ia.html), que segue para o programa.
export function abrirAssistenteIA(aoFechar?: () => void) {
  aberto?.remove();
  const el = document.createElement("div");
  el.className = "janela-parametros assistente-ia";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Ligar a IA");
  el.innerHTML = `<div class="jp-titulo"><span>LIGAR A IA</span><button class="jp-fechar" title="Fechar (Esc)">✕</button></div><div class="jp-corpo"></div>`;
  document.body.appendChild(el);
  aberto = el;
  const corpo = el.querySelector<HTMLDivElement>(".jp-corpo")!;
  const fechar = () => (el.remove(), (aberto = null), removeEventListener("keydown", tecla, true), aoFechar?.());
  const tecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") (e.stopPropagation(), fechar());
    else if ((e.target as HTMLElement).closest?.(".assistente-ia")) e.stopPropagation(); // digitar a chave não aciona atalhos
  };
  addEventListener("keydown", tecla, true);
  el.querySelector(".jp-fechar")!.addEventListener("click", fechar);
  const salvo = (modo: string) => {
    try {
      localStorage.setItem("haxys.vozModo", modo); // a caixa da IA abre já nesse modo
    } catch {
      /* sem armazenamento */
    }
    dispatchEvent(new CustomEvent("haxys-ia-ligada", { detail: modo }));
    corpo.innerHTML = `<p class="ai-ok">✔ IA ligada. Abra a caixa da IA (aba SÓLIDO → painel HAXYS → Falar com a IA), toque no 🎤 microfone e diga o que quer construir.</p><div class="ai-botoes"><button class="ai-fim">${aoFechar ? "Abrir o HAXYS CAD" : "Fechar"}</button></div>`;
    corpo.querySelector(".ai-fim")!.addEventListener("click", fechar);
  };
  const salvar = async (dados: Record<string, string>) => {
    const r = await fetch("/api/ia/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  };

  // Tela 1: o que a IA faz + aviso de custo + caminhos.
  const inicio = () => {
    corpo.innerHTML = `
      <p>Com a IA ligada, o HAXYS CAD cria peças do zero <b>pela sua voz</b> (botão de microfone 🎤), usando fotos e medidas de referência que você mandar.</p>
      <p class="ai-aviso">${AVISO_CUSTO}</p>
      <div class="ai-caminhos">
        <button data-c="gratis"><b>Quero começar sem pagar</b><span>Gemini grátis, IA no próprio PC ou uma chave grátis que você já tenha.</span></button>
        <button data-c="chave"><b>Tenho (ou quero) uma chave de API</b><span>Qualquer empresa: Gemini, GPT, Claude, OpenRouter, Groq ou outra.</span></button>
        <button data-c="conta"><b>Usar a conta que já está neste PC</b><span>Codex (login do ChatGPT) ou Claude Code (assinatura do Claude).</span></button>
        <button data-c="fora"><b>Usar o meu Claude / ChatGPT de fora</b><span>A IA do app dela mexe no HAXYS CAD (conector MCP).</span></button>
      </div>
      <p class="ai-precos">Preços: ${EMPRESAS.filter((e) => e.preco).map((e) => `<a href="${e.preco}" target="_blank" rel="noopener">${esc(e.nome)}</a>`).join(" · ")}</p>`;
    corpo.querySelectorAll<HTMLButtonElement>("[data-c]").forEach((b) =>
      b.addEventListener("click", () => ({ gratis: semPagar, chave: () => escolherEmpresa(EMPRESAS), conta, fora })[b.dataset.c!]!()),
    );
  };
  const voltar = (f: () => void) => {
    const b = document.createElement("button");
    b.className = "ai-voltar";
    b.textContent = "← Voltar";
    b.addEventListener("click", f);
    corpo.prepend(b);
  };

  const semPagar = () => {
    const op = ["gemini", "ollama", "openrouter", "groq"].map((id) => EMPRESAS.find((e) => e.id === id)!);
    corpo.innerHTML = `<p><b>Começar sem pagar</b> — escolha um caminho:</p><div class="ai-caminhos">${op
      .map((e) => `<button data-e="${e.id}"><b>${esc(e.nome)}${e.id === "gemini" ? " — mais fácil" : ""}</b><span>${esc(e.gratis ?? "")}</span></button>`)
      .join("")}<button data-e="outra"><b>Colar uma chave grátis que já tenho</b><span>De qualquer serviço compatível com OpenAI.</span></button></div>`;
    corpo.querySelectorAll<HTMLButtonElement>("[data-e]").forEach((b) => b.addEventListener("click", () => formulario(EMPRESAS.find((e) => e.id === b.dataset.e)!, semPagar)));
    voltar(inicio);
  };

  const escolherEmpresa = (lista: Empresa[]) => {
    corpo.innerHTML = `<p><b>Qual empresa?</b></p><div class="ai-caminhos">${lista
      .map((e) => `<button data-e="${e.id}"><b>${esc(e.nome)}</b>${e.gratis ? `<span>${esc(e.gratis)}</span>` : ""}</button>`)
      .join("")}</div>`;
    corpo.querySelectorAll<HTMLButtonElement>("[data-e]").forEach((b) => b.addEventListener("click", () => formulario(EMPRESAS.find((e) => e.id === b.dataset.e)!, () => escolherEmpresa(lista))));
    voltar(inicio);
  };

  const formulario = async (e: Empresa, antes: () => void) => {
    const atual = await estadoIA();
    const mesma = atual?.ligada === "chave" && atual.base === e.base;
    corpo.innerHTML = `
      <p><b>${esc(e.nome)}</b></p>
      <ol class="ai-passos">${e.passos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
      <p>${e.chave ? `<a href="${e.chave}" target="_blank" rel="noopener">${e.id === "ollama" || e.id === "lmstudio" ? "Baixar" : "Criar a chave"} ↗</a>` : ""}${e.preco ? ` · <a href="${e.preco}" target="_blank" rel="noopener">Preços ↗</a>` : ""}</p>
      <p class="ai-aviso">${AVISO_CUSTO}</p>
      <label class="ai-campo">Endereço do serviço <input class="ai-base" value="${esc(e.base)}" placeholder="https://.../v1" spellcheck="false"></label>
      <label class="ai-campo">Modelo <input class="ai-modelo" value="${esc(mesma ? atual!.modelo : e.modelo)}" spellcheck="false"></label>
      <label class="ai-campo">Chave <input class="ai-chave" type="password" autocomplete="off" spellcheck="false" placeholder="${mesma && atual!.temChave ? "(chave já guardada — deixe vazio para manter)" : e.id === "ollama" || e.id === "lmstudio" ? "(não precisa)" : "cole a chave aqui"}"></label>
      <p class="ai-nota">A chave fica guardada só neste computador e não aparece de novo na tela.</p>
      <div class="ai-botoes"><button class="ai-testar">Testar ligação</button><button class="ai-salvar">Salvar e ligar</button></div>
      <p class="ai-resultado" role="status"></p>`;
    voltar(antes);
    const v = (s: string) => corpo.querySelector<HTMLInputElement>(s)!.value.trim();
    const res = corpo.querySelector<HTMLParagraphElement>(".ai-resultado")!;
    const dados = () => ({ modo: "chave", base: v(".ai-base"), modelo: v(".ai-modelo"), chave: v(".ai-chave") });
    corpo.querySelector(".ai-testar")!.addEventListener("click", async () => {
      res.className = "ai-resultado";
      res.textContent = "Testando… (pode levar alguns segundos)";
      try {
        const r = await fetch("/api/ia/teste", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados()) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        res.className = "ai-resultado ai-bom";
        res.textContent = `✔ Funcionou. A IA respondeu: "${String(j.resposta).slice(0, 80)}"`;
      } catch (err) {
        res.className = "ai-resultado ai-ruim";
        res.textContent = `✖ ${err instanceof Error ? err.message : err}`;
      }
    });
    corpo.querySelector(".ai-salvar")!.addEventListener("click", async () => {
      if (!v(".ai-modelo")) return void (res.textContent = "Escreva o nome do modelo.");
      try {
        await salvar(dados());
        salvo("chave");
      } catch (err) {
        res.className = "ai-resultado ai-ruim";
        res.textContent = `✖ ${err instanceof Error ? err.message : err}`;
      }
    });
  };

  const conta = async () => {
    const s = await estadoIA();
    corpo.innerHTML = `
      <p><b>Conta que já está neste PC</b> — usa o seu login, sem chave.</p>
      <div class="ai-caminhos">
        <button data-m="codex" ${s?.codex ? "" : "disabled"}><b>Codex (ChatGPT)</b><span>${s?.codex ? "Encontrado neste PC. Usa o plano da sua conta do ChatGPT." : "Não encontrado: instale o app Codex e entre com a sua conta do ChatGPT."}</span></button>
        <button data-m="claude" ${s?.claude ? "" : "disabled"}><b>Claude Code</b><span>${s?.claude ? "Encontrado neste PC. Usa a sua assinatura do Claude." : "Não encontrado: instale o Claude Code e entre com a sua conta."}</span></button>
      </div><p class="ai-resultado" role="status"></p>`;
    voltar(inicio);
    corpo.querySelectorAll<HTMLButtonElement>("[data-m]").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          await salvar({ modo: b.dataset.m! });
          salvo(b.dataset.m!);
        } catch (err) {
          corpo.querySelector(".ai-resultado")!.textContent = `✖ ${err instanceof Error ? err.message : err}`;
        }
      }),
    );
  };

  const fora = () => {
    corpo.innerHTML = `
      <p><b>Usar o seu Claude / ChatGPT de fora</b></p>
      <p>Assim a IA do <b>app dela</b> (Claude Desktop, Codex, Gemini CLI…) mexe no HAXYS CAD. O HAXYS CAD tem um conector MCP
      (o tipo de ligação que esses apps usam) neste endereço, só deste computador:</p>
      <p><code>http://127.0.0.1:27186/mcp</code></p>
      <ol class="ai-passos">
        <li>No app da IA, abra Configurações → Conectores (ou "MCP servers").</li>
        <li>Adicione um conector com esse endereço.</li>
        <li>Feche e abra o app da IA. Peça: "abra o HAXYS e faça uma caixa de 30 mm".</li>
      </ol>
      <p class="ai-nota">Deixe o HAXYS CAD aberto enquanto usar. Este caminho não precisa de chave aqui.</p>`;
    voltar(inicio);
  };

  inicio();
}
