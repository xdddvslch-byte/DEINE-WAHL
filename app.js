const path=[];
let previousRun = null;
let busy = false;
const app=document.querySelector('#app');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// Три відповіді — три кольори скла. Шлях гравця тягнеться цими кольорами.
const HUE=['var(--a)','var(--b)','var(--c)'];
const LETTER=['А','Б','В'];

function current(){
 if(!path.length)return first;
 if(path.length===1)return second[path[0]];
 const route=second[path[0]].routes[path[1]];
 return {title:'Очима людини в черзі',context:scenes[route][0],who:'Жінка з черги',quote:scenes[route][1],options:lastOptions};
}
function moveFocus(){
 app.querySelector('h2').focus({preventScroll:true});
 window.scrollTo(0,0);
}

// Перехід: кадр одразу їде далі, поточний екран відлітає, потім малюється новий.
function advance(nextStep, action){
 if(busy)return;
 const leaving=app.firstElementChild;
 document.body.dataset.step=nextStep;
 if(reduced.matches||!leaving){action();return}
 busy=true;
 leaving.classList.add('leaving');
 setTimeout(()=>{busy=false;action()},360);
}

// Слова з’являються по одному, ніби репліку кажуть.
function say(text){
 return text.split(' ').map((w,i)=>`<span class="w" style="--i:${i}">${w}</span>`).join(' ');
}

// Стежка: пройдені рішення — літери з кольорами, поточне — кільце, попереду — порожні вузли.
function trail(){
 let html='';
 for(let i=0;i<3;i++){
  const done=i<path.length, now=i===path.length;
  html+=`<i class="n${done?' done':now?' now':''}"${done?` style="--h:${HUE[path[i]]}"`:''}>${done?LETTER[path[i]]:''}</i>`;
  if(i<2){
   const reached=i+1<=path.length;
   const from=i<path.length?HUE[path[i]]:'var(--faint)';
   const to=reached?(i+1<path.length?HUE[path[i+1]]:'var(--ink)'):'var(--faint)';
   const fresh=reached&&i+1===path.length;
   html+=`<b class="seg${reached?' done':''}${fresh?' fresh':''}" style="--h1:${from};--h2:${to}"></b>`;
  }
 }
 return html;
}

function render(){
 if(path.length===3){review();return}
 const scene=current();
 const step=path.length+1;
 document.body.dataset.step=String(step);
 const quote='«'+scene.quote+'»';
 // Варіанти відповіді з’являються, коли репліку вже прочитано.
 const cd=Math.min(1900,520+quote.split(' ').length*34+260);
 app.innerHTML = `
   <section class="stage step-${step}" aria-labelledby="scene-title">
     <div class="reading">
       <p class="progress"><span class="trail" aria-hidden="true">${trail()}</span>Рішення ${step} із 3</p>
       <h2 class="sceneTitle" id="scene-title" tabindex="-1">${scene.title}</h2>
       <p class="context">${scene.context}</p>
       <figure class="dialogue">
         <figcaption class="speaker">${scene.who}</figcaption>
         <blockquote class="speech">${say(quote)}</blockquote>
       </figure>
       <section class="responses" style="--cd:${cd}ms" aria-labelledby="choice-heading">
         <h3 id="choice-heading">Твоя відповідь</h3>
         <div class="tree"></div>
       </section>
     </div>
   </section>`;
 const responses=app.querySelector('.responses');
 const tree=app.querySelector('.tree');
 scene.options.forEach((label,index)=>{
   const button=document.createElement('button');
   button.className='choice';
   button.style.setProperty('--h',HUE[index]);
   button.style.setProperty('--k',index);
   const marker = document.createElement('span');
   marker.className = 'choice-marker';
   marker.setAttribute('aria-hidden', 'true');
   marker.textContent = LETTER[index];
   const reply = document.createElement('span');
   reply.textContent = label;
   button.append(marker, reply);
   button.onclick=()=>{
     if(busy)return;
     button.classList.add('picked');
     responses.classList.add('has-pick');
     const next=path.length+2<=3?String(path.length+2):'review';
     advance(next,()=>{path.push(index);render();moveFocus()});
   };
   tree.append(button);
 });
}
function describeRun([a, b, c]) {
  const middle = second[a];
  const route = middle.routes[b];
  return {
    choices: [first.options[a], middle.options[b], lastOptions[c]],
    effects: [first.effects[a], scenes[route][0], lastEffects[c]],
    witness: scenes[route][1],
    route
  };
}

function compareRuns(previous, current) {
  const changed = current.choices.findIndex((choice, i) => choice !== previous.choices[i]);
  if (changed < 0) return '<p class="comparison-note">Обидва проходження збігаються. Щоб дослідити інший наслідок, переграй одне з рішень.</p>';
  const versions = [previous, current].map((run, index) => {
    const witness = changed < 2
      ? `<dt>Що почула або побачила жінка</dt><dd>«${run.witness}»</dd>`
      : '';
    return `<section><h4>${index === 0 ? 'Попереднього разу' : 'Цього разу'}</h4>
      <dl><dt>Твоя відповідь</dt><dd>${run.choices[changed]}</dd>
      <dt>Безпосередній наслідок</dt><dd>${run.effects[changed]}</dd>
      ${witness}</dl></section>`;
  }).join('');
  return `<section class="comparison"><h3>Де розійшлися проходження</h3>
    <p>Перша відмінність — рішення ${changed + 1} із 3.</p>
    <div class="versions">${versions}</div></section>`;
}

function review(){
 document.body.dataset.step='review';
 const result = describeRun(path);
 const { choices, effects, route } = result;
 const comparison = previousRun ? compareRuns(previousRun, result) : '';
 const prompts={priority:'Як ти поясниш, чому перша родина пройшла раніше? Що ти знав про потреби інших людей на той момент?',favor:'Що змінилося б у твоєму проханні до колеги, якби ти вперше бачив цю родину?',seat:'Як людина без твого номера телефону могла б отримати таку саму допомогу?',handoff:'Які слова допомогли колезі самостійно оцінити потребу батька?',clarify:'У який момент твоє запрошення стало для Максима обіцянкою? Як би ти сформулював його тепер?'};
 app.innerHTML=`<section class="review" aria-labelledby="review-title">
   <div class="rv-head"><h2 id="review-title" tabindex="-1">Що змінив твій вибір</h2><p class="rv-sub">Розбір проходження</p></div>
   <ol class="route" style="--h1:${HUE[path[0]]};--h2:${HUE[path[1]]};--h3:${HUE[path[2]]}"></ol>
   ${comparison}
   <div class="rv-ask"><h3>Питання до тебе</h3><blockquote>${prompts[route]}</blockquote></div>
 </section>`;
 choices.forEach((label,i)=>{
   const li=document.createElement('li');
   li.style.setProperty('--h',HUE[path[i]]);
   li.style.setProperty('--k',i);
   li.innerHTML='<i class="node" aria-hidden="true">'+LETTER[path[i]]+'</i><span class="step">Рішення '+(i+1)+'</span><strong>'+label+'</strong><p>'+effects[i]+'</p>';
   const btn=document.createElement('button');
   btn.className='replay';
   btn.innerHTML='<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>Переграти рішення '+(i+1);
   btn.onclick=()=>{previousRun=result;advance(String(i+1),()=>{path.length=i;render();moveFocus()})};
   li.append(btn);
   app.querySelector('.route').append(li);
 });
}
document.getElementById('accept').onclick=()=>advance('1',()=>{render();moveFocus()});
