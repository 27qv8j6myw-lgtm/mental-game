import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth";
import { RoundProvider } from "./round";
import "./index.css";
import { startUpdateCheck } from "./update";
import { captureInvite } from "./invite";

// 초대 링크(?join=1234)로 열었으면 코드를 기기에 옮겨 둔다 (로그인을 거쳐도 남게)
captureInvite();
startUpdateCheck();

// 신호가 없어도 앱 화면이 열리게 (배포판만: 개발 서버에서는 수정이 바로 보이도록 쓰지 않는다)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("서비스 워커 등록 실패", e));
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RoundProvider>
        <App />
      </RoundProvider>
    </AuthProvider>
  </React.StrictMode>
);
