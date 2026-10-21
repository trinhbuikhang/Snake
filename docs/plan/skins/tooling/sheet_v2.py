from PIL import Image, ImageDraw, ImageFont
V1='/workspace/snake-audit/snake-look/skins/'; V2='/workspace/snake-audit/snake-look/skins-v2/'
F=lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',n)
def fit(src,W,H):
    im=Image.open(src).convert('RGB'); r=max(W/im.width,H/im.height); im=im.resize((int(im.width*r),int(im.height*r)))
    l=(im.width-W)//2; t=(im.height-H)//2; return im.crop((l,t,l+W,t+H))
def sheet(out, rows, cols, W=720, H=480, TH=46):
    img=Image.new('RGB',(W*len(cols)+10*(len(cols)-1),TH+(H+40)*len(rows)),(18,18,22)); d=ImageDraw.Draw(img)
    for j,(c,_) in enumerate(cols): d.text((j*(W+10)+10,10),c,fill=(240,240,240),font=F(26))
    for i,(sk,con,label) in enumerate(rows):
        y=TH+i*(H+40); d.text((10,y+4),label,fill=(255,230,170),font=F(26))
        for j,(c,f) in enumerate(cols): img.paste(fit(f(sk,con),W,H),(j*(W+10),y+36))
    img.save(out,quality=88)
rows=[('moonJade','concept-moon-jade.jpg','Ngọc trăng · moonJade'),('plushMoon','concept-plush-moon.jpg','Gấu bông · plushMoon')]
sheet(V2+'skins-v2-vs-concept.jpg', rows, [
  ('concept', lambda s,c: V1+c), ('v1 close-head', lambda s,c: V1+f'{s}-close-head.png'),
  ('v2 close-head', lambda s,c: V2+f'{s}-close-head.png'), ('v2 default-cam', lambda s,c: V2+f'{s}-default-cam.png')])
sheet(V2+'gameplay-cam-before-after.jpg', rows, [
  ('BEFORE: v1 skin, old camera', lambda s,c: V1+f'{s}-default-cam.png'), ('AFTER: v2 skin, new camera', lambda s,c: V2+f'{s}-default-cam.png')], W=960, H=600)
