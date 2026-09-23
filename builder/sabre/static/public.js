'use strict';
const staticSite=document.body.dataset.static==='true';
let data,view='overview',period='day',requestSequence=0,ganttSettings={};
const $=s=>document.querySelector(s),e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
function sourceLink(url,label='Open source ↗'){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?`<a href="${e(u.href)}" target="_blank" rel="noopener noreferrer">${e(label)}</a>`:'';}catch{return '';}
}
function jump(target,label){return `<button class="inline-link" data-jump="${target}">${label} ↗</button>`;}
function notesFeed(limit=Infinity){
 const notes=[...(data.overview.source_notes||[])].sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''));
 return notes.slice(0,limit).map(n=>`<article class="source-note"><small class="source-tag">${e(n.source||'Source')} · Edited ${e(n.updated_at||'date unavailable')}</small><h3>${e(n.title)}</h3>${n.summary_bullets?.length?`<ul>${n.summary_bullets.slice(0,3).map(b=>`<li>${e(b)}</li>`).join('')}</ul><details><summary>Original note</summary><p class="evidence">${e(n.text)}</p></details>`:recapLine(n.text)}${sourceLink(n.url)}</article>`).join('')||'<p class="empty">No notes published yet.</p>';
}
function todoistTree(activeOnly=false){
 const tasks=(data.overview.tasks||[]).filter(t=>t.source==='Todoist'||t.id?.startsWith('todoist:')).filter(t=>!activeOnly||!['completed','cancelled'].includes(t.status));
 const projects=new Map();for(const t of tasks){const id=t.project_id||'';if(!projects.has(id))projects.set(id,[]);projects.get(id).push(t);}
 return [...projects].map(([id,rows])=>{const sections=new Map();for(const t of rows){const key=t.section_id||'';if(!sections.has(key))sections.set(key,[]);sections.get(key).push(t);}
 return `<section class="todoist-project"><h3>${e(rows[0].project_name|| (id?'Todoist project · '+id:'Todoist · project not supplied'))}</h3>${[...sections].sort((a,b)=>Number(a[1][0].section_order||0)-Number(b[1][0].section_order||0)).map(([sid,items])=>{
 items.sort((a,b)=>Number(a.task_order||0)-Number(b.task_order||0));
 const ordered=[],visited=new Set();const visit=t=>{if(visited.has(t))return;visited.add(t);ordered.push(t);items.filter(x=>x.parent_id&&(t.id==='todoist:'+x.parent_id||t.id===x.parent_id)).forEach(visit);};items.filter(t=>!t.parent_id||!items.some(x=>x.id==='todoist:'+t.parent_id||x.id===t.parent_id)).forEach(visit);items.forEach(visit);
 const depth=t=>{let d=0,p=t.parent_id,seen=new Set([t.id]);while(p&&d<5){const parent=items.find(x=>x.id==='todoist:'+p||x.id===p);if(!parent||seen.has(parent.id))break;seen.add(parent.id);d++;p=parent.parent_id;}return d;};
 return `<div class="todoist-section">${sid||items[0].section_name?`<h4>${e(items[0].section_name||'Section · '+sid)}</h4>`:''}<ul>${ordered.map(t=>`<li style="--depth:${depth(t)}"><span aria-hidden="true">${t.status==='completed'?'✓':'○'}</span><div>${sourceLink(t.url,t.title)||e(t.title)}<small>${t.due_date?'Due '+e(t.due_date)+' · ':''}${e(t.status||'Status not supplied')}</small></div></li>`).join('')}</ul></div>`;
 }).join('')}</section>`;}).join('')||'<p class="empty">No '+(activeOnly?'active ':'')+'Todoist tasks in the published source snapshot.</p>';
}
function agenda(compact=false){
 const c=data.overview.calendar;if(!c)return '<p class="empty">No calendar shared.</p>';
 const params=new URLSearchParams({src:c.id,ctz:c.timezone,mode:'AGENDA',showTitle:'0',showPrint:'0',showCalendars:'0',showTabs:'0'});
 return `<small class="source-tag">Google Calendar · ${e(c.timezone)}</small><iframe loading="lazy" class="source-agenda ${compact?'compact-agenda':''}" title="Upcoming Google Calendar events" referrerpolicy="no-referrer" src="https://calendar.google.com/calendar/embed?${e(params)}"></iframe><small>Live agenda · visibility follows Google Calendar permissions.</small>${sourceLink('https://calendar.google.com/calendar/embed?'+params,'Open Google Calendar ↗')}`;
}
function overview(){
 const r=data.roadmap;
 return `<div class="overview-heading"><div><span class="eyebrow">Collaborator overview</span><h2>${e(data.overview.title)}</h2></div><button class="secondary" id="refresh-overview">Refresh</button></div><div class="freshness"><span>Published ${e(data.overview.updated||'date unavailable')}</span><ul>${sourceConnectionRows()}</ul></div>
 <section class="source-panel roadmap-preview"><div class="section-heading"><div><span class="source-tag">Original Gantt workbook</span><h2>Project roadmap</h2></div>${jump('gantt','Full Gantt')}</div><div class="preview-controls" hidden><select id="roadmap-stream"><option value=""></option></select><select id="roadmap-depth"><option value="bands"></option></select><select id="roadmap-scale"><option value="fit"></option></select><label><select id="roadmap-month"><option value=""></option></select></label></div><div id="roadmap-grid"></div><small>Solid: expected work · pale: pessimistic extension · ◇ milestone · ○ decision · △ arrival</small><details><summary>Workbook source details</summary><p>${e(r.warning)}</p></details></section>
 <div class="source-columns"><section class="source-panel"><div class="section-heading"><h2>Upcoming calendar</h2>${jump('calendar','Calendar')}</div>${agenda(true)}</section><section class="source-panel"><div class="section-heading"><h2>Recent research updates</h2>${jump('notes','All notes')}</div>${notesFeed(3)}</section></div>
 <section class="source-panel todoist-panel"><div class="section-heading"><div><span class="source-tag">Todoist · source order</span><h2>Project tasks</h2></div>${jump('tasks','All tasks')}</div>${todoistTree(true)}</section>`;
}
function sourceConnectionRows(){
 const labels={not_connected:'Not connected',pending_credentials:'Credentials pending',unverified:'Private import not yet verified',verified:'Connected',partial:'Connected · incomplete import',unavailable:'Source unavailable'};
 return Object.entries({calendar:'Google Calendar',notion:'Notion',todoist:'Todoist'}).map(([key,name])=>{const c=data.overview.source_connections?.[key]||{status:'not_connected'};return `<li><b>${name}:</b> ${key==='calendar'&&data.overview.calendar?'Live agenda · Google access':e(labels[c.status]||labels.unverified)}${c.checked_at?' · Last check '+e(c.checked_at):''}</li>`;}).join('');
}
function calendarView(){return `<section class="source-panel"><h2>Google Calendar</h2>${agenda()}</section>`;}
function resources(){
 const groups=[['reading','Background reading','Papers and explanations that provide context for the research.'],['reference','Reference files','Shared protocols, results, and supporting project material.'],['tool','Useful tools','Links to tools collaborators can use while working on the project.']];
 return `<section class="intro resource-intro"><div><span class="eyebrow">Get up to speed</span><h2>Files, reading & tools</h2><p>Use the Overview for recent work and the Gantt for the research schedule. Explore the supporting material below for more context.</p></div></section>${groups.map(([key,title,description])=>{
 const items=data.overview.resources.filter(r=>(['reading','tool'].includes(r.category)?r.category:'reference')===key);
 return items.length?`<section class="resource-group" aria-labelledby="resources-${key}"><h2 id="resources-${key}">${title}</h2><p class="resource-context">${description}</p>${items.map(r=>`<article class="resource-item"><small>${r.url?'External link · Opens in a new tab':'File download'}</small><h3><a href="${r.url?e(r.url):e(r.download_url||'/files/'+encodeURIComponent(r.id))}" ${r.url?'target="_blank" rel="noopener noreferrer"':(staticSite?'download':'')}>${e(r.title)} ${r.url?'↗':'↓'}</a></h3>${r.description?`<p>${e(r.description)}</p>`:''}</article>`).join('')}</section>`:'';
 }).join('')||'<p class="empty">No resources have been shared yet.</p>'}`;
}
function render(){
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
 $('#content').innerHTML=view==='gantt'?renderGantt():view==='resources'?resources():view==='notes'?`<section class="source-panel"><h2>Research notes</h2>${notesFeed()}</section>`:view==='tasks'?`<section class="source-panel"><span class="source-tag">Todoist</span><h2>Tasks by project and section</h2>${todoistTree()}</section>`:view==='calendar'?calendarView():overview();
 document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{view=b.dataset.jump;render();window.scrollTo(0,0);});
 if(view==='gantt')restoreGanttSettings();
 if(view==='overview'){drawCompactRoadmap();$('#refresh-overview').onclick=()=>loadOverview();}
}

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
 if(view!=='gantt'){view='gantt';render();}
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
 if(view==='overview'){const root=$('#roadmap-grid .compact-gantt');let group;[...root.children].forEach(el=>{if(el.matches('.compact-section')){group=document.createElement('details');group.className='roadmap-group';const heading=document.createElement('summary');heading.textContent=el.textContent;group.append(heading);el.replaceWith(group);}else if(group){group.append(el);}});const groups=root.querySelectorAll('.roadmap-group');groups.forEach((g,i)=>{g.open=i===1;const count=g.querySelectorAll('.compact-row').length;g.querySelector('summary').append(' · '+count+' rows');});}
 document.querySelectorAll('[data-roadmap-id]').forEach(b=>b.onclick=()=>showRoadmapEvidence(b.dataset.roadmapId));
}
