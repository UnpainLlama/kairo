import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
type Mode='login'|'register';
type Envelope={success?:boolean;data?:{message?:string};error?:{message?:string}};
async function post(path:string,body:Record<string,string>):Promise<Envelope>{
 const r=await fetch('/api/v1/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'same-origin',body:JSON.stringify(body)});
 const p=await r.json().catch(()=>null) as Envelope|null;if(!r.ok||!p?.success)throw new Error(p?.error?.message??'The request could not be completed.');return p;
}
const googleMessages:Record<string,string>={
 link_required:'A Kairo account already uses this Google email. Sign in with your existing email and password, then connect Google from Settings. We never merge accounts automatically.',
 reauth_required:'Please sign in again to protect your account. Kairo will resume connecting Google after you sign in.',
 sign_in_required:'Sign in to Kairo first. Kairo will resume connecting Google after you sign in.',
 cancelled:'Google sign-in was cancelled. You can try again.',
 expired:'That Google sign-in request expired. Please try again.',
 not_configured:'Google sign-in has not been configured on this environment yet.',
 failed:'Google sign-in could not be completed. Please try again.',
 account_unavailable:'This Kairo account is currently unavailable.',
 token_exchange_failed:'Google could not complete account linking. Please try again from Settings.',
 missing_identity:'Google did not return an account identity. Please try again.'
};
const youtubeMessages:Record<string,string>={
 sign_in_required:'Sign in to Kairo first. Kairo will resume connecting YouTube after you sign in.',
 reauth_required:'Please sign in again to protect your account. Kairo will resume connecting YouTube after you sign in.',
 cancelled:'You cancelled the YouTube connection.',
 invalid_response:'The YouTube authorization response could not be verified. Please try again.',
 expired:'That YouTube connection request expired. Please try again.',
 token_exchange_failed:'Google could not complete the YouTube authorization. Please try again.',
 invalid_grant:'Google did not grant the required YouTube read-only permission.',
 refresh_token_missing:'Google did not provide offline access. Please retry the connection.',
 failed:'YouTube could not be connected. Please try again.'
};
export default function AuthPage({mode}:{mode:Mode}){
 const navigate=useNavigate();const [params]=useSearchParams();const [displayName,setName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await post(mode,mode==='register'?{displayName,email,password}:{email,password});window.dispatchEvent(new Event('kairo:auth-change'));const continuation=params.get('continue');const destination=continuation==='google-link'?'/settings?connect=google':continuation==='youtube-connect'?'/settings?connect=youtube':'/profile';navigate(destination,{replace:true});}catch(e){setError(e instanceof Error?e.message:'Request failed.')}finally{setBusy(false)}}
 const googleMessage=params.get('google');
 const youtubeMessage=params.get('youtube');
 const switchPath=mode==='register'?'/login':'/register';
 const switchQuery=params.toString();
 return <section className="kc-auth"><div className="kc-auth-card"><Link to="/" className="kc-auth-brand"><img src="/kairo-k.svg" alt="" width="24" height="28"/>Kairo</Link>
 <h1>{mode==='register'?'Create your account':'Welcome back'}</h1><p className="kc-auth-copy">{mode==='register'?'Create a Kairo account to keep your anime library in sync.':'Sign in to continue to your Kairo account.'}</p>
 {googleMessage&&<p className="kc-auth-error" role="alert">{googleMessages[googleMessage]??'Google sign-in could not be completed.'}</p>}
 {youtubeMessage&&<p className="kc-auth-error" role="alert">{youtubeMessages[youtubeMessage]??'YouTube connection could not be completed.'}</p>}
 <a className="kc-auth-google" href="/api/v1/auth/google"><span aria-hidden="true">G</span>Continue with Google</a>
 <div className="kc-auth-divider"><span>or continue with email</span></div>
 <form onSubmit={submit}>{mode==='register'&&<label>Display name<input autoComplete="nickname" required minLength={2} maxLength={40} value={displayName} onChange={e=>setName(e.target.value)}/></label>}
 <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <label>Password<input type="password" autoComplete={mode==='register'?'new-password':'current-password'} required minLength={mode==='register'?12:1} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)}/></label>
 {mode==='register'&&<p className="kc-auth-copy">Use at least 12 characters. You can sign in immediately after creating your account.</p>}
 {error&&<p className="kc-auth-error" role="alert">{error}</p>}
 <button className="kc-auth-submit" type="submit" disabled={busy}>{busy?'Please wait…':mode==='register'?'Create account':'Sign in'}</button></form>
 <p className="kc-auth-switch">{mode==='register'?'Already have an account?':'New to Kairo?'} <Link to={`${switchPath}${switchQuery? `?${switchQuery}`:''}`}>{mode==='register'?'Sign in':'Create an account'}</Link></p>
 </div></section>
}
