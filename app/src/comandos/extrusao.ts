// Comando Extrusão (atalho E). Clique nos perfis (regiões laranja) de um esboço;
// clicar de novo retira. Se só existe um perfil na tela, ele já vem escolhido.
// Distância negativa = para o outro lado. Ao terminar, o esboço usado é escondido.
// Extensão: Um lado, Simétrico (Metade/Inteira), Dois lados ou Até o objeto
// (vai no sentido da distância até encostar no corpo escolhido); Afunilamento e
// Início deslocado, como no Fusion. Diferenças: os campos aparecem todos (os que
// não valem para a extensão escolhida são ignorados); sem seta para arrastar,
// "Até o objeto" só até um corpo (não até face/plano); sem extrudar faces de
// corpos (use Pressionar/puxar).
import { abrirDialogo } from "../ui/dialogo";
import type { Operacao } from "../nucleo/tipos";
import type { Projeto } from "../nucleo/projeto";
import { definirEscolhedor } from "./escolhaPerfil";

export interface PerfilVisivel {
  esboco: string;
  indice: number;
}

// Escolha de perfis de um único esboço (como no Fusion, dentro de um comando).
export class EscolhaDePerfis {
  esboco = "";
  indices: number[] = [];

  constructor(existente: Operacao["perfis"] | undefined, visiveis: PerfilVisivel[]) {
    if (existente) (this.esboco = existente.esboco), (this.indices = [...existente.indices]);
    else if (visiveis.length === 1) (this.esboco = visiveis[0].esboco), (this.indices = [visiveis[0].indice]);
  }

  alternar(esboco: string, indice: number) {
    if (this.esboco !== esboco) (this.esboco = esboco), (this.indices = []);
    const i = this.indices.indexOf(indice);
    if (i >= 0) this.indices.splice(i, 1);
    else this.indices.push(indice);
  }

  tem(esboco: string, indice: number) {
    return this.esboco === esboco && this.indices.includes(indice);
  }

  texto() {
    const n = this.indices.length;
    return n === 0 ? "Nenhum — clique numa região" : `${n} perfi${n > 1 ? "s" : "l"}`;
  }

  dados() {
    return { esboco: this.esboco, indices: [...this.indices] };
  }
}

export function comandoExtrusao(
  raiz: HTMLElement,
  projeto: Projeto,
  perfisVisiveis: () => PerfilVisivel[],
  aoTerminar: (esboco: string) => void,
  redesenhar: () => void,
  existente?: Operacao,
) {
  const id = existente?.id ?? crypto.randomUUID();
  const nome = existente?.nome ?? projeto.proximoNome("Extrusão");
  const escolha = new EscolhaDePerfis(existente?.perfis, perfisVisiveis());

  const montar = (params: Record<string, number>, modo: Operacao["modo"], opcoes: Record<string, string>): Operacao => ({
    id,
    tipo: "extrusao",
    nome,
    modo,
    params,
    opcoes,
    perfis: escolha.dados(),
    suprimida: existente?.suprimida,
  });

  let ultimo: { params: Record<string, number>; modo: Operacao["modo"]; opcoes: Record<string, string> } = { params: {}, modo: "novo", opcoes: {} };
  const mostrarPrevia = () =>
    projeto.previsualizar(escolha.indices.length ? montar(ultimo.params, ultimo.modo, ultimo.opcoes) : null);

  const fechar = () => {
    definirEscolhedor(null);
    redesenhar();
  };

  const dialogo = abrirDialogo(raiz, {
    titulo: existente ? `Editar ${nome}` : "Extrusão",
    campos: [
      { chave: "distancia", rotulo: "Distância", valor: existente?.params.distancia ?? 10 },
      { chave: "afunilamento", rotulo: "Ângulo de afunilamento", valor: existente?.params.afunilamento ?? 0, unidade: "°" },
      { chave: "distancia2", rotulo: "Distância (lado 2)", valor: existente?.params.distancia2 ?? 10 },
      { chave: "afunilamento2", rotulo: "Afunilamento (lado 2)", valor: existente?.params.afunilamento2 ?? 0, unidade: "°" },
      { chave: "inicio", rotulo: "Início: deslocamento", valor: existente?.params.inicio ?? 0 },
    ],
    escolhas: [
      { chave: "extensao", rotulo: "Direção", opcoes: [["um", "Um lado"], ["simetrico", "Simétrico"], ["doisLados", "Dois lados"], ["ateObjeto", "Até o objeto"]], valor: existente?.opcoes?.extensao ?? "um" },
      {
        chave: "objeto",
        rotulo: "Objeto (até o objeto)",
        opcoes: [["", "—"], ...projeto.estado.corposBase.map((c) => [c.nome, c.nome] as [string, string])],
        valor: existente?.opcoes?.objeto ?? "",
      },
      { chave: "medida", rotulo: "Medida (simétrico)", opcoes: [["metade", "Metade do comprimento"], ["inteira", "Comprimento inteiro"]], valor: existente?.opcoes?.medida ?? "metade" },
    ],
    modo: existente?.modo ?? (projeto.estado.corposBase.length ? "unir" : "novo"),
    selecao: escolha.texto(),
    rotuloSelecao: "Perfis",
    aoMudar: (params, modo, opcoes) => {
      ultimo = { params, modo, opcoes };
      mostrarPrevia();
    },
    aoOK: (params, modo, opcoes) => {
      fechar();
      if (!escolha.indices.length) return projeto.previsualizar(null);
      if (existente) projeto.substituir(montar(params, modo, opcoes));
      else {
        projeto.adicionar(montar(params, modo, opcoes));
        aoTerminar(escolha.esboco);
      }
    },
    aoCancelar: () => {
      fechar();
      projeto.previsualizar(null);
    },
  });

  // Editar: só muda distância e operação (os perfis ficam).
  definirEscolhedor({
    perfilEscolhido: (e, i) => escolha.tem(e, i),
    aoClicarPerfil(e, i) {
      if (existente) return;
      escolha.alternar(e, i);
      dialogo.definirSelecao(escolha.texto());
      redesenhar();
      mostrarPrevia();
    },
  });
  redesenhar();
}
