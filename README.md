# CamTramp

Sistema de vídeo com buffer/replay para câmaras IP (RTSP), pensado para
treino de trampolim: vídeo ao vivo por câmara, com uma janela contínua dos
últimos minutos disponível para recuar e rever uma execução. Corre
localmente (Raspberry Pi ou um computador na mesma rede), sem depender de
internet.

## 1. Estado do projeto

| Funcionalidade | Estado |
|---|---|
| Adicionar/editar/remover câmaras (nome, URL RTSP, buffer) | ✅ |
| Testar ligação RTSP e detetar o codec de vídeo | ✅ |
| Vídeo ao vivo por câmara (HLS) | ✅ |
| Buffer contínuo com janela deslizante (até 2 min, configurável) | ✅ |
| Recuar no vídeo dentro da janela do buffer | ✅ (barra do próprio `<video>`) |
| Arranque automático do streaming ao ligar o servidor | ✅ |
| Múltiplas câmaras em simultâneo | ✅ (testado com uma; a arquitetura suporta várias) |
| Guardar uma execução como ficheiro permanente | ❌ por implementar (botão "Guardar" desativado no frontend) |
| Estado em tempo real via WebSocket | ❌ por implementar (usa-se polling HTTP) |
| Reprodução sincronizada entre câmaras, slow motion, análise por visão computacional | ❌ ideias para versões futuras (ver secção 10) |

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
     • guarda a configuração em backend/database/db.json
        │
        ▼
   React + hls.js (frontend/)
     • Dashboard: grelha com o vídeo ao vivo de cada câmara
     • Configuração: CRUD de câmaras
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
| Frontend | React 19 + TypeScript + Vite |
| Player de vídeo | hls.js (Safari usa o suporte nativo a HLS) |
| Streaming para o browser | HLS |
| Comunicação frontend ↔ backend | REST HTTP (polling a cada 1,5s para estado/buffer) |

## 4. Estrutura do projeto

```text
CamTramp/
├── start.sh                       # arranca backend + frontend em conjunto
├── backend/
│   ├── main.py                     # FastAPI; lifespan arranca/pára os streams
│   ├── api/
│   │   ├── cameras.py               # CRUD de câmaras + teste de ligação RTSP
│   │   ├── buffer.py                # estado do stream, start/stop, resumo do buffer
│   │   └── recordings.py            # stub — por implementar
│   ├── services/
│   │   ├── camera_manager.py        # ciclo de vida das câmaras (start_all_enabled, etc.)
│   │   ├── stream_manager.py        # processos FFmpeg: deteção de codec, comando HLS
│   │   ├── buffer_manager.py        # lê o .m3u8 → resumo do buffer disponível
│   │   └── recording_manager.py     # stub — por implementar
│   ├── models/camera.py             # modelos Pydantic (validação de buffer_seconds, rtsp_url, ...)
│   ├── database/
│   │   ├── database.py              # leitura/escrita atómica do JSON, com lock
│   │   └── db.json                  # dados reais — não versionado
│   ├── config/settings.py           # caminhos, limites de buffer, largura máx. de transcode
│   └── storage/                     # buffer HLS + logs do FFmpeg — não versionado
│       ├── buffer/<camera_id>/       # stream.m3u8 + segment_XXXXX.ts
│       ├── logs/camera_<id>.log      # stdout/stderr do FFmpeg dessa câmara
│       └── recordings/               # (por usar)
└── frontend/
    └── src/
        ├── api.ts                    # cliente HTTP para o backend
        ├── types.ts                  # tipos TS espelhando os modelos do backend
        ├── components/
        │   ├── CameraCard.tsx         # vídeo (hls.js), fase de carregamento, buffer, ligar/parar
        │   └── CameraForm.tsx         # criar/editar câmara
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
   o número de segmentos mantidos = `buffer_seconds / SEGMENT_SECONDS`, até
   ao limite de `MAX_BUFFER_SECONDS` (120s).
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

```bash
git clone <url-do-repositório> CamTramp
cd CamTramp
./start.sh
```

O `start.sh`:

- verifica as dependências e instala as que faltarem (`pip install -r
  backend/requirements.txt`, `npm install`);
- arranca o backend em `http://localhost:8000` e o frontend em
  `http://localhost:5173` (também acessível na rede local por
  `http://<IP-da-máquina>:5173`);
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

## 7. Configuração

Cada câmara guarda: `name`, `rtsp_url` (tem de começar por `rtsp://`),
`buffer_seconds` (10–120, por omissão 120) e `enabled`. Estes limites e
outros valores por omissão estão centralizados em `backend/config/settings.py`:

| Valor | Por omissão | Descrição |
|---|---|---|
| `DEFAULT_BUFFER_SECONDS` | 120 | Buffer atribuído a uma câmara nova |
| `MIN_BUFFER_SECONDS` / `MAX_BUFFER_SECONDS` | 10 / 120 | Limites aceites pela API |
| `SEGMENT_SECONDS` | 2 | Duração de cada segmento HLS |
| `MAX_TRANSCODE_WIDTH` | 1280 | Largura máx. ao transcodificar HEVC → H.264 |

Não existem ficheiros de segredos/`.env` — o único dado sensível é o URL
RTSP de cada câmara (pode incluir utilizador/palavra-passe), guardado só
em `backend/database/db.json`, que **não é versionado** (ver secção 9).

## 8. API

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

GET    /streams/{id}/stream.m3u8       # playlist HLS (ficheiros estáticos)
GET    /api/health                     # health check
GET    /docs                           # Swagger UI (documentação interativa)
```

## 9. Armazenamento e dados

- `backend/database/db.json` e `backend/storage/` **não são versionados**
  (ver `.gitignore`) — contêm dados reais (URLs RTSP, incluindo eventuais
  credenciais) e ficheiros gerados pelo FFmpeg. Um checkout novo do
  repositório começa sem câmaras configuradas.
- Cada câmara tem o seu log de FFmpeg em
  `backend/storage/logs/camera_<id>.log`, útil para diagnosticar problemas
  de ligação/descodificação (ver secção 10).
- Recomenda-se um SSD (USB 3.0 num Raspberry Pi) para o `storage/`, já que
  o buffer e futuras gravações fazem escrita contínua em disco.

## 10. Fiabilidade e troubleshooting

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

## 11. Hardware recomendado (implantação num Raspberry Pi)

| Componente | Recomendação |
|---|---|
| Raspberry Pi | Pi 5, 8 GB RAM |
| Armazenamento | SSD USB 3.0, 256–512 GB, para `backend/storage/` |
| Rede | Raspberry Pi ligado por **Ethernet** ao router/switch sempre que possível; câmaras podem ficar em Wi-Fi |
| Sistema operativo | Raspberry Pi OS 64-bit |

O número de câmaras e a resolução/FPS de cada stream têm impacto direto no
uso de CPU, sobretudo quando é preciso transcodificar (câmaras HEVC).

## 12. Roadmap

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
