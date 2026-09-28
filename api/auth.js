import crypto from "node:crypto";
import {cors,json,requireOrigin,redis,safeEqual,createUser,findUserByEmail,findUserByGoogleSub,getUser,saveUser,hashPassword,verifyPassword,createSession,destroySession,USER_COOKIE,ADMIN_COOKIE,cookieHeader,clearCookie,publicUser,requireConfig} from "./_auth.mjs";

const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET=process.env.GOOGLE_CLIENT_SECRET;
const ADMIN_USERNAME=process.env.ADMIN_USERNAME||"";
const ADMIN_GOOGLE_EMAIL=String(process.env.ADMIN_GOOGLE_EMAIL||"").trim().toLowerCase();
const API_ORIGIN=(process.env.API_ORIGIN|| (process.env.VERCEL_URL ? "https://"+process.env.VERCEL_URL : "")).replace(/\/$/,"");
const GOOGLE_REDIRECT_URI=process.env.GOOGLE_REDIRECT_URI || (API_ORIGIN ? API_ORIGIN+"/api/auth?action=google-callback" : "");
const APP_URL=(process.env.APP_URL||process.env.APP_ORIGIN||"https://quranhub1.github.io").replace(/\/$/,"");

function emailOk(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function sessionCookie(token){return cookieHeader(USER_COOKIE,token)}
function redirect(res,url){res.status(302).setHeader("Location",url).end()}

async function issueUserSession(res,user){
  const token=await createSession(user.id,"user");
  res.setHeader("Set-Cookie",sessionCookie(token));
}

async function issueAdminSession(res){
  const token=await createSession("admin:"+ADMIN_USERNAME,"admin");
  const current=res.getHeader("Set-Cookie");
  const adminCookie=cookieHeader(ADMIN_COOKIE,token,8*60*60);
  res.setHeader("Set-Cookie",Array.isArray(current)?current.concat(adminCookie):current?[current,adminCookie]:adminCookie);
}

async function googleStart(req,res){
  if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET) return json(res,503,{error:"Google authentication is not configured"});
  const state=crypto.randomBytes(32).toString("base64url");
  const target=String(new URL(req.url,"https://auth.local").searchParams.get("returnTo")||APP_URL);
  let safeTarget=APP_URL;
  try{const u=new URL(target); const base=new URL(APP_URL); if(u.origin===base.origin) safeTarget=u.href;}catch(_){}
  await redis("set","joes:oauth:google:"+crypto.createHash("sha256").update(state).digest("hex"),safeTarget,"EX",600);
  const params=new URLSearchParams({
    client_id:GOOGLE_CLIENT_ID,response_type:"code",redirect_uri:GOOGLE_REDIRECT_URI,
    scope:"openid email profile",state,access_type:"online",prompt:"select_account"
  });
  return redirect(res,"https://accounts.google.com/o/oauth2/v2/auth?"+params.toString());
}

async function googleCallback(req,res,url){
  if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET) return redirect(res,APP_URL+"?auth_error=google_not_configured");
  const code=url.searchParams.get("code");
  const state=url.searchParams.get("state");
  if(!code||!state) return redirect(res,APP_URL+"?auth_error=missing_google_response");
  const stateKey="joes:oauth:google:"+crypto.createHash("sha256").update(state).digest("hex");
  const returnTo=await redis("get",stateKey);
  await redis("del",stateKey);
  if(!returnTo) return redirect(res,APP_URL+"?auth_error=invalid_google_state");
  try{
    const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:GOOGLE_CLIENT_ID,client_secret:GOOGLE_CLIENT_SECRET,redirect_uri:GOOGLE_REDIRECT_URI,grant_type:"authorization_code"})});
    if(!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokens=await tokenResponse.json();
    const userResponse=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+tokens.access_token}});
    if(!userResponse.ok) throw new Error("Google userinfo failed");
    const google=await userResponse.json();
    const email=String(google.email||"").trim().toLowerCase();
    if(!email||google.email_verified!==true) throw new Error("Google account email is not verified");
    let user=await findUserByGoogleSub(String(google.sub||""));
    if(!user) user=await findUserByEmail(email);
    if(user){
      if(user.banned) return redirect(res,returnTo+"?auth_error=account_banned");
      user.auth={...(user.auth||{}),googleSub:String(google.sub||"")};
      if(!user.name) user.name=String(google.name||"").slice(0,120);
      if(!user.avatar&&google.picture) user.avatar=google.picture;
      user.updatedAt=new Date().toISOString();
      user=await saveUser(user);
    }else{
      user=await createUser({email,name:google.name,avatar:google.picture,googleSub:google.sub});
    }
    await issueUserSession(res,user);
    const googleIsAdmin = !!ADMIN_USERNAME && (email === ADMIN_GOOGLE_EMAIL || (ADMIN_USERNAME.includes("@") && email === ADMIN_USERNAME.toLowerCase()));
    if(googleIsAdmin) await issueAdminSession(res);
    return redirect(res,returnTo+"?auth=google");
  }catch(error){
    console.error("Google OAuth error:",error);
    return redirect(res,returnTo+"?auth_error=google_failed");
  }
}

