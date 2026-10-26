// Estado do projeto aberto: histórico, desfazer/refazer e ligação com o worker.
import type { ItemMedida, MalhaCorpo, OpcoesExportar, Operacao, RespostaNucleo } from "./tipos";
import { avaliar, ehNumeroSimples, valoresDosParametros, type Configuracao, type Parametro, type Regra } from "./parametros";
import { aplicarCota, valorCota, type V3 } from "./esboco";

export interface EstadoProjeto {
  historico: Operacao[];
  corpos: MalhaCorpo[];
  // Corpos sem a prévia do comando aberto. A seleção usa estes, para que as
  // arestas escolhidas tenham a numeração de antes da operação.
  corposBase: MalhaCorpo[];
  erros: Record<string, string>;
  calculando: boolean;
  nucleoPronto: boolean;
  ultimoCalculo?: { ms: number; reaproveitados: number; total: number };
}

type Ouvinte = (estado: EstadoProjeto) => void;

export class Projeto {
  estado: EstadoProjeto = {
    historico: [],
    corpos: [],
    corposBase: [],
    erros: {},
    calculando: false,
    nucleoPronto: false,
  };
  private desfazer: Operacao[][] = [];
  private refazer: Operacao[][] = [];
  private versao = 0;
  private versaoSemPrevia = -1;
  private ouvintes: Ouvinte[] = [];
  private worker = new Worker(new URL("./nucleo.worker.ts", import.meta.url), { type: "module" });

  constructor(private avisar: (texto: string) => void) {
    this.worker.onmessage = (e: MessageEvent<RespostaNucleo>) => {
      const r = e.data;
      if (r.tipo === "medido") {
        const espera = this.medicoes.get(r.pedido);
        this.medicoes.delete(r.pedido);
        if (r.linhas) espera?.ok(r.linhas);
        else espera?.falha(new Error(r.erro ?? "Falha ao medir"));
        return;
      }
      if (r.tipo === "exportado") {
        const espera = this.exportacoes.get(r.pedido);
        this.exportacoes.delete(r.pedido);
        this.avisoExportacao = r.aviso;
        if (r.dados) espera?.ok(r.dados);
        else espera?.falha(new Error(r.erro ?? "Falha ao exportar"));
        return;
      }
      if (r.tipo === "pronto") {
        this.estado.nucleoPronto = true;
        this.avisar(`Núcleo geométrico carregado em ${r.segundos.toFixed(1)} s`);
      } else if (r.tipo === "resultado") {
        if (r.versao !== this.versao) return; // chegou um resultado antigo
        this.estado.corpos = r.corpos;
        if (r.versao === this.versaoSemPrevia) this.estado.corposBase = r.corpos;
        this.estado.erros = { ...r.erros, ...this.errosParametros };
        this.estado.ultimoCalculo = { ms: r.ms ?? 0, reaproveitados: r.reaproveitados ?? 0, total: this.estado.historico.length };
        this.estado.calculando = false;
      } else {
        this.estado.calculando = false;
        this.avisar(`Erro no núcleo: ${r.mensagem}`);
      }
      this.avisarOuvintes();
    };
  }

  aoMudar(fn: Ouvinte) {
    this.ouvintes.push(fn);
    fn(this.estado);
  }

  private avisarOuvintes() {
    this.ouvintes.forEach((fn) => fn(this.estado));
    if (!this.estado.calculando && this.esperando.length) this.esperando.splice(0).forEach((ok) => ok());
  }

  // Promessa que termina quando o cálculo acabar. Não usa relógio: funciona
  // mesmo com a aba em segundo plano (o navegador atrasa os relógios dela).
  private esperando: (() => void)[] = [];
  quandoCalculado(): Promise<void> {
    if (!this.estado.calculando) return Promise.resolve();
    return new Promise((ok) => this.esperando.push(ok));
  }

  // Operação mostrada enquanto a janela do comando está aberta (prévia).
  // Ela não entra no histórico nem no desfazer.
  private previa: Operacao | null = null;

