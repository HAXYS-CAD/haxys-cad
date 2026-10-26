@echo off
chcp 65001 >nul
rem Login do Claude Code (uma vez so) para o modo "Claude" do painel Falar com a IA.
rem Na janela que abrir: escolha entrar com a conta do Claude (assinatura) e siga o navegador.
rem Depois de entrar, digite /exit e feche a janela.
set "CLAUDE="
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Anthropic.ClaudeCode*") do if exist "%%D\claude.exe" set "CLAUDE=%%D\claude.exe"
if not defined CLAUDE if exist "%USERPROFILE%\.local\bin\claude.exe" set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
if not defined CLAUDE (echo Claude Code nao encontrado neste computador. & pause & exit /b 1)
cd /d "%~dp0"
"%CLAUDE%"
