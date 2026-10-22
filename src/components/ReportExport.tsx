import {useState} from 'react';
import {FileDown,ImageDown} from 'lucide-react';
import {Button} from './ui/button';
import {type Project,type Round} from '@/lib/types';
import {type ReportKind} from '@/lib/reports';
import {errorText} from '@/lib/utils';
import {t as tr} from '@/lib/i18n';
export function ReportExport({p,kind,round,notify,label}:{p:Project;kind:ReportKind;round?:Round;notify:(message:string,error?:boolean)=>void;label?:string}){const [busy,setBusy]=useState(false);async function run(format:'pdf'|'png'){setBusy(true);try{const {exportReport}=await import('@/lib/reports');await exportReport(p,kind,format,round)}catch(e){notify(errorText(e),true)}finally{setBusy(false)}}return <span className="report-export"><Button variant="outline" disabled={busy} aria-label={`${label??tr('导出')} PDF`} onClick={()=>void run('pdf')}><FileDown size={16}/>{label} PDF</Button><Button variant="outline" disabled={busy} aria-label={`${label??tr('导出')} PNG`} onClick={()=>void run('png')}><ImageDown size={16}/>{label} PNG</Button></span>}
