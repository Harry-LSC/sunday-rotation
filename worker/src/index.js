// Sunday Rotation Worker. D1 binding: DB. Do not use 10-digit IDs as credentials.
const albums = new Set(["1704061160","1561774995","1440832200","849478125","416292276","1554144723","1561184260","1390704147","391504410","1450550344"]);
const allowedOrigin = "https://harry-lsc.github.io";
const encoder = new TextEncoder();
const reply = (x,status=200) => new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const error = (message,status=400)=>reply({error:message},status);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
const sha=async text=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(text))));
async function parse(request){
  if(Number(request.headers.get("content-length")||0)>16384)throw Error("Request too large");
  const raw=await request.text();
  if(raw.length>16384)throw Error("Request too large");
  try{return JSON.parse(raw)}catch{throw Error("Invalid JSON")}
}
async function authenticated(request,db){
  const m=/^Bearer ([0-9a-f]{64})$/i.exec(request.headers.get("Authorization")||"");
  if(!m)return null;
  return db.prepare("SELECT listener_id,display_name,created_at FROM listeners WHERE credential_hash=?").bind(await sha(m[1].toLowerCase())).first();
}
async function register(data,db){
  const name=typeof data?.display_name==="string"?data.display_name.trim():"";
  if(name.length<2||name.length>32)return error("Name must be 2–32 characters");
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash=await sha(token);
  for(let i=0;i<8;i++){
    const id=String(1000000000+crypto.getRandomValues(new Uint32Array(1))[0]%900000000);
    try{
      await db.prepare("INSERT INTO listeners (listener_id,display_name,credential_hash) VALUES (?,?,?)").bind(id,name,hash).run();
      return reply({listener_id:id,display_name:name,credential:token,warning:"The private credential is required for recovering your journal on another device."},201);
    }catch(e){if(!String(e).includes("UNIQUE"))throw e}
  }
  return error("Please try again",503);
}
async function journal(request,db,listener){
  if(request.method==="GET"){
    const r=await db.prepare("SELECT album_id,status,score,mood,notes,updated_at FROM journal_entries WHERE listener_id=? ORDER BY updated_at DESC").bind(listener.listener_id).all();
    return reply({entries:r.results||[]});
  }
  const data=await parse(request),id=String(data?.album_id??""),status=data?.status,score=data?.score??null;
  if(!albums.has(id))return error("Unknown album");
  if(!["want_to_listen","listened","rated"].includes(status))return error("Invalid status");
  if(status==="rated"&&!(typeof score==="number"&&Number.isFinite(score)&&score>=0&&score<=10&&Number.isInteger(score*2)))return error("Invalid score");
  if(status!=="rated"&&score!==null)return error("Only rated albums can have a score");
  const mood=data.mood==null?null:String(data.mood).trim();
  const notes=data.notes==null?null:String(data.notes).trim();
  if((mood?.length||0)>200||(notes?.length||0)>3000)return error("Mood or notes too long");
  await db.prepare(`INSERT INTO journal_entries(listener_id,album_id,status,score,mood,notes)
  VALUES(?,?,?,?,?,?) ON CONFLICT(listener_id,album_id) DO UPDATE SET
  status=excluded.status,score=excluded.score,mood=excluded.mood,notes=excluded.notes,updated_at=CURRENT_TIMESTAMP`)
    .bind(listener.listener_id,id,status,score,mood,notes).run();
  return reply({saved:true,album_id:id});
}
async function deleteRating(id,db,listener){
  if(!albums.has(id))return error("Unknown album");
  const result=await db.prepare("DELETE FROM journal_entries WHERE listener_id=? AND album_id=?").bind(listener.listener_id,id).run();
  return reply({deleted:true,album_id:id,changes:result.meta?.changes??0});
}
async function score(id,db,listener){
  if(!albums.has(id))return error("Unknown album");
  const mine=await db.prepare("SELECT score FROM journal_entries WHERE listener_id=? AND album_id=? AND status='rated' AND score IS NOT NULL").bind(listener.listener_id,id).first();
  if(!mine)return reply({available:false,message:"Rate this album to reveal the club score"});
  const r=await db.prepare("SELECT COUNT(*) AS count,ROUND(AVG(score),2) AS average FROM journal_entries WHERE album_id=? AND status='rated' AND score IS NOT NULL").bind(id).first();
  return reply({available:true,album_id:id,count:r.count,average:r.average});
}
export default {
  async fetch(request,env){
    const origin=request.headers.get("Origin");
    const cors=origin===allowedOrigin?{"Access-Control-Allow-Origin":allowedOrigin,"Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"}:{};
    if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    if(origin&&origin!==allowedOrigin)return error("Origin not allowed",403);
    let res;
    try{
      const u=new URL(request.url);
      if(u.pathname==="/health"&&request.method==="GET"){
        await env.DB.prepare("SELECT 1 FROM listeners LIMIT 1").first();
        res=reply({ok:true,service:"sunday-rotation-api",database:"connected",deployment_test:"github-auto-2026-10-19"});
      }else if(u.pathname==="/members/count"&&request.method==="GET"){
        const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM listeners").first();
        res=reply({members:Number(count?.total||0)});
      }else if(u.pathname==="/register"&&request.method==="POST"){
        res=await register(await parse(request),env.DB);
      }else{
        const listener=await authenticated(request,env.DB);
        if(!listener)res=error("Authentication required",401);
        else if(u.pathname==="/me"&&request.method==="GET")res=reply({listener});
        else if(u.pathname==="/journal"&&["GET","PUT"].includes(request.method))res=await journal(request,env.DB,listener);
        else if(u.pathname==="/journal"&&request.method==="DELETE")res=await deleteRating(u.searchParams.get("album_id"),env.DB,listener);
        else if(u.pathname==="/club-score"&&request.method==="GET")res=await score(u.searchParams.get("album_id"),env.DB,listener);
        else res=error("Not found",404);
      }
    }catch(e){res=error(["Invalid JSON","Request too large"].includes(e?.message)?e.message:"Internal server error",["Invalid JSON","Request too large"].includes(e?.message)?400:500)}
    const headers=new Headers(res.headers);
    for(const [k,v] of Object.entries(cors))headers.set(k,v);
    return new Response(res.body,{status:res.status,headers});
  }
};
