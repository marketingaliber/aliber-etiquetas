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

function modeloAtual() {
  const c = estado.cfg;
  return { ...c.modelo, bobina: Number(c.bobina) || 80, loja: c.loja, mostrarData: c.mostrarData, textoData: c.textoData, textoOferta: c.textoOferta, mostrarCodigo: c.mostrarCodigo };
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
  const maxW = $(".previa-caixa").clientWidth - 60;
  const escala = Math.min(maxW / c.width, (deitada ? 380 : 520) / c.height, 0.9);
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

function bitsDe(i) {
  const m = modeloAtual();
  const c = E.desenharEtiqueta(i, m);
  return E.paraBits(E.naPosicaoDoPapel(c, m.formato));
}

async function imprimir(lista) {
  if (estado.imprimindo || !lista.length) return;
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
      const r = await api.imprimir({ etiquetas: fila.map((f) => f.bits), itens });
      if (r.impressos) estado.local.impressos = r.impressos;
      fila = [];
    };
    for (const { i, copias } of lista) {
      const bits = bitsDe(i);
      for (let k = 0; k < copias; k++) { fila.push({ i, bits }); if (fila.length >= LOTE) await enviar(); }
    }
    await enviar();
    aviso(`${total} etiqueta${total > 1 ? "s" : ""} enviada${total > 1 ? "s" : ""} para a impressora.`, "ok");
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
  for (const el of $$("[data-mostrar]")) el.hidden = el.dataset.mostrar !== c.impressora.tipo;
  $("#cfgTema").value = c.tema;
  document.documentElement.dataset.tema = c.tema;
}

async function listarImpressoras() {
  const sel = $("#cfgImpressora");
  sel.replaceChildren(new Option("Procurando impressoras…", ""));
  try {
    const lista = await api.impressoras();
    const atual = estado.cfg.impressora.nomeWindows;
    const ops = lista.map((p) => new Option(`${p.nome}${p.driver ? "  —  " + p.driver : ""}`, p.nome));
    if (atual && !lista.some((p) => p.nome === atual)) ops.unshift(new Option(`${atual} (não encontrada agora)`, atual));
    ops.unshift(new Option(lista.length ? "Escolha a impressora…" : "Nenhuma impressora encontrada", ""));
    sel.replaceChildren(...ops);
    sel.value = atual || "";
    // sugere a Elgin sozinha na primeira vez
    if (!atual) {
      const elgin = lista.find((p) => /elgin|i9|i8/i.test(p.nome + " " + p.driver));
      if (elgin) { sel.value = elgin.nome; await salvarCfg({ impressora: { nomeWindows: elgin.nome } }); aviso(`Impressora escolhida: ${elgin.nome}`, "ok"); }
    }
  } catch (e) {
    sel.replaceChildren(new Option("Não consegui listar as impressoras", ""));
    aviso(e.message, "ruim");
  }
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
  for (const s of $$(".seg[data-cfg]")) s.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const v = s.dataset.cfg === "bobina" ? Number(b.dataset.v) : b.dataset.v;
    await salvarCfg(montarParcial(s.dataset.cfg, v));
    preencherConfig(); marcarSegmentos();
  });
  for (const el of $$("[data-cfg-in]")) el.addEventListener("change", async () => {
    let v = el.value.trim();
    if (["espacoMm", "impressora.porta"].includes(el.dataset.cfgIn)) v = Math.max(0, Number(v) || 0);
    await salvarCfg(montarParcial(el.dataset.cfgIn, v));
    if (el.dataset.cfgIn === "pastaPdv") lerPdv();
  });
  for (const el of $$("[data-cfg-chk]")) el.addEventListener("change", async () => {
    await salvarCfg(montarParcial(el.dataset.cfgChk, el.checked));
    if (el.dataset.cfgChk === "usarPdv") lerPdv();
  });
  $("#cfgUnidadePadrao").addEventListener("change", async (e) => { await salvarCfg({ unidadePadrao: e.target.value }); montarItens(); desenharLista(); });
  $("#cfgImpressora").addEventListener("change", (e) => salvarCfg({ impressora: { nomeWindows: e.target.value } }));
  $("#btnListarImp").addEventListener("click", listarImpressoras);
  $("#btnPasta").addEventListener("click", async () => {
    const p = await api.escolherPasta(estado.cfg.pastaPdv);
    if (p) { await salvarCfg({ pastaPdv: p }); preencherConfig(); lerPdv(); }
  });
  $("#btnTeste").addEventListener("click", () => imprimir([{ i: { id: "teste", nome: "Teste Aliber", complemento: "Etiqueta de teste", preco: 12.34, unidade: "kg", codigo: "0" }, copias: 1 }]));
  $("#cfgTema").addEventListener("change", async (e) => { await salvarCfg({ tema: e.target.value }); preencherConfig(); });
  $("#btnPastaDados").addEventListener("click", () => api.abrirPastaDados());
  window.addEventListener("resize", debounce(desenharPrevia, 150));
}

/* ---------------- início ---------------- */

async function iniciar() {
  await E.carregarFontes();
  const [cfg, local, info] = await Promise.all([api.config(), api.produtosLocais(), api.info()]);
  estado.cfg = cfg; estado.local = local;
  $("#infoApp").textContent = `Aliber Etiquetas ${info.versao} — Aliber Informática / Sistemas. Dados salvos em ${info.pastaDados}.`;
  preencherConfig();
  marcarSegmentos();
  ligarEventos();
  montarItens();
  desenharLista();
  desenharPrevia();
  lerPdv();
  if (info.plataforma === "win32" && cfg.impressora.tipo === "windows") listarImpressoras();
  else $("#cfgImpressora").replaceChildren(new Option(cfg.impressora.nomeWindows || "Escolha a impressora…", cfg.impressora.nomeWindows || ""));
  document.title = "Aliber Etiquetas";
  document.body.dataset.pronto = "1";
}
iniciar().catch((e) => aviso("Erro ao abrir: " + e.message, "ruim"));
