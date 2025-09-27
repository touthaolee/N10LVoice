export default function setupVitalSignsWeek2Scenario() {
const BASE_PATH = location.pathname.toLowerCase().startsWith('/n10lvoice/') ? '/N10LVoice' : ''; const API_BASE = `${BASE_PATH}/api`; const SOCKET_PATH = `${BASE_PATH}/socket.io`;
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s)); const $ = (s,r=document)=>r.querySelector(s);
let socket=null, sessionId=localStorage.getItem('studentSession'), studentName=localStorage.getItem('studentName'); let evaluationStartTime=null; let isManualDisconnect=false; let reconnectAttempts=0; const COURSE_WEEK_ID=2;
const scenarioTimeInput=document.getElementById('scenarioTime');
const DEFAULT_SCENARIO_TIME=scenarioTimeInput?.value||'0800 (Breakfast 0830)';
const DEFAULT_EVALUATION_DATE=document.getElementById('evaluationDate')?.value||new Date().toISOString().slice(0,10);
// Checklist data (expanded from provided Week 2 scenario text)
const CHECKLIST_SECTIONS = [
  { id:'sec-begin', title:'Standard Protocol - Beginning', items:[
    "Verifies physician's orders at bedside (reviews chart)",
    'Gathers required equipment and supplies',
    'Performs initial hand hygiene before contact'
  ]},
  { id:'sec-during', title:'Standard Protocol - During', items:[
    'Identifies client (ID bracelet + states name & DOB)',
    'Introduces self to client',
    'Explains assessment / plan to client',
    'Identifies teaching needs & describes what to expect',
    'Assesses if planned intervention still appropriate',
    'Adjusts bed to safe ergonomic height; lowers nearest side rail',
    'Provides adequate lighting for assessment',
    'Provides privacy (curtain pulled)'
  ]},
  { id:'sec-priorityO2', title:'Priority Oxygenation', items:[
    'Assesses oxygen saturation correctly (proper finger probe placement)',
    'States expected normal O₂ saturation range 95–100%',
    'Applies ordered O₂ at 2L NC when indicated (<95%)',
    'Positions nasal cannula correctly (tips in nares, tubing under chin)'
  ]},
  { id:'sec-temp', title:'Vital Sign: Temperature', items:[
    'Selects correct oral electronic thermometer (blue tip)',
    'Applies probe cover',
    'Waits for device completion / stable reading',
    'Disposes probe cover safely (clean technique)'
  ]},
  { id:'sec-bp', title:'Vital Sign: Blood Pressure', items:[
    'Verifies / states baseline BP from record prior to measurement',
    'Applies cuff of correct size to bare upper arm',
    'Places stethoscope over brachial artery (medial antecubital)',
    'Inflates cuff 20–30 mmHg above known / estimated systolic',
    'Deflates cuff at controlled 2–3 mmHg per second rate',
    'Obtains accurate systolic/diastolic within 4 mmHg evaluator'
  ]},
  { id:'sec-radial', title:'Vital Sign: Radial Pulse', items:[
    'Counts radial pulse for ≥30 seconds (longer if irregular)',
    'States regular vs irregular correctly',
    'States rate within 2–4 bpm of evaluator'
  ]},
  { id:'sec-apical', title:'Vital Sign: Apical Pulse', items:[
    'Identifies 5th intercostal space, left midclavicular line (skin contact)',
    'Counts apical pulse for a full 60 seconds',
    'States rhythm regular vs irregular correctly',
    'States apical rate within 2–4 bpm of evaluator'
  ]},
  { id:'sec-resp', title:'Vital Sign: Respiratory Rate', items:[
    'Counts respirations discreetly for ≥30 seconds',
    'Recorded rate within 2–3 breaths of evaluator'
  ]},
  { id:'sec-pain', title:'Pain Assessment (PQRSTU)', items:[
    'Asks client about pain presence & obtains numeric rating',
    'Teaches 0–10 pain scale correctly (0 = no pain; 10 = worst)',
    'Verbalizes overall pain assessment using PQRSTU framework',
    'Elicits Provokes / precipitating factors (P)',
    'Asks Quality descriptors (sharp, dull, burning, etc.) (Q)',
    'Determines Radiation / referred areas (R)',
    'Clarifies Severity using 0–10 scale (S)',
    'Identifies Time pattern / onset / duration (T)',
    'Assesses Impact on function / life (U – You)'
  ]},
  { id:'sec-vsdoc', title:'Vital Signs Documentation', items:[
    "Records temperature (patient initials, result, date/time)",
    "Records blood pressure (patient initials, result, date/time)",
    "Records radial pulse (patient initials, result, date/time)",
    "Records apical pulse (patient initials, result, date/time)",
    "Records respiratory assessment (patient initials, result, date/time)",
    "Records pain assessment (patient initials, result, date/time)"
  ]},
  { id:'sec-fsbs', title:'Blood Glucose Monitoring (FSBS)', items:[
    'Checks provider order for timing/frequency',
    'Gathers glucometer, strip, lancet, gauze/cotton, alcohol swab, gloves, documentation form, disinfectant wipe',
    'Uses two identifiers to confirm correct client',
    'Explains finger-stick procedure to client',
    'Performs hand hygiene & dons gloves',
    'Selects site (assesses for bruising / sensitivity; dependent position)',
    'Turns on meter; inserts strip; verifies code matches (if applicable)',
    'Cleans site with alcohol & allows to dry completely',
    'Performs lancet puncture correctly',
    'Wipes away first drop of blood',
    'Applies second drop to test strip receiving area',
    'Documents result with time/date/client identifiers',
    'Applies pressure until bleeding stops',
    'Disposes lancet, strip, gloves per protocol',
    'Performs hand hygiene after procedure'
  ]},
  { id:'sec-assess-head', title:'Assessment: Head / Face / Oral', items:[
  'Head: Normocephalic, atraumatic, symmetrical, no masses, no tenderness',
  'Hair: Even distribution; soft texture; thickness appropriate; color consistent; scalp clean; no lesions/infestations',
  'Face: Symmetrical at rest and with movement; no drooping; no involuntary movements',
  'Teeth: Intact without caries/plaque/discoloration; dentures/bridges well-fitting if present; neutral breath odor',
  'Mucous membranes/gums: Moist, pink, intact; no ulcerations, swelling, or bleeding'
  ]},
  { id:'sec-assess-skin', title:'Assessment: Skin / Hair / Nails', items:[
  'Skin tone/variations: Evenly pigmented, appropriate for ethnicity; no jaundice/cyanosis/abnormal discoloration',
  'Temperature/character: Warm, dry, consistent bilaterally; no clamminess',
  'Texture: Smooth, soft, resilient; no rough patches',
  'Thickness: Uniform; thicker only on palms/soles',
  'Turgor: Returns promptly; no tenting',
  'Vascularity: No ecchymosis/petechiae/abnormal markings; tattoos noted if present',
  'Edema: None present',
  'Lesions/Moles/Scars: No suspicious lesions; benign nevi only; scars well-healed',
  'Pressure signs: Skin intact; no erythema or breakdown',
  'Nails: Smooth, firm, pink nail beds; cap refill <2s; angle ≤160°; no clubbing'
  ]},
  { id:'sec-assess-general', title:'Assessment: General Appearance', items:[
  'State of Nutrition: Well-nourished; weight appropriate; no malnutrition signs',
  'Comfort Level: Resting comfortably; relaxed posture; no distress',
  'Facial Features/Body Structure: Symmetrical features; proportional body; posture appropriate'
  ]},
  { id:'sec-neuro', title:'Assessment: Neurological', items:[
  'Level of orientation: Alert & oriented ×3 (person/place/time)',
  'Memory: Short- & long-term intact',
  'Motor Function: Purposeful movement; follows commands; strength equal bilaterally',
  'Pupils: PERRLA; brisk reaction',
  'Ocular Movement: EOMI; no nystagmus',
  'Glasgow Coma Scale: 15/15'
  ]},
  { id:'sec-psych', title:'Assessment: Psychological', items:[
  'Facial Expression: Relaxed; maintains eye contact; affect congruent',
  'Mood/Affect: Calm; cooperative; appropriate',
  'Speech: Clear; well-articulated; normal pace & volume',
  'Interaction: Engaged; developmentally appropriate',
  'Personal Hygiene: Clean; well-groomed; clothing appropriate'
  ]},
  { id:'sec-ending', title:'Standard Protocol - Ending', items:[
  'Client repositioned for comfort; personal items organized & within reach',
  'Call light placed within reach; client verbalizes understanding of use',
  'Bed in lowest position; side rails raised per policy',
  'Supplies disposed properly; gloves removed; hand hygiene performed'
  ]},
  { id:'sec-handoff', title:'Recommendations / Handoff (SBAR Focus)', items:[
    'Summarizes critical oxygenation & respiratory status',
    'Communicates abnormal vital trends (fever, tachypnea, BP)',
    'Identifies required reassessment intervals',
    'States escalation criteria (SpO₂ decline, neuro change)',
    'Organizes SBAR elements for next shift handoff'
  ]}
];
// Guided correction state
let guidedQueue=[], guidedIndex=0, guidedActive=false, pendingSubmitForce=false;
function buildSections(){const container=document.getElementById('scenarioContent')||$('#evaluationForm'); if(!container){console.error('Scenario container not found'); return;} CHECKLIST_SECTIONS.forEach(sec=>{const wrapper=document.createElement('div'); wrapper.className='section'; wrapper.id=sec.id; wrapper.innerHTML=`<button type="button" class="section-header" aria-expanded="true" onclick="toggleSection(this)"><span class="section-title">${sec.title}</span><span class="section-meta" data-count="${sec.id}"></span><span class="toggle-icon">▾</span></button><div class="section-content">${sec.items.map((txt,i)=>`<div class="checklist-item"><div class="checkbox-container"><label class="checkbox-group"><input type="checkbox" class="checkbox pass" data-key="${sec.id}_${i}" /><span class="checkbox-label pass">✓ PASS</span></label><label class="checkbox-group"><input type="checkbox" class="checkbox fail" data-key="${sec.id}_${i}" data-fail /><span class="checkbox-label fail">✗ FAIL</span></label></div><div class="item-text">${txt}</div></div>`).join('')}</div>`; container.appendChild(wrapper);}); }
function toggleSection(btn){const section=btn.closest('.section'); const exp=btn.getAttribute('aria-expanded')==='true'; btn.setAttribute('aria-expanded',String(!exp)); section.classList.toggle('collapsed',exp);} window.toggleSection=toggleSection;
function updateCounts(){
  CHECKLIST_SECTIONS.forEach(s=>{const secEl=$('#'+s.id); if(!secEl) return; const items=$$('.checklist-item',secEl); const passed=items.filter(x=>x.classList.contains('checked')).length; const failed=items.filter(x=>x.classList.contains('failed')).length; const meta=$(`[data-count="${s.id}"]`); if(meta) meta.textContent=`${passed}✓ / ${failed}✗ of ${items.length}`;});
  const all=$$('.checklist-item');
  const p=all.filter(i=>i.classList.contains('checked')).length;
  const f=all.filter(i=>i.classList.contains('failed')).length;
  const criticalFailed=all.filter(i=>i.classList.contains('failed') && i.querySelector('input.checkbox.pass[data-critical="true"]')).length; // placeholder (no critical flags yet)
  const total=all.length; const pct= total? Math.round(p/total*100):0;
  $('#completedScore').textContent=`${p} / ${total}`; $('#failedScore').textContent=f; const critEl=$('#criticalFailedScore'); if(critEl) critEl.textContent=criticalFailed;
  const scoreEl=$('#overallScore'); scoreEl.textContent=pct+'%'; scoreEl.style.background= pct>=90? 'var(--ok)': (pct>=75? 'var(--warn)': 'var(--fail)');
  $('#progressFill').style.width= ((p+f)/(total||1))*100 + '%';
  sendProgressUpdate();
}
function handleToggle(e){const input=e.target; if(!(input instanceof HTMLInputElement)) return; if(!input.classList.contains('checkbox')) return; const item=input.closest('.checklist-item'); const key=input.getAttribute('data-key'); const siblings=$$(`input[data-key="${key}"]`, item); siblings.forEach(s=>{ if(s!==input) s.checked=false; }); if(input.checked){ if(input.hasAttribute('data-fail')){ item.classList.add('failed'); item.classList.remove('checked'); } else { item.classList.add('checked'); item.classList.remove('failed'); } } else { item.classList.remove('checked','failed'); } saveState(); updateCounts(); }
function saveState(){const state={ evaluatorName:$('#evaluatorName').value, evaluationDate:$('#evaluationDate').value, scenarioTime:$('#scenarioTime').value, items: $$('.checklist-item').map(ci=>{const key=ci.querySelector('input.checkbox.pass')?.getAttribute('data-key'); return { key, checked:ci.classList.contains('checked'), failed:ci.classList.contains('failed') }; }) }; localStorage.setItem('week2_vitals_state', JSON.stringify(state)); }
function loadState(){try{const raw=localStorage.getItem('week2_vitals_state'); if(!raw) return; const s=JSON.parse(raw); if(s.evaluatorName) $('#evaluatorName').value=s.evaluatorName; if(s.evaluationDate) $('#evaluationDate').value=s.evaluationDate; if(s.scenarioTime) $('#scenarioTime').value=s.scenarioTime; if(Array.isArray(s.items)){ s.items.forEach(entry=>{ if(!entry.key) return; const item=$(`.checklist-item input[data-key="${entry.key}"]`)?.closest('.checklist-item'); if(!item) return; const pass=$('input.checkbox.pass',item); const fail=$('input.checkbox.fail',item); if(entry.failed){ fail && (fail.checked=true); pass && (pass.checked=false); item.classList.add('failed'); item.classList.remove('checked'); } else if(entry.checked){ pass && (pass.checked=true); fail && (fail.checked=false); item.classList.add('checked'); item.classList.remove('failed'); } else { pass && (pass.checked=false); fail && (fail.checked=false); item.classList.remove('checked','failed'); } }); }}catch{} }
function generateReport(){const stud=$('#studentName').value.trim(); const evaler=$('#evaluatorName').value.trim(); const date=$('#evaluationDate').value; if(!stud||!evaler||!date){alert('Fill Student, Evaluator, Date first.'); return;} const items=$$('.checklist-item'); const passed=items.filter(i=>i.classList.contains('checked')); const failed=items.filter(i=>i.classList.contains('failed')); const total=items.length; const pct= total? Math.round(passed.length/total*100):0; let report='Week 2 Vital Signs Comprehensive Evaluation\n============================================\n\n'; report+=`Student: ${stud}\nEvaluator: ${evaler}\nDate: ${date}\nScenario: Pneumonia - Vital Signs / Neuro / Pain Assessment\n\nSUMMARY\n-------\nPassed: ${passed.length}/${total}\nFailed: ${failed.length}\nScore: ${pct}%\n\n`; if(passed.length){report+='PASSED ITEMS\n------------\n'; passed.forEach(i=> report+='✓ '+$('.item-text',i).textContent.trim()+'\n'); report+='\n';} if(failed.length){report+='FAILED ITEMS\n-----------\n'; failed.forEach(i=> report+='✗ '+$('.item-text',i).textContent.trim()+'\n'); report+='\n';} report+='Generated: '+ new Date().toLocaleString()+'\n'; const blob=new Blob([report],{type:'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`Week2_VitalSigns_${stud.replace(/\s+/g,'_')}_${date}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
// Socket realtime
function connectSocket(){ if(!studentName||!sessionId) return; socket=io({ path:SOCKET_PATH, auth:{ sessionId }}); socket.on('connect',()=>{updateConnectionStatus(true); if(!evaluationStartTime) evaluationStartTime=new Date().toISOString();}); socket.on('disconnect',()=> updateConnectionStatus(false)); }
function sendProgressUpdate(){ if(!socket||!socket.connected) return; const score=getCurrentScore(); socket.emit('evaluation-update',{ score, items:getCurrentItems(), timestamp:new Date().toISOString(), courseWeekId: COURSE_WEEK_ID, scenarioTitle:'Week 2 - Vital Signs' }); }
function getCurrentScore(){let p=0,f=0,t=0; $$('.checklist-item').forEach(i=>{t++; if(i.classList.contains('checked')) p++; else if(i.classList.contains('failed')) f++;}); const percent= t? Math.round(p/t*100):0; return { passed:p, failed:f, total:t, percent }; }
function getCurrentItems(){const items=[]; const sectionSeq={}; CHECKLIST_SECTIONS.forEach(sec=>{if(!(sec.id in sectionSeq)) sectionSeq[sec.id]=0; const secEl=$('#'+sec.id); if(!secEl) return; $$('.checklist-item',secEl).forEach(ci=>{const seq=sectionSeq[sec.id]++; const pass=ci.querySelector('input.checkbox.pass'); const fail=ci.querySelector('input.checkbox.fail'); let status='not_completed'; let notes='Not completed'; if(pass?.checked){status='pass'; notes='Passed';} else if(fail?.checked){status='fail'; notes='Failed';} const text=ci.querySelector('.item-text')?.textContent.trim(); items.push({ section:sec.title, item:text, key:`${sec.id}_${seq}`, checked:status==='pass', failed:status==='fail', status, timestamp:new Date().toISOString(), notes, sequence:seq }); }); }); return items; }
// Guided correction
function collectIncomplete(){return $$('.checklist-item').filter(ci=>{const pass=ci.querySelector('input.checkbox.pass'); const fail=ci.querySelector('input.checkbox.fail'); return pass && fail && !pass.checked && !fail.checked;}); }
function clearGuided(){ $$('.checklist-item.incomplete-focus').forEach(el=>el.classList.remove('incomplete-focus')); }
function focusGuided(){ clearGuided(); const cur=guidedQueue[guidedIndex]; if(cur){ cur.classList.add('incomplete-focus'); cur.scrollIntoView({behavior:'smooth',block:'center'});} }
function showGuidedToast(){ const root=$('#guidedToastRoot'); if(!root) return; const cur=guidedQueue[guidedIndex]; if(!cur){ root.innerHTML=''; guidedActive=false; return;} const txt=cur.querySelector('.item-text')?.textContent.trim()||'Item'; const pct= guidedQueue.length? Math.round(guidedIndex/guidedQueue.length*100):100; root.innerHTML=`<div class="guided-toast"><button class="guided-close" onclick="cancelGuidedMode()" aria-label="Close">×</button><h4>Complete All Items (Week 2)</h4><div class="guided-progress">Item ${guidedIndex+1} of ${guidedQueue.length} • ${pct}% reviewed</div><div class="guided-item-text">${txt}</div><div class="guided-actions"><button class="guided-btn pass" onclick="markGuided('pass')">✓ Pass</button><button class="guided-btn fail" onclick="markGuided('fail')">✗ Fail</button><button class="guided-btn next" onclick="skipGuided()" ${(guidedQueue.length-guidedIndex)<=1?'disabled style=\"opacity:.4;cursor:not-allowed;\"':''}>Skip</button><button class="guided-btn submit" onclick="resumeSubmission()" ${(guidedQueue.length-guidedIndex)>1?'disabled':''}>Submit Now</button></div></div>`; }
function startGuidedMode(){guidedQueue=collectIncomplete(); guidedIndex=0; guidedActive=true; if(!guidedQueue.length) return false; focusGuided(); showGuidedToast(); return true;} window.startGuidedMode=startGuidedMode;
function markGuided(mode){const cur=guidedQueue[guidedIndex]; if(!cur) return; const pass=cur.querySelector('input.checkbox.pass'); const fail=cur.querySelector('input.checkbox.fail'); if(mode==='pass' && pass){ pass.checked=true; fail && (fail.checked=false); cur.classList.add('checked'); cur.classList.remove('failed'); } else if(mode==='fail' && fail){ fail.checked=true; pass && (pass.checked=false); cur.classList.add('failed'); cur.classList.remove('checked'); } updateCounts(); advanceGuided(); }
function skipGuided(){advanceGuided();}
function advanceGuided(){guidedQueue=collectIncomplete(); if(!guidedQueue.length){finishGuided(); return;} if(guidedIndex>=guidedQueue.length) guidedIndex=0; focusGuided(); showGuidedToast(); }
function finishGuided(){clearGuided(); guidedActive=false; const root=$('#guidedToastRoot'); root.innerHTML=`<div class="guided-toast" style="background:#0f172a;"><h4>All items answered ✅</h4><div style="font-size:.8rem;opacity:.8;">Submit when ready.</div><div class="guided-actions" style="margin-top:10px;"><button class="guided-btn submit" onclick="resumeSubmission()">Submit Evaluation</button><button class="guided-btn next" onclick="cancelGuidedMode()">Close</button></div></div>`; }
function cancelGuidedMode(){guidedActive=false; clearGuided(); const root=$('#guidedToastRoot'); root.innerHTML='';} window.cancelGuidedMode=cancelGuidedMode;
function guardedSubmit(force=false){const inc=collectIncomplete(); if(inc.length){ startGuidedMode(); pendingSubmitForce=force; return;} submitEvaluation(force); }
function resumeSubmission(){const inc=collectIncomplete(); if(inc.length){ guidedQueue=inc; guidedIndex=0; focusGuided(); showGuidedToast(); return;} cancelGuidedMode(); submitEvaluation(pendingSubmitForce);} window.resumeSubmission=resumeSubmission;
// Submission
async function submitEvaluation(forceOverwrite=false){ if(!socket||!socket.connected){ alert('Not connected. Try again after reconnect.'); return;} const score=getCurrentScore(); const items=getCurrentItems(); const notes={ evaluatorName:$('#evaluatorName').value || '', scenarioTime:$('#scenarioTime').value || '' }; if(!forceOverwrite){ try{ const resp= await fetch(`${API_BASE}/evaluations/check-duplicate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ studentName, courseWeekId: COURSE_WEEK_ID }) }); if(resp.ok){ const data= await resp.json(); if(data.duplicate){ if(!confirm(`An evaluation already exists (Score ${data.existingEvaluation.score}%). Overwrite?`)) return; return submitEvaluation(true); } } } catch(e){ console.warn('Duplicate check failed', e); } }
 socket.emit('evaluation-complete',{ courseWeekId: COURSE_WEEK_ID, courseName:'Week 2 Vital Signs Assessment', score, items, notes, evaluatorName:notes.evaluatorName, scenarioTime:notes.scenarioTime, startTime:evaluationStartTime, endTime:new Date().toISOString(), overwrite:forceOverwrite }); localStorage.removeItem('week2_vitals_state'); alert(`Evaluation submitted. Score: ${score.percent}% (${score.passed}/${score.total})`); }
function updateConnectionStatus(ok){ const el=$('#connectionStatus'); el.style.display='block'; if(ok){ el.textContent='🟢 Connected'; el.style.background='#16a34a'; } else { el.textContent='🔴 Disconnected'; el.style.background='#dc2626'; }}
function showError(msg){const el=$('#loginError'); el.textContent=msg; el.style.display='block'; setTimeout(()=> el.style.display='none',5000);} function showSuccess(msg){const div=document.createElement('div'); div.style.cssText='position:fixed;top:20px;right:20px;background:#16a34a;color:#fff;padding:12px 18px;border-radius:10px;font-weight:600;z-index:1200;box-shadow:0 6px 18px rgba(0,0,0,.25);'; div.textContent=msg; document.body.appendChild(div); setTimeout(()=>div.remove(),3500);} 
function attemptReconnection(){}
// Login
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('#loginStudentName').value.trim();
  const pwd=$('#loginPassword').value;
  if(!name||!pwd){showError('All fields required'); return;}
  const prevName=localStorage.getItem('studentName');
  try{
    const resp= await fetch(`${API_BASE}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:name, password:pwd }) });
    const data= await resp.json();
    if(!resp.ok || !data.sessionId){ showError(data.error||'Login failed'); return;}
    // Clear previous progress BEFORE overwriting localStorage studentName
    clearWeek2ProgressForNewStudent(data.studentName);
    studentName=data.studentName; sessionId=data.sessionId;
    localStorage.setItem('studentName',studentName);
    localStorage.setItem('studentSession',sessionId);
    $('#studentName').value=studentName;
    $('#loginModal').style.display='none';
    connectSocket();
    showSuccess('Signed in');
  } catch(err){ showError('Network error'); }
});
// Init
const initializeScenario=()=>{ if(!$('#evaluationDate').value) $('#evaluationDate').value=DEFAULT_EVALUATION_DATE; if(!$('#scenarioTime').value) $('#scenarioTime').value=DEFAULT_SCENARIO_TIME; buildSections(); loadState(); updateCounts(); document.body.addEventListener('change',handleToggle); const downloadBtn=$('#downloadReport'); if(downloadBtn) downloadBtn.addEventListener('click',generateReport); const resetBtn=$('#resetForm'); if(resetBtn) resetBtn.addEventListener('click',()=>{ if(!confirm('Reset entire form?')) return; localStorage.removeItem('week2_vitals_state'); $$('.checklist-item').forEach(i=>{ i.classList.remove('checked','failed'); i.querySelectorAll('input[type="checkbox"]').forEach(c=> c.checked=false);}); $('#evaluatorName').value=''; $('#scenarioTime').value=DEFAULT_SCENARIO_TIME; updateCounts(); }); const submitBtn=$('#submitEvaluation'); if(submitBtn) submitBtn.addEventListener('click',e=>{ e.preventDefault(); guardedSubmit(); }); const expandBtn=$('#expandAll'); if(expandBtn) expandBtn.addEventListener('click',()=> $$('.section').forEach(s=>{ s.classList.remove('collapsed'); $('.section-header',s)?.setAttribute('aria-expanded','true'); })); const collapseBtn=$('#collapseAll'); if(collapseBtn) collapseBtn.addEventListener('click',()=> $$('.section').forEach(s=>{ s.classList.add('collapsed'); $('.section-header',s)?.setAttribute('aria-expanded','false'); })); $$('input,textarea').forEach(el=> el.addEventListener('input',()=>{ saveState(); })); if(sessionId && studentName){ $('#studentName').value=studentName; $('#loginModal').style.display='none'; connectSocket(); showSuccess('Session restored'); } updateCounts(); };
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',initializeScenario,{once:true}); } else { initializeScenario(); }

