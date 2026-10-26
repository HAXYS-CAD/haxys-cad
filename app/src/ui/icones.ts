// Ícones próprios do HAXYS CAD (não usamos ícones da Autodesk): desenhos simples
// em 24×24, no espírito do Fusion (peças em perspectiva). A cor de destaque vem
// do painel; o traço e o cinza vêm do tema (claro/escuro), pelas classes em
// estilo.css: l = linha, f = face na cor do painel, m = face clara, n = face
// cinza, a = seta laranja, ok = verde de concluir.
// Cada ferramenta acha o desenho pelo id e pelo nome (lista REGRAS, a primeira
// que casar). Sem desenho: iniciais, como antes.
const coresPorPainel: Record<string, string> = {
  Criar: "#2f7de1",
  CRIAR: "#2f7de1",
  Modificar: "#d9822b",
  MODIFICAR: "#d9822b",
  MONTAGEM: "#7a5bd6",
  Construir: "#c9a227",
  Inspecionar: "#2a9d8f",
  Inserir: "#4f8a3c",
  INSERIR: "#4f8a3c",
  Selecionar: "#5f6b7a",
  RESTRIÇÕES: "#b5455a",
};

// Bloco em perspectiva: topo centrado em (cx, cy), meia largura w, altura h.
function cubo(cx: number, cy: number, w: number, h: number, topo = "m", esq = "f", dir = "n"): string {
  const t = w / 2;
  return `<path class="${topo}" d="M${cx} ${cy - t} ${cx + w} ${cy} ${cx} ${cy + t} ${cx - w} ${cy}Z"/>` +
    `<path class="${esq}" d="M${cx - w} ${cy} ${cx} ${cy + t}v${h}l${-w} ${-t}Z"/>` +
    `<path class="${dir}" d="M${cx} ${cy + t}l${w} ${-t}v${h}l${-w} ${t}Z"/>`;
}
const CUBO = cubo(12, 7.5, 8, 9);
const BASE = `<path class="n" d="M12 14 21 18.5 12 23 3 18.5Z"/>`;
const SETA_CIMA = `<path class="a" d="M19 9V2.5M17 4.5l2-2 2 2"/>`;
const PONTO = (x: number, y: number) => `<circle class="f" cx="${x}" cy="${y}" r="1.8"/>`;
const PLANO = `<path class="m" d="M2 15 9 8h13l-7 7Z"/>`;

