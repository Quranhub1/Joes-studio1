/* Automatic, browser-local student portrait preprocessing. */
(function(){
  const E={
    clamp(v,a,b){ return Math.max(a, Math.min(b, Number.isFinite(v) ? v : a)); },
    async process(src,opt={}){
      if (!src || typeof src !== "string") return src;
      try {
        const strength = String(opt.strength || "natural").toLowerCase();
        const parsed = await this.loadImage(src, Number(opt.maxSide) || 2000);
        const { canvas, ctx, width:w, height:h } = parsed;
        const srcData = ctx.getImageData(0,0,w,h);
        const mask = this.mask(srcData.data,w,h);
        const stats = this.stats(srcData.data,w,h,mask);
        const auto = opt.auto === false ? {
          exposure:0,shadows:0,deepShadows:0,gamma:1,complexionLift:0,highlights:0,
          contrast:1,saturation:1,temperature:0,sharpness:0
        } : this.calculate(stats,strength);
        const m=opt.manual||{};
        const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
        const manualActive = Object.keys(m).some(k => k !== "cropScale" && n(m[k],0) !== 0);
        const v={
          exposure:auto.exposure + (n(m.exposure)/100)*.45 + (n(m.brightness)/100)*.55,
          shadows:auto.shadows + (n(m.shadows)/100)*.45,
          deepShadows:auto.deepShadows,
          highlights:auto.highlights - (n(m.highlights)/100)*.45,
          gamma:auto.gamma,
          complexionLift:auto.complexionLift + (n(m.faceLighting)/100)*.18,
          contrast:auto.contrast * (1 + n(m.contrast)/150),
          saturation:auto.saturation * (1 + n(m.saturation)/150),
          temperature:auto.temperature + (n(m.temperature)/100)*22,
          sharpness:this.clamp(auto.sharpness + (n(m.sharpness)/100)*.32, 0, .50)
        };
        const out = new Uint8ClampedArray(srcData.data);
        for(let p=0; p < w*h; p++){
          const i=p*4, fg=1-mask[p];
          let r=srcData.data[i], g=srcData.data[i+1], b=srcData.data[i+2];
          const lum=(.2126*r + .7152*g + .0722*b)/255;
          const shadow=Math.max(0,(.68-lum)/.68);
          const deepShadow=Math.max(0,(.42-lum)/.42);
          const highlight=Math.max(0,(lum-.72)/.28);
          const centerX=(p%w)/(w-1||1), centerY=Math.floor(p/w)/(h-1||1);
          const faceZone=Math.max(0,1-Math.sqrt(((centerX-.5)/.5)**2+((centerY-.43)/.62)**2))*fg;
          const complexionLift=(v.complexionLift||0)*Math.max(0,(.68-lum)/.68)*(0.50+0.50*faceZone);
          const printLift=(v.exposure + shadow*v.shadows + deepShadow*v.deepShadows + complexionLift - highlight*v.highlights)*fg;
          r += 255*printLift; g += 255*printLift; b += 255*printLift;
          if(fg > .5){
            r = 255*Math.pow(Math.max(0,r/255), v.gamma);
            g = 255*Math.pow(Math.max(0,g/255), v.gamma);
            b = 255*Math.pow(Math.max(0,b/255), v.gamma);
          }
          r = ((r/255-.5)*v.contrast + .5)*255;
          g = ((g/255-.5)*v.contrast + .5)*255;
          b = ((b/255-.5)*v.contrast + .5)*255;
          const avg=(r+g+b)/3, sat=v.saturation;
          r = avg + (r-avg)*sat; g = avg + (g-avg)*sat; b = avg + (b-avg)*sat;
          const temp = v.temperature * fg;
          r += temp; b -= temp;
          if(opt.whiteBackground !== false){
            const a = mask[p];
            r = r*(1-a) + 255*a; g = g*(1-a) + 255*a; b = b*(1-a) + 255*a;
          }
          out[i]=this.clamp(r,0,255); out[i+1]=this.clamp(g,0,255); out[i+2]=this.clamp(b,0,255);
          out[i+3]=this.clamp(srcData.data[i+3] * (n(m.opacity,100)/100), 0, 255);
        }
        ctx.putImageData(new ImageData(out,w,h),0,0);
        if(v.sharpness > 0 && (!manualActive || opt.auto !== false)) this.sharpen(ctx,w,h,v.sharpness,mask);
        const cropScale = this.clamp(n(m.cropScale,100)/100, 1, 2.0);
        const posX = this.clamp(n(m.positionX,0), -35, 35) / 100;
        const posY = this.clamp(n(m.positionY,0), -35, 35) / 100;
        if(cropScale !== 1 || posX !== 0 || posY !== 0) this.reframe(canvas,w,h,cropScale,posX,posY);
        return canvas.toDataURL("image/jpeg", .93);
      } catch (error) {
        console.warn("Student photo enhancement failed; using original image.", error);
        return src;
      }
    },
    async loadImage(src,maxSide=2000){
      const img = await new Promise((ok,no)=>{
        const image = new Image();
        image.onload = () => ok(image);
        image.onerror = () => no(new Error("Student photo could not be decoded."));
        image.src = src;
      });
      const naturalW = Math.max(1, Number(img.naturalWidth) || Number(img.width) || 1);
      const naturalH = Math.max(1, Number(img.naturalHeight) || Number(img.height) || 1);
      const side = Math.max(naturalW, naturalH);
      const cap = Math.max(1, Number(maxSide) || 2000);
      const scale = side > cap ? cap / side : 1;
      const w = Math.max(1, Math.round(naturalW * scale));
      const h = Math.max(1, Math.round(naturalH * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas context is unavailable.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      return { canvas, ctx, width: w, height: h };
    },
    calculate(s,mode="natural"){
      const natural = mode === "natural";
      const strong = mode === "strong";
      const target = .52;
      const gap = target - s.mean;
      return {
        exposure: Math.max(-.05, Math.min(.30, gap * .62 + (s.darkFraction - .20) * .16)) * (natural ? .72 : strong ? 1.12 : 1),
        shadows: Math.max(0, Math.min(.45, (s.shadowMean < .46 ? .20 : .10) + (s.darkFraction - .20) * .34)) * (natural ? .70 : strong ? 1.10 : 1),
        deepShadows: Math.max(0, Math.min(.24, (s.darkFraction > .28 ? .08 : .03))) * (natural ? .72 : strong ? 1.15 : 1),
        gamma: natural ? .98 : strong ? .90 : .95,
        complexionLift: natural ? .018 : strong ? .12 : .05,
        highlights: Math.max(.04, Math.min(.18, (s.highlightFraction * .22) + .04)) * (natural ? .72 : strong ? 1.08 : 1),
        contrast: Math.max(.98, Math.min(1.08, 1 + (target - s.mean) * .12 + (s.std < .16 ? .022 : 0))) * (natural ? .78 : strong ? 1.07 : 1),
        saturation: Math.max(.94, Math.min(1.08, 1 + (s.saturation < .30 ? .040 : .012))) * (natural ? .82 : strong ? 1.04 : 1),
        temperature: Math.max(-5, Math.min(5, (s.warm - s.cool) * .08)),
        sharpness: Math.max(.05, Math.min(.24, .12 + (s.std < .14 ? .08 : 0) + (s.darkFraction > .35 ? .04 : 0)))
      };
    },
    stats(data,w,h,mask){
      let n=0,sum=0,sum2=0,dark=0,high=0,shadowSum=0,sat=0,warm=0,cool=0;
      for(let p=0;p<w*h;p++){
        const i=p*4, fg=1-mask[p];
        if(fg < .35) continue;
        const r = data[i] / 255, g = data[i+1] / 255, b = data[i+2] / 255;
        const l = .2126 * r + .7152 * g + .0722 * b;
        n++; sum += l; sum2 += l * l;
        if(l < .28) dark++;
        if(l > .82) high++;
        if(l < .46) shadowSum += l;
        const max = Math.max(r,g,b), min = Math.min(r,g,b), diff = max - min;
        sat += diff > 0 ? diff / (max || .0001) : 0;
        warm += Math.max(0, r - (g + b) / 2);
        cool += Math.max(0, (g + b) / 2 - r);
      }
      const mean = n ? sum / n : .5;
      const std = n ? Math.sqrt(Math.max(0, sum2 / n - mean * mean)) : .15;
      return {
        mean, std,
        darkFraction: n ? dark / n : 0,
        highlightFraction: n ? high / n : 0,
        shadowMean: dark ? shadowSum / dark : mean,
        saturation: n ? sat / n : .3,
        warm: warm / Math.max(1, n),
        cool: cool / Math.max(1, n)
      };
    },
    sharpen(ctx,w,h,amount,mask){
      if (!ctx || !w || !h || amount <= 0) return;
      const src = ctx.getImageData(0,0,w,h), d = src.data, o = new Uint8ClampedArray(d), a = Math.min(.35, amount);
      for(let y=1; y < h - 1; y++){
        for(let x=1; x < w - 1; x++){
          const p = y * w + x, i = p * 4;
          if(mask[p] > .35) continue;
          for(let c=0; c < 3; c++){
            const center = d[i + c];
            const avg = (d[i - 4 + c] + d[i + 4 + c] + d[i - 4 * w + c] + d[i + 4 * w + c]) / 4;
            o[i + c] = this.clamp(center + (center - avg) * a, 0, 255);
          }
        }
      }
      ctx.putImageData(new ImageData(o,w,h),0,0);
    },
    reframe(canvas,w,h,scale,posX,posY){
      if (!canvas || !w || !h) return;
      const temp = document.createElement("canvas");
      temp.width = w; temp.height = h;
      const t = temp.getContext("2d");
      if (!t) return;
      const dw = w * scale, dh = h * scale;
      const maxX = (dw - w) / 2, maxY = (dh - h) / 2;
      const x = (w - dw) / 2 + posX * 2 * maxX;
      const y = (h - dh) / 2 + posY * 2 * maxY;
      t.drawImage(canvas, x, y, dw, dh);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0,0,w,h);
      ctx.drawImage(temp,0,0);
    },
    mask(data,W,H){
      if (!W || !H) return new Float32Array(0);
      const s = Math.max(1, Math.ceil(Math.max(W,H) / 180));
      const w = Math.ceil(W / s), h = Math.ceil(H / s);
      const rgb = new Float32Array(w * h * 3);
      const edge = [];
      for(let y=0; y < h; y++){
        for(let x=0; x < w; x++){
          const X = Math.min(W - 1, x * s + (s >> 1));
          const Y = Math.min(H - 1, y * s + (s >> 1));
          const i = (Y * W + X) * 4;
          const q = (y * w + x) * 3;
          rgb[q] = data[i]; rgb[q+1] = data[i+1]; rgb[q+2] = data[i+2];
          if(x === 0 || y === 0 || x === w - 1 || y === h - 1) edge.push([rgb[q], rgb[q+1], rgb[q+2]]);
        }
      }
      if (!edge.length) return new Float32Array(W * H).fill(0);
      const med = k => {
        const a = edge.map(v => v[k]).sort((a,b)=>a-b);
        return a[Math.floor(a.length / 2)] || 0;
      };
      const bg = [med(0), med(1), med(2)];
      const bl = (.2126 * bg[0] + .7152 * bg[1] + .0722 * bg[2]) / 255;
      const th = bl < .22 ? 42 : bl > .72 ? 62 : 54;
      const seen = new Uint8Array(w * h), m = new Float32Array(w * h), q = new Int32Array(w * h);
      let head = 0, tail = 0;
      const add = (x, y) => {
        if(x < 0 || y < 0 || x >= w || y >= h) return;
        const n = y * w + x;
        if(!seen[n]) { seen[n] = 1; q[tail++] = n; }
      };
      for(let x=0; x < w; x++) { add(x,0); add(x,h-1); }
      for(let y=1; y < h - 1; y++) { add(0,y); add(w-1,y); }
      const dist = (n, c) => {
        const i = n * 3, dr = rgb[i] - c[0], dg = rgb[i+1] - c[1], db = rgb[i+2] - c[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };
      while(head < tail){
        const n = q[head++];
        if(dist(n, bg) > th) continue;
        m[n] = 1;
        const x = n % w, y = (n / w) | 0;
        const i = n * 3, c = [rgb[i], rgb[i+1], rgb[i+2]];
        for(const z of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
          const X = z[0], Y = z[1];
          if(X >= 0 && Y >= 0 && X < w && Y < h){
            const k = Y * w + X;
            if(!seen[k] && dist(k, c) <= Math.min(th, 48)){ seen[k] = 1; q[tail++] = k; }
          }
        }
      }
      const out = new Float32Array(W * H);
      for(let y=0; y < H; y++){
        const gy = y / s, y0 = Math.min(h - 1, gy | 0), y1 = Math.min(h - 1, y0 + 1), fy = gy - y0;
        for(let x=0; x < W; x++){
          const gx = x / s, x0 = Math.min(w - 1, gx | 0), x1 = Math.min(w - 1, x0 + 1), fx = gx - x0;
          const a = m[y0 * w + x0] * (1 - fx) + m[y0 * w + x1] * fx;
          const b = m[y1 * w + x0] * (1 - fx) + m[y1 * w + x1] * fx;
          const v = a * (1 - fy) + b * fy;
          out[y * W + x] = v * v * (3 - 2 * v);
        }
      }
      return out;
    }
  };
  window.JoesStudentPhotoEnhancer = E;
})();
