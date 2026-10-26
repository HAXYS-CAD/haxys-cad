// Linha do tempo: um ícone por operação, na ordem do histórico.
// Clique duplo edita. Botão direito abre: Editar, Suprimir, Excluir.
// Operação com erro fica vermelha; suprimida fica apagada e riscada.
import type { Operacao } from "../nucleo/tipos";
import { icone } from "./icones";

export interface AcoesLinhaDoTempo {
  editar(op: Operacao): void;
  suprimir(op: Operacao): void;
  excluir(op: Operacao): void;
}

export interface LinhaDoTempo {
  atualizar(historico: Operacao[], erros: Record<string, string>): void;
}

export function criarLinhaDoTempo(raiz: HTMLElement, acoes: AcoesLinhaDoTempo): LinhaDoTempo {
  raiz.innerHTML = `
    <div class="controles-tempo">
      <button title="Ir para o início">⏮</button>
      <button title="Voltar uma etapa">◀</button>
      <button title="Reproduzir">▶</button>
      <button title="Avançar uma etapa">▶|</button>
      <button title="Ir para o fim">⏭</button>
    </div>
    <div class="trilha" title="As operações do projeto aparecem aqui"></div>
    <button class="config-tempo" title="Configurações da linha do tempo">⚙</button>`;
  const trilha = raiz.querySelector<HTMLElement>(".trilha")!;

  const menu = document.createElement("ul");
  menu.className = "menu-contexto";
  menu.hidden = true;
  document.body.appendChild(menu);
  document.addEventListener("pointerdown", (e) => {
    if (!menu.contains(e.target as Node)) menu.hidden = true;
  });

  function abrirMenu(op: Operacao, x: number, y: number) {
    menu.innerHTML = "";
    const itens: [string, () => void][] = [
      ["Editar operação", () => acoes.editar(op)],
      [op.suprimida ? "Desfazer supressão" : "Suprimir operação", () => acoes.suprimir(op)],
      ["Excluir", () => acoes.excluir(op)],
    ];
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
    menu.style.top = `${y - menu.offsetHeight}px`;
  }

  return {
    atualizar(historico, erros) {
      trilha.innerHTML = "";
      for (const op of historico) {
        // Aparência e Material ficam fora da linha do tempo, como no Fusion.
        if (op.tipo === "aparencia" || op.tipo === "material" || op.tipo === "parametros" || op.tipo === "contatos" || op.tipo === "posicao") continue;
        const b = document.createElement("button");
        b.className = "item-tempo";
        if (erros[op.id]) b.classList.add("com-erro");
        if (op.suprimida) b.classList.add("suprimida");
        b.title = erros[op.id] ? `${op.nome}\nErro: ${erros[op.id]}` : op.nome;
        b.innerHTML = icone(op.nome, "Criar", 22, op.opcoes?.icone ?? op.tipo); // passo do Fusion: ícone da operação dele
        b.addEventListener("dblclick", () => acoes.editar(op));
        b.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          abrirMenu(op, e.clientX, e.clientY);
        });
        trilha.appendChild(b);
      }
      const marcador = document.createElement("span");
      marcador.className = "marcador-fim";
      marcador.title = "Marcador do histórico";
      trilha.appendChild(marcador);
    },
  };
}
