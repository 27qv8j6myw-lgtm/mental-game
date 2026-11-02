import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import { holeBreakdowns, skinsResult } from "../betting";
import { caddieResult } from "../caddie";
import { Avatar } from "../icons";
import { settledHoles } from "../model";
import { pointsConfig, rankResult, rankRules, rankScoreText } from "../rankGame";
import { relLabel, won, wonSigned } from "../util";
import type { GameConfig, HoleScore } from "../types";

/*
 * 홀 저장 → 다음 홀로 넘어갈 때 띄우는 '전 홀 결과' 팝업.
 * 저장된 홀(그 홀까지)로 계산한다: 타당은 이번 홀 금액(게임 + 버디)과 누적(핸디 제외),
 * 스킨스는 스킨, 캐디피는 꼴찌가 낸 돈, 등수 내기는 이번 홀 포인트·스킨과 지금 순위
 */

interface Row {
  id: string;
  /** 이번 홀 칸 ("+3,000원", "+2점", "1만원"). null 이면 칸 없음 */
  hole: string | null;
  holeTone: number;
  /** 오른쪽 칸 (누적·순위) */
  total: string;
  totalTone: number;
}

interface View {
  /** 위 한 줄 (배판·이월·스킨·꼴찌) */
  banner: { text: string; kind: "bae" | "carry" | "win" | "plain" } | null;
  /** 표 아래 작은 글 (버디 추가 정산이 들어 있을 때) */
  note?: string;
  holeLabel: string;
  totalLabel: string;
  rows: Row[];
}

const signed = (v: number, unit: string) => (v === 0 ? `±0${unit}` : `${v > 0 ? "+" : ""}${v.toLocaleString("ko-KR")}${unit}`);
const money = (v: number) => (v === 0 ? "±0" : wonSigned(v));

function holeView(config: GameConfig, holes: HoleScore[], h: number): View {
  // 그 홀까지 저장된 홀만 (뒤 홀은 비운다)
  const upTo = settledHoles(holes).map((x, j) =>
    j <= h ? x : { ...x, scores: Object.fromEntries(Object.keys(x.scores).map((k) => [k, null])) }
  );
  const name = (id: string) => config.players.find((p) => p.id === id)?.name || "?";
  const isRank = config.gameMode === "rank";
  const rank = isRank ? rankRules(config) : null;
  const ranked = isRank ? rankResult(config, upTo) : null;
  const rankText = (id: string) => {
    const r = ranked!.order.find((x) => x.id === id)!;
    return `${r.rank}위 · ${rankScoreText(rank!.method, r.score)}`;
  };
  const rankTone = (id: string) => (rank!.method === "net" ? 0 : ranked!.score[id]);

  // 캐디피: 꼴찌가 이 홀 캐디피를 낸다
  if (config.gameMode === "caddie") {
    const c = caddieResult(config, upTo).holes[h];
    return {
      banner: c.practice
        ? { text: "연습 홀 · 내는 돈 없음", kind: "plain" }
        : c.status === "paid"
        ? { text: `꼴찌 ${name(c.payerId!)} · 캐디피 ${won(c.stake)}`, kind: "win" }
        : { text: `공동 꼴찌 · ${won(c.stake)}이 다음 홀로 넘어가요`, kind: "carry" },
      holeLabel: "이번 홀",
      totalLabel: "낸 캐디피",
      rows: config.players.map((p) => {
        const paid = c.status === "paid" && c.payerId === p.id ? c.stake : 0;
        return { id: p.id, hole: paid ? won(paid) : "–", holeTone: -paid, total: won(c.cumulative[p.id] ?? 0), totalTone: -(c.cumulative[p.id] ?? 0) };
      }),
    };
  }

  // 스킨스 (등수 내기 스킨스는 개수만)
  if (config.gameMode === "skins" || rank?.method === "skins") {
    const s = skinsResult(isRank ? { ...config, unit: 1 } : config, upTo).holes[h];
    const why = s.reasons.length ? ` (${s.reasons.join(" · ")})` : "";
    const banner: View["banner"] =
      s.status === "won"
        ? { text: `${name(s.winnerIds[0])} 스킨 ${s.skins}개${why}`, kind: "win" }
        : s.status === "split"
        ? { text: `${s.winnerIds.map(name).join("·")} 스킨 나눔`, kind: "win" }
        : s.status === "carried"
        ? { text: `최저 동타 · 스킨 ${s.stake}개가 다음 홀로${why}`, kind: "carry" }
        : null;
    return {
      banner,
      holeLabel: "이번 홀",
      totalLabel: isRank ? "순위" : "누적",
      rows: config.players.map((p) => {
        const v = s.net[p.id] ?? 0;
        return isRank
          ? { id: p.id, hole: s.winnerIds.includes(p.id) ? `스킨 ${s.skins}개` : "–", holeTone: s.winnerIds.includes(p.id) ? 1 : 0, total: rankText(p.id), totalTone: rankTone(p.id) }
          : { id: p.id, hole: money(v), holeTone: v, total: money(s.cumulative[p.id] ?? 0), totalTone: s.cumulative[p.id] ?? 0 };
      }),
    };
  }

  // 등수 내기 핸디 타수: 홀마다 오가는 점수 없이 순위만
  if (rank?.method === "net") {
    return {
      banner: null,
      holeLabel: "",
      totalLabel: "순위",
      rows: config.players.map((p) => ({ id: p.id, hole: null, holeTone: 0, total: rankText(p.id), totalTone: 0 })),
    };
  }

  // 타당 · 등수 내기 타당 포인트: 게임 + 버디 (포인트는 배판을 끄면 버디 추가 없음)
  const cfg = isRank ? pointsConfig(config) : config;
  const bd = holeBreakdowns(cfg, upTo)[h];
  const withBirdie = !isRank || rank!.multipliers;
  const banner: View["banner"] = bd.allTie
    ? { text: bd.nextCarry && bd.nextCarry > 1 ? `전원 동타 · 다음 홀 ×${bd.nextCarry} 이월` : "전원 동타 · 정산 없음", kind: "carry" }
    : bd.multiplier > 1
    ? { text: `×${bd.multiplier} 배판 · ${bd.reasons.join(" · ")}`, kind: "bae" }
    : null;
  const birdies = withBirdie ? config.players.filter((p) => bd.birdie[p.id] > 0).map((p) => p.name || "?") : [];
  return {
    banner,
    note: birdies.length ? `버디 추가 ${isRank ? "포인트가" : "정산이"} 들어 있어요 (${birdies.join("·")})` : undefined,
    holeLabel: "이번 홀",
    totalLabel: isRank ? "순위" : "누적",
    rows: config.players.map((p) => {
      const v = bd.game[p.id] + (withBirdie ? bd.birdie[p.id] : 0);
      return isRank
        ? { id: p.id, hole: signed(v, "점"), holeTone: v, total: rankText(p.id), totalTone: rankTone(p.id) }
        : { id: p.id, hole: money(v), holeTone: v, total: money(bd.cumulative[p.id] ?? 0), totalTone: bd.cumulative[p.id] ?? 0 };
    }),
  };
}

