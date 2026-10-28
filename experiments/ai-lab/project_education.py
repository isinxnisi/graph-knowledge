"""Private sealed evidence -> strict public education observation; never raw/model files."""
from pathlib import Path
import argparse
from core import digest,file_hash,read_json,require,wire,uid
from runtime import read_sealed,EXPECTED_MODEL
from curriculum import generate,validate_splits

def project(home,identifier):
    kind,run_id=identifier.split(':');uid(run_id)
    require(kind in ['cycle','probe'],'projection_kind')
    if kind=='cycle':
        result=read_sealed(home/'cycles'/run_id/'result.json');require(result['mode']=='real','dry_run_not_public')
        measured=read_sealed(home/'experiments'/result['experimentId']/'result.json') if result.get('experimentId') else None
        tasks=result['tasks'] if measured else []
        if tasks:
            require(digest(measured)==result['experimentSha256'],'experiment_binding')
            expected={'purpose':'structural-education-candidate','train':next(t['request'] for t in tasks if t['split']=='train'),'target':next(t['expectedChoice'] for t in tasks if t['split']=='train'),'holdout':[t['request'] for t in tasks if t['split']=='holdout']}
            require(measured['inputSha256']==digest(expected),'model_input_binding')
            curriculum=read_sealed(home/'cycles'/run_id/'curriculum.json')
            require(digest(curriculum)==result['inputSha256'] and all(t in curriculum['tasks'] for t in tasks),'curriculum_projection_binding');validate_splits(tasks)
        started=result['startedAt'];finished=result['finishedAt'];code=result['codeCommit'];source=result['sourceSha256']
    else:
        result=read_sealed(home/'experiments'/run_id/'result.json');measured=result;tasks=[]
        require(result['purpose']=='synthetic-infrastructure-only','synthetic_probe_binding')
        intent=read_sealed(home/'experiments'/run_id/'intent.json')
        started=result['startedAt'];finished=result['finishedAt'];source=intent['sourceSha256']
        provenance=read_sealed(home/'experiments'/run_id/'provenance.json') if not intent.get('codeCommit') else intent
        require(provenance.get('sourceSha256')==source,'probe_source_binding');code=provenance['codeCommit']
    events=[(s['phase'],e) for s in measured['stages'] for e in s['events']] if measured else []
    find=lambda name:next((e for _,e in events if e['stage']==name),None)
    frozen=find('frozen');optimizer=find('optimizer');saved=find('saved');reloaded=find('reloaded')
    if saved:
        directory=home/'experiments'/(result['experimentId'] if kind=='cycle' else run_id)/'output'
        for name,info in saved['files'].items():
            require(not Path(name).is_absolute() and '..' not in Path(name).parts,'checkpoint_path')
            require(file_hash(directory/name)==info['sha256'],'checkpoint_changed')
    if measured:
        require(measured['optimizerUpdates']==int(optimizer is not None),'optimizer_receipt')
        if optimizer:require(optimizer['frozenUnchanged'] and optimizer['frozenAfterSha256']==frozen['frozenSha256'] and optimizer['trainableAfterSha256']!=frozen['trainableBeforeSha256'],'weight_update_receipt')
    public_tasks=[{key:t[key] for key in ['taskId','split','kind','objective','originId','componentSha256','entities','paths','expectedChoice','evaluationBasis','semanticReview','sourceSnapshotSha256']} for t in tasks]
    comparison=result.get('comparison') if kind=='cycle' else None
    calls=sum(len(e['evaluations']) for _,e in events if 'evaluations' in e) if kind=='cycle' else 0
    return {**({'educationPolicy':result['educationPolicy']} if result.get('educationPolicy') else {}),'cycleId':run_id,'kind':'structural-education' if kind=='cycle' else 'synthetic-infrastructure',
            'status':result['status'],'reason':result['reason'],'startedAt':started,'finishedAt':finished,
            'codeCommit':code,'sourceSha256':source,'resultSha256':digest(result),
            'modelRevision':EXPECTED_MODEL['model_revision'],'baseRevision':EXPECTED_MODEL['base_revision'],
            'tasks':public_tasks,'inferenceCalls':calls,'training':{
                'optimizerUpdates':int(optimizer is not None),'frozenUnchanged':optimizer['frozenUnchanged'] if optimizer else None,
                'beforeSha256':frozen['trainableBeforeSha256'] if frozen else None,'afterSha256':optimizer['trainableAfterSha256'] if optimizer else None,
                'checkpointSaved':saved is not None,'checkpointReloaded':reloaded is not None,
                'checkpointSha256':digest(saved['files']) if saved else None,'adopted':False},
            'comparison':comparison,'stages':[{'phase':phase,'name':e['stage'],'elapsedSeconds':e['wallSeconds'],
                'cpuSeconds':e['cpuSeconds'],'peakRssMiB':e['peakRssMiB']} for phase,e in events],
            'limits':{'ramMiB':6144,'cpus':2,'wallSeconds':180,'outputMiB':256},
            'nextTasks':result.get('improvementCandidates',[]) if tasks else [],'semanticReview':'pending-human','generalizationEvidence':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('home',type=Path);p.add_argument('identifier');a=p.parse_args()
    print(wire(project(a.home,a.identifier)))
