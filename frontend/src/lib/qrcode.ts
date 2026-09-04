// Encoder de códigos QR local, sem chamadas de rede (ver
// frontend/src/vendor/qrcode-core/ — adaptação em ES modules do codificador
// "core" do pacote npm "qrcode", sem dependências). Usado para mostrar o URL
// da app como QR code (ver NetworkAccess.tsx) para quem quiser abrir a app
// a partir de outro dispositivo na mesma rede local, sem precisar de
// internet nem de um serviço externo de geração de QR codes.

import { create } from '../vendor/qrcode-core/qrcode.js'
import * as Mode from '../vendor/qrcode-core/mode.js'

export interface QrMatrix {
  size: number
  isDark: (row: number, col: number) => boolean
}

export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

/**
 * Constrói a matriz de módulos de um código QR para o texto dado.
 *
 * O modo é sempre forçado para BYTE explicitamente (em vez de deixar o
 * codificador escolher/otimizar automaticamente) porque isso evita a
 * segmentação ótima do pacote original, que dependia do pacote npm
 * "dijkstrajs" — ver frontend/src/vendor/qrcode-core/segments.js.
 * Para os URLs que aqui codificamos (http://<ip>:<porta>) o modo BYTE é
 * sempre o correto de qualquer forma.
 */
export function buildQrMatrix(text: string, errorCorrectionLevel: QrErrorCorrectionLevel = 'M'): QrMatrix {
  const qr = create([{ data: text, mode: Mode.BYTE }], { errorCorrectionLevel })
  return {
    size: qr.modules.size,
    isDark: (row: number, col: number) => Boolean(qr.modules.get(row, col)),
  }
}