  private enviar() {
    const lista = this.previa
      ? this.estado.historico.some((o) => o.id === this.previa!.id)
        ? this.estado.historico.map((o) => (o.id === this.previa!.id ? this.previa! : o))
        : [...this.estado.historico, this.previa]
      : this.estado.historico;
    this.estado.calculando = true;
    this.versao += 1;
    if (!this.previa) this.versaoSemPrevia = this.versao;
    this.worker.postMessage({ tipo: "recalcular", historico: this.resolvido(lista), versao: this.versao, doZero: this.doZero });
    this.doZero = false;
    this.avisarOuvintes();
  }

  private doZero = false;
  // "Calcular todos": refaz o histórico inteiro, sem aproveitar a memória.
  calcularTudo() {
    this.doZero = true;
    this.enviar();
  }

  // Lista de materiais (uma linha JSON por corpo).
  async listaMateriais(): Promise<Record<string, unknown>[]> {
    const pedido = this.proximoPedido++;
    const linhas = await new Promise<string[]>((ok, falha) => {
      this.medicoes.set(pedido, { ok, falha });
      this.worker.postMessage({ tipo: "listaMateriais", historico: this.resolvido(this.estado.historico), pedido });
    });
    return linhas.map((l) => JSON.parse(l));
  }

  // Operação mostrada na prévia agora (ex.: para desenhar o plano de deslocamento).
  operacaoEmPrevia(): Operacao | null {
    return this.previa;
  }

  previsualizar(op: Operacao | null) {
    this.previa = op && this.complementar(op);
    this.enviar();
  }

  private trocarHistorico(novo: Operacao[], guardar = true) {
    if (guardar) {
      this.desfazer.push(this.estado.historico);
      this.refazer = [];
    }
    this.estado.historico = novo;
    this.previa = null;
    this.enviar();
  }

  // Próximo nome livre: Caixa1, Caixa2...
  proximoNome(base: string): string {
    let n = 1;
    while (this.estado.historico.some((o) => o.nome === `${base}${n}`)) n += 1;
    return `${base}${n}`;
  }

  adicionar(op: Operacao) {
    op = this.complementar(op);
    this.trocarHistorico([...this.estado.historico, op]);
  }

  substituir(op: Operacao) {
    op = this.complementar(op);
    this.trocarHistorico(this.estado.historico.map((o) => (o.id === op.id ? op : o)));
  }

  // Troca várias operações de uma vez (um passo só no desfazer). As que ainda
  // não estão no histórico entram no fim.
  substituirVarias(ops: Operacao[]) {
    const porId = new Map(ops.map((o) => [o.id, o]));
    const novo = this.estado.historico.map((o) => porId.get(o.id) ?? o);
    for (const o of ops) if (!this.estado.historico.some((x) => x.id === o.id)) novo.push(o);
    this.trocarHistorico(novo);
  }

  // ---- Parâmetros do usuário e expressões ----

  // A tela usa isto para juntar à operação as expressões digitadas na janela
  // aberta (ver ui/dialogo.ts). Sem janela, devolve a operação como veio.
  complementar: (op: Operacao) => Operacao = (op) => op;

  private errosParametros: Record<string, string> = {};

  parametros(): Parametro[] {
    return this.estado.historico.find((o) => o.tipo === "parametros")?.parametros ?? [];
  }

  // Parâmetros do usuário + medidas do modelo (Caixa1.altura, Esboço1.d2...).
  valoresParametros(): { valores: Map<string, number>; erros: Record<string, string> } {
    const r = valoresDosParametros(this.parametros(), this.regras());
    for (const [k, v] of this.valoresModelo) if (!r.valores.has(k)) r.valores.set(k, v);
    return r;
  }
  private valoresModelo = new Map<string, number>();
  // Só as medidas das operações que vêm antes desta (não dá para usar uma posterior).
  private valoresAntesDe(id: string): Map<string, number> {
    const h = this.estado.historico;
    const antes = new Set(h.slice(0, Math.max(0, h.findIndex((o) => o.id === id))).map((o) => o.nome));
    const r = valoresDosParametros(this.parametros(), this.regras()).valores;
    for (const [k, v] of this.valoresModelo) if (antes.has(k.slice(0, k.lastIndexOf(".")))) r.set(k, v);
    return r;
  }

