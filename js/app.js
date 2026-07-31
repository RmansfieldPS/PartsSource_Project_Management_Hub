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
let NOTIFS = [];      // in-app notifications (all members; filtered to ME on render)
let demoSeq = 0;
let currentProject = null, currentTask = null, currentFilter = 'active', currentView = 'dashboard';
let FILT = { board:{a:'',pr:''}, proj:{motion:'',owner:'',segment:''}, cal:{a:'',proj:''} };
let calY = TODAY.getFullYear(), calM = TODAY.getMonth();

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
/* Roles: 'admin' | 'user'. Missing role (pre-migration DB) = admin, so nothing
   breaks before db/upgrade-roles.sql has been run. */
function isAdminMe(){ const r = TEAM[ME] && TEAM[ME].appRole; return r === 'admin' || r == null; }
function canEdit(t){ return isAdminMe() || t.a === ME; }
function denyEdit(){ toast("Only the assignee or an admin can change this task", true); }
function upstreamOf(p,t){ return t.bt ? p.tasks.find(x=>x.id===t.bt) : null; }
function blockedLabel(p,t){ const u=upstreamOf(p,t); return u ? u.t : (t.blockedBy||''); }
function fmtMoney(n){ if(n>=1e6) return '$'+(n/1e6).toFixed(n>=1e7?0:1)+'M'; if(n>=1e3) return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); }
function parseValue(v){
  if(!v) return 0;
  const s=String(v).replace(/,/g,'');
  const m=s.match(/(\d+(?:\.\d+)?)(?:\s*[–\-]\s*\d+(?:\.\d+)?)?\s*([MK])/i);
  if(!m) return 0;
  return parseFloat(m[1]) * (m[2].toUpperCase()==='M' ? 1e6 : 1e3);
}
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
  TEAM = {}; S.members.forEach(m => TEAM[m.id] = {name:m.name, role:m.role, color:m.color, email:m.email, appRole:m.app_role});
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
  TEAM = {}; (mem.data||[]).forEach(m => TEAM[m.id] = {name:m.name, role:m.role, color:m.color, email:m.email, appRole:m.app_role});
  const subBy={}, comBy={}, attBy={};
  (sub.data||[]).forEach(s => (subBy[s.task_id]=subBy[s.task_id]||[]).push({id:s.id, t:s.title, done:s.done}));
  (com.data||[]).forEach(c => (comBy[c.task_id]=comBy[c.task_id]||[]).push({id:c.id, a:c.author_id, w:fmtWhen(c.created_at), x:c.body}));
  (att.data||[]).forEach(a => (attBy[a.task_id]=attBy[a.task_id]||[]).push({id:a.id, label:a.label, sub:a.sublabel, url:a.url}));
  const tBy={};
  (tsk.data||[]).forEach(t => (tBy[t.project_id]=tBy[t.project_id]||[]).push({
    id:t.id, t:t.title, a:t.assignee_id, due:t.due, pr:t.priority, s:t.status, blockedBy:t.blocked_by, blocks:t.blocks,
    bt:t.blocked_by_task||null, completedAt:t.completed_at||null,
    _desc:t.description||null, _sub:subBy[t.id]||[], _comments:comBy[t.id]||[], _links:attBy[t.id]||[]
  }));
  // notifications table may not exist until db/upgrade-tier1.sql has run — tolerate that
  try {
    const nr = await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(100);
    NOTIFS = nr.error ? [] : (nr.data||[]).map(n=>({id:n.id, member_id:n.member_id, body:n.body, project_id:n.project_id, task_id:n.task_id, read:n.read, created_at:n.created_at}));
  } catch(_) { NOTIFS = []; }
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
  const active = PROJECTS.filter(p=>p.status==='active');
  document.getElementById('kpi-active').textContent = active.length;
  document.getElementById('kpi-active-foot').textContent = `of ${PROJECTS.length} total campaigns`;
  document.getElementById('kpi-rb').textContent = PROJECTS.flatMap(p=>p.tasks).filter(t=>t.s==='blocked').length;
  document.getElementById('kpi-done').textContent = PROJECTS.filter(p=>p.status==='complete').length;
  document.getElementById('kpi-pipeline').textContent = fmtMoney(active.reduce((s,p)=>s+parseValue(p.value),0));

  // open work by status (non-complete campaigns)
  const openTasks = PROJECTS.filter(p=>p.status!=='complete').flatMap(p=>p.tasks);
  const sbCounts = {}; ORDER.forEach(s=>sbCounts[s]=0);
  openTasks.forEach(t=>{ if(sbCounts[t.s]!=null) sbCounts[t.s]++; });
  const sbMax = Math.max(...Object.values(sbCounts),1);
  document.getElementById('sb-total').textContent = `${openTasks.length} tasks`;
  document.getElementById('status-breakdown').innerHTML = ORDER.map(s=>
    `<div class="sb-row"><span class="sb-name"><span class="dot" style="background:${STATUS[s].dot}"></span>${STATUS[s].label}</span><div class="sb-track"><span style="width:${Math.round(sbCounts[s]/sbMax*100)}%;background:${STATUS[s].dot}"></span></div><span class="num" style="width:24px;text-align:right;font-weight:700;font-size:12.5px">${sbCounts[s]}</span></div>`
  ).join('');

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
  // segment options reflect actual data; preserve current selection
  const segSel=document.getElementById('proj-fs');
  const segs=[...new Set(PROJECTS.map(p=>p.segment).filter(Boolean))].sort();
  segSel.innerHTML = `<option value="">All segments</option>`+segs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  segSel.value = segs.includes(FILT.proj.segment) ? FILT.proj.segment : (FILT.proj.segment='', '');
  ['proj-fm','proj-fo','proj-fs'].forEach((id,ix)=>document.getElementById(id).classList.toggle('on',!!Object.values(FILT.proj)[ix]));
  const list = PROJECTS.filter(p=> filter==='all'?true : filter==='active'?p.status==='active' : filter==='planning'?(p.status==='planning'||p.status==='review') : p.status==='complete')
    .filter(p=>!FILT.proj.motion || p.motion===FILT.proj.motion)
    .filter(p=>!FILT.proj.owner || ownerOf(p)===FILT.proj.owner)
    .filter(p=>!FILT.proj.segment || p.segment===FILT.proj.segment);
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
  const rows = p.tasks.map((t,i)=>{
    const editable=canEdit(t);
    return `
    <div class="trow ${t.s==='done'?'done':''}">
      <button class="check" style="${t.s==='done'?'background:var(--good);border-color:var(--good)':''}${editable?'':';cursor:default;opacity:.55'}" onclick="cycleDone('${p.id}',${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity:${t.s==='done'?1:0}"><path d="M20 6L9 17l-5-5"/></svg></button>
      <div><div class="trow-title" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}</div>${(t.bt||t.blockedBy)?`<div class="trow-sub">⛔ Waiting on: ${esc(blockedLabel(p,t))}</div>`:t.blocks?`<div class="trow-sub" style="color:var(--warn)">↗ Blocks ${esc(t.blocks)}</div>`:''}</div>
      <div>${editable?`<button class="assignee" onclick="openAssign(event,'${p.id}',${i})">${av(t.a)}${esc(teamName(t.a))}<span class="car">▾</span></button>`:`<span class="assignee" style="cursor:default">${av(t.a)}${esc(teamName(t.a))}</span>`}</div>
      <div class="col-due num t-due ${t.due&&new Date(t.due+'T00:00:00')<TODAY&&t.s!=='done'?'over':''}" style="font-size:12.5px;color:var(--ink-2)">${fmtDue(t.due)}</div>
      <div class="col-prio"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>
      <div><select class="status-sel" ${editable?'':'disabled'} onchange="setStatus('${p.id}',${i},this.value)">${ORDER.map(s=>`<option value="${s}" ${t.s===s?'selected':''}>${STATUS[s].label}</option>`).join('')}</select></div>
    </div>`;}).join('');

  document.getElementById('project-detail').innerHTML = `
    <div class="pd-head">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="pd-title">${esc(p.name)}</span><span class="pill ${st[0]}">${st[1]}</span>${isAdminMe()?`<button class="btn sm" onclick="openCampaignModal('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>Edit</button>`:''}</div><div class="pd-desc">${esc(p.desc)}</div></div>
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
          <select id="nt-assignee">${(isAdminMe()?Object.keys(TEAM):[ME]).map(k=>`<option value="${k}">${esc(teamName(k))}</option>`).join('')}</select>
          <input id="nt-due" type="date" />
          <select id="nt-prio"><option value="high">High</option><option value="med" selected>Medium</option><option value="low">Low</option></select>
          <button class="btn primary sm" type="submit">Add</button>
        </form>
      </div>
    </div>
    <div class="page-sub" style="margin-top:12px">${isAdminMe()?'As an admin you can edit and reassign any task — click an assignee chip to hand it to a teammate.':'You can update tasks assigned to you; admins manage everything else.'}</div>`;
}
function toggleAddTask(){ const f=document.getElementById('addtask-form'); f.classList.toggle('open'); if(f.classList.contains('open')) document.getElementById('nt-title').focus(); }
async function addTask(e){
  e.preventDefault();
  const p=byId(currentProject);
  const title=document.getElementById('nt-title').value.trim(), due=document.getElementById('nt-due').value||null, pr=document.getElementById('nt-prio').value;
  const a = isAdminMe() ? document.getElementById('nt-assignee').value : ME; // base users create tasks for themselves only
  if(!title) return;
  if(LIVE){
    const d=await pInsert('tasks',{project_id:p.id,title,assignee_id:a,due,priority:pr,status:'todo',position:p.tasks.length});
    if(!d) return;
    p.tasks.push({id:d.id,t:d.title,a:d.assignee_id,due:d.due,pr:d.priority,s:d.status,_sub:[],_comments:[],_links:[]});
  } else {
    p.tasks.push({id:'d'+(++demoSeq)+Date.now(),t:title,a,due,pr,s:'todo'});
  }
  if(a!==ME) notify(a, `${teamName(ME)} assigned you "${title}" in ${p.name}.`, p.id, p.tasks[p.tasks.length-1].id);
  rerender();
}
function setStatus(id,i,v){
  const p=byId(id), t=p.tasks[i], was=t.s;
  if(!canEdit(t)){ denyEdit(); rerender(); return; }
  if(was===v) return;
  t.s=v;
  const fields={status:v};
  if(v==='done' && was!=='done'){ t.completedAt=new Date().toISOString(); fields.completed_at=t.completedAt; }
  if(was==='done' && v!=='done'){ t.completedAt=null; fields.completed_at=null; }
  if(LIVE) pUpdate('tasks',t.id,fields);
  if(v==='done') autoUnblock(p,t);
  rerender();
}
function cycleDone(id,i){ const t=byId(id).tasks[i]; setStatus(id,i, t.s==='done'?'todo':'done'); }
function autoUnblock(p,doneTask){
  p.tasks.forEach(x=>{
    if(x.bt===doneTask.id && x.s==='blocked'){
      x.s='todo'; x.bt=null; x.blockedBy=null;
      if(LIVE) pUpdate('tasks',x.id,{status:'todo',blocked_by_task:null,blocked_by:null});
      const msg=`Unblocked — "${doneTask.t}" was completed.`;
      if(x._comments) x._comments.push({a:ME,w:'Just now',x:msg});
      if(LIVE && x.id) pInsert('comments',{task_id:x.id,author_id:ME,body:msg});
      notify(x.a, `"${x.t}" is unblocked — ${doneTask.t} was completed.`, p.id, x.id);
      toast(`Unblocked: ${x.t}`);
    }
  });
}
function setBlockedBy(id,i,val){
  const p=byId(id), t=p.tasks[i];
  if(!canEdit(t)){ denyEdit(); rerender(); return; }
  if(val){
    t.bt=val; t.blockedBy=null;
    if(t.s!=='blocked' && t.s!=='done') t.s='blocked';
    if(LIVE) pUpdate('tasks',t.id,{blocked_by_task:val,blocked_by:null,status:t.s});
  } else {
    t.bt=null; t.blockedBy=null;
    if(t.s==='blocked') t.s='todo';
    if(LIVE) pUpdate('tasks',t.id,{blocked_by_task:null,blocked_by:null,status:t.s});
  }
  rerender();
}
function rerender(){ if(currentProject && isView('project')) renderProjectDetail(); if(currentTask) renderDrawer(currentTask.pid,currentTask.i); refreshCounts(); }

/* ---------- Assignee popover ---------- */
const amenu = document.getElementById('amenu');
function openAssign(e,id,i){
  e.stopPropagation();
  if(!canEdit(byId(id).tasks[i])){ denyEdit(); return; }
  const r=e.currentTarget.getBoundingClientRect();
  amenu.innerHTML = `<div class="ah">Assign to</div>`+Object.keys(TEAM).map(k=>`<button onclick="assign('${id}',${i},'${k}')">${av(k)}<span>${esc(TEAM[k].name)}</span><span class="r">${esc(TEAM[k].role.split(' ')[0])}</span></button>`).join('');
  amenu.style.left=Math.min(r.left,window.innerWidth-220)+'px';
  amenu.style.top=(r.bottom+6)+'px';
  amenu.classList.add('open');
}
function assign(id,i,who){
  const t=byId(id).tasks[i], was=t.a;
  if(!canEdit(t)){ denyEdit(); return; }
  t.a=who; amenu.classList.remove('open'); rerender();
  if(LIVE) pUpdate('tasks',t.id,{assignee_id:who});
  if(who!==was && who!==ME) notify(who, `${teamName(ME)} assigned you "${t.t}".`, id, t.id);
}

/* ---------- Notifications ---------- */
async function notify(member, body, projectId, taskId){
  if(!member || member===ME) return; // don't notify yourself about your own action
  const n={member_id:member, body, project_id:projectId||null, task_id:taskId||null, read:false, created_at:new Date().toISOString()};
  if(LIVE){
    try{ const {data}=await sb.from('notifications').insert(n).select().single(); NOTIFS.unshift(data||n); }
    catch(_){ NOTIFS.unshift(n); }
  } else NOTIFS.unshift({...n, id:'n'+(++demoSeq)});
  renderBell();
}
function myNotifs(){ return NOTIFS.filter(n=>n.member_id===ME); }
function renderBell(){
  const unread=myNotifs().filter(n=>!n.read).length;
  const b=document.getElementById('bell-badge');
  b.style.display = unread ? '' : 'none';
  b.textContent = unread;
}
function toggleBell(e){
  e.stopPropagation();
  const panel=document.getElementById('bell-panel');
  if(panel.classList.contains('open')){ panel.classList.remove('open'); return; }
  const mine=myNotifs();
  // computed due-today/overdue for ME
  const dueSoon = PROJECTS.flatMap(p=>p.tasks.map((t,i)=>({t,p,i})))
    .filter(x=>x.t.a===ME && x.t.s!=='done' && x.t.due && new Date(x.t.due+'T00:00:00')<=TODAY);
  panel.innerHTML =
    (dueSoon.length?`<div class="bp-head">Needs attention today</div>`+dueSoon.map(({t,p,i})=>{
      const over=new Date(t.due+'T00:00:00')<TODAY;
      return `<div class="notif-row" onclick="closeBell();openTask('${p.id}',${i})">${av(t.a)}<div><div>${over?'<b style="color:var(--crit)">Overdue:</b> ':'<b>Due today:</b> '}${esc(t.t)}</div><div class="nw">${esc(p.name)}</div></div></div>`;
    }).join(''):'') +
    `<div class="bp-head">Notifications</div>` +
    (mine.length ? mine.slice(0,30).map(n=>{
      const p=n.project_id?byId(n.project_id):null;
      const idx=p&&n.task_id ? p.tasks.findIndex(t=>t.id===n.task_id) : -1;
      const click = (p&&idx>=0) ? `closeBell();openTask('${p.id}',${idx})` : (p?`closeBell();openProject('${p.id}')`:`closeBell()`);
      return `<div class="notif-row ${n.read?'':'unread'}" onclick="${click}"><div><div>${esc(n.body)}</div><div class="nw">${fmtWhen(n.created_at)||'Just now'}</div></div></div>`;
    }).join('') : `<div class="notif-empty">Nothing yet. You'll see assignments and unblocked tasks here.</div>`);
  panel.classList.add('open');
  markNotifsRead();
}
function closeBell(){ document.getElementById('bell-panel').classList.remove('open'); }
async function markNotifsRead(){
  const unread=myNotifs().filter(n=>!n.read);
  if(!unread.length){ renderBell(); return; }
  unread.forEach(n=>n.read=true);
  renderBell();
  if(LIVE){ try{ await sb.from('notifications').update({read:true}).eq('member_id',ME).eq('read',false); }catch(_){} }
}
document.addEventListener('click',e=>{ if(!e.target.closest('.bell-wrap')) closeBell(); });
document.addEventListener('click',e=>{ if(!amenu.contains(e.target)&&!e.target.closest('.assignee')) amenu.classList.remove('open'); });

