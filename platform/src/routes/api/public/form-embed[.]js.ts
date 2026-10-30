// Script público de incorporação: monta o formulário do CRM direto na página
// do cliente e envia as respostas para o endpoint de ingestão.
//
// Uso:
//   <div id="mkton-form"></div>
//   <script src="https://saudeslim.com.br/api/public/form-embed.js"
//           data-form="TOKEN" data-target="#mkton-form"></script>

import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = String.raw`(function () {
  var current = document.currentScript;
  if (!current) return;
  var token = current.getAttribute('data-form');
  if (!token) return;
  var origin = new URL(current.src, window.location.href).origin;
  var targetSel = current.getAttribute('data-target');
  var mount = targetSel ? document.querySelector(targetSel) : null;
  if (!mount) {
    mount = document.createElement('div');
    current.parentNode.insertBefore(mount, current);
  }
  var accent = current.getAttribute('data-accent') || '#6d28d9';
  var endpoint = origin + '/api/public/forms/' + token;

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'style') n.setAttribute('style', props[k]);
      else if (k in n) n[k] = props[k];
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  var LBL = 'display:block;font:600 12px/1.4 system-ui,sans-serif;margin:0 0 4px;color:#374151';
  var INP = 'width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font:400 14px/1.4 system-ui,sans-serif;background:#fff;color:#111827';

  fetch(endpoint, { method: 'GET' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.error) || 'Formulário indisponível.');
      var form = el('form', { style: 'display:grid;gap:14px;max-width:520px;font-family:system-ui,sans-serif' });
      if (data.nome) form.appendChild(el('div', { textContent: data.nome, style: 'font:700 18px/1.3 system-ui,sans-serif;color:#111827' }));
      if (data.descricao) form.appendChild(el('div', { textContent: data.descricao, style: 'font:400 13px/1.5 system-ui,sans-serif;color:#6b7280' }));

      (data.campos || []).forEach(function (c) {
        var wrap = el('div', {});
        wrap.appendChild(el('label', { textContent: c.label + (c.required ? ' *' : ''), style: LBL, htmlFor: 'mkf_' + c.id }));
        var input;
        if (c.kind === 'select') {
          input = el('select', { id: 'mkf_' + c.id, name: c.id, required: !!c.required, style: INP });
          input.appendChild(el('option', { value: '', textContent: 'Selecione…' }));
          (c.options || []).forEach(function (o) { input.appendChild(el('option', { value: o, textContent: o })); });
        } else if (c.kind === 'file') {
          input = el('input', { type: 'file', id: 'mkf_' + c.id, name: c.id, style: INP });
        } else {
          var type = c.kind === 'email' ? 'email' : c.kind === 'phone' ? 'tel' : c.kind === 'value' ? 'number' : 'text';
          input = el('input', { type: type, id: 'mkf_' + c.id, name: c.id, required: !!c.required, style: INP, placeholder: c.placeholder || '' });
        }
        wrap.appendChild(input);
        form.appendChild(wrap);
      });

      var msg = el('div', { style: 'font:400 13px/1.5 system-ui,sans-serif' });
      var btn = el('button', {
        type: 'submit',
        textContent: 'Enviar',
        style: 'padding:11px 18px;border:0;border-radius:8px;background:' + accent + ';color:#fff;font:600 14px/1 system-ui,sans-serif;cursor:pointer'
      });
      form.appendChild(btn);
      form.appendChild(msg);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        btn.disabled = true;
        var prev = btn.textContent;
        btn.textContent = 'Enviando…';
        msg.textContent = '';
        var payload = {};
        (data.campos || []).forEach(function (c) {
          var node = form.querySelector('[name="' + c.id + '"]');
          if (node && node.type !== 'file') payload[c.id] = node.value;
        });
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (r) { return r.json(); })
          .then(function (out) {
            if (out && out.ok) {
              form.innerHTML = '';
              form.appendChild(el('div', { textContent: 'Recebemos sua resposta. Obrigado!', style: 'font:600 15px/1.5 system-ui,sans-serif;color:#111827' }));
            } else {
              msg.style.color = '#b91c1c';
              msg.textContent = (out && out.error) || 'Não foi possível enviar.';
              btn.disabled = false; btn.textContent = prev;
            }
          })
          .catch(function () {
            msg.style.color = '#b91c1c';
            msg.textContent = 'Falha de conexão. Tente novamente.';
            btn.disabled = false; btn.textContent = prev;
          });
      });

      mount.innerHTML = '';
      mount.appendChild(form);
    })
    .catch(function (err) {
      mount.innerHTML = '';
      mount.appendChild(el('div', {
        textContent: 'Formulário indisponível: ' + (err && err.message ? err.message : 'erro'),
        style: 'font:400 13px/1.5 system-ui,sans-serif;color:#b91c1c'
      }));
    });
})();`;

export const Route = createFileRoute("/api/public/form-embed.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=300",
            "access-control-allow-origin": "*",
          },
        }),
    },
  },
});