  // Troca a lista inteira de parâmetros (entra no desfazer, como no Fusion).
  // "renomeio" = [antigo, novo]: troca o nome também em todas as expressões.
  definirParametros(lista: Parametro[], renomeio?: [string, string], extra?: { configuracoes?: Configuracao[]; configuracaoAtiva?: string | null; regras?: Regra[] }) {
    let h = this.estado.historico;
    const anterior = h.find((o) => o.tipo === "parametros");
    let configuracoes = extra?.configuracoes ?? anterior?.configuracoes ?? [];
    let ativa = extra?.configuracaoAtiva === null ? undefined : (extra?.configuracaoAtiva ?? anterior?.configuracaoAtiva);
    if (renomeio)
      configuracoes = configuracoes.map((c) => ({
        ...c,
        valores: Object.fromEntries(Object.entries(c.valores).map(([k, v]) => [k === renomeio[0] ? renomeio[1] : k, v])),
      }));
    // Mudou um parâmetro à mão para outro valor: a configuração deixa de estar ativa.
    const conf = configuracoes.find((c) => c.nome === ativa);
    if (conf && !extra && lista.some((p) => conf.valores[p.nome] !== undefined && conf.valores[p.nome] !== p.expressao)) ativa = undefined;
    if (renomeio) {
      const re = new RegExp(`\\b${renomeio[0]}\\b`, "g");
      const trocar = (t: string) => t.replace(re, renomeio[1]);
      lista = lista.map((p) => ({ ...p, expressao: trocar(p.expressao) }));
      h = h.map((op) => {
        let novo = op;
        if (op.expressoes) novo = { ...novo, expressoes: Object.fromEntries(Object.entries(op.expressoes).map(([k, t]) => [k, trocar(t)])) };
        if (op.esboco?.cotas.some((c) => c.expressao))
          novo = { ...novo, esboco: { ...op.esboco, cotas: op.esboco.cotas.map((c) => (c.expressao ? { ...c, expressao: trocar(c.expressao) } : c)) } };
        return novo;
      });
    }
    const atual = h.find((o) => o.tipo === "parametros");
    const op: Operacao = { id: atual?.id ?? "parametros", tipo: "parametros", nome: "Parâmetros", modo: "novo", params: {}, parametros: lista };
    if (configuracoes.length) op.configuracoes = configuracoes;
    if (ativa && configuracoes.some((c) => c.nome === ativa)) op.configuracaoAtiva = ativa;
    const regras = extra?.regras ?? anterior?.regras ?? [];
    if (regras.length) op.regras = regras;
    // Grava os resultados novos nas operações (medidas e esboços já resolvidos),
    // para que editar um esboço mostre a forma de agora.
    this.trocarHistorico(this.resolvido(atual ? h.map((o) => (o === atual ? op : o)) : [op, ...h]));
  }

  // ---- Regras de configuração ----
  regras(): Regra[] {
    return this.estado.historico.find((o) => o.tipo === "parametros")?.regras ?? [];
  }
  definirRegras(regras: Regra[]) {
    this.definirParametros(this.parametros(), undefined, { regras });
  }

  // ---- Configurações (conjuntos de valores dos parâmetros) ----

