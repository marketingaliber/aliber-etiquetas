// Aliber Etiquetas — processo principal (Electron).
// Janela única; o desenho das etiquetas acontece na tela (canvas) e aqui só
// ficam: dados em disco, leitura do PDV+ e envio para a impressora.
import { app, BrowserWindow, ipcMain, dialog, shell, Menu, net } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dados from "../core/dados.js";
import { lerProdutos } from "../core/pdv.js";
import { etiquetasParaEscPos } from "../core/escpos.js";
import { enviarWindows, enviarRede, impressorasWindows } from "../core/impressao.js";
import { entrar as entrarTecnico, conferir as conferirTecnico } from "../core/tecnico.js";
import { listarVersoes, urlDaVersao } from "../core/versoes.js";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const here = path.dirname(fileURLToPath(import.meta.url));
app.setAppUserModelId("br.com.aliber.etiquetas");
if (!app.requestSingleInstanceLock()) app.quit();

let janela = null;

/* ---------- troca de versão (área do técnico) ---------- */
// Igual ao Aliber Print: não há aviso nem atualização automática. O técnico
// escolhe a versão (com senha) e ela é baixada e instalada na hora. Cada
// versão publicada tem o próprio latest.yml; o atualizador é apontado para a
// pasta daquela versão, o que permite também voltar para uma mais antiga.
const atualizacao = {
  estado: { estado: "parado" },
  set(e) { this.estado = { ...this.estado, ...e }; janela?.webContents.send("atualizacao", this.estado); },
  instalarVersao(versao) {
    if (!app.isPackaged) throw new Error("A troca de versão só funciona no Aliber Etiquetas instalado.");
    if (["baixando", "verificando", "instalando"].includes(this.estado.estado)) throw new Error("Já existe uma instalação em andamento.");
    this.set({ estado: "verificando", versao, pct: 0, erro: null });
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = true;
    autoUpdater.setFeedURL({ provider: "generic", url: urlDaVersao(versao) });
    autoUpdater.checkForUpdates().catch((e) => this.set({ estado: "erro", erro: String(e?.message || e).split("\n")[0] }));
  },
};
function prepararAtualizacao() {
  autoUpdater.logger = null;
  const erro = (e) => atualizacao.set({ estado: "erro", erro: String(e?.message || e).split("\n")[0] });
  autoUpdater.on("update-available", () => {
    atualizacao.set({ estado: "baixando", pct: 0 });
    autoUpdater.downloadUpdate().catch(erro);
  });
  autoUpdater.on("update-not-available", () => atualizacao.set({ estado: "erro", erro: "Essa já é a versão instalada." }));
  autoUpdater.on("download-progress", (p) => atualizacao.set({ estado: "baixando", pct: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", () => {
    atualizacao.set({ estado: "instalando", pct: 100 });
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  });
  autoUpdater.on("error", erro);
}

function criarJanela() {
  janela = new BrowserWindow({
    width: 1320, height: 860, minWidth: 1024, minHeight: 640,
    title: "Aliber Etiquetas", backgroundColor: "#0e1626", show: false,
    icon: path.join(here, "assets", "icon.png"),
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  janela.once("ready-to-show", () => { janela.maximize(); janela.show(); });
  janela.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  janela.loadFile(path.join(here, "..", "panel", "index.html"));
  if (process.env.ALIBER_DEV) janela.webContents.openDevTools({ mode: "detach" });
}

app.on("second-instance", () => { if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); } });

// toda chamada da tela devolve { ok, valor } ou { ok:false, erro }
function canal(nome, fn) {
  ipcMain.handle(nome, async (_e, ...args) => {
    try { return { ok: true, valor: await fn(...args) }; }
    catch (e) { console.error(`[${nome}]`, e); return { ok: false, erro: String(e?.message || e) }; }
  });
}

app.whenReady().then(() => {
  dados.iniciar(process.env.ALIBER_DADOS || path.join(app.getPath("appData"), "Aliber Etiquetas"));

  prepararAtualizacao();
  canal("app:info", () => ({ versao: app.getVersion(), pastaDados: dados.pastaDados(), plataforma: process.platform, instalado: app.isPackaged }));
  canal("tecnico:entrar", (senha) => entrarTecnico(senha));
  canal("versoes:listar", async (chave) => {
    conferirTecnico(chave);
    return { atual: app.getVersion(), versoes: await listarVersoes(app.getVersion(), (u, o) => net.fetch(u, o)) };
  });
  canal("versoes:instalar", (chave, versao) => {
    conferirTecnico(chave);
    if (!/^\d+\.\d+\.\d+$/.test(String(versao))) throw new Error("Versão inválida.");
    atualizacao.instalarVersao(String(versao));
    return true;
  });
  canal("versoes:estado", () => atualizacao.estado);
  canal("config:ler", () => dados.config());
  canal("config:salvar", (c) => dados.salvarConfig(c));
  canal("produtos:locais", () => dados.produtos());
  canal("produtos:pdv", async () => {
    const c = dados.config();
    if (!c.usarPdv) return null;
    return lerProdutos(c.pastaPdv);
  });
  canal("produto:salvarManual", (p) => dados.salvarManual(p));
  canal("produto:excluirManual", (id) => dados.excluirManual(id));
  canal("produto:ajuste", (id, a) => dados.salvarAjuste(id, a));
  canal("impressoras", () => impressorasWindows());
  canal("pasta:escolher", async (atual) => {
    const r = await dialog.showOpenDialog(janela, { title: "Pasta do PDV+", defaultPath: atual || "C:\\", properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  canal("pasta:abrirDados", () => shell.openPath(dados.pastaDados()));
  canal("imprimir", async ({ etiquetas, itens, impressoraId }) => {
    if (!etiquetas?.length) throw new Error("Nenhuma etiqueta para imprimir.");
    const c = dados.config();
    const imp = dados.impressora(c, impressoraId);
    if (!imp) throw new Error("Cadastre a impressora em Configurações.");
    const bytes = etiquetasParaEscPos(etiquetas, { corte: imp.corte, espacoMm: imp.espacoMm, modoImagem: imp.modoImagem });
    const nome = imp.nome || "a impressora";
    if (imp.tipo === "rede") {
      if (!imp.ip) throw new Error(`Informe o IP de ${nome} em Configurações.`);
      await enviarRede(imp.ip, Number(imp.porta) || 9100, bytes, 15000);
    } else {
      if (!imp.nomeWindows) throw new Error(`Escolha a impressora do Windows para ${nome} em Configurações.`);
      if (process.platform !== "win32") throw new Error("Impressão pelo Windows só funciona no Windows.");
      await enviarWindows(imp.nomeWindows, bytes);
    }
    return { impressos: itens?.length ? dados.marcarImpressos(itens) : null, bytes: bytes.length };
  });

  criarJanela();
});

app.on("window-all-closed", () => app.quit());
