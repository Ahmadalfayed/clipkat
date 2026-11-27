// © 2026 وطن النهار — هيكل التطبيق: المستند لا يتمرّر (خلل iOS 26 مع العناصر الثابتة)، و#view هو حاوية التمرير
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const css = fs.readFileSync(path.join(here, '../../web/css/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (sel) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].split(',').map((s) => s.trim()).includes(sel) || m[1].trim() === sel).map((m) => m[2]).join(';');

test('document never scrolls; #view scrolls; nav pinned with safe-area', () => {
  assert.match(rule('html'), /overflow:\s*hidden/); assert.match(rule('body'), /overscroll-behavior:\s*none/);
  assert.match(rule('#app'), /height:\s*100dvh/);
  assert.match(rule('#view'), /overflow-y:\s*auto/);
  assert.match(rule('#view'), /padding-bottom:\s*calc\(var\(--nav-h\)[^;]*env\(safe-area-inset-bottom\)/);
  assert.match(rule('#nav'), /position:\s*fixed;\s*bottom:\s*0/); assert.match(rule('#nav'), /safe-area-inset-bottom/);
  const js = fs.readFileSync(path.join(here, '../../web/js/views/promote.js'), 'utf8');
  assert.ok(!js.includes('window.scrollTo('), 'scroll the #view container, not the window');
});
