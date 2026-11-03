// One short food shower on a fresh page load; in-page navigation never replays it.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
if(!reducedMotion.matches){
 const rain=document.createElement('div');rain.className='food-rain';rain.setAttribute('aria-hidden','true');
 const foods=['🍜','🍙','🥟','🍣','🍕','🍔','🍟','🥐','🍩','🍰','🍓','🍒','🥑','🥨','🍗','🍤','🍡','🧁','🥞','🧋','☕','🍧','🍪','🥪'];
 const count=innerWidth<620?34:58,fragment=document.createDocumentFragment();
 for(let i=0;i<count;i++){const food=document.createElement('span');food.className='food-rain-item';food.textContent=foods[i%foods.length];const lane=(i%10+.2+Math.random()*.65)/10;for(const [key,value]of Object.entries({left:Math.min(95,lane*100)+'%',size:(innerWidth<620?26+Math.random()*15:32+Math.random()*21)+'px',delay:(Math.floor(i/10)*.105+Math.random()*.09)+'s',duration:(.98+Math.random()*.16)+'s',drift:(-35+Math.random()*70)+'px',start:(-30+Math.random()*60)+'deg',end:(-160+Math.random()*320)+'deg'}))food.style.setProperty('--'+key,value);fragment.append(food)}
 rain.append(fragment);document.body.append(rain);
 const finish=()=>rain.remove();const timer=setTimeout(finish,1800);
 reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches){clearTimeout(timer);finish()}},{once:true});
 window.addEventListener('pagehide',()=>{clearTimeout(timer);finish()},{once:true});
}
