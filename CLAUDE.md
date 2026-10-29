# Aliber Etiquetas

Etiquetas de gôndola (placas de preço) da Aliber Informática / Sistemas, para
clientes do PDV+ ("Aliber Sistema"). Primeiro cliente modelo: hortifruti com
preço por kg nas bancadas. Electron + Node puro; tela em `panel/` é HTML/CSS/JS
sem build. O dono do projeto não programa: explique em português simples, com
passo a passo, e entregue sempre o resultado pronto.

## Impressoras
- Elgin i8 / i9 são térmicas de BOBINA 80 mm com guilhotina (não de etiqueta
  adesiva). Cada etiqueta é uma imagem (ESC/POS GS v 0, 576 pontos = 72 mm) e é
  cortada logo depois (GS V 65/66). Bobina 58 mm = 384 pontos.
- Envio RAW pelo spooler do Windows com o mesmo ajudante do Aliber Print
  (`core/bin/aliberprint-ajudante.exe`, fonte no repositório aliber-print) ou
  rede TCP 9100. PowerShell só de reserva.

## Onde fica cada coisa
- `panel/etiqueta.js` desenho das etiquetas (canvas, preto e branco, tamanho real)
- `panel/app.js` tela; `panel/fontes/` Barlow / Barlow Condensed embutidas
- `core/pdv.js` leitura do PDV+: copia navi_db.db (+ -wal) para a pasta temporária
  e lê a cópia com node:sqlite (Electron 39). NUNCA abre nem grava no original.
  Colunas descobertas por PRAGMA (unidade: coluna de texto ou tabela de unidades).
- `core/dados.js` config e produtos em %APPDATA%\Aliber Etiquetas (nunca apagar)
- `core/escpos.js` imagens -> ESC/POS; `core/impressao.js` envio (igual Aliber Print)

## Testar (Linux)
- `node testes/foto.cjs <caminho>/testes/previa.html` desenha todos os modelos (Playwright)
- `testes/electron.cjs` abre o app real com xvfb, banco PDV+ falso e impressora de rede falsa
  (`testes/falsa-impressora.cjs`) e confere os bytes recebidos.

## Gerar instalador
`WINEDEBUG=-all npx electron-builder --win nsis --x64 --publish never` (precisa de wine).
Sai em `instalador/AliberEtiquetas-Instalador-X.Y.Z.exe`.
