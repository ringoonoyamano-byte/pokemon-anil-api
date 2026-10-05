const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('OpenAPI includes all mounted router operations and path parameters',()=>{
  const spec=require('../docs/openapi.json');
  assert.equal(spec.openapi,'3.0.3');
  const mounts={'routes_pokemon':'/pokemon',search:'/pokemon',moves:'/moves',types:'/types',anil:'/anil','anil-current':'/anil',custom:'/custom',teams:'/teams','team-tools':'/teams',calculator:'/calculator',stats:'/stats',health:'',docs:''};
  for(const [file,prefix] of Object.entries(mounts)) {
    const source=fs.readFileSync(path.join(__dirname,'../routes',file+'.js'),'utf8');
    for(const match of source.matchAll(/router\.(get|post|put|delete)\(["']([^"']+)/g)) {
      const endpoint=(prefix+(match[2]==='/'?'':match[2])).replace(/:(\w+)/g,'{$1}')||'/';
      assert.ok(spec.paths[endpoint]?.[match[1]],match[1]+' '+endpoint);
    }
  }
});
