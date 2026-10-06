const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
    })
  : null;

const memory = new Map();

const CATS = [
  {id:"emberlynx",name:"Ember Lynx",rarity:"Common",emoji:"🔥🐈",color:"#f97316",xp:25},
  {id:"moonwhisker",name:"Moonwhisker",rarity:"Common",emoji:"🌙🐈",color:"#818cf8",xp:27},
  {id:"cloudpaw",name:"Cloudpaw",rarity:"Common",emoji:"☁️🐱",color:"#bae6fd",xp:25},
  {id:"crystalcat",name:"Crystal Cat",rarity:"Uncommon",emoji:"💎🐱",color:"#67e8f9",xp:40},
  {id:"starling",name:"Starling",rarity:"Uncommon",emoji:"⭐🐈",color:"#fef08a",xp:42},
  {id:"spelltail",name:"Spelltail",rarity:"Uncommon",emoji:"🔮🐱",color:"#c084fc",xp:45},
  {id:"frostfang",name:"Frostfang",rarity:"Rare",emoji:"❄️🐈",color:"#93c5fd",xp:65},
  {id:"thunderpurr",name:"Thunderpurr",rarity:"Rare",emoji:"⚡🐱",color:"#facc15",xp:75},
  {id:"fairycat",name:"Fairy Cat",rarity:"Rare",emoji:"🧚🐈",color:"#f9a8d4",xp:70},
  {id:"aurorawisp",name:"Aurora Wisp",rarity:"Epic",emoji:"🌌🐈",color:"#a78bfa",xp:115},
  {id:"voidpanther",name:"Void Panther",rarity:"Epic",emoji:"🌑🐈",color:"#475569",xp:135},
  {id:"celestiallion",name:"Celestial Lion",rarity:"Legendary",emoji:"☀️🦁",color:"#facc15",xp:275}
];

