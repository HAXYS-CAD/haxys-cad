// @ts-check
// ESLint do HAXYS CAD. Tudo em aviso: o projeto nunca teve lint e nada pode
// bloquear o build (plano em ../docs/quality.md). Rode: npm run lint
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// shortcut: rebaixa toda regra para "warn", sem escolher regra a regra; subir para "error" quando a contagem zerar (docs/quality.md)
const soAvisos = (cfg) => ({
  ...cfg,
  rules: Object.fromEntries(
    Object.entries(cfg.rules ?? {}).map(([regra, valor]) => {
      const nivel = Array.isArray(valor) ? valor[0] : valor;
      if (nivel === "off" || nivel === 0) return [regra, valor];
      return [regra, Array.isArray(valor) ? ["warn", ...valor.slice(1)] : "warn"];
    }),
  ),
});

export default defineConfig(
  { ignores: ["dist/**", "dist-nuvem/**", "servidor.mjs", "node_modules/**", "public/**"] },
  {
    files: ["**/*.{ts,mjs,cjs}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended].map(soAvisos),
    rules: {
      // o tsc já pega nome inexistente nos .ts; o main.cjs usa globais do Node
      "no-undef": "off",
      // estilo da casa: "if (x) (a = 1), (b = 2);" — os 94 casos conferidos em 2026-11-06 têm efeito (atribuição ou chamada)
      "@typescript-eslint/no-unused-expressions": "off",
      // "...resto" tira campos do objeto de propósito
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
      // zeradas em 2026-11-06: viram erro para não voltar (plano em ../docs/quality.md)
      "@typescript-eslint/no-require-imports": "error",
      "prefer-const": "error",
      "preserve-caught-error": "error",
      "no-useless-assignment": "error",
      "no-control-regex": "error",
      // referência do toolkit: 350 linhas por arquivo (18 arquivos acima hoje)
      "max-lines": ["warn", { max: 350, skipBlankLines: true, skipComments: true }],
    },
  },
  // .cjs roda no Node/Electron sem bundler: require é o certo
  { files: ["**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
);
