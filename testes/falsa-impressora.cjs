// Finge ser uma impressora de rede (porta 9199) e guarda o que chegar.
const net = require("net"); const fs = require("fs");
let n = 0;
net.createServer((s) => { const b = []; s.on("data", (d) => b.push(d)); s.on("end", () => { fs.writeFileSync(process.argv[2] + "/recebido" + (n++) + ".bin", Buffer.concat(b)); }); }).listen(9199, "127.0.0.1");
setTimeout(() => process.exit(0), 90000);
