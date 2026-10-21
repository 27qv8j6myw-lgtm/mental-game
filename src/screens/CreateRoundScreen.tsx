import { useEffect, useState } from "react";
import type {
  BetRules,
  GameMode,
  HandicapMode,
  PaymentMethod,
  SettleTiming,
  SkinsRules,
  TeeBox,
} from "../types";
import { capLabel, DEFAULT_SKINS_RULES, localDate, localTime, RULE_LABELS, TEE_BOXES, won } from "../util";
import { createRound } from "../rounds";
import {
  courseRating,
  exactClub,
  loadKga,
  matchTee,
  ratingFor,
  searchClubs,
  similarClubs,
  type KgaClub,
  type KgaData,
} from "../kga";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { Icon } from "../icons";
import { BogeyExpect, DifficultyChip } from "./CourseDifficulty";
import {
  GameModeField,
  MaxMultiplierField,
  PaymentFields,
  RuleToggles,
  SkinsMultiplierFields,
} from "./RoundFields";

const UNITS = [1000, 2000, 5000];

const HANDICAP_MODES: [HandicapMode, string][] = [
  ["avg", "평균 타수"],
  ["stroke", "최저핸디 대비"],
  ["adjust", "타수 보정"],
];

const HANDICAP_HINT: Record<HandicapMode, string> = {
  avg: "각자 대기실에서 평균 타수를 입력하면 핸디(평균−72)가 자동 계산되고, ± 로 조정할 수 있어요.",
  stroke:
    "방장이 대기실에서 최저핸디 인원을 정하고, 나머지는 그보다 몇 타를 받을지(+5·+10·직접 입력) 골라요. 최저핸디 인원을 정해야 시작할 수 있어요.",
  adjust:
    "방장이 대기실에서 사람마다 파4·파5 홀당 잡아줄 타수(0·1·2타)를 정해요. 보기 이상일 때만 빼주고 파 아래로는 내려가지 않아요. 핸디캡 금액 정산은 없어요.",
};

/** 지난번에 만든 라운드 설정 (다음에 만들 때 그대로 시작) */
interface LastSetup {
  holeCount: number;
  tee: TeeBox;
  gameMode: GameMode;
  unit: number;
  skinsRules: SkinsRules;
  payment: PaymentMethod;
  handicapSettle: SettleTiming;
  handicapMode: HandicapMode;
  rules: BetRules;
}
const SETUP_KEY = "mentalgame-last-setup";
const COURSES_KEY = "mentalgame-recent-courses";
const readJson = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 저장소를 쓸 수 없으면 기억하지 않는다 */
  }
};

