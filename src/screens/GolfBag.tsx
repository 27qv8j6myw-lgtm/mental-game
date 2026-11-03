import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth";
import { useBack } from "../back";
import { Icon } from "../icons";
import {
  BAG_LIMIT,
  CLUB_KINDS,
  KIND_LABEL,
  LOFT_RANGE,
  NUM_RANGE,
  SINGLE_KINDS,
  WEDGE_LABEL,
  WEDGE_TYPES,
  clubName,
  sameClub,
  sortBag,
  type Club,
  type ClubKind,
  type WedgeType,
} from "../bag";

/*
 * 내 정보 → 골프백: 라운드에 가지고 나가는 클럽 (디테일 기록에서 샷마다 고른다).
 * + 클럽 추가로 종류를 고르고 번호·로프트를 넣는다. 바꿀 때마다 바로 저장한다.
 * 14개를 넘으면 빼라고 알린다 (규칙 4.1b, 저장은 막지 않는다)
 */

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/** "10.5" → 10.5 (0.5 단위). 비었으면 undefined, 범위 밖이거나 숫자가 아니면 null */
function parseLoft(text: string): number | undefined | null {
  const t = text.replace(",", ".").trim();
  if (!t) return undefined;
  const v = Number(t);
  if (!Number.isFinite(v) || v < LOFT_RANGE[0] || v > LOFT_RANGE[1]) return null;
  return Math.round(v * 2) / 2;
}

