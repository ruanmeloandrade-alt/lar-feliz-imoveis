import ts from 'typescript';
const attributes=new Set(['title','label','description','placeholder','alt','aria-label','aria-description']);
const properties=new Set(['title','label','description','message','hint','placeholder','text','content','system_prompt','systemPrompt','prompt']);
function changeVisibleText(raw){
 if(/\b(?:select|insert\s+into|update|delete\s+from|create\s+(?:table|function)|grant|revoke)\b/i.test(raw)&&/\b(?:from|where|values|public\.|private\.)\b/i.test(raw))return raw;
 return raw.replace(/\bmkton\b/gi,(word,index)=>{
  const before=raw.slice(0,index).match(/\S*$/)?.[0]??'';
  const after=raw.slice(index+word.length).match(/^\S*/)?.[0]??'';
  // Technical URLs, addresses, selectors, file names and identifiers are not UI copy.
  if(before.endsWith('.')||before.endsWith('#')||/[\/@_]/.test(before+after)||/\.[a-z0-9]/i.test(before+after))return word;
  return 'Saúde Slim';
 });
}
function named(node){return ts.isIdentifier(node)||ts.isStringLiteral(node)?node.text:'';}
function isDisplayExpression(node){
 const parent=node.parent;
 if(!parent)return false;
 if(ts.isJsxExpression(parent)){const host=parent.parent;return ts.isJsxAttribute(host)?attributes.has(named(host.name)):ts.isJsxElement(host)||ts.isJsxFragment(host);}
 if(ts.isConditionalExpression(parent)&&node!==parent.condition)return isDisplayExpression(parent);
 if(ts.isParenthesizedExpression(parent)||ts.isAsExpression(parent))return isDisplayExpression(parent);
 if(ts.isJsxAttribute(parent))return attributes.has(named(parent.name));
 if(ts.isPropertyAssignment(parent)&&parent.initializer===node)return properties.has(named(parent.name));
 if(ts.isNewExpression(parent)&&parent.arguments?.[0]===node)return ['Error','TypeError','RangeError'].includes(parent.expression.getText());
 if(ts.isCallExpression(parent)&&parent.arguments[0]===node)return /^(toast|sonnerToast)\.(error|success|warning|info|message|loading)$/.test(parent.expression.getText())||['setError','setNotice','showToast'].includes(parent.expression.getText());
 if(ts.isVariableDeclaration(parent))return /^(systemPrompt|prompt|message|errorMessage|title|label|description|placeholder|brandName)$/i.test(named(parent.name));
 return false;
}
export function transformVisibleBrand(source,fileName='source.tsx'){
 const sf=ts.createSourceFile(fileName,source,ts.ScriptTarget.Latest,true,fileName.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(sf.parseDiagnostics.length)throw new Error('Não é seguro revisar textos de um arquivo com erro de sintaxe: '+fileName);
 const edits=[];
 function offer(node){const start=node.getStart(sf);const end=node.getEnd();const before=source.slice(start,end);const after=changeVisibleText(before);if(after!==before)edits.push({start,end,text:after});}
 function visit(node){
  if(ts.isJsxText(node))offer(node);
  else if((ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))&&isDisplayExpression(node))offer(node);
  else if(ts.isTemplateExpression(node)&&isDisplayExpression(node)){offer(node.head);for(const span of node.templateSpans)offer(span.literal);}
  ts.forEachChild(node,visit);
 }
 visit(sf);let output=source;
 for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);
 return {source:output,edits:edits.length};
}
