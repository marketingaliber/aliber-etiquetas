// Aliber Etiquetas — processo principal (Electron).
// Janela única; o desenho das etiquetas acontece na tela (canvas) e aqui só
// ficam: dados em disco, leitura do PDV+ e envio para a impressora.
import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as dados from "../core/dados.js";
import { lerProdutos } from "../core/pdv.js";
import { etiquetasParaEscPos } from "../core/escpos.js";
import { enviarWindows, enviarRede, impressorasWindows } from "../core/impressao.js";

const here = path.dirname(fileURLToPath(import.meta.url));
app.setAppUserModelId("br.com.aliber.etiquetas");
if (!app.requestSingleInstanceLock()) app.quit();

let janela = null;

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

  canal("app:info", () => ({ versao: app.getVersion(), pastaDados: dados.pastaDados(), plataforma: process.platform }));
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
  canal("imprimir", async ({ etiquetas, itens }) => {
    if (!etiquetas?.length) throw new Error("Nenhuma etiqueta para imprimir.");
    const c = dados.config();
    const bytes = etiquetasParaEscPos(etiquetas, { corte: c.corte, espacoMm: c.espacoMm });
    const imp = c.impressora || {};
    if (imp.tipo === "rede") {
      if (!imp.ip) throw new Error("Informe o IP da impressora em Configurações.");
      await enviarRede(imp.ip, Number(imp.porta) || 9100, bytes, 15000);
    } else {
      if (!imp.nomeWindows) throw new Error("Escolha a impressora em Configurações.");
      if (process.platform !== "win32") throw new Error("Impressão pelo Windows só funciona no Windows.");
      await enviarWindows(imp.nomeWindows, bytes);
    }
    return { impressos: itens?.length ? dados.marcarImpressos(itens) : null, bytes: bytes.length };
  });

  criarJanela();
});

app.on("window-all-closed", () => app.quit());