/* ===================================================================
   RENDER — Task detail drawer
   =================================================================== */
function openTask(id,i){ const p=byId(id),t=p.tasks[i]; ensureDetail(p,t); currentTask={pid:id,i,taskId:t.id}; renderDrawer(id,i); document.getElementById('drawer').classList.add('open'); document.getElementById('drawer-ov').classList.add('open'); }
function closeDrawer(){ currentTask=null; document.getElementById('drawer').classList.remove('open'); document.getElementById('drawer-ov').classList.remove('open'); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeDrawer(); closeModal(); closeBell(); document.getElementById('search-results').classList.remove('open'); } });
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
        <span class="fl">Assignee</span><span>${canEdit(t)?`<button class="assignee" onclick="openAssign(event,'${p.id}',${i})">${av(t.a)}${esc(teamName(t.a))}<span class="car">▾</span></button>`:`<span class="assignee" style="cursor:default">${av(t.a)}${esc(teamName(t.a))}</span>`}</span>
        <span class="fl">Status</span><span><select class="status-sel" ${canEdit(t)?'':'disabled'} onchange="setStatus('${p.id}',${i},this.value)">${ORDER.map(s=>`<option value="${s}" ${t.s===s?'selected':''}>${STATUS[s].label}</option>`).join('')}</select></span>
        <span class="fl">Due date</span><span class="num t-due ${over?'over':''}" style="font-weight:600">${over?'Overdue · ':''}${fmtDue(t.due)}</span>
        <span class="fl">Priority</span><span><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></span>
        <span class="fl">Blocked by</span><span><select class="status-sel" style="max-width:100%" ${canEdit(t)?'':'disabled'} onchange="setBlockedBy('${p.id}',${i},this.value)">
          <option value="">— nothing —</option>
          ${p.tasks.filter(x=>x.id!==t.id && x.s!=='done').map(x=>`<option value="${x.id}" ${t.bt===x.id?'selected':''}>${esc(x.t)}</option>`).join('')}
        </select></span>
      </div>
      ${t.bt?(function(){ const u=upstreamOf(p,t); return u?`<div class="d-blocker2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg><span>Waiting on: <b>${esc(u.t)}</b> (${STATUS[u.s].label}, ${esc(teamName(u.a))}). Unblocks automatically when it's completed.</span></div>`:''; })():t.blockedBy?`<div class="d-blocker2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg><span>Waiting on: ${esc(t.blockedBy)} (external input)</span></div>`:''}
      ${t.blocks?`<div class="d-blocker2" style="background:var(--warn-soft);border-color:color-mix(in srgb,var(--warn) 30%,transparent);color:var(--warn)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg><span>This task blocks ${esc(t.blocks)}.</span></div>`:''}
      <div class="d-sec">Description</div>
      <div class="d-desc">${esc(t._desc)}</div>
      <div class="d-sec">Subtasks <span class="cnt">${subDone}/${t._sub.length}</span><div class="prog-mini" style="margin-left:auto"><span style="width:${subPct}%"></span></div></div>
      ${t._sub.map((s,si)=>`<div class="subrow ${s.done?'done':''}"><button class="check" style="${s.done?'background:var(--good);border-color:var(--good)':''}" onclick="toggleSub('${p.id}',${i},${si})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity:${s.done?1:0}"><path d="M20 6L9 17l-5-5"/></svg></button><span class="sub-t">${esc(s.t)}</span></div>`).join('')}
      ${canEdit(t)?`<form class="subadd" onsubmit="addSub(event,'${p.id}',${i})"><input id="newsub" placeholder="Add a subtask…" /><button class="btn sm" type="submit">Add</button></form>`:''}
      <div class="d-sec">Attachments</div>
      ${t._links.length? t._links.map(l=>`<a class="att" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="ai"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span><div class="al">${esc(l.label)}</div><div class="as">${esc(l.sub)}</div></span></a>`).join('') : '<div class="att-empty">No files yet — link a SharePoint doc or asset for this task.</div>'}
      <div class="d-sec">Activity</div>
      ${t._comments.map(c=>`<div class="activity">${av(c.a)}<div class="aline"><span class="an">${esc(teamName(c.a))}</span> ${esc(c.x)}<div class="aw">${esc(c.w)}</div></div></div>`).join('') || '<div class="att-empty">No activity yet.</div>'}
      <form class="commentbox" onsubmit="addComment(event,'${p.id}',${i})">${av(ME)}<textarea id="newcomment" placeholder="Write a comment…"></textarea><button class="btn primary sm" type="submit">Post</button></form>
    </div>`;
}
function toggleSub(id,i,si){ const t=byId(id).tasks[i]; if(!canEdit(t)){ denyEdit(); return; } const s=t._sub[si]; s.done=!s.done; renderDrawer(id,i); if(LIVE&&s.id) pUpdate('subtasks',s.id,{done:s.done}); }
async function addSub(e,id,i){
  e.preventDefault(); const v=document.getElementById('newsub').value.trim(); if(!v) return;
  const t=byId(id).tasks[i];
  if(!canEdit(t)){ denyEdit(); return; }
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
      return `<div class="task"><button class="check" onclick="cycleDone('${p.id}',${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></button><div class="t-body"><div class="t-title" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}</div><div class="t-meta"><span class="tag" style="cursor:pointer" onclick="openProject('${p.id}')">${esc(p.name)}</span><span class="t-due ${over?'over':''}">${over?'Overdue · ':'Due '}${fmtDue(t.due)}</span>${(t.bt||t.blockedBy)?`<span class="pill crit" style="font-size:11px">Blocked</span>`:''}${t.blocks?`<span class="pill crit plain" style="font-size:11px">Blocks work</span>`:''}</div></div><div class="t-right"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div></div>`;
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
  document.getElementById('board-fa').classList.toggle('on',!!FILT.board.a);
  document.getElementById('board-fp').classList.toggle('on',!!FILT.board.pr);
  document.getElementById('board').innerHTML = ORDER.map(s=>{
    const items=p.tasks.map((t,idx)=>({t,idx})).filter(o=>o.t.s===s)
      .filter(o=>!FILT.board.a || o.t.a===FILT.board.a)
      .filter(o=>!FILT.board.pr || o.t.pr===FILT.board.pr);
    return `<div class="col" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropCard(event,'${p.id}','${s}')"><div class="col-h"><span class="dot" style="background:${STATUS[s].dot}"></span><span class="name">${STATUS[s].label}</span><span class="n num">${items.length}</span></div>${items.map(({t,idx})=>`
      <div class="kanban" draggable="${canEdit(t)?'true':'false'}" ondragstart="dragStart(event,'${p.id}',${idx})" ondragend="dragEnd(event)" onclick="cardClick('${p.id}',${idx})" ${s==='blocked'?'style="border-color:color-mix(in srgb, var(--crit) 40%, var(--line))"':''}>
        <div class="kt">${esc(t.t)}</div>
        <div class="kmeta"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>
        ${(t.bt||t.blockedBy)?`<div class="blocked-note"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>${esc(blockedLabel(p,t))}</div>`:''}
        <div class="kfoot">${av(t.a)}<span class="t-due num" style="font-size:11px;${t.due&&new Date(t.due+'T00:00:00')<TODAY&&s!=='done'?'color:var(--crit)':'color:var(--ink-3)'}">${s==='done'?'Done':fmtDue(t.due)}</span></div>
      </div>`).join('')||'<div style="padding:10px 6px;color:var(--ink-3);font-size:12px">—</div>'}</div>`;
  }).join('');
}

