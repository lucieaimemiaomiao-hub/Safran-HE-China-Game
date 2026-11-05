#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 assets/logo/safran_logo.png —— Safran 风格占位 Logo（透明背景 PNG）。
正式上线时用企业官方 Logo 覆盖此文件即可，无需改代码。
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "assets", "logo", "safran_logo.png")
W, H = 720, 200
SS = 3

BLUE = (0, 61, 165)
SKY = (0, 174, 239)
WHITE = (255, 255, 255)


def font(size, bold=True):
    cands = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for p in cands:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main():
    img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    w, h = W * SS, H * SS

    # ---- 左侧旋涡标志（简化 S 造型，两段圆弧） ----
    ox, oy = h * 0.52, h * 0.5
    r_out = h * 0.40
    r_in = h * 0.20
    d.arc([ox - r_out, oy - r_out, ox + r_out, oy + r_out], 300, 140,
          fill=BLUE + (255,), width=int(h * 0.115))
    d.arc([ox - r_in, oy - r_in, ox + r_in, oy + r_in], 130, 340,
          fill=SKY + (255,), width=int(h * 0.115))

    # ---- 右侧文字 SAFRAN ----
    f = font(int(h * 0.44))
    text = "SAFRAN"
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = ox + r_out + h * 0.22
    ty = oy - th / 2 - bbox[1]
    # 字间距
    spacing = int(h * 0.045)
    cx = tx
    for ch in text:
        d.text((cx, ty), ch, font=f, fill=BLUE + (255,))
        cx += d.textlength(ch, font=f) + spacing
    # 下方橙色下划弧线
    lw = (cx - spacing) - tx
    d.arc([tx, oy + h * 0.10, tx + lw, oy + h * 0.52], 200, 340,
          fill=(240, 140, 40, 255), width=int(h * 0.055))

    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT, "PNG", optimize=True)
    print("logo ->", OUT)


if __name__ == "__main__":
    main()
