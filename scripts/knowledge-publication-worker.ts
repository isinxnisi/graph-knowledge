/** Dedicated local publisher. It projects stored knowledge; it does not collect data. */
import {assertKnowledgeCapability,knowledgeDeployment} from "../lib/server/knowledge-deployment";
import { knowledgePublicationPreview, closeKnowledgePublicationPreview } from "../lib/server/knowledge-publication-preview";

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !["--once", "--force"].includes(arg)) || (args.has("--force") && !args.has("--once"))) throw new Error("Use --once [--force] for an explicit rebuild");
let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });
let failures = 0;
const retention = process.env.KNOWLEDGE_PUBLICATION_RETENTION_HOURS;
const retentionHours = retention === undefined ? null : Number(retention);
if(retentionHours !== null && (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 24*365))
  throw new Error("KNOWLEDGE_PUBLICATION_RETENTION_HOURS must be an integer between 1 and 8760");
let nextCleanup = 0;
try {
  const publication = await knowledgePublicationPreview(true);
  while (!stopping) {
    try {
      if(knowledgeDeployment())assertKnowledgeCapability("publisher");
      const result = await publication.publishPending({ force: args.has("--force") });
      if (result.state === "published") console.log(JSON.stringify({ at: new Date().toISOString(), event: "publication", result }));
      if (args.has("--once")) {
        if (result.state === "busy") throw new Error("Another publication is running; retry later");
        break;
      }
      failures = 0;
      if(retentionHours !== null && Date.now() >= nextCleanup){
        nextCleanup = Date.now() + 60_000;
        try{
          const retired = await publication.pruneRetired(retentionHours);
          if(retired) console.log(JSON.stringify({event:"publication-retention",...retired}));
        }catch{console.error(JSON.stringify({event:"publication-retention-retry"}));}
      }
    } catch {
      failures++;
      console.error(JSON.stringify({ at: new Date().toISOString(), event: "publication-retry", failures }));
      if (args.has("--once")) { process.exitCode = 1; break; }
    }
    const delay = Math.min(30000, failures ? 2000 * 2 ** Math.min(failures, 4) : 1500);
    for (let waited = 0; waited < delay && !stopping; waited += 250) await new Promise((resolve) => setTimeout(resolve, 250));
  }
} finally { await closeKnowledgePublicationPreview(); }