export default function GolfBag() {
  const { user, saveBag } = useAuth();
  const [bag, setBag] = useState<Club[]>(() => user?.bag ?? []);
  const [err, setErr] = useState<string | null>(null);
  /** 열린 시트: 새로 넣기(null) 또는 고칠 클럽의 자리 */
  const [sheet, setSheet] = useState<{ edit: number | null } | null>(null);
  useBack(sheet !== null, () => setSheet(null));
  // 다른 기기에서 바꿨으면 따라간다 (저장 중이 아닐 때)
  const saved = user?.bag;
  useEffect(() => {
    if (saved) setBag(saved);
  }, [saved]);

  const commit = async (next: Club[]) => {
    const prev = bag;
    const sorted = sortBag(next);
    setBag(sorted);
    setErr(null);
    if (!(await saveBag(sorted))) {
      setBag(prev);
      setErr("저장하지 못했어요. 연결을 확인하고 다시 해 주세요.");
    }
  };

  const over = bag.length > BAG_LIMIT;

  return (
    <>
      <p className="pf-desc">
        라운드에 가지고 나가는 클럽을 넣어 두면, 디테일 기록에서 샷마다 이 클럽들 가운데 골라요.
      </p>
      {over && (
        <div className="bag-over" role="alert">
          <b>클럽이 {bag.length}개예요.</b>
          규칙상 {BAG_LIMIT}개까지만 가지고 나갈 수 있어요. {bag.length - BAG_LIMIT}개를 빼 주세요.
        </div>
      )}
      <div className="bag-count">
        <b className={over ? "over" : ""}>{bag.length}</b> / {BAG_LIMIT}개
      </div>
      <div className="card pf-group bag-list">
        {bag.length === 0 && <div className="bag-empty">아직 넣은 클럽이 없어요.</div>}
        {bag.map((c, i) => (
          <div className="bag-row" key={`${clubName(c)}-${i}`}>
            <button className="bag-name" aria-label={`${clubName(c)} 고치기`} onClick={() => setSheet({ edit: i })}>
              <b>{clubName(c, false)}</b>
              {c.loft != null && <span className="bag-loft-v">{c.loft}°</span>}
            </button>
            <button
              className="bag-del"
              aria-label={`${clubName(c)} 빼기`}
              onClick={() => void commit(bag.filter((_, j) => j !== i))}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
      <button className="bag-add" onClick={() => setSheet({ edit: null })}>
        <Icon name="plus" size={18} />
        클럽 추가
      </button>
      {err && <div className="name-err">{err}</div>}

      {sheet &&
        createPortal(
          <ClubSheet
            bag={bag}
            edit={sheet.edit}
            onClose={() => setSheet(null)}
            onSave={(clubs) => {
              const next = sheet.edit == null ? [...bag, ...clubs] : bag.map((c, i) => (i === sheet.edit ? clubs[0] : c));
              setSheet(null);
              void commit(next);
            }}
          />,
          document.body
        )}
    </>
  );
}

/** 클럽 넣기·고치기: 종류 → 번호(아이언은 여러 개) · 로프트 · 웨지 종류 */
function ClubSheet({
  bag,
  edit,
  onClose,
  onSave,
}: {
  bag: Club[];
  /** 고칠 클럽의 자리 (새로 넣으면 null) */
  edit: number | null;
  onClose: () => void;
  onSave: (clubs: Club[]) => void;
}) {
  const start = edit == null ? null : bag[edit];
  /** 하나만 넣는 클럽(드라이버·퍼터)은 이미 있으면 새로 넣을 수 없다 */
  const taken = (k: ClubKind) => SINGLE_KINDS.includes(k) && bag.some((c, i) => c.kind === k && i !== edit);
  const [kind, setKind] = useState<ClubKind>(start?.kind ?? CLUB_KINDS.find((k) => !taken(k)) ?? "wood");
  const [nums, setNums] = useState<number[]>(start?.num != null ? [start.num] : []);
  const [loftText, setLoftText] = useState(start?.loft != null ? String(start.loft) : "");
  const [wedge, setWedge] = useState<WedgeType | null>(start?.wedge ?? null);

  const pickKind = (k: ClubKind) => {
    setKind(k);
    setNums([]);
    setWedge(null);
  };
  const loft = parseLoft(loftText);
  const hasNum = kind === "wood" || kind === "hybrid" || kind === "iron";
  const numRange = hasNum ? NUM_RANGE[kind as keyof typeof NUM_RANGE] : null;
  const hasLoft = kind !== "iron" && kind !== "putter";
  // 아이언은 새로 넣을 때 번호를 여러 개 (5~9번을 한 번에)
  const multi = kind === "iron" && edit == null;

  const clubs: Club[] = hasNum
    ? nums.map((num) => ({ kind, num, ...(hasLoft && loft != null && { loft }) }))
    : [{ kind, ...(hasLoft && loft != null && { loft }), ...(kind === "wedge" && wedge && { wedge }) }];
  const others = bag.filter((_, i) => i !== edit);
  const dup = clubs.some((c) => others.some((o) => sameClub(o, c)));
  const valid =
    !taken(kind) &&
    loft !== null &&
    (!hasNum || nums.length > 0) &&
    (kind !== "wedge" || wedge != null || loft != null) &&
    !dup;

  const toggleNum = (n: number) =>
    setNums(multi ? (nums.includes(n) ? nums.filter((x) => x !== n) : [...nums, n].sort((a, b) => a - b)) : nums[0] === n ? [] : [n]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal bag-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sm-head">
          <h3>{edit == null ? "클럽 추가" : "클럽 고치기"}</h3>
        </div>
        <div className="sm-body">
          <div className="rec-label">종류</div>
          <div className="bag-kinds">
            {CLUB_KINDS.map((k) => (
              <button
                key={k}
                className={`chip ${kind === k ? "active" : ""}`}
                disabled={taken(k)}
                onClick={() => pickKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {numRange && (
            <>
              <div className="rec-label">
                번호 {multi && <small>(여러 개 고를 수 있어요)</small>}
              </div>
              <div
                className="score-grid"
                style={{ gridTemplateColumns: `repeat(${numRange[1] - numRange[0] + 1}, 1fr)` }}
              >
                {range(...numRange).map((n) => {
                  const have = others.some((o) => o.kind === kind && o.num === n && kind === "iron");
                  return (
                    <button
                      key={n}
                      className={`sbtn ${nums.includes(n) ? "active even" : ""}`}
                      disabled={have}
                      onClick={() => toggleNum(n)}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {kind === "wedge" && (
            <>
              <div className="rec-label">웨지 종류</div>
              <div className="score-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {WEDGE_TYPES.map((w) => (
                  <button
                    key={w}
                    className={`sbtn bag-wedge ${wedge === w ? "active even" : ""}`}
                    aria-label={`${w} (${WEDGE_LABEL[w]})`}
                    aria-pressed={wedge === w}
                    onClick={() => setWedge(wedge === w ? null : w)}
                  >
                    <b>{w}</b>
                    <small>{WEDGE_LABEL[w]}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {hasLoft && (
            <>
              <div className="rec-label">
                로프트 <small>{kind === "wedge" ? "(종류나 로프트 하나만 넣어도 돼요)" : "(비워 둬도 돼요)"}</small>
              </div>
              <div className="bag-loft">
                <input
                  className="input"
                  value={loftText}
                  inputMode="decimal"
                  placeholder={kind === "driver" ? "10.5" : kind === "wedge" ? "56" : kind === "wood" ? "15" : "22"}
                  onChange={(e) => setLoftText(e.target.value)}
                />
                <span>°</span>
              </div>
              {loft === null && (
                <div className="name-err">
                  로프트는 {LOFT_RANGE[0]}~{LOFT_RANGE[1]}° 숫자로 넣어 주세요.
                </div>
              )}
            </>
          )}

          {kind === "putter" && <p className="pf-desc bag-note">퍼터는 고를 게 없어요.</p>}
          {dup && <div className="name-err">이미 넣은 클럽이에요.</div>}
        </div>
        <div className="sm-foot">
          <div className="modal-actions">
            <button className="btn-ghost" onClick={onClose}>
              취소
            </button>
            <button className="btn-primary" disabled={!valid} onClick={() => onSave(clubs)}>
              {edit == null ? (clubs.length > 1 ? `${clubs.length}개 넣기` : "넣기") : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
