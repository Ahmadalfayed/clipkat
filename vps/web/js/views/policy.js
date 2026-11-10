// © 2026 وطن النهار — صفحة سياسة تأجير المتاجر والتعاملات التجارية (#/policy)
import { POLICY } from '../policy-text.js';
import { esc } from '../ui.js';
import { pageHead } from './common.js';

function bodyIntro(s) {
  const ver = POLICY.version;
  let t = s.replace(`(رقم الإصدار: ${ver})`, '').replace(`(version: ${ver})`, '').replace(ver, '');
  t = t.replace(/^مسودة بتاريخ[^.]+\.\s*/, '').replace(/\s{2,}/g, ' ').trim();
  return t;
}

export async function render(el) {
  el.innerHTML = `<div class="page narrow policy" dir="rtl" lang="ar">${pageHead('سياسة المتاجر')}
    <article class="card">
      <h1 class="policy-title">${esc(POLICY.title)}</h1>
      <p class="policy-meta">مسودة بتاريخ 7 نوفمبر 2026</p>
      <p class="policy-ver">رقم الإصدار</p>
      <p class="policy-code" dir="ltr">${esc(POLICY.version)}</p>
      <p class="policy-intro">${esc(bodyIntro(POLICY.intro))}</p>
      ${POLICY.sections.map(([h, ps]) => `<section><h2>${esc(h)}</h2><ul>${ps.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>`).join('')}
      <section><h2>تنبيه للمشتري</h2><p class="buyer-note">${esc(POLICY.buyerNotice)}</p></section>
      <section><h2>مراجع عامة</h2><ul>${POLICY.sources.map(([n, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><bdi dir="ltr">${esc(n)}</bdi></a></li>`).join('')}</ul></section>
      <p class="muted sm">© 2026 وطن النهار</p>
    </article></div>`;
}
