// Formulário para adicionar/editar uma câmara: nome, URL RTSP, testar e
// guardar. O buffer não é configurável aqui — é fixo para todas as
// câmaras (ver BUFFER_SECONDS em backend/config/settings.py).
//
// O formato do URL RTSP varia de marca para marca (algumas não pedem
// autenticação, outras exigem utilizador/password no próprio URL) — por
// isso há um seletor de "Marca" que, ao ser escolhido, mostra só os
// campos necessários (IP, porta, e utilizador/password quando aplicável)
// e constrói o URL final automaticamente. A marca em si não é guardada —
// só serve para ajudar a montar o rtsp_url, que é o único dado persistido
// (ver backend/models/camera.py). A opção "Genérica" mantém o
// comportamento antigo: indicar o URL RTSP completo à mão, para qualquer
// câmara que não esteja na lista.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import type { Camera, CameraInput, DiscoveredDevice, TestConnectionResult } from '../types'

interface Props {
  initial?: Camera
  onSaved: () => void
  onCancel?: () => void
}

interface BrandParams {
  ip: string
  port: string
  username: string
  password: string
}

interface BrandDef {
  id: string
  label: string
  needsAuth: boolean
  defaultPort: string
  /** Exemplo mostrado junto ao seletor, para o utilizador confirmar que escolheu bem. */
  example: string
  /**
   * Quando definido, o campo "Utilizador" não é mostrado — esta marca usa
   * sempre este valor (ex.: as câmaras Jooan vêm de fábrica com o
   * utilizador "admin" e não costuma haver necessidade de o mudar).
   */
  fixedUsername?: string
  /** Sugestão mostrada no campo Password (nunca uma password real). */
  passwordPlaceholder?: string
  /** Aviso mostrado junto aos campos de autenticação desta marca. */
  warning?: string
  buildUrl: (params: BrandParams) => string
}

// Para adicionar uma marca nova: acrescentar aqui uma entrada com o
// formato de URL RTSP correto — não é preciso mexer em mais nenhum sítio
// do formulário.
const BRANDS: BrandDef[] = [
  {
    id: 'teruhal',
    label: 'Teruhal',
    needsAuth: false,
    defaultPort: '554',
    example: 'rtsp://IPADDRESS:554',
    buildUrl: ({ ip, port }) => `rtsp://${ip}:${port}`,
  },
  {
    id: 'jooan',
    label: 'Jooan',
    needsAuth: true,
    defaultPort: '554',
    example: 'rtsp://USER:PASSWORD@IPADDRESS:554/live/ch00_1',
    fixedUsername: 'admin',
    passwordPlaceholder: 'Tr@mpolinsaae',
    warning:
      'Confirma nas definições da câmara Jooan que o RTSP está ativado e que a autenticação ' +
      '(proteção por utilizador/password) está ligada — caso contrário a ligação vai falhar.',
    // Símbolos especiais na password (ex.: "@") têm de ir codificados no URL
    // (%40, etc.) ou o URL fica mal formado — daqui vem o encodeURIComponent.
    buildUrl: ({ ip, port, username, password }) =>
      `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${ip}:${port}/live/ch00_1`,
  },
]

const GENERIC_BRAND_ID = 'generic'

