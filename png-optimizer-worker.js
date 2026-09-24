/* UPNG 2.1.0 expects window; workers expose the same library through self. */
self.window=self;
importScripts('./vendor/pako.min.js','./vendor/UPNG.js');

// Compare composited pixels on both light and dark backgrounds, including local
// tiles so a small text/edge region cannot be hidden by a large flat background.
function acceptableQuality(source,output,width,height){
 let total=0,alphaError=0;const tilesX=Math.ceil(width/32),sums=new Float64Array(tilesX*Math.ceil(height/32)),counts=new Uint32Array(sums.length);
 for(let i=0;i<source.length;i+=4){
  const a=source[i+3]/255,b=output[i+3]/255;
  if((source[i+3]===0&&output[i+3]!==0)||(source[i+3]===255&&output[i+3]!==255))return false;
  alphaError+=(source[i+3]-output[i+3])**2;
  let error=0;
  for(let c=0;c<3;c++){
   const dark=source[i+c]*a-output[i+c]*b,light=dark+255*(b-a);
   error+=Math.max(dark*dark,light*light);
  }
  const pixel=i/4,tile=Math.floor(pixel/width/32)*tilesX+Math.floor((pixel%width)/32);
  sums[tile]+=error;counts[tile]+=3;total+=error;
 }
 if(Math.sqrt(total/(source.length/4*3))>3||Math.sqrt(alphaError/(source.length/4))>2)return false;
 return sums.every((sum,i)=>Math.sqrt(sum/counts[i])<=7);
}
self.onmessage=event=>{
 try{
  const {pixels,width,height,target}=event.data,source=new Uint8Array(pixels);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width*height>16000000||source.length!==width*height*4)throw Error('Invalid image dimensions.');
  let best=null;
  for(const colors of [256,192,128]){
   const buffer=UPNG.encode([source.slice().buffer],width,height,colors);
   const decoded=UPNG.decode(buffer),output=new Uint8Array(UPNG.toRGBA8(decoded)[0]);
   if(decoded.width!==width||decoded.height!==height||!acceptableQuality(source,output,width,height))continue;
   if(!best||buffer.byteLength<best.buffer.byteLength)best={buffer,colors};
   if(buffer.byteLength<=target)break;
  }
  if(best)self.postMessage(best,[best.buffer]);else self.postMessage({reason:'Quality checks kept the original or lossless result.'});
 }catch(error){self.postMessage({reason:'Smart PNG compression could not complete; original or lossless result retained.'});}
};
