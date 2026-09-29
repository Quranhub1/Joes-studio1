import crypto from "node:crypto";
import {cors,json,requireOrigin,getSession,getUser,redis} from "./_auth.mjs";

async function paymentConfig(){
  const stored=await redis("get","joes:plans").catch(()=>null);
  const plans=stored?(typeof stored==="string"?JSON.parse(stored):stored):null;
  return {
    method:process.env.PAYMENT_METHOD||"Mobile Money",
    accountName:process.env.PAYMENT_ACCOUNT_NAME||"Kabali Madina",
    accountNumber:process.env.PAYMENT_ACCOUNT_NUMBER||"+256749846848",
    currency:process.env.PAYMENT_CURRENCY||"UGX",
    proPrice:plans?.pro?.price||process.env.PRO_PRICE||""
  };
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(!requireOrigin(req)) return json(res,403,{error:"Origin not allowed"});
  try{
    if(req.method==="GET"){
      const payment=await paymentConfig();
      let request=null;
      const session=await getSession(req,"user").catch(()=>null);
      if(session?.userId){
        const ids=await redis("smembers","joes:payments").catch(()=>[]);
        const own=[];
        for(const id of (ids||[])){
          const raw=await redis("get","joes:payment:"+id).catch(()=>null);
          if(!raw) continue;
          const item=typeof raw==="string"?JSON.parse(raw):raw;
          if(item?.userId===session.userId) own.push(item);
        }
        own.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
        request=own[0]||null;
      }
      return json(res,200,{payment,request});
    }
    const session=await getSession(req,"user");
    if(!session) return json(res,401,{error:"Not authenticated"});
    const user=await getUser(session.userId);
    if(!user||user.banned) return json(res,403,{error:"Account unavailable"});
    if(req.method==="POST"){
      const body=req.body||{};
      const reference=String(body.reference||"").trim().slice(0,120);
      const config=await paymentConfig();
      const amount=String(body.amount||config.proPrice||"").trim().slice(0,40);
      const requestedDuration=String(body.duration||"monthly").toLowerCase();
      const duration=["weekly","monthly","quarterly","yearly"].includes(requestedDuration)?requestedDuration:"monthly";
      if(!reference) return json(res,400,{error:"Payment reference is required"});
      const id=crypto.randomUUID();
      const now=new Date().toISOString();
      const item={id,userId:user.id,email:user.email,name:user.name,plan:"pro",duration,amount,currency:config.currency,reference,status:"pending",notes:String(body.notes||"").slice(0,500),createdAt:now,updatedAt:now};
      await redis("set","joes:payment:"+id,JSON.stringify(item));
      await redis("sadd","joes:payments",id);
      return json(res,201,{ok:true,payment:item});
    }
    return json(res,405,{error:"Method not allowed"});
  }catch(e){return json(res,500,{error:e.message||"Payment request failed"});}
}
