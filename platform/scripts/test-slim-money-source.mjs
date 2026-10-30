import assert from 'node:assert/strict';
import {parseMoneyCents,centsToDecimal,decimalMoney,formatSlimBRL,validateProductMoney} from '../src/lib/slim-money.core.ts';
import {resolveSlimCompanySource} from '../src/lib/slim-company-source.core.ts';
let n=0;async function test(name,f){await f();n++;console.log('PASS commerce: '+name);}
for(const [value,cents] of [['0,01',1],['19,99',1999],['1.234,56',123456],['1.234',123400],[19.99,1999],[0.01,1],['0',0],['19.99',1999],['R$ 1.234,56',123456],['999999999999,99',99999999999999]])await test('exact cents '+value,()=>assert.equal(parseMoneyCents(value),cents));
for(const bad of ['',null,undefined,NaN,Infinity,-1,'-0,01','19,999',19.999,'1.23,45','1e3','1000000000000,00'])await test('invalid money rejected '+String(bad),()=>assert.throws(()=>parseMoneyCents(bad)));
await test('serialization does not round whole reais',()=>{assert.equal(decimalMoney('19,99'),'19.99');assert.equal(decimalMoney('0,01'),'0.01');assert.equal(centsToDecimal(123456),'1234.56');});
await test('formatted prices retain both fractional digits',()=>{assert.match(formatSlimBRL(19.99),/19,99$/);assert.match(formatSlimBRL(.01),/0,01$/);assert.match(formatSlimBRL(1234.56),/1\.234,56$/);});
await test('blank promo and legitimate zero differ',()=>{assert.equal(validateProductMoney('19,99','').promoPrice,undefined);assert.equal(validateProductMoney('19,99','0').promoPrice,0);assert.equal(validateProductMoney('0','').error,null);});
await test('higher promo rejected',()=>assert.ok(validateProductMoney('19,99','20').error));
await test('supplier cost bound respects numeric(12,2)',()=>{assert.equal(decimalMoney('9999999999,99',999999999999),'9999999999.99');assert.throws(()=>decimalMoney('10000000000',999999999999));});
function fake(data,error=null){
 const calls=[];
 return {calls,from(table){
  calls.push(['from',table]);
  return {
   select(){return this;},
   eq(k,v){calls.push([k,v]);return this;},
   order(){return this;},
   then(ok,bad){return Promise.resolve({data,error}).then(ok,bad);},
  };
 }};
}
await test('supplier uses the actual default manual source',async()=>{const db=fake([{id:'local',workspace_id:'w',provider:'manual',is_default:true},{id:'other',workspace_id:'other',provider:'manual',is_default:true}]);assert.equal(await resolveSlimCompanySource(db,'w'),'local');assert(db.calls.some(([k,v])=>k==='workspace_id'&&v==='w'));});
await test('local legacy source remains compatible without reading original project',async()=>assert.equal(await resolveSlimCompanySource(fake([{id:'legacy',workspace_id:'w',provider:'mkton',is_default:true}]),'w'),'legacy'));
await test('supplier independent of advertising integration',async()=>assert.equal(await resolveSlimCompanySource(fake([{id:'meta',workspace_id:'w',provider:'meta',is_default:true}]),'w'),null));
await test('missing source does not create duplicates or prevent standalone supplier',async()=>assert.equal(await resolveSlimCompanySource(fake([]),'w'),null));
await test('source read failure is not an absent source',async()=>await assert.rejects(resolveSlimCompanySource(fake(null,{code:'42501'}),'w'),/não foi salvo/));
await test('missing workspace fails before access',async()=>{const db=fake([]);await assert.rejects(resolveSlimCompanySource(db,''));assert.equal(db.calls.length,0);});
console.log(`${n}/${n} monetary and supplier-source checks passed. Local doubles; no production data changed.`);
