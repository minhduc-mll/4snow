import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { parseEditorialRequest } from '../../lib/vua-tieng-viet/editorial-contract.ts';
import { handlePreview, ImportOperationError } from '../../lib/vua-tieng-viet/preview-handler.ts';
const requestId='30000000-0000-4000-8000-000000000003';
const request={operation:'rights-review',requestId,idempotencyKey:'40000000-0000-4000-8000-000000000004',input:{sourceId:'50000000-0000-4000-8000-000000000005',expectedDraftRevision:'3',decision:'cleared',evidence:'Verified synthetic evidence',obligations:'Synthetic credit required'}};
test('rights review validates decisions, bounded private evidence and draft revisions',()=>{
 assert.equal(parseEditorialRequest(request).operation,'rights-review');
 for(const input of [{...request.input,decision:'approved'},{...request.input,evidence:' '},{...request.input,obligations:'x'.repeat(4001)},{...request.input,expectedDraftRevision:'-1'},{...request.input,extra:true}]) assert.throws(()=>parseEditorialRequest({...request,input}));
});
test('rights review requires admin and hashes stable retries, rate limits, and reports conflicts',async()=>{
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'); const unsigned=`${enc({alg:'HS256',typ:'JWT'})}.${enc({role:'admin',iat:1000,exp:1100})}`; const token=`${unsigned}.${createHmac('sha256','secret').update(unsigned).digest('base64url')}`;
 let hashes=[]; let delay=0; const config={secret:'secret',origins:['https://app.example'],now:()=>1001,consumeLimit:async()=>0,consumeMutationLimit:async()=>delay,rightsReview:async(_r,h)=>{hashes.push(h); if(hashes.length>2) throw new ImportOperationError('REVISION_CONFLICT'); return {rightsReviewId:requestId,draftRevision:'4'};}};
 const send=(body,authorization)=>handlePreview(new Request('https://edge.invalid',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}: {})},body:JSON.stringify(body)}),config);
 assert.equal((await send(request)).status,401); assert.equal(hashes.length,0);
 assert.equal((await send(request,`Bearer ${token}`)).status,200); assert.equal((await send({...request,requestId:'60000000-0000-4000-8000-000000000006'},`Bearer ${token}`)).status,200); assert.equal(hashes[0],hashes[1]);
 assert.equal((await send(request,`Bearer ${token}`)).status,409); delay=10; assert.equal((await send(request,`Bearer ${token}`)).status,429);
});
import { safeHttps } from '../../lib/vua-tieng-viet/safe-link.ts';
test('attribution links require valid credential-free HTTPS',()=>{ assert.equal(safeHttps('https://example.invalid/a'),'https://example.invalid/a'); for(const url of ['javascript:alert(1)','http://example.invalid','https://user:pass@example.invalid','https://','//example.invalid',null]) assert.equal(safeHttps(url),null); });
