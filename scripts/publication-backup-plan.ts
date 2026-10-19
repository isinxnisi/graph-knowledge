// Offline graph comparison only. This never opens a database or claims to be a fresh VPS plan.
import fs from 'node:fs';
import { validatePublicBackup } from '../lib/server/public-backup';
import { loadPublicRelease } from '../lib/server/public-dataset';
import { publicGraph, planPublicGraph } from '../lib/server/public-graph';
import { graphIdentities, mergeIdentities } from '../lib/server/public-identities';
const [backupPath, directory, expectedRevision] = process.argv.slice(2);
if (!backupPath || !directory || !expectedRevision || process.argv.length !== 5) throw Error('backup release expected-revision required');
const backup = validatePublicBackup(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
const release = await loadPublicRelease(directory);
if (backup.payload.revision !== expectedRevision || backup.payload.release !== release.manifest.baseRelease) throw Error('Backup revision/base differs');
if (backup.payload.receipts.some(r => r.id === release.manifest.release)) throw Error('Candidate release ID already used');
const after = publicGraph(release.fixture, release.manifest.withdrawals);
mergeIdentities(backup.payload.identities ?? [], graphIdentities(after));
const plan = planPublicGraph(publicGraph(backup.payload.fixture, backup.payload.withdrawals), after);
if (plan.updated.length) throw Error('Publication must not update existing records');
console.log(JSON.stringify({release:release.manifest.release, observation:'validated-backup-offline-not-a-live-vps-plan',
  backupRevision:backup.payload.revision, ...plan}, null, 2));
