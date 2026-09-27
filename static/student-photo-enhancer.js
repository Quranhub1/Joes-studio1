/* Browser-local student photo cleanup for Joes Studio. */
(function(){
  const E={
    async process(src,opt={}){
      const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
      const max=Math.max(480,Math.min(1200,Number(opt.maxSide)||1000));
      const sc=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height));
      const w=Math.max(1,Math.round((im.naturalWidth||im.width)*sc)),h=Math.max(1,Math.round((im.naturalHeight||im.height)*sc));
      const c=document.createElement("canvas");c.width=w;c.height=h;
      const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(im,0,0,w,h);
      const d=x.getImageData(0,0,w,h),m=this.mask(d.data,w,h),o=new Uint8ClampedArray(d.data);
      const mode=String(opt.strength||"balanced"), ex=mode==="strong"?0.25:mode==="natural"?0.10:0.18, sh=mode==="strong"?0.28:mode==="natural"?0.10:0.20, ct=mode==="strong"?1.08:mode==="natural"?1.02:1.05;
      for(let p=0;p<w*h;p++){const i=p*4,fg=1-m[p],lum=(.2126*d.data[i]+.7152*d.data[i+1]+.0722*d.data[i+2])/255, lift=(ex+Math.max(0,.62-lum)/.62*sh)*fg;let r=d.data[i]+255*lift,g=d.data[i+1]+255*lift,b=d.data[i+2]+255*lift;
        r=((r/255-.5)*ct+.5)*255;g=((g/255-.5)*ct+.5)*255;b=((b/255-.5)*ct+.5)*255;
        if(opt.whiteBackground!==false){const a=m[p];r=r*(1-a)+255*a;g=g*(1-a)+255*a;b=b*(1-a)+255*a;}
        o[i]=Math.max(0,Math.min(255,r));o[i+1]=Math.max(0,Math.min(255,g));o[i+2]=Math.max(0,Math.min(255,b));}
      x.putImageData(new ImageData(o,w,h),0,0);return c.toDataURL("image/jpeg",.94);
    },
    mask(data,W,H){
      const s=Math.max(1,Math.ceil(Math.max(W,H)/160)),w=Math.ceil(W/s),h=Math.ceil(H/s),rgb=new Float32Array(w*h*3),edge=[];
      for(let y=0;y<h;y++)for(let z=0;z<w;z++){const X=Math.min(W-1,z*s+(s>>1)),Y=Math.min(H-1,y*s+(s>>1)),i=(Y*W+X)*4,q=(y*w+z)*3;rgb[q]=data[i];rgb[q+1]=data[i+1];rgb[q+2]=data[i+2];if(z===0||y===0||z===w-1||y===h-1)edge.push([rgb[q],rgb[q+1],rgb[q+2]]);}
      const med=k=>{const a=edge.map(v=>v[k]).sort((a,b)=>a-b);return a[a.length>>1]||0;},bg=[med(0),med(1),med(2)],lum=(.2126*bg[0]+.7152*bg[1]+.0722*bg[2])/255,th=lum<.22?42:lum>.72?62:54;
      const seen=new Uint8Array(w*h),m=new Float32Array(w*h),q=new Int32Array(w*h);let a=0,b=0;
      const add=(X,Y)=>{if(X>=0&&Y>=0&&X<w&&Y<h){const n=Y*w+X;if(!seen[n]){seen[n]=1;q[b++]=n;}}};
      for(let z=0;z<w;z++){add(z,0);add(z,h-1);}for(let y=1;y<h-1;y++){add(0,y);add(w-1,y);}
      const dist=(n,c)=>{const i=n*3,dr=rgb[i]-c[0],dg=rgb[i+1]-c[1],db=rgb[i+2]-c[2];return Math.sqrt(dr*dr+dg*dg+db*db);};
      while(a<b){const n=q[a++];if(dist(n,bg)>th)continue;m[n]=1;const X=n%w,Y=(n/w)|0,ii=n*3,c=[rgb[ii],rgb[ii+1],rgb[ii+2]];add2(X-1,Y,n,c);add2(X+1,Y,n,c);add2(X,Y-1,n,c);add2(X,Y+1,n,c);}
      const out=new Float32Array(W*H);
      for(let Y=0;Y<H;Y++){const gy=Y/s,y0=Math.min(h-1,gy|0),y1=Math.min(h-1,y0+1),fy=gy-y0;for(let X=0;X<W;X++){const gx=X/s,x0=Math.min(w-1,gx|0),x1=Math.min(w-1,x0+1),fx=gx-x0,v=(m[y0*w+x0]*(1-fx)+m[y0*w+x1]*fx)*(1-fy)+(m[y1*w+x0]*(1-fx)+m[y1*w+x1]*fx)*fy;out[Y*W+X]=v*v*(3-2*v);}}
      return out;
      function add2(X,Y,n,c){if(X<0||Y<0||X>=w||Y>=h)return;const k=Y*w+X;if(!seen[k]&&dist(k,c)<=Math.min(th,48)){seen[k]=1;q[b++]=k;}}
    }
  };window.JoesStudentPhotoEnhancer=E;
})();