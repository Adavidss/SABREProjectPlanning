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
 const rows=roadmapMilestones();
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
const ICONS={flag:'M3.5 14V2.5M3.5 3h8l-2 3 2 3h-8',check:'M2 4.5l1.5 1.5L6 3.5M8.5 5h5.5M2 10.5l1.5 1.5L6 9.5M8.5 11h5.5',clock:'M8 1.75a6.25 6.25 0 1 0 0 12.5a6.25 6.25 0 1 0 0-12.5M8 4.5V8l2.5 1.5',calendar:'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',book:'M2 3h4.5A1.5 1.5 0 0 1 8 4.5V13a1.5 1.5 0 0 0-1.5-1H2zM14 3H9.5A1.5 1.5 0 0 0 8 4.5V13a1.5 1.5 0 0 1 1.5-1H14z',target:'M8 1.75a6.25 6.25 0 1 0 0 12.5a6.25 6.25 0 1 0 0-12.5M8 5.25a2.75 2.75 0 1 0 0 5.5a2.75 2.75 0 1 0 0-5.5',diamond:'M8 1.75L14.25 8L8 14.25L1.75 8z',streams:'M2 4.5h12M2 8h8.5M2 11.5h5',people:'M5.5 7.5a2.25 2.25 0 1 0 0-4.5a2.25 2.25 0 1 0 0 4.5M1.5 13.5c.4-2.3 2-3.6 4-3.6s3.6 1.3 4 3.6M11 7.25a1.9 1.9 0 1 0 0-3.8M11.6 9.9c1.6.3 2.7 1.5 3 3.6',mail:'M1.75 3.5h12.5v9H1.75zM1.75 4l6.25 5 6.25-5',chat:'M2 3h12v8H8l-3.5 2.5V11H2z'};
function icon(name){return `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="${ICONS[name]}"/></svg>`;}
function panelHeading(iconName,tag,title,action=''){return `<div class="section-heading"><div class="heading-lockup">${icon(iconName)}<div>${tag?`<span class="source-tag">${e(tag)}</span>`:''}<h2>${title}</h2></div></div>${action}</div>`;}
// Primary content opens in-page detail; external source links keep the underlined link style.
function itemButton(attr,id,title,hint){return `<button class="item-link" ${attr}="${e(id)}">${e(title)}<span class="visually-hidden"> — ${e(hint)}</span><span class="link-cue" aria-hidden="true">›</span></button>`;}
function overview(){
 const r=data.roadmap,cfg=data.overview.display||{},sections=r.rows.filter(x=>x.section);
 return `<div class="publication-bar utility-row" role="group" aria-label="Update time and sources"><small class="utility-item">${icon('clock')}<span>Updated <time datetime="${e(data.overview.updated||'')}">${e(friendlyDate(data.overview.updated)||'date unavailable')}</time></span></small><button class="inline-link refresh-utility" id="refresh-overview" aria-label="Refresh the overview and live sources">↻ Refresh</button><details class="sources-disclosure"><summary aria-label="Sources and their refresh times">Sources</summary><div class="utility-popover"><ul>${sourceConnectionRows()}</ul><small>Published content and live sources refresh separately.</small></div></details></div>
 ${programSummary()}
 ${latestUpdates()}
 <div class="tier tier-active">
 <section class="source-panel roadmap-panel" ${cfg.show_roadmap===false?'hidden':''}>${panelHeading('flag','Original Gantt workbook','Roadmap at a glance',jump('gantt','View full Gantt'))}${roadmapSummary()}<details class="quiet-details"><summary>About this schedule</summary><p>${e(r.warning)}</p><p>${sections.length} source schedule sections:</p><ul>${sections.map(x=>`<li>${e(x.section)}</li>`).join('')}</ul></details></section>
 ${cfg.show_tasks===false?'':operationalSummary()}
 </div>
 <div class="tier tier-support"><div class="source-columns configurable-columns"><section class="source-panel" ${cfg.show_calendar===false?'hidden':''}>${panelHeading('calendar','Google Calendar','Upcoming schedule',jump('calendar','Full calendar'))}${agenda(true)}</section><section class="source-panel" ${cfg.show_resources===false?'hidden':''}>${panelHeading('book','Shared reference material','Explore the research',jump('resources','All resources'))}${data.overview.resources.length?`<div class="resource-preview-grid">${data.overview.resources.slice(0,cfg.resource_limit||4).map(r=>`<article><small>${e(resourceCategories[r.category]||'Reference')}</small><h3>${resourceLink(r)}</h3>${r.description?`<p>${e(r.description)}</p>`:''}</article>`).join('')}</div>`:'<p class="empty">Papers, protocols and reference files appear here when published.</p>'}${cfg.show_notes===false?'':jump('notes','Notes & decisions')}</section></div></div>
 ${peopleSection()}
 ${cfg.show_changes===false?'':changesPanel()}`;
}