export function CameraForm({ initial, onSaved, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')

  // Modo "Genérica": URL RTSP completo indicado à mão (comportamento
  // antigo, mantido tal e qual — inclui sempre o valor atual quando se
  // está a editar uma câmara existente, já que não sabemos a marca dela).
  const [rtspUrl, setRtspUrl] = useState(initial?.rtsp_url ?? '')

  // Modo por marca: campos separados que são combinados no rtsp_url final.
  const [brandId, setBrandId] = useState(GENERIC_BRAND_ID)
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('554')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Descoberta automática de câmaras na rede local (nmap, ver
  // backend/services/discovery.py) — apaga a lista anterior a cada nova
  // pesquisa; escolher um dispositivo só preenche o IP (ou o URL, em modo
  // genérico), o utilizador deve sempre confirmar com "Testar".
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  const selectedBrand = BRANDS.find((b) => b.id === brandId)

  // Algumas marcas (ex.: Jooan) usam sempre o mesmo utilizador, pelo que o
  // campo nem é mostrado — usa-se o valor fixo em vez do que está no estado.
  const effectiveUsername = selectedBrand?.fixedUsername ?? username

  // URL efetivamente usado para testar/guardar: construído a partir dos
  // campos da marca escolhida, ou o URL manual em modo "Genérica".
  const effectiveRtspUrl = selectedBrand
    ? selectedBrand.buildUrl({
        ip: ip.trim(),
        port: port.trim() || selectedBrand.defaultPort,
        username: effectiveUsername,
        password,
      })
    : rtspUrl

  // com uma marca escolhida, só faz sentido testar/guardar depois de o IP
  // (e, se a marca precisar, o utilizador/password) estarem preenchidos —
  // evita testar contra um URL obviamente incompleto tipo "rtsp://:554".
  const brandFieldsIncomplete = selectedBrand
    ? !ip.trim() || (selectedBrand.needsAuth && (!effectiveUsername.trim() || !password))
    : false

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
    if (selectedBrand) {
      setIp(device.ip)
      setPort(String(device.port))
    } else {
      setRtspUrl(device.suggested_url)
    }
    setTestResult(null)
  }

  const handleBrandChange = (nextBrandId: string) => {
    setBrandId(nextBrandId)
    setTestResult(null)
    const brand = BRANDS.find((b) => b.id === nextBrandId)
    if (brand) setPort((current) => current || brand.defaultPort)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.testConnection(effectiveRtspUrl))
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
    const payload: CameraInput = { name, rtsp_url: effectiveRtspUrl }
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

      <label>
        Marca da câmara
        <select value={brandId} onChange={(e) => handleBrandChange(e.target.value)}>
          <option value={GENERIC_BRAND_ID}>Outra / indicar o URL RTSP manualmente</option>
          {BRANDS.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.label}
            </option>
          ))}
        </select>
      </label>

      {selectedBrand ? (
        <div className="camera-form__brand-fields">
          <p className="camera-form__brand-example">
            Formato {selectedBrand.label}: <code>{selectedBrand.example}</code>
          </p>

          <label>
            Endereço IP
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              required
              placeholder="192.168.1.230"
            />
          </label>

          <label>
            Porta
            <input value={port} onChange={(e) => setPort(e.target.value)} required placeholder="554" />
          </label>

          {selectedBrand.needsAuth && (
            <>
              {selectedBrand.fixedUsername ? (
                <p className="camera-form__fixed-username">
                  Utilizador: <code>{selectedBrand.fixedUsername}</code> (fixo para esta marca)
                </p>
              ) : (
                <label>
                  Utilizador
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="admin"
                  />
                </label>
              )}
              <label>
                Password
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type="password"
                  autoComplete="off"
                  placeholder={selectedBrand.passwordPlaceholder}
                />
              </label>
              {selectedBrand.warning && (
                <p className="camera-form__warning">{selectedBrand.warning}</p>
              )}
            </>
          )}

          {ip.trim() && (
            <p className="camera-form__url-preview">
              URL gerado: <code>{effectiveRtspUrl}</code>
            </p>
          )}
        </div>
      ) : (
        <label>
          URL RTSP
          <input
            value={rtspUrl}
            onChange={(e) => setRtspUrl(e.target.value)}
            required
            placeholder="rtsp://192.168.1.230:554/0"
          />
        </label>
      )}

      <label>
        Nome
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Trampolim 1"
        />
      </label>

      {testResult && (
        <div className={`camera-form__test-result ${testResult.ok ? 'is-ok' : 'is-error'}`}>
          {testResult.message}
        </div>
      )}
      {error && <div className="camera-form__error">{error}</div>}

      <div className="camera-form__actions">
        <button type="button" onClick={handleTest} disabled={testing || !effectiveRtspUrl || brandFieldsIncomplete}>
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
