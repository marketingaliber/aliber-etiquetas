// Leitura dos produtos do PDV+ (Aliber Sistema). SOMENTE LEITURA.
//
// O banco do PDV+ está em uso enquanto o caixa trabalha. Para nunca atrapalhar:
//  - copiamos o arquivo do banco (e o -wal, onde ficam as últimas alterações)
//    para uma pasta temporária e lemos a CÓPIA. O original nunca é aberto.
//  - se a cópia pegar uma gravação no meio, tentamos de novo.
// As colunas são descobertas na hora (PRAGMA), assim pequenas mudanças de
// versão do PDV+ não quebram o app.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const caminhoBanco = (pasta) => path.join(pasta, ".dart_tool", "sqflite_common_ffi", "databases", "navi_db.db");

let sqlite = null;
async function abrir(arquivo) {
  if (!sqlite) {
    const avisar = process.emitWarning;
    process.emitWarning = () => {};                       // esconde o aviso "experimental"
    try { sqlite = await import("node:sqlite"); } finally { process.emitWarning = avisar; }
  }
  return new sqlite.DatabaseSync(arquivo);
}

function copiar(origem) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aliber-etiquetas-"));
  const destino = path.join(dir, "navi_db.db");
  fs.copyFileSync(origem, destino);
  for (const suf of ["-wal"]) if (fs.existsSync(origem + suf)) fs.copyFileSync(origem + suf, destino + suf);
  return { dir, destino };
}

const colunas = (db, tabela) => db.prepare(`PRAGMA table_info("${tabela.replace(/"/g, "")}")`).all().map((c) => ({ nome: c.name, tipo: String(c.type || "").toUpperCase(), pk: c.pk }));
const tabelas = (db) => db.prepare("select name from sqlite_master where type='table'").all().map((t) => t.name);
const q = (n) => `"${n.replace(/"/g, "")}"`;

// Descobre como ler a unidade do produto: coluna de texto na própria tabela
// ou chave para uma tabela de unidades.
function planoUnidade(db, cols) {
  const nomes = cols.map((c) => c.nome.toLowerCase());
  const texto = ["unidade", "sigla_unidade", "unidade_medida", "unidade_comercial", "unidade_venda", "un", "unid", "sigla"]
    .find((n) => nomes.includes(n));
  if (texto) return { expr: `p.${q(cols[nomes.indexOf(texto)].nome)}`, join: "", fonte: texto };
  const fk = cols.find((c) => /^id_?unidade/i.test(c.nome));
  if (fk) {
    for (const t of tabelas(db).filter((t) => /unidade|medida/i.test(t))) {
      const tc = colunas(db, t);
      const chave = tc.find((c) => c.nome.toLowerCase() === fk.nome.toLowerCase()) || tc.find((c) => c.pk === 1);
      const rot = ["sigla", "abreviacao", "abreviatura", "unidade", "codigo", "descricao", "nome"]
        .map((n) => tc.find((c) => c.nome.toLowerCase() === n)).find(Boolean);
      if (chave && rot) return { expr: `u.${q(rot.nome)}`, join: `left join ${q(t)} u on u.${q(chave.nome)} = p.${q(fk.nome)}`, fonte: `${t}.${rot.nome}` };
    }
  }
  return { expr: "null", join: "", fonte: null };
}

// coluna que indica "vendido por peso / balança"
function planoPeso(cols) {
  const c = cols.find((c) => /balanca|pesavel|pesado|fracionad|vende_peso|por_peso|usa_balanca/i.test(c.nome));
  return c ? { expr: `p.${q(c.nome)}`, fonte: c.nome } : { expr: "null", fonte: null };
}

function montarConsulta(db) {
  if (!tabelas(db).includes("produto")) throw new Error("Não achei a tabela de produtos no banco do PDV+.");
  const cols = colunas(db, "produto");
  const tem = (n) => cols.some((c) => c.nome.toLowerCase() === n);
  if (!tem("descricao") || !tem("preco_venda")) throw new Error("O banco do PDV+ não tem as colunas esperadas (descricao, preco_venda).");
  const un = planoUnidade(db, cols);
  const peso = planoPeso(cols);
  const filtros = [];
  if (tem("data_hora_deletado")) filtros.push("p.data_hora_deletado is null");
  if (tem("ativo")) filtros.push("coalesce(p.ativo, 1) <> 0");
  if (tem("inativo")) filtros.push("coalesce(p.inativo, 0) = 0");
  const sql = `select ${tem("id_produto") ? "p.id_produto" : "p.rowid"} as id,
      ${tem("codigo_produto") ? "p.codigo_produto" : "null"} as codigo,
      p.descricao as nome, p.preco_venda as preco,
      ${un.expr} as unidade, ${peso.expr} as peso
    from produto p ${un.join}
    ${filtros.length ? "where " + filtros.join(" and ") : ""}
    order by p.descricao collate nocase`;
  return { sql, info: { unidade: un.fonte, peso: peso.fonte, colunas: cols.map((c) => c.nome) } };
}

export async function lerProdutos(pasta) {
  const origem = caminhoBanco(pasta);
  if (!fs.existsSync(origem)) {
    const e = new Error(`Não encontrei o banco do PDV+ em ${origem}. Confira a pasta do PDV+ em Configurações.`);
    e.semBanco = true;
    throw e;
  }
  let ultimoErro = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let copia = null, db = null;
    try {
      copia = copiar(origem);
      db = await abrir(copia.destino);
      const { sql, info } = montarConsulta(db);
      const linhas = db.prepare(sql).all().map((r) => ({
        id: "pdv:" + String(r.id),
        codigo: r.codigo == null ? "" : String(r.codigo),
        nome: String(r.nome ?? "").trim(),
        preco: Number(r.preco) || 0,
        unidadeBruta: r.unidade == null ? "" : String(r.unidade),
        peso: r.peso == null ? null : !!Number(r.peso),
      })).filter((r) => r.nome);
      const quando = fs.statSync(origem).mtime.toISOString();
      return { produtos: linhas, info, atualizadoEm: new Date().toISOString(), bancoAlteradoEm: quando };
    } catch (e) {
      ultimoErro = e;
      if (/semBanco|colunas esperadas|tabela de produtos/.test(e.message)) break;
      await new Promise((r) => setTimeout(r, 400));
    } finally {
      try { db?.close(); } catch {}
      if (copia) fs.rm(copia.dir, { recursive: true, force: true }, () => {});
    }
  }
  throw new Error("Não consegui ler o banco do PDV+: " + (ultimoErro?.message || "erro desconhecido"));
}
