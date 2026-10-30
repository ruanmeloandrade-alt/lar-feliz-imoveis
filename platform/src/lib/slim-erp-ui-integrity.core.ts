/** Reviewed input is frozen only until an explicit rejection. Then show the edited draft. */
export function currentCheckoutPreview<T>(session:{state:string;quote:T}|undefined,draft:()=>T):T{return session&&session.state!=='rejected'?session.quote:draft();}
export type ReceiptFile={workspaceId:string;orderId:string;filename:string;sha256:string;pdfBase64:string};
/** Validate transport integrity, not fiscal authorization, delivery or proof of payment. */
export async function verifyReceiptDownload(file:ReceiptFile,expected:{workspaceId:string;orderId:string},digest:(bytes:Uint8Array)=>Promise<string>=async bytes=>{
 const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}):Promise<Uint8Array>{
 if(!file||file.workspaceId!==expected.workspaceId||file.orderId!==expected.orderId)throw new Error('O documento recebido não corresponde ao pedido selecionado.');
 if(typeof file.filename!=='string'||file.filename.length>160||!file.filename.toLowerCase().endsWith('.pdf')||/[\\/\x00-\x1f\x7f]/.test(file.filename))throw new Error('Nome do arquivo inválido.');
 if(typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256)||typeof file.pdfBase64!=='string'||file.pdfBase64.length<20||file.pdfBase64.length>4000000||file.pdfBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.pdfBase64))throw new Error('Conteúdo do documento inválido ou incompleto.');
 let raw:string;try{raw=atob(file.pdfBase64);}catch{throw new Error('O arquivo do pedido não pôde ser decodificado.');}
 if(!/^%PDF-(?:1\.[0-7]|2\.0)/.test(raw)||!raw.trimEnd().endsWith('%%EOF'))throw new Error('O arquivo recebido não é um PDF completo.');
 const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(await digest(bytes)!==file.sha256)throw new Error('A integridade do PDF não foi confirmada. Abra novamente o documento pelo histórico.');return bytes;
}
