/* Always On — PartsSource Demand Gen project management
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
let FILT = { board:{a:'',pr:''}, proj:{motion:'',owner:'',segment:''}, cal:{a:'',proj:''}, tl:{owner:'',motion:'',a:''} };
let TEMPLATES = [];   // campaign templates library
let editingTpl = null;
let tlMode = 'portfolio', tlProject = null;
let HAS_LDATE = true; // projects.launch_date column present (false until upgrade-timeline.sql runs)
let HAS_APPR = true;  // approvals migration present (false until upgrade-approvals.sql runs)
let HAS_ROLES = true; // members.app_role present (false until upgrade-roles.sql runs)
let MY_EMAIL = null;  // signed-in email, for the "account not linked" message
let HAS_ARCH = true;  // projects.archived column present (false until upgrade-fundamentals.sql runs)
let HAS_RECUR = true; // tasks.recur column present (false until upgrade-round2.sql runs)
let HAS_CEDIT = true; // comments.updated_at + edit policy present (false until upgrade-round2.sql runs)
let drawerEdit = false; // task drawer title/description edit mode
let editingComment = null; // index of comment being edited inline
const TL_PPD = 16, TL_LABELW = 230, TL_ROWH = 38, TL_HEADH = 34;
let calY = TODAY.getFullYear(), calM = TODAY.getMonth();

/* ---------- Helpers ---------- */
const byId = id => PROJECTS.find(p => p.id === id);
const visibleProjects = () => PROJECTS.filter(p => !p.archived);
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
function isAdminMe(){
  const m = TEAM[ME];
  if(!m) return false;              // identity unknown → never assume admin
  if(!HAS_ROLES) return true;       // pre-migration DB has no roles: everyone edits
  return m.appRole === 'admin';
}
function canEdit(t){ return isAdminMe() || t.a === ME; }
function denyEdit(){ toast("Only the assignee or an admin can change this task", true); }
function upstreamOf(p,t){ return t.bt ? p.tasks.find(x=>x.id===t.bt) : null; }
/* Approval state: null = no approval required (no approver designated). */
function approvalState(p){
  if(!p.approverId) return null;
  const ev=p._approvals||[], last=ev[ev.length-1];
  if(!last || last.action==='submitted') return 'pending';
  return last.action; // 'approved' | 'changes'
}
const APPR_PILL = { pending:['warn','Pending approval'], approved:['good','Approved'], changes:['crit','Changes requested'] };
function apprChip(p, small){
  const st=approvalState(p); if(!st) return '';
  const [cls,label]=APPR_PILL[st];
  return `<span class="pill ${cls} ${small?'plain':''}" style="${small?'font-size:10.5px':''}">${label}</span>`;
}
function canApprove(p){ return ME===p.approverId || isAdminMe(); }
function blockedLabel(p,t){ const u=upstreamOf(p,t); return u ? u.t : (t.blockedBy||''); }
function fmtMoney(n){ if(n>=1e6) return '$'+(n/1e6).toFixed(n>=1e7?0:1)+'M'; if(n>=1e3) return '$'+Math.round(n/1e3)+'K'; return '$'+Math.round(n); }
function fmtSize(b){ if(b>=1048576) return (b/1048576).toFixed(1)+' MB'; if(b>=1024) return Math.round(b/1024)+' KB'; return b+' B'; }
function parseValue(v){
  if(!v) return 0;
  const s=String(v).replace(/,/g,'');
  const m=s.match(/(\d+(?:\.\d+)?)(?:\s*[–\-]\s*\d+(?:\.\d+)?)?\s*([MK])/i);
  if(!m) return 0;
  return parseFloat(m[1]) * (m[2].toUpperCase()==='M' ? 1e6 : 1e3);
}
function isView(v){ return document.getElementById('view-'+v).classList.contains('active'); }
let toastTimer=null, toastFn=null;
function toast(msg,bad){ showToast(msg,{bad:!!bad}); }
function showToast(msg,opts){
  opts=opts||{};
  const el=document.getElementById('toast');
  el.innerHTML = esc(msg) + (opts.action?` <button class="tundo" onclick="runToastAction()">${esc(opts.action)}</button>`:'');
  toastFn = opts.onAction||null;
  el.className='toast show'+(opts.bad?' bad':'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ el.className='toast'; toastFn=null; }, opts.action?6000:3200);
}
function runToastAction(){ const f=toastFn; toastFn=null; document.getElementById('toast').className='toast'; if(f) f(); }

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
  TEAM = {}; S.members.forEach(m => TEAM[m.id] = {name:m.name, role:m.role, color:m.color, email:m.email, appRole:m.app_role, isApprover:!!m.is_approver});
  OWNER = S.owner; DETAIL = S.detail;
  let n = 0;
  PROJECTS = S.projects.map(p => ({ ...p, owner:S.owner[p.id], _files:[],
    approverId:p.approver||null,
    _approvals: p.approver ? [{action:'submitted', a:S.owner[p.id]||'RM', note:null, w:'Jul 30'}] : [],
    tasks: p.tasks.map(t => ({...t, id:'d'+(++n), completedAt: t.s==='done' && t.due ? t.due+'T12:00:00.000Z' : null})) }));
  TEMPLATES = JSON.parse(JSON.stringify(S.templates||[])).map(t=>({...t, description:t.description||'', defaults:t.defaults||{}}));
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
  HAS_APPR  = (mem.data && mem.data.length) ? ('is_approver' in mem.data[0]) : true;
  HAS_ROLES = (mem.data && mem.data.length) ? ('app_role' in mem.data[0]) : true;
  TEAM = {}; (mem.data||[]).forEach(m => TEAM[m.id] = {name:m.name, role:m.role, color:m.color, email:m.email, appRole:m.app_role, isApprover:!!m.is_approver});
  HAS_RECUR = (tsk.data && tsk.data.length) ? ('recur' in tsk.data[0]) : true;
  HAS_CEDIT = (com.data && com.data.length) ? ('updated_at' in com.data[0]) : true;
  const subBy={}, comBy={}, attBy={}, pfBy={};
  (sub.data||[]).forEach(s => (subBy[s.task_id]=subBy[s.task_id]||[]).push({id:s.id, t:s.title, done:s.done}));
  (com.data||[]).forEach(c => (comBy[c.task_id]=comBy[c.task_id]||[]).push({id:c.id, a:c.author_id, w:fmtWhen(c.created_at), x:c.body, edited:!!c.updated_at}));
  (att.data||[]).forEach(a => {
    const item={id:a.id, label:a.label, sub:a.sublabel, url:a.url, path:a.path, by:a.uploaded_by};
    if(a.task_id) (attBy[a.task_id]=attBy[a.task_id]||[]).push(item);
    else if(a.project_id) (pfBy[a.project_id]=pfBy[a.project_id]||[]).push(item);
  });
  const tBy={};
  (tsk.data||[]).forEach(t => (tBy[t.project_id]=tBy[t.project_id]||[]).push({
    id:t.id, t:t.title, a:t.assignee_id, due:t.due, pr:t.priority, s:t.status, blockedBy:t.blocked_by, blocks:t.blocks,
    bt:t.blocked_by_task||null, completedAt:t.completed_at||null, recur:t.recur||null,
    _desc:t.description||null, _sub:subBy[t.id]||[], _comments:comBy[t.id]||[], _links:attBy[t.id]||[]
  }));
  // notifications table may not exist until db/upgrade-tier1.sql has run — tolerate that
  try {
    const nr = await sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(100);
    NOTIFS = nr.error ? [] : (nr.data||[]).map(n=>({id:n.id, member_id:n.member_id, body:n.body, project_id:n.project_id, task_id:n.task_id, read:n.read, created_at:n.created_at}));
  } catch(_) { NOTIFS = []; }
  // templates table may not exist until db/upgrade-templates.sql has run — tolerate that
  try {
    const tr = await sb.from('templates').select('*').order('created_at');
    TEMPLATES = tr.error ? [] : (tr.data||[]).map(r=>({id:r.id, name:r.name, description:r.description||'', defaults:r.defaults||{}, steps:r.steps||[], by:r.created_by}));
  } catch(_) { TEMPLATES = []; }
  HAS_LDATE = (prj.data && prj.data.length) ? ('launch_date' in prj.data[0]) : true;
  HAS_ARCH  = (prj.data && prj.data.length) ? ('archived' in prj.data[0]) : true;
  // approvals table may not exist until db/upgrade-approvals.sql has run — tolerate that
  let aprBy={};
  try {
    const ar = await sb.from('approvals').select('*').order('created_at');
    if(!ar.error) (ar.data||[]).forEach(a=>(aprBy[a.project_id]=aprBy[a.project_id]||[]).push({id:a.id, action:a.action, a:a.actor_id, note:a.note, w:fmtWhen(a.created_at)}));
  } catch(_) {}
  PROJECTS = (prj.data||[]).map(p => ({
    id:p.id, name:p.name, desc:p.description, segment:p.segment, motion:p.motion, solution:p.solution,
    pipeline:p.pipeline, value:p.value, audience:p.audience, launch:p.launch, launchDate:p.launch_date||null, status:p.status,
    blocker:p.blocker, owner:p.owner_id, approverId:p.approver_id||null, _approvals:aprBy[p.id]||[],
    archived:!!p.archived, tasks:tBy[p.id]||[], _files:pfBy[p.id]||[]
  }));
}

/* ===================================================================
   PERSISTENCE (live only)
   =================================================================== */
function friendlyDbError(error){
  const msg=String((error && error.message)||'');
  if(/row-level security|violates row-level/i.test(msg)){
    if(!ME) return "Your sign-in isn't linked to a team member — ask an admin to add your email on the Team screen.";
    if(!isAdminMe()) return "You don't have permission for that. Admins manage campaigns; you can edit tasks assigned to you.";
    return "The database refused that change. If you were just made an admin, sign out and back in to refresh your access.";
  }
  if(/needs approval before it can be set to Active/i.test(msg)) return 'This campaign needs approval before it can go Active.';
  return 'Save failed: '+msg;
}
async function pUpdate(table,id,fields){ const {error}=await sb.from(table).update(fields).eq('id',id); if(error) toast(friendlyDbError(error),true); }
async function pInsert(table,row){ const {data,error}=await sb.from(table).insert(row).select().single(); if(error){ toast(friendlyDbError(error),true); return null; } return data; }

/* ===================================================================
   RENDER — Dashboard
   =================================================================== */
