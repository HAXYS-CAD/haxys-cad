// Arquivo do projeto (.haxys): texto JSON com o histórico de operações.
// A geometria não é guardada: ela é recalculada ao abrir, como no Fusion.
import type { Operacao, TipoOperacao, ModoOperacao } from "../nucleo/tipos";
import { TIPOS_OPERACAO } from "../nucleo/tipos";
import { TIPOS_RESTRICAO } from "../nucleo/restricoes";

export const EXTENSAO = ".haxys";
const FORMATO = "haxys-cad";
const VERSAO = 1;

export interface ArquivoProjeto {
  formato: typeof FORMATO;
  versao: number;
  nome: string;
  unidades: "mm";
  salvoEm: string; // data e hora (ISO)
  historico: Operacao[];
  ocultos: string[]; // nomes de corpos/esboços escondidos
}

export function serializar(nome: string, historico: Operacao[], ocultos: Set<string>): string {
  const arquivo: ArquivoProjeto = {
    formato: FORMATO,
    versao: VERSAO,
    nome,
    unidades: "mm",
    salvoEm: new Date().toISOString(),
    historico,
    ocultos: [...ocultos],
  };
  return JSON.stringify(arquivo, null, 1);
}

// ---- Leitura: confere tudo, porque o arquivo pode estar estragado ou ser de outro programa ----

const TIPOS: readonly TipoOperacao[] = TIPOS_OPERACAO;
const MODOS: ModoOperacao[] = ["novo", "unir", "cortar", "intersecao"];

const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const ehNumero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const ehTexto = (x: unknown): x is string => typeof x === "string" && x.length < 500;

function erro(msg: string): never {
  throw new Error(msg);
}

function conferirV3(x: unknown, onde: string) {
  if (!Array.isArray(x) || x.length !== 3 || !x.every(ehNumero)) erro(`${onde}: vetor inválido`);
}

function conferirEsboco(e: unknown, onde: string) {
  if (!ehObjeto(e) || !ehObjeto(e.plano)) erro(`${onde}: esboço sem plano`);
  const p = e.plano as Record<string, unknown>;
  conferirV3(p.origem, onde);
  conferirV3(p.eixoX, onde);
  conferirV3(p.normal, onde);
  if (!Array.isArray(e.pontos) || !e.pontos.every((q) => ehObjeto(q) && ehNumero(q.id) && ehNumero(q.u) && ehNumero(q.v)))
    erro(`${onde}: pontos inválidos`);
  if (!Array.isArray(e.curvas) || !e.curvas.every((c) => ehObjeto(c) && ehNumero(c.id) && (c.tipo === "linha" || c.tipo === "circulo" || c.tipo === "arco" || (c.tipo === "spline" && Array.isArray(c.internos) && c.internos.every(ehNumero) && (c.controle === undefined || typeof c.controle === "boolean")) || (c.tipo === "elipse" && ehNumero(c.menor)))))
    erro(`${onde}: curvas inválidas`);
  const cotaOk = (c: unknown) => {
    if (!ehObjeto(c) || !ehNumero(c.id) || (c.valor !== undefined && !ehNumero(c.valor))) return false;
    if (c.expressao !== undefined && !ehTexto(c.expressao)) return false;
    switch (c.tipo) {
      case undefined:
      case "curva": return ehNumero(c.curva);
      case "angulo": return ehNumero(c.c1) && ehNumero(c.c2) && ehNumero(c.sinal);
      case "pontos": return ehNumero(c.p1) && ehNumero(c.p2) && ehNumero(c.sinal) && ["livre", "h", "v"].includes(c.eixo as string);
      case "pontoLinha": return ehNumero(c.ponto) && ehNumero(c.curva) && ehNumero(c.sinal);
      default: return false;
    }
  };
  if (!Array.isArray(e.cotas) || !e.cotas.every(cotaOk))
    erro(`${onde}: cotas inválidas`);
  if (e.restricoes !== undefined) {
    const ok = Array.isArray(e.restricoes) && e.restricoes.every((r) =>
      ehObjeto(r) && ehNumero(r.id) && (TIPOS_RESTRICAO as readonly unknown[]).includes(r.tipo) &&
      ["ponto", "curva", "c1", "c2", "p1", "p2"].every((k) => r[k] === undefined || ehNumero(r[k])) &&
      (r.curvas === undefined || (Array.isArray(r.curvas) && r.curvas.every(ehNumero))));
    if (!ok) erro(`${onde}: restrições inválidas`);
  }
}

