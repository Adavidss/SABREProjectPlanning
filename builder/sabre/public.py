"""Explicit publication boundary. Never reads private state, notes or connectors."""
import json
import re
from pathlib import Path
from .roadmap import source_roadmap
from .recap import prepare_content
from .library import safe_url


def public_content(directory):
    content=json.loads((Path(directory)/'overview.json').read_text())
    # Copy known fields only: adding a field to a private model cannot expose it.
    result={'title':str(content.get('title','SABRE polarizer')),
            'summary':str(content.get('summary','')),
            'updated':content.get('updated'),
            'source_as_of':content.get('source_as_of'),
            'source_status':str(content.get('source_status','unknown')),
            'coverage':str(content.get('coverage','No source recap has been published yet.')),
            'tasks':[{k:str(t.get(k,'') or '') for k in ('id','title','status','due_date','planned_date','completed_date','task_id','source')} for t in content.get('tasks',[])],
            'recommendations':[{k:str(t.get(k,'') or '') for k in ('text','basis')} for t in content.get('recommendations',[])],
            'source_notes':[{k:str(n.get(k,'') or '') for k in ('id','title','text','updated_at','source')} for n in content.get('source_notes',[])],
            'focus':[str(x) for x in content.get('focus',[])],
            'updates':[{k:str(u.get(k,'') or '') for k in ('date','task_id','title','summary','result','next_step','evidence_ref','kind')} for u in content.get('updates',[])],
            'resources':[{k:str(r.get(k,'')) for k in ('id','title','description','category','url')} for r in content.get('resources',[]) if safe_url(r.get('url')) or (not r.get('url') and shared_file(directory,r.get('id')) is not None)]}
    calendar=content.get('calendar',{})
    if isinstance(calendar,dict):
        identifier=calendar.get('id','')
        if isinstance(identifier,str) and re.fullmatch(r'[A-Za-z0-9_.+@-]{1,254}',identifier):
            from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
            zone=calendar.get('timezone','America/New_York')
            try:ZoneInfo(zone)
            except (ZoneInfoNotFoundError,ValueError,TypeError):zone='America/New_York'
            result['calendar']={'id':identifier,'timezone':zone}
    connections=content.get('source_connections',{})
    result['source_connections']={}
    for name in ('calendar','notion','todoist'):
        value=connections.get(name,{}) if isinstance(connections,dict) else {}
        if not isinstance(value,dict):value={}
        status=value.get('status','not_connected')
        if status not in {'not_connected','pending_credentials','unverified','verified','partial','unavailable'}:status='unverified'
        checked=value.get('checked_at')
        from .recap import iso_day
        checked=checked if isinstance(checked,str) and iso_day(checked) else None
        if status=='verified' and not checked:status='unverified'
        result['source_connections'][name]={'status':status,'checked_at':checked}
    return prepare_content(result)


def shared_file(directory,identifier):
    if not isinstance(identifier,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',identifier):return None
    root=Path(directory).resolve();manifest=json.loads((root/'overview.json').read_text())
    entry=next((r for r in manifest.get('resources',[]) if r.get('id')==identifier),None)
    if not entry:return None
    name=entry.get('file','')
    if not isinstance(name,str) or Path(name).name!=name:return None
    base=(root/'files').resolve();p=(base/name).resolve()
    if base not in p.parents or not p.is_file():return None
    return p


def public_roadmap():
    r=source_roadmap()
    return {'weeks':r['weeks'],'warning':r['warning'],
            'rows':[{k:x[k] for k in ('section','id','title','owner','row','parent','start','finish','cells') if k in x} for x in r['rows']],
            'tasks':[{k:t.get(k) for k in ('ID','Task','Start (expected)','Finish (expected)','Start (pessim.)','Finish (pessim.)','Predecessors')} for t in r['tasks']]}


def period_summaries(content, today, current_day=None):
    """Calendar periods over published evidence; never treats a due date as completion."""
    from datetime import date, timedelta
    from .recap import compose, markdown, prepare_content, iso_day
    content=prepare_content(content)
    current_day=current_day or today
    future_tasks=sum(t.get('status')=='completed' and iso_day(t.get('completed_date')) is not None and iso_day(t.get('completed_date'))>current_day for t in content['tasks'])
    future_updates=sum(iso_day(u.get('date')) is not None and iso_day(u.get('date'))>current_day for u in content['updates'])
    if future_tasks or future_updates:
        content['quality'].append(f'{future_tasks} future-dated completions and {future_updates} future-dated research updates excluded from recorded-work recaps. Check their dates.')
    monday=today-timedelta(days=today.weekday())
    windows={'day':(today,today),'week':(monday,monday+timedelta(days=6)),
             'previous':(monday-timedelta(days=7),monday-timedelta(days=1)),
             'month':(today.replace(day=1),(today.replace(day=28)+timedelta(days=4)).replace(day=1)-timedelta(days=1))}
    def valid(v):
        try:return date.fromisoformat(v) if v else None
        except (ValueError,TypeError):return None
    result={}
    for key,(start,end) in windows.items():
        within=lambda d:bool(valid(d) and start<=valid(d)<=end)
        done=[t for t in content['tasks'] if t['status']=='completed' and within(t['completed_date']) and valid(t['completed_date'])<=current_day]
        open_tasks=[t for t in content['tasks'] if t['status'] in {'open','in_progress','blocked'} and (within(t['due_date']) or within(t['planned_date']))]
        updates=[u for u in content['updates'] if within(u['date']) and valid(u['date'])<=current_day]
        overdue=[t for t in content['tasks'] if t['status'] in {'open','in_progress','blocked'} and valid(t['due_date']) and valid(t['due_date'])<current_day]
        days=[]
        for i in range((end-start).days+1):
            d=(start+timedelta(days=i)).isoformat()
            days.append({'date':d,'completed':[t for t in done if t['completed_date']==d],
                         'planned':[t for t in open_tasks if (t['planned_date'] if within(t['planned_date']) else t['due_date'])==d],
                         'updates':[u for u in updates if u['date']==d]})
        suggestions=[]
        if overdue:suggestions.append({'text':f'Review {len(overdue)} currently unfinished tasks with past due dates; confirm whether to reschedule or close them.','basis':'Published task status and due dates as of the latest source refresh.'})
        unmapped=[t for t in done if not t['task_id']]
        if unmapped:suggestions.append({'text':f'Link {len(unmapped)} completed tasks to original Gantt IDs to make the research recap easier to trace.','basis':'Completed tasks in this period without a published Gantt match.'})
        if done and not updates:suggestions.append({'text':'Add a short result summary for the completed work, including what was learned and any limitations.','basis':'Task completions are published for this period, but no research results are published.'})
        done.sort(key=lambda t:(t['completed_date'],t['title']),reverse=True)
        updates.sort(key=lambda u:u['date'],reverse=True)
        open_tasks.sort(key=lambda t:(t.get('status')!='blocked',t['planned_date'] or t['due_date'] or '9999-12-31',t['title']))
        result[key]={'start':start.isoformat(),'finish':end.isoformat(),'completed':done,'unfinished':open_tasks,'updates':updates,'days':days,'overdue':overdue,'recommendations':suggestions,'includes_today':start<=current_day<=end,'quality':content['quality']}
        result[key]['brief']=compose(content,result[key],current_day)
        result[key]['markdown']=markdown(content,result[key])
    return result