function resourceLink(r){return r.url?sourceLink(r.url,r.title):`<a href="${e(r.download_url||'/files/'+encodeURIComponent(r.id))}" ${staticSite?'download':''}>${e(r.title)} ↓</a>`;}
function sourceConnectionRows(){
 const labels={not_connected:'Not connected',pending_credentials:'Credentials pending',unverified:'Private import not yet verified',verified:'Connected',partial:'Connected · incomplete import',unavailable:'Source unavailable'};
 return Object.entries({calendar:'Google Calendar',todoist:'Todoist'}).map(([key,name])=>{const c=key==='todoist'&&data.liveTodoist?{status:'verified',checked_at:data.liveTodoist.fetched_at}:data.overview.source_connections?.[key]||{status:'not_connected'};return `<li><b>${name}:</b> ${e(labels[c.status]||labels.unverified)}${c.checked_at?' · Last check '+e(/T/.test(c.checked_at)&&!isNaN(Date.parse(c.checked_at))?new Date(c.checked_at).toLocaleString():c.checked_at):''}</li>`;}).join('');
}
function calendarView(){return `<section class="source-panel"><h2>Google Calendar</h2>${agenda()}</section>`;}
function resources(){
 const groups=Object.entries(resourceCategories).map(([key,title])=>[key,title,'']);
 return `<div class="task-controls"><label>Category<select id="resource-category"><option value="">All categories</option>${Object.entries(resourceCategories).map(([k,v])=>`<option value="${k}" ${resourceCategory===k?'selected':''}>${v}</option>`).join('')}</select></label>${streamOptions(resourceStream)}<label class="search-field">Find a resource<input id="resource-search" type="search" value="${e(resourceQuery)}" placeholder="Search titles and descriptions"></label></div><div id="resource-results"><section class="intro resource-intro"><div><span class="eyebrow">Get up to speed</span><h2>Approved resources</h2><p>Approved papers, diagrams, tools and reference material.</p></div></section>${groups.map(([key,title,description])=>{
 const items=data.overview.resources.filter(r=>[r.title,r.description].some(x=>(x||'').toLowerCase().includes(resourceQuery.toLowerCase()))).filter(r=>(resourceCategories[r.category]?r.category:'reference')===key&&(!resourceCategory||key===resourceCategory)&&(!resourceStream||sameStream(r.workstream,resourceStream)));
 return items.length?`<section class="resource-group" aria-labelledby="resources-${key}"><h2 id="resources-${key}">${title}</h2><p class="resource-context">${description}</p>${items.map(r=>`<article class="resource-item"><small>${r.url?'External link · Opens in a new tab':'File download'}</small><h3><a href="${r.url?e(r.url):e(r.download_url||'/files/'+encodeURIComponent(r.id))}" ${r.url?'target="_blank" rel="noopener noreferrer"':(staticSite?'download':'')}>${e(r.title)} ${r.url?'↗':'↓'}</a></h3>${r.description?`<p>${e(r.description)}</p>`:''}${r.workstream?streamChip(r.workstream):''}</article>`).join('')}</section>`:'';
 }).join('')||'<p class="empty">No matching resources.</p>'}</div>`;
}
function render(){
 const cfg=data.overview.display||{};document.documentElement.dataset.theme=cfg.theme||'navy';$('#project-title').textContent=data.overview.title||'SABRE';$('#project-subtitle').textContent=cfg.intro||'';const shown=v=>({gantt:cfg.show_roadmap,calendar:cfg.show_calendar,tasks:cfg.show_tasks,resources:cfg.show_resources,notes:cfg.show_notes,discussion:cfg.show_discussion})[v]!==false;if(!shown(view))view='overview';document.querySelectorAll('[data-view]').forEach(b=>b.hidden=!shown(b.dataset.view));
 document.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const focused=document.activeElement?.id&&$('#content').contains(document.activeElement)?{id:document.activeElement.id,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:null;
 $('#content').innerHTML=view==='notes'?notesView():view==='discussion'?discussionView():view==='gantt'?renderGantt():view==='resources'?resources():view==='tasks'?`<section class="source-panel"><span class="source-tag">Todoist</span><h2>Tasks by project and section</h2><div class="task-controls"><label>Find a task<input id="task-search" type="search" value="${e(taskQuery)}" placeholder="Search task, project or section"></label><label>Show<select id="task-scope"><option value="active" ${taskScope==='active'?'selected':''}>Active tasks</option><option value="all" ${taskScope==='all'?'selected':''}>All shared tasks</option></select></label></div><div id="task-results">${todoistTree(taskScope==='active',taskQuery)}</div></section>`:view==='calendar'?calendarView():overview();
 document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>navigate(b.dataset.jump));
 document.querySelectorAll('[data-open-note]').forEach(b=>b.onclick=()=>openNote(b.dataset.openNote));
 document.querySelectorAll('[data-open-roadmap]').forEach(b=>b.onclick=()=>showRoadmapEvidence(b.dataset.openRoadmap));
 if(view==='tasks'){const update=()=>{$('#task-results').innerHTML=todoistTree(taskScope==='active',taskQuery);};$('#task-search').oninput=ev=>{taskQuery=ev.target.value;update();};$('#task-scope').onchange=ev=>{taskScope=ev.target.value;update();};}
 if(view==='notes')$('#note-kind').onchange=ev=>{noteKind=ev.target.value;$('#notes-results').innerHTML=noteArticles();bindRecordLinks();};
 if(view==='resources')$('#resource-category').onchange=ev=>{resourceCategory=ev.target.value;const wrapper=document.createElement('div');wrapper.innerHTML=resources();$('#resource-results').replaceChildren(...wrapper.querySelector('#resource-results').childNodes);};
 if(view==='resources')$('#resource-search').oninput=ev=>{resourceQuery=ev.target.value;const wrapper=document.createElement('div');wrapper.innerHTML=resources();$('#resource-results').replaceChildren(...wrapper.querySelector('#resource-results').childNodes);};
 if(view==='gantt')restoreGanttSettings();
 if(view==='overview'){$('#refresh-overview').onclick=()=>loadOverview();bindContact();}
 if(view==='gantt')bindGantt();
 document.querySelectorAll('[data-stream-gantt]').forEach(b=>b.onclick=()=>openGanttStream(b.dataset.streamGantt));
 document.querySelectorAll('[data-stream-notes]').forEach(b=>b.onclick=()=>{noteKind='';noteStream=b.dataset.streamNotes;navigate('notes');});
 document.querySelectorAll('[data-stream-resources]').forEach(b=>b.onclick=()=>{resourceCategory='';resourceStream=b.dataset.streamResources;navigate('resources');});
 document.querySelectorAll('[data-stream-filter]').forEach(sel=>sel.onchange=()=>{if(view==='notes'){noteStream=sel.value;$('#notes-results').innerHTML=noteArticles();bindRecordLinks();}else{resourceStream=sel.value;const wrapper=document.createElement('div');wrapper.innerHTML=resources();$('#resource-results').replaceChildren(...wrapper.querySelector('#resource-results').childNodes);bindRecordLinks();}});
 // Re-rendering after live data arrives must not steal focus or typed text from the visitor.
 if(focused){const el=document.getElementById(focused.id);if(el){el.focus({preventScroll:true});try{if(focused.start!=null)el.setSelectionRange(focused.start,focused.end);}catch{}}}
 document.querySelector('.site-nav [aria-current="page"]')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function bindRecordLinks(){document.querySelectorAll('#content [data-stream-gantt]').forEach(b=>b.onclick=()=>openGanttStream(b.dataset.streamGantt));}

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
  if(sequence!==requestSequence)return;data=next;rememberVisit();render();$('#message').textContent='';loadLiveTodoist(sequence);loadContact();
 }
 catch{if(sequence!==requestSequence)return;if(data&&$('#review-date'))$('#review-date').value=data.selected_date;$('#message').textContent=data?'Refresh failed. The previous overview remains visible; its dates have not changed.':'Overview could not load. Reload the page to try again.';}
}
// Sticky compact bar: one IntersectionObserver instead of a scroll handler.
(()=>{if(typeof document.querySelector!=='function')return;const nav=$('.site-nav'),sentinel=$('#nav-sentinel');if(nav&&sentinel&&'IntersectionObserver' in window)new IntersectionObserver(([entry])=>{const stuck=!entry.isIntersecting;nav.classList.toggle('is-stuck',stuck);const home=nav.querySelector('.nav-home');home.tabIndex=stuck?0:-1;home.toggleAttribute('aria-hidden',!stuck);}).observe(sentinel);
 document.querySelectorAll('[data-home]').forEach(a=>a.onclick=ev=>{ev.preventDefault();if(!data)return;if(view!=='overview')navigate('overview');window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});})();
