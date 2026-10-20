import { useMemo, useState } from "react";
import { useRound } from "../round";
import { EMPTY_STAT, summarize, type HoleRecord } from "../recordStats";
import { relLabel, teeLabel } from "../util";
import { Avatar, Icon } from "../icons";
import { differential, ratingFor } from "../kga";
import type { CourseRating, Session } from "../types";
import { RecordAnalysis, RecordScorecard } from "./RecordAnalysis";
import { BogeyExpect, DifficultyChip } from "./CourseDifficulty";

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
  const { myUid } = useRound();
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

            <div className="section-title">분석</div>
            <RecordAnalysis s={mine.s} />

            <div className="section-title">스코어카드</div>
            <RecordScorecard holes={mine.recs} />
          </>
        )}
      </div>
    </>
  );
}
