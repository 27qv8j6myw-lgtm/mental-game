import { playerRating } from "../model";
import { useMemo, useState } from "react";
import { useRound } from "../round";
import { EMPTY_STAT, halfHoles, loadRecordRounds, summarize, type HoleRecord } from "../recordStats";
import { GAME_MODE_LABEL, relLabel, teeLabel } from "../util";
import { Avatar, Icon } from "../icons";
import { differential, ratingFor, teeSex } from "../kga";
import type { CourseRating, Session } from "../types";
import { HalfChips, HalfTitleTags, RecordAnalysis, RecordScorecard, useHalfView } from "./RecordAnalysis";
import { RatingLines } from "./CourseDifficulty";
import ShareImageSheet from "./ShareImageSheet";
import { courseTitle, renderScorecard } from "../shareImage";
import { InsightAction, InsightSummary, useAiAccess, useRoundInsight } from "./Insight";
import { buildInsightInput, insightFingerprint, isSameCourse } from "../insight";
import { saveGreenSpeed, withGreenSpeed } from "../greenSpeed";
import { GreenSpeedButton } from "./GreenSpeed";
import { weatherText } from "../weather";

/**
 * 보정타수 = (타수 − 코스레이팅) × 113 ÷ 슬로프레이팅.
 * KGA 목록에서 골프장·코스를 고른 라운드에서, 18홀을 다 쳤을 때만 계산한다
 */
function AdjustedScore({
  rating,
  sex,
  gross,
}: {
  rating: CourseRating | null;
  sex: "M" | "F";
  gross: number | null;
}) {
  const r = ratingFor(rating, sex);
  if (!rating || !r) return null;
  return (
    <div className="rr-adj">
      <div className="rr-adj-main">
        <span>보정타수</span>
        <b>{gross == null ? "–" : differential(gross, r.cr, r.slope).toFixed(1)}</b>
      </div>
      {gross == null && <div className="rr-adj-sub">18홀을 다 치면 계산돼요</div>}
      <RatingLines rating={rating} sex={sex} />
    </div>
  );
}

const NO_RECS: HoleRecord[] = [];

