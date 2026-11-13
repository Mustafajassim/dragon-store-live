/* EXTRAS (v3) — readable, hand-written components used by app.js:
   analytics · header WhatsApp button · announcement bar · checkout form · info pages & FAQ
   custom-order form · footer links · product details · sorting · cart reconciliation.
   Everything is driven by data/store.json (editable from the dashboard). */

const h = React.createElement;
const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';

/* ───────── analytics (only loads what you configure in the dashboard) ───────── */
function initAnalytics(cfg) {
  cfg = cfg || {};
  const addScript = src => { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); };
  if (/^G-[A-Z0-9]{4,}$/i.test(cfg.ga4 || '')) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date()); window.gtag('config', cfg.ga4);
    addScript('https://www.googletagmanager.com/gtag/js?id=' + cfg.ga4);
  }
  if (/^\d{6,20}$/.test(cfg.metaPixel || '')) {
    (function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', cfg.metaPixel); window.fbq('track', 'PageView');
  }
  if (/^[A-Z0-9]{8,30}$/i.test(cfg.tiktokPixel || '')) {
    (function (w, d, t, id) { w.TiktokAnalyticsObject = t; var q = w[t] = w[t] || []; q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']; q.setAndDefer = function (o, m) { o[m] = function () { o.push([m].concat(Array.prototype.slice.call(arguments, 0))); }; }; q.methods.forEach(m => q.setAndDefer(q, m)); var s = d.createElement('script'); s.async = true; s.src = 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=' + id + '&lib=' + t; d.head.appendChild(s); q.page(); })(window, document, 'ttq', cfg.tiktokPixel);
  }
}
/* name: view_item | add_to_cart | begin_checkout | purchase (order sent) | generate_lead (WhatsApp / custom order) */
function track(name, p) {
  try {
    p = p || {};
    if (window.gtag) window.gtag('event', name, p);
    const it = (p.items && p.items[0]) || {};
    if (window.fbq) { const m = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase', generate_lead: 'Lead' }[name]; if (m) window.fbq('track', m, { value: p.value, currency: 'IQD', content_name: it.item_name, content_ids: (p.items || []).map(i => i.item_id), content_type: 'product' }); }
    if (window.ttq) { const m = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'PlaceAnOrder', generate_lead: 'Contact' }[name]; if (m) window.ttq.track(m, { value: p.value, currency: 'IQD', content_name: it.item_name }); }
  } catch (e) { /* analytics must never break the shop */ }
}

/* ───────── small helpers ───────── */
const arDigits = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const safeUrl = u => (/^(https?:\/\/|tel:|mailto:)/i.test(u || '') ? u : '');
function makeOrderNo() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `DS-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }
function openWhatsApp(number, text) { window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank'); }

/* paragraphs separated by a blank line; lines starting with "- " become a bullet list */
function renderRich(text) {
  return String(text || '').split(/\n\s*\n/).map((block, i) => {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length && lines.every(l => /^\s*[-•]\s+/.test(l))) return h('ul', { key: i }, lines.map((l, j) => h('li', { key: j }, l.replace(/^\s*[-•]\s+/, ''))));
    return h('p', { key: i }, lines.join(' '));
  });
}

/* keeps keyboard focus inside a dialog and returns it to where it was */
function useDialogFocus(ref) {
  useEffect(() => {
    const prev = document.activeElement, el = ref.current;
    if (el) el.focus();
    const trap = e => {
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (prev && prev.focus) prev.focus(); };
  }, []);
}

/* ───────── header WhatsApp button (same look as the cart / home buttons) ───────── */
function WhatsAppHeaderBtn({ whatsapp }) {
  return h('a', { className: 'icon-btn', href: `https://wa.me/${whatsapp}`, target: '_blank', rel: 'noopener', 'aria-label': 'تواصل معنا عبر واتساب', onClick: () => track('generate_lead', { method: 'whatsapp_header' }) },
    h('svg', { className: 'w-5 h-5', viewBox: '0 0 24 24', fill: 'url(#fireGradientHeader)', 'aria-hidden': 'true' }, h('path', { d: WA_PATH })));
}

