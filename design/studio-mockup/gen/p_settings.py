from kit import *

search = '''<label style="display: flex; align-items: center; gap: 8px; width: 420px; height: 38px; padding: 0 12px; border-radius: 11px; background: #FFFFFF; border: 1px solid #DEDED9; color: #8E9197">''' + ic('search', 15) + sr('Search settings') + '''<input value="{{q}}" onChange="{{onQ}}" placeholder="Search settings — e.g. “password”, “WhatsApp”, “quiet hours”" style="border: 0; outline: none; background: transparent; font: inherit; font-size: 13px; color: #111214; width: 100%"></label>'''

checks = [('Database', 'Locked to the service key — the public key reads nothing', 'Good', '#19C37D'), ('Sign-in cookies', 'Signed with your own secret', 'Good', '#19C37D'), ('Error alerts', 'Tells you when something breaks', 'Check', '#8E9197'), ('Content rules', 'Report-only — switch to enforcing', 'Needs you', '#F5A524')]
left = dark_card(card_title('Security check', '<span>reads the live state · changes nothing</span>') + '<div style="flex-grow: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-content: end">' + ''.join(
    '<div style="border-radius: 12px; background: #1A1B1E; border: 1px solid #26282C; padding: 10px 12px"><div style="display: flex; align-items: center; gap: 8px; font-size: 13px"><span style="width: 8px; height: 8px; border-radius: 4px; background: %s"></span>%s<span style="margin-left: auto; font-size: 11px; color: %s">%s</span></div><div style="font-size: 11px; color: #8E9197; margin-top: 4px">%s</div></div>' % (c, n, c, s, d) for n, d, s, c in checks) + '</div>')
right = dark_card(card_title('Install COS as an app', '<span>nothing to download</span>') + '''<div style="flex-grow: 1; display: flex; align-items: flex-end; gap: 20px"><div style="flex-grow: 1"><div style="font-size: 22px; font-weight: 500; letter-spacing: -0.015em; line-height: 1.25">Its own window, icon and taskbar spot — on Windows, Mac or a phone.</div><div style="font-size: 12px; color: #8E9197; margin-top: 8px">It opens the live site, so there is nothing to keep up to date.</div></div><button type="button" style="height: 36px; padding: 0 16px; border-radius: 10px; border: 0; background: #F2F2F0; color: #111214; font-size: 13px; font-weight: 600; flex-shrink: 0">Install</button></div>''', texture='rings')

card_tpl = '''<div style="background: #FFFFFF; border-radius: 18px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; min-width: 0; animation: pop 200ms ease-out">
<div><div style="display: flex; align-items: center; gap: 8px"><span style="font-size: 15px; font-weight: 600; flex-grow: 1">{{c.title}}</span><span style="font-size: 11px; color: #A3A6AB">{{c.group}}</span></div><div style="font-size: 12px; color: #6E7177; margin-top: 3px; line-height: 1.45">{{c.desc}}</div></div>
<sc-for list="{{c.rows}}" as="r" hint-placeholder-count="3">
<sc-if value="{{r.isToggle}}" hint-placeholder-val="{{ true }}"><div style="display: flex; align-items: center; gap: 10px; font-size: 13px"><span style="flex-grow: 1">{{r.label}}</span><span style="width: 34px; height: 20px; border-radius: 10px; background: {{r.track}}; position: relative; flex-shrink: 0"><span style="position: absolute; top: 2px; left: {{r.knob}}; width: 16px; height: 16px; border-radius: 8px; background: #FFFFFF; box-shadow: 0 1px 2px rgba(0,0,0,0.2)"></span></span></div></sc-if>
<sc-if value="{{r.isField}}" hint-placeholder-val="{{ false }}"><div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); column-gap: 10px; align-items: center; font-size: 13px"><span style="color: #55585E">{{r.label}}</span><span style="height: 32px; border-radius: 9px; border: 1px solid #E4E4E0; display: flex; align-items: center; padding: 0 10px; color: {{r.vc}}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{r.value}}</span></div></sc-if>
<sc-if value="{{r.isChips}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-direction: column; gap: 6px"><span style="font-size: 12px; color: #55585E">{{r.label}}</span><div style="display: flex; flex-wrap: wrap; gap: 5px"><sc-for list="{{r.opts}}" as="o" hint-placeholder-count="3"><span style="height: 26px; padding: 0 9px; border-radius: 7px; border: 1px solid {{o.b}}; background: {{o.bg}}; color: {{o.fg}}; font-size: 11px; display: flex; align-items: center">{{o.l}}</span></sc-for></div></div></sc-if>
<sc-if value="{{r.isButtons}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-wrap: wrap; gap: 6px"><sc-for list="{{r.opts}}" as="o" hint-placeholder-count="2"><span style="height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid {{o.b}}; background: {{o.bg}}; color: {{o.fg}}; font-size: 12px; display: flex; align-items: center">{{o.l}}</span></sc-for></div></sc-if>
<sc-if value="{{r.isGrid}}" hint-placeholder-val="{{ false }}"><div style="display: grid; grid-template-columns: minmax(0, 1.6fr) repeat(5, minmax(0, 1fr)); gap: 4px; font-size: 11px; align-items: center"><span></span><sc-for list="{{r.head}}" as="h" hint-placeholder-count="5"><span style="color: #8E9197; text-align: center">{{h}}</span></sc-for><sc-for list="{{r.cells}}" as="x" hint-placeholder-count="12"><span style="text-align: {{x.al}}; color: {{x.c}}; font-size: {{x.fs}}">{{x.t}}</span></sc-for></div></sc-if>
</sc-for>
</div>'''

