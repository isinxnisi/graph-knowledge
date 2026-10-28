// Minimal producer shim for an older, already verified ops image. No adoption or hash bypass.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { fixtureV4Schema } from "../lib/domain/fixture";
if (process.argv.length !== 3) throw Error("A fixed JSON input file is required");
const input = JSON.parse(readFileSync(process.argv[2], "utf8")), parsed = fixtureV4Schema.parse(input);
if (!isDeepStrictEqual(input, parsed)) throw Error("Schema changed JSON values or fields");
const data = JSON.stringify(parsed, null, 2) + "\n";
console.log(JSON.stringify({ data, dataSha256: createHash("sha256").update(data).digest("hex"), serialization: "fixture-v4-schema-json-2lf-v1", valuesUnchanged: true }));
