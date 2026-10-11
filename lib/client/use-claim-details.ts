import { useEffect, useRef, useState } from "react";
import type { ClaimDetail, ClaimResponse } from "../domain/api";
import { ClientApiError, errorMessage, fetchClaim } from "./api";

type Request = { kind: "primary" | "related"; ids: string[] };

// The owning detail session is keyed by Claim ID. Changing selection unmounts it,
// aborting the whole batch; even a transport that ignores abort cannot update it.
export function useClaimDetails(id: string, revision?: string, onDataChanged?: () => void) {
  const batchRevision = useRef(revision);
  const [primary, setPrimary] = useState<ClaimResponse | null>(null);
  const [related, setRelated] = useState<ClaimDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [pending, setPending] = useState(1);
  const [request, setRequest] = useState<Request>({ kind: "primary", ids: [id] });

  useEffect(() => {
    const controller = new AbortController();
    if (request.kind === "primary") {
      void (revision ? fetchClaim(request.ids[0], controller.signal, revision) : fetchClaim(request.ids[0], controller.signal)).then(result => {
        if (controller.signal.aborted) return;
        batchRevision.current = result.revision ?? revision;
        setPrimary(result);
        setPending(result.relatedClaimIds.length);
        if (result.relatedClaimIds.length) setRequest({ kind: "related", ids: result.relatedClaimIds });
      }).catch(error => {
        if (controller.signal.aborted) return;
        if (error instanceof ClientApiError && error.status === 409) onDataChanged?.();
        setError(errorMessage(error));
        setPending(0);
      });
    } else {
      for (const relatedId of request.ids) {
        void (batchRevision.current ? fetchClaim(relatedId, controller.signal, batchRevision.current) : fetchClaim(relatedId, controller.signal)).then(result => {
          if (controller.signal.aborted) return;
          setRelated(claims => [...claims, result.claim].sort((a, b) => a.id.localeCompare(b.id)));
        }).catch(error => {
          if (!controller.signal.aborted) {
            if (error instanceof ClientApiError && error.status === 409) onDataChanged?.();
            setFailedIds(ids => [...ids, relatedId]);
          }
        }).finally(() => {
          if (!controller.signal.aborted) setPending(count => count - 1);
        });
      }
    }
    return () => controller.abort();
  }, [request, revision, onDataChanged]);

  function retry() {
    if (pending > 0) return;
    const ids = primary ? failedIds : [id];
    if (!ids.length) return;
    setError(null);
    setFailedIds([]);
    setPending(ids.length);
    setRequest({ kind: primary ? "related" : "primary", ids });
  }

  return { primary, related, error, failedCount: failedIds.length, pending, retry };
}
