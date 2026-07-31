/* PMPM — PartsSource Marketing Project Management
   Buildless app. Runs in DEMO mode until Supabase keys are set in js/config.js,
   then becomes a live, shared, multi-user app (auth + database + realtime). */

/* ---------- Mode ---------- */
const CFG = window.PMPM_CONFIG || {};
const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
                !CFG.SUPABASE_URL.includes('YOUR-') && !CFG.SUPABASE_ANON_KEY.includes('YOUR-'));
const sb = LIVE ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

/* ---------- Constants ---------- */
const STATUS = { todo:{label:'Not Started',dot:'var(--ink-3)'}, progress:{label:'In Progress',dot:'var(--accent)'}, blocked:{label:'Blocked',dot:'var(--crit)'}, review:{label:'In Review',dot:'var(--warn)'}, done:{label:'Complete',dot:'var(--good)'} };
const ORDER = ['todo','progress','blocked','review','done'];
const STATUS_PILL = { active:['info','On track'], atrisk:['crit','At risk'], planning:['idle','In planning'], review:['warn','Under review'], complete:['good','Completed'] };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const TODAY = (function(){ const d = LIVE ? new Date() : new Date('2026-07-31T00:00:00'); d.setHours(0,0,0,0); return d; })();

/* ---------- State ---------- */
let TEAM = {};        // { CODE: {name, role, color, email} }
let PROJECTS = [];    // model (see loadLive / buildFromSeed)
let DETAIL = {};      // demo-only rich task detail
let OWNER = {};       // demo-only owner map
let ME = null;        // current member code
let currentProject = null, currentTask = null, currentFilter = 'active', currentView = 'dashboard';

/* ---------- Helpers ---------- */
const byId = id => PROJECTS.find(p => p.id === id);
function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDue(iso){ if(!iso) return 'TBD'; const d=new Date(iso+'T00:00:00'); return MONTHS[d.getMonth()]+' '+d.getDate(); }
function fmtWhen(ts){ if(!ts) return ''; const d=new Date(ts); return MONTHS[d.getMonth()]+' '+d.getDate(); }
function teamName(code){ return (TEAM[code]&&TEAM[code].name) || 'Unassigned'; }
function av(code,cls){ const m=TEAM[code]; if(!m) return `<span class="av-sm ${cls||''}" style="background:var(--ink-3)" title="Unassigned">–</span>`; return `<span class="av-sm ${cls||''}" style="background:${m.color}" title="${esc(m.name)} · ${esc(m.role)}">${esc(code)}</span>`; }
function progress(p){ const total=p.tasks.length, done=p.tasks.filter(t=>t.s==='done').length; return {done,total,pct: total?Math.round(done/total*100):0}; }
function projStatus(p){ if(p.status==='complete')return 'complete'; if(p.status==='planning')return 'planning'; if(p.status==='review')return 'review'; return p.tasks.some(t=>t.s==='blocked')?'atrisk':'active'; }
function ownerOf(p){ return p.owner || (p.tasks[0] && p.tasks[0].a); }
function isView(v){ return document.getElementById('view-'+v).classList.contains('active'); }
function toast(msg,bad){ const el=document.getElementById('toast'); el.textContent=msg; el.className='toast show'+(bad?' bad':''); setTimeout(()=>el.className='toast',3200); }

/* ---------- Task detail hydration ---------- */
function ensureDetail(p,t){
  if(LIVE){
    if(t._desc==null) t._desc = `Part of the "${p.name}" campaign. ${p.desc||''}`.trim();
    t._sub = t._sub || []; t._comments = t._comments || []; t._links = t._links || [];
    return;
  }
  const key=p.id+'::'+t.t, d=DETAIL[key]||{};
  if(!t._desc) t._desc = d.desc || `Part of the "${p.name}" campaign. ${p.desc}.`;
  if(!t._sub) t._sub = (d.sub || [{t:'Draft & internal review',done:t.s==='done'||t.s==='review'},{t:'Stakeholder sign-off',done:t.s==='done'},{t:'Launch / publish',done:t.s==='done'}]).map(x=>({...x}));
  if(!t._links) t._links = (d.links||[]).map(x=>({...x}));
  if(!t._comments){
    t._comments = (d.comments ? d.comments.map(c=>({a:c.a,w:c.w||'',x:c.x})) : [
      {a:OWNER[p.id], w:'Jul 28', x:`Added to the ${p.name} plan.`},
      ...(t.a!==OWNER[p.id]?[{a:OWNER[p.id], w:'Jul 29', x:`Assigned to ${teamName(t.a)}.`}]:[]),
      ...(t.blockedBy?[{a:t.a, w:'Jul 30', x:`Blocked — waiting on ${t.blockedBy}.`}]:[])
    ]);
  }
}

/* ===================================================================
   DATA LOADING
   =================================================================== */
function buildFromSeed(){
  const S = window.PMPM_SEED;
  TEAM = {}; S.members.forEach(m => TEAM[m.id] = {name:m.name, role:m.role, color:m.color, email:m.email});
  OWNER = S.owner; DETAIL = S.detail;
  let n = 0;
  PROJECTS = S.projects.map(p => ({ ...p, owner:S.owner[p.id], tasks: p.tasks.map(t => ({...t, id:'d'+(++n)})) }));
}

