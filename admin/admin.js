/* DRAGON STORE — DASHBOARD
   Manages data/products.json and assets/images/products/** through the GitHub API.
   Flow: connect → edit (changes are only STAGED in the browser) → "نشر التغييرات" creates ONE atomic commit
   containing products.json, data.fallback.js, the new images and the deleted images. GitHub Pages then rebuilds the site.
   Vanilla JS, no dependencies. Everything is exposed on window.DragonAdmin for testing. */
(() => {
'use strict';
const A = window.DragonAdmin = {};
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CFG_KEY = 'dragonAdminCfg';
const PRODUCT_DIR = 'assets/images/products/';
const HERO_DIR = 'assets/images/hero/';
const MIN_IMAGES = 3, MAX_IMAGES = 8;
const MAX_SIDE = 1000, JPEG_QUALITY = 0.85;

const S = A.state = {
  cfg: null, store: null, storeBaseText: '', doc: null, baseText: '', products: [], sheet: null,
  pendingFiles: new Map(),   // path → base64 (new images waiting to be committed)
  pendingDeletes: new Set(), // path → existing repo images to delete
  previews: new Map(),       // path → data URL (so new images show before GitHub Pages rebuilds)
  touched: new Map(),        // product id → 'new' | 'edited'
  log: [], q: '', cat: 'all', editor: null
};

/* ───────── helpers ───────── */
let toastTimer;
function toast(msg, type = 'ok') {
  const t = $('#toast'); t.textContent = msg; t.className = 'adm-toast show ' + type;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'adm-toast'; }, 4600);
}
const show = (id, on) => { $(id).hidden = !on; };
const fmtPrice = n => (n == null ? '—' : Number(n).toLocaleString('en-US') + ' د.ع');
const realCats = () => S.store.categories.filter(c => !c.shared && !c.comingSoon);
const catById = id => S.store.categories.find(c => c.id === id);
const isManaged = p => realCats().some(c => c.id === p.categoryId);
const imgSrc = path => S.previews.get(path) || '../' + path;
const pendingCount = () => S.log.length;

function slugify(s, maxlen = 48) {
  s = String(s).replace(/&/g, ' and ').replace(/[\u2013\u2014]/g, ' ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > maxlen) { const cut = s.slice(0, maxlen); s = cut.includes('-') ? cut.slice(0, cut.lastIndexOf('-')) : cut; }
  return s.replace(/^-+|-+$/g, '');
}
A.slugify = slugify;

/* price rule lives in store.json → pricing (same rule the existing catalogue was priced with) */
function calcPrice(w, rule) {
  const p = rule || S.store.pricing || { roundUpTo: 1000, tiers: [{ belowGrams: 100, perGram: 130 }], defaultPerGram: 100 };
  const tier = (p.tiers || []).find(t => w < t.belowGrams);
  const per = tier ? tier.perGram : p.defaultPerGram;
  const r = p.roundUpTo || 1;
  return Math.ceil(w * per / r) * r;
}
A.calcPrice = calcPrice;

/* ───────── config / GitHub API ───────── */
function loadCfg() {
  let c = null;
  try { c = JSON.parse(localStorage.getItem(CFG_KEY) || sessionStorage.getItem(CFG_KEY) || 'null'); } catch (e) { /* ignore */ }
  const guess = {};
  const m = location.hostname.match(/^(.+)\.github\.io$/);
  if (m) {
    guess.owner = m[1];
    const parts = location.pathname.split('/').filter(Boolean), i = parts.indexOf('admin');
    guess.repo = i > 0 ? parts[i - 1] : m[1] + '.github.io';
  }
  return { owner: '', repo: '', branch: '', token: '', remember: true, ...guess, ...(c || {}) };
}
function saveCfg() {
  const s = JSON.stringify(S.cfg);
  localStorage.removeItem(CFG_KEY); sessionStorage.removeItem(CFG_KEY);
  (S.cfg.remember ? localStorage : sessionStorage).setItem(CFG_KEY, s);
}

async function gh(path, { method = 'GET', body, raw = false } = {}) {
  const c = S.cfg;
  const r = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).message; } catch (e) { /* ignore */ }
    const hint = r.status === 401 ? ' — التوكن غير صالح أو منتهي' : r.status === 403 ? ' — لا توجد صلاحية (تحقق من Contents: Read and write)' : r.status === 404 ? ' — المستودع/الفرع غير موجود أو التوكن لا يصل إليه' : '';
    throw new Error(`GitHub ${r.status}: ${m || r.statusText}${hint}`);
  }
  return raw ? r.text() : r.json();
}

async function connect() {
  show('#setup', false); show('#dash', false); show('#loading', true);
  try {
    const repo = await gh('');
    if (repo.permissions && !repo.permissions.push) throw new Error('التوكن لا يملك صلاحية الكتابة على هذا المستودع.');
    if (!S.cfg.branch) S.cfg.branch = repo.default_branch || 'main';
    const ref = encodeURIComponent(S.cfg.branch);
    const [storeText, prodText] = await Promise.all([
      gh(`/contents/data/store.json?ref=${ref}`, { raw: true }),
      gh(`/contents/data/products.json?ref=${ref}`, { raw: true })
    ]);
    S.store = withStoreDefaults(JSON.parse(storeText));   // older store.json files get the new settings' defaults
    S.storeBaseText = storeText;
    S.sheet = null;
    S.baseText = prodText;
    S.doc = JSON.parse(prodText);
    S.products = JSON.parse(prodText).products;
    S.pendingFiles.clear(); S.pendingDeletes.clear(); S.touched.clear(); S.log = [];
    saveCfg();
    fillCatFilter();
    renderAll();
    show('#loading', false); show('#dash', true);
  } catch (e) {
    show('#loading', false); openSetup(e.message);
  }
}
A.connect = connect;

function openSetup(err) {
  const c = S.cfg;
  $('#fOwner').value = c.owner; $('#fRepo').value = c.repo; $('#fBranch').value = c.branch; $('#fToken').value = c.token; $('#fRemember').checked = c.remember;
  const box = $('#setupErr'); box.hidden = !err; box.textContent = err || '';
  show('#dash', false); show('#loading', false); show('#setup', true);
}

/* ───────── rendering ───────── */
function fillCatFilter() {
  if (S.cat !== 'all' && !realCats().some(c => c.id === S.cat)) S.cat = 'all';
  $('#catFilter').innerHTML = '<option value="all">كل الأقسام</option>' + realCats().map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('#catFilter').value = S.cat;
}
function renderAll() { fillCatFilter(); renderStats(); renderPending(); renderGrid(); }

function renderStats() {
  const mine = S.products.filter(isManaged);
  $('#stats').innerHTML = `<div class="adm-stat"><b>${mine.length}</b><span>كل المنتجات</span></div>` +
    realCats().map(c => `<div class="adm-stat"><b>${mine.filter(p => p.categoryId === c.id).length}</b><span>${esc(c.name)}</span></div>`).join('') +
    `<div class="adm-stat"><b>${pendingCount()}</b><span>تغييرات غير منشورة</span></div>`;
}

