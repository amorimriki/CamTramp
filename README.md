# CamTramp

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
| Buffer contínuo com janela deslizante (fixo, 5 min, para todas as câmaras) | ✅ |
| Recuar no vídeo dentro da janela do buffer | ✅ (barra do próprio `<video>`) |
| Arranque automático do streaming ao ligar o servidor | ✅ |
| Descoberta automática de câmaras na rede local (nmap) | ✅ |
| Acesso a partir de outro dispositivo na rede (IP local + código QR) | ✅ |
| Arranque automático da aplicação e do browser no login (Linux) | ✅ |
| Múltiplas câmaras em simultâneo | ✅ (testado com uma; a arquitetura suporta várias) |
| Guardar uma execução como ficheiro permanente | ❌ por implementar (botão "Guardar" desativado no frontend) |
| Estado em tempo real via WebSocket | ❌ por implementar (usa-se polling HTTP) |
| Reprodução sincronizada entre câmaras, slow motion, análise por visão computacional | ❌ ideias para versões futuras (ver secção 15) |

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
     • descoberta de câmaras na rede local (nmap) e deteção do IP local
     • guarda a configuração em backend/database/db.json
        │
        ▼
   React + hls.js (frontend/)
     • Dashboard: grelha com o vídeo ao vivo de cada câmara
     • Configuração: CRUD de câmaras + descoberta automática na rede
     • Cabeçalho: IP local + código QR para abrir a app noutro dispositivo
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
| Comunicação frontend ↔ backend | REST HTTP (polling a cada 1,5s para estado/buffer) |

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
│   │   ├── system.py                # IP local desta máquina (para o código QR)
│   │   ├── discovery.py             # descoberta de câmaras na rede local (nmap)
│   │   └── recordings.py            # stub — por implementar
│   ├── services/
│   │   ├── camera_manager.py        # ciclo de vida das câmaras (start_all_enabled, etc.)
│   │   ├── stream_manager.py        # processos FFmpeg: deteção de codec, comando HLS
│   │   ├── buffer_manager.py        # lê o .m3u8 → resumo do buffer disponível
│   │   ├── discovery.py             # varredura nmap + deteção do IP local
│   │   └── recording_manager.py     # stub — por implementar
│   ├── models/camera.py             # modelos Pydantic (validação de rtsp_url, ...)
│   ├── database/
│   │   ├── database.py              # leitura/escrita atómica do JSON, com lock
│   │   └── db.json                  # dados reais — não versionado
│   ├── config/settings.py           # caminhos, duração fixa do buffer, largura máx. de transcode
│   └── storage/                     # buffer HLS + logs do FFmpeg — não versionado
│       ├── buffer/<camera_id>/       # stream.m3u8 + segment_XXXXX.ts
│       ├── logs/camera_<id>.log      # stdout/stderr do FFmpeg dessa câmara
│       └── recordings/               # (por usar)
└── frontend/
    └── src/
        ├── api.ts                    # cliente HTTP para o backend
        ├── types.ts                  # tipos TS espelhando os modelos do backend
        ├── lib/qrcode.ts              # encoder de códigos QR (usa vendor/qrcode-core)
        ├── vendor/qrcode-core/        # adaptação ES modules do codificador "core" do pacote npm "qrcode"
        ├── components/
        │   ├── CameraCard.tsx         # vídeo (hls.js), fase de carregamento, buffer, ligar/parar
        │   ├── CameraForm.tsx         # criar/editar câmara + descoberta na rede local
        │   ├── QrCode.tsx             # renderiza um código QR como SVG inline
        │   └── NetworkAccess.tsx      # mostra o IP local + código QR no cabeçalho
        └── pages/
            ├── Dashboard.tsx          # grelha de câmaras (ecrã principal)
            └── Settings.tsx           # tabela de configuração das câmaras
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
   `BUFFER_SECONDS` é fixo (5 minutos) para todas as câmaras — deixou de
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
| `BUFFER_SECONDS` | 300 (5 min) | Duração fixa do buffer, igual para todas as câmaras |
| `SEGMENT_SECONDS` | 2 | Duração de cada segmento HLS |
| `MAX_TRANSCODE_WIDTH` | 1280 | Largura máx. ao transcodificar HEVC → H.264 |

