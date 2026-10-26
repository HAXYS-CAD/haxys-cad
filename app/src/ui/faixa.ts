// Faixa de ferramentas: seletor de área de trabalho, abas e painéis.
// Cada painel mostra as ferramentas em destaque; o nome do painel abre o menu completo.
import type { Aba, Ferramenta, Painel } from "./tipos";
import { icone } from "./icones";
import { noCelular } from "./celular";

// Abas fixas da área de trabalho Projeto, na ordem do inventário do Fusion.
// As outras (ESBOÇO, FORMA, POSIÇÃO...) só aparecem durante um comando.
const ABAS_FIXAS = [
  "SolidTab",
  "SurfaceTab",
  "ParaMeshOuterTab",
  "SheetMetalTab",
  "PlasticTab",
  "AssemblyTab",
  "ManageTab",
  "ToolsTab",
];

export interface Faixa {
  abrirAbaDeContexto(id: string): void;
  fecharAbaDeContexto(): void;
}

// Nome mostrado para um submenu: o item em destaque dele, ou o primeiro.
function nomeDoSubmenu(f: Ferramenta): Ferramenta {
  return f.itens?.find((i) => i.destaque) ?? f.itens?.[0] ?? f;
}

export function criarFaixa(
  raiz: HTMLElement,
  abas: Aba[],
  aoUsar: (f: Ferramenta) => void,
): Faixa {
  const porId = new Map(abas.map((a) => [a.id, a]));
  let abaAtiva = "SolidTab";
  let abaContexto: string | null = null;

  raiz.innerHTML = `
    <div class="faixa-topo">
      <button class="area-trabalho" title="Área de trabalho">PROJETO <span>▾</span></button>
      <nav class="abas"></nav>
    </div>
    <div class="paineis"></div>`;
  const elAbas = raiz.querySelector<HTMLElement>(".abas")!;
  const elPaineis = raiz.querySelector<HTMLElement>(".paineis")!;

  function fecharMenus() {
    raiz.querySelectorAll(".menu-painel.aberto").forEach((m) => m.classList.remove("aberto"));
  }
  document.addEventListener("pointerdown", (e) => {
    if (!(e.target as HTMLElement).closest(".painel")) fecharMenus();
  });

  function botaoFerramenta(f: Ferramenta, painel: Painel): HTMLButtonElement {
    const alvo = f.itens ? nomeDoSubmenu(f) : f;
    const b = document.createElement("button");
    b.className = "ferramenta";
    b.title = `${alvo.nome}\n(${alvo.id})`;
    b.innerHTML = icone(alvo.nome, painel.nome, 32, alvo.id);
    b.addEventListener("click", () => aoUsar(alvo));
    return b;
  }

  function itemDeMenu(f: Ferramenta, painel: Painel): HTMLElement {
    const li = document.createElement("li");
    if (f.itens) {
      const titulo = nomeDoSubmenu(f);
      li.className = "tem-submenu";
      li.innerHTML = `${icone(titulo.nome, painel.nome, 18, titulo.id)}<span>${titulo.nome}</span><b>▸</b>`;
      const sub = document.createElement("ul");
      sub.className = "submenu";
      f.itens.forEach((i) => sub.appendChild(itemDeMenu(i, painel)));
      li.appendChild(sub);
    } else {
      li.innerHTML = `${icone(f.nome, painel.nome, 18, f.id)}<span>${f.nome}</span>`;
      li.title = f.id;
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        fecharMenus();
        aoUsar(f);
      });
    }
    return li;
  }

  function desenharPaineis(aba: Aba) {
    elPaineis.innerHTML = "";
    for (const painel of aba.paineis) {
      const el = document.createElement("div");
      el.className = "painel";
      const icones = document.createElement("div");
      icones.className = "icones";
      const emDestaque = painel.ferramentas.filter(
        (f) => f.destaque || f.itens?.some((i) => i.destaque),
      );
      (emDestaque.length ? emDestaque : painel.ferramentas.slice(0, 1)).forEach((f) =>
        icones.appendChild(botaoFerramenta(f, painel)),
      );
      const nome = document.createElement("button");
      nome.className = "nome-painel";
      nome.textContent = `${painel.nome.toUpperCase()} ▾`;
      const menu = document.createElement("ul");
      menu.className = "menu-painel";
      painel.ferramentas.forEach((f) => menu.appendChild(itemDeMenu(f, painel)));
      nome.addEventListener("click", () => {
        const estava = menu.classList.contains("aberto");
        fecharMenus();
        if (estava) return;
        menu.classList.remove("a-direita");
        menu.classList.add("aberto");
        // Perto da borda direita: o menu (e os submenus) abrem para a esquerda.
        if (menu.getBoundingClientRect().right + 240 > window.innerWidth) menu.classList.add("a-direita");
      });
      el.append(icones, nome, menu);
      elPaineis.appendChild(el);
    }
    encolher();
  }

  // Como no Fusion: sem espaço, os painéis da direita escondem primeiro os ícones
  // extras (fica ao menos um; os outros continuam no menu do nome) e, se ainda
  // faltar, ficam só com o nome, até tudo caber.
  function encolher() {
    if (noCelular) return; // no celular a linha rola para o lado (estilo.css): nada se esconde
    const paineis = [...elPaineis.querySelectorAll<HTMLElement>(".painel")];
    elPaineis.classList.remove("quebra");
    paineis.forEach((p) => p.classList.remove("compacto"));
    elPaineis.querySelectorAll(".ferramenta.oculta").forEach((b) => b.classList.remove("oculta"));
    const sobra = () => elPaineis.scrollWidth > elPaineis.clientWidth;
    for (let i = paineis.length - 1; i >= 0 && sobra(); i--) {
      const icones = [...paineis[i].querySelectorAll(".ferramenta")];
      for (let j = icones.length - 1; j > 0 && sobra(); j--) icones[j].classList.add("oculta");
    }
    for (let i = paineis.length - 1; i >= 0 && sobra(); i--) paineis[i].classList.add("compacto");
    if (sobra()) elPaineis.classList.add("quebra"); // janela muito estreita: os nomes descem de linha
  }
  new ResizeObserver(encolher).observe(elPaineis);

  function desenharAbas() {
    elAbas.innerHTML = "";
    const lista = abaContexto ? [abaContexto, ...ABAS_FIXAS] : ABAS_FIXAS;
    for (const id of lista) {
      const aba = porId.get(id);
      if (!aba) continue;
      const b = document.createElement("button");
      b.className = "aba";
      if (id === abaContexto) b.classList.add("contexto");
      if (id === abaAtiva) b.classList.add("ativa");
      b.textContent = aba.nome.toUpperCase();
      b.addEventListener("click", () => {
        abaAtiva = id;
        desenharAbas();
      });
      elAbas.appendChild(b);
    }
    const ativa = porId.get(abaAtiva);
    if (ativa) desenharPaineis(ativa);
  }

  desenharAbas();

  return {
    abrirAbaDeContexto(id) {
      if (!porId.has(id)) return;
      abaContexto = id;
      abaAtiva = id;
      desenharAbas();
    },
    fecharAbaDeContexto() {
      abaContexto = null;
      abaAtiva = "SolidTab";
      desenharAbas();
    },
  };
}
