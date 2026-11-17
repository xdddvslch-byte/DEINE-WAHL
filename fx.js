// Фонові ефекти: лампа над рельєфом і легкий нахил скла за курсором.
// Тут немає логіки сценарію — лише атмосфера.
(()=>{
 const lit=document.querySelector('.lit');
 const tilt=document.querySelector('.glass-tilt');
 if(!lit||!tilt)return;
 const calm=matchMedia('(prefers-reduced-motion: reduce)');
 let tx=.74,ty=.44,cx=tx,cy=ty,raf=0;
 function frame(){
  cx+=(tx-cx)*.12; cy+=(ty-cy)*.12;
  lit.style.setProperty('--mx',(cx*100).toFixed(2)+'%');
  lit.style.setProperty('--my',(cy*100).toFixed(2)+'%');
  if(!calm.matches){
   tilt.style.transform='perspective(1400px) rotateY('+((cx-.5)*12).toFixed(2)+'deg) rotateX('+((cy-.5)*-9).toFixed(2)+'deg)';
  }
  raf=(Math.abs(tx-cx)>.0006||Math.abs(ty-cy)>.0006)?requestAnimationFrame(frame):0;
 }
 addEventListener('pointermove',e=>{
  tx=e.clientX/innerWidth; ty=e.clientY/innerHeight;
  if(!raf)raf=requestAnimationFrame(frame);
 },{passive:true});
 frame();
})();
