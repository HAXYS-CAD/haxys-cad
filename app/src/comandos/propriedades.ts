// Propriedades do corpo (clique direito num corpo do Navegador → Propriedades):
// material, massa, volume, área, caixa delimitadora, centro de massa e momentos
// de inércia, como a janela "Properties" do Fusion. Só leitura.
// Diferenças do Fusion, por enquanto: sem trocar a precisão nem as unidades,
// sem copiar para a área de transferência, sem eixos principais de inércia.
import { abrirDialogo } from "../ui/dialogo";
import type { Projeto } from "../nucleo/projeto";

export async function comandoPropriedades(raiz: HTMLElement, projeto: Projeto, corpo: string) {
  const dialogo = abrirDialogo(raiz, {
    titulo: `Propriedades — ${corpo}`,
    campos: [],
    modo: "novo",
    semModo: true,
    selecao: "Calculando…",
    rotuloSelecao: "",
    aoMudar: () => {},
    aoOK: () => {},
    aoCancelar: () => {},
  });
  raiz.querySelector(".dialogo")?.classList.add("propriedades");
  try {
    const [, ...linhas] = await projeto.propriedades(corpo);
    dialogo.definirSelecao(linhas.join("\n"));
  } catch (e) {
    dialogo.definirSelecao(`Não deu para calcular: ${e instanceof Error ? e.message : String(e)}`);
  }
}
