// © 2026 وطن النهار — صفحة سياسة تأجير المتاجر والتعاملات التجارية (#/policy)
import { POLICY } from '../policy-text.js';
import { esc } from '../ui.js';
import { pageHead } from './common.js';

export async function render(el) {
  el.innerHTML = `<div class="page narrow policy" dir="rtl" lang="ar">${pageHead('سياسة المتاجر')}
    <article class="card">
      <h1 class="policy-title">${esc(POLICY.title)}</h1>
      <p class="note">${esc(POLICY.intro)}</p>
      ${POLICY.sections.map(([h, ps]) => `<section><h2>${esc(h)}</h2><ul>${ps.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>`).join('')}
      <section><h2>تنبيه للمشتري</h2><p class="buyer-note">${esc(POLICY.buyerNotice)}</p></section>
      <section><h2>مراجع عامة</h2><ul>${POLICY.sources.map(([n, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a></li>`).join('')}</ul></section>
      <p class="muted sm">© 2026 وطن النهار</p>
    </article></div>`;
}
