export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000';
let authToken='';
export const setAuthToken=(v:string)=>{authToken=v};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type':'application/json', ...(authToken?{Authorization:`Bearer ${authToken}`}:{ }), ...(init?.headers || {}) } });
  const body = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(body?.message || `Request failed (${response.status})`);
  return body as T;
}
export const passengerApi = {
  aiAssist:(body:any)=>request<any>('/v1/ai/passenger/assist',{method:'POST',body:JSON.stringify(body)}),
  aiHistory:(userId:string)=>request<any[]>(`/v1/ai/users/${userId}/history`),
  registerRiskDevice:(body:any)=>request<any>('/v1/risk/devices/register',{method:'POST',body:JSON.stringify(body)}),
  riskSummary:(userId:string)=>request<any>(`/v1/risk/users/${userId}/summary`),
  registerPushDevice:(body:any)=>request<any>('/v1/notifications/devices/register',{method:'POST',body:JSON.stringify(body)}),
  notificationHistory:(userId:string)=>request<any[]>(`/v1/notifications/users/${userId}/history`),
  register:(body:any)=>request<any>('/v1/auth/register',{method:'POST',body:JSON.stringify({...body,role:'PASSENGER'})}),
  login:(email:string,password:string)=>request<any>('/v1/auth/login',{method:'POST',body:JSON.stringify({email,password})}),
  route:(origin:any,destination:any)=>request<any>('/v1/routing/route',{method:'POST',body:JSON.stringify({origin:{lat:origin.latitude,lng:origin.longitude},destination:{lat:destination.latitude,lng:destination.longitude}})}),
  quote:(body:any)=>request<any>('/v1/pricing/quote',{method:'POST',body:JSON.stringify(body)}),
  createTrip:(body:any)=>request<any>('/v1/trips',{method:'POST',body:JSON.stringify(body)}),
  getTrip:(tripId:string)=>request<any>(`/v1/trips/${tripId}`),
  changeDestination:(tripId:string,body:any)=>request<any>(`/v1/trips/${tripId}/destination`,{method:'PATCH',body:JSON.stringify(body)}),
  createPaymentIntent:(tripId:string,key:string,tip=0)=>request<any>(`/v1/payments/trip/${tripId}/intent`,{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({tip})}),
  syncPayment:(paymentId:string)=>request<any>(`/v1/payments/${paymentId}/sync`,{method:'POST'}),
  cancelTrip:(tripId:string,actorUserId:string)=>request<any>(`/v1/trips/${tripId}/cancel`,{method:'POST',body:JSON.stringify({actor:'PASSENGER',actorUserId,reason:'PASSENGER_CHANGED_MIND'})}),
  rateTrip:(tripId:string,fromUserId:string,stars:number,comment='')=>request<any>(`/v1/trips/${tripId}/rating`,{method:'POST',body:JSON.stringify({fromUserId,stars,comment})}),
  favoriteDriver:(tripId:string,passengerUserId:string)=>request<any>(`/v1/trips/${tripId}/favorite-driver`,{method:'POST',body:JSON.stringify({passengerUserId})}),
  returnTrip:(tripId:string,passengerUserId:string)=>request<any>(`/v1/trips/${tripId}/return-trip`,{method:'POST',body:JSON.stringify({passengerUserId})}),
  scheduleReturn:(tripId:string,passengerUserId:string,scheduledFor:string)=>request<any>(`/v1/trips/${tripId}/schedule-return`,{method:'POST',body:JSON.stringify({passengerUserId,scheduledFor})}),
  upcoming:(passengerUserId:string)=>request<any[]>(`/v1/trips/passenger/${passengerUserId}/upcoming`),
  favorites:(passengerUserId:string)=>request<any[]>(`/v1/trips/passenger/${passengerUserId}/favorites`),
  reminders:(passengerUserId:string)=>request<any[]>(`/v1/trips/passenger/${passengerUserId}/reminders`),
  addTrustedContact:(body:any)=>request<any>('/v1/safety/contacts',{method:'POST',body:JSON.stringify(body)}),
  trustedContacts:(userId:string)=>request<any[]>(`/v1/safety/contacts/${userId}`),
  sos:(tripId:string,body:any)=>request<any>(`/v1/safety/trips/${tripId}/sos`,{method:'POST',body:JSON.stringify(body)}),
  reportIncident:(tripId:string,body:any)=>request<any>(`/v1/safety/trips/${tripId}/incidents`,{method:'POST',body:JSON.stringify(body)}),
  shareTrip:(tripId:string)=>request<any>(`/v1/safety/trips/${tripId}/share`),
  createSafetyShareLink:(tripId:string,userId:string)=>request<any>(`/v1/safety/trips/${tripId}/share-links`,{method:'POST',body:JSON.stringify({userId,expiresInMinutes:240})}),
  createSupportTicket:(body:any)=>request<any>('/v1/support/tickets',{method:'POST',body:JSON.stringify(body)}),
  myTickets:(userId:string)=>request<any[]>(`/v1/support/tickets?userId=${encodeURIComponent(userId)}`),
  reportLostItem:(body:any)=>request<any>('/v1/support/lost-items',{method:'POST',body:JSON.stringify(body)}),
  requestRefund:(body:any)=>request<any>('/v1/support/refunds',{method:'POST',body:JSON.stringify(body)}),
};
