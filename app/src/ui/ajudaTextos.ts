// Textos de ajuda do modo "O que é isto?" — todos num lugar só (fácil revisar
// e traduzir). Cada linha: seletor CSS do recurso, 2–3 linhas de explicação e,
// se houver, o cartão do tutorial (número, começando em 1).
// Recurso sem linha aqui: a ajuda usa a dica (title) que o botão já tem.

export interface TextoAjuda { seletor: string; titulo: string; texto: string; tutorial?: number }

export const TEXTOS_AJUDA: TextoAjuda[] = [
  { seletor: ".botao-ajuda", titulo: "O que é isto?", texto: "Liga a ajuda: pare o mouse em cima de qualquer coisa para ver o que ela faz. Nada é executado. Esc para sair.", tutorial: 5 },
  { seletor: ".botao-ligar-ia", titulo: "Ligar IA", texto: "Escolhe qual IA vai criar peças pela sua voz: grátis, com a sua chave ou com a conta que já está neste PC.", tutorial: 4 },
  { seletor: ".botao-arquivo", titulo: "Arquivo", texto: "Novo, abrir, salvar, exportar (STL, STEP, 3MF) e trazer do Fusion.", tutorial: 3 },
  { seletor: ".botao-salvar", titulo: "Salvar", texto: "Grava o projeto na pasta de projetos do HAXYS CAD (atalho Ctrl+S).", tutorial: 3 },
  { seletor: ".desfazer", titulo: "Desfazer", texto: "Volta a última mudança (Ctrl+Z)." },
  { seletor: ".refazer", titulo: "Refazer", texto: "Refaz o que foi desfeito (Ctrl+Y)." },
  { seletor: ".escolha-tema", titulo: "Tema de cores", texto: "Troca as cores da tela. A escolha fica guardada." },
  { seletor: ".aba-documento", titulo: "Nome do projeto", texto: "O projeto aberto agora. \"Sem título\" até você salvar." },
  { seletor: ".status-nucleo", titulo: "Núcleo geométrico", texto: "Mostra se o motor que calcula as peças já está pronto." },
  { seletor: ".ponte-ia", titulo: "Ponte com as IAs", texto: "Verde: uma IA de fora (Claude, ChatGPT…) consegue mexer neste HAXYS CAD." },
  { seletor: ".faixa", titulo: "Faixa de ferramentas", texto: "As ferramentas, em abas como no Fusion: SÓLIDO, SUPERFÍCIE, MALHA… Pare o mouse num botão para ver o nome.", tutorial: 2 },
  { seletor: ".viewport", titulo: "Janela 3D", texto: "Onde a peça aparece. Arraste com o botão esquerdo para girar, com o direito para mover, e use a roda para zoom.", tutorial: 1 },
  { seletor: ".navegador", titulo: "Navegador", texto: "A lista do que existe no projeto: corpos, esboços, planos. O olho mostra/esconde." },
  { seletor: ".viewcube", titulo: "Cubo de vistas", texto: "Clique numa face para ver de frente, de cima, de lado… Arraste para girar.", tutorial: 1 },
  { seletor: ".barra-navegacao", titulo: "Barra de navegação", texto: "Girar, mover, zoom, ajustar a peça à janela e tela limpa.", tutorial: 1 },
  { seletor: ".linha-do-tempo", titulo: "Linha do tempo", texto: "Cada passo que fez a peça, em ordem. Dois cliques num passo para mudar as medidas dele." },
  { seletor: ".janela-voz", titulo: "Caixa da IA", texto: "Toque no 🎤 microfone e diga o que quer construir. Também dá para digitar e anexar fotos.", tutorial: 4 },
];