  configuracoes(): Configuracao[] {
    return this.estado.historico.find((o) => o.tipo === "parametros")?.configuracoes ?? [];
  }
  configuracaoAtiva(): string | undefined {
    return this.estado.historico.find((o) => o.tipo === "parametros")?.configuracaoAtiva;
  }
  // Guarda os valores de agora como uma configuração (troca, se o nome já existe).
  salvarConfiguracao(nome: string) {
    const valores = Object.fromEntries(this.parametros().map((p) => [p.nome, p.expressao]));
    const lista = this.configuracoes().filter((c) => c.nome !== nome);
    const i = this.configuracoes().findIndex((c) => c.nome === nome);
    lista.splice(i < 0 ? lista.length : i, 0, { nome, valores });
    this.definirParametros(this.parametros(), undefined, { configuracoes: lista, configuracaoAtiva: nome });
  }
  ativarConfiguracao(nome: string) {
    const c = this.configuracoes().find((x) => x.nome === nome);
    if (!c) return;
    const lista = this.parametros().map((p) => (c.valores[p.nome] !== undefined ? { ...p, expressao: c.valores[p.nome] } : p));
    this.definirParametros(lista, undefined, { configuracaoAtiva: nome });
  }
  // Muda um valor de uma configuração; se ela estiver ativa, a peça muda junto.
  mudarConfiguracao(nome: string, parametro: string, expressao: string) {
    const lista = this.configuracoes().map((c) => (c.nome === nome ? { ...c, valores: { ...c.valores, [parametro]: expressao } } : c));
    const ativa = this.configuracaoAtiva() === nome;
    const params = ativa ? this.parametros().map((p) => (p.nome === parametro ? { ...p, expressao } : p)) : this.parametros();
    this.definirParametros(params, undefined, { configuracoes: lista });
  }
  apagarConfiguracao(nome: string) {
    const ativa = this.configuracaoAtiva() === nome ? null : undefined;
    this.definirParametros(this.parametros(), undefined, { configuracoes: this.configuracoes().filter((c) => c.nome !== nome), configuracaoAtiva: ativa });
  }

  // Troca a medida de uma cota de esboço (número ou expressão) e resolve o esboço.
  mudarCota(id: string, cotaId: number, texto: string) {
    const op = this.estado.historico.find((o) => o.id === id);
    if (!op?.esboco) return;
    const esboco = structuredClone(op.esboco);
    const c = esboco.cotas.find((x) => x.id === cotaId);
    if (!c) return;
    const valor = avaliar(texto, this.valoresAntesDe(id));
    if (!aplicarCota(esboco, c, valor)) throw new Error("Essa medida briga com outras restrições ou cotas do esboço.");
    const k = esboco.cotas.find((x) => x.id === cotaId)!;
    if (ehNumeroSimples(texto)) delete k.expressao;
    else k.expressao = texto.trim();
    // Resolvido: quem usa esta medida (Esboço1.d2...) também fica com o valor novo.
    this.trocarHistorico(this.resolvido(this.estado.historico.map((o) => (o.id === id ? { ...op, esboco } : o))));
  }

  // Troca medidas e expressões de uma operação (janela Alterar parâmetros).
  mudarMedida(id: string, chave: string, texto: string) {
    const op = this.estado.historico.find((o) => o.id === id);
    if (!op) return;
    const expressoes = { ...(op.expressoes ?? {}) };
    const numero = ehNumeroSimples(texto);
    const valor = avaliar(texto, this.valoresAntesDe(id)); // dá erro se a expressão não serve
    if (numero) delete expressoes[chave];
    else expressoes[chave] = texto.trim();
    const novo: Operacao = { ...op, params: { ...op.params, [chave]: valor } };
    if (Object.keys(expressoes).length) novo.expressoes = expressoes;
    else delete novo.expressoes;
    this.trocarHistorico(this.resolvido(this.estado.historico.map((o) => (o.id === id ? novo : o))));
  }