const D: Record<string, string> = {
  esboco: `${PLANO}<path class="l" d="M7 13h7"/><path class="f" d="m14 3 4 4-8 8H6v-4Z"/>`,
  extrusao: `${BASE}${cubo(12, 10, 6, 6)}${SETA_CIMA}`,
  revolucao: `<path class="f" d="M9 4h4l2 5-2 10H9Z"/><path class="l" d="M9 2v20" stroke-dasharray="2 2"/><path class="a" d="M17 6a8 4 0 1 1-8 13"/><path class="a" d="m7 17 2 2-2 2"/>`,
  varredura: `<path class="l" d="M3 20C8 20 6 6 20 5" stroke-dasharray="2 2"/><path class="f" d="M2 16h3v6H2Z"/><path class="m" d="M5 16c4 0 3-10 14-12v4C9 10 10 20 5 22Z"/>`,
  transicao: `<path class="f" d="M3 17 8 14l5 3-5 3Z"/><circle class="m" cx="16" cy="6" r="4"/><path class="l" d="M3 17 12 6M13 17l7-11M8 20l8-10"/>`,
  nervura: `<path class="n" d="M2 15 12 20l10-5-10-5Z"/><path class="f" d="M7 7l5 2.5v8L7 15Z"/><path class="m" d="m7 7 2-1 5 2.5-2 1Z"/>`,
  furo: `${CUBO}<ellipse class="l" cx="12" cy="7.5" rx="3.5" ry="1.8"/><path class="a" d="M12 1v5M10 4l2 2 2-2"/>`,
  rosca: `<path class="m" d="M7 5h10v15H7Z"/><path class="l" d="m7 7 10 2M7 11l10 2M7 15l10 2"/><ellipse class="f" cx="12" cy="5" rx="5" ry="2"/>`,
  caixa: CUBO,
  cilindro: `<path class="f" d="M5 6v12a7 3 0 0 0 14 0V6"/><ellipse class="m" cx="12" cy="6" rx="7" ry="3"/>`,
  esfera: `<circle class="f" cx="12" cy="12" r="9"/><ellipse class="l" cx="12" cy="12" rx="9" ry="3"/><circle class="m" cx="9" cy="8" r="2" stroke="none"/>`,
  toroide: `<ellipse class="f" cx="12" cy="12" rx="10" ry="6"/><ellipse class="n" cx="12" cy="11" rx="4" ry="2"/>`,
  bobina: `<path class="a" d="M6 4h12M6 4c-3 2 15 2 12 4S3 10 6 12s15 2 12 4-15 2-12 4h12"/>`,
  tubo: `<path class="f" d="M3 9h12a5 5 0 0 1 5 5v7h-6v-6H3Z"/><ellipse class="m" cx="3" cy="12" rx="1.5" ry="3"/>`,
  padraoRet: `${cubo(7, 5, 4, 4)}${cubo(17, 5, 4, 4)}${cubo(7, 14, 4, 4)}${cubo(17, 14, 4, 4)}`,
  padraoCirc: `${cubo(12, 2.5, 3, 3)}${cubo(19, 10, 3, 3)}${cubo(12, 16.5, 3, 3)}${cubo(5, 10, 3, 3)}<circle class="l" cx="12" cy="11.5" r="1"/>`,
  padraoCaminho: `<path class="l" d="M2 20C8 18 10 6 22 4" stroke-dasharray="2 2"/>${cubo(4, 16, 2.5, 3)}${cubo(11, 10, 2.5, 3)}${cubo(19, 3, 2.5, 3)}`,
  espelhar: `<path class="f" d="M3 6h7v12H3Z"/><path class="m" d="M14 6h7v12h-7Z"/><path class="l" d="M12 2v20" stroke-dasharray="2 2"/>`,
  espessar: `<path class="f" d="M2 12c6-6 14-6 20 0v4c-6-6-14-6-20 0Z"/>`,
  arredondar: `<path class="f" d="M4 21V11a7 7 0 0 1 7-7h10v17Z"/><path class="a" d="M4 11a7 7 0 0 1 7-7"/>`,
  chanfro: `<path class="f" d="M4 21V10l6-6h11v17Z"/><path class="a" d="m4 10 6-6"/>`,
  casca: `${CUBO}<path class="n" d="M12 5 16.5 7.5 12 10 7.5 7.5Z"/>`,
  inclinacao: `<path class="f" d="M6 21 9 4h6l3 17Z"/><path class="l" d="M9 4v17" stroke-dasharray="2 2"/>`,
  escala: `<path class="m" d="M3 9h12v12H3Z"/><path class="f" d="M3 15h6v6H3Z"/><path class="a" d="M12 12 21 3M16 3h5v5"/>`,
  combinar: `${cubo(9, 9, 6, 7)}${cubo(15, 6, 6, 7, "m", "m", "n")}`,
  dividir: `${CUBO}<path class="a" d="M4 4 20 20"/>`,
  mover: `<path class="a" d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/><rect class="f" x="9" y="9" width="6" height="6"/>`,
  alinhar: `<path class="f" d="M4 4h7v7H4Z"/><path class="m" d="M13 13h7v7h-7Z"/><path class="a" d="M4 22h18M11 13 4 22"/>`,
  pressionar: `${cubo(12, 9, 7, 8)}<path class="a" d="M12 8V1M10 3l2-2 2 2"/>`,
  face: `${CUBO}<path class="a" d="M14 15h8M19 12l3 3-3 3"/>`,
  apagar: `<path class="a" d="m5 5 14 14M19 5 5 19"/>`,
  parametro: `<text x="1" y="17" font-size="12" font-style="italic">f(x)</text>`,
  aparencia: `<circle class="f" cx="12" cy="12" r="9"/><circle class="m" cx="8" cy="9" r="2.5"/><circle class="n" cx="14" cy="7" r="2"/><circle class="n" cx="15" cy="14" r="2.5"/>`,
  material: `<circle class="f" cx="12" cy="12" r="9"/><path class="m" d="M5 8a9 9 0 0 1 9-5 6 6 0 0 0-9 5Z"/><path class="l" d="M3 13h18"/>`,
  componente: `${CUBO}<path class="l" d="M2 2h5M2 2v5"/>`,
  junta: `${cubo(8, 13, 5, 5)}${cubo(16, 5, 5, 5, "m", "m", "n")}<path class="a" d="M12 4v16"/>`,
  plano: `${PLANO}<path class="l" d="M6 11h9" stroke-dasharray="2 2"/>`,
  eixo: `${PLANO}<path class="a" d="M12 2v20"/>`,
  ponto: `${PLANO}${PONTO(12, 11.5)}`,
  medir: `<path class="f" d="m2 16 14-14 6 6L8 22Z"/><path class="l" d="m6 12 2 2m1-5 2 2m1-5 2 2m1-5 2 2"/>`,
  corte: `${cubo(12, 7.5, 8, 9, "m", "f", "m")}<path class="a" d="M12 3v18"/>`,
  interferencia: `${cubo(9, 9, 6, 7)}${cubo(15, 6, 6, 7, "m", "m", "n")}<path class="a" d="m11 8 4 4m0-4-4 4"/>`,
  analise: `<path class="f" d="M3 18C3 9 21 9 21 18Z"/><path class="l" d="M6 17c2-5 4-6 6-6M10 17c1-3 3-4 5-4M14 17c1-2 2-2 4-2"/>`,
  selecionar: `<path class="f" d="M5 3v16l4-4 3 7 3-1-3-7h6Z"/>`,
  malha: `<path class="m" d="M2 20 12 3l10 17Z"/><path class="l" d="M7 11.5h10M12 3 7 20M12 3l5 17M2 20l10-8.5L22 20"/>`,
  linha: `<path class="l" d="M4 19 20 5"/>${PONTO(4, 19)}${PONTO(20, 5)}`,
  retangulo: `<path class="l" d="M3 6h18v12H3Z"/>${PONTO(3, 18)}${PONTO(21, 6)}`,
  circulo: `<circle class="l" cx="12" cy="12" r="8"/>${PONTO(12, 12)}`,
  arco: `<path class="l" d="M4 18a9 9 0 0 1 16 0"/>${PONTO(4, 18)}${PONTO(20, 18)}${PONTO(12, 10.5)}`,
  poligono: `<path class="l" d="m12 3 8 5v9l-8 5-8-5V8Z"/>${PONTO(12, 12)}`,
  elipse: `<ellipse class="l" cx="12" cy="12" rx="9" ry="5"/>${PONTO(12, 12)}`,
  ranhura: `<path class="l" d="M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7Z"/>${PONTO(7, 12)}${PONTO(17, 12)}`,
  spline: `<path class="l" d="M2 18C6 2 12 22 22 6"/>${PONTO(2, 18)}${PONTO(8, 9)}${PONTO(15, 15)}${PONTO(22, 6)}`,
  texto: `<text x="5" y="19" font-size="18">T</text>`,
  cota: `<path class="l" d="M4 6v14M20 6v14"/><path class="a" d="M4 12h16M7 10l-3 2 3 2M17 10l3 2-3 2"/>`,
  recortar: `<circle class="l" cx="6" cy="17" r="3"/><circle class="l" cx="6" cy="7" r="3"/><path class="a" d="M8.5 15.5 21 5M8.5 8.5 21 19"/>`,
  estender: `<path class="l" d="M3 19 12 10"/><path class="a" d="M12 10l7-7" stroke-dasharray="2 2"/><path class="l" d="M14 3h8"/>`,
  deslocamento: `<path class="l" d="M3 20C3 10 10 4 20 4"/><path class="a" d="M8 20c0-7 5-11 12-11"/>`,
  projetar: `${PLANO}<path class="f" d="M9 2h6v5H9Z"/><path class="a" d="M12 7v5"/>`,
  rest_h: `<path class="l" d="M3 15h18"/><text x="8" y="11" font-size="9">H</text>`,
  rest_coincidente: `<path class="l" d="M3 19 12 12M21 19 12 12"/>${PONTO(12, 12)}`,
  rest_tangente: `<circle class="l" cx="12" cy="9" r="6"/><path class="a" d="M3 15h18"/>`,
  rest_igual: `<path class="a" d="M5 9h14M5 15h14"/>`,
  rest_paralelo: `<path class="a" d="M8 20 14 4M12 20l6-16"/>`,
  rest_perpendicular: `<path class="a" d="M4 20h16M12 20V4"/>`,
  rest_fixar: `<path class="f" d="M6 11h12v10H6Z"/><path class="l" d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  rest_meio: `<path class="l" d="M3 18h18"/><path class="f" d="m12 11 4 7H8Z"/>`,
  rest_concentrico: `<circle class="l" cx="12" cy="12" r="9"/><circle class="a" cx="12" cy="12" r="4"/>`,
  rest_colinear: `<path class="l" d="M2 16 10 12"/><path class="a" d="m14 10 8-4"/>`,
  rest_simetria: `<path class="l" d="M12 3v18" stroke-dasharray="2 2"/><path class="a" d="M3 8h5v8H3M21 8h-5v8h5"/>`,
  rest_curvatura: `<path class="l" d="M3 18h8"/><path class="a" d="M11 18c5 0 9-4 10-12"/>`,
  rest_auto: `<path class="a" d="M4 20h16M12 20V4"/><path class="f" d="m17 3 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>`,
  concluir: `<circle class="m" cx="12" cy="12" r="10"/><path class="ok" d="m7 12 3.5 3.5L17 9"/>`,
  imagem: `<path class="m" d="M2 4h20v16H2Z"/><path class="f" d="m2 20 7-8 5 5 3-3 5 6Z"/><circle class="n" cx="16" cy="8" r="2"/>`,
  imprimir: `<path class="n" d="M3 3h18v18H3Z"/><path class="l" d="M3 7h18"/><path class="f" d="M10 8h4v4l-2 2-2-2Z"/><path class="m" d="M6 19h12v-3H6Z"/>`,
  laser: `<path class="n" d="M8 2h8v7H8Z"/><path class="a" d="M12 9v10"/><path class="l" d="M3 21h18"/><path class="a" d="m9 21 3-2 3 2"/>`,
  voz: `<rect class="f" x="9" y="2" width="6" height="12" rx="3"/><path class="l" d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>`,
  referencia: `<path class="n" d="M3 3h12v12H3Z"/><path class="m" d="M6 6h6v6H6Z"/><path class="f" d="M2 18h20v4H2Z"/><path class="l" d="M6 18v2m4-2v2m4-2v2m4-2v2"/>`,
  corteEncaixes: `${cubo(7, 8, 5, 8)}${cubo(17, 8, 5, 8, "m", "m", "n")}<circle class="f" cx="12" cy="12" r="1.5"/>`,
  lista: `<path class="n" d="M4 2h16v20H4Z"/><path class="l" d="M8 7h8M8 12h8M8 17h5"/>`,
  script: `<path class="a" d="m8 6-6 6 6 6M16 6l6 6-6 6M14 4l-4 16"/>`,
  nuvem: `<path class="m" d="M6 19a5 5 0 0 1 0-10 7 7 0 0 1 13 2 4 4 0 0 1-1 8Z"/>`,
  fixador: `<path class="f" d="M5 3h14v5H5Z"/><path class="m" d="M9 8h6v14H9Z"/><path class="l" d="m9 11 6 2m-6 2 6 2m-6 2 6 2"/>`,
  delimitador: `${cubo(12, 9, 5, 5)}<path class="l" d="M2 2h20v20H2Z" stroke-dasharray="2 2"/>`,
  superficie: `<path class="f" d="M2 18c5-8 9 0 14-8l6 4c-5 8-9 0-14 8Z"/>`,
  configurar: `<path class="n" d="M3 4h18v16H3Z"/><path class="l" d="M3 9h18M3 14h18M9 4v16"/>`,
  calcular: `<path class="a" d="M20 12a8 8 0 1 1-3-6.2M17 2v4h-4"/>`,
  posicao: `<rect class="n" x="3" y="7" width="18" height="13" rx="2"/><circle class="f" cx="12" cy="13.5" r="4"/><path class="l" d="M8 7l2-3h4l2 3"/>`,
  contato: `${cubo(7, 10, 5, 6)}${cubo(17, 10, 5, 6)}<path class="a" d="M12 5v14"/>`,
  exportar: `<path class="n" d="M5 2h10l4 4v16H5Z"/><path class="a" d="M12 18V9M9 12l3-3 3 3"/>`,
  abrir: `<path class="m" d="M2 5h7l2 2h11v13H2Z"/>`,
  desenhar: `<path class="f" d="m15 3 6 6L9 21H3v-6Z"/>`,
};

