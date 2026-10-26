import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { validatePublicBackup } from '../lib/server/public-backup';
const [input]=process.argv.slice(2);if(!input)throw Error('Explicit public backup input required');
const backup=validatePublicBackup(JSON.parse(await readFile(input,'utf8')));
const bytes=gzipSync(Buffer.from(JSON.stringify(backup.payload.fixture)));
const sha256=createHash('sha256').update(bytes).digest('hex');
await writeFile('experiments/ai-lab/data/curriculum-public.json.gz',bytes,{flag:'wx'});
await writeFile('experiments/ai-lab/data/curriculum-source.json',JSON.stringify({version:1,sha256,backupChecksum:backup.checksum,
  graphDigest:backup.payload.graphDigest,revision:backup.payload.revision,savedAt:backup.payload.savedAt,
  release:backup.payload.release,source:'validated public KG backup; no credentials or private user data'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sha256,revision:backup.payload.revision,entities:backup.payload.fixture.entities.length,claims:backup.payload.fixture.claims.length}));
