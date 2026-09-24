"""Export only explicitly public data for static hosting; never reads private state."""
import argparse
import json
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from .public import public_content, public_roadmap, period_summaries, shared_file


def export_site(shared, output, today=None, days=90):
    today = today or datetime.now(ZoneInfo('America/New_York')).date()
    if not 1 <= days <= 366:
        raise ValueError('History must be between 1 and 366 days')
    output = Path(output)
    if output.exists():
        raise ValueError('Output already exists; choose a new output folder')
    content = public_content(shared)
    output.mkdir(parents=True)
    assets = Path(__file__).parent / 'static'
    html = (assets / 'public.html').read_text().replace('href="/app.css"', 'href="./app.css"').replace('src="/public.js"', 'src="./public.js"').replace('"/logo.svg"', '"./logo.svg"').replace('<body class=', '<body data-static="true" class=')
    (output / 'index.html').write_text(html)
    for name in ('app.css', 'public.js', 'logo.svg'):
        shutil.copyfile(assets / name, output / name)
    (output / '.nojekyll').touch()
    (output / 'files').mkdir()
    for resource in content['resources']:
        if not resource['url']:
            source = shared_file(shared, resource['id'])
            # Static hosts cannot apply attachment headers; never serve active uploads as HTML/SVG/JS.
            suffix = source.suffix.lower()
            safe_suffixes = {'.pdf','.png','.jpg','.jpeg','.gif','.webp','.txt','.csv','.json','.zip','.docx','.xlsx','.pptx'}
            filename = resource['id'] + (suffix if suffix in safe_suffixes else '.bin')
            shutil.copyfile(source, output / 'files' / filename)
            resource['download_url'] = './files/' + filename
    start = today - timedelta(days=days-1)
    snapshot = dict(overview=content, roadmap=public_roadmap(), today=today.isoformat(), selected_date=today.isoformat(), static_range={'start':start.isoformat(), 'finish':today.isoformat()}, periods=period_summaries(content,today,today))
    def write(path, value):
        path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))
    write(output / 'snapshot.json', snapshot)
    (output / 'recaps').mkdir()
    for i in range(days):
        day = start + timedelta(days=i)
        write(output / 'recaps' / (day.isoformat()+'.json'), period_summaries(content,day,today))
    return output


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shared',default='shared')
    parser.add_argument('--output',required=True)
    parser.add_argument('--days',type=int,default=90)
    args=parser.parse_args()
    print(export_site(args.shared,args.output,days=args.days))

if __name__=='__main__':main()
