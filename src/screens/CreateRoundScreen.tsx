import { useEffect, useState } from "react";
import Guide from "../guide/Guide";
import type { TopicId } from "../guide/content";
import type {
  BetRules,
  CourseRating,
  GameMode,
  HandicapMode,
  PaymentMethod,
  RankRules,
  SettleTiming,
  SkinsRules,
  TeeBox,
} from "../types";
import {
  CADDIE_PER_HOLE,
  DEFAULT_RANK_RULES,
  DEFAULT_SKINS_RULES,
  localDate,
  localTime,
  TEE_BOXES,
  won,
} from "../util";
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
  CaddieFeeField,
  GameModeField,
  HANDICAP_HINT,
  HandicapModeField,
  MaxMultiplierField,
  RankMethodField,
  RankPrizeField,
  PaymentFields,
  RuleToggles,
  SkinsMultiplierFields,
} from "./RoundFields";

const UNITS = [1000, 2000, 5000];

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
  /** 캐디피 내기 금액 (예전 기록엔 없음) */
  caddieFee?: number;
  /** 등수 내기 설정 (예전 기록엔 없음) */
  rankRules?: RankRules;
}
const SETUP_KEY = "mentalgame-last-setup";
/** 라운드 기본 티 박스 (대기실에서 티를 고르지 않은 사람) */
const DEFAULT_TEE: TeeBox = "white";
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
  // 티 박스는 대기실에서 사람마다 고른다. 라운드 기본 티(고르지 않은 사람)는 화이트
  const tee: TeeBox = DEFAULT_TEE;
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
  const [caddieFee, setCaddieFee] = useState(last?.caddieFee ?? 160000);
  const [rankRules, setRankRules] = useState<RankRules>(last?.rankRules ?? DEFAULT_RANK_RULES);

  const [holeCount, setHoleCount] = useState(last?.holeCount ?? 18);
  const [busy, setBusy] = useState(false);
  /** 사용 방법: 섹션 제목 옆 '자세히'로 그 항목을 덮어 연다 (닫으면 입력이 그대로) */
  const [guideAt, setGuideAt] = useState<TopicId | null>(null);
  const More = ({ to }: { to: TopicId }) => (
    <button className="gd-more" onClick={() => setGuideAt(to)}>
      자세히
      <Icon name="chevronRight" size={13} />
    </button>
  );
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
  // 난이도·라운드 레이팅은 화이트 티 기준 (화이트가 없는 코스는 첫 티)
  const ratingTee = course ? matchTee(course, tee) ?? course.tees[0]?.[0] ?? null : null;
  const rating = kga && club && course && ratingTee ? courseRating(kga, club, course, ratingTee) : null;
  // 같은 코스의 티 박스별 레이팅: 대기실에서 사람마다 티를 바꾸면(남녀 혼성) 그 사람 보정타수에 쓴다
  const teeRatings = (() => {
    if (!kga || !club || !course) return null;
    const out: Partial<Record<TeeBox, CourseRating>> = {};
    for (const [t] of TEE_BOXES) {
      const kt = matchTee(course, t);
      if (kt) out[t] = courseRating(kga, club, course, kt);
    }
    return Object.keys(out).length > 0 ? out : null;
  })();

  const isCustomUnit = !UNITS.includes(unit);
  // 기록 모드는 내기가 없어 금액·지불·핸디캡·배판 설정이 없다
  const isRecord = gameMode === "record";
  // 캐디피: 홀당 1만원 고정·현금·타수 보정 / 등수: 홀마다 돈이 없고 방식·등수 금액만
  const isCaddie = gameMode === "caddie";
  const isRank = gameMode === "rank";
  /** 타당·스킨스처럼 홀마다 돈을 주고받는 방식 (금액·지불·핸디 방식을 고른다) */
  const isMoney = gameMode === "stroke" || gameMode === "skins";
  const rankPays = isRank && rankRules.prize === "exchange";
  const canSave =
    courseName.trim().length > 0 && (isMoney ? unit > 0 : isCaddie ? caddieFee >= CADDIE_PER_HOLE : true);
  /** 배판 규칙 카드: 타당, 그리고 등수 내기 포인트에서 배판을 켰을 때 */
  const showStrokeRules = gameMode === "stroke" || (isRank && rankRules.method === "points" && rankRules.multipliers);

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
        unit: isMoney ? unit : isCaddie ? CADDIE_PER_HOLE : 0,
        rules: {
          ...(isRecord
            ? { parPenalty: false, tie: false, birdieDouble: false, gameMode }
            : isCaddie
              ? // 캐디피: 현금, 핸디는 타수 보정만
                { parPenalty: false, tie: false, birdieDouble: false, gameMode, payment: "cash" as const,
                  handicapMode: "adjust" as const, caddie: { fee: caddieFee } }
              : isRank
                ? {
                    ...rules,
                    gameMode,
                    // 주고받는 돈만 지불 방법을 고른다
                    payment: rankPays ? payment : ("cash" as const),
                    // 핸디 타수는 고른 핸디 방식, 포인트·스킨스는 타수 보정 (기본 0타)
                    handicapMode: rankRules.method === "net" ? handicapMode : ("adjust" as const),
                    rank: rankRules,
                    ...(rankRules.method === "skins" && { skins: skinsRules }),
                  }
                : {
                    ...rules,
                    payment,
                    handicapMode,
                    gameMode,
                    ...(gameMode === "skins" && { skins: skinsRules }),
                  }),
          ...(rating && { rating }),
          ...(teeRatings && { teeRatings }),
        },
        handicapSettle: isMoney ? handicapSettle : rankPays && payment === "transfer" ? "post" : "pre",
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
        unit: isMoney ? unit : last?.unit ?? 1000,
        skinsRules,
        payment,
        handicapSettle,
        handicapMode,
        rules,
        caddieFee,
        rankRules,
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
          {/* 난이도: 남자 화이트 티 기준 KGA 레이팅과 보기 플레이어 예상 스코어 */}
          {course && (
            <div className="field">
              <label>난이도</label>
              {rating ? (
                <>
                  <div className="kga-rating">
                    <span>
                      {ratingTee === matchTee(course, tee) ? "남자 화이트 티" : `남자 ${rating.tee} 티`} · KGA{" "}
                      {ratingFor(rating, "M")!.cr}/{ratingFor(rating, "M")!.slope}
                    </span>
                    <DifficultyChip slope={ratingFor(rating, "M")!.slope} />
                  </div>
                  <div className="kga-expect">
                    <BogeyExpect {...ratingFor(rating, "M")!} />
                  </div>
                </>
              ) : (
                <div className="kga-rating">
                  <span className="kga-miss">이 코스에는 KGA 레이팅이 없어요.</span>
                </div>
              )}
            </div>
          )}
          <p className="hint tee-note">
            티 박스는 대기실에서 사람마다 골라요 (기본 화이트, 여성은 레드). 보정타수·스코어카드는 각자 고른 티
            기준이에요.
          </p>
        </div>

        <div className="section-title">
          게임 방식
          <More to="modes" />
        </div>
        <div className="card">
          <GameModeField value={gameMode} onChange={setGameMode} />
        </div>

        {isCaddie && (
          <>
            <div className="section-title">
              캐디피
              <More to="caddie" />
            </div>
            <div className="card">
              <CaddieFeeField fee={caddieFee} holeCount={holeCount} onChange={setCaddieFee} />
              <p className="hint caddie-rule">
                내는 홀마다 꼴찌가 1만원을 내요. 공동 꼴찌면 다음 홀로 넘어가 다음 홀 꼴찌가 2만원을 내고,
                마지막 홀까지 넘어간 돈은 모두가 나눠 내요. 계좌이체 없이 현금으로 모아요.
              </p>
            </div>
            <div className="section-title">
              핸디캡
              <More to="hc-adjust" />
            </div>
            <div className="card">
              <p className="hint" style={{ margin: 0 }}>
                타수 보정 방식이에요. {HANDICAP_HINT.adjust}
              </p>
            </div>
          </>
        )}

        {isRank && (
          <>
            <div className="section-title">
              등수 정하는 방식
              <More to="rank" />
            </div>
            <div className="card">
              <RankMethodField value={rankRules.method} onChange={(method) => setRankRules((r) => ({ ...r, method }))} />
              {rankRules.method === "points" && (
                <div
                  className="toggle-row rank-mult"
                  onClick={() => setRankRules((r) => ({ ...r, multipliers: !r.multipliers }))}
                >
                  <div className="tinfo">
                    <span className="t">배판 적용</span>
                    <span className="s">
                      {rankRules.multipliers
                        ? "아래 배판 규칙·이월·버디 추가 포인트를 그대로 써요."
                        : "배판·이월·버디 추가 없이 타수 차이만 포인트로 쌓아요."}
                    </span>
                  </div>
                  <div className={`switch ${rankRules.multipliers ? "on" : ""}`} />
                </div>
              )}
              {rankRules.method !== "net" && (
                <p className="hint" style={{ marginTop: 10 }}>
                  핸디는 타수 보정이에요. 방장이 대기실에서 사람마다 파4·파5 홀당 잡아줄 타수(0·1·2타)를 정해요.
                </p>
              )}
            </div>

            {/* 핸디 타수: 타당과 같은 세 가지 핸디 방식 */}
            {rankRules.method === "net" && (
              <>
                <div className="section-title">
                  핸디캡 설정 방식
                  <More to="hc-modes" />
                </div>
                <div className="card">
                  <HandicapModeField value={handicapMode} onChange={setHandicapMode} />
                </div>
              </>
            )}

            <div className="section-title">등수 금액</div>
            <div className="card">
              <RankPrizeField rules={rankRules} onChange={setRankRules} />
            </div>

            {rankPays && (
              <>
                <div className="section-title">
                  지불 방법
                  <More to="payment" />
                </div>
                <div className="card">
                  <PaymentFields
                    payment={payment}
                    settle={handicapSettle}
                    onChange={(p, st) => {
                      setPayment(p);
                      setHandicapSettle(st);
                    }}
                    showSettle={false}
                  />
                </div>
              </>
            )}
          </>
        )}

        {isMoney && (
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

        <div className="section-title">
          지불 방법
          <More to="payment" />
        </div>
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

        <div className="section-title">
          핸디캡 설정 방식
          <More to="hc-modes" />
        </div>
        <div className="card">
          <HandicapModeField value={handicapMode} onChange={setHandicapMode} />
        </div>
        </>
        )}

        {(gameMode === "skins" || (isRank && rankRules.method === "skins")) && (
          <>
            <div className="section-title">
              배수 조건
              <More to="skins" />
            </div>
            <div className="card">
              <SkinsMultiplierFields value={skinsRules} onChange={setSkinsRules} />
            </div>
          </>
        )}

        {showStrokeRules && (
          <>
            <div className="section-title">
              배판 규칙
              <More to="multiplier" />
            </div>
            <div className="card">
              <RuleToggles rules={rules} onChange={setRules} />
              <div className="rules-cap">
                <MaxMultiplierField
                  value={rules.maxMultiplier ?? null}
                  onChange={(v) => setRules((r) => ({ ...r, maxMultiplier: v }))}
                />
              </div>
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
            : isMoney && unit <= 0
            ? "금액을 입력해 주세요"
            : isCaddie && caddieFee < CADDIE_PER_HOLE
            ? "캐디피를 정해 주세요"
            : isRecord
            ? "기록 라운드 만들기"
            : "라운드 만들고 코드 받기"}
        </button>
      </div>
      {guideAt && <Guide topic={guideAt} onClose={() => setGuideAt(null)} />}
    </div>
  );
}
