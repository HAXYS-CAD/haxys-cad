// Monta a tela do HAXYS CAD: barra do aplicativo, faixa, janela 3D,
// navegador, ViewCube, barra de navegação e linha do tempo.
import "./estilo.css";
import abas from "./dados/faixa.json";
import type { Aba, Ferramenta } from "./ui/tipos";
import { criarFaixa } from "./ui/faixa";
import { criarNavegador } from "./ui/navegador";
import { criarLinhaDoTempo } from "./ui/linhaDoTempo";
import { definirAvaliador, dialogoAberto, expressoesDaJanela, fecharDialogo, usarExpressoes } from "./ui/dialogo";
import { abrirJanelaParametros } from "./ui/janelaParametros";
import { avaliar } from "./nucleo/parametros";
import { criarMenuArquivo } from "./arquivo/menuArquivo";
import { criarVista, type ModoNavegacao } from "./vista/cena";
import { criarViewCube } from "./vista/viewcube";
import { criarSelecao, descrever, type ItemSelecionado, type Prioridade } from "./vista/selecao";
import { Projeto } from "./nucleo/projeto";
import { PRIMITIVAS, comandoPrimitiva } from "./comandos/primitivas";
import { COMANDOS_ARESTAS, comandoArestas, selecaoMudou } from "./comandos/arestas";
import type { Operacao } from "./nucleo/tipos";
import * as THREE from "three";
import { criarModoEsboco, FERRAMENTAS_ESBOCO } from "./esboco/modoEsboco";
import { FERRAMENTAS_RESTRICAO } from "./esboco/ferramentasRestricao";
import { comandoExtrusao } from "./comandos/extrusao";
import { comandoRevolucao } from "./comandos/revolucao";
import { COMANDOS_FACES, comandoFaces, selecaoMudouFaces } from "./comandos/faces";
import { COMANDOS_CORPOS, comandoCorpos, selecaoMudouCorpos } from "./comandos/corpos";
import { COMANDO_PLANO, comandoPlano, selecaoMudouPlano } from "./comandos/plano";
import { COMANDO_MEDIR, comandoMedir, selecaoMudouMedir } from "./comandos/medir";
import { COMANDOS_ANALISE, COMANDOS_INSPECAO, comandoAnalise, comandoCorte, comandoInspecaoCorpos, selecaoMudouInspecao } from "./comandos/inspecao";
import { COMANDOS_CONSTRUIR, comandoConstruir, selecaoMudouConstruir } from "./comandos/construir";
import { COMANDOS_SELECIONAR, comandoSelecionar } from "./comandos/selecionar";
import { COMANDOS_IMPORTAR, comandoImportar } from "./comandos/importar";
import { abrirListaMateriais } from "./comandos/listaMateriais";
import { COMANDOS_TELA, comandoTela } from "./comandos/tela";
import { COMANDO_INSERIR_MALHA, abrirPaletaMalhas, comandoInserirMalha } from "./comandos/malha";
import { COMANDOS_ANOTACAO, comandoAnotacao, type TipoAnotacao } from "./comandos/anotacao";
import { objetosDaAnotacao } from "./vista/anotacoes";
import { abrirConsoleScript } from "./ui/consoleScript";
import { COMANDO_IMPRIMIR, comandoImprimir } from "./comandos/bambu";
import { COMANDO_LASER, comandoLaser } from "./comandos/laser";
import { COMANDO_REFERENCIA, comandoReferencia } from "./comandos/referencia";
import { abrirVoz } from "./ui/voz";
import { ligarAjuda } from "./ui/ajuda";
import { ligarPonte } from "./ui/ponte";
import { abrirParearCelular, ligarCelular, noCelular } from "./ui/celular";
import { criarArraste } from "./vista/arrastar";
import { COMANDOS_BASE, comandoOperacaoBase } from "./comandos/operacaoBase";
import { abrirConexoes, abrirDependencias, abrirPilhaFixadores, abrirEstatisticas, abrirLocalizarOperacoes, abrirSemelhantes } from "./comandos/localizar";
import { comandoSecaoMalha } from "./comandos/secaoMalha";
import { comandoUCS } from "./comandos/ucs";
import { abrirBibliotecaRoscas, abrirGerenciarMateriais, abrirGrauDeLiberdade } from "./comandos/bibliotecas";
import { COMANDO_IMAGEM, comandoImagem } from "./comandos/imagem";
import { COMANDOS_SUPERFICIE, EXTRAS_SUPERFICIE, PRIMITIVAS_SUPERFICIE, comandoSuperficie } from "./comandos/superficie";
import { COMANDOS_MONTAGEM, comandoComponente, comandoContato, comandoDuplicarJuntas, comandoOrigemJunta, comandoPosicao, comandoInserirComponente, comandoJunta, comandoMovimento, comandoVinculo, selecaoMudouMontagem } from "./comandos/montagem";
import { COMANDO_VARREDURA, comandoVarredura } from "./comandos/varredura";
import { COMANDO_TRANSICAO, comandoTransicao } from "./comandos/transicao";
import { COMANDO_NERVURA, COMANDO_TEIA, comandoNervura } from "./comandos/nervura";
import { COMANDO_TUBULACAO, COMANDO_TUBULACAO_SUPERFICIE, comandoTubulacao, comandoTubulacaoSuperficie } from "./comandos/tubulacao";
import { COMANDO_PADRAO_CAMINHO, comandoPadraoCaminho } from "./comandos/padraoCaminho";
import { COMANDO_ALTO_RELEVO, comandoAltoRelevo } from "./comandos/altoRelevo";
import { comandoPropriedades } from "./comandos/propriedades";
import { COMANDO_ROSCA, comandoRosca, selecaoMudouRosca } from "./comandos/rosca";
import { COMANDO_FURO, comandoFuro, furoAberto, ligarCliquesDeFuro, marcasDeFuro } from "./comandos/furo";
import { planoDeslocado } from "./nucleo/construcao";
import type { PlanoEsboco } from "./nucleo/esboco";
import { matrizDoPlano } from "./vista/desenhoEsboco";
import { escolhaAberta, estadoPerfil, ligarCliquesDePerfil, linhaEscolhida } from "./comandos/escolhaPerfil";
import { desenharEsboco, liberar } from "./vista/desenhoEsboco";
import { perfis } from "./nucleo/esboco";
import { analisarDefinicao } from "./nucleo/restricoes";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="barra-app">
    <button title="Painel de dados">▦</button>
    <button class="botao-arquivo" title="Arquivo">Arquivo ▾</button>
    <button class="botao-salvar" title="Salvar (Ctrl+S)">💾</button>
    <button class="desfazer" title="Desfazer (Ctrl+Z)">↶</button>
    <button class="refazer" title="Refazer (Ctrl+Y)">↷</button>
    <select class="escolha-tema" title="Tema de cores">
      <option value="claro">Claro</option>
      <option value="escuro">Escuro</option>
      <option value="carbono">Carbono (preto e laranja)</option>
      <option value="grafite">Grafite (padrão)</option>
      <option value="exercito">Verde exército</option>
      <option value="tatico">Tático (preto e oliva)</option>
      <option value="marinho">Marinho (azul escuro e dourado)</option>
    </select>
    <div class="aba-documento">Sem título</div>
    <div class="status-nucleo">Carregando núcleo geométrico…</div>
    <div class="marca">HAXYS CAD</div>
    <button class="botao-celular" title="Usar o HAXYS CAD no celular (QR code)" aria-label="Usar no celular">📱</button>
    <button class="botao-ligar-ia" title="Ligar IA: escolher a IA que cria peças pela sua voz">⚡ Ligar IA</button>
    <button class="botao-ajuda" title="O que é isto? (ajuda). Botão direito: tutorial" aria-label="O que é isto? (ajuda)">?</button>
  </header>
  <section class="faixa"></section>
  <main class="area-3d">
    <div class="viewport"></div>
    <aside class="navegador"></aside>
    <div class="viewcube"></div>
    <div class="barra-navegacao">
      <button data-modo="orbitar" title="Orbitar (botão esquerdo arrastado, ou Shift + botão do meio)">⟳</button>
      <button data-modo="panoramica" title="Panorâmica (botão direito ou do meio arrastado)">✥</button>
      <button data-modo="zoom" title="Zoom (roda do mouse)">🔍</button>
      <button data-acao="ajustar" title="Ajustar à janela">⤢</button>
      <button data-acao="limpa" title="Tela limpa: só a peça, a grade e as referências (clique de novo para voltar)">⛶</button>
      <button data-acao="sombra" title="Sombra no chão (liga/desliga)">◐</button>
    </div>
    <div class="aviso" hidden></div>
    <div class="servidor-caiu" role="alert" hidden>A janela preta do HAXYS CAD foi fechada. Abrir/Salvar pela pasta, Exportar, IA e Bambu não funcionam agora. Abra o INICIAR.bat de novo; este aviso some sozinho quando ela voltar.</div>
    <div class="info-selecao" hidden></div>
  </main>
  <footer class="linha-do-tempo"></footer>`;

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
ligarAjuda();

const aviso = $(".aviso");
let temporizador = 0;
function avisar(texto: string) {
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(temporizador);
  temporizador = window.setTimeout(() => (aviso.hidden = true), 3000);
}

// A janela preta é o servidor: sem ela, a tela segue viva mas pasta, IA e Bambu param.
const servidorCaiu = $(".servidor-caiu");
setInterval(() => {
  fetch("/api/projetos", { cache: "no-store" })
    .then((r) => (servidorCaiu.hidden = r.ok))
    .catch(() => (servidorCaiu.hidden = false));
}, 5000);

const projeto = new Projeto(avisar);

// Expressões com parâmetros: os campos das janelas calculam com os parâmetros de
// agora, e o projeto guarda a expressão junto da operação (só das medidas dela).
const avaliarComParametros = (texto: string) => avaliar(texto, projeto.valoresParametros().valores);
definirAvaliador(avaliarComParametros);
// Só mexe nas medidas que a janela aberta tem: as outras expressões da operação
// (ex.: um vínculo de movimento) ficam como estavam.
projeto.complementar = (op) => {
  const janela = expressoesDaJanela();
  if (!janela) return op;
  const daJanela = new Set(janela.chaves.filter((k) => k in op.params));
  const expressoes: Record<string, string> = Object.fromEntries(Object.entries(op.expressoes ?? {}).filter(([k]) => !daJanela.has(k)));
  for (const k of daJanela) if (janela.expressoes[k] !== undefined) expressoes[k] = janela.expressoes[k];
  const novo = { ...op };
  if (Object.keys(expressoes).length) novo.expressoes = expressoes;
  else delete novo.expressoes;
  return novo;
};
const areaComando = $(".area-3d");

// Ferramentas de superfície que ficam em menus do Fusion (o inventário não trouxe).
for (const x of EXTRAS_SUPERFICIE) {
  const painel = (abas as Aba[]).find((a) => a.id === "SurfaceTab")?.paineis.find((p) => p.id === x.painel);
  if (painel && !painel.ferramentas.some((f) => f.id === x.id)) painel.ferramentas.push({ nome: x.nome, id: x.id, destaque: false } as (typeof painel.ferramentas)[number]);
}
// Painel HAXYS (recursos próprios, depois de igualar o Fusion): impressora
// Bambu, voz com o Claude e peça a partir de imagem. "Imprimir 3D" também fica
// em UTILIDADES, como o "3D Print" do Fusion.
{
  const solido = (abas as Aba[]).find((a) => a.id === "SolidTab");
  const ferramentasHaxys = [
    { nome: "Imprimir 3D (Bambu)", id: COMANDO_IMPRIMIR, destaque: true },
    { nome: "Falar com a IA", id: "HaxysVozCommand", destaque: true },
    { nome: "Peça a partir de imagem", id: "HaxysImagemCommand", destaque: true },
    { nome: "Laser (Bambu Suite)", id: COMANDO_LASER, destaque: true },
    { nome: "Cortar com encaixes", id: "HaxysCorteEncaixesCommand", destaque: true },
    { nome: "Referência de medidas", id: COMANDO_REFERENCIA, destaque: true },
  ];
  if (solido && !solido.paineis.some((p) => p.id === "HaxysPanel"))
    solido.paineis.push({ nome: "HAXYS", id: "HaxysPanel", ferramentas: ferramentasHaxys } as (typeof solido.paineis)[number]);
  const util = (abas as Aba[]).find((a) => a.id === "ToolsTab")?.paineis.find((p) => p.id === "UtilityPanel");
  if (util && !util.ferramentas.some((f) => f.id === COMANDO_IMPRIMIR)) util.ferramentas.unshift({ ...ferramentasHaxys[0] } as (typeof util.ferramentas)[number]);
}
const faixa = criarFaixa($(".faixa"), abas as Aba[], usarFerramenta);

function usarFerramenta(f: Ferramenta) {
  if (f.id === "SketchCreate") {
    editandoEsboco = null;
    return modoEsboco.iniciar();
  }
  if (f.id === "SketchStop" || f.id === "SketchAutoConstrainAndFinish") return modoEsboco.concluir();
  if (COMANDOS_BASE[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return void comandoOperacaoBase(COMANDOS_BASE[f.id], projeto, {
      abrir: (id) => (faixa.abrirAbaDeContexto(id), (abaBase = id)),
      fechar: () => (faixa.fecharAbaDeContexto(), (abaBase = null)),
    }, avisar);
  }
  if (f.id === "FusionDragCompControlsCmd")
    return avisar(arraste.alternar() ? "Arraste de componente ligado: segure o botão esquerdo numa peça e arraste." : "Arraste de componente desligado.");
  if (f.id === "ChangeParameterCommand") return abrirJanelaParametros(document.body, projeto, avisar);
  if (f.id === "FusionStartDesignConfigModeCmd" || f.id === "FusionShowDesignConfigPanelCmd")
    return abrirJanelaParametros(document.body, projeto, avisar, "configuracoes");
  if (f.id === "FusionConfigurationRulesCmd") return abrirJanelaParametros(document.body, projeto, avisar, "regras");
  if (f.id === "FusionFindFeaturesCommand")
    return abrirLocalizarOperacoes(projeto, (op) => {
      usarExpressoes(op.expressoes ?? {});
      editarOperacao(op);
      usarExpressoes({});
    });
  if (f.id === "FusionComponentConnectionAnalysisCommand" || f.id === "FusionEditComponentConnectionAnalysisCommand") return abrirConexoes(projeto);
  if (f.id === "FusionFastenerStackAnalysisCommand") {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return void abrirPilhaFixadores(projeto, avisar);
  }
  if (f.id === "ParaMeshShowSelectionPanelCmd") return abrirPaletaMalhas(projeto, selecao, avisar);
  if (f.id === "GraphViewCmd")
    return abrirDependencias(projeto, (op) => {
      usarExpressoes(op.expressoes ?? {});
      editarOperacao(op);
      usarExpressoes({});
    });
  if (f.id === "SimilarPartsCommand") return void abrirSemelhantes(projeto, selecao.itens()[0]?.corpo ?? null, avisar);
  if (f.id === "FusionAssemblyStatisticsCommand") return void abrirEstatisticas(projeto, avisar);
  if (f.id === "ParaMeshPlanarSectionCommand" || f.id === "FitCurvesToSectionCommand")
    return comandoSecaoMalha(areaComando, projeto, selecao.itens()[0]?.corpo ?? null, f.id === "FitCurvesToSectionCommand", avisar);
  if (f.id === "MaterialCommand") return abrirGerenciarMateriais();
  if (f.id === "FusionManageThreadsLibraryCommand") return abrirBibliotecaRoscas();
  if (f.id === "FusionDOFAnalysisCommand") return abrirGrauDeLiberdade(projeto, avisar);
  if (f.id === "CoordinateSystemCommand") return comandoUCS(areaComando, projeto, avisar);
  if (f.id === "FusionIsoCurveAnalysisCommand") {
    isocurvasLigadas = !isocurvasLigadas;
    if (!isocurvasLigadas) return vista.mostrarIsocurvas(null), avisar("Isocurvas: desligadas");
    return void atualizarIsocurvas().then(() => avisar("Isocurvas: ligadas (faces curvas)"));
  }
  if (f.id === "FusionCurvatureCombAnalysisCommand") return avisar(vista.alternarPente() ? "Pente de curvatura: ligado (arestas curvas)" : "Pente de curvatura: desligado");
  if (f.id === "FacegroupsToggleCmd") return avisar(vista.alternarGruposMalha() ? "Grupos de faces: à mostra" : "Grupos de faces: escondidos");
  if (f.id === "FusionViewColorCyclingToggleCmd") return avisar(vista.alternarCoresPorCorpo() ? "Cores de componentes: ligadas" : "Cores de componentes: desligadas");
  if (FERRAMENTAS_ESBOCO[f.id]) return modoEsboco.usarFerramenta(FERRAMENTAS_ESBOCO[f.id]);
  if (FERRAMENTAS_RESTRICAO[f.id]) return modoEsboco.usarRestricao(FERRAMENTAS_RESTRICAO[f.id]);
  if (f.id === "Extrude") return abrirExtrusao();
  if (f.id === "Revolve") return abrirRevolucao();
  if (f.id === COMANDO_PLANO) return comandoPlano(areaComando, projeto, selecao);
  if (f.id === COMANDO_VARREDURA) return abrirComandoDePerfil(comandoVarredura);
  if (f.id === COMANDO_TRANSICAO) return abrirComandoDePerfil(comandoTransicao);
  if (f.id === COMANDO_NERVURA) return abrirComandoDePerfil(comandoNervura);
  if (f.id === COMANDO_TUBULACAO) return abrirComandoDePerfil(comandoTubulacao);
  if (f.id === COMANDO_TUBULACAO_SUPERFICIE) return abrirComandoDePerfil(comandoTubulacaoSuperficie);
  if (f.id === COMANDO_PADRAO_CAMINHO) return abrirComandoDePerfil(comandoPadraoCaminho);
  if (f.id === COMANDO_ALTO_RELEVO) return abrirComandoDePerfil(comandoAltoRelevo);
  if (f.id === COMANDO_TEIA)
    return abrirComandoDePerfil((r, p, v, t, d, e) => comandoNervura(r, p, v, t, d, e, true));
  if (f.id === COMANDO_ROSCA) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoRosca(areaComando, projeto, selecao);
  }
  if (COMANDOS_SELECIONAR.includes(f.id)) return void comandoSelecionar(f.id, areaComando, projeto, selecao, avisar);
  if (COMANDOS_MONTAGEM[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    const t = COMANDOS_MONTAGEM[f.id];
    if (t === "componente" || t === "grupo") return comandoComponente(projeto, selecao, t === "grupo", avisar);
    if (t === "junta" || t === "comoEsta") return comandoJunta(areaComando, projeto, selecao, t === "comoEsta");
    if (t === "movimento") return comandoMovimento(areaComando, projeto, avisar);
    if (t === "vinculo") return comandoVinculo(areaComando, projeto, avisar);
    if (t === "inserir") return comandoInserirComponente(areaComando, projeto, avisar);
    if (t === "origem") return comandoOrigemJunta(areaComando, projeto, selecao, avisar);
    if (t === "duplicar") return comandoDuplicarJuntas(projeto, selecao, avisar);
    if (t === "capturar" || t === "reverter") return comandoPosicao(projeto, t === "capturar", avisar);
    if (t.startsWith("contato") || t === "novoContato") return comandoContato(projeto, selecao, t, avisar);
  }
  if (f.id === COMANDO_IMPRIMIR)
    return void comandoImprimir(areaComando, projeto, projeto.estado.corposBase.filter((c) => !ocultos.has(c.nome)).map((c) => c.nome), nomeProjeto, avisar);
  if (f.id === COMANDO_IMAGEM) return comandoImagem(areaComando, projeto, avisar);
  if (f.id === COMANDO_REFERENCIA) return comandoReferencia(areaComando, avisar);
  if (f.id === COMANDO_LASER) return comandoLaser(areaComando, projeto, nomeProjeto, avisar);
  if (f.id === "HaxysVozCommand") return abrirVoz(projeto, avisar);
  if (f.id === "ScriptsManagerCommand") return abrirConsoleScript(projeto);
  if (COMANDOS_ANOTACAO[f.id]) return void comandoAnotacao(COMANDOS_ANOTACAO[f.id], areaComando, projeto, selecao, avisar);
  if (COMANDOS_SUPERFICIE[f.id]) return comandoSuperficie(COMANDOS_SUPERFICIE[f.id], areaComando, projeto, avisar);
  if (PRIMITIVAS_SUPERFICIE[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoPrimitiva(areaComando, projeto, PRIMITIVAS_SUPERFICIE[f.id], undefined, true);
  }
  if (f.id === COMANDO_INSERIR_MALHA) return comandoInserirMalha(areaComando, projeto, avisar);
  if (COMANDOS_TELA[f.id]) return comandoTela(COMANDOS_TELA[f.id], areaComando, projeto, selecao, planosParaListas, avisar);
  if (COMANDOS_IMPORTAR[f.id])
    return comandoImportar(COMANDOS_IMPORTAR[f.id], areaComando, projeto, planosParaListas, avisar);
  if (COMANDOS_CONSTRUIR[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoConstruir(areaComando, projeto, selecao, vista, f.id);
  }
  if (COMANDOS_ANALISE[f.id]) return comandoAnalise(areaComando, vista, COMANDOS_ANALISE[f.id]);
  if (COMANDOS_INSPECAO[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    const t = COMANDOS_INSPECAO[f.id];
    if (t === "corte")
      return comandoCorte(areaComando, projeto, vista, () =>
        projeto.estado.historico.filter((o) => o.tipo === "plano" && !o.suprimida).map((o) => [`op:${o.id}`, planoDeslocado(o)!] as [string, PlanoEsboco]),
      );
    return comandoInspecaoCorpos(areaComando, projeto, selecao, vista, t);
  }
  // Excluir/Remover corpo: entra na linha do tempo como "Remover" (dá para desfazer).
  if (f.id === "FusionDeleteCommand" || f.id === "SoftDeleteCommand") return removerCorposEscolhidos();
  if (f.id === COMANDO_MEDIR) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoMedir(areaComando, projeto, selecao);
  }
  if (f.id === COMANDO_FURO) return abrirFuro();
  if (COMANDOS_CORPOS[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    // Mover/copiar com faces já escolhidas abre direto o Mover face (como no Fusion).
    if (f.id === "FusionMoveCommand" && selecao.itens().some((i) => i.tipo === "face"))
      return comandoFaces(areaComando, projeto, selecao, "moverFace");
    return comandoCorpos(areaComando, projeto, selecao, COMANDOS_CORPOS[f.id]);
  }
  if (COMANDOS_FACES[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoFaces(areaComando, projeto, selecao, COMANDOS_FACES[f.id]);
  }
  if (f.id === "SelectComponentPriorityCommand") {
    prioridadeComponente = !prioridadeComponente;
    if (prioridadeComponente) selecao.definirPrioridade("corpo");
    return avisar(prioridadeComponente ? "Prioridade: componente inteiro" : "Prioridade de componente desligada");
  }
  if (f.id === "FusionComputeAllCommand" || f.id === "FusionComputeUnresolvedCommand") {
    projeto.calcularTudo();
    return avisar("Recalculando o histórico inteiro…");
  }
  if (f.id === "MaterializedBomHybridCmd" || f.id === "MaterializedBomCmd") return void abrirListaMateriais(projeto, avisar);
  if (PRIORIDADES[f.id]) {
    prioridadeComponente = false;
    const nova = selecao.prioridade() === PRIORIDADES[f.id] ? "livre" : PRIORIDADES[f.id];
    selecao.definirPrioridade(nova);
    return avisar(nova === "livre" ? "Seleção livre" : `Prioridade de seleção: ${NOME_PRIORIDADE[nova]}`);
  }
  if (f.id === "SelectCommand") {
    trocarModo("selecionar");
    selecao.definirPrioridade("livre");
    return avisar("Seleção livre");
  }
  if (COMANDOS_ARESTAS[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoArestas(areaComando, projeto, selecao, COMANDOS_ARESTAS[f.id]);
  }
  if (PRIMITIVAS[f.id]) {
    if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
    return comandoPrimitiva(areaComando, projeto, f.id);
  }
  avisar(`${f.nome} — ainda não implementado (${f.id})`);
}

const vista = criarVista($(".viewport"));
const arraste = criarArraste(vista, projeto, avisar);
criarViewCube($(".viewcube"), vista);

// Tema de cores (caixa na barra de cima), guardado no navegador.
const escolhaTema = $<HTMLSelectElement>(".escolha-tema");
function aplicarTema(tema: string) {
  if (![...escolhaTema.options].some((o) => o.value === tema)) tema = "grafite";
  document.documentElement.dataset.tema = tema;
  escolhaTema.value = tema;
  vista.temaEscuro(tema !== "claro");
  try {
    localStorage.setItem("haxys.tema", tema);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}
aplicarTema((() => {
  try {
    return localStorage.getItem("haxys.tema") ?? "grafite";
  } catch {
    return "grafite";
  }
})());
escolhaTema.addEventListener("change", () => aplicarTema(escolhaTema.value));

// Ferramentas do painel Selecionar que mudam o que o clique pega.
const PRIORIDADES: Record<string, Prioridade> = {
  SelectBodyPriorityCommand: "corpo",
  SelectFacePriorityCommand: "face",
  SelectEdgePriorityCommand: "aresta",
};
const NOME_PRIORIDADE: Record<Prioridade, string> = {
  livre: "livre",
  corpo: "corpo",
  face: "face",
  aresta: "aresta",
};
const infoSelecao = $(".info-selecao");
// "Prioridade de componente": clicar num corpo pega o componente inteiro.
let prioridadeComponente = false;
function completarComponente(itens: ItemSelecionado[]): ItemSelecionado[] | null {
  if (!prioridadeComponente) return null;
  const comps = projeto.estado.historico.filter((o) => o.tipo === "componente" && !o.suprimida);
  const nomes = new Set(itens.filter((i) => i.tipo === "corpo").map((i) => i.corpo));
  const extra = new Set<string>();
  for (const c of comps) if ((c.corpos ?? []).some((n) => nomes.has(n))) (c.corpos ?? []).forEach((n) => !nomes.has(n) && extra.add(n));
  return extra.size ? [...itens, ...[...extra].map((n) => ({ corpo: n, tipo: "corpo" as const, indice: -1 }))] : null;
}
const selecao = criarSelecao(vista, (itens) => {
  const completo = completarComponente(itens);
  if (completo) return selecao.definirItens(completo);
  const texto = descrever(itens, projeto.estado.corpos);
  infoSelecao.textContent = texto;
  infoSelecao.hidden = !texto;
  atualizarNavegador();
  selecaoMudou(itens);
  selecaoMudouFaces(itens);
  selecaoMudouCorpos(itens);
  selecaoMudouPlano(itens);
  selecaoMudouMedir(itens);
  selecaoMudouInspecao(itens);
  selecaoMudouConstruir(itens);
  selecaoMudouMontagem(itens);
  selecaoMudouRosca(itens);
});

// Nome do projeto (muda ao salvar/abrir).
let nomeProjeto = "Sem título";

// Corpos escondidos pelo olho do Navegador.
const ocultos = new Set<string>();
const navegador = criarNavegador($(".navegador"));
const linhaDoTempo = criarLinhaDoTempo($(".linha-do-tempo"), {
  editar: (op) => {
    // A janela que abrir mostra as expressões no lugar dos números.
    usarExpressoes(op.expressoes ?? {});
    editarOperacao(op);
    usarExpressoes({});
  },
  suprimir: (op) => projeto.alternarSupressao(op.id),
  excluir: (op) => projeto.remover(op.id),
});

function editarOperacao(op: Operacao) {
  if (op.tipo === "arredondamento" || op.tipo === "chanfro")
    comandoArestas(areaComando, projeto, selecao, op.tipo, op);
  else if (op.tipo === "esboco" && op.esboco) {
    editandoEsboco = op;
    modoEsboco.editar(op.esboco);
  } else if ((op.tipo === "extrusao" || op.tipo === "transicao") && op.opcoes?.superficie === "sim") comandoSuperficie(op.tipo, areaComando, projeto, avisar, op);
  else if (op.tipo === "extrusao") abrirExtrusao(op);
  else if (op.tipo === "revolucao") abrirRevolucao(op);
  else if (op.tipo === "casca" || op.tipo === "pressionar" || op.tipo === "inclinacao" || op.tipo === "espessar" || op.tipo === "dividirFace" || op.tipo === "substituirFace" || op.tipo === "moverFace" || op.tipo === "deslocarFace" || op.tipo === "removerFaces" || op.tipo === "alinhar" || op.tipo === "malhaApagar" || op.tipo === "malhaCombinarGrupos")
    comandoFaces(areaComando, projeto, selecao, op.tipo, op);
  else if (op.tipo === "espelhar" || op.tipo === "padraoRetangular" || op.tipo === "padraoCircular" || op.tipo === "combinar" || op.tipo === "mover" || op.tipo === "dividir" || op.tipo === "escala" || op.tipo === "aparencia" || op.tipo === "material" || op.tipo === "delimitador" || op.tipo === "volumeFluido" || op.tipo === "padraoGeometrico" || op.tipo === "removerRecursos" || op.tipo === "substituirPrimitivo" || op.tipo === "organizar" || (op.tipo.startsWith("malha") && op.tipo !== "malhaInserir" && op.tipo !== "malhaFusion") || op.tipo.startsWith("superficie"))
    comandoCorpos(areaComando, projeto, selecao, op.tipo as Parameters<typeof comandoCorpos>[3], op);
  else if (op.tipo === "plano") comandoPlano(areaComando, projeto, selecao, op);
  else if (op.tipo === "anotacao") void comandoAnotacao((op.opcoes?.tipo ?? "observacao") as TipoAnotacao, areaComando, projeto, selecao, avisar, op);
  else if (op.tipo === "tela") comandoTela(op.opcoes?.decalque === "sim" ? "decalque" : "tela", areaComando, projeto, selecao, planosParaListas, avisar, op);
  else if (op.tipo === "junta") comandoJunta(areaComando, projeto, selecao, op.opcoes?.comoEsta === "sim", op);
  else if (op.tipo === "malhaFusion") avisar("Passo trazido do Fusion: para mudar as medidas, edite no Fusion e use Arquivo > Trazer do Fusion de novo.");
  else if (op.tipo === "componente" || op.tipo === "importado" || op.tipo === "malhaInserir") avisar("Esta operação não tem o que editar: exclua e crie de novo.");
  else if (op.tipo === "eixo" || op.tipo === "ponto") avisar("Eixo e ponto de construção não se editam: exclua e crie de novo.");
  else if (op.tipo === "furo") abrirFuro(op);
  else if (op.tipo === "varredura") abrirComandoDePerfil(comandoVarredura, op);
  else if (op.tipo === "transicao") abrirComandoDePerfil(comandoTransicao, op);
  else if (op.tipo === "nervura" || op.tipo === "teia") abrirComandoDePerfil(comandoNervura, op);
  else if (op.tipo === "tubulacao") abrirComandoDePerfil(comandoTubulacao, op);
  else if (op.tipo === "padraoCaminho") abrirComandoDePerfil(comandoPadraoCaminho, op);
  else if (op.tipo === "altoRelevo") abrirComandoDePerfil(comandoAltoRelevo, op);
  else if (op.tipo === "rosca") comandoRosca(areaComando, projeto, selecao, op);
  else comandoPrimitiva(areaComando, projeto, null, op);
}

// ---- Esboço ----

let editandoEsboco: Operacao | null = null;
let abaBase: string | null = null; // aba da Operação base aberta (ou null)
const modoEsboco = criarModoEsboco(vista, areaComando, {
  aoComecar() {
    selecao.definirAtiva(false);
    faixa.abrirAbaDeContexto("SketchTab");
    desenhar();
  },
  aoSair() {
    selecao.definirAtiva(true);
    faixa.fecharAbaDeContexto();
    if (abaBase) faixa.abrirAbaDeContexto(abaBase); // voltou para dentro da operação base
  },
  aoConcluir(dados) {
    if (editandoEsboco) projeto.substituir({ ...editandoEsboco, esboco: dados });
    else
      projeto.adicionar({
        id: crypto.randomUUID(),
        tipo: "esboco",
        nome: projeto.proximoNome("Esboço"),
        modo: "novo",
        params: {},
        esboco: dados,
      });
    editandoEsboco = null;
  },
  avisar,
  avaliar: avaliarComParametros,
  secao: (corpo, plano) => projeto.secao(corpo, plano),
  planosConstrucao: () =>
    projeto.estado.historico
      .filter((o) => o.tipo === "plano" && !o.suprimida && !ocultos.has(o.nome))
      .map((o) => planoDeslocado(o)!)
      .filter(Boolean),
});

// Esboços terminados aparecem na cena (curvas + perfis laranja).
const grupoEsbocos = new THREE.Group();
vista.cena.add(grupoEsbocos);
const MAT_PERFIL_SOBRE = new THREE.MeshBasicMaterial({ color: 0x6fb2ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const MAT_PERFIL_ESCOLHIDO = new THREE.MeshBasicMaterial({ color: 0x1f6fe0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });

function esbocosVisiveis(): Operacao[] {
  return projeto.estado.historico.filter(
    (o) => o.tipo === "esboco" && o.esboco && !o.suprimida && !ocultos.has(o.nome) && o !== editandoEsboco,
  );
}

function desenharEsbocos() {
  for (const g of [...grupoEsbocos.children]) (grupoEsbocos.remove(g), liberar(g));
  for (const op of esbocosVisiveis()) {
    const g = desenharEsboco(op.esboco!, {
      idOperacao: op.id,
      comPontos: false,
      definidas: analisarDefinicao(op.esboco!).curvas,
    });
    for (const m of g.getObjectByName("perfis")!.children as THREE.Mesh[]) {
      const estado = estadoPerfil(op.id, m.userData.indice);
      if (estado === "escolhido") m.material = MAT_PERFIL_ESCOLHIDO;
      else if (estado === "sobre") m.material = MAT_PERFIL_SOBRE;
    }
    // Linha escolhida como eixo da Revolução fica vermelha.
    for (const l of g.getObjectByName("curvas")!.children as THREE.Line[]) {
      if (linhaEscolhida(op.id, l.userData.curva)) l.material = MAT_LINHA_EIXO;
    }
    grupoEsbocos.add(g);
  }
}
const MAT_LINHA_EIXO = new THREE.LineBasicMaterial({ color: 0xd23b3b, depthTest: false });
ligarCliquesDePerfil(vista, grupoEsbocos, desenharEsbocos);

// ---- Planos de construção e marcas dos furos ----

const grupoConstrucao = new THREE.Group();
vista.cena.add(grupoConstrucao);
const MAT_CONSTRUCAO = new THREE.MeshBasicMaterial({ color: 0xf5a623, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
const MAT_BORDA_CONSTRUCAO = new THREE.LineBasicMaterial({ color: 0xc9821b });
const MAT_MARCA_FURO = new THREE.MeshBasicMaterial({ color: 0xe03131, depthTest: false });

const MAT_EIXO_CONSTRUCAO = new THREE.LineDashedMaterial({ color: 0xd9822b, dashSize: 4, gapSize: 2, depthTest: false });
const MAT_PONTO_CONSTRUCAO = new THREE.MeshBasicMaterial({ color: 0xd9822b, depthTest: false });

// Texturas das telas (uma por imagem; quando a imagem termina de carregar, redesenha).
const texturas = new Map<string, THREE.Texture>();
function texturaDe(url: string): THREE.Texture {
  let t = texturas.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url, () => desenharConstrucao());
    t.colorSpace = THREE.SRGBColorSpace;
    texturas.set(url, t);
  }
  return t;
}

function desenharConstrucao() {
  for (const o of [...grupoConstrucao.children]) (grupoConstrucao.remove(o), liberar(o));
  const previa = projeto.operacaoEmPrevia();
  const ops = projeto.estado.historico.filter((o) => o.tipo === "plano" && !o.suprimida && !ocultos.has(o.nome) && o.id !== previa?.id);
  if (previa?.tipo === "plano") ops.push(previa);
  for (const op of ops) {
    const p = planoDeslocado(op);
    if (!p) continue;
    const g = new THREE.PlaneGeometry(60, 60);
    const m = new THREE.Mesh(g, MAT_CONSTRUCAO);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), MAT_BORDA_CONSTRUCAO));
    m.matrixAutoUpdate = false;
    m.matrix.copy(matrizDoPlano(p));
    grupoConstrucao.add(m);
  }
  // Eixos (linha tracejada longa) e pontos (bolinha) de construção.
  // Origem da junta: bolinha + eixo Z curto (só para fora).
  const ehConstrucao = (o: Operacao) => o.tipo === "eixo" || o.tipo === "ponto" || o.tipo === "origemJunta";
  const outros = projeto.estado.historico.filter((o) => ehConstrucao(o) && !o.suprimida && !ocultos.has(o.nome) && o.id !== previa?.id);
  if (previa && ehConstrucao(previa)) outros.push(previa);
  for (const op of outros) {
    if (op.eixoConstrucao) {
      const { origem: o, direcao: d } = op.eixoConstrucao;
      const curto = op.tipo === "origemJunta";
      const a = new THREE.Vector3(...o).addScaledVector(new THREE.Vector3(...d), curto ? 0 : -150);
      const b = new THREE.Vector3(...o).addScaledVector(new THREE.Vector3(...d), curto ? 12 : 150);
      const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), MAT_EIXO_CONSTRUCAO);
      linha.computeLineDistances();
      linha.renderOrder = 7;
      grupoConstrucao.add(linha);
    }
    if (op.pontoConstrucao) {
      const bola = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 12), MAT_PONTO_CONSTRUCAO);
      bola.position.set(...op.pontoConstrucao);
      bola.renderOrder = 8;
      grupoConstrucao.add(bola);
    }
  }
  // Telas e decalques: imagem num retângulo do plano (largura em mm, proporção da imagem).
  const telas = projeto.estado.historico.filter((o) => o.tipo === "tela" && !o.suprimida && !ocultos.has(o.nome) && o.id !== previa?.id);
  if (previa?.tipo === "tela") telas.push(previa);
  for (const op of telas) {
    if (!op.imagem || !op.planoBase) continue;
    const tex = texturaDe(op.imagem);
    const img = tex.image as HTMLImageElement | undefined;
    const prop = img && img.width ? img.height / img.width : 1;
    const L = op.params.largura || 100;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: (op.params.opacidade ?? 100) / 100, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L, L * prop), mat);
    m.matrixAutoUpdate = false;
    const local = new THREE.Matrix4().makeRotationZ(((op.params.giro ?? 0) * Math.PI) / 180).setPosition(op.params.dx ?? 0, op.params.dy ?? 0, 0);
    m.matrix.copy(matrizDoPlano(op.planoBase)).multiply(local);
    m.renderOrder = 1;
    grupoConstrucao.add(m);
  }
  // Anotações 3D (PMI).
  const notas = projeto.estado.historico.filter((o) => o.tipo === "anotacao" && !o.suprimida && !ocultos.has(o.nome) && o.id !== previa?.id);
  if (previa?.tipo === "anotacao") notas.push(previa);
  for (const op of notas) for (const obj of objetosDaAnotacao(op)) grupoConstrucao.add(obj);
  for (const [x, y, z] of marcasDeFuro()) {
    const marca = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 12), MAT_MARCA_FURO);
    marca.position.set(x, y, z);
    marca.renderOrder = 8;
    grupoConstrucao.add(marca);
  }
  grupoConstrucao.updateMatrixWorld(true);
}

ligarCliquesDeFuro(vista, avisar);
function abrirFuro(existente?: Operacao) {
  if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
  if (modoEsboco.ativo()) modoEsboco.concluir();
  selecao.definirAtiva(false);
  comandoFuro(
    areaComando,
    projeto,
    () => {
      desenharConstrucao();
      if (!furoAberto()) selecao.definirAtiva(true);
    },
    existente,
  );
  if (!existente) avisar("Clique numa face plana para pôr o furo.");
}

// Extrusão e Revolução: escolhem perfis de esboços visíveis.
function abrirExtrusao(existente?: Operacao) {
  abrirComandoDePerfil(comandoExtrusao, existente);
}
function abrirRevolucao(existente?: Operacao) {
  abrirComandoDePerfil(comandoRevolucao, existente);
}
function abrirComandoDePerfil(comando: typeof comandoExtrusao, existente?: Operacao) {
  if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
  if (modoEsboco.ativo()) modoEsboco.concluir();
  selecao.definirAtiva(false);
  comando(
    areaComando,
    projeto,
    () =>
      esbocosVisiveis().flatMap((op) => perfis(op.esboco!).map((_, indice) => ({ esboco: op.id, indice }))),
    (idEsboco) => {
      // O Fusion esconde o esboço depois de usar.
      const op = projeto.estado.historico.find((o) => o.id === idEsboco);
      if (op) ocultos.add(op.nome);
      desenhar();
    },
    () => {
      desenharEsbocos();
      if (!escolhaAberta()) selecao.definirAtiva(true);
    },
    existente,
  );
}

function alternarCorpo(nome: string) {
  if (ocultos.has(nome)) ocultos.delete(nome);
  else ocultos.add(nome);
  desenhar();
}

function atualizarNavegador() {
  navegador.atualizar(projeto.estado.corpos, {
    nomeProjeto,
    esbocos: projeto.estado.historico.filter((o) => o.tipo === "esboco").map((o) => o.nome),
    construcao: projeto.estado.historico.filter((o) => o.tipo === "plano" || o.tipo === "eixo" || o.tipo === "ponto" || o.tipo === "tela" || o.tipo === "anotacao").map((o) => o.nome),
    componentes: projeto.estado.historico.filter((o) => o.tipo === "componente" && !o.suprimida).map((o) => [o.nome, o.corpos ?? []] as [string, string[]]),
    ocultos,
    selecionados: new Set(selecao.itens().filter((i) => i.tipo === "corpo").map((i) => i.corpo)),
    alternarVisivel: alternarCorpo,
    clicarCorpo: (nome, somar) => selecao.alternarCorpo(nome, somar),
    propriedades: (nome) => {
      if (!projeto.estado.nucleoPronto) return avisar("Espere o núcleo geométrico carregar.");
      comandoPropriedades(areaComando, projeto, nome);
    },
  });
}

const status = $(".status-nucleo");
let enquadrarAoAbrir = false; // projeto trocado: enquadra quando os corpos chegarem, como no Fusion
function desenhar() {
  const e = projeto.estado;
  vista.mostrarCorpos(e.corpos, ocultos, e.corposBase);
  if (enquadrarAoAbrir && e.corpos.length) (enquadrarAoAbrir = false), vista.ajustar();
  desenharEsbocos();
  desenharConstrucao();
  selecao.corposMudaram();
  atualizarNavegador();
  linhaDoTempo.atualizar(e.historico, e.erros);
  if (e.nucleoPronto) dispatchEvent(new Event("haxys-pronto")); // fecha a abertura (ui/abertura.ts)
  status.textContent = !e.nucleoPronto
    ? "Carregando núcleo geométrico…"
    : e.calculando
      ? "Calculando…"
      : "";
}
projeto.aoMudar(desenhar);
// Só para depurar no navegador (não vai para a versão final).
if (import.meta.env.DEV) Object.assign(window, { __haxysProjeto: projeto, __haxysVista: vista, __haxysSelecao: selecao, __haxysFerramenta: (id: string) => usarFerramenta({ id } as Ferramenta) });

// ---- Arquivo ----
const menuArquivo = criarMenuArquivo({
  botaoMenu: $(".botao-arquivo"),
  botaoSalvar: $(".botao-salvar"),
  projeto,
  ocultos,
  avisar,
  aoMudarNome(nome, modificado) {
    if (nome !== nomeProjeto) {
      nomeProjeto = nome;
      enquadrarAoAbrir = true;
      atualizarNavegador();
    }
    const texto = `${nome}${modificado ? " *" : ""}`;
    $(".aba-documento").textContent = texto;
    $(".aba-documento").title = modificado ? "Há mudanças não salvas" : "Tudo salvo";
    document.title = `${texto} — HAXYS CAD`;
  },
  redesenhar: desenhar,
  areaComando,
  // Foto enquadrada na peça, sem mexer na vista da pessoa.
  foto() {
    const pos = vista.camera.position.clone(), alvo = vista.controles.target.clone();
    const png = vista.capturar(true);
    vista.camera.position.copy(pos);
    vista.controles.target.copy(alvo);
    vista.controles.update();
    return png;
  },
  antesDeTrocar() {
    fecharDialogo();
    if (modoEsboco.ativo()) modoEsboco.concluir();
    selecao.limpar();
  },
});
// Isocurvas (análise): refeitas quando o projeto muda, se estiverem ligadas.
let isocurvasLigadas = false;
let historicoIso = projeto.estado.historico;
async function atualizarIsocurvas() {
  historicoIso = projeto.estado.historico;
  try {
    vista.mostrarIsocurvas(await projeto.isocurvas());
  } catch (e) {
    avisar(`Isocurvas: ${e instanceof Error ? e.message : String(e)}`);
  }
}
projeto.aoMudar((estado) => {
  if (isocurvasLigadas && !estado.calculando && estado.historico !== historicoIso) void atualizarIsocurvas();
});
// Ponte com as IAs (MCP): a IA abre o HAXYS CAD e constrói a peça sozinha.
ligarPonte(projeto, vista, avisar, menuArquivo);

// Celular: no PC o 📱 mostra o QR code; no celular, a barra de toque (ui/celular.ts).
$(".botao-celular").addEventListener("click", () => void abrirParearCelular(avisar));
ligarCelular();
if (noCelular) abrirVoz(projeto, avisar); // no celular a IA é a tela principal
if (noCelular) servidorCaiu.textContent = "Sem ligação com o HAXYS CAD do PC. Confira se o PC está ligado, com o HAXYS CAD aberto, e se o celular está na mesma Wi-Fi.";
desenhar();

$(".desfazer").addEventListener("click", () => projeto.desfazerUltimo());
$(".refazer").addEventListener("click", () => projeto.refazerUltimo());

// Barra de navegação: clicar liga o modo no botão esquerdo; clicar de novo desliga.
let modo: ModoNavegacao = "selecionar";
function trocarModo(novo: ModoNavegacao) {
  modo = novo;
  vista.definirModo(modo);
  document
    .querySelectorAll(".barra-navegacao [data-modo]")
    .forEach((x) => x.classList.toggle("ligado", (x as HTMLElement).dataset.modo === modo));
}
document.querySelectorAll<HTMLButtonElement>(".barra-navegacao button").forEach((b) => {
  b.addEventListener("click", () => {
    if (b.dataset.acao === "ajustar") return vista.ajustar();
    if (b.dataset.acao === "limpa") return void b.classList.toggle("ligado", $("#app").classList.toggle("tela-limpa"));
    if (b.dataset.acao === "sombra") {
      const ligada = b.classList.toggle("ligado");
      localStorage.setItem("haxys.sombra", ligada ? "1" : "0");
      return vista.sombra(ligada);
    }
    const novo = b.dataset.modo as ModoNavegacao;
    trocarModo(modo === novo ? "selecionar" : novo);
  });
});
{
  // Sombra no chão: ligada por padrão; a escolha fica guardada.
  let ligada = true;
  try {
    ligada = localStorage.getItem("haxys.sombra") !== "0";
  } catch {
    /* sem armazenamento */
  }
  $('.barra-navegacao [data-acao="sombra"]').classList.toggle("ligado", ligada);
  vista.sombra(ligada);
}

// Planos de construção para as listas dos comandos ([chave, plano]).
const planosParaListas = () =>
  projeto.estado.historico.filter((o) => o.tipo === "plano" && !o.suprimida).map((o) => [`op:${o.id}`, planoDeslocado(o)!] as [string, PlanoEsboco]);

function removerCorposEscolhidos() {
  const nomes = [...new Set(selecao.itens().filter((i) => i.tipo === "corpo").map((i) => i.corpo))];
  if (!nomes.length) return avisar("Escolha os corpos inteiros (clique no corpo ou no Navegador) e depois Excluir.");
  projeto.adicionar({ id: crypto.randomUUID(), tipo: "remover", nome: projeto.proximoNome("Remover"), modo: "novo", params: {}, corpos: nomes });
  selecao.limpar();
}

window.addEventListener("keydown", (e) => {
  if (menuArquivo.tecla(e)) return e.preventDefault();
  const digitando =
    e.target instanceof HTMLElement && e.target.matches("input, select, textarea");
  if (digitando || dialogoAberto()) return;
  if (modoEsboco.tecla(e)) return e.preventDefault();
  if (!e.ctrlKey && e.key.toLowerCase() === "e") return abrirExtrusao();
  if (e.key === "Escape") {
    if (modo !== "selecionar") trocarModo("selecionar");
    else selecao.limpar();
  }
  if (e.key === "Delete" && selecao.itens().some((i) => i.tipo === "corpo")) return removerCorposEscolhidos();
  if (e.ctrlKey && e.key.toLowerCase() === "z") projeto.desfazerUltimo();
  if (e.ctrlKey && e.key.toLowerCase() === "y") projeto.refazerUltimo();
});
