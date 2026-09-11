"""
Configurações globais da aplicação.

Nesta primeira fase o "storage" de configuração é feito num ficheiro
JSON (ver backend/database/database.py) em vez de SQLite, pelo que
este módulo apenas centraliza caminhos e valores por omissão, para
que possam ser alterados num único sítio.
"""

from pathlib import Path

# Diretoria raiz do backend (.../backend)
BASE_DIR = Path(__file__).resolve().parent.parent

# Diretoria raiz do projeto (a acima de backend/) e a pasta scripts/ lá
# dentro (install-autostart.sh, uninstall-autostart.sh, open-browser.sh —
# ver README secção 10 e backend/api/system.py, que os corre a pedido da
# interface).
PROJECT_DIR = BASE_DIR.parent
SCRIPTS_DIR = PROJECT_DIR / "scripts"

# Ficheiro JSON usado como "base de dados" (câmaras, gravações, etc.)
DATA_DIR = BASE_DIR / "database"
DB_FILE = DATA_DIR / "db.json"

# Diretorias onde ficam os ficheiros de vídeo geridos pelo FFmpeg
STORAGE_DIR = BASE_DIR / "storage"
BUFFER_DIR = STORAGE_DIR / "buffer"          # segmentos temporários do buffer
RECORDINGS_DIR = STORAGE_DIR / "recordings"  # gravações permanentes ("saltos" guardados)
LOGS_DIR = STORAGE_DIR / "logs"              # logs dos processos FFmpeg, por câmara

# Duração do buffer de vídeo mantido por câmara. Deixou de ser configurável
# por câmara (era 10-120s, ajustável no formulário) — fica fixo em 8 minutos
# para todas as câmaras, para simplificar a operação do sistema.
BUFFER_SECONDS = 480  # 8 minutos

# Duração de cada segmento HLS/FFmpeg (ver README secção 4)
SEGMENT_SECONDS = 2

# Gravações automáticas e permanentes (ver README secção "Gravações
# automáticas"): em vez de um botão manual de "Guardar", o FFmpeg escreve
# sempre, em paralelo com o buffer HLS, ficheiros .mp4 de
# RECORDING_SEGMENT_SECONDS, com o nome a refletir o timestamp de início
# de cada um. Só se mantêm os últimos RECORDING_SEGMENTS_TO_KEEP ficheiros
# por câmara (rotação feita por services/recording_manager.py, já que o
# ffmpeg não sabe rodar ficheiros com nome por timestamp sozinho).
#
# TEM de ser múltiplo de SEGMENT_SECONDS: os keyframes forçados para o HLS
# (a cada SEGMENT_SECONDS, ver stream_manager._video_codec_args) só
# permitem cortes limpos nas gravações se calharem exatamente nos mesmos
# instantes — 300 é múltiplo de 2, por isso não é preciso forçar
# keyframes uma segunda vez só para as gravações.
RECORDING_SEGMENT_SECONDS = 300  # 5 minutos por ficheiro
RECORDING_SEGMENTS_TO_KEEP = 4   # 4 x 5 min = últimos 20 minutos guardados

# Binário do FFmpeg (ajustar se não estiver no PATH)
FFMPEG_BINARY = "ffmpeg"
FFPROBE_BINARY = "ffprobe"  # usado para testar a ligação a uma câmara sem arrancar o buffer

# Ao transcodificar (câmaras que não enviam H.264 nativo — ver
# stream_manager.py), limita a largura do vídeo para poupar CPU: o custo de
# descodificar+codificar cresce com o nº de pixels, e para rever um salto
# num ecrã de treino 1280px de largura já chega. Reduzir isto ajuda mais o
# desempenho do que baixar o preset do encoder sozinho.
MAX_TRANSCODE_WIDTH = 1280

# Password pedida antes de reiniciar/parar a aplicação ou repor a base de
# dados e os logs (ver backend/api/system.py e Definições no frontend) —
# uma proteção simples contra alguém carregar sem querer num destes botões
# num ecrã partilhado no ginásio, não uma autenticação real (não há
# utilizadores nem sessões nesta aplicação, e o pedido HTTP não é
# encriptado à parte do que a rede local já for). Não sensível ao domínio
# de negócio, mas evita-se guardar em git um valor fácil de mudar sem
# querer — se for preciso trocar, é só editar esta linha.
ADMIN_ACTION_PASSWORD = "Tr@mpolinsaae"
