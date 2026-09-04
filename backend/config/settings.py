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

# Ficheiro JSON usado como "base de dados" (câmaras, gravações, etc.)
DATA_DIR = BASE_DIR / "database"
DB_FILE = DATA_DIR / "db.json"

# Diretorias onde ficam os ficheiros de vídeo geridos pelo FFmpeg
STORAGE_DIR = BASE_DIR / "storage"
BUFFER_DIR = STORAGE_DIR / "buffer"          # segmentos temporários do buffer
RECORDINGS_DIR = STORAGE_DIR / "recordings"  # gravações permanentes ("saltos" guardados)
LOGS_DIR = STORAGE_DIR / "logs"              # logs dos processos FFmpeg, por câmara

# Duração do buffer de vídeo mantido por câmara. Deixou de ser configurável
# por câmara (era 10-120s, ajustável no formulário) — fica fixo em 5 minutos
# para todas as câmaras, para simplificar a operação do sistema.
BUFFER_SECONDS = 300  # 5 minutos

# Duração de cada segmento HLS/FFmpeg (ver README secção 4)
SEGMENT_SECONDS = 2

# Binário do FFmpeg (ajustar se não estiver no PATH)
FFMPEG_BINARY = "ffmpeg"
FFPROBE_BINARY = "ffprobe"  # usado para testar a ligação a uma câmara sem arrancar o buffer

# Ao transcodificar (câmaras que não enviam H.264 nativo — ver
# stream_manager.py), limita a largura do vídeo para poupar CPU: o custo de
# descodificar+codificar cresce com o nº de pixels, e para rever um salto
# num ecrã de treino 1280px de largura já chega. Reduzir isto ajuda mais o
# desempenho do que baixar o preset do encoder sozinho.
MAX_TRANSCODE_WIDTH = 1280
