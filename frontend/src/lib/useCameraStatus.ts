// Hook que dá a uma CameraCard o estado (a correr + buffer) atualizado em
// tempo real de UMA câmara, a partir da ligação WebSocket partilhada em
// statusSocket.ts. Substitui o polling HTTP que existia antes.

import { useEffect, useState } from 'react'
import { subscribe, type CameraStatusEntry } from './statusSocket'

export function useCameraStatus(cameraId: number): CameraStatusEntry | undefined {
  const [entry, setEntry] = useState<CameraStatusEntry | undefined>(undefined)

  useEffect(() => {
    return subscribe((statuses) => {
      setEntry(statuses.get(cameraId))
    })
  }, [cameraId])

  return entry
}
