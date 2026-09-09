Este diretório contém uma adaptação do codificador QR "core" (formato dos
módulos apenas para strings, sem dependências) do pacote npm "qrcode"
(https://github.com/soldair/node-qrcode), por sua vez baseado no
QRCode.js original de Kazuhiko Arase.

Adaptações feitas para este projeto:
- Sintaxe CommonJS (require/module.exports) convertida para módulos ES
  (import/export), mecanicamente, sem alterar a lógica.
- segments.js reduzido: mantém só fromArray()/buildSingleSegment() (usados
  quando o modo do segmento é indicado explicitamente pelo chamador); as
  funções fromString()/rawSplit() do original, que dependiam do pacote
  "dijkstrajs" para escolher automaticamente a segmentação ótima de uma
  string, foram removidas por não serem necessárias aqui — ver
  frontend/src/lib/qrcode.ts, que chama sempre com mode: Mode.BYTE
  explícito.

Licença original (MIT):

Copyright (c) 2008 David Shim
Copyright 2011 Ryan Day

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
