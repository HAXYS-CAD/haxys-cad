// Menu Arquivo: Novo, Abrir (Ctrl+O), Salvar (Ctrl+S), Salvar como (Ctrl+Shift+S).
// Projetos ficam na pasta HAXYS_CAD/projetos (janela própria, ver janelaProjetos.ts).
// Também: aviso ao fechar a página com mudança não salva, e cópia automática
// no navegador para recuperar o trabalho se a página fechar sem salvar.
import type { Projeto } from "../nucleo/projeto";
import { desserializar, serializar } from "./formato";
import { gravarExportacao, gravarImagemProjeto, gravarNaPasta, lerDaPasta, lerDoComputador, urlImagemProjeto } from "./disco";
import { inserirArquivo } from "../comandos/montagem";
import { inserirMalha } from "../comandos/malha";
import { importarTexto } from "../comandos/importar";
import { FORMATOS_MALHA_CONVERTIDOS, malhaParaStl } from "./converterMalha";
import { escolherProjeto, OUTRO_ARQUIVO } from "./janelaProjetos";
import { lerDoFusion, paraOperacoes } from "./trazerFusion";
import { abrirDialogo } from "../ui/dialogo";
import type { OpcoesExportar } from "../nucleo/tipos";
import { baixarNoCelular, noCelular } from "../ui/celular";

const CHAVE_RECUPERACAO = "haxys-cad:recuperacao";
const SEM_TITULO = "Sem título";

export interface OpcoesMenuArquivo {
  botaoMenu: HTMLElement;
  botaoSalvar: HTMLElement;
  projeto: Projeto;
  ocultos: Set<string>;
  avisar(texto: string): void;
  aoMudarNome(nome: string, modificado: boolean): void;
  redesenhar(): void;
  antesDeTrocar(): void; // fecha esboço/comando aberto
  areaComando: HTMLElement; // onde abre a janela Exportar
  foto?(): string; // PNG da peça (data URL) para a imagem do projeto
}

export interface MenuArquivo {
  nome(): string;
  tecla(e: KeyboardEvent): boolean;
  // Para a ponte das IAs (sem janelas do Windows):
  textoDoProjeto(nome?: string): string; // o projeto como arquivo .haxys
  marcarSalvoComo(nome: string): void; // depois de gravar na pasta de projetos
  carregarDeTexto(texto: string, nome: string): number; // abre; devolve quantas operações
  novoSemPerguntar(): void; // Novo projeto (quem chama cuida de guardar antes)
}

// localStorage pode falhar (modo privado, bloqueado); nesse caso só não há recuperação.
function guardarCopia(texto: string | null) {
  try {
    if (texto === null) localStorage.removeItem(CHAVE_RECUPERACAO);
    else localStorage.setItem(CHAVE_RECUPERACAO, texto);
  } catch {
    /* sem recuperação automática neste navegador */
  }
}
function lerCopia(): string | null {
  try {
    return localStorage.getItem(CHAVE_RECUPERACAO);
  } catch {
    return null;
  }
}

