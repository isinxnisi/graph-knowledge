"""Fixed-repository outbound exchange; one POST, durable outbox, no secret persistence."""
import argparse
import base64
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import uuid
from core import require,wire,read_json,digest
from runtime import held,now,read_sealed,sealed_write
from mentorship import HOME,checked,envelope,report,admit,sha

PREFIX='/repos/isinxnisi/graph-knowledge'
COMMENTS=PREFIX+'/issues/36/comments'
MAX_BYTES=32000

def credentials():
    token=os.environ.get('PLUNODE_EDUCATION_GITHUB_TOKEN')
    if token:return token,'process-environment'
    helper=Path('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')
    require(helper.is_file(),'github_credential_unavailable')
    env={**os.environ,'GCM_INTERACTIVE':'never','GIT_TERMINAL_PROMPT':'0'}
    # Native Windows Git owns the existing credential store; never export it to disk.
    script="""$env:GCM_INTERACTIVE='Never'; $env:GIT_TERMINAL_PROMPT='0'
$s=New-Object System.Diagnostics.ProcessStartInfo
$s.FileName='C:\\Program Files\\Git\\cmd\\git.exe'; $s.Arguments='-c credential.interactive=never credential fill'
$s.UseShellExecute=$false; $s.CreateNoWindow=$true
$s.RedirectStandardInput=$true; $s.RedirectStandardOutput=$true; $s.RedirectStandardError=$true
$p=New-Object System.Diagnostics.Process; $p.StartInfo=$s; [void]$p.Start()
$p.StandardInput.Write("protocol=https`nhost=github.com`n`n"); $p.StandardInput.Close()
$answer=$p.StandardOutput.ReadToEnd(); $err=$p.StandardError.ReadToEnd(); $p.WaitForExit()
if($p.ExitCode -ne 0){exit 1}; [Console]::Out.Write($answer)
"""
    encoded=base64.b64encode(script.encode('utf-16-le')).decode()
    result=subprocess.run([str(helper),'-NoProfile','-NonInteractive','-EncodedCommand',encoded],capture_output=True,text=True,errors='replace',timeout=45,env=env)
    require(result.returncode==0,'github_credential_unavailable')
    values=dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
    require(bool(values.get('password')),'github_credential_unavailable')
    return values['password'],'existing-credential-manager'

