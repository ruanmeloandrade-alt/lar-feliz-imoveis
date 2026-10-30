import { createFileRoute } from "@tanstack/react-router";

/**
 * Snippet público de captação Meta.
 * Serve JS que o cliente cola no site pra capturar fbc/fbp/fbclid/event_id
 * e enviar pra /api/public/track/meta assim que um formulário do MKTOn é
 * submetido, permite ao Conversions API deduplicar com o Pixel do browser.
 *
 * Uso no site do cliente:
 *   <script src="https://<seu-dominio>/api/public/track/meta.js"
 *     data-pixel-id="1234567890"
 *     data-mkton-origin="https://app.mkton.com"></script>
 *
 * Assim que uma tag <form data-mkton-lead-id="{{leadId}}"> for submetida,
 * o snippet posta os cookies fb capturados no endpoint /api/public/track/meta.
 */

const JS = `(function(){
  var s = document.currentScript;
  var pixelId = s && s.getAttribute("data-pixel-id");
  var origin = (s && s.getAttribute("data-mkton-origin")) || "";
  if (!pixelId) { return; }

  // 1) Carrega o Pixel oficial (se ainda não estiver carregado)
  if (!window.fbq) {
    (function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window,
    document,"script","https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
  }

  function getCookie(name){
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function uuid(){
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){
      var r=Math.random()*16|0, v=c==="x"?r:(r&0x3|0x8); return v.toString(16);
    });
  }
  function fbclidFromUrl(){
    try { return new URLSearchParams(window.location.search).get("fbclid"); }
    catch(e){ return null; }
  }

  // 2) Encontra qualquer form marcado como lead do MKTOn e amarra a submissão.
  //    O form precisa ter data-mkton-lead-id="<uuid do lead recém-criado>".
  function bindForms(){
    var forms = document.querySelectorAll("form[data-mkton-lead-id]");
    for (var i=0; i<forms.length; i++){
      var f = forms[i];
      if (f.__mktonBound) continue;
      f.__mktonBound = true;
      f.addEventListener("submit", function(ev){
        var leadId = ev.currentTarget.getAttribute("data-mkton-lead-id");
        if (!leadId) return;
        var eventId = uuid();
        var payload = {
          leadId: leadId,
          fbp: getCookie("_fbp"),
          fbc: getCookie("_fbc"),
          fbclid: fbclidFromUrl(),
          eventId: eventId,
          externalId: leadId
        };
        // Dispara Lead no Pixel do browser (com mesmo eventID pra dedupe).
        try { window.fbq && window.fbq("track", "Lead", {}, { eventID: eventId }); } catch(e){}
        // Manda pro MKTOn de forma não-bloqueante.
        try {
          var url = (origin || "") + "/api/public/track/meta";
          if (navigator.sendBeacon) {
            navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: "application/json" }));
          } else {
            fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload), keepalive: true, mode: "cors" });
          }
        } catch(e){}
      }, { capture: true });
    }
  }
  if (document.readyState !== "loading") bindForms();
  else document.addEventListener("DOMContentLoaded", bindForms);
  // Reescaneia após mutações do DOM (SPA, formulários carregados por AJAX).
  try {
    var mo = new MutationObserver(function(){ bindForms(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e){}
})();`;

export const Route = createFileRoute("/api/public/track/meta-snippet")({
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
