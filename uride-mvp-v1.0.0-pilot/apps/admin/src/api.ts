export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';
let token='';
export const setAdminToken=(v:string)=>{token=v};
async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const r=await fetch(`${API_URL}${path}`,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(init?.headers||{})}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(body?.message||`Request failed (${r.status})`);
  return body as T;
}
export const adminApi={
  login:(email:string,password:string)=>request<any>('/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})}),
  dashboard:()=>request<any>('/v1/admin/dashboard'),
  pendingDrivers:()=>request<any[]>('/v1/admin/drivers/pending'),
  driverStatus:(id:string,status:string,adminUserId:string)=>request<any>(`/v1/admin/drivers/${id}/status`,{method:'PATCH',body:JSON.stringify({status,adminUserId})}),
  vehicleStatus:(id:string,status:string,adminUserId:string)=>request<any>(`/v1/admin/vehicles/${id}/status`,{method:'PATCH',body:JSON.stringify({status,adminUserId})}),
  pendingDocuments:()=>request<any[]>('/v1/admin/documents/pending'),
  documentStatus:(id:string,status:string,adminUserId:string,rejectionReason?:string)=>request<any>(`/v1/admin/documents/${id}/status`,{method:'PATCH',body:JSON.stringify({status,adminUserId,rejectionReason})}),
  activeTrips:()=>request<any[]>('/v1/admin/trips/active'),
  tickets:()=>request<any[]>('/v1/admin/support/tickets'),
  ticketStatus:(id:string,status:string,adminUserId:string)=>request<any>(`/v1/admin/support/tickets/${id}`,{method:'PATCH',body:JSON.stringify({status,adminUserId})}),
  incidents:()=>request<any[]>('/v1/admin/safety/incidents'),
  incidentStatus:(id:string,status:string,adminUserId:string,operatorResolution?:string)=>request<any>(`/v1/admin/safety/incidents/${id}`,{method:'PATCH',body:JSON.stringify({status,adminUserId,operatorResolution})}),
  incidentAction:(id:string,action:string,adminUserId:string,note?:string)=>request<any>(`/v1/admin/safety/incidents/${id}/actions`,{method:'POST',body:JSON.stringify({action,adminUserId,note})}),
  safetyMonitor:(tripId:string)=>request<any>(`/v1/admin/safety/trips/${tripId}/monitor`),
  aiOperationsBrief:()=>request<any>('/v1/admin/ai/operations-brief'),
  aiSupportAssist:(ticketId:string,message?:string)=>request<any>(`/v1/admin/ai/support/${ticketId}/assist`,{method:'POST',body:JSON.stringify({message})}),
  pricingRules:()=>request<any[]>('/v1/admin/pricing/rules'),
  createPricingRule:(body:any)=>request<any>('/v1/admin/pricing/rules',{method:'POST',body:JSON.stringify(body)}),
  pricingRuleStatus:(id:string,isActive:boolean)=>request<any>(`/v1/admin/pricing/rules/${id}/status`,{method:'PATCH',body:JSON.stringify({isActive})}),
  bonusCampaigns:()=>request<any[]>('/v1/admin/bonuses'),
  createBonusCampaign:(body:any)=>request<any>('/v1/admin/bonuses',{method:'POST',body:JSON.stringify(body)}),
  bonusStatus:(id:string,isActive:boolean)=>request<any>(`/v1/admin/bonuses/${id}/status`,{method:'PATCH',body:JSON.stringify({isActive})}),
  riskCases:()=>request<any[]>('/v1/admin/risk/cases'),
  riskUser:(userId:string)=>request<any>(`/v1/admin/risk/users/${userId}`),
  riskReview:(caseId:string,body:any)=>request<any>(`/v1/admin/risk/cases/${caseId}/review`,{method:'POST',body:JSON.stringify(body)}),
  refunds:()=>request<any[]>('/v1/admin/refunds'),
  refundStatus:(id:string,status:string,adminUserId:string)=>request<any>(`/v1/admin/refunds/${id}`,{method:'PATCH',body:JSON.stringify({status,adminUserId})}),
  audit:()=>request<any[]>('/v1/admin/audit'),
};
