// Offline comparison of an applied, root-verified immutable artifact. Never a live backup.
import {loadPublicRelease} from '../lib/server/public-dataset';
import {publicGraph,planPublicGraph} from '../lib/server/public-graph';
import {graphIdentities,mergeIdentities} from '../lib/server/public-identities';
const [baseDirectory,candidateDirectory,revision]=process.argv.slice(2);
if(!baseDirectory||!candidateDirectory||!revision||process.argv.length!==5)throw Error('fixed base/candidate/revision required');
const base=await loadPublicRelease(baseDirectory),candidate=await loadPublicRelease(candidateDirectory);
if(candidate.manifest.baseRelease!==base.manifest.release||candidate.manifest.release===base.manifest.release)throw Error('Published base differs');
const before=publicGraph(base.fixture,base.manifest.withdrawals),after=publicGraph(candidate.fixture,candidate.manifest.withdrawals);
mergeIdentities(graphIdentities(before),graphIdentities(after));
const plan=planPublicGraph(before,after);
if(plan.updated.length)throw Error('Existing records changed');
console.log(JSON.stringify({release:candidate.manifest.release,observation:'root-verified-applied-artifact-offline-not-live-plan',backupRevision:revision,...plan}));