async function loadLive(){
  const [mem,prj,tsk,sub,com,att] = await Promise.all([
    sb.from('members').select('*').order('sort'),
    sb.from('projects').select('*').order('sort'),
    sb.from('tasks').select('*').order('position'),
    sb.from('subtasks').select('*').order('position'),
    sb.from('comments').select('*').order('created_at'),
    sb.from('attachments').select('*')
  ]);
  const firstErr = [mem,prj,tsk,sub,com,att].find(r=>r.error);
  if(firstErr){ toast('Load error: '+firstErr.error.message, true); throw firstErr.error; }
  TEAM = {}; (mem.data||[]).forEach(m => TEAM[m.id] = {name:m.name, role:m.role, color:m.color, email:m.email});
  const subBy={}, comBy={}, attBy={};
  (sub.data||[]).forEach(s => (subBy[s.task_id]=subBy[s.task_id]||[]).push({id:s.id, t:s.title, done:s.done}));
  (com.data||[]).forEach(c => (comBy[c.task_id]=comBy[c.task_id]||[]).push({id:c.id, a:c.author_id, w:fmtWhen(c.created_at), x:c.body}));
  (att.data||[]).forEach(a => (attBy[a.task_id]=attBy[a.task_id]||[]).push({id:a.id, label:a.label, sub:a.sublabel, url:a.url}));
  const tBy={};
  (tsk.data||[]).forEach(t => (tBy[t.project_id]=tBy[t.project_id]||[]).push({
    id:t.id, t:t.title, a:t.assignee_id, due:t.due, pr:t.priority, s:t.status, blockedBy:t.blocked_by, blocks:t.blocks,
    _desc:t.description||null, _sub:subBy[t.id]||[], _comments:comBy[t.id]||[], _links:attBy[t.id]||[]
  }));
  PROJECTS = (prj.data||[]).map(p => ({
    id:p.id, name:p.name, desc:p.description, segment:p.segment, motion:p.motion, solution:p.solution,
    pipeline:p.pipeline, value:p.value, audience:p.audience, launch:p.launch, status:p.status,
    blocker:p.blocker, owner:p.owner_id, tasks:tBy[p.id]||[]
  }));
}

/* ===================================================================
   PERSISTENCE (live only)
   =================================================================== */
async function pUpdate(table,id,fields){ const {error}=await sb.from(table).update(fields).eq('id',id); if(error) toast('Save failed: '+error.message,true); }
async function pInsert(table,row){ const {data,error}=await sb.from(table).insert(row).select().single(); if(error){ toast('Save failed: '+error.message,true); return null; } return data; }

/* ===================================================================
   RENDER — Dashboard
   =================================================================== */
