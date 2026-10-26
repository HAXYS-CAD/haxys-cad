// Montagem (aba Sólido, painel Montagem):
// - Novo componente / Grupo rígido: os corpos escolhidos passam a andar juntos;
// - Junta (e "como está"): escolha uma face/aresta no componente que anda e
//   outra no componente fixo. Tipos: rígida, giratória, deslizante,
//   cilíndrica, esférica, planar; ângulo/distância dizem a posição da junta;
// - Juntas de unidade / Estudo de movimento: muda o valor de uma junta, com
//   animação opcional;
// - Vínculo de movimento: uma junta segue outra (valor = mestre × relação +
//   deslocamento), gravado como expressão "Junta1.angulo * 2 + 0" na que segue;
// - Inserir componente: traz um arquivo STEP ou STL como corpo novo;
// - Origem da junta: ponto preso numa face/aresta (com deslocamento X/Y/Z), que
//   a junta pode usar no lugar do clique;
// - Duplicar com juntas: cópia do componente + cópia das juntas dele (depois
//   edite a junta nova para levar a cópia a outro lugar);
// - Conjuntos de contato: com o contato ligado, Juntas de unidade param o
//   movimento quando os corpos se encostam (passam a se sobrepor);
// - Capturar / Reverter posição: guarda os valores das juntas e volta a eles
//   (sem nada capturado, volta tudo a zero, como construído).
// Diferenças do Fusion, por enquanto: componentes não têm posição própria nem
// sub-componentes; juntas não têm limites; não dá para arrastar componentes
// com o mouse (posição só pelas juntas); a Origem da junta é desenhada onde foi
// criada (não acompanha o corpo na tela, mas a junta usa a posição de agora);
// a animação recalcula a peça a cada quadro (lenta em peças grandes).
import { abrirDialogo, type Dialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { V3 } from "../nucleo/esboco";
import type { Projeto } from "../nucleo/projeto";
import type { ItemSelecionado, Prioridade, Selecao } from "../vista/selecao";

export const COMANDOS_MONTAGEM: Record<string, string> = {
  FusionCreateNewComponentCommand: "componente",
  RigidGroupCmd: "grupo",
  JointAssembleCmdNew: "junta",
  JointConstraintCmd: "junta",
  AssemblyMateCommand: "junta",
  AlignConstraintCmd: "junta",
  AngleConstraintCmd: "junta",
  TangentConstraintCmd: "junta",
  MidplaneConstraintCmd: "junta",
  JointAsBuiltCmd: "comoEsta",
  AsBuiltConstraintCmd: "comoEsta",
  FusionMoveJointsCommand: "movimento",
  FusionMotionStudyCommand: "movimento",
  FusionMotionRelationshipCommand: "vinculo",
  FusionImportCommandFromToolbar: "inserir",
  JointOrigin: "origem",
  FusionDuplicateWithJointsCommand: "duplicar",
  ContactSetCmd: "novoContato",
  EnableContactSetsCmd: "contatoConjuntos",
  EnableAllContactCmd: "contatoTodos",
  DisableAllContactCmd: "contatoDesligado",
  SnapshotCmd: "capturar",
  SnapshotEditAccept: "capturar",
  AsBuiltPositionsCmd: "reverter",
  SnapshotEditCancel: "reverter",
};

let ativo: ((itens: ItemSelecionado[]) => void) | null = null;
export function selecaoMudouMontagem(itens: ItemSelecionado[]) {
  ativo?.(itens);
}

export function comandoComponente(projeto: Projeto, selecao: Selecao, grupo: boolean, avisar: (t: string) => void) {
  const nomes = [...new Set(selecao.itens().map((i) => i.corpo))];
  if (!nomes.length) return avisar("Escolha os corpos (clique nos corpos ou no Navegador) e depois o comando.");
  projeto.adicionar({ id: crypto.randomUUID(), tipo: "componente", nome: projeto.proximoNome(grupo ? "GrupoRígido" : "Componente"), modo: "novo", params: {}, corpos: nomes });
  selecao.limpar();
  avisar(`${grupo ? "Grupo rígido" : "Componente"} criado com ${nomes.join(", ")}.`);
}

const TIPOS: [string, string][] = [
  ["rigida", "Rígida"],
  ["giratoria", "Giratória"],
  ["deslizante", "Deslizante"],
  ["cilindrica", "Cilíndrica"],
  ["esferica", "Esférica"],
  ["planar", "Planar"],
];

export function comandoJunta(raiz: HTMLElement, projeto: Projeto, selecao: Selecao, comoEsta: boolean, existente?: Operacao) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Junta");
  let refs = existente?.referencias ?? [];
  let ultimo = { params: existente?.params ?? {}, opcoes: existente?.opcoes ?? { comoEsta: comoEsta ? "sim" : "nao" } } as {
    params: Record<string, number>;
    opcoes: Record<string, string>;
  };
  const prioridadeAntes: Prioridade = selecao.prioridade();
  if (!existente) {
    selecao.definirPrioridade("livre");
    selecao.definirSempreSomar(true);
  }
  // Origens da junta que vêm antes desta junta na linha do tempo.
  const h = projeto.estado.historico;
  const fim = existente ? h.indexOf(existente) : h.length;
  const origens = h.slice(0, fim).filter((o) => o.tipo === "origemJunta" && !o.suprimida && o.referencias?.length);
  let cliques: Operacao["referencias"] & object = [];
  if (existente) cliques = refs.slice();
  const origemDe = (chave: string) => origens.find((o) => o.id === ultimo.opcoes[chave]);
  // 1ª = o que anda, 2ª = o que fica. Uma Origem escolhida na lista toma o lugar do clique.
  const calcular = () => {
    const oa = origemDe("origemA"), ob = origemDe("origemB");
    const lista = cliques.slice();
    const a = oa ? oa.referencias![0] : lista.shift();
    const b = ob ? ob.referencias![0] : lista.find((r) => r.corpo !== a?.corpo);
    refs = [a, b].filter((r): r is NonNullable<typeof r> => !!r);
  };
  const texto = () =>
    refs.length === 0
      ? "1º: clique no componente que anda"
      : refs.length === 1
        ? `1º: ${refs[0].corpo} · 2º: clique no componente fixo`
        : `${refs[0].corpo} → ${refs[1].corpo}`;
  const montar = (): Operacao => ({
    id,
    tipo: "junta",
    nome,
    modo: "novo",
    params: ultimo.params,
    opcoes: { ...ultimo.opcoes, comoEsta: existente?.opcoes?.comoEsta ?? (comoEsta ? "sim" : "nao") },
    referencias: refs.slice(0, 2),
    suprimida: existente?.suprimida,
  });
  const mostrarPrevia = () => projeto.previsualizar(refs.length >= 2 ? montar() : null);
  const fechar = () => {
    ativo = null;
    selecao.definirSempreSomar(false);
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  let dialogo: Dialogo | undefined;
  dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : comoEsta ? "Junta como está" : "Junta",
    campos: [
      { chave: "angulo", rotulo: "Ângulo", valor: existente?.params.angulo ?? 0, unidade: "°" },
      { chave: "distancia", rotulo: "Distância", valor: existente?.params.distancia ?? 0 },
      { chave: "afastamento", rotulo: "Afastamento", valor: existente?.params.afastamento ?? 0 },
    ],
    escolhas: [
      { chave: "tipo", rotulo: "Tipo de junta", opcoes: TIPOS, valor: existente?.opcoes?.tipo ?? "rigida" },
      { chave: "inverter", rotulo: "Sentido", opcoes: [["nao", "De frente (encostar)"], ["sim", "Mesmo sentido"]], valor: existente?.opcoes?.inverter ?? "nao" },
      ...(origens.length
        ? (["origemA", "origemB"] as const).map((chave) => ({
            chave,
            rotulo: chave === "origemA" ? "Origem do que anda" : "Origem do fixo",
            opcoes: [["", "O clique"], ...origens.map((o) => [o.id, `${o.nome} (${o.referencias![0].corpo})`])] as [string, string][],
            valor: existente?.opcoes?.[chave] ?? "",
          }))
        : []),
    ],
    modo: "novo",
    semModo: true,
    selecao: texto(),
    rotuloSelecao: "Escolhas",
    aoMudar: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      calcular();
      dialogo?.definirSelecao(texto());
      mostrarPrevia();
    },
    aoOK: (params, _m, opcoes) => {
      ultimo = { params, opcoes };
      calcular();
      fechar();
      if (refs.length < 2) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar());
      else projeto.adicionar(montar());
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });
  if (existente) return;
  ativo = (itens) => {
    // Face ou aresta, uma em cada corpo (a 1ª anda, a 2ª fica).
    const validos = itens.filter((i) => i.tipo !== "corpo");
    const lista: typeof refs = [];
    for (const i of validos) {
      if (lista.length === 0) lista.push({ corpo: i.corpo, tipo: i.tipo as "face" | "aresta", indice: i.indice });
      else if (i.corpo !== lista[0].corpo) {
        lista[1] = { corpo: i.corpo, tipo: i.tipo as "face" | "aresta", indice: i.indice };
      }
    }
    cliques = lista;
    calcular();
    dialogo?.definirSelecao(texto());
    mostrarPrevia();
  };
}

