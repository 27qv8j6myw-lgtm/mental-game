import { useState } from "react";
import { useAuth } from "../auth";
import { AppleLogo, GoogleLogo, Icon, KakaoLogo, Wordmark } from "../icons";
import { isNativeApp } from "../native";
import { detectInApp, openExternal } from "../inapp";
import { APP_STORE_URL, appJoinLink, isAppleMobileBrowser, peekInvite } from "../invite";

export default function LoginScreen() {
  const { signIn, signInWithApple, configured, error, notice, user } = useAuth();
  // Apple 로그인은 iOS 앱에서만 (아이폰의 Apple 로그인 창)
  const [native] = useState(() => isNativeApp());
  const guest = !!user?.isAnonymous;
  const [inApp] = useState(() => detectInApp());
  const [openMsg, setOpenMsg] = useState<string | null>(null);
  // 초대 링크로 들어왔으면: 앱 없이 로그인하면 바로 참여된다고 알리고, 아이폰이면 앱에서 여는 길도 보여 준다
  const [invite] = useState(() => (native ? null : peekInvite()));
  const [iphone] = useState(() => isAppleMobileBrowser());

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
        <Icon name="flag" size={54} strokeWidth={1.8} />
      </div>
      <h1 className="auth-title">
        <Wordmark height={40} />
      </h1>
      <div className="auth-sub">
        골프 내기, 계산은 앱이 할게요
        <br />
        멘탈만 챙기세요.
      </div>

      <div className="auth-actions">
        {invite && (
          <div className="invite-note">
            <b>라운드 초대를 받았어요 · 코드 {invite}</b>
            <p>앱을 설치하지 않아도 돼요. 아래에서 로그인하면 바로 참여돼요.</p>
            {iphone && (
              <div className="invite-app">
                <a className="invite-app-btn" href={appJoinLink(invite)}>
                  앱에서 열기
                </a>
                <a className="invite-app-btn line" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
                  앱 받기
                </a>
              </div>
            )}
            {iphone && <p className="invite-app-note">아이폰에 멘탈게임 앱이 있으면 '앱에서 열기'를 눌러요.</p>}
          </div>
        )}
        {/* 예전 '로그인 없이 참여하기' 세션: 로그인하면 게스트로 친 라운드가 새 계정으로 옮겨진다 */}
        {guest && (
          <div className="guest-note">
            <b>이제 로그인해야 쓸 수 있어요</b>
            <p>
              로그인 없이 참여하기가 끝났어요. 카카오나 구글로 로그인하면 지금까지 게스트로 친 라운드도 내 계정으로
              옮겨져요.
            </p>
          </div>
        )}
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

        {native && (
          <button className="btn-apple" onClick={() => void signInWithApple()}>
            <AppleLogo />
            Apple로 계속하기
          </button>
        )}

        <p className="auth-note">
          로그인하면 <b>프로필 사진과 이름</b>이 자동으로 적용돼요.
          <br />
          라운드는 방장이 만든 <b>초대 코드</b>로 참여할 수 있어요.
        </p>
        <p className="auth-policy">
          시작하면 <a href="/privacy">개인정보처리방침</a>에 동의하는 것으로 봐요 · <a href="/support">고객 지원</a>
        </p>

        {!configured && (
          <div className="auth-err">
            ⚠️ 백엔드(Supabase)가 아직 연결되지 않았어요. (설정법은 README 참고)
          </div>
        )}
        {error && <div className="auth-err">{error}</div>}
        {notice && <div className="auth-ok">{notice}</div>}
      </div>
    </div>
  );
}
