// Página de gravações (README secção "Gravação automática"): lista os
// ficheiros .mp4 gravados automaticamente para cada câmara — os últimos
// 20 minutos de cada stream, divididos em 4 ficheiros de 5 minutos (ver
// backend/services/recording_manager.py e backend/api/recordings.py).
// Não existe botão "Guardar" manual: a gravação é sempre automática e
// contínua enquanto o stream está ligado, com rotação dos ficheiros mais
// antigos.
//
// As gravações são agrupadas por câmara (uma lista/tabela por câmara,
// identificada pelo nome dado no formulário — ex.: "Trampolim 1"), em vez
// de uma tabela única com todas misturadas: cada trampolim tem os seus
// próprios ficheiros e não interessa vê-los intercalados com os de outra
// câmara.

import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Camera, RecordingInfo } from '../types'

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
  // "Trampolim_20260909_143000.mp4" em vej de só "20260909_143000.mp4")
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

interface RecordingGroup {
  cameraId: number
  cameraName: string
  recordings: RecordingInfo[]
}

/**
 * Agrupa as gravações por câmara, uma lista por câmara. Inclui também as
 * câmaras sem gravações (ex.: acabadas de criar, ou ainda desligadas) para
 * ficar claro que não há aqui nenhum ficheiro em falta — só ainda não há
 * gravações. A ordem dentro de cada grupo mantém-se (API já devolve mais
 * recentes primeiro); os grupos em si aparecem pela ordem das câmaras.
 */
function groupByCamera(cameras: Camera[], recordings: RecordingInfo[]): RecordingGroup[] {
  const byId = new Map<number, RecordingGroup>()

  for (const camera of cameras) {
    byId.set(camera.id, { cameraId: camera.id, cameraName: camera.name, recordings: [] })
  }
  for (const recording of recordings) {
    let group = byId.get(recording.camera_id)
    if (!group) {
      // gravação de uma câmara entretanto apagada: mostra-se à mesma, com
      // o nome que veio guardado na própria gravação
      group = { cameraId: recording.camera_id, cameraName: recording.camera_name, recordings: [] }
      byId.set(recording.camera_id, group)
    }
    group.recordings.push(recording)
  }

  return Array.from(byId.values())
}

export function Recordings() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [recordings, setRecordings] = useState<RecordingInfo[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = async () => {
    try {
      const [camerasResult, recordingsResult] = await Promise.all([
        api.listCameras(),
        api.listRecordings(),
      ])
      setCameras(camerasResult)
      setRecordings(recordingsResult)
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar gravações')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const groups = groupByCamera(cameras, recordings)

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
        mais recentes. As gravações de cada câmara aparecem na sua própria lista, identificada
        pelo nome dado à câmara (ex.: "Trampolim 1").
      </p>

      {loadError && <div className="recordings__error">{loadError}</div>}

      {groups.length === 0 && !loadError && (
        <p className="recordings__empty-overall">Ainda não há câmaras configuradas.</p>
      )}

      {groups.map((group) => (
        <section key={group.cameraId} className="recordings__group">
          <h3 className="recordings__group-title">{group.cameraName}</h3>

          <div className="table-scroll">
            <table className="recordings__table">
              <thead>
                <tr>
                  <th scope="col">Início</th>
                  <th scope="col">Tamanho</th>
                  <th scope="col">
                    <span className="visually-hidden">Ficheiro</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {group.recordings.map((recording) => (
                  <tr key={`${recording.camera_id}-${recording.filename}`}>
                    <td>{formatTimestamp(recording.started_at)}</td>
                    <td className="recordings__size">{formatSize(recording.size_bytes)}</td>
                    <td className="recordings__row-actions">
                      <a href={recording.url} download={downloadName(recording)}>
                        Transferir
                      </a>
                    </td>
                  </tr>
                ))}
                {group.recordings.length === 0 && (
                  <tr>
                    <td colSpan={3} className="recordings__empty">
                      Ainda não há gravações desta câmara.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}