// [desenho, padrão no texto "id nome" sem acento e em minúsculas]. A primeira que casar vale.
const REGRAS: [string, RegExp][] = [
  ["concluir", /stop\b|accept|concluir|finish/],
  ["rest_auto", /autoconstraint|restricao automatica/],
  ["rest_h", /constrainthorizontal|horizontal\/vertical/],
  ["rest_coincidente", /coincident/],
  ["rest_tangente", /constrainttangent/],
  ["rest_igual", /constraintequal/],
  ["rest_paralelo", /constraintparallel/],
  ["rest_perpendicular", /constraintperpendicular/],
  ["rest_fixar", /constraintfix|fixar\/desfixar/],
  ["rest_meio", /constraintmidpoint/],
  ["rest_concentrico", /concentric/],
  ["rest_colinear", /collinear/],
  ["rest_simetria", /constraintsymmetry/],
  ["rest_curvatura", /constraintsmooth/],
  ["rest_tangente", /restricao de tangente/],
  ["rest_perpendicular", /restricao de angulo|restricao as-built/],
  ["voz", /haxysvoz|falar com/],
  ["laser", /laser/],
  ["imprimir", /bambu|imprimir|3dprint|print/],
  ["referencia", /referencia de medidas|haxysreferencia/],
  ["corteEncaixes", /encaixes/],
  ["imagem", /haxysimagem|imagem|canvas|\btela\b|decal/],
  ["esboco", /sketchcreate|criar esboco|editsketch|^esboco /],
  ["cota", /dimension|\bcota/],
  ["texto", /\btext|texto/],
  ["linha", /polyline|\blinha\b|drawline/],
  ["retangulo", /rectangle|retangulo/],
  ["ranhura", /slot|ranhura/],
  ["elipse", /ellipse|elipse/],
  ["poligono", /polygon|poligono/],
  ["circulo", /circle|circulo/],
  ["arco", /\barc|\barco/],
  ["spline", /spline|conic|conica|blend|mesclagem/],
  ["recortar", /trim|recortar|aparar|break|quebrar/],
  ["estender", /extend|estender/],
  ["projetar", /project|projetar|incluir|intersect/],
  ["deslocamento", /^offset\b|^offset |deslocamento$/],
  ["superficie", /surface|patch|remendo|stitch|costurar|ruled|regrada|replaceface|substituir/],
  ["extrusao", /extrud|extrus/],
  ["revolucao", /revolve|revolucionar|rotacionado/],
  ["varredura", /sweep|varredura/],
  ["transicao", /loft|transicao/],
  ["nervura", /\brib|nervura|\bweb|\brede\b|emboss|relevo|boss|apoio|\blip|labio/],
  ["furo", /hole|furo/],
  ["rosca", /thread|rosca/],
  ["fixador", /fastener|fixacao|parafuso/],
  ["bobina", /coil|bobina/],
  ["tubo", /pipe|tubulacao|tubo/],
  ["caixa", /\bbox\b|primitivebox|\bcaixa\b/],
  ["cilindro", /cylinder|cilindro|fluido/],
  ["esfera", /sphere|esfera/],
  ["toroide", /torus|toroide/],
  ["padraoRet", /patternrect|padrao retangular|organizar|aninhamento|pacote/],
  ["padraoCirc", /patterncirc|padrao circular/],
  ["padraoCaminho", /pattern|padrao/],
  ["espelhar", /mirror|espelhar/],
  ["espessar", /thicken|espessar/],
  ["arredondar", /fillet|arredond/],
  ["chanfro", /chamfer|chanfr/],
  ["casca", /shell|casca|hollow/],
  ["inclinacao", /draft|inclinacao/],
  ["escala", /scale|escala|dimensionar/],
  ["combinar", /combine|combinar|merge/],
  ["dividir", /split|dividir|cut|corte do plano/],
  ["pressionar", /presspull|pressionar/],
  ["face", /face|deslocar/],
  ["alinhar", /align|alinhar/],
  ["mover", /move|mover/],
  ["apagar", /delete|apagar|remove|remover|excluir/],
  ["parametro", /parameter|parametr/],
  ["aparencia", /appearance|aparencia/],
  ["material", /material/],
  ["junta", /joint|junta|mate|restringir componentes|motion|movimento|rigid|rigido/],
  ["contato", /contact|contato/],
  ["componente", /component|componente/],
  ["eixo", /axis|eixo|coordenadas|ucs/],
  ["ponto", /constructionpoint|ponto|centro de massa/],
  ["plano", /plane|plano/],
  ["medir", /measure|medir/],
  ["corte", /section|corte/],
  ["interferencia", /interference|interferencia/],
  ["analise", /analysis|analise|zebra|curvature|curvatura|cores de componentes/],
  ["selecionar", /select|localizar/],
  ["malha", /mesh|malha|trelica|tessel|remesh|reduzir|reparar|repair|facegroup|grupo de faces|quad/],
  ["lista", /bom|lista de materiais|navegador|historico|estatistica|note|observacao|tolerancia/],
  ["script", /script|complemento|add-in/],
  ["nuvem", /pim|task|tarefa|liberac|pedido|painel|detalhes|dashboard|marketplace|sustainab|cloud|derive|derivacao|similar|semelhante|resumo/],
  ["delimitador", /bounding|delimitador/],
  ["configurar", /config|regras|tabela/],
  ["calcular", /compute|calcular/],
  ["posicao", /snapshot|position|posicao|capturar|reverter/],
  ["exportar", /export|salvar|save/],
  ["abrir", /insert|inserir|import|abrir/],
  ["desenhar", /sketch|esboco|form|forma|modelagem|operacao base/],
];

