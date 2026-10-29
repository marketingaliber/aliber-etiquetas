// Tela do Aliber Etiquetas.
import * as E from "./etiqueta.js";

const api = window.aliber;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const LIMITE_LISTA = 400;

const estado = {
  cfg: null,
  pdv: null,            // { produtos, info, atualizadoEm } | null
  erroPdv: null,
  local: { manuais: [], ajustes: {}, impressos: {} },
  itens: [],            // produtos já mesclados com os ajustes
  filtro: "todos",
  busca: "",
  atual: null,          // id
  selecao: new Map(),   // id -> cópias
  imprimindo: false,
};

/* ---------------- utilidades ---------------- */

function aviso(texto, tipo = "") {
  const d = document.createElement("div");
  d.className = "aviso " + tipo;
  d.textContent = texto;
  $("#avisos").append(d);
  setTimeout(() => d.remove(), tipo === "ruim" ? 9000 : 4500);
}
const num = (s) => {
  if (s === null || s === undefined || String(s).trim() === "") return null;
  const t = String(s).replace(/[^\d,.-]/g, "");
  const v = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};
const fmt = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// "TOMATE ITALIANO KG" -> "TOMATE ITALIANO" (a unidade já aparece no preço)
function limparNome(nome) {
  const t = String(nome || "").replace(/\s+/g, " ").trim();
  return t.replace(/\s*[-(]?\s*\b(kg|kgs|kilo|quilo|un|und|unid|bandeja|bdj|maco|maço|mc|duzia|dúzia|dz)\b\.?\s*\)?\s*$/i, "").trim() || t;
}

/* ---------------- produtos ---------------- */

function montarItens() {
  const { ajustes, impressos, manuais } = estado.local;
  const padrao = estado.cfg.unidadePadrao || "kg";
  const base = [];
  for (const p of estado.pdv?.produtos || []) {
    const unidade = p.peso === true ? "kg" : E.normalizarUnidade(p.unidadeBruta, padrao);
    base.push({ id: p.id, origem: "pdv", codigo: p.codigo, nomeOrig: p.nome, nome: limparNome(p.nome), precoOrig: p.preco, preco: p.preco, unidadeOrig: unidade, unidade, complemento: "" });
  }
  for (const m of manuais) base.push({ ...m, origem: "manual", nomeOrig: m.nome, precoOrig: m.preco, unidadeOrig: m.unidade });
  estado.itens = base.map((it) => {
    const a = ajustes[it.id] || {};
    const r = { ...it };
    if (a.nome) r.nome = a.nome;
    if (a.complemento) r.complemento = a.complemento;
    if (a.unidade) r.unidade = a.unidade;
    if (a.preco != null) r.preco = a.preco;
    r.precoDe = a.precoDe ?? null;
    r.oferta = !!a.oferta;
    r.temAjuste = it.origem === "pdv" && (a.nome != null || a.preco != null || a.unidade != null);
    const imp = impressos[it.id];
    r.impresso = imp || null;
    r.mudou = !!imp && Math.abs((Number(imp.preco) || 0) - (Number(r.preco) || 0)) > 0.004;
    r.busca = semAcento(`${r.nome} ${it.nomeOrig} ${r.codigo || ""}`);
    return r;
  });
  for (const id of [...estado.selecao.keys()]) if (!estado.itens.some((i) => i.id === id)) estado.selecao.delete(id);
}

const item = (id) => estado.itens.find((i) => i.id === id);

function filtrados() {
  const termos = semAcento(estado.busca).split(/\s+/).filter(Boolean);
  return estado.itens.filter((i) => {
    if (estado.filtro === "kg" && i.unidade !== "kg") return false;
    if (estado.filtro === "mudou" && !i.mudou) return false;
    if (estado.filtro === "avulsos" && i.origem !== "manual") return false;
    return termos.every((t) => i.busca.includes(t));
  });
}

