import { useAuth } from "../auth";
import { GoogleLogo, Icon, KakaoLogo } from "../icons";

export default function LoginScreen() {
  const { signIn, continueAsGuest, configured, error } = useAuth();

  return (
    <div className="auth-screen">
      <div className="rings" />
      <div className="auth-logo">
        <Icon name="flag" size={40} strokeWidth={1.8} />
      </div>
      <div className="auth-title">멘탈게임</div>
      <div className="auth-sub">
        골프 내기, 계산은 앱이 하고
        <br />
        멘탈만 챙기세요.
      </div>

      <div className="auth-actions">
        <button className="btn-kakao" onClick={() => void signIn("kakao")}>
          <KakaoLogo />
          카카오로 시작하기
        </button>

        <button className="btn-google" onClick={() => void signIn("google")}>
          <GoogleLogo />
          Google 계정으로 시작
        </button>

        <div className="divider-or">또는</div>

        <button className="btn-text" onClick={() => void continueAsGuest()}>
          로그인 없이 참여하기
        </button>

        <p className="auth-note">
          로그인하면 <b>프로필 사진과 이름</b>이 자동으로 적용돼요.
          <br />
          로그인 없이도 <b>초대 코드</b>로 라운드에 참여할 수 있어요. (성별로 표시)
        </p>

        {!configured && (
          <div className="auth-err">
            ⚠️ 백엔드(Supabase)가 아직 연결되지 않았어요.
            <br />
            지금은 “로그인 없이 시작”으로 이용해 주세요. (설정법은 README 참고)
          </div>
        )}
        {error && <div className="auth-err">{error}</div>}
      </div>
    </div>
  );
}
