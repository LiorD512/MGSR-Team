const {initializeApp,applicationDefault}=require("firebase-admin/app");
const {getFirestore}=require("firebase-admin/firestore");
const {getMessaging}=require("firebase-admin/messaging");

initializeApp({credential:applicationDefault(), projectId:"mgsr-64e4b"});
const db=getFirestore();

(async()=>{
  const snap=await db.collection("Accounts").doc("5Vb6uFVW3O9jY02VOeZ2").get();
  const d=snap.data();
  console.log("fcmToken (Android):", d.fcmToken ? d.fcmToken.substring(0,40)+"..." : "(empty/missing)");
  console.log("fcmTokens array:", JSON.stringify((d.fcmTokens||[]).map(t=>({platform:t.platform, tokenPrefix:(t.token||"").substring(0,30)+"...", updatedAt:t.updatedAt}))));

  if(d.fcmToken){
    try{
      await getMessaging().send({token:d.fcmToken,data:{test:"1"}},{dryRun:true});
      console.log("Android token: ALIVE");
    }catch(e){
      console.log("Android token: DEAD -", e.code||e.message);
    }
  } else {
    console.log("No Android fcmToken stored!");
  }

  for(const entry of (d.fcmTokens||[])){
    const tok = entry.token||entry;
    try{
      await getMessaging().send({token:tok,data:{test:"1"}},{dryRun:true});
      console.log("Web token ("+( entry.platform||"?")+"): ALIVE");
    }catch(e){
      console.log("Web token ("+(entry.platform||"?")+"): DEAD -", e.code||e.message);
    }
  }
  process.exit(0);
})();