Não existem ficheiros de segredos/`.env` — o único dado sensível é o URL
RTSP de cada câmara (pode incluir utilizador/palavra-passe), guardado só
em `backend/database/db.json`, que **não é versionado** (ver secção 12).

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
   depois abre o browser por omissão (`xdg-open`, com fallback para
   `chromium-browser`/`chromium`/`firefox`) apontado a esse URL — evita
   abrir o browser antes do backend/frontend estarem prontos.

Instalação (no próprio Raspberry Pi/máquina Linux, como utilizador normal,
sem `sudo`):

```bash
./scripts/install-autostart.sh
```

O script também ativa `loginctl enable-linger` para o utilizador atual,
para o serviço arrancar mesmo sem sessão gráfica interativa (ex.:
Raspberry Pi com autologin em consola).

Para desinstalar: `./scripts/uninstall-autostart.sh`.

Úteis depois de instalado:

```bash
systemctl --user status camtramp.service     # estado do serviço
journalctl --user -u camtramp.service -f     # logs em direto
```

Este arranque automático é específico de Linux/systemd (pensado para o
Raspberry Pi de implantação, ver secção 14); em macOS continua a usar-se
`./start.sh` manualmente durante o desenvolvimento.

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

GET    /api/system/network             # IP local desta máquina (para o código QR)
GET    /api/discovery/scan             # varre a rede local (nmap) por câmaras RTSP

GET    /streams/{id}/stream.m3u8       # playlist HLS (ficheiros estáticos)
GET    /api/health                     # health check
GET    /docs                           # Swagger UI (documentação interativa)
```

## 12. Armazenamento e dados

- `backend/database/db.json` e `backend/storage/` **não são versionados**
  (ver `.gitignore`) — contêm dados reais (URLs RTSP, incluindo eventuais
  credenciais) e ficheiros gerados pelo FFmpeg. Um checkout novo do
  repositório começa sem câmaras configuradas.
- Cada câmara tem o seu log de FFmpeg em
  `backend/storage/logs/camera_<id>.log`, útil para diagnosticar problemas
  de ligação/descodificação (ver secção 13).
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

## 14. Hardware recomendado (implantação num Raspberry Pi)

| Componente | Recomendação |
|---|---|
| Raspberry Pi | Pi 5, 8 GB RAM |
| Armazenamento | SSD USB 3.0, 256–512 GB, para `backend/storage/` |
| Rede | Raspberry Pi ligado por **Ethernet** ao router/switch sempre que possível; câmaras podem ficar em Wi-Fi |
| Sistema operativo | Raspberry Pi OS 64-bit (com ambiente gráfico, para o arranque automático do browser — secção 10) |

O número de câmaras e a resolução/FPS de cada stream têm impacto direto no
uso de CPU, sobretudo quando é preciso transcodificar (câmaras HEVC).

## 15. Roadmap

Por ordem de prioridade previsível:

- **Gravação de execuções** — implementar `recording_manager.py`/`api/recordings.py`
  para guardar um excerto do buffer como `.mp4` permanente (o botão
  "Guardar" já existe no frontend, só desativado).
- **Estado em tempo real via WebSocket**, para substituir o polling atual
  e reduzir a latência da informação de estado (câmara online/offline).
- **Múltiplas câmaras em simultâneo em produção** — validar desempenho
  com mais do que uma câmara a transcodificar ao mesmo tempo num
  Raspberry Pi real.
- **Análise avançada** — reprodução sincronizada entre câmaras, slow
  motion, reprodução frame-a-frame, marcação de início/fim de um salto,
  exportação de vídeo.
- **Visão computacional** — deteção/tracking do atleta, altura do salto,
  rotação, análise técnica automática.
