import cv2,json
from pathlib import Path
im=cv2.imread('logo_transparent.png',cv2.IMREAD_UNCHANGED)
a=im[:,:,3]; mask=(a>128).astype('uint8')*255
contours,h=cv2.findContours(mask,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
height,width=a.shape
items=[]
for i,c in enumerate(contours):
 if h[0][i][3]!=-1 or cv2.contourArea(c)<200: continue
 def points(c): return cv2.approxPolyDP(c,1.5,True).reshape(-1,2).tolist()
 holes=[];child=h[0][i][2]
 while child!=-1:
  holes.append(points(contours[child]));child=h[0][child][0]
 items.append({'outline':points(c),'holes':holes})
Path('public/logo-shape.json').write_text(json.dumps({'width':width,'height':height,'shapes':items}))
print('Traced source alpha:',width,height,'shapes:',len(items))
