import {createHmac,timingSafeEqual,createHash} from 'node:crypto';import {request,required,AppError,sb} from './cloud.mjs';
export async function stripe(route,form,{idempotencyKey}={}){
 const headers={Authorization:'Bearer '+required('STRIPE_SECRET_KEY'),'Stripe-Version':'2026-09-30.endive'};
 if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
 if(form)headers['Content-Type']='application/x-www-form-urlencoded';
 return request('https://api.stripe.com/v1/'+route,{
  method:form?'POST':'GET',headers,...(form?{body:new URLSearchParams(form)}:{})
 },(response,data)=>stripeError(route,response,data));
}

function stripeError(route,response,data){
 const isPrice=route.startsWith('prices/'),isCheckout=route==='checkout/sessions';
 const operation=isPrice?'reading the plan price':isCheckout?'creating the checkout session':'processing the billing request';
 const code=data?.error?.code||data?.error?.type||'';
 const safeCode=/^[a-z_]{1,64}$/.test(code)?code:'request_rejected';
 const rawId=response.headers.get('request-id')||'';
 const reference=/^req_[A-Za-z0-9]{1,80}$/.test(rawId)?` Stripe request ${rawId}.`:'';
 let message=`Stripe rejected the request while ${operation} (HTTP ${response.status}, ${safeCode}).`;
 if(response.status===401)message='Stripe rejected the configured API key. Verify the Production Stripe secret in Vercel.';
 if(response.status===403){
  const permission=isPrice?' Enable Prices Read.':isCheckout?' Enable Checkout Sessions Write.':'';
  message=`Stripe denied access while ${operation}.${permission}`;
 }
 if(isPrice&&(response.status===404||safeCode==='resource_missing')){
  message='Stripe could not find the configured plan price. Verify that the price ID and API key belong to the same Stripe account and mode.';
 }
 return new AppError(response.status===429?429:503,message+reference);
}
export function verifyWebhook(raw,signature,secret,now=Date.now()){
 const parts=String(signature||'').split(',').map(x=>x.split('=')),t=parts.find(x=>x[0]==='t')?.[1];if(!/^\d+$/.test(t||'')||Math.abs(now/1000-Number(t))>300)throw new AppError(400,'Invalid webhook timestamp.');
 const digest=createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');if(!parts.filter(x=>x[0]==='v1').some(([,s])=>/^[a-f0-9]{64}$/i.test(s)&&timingSafeEqual(Buffer.from(s,'hex'),Buffer.from(digest,'hex'))))throw new AppError(400,'Invalid webhook signature.');return JSON.parse(raw.toString());
}
export function billingReadiness(env=process.env){const missing=['STRIPE_SECRET_KEY','STRIPE_PRICE_ID','STRIPE_WEBHOOK_SECRET','APP_URL'].filter(k=>!env[k]),mode=/^[sr]k_live_/.test(String(env.STRIPE_SECRET_KEY||''))?'live':/^[sr]k_test_/.test(String(env.STRIPE_SECRET_KEY||''))?'test':'unconfigured',ready=!missing.length&&mode!=='unconfigured'&&(mode!=='live'||env.STRIPE_LIVE_ENABLED==='true');return {ready,mode,amount:799,currency:'usd',interval:'month',message:ready?(mode==='test'?'Test checkout only. No real payment is collected.':'Secure checkout is available.'): 'Checkout is not open yet. The owner must finish Stripe setup before payments can be accepted.'};}
async function configuredPrice(mode){
 const price=await stripe('prices/'+encodeURIComponent(required('STRIPE_PRICE_ID')));
 if(price.active!==true||price.unit_amount!==799||price.currency!=='usd'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||price.livemode!==(mode==='live'))throw new AppError(503,'The configured Stripe price does not match the advertised $7.99 monthly plan. Checkout is paused.');
 return price;
}
export async function verifyBillingConfig(){
 const config=billingReadiness();
 if(!config.ready)return config;
 await configuredPrice(config.mode);
 return {...config,priceVerified:true};
}
export async function checkout(user){
 const config=billingReadiness();
 if(!config.ready)throw new AppError(503,'Stripe setup is incomplete. No checkout or charge was created.');
 const price=await configuredPrice(config.mode);
 const existing=await sb('/rest/v1/entitlements?user_id=eq.'+encodeURIComponent(user.id)+'&kind=eq.subscription&select=customer_id,subscription_id,expires_at');
 if(existing.some(e=>e.subscription_id&&(!e.expires_at||Date.parse(e.expires_at)>Date.now())))throw new AppError(409,'You already have a subscription. Manage it from Account & billing.');
 const idempotencyKey=`edgeboard-checkout-${user.id}-${price.id}-${Math.floor(Date.now()/3600000)}`,suffix=[...createHash('sha256').update(idempotencyKey).digest().subarray(0,8)].map(n=>String.fromCharCode(97+n%26)).join('');
 return stripe('checkout/sessions',{mode:'subscription','line_items[0][price]':price.id,'line_items[0][quantity]':'1',...(existing[0]?.customer_id?{customer:existing[0].customer_id}:{customer_email:user.email}),client_reference_id:user.id,'subscription_data[metadata][user_id]':user.id,'subscription_data[billing_mode][type]':'flexible',integration_identifier:'edgeboard_research_'+suffix,success_url:required('APP_URL')+'/account?checkout=success',cancel_url:required('APP_URL')+'/pricing'},{idempotencyKey});
}
const idOf=x=>typeof x==='string'?x:x?.id;
export function subscriptionEntitlement(s,expectedPrice){
 const items=s.items?.data||[],matching=items.filter(i=>idOf(i.price)===expectedPrice),end=s.current_period_end||Math.max(0,...matching.map(i=>i.current_period_end||0));
 if(matching.length!==1||items.length!==1)return null;
 const paid=s.status==='active'&&end>0;
 return {customer_id:idOf(s.customer),subscription_id:s.id,expires_at:new Date((paid?end:0)*1000).toISOString()};
}
export async function syncSubscription(id,{api=stripe,db=sb}={}){
 if(!/^sub_[A-Za-z0-9]+$/.test(id||''))return null;
 const s=await api('subscriptions/'+encodeURIComponent(id)),entitlement=subscriptionEntitlement(s,required('STRIPE_PRICE_ID'));if(!entitlement)return null;
 const invoice=s.latest_invoice&&typeof s.latest_invoice==='object'?s.latest_invoice:s.latest_invoice?await api('invoices/'+encodeURIComponent(s.latest_invoice)):null;if(invoice?.status!=='paid')entitlement.expires_at='1970-01-01T00:00:00.000Z';
 // Prefer first-class subscription/customer ownership. Server-written checkout metadata is only an initial fallback.
 const bound=await db('/rest/v1/entitlements?kind=eq.subscription&subscription_id=eq.'+encodeURIComponent(id)+'&select=user_id,subscription_id,expires_at'),customer=entitlement.customer_id;
 const customers=bound.length?bound:customer?await db('/rest/v1/entitlements?kind=eq.subscription&customer_id=eq.'+encodeURIComponent(customer)+'&select=user_id,subscription_id,expires_at'):[];
 if(new Set(customers.map(r=>r.user_id)).size>1)throw new AppError(409,'Billing customer ownership is ambiguous. Owner review required.');
 const user=customers[0]?.user_id||s.metadata?.user_id;if(!/^[a-f0-9-]{36}$/.test(user||''))return null;
 const current=await db('/rest/v1/entitlements?kind=eq.subscription&user_id=eq.'+encodeURIComponent(user)+'&select=subscription_id,expires_at');
 if(current[0]?.subscription_id&&current[0].subscription_id!==id&&(!current[0].expires_at||Date.parse(current[0].expires_at)>Date.now()))return null;
 await db('/rest/v1/entitlements?on_conflict=user_id,kind',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:user,kind:'subscription',...entitlement})});return {user_id:user,...entitlement};
}
export const BILLING_EVENTS=['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','invoice.payment_action_required','charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'];
export async function riskSubscriptions(object,{api=stripe}={}){
 let payment=idOf(object.payment_intent);if(!payment&&object.charge){const charge=await api('charges/'+encodeURIComponent(idOf(object.charge)));payment=idOf(charge.payment_intent);}if(!payment)return [];
 const ids=new Set();let cursor='';
 for(let page=0;page<20;page++){
  const params=new URLSearchParams({'payment[type]':'payment_intent','payment[payment_intent]':payment,status:'paid',limit:'100',...(cursor?{starting_after:cursor}:{})}),result=await api('invoice_payments?'+params);
  for(const record of result.data||[]){const invoice=await api('invoices/'+encodeURIComponent(idOf(record.invoice))),subscription=invoice.parent?.type==='subscription_details'?idOf(invoice.parent.subscription_details?.subscription):null;if(subscription)ids.add(subscription);}
  if(!result.has_more)return [...ids];cursor=result.data?.at(-1)?.id;if(!cursor)throw new AppError(503,'Incomplete invoice payment pagination.');
 }
 throw new AppError(503,'Invoice payment review exceeded its page limit.');
}
export async function handleStripeEvent(event,{api=stripe,db=sb}={}){
 const mode=billingReadiness().mode;if(mode==='unconfigured')throw new AppError(503,'Stripe API credential is not configured.');if(event.livemode!==(mode==='live'))throw new AppError(400,'Stripe event mode does not match this environment.');
 if(!BILLING_EVENTS.includes(event.type))return {handled:false};if(!/^evt_[A-Za-z0-9]+$/.test(event.id||'')||!Number.isFinite(event.created))throw new AppError(400,'Invalid Stripe event identity.');
 const seen=await db('/rest/v1/billing_events?id=eq.'+encodeURIComponent(event.id)+'&select=id');if(seen.length)return {handled:true,duplicate:true};
 const object=event.data?.object||{},risk=['charge.refunded','charge.dispute.created','radar.early_fraud_warning.created'].includes(event.type);let ids=[],review=risk;
 if(risk)ids=await riskSubscriptions(object,{api});
 else if(event.type.startsWith('customer.subscription.'))ids=[object.id];
 else if(event.type.startsWith('invoice.'))ids=[idOf(object.parent?.subscription_details?.subscription||object.subscription)].filter(Boolean);
 else if(object.mode==='subscription'&&['paid','no_payment_required'].includes(object.payment_status))ids=[idOf(object.subscription)].filter(Boolean);
 for(const id of ids)await syncSubscription(id,{api,db});
 // Risk signals are durable owner review tasks. Never issue refunds or cancel billing automatically.
 await db('/rest/v1/billing_events?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({id:event.id,type:event.type,livemode:event.livemode,created_at:new Date(event.created*1000).toISOString(),object_id:object.id||null,subscription_ids:ids,review_required:review,result:risk?'Owner review required; no automatic monetary action.':'Authoritative subscription state synchronized.'})});
 return {handled:true,reviewRequired:review};
}
