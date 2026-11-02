import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import { Icon } from "../icons";
import type { LocalRule } from "../types";

/*
 * 로컬룰: 방장이 라운드를 만들 때(대기실 '수정'에서도) 자주 쓰는 룰을 체크하고 설정(컨시드 길이·멀리건 개수 등)을
 * 고른다. 목록에 없는 룰은 직접 써서 더한다. 점수 계산에는 쓰지 않고 보여 주기만 한다
 * (대기실 카드 아래 · 결과 화면 시상식 위 '로컬룰 확인하기'). 꼭 따라야 하는 룰은 아니라고 함께 적는다.
 * rules.localRules 에 설정한 문구를 그대로 저장한다 (앱 목록 글이 바뀌어도 그 라운드의 룰은 그대로)
 */

type Opt = Record<string, string | number | boolean>;

interface Preset {
  id: string;
  title: string;
  /** 체크했을 때 처음 설정 */
  init?: Opt;
  /** 설정 → 보여 줄 문구 (없으면 제목만) */
  text: (o: Opt) => string;
  /** 체크하면 아래에 펼치는 설정 칸 */
  options?: (o: Opt, set: (patch: Opt) => void) => ReactNode;
}

const num = (o: Opt, k: string) => Number(o[k] ?? 0);

/** 컨시드: 길이 + 버디 퍼트는 컨시드 없음 */
function concedeText(o: Opt): string {
  const len = o.len === "below" ? "퍼터 그립 아래 (그립 뺀 길이)" : "퍼터 그립까지 (퍼터 전체 길이)";
  return [len, o.noBirdie && "버디 퍼트는 컨시드 없음"].filter(Boolean).join("\n");
}

/** 멀리건: 없음, 또는 전반·후반을 넣으면 각각 · 전체만 넣으면 전체만 */
function mulliganText(o: Opt): string {
  if (o.none) return "없음";
  const [f, b, t] = [num(o, "front"), num(o, "back"), num(o, "total")];
  if (f || b) return [f && `전반 ${f}개`, b && `후반 ${b}개`].filter(Boolean).join(" · ");
  return `전체 ${t}개`;
}

/** 화이트티 기준 지점 가이드 (m) */
const WHITE_GUIDE = { men: 200, women: 250 };

/** 특설티가 없을 때: 다음 샷 지점 (N번째 선상 · 화이트티 기준 거리 중 하나) + 워터해저드 */
function noTeeText(o: Opt): string {
  const lines = [
    o.spot === "white"
      ? `화이트티 기준 남성 ${num(o, "men") || WHITE_GUIDE.men}m / 여성 ${num(o, "women") || WHITE_GUIDE.women}m 지점 이용`
      : `${num(o, "nth") <= 1 ? "가장" : `${num(o, "nth")}번째로`} 멀리 친 사람과 동일 선상에서 플레이`,
  ];
  if (o.water) lines.push("워터해저드에 빠졌을 경우 넘어가서 드롭 가능");
  return lines.length > 1 ? lines.map((l) => `· ${l}`).join("\n") : lines[0];
}