const tone = (v: number) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

/** 전 홀 결과 팝업. 확인·바깥·뒤로가기로 닫는다 (뜬 직후 잠깐은 바깥을 눌러도 닫히지 않게: 점수 누르던 손가락) */
export default function HoleResultPopup({
  config,
  holes,
  hole,
  onClose,
}: {
  config: GameConfig;
  holes: HoleScore[];
  /** 결과를 보여 줄 홀 (0부터) */
  hole: number;
  onClose: () => void;
}) {
  useBack(true, onClose);
  const opened = useRef(Date.now());
  useEffect(() => {
    opened.current = Date.now();
  }, [hole]);
  const v = useMemo(() => holeView(config, holes, hole), [config, holes, hole]);
  const h = holes[hole];
  if (!h) return null;

  return createPortal(
    <div className="alert-backdrop" onClick={() => Date.now() - opened.current > 600 && onClose()}>
      <div className="alert-box hr-box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="hr-head">
          <b>{hole + 1}번 홀 결과</b>
          <span>PAR {h.par}</span>
        </div>
        {v.banner && <div className={`hr-banner ${v.banner.kind}`}>{v.banner.text}</div>}
        <div className={`hr-table ${v.rows[0]?.hole == null ? "no-hole" : ""}`}>
          <div className="hr-row hr-th">
            <span />
            <span>타수</span>
            {v.rows[0]?.hole != null && <span>{v.holeLabel}</span>}
            <span>{v.totalLabel}</span>
          </div>
          {config.players.map((p) => {
            const r = v.rows.find((x) => x.id === p.id)!;
            const rel = h.scores[p.id];
            return (
              <div className="hr-row" key={p.id}>
                <span className="hr-name">
                  <Avatar photoUrl={p.photoUrl} size={22} />
                  <b>{p.name || "?"}</b>
                </span>
                <span className={`hr-rel ${rel == null ? "" : rel < 0 ? "under" : rel > 0 ? "over" : "even"}`}>
                  {rel == null ? "–" : relLabel(rel)}
                </span>
                {r.hole != null && <span className={`hr-amt ${tone(r.holeTone)}`}>{r.hole}</span>}
                <span className={`hr-total ${tone(r.totalTone)}`}>{r.total}</span>
              </div>
            );
          })}
        </div>
        {v.note && <p className="hr-note">{v.note}</p>}
        <button className="btn-primary" onClick={onClose}>
          확인
        </button>
      </div>
    </div>,
    document.body
  );
}
