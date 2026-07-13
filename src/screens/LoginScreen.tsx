import { useAuth } from "../auth";

export default function LoginScreen() {
  const { signIn, continueAsGuest, configured, error } = useAuth();

  return (
    <div className="auth-screen">
      <div className="rings" />
      <div className="auth-logo">⛳</div>
      <div className="auth-title">멘탈게임</div>
      <div className="auth-sub">
        골프 내기, 계산은 앱이 하고
        <br />
        멘탈만 챙기세요.
      </div>

      <div className="auth-actions">
        <button className="btn-google" onClick={signIn}>
          <GoogleG />
          Google 계정으로 시작
        </button>

        <div className="divider-or">또는</div>

        <button className="btn-text" onClick={continueAsGuest}>
          로그인 없이 바로 시작하기
        </button>

        <p className="auth-note">
          로그인하면 <b>내가 참여한 라운드 기록</b>이 자동 저장돼요.
          <br />
          로그인 없이 진행하면 기록은 저장·조회되지 않습니다.
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

function GoogleG() {
  return (
    <svg className="g-logo" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