/* ---------- Board drag & drop ---------- */
let dragInfo=null, suppressClick=false;
function dragStart(e,pid,idx){
  dragInfo={pid,idx}; suppressClick=true;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain','');
  e.currentTarget.classList.add('dragging');
}
function dragEnd(e){ e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.col.dragover').forEach(c=>c.classList.remove('dragover')); setTimeout(()=>suppressClick=false,80); }
function dragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect='move'; e.currentTarget.classList.add('dragover'); }
function dragLeave(e){ if(!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('dragover'); }
function dropCard(e,pid,status){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  if(!dragInfo || dragInfo.pid!==pid) return;
  setStatus(pid,dragInfo.idx,status);
  dragInfo=null;
}
function cardClick(pid,idx){ if(suppressClick) return; openTask(pid,idx); }

/* ===================================================================
   RENDER — Roadblocks
   =================================================================== */
function renderRoadblocks(){
  const blocked = PROJECTS.flatMap(p=>p.tasks.map((t,i)=>({t,p,i})).filter(x=>x.t.s==='blocked'));
  document.getElementById('rb-banner-text').innerHTML = blocked.length ? `<b>${blocked.length} task${blocked.length>1?'s are':' is'} blocked.</b> Each is waiting on an upstream task or input before work can continue.` : `No roadblocks right now — nothing is blocked.`;
  document.getElementById('roadblocks-body').innerHTML = blocked.map(({t,p,i})=>{
    const u=upstreamOf(p,t);
    const uIdx = u ? p.tasks.indexOf(u) : -1;
    const right = u
      ? `<div class="tt" style="cursor:pointer" onclick="openTask('${p.id}',${uIdx})">${esc(u.t)}</div><div class="mt"><span class="pill ${u.s==='progress'?'info':'warn'}" style="font-size:11px">${STATUS[u.s].label}</span>${av(u.a)}<span class="page-sub">auto-unblocks when done</span></div>`
      : `<div class="tt">${esc(t.blockedBy||'Unspecified blocker')}</div><div class="mt"><span class="pill warn" style="font-size:11px">External input needed</span></div>`;
    return `
    <div class="rb crit">
      <div class="rb-side"><div class="lbl">Blocked task</div><div class="tt" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}</div><div class="mt"><span class="tag" style="cursor:pointer" onclick="openProject('${p.id}')">${esc(p.name)}</span>${av(t.a)}</div></div>
      <div class="rb-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg><div class="cap">waiting on</div></div>
      <div class="rb-side"><div class="lbl">Roadblock</div>${right}</div>
    </div>`;
  }).join('');
}

/* ===================================================================
   RENDER — Calendar
   =================================================================== */
const MONTHS_FULL=['January','February','March','April','May','June','July','August','September','October','November','December'];
function calShift(n){ calM+=n; if(calM<0){calM=11;calY--;} if(calM>11){calM=0;calY++;} renderCalendar(); }
function calToday(){ calY=TODAY.getFullYear(); calM=TODAY.getMonth(); renderCalendar(); }
function renderCalendar(){
  // campaign filter options reflect current data; preserve selection
  const fp=document.getElementById('cal-fp');
  fp.innerHTML = `<option value="">All campaigns</option>`+PROJECTS.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  fp.value = byId(FILT.cal.proj) ? FILT.cal.proj : (FILT.cal.proj='', '');
  document.getElementById('cal-fa').classList.toggle('on',!!FILT.cal.a);
  fp.classList.toggle('on',!!FILT.cal.proj);
  document.getElementById('cal-title').textContent = `${MONTHS_FULL[calM]} ${calY}`;

  // index tasks by due date string (respecting filters)
  const byDue={};
  PROJECTS.forEach(p=>p.tasks.forEach((t,i)=>{
    if(!t.due) return;
    if(FILT.cal.a && t.a!==FILT.cal.a) return;
    if(FILT.cal.proj && p.id!==FILT.cal.proj) return;
    (byDue[t.due]=byDue[t.due]||[]).push({p,t,i});
  }));

  const pad=n=>String(n).padStart(2,'0');
  const todayStr = `${TODAY.getFullYear()}-${pad(TODAY.getMonth()+1)}-${pad(TODAY.getDate())}`;
  const startDow = new Date(calY,calM,1).getDay();
  const daysInMonth = new Date(calY,calM+1,0).getDate();
  const cells = Math.ceil((startDow+daysInMonth)/7)*7;
  let html='';
  for(let c=0;c<cells;c++){
    const d = new Date(calY,calM,c-startDow+1);
    const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const other = d.getMonth()!==calM;
    const items = byDue[ds]||[];
    html += `<div class="cal-cell${other?' other':''}${ds===todayStr?' today':''}">
      <div class="cal-date">${d.getDate()}</div>
      ${items.map(({p,t,i})=>{
        const over = ds<todayStr && t.s!=='done';
        return `<div class="cal-chip${t.s==='done'?' done':''}${over?' over':''}" onclick="openTask('${p.id}',${i})" title="${esc(t.t)} — ${esc(p.name)} · ${esc(teamName(t.a))}"><span class="cdot" style="background:${over?'var(--crit)':STATUS[t.s].dot}"></span><span class="ct">${esc(t.t)}</span></div>`;
      }).join('')}
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML = html;
}

/* ---------- Filter select options (members are static per session) ---------- */
function fillFilterOptions(){
  const mem = k => Object.keys(TEAM).map(c=>`<option value="${c}">${esc(TEAM[c].name)}</option>`).join('');
  document.getElementById('board-fa').innerHTML = `<option value="">All assignees</option>`+mem();
  document.getElementById('cal-fa').innerHTML   = `<option value="">All assignees</option>`+mem();
  document.getElementById('proj-fo').innerHTML  = `<option value="">All owners</option>`+mem();
  document.getElementById('board-fa').value=FILT.board.a; document.getElementById('cal-fa').value=FILT.cal.a; document.getElementById('proj-fo').value=FILT.proj.owner;
}

/* ===================================================================
   Search
   =================================================================== */
function runSearch(q){
  const box=document.getElementById('search-results');
  q=(q||'').trim().toLowerCase();
  if(q.length<2){ box.classList.remove('open'); return; }
  const hits=[];
  PROJECTS.forEach(p=>{
    if([p.name,p.desc,p.segment,p.solution].some(f=>f&&f.toLowerCase().includes(q)))
      hits.push({kind:'camp', label:p.name, sub:`${p.segment||''} · ${STATUS_PILL[projStatus(p)][1]}`, click:`openProject('${p.id}')`});
  });
  PROJECTS.forEach(p=>p.tasks.forEach((t,i)=>{
    if(t.t.toLowerCase().includes(q))
      hits.push({kind:'task', label:t.t, sub:`${p.name} · ${teamName(t.a)}`, click:`openTask('${p.id}',${i})`});
  }));
  box.innerHTML = hits.length
    ? hits.slice(0,9).map(h=>`<div class="sr-row" onmousedown="closeSearch();${h.click}"><span class="sr-kind ${h.kind}">${h.kind==='camp'?'Campaign':'Task'}</span><div style="min-width:0"><div style="font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(h.label)}</div><div class="sr-sub">${esc(h.sub)}</div></div></div>`).join('')
    : `<div class="sr-none">No matches for "${esc(q)}"</div>`;
  box.classList.add('open');
}
function closeSearch(){ document.getElementById('search-results').classList.remove('open'); document.getElementById('global-search').value=''; }
document.addEventListener('click',e=>{ if(!e.target.closest('.search')) document.getElementById('search-results').classList.remove('open'); });

/* ===================================================================
   Navigation
   =================================================================== */
const titles = { dashboard:['Dashboard','Demand Gen campaign portfolio'], mytasks:['My Tasks',"Everything assigned to you, grouped by when it's due"], board:['Board','Kanban view · drag tasks across stages'], projects:['Campaigns','All Demand Gen campaigns and their progress'], project:['Campaign','Tasks, owner & assignments'], calendar:['Calendar','Every task on its due date'], team:['Team','People, sign-ins & permissions'], roadblocks:['Roadblocks','Tasks blocked by upstream work or inputs'] };
function show(view){
  if(view==='team' && !isAdminMe()) view='dashboard';
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
  if(view==='calendar') renderCalendar();
  if(view==='team') renderTeam();
  if(view==='roadblocks') renderRoadblocks();
  window.scrollTo(0,0);
}
function refreshCounts(){
  document.getElementById('c-mine').textContent = PROJECTS.flatMap(p=>p.tasks).filter(t=>t.a===ME&&t.s!=='done').length;
  document.getElementById('c-proj').textContent = PROJECTS.filter(p=>p.status!=='complete').length;
  document.getElementById('c-rb').textContent = PROJECTS.flatMap(p=>p.tasks).filter(t=>t.s==='blocked').length;
}
function rerenderCurrent(){
  renderBoardPicker(); refreshCounts(); renderBell();
  show(currentView);
  if(currentTask){ const p=byId(currentTask.pid); if(p){ const idx=p.tasks.findIndex(t=>t.id===currentTask.taskId); if(idx>=0){ currentTask.i=idx; renderDrawer(currentTask.pid,idx); } else closeDrawer(); } else closeDrawer(); }
}

/* ---------- Campaign create / edit modal ---------- */
let editingProject = null; // null = creating new
function openCampaignModal(id){
  if(!isAdminMe()){ toast('Only admins can create or edit campaigns', true); return; }
  editingProject = id;
  const p = id ? byId(id) : null;
  document.getElementById('cm-title').textContent = p ? 'Edit campaign' : 'New campaign';
  document.getElementById('cm-save').textContent = p ? 'Save changes' : 'Create campaign';
  document.getElementById('cm-owner').innerHTML = Object.keys(TEAM).map(k=>`<option value="${k}">${esc(TEAM[k].name)}</option>`).join('');
  document.getElementById('cm-name').value     = p ? p.name : '';
  document.getElementById('cm-desc').value     = p ? (p.desc||'') : '';
  document.getElementById('cm-owner').value    = p ? (ownerOf(p)||ME) : ME;
  document.getElementById('cm-status').value   = p ? p.status : 'active';
  document.getElementById('cm-motion').value   = p ? (p.motion||'recruit') : 'recruit';
  document.getElementById('cm-segment').value  = p ? (p.segment||'') : '';
  document.getElementById('cm-solution').value = p ? (p.solution||'') : '';
  document.getElementById('cm-pipeline').value = p ? (p.pipeline||'') : '';
  document.getElementById('cm-value').value    = p ? (p.value||'') : '';
  document.getElementById('cm-launch').value   = p ? (p.launch||'') : '';
  document.getElementById('cm-audience').value = p ? (p.audience||'') : '';
  document.getElementById('cm-blocker').value  = p ? (p.blocker||'') : '';
  document.getElementById('campaign-modal').classList.add('open');
  document.getElementById('modal-ov').classList.add('open');
  document.getElementById('cm-name').focus();
}
function closeModal(){
  editingProject = null;
  document.getElementById('campaign-modal').classList.remove('open');
  document.getElementById('user-modal').classList.remove('open');
  document.getElementById('modal-ov').classList.remove('open');
}

/* ---------- Team management (admins) ---------- */
const PALETTE=['#0A6CBF','#0E9AA6','#8A4FC2','#C77A0A','#1E9E62','#D64545','#5A67D8','#B7791F','#2C7A7B','#97266D'];
function renderTeam(){
  document.getElementById('team-body').innerHTML = Object.keys(TEAM).map(k=>{
    const m=TEAM[k];
    const open=PROJECTS.flatMap(p=>p.tasks).filter(t=>t.a===k&&t.s!=='done').length;
    return `<tr>
      <td style="width:34px">${av(k)}</td>
      <td class="proj-name">${esc(m.name)}${k===ME?' <span class="tag">you</span>':''}</td>
      <td>${esc(m.role||'')}</td>
      <td><input class="fsel" style="max-width:240px;width:100%" value="${esc(m.email||'')}" placeholder="not set — needed to sign in" onchange="updateMember('${k}','email',this.value.trim())" /></td>
      <td><select class="fsel" onchange="updateMember('${k}','app_role',this.value)"><option value="user" ${m.appRole!=='admin'?'selected':''}>Base user</option><option value="admin" ${m.appRole==='admin'?'selected':''}>Admin</option></select></td>
      <td class="num" style="font-weight:700">${open}</td>
    </tr>`;
  }).join('');
  document.getElementById('team-note').textContent = LIVE
    ? "A member's sign-in email must match this list for the app to know who they are. Adding a user creates their login immediately."
    : 'Demo mode — changes here are not saved.';
}
async function updateMember(k,field,val){
  if(!isAdminMe()){ toast('Admins only', true); renderTeam(); return; }
  if(field==='app_role' && k===ME && val!=='admin'){ toast("You can't remove your own admin access", true); renderTeam(); return; }
  TEAM[k][field==='app_role'?'appRole':field] = val || null;
  if(LIVE) await pUpdate('members', k, {[field]: val || null});
  renderTeam(); renderMe();
  toast('Member updated');
}
function openUserModal(){
  if(!isAdminMe()){ toast('Admins only', true); return; }
  document.getElementById('user-form').reset();
  document.getElementById('user-modal').classList.add('open');
  document.getElementById('modal-ov').classList.add('open');
  document.getElementById('um-name').focus();
}
async function saveUser(e){
  e.preventDefault();
  if(!isAdminMe()){ toast('Admins only', true); return; }
  const name=document.getElementById('um-name').value.trim();
  const init=document.getElementById('um-init').value.trim().toUpperCase();
  const email=document.getElementById('um-email').value.trim();
  const pw=document.getElementById('um-pw').value;
  const appRole=document.getElementById('um-role').value;
  const title=document.getElementById('um-title').value.trim();
  if(!/^[A-Z]{2,3}$/.test(init)){ toast('Initials must be 2–3 letters', true); return; }
  if(TEAM[init]){ toast(`Initials "${init}" are already taken`, true); return; }
  if(Object.keys(TEAM).some(k=>TEAM[k].email && TEAM[k].email.toLowerCase()===email.toLowerCase())){ toast('That email is already on the team', true); return; }
  const color=PALETTE.find(c=>!Object.keys(TEAM).some(k=>TEAM[k].color===c)) || PALETTE[Object.keys(TEAM).length % PALETTE.length];
  if(LIVE){
    // Create their login via a throwaway client so the admin's session is untouched.
    const tmp=window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {auth:{persistSession:false, autoRefreshToken:false, storageKey:'pmpm-invite'}});
    const {error}=await tmp.auth.signUp({email, password:pw});
    if(error && !/already (been )?registered/i.test(error.message)){ toast('Could not create login: '+error.message, true); return; }
    const d=await pInsert('members', {id:init, name, role:title||null, color, email, app_role:appRole, sort:Object.keys(TEAM).length});
    if(!d) return;
  }
  TEAM[init]={name, role:title, color, email, appRole};
  fillFilterOptions(); refreshCounts(); renderTeam(); closeModal();
  toast(`${name} added — they can sign in now with the temporary password`);
}
async function saveCampaign(e){
  e.preventDefault();
  if(!isAdminMe()){ toast('Only admins can create or edit campaigns', true); return; }
  const v = id => document.getElementById(id).value.trim();
  const fields = {
    name: v('cm-name'), description: v('cm-desc'), owner_id: v('cm-owner'), status: v('cm-status'),
    motion: v('cm-motion'), segment: v('cm-segment'), solution: v('cm-solution'), pipeline: v('cm-pipeline'),
    value: v('cm-value'), launch: v('cm-launch'), audience: v('cm-audience'), blocker: v('cm-blocker') || null
  };
  if(!fields.name) return;
  if(editingProject){
    const p = byId(editingProject);
    if(LIVE) await pUpdate('projects', p.id, fields);
    Object.assign(p, { name:fields.name, desc:fields.description, owner:fields.owner_id, status:fields.status,
      motion:fields.motion, segment:fields.segment, solution:fields.solution, pipeline:fields.pipeline,
      value:fields.value, launch:fields.launch, audience:fields.audience, blocker:fields.blocker });
    closeModal(); renderBoardPicker(); refreshCounts();
    if(isView('project') && currentProject===p.id) renderProjectDetail(); else show(currentView);
    toast('Campaign updated');
  } else {
    let id;
    if(LIVE){ const d=await pInsert('projects', {...fields, sort:PROJECTS.length}); if(!d) return; id=d.id; }
    else id='d'+(++demoSeq)+Date.now();
    PROJECTS.push({ id, name:fields.name, desc:fields.description, owner:fields.owner_id, status:fields.status,
      motion:fields.motion, segment:fields.segment, solution:fields.solution, pipeline:fields.pipeline,
      value:fields.value, launch:fields.launch, audience:fields.audience, blocker:fields.blocker, tasks:[] });
    closeModal(); renderBoardPicker(); refreshCounts(); openProject(id);
    toast('Campaign created');
  }
}

/* ===================================================================
   Members sidebar / identity
   =================================================================== */
function renderMe(){
  const m=TEAM[ME]||{name:'—',role:'',color:'#7688A0'};
  document.getElementById('sidebar-foot').innerHTML = `
    <div class="me"><div class="avatar" style="background:${m.color}">${esc(ME||'?')}</div><div style="flex:1"><div class="me-name">${esc(m.name)} ${isAdminMe()?'<span class="tag" style="font-size:9.5px;padding:1px 6px">ADMIN</span>':''}</div><div class="me-role">${esc(m.role)}</div></div>
    ${LIVE?`<button class="icon-btn" title="Sign out" onclick="signOut()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`:''}</div>
    ${!LIVE?`<button class="whoami" onclick="identify()">Viewing as ${esc(m.name)} · switch</button>`:''}`;
  document.getElementById('nav-team').style.display = isAdminMe() ? '' : 'none';
  document.getElementById('btn-new').style.display  = isAdminMe() ? '' : 'none';
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
  const up=await sb.from('members').upsert(S.members.map((m,i)=>({id:m.id,name:m.name,role:m.role,color:m.color,email:m.email||null,app_role:m.app_role||'user',sort:i})));
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
  renderMe(); renderBoardPicker(); fillFilterOptions(); refreshCounts(); renderBell(); show('dashboard');
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
    renderMe(); renderBoardPicker(); fillFilterOptions(); refreshCounts(); renderBell(); show('dashboard');
  }
}
document.addEventListener('DOMContentLoaded', boot);
