"""Grounded recap composition. Published facts only, no inference provider."""
from datetime import date, timedelta
import json


def iso_day(value):
    try:return date.fromisoformat(value) if value else None
    except (ValueError,TypeError):return None


def prepare_content(content):
    """Remove identical repeated records, but never merge distinct task occurrences."""
    result=dict(content);duplicates=0
    for name in ('tasks','updates'):
        seen=set();rows=[]
        for row in content.get(name,[]):
            key=json.dumps(row,sort_keys=True)
            if key in seen:duplicates+=1;continue
            seen.add(key);rows.append(row)
        result[name]=rows
    problems=list(content.get('quality',[]))
    if duplicates:problems.append(f'{duplicates} identical repeated records excluded from recap counts.')
    incomplete=sum(t.get('status')=='completed' and not iso_day(t.get('completed_date')) for t in result['tasks'])
    if incomplete:problems.append(f'{incomplete} completed tasks have no valid completion date and cannot be assigned to a recap period.')
    invalid=sum(not iso_day(u.get('date')) for u in result['updates'])
    if invalid:problems.append(f'{invalid} research updates have no valid date and cannot be assigned to a recap period.')
    unknown=sum(t.get('status') not in {'open','in_progress','blocked','completed','cancelled'} for t in result['tasks'])
    if unknown:problems.append(f'{unknown} tasks have an unrecognized status and are excluded from open/completed counts.')
    identities={}
    for t in result['tasks']:
        if t.get('id'):
            key=(t.get('source',''),t['id'],t.get('completed_date',''))
            identities.setdefault(key,[]).append(t)
    if any(len(rows)>1 for rows in identities.values()):problems.append('Conflicting task records share an identity. Review the published source before treating counts as authoritative.')
    result['quality']=list(dict.fromkeys(problems))
    return result


