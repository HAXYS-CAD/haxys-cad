// Ferramentas do HAXYS CAD para as IAs, num lugar só: usadas pela ponte MCP (haxys-ponte.mjs),
// pelo servidor do PC (app/vite.config.ts: instruções do pedido) e pela página na nuvem
// (app/src/nuvem: o laço da IA roda na própria página). Só dados e funções puras: nada de "node:".

const ACOES = [
  "caixa", "cilindro", "esfera", "toroide", "esboco", "extrusao", "revolucao", "varredura", "tubulacao", "transicao",
  "furo", "furo_detalhado", "arredondar", "chanfrar", "casca", "rosca", "fixador", "bobina", "nervura", "teia", "relevo",
  "espelhar", "padrao_retangular", "padrao_circular", "padrao_caminho", "mover", "escala", "combinar", "dividir",
  "pressionar", "inclinacao", "espessar", "deslocar_face", "tapar_furos", "delimitador", "organizar",
  "aparencia", "material", "remover_corpo", "padrao_geometrico", "volume_fluido", "remover_recursos", "malha", "montagem", "secao_malha", "novo_projeto", "salvar_projeto", "abrir_projeto", "listar_projetos", "exportar", "mudar", "remover", "parametro", "desfazer", "refazer", "propriedades", "imprimir", "laser", "corte_encaixes", "verificar_impressao",
];