/* ───────── announcement bar ───────── */
function AnnouncementBar({ cfg }) {
  const [closed, setClosed] = useState(() => { try { return sessionStorage.getItem('dsAnnClosed') === (cfg && cfg.text); } catch (e) { return false; } });
  if (!cfg || !cfg.enabled || !cfg.text || closed) return null;
  const link = safeUrl(cfg.link), inner = h('span', { className: 'ann-txt' }, cfg.text);
  return h('div', { className: 'ann-bar', role: 'region', 'aria-label': 'إعلان' },
    link ? h('a', { href: link, target: '_blank', rel: 'noopener' }, inner) : inner,
    h('button', { className: 'ann-x', type: 'button', 'aria-label': 'إغلاق الإعلان', onClick: () => { try { sessionStorage.setItem('dsAnnClosed', cfg.text); } catch (e) { /* ignore */ } setClosed(true); } }, '✕'));
}

/* ───────── checkout (replaces the old phone+address panel) ───────── */
function CheckoutBody({ store, cart, cartTotal, cartItemCount, formatPrice, onSent }) {
  const sh = store.shipping || { governorates: [] }, pays = store.payments || [];
  const [f, setF] = useState({ name: '', phone: '', gov: '', address: '', notes: '', pay: pays[0] || '' });
  const [tried, setTried] = useState(false);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  useEffect(() => { track('begin_checkout', { currency: 'IQD', value: cartTotal, items: cart.map(i => ({ item_id: i.product.id, item_name: i.product.name, price: i.product.price, quantity: i.quantity })) }); }, []);

  const gov = (sh.governorates || []).find(g => g.name === f.gov);
  const freeShip = sh.freeOver > 0 && cartTotal >= sh.freeOver;
  const fee = gov && typeof gov.fee === 'number' ? (freeShip ? 0 : gov.fee) : null;
  const total = cartTotal + (fee || 0);
  const phoneDigits = arDigits(f.phone).replace(/[\s\-()]/g, '');
  const errs = {};
  if (f.name.trim().length < 2) errs.name = 'اكتب اسمك.';
  if (!/^(?:\+?964|0)?7\d{9}$/.test(phoneDigits)) errs.phone = 'اكتب رقماً عراقياً صحيحاً، مثل 07701234567.';
  if ((sh.governorates || []).length && !f.gov) errs.gov = 'اختر المحافظة.';
  if (f.address.trim().length < 5) errs.address = 'اكتب المنطقة وأقرب نقطة دالة.';

  const submit = () => {
    setTried(true);
    if (Object.keys(errs).length || !cart.length) return;
    const no = makeOrderNo(), cur = ' د.ع', n = x => x.toLocaleString('en-US');
    let t = `*DRAGON STORE - طلبية جديدة*\nرقم الطلب: ${no}\n------------------------------\n`;
    cart.forEach((it, i) => { t += `${i + 1}. ${it.product.name}${it.product.productNumber ? ' #' + it.product.productNumber : ''} - ${n(it.product.price)}${cur} × ${it.quantity}\n`; });
    t += `------------------------------\nالمجموع الفرعي: ${n(cartTotal)}${cur}\n`;
    t += fee === null ? 'التوصيل: تُحدَّد الأجرة عند التأكيد\n' : (fee === 0 ? 'التوصيل: مجاني\n' : `التوصيل: ${n(fee)}${cur}\n`);
    t += `*${fee === null ? 'الإجمالي (بدون التوصيل)' : 'الإجمالي'}: ${n(total)}${cur}*\n------------------------------\n`;
    t += `الاسم: ${f.name.trim()}\nالهاتف: ${phoneDigits}\n`;
    if (f.gov) t += `المحافظة: ${f.gov}\n`;
    t += `العنوان: ${f.address.trim()}\n`;
    if (f.notes.trim()) t += `ملاحظات: ${f.notes.trim()}\n`;
    if (f.pay) t += `طريقة الدفع: ${f.pay}\n`;
    t += '------------------------------\nشكراً لثقتكم - متجر التنين DRAGON STORE';
    openWhatsApp(store.contact.whatsapp, t);
    track('purchase', { transaction_id: no, currency: 'IQD', value: total, items: cart.map(i => ({ item_id: i.product.id, item_name: i.product.name, price: i.product.price, quantity: i.quantity })) });
    onSent({ count: cartItemCount, total, orderNo: no });
  };

  const err = k => (tried && errs[k] ? h('div', { className: 'fld-err', role: 'alert' }, errs[k]) : null);
  const bad = k => (tried && errs[k] ? ' is-bad' : '');
  return h('div', { className: 'co-body', style: { flex: 1, overflowY: 'auto' } },
    h('label', { className: 'field-lbl', htmlFor: 'coName' }, 'الاسم'),
    h('input', { id: 'coName', className: 'field-input' + bad('name'), type: 'text', autoComplete: 'name', value: f.name, onChange: set('name'), placeholder: 'الاسم الكامل' }), err('name'),
    h('label', { className: 'field-lbl', htmlFor: 'coPhone' }, 'رقم الهاتف'),
    h('input', { id: 'coPhone', className: 'field-input' + bad('phone'), type: 'tel', inputMode: 'tel', autoComplete: 'tel', dir: 'ltr', placeholder: '07X XXXX XXXX', value: f.phone, onChange: set('phone') }), err('phone'),
    (sh.governorates || []).length ? h(React.Fragment, null,
      h('label', { className: 'field-lbl', htmlFor: 'coGov' }, 'المحافظة'),
      h('select', { id: 'coGov', className: 'field-input' + bad('gov'), value: f.gov, onChange: set('gov') },
        h('option', { value: '' }, 'اختر المحافظة'),
        sh.governorates.map(g => h('option', { key: g.name, value: g.name }, g.name + (typeof g.fee === 'number' && !freeShip ? ' — ' + formatPrice(g.fee) : '')))), err('gov')) : null,
    h('label', { className: 'field-lbl', htmlFor: 'coAddr' }, 'العنوان'),
    h('textarea', { id: 'coAddr', className: 'field-input' + bad('address'), rows: 3, autoComplete: 'street-address', placeholder: 'المنطقة / الحي / أقرب نقطة دالة...', value: f.address, onChange: set('address') }), err('address'),
    h('label', { className: 'field-lbl', htmlFor: 'coNotes' }, 'ملاحظات (اختياري)'),
    h('textarea', { id: 'coNotes', className: 'field-input', rows: 2, placeholder: 'لون مفضّل، وقت التوصيل...', value: f.notes, onChange: set('notes') }),
    pays.length > 1 ? h(React.Fragment, null,
      h('label', { className: 'field-lbl', htmlFor: 'coPay' }, 'طريقة الدفع'),
      h('select', { id: 'coPay', className: 'field-input', value: f.pay, onChange: set('pay') }, pays.map(p => h('option', { key: p, value: p }, p)))) : (pays.length === 1 ? h('p', { className: 'co-pay' }, 'طريقة الدفع: ' + pays[0]) : null),
    h('div', { className: 'co-summary' },
      h('p', null, 'عدد المنتجات: ', h('strong', null, cartItemCount, ' قطعة')),
      h('p', null, 'المجموع الفرعي: ', h('strong', null, formatPrice(cartTotal))),
      h('p', null, 'التوصيل: ', h('strong', null, fee === null ? 'تُحدَّد عند التأكيد' : (fee === 0 ? 'مجاني' : formatPrice(fee)))),
      sh.freeOver > 0 && !freeShip ? h('p', { className: 'co-hint' }, `توصيل مجاني للطلبات فوق ${formatPrice(sh.freeOver)}`) : null,
      h('p', null, 'الإجمالي: ', h('span', { className: 'fire-txt' }, formatPrice(total)))),
    h('button', { className: 'btn-fire btn-fw', disabled: !cart.length, onClick: submit }, 'إرسال الطلب عبر واتساب'));
}

