(()=>{
const DB_NAME='imagegen-vault';
const DB_VERSION=2;
const POS_KEYS=['base','hair','outfit','footwear','accessories','other'];
let dbPromise=null;
function $(q){return document.querySelector(q)}
function $$(q){return [...document.querySelectorAll(q)]}
function uid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      ['items','chars','scenes'].forEach(name=>{if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'})});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
function getAll(db,name){
  return new Promise((resolve,reject)=>{
    const req=db.transaction(name).objectStore(name).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}
function putItem(db,item){
  return new Promise((resolve,reject)=>{
    const req=db.transaction('items','readwrite').objectStore('items').put(item);
    req.onsuccess=()=>resolve();
    req.onerror=()=>reject(req.error);
  });
}
function toast(text){
  const el=$('#toast');
  if(!el)return;
  el.textContent=text;
  el.classList.remove('hide');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>el.classList.add('hide'),1700);
}
function splitRaw(raw=''){
  const text=String(raw||'').trim();
  const out={base:'',hair:'',outfit:'',footwear:'',accessories:'',other:'',negative:''};
  if(!text)return out;
  const labels=[['hair','Hair:'],['outfit','Outfit:'],['footwear','Footwear:'],['footwear','Shoes:'],['accessories','Accessories:'],['negative','Negative prompt:'],['negative','Negative Prompt:'],['other','Other:']];
  const marks=[];
  labels.forEach(([key,label])=>{const idx=text.indexOf(label);if(idx>=0)marks.push({key,label,idx})});
  marks.sort((a,b)=>a.idx-b.idx);
  if(!marks.length){out.base=text;return out}
  out.base=text.slice(0,marks[0].idx).trim();
  marks.forEach((mark,i)=>{
    const start=mark.idx+mark.label.length;
    const end=i+1<marks.length?marks[i+1].idx:text.length;
    out[mark.key]=text.slice(start,end).trim();
  });
  return out;
}
function normChar(c={}){
  const s=c.sections?{...c.sections}:splitRaw(c.prompt||'');
  return {
    ...c,
    id:c.id||uid(),
    name:c.name||'無名キャラ',
    sections:{base:s.base||'',hair:s.hair||'',outfit:s.outfit||'',footwear:s.footwear||'',accessories:s.accessories||'',other:s.other||'',negative:s.negative||c.negative||''},
    variants:Array.isArray(c.variants)?c.variants:[]
  };
}
async function buildPromptCharacterNegative(){
  const db=await openDb();
  const chars=(await getAll(db,'chars')).map(normChar);
  const scenes=await getAll(db,'scenes');
  const blocks=[];
  $$('[data-role="char"]:checked').forEach(input=>{
    const c=chars.find(x=>x.id===input.value);
    if(!c)return;
    const parts=[];
    POS_KEYS.forEach(key=>{
      const toggle=$(`[data-role="sec"][data-char="${c.id}"][data-sec="${key}"]`);
      if(toggle&&toggle.checked&&c.sections[key])parts.push(c.sections[key]);
    });
    (c.variants||[]).forEach((variant,index)=>{
      const toggle=$(`[data-role="var"][data-char="${c.id}"][data-var="${index}"]`);
      if(toggle&&toggle.checked&&variant.prompt)parts.push(variant.prompt);
    });
    const negToggle=$(`[data-role="sec"][data-char="${c.id}"][data-sec="negative"]`);
    if(negToggle&&negToggle.checked&&c.sections.negative)parts.push(`Negative prompt: ${c.sections.negative}`);
    if(parts.length)blocks.push([`${c.name}:`,...parts].join('\n'));
  });
  $$('[data-role="scene"]:checked').forEach(input=>{
    const scene=scenes.find(x=>x.id===input.value);
    if(scene&&scene.prompt)blocks.push(scene.prompt);
  });
  const extra=$('#builderExtra')?.value.trim();
  if(extra)blocks.push(extra);
  const commonNegative=$('#builderCommonNegative')?.value.trim();
  if(commonNegative)blocks.push(`Negative prompt: ${commonNegative}`);
  return blocks.join('\n\n');
}
async function copyText(text){
  await navigator.clipboard.writeText(text||'');
  toast('コピーした');
}
function injectCommonNegativeField(){
  if($('#builderCommonNegative'))return;
  const extra=$('#builderExtra');
  if(!extra)return;
  const label=document.createElement('label');
  label.textContent='共通ネガティブ';
  label.setAttribute('for','builderCommonNegative');
  const area=document.createElement('textarea');
  area.id='builderCommonNegative';
  area.placeholder='全体にかけたいネガティブをここに入れる';
  const after=extra.nextElementSibling;
  extra.insertAdjacentElement('afterend',area);
  extra.insertAdjacentElement('afterend',label);
  if(after&&after.id==='saveBuilderScene')area.insertAdjacentElement('afterend',after);
}
function installBuilderOverride(){
  injectCommonNegativeField();
  const buildBtn=$('#buildPrompt');
  const copyBtn=$('#copyOutput');
  const saveBtn=$('#saveOutputOnly');
  const out=$('#builderOutput');
  if(buildBtn)buildBtn.onclick=async()=>{
    out.value=await buildPromptCharacterNegative();
    toast('組み立てた');
  };
  if(copyBtn)copyBtn.onclick=async()=>{
    const text=out.value||await buildPromptCharacterNegative();
    await copyText(text);
  };
  if(saveBtn)saveBtn.onclick=async()=>{
    const prompt=out.value||await buildPromptCharacterNegative();
    if(!prompt.trim())return toast('空');
    const db=await openDb();
    await putItem(db,{id:uid(),title:'組み立てプロンプト',prompt,tags:['prompt'],imageBlob:null,imageData:null,img:null,createdAt:Date.now(),updatedAt:Date.now()});
    toast('保存した');
  };
}
const requestText=`お気に入りの画像または既存プロンプトをもとに、Imagegen Prompt Vault のキャラカードに貼りやすい形へ整理してください。\n\n目的：画像生成で同じキャラを再現しやすくしつつ、あとから髪・服・足元・小物を差し替えやすくすること。\n\n出力ルール：\n- 推測できる範囲でよい。確信がない部分は控えめに書く。\n- 英語の画像生成プロンプトとして使いやすい短文・句で書く。\n- タグではなく、キャラカード本文に入れる内容として整理する。\n- 髪、服、足元、小物は必ず分ける。\n- ネガティブは Negative prompt にまとめる。\n- 差し替え候補があれば「グループ | 名前 | プロンプト」の形で出す。\n- 足元の差し替えは必ずグループ名を「足元」にする。\n\n出力フォーマット：\n名前:\n\n基本:\n\nHair:\n\nOutfit:\n\nFootwear:\n\nAccessories:\n\nOther:\n\nNegative prompt:\n\n差し替えパーツ:\n服 | 室内 | \n服 | 室外 | \n足元 | 室内 | \n足元 | 室外 | \n\n素材：\nここに画像またはプロンプトを貼ります。`;
function injectRequestCard(){
  const target=$('#characters .grid');
  if(!target||$('#requestPromptCopy'))return;
  const card=document.createElement('div');
  card.className='card stack gap-m';
  card.style.gridColumn='1 / -1';
  card.innerHTML=`<h2>AIへの依頼文</h2><p class="muted">画像や既存プロンプトをキャラカード用に整理してもらうための文。</p><textarea id="requestPromptText" class="mono" readonly></textarea><div class="row"><button id="requestPromptCopy" type="button">依頼文をコピー</button></div>`;
  target.prepend(card);
  $('#requestPromptText').value=requestText;
  $('#requestPromptCopy').onclick=()=>copyText(requestText);
}
function init(){
  installBuilderOverride();
  injectRequestCard();
  setTimeout(installBuilderOverride,500);
  setTimeout(injectRequestCard,500);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
