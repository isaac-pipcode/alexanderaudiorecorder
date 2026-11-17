# Avisos de terceiros — Alexander Audio Tools

Este programa distribui ou baixa os componentes abaixo. Eles rodam como
processos separados; o Alexander Audio Tools apenas os executa.

## FFmpeg (incluído no instalador)

- Projeto: https://ffmpeg.org — binário estático fornecido pelo pacote
  `ffmpeg-static` (https://github.com/eugeneware/ffmpeg-static).
- Licença: **GNU General Public License v3** (o build inclui bibliotecas GPL,
  como x264 e x265). O texto completo da licença e as informações do build
  (versão e bibliotecas) acompanham este aviso em `licenses/ffmpeg/`.
- **Código-fonte correspondente:** cada Release do Alexander Audio Tools anexa o
  arquivo `ffmpeg-source-<versão>.tar.xz` com o código-fonte do FFmpeg na versão
  distribuída. Fontes também em https://ffmpeg.org/releases/.
- **Oferta escrita (GPLv3 §6):** por pelo menos três anos a partir da última
  distribuição de cada versão, qualquer pessoa pode solicitar uma cópia completa
  do código-fonte correspondente (FFmpeg e bibliotecas incluídas no binário),
  sem custo além do de envio, abrindo uma issue no repositório de onde baixou o
  programa.

## yt-dlp (baixado no primeiro uso, não incluído no instalador)

- Projeto: https://github.com/yt-dlp/yt-dlp — licença Unlicense (domínio
  público). O executável oficial inclui componentes com licenças próprias,
  listadas no repositório do yt-dlp.

## Electron / Chromium / Node.js (incluídos no instalador)

- Licença MIT (Electron) e licenças dos componentes do Chromium, listadas no
  arquivo `LICENSES.chromium.html` que acompanha a instalação.
