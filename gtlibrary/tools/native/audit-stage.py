"""Produce a source/operation ledger for a compiled stage; never certifies visual parity."""
import argparse,collections,hashlib,json,pathlib

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--stage',type=pathlib.Path,required=True);p.add_argument('--evidence',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();stage=json.loads(a.stage.read_text('utf8'));evidence=json.loads(a.evidence.read_text('utf8'));scenes=[]
    def visit(name,plan):
        operations=collections.Counter(c['op'] for c in plan.get('commands',[]));motions={c['id'] for c in plan.get('commands',[]) if c['op']=='move' and c.get('id')};unbound=[c['motion'] for c in plan.get('commands',[]) if c['op']=='awaitMotion' and c['motion'] not in motions]
        row={'name':name,'source':plan.get('source'),'blocking':plan.get('blocking',True),'duration':plan.get('duration'),'actors':[{'handle':v['handle'],'position':v.get('position'),'resource':v.get('resource')} for v in plan.get('actors',[])],'operations':dict(operations),'gameActions':plan.get('gameActions',[]),'motionWaitsWithoutLocalMotion':unbound,'nativeStationing':plan.get('nativeStationing'),'nativeAlignParty':plan.get('nativeAlignParty'),'notes':plan.get('notes'),'visualParity':'not-certified-by-static-audit'};scenes.append(row)
        for index,branch in enumerate(plan.get('branches',[])):visit(name+'/branch/'+str(index),branch)
    for name,plan in stage['scenes'].items():visit(name,plan)
    report={'schema':1,'stage':stage['id'],'map':stage['map'],'stageSha256':hashlib.sha256(a.stage.read_bytes()).hexdigest(),'source':stage.get('source'),'counts':{'scenes':len(stage['scenes']),'plansIncludingBranches':len(scenes),'actors':len(stage['actors']),'objects':len(stage['objects']),'markers':len(stage['markers']),'regions':len(stage['regions'])},'scenes':scenes,'nativeUnresolved':evidence.get('unresolved',[]),'legacyTraceAudit':stage.get('audit',{}),'nativeCodeRecovery':evidence.get('codeRecovery',{}),'notes':['This ledger describes the current compiled artifact, not a fresh native replay.','Legacy trace warnings may predate compiled native overrides; they require explicit triage rather than deletion.','Motion completion, trigger behavior and visual parity require focused runtime/native comparison.']}
    a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8');print(json.dumps(report['counts']))

if __name__=='__main__':main()
