# Para quem programa

[← Voltar](../../README.md) · [🇺🇸 English](../en/para-quem-programa.md)

## Tecnologia

- **TypeScript + Vite 6** (interface) e **three.js** (vista 3D).
- **OpenCascade** pelo [replicad](https://replicad.xyz) (WASM), num Web Worker: o núcleo de CAD.
- **Electron** + **electron-builder** para o programa e o instalador do Windows.
- Servidor local (plugins do Vite em `app/vite.config.ts`): projetos, exportação, IA, Bambu, laser, Fusion e celular.
- **Ponte MCP** em Node puro, sem pacotes: `ponte/haxys-ponte.mjs`.

## Rodar a partir do código

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```powershell
git clone https://github.com/HAXYS-CAD/haxys-cad.git
cd haxys-cad\app
npm install
npm run dev
```

Abra o endereço que aparecer (normalmente `http://localhost:5173`). No Windows também dá para usar `app\INICIAR.bat`.

## Gerar o programa e o instalador

```powershell
cd app
npm run programa     # abre o programa (Electron)
npm run instalador   # gera instalador\HAXYS-CAD-Setup-<versão>.exe
```

## Pastas

| Pasta | O que tem |
|---|---|
| `app/src/nucleo` | Núcleo de CAD (worker com OpenCascade), esboço, restrições, parâmetros |
| `app/src/comandos` | Cada ferramenta da faixa (extrusão, furo, malha, montagem...) |
| `app/src/esboco` | Modo esboço e ferramentas de restrição |
| `app/src/vista` | Cena 3D, seleção, cubo de vistas |
| `app/src/ui` | Faixa, janelas, IA (voz), ponte, celular, abertura |
| `app/src/arquivo` | Formato `.haxys`, abrir, salvar, exportar |
| `app/electron` | Programa de Windows |
| `ponte` | Ponte MCP e extensão do Claude Desktop |
| `ferramentas` | Scripts de apoio (Fusion, faixa de ferramentas) |

## Variáveis úteis

- `HAXYS_DADOS`: pasta dos projetos e configurações (padrão: a pasta do repositório).
- `HAXYS_PORTA_CELULAR`: porta do celular (padrão 5174).
- `HAXYS_PONTE`: caminho da ponte usado pela extensão do Claude Desktop.

## Contribuir

Veja [CONTRIBUTING.md](../../CONTRIBUTING.md).