function renderDashboard(){
  document.getElementById('kpi-active').textContent = PROJECTS.filter(p=>p.status==='active').length;
  document.getElementById('kpi-rb').textContent = PROJECTS.flatMap(p=>p.tasks).filter(t=>t.s==='blocked').length;
  document.getElementById('kpi-done').textContent = PROJECTS.filter(p=>p.status==='complete').length;

  document.getElementById('dash-active').innerHTML = PROJECTS.filter(p=>p.status==='active').map(p=>{
    const pr=progress(p), st=STATUS_PILL[projStatus(p)];
    return `<tr class="clickable" onclick="openProject('${p.id}')"><td class="proj-name">${esc(p.name)}</td><td>${av(ownerOf(p))}</td><td><span class="motion ${p.motion}">${esc(p.motion)}</span></td><td><div style="display:flex;align-items:center;gap:9px"><div class="bar"><span style="width:${pr.pct}%"></span></div><span class="num" style="font-size:12px;color:var(--ink-3)">${pr.pct}%</span></div></td><td class="num">${esc((p.launch||'').split('·')[0].trim())}</td><td><span class="pill ${st[0]}">${st[1]}</span></td></tr>`;
  }).join('') || `<tr><td colspan="6" style="color:var(--ink-3)">No active campaigns.</td></tr>`;

  const counts={}; Object.keys(TEAM).forEach(k=>counts[k]=0);
  PROJECTS.forEach(p=>p.tasks.forEach(t=>{ if(t.s!=='done' && counts[t.a]!=null) counts[t.a]++; }));
  const max=Math.max(...Object.values(counts),1);
  document.getElementById('workload').innerHTML = Object.keys(TEAM).map(k=>{
    const c=counts[k]||0, w=Math.round(c/max*100), col=c>=7?'var(--crit)':c>=5?'var(--warn)':'var(--accent)';
    return `<div class="wl-row">${av(k)}<div style="width:120px;font-weight:600">${esc(TEAM[k].name)}</div><div class="wl-bar"><span style="width:${w}%;background:${col}"></span></div><span class="num" style="width:26px;text-align:right;font-weight:700">${c}</span></div>`;
  }).join('');

  const soon=new Date(TODAY); soon.setDate(soon.getDate()-3);
  const up = PROJECTS.flatMap(p=>p.tasks.filter(t=>t.due&&t.s!=='done').map(t=>({t,p}))).filter(x=>new Date(x.t.due+'T00:00:00')>=soon).sort((a,b)=>a.t.due<b.t.due?-1:1).slice(0,5);
  document.getElementById('deadlines').innerHTML = up.map(({t,p})=>{ const d=new Date(t.due+'T00:00:00'), over=d<TODAY; return `<div class="dl-row"><div class="dl-date"><div class="d num" style="${over?'color:var(--crit)':''}">${String(d.getDate()).padStart(2,'0')}</div><div class="m">${MONTHS[d.getMonth()]}</div></div><div class="dl-main"><div class="t">${esc(t.t)}</div><div class="s">${esc(p.name)} · ${esc(teamName(t.a))}</div></div><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>`; }).join('') || `<div style="padding:14px 18px;color:var(--ink-3);font-size:12.5px">Nothing due soon.</div>`;

  document.getElementById('completed-list').innerHTML = PROJECTS.filter(p=>p.status==='complete').map(p=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg><div style="flex:1"><div style="font-weight:600">${esc(p.name)}</div><div style="font-size:11.5px;color:var(--ink-3)">${esc(teamName(ownerOf(p)))} · ${esc(p.value)}</div></div></div>`).join('') || `<div style="color:var(--ink-3);font-size:12.5px">None yet.</div>`;
}

/* ===================================================================
   RENDER — Campaigns grid
   =================================================================== */
function renderProjects(filter){
  filter=filter||'active';
  const list = PROJECTS.filter(p=> filter==='all'?true : filter==='active'?p.status==='active' : filter==='planning'?(p.status==='planning'||p.status==='review') : p.status==='complete');
  document.getElementById('proj-grid').innerHTML = list.map(p=>{
    const pr=progress(p), stKey=projStatus(p), st=STATUS_PILL[stKey];
    return `<div class="pcard t-${stKey}" onclick="openProject('${p.id}')">
      <div class="ph"><div style="flex:1"><div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.desc)}</div></div><span class="pill ${st[0]}">${st[1]}</span></div>
      <div class="ptags"><span class="motion ${p.motion}">${esc(p.motion)}</span><span class="tag">${esc(p.segment)}</span></div>
      <div class="bar"><span style="width:${pr.pct}%${stKey==='atrisk'?';background:linear-gradient(90deg,var(--warn),var(--crit))':''}"></span></div>
      <div class="prow"><span>${pr.done} of ${pr.total} tasks</span><span class="pct num">${pr.pct}%</span></div>
      <div class="prow"><span class="chip-person">${av(ownerOf(p))}${esc(teamName(ownerOf(p)))}</span><span class="num" style="${stKey==='atrisk'?'color:var(--crit)':''}">${esc((p.launch||'').split('·')[0].trim())}</span></div>
    </div>`;
  }).join('') || `<div style="color:var(--ink-3)">No campaigns in this view.</div>`;
}

/* ===================================================================
   RENDER — Campaign detail
   =================================================================== */
function openProject(id){ currentProject=id; renderProjectDetail(); show('project'); }
function renderProjectDetail(){
  const p=byId(currentProject); if(!p) return;
  const pr=progress(p), stKey=projStatus(p), st=STATUS_PILL[stKey], owner=ownerOf(p);
  const rows = p.tasks.map((t,i)=>`
    <div class="trow ${t.s==='done'?'done':''}">
      <button class="check" style="${t.s==='done'?'background:var(--good);border-color:var(--good)':''}" onclick="cycleDone('${p.id}',${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity:${t.s==='done'?1:0}"><path d="M20 6L9 17l-5-5"/></svg></button>
      <div><div class="trow-title" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}</div>${t.blockedBy?`<div class="trow-sub">⛔ Waiting on: ${esc(t.blockedBy)}</div>`:t.blocks?`<div class="trow-sub" style="color:var(--warn)">↗ Blocks ${esc(t.blocks)}</div>`:''}</div>
      <div><button class="assignee" onclick="openAssign(event,'${p.id}',${i})">${av(t.a)}${esc(teamName(t.a))}<span class="car">▾</span></button></div>
      <div class="col-due num t-due ${t.due&&new Date(t.due+'T00:00:00')<TODAY&&t.s!=='done'?'over':''}" style="font-size:12.5px;color:var(--ink-2)">${fmtDue(t.due)}</div>
      <div class="col-prio"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>
      <div><select class="status-sel" onchange="setStatus('${p.id}',${i},this.value)">${ORDER.map(s=>`<option value="${s}" ${t.s===s?'selected':''}>${STATUS[s].label}</option>`).join('')}</select></div>
    </div>`).join('');

  document.getElementById('project-detail').innerHTML = `
    <div class="pd-head">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="pd-title">${esc(p.name)}</span><span class="pill ${st[0]}">${st[1]}</span></div><div class="pd-desc">${esc(p.desc)}</div></div>
      <div class="pd-owner"><div class="lbl">Owner</div><span class="chip-person" style="font-size:13.5px">${av(owner)}${esc(teamName(owner))}</span></div>
    </div>
    <div class="metastrip">
      ${[['Segment',p.segment],['Solution',p.solution],['Pipeline',p.pipeline],['Audience',p.audience]].map(([l,v])=>`<div class="meta-item"><div class="ml">${l}</div><div class="mv">${esc(v)||'—'}</div></div>`).join('')}
      <div class="meta-item"><div class="ml">Motion</div><div class="mv"><span class="motion ${p.motion}">${esc(p.motion)}</span></div></div>
      <div class="meta-item"><div class="ml">Est. Value</div><div class="mv" style="color:var(--good)">${esc(p.value)||'—'}</div></div>
      <div class="meta-item"><div class="ml">Launch</div><div class="mv">${esc(p.launch)||'—'}</div></div>
    </div>
    ${p.blocker?`<div class="pd-blocker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span><b>Blocker:</b> ${esc(p.blocker)}</span></div>`:''}
    <div class="tasks-head"><h3>Tasks</h3><span class="prog-inline"><div class="bar" style="width:120px"><span style="width:${pr.pct}%"></span></div><span class="num" style="font-size:12.5px;color:var(--ink-3)">${pr.done}/${pr.total} done</span></span><button class="btn primary sm" style="margin-left:auto" onclick="toggleAddTask()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add task</button></div>
    <div class="ttable">
      <div class="thead-row"><span></span><span>Task</span><span>Assignee</span><span class="col-due">Due</span><span class="col-prio">Priority</span><span>Status</span></div>
      ${rows || '<div style="padding:16px;color:var(--ink-3);font-size:13px">No tasks yet — add the first one.</div>'}
      <div class="addtask-row">
        <form class="addtask-form" id="addtask-form" onsubmit="addTask(event)">
          <input id="nt-title" placeholder="New task name…" required />
          <select id="nt-assignee">${Object.keys(TEAM).map(k=>`<option value="${k}">${esc(TEAM[k].name)}</option>`).join('')}</select>
          <input id="nt-due" type="date" />
          <select id="nt-prio"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select>
          <button class="btn primary sm" type="submit">Add</button>
        </form>
      </div>
    </div>
    <div class="page-sub" style="margin-top:12px">As owner, <b>${esc(teamName(owner))}</b> can add tasks and reassign any row — click an assignee chip to hand it to a teammate.</div>`;
}
function toggleAddTask(){ const f=document.getElementById('addtask-form'); f.classList.toggle('open'); if(f.classList.contains('open')) document.getElementById('nt-title').focus(); }
async function addTask(e){
  e.preventDefault();
  const p=byId(currentProject);
  const title=document.getElementById('nt-title').value.trim(), a=document.getElementById('nt-assignee').value, due=document.getElementById('nt-due').value||null, pr=document.getElementById('nt-prio').value;
  if(!title) return;
  if(LIVE){
    const d=await pInsert('tasks',{project_id:p.id,title,assignee_id:a,due,priority:pr,status:'todo',position:p.tasks.length});
    if(!d) return;
    p.tasks.push({id:d.id,t:d.title,a:d.assignee_id,due:d.due,pr:d.priority,s:d.status,_sub:[],_comments:[],_links:[]});
  } else {
    p.tasks.push({id:'d'+Date.now(),t:title,a,due,pr,s:'todo'});
  }
  rerender();
}
function setStatus(id,i,v){ const t=byId(id).tasks[i]; t.s=v; rerender(); if(LIVE) pUpdate('tasks',t.id,{status:v}); }
function cycleDone(id,i){ const t=byId(id).tasks[i]; t.s=(t.s==='done'?'todo':'done'); rerender(); if(LIVE) pUpdate('tasks',t.id,{status:t.s}); }
function rerender(){ if(currentProject && isView('project')) renderProjectDetail(); if(currentTask) renderDrawer(currentTask.pid,currentTask.i); refreshCounts(); }

/* ---------- Assignee popover ---------- */
const amenu = document.getElementById('amenu');
function openAssign(e,id,i){
  e.stopPropagation();
  const r=e.currentTarget.getBoundingClientRect();
  amenu.innerHTML = `<div class="ah">Assign to</div>`+Object.keys(TEAM).map(k=>`<button onclick="assign('${id}',${i},'${k}')">${av(k)}<span>${esc(TEAM[k].name)}</span><span class="r">${esc(TEAM[k].role.split(' ')[0])}</span></button>`).join('');
  amenu.style.left=Math.min(r.left,window.innerWidth-220)+'px';
  amenu.style.top=(r.bottom+6)+'px';
  amenu.classList.add('open');
}
function assign(id,i,who){ const t=byId(id).tasks[i]; t.a=who; amenu.classList.remove('open'); rerender(); if(LIVE) pUpdate('tasks',t.id,{assignee_id:who}); }
document.addEventListener('click',e=>{ if(!amenu.contains(e.target)&&!e.target.closest('.assignee')) amenu.classList.remove('open'); });

/* ===================================================================
   RENDER — Task detail drawer
   =================================================================== */
function openTask(id,i){ const p=byId(id),t=p.tasks[i]; ensureDetail(p,t); currentTask={pid:id,i,taskId:t.id}; renderDrawer(id,i); document.getElementById('drawer').classList.add('open'); document.getElementById('drawer-ov').classList.add('open'); }
function closeDrawer(){ currentTask=null; document.getElementById('drawer').classList.remove('open'); document.getElementById('drawer-ov').classList.remove('open'); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
function renderDrawer(id,i){
  const p=byId(id); if(!p) return closeDrawer();
  const t=p.tasks[i]; if(!t) return closeDrawer();
  ensureDetail(p,t);
  const subDone=t._sub.filter(s=>s.done).length, subPct=t._sub.length?Math.round(subDone/t._sub.length*100):0;
  const over=t.due&&new Date(t.due+'T00:00:00')<TODAY&&t.s!=='done';
  document.getElementById('drawer').innerHTML = `
    <div class="drawer-head">
      <div style="flex:1"><button class="d-proj" onclick="closeDrawer();openProject('${p.id}')">${esc(p.name)} ↗</button><div class="d-title">${esc(t.t)}</div></div>
      <button class="icon-btn" onclick="closeDrawer()" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="drawer-body">
      <div class="d-fields">
        <span class="fl">Assignee</span><span><button class="assignee" onclick="openAssign(event,'${p.id}',${i})">${av(t.a)}${esc(teamName(t.a))}<span class="car">▾</span></button></span>
        <span class="fl">Status</span><span><select class="status-sel" onchange="setStatus('${p.id}',${i},this.value)">${ORDER.map(s=>`<option value="${s}" ${t.s===s?'selected':''}>${STATUS[s].label}</option>`).join('')}</select></span>
        <span class="fl">Due date</span><span class="num t-due ${over?'over':''}" style="font-weight:600">${over?'Overdue · ':''}${fmtDue(t.due)}</span>
        <span class="fl">Priority</span><span><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></span>
      </div>
      ${t.blockedBy?`<div class="d-blocker2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg><span>Waiting on: ${esc(t.blockedBy)}</span></div>`:''}
      ${t.blocks?`<div class="d-blocker2" style="background:var(--warn-soft);border-color:color-mix(in srgb,var(--warn) 30%,transparent);color:var(--warn)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg><span>This task blocks ${esc(t.blocks)}.</span></div>`:''}
      <div class="d-sec">Description</div>
      <div class="d-desc">${esc(t._desc)}</div>
      <div class="d-sec">Subtasks <span class="cnt">${subDone}/${t._sub.length}</span><div class="prog-mini" style="margin-left:auto"><span style="width:${subPct}%"></span></div></div>
      ${t._sub.map((s,si)=>`<div class="subrow ${s.done?'done':''}"><button class="check" style="${s.done?'background:var(--good);border-color:var(--good)':''}" onclick="toggleSub('${p.id}',${i},${si})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity:${s.done?1:0}"><path d="M20 6L9 17l-5-5"/></svg></button><span class="sub-t">${esc(s.t)}</span></div>`).join('')}
      <form class="subadd" onsubmit="addSub(event,'${p.id}',${i})"><input id="newsub" placeholder="Add a subtask…" /><button class="btn sm" type="submit">Add</button></form>
      <div class="d-sec">Attachments</div>
      ${t._links.length? t._links.map(l=>`<a class="att" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="ai"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span><div class="al">${esc(l.label)}</div><div class="as">${esc(l.sub)}</div></span></a>`).join('') : '<div class="att-empty">No files yet — link a SharePoint doc or asset for this task.</div>'}
      <div class="d-sec">Activity</div>
      ${t._comments.map(c=>`<div class="activity">${av(c.a)}<div class="aline"><span class="an">${esc(teamName(c.a))}</span> ${esc(c.x)}<div class="aw">${esc(c.w)}</div></div></div>`).join('') || '<div class="att-empty">No activity yet.</div>'}
      <form class="commentbox" onsubmit="addComment(event,'${p.id}',${i})">${av(ME)}<textarea id="newcomment" placeholder="Write a comment…"></textarea><button class="btn primary sm" type="submit">Post</button></form>
    </div>`;
}
function toggleSub(id,i,si){ const s=byId(id).tasks[i]._sub[si]; s.done=!s.done; renderDrawer(id,i); if(LIVE&&s.id) pUpdate('subtasks',s.id,{done:s.done}); }
async function addSub(e,id,i){
  e.preventDefault(); const v=document.getElementById('newsub').value.trim(); if(!v) return;
  const t=byId(id).tasks[i];
  if(LIVE){ const d=await pInsert('subtasks',{task_id:t.id,title:v,done:false,position:t._sub.length}); if(d) t._sub.push({id:d.id,t:d.title,done:d.done}); }
  else t._sub.push({t:v,done:false});
  renderDrawer(id,i);
}
async function addComment(e,id,i){
  e.preventDefault(); const v=document.getElementById('newcomment').value.trim(); if(!v) return;
  const t=byId(id).tasks[i];
  if(LIVE){ const d=await pInsert('comments',{task_id:t.id,author_id:ME,body:v}); if(d) t._comments.push({id:d.id,a:d.author_id,w:fmtWhen(d.created_at),x:d.body}); }
  else t._comments.push({a:ME,w:'Just now',x:v});
  renderDrawer(id,i);
}

/* ===================================================================
   RENDER — My Tasks
   =================================================================== */
function renderMyTasks(){
  const mine = PROJECTS.flatMap(p=>p.tasks.map((t,i)=>({t,p,i}))).filter(x=>x.t.a===ME && x.t.s!=='done');
  const buckets={Overdue:[],'Due Today':[],'This Week':[],Later:[]};
  mine.forEach(x=>{ const d=x.t.due?new Date(x.t.due+'T00:00:00'):null; if(!d){buckets.Later.push(x);return;} const diff=Math.round((d-TODAY)/86400000); if(diff<0)buckets.Overdue.push(x); else if(diff===0)buckets['Due Today'].push(x); else if(diff<=7)buckets['This Week'].push(x); else buckets.Later.push(x); });
  const over=buckets.Overdue.length, today=buckets['Due Today'].length, blocked=mine.filter(x=>x.t.s==='blocked').length;
  document.getElementById('mytasks-banner-text').innerHTML = mine.length ? `You have <b style="margin:0 3px">${over} overdue</b> and <b style="margin:0 3px">${today} due today</b>.${blocked?` ${blocked} task${blocked>1?'s are':' is'} waiting on a roadblock.`:''}` : `You're all caught up — nothing open assigned to you.`;
  document.getElementById('mytasks-body').innerHTML = Object.keys(buckets).map(name=>{
    const arr=buckets[name]; if(!arr.length) return '';
    const crit=name==='Overdue';
    return `<div class="task-group"><div class="tg-head"><h3 style="${crit?'color:var(--crit)':''}">${name}</h3><span class="tg-count num">${arr.length}</span></div>${arr.map(({t,p,i})=>{
      const over=t.due&&new Date(t.due+'T00:00:00')<TODAY;
      return `<div class="task"><button class="check" onclick="cycleDone('${p.id}',${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></button><div class="t-body"><div class="t-title" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}</div><div class="t-meta"><span class="tag" style="cursor:pointer" onclick="openProject('${p.id}')">${esc(p.name)}</span><span class="t-due ${over?'over':''}">${over?'Overdue · ':'Due '}${fmtDue(t.due)}</span>${t.blockedBy?`<span class="pill crit" style="font-size:11px">Blocked</span>`:''}${t.blocks?`<span class="pill crit plain" style="font-size:11px">Blocks work</span>`:''}</div></div><div class="t-right"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div></div>`;
    }).join('')}</div>`;
  }).join('');
}

/* ===================================================================
   RENDER — Board
   =================================================================== */
function renderBoardPicker(){ document.getElementById('board-pick').innerHTML = PROJECTS.filter(p=>p.status!=='complete').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); }
function renderBoard(id){
  const picker=document.getElementById('board-pick');
  id=id||picker.value||(PROJECTS[0]&&PROJECTS[0].id);
  const p=byId(id); if(!p){ document.getElementById('board').innerHTML=''; return; }
  picker.value=id;
  document.getElementById('board').innerHTML = ORDER.map(s=>{
    const items=p.tasks.map((t,idx)=>({t,idx})).filter(o=>o.t.s===s);
    return `<div class="col"><div class="col-h"><span class="dot" style="background:${STATUS[s].dot}"></span><span class="name">${STATUS[s].label}</span><span class="n num">${items.length}</span></div>${items.map(({t,idx})=>`
      <div class="kanban" onclick="openTask('${p.id}',${idx})" ${s==='blocked'?'style="border-color:color-mix(in srgb, var(--crit) 40%, var(--line))"':''}>
        <div class="kt">${esc(t.t)}</div>
        <div class="kmeta"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>
        ${t.blockedBy?`<div class="blocked-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>${esc(t.blockedBy)}</div>`:''}
        <div class="kfoot">${av(t.a)}<span class="t-due num" style="font-size:11px;${t.due&&new Date(t.due+'T00:00:00')<TODAY&&s!=='done'?'color:var(--crit)':'color:var(--ink-3)'}">${s==='done'?'Done':fmtDue(t.due)}</span></div>
      </div>`).join('')||'<div style="padding:10px 6px;color:var(--ink-3);font-size:12px">—</div>'}</div>`;
  }).join('');
}