const cache = new Map<string, string | null>();
function desenhoDe(texto: string): string | null {
  if (!cache.has(texto)) {
    const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    cache.set(texto, REGRAS.find(([, re]) => re.test(t))?.[0] ?? null);
  }
  return cache.get(texto)!;
}

function iniciais(nome: string): string {
  const palavras = nome
    .replace(/[()/]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-Z0-9]/.test(p));
  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0].slice(0, 2);
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}

// nome: o que a pessoa lê; id: o id da ferramenta (ou o tipo da operação), ajuda a achar o desenho.
export function icone(nome: string, painel: string, tamanho = 32, id = ""): string {
  const cor = coresPorPainel[painel] ?? "#6b7785";
  const desenho = desenhoDe(id ? `${id} ${nome}` : nome);
  const corpo = desenho
    ? D[desenho]
    : `<rect class="f" x="2" y="2" width="20" height="20" rx="4"/><text class="branco" x="12" y="13" text-anchor="middle" dominant-baseline="middle" font-size="9">${iniciais(nome)}</text>`;
  return `<svg class="ico" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" style="--c:${cor}" aria-hidden="true">${corpo}</svg>`;
}

// Quantas ferramentas ficam com desenho (para conferir no console).
export const desenhoDaFerramenta = desenhoDe;
