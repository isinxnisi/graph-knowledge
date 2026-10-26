/** Beta-only clone initialization and additive trial projection. Never a public release. */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../lib/server/neo4j";
import { createPublicBackup, restorePublicBackup, validatePublicBackup } from "../lib/server/public-backup";
import { publicGraph, publicGraphDigest, readPublicGraph } from "../lib/server/public-graph";
import { combineAcceptedFixtures } from "../lib/server/public-dataset";
import { fixtureV4Schema } from "../lib/domain/fixture";
import { filmBetaEnabled, FILM_BETA_REVISION } from "../lib/server/film-beta";
import { stableJson } from "../lib/server/public-dataset";
const [command, backupPath, recordsPath, output] = process.argv.slice(2);
if (!filmBetaEnabled() || !["clone", "project"].includes(command) || !backupPath || !recordsPath || !output) throw Error("Beta-only clone/project requires explicit backup, reviewed records and output paths");
const backup = validatePublicBackup(JSON.parse(await readFile(backupPath, "utf8")));
const original = JSON.parse(await readFile(recordsPath, "utf8")).records;
const candidate = fixtureV4Schema.parse({ schemaVersion:4, ...original });
if (candidate.claims.length !== 2 || candidate.entities.length !== 3 || candidate.claims.some(c => c.visibility !== "hidden" || c.contribution?.scope !== null || !["ACTING", "DIRECTING"].includes(c.contribution?.roleId ?? ""))) throw Error("Only the reviewed two hidden film Claims are supported");
const trial = fixtureV4Schema.parse({...candidate,claims:candidate.claims.map(c=>({...c,visibility:"published" as const}))});
const merged = combineAcceptedFixtures([backup.payload.fixture, trial]);
const {driver,database} = openDatabase();
try {
 const session = driver.session({database});
 try {
  if (command === "clone") {
   const n = (await session.run("MATCH (n) RETURN count(n) AS n")).records[0].get("n").toNumber();
   if (n !== 0) throw Error("Only a new empty isolated beta database may be cloned");
   await restorePublicBackup(driver,database,backup,"empty");
   const restored = await createPublicBackup(driver,database);
   if (stableJson(restored.payload.fixture)!==stableJson(backup.payload.fixture) || restored.payload.graphDigest!==backup.payload.graphDigest ||
       stableJson(restored.payload.receipts)!==stableJson(backup.payload.receipts)) throw Error("Restored beta clone differs from original backup");
   await writeFile(output,JSON.stringify({restored:true,baseRevision:backup.payload.revision,graphDigest:backup.payload.graphDigest,counts:{entities:backup.payload.fixture.entities.length,claims:backup.payload.fixture.claims.length},formalAcceptance:false})+"\n",{flag:"wx",mode:0o600});
  } else {
   const expected = publicGraph(merged,backup.payload.withdrawals);
   await session.executeWrite(async tx=>{
    const states=(await tx.run("MATCH (s:DatasetState {id:'public-kg'}) RETURN properties(s) AS p")).records;
    if(states.length!==1 || states[0].get("p").backupChecksum!==backup.checksum) throw Error("Not the verified beta clone");
    if((await tx.run("MATCH (s:FilmBetaState) RETURN count(s) AS n")).records[0].get("n").toNumber()!==0) throw Error("Film beta already initialized; do not reapply");
    const before=await readPublicGraph(tx);
    if(publicGraphDigest(before)!==backup.payload.graphDigest) throw Error("Beta clone drift before trial projection");
    const additions=Object.entries(expected.nodes).filter(([k])=>!before.nodes[k]);
    for(const [k,n] of Object.entries(before.nodes)) if(stableJson(n)!==stableJson(expected.nodes[k])) throw Error("Trial must preserve every original KG record");
    const identity=(key:string)=>expected.nodes[key].label==="ExternalIdentifier" ? (backup.payload.externalNodeIds[key]??externalIds.get(key)!) : expected.nodes[key].properties.id;
    const externalIds=new Map(additions.filter(([,n])=>n.label==="ExternalIdentifier").map(([k])=>[k,randomUUID()]));
    for(const [key,node] of additions) {
     if(!["Entity","Claim","Source","Citation","ExternalIdentifier"].includes(node.label)) throw Error("Unexpected label");
     await tx.run("CREATE (n:"+node.label+") SET n=$props",{props:{...node.properties,...(node.label==="ExternalIdentifier"?{id:identity(key)}:{})}});
    }
    const oldEdges=new Set(before.edges.map(e=>stableJson(e)));
    for(const edge of expected.edges.filter(e=>!oldEdges.has(stableJson(e)))) {
     if(!["SUBJECT","OBJECT","HAS_CITATION","CITES","HAS_EXTERNAL_ID"].includes(edge.type)) throw Error("Unexpected edge");
     await tx.run("MATCH (s:"+expected.nodes[edge.from].label+" {id:$from}),(t:"+expected.nodes[edge.to].label+" {id:$to}) CREATE (s)-[:"+edge.type+"]->(t)",{from:identity(edge.from),to:identity(edge.to)});
    }
    if(publicGraphDigest(await readPublicGraph(tx))!==publicGraphDigest(expected)) throw Error("Trial projection differs");
    await tx.run("CREATE (b:FilmBetaState {id:'issue43', revision:$revision, baseRevision:$base, formalAcceptance:false, productionPublished:false})",{revision:FILM_BETA_REVISION,base:backup.payload.revision});
    await tx.run("MATCH (s:DatasetState {id:'public-kg'}) SET s.release=$revision,s.revision=$revision,s.graphDigest=$digest",{revision:FILM_BETA_REVISION,digest:publicGraphDigest(expected)});
   },{timeout:60000});
   let blocked=false;
   try {await createPublicBackup(driver,database);} catch(e) {blocked=String(e).includes("cannot be exported");}
   if(!blocked) throw Error("Trial leaked into public backup path");
   await writeFile(output,JSON.stringify({projected:true,revision:FILM_BETA_REVISION,entities:merged.entities.length,claims:merged.claims.length,baseUnchanged:true,publicBackupBlocked:true,formalAcceptance:false})+"\n",{flag:"wx",mode:0o600});
  }
 }finally{await session.close();}
}finally{await driver.close();}
