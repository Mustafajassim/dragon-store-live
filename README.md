# Dragon Store — decoupled build

The legacy 24 MB single-file `index.html` (images embedded as base64, data hard-coded in JS)
is now a normal project: **assets / data / css / js**. CSS, markup and render code are unchanged.

```
dragon-store/
├─ index.html                 shell: <head>, boot loader, SVG gradients, script tags
├─ css/styles.css             the original <style> block, byte-for-byte
├─ js/
│  ├─ icons.js                icon library (verbatim)
│  ├─ data.js                 fetchData(), buildCatalog(), assetUrl()
│  ├─ components.js           ProductCard (verbatim) + renderProducts(), renderProductRow()
│  ├─ app.js                  App component (same render tree, now fed by props)
│  ├─ main.js                 bootstrap: fetchData() → renderApp(); error + retry UI
│  └─ scroll-drag.js          drag-scroll / wheel handling (verbatim)
├─ data/
│  ├─ store.json              brand, contact, hero slides, categories, nav pills, shared-section rules
│  ├─ products.json           all 144 product records (+ image paths)   ← edit this to change the catalogue
│  ├─ products.schema.json    JSON Schema for products.json (editor autocomplete / validation)
│  ├─ image-map.json          every image → file, size, hash, legacy variable, DOM location, sections it appears in
│  └─ data.fallback.js        generated copy of the JSON, only used when opened from disk (file://)
├─ admin/                     DASHBOARD  (index.html · admin.css · admin.js) → yoursite/admin/
├─ tools/build_data.py        validates the JSON + regenerates data.fallback.js
└─ assets/images/
   ├─ brand/dragon-logo.png
   ├─ hero/hero-01-store.jpg … hero-05-figurines.jpg
   ├─ placeholders/iot-coming-soon.jpg, product-fallback-01..03.jpg
   └─ products/{gaming,gifts,artistic,tools}/<category>-<product-slug>-<NN>.jpg   (402 files)
```

## Running it
* **Hosting:** upload the folder as-is to any static host.
* **Local preview:** `python -m http.server` in this folder, or just double-click `index.html`
  (browsers block `fetch()` on `file://`, so the bundled `data.fallback.js` is used automatically).
* After editing `data/*.json` run `python tools/build_data.py` — it checks ids, prices, image paths and
  refreshes the file:// fallback.

## Dashboard (`/admin/`)
Add / edit / delete products from the browser — it reads and writes the same `data/products.json` and
`assets/images/products/**` the storefront uses, so the two always stay in sync.

* **Connect once:** repo owner + name + a GitHub *fine-grained token* (only this repo, **Contents: Read and write**).
  The token stays in your browser and is only sent to `api.github.com`. The page is public but useless without it.
* **Add product:** name, category (from `store.json`), weight, price (auto-suggested from the weight, editable),
  material, and **3–8 images** (first = card thumbnail; reorder/remove). Images are resized to 1000 px JPEG.
  The dashboard creates `id`, `productNumber`, `slug` and file names following the convention below.
* **Edit / delete:** change any field, swap/reorder/remove images, or delete a product (its images are deleted too).
  Existing ids never change, so share links and saved carts keep working.
* **Nothing goes live until you press «نشر التغييرات»:** all staged changes become ONE commit
  (`products.json`, `data.fallback.js`, new and removed images). GitHub Pages then rebuilds (~1 min).
  If someone changed `products.json` after you opened the dashboard, publishing is refused instead of overwriting it.
* Managed: the four real categories. Trending / Best sellers / Discounts are derived automatically
  (e.g. any product ≥ 100 g appears in Discounts); IoT stays "coming soon".

## Naming convention
`assets/images/products/<category-slug>/<category-slug>-<product-slug>-<NN>.jpg`
e.g. `gaming/gaming-arthur-morgan-01.jpg`. `NN` is the image's position in the product gallery
(01 = card/cart/search thumbnail). Product slug = lower-cased ASCII name, unique within its category.

## products.json record
```json
{ "id": "camping-0", "productNumber": 1, "categoryId": "camping", "slug": "arthur-morgan",
  "name": "Arthur Morgan", "weightGrams": 10, "price": 2000, "material": "PLA Premium",
  "images": ["assets/images/products/gaming/gaming-arthur-morgan-01.jpg", "…-02.jpg", "…-03.jpg"] }
```
The price rule used for the existing items lives in `store.json → pricing` (the dashboard uses it to suggest a price):
`ceil(weightGrams × (130 if < 100 g else 100) / 1000) × 1000` IQD. `price` in `products.json` is what the site actually uses.

**Add a product:** drop 1–3 images in the category folder, append a record (next `productNumber`), run `build_data.py`.
**Coming-soon item:** `"comingSoon": true, "price": null`.
**Shared sections** (Trending / Best sellers / Discounts) are not stored — they are derived at load time from
the rules in `store.json → collections`, exactly like the legacy code (Trending is a random pick on every load).

## Things worth knowing
* Category id `camping` is the legacy id of the section displayed as **"Gamming"**. It is kept because it is part of
  existing share links (`#product=camping-3`), saved carts and DOM ids; its folder/file slug is `gaming`.
  The visible label "Gamming" was also left as-is.
* 33 gallery slots are byte-identical to another slot (the same photo used 2–3× for a product). They were kept as
  separate files so each slot can later be replaced independently; `image-map.json → identicalTo` lists them.
* Images are the original bytes (no re-compression), so nothing changed visually.
