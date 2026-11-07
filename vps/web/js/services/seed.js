// بيانات تجريبية: مستخدمون، مقاطع مولّدة محلياً (CC0)، متاجر، منتجات، إيجارات
const DAY = 86400000, HOUR = 3600000;
const PRICES = { weekly: 3, monthly: 9, yearly: 90 }, DAYS = { weekly: 7, monthly: 30, yearly: 365 };

export async function buildSeed({ sha256, uid }) {
  const now = Date.now();
  const mk = async (id, username, name, bio, baseFollowers, role = 'user') => { const salt = 'seed-' + id; return { id, username, name, bio, avatar: null, role, baseFollowers, createdAt: now - 200 * DAY, salt, passHash: await sha256(salt + 'demo1234') }; };
  const users = [
    await mk('u_noura', 'noura.scents', 'نورة | عطور', 'عطور شرقية بلمسة كويتية. صاحبة متجر عطور الديرة.', 18400),
    await mk('u_fahad', 'fahad.coffee', 'فهد المحمصة', 'محمّص قهوة مختصة. نجرب كل يوم محصول جديد.', 9200),
    await mk('u_maryam', 'maryam.art', 'مريم ترسم', 'ألوان مائية ودروس رسم قصيرة.', 12800),
    await mk('u_yousef', 'yousef.games', 'يوسف | ألعاب', 'مطوّر ألعاب ألغاز صغيرة. جرّب متاهة اليوم!', 6100),
    await mk('u_sara', 'sara.travels', 'سارة ترحال', 'شروق، صحراء، وبحر. رحلات قصيرة كل أسبوع.', 22600),
    await mk('u_khaled', 'khaled.tips', 'خالد نصائح', 'نصائح تصوير ومونتاج بالجوال في أقل من دقيقة.', 15300),
    await mk('u_dana', 'dana.lights', 'دانة', 'أحب الألعاب النارية والليالي الحلوة.', 4700),
    await mk('u_omar', 'omar.style', 'عمر ستايل', 'أزياء رجالية يومية.', 3900),
    await mk('u_admin', 'admin', 'مشرف كليب كات', 'حساب المشرف التجريبي', 0, 'admin')
  ];
  const follows = [['u_sara', 'u_noura'], ['u_sara', 'u_khaled'], ['u_fahad', 'u_noura'], ['u_noura', 'u_sara'], ['u_maryam', 'u_sara'], ['u_yousef', 'u_khaled'], ['u_dana', 'u_sara'], ['u_khaled', 'u_maryam'], ['u_omar', 'u_fahad']].map(([a, b]) => ({ a, b }));

  // ----- المتاجر -----
  const store = (id, ownerId, name, category, description, contact, planId, startedDaysAgo, logoShape, extra = {}) => {
    const start = now - startedDaysAgo * DAY;
    return { id, ownerId, name, category, description, contact, logo: null, logoShape, banner: null, planId, featured: planId === 'yearly', verified: planId === 'yearly', createdAt: start - 60 * DAY, expiresAt: start + DAYS[planId] * DAY, ...extra };
  };
  const stores = [
    store('s_noura', 'u_noura', 'عطور الديرة', 'perfume', 'عطور ودهن عود ومخمرية مصنوعة يدوياً في الكويت.', 'https://wa.me/96500000001', 'yearly', 40, 'bottle'),
    store('s_fahad', 'u_fahad', 'محمصة الفنجان', 'coffee', 'حبوب قهوة مختصة محمّصة أسبوعياً، وأدوات تحضير.', 'https://wa.me/96500000002', 'monthly', 10, 'cup'),
    store('s_maryam', 'u_maryam', 'ألوان مريم', 'art', 'فرش وألوان مائية ودفاتر رسم مختارة.', 'https://wa.me/96500000003', 'weekly', 3, 'brush'),
    store('s_yousef', 'u_yousef', 'متاهة ستوديو', 'digital', 'ألعاب ألغاز ومتاهات قابلة للطباعة وتطبيقات.', 'https://wa.me/96500000004', 'yearly', 120, 'game'),
    store('s_omar', 'u_omar', 'ستايل عمر', 'fashion', 'قمصان وإكسسوارات رجالية.', 'https://wa.me/96500000005', 'monthly', 35, 'shirt')
  ];
  // ----- المنتجات -----
  let pc = 0;
  const prod = (storeId, name, price, stock, shape, description = '') => ({ id: 'p_' + (++pc), storeId, name, price, stock, image: `gen:${shape}:${storeId}${pc}`, description, createdAt: now - pc * HOUR });
  const products = [
    prod('s_noura', 'دهن عود كمبودي 3 مل', 18, 12, 'bottle', 'دهن عود فاخر بثبات عالٍ.'), prod('s_noura', 'مخمرية الورد', 7.5, 30, 'jar'), prod('s_noura', 'عطر الديرة 50 مل', 12, 0, 'bottle'), prod('s_noura', 'بخور معطّر', 4.25, 40, 'box'),
    prod('s_fahad', 'قهوة إثيوبية 250غ', 5.5, 25, 'bag', 'محمّصة فاتحة، نكهات توت وياسمين.'), prod('s_fahad', 'كولومبي 250غ', 4.75, 18, 'bag'), prod('s_fahad', 'كوب سيراميك', 3, 9, 'cup'),
    prod('s_maryam', 'طقم ألوان مائية 24', 8.5, 6, 'box'), prod('s_maryam', 'فرشاة سنجاب رقم 6', 2.75, 14, 'brush'),
    prod('s_yousef', 'كتاب متاهات للأطفال', 3.5, 50, 'box'), prod('s_yousef', 'لعبة متاهة (رقمية)', 1.5, 999, 'game'),
    prod('s_omar', 'قميص كتان', 9, 7, 'shirt')
  ];
  // ----- سجل الإيجارات (للإيرادات) -----
  const rentals = [];
  const rent = (storeId, ownerId, planId, daysAgo, method = 'knet') => { const at = now - daysAgo * DAY; rentals.push({ id: uid('r_'), storeId, ownerId, planId, amount: PRICES[planId], method, ref: 'DEMO-SEED' + rentals.length, paidAt: at, startAt: at, endAt: at + DAYS[planId] * DAY }); };
  rent('s_noura', 'u_noura', 'monthly', 160); rent('s_noura', 'u_noura', 'monthly', 130, 'card'); rent('s_noura', 'u_noura', 'monthly', 100); rent('s_noura', 'u_noura', 'monthly', 70, 'applepay'); rent('s_noura', 'u_noura', 'yearly', 40);
  rent('s_fahad', 'u_fahad', 'weekly', 75); rent('s_fahad', 'u_fahad', 'monthly', 68); rent('s_fahad', 'u_fahad', 'monthly', 40, 'card'); rent('s_fahad', 'u_fahad', 'monthly', 10);
  rent('s_maryam', 'u_maryam', 'weekly', 24, 'applepay'); rent('s_maryam', 'u_maryam', 'weekly', 17, 'applepay'); rent('s_maryam', 'u_maryam', 'weekly', 10); rent('s_maryam', 'u_maryam', 'weekly', 3);
  rent('s_yousef', 'u_yousef', 'yearly', 120, 'card');
  rent('s_omar', 'u_omar', 'monthly', 65); rent('s_omar', 'u_omar', 'monthly', 35);

  // ----- المقاطع -----
  const vid = (id, userId, clip, caption, hashtags, sound, productIds, hoursAgo, base) => ({ id, userId, src: `media/videos/${clip}.mp4`, poster: `media/posters/${clip}.jpg`, caption, hashtags, sound, productIds, createdAt: now - hoursAgo * HOUR, base });
  const videos = [
    vid('v_perfume', 'u_noura', 'perfume', 'تركيبة اليوم: عود + ورد طائفي. مين يحب العطور الثقيلة؟', ['عطور', 'عود', 'كويت'], 'صوت أصلي - noura.scents', ['p_1', 'p_2'], 2, { likes: 12400, comments: 312, shares: 540, saves: 2100, views: 210000 }),
    vid('v_sunrise', 'u_sara', 'sunrise', 'شروق اليوم على البحر… يستاهل الصحيان بدري', ['كويت', 'شروق', 'رحلات'], 'نسيم الصباح - sara.travels', [], 5, { likes: 30100, comments: 820, shares: 1900, saves: 5400, views: 540000 }),
    vid('v_coffee', 'u_fahad', 'coffee', 'V60 بخطوات بسيطة. الحبوب إثيوبية من محمصتنا', ['قهوة', 'مختصة', 'وصفات'], 'إيقاع الصباح - fahad.coffee', ['p_5', 'p_7'], 8, { likes: 8700, comments: 204, shares: 310, saves: 1500, views: 120000 }),
    vid('v_maze', 'u_yousef', 'maze', 'متاهة اليوم! كم ثانية احتجت للخروج؟ اكتب وقتك بالتعليقات', ['ألغاز', 'ألعاب', 'تحدي'], 'لحن المتاهة - yousef.games', ['p_11'], 12, { likes: 5400, comments: 960, shares: 220, saves: 700, views: 88000 }),
    vid('v_tips', 'u_khaled', 'tips', '3 نصائح لتصوير أفضل بالجوال — احفظ المقطع', ['نصائح', 'تصوير', 'مونتاج'], 'صوت أصلي - khaled.tips', [], 20, { likes: 19800, comments: 410, shares: 3300, saves: 9800, views: 330000 }),
    vid('v_palette', 'u_maryam', 'palette', 'تدرّج ألوان الغروب بالألوان المائية', ['فن', 'ألوان', 'رسم'], 'هدوء - maryam.art', ['p_8', 'p_9'], 28, { likes: 11200, comments: 150, shares: 260, saves: 3100, views: 160000 }),
    vid('v_fireworks', 'u_dana', 'fireworks', 'ألعاب نارية الليلة كانت خيال', ['احتفال', 'ليل', 'كويت'], 'ليلة فرح - dana.lights', [], 36, { likes: 7600, comments: 98, shares: 410, saves: 600, views: 99000 }),
    vid('v_dunes', 'u_sara', 'dunes', 'هدوء الصحراء وقت الغروب', ['صحراء', 'رحلات', 'غروب'], 'رمال - sara.travels', [], 50, { likes: 14500, comments: 230, shares: 700, saves: 2600, views: 190000 })
  ];
  const comments = [];
  const cm = (videoId, userId, text, hoursAgo) => comments.push({ id: uid('c_'), videoId, userId, text, createdAt: now - hoursAgo * HOUR });
  cm('v_perfume', 'u_sara', 'ريحته واصلة من الشاشة!', 1); cm('v_perfume', 'u_fahad', 'كم سعر الدهن؟', 1.5); cm('v_sunrise', 'u_noura', 'ما شاء الله، وين المكان؟', 3);
  cm('v_coffee', 'u_omar', 'أفضل وصفة جربتها', 6); cm('v_maze', 'u_dana', '27 ثانية!', 10); cm('v_maze', 'u_khaled', '19 ثانية، أتحداكم', 9); cm('v_tips', 'u_maryam', 'النصيحة الثانية غيرت تصويري', 15); cm('v_palette', 'u_sara', 'تحفة', 20);
  const notifications = [];
  return { users, follows, videos, likes: [], saves: [], comments, stores, products, rentals, notifications };
}
