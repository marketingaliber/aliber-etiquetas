// Desenho das etiquetas de gôndola.
// Tudo é desenhado num <canvas> em preto e branco puro, no tamanho real em
// pontos da impressora (8 pontos por mm, 203 dpi), e depois vira imagem de
// 1 bit para a térmica. A prévia na tela é exatamente essa imagem.

export const PONTOS_MM = 8;
export const FONTE_TITULO = "'Barlow Condensed'";
export const FONTE_TEXTO = "'Barlow'";

// alturas (etiqueta em pé) e comprimentos (etiqueta deitada), em mm
export const TAMANHOS = {
  empe: { P: 35, M: 55, G: 80 },
  deitada: { P: 100, M: 150, G: 200 },
};

export const UNIDADES = {
  kg: { curto: "KG", longo: "o quilo" },
  "100g": { curto: "100g", longo: "100 gramas" },
  un: { curto: "UN", longo: "a unidade" },
  maco: { curto: "MAÇO", longo: "o maço" },
  bandeja: { curto: "BANDEJA", longo: "a bandeja" },
  duzia: { curto: "DÚZIA", longo: "a dúzia" },
  pacote: { curto: "PACOTE", longo: "o pacote" },
  caixa: { curto: "CAIXA", longo: "a caixa" },
  cumbuca: { curto: "CUMBUCA", longo: "a cumbuca" },
  litro: { curto: "LITRO", longo: "o litro" },
};

// "KG", "Kg", "QUILO"... -> chave de UNIDADES (padrão quando não reconhece)
export function normalizarUnidade(u, padrao = "kg") {
  const t = String(u ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\.$/, "");
  if (!t) return padrao;
  if (/^(kg|kgs|quilo|kilo|k)$/.test(t)) return "kg";
  if (/^100 ?g/.test(t)) return "100g";
  if (/^(un|und|unid|unidade|pc|pca|peca)$/.test(t)) return "un";
  if (/^(mc|mco|maco|molho)$/.test(t)) return "maco";
  if (/^(bd|bdj|bj|bandeja)$/.test(t)) return "bandeja";
  if (/^(dz|duzia)$/.test(t)) return "duzia";
  if (/^(pc?t|pac|pacote)$/.test(t)) return "pacote";
  if (/^(cx|caixa)$/.test(t)) return "caixa";
  if (/^(cb|cumbuca)$/.test(t)) return "cumbuca";
  if (/^(l|lt|litro)$/.test(t)) return "litro";
  return UNIDADES[t] ? t : padrao;
}

