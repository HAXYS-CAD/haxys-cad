# AI and MCP bridge

[← Back](../../README.en.md) · [🇧🇷 Português](../pt/ia.md)

There are two ways to use AI with HAXYS CAD. Use either one, or both.

![HAXYS CAD AI](../imagens/ia.png)

## Option 1: the AI inside HAXYS CAD (🎤)

1. Click **⚡ Ligar IA** (Connect AI, top bar).
2. Pick an option:
   - **Gemini (Google): free.** Create a free key in [Google AI Studio](https://aistudio.google.com/apikey) with your Google account, copy it and paste it into HAXYS CAD.
   - **Ollama or LM Studio:** an AI running on your own PC, free and offline (needs a PC with a good graphics card).
   - **Codex** (ChatGPT account) or **Claude Code**, if already installed on this PC.
   - **OpenAI, Claude, OpenRouter, Groq** or any compatible provider: with your key (the provider may charge for usage).
3. Click 🎤 **Falar com a IA** (Talk to the AI) and ask for the part. Speak or type.
4. **Replicar peça da foto** (Replicate part from photo): send photos (a ruler or an object of known size helps) and the AI builds the part, telling you where each dimension came from.

The key stays only on your PC (`Documents\HAXYS CAD\ia.json`). HAXYS CAD charges nothing.

## Option 2: the MCP bridge (your AI opens HAXYS CAD and builds)

**MCP** is the standard AIs use to drive programs. The HAXYS CAD bridge gives the AI four tools: `abrir_haxys` (open), `construir` (CAD actions), `estado_do_projeto` (project state) and `ver_tela` (screenshot). The AI does **not** run code on your computer.

The bridge ships with the installed app, in this file:

```text
%LOCALAPPDATA%\Programs\HAXYS CAD\resources\ponte\haxys-ponte.mjs
```

**Before you start:** ideally keep **HAXYS CAD open**. For Codex, Claude Code and Gemini CLI, also install [Node.js](https://nodejs.org) (LTS).

### Claude Desktop

Download `HAXYS_CAD.mcpb` from [Releases](https://github.com/HAXYS-CAD/haxys-cad/releases/latest) and double-click it (or Claude → Settings → Extensions → drag the file). Click **Install**. No Node.js needed.

### Claude Code

```powershell
claude mcp add haxys -- node "$env:LOCALAPPDATA\Programs\HAXYS CAD\resources\ponte\haxys-ponte.mjs" --stdio
```

### Codex (ChatGPT desktop)

In `%USERPROFILE%\.codex\config.toml`, add (replace `YOUR_USER` with your Windows user name):

```toml
[mcp_servers.haxys]
command = "node"
args = ['C:\Users\YOUR_USER\AppData\Local\Programs\HAXYS CAD\resources\ponte\haxys-ponte.mjs', '--stdio']
startup_timeout_sec = 60
tool_timeout_sec = 240
```

### Gemini CLI

In `%USERPROFILE%\.gemini\settings.json`, inside `"mcpServers"`:

```json
"haxys": {
  "command": "node",
  "args": ["C:\\Users\\YOUR_USER\\AppData\\Local\\Programs\\HAXYS CAD\\resources\\ponte\\haxys-ponte.mjs", "--stdio"]
}
```

After setting it up, close and reopen the AI app.

### Ready-made prompt so the AI sets itself up

Paste into Claude Code, Codex or Gemini CLI:

```text
Connect the HAXYS CAD MCP bridge to yourself. It lives at
%LOCALAPPDATA%\Programs\HAXYS CAD\resources\ponte\haxys-ponte.mjs and runs with
"node <that path> --stdio". Check that Node.js is installed, register the MCP
server under the name "haxys" in your config file and tell me to restart you.
Follow https://github.com/HAXYS-CAD/haxys-cad/blob/main/docs/en/ia.md
```

### Prompts to try

```text
Open HAXYS and make a 60 by 60 by 6 mm plate with four 5 mm holes in the corners.
```

```text
Make a 120 x 80 mm L bracket with a 70 mm wall, two 9 mm holes in the base and
a 28 mm hole in the wall. Then take a screenshot and check it.
```

## Known limitations

- If HAXYS CAD is closed, the bridge opens the app by itself and waits until it's ready (about 30 seconds). Keeping it open is faster.
- Free Gemini in Option 1 has a daily request limit (set by Google).
- Web AIs (ChatGPT, claude.ai) need a tunnel to reach your PC: that's advanced and not recommended to start with.
