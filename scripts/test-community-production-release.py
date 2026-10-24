import runpy,pathlib,copy,yaml
root=pathlib.Path(__file__).resolve().parents[1]
m=runpy.run_path(str(root/'scripts/release-community-production.py'))
text=(root/'compose.production.yaml').read_text()
before=yaml.safe_load(text);aftertext=m['service_patch'](m['service_patch'](text,'web','tested-web'),'member-ops','tested-member-ops');after=yaml.safe_load(aftertext)
expected=copy.deepcopy(before);expected['services']['web']['image']='tested-web';expected['services']['member-ops']['image']='tested-member-ops'
assert after==expected
# Older production has none of the three Web flags; add exactly those keys.
old=text
for key in m['FLAGS']:
 import re
 old=re.sub(r'^      '+key+r':.*\n','',old,flags=re.M)
before=yaml.safe_load(old);patched=m['service_patch'](m['service_patch'](old,'web','new-web'),'member-ops','new-member-ops');after=yaml.safe_load(patched)
expected=copy.deepcopy(before);expected['services']['web']['image']='new-web';expected['services']['member-ops']['image']='new-member-ops'
for k in m['FLAGS']:expected['services']['web']['environment'][k]='${'+k+(':-}' if k=='SITE_OPERATOR_USER_IDS' else ':-0}')
assert after==expected
original='MEMBER_ORIGIN=https://plunode.net\nSECRET=unmodified\n'
for on in [False,True]:
 e=m['flag_env'](original,on,'00000000-0000-0000-0000-000000000001');assert e.startswith(original)
 assert e.count('COMMUNITY_ENABLED=')==1
 assert m['flag_env'](e,on,'00000000-0000-0000-0000-000000000001')==e
assert yaml.safe_load(text)['services']['ops']==after['services']['ops']
print('Existing and missing flag handoff, idempotent dotenv update, semantic equality of every unrelated Compose setting: PASS')