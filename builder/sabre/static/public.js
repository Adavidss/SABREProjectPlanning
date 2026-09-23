'use strict';
const staticSite=document.body.dataset.static==='true';
let data,view='overview',period='day',requestSequence=0,ganttSettings={};
const $=s=>document.querySelector(s),e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ganttLink(id){return data.roadmap.rows.some(x=>x.id===id)?`<button class="inline-link" data-open-task="${e(id)}">View on Gantt · ${e(id)} ↗</button>`:e(id||'No Gantt match');}
function taskList(tasks,done=false){return tasks.map(t=>`<div class="digest-task"><span class="status-mark">${done?'✓':t.status==='blocked'?'!':'○'}</span><div><b>${e(t.title)}</b><small>${ganttLink(t.task_id)} · ${done?'Completed '+e(t.completed_date):e(t.status==='blocked'?'Blocked':'Unfinished')+(t.due_date?' · Due '+e(t.due_date):'')}</small>${t.attention_reason?`<small class="attention-reason">${e(t.attention_reason)}</small>`:''}</div></div>`).join('');}
function finding(u){return `<article class="finding"><small>${e(u.date)} · ${ganttLink(u.task_id)}</small><h3>${['decision','blocker','result'].includes(u.kind)?`<span class="update-kind ${e(u.kind)}">${e(u.kind)}</span> `:''}${e(u.title)}</h3><p class="evidence">${e(u.result||u.summary)}</p>${u.next_step?`<p><b>Next step:</b> ${e(u.next_step)}</p>`:''}${u.evidence_ref||u.result&&u.summary?`<details><summary>Evidence & context</summary>${u.result?`<p class="evidence">${e(u.summary)}</p>`:''}<small>${e(u.evidence_ref)}</small></details>`:''}</article>`;}
function recapLine(text){
 if(text.length<=320)return `<p>${e(text)}</p>`;
 const boundary=text.lastIndexOf(' ',300),preview=text.slice(0,boundary>100?boundary:300);
 return `<details class="recap-expand"><summary>${e(preview)}… <span>Read full statement</span></summary><p class="evidence">${e(text)}</p></details>`;
}
function restoreGanttSettings(){
 for(const id of ['roadmap-stream','roadmap-depth','roadmap-scale','roadmap-month']){
  const control=$('#'+id),value=ganttSettings[id];
  if(value!==undefined&&[...control.options].some(o=>o.value===value))control.value=value;
  control.onchange=()=>{ganttSettings[id]=control.value;drawRoadmap();};
 }
 drawRoadmap();
}
function overview(){
 const o=data.overview,p=data.periods[period],b=p.brief,labels={day:'Daily',week:'Weekly',previous:'Previous week',month:'Monthly'};
 const recs=b.recommendations;
 return `<div class="review-top"><div><span class="eyebrow">Project at a glance</span><h2>${e(o.title)}</h2></div><button id="refresh-overview" class="secondary">Refresh</button></div>
 ${staticSite?`<p class="freshness">Published snapshot · ${e(data.today)}. Source connections and new research appear after a reviewed update is published.</p>`:''}<section class="project-introduction" aria-label="Project context"><p>${e(o.summary)}</p>${o.focus.length?`<div class="current-focus"><span class="eyebrow">Current focus</span><p>${e(o.focus[0])}</p></div>`:''}</section>
 <div class="period-tabs" role="group" aria-label="Recap period">${Object.entries(labels).map(([k,v])=>`<button data-period="${k}" aria-pressed="${period===k}">${v}</button>`).join('')}</div>
 <details class="review-tools"><summary>Choose a date or save this recap</summary><div class="review-date"><label>Review date<input id="review-date" type="date" ${data.static_range?`min="${e(data.static_range.start)}" max="${e(data.static_range.finish)}"`:""} value="${e(data.selected_date)}"></label><button id="return-today" class="secondary">${staticSite?"Latest snapshot":"Today"}</button><button id="save-recap" class="secondary">Save recap ↓</button></div></details>
 <p class="period-range">${e(p.start)}${p.finish===p.start?'':' → '+e(p.finish)}</p>
 <div class="freshness ${e(b.freshness.state)}">${e(b.freshness.message)}${b.freshness.state==='stale'?' · Refresh the source before relying on current task status.':''}</div>
 <section class="quick-recap"><h3>Where things stand</h3><p>${e(b.lines[0])}</p>${b.lines.slice(1).map(recapLine).join('')}</section>
 <section class="reading-section"><div class="section-heading"><h3>What needs attention</h3><small>Reported blockers and work to review</small></div>${taskList(b.attention)||'<p class="empty">No attention items in the published record for this review.</p>'}${b.attention_total>3?`<details><summary>${b.attention_total-3} more attention items</summary>${taskList(b.all_attention.slice(3))}</details>`:''}</section>
 <section class="reading-section"><div class="section-heading"><h3>What changed</h3><small>${p.completed.length} completed · ${p.updates.length} updates</small></div>${b.findings.slice(0,2).map(finding).join('')||'<p class="empty">No research results published for this period.</p>'}${b.findings.length>2?`<details><summary>${b.findings.length-2} more research updates</summary>${b.findings.slice(2).map(finding).join('')}</details>`:''}<details><summary>Completed work · ${p.completed.length}</summary>${taskList(p.completed,true)||'<p>No task completions published.</p>'}</details></section>
 ${recs.length?`<section class="reading-section"><h3>Worth reviewing</h3><article class="reading-row"><p>${e(recs[0].text)}</p><small>Why: ${e(recs[0].basis)}</small></article>${recs.length>1?`<details><summary>${recs.length-1} more suggestions</summary>${recs.slice(1).map(r=>`<p>${e(r.text)}<br><small>${e(r.basis)}</small></p>`).join('')}</details>`:''}</section>`:''}
 <details class="supporting-records"><summary>Supporting records & upcoming work</summary>
 ${b.upcoming.length?`<h3>Next seven days</h3>${b.upcoming.map(t=>`<div class="outlook-row"><time>${e(t.outlook_date)}</time><span>${e(t.title)}<small>${ganttLink(t.task_id)}</small></span></div>`).join('')}`:''}
 ${p.overdue.length?`<details><summary>Current carryover · ${p.overdue.length}</summary>${taskList(p.overdue)}</details>`:''}
 ${b.undated.length?`<details><summary>Without a date · ${b.undated.length}</summary>${taskList(b.undated)}</details>`:''}
 ${period!=='day'&&b.groups.length?`<section class="reading-section"><h3>By research task</h3>${b.groups.map(g=>`<details><summary>${ganttLink(g.task_id)} · ${g.completed.length} completed · ${g.updates.length} updates</summary>${g.updates.map(finding).join('')}${taskList(g.completed,true)}</details>`).join('')}</section>`:''}<details class="daily-records"><summary>Day-by-day record</summary>${p.days.map(d=>`<details class="digest-day"><summary><b>${new Date(d.date+'T12:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</b><span>${d.completed.length} done · ${d.planned.length} open · ${d.updates.length} updates</span></summary>${taskList(d.completed,true)}${taskList(d.planned)}${d.updates.map(finding).join('')}${!d.completed.length&&!d.planned.length&&!d.updates.length?'<p class="empty">No published entries.</p>':''}</details>`).join('')}</details>
 </details>
 ${p.quality.length?`<details class="source-notice"><summary>Record quality · ${p.quality.length} checks to review</summary>${p.quality.map(q=>`<p>${e(q)}</p>`).join('')}</details>`:''}<details class="source-status"><summary>Sources & coverage</summary><ul>${sourceConnectionRows()}</ul><p>${e(o.coverage)}</p><p>Published: ${e(o.updated||'Not yet dated')}. Counts cover shared records only. Unfinished status is the latest snapshot, not historical status. Task completion does not prove scientific acceptance.</p><p>Recommendations combine published suggestions and rule-based review prompts. This website does not call an AI model.</p></details>`;
}
function sourceConnectionRows(){
 const labels={not_connected:'Not connected',pending_credentials:'Credentials pending',unverified:'Private import not yet verified',verified:'Connected',partial:'Connected · incomplete import',unavailable:'Source unavailable'};
 return Object.entries({calendar:'Google Calendar',notion:'Notion',todoist:'Todoist'}).map(([key,name])=>{const c=data.overview.source_connections?.[key]||{status:'not_connected'};return `<li><b>${name}:</b> ${e(labels[c.status]||labels.unverified)}${c.checked_at?' · Last check '+e(c.checked_at):''}</li>`;}).join('');
}
function calendarView(){
 const calendar=data.overview.calendar;
 if(!calendar)return '<section class="intro"><div><h2>Calendar</h2><p>No calendar has been shared for viewing yet.</p></div></section>';
 const query=new URLSearchParams({src:calendar.id,ctz:calendar.timezone,mode:'AGENDA',showTitle:'0',showPrint:'0',showCalendars:'0'});
 return `<section class="intro"><div><span class="eyebrow">Schedule</span><h2>Google Calendar</h2><p>View upcoming commitments in Google’s calendar. Scheduled events are plans, not evidence of completed research.</p></div></section><section class="reading-section"><p>Visibility follows your Google account’s existing calendar access. If the calendar is blank or asks you to sign in, open it directly in Google.</p><div class="actions"><button id="load-calendar">Show calendar here</button><a href="https://calendar.google.com/calendar/embed?${e(query.toString())}" target="_blank" rel="noopener noreferrer">Open Google Calendar ↗</a></div><p class="muted">Timezone: ${e(calendar.timezone)}. The calendar loads from Google only when you choose to show it.</p><div id="calendar-container"></div></section><section class="reading-section"><h3>Sources for the research recap</h3><p>The calendar view is separate from briefing imports. These are the last published connection checks; a working calendar embed does not verify the private importer.</p><ul>${sourceConnectionRows()}</ul><p>After connection and testing, reviewed source information can be included in the published overview. Your API credentials belong in the private application, never on this site.</p></section>`;
}
function bindCalendar(){
 const button=$('#load-calendar');if(!button)return;
 button.onclick=()=>{const c=data.overview.calendar,params=new URLSearchParams({src:c.id,ctz:c.timezone,mode:'AGENDA',showTitle:'0',showPrint:'0',showCalendars:'0'}),frame=document.createElement('iframe');frame.title='SABRE Google Calendar';frame.className='google-calendar';frame.referrerPolicy='no-referrer';frame.src='https://calendar.google.com/calendar/embed?'+params;$('#calendar-container').replaceChildren(frame);button.hidden=true;};
}
function resources(){
 const groups=[['reading','Background reading','Papers and explanations that provide context for the research.'],['reference','Reference files','Shared protocols, results, and supporting project material.'],['tool','Useful tools','Links to tools collaborators can use while working on the project.']];
 return `<section class="intro resource-intro"><div><span class="eyebrow">Get up to speed</span><h2>Files, reading & tools</h2><p>Use the Overview for recent work and the Gantt for the research schedule. Explore the supporting material below for more context.</p></div></section>${groups.map(([key,title,description])=>{
 const items=data.overview.resources.filter(r=>(['reading','tool'].includes(r.category)?r.category:'reference')===key);
 return items.length?`<section class="resource-group" aria-labelledby="resources-${key}"><h2 id="resources-${key}">${title}</h2><p class="resource-context">${description}</p>${items.map(r=>`<article class="resource-item"><small>${r.url?'External link · Opens in a new tab':'File download'}</small><h3><a href="${r.url?e(r.url):e(r.download_url||'/files/'+encodeURIComponent(r.id))}" ${r.url?'target="_blank" rel="noopener noreferrer"':(staticSite?'download':'')}>${e(r.title)} ${r.url?'↗':'↓'}</a></h3>${r.description?`<p>${e(r.description)}</p>`:''}</article>`).join('')}</section>`:'';
 }).join('')||'<p class="empty">No resources have been shared yet.</p>'}`;
}
function bindRecap(){
 document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;render();});
 document.querySelectorAll('[data-open-task]').forEach(b=>b.onclick=()=>{view='gantt';render();showRoadmapEvidence(b.dataset.openTask);});
 if(view!=='overview')return;
 $('#review-date').onchange=ev=>loadOverview(ev.target.value);
 $('#return-today').onclick=()=>{period='day';loadOverview();};
 $('#refresh-overview').onclick=()=>loadOverview(data.selected_date);
 $('#save-recap').onclick=()=>{const blob=new Blob([data.periods[period].markdown],{type:'text/markdown'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='SABRE-'+period+'-'+data.selected_date+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
}
function render(){document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));$('#content').innerHTML=view==='gantt'?renderGantt():view==='resources'?resources():view==='sources'?sourceRecords():view==='calendar'?calendarView():overview();bindRecap();if(view==='calendar')bindCalendar();if(view==='gantt')restoreGanttSettings();}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(!data)return;view=b.dataset.view;render();});
async function loadOverview(date=''){
 const sequence=++requestSequence;$('#message').textContent='Refreshing published overview…';
 try{
  const response=await fetch(staticSite?'./snapshot.json':'/api/public'+(date?'?date='+encodeURIComponent(date):''),{cache:'no-cache'});
  if(!response.ok)throw Error();const next=await response.json();
  if(staticSite&&date&&date!==next.selected_date){
   if(date<next.static_range.start||date>next.static_range.finish)throw Error('Date outside published range');
   const recap=await fetch('./recaps/'+encodeURIComponent(date)+'.json',{cache:'no-cache'});if(!recap.ok)throw Error();next.periods=await recap.json();next.selected_date=date;
  }
  if(sequence!==requestSequence)return;data=next;render();$('#message').textContent='';
 }
 catch{if(sequence!==requestSequence)return;if(data&&$('#review-date'))$('#review-date').value=data.selected_date;$('#message').textContent=data?'Refresh failed. The previous overview remains visible; its dates have not changed.':'Overview could not load. Reload the page to try again.';}
}
loadOverview();
function roadmapNotes(ids){return data.overview.updates.filter(n=>ids.includes(n.task_id)).map(n=>({date:n.date,roadmap_task_id:n.task_id,text:n.result||n.summary}));}
function renderGantt(){
 const r=data.roadmap;
 return `<section class="intro"><div><span class="eyebrow">Original workbook · Gantt Overview</span><h2>SABRE polarizer</h2><p>V1 experiments · V2 build · separation</p></div></section>
 <details class="source-notice"><summary>Source schedule details</summary>${e(r.warning)}</details>
 <div class="roadmap-key"><span><i style="background:#c0504d"></i>Solid: expected work window</span><span><i style="background:#f0dcdb"></i>Pale: extension to pessimistic finish</span><span>◇ Milestone</span><span>○ Decision gate</span><span>△ Arrival</span><span>● Published update</span></div>
 <div class="toolbar"><label>Workstream<select id="roadmap-stream"><option value="">All workstreams</option>${r.rows.filter(x=>x.section).map(x=>`<option value="${e(x.section)}">${e(x.section)}</option>`).join('')}</select></label><label>View<select id="roadmap-depth"><option value="bands">Work bands</option><option value="tasks">All task rows</option></select></label><label>Scale<select id="roadmap-scale"><option value="fit">Fit whole schedule</option><option value="month">Month</option><option value="sheet">Original weekly grid</option></select></label><label>Month<select id="roadmap-month">${[...new Set(r.weeks.map(w=>w.start.slice(0,7)))].map(m=>`<option value="${m}" ${m===data.today.slice(0,7)?'selected':''}>${new Date(m+'-15T12:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})}</option>`).join('')}</select></label></div>
 <p class="muted">The full schedule fits your screen. An outlined week marks today. Tap a band for task details and results. Choose Month for closer reading or Original weekly grid for the Excel layout.</p><div id="roadmap-grid"></div><section id="roadmap-evidence" class="reading-section" aria-live="polite"><h2>Schedule & recorded work</h2><p>Select a row above to compare its original schedule with linked research updates.</p><p>Only published research updates appear here. Select Files & reading for shared reference material.</p></section>`;
}
function drawRoadmap(){
 $('#roadmap-month').parentElement.hidden=$('#roadmap-scale').value!=='month';
 if($('#roadmap-scale').value!=='sheet'){drawCompactRoadmap();return;}
 const r=data.roadmap,filter=$('#roadmap-stream').value,all=$('#roadmap-depth').value==='tasks';let section='';
 const rows=r.rows.filter(x=>{if(x.section)section=x.section;return (!filter||filter===section)&&(all||!x.parent);});
 const months=[];r.weeks.forEach(w=>{const key=w.start.slice(0,7);if(months.at(-1)?.key===key)months.at(-1).n++;else months.push({key,n:1});});
 const fmt=d=>new Date(d+'T12:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
 $('#roadmap-grid').innerHTML=`<div class="roadmap-scroll" tabindex="0" role="region" aria-label="Original workbook weekly Gantt, scroll horizontally"><table class="source-gantt"><thead><tr><th class="frozen" rowspan="2">Work band / task<br><small>Original workbook IDs</small></th>${months.map(m=>`<th colspan="${m.n}">${new Date(m.key+'-15T12:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})}</th>`).join('')}</tr><tr>${r.weeks.map(w=>`<th class="week-heading" data-week="${w.start}">Week of<br>${fmt(w.start)}<small>through ${fmt(w.finish)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(x=>{
 if(x.section)return `<tr class="source-band"><th class="frozen">${e(x.section)}</th><td colspan="${r.weeks.length}"></td></tr>`;
 const ids=[x.id,...r.rows.filter(t=>t.parent===x.id).map(t=>t.id)],notes=roadmapNotes(ids);
 return `<tr class="${x.parent?'source-child':''}"><th class="frozen"><button class="source-row-button" data-roadmap-id="${e(x.id)}"><strong>${e(x.id)}</strong> ${e(x.title)}<small>${e(x.owner)} · ${notes.length?notes.length+' published updates':'No published updates'}</small></button></th>${x.cells.map((c,i)=>{const ns=notes.filter(n=>n.date>=r.weeks[i].start&&n.date<=r.weeks[i].finish);const mark={'<>':'◇','o':'○','^':'△'}[c.mark]||c.mark;return `<td><div class="source-cell" style="${c.fill?'background:'+c.fill:''}" title="${e(x.id+' · '+r.weeks[i].start+' through '+r.weeks[i].finish)}">${e(mark)}</div>${ns.length?`<button class="source-note-dot" data-roadmap-id="${e(x.id)}" title="${ns.length} published updates this week">●<span class="sr-only"> ${ns.length} published updates</span></button>`:''}</td>`;}).join('')}</tr>`;
 }).join('')}</tbody></table></div>`;
 document.querySelectorAll('[data-roadmap-id]').forEach(b=>b.onclick=()=>showRoadmapEvidence(b.dataset.roadmapId));
}
function showRoadmapEvidence(id){
 const r=data.roadmap,row=r.rows.find(t=>t.id===id),ids=[id,...r.rows.filter(t=>t.parent===id).map(t=>t.id)],tasks=r.tasks.filter(t=>ids.includes(t.ID)),notes=roadmapNotes(ids);
 const dateText=v=>v==='#VALUE!'?'Unavailable — source formula error':v||'Not scheduled';
 $('#roadmap-evidence').innerHTML=`<h2>${e(id)} · ${e(row.title)}</h2><p class="muted">Source: Gantt Overview, row ${row.row}. ${e(row.owner)}</p>${tasks.map(t=>`<details ${tasks.length===1?'open':''}><summary>${e(t.ID)} · ${e(t.Task)}</summary><p><b>Expected:</b> ${e(dateText(t['Start (expected)']))} → ${e(dateText(t['Finish (expected)']))}<br><b>Pessimistic:</b> ${e(dateText(t['Start (pessim.)']))} → ${e(dateText(t['Finish (pessim.)']))}</p><p>Predecessors: ${e(t.Predecessors||'None listed')}<br></p></details>`).join('')}<h3>Published research · ${notes.length} published updates</h3>${notes.map(n=>`<article class="reading-row"><small>${e(n.date)} · ${e(n.roadmap_task_id)}</small><p class="evidence">${e(n.cleaned_text??n.text)}</p></article>`).join('')||'<p>No evidence linked yet. This does not mean the work has not happened.</p>'}<p class="muted">Published updates describe reported work; they do not automatically establish completion. Updates outside the displayed weeks remain visible here.</p>`;
 $('#roadmap-evidence').tabIndex=-1;$('#roadmap-evidence').focus({preventScroll:true});$('#roadmap-evidence').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}

function drawCompactRoadmap(){
 const r=data.roadmap,filter=$('#roadmap-stream').value,all=$('#roadmap-depth').value==='tasks',month=$('#roadmap-scale').value==='month',selected=$('#roadmap-month').value;
 const indices=r.weeks.map((w,i)=>i).filter(i=>!month||r.weeks[i].start.slice(0,7)===selected);
 const months=[];indices.forEach(i=>{const key=r.weeks[i].start.slice(0,7);if(months.at(-1)?.key===key)months.at(-1).n++;else months.push({key,n:1});});let section='';
 const rows=r.rows.filter(x=>{if(x.section)section=x.section;return (!filter||section===filter)&&(all||!x.parent);});
 const axis=()=>`<div class="compact-axis">${months.map(m=>`<span style="flex:${m.n}">${m.n<3&&!month?'·':new Date(m.key+'-15T12:00').toLocaleDateString(undefined,{month:'short'})}<small>${m.n<3&&!month?'':m.key.slice(2,4)}</small></span>`).join('')}</div>`;
 $('#roadmap-grid').innerHTML=`<div class="compact-gantt"><p class="muted">${e(r.weeks[indices[0]].start)} → ${e(r.weeks[indices.at(-1)].finish)}</p>${axis()}${month?`<div class="compact-axis">${indices.map(i=>`<span>Week of ${new Date(r.weeks[i].start+'T12:00').getDate()}</span>`).join('')}</div>`:''}${rows.map(x=>{
 if(x.section)return `<h3 class="compact-section">${e(x.section)}</h3>${axis()}`;
 const ids=[x.id,...r.rows.filter(t=>t.parent===x.id).map(t=>t.id)],notes=roadmapNotes(ids);
 return `<button class="compact-row ${x.parent?'compact-child':''}" data-roadmap-id="${e(x.id)}"><span class="compact-title"><b>${e(x.id)} · ${e(x.title)}</b>${notes.length?`<small>${notes.length} updates</small>`:''}</span><span class="compact-track" style="grid-template-columns:repeat(${indices.length},minmax(0,1fr))">${indices.map(i=>{const c=x.cells[i],dot=notes.some(n=>n.date>=r.weeks[i].start&&n.date<=r.weeks[i].finish);return `<span class="${r.weeks[i].start<=data.today&&data.today<=r.weeks[i].finish?'current-week':''}" style="${c.fill?'background:'+c.fill:''}" title="${e(r.weeks[i].start+' – '+r.weeks[i].finish)}">${e({'<>':'◇','o':'○','^':'△'}[c.mark]||c.mark)}${dot?'<i>●</i>':''}</span>`;}).join('')}</span></button>`;
 }).join('')}</div>`;
 document.querySelectorAll('[data-roadmap-id]').forEach(b=>b.onclick=()=>showRoadmapEvidence(b.dataset.roadmapId));
}

function sourceRecords(){
 const o=data.overview,notes=o.source_notes||[],tasks=o.tasks||[];
 const open=tasks.filter(t=>['open','blocked','in_progress'].includes(t.status)),done=tasks.filter(t=>t.status==='completed');
 return `<section class="intro"><div><span class="eyebrow">Research sources</span><h2>Notes & tasks</h2><p>Shared source records, organized for a quick catch-up. Task completion and note edits do not automatically establish experimental results.</p></div></section><section class="reading-section"><h3>Connection checks</h3><ul>${sourceConnectionRows()}</ul><p>${e(o.coverage)}</p></section><section class="reading-section"><h3>Action list · ${open.length} unfinished</h3>${taskList(open)||'<p>No unfinished tasks have been shared.</p>'}<details><summary>Completed tasks · ${done.length}</summary>${taskList(done,true)||'<p>No completed tasks have been shared.</p>'}</details></section><section class="reading-section"><h3>Research notes · ${notes.length}</h3><p>Dates below indicate source edits, not when experiments occurred.</p>${notes.map(n=>`<article class="finding"><small>${e(n.source)} · Edited ${e(n.updated_at||'date unknown')}</small><h3>${e(n.title)}</h3>${recapLine(n.text)}</article>`).join('')||'<p>No research notes have been shared.</p>'}</section>`;
}
