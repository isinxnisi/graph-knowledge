import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).parents[1]


class GoogleDiagnostic(unittest.TestCase):
    def test_probe_redacts_payload_errors_and_credentials(self):
        script = r'''
import {diagnoseGoogle} from './scripts/diagnose-google-token.mjs';
import {createHash} from 'node:crypto';
const env={MEMBER_ORIGIN:'https://plunode.net',MEMBER_GOOGLE_CLIENT_ID:'private-test-client',MEMBER_GOOGLE_CLIENT_SECRET:'private-test-secret'};
const hash=x=>createHash('sha256').update(x).digest('hex');
const expected={clientIdHash:hash(env.MEMBER_GOOGLE_CLIENT_ID),clientSecretHash:hash(env.MEMBER_GOOGLE_CLIENT_SECRET)};
const results=[];
for(const mode of ['invalid_grant','invalid_client','untrusted-error','transport']){
 results.push(await diagnoseGoogle(env,expected,async(url,options)=>{
  if(options.redirect!=='manual')throw Error('test requires no redirects');
  if(mode==='transport')throw Object.assign(Error('private-test-secret'),{cause:{code:'ENOTFOUND',message:'private-test-client'}});
  if(url.endsWith('/certs'))return new Response('{}',{status:200});
  if(options.body.get('code')!=='plunode-diagnostic-invalid-code')throw Error('unexpected real code');
  return new Response(JSON.stringify({error:mode,error_description:'private-test-secret',access_token:'private-test-token'}),{status:400});
 }));
}
results.push(await diagnoseGoogle({...env,MEMBER_GOOGLE_CLIENT_SECRET:'different'},expected,async()=>new Response('{}',{status:200})));
console.log(JSON.stringify(results));
'''
        result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0)
        for secret in ['private-test-client', 'private-test-secret', 'private-test-token', 'error_description']:
            self.assertNotIn(secret, result.stdout + result.stderr)
        values = json.loads(result.stdout)
        self.assertEqual(values[0]['token'], {'status': 400, 'error': 'invalid_grant'})
        self.assertEqual(values[1]['token']['error'], 'invalid_client')
        self.assertEqual(values[2]['token']['error'], 'redacted')
        self.assertEqual(values[3]['token']['codes'], ['ENOTFOUND'])
        self.assertTrue(values[0]['clientSecretMatches'])
        self.assertFalse(values[4]['clientSecretMatches'])


if __name__ == '__main__':
    unittest.main()