export default async function handler(req,res){
  cors(req,res);
  if(req.method==="OPTIONS") return res.status(204).end();
  if(!requireOrigin(req)) return json(res,403,{error:"Origin not allowed"});
  try{
    requireConfig();
    const url=new URL(req.url,"https://auth.local");
    const action=url.searchParams.get("action")||"";

    if(req.method==="GET"&&action==="google-start") return googleStart(req,res);
    if(req.method==="GET"&&action==="google-callback") return googleCallback(req,res,url);

    if(req.method==="POST"&&action==="signup"){
      const body=req.body||{};
      const email=String(body.email||"").trim().toLowerCase();
      const name=String(body.name||"").trim();
      const password=String(body.password||"");
      if(!emailOk(email)||!name||password.length<8) return json(res,400,{error:"Enter a valid email, name, and password of at least 8 characters"});
      const emailKey="joes:user:email:"+email;
      const existing=await redis("get",emailKey);
      if(existing) return json(res,409,{error:"Email already registered"});
      const user=await createUser({email,name});
      try{
        const passwordRecord=await hashPassword(password);
        user.auth.password=passwordRecord;
        await saveUser(user);
        const reserved=await redis("set",emailKey,user.id,"NX","EX",60);
        if(reserved!==null&&reserved!==true&&reserved!=="OK"){await redis("del","joes:user:"+user.id);return json(res,409,{error:"Email already registered"});}
        await redis("set",emailKey,user.id);
      }catch(e){await redis("del","joes:user:"+user.id);throw e}
      await issueUserSession(res,user);
      return json(res,201,{ok:true,user:publicUser(user)});
    }

    if(req.method==="POST"&&action==="login"){
      const body=req.body||{};
      const email=String(body.email||"").trim().toLowerCase();
      const password=String(body.password||"");
      if(!email||!password) return json(res,400,{error:"Email and password are required"});
      const user=await findUserByEmail(email);
      if(!user) return json(res,401,{error:"Invalid email or password"});
      if(user.banned) return json(res,403,{error:"Account is unavailable"});
      let valid=await verifyPassword(password,user.auth?.password);
      if(!valid){
        const legacy=await redis("get","joes:user:password:"+email);
        if(legacy){
          const legacyHash=crypto.createHash("sha256").update(password).digest("hex");
          valid=safeEqual(legacy,legacyHash);
          if(valid){
            user.auth.password=await hashPassword(password);
            await saveUser(user);
            await redis("del","joes:user:password:"+email);
          }
        }
      }
      if(!valid) return json(res,401,{error:"Invalid email or password"});
      await issueUserSession(res,user);
      return json(res,200,{ok:true,user:publicUser(user)});
    }

    if(req.method==="GET"&&action==="me"){
      const {getSession}=await import("./_auth.mjs");
      const session=await getSession(req,"user");
      if(!session) return json(res,401,{error:"Not authenticated"});
      const user=await getUser(session.userId);
      if(!user||user.banned) return json(res,403,{error:"Account unavailable"});
      return json(res,200,{user:publicUser(user)});
    }

    if(req.method==="POST"&&action==="logout"){
      await destroySession(req,"user");
      res.setHeader("Set-Cookie",clearCookie(USER_COOKIE));
      return json(res,200,{ok:true});
    }
    return json(res,405,{error:"Method not allowed"});
  }catch(e){
    console.error("Auth error:",e);
    return json(res,500,{error:e.message||"Server error"});
  }
}
