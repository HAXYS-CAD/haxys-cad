// Navegador (árvore do projeto): origem, esboços e corpos.
// O olho ao lado de cada corpo mostra ou esconde o corpo (a lâmpada do Fusion).
import type { MalhaCorpo } from "../nucleo/tipos";

interface No {
  nome: string;
  filhos?: No[];
  olho?: { visivel: boolean; alternar: () => void };
  selecionado?: boolean;
  aoClicar?: (somar: boolean) => void;
  menu?: [string, () => void][]; // clique direito
}

const ORIGEM: No = {
  nome: "Origem",
  filhos: ["O (ponto de origem)", "X", "Y", "Z", "XY", "XZ", "YZ"].map((nome) => ({ nome })),
};

export interface OpcoesNavegador {
  nomeProjeto: string;
  esbocos: string[]; // nomes, ex.: "Esboço1"
  construcao: string[]; // planos de construção, ex.: "Plano1"
  componentes?: [string, string[]][]; // componente → corpos
  ocultos: Set<string>;
  selecionados: Set<string>; // corpos selecionados inteiros
  alternarVisivel(nome: string): void;
  clicarCorpo(nome: string, somar: boolean): void;
  propriedades(nome: string): void; // clique direito no corpo → Propriedades
}

export interface Navegador {
  atualizar(corpos: MalhaCorpo[], o: OpcoesNavegador): void;
}

export function criarNavegador(raiz: HTMLElement): Navegador {
  raiz.innerHTML = `<div class="titulo-flutuante"><span>NAVEGADOR</span><button class="recolher" title="Recolher / abrir o navegador">▾</button></div>`;
  // Como no Fusion: a seta recolhe a árvore e deixa só o título.
  raiz.querySelector(".recolher")!.addEventListener("click", (e) => {
    const recolhido = raiz.classList.toggle("recolhido");
    (e.currentTarget as HTMLElement).textContent = recolhido ? "▸" : "▾";
  });
  const ul = document.createElement("ul");
  ul.className = "arvore";
  raiz.appendChild(ul);
  const menu = document.createElement("ul");
  menu.className = "menu-contexto";
  menu.hidden = true;
  document.body.appendChild(menu);
  document.addEventListener("pointerdown", (e) => {
    if (!menu.contains(e.target as Node)) menu.hidden = true;
  });
  function abrirMenu(itens: [string, () => void][], x: number, y: number) {
    menu.innerHTML = "";
    for (const [texto, fn] of itens) {
      const li = document.createElement("li");
      li.textContent = texto;
      li.addEventListener("click", () => {
        menu.hidden = true;
        fn();
      });
      menu.appendChild(li);
    }
    menu.hidden = false;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  // Lembra quais ramos estão abertos entre uma atualização e outra.
  const abertos = new Set(["(Sem título) v1", "Corpos", "Esboços"]);

  function desenharNo(no: No, caminho: string): HTMLElement {
    const chave = `${caminho}/${no.nome}`;
    const aberto = caminho === "" || abertos.has(no.nome) || abertos.has(chave);
    const li = document.createElement("li");
    const linha = document.createElement("div");
    linha.className = "no" + (no.selecionado ? " selecionado" : "");
    const seta = document.createElement("span");
    seta.className = "seta";
    seta.textContent = no.filhos?.length ? (aberto ? "▾" : "▸") : "";
    linha.appendChild(seta);
    if (no.olho) {
      const olho = document.createElement("button");
      olho.className = "olho" + (no.olho.visivel ? "" : " apagado");
      olho.title = no.olho.visivel ? "Esconder" : "Mostrar";
      olho.textContent = "◉";
      olho.addEventListener("click", (e) => {
        e.stopPropagation();
        no.olho!.alternar();
      });
      linha.appendChild(olho);
    }
    linha.appendChild(document.createTextNode(no.nome));
    li.appendChild(linha);
    if (no.aoClicar) linha.addEventListener("click", (e) => no.aoClicar!(e.ctrlKey || e.shiftKey));
    if (no.menu)
      linha.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        abrirMenu(no.menu!, e.clientX, e.clientY);
      });
    if (no.filhos?.length) {
      const sub = document.createElement("ul");
      sub.hidden = !aberto;
      no.filhos.forEach((f) => sub.appendChild(desenharNo(f, chave)));
      li.appendChild(sub);
      linha.addEventListener("click", () => {
        sub.hidden = !sub.hidden;
        seta.textContent = sub.hidden ? "▸" : "▾";
        if (sub.hidden) {
          abertos.delete(no.nome);
          abertos.delete(chave);
        } else abertos.add(chave);
      });
    }
    return li;
  }

  function atualizar(corpos: MalhaCorpo[], o: OpcoesNavegador) {
    const itemCorpo = (c: (typeof corpos)[number]) => ({
      nome: c.nome,
      olho: { visivel: !o.ocultos.has(c.nome), alternar: () => o.alternarVisivel(c.nome) },
      selecionado: o.selecionados.has(c.nome),
      aoClicar: (somar: boolean) => o.clicarCorpo(c.nome, somar),
      menu: [
        ["Propriedades", () => o.propriedades(c.nome)],
        [o.ocultos.has(c.nome) ? "Mostrar" : "Esconder", () => o.alternarVisivel(c.nome)],
      ] as [string, () => void][],
    });
    const arvore: No = {
      nome: o.nomeProjeto,
      filhos: [
        { nome: "Configurações do documento", filhos: [{ nome: "Unidades: mm" }] },
        { nome: "Vistas nomeadas" },
        ORIGEM,
        {
          nome: "Construção",
          filhos: o.construcao.map((nome) => ({
            nome,
            olho: { visivel: !o.ocultos.has(nome), alternar: () => o.alternarVisivel(nome) },
          })),
        },
        {
          nome: "Esboços",
          filhos: o.esbocos.map((nome) => ({
            nome,
            olho: { visivel: !o.ocultos.has(nome), alternar: () => o.alternarVisivel(nome) },
          })),
        },
        ...((o.componentes ?? []).length
          ? [{ nome: "Componentes", filhos: (o.componentes ?? []).map(([n, cs]) => ({ nome: n, filhos: cs.map((c) => ({ nome: c })) })) }]
          : []),
        {
          nome: "Corpos",
          filhos: corpos.filter((c) => !c.ehMalha).map(itemCorpo),
        },
        // Corpos de malha (só triângulos) ficam numa pasta própria, como no Fusion.
        ...(corpos.some((c) => c.ehMalha) ? [{ nome: "Corpos de malha", filhos: corpos.filter((c) => c.ehMalha).map(itemCorpo) }] : []),
      ],
    };
    ul.innerHTML = "";
    ul.appendChild(desenharNo(arvore, ""));
  }

  atualizar([], {
    nomeProjeto: "Sem título",
    esbocos: [],
    construcao: [],
    ocultos: new Set(),
    selecionados: new Set(),
    alternarVisivel: () => {},
    clicarCorpo: () => {},
    propriedades: () => {},
  });
  return { atualizar };
}