// Juntas de unidade / Estudo de movimento: escolhe a junta e o valor; "animar"
// passa por vários valores até o escolhido. Com o contato ligado, o movimento
// vai em passos do valor de agora até o pedido e para onde os corpos se
// encostam (ver ateContato).
export function comandoMovimento(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const juntas = projeto.estado.historico.filter((o) => o.tipo === "junta" && !o.suprimida);
  if (!juntas.length) return avisar("Ainda não há juntas no projeto.");
  let animando = 0;
  const op = (idJunta: string) => juntas.find((j) => j.id === idJunta)!;
  const contato = contatoLigado(projeto);
  abrirDialogo(raiz, {
    titulo: contato ? "Juntas de unidade / Movimento (contato ligado)" : "Juntas de unidade / Movimento",
    campos: [
      { chave: "valor", rotulo: "Valor (° ou mm)", valor: 90, unidade: "" },
      { chave: "passos", rotulo: "Quadros da animação", valor: 12, unidade: "" },
    ],
    escolhas: [
      { chave: "junta", rotulo: "Junta", opcoes: juntas.map((j) => [j.id, `${j.nome} (${j.opcoes?.tipo ?? "rigida"})`] as [string, string]), valor: juntas[0].id },
      { chave: "animar", rotulo: "Animar", opcoes: [["nao", "Não (só mostra o valor)"], ["sim", "Sim (do 0 até o valor)"]], valor: "nao" },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: (v, _m, esc) => {
      const j = op(esc.junta);
      const k = chaveValor(j);
      const meu = ++animando;
      if (contato) {
        avisar("Conferindo o contato…");
        return void ateContato(projeto, j, v.valor, v.passos, () => meu !== animando).then((r) => {
          if (meu !== animando) return;
          projeto.previsualizar({ ...j, params: { ...j.params, [k]: r.valor } });
          avisar(r.batida ? `Contato: ${r.batida} — parou em ${fmt(r.valor)}` : `Sem contato até ${fmt(r.valor)}`);
        });
      }
      if (esc.animar !== "sim") return projeto.previsualizar({ ...j, params: { ...j.params, [k]: v.valor } });
      // Animação: um quadro de cada vez, esperando o recálculo do anterior.
      const n = Math.max(2, Math.min(120, Math.round(v.passos || 12)));
      let i = 0;
      const quadro = () => {
        if (meu !== animando || i > n) return;
        projeto.previsualizar({ ...j, params: { ...j.params, [k]: (v.valor * i) / n } });
        i++;
        const esperar = () => (projeto.estado.calculando ? setTimeout(esperar, 30) : setTimeout(quadro, 60));
        setTimeout(esperar, 30);
      };
      quadro();
    },
    aoOK: (v, _m, esc) => {
      const meu = ++animando;
      const j = op(esc.junta);
      if (!contato) return projeto.substituir({ ...j, params: { ...j.params, [chaveValor(j)]: v.valor } });
      void ateContato(projeto, j, v.valor, v.passos, () => meu !== animando).then((r) => {
        projeto.substituir({ ...j, params: { ...j.params, [chaveValor(j)]: r.valor } });
        if (r.batida) avisar(`Contato: ${r.batida} — a junta ficou em ${fmt(r.valor)}`);
      });
    },
    aoCancelar: () => {
      animando++;
      projeto.previsualizar(null);
    },
  });
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const chaveValor = (j: Operacao) => (j.opcoes?.tipo === "deslizante" || j.opcoes?.tipo === "planar" ? "distancia" : "angulo");

// ---- Conjuntos de contato ----
// Ficam numa operação "contatos" fora da linha do tempo: opcoes.modo =
// "conjuntos" | "todos" | "desligado"; opcoes.c1, c2... = corpos de cada conjunto
// separados por vírgula.

function opContatos(projeto: Projeto): Operacao | undefined {
  return projeto.estado.historico.find((o) => o.tipo === "contatos");
}
function conjuntosContato(projeto: Projeto): string[][] {
  const o = opContatos(projeto);
  return Object.entries(o?.opcoes ?? {})
    .filter(([k]) => /^c\d+$/.test(k))
    .map(([, v]) => v.split(",").filter(Boolean));
}
function contatoLigado(projeto: Projeto): boolean {
  const modo = opContatos(projeto)?.opcoes?.modo ?? "desligado";
  return modo === "todos" || (modo === "conjuntos" && conjuntosContato(projeto).length > 0);
}
function gravarContatos(projeto: Projeto, opcoes: Record<string, string>) {
  const atual = opContatos(projeto);
  projeto.substituirVarias([{ id: atual?.id ?? "contatos", tipo: "contatos", nome: "Contatos", modo: "novo", params: {}, opcoes }]);
}

export function comandoContato(projeto: Projeto, selecao: Selecao, tipo: string, avisar: (t: string) => void) {
  definirContato(projeto, tipo, [...new Set(selecao.itens().map((i) => i.corpo))], avisar);
  if (tipo === "novoContato") selecao.limpar();
}

// Também usado pela ponte da IA (nomes = corpos do conjunto novo).
export function definirContato(projeto: Projeto, tipo: string, nomes: string[], avisar: (t: string) => void) {
  const opcoes = { ...(opContatos(projeto)?.opcoes ?? { modo: "desligado" }) };
  if (tipo === "novoContato") {
    if (nomes.length < 2) return avisar("Escolha 2 ou mais corpos (clique neles) e depois Novo conjunto de contatos.");
    let n = 1;
    while (opcoes[`c${n}`]) n++;
    opcoes[`c${n}`] = nomes.join(",");
    opcoes.modo = "conjuntos";
    gravarContatos(projeto, opcoes);
    return avisar(`Conjunto de contato ${n}: ${nomes.join(", ")}. Contato ligado para os conjuntos.`);
  }
  const modo = tipo === "contatoTodos" ? "todos" : tipo === "contatoConjuntos" ? "conjuntos" : "desligado";
  if (modo === "conjuntos" && !conjuntosContato(projeto).length) return avisar("Ainda não há conjuntos de contato: escolha os corpos e use Novo conjunto de contatos.");
  opcoes.modo = modo;
  gravarContatos(projeto, opcoes);
  avisar(modo === "todos" ? "Contato ligado entre todos os corpos." : modo === "conjuntos" ? "Contato ligado só para os conjuntos." : "Contato desligado.");
}

// Pares de corpos que se sobrepõem (texto "A × B"), na versão do histórico dada.
async function paresSobrepostos(projeto: Projeto, historico: Operacao[]): Promise<Set<string>> {
  const modo = opContatos(projeto)?.opcoes?.modo;
  const grupos = modo === "todos" ? [[] as string[]] : conjuntosContato(projeto);
  const pares = new Set<string>();
  for (const g of grupos) {
    try {
      for (const l of await projeto.interferencia(g, historico)) {
        const m = l.match(/^(.+?) × (.+?):/);
        if (m) pares.add(`${m[1]} × ${m[2]}`);
      }
    } catch {
      // conjunto com menos de 2 corpos que ainda existem: nada a conferir
    }
  }
  return pares;
}

// Anda a junta do valor de agora até "alvo" em passos; no 1º passo em que
// aparece uma sobreposição nova, procura (metade por metade) o ponto em que os
// corpos se encostam. Sobreposições que já existiam antes não contam.
async function ateContato(projeto: Projeto, j: Operacao, alvo: number, passos: number, cancelado: () => boolean): Promise<{ valor: number; batida?: string }> {
  const k = chaveValor(j);
  const comValor = (v: number) => projeto.estado.historico.map((o) => (o.id === j.id ? { ...j, params: { ...j.params, [k]: v } } : o));
  const de = j.params[k] ?? 0;
  const antes = await paresSobrepostos(projeto, comValor(de));
  const novo = async (v: number) => [...(await paresSobrepostos(projeto, comValor(v)))].find((p) => !antes.has(p));
  const n = Math.max(2, Math.min(60, Math.round(passos || 12)));
  let livre = de;
  for (let i = 1; i <= n; i++) {
    if (cancelado()) return { valor: livre };
    const v = de + ((alvo - de) * i) / n;
    const batida = await novo(v);
    if (!batida) {
      livre = v;
      continue;
    }
    let bate = v;
    for (let r = 0; r < 20; r++) {
      const meio = (livre + bate) / 2;
      if (await novo(meio)) bate = meio;
      else livre = meio;
    }
    return { valor: Math.round(livre * 1000) / 1000, batida };
  }
  return { valor: alvo };
}

// ---- Capturar / Reverter posição ----
// A posição capturada fica numa operação "posicao" fora da linha do tempo:
// params["<id da junta>|angulo"] e params["<id>|distancia"].

export function comandoPosicao(projeto: Projeto, capturar: boolean, avisar: (t: string) => void) {
  const h = projeto.estado.historico;
  const juntas = h.filter((o) => o.tipo === "junta");
  if (!juntas.length) return avisar("Ainda não há juntas no projeto.");
  const atual = h.find((o) => o.tipo === "posicao");
  if (capturar) {
    const params: Record<string, number> = {};
    for (const j of juntas) {
      params[`${j.id}|angulo`] = j.params.angulo ?? 0;
      params[`${j.id}|distancia`] = j.params.distancia ?? 0;
    }
    projeto.substituirVarias([{ id: atual?.id ?? "posicao", tipo: "posicao", nome: "Posição", modo: "novo", params }]);
    return avisar(`Posição capturada (${juntas.length} junta(s)).`);
  }
  const salvo = atual?.params ?? {};
  const mudadas = juntas
    .map((j): Operacao | null => {
      const angulo = salvo[`${j.id}|angulo`] ?? 0, distancia = salvo[`${j.id}|distancia`] ?? 0;
      if ((j.params.angulo ?? 0) === angulo && (j.params.distancia ?? 0) === distancia) return null;
      return { ...j, params: { ...j.params, angulo, distancia } };
    })
    .filter((j): j is Operacao => !!j);
  if (!mudadas.length) return avisar(atual ? "As juntas já estão na posição capturada." : "As juntas já estão como construídas (zero).");
  projeto.substituirVarias(mudadas);
  avisar(atual ? `Voltou à posição capturada (${mudadas.length} junta(s)).` : `Voltou à posição construída (${mudadas.length} junta(s) em zero).`);
}

// ---- Origem da junta ----
// Clique numa face ou aresta; o ponto é o mesmo que a junta usaria (centro da
// face plana, meio do eixo do cilindro, centro do círculo...), mais X/Y/Z.

export function comandoOrigemJunta(raiz: HTMLElement, projeto: Projeto, selecao: Selecao, avisar: (t: string) => void) {
  const id = crypto.randomUUID();
  const nome = projeto.proximoNome("OrigemJunta");
  const prioridadeAntes: Prioridade = selecao.prioridade();
  selecao.definirPrioridade("livre");
  let ref: { corpo: string; tipo: "face" | "aresta"; indice: number } | null = null;
  let base: { p: V3; z: V3 } | null = null;
  let d = { dx: 0, dy: 0, dz: 0 };
  const texto = () => (ref ? `${ref.corpo}: ${ref.tipo} ${ref.indice + 1}` : "Clique numa face ou aresta");
  const montar = (): Operacao => {
    const p: V3 = base ? [base.p[0] + d.dx, base.p[1] + d.dy, base.p[2] + d.dz] : [0, 0, 0];
    return {
      id,
      tipo: "origemJunta",
      nome,
      modo: "novo",
      params: { ...d },
      referencias: ref ? [ref] : [],
      pontoConstrucao: p,
      eixoConstrucao: { origem: p, direcao: base?.z ?? [0, 1, 0] },
    };
  };
  const fechar = () => {
    ativo = null;
    selecao.definirPrioridade(prioridadeAntes);
    selecao.limpar();
  };
  const dialogo = abrirDialogo(raiz, {
    titulo: "Origem da junta",
    campos: [
      { chave: "dx", rotulo: "Deslocar X", valor: 0 },
      { chave: "dy", rotulo: "Deslocar Y", valor: 0 },
      { chave: "dz", rotulo: "Deslocar Z", valor: 0 },
    ],
    modo: "novo",
    semModo: true,
    selecao: texto(),
    rotuloSelecao: "Face/aresta",
    aoMudar: (v) => {
      d = { dx: v.dx, dy: v.dy, dz: v.dz };
      if (ref) projeto.previsualizar(montar());
    },
    aoOK: (v) => {
      d = { dx: v.dx, dy: v.dy, dz: v.dz };
      fechar();
      projeto.previsualizar(null);
      if (!ref || !base) return avisar("Origem da junta: nenhuma face/aresta escolhida.");
      projeto.adicionar(montar());
      avisar(`${nome} criada em ${ref.corpo}. Use na Junta (lista "Origem do que anda / do fixo").`);
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });
  ativo = (itens) => {
    const i = itens.filter((x) => x.tipo === "face" || x.tipo === "aresta").pop();
    if (!i) return;
    const escolhido = { corpo: i.corpo, tipo: i.tipo as "face" | "aresta", indice: i.indice };
    projeto.origemJunta(escolhido).then(
      (o) => {
        ref = escolhido;
        base = o;
        dialogo.definirSelecao(texto());
        projeto.previsualizar(montar());
      },
      (e) => avisar(e instanceof Error ? e.message : String(e)),
    );
  };
}

// ---- Duplicar com juntas ----
// Escolha um corpo do componente. A cópia ganha nomes "<corpo>_2" (ou _3...) e
// cada junta em que o componente anda é copiada para a cópia (mesmo lugar, como
// no Fusion: edite a junta nova para mudar o lugar).

export function comandoDuplicarJuntas(projeto: Projeto, selecao: Selecao, avisar: (t: string) => void) {
  const corpo = selecao.itens()[0]?.corpo;
  if (!corpo) return avisar("Escolha um corpo do componente (clique nele) e depois Duplicar com juntas.");
  duplicarComJuntas(projeto, corpo, avisar);
  selecao.limpar();
}

// Também usado pela ponte da IA. Devolve os nomes da cópia.
export function duplicarComJuntas(projeto: Projeto, corpo: string, avisar: (t: string) => void): string[] {
  const h = projeto.estado.historico;
  // Componente do corpo: o último Novo componente/Grupo rígido/Duplicar que o tem.
  const comp = [...h].reverse().find((o) => !o.suprimida && (o.tipo === "componente" || o.tipo === "duplicarJuntas") && nomesDoComponente(o).includes(corpo));
  const grupo = comp ? nomesDoComponente(comp) : [corpo];
  const existentes = new Set([...projeto.estado.corposBase.map((c) => c.nome), ...h.flatMap((o) => nomesDoComponente(o))]);
  const nomeLivre = (n: string) => {
    let k = 2;
    while (existentes.has(`${n}_${k}`)) k++;
    existentes.add(`${n}_${k}`);
    return `${n}_${k}`;
  };
  const novos = grupo.map(nomeLivre);
  const troca = new Map(grupo.map((n, i) => [n, novos[i]]));
  const dup: Operacao = { id: crypto.randomUUID(), tipo: "duplicarJuntas", nome: projeto.proximoNome("Duplicar"), modo: "novo", params: {}, corpos: grupo, opcoes: { nomes: novos.join(",") } };
  // Juntas em que o componente anda (1ª escolha): copiadas para a cópia.
  let nJunta = 1;
  const proximaJunta = () => {
    while (h.some((o) => o.nome === `Junta${nJunta}`)) nJunta++;
    return `Junta${nJunta++}`;
  };
  const juntas = h
    .filter((o) => o.tipo === "junta" && !o.suprimida && o.referencias?.[0] && grupo.includes(origemOuRef(h, o, "origemA").corpo))
    .map((o): Operacao => {
      const ra = origemOuRef(h, o, "origemA");
      const opcoes = { ...(o.opcoes ?? {}) };
      delete opcoes.origemA; // a Origem fica no corpo original; a cópia usa a mesma face/aresta
      const copia: Operacao = { ...o, id: crypto.randomUUID(), nome: proximaJunta(), opcoes, referencias: [{ ...ra, corpo: troca.get(ra.corpo)! }, ...o.referencias!.slice(1)] };
      // "Como está" anda a partir de onde o corpo está: a cópia já nasce no lugar
      // do original, então começa do zero (senão andaria duas vezes).
      if (o.opcoes?.comoEsta === "sim") copia.params = { ...o.params, angulo: 0, distancia: 0 };
      delete copia.expressoes;
      return copia;
    });
  projeto.substituirVarias([dup, ...juntas]);
  avisar(`Cópia: ${novos.join(", ")}${juntas.length ? ` com ${juntas.map((j) => j.nome).join(", ")} (edite a junta para mudar o lugar)` : " (o componente não tinha juntas)"}.`);
  return novos;
}

// Muda o valor de uma junta respeitando o contato (ponte da IA).
export async function moverJunta(projeto: Projeto, nome: string, valor: number): Promise<{ valor: number; batida?: string }> {
  const j = projeto.estado.historico.find((o) => o.tipo === "junta" && o.nome === nome);
  if (!j) throw new Error(`${nome} não é uma junta`);
  const r = contatoLigado(projeto) ? await ateContato(projeto, j, valor, 24, () => false) : { valor };
  projeto.substituir({ ...j, params: { ...j.params, [chaveValor(j)]: r.valor } });
  return r;
}

function nomesDoComponente(o: Operacao): string[] {
  if (o.tipo === "componente") return o.corpos ?? [];
  if (o.tipo === "duplicarJuntas") return (o.opcoes?.nomes ?? "").split(",").filter(Boolean);
  return [];
}

// 1ª escolha de uma junta: a Origem da junta escolhida ou o clique.
function origemOuRef(h: Operacao[], j: Operacao, chave: "origemA" | "origemB") {
  const id = j.opcoes?.[chave];
  const o = id ? h.find((x) => x.id === id) : undefined;
  return o?.referencias?.[0] ?? j.referencias![chave === "origemA" ? 0 : 1];
}

// Vínculo de movimento: a junta que segue ganha uma expressão com o valor da
// junta mestre. Ela precisa vir depois da mestre na linha do tempo (as medidas
// só valem para as operações seguintes). Relação 0 desfaz o vínculo.
// Diferenças do Fusion: não dá para escolher "inverter" nem amarrar o
// deslizamento ao giro por "uma volta = X mm" (use a relação: mm por grau).
export function comandoVinculo(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const h = projeto.estado.historico;
  const juntas = h.filter((o) => o.tipo === "junta" && !o.suprimida && o.opcoes?.tipo && o.opcoes.tipo !== "rigida");
  if (juntas.length < 2) return avisar("O vínculo precisa de duas juntas que se mexem (giratória, deslizante...).");
  const chave = (j: Operacao) => (j.opcoes?.tipo === "deslizante" || j.opcoes?.tipo === "planar" ? "distancia" : "angulo");
  const opcoes = juntas.map((j) => [j.id, `${j.nome} (${j.opcoes?.tipo})`] as [string, string]);
  abrirDialogo(raiz, {
    titulo: "Vínculo de movimento",
    campos: [
      { chave: "relacao", rotulo: "Relação (segue = mestre ×)", valor: 1, unidade: "" },
      { chave: "deslocamento", rotulo: "Deslocamento", valor: 0, unidade: "" },
    ],
    escolhas: [
      { chave: "mestre", rotulo: "Junta mestre", opcoes, valor: juntas[0].id },
      { chave: "segue", rotulo: "Junta que segue", opcoes, valor: juntas[1].id },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: () => {},
    aoOK: (v, _m, esc) => {
      const mestre = juntas.find((j) => j.id === esc.mestre)!, segue = juntas.find((j) => j.id === esc.segue)!;
      if (mestre === segue) return avisar("Escolha duas juntas diferentes.");
      if (h.indexOf(segue) < h.indexOf(mestre)) return avisar(`${segue.nome} vem antes de ${mestre.nome} na linha do tempo: troque as duas (a mestre precisa vir antes).`);
      if (/\s/.test(mestre.nome)) return avisar(`Renomeie ${mestre.nome} sem espaços para usar no vínculo.`);
      const k = chave(segue);
      const expressoes = { ...(segue.expressoes ?? {}) };
      if (v.relacao === 0) delete expressoes[k];
      else expressoes[k] = `${mestre.nome}.${chave(mestre)} * ${v.relacao} + ${v.deslocamento}`;
      const novo: Operacao = { ...segue, expressoes };
      if (!Object.keys(expressoes).length) delete novo.expressoes;
      projeto.substituir(novo);
      avisar(v.relacao === 0 ? `Vínculo de ${segue.nome} desfeito.` : `${segue.nome} agora segue ${mestre.nome}.`);
    },
    aoCancelar: () => {},
  });
}

// Inserir componente: escolhe um STEP/STL e traz como corpo novo.
export function comandoInserirComponente(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = ".step,.stp,.stl";
  entrada.addEventListener("change", async () => {
    const arq = entrada.files?.[0];
    if (!arq) return;
    inserirArquivo(arq.name, new Uint8Array(await arq.arrayBuffer()), raiz, projeto, avisar);
  });
  entrada.click();
}

export function inserirArquivo(nomeArq: string, bytes: Uint8Array, raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const formato = /\.stl$/i.test(nomeArq) ? "stl" : "step";
  if (bytes.length > 30 * 1024 * 1024) return avisar("Arquivo grande demais (mais de 30 MB).");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const id = crypto.randomUUID();
  const nome = projeto.proximoNome("Importado");
  const montar = (p: Record<string, number>, esc: Record<string, string>): Operacao => ({
    id,
    tipo: "importado",
    nome,
    modo: "novo",
    params: p,
    opcoes: esc,
    arquivo: { nome: nomeArq, formato, base64: btoa(bin) },
  });
  abrirDialogo(raiz, {
    titulo: `Inserir ${nomeArq}`,
    campos: [
      { chave: "x", rotulo: "Posição X", valor: 0 },
      { chave: "y", rotulo: "Posição Y", valor: 0 },
      { chave: "z", rotulo: "Posição Z", valor: 0 },
    ],
    escolhas: [{ chave: "zParaCima", rotulo: "O arquivo tem", opcoes: [["sim", "Z para cima (impressora/CAD)"], ["nao", "Y para cima"]], valor: "sim" }],
    modo: "novo",
    semModo: true,
    aoMudar: (p, _m, esc) => projeto.previsualizar(montar(p, esc)),
    aoOK: (p, _m, esc) => projeto.adicionar(montar(p, esc)),
    aoCancelar: () => projeto.previsualizar(null),
  });
}
