import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

type Envelope={success?:boolean;data?:{message?:string};error?:{message?:string}};
async function post(body:Record<string,string>):Promise<Envelope>{
 const r=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
 const p=await r.json().catch(()=>null) as Envelope|null;
 if(!r.ok||!p?.success)throw new Error(p?.error?.message??'The request could not be completed.');
 return p;
}
export default function AuthPage(){
 const navigate=useNavigate();const [params]=useSearchParams();
 const [username,setUsername]=useState('');const [password,setPassword]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{
   await post({username,password});
   window.dispatchEvent(new Event('kairo:auth-change'));
   const continuation=params.get('continue');
   const destination=continuation==='admin'?'/rngOIjDRuU_YYrn8zdMkyM4uKJBGa7wYFYo6J_Sh-eA':'/profile';
   navigate(destination,{replace:true});
  }catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}
 }
 return <section className="kc-auth"><div className="kc-auth-card">
  <Link to="/" className="kc-auth-brand"><img src="/kairo-k.svg" alt="" width="24" height="28"/>Kairo</Link>
  <h1>Welcome back</h1>
  <p className="kc-auth-copy">Sign in with the username and password provided by your Kairo administrator.</p>
  <form onSubmit={submit}>
   <label>Username<input autoComplete="username" required minLength={3} maxLength={64} value={username} onChange={e=>setUsername(e.target.value)}/></label>
   <label>Password<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {error&&<p className="kc-auth-error" role="alert">{error}</p>}
   <button className="kc-auth-submit" type="submit" disabled={busy}>{busy?'Please wait…':'Sign in'}</button>
  </form>
 </div></section>
}