  // Histórico com as expressões trocadas pelos números de agora. Esboços com
  // cotas em expressão são resolvidos de novo (a forma acompanha o parâmetro).
  private resolvido(lista: Operacao[]): Operacao[] {
    const { valores, erros } = valoresDosParametros(lista.find((o) => o.tipo === "parametros")?.parametros ?? [], lista.find((o) => o.tipo === "parametros")?.regras ?? []);
    this.errosParametros = {};
    const pOp = lista.find((o) => o.tipo === "parametros");
    const [primeiroErro] = Object.entries(erros);
    if (pOp && primeiroErro) this.errosParametros[pOp.id] = `${primeiroErro[0]}: ${primeiroErro[1]}`;
    const final = lista.map((op) => {
      let novo = op;
      if (op.expressoes && Object.keys(op.expressoes).length) {
        const params = { ...op.params };
        for (const [k, texto] of Object.entries(op.expressoes)) {
          try {
            params[k] = avaliar(texto, valores);
          } catch (e) {
            this.errosParametros[op.id] = `${k} = ${texto}: ${e instanceof Error ? e.message : e}`;
          }
        }
        novo = { ...op, params };
      }
      if (op.tipo === "esboco" && op.esboco?.cotas.some((c) => c.expressao)) {
        const esboco = structuredClone(op.esboco);
        for (const c of esboco.cotas) {
          if (!c.expressao) continue;
          try {
            const v = avaliar(c.expressao, valores);
            if (c.valor === undefined || Math.abs(v - c.valor) > 1e-9)
              if (!aplicarCota(esboco, c, v)) this.errosParametros[op.id] = `Cota ${c.expressao} = ${v}: briga com o resto do esboço`;
          } catch (e) {
            this.errosParametros[op.id] = `Cota ${c.expressao}: ${e instanceof Error ? e.message : e}`;
          }
        }
        novo = { ...novo, esboco };
      }
      // As medidas desta operação passam a valer para as seguintes.
      for (const [k, v] of Object.entries(novo.params)) if (Number.isFinite(v)) valores.set(`${novo.nome}.${k}`, v);
      if (novo.tipo === "esboco") for (const c of novo.esboco?.cotas ?? []) valores.set(`${novo.nome}.d${c.id}`, valorCota(novo.esboco!, c));
      return novo;
    });
    this.valoresModelo = new Map([...valores].filter(([k]) => k.includes(".")));
    return final;
  }

  // Troca o histórico inteiro (um passo no desfazer). Usado pela Operação base.
  carregarComDesfazer(historico: Operacao[]) {
    this.trocarHistorico(historico);
  }

  remover(id: string) {
    this.trocarHistorico(this.estado.historico.filter((o) => o.id !== id));
  }

  alternarSupressao(id: string) {
    this.trocarHistorico(
      this.estado.historico.map((o) => (o.id === id ? { ...o, suprimida: !o.suprimida } : o)),
    );
  }

  desfazerUltimo() {
    const anterior = this.desfazer.pop();
    if (!anterior) return;
    this.refazer.push(this.estado.historico);
    this.trocarHistorico(anterior, false);
  }

  refazerUltimo() {
    const proximo = this.refazer.pop();
    if (!proximo) return;
    this.desfazer.push(this.estado.historico);
    this.trocarHistorico(proximo, false);
  }

  // ---- Exportar ----

  // Aviso da última exportação (ex.: "não cabe na mesa"), ou undefined.
  avisoExportacao: string | undefined;
  private exportacoes = new Map<number, { ok: (d: ArrayBuffer) => void; falha: (e: Error) => void }>();
  private proximoPedido = 1;

  // Pede ao núcleo o arquivo STEP/STL dos corpos (do histórico salvo, sem prévia).
  exportar(opcoes: OpcoesExportar): Promise<ArrayBuffer> {
    const pedido = this.proximoPedido++;
    return new Promise((ok, falha) => {
      this.exportacoes.set(pedido, { ok, falha });
      this.worker.postMessage({ tipo: "exportar", historico: this.resolvido(this.estado.historico), pedido, ...opcoes });
    });
  }

  private medicoes = new Map<number, { ok: (l: string[]) => void; falha: (e: Error) => void }>();

  // Medida exata (OpenCascade) de 1 ou 2 itens, no estado salvo do histórico.
  medir(itens: ItemMedida[]): Promise<string[]> {
    const pedido = this.proximoPedido++;
    return new Promise((ok, falha) => {
      this.medicoes.set(pedido, { ok, falha });
      this.worker.postMessage({ tipo: "medir", historico: this.resolvido(this.estado.historico), pedido, itens });
    });
  }

  // Propriedades de um corpo inteiro (massa, volume, caixa, inércia...).
  propriedades(corpo: string): Promise<string[]> {
    const pedido = this.proximoPedido++;
    return new Promise((ok, falha) => {
      this.medicoes.set(pedido, { ok, falha });
      this.worker.postMessage({ tipo: "propriedades", historico: this.resolvido(this.estado.historico), pedido, corpo });
    });
  }

