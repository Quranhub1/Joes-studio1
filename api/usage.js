import {cors,json,requireOrigin,getSession,getUser,publicUser,currentPeriodKey,FREE_BATCH_LIMIT,evalRedis,redis} from "./_auth.mjs";
export default async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(!requireOrigin(req)) return json(res,403,{error:"Origin not allowed"});
  try{
    const session=await getSession(req,"user");
    if(!session) return json(res,401,{error:"Not authenticated"});
    const user=await getUser(session.userId);
    if(!user||user.banned) return json(res,403,{error:"Account unavailable"});
    const period=currentPeriodKey();
    const limit=user.plan?.tier==="pro"&&user.plan?.status==="active" ? Number.MAX_SAFE_INTEGER : FREE_BATCH_LIMIT;
    const key="joes:usage:"+user.id+":"+period;
    const result=await evalRedis(`#!lua flags=allow-key-locking
local current=tonumber(redis.call('GET',KEYS[1]) or '0')
local limit=tonumber(ARGV[1])
if current>=limit then return {0,current,limit} end
local next=redis.call('INCR',KEYS[1])
redis.call('EXPIRE',KEYS[1],2678400)
return {1,next,limit}`,[key],[String(limit)]);
    const allowed=Number(result?.[0])===1;
    const used=Number(result?.[1]||0);
    if(allowed){
      user.usage={periodKey:period,batchesUsed:used,batchLimit:limit};
      user.updatedAt=new Date().toISOString();
      user.usage={periodKey:period,batchesUsed:used,batchLimit:limit};
    }
    return json(res,allowed?200:429,{ok:allowed,allowed,used,limit,periodKey:period,user:publicUser(user),error:allowed?undefined:"Free batch limit reached"});
  }catch(e){return json(res,500,{error:e.message||"Usage check failed"});}
}
async function redisUserUsage(user,period,used,limit){
  const {redis}=await import("./_auth.mjs");
  user.usage={periodKey:period,batchesUsed:used,batchLimit:limit};
  await redis("set","joes:user:"+user.id,JSON.stringify(user));
}