function desenharLista() {
  const lista = filtrados();
  $("#nTodos").textContent = estado.itens.length;
  $("#nKg").textContent = estado.itens.filter((i) => i.unidade === "kg").length;
  const nm = estado.itens.filter((i) => i.mudou).length;
  $("#nMudou").textContent = nm || "";
  $("#nAvulsos").textContent = estado.itens.filter((i) => i.origem === "manual").length;

  const el = $("#lista");
  el.replaceChildren();
  if (!lista.length) {
    const v = document.createElement("div");
    v.className = "vazio";
    v.textContent = estado.itens.length ? "Nenhum produto com esse filtro." :
      estado.erroPdv ? "Não consegui ler o PDV+. Veja em Configurações, ou cadastre um produto avulso." :
      estado.cfg.usarPdv ? "Lendo os produtos do PDV+…" : "Nenhum produto ainda. Clique em \"Produto avulso\" para cadastrar.";
    el.append(v);
  }
  const frag = document.createDocumentFragment();
  for (const i of lista.slice(0, LIMITE_LISTA)) frag.append(linha(i));
  el.append(frag);
  if (lista.length > LIMITE_LISTA) {
    const m = document.createElement("div");
    m.className = "mais";
    m.textContent = `Mostrando ${LIMITE_LISTA} de ${lista.length}. Use a busca para achar os outros.`;
    el.append(m);
  }
  desenharSelecao();
}

function linha(i) {
  const d = document.createElement("div");
  d.className = "item" + (i.id === estado.atual ? " atual" : "");
  d.dataset.id = i.id;
  const sel = estado.selecao.has(i.id);
  const un = E.UNIDADES[i.unidade]?.curto?.toLowerCase() || i.unidade;
  const selos = [];
  if (i.mudou) selos.push(`<span class="selo mudou" title="Última etiqueta saiu com R$ ${fmt(i.impresso.preco)}">PREÇO MUDOU</span>`);
  if (i.oferta) selos.push(`<span class="selo oferta">OFERTA</span>`);
  if (i.temAjuste) selos.push(`<span class="selo ajuste" title="Nome, preço ou unidade ajustados só para a etiqueta">AJUSTADO</span>`);
  d.innerHTML = `<input type="checkbox" ${sel ? "checked" : ""} aria-label="Selecionar">
    <div style="min-width:0"><div class="nome"></div><div class="det"><span class="cod"></span>${selos.join("")}</div></div>
    <input class="qtd" type="number" min="1" max="50" value="${estado.selecao.get(i.id) || 1}" title="Cópias" ${sel ? "" : "hidden"}>
    <div class="preco">R$ ${fmt(i.preco)}<small>/${un}</small></div>`;
  d.querySelector(".nome").textContent = i.nome;
  d.querySelector(".cod").textContent = i.origem === "manual" ? "Avulso" + (i.codigo ? " · " + i.codigo : "") : i.codigo ? "Cód. " + i.codigo : "PDV+";
  return d;
}

function desenharSelecao() {
  const n = estado.selecao.size;
  let copias = 0;
  for (const c of estado.selecao.values()) copias += c;
  $("#barraSelecao").classList.toggle("tem", n > 0);
  $("#txtSelecao").textContent = n ? `${n} produto${n > 1 ? "s" : ""} selecionado${n > 1 ? "s" : ""} · ${copias} etiqueta${copias > 1 ? "s" : ""}` : "Nenhuma selecionada";
  $("#btnImprimirSel").disabled = !n || estado.imprimindo;
  $("#txtImprimirSel").textContent = n ? `Imprimir selecionadas (${copias})` : "Imprimir selecionadas";
  $("#btnImprimirEsta").disabled = !estado.atual || estado.imprimindo;
}

/* ---------------- modelo e prévia ---------------- */

const impAtual = (id) => estado.cfg.impressoras.find((i) => i.id === (id || estado.cfg.impressoraAtual)) || estado.cfg.impressoras[0] || null;

function modeloAtual(impId) {
  const c = estado.cfg;
  return { ...c.modelo, bobina: Number(impAtual(impId)?.bobina) === 58 ? 58 : 80, loja: c.loja, mostrarData: c.mostrarData, textoData: c.textoData, textoOferta: c.textoOferta, mostrarCodigo: c.mostrarCodigo };
}

function marcarSegmentos() {
  for (const s of $$(".seg[data-campo]")) for (const b of s.children) b.classList.toggle("ativo", b.dataset.v === estado.cfg.modelo[s.dataset.campo]);
  const m = modeloAtual();
  const tam = E.TAMANHOS[m.formato][m.tamanho];
  const larg = m.bobina === 58 ? 58 : 80;
  $("#medida").textContent = m.formato === "deitada" ? `${tam} × ${larg} mm (comprimento × altura)` : `${larg} × ${tam} mm`;
}

const exemplo = { nome: "Tomate Italiano", preco: 7.99, unidade: "kg", codigo: "123", complemento: "" };

