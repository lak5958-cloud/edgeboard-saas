import {createHash,timingSafeEqual} from 'node:crypto';
import {AppError,sb} from './cloud.mjs';
// Server-only digest. Never send the accepted code or its digest to the browser.
const accepted=Buffer.from('605519a359aa6c4cfe806ca68b817e46ffb551c27835f665f90fb6e88c69bc64','hex');
export async function redeemAccessCode(user,code,db=sb){
 if(!user?.id)throw new AppError(401,'Sign in before redeeming an access code.');
 if(typeof code!=='string'||code.length>64||!timingSafeEqual(createHash('sha256').update(code.trim()).digest(),accepted))throw new AppError(400,'That access code is not valid. Check the spelling and try again.');
 await db('/rest/v1/entitlements?on_conflict=user_id,kind',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({user_id:user.id,kind:'complimentary',expires_at:null})});
 return {redeemed:true,message:'Pro access unlocked for free. No payment or subscription is required.'};
}
