// Entrega os bytes à impressora: rede (RAW 9100) ou Windows (spooler, modo RAW).
// Mesmo motor do Aliber Print (ajudante próprio + PowerShell de reserva).
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), "rawprint.ps1");
// programa próprio que fala direto com o spooler do Windows (ferramentas/ajudante/ajudante.c)
const AJUDANTE = path.join(path.dirname(fileURLToPath(import.meta.url)), "bin", "aliberprint-ajudante.exe");

// roda o ajudante. Erro com .naoRodou = true quando o programa nem abriu
// (ex.: bloqueado por antivírus); aí vale tentar pelo PowerShell.
function ajudante(args, timeout) {
  return new Promise((resolve, reject) => {
    let p;
    try { p = spawn(AJUDANTE, args, { windowsHide: true }); }
    catch (e) { e.naoRodou = true; return reject(e); }
    const out = [], err = [];
    const t = setTimeout(() => { p.kill(); reject(new Error("O Windows não respondeu a tempo.")); }, timeout);
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => err.push(d));
    p.on("error", (e) => { clearTimeout(t); e.naoRodou = true; reject(e); });
    p.on("close", (code) => {
      clearTimeout(t);
      const saida = Buffer.concat(out).toString("utf8").trim();
      const msg = Buffer.concat(err).toString("utf8").trim();
      if (code === 0) return resolve(saida);
      const e = new Error(msg || `O ajudante de impressão terminou com código ${code}.`);
      e.codigo = code;
      reject(e);
    });
  });
}
const temAjudante = () => process.platform === "win32" && fs.existsSync(AJUDANTE);

function powershell(args, timeout) {
  return new Promise((resolve, reject) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args], { windowsHide: true });
    let out = "", err = "";
    const t = setTimeout(() => { ps.kill(); reject(new Error("O Windows não respondeu a tempo.")); }, timeout);
    ps.stdout.on("data", (d) => (out += d));
    ps.stderr.on("data", (d) => (err += d));
    ps.on("error", (e) => { clearTimeout(t); reject(e); });
    ps.on("close", (code) => {
      clearTimeout(t);
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim().split("\n")[0] || `PowerShell terminou com código ${code}`));
    });
  });
}

export function enviarRede(ip, porta, bytes, timeout = 6000) {
  return new Promise((resolve, reject) => {
    let fim = false;
    const sock = net.connect({ host: ip, port: porta || 9100 });
    const acabar = (err) => {
      if (fim) return;
      fim = true;
      sock.destroy();
      err ? reject(err) : resolve();
    };
    sock.setTimeout(timeout, () => acabar(new Error(`Sem resposta de ${ip}:${porta}. A impressora está ligada e na rede?`)));
    sock.on("connect", () => sock.end(bytes));
    sock.on("finish", () => setTimeout(() => acabar(), 150));
    sock.on("close", () => acabar());
    sock.on("error", (e) => acabar(new Error(
      e.code === "ECONNREFUSED" ? `${ip}:${porta} recusou a conexão.` :
      e.code === "EHOSTUNREACH" ? `${ip} não foi encontrado na rede.` : e.message)));
  });
}

export async function enviarWindows(nome, bytes) {
  const tmp = path.join(os.tmpdir(), `aliberetiquetas_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
  fs.writeFileSync(tmp, bytes);
  try {
    if (temAjudante()) {
      try {
        const saida = await ajudante(["imprimir", nome, tmp], 20000);   // "OK <bytes> <id do trabalho>"
        const id = Number(saida.split(/\s+/)[2]);
        return { jobId: id > 0 ? id : null };
      } catch (e) { if (!e.naoRodou) throw e; }   // só cai para o PowerShell se o ajudante nem abriu
    }
    await powershell(["-File", SCRIPT_RAW, "-Impressora", nome, "-Arquivo", tmp], 30000);
    return { jobId: null };
  } finally {
    fs.unlink(tmp, () => {});
  }
}

export function enviar(imp, bytes) {
  if (!imp) return Promise.reject(new Error("Impressora não encontrada."));
  if (imp.tipo === "rede") return enviarRede(imp.ip, imp.portaDestino, bytes);
  return enviarWindows(imp.nomeWindows, bytes);
}

// Fila do Windows de uma impressora: { status, atributos, trabalhos: [{id, documento, status, statusTexto, enviado, bytes}] }
// null quando o ajudante não pode rodar (aí não dá para vigiar a fila).
export async function filaWindows(nome) {
  if (!temAjudante()) return null;
  try { return JSON.parse(await ajudante(["fila", nome], 10000)); }
  catch (e) { if (e.naoRodou) return null; throw e; }
}

// Cancela os trabalhos da fila do Windows dessa impressora: { apagados, falhas }
export async function limparFilaWindows(nome) {
  if (!temAjudante()) throw new Error("Não consegui acessar a fila do Windows neste computador. Limpe pela fila de impressão do Windows.");
  return JSON.parse(await ajudante(["limpar", nome], 20000));
}

// Portas USB de impressora e portas COM pelo ajudante (null se ele não puder rodar)
export async function portasPeloAjudante() {
  if (!temAjudante()) return null;
  try { return JSON.parse(await ajudante(["portas"], 20000)); }
  catch (e) { if (e.naoRodou) return null; throw e; }
}

// Lista as impressoras do Windows. 1º o ajudante (EnumPrinters, direto no spooler);
// se ele não puder rodar, PowerShell em três tentativas: Get-Printer (falha inteiro
// quando UMA impressora tem driver com problema), WMI e, por último, o registro.
const PS_LISTAR = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$l = $null
try { $l = Get-Printer | ForEach-Object { [pscustomobject]@{ nome = $_.Name; porta = $_.PortName; driver = $_.DriverName } } } catch {}
if (-not $l) { try { $l = Get-CimInstance Win32_Printer | ForEach-Object { [pscustomobject]@{ nome = $_.Name; porta = $_.PortName; driver = $_.DriverName } } } catch {} }
if (-not $l) { $l = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Printers' | ForEach-Object { $p = Get-ItemProperty $_.PSPath; [pscustomobject]@{ nome = $_.PSChildName; porta = $p.Port; driver = $p.'Printer Driver' } } }
ConvertTo-Json -Compress -InputObject @($l)`;

export async function impressorasWindows() {
  if (process.platform !== "win32") return [];
  let lista = null;
  if (temAjudante()) {
    try { lista = JSON.parse(await ajudante(["listar"], 15000)); }
    catch (e) { if (!e.naoRodou) console.error("[impressoras] ajudante:", e.message); }
  }
  if (!lista) {
    const out = await powershell(["-Command", PS_LISTAR], 45000);
    const d = out ? JSON.parse(out) : [];
    lista = (Array.isArray(d) ? d : [d]).filter(Boolean);
  }
  return lista.filter((p) => p && p.nome).map((p) => ({ nome: p.nome, driver: p.driver || "", porta: p.porta || "" }));
}
