# Sistema de Análise de Vídeo com Buffer

## 1. Objetivo

Desenvolver um sistema que permita:

- Adicionar várias câmaras IP/RTSP.
- Dar um **nome identificativo** a cada câmara.
- Configurar o **URL RTSP**.
- Definir o tamanho do **buffer de vídeo** (ex.: 10, 30, 60 ou 120 segundos).
- Visualizar o vídeo em direto.
- Recuar no vídeo para analisar uma execução.
- Manter continuamente os últimos `X` segundos.
- Guardar uma execução quando o treinador considerar que é necessário.
- Aceder ao sistema através de um navegador Web.
- Funcionar numa rede local, sem necessidade de Internet.

---

## 2. Arquitectura do Sistema

A arquitectura é dividida em três componentes principais:

```text
                         REDE WI-FI
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Câmara 1 │   │ Câmara 2 │   │ Câmara 3 │
        │   RTSP   │   │   RTSP   │   │   RTSP   │
        └─────┬────┘   └─────┬────┘   └─────┬────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                             ▼
                 ┌─────────────────────┐
                 │     Raspberry Pi    │
                 │                     │
                 │ ┌─────────────────┐ │
                 │ │ RTSP Manager    │ │
                 │ └────────┬────────┘ │
                 │          │          │
                 │ ┌────────▼────────┐ │
                 │ │ Video Buffer    │ │
                 │ └────────┬────────┘ │
                 │          │          │
                 │ ┌────────▼────────┐ │
                 │ │ Backend API     │ │
                 │ └────────┬────────┘ │
                 │          │          │
                 │ ┌────────▼────────┐ │
                 │ │ Web Server      │ │
                 │ └─────────────────┘ │
                 └──────────┬──────────┘
                            │
                       HTTP / WebSocket
                            │
                            ▼
                  ┌──────────────────┐
                  │ PC / Tablet      │
                  │ Telemóvel        │
                  │                  │
                  │ Interface Web    │
                  └──────────────────┘
```

---

## 3. Funcionamento do Buffer

O sistema mantém continuamente apenas uma janela temporal do vídeo.

Por exemplo, com um buffer de **30 segundos**:

```text
             BUFFER = 30 segundos

        passado                         presente
           │                               │
           ▼                               ▼
     ┌─────────────────────────────────────────┐
     │  -30s          -20s       -10s       0s │
     │   vídeo         vídeo       vídeo   LIVE│
     └─────────────────────────────────────────┘
                         ▲
                         │
                  execução do salto
```

Quando chegam novos frames, os mais antigos são eliminados.

Por exemplo:

```text
Frame 301
Frame 302
Frame 303
...
Frame 900
```

Quando chega um novo frame:

```text
Frame 901
```

o frame mais antigo deixa de fazer parte do buffer.

### Exemplo

Configuração:

```text
Câmara: Trampolim 1
Buffer: 30 segundos
FPS: 25
```

Número aproximado de frames:

```text
30 × 25 = 750 frames
```

---

## 4. Estratégia de Implementação do Buffer

Em vez de manter todos os frames directamente em memória RAM, o sistema deverá utilizar **FFmpeg** para criar pequenos segmentos de vídeo.

Exemplo:

```text
camera1/
    segment_001.ts
    segment_002.ts
    segment_003.ts
    ...
```

Cada segmento poderá ter, por exemplo, 2 segundos.

Para um buffer de 30 segundos:

```text
segment_001  0-2s
segment_002  2-4s
segment_003  4-6s
...
segment_015 28-30s
```

Quando for criado:

```text
segment_016
```

o sistema elimina:

```text
segment_001
```

Desta forma, o espaço ocupado pelo buffer permanece aproximadamente constante.

---

# 5. Tecnologias

## 5.1 Backend

### Python + FastAPI

O backend será desenvolvido em **Python**, utilizando o **FastAPI** para disponibilizar a API REST.

Tecnologias principais:

```text
Python
FastAPI
FFmpeg
SQLite
```

### API

Exemplo de endpoints:

```text
GET    /api/cameras
POST   /api/cameras
PUT    /api/cameras/{id}
DELETE /api/cameras/{id}

GET    /api/cameras/{id}/stream
GET    /api/cameras/{id}/buffer

POST   /api/cameras/{id}/record
DELETE /api/cameras/{id}/record
```

---

## 5.2 FFmpeg

O FFmpeg será responsável pelo processamento dos streams RTSP.

Fluxo:

```text
Câmara
   │
   │ RTSP
   ▼
 FFmpeg
   │
   ├── Processamento
   ├── Segmentação
   └── Buffer
```

O FFmpeg será utilizado para:

- Receber o stream RTSP.
- Processar o vídeo.
- Criar segmentos.
- Manter o buffer.
- Gerar o stream utilizado pelo frontend.
- Criar gravações permanentes.

---

## 5.3 Base de Dados

Será utilizada **SQLite** para armazenar a configuração das câmaras.

Não é necessário utilizar PostgreSQL numa primeira versão.

### Estrutura

```text
cameras

id
name
rtsp_url
buffer_seconds
enabled
created_at
```