const COMO_CONSTRUIR = `Constrói no HAXYS CAD (CAD 3D parecido com o Autodesk Fusion) com uma lista de passos, feitos em ordem.
Se o HAXYS CAD estiver fechado, ele é aberto sozinho. Responda à pessoa em português do Brasil.
Unidades: mm e graus. Eixo Y é para cima; a mesa da impressora é o plano XZ (y = 0).
Cada passo é {"acao": ..., medidas...}. Qualquer passo pode ter "apelido": um nome seu para o corpo/esboço que ele cria;
use o apelido depois em corpo, corpos, esboco, perfil, caminho, alvo, ferramentas, secoes (vale também nos pedidos seguintes).
Corpo padrão de cada ação: o último criado. Esboço padrão: o último esboço.

PRIMITIVAS (x, y, z = posição; modo):
- caixa {comprimento (X), largura (Z), altura (Y)}: centro em x/z, base em y.
- cilindro {diametro, altura}: em pé (eixo Y), centro da base em (x,y,z). esfera {diametro}: centro. toroide {diametro, diametroSecao}.
modo: "novo" (padrão), "unir", "cortar" (tira material), "intersecao".

ESBOÇO: {"acao":"esboco", plano: "XZ" (chão, padrão) | "XY" (frente) | "YZ" (lado), deslocamento: mm ao longo da normal,
  ou naFace: "cima"|"baixo"|"frente"|"tras"|"direita"|"esquerda" (+ corpo) = desenha na face plana da ponta do corpo,
  formas: [...]}. Coordenadas (u, v) do plano:
    XZ: u = X, v = -Z (v positivo vai para Z negativo); normal +Y.   XY: u = X, v = Y; normal +Z.   YZ: u = -Z, v = Y; normal +X.
  Formas: {tipo:"retangulo", u, v (centro), largura, altura} ou {tipo:"retangulo", de:[u,v], ate:[u,v]};
    {tipo:"circulo", u, v, r ou diametro}; {tipo:"poligono", u, v, r (raio do canto), lados, angulo};
    {tipo:"ranhura", de:[u,v], ate:[u,v], largura}; {tipo:"elipse", u, v, rx, ry, angulo};
    {tipo:"contorno", pontos:[[u,v], [u,v], {para:[u,v], meio:[u,v]} (arco por 3 pontos), ...], fechado (padrão true)};
    {tipo:"arco", centro:[u,v], raio, de: graus, ate: graus (anti-horário)}; {tipo:"spline", pontos:[[u,v],...], fechado};
    {tipo:"texto", texto, u, v (canto de baixo à esquerda), altura} (sem acentos); {tipo:"ponto", u, v} (ponto solto).
  Formas fechadas dentro de outras viram furos. Caminhos (varredura, tubulação) = contorno com fechado: false.

DO ESBOÇO PARA 3D:
- extrusao {distancia (negativa = outro lado), modo, esboco?, extensao: "um" | "simetrico" (medida "metade" = distância de
  cada lado, ou "inteira") | "doisLados" (distancia2) | "ateObjeto" (objeto: corpo; vai no sentido do sinal da distância até
  encostar nele), afunilamento (graus, + afina), afunilamento2, inicio (deslocamento)}.
  Para furar/cortar a partir da face de cima: esboço naFace "cima" e extrusao com distancia negativa e modo "cortar".
- revolucao {eixo "X"|"Y"|"Z" (padrão Y), angulo (360), extensao "um"|"simetrico"|"doisLados" (angulo2), modo}:
  peças de torno = esboço "XY" com u = raio (X >= 0) e v = altura, eixo "Y".
- varredura {perfil: esboço do perfil, caminho: esboço do caminho, modo}: o perfil precisa encostar no começo do caminho.
- tubulacao {caminho, diametro, espessura (0 = maciço), modo, superficie (true = só a parede, sem volume)}. transicao {secoes: [esboços em ordem], regrada, modo}.
- relevo {esboco, profundidade, tipo "relevo" | "gravar"}: projeta o esboço na face da peça (bom para texto).
- nervura / teia {esboco (linhas abertas), espessura, profundidade (0 = até a peça), inverter}.

FUROS, ARESTAS, FACES:
- furo_detalhado {diametro, naFace (padrão "cima"), posicoes: [[a,b],...] (cima/baixo: [x,z]; frente/tras: [x,y];
  direita/esquerda: [z,y]; sem posicoes = centro da face), profundidade (sem = atravessa), tipo "simples"|"rebaixo"
  (diametroRebaixo, profundidadeRebaixo)|"escareado" (diametroEscareado, 90°), ponta "118"|"plana", corpo}.
- furo {diametro, x, z, profundidade}: furo vertical simples (antigo).
- arredondar {raio, raio2 (raio variável: do começo ao fim da aresta)} / chanfrar {distancia}: arestas "todas" | "verticais"
  | "de_cima" | "de_baixo". Arestas que continuam sem quina entram juntas (cadeia tangente).
  chanfrar também: tipoChanfro "igual" | "duas" (distancia2) | "angulo" (angulo, medido da face de referência);
  faceReferencia "horizontal" (padrão: a 1ª distância vale na face mais deitada) | "vertical".
- casca {espessura, abrir "cima"|"baixo"|"nenhuma" (oca fechada), direcao "dentro"|"fora"}: oco com parede. rosca {raio da face cilíndrica, tamanho "auto"|"M6"..., modelada, mao}.
- pressionar {faces, distancia} (empurra/puxa faces planas). inclinacao {angulo, faces (padrão "laterais"), plano "XZ"}.
- espessar {faces, espessura, direcao "fora"|"dentro"|"simetrico", modo}. deslocar_face {faces, distancia, raio}.
- tapar_furos {raio}: fecha furos redondos. faces = "cima"|"baixo"|"frente"|"tras"|"direita"|"esquerda"|"laterais"|"cilindricas".

CORPOS:
- espelhar {plano "YZ"|"XY"|"XZ", unir}. padrao_retangular {quantidade1, distancia1, direcao1 "X", quantidade2, distancia2,
  direcao2 "Z", unir} (distancia = entre uma cópia e a próxima). padrao_circular {quantidade, angulo (360), eixo "Y", unir}.
- padrao_caminho {corpo, caminho, quantidade, distancia (0 = caminho todo), orientacao "igual"|"caminho", unir}.
- mover {dx, dy, dz, rx, ry, rz, pivo "centro"|"origem", copiar}. escala {fator, pivo, copiar}.
- combinar {alvo, ferramentas: [corpos], operacao "unir"|"cortar"|"intersecao", manter}. dividir {plano, deslocamento}.
- fixador {tipo "sextavado"|"allen"|"porca"|"arruela", tamanho "M2".."M12", comprimento, rosca, x, y, z}.
- bobina {diametro, voltas, altura, secaoTamanho, secao "circulo"|"quadrado"|"triangulo", posicaoSecao, sentido}.
- delimitador {folga, forma "caixa"|"cilindro"}. organizar {largura 256, profundidade 256, espaco 5} (arruma na mesa).
- aparencia {aparencia: aco, acoEscuro, aluminio, latao, cobre, ferroFundido, plasticoBranco, plasticoPreto, plasticoCinza,
  plasticoVermelho, plasticoLaranja, plasticoAmarelo, plasticoVerde, plasticoAzul, borracha, madeira, vidro}.
- material {material: aco, acoInox, aluminio, latao, cobre, ferroFundido, pla, petg, abs, nylon, tpu, madeira, vidro}.
- remover_corpo {corpos}. padrao_geometrico {corpo, esboco (pontos soltos; sem pontos = centros dos círculos), unir}.
- volume_fluido {corpo, tampa "cima"|"nenhuma"|"baixo"|...}: corpo novo com o espaço de dentro (ex.: água no copo).
- remover_recursos {corpo, diametroMax}: tampa os furos redondos até esse diâmetro.
- malha {operacao, corpo}: "tesselar" (sólido → malha; o sólido fica), "escala" (fatorX/fatorY/fatorZ ou fator, pivo),
  "casca" (espessura: oca, para imprimir com menos material), "fronteira" (iteracoes: suaviza borda aberta),
  "grupos" (angulo), "reduzir" (proporcao %), "suavizar" (iteracoes), "reparar", "inverter", "separar",
  "converter" (malha → sólido), "corte" (plano, deslocamento, lado "positivo"|"negativo", tampar), "remover",
  "apagar" (faces "cima"|"baixo": apaga essa parte da malha e fecha o buraco), "alinhar" (alvo = malha ou sólido;
  metodo "ajuste" = melhor encaixe forma sobre forma | "centro"), "ponte" (liga as 2 bordas abertas; com corpos [a, b]
  junta as duas malhas antes), "atrair" (plano, deslocamento, distancia: pontos perto do plano vão para ele),
  "grupo_direcao" (direcao "+Y"|"-Y"|"+X"|"-X"|"+Z"|"-Z", angulo: triângulos virados para lá viram um grupo de faces).
- montagem {operacao}: "componente" {corpos, nome} (corpos que andam juntos) · "origem" {corpo, faces "cima"|..., dx, dy, dz}
  (Origem da junta) · "junta" {corpo (o que anda), faceCorpo, alvo (o que fica), faceAlvo, tipo "rigida"|"giratoria"|
  "deslizante"|"cilindrica"|"esferica"|"planar", angulo, distancia, afastamento, inverter, comoEsta, origem/origemAlvo =
  nome de Origem da junta} · "mover_junta" {nome, valor} (para no contato, se ligado) · "contato" {modo "conjunto" (com
  corpos)|"conjuntos"|"todos"|"desligado"} · "capturar" / "reverter" (posição das juntas) · "duplicar" {corpo} (cópia com juntas).
- secao_malha {corpo, plano "XZ"|"XY"|"YZ", deslocamento, tolerancia (0 = todos os pontos; 0,2 = simplifica)}: cria um
  esboço com o contorno do corte do corpo (bom para redesenhar peça escaneada); depois use extrusao nesse esboço.

PROJETO: mudar {operacao, medida, valor} · remover {operacao} · desfazer {} · refazer {} · parametro {nome, expressao}
  · propriedades {corpo} (volume, massa, caixa em volta) · imprimir {} (abre no Bambu Studio, na mesa da impressora
  escolhida pela pessoa — padrão Bambu Lab H2C — e diz se cabe) · laser {esboco | corpo, gravacao "cortar"|"gravar",
  altura (corte do corpo; sem = meio)}: SVG em mm aberto na Bambu Suite (laser 40 W: área 310 × 250 mm).
IMPRESSÃO EM PARTES: verificar_impressao {corpos?}: diz se cabe na mesa da impressora da pessoa (como está e deitada).
  corte_encaixes {corpo, plano "XZ" (corta na altura Y)|"YZ" (em X)|"XY" (em Z), deslocamento (mm do plano da origem),
  encaixe "pino" (pino num lado, furo com folga no outro)|"cavilha" (furos nos dois e cavilhas soltas)|"nenhum",
  quantidade (padrão 2), diametro (5), comprimento (10), folga (0,2), separar (10 mm entre as partes)}.
  Para peça maior que a mesa: corte em partes que caibam e confira de novo com verificar_impressao.
ARQUIVOS: novo_projeto {} (se havia trabalho não salvo, ele é guardado antes como "copia ...") · salvar_projeto {nome}
  (pasta HAXYS_CAD/projetos) · abrir_projeto {nome} · listar_projetos {} · exportar {formato "3mf"|"stl"|"step", nome,
  corpos?, qualidade "baixa"|"media"|"alta"} (pasta HAXYS_CAD/saida). Para começar uma peça nova do zero, use novo_projeto.

Exemplo (placa 60x60x6 com 4 furos de 5 mm a 10 mm das bordas e cantos arredondados):
[{"acao":"caixa","comprimento":60,"largura":60,"altura":6,"apelido":"placa"},
 {"acao":"arredondar","raio":5,"arestas":"verticais"},
 {"acao":"furo_detalhado","diametro":5,"posicoes":[[-20,-20],[20,-20],[-20,20],[20,20]]}]
Depois de construir, use ver_tela para conferir. Não apague o que já existe sem a pessoa pedir.`;

