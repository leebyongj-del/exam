// Firebase 콘솔 → 프로젝트 설정(톱니바퀴) → 내 앱 → 웹 앱에서 보이는 firebaseConfig 값을 그대로 붙여 넣으세요.
// 이 값은 웹용 공개 설정이라 저장소에 올라가도 괜찮습니다. 데이터는 firestore.rules가 보호합니다.
// 값이 비어 있으면(아래 그대로면) 웹앱은 '이 브라우저에만 저장' 모드로 동작합니다.
export const firebaseConfig = {
  apiKey: "여기에-apiKey",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
