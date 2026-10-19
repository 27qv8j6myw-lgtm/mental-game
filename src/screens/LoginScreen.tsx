import { useState } from "react";
import { useAuth } from "../auth";
import { GoogleLogo, Icon, KakaoLogo } from "../icons";
import { detectInApp, openExternal } from "../inapp";

export default function LoginScreen() {
  const { signIn, configured, error } = useAuth();
  const [inApp] = useState(() => detectInApp());
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  const goExternal = async () => {
    if (!inApp) return;
    const result = await openExternal(inApp);
    setOpenMsg(
      result === "copied"
        ? "링크를 복사했어요. Safari나 Chrome 주소창에 붙여넣어 열어 주세요."
        : "외부 브라우저가 열리지 않으면 화면의 ⋯ 메뉴에서 '다른 브라우저로 열기'를 눌러 주세요."
    );
  };

  return (
    <div className="auth-screen">
      <div className="rings" />
      <div className="auth-logo">
        <Icon name="flag" size={40} strokeWidth={1.8} />
      </div>
      <div className="auth-title">멘탈게임</div>
      <div className="auth-sub">
        골프 내기, 계산은 앱이 할게요
        <br />
        멘탈만 챙기세요.
      </div>

      <div className="auth-actions">
        {inApp && (
          <div className="inapp-note">
            <b>{inApp.name} 안에서 열렸어요</b>
            <p>
              카카오 로그인은 여기서 바로 할 수 있어요. 구글 로그인은 Safari·Chrome 같은 외부
              브라우저에서만 돼요.
            </p>
            <button className="inapp-open" onClick={() => void goExternal()}>
              외부 브라우저로 열기
            </button>
            {openMsg && <p className="inapp-msg">{openMsg}</p>}
          </div>
        )}

        <button className="btn-kakao" onClick={() => void signIn("kakao")}>
          <KakaoLogo />
          카카오로 시작하기
          {inApp && <span className="rec-tag">추천</span>}
        </button>

        <button
          className="btn-google"
          onClick={() => void (inApp ? goExternal() : signIn("google"))}
        >
          <GoogleLogo />
          {inApp ? "Google은 외부 브라우저에서 시작" : "Google 계정으로 시작"}
        </button>

        <p className="auth-note">
          로그인하면 <b>프로필 사진과 이름</b>이 자동으로 적용돼요.
          <br />
          라운드는 방장이 만든 <b>초대 코드</b>로 참여할 수 있어요.
        </p>

        {!configured && (
          <div className="auth-err">
            ⚠️ 백엔드(Supabase)가 아직 연결되지 않았어요. (설정법은 README 참고)
          </div>
        )}
        {error && <div className="auth-err">{error}</div>}
      </div>
    </div>
  );
}
