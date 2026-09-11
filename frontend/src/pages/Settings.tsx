// Página de configuração das câmaras (README secção 8): listar, adicionar,
// editar e remover câmaras. Inclui também um card de administração
// (README secção 10): reiniciar, parar/fechar e repor a aplicação, e
// instalar/desinstalar o arranque automático. O card só abre depois de a
// password de administração (ADMIN_ACTION_PASSWORD em
// backend/config/settings.py) ser confirmada pelo backend — só depois é
// que os botões lá dentro ficam disponíveis, já sem pedir a password outra
// vez a cada clique. Reiniciar/parar/desinstalar o arranque automático só
// funcionam quando o CamTramp já está instalado como serviço systemd
// --user (README secção 10) — nesses casos o pedido falha com 409 e a
// mensagem de erro do backend explica porquê, ou (desinstalar, se for
// mesmo esse serviço a correr) a aplicação fecha-se a seguir.

import { useEffect, useState } from 'react'
import { api } from '../api'
import { CameraForm } from '../components/CameraForm'
import type { Camera, RestartResult } from '../types'

type SystemAction = 'restart' | 'stop' | 'reset' | 'install-autostart' | 'uninstall-autostart'

// Sugestão de password mencionada no texto do window.prompt() (ver
// handleOpenAdmin) — a mesma que já aparece como placeholder no campo de
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

  // A password só fica em memória (nunca em disco/localStorage) enquanto
  // o card de administração está aberto — introduzida uma vez ao clicar
  // em "Admin", reutilizada por todos os botões lá dentro, e limpa ao
  // fechar o card.
  const [adminPassword, setAdminPassword] = useState<string | null>(null)
  const [adminChecking, setAdminChecking] = useState(false)
  const [systemBusy, setSystemBusy] = useState<SystemAction | null>(null)
  const [systemMessage, setSystemMessage] = useState<string | null>(null)
  const [systemOutput, setSystemOutput] = useState<string | null>(null)
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
    if (!window.confirm(`Remover a câmara "${camera.name}"? As gravações guardadas dela também serão apagadas.`))
      return
    await api.deleteCamera(camera.id)
    reload()
  }

  // Botão "Admin": pede a password uma única vez e confirma-a já aqui
  // (POST /api/system/check-password) — só abre o card se estiver
  // correta, em vez de a pessoa descobrir que a escreveu mal só ao
  // carregar numa ação lá dentro.
  const handleOpenAdmin = async () => {
    const password = window.prompt(
      `Password de administração (sugestão: ${ADMIN_PASSWORD_HINT}):`,
    )
    if (!password) return
    setAdminChecking(true)
    try {
      await api.checkAdminPassword(password)
      setAdminPassword(password)
      setSystemMessage(null)
      setSystemOutput(null)
      setSystemError(null)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Password incorreta.')
    } finally {
      setAdminChecking(false)
    }
  }

  const handleCloseAdmin = () => {
    setAdminPassword(null)
    setSystemMessage(null)
    setSystemOutput(null)
    setSystemError(null)
  }

  // Ação genérica do card de administração: usa a password já confirmada
  // ao abrir o card (nunca pede outra vez), com uma confirmação extra por
  // ação antes de a disparar, e mostra sempre o resultado (mensagem e,
  // quando existir, o output completo do script) dentro do próprio card.
  const runSystemAction = async (
    action: SystemAction,
    confirmText: string,
    call: (password: string) => Promise<RestartResult>,
  ) => {
    if (!adminPassword) return
    if (!window.confirm(confirmText)) return
    setSystemBusy(action)
    setSystemMessage(null)
    setSystemOutput(null)
    setSystemError(null)
    try {
      const result = await call(adminPassword)
      setSystemMessage(result.message)
      setSystemOutput(result.output ?? null)
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
      'Reiniciar a aplicação? O vídeo em direto fica indisponível por alguns segundos.',
      api.restartApp,
    )

  const handleStop = () =>
    runSystemAction(
      'stop',
      'Parar a aplicação? O backend e o frontend vão encerrar — é preciso voltar a ligar a ' +
        'Raspberry Pi (ou correr ./start.sh manualmente) para voltar a usar o CamTramp.',
      api.stopApp,
    )

  const handleReset = () =>
    runSystemAction(
      'reset',
      'Repor a base de dados e os logs? Todas as câmaras guardadas, as gravações e o buffer ' +
        'de vídeo vão ser apagados. Esta ação não pode ser desfeita.',
      api.resetApp,
    )

  const handleInstallAutostart = () =>
    runSystemAction(
      'install-autostart',
      'Instalar o arranque automático? Cria o serviço systemd --user, o autostart do browser ' +
        'em ecrã inteiro, e desativa a suspensão do sistema (README secção 10). Se a app ' +
        'estiver a correr manualmente (./start.sh), convém fechar esse processo a seguir.',
      api.installAutostart,
    )

  const handleUninstallAutostart = () =>
    runSystemAction(
      'uninstall-autostart',
      'Remover o arranque automático? Desativa o serviço systemd, o autostart do browser, e ' +
        'reativa a suspensão do sistema. Se for este o serviço a correr a aplicação agora, ela ' +
        'vai fechar-se a seguir.',
      api.uninstallAutostart,
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

        {adminPassword === null ? (
          <>
            <p className="settings__hint">
              Reiniciar, parar ou repor a aplicação, e instalar/remover o arranque automático —
              ações protegidas por password.
            </p>
            <button type="button" onClick={handleOpenAdmin} disabled={adminChecking}>
              {adminChecking ? 'A confirmar...' : 'Admin'}
            </button>
          </>
        ) : (
          <div className="settings__admin-card">
            <div className="settings__admin-card-header">
              <h4>Administração</h4>
              <button type="button" onClick={handleCloseAdmin}>
                Fechar
              </button>
            </div>

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
              <button
                type="button"
                onClick={handleInstallAutostart}
                disabled={systemBusy !== null}
              >
                {systemBusy === 'install-autostart' ? 'A instalar...' : 'Instalar arranque automático'}
              </button>
              <button
                type="button"
                className="settings__danger-button"
                onClick={handleUninstallAutostart}
                disabled={systemBusy !== null}
              >
                {systemBusy === 'uninstall-autostart' ? 'A remover...' : 'Remover arranque automático'}
              </button>
            </div>

            {systemMessage && <div className="settings__system-message is-ok">{systemMessage}</div>}
            {systemError && <div className="settings__error">{systemError}</div>}
            {systemOutput && <pre className="settings__output">{systemOutput}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}
