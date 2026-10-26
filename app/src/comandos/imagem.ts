// Peça a partir de imagem (painel HAXYS): a silhueta de uma foto ou desenho
// vira um esboço (contornos com furos) e, se quiser, uma extrusão.
// - Curvas: furo/contorno redondo vira círculo exato; trecho curvo vira
//   spline; lados retos e cantos ficam linhas ("Só retas" desliga isso).
// - Escala pelo marcador HAXYS (40 mm, public/referencia): o marcador é achado
//   na foto, dá os mm de cada pixel e sai do contorno da peça.
// - Alturas pelo tom: com 2 a 5 níveis, cada tom de cinza vira um degrau (o
//   mais escuro mais alto, se a peça é escura): um esboço e uma extrusão por
//   nível, todos unidos. Bom para placas, logotipos e letreiros em relevo.
// Funciona melhor com a peça escura num fundo claro (ou o contrário, escolhendo
// "clara"), foto de cima e sem sombra. Largura = tamanho real da peça em X.
// A imagem também pode ficar como Tela de referência, na mesma escala, para
// comparar. Para peças em 3D a partir de fotos, use "Falar com a IA" no modo
// Codex e anexe a imagem.
import { abrirDialogo } from "../ui/dialogo";
import { replicarComFotos } from "../ui/voz";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { PLANOS_ORIGEM, perfisDeMaterial, type DadosEsboco } from "../nucleo/esboco";
import { acharMarcador, contornosCurvosEmMm, limiaresDeNiveis, mascaraDaImagem, semMarcador, type LacoCurvo } from "../nucleo/contorno";

type Pt = [number, number];
type SemId<T> = T extends unknown ? Omit<T, "id"> : never;

export const COMANDO_IMAGEM = "HaxysImagemCommand";
const MAX_PX = 600;

function carregar(url: string): Promise<{ dados: ImageData; url: string }> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(img.width * k));
      cv.height = Math.max(1, Math.round(img.height * k));
      const g = cv.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, cv.width, cv.height);
      ok({ dados: g.getImageData(0, 0, cv.width, cv.height), url });
    };
    img.onerror = () => falha(new Error("Não foi possível ler a imagem"));
    img.src = url;
  });
}

// Laços → esboço: círculo, linhas e splines (abertas entre cantos; fechada se não há canto).
export function esbocoDosContornos(lacos: LacoCurvo[], plano: "XZ" | "XY"): DadosEsboco {
  const d: DadosEsboco = { plano: PLANOS_ORIGEM[plano], pontos: [{ id: 0, u: 0, v: 0 }], curvas: [], cotas: [] };
  const novoPonto = ([u, v]: Pt) => (d.pontos.push({ id: d.pontos.length, u, v }), d.pontos.length - 1);
  const novaCurva = (c: SemId<DadosEsboco["curvas"][number]>) => d.curvas.push({ ...c, id: d.curvas.length + 1 } as DadosEsboco["curvas"][number]);
  for (const l of lacos) {
    if (l.tipo === "circulo") {
      novaCurva({ tipo: "circulo", centro: novoPonto(l.centro), raio: l.raio });
      continue;
    }
    const ids = l.pontos.map(novoPonto);
    const n = ids.length;
    const canto = l.liso.findIndex((x) => !x);
    if (canto < 0) {
      novaCurva({ tipo: "spline", a: ids[0], b: ids[0], internos: ids.slice(1) });
      continue;
    }
    // Volta inteira a partir de um canto.
    let i = canto;
    for (let feito = 0; feito < n; ) {
      let j = (i + 1) % n;
      const internos: number[] = [];
      while (l.liso[j] && internos.length < n) {
        internos.push(ids[j]);
        j = (j + 1) % n;
      }
      if (internos.length) novaCurva({ tipo: "spline", a: ids[i], b: ids[j], internos });
      else novaCurva({ tipo: "linha", a: ids[i], b: ids[j] });
      feito += internos.length + 1;
      i = j;
    }
  }
  return d;
}

export function comandoImagem(raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  const entrada = document.createElement("input");
  entrada.type = "file";
  entrada.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
  entrada.multiple = true;
  entrada.addEventListener("change", () => {
    // Várias fotos = peça em 3D: vão todas para "Replicar peça da foto" da IA.
    if ((entrada.files?.length ?? 0) > 1) return replicarComFotos(projeto, avisar, [...entrada.files!]);
    const arq = entrada.files?.[0];
    if (!arq) return;
    const r = new FileReader();
    r.onload = () => void pecaDaImagem(String(r.result), arq.name, raiz, projeto, avisar);
    r.readAsDataURL(arq);
  });
  entrada.click();
}

