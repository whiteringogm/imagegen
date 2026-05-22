(()=>{
const DB_NAME='imagegen-vault';
const DB_VERSION=2;
let dbPromise=null;
function isBlob(x){return x instanceof Blob}
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
function getItem(db,id){
  return new Promise((resolve,reject)=>{
    const req=db.transaction('items').objectStore('items').get(id);
    req.onsuccess=()=>resolve(req.result||null);
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
function blobToDataURL(blob){
  return new Promise(resolve=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>resolve(null);
    reader.readAsDataURL(blob);
  });
}
async function stableSrc(item){
  if(!item)return '';
  if(typeof item.imageData==='string'&&item.imageData.startsWith('data:'))return item.imageData;
  const blob=item.imageBlob instanceof Blob?item.imageBlob:item.img instanceof Blob?item.img:null;
  if(!blob)return '';
  const data=await blobToDataURL(blob);
  if(data){
    item.imageData=data;
    item.img=null;
    try{const db=await openDb();await putItem(db,item)}catch(e){}
  }
  return data||'';
}
async function fixImages(){
  let db;
  try{db=await openDb()}catch(e){return}
  const nodes=[...document.querySelectorAll('[data-item] img.thumb')];
  for(const img of nodes){
    const wrap=img.closest('[data-item]');
    const id=wrap&&wrap.dataset.item;
    if(!id)continue;
    try{
      const item=await getItem(db,id);
      const src=await stableSrc(item);
      if(src&&img.src!==src)img.src=src;
    }catch(e){}
  }
}
const kick=()=>{clearTimeout(kick.t);kick.t=setTimeout(fixImages,60)};
new MutationObserver(kick).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',kick);
document.addEventListener('click',()=>setTimeout(kick,250));
setInterval(fixImages,2000);
kick();
})();