function desenharPrevia() {
  const i = item(estado.atual);
  const c = $("#previa");
  E.binarizar(E.desenharEtiqueta(i || exemplo, modeloAtual(), c));
  const deitada = estado.cfg.modelo.formato === "deitada";
  // tamanho na tela proporcional ao papel (as grandes ficam maiores)
  // mesma escala para 80 e 58 mm: a de 58 aparece mais estreita, como no papel
  const maxW = $(".previa-caixa").clientWidth - 60;
  const ref = deitada ? c.width : 576;
  const escala = Math.min(maxW / ref, (deitada ? 380 : 520) / (deitada ? 576 : c.height), 0.9);
  c.style.width = Math.round(c.width * escala) + "px";
  $("#dicaPrevia").textContent = i ? (deitada ? "A etiqueta deitada sai girada no papel; corte e vire para ler assim." : "Prévia em tamanho proporcional, igual ao papel.") : "Exemplo. Escolha um produto na lista para ver a etiqueta dele.";
}

/* ---------------- editor ---------------- */

function opcoesUnidade(sel, valor) {
  sel.replaceChildren(...Object.entries(E.UNIDADES).map(([k, u]) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = `${u.curto} (${u.longo})`;
    if (k === valor) o.selected = true;
    return o;
  }));
}

function abrirEditor() {
  const i = item(estado.atual);
  $("#editor").hidden = !i;
  if (!i) return;
  $("#edTitulo").textContent = i.nomeOrig;
  $("#edOrigem").textContent = i.origem === "pdv" ? "PDV+" : "AVULSO";
  $("#edNome").value = i.nome;
  $("#edComp").value = i.complemento || "";
  opcoesUnidade($("#edUnidade"), i.unidade);
  $("#edPreco").value = fmt(i.preco);
  $("#edOferta").checked = i.oferta;
  $("#edDe").value = i.precoDe ? fmt(i.precoDe) : "";
  $("#campoDe").style.visibility = i.oferta ? "visible" : "hidden";
  $("#btnRestaurar").hidden = !i.temAjuste;
  $("#btnExcluir").hidden = i.origem !== "manual";
  const notas = [];
  if (i.origem === "pdv") {
    notas.push(`No PDV+: ${i.nomeOrig} · R$ ${fmt(i.precoOrig)}${i.codigo ? " · cód. " + i.codigo : ""}.`);
    if (i.preco !== i.precoOrig) notas.push("O preço da etiqueta está diferente do PDV+.");
  }
  if (i.impresso) notas.push(`Última etiqueta: R$ ${fmt(i.impresso.preco)} em ${new Date(i.impresso.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`);
  $("#edNota").textContent = notas.join(" ");
}

const salvarEdicao = debounce(async () => {
  const i = item(estado.atual);
  if (!i) return;
  const nome = $("#edNome").value.trim();
  const preco = num($("#edPreco").value);
  const unidade = $("#edUnidade").value;
  const complemento = $("#edComp").value.trim();
  const oferta = $("#edOferta").checked;
  const precoDe = oferta ? num($("#edDe").value) : null;
  try {
    if (i.origem === "manual") {
      await api.salvarManual({ id: i.id, nome: nome || i.nomeOrig, preco: preco ?? i.precoOrig, unidade, complemento, codigo: i.codigo });
      estado.local = await api.produtosLocais();
      estado.local.ajustes[i.id] = await api.ajuste(i.id, { oferta: oferta || null, precoDe });
    } else {
      estado.local.ajustes[i.id] = await api.ajuste(i.id, {
        nome: nome && nome !== limparNome(i.nomeOrig) ? nome : null,
        preco: preco != null && Math.abs(preco - i.precoOrig) > 0.004 ? preco : null,
        unidade: unidade !== i.unidadeOrig ? unidade : null,
        complemento: complemento || null,
        oferta: oferta || null,
        precoDe,
      });
    }
    montarItens();
    desenharLista();
    desenharPrevia();
    const a = item(estado.atual);
    $("#btnRestaurar").hidden = !a?.temAjuste;
  } catch (e) { aviso(e.message, "ruim"); }
}, 350);

/* ---------------- impressão ---------------- */

function bitsDe(i, impId) {
  const m = modeloAtual(impId);
  const c = E.desenharEtiqueta(i, m);
  return E.paraBits(E.naPosicaoDoPapel(c, m.formato));
}

