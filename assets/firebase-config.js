/* ============================================================================
   FarmFlow — Firebase Web SDK configuration (project farmflow-51796)
   Loaded by the email action handler at /auth/action/.

   The apiKey here is a PUBLIC client identifier, not a secret — it is safe to
   commit and ship. It only identifies the Firebase project to the browser;
   access is still governed by Firebase Auth + Security Rules.

   ┌────────────────────────────────────────────────────────────────────────┐
   │  ACTION REQUIRED (one-time): paste your WEB app's values                │
   │  Firebase console → Project settings → General → "Your apps" →          │
   │  your Web app → "SDK setup and configuration" → Config.                 │
   │  Replace apiKey and appId below with the WEB app's values.              │
   │                                                                          │
   │  projectId / authDomain / messagingSenderId / storageBucket already     │
   │  match this project. The apiKey pre-filled below is the ANDROID key from │
   │  google-services.json; it may be application-restricted and therefore   │
   │  fail from a browser, so replacing it with the Web key is recommended.  │
   │                                                                          │
   │  NOTE: the action handler ALSO reads the apiKey Firebase appends to      │
   │  every email link (?apiKey=…) and uses that at runtime, so the handler   │
   │  keeps working even before you swap the key — but set it correctly for   │
   │  clarity and for any future non-link usage.                             │
   └────────────────────────────────────────────────────────────────────────┘
   ============================================================================ */
window.FARMFLOW_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAf1rpAo14FUFoznUaL7FOCnvsJ4OPe0iQ", // ← Android key; REPLACE with your Web app's apiKey
  authDomain: "farmflow-51796.firebaseapp.com",
  projectId: "farmflow-51796",
  storageBucket: "farmflow-51796.firebasestorage.app",
  messagingSenderId: "288430465932",
  appId: "PASTE_YOUR_WEB_APP_ID_HERE"                // ← optional for Auth; REPLACE with your Web app's appId
};
