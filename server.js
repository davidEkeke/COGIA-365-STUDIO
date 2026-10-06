import express from "express";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import path from "path";
import {fileURLToPath} from "url";

const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"64kb"}));
app.use(express.static(__dirname));

const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==="require"?{rejectUnauthorized:false}:undefined}):null;
const JWT_SECRET=process.env.JWT_SECRET;
const ready=()=>pool&&JWT_SECRET;

app.get("/health",async(req,res)=>{try{if(pool)await pool.query("select 1");res.json({ok:true,database:!!pool,auth:!!JWT_SECRET})}catch(e){res.status(503).json({ok:false})}});
app.post("/api/auth/login",async(req,res)=>{
 if(!ready())return res.status(503).json({error:"identity_service_not_configured"});
 const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
 if(!email||!password)return res.status(400).json({error:"credentials_required"});
 const q=await pool.query("select id,email,password_hash,display_name,role,status,must_change_password from users where lower(email)=$1 limit 1",[email]);
 const u=q.rows[0]; if(!u||u.status!=="active"||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"invalid_credentials"});
 const token=jwt.sign({sub:u.id,email:u.email,role:u.role},JWT_SECRET,{expiresIn:"8h",issuer:"cogia-365-studio"});
 res.json({token,user:{id:u.id,email:u.email,name:u.display_name,role:u.role,mustChangePassword:u.must_change_password}});
});
const requireAuth=(roles=[])=>async(req,res,next)=>{
 if(!JWT_SECRET)return res.status(503).json({error:"identity_service_not_configured"});
 const h=req.headers.authorization||""; if(!h.startsWith("Bearer "))return res.status(401).json({error:"unauthorized"});
 try{const claims=jwt.verify(h.slice(7),JWT_SECRET,{issuer:"cogia-365-studio"});if(roles.length&&!roles.includes(claims.role))return res.status(403).json({error:"forbidden"});req.user=claims;next()}catch{return res.status(401).json({error:"invalid_session"})}
};
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
app.get("/api/admin/users",requireAuth(["super_admin","admin"]),async(req,res)=>{
 const q=await pool.query("select id,email,display_name,role,status,must_change_password,created_at from users order by created_at desc");await audit(req.user.sub,"users_listed","user");res.json(q.rows);
});
app.patch("/api/admin/users/:id/role",requireAuth(["super_admin"]),async(req,res)=>{
 const role=String(req.body.role||"");if(!["super_admin","admin","developer","auditor","user"].includes(role))return res.status(400).json({error:"invalid_role"});
 const q=await pool.query("update users set role=$1,updated_at=now() where id=$2 returning id,email,role,status",[role,req.params.id]);if(!q.rows[0])return res.status(404).json({error:"not_found"});await audit(req.user.sub,"role_changed","user",req.params.id,{role});res.json(q.rows[0]);
});
app.patch("/api/admin/users/:id/status",requireAuth(["super_admin","admin"]),async(req,res)=>{
 const status=String(req.body.status||"");if(!["active","disabled","pending"].includes(status))return res.status(400).json({error:"invalid_status"});
 const q=await pool.query("update users set status=$1,updated_at=now() where id=$2 returning id,email,role,status",[status,req.params.id]);if(!q.rows[0])return res.status(404).json({error:"not_found"});await audit(req.user.sub,"status_changed","user",req.params.id,{status});res.json(q.rows[0]);
});
app.get("/api/admin/audit",requireAuth(["super_admin","admin","auditor"]),async(req,res)=>{const q=await pool.query("select id,actor_id,action,entity_type,entity_id,metadata,created_at from audit_log order by created_at desc limit 200");res.json(q.rows)});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"internal_error"})});
app.listen(process.env.PORT||8080,()=>console.log("COGIA 365 Studio listening"));
