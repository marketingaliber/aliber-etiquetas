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

## Impressoras (config)
- `impressoras: [{ id, nome, tipo windows|rede, nomeWindows, ip, porta, bobina 80|58, corte,
  espacoMm, modoImagem padrao|compativel }]` + `impressoraAtual`. A 1.0.0 tinha uma só
  (impressora/bobina/corte soltos); `core/dados.js > migrar` converte sem perder nada.
- Modo de imagem "compativel" = ESC * 33 em faixas de 24 pontos (58 mm simples).

## Ícone
`build/icone.svg` (A vermelho traçado do logo + etiqueta azul, fundo branco) ->
`build/icon.ico` (16 a 256), `build/icon.png`, `app/assets/icon.png`.

## Versões e atualização (igual ao Aliber Print)
- Código E instaladores ficam neste repositório público `marketingaliber/aliber-etiquetas`.
- NÃO há aviso nem verificação automática. O técnico troca em Configurações > Sobre >
  Escolher versão (senha do técnico: mesmo hash do Aliber Print em `core/marca.json`).
  Lista vem das releases; instalar aponta o electron-updater (generic) para a release.
- Publicar uma versão:
  1. Aumentar `version` no package.json; notas em `ferramentas/NOTAS-X.Y.Z.md`.
  2. Commit e push na main.
  3. `WINEDEBUG=-all npx electron-builder --win nsis --x64 --publish never` (precisa de wine).
  4. Esta sessão NÃO cria releases: enviar para o ramo `versao-X.Y.Z` (órfão, só os anexos)
     `AliberEtiquetas-Instalador.exe`, `.blockmap`, `latest.yml` e `NOTAS.md`. O dono clica em
     Actions > Publicar versão > Run workflow (informa X.Y.Z); o workflow cria a release e
     apaga o ramo.
- O `latest.yml` precisa ser o gerado pelo build da mesma versão (tem o hash do instalador).
