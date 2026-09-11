# CamTramp

Desenvolvido por **Ricardo Amorim** · open source, [licença MIT](LICENSE)
(ver secção 18).

Sistema de vídeo com buffer/replay para câmaras IP (RTSP), pensado para
treino de trampolim: vídeo ao vivo por câmara, com uma janela contínua dos
últimos minutos disponível para recuar e rever uma execução. Corre
localmente (Raspberry Pi ou um computador na mesma rede), sem depender de
internet.

## 1. Estado do projeto

| Funcionalidade | Estado |
|---|---|
| Adicionar/editar/remover câmaras (nome, URL RTSP) | ✅ |
| Testar ligação RTSP e detetar o codec de vídeo | ✅ |
| Vídeo ao vivo por câmara (HLS) | ✅ |
| Buffer contínuo com janela deslizante (fixo, 8 min, para todas as câmaras) | ✅ |
| Recuar no vídeo dentro da janela do buffer | ✅ (barra do próprio `<video>`) |
| Arranque automático do streaming ao ligar o servidor | ✅ |
| Descoberta automática de câmaras na rede local (nmap) | ✅ |
| Acesso a partir de outro dispositivo na rede (IP local + código QR) | ✅ |
| Arranque automático da aplicação e do browser no login (Linux) | ✅ |
| Múltiplas câmaras em simultâneo | ✅ (testado com uma; a arquitetura suporta várias) |
| Gravação automática dos últimos 20 min (4 ficheiros .mp4 de 5 min, por câmara) | ✅ (ver secção 16) |
| Estado em tempo real via WebSocket (a correr + buffer de cada câmara) | ✅ |
| Seletor de marca da câmara no formulário (Teruhal, Jooan) — monta o URL RTSP sozinho | ✅ (ver secção 7) |
| Interface adaptada a telemóvel (menu lateral, tabelas em cartões) | ✅ (ver secção 9) |
| Card de administração (password): reiniciar/parar/repor a app e instalar/remover o arranque automático, a partir da interface | ✅ (ver secção 10) |

## 2. Arquitetura

```text
   Câmara(s) RTSP
        │
        ▼
     FFmpeg  ──► deteta o codec (ffprobe) e, se necessário, transcodifica
        │         para H.264; corta o stream em segmentos .ts de 2s
        ▼
  backend/storage/buffer/<id>/
     stream.m3u8 (janela deslizante)  +  segment_00001.ts, segment_00002.ts, ...
        │
        ▼
   FastAPI (backend/)
     • serve o .m3u8/.ts por HTTP em /streams/{id}/...
     • API REST para gerir câmaras e o ciclo de vida do FFmpeg
     • WebSocket (/ws/status) difunde o estado das câmaras em tempo real
     • descoberta de câmaras na rede local (nmap) e deteção do IP local
     • guarda a configuração em backend/database/db.json
        │
        ▼
   React + hls.js (frontend/)
     • Dashboard: grelha com o vídeo ao vivo de cada câmara, estado em
       tempo real via WebSocket
     • Configuração: CRUD de câmaras + descoberta automática na rede
     • Rodapé: IP local + código QR para abrir a app noutro dispositivo
```

O FFmpeg é o único componente que fala RTSP com as câmaras. O "buffer" não
é uma estrutura em memória separada: é a própria janela deslizante de
segmentos HLS que o FFmpeg mantém em disco (`-hls_flags
delete_segments+append_list`, ver secção 5) — o vídeo "ao vivo" e o vídeo
"do buffer" são a mesma coisa, o browser é que decide em que ponto da
janela está a reproduzir.

## 3. Stack tecnológica

| Componente | Tecnologia |
|---|---|
| Processamento/streaming de vídeo | FFmpeg (RTSP → HLS) |
| Backend | Python 3 + FastAPI + Uvicorn |
| Configuração/dados | Ficheiro JSON (`backend/database/db.json`), sem SQL |
| Descoberta de câmaras na rede local | nmap (processo externo, invocado pelo backend) |
| Frontend | React 19 + TypeScript + Vite |
| Player de vídeo | hls.js (Safari usa o suporte nativo a HLS) |
| Streaming para o browser | HLS |
| Código QR (acesso a partir de outro dispositivo) | Encoder local vendorizado, sem dependências nem rede (ver secção 4) |
| Comunicação frontend ↔ backend | REST HTTP (ações/CRUD) + WebSocket (estado das câmaras em tempo real, secção 15) |

## 4. Estrutura do projeto

