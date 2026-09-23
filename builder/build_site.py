"""GitHub Pages build: approved content only. No source accounts or private state."""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'builder'))
from sabre.static_export import export_site

if __name__ == '__main__':
    output = ROOT / '_site'
    if output.exists():
        shutil.rmtree(output)
    export_site(ROOT / 'content', output)
