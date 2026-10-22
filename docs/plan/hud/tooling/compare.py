import json
from PIL import Image, ImageDraw, ImageFont
B = json.load(open('shots/before.json')); A = json.load(open('shots/after.json'))
F = lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
def pane(label, vid, scale, overlay=False):
    src = f'shots/{"ov-" if overlay else ""}{label}-{vid}.png'
    d = (B if label == 'before' else A)[vid]
    im = Image.open(src).convert('RGB'); im = im.resize((int(d['w'] * scale), int(d['h'] * scale)), Image.LANCZOS)
    k = min(1.0, im.width / 390)
    head = int(54 * k) + 4
    out = Image.new('RGB', (im.width, im.height + head), (18, 18, 28)); out.paste(im, (0, head))
    dr = ImageDraw.Draw(out)
    bad = d['overlaps'] or d['coveredAny']
    title = ('TRƯỚC (master)' if label == 'before' else 'SAU (prototype)') + f'  {d["w"]}×{d["h"]}' + (' touch' if d['touch'] else ' chuột')
    dr.text((6, 4), title, fill=(255, 255, 255), font=F(max(9, int(17 * k))))
    dr.text((6, 4 + int(23 * k)), f'HUD chồng nhau: {len(d["overlaps"])} · ô bàn bị che: {d["coveredAny"]}', fill=(255, 110, 110) if bad else (130, 255, 180), font=F(max(8, int(15 * k))))
    return out
def grid(rows, gap=10, bg=(255, 255, 255)):
    W = max(sum(p.width for p in r) + gap * (len(r) - 1) for r in rows); H = sum(max(p.height for p in r) for r in rows) + gap * (len(rows) - 1)
    c = Image.new('RGB', (W, H), bg); y = 0
    for r in rows:
        x = 0
        for p in r: c.paste(p, (x, y)); x += p.width + gap
        y += max(p.height for p in r) + gap
    return c
s = 1.0
grid([[pane('before', 'p390', s), pane('after', 'p390', s), pane('before', 'teams375', s), pane('after', 'teams375', s)]]).save('compare-portrait.jpg', quality=82)
grid([[pane('before', 'p390', s, True), pane('after', 'p390', s, True), pane('before', 'p375', s, True), pane('after', 'p375', s, True)]]).save('compare-portrait-overlay.jpg', quality=82)
grid([[pane('before', 'l844t', 0.8, True), pane('after', 'l844t', 0.8, True)], [pane('before', 'l844m', 0.8, True), pane('after', 'l844m', 0.8, True)], [pane('before', 'l844safe', 0.8, True), pane('after', 'l844safe', 0.8, True)]]).save('compare-landscape.jpg', quality=82)
grid([[pane('before', 'd1280', 0.55, True), pane('after', 'd1280', 0.55, True)]]).save('compare-desktop.jpg', quality=82)
# owner-facing one-pager
top = grid([[pane('before', 'p390', 0.9), pane('after', 'p390', 0.9), pane('before', 'teams375', 0.9), pane('after', 'teams375', 0.9)]])
bot = grid([[pane('before', 'l844m', 0.85, True), pane('after', 'l844m', 0.85, True)]])
grid([[top], [bot]]).save('compare.jpg', quality=82)
# pause sheet
p = [Image.open(f'shots/{l}-paused-p390.png').convert('RGB').resize((390, 844)) for l in ('before', 'after')]
c = Image.new('RGB', (790, 844), 'white'); c.paste(p[0], (0, 0)); c.paste(p[1], (400, 0)); c.save('pause-sheet.jpg', quality=82)

order = ['p390', 'p375', 'p414', 'teams375', 'p390safe']; land = ['l844t', 'l844safe', 'l844m', 'd1280']
for lab in ['before', 'after']:
    grid([[pane(lab, v, 0.62, True) for v in order], [pane(lab, v, 0.5 if v == 'd1280' else 0.62, True) for v in land]]).save(f'all-{lab}.jpg', quality=78)