def compose(content, period, current_day):
    done=period['completed'];updates=period['updates'];unfinished=period['unfinished']
    dated=lambda t:min((d for d in (t.get('planned_date'),t.get('due_date')) if iso_day(d)),default='9999-12-31')
    undated=[t for t in content['tasks'] if t.get('status') in {'open','in_progress','blocked'} and not iso_day(t.get('planned_date')) and not iso_day(t.get('due_date'))]
    pool=list(unfinished)
    if period.get('includes_today'):
        for t in content['tasks']:
            if t.get('status')=='blocked' or t in period['overdue']:
                if t not in pool:pool.append(t)
    blockers=[t for t in pool if t.get('status')=='blocked']
    attention=sorted(pool,key=lambda t:(t.get('status')!='blocked',t not in period['overdue'],dated(t),t.get('title','')))
    for_task=lambda t: 'Reported blocker' if t.get('status')=='blocked' else 'Past due in latest snapshot' if t in period['overdue'] else 'Dated in this review period'
    attention=[dict(t,attention_reason=for_task(t)) for t in attention]
    upcoming=[]
    if period.get('includes_today'):
        for t in content['tasks']:
            dates=[d for d in (iso_day(t.get('planned_date')),iso_day(t.get('due_date'))) if d and current_day<d<=current_day+timedelta(days=7)]
            if t.get('status') in {'open','in_progress','blocked'} and dates:upcoming.append(dict(t,outlook_date=min(dates).isoformat()))
        upcoming.sort(key=lambda t:(t['outlook_date'],t.get('title','')))

    # A due date in the period must remain visible even if its planned date is elsewhere.
    priority=attention[:3]
    findings=sorted(updates,key=lambda u:u['date'],reverse=True)
    covered={u.get('task_id') for u in updates if u.get('task_id')}
    undocumented=[t for t in done if t.get('task_id') and t['task_id'] not in covered]
    suggestions=list(content.get('recommendations',[]))+list(period['recommendations'])
    if undocumented:suggestions.append({'text':f'Add result evidence for {len(undocumented)} completed tasks whose Gantt IDs have no research update in this period.', 'basis':', '.join(dict.fromkeys(t['task_id'] for t in undocumented))})
    if blockers:suggestions.insert(0,{'text':'Resolve or clarify the reported blockers before treating the associated work as ready to proceed.','basis':'; '.join(t['title'] for t in blockers[:3])})
    if undated:suggestions.append({'text':f'Review {len(undated)} unfinished tasks without dates; decide which belong in the next review.', 'basis':'Published tasks without a valid planned or due date.'})
    # One recommendation list drives both the screen and saved document.
    unique=[];seen=set()
    for suggestion in suggestions:
        key=suggestion['text'].strip().casefold()
        if key not in seen:
            seen.add(key);unique.append(suggestion)
    suggestions=unique
    has_period=bool(done or updates or unfinished)
    count=lambda n,word: f"{n} {word}"+("" if n==1 else "s")
    lines=[]
    if has_period:
        lines.append(f"Recorded this period: {count(len(done), 'task completion')} and {count(len(updates), 'research update')}.")
        if findings:
            label={'decision':'Latest decision','blocker':'Latest reported blocker'}.get(findings[0].get('kind'),'Latest research update')
            lines.append(label+': '+(findings[0].get('result') or findings[0].get('summary') or findings[0].get('title','')))
        if priority:lines.append('Next to review: '+priority[0]['title']+'.')
    else:
        lines.append('No dated work has been published for this period. This is a gap in the shared record, not evidence that no work happened.')
        if priority:lines.append('Current attention: '+priority[0]['title']+'.')
    stamp=iso_day(str(content.get('source_as_of') or '')[:10])
    freshness={'state':'unknown','message':'Source refresh date not provided.'}
    if stamp:
        age=(current_day-stamp).days
        freshness={'state':'stale' if age>2 else 'future' if age<0 else 'recent','message':f'Source snapshot: {stamp.isoformat()}'+(f' · {age} day'+('' if age==1 else 's')+' old' if age>0 else '')}
    status=content.get('source_status','unknown')
    if status in {'unavailable','not_connected','stale'}:
        freshness={'state':'unavailable' if status!='stale' else 'stale',
                   'message':{'unavailable':'Source refresh failed or is unavailable. Displaying previously published records.',
                              'not_connected':'Source is not connected. Published records may be incomplete.',
                              'stale':'Source is marked stale. Confirm task status before relying on it.'}[status]+(' Last successful snapshot: '+stamp.isoformat() if stamp else '')}
    groups={}
    for t in done:
        key=t.get('task_id') or 'Unmapped';groups.setdefault(key,{'task_id':key,'completed':[],'updates':[]})['completed'].append(t)
    for u in findings:
        key=u.get('task_id') or 'Unmapped';groups.setdefault(key,{'task_id':key,'completed':[],'updates':[]})['updates'].append(u)
    return {'lines':lines,'all_attention':attention,'upcoming':upcoming,'attention':priority,'attention_total':len(attention),'findings':findings,'groups':list(groups.values()),'undated':undated,'recommendations':suggestions,'freshness':freshness,'has_period_data':has_period}


def markdown(content,period):
    brief=period['brief'];lines=['# '+content.get('title','SABRE'),period['start']+' → '+period['finish'],'',brief['freshness']['message'],content.get('coverage',''),'']
    lines+=brief['lines']
    if content.get('focus'):
        lines+=['','## Current focus']+['- '+item for item in content['focus']]
    lines+=['','## Work to review']
    for t in brief['all_attention']:lines.append('- '+t['title']+' · '+t.get('task_id','')+' · '+t.get('status','')+' · Due '+(t.get('due_date') or 'unspecified'))
    if brief['undated']:
        lines+=['','## Undated follow-ups (latest published status)']
        for t in brief['undated']:lines.append('- '+t['title']+' · '+t.get('task_id',''))
    lines+=['','## Next seven days (latest published status)']
    for t in brief['upcoming']:lines.append('- '+t['outlook_date']+' · '+t['title'])
    lines+=['','## Record quality']+period.get('quality',[])+['','## Completed work']
    for t in period['completed']:lines.append('- '+t['completed_date']+' · '+t['title']+' · '+t.get('task_id',''))
    lines+=['','## Research results']
    for u in brief['findings']:
        lines+=['',u['date']+' · '+u.get('task_id','')+' · '+u['title'],u['summary']]
        for field,label in [('kind','Update type'),('result','Result'),('next_step','Next step'),('evidence_ref','Evidence')]:
            if u.get(field):lines.append(label+': '+u[field])
    lines+=['','## Recommendations']
    for r in brief['recommendations']:lines+=['- '+r['text'],'  Based on: '+r['basis']]
    lines+=['','Task completion is not scientific acceptance. Unfinished status reflects the latest published snapshot.']
    return '\n'.join(lines)+'\n'
