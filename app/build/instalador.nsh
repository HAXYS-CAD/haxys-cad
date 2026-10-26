; Página do instalador logo depois da escolha da pasta: ligar a IA agora?
; Se a pessoa escolher "Sim", o instalador deixa o arquivo ligar-ia.flag na pasta
; do programa; ao abrir pela primeira vez, o HAXYS CAD começa pelo assistente
; "Ligar a IA" (electron/main.cjs) antes da tela de trabalho.
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER ; o desinstalador não usa esta página
  Var PaginaIA
  Var OpcaoSim
  Var LigarIA
  ; Tela final: o Windows não deixa o programa se fixar sozinho na barra de tarefas.
  !define MUI_FINISHPAGE_TEXT_LARGE
  !define MUI_FINISHPAGE_TEXT "O HAXYS CAD foi instalado. O ícone dele está na Área de Trabalho.$\r$\n$\r$\nDica: para deixar o HAXYS CAD na barra de tarefas, arraste o ícone da Área de Trabalho até a barra."
!endif

!macro customPageAfterChangeDir
  Page custom PaginaIAMostrar PaginaIASair

  Function PaginaIAMostrar
    !insertmacro MUI_HEADER_TEXT "Ligar a IA?" "É opcional. Você pode mudar depois."
    nsDialogs::Create 1018
    Pop $PaginaIA
    ${NSD_CreateLabel} 0 0 100% 24u "A IA cria peças quando você fala o que quer (botão de microfone). O HAXYS CAD funciona normalmente sem ela."
    Pop $0
    ${NSD_CreateRadioButton} 0 30u 100% 12u "Sim (recomendado)"
    Pop $OpcaoSim
    ${NSD_CreateLabel} 12u 43u 95% 18u "Ao abrir, mostra um passo a passo para ligar a IA. Tem opção grátis."
    Pop $1
    ${NSD_CreateRadioButton} 0 66u 100% 12u "Agora não"
    Pop $0
    ${NSD_CreateLabel} 12u 79u 95% 18u "Abre direto o HAXYS CAD. Para ligar depois: botão Ligar IA, na barra de cima."
    Pop $1
    ${NSD_CreateLabel} 0 104u 100% 26u "Custo: o HAXYS CAD é grátis. Algumas IAs cobram pelo uso, na conta da própria pessoa. O passo a passo mostra quais são grátis."
    Pop $1
    ${If} $LigarIA == "0"
      ${NSD_Check} $0
    ${Else}
      ${NSD_Check} $OpcaoSim
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function PaginaIASair
    ${NSD_GetState} $OpcaoSim $LigarIA
    ${If} $LigarIA == ${BST_CHECKED}
      StrCpy $LigarIA "1"
    ${Else}
      StrCpy $LigarIA "0"
    ${EndIf}
  FunctionEnd
!macroend

!macro customInstall
  ${If} $LigarIA == "1"
    FileOpen $0 "$INSTDIR\ligar-ia.flag" w
    FileClose $0
  ${EndIf}
!macroend
