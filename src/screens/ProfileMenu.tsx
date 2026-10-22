import { useEffect, useState } from "react";
import { useAuth, type OAuthProvider } from "../auth";
import { useBack } from "../back";
import { GoogleLogo, Icon, KakaoLogo } from "../icons";
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
  const { user, signOutUser, linkProvider, unlinkProvider } = useAuth();
  // 기기 뒤로가기: 메뉴 닫기
  useBack(open, onClose);
  const [linkBusy, setLinkBusy] = useState<OAuthProvider | null>(null);
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
  const providers = user?.providers ?? [];

  const link = async (p: OAuthProvider) => {
    setLinkBusy(p);
    await linkProvider(p);
    setLinkBusy(null);
  };

  const unlink = async (p: OAuthProvider, label: string) => {
    if (
      !window.confirm(
        `${label} 연결을 해제할까요? 해제하면 ${label}로는 이 계정에 로그인할 수 없어요.`
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
              <div className="mn">{user?.displayName ?? "사용자"}</div>
              <div className="me">{user?.email}</div>
            </div>
            <div className="menu-links">
              <div className="ml-title">로그인 계정 연결</div>
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
          </div>
        </>
      )}
      {nameOpen && <NameDialog initial={user?.displayName ?? ""} onClose={() => setNameOpen(false)} />}
      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
    </>
  );
}
