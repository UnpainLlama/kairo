import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
type Mode='login'|'register';
type Envelope={success?:boolean;data?:{message?:string};error?:{message?:string}};
async function post(path:string,body:Record<string,string>):Promise<Envelope>{
 const r=await fetch('/api/v1/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
 const p=await r.json().catch(()=>null) as Envelope|null;if(!r.ok||!p?.success)throw new Error(p?.error?.message??'The request could not be completed.');return p;
}
export default function AuthPage({mode}:{mode:Mode}){
 const navigate=useNavigate();const [params]=useSearchParams();const [displayName,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [message,setMessage]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{if(mode!=='register')return;const token=params.get('token');if(!token)return;let active=true;setBusy(true);
 post('verify-email',{token}).then(r=>{if(active)setMessage(r.data?.message??'Email verified. You can sign in.')}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Verification failed.')}).finally(()=>{if(active)setBusy(false)});
 return()=>{active=false}},[mode,params]);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const r=await post(mode,mode==='register'?{displayName,email,password}:{email,password});if(mode==='login')navigate('/',{replace:true});else setMessage(r.data?.message??'Check your inbox for a verification link.')}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 async function resend(){setBusy(true);setError('');setMessage('');try{const r=await post('resend-verification',{email});setMessage(r.data?.message??'If eligible, a new email will be sent.')}catch(e){setError(e instanceof Error?e.message:'Could not resend email.')}finally{setBusy(false)}}
 const verifying=mode==='register'&&params.has('token');
 return <section className="kc-auth"><div className="kc-auth-card"><Link to="/" className="kc-auth-brand"><img src="/kairo-k.svg" alt="" width="24" height="28"/>Kairo</Link>
 {verifying?<><h1>Verify your email</h1><p className="kc-auth-copy">{busy?'Checking your verification link…':'Verification request processed.'}</p>{message&&<p className="kc-auth-message" role="status">{message}</p>}{error&&<p className="kc-auth-error" role="alert">{error}</p>}<Link className="kc-auth-submit kc-auth-link-button" to="/login">Continue to sign in</Link></>:<>
 <h1>{mode==='register'?'Create your account':'Welcome back'}</h1><p className="kc-auth-copy">{mode==='register'?'Create a Kairo account to keep your anime library in sync.':'Sign in to continue to your Kairo account.'}</p>
 <form onSubmit={submit}>{mode==='register'&&<label>Display name<input autoComplete="nickname" required minLength={2} maxLength={40} value={displayName} onChange={e=>setName(e.target.value)}/></label>}
 <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input type="password" autoComplete={mode==='register'?'new-password':'current-password'} required minLength={mode==='register'?12:1} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {error&&<p className="kc-auth-error" role="alert">{error}</p>}{message&&<p className="kc-auth-message" role="status">{message}</p>}
 <button className="kc-auth-submit" type="submit" disabled={busy}>{busy?'Please wait…':mode==='register'?'Create account':'Sign in'}</button></form>
 {mode==='login'&&<button className="kc-auth-resend" type="button" onClick={resend} disabled={busy||!email}>Resend verification email</button>}
 <p className="kc-auth-switch">{mode==='register'?'Already have an account?':'New to Kairo?'} <Link to={mode==='register'?'/login':'/register'}>{mode==='register'?'Sign in':'Create an account'}</Link></p></>}
 </div></section>
}
