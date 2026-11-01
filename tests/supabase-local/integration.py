"""Synthetic integration against isolated Docker DNS names only; do not use with remote services."""
import base64, hashlib, hmac, json, os, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
AUTH=os.environ.get('AUTH_URL','http://auth:9999'); REST=os.environ.get('REST_URL','http://rest:3000')
if AUTH not in ('http://auth:9999','http://auth-replay:9999') or REST not in ('http://rest:3000','http://rest-replay:3000'):
    raise SystemExit('Refusing a non-local Supabase target')
secret=os.environ['JWT_SECRET'].encode()
def b64(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def local_token(role):
    header=b64(json.dumps({'alg':'HS256','typ':'JWT'},separators=(',',':')).encode())
    body=b64(json.dumps({'role':role,'iss':'supabase-local','iat':int(time.time()),'exp':int(time.time())+3600},separators=(',',':')).encode())
    return header+'.'+body+'.'+b64(hmac.new(secret,(header+'.'+body).encode(),hashlib.sha256).digest())
service=local_token('service_role'); anon=local_token('anon'); failures=[]
def req(base,path,method='GET',body=None,token=None):
    if base not in (AUTH,REST) or not path.startswith('/'): raise RuntimeError('refusing target')
    headers={'Authorization':'Bearer '+(token or anon),'apikey':anon,'Content-Type':'application/json','Prefer':'return=representation'}
    data=None if body is None else json.dumps(body).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(base+path,data=data,method=method,headers=headers),timeout=20) as response: code=response.status; raw=response.read()
    except urllib.error.HTTPError as e: code=e.code; raw=e.read()
    try: value=json.loads(raw) if raw else None
    except ValueError: value=None
    return code,value

def check(name,ok,detail=''):
    print(('PASS ' if ok else 'FAIL ')+name+(' '+detail if detail else ''),flush=True)
    if not ok: failures.append(name)
