import { useEffect, useRef, useState } from "react";
import type { Fairway, TeeBox } from "../types";
import { localDate, TEE_BOXES } from "../util";
import { useAuth } from "../auth";
import { Icon } from "../icons";
import TopBar, { BackButton } from "./TopBar";
import { importRecordRound } from "../rounds";
import {
  clubPart,
  courseRating,
  exactClub,
  findCourse,
  loadKga,
  matchTee,
  ratingFor,
  searchClubs,
  teeBoxFromName,
  teeSex,
  type KgaClub,
  type KgaData,
} from "../kga";
import {
  girOff,
  prepareImage,
  readScorecard,
  sumChecks,
  toDraft,
  type Draft,
  type DraftHole,
} from "../scorecard";

/** 티샷 칸을 누를 때마다: 없음 → 적중 → 훅 → 슬라이스 → 짧음 → 없음 */
const FAIRWAY_CYCLE: (Fairway | null)[] = [null, "hit", "left", "right", "short"];
const FAIRWAY_ICON: Record<Fairway, "ring" | "hook" | "slice" | "short"> = {
  hit: "ring",
  left: "hook",
  right: "slice",
  short: "short",
};
const FAIRWAY_LABEL: Record<Fairway, string> = { hit: "적중", left: "훅", right: "슬라이스", short: "짧음" };