```text
CamTramp/
├── start.sh                       # arranca backend + frontend em conjunto
├── scripts/
│   ├── install-autostart.sh        # instala o arranque automático no login (Linux)
│   ├── uninstall-autostart.sh      # remove o arranque automático
│   ├── open-browser.sh             # espera o frontend ficar pronto e abre o browser
│   ├── camtramp.service.template   # template do serviço systemd --user
│   └── camtramp-browser.desktop.template  # template da entrada de autostart XDG
├── backend/
│   ├── main.py                     # FastAPI; lifespan arranca/pára os streams
│   ├── api/
│   │   ├── cameras.py               # CRUD de câmaras + teste de ligação RTSP
│   │   ├── buffer.py                # estado do stream, start/stop, resumo do buffer
│   │   ├── ws.py                     # WS /ws/status — estado em tempo real (secção 15)
│   │   ├── system.py                # IP local (código QR) + card de admin (reiniciar/parar/repor/autostart), com password (secção 10)
│   │   ├── discovery.py             # descoberta de câmaras na rede local (nmap)
│   │   └── recordings.py            # GET /api/recordings — listar gravações (secção 16)
│   ├── services/
│   │   ├── camera_manager.py        # ciclo de vida das câmaras (start_all_enabled, etc.)
│   │   ├── stream_manager.py        # processos FFmpeg: deteção de codec, comando HLS
│   │   ├── buffer_manager.py        # lê o .m3u8 → resumo do buffer disponível
│   │   ├── status_broadcaster.py    # difunde o estado das câmaras via WebSocket (secção 15)
│   │   ├── discovery.py             # varredura nmap + deteção do IP local
│   │   └── recording_manager.py     # lista/rotaciona os .mp4 gravados (secção 16)
│   ├── models/
│   │   ├── camera.py                # modelos Pydantic (validação de rtsp_url, ...)
│   │   └── recording.py             # modelo Pydantic de uma gravação (secção 16)
│   ├── database/
│   │   ├── database.py              # leitura/escrita atómica do JSON, com lock (inclui reset_db)
│   │   └── db.json                  # dados reais — não versionado
│   ├── config/settings.py           # caminhos, duração fixa do buffer, largura máx. de transcode
│   └── storage/                     # buffer HLS + logs do FFmpeg — não versionado
│       ├── buffer/<camera_id>/       # stream.m3u8 + segment_XXXXX.ts
│       ├── logs/camera_<id>.log      # stdout/stderr do FFmpeg dessa câmara
│       └── recordings/<camera_id>/   # ficheiros .mp4 gravados (secção 16) — não versionado
└── frontend/
    └── src/
        ├── api.ts                    # cliente HTTP para o backend (inclui listRecordings)
        ├── types.ts                  # tipos TS espelhando os modelos do backend
        ├── lib/
        │   ├── qrcode.ts               # encoder de códigos QR (usa vendor/qrcode-core)
        │   ├── statusSocket.ts         # ligação WebSocket partilhada (secção 15)
        │   └── useCameraStatus.ts      # hook: estado em tempo real de uma câmara
        ├── vendor/qrcode-core/        # adaptação ES modules do codificador "core" do pacote npm "qrcode"
        ├── components/
        │   ├── CameraCard.tsx         # vídeo (hls.js), fase de carregamento, buffer, ligar/parar
        │   ├── CameraForm.tsx         # criar/editar câmara + descoberta na rede local + seletor de marca (secção 7)
        │   ├── QrCode.tsx             # renderiza um código QR como SVG inline
        │   └── NetworkAccess.tsx      # mostra o IP local + código QR no rodapé
        └── pages/
            ├── Dashboard.tsx          # grelha de câmaras (ecrã principal)
            ├── Recordings.tsx         # gravações automáticas, uma lista por câmara (secção 16)
            └── Settings.tsx           # câmaras + card de administração (secção 10)
```

## 5. Como funciona o streaming e o buffer

1. Ao arrancar uma câmara, o `stream_manager` corre um `ffprobe` rápido ao
   URL RTSP para identificar o codec de vídeo.
2. Se for **H.264**, o FFmpeg usa `-c:v copy` (sem recodificar — custo de
   CPU mínimo). Se for **HEVC/H.265** (ou não for possível detetar), o
   FFmpeg **transcodifica** para H.264 (`libx264 -preset ultrafast`, com
   downscale até `MAX_TRANSCODE_WIDTH` px), porque a maioria dos browsers
   não descodifica HEVC nativamente via MSE.
3. O FFmpeg escreve segmentos de `SEGMENT_SECONDS` (2s) e mantém um
   `stream.m3u8` do tipo *live* com janela deslizante
   (`-hls_flags delete_segments+append_list+omit_endlist+program_date_time`):
   o número de segmentos mantidos = `BUFFER_SECONDS / SEGMENT_SECONDS`.
   `BUFFER_SECONDS` é fixo (8 minutos) para todas as câmaras — deixou de
   ser configurável por câmara, para simplificar a operação do sistema
   (ver secção 7).
4. `-fflags +discardcorrupt -err_detect ignore_err` fazem o FFmpeg tolerar
   e continuar perante pacotes RTSP corrompidos/perdidos (comum em Wi-Fi),
   em vez de abortar o stream.
5. O FastAPI expõe essa pasta diretamente por HTTP (`/streams/{id}/...`) e
   o `buffer_manager` lê o `.m3u8` para dizer ao frontend quantos segundos
   de vídeo estão disponíveis para recuar.
6. No frontend, o `hls.js` só liga ao player depois de o backend confirmar
   um mínimo de 3 segmentos disponíveis (até 60s de espera) — evita o erro
   de "manifesto vazio" quando se abre a página mesmo depois de o stream
   ter acabado de arrancar.

## 6. Pré-requisitos e arranque rápido

