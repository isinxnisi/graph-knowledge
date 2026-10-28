"""Project sealed exchange evidence, preserving original cycle observations."""
import argparse
from pathlib import Path
from core import digest,wire,require
from runtime import read_sealed
from mentorship import sha,checked
from project_education import project

def project_reviews(home):
    records=[]
    for file in sorted((home/'mentorship/decisions').glob('*.json')):
        d=read_sealed(file)
        if d['status']!='accepted':continue
        plan=read_sealed(home/'mentorship/plans'/(d['planSha256']+'.json'));p=checked(plan)
        report=read_sealed(home/'mentorship/reports'/(d['reportSha256']+'.json'));r=checked(report)
        require(plan['sha256']==d['planSha256'] and report['sha256']==p['reportSha256']==d['reportSha256'],'projection_binding')
        for c in r['cycles']:require(project(home,'cycle:'+c['cycleId'])['resultSha256']==c['resultSha256'],'projection_cycle_changed')
        receipt=read_sealed(home/'mentorship/outbox'/('report-'+report['sha256'])/'receipt.json')
        if receipt['status']=='unknown-no-resend':receipt=read_sealed(home/'mentorship/outbox'/('report-'+report['sha256'])/'reconciliation.json')
        require(receipt['sha256']==report['sha256'] and receipt['status'] in ['published','reconciled'],'report_not_published')
        selections=[read_sealed(f) for f in (home/'mentorship/selections').glob('*.json')]
        selections=sorted([s for s in selections if s['planSha256']==plan['sha256']],key=lambda s:s['recordedAt'])
        selection=selections[0] if selections else None
        records.append({'reviewId':sha({'report':report['sha256'],'plan':plan['sha256'],'decision':digest(d),'selection':selection['selectionId'] if selection else None}),
            'report':report,'plan':plan,'reportTransport':receipt['transport'],'decision':d,'selection':selection})
    return {'version':'education-policy-v1','records':records,'capabilities':{'githubRead':'verified','githubWrite':'verified','interactiveAi':'verified','chatgptScheduled':'not-verified','dailySchedule':'not-configured'}}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('home',type=Path);a=p.parse_args();print(wire(project_reviews(a.home)))
