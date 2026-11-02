import {sb} from '../lib/cloud.mjs';
// Explicit one-time server-side provisioning; never an email/password bypass in the app.
const email='demo@demo.com',password='password123!';
const user=await sb('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password,email_confirm:true})});
if(!user.id)throw Error('No created user ID. If the account exists, grant the grader entitlement by its real ID using the SQL editor. Do not silently reset another account.');
await sb('/rest/v1/entitlements?on_conflict=user_id,kind',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:user.id,kind:'grader',expires_at:null})});console.log('Grader account created and confirmed with paid research access. It has no admin or ingestion privileges.');
