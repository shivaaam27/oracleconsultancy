from kit import *

# ---------- Shelf ----------
left = dark_card(card_title('Ask your notes', '<span>Answers only from what you wrote</span>') + '''
<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px">
<div style="display: flex; gap: 8px; align-items: center; height: 44px; padding: 0 6px 0 14px; border-radius: 12px; background: #1F2023; border: 1px solid #2E3035"><span style="color: #8E9197; display: flex">''' + ic('search', 15) + '''</span><span style="flex-grow: 1; font-size: 13px; color: #E6E6E3">What did I decide about the Cocozuri plan of action?</span><span style="height: 32px; padding: 0 12px; border-radius: 9px; background: #F2F2F0; color: #111214; font-size: 12px; font-weight: 600; display: flex; align-items: center">Ask</span></div>
<div style="font-size: 13px; color: #C9CBCF; line-height: 1.5">A full week plan for Dipto — minimum order level, raw materials, finished goods and packaging — marked in progress.</div>
<div style="display: flex; gap: 6px"><span style="height: 24px; padding: 0 9px; border-radius: 7px; background: #26282C; font-size: 11px; display: flex; align-items: center; gap: 6px">''' + ic('doc', 12) + '''02.08.2026 Updates</span><span style="height: 24px; padding: 0 9px; border-radius: 7px; background: #26282C; font-size: 11px; display: flex; align-items: center; gap: 6px">''' + ic('doc', 12) + '''Monday 31st August</span></div>
</div>''', texture='dots')

right = dark_card(card_title('Today’s page', '<span>Thursday 24 September</span>') + '''
<div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 12px">
<div style="font-size: 28px; font-weight: 500; letter-spacing: -0.02em">Nothing written today yet</div>
<div style="font-size: 13px; color: #A3A6AB">One page per day, opened from your daily template. Tick-box lines can become to-dos with a reminder.</div>
<div style="display: flex; gap: 8px"><a href="Note.dc.html" style="height: 34px; padding: 0 14px; border-radius: 10px; background: #F2F2F0; color: #111214; font-size: 13px; font-weight: 600; display: flex; align-items: center">Start today’s page</a><button type="button" style="height: 34px; padding: 0 14px; border-radius: 10px; border: 1px solid #34363B; background: transparent; color: #E6E6E3; font-size: 13px">Tidy 1 empty note</button></div>
</div>''', texture='rings')

cols = 'minmax(0, 1.1fr) minmax(0, 1.6fr) 120px 100px 28px'
rows = '''<div style="flex-grow: 1; min-height: 0; position: relative; display: flex; flex-direction: column">
<div style="display: grid; grid-template-columns: ''' + cols + '''; column-gap: 20px; padding: 0 20px 8px; font-size: 12px; color: #6E7177"><span>Note</span><span>Starts with</span><span>Folder</span><span style="color: #111214; font-weight: 500">Updated</span><span></span></div>
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 76px">
<sc-for list="{{notes}}" as="n" hint-placeholder-count="8"><a href="Note.dc.html" style="flex-shrink: 0; display: grid; grid-template-columns: ''' + cols + '''; column-gap: 20px; align-items: center; background: #FFFFFF; border-radius: 14px; padding: 13px 20px">
<span style="font-size: 15px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: {{n.tc}}">{{n.title}}</span>
<span style="font-size: 13px; color: #6E7177; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{{n.snip}}</span>
<span>''' + lpill('Unfiled') + '''</span>
<span style="font-size: 13px; color: #55585E">{{n.when}}</span>
<span style="color: #C4C5C9; display: flex">''' + ic('star', 16, 1.7) + '''</span></a></sc-for>
</div>
''' + bottom_bar('Search notes — words, #tags or @people', '<span style="width: 1px; height: 24px; background: #E4E4E0"></span><button type="button" style="height: 36px; padding: 0 12px; border-radius: 10px; border: 0; background: #F3F3F1; font-size: 12px; display: flex; align-items: center; gap: 6px">#tags ' + ic('down', 12) + '</button><button type="button" style="height: 36px; padding: 0 12px; border-radius: 10px; border: 0; background: #F3F3F1; font-size: 12px; display: flex; align-items: center; gap: 6px">Smart folders ' + ic('down', 12) + '</button>', 720) + '''
</div>'''

