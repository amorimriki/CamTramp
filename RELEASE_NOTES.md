# CamTramp — Notas de lançamento

## v4.0 — 2026-09-11

### Gravações
- **Buffer de vídeo aumentado de 5 para 8 minutos** para todas as câmaras.
- Corrigido um bug em que o sistema podia acumular mais do que os 4
  ficheiros de gravação esperados por câmara: o intervalo de limpeza
  automática foi reduzido de 30s para 10s, e passou a haver também uma
  limpeza imediata sempre que o backend arranca ou uma câmara inicia o
  stream (em vez de depender só do ciclo periódico).
- Cada sessão de gravação regista agora, no início do log da câmara, o
  **IP da câmara e o timestamp** dessa ligação — facilita perceber quando
  e a que câmara pertence cada excerto do log.
- Na página de **Gravações**, os vídeos guardados passam a estar
  **agrupados por câmara** (uma lista por câmara, identificada pelo nome
  dado na configuração), em vez de uma tabela única com todas as câmaras
  misturadas.

### Câmaras
- Novo **seletor de marca** no formulário de câmara (Teruhal / Jooan): o
  URL RTSP é montado automaticamente a partir do IP e da password, sem
  ser preciso escrever o URL completo à mão.
- Para câmaras Jooan: utilizador fixo em `admin`, a password introduzida
  é codificada em URL antes de entrar no URL RTSP, e é apresentado um
  aviso a lembrar para confirmar que a câmara tem o RTSP ativado com
  autenticação.

### Gestão da aplicação
- Novos botões nas Definições para **parar** e **repor** a aplicação,
  juntando-se ao botão de reiniciar já existente.
  - **Reiniciar** e **Parar** continuam a exigir que o CamTramp esteja
    instalado como serviço systemd de arranque automático.
  - **Repor** funciona em qualquer instalação e agora limpa tudo o que
    fica sem uso: câmaras configuradas, logs, gravações guardadas e o
    buffer de vídeo.
- As três ações passam a pedir a **password de administração** apenas no
  momento em que o botão é clicado (deixou de haver um campo de password
  sempre visível no ecrã).

### Interface
- Interface **adaptada a telemóvel**: em ecrãs estreitos, a navegação
  (Câmaras / Configurações / Gravações) passa a um **menu lateral**
  (hambúrguer) para não sobrepor o conteúdo em modo vertical.
- A tabela de câmaras nas Definições e a tabela de gravações passam a
  **modo cartão** em ecrãs pequenos, em vez de obrigar a fazer scroll
  horizontal.

### Administração
- Os botões de reiniciar/parar/repor deixam de estar sempre visíveis:
  agora há um único botão **"Admin"** que pede a password uma vez e, se
  estiver correta, abre um **card** com todas as ações.
- Esse card ganha dois botões novos — **instalar** e **remover o arranque
  automático** — que correm os scripts `install-autostart.sh` /
  `uninstall-autostart.sh` diretamente a partir da interface, sem precisar
  de SSH.
- Todas as ações do card mostram sempre **feedback**: mensagem de
  sucesso/erro e, para os dois botões novos, o output completo do script.

### Câmaras (correção)
- Ao **remover uma câmara**, deixam de ficar gravações, buffer temporário
  e ficheiro de log órfãos em disco: agora são apagados automaticamente
  junto com a câmara.

### Documentação
- README atualizado com todas as alterações acima (estado do projeto,
  estrutura de pastas, endpoints da API e secções relevantes).
- Adicionados os créditos de autoria (Ricardo Amorim) e a nota de licença
  (MIT, projeto open source) no README e no ficheiro `LICENSE`.

---

