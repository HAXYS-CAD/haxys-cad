@echo off
rem Cadastra o conector HAXYS no Claude Desktop.
rem Antes: feche o Claude pelo icone perto do relogio (botao direito - Sair).
chcp 65001 >nul
cd /d "%~dp0"
node cadastrar-claude.mjs
pause
