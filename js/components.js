/* PRODUCT RENDERING — ProductCard is moved verbatim from the legacy file.
   renderProducts()/renderProductRow() are the extracted grid & carousel builders
   (identical DOM to the legacy inline JSX). */
function ProductCard({product,onImageClick,onAddToCart,formatPrice,index=0}){const handleAdd=useCallback(e=>{e.stopPropagation();onAddToCart(product,1);},[product,onAddToCart]);const hasDiscount=!!product.discountPercent;if(product.comingSoon){return/*#__PURE__*/React.createElement("div",{className:"pcard pcard-soon",style:{animationDelay:`${index*45}ms`}},/*#__PURE__*/React.createElement("div",{className:"pcard-img"},/*#__PURE__*/React.createElement("img",{src:product.images[0],alt:product.name,loading:"lazy",decoding:"async",...IMG_FADE}),/*#__PURE__*/React.createElement("div",{className:"pcard-overlay"}),/*#__PURE__*/React.createElement("span",{className:"pcard-soon-badge"},product.priceLabel||"\u0642\u0631\u064A\u0628\u0627\u064B")),/*#__PURE__*/React.createElement("div",{className:"pcard-body"},/*#__PURE__*/React.createElement("h4",{className:"pcard-name"},product.name)));}return/*#__PURE__*/React.createElement("div",{className:"pcard",style:{animationDelay:`${index*45}ms`},onClick:()=>onImageClick(product)},/*#__PURE__*/React.createElement("div",{className:"pcard-img"},/*#__PURE__*/React.createElement("img",{src:product.images[0],alt:product.name,loading:"lazy",decoding:"async",...IMG_FADE}),/*#__PURE__*/React.createElement("div",{className:"pcard-overlay"}),hasDiscount&&/*#__PURE__*/React.createElement("span",{className:"pcard-discount-badge"},"\u062E\u0635\u0645 ",product.discountPercent,"%"),!hasDiscount&&product.badge&&/*#__PURE__*/React.createElement("span",{className:"pcard-discount-badge"},{new:"جديد",hot:"الأكثر طلباً"}[product.badge]),product.stock==="out"&&/*#__PURE__*/React.createElement("span",{className:"pcard-discount-badge pcard-out"},"نفد")),/*#__PURE__*/React.createElement("div",{className:"pcard-body"},/*#__PURE__*/React.createElement("h4",{className:"pcard-name"},product.name),/*#__PURE__*/React.createElement("div",{className:"pcard-row"},/*#__PURE__*/React.createElement("div",{className:"pcard-price-wrap"},hasDiscount&&/*#__PURE__*/React.createElement("p",{className:"pcard-price-old"},formatPrice(product.originalPrice)),/*#__PURE__*/React.createElement("p",{className:"pcard-price"},formatPrice(product.price))),/*#__PURE__*/React.createElement("button",{onClick:handleAdd,disabled:product.stock==="out",className:"pcard-add","aria-label":"\u0623\u0636\u0641 \u0644\u0644\u0633\u0644\u0629"},/*#__PURE__*/React.createElement(IconCartAdd,{c:"w-4 h-4"})))));}
function renderProducts(products,handlers){return/*#__PURE__*/React.createElement("div",{className:"prod-grid"},(products||[]).map((p,i)=>/*#__PURE__*/React.createElement(ProductCard,{key:p.id,product:p,...handlers,index:i})));}
function renderProductRow(cat,products,handlers){return/*#__PURE__*/React.createElement("div",{className:"prod-row-wrap"},/*#__PURE__*/React.createElement("button",{className:"row-arrow row-arrow-r","aria-label":"السابق",onClick:()=>{const el=document.getElementById('prow-'+cat.id);if(el)el.scrollBy({left:el.clientWidth*0.82});}},/*#__PURE__*/React.createElement(IconChevR,{c:"w-4 h-4"})),/*#__PURE__*/React.createElement("div",{className:"prod-row hide-sb",id:'prow-'+cat.id},(products||[]).map((p,i)=>/*#__PURE__*/React.createElement("div",{key:p.id,className:"prod-row-item"},/*#__PURE__*/React.createElement(ProductCard,{product:p,...handlers,index:i})))),/*#__PURE__*/React.createElement("button",{className:"row-arrow row-arrow-l","aria-label":"التالي",onClick:()=>{const el=document.getElementById('prow-'+cat.id);if(el)el.scrollBy({left:-el.clientWidth*0.82});}},/*#__PURE__*/React.createElement(IconChevL,{c:"w-4 h-4"})));}

/* images fade in when loaded (removes the "pop-in" of separate image files) */
const IMG_FADE={
  ref:el=>{if(el&&el.complete)el.classList.add('is-loaded');},
  onLoad:e=>e.currentTarget.classList.add('is-loaded'),
  onError:e=>e.currentTarget.classList.add('is-loaded')
};

/* back-to-top button (hidden while a modal / cart is open) */
function FloatingActions({hidden}){
  const[showTop,setShowTop]=useState(false);
  useEffect(()=>{
    let on=false;
    const h=()=>{const v=window.scrollY>700;if(v!==on){on=v;setShowTop(v);}};
    h();window.addEventListener('scroll',h,{passive:true});
    return()=>window.removeEventListener('scroll',h);
  },[]);
  if(hidden)return null;
  return/*#__PURE__*/React.createElement("div",{className:"fab-stack"},
    /*#__PURE__*/React.createElement("button",{type:"button",className:`fab fab-top${showTop?' show':''}`,"aria-label":"العودة للأعلى",onClick:()=>window.scrollTo({top:0,behavior:'smooth'})},
      /*#__PURE__*/React.createElement("svg",{viewBox:"0 0 24 24",width:20,height:20,fill:"none",stroke:"currentColor",strokeWidth:2.4,strokeLinecap:"round",strokeLinejoin:"round"},/*#__PURE__*/React.createElement("polyline",{points:"18 15 12 9 6 15"}))));
}