async function imprimir(lista, impId = estado.cfg.impressoraAtual) {
  if (estado.imprimindo || !lista.length) return;
  const imp = impAtual(impId);
  if (!imp) { aviso("Cadastre a impressora em Configurações.", "ruim"); return; }
  estado.imprimindo = true;
  desenharSelecao();
  const total = lista.reduce((s, x) => s + x.copias, 0);
  try {
    // em lotes, para a impressora não receber um trabalho gigante de uma vez
    const LOTE = 15;
    let fila = [];
    const enviar = async () => {
      if (!fila.length) return;
      const itens = [...new Map(fila.filter((f) => f.i.id !== "teste").map((f) => [f.i.id, { id: f.i.id, preco: f.i.preco }])).values()];
      const r = await api.imprimir({ etiquetas: fila.map((f) => f.bits), itens, impressoraId: imp.id });
      if (r.impressos) estado.local.impressos = r.impressos;
      fila = [];
    };
    for (const { i, copias } of lista) {
      const bits = bitsDe(i, imp.id);
      for (let k = 0; k < copias; k++) { fila.push({ i, bits }); if (fila.length >= LOTE) await enviar(); }
    }
    await enviar();
    aviso(`${total} etiqueta${total > 1 ? "s" : ""} enviada${total > 1 ? "s" : ""} para ${imp.nome || "a impressora"}.`, "ok");
    montarItens();
    desenharLista();
    abrirEditor();
  } catch (e) {
    aviso("Não imprimiu: " + e.message, "ruim");
  } finally {
    estado.imprimindo = false;
    desenharSelecao();
  }
}

/* ---------------- PDV+ ---------------- */

