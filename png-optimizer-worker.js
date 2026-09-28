/* UPNG 2.1.0 expects window; workers expose the same library through self. */
self.window=self;
importScripts('./vendor/pako.min.js','./vendor/UPNG.js');

// Compare composited pixels on both light and dark backgrounds. Smart compression
// intentionally permits small palette/alpha changes when they are visually subtle.
function qualityScore(source,output,width,height){
 let total=0,alphaError=0,maxTile=0;
 const tilesX=Math.ceil(width/32),sums=new Float64Array(tilesX*Math.ceil(height/32)),counts=new Uint32Array(sums.length);
 for(let i=0;i<source.length;i+=4){
  const a=source[i+3]/255,b=output[i+3]/255;
  alphaError+=(source[i+3]-output[i+3])**2;
  let error=0;
  for(let c=0;c<3;c++){
   const dark=source[i+c]*a-output[i+c]*b;
   const light=dark+255*(b-a);
   error+=Math.max(dark*dark,light*light);
  }
  const pixel=i/4,tile=Math.floor(pixel/width/32)*tilesX+Math.floor((pixel%width)/32);
  sums[tile]+=error;counts[tile]+=3;total+=error;
 }
 const globalRmse=Math.sqrt(total/(source.length/4*3));
 const alphaRmse=Math.sqrt(alphaError/(source.length/4));
 for(let i=0;i<sums.length;i++)if(counts[i])maxTile=Math.max(maxTile,Math.sqrt(sums[i]/counts[i]));
 return {globalRmse,alphaRmse,maxTile,ok:globalRmse<=5.5&&alphaRmse<=6&&maxTile<=14};
}
self.onmessage=event=>{
 try{
  const {pixels,width,height}=event.data,source=new Uint8Array(pixels);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>16000000||source.length!==width*height*4)throw Error('Invalid image dimensions.');
  let best=null;
  // Keep searching after reaching a particular file size. The goal is the smallest
  // visually acceptable PNG, not merely crossing a fixed KB threshold.
  for(const colors of [256,224,192,160,128,112,96,80,64,48,32,24,16]){
   const buffer=UPNG.encode([source.slice().buffer],width,height,colors);
   const decoded=UPNG.decode(buffer);
   const output=new Uint8Array(UPNG.toRGBA8(decoded)[0]);
   if(decoded.width!==width||decoded.height!==height||output.length!==source.length)continue;
   const quality=qualityScore(source,output,width,height);
   if(!quality.ok)continue;
   if(!best||buffer.byteLength<best.buffer.byteLength)best={buffer,colors,quality};
  }
  if(best)self.postMessage(best,[best.buffer]);
  else self.postMessage({reason:'Smart compression could not reduce this PNG without exceeding the visual quality threshold.'});
 }catch(error){self.postMessage({reason:'Smart PNG compression could not complete; original or lossless result retained.'});}
};