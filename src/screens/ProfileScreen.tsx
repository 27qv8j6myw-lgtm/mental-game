import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth, type LinkProvider, type OAuthProvider } from "../auth";
import { isNativeApp } from "../native";
import { useBack } from "../back";
import { AppleLogo, Avatar, GoogleLogo, Icon, KakaoLogo } from "../icons";
import { isAdmin } from "../admin";
import { useUnfolded } from "../rail";
import NameDialog from "./NameDialog";
import Guide from "../guide/Guide";
import Rules from "../rules/Rules";
import TopBar, { BackButton, NoticeButton } from "./TopBar";
import Dash from "./Dash";
import SeasonGoals from "./SeasonGoals";
import Badges from "./Badges";
import { BADGES, useBadgeCount } from "../badges";
import { goalSummary, hasGoal } from "../goals";
import type { NoticePage } from "../notices";

const LINKABLE: { id: OAuthProvider; label: string }[] = [
  { id: "kakao", label: "카카오" },
  { id: "google", label: "Google" },
];
const PROVIDER_LABEL: Record<string, string> = { kakao: "카카오", google: "Google", apple: "Apple" };

/** 한 단계 들어가는 페이지 (펼친 iPhone Duo 에서는 오른쪽 칸) */
type Sub = "accounts" | NoticePage;
const SUB_TITLE: Record<Sub, string> = { accounts: "로그인 계정 연결", goals: "시즌 목표", badges: "배지" };

/**
 * 내 정보 (인스타그램 '설정 및 활동'처럼): 아래 탭 오른쪽 내 사진을 누르면 열리는 페이지.
 * 맨 위 내 프로필, 아래로 계정 · 도움말 · 관리 묶음. 줄을 누르면 한 단계 들어가거나(로그인 계정 연결) 그 화면을 연다.
 * 펼친 iPhone Duo: 왼쪽 칸 목록 · 오른쪽 칸 고른 페이지
 */