function getCat(id) { return CATS.find(c => c.id === id); }
function rarityWeight(r) {
  return {Common:62,Uncommon:24,Rare:10,Epic:3.5,Legendary:0.5}[r] || 1;
}
function randomCat() {
  const total = CATS.reduce((s,c)=>s+rarityWeight(c.rarity),0);
  let n = Math.random()*total;
  for (const c of CATS) { n -= rarityWeight(c.rarity); if(n<=0) return c; }
  return CATS[0];
}
function today() { return new Date().toISOString().slice(0,10); }
function freshPlayer(id) {
  return {id,xp:0,coins:100,treats:10,streak:0,lastDaily:null,catches:[],createdAt:new Date().toISOString()};
}

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, xp INTEGER NOT NULL DEFAULT 0, coins INTEGER NOT NULL DEFAULT 100,
      treats INTEGER NOT NULL DEFAULT 10, streak INTEGER NOT NULL DEFAULT 0,
      last_daily TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS catches (
      id BIGSERIAL PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      cat_id TEXT NOT NULL, lat DOUBLE PRECISION, lng DOUBLE PRECISION, caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS catches_player_idx ON catches(player_id);
  `);
}

async function loadPlayer(id) {
  if (!pool) return memory.get(id) || null;
  const p = await pool.query("SELECT * FROM players WHERE id=$1",[id]);
  if (!p.rows[0]) return null;
  const c = await pool.query("SELECT cat_id,lat,lng,caught_at FROM catches WHERE player_id=$1 ORDER BY caught_at DESC",[id]);
  return {
    id:p.rows[0].id,xp:p.rows[0].xp,coins:p.rows[0].coins,treats:p.rows[0].treats,
    streak:p.rows[0].streak,lastDaily:p.rows[0].last_daily,catches:c.rows.map(x=>({catId:x.cat_id,lat:x.lat,lng:x.lng,caughtAt:x.caught_at}))
  };
}

async function saveNewPlayer(id) {
  const p = freshPlayer(id);
  if (!pool) { memory.set(id,p); return p; }
  await pool.query("INSERT INTO players(id) VALUES($1) ON CONFLICT DO NOTHING",[id]);
  return await loadPlayer(id);
}

async function updateStats(p) {
  if (!pool) { memory.set(p.id,p); return; }
  await pool.query("UPDATE players SET xp=$2,coins=$3,treats=$4,streak=$5,last_daily=$6,updated_at=NOW() WHERE id=$1",
    [p.id,p.xp,p.coins,p.treats,p.streak,p.lastDaily]);
}

async function addCatch(p, catId, lat, lng) {
  const caught = {catId,lat,lng,caughtAt:new Date().toISOString()};
  p.catches.unshift(caught);
  if (!pool) return;
  await pool.query("INSERT INTO catches(player_id,cat_id,lat,lng) VALUES($1,$2,$3,$4)",[p.id,catId,lat,lng]);
}

function publicPlayer(p) {
  const counts = {};
  for (const c of p.catches) counts[c.catId]=(counts[c.catId]||0)+1;
  return {...p,counts,unique:Object.keys(counts).length,level:Math.floor(p.xp/250)+1};
}

app.get("/api/cats", (req,res)=>res.json(CATS));

app.post("/api/player", async (req,res)=>{
  try {
    const id = String(req.body.id || crypto.randomUUID()).slice(0,80);
    let p = await loadPlayer(id);
    if (!p) p = await saveNewPlayer(id);
    res.json(publicPlayer(p));
  } catch(e) { res.status(500).json({error:"Could not load player"}); }
});

app.post("/api/daily", async (req,res)=>{
  try {
    const p = await loadPlayer(String(req.body.id||""));
    if (!p) return res.status(404).json({error:"Player not found"});
    if (p.lastDaily === today()) return res.json({player:publicPlayer(p),claimed:false});
    p.lastDaily=today(); p.coins+=50; p.treats+=3; p.streak+=1;
    await updateStats(p);
    res.json({player:publicPlayer(p),claimed:true,reward:{coins:50,treats:3}});
  } catch(e){res.status(500).json({error:"Daily reward failed"});}
});

app.post("/api/catch", async (req,res)=>{
  try {
    const p = await loadPlayer(String(req.body.id||""));
    if (!p) return res.status(404).json({error:"Player not found"});
    if (!Number.isFinite(req.body.lat)||!Number.isFinite(req.body.lng))
      return res.status(400).json({error:"Location required"});
    if (p.treats < 1) return res.status(400).json({error:"No treats left"});
    const cat = getCat(String(req.body.catId));
    if (!cat) return res.status(400).json({error:"Unknown cat"});
    p.treats -= 1;
    const bonus = cat.rarity === "Legendary" ? 100 : cat.rarity === "Epic" ? 40 : 0;
    p.xp += cat.xp + bonus;
    p.coins += cat.rarity === "Legendary" ? 50 : cat.rarity === "Epic" ? 20 : 5;
    await addCatch(p,cat.id,req.body.lat,req.body.lng);
    await updateStats(p);
    res.json({success:true,cat,player:publicPlayer(p)});
  } catch(e){ console.error(e); res.status(500).json({error:"Catch failed"}); }
});

app.post("/api/buy-treats", async (req,res)=>{
  try {
    const p=await loadPlayer(String(req.body.id||""));
    if(!p) return res.status(404).json({error:"Player not found"});
    const qty=Math.max(1,Math.min(50,Number(req.body.qty)||1));
    const cost=qty*5;
    if(p.coins<cost) return res.status(400).json({error:"Not enough coins"});
    p.coins-=cost;p.treats+=qty;await updateStats(p);
    res.json({player:publicPlayer(p)});
  }catch(e){res.status(500).json({error:"Purchase failed"});}
});

app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

initDb().then(()=>app.listen(PORT,()=>console.log(`CatGO running on ${PORT}`)))
.catch(err=>{console.error(err);process.exit(1)});
