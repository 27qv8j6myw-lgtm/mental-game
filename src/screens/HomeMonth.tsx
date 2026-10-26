import { useEffect, useState } from "react";
import { loadStats } from "../stats";
import type { RoundScoreLine } from "../roundScores";
import type { RoundListItem } from "../types";

const seoulDay = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const roundDay = (r: RoundListItem) => r.date || seoulDay(new Date(r.created_at));
const won = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("ko-KR")}원`;

/**
 * 펼친 홈 대시보드: 이번 달 내 기록 한눈에 (끝낸 라운드 수 · 18홀 평균·베스트 · 내기 합계).
 * 타수는 홈 목록이 이미 받아 둔 라운드별 타수(lines), 내기 합계는 전적 계산(loadStats, 받아 둔 것이면 바로)
 */
export default function HomeMonth({
  uid,
  rounds,
  lines,
}: {
  uid: string;
  rounds: RoundListItem[];
  lines: Record<string, RoundScoreLine>;
}) {
  const month = seoulDay(new Date()).slice(0, 7);
  const done = rounds.filter((r) => r.status === "done" && roundDay(r).startsWith(month));
  const full = done
    .map((r) => (r.hole_count === 18 ? lines[r.id]?.players[uid] : undefined))
    .filter((p) => p && p.played === 18)
    .map((p) => p!.strokes);
  const avg = full.length ? Math.round((full.reduce((a, b) => a + b, 0) / full.length) * 10) / 10 : null;
  const best = full.length ? Math.min(...full) : null;

  const [net, setNet] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    loadStats(uid, rounds)
      .then((s) => {
        if (!alive) return;
        const mine = (s.me?.history ?? []).filter((h) => h.money && h.date.startsWith(month));
        setNet(mine.length ? mine.reduce((a, h) => a + h.net, 0) : null);
      })
      .catch(() => alive && setNet(null));
    return () => {
      alive = false;
    };
  }, [uid, rounds, month]);

  return (
    <div className="card hm-card">
      <div className="hm-title">{Number(month.slice(5))}월 내 기록</div>
      <div className="rm-grid">
        <div className="rm-tile">
          <span className="rm-label">끝낸 라운드</span>
          <b className="rm-value">{done.length}</b>
        </div>
        <div className="rm-tile">
          <span className="rm-label">18홀 평균</span>
          <b className="rm-value">{avg == null ? "—" : `${avg}타`}</b>
        </div>
        <div className="rm-tile">
          <span className="rm-label">베스트</span>
          <b className="rm-value">{best == null ? "—" : `${best}타`}</b>
        </div>
        <div className="rm-tile">
          <span className="rm-label">내기 합계</span>
          <b className={`rm-value ${net == null ? "" : net >= 0 ? "pos" : "neg"}`}>{net == null ? "—" : won(net)}</b>
        </div>
      </div>
    </div>
  );
}
