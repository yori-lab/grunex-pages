/*
  grunex テーマの画面づくり。BASE のテンプレート(HTML編集App)は商品データを隠しリストとして
  ページに書き出すだけで、並べ替え・布ごとのまとめ・セミオーダーの組み立てはここでやる。
  正本は playground/grunex-theme。BASE のテンプレートとは
    #gx-items li.gx-i[data-id,data-title,data-price,data-stock,data-img,data-url]   … 1ページ目の商品
    window.GX = { more, params, max }                                              … 2ページ目以降の読み込み先
    #gx-home / #gx-list / #gx-item                                                 … 描画先
  の約束だけでつながっている。
*/
(function () {
  "use strict";

  const PAGES = "https://yori-lab.github.io/grunex-pages/";
  // PAY ID アプリの grunex のページ(管理画面「PAY ID アプリ > 設定」の値)。スマホではアプリが開き、
  // 入っていなければストアへ。PC で踏むと Web ショップに戻るだけなので、PC では案内文にする。
  const PAYID_SHOP = "https://thebase.com/to_app?s=shop&shop_id=grunex-base-shop&follow=true";
  const IS_PHONE = matchMedia("(pointer: coarse)").matches;
  // 下部の色。コードと名前はセミオーダー商品の説明文のとおり。色味は写真から当てた仮の値。
  const BOTTOM = {
    GRY: ["グレー", "#9d9b96"], GLD: ["ゴールド", "#ab9f83"], BLK: ["ブラック", "#26231f"],
    NVY: ["ネイビー", "#232e5e"], BLU: ["ブルー", "#2f62a8"], YEL: ["イエロー", "#e3c240"],
    MTD: ["マスタード", "#c4952f"], WHT: ["ホワイト", "#f3f1ec"], RED: ["レッド", "#b3262f"],
    BRN: ["ブラウン", "#6b4a33"], PNK: ["ピンク", "#b4478f"], PBL: ["ピーコックブルー", "#0f6f7a"],
    OLG: ["オリーブグリーン", "#6d7140"], STB: ["ストロベリー", "#d8476b"], RPP: ["ロイヤルパープル", "#5b2b86"],
  };
  const SIZES = [["Ｓ", "底面23.5cm"], ["Ｍ", "底面25.0cm"], ["Ｌ", "底面26.5cm"], ["ＬＬ", "底面29.0cm"]];
  const HOME = window.GX_HOME || location.origin + "/";   // テンプレートの {IndexPageURL}

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const dot = code => `<span class="dot" style="background:${BOTTOM[code]?.[1] || "#ccc"}" title="${BOTTOM[code]?.[0] || code}"></span>`;
  const $ = id => document.getElementById(id);

  // 商品名を読む。例: ウォームアップブーツ Ｌサイズ｜ホワイト/ストロベリー【C-04/STB】
  function parse(d) {
    const t = d.title;
    const m = t.match(/【([A-Z]+)-(\d+)\/?([A-Z]+)】/);
    const kind = t.includes("ウォームアップブーツ") ? "boots"
      : t.includes("セミオーダーリクエスト") ? "semi" : "goods";
    const colors = (t.split("｜")[1] || "").split("【")[0].split("/");
    return {
      id: d.id, title: t, price: d.price, stock: Number(d.stock) || 0, kind, img: d.img, url: d.url,
      pattern: m?.[1], fabric: m ? `${m[1]}-${m[2]}` : null, bottom: m?.[3],
      base: colors[0]?.trim(),
      noSemi: t.includes("セミオーダー不可"),
      shortName: t.replace(/^ウォームアップブーツ\s*/, "").replace(/※セミオーダー不可/, ""),
    };
  }
  const fromLi = li => parse({ ...li.dataset });

  // 柄の並びは A〜Z の次が AA, AB…(表計算の列名と同じ)。文字数が少ない方を先にしてから比べる。
  function byCode(a, b) {
    const [pa, na] = a.split("-"), [pb, nb] = b.split("-");
    return pa.length - pb.length || pa.localeCompare(pb) || Number(na) - Number(nb);
  }

  // BASE の一覧は1ページ24件。2ページ目以降は LoadItemsPage(テンプレート側で li だけ返す)を順に読む。
  async function loadAllItems() {
    const first = [...document.querySelectorAll("#gx-items li.gx-i")].map(fromLi);
    const gx = window.GX || {};
    const max = parseInt(gx.max, 10) || 1;
    const pages = [];
    for (let n = 2; n <= max; n++) pages.push(n);
    const rest = await Promise.all(pages.map(n =>
      fetch(gx.more + n + (gx.params || ""), { credentials: "same-origin" })
        .then(r => r.ok ? r.text() : "")
        .then(html => [...new DOMParser().parseFromString(`<ul>${html}</ul>`, "text/html").querySelectorAll("li.gx-i")].map(fromLi))
        .catch(() => [])));
    const seen = new Set();
    return first.concat(...rest).filter(i => !seen.has(i.id) && seen.add(i.id));
  }

  let ITEMS = [], FABRICS = new Map(), SEMI = {};

  function buildFabrics() {
    for (const it of ITEMS.filter(i => i.kind === "boots" && i.fabric)) {
      if (!FABRICS.has(it.fabric)) FABRICS.set(it.fabric, { code: it.fabric, pattern: it.pattern, base: it.base, items: [], noSemi: false });
      const f = FABRICS.get(it.fabric);
      f.items.push(it);
      if (it.noSemi) f.noSemi = true;
    }
    for (const f of FABRICS.values()) {
      f.bottoms = [...new Set(f.items.map(i => i.bottom))];
      f.inStock = f.items.some(i => i.stock > 0);
      f.cover = (f.items.find(i => i.stock > 0) || f.items[0]).img;   // 表紙は在庫ありを優先
    }
    const semi = ITEMS.filter(i => i.kind === "semi");
    SEMI = {
      usual: semi.find(i => i.title.includes("通常留め具")),
      original: semi.find(i => i.title.includes("オリジナル留め具")),
    };
  }

  function cardItem(i) {
    const badge = i.kind === "semi" ? ""
      : i.stock > 0 ? `<span class="badge ok">在庫あり</span>`
      : i.noSemi ? `<span class="badge gone">布終了</span>`
      : `<span class="badge semi">セミオーダー可</span>`;
    const href = i.kind === "boots" && i.stock === 0 && i.fabric ? `#/fabric/${i.fabric}?b=${i.bottom}` : i.url;
    return `<a class="card" href="${href}">
      <div class="ph" style="background-image:url('${i.img}')">${badge}</div>
      <div class="body">
        <div class="name">${esc(i.shortName)}</div>
        <div class="price">${esc(i.price)}</div>
      </div></a>`;
  }

  /* ---------- トップ ---------- */
  const state = { bottom: null };

  function renderTop() {
    const inStock = ITEMS.filter(i => i.kind === "boots" && i.stock > 0);
    const goods = ITEMS.filter(i => i.kind === "goods");
    $("gx-home").innerHTML = `
    <div class="wrap">
      <section class="hero">
        <h1>一枚の布から、あなたの一足を。</h1>
        <p>grunex のウォームアップブーツは、ひとつずつ手で縫う一点もの。売り切れた柄も、同じ布が残っていればセミオーダーで作れます。布と下部の色を選んで、あなただけの組み合わせを。</p>
        <div class="paths">
          <a class="btn primary" href="#fabrics">布から選んでつくる</a>
          <a class="btn" href="#instock">いますぐ買えるブーツ（${inStock.length}足）</a>
        </div>
      </section>
      <div id="couponBanner"></div>
      <section class="block" id="instock">
        <h2>いま買えるブーツ</h2>
        <p class="lead">完成品・在庫ありの一点もの。届くまでがいちばん早いです。</p>
        <div class="grid">${inStock.map(cardItem).join("")}</div>
      </section>
      <section class="block" id="fabrics">
        <h2>布から選ぶ（セミオーダー）</h2>
        <p class="lead">これまでに作ったブーツの布です。写真の組み合わせのほか、下部の色を15色から選び直せます。サイズ違いも承ります。</p>
        <div class="filters" id="bottomFilter"></div>
        <div class="grid" id="fabricGrid"></div>
      </section>
      <section class="block" id="goods">
        <h2>小物</h2>
        <p class="lead">ブーツと同じ布でつくるタンバリンケースやポーチ。</p>
        <div class="grid">${goods.map(cardItem).join("")}</div>
      </section>
    </div>`;
    renderFabricGrid();
    renderCouponBanner();
    const anchor = location.hash.replace(/^#\/?#?/, "");
    if (anchor && !anchor.startsWith("fabric/")) document.getElementById(anchor)?.scrollIntoView();
  }

  function renderFabricGrid() {
    const fabrics = [...FABRICS.values()];
    const counts = {};
    fabrics.filter(f => !f.noSemi).forEach(f => f.bottoms.forEach(b => counts[b] = (counts[b] || 0) + 1));
    const codes = Object.keys(BOTTOM).filter(c => counts[c]);
    $("bottomFilter").innerHTML =
      `<button class="chip plain" data-b="" aria-pressed="${!state.bottom}">すべて</button>` +
      codes.map(c => `<button class="chip" data-b="${c}" aria-pressed="${state.bottom === c}">${dot(c)}${BOTTOM[c][0]}</button>`).join("");
    document.querySelectorAll("#bottomFilter .chip").forEach(b => b.onclick = () => {
      state.bottom = b.dataset.b || null; renderFabricGrid();
    });
    const shown = fabrics
      .filter(f => !state.bottom || f.bottoms.includes(state.bottom))
      .sort((a, b) => a.noSemi - b.noSemi || byCode(a.code, b.code));
    $("fabricGrid").innerHTML = shown.length ? shown.map(f => {
      const it = state.bottom ? f.items.find(i => i.bottom === state.bottom) : null;
      const cover = it ? it.img : f.cover;
      const badge = f.noSemi ? `<span class="badge gone">布終了・見本のみ</span>` : f.inStock ? `<span class="badge ok">在庫あり</span>` : "";
      return `<a class="card" href="#/fabric/${f.code}${state.bottom ? "?b=" + state.bottom : ""}">
        <div class="ph" style="background-image:url('${cover}')">${badge}</div>
        <div class="body">
          <div class="name">${f.code}　${esc(f.base)}地</div>
          <div class="meta">作った組み合わせ ${f.bottoms.length}色</div>
          <div class="dots">${f.bottoms.map(dot).join("")}</div>
        </div></a>`;
    }).join("") : `<p class="empty">この色の組み合わせはまだありません。</p>`;
  }

  /* ---------- 布ページ ---------- */
  function renderFabric(code, query) {
    const f = FABRICS.get(code);
    if (!f) return renderTop();
    const sel = { bottom: query.get("b") || f.bottoms[0], size: "Ｍ", clasp: "usual" };
    const siblings = [...FABRICS.values()].filter(x => x.pattern === f.pattern && x.code !== f.code).sort((a, b) => byCode(a.code, b.code));

    $("gx-home").innerHTML = `
    <div class="wrap">
      <a class="back" href="#fabrics">← 布の一覧へ</a>
      <div class="fabric-head">
        <div class="preview">
          <div class="main" id="mainPh"><div class="swatch-tag" id="swTag"></div></div>
          <div class="note" id="phNote"></div>
          <div class="thumbs" id="thumbs"></div>
        </div>
        <div class="order">
          <h1>布 ${f.code}　${esc(f.base)}地</h1>
          <p class="sub">これまでに ${f.items.length}足 作った布です。${f.noSemi ? "" : "下部の色とサイズを選んでセミオーダーできます。"}</p>
          ${f.noSemi ? `<div class="gone-note">この布は使い切ったため、セミオーダーをお受けできません。写真は配色の参考としてご覧ください。</div>` : `
          <div class="step">
            <h3>1. 下部の色<span id="bName"></span></h3>
            <div class="swatches" id="swatches"></div>
            <div class="legend"><i></i>この布で作ったことのある色（写真あり）</div>
          </div>
          <div class="step">
            <h3>2. サイズ</h3>
            <div class="seg" id="sizes"></div>
          </div>
          <div class="step">
            <h3>3. 留め具</h3>
            <div class="seg" id="clasps"></div>
          </div>
          <div class="summary">
            <strong>ご注文内容</strong>
            <div class="code" id="orderText"></div>
            <div class="actions">
              <button class="btn" id="copyBtn" type="button">注文内容をコピー</button>
              <a class="btn primary" id="goBtn">セミオーダーへ進む</a>
            </div>
            <p class="how">セミオーダーの商品ページでカートに入れ、購入手続きの「備考」にコピーした内容を貼ってください。柄の出方は一足ずつ変わります。</p>
          </div>`}
          ${siblings.length ? `<div class="step" style="margin-top:28px">
            <h3>同じ柄の色ちがい</h3>
            <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:10px">${siblings.map(s => `
              <a class="card" href="#/fabric/${s.code}"><div class="ph" style="background-image:url('${s.cover}')"></div>
              <div class="body"><div class="meta">${s.code} ${esc(s.base)}地</div></div></a>`).join("")}</div>
          </div>` : ""}
        </div>
      </div>
    </div>`;

    const photoFor = b => f.items.find(i => i.bottom === b);
    function draw() {
      const made = photoFor(sel.bottom);
      const shown = made || f.items[0];
      $("mainPh").style.backgroundImage = `url('${shown.img}')`;
      $("swTag").innerHTML = `${dot(sel.bottom)}下部：${BOTTOM[sel.bottom]?.[0] || sel.bottom}`;
      $("phNote").innerHTML = made
        ? `実際に作った一足です（${esc(made.shortName.split("【")[0])}${made.stock > 0 ? `・<a href="${made.url}">在庫あり</a>` : "・売り切れ"}）`
        : `この組み合わせはまだ作ったことがありません。写真は同じ布の別の一足で、下部の色だけが変わります。`;
      $("thumbs").innerHTML = f.items.map(i =>
        `<button type="button" data-b="${i.bottom}" aria-pressed="${i.bottom === sel.bottom}" title="${esc(i.shortName)}">
          <img src="${i.img}" alt="">${dot(i.bottom)}</button>`).join("");
      document.querySelectorAll("#thumbs button").forEach(b => b.onclick = () => { sel.bottom = b.dataset.b; draw(); });
      if (f.noSemi) return;

      $("bName").textContent = BOTTOM[sel.bottom]?.[0] || "";
      $("swatches").innerHTML = Object.entries(BOTTOM).map(([c, [name]]) =>
        `<button type="button" class="sw" data-b="${c}" aria-pressed="${c === sel.bottom}">${f.bottoms.includes(c) ? '<span class="made"></span>' : ""}${dot(c)}${name}</button>`).join("");
      document.querySelectorAll("#swatches .sw").forEach(b => b.onclick = () => { sel.bottom = b.dataset.b; draw(); });
      $("sizes").innerHTML = SIZES.map(([s, d]) =>
        `<button type="button" data-s="${s}" aria-pressed="${s === sel.size}">${s}<br><small>${d}</small></button>`).join("");
      document.querySelectorAll("#sizes button").forEach(b => b.onclick = () => { sel.size = b.dataset.s; draw(); });
      $("clasps").innerHTML = [["usual", "通常留め具"], ["original", "オリジナル留め具（レジン手作り）"]].map(([k, l]) =>
        `<button type="button" data-c="${k}" aria-pressed="${k === sel.clasp}">${l}<br><small>${esc(SEMI[k]?.price || "")}</small></button>`).join("");
      document.querySelectorAll("#clasps button").forEach(b => b.onclick = () => { sel.clasp = b.dataset.c; draw(); });

      const text = `【${f.code}/${sel.bottom}】${sel.size}サイズ／${sel.clasp === "usual" ? "通常留め具" : "オリジナル留め具（色はお任せ）"}`;
      $("orderText").textContent = text;
      $("goBtn").href = SEMI[sel.clasp]?.url || HOME;
      $("copyBtn").onclick = () => copy(text);
    }
    draw();
    window.scrollTo(0, 0);
  }

  /* ---------- カテゴリ・検索結果 ---------- */
  function renderList() {
    $("gx-list").innerHTML = ITEMS.length
      ? `<div class="wrap"><div class="grid">${ITEMS.map(cardItem).join("")}</div></div>`
      : `<div class="wrap"><p class="empty">商品がありません。</p></div>`;
  }

  /* ---------- 商品ページ: 売り切れブーツにセミオーダーの案内 ---------- */
  function enhanceItem() {
    const el = $("gx-item");
    const it = parse({ ...el.dataset });
    document.querySelectorAll(".item-photos .thumbs button").forEach(b => b.onclick = () => {
      $("gx-main").src = b.dataset.src;
      document.querySelectorAll(".item-photos .thumbs button").forEach(x => x.setAttribute("aria-pressed", x === b));
    });
    if (it.kind !== "boots" || !it.fabric || it.stock > 0) return;
    const slot = $("gx-semi");
    if (it.noSemi) {
      slot.innerHTML = `<div class="gone-note">この布は使い切ったため、セミオーダーをお受けできません。</div>`;
      return;
    }
    const code = `【${it.fabric}/${it.bottom}】`;
    slot.innerHTML = `<div class="semi-panel">
      <strong>この配色はセミオーダーで作れます</strong>
      同じ布で、サイズ違いや下部の色違いもお作りします。
      <div class="code">${code}</div>
      <div class="actions">
        <a class="btn primary" href="${HOME}#/fabric/${it.fabric}?b=${it.bottom}">サイズと色を選ぶ</a>
        <button class="btn" type="button" id="gx-copy">商品コードをコピー</button>
      </div></div>`;
    $("gx-copy").onclick = () => copy(code);
  }

  /* ---------- クーポン(coupons.json は毎朝 BASE の告知から自動更新) ---------- */
  const WEEK = "日月火水木金土";
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}（${WEEK[d.getDay()]}）${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const payidLink = cls => IS_PHONE
    ? `<a class="${cls}" href="${PAYID_SHOP}">PAY IDアプリで grunex を開く</a>`
    : `<span class="payid-pc">スマートフォンの PAY IDアプリで「grunex」を検索してください</span>`;
  let COUPON = null;

  function renderCoupon(list) {
    const q = new URLSearchParams(location.search).get("now");   // ?now=2026-10-17T10:00 で時刻を差し替えて確認できる
    const now = q ? new Date(q) : new Date();
    const c = list.find(c => now < new Date(c.end) && new Date(c.start) - now < 14 * 864e5);
    if (!c) return;
    COUPON = c;
    const start = new Date(c.start), end = new Date(c.end), live = now >= start;
    const who = c.first_only ? "PAY IDアプリではじめてお買いものの方は" : "PAY IDアプリでのお買いもので";
    $("couponBar").innerHTML = `<div class="coupon"><div class="wrap">
      <span class="tag">${live ? "開催中" : "予告"}</span>
      <div class="txt">${who} <b>${esc(c.offer || "クーポン")}</b><br>
        ${live ? `${fmt(end)}まで` : `${fmt(start)}〜${fmt(end)}`}${c.code ? `　クーポンコード ${esc(c.code)}` : ""}
        ${c.web_ok ? "" : "<small>このWebショップでのご購入には使えません。PAY IDアプリから grunex でお買いものください。</small>"}</div>
      ${IS_PHONE ? `<a href="${PAYID_SHOP}">アプリで開く</a>` : `<a href="${c.campaign}" target="_blank" rel="noopener">くわしく</a>`}
    </div></div>`;
    renderCouponBanner();
  }

  function renderCouponBanner() {
    const slot = $("couponBanner");
    if (!slot || !COUPON || !COUPON.banner) return;
    slot.innerHTML = `<a class="coupon-banner" href="${COUPON.campaign}" target="_blank" rel="noopener">
        <img src="${PAGES + COUPON.banner}" alt="${esc(COUPON.title)}" loading="lazy"></a>
      <div class="coupon-foot">
        ${COUPON.web_ok ? "" : `<p class="coupon-note">PAY IDアプリでのお買いもの限定です。このWebショップのカートでは使えません。</p>`}
        ${payidLink("btn primary")}
      </div>`;
  }

  function copy(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(() => toast("コピーしました。購入手続きの備考に貼ってください"))
      .catch(() => toast(text));
  }

  function toast(msg) {
    let t = $("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2200);
  }

  function route() {
    const h = location.hash.replace(/^#/, "");
    const [path, qs] = h.split("?");
    const m = path.match(/^\/fabric\/([A-Z]+-\d+)/);
    if (m) renderFabric(m[1], new URLSearchParams(qs));
    else renderTop();
  }

  async function main() {
    if ($("couponBar")) {
      fetch(PAGES + "coupons.json").then(r => r.ok ? r.json() : { coupons: [] })
        .then(d => renderCoupon(d.coupons)).catch(() => {});
    }
    if ($("gx-item")) enhanceItem();
    if ($("gx-home") || $("gx-list")) {
      const target = $("gx-home") || $("gx-list");
      target.innerHTML = `<p class="loading">読み込み中…</p>`;
      ITEMS = await loadAllItems();
      buildFabrics();
      if ($("gx-home")) { addEventListener("hashchange", route); route(); }
      else renderList();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
