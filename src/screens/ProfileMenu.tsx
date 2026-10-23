import { useEffect, useState } from "react";
import { useAuth, type LinkProvider, type OAuthProvider } from "../auth";
import { isNativeApp } from "../native";
import { useBack } from "../back";
import { AppleLogo, GoogleLogo, Icon, KakaoLogo } from "../icons";
import { isAdmin } from "../admin";
import NameDialog from "./NameDialog";
import Guide from "../guide/Guide";

const LINKABLE: { id: OAuthProvider; label: string }[] = [
  { id: "kakao", label: "카카오" },
  { id: "google", label: "Google" },
];

/**
 * 프로필 메뉴: 하단 바 오른쪽 프로필 사진을 누르면 위로 열린다 (모든 탭에서 같은 메뉴).
 * 메뉴에서 연 이름 바꾸기·사용 방법은 메뉴가 닫혀도 남아 있도록 이 컴포넌트가 늘 붙어 있다
 */
export default function ProfileMenu({
  open,
  onClose,
  onAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onAdmin: () => void;
}) {
  const { user, signOutUser, linkProvider, linkApple, unlinkProvider, deleteAccount } = useAuth();
  // 기기 뒤로가기: 메뉴 닫기
  useBack(open, onClose);
  const [linkBusy, setLinkBusy] = useState<LinkProvider | null>(null);
  // Apple 은 아이폰의 Apple 로그인 창으로 연결해서 iOS 앱에서만 연결할 수 있다 (해제는 어디서나)
  const [native] = useState(() => isNativeApp());
  // 관리자 계정이면 대시보드 버튼을 보여준다
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void isAdmin().then(setAdmin);
  }, []);
  /** 내 이름 바꾸기 */
  const [nameOpen, setNameOpen] = useState(false);
  useBack(nameOpen, () => setNameOpen(false));
  /** 사용 방법 (뒤로가기는 설명서가 받는다) */
  const [guideOpen, setGuideOpen] = useState(false);
  /** 회원 탈퇴 확인 */
  const [leaving, setLeaving] = useState(false);
  useBack(leaving, () => setLeaving(false));
  const providers = user?.providers ?? [];

  const link = async (p: OAuthProvider) => {
    setLinkBusy(p);
    await linkProvider(p);
    setLinkBusy(null);
  };

  const connectApple = async () => {
    setLinkBusy("apple");
    await linkApple();
    setLinkBusy(null);
  };

  const unlink = async (p: LinkProvider, label: string) => {
    if (
      !window.confirm(
        `${label} 연결을 해제할까요?\n해제하면 ${label}로 로그인할 수 없어요.`
      )
    )
      return;
    setLinkBusy(p);
    await unlinkProvider(p);
    setLinkBusy(null);
  };

  return (
    <>
      {open && (
        <>
          {/* 메뉴 밖을 누르면 닫는다 */}
          <div className="menu-scrim" onClick={onClose} />
          <div className="menu profile-menu" role="menu">
            <div className="menu-head">
              <div className="mh-text">
                <div className="mn">{user?.displayName ?? "사용자"}</div>
                <div className="me">{user?.email}</div>
              </div>
              {/* 회원 탈퇴: 이름 옆에 작고 옅게 */}
              <button
                className="menu-leave"
                onClick={() => {
                  onClose();
                  setLeaving(true);
                }}
              >
                회원 탈퇴
              </button>
            </div>
            <div className="menu-links">
              <div className="ml-title">로그인 계정 연결</div>
              {/* Apple: 연결은 iOS 앱에서만 (웹에서는 연결돼 있을 때만 보이고 해제할 수 있다) */}
              {(native || providers.includes("apple")) && (
                <div className="ml-row">
                  <span className="ml-ic apple">
                    <AppleLogo size={13} />
                  </span>
                  <span className="ml-name">Apple</span>
                  {providers.includes("apple") && <span className="ml-on">연결됨</span>}
                  {providers.includes("apple") ? (
                    providers.length > 1 && (
                      <button
                        className="ml-btn ghost"
                        disabled={linkBusy !== null}
                        onClick={() => void unlink("apple", "Apple")}
                      >
                        해제
                      </button>
                    )
                  ) : (
                    <button className="ml-btn" disabled={linkBusy !== null} onClick={() => void connectApple()}>
                      {linkBusy === "apple" ? "…" : "연결"}
                    </button>
                  )}
                </div>
              )}
              {LINKABLE.map(({ id, label }) => {
                const linked = providers.includes(id);
                return (
                  <div className="ml-row" key={id}>
                    <span className={`ml-ic ${id}`}>
                      {id === "kakao" ? <KakaoLogo size={14} /> : <GoogleLogo size={14} />}
                    </span>
                    <span className="ml-name">{label}</span>
                    {linked && <span className="ml-on">연결됨</span>}
                    {linked ? (
                      providers.length > 1 && (
                        <button
                          className="ml-btn ghost"
                          disabled={linkBusy !== null}
                          onClick={() => void unlink(id, label)}
                        >
                          해제
                        </button>
                      )
                    ) : (
                      <button className="ml-btn" disabled={linkBusy !== null} onClick={() => void link(id)}>
                        {linkBusy === id ? "…" : "연결"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              className="menu-item"
              onClick={() => {
                onClose();
                setGuideOpen(true);
              }}
            >
              <Icon name="book" size={17} className="inline-ic" />
              사용 방법
            </button>
            <button
              className="menu-item"
              onClick={() => {
                onClose();
                setNameOpen(true);
              }}
            >
              <Icon name="user" size={17} className="inline-ic" />
              내 이름·성별 바꾸기
            </button>
            {admin && (
              <button
                className="menu-item"
                onClick={() => {
                  onClose();
                  onAdmin();
                }}
              >
                <Icon name="chart" size={17} className="inline-ic" />
                관리자 대시보드
              </button>
            )}
            <button
              className="menu-item"
              onClick={() => {
                onClose();
                void signOutUser();
              }}
            >
              <Icon name="logout" size={17} className="inline-ic" />
              로그아웃
            </button>
            {/* 정책·문의 (웹 페이지 public/privacy.html · support.html) */}
            <div className="menu-foot">
              <a href="/support">고객 지원</a>
              <a href="/privacy">개인정보처리방침</a>
            </div>
          </div>
        </>
      )}
      {nameOpen && <NameDialog initial={user?.displayName ?? ""} onClose={() => setNameOpen(false)} />}
      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
      {leaving && (
        <LeaveDialog
          onCancel={() => setLeaving(false)}
          onLeave={deleteAccount}
          apple={isNativeApp() && !!user?.providers.includes("apple")}
        />
      )}
    </>
  );
}

/** 회원 탈퇴 확인: 무엇이 지워지고 무엇이 남는지 알리고, 되돌릴 수 없어서 한 번 더 묻는다 */
function LeaveDialog({ onCancel, onLeave, apple }: { onCancel: () => void; onLeave: () => Promise<boolean>; apple: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const leave = async () => {
    setBusy(true);
    setFailed(false);
    // 성공하면 로그인 화면으로 바뀌어 이 창도 사라진다
    if (!(await onLeave())) {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div className="alert-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="alert-box leave-box" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>회원 탈퇴</h3>
        <ul>
          <li>계정과 내 기록이 지워지고 되돌릴 수 없어요.</li>
          <li>함께 친 라운드는 다른 사람을 위해 남아요.</li>
          <li>내 이름은 '탈퇴한 사용자'로 바뀌어요.</li>
          <li>방장인 라운드는 함께 친 사람에게 넘어가요.</li>
          <li>혼자 친 라운드는 지워져요.</li>
          {apple && <li>Apple 연결을 끊으려고 Apple 확인 창이 한 번 더 떠요.</li>}
        </ul>
        {failed && <div className="leave-err">탈퇴하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</div>}
        <div className="leave-actions">
          <button className="btn-ghost" disabled={busy} onClick={onCancel}>
            취소
          </button>
          <button className="btn-danger" disabled={busy} onClick={() => void leave()}>
            {busy ? "탈퇴하는 중…" : "탈퇴하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
