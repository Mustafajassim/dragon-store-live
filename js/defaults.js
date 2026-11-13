/* DEFAULTS for settings added after the first release.
   If data/store.json does not contain a key yet, these values are used — so updating the code never overwrites
   (or requires editing) your own store.json. The dashboard writes the full settings the first time you publish. */
const STORE_DEFAULTS = {
  "announcement": {
    "enabled": false,
    "text": "",
    "link": ""
  },
  "customOrder": {
    "enabled": true,
    "label": "اطلب تصميمك"
  },
  "analytics": {
    "ga4": "",
    "metaPixel": "",
    "tiktokPixel": ""
  },
  "pages": [
    {
      "id": "shipping",
      "title": "الشحن والتوصيل",
      "footer": true,
      "draft": true,
      "body": "نوصّل طلباتك إلى مختلف المحافظات العراقية.\n\n- أجرة التوصيل تظهر عند إتمام الطلب بحسب محافظتك.\n- يؤكد فريقنا الأجرة ومدة التوصيل معك عبر واتساب قبل الشحن.\n- مدة تجهيز الطلب تختلف حسب القطعة، فبعض القطع تُطبع بعد الطلب."
    },
    {
      "id": "payment",
      "title": "طرق الدفع",
      "footer": true,
      "draft": true,
      "body": "يؤكد فريقنا طريقة الدفع المناسبة معك عبر واتساب عند تأكيد الطلب.\n\n- لا يتم أي دفع إلكتروني داخل الموقع.\n- لا نطلب أي بيانات بنكية عبر الموقع."
    },
    {
      "id": "returns",
      "title": "الاسترجاع والضمان",
      "footer": true,
      "draft": true,
      "body": "نفحص كل قطعة قبل تسليمها. إذا وصلتك قطعة بها عيب تصنيع أو تلف أثناء النقل، تواصل معنا عبر واتساب مع صورة المشكلة وسنعالجها معك.\n\nالطلبات المخصصة تُصنع حسب طلبك، لذلك يتم الاتفاق على شروط تعديلها أو إلغائها قبل بدء الطباعة."
    },
    {
      "id": "about",
      "title": "من نحن",
      "footer": true,
      "draft": false,
      "body": "دقة متناهية. إبداع بلا حدود.\n\nنوفر لكم خدمات طباعة ثلاثية الأبعاد احترافية بخامات بريميوم متينة، شحن سريع وآمن لكافة المحافظات، مع دعم فني متكامل لمشاريعكم المخصصة وابتكاراتكم الذكية."
    },
    {
      "id": "privacy",
      "title": "سياسة الخصوصية",
      "footer": true,
      "draft": true,
      "body": "نحترم خصوصيتك.\n\n- لا يحفظ الموقع بياناتك على خادم؛ تُحفظ السلة في متصفحك فقط.\n- عند إرسال طلب يُفتح واتساب برسالة تحتوي على اسمك ورقم هاتفك وعنوانك، وتصلنا مباشرة.\n- نستخدم هذه البيانات لتجهيز طلبك والتواصل معك فقط، ولا نشاركها مع أطراف أخرى.\n- قد يستخدم الموقع أدوات إحصاء (مثل Google Analytics أو بكسل ميتا) لقياس الزيارات وتحسين الإعلانات إذا فعّلها صاحب المتجر."
    }
  ],
  "faq": [
    {
      "q": "كيف أطلب؟",
      "a": "أضف المنتجات إلى السلة، ثم اكتب بياناتك واضغط «إرسال الطلب عبر واتساب». سيصلنا الطلب ونؤكده معك في المحادثة."
    },
    {
      "q": "هل يمكن طلب تصميم خاص؟",
      "a": "نعم. اضغط «اطلب تصميمك» وصِف فكرتك، وسنرد عليك بعرض سعر ومدة التنفيذ."
    },
    {
      "q": "ما الخامة المستخدمة؟",
      "a": "معظم منتجاتنا تُطبع بخامة PLA Premium، وتجد الخامة مكتوبة في تفاصيل كل منتج."
    },
    {
      "q": "كيف أتابع طلبي؟",
      "a": "تواصل معنا عبر واتساب برقم الطلب الذي يظهر بعد إرسال الطلب."
    }
  ],
  "payments": [],
  "shipping": {
    "freeOver": 0,
    "governorates": [
      {
        "name": "بغداد",
        "fee": null
      },
      {
        "name": "البصرة",
        "fee": null
      },
      {
        "name": "نينوى",
        "fee": null
      },
      {
        "name": "أربيل",
        "fee": null
      },
      {
        "name": "السليمانية",
        "fee": null
      },
      {
        "name": "دهوك",
        "fee": null
      },
      {
        "name": "كركوك",
        "fee": null
      },
      {
        "name": "الأنبار",
        "fee": null
      },
      {
        "name": "صلاح الدين",
        "fee": null
      },
      {
        "name": "ديالى",
        "fee": null
      },
      {
        "name": "بابل",
        "fee": null
      },
      {
        "name": "كربلاء",
        "fee": null
      },
      {
        "name": "النجف",
        "fee": null
      },
      {
        "name": "القادسية",
        "fee": null
      },
      {
        "name": "واسط",
        "fee": null
      },
      {
        "name": "ذي قار",
        "fee": null
      },
      {
        "name": "ميسان",
        "fee": null
      },
      {
        "name": "المثنى",
        "fee": null
      }
    ]
  },
  "labels": {
    "allProducts": "كل المنتجات"
  },
  "pricing": {
    "currency": "د.ع",
    "roundUpTo": 1000,
    "tiers": [
      {
        "belowGrams": 100,
        "perGram": 130
      }
    ],
    "defaultPerGram": 100
  }
};

function withStoreDefaults(store) {
  const s = JSON.parse(JSON.stringify(store)), D = STORE_DEFAULTS, clone = x => JSON.parse(JSON.stringify(x));
  s.contact = { hours: '', ...(s.contact || {}) };
  s.social = { tiktok: '', telegram: '', ...(s.social || {}) };
  s.labels = { ...clone(D.labels), ...(s.labels || {}) };
  if (!s.pricing && D.pricing) s.pricing = clone(D.pricing);
  ['announcement', 'customOrder', 'analytics', 'pages', 'faq', 'payments'].forEach(k => { if (s[k] === undefined) s[k] = clone(D[k]); });
  s.shipping = { ...(s.shipping || {}) };
  if (s.shipping.freeOver === undefined) s.shipping.freeOver = 0;
  if (!Array.isArray(s.shipping.governorates)) s.shipping.governorates = clone(D.shipping.governorates);
  return s;
}