body = '''<div style="flex-grow: 1; min-height: 0; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center"><sc-for list="{{groups}}" as="g" hint-placeholder-count="7"><button type="button" onClick="{{g.pick}}" aria-pressed="{{g.on}}" style="height: 34px; padding: 0 14px; border-radius: 10px; border: 1px solid {{g.b}}; background: {{g.bg}}; color: {{g.fg}}; font-size: 13px; display: flex; align-items: center; gap: 8px">{{g.label}}<span style="font-size: 11px; opacity: 0.6">{{g.n}}</span></button></sc-for><span style="flex-grow: 1"></span><span style="font-size: 12px; color: #8E9197">{{found}}</span></div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-content: start">
<sc-for list="{{cards}}" as="c" hint-placeholder-count="6">''' + card_tpl + '''</sc-for>
</div></div>'''

inner = header('Settings', search, '<span style="font-size: 12px; color: #19A06A; display: flex; align-items: center; gap: 6px">' + ic('check', 13, 2.4) + 'Each section saves on its own</span>') + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 196px; flex-shrink: 0">' + left + right + '</div>' + body

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { g: 'general', q: '' }; }
  renderVals() {
    var S = this.state, self = this;
    var T = function (l, on) { return { t: 'toggle', l: l, on: on }; };
    var F = function (l, v, grey) { return { t: 'field', l: l, v: v, grey: grey }; };
    var C = function (l, opts, on) { return { t: 'chips', l: l, opts: opts, on: on }; };
    var B = function (opts, primary, danger) { return { t: 'buttons', opts: opts, primary: primary, danger: danger }; };
    var G = [
      ['general', 'General', [
        ['About you', 'Your name, as COS greets you and signs messages.', [F('Your name', 'As you like to be greeted', true)]],
        ['Risk rules', 'When a task counts as due soon, stalled or ageing.', [F('Due soon within', '3 days'), F('Stalled after', '14 days blocked'), F('Ageing after', 'Set in days', true)]],
        ['Financial year', 'The month your year starts — reports follow it.', [F('Starts in', 'July')]],
        ['Location & weather', 'For the weather chip on Home.', [F('City', 'Dar es Salaam'), F('Latitude · longitude', 'set from the city', true)]],
        ['Swipe actions', 'What a swipe does on a task row (phone).', [F('Swipe right', 'Choose an action', true), F('Swipe left', 'Choose an action', true)]],
        ['Pinned pages', 'Which pages sit first in Go to — reorder or remove.', [C('Pinned', ['Approvals', 'Outbox', 'Chat', '+ Add'], ['Approvals', 'Outbox', 'Chat'])]]]],
      ['ai', 'AI & Voice', [
        ['AI assistance', 'Reading, search and ORI — all on Gemini.', [T('Enable AI features', true), T('Higher-quality reading', false), T('Semantic search', false), F('Gemini key', 'Set here · replace or remove')]],
        ['Voice', 'Speak rough, save polished.', [C('Dictation language', ['English', 'Swahili', 'Hindi', 'Gujarati'], ['English']), F('Voice dictionary', 'Names COS should spell right', true)]],
        ['AI usage', 'Calls and tokens today, quota per model, the last 7 days.', [B(['Refresh'], []), F('Monthly spend cap', '0 = no limit', true)]]]],
      ['auto', 'Automation', [
        ['Automations', 'Auto, suggest or off — per kind of job.', [C('Complete fulfilled tasks', ['Auto', 'Suggest', 'Off'], []), C('Renewal and notice tasks', ['Auto', 'Suggest', 'Off'], []), F('Four more rules', 'Onboarding, applications, records…', true)]],
        ['Meetings & scheduling', 'What happens around a meeting.', [T('Create a task from a meeting', true), T('Move to In Progress when it starts', true), T('Ping attendees', false), T('Ask for the outcome afterwards', true)]],
        ['Tax & Legal', 'Recurring statutory work that spawns tasks.', [B(['Live', 'Pause'], ['Live'])]]]],
      ['portals', 'Portals', [
        ['Staff portal access', 'One door for every login: grant, change level, revoke.', [F('On the portal', '30 people'), B(['Give access', 'Find a person'], ['Give access'])]],
        ['Roles & permissions', 'Who sees what, and who may do what. (Example ticks.)', [{ t: 'grid' }]],
        ['Task nudges', 'The banner staff see when work stalls.', [T('Show the banner', true), F('Not started after', 'hours', true), F('No update after', 'days', true)]]]],
      ['email', 'Email & Integrations', [
        ['Email sending', 'Sender name, address and signature.', [F('Sender', 'Name and address', true), B(['Send a test'], [])]],
        ['Email automation', 'Paused — nothing goes out on its own.', [T('Test mode', false), C('Categories', ['Reminders', 'Safety net', 'Renewals', 'Weekly Brief', 'Morning digest', 'Probation'], []), B(['Resume', 'Send the Brief now', 'Run all now'], ['Resume'])]],
        ['WhatsApp', 'Messages and a test send.', [F('Test number', 'Pick a number', true), B(['Send test'], [])]],
        ['Google Calendar', 'Events sync to your Google calendar.', [B(['Reconnect', 'Disconnect'], [], ['Disconnect'])]]]],
      ['security', 'Security & Access', [
        ['Owner sign-in', 'Your name and email, and your password.', [F('Identity', 'Name + email (second factor)'), B(['Change password', 'Sign out here'], [])]],
        ['Face ID & fingerprint', 'Passkeys on each of your devices.', [B(['Add a device'], ['Add a device'])]],
        ['Claude access', 'Keys for Claude to read and act in COS.', [B(['Create a key', 'Connected assistants'], ['Create a key'])]]]],
      ['more', 'Notifications & More', [
        ['Notifications', 'Alerts on this device.', [B(['Turn on here', 'Send a test'], ['Turn on here'])]],
        ['Quiet hours & batching', 'Hold routine alerts overnight.', [F('Quiet from – to', 'Pick the hours', true), T('Batch routine alerts into a digest', true)]],
        ['Design gallery', 'Every building block in one place.', [B(['Open the gallery'], [])]],
        ['Maintenance', 'Rebuild task summaries if they look wrong.', [B(['Rebuild'], [], ['Rebuild'])]]]]
    ];
    var q = S.q.trim().toLowerCase();
    var mk = function (grp, c) {
      return { title: c[0], desc: c[1], group: q ? grp : '', rows: c[2].map(function (r) {
        var o = { isToggle: r.t === 'toggle', isField: r.t === 'field', isChips: r.t === 'chips', isButtons: r.t === 'buttons', isGrid: r.t === 'grid', label: r.l || '', value: r.v || '', vc: r.grey ? '#A3A6AB' : '#111214',
          track: r.on ? '#111214' : '#D6D6D2', knob: r.on ? '16px' : '2px' };
        if (r.t === 'chips') o.opts = r.opts.map(function (x) { var on = (r.on || []).indexOf(x) >= 0; return { l: x, b: on ? '#111214' : '#E4E4E0', bg: on ? '#111214' : '#FFFFFF', fg: on ? '#FFFFFF' : '#111214' }; });
        if (r.t === 'buttons') o.opts = r.opts.map(function (x) { var p = (r.primary || []).indexOf(x) >= 0, d = (r.danger || []).indexOf(x) >= 0; return { l: x, b: p ? '#111214' : (d ? '#F5C6DF' : '#E4E4E0'), bg: p ? '#111214' : '#FFFFFF', fg: p ? '#FFFFFF' : (d ? '#C2327F' : '#111214') }; });
        if (r.t === 'grid') { o.head = ['Staff', 'Manager', 'HR', 'Director', 'Reception']; o.cells = [];
          [['Sees', ['Own', 'Team', 'Companies', 'All', 'Own']], ['Post updates', ['✓', '✓', '✓', '✓', '✓']], ['Close tasks', ['—', '✓', '—', '✓', '—']], ['Create tasks', ['—', '✓', '✓', '✓', '—']], ['Cleaning log', ['—', '—', '—', '—', '✓']]].forEach(function (row) {
            o.cells.push({ t: row[0], al: 'left', c: '#111214', fs: '12px' }); row[1].forEach(function (v) { o.cells.push({ t: v, al: 'center', c: v === '—' ? '#C4C5C9' : '#111214', fs: '11px' }); }); }); }
        return o; }) };
    };
    var cards = [];
    G.forEach(function (g) { g[2].forEach(function (c) {
      if (q) { if ((c[0] + ' ' + c[1] + ' ' + g[1]).toLowerCase().indexOf(q) >= 0) cards.push(mk(g[1], c)); }
      else if (g[0] === S.g) cards.push(mk(g[1], c)); }); });
    return {
      cards: cards, q: S.q, onQ: function (e) { self.setState({ q: e.target.value }); },
      found: q ? cards.length + ' settings found' : '',
      groups: G.map(function (g) { var on = !q && g[0] === S.g; return { label: g[1], n: g[2].length, on: on, b: on ? '#111214' : '#DEDED9', bg: on ? '#111214' : '#FFFFFF', fg: on ? '#FFFFFF' : '#111214', pick: function () { self.setState({ g: g[0], q: '' }); } }; })
    };
  }
}
'''
write('Settings.dc.html', head('Settings') + frame(inner, 'Settings', 'New task', 'Needs you', 'Content rules are report-only') + tail(script))
