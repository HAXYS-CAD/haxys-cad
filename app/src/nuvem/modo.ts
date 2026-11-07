// HAXYS CAD na nuvem (caminho B): "npm run nuvem" (vite build --mode nuvem, .env.nuvem) liga isto.
// No PC e no celular pela Wi-Fi (caminho A) fica falso e nada muda.
export const naNuvem: boolean = import.meta.env.VITE_NUVEM === "1";
