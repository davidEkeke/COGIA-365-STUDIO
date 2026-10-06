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
app.get("/api/me",async(req,res)=>{
 if(!JWT_SECRET)return res.status(503).json({error:"identity_service_not_configured"});
 const h=req.headers.authorization||""; if(!h.startsWith("Bearer "))return res.status(401).json({error:"unauthorized"});
 try{res.json(jwt.verify(h.slice(7),JWT_SECRET,{issuer:"cogia-365-studio"}))}catch{res.status(401).json({error:"invalid_session"})}
});
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:"internal_error"})});
app.listen(process.env.PORT||8080,()=>console.log("COGIA 365 Studio listening"));