async function lerPdv() {
  const st = $("#statusPdv");
  if (!estado.cfg.usarPdv) {
    estado.pdv = null; estado.erroPdv = null;
    st.className = "status-pdv off"; st.querySelector(".txt").textContent = "PDV+ desligado (só avulsos)";
    montarItens(); desenharLista();
    return;
  }
  st.className = "status-pdv"; st.querySelector(".txt").textContent = "Lendo o PDV+…";
  $("#btnAtualizar").disabled = true;
  try {
    estado.pdv = await api.produtosPdv();
    estado.erroPdv = null;
    const hora = new Date(estado.pdv.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    st.className = "status-pdv ok";
    st.querySelector(".txt").textContent = `PDV+ · ${estado.pdv.produtos.length} produtos · lido às ${hora}`;
    const inf = estado.pdv.info;
    $("#infoPdv").textContent = `Leitura: unidade ← ${inf.unidade || "(não encontrada, usa a unidade padrão)"} · peso ← ${inf.peso || "(não encontrado)"} · ${inf.colunas.length} colunas em produto.`;
  } catch (e) {
    estado.erroPdv = e.message;
    st.className = "status-pdv ruim";
    st.querySelector(".txt").textContent = "PDV+ não encontrado";
    st.title = e.message;
    $("#infoPdv").textContent = e.message;
  } finally {
    $("#btnAtualizar").disabled = false;
  }
  montarItens();
  desenharLista();
  if (estado.atual && !item(estado.atual)) estado.atual = null;
  abrirEditor();
  desenharPrevia();
}

/* ---------------- configurações ---------------- */

const pegar = (obj, cam) => cam.split(".").reduce((o, k) => o?.[k], obj);
function montarParcial(cam, valor) {
  const ks = cam.split(".");
  const out = {}; let o = out;
  ks.forEach((k, idx) => { if (idx === ks.length - 1) o[k] = valor; else o = o[k] = {}; });
  return out;
}
async function salvarCfg(parcial) {
  try { estado.cfg = await api.salvarConfig(parcial); }
  catch (e) { aviso(e.message, "ruim"); }
}

function preencherConfig() {
  const c = estado.cfg;
  for (const s of $$(".seg[data-cfg]")) for (const b of s.children) b.classList.toggle("ativo", String(pegar(c, s.dataset.cfg)) === b.dataset.v);
  for (const el of $$("[data-cfg-in]")) el.value = pegar(c, el.dataset.cfgIn) ?? "";
  for (const el of $$("[data-cfg-chk]")) el.checked = !!pegar(c, el.dataset.cfgChk);
  opcoesUnidade($("#cfgUnidadePadrao"), c.unidadePadrao);
  desenharImpressoras();
  $("#cfgTema").value = c.tema;
  document.documentElement.dataset.tema = c.tema;
}

// ----- impressoras (cada uma com bobina, corte e modo de imagem próprios)
estado.impWindows = null;   // lista do Windows (null = ainda não procurou)

async function listarImpressoras() {
  estado.impWindows = "procurando";
  desenharImpressoras();
  try {
    estado.impWindows = await api.impressoras();
    // sugere a Elgin sozinha na primeira vez
    const imps = estado.cfg.impressoras;
    if (imps.length === 1 && imps[0].tipo === "windows" && !imps[0].nomeWindows) {
      const elgin = estado.impWindows.find((p) => /elgin|i9|i8/i.test(p.nome + " " + p.driver));
      if (elgin) { await salvarImpressora(imps[0].id, { nomeWindows: elgin.nome, nome: imps[0].nome === "Impressora 1" ? elgin.nome : imps[0].nome }); aviso(`Impressora escolhida: ${elgin.nome}`, "ok"); }
    }
  } catch (e) {
    estado.impWindows = [];
    aviso("Não consegui listar as impressoras do Windows: " + e.message, "ruim");
  }
  desenharImpressoras();
}

async function salvarImpressora(id, mudanca) {
  const lista = estado.cfg.impressoras.map((i) => (i.id === id ? { ...i, ...mudanca } : i));
  await salvarCfg({ impressoras: lista });
  desenharEscolhaImp();
  marcarSegmentos();
  desenharPrevia();
}

function opcoesWindows(sel, atual) {
  const w = estado.impWindows;
  const ops = [];
  if (w === "procurando") ops.push(new Option("Procurando impressoras…", atual || ""));
  else if (!Array.isArray(w)) ops.push(new Option(atual || "Clique em \"Procurar impressoras do Windows\"", atual || ""));
  else {
    ops.push(new Option(w.length ? "Escolha a impressora…" : "Nenhuma impressora encontrada", ""));
    if (atual && !w.some((p) => p.nome === atual)) ops.push(new Option(`${atual} (não encontrada agora)`, atual));
    for (const p of w) ops.push(new Option(`${p.nome}${p.driver ? "  —  " + p.driver : ""}`, p.nome));
  }
  sel.replaceChildren(...ops);
  sel.value = atual || "";
}

function desenharImpressoras() {
  const caixa = $("#listaImpressoras");
  if (!caixa) return;
  caixa.replaceChildren();
  const unica = estado.cfg.impressoras.length <= 1;
  for (const imp of estado.cfg.impressoras) {
    const el = $("#tplImpressora").content.firstElementChild.cloneNode(true);
    el.dataset.id = imp.id;
    for (const seg of el.querySelectorAll(".seg[data-k]")) for (const b of seg.children) b.classList.toggle("ativo", String(imp[seg.dataset.k]) === b.dataset.v);
    for (const inp of el.querySelectorAll("input[data-k]")) inp.value = imp[inp.dataset.k] ?? "";
    el.querySelector("select[data-k=modoImagem]").value = imp.modoImagem || "padrao";
    opcoesWindows(el.querySelector("select[data-k=nomeWindows]"), imp.nomeWindows);
    for (const x of el.querySelectorAll("[data-se]")) x.hidden = x.dataset.se !== imp.tipo;
    el.querySelector("[data-acao=remover]").hidden = unica;
    caixa.append(el);
  }
  desenharEscolhaImp();
}

function desenharEscolhaImp() {
  const imps = estado.cfg.impressoras;
  const sel = $("#impAtual");
  sel.replaceChildren(...imps.map((i) => new Option(`${i.nome || "Impressora"} (${i.bobina} mm)`, i.id)));
  sel.value = estado.cfg.impressoraAtual;
  $("#escolhaImp").hidden = imps.length <= 1;
}

function ligarImpressoras() {
  const caixa = $("#listaImpressoras");
  const idDe = (e) => e.target.closest(".imp")?.dataset.id;
  caixa.addEventListener("click", async (e) => {
    const id = idDe(e); if (!id) return;
    const b = e.target.closest(".seg[data-k] button");
    if (b) {
      e.preventDefault();
      const k = b.parentElement.dataset.k;
      await salvarImpressora(id, { [k]: k === "bobina" ? Number(b.dataset.v) : b.dataset.v });
      desenharImpressoras();
      if (k === "tipo" && b.dataset.v === "windows" && !Array.isArray(estado.impWindows)) listarImpressoras();
      return;
    }
    const acao = e.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "teste") {
      e.preventDefault();
      const imp = impAtual(id);
      imprimir([{ i: { id: "teste", nome: "Teste Aliber", complemento: `${imp.nome || "Impressora"} · bobina ${imp.bobina} mm`, preco: 12.34, unidade: "kg", codigo: "0" }, copias: 1 }], id);
    }
    if (acao === "remover") {
      e.preventDefault();
      if (!confirm("Remover esta impressora do Aliber Etiquetas?")) return;
      await salvarCfg({ impressoras: estado.cfg.impressoras.filter((i) => i.id !== id) });
      desenharImpressoras(); marcarSegmentos(); desenharPrevia();
    }
  });
  caixa.addEventListener("change", async (e) => {
    const id = idDe(e); const k = e.target.dataset?.k; if (!id || !k) return;
    let v = e.target.value.trim();
    if (k === "porta") v = Math.max(1, Number(v) || 9100);
    if (k === "espacoMm") v = Math.max(0, Math.min(20, Number(v) || 0));
    await salvarImpressora(id, { [k]: v });
  });
  $("#btnAddImp").addEventListener("click", async () => {
    const n = estado.cfg.impressoras.length + 1;
    let id = "imp" + n; while (estado.cfg.impressoras.some((i) => i.id === id)) id += "x";
    await salvarCfg({ impressoras: [...estado.cfg.impressoras, { id, nome: `Impressora ${n} (58 mm)`, tipo: "windows", bobina: 58, corte: "total", espacoMm: 0, modoImagem: "padrao", porta: 9100 }] });
    desenharImpressoras();
    if (!Array.isArray(estado.impWindows)) listarImpressoras();
  });
  $("#btnListarImp").addEventListener("click", listarImpressoras);
  $("#impAtual").addEventListener("change", async (e) => {
    await salvarCfg({ impressoraAtual: e.target.value });
    marcarSegmentos(); desenharPrevia();
  });
}

