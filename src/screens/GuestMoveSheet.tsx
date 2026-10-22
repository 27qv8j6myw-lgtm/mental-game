import { useEffect, useMemo, useState } from "react";
import { fetchRecentUsers, moveGuest, type AdminUser, type GuestPlayer, type MoveResult } from "../admin";
import { useBack } from "../back";
import { Icon } from "../icons";

/**
 * 관리자: 게스트로 친 기록을 옮길 계정 고르기.
 * 게스트가 그 라운드에서 쓴 이름과 같은 사람을 맨 위에 둔다.
 */
export default function GuestMoveSheet({
  guest,
  onClose,
  onMoved,
}: {
  guest: GuestPlayer;
  onClose: () => void;
  onMoved: (result: MoveResult, to: AdminUser) => void;
}) {
  useBack(true, onClose);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchRecentUsers(100)
      .then(setUsers)
      .catch((e) => {
        console.error(e);
        setErr("가입자 목록을 불러오지 못했어요.");
        setUsers([]);
      });
  }, []);

  const names = guest.names.filter(Boolean);
  const guestLabel = names.join(", ") || "이름 없음";
  const label = (u: AdminUser) => u.real_name ?? (u.name || "이름 없음");
  /** 게스트가 쓴 이름과 같은 사람 */
  const same = (u: AdminUser) => names.some((n) => u.real_name === n || u.name === n);
  const list = useMemo(() => {
    if (!users) return [];
    const k = q.trim();
    const found = k ? users.filter((u) => `${u.real_name ?? ""} ${u.name}`.includes(k)) : users;
    return [...found].sort((a, b) => Number(same(b)) - Number(same(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q]);

  const pick = async (u: AdminUser) => {
    if (busy) return;
    if (
      !window.confirm(
        `게스트 '${guestLabel}'의 라운드 ${guest.rounds.length}개를 ${label(u)} 계정으로 옮길까요?\n옮긴 뒤에는 되돌릴 수 없어요.`
      )
    )
      return;
    setBusy(true);
    setErr(null);
    try {
      onMoved(await moveGuest(guest.guest_uid, u.user_id), u);
    } catch (e) {
      console.error(e);
      setErr("옮기지 못했어요. 잠시 후 다시 시도해 주세요.");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <h3>옮길 계정 고르기</h3>
          <p className="hint">
            게스트 '{guestLabel}'의 라운드 {guest.rounds.length}개를 고른 계정으로 옮겨요. 스코어·내 기록·핸디·정산이 함께
            옮겨지고, 그 계정이 이미 들어간 라운드는 건너뛰어요.
          </p>
          <input
            className="input gm-search"
            placeholder="이름·닉네임 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="sm-body">
          {users == null ? (
            <div className="empty-note">불러오는 중…</div>
          ) : list.length === 0 ? (
            <div className="empty-note">찾는 사람이 없어요.</div>
          ) : (
            <div className="card ad-list">
              {list.map((u) => (
                <button className="ad-row gm-row" key={u.user_id} disabled={busy} onClick={() => void pick(u)}>
                  <div className="ad-row-main">
                    <div className="ri-name">
                      <span className="ri-title">{u.name || "이름 없음"}</span>
                      {u.real_name && <span className="ad-real">{u.real_name}</span>}
                      {same(u) && <span className="gm-same">이름 같음</span>}
                    </div>
                    <div className="ri-sub">
                      {u.email_masked ?? "이메일 없음"} · 라운드 {u.round_count}
                    </div>
                  </div>
                  <Icon name="chevronRight" size={16} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="sm-foot">
          {err && (
            <p className="hint" style={{ color: "var(--loss)", marginBottom: 8 }}>
              {err}
            </p>
          )}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
