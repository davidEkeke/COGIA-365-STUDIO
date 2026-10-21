import bcrypt from "bcryptjs";
import pg from "pg";

const required=["DATABASE_URL","COGIA_ADMIN_EMAIL","COGIA_ADMIN_NAME","COGIA_ADMIN_PASSWORD"];
const missing=required.filter(k=>!process.env[k]);
if(missing.length){
  console.error("Missing required environment variables:",missing.join(", "));
  process.exit(1);
}
if(process.env.COGIA_ADMIN_PASSWORD.length<12){
  console.error("COGIA_ADMIN_PASSWORD must contain at least 12 characters.");
  process.exit(1);
}

const pool=new pg.Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.PGSSL==="require"?{rejectUnauthorized:false}:undefined
});

const orgName=String(process.env.COGIA_ORGANIZATION_NAME||"Cabinet One").trim();
const email=String(process.env.COGIA_ADMIN_EMAIL).trim().toLowerCase();
const name=String(process.env.COGIA_ADMIN_NAME).trim();

try{
  await pool.query("begin");
  let org=(await pool.query("select id,name from organizations where name=$1 order by created_at asc limit 1",[orgName])).rows[0];
  if(!org){
    org=(await pool.query("insert into organizations(name) values($1) returning id,name",[orgName])).rows[0];
  }

  const existing=(await pool.query("select id,email,role,status from users where lower(email)=$1 limit 1",[email])).rows[0];
  if(existing){
    await pool.query("rollback");
    console.log("Admin already exists:",existing.email,existing.role,existing.status);
    process.exit(0);
  }

  const hash=await bcrypt.hash(process.env.COGIA_ADMIN_PASSWORD,12);
  const user=(await pool.query(
    "insert into users(organization_id,email,password_hash,display_name,role,status,must_change_password) values($1,$2,$3,$4,'super_admin','active',true) returning id,email,display_name,role,status,must_change_password",
    [org.id,email,hash,name]
  )).rows[0];

  await pool.query("insert into audit_log(actor_id,action,entity_type,entity_id,metadata) values($1,'bootstrap_super_admin','user',$2,$3::jsonb)",[user.id,user.id,JSON.stringify({organizationId:org.id})]);
  await pool.query("commit");
  console.log("Bootstrap complete for:",user.email);
  console.log("The user must change the temporary password at first login.");
}catch(err){
  try{await pool.query("rollback")}catch{}
  console.error("Bootstrap failed:",err.message);
  process.exit(1);
}finally{
  await pool.end();
}
