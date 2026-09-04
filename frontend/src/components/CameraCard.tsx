// Cartão de uma câmara no Dashboard (README secção 7 — "VIDEO CONTROL
// CENTER"): vídeo ao vivo (via hls.js), estado do buffer, e controlos
// de ligar/parar o stream.

import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { api } from '../api'
import type { BufferSummary, Camera } from '../types'

interface Props {
  camera: Camera
}

// Quando o stream fica "running" (processo ffmpeg arrancado), o backend
// ainda não tem segmentos .ts nenhuns — precisa de alguns segundos para os
// gerar. Se o hls.js tentar carregar o playlist demasiado cedo, dá erro
// (manifest vazio ou 404). Por isso esperamos por um mínimo de segmentos
// antes de ligar o player, mostrando entretanto uma fase de carregamento.
const MIN_READY_SEGMENTS = 3 // ~6s de vídeo (SEGMENT_SECONDS=2 no backend)
const MAX_LOADING_MS = 60_000 // limite da fase de carregamento (1 min)

export function CameraCard({ camera }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [running, setRunning] = useState(false)
  const [buffer, setBuffer] = useState<BufferSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadingStartedAt, setLoadingStartedAt] = useState<number | null>(null)
  const [loadingElapsedMs, setLoadingElapsedMs] = useState(0)
  const [forceReady, setForceReady] = useState(false)

  const bufferReady = buffer !== null && buffer.available && buffer.segment_count >= MIN_READY_SEGMENTS
  const ready = bufferReady || forceReady

  // acompanha o estado do stream e do buffer periodicamente
  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const status = await api.streamStatus(camera.id)
        if (cancelled) return
        setRunning(status.running)

        if (status.running) {
          const summary = await api.bufferSummary(camera.id)
          if (!cancelled) setBuffer(summary)
        } else {
          setBuffer(null)
        }
      } catch {
        // falhas pontuais de polling não devem "piscar" a interface
      }
    }

    poll()
    const interval = setInterval(poll, 1500)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [camera.id])

  // marca o início da fase de carregamento assim que o stream fica "running"
  useEffect(() => {
    if (!running) {
      setLoadingStartedAt(null)
      setLoadingElapsedMs(0)
      setForceReady(false)
      return
    }
    setLoadingStartedAt((prev) => prev ?? Date.now())
  }, [running])

  // conta o tempo decorrido da fase de carregamento e, se o backend demorar
  // demasiado a ter segmentos suficientes, força a tentativa de arranque do
  // player ao fim de MAX_LOADING_MS (em vej de ficar bloqueado para sempre)
  useEffect(() => {
    if (loadingStartedAt === null || bufferReady) return

    const tick = () => {
      const elapsed = Date.now() - loadingStartedAt
      setLoadingElapsedMs(elapsed)
      if (elapsed >= MAX_LOADING_MS) setForceReady(true)
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [loadingStartedAt, bufferReady])

  // liga/desliga o hls.js ao elemento <video> — só depois do buffer inicial
  // estar pronto (ou do limite da fase de carregamento ser atingido)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!running || !ready) {
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.removeAttribute('src')
      return
    }

    const src = `/streams/${camera.id}/stream.m3u8`

    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3 })
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setError('Erro no stream de vídeo')
      })
      hlsRef.current = hls
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari tem suporte nativo a HLS, sem precisar de hls.js
      video.src = src
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [running, ready, camera.id])

  const toggleStream = async () => {
    setBusy(true)
    setError(null)
    try {
      if (running) {
        await api.stopStream(camera.id)
        setRunning(false)
      } else {
        await api.startStream(camera.id)
        setRunning(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ligar/desligar o stream')
    } finally {
      setBusy(false)
    }
  }

  const loadingProgressPct = Math.min(100, (loadingElapsedMs / MAX_LOADING_MS) * 100)
  const loadingSeconds = Math.floor(loadingElapsedMs / 1000)

  return (
    <div className="camera-card">
      <div className="camera-card__header">
        <span className="camera-card__name">{camera.name}</span>
        <span className={`camera-card__badge ${running ? 'is-live' : 'is-stopped'}`}>
          {running ? 'LIVE' : 'PARADO'}
        </span>
      </div>

      <div className="camera-card__video">
        {running && ready ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} autoPlay muted playsInline controls />
        ) : running ? (
          <div className="camera-card__loading">
            <div className="camera-card__loading-label">A carregar câmera…</div>
            <div className="camera-card__progress">
              <div className="camera-card__progress-bar" style={{ width: `${loadingProgressPct}%` }} />
            </div>
            <div className="camera-card__loading-hint">
              {buffer?.segment_count ?? 0}/{MIN_READY_SEGMENTS} segmentos · {loadingSeconds}s
            </div>
          </div>
        ) : (
          <div className="camera-card__placeholder">Stream parado</div>
        )}
      </div>

      {buffer?.available && (
        <div className="camera-card__buffer">
          Buffer: últimos {Math.round(buffer.duration_seconds)}s disponíveis para recuar
          (fixo: {Math.round(camera.buffer_seconds / 60)} min)
        </div>
      )}

      {error && <div className="camera-card__error">{error}</div>}

      <div className="camera-card__actions">
        <button type="button" onClick={toggleStream} disabled={busy}>
          {running ? 'Parar' : 'Ligar'}
        </button>
        <button
          type="button"
          disabled
          title="Gravação de execuções — próxima fase (recording_manager)"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}
