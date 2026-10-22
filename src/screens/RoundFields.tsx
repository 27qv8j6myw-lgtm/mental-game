import { useState } from "react";
import type {
  BetRules,
  GameMode,
  PaymentMethod,
  RankMethod,
  RankPrize,
  RankRules,
  SettleTiming,
  SkinsRules,
} from "../types";
import {
  CADDIE_PER_HOLE,
  capLabel,
  GAME_MODE_LABEL,
  RANK_METHOD_LABEL,
  settleNote,
  won,
  wonSigned,
} from "../util";
import { caddieCounted } from "../caddie";
import { Icon } from "../icons";

const GAME_MODES: GameMode[] = ["stroke", "skins", "caddie", "rank", "record"];

const GAME_MODE_HINT: Record<GameMode, string> = {
  stroke: "두 명씩 홀마다 타수 차이 × 타당 금액을 주고받아요.",
  skins: "홀마다 단독 최저 타수 플레이어가 걸린 스킨을 모두 가져가요.",
  caddie: "홀마다 꼴찌가 1만원씩 캐디피로 내요. 캐디피에 맞춰 앞 홀은 연습이에요.",
  rank: "홀마다 돈이 오가지 않고 끝나고 등수만 정해요. 등수별 금액은 정해도 되고 안 해도 돼요.",
  record: "내기 없이 각자 스코어·퍼트·페어웨이·벌타를 기록해요.",
};