export default function CreateRoundScreen({ onCancel }: { onCancel: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();
  // 지난 설정과 최근 골프장 (매주 같은 멤버·같은 내기면 이름만 고르면 된다)
  const [last] = useState(() => readJson<LastSetup>(SETUP_KEY));
  const [recentCourses] = useState(() => readJson<string[]>(COURSES_KEY) ?? []);

  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [teeTime, setTeeTime] = useState(() => localTime());
  const [tee, setTee] = useState<TeeBox>(last?.tee ?? "white");
  const [unit, setUnit] = useState(last?.unit ?? 1000);
  const [customUnit, setCustomUnit] = useState(() =>
    last && !UNITS.includes(last.unit) ? String(last.unit) : ""
  );
  const [gameMode, setGameMode] = useState<GameMode>(last?.gameMode ?? "stroke");
  const [skinsRules, setSkinsRules] = useState<SkinsRules>(last?.skinsRules ?? DEFAULT_SKINS_RULES);
  const [payment, setPayment] = useState<PaymentMethod>(last?.payment ?? "transfer");
  const [handicapSettle, setHandicapSettle] = useState<SettleTiming>(last?.handicapSettle ?? "post");
  const [handicapMode, setHandicapMode] = useState<HandicapMode>(last?.handicapMode ?? "avg");
  const [rules, setRules] = useState<BetRules>(
    last?.rules ?? {
      parPenalty: true,
      doublePar: false,
      tie: false,
      birdieDouble: false,
      maxMultiplier: 2,
    }
  );
  /** 배수 상한·배판 규칙 펼침 (처음엔 한 줄 요약만) */
  const [rulesOpen, setRulesOpen] = useState(false);

  const [holeCount, setHoleCount] = useState(last?.holeCount ?? 18);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // KGA 코스레이팅: 골프장 이름 추천 → 코스 선택 → 티 박스에 맞는 레이팅
  const [kga, setKga] = useState<KgaData | null>(null);
  const [club, setClub] = useState<KgaClub | null>(null);
  const [courseIdx, setCourseIdx] = useState(-1);
  useEffect(() => {
    loadKga()
      .then(setKga)
      .catch((e) => console.error("코스레이팅 불러오기 실패", e));
  }, []);
  const pickClub = (c: KgaClub | null, name?: string) => {
    setClub(c);
    setCourseIdx(c && c.courses.length === 1 ? 0 : -1);
    if (name !== undefined) setCourseName(name);
  };
  // 이름을 고치면 고른 골프장은 풀고, 목록의 이름과 같으면(띄어쓰기·CC 무시) 바로 고른다
  const onCourseName = (v: string) => {
    setCourseName(v);
    const same = kga ? exactClub(kga, v) : null;
    if (same?.name !== club?.name) pickClub(same);
  };
  const suggestions = kga && !club && courseName.trim() ? searchClubs(kga, courseName) : [];
  const similar =
    kga && !club && suggestions.length === 0 ? similarClubs(kga, courseName) : [];
  const course = club && courseIdx >= 0 ? club.courses[courseIdx] : null;
  // 위에서 고른 티 박스에 맞는 이 코스의 KGA 티
  const ratingTee = course ? matchTee(course, tee) : null;
  const rating = kga && club && course && ratingTee ? courseRating(kga, club, course, ratingTee) : null;

  const isCustomUnit = !UNITS.includes(unit);
  // 기록 모드는 내기가 없어 금액·지불·핸디캡·배판 설정이 없다
  const isRecord = gameMode === "record";
  const canSave = courseName.trim().length > 0 && (isRecord || unit > 0);

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const round = await createRound({
        courseName,
        courseTee: tee,
        date,
        teeTime,
        unit: isRecord ? 0 : unit,
        rules: {
          ...(isRecord
            ? { parPenalty: false, tie: false, birdieDouble: false, gameMode }
            : {
                ...rules,
                payment,
                handicapMode,
                gameMode,
                ...(gameMode === "skins" && { skins: skinsRules }),
              }),
          ...(rating && { rating }),
        },
        handicapSettle,
        holeCount,
        me: {
          name: user?.displayName?.trim() || "나",
          gender: user?.gender ?? "male",
          avgScore: null,
          handicap: 0,
        },
      });
      // 다음에 만들 때 그대로 시작하도록 기억한다
      writeJson(SETUP_KEY, {
        holeCount,
        tee,
        gameMode,
        unit: isRecord ? last?.unit ?? 1000 : unit,
        skinsRules,
        payment,
        handicapSettle,
        handicapMode,
        rules,
      } satisfies LastSetup);
      const name = courseName.trim();
      writeJson(COURSES_KEY, [name, ...recentCourses.filter((c) => c !== name)].slice(0, 5));
      openRound(round.id);
    } catch (e) {
      console.error(e);
      setErr(
        !navigator.onLine
          ? "연결이 안 돼서 라운드를 만들지 못했어요. 연결을 확인하고 다시 눌러 주세요."
          : "라운드 생성에 실패했어요. 잠시 후 다시 시도해 주세요."
      );
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <span className="dot">
            <Icon name="flag" size={18} />
          </span>
          라운드 만들기
        </div>
        <button className="icon-btn" onClick={onCancel}>
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="sheet">
        <div className="section-title">라운드 정보</div>
        <div className="card">
          <div className="field">
            <label>골프장 이름</label>
            <input
              className="input"
              placeholder="예) 베어크리크 춘천"
              value={courseName}
              onChange={(e) => onCourseName(e.target.value)}
            />
            {/* 최근 골프장: 비어 있을 때 한 번에 고르기 */}
            {!courseName.trim() && recentCourses.length > 0 && (
              <div className="recent-courses">
                <span>최근</span>
                {recentCourses.map((c) => (
                  <button key={c} className="chip" onClick={() => onCourseName(c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            {/* KGA 목록에 있는 골프장 추천 (누르면 이름이 채워지고 코스를 고를 수 있다) */}
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
            {similar.length > 0 && (
              <div className="kga-sugg similar">
                <div className="kga-q">이 코스가 맞나요?</div>
                {similar.map((c) => (
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
              <select
                className="input"
                value={courseIdx}
                onChange={(e) => setCourseIdx(Number(e.target.value))}
              >
                {courseIdx < 0 && <option value={-1}>코스를 골라 주세요</option>}
                {club.courses.map((c, i) => (
                  <option key={c.name} value={i}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="row2">
            <div className="field">
              <label>날짜</label>
              <input
                className="input dt-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field">
              <label>티오프 시간</label>
              <input
                className="input dt-input"
                type="time"
                value={teeTime}
                onChange={(e) => setTeeTime(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label>홀 수</label>
            <div className="segmented">
              {[9, 18].map((h) => (
                <button
                  key={h}
                  className={holeCount === h ? "active" : ""}
                  onClick={() => setHoleCount(h)}
                >
                  {h}홀
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>티 박스</label>
            <div className="segmented tee-seg">
              {TEE_BOXES.map(([t, label]) => (
                <button
                  key={t}
                  className={tee === t ? `active ${t}` : ""}
                  onClick={() => setTee(t)}
                >
                  <span className={`tee-dot ${t}`} />
                  {label}
                </button>
              ))}
            </div>
            {/* 고른 코스·티의 KGA 레이팅 */}
            {course && (
              <div className="kga-rating">
                {rating ? (
                  <>
                    <span>
                      KGA 레이팅{" "}
                      {rating.ratings
                        .map((r) => `${r.sex === "M" ? "남" : "여"} ${r.cr}/${r.slope}`)
                        .join(" · ")}
                    </span>
                    {/* 난이도·보기 플레이어 예상은 남자 레이팅 기준 (없으면 있는 것) */}
                    <DifficultyChip slope={ratingFor(rating, "M")!.slope} />
                  </>
                ) : (
                  <span className="kga-miss">이 코스에는 고른 티의 KGA 레이팅이 없어요.</span>
                )}
              </div>
            )}
            {rating && (
              <div className="kga-expect">
                <BogeyExpect {...ratingFor(rating, "M")!} />
              </div>
            )}
          </div>
        </div>

        <div className="section-title">게임 방식</div>
        <div className="card">
          <GameModeField value={gameMode} onChange={setGameMode} />
        </div>

        {!isRecord && (
        <>
        <div className="section-title">{gameMode === "skins" ? "홀당 금액" : "타당 금액"}</div>
        <div className="card">
          <div className="unit-chips">
            {UNITS.map((u) => (
              <button
                key={u}
                className={`chip ${unit === u ? "active" : ""}`}
                onClick={() => {
                  setUnit(u);
                  setCustomUnit("");
                }}
              >
                {won(u)}
              </button>
            ))}
            <button
              className={`chip ${isCustomUnit ? "active" : ""}`}
              onClick={() => {
                const v = Number(customUnit) || 3000;
                setCustomUnit(String(v));
                setUnit(v);
              }}
            >
              직접입력
            </button>
          </div>
          {isCustomUnit && (
            <div className="field" style={{ marginTop: 12 }}>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="금액 입력 (원)"
                value={customUnit ? Number(customUnit).toLocaleString("ko-KR") : ""}
                onChange={(e) => {
                  // 콤마를 빼고 숫자만 저장, 화면에는 천 원 단위 콤마로 보여준다
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                  setCustomUnit(digits);
                  setUnit(Number(digits) || 0);
                }}
              />
            </div>
          )}
          {gameMode === "skins" && (
            <p className="hint" style={{ marginTop: 10, wordBreak: "keep-all" }}>
              스킨 = 홀별 인당 금액이에요. 홀을 이긴 사람이 나머지 모두에게서 스킨 수 만큼 받아요.
            </p>
          )}
          <p className="warn-note">
            ⚠️ 과도한 금액 설정은 인간관계에 지장을 줄 수 있어요.
          </p>
        </div>

        <div className="section-title">지불 방법</div>
        <div className="card">
          <PaymentFields
            payment={payment}
            settle={handicapSettle}
            onChange={(p, st) => {
              setPayment(p);
              setHandicapSettle(st);
            }}
            showSettle={handicapMode !== "adjust"}
          />
        </div>

        <div className="section-title">핸디캡 설정 방식</div>
        <div className="card">
          <div className="segmented">
            {HANDICAP_MODES.map(([m, label]) => (
              <button
                key={m}
                className={handicapMode === m ? "active" : ""}
                onClick={() => setHandicapMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            {HANDICAP_HINT[handicapMode]}
          </p>
        </div>
        </>
        )}

        {gameMode === "skins" && (
          <>
            <div className="section-title">배수 조건</div>
            <div className="card">
              <SkinsMultiplierFields value={skinsRules} onChange={setSkinsRules} />
            </div>
          </>
        )}

        {gameMode === "stroke" && (
          <>
            {/* 배수 상한·배판 규칙은 한 줄 요약으로 접어 두고, 바꿀 때만 펼친다 */}
            <div className="section-title">배판 규칙</div>
            <div className="card">
              <button className="rules-summary" aria-expanded={rulesOpen} onClick={() => setRulesOpen(!rulesOpen)}>
                <span>
                  {[
                    ...RULE_LABELS.filter(([k]) => rules[k]).map(([, label]) => label),
                    `배수 상한 ${capLabel(rules.maxMultiplier)}`,
                  ].join(" · ")}
                </span>
                <em>{rulesOpen ? "접기 ▴" : "바꾸기 ▾"}</em>
              </button>
              {rulesOpen && (
                <div className="rules-body">
                  <RuleToggles rules={rules} onChange={setRules} />
                  <div className="rules-cap">
                    <MaxMultiplierField
                      value={rules.maxMultiplier ?? null}
                      onChange={(v) => setRules((r) => ({ ...r, maxMultiplier: v }))}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {err && (
          <div className="auth-err" style={{ color: "var(--loss)" }}>
            {err}
          </div>
        )}
      </div>

      <div className="actionbar">
        <button className="btn-primary" disabled={!canSave || busy} onClick={submit}>
          {busy
            ? "생성 중…"
            : !courseName.trim()
            ? "골프장 이름을 입력해 주세요"
            : !isRecord && unit <= 0
            ? "금액을 입력해 주세요"
            : isRecord
            ? "기록 라운드 만들기"
            : "라운드 만들고 코드 받기"}
        </button>
      </div>
    </div>
  );
}
