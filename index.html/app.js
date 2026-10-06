const $=s=>document.querySelector(s);
const state={id:localStorage.getItem("catgo_player")||crypto.randomUUID(),player:null,cats:[],map:null,playerMarker:null,catMarkers:[],lat:null,lng:null,selected:null,angle:0};

localStorage.setItem("catgo_player",state.id);

const flavor={
  Common:"A curious cat wandered into your hunting zone.",
  Uncommon:"This cat has a little more personality than most.",
  Rare:"You found one that doesn't show up every day.",
  Epic:"A spectacular cat! Your luck is shining.",
  Legendary:"LEGENDARY! Stories will be told about this catch."
};

async function api(url,body){
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await r.json(); if(!r.ok)throw new Error(data.error||"Something went wrong"); return data;
}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2200)}
function renderStats(){
  const p=state.player;if(!p)return;
  $("#level").textContent=p.level;$("#coins").textContent=p.coins;$("#treats").textContent=p.treats;
  $("#uniqueCount").textContent=p.unique;$("#caughtTotal").textContent=p.catches.length;$("#streak").textContent=p.streak;$("#uniqueProfile").textContent=p.unique;
  const xp=p.xp%250;$("#profileLevel").textContent=`Level ${p.level} · ${p.xp} XP`;
  $("#xpBar").style.width=`${xp/2.5}%`;
  $("#dailyBtn").disabled=p.lastDaily===new Date().toISOString().slice(0,10);
  $("#dailyBtn").textContent=p.lastDaily===new Date().toISOString().slice(0,10)?"BONUS CLAIMED TODAY":"CLAIM DAILY BONUS";
}
function renderGallery(){
  const counts=state.player.counts||{};$("#gallery").innerHTML=state.cats.map(c=>{
    const n=counts[c.id]||0,locked=!n;
    return `<div class="cat-card ${locked?"locked":""}"><div class="art">${locked?"❔":c.emoji}</div>${n?`<span class="count-badge">×${n}</span>`:""}<h3>${locked?"Unknown":c.name}</h3><small>${locked?"Catch to discover":c.rarity}</small></div>`;
  }).join("");
}
function switchView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$("#"+id).classList.add("active");
  document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===id));
  if(id==="mapView"&&state.map)setTimeout(()=>state.map.invalidateSize(),50);
}
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>switchView(n.dataset.view));