/** 게임 방식: 타당 / 스킨스 / 기록. modes 로 고를 수 있는 방식을 줄일 수 있다 (정산 설정 수정 등) */
export function GameModeField({
  value,
  onChange,
  modes = GAME_MODES,
}: {
  value: GameMode;
  onChange: (v: GameMode) => void;
  modes?: GameMode[];
}) {
  return (
    <>
      <div className="segmented mode-seg">
        {modes.map((m) => (
          <button key={m} className={value === m ? "active" : ""} onClick={() => onChange(m)}>
            {GAME_MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {GAME_MODE_HINT[value]}
      </p>
    </>
  );
}

/** 스킨스 배수 조건: 총 상한 + 이월 2배·버디·후반 가중 토글 + 기본 룰 */
export function SkinsMultiplierFields({
  value,
  onChange,
}: {
  value: SkinsRules;
  onChange: (v: SkinsRules) => void;
}) {
  const toggle = (key: "carryDouble" | "birdie" | "late") =>
    onChange({ ...value, [key]: !value[key] });
  return (
    <>
      <MaxMultiplierField
        value={value.maxMultiplier}
        onChange={(v) => onChange({ ...value, maxMultiplier: v })}
        hint="이월 2배·버디·후반 배수를 곱한 값이 이 값을 넘지 않아요."
      />
      <div className="sub-field" style={{ paddingTop: 0 }}>
        <div className="toggle-row" onClick={() => toggle("carryDouble")}>
          <div className="tinfo">
            <span className="t">이월하면 2배</span>
            <span className="s">
              최저 동타로 이월되면 스킨이 {value.carryDouble ? "1→2→4→8" : "1→2→3→4"}개로 불어나요
            </span>
          </div>
          <div className={`switch ${value.carryDouble ? "on" : ""}`} />
        </div>
        <div className="toggle-row" onClick={() => toggle("birdie")}>
          <div className="tinfo">
            <span className="t">버디·이글 배수</span>
            <span className="s">버디로 이기면 ×2, 이글 이상으로 이기면 ×3</span>
          </div>
          <div className={`switch ${value.birdie ? "on" : ""}`} />
        </div>
        <div className="toggle-row" onClick={() => toggle("late")}>
          <div className="tinfo">
            <span className="t">후반 가중</span>
            <span className="s">마지막 3개 홀(18홀이면 16~18번, 9홀이면 7~9번)은 ×2</span>
          </div>
          <div className={`switch ${value.late ? "on" : ""}`} />
        </div>
      </div>
      <SkinsRules />
    </>
  );
}

/** 스킨스 기본 룰 안내 (배판 규칙의 기본 룰과 같은 모양) */
export function SkinsRules() {
  return (
    <div className="base-rules">
      <div className="br-title">
        <Icon name="info" size={15} className="inline-ic" /> 스킨스 룰
      </div>
      <ul>
        <li>홀마다 스킨 1개(홀당 금액)가 걸림</li>
        <li>단독 최저 타수 플레이어가 걸린 스킨을 모두 가져감</li>
        <li>이긴 사람은 모두에게서 스킨 수 × 홀당 금액씩 받음</li>
        <li>최저 타수가 2명 이상이면 다음 홀로 이월돼 스킨이 쌓임</li>
        <li>마지막 홀이 최저 동타면 동타인 사람끼리 나눠 가짐</li>
        <li>전원 동타면 남은 스킨은 사라짐</li>
        <li>타당의 배판·버디 추가 정산은 없음</li>
        <li>홀 최대 타수는 더블파까지만 반영</li>
      </ul>
    </div>
  );
}

const ADJ_OPTS = [0, 1, 2];

/** 타수 보정: 파4·파5 홀마다 잡아주는 타수 0·1·2 */
export function StrokeAdjField({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="segmented sm adj-seg" role="group" aria-label={label}>
      {ADJ_OPTS.map((n) => (
        <button key={n} className={value === n ? "active" : ""} onClick={() => onChange(n)}>
          {n}타
        </button>
      ))}
    </div>
  );
}

/**
 * 지불 방법 + 핸디캡 정산 시점. 현금 지급은 사전 정산만 가능하다.
 * 타수 보정 방식은 핸디캡 금액 정산이 없어 정산 시점을 보여주지 않는다.
 */
export function PaymentFields({
  payment,
  settle,
  onChange,
  showSettle = true,
}: {
  payment: PaymentMethod;
  settle: SettleTiming;
  onChange: (payment: PaymentMethod, settle: SettleTiming) => void;
  showSettle?: boolean;
}) {
  return (
    <>
      <div className="segmented">
        <button
          className={payment === "cash" ? "active" : ""}
          onClick={() => onChange("cash", "pre")}
        >
          현금 지급
        </button>
        <button
          className={payment === "transfer" ? "active" : ""}
          onClick={() => onChange("transfer", "post")}
        >
          계좌이체
        </button>
      </div>

      {showSettle && (
        <div className="sub-field">
          <label>핸디캡 정산</label>
          <div className="segmented sm">
            <button
              className={settle === "pre" ? "active" : ""}
              onClick={() => onChange(payment, "pre")}
            >
              사전 정산
            </button>
            <button
              className={settle === "post" ? "active" : ""}
              disabled={payment === "cash"}
              onClick={() => onChange(payment, "post")}
            >
              사후 정산
            </button>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {settleNote(settle)}
            {payment === "cash" && " (현금 지급은 사전 정산만 가능해요)"}
          </p>
        </div>
      )}
    </>
  );
}

const CAPS: (number | null)[] = [2, 4, 8, null];

/** 배수 총 상한: 배판 조건 × 이월을 곱한 배수가 이 값을 넘지 않는다. */
export function MaxMultiplierField({
  value,
  onChange,
  hint = "배판 조건과 전원 동타 이월을 곱한 배수가 이 값을 넘지 않아요.",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}) {
  return (
    <>
      <div className="segmented">
        {CAPS.map((c) => (
          <button
            key={String(c)}
            className={value === c ? "active" : ""}
            onClick={() => onChange(c)}
          >
            {capLabel(c)}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {hint}
      </p>
      <p className="warn-note">⚠️ 과도한 배수 설정은 인간관계에 지장을 줄 수 있어요.</p>
    </>
  );
}

/** 배판 규칙 토글. 파 페널티와 더블파는 한쪽을 켜면 다른 쪽이 꺼진다. */
export function RuleToggles({
  rules,
  onChange,
}: {
  rules: BetRules;
  onChange: (rules: BetRules) => void;
}) {
  const togglePenalty = (key: "parPenalty" | "doublePar") => {
    const on = !rules[key];
    const other = key === "parPenalty" ? "doublePar" : "parPenalty";
    onChange({ ...rules, [key]: on, [other]: on ? false : rules[other] });
  };

  return (
    <>
      <div className="toggle-row" onClick={() => togglePenalty("parPenalty")}>
        <div className="tinfo">
          <span className="t">파 페널티 배판 (동시 규칙)</span>
          <span className="s">파3 더블보기+ · 파4·5 트리플보기+ 가 나오면 ×2</span>
        </div>
        <div className={`switch ${rules.parPenalty ? "on" : ""}`} />
      </div>
      <div className="toggle-row" onClick={() => togglePenalty("doublePar")}>
        <div className="tinfo">
          <span className="t">더블파 배판</span>
          <span className="s">더블파(파의 2배 타수)가 나오면 ×2 · 파 페널티와 택1</span>
        </div>
        <div className={`switch ${rules.doublePar ? "on" : ""}`} />
      </div>
      <div
        className="toggle-row"
        onClick={() => onChange({ ...rules, birdieDouble: !rules.birdieDouble })}
      >
        <div className="tinfo">
          <span className="t">버디 배판</span>
          <span className="s">버디·이글이 나오면 ×2 (버디 추가 정산 없음)</span>
        </div>
        <div className={`switch ${rules.birdieDouble ? "on" : ""}`} />
      </div>
      <div className="toggle-row" onClick={() => onChange({ ...rules, tie: !rules.tie })}>
        <div className="tinfo">
          <span className="t">동타 배판</span>
          <span className="s">3명 이상 같은 스코어면 ×2 (전원 동타 제외)</span>
        </div>
        <div className={`switch ${rules.tie ? "on" : ""}`} />
      </div>
      <div className="base-rules">
        <div className="br-title">
          <Icon name="info" size={15} className="inline-ic" /> 기본 룰
        </div>
        <div className="br-group">이월</div>
        <ul>
          <li>전원 동타면 그 홀은 정산 없이 다음 홀로 2배 이월</li>
          <li>전원 동타가 계속 이어지면 이월도 2배씩 곱해짐</li>
          <li>맨 마지막 홀 뒤에 남은 이월은 자동으로 사라짐</li>
          <li>배판 규칙을 모두 끄면 전원 동타 2배 이월만 적용</li>
        </ul>
        <div className="br-group">배판 계산</div>
        <ul>
          <li>동일한 배판 조건은 홀당 1번씩 세고 인원 수로 곱하지 않음</li>
          <li>한 홀에 서로 다른 배판 조건이 겹치면 곱함</li>
          <li>
            모든 배수는 <b>총 상한</b>을 넘지 않음
          </li>
          <li>버디 배판을 끄면 버디는 1타, 이글은 2타 추가 정산 적용</li>
          <li>홀 최대 타수는 더블파까지만 반영</li>
        </ul>
      </div>
    </>
  );
}

/* ---------- 캐디피 내기 ---------- */

/** 홀 수에 맞는 캐디피 칩 (9홀은 7·8·9만원) */
const caddieFees = (holeCount: number) =>
  holeCount <= 9 ? [70000, 80000, 90000] : [150000, 160000, 170000, 180000];

/** 캐디피: 칩 또는 만원 단위 직접 입력 + "16홀 × 1만원 · 앞 2홀 연습" 요약 */
export function CaddieFeeField({
  fee,
  holeCount,
  onChange,
}: {
  fee: number;
  holeCount: number;
  onChange: (fee: number) => void;
}) {
  const fees = caddieFees(holeCount);
  const custom = !fees.includes(fee);
  const [text, setText] = useState(custom && fee > 0 ? String(fee / CADDIE_PER_HOLE) : "");
  const counted = caddieCounted(fee, holeCount);
  const practice = holeCount - counted;
  return (
    <>
      <div className="unit-chips">
        {fees.map((f) => (
          <button
            key={f}
            className={`chip ${fee === f ? "active" : ""}`}
            onClick={() => {
              onChange(f);
              setText("");
            }}
          >
            {f / CADDIE_PER_HOLE}만원
          </button>
        ))}
        <button
          className={`chip ${custom ? "active" : ""}`}
          onClick={() => {
            const v = Number(text) || fees[0] / CADDIE_PER_HOLE;
            setText(String(v));
            onChange(v * CADDIE_PER_HOLE);
          }}
        >
          직접입력
        </button>
      </div>
      {custom && (
        <div className="field caddie-custom" style={{ marginTop: 12 }}>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="캐디피 (만원)"
            value={text}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
              setText(digits);
              onChange((Number(digits) || 0) * CADDIE_PER_HOLE);
            }}
          />
          <span>만원</span>
        </div>
      )}
      <p className="hint caddie-sum" style={{ marginTop: 10 }}>
        {counted > 0
          ? `${counted}홀 × 1만원${practice > 0 ? ` · 앞 ${practice}홀은 연습` : ""}`
          : "캐디피를 1만원 이상 정해 주세요."}
        {fee > holeCount * CADDIE_PER_HOLE &&
          ` · ${holeCount}홀이라 모든 홀에서 1만원씩 (${won(holeCount * CADDIE_PER_HOLE)})`}
      </p>
    </>
  );
}

/* ---------- 등수 내기 ---------- */

const RANK_METHODS: RankMethod[] = ["points", "net", "skins"];
const RANK_METHOD_HINT: Record<RankMethod, string> = {
  points: "타당처럼 두 명씩 타수 차이를 포인트로 쌓아 포인트가 많은 순으로 정해요.",
  net: "총 타수에서 핸디를 빼서 적은 순으로 정해요. 핸디는 각자 대기실에서 평균 타수로 정하고(±조정), 9홀이면 절반이에요.",
  skins: "홀마다 단독 최저 타수가 스킨을 가져가고, 딴 스킨이 많은 순으로 정해요.",
};

/** 등수 정하는 방식: 타당 포인트 / 핸디 타수 / 스킨스 */
export function RankMethodField({ value, onChange }: { value: RankMethod; onChange: (v: RankMethod) => void }) {
  return (
    <>
      <div className="segmented">
        {RANK_METHODS.map((m) => (
          <button key={m} className={value === m ? "active" : ""} onClick={() => onChange(m)}>
            {RANK_METHOD_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {RANK_METHOD_HINT[value]}
      </p>
    </>
  );
}

const PRIZES: [RankPrize, string][] = [
  ["none", "없음"],
  ["pay", "내는 돈"],
  ["exchange", "주고받는 돈"],
];
const PAY_DEFAULT = [0, 10000, 20000, 30000];
const EXCHANGE_DEFAULT = [20000, 10000, -10000, -20000];

/**
 * 등수별 금액: 없음 / 내는 돈(각자 내서 모은다) / 주고받는 돈(+ 받음 · − 냄, 합 0 이면 송금).
 * count: 금액을 정할 등수 수 (라운드 만들 때 4, 대기실에서는 참여 인원)
 */
export function RankPrizeField({
  rules,
  onChange,
  count = 4,
}: {
  rules: RankRules;
  onChange: (r: RankRules) => void;
  count?: number;
}) {
  const amounts = Array.from({ length: count }, (_, i) => rules.amounts[i] ?? 0);
  const setPrize = (prize: RankPrize) => {
    // 내는 돈 ↔ 주고받는 돈은 금액 뜻이 달라서, 맞지 않으면 기본값으로
    let next = rules.amounts;
    if (prize === "pay" && next.some((v) => v < 0)) next = PAY_DEFAULT;
    if (prize === "exchange" && next.every((v) => v >= 0)) next = EXCHANGE_DEFAULT;
    onChange({ ...rules, prize, amounts: next });
  };
  const setAmount = (i: number, v: number) => {
    const next = [...amounts];
    next[i] = v;
    onChange({ ...rules, amounts: next });
  };
  const sum = amounts.reduce((a, b) => a + b, 0);
  return (
    <>
      <div className="segmented">
        {PRIZES.map(([p, label]) => (
          <button key={p} className={rules.prize === p ? "active" : ""} onClick={() => setPrize(p)}>
            {label}
          </button>
        ))}
      </div>
      {rules.prize === "none" ? (
        <p className="hint" style={{ marginTop: 10 }}>
          돈 없이 등수만 정해요.
        </p>
      ) : (
        <>
          <div className="rank-prizes">
            {amounts.map((v, i) => (
              <div className="rank-prize" key={i}>
                <span className="rp-rank">{i + 1}등</span>
                {rules.prize === "exchange" && (
                  <button
                    className={`rp-sign ${v < 0 ? "neg" : "pos"}`}
                    onClick={() => setAmount(i, -v)}
                    aria-label={`${i + 1}등 받음/냄 바꾸기`}
                  >
                    {v < 0 ? "냄" : "받음"}
                  </button>
                )}
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  value={Math.abs(v) ? Math.abs(v).toLocaleString("ko-KR") : ""}
                  placeholder="0"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\D/g, "").slice(0, 8)) || 0;
                    setAmount(i, v < 0 ? -n : n);
                  }}
                />
                <span className="rp-won">원</span>
              </div>
            ))}
          </div>
          {rules.prize === "pay" ? (
            <p className="hint" style={{ marginTop: 10 }}>
              등수별로 각자 내서 모아요 (캐디피·식사비 등). 사람끼리 주고받지 않아요. 같은 등수는 그 자리들
              금액을 나눠 내요{count < 5 ? ", 5등부터는 0원" : ""}.
            </p>
          ) : (
            <p className={`hint rp-sum ${sum === 0 ? "ok" : "warn"}`} style={{ marginTop: 10 }}>
              합계 {sum === 0 ? "0원" : wonSigned(sum)} ·{" "}
              {sum === 0
                ? "아래 등수가 위 등수에게 보내요. 같은 등수는 금액을 나눠요."
                : `${count}명 기준 합이 0원이어야 송금을 계산해요.`}
            </p>
          )}
        </>
      )}
    </>
  );
}