Exemplo:

```text
1 | Trampolim 1 | rtsp://192.168.1.230:554/0 | 30 | true
2 | Trampolim 2 | rtsp://192.168.1.231:554/0 | 60 | true
3 | Trampolim 3 | rtsp://192.168.1.232:554/0 | 30 | true
```

---

# 6. Backend

Estrutura recomendada:

```text
backend/
│
├── main.py
│
├── api/
│   ├── cameras.py
│   ├── buffer.py
│   └── recordings.py
│
├── services/
│   ├── camera_manager.py
│   ├── stream_manager.py
│   ├── buffer_manager.py
│   └── recording_manager.py
│
├── models/
│   └── camera.py
│
├── database/
│   └── database.py
│
└── config/
    └── settings.py
```

### Camera Manager

Responsável por:

- Adicionar câmaras.
- Remover câmaras.
- Iniciar streams.
- Parar streams.
- Verificar o estado das câmaras.

### Buffer Manager

Responsável por:

- Criar o buffer.
- Controlar a duração.
- Eliminar segmentos antigos.
- Disponibilizar o vídeo passado.

### Recording Manager

Responsável por guardar uma parte do buffer como uma gravação permanente.

Exemplo:

```text
Treinador carrega "Guardar"

        ↓

Buffer:
-10s ──────────────── 0s
       execução

        ↓

Guardar

        ↓

salto_2026-08-29_13-30-12.mp4
```

---

# 7. Frontend

O frontend será desenvolvido com:

```text
React
TypeScript
Vite
CSS / Tailwind
WebSocket
```

O React será responsável pela interface Web utilizada pelo treinador.

## Interface Principal

