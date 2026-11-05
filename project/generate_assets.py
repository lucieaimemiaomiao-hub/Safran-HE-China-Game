#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 Safran Match Heroes Demo 用的占位卡通头像（001.png ~ 034.png）
风格参考线框图：圆形彩色底 + Q版人物（大头、小身体、简单五官）。
每个头像基于 index 确定性生成，保证可重复。
"""
import math
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "assets", "avatars")
SIZE = 512
SS = 4  # 超采样倍数，保证边缘平滑

# 34 组配色方案： (背景色1, 背景色2, 头发色, 肤色, 衣服色, 是否有眼镜, 发型)
SKINS = [
    (255, 226, 205), (255, 218, 190), (250, 205, 175), (240, 195, 165),
    (255, 232, 214), (235, 186, 152), (255, 224, 200), (222, 170, 138),
]
HAIRS = [
    (60, 42, 38), (35, 28, 30), (120, 78, 42), (90, 55, 30),
    (45, 45, 60), (200, 160, 90), (70, 60, 55), (30, 25, 25),
]
CLOTHS = [
    (0, 61, 165), (0, 174, 239), (235, 125, 32), (46, 125, 50),
    (140, 36, 60), (96, 64, 160), (0, 120, 155), (200, 60, 90),
]
BG_PAIRS = [
    ((0, 61, 165), (0, 174, 239)), ((0, 174, 239), (110, 205, 250)),
    ((255, 255, 255), (225, 240, 252)), ((245, 247, 250), (210, 230, 248)),
    ((255, 214, 102), (255, 170, 60)), ((120, 200, 160), (60, 160, 130)),
    ((170, 150, 240), (120, 95, 210)), ((250, 150, 160), (230, 95, 115)),
    ((120, 190, 240), (40, 120, 200)), ((190, 200, 215), (140, 155, 180)),
    ((255, 190, 90), (240, 140, 40)), ((130, 190, 235), (70, 145, 205)),
]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def draw_avatar(idx: int) -> Image.Image:
    """按序号绘制一张 Q 版头像。"""
    S = SIZE * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    b1, b2 = BG_PAIRS[idx % len(BG_PAIRS)]
    skin = SKINS[idx % len(SKINS)]
    hair = HAIRS[(idx // 2) % len(HAIRS)]
    cloth = CLOTHS[idx % len(CLOTHS)]
    has_glasses = idx % 5 == 2
    hairstyle = idx % 4  # 0 短碎发 1 长发 2 丸子头 3 中分

    # ---------- 背景圆形（径向渐变） ----------
    bg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bg)
    steps = 60
    for i in range(steps, 0, -1):
        r = S * 0.5 * i / steps
        t = 1 - (i - 1) / steps
        col = lerp(b1, b2, t)
        bd.ellipse([S / 2 - r, S / 2 - r, S / 2 + r, S / 2 + r], fill=col + (255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
    img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)

    cx = S / 2
    # ---------- 身体 / 衣服 ----------
    body_top = S * 0.74
    d.ellipse([cx - S * 0.30, body_top, cx + S * 0.30, body_top + S * 0.46], fill=cloth + (255,))
    # 领口
    d.ellipse([cx - S * 0.10, body_top - S * 0.02, cx + S * 0.10, body_top + S * 0.13],
              fill=lerp(cloth, (255, 255, 255), 0.75) + (255,))

    # ---------- 头发后层 ----------
    head_r = S * 0.27
    head_cy = S * 0.45
    if hairstyle == 1:  # 长发：后层大弧 + 两侧发缕（避免糊住下巴）
        d.ellipse([cx - head_r * 1.22, head_cy - head_r * 1.05,
                   cx + head_r * 1.22, head_cy + head_r * 1.30], fill=hair + (255,))
        for sx in (-1, 1):
            d.ellipse([cx + sx * head_r * 1.22 - head_r * 0.30, head_cy - head_r * 0.30,
                       cx + sx * head_r * 1.22 + head_r * 0.30, head_cy + head_r * 1.35],
                      fill=hair + (255,))
    elif hairstyle == 2:  # 丸子头
        d.ellipse([cx - head_r * 0.30, head_cy - head_r * 1.55,
                   cx + head_r * 0.30, head_cy - head_r * 0.95], fill=hair + (255,))

    # ---------- 脸 ----------
    d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=skin + (255,))
    # 耳朵
    d.ellipse([cx - head_r * 1.09, head_cy + head_r * 0.08,
               cx - head_r * 0.87, head_cy + head_r * 0.36], fill=skin + (255,))
    d.ellipse([cx + head_r * 0.87, head_cy + head_r * 0.08,
               cx + head_r * 1.09, head_cy + head_r * 0.36], fill=skin + (255,))

    # ---------- 前额头发 ----------
    if hairstyle == 3:  # 中分
        d.pieslice([cx - head_r * 1.04, head_cy - head_r * 1.06,
                    cx + head_r * 1.04, head_cy + head_r * 0.42], 180, 360, fill=hair + (255,))
        d.polygon([(cx - head_r * 0.55, head_cy - head_r * 0.72),
                   (cx, head_cy - head_r * 0.60),
                   (cx + head_r * 0.55, head_cy - head_r * 0.72),
                   (cx + head_r * 0.75, head_cy - head_r * 1.02),
                   (cx - head_r * 0.75, head_cy - head_r * 1.02)], fill=hair + (255,))
    elif hairstyle == 2:  # 丸子头 + 齐刘海
        d.pieslice([cx - head_r * 1.06, head_cy - head_r * 1.08,
                    cx + head_r * 1.06, head_cy + head_r * 0.22], 180, 360, fill=hair + (255,))
    else:  # 短碎发
        d.pieslice([cx - head_r * 1.06, head_cy - head_r * 1.10,
                    cx + head_r * 1.06, head_cy + head_r * 0.18], 180, 360, fill=hair + (255,))
        # 碎发尖
        for k in range(4):
            x = cx - head_r * 0.78 + k * head_r * 0.52
            d.polygon([(x - head_r * 0.16, head_cy - head_r * 0.72),
                       (x + head_r * 0.16, head_cy - head_r * 0.72),
                       (x + head_r * 0.05, head_cy - head_r * 0.40)], fill=hair + (255,))

    # 长发前刘海（避免额头空白）
    if hairstyle == 1:
        d.pieslice([cx - head_r * 1.06, head_cy - head_r * 1.10,
                    cx + head_r * 1.06, head_cy + head_r * 0.02], 180, 360, fill=hair + (255,))

    # ---------- 眉毛 ----------
    brow_y = head_cy - head_r * 0.10
    for sx in (-1, 1):
        bx = cx + sx * head_r * 0.40
        d.arc([bx - head_r * 0.20, brow_y - head_r * 0.10,
               bx + head_r * 0.20, brow_y + head_r * 0.10], 200, 340, fill=hair + (255,), width=int(S * 0.018))

    # ---------- 眼睛 ----------
    eye_y = head_cy + head_r * 0.10
    for sx in (-1, 1):
        ex = cx + sx * head_r * 0.40
        d.ellipse([ex - head_r * 0.11, eye_y - head_r * 0.145,
                   ex + head_r * 0.11, eye_y + head_r * 0.145], fill=(255, 255, 255, 255))
        d.ellipse([ex - head_r * 0.065, eye_y - head_r * 0.095,
                   ex + head_r * 0.065, eye_y + head_r * 0.095], fill=(45, 38, 40, 255))
        d.ellipse([ex - head_r * 0.02, eye_y - head_r * 0.06,
                   ex + head_r * 0.035, eye_y - head_r * 0.005], fill=(255, 255, 255, 255))

    # ---------- 腮红 ----------
    for sx in (-1, 1):
        bx = cx + sx * head_r * 0.68
        d.ellipse([bx - head_r * 0.13, eye_y + head_r * 0.10,
                   bx + head_r * 0.13, eye_y + head_r * 0.24], fill=(255, 160, 160, 90))

    # ---------- 鼻子 + 嘴 ----------
    d.arc([cx - head_r * 0.07, head_cy + head_r * 0.16,
           cx + head_r * 0.07, head_cy + head_r * 0.32], 30, 150, fill=(205, 150, 130, 255), width=int(S * 0.012))
    d.arc([cx - head_r * 0.22, head_cy + head_r * 0.26,
           cx + head_r * 0.22, head_cy + head_r * 0.52], 20, 160, fill=(150, 60, 60, 255), width=int(S * 0.022))

    # ---------- 眼镜 ----------
    if has_glasses:
        gw = int(S * 0.020)
        for sx in (-1, 1):
            ex = cx + sx * head_r * 0.40
            d.ellipse([ex - head_r * 0.20, eye_y - head_r * 0.21,
                       ex + head_r * 0.20, eye_y + head_r * 0.21], outline=(60, 60, 70, 255), width=gw)
        d.line([cx - head_r * 0.20, eye_y, cx + head_r * 0.20, eye_y], fill=(60, 60, 70, 255), width=gw)

    # ---------- 耳朵上方的小装饰（安全帽风格，仅少数） ----------
    if idx % 7 == 3:
        d.ellipse([cx - head_r * 1.12, head_cy - head_r * 1.42,
                   cx + head_r * 1.12, head_cy - head_r * 0.70], fill=(255, 196, 0, 255))
        d.rectangle([cx - head_r * 1.20, head_cy - head_r * 0.92,
                     cx + head_r * 1.20, head_cy - head_r * 0.78], fill=(240, 170, 0, 255))

    return img.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for i in range(1, 35):
        img = draw_avatar(i)
        path = os.path.join(OUT_DIR, "%03d.png" % i)
        img.save(path, "PNG", optimize=True)
    print("generated 34 avatars ->", OUT_DIR)


if __name__ == "__main__":
    main()