/* ===================================================================
   RENDER — Roadblocks
   =================================================================== */
function renderRoadblocks(){
  const blocked = PROJECTS.flatMap(p=>p.tasks.map((t,i)=>({t,p,i})).filter(x=>x.t.s==='blocked'));
  document.getElementById('rb-banner-text').innerHTML = blocked.length ? `<b>${blocked.length} task${blocked.length>1?'s are':' is'} blocked.</b> Each is waiting on an upstream task or input before work can continue.` : `No roadblocks right now — nothing is blocked.`;
  document.getElementById('roadblocks-body').innerHTML = blocked.map(({t,p,i})=>`
    <div class="rb crit">
      <div class="rb-side"><div class="lbl">Blocked task</div><div class="tt" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}</div><div class="mt"><span class="tag" style="cursor:pointer" onclick="openProject('${p.id}')">${esc(p.name)}</span>${av(t.a)}</div></div>
      <div class="rb-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><div class="cap">waiting on</div></div>
      <div class="rb-side"><div class="lbl">Roadblock</div><div class="tt">${esc(t.blockedBy)}</div><div class="mt"><span class="pill warn" style="font-size:11px">Needs action</span></div></div>
    </div>`).join('');
}

/* ===================================================================
   Navigation
   =================================================================== */
const titles = { dashboard:['Dashboard','Demand Gen campaign portfolio'], mytasks:['My Tasks',"Everything assigned to you, grouped by when it's due"], board:['Board','Kanban view · drag tasks across stages'], projects:['Campaigns','All Demand Gen campaigns and their progress'], project:['Campaign','Tasks, owner & assignments'], roadblocks:['Roadblocks','Tasks blocked by upstream work or inputs'] };
function show(view){
  currentView=view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  const navKey = view==='project'?'projects':view;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.view===navKey));
  document.getElementById('pageTitle').textContent=titles[view][0];
  document.getElementById('pageSub').textContent=titles[view][1];
  if(view==='dashboard') renderDashboard();
  if(view==='mytasks') renderMyTasks();
  if(view==='board') renderBoard();
  if(view==='projects') renderProjects(currentFilter);
  if(view==='roadblocks') renderRoadblocks();
  window.scrollTo(0,0);
}
function refreshCounts(){
  document.getElementById('c-mine').textContent = PROJECTS.flatMap(p=>p.tasks).filter(t=>t.a===ME&&t.s!=='done').length;
  document.getElementById('c-proj').textContent = PROJECTS.filter(p=>p.status!=='complete').length;
  document.getElementById('c-rb').textContent = PROJECTS.flatMap(p=>p.tasks).filter(t=>t.s==='blocked').length;
}
function rerenderCurrent(){
  renderBoardPicker(); refreshCounts();
  show(currentView);
  if(currentTask){ const p=byId(currentTask.pid); if(p){ const idx=p.tasks.findIndex(t=>t.id===currentTask.taskId); if(idx>=0){ currentTask.i=idx; renderDrawer(currentTask.pid,idx); } else closeDrawer(); } else closeDrawer(); }
}