inner = header('Notes', '', seg_dyn('tabs') + ghost_btn('Today', 'cal') + ghost_btn('New folder', 'folder') + dark_btn('New note', href='Note.dc.html')) + \
    '<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; height: 232px; flex-shrink: 0">' + left + right + '</div>' + rows

script = r'''
class Component extends DCLogic {
  constructor(p) { super(p); this.state = { tab: 'all' }; }
  renderVals() {
    var S = this.state, self = this;
    var N = [
      ['Monday 31st August', 'Gymkhana Membership - Parin - done · Cocozuri Plan of Action and each raw material pricing', '1 Sept'],
      ['02.08.2026 Updates', 'Cocozuri Plan of action for Dipto - full week plan for him and company, minimum order level…', '3 Sept'],
      ['15.09', 'Ray handling licence - inform Hriday not to pay', '15 Sept'],
      ['Task', 'Calendar for all social media posts. Accountable: Juned, Shivam - done', '3 Sept'],
      ['Today’s Priorities — 20 Aug 2026', 'Board resolution Gift Sulle — permit / agent follow-up', '1 Sept'],
      ['Saturday Tasks', 'Cocozuri Website - finding new vendor but I will try to create it', '22 Aug'],
      ['Tasks & Reminders', 'Empty note', '1 Sept'],
      ['Untitled note', 'Empty note', '21 Sept']
    ];
    return {
      notes: N.map(function (n) { return { title: n[0], snip: n[1], when: n[2], tc: n[1] === 'Empty note' ? '#8E9197' : '#111214' }; }),
      tabs: segs([['all', 'All', 16], ['pin', 'Pinned', 0], ['unf', 'Unfiled', 16], ['arch', 'Archived', 4]], S.tab, function (k) { self.setState({ tab: k }); })
    };
  }
}
'''
write('Notes.dc.html', head('Notes') + frame(inner, 'Notes', 'New note', 'Last written', '15.09 · Ray handling licence') + tail(script))

# ---------- One note ----------
tb = [('B', 'Bold'), ('I', 'Italic'), ('U', 'Underline'), ('S', 'Strike')]
tool = lambda inner, label: '<button type="button" aria-label="%s" style="height: 30px; min-width: 30px; padding: 0 7px; border-radius: 8px; border: 0; background: transparent; font-size: 13px; display: flex; align-items: center; justify-content: center; color: #55585E">%s</button>' % (label, inner)
sep = '<span style="width: 1px; height: 18px; background: #E4E4E0; margin: 0 4px"></span>'
toolbar = ('<div style="display: flex; align-items: center; gap: 2px; padding: 8px 12px; border-bottom: 1px solid #F0F0EC; flex-shrink: 0">'
    + '<a href="Notes.dc.html" style="height: 30px; padding: 0 10px; border-radius: 8px; background: #F3F3F1; font-size: 12px; display: flex; align-items: center; gap: 6px">' + ic('left', 12, 2.2) + 'All notes</a>' + sep
    + tool(ic('undo', 14), 'Undo') + sep
    + '<span style="height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center; gap: 6px">Body ' + ic('down', 11) + '</span>' + sep
    + ''.join(tool('<b style="font-weight: 700">B</b>' if l == 'B' else ('<i>I</i>' if l == 'I' else ('<u>U</u>' if l == 'U' else '<s>S</s>')), n) for l, n in tb)
    + tool(ic('link', 14), 'Link') + sep + tool(ic('list', 14), 'Bulleted list') + tool(ic('tick-box', 14), 'Checklist') + tool('“', 'Quote') + tool('&lt;/&gt;', 'Code') + tool('—', 'Divider') + sep + tool(ic('clip', 14), 'Attach')
    + '<span style="flex-grow: 1"></span><span style="font-size: 12px; color: #19A06A; display: flex; align-items: center; gap: 6px"><span style="width: 6px; height: 6px; border-radius: 3px; background: #19C37D"></span>Saved</span>' + sep + tool(ic('expand', 14), 'Full screen (⌘⇧F)') + '</div>')

