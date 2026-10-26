// Primeiro uso (escolhido no instalador): só o assistente "Ligar a IA", antes
// da tela de trabalho. Ao terminar ou fechar, abre o HAXYS CAD.
import "./estilo.css";
import { abrirAssistenteIA } from "./ui/assistenteIA";

abrirAssistenteIA(() => location.replace("/"));
