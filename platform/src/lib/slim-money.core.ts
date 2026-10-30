/** Unit prices use exact decimal-to-integer parsing. No parseFloat, clipping or whole-real rounding. */
export const MAX_MONEY_CENTS = 99999999999999;
export function parseMoneyCents(input: string | number, maxCents=MAX_MONEY_CENTS): number {
  if(typeof input!=='string'&&typeof input!=='number')throw new Error('Informe um valor monetário válido.');
  if(typeof input==='number'&&!Number.isFinite(input))throw new Error('Valor monetário inválido.');
  let raw=String(input).trim().replace(/^R\$\s*/, '');
  if(!raw||raw.startsWith('-')||/[eE]/.test(raw))throw new Error('Informe um valor não negativo, com até dois centavos decimais.');
  if(typeof input==='string'&&raw.includes(',')){
    if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{0,2}$/.test(raw))throw new Error('Use um valor como 19,99 ou 1.234,56.');
    raw=raw.replace(/\./g,'').replace(',','.');
  }else if(typeof input==='string'&&/^\d{1,3}(?:\.\d{3})+$/.test(raw)){
    raw=raw.replace(/\./g,'');
  }
  if(!/^\d+(?:\.\d{0,2})?$/.test(raw))throw new Error('O preço deve ter no máximo duas casas decimais.');
  const [whole,fraction='']=raw.split('.');
  const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(maxCents)||maxCents<0||cents>BigInt(maxCents))throw new Error('Valor acima do limite permitido.');
  return Number(cents);
}
export function centsToDecimal(cents:number):string {
  if(!Number.isSafeInteger(cents)||cents<0||cents>MAX_MONEY_CENTS)throw new Error('Valor em centavos inválido.');
  const n=BigInt(cents);return `${n/100n}.${String(n%100n).padStart(2,'0')}`;
}
export function decimalMoney(value:string|number,maxCents=MAX_MONEY_CENTS):string{return centsToDecimal(parseMoneyCents(value,maxCents));}
export function formatSlimBRL(value:number|string):string{
  const n=typeof value==='number'?value:Number(value);
  if(!Number.isFinite(n))return 'Indisponível';
  return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
}
export function validateProductMoney(price:string,promo:string):{price:number;promoPrice?:number;error:string|null}{
  try{
    const p=parseMoneyCents(price);const pp=promo.trim()===''?null:parseMoneyCents(promo);
    if(pp!==null&&pp>=p)throw new Error('O preço promocional deve ser menor que o preço normal.');
    return {price:p/100,...(pp!==null?{promoPrice:pp/100}:{}),error:null};
  }catch(e){return {price:0,error:e instanceof Error?e.message:'Preço inválido.'};}
}