- Python 3.10+
- Node.js 18+ e npm
- FFmpeg (`brew install ffmpeg` no macOS, `sudo apt install ffmpeg` no
  Raspberry Pi OS / Debian)
- nmap — opcional, só necessário para a descoberta automática de câmaras
  na rede (secção 8); sem ele o resto da aplicação funciona normalmente
  (`brew install nmap` no macOS, `sudo apt install nmap` no Raspberry Pi
  OS / Debian)

```bash
git clone <url-do-repositório> CamTramp
cd CamTramp
./start.sh
```

O `start.sh`:

- verifica as dependências (ffmpeg, nmap) e instala as do backend/frontend
  que faltarem (`pip install -r backend/requirements.txt`, `npm install`);
- arranca o backend em `http://localhost:8000` e o frontend em
  `http://localhost:5173` (também acessível na rede local por
  `http://<IP-da-máquina>:5173` — ver secção 9 para o código QR);
- ao ligar o backend, arranca automaticamente o streaming de todas as
  câmaras com `enabled: true` — não é preciso nenhuma ação manual;
- para os dois processos de forma limpa com `Ctrl+C`.

Variáveis opcionais:

```bash
BACKEND_PORT=8000 FRONTEND_PORT=5173 ./start.sh

# autoreload do backend para desenvolvimento — reinicia todos os streams
# sempre que um ficheiro .py muda; não usar em uso normal
DEV_RELOAD=1 ./start.sh
```

Sem o `start.sh`, para correr os dois manualmente:

```bash
# backend
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000

# frontend (noutro terminal)
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Para arrancar tudo automaticamente no login, sem correr `./start.sh` à
mão de cada vez, ver secção 10 (Linux).

## 7. Configuração

Cada câmara guarda apenas: `name`, `rtsp_url` (tem de começar por
`rtsp://`) e `enabled`. O buffer **não é configurável por câmara** — é
sempre o valor fixo `BUFFER_SECONDS`, devolvido pela API em
`buffer_seconds` para cada câmara, independentemente do que estiver
guardado (protege contra dados antigos de versões anteriores). Estes
valores estão centralizados em `backend/config/settings.py`:

| Valor | Por omissão | Descrição |
|---|---|---|
| `BUFFER_SECONDS` | 480 (8 min) | Duração fixa do buffer, igual para todas as câmaras |
| `SEGMENT_SECONDS` | 2 | Duração de cada segmento HLS |
| `MAX_TRANSCODE_WIDTH` | 1280 | Largura máx. ao transcodificar HEVC → H.264 |

Não existem ficheiros de segredos/`.env` — o único dado sensível é o URL
RTSP de cada câmara (pode incluir utilizador/palavra-passe), guardado só
em `backend/database/db.json`, que **não é versionado** (ver secção 12).

**Formato do URL RTSP por marca** — o formato do URL varia de câmara para
câmara (nem todas pedem autenticação, e o "path" final do stream também
muda). Por isso o formulário de adicionar/editar câmara
(`frontend/src/components/CameraForm.tsx`) tem um seletor "Marca da
câmara": ao escolher uma marca conhecida, mostra só os campos necessários
(IP, porta, e utilizador/password quando a marca precisa) e constrói o
`rtsp_url` final sozinho — por exemplo:

| Marca | Formato do URL |
|---|---|
| Teruhal | `rtsp://IPADDRESS:554` (sem autenticação) |
| Jooan | `rtsp://USER:PASSWORD@IPADDRESS:554/live/ch00_1` |

A opção "Outra / indicar o URL RTSP manualmente" mantém o comportamento
original — colar o URL completo à mão — para qualquer câmara fora desta
lista. A marca escolhida não é guardada em lado nenhum: serve só para
montar o `rtsp_url`, que continua a ser o único dado persistido. Para
suportar mais uma marca, basta acrescentar uma entrada ao array `BRANDS`
no topo do `CameraForm.tsx` (id, nome, se precisa de autenticação, porta
por omissão e a função que monta o URL) — não é preciso mexer em mais
nenhum sítio do formulário nem no backend.

Para a marca **Jooan** em particular: o campo "Utilizador" nem aparece —
usa-se sempre `admin` (é o utilizador de fábrica desta marca) — e o campo
"Password" mostra um exemplo de referência. Antes de montar o `rtsp_url`,
o utilizador e a password são sempre passados por `encodeURIComponent()`,
porque caracteres especiais (como `@`) têm de ir codificados no URL
(`%40`, etc.) ou a ligação RTSP falha. O formulário mostra ainda um aviso
a lembrar para confirmar, nas definições da própria câmara Jooan, que o
RTSP está ativado e que a autenticação (proteção por utilizador/password)
está ligada.

## 8. Descoberta automática de câmaras na rede local

No formulário de adicionar/editar câmara (Configuração → "+ Nova câmara"),
o botão **"Procurar câmaras na rede"** varre a rede local com `nmap` à
procura de dispositivos com a porta RTSP (554) aberta:

1. O backend deteta o IP local desta máquina (o mesmo usado para o código
   QR, secção 9) e assume a sub-rede `/24` correspondente (ex.:
   `192.168.1.0/24`).
