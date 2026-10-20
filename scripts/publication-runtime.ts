// Fixed publication adapter commands. No restore, shell, web or member operations.
import { createPublicBackup } from '../lib/server/public-backup';
import { loadPublicRelease, sha256, stableJson } from '../lib/server/public-dataset';
import { applyPublicRelease, publicGraph, publicGraphDigest } from '../lib/server/public-graph';
import { openDatabase } from '../lib/server/neo4j';
import { fixtureCounts } from '../lib/domain/fixture';
import { roleIdSchema } from '../lib/domain/contribution';
const [command, revision] = process.argv.slice(2);
if (command === 'capabilities' && process.argv.length === 3) {
  roleIdSchema.parse('ORIGINAL_STORY');
  console.log(JSON.stringify({schemaVersion:1, originalStory:true, guardedApply:true}));
} else {
  if (!['observe','apply','verify'].includes(command) || process.argv.length !== (command === 'apply' ? 4 : 3)) throw Error('Fixed command required');
  if (process.env.GRAPH_DEPLOYMENT !== 'production' || process.env.GRAPH_DATASET !== 'public-kg') throw Error('Explicit public KG target required');
  const {driver,database}=openDatabase();
  try {
    if (command === 'apply') {
      if (!revision) throw Error('Expected revision required');
      const release=await loadPublicRelease('/incoming');
      console.log(JSON.stringify(await applyPublicRelease(driver,database,release,{expectedRevision:revision,additionsOnly:true})));
    } else {
      const backup=await createPublicBackup(driver,database);
      if (command === 'observe') console.log(JSON.stringify(backup));
      else {
        const release=await loadPublicRelease('/incoming');
        const receipt=backup.payload.receipts.find(r=>r.id===release.manifest.release);
        if (backup.payload.release!==release.manifest.release || !receipt || receipt.digest!==sha256(stableJson(release.manifest)) || receipt.dataSha256!==release.manifest.dataSha256
            || backup.payload.graphDigest!==publicGraphDigest(publicGraph(release.fixture,release.manifest.withdrawals))) throw Error('Published receipt/graph differs');
        console.log(JSON.stringify({verified:true,release:backup.payload.release,revision:backup.payload.revision,
          manifestDigest:receipt.digest,dataSha256:receipt.dataSha256,counts:fixtureCounts(backup.payload.fixture)}));
      }
    }
  } finally {await driver.close();}
}
