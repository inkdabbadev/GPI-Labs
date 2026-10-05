(() => {
  'use strict';
  const root = document.querySelector('.experience');
  const canvas = document.querySelector('#sculpture');
  const ctx = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.querySelector('#motion');
  const modeButtons = [...document.querySelectorAll('.mode')];
  const configurations = {
    art: { color: [210, 243, 155], description: 'An unexpected form.<br> An unforgettable feeling.' },
    light: { color: [255, 201, 154], description: 'A little light.<br> A completely different world.' },
    technology: { color: [143, 179, 255], description: 'Beyond what is.<br> Into what could be.' }
  };
  let mode = 'art', running = !reduced.matches, frameId = 0;
  let width = 1, height = 1, angle = .4, tilt = -.38, targetTilt = -.38, targetAngle = .4;
  let lastTime = 0, elapsed = 0, dragging = false, lastPointer, dragDistance = 0;
  let geometry = [], currentGeometry = [], faces = [], transition = 1;
  let tint = [...configurations.art.color];
  const rows = matchMedia('(max-width:760px)').matches ? 120 : 160;
  const columns = 28;
  const TAU = Math.PI * 2;
  const normalize = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  function curve(t, name) {
    if (name === 'light') return [2.05*Math.cos(t), 2.05*Math.sin(t), .56*Math.sin(3*t)];
    if (name === 'technology') { const r = 1.72 + .57*Math.cos(4*t); return [r*Math.cos(t), r*Math.sin(t), .62*Math.sin(4*t)]; }
    const r = 1.62 + .64*Math.cos(3*t);
    return [r*Math.cos(2*t), r*Math.sin(2*t), .76*Math.sin(3*t)];
  }
  function makeGeometry(name) {
    const result = [];
    for (let i=0;i<rows;i++) {
      const t=i/rows*TAU, p=curve(t,name), next=curve(t+.001,name);
      const tangent=normalize(next.map((v,j)=>v-p[j]));
      const normal=normalize(cross(tangent,[0,0,1]));
      const binormal=normalize(cross(tangent,normal));
      const tube=name==='art'?.49:name==='light'?.61:.44;
      for(let j=0;j<columns;j++) {
        const v=j/columns*TAU;
        const n=normal.map((a,k)=>a*Math.cos(v)+binormal[k]*Math.sin(v));
        result.push({p:p.map((a,k)=>a+tube*n[k]), n});
      }
    }
    return result;
  }
  if (ctx) {
    geometry=makeGeometry(mode); currentGeometry=geometry.map(v=>({p:[...v.p],n:[...v.n]}));
    for(let i=0;i<rows;i++) for(let j=0;j<columns;j++) faces.push([i*columns+j,((i+1)%rows)*columns+j,((i+1)%rows)*columns+(j+1)%columns,i*columns+(j+1)%columns]);
  } else document.querySelector('.artwork-fallback').hidden = false;
  // GPU lighting interpolates the surface normals per pixel for a smooth metal finish.
  let program, positionBuffer, normalBuffer, uniforms, meshDirty = true;
  if (ctx) {
    const vertexSource = `
      attribute vec3 aPosition; attribute vec3 aNormal;
      uniform float uAngle, uTilt, uScale, uAspect;
      varying vec3 vNormal; varying vec3 vPosition;
      vec3 rotate(vec3 p) {
        float ca=cos(uAngle), sa=sin(uAngle), ct=cos(uTilt), st=sin(uTilt);
        vec3 q=vec3(p.x*ca+p.z*sa,p.y,-p.x*sa+p.z*ca);
        return vec3(q.x,q.y*ct-q.z*st,q.y*st+q.z*ct);
      }
      void main() {
        vec3 p=rotate(aPosition); vPosition=p; vNormal=rotate(aNormal);
        float perspective=8.0/(8.0-p.z);
        gl_Position=vec4(p.x*uScale/uAspect*perspective,-p.y*uScale*perspective+0.06,-p.z/8.0,1.0);
      }`;
    const fragmentSource = `
      precision mediump float;
      varying vec3 vNormal; varying vec3 vPosition; uniform vec3 uTint;
      void main() {
        vec3 n=normalize(vNormal);
        float diffuse=max(0.0,dot(n,normalize(vec3(-0.6,-0.8,1.0))));
        float rim=pow(1.0-abs(n.z),2.0);
        float spec=pow(max(0.0,dot(n,normalize(vec3(0.9,0.3,0.5)))),45.0);
        float band=pow(max(0.0,cos(n.y*5.1+n.x*2.4+0.8)),12.0);
        float secondary=pow(max(0.0,cos(n.y*3.0-n.x*4.0-1.5)),28.0)*0.3;
        vec3 metal=mix(vec3(0.73,0.77,0.69),uTint,0.28+rim*0.35);
        vec3 color=metal*(0.075+diffuse*0.38+rim*0.15)+vec3(0.96,1.0,0.93)*band*0.9+uTint*secondary+vec3(1.0)*spec*0.7;
        gl_FragColor=vec4(color,1.0);
      }`;
    function shader(type,source) {
      const sh=ctx.createShader(type);ctx.shaderSource(sh,source);ctx.compileShader(sh);
      if(!ctx.getShaderParameter(sh,ctx.COMPILE_STATUS)) throw new Error('Unable to compile sculpture shader');
      return sh;
    }
    try {
      program=ctx.createProgram();ctx.attachShader(program,shader(ctx.VERTEX_SHADER,vertexSource));ctx.attachShader(program,shader(ctx.FRAGMENT_SHADER,fragmentSource));ctx.linkProgram(program);
      if(!ctx.getProgramParameter(program,ctx.LINK_STATUS))throw new Error('Unable to initialize sculpture');
      ctx.useProgram(program);ctx.enable(ctx.DEPTH_TEST);ctx.clearColor(0,0,0,0);
      positionBuffer=ctx.createBuffer();normalBuffer=ctx.createBuffer();
      uniforms=Object.fromEntries(['uAngle','uTilt','uScale','uAspect','uTint'].map(name=>[name,ctx.getUniformLocation(program,name)]));
    } catch { program=null;document.querySelector('.artwork-fallback').hidden=false; }
  }
  function draw() {
    if (!ctx || !program) return;
    ctx.viewport(0,0,canvas.width,canvas.height);ctx.clear(ctx.COLOR_BUFFER_BIT|ctx.DEPTH_BUFFER_BIT);
    const scale=Math.min(width*.134,height*.151);
    if(meshDirty) {
    const positions=new Float32Array(faces.length*18), normals=new Float32Array(faces.length*18);
    let offset=0;
    for(const f of faces) for(const index of [f[0],f[1],f[2],f[0],f[2],f[3]]) {
      positions.set(currentGeometry[index].p,offset);normals.set(currentGeometry[index].n,offset);offset+=3;
    }
    function attribute(name,buffer,data) {
      ctx.bindBuffer(ctx.ARRAY_BUFFER,buffer);ctx.bufferData(ctx.ARRAY_BUFFER,data,ctx.DYNAMIC_DRAW);
      const location=ctx.getAttribLocation(program,name);ctx.enableVertexAttribArray(location);ctx.vertexAttribPointer(location,3,ctx.FLOAT,false,0,0);
    }
    attribute('aPosition',positionBuffer,positions);attribute('aNormal',normalBuffer,normals);
    meshDirty=false;
    }
    ctx.uniform1f(uniforms.uAngle,angle);ctx.uniform1f(uniforms.uTilt,tilt);ctx.uniform1f(uniforms.uScale,scale*2/height);ctx.uniform1f(uniforms.uAspect,width/height);ctx.uniform3fv(uniforms.uTint,tint.map(v=>v/255));
    ctx.drawArrays(ctx.TRIANGLES,0,faces.length*6);
  }
  function tick(time) {
    frameId=0;
    if(document.hidden) return;
    const dt=Math.min((time-lastTime)/1000||0,.05);lastTime=time;
    if(running&&!dragging) { elapsed+=dt;targetAngle+=dt*.13; }
    angle+=(targetAngle-angle)*.12;tilt+=(targetTilt-tilt)*.12;
    let changing=transition<1;
    if(changing) {
      meshDirty=true;
      transition=Math.min(1,transition+dt*.8);
      currentGeometry.forEach((v,i)=>{for(let k=0;k<3;k++){v.p[k]+=(geometry[i].p[k]-v.p[k])*.09;v.n[k]+=(geometry[i].n[k]-v.n[k])*.09;}});
      tint=tint.map((v,i)=>v+(configurations[mode].color[i]-v)*.07);
      if(transition===1) { currentGeometry=geometry.map(v=>({p:[...v.p],n:[...v.n]}));tint=[...configurations[mode].color]; }
    }
    draw();
    if(running||dragging||changing||Math.abs(targetAngle-angle)>.001||Math.abs(targetTilt-tilt)>.001) frameId=requestAnimationFrame(tick);
  }
  function requestDraw() { if(!frameId&&ctx&&!document.hidden){lastTime=performance.now();frameId=requestAnimationFrame(tick);} }
  function resize() {
    const bounds=canvas.getBoundingClientRect();width=bounds.width;height=bounds.height;
    const dpr=Math.min(devicePixelRatio||1,1.7);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    requestDraw();
  }
  function selectMode(name) {
    mode=name;root.dataset.mode=name;
    modeButtons.forEach(b=>{const active=b.dataset.mode===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    document.querySelector('#mode-description').innerHTML=configurations[name].description;
    if(ctx) geometry=makeGeometry(name);
    meshDirty=true;
    transition=reduced.matches?1:0;
    if(reduced.matches){currentGeometry=geometry.map(v=>({p:[...v.p],n:[...v.n]}));tint=[...configurations[name].color];}
    requestDraw();
  }
  modeButtons.forEach(button=>button.addEventListener('click',()=>selectMode(button.dataset.mode)));
  const nextMode=()=>selectMode(modeButtons[(modeButtons.findIndex(b=>b.dataset.mode===mode)+1)%3].dataset.mode);
  document.querySelector('#explore').addEventListener('click',nextMode);
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;dragDistance=0;lastPointer=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');requestDraw();});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lastPointer[0],dy=e.clientY-lastPointer[1];dragDistance+=Math.abs(dx)+Math.abs(dy);targetAngle+=dx*.008;targetTilt+=dy*.006;lastPointer=[e.clientX,e.clientY];if(reduced.matches){angle=targetAngle;tilt=targetTilt;}requestDraw();});
  const endDrag=()=>{dragging=false;canvas.classList.remove('dragging');};
  canvas.addEventListener('pointerup',()=>{endDrag();if(dragDistance<5)nextMode();});canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
  canvas.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();if(e.key==='Enter'||e.key===' ')nextMode();else{targetAngle+=e.key==='ArrowLeft'?-.2:e.key==='ArrowRight'?.2:0;targetTilt+=e.key==='ArrowUp'?-.2:e.key==='ArrowDown'?.2:0;if(reduced.matches){angle=targetAngle;tilt=targetTilt;}requestDraw();}}});
  document.querySelector('#reset-view').addEventListener('click',()=>{targetAngle=.4;targetTilt=-.38;if(reduced.matches){angle=targetAngle;tilt=targetTilt;}requestDraw();});
  function syncMotion(){motionButton.setAttribute('aria-pressed',String(running));motionButton.setAttribute('aria-label',running?'Pause animation':'Play animation');motionButton.textContent=running?'Ⅱ':'▶';root.classList.toggle('motion-paused',!running);}
  motionButton.addEventListener('click',()=>{running=!running;syncMotion();requestDraw();});
  reduced.addEventListener('change',e=>{if(e.matches){running=false;syncMotion();requestDraw();}});
  new ResizeObserver(resize).observe(canvas);syncMotion();
  let audioContext,audioGain;
  const sound=document.querySelector('#sound'),soundLabel=document.querySelector('#sound-label');
  sound.addEventListener('click',async()=>{
    try{
      if(!audioContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Unavailable');audioContext=new Audio();audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
        [110,164.81,220,277.18].forEach((frequency,index)=>{const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.value=.12/(index+1);oscillator.connect(gain);gain.connect(audioGain);oscillator.start();});}
      await audioContext.resume();const enabled=sound.getAttribute('aria-pressed')!=='true';audioGain.gain.setTargetAtTime(enabled?.32:0,audioContext.currentTime,.3);sound.setAttribute('aria-pressed',String(enabled));soundLabel.textContent=enabled?'Sound on':'Sound off';
    }catch{soundLabel.textContent='Sound unavailable';}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frameId);frameId=0;audioContext?.suspend();}else{requestDraw();if(audioContext&&sound.getAttribute('aria-pressed')==='true')audioContext.resume().catch(()=>{});}});
  const dialog=document.querySelector('#contact');let opener;
  document.querySelectorAll('[data-contact]').forEach(button=>button.addEventListener('click',()=>{opener=button;dialog.showModal();}));
  document.querySelector('.close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();});
  dialog.addEventListener('close',()=>opener?.focus());
  document.querySelector('#enquiry').addEventListener('submit',event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);
    const text=`GI LAB — IDEA DRAFT\nNot submitted to GI Lab.\n\nName: ${data.get('name')}\nEmail: ${data.get('email')}\n\nIdea:\n${data.get('idea')}\n`;
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='GI-Lab-idea.txt';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    document.querySelector('#form-status').textContent='Your draft download has started. Your idea has not been sent to GI Lab.';
  });
})();
