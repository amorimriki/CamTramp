// Formulário para adicionar/editar uma câmara: nome, URL RTSP, testar e
// guardar. O buffer não é configurável aqui — é fixo para todas as
// câmaras (ver BUFFER_SECONDS em backend/config/settings.py).

import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Camera, CameraInput, DiscoveredDevice, TestConnectionResult } from '../types'

interface Props {
  initial?: Camera
  onSaved: () => void
  onCancel?: () => void
}

export function CameraForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [rtspUrl, setRtspUrl] = useState(initial?.rtsp_url ?? '')
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Descoberta automática de câmaras na rede local (nmap, ver
  // backend/services/discovery.py) — apaga a lista anterior a cada nova
  // pesquisa; escolher um dispositivo só preenche o URL, o utilizador
  // deve confirmar com "Testar".
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  const handleScan = async () => {
    setScanning(true)
    setScanError(null)
    try {
      const result = await api.discoverDevices()
      setDevices(result.devices)
      setScanned(true)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Falha ao procurar câmaras na rede')
    } finally {
      setScanning(false)
    }
  }

  const handlePickDevice = (device: DiscoveredDevice) => {
    setRtspUrl(device.suggested_url)
    setTestResult(null)
  }

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
    const payload: CameraInput = { name, rtsp_url: rtspUrl }
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

      <div className="camera-form__discovery">
        <button type="button" onClick={handleScan} disabled={scanning}>
          {scanning ? 'A procurar na rede...' : 'Procurar câmaras na rede'}
        </button>
        {scanError && <div className="camera-form__error">{scanError}</div>}
        {scanned && !scanError && devices.length === 0 && (
          <p className="camera-form__discovery-empty">
            Nenhum dispositivo com a porta RTSP aberta foi encontrado na rede local.
          </p>
        )}
        {devices.length > 0 && (
          <ul className="camera-form__discovery-list">
            {devices.map((device) => (
              <li key={device.ip}>
                <button type="button" onClick={() => handlePickDevice(device)}>
                  {device.ip}:{device.port}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