const num = { type: "number" };
const str = { type: "string" };
const lista = (items) => ({ type: "array", items });
const par = lista(num);
export const FERRAMENTAS = [
  {
    name: "abrir_haxys",
    description: "Abre o HAXYS CAD neste computador (se ainda não estiver aberto) e espera ele ficar pronto.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "construir",
    description: COMO_CONSTRUIR,
    inputSchema: {
      type: "object",
      properties: {
        passos: {
          type: "array",
          description: "Passos em ordem.",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              acao: { type: "string", enum: ACOES },
              apelido: str,
              comprimento: num, largura: num, altura: num, diametro: num, diametroSecao: num,
              x: num, y: num, z: num,
              modo: { type: "string", enum: ["novo", "unir", "cortar", "intersecao"] },
              plano: { type: "string", enum: ["XY", "XZ", "YZ"] }, deslocamento: num,
              naFace: { type: "string", enum: ["cima", "baixo", "frente", "tras", "direita", "esquerda"] },
              formas: lista({ type: "object", additionalProperties: true, properties: { tipo: { type: "string", enum: ["retangulo", "circulo", "poligono", "ranhura", "elipse", "contorno", "linhas", "arco", "spline", "texto", "ponto"] } }, required: ["tipo"] }),
              linhas: lista(par), fechado: { type: "boolean" },
              circulos: lista({ type: "object", properties: { u: num, v: num, r: num }, required: ["u", "v", "r"] }),
              esboco: str, perfil: str, caminho: str, secoes: lista(str),
              distancia: num, distancia2: num, perfis: lista({ type: "integer" }),
              extensao: { type: "string", enum: ["um", "simetrico", "doisLados", "ateObjeto"] }, objeto: str, raio2: num, medida: str,
              afunilamento: num, afunilamento2: num, inicio: num, angulo: num, angulo2: num,
              corpo: str, corpos: lista(str), profundidade: num, raio: num,
              eixo: { type: "string", enum: ["X", "Y", "Z"] },
              arestas: { type: "string", enum: ["todas", "verticais", "de_cima", "de_baixo"] },
              faces: { type: "string", enum: ["cima", "baixo", "frente", "tras", "direita", "esquerda", "laterais", "cilindricas"] },
              espessura: num, abrir: { type: "string", enum: ["cima", "baixo", "nenhuma"] }, direcao: str, tipoChanfro: { type: "string", enum: ["igual", "duas", "angulo"] }, faceReferencia: { type: "string", enum: ["horizontal", "vertical"] }, unir: { type: "boolean" },
              posicoes: lista(par), tipo: str, diametroRebaixo: num, profundidadeRebaixo: num, diametroEscareado: num,
              quantidade: { type: "integer" }, quantidade1: { type: "integer" }, quantidade2: { type: "integer" },
              distancia1: num, direcao1: { type: "string", enum: ["X", "Y", "Z"] }, direcao2: { type: "string", enum: ["X", "Y", "Z"] },
              dx: num, dy: num, dz: num, rx: num, ry: num, rz: num,
              pivo: { type: "string", enum: ["centro", "origem"] }, copiar: { type: "boolean" }, fator: num,
              alvo: str, ferramentas: lista(str), operacao: str, manter: { type: "boolean" },
              valor: num, nome: str, expressao: str,
              gravacao: { type: "string", enum: ["cortar", "gravar"] },
              encaixe: { type: "string", enum: ["pino", "cavilha", "nenhum"] }, folga: num, separar: num,
              faceCorpo: str, faceAlvo: str, origem: str, origemAlvo: str, afastamento: num, inverter: { type: "boolean" }, comoEsta: { type: "boolean" }, metodo: str,
              aparencia: str, material: str, tamanho: str,
              formato: { type: "string", enum: ["3mf", "stl", "step"] }, qualidade: { type: "string", enum: ["baixa", "media", "alta"] },
            },
            required: ["acao"],
          },
        },
      },
      required: ["passos"],
    },
  },
  {
    name: "estado_do_projeto",
    description: "Diz o que já existe no projeto aberto no HAXYS: operações (com nomes e medidas), corpos (caixa em volta, mm) e parâmetros.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ver_tela",
    description: "Foto (PNG) da janela 3D do HAXYS, para conferir a peça. enquadrar (padrão true) ajusta a câmera para mostrar todos os corpos.",
    inputSchema: { type: "object", properties: { enquadrar: { type: "boolean" } } },
  },
];