// ----- troca de versão (área do técnico), igual ao Aliber Print
let chaveTecnico = null;
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ligarVersoes() {
  $("#btnVersao").addEventListener("click", () => {
    if (chaveTecnico) return abrirVersoes();
    $("#senhaTecnico").value = ""; $("#erroTecnico").textContent = "";
    $("#dlgTecnico").showModal();
    $("#senhaTecnico").focus();
  });
  $("#formTecnico").addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "entrar") return;
    e.preventDefault();
    try {
      chaveTecnico = await api.entrarTecnico($("#senhaTecnico").value);
      $("#dlgTecnico").close();
      abrirVersoes();
    } catch (err) { $("#erroTecnico").textContent = err.message; }
  });
  $("#btnFecharVersoes").addEventListener("click", () => $("#dlgVersoes").close());
  $("#versoesLista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-instalar]");
    if (b) instalarVersao(b.dataset.instalar, b.dataset.antiga === "1");
  });
  api.aoMudarAtualizacao((a) => { estado.atualizacao = a; desenharProgresso(); });
}

async function abrirVersoes() {
  $("#erroVersoes").textContent = "";
  $("#versoesAtual").textContent = `Versão instalada neste computador: ${estado.info.versao}.`;
  $("#versoesLista").innerHTML = `<p class="nota">Buscando as versões publicadas…</p>`;
  if (!$("#dlgVersoes").open) $("#dlgVersoes").showModal();
  estado.atualizacao = await api.estadoAtualizacao().catch(() => null);
  desenharProgresso();
  try {
    const { versoes } = await api.versoes(chaveTecnico);
    $("#versoesLista").innerHTML = versoes.length ? versoes.map((v) => `
      <div class="versao ${v.instalada ? "atual" : ""}">
        <div><span class="num">${esc(v.versao)}</span> <span class="quando">${v.data ? new Date(v.data).toLocaleDateString("pt-BR") : ""} · ${v.tamanhoMB} MB${v.instalada ? " · instalada" : v.maisAntiga ? " · mais antiga" : ""}</span></div>
        <div>${v.instalada ? "" : `<button type="button" class="btn ${v.maisAntiga ? "" : "primario"}" data-instalar="${esc(v.versao)}" data-antiga="${v.maisAntiga ? 1 : 0}">Instalar esta versão</button>`}</div>
        ${v.notas ? `<div class="notas">${esc(v.notas)}</div>` : ""}
      </div>`).join("") : `<p class="nota">Nenhuma versão publicada ainda.</p>`;
  } catch (e) {
    $("#versoesLista").innerHTML = "";
    $("#erroVersoes").textContent = e.message;
    if (/senha do técnico/i.test(e.message)) chaveTecnico = null;
  }
}

async function instalarVersao(versao, antiga) {
  const msg = antiga
    ? `Voltar para a versão ${versao}?\n\nRecursos criados depois dela deixam de existir. O Aliber Etiquetas fecha por alguns segundos e volta sozinho.`
    : `Instalar a versão ${versao}?\n\nO Aliber Etiquetas fecha por alguns segundos e volta sozinho. Impressoras, produtos e ajustes são mantidos.`;
  if (!confirm(msg)) return;
  try {
    await api.instalarVersao(chaveTecnico, versao);
    $$("[data-instalar]").forEach((b) => (b.disabled = true));
  } catch (e) {
    $("#erroVersoes").textContent = e.message;
    if (/senha do técnico/i.test(e.message)) chaveTecnico = null;
  }
}

