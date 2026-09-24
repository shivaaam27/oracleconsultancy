// Minimal local renderer for .dc.html boards — for visual checking only.
(function () {
  const BOARDS = window.BOARDS;
  const parsed = {};
  function parse(name) {
    if (parsed[name]) return parsed[name];
    const t = BOARDS[name];
    if (!t) throw new Error('No board ' + name);
    const x = t.slice(t.indexOf('<x-dc>') + 6, t.indexOf('</x-dc>'));
    const hm = x.match(/<helmet>([\s\S]*?)<\/helmet>/);
    const tpl = x.replace(/<helmet>[\s\S]*?<\/helmet>/, '');
    const sm = t.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
    const code = sm ? sm[1] : 'class Component extends DCLogic { renderVals(){ return {}; } }';
    const te = document.createElement('template');
    te.innerHTML = tpl;
    return (parsed[name] = { helmet: hm ? hm[1] : '', tpl: te.content, code });
  }
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(o) { Object.assign(this.state, typeof o === 'function' ? o(this.state, this.props) : o); schedule(); }
    forceUpdate() { schedule(); }
  }
  let pending = false;
  function schedule() { if (pending) return; pending = true; Promise.resolve().then(() => { pending = false; paint(); }); }
  const instances = {}; window.__I = instances;
  function instance(name, props, key) {
    const k = name + '|' + (key || '');
    if (instances[k]) { instances[k].props = props || {}; return instances[k]; }
    const C = new Function('DCLogic', parse(name).code + '\n;return Component;')(DCLogic);
    const inst = new C(props || {});
    if (!inst.state) inst.state = {};
    instances[k] = inst;
    return inst;
  }
  function lit(p) {
    p = p.trim();
    if (p === 'true') return { v: true };
    if (p === 'false') return { v: false };
    if (p === 'null') return { v: null };
    if (/^-?\d+(\.\d+)?$/.test(p)) return { v: Number(p) };
    if (/^'.*'$|^".*"$/.test(p)) return { v: p.slice(1, -1) };
    return null;
  }
  function resolve(p, ctx) {
    const l = lit(p); if (l) return l.v;
    let v = ctx;
    for (const part of p.trim().split('.')) { if (v == null) return undefined; v = v[part]; }
    return v;
  }
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
  function interp(s, ctx) { return s.replace(HOLE, (_, p) => { const v = resolve(p, ctx); return v == null ? '' : String(v); }); }
  const EV = { onclick: 'click', onchange: 'input', oninput: 'input', onmouseenter: 'mouseenter', onmouseleave: 'mouseleave', onfocus: 'focus', onblur: 'blur', onkeydown: 'keydown', onsubmit: 'submit' };
  function render(node, ctx, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, ctx))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'sc-for') {
      const list = resolve(node.getAttribute('list').replace(/^\{\{|\}\}$/g, ''), ctx) || [];
      const as = node.getAttribute('as') || 'item';
      list.forEach((it, i) => { const c = Object.assign({}, ctx, { [as]: it, $index: i }); node.childNodes.forEach((ch) => render(ch, c, out)); });
      return;
    }
    if (tag === 'sc-if') {
      const v = resolve(node.getAttribute('value').replace(/^\{\{|\}\}$/g, ''), ctx);
      if (v) node.childNodes.forEach((ch) => render(ch, ctx, out));
      return;
    }
    if (tag === 'dc-import') {
      const name = node.getAttribute('name') + '.dc.html';
      const props = {};
      for (const a of node.attributes) {
        if (a.name === 'name' || a.name.startsWith('hint-')) continue;
        const m = a.value.match(WHOLE);
        const key = a.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        props[key] = m ? resolve(m[1], ctx) : interp(a.value, ctx);
      }
      const inst = instance(name, props, JSON.stringify(props).slice(0, 200));
      const vals = inst.renderVals();
      parse(name).tpl.childNodes.forEach((ch) => render(ch, vals, out));
      return;
    }
    const el = document.createElementNS(node.namespaceURI, tag);
    let value;
    for (const a of node.attributes) {
      const n = a.name.toLowerCase();
      const m = a.value.match(WHOLE);
      if (EV[n] && m) { const fn = resolve(m[1], ctx); if (typeof fn === 'function') el.addEventListener(EV[n], (e) => { if (n === 'onclick' && el.localName === 'a') e.preventDefault(); fn(e); }); continue; }
      if (n.startsWith('on')) continue;
      let v = m ? resolve(m[1], ctx) : interp(a.value, ctx);
      if (v === undefined || v === null) continue;
      if (n === 'value') { value = v; continue; }
      el.setAttribute(a.name, String(v));
    }
    node.childNodes.forEach((ch) => { const kids = []; render(ch, ctx, kids); kids.forEach((k) => el.appendChild(k)); });
    if (value !== undefined) el.value = value;
    out.push(el);
  }
  let current = null;
  function paint() {
    const root = document.getElementById('root');
    const ae = document.activeElement;
    let path = null, sel = null;
    if (ae && root.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) {
      path = []; let n = ae; while (n !== root) { path.unshift([].indexOf.call(n.parentNode.childNodes, n)); n = n.parentNode; }
      sel = [ae.selectionStart, ae.selectionEnd];
    }
    const inst = instance(current, {});
    const vals = inst.renderVals();
    const out = [];
    parse(current).tpl.childNodes.forEach((ch) => render(ch, vals, out));
    root.replaceChildren(...out);
    if (path) { let n = root; for (const i of path) { n = n && n.childNodes[i]; } if (n && n.focus) { n.focus(); try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  }
  function load(name) {
    current = name;
    document.getElementById('helmet').innerHTML = parse(name).helmet;
    paint();
    const inst = instance(name, {});
    if (inst.componentDidMount && !inst.__mounted) { inst.__mounted = true; inst.componentDidMount(); }
    document.title = name;
  }
  window.V = function (z, x, y) {
    const r = document.getElementById('root');
    const w = r.firstElementChild ? r.firstElementChild.offsetWidth : 1440;
    if (!z) z = innerWidth / w;
    r.style.transformOrigin = '0 0';
    r.style.transform = 'scale(' + z + ') translate(' + (-(x || 0)) + 'px,' + (-(y || 0)) + 'px)';
    document.documentElement.style.overflow = 'hidden';
    localStorage.setItem('V', JSON.stringify([z, x || 0, y || 0]));
  };
  const _paint = paint;
  paint = function () { _paint(); try { const v = JSON.parse(localStorage.getItem('V') || '[0,0,0]'); window.V(v[0], v[1], v[2]); } catch (e) {} };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href$=".dc.html"]');
    if (a) { e.preventDefault(); location.hash = a.getAttribute('href').replace(/^\//, ''); }
  });
  window.addEventListener('hashchange', () => load(decodeURIComponent(location.hash.slice(1))));
  load(decodeURIComponent(location.hash.slice(1)) || window.START);
})();
