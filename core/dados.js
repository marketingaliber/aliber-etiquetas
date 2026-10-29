// Configuração e produtos do Aliber Etiquetas, em JSON na pasta de dados
// (%APPDATA%\Aliber Etiquetas). Gravação segura: escreve num arquivo novo e
// troca; guarda sempre uma cópia anterior (.bak). Nunca apaga dados do cliente.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let pasta = null;
export function iniciar(p) { pasta = p; fs.mkdirSync(pasta, { recursive: true }); }
export const pastaDados = () => pasta;

// Cada impressora tem a própria bobina (80 ou 58 mm), corte e modo de imagem.
export const IMPRESSORA_PADRAO = {
  id: "", nome: "", tipo: "windows", nomeWindows: "", ip: "", porta: 9100,
  bobina: 80, corte: "total", espacoMm: 0, modoImagem: "padrao",
};
export const CONFIG_PADRAO = {
  impressoras: [],
  impressoraAtual: "",
  pastaPdv: "C:\\PDV+",
  usarPdv: true,
  unidadePadrao: "kg",
  loja: "",
  mostrarData: true,
  textoData: "Preço de",
  textoOferta: "OFERTA",
  mostrarCodigo: false,
  modelo: { formato: "empe", tamanho: "M", estilo: "padrao" },
  tema: "escuro",
};

function ler(nome, padrao) {
  for (const arq of [nome, nome + ".bak"]) {
    try { return JSON.parse(fs.readFileSync(path.join(pasta, arq), "utf8")); } catch {}
  }
  return structuredClone(padrao);
}
function gravar(nome, valor) {
  const alvo = path.join(pasta, nome);
  const tmp = alvo + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(valor, null, 2));
  if (fs.existsSync(alvo)) { try { fs.copyFileSync(alvo, alvo + ".bak"); } catch {} }
  fs.renameSync(tmp, alvo);
}

function mesclar(base, extra) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(extra || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" ? mesclar(base[k], v) : v;
  }
  return out;
}

// Versão 1.0.0 tinha uma impressora só (impressora + bobina + corte soltos).
function migrar(bruto) {
  const c = { ...bruto };
  if (!Array.isArray(c.impressoras) || !c.impressoras.length) {
    const v = c.impressora || {};
    c.impressoras = [{
      ...IMPRESSORA_PADRAO, id: "imp1", nome: "Impressora 1",
      tipo: v.tipo || "windows", nomeWindows: v.nomeWindows || "", ip: v.ip || "", porta: Number(v.porta) || 9100,
      bobina: Number(c.bobina) === 58 ? 58 : 80, corte: c.corte || "total", espacoMm: Number(c.espacoMm) || 0,
    }];
    c.impressoraAtual = "imp1";
  }
  delete c.impressora; delete c.bobina; delete c.corte; delete c.espacoMm;
  c.impressoras = c.impressoras.filter((i) => i && i.id).map((i) => ({ ...IMPRESSORA_PADRAO, ...i, bobina: Number(i.bobina) === 58 ? 58 : 80 }));
  if (!c.impressoras.some((i) => i.id === c.impressoraAtual)) c.impressoraAtual = c.impressoras[0]?.id || "";
  return c;
}

export function config() { return mesclar(CONFIG_PADRAO, migrar(ler("config.json", {}))); }
// "impressoras" chega sempre inteira (lista), o resto é mesclado
export function salvarConfig(novo) {
  const atual = config();
  const c = migrar({ ...mesclar(atual, { ...novo, impressoras: undefined }), impressoras: Array.isArray(novo.impressoras) ? novo.impressoras : atual.impressoras });
  gravar("config.json", c);
  return c;
}
export const impressora = (c, id) => c.impressoras.find((i) => i.id === id) || c.impressoras.find((i) => i.id === c.impressoraAtual) || null;

// produtos.json: { manuais: [{id, nome, preco, unidade, complemento, codigo}],
//                  ajustes: { id: {nome, complemento, unidade, preco, precoDe, oferta, copias} },
//                  impressos: { id: { preco, em } } }
const VAZIO = { manuais: [], ajustes: {}, impressos: {} };
export function produtos() { return { ...VAZIO, ...ler("produtos.json", VAZIO) }; }

export function salvarManual(p) {
  const d = produtos();
  const item = {
    id: p.id || "man:" + crypto.randomUUID(),
    nome: String(p.nome || "").trim().slice(0, 120),
    preco: Math.max(0, Number(p.preco) || 0),
    unidade: p.unidade || "kg",
    complemento: String(p.complemento || "").trim().slice(0, 80),
    codigo: String(p.codigo || "").trim().slice(0, 30),
  };
  if (!item.nome) throw new Error("Informe o nome do produto.");
  const i = d.manuais.findIndex((x) => x.id === item.id);
  if (i >= 0) d.manuais[i] = item; else d.manuais.push(item);
  gravar("produtos.json", d);
  return item;
}
export function excluirManual(id) {
  const d = produtos();
  d.manuais = d.manuais.filter((x) => x.id !== id);
  delete d.ajustes[id];
  gravar("produtos.json", d);
}
// ajuste = mudanças só para a etiqueta (o PDV+ nunca é alterado)
export function salvarAjuste(id, ajuste) {
  const d = produtos();
  const atual = d.ajustes[id] || {};
  const novo = { ...atual, ...ajuste };
  for (const k of Object.keys(novo)) if (novo[k] === null || novo[k] === "" || novo[k] === undefined) delete novo[k];
  if (Object.keys(novo).length) d.ajustes[id] = novo; else delete d.ajustes[id];
  gravar("produtos.json", d);
  return d.ajustes[id] || {};
}
export function marcarImpressos(lista) {
  const d = produtos();
  const em = new Date().toISOString();
  for (const { id, preco } of lista) d.impressos[id] = { preco: Number(preco) || 0, em };
  gravar("produtos.json", d);
  return d.impressos;
}