/** 기록 분석 탭: 한 사람(기본: 나)의 이 라운드 분석과 스코어카드. 여럿이면 타수 순위도 */
export default function RecordResultsScreen({ session }: { session: Session }) {
  const { myUid, activeRoundId, isHost, bundle, updateRound, refresh } = useRound();
  const { config, holes, holeStats } = session;
  /** 그린스피드: 라운드를 친 사람 누구나 (SQL 함수가 아직 없으면 방장만 rules 를 직접 고친다) */
  const setGreenSpeed = async (v: number | null) => {
    if (!activeRoundId) return;
    const rules = bundle?.round.rules;
    await saveGreenSpeed(
      activeRoundId,
      v,
      isHost && rules ? () => updateRound({ rules: withGreenSpeed(rules, v) }) : undefined
    );
    await refresh();
  };
  const players = config.players;
  const [pick, setPick] = useState<string | null>(null);
  const selectedId =
    pick && players.some((p) => p.id === pick)
      ? pick
      : players.find((p) => p.id === myUid)?.id ?? players[0]?.id ?? "";
  const selected = players.find((p) => p.id === selectedId);

  /** 사람마다 홀별 기록과 요약 */
  const byPlayer = useMemo(
    () =>
      new Map(
        players.map((p) => {
          const recs: HoleRecord[] = holes.map((h, i) => {
            const st = holeStats[i]?.[p.id] ?? EMPTY_STAT;
            return { hole: i, par: h.par, rel: h.scores[p.id] ?? null, ...st };
          });
          return [p.id, { recs, s: summarize(recs) }] as const;
        })
      ),
    [players, holes, holeStats]
  );

  const mine = byPlayer.get(selectedId);
  // 전반·후반 칩을 누르면 분석·스코어카드·AI 분석이 그 9홀로
  const hv = useHalfView(mine?.recs ?? NO_RECS, holes.length, mine?.s);
  // 타수 순위: 파 대비 합이 적은 순 (친 홀이 없는 사람은 맨 뒤)
  const ranking = [...players]
    .map((p) => ({ p, s: byPlayer.get(p.id)!.s }))
    .sort(
      (a, b) =>
        (a.s.holesPlayed === 0 ? 1 : 0) - (b.s.holesPlayed === 0 ? 1 : 0) ||
        a.s.toPar - b.s.toPar
    );
  // 고른 사람이 라운드 티와 다른 티를 쳤으면(남녀 혼성) 그 티와 그 티의 레이팅
  const tee = teeLabel(selected?.tee || config.courseTee);
  const [sharing, setSharing] = useState(false);
  // 레드 티면 여성 레이팅
  const sexSel = teeSex(selected?.tee || config.courseTee);
  const rSel = ratingFor(playerRating(config.rating, config.teeRatings, selected?.tee), sexSel);
  const diffSel =
    rSel && mine && holes.length === 18 && mine.s.holesPlayed === 18
      ? differential(mine.s.strokes, rSel.cr, rSel.slope)
      : null;
  // AI 분석: 관리자는 누구 기록이든, 허용된 사람은 내 기록만.
  // 평소·같은 코스 기록은 고른 사람이 나일 때 내 지난 라운드에서
  const access = useAiAccess(myUid);
  const canAi = access.admin || (access.ai && selectedId === myUid);
  const ai = useRoundInsight({
    roundId: activeRoundId,
    playerUid: selectedId,
    enabled: canAi,
    scope: hv.half,
    fingerprint: insightFingerprint(hv.holes),
    build: async () => {
      const past =
        selectedId === myUid ? (await loadRecordRounds(myUid)).filter((x) => x.roundId !== activeRoundId) : [];
      const here = { name: config.courseName, rating: config.rating, holeCount: holes.length };
      // 전반·후반 분석이면 다른 라운드도 같은 9홀만
      const part = (hs: HoleRecord[]) => halfHoles(hs, hv.half);
      return buildInsightInput(
        {
          date: config.date,
          course: courseTitle(config.courseName, config.rating),
          holeCount: holes.length,
          mode: GAME_MODE_LABEL[config.gameMode],
          differential: hv.half === "all" ? diffSel : null,
          greenSpeed: config.greenSpeed,
          scope: hv.half,
        },
        hv.holes,
        past.map((x) => part(x.holes)),
        past
          .filter((x) => isSameCourse(here, { name: x.courseName, rating: x.rating, holeCount: x.holeCount }))
          .map((x) => part(x.holes))
      );
    },
  });
  /** 고른 사람의 스코어카드 이미지 */
  const makeScorecard = () => {
    const r = rSel;
    const full = holes.length === 18 && mine?.s.holesPlayed === 18;
    return renderScorecard({
      date: config.date,
      course: courseTitle(config.courseName, config.rating),
      tee: tee || undefined,
      player: selected?.name || "나",
      holes: (mine?.recs ?? []).map((h) => ({
        par: h.par,
        strokes: h.rel == null ? null : h.par + h.rel,
        putts: h.putts,
        fairway: h.fairway,
        lie: h.lie,
        ob: h.ob,
        hazard: h.hazard,
        sand: h.sand,
      })),
      differential: r && full && mine ? differential(mine.s.strokes, r.cr, r.slope) : null,
      rating: r ? `KGA ${r.cr}/${r.slope}` : null,
      mode: config.gameMode,
    });
  };

  return (
    <>
      <div className="sheet results">
        {/* 알림 (최종 확정 실패 등): 정산 화면에서는 맨 위에 */}
        {session.notice && (
          <div className="notice-bar inline" role="alert">
            <span>{session.notice}</span>
            <button aria-label="알림 닫기" onClick={() => session.setNotice(null)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {players.length > 1 && (
          <>
            <div className="section-title">타수 순위</div>
            <div className="card st-list">
              {ranking.map(({ p, s }, i) => (
                <button
                  className={`st-row ${p.id === selectedId ? "rr-on" : ""}`}
                  key={p.id}
                  onClick={() => setPick(p.id)}
                >
                  <span className={`rank ${i === 0 && s.holesPlayed > 0 ? "top" : ""}`}>{i + 1}</span>
                  <Avatar photoUrl={p.photoUrl} size={28} />
                  <span className="st-row-main">
                    <span className="st-row-name">
                      {p.name || "?"}
                      {p.id === myUid && <span className="me-tag">나</span>}
                    </span>
                    <span className="st-row-sub">
                      {s.holesPlayed}홀
                      {s.putts != null && ` · 퍼트 ${s.putts}`}
                    </span>
                  </span>
                  <span className="st-row-amt">
                    {s.holesPlayed === 0 ? "–" : `${s.strokes}타 (${relLabel(s.toPar)})`}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {selected && mine && (
          <>
            <div className="section-title" style={{ marginTop: players.length > 1 ? 20 : 0 }}>
              {selected.id === myUid ? "내 기록" : `${selected.name || "?"} 기록`}
            </div>
            <div className="card rr-sum">
              {/* 골프장 이름 크게, 아래에 날짜·티·그린스피드, 그 아래 날씨 */}
              <div className="rr-course">{config.courseName || "이름 없는 라운드"}</div>
              <div className="rr-meta">
                {[config.date, tee].filter(Boolean).join(" · ")}
                <GreenSpeedButton
                  value={config.greenSpeed}
                  onSave={selected.id === myUid ? setGreenSpeed : undefined}
                />
              </div>
              {config.weather && (
                <div className="rr-weather">
                  <Icon name="sun" size={15} />
                  {weatherText(config.weather)}
                </div>
              )}
              <div className="rr-total">
                <b>{mine.s.holesPlayed === 0 ? "–" : mine.s.strokes}</b>
                <span>타</span>
                {mine.s.holesPlayed > 0 && <em>{relLabel(mine.s.toPar)}</em>}
              </div>
              <HalfChips s={mine.s} holeCount={holes.length} view={hv} />
              <AdjustedScore
                rating={playerRating(config.rating, config.teeRatings, selected.tee)}
                sex={sexSel}
                gross={holes.length === 18 && mine.s.holesPlayed === 18 ? mine.s.strokes : null}
              />
            </div>
            {mine.s.holesPlayed > 0 && (
              <button className="btn-line wide share-btn" onClick={() => setSharing(true)}>
                <Icon name="share" size={17} />
                스코어카드 이미지로 공유·저장
              </button>
            )}

            {canAi && hv.s.holesPlayed > 0 && <InsightAction state={ai} />}
            <div className="section-title">
              분석
              <HalfTitleTags view={hv} compare />
            </div>
            <RecordAnalysis
              s={hv.s}
              compare={hv.compare}
              insight={canAi ? ai.insight ?? undefined : undefined}
            />

            <div className="section-title">
              스코어카드
              <HalfTitleTags view={hv} />
            </div>
            <RecordScorecard holes={hv.holes} />
            {canAi && <InsightSummary state={ai} />}
          </>
        )}
      </div>
      {sharing && (
        <ShareImageSheet
          make={makeScorecard}
          fileName={`scorecard-${config.date || "round"}.png`}
          title={`${selected?.name || "나"} 스코어카드`}
          onClose={() => setSharing(false)}
        />
      )}
    </>
  );
}