/* ---------- New campaign ---------- */
async function createProjectFlow(){
  const name=(prompt('New campaign name:')||'').trim(); if(!name) return;
  const base={name,description:'',segment:'',motion:'recruit',solution:'',pipeline:'',value:'',audience:'',launch:'TBD',status:'active',owner_id:ME,blocker:null,sort:PROJECTS.length};
  let id;
  if(LIVE){ const d=await pInsert('projects',base); if(!d) return; id=d.id; }
  else id='d'+Date.now();
  PROJECTS.push({id,name,desc:'',segment:'',motion:'recruit',solution:'',pipeline:'',value:'',audience:'',launch:'TBD',status:'active',blocker:null,owner:ME,tasks:[]});
  renderBoardPicker(); refreshCounts(); openProject(id);
}

/* ===================================================================
   Members sidebar / identity
   =================================================================== */
function renderMe(){
  const m=TEAM[ME]||{name:'—',role:'',color:'#7688A0'};
  document.getElementById('sidebar-foot').innerHTML = `
    <div class="me"><div class="avatar" style="background:${m.color}">${esc(ME||'?')}</div><div style="flex:1"><div class="me-name">${esc(m.name)}</div><div class="me-role">${esc(m.role)}</div></div>
    ${LIVE?`<button class="icon-btn" title="Sign out" onclick="signOut()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`:''}</div>
    ${!LIVE?`<button class="whoami" onclick="identify()">Viewing as ${esc(m.name)} · switch</button>`:''}`;
}
function identify(){
  const codes=Object.keys(TEAM);
  const pick=prompt('You are viewing "My Tasks" as which team member?\n'+codes.map(c=>`${c} = ${TEAM[c].name}`).join('\n')+'\n\nEnter initials:', ME);
  if(pick && TEAM[pick.toUpperCase()]){ ME=pick.toUpperCase(); localStorage.setItem('pmpm_member',ME); renderMe(); rerenderCurrent(); }
}
async function resolveMe(){
  let email=null;
  if(LIVE){ const {data:{user}}=await sb.auth.getUser(); email=user&&user.email; }
  const byEmail=Object.keys(TEAM).find(k=>TEAM[k].email && email && TEAM[k].email.toLowerCase()===email.toLowerCase());
  const saved=localStorage.getItem('pmpm_member');
  ME = byEmail || (saved && TEAM[saved] ? saved : (TEAM['RM'] ? 'RM' : Object.keys(TEAM)[0]));
}

/* ===================================================================
   Auth (live only)
   =================================================================== */
function showAuth(){ document.getElementById('auth-overlay').classList.add('show'); document.getElementById('app-root').style.display='none'; }
function hideAuth(){ document.getElementById('auth-overlay').classList.remove('show'); document.getElementById('app-root').style.display=''; }
let authMode='in';
function toggleAuthMode(){ authMode = authMode==='in'?'up':'in'; document.getElementById('auth-title').textContent = authMode==='in'?'Sign in':'Create account'; document.getElementById('auth-submit').textContent = authMode==='in'?'Sign in':'Sign up'; document.getElementById('auth-toggle').textContent = authMode==='in'?'Need an account? Sign up':'Have an account? Sign in'; document.getElementById('auth-err').textContent=''; }
async function authSubmit(e){
  e.preventDefault();
  const email=document.getElementById('auth-email').value.trim(), pw=document.getElementById('auth-pw').value;
  const errEl=document.getElementById('auth-err'); errEl.textContent='';
  const fn = authMode==='in' ? sb.auth.signInWithPassword({email,password:pw}) : sb.auth.signUp({email,password:pw});
  const {error}=await fn;
  if(error){ errEl.textContent=error.message; return; }
  if(authMode==='up'){ errEl.style.color='var(--good)'; errEl.textContent='Account created. If email confirmation is on, confirm then sign in.'; }
  const {data:{session}}=await sb.auth.getSession();
  if(session) afterLogin();
}
async function signOut(){ await sb.auth.signOut(); location.reload(); }

/* ===================================================================
   Realtime (live only)
   =================================================================== */
let reloadT=null;
function scheduleReload(){ clearTimeout(reloadT); reloadT=setTimeout(async()=>{ try{ await loadLive(); rerenderCurrent(); }catch(_){} }, 400); }
function subscribeRealtime(){
  sb.channel('pmpm-all')
    .on('postgres_changes',{event:'*',schema:'public'}, scheduleReload)
    .subscribe();
}

/* ===================================================================
   Seed (live, first run)
   =================================================================== */
function seedBuildDetail(p,t){
  const S=window.PMPM_SEED, key=p.id+'::'+t.t, d=S.detail[key]||{}, owner=S.owner[p.id];
  const sub = d.sub || [{t:'Draft & internal review',done:t.s==='done'||t.s==='review'},{t:'Stakeholder sign-off',done:t.s==='done'},{t:'Launch / publish',done:t.s==='done'}];
  const nameOf = c => (S.members.find(m=>m.id===c)||{}).name || c;
  const comments = d.comments ? d.comments.map(c=>({a:c.a,x:c.x})) : [
    {a:owner,x:`Added to the ${p.name} plan.`},
    ...(t.a!==owner?[{a:owner,x:`Assigned to ${nameOf(t.a)}.`}]:[]),
    ...(t.blockedBy?[{a:t.a,x:`Blocked — waiting on ${t.blockedBy}.`}]:[])
  ];
  const desc = d.desc || `Part of the "${p.name}" campaign. ${p.desc}.`;
  return {sub, comments, links:d.links||[], desc};
}
async function seedNow(){
  if(!confirm('Import the sample Demand Gen campaigns and team into this database?')) return;
  const S=window.PMPM_SEED;
  toast('Importing campaigns…');
  document.getElementById('seed-banner').style.display='none';
  const up=await sb.from('members').upsert(S.members.map((m,i)=>({id:m.id,name:m.name,role:m.role,color:m.color,email:m.email||null,sort:i})));
  if(up.error){ toast('Seed failed: '+up.error.message,true); return; }
  for(const [pi,p] of S.projects.entries()){
    const pr=await sb.from('projects').upsert({id:p.id,name:p.name,description:p.desc,segment:p.segment,motion:p.motion,solution:p.solution,pipeline:p.pipeline,value:p.value,audience:p.audience,launch:p.launch,status:p.status,owner_id:S.owner[p.id],blocker:p.blocker||null,sort:pi});
    if(pr.error){ toast('Seed failed: '+pr.error.message,true); return; }
    for(const [ti,t] of p.tasks.entries()){
      const det=seedBuildDetail(p,t);
      const tr=await pInsert('tasks',{project_id:p.id,title:t.t,assignee_id:t.a,due:t.due||null,priority:t.pr,status:t.s,blocked_by:t.blockedBy||null,blocks:t.blocks||null,description:det.desc,position:ti});
      if(!tr) return;
      if(det.sub.length) await sb.from('subtasks').insert(det.sub.map((s,si)=>({task_id:tr.id,title:s.t,done:!!s.done,position:si})));
      if(det.comments.length) await sb.from('comments').insert(det.comments.map(c=>({task_id:tr.id,author_id:c.a,body:c.x})));
      if(det.links.length) await sb.from('attachments').insert(det.links.map(l=>({task_id:tr.id,label:l.label,sublabel:l.sub,url:l.url})));
    }
  }
  await loadLive(); await resolveMe(); renderMe(); rerenderCurrent();
  toast('Sample campaigns imported.');
}

/* ===================================================================
   Boot
   =================================================================== */
async function afterLogin(){
  hideAuth();
  try { await loadLive(); } catch(_){ return; }
  await resolveMe();
  renderMe(); renderBoardPicker(); refreshCounts(); show('dashboard');
  subscribeRealtime();
  if(!PROJECTS.length) document.getElementById('seed-banner').style.display='flex';
}
async function boot(){
  // wire nav + controls
  document.getElementById('nav').addEventListener('click',e=>{ const it=e.target.closest('.nav-item'); if(!it||it.classList.contains('disabled')||!it.dataset.view) return; show(it.dataset.view); });
  document.querySelectorAll('[data-jump]').forEach(el=>el.addEventListener('click',()=>show(el.dataset.jump)));
  document.getElementById('proj-filter').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; currentFilter=b.dataset.f; document.querySelectorAll('#proj-filter button').forEach(x=>x.classList.toggle('on',x===b)); renderProjects(currentFilter); });
  document.getElementById('mode-badge').textContent = LIVE ? 'Live' : 'Demo';
  document.getElementById('mode-badge').className = 'mode-badge '+(LIVE?'live':'demo');
  if(!LIVE) document.getElementById('demo-banner').style.display='flex';

  if(LIVE){
    const {data:{session}}=await sb.auth.getSession();
    if(!session){ showAuth(); return; }
    await afterLogin();
  } else {
    buildFromSeed();
    await resolveMe();
    renderMe(); renderBoardPicker(); refreshCounts(); show('dashboard');
  }
}
document.addEventListener('DOMContentLoaded', boot);
