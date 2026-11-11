import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
type Mode='login'|'register';
type Envelope={success?:boolean;data?:{message?:string};error?:{message?:string}};
async function post(path:string,body:Record<string,string>):Promise<Envelope>{
 const r=await fetch('/api/v1/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
 const p=await r.json().catch(()=>null) as Envelope|null;if(!r.ok||!p?.success)throw new Error(p?.error?.message??'The request could not be completed.');return p;
}
export default function AuthPage({mode}:{mode:Mode}){
 const navigate=useNavigate();const [displayName,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await post(mode,mode==='register'?{displayName,email,password}:{email,password});navigate('/',{replace:true});}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 return <section className="kc-auth"><div className="kc-auth-card"><Link to="/" className="kc-auth-brand"><img src="/kairo-k.svg" alt="" width="24" height="28"/>Kairo</Link>
 <h1>{mode==='register'?'Create your account':'Welcome back'}</h1><p className="kc-auth-copy">{mode==='register'?'Create a Kairo account to keep your anime library in sync.':'Sign in to continue to your Kairo account.'}</p>
 <form onSubmit={submit}>{mode==='register'&&<label>Display name<input autoComplete="nickname" required minLength={2} maxLength={40} value={displayName} onChange={e=>setName(e.target.value)}/></label>}
 <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input type="password" autoComplete={mode==='register'?'new-password':'current-password'} required minLength={mode==='register'?12:1} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {mode==='register'&&<p className="kc-auth-copy">Use at least 12 characters. You can sign in immediately after creating your account.</p>}
 {error&&<p className="kc-auth-error" role="alert">{error}</p>}
 <button className="kc-auth-submit" type="submit" disabled={busy}>{busy?'Please wait…':mode==='register'?'Create account':'Sign in'}</button></form>
 <p className="kc-auth-switch">{mode==='register'?'Already have an account?':'New to Kairo?'} <Link to={mode==='register'?'/login':'/register'}>{mode==='register'?'Sign in':'Create an account'}</Link></p>
 </div></section>
}