def todo(text, done=False, promoted=None):
    boxs = '<span style="width: 18px; height: 18px; border-radius: 5px; background: #111214; color: #FFFFFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px">%s</span>' % ic('check', 12, 3) if done else '<span style="width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #CFCFCA; flex-shrink: 0; margin-top: 2px"></span>'
    p = '<span style="margin-left: 10px; height: 22px; padding: 0 8px; border-radius: 6px; background: #EEF6FE; color: #1B6FC0; font-size: 11px; display: inline-flex; align-items: center; gap: 4px">%s%s</span>' % (ic('bell', 11), promoted) if promoted else ''
    return '<div style="display: flex; gap: 12px; font-size: 16px; line-height: 1.6; color: %s; text-decoration: %s">%s<span>%s%s</span></div>' % ('#8E9197' if done else '#111214', 'line-through' if done else 'none', boxs, text, p)

paper = '''<div style="flex-grow: 1; min-width: 0; background: #FFFFFF; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden">''' + toolbar + '''
<div style="flex-grow: 1; min-height: 0; overflow-y: auto; padding: 36px 64px 40px; position: relative">
<div style="display: flex; gap: 8px; margin-bottom: 14px">''' + lpill('Unfiled') + lpill('Daily page') + '''<span style="font-size: 12px; color: #A3A6AB; align-self: center">Updated 1 Sept</span></div>
<div style="font-size: 38px; font-weight: 500; letter-spacing: -0.03em; margin-bottom: 20px">Monday 31st August</div>
<div style="display: flex; flex-direction: column; gap: 6px">
''' + todo('Gymkhana Membership - Parin', True) + todo('Cocozuri Plan of Action and each raw material pricing', False, 'On your to-dos · tomorrow') + '''
<div style="position: relative; display: flex; gap: 12px; font-size: 16px; line-height: 1.6; background: #F6F8FB; margin: 0 -10px; padding: 2px 10px; border-radius: 8px"><span style="width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #CFCFCA; flex-shrink: 0; margin-top: 2px"></span><span>Stock taking at PES godown? - end of month</span><span style="margin-left: auto; height: 24px; padding: 0 9px; border-radius: 7px; background: #111214; color: #FFFFFF; font-size: 11px; display: flex; align-items: center; gap: 5px; align-self: center">''' + ic('plus', 11, 2.4) + '''Make a to-do</span></div>
''' + todo('Jatin Money Recovery? - <span style="background: #F1ECFE; color: #6D3FD8; border-radius: 5px; padding: 0 5px">@Pulin Manek</span>') + '''
<div style="font-size: 16px; line-height: 1.6; color: #111214; margin-top: 12px">Linked: <span style="background: #F3F3F1; border-radius: 5px; padding: 0 6px; font-family: 'Geist Mono', monospace; font-size: 13px">OC-044</span> Jateen Money Recovery · <span style="color: #1B6FC0">[[Today’s Priorities — 20 Aug 2026]]</span></div>
<div style="font-size: 16px; line-height: 1.6; color: #111214; margin-top: 12px">/<span style="display: inline-block; width: 2px; height: 18px; background: #2490EF; vertical-align: -3px"></span></div>
<div style="position: absolute; left: 64px; top: 356px; width: 280px; background: #FFFFFF; border-radius: 14px; box-shadow: 0 16px 40px rgba(17,18,20,0.16); border: 1px solid #EFEFEB; padding: 6px; font-size: 13px">
<div style="font-size: 11px; color: #8E9197; padding: 6px 8px">Blocks</div>
<div style="padding: 7px 8px; border-radius: 8px; background: #F3F3F1; display: flex; gap: 10px; align-items: center">''' + ic('tick-box', 14) + '''Checklist</div>
<div style="padding: 7px 8px; display: flex; gap: 10px; align-items: center">''' + ic('grid', 14) + '''Table</div>
<div style="padding: 7px 8px; display: flex; gap: 10px; align-items: center">''' + ic('spark', 14) + '''Callout</div>
<div style="font-size: 11px; color: #8E9197; padding: 6px 8px">Insert</div>
<div style="padding: 7px 8px; display: flex; gap: 10px; align-items: center">''' + ic('cal', 14) + '''Today’s date</div>
<div style="padding: 7px 8px; display: flex; gap: 10px; align-items: center">''' + ic('link', 14) + '''Link a record (@)</div>
<div style="padding: 7px 8px; display: flex; gap: 10px; align-items: center">''' + ic('doc', 14) + '''Link a note ([[ ]])</div>
</div>
</div></div></div>'''

