# FAQ

[← Back](../../README.en.md) · [🇧🇷 Português](../pt/perguntas.md)

## Windows said "Windows protected your PC". Is it a virus?

No. The installer is free and has no paid digital signature, so Windows doesn't recognize it. Click **More info → Run anyway**. The code is open: anyone can check it.

## Is HAXYS CAD really free?

Yes, and it's open source (MIT license). The AI uses **your** account: Gemini has a free option; other providers may charge for their usage.

## Where are my projects?

In `Documents\HAXYS CAD`: `projetos` (`.haxys` files) and `saida` (exported STL, STEP, 3MF).

## Does it open Fusion files (.f3d)?

Fusion's format is closed. With Fusion open and its official MCP connector on, use **Arquivo → Trazer do Fusion** (File → Bring from Fusion). Or export STEP from Fusion and open it in HAXYS CAD.

## Do I need internet?

Only to download and for cloud AIs (Gemini, ChatGPT...). The app and a local AI (Ollama/LM Studio) work offline.

## Does it run on Mac or Linux?

The installer is Windows-only for now. Developers can run it from source (see [For developers](para-quem-programa.md)).

## The interface is in Portuguese. Is there English?

Other languages inside the app are on the way.

## The AI doesn't answer

Click **⚡ Ligar IA** (Connect AI) and check the key or the selected program. With free Gemini, today's limit may be used up: try tomorrow.

## My phone can't open HAXYS CAD

Check: PC on with HAXYS CAD open, phone on the same Wi-Fi, and **Private networks** allowed in Windows. See [Phone](celular.md).

## I found a bug

Open an [issue](https://github.com/HAXYS-CAD/haxys-cad/issues/new/choose) describing what you did and what you saw.
