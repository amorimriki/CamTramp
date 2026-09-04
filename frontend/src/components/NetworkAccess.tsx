// Mostra o IP local da máquina e um código QR com o URL da app, para
// facilitar abrir o dashboard noutro dispositivo (telemóvel, tablet) na
// mesma rede local — sem precisar de escrever o IP à mão.

import { useEffect, useState } from 'react'
import { api } from '../api'
import { QrCode } from './QrCode'

export function NetworkAccess() {
  const [ip, setIp] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .networkInfo()
      .then((info) => {
        if (!cancelled) setIp(info.ip)
      })
      .catch(() => {
        // não crítico: se falhar, simplesmente não mostra o widget
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!ip) return null

  const port = window.location.port ? `:${window.location.port}` : ''
  const url = `${window.location.protocol}//${ip}${port}`

  return (
    <div className="network-access">
      <QrCode value={url} size={64} />
      <div className="network-access__info">
        <div className="network-access__label">Aceder noutro dispositivo</div>
        <div className="network-access__url">{url}</div>
      </div>
    </div>
  )
}
