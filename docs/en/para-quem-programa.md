# For developers

[← Back](../../README.en.md) · [🇧🇷 Português](../pt/para-quem-programa.md)

## Tech

- **TypeScript + Vite 6** (UI) and **three.js** (3D view).
- **OpenCascade** via [replicad](https://replicad.xyz) (WASM), in a Web Worker: the CAD kernel.
- **Electron** + **electron-builder** for the desktop app and the Windows installer.
- Local server (Vite plugins in `app/vite.config.ts`): projects, export, AI, Bambu, laser, Fusion and phone.
- **MCP bridge** in plain Node, no packages: `ponte/haxys-ponte.mjs`.

## Run from source

You need [Node.js](https://nodejs.org) 20 or newer.

```powershell
git clone https://github.com/HAXYS-CAD/haxys-cad.git
cd haxys-cad\app
npm install
npm run dev
```

Open the address it prints (usually `http://localhost:5173`). On Windows you can also use `app\INICIAR.bat`.

## Build the app and the installer

```powershell
cd app
npm run programa     # opens the desktop app (Electron)
npm run instalador   # builds instalador\HAXYS-CAD-Setup-<version>.exe
```

## Folders

| Folder | Contents |
|---|---|
| `app/src/nucleo` | CAD kernel (OpenCascade worker), sketch, constraints, parameters |
| `app/src/comandos` | Each ribbon tool (extrude, hole, mesh, assembly...) |
| `app/src/esboco` | Sketch mode and constraint tools |
| `app/src/vista` | 3D scene, selection, view cube |
| `app/src/ui` | Ribbon, dialogs, AI (voice), bridge, phone, splash screen |
| `app/src/arquivo` | `.haxys` format, open, save, export |
| `app/electron` | Windows desktop app |
| `ponte` | MCP bridge and Claude Desktop extension |
| `ferramentas` | Helper scripts (Fusion, ribbon data) |

## Useful variables

- `HAXYS_DADOS`: projects and settings folder (default: the repository folder).
- `HAXYS_PORTA_CELULAR`: phone port (default 5174).
- `HAXYS_PONTE`: bridge path used by the Claude Desktop extension.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md). Code and UI text are in Brazilian Portuguese.
