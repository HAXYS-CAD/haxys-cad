@echo off
rem Liga a tela do HAXYS CAD e abre no navegador.
cd /d "%~dp0"
if not exist node_modules call npm install
npx vite --open