function renderDashboard(){
  const vis = visibleProjects();
  const active = vis.filter(p=>p.status==='active');
  document.getElementById('kpi-active').textContent = active.length;
  document.getElementById('kpi-active-foot').textContent = `of ${vis.length} total campaigns`;
  document.getElementById('kpi-rb').textContent = vis.flatMap(p=>p.tasks).filter(t=>t.s==='blocked').length;
  document.getElementById('kpi-done').textContent = vis.filter(p=>p.status==='complete').length;
  document.getElementById('kpi-pipeline').textContent = fmtMoney(active.reduce((s,p)=>s+parseValue(p.value),0));

  // open work by status (non-complete campaigns)
  const openTasks = vis.filter(p=>p.status!=='complete').flatMap(p=>p.tasks);
  const sbCounts = {}; ORDER.forEach(s=>sbCounts[s]=0);
  openTasks.forEach(t=>{ if(sbCounts[t.s]!=null) sbCounts[t.s]++; });
  const sbMax = Math.max(...Object.values(sbCounts),1);
  document.getElementById('sb-total').textContent = `${openTasks.length} tasks`;
  document.getElementById('status-breakdown').innerHTML = ORDER.map(s=>
    `<div class="sb-row"><span class="sb-name"><span class="dot" style="background:${STATUS[s].dot}"></span>${STATUS[s].label}</span><div class="sb-track"><span style="width:${Math.round(sbCounts[s]/sbMax*100)}%;background:${STATUS[s].dot}"></span></div><span class="num" style="width:24px;text-align:right;font-weight:700;font-size:12.5px">${sbCounts[s]}</span></div>`
  ).join('');

  document.getElementById('dash-active').innerHTML = active.map(p=>{
    const pr=progress(p), st=STATUS_PILL[projStatus(p)];
    return `<tr class="clickable" onclick="openProject('${p.id}')"><td class="proj-name">${esc(p.name)}</td><td>${av(ownerOf(p))}</td><td><span class="motion ${p.motion}">${esc(p.motion)}</span></td><td><div style="display:flex;align-items:center;gap:9px"><div class="bar"><span style="width:${pr.pct}%"></span></div><span class="num" style="font-size:12px;color:var(--ink-3)">${pr.pct}%</span></div></td><td class="num">${esc((p.launch||'').split('·')[0].trim())}</td><td><div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start"><span class="pill ${st[0]}">${st[1]}</span>${apprChip(p,true)}</div></td></tr>`;
  }).join('') || `<tr><td colspan="6" style="color:var(--ink-3)">No active campaigns.</td></tr>`;

  const counts={}; Object.keys(TEAM).forEach(k=>counts[k]=0);
  vis.forEach(p=>p.tasks.forEach(t=>{ if(t.s!=='done' && counts[t.a]!=null) counts[t.a]++; }));
  const max=Math.max(...Object.values(counts),1);
  document.getElementById('workload').innerHTML = Object.keys(TEAM).map(k=>{
    const c=counts[k]||0, w=Math.round(c/max*100), col=c>=7?'var(--crit)':c>=5?'var(--warn)':'var(--accent)';
    return `<div class="wl-row">${av(k)}<div style="width:120px;font-weight:600">${esc(TEAM[k].name)}</div><div class="wl-bar"><span style="width:${w}%;background:${col}"></span></div><span class="num" style="width:26px;text-align:right;font-weight:700">${c}</span></div>`;
  }).join('');

  const soon=new Date(TODAY); soon.setDate(soon.getDate()-3);
  const up = vis.flatMap(p=>p.tasks.filter(t=>t.due&&t.s!=='done').map(t=>({t,p}))).filter(x=>new Date(x.t.due+'T00:00:00')>=soon).sort((a,b)=>a.t.due<b.t.due?-1:1).slice(0,5);
  document.getElementById('deadlines').innerHTML = up.map(({t,p})=>{ const d=new Date(t.due+'T00:00:00'), over=d<TODAY; return `<div class="dl-row"><div class="dl-date"><div class="d num" style="${over?'color:var(--crit)':''}">${String(d.getDate()).padStart(2,'0')}</div><div class="m">${MONTHS[d.getMonth()]}</div></div><div class="dl-main"><div class="t">${esc(t.t)}</div><div class="s">${esc(p.name)} · ${esc(teamName(t.a))}</div></div><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>`; }).join('') || `<div style="padding:14px 18px;color:var(--ink-3);font-size:12.5px">Nothing due soon.</div>`;

  document.getElementById('completed-list').innerHTML = vis.filter(p=>p.status==='complete').map(p=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--good)" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg><div style="flex:1"><div style="font-weight:600">${esc(p.name)}</div><div style="font-size:11.5px;color:var(--ink-3)">${esc(teamName(ownerOf(p)))} · ${esc(p.value)}</div></div></div>`).join('') || `<div style="color:var(--ink-3);font-size:12.5px">None yet.</div>`;
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
  const list = (filter==='archived' ? PROJECTS.filter(p=>p.archived)
      : visibleProjects().filter(p=> filter==='all'?true : filter==='active'?p.status==='active' : filter==='planning'?(p.status==='planning'||p.status==='review') : p.status==='complete'))
    .filter(p=>!FILT.proj.motion || p.motion===FILT.proj.motion)
    .filter(p=>!FILT.proj.owner || ownerOf(p)===FILT.proj.owner)
    .filter(p=>!FILT.proj.segment || p.segment===FILT.proj.segment);
  document.getElementById('proj-grid').innerHTML = list.map(p=>{
    const pr=progress(p), stKey=projStatus(p), st=STATUS_PILL[stKey];
    return `<div class="pcard t-${stKey}" onclick="openProject('${p.id}')">
      <div class="ph"><div style="flex:1"><div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.desc)}</div></div><span class="pill ${st[0]}">${st[1]}</span></div>
      <div class="ptags"><span class="motion ${p.motion}">${esc(p.motion)}</span><span class="tag">${esc(p.segment)}</span>${apprChip(p)}</div>
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
      <div><div class="trow-title" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}${t.recur?' <span title="Repeats — completing creates the next occurrence">🔁</span>':''}</div>${(t.bt||t.blockedBy)?`<div class="trow-sub">⛔ Waiting on: ${esc(blockedLabel(p,t))}</div>`:t.blocks?`<div class="trow-sub" style="color:var(--warn)">↗ Blocks ${esc(t.blocks)}</div>`:''}</div>
      <div>${editable?`<button class="assignee" onclick="openAssign(event,'${p.id}',${i})">${av(t.a)}${esc(teamName(t.a))}<span class="car">▾</span></button>`:`<span class="assignee" style="cursor:default">${av(t.a)}${esc(teamName(t.a))}</span>`}</div>
      <div class="col-due num t-due ${t.due&&new Date(t.due+'T00:00:00')<TODAY&&t.s!=='done'?'over':''}" style="font-size:12.5px;color:var(--ink-2)">${fmtDue(t.due)}</div>
      <div class="col-prio"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div>
      <div><select class="status-sel" ${editable?'':'disabled'} onchange="setStatus('${p.id}',${i},this.value)">${ORDER.map(s=>`<option value="${s}" ${t.s===s?'selected':''}>${STATUS[s].label}</option>`).join('')}</select></div>
    </div>`;}).join('');

  document.getElementById('project-detail').innerHTML = `
    <div class="pd-head">
      <div style="flex:1"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="pd-title">${esc(p.name)}</span><span class="pill ${st[0]}">${st[1]}</span>${isAdminMe()?`<button class="btn sm" onclick="openCampaignModal('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>Edit</button>`:''}<button class="btn sm" onclick="exportCampaign('${p.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>${isAdminMe()?`<button class="btn sm" onclick="saveAsTemplate('${p.id}')" title="Turn this campaign's task list into a reusable template"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Save as template</button><button class="btn sm" onclick="archiveCampaign('${p.id}',${p.archived?'false':'true'})" title="${p.archived?'Restore to active lists':'Hide from lists — nothing is deleted'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>${p.archived?'Unarchive':'Archive'}</button>`:''}</div><div class="pd-desc">${esc(p.desc)}</div></div>
      <div class="pd-owner"><div class="lbl">Owner</div><span class="chip-person" style="font-size:13.5px">${av(owner)}${esc(teamName(owner))}</span></div>
    </div>
    <div class="metastrip">
      ${[['Segment',p.segment],['Solution',p.solution],['Pipeline',p.pipeline],['Audience',p.audience]].map(([l,v])=>`<div class="meta-item"><div class="ml">${l}</div><div class="mv">${esc(v)||'—'}</div></div>`).join('')}
      <div class="meta-item"><div class="ml">Motion</div><div class="mv"><span class="motion ${p.motion}">${esc(p.motion)}</span></div></div>
      <div class="meta-item"><div class="ml">Est. Value</div><div class="mv" style="color:var(--good)">${esc(p.value)||'—'}</div></div>
      <div class="meta-item"><div class="ml">Launch</div><div class="mv">${esc(p.launch)||'—'}</div></div>
    </div>
    ${p.archived?`<div class="banner info"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg><span><b>Archived.</b> This campaign is hidden from lists and reports — nothing was deleted. Find it under Campaigns → Archived.</span></div>`:''}
    ${p.blocker?`<div class="pd-blocker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span><b>Blocker:</b> ${esc(p.blocker)}</span></div>`:''}
    ${(function(){
      const st=approvalState(p); if(!st) return '';
      const last=(p._approvals||[])[p._approvals.length-1]||{};
      const cls = st==='approved'?'info':st==='changes'?'crit':'warn';
      const label = st==='pending' ? `Waiting on <b style="margin:0 4px">${esc(teamName(p.approverId))}</b> to approve this campaign.`
                  : st==='approved' ? `Approved by <b style="margin:0 4px">${esc(teamName(last.a))}</b> ${esc(last.w||'')}.`
                  : `<b style="margin-right:4px">${esc(teamName(last.a))}</b> requested changes${last.note?`: “${esc(last.note)}”`:''}`;
      const btns = (st==='pending'&&canApprove(p)) ? `<button class="btn primary sm" onclick="approveCampaign('${p.id}')">✓ Approve</button><button class="btn sm" onclick="requestCampaignChanges('${p.id}')">Request changes</button>`
                 : (st==='changes'&&isAdminMe()) ? `<button class="btn primary sm" onclick="resubmitCampaign('${p.id}')">Resubmit for approval</button>` : '';
      const hist=(p._approvals||[]).slice(-4).map(ev=>`${esc(teamName(ev.a))} ${ev.action==='submitted'?'submitted':ev.action==='approved'?'approved':'requested changes'}${ev.w?' · '+esc(ev.w):''}`).join('  →  ');
      return `<div class="banner ${cls}" style="align-items:flex-start;flex-wrap:wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-top:2px"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        <div style="flex:1;min-width:220px"><div>${label}</div>${hist?`<div style="font-size:11.5px;opacity:.75;margin-top:4px">${hist}</div>`:''}</div>
        <div style="display:flex;gap:8px">${btns}</div>
      </div>`;
    })()}
    <div class="tasks-head"><h3>Files</h3><span class="tg-count num">${(p._files||[]).length}</span><button class="btn sm" style="margin-left:auto" onclick="pickFile('${p.id}',null)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>Attach file</button></div>
    <div style="margin-bottom:18px">
      ${(p._files||[]).length ? p._files.map((l,fi)=>`<div class="att" style="cursor:pointer" onclick="openPFile('${p.id}',${fi})"><span class="ai"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span style="flex:1;min-width:0"><div class="al">${esc(l.label)}</div><div class="as">${esc(l.sub||'')}</div></span>${(isAdminMe()||l.by===ME)?`<button class="icon-btn" style="width:28px;height:28px" title="Remove" onclick="event.stopPropagation();delPFile('${p.id}',${fi})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`:''}</div>`).join('') : '<div class="att-empty">No files yet — attach briefs, creative, or lists for this campaign.</div>'}
    </div>
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
async function setStatus(id,i,v){
  const p=byId(id), t=p.tasks[i], was=t.s;
  if(!canEdit(t)){ denyEdit(); rerender(); return; }
  if(was===v) return;
  t.s=v;
  const fields={status:v};
  if(v==='done' && was!=='done'){ t.completedAt=new Date().toISOString(); fields.completed_at=t.completedAt; }
  if(was==='done' && v!=='done'){ t.completedAt=null; fields.completed_at=null; }
  if(LIVE) pUpdate('tasks',t.id,fields);
  if(v==='done') autoUnblock(p,t);
  // recurring: completing rolls the task forward to its next occurrence
  let spawned=null; const hadRecur=t.recur;
  if(v==='done' && was!=='done' && t.recur && HAS_RECUR){ spawned=await spawnRecurrence(p,t); }
  rerender();
  if(v==='done' && was!=='done'){
    showToast(spawned?`Completed "${t.t}" — next occurrence due ${fmtDue(spawned.due)}`:`Completed "${t.t}"`, { action:'Undo', onAction:async()=>{
      const p2=byId(id); if(!p2) return;
      if(spawned){
        const si=p2.tasks.indexOf(spawned);
        if(si>-1){ p2.tasks.splice(si,1); if(LIVE&&spawned.id){ try{ await sb.from('tasks').delete().eq('id',spawned.id); }catch(_){} } }
        t.recur=hadRecur; if(LIVE) pUpdate('tasks',t.id,{recur:hadRecur});
      }
      const idx=p2.tasks.indexOf(t); if(idx>-1) setStatus(id, idx, was);
    }});
  }
}
function nextRecurDue(due,recur){
  const base=due||todayISO();
  if(recur==='weekly') return addDaysISO(base,7);
  if(recur==='biweekly') return addDaysISO(base,14);
  const d=new Date(base+'T00:00:00'); d.setMonth(d.getMonth()+1);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
async function spawnRecurrence(p,t){
  const due=nextRecurDue(t.due,t.recur), recur=t.recur;
  t.recur=null; if(LIVE) pUpdate('tasks',t.id,{recur:null}); // the recurrence moves to the new occurrence
  let nt;
  if(LIVE){
    const d=await pInsert('tasks',{project_id:p.id, title:t.t, assignee_id:t.a, due, priority:t.pr, status:'todo', recur, description:t._desc||null, position:p.tasks.length});
    if(!d){ t.recur=recur; return null; }
    nt={id:d.id, t:t.t, a:t.a, due, pr:t.pr, s:'todo', recur, _desc:t._desc, _sub:[], _comments:[], _links:[]};
    const subs=(t._sub||[]).map((s,si)=>({task_id:d.id, title:s.t, done:false, position:si}));
    if(subs.length){ try{ const {data}=await sb.from('subtasks').insert(subs).select(); (data||[]).forEach(r=>nt._sub.push({id:r.id, t:r.title, done:false})); }catch(_){} }
  } else {
    nt={id:'d'+(++demoSeq)+'r', t:t.t, a:t.a, due, pr:t.pr, s:'todo', recur, _desc:t._desc, _sub:(t._sub||[]).map(s=>({t:s.t, done:false})), _comments:[], _links:[]};
  }
  p.tasks.push(nt);
  return nt;
}
function cycleDone(id,i){ const t=byId(id).tasks[i]; setStatus(id,i, t.s==='done'?'todo':'done'); }
function setTaskField(pid,i,field,val){
  const t=byId(pid).tasks[i];
  if(!canEdit(t)){ denyEdit(); rerender(); return; }
  if(field==='due'){ t.due=val||null; if(LIVE) pUpdate('tasks',t.id,{due:t.due}); }
  if(field==='pr'){ t.pr=val; if(LIVE) pUpdate('tasks',t.id,{priority:val}); }
  if(field==='recur'){ t.recur=val||null; if(LIVE&&HAS_RECUR) pUpdate('tasks',t.id,{recur:t.recur}); }
  rerender();
}
async function deleteTask(pid,i){
  const p=byId(pid), t=p.tasks[i];
  if(!(isAdminMe()||t.a===ME)){ toast('Only the assignee or an admin can delete this task', true); return; }
  if(!confirm(`Delete "${t.t}"? Its subtasks, comments and files go with it.`)) return;
  if(LIVE){
    const paths=(t._links||[]).filter(l=>l.path).map(l=>l.path);
    const {error}=await sb.from('tasks').delete().eq('id',t.id);
    if(error){ toast('Delete failed: '+error.message, true); return; }
    if(paths.length){ try{ sb.storage.from('pmpm-files').remove(paths); }catch(_){} }
  }
  p.tasks.forEach(x=>{ if(x.bt===t.id){ x.bt=null; if(x.s==='blocked'){ x.s='todo'; } if(LIVE) pUpdate('tasks',x.id,{blocked_by_task:null,status:x.s}); }});
  p.tasks.splice(i,1);
  closeDrawer(); rerender();
  toast('Task deleted');
}
async function delSubtask(pid,i,si){
  const t=byId(pid).tasks[i];
  if(!canEdit(t)){ denyEdit(); return; }
  const s=t._sub[si];
  if(LIVE && s.id){ const {error}=await sb.from('subtasks').delete().eq('id',s.id); if(error){ toast('Delete failed: '+error.message, true); return; } }
  t._sub.splice(si,1);
  renderDrawer(pid,i);
}
async function delComment(pid,i,ci){
  const t=byId(pid).tasks[i], c=t._comments[ci];
  if(!(c.a===ME||isAdminMe())){ toast('You can only delete your own comments', true); return; }
  if(LIVE && c.id){ const {error}=await sb.from('comments').delete().eq('id',c.id); if(error){ toast('Delete failed: '+error.message, true); return; } }
  t._comments.splice(ci,1);
  renderDrawer(pid,i);
}
function toggleDrawerEdit(on){ drawerEdit=on; if(currentTask) renderDrawer(currentTask.pid,currentTask.i); }
async function saveDrawerEdit(pid,i){
  const t=byId(pid).tasks[i];
  if(!canEdit(t)){ denyEdit(); return; }
  const title=document.getElementById('ed-title').value.trim();
  const desc=document.getElementById('ed-desc').value.trim();
  if(!title){ toast('The task needs a title', true); return; }
  t.t=title; t._desc=desc;
  if(LIVE) pUpdate('tasks',t.id,{title, description:desc});
  drawerEdit=false;
  rerender();
  toast('Task updated');
}
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
function rerender(){
  if(currentProject && isView('project')) renderProjectDetail();
  if(isView('dashboard')) renderDashboard();
  if(isView('mytasks')) renderMyTasks();
  if(isView('board')) renderBoard();
  if(isView('projects')) renderProjects(currentFilter);
  if(isView('calendar')) renderCalendar();
  if(isView('timeline')) renderTimeline();
  if(isView('reports')) renderReports();
  if(currentTask) renderDrawer(currentTask.pid,currentTask.i);
  refreshCounts();
}

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
  const dueSoon = visibleProjects().flatMap(p=>p.tasks.map((t,i)=>({t,p,i})))
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
function openTask(id,i){ const p=byId(id),t=p.tasks[i]; ensureDetail(p,t); drawerEdit=false; editingComment=null; currentTask={pid:id,i,taskId:t.id}; renderDrawer(id,i); document.getElementById('drawer').classList.add('open'); document.getElementById('drawer-ov').classList.add('open'); }
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
      <div style="flex:1;min-width:0"><button class="d-proj" onclick="closeDrawer();openProject('${p.id}')">${esc(p.name)} ↗</button>${drawerEdit?`<input id="ed-title" value="${esc(t.t)}" />`:`<div class="d-title">${esc(t.t)}</div>`}</div>
      ${canEdit(t)&&!drawerEdit?`<button class="icon-btn" onclick="toggleDrawerEdit(true)" title="Edit title & description"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>`:''}
      <button class="icon-btn" onclick="closeDrawer()" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="drawer-body">
      <div class="d-fields">
        <span class="fl">Assignee</span><span>${canEdit(t)?`<button class="assignee" onclick="openAssign(event,'${p.id}',${i})">${av(t.a)}${esc(teamName(t.a))}<span class="car">▾</span></button>`:`<span class="assignee" style="cursor:default">${av(t.a)}${esc(teamName(t.a))}</span>`}</span>
        <span class="fl">Status</span><span><select class="status-sel" ${canEdit(t)?'':'disabled'} onchange="setStatus('${p.id}',${i},this.value)">${ORDER.map(s=>`<option value="${s}" ${t.s===s?'selected':''}>${STATUS[s].label}</option>`).join('')}</select></span>
        <span class="fl">Due date</span><span>${canEdit(t)?`<input type="date" class="status-sel" value="${t.due||''}" onchange="setTaskField('${p.id}',${i},'due',this.value)" />${over?` <span class="t-due over" style="font-size:11px;font-weight:700">Overdue</span>`:''}`:`<span class="num t-due ${over?'over':''}" style="font-weight:600">${over?'Overdue · ':''}${fmtDue(t.due)}</span>`}</span>
        <span class="fl">Priority</span><span>${canEdit(t)?`<select class="status-sel" onchange="setTaskField('${p.id}',${i},'pr',this.value)"><option value="high" ${t.pr==='high'?'selected':''}>High</option><option value="med" ${t.pr==='med'?'selected':''}>Medium</option><option value="low" ${t.pr==='low'?'selected':''}>Low</option></select>`:`<span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span>`}</span>
        ${HAS_RECUR?`<span class="fl">Repeats</span><span>${canEdit(t)?`<select class="status-sel" onchange="setTaskField('${p.id}',${i},'recur',this.value)"><option value="">Never</option><option value="weekly" ${t.recur==='weekly'?'selected':''}>Weekly</option><option value="biweekly" ${t.recur==='biweekly'?'selected':''}>Every 2 weeks</option><option value="monthly" ${t.recur==='monthly'?'selected':''}>Monthly</option></select>`:`<span style="font-size:12.5px;font-weight:600;color:var(--ink-2)">${t.recur?{weekly:'Weekly',biweekly:'Every 2 weeks',monthly:'Monthly'}[t.recur]:'—'}</span>`}${t.recur?' <span title="Completing this creates the next occurrence automatically">🔁</span>':''}</span>`:''}
        <span class="fl">Blocked by</span><span><select class="status-sel" style="max-width:100%" ${canEdit(t)?'':'disabled'} onchange="setBlockedBy('${p.id}',${i},this.value)">
          <option value="">— nothing —</option>
          ${p.tasks.filter(x=>x.id!==t.id && x.s!=='done').map(x=>`<option value="${x.id}" ${t.bt===x.id?'selected':''}>${esc(x.t)}</option>`).join('')}
        </select></span>
      </div>
      ${t.bt?(function(){ const u=upstreamOf(p,t); return u?`<div class="d-blocker2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg><span>Waiting on: <b>${esc(u.t)}</b> (${STATUS[u.s].label}, ${esc(teamName(u.a))}). Unblocks automatically when it's completed.</span></div>`:''; })():t.blockedBy?`<div class="d-blocker2"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg><span>Waiting on: ${esc(t.blockedBy)} (external input)</span></div>`:''}
      ${t.blocks?`<div class="d-blocker2" style="background:var(--warn-soft);border-color:color-mix(in srgb,var(--warn) 30%,transparent);color:var(--warn)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg><span>This task blocks ${esc(t.blocks)}.</span></div>`:''}
      <div class="d-sec">Description</div>
      ${drawerEdit?`<textarea id="ed-desc">${esc(t._desc||'')}</textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px"><button class="btn sm" onclick="toggleDrawerEdit(false)">Cancel</button><button class="btn primary sm" onclick="saveDrawerEdit('${p.id}',${i})">Save changes</button></div>`
      :`<div class="d-desc">${esc(t._desc)}</div>`}
      <div class="d-sec">Subtasks <span class="cnt">${subDone}/${t._sub.length}</span><div class="prog-mini" style="margin-left:auto"><span style="width:${subPct}%"></span></div></div>
      ${t._sub.map((s,si)=>`<div class="subrow ${s.done?'done':''}"><button class="check" style="${s.done?'background:var(--good);border-color:var(--good)':''}" onclick="toggleSub('${p.id}',${i},${si})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="opacity:${s.done?1:0}"><path d="M20 6L9 17l-5-5"/></svg></button><span class="sub-t" style="flex:1;min-width:0">${esc(s.t)}</span>${canEdit(t)&&(!LIVE||s.id)?`<button class="mini-del" title="Delete subtask" onclick="delSubtask('${p.id}',${i},${si})">✕</button>`:''}</div>`).join('')}
      ${canEdit(t)?`<form class="subadd" onsubmit="addSub(event,'${p.id}',${i})"><input id="newsub" placeholder="Add a subtask…" /><button class="btn sm" type="submit">Add</button></form>`:''}
      <div class="d-sec">Attachments</div>
      ${t._links.length? t._links.map((l,ai)=>`<div class="att" style="cursor:pointer" onclick="openAtt('${p.id}',${i},${ai})"><span class="ai"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span><span style="flex:1;min-width:0"><div class="al">${esc(l.label)}</div><div class="as">${esc(l.sub||'')}</div></span>${(canEdit(t)||l.by===ME)?`<button class="icon-btn" style="width:28px;height:28px" title="Remove" onclick="event.stopPropagation();delAtt('${p.id}',${i},${ai})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`:''}</div>`).join('') : '<div class="att-empty">No files yet.</div>'}
      ${canEdit(t)?`<button class="btn sm" style="margin-top:8px" onclick="pickFile('${p.id}',{i:${i}})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>Attach file</button>`:''}
      <div class="d-sec">Activity</div>
      ${t._comments.map((c,ci)=> editingComment===ci
        ? `<div class="activity">${av(c.a)}<div class="aline" style="min-width:0"><textarea id="ec-body" style="width:100%;min-height:56px;border:1px solid var(--line-strong);border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit;background:var(--surface);color:var(--ink);resize:vertical">${esc(c.x)}</textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px"><button class="btn sm" onclick="editingComment=null;renderDrawer('${p.id}',${i})">Cancel</button><button class="btn primary sm" onclick="saveComment('${p.id}',${i},${ci})">Save</button></div></div></div>`
        : `<div class="activity">${av(c.a)}<div class="aline" style="min-width:0"><span class="an">${esc(teamName(c.a))}</span> ${decorateMentions(esc(c.x))}<div class="aw">${esc(c.w)}${c.edited?' · edited':''}</div></div>${(c.a===ME||isAdminMe())&&(!LIVE||c.id)?`${(!LIVE||HAS_CEDIT)&&c.a===ME?`<button class="mini-del" title="Edit comment" onclick="editingComment=${ci};renderDrawer('${p.id}',${i})">✎</button>`:''}<button class="mini-del" title="Delete comment" onclick="delComment('${p.id}',${i},${ci})">✕</button>`:''}</div>`
      ).join('') || '<div class="att-empty">No activity yet.</div>'}
      <form class="commentbox" onsubmit="addComment(event,'${p.id}',${i})">${av(ME)}<textarea id="newcomment" placeholder="Write a comment… use @ to mention a teammate" oninput="mentionInput(event)"></textarea><button class="btn primary sm" type="submit">Post</button></form>
      ${(isAdminMe()||t.a===ME)?`<button class="del-task" onclick="deleteTask('${p.id}',${i})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>Delete this task</button>`:''}
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
  if(!ME){ toast("Your sign-in isn't linked to a team member yet — ask an admin to add your email on the Team screen.", true); return; }
  const t=byId(id).tasks[i];
  if(LIVE){ const d=await pInsert('comments',{task_id:t.id,author_id:ME,body:v}); if(d) t._comments.push({id:d.id,a:d.author_id,w:fmtWhen(d.created_at),x:d.body}); }
  else t._comments.push({a:ME,w:'Just now',x:v});
  parseMentions(v).forEach(k=>notify(k, `${teamName(ME)} mentioned you on "${t.t}": ${v.slice(0,90)}`, id, t.id));
  renderDrawer(id,i);
}
async function saveComment(pid,i,ci){
  const t=byId(pid).tasks[i], c=t._comments[ci];
  if(!(c.a===ME||isAdminMe())){ toast('You can only edit your own comments', true); return; }
  const v=document.getElementById('ec-body').value.trim(); if(!v) return;
  const isNew = !parseMentions(c.x).length ? parseMentions(v) : parseMentions(v).filter(k=>!parseMentions(c.x).includes(k));
  c.x=v; c.edited=true;
  if(LIVE && c.id && HAS_CEDIT){ const {error}=await sb.from('comments').update({body:v, updated_at:new Date().toISOString()}).eq('id',c.id); if(error) toast('Save failed: '+error.message, true); }
  isNew.forEach(k=>notify(k, `${teamName(ME)} mentioned you on "${t.t}": ${v.slice(0,90)}`, pid, t.id));
  editingComment=null;
  renderDrawer(pid,i);
}

/* ---------- @mentions ---------- */
let mmenuTarget=null;
function mentionInput(e){
  const ta=e.target, pos=ta.selectionStart;
  const upto=ta.value.slice(0,pos), m=upto.match(/@(\w*)$/);
  const menu=document.getElementById('mmenu');
  if(!m){ menu.classList.remove('open'); mmenuTarget=null; return; }
  const q=m[1].toLowerCase();
  const hits=Object.keys(TEAM).filter(k=>k!==ME && (TEAM[k].name.toLowerCase().includes(q) || k.toLowerCase().startsWith(q)));
  if(!hits.length){ menu.classList.remove('open'); mmenuTarget=null; return; }
  mmenuTarget={ta, start:pos-m[0].length, end:pos};
  menu.innerHTML=`<div class="ah">Mention</div>`+hits.map(k=>`<button type="button" onmousedown="event.preventDefault();insertMention('${k}')">${av(k)}<span>${esc(TEAM[k].name)}</span></button>`).join('');
  const r=ta.getBoundingClientRect();
  menu.style.left=Math.min(r.left, window.innerWidth-220)+'px';
  menu.style.top=Math.max(8, r.top-(hits.length*38+34))+'px';
  menu.classList.add('open');
}
function insertMention(k){
  if(!mmenuTarget) return;
  const {ta,start,end}=mmenuTarget;
  const mention='@'+TEAM[k].name+' ';
  ta.value=ta.value.slice(0,start)+mention+ta.value.slice(end);
  ta.focus(); const np=start+mention.length; ta.setSelectionRange(np,np);
  document.getElementById('mmenu').classList.remove('open'); mmenuTarget=null;
}
function parseMentions(text){ return Object.keys(TEAM).filter(k=>text.includes('@'+TEAM[k].name)); }
function decorateMentions(escaped){
  Object.keys(TEAM).forEach(k=>{ const m=esc('@'+TEAM[k].name); escaped=escaped.split(m).join(`<span class="mention">${m}</span>`); });
  return escaped;
}
document.addEventListener('click',e=>{ const mm=document.getElementById('mmenu'); if(mm && !mm.contains(e.target) && e.target.id!=='newcomment') mm.classList.remove('open'); });

/* ===================================================================
   Campaign approvals
   =================================================================== */
async function recordApproval(pid, action, note){
  const p=byId(pid);
  const ev={action, a:ME, note:note||null, w:'Just now'};
  if(LIVE && HAS_APPR){
    const {data,error}=await sb.from('approvals').insert({project_id:pid, actor_id:ME, action, note:note||null}).select().single();
    if(error){ toast('Approval action failed: '+error.message, true); return false; }
    ev.id=data.id; ev.w=fmtWhen(data.created_at);
  }
  (p._approvals=p._approvals||[]).push(ev);
  return true;
}
async function approveCampaign(pid){
  const p=byId(pid);
  if(!canApprove(p)){ toast('Only the designated approver (or an admin) can approve this', true); return; }
  if(await recordApproval(pid,'approved')){
    notify(ownerOf(p), `"${p.name}" was approved by ${teamName(ME)}.`, pid, null);
    toast('Campaign approved'); rerenderApproval(pid);
  }
}
async function requestCampaignChanges(pid){
  const p=byId(pid);
  if(!canApprove(p)){ toast('Only the designated approver (or an admin) can do that', true); return; }
  const note=(prompt('What needs to change before this can be approved?')||'').trim();
  if(!note) return;
  if(await recordApproval(pid,'changes',note)){
    notify(ownerOf(p), `${teamName(ME)} requested changes on "${p.name}": ${note}`, pid, null);
    toast('Changes requested'); rerenderApproval(pid);
  }
}
async function resubmitCampaign(pid){
  const p=byId(pid);
  if(!isAdminMe()){ toast('Admins only', true); return; }
  if(await recordApproval(pid,'submitted')){
    notify(p.approverId, `"${p.name}" was resubmitted for your approval.`, pid, null);
    toast('Resubmitted for approval'); rerenderApproval(pid);
  }
}
function rerenderApproval(pid){ if(isView('project') && currentProject===pid) renderProjectDetail(); else show(currentView); }

/* ===================================================================
   Campaign templates — instantiate / manage / save-as
   =================================================================== */
async function instantiateTemplate(tpl, projectId, ldateStr, roleMap){
  const p=byId(projectId); if(!p) return;
  const base = ldateStr ? new Date(ldateStr+'T00:00:00') : null;
  const pad=n=>String(n).padStart(2,'0');
  const dueFor = off => { if(off==null || off==='' || !base) return null; const d=new Date(base); d.setDate(d.getDate()+Number(off)); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
  const created=[];
  for(const [ix,st] of tpl.steps.entries()){
    const a = roleMap[st.role] || roleDefault(st.role);
    const due = dueFor(st.off);
    const s = (st.dep!=null && st.dep!=='') ? 'blocked' : 'todo';
    let task;
    if(LIVE){
      const d=await pInsert('tasks',{project_id:projectId, title:st.t, assignee_id:a, due, priority:st.pr||'med', status:s, position:ix});
      if(!d) return;
      task={id:d.id, t:st.t, a, due, pr:st.pr||'med', s, _sub:[], _comments:[], _links:[]};
      if(st.sub && st.sub.length){
        const {data}=await sb.from('subtasks').insert(st.sub.map((x,si)=>({task_id:d.id, title:x, done:false, position:si}))).select();
        (data||[]).forEach(r=>task._sub.push({id:r.id, t:r.title, done:false}));
      }
    } else {
      task={id:'d'+(++demoSeq)+'s'+ix, t:st.t, a, due, pr:st.pr||'med', s, _sub:(st.sub||[]).map(x=>({t:x,done:false})), _comments:[], _links:[]};
    }
    p.tasks.push(task); created.push(task);
  }
  for(const [ix,st] of tpl.steps.entries()){
    if(st.dep!=null && st.dep!=='' && created[st.dep]){
      created[ix].bt = created[st.dep].id;
      if(LIVE) await pUpdate('tasks', created[ix].id, {blocked_by_task:created[st.dep].id});
    }
  }
}

function renderTemplates(){
  document.getElementById('tpl-grid').innerHTML = TEMPLATES.length ? TEMPLATES.map(t=>{
    const withDue=t.steps.filter(s=>s.off!=null&&s.off!=='').length, deps=t.steps.filter(s=>s.dep!=null&&s.dep!=='').length;
    return `<div class="pcard" style="cursor:default">
      <div class="ph"><div style="flex:1"><div class="pn">${esc(t.name)}</div><div class="pd">${esc(t.description||'')}</div></div>${(t.defaults&&t.defaults.motion)?`<span class="motion ${t.defaults.motion}">${esc(t.defaults.motion)}</span>`:''}</div>
      <div class="tpl-steps-preview">${t.steps.slice(0,4).map((s,i)=>`${i+1}. ${esc(s.t)}`).join('<br>')}${t.steps.length>4?`<br>… +${t.steps.length-4} more`:''}</div>
      <div class="prow"><span>${t.steps.length} steps · ${withDue} dated · ${deps} dependencies</span></div>
      <div class="prow" style="gap:8px;justify-content:flex-end">
        <button class="btn primary sm" onclick="useTemplate('${t.id}')">Use</button>
        <button class="btn sm" onclick="openTplEditor('${t.id}')">Edit</button>
        <button class="btn sm" onclick="deleteTemplate('${t.id}')">Delete</button>
      </div>
    </div>`;
  }).join('') : `<div class="card" style="grid-column:1/-1;padding:22px;text-align:center">
      <div style="font-weight:650;margin-bottom:6px">No templates yet</div>
      <div class="page-sub" style="margin-bottom:14px">Load the four starter playbooks (Email Series, Promo, ABM, Event) or build one from scratch.</div>
      <button class="btn primary sm" onclick="importStarters()">Import starter templates</button>
    </div>`;
}
async function importStarters(){
  if(!isAdminMe()){ toast('Admins only', true); return; }
  const S=window.PMPM_SEED;
  for(const t of (S.templates||[])){
    if(TEMPLATES.some(x=>x.name===t.name)) continue;
    if(LIVE){ const d=await pInsert('templates',{name:t.name, description:t.description, defaults:t.defaults||{}, steps:t.steps, created_by:ME}); if(d) TEMPLATES.push({id:d.id, name:d.name, description:d.description, defaults:d.defaults, steps:d.steps, by:ME}); }
    else TEMPLATES.push(JSON.parse(JSON.stringify(t)));
  }
  renderTemplates(); toast('Starter templates imported');
}
function useTemplate(id){ openCampaignModal(null); document.getElementById('cm-template').value=String(id); applyTemplateChoice(); }

/* ---------- Template editor ---------- */
function roleSlots(){ return [...new Set(Object.values(TEAM).map(m=>m.role).filter(Boolean))]; }
function openTplEditor(id){
  if(!isAdminMe()){ toast('Admins only', true); return; }
  const src = id ? tplById(id) : null;
  editingTpl = src ? JSON.parse(JSON.stringify(src)) : {name:'', description:'', defaults:{}, steps:[{t:'',role:roleSlots()[0],off:null,pr:'med',sub:[],dep:null}]};
  document.getElementById('tpl-title').textContent = src ? 'Edit template' : 'New template';
  document.getElementById('tp-name').value = editingTpl.name;
  document.getElementById('tp-desc').value = editingTpl.description||'';
  document.getElementById('tp-motion').value = (editingTpl.defaults&&editingTpl.defaults.motion)||'';
  renderTplSteps();
  document.getElementById('tpl-modal').classList.add('open');
  document.getElementById('modal-ov').classList.add('open');
}
function renderTplSteps(){
  const slots=roleSlots();
  document.getElementById('tp-steps').innerHTML = editingTpl.steps.map((s,i)=>`
    <div class="tstep">
      <input value="${esc(s.t)}" placeholder="Task name" onchange="tplStepSet(${i},'t',this.value)" />
      <select onchange="tplStepSet(${i},'role',this.value)">${slots.map(r=>`<option ${s.role===r?'selected':''}>${esc(r)}</option>`).join('')}</select>
      <input type="number" value="${s.off==null?'':s.off}" placeholder="—" onchange="tplStepSet(${i},'off',this.value)" />
      <select onchange="tplStepSet(${i},'pr',this.value)"><option value="high" ${s.pr==='high'?'selected':''}>High</option><option value="med" ${s.pr==='med'||!s.pr?'selected':''}>Med</option><option value="low" ${s.pr==='low'?'selected':''}>Low</option></select>
      <select onchange="tplStepSet(${i},'dep',this.value)"><option value="">— none —</option>${editingTpl.steps.map((x,xi)=>xi===i?'':`<option value="${xi}" ${s.dep===xi?'selected':''}>Step ${xi+1}</option>`).join('')}</select>
      <button type="button" class="del" title="Remove step" onclick="delTplStep(${i})">✕</button>
    </div>`).join('');
}
function tplStepSet(i,f,v){
  if(f==='off') editingTpl.steps[i].off = v===''?null:parseInt(v,10);
  else if(f==='dep') editingTpl.steps[i].dep = v===''?null:parseInt(v,10);
  else editingTpl.steps[i][f]=v;
}
function addTplStep(){ editingTpl.steps.push({t:'',role:roleSlots()[0],off:null,pr:'med',sub:[],dep:null}); renderTplSteps(); }
function delTplStep(i){
  editingTpl.steps.splice(i,1);
  editingTpl.steps.forEach(s=>{ if(s.dep===i) s.dep=null; else if(s.dep>i) s.dep--; });
  renderTplSteps();
}
async function saveTpl(e){
  e.preventDefault();
  if(!isAdminMe()){ toast('Admins only', true); return; }
  editingTpl.name = document.getElementById('tp-name').value.trim();
  editingTpl.description = document.getElementById('tp-desc').value.trim();
  editingTpl.defaults = {...(editingTpl.defaults||{}), motion: document.getElementById('tp-motion').value||undefined};
  editingTpl.steps = editingTpl.steps.filter(s=>s.t && s.t.trim());
  if(!editingTpl.name || !editingTpl.steps.length){ toast('A template needs a name and at least one step', true); return; }
  const body={name:editingTpl.name, description:editingTpl.description, defaults:editingTpl.defaults, steps:editingTpl.steps};
  if(editingTpl.id && tplById(editingTpl.id)){
    if(LIVE) await pUpdate('templates', editingTpl.id, body);
    Object.assign(tplById(editingTpl.id), body);
  } else {
    if(LIVE){ const d=await pInsert('templates',{...body, created_by:ME}); if(!d) return; editingTpl.id=d.id; }
    else editingTpl.id='d'+(++demoSeq);
    TEMPLATES.push({...body, id:editingTpl.id, by:ME});
  }
  closeModal(); renderTemplates(); toast('Template saved');
}
async function deleteTemplate(id){
  if(!isAdminMe()){ toast('Admins only', true); return; }
  const t=tplById(id); if(!t) return;
  if(!confirm(`Delete the "${t.name}" template? Campaigns already created from it are not affected.`)) return;
  if(LIVE){ const {error}=await sb.from('templates').delete().eq('id',id); if(error){ toast('Delete failed: '+error.message,true); return; } }
  TEMPLATES.splice(TEMPLATES.indexOf(t),1);
  renderTemplates(); toast('Template deleted');
}

/* ---------- Save an existing campaign as a template ---------- */
async function saveAsTemplate(pid){
  if(!isAdminMe()){ toast('Admins only', true); return; }
  const p=byId(pid);
  const name=(prompt('Template name:', p.name.replace(/[—–-].*$/,'').trim()+' playbook')||'').trim();
  if(!name) return;
  // anchor "launch day": a task that looks like a launch, else the latest due date
  const dated=p.tasks.filter(t=>t.due);
  const launchTask=dated.find(t=>/launch|go.?live|send/i.test(t.t));
  const anchor=launchTask?launchTask.due:(dated.length?dated.map(t=>t.due).sort()[dated.length-1]:null);
  const aDate=anchor?new Date(anchor+'T00:00:00'):null;
  const steps=p.tasks.map(t=>{ ensureDetail(p,t); return {
    t:t.t,
    role:(TEAM[t.a]&&TEAM[t.a].role)||'Campaign Manager',
    off:(t.due&&aDate)?Math.round((new Date(t.due+'T00:00:00')-aDate)/86400000):null,
    pr:t.pr||'med',
    sub:(t._sub||[]).map(s=>s.t),
    dep:t.bt?(p.tasks.findIndex(x=>x.id===t.bt)>-1?p.tasks.findIndex(x=>x.id===t.bt):null):null
  };});
  const body={name, description:'Saved from '+p.name, defaults:{motion:p.motion, segment:p.segment, solution:p.solution, pipeline:p.pipeline}, steps};
  let tid='d'+(++demoSeq);
  if(LIVE){ const d=await pInsert('templates',{...body, created_by:ME}); if(!d) return; tid=d.id; }
  TEMPLATES.push({...body, id:tid, by:ME});
  toast(`Template "${name}" saved — find it under Templates`);
}

/* ===================================================================
   Import a campaign from an Excel brief
   Sheet "Campaign": Field | Value rows.  Sheet "Tasks": one row per task.
   Dates accept a real date OR a launch-relative offset (L-14, L, L+7).
   =================================================================== */
const IMPORT_TASK_COLS = ['Task','Assignee','Due','Priority','Status','Blocked by','Subtasks','Description'];
const IMPORT_META_ROWS = [
  ['Campaign name','' ],['Description',''],['Owner',''],['Approver',''],['Status',''],['Motion',''],
  ['Segment',''],['Solution',''],['Pipeline',''],['Est. value',''],['Audience',''],['Launch',''],['Launch date',''],['Blocker','']
];
const normKey = s => String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function dateToISO(d){ const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
/* Returns {iso} or {off} (launch-relative days) or null */
function parseImportDate(v){
  if(v==null || v==='') return null;
  if(v instanceof Date && !isNaN(v)) return {iso:dateToISO(v)};
  const s=String(v).trim();
  if(!s) return null;
  const rel=s.match(/^L\s*([+-]\s*\d+)?$/i);
  if(rel) return {off: rel[1] ? parseInt(rel[1].replace(/\s/g,''),10) : 0};
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return {iso:s};
  const d=new Date(s);
  if(!isNaN(d)) return {iso:dateToISO(d)};
  return null;
}
function resolveMember(v){
  if(!v) return null;
  const s=String(v).trim(); if(!s) return null;
  const n=s.toLowerCase();
  const bare=x=>String(x||'').toLowerCase().replace(/[^a-z ]/g,'').trim();   // "Baxter O." -> "baxter o"
  const keys=Object.keys(TEAM);
  const hit = keys.find(k=>k.toLowerCase()===n)                              // initials
    || keys.find(k=>(TEAM[k].email||'').toLowerCase()===n)                   // exact email
    || keys.find(k=>TEAM[k].name.toLowerCase()===n)                          // exact name
    || keys.find(k=>bare(TEAM[k].name)===bare(n));                           // "Baxter O" ~ "Baxter O."
  if(hit) return hit;
  // an email whose local part looks like the person: baxter.o@… -> "baxter o"
  if(n.includes('@')){
    const local=bare(n.split('@')[0].replace(/[._-]+/g,' '));
    const byLocal=keys.find(k=>bare(TEAM[k].name)===local)
      || keys.find(k=>{ const parts=bare(TEAM[k].name).split(' '); const lp=local.split(' ');
          return parts[0]===lp[0] && (lp.length===1 || !parts[1] || parts[1][0]===lp[1][0]); });
    if(byLocal) return byLocal;
  }
  // single word = first name, only if unambiguous
  if(!n.includes(' ')){
    const first=keys.filter(k=>bare(TEAM[k].name).split(' ')[0]===bare(n));
    if(first.length===1) return first[0];
  }
  return null;
}
function normStatus(v){
  const n=normKey(v);
  if(!n) return 'todo';
  if(['done','complete','completed','finished'].includes(n)) return 'done';
  if(['inprogress','progress','started','doing','wip'].includes(n)) return 'progress';
  if(['blocked','waiting','onhold'].includes(n)) return 'blocked';
  if(['inreview','review','reviewing'].includes(n)) return 'review';
  return 'todo';
}
function normPriority(v){
  const n=normKey(v);
  if(['high','urgent','p1','critical'].includes(n)) return 'high';
  if(['low','p3','minor'].includes(n)) return 'low';
  return 'med';
}
function normCampStatus(v){
  const n=normKey(v);
  if(['planning','inplanning','planned','draft'].includes(n)) return 'planning';
  if(['review','underreview','inreview'].includes(n)) return 'review';
  if(['complete','completed','done','closed'].includes(n)) return 'complete';
  return 'active';
}
function normMotion(v){
  const n=normKey(v);
  return ['recruit','grow','retain'].includes(n) ? n : 'recruit';
}

async function downloadImportTemplate(){
  try{
    const XLSX=await loadXLSX();
    const wb=XLSX.utils.book_new();
    const meta=[['Field','Value'],...IMPORT_META_ROWS.map(r=>[r[0],r[1]])];
    // helpful example values
    const ex={ 'Campaign name':'Enterprise PRO Service — Recruit', 'Description':'Phase 1 demand gen to drive PRO Service awareness',
      'Owner':'Cole G.', 'Approver':'Mari H.', 'Status':'In Planning', 'Motion':'Recruit', 'Segment':'Enterprise · Services',
      'Solution':'PRO Service', 'Pipeline':'Stage 4', 'Est. value':'$600K', 'Audience':'C-Suite, HTM leaders; Enterprise >$250K GMV',
      'Launch':'Early September', 'Launch date':'2026-09-08', 'Blocker':'' };
    meta.forEach((r,ix)=>{ if(ix) r[1]=ex[r[0]]!==undefined?ex[r[0]]:''; });
    const ws1=XLSX.utils.aoa_to_sheet(meta); ws1['!cols']=[{wch:16},{wch:62}];
    XLSX.utils.book_append_sheet(wb, ws1, 'Campaign');

    const rows=[IMPORT_TASK_COLS,
      ['Build target account list','Cole G.','L-21','High','Not Started','','Pull from Salesforce; Exclude existing PRO customers','Named accounts from Sales/RevOps'],
      ['Draft ad copy & messaging','Meredith D.','L-14','High','Not Started','','',''],
      ['Build landing page','Baxter O.','L-7','High','Not Started','2','Design review; QA links & UTMs','Destination for search + display'],
      ['Launch Google Ads campaign','Cole G.','L','High','Not Started','3','',''],
      ['Mid-flight performance check','Cole G.','L+14','Medium','Not Started','4','',''],
      // (Blocked by = task number: 2 = "Draft ad copy", 3 = "Build landing page", 4 = "Launch")
      ['Wrap report to ELT','Mari H.','L+30','Medium','Not Started','','','']];
    const ws2=XLSX.utils.aoa_to_sheet(rows);
    ws2['!cols']=[{wch:38},{wch:15},{wch:11},{wch:10},{wch:13},{wch:11},{wch:44},{wch:44}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Tasks');

    const help=[
      ['Always On campaign import — how to fill this in'],[''],
      ['1. Fill the Campaign sheet (Field / Value). Only "Campaign name" is required.'],
      ['2. List every task on the Tasks sheet, one per row, in the order they should appear.'],
      ['3. Save as .xlsx, then in Always On click New → Import and pick this file.'],[''],
      ['DUE DATES — two ways to write them'],
      ['  A real date',           'e.g. 2026-09-08  (or any date cell)'],
      ['  Relative to launch',    'L-14 = 14 days before launch · L = launch day · L+30 = 30 days after'],
      ['  Relative dates need "Launch date" filled in on the Campaign sheet.'],[''],
      ['ASSIGNEE / OWNER / APPROVER','Full name (Cole G.), initials (CG), or work email. Unknown names are flagged before anything is created.'],[''],
      ['ALLOWED VALUES'],
      ['  Task Status','Not Started · In Progress · Blocked · In Review · Complete'],
      ['  Priority','High · Medium · Low'],
      ['  Campaign Status','Active · In Planning · Under Review · Complete'],
      ['  Motion','Recruit · Grow · Retain'],[''],
      ['BLOCKED BY','Task number this one waits on — 1 = the first task listed, 2 = the second, and so on (you can also write the task name). It becomes a real dependency: when the upstream task is completed, this one unblocks automatically.'],
      ['SUBTASKS','Separate with semicolons: Design review; QA links; Schedule send'],[''],
      ['NOTE','A campaign with an Approver starts as In Planning and needs approval before it can be Active.']
    ];
    const ws3=XLSX.utils.aoa_to_sheet(help); ws3['!cols']=[{wch:30},{wch:92}];
    XLSX.utils.book_append_sheet(wb, ws3, 'How to use');

    XLSX.writeFile(wb, 'Always On campaign import template.xlsx');
    toast('Template downloaded');
  }catch(e){ toast('Could not build the template: '+e.message, true); }
}

let importData=null;
function pickImportFile(){
  if(!isAdminMe()){ toast('Only admins can create campaigns', true); return; }
  const inp=document.getElementById('file-input');
  inp.accept='.xlsx,.xls,.csv';
  inp.onchange=()=>{ const f=inp.files[0]; inp.value=''; inp.accept=''; if(f) readImportFile(f); };
  inp.click();
}
async function readImportFile(file){
  toast('Reading '+file.name+'…');
  try{
    const XLSX=await loadXLSX();
    const buf=await file.arrayBuffer();
    const wb=XLSX.read(buf,{type:'array', cellDates:true});
    importData=buildImportModel(XLSX, wb, file.name);
    renderImportPreview();
    document.getElementById('campaign-modal').classList.remove('open');
    document.getElementById('import-modal').classList.add('open');
    document.getElementById('modal-ov').classList.add('open');
  }catch(e){ toast('Could not read that file: '+e.message, true); }
}
function pickSheet(wb, wanted, fallbackIdx){
  const name=wb.SheetNames.find(n=>normKey(n)===normKey(wanted));
  return name ? wb.Sheets[name] : (wb.SheetNames[fallbackIdx] ? wb.Sheets[wb.SheetNames[fallbackIdx]] : null);
}
function buildImportModel(XLSX, wb, filename){
  const warn=[], err=[];
  // ---- campaign meta ----
  const metaSheet=pickSheet(wb,'Campaign',0);
  const meta={};
  if(metaSheet){
    XLSX.utils.sheet_to_json(metaSheet,{header:1,blankrows:false}).forEach(r=>{
      if(!r || r.length<1) return;
      const k=normKey(r[0]); if(!k || k==='field') return;
      let v=r[1];
      if(v instanceof Date && !isNaN(v)) v=dateToISO(v);
      if(v!=null && String(v).trim()!=='') meta[k]=String(v).trim();
    });
  }
  const g=(...keys)=>{ for(const k of keys){ if(meta[normKey(k)]) return meta[normKey(k)]; } return ''; };
  const name=g('Campaign name','Campaign','Name','Title');
  if(!name) err.push('No campaign name found. Put it on the Campaign sheet as "Campaign name".');

  const ownerRaw=g('Owner','Campaign owner'), apprRaw=g('Approver');
  const owner=ownerRaw?resolveMember(ownerRaw):null;
  if(ownerRaw && !owner) warn.push(`Owner "${ownerRaw}" isn't on the team — you'll be set as owner instead.`);
  let approver=apprRaw?resolveMember(apprRaw):null;
  if(apprRaw && !approver) warn.push(`Approver "${apprRaw}" isn't on the team — no approver will be set.`);
  if(approver && !(TEAM[approver].isApprover || TEAM[approver].appRole==='admin')){
    warn.push(`${teamName(approver)} isn't marked as an approver — set that on the Team screen, or the approval won't be actionable.`);
  }
  const ld=parseImportDate(g('Launch date','Launchdate','Start date'));
  const launchISO = ld && ld.iso ? ld.iso : null;

  const camp={
    name: name||'Untitled campaign',
    desc: g('Description','Summary','Strategy overview','Objective'),
    owner: owner||ME,
    approverId: HAS_APPR?approver:null,
    status: normCampStatus(g('Status','Campaign status')),
    motion: normMotion(g('Motion')),
    segment: g('Segment'), solution: g('Solution','Product'), pipeline: g('Pipeline','Pipeline stage'),
    value: g('Est. value','Value','Estimated value','Projected lift'),
    audience: g('Audience','Target audience'),
    launch: g('Launch','Launch timing','Duration'),
    launchDate: launchISO,
    blocker: g('Blocker','Blockers','Dependencies')||null
  };
  if(!camp.launch && launchISO) camp.launch='Launches '+fmtDue(launchISO);

  // ---- tasks ----
  const taskSheet=pickSheet(wb,'Tasks',1);
  const tasks=[];
  let needsLaunch=false;
  if(taskSheet){
    const rows=XLSX.utils.sheet_to_json(taskSheet,{defval:'',blankrows:false});
    rows.forEach((r,ix)=>{
      const find=(...keys)=>{ for(const k of keys){ const hit=Object.keys(r).find(h=>normKey(h)===normKey(k)); if(hit && String(r[hit]).trim()!=='') return r[hit]; } return ''; };
      const title=String(find('Task','Task name','Title','Name')||'').trim();
      if(!title) return;
      const aRaw=String(find('Assignee','Owner','Who')||'').trim();
      const a=aRaw?resolveMember(aRaw):null;
      if(aRaw && !a) warn.push(`Row ${ix+2}: assignee "${aRaw}" isn't on the team — assigning to ${teamName(camp.owner)} instead.`);
      const dRaw=find('Due','Due date','Date');
      const d=parseImportDate(dRaw);
      if(dRaw && !d) warn.push(`Row ${ix+2}: couldn't read the due date "${dRaw}" — leaving it blank.`);
      if(d && d.off!=null) needsLaunch=true;
      const depRaw=String(find('Blocked by','Depends on','Dependency')||'').trim();
      let dep=null;
      if(depRaw){
        const n=parseInt(depRaw,10);
        if(!isNaN(n)) dep=n-1;                       // task number (1 = first task) → index
        if(dep==null || dep<0 || dep>=ix){           // otherwise try matching an earlier task by name
          const byName=tasks.findIndex(pt=>normKey(pt.t)===normKey(depRaw));
          dep = byName>-1 ? byName : null;
        }
        if(dep==null) warn.push(`Row ${ix+2}: "blocked by ${depRaw}" doesn't point at an earlier task — ignoring it.`);
      }
      tasks.push({
        t:title, aRaw, a, due:d, pr:normPriority(find('Priority','Prio')), s:normStatus(find('Status','State')),
        dep, sub:String(find('Subtasks','Checklist')||'').split(/[;\n]/).map(x=>x.trim()).filter(Boolean),
        desc:String(find('Description','Notes','Details')||'').trim()
      });
    });
  }
  if(!tasks.length) warn.push('No task rows found — the campaign will be created empty. Check that the second sheet is named "Tasks" with a "Task" column.');
  if(needsLaunch && !launchISO) err.push('Some due dates are launch-relative (like L-14) but the Campaign sheet has no "Launch date".');
  if(camp.approverId && camp.status==='active'){ camp.status='planning'; warn.push('Campaign has an approver, so it starts In Planning until it\'s approved.'); }
  return {filename, camp, tasks, warn, err};
}
function renderImportPreview(){
  const d=importData; if(!d) return;
  const c=d.camp;
  const dueLabel=t=>!t.due?'—':(t.due.iso?fmtDue(t.due.iso):(c.launchDate?fmtDue(addDaysISO(c.launchDate,t.due.off)):`L${t.due.off>=0?'+':''}${t.due.off}`));
  const metaCells=[['Campaign',c.name],['Owner',teamName(c.owner)],['Status',STATUS_PILL[c.status==='planning'?'planning':c.status==='review'?'review':c.status==='complete'?'complete':'active'][1]],
    ['Motion',c.motion],['Segment',c.segment],['Solution',c.solution],['Pipeline',c.pipeline],['Est. value',c.value],
    ['Audience',c.audience],['Launch',c.launch],['Launch date',c.launchDate?fmtDue(c.launchDate):''],['Approver',c.approverId?teamName(c.approverId):'None']]
    .filter(x=>x[1]);
  document.getElementById('im-title').textContent = d.err.length ? 'Import — needs a fix' : 'Review import';
  document.getElementById('im-confirm').style.display = d.err.length ? 'none' : '';
  document.getElementById('import-body').innerHTML = `
    <div class="page-sub" style="margin-bottom:12px">From <b>${esc(d.filename)}</b> — nothing is created until you confirm.</div>
    ${d.err.map(e=>`<div class="im-warn im-err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="flex:none;margin-top:1px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${esc(e)}</span></div>`).join('')}
    ${d.warn.length?`<div class="im-warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="flex:none;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg><span>${d.warn.map(esc).join('<br>')}</span></div>`:''}
    ${c.desc?`<div class="page-sub" style="margin-bottom:10px">${esc(c.desc)}</div>`:''}
    <div class="im-sec">Campaign</div>
    <div class="im-meta">${metaCells.map(([k,v])=>`<div><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join('')}</div>
    <div class="im-sec">Tasks <span style="color:var(--ink-3)">· ${d.tasks.length}</span></div>
    <div class="im-tasks">
      <div class="im-row head"><span>#</span><span>Task</span><span>Assignee</span><span class="c-due">Due</span><span class="c-pr">Priority</span></div>
      ${d.tasks.map((t,ix)=>`<div class="im-row"><span class="n">${ix+1}</span>
        <span><div class="tt">${esc(t.t)}</div>${t.dep!=null?`<div class="sub">⛔ waits on #${t.dep+1} ${esc(d.tasks[t.dep]?d.tasks[t.dep].t:'')}</div>`:''}${t.sub.length?`<div class="sub">${t.sub.length} subtask${t.sub.length===1?'':'s'}</div>`:''}</span>
        <span>${t.a?`${av(t.a)} ${esc(teamName(t.a))}`:`<span style="color:var(--ink-3)">${esc(t.aRaw||'unassigned')}</span>`}</span>
        <span class="c-due num">${dueLabel(t)}</span><span class="c-pr"><span class="prio ${t.pr}">${t.pr.toUpperCase()}</span></span></div>`).join('')
        || '<div style="padding:14px;color:var(--ink-3);font-size:12.5px">No tasks in this file.</div>'}
    </div>`;
}
async function confirmImport(){
  const d=importData; if(!d || d.err.length) return;
  if(!isAdminMe()){ toast('Only admins can create campaigns', true); return; }
  const c=d.camp;
  const btn=document.getElementById('im-confirm'); btn.disabled=true; btn.textContent='Creating…';
  const fields={ name:c.name, description:c.desc, owner_id:c.owner, status:c.status, motion:c.motion,
    segment:c.segment, solution:c.solution, pipeline:c.pipeline, value:c.value, audience:c.audience,
    launch:c.launch, blocker:c.blocker };
  if(HAS_LDATE) fields.launch_date=c.launchDate;
  if(HAS_APPR) fields.approver_id=c.approverId;
  let id;
  if(LIVE){ const row=await pInsert('projects',{...fields, sort:PROJECTS.length}); if(!row){ btn.disabled=false; btn.textContent='Create campaign'; return; } id=row.id; }
  else id='d'+(++demoSeq)+Date.now();
  const proj={ id, name:c.name, desc:c.desc, owner:c.owner, status:c.status, motion:c.motion, segment:c.segment,
    solution:c.solution, pipeline:c.pipeline, value:c.value, audience:c.audience, launch:c.launch,
    launchDate:c.launchDate, blocker:c.blocker, approverId:c.approverId, _approvals:[], tasks:[], _files:[] };
  PROJECTS.push(proj);

  const created=[];
  for(const [ix,t] of d.tasks.entries()){
    const due = t.due ? (t.due.iso || (c.launchDate?addDaysISO(c.launchDate,t.due.off):null)) : null;
    const a = t.a || c.owner;
    const s = (t.dep!=null && t.s!=='done') ? 'blocked' : t.s;
    let task;
    if(LIVE){
      const row=await pInsert('tasks',{project_id:id, title:t.t, assignee_id:a, due, priority:t.pr, status:s, description:t.desc||null, position:ix});
      if(!row) break;
      task={id:row.id, t:t.t, a, due, pr:t.pr, s, _desc:t.desc||null, _sub:[], _comments:[], _links:[]};
      if(t.sub.length){
        try{ const {data}=await sb.from('subtasks').insert(t.sub.map((x,si)=>({task_id:row.id,title:x,done:false,position:si}))).select();
          (data||[]).forEach(r=>task._sub.push({id:r.id, t:r.title, done:false})); }catch(_){}
      }
    } else {
      task={id:'d'+(++demoSeq)+'i'+ix, t:t.t, a, due, pr:t.pr, s, _desc:t.desc||null, _sub:t.sub.map(x=>({t:x,done:false})), _comments:[], _links:[]};
    }
    proj.tasks.push(task); created.push(task);
  }
  for(const [ix,t] of d.tasks.entries()){
    if(t.dep!=null && created[t.dep] && created[ix]){
      created[ix].bt=created[t.dep].id;
      if(LIVE) await pUpdate('tasks',created[ix].id,{blocked_by_task:created[t.dep].id});
    }
  }
  if(c.approverId){
    await recordApproval(id,'submitted');
    notify(c.approverId, `New campaign "${c.name}" needs your approval.`, id, null);
  }
  importData=null;
  btn.disabled=false; btn.textContent='Create campaign';
  closeModal(); renderBoardPicker(); refreshCounts(); openProject(id);
  toast(`Imported "${c.name}" — ${created.length} task${created.length===1?'':'s'} created`);
}

/* ===================================================================
   Files — upload / open / delete (Supabase Storage bucket 'pmpm-files')
   =================================================================== */
function pickFile(projectId, taskRef){
  const p=byId(projectId);
  const t=taskRef?p.tasks[taskRef.i]:null;
  if(t && !canEdit(t)){ denyEdit(); return; }
  const inp=document.getElementById('file-input');
  inp.onchange=()=>{ if(inp.files[0]) doUpload(projectId, taskRef, inp.files[0]); inp.value=''; };
  inp.click();
}
async function doUpload(projectId, taskRef, file){
  if(file.size > 25*1024*1024){ toast('Files up to 25 MB please', true); return; }
  const p=byId(projectId), t=taskRef?p.tasks[taskRef.i]:null;
  if(t) ensureDetail(p,t);
  if(!LIVE){
    const row={label:file.name, sub:fmtSize(file.size)+' · demo (not saved)', url:URL.createObjectURL(file), by:ME};
    if(t){ t._links.push(row); renderDrawer(projectId,taskRef.i); } else { (p._files=p._files||[]).push(row); renderProjectDetail(); }
    toast('Attached (demo — not saved)');
    return;
  }
  toast('Uploading '+file.name+'…');
  const safe=file.name.replace(/[^\w.\-]+/g,'_');
  const path=`${projectId}/${crypto.randomUUID()}-${safe}`;
  const {error}=await sb.storage.from('pmpm-files').upload(path, file);
  if(error){ toast('Upload failed: '+error.message, true); return; }
  const d=await pInsert('attachments',{ task_id:t?t.id:null, project_id:t?null:projectId,
    label:file.name, sublabel:fmtSize(file.size)+' · '+teamName(ME), path, uploaded_by:ME });
  if(!d){ await sb.storage.from('pmpm-files').remove([path]); return; }
  const item={id:d.id, label:d.label, sub:d.sublabel, path:d.path, by:d.uploaded_by};
  if(t){ t._links.push(item); renderDrawer(projectId,taskRef.i); } else { (p._files=p._files||[]).push(item); renderProjectDetail(); }
  toast('File attached');
}
async function openStored(l){
  if(l.url){ window.open(l.url,'_blank','noopener'); return; }
  if(!l.path) return;
  const {data,error}=await sb.storage.from('pmpm-files').createSignedUrl(l.path, 3600);
  if(error){ toast('Could not open file: '+error.message, true); return; }
  window.open(data.signedUrl,'_blank','noopener');
}
function openAtt(pid,i,ai){ openStored(byId(pid).tasks[i]._links[ai]); }
function openPFile(pid,fi){ openStored(byId(pid)._files[fi]); }
async function removeStored(l){
  if(LIVE && l.id){
    const {error}=await sb.from('attachments').delete().eq('id',l.id);
    if(error){ toast('Remove failed: '+error.message, true); return false; }
    if(l.path) await sb.storage.from('pmpm-files').remove([l.path]);
  }
  return true;
}
async function delAtt(pid,i,ai){
  const t=byId(pid).tasks[i], l=t._links[ai];
  if(!(canEdit(t)||l.by===ME)){ denyEdit(); return; }
  if(!confirm(`Remove "${l.label}" from this task?`)) return;
  if(await removeStored(l)){ t._links.splice(ai,1); renderDrawer(pid,i); toast('File removed'); }
}
async function delPFile(pid,fi){
  const p=byId(pid), l=p._files[fi];
  if(!(isAdminMe()||l.by===ME)){ toast('Only admins or the uploader can remove this file', true); return; }
  if(!confirm(`Remove "${l.label}" from this campaign?`)) return;
  if(await removeStored(l)){ p._files.splice(fi,1); renderProjectDetail(); toast('File removed'); }
}

/* ===================================================================
   Excel export (SheetJS loaded on demand from CDN)
   =================================================================== */
let XLSXReady=null;
function loadXLSX(){
  return XLSXReady || (XLSXReady = new Promise((res,rej)=>{
    if(window.XLSX) return res(window.XLSX);
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload=()=>res(window.XLSX);
    s.onerror=()=>{ XLSXReady=null; rej(new Error('could not load the Excel library')); };
    document.head.appendChild(s);
  }));
}
function buildCampaignWb(XLSX,p){
  const pr=progress(p);
  const wb=XLSX.utils.book_new();
  const meta=[
    ['Campaign', p.name], ['Description', p.desc||''], ['Owner', teamName(ownerOf(p))],
    ['Status', STATUS_PILL[projStatus(p)][1]], ['Motion', p.motion||''], ['Segment', p.segment||''],
    ['Solution', p.solution||''], ['Pipeline', p.pipeline||''], ['Audience', p.audience||''],
    ['Est. value', p.value||''], ['Launch', p.launch||''], ['Blocker', p.blocker||''],
    ['Approval', (function(){ const st=approvalState(p); return st ? `${APPR_PILL[st][1]} — approver: ${teamName(p.approverId)}` : 'Not required'; })()],
    ['Progress', `${pr.done} of ${pr.total} tasks (${pr.pct}%)`], ['Exported', new Date().toLocaleString()]
  ];
  const ws1=XLSX.utils.aoa_to_sheet(meta);
  ws1['!cols']=[{wch:14},{wch:80}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Campaign');
  const rows=p.tasks.map(t=>{ ensureDetail(p,t); return {
    'Task':t.t, 'Assignee':teamName(t.a), 'Due':t.due||'', 'Priority':(t.pr||'').toUpperCase(),
    'Status':STATUS[t.s].label, 'Waiting on':blockedLabel(p,t)||'', 'Blocks':t.blocks||'',
    'Subtasks':`${t._sub.filter(s=>s.done).length}/${t._sub.length}`, 'Description':t._desc||''
  };});
  const ws2=XLSX.utils.json_to_sheet(rows.length?rows:[{'Task':'(no tasks yet)'}]);
  ws2['!cols']=[{wch:44},{wch:14},{wch:11},{wch:9},{wch:12},{wch:36},{wch:20},{wch:9},{wch:70}];
  XLSX.utils.book_append_sheet(wb, ws2, 'Tasks');
  return wb;
}
async function exportCampaign(id){
  const p=byId(id); if(!p) return;
  toast('Preparing Excel export…');
  try{
    const XLSX=await loadXLSX();
    XLSX.writeFile(buildCampaignWb(XLSX,p), `Always On - ${p.name.replace(/[\\/:*?"<>|]/g,'-')}.xlsx`);
    toast('Excel downloaded');
  }catch(e){ toast('Export failed: '+e.message, true); }
}

/* ===================================================================
   RENDER — My Tasks
   =================================================================== */
function renderMyTasks(){
  const mine = visibleProjects().flatMap(p=>p.tasks.map((t,i)=>({t,p,i}))).filter(x=>x.t.a===ME && x.t.s!=='done');
  const buckets={Overdue:[],'Due Today':[],'This Week':[],Later:[]};
  mine.forEach(x=>{ const d=x.t.due?new Date(x.t.due+'T00:00:00'):null; if(!d){buckets.Later.push(x);return;} const diff=Math.round((d-TODAY)/86400000); if(diff<0)buckets.Overdue.push(x); else if(diff===0)buckets['Due Today'].push(x); else if(diff<=7)buckets['This Week'].push(x); else buckets.Later.push(x); });
  const over=buckets.Overdue.length, today=buckets['Due Today'].length, blocked=mine.filter(x=>x.t.s==='blocked').length;
  document.getElementById('mytasks-banner-text').innerHTML = mine.length ? `You have <b style="margin:0 3px">${over} overdue</b> and <b style="margin:0 3px">${today} due today</b>.${blocked?` ${blocked} task${blocked>1?'s are':' is'} waiting on a roadblock.`:''}` : `You're all caught up — nothing open assigned to you.`;
  document.getElementById('mytasks-body').innerHTML = Object.keys(buckets).map(name=>{
    const arr=buckets[name]; if(!arr.length) return '';
    const crit=name==='Overdue';
    return `<div class="task-group"><div class="tg-head"><h3 style="${crit?'color:var(--crit)':''}">${name}</h3><span class="tg-count num">${arr.length}</span></div>${arr.map(({t,p,i})=>{
      const over=t.due&&new Date(t.due+'T00:00:00')<TODAY;
      return `<div class="task"><button class="check" onclick="cycleDone('${p.id}',${i})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg></button><div class="t-body"><div class="t-title" style="cursor:pointer" onclick="openTask('${p.id}',${i})">${esc(t.t)}${t.recur?' <span title="Repeats">🔁</span>':''}</div><div class="t-meta"><span class="tag" style="cursor:pointer" onclick="openProject('${p.id}')">${esc(p.name)}</span><span class="t-due ${over?'over':''}">${over?'Overdue · ':'Due '}${fmtDue(t.due)}</span>${(t.bt||t.blockedBy)?`<span class="pill crit" style="font-size:11px">Blocked</span>`:''}${t.blocks?`<span class="pill crit plain" style="font-size:11px">Blocks work</span>`:''}</div></div><div class="t-right"><span class="prio ${t.pr}">${(t.pr||'').toUpperCase()}</span></div></div>`;
    }).join('')}</div>`;
  }).join('');
}

/* ===================================================================
   RENDER — Board
   =================================================================== */
function renderBoardPicker(){ document.getElementById('board-pick').innerHTML = visibleProjects().filter(p=>p.status!=='complete').map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); }
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
        <div class="kt">${esc(t.t)}${t.recur?' <span title="Repeats">🔁</span>':''}</div>
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
  const blocked = visibleProjects().flatMap(p=>p.tasks.map((t,i)=>({t,p,i})).filter(x=>x.t.s==='blocked'));
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
  fp.innerHTML = `<option value="">All campaigns</option>`+visibleProjects().map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  fp.value = byId(FILT.cal.proj) ? FILT.cal.proj : (FILT.cal.proj='', '');
  document.getElementById('cal-fa').classList.toggle('on',!!FILT.cal.a);
  fp.classList.toggle('on',!!FILT.cal.proj);
  document.getElementById('cal-title').textContent = `${MONTHS_FULL[calM]} ${calY}`;

  // index tasks by due date string (respecting filters)
  const byDue={};
  visibleProjects().forEach(p=>p.tasks.forEach((t,i)=>{
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

/* ===================================================================
   RENDER — Timeline (portfolio bars + per-campaign milestones)
   =================================================================== */
function todayISO(){ const pad=n=>String(n).padStart(2,'0'); return `${TODAY.getFullYear()}-${pad(TODAY.getMonth()+1)}-${pad(TODAY.getDate())}`; }
function addDaysISO(iso,days){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+days); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function tlRange(dates){
  let min=null,max=null;
  dates.forEach(d=>{ if(!d) return; if(!min||d<min)min=d; if(!max||d>max)max=d; });
  const t=todayISO();
  if(!min||t<min) min=t;
  if(!max||t>max) max=t;
  const s=new Date(min+'T00:00:00'); s.setDate(s.getDate()-7); s.setDate(s.getDate()-s.getDay()); // pad + snap to Sunday
  const e=new Date(max+'T00:00:00'); e.setDate(e.getDate()+14);
  return { start:s, days: Math.max(28, Math.ceil((e-s)/86400000)+1) };
}
function tlX(iso,R){ return Math.round((new Date(iso+'T00:00:00')-R.start)/86400000)*TL_PPD; }
function tlMonths(R){
  let html='', d=new Date(R.start), remaining=R.days;
  while(remaining>0){
    const dim=new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
    const span=Math.min(dim-d.getDate()+1, remaining);
    const w=span*TL_PPD;
    html+=`<div class="tl-month" style="width:${w}px">${w>76?MONTHS[d.getMonth()]+' '+d.getFullYear():(w>34?MONTHS[d.getMonth()]:'')}</div>`;
    d=new Date(d.getFullYear(), d.getMonth()+1, 1);
    remaining-=span;
  }
  return html;
}
function tlToday(){ const R=document.getElementById('tl-inner')._range; if(R) document.getElementById('tl-scroll').scrollLeft=Math.max(0, tlX(todayISO(),R)-260); }
function renderTimeline(){
  const single = tlMode==='campaign';
  document.getElementById('tl-pick').style.display = single?'':'none';
  document.getElementById('tl-filt-portfolio').style.display = single?'none':'';
  document.getElementById('tl-filt-campaign').style.display = single?'':'none';
  const pick=document.getElementById('tl-pick');
  const vis=visibleProjects();
  pick.innerHTML = vis.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const cur=byId(tlProject);
  if(!cur || cur.archived) tlProject=(vis.find(p=>p.status==='active')||vis[0]||{}).id||null;
  if(tlProject) pick.value=tlProject;
  document.getElementById('tl-fo').classList.toggle('on',!!FILT.tl.owner);
  document.getElementById('tl-fm').classList.toggle('on',!!FILT.tl.motion);
  document.getElementById('tl-fa').classList.toggle('on',!!FILT.tl.a);
  document.getElementById('tl-hint').textContent = single ? 'Drag a marker to change its due date · click to open the task' : "Bars span each campaign's dated work · ⚑ = launch date";
  const inner=document.getElementById('tl-inner');
  if(single) renderTlCampaign(inner); else renderTlPortfolio(inner);
  tlToday();
}
function renderTlPortfolio(inner){
  const list=visibleProjects()
    .filter(p=>!FILT.tl.owner || ownerOf(p)===FILT.tl.owner)
    .filter(p=>!FILT.tl.motion || p.motion===FILT.tl.motion);
  const rows=[], undated=[], allDates=[];
  list.forEach(p=>{
    const ds=p.tasks.filter(t=>t.due).map(t=>t.due);
    if(p.launchDate) ds.push(p.launchDate);
    if(ds.length){ rows.push({p, min:ds.reduce((a,b)=>a<b?a:b), max:ds.reduce((a,b)=>a>b?a:b)}); allDates.push(...ds); }
    else undated.push(p);
  });
  rows.sort((a,b)=>a.min<b.min?-1:1);
  const R=tlRange(allDates); inner._range=R;
  const trackW=R.days*TL_PPD;
  const colorFor={active:'var(--accent)', atrisk:'var(--crit)', planning:'var(--ink-3)', review:'var(--warn)', complete:'var(--good)'};
  inner.style.width=(TL_LABELW+trackW)+'px';
  inner.innerHTML=`
    <div class="tl-row tl-headrow"><div class="tl-label" style="font-size:10.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.5px">Campaign</div><div class="tl-track" style="width:${trackW}px">${tlMonths(R)}</div></div>
    ${rows.map(({p,min,max})=>{
      const st=projStatus(p), pr=progress(p);
      const x1=tlX(min,R), w=Math.max(tlX(max,R)-x1, TL_PPD)+8;
      return `<div class="tl-row"><div class="tl-label" style="cursor:pointer;${st==='complete'?'color:var(--ink-3)':''}" onclick="openProject('${p.id}')" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="tl-track" style="width:${trackW}px;background-size:${TL_PPD*7}px 100%">
          <div class="tl-bar" onclick="openProject('${p.id}')" title="${esc(p.name)} · ${fmtDue(min)} – ${fmtDue(max)} · ${pr.pct}% done" style="left:${x1}px;width:${w}px;border-color:${colorFor[st]};background:color-mix(in srgb, ${colorFor[st]} 16%, transparent);${st==='complete'?'opacity:.55':''}"><span style="width:${pr.pct}%;background:${colorFor[st]}"></span></div>
          ${p.launchDate?`<div class="tl-flag" style="left:${tlX(p.launchDate,R)}px" title="Launch · ${fmtDue(p.launchDate)}"></div>`:''}
        </div></div>`;
    }).join('')}
    <div class="tl-todayline" style="left:${TL_LABELW+tlX(todayISO(),R)}px;top:${TL_HEADH}px;height:${rows.length*TL_ROWH}px"></div>
    ${undated.length?`<div class="tl-row" style="height:auto;min-height:${TL_ROWH}px"><div class="tl-label" style="color:var(--ink-3)">No dated work yet</div><div class="tl-track" style="width:${trackW}px;display:flex;align-items:center;gap:8px;padding:6px 10px;flex-wrap:wrap;background-image:none">${undated.map(p=>`<span class="tag" style="cursor:pointer" onclick="openProject('${p.id}')">${esc(p.name)}</span>`).join('')}</div></div>`:''}`;
}
function renderTlCampaign(inner){
  const p=byId(tlProject);
  if(!p){ inner.innerHTML='<div style="padding:20px;color:var(--ink-3)">No campaign selected.</div>'; inner._range=null; return; }
  const items=p.tasks.map((t,i)=>({t,i})).filter(x=>!FILT.tl.a || x.t.a===FILT.tl.a);
  const dated=items.filter(x=>x.t.due).sort((a,b)=>a.t.due<b.t.due?-1:1);
  const undated=items.filter(x=>!x.t.due);
  const R=tlRange(dated.map(x=>x.t.due)); inner._range=R;
  const trackW=R.days*TL_PPD;
  inner.style.width=(TL_LABELW+trackW)+'px';
  const rowOf={}; dated.forEach((x,ri)=>rowOf[x.t.id]=ri);
  let paths='';
  dated.forEach((x,ri)=>{
    if(x.t.bt && rowOf[x.t.bt]!=null){
      const ur=rowOf[x.t.bt], up=dated[ur].t;
      const x1=tlX(up.due,R)+8, y1=ur*TL_ROWH+TL_ROWH/2, x2=tlX(x.t.due,R)-10, y2=ri*TL_ROWH+TL_ROWH/2;
      paths+=`<path marker-end="url(#tlarrow)" d="M ${x1} ${y1} C ${x1+28} ${y1}, ${x2-28} ${y2}, ${x2} ${y2}" />`;
    }
  });
  const t0=todayISO();
  inner.innerHTML=`
    <div class="tl-row tl-headrow"><div class="tl-label" style="font-size:10.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.5px">Task</div><div class="tl-track" style="width:${trackW}px">${tlMonths(R)}</div></div>
    ${dated.map(({t,i})=>{
      const over=t.due<t0 && t.s!=='done';
      const col=t.s==='done'?'var(--good)':(over?'var(--crit)':STATUS[t.s].dot);
      return `<div class="tl-row"><div class="tl-label" style="cursor:pointer" onclick="openTask('${p.id}',${i})" title="${esc(t.t)}">${av(t.a)}<span class="tl-lt ${t.s==='done'?'tl-done':''}">${esc(t.t)}</span></div>
        <div class="tl-track" style="width:${trackW}px;background-size:${TL_PPD*7}px 100%">
          <div class="tl-marker ${canEdit(t)?'draggable':''}" data-pid="${p.id}" data-idx="${i}" onpointerdown="tlDragStart(event)" onpointermove="tlDragMove(event)" onpointerup="tlDragEnd(event)" onclick="tlMarkerClick(event,'${p.id}',${i})" style="left:${tlX(t.due,R)-7}px;background:${col}" title="${esc(t.t)} · due ${fmtDue(t.due)} · ${esc(teamName(t.a))}"></div>
        </div></div>`;
    }).join('')}
    <svg class="tl-svg" style="left:${TL_LABELW}px;top:${TL_HEADH}px;width:${trackW}px;height:${dated.length*TL_ROWH}px" viewBox="0 0 ${trackW} ${dated.length*TL_ROWH}"><defs><marker id="tlarrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-3)" opacity=".7"/></marker></defs>${paths}</svg>
    <div class="tl-todayline" style="left:${TL_LABELW+tlX(t0,R)}px;top:${TL_HEADH}px;height:${dated.length*TL_ROWH}px"></div>
    ${undated.map(({t,i})=>`<div class="tl-row"><div class="tl-label" style="cursor:pointer;color:var(--ink-3)" onclick="openTask('${p.id}',${i})">${av(t.a)}<span class="tl-lt">${esc(t.t)}</span></div><div class="tl-track" style="width:${trackW}px;background-image:none;display:flex;align-items:center;padding-left:10px;color:var(--ink-3);font-size:12px">no due date</div></div>`).join('')}`;
}

/* ---------- Timeline drag-to-reschedule ---------- */
let tlDrag=null, tlSuppress=false;
function tlDragStart(e){
  const el=e.currentTarget;
  if(!el.classList.contains('draggable')) return;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const pid=el.dataset.pid, idx=+el.dataset.idx;
  tlDrag={pid, idx, el, x0:e.clientX, days:0, orig:byId(pid).tasks[idx].due};
  el.classList.add('dragging');
}
function tlDragMove(e){
  if(!tlDrag || tlDrag.el!==e.currentTarget) return;
  const days=Math.round((e.clientX-tlDrag.x0)/TL_PPD);
  if(days!==tlDrag.days){
    tlDrag.days=days;
    tlDrag.el.style.transform=`translateX(${days*TL_PPD}px)`;
    tlDrag.el.title='Due '+fmtDue(addDaysISO(tlDrag.orig,days));
  }
}
function tlDragEnd(e){
  if(!tlDrag || tlDrag.el!==e.currentTarget) return;
  const {pid,idx,days,orig,el}=tlDrag;
  el.classList.remove('dragging'); el.style.transform='';
  tlDrag=null;
  if(!days) return;
  tlSuppress=true; setTimeout(()=>tlSuppress=false,120);
  const t=byId(pid).tasks[idx];
  if(!canEdit(t)){ denyEdit(); return; }
  t.due=addDaysISO(orig,days);
  if(LIVE) pUpdate('tasks',t.id,{due:t.due});
  toast(`"${t.t}" moved to ${fmtDue(t.due)}`);
  renderTimeline();
}
function tlMarkerClick(e,pid,idx){ if(tlSuppress) return; openTask(pid,idx); }

/* ===================================================================
   RENDER — Reports
   =================================================================== */
function weekKey(iso){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()-d.getDay()); const pad=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function renderReports(){
  const vis=visibleProjects();
  const allTasks=vis.flatMap(p=>p.tasks.map(t=>({t,p})));
  const t0=todayISO();

  // 1. completed per week (last 10 weeks)
  const weeks=[]; { const d=new Date(TODAY); d.setDate(d.getDate()-d.getDay()); const pad=n=>String(n).padStart(2,'0');
    for(let k=9;k>=0;k--){ const w=new Date(d); w.setDate(w.getDate()-7*k); weeks.push(`${w.getFullYear()}-${pad(w.getMonth()+1)}-${pad(w.getDate())}`); } }
  const doneByWeek={}; weeks.forEach(w=>doneByWeek[w]=0);
  allTasks.forEach(({t})=>{ if(t.s==='done'&&t.completedAt){ const wk=weekKey(t.completedAt.slice(0,10)); if(wk in doneByWeek) doneByWeek[wk]++; } });
  const maxW=Math.max(...Object.values(doneByWeek),1), barW=40;
  const bars=weeks.map((w,ix)=>{ const v=doneByWeek[w], h=Math.round(v/maxW*92), d=new Date(w+'T00:00:00');
    return `<g><rect x="${ix*barW+7}" y="${106-h}" width="${barW-14}" height="${Math.max(h,2)}" rx="3" fill="${v?'var(--accent)':'var(--line)'}"><title>${v} completed · week of ${MONTHS[d.getMonth()]} ${d.getDate()}</title></rect>
      ${v?`<text x="${ix*barW+barW/2}" y="${100-h}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--ink-2)">${v}</text>`:''}
      <text x="${ix*barW+barW/2}" y="122" text-anchor="middle" font-size="8.5" fill="var(--ink-3)">${MONTHS[d.getMonth()]} ${d.getDate()}</text></g>`; }).join('');

  // 2. on-time rate
  const judged=allTasks.filter(({t})=>t.s==='done'&&t.completedAt&&t.due);
  const onTime=judged.filter(({t})=>t.completedAt.slice(0,10)<=t.due).length;
  const rate=judged.length?Math.round(onTime/judged.length*100):null;
  const rateColor=r=>r>=80?'var(--good)':r>=60?'var(--warn)':'var(--crit)';
  const perPerson=Object.keys(TEAM).map(k=>{ const mine=judged.filter(x=>x.t.a===k); const ot=mine.filter(x=>x.t.completedAt.slice(0,10)<=x.t.due).length; return {k, n:mine.length, r:mine.length?Math.round(ot/mine.length*100):0}; }).filter(x=>x.n);

  // 3+4. campaign progress + status donut
  const prog=vis.filter(p=>p.status!=='complete').map(p=>({p,pr:progress(p)})).sort((a,b)=>b.pr.pct-a.pr.pct);
  const stCounts={}; vis.forEach(p=>stCounts[p.status]=(stCounts[p.status]||0)+1);
  const donutColors={active:'var(--accent)',planning:'var(--ink-3)',review:'var(--warn)',complete:'var(--good)'};
  const stLabel={active:'Active',planning:'In planning',review:'Under review',complete:'Completed'};
  const totalC=vis.length||1, C=2*Math.PI*40; let acc=0;
  const donutSegs=Object.keys(donutColors).filter(k=>stCounts[k]).map(k=>{ const frac=stCounts[k]/totalC;
    const seg=`<circle r="40" cx="60" cy="60" fill="none" stroke="${donutColors[k]}" stroke-width="15" stroke-dasharray="${(frac*C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc*C).toFixed(2)}" transform="rotate(-90 60 60)"><title>${stLabel[k]}: ${stCounts[k]}</title></circle>`;
    acc+=frac; return seg; }).join('');

  // 5. workload stacked + overdue
  const wl=Object.keys(TEAM).map(k=>{ const c={todo:0,progress:0,blocked:0,review:0};
    allTasks.forEach(({t})=>{ if(t.a===k&&c[t.s]!=null)c[t.s]++; });
    return {k,c,total:c.todo+c.progress+c.blocked+c.review}; });
  const wlMax=Math.max(...wl.map(x=>x.total),1);
  const overdue=allTasks.filter(({t})=>t.due&&t.due<t0&&t.s!=='done');
  const odByCamp={}, odByA={};
  overdue.forEach(({t,p})=>{ odByCamp[p.name]=(odByCamp[p.name]||0)+1; odByA[t.a]=(odByA[t.a]||0)+1; });

  // 6. pipeline by motion
  const pipe={recruit:0,grow:0,retain:0};
  vis.filter(p=>p.status==='active').forEach(p=>{ if(pipe[p.motion]!=null) pipe[p.motion]+=parseValue(p.value); });
  const pipeSum=Object.values(pipe).reduce((a,b)=>a+b,0), pipeMax=Math.max(...Object.values(pipe),1);
  const motionColor={recruit:'var(--recruit)',grow:'var(--grow)',retain:'var(--retain)'};

  document.getElementById('reports-body').innerHTML=`
  <div class="card rep"><div class="card-h"><h3>Tasks completed per week</h3><span class="page-sub" style="margin-left:auto">last 10 weeks</span></div>
    <div style="padding:4px 14px 12px"><svg viewBox="0 0 400 128" width="100%">${bars}</svg></div></div>

  <div class="card rep"><div class="card-h"><h3>On-time completion</h3><span class="page-sub" style="margin-left:auto">${judged.length} dated completions</span></div>
    <div style="padding:2px 18px 16px">
      <div class="num" style="font-size:38px;font-weight:760;letter-spacing:-1px;color:${rate==null?'var(--ink-3)':rateColor(rate)}">${rate==null?'—':rate+'%'}</div>
      <div class="page-sub" style="margin-bottom:12px">${rate==null?'Fills in as dated tasks get completed.':'finished on or before their due date'}</div>
      ${perPerson.map(x=>`<div class="wl-row">${av(x.k)}<div style="width:106px;font-weight:600">${esc(TEAM[x.k].name)}</div><div class="wl-bar"><span style="width:${x.r}%;background:${rateColor(x.r)}"></span></div><span class="num" style="width:74px;text-align:right;font-weight:700">${x.r}% <span style="color:var(--ink-3);font-weight:600">(${x.n})</span></span></div>`).join('')}
    </div></div>

  <div class="card rep"><div class="card-h"><h3>Campaign progress</h3><span class="page-sub" style="margin-left:auto">open campaigns</span></div>
    <div style="padding:2px 18px 16px">${prog.map(({p,pr})=>`<div class="wl-row" style="cursor:pointer" onclick="openProject('${p.id}')"><div style="width:170px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(p.name)}">${esc(p.name)}</div><div class="wl-bar"><span style="width:${pr.pct}%;background:${projStatus(p)==='atrisk'?'var(--crit)':'var(--accent)'}"></span></div><span class="num" style="width:76px;text-align:right;font-weight:700">${pr.pct}% <span style="color:var(--ink-3);font-weight:600">${pr.done}/${pr.total}</span></span></div>`).join('')||'<div class="att-empty">No open campaigns.</div>'}</div></div>

  <div class="card rep"><div class="card-h"><h3>Campaigns by status</h3><span class="page-sub" style="margin-left:auto">${vis.length} campaigns</span></div>
    <div style="padding:10px 18px 16px;display:flex;align-items:center;gap:26px;flex-wrap:wrap">
      <svg viewBox="0 0 120 120" width="130" height="130">${donutSegs}<text x="60" y="67" text-anchor="middle" font-size="24" font-weight="700" fill="var(--ink)">${vis.length}</text></svg>
      <div>${Object.keys(donutColors).filter(k=>stCounts[k]).map(k=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;font-weight:600"><span style="width:10px;height:10px;border-radius:3px;background:${donutColors[k]};flex:none"></span>${stLabel[k]} <span class="num" style="color:var(--ink-3)">· ${stCounts[k]}</span></div>`).join('')}</div>
    </div></div>

  <div class="card rep"><div class="card-h"><h3>Open work by person</h3><span class="page-sub" style="margin-left:auto">by status</span></div>
    <div style="padding:2px 18px 16px">
      ${wl.map(x=>`<div class="wl-row">${av(x.k)}<div style="width:106px;font-weight:600">${esc(TEAM[x.k].name)}</div><div class="wl-bar" style="display:flex;overflow:hidden">${['todo','progress','blocked','review'].map(s=>x.c[s]?`<span style="display:block;height:100%;width:${x.c[s]/wlMax*100}%;background:${STATUS[s].dot}" title="${STATUS[s].label}: ${x.c[s]}"></span>`:'').join('')}</div><span class="num" style="width:26px;text-align:right;font-weight:700">${x.total}</span></div>`).join('')}
      <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">${['todo','progress','blocked','review'].map(s=>`<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:650;color:var(--ink-3)"><span style="width:8px;height:8px;border-radius:2px;background:${STATUS[s].dot}"></span>${STATUS[s].label}</span>`).join('')}</div>
    </div></div>

  <div class="card rep"><div class="card-h"><h3>Overdue</h3><span class="pill ${overdue.length?'crit':'good'} plain" style="margin-left:auto">${overdue.length} task${overdue.length===1?'':'s'}</span></div>
    <div style="padding:2px 18px 16px">
      ${overdue.length?`<div class="bp-head" style="padding:8px 0 2px">By campaign</div>${Object.entries(odByCamp).sort((a,b)=>b[1]-a[1]).map(([n,c])=>`<div class="wl-row" style="padding:7px 0"><div style="flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n)}</div><span class="num" style="font-weight:700;color:var(--crit)">${c}</span></div>`).join('')}
      <div class="bp-head" style="padding:12px 0 2px">By person</div>${Object.entries(odByA).sort((a,b)=>b[1]-a[1]).map(([k,c])=>`<div class="wl-row" style="padding:7px 0">${av(k)}<div style="flex:1;font-weight:600">${esc(teamName(k))}</div><span class="num" style="font-weight:700;color:var(--crit)">${c}</span></div>`).join('')}`
      :'<div class="att-empty" style="padding-top:8px">Nothing is overdue right now.</div>'}
    </div></div>

  <div class="card rep" style="grid-column:1 / -1"><div class="card-h"><h3>Active pipeline by motion</h3><span class="page-sub" style="margin-left:auto">${fmtMoney(pipeSum)} projected across active campaigns</span></div>
    <div style="padding:2px 18px 16px">${Object.keys(pipe).map(m=>`<div class="wl-row"><span class="motion ${m}" style="width:74px;text-align:center">${m}</span><div class="wl-bar"><span style="width:${Math.round(pipe[m]/pipeMax*100)}%;background:${motionColor[m]}"></span></div><span class="num" style="width:70px;text-align:right;font-weight:700">${fmtMoney(pipe[m])}</span></div>`).join('')}</div></div>`;
}

/* ---------- Filter select options (members are static per session) ---------- */
function fillFilterOptions(){
  const mem = k => Object.keys(TEAM).map(c=>`<option value="${c}">${esc(TEAM[c].name)}</option>`).join('');
  document.getElementById('board-fa').innerHTML = `<option value="">All assignees</option>`+mem();
  document.getElementById('cal-fa').innerHTML   = `<option value="">All assignees</option>`+mem();
  document.getElementById('proj-fo').innerHTML  = `<option value="">All owners</option>`+mem();
  document.getElementById('tl-fo').innerHTML    = `<option value="">All owners</option>`+mem();
  document.getElementById('tl-fa').innerHTML    = `<option value="">All assignees</option>`+mem();
  document.getElementById('board-fa').value=FILT.board.a; document.getElementById('cal-fa').value=FILT.cal.a; document.getElementById('proj-fo').value=FILT.proj.owner;
  document.getElementById('tl-fo').value=FILT.tl.owner; document.getElementById('tl-fa').value=FILT.tl.a;
}

/* ===================================================================
   Search
   =================================================================== */
function runSearch(q){
  const box=document.getElementById('search-results');
  q=(q||'').trim().toLowerCase();
  if(q.length<2){ box.classList.remove('open'); return; }
  const hits=[];
  visibleProjects().forEach(p=>{
    if([p.name,p.desc,p.segment,p.solution].some(f=>f&&f.toLowerCase().includes(q)))
      hits.push({kind:'camp', label:p.name, sub:`${p.segment||''} · ${STATUS_PILL[projStatus(p)][1]}`, click:`openProject('${p.id}')`});
  });
  visibleProjects().forEach(p=>p.tasks.forEach((t,i)=>{
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
const titles = { dashboard:['Dashboard','Demand Gen campaign portfolio'], mytasks:['My Tasks',"Everything assigned to you, grouped by when it's due"], board:['Board','Kanban view · drag tasks across stages'], projects:['Campaigns','All Demand Gen campaigns and their progress'], project:['Campaign','Tasks, owner & assignments'], calendar:['Calendar','Every task on its due date'], timeline:['Timeline','Campaigns and tasks across time'], reports:['Reports','Completion, workload & pipeline at a glance'], team:['Team','People, sign-ins & permissions'], templates:['Templates','Reusable campaign playbooks'], roadblocks:['Roadblocks','Tasks blocked by upstream work or inputs'] };
function show(view){
  if((view==='team'||view==='templates') && !isAdminMe()) view='dashboard';
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
  if(view==='timeline') renderTimeline();
  if(view==='reports') renderReports();
  if(view==='team') renderTeam();
  if(view==='templates') renderTemplates();
  if(view==='roadblocks') renderRoadblocks();
  window.scrollTo(0,0);
}
function refreshCounts(){
  const vis=visibleProjects();
  document.getElementById('c-mine').textContent = vis.flatMap(p=>p.tasks).filter(t=>t.a===ME&&t.s!=='done').length;
  document.getElementById('c-proj').textContent = vis.filter(p=>p.status!=='complete').length;
  document.getElementById('c-rb').textContent = vis.flatMap(p=>p.tasks).filter(t=>t.s==='blocked').length;
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
  const eligible = Object.keys(TEAM).filter(k=>TEAM[k].isApprover || TEAM[k].appRole==='admin' || TEAM[k].appRole==null);
  document.getElementById('cm-approver').innerHTML = `<option value="">None — no approval needed</option>`+eligible.map(k=>`<option value="${k}">${esc(TEAM[k].name)} (${esc(TEAM[k].role||'')})</option>`).join('');
  document.getElementById('cm-approver').value = p ? (p.approverId||'') : '';
  document.getElementById('cm-approver').closest('.mfield').style.display = HAS_APPR ? '' : 'none';
  document.getElementById('cm-delete').style.display = (p && isAdminMe()) ? '' : 'none';
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
  document.getElementById('cm-launchdate').value = p ? (p.launchDate||'') : '';
  document.getElementById('cm-audience').value = p ? (p.audience||'') : '';
  document.getElementById('cm-blocker').value  = p ? (p.blocker||'') : '';
  // template picker + Excel import: creation only
  document.getElementById('cm-tpl-wrap').style.display = p ? 'none' : '';
  document.getElementById('cm-import-wrap').style.display = p ? 'none' : '';
  document.getElementById('cm-template').innerHTML = `<option value="">Blank campaign</option>`+TEMPLATES.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
  document.getElementById('cm-template').value = '';
  document.getElementById('cm-ldate').value = '';
  applyTemplateChoice();
  document.getElementById('campaign-modal').classList.add('open');
  document.getElementById('modal-ov').classList.add('open');
  document.getElementById('cm-name').focus();
}
function tplById(id){ return TEMPLATES.find(t=>String(t.id)===String(id)); }
function roleDefault(role){
  const byRole=Object.keys(TEAM).find(k=>TEAM[k].role===role);
  return byRole || ME;
}
function applyTemplateChoice(){
  const tpl = tplById(document.getElementById('cm-template').value);
  document.getElementById('cm-ldate-wrap').style.display = tpl ? '' : 'none';
  document.getElementById('cm-launchdate').closest('.mfield').style.display = tpl ? 'none' : ''; // template flow has its own launch date input
  const rm=document.getElementById('cm-rolemap');
  rm.style.display = tpl ? '' : 'none';
  if(!tpl){ rm.innerHTML=''; return; }
  const d=tpl.defaults||{};
  if(d.motion) document.getElementById('cm-motion').value=d.motion;
  if(d.segment) document.getElementById('cm-segment').value=d.segment;
  if(d.solution) document.getElementById('cm-solution').value=d.solution;
  if(d.pipeline) document.getElementById('cm-pipeline').value=d.pipeline;
  const roles=[...new Set(tpl.steps.map(s=>s.role).filter(Boolean))];
  rm.innerHTML = `<label>Who fills each role for this campaign</label>`+roles.map(r=>
    `<div class="rolemap-row"><span class="rl">${esc(r)}</span><select data-role="${esc(r)}">${Object.keys(TEAM).map(k=>`<option value="${k}" ${k===roleDefault(r)?'selected':''}>${esc(teamName(k))}</option>`).join('')}</select></div>`).join('');
}
function closeModal(){
  editingProject = null; editingTpl = null; importData = null;
  document.getElementById('campaign-modal').classList.remove('open');
  document.getElementById('user-modal').classList.remove('open');
  document.getElementById('tpl-modal').classList.remove('open');
  document.getElementById('import-modal').classList.remove('open');
  document.getElementById('modal-ov').classList.remove('open');
}

/* ---------- Archive / delete campaign (admins) ---------- */
async function archiveCampaign(pid, flag){
  if(!isAdminMe()){ toast('Admins only', true); return; }
  if(!HAS_ARCH){ toast('Run db/upgrade-fundamentals.sql first to enable archiving', true); return; }
  const p=byId(pid);
  p.archived=!!flag;
  if(LIVE) await pUpdate('projects', pid, {archived:!!flag});
  renderBoardPicker(); refreshCounts();
  if(flag){
    currentFilter='active';
    document.querySelectorAll('#proj-filter button').forEach(x=>x.classList.toggle('on',x.dataset.f==='active'));
    show('projects');
    showToast(`"${p.name}" archived`, {action:'Undo', onAction:()=>archiveCampaign(pid,false)});
  } else {
    if(isView('project') && currentProject===pid) renderProjectDetail(); else show(currentView);
    toast(`"${p.name}" restored`);
  }
}
async function deleteCampaign(){
  if(!isAdminMe() || !editingProject) return;
  const p=byId(editingProject);
  if(!confirm(`Delete "${p.name}" and ALL of its ${p.tasks.length} tasks, files and history?`)) return;
  if(!confirm('This cannot be undone. Really delete the whole campaign?')) return;
  if(LIVE){
    const paths=[...(p._files||[]), ...p.tasks.flatMap(t=>t._links||[])].filter(l=>l.path).map(l=>l.path);
    const {error}=await sb.from('projects').delete().eq('id',p.id);
    if(error){ toast('Delete failed: '+error.message, true); return; }
    if(paths.length){ try{ sb.storage.from('pmpm-files').remove(paths); }catch(_){} }
  }
  PROJECTS.splice(PROJECTS.indexOf(p),1);
  if(currentProject===p.id) currentProject=null;
  closeModal(); closeDrawer();
  renderBoardPicker(); refreshCounts(); show('projects');
  toast('Campaign deleted');
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
      <td><label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);cursor:pointer"><input type="checkbox" ${m.isApprover?'checked':''} onchange="updateMember('${k}','is_approver',this.checked)" style="accent-color:var(--accent);width:15px;height:15px" />Can approve</label></td>
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
  const localKey = field==='app_role' ? 'appRole' : field==='is_approver' ? 'isApprover' : field;
  TEAM[k][localKey] = field==='is_approver' ? !!val : (val || null);
  if(LIVE) await pUpdate('members', k, {[field]: field==='is_approver' ? !!val : (val || null)});
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
  const isApprover=document.getElementById('um-approver').value==='yes';
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
    const memberRow={id:init, name, role:title||null, color, email, app_role:appRole, sort:Object.keys(TEAM).length};
    if(HAS_APPR) memberRow.is_approver=isApprover;
    const d=await pInsert('members', memberRow);
    if(!d) return;
  }
  TEAM[init]={name, role:title, color, email, appRole, isApprover};
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
  const ldInput = document.getElementById('cm-launchdate').value || null;
  const apprVal = HAS_APPR ? (document.getElementById('cm-approver').value || null) : null;
  // Approval gate: with an approver designated, a campaign can only be Active
  // once its latest approval event is 'approved' (the DB trigger enforces this too).
  if(fields.status==='active' && apprVal){
    const p0 = editingProject ? byId(editingProject) : null;
    const approvedNow = p0 && p0.approverId===apprVal && approvalState(p0)==='approved';
    if(!approvedNow){
      fields.status='planning';
      toast('Saved as In Planning — this campaign needs approval before it can go Active');
    }
  }
  if(editingProject){
    const p = byId(editingProject);
    const apprChanged = HAS_APPR && apprVal !== (p.approverId||null);
    if(HAS_LDATE) fields.launch_date = ldInput;
    if(HAS_APPR) fields.approver_id = apprVal;
    if(LIVE) await pUpdate('projects', p.id, fields);
    Object.assign(p, { name:fields.name, desc:fields.description, owner:fields.owner_id, status:fields.status,
      motion:fields.motion, segment:fields.segment, solution:fields.solution, pipeline:fields.pipeline,
      value:fields.value, launch:fields.launch, launchDate:ldInput, audience:fields.audience, blocker:fields.blocker,
      approverId: HAS_APPR ? apprVal : p.approverId });
    if(apprChanged && apprVal){
      await recordApproval(p.id,'submitted');
      notify(apprVal, `"${p.name}" needs your approval.`, p.id, null);
    }
    closeModal(); renderBoardPicker(); refreshCounts();
    if(isView('project') && currentProject===p.id) renderProjectDetail(); else show(currentView);
    toast('Campaign updated');
  } else {
    const tpl = tplById(document.getElementById('cm-template').value);
    const ldate = document.getElementById('cm-ldate').value || null;
    const roleMap = {};
    document.querySelectorAll('#cm-rolemap select[data-role]').forEach(s=>roleMap[s.dataset.role]=s.value);
    if(tpl && ldate && !fields.launch) fields.launch = 'Launches '+fmtDue(ldate);
    const launchDate = tpl ? (ldate||ldInput) : ldInput;
    if(HAS_LDATE) fields.launch_date = launchDate;
    if(HAS_APPR) fields.approver_id = apprVal;
    let id;
    if(LIVE){ const d=await pInsert('projects', {...fields, sort:PROJECTS.length}); if(!d) return; id=d.id; }
    else id='d'+(++demoSeq)+Date.now();
    PROJECTS.push({ id, name:fields.name, desc:fields.description, owner:fields.owner_id, status:fields.status,
      motion:fields.motion, segment:fields.segment, solution:fields.solution, pipeline:fields.pipeline,
      value:fields.value, launch:fields.launch, launchDate, audience:fields.audience, blocker:fields.blocker,
      approverId: apprVal, _approvals:[], tasks:[], _files:[] });
    closeModal();
    if(apprVal){
      await recordApproval(id,'submitted');
      notify(apprVal, `New campaign "${fields.name}" needs your approval.`, id, null);
    }
    if(tpl){ toast('Building campaign from template…'); await instantiateTemplate(tpl, id, ldate, roleMap); }
    renderBoardPicker(); refreshCounts(); openProject(id);
    toast(tpl ? `Campaign created from "${tpl.name}" — ${byId(id).tasks.length} tasks added` : 'Campaign created');
  }
}

/* ===================================================================
   Members sidebar / identity
   =================================================================== */
function renderMe(){
  const m=TEAM[ME]||{name:MY_EMAIL||'Not signed in', role:'Not linked to a team member', color:'#7688A0'};
  document.getElementById('sidebar-foot').innerHTML = `
    <div class="me"><div class="avatar" style="background:${m.color}">${esc(ME||'?')}</div><div style="flex:1"><div class="me-name">${esc(m.name)} ${isAdminMe()?'<span class="tag" style="font-size:9.5px;padding:1px 6px">ADMIN</span>':''}</div><div class="me-role">${esc(m.role)}</div></div>
    ${LIVE?`<button class="icon-btn" title="Sign out" onclick="signOut()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`:''}</div>
    ${!LIVE?`<button class="whoami" onclick="identify()">Viewing as ${esc(m.name)} · switch</button>`:''}`;
  document.getElementById('nav-team').style.display = isAdminMe() ? '' : 'none';
  document.getElementById('nav-tpl').style.display  = isAdminMe() ? '' : 'none';
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
  MY_EMAIL = email;
  const byEmail=Object.keys(TEAM).find(k=>TEAM[k].email && email && TEAM[k].email.toLowerCase()===email.toLowerCase());
  if(LIVE){
    // Never fall back to another member: the database identifies people by their
    // sign-in email, so guessing here would show controls the DB will reject.
    ME = byEmail || null;
  } else {
    const saved=localStorage.getItem('pmpm_member');
    ME = byEmail || (saved && TEAM[saved] ? saved : (TEAM['RM'] ? 'RM' : Object.keys(TEAM)[0]));
  }
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
async function forgotPassword(){
  if(!LIVE) return;
  const email=document.getElementById('auth-email').value.trim();
  const errEl=document.getElementById('auth-err');
  if(!email){ errEl.style.color=''; errEl.textContent='Type your work email above first, then click Forgot password.'; return; }
  const {error}=await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin+location.pathname});
  errEl.style.color = error ? '' : 'var(--good)';
  errEl.textContent = error ? error.message : 'Reset link sent — check your email (may take a minute).';
}
function showRecoveryForm(){
  showAuth();
  document.getElementById('signin-form').style.display='none';
  document.getElementById('auth-toggle').style.display='none';
  document.getElementById('auth-forgot').style.display='none';
  document.getElementById('auth-title').textContent='Set a new password';
  document.getElementById('reset-form').style.display='';
}
async function doPasswordReset(e){
  e.preventDefault();
  const pw=document.getElementById('reset-pw').value;
  const errEl=document.getElementById('reset-err');
  const {error}=await sb.auth.updateUser({password:pw});
  if(error){ errEl.textContent=error.message; return; }
  errEl.style.color='var(--good)'; errEl.textContent='Password updated — signing you in…';
  setTimeout(()=>location.reload(), 900);
}

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
  if(!ME){
    document.getElementById('unlinked-email').textContent = MY_EMAIL || 'your email';
    document.getElementById('unlinked-banner').style.display='flex';
  }
}
async function boot(){
  // wire nav + controls
  document.getElementById('nav').addEventListener('click',e=>{ const it=e.target.closest('.nav-item'); if(!it||it.classList.contains('disabled')||!it.dataset.view) return; show(it.dataset.view); });
  document.querySelectorAll('[data-jump]').forEach(el=>el.addEventListener('click',()=>show(el.dataset.jump)));
  document.getElementById('proj-filter').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; currentFilter=b.dataset.f; document.querySelectorAll('#proj-filter button').forEach(x=>x.classList.toggle('on',x===b)); renderProjects(currentFilter); });
  document.getElementById('tl-mode').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; tlMode=b.dataset.m; document.querySelectorAll('#tl-mode button').forEach(x=>x.classList.toggle('on',x===b)); renderTimeline(); });
  document.getElementById('mode-badge').textContent = LIVE ? 'Live' : 'Demo';
  document.getElementById('mode-badge').className = 'mode-badge '+(LIVE?'live':'demo');
  if(!LIVE) document.getElementById('demo-banner').style.display='flex';

  if(LIVE){
    sb.auth.onAuthStateChange((event)=>{ if(event==='PASSWORD_RECOVERY') showRecoveryForm(); });
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
