import crypto from "node:crypto";
import {cors,json,requireOrigin,redis,safeEqual,createSession,getSession,destroySession,getUser,saveUser,normalizeUser,publicUser,ADMIN_COOKIE,cookieHeader,clearCookie,evalRedis,FREE_BATCH_LIMIT,currentPeriodKey} from "./_auth.mjs";

const ADMIN_USERNAME=process.env.ADMIN_USERNAME||"";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"";

function plans(){
  return {
    free:{id:"free",name:"Free",batchLimit:FREE_BATCH_LIMIT,price:"0",currency:process.env.PAYMENT_CURRENCY||"UGX"},
    pro:{id:"pro",name:"Pro",batchLimit:Number.MAX_SAFE_INTEGER,price:process.env.PRO_PRICE||"",currency:process.env.PAYMENT_CURRENCY||"UGX"}
  };
}
function adminAuthed(session){return !!session?.userId&&session.userId.startsWith("admin:")}
async function listUsers(){
  const ids=await redis("smembers","joes:users")||[];
  const users=await Promise.all(ids.map(async id=>{try{return await getUser(id)}catch(_){return null}}));
  const period=currentPeriodKey();
  const normalized=users.filter(Boolean);
  await Promise.all(normalized.map(async user=>{ const count=await redis("get","joes:usage:"+user.id+":"+period).catch(()=>null); if(count!==null&&count!==undefined){user.usage={periodKey:period,batchesUsed:Number(count)||0,batchLimit:user.plan?.tier==="pro"?Number.MAX_SAFE_INTEGER:FREE_BATCH_LIMIT};} }));
  return normalized.map(publicUser).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function listPayments(){
  const ids=await redis("smembers","joes:payments")||[];
  const values=await Promise.all(ids.map(id=>redis("get","joes:payment:"+id).catch(()=>null)));
  return values.filter(Boolean).map(v=>typeof v==="string"?JSON.parse(v):v).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
function durationEnd(duration){
  const d=new Date();
  if(duration==="weekly") d.setDate(d.getDate()+7);
  else if(duration==="monthly") d.setMonth(d.getMonth()+1);
  else if(duration==="quarterly") d.setMonth(d.getMonth()+3);
  else if(duration==="yearly"||duration==="annual") d.setFullYear(d.getFullYear()+1);
  else d.setMonth(d.getMonth()+1);
  return d.toISOString();
}
async function approvePayment(payment,approve=true){
  const user=await getUser(payment.userId);
  if(!user) throw new Error("User no longer exists");
  const now=new Date().toISOString();
  const updatedPayment={...payment,status:approve?"approved":"rejected",approvedAt:approve?now:null,updatedAt:now};
  if(approve){
    const start=now,end=durationEnd(String(payment.duration||"monthly"));
    user.plan={tier:"pro",status:"active",startAt:start,endAt:end,renewalAt:end};
    user.usage={...(user.usage||{}),batchLimit:Number.MAX_SAFE_INTEGER};
  }
  user.updatedAt=now;
  const result=await evalRedis(`#!lua
local user=ARGV[1]
local payment=ARGV[2]
redis.call('SET',KEYS[1],user)
redis.call('SET',KEYS[2],payment)
return 1`,["joes:user:"+user.id,"joes:payment:"+payment.id],[JSON.stringify(normalizeUser(user)),JSON.stringify(updatedPayment)]);
  if(Number(result)!==1) throw new Error("Approval transaction failed");
  return {payment:updatedPayment,user:normalizeUser(user)};
}
export default async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(!requireOrigin(req)) return json(res,403,{error:"Origin not allowed"});
  try{
    const url=new URL(req.url,"https://admin.local");
    const action=url.searchParams.get("action")||"";
    if(req.method==="POST"&&action==="login"){
      if(!ADMIN_USERNAME||!ADMIN_PASSWORD) return json(res,503,{error:"Admin credentials are not configured"});
      const body=req.body||{};
      if(!safeEqual(body.username||"",ADMIN_USERNAME)||!safeEqual(body.password||"",ADMIN_PASSWORD)) return json(res,401,{error:"Invalid admin credentials"});
      const token=await createSession("admin:"+ADMIN_USERNAME,"admin");
      res.setHeader("Set-Cookie",cookieHeader(ADMIN_COOKIE,token,8*60*60));
      return json(res,200,{ok:true});
    }
    if(req.method==="POST"&&action==="logout"){
      await destroySession(req,"admin");res.setHeader("Set-Cookie",clearCookie(ADMIN_COOKIE));return json(res,200,{ok:true});
    }
    const session=await getSession(req,"admin");
    if(!adminAuthed(session)) return json(res,401,{error:"Unauthorized"});

    if(req.method==="GET"){
      const [users,payments,storedPlans]=await Promise.all([listUsers(),listPayments(),redis("get","joes:plans").catch(()=>null)]);
      return json(res,200,{users,payments,plans:storedPlans?(typeof storedPlans==="string"?JSON.parse(storedPlans):storedPlans):plans()});
    }

    if(req.method==="PUT"){
      const body=req.body||{};
      if(action==="payment"){
        const id=String(body.id||"");const raw=await redis("get","joes:payment:"+id);
        if(!raw)return json(res,404,{error:"Payment not found"});
        const payment=typeof raw==="string"?JSON.parse(raw):raw;
        if(payment.status!=="pending")return json(res,409,{error:"Payment already resolved"});
        const result=await approvePayment(payment,body.status==="approved");
        return json(res,200,{ok:true,...result});
      }
      if(action==="plans"){
        const current=plans();
        const next={free:{...current.free,...(body.free||{})},pro:{...current.pro,...(body.pro||{})}};
        next.free.batchLimit=Math.max(0,Math.floor(Number(next.free.batchLimit)||FREE_BATCH_LIMIT));
        await redis("set","joes:plans",JSON.stringify(next));
        return json(res,200,{plans:next});
      }
      if(action==="user"){
        const id=String(body.id||body.userId||"");if(!id)return json(res,400,{error:"User id required"});
        const user=await getUser(id);if(!user)return json(res,404,{error:"User not found"});
        if(Object.prototype.hasOwnProperty.call(body,"name"))user.name=String(body.name||"").slice(0,120);
        if(Object.prototype.hasOwnProperty.call(body,"banned")){user.banned=!!body.banned;user.bannedAt=user.banned?new Date().toISOString():null;user.bannedReason=String(body.bannedReason||"").slice(0,500)}
        if(body.tier){
          const tier=String(body.tier).toLowerCase();
          if(tier==="pro"){const start=new Date().toISOString();const end=body.endAt||durationEnd(body.duration||"monthly");user.plan={tier:"pro",status:"active",startAt:start,endAt:end,renewalAt:end};user.usage.batchLimit=Number.MAX_SAFE_INTEGER}
          else {user.plan={tier:"free",status:"active",startAt:user.createdAt,endAt:null,renewalAt:null};user.usage.batchLimit=FREE_BATCH_LIMIT}
        }
        if(body.status) user.plan.status=String(body.status).toLowerCase();
        if(body.resetUsage) user.usage={periodKey:new Date().toISOString().slice(0,7),batchesUsed:0,batchLimit:user.plan.tier==="pro"?Number.MAX_SAFE_INTEGER:FREE_BATCH_LIMIT};
        user.updatedAt=new Date().toISOString();
        const saved=await saveUser(user);
        return json(res,200,{user:publicUser(saved)});
      }
    }

    if(req.method==="DELETE"){
      const id=String(url.searchParams.get("id")||"");if(!id)return json(res,400,{error:"User id required"});
      const user=await getUser(id);if(!user)return json(res,404,{error:"User not found"});
      const sessions=await redis("smembers","joes:user:sessions:"+id)||[];
      await Promise.all(sessions.map(hash=>redis("del","joes:session:user:"+hash).catch(()=>null)));
      await redis("del","joes:user:"+id,"joes:user:email:"+user.email,"joes:user:sessions:"+id);
      await redis("srem","joes:users",id);
      return json(res,200,{ok:true});
    }
    return json(res,405,{error:"Method not allowed"});
  }catch(e){console.error("Admin error:",e);return json(res,500,{error:e.message||"Server error"});}
}
