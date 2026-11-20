import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = 18000 + (process.pid % 20000);
const child = spawn(process.execPath, ['start-server.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore'
});
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i=0;i<40;i++) {
    try { const r=await fetch(base); if(r.ok){ready=true;break;} } catch {}
    await delay(50);
  }
  assert.ok(ready, 'local web server did not become ready');
  const root = await fetch(base);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /CAD Geometry Core|КОМПАС/);
  const app = await fetch(`${base}/js/app.js`);
  assert.equal(app.status, 200);
  assert.match(app.headers.get('content-type')||'', /javascript/);
  const module = await fetch(`${base}/src/geometry.mjs`);
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type')||'', /javascript/);
  assert.equal((await fetch(`${base}/missing-file.js`)).status, 404);
  console.log('server: ok (HTML and ES modules served with expected MIME types)');
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(1000)]);
}