function conferirOperacao(o: unknown, i: number): Operacao {
  const onde = `Operação ${i + 1}`;
  if (!ehObjeto(o)) erro(`${onde}: não é um objeto`);
  if (!ehTexto(o.id) || !ehTexto(o.nome)) erro(`${onde}: sem id ou nome`);
  if (!TIPOS.includes(o.tipo as TipoOperacao)) erro(`${onde}: tipo desconhecido "${String(o.tipo)}"`);
  if (!MODOS.includes(o.modo as ModoOperacao)) erro(`${onde}: operação desconhecida`);
  if (!ehObjeto(o.params) || !Object.values(o.params).every(ehNumero)) erro(`${onde}: medidas inválidas`);
  if (o.referencias !== undefined) {
    const ok = Array.isArray(o.referencias) && o.referencias.every(
      (r) => ehObjeto(r) && ehTexto(r.corpo) && (r.tipo === "aresta" || r.tipo === "face") && ehNumero(r.indice),
    );
    if (!ok) erro(`${onde}: arestas inválidas`);
  }
  if (o.esboco !== undefined) conferirEsboco(o.esboco, onde);
  if (o.perfis !== undefined) {
    const p = o.perfis;
    if (!ehObjeto(p) || !ehTexto(p.esboco) || !Array.isArray(p.indices) || !p.indices.every(ehNumero))
      erro(`${onde}: perfis inválidos`);
  }
  const v3 = (x: unknown) => Array.isArray(x) && x.length === 3 && x.every(ehNumero);
  if (o.planoBase !== undefined) {
    const b = o.planoBase;
    if (!ehObjeto(b) || !v3(b.origem) || !v3(b.eixoX) || !v3(b.normal)) erro(`${onde}: plano base inválido`);
  }
  if (o.furos !== undefined && !(Array.isArray(o.furos) && o.furos.every((f) => ehObjeto(f) && v3(f.ponto) && v3(f.normal))))
    erro(`${onde}: furos inválidos`);
  if (o.secoes !== undefined && !(Array.isArray(o.secoes) && o.secoes.every((x) => ehObjeto(x) && ehTexto(x.esboco) && ehNumero(x.indice))))
    erro(`${onde}: seções inválidas`);
  if (o.caminho !== undefined) {
    const c = o.caminho;
    if (!ehObjeto(c) || !ehTexto(c.esboco) || !Array.isArray(c.curvas) || !c.curvas.every(ehNumero)) erro(`${onde}: caminho inválido`);
  }
  if (o.corpos !== undefined && !(Array.isArray(o.corpos) && o.corpos.every(ehTexto))) erro(`${onde}: corpos inválidos`);
  if (o.opcoes !== undefined && !(ehObjeto(o.opcoes) && Object.values(o.opcoes).every(ehTexto))) erro(`${onde}: opções inválidas`);
  if (o.arquivo !== undefined) {
    const a = o.arquivo;
    if (!ehObjeto(a) || !ehTexto(a.nome) || (a.formato !== "step" && a.formato !== "stl" && a.formato !== "obj") || typeof a.base64 !== "string") erro(`${onde}: arquivo inválido`);
  }
  if (
    o.congelados !== undefined &&
    !(Array.isArray(o.congelados) && o.congelados.every((c) => ehObjeto(c) && ehTexto(c.nome) && (c.tipo === "solido" || c.tipo === "malha") && typeof c.dados === "string" && (c.tri === undefined || typeof c.tri === "string")))
  )
    erro(`${onde}: corpos da operação base inválidos`);
  if (o.texto !== undefined && !(typeof o.texto === "string" && o.texto.length <= 2000)) erro(`${onde}: texto inválido`);
  if (o.ancoras !== undefined && !(Array.isArray(o.ancoras) && o.ancoras.length <= 8 && o.ancoras.every(v3))) erro(`${onde}: pontos da anotação inválidos`);
  if (o.imagem !== undefined && !(typeof o.imagem === "string" && o.imagem.startsWith("data:image/"))) erro(`${onde}: imagem inválida`);
  if (o.pontoConstrucao !== undefined && !v3(o.pontoConstrucao)) erro(`${onde}: ponto inválido`);
  if (o.eixoConstrucao !== undefined && !(ehObjeto(o.eixoConstrucao) && v3(o.eixoConstrucao.origem) && v3(o.eixoConstrucao.direcao)))
    erro(`${onde}: eixo inválido`);
  if (o.expressoes !== undefined && !(ehObjeto(o.expressoes) && Object.values(o.expressoes).every(ehTexto)))
    erro(`${onde}: expressões inválidas`);
  if (
    o.configuracoes !== undefined &&
    !(Array.isArray(o.configuracoes) && o.configuracoes.every((c) => ehObjeto(c) && ehTexto(c.nome) && ehObjeto(c.valores) && Object.values(c.valores).every(ehTexto)))
  )
    erro(`${onde}: configurações inválidas`);
  if (o.regras !== undefined && !(Array.isArray(o.regras) && o.regras.every((g) => ehObjeto(g) && ehTexto(g.se) && ehTexto(g.entao) && ehTexto(g.expressao))))
    erro(`${onde}: regras inválidas`);
  if (o.configuracaoAtiva !== undefined && !ehTexto(o.configuracaoAtiva)) erro(`${onde}: configuração ativa inválida`);
  if (
    o.parametros !== undefined &&
    !(Array.isArray(o.parametros) && o.parametros.every((p) => ehObjeto(p) && ehTexto(p.nome) && ehTexto(p.expressao) && (p.comentario === undefined || ehTexto(p.comentario))))
  )
    erro(`${onde}: parâmetros inválidos`);
  if (o.eixo !== undefined) {
    const e = o.eixo;
    const ok =
      ehObjeto(e) &&
      ((e.tipo === "origem" && (e.eixo === "X" || e.eixo === "Y" || e.eixo === "Z")) ||
        (e.tipo === "linha" && ehTexto(e.esboco) && ehNumero(e.curva)) ||
        (e.tipo === "construcao" && ehTexto(e.op)));
    if (!ok) erro(`${onde}: eixo inválido`);
  }
  return o as unknown as Operacao;
}

export function desserializar(texto: string): ArquivoProjeto {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    erro("O arquivo não é um projeto do HAXYS CAD (texto inválido).");
  }
  if (!ehObjeto(dados) || dados.formato !== FORMATO) erro("O arquivo não é um projeto do HAXYS CAD.");
  if (!ehNumero(dados.versao) || dados.versao > VERSAO)
    erro("Este projeto foi salvo numa versão mais nova do HAXYS CAD.");
  if (!Array.isArray(dados.historico)) erro("O projeto não tem histórico.");
  const historico = dados.historico.map(conferirOperacao);
  const ocultos = Array.isArray(dados.ocultos) ? dados.ocultos.filter(ehTexto) : [];
  return {
    formato: FORMATO,
    versao: dados.versao,
    nome: ehTexto(dados.nome) ? dados.nome : "Projeto",
    unidades: "mm",
    salvoEm: ehTexto(dados.salvoEm) ? dados.salvoEm : "",
    historico,
    ocultos,
  };
}
