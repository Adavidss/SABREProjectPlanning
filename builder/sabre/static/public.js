'use strict';
const staticSite=document.body.dataset.static==='true';
const views=['overview','gantt','calendar','tasks','resources','notes','discussion'];
let data,view=views.includes(location.hash.slice(1))?location.hash.slice(1):'overview',requestSequence=0,ganttSettings={},taskQuery='',resourceQuery='',taskScope='active';
const $=s=>document.querySelector(s),e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function restoreGanttSettings(){
 for(const id of ['roadmap-stream','roadmap-depth','roadmap-scale','roadmap-month']){
  const control=$('#'+id),value=ganttSettings[id];
  if(value!==undefined&&[...control.options].some(o=>o.value===value))control.value=value;
  control.onchange=()=>{ganttSettings[id]=control.value;drawRoadmap();};
 }
 drawRoadmap();
}
function sourceLink(url,label='Open source ↗'){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?`<a href="${e(u.href)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>`:'';}catch{return '';}
}
function jump(target,label){return `<button class="inline-link" data-jump="${target}">${label} ↗</button>`;}
function todoistTree(activeOnly=false,query='',limit=Infinity){
 if(data.todoistError)return '<p class="empty">Live Todoist could not refresh. Reload the page to retry; no stale task list is shown.</p>';
 if(data.liveTodoist)return liveTodoistTree(query,limit);
 const tasks=(data.overview.tasks||[]).filter(t=>t.source==='Todoist'||t.id?.startsWith('todoist:')).filter(t=>!activeOnly||!['completed','cancelled'].includes(t.status));
 const needle=query.trim().toLowerCase();const matches=t=>[t.title,t.project_name,t.section_name].some(v=>(v||'').toLowerCase().includes(needle));const keep=new Set();if(needle)for(const task of tasks.filter(matches)){let t=task;while(t&&!keep.has(t)){keep.add(t);t=t.parent_id?tasks.find(p=>p.id==='todoist:'+t.parent_id||p.id===t.parent_id):null;}}const selected=needle?tasks.filter(t=>keep.has(t)):tasks;
 const projects=new Map();for(const t of selected.slice(0,limit)){const id=t.project_id||'';if(!projects.has(id))projects.set(id,[]);projects.get(id).push(t);}
 return [...projects].map(([id,rows])=>{const sections=new Map();for(const t of rows){const key=t.section_id||'';if(!sections.has(key))sections.set(key,[]);sections.get(key).push(t);}
 return `<section class="todoist-project"><h3>${e(rows[0].project_name|| (id?'Todoist project · '+id:'Todoist · project not supplied'))}</h3>${[...sections].sort((a,b)=>Number(a[1][0].section_order||0)-Number(b[1][0].section_order||0)).map(([sid,items])=>{
 items.sort((a,b)=>Number(a.task_order||0)-Number(b.task_order||0));
 const ordered=[],visited=new Set();const visit=t=>{if(visited.has(t))return;visited.add(t);ordered.push(t);items.filter(x=>x.parent_id&&(t.id==='todoist:'+x.parent_id||t.id===x.parent_id)).forEach(visit);};items.filter(t=>!t.parent_id||!items.some(x=>x.id==='todoist:'+t.parent_id||x.id===t.parent_id)).forEach(visit);items.forEach(visit);
 const depth=t=>{let d=0,p=t.parent_id,seen=new Set([t.id]);while(p&&d<5){const parent=items.find(x=>x.id==='todoist:'+p||x.id===p);if(!parent||seen.has(parent.id))break;seen.add(parent.id);d++;p=parent.parent_id;}return d;};
 return `<div class="todoist-section">${sid||items[0].section_name?`<h4>${e(items[0].section_name||'Section · '+sid)}</h4>`:''}<ul>${ordered.map(t=>`<li style="--depth:${depth(t)}"><span aria-hidden="true">${t.status==='completed'?'✓':'○'}</span><div>${sourceLink(t.url,t.title)||e(t.title)}<small>${t.due_date?'Due '+e(t.due_date)+' · ':''}${e(t.status||'Status not supplied')}</small></div></li>`).join('')}</ul></div>`;
 }).join('')}</section>`;}).join('')||`<p class="empty">${needle?'No tasks match this search.':'No '+(activeOnly?'active ':'')+'tasks shared yet.'}</p>`;
}
function agenda(compact=false){
 if(data.overview.display?.full_calendar)return calendarEmbed(compact);
 const events=[...(data.overview.events||[])].sort((a,b)=>a.start.localeCompare(b.start));
 const today=new Date().toLocaleDateString('en-CA'),end=new Date();end.setDate(end.getDate()+(data.overview.display?.calendar_days||14));
 const cutoff=end.toLocaleDateString('en-CA');
 const upcoming=compact?events.filter(x=>(x.end||x.start).slice(0,10)>=today&&x.start.slice(0,10)<=cutoff).slice(0,6):events;
 const when=x=>{if(/^\d{4}-\d{2}-\d{2}$/.test(x.start))return x.start+' · All day';try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:x.timezone||'America/New_York',timeZoneName:'short'}).format(new Date(x.start));}catch{return 'Date unavailable';}};
 return `<small class="source-tag">Google Calendar · ${compact?'Next '+(data.overview.display?.calendar_days||14)+' days':'Approved schedule'}</small>${upcoming.map(x=>`<article class="calendar-event"><time>${e(when(x))}</time><h3>${e(x.title)}</h3>${x.location?`<small>${e(x.location)}</small>`:''}<small>Synced ${e((x.synced_at||'').slice(0,10)||'date unavailable')}</small></article>`).join('')||'<p class="empty">No approved events in this window.</p>'}`;
}
function milestoneHistory(compact=false){
 const r=data.roadmap,seen=new Set(),rows=[];
 for(const row of r.rows){if(!row.id||seen.has(row.id))continue;const dates=(row.cells||[]).flatMap((c,i)=>c.mark==='<>'?[r.weeks[i].start]:[]);if(!dates.length)continue;seen.add(row.id);const task=r.tasks.find(t=>t.ID===row.id)||{};rows.push({id:row.id,title:row.title,date:dates[0],completed:task.Status==='completed'||task.Status==='complete',actual:task.Completed||''});}
 const done=rows.filter(x=>x.completed),planned=rows.filter(x=>!x.completed).sort((a,b)=>a.date.localeCompare(b.date));
 const upcoming=planned.filter(x=>x.date>=data.today);
 const list=xs=>xs.map(x=>`<li><time>${e(x.completed?x.actual||'Date not recorded':x.date)}</time><span><button class="inline-link" data-open-roadmap="${e(x.id)}">${e(x.id)} · ${e(x.title)} ↗</button>${!x.completed&&x.date<data.today?'<small>Past planned date · completion not recorded</small>':''}</span></li>`).join('');
 if(compact)return `<div class="milestone-preview"><div class="section-heading"><h3>Next roadmap milestones</h3>${jump('gantt','Explore Gantt')}</div><ul class="milestone-list">${list(upcoming.slice(0,3))||'<li>No future milestones in the source schedule.</li>'}</ul><small>Planned dates from the workbook.</small></div>`;
 return `<section class="source-panel"><span class="source-tag">Gantt · original milestone markers</span><h2>Milestones</h2><details><summary>Explicitly completed · ${done.length}</summary><ul class="milestone-list">${list(done)||'<li>No completion recorded in the roadmap.</li>'}</ul></details><details open><summary>Scheduled milestones · ${planned.length}</summary><ul class="milestone-list">${list(planned)}</ul></details></section>`;
}
let visitChanges=null,visitBaseline;
function visitFingerprint(snapshot){
 const hash=x=>{let n=2166136261;for(const c of JSON.stringify(x)){n=Math.imul(n^c.charCodeAt(0),16777619);}return String(n>>>0);};
 return {at:new Date().toISOString(),tasks:Object.fromEntries(snapshot.overview.tasks.map(x=>[x.id,x.status])),events:Object.fromEntries((snapshot.overview.events||[]).map(x=>[x.id,hash(x)])),roadmap:Object.fromEntries(snapshot.roadmap.rows.filter(x=>x.id).map(x=>[x.id,hash(x)]))};
}
function compareVisits(before,after){
 const added=key=>Object.keys(after[key]).filter(id=>!(id in before[key])).length;
 return {roadmap:Object.keys(after.roadmap).filter(id=>id in before.roadmap&&before.roadmap[id]!==after.roadmap[id]).length,completed:Object.keys(after.tasks).filter(id=>after.tasks[id]==='completed'&&id in before.tasks&&before.tasks[id]!=='completed').length,events:added('events')};
}
function rememberVisit(){
 try{const current=visitFingerprint(data);if(visitBaseline===undefined){const raw=localStorage.getItem('sabre-visit-v1');visitBaseline=raw?JSON.parse(raw):null;}const previous=visitBaseline;visitChanges=previous?{since:previous.at,...compareVisits(previous,current)}:{first:true};localStorage.setItem('sabre-visit-v1',JSON.stringify(current));}catch{visitChanges={unavailable:true};}
}
function changesPanel(){
 const c=visitChanges;if(!c||c.first||c.unavailable)return '';
 const total=c.roadmap+c.completed+c.events;
 return `<details class="visit-summary"><summary>${total?'Changes since your last visit':'No recorded changes since your last visit'}</summary><small>Compared with ${e(c.since.slice(0,10))} in this browser: ${c.roadmap} changed Gantt rows · ${c.completed} tasks completed · ${c.events} calendar entries added.</small></details>`;
}
function navigate(target){if(!views.includes(target))return;view=target;if(location.hash!=='#'+target)history.pushState(null,'','#'+target);render();window.scrollTo(0,0);$('#content').focus({preventScroll:true});}
window.addEventListener('popstate',()=>{if(location.hash==='#content')return;view=views.includes(location.hash.slice(1))?location.hash.slice(1):'overview';if(data)render();});
function overview(){
 const r=data.roadmap,cfg=data.overview.display||{};
 return `<div class="overview-heading"><div><span class="eyebrow">Collaborator workspace</span><h2>${e(data.overview.title)}</h2><p class="program-context">${e(cfg.intro??'V1 experiments, V2 construction, instrumentation and separation.')}</p></div><button class="secondary" id="refresh-overview" aria-label="Reload published project data">Refresh</button></div>
 <div class="publication-bar"><small>Published ${e(data.overview.updated||'date unavailable')}</small><details><summary>Source coverage</summary><ul>${sourceConnectionRows()}</ul><small>Only approved material is shared here.</small></details></div>
 <section class="source-panel roadmap-preview" ${cfg.show_roadmap===false?'hidden':''}><div class="section-heading"><div><span class="source-tag">Original Gantt workbook</span><h2>Project roadmap</h2></div>${jump('gantt','Full Gantt')}</div><div class="roadmap-actions"><small>Expand a workstream; select a row for dates and source details.</small><button class="inline-link" id="expand-roadmap">Expand all</button><button class="inline-link" id="collapse-roadmap">Collapse all</button></div><div class="preview-controls" hidden><select id="roadmap-stream"><option value=""></option></select><select id="roadmap-depth"><option value="bands"></option></select><select id="roadmap-scale"><option value="fit"></option></select><label><select id="roadmap-month"><option value=""></option></select></label></div><div id="roadmap-grid"></div><small>Solid: expected work · pale: pessimistic extension · ◇ milestone · ○ decision · △ arrival</small>${cfg.show_milestones===false?'':milestoneHistory(true)}<details><summary>Workbook source details</summary><p>${e(r.warning)}</p></details></section>
 <div class="source-columns configurable-columns"><section class="source-panel" ${cfg.show_calendar===false?'hidden':''}><div class="section-heading"><div><span class="source-tag">Google Calendar</span><h2>Upcoming schedule</h2></div>${jump('calendar','Schedule')}</div>${agenda(true)}</section><section class="source-panel todoist-panel" ${cfg.show_tasks===false?'hidden':''}><div class="section-heading"><div><span class="source-tag">Todoist · original organization</span><h2>Project tasks</h2></div>${jump('tasks','Browse tasks')}</div><div class="overview-task-list">${todoistTree(true,'',cfg.task_limit||12)}${data.overview.tasks.length>(cfg.task_limit||12)?'<small>Showing a source-order subset. Open Browse tasks for the full shared list.</small>':''}</div></section></div>
 <section class="source-panel" ${cfg.show_resources===false?'hidden':''}><div class="section-heading"><div><span class="source-tag">Shared reference material</span><h2>Resources for collaborators</h2></div>${jump('resources','Browse resources')}</div>${data.overview.resources.length?`<div class="resource-preview-grid">${data.overview.resources.slice(0,cfg.resource_limit||4).map(r=>`<article><small>${e(r.category||'Reference')}</small><h3>${resourceLink(r)}</h3>${r.description?`<p>${e(r.description)}</p>`:''}</article>`).join('')}</div>`:'<p class="empty">Approved papers, diagrams and reference links will appear here when shared.</p>'}</section>${cfg.show_changes===false?'':changesPanel()}`;
}
function resourceLink(r){return r.url?sourceLink(r.url,r.title):`<a href="${e(r.download_url||'/files/'+encodeURIComponent(r.id))}" ${staticSite?'download':''}>${e(r.title)} ↓</a>`;}
function sourceConnectionRows(){
 const labels={not_connected:'Not connected',pending_credentials:'Credentials pending',unverified:'Private import not yet verified',verified:'Connected',partial:'Connected · incomplete import',unavailable:'Source unavailable'};
 return Object.entries({calendar:'Google Calendar',todoist:'Todoist'}).map(([key,name])=>{const c=key==='todoist'&&data.liveTodoist?{status:'verified',checked_at:data.liveTodoist.fetched_at}:data.overview.source_connections?.[key]||{status:'not_connected'};return `<li><b>${name}:</b> ${e(labels[c.status]||labels.unverified)}${c.checked_at?' · Last check '+e(c.checked_at):''}</li>`;}).join('');
}
function calendarView(){return `<section class="source-panel"><h2>Google Calendar</h2>${agenda()}</section>`;}
function resources(){
 const groups=[['reading','Background reading','Papers and explanations that provide context for the research.'],['reference','Reference files','Approved diagrams and low-sensitivity reference material.'],['tool','Useful tools','Links to tools collaborators can use while working on the project.']];
 return `<label class="search-field">Find a resource<input id="resource-search" type="search" value="${e(resourceQuery)}" placeholder="Search titles and descriptions"></label><div id="resource-results"><section class="intro resource-intro"><div><span class="eyebrow">Get up to speed</span><h2>Approved resources</h2><p>Approved papers, diagrams, tools and reference material.</p></div></section>${groups.map(([key,title,description])=>{
 const items=data.overview.resources.filter(r=>[r.title,r.description].some(x=>(x||'').toLowerCase().includes(resourceQuery.toLowerCase()))).filter(r=>(['reading','tool'].includes(r.category)?r.category:'reference')===key);
 return items.length?`<section class="resource-group" aria-labelledby="resources-${key}"><h2 id="resources-${key}">${title}</h2><p class="resource-context">${description}</p>${items.map(r=>`<article class="resource-item"><small>${r.url?'External link · Opens in a new tab':'File download'}</small><h3><a href="${r.url?e(r.url):e(r.download_url||'/files/'+encodeURIComponent(r.id))}" ${r.url?'target="_blank" rel="noopener noreferrer"':(staticSite?'download':'')}>${e(r.title)} ${r.url?'↗':'↓'}</a></h3>${r.description?`<p>${e(r.description)}</p>`:''}</article>`).join('')}</section>`:'';
 }).join('')||'<p class="empty">No matching resources.</p>'}</div>`;
}
function render(){
 const cfg=data.overview.display||{};document.documentElement.dataset.theme=cfg.theme||'navy';const shown=v=>({gantt:cfg.show_roadmap,calendar:cfg.show_calendar,tasks:cfg.show_tasks,resources:cfg.show_resources,notes:cfg.show_notes,discussion:cfg.show_discussion})[v]!==false;if(!shown(view))view='overview';document.querySelectorAll('[data-view]').forEach(b=>b.hidden=!shown(b.dataset.view));
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
 $('#content').innerHTML=view==='notes'?notesView():view==='discussion'?discussionView():view==='gantt'?renderGantt():view==='resources'?resources():view==='tasks'?`<section class="source-panel"><span class="source-tag">Todoist</span><h2>Tasks by project and section</h2><div class="task-controls"><label>Find a task<input id="task-search" type="search" value="${e(taskQuery)}" placeholder="Search task, project or section"></label><label>Show<select id="task-scope"><option value="active" ${taskScope==='active'?'selected':''}>Active tasks</option><option value="all" ${taskScope==='all'?'selected':''}>All shared tasks</option></select></label></div><div id="task-results">${todoistTree(taskScope==='active',taskQuery)}</div></section>`:view==='calendar'?calendarView():overview();
 document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>navigate(b.dataset.jump));
 document.querySelectorAll('[data-open-roadmap]').forEach(b=>b.onclick=()=>showRoadmapEvidence(b.dataset.openRoadmap));
 if(view==='tasks'){const update=()=>{$('#task-results').innerHTML=todoistTree(taskScope==='active',taskQuery);};$('#task-search').oninput=ev=>{taskQuery=ev.target.value;update();};$('#task-scope').onchange=ev=>{taskScope=ev.target.value;update();};}
 if(view==='resources')$('#resource-search').oninput=ev=>{resourceQuery=ev.target.value;const wrapper=document.createElement('div');wrapper.innerHTML=resources();$('#resource-results').replaceChildren(...wrapper.querySelector('#resource-results').childNodes);};
 if(view==='gantt')restoreGanttSettings();
 if(view==='overview'){drawCompactRoadmap();$('#refresh-overview').onclick=()=>loadOverview();$('#expand-roadmap').onclick=()=>document.querySelectorAll('.roadmap-group').forEach(g=>g.open=true);$('#collapse-roadmap').onclick=()=>document.querySelectorAll('.roadmap-group').forEach(g=>g.open=false);}
}

