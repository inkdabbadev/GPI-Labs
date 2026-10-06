"""Derive web assets from the supplied logo_transparent.png (requires OpenCV).

- public/textures/logo-face.png : 2048px-wide face texture for the 3D sculpture.
  Same aspect as the source so UVs computed against the source map 1:1.
  Transparent pixels are filled with neighbouring colour so the extruded
  face never shows a white or black fringe at its edges.
- public/logo-mark.png : cropped transparent mark for the header and fallback.
- app/icon.png         : square favicon.
"""
import cv2
import numpy as np
from pathlib import Path

src = cv2.imread('logo_transparent.png', cv2.IMREAD_UNCHANGED)
h, w = src.shape[:2]
alpha = src[:, :, 3]

# Face texture
tw = 2048
th = round(h * tw / w)
small = cv2.resize(src, (tw, th), interpolation=cv2.INTER_AREA)
rgb = small[:, :, :3].copy()
mask = (small[:, :, 3] < 250).astype('uint8')
filled = rgb.copy()
known = (1 - mask).astype(bool)
# Iterative colour bleed outward from opaque pixels
for _ in range(24):
    dil = cv2.dilate(filled, np.ones((3, 3), np.uint8))
    grown = cv2.dilate(known.astype('uint8'), np.ones((3, 3), np.uint8)).astype(bool)
    edge = grown & ~known
    # average of known neighbours for smoother bleed
    acc = cv2.blur(np.where(known[..., None], filled, 0).astype(np.float32), (3, 3))
    cnt = cv2.blur(known.astype(np.float32), (3, 3))[..., None]
    avg = (acc / np.maximum(cnt, 1e-6)).astype(np.uint8)
    filled[edge] = avg[edge]
    known = grown
filled[~known] = (40, 40, 40)
Path('public/textures').mkdir(parents=True, exist_ok=True)
cv2.imwrite('public/textures/logo-face.png', filled, [cv2.IMWRITE_PNG_COMPRESSION, 9])

# Cropped mark
ys, xs = np.where(alpha > 8)
pad = 40
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, w)
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, h)
crop = src[y0:y1, x0:x1]
mw = 640
mark = cv2.resize(crop, (mw, round(crop.shape[0] * mw / crop.shape[1])), interpolation=cv2.INTER_AREA)
cv2.imwrite('public/logo-mark.png', mark, [cv2.IMWRITE_PNG_COMPRESSION, 9])

# White header mark: every opaque pixel becomes white and the white "LAB" lettering becomes a cut-out,
# so the mark (including the dot) reads clearly on the dark scene.
whiteness = np.clip((mark[:, :, :3].min(axis=2).astype(np.float32) - 170) / 60, 0, 1)
white = np.zeros_like(mark)
white[:, :, :3] = 255
white[:, :, 3] = (mark[:, :, 3].astype(np.float32) * (1 - whiteness)).astype(np.uint8)
cv2.imwrite('public/logo-white.png', white, [cv2.IMWRITE_PNG_COMPRESSION, 9])

# Square icon
side = max(crop.shape[:2])
square = np.zeros((side, side, 4), np.uint8)
oy, ox = (side - crop.shape[0]) // 2, (side - crop.shape[1]) // 2
square[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
cv2.imwrite('app/icon.png', cv2.resize(square, (256, 256), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('face', tw, th, 'mark', mark.shape[1], mark.shape[0], 'icon 256')
