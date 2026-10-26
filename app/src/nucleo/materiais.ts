// Biblioteca de aparências (cor e brilho na tela) e materiais físicos (densidade
// para a massa). Como no Fusion: cada corpo tem um material físico (padrão: Aço)
// e a aparência segue o material, a não ser que outra aparência seja aplicada.

export interface Aparencia {
  nome: string;
  cor: string; // #rrggbb
  metal: number; // 0 a 1
  rugosidade: number; // 0 (espelhado) a 1 (fosco)
  opacidade?: number; // 1 = sólido
}

export const APARENCIAS: Record<string, Aparencia> = {
  aco: { nome: "Aço", cor: "#b3b8be", metal: 0.85, rugosidade: 0.33 },
  acoEscuro: { nome: "Aço escuro", cor: "#6f767e", metal: 0.4, rugosidade: 0.4 },
  aluminio: { nome: "Alumínio", cor: "#dfe3e8", metal: 0.35, rugosidade: 0.3 },
  latao: { nome: "Latão", cor: "#c9a54a", metal: 0.6, rugosidade: 0.3 },
  cobre: { nome: "Cobre", cor: "#c47a4a", metal: 0.6, rugosidade: 0.3 },
  ferroFundido: { nome: "Ferro fundido", cor: "#5b5f63", metal: 0.2, rugosidade: 0.7 },
  plasticoBranco: { nome: "Plástico branco", cor: "#efefef", metal: 0, rugosidade: 0.5 },
  plasticoPreto: { nome: "Plástico preto", cor: "#2a2c2f", metal: 0, rugosidade: 0.5 },
  plasticoCinza: { nome: "Plástico cinza", cor: "#8a9099", metal: 0, rugosidade: 0.5 },
  plasticoVermelho: { nome: "Plástico vermelho", cor: "#c8302c", metal: 0, rugosidade: 0.45 },
  plasticoLaranja: { nome: "Plástico laranja", cor: "#e86a1c", metal: 0, rugosidade: 0.45 },
  plasticoAmarelo: { nome: "Plástico amarelo", cor: "#e8c02a", metal: 0, rugosidade: 0.45 },
  plasticoVerde: { nome: "Plástico verde", cor: "#3aa63a", metal: 0, rugosidade: 0.45 },
  plasticoAzul: { nome: "Plástico azul", cor: "#2f6fd8", metal: 0, rugosidade: 0.45 },
  borracha: { nome: "Borracha", cor: "#1c1c1c", metal: 0, rugosidade: 0.9 },
  madeira: { nome: "Madeira", cor: "#b5854b", metal: 0, rugosidade: 0.75 },
  vidro: { nome: "Vidro", cor: "#bfe3ef", metal: 0, rugosidade: 0.05, opacidade: 0.35 },
};

export interface MaterialFisico {
  nome: string;
  densidade: number; // g/cm³
  aparencia: string; // aparência que vem junto
}

export const MATERIAIS: Record<string, MaterialFisico> = {
  aco: { nome: "Aço", densidade: 7.85, aparencia: "aco" },
  acoInox: { nome: "Aço inox", densidade: 8.0, aparencia: "aco" },
  aluminio: { nome: "Alumínio", densidade: 2.7, aparencia: "aluminio" },
  latao: { nome: "Latão", densidade: 8.5, aparencia: "latao" },
  cobre: { nome: "Cobre", densidade: 8.96, aparencia: "cobre" },
  ferroFundido: { nome: "Ferro fundido", densidade: 7.2, aparencia: "ferroFundido" },
  pla: { nome: "PLA", densidade: 1.24, aparencia: "plasticoBranco" },
  petg: { nome: "PETG", densidade: 1.27, aparencia: "plasticoCinza" },
  abs: { nome: "ABS", densidade: 1.04, aparencia: "plasticoPreto" },
  nylon: { nome: "Nylon (PA)", densidade: 1.14, aparencia: "plasticoBranco" },
  tpu: { nome: "TPU (flexível)", densidade: 1.21, aparencia: "borracha" },
  madeira: { nome: "Madeira (pinho)", densidade: 0.5, aparencia: "madeira" },
  vidro: { nome: "Vidro", densidade: 2.5, aparencia: "vidro" },
};

export const MATERIAL_PADRAO = "aco";

// Aparência que aparece num corpo: a aplicada ou, sem ela, a do material.
export function aparenciaDoCorpo(c: { material?: string; aparencia?: string }): string {
  if (c.aparencia && APARENCIAS[c.aparencia]) return c.aparencia;
  return MATERIAIS[c.material ?? MATERIAL_PADRAO]?.aparencia ?? "aco";
}
