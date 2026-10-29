// Lista as versões publicadas do Aliber Etiquetas (releases do repositório público
// marketingaliber/aliber-etiquetas). Só entram as que têm o instalador e o
// latest.yml, que é o que a instalação usa.
export const REPO_VERSOES = "marketingaliber/aliber-etiquetas";
export const urlDaVersao = (v) => `https://github.com/${REPO_VERSOES}/releases/download/v${v}`;

const comparar = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
export { comparar as compararVersoes };

let cache = null, cacheEm = 0;

// buscar: fetch do Electron (usa o proxy do Windows); fora dele, o fetch do Node
export async function listarVersoes(atual, buscar = fetch) {
  if (!cache || Date.now() - cacheEm > 60000) {
    let r;
    try {
      r = await buscar(`https://api.github.com/repos/${REPO_VERSOES}/releases?per_page=50`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "AliberEtiquetas" },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new Error("Sem acesso à internet para buscar as versões. Confira a conexão deste computador.");
    }
    if (r.status === 403 || r.status === 429) throw new Error("O GitHub limitou as consultas deste computador por alguns minutos. Tente de novo daqui a pouco.");
    if (!r.ok) throw new Error(`O GitHub respondeu com erro ${r.status}.`);
    cache = await r.json();
    cacheEm = Date.now();
  }
  return cache
    .filter((x) => !x.draft && /^v?\d+\.\d+\.\d+$/.test(x.tag_name))
    .filter((x) => x.assets.some((a) => a.name === "latest.yml") && x.assets.some((a) => a.name === "AliberEtiquetas-Instalador.exe"))
    .map((x) => {
      const versao = x.tag_name.replace(/^v/, "");
      return {
        versao,
        data: x.published_at,
        titulo: x.name || `Aliber Etiquetas ${versao}`,
        notas: String(x.body || "").slice(0, 4000),
        instalada: versao === atual,
        maisAntiga: comparar(versao, atual) < 0,
        tamanhoMB: Math.round((x.assets.find((a) => a.name === "AliberEtiquetas-Instalador.exe")?.size || 0) / 1048576),
      };
    })
    .sort((a, b) => comparar(b.versao, a.versao));
}
