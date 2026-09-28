/* UPNG 2.1.0 expects window; workers expose the same library through self. */
self.window=self;
importScripts('./vendor/pako.min.js','./vendor/UPNG.js');

// Compare rendered appearance on both dark and light backgrounds. Alpha differences
// are evaluated through their visible composite result rather than as a separate veto.
function qualityScore(source,output,width,height){
 let total=0,maxTile=0;
 const tilesX=Math.ceil(width/32),sums=new Float64Array(tilesX*Math.ceil(height/32)),counts=new Uint32Array(sums.length);
 for(let i=0;i<source.length;i+=4){
  const a=source[i+3]/255,b=output[i+3]/255;
  let error=0;
  for(let c=0;c<3;c++){
   const dark=source[i+c]*a-output[i+c]*b;
   const light=(source[i+c]*a+255*(1-a))-(output[i+c]*b+255*(1-b));
   error+=Math.max(dark*dark,light*light);
  }
  const pixel=i/4,tile=Math.floor(pixel/width/32)*tilesX+Math.floor((pixel%width)/32);
  sums[tile]+=error;counts[tile]+=3;total+=error;
 }
 const globalRmse=Math.sqrt(total/(source.length/4*3));
 for(let i=0;i<sums.length;i++)if(counts[i])maxTile=Math.max(maxTile,Math.sqrt(sums[i]/counts[i]));
 return {globalRmse,maxTile,ok:globalRmse<=14&&maxTile<=42};
}
self.onmessage=event=>{
 try{
  const {pixels,width,height}=event.data,source=new Uint8Array(pixels);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>16000000||source.length!==width*height*4)throw Error('Invalid image dimensions.');
  let best=null,safest=null;
  // UPNG's cnum parameter enables lossy palette quantization. Search several palette
  // sizes and prefer the smallest candidate that remains visually close.
  for(const colors of [256,224,192,160,128,112,96,80,64,48,32]){
   const buffer=UPNG.encode([source.slice().buffer],width,height,colors);
   const decoded=UPNG.decode(buffer);
   const output=new Uint8Array(UPNG.toRGBA8(decoded)[0]);
   if(decoded.width!==width||decoded.height!==height||output.length!==source.length)continue;
   const quality=qualityScore(source,output,width,height);
   const candidate={buffer,colors,quality};
   if(colors===256)safest=candidate;
   if(quality.ok&&(!best||buffer.byteLength<best.buffer.byteLength))best=candidate;
  }
  const chosen=best||safest;
  if(chosen)self.postMessage({...chosen,reason:"Adaptive PNG palette · "+chosen.colors+" colors · Review image quality"},[chosen.buffer]);
  else self.postMessage({reason:"Smart PNG compression could not create a valid palette result."});
 }catch(error){self.postMessage({reason:'Smart PNG compression could not complete; original or lossless result retained.'});}
};