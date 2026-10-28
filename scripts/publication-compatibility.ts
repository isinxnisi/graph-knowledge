// Same fixed probe is bundled into the Web image and run by the ops image.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { publicationCapabilities, publicationContract, assertPublicationCompatibility, serializePublicationFixture } from "../lib/server/publication-compatibility";
const [mode, directory] = process.argv.slice(2);
let result: unknown;
if (mode === "capabilities" && !directory) result = publicationCapabilities();
else if (mode === "serialize" && directory) result = serializePublicationFixture(JSON.parse(readFileSync(directory, "utf8")));
else if (["contract", "verify"].includes(mode) && directory) {
 const contract = publicationContract(readFileSync(join(directory, "data.json"), "utf8"), readFileSync(join(directory, "manifest.json"), "utf8"));
 if (mode === "contract") result = contract;
 else {
  if (!isDeepStrictEqual(contract, JSON.parse(readFileSync(join(directory, "compatibility.json"), "utf8")))) throw Error("Sealed compatibility contract differs from the candidate bytes");
  const capabilities = publicationCapabilities();
  assertPublicationCompatibility(contract, capabilities);
  result = { verified: true, contract, capabilities };
 }
} else throw Error("capabilities | serialize <data.json> | contract|verify <release directory>");
console.log(JSON.stringify(result));
