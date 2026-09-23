"""Immutable source schedule, separate from live project estimates and demo tasks."""
import json
from pathlib import Path
from functools import lru_cache

@lru_cache(maxsize=1)
def source_roadmap():
    return json.loads((Path(__file__).parent/'data/roadmap.json').read_text())