function renderPending() {
  const box = $('#pending');
  box.hidden = pendingCount() === 0;
  if (box.hidden) return;
  box.innerHTML = `<div class="adm-pending-top"><strong>${pendingCount()} تغيير غير منشور — لن يظهر في الموقع حتى تنشره</strong>
    <div class="adm-row"><button class="btn-fire" id="btnPublish" type="button">نشر التغييرات</button><button class="adm-btn-ghost" id="btnDiscard" type="button">تجاهل الكل</button></div></div>
    <ul>${S.log.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

function renderGrid() {
  const q = S.q.trim().toLowerCase().replace(/^#/, '');
  const list = S.products.filter(isManaged).filter(p =>
    (S.cat === 'all' || p.categoryId === S.cat) &&
    (!q || p.name.toLowerCase().includes(q) || String(p.productNumber) === q));
  $('#grid').innerHTML = list.length ? list.map(p => {
    const t = S.touched.get(p.id);
    return `<article class="adm-card ${t === 'new' ? 'is-new' : t === 'edited' ? 'is-edited' : ''}" data-id="${esc(p.id)}">
      <div class="adm-card-img"><img src="${esc(imgSrc(p.images[0]))}" alt="${esc(p.name)}" loading="lazy" decoding="async">
        <span class="adm-num">#${p.productNumber}</span>${t ? `<span class="adm-tag ${t}">${t === 'new' ? 'جديد' : 'معدّل'}</span>` : ''}${p.hidden ? '<span class="adm-tag off">مخفي</span>' : (p.stock === 'out' ? '<span class="adm-tag off">نفد</span>' : '')}</div>
      <div class="adm-card-body"><div class="adm-card-name">${esc(p.name)}</div>
        <div class="adm-meta"><span>${esc(catById(p.categoryId)?.name || p.categoryId)}</span><span>${p.weightGrams}g</span><span>${p.images.length} صور</span></div>
        <div class="adm-price fire-txt">${fmtPrice(p.price)}</div>
        <div class="adm-card-act"><button type="button" data-act="edit">تعديل</button><button type="button" data-act="dup" aria-label="نسخ المنتج" title="نسخ المنتج">⧉</button><button type="button" class="del" data-act="delete">حذف</button></div></div></article>`;
  }).join('') : '<div class="adm-empty">لا توجد منتجات مطابقة</div>';
}

/* ───────── image handling ───────── */
const arDigits = s => String(s || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
A.processImage = async function (file, opts) {
  opts = opts || {};
  const maxSide = opts.maxSide || MAX_SIDE;
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.82), ext = 'webp';            // ~40% smaller than JPEG
  if (!url.startsWith('data:image/webp')) { url = c.toDataURL('image/jpeg', JPEG_QUALITY); ext = 'jpg'; }   // Safari can't encode WebP
  return { data: url.split(',')[1], preview: url, ext };
};

A.addFiles = async function (files) {
  if (S.sheet && S.sheet.type === 'settings') return addHeroFiles(files);
  const E = S.editor; if (!E) return;
  const room = MAX_IMAGES - E.images.length;
  const picked = [...files].filter(f => !f.type || f.type.startsWith('image/')).slice(0, room);
  if (files.length > room) toast(`الحد الأقصى ${MAX_IMAGES} صور لكل منتج.`, 'err');
  for (const f of picked) {
    try { const r = await A.processImage(f); E.images.push({ kind: 'new', data: r.data, preview: r.preview, ext: r.ext || 'jpg' }); }
    catch (e) { toast(`تعذّرت قراءة الصورة "${f.name}" — جرّب JPG أو PNG.`, 'err'); }
  }
  renderEditorImages(); refreshEditorState();
};

/* ───────── editor ───────── */
function openEditor(id) {
  if (!realCats().length) { toast('أضف قسماً أولاً من زر «الأقسام».', 'err'); return; }
  const p = id ? S.products.find(x => x.id === id) : null;
  const cats = realCats();
  S.editor = {
    mode: p ? 'edit' : 'add', id: p?.id || null,
    name: p?.name || '', categoryId: p?.categoryId || (S.cat !== 'all' ? S.cat : cats[0].id),
    weight: p ? String(p.weightGrams) : '', price: p ? String(p.price) : '', priceTouched: !!p,
    material: p?.material || 'PLA Premium',
    desc: p?.description || '', stock: p?.stock || 'available', badge: p?.badge || '', old: p?.oldPrice ? String(p.oldPrice) : '', dim: p?.dimensions || '', print: p?.printTime || '', hidden: !!p?.hidden,
    images: (p?.images || []).map(path => ({ kind: 'existing', path })),
    original: p ? JSON.parse(JSON.stringify(p)) : null
  };
  const E = S.editor;
  $('#editorHost').innerHTML = `<div class="ovl adm-ovl" id="editor"><div class="adm-sheet" role="dialog" aria-modal="true" aria-label="${p ? 'تعديل منتج' : 'إضافة منتج'}">
    <div class="adm-sheet-hdr"><h2>${p ? 'تعديل منتج' + ` <span class="adm-muted"><bdi>#${p.productNumber}</bdi></span>` : 'إضافة منتج جديد'}</h2><button class="icon-btn" type="button" data-close aria-label="إغلاق">✕</button></div>
    <div class="adm-sheet-body">
      <div><label class="field-lbl" for="eName">اسم المنتج</label><input class="field-input" id="eName" value="${esc(E.name)}" autocomplete="off" maxlength="90" placeholder="مثال: Kratos Ghost of Sparta"></div>
      <div><label class="field-lbl" for="eCat">القسم</label><select class="field-input" id="eCat">${cats.map(c => `<option value="${esc(c.id)}" ${c.id === E.categoryId ? 'selected' : ''}>${esc(c.name)}${c.hidden ? ' (مخفي)' : ''}</option>`).join('')}</select></div>
      <div class="adm-two">
        <div><label class="field-lbl" for="eWeight">الوزن (غرام)</label><input class="field-input" id="eWeight" inputmode="numeric" value="${esc(E.weight)}" placeholder="مثال: 120"></div>
        <div><label class="field-lbl" for="ePrice">السعر (دينار عراقي)</label><input class="field-input" id="ePrice" inputmode="numeric" value="${esc(E.price)}" placeholder="يُحسب تلقائياً"></div>
      </div>
      <div class="adm-hint" id="priceHint"></div>
      <div><label class="field-lbl" for="eMat">الخامة</label><input class="field-input" id="eMat" value="${esc(E.material)}" autocomplete="off"></div>
      <div><label class="field-lbl" for="eDesc">وصف المنتج (اختياري)</label><textarea class="field-input" id="eDesc" rows="3" maxlength="700" placeholder="يظهر في نافذة المنتج">${esc(E.desc)}</textarea></div>
      <div class="adm-two">
        <div><label class="field-lbl" for="eStock">حالة التوفر</label><select class="field-input" id="eStock">${[['available', 'متوفر'], ['made_to_order', 'يُنفَّذ حسب الطلب'], ['out', 'نفد حالياً']].map(([v, l]) => `<option value="${v}" ${v === E.stock ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div><label class="field-lbl" for="eBadge">شارة على البطاقة</label><select class="field-input" id="eBadge">${[['', 'بدون'], ['new', 'جديد'], ['hot', 'الأكثر طلباً']].map(([v, l]) => `<option value="${v}" ${v === E.badge ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="adm-two">
        <div><label class="field-lbl" for="eOld">السعر قبل الخصم (اختياري)</label><input class="field-input" id="eOld" inputmode="numeric" value="${esc(E.old)}" placeholder="أعلى من السعر الحالي"></div>
        <div><label class="field-lbl" for="eDim">الأبعاد (اختياري)</label><input class="field-input" id="eDim" value="${esc(E.dim)}" placeholder="مثال: 12 سم"></div>
      </div>
      <div><label class="field-lbl" for="ePrint">مدة التنفيذ (اختياري)</label><input class="field-input" id="ePrint" value="${esc(E.print)}" placeholder="مثال: يومان"></div>
      <label class="adm-check"><input type="checkbox" id="eHidden" ${E.hidden ? 'checked' : ''}> إخفاء المنتج من الموقع (يبقى محفوظاً هنا)</label>
      <div><label class="field-lbl">الصور — <span class="adm-count" id="imgCount"></span> <span class="adm-muted">(الأولى هي الصورة الرئيسية في البطاقة)</span></label>
        <div class="adm-imgs" id="eImgs"></div>
        <div class="adm-hint">تُصغَّر الصور تلقائياً إلى ${MAX_SIDE}px وتُحفظ بصيغة WebP (JPG في سفاري) حتى يبقى الموقع سريعاً.</div></div>
      <p class="adm-err" id="eErr" hidden></p>
    </div>
    <div class="adm-sheet-ftr"><button class="btn-fire" type="button" id="eSave">${p ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
      ${p ? '<button class="adm-btn-ghost adm-btn-danger" type="button" id="eDelete">حذف</button>' : ''}<button class="adm-btn-ghost" type="button" data-close>إلغاء</button></div>
  </div></div>`;
  renderEditorImages(); refreshEditorState();
  $('#eName').focus();
}
A.openEditor = openEditor;
function closeEditor() { $('#editorHost').innerHTML = ''; S.editor = null; S.sheet = null; }

function renderEditorImages() {
  const E = S.editor; if (!E) return;
  const n = E.images.length;
  $('#eImgs').innerHTML = E.images.map((im, i) => {
    const src = im.kind === 'new' ? im.preview : imgSrc(im.path);
    return `<div class="adm-img" data-i="${i}"><img src="${esc(src)}" alt="">${i === 0 ? '<span class="adm-img-tag">رئيسية</span>' : ''}
      <div class="adm-img-act"><button type="button" data-img="earlier" ${i === 0 ? 'disabled' : ''} aria-label="تقديم">→</button><button type="button" data-img="remove" aria-label="حذف الصورة">✕</button><button type="button" data-img="later" ${i === n - 1 ? 'disabled' : ''} aria-label="تأخير">←</button></div></div>`;
  }).join('') + (n < MAX_IMAGES ? '<button type="button" class="adm-img adm-img-add" id="eAddImg"><b>＋</b>إضافة صور</button>' : '');
}

function refreshEditorState() {
  const E = S.editor; if (!E) return;
  const eb = $('#eErr'); if (eb) eb.hidden = true;   // stale validation message goes away as soon as the form changes
  const n = E.images.length, c = $('#imgCount');
  c.textContent = `${n} / ${MIN_IMAGES} على الأقل`; c.className = 'adm-count ' + (n >= MIN_IMAGES ? 'ok' : 'bad');
  const w = parseInt(E.weight, 10);
  $('#priceHint').innerHTML = w > 0 ? `السعر المقترح حسب الوزن: <b>${fmtPrice(calcPrice(w))}</b> ${E.priceTouched && String(calcPrice(w)) !== E.price ? '<a href="#" id="useCalc" style="color:var(--f2);font-weight:800">استخدمه</a>' : ''}` : 'أدخل الوزن ليُحسب السعر المقترح تلقائياً.';
}

function validateEditor() {
  const E = S.editor, errs = [];
  const w = Number(E.weight), pr = Number(E.price);
  if (!E.name.trim()) errs.push('اكتب اسم المنتج.');
  if (!/^\d+$/.test(String(E.weight).trim()) || w < 1) errs.push('الوزن يجب أن يكون رقماً صحيحاً أكبر من 0 (بالغرام).');
  if (!/^\d+$/.test(String(E.price).trim()) || pr < 1) errs.push('السعر يجب أن يكون رقماً صحيحاً أكبر من 0.');
  if (E.images.length < MIN_IMAGES) errs.push(`أضف ${MIN_IMAGES} صور على الأقل (الحالي ${E.images.length}).`);
  if (!E.material.trim()) errs.push('اكتب الخامة.');
  if (E.old.trim() && (!/^\d+$/.test(E.old.trim()) || Number(E.old) <= pr)) errs.push('السعر قبل الخصم يجب أن يكون رقماً أكبر من السعر الحالي (أو اتركه فارغاً).');
  const dup = S.products.find(p => p.id !== E.id && isManaged(p) && p.name.trim().toLowerCase() === E.name.trim().toLowerCase());
  if (dup) errs.push(`يوجد منتج بنفس الاسم (#${dup.productNumber}).`);
  return errs;
}

/* choose a free file name:  assets/images/products/<cat-slug>/<cat-slug>-<product-slug>-NN.jpg */
function freePath(catSlug, slug, taken, ext) {
  for (let n = 1; n < 100; n++) {
    const path = `${PRODUCT_DIR}${catSlug}/${catSlug}-${slug}-${String(n).padStart(2, '0')}.${ext || 'jpg'}`;
    if (!taken.has(path) && !S.pendingDeletes.has(path)) return path;
  }
  throw new Error('no free image name');
}
const allPaths = () => new Set([...S.products.flatMap(p => p.images), ...S.pendingFiles.keys()]);

function dropImagePath(path) {
  if (!path.startsWith(PRODUCT_DIR) && !path.startsWith(HERO_DIR)) return;     // never delete brand icons / placeholders
  if (S.products.some(p => p.images.includes(path))) return;                    // still used by a product
  if (((S.store.hero || {}).slides || []).some(s => s.image === path)) return; // still used by a banner
  if (S.pendingFiles.has(path)) S.pendingFiles.delete(path); else S.pendingDeletes.add(path);
}

function saveEditor() {
  const E = S.editor, errs = validateEditor();
  const box = $('#eErr');
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(esc).join('<br>'); return; }
  const cat = catById(E.categoryId);
  const name = E.name.trim(), weightGrams = parseInt(E.weight, 10), price = parseInt(E.price, 10), material = E.material.trim();
  let rec, removed = [];
  if (E.mode === 'add') {
    const productNumber = Math.max(0, ...S.products.map(p => p.productNumber || 0)) + 1;
    const idx = Math.max(-1, ...S.products.filter(p => p.categoryId === cat.id).map(p => { const m = p.id.match(/-(\d+)$/); return m ? +m[1] : -1; })) + 1;
    let slug = slugify(name) || `item-${productNumber}`; const base = slug; let k = 2;
    while (S.products.some(p => p.categoryId === cat.id && p.slug === slug)) slug = `${base}-${k++}`;
    rec = { id: `${cat.id}-${idx}`, productNumber, categoryId: cat.id, slug, name, weightGrams, price, material, images: [] };
  } else {
    rec = S.products.find(p => p.id === E.id);
    const keep = new Set(E.images.filter(i => i.kind === 'existing').map(i => i.path));
    removed = rec.images.filter(p => !keep.has(p));
    Object.assign(rec, { name, categoryId: cat.id, weightGrams, price, material });
  }
  const opt = (k, v) => { if (v) rec[k] = v; else delete rec[k]; };
  opt('description', E.desc.trim()); opt('stock', E.stock !== 'available' ? E.stock : ''); opt('badge', E.badge);
  opt('oldPrice', E.old.trim() ? parseInt(E.old, 10) : 0); opt('dimensions', E.dim.trim()); opt('printTime', E.print.trim()); opt('hidden', E.hidden);
  // resolve image list in the chosen order (new images get fresh file names)
  const taken = allPaths();
  const finalPaths = [];
  for (const im of E.images) {
    if (im.kind === 'existing') { finalPaths.push(im.path); continue; }
    const path = freePath(cat.slug, rec.slug, taken, im.ext); taken.add(path);
    S.pendingFiles.set(path, im.data); S.previews.set(path, im.preview); finalPaths.push(path);
  }
  rec.images = finalPaths;
  if (E.mode === 'add') {
    // keep products.json grouped by category: insert after the last product of that category
    let at = -1; S.products.forEach((p, i) => { if (p.categoryId === cat.id) at = i; });
    if (at < 0) S.products.push(rec); else S.products.splice(at + 1, 0, rec);
    S.touched.set(rec.id, 'new'); S.log.push(`＋ إضافة: ${name} (${cat.name}) #${rec.productNumber}`);
  } else {
    removed.forEach(dropImagePath);
    if (S.touched.get(rec.id) !== 'new') S.touched.set(rec.id, 'edited');
    S.log.push(`✎ تعديل: ${name} #${rec.productNumber}`);
  }
  closeEditor(); renderAll();
  toast(E.mode === 'add' ? 'تمت إضافة المنتج. اضغط «نشر التغييرات» ليظهر في الموقع.' : 'تم حفظ التعديلات. اضغط «نشر التغييرات» لتظهر في الموقع.');
}
A.saveEditor = saveEditor;

function deleteProduct(id) {
  const p = S.products.find(x => x.id === id); if (!p) return;
  if (!confirm(`حذف «${p.name}» نهائياً مع صوره؟\n(يتم الحذف فعلياً عند الضغط على «نشر التغييرات»)`)) return;
  S.products = S.products.filter(x => x.id !== id);
  p.images.forEach(dropImagePath);
  if (S.touched.get(id) === 'new') {            // added in this session and never published → just forget it
    S.log = S.log.filter(l => !l.endsWith(` #${p.productNumber}`));
  } else {
    S.log = S.log.filter(l => !l.endsWith(` #${p.productNumber}`));   // drop earlier "edited" lines for it
    S.log.push(`✕ حذف: ${p.name} #${p.productNumber}`);
  }
  S.touched.delete(id);
  closeEditor(); renderAll();
  toast('تم الحذف محلياً. اضغط «نشر التغييرات» لتطبيقه على الموقع.');
}
A.deleteProduct = deleteProduct;

/* ───────── publish (one atomic commit) ───────── */
async function publish() {
  if (!pendingCount()) return;
  const btn = $('#btnPublish'); if (btn) { btn.disabled = true; btn.textContent = 'جاري النشر...'; }
  try {
    const br = encodeURIComponent(S.cfg.branch);
    // 1) make sure nobody changed the data files since we loaded them
    const [remoteProducts, remoteStore] = await Promise.all([
      gh(`/contents/data/products.json?ref=${br}`, { raw: true }),
      gh(`/contents/data/store.json?ref=${br}`, { raw: true })
    ]);
    if (remoteProducts !== S.baseText || remoteStore !== S.storeBaseText) throw new Error('تم تعديل بيانات الموقع في المستودع من مكان آخر بعد تحميل اللوحة. اضغط «تجاهل الكل» ثم أعد التحميل وكرّر التعديل حتى لا تُكتب فوق تعديلات الآخرين.');
    const ref = await gh(`/git/ref/heads/${br}`);
    const head = ref.object.sha;
    const commit = await gh(`/git/commits/${head}`);

    // 2) blobs for new images
    const tree = [];
    const entries = [...S.pendingFiles.entries()];
    let done = 0;
    const queue = entries.slice();
    const worker = async () => {
      while (queue.length) {
        const [path, b64] = queue.shift();
        const blob = await gh('/git/blobs', { method: 'POST', body: { content: b64, encoding: 'base64' } });
        tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        done++; if (btn) btn.textContent = `رفع الصور ${done}/${entries.length}...`;
      }
    };
    await Promise.all([worker(), worker(), worker()]);

    // 3) data files
    const doc = { ...S.doc, products: S.products };
    const text = JSON.stringify(doc, null, 2);
    const storeText = JSON.stringify(S.store, null, 2);
    const fallback = '/* AUTO-GENERATED by the dashboard / tools/build_data.py — do not edit. Used only for file:// previews. */\nwindow.__DRAGON_DATA__=' + JSON.stringify({ store: S.store, products: doc }) + ';\n';
    tree.push({ path: 'data/products.json', mode: '100644', type: 'blob', content: text });
    if (storeText !== S.storeBaseText) tree.push({ path: 'data/store.json', mode: '100644', type: 'blob', content: storeText });
    tree.push({ path: 'data/data.fallback.js', mode: '100644', type: 'blob', content: fallback });
    S.pendingDeletes.forEach(path => tree.push({ path, mode: '100644', type: 'blob', sha: null }));

    // 4) tree → commit → move branch
    const nt = await gh('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
    const msg = `Dashboard: ${S.log.length} change${S.log.length > 1 ? 's' : ''}\n\n` + S.log.join('\n');
    const nc = await gh('/git/commits', { method: 'POST', body: { message: msg, tree: nt.sha, parents: [head] } });
    await gh(`/git/refs/heads/${br}`, { method: 'PATCH', body: { sha: nc.sha } });

    S.baseText = text; S.doc = doc; S.storeBaseText = storeText;
    S.pendingFiles.clear(); S.pendingDeletes.clear(); S.touched.clear(); S.log = [];
    renderAll();
    toast('✓ تم النشر. سيظهر التحديث في الموقع خلال دقيقة تقريباً (GitHub Pages).');
  } catch (e) {
    toast(e.message, 'err'); renderPending();
  }
}
A.publish = publish;

async function discard() {
  if (!confirm('تجاهل كل التغييرات غير المنشورة وإعادة تحميل البيانات من المستودع؟')) return;
  await connect();
}

/* ───────── store.json editing: pricing rule + sections ───────── */
const ICONS = [['trend', '📈', 'رسم صاعد'], ['flame', '🔥', 'شعلة'], ['tag', '🏷️', 'وسم / خصم'], ['gift', '🎁', 'هدية'], ['palette', '🎨', 'لوحة ألوان'], ['gear', '⚙️', 'ترس'], ['cpu', '🔌', 'إلكترونيات'], ['joystick', '🎮', 'يد ألعاب'], ['star', '⭐', 'نجمة'], ['heart', '❤️', 'قلب'], ['box', '📦', 'صندوق'], ['wrench', '🔧', 'مفتاح ربط'], ['bolt', '⚡', 'برق'], ['crown', '👑', 'تاج']];
const iconEmoji = k => (ICONS.find(i => i[0] === k) || ['', '▣'])[1];
const ROUND_STEPS = [1, 10, 100, 250, 500, 1000];
const logOnce = msg => { if (!S.log.includes(msg)) S.log.push(msg); };
const catCount = c => S.products.filter(p => p.categoryId === c.id).length;
const setOpt = (o, k, v) => { if (v) o[k] = v; else delete o[k]; };

function openSheet(type, title, body, footer) {
  S.editor = null; S.sheet = { type, view: 'main', id: null };
  $('#editorHost').innerHTML = `<div class="ovl adm-ovl" id="sheet"><div class="adm-sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="adm-sheet-hdr"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="إغلاق">✕</button></div>
    <div class="adm-sheet-body" id="sheetBody">${body}</div><div class="adm-sheet-ftr" id="sheetFtr">${footer}</div></div></div>`;
}
function setSheet(title, body, footer, keepScroll) {
  const bd = $('#sheetBody'), y = bd.scrollTop;
  $('#sheet .adm-sheet-hdr h2').textContent = title; bd.innerHTML = body; $('#sheetFtr').innerHTML = footer; bd.scrollTop = keepScroll ? y : 0;
}

/* ---- pricing ---- */
const tierRowHTML = (th, pg) => `<div class="adm-tier"><span>أقل من</span><input class="field-input" data-tier="th" inputmode="numeric" value="${esc(th)}" aria-label="الوزن بالغرام"><span>غ ←</span><input class="field-input" data-tier="pg" inputmode="numeric" value="${esc(pg)}" aria-label="سعر الغرام"><span>د.ع/غ</span><button type="button" class="adm-btn-ghost" data-sec-act="tier-del" aria-label="حذف الشريحة">✕</button></div>`;
function pricingBodyHTML(rule) {
  return `<p class="adm-muted">السعر = الوزن × سعر الغرام، ثم يُقرَّب للأعلى. تُستخدم القاعدة لاقتراح السعر عند إضافة منتج أو تغيير وزنه (ويمكنك دائماً تعديل السعر يدوياً).</p>
  <div><label class="field-lbl" for="pDef">سعر الغرام الافتراضي (د.ع)</label><input class="field-input" id="pDef" inputmode="numeric" value="${esc(rule.defaultPerGram)}"></div>
  <div><label class="field-lbl">شرائح القطع الصغيرة <span class="adm-muted">(سعر غرام أعلى للأوزان الأقل)</span></label><div id="pTiers" class="adm-tiers">${(rule.tiers || []).map(t => tierRowHTML(t.belowGrams, t.perGram)).join('')}</div><button type="button" class="adm-btn-ghost" data-sec-act="tier-add">＋ إضافة شريحة</button></div>
  <div><label class="field-lbl" for="pRound">تقريب السعر لأعلى إلى أقرب</label><select class="field-input" id="pRound">${ROUND_STEPS.map(r => `<option value="${r}" ${r === rule.roundUpTo ? 'selected' : ''}>${r.toLocaleString('en-US')} د.ع</option>`).join('')}</select></div>
  <div><label class="field-lbl">معاينة</label><div class="adm-prev" id="pPrev"></div></div>
  <div><label class="field-lbl" for="pScope">عند «حفظ وتطبيق» أعد تسعير</label><select class="field-input" id="pScope"><option value="all">كل المنتجات</option>${realCats().map(c => `<option value="${esc(c.id)}">${esc(c.name)} فقط</option>`).join('')}</select>
  <div class="adm-hint"><b>تنبيه:</b> إعادة التسعير تستبدل الأسعار الحالية (حتى التي عدّلتها يدوياً) بالسعر المحسوب من الوزن.</div></div>
  <p class="adm-err" id="pErr" hidden></p>`;
}
function openPricing() {
  const rule = S.store.pricing || { roundUpTo: 1000, tiers: [{ belowGrams: 100, perGram: 130 }], defaultPerGram: 100 };
  openSheet('pricing', 'قاعدة التسعير', pricingBodyHTML(rule),
    '<button class="btn-fire" type="button" data-sec-act="p-apply">حفظ وتطبيق على المنتجات</button><button class="adm-btn-ghost" type="button" data-sec-act="p-save">حفظ القاعدة فقط</button><button class="adm-btn-ghost" type="button" data-close>إلغاء</button>');
  updatePricingPreview();
}
function readPricingForm() {
  const errs = [], num = v => (/^\d+$/.test(String(v).trim()) ? parseInt(v, 10) : NaN);
  const def = num($('#pDef').value);
  if (!(def > 0)) errs.push('سعر الغرام الافتراضي يجب أن يكون رقماً أكبر من 0.');
  const tiers = [...document.querySelectorAll('#pTiers .adm-tier')].map(r => ({ belowGrams: num(r.querySelector('[data-tier=th]').value), perGram: num(r.querySelector('[data-tier=pg]').value) }));
  tiers.forEach((t, i) => { if (!(t.belowGrams > 0) || !(t.perGram > 0)) errs.push(`الشريحة ${i + 1}: أدخل أرقاماً صحيحة أكبر من 0.`); });
  if (new Set(tiers.map(t => t.belowGrams)).size !== tiers.length) errs.push('لا يمكن تكرار نفس حدّ الوزن في شريحتين.');
  const rule = { currency: S.store.pricing?.currency || 'د.ع', roundUpTo: parseInt($('#pRound').value, 10), tiers: tiers.slice().sort((a, b) => a.belowGrams - b.belowGrams), defaultPerGram: def };
  return { rule, errs };
}
function updatePricingPreview() {
  const { rule, errs } = readPricingForm();
  $('#pPrev').innerHTML = errs.length ? '<span class="adm-muted">أكمل الأرقام لتظهر المعاينة</span>' : [10, 25, 50, 99, 100, 250, 500].map(w => `<span><b>${w}g</b> ${fmtPrice(calcPrice(w, rule))}</span>`).join('');
}
function savePricing(apply) {
  const { rule, errs } = readPricingForm(), box = $('#pErr');
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(esc).join('<br>'); return; }
  const scope = $('#pScope').value;
  const ruleChanged = JSON.stringify(rule) !== JSON.stringify(S.store.pricing);
  S.store.pricing = rule;
  if (ruleChanged) logOnce('$ تعديل قاعدة التسعير');
  let changed = 0;
  if (apply) {
    S.products.filter(p => isManaged(p) && (scope === 'all' || p.categoryId === scope) && p.weightGrams > 0).forEach(p => {
      const np = calcPrice(p.weightGrams, rule);
      if (np !== p.price) { p.price = np; changed++; if (S.touched.get(p.id) !== 'new') S.touched.set(p.id, 'edited'); }
    });
    if (changed) S.log.push(`$ إعادة تسعير ${changed} منتج${scope === 'all' ? '' : ' (' + (catById(scope)?.name || scope) + ')'}`);
  }
  closeEditor(); renderAll();
  toast(apply ? `تم حفظ القاعدة وتغيير سعر ${changed} منتج. اضغط «نشر التغييرات» لتظهر في الموقع.` : (ruleChanged ? 'تم حفظ قاعدة التسعير. اضغط «نشر التغييرات».' : 'لا يوجد تغيير في القاعدة.'));
}
A.openPricing = openPricing; A.savePricing = savePricing;

/* ---- sections ---- */
function sectionsListHTML() {
  const cats = S.store.categories;
  const rows = cats.map((c, i) => {
    const real = !c.shared && !c.comingSoon;
    const badges = [c.shared ? 'تلقائي' : '', c.comingSoon ? 'قريباً' : '', c.hidden ? 'مخفي' : ''].filter(Boolean).map(b => `<span class="adm-badge ${b === 'مخفي' ? 'off' : ''}">${b}</span>`).join('');
    const info = c.shared ? 'يُبنى تلقائياً من المنتجات' : `${catCount(c)} منتج`;
    return `<div class="adm-sec ${c.hidden ? 'is-off' : ''}" data-id="${esc(c.id)}">
      <div class="adm-sec-move"><button type="button" data-sec-act="up" ${i === 0 ? 'disabled' : ''} aria-label="للأعلى">▲</button><button type="button" data-sec-act="down" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="للأسفل">▼</button></div>
      <div class="adm-sec-info"><b>${iconEmoji(c.icon)} ${esc(c.name)}</b> ${badges}<div class="adm-muted">${info}</div></div>
      <div class="adm-sec-btns"><button type="button" class="adm-btn-ghost" data-sec-act="edit">تعديل</button><button type="button" class="adm-btn-ghost" data-sec-act="toggle">${c.hidden ? 'إظهار' : 'إخفاء'}</button>${real ? '<button type="button" class="adm-btn-ghost adm-btn-danger" data-sec-act="del">حذف</button>' : ''}</div></div>`;
  }).join('');
  return `<p class="adm-muted">هذا الترتيب هو ترتيب الأقسام في الموقع وفي شريط التنقل. الأقسام التلقائية لا تُحذف لكن يمكن إخفاؤها.</p><div class="adm-secs">${rows}</div>`;
}
const SEC_LIST_FOOTER = '<button class="btn-fire" type="button" data-sec-act="new">＋ قسم جديد</button><button class="adm-btn-ghost" type="button" data-close>تم</button>';
function openSections() { openSheet('sections', 'أقسام الموقع', sectionsListHTML(), SEC_LIST_FOOTER); }
function showSectionsList(keepScroll) { S.sheet.view = 'main'; S.sheet.id = null; setSheet('أقسام الموقع', sectionsListHTML(), SEC_LIST_FOOTER, keepScroll); }
A.openSections = openSections;

function catFormHTML(c) {
  const cur = c || { name: '', slogan: '', icon: 'star' };
  return `<div><label class="field-lbl" for="cName">اسم القسم</label><input class="field-input" id="cName" value="${esc(cur.name)}" maxlength="40" autocomplete="off"></div>
  <div><label class="field-lbl" for="cSlogan">وصف قصير تحت العنوان</label><input class="field-input" id="cSlogan" value="${esc(cur.slogan)}" maxlength="90" autocomplete="off"></div>
  <div class="adm-two"><div><label class="field-lbl" for="cIcon">الأيقونة</label><select class="field-input" id="cIcon">${ICONS.map(i => `<option value="${i[0]}" ${i[0] === cur.icon ? 'selected' : ''}>${i[1]} ${i[2]}</option>`).join('')}</select></div>
  <div><label class="field-lbl" for="cNav">نص زر التنقل (اختياري)</label><input class="field-input" id="cNav" value="${esc(cur.navLabel || '')}" maxlength="24" placeholder="مثل اسم القسم" autocomplete="off"></div></div>
  <label class="adm-check"><input type="checkbox" id="cNavIcon" ${cur.navIcon ? 'checked' : ''}> إظهار الأيقونة على زر القسم في شريط التنقل</label>
  ${c ? `<div class="adm-hint">المعرّف: <code>${esc(c.id)}</code> · مجلد الصور: <code>assets/images/products/${esc(c.slug)}/</code> — ثابتان حتى لا تنكسر الروابط المشتركة والسلات المحفوظة.</div>`
      : `<div><label class="field-lbl" for="cSlug">معرّف إنجليزي (اسم مجلد الصور)</label><input class="field-input" id="cSlug" dir="ltr" placeholder="مثال: keychains" autocomplete="off"><div class="adm-hint">أحرف إنجليزية صغيرة وأرقام وشرطات فقط، ولا يمكن تغييره لاحقاً. إن تركته فارغاً يُولَّد تلقائياً من الاسم.</div></div>`}
  <p class="adm-err" id="cErr" hidden></p>`;
}
function showCatForm(id) {
  const c = id ? catById(id) : null;
  S.sheet.view = 'form'; S.sheet.id = id || null;
  setSheet(c ? `تعديل القسم: ${c.name}` : 'قسم جديد', catFormHTML(c), `<button class="btn-fire" type="button" data-sec-act="save">${c ? 'حفظ' : 'إنشاء القسم'}</button><button class="adm-btn-ghost" type="button" data-sec-act="back">رجوع</button>`);
  $('#cName').focus();
}
function saveCat() {
  const id = S.sheet.id, cats = S.store.categories;
  const name = $('#cName').value.trim(), slogan = $('#cSlogan').value.trim(), icon = $('#cIcon').value, navLabel = $('#cNav').value.trim(), navIconOn = $('#cNavIcon').checked;
  const errs = [];
  if (!name) errs.push('اكتب اسم القسم.');
  if (cats.some(c => c.id !== id && c.name.trim().toLowerCase() === name.toLowerCase())) errs.push('يوجد قسم بنفس الاسم.');
  let slug = '';
  if (!id) {
    slug = $('#cSlug').value.trim().toLowerCase() || slugify(name);
    if (!slug) { let n = cats.length + 1; while (cats.some(c => c.id === 'section-' + n)) n++; slug = 'section-' + n; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errs.push('المعرّف الإنجليزي: أحرف إنجليزية صغيرة وأرقام وشرطات فقط.');
    else if (slug === 'all' || cats.some(c => c.id === slug || c.slug === slug)) errs.push('هذا المعرّف مستخدم، اختر معرّفاً آخر.');
  }
  const box = $('#cErr');
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(esc).join('<br>'); return; }
  if (id) {
    const c = catById(id);
    Object.assign(c, { name, slogan, icon }); setOpt(c, 'navLabel', navLabel); setOpt(c, 'navIcon', navIconOn ? icon : '');
    S.log.push(`▤ تعديل قسم: ${name}`);
  } else {
    const c = { id: slug, slug, name, slogan, icon }; setOpt(c, 'navIcon', navIconOn ? icon : ''); setOpt(c, 'navLabel', navLabel);
    let at = -1; cats.forEach((x, i) => { if (!x.shared && !x.comingSoon) at = i; });
    if (at < 0) cats.push(c); else cats.splice(at + 1, 0, c);
    S.log.push(`▤ قسم جديد: ${name}`);
  }
  renderAll(); showSectionsList(); toast('تم الحفظ. اضغط «نشر التغييرات» لتظهر في الموقع.');
}
function delCatHTML(c) {
  const n = catCount(c), others = realCats().filter(x => x.id !== c.id);
  if (!n) return `<p>حذف القسم «<b>${esc(c.name)}</b>»؟ لا توجد فيه منتجات.</p>`;
  return `<p>القسم «<b>${esc(c.name)}</b>» فيه <b>${n}</b> منتج. ماذا تفعل بها؟</p>
  <label class="adm-radio"><input type="radio" name="dmode" value="move" ${others.length ? 'checked' : 'disabled'}> <span>نقلها إلى قسم:</span> <select class="field-input" id="dTarget" ${others.length ? '' : 'disabled'}>${others.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select></label>
  <label class="adm-radio"><input type="radio" name="dmode" value="delete" ${others.length ? '' : 'checked'}> <span>حذفها نهائياً مع صورها</span></label>`;
}
function showDelCat(id) {
  const c = catById(id); S.sheet.view = 'del'; S.sheet.id = id;
  setSheet(`حذف القسم: ${c.name}`, delCatHTML(c), '<button class="btn-fire adm-danger-fill" type="button" data-sec-act="del-ok">تأكيد الحذف</button><button class="adm-btn-ghost" type="button" data-sec-act="back">رجوع</button>');
}
function doDelCat() {
  const c = catById(S.sheet.id), n = catCount(c);
  const mode = n ? (document.querySelector('input[name=dmode]:checked')?.value || 'delete') : 'none';
  let note = '';
  if (mode === 'move') {
    const target = catById($('#dTarget').value);
    S.products.filter(p => p.categoryId === c.id).forEach(p => { p.categoryId = target.id; if (S.touched.get(p.id) !== 'new') S.touched.set(p.id, 'edited'); });
    note = ` (نقل ${n} منتج إلى ${target.name})`;
  } else if (mode === 'delete') {
    const gone = S.products.filter(p => p.categoryId === c.id);
    S.products = S.products.filter(p => p.categoryId !== c.id);
    gone.forEach(p => { p.images.forEach(dropImagePath); S.touched.delete(p.id); S.log = S.log.filter(l => !l.endsWith(` #${p.productNumber}`)); });
    note = ` (حذف ${n} منتج)`;
  }
  S.store.categories = S.store.categories.filter(x => x.id !== c.id);
  S.log.push(`▤ حذف قسم: ${c.name}${note}`);
  renderAll(); showSectionsList(); toast('تم حذف القسم محلياً. اضغط «نشر التغييرات» لتطبيقه.');
}

/* one click handler for everything inside the pricing / sections sheet */
function sheetClick(e) {
  if (S.sheet.type === 'settings') return settingsClick(e);
  const t = e.target;
  if (t.closest('[data-close]')) return closeEditor();
  const b = t.closest('[data-sec-act]'); if (!b) return;
  const act = b.dataset.secAct, row = b.closest('.adm-sec'), id = row?.dataset.id;
  if (act === 'tier-add') { $('#pTiers').insertAdjacentHTML('beforeend', tierRowHTML('', '')); return updatePricingPreview(); }
  if (act === 'tier-del') { b.closest('.adm-tier').remove(); return updatePricingPreview(); }
  if (act === 'p-save') return savePricing(false);
  if (act === 'p-apply') return savePricing(true);
  if (act === 'new') return showCatForm(null);
  if (act === 'edit') return showCatForm(id);
  if (act === 'del') return showDelCat(id);
  if (act === 'back') return showSectionsList();
  if (act === 'save') return saveCat();
  if (act === 'del-ok') return doDelCat();
  const cats = S.store.categories, i = cats.findIndex(c => c.id === id);
  if (act === 'toggle') { const c = cats[i]; setOpt(c, 'hidden', !c.hidden); S.log.push(`▤ ${c.hidden ? 'إخفاء' : 'إظهار'} قسم: ${c.name}`); }
  else if (act === 'up' && i > 0) { [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; logOnce('▤ ترتيب الأقسام'); }
  else if (act === 'down' && i < cats.length - 1) { [cats[i + 1], cats[i]] = [cats[i], cats[i + 1]]; logOnce('▤ ترتيب الأقسام'); }
  renderAll(); showSectionsList(true);
}
A.sheetClick = sheetClick;

/* ───────── duplicate a product (copies its images too) ───────── */
async function duplicateProduct(id) {
  const p = S.products.find(x => x.id === id); if (!p) return;
  openEditor(null);
  const E = S.editor;
  Object.assign(E, { name: p.name + ' (نسخة)', categoryId: p.categoryId, weight: String(p.weightGrams), price: String(p.price), priceTouched: true, material: p.material || 'PLA Premium', desc: p.description || '', stock: p.stock || 'available', badge: p.badge || '', old: p.oldPrice ? String(p.oldPrice) : '', dim: p.dimensions || '', print: p.printTime || '' });
  openEditorFill();
  for (const path of p.images) {
    try {
      const blob = await (await fetch(imgSrc(path))).blob();
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      if (S.editor !== E) return;
      E.images.push({ kind: 'new', data: url.split(',')[1], preview: url, ext: (path.split('.').pop() || 'jpg').toLowerCase() });
    } catch (e) { toast('تعذّر نسخ إحدى الصور — أضفها يدوياً.', 'err'); }
  }
  renderEditorImages(); refreshEditorState();
}
function openEditorFill() {
  const E = S.editor; if (!E) return;
  $('#eName').value = E.name; $('#eCat').value = E.categoryId; $('#eWeight').value = E.weight; $('#ePrice').value = E.price; $('#eMat').value = E.material;
  $('#eDesc').value = E.desc; $('#eStock').value = E.stock; $('#eBadge').value = E.badge; $('#eOld').value = E.old; $('#eDim').value = E.dim; $('#ePrint').value = E.print;
  refreshEditorState();
}
A.duplicateProduct = duplicateProduct;

/* ───────── site settings sheet (store.json) ───────── */
const ST_TABS = [['contact', 'التواصل والإعلان'], ['hero', 'البنرات'], ['ship', 'التوصيل والدفع'], ['pages', 'الصفحات والأسئلة'], ['track', 'التتبع'], ['tools', 'نسخ احتياطي']];
const validUrl = u => !u || /^https?:\/\/\S+$/i.test(u);
const fld = (id, label, val, extra = '') => `<div><label class="field-lbl" for="${id}">${label}</label><input class="field-input" id="${id}" value="${esc(val ?? '')}" autocomplete="off" ${extra}></div>`;

function heroRowsHTML() {
  const hs = S.sheet.hero;
  return hs.map((s, i) => `<div class="adm-hero" data-i="${i}"><img src="${esc(s.kind === 'new' ? s.preview : imgSrc(s.image))}" alt=""><div class="adm-hero-f"><input class="field-input" data-hero-title value="${esc(s.title)}" placeholder="عنوان يظهر على البنر" maxlength="60"></div>
    <div class="adm-hero-b"><button type="button" data-st-act="hero-up" ${i === 0 ? 'disabled' : ''} aria-label="للأعلى">▲</button><button type="button" data-st-act="hero-down" ${i === hs.length - 1 ? 'disabled' : ''} aria-label="للأسفل">▼</button><button type="button" data-st-act="hero-del" aria-label="حذف البنر">✕</button></div></div>`).join('') +
    `<button type="button" class="adm-btn-ghost" data-st-act="hero-add">＋ إضافة بنر</button><div class="adm-hint">الأفضل صورة عريضة بنسبة قريبة من 1640×624 (تُصغَّر تلقائياً إلى عرض 1640px). ${hs.length < 1 ? '<b>يلزم بنر واحد على الأقل.</b>' : ''}</div>`;
}
function pagesRowsHTML() {
  return S.sheet.pages.map((p, i) => `<div class="adm-page" data-i="${i}"><div class="adm-page-h"><input class="field-input" data-pg-title value="${esc(p.title)}" placeholder="عنوان الصفحة" maxlength="50">${p.draft ? '<span class="adm-badge">مسودة — راجعها</span>' : ''}<button type="button" class="adm-btn-ghost adm-btn-danger" data-st-act="pg-del" aria-label="حذف الصفحة">✕</button></div>
    <textarea class="field-input" data-pg-body rows="5" placeholder="النص. اترك سطراً فارغاً بين الفقرات، وابدأ السطر بـ «- » لعمل قائمة.">${esc(p.body)}</textarea>
    <label class="adm-check"><input type="checkbox" data-pg-footer ${p.footer !== false ? 'checked' : ''}> إظهار الرابط في أسفل الموقع</label></div>`).join('') + '<button type="button" class="adm-btn-ghost" data-st-act="pg-add">＋ صفحة جديدة</button>';
}
function faqRowsHTML() {
  return S.sheet.faq.map((q, i) => `<div class="adm-page" data-i="${i}"><div class="adm-page-h"><input class="field-input" data-fq-q value="${esc(q.q)}" placeholder="السؤال" maxlength="120"><button type="button" class="adm-btn-ghost adm-btn-danger" data-st-act="fq-del" aria-label="حذف السؤال">✕</button></div><textarea class="field-input" data-fq-a rows="2" placeholder="الجواب">${esc(q.a)}</textarea></div>`).join('') + '<button type="button" class="adm-btn-ghost" data-st-act="fq-add">＋ سؤال جديد</button>';
}
function payRowsHTML() {
  return S.sheet.pays.map((p, i) => `<div class="adm-pay" data-i="${i}"><input class="field-input" data-pay value="${esc(p)}" placeholder="مثال: الدفع عند الاستلام" maxlength="40"><button type="button" class="adm-btn-ghost adm-btn-danger" data-st-act="pay-del" aria-label="حذف">✕</button></div>`).join('') + '<button type="button" class="adm-btn-ghost" data-st-act="pay-add">＋ طريقة دفع</button>';
}
function settingsBodyHTML() {
  const st = S.store, ct = st.contact || {}, sc = st.social || {}, an = st.announcement || {}, co = st.customOrder || {}, sh = st.shipping || { governorates: [] }, tr = st.analytics || {};
  const tabs = `<div class="adm-tabs" role="tablist">${ST_TABS.map(([k, l], i) => `<button type="button" role="tab" class="adm-tab ${i === 0 ? 'on' : ''}" data-st-tab="${k}">${l}</button>`).join('')}</div>`;
  const contact = `<section data-panel="contact">
    <div class="adm-two">${fld('sWa', 'رقم واتساب (مع رمز الدولة)', ct.whatsapp, 'dir="ltr" inputmode="numeric" placeholder="9647701234567"')}${fld('sPhone', 'الرقم المعروض للزبائن', ct.phoneDisplay, 'dir="ltr" placeholder="+964 770 123 4567"')}</div>
    ${fld('sHours', 'ساعات العمل (اختياري)', ct.hours, 'placeholder="مثال: 10 صباحاً - 10 مساءً"')}
    <div class="adm-two">${fld('sFb', 'رابط فيسبوك', sc.facebook, 'dir="ltr"')}${fld('sIg', 'رابط إنستغرام', sc.instagram, 'dir="ltr"')}${fld('sTk', 'رابط تيك توك (اختياري)', sc.tiktok, 'dir="ltr"')}${fld('sTg', 'رابط تيليغرام (اختياري)', sc.telegram, 'dir="ltr"')}</div>
    <h4 class="adm-h4">شريط الإعلان أعلى الموقع</h4>
    <label class="adm-check"><input type="checkbox" id="sAnnOn" ${an.enabled ? 'checked' : ''}> إظهار الشريط</label>
    ${fld('sAnnText', 'نص الإعلان', an.text, 'maxlength="140" placeholder="مثال: خصم 10% على كل المجسمات هذا الأسبوع"')}${fld('sAnnLink', 'رابط عند الضغط (اختياري)', an.link, 'dir="ltr" placeholder="https://..."')}
    <h4 class="adm-h4">زر «اطلب تصميمك»</h4>
    <div class="adm-two">${fld('sCoLabel', 'نص الزر', co.label, 'maxlength="30"')}<label class="adm-check" style="align-self:end"><input type="checkbox" id="sCoOn" ${co.enabled !== false ? 'checked' : ''}> مفعّل</label></div></section>`;
  const hero = `<section data-panel="hero" hidden><div>${fld('sHeroSec', 'مدة بقاء كل بنر (ثوانٍ)', String(Math.round(((st.hero || {}).intervalMs || 3400) / 100) / 10), 'inputmode="decimal"')}</div><div id="heroRows">${heroRowsHTML()}</div></section>`;
  const gov = `<table class="adm-tbl"><tbody>${(sh.governorates || []).map(g => `<tr><td>${esc(g.name)}</td><td><input class="field-input" data-gov="${esc(g.name)}" inputmode="numeric" value="${g.fee == null ? '' : g.fee}" placeholder="تُحدَّد عند التأكيد"></td></tr>`).join('')}</tbody></table>`;
  const ship = `<section data-panel="ship" hidden><p class="adm-muted">أجرة التوصيل لكل محافظة (د.ع). اترك الخانة فارغة لتظهر للزبون «تُحدَّد عند التأكيد».</p>${fld('sFree', 'توصيل مجاني للطلبات فوق (د.ع) — 0 للتعطيل', sh.freeOver || 0, 'inputmode="numeric"')}${gov}<h4 class="adm-h4">طرق الدفع</h4><p class="adm-muted">تظهر للزبون عند الطلب. اتركها فارغة إن لم تحتج.</p><div id="payRows">${payRowsHTML()}</div></section>`;
  const pages = `<section data-panel="pages" hidden><h4 class="adm-h4">الصفحات (الشحن، الاسترجاع، الخصوصية، من نحن...)</h4><div id="pageRows">${pagesRowsHTML()}</div><h4 class="adm-h4">الأسئلة الشائعة</h4><div id="faqRows">${faqRowsHTML()}</div></section>`;
  const track = `<section data-panel="track" hidden><p class="adm-muted">أدخل المعرّفات فقط وسيفعّل الموقع التتبع تلقائياً (بدون تعديل كود). اتركها فارغة لعدم استخدامها.</p>${fld('sGa', 'Google Analytics 4 — Measurement ID', tr.ga4, 'dir="ltr" placeholder="G-XXXXXXXXXX"')}${fld('sMeta', 'Meta (Facebook/Instagram) Pixel ID', tr.metaPixel, 'dir="ltr" placeholder="123456789012345"')}${fld('sTt', 'TikTok Pixel ID', tr.tiktokPixel, 'dir="ltr" placeholder="C1234567890ABCDEF"')}<p class="adm-hint">الأحداث المرسلة: عرض منتج، إضافة للسلة، بدء الطلب، إرسال الطلب، نقر واتساب/طلب مخصص.</p></section>`;
  const tools = `<section data-panel="tools" hidden><p class="adm-muted">نزّل نسخة من بيانات المتجر (المنتجات والإعدادات) كملف واحد. تحتفظ GitHub أيضاً بتاريخ كل تعديل.</p><button type="button" class="adm-btn-ghost" data-st-act="backup">⬇ تنزيل نسخة احتياطية</button></section>`;
  return tabs + contact + hero + ship + pages + track + tools + '<p class="adm-err" id="stErr" hidden></p>';
}
function openSettings() {
  const st = S.store;
  openSheet('settings', 'إعدادات الموقع', '', '<button class="btn-fire" type="button" data-st-act="save">حفظ الإعدادات</button><button class="adm-btn-ghost" type="button" data-close>إلغاء</button>');
  Object.assign(S.sheet, {
    hero: ((st.hero || {}).slides || []).map(s => ({ kind: 'existing', title: s.title, image: s.image })),
    pages: JSON.parse(JSON.stringify(st.pages || [])), faq: JSON.parse(JSON.stringify(st.faq || [])), pays: (st.payments || []).slice()
  });
  $('#sheetBody').innerHTML = settingsBodyHTML();
  $('#sheet .adm-sheet').classList.add('wide');
}
A.openSettings = openSettings;

/* pull what is typed in the repeating rows back into the working arrays (before re-rendering them) */
function syncLists() {
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  q('.adm-hero').forEach(r => { const s = S.sheet.hero[+r.dataset.i]; if (s) s.title = r.querySelector('[data-hero-title]').value; });
  q('#pageRows .adm-page').forEach(r => { const p = S.sheet.pages[+r.dataset.i]; if (p) { p.title = r.querySelector('[data-pg-title]').value; p.body = r.querySelector('[data-pg-body]').value; p.footer = r.querySelector('[data-pg-footer]').checked; } });
  q('#faqRows .adm-page').forEach(r => { const f = S.sheet.faq[+r.dataset.i]; if (f) { f.q = r.querySelector('[data-fq-q]').value; f.a = r.querySelector('[data-fq-a]').value; } });
  q('#payRows .adm-pay').forEach(r => { S.sheet.pays[+r.dataset.i] = r.querySelector('[data-pay]').value; });
}
async function addHeroFiles(files) {
  for (const f of [...files].slice(0, 6)) {
    try { const r = await A.processImage(f, { maxSide: 1640 }); syncLists(); S.sheet.hero.push({ kind: 'new', title: '', data: r.data, preview: r.preview, ext: r.ext || 'jpg' }); }
    catch (e) { toast(`تعذّرت قراءة الصورة "${f.name}".`, 'err'); }
  }
  if (S.sheet && $('#heroRows')) $('#heroRows').innerHTML = heroRowsHTML();
}
function settingsClick(e) {
  const t = e.target;
  if (t.closest('[data-close]')) return closeEditor();
  const tab = t.closest('[data-st-tab]');
  if (tab) { document.querySelectorAll('.adm-tab').forEach(b => b.classList.toggle('on', b === tab)); document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.stTab; }); return; }
  const b = t.closest('[data-st-act]'); if (!b) return;
  const act = b.dataset.stAct, row = b.closest('[data-i]'), i = row ? +row.dataset.i : -1, SH = S.sheet;
  syncLists();
  if (act === 'save') return saveSettings();
  if (act === 'backup') return downloadBackup();
  if (act === 'hero-add') return $('#fileInput').click();
  if (act === 'hero-del') { SH.hero.splice(i, 1); $('#heroRows').innerHTML = heroRowsHTML(); return; }
  if (act === 'hero-up' && i > 0) { [SH.hero[i - 1], SH.hero[i]] = [SH.hero[i], SH.hero[i - 1]]; $('#heroRows').innerHTML = heroRowsHTML(); return; }
  if (act === 'hero-down' && i < SH.hero.length - 1) { [SH.hero[i + 1], SH.hero[i]] = [SH.hero[i], SH.hero[i + 1]]; $('#heroRows').innerHTML = heroRowsHTML(); return; }
  if (act === 'pg-add') { SH.pages.push({ id: '', title: '', body: '', footer: true }); $('#pageRows').innerHTML = pagesRowsHTML(); return; }
  if (act === 'pg-del') { SH.pages.splice(i, 1); $('#pageRows').innerHTML = pagesRowsHTML(); return; }
  if (act === 'fq-add') { SH.faq.push({ q: '', a: '' }); $('#faqRows').innerHTML = faqRowsHTML(); return; }
  if (act === 'fq-del') { SH.faq.splice(i, 1); $('#faqRows').innerHTML = faqRowsHTML(); return; }
  if (act === 'pay-add') { SH.pays.push(''); $('#payRows').innerHTML = payRowsHTML(); return; }
  if (act === 'pay-del') { SH.pays.splice(i, 1); $('#payRows').innerHTML = payRowsHTML(); return; }
}
A.settingsClick = settingsClick;

function downloadBackup() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), store: S.store, products: S.products }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dragon-store-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function saveSettings() {
  syncLists();
  const st = S.store, SH = S.sheet, v = id => $('#' + id).value.trim(), errs = [];
  const wa = arDigits(v('sWa')).replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(wa)) errs.push('رقم واتساب: أرقام فقط مع رمز الدولة، مثال 9647701234567.');
  [['sFb', 'فيسبوك'], ['sIg', 'إنستغرام'], ['sTk', 'تيك توك'], ['sTg', 'تيليغرام'], ['sAnnLink', 'رابط الإعلان']].forEach(([id, n]) => { if (!validUrl(v(id))) errs.push(`رابط ${n} يجب أن يبدأ بـ https://`); });
  const sec = parseFloat(arDigits(v('sHeroSec')));
  if (!(sec >= 2 && sec <= 20)) errs.push('مدة البنر: رقم بين 2 و 20 ثانية.');
  if (!SH.hero.length) errs.push('أبقِ بنراً واحداً على الأقل.');
  const free = parseInt(arDigits(v('sFree')) || '0', 10);
  if (!(free >= 0)) errs.push('حد التوصيل المجاني: رقم صحيح.');
  const gov = [...document.querySelectorAll('[data-gov]')].map(i => ({ name: i.dataset.gov, raw: arDigits(i.value.trim()) }));
  gov.forEach(g => { if (g.raw !== '' && !/^\d+$/.test(g.raw)) errs.push(`أجرة ${g.name}: أرقام فقط.`); });
  const ga = v('sGa'), meta = v('sMeta'), tt = v('sTt');
  if (ga && !/^G-[A-Z0-9]{4,}$/i.test(ga)) errs.push('معرّف Google Analytics يبدأ بـ G-.');
  if (meta && !/^\d{6,20}$/.test(meta)) errs.push('معرّف بكسل ميتا أرقام فقط.');
  if (tt && !/^[A-Z0-9]{8,30}$/i.test(tt)) errs.push('معرّف بكسل تيك توك: أحرف وأرقام إنجليزية.');
  const pages = SH.pages.map(p => ({ ...p, title: p.title.trim(), body: p.body.trim() })).filter(p => p.title || p.body);
  pages.forEach((p, i) => { if (!p.title || !p.body) errs.push(`الصفحة ${i + 1}: العنوان والنص مطلوبان.`); });
  const faq = SH.faq.map(f => ({ q: f.q.trim(), a: f.a.trim() })).filter(f => f.q || f.a);
  faq.forEach((f, i) => { if (!f.q || !f.a) errs.push(`السؤال ${i + 1}: السؤال والجواب مطلوبان.`); });
  const box = $('#stErr');
  if (errs.length) { box.hidden = false; box.innerHTML = errs.map(esc).join('<br>'); box.scrollIntoView && box.scrollIntoView({ block: 'nearest' }); return; }

  const before = JSON.stringify(st);
  // contact / social / announcement / custom order
  st.contact = { ...st.contact, whatsapp: wa, phoneDisplay: v('sPhone') }; setOpt(st.contact, 'hours', v('sHours')); if (!('hours' in st.contact)) st.contact.hours = '';
  st.social = { ...st.social, facebook: v('sFb'), instagram: v('sIg'), tiktok: v('sTk'), telegram: v('sTg') };
  st.announcement = { enabled: $('#sAnnOn').checked, text: v('sAnnText'), link: v('sAnnLink') };
  st.customOrder = { enabled: $('#sCoOn').checked, label: v('sCoLabel') || 'اطلب تصميمك' };
  // shipping / payments
  st.shipping = { ...(st.shipping || {}), freeOver: free, governorates: (st.shipping.governorates || []).map(g => { const x = gov.find(q => q.name === g.name); return { name: g.name, fee: x && x.raw !== '' ? parseInt(x.raw, 10) : null }; }) };
  st.payments = SH.pays.map(p => p.trim()).filter(Boolean);
  // pages + faq (a page counts as reviewed once saved)
  const old = new Map((before ? (JSON.parse(before).pages || []) : []).map(p => [p.id, p]));
  const usedIds = new Set();
  st.pages = pages.map(p => {
    let id = p.id || slugify(p.title) || 'page'; const base = id; let k = 2; while (usedIds.has(id)) id = `${base}-${k++}`; usedIds.add(id);
    const o = old.get(p.id), changed = !o || o.title !== p.title || o.body !== p.body;
    const rec = { id, title: p.title, footer: p.footer !== false, draft: !changed && !!(o && o.draft), body: p.body };
    return rec;
  });
  st.faq = faq;
  st.analytics = { ga4: ga, metaPixel: meta, tiktokPixel: tt };
  // hero banners (new ones get a file name; removed ones are deleted from the repo)
  const prevImages = ((st.hero || {}).slides || []).map(s => s.image);
  const taken = new Set([...allPaths(), ...prevImages]);
  const slides = SH.hero.map(s => {
    if (s.kind === 'existing') return { title: s.title.trim(), image: s.image };
    const base = slugify(s.title) || 'banner'; let n = 1, path;
    do { path = `${HERO_DIR}hero-${String(n++).padStart(2, '0')}-${base}.${s.ext || 'jpg'}`; } while (taken.has(path) || S.pendingDeletes.has(path));
    taken.add(path); S.pendingFiles.set(path, s.data); S.previews.set(path, s.preview);
    return { title: s.title.trim(), image: path };
  });
  st.hero = { ...(st.hero || {}), intervalMs: Math.round(sec * 1000), slides };
  prevImages.filter(p => !slides.some(s => s.image === p)).forEach(dropImagePath);
  if (JSON.stringify(st) !== before) logOnce('⚙ تعديل إعدادات الموقع');
  closeEditor(); renderAll();
  toast('تم حفظ الإعدادات. اضغط «نشر التغييرات» لتظهر في الموقع.');
}
A.saveSettings = saveSettings;

