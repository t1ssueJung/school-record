import {RULE_VERSION,REGISTRY_VERSION_,seedStandards_,seedTemplates_,availableSubjects_,scope_,norm_,text_,fail_,mapped_,validateStudents_,validateEvaluations_,parseReport_,parseLevelMap_,canonicalSubject_,subjectGroup_,buildComments_,csv_,textIssues_} from './domain.js';
export const emptyData=()=>({schema:3,ruleVersion:RULE_VERSION,scope:{year:2026,grade:4,classroom:1},revision:0,students:[],evaluations:[],comments:[],audit:[]});
const uuid=()=>crypto.randomUUID();
export function validateData(data){if(!data||data.schema!==3||!Array.isArray(data.students)||!Array.isArray(data.evaluations)||!Array.isArray(data.comments)||!Array.isArray(data.audit)||data.students.length>500||data.evaluations.length>5000||data.comments.length>5000||!Number.isSafeInteger(data.revision)||data.revision<0)fail_('지원하지 않는 백업 자료입니다.');scope_(data.scope);const ids=new Set();for(const s of data.students){if(!s.id||ids.has(s.id)||!s.name||typeof s.name!=='string'||!Number.isInteger(s.number)||s.number<1||s.number>999||s.grade!==data.scope.grade||s.classroom!==data.scope.classroom)fail_('백업 학생 자료를 확인하세요.');ids.add(s.id);}for(const e of data.evaluations)if(!ids.has(e.studentId)||typeof e.id!=='string')fail_('백업의 학생-평가 연결을 확인하세요.');for(const c of data.comments)if(!ids.has(c.studentId)||typeof c.text!=='string'||!Array.isArray(c.evidence)||!['draft','approved'].includes(c.status))fail_('백업의 평어 자료를 확인하세요.');return structuredClone(data);}
export class Engine {
 constructor(vault){this.vault=vault;this.data=null;this.pending=null;}
 open(data){this.data=validateData(data);const standards=seedStandards_();for(const c of this.data.comments){for(const e of c.evidence){const st=standards.find(s=>s.code===e.code&&s.subject===e.subject&&s.grades.includes(this.data.scope.grade)&&s.version===e.standardVersion&&norm_(s.text)===norm_(e.standard));e.source=st?.source||'';e.locator=st?.locator||'공식 성취기준 확인 필요';if(!st){c.sourceInvalid=true;c.status='draft';c.reviewed=false;c.approvedAt='';}}}this.pending=null;return this.snapshot();}
 lock(){this.data=null;this.pending=null;this.vault.lock();}
 snapshot(){if(!this.data||!this.vault.unlocked)fail_('저장소를 먼저 열어 주세요.');return structuredClone({...this.data,subjects:availableSubjects_(this.data.scope.grade),registryVersion:REGISTRY_VERSION_});}
 evidenceValid(c){const standards=seedStandards_();return !c.sourceInvalid&&c.evidence?.length&&c.evidence.every(e=>standards.some(s=>s.code===e.code&&s.subject===e.subject&&s.grades.includes(this.data.scope.grade)&&s.version===e.standardVersion&&norm_(s.text)===norm_(e.standard)));}
 async execute(operation,p={}){
  this.snapshot();if(operation==='initialize'||operation==='snapshot')return this.snapshot();
  if(operation==='preview'){
   const kind=p.kind;if(!['students','evaluations'].includes(kind))fail_('자료 종류를 선택하세요.');const scope=this.data.scope;let subject=canonicalSubject_(p.subject||''),parsed={warnings:[]},rows;
   if(kind==='evaluations'&&p.format==='report'){parsed=parseReport_(p.grid,{subject,semester:p.semester,identifierMode:p.identifierMode},scope);rows=parsed.rows;}else rows=mapped_(p.grid,p.map,kind);
   if(kind==='evaluations'){rows.forEach(r=>{if(!r.subject)r.subject=subject;});if(!subject&&rows.length)subject=canonicalSubject_(rows[0].subject);if(!availableSubjects_(scope.grade).includes(subject))fail_('학년에 맞는 과목을 선택하세요.');}
   const report=kind==='students'?validateStudents_(rows,scope,this.data.students,uuid):validateEvaluations_(rows,scope,this.data.students,seedStandards_(),uuid,{subject,levelMap:parseLevelMap_(p.levelMap||'')});
   report.warnings=parsed.warnings;report.requiresResultsReview=report.rows.some(r=>!!r.resultText);
   if(kind==='students')report.affectedEvaluations=this.data.evaluations.filter(e=>report.diff.removed.some(s=>s.id===e.studentId)).length;
   this.pending={id:uuid(),kind,subject,revision:this.data.revision,expires:Date.now()+600000,report};return structuredClone(this.pending);
  }
  if(operation==='export'){
   const rows=this.data.comments.filter(c=>(!p.subject||c.subject===p.subject)&&(!p.studentId||c.studentId===p.studentId));if(!rows.length)fail_('내보낼 결과가 없습니다.');if(rows.some(c=>!this.evidenceValid(c)))fail_('공식 성취기준 근거가 변경되었습니다. 다시 생성하세요.');if(p.approvedOnly&&rows.some(c=>c.status!=='approved'))fail_('선택 범위에 미승인 초안이 있습니다.');
   const cells=[['학년도','학년','반','번호','이름','교과목','상태','평어','평가레코드ID','규칙버전']];for(const c of rows){const s=this.data.students.find(s=>s.id===c.studentId);cells.push([s.year,s.grade,s.classroom,s.number,s.name,c.subject,c.status==='approved'?'교사 승인':'초안',c.text,c.evidence.map(e=>e.evaluationId).join(';'),c.ruleVersion]);}return {name:'교과평어-2026.csv',csv:csv_(cells)};
  }
  const next=structuredClone(this.data);
  switch(operation){
   case 'scope':if(next.students.length)fail_('명렬표가 있으면 학급을 바꿀 수 없습니다. 새 저장소를 만드세요.');next.scope=scope_(p);break;
   case 'commit':{
    const pending=this.pending;if(!pending||p.id!==pending.id||pending.revision!==next.revision||pending.expires<Date.now())fail_('미리보기가 만료되거나 변경되었습니다. 다시 검증하세요.');const r=pending.report;
    if(r.errors.length)fail_('오류를 수정한 후 다시 검증하세요.');if(!p.confirm||(pending.kind==='students'&&r.diff.removed.length&&!p.confirmRemoval)||(pending.kind==='evaluations'&&r.missing.length&&!p.confirmMissing))fail_('변경/누락 내용을 확인하고 동의하세요.');if(r.warnings.length&&!p.confirmSkipped)fail_('제외되는 미입력·분할 행을 확인하세요.');if(r.requiresResultsReview&&!p.confirmResults)fail_('서술형 평가결과를 실제 평가 근거로 확인하세요.');
    if(pending.kind==='students'){next.students=structuredClone(r.rows);next.evaluations=next.evaluations.filter(e=>next.students.some(s=>s.id===e.studentId));next.comments=[];}else{const records=structuredClone(r.rows);records.forEach(e=>e.resultsReviewed=!!p.confirmResults);next.evaluations=next.evaluations.filter(e=>e.subject!==pending.subject).concat(records);next.comments=next.comments.filter(c=>c.subject!==subjectGroup_(pending.subject,next.scope.grade));}break;
   }
   case 'generate':{
    const target=text_(p.subject),retained=target?next.comments.filter(c=>c.subject!==target):[];if(next.comments.length>retained.length&&!p.confirm)fail_('재생성하면 기존 수정·승인이 초기화됩니다.');const records=next.evaluations.filter(e=>!target||subjectGroup_(e.subject,e.grade)===target);const generated=buildComments_(next.students,records,seedStandards_(),seedTemplates_(),uuid,new Date().toISOString());next.comments=retained.concat(generated);break;
   }
   case 'saveComment':{
    const c=next.comments.find(c=>c.id===p.id);if(!c||c.version!==p.version)fail_('평어가 변경되었습니다. 다시 확인하세요.');if(!this.evidenceValid(c))fail_('공식 성취기준 근거가 변경되었습니다. 다시 생성하세요.');const value=text_(p.text);if(!value||textIssues_(value).length)fail_('평어가 비어 있거나 검토가 필요한 표현이 있습니다.');if(p.approve&&!p.reviewed)fail_('근거와 문장을 확인한 뒤 승인하세요.');Object.assign(c,{text:value,status:p.approve?'approved':'draft',reviewed:!!p.reviewed,version:c.version+1,editedAt:new Date().toISOString(),approvedAt:p.approve?new Date().toISOString():'',approvedBy:p.approve?'local-vault-owner':''});break;
   }
   case 'deleteAll':if(p.confirm!=='2026 자료 삭제')fail_('삭제 확인 문구를 정확히 입력하세요.');Object.assign(next,{students:[],evaluations:[],comments:[],audit:[]});break;
   default:fail_('지원하지 않는 작업입니다.');
  }
  next.revision++;if(operation!=='deleteAll'){next.audit.push({id:uuid(),at:new Date().toISOString(),action:operation});next.audit=next.audit.slice(-200);}
  if(next.evaluations.length>5000||next.comments.length>5000)fail_('한 저장소의 평가·평어는 각각 5000건 이내여야 합니다. 학급별 저장소로 나누어 주세요.');
  await this.vault.save(next);this.data=next;if(['commit','scope','deleteAll'].includes(operation))this.pending=null;return this.snapshot();
 }
}
