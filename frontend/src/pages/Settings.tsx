// Página de configuração das câmaras (README secção 8): listar, adicionar,
// editar e remover câmaras. Inclui também as ações de sistema (README
// secção 10): reiniciar, parar/fechar e repor a aplicação — as três só
// avançam com a password de administração correta (ADMIN_ACTION_PASSWORD
// em backend/config/settings.py); reiniciar/parar só funcionam quando
// instalado como serviço systemd --user, ficam desativadas noutros casos
// (o pedido falha com 409 e a mensagem de erro do backend explica porquê).

import { useEffect, useState } from 'react'
import { api } from '../api'
import { CameraForm } from '../components/CameraForm'
import type { Camera, RestartResult } from '../types'

type SystemAction = 'restart' | 'stop' | 'reset'

// Sugestão de password mencionada no texto do window.prompt() (ver
// runSystemAction) — a mesma que já aparece como placeholder no campo de
// password da Jooan em CameraForm.tsx. Fica só escrita na pergunta, não
// como valor pré-preenchido no campo: window.prompt() não tem
// "placeholder" (texto de exemplo que desaparece ao escrever) — o único
// 2º argumento que tem é um valor inicial EDITÁVEL, que ficaria a olhar
// como se já tivesse sido escrito e seria enviado tal e qual se a pessoa
// só carregasse OK. Mencionar a sugestão na própria pergunta evita essa
// confusão e deixa o campo vazio, como um placeholder real deixaria.
const ADMIN_PASSWORD_HINT = 'Tr@mpolinsaae'

export function Settings() {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [editing, setEditing] = useState<Camera | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [systemBusy, setSystemBusy] = useState<SystemAction | null>(null)
  const [systemMessage, setSystemMessage] = useState<string | null>(null)
  const [systemError, setSystemError] = useState<string | null>(null)

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

  // Ação genérica de sistema (restart/stop/reset): em vez de um campo de
  // password sempre visível na página, só se pede a password (com
  // window.prompt, que já serve de confirmação — cancelar/deixar em
  // branco aborta) no preciso momento em que se carrega no botão. Nunca
  // fica nada em claro no ecrã entre cliques, o que interessa mais aqui
  // do que num ecrã partilhado no ginásio.
  const runSystemAction = async (
    action: SystemAction,
    promptText: string,
    call: (password: string) => Promise<RestartResult>,
  ) => {
    const password = window.prompt(promptText)
    if (!password) return // cancelado ou deixado em branco
    setSystemBusy(action)
    setSystemMessage(null)
    setSystemError(null)
    try {
      const result = await call(password)
      setSystemMessage(result.message)
      if (action === 'reset') reload()
    } catch (e) {
      setSystemError(e instanceof Error ? e.message : 'Falha na operação')
    } finally {
      setSystemBusy(null)
    }
  }

  const handleRestart = () =>
    runSystemAction(
      'restart',
      'Reiniciar a aplicação (o vídeo em direto fica indisponível por alguns segundos). ' +
        `Password de administração (sugestão: ${ADMIN_PASSWORD_HINT}):`,
      api.restartApp,
    )

  const handleStop = () =>
    runSystemAction(
      'stop',
      'Parar a aplicação — o backend e o frontend vão encerrar e é preciso voltar a ligar a ' +
        'Raspberry Pi (ou correr ./start.sh manualmente) para voltar a usar o CamTramp. ' +
        `Password de administração (sugestão: ${ADMIN_PASSWORD_HINT}):`,
      api.stopApp,
    )

  const handleReset = () =>
    runSystemAction(
      'reset',
      'Repor a base de dados e os logs — todas as câmaras guardadas, as gravações e o ' +
        'buffer de vídeo vão ser apagados. Esta ação não pode ser desfeita. ' +
        `Password de administração (sugestão: ${ADMIN_PASSWORD_HINT}):`,
      api.resetApp,
    )

  return (
    <div className="settings">
      <div className="settings__header">
        <h2>Configuração das Câmaras</h2>
        <button type="button" onClick={handleAddNew}>
          + Nova câmara
        </button>
      </div>

      <p className="settings__hint">Buffer fixo de 8 minutos para todas as câmaras.</p>

      {loadError && <div className="settings__error">{loadError}</div>}

      <div className="table-scroll">
        <table className="settings__table">
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">URL RTSP</th>
              <th scope="col">
                <span className="visually-hidden">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((camera) => (
              <tr key={camera.id}>
                <td data-label="Nome">{camera.name}</td>
                <td className="settings__url" data-label="URL RTSP">
                  {camera.rtsp_url}
                </td>
                <td className="settings__row-actions" data-label="Ações">
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
                <td colSpan={3} className="settings__empty">
                  Ainda não há câmaras configuradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="settings__form-panel">
          <CameraForm initial={editing ?? undefined} onSaved={handleSaved} onCancel={handleCancel} />
        </div>
      )}

      <div className="settings__system">
        <h3>Sistema</h3>
        <p className="settings__hint">
          Reinicia o backend e o frontend (só disponível quando o CamTramp está instalado como
          arranque automático).
        </p>

        <div className="settings__system-actions">
          <button type="button" onClick={handleRestart} disabled={systemBusy !== null}>
            {systemBusy === 'restart' ? 'A reiniciar...' : 'Reiniciar aplicação'}
          </button>
          <button type="button" onClick={handleStop} disabled={systemBusy !== null}>
            {systemBusy === 'stop' ? 'A encerrar...' : 'Parar aplicação'}
          </button>
          <button
            type="button"
            className="settings__danger-button"
            onClick={handleReset}
            disabled={systemBusy !== null}
          >
            {systemBusy === 'reset' ? 'A repor...' : 'Repor tudo (câmaras, gravações e logs)'}
          </button>
        </div>

        {systemMessage && <div className="settings__system-message is-ok">{systemMessage}</div>}
        {systemError && <div className="settings__error">{systemError}</div>}
      </div>
    </div>
  )
}
