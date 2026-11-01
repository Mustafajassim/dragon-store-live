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
const MIN_IMAGES = 3, MAX_IMAGES = 8;
const MAX_SIDE = 1000, JPEG_QUALITY = 0.85;

const S = A.state = {
  cfg: null, store: null, doc: null, baseText: '', products: [],
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
function calcPrice(w) {
  const p = S.store.pricing || { roundUpTo: 1000, tiers: [{ belowGrams: 100, perGram: 130 }], defaultPerGram: 100 };
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
    S.store = JSON.parse(storeText);
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
  $('#catFilter').innerHTML = '<option value="all">كل الأقسام</option>' + realCats().map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('#catFilter').value = S.cat;
}
function renderAll() { renderStats(); renderPending(); renderGrid(); }

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
        <span class="adm-num">#${p.productNumber}</span>${t ? `<span class="adm-tag ${t}">${t === 'new' ? 'جديد' : 'معدّل'}</span>` : ''}</div>
      <div class="adm-card-body"><div class="adm-card-name">${esc(p.name)}</div>
        <div class="adm-meta"><span>${esc(catById(p.categoryId)?.name || p.categoryId)}</span><span>${p.weightGrams}g</span><span>${p.images.length} صور</span></div>
        <div class="adm-price fire-txt">${fmtPrice(p.price)}</div>
        <div class="adm-card-act"><button type="button" data-act="edit">تعديل</button><button type="button" class="del" data-act="delete">حذف</button></div></div></article>`;
  }).join('') : '<div class="adm-empty">لا توجد منتجات مطابقة</div>';
}

/* ───────── image handling ───────── */
A.processImage = async function (file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const sc = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', JPEG_QUALITY);
  return { data: url.split(',')[1], preview: url };
};

A.addFiles = async function (files) {
  const E = S.editor; if (!E) return;
  const room = MAX_IMAGES - E.images.length;
  const picked = [...files].filter(f => !f.type || f.type.startsWith('image/')).slice(0, room);
  if (files.length > room) toast(`الحد الأقصى ${MAX_IMAGES} صور لكل منتج.`, 'err');
  for (const f of picked) {
    try { const r = await A.processImage(f); E.images.push({ kind: 'new', data: r.data, preview: r.preview }); }
    catch (e) { toast(`تعذّرت قراءة الصورة "${f.name}" — جرّب JPG أو PNG.`, 'err'); }
  }
  renderEditorImages(); refreshEditorState();
};

/* ───────── editor ───────── */
function openEditor(id) {
  const p = id ? S.products.find(x => x.id === id) : null;
  const cats = realCats();
  S.editor = {
    mode: p ? 'edit' : 'add', id: p?.id || null,
    name: p?.name || '', categoryId: p?.categoryId || (S.cat !== 'all' ? S.cat : cats[0].id),
    weight: p ? String(p.weightGrams) : '', price: p ? String(p.price) : '', priceTouched: !!p,
    material: p?.material || 'PLA Premium',
    images: (p?.images || []).map(path => ({ kind: 'existing', path })),
    original: p ? JSON.parse(JSON.stringify(p)) : null
  };
  const E = S.editor;
  $('#editorHost').innerHTML = `<div class="ovl adm-ovl" id="editor"><div class="adm-sheet" role="dialog" aria-modal="true" aria-label="${p ? 'تعديل منتج' : 'إضافة منتج'}">
    <div class="adm-sheet-hdr"><h2>${p ? 'تعديل منتج' + ` <span class="adm-muted"><bdi>#${p.productNumber}</bdi></span>` : 'إضافة منتج جديد'}</h2><button class="icon-btn" type="button" data-close aria-label="إغلاق">✕</button></div>
    <div class="adm-sheet-body">
      <div><label class="field-lbl" for="eName">اسم المنتج</label><input class="field-input" id="eName" value="${esc(E.name)}" autocomplete="off" maxlength="90" placeholder="مثال: Kratos Ghost of Sparta"></div>
      <div><label class="field-lbl" for="eCat">القسم</label><select class="field-input" id="eCat">${cats.map(c => `<option value="${esc(c.id)}" ${c.id === E.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="adm-two">
        <div><label class="field-lbl" for="eWeight">الوزن (غرام)</label><input class="field-input" id="eWeight" inputmode="numeric" value="${esc(E.weight)}" placeholder="مثال: 120"></div>
        <div><label class="field-lbl" for="ePrice">السعر (دينار عراقي)</label><input class="field-input" id="ePrice" inputmode="numeric" value="${esc(E.price)}" placeholder="يُحسب تلقائياً"></div>
      </div>
      <div class="adm-hint" id="priceHint"></div>
      <div><label class="field-lbl" for="eMat">الخامة</label><input class="field-input" id="eMat" value="${esc(E.material)}" autocomplete="off"></div>
      <div><label class="field-lbl">الصور — <span class="adm-count" id="imgCount"></span> <span class="adm-muted">(الأولى هي الصورة الرئيسية في البطاقة)</span></label>
        <div class="adm-imgs" id="eImgs"></div>
        <div class="adm-hint">تُصغَّر الصور تلقائياً إلى ${MAX_SIDE}px وتُحفظ JPG حتى يبقى الموقع سريعاً.</div></div>
      <p class="adm-err" id="eErr" hidden></p>
    </div>
    <div class="adm-sheet-ftr"><button class="btn-fire" type="button" id="eSave">${p ? 'حفظ التعديلات' : 'إضافة المنتج'}</button>
      ${p ? '<button class="adm-btn-ghost adm-btn-danger" type="button" id="eDelete">حذف</button>' : ''}<button class="adm-btn-ghost" type="button" data-close>إلغاء</button></div>
  </div></div>`;
  renderEditorImages(); refreshEditorState();
  $('#eName').focus();
}
A.openEditor = openEditor;
function closeEditor() { $('#editorHost').innerHTML = ''; S.editor = null; }

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
  const dup = S.products.find(p => p.id !== E.id && isManaged(p) && p.name.trim().toLowerCase() === E.name.trim().toLowerCase());
  if (dup) errs.push(`يوجد منتج بنفس الاسم (#${dup.productNumber}).`);
  return errs;
}

/* choose a free file name:  assets/images/products/<cat-slug>/<cat-slug>-<product-slug>-NN.jpg */
function freePath(catSlug, slug, taken) {
  for (let n = 1; n < 100; n++) {
    const path = `${PRODUCT_DIR}${catSlug}/${catSlug}-${slug}-${String(n).padStart(2, '0')}.jpg`;
    if (!taken.has(path) && !S.pendingDeletes.has(path)) return path;
  }
  throw new Error('no free image name');
}
const allPaths = () => new Set([...S.products.flatMap(p => p.images), ...S.pendingFiles.keys()]);

function dropImagePath(path) {
  if (!path.startsWith(PRODUCT_DIR)) return;                       // never delete shared placeholders/hero/brand
  if (S.products.some(p => p.images.includes(path))) return;       // still used by another product
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
  // resolve image list in the chosen order (new images get fresh file names)
  const taken = allPaths();
  const finalPaths = [];
  for (const im of E.images) {
    if (im.kind === 'existing') { finalPaths.push(im.path); continue; }
    const path = freePath(cat.slug, rec.slug, taken); taken.add(path);
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
    // 1) make sure nobody changed products.json since we loaded it
    const remoteText = await gh(`/contents/data/products.json?ref=${br}`, { raw: true });
    if (remoteText !== S.baseText) throw new Error('تم تعديل المنتجات في المستودع من مكان آخر بعد تحميل اللوحة. اضغط «تجاهل الكل» ثم أعد التحميل وكرّر التعديل حتى لا تُكتب فوق تعديلات الآخرين.');
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
    const fallback = '/* AUTO-GENERATED by the dashboard / tools/build_data.py — do not edit. Used only for file:// previews. */\nwindow.__DRAGON_DATA__=' + JSON.stringify({ store: S.store, products: doc }) + ';\n';
    tree.push({ path: 'data/products.json', mode: '100644', type: 'blob', content: text });
    tree.push({ path: 'data/data.fallback.js', mode: '100644', type: 'blob', content: fallback });
    S.pendingDeletes.forEach(path => tree.push({ path, mode: '100644', type: 'blob', sha: null }));

    // 4) tree → commit → move branch
    const nt = await gh('/git/trees', { method: 'POST', body: { base_tree: commit.tree.sha, tree } });
    const msg = `Dashboard: ${S.log.length} change${S.log.length > 1 ? 's' : ''}\n\n` + S.log.join('\n');
    const nc = await gh('/git/commits', { method: 'POST', body: { message: msg, tree: nt.sha, parents: [head] } });
    await gh(`/git/refs/heads/${br}`, { method: 'PATCH', body: { sha: nc.sha } });

    S.baseText = text; S.doc = doc;
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
    else if (id === 'eWeight') {
      E.weight = e.target.value;
      const w = parseInt(E.weight, 10);
      if (!E.priceTouched && w > 0) { E.price = String(calcPrice(w)); $('#ePrice').value = E.price; }
      refreshEditorState();
    } else if (id === 'ePrice') { E.price = e.target.value; E.priceTouched = true; refreshEditorState(); }
  });
  document.addEventListener('change', e => { if (S.editor && e.target.id === 'eCat') S.editor.categoryId = e.target.value; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.editor) closeEditor(); });
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
