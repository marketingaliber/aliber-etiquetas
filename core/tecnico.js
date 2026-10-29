// Área do técnico: senha da Aliber para trocar a versão do Aliber Etiquetas.
// A senha não fica no código, só o "hash" dela (core/marca.json > senhaTecnico).
// Quem acerta a senha recebe uma chave que vale 30 minutos.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MARCA = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "marca.json"), "utf8"));
const VALIDADE_MS = 30 * 60 * 1000;
const chaves = new Map();        // chave -> validade
let erros = 0, bloqueadoAte = 0;

export function entrar(senha) {
  if (Date.now() < bloqueadoAte) throw new Error("Muitas tentativas erradas. Aguarde um minuto e tente de novo.");
  const cfg = MARCA.senhaTecnico;
  if (!cfg) throw new Error("A senha do técnico não foi configurada nesta versão.");
  const calc = crypto.pbkdf2Sync(String(senha || ""), cfg.sal, cfg.iteracoes, 32, "sha256");
  const certo = crypto.timingSafeEqual(calc, Buffer.from(cfg.hash, "hex"));
  if (!certo) {
    if (++erros >= 5) { bloqueadoAte = Date.now() + 60000; erros = 0; }
    throw new Error("Senha incorreta.");
  }
  erros = 0;
  const chave = crypto.randomBytes(24).toString("hex");
  chaves.set(chave, Date.now() + VALIDADE_MS);
  return chave;
}

export function conferir(chave) {
  const ate = chaves.get(String(chave || ""));
  if (!ate || ate < Date.now()) { chaves.delete(chave); throw new Error("Entre de novo com a senha do técnico."); }
}
