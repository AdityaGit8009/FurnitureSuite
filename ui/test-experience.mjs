import assert from 'node:assert/strict';
export async function experienceTests({a,owner,mgr,fresh,orderBody,password}) {
 const catalog=()=>a.req('/catalog').then(c=>c.experience);
 const first={title:'Central design guide',slug:'central-guide',branch:'Central',blocks:[{type:'text',heading:'Materials',text:'Oak and walnut',option:''}]};
 await a.req('/studio/pages',first,403);
 await mgr.req('/studio/pages',{...first,branch:'North'},403);
 await mgr.req('/studio/pages',{...first,blocks:[{...first.blocks[0],align:'unsupported'}]},400);
 let page=await mgr.req('/studio/pages',first);
 assert.ok(!(await catalog()).pages.some(p=>p.slug===first.slug));
 page=await mgr.req('/studio/pages/'+page.id+'/publish',{version:page.version});
 assert.ok((await catalog()).pages.some(p=>p.title===first.title));
 const draft=await mgr.req('/studio/pages',{...first,id:page.id,version:page.version,title:'Revised',blocks:[{...first.blocks[0],align:'right'}]});
 await mgr.req('/studio/pages/'+page.id+'/publish',{version:page.version},409);
 assert.equal((await catalog()).pages.find(p=>p.slug===first.slug).title,first.title);
 let released=await mgr.req('/studio/pages/'+page.id+'/publish',{version:draft.version});
 assert.equal(JSON.parse((await catalog()).pages.find(p=>p.slug===first.slug).blocks)[0].align,'right');
 let history=await mgr.req('/studio/pages/'+page.id+'/history');
 released=await mgr.req('/studio/pages/'+page.id+'/restore',{revision:history.at(-1).revision,version:released.version});assert.equal(released.title,first.title);
 await mgr.req('/studio/pages/'+page.id+'/unpublish',{version:released.version});assert.ok(!(await catalog()).pages.length);
 const message={branch:'Central',kind:'ORDER',subject:'Ready for {{name}}',body:'{{message}} / {{branch}}',version:0};
 await mgr.req('/studio/mail',message);await mgr.req('/studio/mail',{...message,branch:'All'},403);assert.equal((await mgr.req('/studio/mail/preview',message)).subject,'Ready for Aditi');
 await mgr.req('/studio/modules',{kind:'POLL'},403);
 await owner.req('/studio/modules',{kind:'POLL',title:'Favourite wood',options:['Oak','Teak'],description:'',enabled:true});let mod=(await catalog()).modules.find(m=>m.title==='Favourite wood');await a.req('/studio/modules/'+mod.id+'/submit',{choice:'Oak'});await a.req('/studio/modules/'+mod.id+'/submit',{choice:'Teak'});assert.deepEqual((await catalog()).modules.find(m=>m.id===mod.id).results,[{choice:'Teak',votes:1}]);
 await owner.req('/studio/modules',{kind:'REQUEST',title:'Design visit',options:['Room type'],enabled:true});mod=(await catalog()).modules.find(m=>m.title==='Design visit');await a.req('/studio/modules/'+mod.id+'/submit',{branch:'Central',answers:{'Room type':'Living room'}});let entry=(await a.req('/studio/mine'))[0];await mgr.req('/studio/entries/'+entry.id,{stage:'IN_REVIEW'});await mgr.req('/studio/entries/'+entry.id,{stage:'DONE'});assert.equal((await a.req('/studio/mine'))[0].stage,'DONE');
 await a.req('/studio/questions/1',{question:'Is the cover removable?',branch:'Central'});assert.ok(!(await catalog()).questions.length);let q=(await mgr.req('/studio/manage')).questions[0];await mgr.req('/studio/answers/'+q.id,{answer:'Ask the showroom about the fabric variant.'});assert.equal((await catalog()).questions[0].id,q.id);
 await mgr.req('/studio/flags/QUESTIONS',{enabled:false},403);await owner.req('/studio/flags/QUESTIONS',{enabled:false});assert.ok(!(await catalog()).questions.length);await owner.req('/studio/flags/QUESTIONS',{enabled:true});
 await a.req('/shop-tools/watch/3',{price:30000});await owner.req('/inventory/product/3',{price:29500,cost:18000,warranty:'12 months'});assert.ok((await a.req('/desk')).inbox.some(x=>x.message.includes('29500')));assert.equal((await a.req('/shop-tools/watches')).length,0);
 const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
 await mgr.req('/shop-tools/windows',{branch:'Central',start:day+'T10:00',end:day+'T12:00',capacity:1});let slot=(await catalog()).slots[0].id;
 const request={...orderBody,items:[{productId:4,qty:1}],deliverySlot:slot};
 let tries=await Promise.allSettled([a.req('/work',request),fresh.req('/work',request)]);assert.equal(tries.filter(x=>x.status==='fulfilled').length,1);const id=tries.find(x=>x.status==='fulfilled').value.id;await mgr.move(id,'CANCELLED');assert.equal((await catalog()).slots[0].remaining,1);
 await mgr.req('/test-payments',undefined,403);await owner.req('/test-payments/connect',{keyId:'rzp_live_rejected',secret:'unused',password},400);await owner.req('/test-payments/orders',{},409);
 console.log('PASS: scoped draft/publish/restore, mail templates, modules, poll vote uniqueness, form triage, moderated Q&A, price alerts, delivery-window concurrency, test-mode access.');
}
export async function studioBrowser(page,base){
 await page.getByRole('button',{name:'Appearance settings'}).click();await page.getByRole('button',{name:'Midnight',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='midnight');
 await page.getByRole('button',{name:'Studio Owner',exact:true}).waitFor();await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('button',{name:'Site studio',exact:true}).click();
 await page.getByLabel('Page title',{exact:true}).fill('Weekend showroom');await page.getByLabel('Heading',{exact:true}).fill('Visit the studio');await page.getByLabel('Section 1 text alignment',{exact:true}).selectOption('center');await page.getByLabel('Text',{exact:true}).fill('Explore the weekend collection.');await page.getByRole('button',{name:'Publish page',exact:true}).click();await page.getByRole('link',{name:'View live page'}).waitFor();
 const pub=await page.context().newPage();await pub.goto(base+'/?page=weekend-showroom');await pub.getByRole('heading',{name:'Weekend showroom',exact:true}).waitFor();await pub.getByText('Explore the weekend collection.').waitFor();assert.equal(await pub.getByText('Explore the weekend collection.').evaluate(e=>getComputedStyle(e).textAlign),'center');await pub.close();
 await page.getByRole('button',{name:'Email templates',exact:true}).click();await page.getByRole('button',{name:'Preview email'}).click();await page.getByText('Sample email',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Feature lab',exact:true}).click();await page.getByRole('heading',{name:'Feature switches'}).waitFor();
 await page.getByRole('button',{name:'Razorpay test',exact:true}).click();await page.waitForURL('**/razorpay-test');await page.getByRole('button',{name:'Connect test keys',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Payment testing'}).waitFor();
 console.log('PASS: theme persists after reload, browser page publishing and direct URL, email preview and owner feature lab.');
}