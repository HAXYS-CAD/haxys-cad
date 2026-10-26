// Formato de src/dados/faixa.json (gerado por ferramentas/gerar_faixa.mjs).
export interface Ferramenta {
  nome: string;
  id: string;
  destaque: boolean;
  itens?: Ferramenta[]; // presente quando é um submenu
}

export interface Painel {
  nome: string;
  id: string;
  ferramentas: Ferramenta[];
}

export interface Aba {
  nome: string;
  id: string;
  paineis: Painel[];
}