function initMap(){
  state.map=L.map("map",{zoomControl:false,attributionControl:true}).setView([14.5995,120.9842],15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(state.map);
}
function setPlayer(lat,lng){
  state.lat=lat;state.lng=lng;
  if(!state.playerMarker)state.playerMarker=L.marker([lat,lng],{icon:L.divIcon({className:"",html:'<div class="player-marker"></div>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(state.map);
  else state.playerMarker.setLatLng([lat,lng]);
}
function spawnCats(){
  if(!state.lat)return;
  state.catMarkers.forEach(m=>state.map.removeLayer(m));state.catMarkers=[];
  const count=9;
  const picks=[];
  for(let i=0;i<count;i++){
    const cat=state.cats[Math.floor(Math.random()*state.cats.length)];
    const dist=.0012+Math.random()*.006;
    const a=Math.random()*Math.PI*2;
    const lat=state.lat+Math.cos(a)*dist, lng=state.lng+Math.sin(a)*dist;
    picks.push({cat,lat,lng});
    const icon=L.divIcon({className:"",html:`<div class="cat-marker ${cat.rarity==="Rare"||cat.rarity==="Epic"||cat.rarity==="Legendary"?"rare":""}">${cat.emoji}</div>`,iconSize:[48,48],iconAnchor:[24,24]});
    const marker=L.marker([lat,lng],{icon}).addTo(state.map);
    marker.on("click",()=>openCatch(cat));
    state.catMarkers.push(marker);
  }
  $("#nearbyCount").textContent=picks.length;
  $("#nearbyList").innerHTML=picks.slice(0,5).map((x,i)=>`<button class="nearby-item" data-i="${i}"><div class="mini">${x.cat.emoji}</div><small>${x.cat.name}</small></button>`).join("");
  document.querySelectorAll(".nearby-item").forEach((b,i)=>b.onclick=()=>openCatch(picks[i].cat));
}
function locate(){
  if(!navigator.geolocation){$("#gpsNotice").textContent="📍 Your browser does not support GPS.";$("#gpsNotice").classList.add("show");return}
  $("#gpsNotice").textContent="📍 Finding your location…";$("#gpsNotice").classList.add("show");
  navigator.geolocation.getCurrentPosition(pos=>{
    setPlayer(pos.coords.latitude,pos.coords.longitude);state.map.setView([state.lat,state.lng],16);$("#gpsNotice").classList.remove("show");spawnCats();
  },()=>{$("#gpsNotice").textContent="📍 Location permission is needed to hunt cats.";$("#gpsNotice").classList.add("show")},{enableHighAccuracy:true,timeout:10000});
}
$("#locateBtn").onclick=locate;$("#scanBtn").onclick=()=>{spawnCats();toast("📡 Scanner refreshed! New cats nearby.")};

function openCatch(cat){
  if(!state.lat){toast("Allow location access first.");return}
  state.selected=cat;$("#catEmoji").textContent=cat.emoji;$("#catName").textContent=cat.name;$("#catRarity").textContent=cat.rarity.toUpperCase();$("#catFlavor").textContent=flavor[cat.rarity];
  $("#catchModal").classList.remove("hidden");startTiming();
}
function startTiming(){
  state.angle=0;cancelAnimationFrame(state.raf);
  const dot=$("#timingDot"),start=performance.now();
  function tick(t){state.angle=((t-start)/850)%1*Math.PI*2;dot.style.transform=`rotate(${state.angle}rad) translateY(-32px)`;state.raf=requestAnimationFrame(tick)}
  state.raf=requestAnimationFrame(tick);
}
function closeCatch(){cancelAnimationFrame(state.raf);$("#catchModal").classList.add("hidden")}
$("#closeCatch").onclick=closeCatch;
$("#catchBtn").onclick=async()=>{
  const cat=state.selected;
  if(!cat||!state.player)return;
  cancelAnimationFrame(state.raf);
  const angle=((state.angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
  const success=angle<.55||angle>5.73||Math.abs(angle-Math.PI)<.55;
  if(!success){$("#timingText").textContent="So close! Try again.";toast("😿 The cat escaped!");startTiming();return}
  try{
    const d=await api("/api/catch",{id:state.id,catId:cat.id,lat:state.lat,lng:state.lng});
    state.player=d.player;renderStats();renderGallery();closeCatch();
    $("#resultEmoji").textContent=cat.emoji;$("#resultTitle").textContent=`Caught ${cat.name}!`;$("#resultText").textContent=`${cat.rarity} cat added to your gallery.`;$("#resultXp").textContent=`+${cat.xp+(cat.rarity==="Legendary"?100:cat.rarity==="Epic"?40:0)} XP`;$("#resultCoins").textContent=`+${cat.rarity==="Legendary"?50:cat.rarity==="Epic"?20:5}`;
    $("#resultModal").classList.remove("hidden");spawnCats();
  }catch(e){toast(e.message)}
};
$("#continueBtn").onclick=()=>$("#resultModal").classList.add("hidden");
$("#dailyBtn").onclick=async()=>{try{const d=await api("/api/daily",{id:state.id});state.player=d.player;renderStats();toast(d.claimed?"🎁 +50 coins and +3 treats!":"Already claimed today.")}catch(e){toast(e.message)}};
$("#buyBtn").onclick=async()=>{try{const d=await api("/api/buy-treats",{id:state.id,qty:5});state.player=d.player;renderStats();toast("🍗 5 treats added!")}catch(e){toast(e.message)}};

// Real Cat Camera collection: photos are stored locally in IndexedDB so the
// gallery is separate from the mythical in-game collection.
const realCatDB = (() => {
  let dbp;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve,reject)=>{
      const req=indexedDB.open("catgo-real-cats",1);
      req.onupgradeneeded=()=>req.result.createObjectStore("photos",{keyPath:"id",autoIncrement:true});
      req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
    }); return dbp;
  }
  return {
    async add(data){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction("photos","readwrite");const q=tx.objectStore("photos").add(data);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})},
    async all(){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction("photos","readonly");const q=tx.objectStore("photos").getAll();q.onsuccess=()=>res(q.result.reverse());q.onerror=()=>rej(q.error)})},
    async del(id){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction("photos","readwrite");const q=tx.objectStore("photos").delete(id);q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}
  }
})();
let cameraStream=null;

