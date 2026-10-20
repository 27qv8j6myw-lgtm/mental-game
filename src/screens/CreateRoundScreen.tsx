import { useState } from "react";
import type {
  BetRules,
  GameMode,
  HandicapMode,
  PaymentMethod,
  SettleTiming,
  SkinsRules,
} from "../types";
import { DEFAULT_SKINS_RULES, localDate, localTime, won } from "../util";
import { createRound } from "../rounds";
import { useAuth } from "../auth";
import { useRound } from "../round";
import { Icon } from "../icons";
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
    "방장이 대기실에서 최저핸디 인원을 정하고, 나머지는 그보다 몇 타를 받을지(+5·+10·직접 입력) 고릅니다. 최저핸디 인원을 정해야 시작할 수 있어요.",
  adjust:
    "방장이 대기실에서 사람마다 파4·파5 홀당 잡아줄 타수(0·1·2타)를 정해요. 보기 이상일 때만 빼주고 파 아래로는 내려가지 않아요. 핸디캡 금액 정산은 없어요.",
};

export default function CreateRoundScreen({ onCancel }: { onCancel: () => void }) {
  const { user } = useAuth();
  const { openRound } = useRound();

  const [courseName, setCourseName] = useState("");
  const [date, setDate] = useState(() => localDate());
  const [teeTime, setTeeTime] = useState(() => localTime());
  const [unit, setUnit] = useState(1000);
  const [customUnit, setCustomUnit] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>("stroke");
  const [skinsRules, setSkinsRules] = useState<SkinsRules>(DEFAULT_SKINS_RULES);
  const [payment, setPayment] = useState<PaymentMethod>("transfer");
  const [handicapSettle, setHandicapSettle] = useState<SettleTiming>("post");
  const [handicapMode, setHandicapMode] = useState<HandicapMode>("avg");
  const [rules, setRules] = useState<BetRules>({
    parPenalty: true,
    doublePar: false,
    tie: false,
    birdieDouble: false,
    maxMultiplier: 2,
  });

  const [holeCount, setHoleCount] = useState(18);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isCustomUnit = !UNITS.includes(unit);
  const canSave = courseName.trim().length > 0 && unit > 0;

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const round = await createRound({
        courseName,
        date,
        teeTime,
        unit,
        rules: {
          ...rules,
          payment,
          handicapMode,
          gameMode,
          ...(gameMode === "skins" && { skins: skinsRules }),
        },
        handicapSettle,
        holeCount,
        me: {
          name: user?.displayName?.trim() || "나",
          gender: "male",
          avgScore: null,
          handicap: 0,
        },
      });
      openRound(round.id);
    } catch (e) {
      console.error(e);
      setErr("라운드 생성에 실패했어요. 잠시 후 다시 시도해 주세요.");
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
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>
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
        </div>

        <div className="section-title">게임 방식</div>
        <div className="card">
          <GameModeField value={gameMode} onChange={setGameMode} />
        </div>

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
            ⚠️ 과도한 금액 설정은 인간관계에 지장을 줄 수 있습니다.
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
            <div className="section-title">배수 총 상한</div>
            <div className="card">
              <MaxMultiplierField
                value={rules.maxMultiplier ?? null}
                onChange={(v) => setRules((r) => ({ ...r, maxMultiplier: v }))}
              />
            </div>

            <div className="section-title">배판 규칙</div>
            <div className="card">
              <RuleToggles rules={rules} onChange={setRules} />
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
          {busy ? "생성 중…" : "라운드 만들고 코드 받기"}
        </button>
      </div>
    </div>
  );
}