interface Camada {
  esboco: DadosEsboco;
  material: number[];
  altura: number;
}

export async function pecaDaImagem(url: string, nomeArq: string, raiz: HTMLElement, projeto: Projeto, avisar: (t: string) => void) {
  let img: { dados: ImageData; url: string };
  try {
    img = await carregar(url);
  } catch (e) {
    return avisar(e instanceof Error ? e.message : String(e));
  }
  const idPrevia = crypto.randomUUID();
  let ultimo: { camadas: Camada[]; info: string; k: number; centro: Pt } | null = null;
  const calcular = (v: Record<string, number>, esc: Record<string, string>) => {
    const escuro = esc.peca !== "clara";
    const plano = esc.plano === "XY" ? "XY" : "XZ";
    const niveis = esc.alturas === "uma" ? 1 : Math.max(2, Math.min(5, Number(esc.alturas)));
    // Limiar de cada nível: a base pega tudo o que não é fundo; os de cima, só os tons mais fortes.
    const limiares: (number | null)[] =
      niveis === 1 ? [v.limiar > 0 ? v.limiar : null] : escuro ? limiaresDeNiveis(img.dados.data, niveis).reverse() : limiaresDeNiveis(img.dados.data, niveis);
    // Escala pelo marcador: achado na máscara "escura" (o marcador é preto).
    const marcador = esc.escala === "marcador" ? acharMarcador(mascaraDaImagem(img.dados.data, img.dados.width, img.dados.height, null, true).mascara) : null;
    if (esc.escala === "marcador" && !marcador) throw new Error("Não achei o marcador HAXYS de 40 mm na foto (veja o tutorial em Referência de medidas)");
    const camadas: Camada[] = [];
    let base: ReturnType<typeof contornosCurvosEmMm> | undefined;
    let pontos = 0;
    let limiarUsado = 0;
    limiares.forEach((L, j) => {
      const bruta = mascaraDaImagem(img.dados.data, img.dados.width, img.dados.height, L, escuro);
      const { limiar } = bruta;
      const mascara = marcador ? semMarcador(bruta.mascara, marcador.caixa) : bruta.mascara;
      if (j === 0) limiarUsado = limiar;
      let c: ReturnType<typeof contornosCurvosEmMm>;
      try {
        // Os níveis de cima usam a escala e o centro da base (ficam no lugar certo).
        c = contornosCurvosEmMm(mascara, v.largura, Math.max(0.3, v.suavidade || 1), esc.curvas !== "retas", 12, base?.caixaPx, marcador?.mmPorPixel);
      } catch (e) {
        if (j === 0) throw e;
        return; // nível sem nenhum pixel: não vira degrau
      }
      base ??= c;
      pontos += c.lacos.reduce((s, l) => s + (l.tipo === "circulo" ? 1 : l.pontos.length), 0);
      const esboco = esbocoDosContornos(c.lacos, plano);
      camadas.push({ esboco, material: perfisDeMaterial(esboco), altura: (v.espessura || 5) + j * (v.degrau || 2) });
    });
    if (pontos > 4000) throw new Error(`Contorno com ${pontos} pontos: aumente a suavidade`);
    if (!base) throw new Error("Não achei a peça na imagem");
    const conta = (tipo: string) => camadas.reduce((s, c) => s + c.esboco.curvas.filter((x) => x.tipo === tipo).length, 0);
    ultimo = {
      camadas,
      k: base.mmPorPixel,
      centro: base.centroPx,
      info: `${camadas.length} nível(is), ${base.lacos.length} contorno(s) na base, ${conta("circulo")} círculo(s), ${conta("spline")} spline(s), ${conta("linha")} linha(s), ${((base.caixaPx.x1 - base.caixaPx.x0) * base.mmPorPixel).toFixed(1)} × ${base.alturaMm.toFixed(1)} mm${marcador ? `, escala pelo marcador (${marcador.ladoPx.toFixed(1)} px = 40 mm)` : ""}${niveis === 1 ? `, limiar ${limiarUsado}` : ""}`,
    };
    return ultimo;
  };
  const previa = (esboco: DadosEsboco): Operacao => ({ id: idPrevia, tipo: "esboco", nome: "Prévia da imagem", modo: "novo", params: {}, esboco });
  let dialogo: { definirSelecao(t: string): void } | undefined;
  dialogo = abrirDialogo(raiz, {
    titulo: `Peça a partir de imagem: ${nomeArq}`,
    campos: [
      { chave: "largura", rotulo: "Largura real da peça (X; sem marcador)", valor: 80 },
      { chave: "espessura", rotulo: "Espessura (extrusão da base)", valor: 5 },
      { chave: "degrau", rotulo: "Degrau por nível (alturas pelo tom)", valor: 2 },
      { chave: "limiar", rotulo: "Limiar (0 = automático; só uma altura)", valor: 0, unidade: "" },
      { chave: "suavidade", rotulo: "Suavidade do contorno", valor: 1, unidade: "px" },
    ],
    escolhas: [
      { chave: "escala", rotulo: "Escala", opcoes: [["largura", "Pela largura digitada"], ["marcador", "Pelo marcador HAXYS (40 mm)"]], valor: "largura" },
      { chave: "peca", rotulo: "A peça na imagem é", opcoes: [["escura", "Escura (fundo claro)"], ["clara", "Clara (fundo escuro)"]], valor: "escura" },
      { chave: "curvas", rotulo: "Contorno", opcoes: [["curvas", "Com curvas (círculos e splines)"], ["retas", "Só retas"]], valor: "curvas" },
      { chave: "alturas", rotulo: "Alturas", opcoes: [["uma", "Uma altura"], ["2", "Pelo tom: 2 níveis"], ["3", "Pelo tom: 3 níveis"], ["4", "Pelo tom: 4 níveis"], ["5", "Pelo tom: 5 níveis"]], valor: "uma" },
      { chave: "resultado", rotulo: "Criar", opcoes: [["extrusao", "Esboço + extrusão"], ["esboco", "Só o esboço"]], valor: "extrusao" },
      { chave: "plano", rotulo: "Plano", opcoes: [["XZ", "XZ (deitada na mesa)"], ["XY", "XY (de frente)"]], valor: "XZ" },
      { chave: "tela", rotulo: "Imagem de referência", opcoes: [["sim", "Deixar como Tela"], ["nao", "Não"]], valor: "sim" },
    ],
    modo: "novo",
    semModo: true,
    selecao: "calculando…",
    rotuloSelecao: "Contorno",
    aoMudar: (v, _m, esc) => {
      try {
        const r = calcular(v, esc);
        dialogo?.definirSelecao(r.info);
        projeto.previsualizar(previa(r.camadas[0].esboco));
      } catch (e) {
        dialogo?.definirSelecao(e instanceof Error ? e.message : String(e));
        projeto.previsualizar(null);
      }
    },
    aoOK: (v, _m, esc) => {
      let r = ultimo;
      try {
        r = calcular(v, esc);
      } catch (e) {
        projeto.previsualizar(null);
        return avisar(e instanceof Error ? e.message : String(e));
      }
      projeto.previsualizar(null);
      const ops: Operacao[] = [];
      let semPerfil = false;
      r.camadas.forEach((c, j) => {
        const idEsboco = crypto.randomUUID();
        ops.push({ id: idEsboco, tipo: "esboco", nome: nomeLivre(projeto, ops, "Esboço"), modo: "novo", params: {}, esboco: c.esboco });
        if (esc.resultado !== "extrusao") return;
        if (!c.material.length) return void (semPerfil = true);
        ops.push({
          id: crypto.randomUUID(),
          tipo: "extrusao",
          nome: nomeLivre(projeto, ops, "Extrusão"),
          modo: j === 0 ? "novo" : "unir",
          params: { distancia: c.altura },
          perfis: { esboco: idEsboco, indices: c.material },
        });
      });
      if (esc.tela === "sim") {
        // Mesma escala do contorno; o centro da peça fica na origem.
        const W = img.dados.width, H = img.dados.height;
        ops.push({
          id: crypto.randomUUID(),
          tipo: "tela",
          nome: nomeLivre(projeto, ops, "Tela"),
          modo: "novo",
          params: { largura: W * r.k, dx: (W / 2 - r.centro[0]) * r.k, dy: (r.centro[1] - H / 2) * r.k, giro: 0, opacidade: 40 },
          opcoes: { decalque: "nao" },
          planoBase: { ...PLANOS_ORIGEM[esc.plano === "XY" ? "XY" : "XZ"], origem: esc.plano === "XY" ? [0, 0, -0.05] : [0, -0.05, 0] },
          imagem: img.url,
        });
      }
      projeto.substituirVarias(ops);
      avisar(`Peça da imagem: ${r.info}.${semPerfil ? " Algum nível não fechou um perfil: ficou só o esboço dele." : ""}`);
    },
    aoCancelar: () => projeto.previsualizar(null),
  });
}

// Próximo nome livre contando também as operações ainda não adicionadas.
function nomeLivre(projeto: Projeto, novas: Operacao[], base: string): string {
  let n = 1;
  while (projeto.estado.historico.some((o) => o.nome === `${base}${n}`) || novas.some((o) => o.nome === `${base}${n}`)) n++;
  return `${base}${n}`;
}
