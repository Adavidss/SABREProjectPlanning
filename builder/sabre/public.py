"""Explicit publication boundary. Never reads private state, notes or connectors."""
import json
from urllib.parse import urlsplit
import re
from pathlib import Path
from .roadmap import source_roadmap
from .recap import prepare_content
from .library import safe_url


def public_content(directory):
    content=json.loads((Path(directory)/'overview.json').read_text())
    # Publication v2 fails closed. Drafts and raw provider records never reach exports.
    def approved(row):
        return row.get('visibility')=='collaborators' and bool(row.get('approved_at'))
    def rows(name, fields):
        return [{k:str(r.get(k,'') or '') for k in fields} for r in content.get(name,[]) if approved(r)]
    stamp=('visibility','approved_at')
    result={'title':str(content.get('title','SABRE polarizer')),
            'summary':'','focus':[],'recommendations':[],'source_notes':[],
            'updated':content.get('updated'),'source_as_of':content.get('source_as_of'),
            'source_status':str(content.get('source_status','unknown')),'coverage':'Approved coordination metadata only.',
            'tasks':rows('tasks',('id','title','status','due_date','planned_date','completed_date','task_id','source','project_id','project_name','section_id','section_name','section_order','task_order','parent_id','url')+stamp),
            'updates':rows('updates',('id','date','task_id','title','summary','result','next_step','evidence_ref','kind','origin','source','url')+stamp),
            'public_notes':rows('public_notes',('id','title','text','date','url','kind','workstream')+stamp),
            'team':rows('team',('id','name','role','description','image','linkedin','scholar','publications')+stamp),
            'program':rows('program',('id','title','text','date','source','url','kind')+stamp),
            'events':rows('events',('id','title','start','end','timezone','location','source','synced_at')+stamp),
            'resources':rows('resources',('id','title','description','category','url','workstream')+stamp)}
    for name in ('tasks','updates','resources','public_notes','program'):
        for item in result[name]:
            if not safe_url(item.get('url')):item['url']=''
    result['resources']=[r for r in result['resources'] if r['url'] or shared_file(directory,r['id']) is not None]
    # Team profile links fail closed to their expected hosts; publications stay plain structured text.
    for member in result['team']:
        for key,host in (('linkedin','linkedin.com'),('scholar','scholar.google.com'),('image','')):
            url=member.get(key,'')
            if not safe_url(url) or not url.startswith('https://') or (host and urlsplit(url).hostname not in (host,'www.'+host)):member[key]=''
        member['publications']=[p for p in ([x.strip() for x in line.split('|')] for line in member['publications'].splitlines()) if p[0]][:3]
        member['publications']=[{'title':p[0][:300],'source':(p[1] if len(p)>1 else '')[:200],'year':(p[2] if len(p)>2 else '')[:4],'url':(p[3] if len(p)>3 and safe_url(p[3]) and p[3].startswith('https://') else '')} for p in member['publications']]
    # Calendar IDs are exported only for the explicit full-calendar opt-in; never raw embeds.
    cfg=content.get('display',{})
    if not isinstance(cfg,dict):cfg={}
    result['display']={k:cfg.get(k,True) is True for k in ('show_roadmap','show_calendar','show_tasks','show_resources','show_notes','show_discussion','show_milestones','show_changes','show_team')}
    result['display']['intro']=str(cfg.get('intro','V1 experiments, V2 construction, instrumentation and separation.'))[:600]
    result['display']['theme']=cfg.get('theme') if cfg.get('theme') in ('navy','teal','purple') else 'navy'
    for key,default,maximum in [('calendar_days',14,90),('task_limit',3,100),('resource_limit',4,20)]:
        try:result['display'][key]=max(1,min(maximum,int(cfg.get(key,default))))
        except (ValueError,TypeError):result['display'][key]=default
    calendar_id=str(cfg.get('calendar_id',''))
    result['display']['full_calendar']=cfg.get('full_calendar') is True and bool(re.fullmatch(r'[A-Za-z0-9_.+@-]{3,500}',calendar_id))
    if result['display']['full_calendar']:result['display']['calendar_id']=calendar_id
    connections=content.get('source_connections',{})
    result['source_connections']={}
    for name in ('calendar','todoist'):
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
    if not entry or entry.get('visibility')!='collaborators' or not entry.get('approved_at'):return None
    name=entry.get('file','')
    if not isinstance(name,str) or Path(name).name!=name:return None
    base=(root/'files').resolve();p=(base/name).resolve()
    if base not in p.parents or not p.is_file():return None
    return p


def public_roadmap():
    r=source_roadmap()
    return {'weeks':r['weeks'],'warning':r['warning'],
            'rows':[{k:x[k] for k in ('section','id','title','owner','row','parent','start','finish','cells') if k in x} for x in r['rows']],
            'tasks':[{k:t.get(k) for k in ('ID','Task','Start (expected)','Finish (expected)','Start (pessim.)','Finish (pessim.)','Predecessors','Status','Completed')} for t in r['tasks']]}


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
