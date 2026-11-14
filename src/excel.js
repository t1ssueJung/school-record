import readExcelFile from 'read-excel-file/universal';
import {unzipSync,strFromU8} from 'fflate';
import {reportHeader_,fail_,text_} from './domain.js';
const MAX_FILE=2*1024*1024,MAX_UNPACKED=10*1024*1024;
export function inspectArchive(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_FILE||bytes[0]!==80||bytes[1]!==75)fail_('올바른 2MB 이하 XLSX를 선택하세요.');let count=0,total=0,entries;
 try{entries=unzipSync(bytes,{filter(file){count++;total+=file.originalSize;if(count>100||!Number.isSafeInteger(file.originalSize)||file.originalSize<0||total>MAX_UNPACKED)fail_('엑셀 내부 파일 수·압축 해제 크기 제한을 넘었습니다.');return true;}});}catch(e){if(e.appError)throw e;fail_('XLSX 압축 구조를 읽을 수 없습니다.');}
 total=0;for(const [name,data]of Object.entries(entries)){
  total+=data.byteLength;if(total>MAX_UNPACKED)fail_('압축 해제 크기는 10MB 이하여야 합니다.');
  if(/externalLinks|vbaProject|embeddings|connections|queryTables/i.test(name))fail_('외부 연결·매크로·임베디드 개체를 제거하세요.');
  if(/\.(xml|rels)$/i.test(name)){
   const xml=strFromU8(data);
   if(/<!DOCTYPE|<!ENTITY|<(?:[\w]+:)?f(?:\s|\/?>)/i.test(xml)||/TargetMode\s*=\s*["']External["']/i.test(xml))fail_('수식과 외부 연결이 없는 값 전용 XLSX를 사용하세요.');
   if(/^xl\/worksheets\//.test(name)){
    for(const match of xml.matchAll(/\br=["']([A-Z]+)(\d+)["']/g)){let col=0;for(const ch of match[1])col=col*26+ch.charCodeAt(0)-64;if(col>40||Number(match[2])>2001)fail_('원본 행 2001행·40열 이내로 정리하세요.');}
    for(const match of xml.matchAll(/<(?:\w+:)?row\b[^>]*\br=["'](\d+)["']/g))if(Number(match[1])>2001)fail_('원본 행 수 제한을 넘었습니다.');
   }
  }
 }
 if(!entries['xl/workbook.xml'])fail_('XLSX workbook.xml을 찾을 수 없습니다.');return entries;
}
export async function parseWorkbook(buffer,name){
 if(!/\.xlsx$/i.test(text_(name)))fail_('.xlsx 파일을 선택하세요.');inspectArchive(new Uint8Array(buffer));
 let sheets;try{sheets=await readExcelFile(buffer,{trim:false});}catch{fail_('엑셀을 읽지 못했습니다. 값 전용 XLSX로 다시 저장하세요.');}
 if(sheets.length!==1)fail_('한 개 시트만 포함된 XLSX를 사용하세요.');
 const grid=sheets[0].data.map(row=>Array.from(row,v=>v instanceof Date?v.toISOString().slice(0,10):v==null?'':String(v)));
 if(grid.length<2||grid.length>2001||grid.some(r=>r.length>40))fail_('머리글 포함 2~2001행, 40열 이내여야 합니다.');
 const report=grid.some(r=>!!reportHeader_(r));if(!report){if(grid[0].some(h=>!text_(h))||new Set(grid[0]).size!==grid[0].length)fail_('표형 머리글은 비어 있거나 중복될 수 없습니다.');if(grid[0].some(h=>/주민|주소|전화|연락처|건강|보호자/.test(h)))fail_('수집하지 않는 개인정보 컬럼을 원본에서 제거하세요.');}
 return {grid,format:report?'report':'table'};
}
