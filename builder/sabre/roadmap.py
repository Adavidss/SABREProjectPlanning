"""Immutable source schedule, separate from live project estimates and demo tasks."""
import json
from pathlib import Path
from functools import lru_cache

@lru_cache(maxsize=1)
def source_roadmap():
    return json.loads((Path(__file__).parent/'data/roadmap.json').read_text())


def workstream_names():
    """Workbook sections with expected-window work, named as the website's workstream strip names them."""
    import re
    def solid(fill):
        if not re.fullmatch(r'#[0-9A-Fa-f]{6}',fill or ''):return False
        n=int(fill[1:],16);return .299*(n>>16)+.587*(n>>8&255)+.114*(n&255)<200
    names=[];name=None
    for row in source_roadmap()['rows']:
        if row.get('section'):name=re.split(r'\s{2,}',row['section'])[0].split(' - ')[0].strip();continue
        if name and name not in names and not row.get('parent') and any(solid(c.get('fill')) for c in row.get('cells') or []):names.append(name)
    return names
