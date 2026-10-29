// Ponte segura entre a tela e o processo principal.
const { contextBridge, ipcRenderer } = require("electron");
const chamar = async (canal, ...args) => {
  const r = await ipcRenderer.invoke(canal, ...args);
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
};
contextBridge.exposeInMainWorld("aliber", {
  info: () => chamar("app:info"),
  config: () => chamar("config:ler"),
  salvarConfig: (c) => chamar("config:salvar", c),
  produtosLocais: () => chamar("produtos:locais"),
  produtosPdv: () => chamar("produtos:pdv"),
  salvarManual: (p) => chamar("produto:salvarManual", p),
  excluirManual: (id) => chamar("produto:excluirManual", id),
  ajuste: (id, a) => chamar("produto:ajuste", id, a),
  impressoras: () => chamar("impressoras"),
  escolherPasta: (atual) => chamar("pasta:escolher", atual),
  abrirPastaDados: () => chamar("pasta:abrirDados"),
  imprimir: (dadosImpressao) => chamar("imprimir", dadosImpressao),
});
