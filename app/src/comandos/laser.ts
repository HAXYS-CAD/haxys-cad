// Laser (Bambu H2C/H2D com módulo laser): transforma um esboço, ou o contorno
// de um corpo cortado na altura escolhida (visto de cima), num arquivo SVG em
// milímetros, grava em HAXYS_CAD\saida e abre na Bambu Suite (o programa da
// Bambu para laser e corte), onde a pessoa escolhe material, potência e manda.
// "Cortar" = só as linhas (contorno); "Gravar" = áreas preenchidas (furos ficam
// vazios). Avisa se passar da área do laser de 40 W (310 × 250 mm).
// Limites: os ajustes de potência/velocidade ficam na Bambu Suite; curvas
// viram linhas curtas (0,5 mm ou menos de erro nos arcos); o corte do corpo é
// só num plano horizontal (para a silhueta inteira, faça um esboço).
import { abrirDialogo } from "../ui/dialogo";
import type { Projeto } from "../nucleo/projeto";
import { contornoDoLaco, perfis, perfisDeMaterial, amostrarCurva, type DadosEsboco, type P2 } from "../nucleo/esboco";

export const COMANDO_LASER = "HaxysLaserCommand";
const AREA_LASER: [number, number] = [310, 250]; // laser 40 W (wiki da Bambu Lab)

type Linha = P2[];

// Esboço → linhas no plano dele (SVG: x = u, y = −v).
function linhasDoEsboco(e: DadosEsboco, preencher: boolean): Linha[] {
  if (preencher)
    // Só os perfis de material (o furo não vira outra área preenchida).
    return perfis(e)
      .filter((_, i) => perfisDeMaterial(e).includes(i))
      .flatMap((p) => [p.externo, ...p.furos].map((l) => contornoDoLaco(l, 96).map(([u, v]) => [u, -v] as P2)));
  return e.curvas.map((c) => amostrarCurva(e, c).map(([u, v]) => [u, -v] as P2));
}

// Junta pedaços de linha cujas pontas se encostam (o corte do corpo vem em pedaços).
function encadear(partes: Linha[], tol = 1e-3): Linha[] {
  const resto = partes.map((p) => p.slice());
  const saida: Linha[] = [];
  const perto = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  while (resto.length) {
    const atual = resto.shift()!;
    let achou = true;
    while (achou && !perto(atual[0], atual[atual.length - 1])) {
      achou = false;
      for (let i = 0; i < resto.length; i++) {
        const p = resto[i];
        const fim = atual[atual.length - 1];
        if (perto(fim, p[0])) atual.push(...p.slice(1));
        else if (perto(fim, p[p.length - 1])) atual.push(...p.slice(0, -1).reverse());
        else continue;
        resto.splice(i, 1);
        achou = true;
        break;
      }
    }
    saida.push(atual);
  }
  return saida;
}

export interface ResultadoSvg {
  svg: string;
  largura: number;
  altura: number;
  aviso: string;
}

export function montarSvg(linhas: Linha[], preencher: boolean): ResultadoSvg {
  const pts = linhas.flat();
  if (!pts.length) throw new Error("Não há linhas para o laser");
  const x0 = Math.min(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1]));
  const largura = Math.max(...pts.map((p) => p[0])) - x0, altura = Math.max(...pts.map((p) => p[1])) - y0;
  const n = (v: number) => +v.toFixed(4);
  const d = linhas
    .map((l) => `M${l.map(([x, y]) => `${n(x - x0)} ${n(y - y0)}`).join(" L")}${preencher ? " Z" : ""}`)
    .join(" ");
  const estilo = preencher ? 'fill="#000000" fill-rule="evenodd" stroke="none"' : 'fill="none" stroke="#ff0000" stroke-width="0.1"';
  const W = Math.max(n(largura), 0.01), H = Math.max(n(altura), 0.01);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
  <path ${estilo} d="${d}"/>