async function renderRealGallery(){
  const box=$("#realGallery"); if(!box)return;
  const photos=await realCatDB.all();
  if(!photos.length){
    box.innerHTML=`<div class="empty-real"><div>📷</div><h3>No real cats yet</h3><p>Use the Cat Camera to photograph a real cat. Your photos stay in this browser.</p><button class="primary" onclick="switchView('cameraView')">OPEN CAMERA</button></div>`;
    return;
  }
  box.innerHTML=photos.map(x=>`
    <div class="real-card">
      <img src="${x.data}" alt="Real cat captured on ${new Date(x.createdAt).toLocaleDateString()}">
      <div class="real-card-info"><b>REAL CAT</b><small>${new Date(x.createdAt).toLocaleDateString()}</small></div>
      <button class="delete-real" data-id="${x.id}">×</button>
    </div>`).join("");
  box.querySelectorAll(".delete-real").forEach(b=>b.onclick=async()=>{await realCatDB.del(Number(b.dataset.id));renderRealGallery();toast("Photo removed.")});
}

async function saveRealPhoto(data){
  await realCatDB.add({data,createdAt:Date.now()});
  await renderRealGallery();
  toast("📷 Real cat added to your separate gallery!");
}

function stopCamera(){
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}
  const v=$("#cameraVideo");if(v)v.srcObject=null;
}
async function startCamera(){
  try{
    cameraStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
    $("#cameraVideo").srcObject=cameraStream;$("#captureCat").disabled=false;$("#cameraStatus").textContent="Camera active — frame a cat safely.";
  }catch(e){$("#cameraStatus").textContent="Camera permission was denied or unavailable.";toast("Camera permission is required.")}
}
async function captureRealCat(){
  if(!cameraStream)return;
  const v=$("#cameraVideo"),c=$("#cameraCanvas");
  c.width=v.videoWidth||1280;c.height=v.videoHeight||720;
  c.getContext("2d").drawImage(v,0,0,c.width,c.height);
  await saveRealPhoto(c.toDataURL("image/jpeg",.82));
}
$("#startCamera")?.addEventListener("click",startCamera);
$("#captureCat")?.addEventListener("click",captureRealCat);
$("#photoInput")?.addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  const reader=new FileReader();reader.onload=()=>saveRealPhoto(reader.result);reader.readAsDataURL(file);e.target.value="";
});
document.querySelectorAll(".gallery-tab").forEach(tab=>tab.onclick=()=>{
  document.querySelectorAll(".gallery-tab").forEach(x=>x.classList.remove("active"));tab.classList.add("active");
  const mythical=tab.dataset.gallery==="mythical";
  $("#gallery").classList.toggle("hidden-gallery",!mythical);
  $("#realGallery").classList.toggle("hidden-gallery",mythical);
  if(!mythical)renderRealGallery();
});

async function boot(){
  initMap();
  try{
    const cats=await fetch("/api/cats").then(r=>r.json());state.cats=cats;
    state.player=await api("/api/player",{id:state.id});renderStats();renderGallery();
    const daily=await api("/api/daily",{id:state.id});state.player=daily.player;renderStats();renderRealGallery();
    locate();
  }catch(e){toast("Could not connect to the game server.")}
}
boot();
