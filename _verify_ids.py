import re, glob
renpy = open('src/data/renpyEffects.ts', encoding='utf-8').read()
ids = set(re.findall(r"^\s*id:\s*'([^']+)'", renpy, re.M))
enc = set()
for f in glob.glob('src/data/effectEncyclopedia/enc_*.ts'):
    txt = open(f, encoding='utf-8').read()
    for m in re.findall(r"^\s*'?([\w-]+)'?\s*:\s*\{", txt, re.M):
        enc.add(m)
print("renpy ids:", len(ids))
print("enc keys:", len(enc))
print("IN RENPY NOT ENC:", sorted(ids - enc))
print("IN ENC NOT RENPY:", sorted(enc - ids))
