import "server-only";
import { cache } from "react";
import { datasetMode } from "../domain/dataset";
import { memberRuntime } from "./member/runtime";
import { MemberError } from "./member/http";
import { readSharedPublication } from "./member/shared-publication";
export const capsulePreview = cache(async (token:string, rawRevision?:string) => {
  if (rawRevision!==undefined && !/^[1-9]\d*$/.test(rawRevision)) return null;
  try { const {pool}=memberRuntime(); return await readSharedPublication(pool,datasetMode(process.env.GRAPH_DATASET),token,rawRevision===undefined?undefined:Number(rawRevision)); }
  catch(error) { if(error instanceof MemberError && error.status===404) return null; throw error; }
});
