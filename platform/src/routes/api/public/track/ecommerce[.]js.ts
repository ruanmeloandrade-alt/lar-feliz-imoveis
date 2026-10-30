import { createFileRoute } from "@tanstack/react-router";

/**
 * Script de e-commerce do MKTOn.
 * Complementa o pixel principal detectando eventos de loja
 * (view_item, add_to_cart, begin_checkout, purchase) em Shopify,
 * Nuvemshop, WooCommerce, Tray e Yampi — sem configuração manual.
 */
const SCRIPT = String.raw`(function(){
  if (window.__mktonEcom) return; window.__mktonEcom = 1;

  function track(name, props, value){
    try {
      if (typeof window.mkton === "function") { window.mkton("track", name, props || {}, value); return; }
      window.mkton = window.mkton || function(){ (window.mkton.q = window.mkton.q || []).push(arguments); };
      window.mkton("track", name, props || {}, value);
    } catch(e){}
  }
  function num(v){ var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.,-]/g,"").replace(/\.(?=\d{3}\b)/g,"").replace(",", ".")); return isFinite(n) ? n : null; }
  var fired = {};
  function once(k){ if (fired[k]) return false; fired[k] = true; return true; }

  /* ---------- 1) dataLayer padrão GA4 / GTM ---------- */
  var MAP = { view_item:1, add_to_cart:1, remove_from_cart:1, begin_checkout:1, add_payment_info:1, purchase:1, refund:1 };
  function fromDataLayer(o){
    try {
      if (!o || !o.event || !MAP[o.event]) return;
      var ec = o.ecommerce || {};
      var v = num(ec.value != null ? ec.value : o.value);
      var items = (ec.items || []).slice(0,10).map(function(i){ return { id: i.item_id || i.id, name: i.item_name || i.name, price: num(i.price), qty: i.quantity || 1 }; });
      track(o.event, { order_id: ec.transaction_id || o.transaction_id || null, currency: ec.currency || o.currency || "BRL", items: items }, v);
    } catch(e){}
  }
  try {
    window.dataLayer = window.dataLayer || [];
    (window.dataLayer || []).forEach(fromDataLayer);
    var _push = window.dataLayer.push;
    window.dataLayer.push = function(){ try { [].slice.call(arguments).forEach(fromDataLayer); } catch(e){} return _push.apply(window.dataLayer, arguments); };
  } catch(e){}

  /* ---------- 2) Shopify ---------- */
  try {
    if (window.Shopify) {
      var m = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (m && m.product && once("view_item")) track("view_item", { id: m.product.id, name: m.product.variants && m.product.variants[0] && m.product.variants[0].name }, num(m.product.variants && m.product.variants[0] && m.product.variants[0].price/100));
      var ck = m && m.page && m.page.pageType === "checkout";
      if (ck && once("begin_checkout")) track("begin_checkout", {});
      var chk = window.Shopify.checkout;
      if (chk && once("purchase")) track("purchase", { order_id: chk.order_id, currency: chk.currency || "BRL" }, num(chk.total_price));
    }
  } catch(e){}

  /* ---------- 3) Nuvemshop / Tray / Yampi / Woo — heurística de URL ---------- */
  try {
    var p = location.pathname.toLowerCase();
    if (/(\/produto|\/products?\/|\/p\/)/.test(p) && once("view_item")) {
      var t = document.querySelector('[itemprop="name"], h1');
      var pr = document.querySelector('[itemprop="price"], .price, .product-price, .valor');
      track("view_item", { name: t ? (t.textContent||"").trim().slice(0,120) : document.title.slice(0,120) }, pr ? num(pr.getAttribute("content") || pr.textContent) : null);
    }
    if (/(\/cart|\/carrinho)/.test(p) && once("view_cart")) track("view_cart", {});
    if (/(\/checkout|\/finalizar)/.test(p) && once("begin_checkout")) track("begin_checkout", {});
    if (/(\/thank|\/obrigad|\/order-received|\/pedido\/(sucesso|confirmado))/.test(p) && once("purchase")) {
      var tot = document.querySelector('.order-total .amount, .woocommerce-Price-amount, [data-total], .total-value');
      var ord = (location.search.match(/(?:order|pedido|order_id)=([^&]+)/i) || [])[1] || null;
      track("purchase", { order_id: ord, currency: "BRL", source: "thankyou-page" }, tot ? num(tot.textContent) : null);
    }
  } catch(e){}

  /* ---------- 4) Botões de carrinho ---------- */
  document.addEventListener("click", function(e){
    try {
      var el = e.target && e.target.closest && e.target.closest("button, a, input[type=submit]");
      if (!el) return;
      var txt = ((el.innerText || el.textContent || el.value || "") + "").toLowerCase();
      var cls = ((el.className || "") + " " + (el.getAttribute("name") || "")).toLowerCase();
      if (/add[-_ ]?to[-_ ]?cart|adicionar ao carrinho|comprar agora|single_add_to_cart/.test(txt + " " + cls)) {
        track("add_to_cart", { label: txt.trim().slice(0,80) });
      } else if (/finalizar compra|ir para o checkout|checkout/.test(txt)) {
        track("begin_checkout", { label: txt.trim().slice(0,80) });
      }
    } catch(err){}
  }, true);
})();`;

export const Route = createFileRoute("/api/public/track/ecommerce.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