// Instruções do pedido de IA (painel de voz): iguais no PC e na nuvem.
export const INSTRUCOES = `Você é o assistente do painel de voz do HAXYS CAD (CAD 3D parecido com o Autodesk Fusion).
Use só as ferramentas do servidor haxys (construir, estado_do_projeto, ver_tela) para olhar e mudar a peça.
Antes de mudar uma peça que já existe, veja o estado_do_projeto. Não apague nada sem a pessoa pedir.
A resposta final vai ser lida em voz alta: responda em português do Brasil, em 1 a 3 frases curtas, com os números importantes (medidas, volume).`;

// Pedido "Replicar peça da foto": a IA estuda as fotos (com o marcador HAXYS de
// 40 mm e a régua, se houver), pesquisa a peça na internet, constrói, confere e
// vê se cabe na impressora; se não couber, corta com encaixes.
export const INSTRUCOES_REPLICA = `MODO REPLICAR PEÇA DA FOTO. Objetivo: replicar a peça das fotos com a maior precisão possível.
1. Estude todas as fotos anexadas. Medidas: se houver o marcador HAXYS (quadrado preto de 40 mm com quadrado branco de 20 mm no meio)
   ou a régua de 150 mm, use-os como escala (meça em pixels e converta). As medidas que a pessoa informou valem mais que as estimadas.
   Se a folha de referência inteira aparecer, confira a impressão: a folha A4 tem 210 mm de largura; se pela régua/marcador ela der
   outra largura, a impressão saiu encolhida: use a largura da folha (210 mm) como escala e avise a pessoa.
   A escala da folha só vale na altura do papel: partes altas da peça parecem maiores (mais perto da câmera).
   Paquímetro ou régua nas fotos: leia as medidas neles (escala principal + nônio) e prefira essas às da folha.
   Não copie medidas do projeto que já está aberto: ele pode ser outra peça. Sem nenhuma escala na foto, estime pelo
   tipo de peça (pesquisa de medidas padrão) e diga que é estimativa.
2. Pesquise na internet a peça (nome, uso, medidas padrão, normas, rosca, encaixes) para completar o que a foto não mostra.
3. Construa com a ferramenta construir (novo_projeto primeiro), em partes lógicas: base, furos, detalhes, arredondamentos.
4. Confira com ver_tela e estado_do_projeto, compare com a foto e corrija.
5. Rode verificar_impressao. Se não couber na impressora da pessoa, use corte_encaixes (pinos ou cavilhas) até caber e confira de novo.
   Encaixe imprimível: diâmetro do pino ≈ metade da espessura da peça no corte (mínimo 2 mm), comprimento ≈ 2 a 3 × o diâmetro,
   folga 0,2 mm; corte longe de furos. Se a peça tiver menos de 4 mm de espessura no corte, avise que o encaixe fica fraco.
6. Na resposta: diga as medidas principais que você usou e de onde vieram (marcador, informado, pesquisa ou estimado), se cabe
   inteira ou em quantas partes, e faça UMA pergunta curta sobre o que ajustar ou confirmar.`;