document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if(!data)return;navigate(b.dataset.view);});
async function loadOverview(date=''){
 const sequence=++requestSequence;$('#message').textContent='Refreshing published overview…';
 try{
  const response=await fetch(staticSite?'./snapshot.json':'/api/public'+(date?'?date='+encodeURIComponent(date):''),{cache:'no-cache'});
  if(!response.ok)throw Error();const next=await response.json();
  if(staticSite&&date&&date!==next.selected_date){
   if(date<next.static_range.start||date>next.static_range.finish)throw Error('Date outside published range');
   const recap=await fetch('./recaps/'+encodeURIComponent(date)+'.json',{cache:'no-cache'});if(!recap.ok)throw Error();next.periods=await recap.json();next.selected_date=date;
  }
  if(sequence!==requestSequence)return;data=next;rememberVisit();render();$('#message').textContent='';loadLiveTodoist(sequence);
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
 <p class="muted">The full schedule fits your screen. An outlined week marks today. Tap a band for task details and results. Choose Month for closer reading or Original weekly grid for the Excel layout.</p><div id="roadmap-grid"></div><section id="roadmap-evidence" class="reading-section" aria-live="polite"><h2>Schedule & recorded work</h2><p>Select a row above to compare its original schedule with linked research updates.</p><p>Only published research updates appear here. Select Resources for shared reference material.</p></section>`;
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
 if(view!=='gantt')navigate('gantt');
 const r=data.roadmap,row=r.rows.find(t=>t.id===id);if(!row)return;const ids=[id,...r.rows.filter(t=>t.parent===id).map(t=>t.id)],tasks=r.tasks.filter(t=>ids.includes(t.ID)),notes=roadmapNotes(ids);
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
 if(view==='overview'){const root=$('#roadmap-grid .compact-gantt');let group;[...root.children].forEach(el=>{if(el.matches('.compact-section')){group=document.createElement('details');group.className='roadmap-group';const heading=document.createElement('summary');heading.textContent=el.textContent;group.append(heading);el.replaceWith(group);}else if(group){group.append(el);}});const groups=root.querySelectorAll('.roadmap-group');groups.forEach((g,i)=>{g.open=i===1;const count=g.querySelectorAll('.compact-row').length;g.querySelector('summary').append(' · '+count+' rows');});}
 document.querySelectorAll('[data-roadmap-id]').forEach(b=>b.onclick=()=>showRoadmapEvidence(b.dataset.roadmapId));
}

function discussionView(){
 const board='https://sabre-member-board.domotota.workers.dev';
 return `<section class="source-panel"><span class="source-tag">Collaborator discussion</span><h2>Discuss the project</h2><p>Anyone can read. Only approved members can post. Sign in with GitHub to request access; the project owner approves requests.</p><p><a href="${board}" target="_blank" rel="noopener noreferrer">Open member board to sign in or post ↗</a></p>${window.self===window.top?`<iframe class="member-board" title="SABRE collaborator discussion board" src="${board}" loading="lazy" referrerpolicy="no-referrer"></iframe>`:'<p class="muted">Open the member board in your browser to preview the live discussion.</p>'}</section>`;
}

function calendarEmbed(compact=false){
 const id=data.overview.display.calendar_id;if(!id)return '<p>Calendar ID is unavailable.</p>';
 const url=new URL('https://calendar.google.com/calendar/embed');url.searchParams.set('src',id);url.searchParams.set('ctz','America/New_York');url.searchParams.set('mode',compact?'AGENDA':'WEEK');
 if(location.hostname==='127.0.0.1'&&location.pathname.startsWith('/preview/'))return `<p>Full Google Calendar enabled.</p>${sourceLink(url.href,'Open live calendar preview ↗')}<small>On the published website, this appears as an embedded calendar.</small>`;
 return `<div class="google-calendar"><small>Live Google Calendar · Google sharing permissions apply</small><iframe title="Google Calendar${compact?' agenda':''}" src="${e(url.href)}" loading="lazy" referrerpolicy="no-referrer" class="${compact?'compact-calendar':'full-calendar'}"></iframe>${sourceLink(url.href,'Open full calendar ↗')}<small>If Google reports no access, the calendar owner must adjust its sharing permissions.</small></div>`;
}
function notesView(){const notes=[...(data.overview.public_notes||[])].sort((a,b)=>b.date.localeCompare(a.date));return `<section class="source-panel"><span class="source-tag">Owner-published notes</span><h2>Research notes</h2>${notes.map(n=>`<article class="published-note"><time>${e(n.date)}</time><h3>${e(n.title)}</h3><div class="note-text">${e(n.text)}</div>${sourceLink(n.url)}</article>`).join('')||'<p class="empty">No notes published yet.</p>'}</section>`;}
async function loadLiveTodoist(sequence){
 try{const r=await fetch('https://sabre-member-board.domotota.workers.dev/public/todoist',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const value=await r.json();if(sequence!==requestSequence)return;if(value.enabled){data.liveTodoist=value;data.overview.tasks=value.tasks;}data.todoistError=false;render();}
 catch{if(sequence!==requestSequence)return;data.todoistError=true;render();}
}
function liveTodoistTree(query='',limit=Infinity){
 const live=data.liveTodoist,needle=query.trim().toLowerCase();let remaining=limit;
 const sections=live.sections.map(section=>{const all=live.tasks.filter(t=>t.section_id===section.id);const matches=t=>[t.title,t.description,section.name,live.project.name].some(x=>(x||'').toLowerCase().includes(needle));const keep=new Set();for(const t of all.filter(matches)){let current=t;while(current&&!keep.has(current.id)){keep.add(current.id);current=all.find(p=>p.id==='todoist:'+current.parent_id);}}const filtered=needle?all.filter(t=>keep.has(t.id)):all;
 if(needle&&!filtered.length)return '';const rows=filtered.slice(0,Math.max(0,remaining));remaining-=rows.length;
 const ordered=[],seen=new Set(),walk=(t,depth=0)=>{if(seen.has(t.id))return;seen.add(t.id);ordered.push([t,depth]);rows.filter(c=>t.id==='todoist:'+c.parent_id).forEach(c=>walk(c,Math.min(depth+1,5)));};rows.filter(t=>!rows.some(p=>p.id==='todoist:'+t.parent_id)).forEach(t=>walk(t));rows.forEach(t=>walk(t));
 return `<div class="todoist-section"><h4>${e(section.name)} <small>${all.length}</small></h4><ul>${ordered.map(([t,depth])=>`<li style="--depth:${depth}"><span aria-hidden="true">○</span><div>${sourceLink(t.url,t.title)||e(t.title)}${t.due_date?`<small>Due ${e(t.due_date)}</small>`:''}${t.description?`<details><summary>Description</summary><div class="note-text">${e(t.description)}</div></details>`:''}</div></li>`).join('')}</ul>${filtered.length>rows.length?'<small>More tasks in the Tasks view.</small>':!all.length?'<small>No active tasks.</small>':''}</div>`;
 }).join('');
 return `<section class="todoist-project"><small>Live Todoist · refreshed ${e(new Date(live.fetched_at).toLocaleString())}</small><h3>${e(live.project.name)}</h3><div class="todoist-sections ${live.layout==='columns'?'section-columns':''}">${sections||'<p>No matching tasks.</p>'}</div></section>`;
}
