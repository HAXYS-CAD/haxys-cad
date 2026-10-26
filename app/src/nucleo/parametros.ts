// Parâmetros do usuário e expressões, como em "Alterar parâmetros" do Fusion.
// Qualquer campo de medida aceita uma expressão: "largura * 2", "10 cm",
// "sqrt(area)", "(furo + 2) / 2". O resultado sai em mm (ou graus, nos ângulos).
// A conta é feita por um leitor próprio (nada de eval): números, + − * / ^,
// parênteses, nomes de parâmetros, unidades e algumas funções.
// Medidas do modelo entram como "Operação.medida": Caixa1.altura, Extrusão1.distancia,
// Esboço1.d3 (cota 3 do esboço). Só valem as operações que vêm antes na linha do tempo.

export interface Parametro {
  nome: string;
  expressao: string;
  comentario?: string;
}

// Configuração: um conjunto de valores (expressões) para os parâmetros do
// usuário, como a tabela de Configurações do Fusion. Ativar = copiar os valores.
export interface Configuracao {
  nome: string;
  valores: Record<string, string>;
}

// Unidades: o número é convertido para mm (comprimento) ou fica igual (graus).
const UNIDADES: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, pol: 25.4, ft: 304.8, deg: 1, "°": 1 };

const FUNCOES: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  // Trigonometria em graus, como os ângulos do programa.
  sin: (g) => Math.sin((g * Math.PI) / 180),
  cos: (g) => Math.cos((g * Math.PI) / 180),
  tan: (g) => Math.tan((g * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
};
const CONSTANTES: Record<string, number> = { pi: Math.PI, PI: Math.PI };

// Regra de configuração: "se <condição> então <parâmetro> = <expressão>".
// Ex.: se "largura > 50" então espessura = 4. A condição compara duas
// expressões com >, <, >=, <=, = ou !=. Vale sobre o valor normal do parâmetro.
export interface Regra {
  se: string;
  entao: string;
  expressao: string;
}

export function condicao(texto: string, valores: Map<string, number>): boolean {
  const m = /^(.*?)(>=|<=|!=|==|=|>|<)(.*)$/.exec(texto);
  if (!m || !m[1].trim() || !m[3].trim()) throw new Error("Condição precisa de >, <, >=, <=, = ou !=");
  const a = avaliar(m[1], valores), b = avaliar(m[3], valores);
  const igual = Math.abs(a - b) < 1e-9;
  return { ">=": a >= b || igual, "<=": a <= b || igual, "!=": !igual, "==": igual, "=": igual, ">": a > b && !igual, "<": a < b && !igual }[m[2]]!;
}

export const NOME_VALIDO = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const ehNumeroSimples = (t: string) => /^\s*-?\d+([.,]\d+)?\s*$/.test(t);

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokens(texto: string): Token[] {
  const lista: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Vírgula decimal só colada em dígitos ("3,5"); "max(1, 7)" ou "max(1; 7)" separa.
    const num = /^(\d+([.,]\d+)?|\.\d+)([eE][-+]?\d+)?/.exec(texto.slice(i));
    if (num) {
      lista.push({ t: "num", v: Number(num[0].replace(",", ".")) });
      i += num[0].length;
      continue;
    }
    const id = /^([\p{L}_][\p{L}\p{N}_]*(\.[\p{L}_][\p{L}\p{N}_]*)?|°)/u.exec(texto.slice(i));
    if (id) {
      lista.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    if ("+-*/^(),;".includes(c)) {
      lista.push({ t: "op", v: c === ";" ? "," : c });
      i++;
      continue;
    }
    throw new Error(`Caractere inválido: "${c}"`);
  }
  return lista;
}

// Gramática: soma := termo (("+"|"-") termo)*; termo := unario (("*"|"/") unario)*;
// unario := "-" unario | potencia; potencia := base unidade? ("^" unario)?;
// base := número | nome | função "(" args ")" | "(" soma ")".
export function avaliar(texto: string, valores: Map<string, number> | Record<string, number> = {}): number {
  const pegar = (n: string) => (valores instanceof Map ? valores.get(n) : valores[n]);
  const tk = tokens(texto);
  if (!tk.length) throw new Error("Expressão vazia");
  let k = 0;
  const olhar = () => tk[k];
  const ehOp = (v: string) => olhar()?.t === "op" && olhar()!.v === v;
  const esperar = (v: string) => {
    if (!ehOp(v)) throw new Error(`Falta "${v}"`);
    k++;
  };
  function soma(): number {
    let v = termo();
    while (ehOp("+") || ehOp("-")) v = tk[k++].v === "+" ? v + termo() : v - termo();
    return v;
  }
  function termo(): number {
    let v = unario();
    while (ehOp("*") || ehOp("/")) {
      const op = tk[k++].v;
      const d = unario();
      if (op === "/" && d === 0) throw new Error("Divisão por zero");
      v = op === "*" ? v * d : v / d;
    }
    return v;
  }
  // "-2^2" = −4, como na matemática (o sinal vale depois da potência).
  function unario(): number {
    if (ehOp("-")) return k++, -unario();
    if (ehOp("+")) return k++, unario();
    return potencia();
  }
  function potencia(): number {
    const b = comUnidade();
    if (ehOp("^")) {
      k++;
      return b ** unario();
    }
    return b;
  }
  function comUnidade(): number {
    let v = base();
    // Unidade logo depois de um valor: "10 cm", "(a+b) in".
    const u = olhar();
    if (u?.t === "id" && UNIDADES[u.v] !== undefined && pegar(u.v) === undefined) {
      v *= UNIDADES[u.v];
      k++;
    }
    return v;
  }
  function base(): number {
    const t = olhar();
    if (!t) throw new Error("Expressão incompleta");
    if (t.t === "num") return k++, t.v;
    if (t.t === "op" && t.v === "(") {
      k++;
      const v = soma();
      esperar(")");
      return v;
    }
    if (t.t === "id") {
      k++;
      if (FUNCOES[t.v] && ehOp("(")) {
        k++;
        const args = [soma()];
        while (ehOp(",")) k++, args.push(soma());
        esperar(")");
        return FUNCOES[t.v](...args);
      }
      const v = pegar(t.v) ?? CONSTANTES[t.v];
      if (v === undefined) throw new Error(`Parâmetro desconhecido: ${t.v}`);
      return v;
    }
    throw new Error(`Símbolo fora do lugar: "${t.v}"`);
  }
  const v = soma();
  if (k < tk.length) throw new Error(`Sobrou "${tk[k].v}" no fim`);
  if (!Number.isFinite(v)) throw new Error("O resultado não é um número");
  return v;
}

// Nomes citados numa expressão (para achar a ordem e as voltas).
function citados(texto: string): string[] {
  try {
    return tokens(texto).filter((t) => t.t === "id").map((t) => t.v as string);
  } catch {
    return [];
  }
}

// Calcula todos os parâmetros, cada um depois dos que ele usa.
// Com regras: calcula, vê quais regras valem, troca as expressões e calcula de
// novo (até 5 vezes, para regras que dependem de outras).
export function valoresDosParametros(lista: Parametro[], regras: Regra[] = []): { valores: Map<string, number>; erros: Record<string, string> } {
  let r = valoresSemRegras(lista);
  for (let passada = 0; passada < 5 && regras.length; passada++) {
    const trocas = new Map<string, string>();
    for (const g of regras) {
      try {
        if (condicao(g.se, r.valores)) trocas.set(g.entao, g.expressao);
      } catch (e) {
        r.erros[g.entao] ??= `Regra "${g.se}": ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    const nova = lista.map((p) => (trocas.has(p.nome) ? { ...p, expressao: trocas.get(p.nome)! } : p));
    const r2 = valoresSemRegras(nova);
    const mudou = [...r2.valores].some(([k, v]) => r.valores.get(k) !== v);
    r = { valores: r2.valores, erros: { ...r2.erros, ...Object.fromEntries(Object.entries(r.erros).filter(([, e]) => e.startsWith("Regra"))) } };
    if (!mudou) break;
  }
  return r;
}

function valoresSemRegras(lista: Parametro[]): { valores: Map<string, number>; erros: Record<string, string> } {
  const valores = new Map<string, number>();
  const erros: Record<string, string> = {};
  const porNome = new Map(lista.map((p) => [p.nome, p]));
  const visitando = new Set<string>();
  const calcular = (nome: string): number | undefined => {
    if (valores.has(nome)) return valores.get(nome);
    if (erros[nome]) return undefined;
    const p = porNome.get(nome);
    if (!p) return undefined;
    if (visitando.has(nome)) {
      erros[nome] = "Um parâmetro depende dele mesmo (volta)";
      return undefined;
    }
    visitando.add(nome);
    for (const c of citados(p.expressao)) if (porNome.has(c)) calcular(c);
    visitando.delete(nome);
    try {
      const v = avaliar(p.expressao, valores);
      valores.set(nome, v);
      return v;
    } catch (e) {
      erros[nome] ??= e instanceof Error ? e.message : String(e);
      return undefined;
    }
  };
  for (const p of lista) {
    if (!NOME_VALIDO.test(p.nome)) erros[p.nome] = "Nome inválido (use letras, números e _; comece com letra)";
    else if (FUNCOES[p.nome] || CONSTANTES[p.nome] || UNIDADES[p.nome] !== undefined) erros[p.nome] = "Esse nome é reservado";
    else calcular(p.nome);
  }
  return { valores, erros };
}
