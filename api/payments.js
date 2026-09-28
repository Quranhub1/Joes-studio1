import crypto from "node:crypto";
import {cors,json,requireOrigin,getSession,getUser,redis} from "./_auth.mjs";

async function paymentConfig(){
  const stored=await redis("get","joes:plans").catch(()=>null);
  const plans=stored?(typeof stored==="string"?JSON.parse(stored):stored):null;
  return {
    method:process.env.PAYMENT_METHOD||"Mobile Money",
    accountName:process.env.PAYMENT_ACCOUNT_NAME||"",
    accountNumber:process.env.PAYMENT_ACCOUNT_NUMBER||"",
    currency:process.env.PAYMENT_CURRENCY||"UGX",
    proPrice:plans?.pro?.price||process.env.PRO_PRICE||""
  };
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(!requireOrigin(req)) return json(res,403,{error:"Origin not allowed"});
  try{
    if(req.method==="GET") return json(res,200,{payment:await paymentConfig()});
    const session=await getSession(req,"user");
    if(!session) return json(res,401,{error:"Not authenticated"});
    const user=await getUser(session.userId);
    if(!user||user.banned) return json(res,403,{error:"Account unavailable"});
    if(req.method==="POST"){
      const body=req.body||{};
      const reference=String(body.reference||"").trim().slice(0,120);
      const config=await paymentConfig();
      const amount=String(body.amount||config.proPrice||"").trim().slice(0,40);
      if(!reference) return json(res,400,{error:"Payment reference is required"});
      const id=crypto.randomUUID();
      const now=new Date().toISOString();
      const item={id,userId:user.id,email:user.email,name:user.name,plan:"pro",amount,currency:config.currency,reference,status:"pending",notes:String(body.notes||"").slice(0,500),createdAt:now,updatedAt:now};
      await redis("set","joes:payment:"+id,JSON.stringify(item));
      await redis("sadd","joes:payments",id);
      return json(res,201,{ok:true,payment:item});
    }
    return json(res,405,{error:"Method not allowed"});
  }catch(e){return json(res,500,{error:e.message||"Payment request failed"});}
}
