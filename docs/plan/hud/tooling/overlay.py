import json, sys
from PIL import Image, ImageDraw, ImageFont
label, outdir = sys.argv[1], sys.argv[2]
A = json.load(open(f'{outdir}/{label}.json'))
def font(s):
    try: return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
    except: return ImageFont.load_default()
for vid, a in A.items():
    im = Image.open(f'{outdir}/{label}-{vid}.png').convert('RGB')
    s = im.width / a['w']
    d = ImageDraw.Draw(im, 'RGBA')
    L = a['lines']
    for k, (p, q) in enumerate(L):
        edge = k in (0, 1, len(L) - 2, len(L) - 1)
        d.line([(p[0]*s, p[1]*s), (q[0]*s, q[1]*s)], fill=(255, 0, 255, 230 if edge else 60), width=max(1, int(s)) * (2 if edge else 1))
    for c in a['covered']:
        pass
    for r in a['rects']:
        d.rectangle([r['l']*s, r['t']*s, r['r']*s, r['b']*s], outline=(0, 210, 255, 255), width=max(2, int(s)))
    ov = a['overlaps']
    for o in ov:
        ra = next(r for r in a['rects'] if r['name'] == o['a']); rb = next(r for r in a['rects'] if r['name'] == o['b'])
        box = [max(ra['l'], rb['l'])*s, max(ra['t'], rb['t'])*s, min(ra['r'], rb['r'])*s, min(ra['b'], rb['b'])*s]
        d.rectangle(box, fill=(255, 40, 40, 110), outline=(255, 40, 40, 255), width=max(2, int(s)))
    F = font(int(13*s))
    lab = f"{label} {a['w']}x{a['h']}{' touch' if a['touch'] else ' mouse'}{' safe-area' if a.get('safe') else ''}\nHUD overlaps: {len(ov)}   cells covered: {a['coveredAny']}"
    d.rectangle([0, im.height - 38*s, im.width, im.height], fill=(0, 0, 0, 200))
    d.multiline_text((6*s, im.height - 36*s), lab, fill=(255, 80, 80) if (ov or a['coveredAny']) else (120, 255, 170), font=F, spacing=2)
    im.save(f'{outdir}/ov-{label}-{vid}.png')
