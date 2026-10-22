import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { apiUrl } from "./scorecard";
import { buildInsightInput } from "./insight";
import { EMPTY_STAT, loadRecordRounds, type HoleRecord } from "./recordStats";
import { GAME_MODE_LABEL } from "./util";
import type { HoleStat, Session } from "./types";

/*
 * 라운드 중 홀 코칭 (관리자·AI 고급): 내 기록을 저장할 때마다 지금까지의 이번 라운드와 평소 기록을 보내
 * 평소보다 부족한 점·다음 홀에서 할 것 두 줄을 받는다 (api/coach.ts). 홀 상태 칸에 띄우고, 닫거나 다음 코칭이 오면 바뀐다.
 * 보관하지 않는다 (라운드가 끝나면 기록 분석에서 자세히 본다)
 */

export interface Coaching {
  /** 0부터 시작하는 홀 번호 */
  hole: number;
  lines: string[];
  loading: boolean;
  error: string | null;
}

async function requestCoach(input: unknown): Promise<string[]> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
  const res = await fetch(apiUrl("coach"), {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token ?? ""}` },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as { lines?: string[]; error?: string } | null;
  if (res.ok && body?.lines?.length) return body.lines;
  throw new Error(body?.error ?? String(res.status));
}

/** 이번 라운드 내 홀 기록 (저장한 내 기록에 방금 저장한 홀을 덮어 쓴다) */
function myHoles(session: Session, uid: string, hole: number, stat: HoleStat, rel?: number | null): HoleRecord[] {
  return session.holes.map((h, i) => {
    const st = i === hole ? stat : session.holeStats[i]?.[uid] ?? EMPTY_STAT;
    const r = i === hole && rel !== undefined ? rel : h.scores[uid] ?? null;
    return { hole: i, par: h.par, rel: r, ...st };
  });
}

/**
 * enabled: 홀 코칭 권한(관리자·AI 고급)이 있고 라운드 진행 중일 때. coach(hole, stat, rel?) 를 내 기록 저장 때 부른다
 */
export function useHoleCoach(session: Session, uid: string | null | undefined, roundId: string | null, enabled: boolean) {
  const [coaching, setCoaching] = useState<Coaching | null>(null);
  /** 평소 기록 (다른 라운드 홀별 기록): 라운드마다 한 번 불러 둔다 */
  const usual = useRef<{ roundId: string; holes: HoleRecord[][] } | null>(null);
  const seq = useRef(0);
  useEffect(() => setCoaching(null), [roundId]);

  const coach = useCallback(
    (hole: number, stat: HoleStat, rel?: number | null) => {
      if (!enabled || !uid || !roundId) return;
      const my = ++seq.current;
      setCoaching({ hole, lines: [], loading: true, error: null });
      void (async () => {
        try {
          if (usual.current?.roundId !== roundId) {
            const past = await loadRecordRounds(uid).catch(() => []);
            usual.current = { roundId, holes: past.filter((r) => r.roundId !== roundId).map((r) => r.holes) };
          }
          const { config } = session;
          const input = buildInsightInput(
            {
              date: config.date,
              course: config.courseName,
              holeCount: session.holes.length,
              mode: GAME_MODE_LABEL[config.gameMode],
              differential: null,
            },
            myHoles(session, uid, hole, stat, rel),
            usual.current.holes
          );
          const lines = await requestCoach({ focusHole: hole + 1, round: input.round, usual: input.usual });
          if (seq.current === my) setCoaching({ hole, lines, loading: false, error: null });
        } catch (e) {
          console.warn("홀 코칭을 받지 못함", e);
          if (seq.current === my) setCoaching({ hole, lines: [], loading: false, error: "코칭을 받지 못했어요." });
        }
      })();
    },
    [enabled, uid, roundId, session]
  );
  const close = useCallback(() => {
    seq.current++;
    setCoaching(null);
  }, []);
  return { coaching, coach, close };
}