// Pedido completo que vai para a IA (mesma montagem em todo lugar).
export function montarPedido({ texto, conversa, replica }) {
  return `${INSTRUCOES}\n${replica ? `\n${INSTRUCOES_REPLICA}\n` : ""}${conversa ? `\nConversa recente:\n${conversa}\n` : ""}\nPedido da pessoa: ${texto}`;
}

// Texto da resposta de cada ferramenta, a partir do que a tela devolveu (atender em app/src/ui/ponte.ts).
// imagem = PNG em base64, sem o prefixo "data:".
export function textoDaFerramenta(nome, r) {
  if (nome === "construir") {
    const linhas = [r.erro ? `ERRO no ${r.erro}` : "Feito sem erro.", ...(r.feitos ?? []), ...(r.logs?.length ? ["Registro:", ...r.logs] : []), "", "[Estado atual do projeto]", r.estado ?? ""];
    return { texto: linhas.join("\n"), erro: !!r.erro };
  }
  if (nome === "estado_do_projeto") return { texto: r.estado ?? r.erro ?? "", erro: false };
  if (nome === "ver_tela") {
    if (!r.imagem) return { texto: r.erro ?? "Sem imagem.", erro: true };
    return { texto: r.estado ?? "", erro: false, imagem: String(r.imagem).replace(/^data:image\/png;base64,/, "") };
  }
  return { texto: `Ferramenta "${nome}" não existe.`, erro: true };
}
