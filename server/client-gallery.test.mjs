import test from 'node:test';
import assert from 'node:assert/strict';
import { imageExtension, handleClientGallery } from './client-gallery.mjs';
test('uses image signatures instead of an unreliable downloaded filename',()=>{
  const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBPVP8 ')]);
  assert.equal(imageExtension(webp,'image/jpeg'),'webp');
  assert.equal(imageExtension(Buffer.from([255,216,255,224]),'image/jpeg'),'jpg');
  assert.equal(imageExtension(Buffer.from('<svg onload="alert(1)">'),'image/jpeg'),null);
  assert.equal(imageExtension(webp,'text/html'),null);
});
test('anonymous requests cannot list, upload or archive gallery management data',async()=>{
  for(const [path,method] of [['/api/site-gallery','GET'],['/api/site-gallery','POST'],['/api/site-gallery/archive','POST']]){
    let status;const res={writeHead(code){status=code;return this;},end(){}};
    assert.equal(await handleClientGallery({headers:{},method},res,new URL(path,'http://localhost')),true);
    assert.equal(status,403);
  }
});
test('gallery media rejects traversal and unrelated storage paths',async()=>{
  let status;const res={writeHead(code){status=code;return this;},end(){}};
  await handleClientGallery({headers:{},method:'GET'},res,new URL('/api/client-gallery-media/%2e%2e%2fprivate','http://localhost'));
  assert.equal(status,404);
});
