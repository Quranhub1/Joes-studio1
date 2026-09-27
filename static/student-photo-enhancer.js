/* Automatic, browser-local student portrait preprocessing. */
(function(){
  const E={
    async process(src,opt={}){
      const im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
      const max=Math.max(480,Math.min(1400,Number(opt.maxSide)||1200));
      const scale=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height));
      const w=Math.max(1,Math.round((im.naturalWidth||im.width)*scale)),h=Math.max(1,Math.round((im.naturalHeight||im.height)*scale));
      const c=document.createElement("canvas");c.width=w;c.height=h;
      const ctx=c.getContext("2d",{willReadFrequently:true});ctx.drawImage(im,0,0,w,h);
      const srcData=ctx.getImageData(0,0,w,h), mask=this.mask(srcData.data,w,h);
      const stats=this.stats(srcData.data,w,h,mask);
      const v=this.calculate(stats,String(opt.strength||"balanced"));
      const out=new Uint8ClampedArray(srcData.data);
      for(let p=0;p<w*h;p++){
        const i=p*4,fg=1-mask[p];
        let r=srcData.data[i],g=srcData.data[i+1],b=srcData.data[i+2];
        const lum=(.2126*r+.7152*g+.0722*b)/255;
        const shadow=Math.max(0,(.62-lum)/.62), highlight=Math.max(0,(lum-.68)/.32);
        const lift=(v.exposure+shadow*v.shadows-highlight*v.highlights)*fg;
        r+=255*lift;g+=255*lift;b+=255*lift;
        r=((r/255-.5)*v.contrast+.5)*255;g=((g/255-.5)*v.contrast+.5)*255;b=((b/255-.5)*v.contrast+.5)*255;
        const mx=Math.max(r,g,b),mn=Math.min(r,g,b),delta=mx-mn;
        if(delta>1){
          const avg=(r+g+b)/3, sat=v.saturation;
          r=avg+(r-avg)*sat;g=avg+(g-avg)*sat;b=avg+(b-avg)*sat;
          const temp=v.temperature*fg;
          r+=temp;b-=temp;
        }
        if(opt.whiteBackground!==false){
          const a=mask[p];
          r=r*(1-a)+255*a;g=g*(1-a)+255*a;b=b*(1-a)+255*a;
        }
        out[i]=Math.max(0,Math.min(255,r));out[i+1]=Math.max(0,Math.min(255,g));out[i+2]=Math.max(0,Math.min(255,b));out[i+3]=srcData.data[i+3];
      }
      ctx.putImageData(new ImageData(out,w,h),0,0);
      if(v.sharpness>0) this.sharpen(ctx,w,h,v.sharpness,mask);
      return c.toDataURL("image/jpeg",.94);
    },
    calculate(s,mode){
      const natural=mode==="natural",strong=mode==="strong";
      const target=.52, gap=target-s.mean;
      return {
        brightness:gap,
        exposure:Math.max(-.05,Math.min(.24,gap*.65+(s.darkFraction-.20)*.16))*(natural?.65:strong?1.15:1),
        shadows:Math.max(0,Math.min(.30,(s.shadowMean<.46? .18: .08)+(s.darkFraction-.20)*.35))*(natural?.65:strong?1.15:1),
        highlights:Math.max(.04,Math.min(.24,(s.highlightFraction*.30)+.05))*(natural?.7:strong?1.1:1),
        contrast:Math.max(.98,Math.min(1.10,1+(target-s.mean)*.16+(s.std<.16?.025:0)))*(natural?.75:strong?1.08:1),
        saturation:Math.max(.94,Math.min(1.10,1+(s.saturation<.30?.045:.015)))*(natural?.8:strong?1.05:1),
        temperature:Math.max(-5,Math.min(5,(s.warm-cool)*.08)),
        sharpness:Math.max(.10,Math.min(.42,.18+(s.std<.14?.12:0)+(s.darkFraction>.35?.05:0)))
      };
    },
    stats(data,w,h,mask){
      let n=0,sum=0,sum2=0,dark=0,high=0,shadowSum=0,sat=0,warm=0,cool=0;
      for(let p=0;p<w*h;p++){const i=p*4,fg=1-mask[p];if(fg<.35)continue;const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,l=.2126*r+.7152*g+.0722*b;n++;sum+=l;sum2+=l*l;if(l<.28)dark++;if(l>.82)high++;if(l<.58)shadowSum+=l;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);sat+=(mx-mn);warm+=Math.max(0,r-b);cool+=Math.max(0,b-r);}
      const mean=n?sum/n:.5,std=n?Math.sqrt(Math.max(0,sum2/n-(sum/n)**2)):.15;
      return {mean,std,darkFraction:n?dark/n:0,highlightFraction:n?high/n:0,shadowMean:dark?shadowSum/dark:mean,saturation:n?sat/n:.3,warm,cool};
    },
    sharpen(ctx,w,h,amount,mask){
      const src=ctx.getImageData(0,0,w,h),d=src.data,o=new Uint8ClampedArray(d),a=Math.min(.42,amount);
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x,i=p*4;if(mask[p]>.35)continue;for(let c=0;c<3;c++){const center=d[i+c],avg=(d[i-4+c]+d[i+4+c]+d[i-4*w+c]+d[i+4*w+c])/4;o[i+c]=Math.max(0,Math.min(255,center+(center-avg)*a));}}
      ctx.putImageData(new ImageData(o,w,h),0,0);
    },
    mask(data,W,H){
      const s=Math.max(1,Math.ceil(Math.max(W,H)/180)),w=Math.ceil(W/s),h=Math.ceil(H/s),rgb=new Float32Array(w*h*3),edge=[];
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=Math.min(W-1,x*s+(s>>1)),Y=Math.min(H-1,y*s+(s>>1)),i=(Y*W+X)*4,q=(y*w+x)*3;rgb[q]=data[i];rgb[q+1]=data[i+1];rgb[q+2]=data[i+2];if(x===0||y===0||x===w-1||y===h-1)edge.push([rgb[q],rgb[q+1],rgb[q+2]]);}
      const med=k=>{const a=edge.map(v=>v[k]).sort((a,b)=>a-b);return a[a.length>>1]||0},bg=[med(0),med(1),med(2)],bl=(.2126*bg[0]+.7152*bg[1]+.0722*bg[2])/255,th=bl<.22?42:bl>.72?62:54;
      const seen=new Uint8Array(w*h),m=new Float32Array(w*h),q=new Int32Array(w*h);let head=0,tail=0;
      const add=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return;const n=y*w+x;if(!seen[n]){seen[n]=1;q[tail++]=n;}};
      for(let x=0;x<w;x++){add(x,0);add(x,h-1)}for(let y=1;y<h-1;y++){add(0,y);add(w-1,y)}
      const dist=(n,c)=>{const i=n*3,dr=rgb[i]-c[0],dg=rgb[i+1]-c[1],db=rgb[i+2]-c[2];return Math.sqrt(dr*dr+dg*dg+db*db)};
      while(head<tail){const n=q[head++];if(dist(n,bg)>th)continue;m[n]=1;const x=n%w,y=(n/w)|0,i=n*3,c=[rgb[i],rgb[i+1],rgb[i+2]];for(const z of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const X=z[0],Y=z[1];if(X>=0&&Y>=0&&X<w&&Y<h){const k=Y*w+X;if(!seen[k]&&dist(k,c)<=Math.min(th,48)){seen[k]=1;q[tail++]=k}}}}
      const out=new Float32Array(W*H);
      for(let y=0;y<H;y++){const gy=y/s,y0=Math.min(h-1,gy|0),y1=Math.min(h-1,y0+1),fy=gy-y0;for(let x=0;x<W;x++){const gx=x/s,x0=Math.min(w-1,gx|0),x1=Math.min(w-1,x0+1),fx=gx-x0,a=m[y0*w+x0]*(1-fx)+m[y0*w+x1]*fx,b=m[y1*w+x0]*(1-fx)+m[y1*w+x1]*fx,v=a*(1-fy)+b*fy;out[y*W+x]=v*v*(3-2*v)}}
      return out;
    }
  };
  window.JoesStudentPhotoEnhancer=E;
})();