import {getRequestUser} from './requestUser';
function ok(c:any,data:unknown){return c.json({success:true,data,meta:{requestId:c.get('requestId')}});}
function fail(c:any,status:number,code:string,message:string){return c.json({success:false,error:{code,message},meta:{requestId:c.get('requestId')}},status);}
function originAllowed(c:any):boolean{const origin=c.req.header('Origin');return !origin||origin===new URL(c.req.url).origin;}
export function registerHistoryPreferenceRoutes(app:any){
  app.get('/api/v1/me/preferences',async(c:any)=>{
    const user=await getRequestUser(c);if(!user)return fail(c,401,'AUTH_REQUIRED','A Kairo account session is required to read preferences.');
    try{
      const row=await c.env.DB.prepare('SELECT history_paused AS historyPaused FROM user_preferences WHERE user_id=? LIMIT 1').bind(user.id).first() as {historyPaused:number}|null;
      return ok(c,{historyPaused:Number(row?.historyPaused??0)===1});
    }catch{return fail(c,503,'PREFERENCES_UNAVAILABLE','Your account preferences are temporarily unavailable.');}
  });
  app.put('/api/v1/me/preferences',async(c:any)=>{
    if(!originAllowed(c))return fail(c,403,'ORIGIN_FORBIDDEN','This request origin is not allowed.');
    const user=await getRequestUser(c);if(!user)return fail(c,401,'AUTH_REQUIRED','A Kairo account session is required to update preferences.');
    const body=await c.req.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.historyPaused!=='boolean')return fail(c,400,'VALIDATION_ERROR','historyPaused must be a boolean.');
    try{
      const historyPaused=body.historyPaused?1:0;
      await c.env.DB.prepare(`INSERT INTO user_preferences(user_id,history_paused) VALUES(?,?)
        ON CONFLICT(user_id) DO UPDATE SET history_paused=excluded.history_paused,updated_at=CURRENT_TIMESTAMP`).bind(user.id,historyPaused).run();
      return ok(c,{historyPaused:historyPaused===1});
    }catch{return fail(c,503,'PREFERENCES_UNAVAILABLE','Your account preferences could not be saved.');}
  });
}