// --- New Student Login Clearing Logic ---
function clearWeek2ProgressForNewStudent(newName){ const prev=localStorage.getItem('studentName'); if(prev && prev.trim().toLowerCase()!==newName.trim().toLowerCase()){ localStorage.removeItem('week2_vitals_state'); $$('.checklist-item').forEach(ci=>{ ci.classList.remove('checked','failed'); ci.querySelectorAll('input[type="checkbox"]').forEach(c=> c.checked=false); }); $('#evaluatorName').value=''; updateCounts(); showSuccess('Previous student data cleared'); }}

// Removed delayed clearing listener; clearing performed synchronously in primary login handler above.

// --- Switch Student / Logout Feature (Week 2) ---
function switchStudent(){ if(!confirm('Switch student? This will clear current progress.')) return; try{ if(socket) socket.disconnect(); }catch(e){} localStorage.removeItem('studentSession'); localStorage.removeItem('studentName'); localStorage.removeItem('week2_vitals_state'); sessionId=null; studentName=null; evaluationStartTime=null; $$('.checklist-item').forEach(ci=>{ ci.classList.remove('checked','failed'); ci.querySelectorAll('input[type="checkbox"]').forEach(c=> c.checked=false); }); const evalField=$('#evaluatorName'); if(evalField) evalField.value=''; document.getElementById('loginModal').style.display='flex'; showSuccess('Student session cleared'); }
document.addEventListener('DOMContentLoaded',()=>{ const btn=document.getElementById('switchStudent'); if(btn) btn.addEventListener('click',switchStudent); });
}
