import { randomUUID } from 'node:crypto'
// Local Supabase integration only. No values, tokens or response bodies are logged.
import fs from 'node:fs'
const text=fs.readFileSync(process.argv[2],'utf8')
const env=Object.fromEntries(text.split(/\r?\n/).map(line=>line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^"|"$/g,'')]))
const url=new URL(env.API_URL)
if(url.protocol!=='http:' || url.hostname!=='127.0.0.1' || url.port!=='54321' || !env.ANON_KEY || !env.SERVICE_ROLE_KEY) throw Error('Refusing non-local or incomplete target')
const anon=env.ANON_KEY, service=env.SERVICE_ROLE_KEY, password=randomUUID() + "Aa1!", failures=[]
async function req(path,method='GET',body,token=anon,key=anon){
 const headers={apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation'}
 const res=await fetch(new URL(path,url),{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error'})
 const raw=await res.text(); let data; try{data=JSON.parse(raw)}catch{data=null}; return {status:res.status,data}
}
function check(name,ok,detail=''){process.stdout.write(`${ok?'PASS':'FAIL'} ${name}${detail?' '+detail:''}\n`);if(!ok)failures.push(name)}
function uuid(value){if(typeof value!=='string'||! /^[0-9a-f-]{36}$/i.test(value))throw Error('Unexpected synthetic ID');return value}
async function main(){
 const stamp=Date.now(), accounts={}
 for(const name of ['admin','admin2','reader','replacement','third','unlinked']){
  const email=`local-${name}-${stamp}@example.test`
  const created=await req('/auth/v1/admin/users','POST',{email,password,email_confirm:true},service,service)
  if(created.status!==200 && created.status!==201) throw Error(`Auth create ${name}: HTTP ${created.status}`)
  const id=uuid(created.data?.id)
  const auth=await req('/auth/v1/token?grant_type=password','POST',{email,password})
  if(auth.status!==200||!auth.data?.access_token) throw Error(`Auth login ${name}: HTTP ${auth.status}`)
  accounts[name]={id,email,token:auth.data.access_token}
 }
 check('GoTrue: seis contas sintéticas e JWTs reais',true)
 for(const name of ['admin','admin2','reader','replacement','third']){
  const a=accounts[name]; const role=name.startsWith('admin')?'admin':'reader'
  const r=await req('/rest/v1/profiles','POST',{auth_user_id:a.id,email:a.email,full_name:`Local ${name}`,role},service,service)
  if(r.status!==201||!r.data?.[0]?.id) throw Error(`Seed profile ${name}: HTTP ${r.status}`)
  a.profile=uuid(r.data[0].id)
 }
 if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify({accounts,password}), {mode:0o600})
 const a=accounts.admin, reader=accounts.reader, replacement=accounts.replacement, third=accounts.third
 const rpc=(name,body,who)=>req(`/rest/v1/rpc/${name}`,'POST',body,who?.token||anon)
 const denied=r=>r.status===401||r.status===403
 const noSession=await rpc('archive_member',{target_profile_id:reader.profile},null)
 check('RPC administrativa anônima rejeitada',denied(noSession),`HTTP ${noSession.status}`)
 for(const name of ['reader','unlinked']){const r=await rpc('archive_member',{target_profile_id:reader.profile},accounts[name]);check(`RPC administrativa negada: ${name}`,denied(r),`HTTP ${r.status}`)}
 for(const field of ['role','archived_at']){const r=await req(`/rest/v1/profiles?id=eq.${reader.profile}`,'PATCH',{[field]:field==='role'?'admin':'2026-01-01T00:00:00Z'},reader.token);check(`UPDATE direto ${field} negado`,denied(r),`HTTP ${r.status}`)}
 const made=await rpc('create_mass_with_slots',{mass_data:{date:'2099-12-01',time:'10:00',month_reference:'2099-12'},slot_data:[{role:'1L',profileId:reader.profile}]},a)
 check('Administrador cria celebração e vaga por RPC',made.status===200,`HTTP ${made.status}`)
 if(made.status!==200)throw Error('Cannot continue schedule checks')
 const mass=uuid(made.data?.id)
 let slots=await req(`/rest/v1/schedule_slots?mass_id=eq.${mass}&select=id,profile_id`, 'GET',undefined,service,service)
 if(slots.status!==200||slots.data?.length!==1)throw Error(`Service fixture read: HTTP ${slots.status}`)
 const slot=uuid(slots.data[0].id)
 const readActive=await req(`/rest/v1/schedule_slots?id=eq.${slot}&select=id`,'GET',undefined,a.token)
 check('Controle positivo: admin ativo lê vaga via PostgREST',readActive.status===200&&readActive.data?.length===1,`HTTP ${readActive.status}; linhas ${Array.isArray(readActive.data)?readActive.data.length:'?'}`)
 const badMass=await req(`/rest/v1/masses?id=eq.${mass}`,'PATCH',{time:'11:30:00'},a.token)
 check('PWA antigo: primeira escrita de horário negada',denied(badMass),`HTTP ${badMass.status}`)
 const badDelete=await req(`/rest/v1/schedule_slots?id=eq.${slot}`,'DELETE',undefined,a.token)
 check('PWA antigo: exclusão direta de vaga negada',denied(badDelete),`HTTP ${badDelete.status}`)
 const badInsert=await req('/rest/v1/schedule_slots','POST',{mass_id:mass,role:'2L',profile_id:replacement.profile},a.token)
 check('PWA antigo: inserção direta de vaga negada',denied(badInsert),`HTTP ${badInsert.status}`)
 const hwrite=await req('/rest/v1/schedule_assignment_history','POST',{slot_id:slot,mass_id:mass,role:'1L',profile_id:reader.profile,event_type:'assignment_changed'},reader.token)
 check('Escrita direta no histórico negada',denied(hwrite),`HTTP ${hwrite.status}`)
 let before=await req(`/rest/v1/masses?id=eq.${mass}&select=time,schedule_revision`,'GET',undefined,service,service)
 check('Estado após tentativas legadas preservado',before.status===200&&before.data?.[0]?.time?.startsWith('10:00'),`HTTP ${before.status}`)
 const arch=await rpc('archive_member',{target_profile_id:reader.profile},a)
 check('Administrador inativa membro por RPC',arch.status===200&&arch.data==='archived',`HTTP ${arch.status}`)
 const repeat=await rpc('archive_member',{target_profile_id:reader.profile},a)
 check('Inativação repetida previsível',repeat.status===200&&repeat.data==='already_archived',`HTTP ${repeat.status}`)
 const staleSession=await rpc('perform_slot_action',{target_slot_id:slot,action_name:'confirm',requested_profile_id:reader.profile},reader)
 check('JWT emitido antes da inativação perde autorização',denied(staleSession),`HTTP ${staleSession.status}`)
 const current=await req(`/rest/v1/schedule_slots?id=eq.${slot}&select=profile_id`,'GET',undefined,service,service)
 const history=await req(`/rest/v1/schedule_assignment_history?slot_id=eq.${slot}&select=profile_id,event_type`,'GET',undefined,service,service)
 check('Vaga futura liberada e histórico preservado',current.status===200&&current.data?.[0]?.profile_id===null&&history.status===200&&history.data?.some(x=>x.profile_id===reader.profile),`HTTP ${current.status}/${history.status}`)
 before=await req(`/rest/v1/masses?id=eq.${mass}&select=schedule_revision,time`,'GET',undefined,service,service)
 const rev=before.data?.[0]?.schedule_revision
 const editBody={target_mass_id:mass,mass_data:{date:'2099-12-01',time:'12:00',month_reference:'2099-12',expected_revision:rev},slot_data:[{id:slot,role:'1L',profileId:replacement.profile}]}
 const edit=await rpc('update_mass_with_slots',editBody,a)
 check('Cliente novo edita e reatribui por RPC',edit.status===204||edit.status===200,`HTTP ${edit.status}`)
 const conflict=await rpc('update_mass_with_slots',editBody,a)
 check('Revisão antiga é rejeitada',conflict.status>=400,`HTTP ${conflict.status}`)
 const after=await req(`/rest/v1/masses?id=eq.${mass}&select=time`,'GET',undefined,service,service)
 check('Conflito não desfaz edição válida',after.status===200&&after.data?.[0]?.time?.startsWith('12:00'),`HTTP ${after.status}`)
 const publish=await rpc('set_masses_publication',{target_mass_ids:[mass],publish:true},a)
 const request=await rpc('perform_slot_action',{target_slot_id:slot,action_name:'request_swap'},replacement)
 const accept=await rpc('perform_slot_action',{target_slot_id:slot,action_name:'accept_swap',requested_profile_id:third.profile},third)
 const swaps=await req(`/rest/v1/schedule_assignment_history?slot_id=eq.${slot}&select=profile_id,event_type`,'GET',undefined,service,service)
 const latest=await req(`/rest/v1/schedule_slots?id=eq.${slot}&select=profile_id`,'GET',undefined,service,service)
 check('Troca sucessiva preserva histórico e novo leitor',publish.status<300&&request.status<300&&accept.status<300&&swaps.data?.some(x=>x.profile_id===replacement.profile)&&latest.data?.[0]?.profile_id===third.profile,`HTTP ${publish.status}/${request.status}/${accept.status}`)
 const last=await req('/rest/v1/profiles?select=last_seen_at&limit=1','GET',undefined,service,service)
 check('Schema versionado fornece last_seen_at usado por Analytics',last.status===200,`HTTP ${last.status}`)
 process.stdout.write(`SUMMARY ${failures.length} falha(s)\n`)
 if(failures.length)process.exitCode=1
}
main().catch(e=>{process.stderr.write(`ABORT ${e.message}\n`);process.exitCode=2})
