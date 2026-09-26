import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
test('Link Map recovery export safety boundary',async()=>{
  const source=await readFile(new URL('../functions/api/recovery-export.js',import.meta.url),'utf8');
  assert.match(source,/RECOVERY_EXPORT_TOKEN/);
  assert.match(source,/x-curator-recovery-key/);
  assert.match(source,/LINK_MAP_CACHE/);
  assert.match(source,/9d3f33cd6d0940cfaf548649af119dfe/);
  assert.match(source,/list_complete/);
  assert.match(source,/dataSha256/);
});
