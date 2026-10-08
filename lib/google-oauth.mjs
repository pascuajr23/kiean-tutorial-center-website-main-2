import {createHash} from 'node:crypto';

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy'
];

export class GoogleOAuth {
  constructor({clientId,clientSecret,redirectUri,fetcher=fetch}){
    this.clientId=clientId;
    this.clientSecret=clientSecret;
    this.redirectUri=redirectUri;
    this.fetcher=fetcher;
  }
  authorizationUrl(state,codeVerifier){
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({
      client_id:this.clientId,
      redirect_uri:this.redirectUri,
      response_type:'code',
      scope:GOOGLE_SCOPES.join(' '),
      access_type:'offline',
      prompt:'consent select_account',
      include_granted_scopes:'true',
      state,
      code_challenge:createHash('sha256').update(codeVerifier).digest('base64url'),
      code_challenge_method:'S256'
    }).toString();
    return url.toString();
  }
  async exchange(code,codeVerifier){
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        code,
        client_id:this.clientId,
        client_secret:this.clientSecret,
        redirect_uri:this.redirectUri,
        code_verifier:codeVerifier,
        grant_type:'authorization_code'
      }),
      signal:AbortSignal.timeout(15000)
    });
    let data;
    try{data=await response.json();}catch{throw new Error('Google OAuth returned an invalid response.');}
    if(!response.ok||!data.access_token)throw new Error('Google authorization could not be completed.');
    const profileResponse=await this.fetcher('https://openidconnect.googleapis.com/v1/userinfo',{
      headers:{Authorization:'Bearer '+data.access_token},
      signal:AbortSignal.timeout(15000)
    });
    let profile;
    try{profile=await profileResponse.json();}catch{throw new Error('Google account verification failed.');}
    if(!profileResponse.ok||profile.email_verified!==true||!profile.email)throw new Error('Google account verification failed.');
    return {email:profile.email.toLowerCase(),refreshToken:data.refresh_token};
  }
  async refresh(refreshToken){
    const response=await this.fetcher('https://oauth2.googleapis.com/token',{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({
        client_id:this.clientId,
        client_secret:this.clientSecret,
        refresh_token:refreshToken,
        grant_type:'refresh_token'
      }),
      signal:AbortSignal.timeout(15000)
    });
    let data;
    try{data=await response.json();}catch{throw new Error('Google Calendar authentication failed.');}
    if(!response.ok||!data.access_token)throw new Error('Google Calendar authentication failed.');
    return {accessToken:data.access_token,expiresIn:Number(data.expires_in)||3600};
  }
}
