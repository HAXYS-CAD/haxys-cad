@echo off
rem HAXYS CAD - liga so a ponte das IAs neste computador (sem tunel).
rem Para Codex, Claude Desktop etc. nao precisa: eles ligam sozinhos.
chcp 65001 >nul
cd /d "%~dp0"
title HAXYS CAD - ponte das IAs (porta 27186)
node haxys-ponte.mjs
pause
