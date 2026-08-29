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

# Valores por omissão / limites para o buffer de uma câmara
DEFAULT_BUFFER_SECONDS = 30
MIN_BUFFER_SECONDS = 10
MAX_BUFFER_SECONDS = 120

# Duração de cada segmento HLS/FFmpeg (ver README secção 4)
SEGMENT_SECONDS = 2