/* ───────── events ───────── */
function bind() {
  $('#btnConnect').onclick = () => {
    S.cfg = { owner: $('#fOwner').value.trim(), repo: $('#fRepo').value.trim(), branch: $('#fBranch').value.trim(), token: $('#fToken').value.trim(), remember: $('#fRemember').checked };
    if (!S.cfg.owner || !S.cfg.repo || !S.cfg.token) { const b = $('#setupErr'); b.hidden = false; b.textContent = 'أدخل اسم الحساب والمستودع والتوكن.'; return; }
    connect();
  };
  $('#btnForget').onclick = () => { localStorage.removeItem(CFG_KEY); sessionStorage.removeItem(CFG_KEY); S.cfg.token = ''; $('#fToken').value = ''; toast('تم مسح التوكن من هذا الجهاز.'); };
  $('#btnSettings').onclick = () => {
    if (pendingCount() && !confirm('لديك تغييرات غير منشورة ستضيع إذا غيّرت الاتصال. متابعة؟')) return;
    openSetup('');
  };
  $('#btnAdd').onclick = () => openEditor(null);
  $('#btnSections').onclick = openSections;
  $('#btnPricing').onclick = openPricing;
  $('#btnSettings2').onclick = openSettings;
  $('#q').oninput = e => { S.q = e.target.value; renderGrid(); };
  $('#catFilter').onchange = e => { S.cat = e.target.value; renderGrid(); };
  $('#fileInput').onchange = e => { A.addFiles([...e.target.files]); e.target.value = ''; };

  document.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('#btnPublish')) return publish();
    if (t.closest('#btnDiscard')) return discard();
    const card = t.closest('.adm-card');
    if (card && t.closest('[data-act="edit"]')) return openEditor(card.dataset.id);
    if (card && t.closest('[data-act="delete"]')) return deleteProduct(card.dataset.id);
    if (card && t.closest('[data-act="dup"]')) return duplicateProduct(card.dataset.id);
    if (S.sheet) return sheetClick(e);
    if (!S.editor) return;
    if (t.closest('[data-close]')) return closeEditor();
    if (t.closest('#eSave')) return saveEditor();
    if (t.closest('#eDelete')) return deleteProduct(S.editor.id);
    if (t.closest('#eAddImg')) return $('#fileInput').click();
    if (t.closest('#useCalc')) { e.preventDefault(); const w = parseInt(S.editor.weight, 10); S.editor.price = String(calcPrice(w)); $('#ePrice').value = S.editor.price; S.editor.priceTouched = false; return refreshEditorState(); }
    const ib = t.closest('[data-img]');
    if (ib) {
      const i = +ib.closest('.adm-img').dataset.i, im = S.editor.images, a = ib.dataset.img;
      if (a === 'remove') im.splice(i, 1);
      else if (a === 'earlier' && i > 0) [im[i - 1], im[i]] = [im[i], im[i - 1]];
      else if (a === 'later' && i < im.length - 1) [im[i + 1], im[i]] = [im[i], im[i + 1]];
      renderEditorImages(); refreshEditorState();
    }
  });
  document.addEventListener('input', e => {
    const E = S.editor; if (!E) return;
    const id = e.target.id;
    if (id === 'eName') E.name = e.target.value;
    else if (id === 'eMat') E.material = e.target.value;
    else if (id === 'eDesc') E.desc = e.target.value;
    else if (id === 'eOld') E.old = e.target.value;
    else if (id === 'eDim') E.dim = e.target.value;
    else if (id === 'ePrint') E.print = e.target.value;
    else if (id === 'eWeight') {
      E.weight = e.target.value;
      const w = parseInt(E.weight, 10);
      if (!E.priceTouched && w > 0) { E.price = String(calcPrice(w)); $('#ePrice').value = E.price; }
      refreshEditorState();
    } else if (id === 'ePrice') { E.price = e.target.value; E.priceTouched = true; refreshEditorState(); }
  });
  document.addEventListener('change', e => {
    const E = S.editor; if (!E) return;
    if (e.target.id === 'eCat') E.categoryId = e.target.value;
    else if (e.target.id === 'eStock') E.stock = e.target.value;
    else if (e.target.id === 'eBadge') E.badge = e.target.value;
    else if (e.target.id === 'eHidden') E.hidden = e.target.checked;
  });
  document.addEventListener('input', e => { if (S.sheet && S.sheet.type === 'pricing' && e.target.closest('#sheet')) updatePricingPreview(); });
  document.addEventListener('change', e => { if (S.sheet && S.sheet.type === 'pricing' && e.target.id === 'pRound') updatePricingPreview(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (S.editor || S.sheet)) closeEditor(); });
  window.addEventListener('beforeunload', e => { if (pendingCount()) { e.preventDefault(); e.returnValue = ''; } });
}

function init() {
  bind();
  S.cfg = loadCfg();
  if (S.cfg.token && S.cfg.owner && S.cfg.repo) connect(); else openSetup('');
}
A.init = init;
if (!window.__ADMIN_NO_AUTOINIT__) init();
})();