2. Corre `nmap -Pn -p 554 --open -T4 <sub-rede>` — `-Pn` porque muitas
   câmaras/routers bloqueiam *ping* ICMP e seriam ignoradas antes de testar
   a porta; `--open` só devolve hosts com a porta encontrada aberta.
3. Cada IP encontrado aparece como um botão (`GET /api/discovery/scan`,
   ver secção 11); ao clicar, o URL RTSP do formulário é preenchido com
   `rtsp://<ip>:554/`.

Isto **não confirma que o dispositivo é uma câmara** nem tenta
autenticar-se — só confirma que algo aceita ligações TCP nessa porta.
O utilizador ainda tem de ajustar o path/credenciais do URL conforme a
marca/modelo da câmara e confirmar com o botão "Testar" (que já existia).

Se o `nmap` não estiver instalado, o botão mostra o erro devolvido pela
API a explicar como instalar (ver secção 6). A varredura pode demorar
alguns segundos, consoante o tamanho da rede.

## 9. Acesso a partir de outro dispositivo (IP local + código QR)

O cabeçalho da aplicação mostra sempre o IP local desta máquina e um
código QR com o URL completo do frontend (`GET /api/system/network`, ver
secção 11) — para abrir o dashboard rapidamente noutro dispositivo
(telemóvel, tablet) ligado à mesma rede local, sem ser preciso escrever o
IP à mão.

- A deteção do IP usa um truque de socket UDP (`connect` para
  `8.8.8.8:80` e lê-se o IP de saída local com `getsockname()`) — não
  chega a enviar nenhum pacote nem depende de internet, só consulta a
  tabela de rotas do sistema operativo; funciona com qualquer rede local
  ativa.
- O código QR é gerado inteiramente no frontend, sem chamadas de rede nem
  serviços externos: `frontend/src/vendor/qrcode-core/` é uma adaptação em
  ES modules, sem dependências, do codificador "core" do pacote npm
  `qrcode` (mantém-se fiel ao algoritmo original; só foi removida a parte
  de segmentação automática de texto, que dependia do pacote `dijkstrajs`
  — aqui o modo é sempre fixado como *byte*, que é sempre correto para os
  URLs que este widget codifica).
- **Interface adaptada a ecrãs pequenos/verticais** (telemóvel) —
  `frontend/src/App.css` tem regras `@media` a partir de 768px, 640px e
  480px de largura. A mudança mais visível é a navegação: em ecrã largo os
  3 botões ("Câmaras", "Gravações", "Configuração") ficam ao lado do
  logótipo, mas num ecrã estreito não cabem todos sem sobrepor o título —
  por isso passam a um **menu lateral** (painel que desliza a partir da
  direita), aberto por um botão de hambúrguer no canto superior direito e
  fechado ao escolher uma opção, tocar fora do painel, ou voltar a
  carregar no botão (`frontend/src/App.tsx`, estado `menuOpen`). A tabela
  de gravações fica dentro de um contentor com scroll horizontal próprio
  (`.table-scroll`) em vez de a página inteira deslizar para os lados; a
  tabela de câmaras (Configuração) vai mais longe — abaixo de 640px deixa
  de ser uma tabela e passa a uma lista de "cartões" empilhados, um por
  câmara (nome, URL RTSP a quebrar linha, botões Editar/Remover), porque
  aí o URL RTSP sozinho já não cabe ao lado do nome sem forçar scroll
  horizontal constante (as etiquetas de cada campo vêm do atributo
  `data-label` de cada `<td>`, ver `Settings.tsx`). A grelha de câmaras ao
  vivo passa a uma única coluna abaixo de 480px.

## 10. Arranque automático no login (Linux)

Em vez de correr `./start.sh` manualmente sempre que a máquina liga (ex.:
Raspberry Pi dedicado no ginásio), `scripts/install-autostart.sh` instala:

1. Um **serviço systemd `--user`** (`~/.config/systemd/user/camtramp.service`)
   que corre `start.sh` em segundo plano assim que a sessão do utilizador
   arranca, com `Restart=on-failure` — se o processo morrer, o systemd
   volta a arrancá-lo.
2. Uma **entrada de autostart XDG**
   (`~/.config/autostart/camtramp-browser.desktop`) que, em ambiente
   gráfico, corre `scripts/open-browser.sh` no login: este script espera
   (até 60s) que o frontend responda em `http://localhost:5173` e só
   depois abre o browser em **modo kiosk/ecrã inteiro** (`--kiosk` no
   Chromium, `-kiosk` no Firefox — sem barra de endereço nem abas, ideal
   para o ecrã dedicado do ginásio), com fallback para `xdg-open` (browser
   por omissão do sistema, em janela normal) se nenhum dos dois estiver
   instalado.
3. A **desativação da suspensão/hibernação do sistema**
   (`sudo systemctl mask sleep.target suspend.target hibernate.target
   hybrid-sleep.target`) — este é um dispositivo dedicado que tem de
   ficar sempre a gravar e acessível na rede, por isso não pode entrar em
   suspensão por inatividade (ou, num portátil Debian, ao fechar a
   tampa). "mask" é mais robusto do que desativar isto só nas definições
   do ambiente gráfico, porque impede o pedido mesmo que venha de outro
   sítio (gestor de energia, `systemctl suspend` manual, etc.).

