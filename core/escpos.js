// Etiquetas (imagens de 1 bit) -> comandos ESC/POS para Elgin i8 / i9 (e outras
// térmicas de bobina compatíveis). Cada etiqueta sai como bitmap (GS v 0) e é
// cortada pela guilhotina logo depois.
const ESC = 0x1b, GS = 0x1d;
const FAIXA = 128;   // impressoras baratas engasgam com imagem muito alta de uma vez

// etiquetas: [{ largura, altura, bits(base64) }]
// opcoes: { corte: 'total'|'parcial'|'nenhum', espacoMm: 0..20 }
export function etiquetasParaEscPos(etiquetas, { corte = "total", espacoMm = 0 } = {}) {
  const partes = [Buffer.from([ESC, 0x40])];
  for (const et of etiquetas) {
    const dados = Buffer.from(et.bits, "base64");
    const bpl = et.largura / 8;
    if (!Number.isInteger(bpl) || dados.length !== bpl * et.altura) throw new Error("Imagem da etiqueta inválida.");
    partes.push(Buffer.from([ESC, 0x61, 1]));                 // centraliza (bobina 58 numa impressora 80)
    for (let y = 0; y < et.altura; y += FAIXA) {
      const h = Math.min(FAIXA, et.altura - y);
      partes.push(Buffer.from([GS, 0x76, 0x30, 0, bpl & 255, bpl >> 8, h & 255, h >> 8]));
      partes.push(dados.subarray(y * bpl, (y + h) * bpl));
    }
    partes.push(Buffer.from([ESC, 0x61, 0]));
    // espaço extra antes do corte (em pontos: 8 por mm)
    let extra = Math.round(Math.max(0, Math.min(20, Number(espacoMm) || 0)) * 8);
    while (extra > 0) { const n = Math.min(255, extra); partes.push(Buffer.from([ESC, 0x4a, n])); extra -= n; }
    // GS V 65/66 n: avança até a guilhotina e corta (total / parcial)
    if (corte === "total") partes.push(Buffer.from([GS, 0x56, 0x41, 0]));
    else if (corte === "parcial") partes.push(Buffer.from([GS, 0x56, 0x42, 0]));
    else partes.push(Buffer.from([ESC, 0x64, 4]));
  }
  return Buffer.concat(partes);
}
