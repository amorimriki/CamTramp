// Renderiza um código QR como SVG inline, a partir do encoder local em
// lib/qrcode.ts. Sem dependências externas nem pedidos de rede.

import { useMemo } from 'react'
import { buildQrMatrix } from '../lib/qrcode'

interface Props {
  value: string
  size?: number
}

// Margem de zona silenciosa à volta do código (em nº de módulos), conforme
// recomendado pela especificação QR — necessária para os leitores
// conseguirem localizar o código de forma fiável.
const QUIET_ZONE = 4

export function QrCode({ value, size = 128 }: Props) {
  const matrix = useMemo(() => buildQrMatrix(value, 'M'), [value])
  const dim = matrix.size + QUIET_ZONE * 2

  const path = useMemo(() => {
    let d = ''
    for (let row = 0; row < matrix.size; row++) {
      for (let col = 0; col < matrix.size; col++) {
        if (matrix.isDark(row, col)) {
          const x = col + QUIET_ZONE
          const y = row + QUIET_ZONE
          d += `M${x},${y}h1v1h-1z`
        }
      }
    }
    return d
  }, [matrix])

  return (
    <svg
      className="qr-code"
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      role="img"
      aria-label={`Código QR para ${value}`}
    >
      <rect width={dim} height={dim} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
