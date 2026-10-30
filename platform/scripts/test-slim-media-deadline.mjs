import assert from 'node:assert/strict';import {Buffer} from 'node:buffer';
import {decodeSlimMedia,boundedMediaRequest,mediaPreparation,MediaSendUncertain} from '../src/lib/slim-media-transport.server.ts';
let n=0;async function test(name,fn){await fn();n++;console.log('PASS media deadline: '+name);}
const args={url:'https://test.invalid/message/sendMedia/test',apiKey:'synthetic',payload:{number:'synthetic',media:'private-test'}};
await test('PDF bytes preserved',()=>{const bytes=Buffer.from('%PDF-1.7\nsynthetic');assert.deepEqual(decodeSlimMedia(bytes.toString('base64')),bytes);});
await test('audio bytes preserved',()=>{const bytes=Buffer.from([1,255,0,25]);assert.deepEqual(decodeSlimMedia(bytes.toString('base64')),bytes);});
await test('empty malformed truncated and noncanonical rejected',()=>{for(const s of ['', '%%%%','YQ','YW=J','YQ===','Zh=='])assert.throws(()=>decodeSlimMedia(s));});
await test('larger than 16MB rejected',()=>assert.throws(()=>decodeSlimMedia('A'.repeat(4*Math.ceil(16*1024*1024/3)+4))));
await test('request succeeds with real body and ID',async()=>{let calls=0;const result=await boundedMediaRequest(args,{fetcher:async(_,init)=>{calls++;assert(init.signal);return Response.json({key:{id:'test'}});}});assert.equal(calls,1);assert.equal(result.body.key.id,'test');});
await test('stalled headers time out once, without restart or retry',async()=>{let calls=0;await assert.rejects(boundedMediaRequest(args,{timeoutMs:10,fetcher:async()=>{calls++;return new Promise(()=>{});}}),MediaSendUncertain);assert.equal(calls,1);});
await test('stalled body is included in deadline',async()=>{await assert.rejects(boundedMediaRequest(args,{timeoutMs:10,fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}))}),MediaSendUncertain);});
await test('oversized response rejected without copying unbounded data',async()=>assert.rejects(boundedMediaRequest(args,{maxBodyBytes:8,fetcher:async()=>new Response('A'.repeat(100))}),MediaSendUncertain));
await test('invalid success payload stays uncertain',async()=>assert.rejects(boundedMediaRequest(args,{fetcher:async()=>new Response('not JSON')}),MediaSendUncertain));
await test('connection rejection returned once without retry',async()=>{let count=0;const r=await boundedMediaRequest(args,{fetcher:async()=>{count++;return Response.json({message:'Connection closed'},{status:400});}});assert.equal(r.response.status,400);assert.equal(count,1);});
await test('network failure contains no secret or URL',async()=>{await assert.rejects(boundedMediaRequest(args,{fetcher:async()=>{throw new Error('apikey=hidden https://secret.invalid');}}),e=>!e.message.includes('hidden')&&!e.message.includes('secret.invalid'));});
await test('slow preparation cannot invoke the following send',async()=>{let sent=false;await assert.rejects((async()=>{await mediaPreparation(new Promise(()=>{}),'Upload',10);sent=true;})(),/Nenhuma requisição/);assert.equal(sent,false);});
console.log(`${n}/${n} media deadline checks passed. All providers synthetic; no WhatsApp call.`);
