import { useMemo, useState } from "react";
import { useRound } from "../round";
import { EMPTY_STAT, loadRecordRounds, summarize, type HoleRecord } from "../recordStats";
import { GAME_MODE_LABEL, relLabel, teeLabel } from "../util";
import { Avatar, Icon } from "../icons";
import { differential, ratingFor } from "../kga";
import type { CourseRating, Session } from "../types";
import { RecordAnalysis, RecordScorecard } from "./RecordAnalysis";
import { BogeyExpect, DifficultyChip } from "./CourseDifficulty";
import ShareImageSheet from "./ShareImageSheet";
import { courseTitle, renderScorecard } from "../shareImage";
import { InsightAction, InsightSummary, useAiAccess, useRoundInsight } from "./Insight";
import { buildInsightInput, insightFingerprint, isSameCourse } from "../insight";

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
      <div className="rr-adj-sub">
        {rating.club} {rating.course} · {rating.tee} 티 {r.sex === "M" ? "남자" : "여자"}
        {!r.exact && " 레이팅"} · 코스레이팅 {r.cr} · 슬로프 {r.slope}
        {gross == null && <> · 18홀을 다 치면 계산돼요</>}
      </div>
      <div className="rr-adj-diff">
        <DifficultyChip slope={r.slope} />
        <BogeyExpect cr={r.cr} slope={r.slope} par={r.par} />
      </div>
    </div>
  );
}

/** 기록 분석 탭: 한 사람(기본: 나)의 이 라운드 분석과 스코어카드. 여럿이면 타수 순위도 */
export default function RecordResultsScreen({ session }: { session: Session }) {
  const { myUid, activeRoundId } = useRound();
  const { config, holes, holeStats } = session;
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
  // 타수 순위: 파 대비 합이 적은 순 (친 홀이 없는 사람은 맨 뒤)
  const ranking = [...players]
    .map((p) => ({ p, s: byPlayer.get(p.id)!.s }))
    .sort(
      (a, b) =>
        (a.s.holesPlayed === 0 ? 1 : 0) - (b.s.holesPlayed === 0 ? 1 : 0) ||
        a.s.toPar - b.s.toPar
    );
  const tee = teeLabel(config.courseTee);
  const played = Math.max(0, ...[...byPlayer.values()].map((v) => v.s.holesPlayed));
  const [sharing, setSharing] = useState(false);
  const rSel = ratingFor(config.rating, selected?.gender === "female" ? "F" : "M");
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
    fingerprint: insightFingerprint(mine?.recs ?? []),
    build: async () => {
      const past =
        selectedId === myUid ? (await loadRecordRounds(myUid)).filter((x) => x.roundId !== activeRoundId) : [];
      const here = { name: config.courseName, rating: config.rating, holeCount: holes.length };
      return buildInsightInput(
        {
          date: config.date,
          course: courseTitle(config.courseName, config.rating),
          holeCount: holes.length,
          mode: GAME_MODE_LABEL[config.gameMode],
          differential: diffSel,
        },
        mine?.recs ?? [],
        past.map((x) => x.holes),
        past
          .filter((x) => isSameCourse(here, { name: x.courseName, rating: x.rating, holeCount: x.holeCount }))
          .map((x) => x.holes)
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
      <div className="result-hero">
        <div className="big">
          <Icon name="chart" size={22} className="inline-ic" /> 라운드 기록
        </div>
        <div style={{ opacity: 0.82, marginTop: 5, fontSize: 13 }}>
          {config.date} · {played}개 홀 진행{tee && ` · ${tee}`}
        </div>
      </div>

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
                  <Avatar photoUrl={p.photoUrl} gender={p.gender} size={28} />
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
              <div className="rr-total">
                <b>{mine.s.holesPlayed === 0 ? "–" : mine.s.strokes}</b>
                <span>타</span>
                {mine.s.holesPlayed > 0 && <em>{relLabel(mine.s.toPar)}</em>}
              </div>
              <div className="st-golf">
                <span>
                  전반 <b>{mine.s.out ?? "–"}</b>
                </span>
                {holes.length > 9 && (
                  <span>
                    후반 <b>{mine.s.in ?? "–"}</b>
                  </span>
                )}
                <span>
                  퍼트 <b>{mine.s.putts ?? "–"}</b>
                </span>
                <span>
                  {mine.s.holesPlayed}/{holes.length}홀
                </span>
              </div>
              <AdjustedScore
                rating={config.rating}
                sex={selected.gender === "female" ? "F" : "M"}
                gross={holes.length === 18 && mine.s.holesPlayed === 18 ? mine.s.strokes : null}
              />
            </div>
            {mine.s.holesPlayed > 0 && (
              <button className="btn-line wide share-btn" onClick={() => setSharing(true)}>
                <Icon name="share" size={17} />
                스코어카드 이미지로 공유·저장
              </button>
            )}

            {canAi && mine.s.holesPlayed > 0 && <InsightAction state={ai} />}
            <div className="section-title">분석</div>
            <RecordAnalysis s={mine.s} insight={canAi ? ai.insight ?? undefined : undefined} />

            <div className="section-title">스코어카드</div>
            <RecordScorecard holes={mine.recs} />
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
