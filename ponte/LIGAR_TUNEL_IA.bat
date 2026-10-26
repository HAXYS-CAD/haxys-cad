@echo off
rem HAXYS CAD - liga a ponte das IAs e o tunel do Cloudflare.
rem Mostra o endereco para colar no ChatGPT / claude.ai / Gemini.
rem Deixe esta janela aberta enquanto usar. Fechar = desligar o tunel.
chcp 65001 >nul
cd /d "%~dp0"
title HAXYS CAD - tunel para as IAs
node haxys-ponte.mjs --tunel
pause