/* ───────── info pages + FAQ ───────── */
function InfoModal({ store, pageId, onClose }) {
  const ref = useRef(null); useDialogFocus(ref);
  const isFaq = pageId === 'faq', page = (store.pages || []).find(p => p.id === pageId);
  const title = isFaq ? 'الأسئلة الشائعة' : (page ? page.title : '');
  if (!title) return null;
  return h('div', { className: 'ovl', onClick: onClose },
    h('div', { className: 'xmodal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabIndex: -1, ref, onClick: e => e.stopPropagation() },
      h('div', { className: 'xmodal-hdr' }, h('h3', null, title), h('button', { className: 'icon-btn', type: 'button', onClick: onClose, 'aria-label': 'إغلاق' }, h(IconClose, { c: 'w-5 h-5' }))),
      h('div', { className: 'xmodal-body' }, isFaq
        ? (store.faq || []).map((q, i) => h('details', { key: i, className: 'faq-item' }, h('summary', null, q.q), h('div', null, renderRich(q.a))))
        : renderRich(page.body))));
}

/* ───────── custom order ("اطلب تصميمك") ───────── */
function CustomOrderModal({ store, onClose }) {
  const ref = useRef(null); useDialogFocus(ref);
  const [f, setF] = useState({ idea: '', size: '', color: '', qty: '1', name: '' });
  const [tried, setTried] = useState(false);
  const set = k => e => setF(s => ({ ...s, [k]: e.target.value }));
  const bad = tried && f.idea.trim().length < 5;
  const send = () => {
    setTried(true); if (f.idea.trim().length < 5) return;
    let t = '*DRAGON STORE - طلب تصميم مخصص*\n------------------------------\n';
    t += `الفكرة: ${f.idea.trim()}\n`;
    if (f.size.trim()) t += `الحجم التقريبي: ${f.size.trim()}\n`;
    if (f.color.trim()) t += `اللون: ${f.color.trim()}\n`;
    t += `الكمية: ${arDigits(f.qty) || 1}\n`;
    if (f.name.trim()) t += `الاسم: ${f.name.trim()}\n`;
    t += '------------------------------\nسأرفق الصور أو ملف STL في هذه المحادثة. أرجو عرض سعر ومدة التنفيذ.';
    openWhatsApp(store.contact.whatsapp, t);
    track('generate_lead', { method: 'custom_order' });
    onClose();
  };
  return h('div', { className: 'ovl', onClick: onClose },
    h('div', { className: 'xmodal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'طلب تصميم مخصص', tabIndex: -1, ref, onClick: e => e.stopPropagation() },
      h('div', { className: 'xmodal-hdr' }, h('h3', null, (store.customOrder && store.customOrder.label) || 'اطلب تصميمك'), h('button', { className: 'icon-btn', type: 'button', onClick: onClose, 'aria-label': 'إغلاق' }, h(IconClose, { c: 'w-5 h-5' }))),
      h('div', { className: 'xmodal-body' },
        h('p', { className: 'co-hint' }, 'صِف فكرتك وسنرد عليك بعرض سعر ومدة التنفيذ. بعد فتح واتساب أرفق الصور أو ملف STL في نفس المحادثة.'),
        h('label', { className: 'field-lbl', htmlFor: 'cuIdea' }, 'ما الذي تريد طباعته؟'),
        h('textarea', { id: 'cuIdea', className: 'field-input' + (bad ? ' is-bad' : ''), rows: 4, placeholder: 'مثال: مجسم لشخصية، قطعة غيار، هدية بالاسم...', value: f.idea, onChange: set('idea') }),
        bad ? h('div', { className: 'fld-err', role: 'alert' }, 'اكتب وصفاً مختصراً للفكرة.') : null,
        h('div', { className: 'two-col' },
          h('div', null, h('label', { className: 'field-lbl', htmlFor: 'cuSize' }, 'الحجم التقريبي'), h('input', { id: 'cuSize', className: 'field-input', value: f.size, onChange: set('size'), placeholder: 'مثال: 15 سم' })),
          h('div', null, h('label', { className: 'field-lbl', htmlFor: 'cuColor' }, 'اللون'), h('input', { id: 'cuColor', className: 'field-input', value: f.color, onChange: set('color'), placeholder: 'مثال: أسود' }))),
        h('div', { className: 'two-col' },
          h('div', null, h('label', { className: 'field-lbl', htmlFor: 'cuQty' }, 'الكمية'), h('input', { id: 'cuQty', className: 'field-input', inputMode: 'numeric', value: f.qty, onChange: set('qty') })),
          h('div', null, h('label', { className: 'field-lbl', htmlFor: 'cuName' }, 'الاسم (اختياري)'), h('input', { id: 'cuName', className: 'field-input', value: f.name, onChange: set('name'), autoComplete: 'name' }))),
        h('button', { className: 'btn-fire btn-fw', type: 'button', onClick: send }, 'إرسال عبر واتساب'))));
}

/* ───────── footer links (pages, FAQ, extra socials, hours) ───────── */
function FooterLinks({ store, onOpen }) {
  const pages = (store.pages || []).filter(p => p.footer !== false), faq = (store.faq || []).length > 0, soc = store.social || {};
  const extra = [['tiktok', 'TikTok'], ['telegram', 'Telegram']].filter(([k]) => safeUrl(soc[k]));
  return h(React.Fragment, null,
    store.contact.hours ? h('p', { className: 'ftr-hours' }, 'ساعات العمل: ' + store.contact.hours) : null,
    (pages.length || faq || extra.length) ? h('nav', { className: 'ftr-links', 'aria-label': 'روابط المتجر' },
      pages.map(p => h('button', { key: p.id, type: 'button', onClick: () => onOpen(p.id) }, p.title)),
      faq ? h('button', { key: 'faq', type: 'button', onClick: () => onOpen('faq') }, 'الأسئلة الشائعة') : null,
      extra.map(([k, l]) => h('a', { key: k, href: safeUrl(soc[k]), target: '_blank', rel: 'noopener noreferrer' }, l))) : null);
}

/* ───────── product details block (inside the product modal) ───────── */
function ProductDetails({ p, formatPrice }) {
  useEffect(() => { track('view_item', { currency: 'IQD', value: p.price, items: [{ item_id: p.id, item_name: p.name, price: p.price }] }); }, [p.id]);
  const st = { available: ['متوفر', 'ok'], made_to_order: ['يُنفَّذ حسب الطلب', 'mto'], out: ['نفد حالياً', 'out'] }[p.stock || 'available'];
  const spec = (l, v) => h('div', { className: 'modal-spec' }, h('span', { className: 'spec-lbl' }, l), h('span', { className: 'spec-val' }, v));
  return h('div', { className: 'pd' },
    h('div', { className: 'pd-row' }, h('span', { className: 'pd-stock ' + st[1] }, st[0]),
      p.originalPrice ? h('span', { className: 'pd-old' }, formatPrice(p.originalPrice)) : null,
      p.discountPercent ? h('span', { className: 'pd-off' }, 'خصم ' + p.discountPercent + '%') : null),
    p.description ? h('p', { className: 'pd-desc' }, p.description) : null,
    (p.dimensions || p.printTime) ? h('div', { className: 'modal-specs' }, p.dimensions ? spec('الأبعاد', p.dimensions) : null, p.printTime ? spec('مدة التنفيذ', p.printTime) : null) : null);
}

/* ───────── sorting for the "all products" view ───────── */
function sortProducts(list, mode, inStockOnly) {
  const r = (inStockOnly ? list.filter(p => p.stock !== 'out') : list.slice());
  const soon = r.filter(p => p.comingSoon), real = r.filter(p => !p.comingSoon);
  const by = {
    new: (a, b) => (b.productNumber || 0) - (a.productNumber || 0),
    price_asc: (a, b) => (a.price || 0) - (b.price || 0),
    price_desc: (a, b) => (b.price || 0) - (a.price || 0),
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'ar')
  }[mode];
  return (by ? real.sort(by) : real).concat(soon);
}
function SortBar({ sort, setSort, inStock, setInStock, count }) {
  const opts = [['default', 'الترتيب الافتراضي'], ['new', 'الأحدث'], ['price_asc', 'السعر: الأقل أولاً'], ['price_desc', 'السعر: الأعلى أولاً'], ['name', 'الاسم']];
  return h('div', { className: 'sort-bar' },
    h('span', { className: 'sort-count' }, count + ' منتج'),
    h('label', { className: 'sort-chk' }, h('input', { type: 'checkbox', checked: inStock, onChange: e => setInStock(e.target.checked) }), 'المتوفر فقط'),
    h('select', { className: 'field-input sort-sel', 'aria-label': 'ترتيب المنتجات', value: sort, onChange: e => setSort(e.target.value) }, opts.map(([v, l]) => h('option', { key: v, value: v }, l))));
}

/* ───────── keep saved carts in sync with price / stock changes made in the dashboard ───────── */
function reconcileCart(cart, catalog) {
  if (!cart.length || !catalog.length) return cart;
  const byId = new Map(catalog.filter(p => !p.comingSoon).map(p => [p.id, p]));
  const origin = id => id.replace(/^(trending|best-sellers|discounts)-/, '');
  const out = [];
  for (const it of cart) {
    const id = it.product && it.product.id;
    const cur = byId.get(id) || byId.get(origin(id || ''));
    if (!cur || cur.stock === 'out') continue;
    out.push({ ...it, product: { ...cur, id } });
  }
  const same = out.length === cart.length && out.every((it, i) => JSON.stringify(it.product) === JSON.stringify(cart[i].product));
  return same ? cart : out;
}
