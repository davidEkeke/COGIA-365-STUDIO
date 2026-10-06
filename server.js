import crypto from "crypto";
import fs from "fs/promises";
import express from "express";
import helmet from "helmet";
import {rateLimit} from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import path from "path";
import {fileURLToPath} from "url";

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"64kb"}));
app.use("/api/auth",(req,res,next)=>{res.set("Cache-Control","no-store");next()});
app.use("/api/admin",(req,res,next)=>{res.set("Cache-Control","no-store");next()});
const authLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"too_many_requests"}});
const resetLimiter=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"too_many_requests"}});
app.use(express.static(__dirname));

const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:false}:undefined}):null;
const JWT_SECRET=process.env.JWT_SECRET;
if(JWT_SECRET&&JWT_SECRET.length<32)throw new Error("JWT_SECRET must contain at least 32 characters");
const ready=()=>pool&&JWT_SECRET;
const RESET_TTL_MINUTES=30;
const publicBaseUrl=req=>process.env.APP_URL||`${req.protocol}://${req.get("host")}`;

app.get("/health",async(req,res)=>{try{if(pool)await pool.query("select 1");res.json({ok:true,database:!!pool,auth:!!JWT_SECRET})}catch(e){res.status(503).json({ok:false})}});
app.use(["/server.js","/package.json","/package-lock.json","/db","/.git","/.github"],(req,res)=>res.status(404).end());
app.post("/api/auth/forgot-password",resetLimiter,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const email=String(req.body.email||"").trim().toLowerCase();
 if(!email)return res.status(400).json({error:"email_required"});
 const q=await pool.query("select id,email,status from users where lower(email)=$1 limit 1",[email]);
 const u=q.rows[0];
 if(u&&u.status==="active"){
  const raw=crypto.randomUUID()+crypto.randomUUID();
  const tokenHash=await bcrypt.hash(raw,10);
  await pool.query("delete from password_reset_tokens where user_id=$1 or expires_at<now()",[u.id]);
  await pool.query("insert into password_reset_tokens(user_id,token_hash,expires_at) values($1,$2,now()+($3||' minutes')::interval)",[u.id,tokenHash,String(RESET_TTL_MINUTES)]);
  await audit(u.id,"password_reset_requested","user",u.id);
  if(process.env.NODE_ENV!=="production")console.log("Password reset:",publicBaseUrl(req)+"/?reset="+encodeURIComponent(raw));
 }
 res.json({ok:true,message:"Si cette adresse existe, une procédure de réinitialisation a été créée."});
});
app.post("/api/auth/reset-password",resetLimiter,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const token=String(req.body.token||""),next=String(req.body.newPassword||"");
 if(!token||next.length<12)return res.status(400).json({error:"invalid_reset_request"});
 const q=await pool.query("select id,user_id,token_hash from password_reset_tokens where used_at is null and expires_at>now() order by created_at desc limit 20");
 let match=null;for(const row of q.rows){if(await bcrypt.compare(token,row.token_hash)){match=row;break}}
 if(!match)return res.status(400).json({error:"invalid_or_expired_token"});
 const hash=await bcrypt.hash(next,12);
 await pool.query("begin");
 try{
  await pool.query("update users set password_hash=$1,must_change_password=false,updated_at=now() where id=$2",[hash,match.user_id]);
  await pool.query("update password_reset_tokens set used_at=now() where id=$1",[match.id]);
  await pool.query("commit");
 }catch(e){await pool.query("rollback");throw e}
 await audit(match.user_id,"password_reset_completed","user",match.user_id);res.json({ok:true});
});
app.post("/api/auth/login",authLimiter,async(req,res)=>{
 if(!ready())return res.status(503).json({error:"identity_service_not_configured"});
 const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
 if(!email||!password)return res.status(400).json({error:"credentials_required"});
 const q=await pool.query("select id,email,password_hash,display_name,role,status,must_change_password from users where lower(email)=$1 limit 1",[email]);
 const u=q.rows[0]; if(!u||u.status!=="active"||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"invalid_credentials"});
 const token=jwt.sign({sub:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:"8h",issuer:"cogia-365-studio"});
 res.json({token,user:{id:u.id,email:u.email,name:u.display_name,role:u.role,mustChangePassword:u.must_change_password}});
});
const requireAuth=(roles=[])=>async(req,res,next)=>{
 if(!JWT_SECRET||!pool)return res.status(503).json({error:"identity_service_not_configured"});
 const h=req.headers.authorization||""; if(!h.startsWith("Bearer "))return res.status(401).json({error:"unauthorized"});
 try{
  const claims=jwt.verify(h.slice(7),JWT_SECRET,{issuer:"cogia-365-studio",algorithms:["HS256"]});
  const q=await pool.query("select id,email,role,status,organization_id,must_change_password from users where id=$1 limit 1",[claims.sub]);
  const current=q.rows[0];
  if(!current||current.status!=="active")return res.status(401).json({error:"invalid_session"});
  if(roles.length&&!roles.includes(current.role))return res.status(403).json({error:"forbidden"});
  req.user={sub:current.id,email:current.email,role:current.role,organizationId:current.organization_id,mustChangePassword:current.must_change_password};
  next();
 }catch{return res.status(401).json({error:"invalid_session"})}
};
const requirePasswordReady=(req,res,next)=>req.user?.mustChangePassword?res.status(403).json({error:"password_change_required"}):next();
const audit=async(actor,action,entityType=null,entityId=null,metadata={})=>{if(!pool)return;try{await pool.query("insert into audit_log(actor_id,action,entity_type,entity_id,metadata) values($1,$2,$3,$4,$5)",[actor||null,action,entityType,entityId,metadata])}catch(e){console.error("audit",e.message)}};
app.get("/api/me",requireAuth(),async(req,res)=>res.json(req.user));
app.post("/api/auth/change-password",requireAuth(),async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const current=String(req.body.currentPassword||""), next=String(req.body.newPassword||"");
 if(next.length<12)return res.status(400).json({error:"password_too_short"});
 const q=await pool.query("select password_hash from users where id=$1",[req.user.sub]); const u=q.rows[0];
 if(!u||!(await bcrypt.compare(current,u.password_hash)))return res.status(401).json({error:"invalid_credentials"});
 const hash=await bcrypt.hash(next,12);await pool.query("update users set password_hash=$1,must_change_password=false,updated_at=now() where id=$2",[hash,req.user.sub]);await audit(req.user.sub,"password_changed","user",req.user.sub);res.json({ok:true});
});
app.get("/api/admin/users",requireAuth(["super_admin","admin"]),requirePasswordReady,async(req,res)=>{
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("select id,email,display_name,role,status,must_change_password,created_at from users where organization_id=$1 order by created_at desc",[organizationId]);
 await audit(req.user.sub,"users_listed","user",null,{organizationId});res.json(q.rows);
});