class Github:
    def __init__(self):self.token,self.credential_source=credentials()
    def request(self,method,path,body=None):
        require(path.startswith(COMMENTS) or method=='GET' and path in ['/user',PREFIX],'fixed_github_scope')
        data=wire(body).encode() if body is not None else None
        require(data is None or len(data)<=MAX_BYTES,'github_body_size')
        c=http.client.HTTPSConnection('api.github.com',timeout=20)
        try:
            c.request(method,path,body=data,headers={'Authorization':'Bearer '+self.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Plunode-Education-Exchange/1','Content-Type':'application/json'})
            r=c.getresponse();raw=r.read(1_000_001)
            require(len(raw)<=1_000_000,'github_response_size');require(200<=r.status<300,'github_http_'+str(r.status))
            return json.loads(raw)
        finally:c.close()
    def comments(self):
        rows=[]
        for page in range(1,11):
            chunk=self.request('GET',COMMENTS+f'?per_page=100&page={page}');require(type(chunk) is list,'github_list')
            rows.extend(chunk)
            if len(chunk)<100:return rows
        raise ValueError('github_pagination_budget')

def body_for(kind,value):
    checked(value);require(kind in ['report','plan','decision'],'exchange_kind')
    text=f'<!-- plunode-education-{kind}:v1:{value["sha256"]} -->\n```json\n'+wire(value)+'\n```'
    require(len(text.encode())<=MAX_BYTES,'github_body_size');return text

def parse_body(text,kind):
    require(type(text) is str and len(text.encode())<=MAX_BYTES,'github_body_size')
    match=re.fullmatch(r'<!-- plunode-education-'+kind+r':v1:([a-f0-9]{64}) -->\n```json\n(.+)\n```',text,re.S)
    require(match is not None,'exchange_marker')
    def unique(pairs):
        out={}
        for k,v in pairs:require(k not in out,'duplicate_json_key');out[k]=v
        return out
    value=json.loads(match[2],object_pairs_hook=unique);checked(value);require(match[1]==value['sha256'],'marker_binding');return value

def transport(row):
    require(type(row['id']) is int and row['html_url']==f'https://github.com/isinxnisi/graph-knowledge/issues/36#issuecomment-{row["id"]}','comment_scope')
    return {'commentId':row['id'],'url':row['html_url'],'author':row['user']['login']}

def post(home,kind,value,token,client=None):
    held(token);checked(value);client=client or Github();text=body_for(kind,value)
    directory=home/'mentorship/outbox'/f'{kind}-{value["sha256"]}'
    # Inspect remote first; a timed-out send can be reconciled, never blindly retried.
    existing=[r for r in client.comments() if r['user']['login']=='isinxnisi' and r.get('body')==text]
    require(len(existing)<=1,'duplicate_remote_exchange')
    if existing:
        result={'status':'reconciled','kind':kind,'sha256':value['sha256'],'transport':transport(existing[0]),'at':now()}
        if not (directory/'receipt.json').exists():sealed_write(directory/'receipt.json',result)
        previous=read_sealed(directory/'receipt.json')
        if previous['status']=='unknown-no-resend':
            if not (directory/'reconciliation.json').exists():sealed_write(directory/'reconciliation.json',result)
            return read_sealed(directory/'reconciliation.json')
        return previous
    if (directory/'intent.json').exists():return {'status':'unknown-no-resend','kind':kind,'sha256':value['sha256']}
    sealed_write(directory/'intent.json',{'at':now(),'kind':kind,'sha256':value['sha256'],'bodySha256':sha(text),'calls':1})
    try:
        row=client.request('POST',COMMENTS,{'body':text});require(row.get('body')==text,'posted_body_binding');t=transport(row);require(t['author']=='isinxnisi','writer_identity')
        result={'status':'published','kind':kind,'sha256':value['sha256'],'transport':t,'at':now()}
    except (ValueError,OSError,http.client.HTTPException):
        result={'status':'unknown-no-resend','kind':kind,'sha256':value['sha256'],'at':now()}
    sealed_write(directory/'receipt.json',result);return result

def pull(home,token,client=None):
    held(token);client=client or Github();decisions=[]
    for row in client.comments():
        if not row.get('body','').startswith('<!-- plunode-education-plan:v1:'):continue
        try:
            value=parse_body(row['body'],'plan');decisions.append(admit(home,value,transport(row),token))
        except (ValueError,KeyError,TypeError,json.JSONDecodeError):
            rejection={'at':now(),'commentId':row.get('id'),'bodySha256':sha(row.get('body','')),'reason':'invalid-exchange-no-execution'}
            path=home/'mentorship/rejections'/(sha({'commentId':row.get('id'),'body':row.get('body','')})+'.json')
            if not path.exists():sealed_write(path,rejection)
    return decisions

def configured(home):
    path=home/'mentorship/github-config.json'
    if not path.exists():return False
    c=read_json(path);require(c=={'version':1,'enabled':c.get('enabled')} and type(c['enabled']) is bool,'github_config');return c['enabled']

def synchronize(home,token):
    held(token)
    if not configured(home):return {'status':'disabled'}
    client=Github();sent=post(home,'report',report(home),token,client)
    return {'report':sent,'decisions':pull(home,token,client)}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--home',type=Path,default=HOME)
    sub=p.add_subparsers(dest='command',required=True)
    for command in ['probe','sync','pull','enable','disable']:
        q=sub.add_parser(command);q.add_argument('--token',required=True)
    q=sub.add_parser('post');q.add_argument('--token',required=True);q.add_argument('--kind',choices=['report','plan','decision'],required=True);q.add_argument('--file',type=Path,required=True)
    args=p.parse_args();held(args.token);home=args.home.resolve()
    if args.command in ['enable','disable']:
        from autonomy import atomic
        atomic(home/'mentorship/github-config.json',{'version':1,'enabled':args.command=='enable'});value={'status':args.command}
    elif args.command=='probe':
        client=Github();user=client.request('GET','/user');repo=client.request('GET',PREFIX)
        value={'at':now(),'authenticatedLogin':user['login'],'repository':repo['full_name'],'readVerified':True,'writeVerified':False,'credentialSource':client.credential_source,'scheduledChatgptVerified':False}
        sealed_write(home/'mentorship/probes'/(str(uuid.uuid4())+'.json'),value)
    elif args.command=='sync':value=synchronize(home,args.token)
    elif args.command=='pull':value=pull(home,args.token)
    else:value=post(home,args.kind,read_json(args.file),args.token)
    print(wire(value))

if __name__=='__main__':main()