export default function ProfileScreen({
  onClose,
  onAdmin,
  onRankingManage,
  initialSub = null,
}: {
  onClose: () => void;
  onAdmin: () => void;
  /** 랭킹 공개 범위 (랭킹 관리 화면) */
  onRankingManage: () => void;
  /** 종 알림에서 바로 연 페이지 */
  initialSub?: Sub | null;
}) {
  const { user, signOutUser, deleteAccount } = useAuth();
  const split = useUnfolded();
  const [sub, setSubState] = useState<Sub | null>(initialSub);
  const setSub = (s: Sub | null) => {
    setSubState(s);
    window.scrollTo(0, 0);
  };
  // 펼친 화면은 오른쪽 칸에 늘 하나를 보여 준다
  const shown: Sub | null = sub ?? (split ? "goals" : null);
  // 기기 뒤로가기: 들어간 페이지 → 목록 (목록 → 홈은 App)
  useBack(!split && sub !== null, () => setSub(null));

  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void isAdmin().then(setAdmin);
  }, []);
  /** 내 이름 바꾸기 */
  const [nameOpen, setNameOpen] = useState(false);
  useBack(nameOpen, () => setNameOpen(false));
  /** 사용 방법·골프 룰 (뒤로가기는 그 화면이 받는다) */
  const [guideOpen, setGuideOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  /** 회원 탈퇴 확인 */
  const [leaving, setLeaving] = useState(false);
  useBack(leaving, () => setLeaving(false));

  const providers = user?.providers ?? [];
  const login = providers.map((p) => PROVIDER_LABEL[p]).filter(Boolean).join(" · ");

  /** 웹 링크 보내기: 안드로이드는 앱이 없어서 이 웹 주소로 쓴다. 공유 창이 없으면(PC 등) 복사 */
  const [copied, setCopied] = useState(false);
  const shareWeb = async () => {
    const url = window.location.origin;
    const text = "멘탈게임: 골프 스코어만 넣으면 정산까지 자동으로 계산해 줘요.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "멘탈게임", text, url });
        return;
      }
    } catch (e) {
      // 공유 창에서 취소했으면 그대로 끝
      if ((e as { name?: string } | null)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const head = (
    <div className="card pf-head">
      <Avatar photoUrl={user?.photoURL} fallback="user" size={64} />
      <div className="pf-who">
        <b>{user?.displayName ?? "사용자"}</b>
        {login && <span>{login} 로그인</span>}
        {user?.email && <span className="pf-mail">{user.email}</span>}
      </div>
      <button className="pf-edit" onClick={() => setNameOpen(true)}>
        이름 바꾸기
      </button>
    </div>
  );

  const goal = hasGoal(user?.goal) ? user?.goal : null;
  const badgeCount = useBadgeCount(user?.uid ?? "");
  const list = (
    <>
      <div className="section-title">내 활동</div>
      <div className="card pf-group">
        <Row
          icon="target"
          label="시즌 목표"
          value={goal ? goalSummary(goal) : "정하기"}
          on={split && shown === "goals"}
          onClick={() => setSub("goals")}
        />
        <Row
          icon="medal"
          label="배지"
          value={badgeCount != null ? `${badgeCount}/${BADGES.length}` : undefined}
          on={split && shown === "badges"}
          onClick={() => setSub("badges")}
        />
      </div>

      <div className="section-title">계정</div>
      <div className="card pf-group">
        <Row
          icon="link"
          label="로그인 계정 연결"
          value={<ProviderDots providers={providers} />}
          on={split && shown === "accounts"}
          onClick={() => setSub("accounts")}
        />
        <Row icon="medal" label="랭킹 공개 범위" onClick={onRankingManage} />
      </div>

      <div className="section-title">친구에게 알리기</div>
      <div className="card pf-group">
        <Row icon="share" label="웹 링크 보내기" value={copied ? "복사됨!" : undefined} onClick={() => void shareWeb()} />
      </div>

      <div className="section-title">도움말</div>
      <div className="card pf-group">
        <Row icon="book" label="사용 방법" onClick={() => setGuideOpen(true)} />
        <Row icon="flag" label="골프 룰" onClick={() => setRulesOpen(true)} />
        {/* 정책·문의 (웹 페이지 public/support.html · privacy.html) */}
        <Row icon="help" label="고객 지원" href="/support" />
        <Row icon="shield" label="개인정보처리방침" href="/privacy" />
      </div>

      {admin && (
        <>
          <div className="section-title">관리</div>
          <div className="card pf-group">
            <Row icon="chart" label="관리자 대시보드" onClick={onAdmin} />
          </div>
        </>
      )}

      <div className="card pf-group">
        <Row icon="logout" label="로그아웃" onClick={() => void signOutUser()} plain />
      </div>
      {/* 회원 탈퇴: 맨 아래 작고 옅게 */}
      <button className="pf-leave" onClick={() => setLeaving(true)}>
        회원 탈퇴
      </button>
    </>
  );

  const detail =
    shown === "accounts" ? <Accounts /> : shown === "goals" ? <SeasonGoals /> : shown === "badges" ? <Badges /> : null;

  return (
    <div className="app">
      <TopBar
        tab={split || !sub}
        left={<BackButton onClick={() => (!split && sub ? setSub(null) : onClose())} />}
        right={<NoticeButton />}
      />

      {split ? (
        // 펼친 화면 대시보드: 왼쪽 줄 내 정보·메뉴, 오른쪽 줄 고른 페이지 (시즌 목표 · 배지 · 계정 연결)
        <Dash
          title="내 정보"
          sub={shown ? SUB_TITLE[shown] : undefined}
          side={
            <>
              {head}
              <div>{list}</div>
            </>
          }
        >
          {detail}
        </Dash>
      ) : sub ? (
        <div className="sheet">
          <h2 className="page-title">{SUB_TITLE[sub]}</h2>
          {detail}
        </div>
      ) : (
        <div className="sheet">
          <h2 className="page-title">내 정보</h2>
          {head}
          {list}
        </div>
      )}

      {nameOpen && <NameDialog initial={user?.displayName ?? ""} onClose={() => setNameOpen(false)} />}
      {guideOpen && <Guide onClose={() => setGuideOpen(false)} />}
      {rulesOpen && createPortal(<Rules onClose={() => setRulesOpen(false)} />, document.body)}
      {leaving && (
        <LeaveDialog
          onCancel={() => setLeaving(false)}
          onLeave={deleteAccount}
          apple={isNativeApp() && providers.includes("apple")}
        />
      )}
    </div>
  );
}

/** 목록 한 줄: 아이콘 · 이름 · (값) · 오른쪽 화살표. href 면 웹 페이지로 */
function Row({
  icon,
  label,
  value,
  on = false,
  plain = false,
  onClick,
  href,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  value?: ReactNode;
  /** 펼친 화면에서 오른쪽 칸에 보이는 줄 */
  on?: boolean;
  /** 화살표 없이 (로그아웃) */
  plain?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <span className="pf-ic">
        <Icon name={icon} size={20} />
      </span>
      <span className="pf-label">{label}</span>
      {value && <span className="pf-value">{value}</span>}
      {!plain && <Icon name="chevronRight" size={18} className="pf-go" />}
    </>
  );
  return href ? (
    <a className="pf-row" href={href}>
      {body}
    </a>
  ) : (
    <button className={`pf-row ${on ? "on" : ""}`} onClick={onClick}>
      {body}
    </button>
  );
}

/** 연결한 로그인 계정 작은 로고들 */
function ProviderDots({ providers }: { providers: string[] }) {
  return (
    <span className="pf-dots">
      {providers.includes("kakao") && (
        <span className="ml-ic kakao">
          <KakaoLogo size={12} />
        </span>
      )}
      {providers.includes("google") && (
        <span className="ml-ic google">
          <GoogleLogo size={12} />
        </span>
      )}
      {providers.includes("apple") && (
        <span className="ml-ic apple">
          <AppleLogo size={11} />
        </span>
      )}
    </span>
  );
}

/** 로그인 계정 연결: 카카오·Google·Apple 연결·해제 (하나는 남겨야 한다) */
function Accounts() {
  const { user, linkProvider, linkApple, unlinkProvider } = useAuth();
  const [linkBusy, setLinkBusy] = useState<LinkProvider | null>(null);
  // Apple 은 아이폰의 Apple 로그인 창으로 연결해서 iOS 앱에서만 연결할 수 있다 (해제는 어디서나)
  const [native] = useState(() => isNativeApp());
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
    if (!window.confirm(`${label} 연결을 해제할까요?\n해제하면 ${label}로 로그인할 수 없어요.`)) return;
    setLinkBusy(p);
    await unlinkProvider(p);
    setLinkBusy(null);
  };

  const row = (id: LinkProvider, label: string, logo: ReactNode, onLink: () => void) => {
    const linked = providers.includes(id);
    return (
      <div className="ml-row pf-acct" key={id}>
        <span className={`ml-ic ${id}`}>{logo}</span>
        <span className="ml-name">{label}</span>
        {linked && <span className="ml-on">연결됨</span>}
        {linked ? (
          providers.length > 1 && (
            <button className="ml-btn ghost" disabled={linkBusy !== null} onClick={() => void unlink(id, label)}>
              해제
            </button>
          )
        ) : (
          <button className="ml-btn" disabled={linkBusy !== null} onClick={onLink}>
            {linkBusy === id ? "…" : "연결"}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <p className="pf-desc">연결한 계정 어느 것으로 로그인해도 같은 기록이 보여요. 하나는 남겨 둬야 해요.</p>
      <div className="card pf-group">
        {/* Apple: 연결은 iOS 앱에서만 (웹에서는 연결돼 있을 때만 보이고 해제할 수 있다) */}
        {(native || providers.includes("apple")) && row("apple", "Apple", <AppleLogo size={13} />, () => void connectApple())}
        {LINKABLE.map(({ id, label }) =>
          row(id, label, id === "kakao" ? <KakaoLogo size={14} /> : <GoogleLogo size={14} />, () => void link(id))
        )}
      </div>
      {!native && !providers.includes("apple") && (
        <p className="pf-desc">Apple 계정은 아이폰 앱에서 연결할 수 있어요.</p>
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
