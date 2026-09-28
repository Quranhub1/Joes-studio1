import crypto from "node:crypto";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
export const USER_COOKIE = "joes_user_session";
export const ADMIN_COOKIE = "joes_admin_session";
export const FREE_BATCH_LIMIT = Number(process.env.FREE_BATCH_LIMIT || 3);
export const SESSION_TTL = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 24 * 30);

export function json(res,status,body,extra={}) {
  res.status(status).setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  Object.entries(extra).forEach(([k,v])=>res.setHeader(k,v));
  res.end(JSON.stringify(body));
}
export function allowedOrigin(req){
  const origin=String(req.headers.origin||"");
  const configured=String(process.env.APP_ORIGIN||process.env.FRONTEND_ORIGIN||"").replace(/\/$/,"");
  if(configured && origin===configured) return origin;
  if(origin==="https://quranhub1.github.io") return origin;
  if(/^https:\/\/[^.]+\.vercel\.app$/.test(origin)) return origin;
  return configured || "https://quranhub1.github.io";
}
export function cors(req,res){
  const origin=allowedOrigin(req);
  if(origin) res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Access-Control-Allow-Credentials","true");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Vary","Origin");
}
export function requireOrigin(req){
  const origin=String(req.headers.origin||"");
  if(!origin) return true;
  return origin===allowedOrigin(req);
}
export async function redis(command,...args){
  if(!REDIS_URL||!REDIS_TOKEN) throw new Error("Redis storage is not configured");
  const r=await fetch(REDIS_URL,{method:"POST",headers:{Authorization:"Bearer "+REDIS_TOKEN,"Content-Type":"application/json"},body:JSON.stringify([command,...args])});
  if(!r.ok) throw new Error("Redis request failed");
  const data=await r.json();
  return data.result;
}
export async function evalRedis(script,keys=[],args=[]){
  return redis("EVAL",script,String(keys.length),...keys,...args);
}
export function safeEqual(a,b){
  const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
export function parseCookie(req,name){
  const raw=req.headers.cookie||"";
  const hit=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
  return hit?decodeURIComponent(hit.slice(name.length+1)):"";
}
export function cookieHeader(name,value,maxAge=SESSION_TTL){
  return name+"="+encodeURIComponent(value)+"; Path=/; HttpOnly; Secure; SameSite=None; Max-Age="+maxAge;
}
export function clearCookie(name){
  return name+"=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0";
}
export function publicUser(user){
  if(!user) return null;
  return {
    id:user.id,email:user.email,name:user.name,avatar:user.avatar||null,
    plan:user.plan||{tier:"free",status:"active",startAt:user.createdAt,endAt:null},
    usage:user.usage||{periodKey:currentPeriodKey(),batchesUsed:0,batchLimit:FREE_BATCH_LIMIT},
    banned:!!user.banned,createdAt:user.createdAt
  };
}
export function currentPeriodKey(){
  const d=new Date();
  return d.toISOString().slice(0,7);
}
export function normalizeUser(input={}){
  const now=new Date().toISOString();
  const legacy=input.subscription||{};
  const tier=String(input.plan?.tier||legacy.tier||"free").toLowerCase()==="pro"?"pro":"free";
  let status=String(input.plan?.status||legacy.status||"active").toLowerCase();
  const endAt=input.plan?.endAt||legacy.endDate||null;
  if(tier==="pro" && status==="active" && endAt && Number.isFinite(Date.parse(endAt)) && Date.parse(endAt)<=Date.now()) status="expired";
  const periodKey=String(input.usage?.periodKey||currentPeriodKey());
  const batchesUsed=Number.isFinite(Number(input.usage?.batchesUsed))?Math.max(0,Number(input.usage.batchesUsed)):Math.max(0,Number(legacy.batchesUsed)||0);
  return {
    id:String(input.id||crypto.randomUUID()),
    email:String(input.email||"").trim().toLowerCase().slice(0,200),
    name:String(input.name||"").trim().slice(0,120),
    avatar:input.avatar||null,
    auth:{
      password:input.auth?.password||input.password||null,
      googleSub:input.auth?.googleSub||input.googleId||null
    },
    plan:{
      tier,
      status:["active","pending","expired","cancelled"].includes(status)?status:"active",
      startAt:input.plan?.startAt||legacy.startDate||now,
      endAt,
      renewalAt:input.plan?.renewalAt||legacy.renewalDate||null
    },
    usage:{periodKey,batchesUsed,batchLimit:tier==="pro"?Number.MAX_SAFE_INTEGER:FREE_BATCH_LIMIT},
    banned:!!input.banned,
    bannedAt:input.bannedAt||null,
    bannedReason:String(input.bannedReason||legacy.bannedReason||"").slice(0,500),
    createdAt:input.createdAt||now,
    updatedAt:now
  };
}
export async function getUser(id){
  const v=await redis("get","joes:user:"+id);
  return v?normalizeUser(typeof v==="string"?JSON.parse(v):v):null;
}
export async function saveUser(user){
  const normalized=normalizeUser(user);
  await redis("set","joes:user:"+normalized.id,JSON.stringify(normalized));
  await redis("sadd","joes:users",normalized.id);
  await redis("set","joes:user:email:"+normalized.email,normalized.id);
  if(normalized.auth?.googleSub) await redis("set","joes:user:google:"+String(normalized.auth.googleSub),normalized.id);
  return normalized;
}
export async function createUser(data={}){
  const user=normalizeUser({id:crypto.randomUUID(),email:data.email,name:data.name,avatar:data.avatar,auth:{googleSub:data.googleSub||null},createdAt:new Date().toISOString()});
  return saveUser(user);
}
export async function findUserByEmail(email){
  const id=await redis("get","joes:user:email:"+String(email||"").trim().toLowerCase());
  return id?getUser(id):null;
}
export async function findUserByGoogleSub(googleSub){
  const sub=String(googleSub||"").trim();
  if(!sub) return null;
  const id=await redis("get","joes:user:google:"+sub);
  return id?getUser(id):null;
}
export async function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const derived=await new Promise((resolve,reject)=>crypto.scrypt(String(password),salt,64,{N:32768,r:8,p:3,maxmem:128*1024*1024},(e,d)=>e?reject(e):resolve(d)));
  return {algorithm:"scrypt","salt":salt.toString("base64url"),hash:Buffer.from(derived).toString("base64url"),version:1};
}
export async function verifyPassword(password,record){
  if(!record?.salt||!record?.hash) return false;
  const salt=Buffer.from(record.salt,"base64url");
  const derived=await new Promise((resolve,reject)=>crypto.scrypt(String(password),salt,64,{N:32768,r:8,p:3,maxmem:128*1024*1024},(e,d)=>e?reject(e):resolve(d)));
  return safeEqual(Buffer.from(derived).toString("base64url"),record.hash);
}
function tokenHash(token){return crypto.createHmac("sha256",String(process.env.USER_SESSION_SECRET||"")).update(token).digest("hex")}
export async function createSession(userId,type="user"){
  const token=crypto.randomBytes(32).toString("base64url");
  const key="joes:session:"+type+":"+tokenHash(token);
  const hash=tokenHash(token);
  await redis("set",key,JSON.stringify({userId,createdAt:new Date().toISOString()}),"EX",SESSION_TTL);
  await redis("sadd","joes:user:sessions:"+userId,hash);
  return token;
}
export async function getSession(req,type="user"){
  const token=parseCookie(req,type==="admin"?ADMIN_COOKIE:USER_COOKIE);
  if(!token) return null;
  const value=await redis("get","joes:session:"+type+":"+tokenHash(token));
  if(!value) return null;
  const session=typeof value==="string"?JSON.parse(value):value;
  const userId=session?.userId;
  if(!userId) return null;
  return {token,userId};
}
export async function destroySession(req,type="user"){
  const token=parseCookie(req,type==="admin"?ADMIN_COOKIE:USER_COOKIE);
  if(!token) return;
  const hash=tokenHash(token);
  const key="joes:session:"+type+":"+hash;
  const value=await redis("get",key);
  await redis("del",key);
  try{const session=typeof value==="string"?JSON.parse(value):value;if(session?.userId) await redis("srem","joes:user:sessions:"+session.userId,hash);}catch(_){}
}
export function requireConfig(){
  if(!process.env.USER_SESSION_SECRET) throw new Error("USER_SESSION_SECRET is not configured");
  if(!REDIS_URL||!REDIS_TOKEN) throw new Error("Redis storage is not configured");
}