  // Interferência entre corpos e centro de massa (respostas em texto).
  // "historico" (opcional): confere outra versão (ex.: a junta na posição da prévia).
  interferencia(corpos: string[], historico?: Operacao[]): Promise<string[]> {
    return this.pedirTexto({ tipo: "interferencia", corpos }, historico);
  }
  // Análise da pilha de fixadores (texto, uma linha por fixador).
  pilhaFixadores(): Promise<string[]> {
    return this.pedirTexto({ tipo: "pilhaFixadores" });
  }
  // Corpos congelados (Operação base), na versão do histórico dada.
  async congelar(nomes: string[], historico: Operacao[]): Promise<NonNullable<Operacao["congelados"]>> {
    return (await this.pedirTexto({ tipo: "congelar", nomes }, historico)).map((l) => JSON.parse(l));
  }
  // Origem/eixo que uma junta usaria nesta face ou aresta.
  async origemJunta(item: ItemMedida): Promise<{ p: V3; z: V3 }> {
    const [json] = await this.pedirTexto({ tipo: "origem", item });
    return JSON.parse(json);
  }
  centroMassa(corpos: string[]): Promise<string[]> {
    return this.pedirTexto({ tipo: "centroMassa", corpos });
  }
  // Forma exata de uma face/aresta (plano, cilindro, reta, círculo...).
  async geometria(item: ItemMedida, t?: number): Promise<Record<string, unknown>> {
    const [json] = await this.pedirTexto({ tipo: "geometria", item, t });
    return JSON.parse(json);
  }
  // Isocurvas das faces curvas de todos os corpos (segmentos x,y,z).
  async isocurvas(): Promise<Float32Array> {
    const linhas = await this.pedirTexto({ tipo: "isocurvas" });
    return new Float32Array(linhas.flatMap((l) => JSON.parse(l) as number[]));
  }
  // Todas as faces de um corpo: { indice, tipo ("plano"|"cilindro"|...), normal/direcao, raio, min, max }.
  async faces(corpo: string): Promise<{ indice: number; tipo: string; normal?: V3; direcao?: V3; origem?: V3; raio?: number; min: V3; max: V3 }[]> {
    return (await this.pedirTexto({ tipo: "faces", corpo })).map((l) => JSON.parse(l));
  }
  // Intersecção do esboço: arestas do corte do corpo pelo plano (listas de pontos 3D).
  async secao(corpo: string, plano: { origem: V3; eixoX: V3; normal: V3 }): Promise<V3[][]> {
    const linhas = await this.pedirTexto({ tipo: "secao", corpo, plano: { origem: plano.origem, eixoX: plano.eixoX, normal: plano.normal } });
    return linhas.map((l) => JSON.parse(l));
  }
  private pedirTexto(
    p:
      | { tipo: "interferencia" | "centroMassa"; corpos: string[] }
      | { tipo: "geometria" | "origem"; item: ItemMedida; t?: number }
      | { tipo: "faces"; corpo: string }
      | { tipo: "congelar"; nomes: string[] }
      | { tipo: "pilhaFixadores" }
      | { tipo: "isocurvas" }
      | { tipo: "secao"; corpo: string; plano: { origem: V3; eixoX: V3; normal: V3 } },
    historico = this.estado.historico,
  ): Promise<string[]> {
    const pedido = this.proximoPedido++;
    return new Promise((ok, falha) => {
      this.medicoes.set(pedido, { ok, falha });
      this.worker.postMessage({ ...p, historico: this.resolvido(historico), pedido });
    });
  }

  // ---- Arquivo ----

  // Histórico do último Salvar/Abrir. Se o atual for outro, há mudança não salva.
  private historicoSalvo: Operacao[] = this.estado.historico;

  modificado(): boolean {
    return this.estado.historico !== this.historicoSalvo;
  }

  marcarSalvo() {
    this.historicoSalvo = this.estado.historico;
    this.avisarOuvintes();
  }

  // Troca o projeto inteiro (Novo / Abrir). Desfazer recomeça do zero.
  carregar(historico: Operacao[], salvo = true) {
    this.desfazer = [];
    this.refazer = [];
    this.trocarHistorico(historico, false);
    if (salvo) this.historicoSalvo = historico;
    this.avisarOuvintes();
  }
}
