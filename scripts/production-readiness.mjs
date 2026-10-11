// 接続できるだけでなく、共通KGの受入releaseを読み取れる時だけready。
try {
  const response = await fetch("http://127.0.0.1:3000/api/dataset", { signal: AbortSignal.timeout(8000) });
  const body = await response.json();
  if (!response.ok || body.dataset !== "public-kg" || typeof body.revision !== "string" || !body.revision) process.exitCode = 1;
} catch { process.exitCode = 1; }