loadOverview();
function roadmapNotes(ids){return data.overview.updates.filter(n=>ids.includes(n.task_id)).map(n=>({date:n.date,roadmap_task_id:n.task_id,text:n.result||n.summary}));}
function renderGantt(){
 const r=data.roadmap;
 return `<section class="intro"><div><span class="eyebrow">Original workbook · Gantt Overview</span><h2>SABRE polarizer</h2><p>V1 experiments · V2 build · separation</p></div></section>
 <details class="source-notice quiet-details"><summary>About this schedule</summary>${e(r.warning)}</details>
 <div class="roadmap-key"><span><i style="background:#c0504d"></i>Solid: expected work window</span><span><i style="background:#f0dcdb"></i>Pale: extension to pessimistic finish</span><span>◇ Milestone</span><span>○ Decision gate</span><span>△ Arrival</span><span>● Published update</span><span><i class="today-key"></i>Today</span></div>
 <div class="toolbar gantt-toolbar"><label>Workstream<select id="roadmap-stream"><option value="">All workstreams</option>${r.rows.filter(x=>x.section).map(x=>`<option value="${e(x.section)}">${e(x.section)}</option>`).join('')}</select></label><label>View<select id="roadmap-depth"><option value="bands">Work bands</option><option value="tasks">All task rows</option></select></label><label>Scale<select id="roadmap-scale"><option value="fit">Fit whole schedule</option><option value="month">Month</option><option value="sheet">Original weekly grid</option></select></label><label>Month<select id="roadmap-month">${[...new Set(r.weeks.map(w=>w.start.slice(0,7)))].map(m=>`<option value="${m}" ${m===data.today.slice(0,7)?'selected':''}>${new Date(m+'-15T12:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})}</option>`).join('')}</select></label>${r.weeks.some(w=>w.start<=data.today&&data.today<=w.finish)?'<button class="secondary" id="roadmap-today">Today</button>':''}</div>
 <p class="muted">The full schedule fits your screen; the outlined week is today. Select a row for its details. Choose Month for closer reading or Original weekly grid for the Excel layout.</p><div id="roadmap-grid"></div>
 <dialog id="roadmap-drawer" class="drawer" aria-labelledby="drawer-title"><div class="drawer-bar"><span class="eyebrow">Gantt details</span><button class="secondary drawer-close" id="drawer-close" aria-label="Close details">✕</button></div><div id="roadmap-evidence"></div></dialog>`;
}

function bindGantt(){
 const drawer=$('#roadmap-drawer');$('#drawer-close').onclick=()=>drawer.close();drawer.onclick=ev=>{if(ev.target===drawer)drawer.close();};
 drawer.onclose=()=>{document.querySelector('[data-roadmap-id].is-selected')?.focus();};
 if($('#roadmap-today'))$('#roadmap-today').onclick=()=>{const scale=$('#roadmap-scale').value;if(scale!=='sheet'){ganttSettings['roadmap-scale']='month';ganttSettings['roadmap-month']=data.today.slice(0,7);restoreGanttSettings();}const cell=document.querySelector('#roadmap-grid .current-week,#roadmap-grid [data-week].is-today');cell?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest',inline:'center'});};
}
function openNote(id){noteKind='';noteStream='';navigate('notes');const note=document.getElementById('note-'+id);if(note){note.tabIndex=-1;note.focus();note.scrollIntoView({block:'start'});}}
function drawRoadmap(){
 $('#roadmap-month').parentElement.hidden=$('#roadmap-scale').value!=='month';
 if($('#roadmap-scale').value!=='sheet'){drawCompactRoadmap();return;}
 const r=data.roadmap,filter=$('#roadmap-stream').value,all=$('#roadmap-depth').value==='tasks';let section='';
 const rows=r.rows.filter(x=>{if(x.section)section=x.section;return (!filter||filter===section)&&(all||!x.parent);});
 const months=[];r.weeks.forEach(w=>{const key=w.start.slice(0,7);if(months.at(-1)?.key===key)months.at(-1).n++;else months.push({key,n:1});});
 const fmt=d=>new Date(d+'T12:00').toLocaleDateString(undefined,{month:'short',day:'numeric'});
 $('#roadmap-grid').innerHTML=`<div class="roadmap-scroll" tabindex="0" role="region" aria-label="Original workbook weekly Gantt, scroll horizontally"><table class="source-gantt"><thead><tr><th class="frozen" rowspan="2">Work band / task<br><small>Original workbook IDs</small></th>${months.map(m=>`<th colspan="${m.n}">${new Date(m.key+'-15T12:00').toLocaleDateString(undefined,{month:'long',year:'numeric'})}</th>`).join('')}</tr><tr>${r.weeks.map(w=>`<th class="week-heading ${w.start<=data.today&&data.today<=w.finish?'is-today':''}" data-week="${w.start}" ${w.start<=data.today&&data.today<=w.finish?'aria-current="date"':''}>Week of<br>${fmt(w.start)}<small>through ${fmt(w.finish)}</small></th>`).join('')}</tr></thead><tbody>${rows.map(x=>{
 if(x.section)return `<tr class="source-band"><th class="frozen">${e(x.section)}</th><td colspan="${r.weeks.length}"></td></tr>`;
 const ids=[x.id,...r.rows.filter(t=>t.parent===x.id).map(t=>t.id)],notes=roadmapNotes(ids);
 return `<tr class="${x.parent?'source-child':''}"><th class="frozen"><button class="source-row-button" data-roadmap-id="${e(x.id)}"><strong>${e(x.id)}</strong> ${e(x.title)}<small>${e(x.owner)} · ${notes.length?notes.length+' published updates':'No published updates'}</small></button></th>${x.cells.map((c,i)=>{const ns=notes.filter(n=>n.date>=r.weeks[i].start&&n.date<=r.weeks[i].finish);const mark={'<>':'◇','o':'○','^':'△'}[c.mark]||c.mark;return `<td><div class="source-cell" style="${c.fill?'background:'+c.fill:''}" title="${e(x.id+' · '+r.weeks[i].start+' through '+r.weeks[i].finish)}">${e(mark)}</div>${ns.length?`<button class="source-note-dot" data-roadmap-id="${e(x.id)}" title="${ns.length} published updates this week">●<span class="sr-only"> ${ns.length} published updates</span></button>`:''}</td>`;}).join('')}</tr>`;
 }).join('')}</tbody></table></div>`;
 document.querySelectorAll('[data-roadmap-id]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-roadmap-id].is-selected').forEach(x=>x.classList.remove('is-selected'));b.classList.add('is-selected');showRoadmapEvidence(b.dataset.roadmapId);});
}
function showRoadmapEvidence(id){
 if(view!=='gantt')navigate('gantt');
 const r=data.roadmap,row=r.rows.find(t=>t.id===id);if(!row)return;const ids=[id,...r.rows.filter(t=>t.parent===id).map(t=>t.id)],tasks=r.tasks.filter(t=>ids.includes(t.ID)),notes=roadmapNotes(ids),section=sectionOf(id),stream=shortName(section),cfg=data.overview.display||{};
 const dateText=v=>v==='#VALUE!'?'Unavailable — source formula error':v||'Not scheduled';
 const relNotes=cfg.show_notes===false?[]:(data.overview.public_notes||[]).filter(n=>sameStream(n.workstream,stream)),relRes=cfg.show_resources===false?[]:(data.overview.resources||[]).filter(x=>sameStream(x.workstream,stream));
 $('#roadmap-evidence').innerHTML=`<h2 id="drawer-title">${e(id)} · ${e(row.title)}</h2><p class="muted">${section?`${streamChip(stream)} · `:''}Gantt Overview row ${row.row} · ${e(row.owner)}</p>${tasks.map(t=>`<details ${tasks.length===1?'open':''}><summary>${e(t.ID)} · ${e(t.Task)}</summary><p><b>Expected:</b> ${e(dateText(t['Start (expected)']))} → ${e(dateText(t['Finish (expected)']))}<br><b>Pessimistic:</b> ${e(dateText(t['Start (pessim.)']))} → ${e(dateText(t['Finish (pessim.)']))}</p><p>Predecessors: ${e(t.Predecessors||'None listed')}</p></details>`).join('')}<h3>Published updates · ${notes.length}</h3>${notes.map(n=>`<article class="reading-row"><small>${e(n.date)} · ${e(n.roadmap_task_id)}</small><p class="evidence">${e(n.cleaned_text??n.text)}</p></article>`).join('')||'<p>No evidence linked yet. This does not mean the work has not happened.</p>'}${relNotes.length||relRes.length?`<h3>Related to ${e(stream)}</h3><ul class="related-list">${relNotes.map(n=>`<li><button class="inline-link" data-open-note="${e(n.id)}">${e(n.title)} ›</button><small>${e(noteKinds[n.kind]||'Note')} · ${e(n.date)}</small></li>`).join('')}${relRes.map(x=>`<li>${resourceLink(x)}<small>${e(resourceCategories[x.category]||'Reference')}</small></li>`).join('')}</ul>`:''}<p class="muted">Published updates describe reported work; they do not establish completion.</p>`;
 const drawer=$('#roadmap-drawer');if(!drawer.open)drawer.showModal();$('#drawer-close').focus();
 drawer.querySelectorAll('[data-open-note]').forEach(b=>b.onclick=()=>{drawer.close();openNote(b.dataset.openNote);});
 drawer.querySelectorAll('[data-stream-gantt]').forEach(b=>b.onclick=()=>{drawer.close();ganttSettings['roadmap-stream']=b.dataset.streamGantt;restoreGanttSettings();});
}

function drawCompactRoadmap(){
 const r=data.roadmap,filter=$('#roadmap-stream').value,all=$('#roadmap-depth').value==='tasks',month=$('#roadmap-scale').value==='month',selected=$('#roadmap-month').value;
 const indices=r.weeks.map((w,i)=>i).filter(i=>!month||r.weeks[i].start.slice(0,7)===selected);
 const months=[];indices.forEach(i=>{const key=r.weeks[i].start.slice(0,7);if(months.at(-1)?.key===key)months.at(-1).n++;else months.push({key,n:1});});let section='';
 const rows=r.rows.filter(x=>{if(x.section)section=x.section;return (!filter||section===filter)&&(all||!x.parent);});
 const axis=()=>`<div class="compact-axis">${months.map(m=>`<span style="flex:${m.n}">${m.n<3&&!month?'·':new Date(m.key+'-15T12:00').toLocaleDateString(undefined,{month:'short'})}<small>${m.n<3&&!month?'':m.key.slice(2,4)}</small></span>`).join('')}</div>`;
 $('#roadmap-grid').innerHTML=`<div class="compact-gantt"><p class="muted">${e(r.weeks[indices[0]].start)} → ${e(r.weeks[indices.at(-1)].finish)}</p>${axis()}${month?`<div class="compact-axis">${indices.map(i=>`<span>Week of ${new Date(r.weeks[i].start+'T12:00').getDate()}</span>`).join('')}</div>`:''}${rows.map(x=>{
 if(x.section)return `${sectionHeading(x.section)}<div class="section-axis">${axis()}</div>`;
 const ids=[x.id,...r.rows.filter(t=>t.parent===x.id).map(t=>t.id)],notes=roadmapNotes(ids);
 return `<button class="compact-row ${x.parent?'compact-child':''}" data-roadmap-id="${e(x.id)}"><span class="compact-title"><b>${e(x.id)} · ${e(x.title)}</b>${notes.length?`<small>${notes.length} updates</small>`:''}</span><span class="compact-track" style="grid-template-columns:repeat(${indices.length},minmax(0,1fr))">${indices.map(i=>{const c=x.cells[i],dot=notes.some(n=>n.date>=r.weeks[i].start&&n.date<=r.weeks[i].finish);return `<span class="${r.weeks[i].start<=data.today&&data.today<=r.weeks[i].finish?'current-week':''}" style="${c.fill?'background:'+c.fill:''}" title="${e(r.weeks[i].start+' – '+r.weeks[i].finish)}">${e({'<>':'◇','o':'○','^':'△'}[c.mark]||c.mark)}${dot?'<i>●</i>':''}</span>`;}).join('')}</span></button>`;
 }).join('')}</div>`;
 if(view==='gantt'){const root=$('#roadmap-grid .compact-gantt');let group;[...root.children].forEach(el=>{if(el.matches('.compact-section')){group=document.createElement('details');group.className='roadmap-group';group.open=true;const summary=document.createElement('summary');el.replaceWith(group);summary.append(el);group.append(summary);}else if(group)group.append(el);});root.querySelectorAll('.roadmap-group').forEach(g=>{const count=document.createElement('small');count.className='section-count';count.textContent=g.querySelectorAll('.compact-row').length+' displayed rows';g.querySelector('summary').append(count);});}

 document.querySelectorAll('[data-roadmap-id]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-roadmap-id].is-selected').forEach(x=>x.classList.remove('is-selected'));b.classList.add('is-selected');showRoadmapEvidence(b.dataset.roadmapId);});
}

function discussionView(){
 return `<section class="discussion-frame" aria-labelledby="discussion-heading"><div class="discussion-head">${icon('chat')}<div><span class="source-tag">Community discussion · informal</span><h2 id="discussion-heading">Discuss the project</h2></div></div><p>Conversation among approved members. Posts are personal views, not official project records — see ${data.overview.display?.show_notes===false?'the Overview':'<button class="inline-link" data-jump="notes">Notes & decisions</button>'} for those.</p><p class="muted">Anyone can read. Sign in with GitHub to request posting access; the project owner approves members and moderates the board.</p><p><a href="${BOARD}" target="_blank" rel="noopener noreferrer">Open the board to sign in or post ↗</a></p>${window.self===window.top?`<iframe class="member-board" title="SABRE community discussion board" src="${BOARD}" loading="lazy" referrerpolicy="no-referrer"></iframe>`:'<p class="muted">Open the board in your browser to preview the live discussion.</p>'}</section>`;
}

function calendarEmbed(compact=false){
 const id=data.overview.display.calendar_id;if(!id)return '<p>Calendar ID is unavailable.</p>';
 const url=new URL('https://calendar.google.com/calendar/embed');url.searchParams.set('src',id);url.searchParams.set('ctz','America/New_York');url.searchParams.set('mode',compact?'AGENDA':'WEEK');
 if(location.hostname==='127.0.0.1'&&location.pathname.startsWith('/preview/'))return `<p>Full Google Calendar enabled.</p>${sourceLink(url.href,'Open live calendar preview ↗')}<small>On the published website, this appears as an embedded calendar.</small>`;
 return `<div class="google-calendar"><small>Live Google Calendar · Google sharing permissions apply</small><iframe title="Google Calendar${compact?' agenda':''}" src="${e(url.href)}" loading="lazy" referrerpolicy="no-referrer" class="${compact?'compact-calendar':'full-calendar'}"></iframe>${sourceLink(url.href,'Open full calendar ↗')}<small>If Google reports no access, the calendar owner must adjust its sharing permissions.</small></div>`;
}
let noteStream='',resourceStream='';
function streamOptions(selected){const names=roadmapStreams().streams.map(s=>s.name);return names.length?`<label>Workstream<select data-stream-filter><option value="">All workstreams</option>${names.map(n=>`<option ${sameStream(selected,n)?'selected':''}>${e(n)}</option>`).join('')}</select></label>`:'';}
function noteArticles(){return [...(data.overview.public_notes||[])].filter(n=>(!noteKind||(n.kind||'note')===noteKind)&&(!noteStream||sameStream(n.workstream,noteStream))).sort((a,b)=>b.date.localeCompare(a.date)).map(n=>`<article class="published-note" id="note-${e(n.id)}"><div class="note-meta"><span class="kind-chip">${e(noteKinds[n.kind]||'Note')}</span><time>${e(friendlyDate(n.date)||n.date)}</time>${n.workstream?streamChip(n.workstream):''}</div><h3>${e(n.title)}</h3><div class="note-text">${e(n.text)}</div>${sourceLink(n.url)}</article>`).join('')||'<p class="empty">No notes published in this category.</p>';}
function notesView(){return `<section class="source-panel"><span class="source-tag">Owner-published records</span><h2>Notes & decisions</h2><div class="task-controls filter-row"><label>Type<select id="note-kind"><option value="">All notes</option>${Object.entries(noteKinds).map(([k,v])=>`<option value="${k}" ${noteKind===k?'selected':''}>${v}</option>`).join('')}</select></label>${streamOptions(noteStream)}</div><div id="notes-results">${noteArticles()}</div></section>`;}

async function loadLiveTodoist(sequence){
 try{const r=await fetch(BOARD+'/public/todoist',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error();const value=await r.json();if(sequence!==requestSequence)return;if(value.enabled){data.liveTodoist=value;data.overview.tasks=value.tasks;}data.todoistError=false;if(['overview','tasks'].includes(view))render();}
 catch{if(sequence!==requestSequence)return;data.todoistError=true;if(['overview','tasks'].includes(view))render();}
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

const resourceCategories={reading:'Literature',publication:'Publications',reference:'Reference files',protocol:'Protocols',dataset:'Datasets',design:'Designs',hardware:'Hardware & instrumentation',software:'Software',tool:'Useful tools',datasheet:'Vendors & datasheets'};
const noteKinds={note:'Note',decision:'Decision',experiment:'Experiment',system:'System / hardware'};
let resourceCategory='',noteKind='';
function friendlyDate(value){if(!/^\d{4}-\d{2}-\d{2}/.test(value||''))return '';return new Date(value.slice(0,10)+'T12:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function shortName(section){return String(section||'').split(/\s{2,}/)[0].split(' - ')[0].trim();}
function sectionOf(id){let section='';for(const row of data.roadmap.rows){if(row.section)section=row.section;else if(row.id===id)return section;}return '';}
function sameStream(a,b){const n=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();return !!n(a)&&!!n(b)&&(n(a)===n(b)||n(a).startsWith(n(b))||n(b).startsWith(n(a)));}
// Filtered views reached from another view; each is a real field, never an inferred link.
function openGanttStream(section){ganttSettings['roadmap-stream']=section;navigate('gantt');}
function streamChip(name){const s=roadmapStreams().streams.find(x=>sameStream(x.name,name));return s?`<button class="stream-chip" data-stream-gantt="${e(s.section)}"><span class="chip-dot" style="background:${e(s.color)}" aria-hidden="true"></span>${e(s.name)}<span class="visually-hidden"> — show this workstream in the Gantt</span></button>`:`<span class="stream-chip static">${e(name)}</span>`;}
function roadmapMilestones(){
 const seen=new Set();return data.roadmap.rows.flatMap(row=>{if(!row.id||seen.has(row.id))return [];const index=(row.cells||[]).findIndex(c=>c.mark==='<>');if(index<0)return [];seen.add(row.id);const task=data.roadmap.tasks.find(t=>t.ID===row.id)||{};return [{id:row.id,title:row.title,kind:row.owner==='Gate'?'Decision gate':'Milestone',date:data.roadmap.weeks[index].start,completed:['completed','complete'].includes(task.Status),actual:task.Completed||''}];}).sort((a,b)=>a.date.localeCompare(b.date));
}
// Workstreams are the workbook's own sections. "Scheduled" reads solid (expected-window) fills for the current week; pale fills are pessimistic extensions.
function roadmapStreams(){
 const r=data.roadmap,week=r.weeks.findIndex(w=>w.start<=data.today&&data.today<=w.finish),out=[];let s=null;
 const solid=hex=>{const m=/^#([0-9a-f]{6})$/i.exec(hex||'');if(!m)return false;const n=parseInt(m[1],16);return .299*(n>>16)+.587*(n>>8&255)+.114*(n&255)<200;};
 for(const row of r.rows){
  if(row.section){const parts=row.section.split(/\s{2,}/)[0].split(' - ');s={name:parts.shift().trim(),detail:parts.join(' - ').trim(),section:row.section,rows:[],color:''};out.push(s);continue;}
  if(!s||row.parent)continue;const cols=(row.cells||[]).flatMap((c,i)=>solid(c.fill)?[i]:[]);if(!cols.length)continue;
  s.color||=row.cells[cols[0]].fill;s.rows.push({id:row.id,title:row.title,first:cols[0],cols});
 }
 return {week,streams:out.filter(x=>x.rows.length).map(x=>({...x,now:week<0?[]:x.rows.filter(t=>t.cols.includes(week)),next:week<0?null:x.rows.filter(t=>t.first>week).sort((a,b)=>a.first-b.first)[0]||null}))};
}
function workstreamStrip(){
 const statements=(data.overview.program||[]).filter(x=>x.kind==='workstream'),cfg=data.overview.display||{};
 const {week,streams}=cfg.show_roadmap===false?{week:-1,streams:[]}:roadmapStreams(),used=new Set();
 const attribution=x=>`<small class="attribution">As of ${e(x.date)} · ${e(x.source)} ${sourceLink(x.url,'Evidence ↗')}</small>`;
 const statement=x=>x?`<p class="stream-statement">${e(x.text)}</p>${attribution(x)}`:'';
 const related=name=>{const notes=cfg.show_notes===false?0:(data.overview.public_notes||[]).filter(n=>sameStream(n.workstream,name)).length,res=cfg.show_resources===false?0:(data.overview.resources||[]).filter(r=>sameStream(r.workstream,name)).length;return [notes?`<button class="inline-link" data-stream-notes="${e(name)}">${notes} note${notes===1?'':'s'}</button>`:'',res?`<button class="inline-link" data-stream-resources="${e(name)}">${res} resource${res===1?'':'s'}</button>`:''].join('');};
 const items=streams.map(s=>{const st=statements.find(x=>sameStream(x.title,s.name));if(st)used.add(st);
  const state=week<0?'':s.now.length?'<span class="state-chip on"><span aria-hidden="true">●</span> Scheduled this week</span>':'<span class="state-chip"><span aria-hidden="true">○</span> Not scheduled this week</span>';
  const plan=week<0?'':s.now.length?`<p class="stream-plan"><span class="plan-label">Planned</span>${itemButton('data-open-roadmap',s.now[0].id,s.now[0].title,'open details in the Gantt')}${s.now.length>1?`<small>+${s.now.length-1} more this week</small>`:''}</p>`:`<p class="stream-plan quiet">${s.next?`Next: ${e(s.next.title)}, week of ${e(data.roadmap.weeks[s.next.first].start)}`:'No further planned work in the schedule.'}</p>`;
  return `<li class="stream" style="--stream:${e(s.color)}"><div class="stream-head"><h3>${e(s.name)}</h3>${state}</div>${s.detail?`<small class="stream-detail">${e(s.detail)}</small>`:''}${statement(st)}${plan}<div class="stream-links"><button class="inline-link" data-stream-gantt="${e(s.section)}">Gantt ›</button>${related(s.name)}</div></li>`;});
 statements.filter(x=>!used.has(x)).forEach(x=>items.push(`<li class="stream"><div class="stream-head"><h3>${e(x.title)}</h3></div>${statement(x)}</li>`));
 if(!items.length)return '';
 return `<div class="workstreams"><div class="strip-heading"><h2>${icon('streams')}Workstreams</h2><small>${week<0?'Sections of the original Gantt workbook.':`Original Gantt plan for the week of ${e(data.roadmap.weeks[week].start)} — a schedule, not a progress report.`}</small></div><ul class="status-strip">${items.join('')}</ul></div>`;
}
// Compact facts that come straight from published data; no scores or percentages.
function projectPulse(focus){
 const cfg=data.overview.display||{},facts=[],latest=activityItems()[0];
 if(cfg.show_roadmap!==false){const {week,streams}=roadmapStreams();if(week>=0&&streams.length)facts.push(`<li><span>This week</span>${streams.filter(s=>s.now.length).length} of ${streams.length} workstreams scheduled</li>`);}
 if(latest)facts.push(`<li><span>Latest update</span>${e(latest.title)} · ${e(friendlyDate(latest.date))}</li>`);
 if(!focus)facts.push('<li class="muted-fact"><span>Current focus</span>Not published yet</li>');
 return facts.length?`<ul class="project-pulse" aria-label="Project pulse">${facts.join('')}</ul>`:'';
}
function programSummary(){
 const records=data.overview.program||[],phase=records.find(x=>x.kind==='phase'),focus=records.find(x=>x.kind==='focus'),showMilestones=data.overview.display?.show_roadmap!==false&&data.overview.display?.show_milestones!==false;
 const next=showMilestones?roadmapMilestones().find(x=>!x.completed&&x.date>=data.today):null;
 const attribution=x=>`<small class="attribution">As of ${e(x.date)} · ${e(x.source)} ${sourceLink(x.url,'Evidence ↗')}</small>`;
 const weeks=next?Math.round((Date.parse(next.date)-Date.parse(data.today))/6048e5):0;
 const tiles=[focus?`<div class="summary-tile focus-tile"><h2>${icon('target')}Current focus</h2><p class="summary-statement">${e(focus.text)}</p>${attribution(focus)}</div>`:'',showMilestones?`<div class="summary-tile milestone-tile"><h2>${icon('diamond')}Next scheduled milestone</h2>${next?`<p class="summary-statement">${itemButton('data-open-roadmap',next.id,next.title,'open details in the Gantt')}</p><small>Week of ${e(next.date)}${weeks>0?` · in about ${weeks} week${weeks===1?'':'s'}`:''} · original Gantt, planned</small>`:'<p class="empty">No future milestone in the source schedule.</p>'}</div>`:''].filter(Boolean);
 return `<section class="program-orientation summary-panel" aria-label="Project summary">${phase?`<p class="phase-line"><span>Current phase</span> ${e(phase.text)} ${attribution(phase)}</p>`:''}${tiles.length?`<div class="direction-grid ${tiles.length===1?'single':''}">${tiles.join('')}</div>`:''}${projectPulse(focus)}${workstreamStrip()}</section>`;
}
function roadmapSummary(){
 const milestones=roadmapMilestones().filter(x=>!x.completed&&x.date>=data.today).slice(0,4);
 return data.overview.display?.show_milestones===false?'':`<ol class="roadmap-summary milestone-timeline">${milestones.map(x=>`<li><span class="timeline-node" aria-hidden="true"></span><time>Week of ${e(x.date)}</time>${x.kind==='Milestone'?'':`<span class="kind-chip">${e(x.kind)}</span>`}${itemButton('data-open-roadmap',x.id,x.title,'open details in the Gantt')}</li>`).join('')||'<li class="empty">No upcoming milestones recorded in the workbook.</li>'}</ol><small class="caption">Planned dates are not evidence of completion.</small>`;
}
function operationalSummary(){
 if(data.todoistError)return `<section class="source-panel">${panelHeading('check','Todoist','Work in focus')}<p class="empty">Live tasks could not refresh.</p>${jump('tasks','Tasks')}</section>`;
 const limit=data.overview.display?.task_limit||3,tasks=data.overview.tasks||[],groups=[['Now',['in_progress']],['Next',['next']],['Blocked / waiting',['blocked','waiting']]];
 const panels=groups.map(([label,statuses])=>{const items=tasks.filter(t=>statuses.includes(t.status));return items.length?`<div><h3>${label}</h3><ul>${items.slice(0,limit).map(t=>`<li>${sourceLink(t.url,t.title)||e(t.title)}<small>${e([t.source,t.project_name,t.section_name].filter(Boolean).join(' · '))}</small></li>`).join('')}</ul>${items.length>limit?`<small>${items.length-limit} more in Tasks</small>`:''}</div>`:'';}).join('');
 return `<section class="source-panel">${panelHeading('check','Todoist','Work in focus',jump('tasks','Tasks by section'))}${panels?`<div class="operational-grid">${panels}</div><small>Explicit source statuses only.</small>`:`<small>Open tasks · source order, not an inferred priority</small><ul class="open-task-preview">${tasks.filter(t=>!['completed','cancelled'].includes(t.status)&&(!t.parent_id||!tasks.some(p=>p.id==='todoist:'+t.parent_id||p.id===t.parent_id))).slice(0,limit).map(t=>`<li>${sourceLink(t.url,t.title)||e(t.title)}<small>${e([t.project_name,t.section_name].filter(Boolean).join(' · '))}</small></li>`).join('')||'<li>No active tasks shared.</li>'}</ul><small>Current / next / waiting statuses have not been published.</small>`}</section>`;
}
function activityItems(){
 const o=data.overview,cfg=o.display||{},items=[];
 if(cfg.show_notes!==false)for(const n of o.public_notes||[])items.push({id:n.id,date:n.date,title:n.title,text:n.text,source:noteKinds[n.kind]||'Note',label:noteKinds[n.kind]||'Note',url:n.url,view:'notes',area:n.workstream||''});
 for(const n of o.updates||[])items.push({id:n.id,date:n.date,title:n.title,text:n.result||n.summary,source:n.source||'Published evidence',label:'Research update',url:n.url,task_id:n.task_id,area:n.task_id?shortName(sectionOf(n.task_id)):''});
 if(cfg.show_tasks!==false&&!data.todoistError)for(const t of o.tasks||[])if(t.status==='completed')items.push({id:t.id,date:t.completed_date,title:t.title,text:'Marked completed in the source task record.',source:t.source||'Task',label:'Completed task',url:t.url,view:'tasks',area:t.section_name||''});
 return items.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date||'')&&x.date<=data.today).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4);
}
function activityLink(x){return x.view==='notes'?`<button class="item-link" data-open-note="${e(x.id)}">${e(x.title)}<span class="link-cue" aria-hidden="true">›</span></button>`:x.task_id&&data.overview.display?.show_roadmap!==false?itemButton('data-open-roadmap',x.task_id,x.title,'open related Gantt row'):x.url?sourceLink(x.url,x.title):`<b>${e(x.title)}</b>`;}
function latestUpdates(){
 const items=activityItems();
 return `<section class="source-panel latest-panel" aria-labelledby="latest-heading">${panelHeading('clock','Notes, Gantt evidence and completed tasks','<span id="latest-heading">Latest updates</span>',data.overview.display?.show_notes===false?'':jump('notes','All notes'))}${items.length?`<ol class="update-list">${items.map(x=>`<li><time datetime="${e(x.date)}">${e(friendlyDate(x.date))}</time><div><div class="update-meta"><span title="${e(x.source)}">${e(x.label)}</span>${x.area?streamChip(x.area):''}</div>${activityLink(x)}${x.text?`<p>${e(x.text.slice(0,180))}${x.text.length>180?'…':''}</p>`:''}</div></li>`).join('')}</ol>`:'<p class="empty">No dated notes, results or completed tasks published yet.</p>'}</section>`;
}
function recentActivity(){return latestUpdates();}
function sectionHeading(value){const [main,...rest]=value.split(/\s{2,}/),parts=main.split(' - ');return `<h3 class="compact-section"><span>${e(parts.shift())}</span>${parts.length?`<small>${e(parts.join(' - '))}</small>`:''}</h3>${rest.length?`<p class="section-metadata">${e(rest.join(' · '))}</p>`:''}`;}
const BOARD='https://sabre-member-board.domotota.workers.dev';
let contactState={status:'loading',categories:[]},contactDraft={},contactStarted=0,contactResult=null;
function initials(name){return String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('');}
function teamSection(){
 const team=data.overview.team||[];if(data.overview.display?.show_team===false||!team.length)return '';
 return `<section class="source-panel team-panel" aria-labelledby="team-heading">${panelHeading('people','','<span id="team-heading">Project Team</span>')}<ul class="team-grid">${team.map(m=>{const pubs=(m.publications||[]).slice(0,3);return `<li class="member-card"><div class="member-head">${m.image?`<img class="avatar" src="${e(m.image)}" alt="" width="56" height="56" loading="lazy" referrerpolicy="no-referrer">`:`<span class="avatar" aria-hidden="true">${e(initials(m.name))}</span>`}<div><h3>${e(m.name)}</h3>${m.role?`<p class="member-role">${e(m.role)}</p>`:''}</div></div>${m.description?`<p class="member-bio">${e(m.description)}</p>`:''}${pubs.length?`<div class="member-pubs"><h4>Selected publications</h4><ol>${pubs.map(p=>`<li>${p.url?sourceLink(p.url,p.title):`<span>${e(p.title)}</span>`}<small>${e([p.source,p.year].filter(Boolean).join(' · '))}</small></li>`).join('')}</ol></div>`:''}<div class="member-links">${m.linkedin?`<a href="${e(m.linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${e(m.name)} on LinkedIn (opens in a new tab)">LinkedIn ↗</a>`:''}${m.scholar?`<a href="${e(m.scholar)}" target="_blank" rel="noopener noreferrer" aria-label="${e(m.name)} on Google Scholar (opens in a new tab)">${pubs.length?'View Google Scholar':'Google Scholar'} ↗</a>`:''}</div></li>`;}).join('')}</ul></section>`;
}
function contactSection(){
 if(contactState.status!=='open')return '';
 const d=contactDraft,err=contactResult?.fields||{},field=(name,label,input,hint='')=>`<div class="form-field ${err[name]?'has-error':''}"><label for="contact-${name}">${label}</label>${input}${err[name]?`<small class="field-error" id="contact-${name}-error">${e(err[name])}</small>`:hint?`<small id="contact-${name}-hint">${hint}</small>`:''}</div>`;
 const attrs=(name,required=true)=>`id="contact-${name}" name="${name}" ${required?'required':''} ${err[name]?`aria-invalid="true" aria-describedby="contact-${name}-error"`:''}`;
 if(contactResult?.ok)return `<section class="source-panel contact-panel" aria-labelledby="contact-heading">${panelHeading('mail','','<span id="contact-heading">Contact the SABRE Project</span>')}<p class="form-status success" role="status">Thank you — your message was sent to the project team.</p><button class="secondary" id="contact-again">Send another message</button></section>`;
 return `<section class="source-panel contact-panel" aria-labelledby="contact-heading">${panelHeading('mail','','<span id="contact-heading">Contact the SABRE Project</span>')}<p class="contact-intro">For research collaborations, instrumentation and engineering connections, SABRE / hyperpolarization questions, or other project outreach.</p><form id="contact-form" novalidate><div class="form-grid">
 ${field('name','Name',`<input ${attrs('name')} autocomplete="name" maxlength="100" value="${e(d.name)}">`)}${field('email','Email',`<input ${attrs('email')} type="email" autocomplete="email" maxlength="200" value="${e(d.email)}">`)}
 ${field('organization','Organization / affiliation <span class="optional">(optional)</span>',`<input ${attrs('organization',false)} autocomplete="organization" maxlength="150" value="${e(d.organization)}">`)}${field('category','Category',`<select ${attrs('category')}><option value="">Choose a category</option>${contactState.categories.map(c=>`<option ${d.category===c?'selected':''}>${e(c)}</option>`).join('')}</select>`)}
 <div class="full">${field('subject','Subject',`<input ${attrs('subject')} maxlength="150" value="${e(d.subject)}">`)}</div><div class="full">${field('message','Message',`<textarea ${attrs('message')} rows="6" maxlength="5000">${e(d.message)}</textarea>`,'At least 10 characters.')}</div></div>
 <div class="hp-field" aria-hidden="true"><label for="contact-website">Leave this field empty</label><input id="contact-website" name="website" tabindex="-1" autocomplete="off"></div>
 <div class="form-actions"><button type="submit" id="contact-send">Send message</button><p class="form-status ${contactResult?.error?'error':''}" id="contact-status" role="status">${e(contactResult?.error||'')}</p></div><small class="muted">Your message goes to the project team by email; it is not published.</small></form></section>`;
}
function peopleSection(){const team=teamSection(),contact=contactSection();return team||contact?`<div class="tier tier-people">${team}${contact}</div>`:'';}
async function loadContact(){
 try{const r=await fetch(BOARD+'/public/contact',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();const v=await r.json();contactState={status:v.enabled?'open':'closed',categories:Array.isArray(v.categories)?v.categories.map(String):[]};}
 catch{contactState={status:'unavailable',categories:[]};}
 if(view==='overview'&&data)render();
}
function bindContact(){
 const form=$('#contact-form');if($('#contact-again'))$('#contact-again').onclick=()=>{contactResult=null;contactDraft={};render();$('#contact-name')?.focus();};if(!form)return;
 form.oninput=ev=>{if(!contactStarted)contactStarted=Date.now();if(ev.target.name&&ev.target.name!=='website')contactDraft[ev.target.name]=ev.target.value;};
 form.onsubmit=async ev=>{ev.preventDefault();const f=new FormData(form),body=Object.fromEntries(['name','email','organization','category','subject','message','website'].map(k=>[k,String(f.get(k)||'')]));
  const fields={};if(!body.name.trim())fields.name='Enter your name.';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))fields.email='Enter a valid email address.';if(!body.category)fields.category='Choose a category.';if(!body.subject.trim())fields.subject='Enter a subject.';if(body.message.trim().length<10)fields.message='Write a message of at least 10 characters.';
  if(Object.keys(fields).length){contactResult={error:'Please correct the highlighted fields.',fields};render();$('#contact-form [aria-invalid="true"]')?.focus();return;}
  $('#contact-send').disabled=true;$('#contact-status').textContent='Sending…';
  try{const r=await fetch(BOARD+'/public/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,elapsed_ms:contactStarted?Date.now()-contactStarted:0}),signal:AbortSignal.timeout(20000)});const v=await r.json().catch(()=>({}));
   contactResult=r.ok?{ok:true}:{error:v.error||'The message could not be sent. Please try again later.',fields:v.fields||{}};if(r.ok){contactDraft={};contactStarted=0;}}
  catch{contactResult={error:'The message could not be sent. Check your connection and try again.'};}
  render();(contactResult.ok?$('#contact-again'):$('#contact-form [aria-invalid="true"]')||$('#contact-status'))?.focus?.();};
}
