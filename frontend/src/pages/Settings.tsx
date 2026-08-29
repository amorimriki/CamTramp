// Página de configuração das câmaras (README secção 8): listar, adicionar,
// editar e remover câmaras.

import { useEffect, useState } from 'react'
import { api } from '../api'
import { CameraForm } from '../components/CameraForm'
import type { Camera } from '../types'

export function Settings() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [editing, setEditing] = useState<Camera | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = async () => {
    try {
      setCameras(await api.listCameras())
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar câmaras')
    }
  }

  useEffect(() => {
    reload()
  }, [])

  const handleSaved = () => {
    setShowForm(false)
    setEditing(null)
    reload()
  }

  const handleAddNew = () => {
    setEditing(null)
    setShowForm(true)
  }

  const handleEdit = (camera: Camera) => {
    setEditing(camera)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditing(null)
  }

  const handleDelete = async (camera: Camera) => {
    if (!window.confirm(`Remover a câmara "${camera.name}"?`)) return
    await api.deleteCamera(camera.id)
    reload()
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h2>Configuração das Câmaras</h2>
        <button type="button" onClick={handleAddNew}>
          + Nova câmara
        </button>
      </div>

      {loadError && <div className="settings__error">{loadError}</div>}

      <table className="settings__table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>URL RTSP</th>
            <th>Buffer</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {cameras.map((camera) => (
            <tr key={camera.id}>
              <td>{camera.name}</td>
              <td className="settings__url">{camera.rtsp_url}</td>
              <td>{camera.buffer_seconds}s</td>
              <td className="settings__row-actions">
                <button type="button" onClick={() => handleEdit(camera)}>
                  Editar
                </button>
                <button type="button" onClick={() => handleDelete(camera)}>
                  Remover
                </button>
              </td>
            </tr>
          ))}
          {cameras.length === 0 && (
            <tr>
              <td colSpan={4} className="settings__empty">
                Ainda não há câmaras configuradas.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <div className="settings__form-panel">
          <CameraForm initial={editing ?? undefined} onSaved={handleSaved} onCancel={handleCancel} />
        </div>
      )}
    </div>
  )
}
