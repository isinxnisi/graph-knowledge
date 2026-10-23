// Isolated JScript host doubles: no Scheduler, WSL, approvals or KG execution.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const xml = fs.readFileSync(path.join(__dirname, '../ops/publication-delivery-launcher.wsf'), 'utf8');
const script = xml.match(/<!\[CDATA\[([\s\S]*?)\]\]>/)[1];
const source = '676284fb7144bd523df21576be15afd15a874cfa';
function run(args, { code=0, failure=false, logFailure=false }={}) {
  const calls=[], logs=[]; let exited;
  const quit={};
  const shell={ ExpandEnvironmentStrings: () => 'C:\\Windows\\System32\\wsl.exe',
    Run: (...argv) => { calls.push(argv); if(failure) throw Error('isolated launch failed'); return code; } };
  const files={GetParentFolderName:()=> 'C:\\Users\\test person\\delivery', BuildPath: (a,b)=>a+'\\'+b,
    OpenTextFile:()=>{if(logFailure)throw Error('isolated log failed'); return {WriteLine: v=>logs.push(JSON.parse(v)),Close:()=>{}};}};
  const context={ WScript:{Arguments:{length:args.length,Item:i=>args[i]},ScriptFullName:'isolated.wsf',
      Quit: value=>{exited=value;throw quit;}},
    ActiveXObject:function(name){if(name==='WScript.Shell')return shell;if(name==='Scripting.FileSystemObject')return files;throw Error('unexpected COM');} };
  try {vm.runInNewContext(script,context,{timeout:1000});} catch(error) {if(error!==quit)throw error;}
  return {calls,logs,exited};
}
test('fixed queue launch is hidden and synchronous; the executable is quoted',()=>{
  const r=run([source]);assert.equal(r.exited,0);assert.equal(r.calls.length,1);
  const [cmd,style,wait]=r.calls[0];assert.equal(style,0);assert.equal(wait,true);
  assert.equal(cmd,'"C:\\Windows\\System32\\wsl.exe" -d Ubuntu -u isinxnisi -- /usr/bin/python3 -B /usr/local/lib/plunode-receipts/'+source+'/scripts/publication-delivery.py --config /etc/plunode-publication/delivery.json --queue');
  assert.equal(r.logs[0].sourceCommit,source);assert.equal(r.logs[0].exitCode,0);
});
test('child failure code is propagated for Scheduler recovery and logged',()=>{
  const r=run([source],{code:37});assert.equal(r.exited,37);assert.equal(r.logs[0].exitCode,37);
});
test('launch failure remains visible to Scheduler',()=>{
  const r=run([source],{failure:true});assert.equal(r.exited,1);assert.equal(r.logs[0].launchError,true);
});
test('missing extra and injected arguments never launch a child',()=>{
  for(const args of [[],[source,'extra'],['x'.repeat(40)],[source+' & command'],['"'+source+'"']]) {
    const r=run(args);assert.equal(r.exited,2);assert.equal(r.calls.length,0);
  }
});
test('diagnostic log failure does not mask the actual child exit code',()=>{
  const r=run([source],{code:37,logFailure:true});assert.equal(r.exited,37);
});