```text
┌─────────────────────────────────────────────────┐
│              VIDEO CONTROL CENTER               │
├─────────────────────────────────────────────────┤
│                                                 │
│  Câmaras                                        │
│                                                 │
│  ┌─────────────────┐  ┌─────────────────┐      │
│  │ Trampolim 1     │  │ Trampolim 2     │      │
│  │                 │  │                 │      │
│  │    LIVE VIDEO   │  │    LIVE VIDEO   │      │
│  │                 │  │                 │      │
│  └─────────────────┘  └─────────────────┘      │
│                                                 │
│  ◀ 30s ─────────────●────────────── LIVE ▶     │
│                                                 │
│  [⏮] [▶] [⏸] [⏭]       [GUARDAR]              │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

# 8. Página de Configuração

A interface deverá permitir configurar cada câmara.

```text
┌──────────────────────────────────────────────┐
│ CONFIGURAÇÃO DAS CÂMARAS                     │
├──────────────────────────────────────────────┤
│                                              │
│ Nome                                         │
│ [ Trampolim 1                         ]      │
│                                              │
│ URL RTSP                                     │
│ [ rtsp://192.168.1.230:554/0          ]      │
│                                              │
│ Buffer                                       │
│ [ 30 ] segundos                              │
│                                              │
│              [ TESTAR ] [ GUARDAR ]          │
│                                              │
└──────────────────────────────────────────────┘
```

---

# 9. Comunicação entre Frontend e Backend

## REST API

A API REST será utilizada para operações de configuração e gestão.

```text
React
  │
  │ HTTP
  ▼
FastAPI
  │
  ▼
SQLite
```

Será utilizada para:

- Consultar câmaras.
- Adicionar câmaras.
- Alterar configurações.
- Remover câmaras.
- Configurar o buffer.
- Iniciar/parar gravações.

## WebSocket

O WebSocket poderá ser utilizado para informação em tempo real.

Exemplo:

```text
FastAPI
   │
   │ WebSocket
   ▼
React
```

Permite apresentar informações como:

```text
Câmara 1: ONLINE
Câmara 2: ONLINE
Câmara 3: OFFLINE
```

---

# 10. Streaming para o Browser

Os browsers não suportam RTSP directamente de forma nativa.

Por isso, será necessário converter o stream.

### Primeira versão

Utilizar **HLS**:

```text
RTSP
 │
 ▼
FFmpeg
 │
 ▼
HLS
 │
 ▼
Browser
```

### Versão futura

Para reduzir a latência poderá ser utilizado **WebRTC**:

```text
RTSP
 │
 ▼
FFmpeg
 │
 ▼
WebRTC
 │
 ▼
Browser
```

A primeira implementação deverá utilizar HLS devido à sua maior simplicidade.

---

# 11. Armazenamento

Recomenda-se utilizar um **SSD USB 3.0** ligado ao Raspberry Pi.

Estrutura:

```text
SSD
 │
 └── /video-buffer/
        │
        ├── camera1/
        ├── camera2/
        └── camera3/
```

O Raspberry Pi deverá utilizar o SSD para:

- Buffer temporário.
- Gravações permanentes.
- Vídeos guardados.

O cartão microSD deverá ser utilizado principalmente para o sistema operativo.

---

# 12. Requisitos de Hardware

## Raspberry Pi

Recomendado:

```text
Raspberry Pi 5
8 GB RAM
```

O número de câmaras e a resolução/FPS dos streams poderão alterar os requisitos de processamento.

## Armazenamento

Recomendado:

```text
SSD USB 3.0
256 GB ou 512 GB
```

## Rede

Arquitectura recomendada:

```text
Câmaras Wi-Fi
       │
       ▼
     Router
       │
    Ethernet
       │
       ▼
 Raspberry Pi
```

Sempre que possível, o Raspberry Pi deverá estar ligado por **Ethernet** ao router/switch.

---

# 13. Requisitos de Software

No Raspberry Pi:

```text
Raspberry Pi OS 64-bit
Python 3
FastAPI
Uvicorn
FFmpeg
SQLite
Node.js
React
TypeScript
```

Opcional:

```text
Docker
Nginx
```

Numa primeira versão, recomenda-se não utilizar Docker, de forma a manter o sistema mais simples durante o desenvolvimento e testes.

---

# 14. Funcionalidades

## V1 — MVP

Primeira versão funcional:

```text
✓ Adicionar câmara
✓ Nomear câmara
✓ Definir URL RTSP
✓ Testar ligação
✓ Visualizar vídeo
✓ Configurar buffer
✓ Reproduzir buffer
```

## V2 — Gestão de Vídeo

```text
✓ Suporte para várias câmaras
✓ Guardar execução
✓ Histórico de execuções
✓ Eliminar gravações
✓ Estado das câmaras
✓ Interface melhorada
```

## V3 — Análise

```text
✓ Sincronização entre câmaras
✓ Reprodução simultânea
✓ Slow motion
✓ Reprodução frame-by-frame
✓ Marcação do início/fim do salto
✓ Exportação de vídeos
```

## V4 — Computer Vision

Numa fase posterior, o sistema poderá incorporar técnicas de visão computacional:

```text
Vídeo
  │
  ▼
Computer Vision
  │
  ├── Detecção do atleta
  ├── Tracking
  ├── Altura do salto
  ├── Rotação
  └── Análise técnica
```

---

# 15. Stack Tecnológica Final

| Componente | Tecnologia |
|---|---|
| Hardware | Raspberry Pi 5 8 GB |
| Armazenamento | SSD USB 3.0 |
| Sistema Operativo | Raspberry Pi OS 64-bit |
| Protocolo das câmaras | RTSP |
| Processamento de vídeo | FFmpeg |
| Buffer | FFmpeg + segmentos |
| Backend | Python |
| API | FastAPI |
| Base de dados | SQLite |
| Frontend | React |
| Linguagem frontend | TypeScript |
| Build frontend | Vite |
| Streaming Web | HLS |
| Comunicação em tempo real | WebSocket |
| Reverse Proxy | Nginx, opcional |
| Containerização | Docker, opcional |

---

# 16. Arquitectura Final

```text
                         ┌───────────────┐
                         │ CÂMARA 1      │
                         │ RTSP          │
                         └───────┬───────┘
                                 │
                         ┌───────▼───────┐
                         │ CÂMARA 2      │
                         │ RTSP          │
                         └───────┬───────┘
                                 │
                         ┌───────▼───────┐
                         │ CÂMARA N      │
                         │ RTSP          │
                         └───────┬───────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │     RASPBERRY PI 5     │
                    │                        │
                    │       FFmpeg           │
                    │          │             │
                    │    ┌─────▼─────┐       │
                    │    │   BUFFER  │       │
                    │    └─────┬─────┘       │
                    │          │             │
                    │    ┌─────▼─────┐       │
                    │    │  FastAPI  │       │
                    │    └─────┬─────┘       │
                    │          │             │
                    │    ┌─────▼─────┐       │
                    │    │  SQLite   │       │
                    │    └───────────┘       │
                    │                        │
                    │       SSD USB          │
                    └───────────┬────────────┘
                                │
                         HTTP / WebSocket
                                │
                 ┌──────────────┼──────────────┐
                 ▼              ▼              ▼
              ┌─────┐       ┌───────┐       ┌─────┐
              │ PC  │       │ Tablet│       │Phone│
              └─────┘       └───────┘       └─────┘
                                │
                                ▼
                     ┌──────────────────┐
                     │ INTERFACE WEB    │
                     │                  │
                     │ Câmara           │
                     │ Live             │
                     │ Buffer           │
                     │ Replay           │
                     │ Guardar          │
                     └──────────────────┘
```

---

# 17. Primeira Implementação

O desenvolvimento deverá começar com **uma única câmara**, utilizando o stream RTSP:

```text
rtsp://192.168.1.230:554/0
```

A primeira versão deverá implementar:

```text
Câmara RTSP
      │
      ▼
    FFmpeg
      │
      ▼
 Buffer de 30 segundos
      │
      ▼
   FastAPI
      │
      ▼
 Interface React
```

Depois de validar o funcionamento do buffer e da reprodução, deverá ser acrescentado o suporte para várias câmaras.

Esta abordagem permite reduzir a complexidade inicial e validar primeiro o componente mais importante do sistema: **receber o vídeo, manter os últimos X segundos e permitir ao utilizador rever a execução**.