/** 숫자 칸: 비우면 null, 범위를 넘으면 끝값 */
const numOrNull = (v: string, lo: number, hi: number) => {
  if (v.trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

type Step = "pick" | "reading" | "edit";

/**
 * 스코어카드 사진으로 기록 추가: 사진 고르기 → 읽기 → 확인·수정 → 끝난 기록 라운드로 저장.
 * 사진 속 합계·그린적중 표시와 맞지 않는 칸은 빨갛게 표시한다
 */
export default function ScorecardImportScreen({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [img, setImg] = useState<{ data: string; mediaType: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  // 라운드 정보
  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [tee, setTee] = useState<TeeBox>("white");
  const [kga, setKga] = useState<KgaData | null>(null);
  const [club, setClub] = useState<KgaClub | null>(null);
  const [courseIdx, setCourseIdx] = useState(-1);
  useEffect(() => {
    loadKga()
      .then(setKga)
      .catch((e) => console.error("코스레이팅 불러오기 실패", e));
  }, []);
  // 고른 사진 미리보기 주소는 화면을 나갈 때 푼다
  useEffect(() => () => void (img && URL.revokeObjectURL(img.url)), [img]);

  const pickClub = (c: KgaClub | null, name?: string) => {
    setClub(c);
    setCourseIdx(c && c.courses.length === 1 ? 0 : -1);
    if (name !== undefined) setCourseName(name);
  };
  const onCourseName = (v: string) => {
    setCourseName(v);
    const same = kga ? exactClub(kga, v) : null;
    if (same?.name !== club?.name) pickClub(same);
  };
  const suggestions = kga && !club && courseName.trim() ? searchClubs(kga, courseName, 4) : [];
  const course = club && courseIdx >= 0 ? club.courses[courseIdx] : null;
  const ratingTee = course ? matchTee(course, tee) : null;
  const rating = kga && club && course && ratingTee ? courseRating(kga, club, course, ratingTee) : null;
  // 레드 티면 여성 레이팅
  const ratingM = ratingFor(rating, teeSex(tee));

  const read = async (picked: { data: string; mediaType: string }) => {
    setStep("reading");
    setErr(null);
    try {
      const card = await readScorecard(picked);
      const d = toDraft(card);
      setDraft(d);
      if (card.date && /^\d{4}-\d{2}-\d{2}$/.test(card.date)) setDate(card.date);
      if (card.teeName) setTee(teeBoxFromName(card.teeName) ?? "white");
      const printed = card.courseName?.trim() ?? "";
      const data = kga ?? (await loadKga().catch(() => null));
      const found = data && printed ? findCourse(data, printed) : null;
      if (found) {
        setClub(found.club);
        setCourseIdx(found.courseIdx);
        setCourseName(found.club.name);
      } else {
        pickClub(null, clubPart(printed));
      }
      setStep("edit");
      window.scrollTo(0, 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "사진을 읽지 못했어요.");
      setStep("pick");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    try {
      const p = await prepareImage(file);
      setImg(p);
      await read(p);
    } catch {
      setErr("사진을 열지 못했어요. 다른 사진을 골라 주세요.");
      setStep("pick");
    }
  };

  const setHole = (i: number, patch: Partial<DraftHole>) =>
    setDraft((d) => (d ? { ...d, holes: d.holes.map((h, j) => (j === i ? { ...h, ...patch } : h)) } : d));

  const checks = draft ? sumChecks(draft) : [];
  const offHoles = draft ? draft.holes.flatMap((h, i) => (girOff(h) ? [i + 1] : [])) : [];
  const emptyHoles = draft ? draft.holes.flatMap((h, i) => (h.score == null ? [i + 1] : [])) : [];
  const anyPenalty = draft?.holes.some((h) => h.penalty > 0) ?? false;
  const canSave = !!draft && courseName.trim().length > 0 && emptyHoles.length === 0 && !saving;

  const save = async () => {
    if (!draft || !canSave) return;
    setSaving(true);
    setErr(null);
    try {
      await importRecordRound(
        {
          courseName: courseName.trim(),
          courseTee: tee,
          date,
          teeTime: "",
          rules: {
            parPenalty: false,
            tie: false,
            birdieDouble: false,
            gameMode: "record",
            ...(rating && { rating }),
          },
          holeCount: draft.holeCount,
          me: {
            name: user?.displayName?.trim() || "나",
            avgScore: null,
            handicap: 0,
          },
        },
        draft.holes.map((h) => ({
          par: h.par,
          strokes: h.score,
          stat: {
            putts: h.putts,
            fairway: h.par >= 4 ? h.fairway : null,
            lie: null,
            ob: h.penaltyKind === "ob" ? h.penalty : 0,
            hazard: h.penaltyKind === "hazard" ? h.penalty : 0,
            sand: h.sand,
          },
        }))
      );
      onSaved();
    } catch (e) {
      console.error(e);
      setErr(
        !navigator.onLine
          ? "연결이 안 돼서 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요."
          : "저장하지 못했어요. 잠시 후 다시 시도해 주세요."
      );
      setSaving(false);
    }
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        void onFile(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  return (
    <div className="app">
      <TopBar left={<BackButton onClick={onBack} />} />

      <div className="sheet">
        <h2 className="page-title">사진으로 기록 추가</h2>
        {fileInput}
        {step !== "edit" && (
          <div className="card sc-pick">
            {img ? (
              <img className="sc-photo" src={img.url} alt="고른 스코어카드 사진" />
            ) : (
              <p className="sc-intro">
                골프 앱에서 내보낸 스코어카드 사진(스크린샷)을 고르면 홀별 타수·퍼트·티샷·패널티·샌드샷을 읽어 채워 줘요.
                저장하기 전에 확인하고 고칠 수 있어요.
              </p>
            )}
            {step === "reading" ? (
              <div className="sc-reading" role="status">
                <span className="sc-spin" aria-hidden="true" />
                사진을 읽고 있어요… 30초쯤 걸려요.
              </div>
            ) : (
              <>
                {err && <div className="sc-err">{err}</div>}
                <button className="btn-primary" onClick={() => fileRef.current?.click()}>
                  {img ? "다른 사진 고르기" : "사진 고르기"}
                </button>
                {img && err && (
                  <button className="btn-line wide" onClick={() => void read(img)}>
                    이 사진 다시 읽기
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {step === "edit" && draft && (
          <>
            <div className="section-title">라운드 정보</div>
            <div className="card">
              <div className="field">
                <label>골프장 이름</label>
                <input
                  className="input"
                  value={courseName}
                  placeholder="예) 클럽72"
                  onChange={(e) => onCourseName(e.target.value)}
                />
                {suggestions.length > 0 && (
                  <div className="kga-sugg">
                    {suggestions.map((c) => (
                      <button key={c.name} onClick={() => pickClub(c, c.name)}>
                        <b>{c.name}</b>
                        <span>
                          {c.region} · {c.courses.length}개 코스
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {club && (
                <div className="field">
                  <label>코스</label>
                  <select className="input" value={courseIdx} onChange={(e) => setCourseIdx(Number(e.target.value))}>
                    {courseIdx < 0 && <option value={-1}>코스를 골라 주세요</option>}
                    {club.courses.map((c, i) => (
                      <option key={c.name} value={i}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label>날짜</label>
                <input className="input dt-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="field">
                <label>티 박스</label>
                <div className="segmented tee-seg">
                  {TEE_BOXES.map(([t, label]) => (
                    <button key={t} className={tee === t ? `active ${t}` : ""} onClick={() => setTee(t)}>
                      <span className={`tee-dot ${t}`} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {course && (
                <p className="sc-rating">
                  {ratingM
                    ? `KGA 레이팅 ${ratingM.cr}/${ratingM.slope} · 보정타수가 계산돼요`
                    : "이 코스에는 고른 티의 KGA 레이팅이 없어요."}
                </p>
              )}
            </div>

            <div className="section-title sc-holes-title">
              홀별 기록
              <button className="sc-photo-btn" onClick={() => setShowPhoto((v) => !v)}>
                {showPhoto ? "사진 접기" : "사진 보기"}
              </button>
            </div>
            {showPhoto && img && <img className="sc-photo sc-photo-ref" src={img.url} alt="스코어카드 사진" />}
            <p className="hint">
              사진에서 읽은 값이에요. 틀린 칸은 눌러서 고쳐 주세요. 티샷 칸은 누를 때마다 적중 → 훅 → 슬라이스 → 짧음으로
              바뀌어요.
            </p>
            <div className="card sc-card">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>홀</th>
                    <th>파</th>
                    <th>타수</th>
                    <th>퍼트</th>
                    <th>티샷</th>
                    <th>패널티</th>
                    <th>샌드</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.holes.map((h, i) => {
                    const warn = girOff(h) || h.score == null;
                    const check = draft.holeCount === 18 && (i === 8 || i === 17) ? checks[i === 8 ? 0 : 1] : null;
                    return (
                      <HoleRows
                        key={i}
                        n={i + 1}
                        h={h}
                        warn={warn}
                        onChange={(patch) => setHole(i, patch)}
                        subtotal={check}
                      />
                    );
                  })}
                </tbody>
                <tfoot>
                  {checks.slice(-1).map((c) => (
                    <SumRow key={c.label} c={c} strong />
                  ))}
                </tfoot>
              </table>
            </div>

            {(checks.some((c) => c.scoreOff || c.puttsOff) || offHoles.length > 0 || emptyHoles.length > 0) && (
              <div className="sc-warn-box">
                {emptyHoles.length > 0 && <p>타수가 비어 있는 홀이 있어요: {emptyHoles.join(", ")}번</p>}
                {checks
                  .filter((c) => c.scoreOff || c.puttsOff)
                  .map((c) => (
                    <p key={c.label}>
                      {c.label === "합계" ? "전체" : c.label} 합계가 사진과 달라요
                      {c.scoreOff && ` · 타수 ${c.score ?? "?"} (사진 ${c.printedScore})`}
                      {c.puttsOff && ` · 퍼트 ${c.putts ?? "?"} (사진 ${c.printedPutts})`}
                    </p>
                  ))}
                {offHoles.length > 0 && (
                  <p>사진의 그린적중 표시와 맞지 않는 홀: {offHoles.join(", ")}번 (타수나 퍼트를 확인해 주세요)</p>
                )}
              </div>
            )}
            {anyPenalty && (
              <p className="hint">패널티는 OB로 들어가요. 해저드였다면 그 홀의 OB를 눌러 해저드로 바꿔 주세요.</p>
            )}
            {err && <div className="sc-err">{err}</div>}
            <button className="btn-primary" disabled={!canSave} onClick={() => void save()}>
              {saving ? "저장하는 중…" : "기록 저장"}
            </button>
            <button className="btn-line wide sc-again" onClick={() => fileRef.current?.click()}>
              다른 사진으로 다시 읽기
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** 홀 한 줄 (+ 9·18번 홀 뒤 아웃·인 소계) */
function HoleRows({
  n,
  h,
  warn,
  onChange,
  subtotal,
}: {
  n: number;
  h: DraftHole;
  warn: boolean;
  onChange: (patch: Partial<DraftHole>) => void;
  subtotal: ReturnType<typeof sumChecks>[number] | null;
}) {
  const nextFairway = () =>
    onChange({ fairway: FAIRWAY_CYCLE[(FAIRWAY_CYCLE.indexOf(h.fairway) + 1) % FAIRWAY_CYCLE.length] });
  return (
    <>
      <tr className={warn ? "sc-warn" : ""}>
        <td className="sc-n">{n}</td>
        <td>
          <button
            className="sc-par"
            aria-label={`${n}번 홀 파 ${h.par}, 눌러서 바꾸기`}
            onClick={() => onChange({ par: h.par === 5 ? 3 : h.par + 1, ...(h.par === 5 && { fairway: null }) })}
          >
            {h.par}
          </button>
        </td>
        <td>
          <input
            className="sc-num"
            type="number"
            inputMode="numeric"
            aria-label={`${n}번 홀 타수`}
            value={h.score ?? ""}
            onChange={(e) => onChange({ score: numOrNull(e.target.value, 1, 15) })}
          />
        </td>
        <td>
          <input
            className="sc-num"
            type="number"
            inputMode="numeric"
            aria-label={`${n}번 홀 퍼트`}
            value={h.putts ?? ""}
            onChange={(e) => onChange({ putts: numOrNull(e.target.value, 0, 6) })}
          />
        </td>
        <td>
          {h.par >= 4 ? (
            <button
              className={`sc-fw ${h.fairway ?? "none"}`}
              aria-label={`${n}번 홀 티샷 ${h.fairway ? FAIRWAY_LABEL[h.fairway] : "없음"}, 눌러서 바꾸기`}
              onClick={nextFairway}
            >
              {h.fairway ? <Icon name={FAIRWAY_ICON[h.fairway]} size={16} strokeWidth={2.2} /> : "–"}
            </button>
          ) : (
            <span className="sc-dash">–</span>
          )}
        </td>
        <td className="sc-pen">
          <input
            className="sc-num sm"
            type="number"
            inputMode="numeric"
            aria-label={`${n}번 홀 패널티`}
            value={h.penalty}
            onChange={(e) => onChange({ penalty: numOrNull(e.target.value, 0, 9) ?? 0 })}
          />
          {h.penalty > 0 && (
            <button
              className={`sc-kind ${h.penaltyKind}`}
              onClick={() => onChange({ penaltyKind: h.penaltyKind === "ob" ? "hazard" : "ob" })}
            >
              {h.penaltyKind === "ob" ? "OB" : "해저드"}
            </button>
          )}
        </td>
        <td>
          <input
            className="sc-num sm"
            type="number"
            inputMode="numeric"
            aria-label={`${n}번 홀 샌드샷`}
            value={h.sand}
            onChange={(e) => onChange({ sand: numOrNull(e.target.value, 0, 9) ?? 0 })}
          />
        </td>
      </tr>
      {subtotal && <SumRow c={subtotal} />}
    </>
  );
}

/** 소계 줄: 지금 칸의 합 (사진 합계와 다르면 빨갛게, 사진 값을 옆에) */
function SumRow({ c, strong }: { c: ReturnType<typeof sumChecks>[number]; strong?: boolean }) {
  return (
    <tr className={`sc-sum ${strong ? "total" : ""}`}>
      <td colSpan={2}>{c.label}</td>
      <td className={c.scoreOff ? "off" : ""}>
        {c.score ?? "–"}
        {c.scoreOff && <small>사진 {c.printedScore}</small>}
      </td>
      <td className={c.puttsOff ? "off" : ""}>
        {c.putts ?? "–"}
        {c.puttsOff && <small>사진 {c.printedPutts}</small>}
      </td>
      <td colSpan={3} />
    </tr>
  );
}
