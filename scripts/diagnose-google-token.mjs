// Production troubleshooting only. Never print credentials, URLs with codes,
// raw errors, response bodies, tokens, email or state values.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const hash = value => createHash('sha256').update(value ?? '').digest('hex');
const safeErrors = new Set(['invalid_grant', 'invalid_client', 'invalid_request', 'unauthorized_client']);
const safeTransport = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT']);
function transportCodes(error, depth = 0) {
  if (!error || depth > 3) return [];
  return [...new Set([
    ...(safeTransport.has(error.code) ? [error.code] : []),
    ...transportCodes(error.cause, depth + 1),
    ...(Array.isArray(error.errors) ? error.errors.flatMap(value => transportCodes(value, depth + 1)) : []),
  ])];
}

export async function diagnoseGoogle(env, expected, fetcher = fetch) {
  const result = {
    originMatches: env.MEMBER_ORIGIN === 'https://plunode.net',
    clientIdMatches: hash(env.MEMBER_GOOGLE_CLIENT_ID) === expected.clientIdHash,
    clientSecretMatches: hash(env.MEMBER_GOOGLE_CLIENT_SECRET) === expected.clientSecretHash,
  };
  for (const name of ['jwks', 'token']) {
    try {
      const response = await fetcher(name === 'jwks' ? 'https://www.googleapis.com/oauth2/v3/certs' : 'https://oauth2.googleapis.com/token', {
        signal: AbortSignal.timeout(15000), redirect: 'manual',
        ...(name === 'token' ? {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: env.MEMBER_GOOGLE_CLIENT_ID ?? '', client_secret: env.MEMBER_GOOGLE_CLIENT_SECRET ?? '',
            code: 'plunode-diagnostic-invalid-code', grant_type: 'authorization_code', redirect_uri: 'https://plunode.net/api/auth/callback/google' }),
        } : {}),
      });
      result[name] = { status: response.status };
      if (name === 'token') {
        const body = await response.json().catch(() => null);
        result[name].error = safeErrors.has(body?.error) ? body.error : 'redacted';
      } else await response.body?.cancel();
    } catch (error) { result[name] = { transportFailure: true, codes: transportCodes(error) }; }
  }
  return result;
}

if (process.env.PLUNODE_DIAGNOSTIC_RUN === '1') {
  try {
    console.log(JSON.stringify(await diagnoseGoogle(process.env, JSON.parse(readFileSync(0, 'utf8')))));
    console.log('人工の無効codeによる疎通確認です。invalid_grantはこのprobeの想定結果で、本人callbackの原因確定ではありません。');
  } catch { console.error('診断を実行できませんでした。詳細値は表示しません。'); process.exitCode = 1; }
}