</svg>
`;
  const f1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const cabe = largura <= AREA_LASER[0] && altura <= AREA_LASER[1];
  const cabeGirado = largura <= AREA_LASER[1] && altura <= AREA_LASER[0];
  const aviso = cabe
    ? `Cabe na área do laser (${f1(largura)} × ${f1(altura)} mm).`
    : cabeGirado
      ? `Gire 90° na Bambu Suite para caber (${f1(largura)} × ${f1(altura)} mm; área 310 × 250).`
      : `NÃO CABE na área do laser 40 W (${f1(largura)} × ${f1(altura)} mm; área 310 × 250).`;
  return { svg, largura, altura, aviso };
}

// Fonte: "esb:<id da operação>" ou "corpo:<nome>" (corte na altura y).
export async function svgDoLaser(projeto: Projeto, fonte: string, preencher: boolean, alturaCorte?: number): Promise<ResultadoSvg> {
  if (fonte.startsWith("esb:")) {
    const op = projeto.estado.historico.find((o) => o.id === fonte.slice(4) && o.tipo === "esboco");
    if (!op?.esboco) throw new Error("Esboço não encontrado");
    return montarSvg(linhasDoEsboco(op.esboco, preencher), preencher);
  }
  const nome = fonte.slice(6);
  const c = projeto.estado.corposBase.find((x) => x.nome === nome);
  if (!c) throw new Error(`${nome} não existe`);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 1; i < c.vertices.length; i += 3) (ymin = Math.min(ymin, c.vertices[i])), (ymax = Math.max(ymax, c.vertices[i]));
  const y = alturaCorte ?? (ymin + ymax) / 2;
  const partes = await projeto.secao(nome, { origem: [0, y, 0], eixoX: [1, 0, 0], normal: [0, 1, 0] });
  // Visto de cima: x = X, y = Z (frente para baixo, como na tela de cima).
  const linhas = encadear(partes.map((l) => l.map((p) => [p[0], p[2]] as P2)));
  if (!linhas.length) throw new Error(`O plano na altura ${y.toFixed(2)} mm não corta ${nome}`);
  return montarSvg(linhas, preencher);
}

export async function enviarAoLaser(r: ResultadoSvg, nome: string): Promise<string> {
  try {
    const resp = await fetch("/api/laser", { method: "POST", headers: { "x-nome": encodeURIComponent(nome) }, body: r.svg });
    const j = await resp.json();
    if (!resp.ok) throw new Error(j.erro ?? `erro ${resp.status}`);
    return `${j.aberto ? `Aberto na Bambu Suite: ${j.arquivo}` : `Gravado em ${j.arquivo} (${j.erro ?? "Bambu Suite não abriu"})`}. ${r.aviso}`;
  } catch (e) {
    if (e instanceof TypeError || e instanceof SyntaxError) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml" }));
      a.download = `${nome}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return `Baixado: ${nome}.svg (abra na Bambu Suite). ${r.aviso}`;
    }
    throw e;
  }
}

export function comandoLaser(raiz: HTMLElement, projeto: Projeto, nomeProjeto: string, avisar: (t: string) => void) {
  const esbocos = projeto.estado.historico.filter((o) => o.tipo === "esboco" && !o.suprimida);
  const corpos = projeto.estado.corposBase.filter((c) => !c.ehMalha);
  const opcoes = [...esbocos.map((o) => [`esb:${o.id}`, `Esboço: ${o.nome}`] as [string, string]), ...corpos.map((c) => [`corpo:${c.nome}`, `Contorno de ${c.nome} (corte horizontal)`] as [string, string])];
  if (!opcoes.length) return avisar("Faça um esboço ou um corpo antes de mandar para o laser.");
  abrirDialogo(raiz, {
    titulo: "Laser (Bambu Suite)",
    campos: [{ chave: "altura", rotulo: "Altura do corte (só corpo; 0 = meio)", valor: 0 }],
    escolhas: [
      { chave: "fonte", rotulo: "O quê", opcoes, valor: opcoes[0][0] },
      { chave: "modo", rotulo: "Laser", opcoes: [["cortar", "Cortar (só as linhas)"], ["gravar", "Gravar (área preenchida)"]], valor: "cortar" },
    ],
    modo: "novo",
    semModo: true,
    aoMudar: () => {},
    aoCancelar: () => {},
    aoOK: async (v, _m, esc) => {
      avisar("Gerando o SVG…");
      try {
        const r = await svgDoLaser(projeto, esc.fonte, esc.modo === "gravar", v.altura ? v.altura : undefined);
        const rotulo = opcoes.find((o) => o[0] === esc.fonte)![1].replace(/^Esboço: |^Contorno de /, "").replace(/ \(.*\)$/, "");
        avisar(await enviarAoLaser(r, `${nomeProjeto} - laser ${rotulo}`));
      } catch (e) {
        avisar(`Não foi possível: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });
}