export function partesPreco(valor) {
  const v = Math.max(0, Math.round((Number(valor) || 0) * 100));
  const inteiro = Math.floor(v / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return { inteiro, centavos: "," + String(v % 100).padStart(2, "0") };
}
export const dinheiro = (v) => { const p = partesPreco(v); return "R$ " + p.inteiro + p.centavos; };

/* ---------------- medidas de texto ---------------- */

const fonte = (peso, px, familia = FONTE_TITULO) => `${peso} ${Math.max(1, Math.floor(px))}px ${familia}`;

function medir(ctx, texto, peso, px, familia) {
  ctx.font = fonte(peso, px, familia);
  const m = ctx.measureText(texto);
  return { w: m.width, sobe: m.actualBoundingBoxAscent, desce: m.actualBoundingBoxDescent };
}

// altura das maiúsculas/números (sem acento) para a fonte, em px
function alturaCaixaAlta(ctx, peso, px, familia) { return medir(ctx, "H0", peso, px, familia).sobe; }

// maior tamanho em que todas as linhas cabem em w x h
function maiorTamanho(ctx, linhas, w, h, peso, familia, entrelinha = 1.02, max = 2000) {
  let lo = 4, hi = max;
  while (hi - lo > 1) {
    const px = (lo + hi) >> 1;
    const larg = Math.max(...linhas.map((l) => medir(ctx, l, peso, px, familia).w));
    const alt = alturaTexto(ctx, linhas.length, peso, px, familia, entrelinha);
    if (larg <= w && alt <= h) lo = px; else hi = px;
  }
  return lo;
}
// altura ocupada por n linhas (com espaço para acento na primeira)
function alturaTexto(ctx, n, peso, px, familia, entrelinha) {
  const cap = alturaCaixaAlta(ctx, peso, px, familia);
  const acento = cap * 0.22;
  return acento + cap + (n - 1) * px * entrelinha * 0.86;
}

// quebra em até maxLinhas escolhendo a divisão que deixa a letra maior
function melhorQuebra(ctx, texto, w, h, peso, familia, maxLinhas) {
  const palavras = texto.split(/\s+/).filter(Boolean);
  let melhor = { linhas: [texto], px: maiorTamanho(ctx, [texto], w, h, peso, familia) };
  if (maxLinhas >= 2 && palavras.length >= 2) {
    for (let i = 1; i < palavras.length; i++) {
      const ls = [palavras.slice(0, i).join(" "), palavras.slice(i).join(" ")];
      const px = maiorTamanho(ctx, ls, w, h, peso, familia);
      if (px > melhor.px * 1.08) melhor = { linhas: ls, px };
    }
  }
  if (maxLinhas >= 3 && palavras.length >= 3 && melhor.px < h * 0.3) {
    for (let i = 1; i < palavras.length - 1; i++) for (let j = i + 1; j < palavras.length; j++) {
      const ls = [palavras.slice(0, i).join(" "), palavras.slice(i, j).join(" "), palavras.slice(j).join(" ")];
      const px = maiorTamanho(ctx, ls, w, h, peso, familia);
      if (px > melhor.px * 1.08) melhor = { linhas: ls, px };
    }
  }
  return melhor;
}

// escreve linhas centralizadas (ou à esquerda) dentro da caixa, centralizado na vertical
function escreverBloco(ctx, linhas, px, caixa, { peso = 800, familia = FONTE_TITULO, alinhar = "center", cor = "#000", entrelinha = 1.02, vertical = "center" } = {}) {
  const cap = alturaCaixaAlta(ctx, peso, px, familia);
  const passo = px * entrelinha * 0.86;
  const total = alturaTexto(ctx, linhas.length, peso, px, familia, entrelinha);
  let topo = caixa.y + (vertical === "top" ? 0 : vertical === "bottom" ? caixa.h - total : (caixa.h - total) / 2);
  let base = topo + cap * 0.22 + cap;
  ctx.fillStyle = cor;
  ctx.font = fonte(peso, px, familia);
  ctx.textBaseline = "alphabetic";
  for (const l of linhas) {
    const lw = ctx.measureText(l).width;
    const x = alinhar === "left" ? caixa.x : alinhar === "right" ? caixa.x + caixa.w - lw : caixa.x + (caixa.w - lw) / 2;
    ctx.fillText(l, x, base);
    base += passo;
  }
}

function textoQueCabe(ctx, texto, caixa, opcoes = {}) {
  const { peso = 800, familia = FONTE_TITULO, maxLinhas = 2, maxPx = 9999 } = opcoes;
  const q = melhorQuebra(ctx, texto, caixa.w, caixa.h, peso, familia, maxLinhas);
  escreverBloco(ctx, q.linhas, Math.min(q.px, maxPx), caixa, opcoes);
  return q;
}

/* ---------------- preço ---------------- */

// Preço no estilo de placa de mercado: R$ pequeno, reais enormes, centavos
// no alto e a unidade embaixo dos centavos.
function medidasPreco(ctx, p, px, unidade) {
  const peso = 800;
  const rs = medir(ctx, "R$", 700, px * 0.27);
  const int = medir(ctx, p.inteiro, peso, px);
  const cent = medir(ctx, p.centavos, peso, px * 0.46);
  const un = medir(ctx, unidade, 700, px * 0.25);
  const capInt = alturaCaixaAlta(ctx, peso, px);
  const gap = px * 0.04;
  const coluna = Math.max(cent.w, un.w);
  return { rs, int, cent, un, capInt, gap, coluna, w: rs.w + gap * 2 + int.w + gap + coluna };
}

function desenharPreco(ctx, valor, unidade, caixa, { cor = "#000", alinhar = "center", maxPx = 9999 } = {}) {
  const p = partesPreco(valor);
  let lo = 8, hi = Math.min(maxPx, 3000);
  while (hi - lo > 1) {
    const px = (lo + hi) >> 1;
    const m = medidasPreco(ctx, p, px, unidade);
    if (m.w <= caixa.w && m.capInt <= caixa.h) lo = px; else hi = px;
  }
  const px = lo;
  const m = medidasPreco(ctx, p, px, unidade);
  const x0 = alinhar === "left" ? caixa.x : alinhar === "right" ? caixa.x + caixa.w - m.w : caixa.x + (caixa.w - m.w) / 2;
  const base = caixa.y + (caixa.h + m.capInt) / 2;     // base dos números grandes
  const topo = base - m.capInt;
  ctx.fillStyle = cor;
  ctx.textBaseline = "alphabetic";
  // R$ alinhado ao topo
  ctx.font = fonte(700, px * 0.27);
  ctx.fillText("R$", x0, topo + m.rs.sobe);
  // reais
  let x = x0 + m.rs.w + m.gap * 2;
  ctx.font = fonte(800, px);
  ctx.fillText(p.inteiro, x, base);
  x += m.int.w + m.gap;
  // centavos no alto, unidade embaixo
  ctx.font = fonte(800, px * 0.46);
  ctx.fillText(p.centavos, x + (m.coluna - m.cent.w) / 2, topo + alturaCaixaAlta(ctx, 800, px * 0.46));
  if (unidade) {
    ctx.font = fonte(700, px * 0.25);
    ctx.fillText(unidade, x + (m.coluna - m.un.w) / 2, base);
  }
  return { px, w: m.w, x: x0, topo, base };
}

/* ---------------- etiqueta ---------------- */

function hoje() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// item: { nome, complemento, preco, precoDe, unidade(chave), oferta(bool), codigo }
// modelo: { formato: 'empe'|'deitada', tamanho: 'P'|'M'|'G', estilo: 'padrao'|'oferta', bobina: 80|58,
//           loja, mostrarData, textoData, textoOferta, mostrarCodigo }
// Devolve um canvas na orientação de LEITURA (deitada = mais larga que alta).
export function desenharEtiqueta(item, modelo, canvas = document.createElement("canvas")) {
  const largPapel = modelo.bobina === 58 ? 384 : 576;          // área de impressão em pontos
  const mm = TAMANHOS[modelo.formato]?.[modelo.tamanho] ?? 55;
  const comp = Math.round(mm * PONTOS_MM);
  const W = modelo.formato === "deitada" ? comp : largPapel;
  const H = modelo.formato === "deitada" ? largPapel : comp;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";

  const oferta = modelo.estilo === "oferta" || !!item.oferta;
  const un = UNIDADES[item.unidade] || UNIDADES.kg;
  const nome = String(item.nome || "PRODUTO").toUpperCase().trim();
  const comp2 = String(item.complemento || "").trim();
  const temDe = oferta && Number(item.precoDe) > Number(item.preco);
  const rodapeTxt = [modelo.loja?.trim(), modelo.mostrarData ? `${modelo.textoData || "Preço de"} ${hoje()}` : "", modelo.mostrarCodigo && item.codigo ? `Cód. ${item.codigo}` : ""].filter(Boolean);

  const m = Math.round(Math.min(W, H) * 0.045);                // margem
  const borda = Math.max(3, Math.round(Math.min(W, H) * 0.012));
  // moldura arredondada
  ctx.lineWidth = borda;
  ctx.strokeStyle = "#000";
  arredondado(ctx, borda / 2 + 1, borda / 2 + 1, W - borda - 2, H - borda - 2, m * 0.9);
  ctx.stroke();

  let y = borda + m * 0.6;
  const xi = borda + m, wi = W - 2 * (borda + m);
  let fim = H - borda - m * 0.5;

  // faixa de oferta
  if (oferta) {
    const hf = Math.round(H * (modelo.formato === "deitada" ? 0.17 : modelo.tamanho === "P" ? 0.2 : 0.15));
    ctx.save();
    arredondado(ctx, borda / 2 + 1, borda / 2 + 1, W - borda - 2, hf + borda, m * 0.9, true);
    ctx.clip();
    ctx.fillRect(0, 0, W, hf + borda + 2);
    ctx.restore();
    textoQueCabe(ctx, (modelo.textoOferta || "OFERTA").toUpperCase(), { x: xi, y: borda + hf * 0.14, w: wi, h: hf * 0.72 }, { cor: "#fff", maxLinhas: 1, peso: 900 });
    y = borda + hf + m * 0.5;
  }

  // rodapé
  if (rodapeTxt.length) {
    const hr = Math.max(22, Math.round(H * (modelo.formato === "deitada" ? 0.085 : 0.075)));
    const yr = fim - hr;
    ctx.fillRect(xi, yr - m * 0.35, wi, Math.max(2, borda * 0.6));
    const px = Math.min(maiorTamanho(ctx, [rodapeTxt.join("   ·   ")], wi, hr * 0.8, 600, FONTE_TEXTO), hr * 0.95);
    if (rodapeTxt.length > 1) {
      escreverBloco(ctx, [rodapeTxt[0]], px, { x: xi, y: yr, w: wi, h: hr }, { peso: 600, familia: FONTE_TEXTO, alinhar: "left" });
      escreverBloco(ctx, [rodapeTxt.slice(1).join("   ")], px, { x: xi, y: yr, w: wi, h: hr }, { peso: 600, familia: FONTE_TEXTO, alinhar: "right" });
    } else {
      escreverBloco(ctx, rodapeTxt, px, { x: xi, y: yr, w: wi, h: hr }, { peso: 600, familia: FONTE_TEXTO });
    }
    fim = yr - m * 0.7;
  }

  const area = fim - y;
  const deitada = modelo.formato === "deitada";
  const pequena = !deitada && modelo.tamanho === "P";

  if (pequena && !oferta) {
    // pequena: nome à esquerda, preço à direita, tudo numa faixa
    const wNome = wi * 0.44;
    textoQueCabe(ctx, nome, { x: xi, y, w: wNome, h: area * (comp2 ? 0.7 : 1) }, { alinhar: "left", maxLinhas: 3 });
    if (comp2) textoQueCabe(ctx, comp2, { x: xi, y: y + area * 0.74, w: wNome, h: area * 0.24 }, { peso: 600, familia: FONTE_TEXTO, alinhar: "left", maxLinhas: 1 });
    desenharPreco(ctx, item.preco, un.curto, { x: xi + wNome + m, y: y + area * 0.08, w: wi - wNome - m, h: area * 0.84 }, { alinhar: "right" });
    return canvas;
  }

  if (deitada && modelo.tamanho !== "P") {
    // deitada comprida: nome à esquerda, preço enorme à direita usando toda a altura
    const wNome = wi * (modelo.tamanho === "G" ? 0.4 : 0.42);
    let yN = y, hN = area;
    if (temDe) hN = area * 0.8;
    const hComp = comp2 ? area * 0.16 : 0;
    const q = textoQueCabe(ctx, nome, { x: xi, y: yN, w: wNome, h: hN - hComp }, { alinhar: "left", maxLinhas: 3 });
    if (comp2) textoQueCabe(ctx, comp2, { x: xi, y: yN + hN - hComp, w: wNome, h: hComp * 0.8 }, { peso: 600, familia: FONTE_TEXTO, alinhar: "left", maxLinhas: 1, maxPx: q.px * 0.6 });
    if (temDe) {
      const txt = "DE " + dinheiro(item.precoDe);
      const px = maiorTamanho(ctx, [txt], wNome, area * 0.15, 700, FONTE_TITULO);
      escreverBloco(ctx, [txt], px, { x: xi, y: y + area * 0.83, w: wNome, h: area * 0.15 }, { peso: 700, alinhar: "left" });
      ctx.font = fonte(700, px);
      const antes = ctx.measureText("DE ").width, valor = ctx.measureText(dinheiro(item.precoDe)).width;
      const cap = alturaCaixaAlta(ctx, 700, px);
      ctx.fillRect(xi + antes - 4, y + area * 0.83 + (area * 0.15 + cap * 1.22) / 2 - cap * 0.5, valor + 8, Math.max(3, px * 0.09));
    }
    ctx.fillRect(xi + wNome + m * 0.5, y + area * 0.06, Math.max(2, borda * 0.6), area * 0.88);
    desenharPreco(ctx, item.preco, un.curto, { x: xi + wNome + m * 1.4, y: y + area * 0.04, w: wi - wNome - m * 1.4, h: area * 0.92 }, { alinhar: "center" });
    return canvas;
  }

  // nome
  const fNome = deitada ? 0.3 : pequena ? 0.34 : 0.32;
  const hNome = area * fNome;
  const q = textoQueCabe(ctx, nome, { x: xi, y, w: wi, h: hNome }, { maxLinhas: deitada ? 1 : 2, vertical: "center" });
  y += hNome;
  if (comp2) {
    const hc = area * 0.1;
    textoQueCabe(ctx, comp2, { x: xi, y: y + hc * 0.1, w: wi, h: hc * 0.85 }, { peso: 600, familia: FONTE_TEXTO, maxLinhas: 1, maxPx: q.px * 0.6 });
    y += hc;
  }

  // "de R$ x,xx" riscado
  if (temDe) {
    const hd = area * 0.15;
    const txt = "DE " + dinheiro(item.precoDe) + "  POR";
    const px = maiorTamanho(ctx, [txt], wi, hd * 0.8, 700, FONTE_TITULO);
    escreverBloco(ctx, [txt], px, { x: xi, y: y + hd * 0.12, w: wi, h: hd * 0.8 }, { peso: 700 });
    // risco só no valor antigo
    ctx.font = fonte(700, px);
    const total = ctx.measureText(txt).width;
    const antes = ctx.measureText("DE ").width;
    const valor = ctx.measureText(dinheiro(item.precoDe)).width;
    const x0 = xi + (wi - total) / 2 + antes;
    const ym = y + hd * 0.12 + hd * 0.4 + alturaCaixaAlta(ctx, 700, px) * 0.15;
    ctx.fillRect(x0 - 4, ym, valor + 8, Math.max(3, px * 0.09));
    y += hd;
  }

  const sobra = fim - y;
  desenharPreco(ctx, item.preco, un.curto, { x: xi, y: y + sobra * 0.06, w: wi, h: sobra * 0.86 });
  return canvas;
}

function arredondado(ctx, x, y, w, h, r, soTopo = false) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  if (soTopo) { ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
  else {
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  }
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ---------------- para a impressora ---------------- */

// canvas de leitura -> canvas na posição do papel (deitada gira 90°)
export function naPosicaoDoPapel(canvas, formato) {
  if (formato !== "deitada") return canvas;
  const c = document.createElement("canvas");
  c.width = canvas.height; c.height = canvas.width;
  const ctx = c.getContext("2d");
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);
  return c;
}

// canvas -> { largura, altura, bits(base64) } com 1 bit por ponto (1 = preto)
export function paraBits(canvas, limiar = 150) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const bpl = Math.ceil(w / 8);
  const bits = new Uint8Array(bpl * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    if (lum < limiar && d[i + 3] > 128) bits[y * bpl + (x >> 3)] |= 0x80 >> (x & 7);
  }
  let s = "";
  for (let i = 0; i < bits.length; i += 0x8000) s += String.fromCharCode.apply(null, bits.subarray(i, i + 0x8000));
  return { largura: bpl * 8, altura: h, bits: btoa(s) };
}

// deixa o canvas só preto e branco (a prévia fica igual ao papel)
export function binarizar(canvas, limiar = 150) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < limiar ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function carregarFontes() {
  await Promise.all([
    document.fonts.load(fonte(600, 40)), document.fonts.load(fonte(700, 40)),
    document.fonts.load(fonte(800, 40)), document.fonts.load(fonte(900, 40)),
    document.fonts.load(fonte(600, 40, FONTE_TEXTO)), document.fonts.load(fonte(700, 40, FONTE_TEXTO)),
  ]);
}
