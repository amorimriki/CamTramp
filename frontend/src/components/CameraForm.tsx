// Formulário para adicionar/editar uma câmara (README secção 8 —
// "CONFIGURAÇÃO DAS CÂMARAS"): nome, URL RTSP, buffer, testar e guardar.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Camera, CameraInput, TestConnectionResult } from '../types'

interface Props {
  initial?: Camera
  onSaved: () => void
  onCancel?: () => void
}

const DEFAULT_BUFFER_SECONDS = 30

export function CameraForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [rtspUrl, setRtspUrl] = useState(initial?.rtsp_url ?? '')
  const [bufferSeconds, setBufferSeconds] = useState(initial?.buffer_seconds ?? DEFAULT_BUFFER_SECONDS)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.testConnection(rtspUrl))
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : 'Falha ao testar' })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload: CameraInput = { name, rtsp_url: rtspUrl, buffer_seconds: bufferSeconds }
    try {
      if (initial) {
        await api.updateCamera(initial.id, payload)
      } else {
        await api.createCamera(payload)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao guardar a câmara')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="camera-form" onSubmit={handleSubmit}>
      <label>
        Nome
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Trampolim 1"
        />
      </label>

      <label>
        URL RTSP
        <input
          value={rtspUrl}
          onChange={(e) => setRtspUrl(e.target.value)}
          required
          placeholder="rtsp://192.168.1.230:554/0"
        />
      </label>

      <label>
        Buffer (segundos)
        <input
          type="number"
          min={10}
          max={120}
          value={bufferSeconds}
          onChange={(e) => setBufferSeconds(Number(e.target.value))}
        />
      </label>

      {testResult && (
        <div className={`camera-form__test-result ${testResult.ok ? 'is-ok' : 'is-error'}`}>
          {testResult.message}
        </div>
      )}
      {error && <div className="camera-form__error">{error}</div>}

      <div className="camera-form__actions">
        <button type="button" onClick={handleTest} disabled={testing || !rtspUrl}>
          {testing ? 'A testar...' : 'Testar'}
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'A guardar...' : 'Guardar'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
