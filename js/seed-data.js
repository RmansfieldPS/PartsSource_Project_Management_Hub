/* Always On seed data — the real PartsSource Demand Gen campaigns + team.
   Used to run the app in demo mode, and to import into Supabase the first time.
   Source: "UPDATED Demand Gen Campaign Priorities May 2026.xlsx". */
window.PMPM_SEED = {
  members: [
    { id: 'CG', name: 'Cole G.',     role: 'Campaign Manager',      color: '#0A6CBF', email: null, app_role: 'user' },
    { id: 'BO', name: 'Baxter O.',   role: 'Web Manager',           color: '#0E9AA6', email: null, app_role: 'user' },
    { id: 'RM', name: 'Ryan M.',     role: 'Lifecycle Manager',     color: '#8A4FC2', email: 'ryan.mansfield@partssource.com', app_role: 'admin' },
    { id: 'MD', name: 'Meredith D.', role: 'Marketing Manager',     color: '#C77A0A', email: null, app_role: 'user' },
    { id: 'NB', name: 'Nora B.',     role: 'Marketing Manager',     color: '#1E9E62', email: null, app_role: 'user' },
    { id: 'MH', name: 'Mari H.',     role: 'Director of Demand Gen', color: '#D64545', email: null, app_role: 'user', is_approver: true }
  ],
  owner: { depot:'CG', welcome:'RM', crosssell:'MD', proparts:'NB', bedscables:'CG', renewal:'RM', mktplace:'MD', ambulatory:'NB', proservice:'MH', top5:'MD', winback:'NB', rhtp:'MH', 'tn-webinar':'MD', 'blitz-ka':'MH', 'blitz-pro':'CG' },
  projects: [
    { id:'depot', name:'Depot: Grow Existing ENT Accounts', desc:'3-phase SpB growth play — Activate / Educate / Grow', segment:'Enterprise · Parts', motion:'grow', solution:'Depot', pipeline:'Stage 3', value:'$8.9M GMV', audience:'151 PRO accounts', launch:'May 30 – Jul 25', status:'active', tasks:[
      {t:'Finalize SpB tier segmentation', a:'CG', due:'2026-05-09', pr:'med', s:'done'},
      {t:'Build 5-email sequence by SpB tier', a:'RM', due:'2026-05-23', pr:'high', s:'done'},
      {t:"Cincinnati Children's hero case study", a:'MD', due:'2026-05-20', pr:'med', s:'done'},
      {t:'Launch Depot landing page', a:'BO', due:'2026-05-30', pr:'high', s:'done'},
      {t:'Phase 2 LinkedIn post series', a:'NB', due:'2026-06-27', pr:'med', s:'done'},
      {t:'In-platform Depot banners', a:'BO', due:'2026-07-03', pr:'med', s:'done'},
      {t:'Brown Briefcase email launch', a:'RM', due:'2026-07-29', pr:'high', s:'progress', blocks:'Phase 3 reporting'},
      {t:'Phase 3 Sales/CSM outreach enablement', a:'CG', due:'2026-08-01', pr:'high', s:'progress'} ]},
    { id:'welcome', name:'All Welcome Flow Onboarding', desc:'Always-on 5-email lifecycle driving first purchase & ecosystem awareness', segment:'Marketplace', motion:'recruit', solution:'Lifecycle', pipeline:'Stage 2', value:'$500K', audience:'57,541 EPF registrants', launch:'Always-on · since Feb', status:'active', tasks:[
      {t:'Build 5-email automated welcome series', a:'RM', due:'2026-02-15', pr:'high', s:'done'},
      {t:'Pop-up & footer capture', a:'BO', due:'2026-02-20', pr:'med', s:'done'},
      {t:'Review Welcome Flow 180-day optimization', a:'RM', due:'2026-07-31', pr:'med', s:'progress'},
      {t:'Build behavior-based triggers', a:'RM', due:'2026-08-04', pr:'med', s:'todo'},
      {t:'Refresh case study content block', a:'MD', due:'2026-08-08', pr:'low', s:'todo'} ]},
    { id:'crosssell', name:'Cross-Sell Parts to Service Promo', desc:'1–2 months free Remi offer to existing parts customers', segment:'Key Accounts · Services', motion:'recruit', solution:'Remi Service', pipeline:'Stage 5', value:'$575K', audience:'115 company leads', launch:'Mid-June', status:'active', tasks:[
      {t:'Build promo landing page', a:'BO', due:'2026-06-05', pr:'high', s:'done'},
      {t:'Awareness email + ads', a:'MD', due:'2026-06-11', pr:'high', s:'done'},
      {t:'Richmond Univ Med Center proof point', a:'NB', due:'2026-06-09', pr:'med', s:'done'},
      {t:'Weekly MQL conversion review', a:'CG', due:'2026-08-04', pr:'med', s:'progress'},
      {t:'Evaluate 1–2 month free offer performance', a:'MD', due:'2026-08-08', pr:'med', s:'todo'} ]},
    { id:'proparts', name:'PRO Parts High-Touch ABM Series', desc:'3-email ABM reframing PS to industry holdouts with exec dinner invite', segment:'Enterprise · Parts', motion:'recruit', solution:'PRO Parts', pipeline:'Stage 5', value:'$5M if closed', audience:'150 health systems', launch:'Early July', status:'active', tasks:[
      {t:'Finalize 3-email Parts Pro series', a:'NB', due:'2026-07-01', pr:'high', s:'done'},
      {t:'PRO list finalized & loaded', a:'CG', due:'2026-07-15', pr:'med', s:'done'},
      {t:'Email 1 of 3 launch', a:'NB', due:'2026-07-17', pr:'high', s:'done'},
      {t:'T2T Roundtable exec dinner invite (video)', a:'MD', due:'2026-08-08', pr:'med', s:'progress'},
      {t:'Email 2 of 3 launch', a:'NB', due:'2026-08-14', pr:'high', s:'todo'},
      {t:'Progress report to ELT', a:'MH', due:'2026-08-04', pr:'low', s:'todo'} ]},
    { id:'bedscables', name:'Beds & Cables 15% Off Promo', desc:'Two-phase lift-isolation promo: email + popup, then guided selling', segment:'Key Accounts · Parts', motion:'recruit', solution:'Parts', pipeline:'Stage 5', value:'+$15–25K GMV', audience:'500 accounts', launch:'Jul 1 – Aug 29', status:'active', tasks:[
      {t:'Set up 6 rotating discount codes', a:'CG', due:'2026-06-28', pr:'high', s:'done'},
      {t:'Email D0 launch', a:'RM', due:'2026-07-01', pr:'high', s:'done'},
      {t:'Pop-up D8 launch', a:'BO', due:'2026-07-08', pr:'med', s:'done'},
      {t:'Phase 1 baseline tracking dashboard', a:'CG', due:'2026-08-01', pr:'med', s:'progress'},
      {t:'Guided Selling calls (Phase 2)', a:'MD', due:'2026-08-01', pr:'high', s:'todo'} ]},
    { id:'renewal', name:'Remi Renewal — 5-Series Lock In', desc:'Renewal drip at 90/75/60/30/7 days with AM outreach & ROI proof', segment:'Key Accounts · Services', motion:'retain', solution:'Remi Service', pipeline:'Stage 5', value:'$1.06M', audience:'4,243 renewals', launch:'Always-on · 90-day trigger', status:'active', blocker:'Salesforce field variable & audience validation — Justin B.', tasks:[
      {t:'Build 5-email renewal drip', a:'RM', due:'2026-06-20', pr:'high', s:'done'},
      {t:'Reps add accounts to campaign', a:'CG', due:'2026-06-28', pr:'med', s:'done'},
      {t:'QA renewal drip send list', a:'RM', due:'2026-07-31', pr:'high', s:'progress'},
      {t:'Finalize renewal ROI email copy', a:'RM', due:'2026-08-02', pr:'high', s:'blocked', blockedBy:'Salesforce field variable & audience validation — Justin B.'},
      {t:'Revise & relaunch series to target accounts', a:'MD', due:'2026-08-06', pr:'med', s:'todo'} ]},
    { id:'mktplace', name:'Upsell Marketplace to Key Accounts', desc:'4 modality plays: anesthesia, patient monitoring, defib, batteries', segment:'Key Accounts · Parts', motion:'recruit', solution:'Parts', pipeline:'Stage 5', value:'$50K lift', audience:'1,000 accounts', launch:'Early July', status:'active', blocker:'Salesforce audience set up — Daniel F. & Alex Gillette', tasks:[
      {t:'Build 4 modality plays', a:'MD', due:'2026-06-20', pr:'med', s:'done'},
      {t:'Landing pages live', a:'BO', due:'2026-06-10', pr:'high', s:'done'},
      {t:'Launch Upsell Marketplace campaign', a:'BO', due:'2026-07-08', pr:'high', s:'blocked', blockedBy:'Salesforce audience set up — Daniel F. & Alex Gillette', blocks:'campaign launch'},
      {t:'SDR follow-up sequence', a:'CG', due:'2026-08-12', pr:'med', s:'todo'} ]},
    { id:'ambulatory', name:'Ambulatory: PS Value vs DIY', desc:'Segment-tailored messaging on uptime & limited biomed staff vs. DIY', segment:'Enterprise · Services', motion:'recruit', solution:'PRO Service', pipeline:'Stage 5', value:'$1.13M', audience:'ASC / outpatient', launch:'Q2 · Phase 1 live', status:'active', blocker:'Ambulatory CRM list + PMM messaging input', tasks:[
      {t:'Phase 1 segment-specific outreach', a:'NB', due:'2026-06-01', pr:'high', s:'done'},
      {t:'Ambulatory-tailored messaging', a:'MD', due:'2026-06-05', pr:'med', s:'done'},
      {t:'Launch Ambulatory Phase 2', a:'NB', due:'2026-08-08', pr:'high', s:'blocked', blockedBy:'Ambulatory CRM list + PMM messaging input'},
      {t:'Map Ambulatory Phase 2 nurture', a:'RM', due:'2026-08-18', pr:'low', s:'todo'} ]},
    { id:'proservice', name:'Full-Funnel PRO Service ABM', desc:'Enterprise ABM for PRO Service adoption across named accounts', segment:'Enterprise · Acute', motion:'recruit', solution:'PRO Service', pipeline:'Stage 4', value:'$600K', audience:'20 named accounts', launch:'Plan by Jun 22', status:'planning', blocker:'Target account list — Sales/RevOps', tasks:[
      {t:'Craft strategic marketing plan', a:'MH', due:'2026-06-22', pr:'high', s:'done'},
      {t:'Identify target account list', a:'CG', due:'2026-08-05', pr:'high', s:'progress'},
      {t:'Start PRO Service ABM outreach', a:'CG', due:'2026-08-15', pr:'high', s:'blocked', blockedBy:'Target account list — Sales/RevOps'},
      {t:'Exec ROI deck production (video)', a:'MD', due:'2026-08-01', pr:'med', s:'todo'} ]},
    { id:'top5', name:'Top 5 Biomed & Top 5 Imaging Modality', desc:'Modality-focused campaigns with SDR follow-up & customer stories', segment:'Key Accounts · Parts', motion:'recruit', solution:'Parts', pipeline:'Stage 5', value:'$1.01M', audience:'150 accts >$100K', launch:'Aug 31', status:'planning', blocker:'Audience size & priority direction — Mari H.', approver:'MH', tasks:[
      {t:'Define modality campaign themes', a:'MD', due:'2026-07-20', pr:'med', s:'done'},
      {t:'Build Top 5 Biomed & Imaging assets', a:'MD', due:'2026-08-20', pr:'high', s:'blocked', blockedBy:'Audience size & priority direction — Mari H.'},
      {t:'SDR follow-up + customer stories', a:'NB', due:'2026-08-25', pr:'med', s:'todo'},
      {t:'Webinar / content support', a:'NB', due:'2026-08-29', pr:'low', s:'todo'} ]},
    { id:'winback', name:'OEM Warranty Win-Back', desc:'Reactivate churned accounts as OEM warranties lapse', segment:'All End Markets', motion:'recruit', solution:'Remi & PRO Service', pipeline:'Stage 5', value:'$5.4M scope', audience:'Churned customers', launch:'Aug 26', status:'review', blocker:'SFIDs from RevOps contact append', tasks:[
      {t:'Confirm scope with Rev Ops', a:'MH', due:'2026-07-25', pr:'med', s:'done'},
      {t:'Kick off OEM Win-Back sequence', a:'NB', due:'2026-08-20', pr:'high', s:'blocked', blockedBy:'SFIDs from RevOps contact append'},
      {t:'GovSpend replacement-equipment validation', a:'CG', due:'2026-08-18', pr:'med', s:'todo'} ]},
    { id:'rhtp', name:'RHTP Federal Funded Equipment', desc:'Position lifecycle & managed services as eligible RHTP capital investment', segment:'Rural Health / State', motion:'retain', solution:'Remi Service', pipeline:'Stage 5', value:'$5–20M', audience:'1,300+ CAHs', launch:'FY2026', status:'planning', tasks:[
      {t:'Register for state program event', a:'MH', due:'2026-08-01', pr:'med', s:'progress'},
      {t:'Assess contact data coverage', a:'NB', due:'2026-08-05', pr:'med', s:'todo'},
      {t:'Build RHTP sales materials & ROI calculator', a:'MD', due:'2026-08-22', pr:'high', s:'todo'} ]},
    { id:'tn-webinar', name:'TechNation Webinar — Depot Awareness', desc:'May 20 webinar anchor + follow-up for non-Depot PRO accounts', segment:'Key Accounts · Parts', motion:'recruit', solution:'Depot', pipeline:'Stage 5', value:'$584K GMV', audience:'11 PRO accounts', launch:'Completed May', status:'complete', tasks:[
      {t:'Promote May 20 TechNation webinar', a:'MD', due:'2026-05-06', pr:'high', s:'done'},
      {t:'Post-webinar recording + one-pager follow-up', a:'NB', due:'2026-05-22', pr:'med', s:'done'},
      {t:'CSM qualification calls for non-buyers', a:'CG', due:'2026-05-29', pr:'med', s:'done'} ]},
    { id:'blitz-ka', name:'Q2 Blitz — Key Accounts Air Cover', desc:'Multi-channel air cover blitz across Tier-1 & Tier-2 strategic accounts', segment:'Key Accounts', motion:'recruit', solution:'Remi Service', pipeline:'Stage 1', value:'$5.6M', audience:'22,500 accounts', launch:'Completed Q2', status:'complete', tasks:[
      {t:'Win announcement + newsletter series', a:'MD', due:'2026-05-01', pr:'high', s:'done'},
      {t:'Paid media + LinkedIn + 6Sense retargeting', a:'CG', due:'2026-05-10', pr:'high', s:'done'},
      {t:'New Remi explainer video', a:'BO', due:'2026-05-15', pr:'med', s:'done'},
      {t:'Weekly ELT reporting cadence', a:'MH', due:'2026-06-30', pr:'med', s:'done'} ]},
    { id:'blitz-pro', name:'Q2 Blitz — PRO Service', desc:'PRO Service adoption push across top target accounts', segment:'Enterprise · Acute', motion:'recruit', solution:'PRO Service', pipeline:'Stage 2', value:'$3.6M', audience:'300 accounts', launch:'Completed Q2', status:'complete', tasks:[
      {t:'PRO Service air cover campaign', a:'CG', due:'2026-05-01', pr:'high', s:'done'},
      {t:'IDG email series', a:'NB', due:'2026-05-12', pr:'med', s:'done'},
      {t:'Bi-weekly reporting to ELT', a:'MH', due:'2026-06-30', pr:'med', s:'done'} ]}
  ],
  /* Campaign templates — steps use role slots (matched to members.role),
     offsets in days relative to Launch (L), and dep = index of an earlier step. */
  templates: [
    { id:'tpl-email', name:'Email / Nurture Series',
      description:'Standard multi-touch email campaign: strategy, audience, drafts, LP, QA, staged sends, reporting.',
      defaults:{ motion:'recruit' },
      steps:[
        { t:'Strategy & messaging brief',                   role:'Campaign Manager',       off:-21, pr:'high' },
        { t:'Pull audience list with Salesforce IDs',       role:'Campaign Manager',       off:-14, pr:'high' },
        { t:'Draft email series copy',                      role:'Lifecycle Manager',      off:-10, pr:'high', sub:['Email 1 draft','Email 2 draft','Email 3 draft'] },
        { t:'Build landing page',                           role:'Web Manager',            off:-7,  pr:'high', dep:2 },
        { t:'Build emails in platform & QA',                role:'Lifecycle Manager',      off:-3,  pr:'high', dep:3, sub:['Load audience','QA links & UTMs','Schedule send'] },
        { t:'Launch email 1',                               role:'Lifecycle Manager',      off:0,   pr:'high', dep:4 },
        { t:'Mid-flight performance check',                 role:'Campaign Manager',       off:7,   pr:'med' },
        { t:'Wrap report to ELT',                           role:'Director of Demand Gen', off:14,  pr:'med' } ]},
    { id:'tpl-promo', name:'Promo Campaign',
      description:'Limited-time offer play: codes, LP, email + popup, sales phase 2, lift analysis.',
      defaults:{ motion:'recruit' },
      steps:[
        { t:'Define offer & set up discount codes',         role:'Campaign Manager',       off:-14, pr:'high' },
        { t:'Build promo landing page',                     role:'Web Manager',            off:-7,  pr:'high', dep:0 },
        { t:'Announcement email',                           role:'Lifecycle Manager',      off:0,   pr:'high', dep:1 },
        { t:'Site popup live',                              role:'Web Manager',            off:7,   pr:'med',  dep:1 },
        { t:'Sales/CSM phase-2 handoff',                    role:'Campaign Manager',       off:21,  pr:'med' },
        { t:'Lift analysis & readout',                      role:'Campaign Manager',       off:30,  pr:'med' } ]},
    { id:'tpl-abm', name:'ABM / High-Touch',
      description:'Named-account campaign: target list, exec assets, video, outreach, ELT reporting.',
      defaults:{ motion:'recruit' },
      steps:[
        { t:'Target account list from Sales/RevOps',        role:'Campaign Manager',       off:-21, pr:'high' },
        { t:'Exec messaging & ROI assets',                  role:'Marketing Manager',      off:-10, pr:'high' },
        { t:'Produce exec video invite',                    role:'Marketing Manager',      off:-7,  pr:'med' },
        { t:'Build outreach sequence',                      role:'Lifecycle Manager',      off:-3,  pr:'high', dep:0 },
        { t:'Launch outreach wave 1',                       role:'Lifecycle Manager',      off:0,   pr:'high', dep:3 },
        { t:'Bi-weekly ELT reporting',                      role:'Director of Demand Gen', off:14,  pr:'med' } ]},
    { id:'tpl-event', name:'Event / Webinar',
      description:'Webinar or trade-show play: booking, promo, registration LP, day-of, follow-up, lead handoff.',
      defaults:{ motion:'recruit' },
      steps:[
        { t:'Book event & confirm speakers',                role:'Director of Demand Gen', off:-30, pr:'high' },
        { t:'Registration landing page',                    role:'Web Manager',            off:-21, pr:'high' },
        { t:'Promo email series',                           role:'Lifecycle Manager',      off:-14, pr:'high', dep:1 },
        { t:'Social posts',                                 role:'Marketing Manager',      off:-10, pr:'med',  dep:1 },
        { t:'Day-of run of show',                           role:'Campaign Manager',       off:0,   pr:'high' },
        { t:'Recording + follow-up email',                  role:'Lifecycle Manager',      off:2,   pr:'high', dep:4 },
        { t:'Lead handoff to Sales/CSM',                    role:'Campaign Manager',       off:5,   pr:'high', dep:5 } ]}
  ],
  detail: {
    'depot::Brown Briefcase email launch': {
      desc:'Final email in the Depot Grow sequence — the "Brown Briefcase" creative going to the 44 monthly-buyer segment at <$50 SpB. Feeds Phase 3 (Grow) reporting.',
      sub:[{t:'Build email in platform',done:true},{t:'QA links & UTM tracking',done:true},{t:'Load Phase-3 audience (44 accounts)',done:false},{t:'Schedule 7/29 send',done:false}],
      comments:[
        {a:'CG',x:"Creative approved. Cincinnati Children's proof point is in."},
        {a:'RM',x:'Building in platform now — targeting the 7/29 send.'},
        {a:'RM',x:'Audience load pending the final SpB tier pull.'} ]},
    'renewal::Finalize renewal ROI email copy': {
      desc:'ROI-driven copy for the 5-email renewal drip (90/75/60/30/7 days). Blocked until Salesforce field variables and the audience are validated.',
      sub:[{t:'Draft ROI copy per touch',done:true},{t:'Custom savings-estimate merge fields',done:false},{t:'Validate SF field variables',done:false}],
      comments:[
        {a:'RM',x:'Copy drafted for all 5 touches. Need SF merge fields confirmed.'},
        {a:'MH',x:'Flagged to Justin B. for audience + field validation.'} ]},
    'crosssell::Awareness email + ads': {
      desc:'Awareness email and paid ads for the Simplify Service Management play. "See Remi results" CTA with 1–2 months free.',
      links:[{label:'Cross Sell Parts to Service 1-2 Month Promo.pptm', sub:'SharePoint · PowerPoint', url:'https://mypartssource.sharepoint.com/:p:/r/sites/MarketingTeamSite/_layouts/15/Doc.aspx?sourcedoc=%7BB69FA60B-BD6E-4BF0-9B94-CCA7EEE24562%7D'}] },
    'bedscables::Set up 6 rotating discount codes': {
      desc:'Six discount codes in rotation for the 15% off promo (Phase 1) — isolates lift per code for daily optimization.',
      links:[{label:'Beds & Cables 15% Off — Campaign Plan', sub:'SharePoint · Word', url:'https://mypartssource.sharepoint.com/:w:/s/MarketingTeamSite/IQCAKt_kUcyRQ65B_LVsUZXOAa3jsu-9q4yhgNx0jv1QE-E'}] },
    'mktplace::Launch Upsell Marketplace campaign': {
      desc:'Launch the 4-modality upsell (anesthesia, patient monitoring, defib, batteries). Landing pages are live; blocked on the Salesforce audience with SF IDs.',
      sub:[{t:'Modality plays built',done:true},{t:'Landing pages live',done:true},{t:'Receive SF audience with IDs',done:false},{t:'Schedule sends',done:false}],
      comments:[
        {a:'MD',x:'LPs live. Waiting on the SF audience from Daniel F. & Alex Gillette.'},
        {a:'CG',x:'Followed up with RevOps on the SF ID list.'} ]}
  }
};
