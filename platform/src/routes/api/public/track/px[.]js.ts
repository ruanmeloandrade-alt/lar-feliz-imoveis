import { createFileRoute } from "@tanstack/react-router";

/**
 * MKTOn Pixel, script público carregado pelo <head> do site do cliente.
 * O snippet copiado pela UI passa o workspace_id via querystring `?w=`.
 *
 * IMPORTANTE (CORS): o envio usa Content-Type "text/plain", é o único jeito de
 * o navegador NÃO disparar preflight em requisições sendBeacon/fetch cross-origin.
 * Com "application/json" o beacon é enviado com credenciais e o preflight é
 * rejeitado (Allow-Origin "*" + credenciais = bloqueio), e nenhum evento chega.
 *
 * PRIVACIDADE (padrão "conversão"): por padrão o pixel só mede o que é
 * marketing de verdade — page_view, envio de formulário (só o identificador do
 * form, nunca o conteúdo digitado), clique em WhatsApp/telefone, eventos
 * enviados via window.mkton(...) e as regras personalizadas do workspace.
 * Não captura clique genérico em botões, rolagem, tempo de página nem vídeo.
 * Quem quiser esses sinais extras carrega o script com `&full=1` (modo
 * comportamental, opt-in explícito do dono do site).
 */

const JS = `(function(){
  var scr = document.currentScript;
  var src = scr ? scr.src : "";
  var wsMatch = src.match(/[?&]w=([^&]+)/);
  var ws = wsMatch ? decodeURIComponent(wsMatch[1]) : null;
  if (!ws) return;
  var base = src.replace(/\\/px\\.js.*$/, "");
  // modo comportamental (rolagem, tempo, cliques genéricos, vídeo) é opt-in
  var FULL = /[?&]full=1/.test(src);


  function cookie(name){ var m=document.cookie.match(new RegExp("(?:^|; )"+name+"=([^;]+)")); return m?decodeURIComponent(m[1]):null; }
  function setCookie(name,val,days){ var d=new Date(); d.setTime(d.getTime()+days*864e5); document.cookie=name+"="+encodeURIComponent(val)+"; expires="+d.toUTCString()+"; path=/; SameSite=Lax"; }
  function uuid(){ return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){ var r=Math.random()*16|0, v=c==="x"?r:(r&0x3|0x8); return v.toString(16); }); }
  function qs(k){ try { return new URLSearchParams(location.search).get(k); } catch(e){ return null; } }

  // Nunca rastreia o painel MKTOn, previews de editor nem localhost.
  var H = location.hostname || "";
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(H) || /\.local$/i.test(H)
      || /id-preview|-preview--|lovableproject\.com|lovable\.dev/i.test(H)
      || /(^|\.)mkton\.io$/i.test(H) || /(^|\.)code-to-lovely-ui\.lovable\.app$/i.test(H)) return;

  var anon = cookie("_mkton_anon"); if(!anon){ anon = uuid(); setCookie("_mkton_anon", anon, 365); }
  var sess = null;
  try { sess = sessionStorage.getItem("_mkton_sess"); if(!sess){ sess = uuid(); sessionStorage.setItem("_mkton_sess", sess); } } catch(e){ sess = uuid(); }

  // persiste UTMs em cookie (30 dias), permite atribuição em envios posteriores
  var utmKeys = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"];
  var utms = {};
  utmKeys.forEach(function(k){
    var v = qs(k); if (v) { setCookie("_mkton_"+k, v, 30); utms[k]=v; }
    else { var c = cookie("_mkton_"+k); if(c) utms[k]=c; }
  });
  var fbclid = qs("fbclid") || cookie("_mkton_fbclid"); if (qs("fbclid")) setCookie("_mkton_fbclid", fbclid, 30);
  var gclid = qs("gclid") || cookie("_mkton_gclid");    if (qs("gclid"))  setCookie("_mkton_gclid",  gclid, 30);

  function send(name, props, value){
    var body = {
      w: ws, event: name || "page_view",
      url: location.href, path: location.pathname, ref: document.referrer || null,
      utm_source: utms.utm_source || null, utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null, utm_term: utms.utm_term || null, utm_content: utms.utm_content || null,
      fbclid: fbclid || null, gclid: gclid || null,
      anon_id: anon, session_id: sess,
      value: (typeof value === "number" ? value : null),
      event_id: uuid(),
      props: props || {}
    };
    try {
      var url = base + "/collect";
      var payload = JSON.stringify(body);
      // text/plain evita preflight CORS (requisição "simples")
      var ok = false;
      if (navigator.sendBeacon) {
        try { ok = navigator.sendBeacon(url, new Blob([payload], { type: "text/plain;charset=UTF-8" })); } catch(e){ ok = false; }
      }
      if (!ok) {
        fetch(url, { method:"POST", headers:{"Content-Type":"text/plain;charset=UTF-8"}, body: payload, keepalive: true, mode:"cors", credentials:"omit" }).catch(function(){});
      }
    } catch(e){}

    // Sinal de lead para integrações externas (Google Ads, GTM).
    try {
      var leadEvents = { form_submit:1, whatsapp_click:1, phone_click:1, lead:1, lead_form_submit:1 };
      if (leadEvents[name]) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: "mkton_lead", mkton_event: name });
        try { window.dispatchEvent(new CustomEvent("mkton:lead", { detail: { event: name, props: props || {} } })); } catch(e2){}
      }
    } catch(e3){}
  }

  // API pública: window.mkton("track", "event_name", { ... }, 100)
  var q = (window.mkton && window.mkton.q) || [];
  window.mkton = function(){ var args = [].slice.call(arguments); if (args[0] === "track") send(args[1], args[2] || {}, args[3]); };
  q.forEach(function(a){ try { window.mkton.apply(null, a); } catch(e){} });

  var fired = {};
  function onceKey(k){ if (fired[k]) return false; fired[k] = true; return true; }

  // ---------- Page view + SPA ----------
  function pageview(){ send("page_view", { title: document.title }); }
  pageview();
  var lastPath = location.pathname;
  setInterval(function(){
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      fired = {}; startedAt = Date.now(); maxScroll = 0;
      pageview();
    }
  }, 500);

  // ---------- Scroll depth / tempo (somente modo comportamental) ----------
  var maxScroll = 0;
  var startedAt = Date.now();
  if (FULL) {
    var scrollPct = function(){
      var h = document.documentElement;
      var total = (h.scrollHeight - h.clientHeight);
      if (total <= 0) return 100;
      return Math.min(100, Math.round((h.scrollTop || document.body.scrollTop) / total * 100));
    };
    window.addEventListener("scroll", function(){
      var p = scrollPct();
      if (p > maxScroll) maxScroll = p;
      [25,50,75,90].forEach(function(mark){
        if (maxScroll >= mark && onceKey("scroll"+mark)) send("scroll_depth", { percent: mark });
      });
    }, { passive: true });

    [15,30,60,180].forEach(function(sec){
      setTimeout(function(){
        if (document.visibilityState !== "hidden" && onceKey("time"+sec)) send("time_on_page", { seconds: sec });
      }, sec*1000);
    });
    window.addEventListener("pagehide", function(){
      send("page_leave", { seconds: Math.round((Date.now()-startedAt)/1000), max_scroll: maxScroll });
    });
  }


  // ---------- Regras personalizadas ----------
  var rules = [];
  try {
    fetch(base + "/config?w=" + encodeURIComponent(ws) + "&d=" + encodeURIComponent(location.hostname))
      .then(function(r){ return r.json(); })
      .then(function(j){
        rules = (j && j.rules) || [];
        rules.forEach(function(r){
          if (r.trigger_type === "url" && r.url_contains && location.href.indexOf(r.url_contains) >= 0) {
            send(r.event_name, { rule: r.name }, r.value);
          }
        });
      }).catch(function(){});
  } catch(e){}

  function matchRule(r, el){
    if (r.trigger_type !== "click") return false;
    try {
      if (r.selector && el.closest && el.closest(r.selector)) return true;
      if (r.match_text) {
        var t = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (t && t.indexOf(String(r.match_text).toLowerCase()) >= 0) return true;
      }
    } catch(e){}
    return false;
  }

  // ---------- Cliques de contato (conversão) + regras ----------
  document.addEventListener("click", function(e){
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest("a,button,[role=button],input[type=submit]") || t;
    var href = (el.getAttribute && el.getAttribute("href")) || "";
    var label = ((el.innerText || el.textContent || el.value || "") + "").trim().slice(0, 80);

    if (/^https?:\\/\\/wa\\.me\\//i.test(href) || /^https?:\\/\\/api\\.whatsapp\\.com\\//i.test(href)) send("whatsapp_click", { href: href, label: label });
    else if (/^tel:/i.test(href)) send("phone_click", { href: href, label: label });
    else if (FULL) {
      if (/^mailto:/i.test(href)) send("email_click", { href: href, label: label });
      else if (href && /^https?:\\/\\//i.test(href) && href.indexOf(location.hostname) < 0) send("outbound_click", { href: href, label: label });
      else if (el.tagName === "A" || el.tagName === "BUTTON" || el.getAttribute("role") === "button") send("click", { label: label, href: href || null, id: el.id || null });
    }

    rules.forEach(function(r){
      if (!matchRule(r, el)) return;
      var key = "rule_" + r.id;
      if (r.once_per_session && !onceKey(key)) return;
      send(r.event_name, { rule: r.name, label: label }, r.value);
    });
  }, true);

  // ---------- Formulários (apenas o identificador, nunca o conteúdo) ----------
  document.addEventListener("submit", function(e){
    var f = e.target;
    if (!f || f.tagName !== "FORM") return;
    var id = f.getAttribute("id") || f.getAttribute("name") || f.getAttribute("action") || "form";
    // Identificação do lead: só e-mail/telefone/nome (nunca o restante do conteúdo).
    var ident = { form: String(id).slice(0,120) };
    try {
      var els = f.querySelectorAll("input, textarea");
      for (var i=0; i<els.length; i++) {
        var el2 = els[i];
        var v = (el2.value || "").trim();
        if (!v) continue;
        var meta = ((el2.type||"") + " " + (el2.name||"") + " " + (el2.id||"") + " " + (el2.getAttribute("placeholder")||"") + " " + (el2.getAttribute("autocomplete")||"")).toLowerCase();
        if (!ident.email && (/mail/.test(meta) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) ident.email = v.slice(0,160);
        else if (!ident.phone && (/tel|phone|fone|celular|whats/.test(meta)) && v.replace(/\D/g,"").length >= 8) ident.phone = v.slice(0,40);
        else if (!ident.name && /(^|[^a-z])(name|nome)([^a-z]|$)/.test(meta)) ident.name = v.slice(0,120);
      }
      var hidden = f.querySelector("[name=lead_id],[name=leadId]");
      if (hidden && hidden.value) ident.lead_id = hidden.value;
    } catch(err2){}
    send("form_submit", ident);
    rules.forEach(function(r){
      if (r.trigger_type !== "form") return;
      try { if (r.selector && !f.matches(r.selector)) return; } catch(err){ return; }
      send(r.event_name, { rule: r.name, form: String(id).slice(0,120) }, r.value);
    });
  }, true);

  // ---------- Vídeos (somente modo comportamental) ----------
  if (FULL) {
    var bindVideos = function(){
      var vids = document.querySelectorAll("video");
      for (var i=0;i<vids.length;i++){
        (function(v, idx){
          if (v.__mkton) return; v.__mkton = true;
          v.addEventListener("play", function(){ if (onceKey("vplay"+idx)) send("video_play", { src: (v.currentSrc||"").slice(0,200) }); });
          v.addEventListener("ended", function(){ send("video_complete", { src: (v.currentSrc||"").slice(0,200) }); });
        })(vids[i], i);
      }
    };
    bindVideos();
    setInterval(bindVideos, 3000);
  }

})();`;

export const Route = createFileRoute("/api/public/track/px.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JS, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
