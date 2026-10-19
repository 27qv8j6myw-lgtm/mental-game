import { useAuth } from "../auth";
import { GoogleLogo, Icon, KakaoLogo } from "../icons";

export default function LoginScreen() {
  const { signIn, configured, error } = useAuth();

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
        <button className="btn-kakao" onClick={() => void signIn("kakao")}>
          <KakaoLogo />
          카카오로 시작하기
        </button>

        <button className="btn-google" onClick={() => void signIn("google")}>
          <GoogleLogo />
          Google 계정으로 시작
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