ai = dark_card('<div style="font-size: 13px; color: #A3A6AB">ORI on this note</div><div style="font-size: 12px; color: #8E9197; margin-top: 4px">Every result is a proposal. A version is saved before anything changes.</div><div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 12px">' +
    ''.join('<button type="button" style="height: 34px; border-radius: 9px; border: 1px solid #2E3035; background: #1A1B1E; color: #F2F2F0; font-size: 12px; display: flex; align-items: center; gap: 6px; padding: 0 10px">%s%s</button>' % (ic(i, 13), l) for i, l in [('wand', 'Tidy the writing'), ('list', 'Summarise'), ('check', 'Find the jobs'), ('pencil', 'Name it'), ('link', 'Suggest links'), ('history', 'Versions')]) + '</div>', 'padding: 16px', 'contour')
todos = white_card(wcard_title('To-dos', '<span>1 from this note</span>') + '<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px"><div style="display: flex; gap: 10px; align-items: center; font-size: 13px"><span style="width: 16px; height: 16px; border-radius: 5px; border: 1.5px solid #CFCFCA"></span><span style="flex-grow: 1">Cocozuri Plan of Action…</span><span style="font-size: 11px; color: #8E9197">Tomorrow</span></div><div style="font-size: 12px; color: #8E9197; margin-top: 4px">Remind me about this note: Tomorrow · Monday · In a week · pick a time</div></div>', 'padding: 16px')
links = white_card(wcard_title('Links', '<span>derived from the writing</span>') + '<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px; font-size: 13px"><div style="display: flex; gap: 8px; align-items: center">' + ic('user', 13) + 'Pulin Manek</div><div style="display: flex; gap: 8px; align-items: center">' + ic('check', 13) + 'OC-044 Jateen Money Recovery</div><div style="display: flex; gap: 8px; align-items: center">' + ic('doc', 13) + 'Today’s Priorities — 20 Aug 2026</div><div style="font-size: 12px; color: #8E9197">Backlinks · 1 note mentions this one</div></div>', 'padding: 16px')
versions = white_card(wcard_title('Versions') + '<div style="font-size: 12px; color: #6E7177; margin-top: 6px; line-height: 1.5">Taken before an AI rewrite, before a template, or when you ask. Putting one back saves the current text first.</div><div style="display: flex; gap: 8px; margin-top: 12px"><span style="height: 30px; padding: 0 12px; border-radius: 9px; background: #111214; color: #FFFFFF; font-size: 12px; display: flex; align-items: center">Save a version</span><span style="height: 30px; padding: 0 12px; border-radius: 9px; border: 1px solid #E4E4E0; font-size: 12px; display: flex; align-items: center">See all</span></div>', 'padding: 16px; flex-grow: 1', 'paper-rings')
rail = '<div style="width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px">' + ai + todos + links + versions + '</div>'

top = '''<div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0">''' + chip('Folder', ' · Unfiled') + ghost_btn('Pin', 'star') + ghost_btn('Use a template', 'doc') + ghost_btn('Make a template', 'copy') + ghost_btn('Use for daily pages', 'cal') + '<span style="flex-grow: 1"></span>' + ghost_btn('Archive', 'box') + '</div>'
inner2 = top + '<div style="flex-grow: 1; min-height: 0; display: flex; gap: 20px">' + paper + rail + '</div>'
write('Note.dc.html', head('Notes — one note') + frame(inner2, 'Notes', 'New note', 'Writing in', 'Monday 31st August · autosaves as you type', pad='20px 20px 20px', gap=16) + tail('class Component extends DCLogic { renderVals() { return {}; } }'))
