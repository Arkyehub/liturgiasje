const {execFileSync, spawn} = require('child_process')
const container = 'liturgiasje-boundary-20261031', db = 'audit_final4'
const inspect = JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0]
if (inspect.HostConfig.NetworkMode !== 'none' || inspect.Config.Image !== 'postgres:17-alpine' || Object.keys(inspect.HostConfig.PortBindings || {}).length) throw Error('test container is not isolated')
const args = sql => ['exec',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db,'-c',sql]
const sql = q => execFileSync('docker',args(q),{encoding:'utf8'})
const admin='10000000-0000-0000-0000-000000000001'
const run = q => new Promise(resolve => { const p=spawn('docker',args(q)); let out=''; p.stdout.on('data',x=>out+=x); p.stderr.on('data',x=>out+=x); p.on('close',code=>resolve({code,out})) })
const tx=(actor,body,hold=false)=>`BEGIN; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',true); ${body}; ${hold?'SELECT pg_sleep(2);':''} COMMIT;`
const edit=(m,s,p,rev,time)=>`SELECT public.update_mass_with_slots('${m}',jsonb_build_object('date','2099-12-01','time','${time}','month_reference','2099-12','expected_revision',${rev}),jsonb_build_array(jsonb_build_object('id','${s}','role','1L','profileId','${p}')))`
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function pair(name,first,second,secondFails,check) {
  const a=run(first); let locked=false
  for(let i=0;i<30;i++){await sleep(100); if(sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted").match(/\b1\b/)){locked=true;break}}
  if(!locked) throw Error(name+': first transaction did not lock')
  const b=run(second); const [x,y]=await Promise.all([a,b])
  if(x.code!==0 || (secondFails ? y.code===0 : y.code!==0)) throw Error(name+': unexpected status '+JSON.stringify({x,y}))
  sql(`DO $$ BEGIN IF NOT (${check}) THEN RAISE EXCEPTION 'invalid concurrent result'; END IF; END $$;`)
  process.stdout.write(name+': passed\n')
}
async function main(){
 let n=0
 const setup=()=>{
   n++; const suffix=String(n).padStart(12,'0'), u=`11000000-0000-0000-0000-${suffix}`, p=`21000000-0000-0000-0000-${suffix}`, m=`31000000-0000-0000-0000-${suffix}`, s=`41000000-0000-0000-0000-${suffix}`
   sql(`INSERT INTO auth.users(id) VALUES('${u}'); INSERT INTO public.profiles(id,auth_user_id,email,full_name,role) VALUES('${p}','${u}','race${n}@local','Race','reader'); INSERT INTO public.masses(id,date,time,month_reference,is_published) VALUES('${m}','2099-12-01','10:00','2099-12',true); INSERT INTO public.schedule_slots(id,mass_id,role,profile_id,is_swap_requested) VALUES('${s}','${m}','1L','${p}',true);`)
   const rev=Number(sql(`SELECT schedule_revision FROM public.masses WHERE id='${m}'`).match(/\n\s*(\d+)\s*\n/)[1]); return {u,p,m,s,rev}
 }
 for(const order of ['edit-first','archive-first']){const x=setup(), e=edit(x.m,x.s,x.p,x.rev,'11:00'), ar=`SELECT public.archive_member('${x.p}')`; await pair('edit/archive '+order,tx(admin,order==='edit-first'?e:ar,true),tx(admin,order==='edit-first'?ar:e),order==='archive-first',`(SELECT archived_at IS NOT NULL FROM public.profiles WHERE id='${x.p}') AND (SELECT profile_id IS NULL FROM public.schedule_slots WHERE id='${x.s}')`)}
 for(const order of ['swap-first','archive-first']){const x=setup(), sw=`SELECT public.perform_slot_action('${x.s}','accept_swap','20000000-0000-0000-0000-000000000003')`, ar=`SELECT public.archive_member('${x.p}')`; await pair('swap/archive '+order,tx(order==='swap-first'?'10000000-0000-0000-0000-000000000003':admin,order==='swap-first'?sw:ar,true),tx(order==='swap-first'?admin:'10000000-0000-0000-0000-000000000003',order==='swap-first'?ar:sw),order==='archive-first',`(SELECT archived_at IS NOT NULL FROM public.profiles WHERE id='${x.p}') AND (SELECT profile_id ${order==='archive-first'?'IS NULL':"='20000000-0000-0000-0000-000000000003'"} FROM public.schedule_slots WHERE id='${x.s}')`)}
 for(const order of ['edit-first','delete-first']){const x=setup(), e=edit(x.m,x.s,x.p,x.rev,'11:00'), d=`SELECT public.delete_mass_safely('${x.m}')`; await pair('edit/delete '+order,tx(admin,order==='edit-first'?e:d,true),tx(admin,order==='edit-first'?d:e),order==='delete-first',`NOT EXISTS (SELECT 1 FROM public.masses WHERE id='${x.m}')`)}
 for(const order of ['first-a','first-b']){const x=setup(), a=edit(x.m,x.s,x.p,x.rev,'11:00'), b=edit(x.m,x.s,x.p,x.rev,'12:00'); await pair('edit/edit '+order,tx(admin,order==='first-a'?a:b,true),tx(admin,order==='first-a'?b:a),true,`(SELECT time='${order==='first-a'?'11:00':'12:00'}'::time FROM public.masses WHERE id='${x.m}')`)}
}
main().catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1})