Instalação (no próprio Raspberry Pi/máquina Linux, como utilizador
normal):

```bash
./scripts/install-autostart.sh
```

Os passos 1 e 2 não precisam de privilégios especiais; o passo 3 precisa
de `sudo` (só para esse passo — o script pede a password nessa altura, se
for preciso).

O script também ativa `loginctl enable-linger` para o utilizador atual,
para o serviço arrancar mesmo sem sessão gráfica interativa (ex.:
Raspberry Pi com autologin em consola).

Para desinstalar (remove o serviço, a entrada de autostart, **e reativa**
a suspensão/hibernação do sistema): `./scripts/uninstall-autostart.sh`.

Úteis depois de instalado:

```bash
systemctl --user status camtramp.service     # estado do serviço
journalctl --user -u camtramp.service -f     # logs em direto
```

Este arranque automático é específico de Linux/systemd (pensado para o
Raspberry Pi de implantação, ver secção 14); em macOS continua a usar-se
`./start.sh` manualmente durante o desenvolvimento.

**Card de administração sem SSH** — a página de Configuração ("Sistema")
tem um único botão "Admin" que abre um card com cinco ações, em vez de
botões sempre visíveis na página:

| Botão | Endpoint | O que faz |
|---|---|---|
| Reiniciar aplicação | `POST /api/system/restart` | `systemctl --user restart camtramp.service` |
| Parar aplicação | `POST /api/system/stop` | `systemctl --user stop camtramp.service` (não volta a arrancar sozinho) |
| Repor tudo (câmaras, gravações e logs) | `POST /api/system/reset` | apaga todas as câmaras guardadas, os logs, as gravações e o buffer de vídeo |
| Instalar arranque automático | `POST /api/system/install-autostart` | corre `scripts/install-autostart.sh` (ver acima) |
| Remover arranque automático | `POST /api/system/uninstall-autostart` | corre `scripts/uninstall-autostart.sh` |

Reiniciar/parar são serviços `--user`, não precisam de `sudo`, e só
funcionam quando o CamTramp foi instalado com `install-autostart.sh` —
caso contrário (ex.: `./start.sh` manual em desenvolvimento) o botão
devolve um erro a explicar isso. "Repor" é diferente: não depende do
systemd (não mexe em nenhum processo do sistema, só nos ficheiros da
própria aplicação), por isso funciona também em desenvolvimento — mas é
destrutivo e sem forma de desfazer, por isso o frontend pede sempre
confirmação antes de o enviar. Apaga a configuração das câmaras, os logs,
**e também** as gravações permanentes (`storage/recordings/`) e o buffer
de vídeo (`storage/buffer/`) — depois de as câmaras deixarem de existir na
base de dados, esses ficheiros ficam órfãos (já não são acessíveis por
nenhum id de câmara válido) e sem qualquer uso, por isso o reset limpa-os
também em vez de os deixar a ocupar espaço em disco (as pastas em si não
são apagadas, só o conteúdo).

Instalar/remover arranque automático correm os próprios scripts descritos
no início desta secção, a partir da interface — o backend captura todo o
`stdout`/`stderr` do script (sem os códigos de cor do terminal, que
ficariam ilegíveis numa página web) e mostra-o no card, para se perceber
exatamente o que aconteceu sem precisar de abrir um terminal. "Instalar"
corre sempre de forma síncrona (nunca desliga o processo atual: um
`systemctl --user enable --now` num serviço já ativo não faz mal, é
idempotente). "Remover" é diferente consoante o CamTramp esteja ou não a
correr como esse mesmo serviço systemd neste preciso momento: se estiver
(o serviço vai desativar-se a si próprio), corre em segundo plano com o
mesmo truque de "sleep 1" do reiniciar/parar, e a interface não mostra o
output completo — a aplicação fecha-se a seguir, como um "Parar"; caso
contrário (ex.: `./start.sh` manual), corre logo e mostra o output
completo.

