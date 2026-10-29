// Etiquetas (imagens de 1 bit) -> comandos ESC/POS para Elgin i8 / i9 (e outras
// térmicas de bobina compatíveis). Cada etiqueta sai como bitmap (GS v 0) e é
// cortada pela guilhotina logo depois.
const ESC = 0x1b, GS = 0x1d;
const FAIXA = 128;   // impressoras baratas engasgam com imagem muito alta de uma vez

// Modo "compatível": ESC * 33 (faixas de 24 pontos), para impressoras 58 mm
// mais simples que não entendem GS v 0.
function escAsterisco(dados, bpl, altura) {
  const largura = bpl * 8;
  const partes = [Buffer.from([ESC, 0x33, 24])];          // entrelinha = 24 pontos (sem buracos)
  for (let y0 = 0; y0 < altura; y0 += 24) {
    const linha = Buffer.alloc(5 + largura * 3);
    linha.set([ESC, 0x2a, 33, largura & 255, largura >> 8]);
    for (let x = 0; x < largura; x++) {
      const byteX = x >> 3, bit = 0x80 >> (x & 7);
      for (let k = 0; k < 3; k++) {
        let v = 0;
        for (let b = 0; b < 8; b++) {
          const y = y0 + k * 8 + b;
          if (y < altura && dados[y * bpl + byteX] & bit) v |= 0x80 >> b;
        }
        linha[5 + x * 3 + k] = v;
      }
    }
    partes.push(linha, Buffer.from([0x0a]));
  }
  partes.push(Buffer.from([ESC, 0x32]));                   // entrelinha normal
  return partes;
}

// etiquetas: [{ largura, altura, bits(base64) }]
// opcoes: { corte: 'total'|'parcial'|'nenhum', espacoMm: 0..20, modoImagem: 'padrao'|'compativel' }
export function etiquetasParaEscPos(etiquetas, { corte = "total", espacoMm = 0, modoImagem = "padrao" } = {}) {
  const partes = [Buffer.from([ESC, 0x40])];
  for (const et of etiquetas) {
    const dados = Buffer.from(et.bits, "base64");
    const bpl = et.largura / 8;
    if (!Number.isInteger(bpl) || dados.length !== bpl * et.altura) throw new Error("Imagem da etiqueta inválida.");
    partes.push(Buffer.from([ESC, 0x61, 1]));                 // centraliza (bobina 58 numa impressora 80)
    if (modoImagem === "compativel") partes.push(...escAsterisco(dados, bpl, et.altura));
    else for (let y = 0; y < et.altura; y += FAIXA) {
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
