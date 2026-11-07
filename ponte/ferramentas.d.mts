// Tipos de ferramentas.mjs para o TypeScript do app (app/src/nuvem).
export interface Ferramenta {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export const FERRAMENTAS: Ferramenta[];
export const INSTRUCOES: string;
export const INSTRUCOES_REPLICA: string;
export function montarPedido(p: { texto: string; conversa?: string; replica?: boolean }): string;
export function textoDaFerramenta(
  nome: "construir" | "estado_do_projeto" | "ver_tela",
  r: Record<string, unknown>,
): { texto: string; erro: boolean; imagem?: string };