def deny(status): return status in (401,403)
def main():
    stamp=str(int(time.time())); password='local-'+str(time.time_ns())+'Aa1!'; accounts={}
    for name in ['admin','admin2','reader','replacement','third','admin_archive_a','admin_archive_b','unlinked']:
        email='local-'+name+'-'+stamp+'@example.test'
        status,data=req(AUTH,'/admin/users','POST',{'email':email,'password':password,'email_confirm':True},service)
        if status not in (200,201) or not isinstance(data,dict) or not data.get('id'): raise RuntimeError('Auth create '+name+' HTTP '+str(status))
        user_id=data['id']; status,data=req(AUTH,'/token?grant_type=password','POST',{'email':email,'password':password},anon)
        if status!=200 or not isinstance(data,dict) or not data.get('access_token'): raise RuntimeError('Auth login '+name+' HTTP '+str(status))
        accounts[name]={'id':user_id,'email':email,'token':data['access_token']}
    check('GoTrue emitiu JWTs reais para oito contas sintéticas',True)
    for name in ['admin','admin2','reader','replacement','third','admin_archive_a','admin_archive_b']:
        account=accounts[name]; role='admin' if name.startswith('admin') else 'reader'
        status,data=req(REST,'/profiles','POST',{'auth_user_id':account['id'],'email':account['email'],'full_name':'Local '+name,'role':role},service)
        if status!=201 or not isinstance(data,list) or not data: raise RuntimeError('Seed profile '+name+' HTTP '+str(status))
        account['profile']=data[0]['id']
    a=accounts['admin']; reader=accounts['reader']; replacement=accounts['replacement']; third=accounts['third']
    def rpc(name,body,user=None): return req(REST,'/rpc/'+name,'POST',body,user['token'] if user else anon)
    status,_=rpc('archive_member',{'target_profile_id':reader['profile']}); check('RPC administrativa anônima negada',deny(status),'HTTP '+str(status))
    status,data=rpc('is_admin',{},a); check('Administrador ativo reconhecido pela policy',status==200 and data is True,'HTTP '+str(status))
    status,_=rpc('is_admin',{},None); check('Função privilegiada de verificação não exposta a anon',deny(status),'HTTP '+str(status))
    for name in ['reader','unlinked']:
        status,_=rpc('archive_member',{'target_profile_id':reader['profile']},accounts[name]); check('RPC administrativa negada para '+name,deny(status),'HTTP '+str(status))
    for field,value in [('role','admin'),('archived_at','2026-01-01T00:00:00Z')]:
        status,_=req(REST,'/profiles?id=eq.'+reader['profile'],'PATCH',{field:value},reader['token']); check('Alteração direta de '+field+' negada',deny(status),'HTTP '+str(status))
    status,made=rpc('create_mass_with_slots',{'mass_data':{'date':'2099-12-01','time':'10:00','month_reference':'2099-12'},'slot_data':[{'role':'1L','profileId':reader['profile']}]},a)
    check('Administrador cria celebração por RPC',status==200,'HTTP '+str(status))
    if status!=200 or not isinstance(made,dict): raise RuntimeError('Cannot continue schedule checks')
    mass=made['id']; status,slots=req(REST,'/schedule_slots?mass_id=eq.'+mass+'&select=id,profile_id',token=service)
    if status!=200 or not isinstance(slots,list) or len(slots)!=1: raise RuntimeError('Synthetic slot setup failed HTTP '+str(status))
    status,mass_before=req(REST,'/masses?id=eq.'+mass+'&select=time,schedule_revision',token=service)
    status,slots_before=req(REST,'/schedule_slots?mass_id=eq.'+mass+'&select=id,mass_id,role,profile_id,original_profile_id,is_confirmed,is_swap_requested&order=id.asc',token=service)
    status,history_before=req(REST,'/schedule_assignment_history?mass_id=eq.'+mass+'&select=id,slot_id,profile_id,event_type&order=id.asc',token=service)
    slot=slots[0]['id']; status,active=req(REST,'/schedule_slots?id=eq.'+slot+'&select=id',token=a['token'])
    check('Controle positivo: admin ativo lê vaga',status==200 and isinstance(active,list) and len(active)==1,'HTTP '+str(status)+' linhas '+str(len(active) if isinstance(active,list) else '?'))
    status,hidden=req(REST,'/schedule_slots?id=eq.'+slot+'&select=id',token=reader['token'])
    check('Membro ativo não lê escala ainda não publicada',status==200 and hidden==[],'HTTP '+str(status))
    status,_=req(REST,'/masses?id=eq.'+mass,'PATCH',{'time':'11:30:00'},a['token']); check('PWA antigo: atualização direta recusada',deny(status),'HTTP '+str(status))
    status,_=req(REST,'/schedule_slots?id=eq.'+slot,'DELETE',token=a['token']); check('PWA antigo: exclusão direta recusada',deny(status),'HTTP '+str(status))
    status,_=req(REST,'/schedule_slots','POST',{'mass_id':mass,'role':'2L','profile_id':replacement['profile']},a['token']); check('PWA antigo: recriação direta recusada',deny(status),'HTTP '+str(status))
    status,_=req(REST,'/schedule_assignment_history','POST',{'slot_id':slot,'mass_id':mass,'role':'1L','profile_id':reader['profile'],'event_type':'assignment_changed'},reader['token']); check('Escrita direta em histórico negada',deny(status),'HTTP '+str(status))
    status,rows=req(REST,'/masses?id=eq.'+mass+'&select=time,schedule_revision',token=service)
    _,slots_after=req(REST,'/schedule_slots?mass_id=eq.'+mass+'&select=id,mass_id,role,profile_id,original_profile_id,is_confirmed,is_swap_requested&order=id.asc',token=service)
    hs,history_after=req(REST,'/schedule_assignment_history?mass_id=eq.'+mass+'&select=id,slot_id,profile_id,event_type&order=id.asc',token=service)
    check('PWA legado: estado integral mantido após primeira escrita negada',status==200 and rows==mass_before and slots_after==slots_before and hs==200 and history_after==history_before,'HTTP '+str(status)+'/'+str(hs))
    status,data=rpc('archive_member',{'target_profile_id':reader['profile']},a); check('Administrador inativa membro',status==200 and data=='archived','HTTP '+str(status))
    status,data=rpc('archive_member',{'target_profile_id':reader['profile']},a); check('Inativação repetida é previsível',status==200 and data=='already_archived','HTTP '+str(status))
    status,auth_user=req(AUTH,'/user',token=reader['token']); check('Sessão Auth anterior continua válida após inativação',status==200 and auth_user.get('id')==reader['id'],'HTTP '+str(status))
    status,auth_record=req(AUTH,'/admin/users/'+reader['id'],token=service); check('Conta GoTrue permanece preservada',status==200 and auth_record.get('id')==reader['id'],'HTTP '+str(status))
    status,archived_profile=req(REST,'/profiles?id=eq.'+reader['profile']+'&select=auth_user_id,archived_at',token=service)
    check('Vínculo Auth e timestamp de inativação são preservados',status==200 and archived_profile[0]['auth_user_id']==reader['id'] and archived_profile[0]['archived_at'] is not None,'HTTP '+str(status))
    status,archived_rows=req(REST,'/schedule_slots?id=eq.'+slot+'&select=id',token=reader['token'])
    check('Membro inativo não lê escala protegida',status==200 and archived_rows==[],'HTTP '+str(status))
    status,_=rpc('perform_slot_action',{'target_slot_id':slot,'action_name':'confirm','requested_profile_id':reader['profile']},reader); check('JWT anterior à inativação perde autorização',deny(status),'HTTP '+str(status))
    status,current=req(REST,'/schedule_slots?id=eq.'+slot+'&select=profile_id',token=service); hs,history=req(REST,'/schedule_assignment_history?slot_id=eq.'+slot+'&select=profile_id,event_type',token=service)
    check('Vaga futura liberada e histórico preservado',status==200 and current[0]['profile_id'] is None and hs==200 and any(x['profile_id']==reader['profile'] for x in history),'HTTP '+str(status)+'/'+str(hs))
    status,rows=req(REST,'/masses?id=eq.'+mass+'&select=schedule_revision',token=service); rev=rows[0]['schedule_revision']
    def batch_entry(time_value,expected_revision,profile_id):
        return {'mass_id':mass,'mass_data':{'date':'2099-12-01','time':time_value,'month_reference':'2099-12','expected_revision':expected_revision},'slot_data':[{'id':slot,'role':'1L','profileId':profile_id}]}
    entry=batch_entry('12:00',rev,replacement['profile'])
    status,_=rpc('save_schedule_batch',{'entries':[entry],'deleted_masses':[]},a); check('Aplicação nova edita celebração e vagas por RPC transacional',status in (200,204),'HTTP '+str(status))
    status,_=rpc('save_schedule_batch',{'entries':[entry],'deleted_masses':[]},a); check('Edição com revisão antiga recusada',status>=400,'HTTP '+str(status))
    status,before_rollback=req(REST,'/masses?id=eq.'+mass+'&select=time,schedule_revision',token=service)
    _,slots_before_rollback=req(REST,'/schedule_slots?mass_id=eq.'+mass+'&select=id,profile_id',token=service)
    _,history_before_rollback=req(REST,'/schedule_assignment_history?mass_id=eq.'+mass+'&select=id,slot_id,profile_id,event_type&order=id.asc',token=service)
    expected=before_rollback[0]['schedule_revision']
    failing_entries=[batch_entry('13:00',expected,third['profile']),batch_entry('14:00',expected,third['profile'])]
    failed_batch,_=rpc('save_schedule_batch',{'entries':failing_entries,'deleted_masses':[]},a)
    after_rollback,after_mass=req(REST,'/masses?id=eq.'+mass+'&select=time,schedule_revision',token=service)
    _,slots_after_rollback=req(REST,'/schedule_slots?mass_id=eq.'+mass+'&select=id,profile_id',token=service)
    _,history_after_rollback=req(REST,'/schedule_assignment_history?mass_id=eq.'+mass+'&select=id,slot_id,profile_id,event_type&order=id.asc',token=service)
    check('Falha no meio da RPC reverte celebração, vaga e histórico',failed_batch>=400 and after_rollback==200 and after_mass==before_rollback and slots_after_rollback==slots_before_rollback and history_after_rollback==history_before_rollback,'HTTP '+str(failed_batch)+'/'+str(after_rollback))
    p,_=rpc('set_masses_publication',{'target_mass_ids':[mass],'publish':True},a)
    status,visible=req(REST,'/schedule_slots?id=eq.'+slot+'&select=id',token=replacement['token'])
    check('Membro ativo lê vaga publicada',status==200 and isinstance(visible,list) and len(visible)==1,'HTTP '+str(status))
    q,_=rpc('perform_slot_action',{'target_slot_id':slot,'action_name':'request_swap'},replacement)
    t,_=rpc('perform_slot_action',{'target_slot_id':slot,'action_name':'accept_swap','requested_profile_id':third['profile']},third)
    hs,history=req(REST,'/schedule_assignment_history?slot_id=eq.'+slot+'&select=profile_id',token=service)
    check('Troca sucessiva preserva leitores anteriores',p<300 and q<300 and t<300 and hs==200 and any(x['profile_id']==reader['profile'] for x in history) and any(x['profile_id']==replacement['profile'] for x in history),'HTTP '+str(p)+'/'+str(q)+'/'+str(t))
    status,_=req(REST,'/profiles?select=last_seen_at&limit=1',token=service); check('Schema inclui last_seen_at usado por Analytics',status==200,'HTTP '+str(status))
    status,_=req(REST,'/profiles?id=eq.'+replacement['profile'],'PATCH',{'last_seen_at':'2026-10-31T12:00:00Z'},replacement['token'])
    check('Conta ativa atualiza last_seen_at próprio',status in (200,204),'HTTP '+str(status))
    barrier=Barrier(2)
    def demote(actor,target):
        barrier.wait()
        return rpc('set_member_role',{'target_profile_id':target['profile'],'new_role':'reader'},actor)[0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        role_results=list(pool.map(lambda pair: demote(*pair),[(a,accounts['admin2']),(accounts['admin2'],a)]))
    status,remaining_a=req(REST,'/profiles?id=eq.'+a['profile']+'&role=eq.admin&archived_at=is.null&select=id',token=service)
    status_b,remaining_b=req(REST,'/profiles?id=eq.'+accounts['admin2']['profile']+'&role=eq.admin&archived_at=is.null&select=id',token=service)
    check('Concorrência entre alterações de papel preserva um administrador',sum(200<=code<300 for code in role_results)==1 and status==200 and status_b==200 and len(remaining_a)+len(remaining_b)==1,'HTTP '+str(role_results)+'/'+str(status)+'/'+str(status_b))
    archive_a=accounts['admin_archive_a']; archive_b=accounts['admin_archive_b']
    status,all_admins=req(REST,'/profiles?role=eq.admin&archived_at=is.null&select=id',token=service)
    if status!=200 or not isinstance(all_admins,list): raise RuntimeError('Cannot isolate last-admin concurrency fixtures')
    for item in all_admins:
        if item['id'] not in (archive_a['profile'],archive_b['profile']):
            demote_status,_=req(REST,'/profiles?id=eq.'+item['id'],'PATCH',{'role':'reader'},token=service)
            if demote_status not in (200,204): raise RuntimeError('Could not isolate last-admin concurrency fixtures')
    status,only_pair=req(REST,'/profiles?role=eq.admin&archived_at=is.null&select=id',token=service)
    if status!=200 or {item['id'] for item in only_pair}!={archive_a['profile'],archive_b['profile']}:
        raise RuntimeError('Last-admin concurrency fixtures are not isolated')
    barrier=Barrier(2)
    def archive(actor,target):
        barrier.wait()
        return rpc('archive_member',{'target_profile_id':target['profile']},actor)[0]
    with ThreadPoolExecutor(max_workers=2) as pool:
        archive_results=list(pool.map(lambda pair: archive(*pair),[(archive_a,archive_b),(archive_b,archive_a)]))
    status,last_admin=req(REST,'/profiles?role=eq.admin&archived_at=is.null&select=id',token=service)
    check('Concorrência ao inativar os dois últimos administradores preserva um acesso',sum(200<=code<300 for code in archive_results)==1 and status==200 and len(last_admin)==1,'HTTP '+str(archive_results)+'/'+str(status))
    print('SUMMARY '+str(len(failures))+' falha(s)',flush=True)
    if failures: raise SystemExit(1)
if __name__=='__main__':
    try: main()
    except (RuntimeError,KeyError,IndexError,TypeError) as e: print('ABORT '+str(e),flush=True); raise SystemExit(2)