/** 자주 쓰는 로컬룰 */
export const LOCAL_RULE_PRESETS: Preset[] = [
  {
    id: "concede",
    title: "컨시드 (OK)",
    init: { len: "to", noBirdie: true },
    text: concedeText,
    options: (o, set) => (
      <>
        <div className="segmented lr-seg">
          <button type="button" className={o.len === "below" ? "active" : ""} onClick={() => set({ len: "below" })}>
            퍼터 그립 아래
          </button>
          <button type="button" className={o.len !== "below" ? "active" : ""} onClick={() => set({ len: "to" })}>
            퍼터 그립까지
          </button>
        </div>
        <div className="lr-subs lr-gap">
          <SubCheck on={!!o.noBirdie} onClick={() => set({ noBirdie: !o.noBirdie })}>
            버디 퍼트는 컨시드 없음
          </SubCheck>
        </div>
      </>
    ),
  },
  {
    id: "mulligan",
    title: "멀리건",
    init: { none: true, front: 1, back: 1, total: 0 },
    text: mulliganText,
    options: (o, set) => (
      <>
        <div className="segmented lr-seg">
          <button type="button" className={o.none ? "active" : ""} onClick={() => set({ none: true })}>
            없음
          </button>
          <button type="button" className={!o.none ? "active" : ""} onClick={() => set({ none: false })}>
            있음
          </button>
        </div>
        {!o.none && <MulliganFields o={o} set={set} />}
      </>
    ),
  },
  {
    id: "no-tee",
    title: "특설티가 없을 때",
    init: { spot: "nth", nth: 2, men: WHITE_GUIDE.men, women: WHITE_GUIDE.women, water: false },
    text: noTeeText,
    options: (o, set) => <NoTeeFields o={o} set={set} />,
  },
  {
    id: "lost-ball",
    title: "로스트 볼 (공을 못 찾은 경우)",
    init: { how: "ob" },
    text: (o) => (o.how === "line" ? "1벌타 후 공이 사라진 지점 선상에서 플레이" : "OB와 동일하게 처리"),
    options: (o, set) => (
      <div className="lr-choices">
        {(
          [
            ["ob", "OB와 동일하게 처리"],
            ["line", "1벌타 후 공이 사라진 지점 선상에서 플레이"],
          ] as const
        ).map(([k, label]) => (
          <button
            type="button"
            key={k}
            className={`lr-choice ${(o.how ?? "ob") === k ? "on" : ""}`}
            onClick={() => set({ how: k })}
          >
            <span className="lr-radio" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    ),
  },
  { id: "divot", title: "디봇 구제", text: () => "페어웨이 디봇에 들어가면 후방 드롭 가능" },
  { id: "bunker", title: "벙커 발자국 구제", text: () => "벙커 발자국에 들어가면 벙커 정리 후 리플레이스 가능" },
  { id: "preferred", title: "프리퍼드 라이", text: () => "페어웨이에서는 공을 집어서 닦고 플레이 가능 (러프는 불가)" },
  {
    id: "injury",
    title: "부상 위험 방지",
    text: () => "부상 위험이 있는 돌, 나무뿌리, 젖거나 얼어 있는 벙커는 후방 드롭하여 플레이",
  },
  // 앱도 늘 더블파에서 막는다 (model.ts)
  {
    id: "max-score",
    title: "맥시멈스코어",
    text: () => "스코어는 더블파(양파)까지 반영",
  },
];

/** 저장할 한 줄: 설정한 문구 + 다시 고칠 설정값 */
function build(p: Preset, o: Opt): LocalRule {
  const desc = p.text(o);
  return { id: p.id, title: p.title, ...(desc && { desc }), ...(p.init && { opt: o }) };
}

/** 목록·기본 체크가 바뀌면 올린다: 지난번 체크 기억(만들기 화면)을 한 번 새 기본값으로 바꾼다 */
export const LOCAL_RULES_VERSION = 2;

/** 처음부터 체크해 두는 룰 (처음 설정 그대로: 컨시드 퍼터 그립까지 · 버디 퍼트는 컨시드 없음, 멀리건 없음) */
const DEFAULT_IDS = ["concede", "mulligan", "divot", "bunker", "max-score"];
export function defaultLocalRules(): LocalRule[] {
  return LOCAL_RULE_PRESETS.filter((p) => DEFAULT_IDS.includes(p.id)).map((p) => build(p, { ...p.init }));
}

/** 꼭 따라야 하는 룰은 아니라는 안내 (만들기 화면 · 확인 팝업) */
const OPTIONAL_NOTE = "로컬룰을 적용하더라도 원래 골프 룰대로 플레이해도 괜찮아요. 필수로 적용하는 룰은 아니에요.";

/** 작은 −/＋ 칸 */
function Count({
  label,
  row,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  /** 이름을 왼쪽에 (기본은 위에) */
  row?: boolean;
  value: number;
  /** 이보다 줄일 수 없을 때 (다른 칸이 모두 0 이면 1) */
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`lr-count-field ${row ? "row" : ""}`}>
      <span className="lr-count-label">{label}</span>
      <div className="stepper lr-stepper">
        <button type="button" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span className="hval">{value}</span>
        <button type="button" aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          ＋
        </button>
      </div>
    </div>
  );
}

/** 멀리건 개수: 전반·후반과 전체는 함께 쓰지 않는다 (전체를 넣으면 전반·후반은 0, 반대도 같다). 모두 0 은 안 된다 */
function MulliganFields({ o, set }: { o: Opt; set: (patch: Opt) => void }) {
  const [f, b, t] = [num(o, "front"), num(o, "back"), num(o, "total")];
  const half = (k: "front" | "back", v: number) => set(v > 0 ? { [k]: v, total: 0 } : { [k]: v });
  return (
    <>
      <div className="lr-counts lr-gap">
        <Count label="전반" value={f} min={b || t ? 0 : 1} max={9} onChange={(v) => half("front", v)} />
        <Count label="후반" value={b} min={f || t ? 0 : 1} max={9} onChange={(v) => half("back", v)} />
        <Count
          label="전체"
          value={t}
          min={f || b ? 0 : 1}
          max={9}
          onChange={(v) => set(v > 0 ? { total: v, front: 0, back: 0 } : { total: v })}
        />
      </div>
      <p className="lr-opt-hint">전반·후반을 넣으면 각각, 전체만 넣으면 전체로 보여요.</p>
    </>
  );
}

/** 체크 안의 작은 체크 (중복 선택) */
function SubCheck({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`lr-sub ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick}>
      <span className="lr-check sm" aria-hidden />
      <span>{children}</span>
    </button>
  );
}

/** 체크 안의 하나만 고르기 */
function SubRadio({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`lr-sub ${on ? "on" : ""}`} onClick={onClick}>
      <span className="lr-radio" aria-hidden />
      <span>{children}</span>
    </button>
  );
}

/** 화이트티 기준 거리 (m) */
function Meters({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="lr-m">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        inputMode="numeric"
        min={50}
        max={400}
        value={value || ""}
        onChange={(e) => onChange(Math.min(400, Math.max(0, Math.round(Number(e.target.value) || 0))))}
      />
      <span>m</span>
    </label>
  );
}

/** 특설티가 없을 때: 다음 샷 지점은 'N번째로 멀리 친 사람 선상'과 '화이트티 기준 거리' 중 하나만, 워터해저드 넘어가서 드롭은 따로 */
function NoTeeFields({ o, set }: { o: Opt; set: (patch: Opt) => void }) {
  const nth = num(o, "nth") || 2;
  const white = o.spot === "white";
  return (
    <div className="lr-subs">
      <div role="radiogroup" className="lr-subs">
        <SubRadio on={!white} onClick={() => set({ spot: "nth" })}>
          N번째로 멀리 친 사람과 동일 선상에서 플레이
        </SubRadio>
        {!white && (
          <div className="lr-line-opts">
            <Count label="몇 번째로 멀리 친 사람" row value={nth} min={1} max={5} onChange={(v) => set({ nth: v })} />
          </div>
        )}
        <SubRadio on={white} onClick={() => set({ spot: "white" })}>
          화이트티 기준 남성·여성 지점 이용
        </SubRadio>
        {white && (
          <div className="lr-line-opts">
            <div className="lr-ms">
              <Meters label="남성" value={num(o, "men")} onChange={(v) => set({ men: v })} />
              <Meters label="여성" value={num(o, "women")} onChange={(v) => set({ women: v })} />
            </div>
            <p className="lr-opt-hint">
              가이드: 남성 {WHITE_GUIDE.men}m, 여성 {WHITE_GUIDE.women}m
            </p>
          </div>
        )}
      </div>
      <SubCheck on={!!o.water} onClick={() => set({ water: !o.water })}>
        워터해저드에 빠졌을 경우 넘어가서 드롭 가능
      </SubCheck>
    </div>
  );
}

/** 내가 직접 쓴 룰 (다음 라운드 목록에도 체크 안 된 줄로 남는다) */
const MINE_KEY = "mentalgame-local-rules-mine";
const MINE_MAX = 10;
const TITLE_MAX = 40;

function readMine(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE_KEY) ?? "null") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeMine(list: string[]) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list));
  } catch {
    /* 저장소를 쓸 수 없으면 이번 라운드에만 */
  }
}

/** 줄 구분: 앱 목록 룰은 id, 직접 쓴 룰은 글자 */
const keyOf = (r: LocalRule) => r.id ?? `t:${r.title}`;
const isPreset = (r: LocalRule) => !!r.id && LOCAL_RULE_PRESETS.some((p) => p.id === r.id);

/** 로컬룰 체크 목록 (라운드 만들기 · 대기실 수정 시트) */
export function LocalRulesField({ value, onChange }: { value: LocalRule[]; onChange: (v: LocalRule[]) => void }) {
  const [mine, setMine] = useState(readMine);
  // 고칠 때: 앱 목록에도 내 목록에도 없는 룰 (다른 폰에서 쓴 룰 · 예전 글). 껐다가 다시 켤 수 있게 처음 것을 둔다
  const [others] = useState(() => value.filter((r) => !isPreset(r) && !(!r.id && readMine().includes(r.title))));
  /** 체크를 껐다 켜도 고른 설정이 남게 */
  const [drafts, setDrafts] = useState<Record<string, Opt>>({});
  /** 설정 칸을 펼친 룰 (체크하면 열리고 '완료'로 닫으면 설정한 문구만 남는다). 한 번에 하나 */
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onKeys = new Set(value.map(keyOf));
  const optOf = (p: Preset): Opt => ({ ...p.init, ...(drafts[p.id] ?? value.find((r) => r.id === p.id)?.opt) });

  /** 목록 순서대로 저장 (앱 목록 → 내가 쓴 룰 → 그 밖의 룰) */
  const emitTo = (on: Set<string>, opts: Record<string, Opt>, mineList: string[], to: (v: LocalRule[]) => void) => {
    const out: LocalRule[] = [];
    for (const p of LOCAL_RULE_PRESETS) if (on.has(p.id)) out.push(build(p, opts[p.id] ?? optOf(p)));
    for (const t of mineList) if (on.has(`t:${t}`)) out.push({ title: t });
    for (const r of others) if (on.has(keyOf(r))) out.push(r);
    to(out);
  };
  const emit = (on: Set<string>, opts: Record<string, Opt> = {}, mineList = mine) => emitTo(on, opts, mineList, onChange);
  // 열 때 한 번: 앱 목록 룰은 지금 문구로 맞춘다 (보이는 문구 = 저장되는 문구. 예전 라운드·지난 설정의 옛 글)
  useEffect(() => {
    const out: LocalRule[] = [];
    emitTo(onKeys, {}, mine, (v) => out.push(...v));
    if (JSON.stringify(out) !== JSON.stringify(value)) onChange(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key: string) => {
    const on = new Set(onKeys);
    if (on.has(key)) on.delete(key);
    else on.add(key);
    // 고를 게 있는 룰은 체크하면 설정 칸을 연다
    setOpenId(on.has(key) && LOCAL_RULE_PRESETS.some((p) => p.id === key && p.options) ? key : null);
    emit(on);
  };
  const setOpt = (p: Preset, patch: Opt) => {
    const o = { ...optOf(p), ...patch };
    setDrafts((d) => ({ ...d, [p.id]: o }));
    emit(onKeys, { [p.id]: o });
  };
  const add = () => {
    const title = draft.trim().replace(/\s+/g, " ");
    if (!title) return;
    if (LOCAL_RULE_PRESETS.some((p) => p.title === title) || mine.includes(title) || others.some((r) => r.title === title)) {
      setErr("이미 목록에 있는 룰이에요.");
      return;
    }
    if (mine.length >= MINE_MAX) {
      setErr(`직접 쓴 룰은 ${MINE_MAX}개까지예요. 안 쓰는 룰을 ×로 지워 주세요.`);
      return;
    }
    const next = [...mine, title];
    setMine(next);
    writeMine(next);
    setDraft("");
    setErr(null);
    // 추가한 룰은 바로 체크
    emit(new Set([...onKeys, `t:${title}`]), {}, next);
  };
  const remove = (title: string) => {
    const next = mine.filter((t) => t !== title);
    setMine(next);
    writeMine(next);
    const on = new Set(onKeys);
    on.delete(`t:${title}`);
    emit(on, {}, next);
  };

  const row = (key: string, title: string, desc: string, extra?: { options?: ReactNode; mine?: boolean }) => {
    const on = onKeys.has(key);
    const open = on && !!extra?.options && openId === key;
    return (
      <div className={`lr-row ${on ? "on" : ""}`} key={key}>
        <div className="lr-main">
          <button type="button" className="lr-pick" aria-pressed={on} onClick={() => toggle(key)}>
            <span className="lr-check" aria-hidden />
            <span className="lr-text">
              <span className="t">{title}</span>
              {desc && <span className="s">{desc}</span>}
            </span>
          </button>
          {on && extra?.options && !open && (
            <button type="button" className="lr-edit" onClick={() => setOpenId(key)}>
              변경
            </button>
          )}
          {extra?.mine && (
            <button type="button" className="lr-del" aria-label={`${title} 지우기`} onClick={() => remove(title)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
        {open && (
          <div className="lr-opts">
            {extra.options}
            <button type="button" className="lr-done" onClick={() => setOpenId(null)}>
              완료
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card lr-card">
      <div className="lr-notice">{OPTIONAL_NOTE}</div>
      <div className="lr-note-row">
        <p className="lr-note">체크한 룰만 참여자에게 보여요. 점수 계산은 입력한 타수 그대로예요.</p>
        <button
          type="button"
          className="lr-reset"
          onClick={() => {
            setDrafts({});
            setOpenId(null);
            onChange(defaultLocalRules());
          }}
        >
          기본값으로
        </button>
      </div>
      {LOCAL_RULE_PRESETS.map((p) => {
        const o = optOf(p);
        return row(p.id, p.title, p.text(o), { options: p.options?.(o, (patch) => setOpt(p, patch)) });
      })}
      {mine.map((t) => row(`t:${t}`, t, "", { mine: true }))}
      {others.map((r) => row(keyOf(r), r.title, r.desc ?? ""))}
      <div className="lr-add">
        <input
          className="input"
          value={draft}
          maxLength={TITLE_MAX}
          placeholder="직접 추가 (예: 그린 밖 퍼터는 OK 없음)"
          enterKeyHint="done"
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="lr-add-btn" disabled={!draft.trim()} onClick={add}>
          추가
        </button>
      </div>
      {err && <p className="hint lr-err">{err}</p>}
    </div>
  );
}

/**
 * 대기실 카드 아래 · 결과 화면 시상식 위: 가로로 긴 '로컬룰 확인하기'.
 * 로컬룰을 정하지 않은 라운드는 헷갈리지 않게 버튼을 아예 그리지 않는다
 */
export function LocalRulesButton({ rules }: { rules: { localRules?: LocalRule[] } }) {
  const [open, setOpen] = useState(false);
  const list = rules.localRules ?? [];
  if (!list.length) return null;
  return (
    <>
      <button className="btn-line wide lr-btn" onClick={() => setOpen(true)}>
        <Icon name="book" size={16} />
        로컬룰 확인하기
        <span className="lr-count">{list.length}개</span>
      </button>
      {open && <LocalRulesSheet list={list} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 로컬룰 목록 팝업. 확인·바깥·뒤로가기로 닫는다 */
function LocalRulesSheet({ list, onClose }: { list: LocalRule[]; onClose: () => void }) {
  useBack(true, onClose);
  return createPortal(
    <div className="alert-backdrop lr-backdrop" onClick={onClose}>
      <div className="alert-box lr-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="lr-head">
          <b>로컬룰</b>
          <span>{list.length}개</span>
        </div>
        <div className="lr-sub-title">방장이 정한 룰이에요. 점수 계산은 입력한 타수 그대로예요.</div>
        <ol className="lr-list">
          {list.map((r, i) => (
            <li key={i}>
              <b>{r.title}</b>
              {r.desc && <span>{r.desc}</span>}
            </li>
          ))}
        </ol>
        <div className="lr-notice">{OPTIONAL_NOTE}</div>
        <button className="btn-primary" onClick={onClose}>
          확인
        </button>
      </div>
    </div>,
    document.body
  );
}