app.post("/api/admin/users",requireAuth(["super_admin","admin"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const email=String(req.body.email||"").trim().toLowerCase();
 const displayName=String(req.body.displayName||"").trim();
 const role=String(req.body.role||"user");
 if(!email||!displayName)return res.status(400).json({error:"email_and_name_required"});
 if(!["super_admin","admin","developer","auditor","user"].includes(role))return res.status(400).json({error:"invalid_role"});
 if(role==="super_admin"&&req.user.role!=="super_admin")return res.status(403).json({error:"forbidden"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const tempPassword="Tmp-"+crypto.randomBytes(9).toString("base64url");
 const hash=await bcrypt.hash(tempPassword,12);
 try{
  const q=await pool.query("insert into users(organization_id,email,password_hash,display_name,role,status,must_change_password) values($1,$2,$3,$4,$5,'active',true) returning id,email,display_name,role,status,must_change_password,created_at",[organizationId,email,hash,displayName,role]);
  await audit(req.user.sub,"user_created","user",q.rows[0].id,{email,role,organizationId});
  res.status(201).json({user:q.rows[0],temporaryPassword:process.env.NODE_ENV==="production"?undefined:tempPassword});
 }catch(e){
  if(e.code==="23505")return res.status(409).json({error:"email_already_exists"});
  throw e;
 }
});
app.get("/api/admin/organization",requireAuth(["super_admin","admin"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const q=await pool.query("select o.id,o.name,o.created_at from organizations o join users u on u.organization_id=o.id where u.id=$1 limit 1",[req.user.sub]);
 if(!q.rows[0])return res.status(404).json({error:"organization_not_found"});
 res.json(q.rows[0]);
});
app.patch("/api/admin/organization",requireAuth(["super_admin","admin"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const name=String(req.body.name||"").trim();
 if(!name)return res.status(400).json({error:"name_required"});
 const q=await pool.query("update organizations o set name=$1 where o.id=(select organization_id from users where id=$2) returning id,name,created_at",[name,req.user.sub]);
 if(!q.rows[0])return res.status(404).json({error:"organization_not_found"});
 await audit(req.user.sub,"organization_updated","organization",q.rows[0].id,{name});
 res.json(q.rows[0]);
});
app.patch("/api/admin/users/:id/role",requireAuth(["super_admin"]),requirePasswordReady,async(req,res)=>{
 const role=String(req.body.role||"");if(!["super_admin","admin","developer","auditor","user"].includes(role))return res.status(400).json({error:"invalid_role"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("update users set role=$1,updated_at=now() where id=$2 and organization_id=$3 returning id,email,role,status",[role,req.params.id,organizationId]);
 if(!q.rows[0])return res.status(404).json({error:"not_found"});await audit(req.user.sub,"role_changed","user",req.params.id,{role,organizationId});res.json(q.rows[0]);
});
app.patch("/api/admin/users/:id/status",requireAuth(["super_admin","admin"]),requirePasswordReady,async(req,res)=>{
 const status=String(req.body.status||"");if(!["active","disabled","pending"].includes(status))return res.status(400).json({error:"invalid_status"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("update users set status=$1,updated_at=now() where id=$2 and organization_id=$3 returning id,email,role,status",[status,req.params.id,organizationId]);
 if(!q.rows[0])return res.status(404).json({error:"not_found"});await audit(req.user.sub,"status_changed","user",req.params.id,{status,organizationId});res.json(q.rows[0]);
});
app.get("/api/admin/audit",requireAuth(["super_admin","admin","auditor"]),requirePasswordReady,async(req,res)=>{
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("select a.id,a.actor_id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.display_name as actor_name,u.email as actor_email from audit_log a left join users u on u.id=a.actor_id where u.organization_id=$1 order by a.created_at desc limit 200",[organizationId]);
 res.json(q.rows)
});

app.get("/api/projects",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]);
 const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("select id,name,status,created_at from projects where organization_id=$1 order by created_at desc",[organizationId]);
 res.json(q.rows);
});
app.post("/api/projects",requireAuth(["super_admin","admin","developer"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const name=String(req.body.name||"").trim();
 if(!name)return res.status(400).json({error:"name_required"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]);
 const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(400).json({error:"organization_required"});
 const q=await pool.query("insert into projects(organization_id,name,created_by) values($1,$2,$3) returning id,name,status,created_at",[organizationId,name,req.user.sub]);
 await audit(req.user.sub,"project_created","project",q.rows[0].id,{name});
 res.status(201).json(q.rows[0]);
});
app.patch("/api/projects/:id/status",requireAuth(["super_admin","admin","developer"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const status=String(req.body.status||"").trim();
 if(!["active","paused","archived"].includes(status))return res.status(400).json({error:"invalid_status"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("update projects set status=$1 where id=$2 and organization_id=$3 returning id,name,status,created_at",[status,req.params.id,organizationId]);
 if(!q.rows[0])return res.status(404).json({error:"not_found"});
 await audit(req.user.sub,"project_status_changed","project",req.params.id,{status});
 res.json(q.rows[0]);
});
app.get("/api/workspaces",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("select w.id,w.project_id,w.name,w.status,w.mode,w.created_at,p.name as project_name from workspaces w join projects p on p.id=w.project_id where p.organization_id=$1 order by w.created_at desc",[organizationId]);
 res.json(q.rows);
});
app.post("/api/workspaces",requireAuth(["super_admin","admin","developer"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const projectId=String(req.body.projectId||""),name=String(req.body.name||"").trim(),mode=String(req.body.mode||"local-first");
 if(!projectId||!name)return res.status(400).json({error:"project_and_name_required"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const pq=await pool.query("select id from projects where id=$1 and organization_id=$2",[projectId,organizationId]);
 if(!pq.rows[0])return res.status(404).json({error:"project_not_found"});
 const q=await pool.query("insert into workspaces(project_id,name,mode) values($1,$2,$3) returning id,project_id,name,status,mode,created_at",[projectId,name,mode]);
 await audit(req.user.sub,"workspace_created","workspace",q.rows[0].id,{projectId,name,mode});
 res.status(201).json(q.rows[0]);
});
app.get("/api/decisions",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("select d.id,d.project_id,d.title,d.scope,d.status,d.created_at,p.name as project_name from project_decisions d join projects p on p.id=d.project_id where p.organization_id=$1 order by d.created_at desc",[organizationId]);
 res.json(q.rows);
});
app.post("/api/decisions",requireAuth(["super_admin","admin","developer","auditor"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const projectId=String(req.body.projectId||""),title=String(req.body.title||"").trim(),scope=String(req.body.scope||"").trim();
 if(!projectId||!title)return res.status(400).json({error:"project_and_title_required"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const pq=await pool.query("select id from projects where id=$1 and organization_id=$2",[projectId,organizationId]);
 if(!pq.rows[0])return res.status(404).json({error:"project_not_found"});
 const q=await pool.query("insert into project_decisions(project_id,title,scope,created_by) values($1,$2,$3,$4) returning id,project_id,title,scope,status,created_at",[projectId,title,scope,req.user.sub]);
 await audit(req.user.sub,"decision_created","decision",q.rows[0].id,{projectId,title,scope});
 res.status(201).json(q.rows[0]);
});
app.get("/api/project-members",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("select pm.project_id,pm.user_id,pm.role,pm.created_at,p.name as project_name,u.display_name,u.email from project_members pm join projects p on p.id=pm.project_id join users u on u.id=pm.user_id where p.organization_id=$1 and u.organization_id=$1 order by pm.created_at desc",[organizationId]);
 res.json(q.rows);
});
app.post("/api/project-members",requireAuth(["super_admin","admin","developer"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const projectId=String(req.body.projectId||"").trim(), userId=String(req.body.userId||"").trim(), role=String(req.body.role||"member").trim();
 if(!projectId||!userId)return res.status(400).json({error:"project_and_user_required"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const pq=await pool.query("select id from projects where id=$1 and organization_id=$2",[projectId,organizationId]);
 if(!pq.rows[0])return res.status(404).json({error:"project_not_found"});
 const member=await pool.query("select id from users where id=$1 and organization_id=$2 and status='active'",[userId,organizationId]);
 if(!member.rows[0])return res.status(404).json({error:"user_not_found"});
 const q=await pool.query("insert into project_members(project_id,user_id,role) values($1,$2,$3) on conflict(project_id,user_id) do update set role=excluded.role returning project_id,user_id,role,created_at",[projectId,userId,role]);
 await audit(req.user.sub,"project_member_upserted","project",projectId,{userId,role});
 res.status(201).json(q.rows[0]);
});
app.delete("/api/project-members/:projectId/:userId",requireAuth(["super_admin","admin","developer"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const q=await pool.query("delete from project_members pm using projects p, users u where pm.project_id=p.id and pm.user_id=u.id and pm.project_id=$1 and pm.user_id=$2 and p.organization_id=$3 and u.organization_id=$3 returning pm.project_id,pm.user_id",[req.params.projectId,req.params.userId,organizationId]);
 if(!q.rows[0])return res.status(404).json({error:"not_found"});
 await audit(req.user.sub,"project_member_removed","project",req.params.projectId,{userId:req.params.userId});
 res.json({ok:true});
});
app.get("/api/dashboard",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const uq=await pool.query("select organization_id from users where id=$1",[req.user.sub]); const organizationId=uq.rows[0]?.organization_id;
 if(!organizationId)return res.status(403).json({error:"organization_required"});
 const [projectsCount,activeProjects,usersCount,auditCount]=await Promise.all([
  pool.query("select count(*)::int as n from projects where organization_id=$1",[organizationId]),
  pool.query("select count(*)::int as n from projects where organization_id=$1 and status='active'",[organizationId]),
  pool.query("select count(*)::int as n from users where organization_id=$1 and status='active'",[organizationId]),
  pool.query("select count(*)::int as n from audit_log a join users u on u.id=a.actor_id where u.organization_id=$1",[organizationId])
 ]);
 res.json({
  projects:projectsCount.rows[0].n,
  activeProjects:activeProjects.rows[0].n,
  activeUsers:usersCount.rows[0].n,
  auditEvents:auditCount.rows[0].n
 });
});
const allowedPreviewStack=new Set(["static","node"]);
const workspaceRoot=process.env.WORKSPACE_ROOT||path.join(__dirname,"workspaces");
const safeWorkspacePath=(id)=>path.join(workspaceRoot,String(id).replace(/[^a-zA-Z0-9_-]/g,""));
const getProjectWorkspace=async(projectId,organizationId)=>{
 if(!projectId)return null;
 const q=await pool.query("select w.id,w.name,w.mode,p.id as project_id,p.name as project_name from workspaces w join projects p on p.id=w.project_id where p.id=$1 and p.organization_id=$2 order by w.created_at asc limit 1",[projectId,organizationId]);
 return q.rows[0]||null;
};
const buildRuntimePlan=async(job)=>{
 const ws=await getProjectWorkspace(job.project_id,job.organization_id);
 if(!ws)return {mode:"preflight",reason:"workspace_not_found"};
 const root=safeWorkspacePath(ws.id);
 const base={mode:"isolated-plan",workspaceId:ws.id,workspaceName:ws.name,workspaceRoot:root,network:"disabled",readOnlyBase:true,maxSeconds:120,maxMemoryMb:512};
 const detected=await detectWorkspaceStack(base).catch(()=>({stack:"unknown"}));
 return {...base,stack:detected.stack,detected};
};
const detectWorkspaceStack=async(plan)=>{
 if(plan.mode!=="isolated-plan")return {stack:"unknown",reason:plan.reason||"invalid_plan"};
 const root=path.resolve(plan.workspaceRoot);
 const pkgPath=path.join(root,"package.json");
 const raw=await fs.readFile(pkgPath,"utf8").catch(()=>null);
 if(!raw)return {stack:"static",entry:"index.html"};
 let pkg; try{pkg=JSON.parse(raw)}catch{return {stack:"unknown",reason:"invalid_package_json"}}
 const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
 const scripts=pkg.scripts||{};
 let framework="node";
 if(deps.vite)framework="vite";
 else if(deps.react)framework="react";
 else if(deps.next)framework="next";
 const buildScript=typeof scripts.build==="string"?"build":null;
 const testScript=typeof scripts.test==="string"?"test":null;
 return {stack:"node",framework,packageManager:"npm",buildScript,testScript,hasLockfile:!!(await fs.stat(path.join(root,"package-lock.json")).catch(()=>null))};
};
const buildNodeRuntimeSpec=async(plan)=>{
 const detected=await detectWorkspaceStack(plan);
 if(detected.stack!=="node")return {ok:false,detected,reason:"not_node_workspace"};
 const allowedFrameworks=new Set(["node","vite","react"]);
 if(!allowedFrameworks.has(detected.framework))return {ok:false,detected,reason:"framework_not_enabled"};
 return {ok:true,detected,isolation:{engine:"external-container",network:"dependency-install-only",runtimeNetwork:"disabled",readOnlyBase:true,workspaceWrite:"ephemeral",maxSeconds:120,maxMemoryMb:512,noNewPrivileges:true},commands:{install:detected.hasLockfile?"npm ci --ignore-scripts":"npm install --ignore-scripts",build:detected.buildScript?"npm run build":null,test:detected.testScript?"npm test -- --runInBand":null}};
};
const executeStaticWorkspace=async(plan)=>{
 if(plan.mode!=="isolated-plan")return {ok:false,reason:plan.reason||"invalid_plan"};
 const root=path.resolve(plan.workspaceRoot);
 const allowedRoot=path.resolve(workspaceRoot)+path.sep;
 if(!root.startsWith(allowedRoot))throw new Error("workspace_path_rejected");
 const stat=await fs.stat(root).catch(()=>null);
 if(!stat||!stat.isDirectory())return {ok:false,reason:"workspace_directory_missing"};
 const entries=await fs.readdir(root,{withFileTypes:true});
 const blockedNames=new Set([".git",".env",".ssh","node_modules"]);
 const visible=entries.filter(e=>!blockedNames.has(e.name));
 const files=visible.filter(e=>e.isFile()).map(e=>e.name);
 const indexFile=files.find(n=>n.toLowerCase()==="index.html");
 if(!indexFile)return {ok:false,reason:"index_html_missing",files};
 const source=await fs.readFile(path.join(root,indexFile),"utf8");
 if(source.length>2_000_000)return {ok:false,reason:"index_too_large"};
 const dangerous=/<script[^>]+src=["'](?:https?:)?\/\//i.test(source);
 return {
  ok:!dangerous,
  stack:"static",
  entry:indexFile,
  files:files.slice(0,200),
  warnings:dangerous?["Remote script references are blocked in isolated preview"]:[],
  previewPath:"/api/studio/preview/"+encodeURIComponent(plan.workspaceId)+"/"
 };
};
const callExternalRunner=async(spec,job)=>{
 const url=process.env.STUDIO_RUNNER_URL;
 const token=process.env.STUDIO_RUNNER_TOKEN;
 if(!url)return {ok:false,reason:"runner_not_configured",spec};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),Math.min((spec?.isolation?.maxSeconds||120)*1000,130000));
 try{
  const r=await fetch(url,{
   method:"POST",
   headers:{"Content-Type":"application/json",...(token?{"Authorization":"Bearer "+token}:{})},
   body:JSON.stringify({
    jobId:job.id,
    organizationId:job.organization_id,
    projectId:job.project_id,
    jobType:job.job_type,
    workspace:spec,
    callbackMode:"inline-result"
   }),
   signal:controller.signal
  });
  let data={}; try{data=await r.json()}catch{}
  if(!r.ok)return {ok:false,reason:"runner_http_"+r.status,detail:data};
  return {ok:true,runner:data};
 }catch(e){
  return {ok:false,reason:e.name==="AbortError"?"runner_timeout":"runner_unreachable"};
 }finally{clearTimeout(timer)}
};
const processStudioJob=async(job)=>{
 const started=new Date().toISOString();
 try{
  await pool.query("update studio_jobs set status='running',started_at=now() where id=$1 and status='queued'",[job.id]);
  let result={started,engine:"cogia-safe-runtime-v1"};
  if(job.job_type==="mission"){
   result={...result,kind:"structured_mission",chain:["Métier","Processus","Règles","Données","Contrôles","Architecture","Fonctionnalités","Tests","Preuves"],instruction:job.instruction};
  }else if(job.job_type==="design"){
   result={...result,kind:"design_plan",instruction:job.instruction};
  }else if(job.job_type==="build"){
   const plan=await buildRuntimePlan(job);
   const execution=plan.stack==="node"?await buildNodeRuntimeSpec(plan):await executeStaticWorkspace(plan);
   let runner=null;
   if(plan.stack==="node"&&execution.ok)runner=await callExternalRunner(execution,job);
   result={...result,kind:"build_result",ok:plan.stack==="node"?!!runner?.ok:execution.ok,plan,execution,runner,message:plan.stack==="node"?(runner?.ok?"Node/React/Vite build executed by isolated runner":"Node/React/Vite runner unavailable"):(execution.ok?"Static workspace validated":"Build validation failed")};
  }else if(job.job_type==="test"){
   const plan=await buildRuntimePlan(job);
   const execution=plan.stack==="node"?await buildNodeRuntimeSpec(plan):await executeStaticWorkspace(plan);
   let runner=null;
   if(plan.stack==="node"&&execution.ok)runner=await callExternalRunner({...execution,operation:"test"},job);
   const checks=plan.stack==="node"?{stackDetected:true,isolationRequired:true,frameworkEnabled:execution.ok,runnerAvailable:!!runner?.ok}:{workspacePresent:execution.reason!=="workspace_directory_missing",entryPoint:!!execution.entry,remoteScriptsBlocked:!(execution.warnings||[]).length};
   result={...result,kind:"test_result",ok:plan.stack==="node"?!!runner?.ok:execution.ok,plan,execution,runner,checks,message:plan.stack==="node"?(runner?.ok?"Node/React/Vite tests executed by isolated runner":"Node/React/Vite runner unavailable"):(execution.ok?"Static safety checks passed":"Safety checks failed")};
  }else if(job.job_type==="codex"){
   const plan=await buildRuntimePlan(job);
   result={...result,kind:"codex_plan",accepted:true,instruction:job.instruction,plan,message:"Instruction secured; execution must occur in isolated workspace runtime"};
  }else if(job.job_type==="preview"){
   const plan=await buildRuntimePlan(job);
   if(plan.stack==="node"){
    const spec=await buildNodeRuntimeSpec(plan);
    const runner=spec.ok?await callExternalRunner({...spec,operation:"preview"},job):null;
    result={...result,kind:"preview_result",ready:!!runner?.ok,plan,spec,runner,message:runner?.ok?"Node/React/Vite preview started by isolated runner":"Preview runner unavailable"};
   }else{
    const execution=await executeStaticWorkspace(plan);
    result={...result,kind:"preview_result",ready:execution.ok,plan,execution,message:execution.ok?"Static preview ready":"Static preview unavailable"};
   }
  }
  await pool.query("update studio_jobs set status='succeeded',result=$1::jsonb,finished_at=now() where id=$2",[JSON.stringify(result),job.id]);
  await pool.query("insert into studio_artifacts(job_id,artifact_type,name,metadata) values($1,$2,$3,$4::jsonb)",[job.id,"runtime_result",job.job_type+"-result.json",JSON.stringify(result)]);
 }catch(err){
  await pool.query("update studio_jobs set status='failed',result=$1::jsonb,finished_at=now() where id=$2",[JSON.stringify({error:"runtime_failed",message:String(err.message||err)}),job.id]).catch(()=>{});
 }
};
const claimStudioJob=async()=>{
 if(!pool)return;
 const client=await pool.connect();
 try{
  await client.query("begin");
  const q=await client.query("select id,organization_id,project_id,job_type,instruction from studio_jobs where status='queued' order by created_at asc for update skip locked limit 1");
  if(!q.rows[0]){await client.query("commit");return;}
  await client.query("update studio_jobs set status='running',started_at=now() where id=$1",[q.rows[0].id]);
  await client.query("commit");
  await processStudioJob(q.rows[0]);
 }catch(e){await client.query("rollback").catch(()=>{});console.error("Studio worker",e)}finally{client.release()}
};
if(pool)setInterval(()=>claimStudioJob().catch(e=>console.error("Studio worker tick",e)),3000);
app.get("/api/studio/preview/:workspaceId/*",requireAuth(),requirePasswordReady,async(req,res)=>{
 const organizationId=req.user.organizationId;
 const q=await pool.query("select w.id from workspaces w join projects p on p.id=w.project_id where w.id=$1 and p.organization_id=$2",[req.params.workspaceId,organizationId]);
 if(!q.rows[0])return res.status(404).end();
 const root=path.resolve(safeWorkspacePath(req.params.workspaceId));
 const rel=(req.params[0]||"index.html").replace(/^\/+/, "");
 const target=path.resolve(root,rel);
 if(!target.startsWith(root+path.sep)&&target!==root)return res.status(403).end();
 const blocked=[".env",".git","package-lock.json","server.js"];
 if(blocked.some(x=>rel.split("/").includes(x)))return res.status(404).end();
 res.set("Content-Security-Policy","default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'");
 res.sendFile(target,err=>{if(err&&!res.headersSent)res.status(404).end()});
});
app.get("/api/studio/jobs",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const organizationId=req.user.organizationId;
 const q=await pool.query("select id,project_id,job_type,status,instruction,result,created_at,started_at,finished_at from studio_jobs where organization_id=$1 order by created_at desc limit 100",[organizationId]);
 res.json(q.rows);
});
app.post("/api/studio/jobs",requireAuth(["super_admin","admin","developer","auditor"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const organizationId=req.user.organizationId;
 const jobType=String(req.body.jobType||"").trim();
 const instruction=String(req.body.instruction||"").trim();
 const projectId=req.body.projectId?String(req.body.projectId):null;
 if(!["mission","design","build","test","codex","preview"].includes(jobType))return res.status(400).json({error:"invalid_job_type"});
 if(["mission","design","codex"].includes(jobType)&&!instruction)return res.status(400).json({error:"instruction_required"});
 if(projectId){
  const pq=await pool.query("select id from projects where id=$1 and organization_id=$2",[projectId,organizationId]);
  if(!pq.rows[0])return res.status(404).json({error:"project_not_found"});
 }
 const q=await pool.query("insert into studio_jobs(organization_id,project_id,job_type,instruction,created_by) values($1,$2,$3,$4,$5) returning id,project_id,job_type,status,instruction,result,created_at",[organizationId,projectId,jobType,instruction||null,req.user.sub]);
 await audit(req.user.sub,"studio_job_created","studio_job",q.rows[0].id,{jobType,projectId});
 res.status(201).json(q.rows[0]);
});
app.patch("/api/studio/jobs/:id/status",requireAuth(["super_admin","admin","developer","auditor"]),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const organizationId=req.user.organizationId;
 const status=String(req.body.status||"").trim();
 if(!["queued","running","succeeded","failed","cancelled"].includes(status))return res.status(400).json({error:"invalid_status"});
 const q=await pool.query("update studio_jobs set status=$1,started_at=case when $1='running' and started_at is null then now() else started_at end,finished_at=case when $1 in ('succeeded','failed','cancelled') then now() else finished_at end where id=$2 and organization_id=$3 returning id,job_type,status,started_at,finished_at",[status,req.params.id,organizationId]);
 if(!q.rows[0])return res.status(404).json({error:"not_found"});
 await audit(req.user.sub,"studio_job_status_changed","studio_job",req.params.id,{status});
 res.json(q.rows[0]);
});
app.get("/api/studio/jobs/:id/artifacts",requireAuth(),requirePasswordReady,async(req,res)=>{
 if(!pool)return res.status(503).json({error:"database_not_configured"});
 const organizationId=req.user.organizationId;
 const q=await pool.query("select a.id,a.artifact_type,a.name,a.path,a.metadata,a.created_at from studio_artifacts a join studio_jobs j on j.id=a.job_id where a.job_id=$1 and j.organization_id=$2 order by a.created_at desc",[req.params.id,organizationId]);
 res.json(q.rows);
});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"internal_error"})});
app.listen(process.env.PORT||8080,()=>console.log("COGIA 365 Studio listening"));