**Password de administração** — ao carregar em "Admin", aparece um
`window.prompt()` a pedir a password, mencionando a sugestão
`Tr@mpolinsaae` no próprio texto da pergunta ("Password de administração
(sugestão: Tr@mpolinsaae):", `ADMIN_PASSWORD_HINT` em `Settings.tsx`) — o
campo em si fica vazio, como um placeholder real deixaria (em vez de a
pré-preencher: um valor pré-preenchido em `window.prompt()` fica lá
parecendo já escrito, e seria enviado tal e qual se a pessoa só carregasse
OK sem reparar). Cancelar ou deixar o campo em branco aborta sem chamar a
API. A password é confirmada logo aí contra `ADMIN_ACTION_PASSWORD`
(`backend/config/settings.py`, via `POST /api/system/check-password`) —
só se estiver certa é que o card abre; se uma password for alterada sem a
outra, a sugestão mostrada deixa de bater certo com a password real. A
partir daí, os cinco botões do card usam essa mesma password (guardada só
em memória, nunca escrita em disco) sem a pedir outra vez — cada ação
continua a pedir uma confirmação (`window.confirm()`) antes de avançar,
já sem envolver a password. Fechar o card (botão "Fechar") esquece a
password de imediato. É uma proteção simples contra alguém carregar sem
querer nestas ações num ecrã partilhado no ginásio — não é uma
autenticação real (não há utilizadores nem sessões nesta aplicação).

## 11. API

```text
GET    /api/cameras                    # listar câmaras
POST   /api/cameras                    # criar câmara
GET    /api/cameras/{id}               # obter uma câmara
PUT    /api/cameras/{id}               # atualizar (parcial)
DELETE /api/cameras/{id}               # remover
POST   /api/cameras/test               # testar ligação RTSP + detetar codec

GET    /api/cameras/{id}/stream        # estado do processo FFmpeg (running, hls_url)
POST   /api/cameras/{id}/stream/start  # arrancar o streaming da câmara
POST   /api/cameras/{id}/stream/stop   # parar o streaming da câmara
GET    /api/cameras/{id}/buffer        # segmentos/duração disponíveis para recuar

WS     /ws/status                      # estado (a correr + buffer) de todas as câmaras em tempo real (ver secção 15)

GET    /api/system/network             # IP local desta máquina (para o código QR)
POST   /api/system/check-password      # só confirma a password (usado para abrir o card de admin)
POST   /api/system/restart             # reinicia a app (pede password; só via arranque automático, secção 10)
POST   /api/system/stop                # para a app (pede password; só via arranque automático, secção 10)
POST   /api/system/reset               # apaga câmaras, logs, gravações e buffer (pede password; funciona sempre)
POST   /api/system/install-autostart   # corre scripts/install-autostart.sh (pede password; devolve o output)
POST   /api/system/uninstall-autostart # corre scripts/uninstall-autostart.sh (pede password; devolve o output)
GET    /api/discovery/scan             # varre a rede local (nmap) por câmaras RTSP

GET    /api/recordings                 # listar gravações automáticas (opcional: ?camera_id=)

GET    /streams/{id}/stream.m3u8       # playlist HLS (ficheiros estáticos)
GET    /recordings/{camera_id}/{ficheiro}.mp4  # ficheiro de gravação (ficheiros estáticos, secção 16)
GET    /api/health                     # health check
GET    /docs                           # Swagger UI (documentação interativa)
```

O dashboard já não usa `GET .../stream` nem `GET .../buffer` em *polling*
— esses dois continuam disponíveis (úteis para testar com `curl`/Swagger,
ou para uma futura integração externa), mas o frontend recebe agora tudo
isto em tempo real pelo WebSocket da secção 15.

## 12. Armazenamento e dados

- `backend/database/db.json` e `backend/storage/` **não são versionados**
  (ver `.gitignore`) — contêm dados reais (URLs RTSP, incluindo eventuais
  credenciais) e ficheiros gerados pelo FFmpeg. Um checkout novo do
  repositório começa sem câmaras configuradas.
- Cada câmara tem o seu log de FFmpeg em
  `backend/storage/logs/camera_<id>.log`, útil para diagnosticar problemas
  de ligação/descodificação (ver secção 13). Cada vez que o stream de uma
  câmara arranca, `stream_manager.start()` escreve no início dessa sessão
  uma linha separadora com o nome da câmara, o IP (sem utilizador/password,
  mesmo que o `rtsp_url` os tenha) e a data/hora exatas, ex.:
  `==== [2026-09-11 12:18:22] Trampolim 1 (IP 192.168.0.108) — stream
  iniciado ====` — o ficheiro acumula todas as sessões (não é limpo entre
  arranques), pelo que este cabeçalho é o que permite distinguir onde
  começa cada uma sem ter de cruzar com o `db.json` só para saber a que
  câmara/IP pertence o `id` do nome do ficheiro.
- Recomenda-se um SSD (USB 3.0 num Raspberry Pi) para o `storage/`, já que
  o buffer e futuras gravações fazem escrita contínua em disco.

## 13. Fiabilidade e troubleshooting

- **Erros de descodificação HEVC recuperáveis** (`Could not find ref with
  POC`, `cu_qp_delta fora do intervalo`, `Skipping invalid undecodable
  NALU`) no log de uma câmara indicam normalmente perda de pacotes RTSP
  (Wi-Fi) ou um encoder H.265 não totalmente conforme na própria câmara —
  o FFmpeg está configurado para os tolerar e continuar, mas ligação por
  Ethernet reduz bastante a frequência. `speed=` no log (ativado com
  `-stats`) mostra se o FFmpeg está a acompanhar o stream em tempo real
  (`~1.0x`) ou a atrasar-se (`<1.0x`, sinal de CPU insuficiente).
- **`DEV_RELOAD=1` corta os streams a cada alteração de ficheiro** — o
  Uvicorn reinicia a aplicação, o que mata e volta a arrancar todos os
  processos FFmpeg. Só usar durante desenvolvimento ativo do backend.
- **Erro ao abrir uma câmara logo após o arranque do servidor** — o
  frontend já espera pelo mínimo de segmentos antes de ligar o player (ver
  secção 5.6); se mesmo assim houver erro, confirmar no
  `backend/storage/logs/camera_<id>.log` se o FFmpeg conseguiu sequer
  ligar-se à câmara.
- **"Procurar câmaras na rede" falha com erro sobre o nmap** — o nmap não
  está instalado nesta máquina; instalar conforme indicado na secção 6.
  A varredura só encontra dispositivos na mesma sub-rede `/24` desta
  máquina; câmaras noutra VLAN/sub-rede têm de ser adicionadas com o URL
  RTSP manualmente.
- **O browser não abre sozinho no login (Linux)** — confirmar que o
  serviço está a correr (`systemctl --user status camtramp.service`) e
  que existe sessão gráfica ativa (a entrada de autostart XDG só corre em
  ambiente gráfico); ver secção 10.
- **Não consigo aceder a partir de outro dispositivo na rede, mas o
  servidor está a correr** — a causa mais comum no Raspberry Pi é o
  `ufw` (firewall) ativo sem regras para as portas da aplicação: por
  omissão bloqueia tudo o que não esteja explicitamente permitido, mesmo
  que os processos estejam corretamente a ouvir em `0.0.0.0`. Confirmar
  com `sudo ufw status` e, se estiver `active`, abrir as portas do
  backend e do frontend:

  ```bash
  sudo ufw allow 8000/tcp
  sudo ufw allow 5173/tcp
  sudo ufw reload
  ```

  Se mudares `BACKEND_PORT`/`FRONTEND_PORT` (secção 6), repete isto para
  as novas portas — o `ufw` não sabe nada da aplicação, só dos números
  de porta. Se mesmo assim não funcionar, confirmar também que os
  processos estão a ouvir em todas as interfaces (`ss -tlnp | grep -E
  ':8000|:5173'` deve mostrar `0.0.0.0:...`, não `127.0.0.1:...`),
  isolamento de clientes no router/Wi-Fi, e — se a máquina tiver mais do
  que uma interface de rede ativa — que o IP mostrado no cabeçalho
  (secção 9) é mesmo o da rede local certa.

## 14. Hardware recomendado (implantação num Raspberry Pi)

| Componente | Recomendação |
|---|---|
| Raspberry Pi | Pi 5, 8 GB RAM |
| Armazenamento | SSD USB 3.0, 256–512 GB, para `backend/storage/` |
| Rede | Raspberry Pi ligado por **Ethernet** ao router/switch sempre que possível; câmaras podem ficar em Wi-Fi |
| Sistema operativo | Raspberry Pi OS 64-bit (com ambiente gráfico, para o arranque automático do browser — secção 10) |

O número de câmaras e a resolução/FPS de cada stream têm impacto direto no
uso de CPU, sobretudo quando é preciso transcodificar (câmaras HEVC).

## 15. Estado em tempo real (WebSocket)

O Dashboard não faz *polling* HTTP ao estado das câmaras — usa uma única
ligação WebSocket (`WS /ws/status`, ver secção 11) partilhada entre todas
as `CameraCard` e todos os separadores/dispositivos com o dashboard
aberto:

1. Ao ligar, o `ConnectionManager` (`backend/services/status_broadcaster.py`)
   aceita a ligação e envia logo um "retrato" (snapshot) do estado atual
   de todas as câmaras (a correr ou não, e o resumo do buffer de quem
   estiver a correr) — para o cliente não ficar às escuras à espera do
   próximo ciclo.
2. Um ciclo em segundo plano (`broadcast_loop`, arrancado no `lifespan` do
   `main.py`) volta a enviar esse retrato a todos os clientes ligados a
   cada 1 segundo — isto cobre uma câmara que caia sozinha (o FFmpeg
   morre sem ninguém ter carregado em "Parar"), já que corre
   independentemente de haver algum pedido a perguntar.
3. Arrancar ou parar uma câmara (`POST .../stream/start` ou `.../stop`,
   secção 11) dispara também uma difusão imediata
   (`status_broadcaster.broadcast_now()`), para essa mudança chegar ao
   ecrã quase de imediato em vez de esperar pelo próximo tick do ciclo.

No frontend, `frontend/src/lib/statusSocket.ts` mantém uma única ligação
WebSocket para toda a app (não uma por câmara) — abre-a quando a primeira
`CameraCard` se monta e fecha-a quando a última se desmonta — com
reconexão automática e *backoff* exponencial (até 10s) se a ligação cair.
Cada `CameraCard` lê o seu próprio estado dessa ligação partilhada através
do hook `frontend/src/lib/useCameraStatus.ts`.

Isto substitui o esquema anterior, em que cada `CameraCard` perguntava
diretamente ao backend a cada 1,5 segundos (`GET .../stream` +
`GET .../buffer`, por câmara) — com N câmaras abertas, eram N × 2 pedidos
HTTP a cada 1,5s, sempre, mesmo sem nada ter mudado. Com o WebSocket, o
custo de ler o `.m3u8` de cada câmara passa a ser pago uma única vez por
tick, partilhado por todos os clientes ligados, e as mudanças de estado
chegam ao ecrã mais depressa.

## 16. Gravação automática

Já não existe um botão "Guardar" manual: enquanto uma câmara está a
transmitir (stream "a correr"), o FFmpeg grava automaticamente e em
contínuo os últimos 20 minutos dessa câmara, divididos em 4 ficheiros
`.mp4` de 5 minutos cada, com rotação automática dos mais antigos.

**Como é gerado (um único encode, duas saídas)** — `stream_manager.py`
monta o comando FFmpeg com o muxer `tee` (`-f tee -map 0:v`), que permite
ao mesmo passo de codificação (seja `-c:v copy`, quando a câmara já produz
H.264, seja transcodificação para H.264 nas restantes) alimentar em
simultâneo:

1. a saída HLS já existente (`stream.m3u8` + segmentos `.ts`, para o
   vídeo ao vivo/buffer — secção 5);
2. uma nova saída com o muxer `segment` e `-strftime 1`, que grava
   ficheiros `.mp4` nomeados com a hora real a que cada um começou
   (`backend/storage/recordings/<camera_id>/AAAAMMDD_HHMMSS.mp4`), a
   cada `RECORDING_SEGMENT_SECONDS` (300s = 5 min, `backend/config/settings.py`).

Isto tem o custo de CPU de **um único encode**, não dois — não há
transcodificação em duplicado só para a gravação.

**Cortes limpos aos 5 minutos** — tanto o HLS como o `segment` muxer só
conseguem cortar um ficheiro num keyframe existente. Em modo `-c:v copy`
(câmara já H.264), os cortes ficam ao sabor dos keyframes que a própria
câmara gerar — uma limitação pré-existente, igual à do buffer HLS. Em modo
transcodificação, o `-force_key_frames` que já existia para o HLS
(alinhado a `SEGMENT_SECONDS`) força um keyframe a cada 300 segundos
também, porque 300 é um múltiplo exato desse intervalo — não foi preciso
nenhuma expressão de keyframes adicional só para a gravação.

**Rotação e limpeza** — `backend/services/recording_manager.py` corre em
segundo plano (`cleanup_loop`, arrancado no `lifespan` do `main.py`, a cada
`CLEANUP_INTERVAL_SECONDS` = 10s) e mantém por câmara apenas os
`RECORDING_SEGMENTS_TO_KEEP + 1` ficheiros mais recentes (5, não 4),
apagando os restantes. A margem de +1 existe para nunca haver risco de
apagar um ficheiro que o FFmpeg ainda esteja a escrever nesse preciso
momento — só o quinto ficheiro mais antigo (já garantidamente fechado) é
removido. Além deste ciclo periódico, a mesma limpeza (`cleanup_once()`) é
também forçada de imediato: uma vez no arranque do backend (`main.py`,
antes do ciclo arrancar) e sempre que uma câmara (re)arranca o stream
(`services/camera_manager.start_stream`) — sem isto, vários
arranques/paragens seguidos da mesma câmara num intervalo curto (comum
durante testes) podiam deixar acumular mais ficheiros do que o previsto
até ao próximo tick do ciclo.

**Ao remover uma câmara** (`DELETE /api/cameras/{id}`,
`services/camera_manager.remove_camera`), as suas gravações guardadas
(`storage/recordings/<camera_id>/`), o buffer HLS temporário
(`storage/buffer/<camera_id>/`) e o ficheiro de log
(`storage/logs/camera_<camera_id>.log`) são apagados automaticamente —
sem essa câmara configurada, esse id deixa de aparecer em qualquer lado
da interface e estes ficheiros nunca mais seriam acessíveis nem geridos
por ninguém.

**No frontend**, a página "Gravações" (`frontend/src/pages/Recordings.tsx`,
via `GET /api/recordings` e `GET /api/cameras`) mostra uma lista/tabela
**separada por câmara**, com o cabeçalho a usar o nome dado à câmara no
formulário (a "identificação do trampolim", ex.: "Trampolim 1") — em vez
de uma tabela única com as gravações de todas as câmaras misturadas.
Câmaras sem gravações ainda aparecem (com uma mensagem "Ainda não há
gravações desta câmara"), para não parecer que falta alguma. Cada linha
mostra o início, o tamanho e um botão "Transferir" para descarregar o
ficheiro (`GET /recordings/{camera_id}/{ficheiro}.mp4`, ficheiros
estáticos), com um nome de ficheiro mais descritivo (nome da câmara +
timestamp) do que o nome em disco. Em desenvolvimento,
`frontend/vite.config.ts` faz proxy de `/recordings` para o backend (tal
como já fazia para `/api` e `/streams`) — sem isto o download dava 404,
por o pedido ficar só no servidor do Vite.

## 17. Roadmap

Por ordem de prioridade previsível:

- **Múltiplas câmaras em simultâneo em produção** — validar desempenho
  com mais do que uma câmara a transcodificar ao mesmo tempo num
  Raspberry Pi real.
- **Análise avançada** — reprodução frame-a-frame, marcação de
  início/fim de um salto, exportação de vídeo.

## 18. Autoria e licença

CamTramp é desenvolvido por **Ricardo Amorim**.

Este é um projeto open source, distribuído sob a [licença MIT](LICENSE) —
pode ser usado, copiado, modificado e distribuído livremente, desde que se
mantenha o aviso de copyright e a licença original (ver o ficheiro
`LICENSE` para o texto completo).

Os mesmos créditos aparecem também, em pequeno, no rodapé da interface (visível em
todas as páginas).

