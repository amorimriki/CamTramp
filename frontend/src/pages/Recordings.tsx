// Página de gravações (README secção "Gravação automática"): lista os
// ficheiros .mp4 gravados automaticamente para cada câmara — os últimos
// 20 minutos de cada stream, divididos em 4 ficheiros de 5 minutos (ver
// backend/services/recording_manager.py e backend/api/recordings.py).
// Não existe botão "Guardar" manual: a gravação é sempre automática e
// contínua enquanto o stream está ligado, com rotação dos ficheiros mais
// antigos.

import { useEffect, useState } from 'react'
import { api } from '../api'
import type { RecordingInfo } from '../types'

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function downloadName(recording: RecordingInfo): string {
  // nome mais descritivo do que o timestamp em bruto do ficheiro (ex.:
  // "Trampolim_20260909_143000.mp4" em vez de só "20260909_143000.mp4")
  const safeCameraName = recording.camera_name.replace(/[^\p{L}\p{N}]+/gu, '_')
  return `${safeCameraName}_${recording.filename}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}

export function Recordings() {
  const [recordings, setRecordings] = useState<RecordingInfo[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = async () => {
    try {
      setRecordings(await api.listRecordings())
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar gravações')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  return (
    <div className="recordings">
      <div className="recordings__header">
        <h2>Gravações</h2>
        <button type="button" onClick={reload}>
          Atualizar
        </button>
      </div>

      <p className="recordings__hint">
        Cada câmara em funcionamento grava automaticamente os últimos 20 minutos, divididos em 4
        ficheiros de 5 minutos. Os ficheiros mais antigos são substituídos automaticamente pelos
        mais recentes.
      </p>

      {loadError && <div className="recordings__error">{loadError}</div>}

      <table className="recordings__table">
        <thead>
          <tr>
            <th scope="col">Câmara</th>
            <th scope="col">Início</th>
            <th scope="col">Tamanho</th>
            <th scope="col">
              <span className="visually-hidden">Ficheiro</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {recordings.map((recording) => (
            <tr key={`${recording.camera_id}-${recording.filename}`}>
              <td>{recording.camera_name}</td>
              <td>{formatTimestamp(recording.started_at)}</td>
              <td className="recordings__size">{formatSize(recording.size_bytes)}</td>
              <td className="recordings__row-actions">
                <a href={recording.url} download={downloadName(recording)}>
                  Transferir
                </a>
              </td>
            </tr>
          ))}
          {recordings.length === 0 && (
            <tr>
              <td colSpan={4} className="recordings__empty">
                Ainda não há gravações disponíveis.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