export function criarMenuArquivo(o: OpcoesMenuArquivo): MenuArquivo {
  let nome = SEM_TITULO;
  const { projeto } = o;

  const atualizarNome = () => o.aoMudarNome(nome, projeto.modificado());

  // ---- Ações ----

  function podeDescartar(): boolean {
    return !projeto.modificado() || confirm("O projeto tem mudanças não salvas. Descartar as mudanças?");
  }

  function novo() {
    if (!podeDescartar()) return;
    o.antesDeTrocar();
    nome = SEM_TITULO;
    o.ocultos.clear();
    projeto.carregar([]);
    guardarCopia(null);
    o.redesenhar();
    atualizarNome();
  }

  function carregar(texto: string, novo: string): number {
    const arquivo = desserializar(texto);
    o.antesDeTrocar();
    nome = novo || arquivo.nome;
    o.ocultos.clear();
    arquivo.ocultos.forEach((n) => o.ocultos.add(n));
    projeto.carregar(arquivo.historico);
    guardarCopia(null);
    o.redesenhar();
    atualizarNome();
    return arquivo.historico.length;
  }

  // Projeto novo com o desenho aberto no Fusion. "esperado" = nome do .f3d escolhido.
  async function trazerDoFusion(esperado?: string) {
    o.avisar("Lendo o desenho aberto no Fusion… (pode levar 1 a 2 minutos)");
    try {
      const d = await lerDoFusion();
      if (esperado && d.documento.toLowerCase() !== esperado.toLowerCase())
        return o.avisar(`No Fusion está aberto "${d.documento}", não "${esperado}". Abra "${esperado}" no Fusion e tente de novo.`);
      o.antesDeTrocar();
      nome = d.documento;
      o.ocultos.clear();
      projeto.carregar(paraOperacoes(d));
      guardarCopia(null);
      o.redesenhar();
      atualizarNome();
      o.avisar(`Trazido do Fusion: ${nome} (${d.passos.length} passos). Passe o mouse na peça: cada pedaço mostra a operação que o fez.`);
    } catch (e) {
      o.avisar(`Não foi possível trazer do Fusion: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function abrir() {
    if (!podeDescartar()) return;
    try {
      const escolha = await escolherProjeto("abrir", nome);
      if (!escolha) return;
      if (escolha === OUTRO_ARQUIVO) {
        const f = await lerDoComputador();
        if (!f) return;
        const ext = (/\.([^.]+)$/.exec(f.name)?.[1] ?? "").toLowerCase();
        // Formatos fechados (do Fusion, Inventor, SketchUp, AutoCAD, ACIS): só o programa dono abre.
        // .f3d/.f3z: o Fusion entrega pela porta 27185 o desenho aberto nele.
        if (ext === "f3d" || ext === "f3z") return trazerDoFusion(f.name.replace(/\.[^.]+$/, ""));
        const FECHADOS: Record<string, string> = { ipt: "Autodesk Inventor", skp: "SketchUp", dwg: "AutoCAD (DWG)", sat: "ACIS (SAT)", smt: "Autodesk ShapeManager (SMT)" };
        if (FECHADOS[ext])
          return o.avisar(`Arquivo do ${FECHADOS[ext]} (.${ext}): formato fechado, só o programa dono abre. No Fusion use Arquivo > Exportar > STEP (peça sólida) ou 3MF/STL (malha) e abra aqui esse arquivo.`);
        if (ext === "igs" || ext === "iges") return o.avisar("IGES ainda não abre no HAXYS CAD. No Fusion exporte em STEP (*.stp *.step): é o mesmo tipo de peça sólida.");
        const malha = ["stl", "obj", ...FORMATOS_MALHA_CONVERTIDOS].includes(ext);
        if (ext === "step" || ext === "stp" || ext === "dxf" || malha) {
          // Peça de outro programa: projeto novo com ela (janela Inserir).
          o.antesDeTrocar();
          nome = f.name.replace(/\.[^.]+$/, "");
          o.ocultos.clear();
          projeto.carregar([]);
          guardarCopia(null);
          o.redesenhar();
          atualizarNome();
          if (ext === "dxf") return importarTexto("dxf", f.name, await f.text(), o.areaComando, projeto, () => [], o.avisar);
          // STEP vira corpo sólido; STL/OBJ/3MF/FBX/USDZ viram corpo de malha (rápido, como no Fusion).
          if (!malha) return inserirArquivo(f.name, new Uint8Array(await f.arrayBuffer()), o.areaComando, projeto, o.avisar);
          if (ext === "stl" || ext === "obj") return inserirMalha(f.name, new Uint8Array(await f.arrayBuffer()), o.areaComando, projeto, o.avisar);
          o.avisar(`Lendo ${f.name}…`);
          return inserirMalha(`${nome}.stl`, await malhaParaStl(f, ext), o.areaComando, projeto, o.avisar);
        }
        const n = carregar(await f.text(), f.name.replace(/\.(haxys|json)$/i, ""));
        return o.avisar(`Aberto: ${nome} (${n} operações)`);
      }
      const n = carregar(await lerDaPasta(escolha.nome), escolha.nome);
      o.avisar(`Aberto: ${nome} (${n} operações)`);
      // Projeto antigo sem imagem: faz a imagem agora, para a janela Abrir.
      if (!(await fetch(urlImagemProjeto(nome)).then((r) => r.ok, () => true))) void gravarMiniatura(nome);
    } catch (e) {
      o.avisar(`Não foi possível abrir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Imagem pequena da peça (360 px) para os cartões da janela Abrir; falhar não atrapalha o salvar.
  async function gravarMiniatura(alvo: string) {
    if (!o.foto) return;
    try {
      await projeto.quandoCalculado();
      await new Promise((r) => setTimeout(r, 300)); // a tela redesenha os corpos depois do cálculo
      const img = new Image();
      img.src = o.foto();
      await img.decode();
      const k = Math.min(1, 360 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const png = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
      if (png) await gravarImagemProjeto(alvo, png);
    } catch {
      /* sem imagem: o cartão mostra um ícone */
    }
  }

  // Salva na pasta HAXYS_CAD/projetos. Pergunta o nome na primeira vez e no "Salvar como".
  async function salvar(perguntarNome: boolean) {
    try {
      let alvo = nome;
      if (perguntarNome || nome === SEM_TITULO) {
        const escolha = await escolherProjeto("salvar", nome);
        if (!escolha || escolha === OUTRO_ARQUIVO) return;
        if (escolha.existe && escolha.nome !== nome && !confirm(`Já existe um projeto "${escolha.nome}". Substituir?`)) return;
        alvo = escolha.nome;
      }
      const r = await gravarNaPasta(alvo, serializar(alvo, projeto.estado.historico, o.ocultos));
      nome = r.nome;
      projeto.marcarSalvo();
      guardarCopia(null);
      atualizarNome();
      o.avisar(`Salvo em ${r.arquivo}`);
      void gravarMiniatura(nome);
    } catch (e) {
      o.avisar(`Não foi possível salvar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---- Exportar (STEP para outros programas de CAD, STL para impressão 3D) ----
  // No Fusion: Arquivo > Exportar e "Salvar como malha". Aqui uma janela só.

  function exportar() {
    o.antesDeTrocar();
    const visiveis = projeto.estado.corpos.filter((c) => !o.ocultos.has(c.nome)).map((c) => c.nome);
    if (!visiveis.length) return o.avisar("Não há corpo visível para exportar.");
    abrirDialogo(o.areaComando, {
      titulo: "Exportar",
      campos: [],
      modo: "novo",
      semModo: true,
      escolhas: [
        { chave: "formato", rotulo: "Formato", opcoes: [["3mf", "3MF (Bambu Studio, um objeto por corpo)"], ["stl", "STL (impressão 3D)"], ["step", "STEP (outros CAD)"]], valor: "3mf" },
        { chave: "corpos", rotulo: "Corpos", opcoes: [["*", `Todos visíveis (${visiveis.length})`], ...visiveis.map((n) => [n, n] as [string, string])], valor: "*" },
        { chave: "qualidade", rotulo: "Qualidade (STL/3MF)", opcoes: [["media", "Média"], ["alta", "Alta"], ["baixa", "Baixa"]], valor: "media" },
        { chave: "orientacao", rotulo: "Orientação", opcoes: [["z", "Z para cima (impressoras)"], ["y", "Como na tela (Y para cima)"]], valor: "z" },
      ],
      aoMudar: () => {},
      aoCancelar: () => {},
      aoOK: async (_v, _m, esc) => {
        const opcoes: OpcoesExportar = {
          formato: esc.formato as OpcoesExportar["formato"],
          corpos: esc.corpos === "*" ? visiveis : [esc.corpos],
          qualidade: esc.qualidade as OpcoesExportar["qualidade"],
          zParaCima: esc.orientacao === "z",
        };
        const ext = `.${opcoes.formato}`;
        o.avisar("Gerando o arquivo…");
        try {
          const dados = await projeto.exportar(opcoes);
          const sugestao = opcoes.corpos.length === 1 ? `${nome} - ${opcoes.corpos[0]}` : nome;
          const gravado = await gravarExportacao(dados, sugestao, ext);
          baixarNoCelular(dados, sugestao + ext);
          o.avisar(noCelular ? `Baixado no celular: ${sugestao}${ext} (${(dados.byteLength / 1024).toFixed(0)} KB). Também ficou na pasta saida do PC.` : `Exportado em ${gravado} (${(dados.byteLength / 1024).toFixed(0)} KB)`);
        } catch (e) {
          o.avisar(`Não foi possível exportar: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
    });
  }

  // ---- Menu ----

  const menu = document.createElement("ul");
  menu.className = "menu-arquivo";
  menu.hidden = true;
  const itens: [string, string, () => void][] = [
    ["Novo projeto", "", novo],
    ["Abrir…", "Ctrl+O", abrir],
    ["Salvar", "Ctrl+S", () => salvar(false)],
    ["Salvar como…", "Ctrl+Shift+S", () => salvar(true)],
    ["Exportar…", "", exportar],
    ["Trazer do Fusion", "", () => podeDescartar() && void trazerDoFusion()],
  ];
  for (const [texto, atalho, fn] of itens) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${texto}</span><em>${atalho}</em>`;
    li.addEventListener("click", () => {
      menu.hidden = true;
      fn();
    });
    menu.appendChild(li);
  }
  document.body.appendChild(menu);
  o.botaoMenu.addEventListener("click", () => {
    const r = o.botaoMenu.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 2}px`;
    menu.hidden = !menu.hidden;
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.contains(e.target as Node) && e.target !== o.botaoMenu) menu.hidden = true;
  });
  o.botaoSalvar.addEventListener("click", () => salvar(false));

  // ---- Proteção contra perder trabalho ----

  window.addEventListener("beforeunload", (e) => {
    if (projeto.modificado()) e.preventDefault();
  });

  let ultimoHistorico = projeto.estado.historico;
  let temporizador = 0;
  projeto.aoMudar((estado) => {
    atualizarNome();
    if (estado.historico === ultimoHistorico) return;
    ultimoHistorico = estado.historico;
    clearTimeout(temporizador);
    temporizador = window.setTimeout(() => {
      guardarCopia(projeto.modificado() ? serializar(nome, estado.historico, o.ocultos) : null);
    }, 800);
  });

  // Ao abrir a página: oferece recuperar a cópia automática.
  const copia = lerCopia();
  if (copia) {
    try {
      const arquivo = desserializar(copia);
      if (arquivo.historico.length) {
        const faixa = document.createElement("div");
        faixa.className = "faixa-recuperacao";
        const quando = arquivo.salvoEm ? new Date(arquivo.salvoEm).toLocaleString("pt-BR") : "";
        faixa.innerHTML = `<span>Há trabalho não salvo de "${arquivo.nome}" (${quando}, ${arquivo.historico.length} operações).</span>
          <button class="recuperar">Recuperar</button><button class="descartar">Descartar</button>`;
        document.body.appendChild(faixa);
        faixa.querySelector(".recuperar")!.addEventListener("click", () => {
          nome = arquivo.nome;
          o.ocultos.clear();
          arquivo.ocultos.forEach((n) => o.ocultos.add(n));
          projeto.carregar(arquivo.historico, false); // continua "não salvo"
          o.redesenhar();
          atualizarNome();
          faixa.remove();
        });
        faixa.querySelector(".descartar")!.addEventListener("click", () => {
          guardarCopia(null);
          faixa.remove();
        });
      }
    } catch {
      guardarCopia(null); // cópia estragada
    }
  }

  return {
    nome: () => nome,
    textoDoProjeto: (outro) => serializar(outro ?? nome, projeto.estado.historico, o.ocultos),
    marcarSalvoComo(novo) {
      nome = novo;
      projeto.marcarSalvo();
      guardarCopia(null);
      atualizarNome();
    },
    carregarDeTexto: carregar,
    novoSemPerguntar() {
      o.antesDeTrocar();
      nome = SEM_TITULO;
      o.ocultos.clear();
      projeto.carregar([]);
      guardarCopia(null);
      o.redesenhar();
      atualizarNome();
    },
    tecla(e) {
      if (!e.ctrlKey) return false;
      const k = e.key.toLowerCase();
      if (k === "s") return salvar(e.shiftKey), true;
      if (k === "o") return abrir(), true;
      return false;
    },
  };
}
