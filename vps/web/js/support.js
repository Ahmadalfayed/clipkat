// © 2026 وطن النهار — «مساعد كليب كات»: زر دعم عائم + لوحة محادثة (للزوار والمسجّلين)
// المحادثة تُحفظ في هذا التبويب فقط (sessionStorage) ولا تُخزَّن في الخادم؛ «تواصل مع الإدارة» يرسل نصها للإدارة.
import { icon, esc, $ } from './ui.js';

const KEY = 'ck:support:v1';
const HIDE_ON = new Set(['upload', 'golive', 'live', 'chat']);   // الاستوديو والبث والمحادثة الخاصة
const CHIPS = ['رفع فيديو', 'تأجير متجر', 'الدفع', 'العملات والهدايا', 'بلس', 'نسيت كلمة السر', 'تواصل مع الإدارة'];
const GREETING = 'هلا والله 👋 أنا «مساعد كليب كات». اسألني عن رفع المقاطع، الاستوديو، البث، العملات والهدايا، بلس، أو تأجير المتاجر. وإذا تبي الإدارة اضغط «تواصل مع الإدارة».';
const BUBBLE = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>';
const MAX_MSG = 500;

const load = () => { try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } };
const save = (h) => { try { sessionStorage.setItem(KEY, JSON.stringify(h.slice(-30))); } catch { /* خاص */ } };
// نص آمن مع روابط: https://clipkat.live/… و #/… و support@clipkat.live فقط
function rich(text) {
  const link = (m) => (m.includes('@') ? `<a href="mailto:${m}" dir="ltr">${m}</a>` : `<a href="${m}" dir="ltr">${m.replace('https://clipkat.live', 'clipkat.live')}</a>`);
  return esc(text)
    .replace(/(^|[\s(«:،])(https:\/\/clipkat\.live[\w/#?=&.-]*|support@clipkat\.live|#\/[a-z]+(?:\/[\w-]+)?|\/(?:privacy|terms)\b)/g, (_, pre, m) => pre + link(m))
    .replace(/\n/g, '<br>');
}

export function mountSupport(ctx) {
  if (document.getElementById('ckSupFab')) return;
  const fab = document.createElement('button');
  fab.id = 'ckSupFab'; fab.type = 'button'; fab.className = 'sup-fab'; fab.setAttribute('aria-label', 'مساعد كليب كات'); fab.title = 'مساعد كليب كات';
  fab.innerHTML = BUBBLE;
  const panel = document.createElement('section');
  panel.id = 'ckSupPanel'; panel.className = 'sup-panel'; panel.hidden = true; panel.dir = 'rtl'; panel.lang = 'ar';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'مساعد كليب كات');
  panel.innerHTML = `<header class="sup-head"><span class="sup-ava">${BUBBLE}</span><div class="grow"><b>مساعد كليب كات</b><small class="muted" id="supMode">دعم العملاء</small></div>
      <button class="icon-btn" type="button" id="supClose" aria-label="إغلاق">${icon('close', { size: 20 })}</button></header>
    <div class="sup-body" id="supBody" aria-live="polite"></div>
    <div class="sup-chips" id="supChips">${CHIPS.map((c) => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <form class="sup-input" id="supForm" autocomplete="off"><input id="supText" maxlength="${MAX_MSG}" placeholder="اكتب سؤالك…" aria-label="سؤالك" enterkeyhint="send">
      <button class="btn primary sm" type="submit" id="supSend">إرسال</button></form>
    <form class="sup-esc" id="supEsc" hidden novalidate><h3>تواصل مع الإدارة</h3>
      <p class="muted sm">اكتب مشكلتك، وتوصل للإدارة مع نص هذه المحادثة. لا تكتب كلمة السر أو بيانات بطاقتك.</p>
      <label class="field"><span>رسالتك</span><textarea name="message" rows="4" maxlength="1000" required></textarea></label>
      <label class="field" id="supEmailF"><span>بريدك للرد عليك</span><input name="email" type="email" dir="ltr" maxlength="120" placeholder="name@example.com"></label>
      <p class="form-err" role="alert"></p>
      <div class="row-end"><button type="button" class="btn ghost sm" id="supEscBack">رجوع</button><button type="submit" class="btn primary sm">إرسال للإدارة</button></div></form>`;
  document.body.append(fab, panel);
  let history = load(); let busy = false;
  const body = $('#supBody', panel);
  const bubble = (m) => `<div class="sup-msg ${m.role === 'user' ? 'me' : 'bot'}">${rich(m.text)}${m.esc ? '<button type="button" class="btn sm sup-escbtn" data-esc="1">تواصل مع الإدارة</button>' : ''}</div>`;
  const render = () => { body.innerHTML = bubble({ role: 'bot', text: GREETING }) + history.map(bubble).join(''); body.scrollTop = body.scrollHeight; };
  const setRoute = () => { const r = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || 'feed'; const hide = HIDE_ON.has(r); document.body.classList.toggle('sup-hidden', hide); if (hide) close(); document.body.classList.toggle('sup-immersive', ['feed', 'following', 'watch'].includes(r)); };
  const open = () => { panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); document.body.classList.add('sup-open'); render(); setTimeout(() => $('#supText', panel).focus({ preventScroll: true }), 50); };
  function close() { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); document.body.classList.remove('sup-open'); }
  const showEsc = (on) => {
    $('#supEsc', panel).hidden = !on; $('#supForm', panel).hidden = on; $('#supChips', panel).hidden = on; body.hidden = on;
    $('#supEmailF', panel).hidden = !!ctx.me; $('.form-err', panel).textContent = '';
    if (on) $('#supEsc textarea', panel).focus();
  };
  async function ask(text) {
    text = String(text || '').trim().slice(0, MAX_MSG); if (!text || busy) return;
    if (text === 'تواصل مع الإدارة') { history.push({ role: 'user', text }); save(history); render(); showEsc(true); return; }
    busy = true; history.push({ role: 'user', text }); save(history); render();
    body.insertAdjacentHTML('beforeend', '<div class="sup-msg bot typing"><span></span><span></span><span></span></div>'); body.scrollTop = body.scrollHeight;
    let reply, esc2 = false;
    try {
      const r = await fetch('/api/support/chat', { method: 'POST', credentials: 'same-origin', headers: { 'X-CK': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history.filter((m) => m.role === 'user' || m.role === 'bot').slice(-8).map((m) => ({ role: m.role, text: m.text })) }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) reply = 'رسائل كثيرة بوقت قصير 🙏 انتظر شوي وجرّب مرة ثانية، أو اضغط «تواصل مع الإدارة».';
      else if (!r.ok) reply = 'صار خلل بسيط وما قدرت أرد الحين. جرّب مرة ثانية أو اضغط «تواصل مع الإدارة».';
      else { reply = j.reply; esc2 = !!j.suggestEscalate; $('#supMode', panel).textContent = j.mode === 'ai' ? 'دعم العملاء · ذكاء اصطناعي' : 'دعم العملاء'; }
    } catch { reply = 'ما قدرت أتصل بالخادم — تأكد من الإنترنت وجرّب مرة ثانية.'; }
    history.push({ role: 'bot', text: String(reply || '').slice(0, 2000), esc: esc2 }); save(history); busy = false; render();
  }
  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  $('#supClose', panel).addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('#supForm', panel).addEventListener('submit', (e) => { e.preventDefault(); const i = $('#supText', panel); const v = i.value; i.value = ''; ask(v); });
  panel.addEventListener('click', (e) => { const c = e.target.closest('[data-chip]'); if (c) ask(c.dataset.chip); if (e.target.closest('[data-esc]')) showEsc(true); });
  $('#supEscBack', panel).addEventListener('click', () => { showEsc(false); render(); });
  $('#supEsc', panel).addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const fd = new FormData(f); const err = $('.form-err', f); err.textContent = '';
    const message = String(fd.get('message') || '').trim(); const email = String(fd.get('email') || '').trim();
    if (message.length < 3) { err.textContent = 'اكتب رسالتك (3 أحرف على الأقل)'; return; }
    if (!ctx.me && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'اكتب بريد صحيح حتى نرد عليك'; f.email.focus(); return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await fetch('/api/support/escalate', { method: 'POST', credentials: 'same-origin', headers: { 'X-CK': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ message, email: ctx.me ? undefined : email, page: location.hash.slice(0, 80), transcript: history.slice(-12).map((m) => ({ role: m.role, text: m.text })) }) });
      if (r.status === 429) { err.textContent = 'أرسلت طلبات كثيرة — جرّب بعد ساعة أو راسلنا على support@clipkat.live'; btn.disabled = false; return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})); err.textContent = j.field === 'email' ? 'اكتب بريد صحيح حتى نرد عليك' : 'تعذّر الإرسال — جرّب مرة ثانية أو راسلنا على support@clipkat.live'; btn.disabled = false; return; }
      f.reset(); btn.disabled = false; showEsc(false);
      history.push({ role: 'bot', text: `وصلت رسالتك للإدارة ✅ بيردون عليك على ${ctx.me ? 'بريد حسابك' : 'البريد اللي كتبته'} بأقرب وقت.` }); save(history); render();
    } catch { err.textContent = 'ما قدرت أتصل بالخادم — جرّب مرة ثانية'; btn.disabled = false; }
  });
  window.addEventListener('hashchange', setRoute); setRoute();
}