function desenharProgresso() {
  const box = $("#versoesProgresso");
  const a = estado.atualizacao;
  if (!a || a.estado === "parado") { box.hidden = true; return; }
  box.hidden = false;
  box.classList.toggle("ruim", a.estado === "erro");
  box.textContent = {
    verificando: `Preparando a versão ${a.versao}…`,
    baixando: `Baixando a versão ${a.versao}… ${a.pct || 0}%`,
    instalando: `Instalando a versão ${a.versao}. O Aliber Etiquetas vai fechar e voltar em alguns segundos.`,
    erro: `Não instalou: ${a.erro || "erro desconhecido"}`,
  }[a.estado] || "";
  if (a.estado === "erro") $$("[data-instalar]").forEach((b) => (b.disabled = false));
}

/* ---------------- eventos ---------------- */

function ligarEventos() {
  for (const b of $$(".aba")) b.addEventListener("click", () => {
    $$(".aba").forEach((x) => x.classList.toggle("ativo", x === b));
    $("#verEtiquetas").hidden = b.dataset.ver !== "etiquetas";
    $("#verConfig").hidden = b.dataset.ver !== "config";
    if (b.dataset.ver === "etiquetas") desenharPrevia();
  });
  $("#btnAtualizar").addEventListener("click", lerPdv);
  $("#busca").addEventListener("input", debounce((e) => { estado.busca = e.target.value; desenharLista(); }, 120));
  $("#busca").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const p = filtrados()[0]; if (p) { estado.atual = p.id; desenharLista(); abrirEditor(); desenharPrevia(); } }
  });
  for (const c of $$(".chip")) c.addEventListener("click", () => {
    estado.filtro = c.dataset.f;
    $$(".chip").forEach((x) => x.classList.toggle("ativo", x === c));
    desenharLista();
  });

  $("#lista").addEventListener("click", (e) => {
    const linhaEl = e.target.closest(".item");
    if (!linhaEl) return;
    const id = linhaEl.dataset.id;
    if (e.target.matches("input.qtd")) return;
    if (e.target.matches("input[type=checkbox]")) {
      if (e.target.checked) estado.selecao.set(id, estado.selecao.get(id) || 1); else estado.selecao.delete(id);
      linhaEl.querySelector(".qtd").hidden = !e.target.checked;
      desenharSelecao();
      return;
    }
    estado.atual = id;
    $$(".item.atual").forEach((x) => x.classList.remove("atual"));
    linhaEl.classList.add("atual");
    desenharSelecao();
    abrirEditor();
    desenharPrevia();
  });
  $("#lista").addEventListener("change", (e) => {
    if (!e.target.matches("input.qtd")) return;
    const id = e.target.closest(".item").dataset.id;
    const v = Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1)));
    e.target.value = v;
    estado.selecao.set(id, v);
    desenharSelecao();
  });
  $("#btnSelVisiveis").addEventListener("click", () => {
    for (const i of filtrados().slice(0, LIMITE_LISTA)) if (!estado.selecao.has(i.id)) estado.selecao.set(i.id, 1);
    desenharLista();
  });
  $("#btnSelLimpar").addEventListener("click", () => { estado.selecao.clear(); desenharLista(); });

  for (const s of $$(".seg[data-campo]")) s.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    estado.cfg.modelo[s.dataset.campo] = b.dataset.v;
    marcarSegmentos(); desenharPrevia();
    await salvarCfg({ modelo: { [s.dataset.campo]: b.dataset.v } });
  });

  for (const id of ["#edNome", "#edComp", "#edPreco", "#edDe"]) $(id).addEventListener("input", salvarEdicao);
  $("#edUnidade").addEventListener("change", salvarEdicao);
  $("#edOferta").addEventListener("change", () => { $("#campoDe").style.visibility = $("#edOferta").checked ? "visible" : "hidden"; salvarEdicao(); });
  $("#btnRestaurar").addEventListener("click", async () => {
    const i = item(estado.atual); if (!i) return;
    estado.local.ajustes[i.id] = await api.ajuste(i.id, { nome: null, preco: null, unidade: null });
    montarItens(); desenharLista(); abrirEditor(); desenharPrevia();
  });
  $("#btnExcluir").addEventListener("click", async () => {
    const i = item(estado.atual); if (!i || i.origem !== "manual") return;
    await api.excluirManual(i.id);
    estado.local = await api.produtosLocais();
    estado.selecao.delete(i.id);
    estado.atual = null;
    montarItens(); desenharLista(); abrirEditor(); desenharPrevia();
    aviso("Produto avulso excluído.");
  });

  $("#btnImprimirEsta").addEventListener("click", () => {
    const i = item(estado.atual); if (!i) return;
    const copias = Math.max(1, Math.min(50, Math.round(Number($("#copiasAtual").value) || 1)));
    imprimir([{ i, copias }]);
  });
  $("#btnImprimirSel").addEventListener("click", () => {
    const lista = [...estado.selecao].map(([id, copias]) => ({ i: item(id), copias })).filter((x) => x.i);
    imprimir(lista.sort((a, b) => a.i.nome.localeCompare(b.i.nome, "pt-BR")));
  });

  // produto avulso
  $("#btnAvulso").addEventListener("click", () => {
    $("#avNome").value = ""; $("#avPreco").value = ""; $("#avComp").value = ""; $("#avCodigo").value = "";
    opcoesUnidade($("#avUnidade"), estado.cfg.unidadePadrao || "kg");
    $("#dlgAvulso").showModal();
    $("#avNome").focus();
  });
  $("#dlgAvulso").addEventListener("close", async () => {
    if ($("#dlgAvulso").returnValue !== "salvar") return;
    const preco = num($("#avPreco").value);
    if (!$("#avNome").value.trim() || preco == null) { aviso("Informe o nome e o preço.", "ruim"); return; }
    try {
      const novo = await api.salvarManual({ nome: $("#avNome").value, preco, unidade: $("#avUnidade").value, complemento: $("#avComp").value, codigo: $("#avCodigo").value });
      estado.local = await api.produtosLocais();
      montarItens();
      estado.atual = novo.id;
      estado.selecao.set(novo.id, 1);
      desenharLista(); abrirEditor(); desenharPrevia();
      aviso("Produto avulso salvo e selecionado.", "ok");
    } catch (e) { aviso(e.message, "ruim"); }
  });

  // configurações
  ligarImpressoras();
  ligarVersoes();
  for (const el of $$("[data-cfg-in]")) el.addEventListener("change", async () => {
    let v = el.value.trim();
    await salvarCfg(montarParcial(el.dataset.cfgIn, v));
    if (el.dataset.cfgIn === "pastaPdv") lerPdv();
  });
  for (const el of $$("[data-cfg-chk]")) el.addEventListener("change", async () => {
    await salvarCfg(montarParcial(el.dataset.cfgChk, el.checked));
    if (el.dataset.cfgChk === "usarPdv") lerPdv();
  });
  $("#cfgUnidadePadrao").addEventListener("change", async (e) => { await salvarCfg({ unidadePadrao: e.target.value }); montarItens(); desenharLista(); });
  $("#btnPasta").addEventListener("click", async () => {
    const p = await api.escolherPasta(estado.cfg.pastaPdv);
    if (p) { await salvarCfg({ pastaPdv: p }); preencherConfig(); lerPdv(); }
  });
  $("#cfgTema").addEventListener("change", async (e) => { await salvarCfg({ tema: e.target.value }); preencherConfig(); });
  $("#btnPastaDados").addEventListener("click", () => api.abrirPastaDados());
  window.addEventListener("resize", debounce(desenharPrevia, 150));
}

/* ---------------- início ---------------- */

async function iniciar() {
  await E.carregarFontes();
  const [cfg, local, info] = await Promise.all([api.config(), api.produtosLocais(), api.info()]);
  estado.cfg = cfg; estado.local = local; estado.info = info;
  $("#infoApp").textContent = `Aliber Etiquetas ${info.versao} — Aliber Informática / Sistemas. Dados salvos em ${info.pastaDados}.`;
  $("#txtVersao").textContent = `Versão instalada: ${info.versao}. Para instalar outra (mais nova ou voltar a uma anterior), use a área do técnico.`;
  preencherConfig();
  marcarSegmentos();
  ligarEventos();
  montarItens();
  desenharLista();
  desenharPrevia();
  lerPdv();
  if (info.plataforma === "win32" && cfg.impressoras.some((i) => i.tipo === "windows")) listarImpressoras();
  document.title = "Aliber Etiquetas";
  document.body.dataset.pronto = "1";
}
iniciar().catch((e) => aviso("Erro ao abrir: " + e.message, "ruim"));
