import type { BetRules, GameMode, PaymentMethod, SettleTiming } from "../types";
import { capLabel, GAME_MODE_LABEL, settleNote } from "../util";
import { Icon } from "../icons";

const GAME_MODES: GameMode[] = ["stroke", "skins"];

/** 게임 방식: 타당 / 스킨스. 스킨스를 고르면 스킨스 룰을 바로 아래에 보여준다. */
export function GameModeField({
  value,
  onChange,
}: {
  value: GameMode;
  onChange: (v: GameMode) => void;
}) {
  return (
    <>
      <div className="segmented">
        {GAME_MODES.map((m) => (
          <button key={m} className={value === m ? "active" : ""} onClick={() => onChange(m)}>
            {GAME_MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {value === "skins"
          ? "홀마다 단독 최저 타수가 걸린 스킨을 모두 가져가요."
          : "두 명씩 홀마다 타수 차이 × 타당 금액을 주고받아요."}
      </p>
      {value === "skins" && <SkinsRules />}
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
        <li>홀마다 스킨 1개(타당 금액)가 걸려요.</li>
        <li>단독 최저 타수가 그 홀에 쌓인 스킨을 모두 가져가요.</li>
        <li>최저 타수가 2명 이상이면 다음 홀로 이월돼 스킨이 쌓여요.</li>
        <li>맨 마지막 홀 뒤에 남은 스킨은 사라져요.</li>
        <li>배판·버디 추가 정산은 없고, 핸디캡은 따로 정산해요.</li>
        <li>홀 최대 타수는 더블파까지만 반영해요.</li>
      </ul>
    </div>
  );
}

/** 지불 방법 + 핸디캡 정산 시점. 현금 지급은 사전 정산만 가능하다. */
export function PaymentFields({
  payment,
  settle,
  onChange,
}: {
  payment: PaymentMethod;
  settle: SettleTiming;
  onChange: (payment: PaymentMethod, settle: SettleTiming) => void;
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
    </>
  );
}

const CAPS: (number | null)[] = [2, 4, 8, null];

/** 배수 총 상한: 배판 조건 × 이월을 곱한 배수가 이 값을 넘지 않는다. */
export function MaxMultiplierField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
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
        배판 조건과 전원 동타 이월을 곱한 배수가 이 값을 넘지 않아요.
      </p>
      <p className="warn-note">⚠️ 과도한 배수 설정은 인간관계에 지장을 줄 수 있습니다.</p>
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
          <span className="s">3명 이상 같은 스코어면 ×2 (전원 동타 제외 · 3인 플레이는 미적용)</span>
        </div>
        <div className={`switch ${rules.tie ? "on" : ""}`} />
      </div>
      <div className="base-rules">
        <div className="br-title">
          <Icon name="info" size={15} className="inline-ic" /> 기본 룰
        </div>
        <div className="br-group">이월</div>
        <ul>
          <li>전원 동타면 그 홀은 정산 없이 다음 홀로 2배 이월돼요.</li>
          <li>전원 동타가 계속 이어지면 이월도 2배씩 곱해져요.</li>
          <li>맨 마지막 홀 뒤에 남은 이월은 자동으로 사라져요.</li>
          <li>배판 규칙을 모두 끄면 전원 동타 2배 이월만 적용돼요.</li>
        </ul>
        <div className="br-group">배판 계산</div>
        <ul>
          <li>동일한 배판 조건은 홀당 1번씩 세고 인원 수로 곱하지 않아요.</li>
          <li>한 홀에 서로 다른 배판 조건이 겹치면 곱해요.</li>
          <li>
            모든 배수는 <b>총 상한</b>을 넘지 않아요.
          </li>
          <li>버디 배판을 끄면 버디는 1타, 이글은 2타 추가 정산이 적용돼요.</li>
          <li>홀 최대 타수는 더블파까지만 반영해요.</li>
        </ul>
      </div>
    </>
  );
}
