import { useMemo, useState } from "react";
import { useApp } from "../store";
import { useAuth } from "../auth";
import type {
  BetRules,
  GameConfig,
  Gender,
  Player,
  SettleTiming,
} from "../types";
import { uid, won } from "../util";
import { Avatar, Icon } from "../icons";
import { handicapNet } from "../betting";

const UNITS = [1000, 2000, 5000];
const BASE_PAR = 72;

const mkPlayer = (): Player => ({
  id: uid(),
  name: "",
  gender: "male",
  avgScore: 90,
  handicap: 90 - BASE_PAR,
});

const defaultRules: BetRules = { parPenalty: true, tie: false, birdieDouble: false };

export default function SetupScreen({ onSaved }: { onSaved: () => void }) {
  const { state, saveConfig } = useApp();
  const { user } = useAuth();
  const existing = state.config;

  const firstName = (user?.displayName ?? "").split(" ")[0] ?? "";

  const [courseName, setCourseName] = useState(existing?.courseName ?? "");
  const [courseTee, setCourseTee] = useState(existing?.courseTee ?? "");
  const [date, setDate] = useState(
    existing?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [teeTime, setTeeTime] = useState(existing?.teeTime ?? "07:00");

  const [unit, setUnit] = useState(existing?.unit ?? 1000);
  const [customUnit, setCustomUnit] = useState(
    existing && !UNITS.includes(existing.unit) ? String(existing.unit) : ""
  );
  const isCustomUnit = !UNITS.includes(unit);

  const [players, setPlayers] = useState<Player[]>(() => {
    if (existing?.players?.length) return existing.players;
    const first = mkPlayer();
    if (firstName) first.name = firstName;
    return [first, mkPlayer()];
  });
  const [handicapSettle, setHandicapSettle] = useState<SettleTiming>(
    existing?.handicapSettle ?? "post"
  );
  const [overrides, setOverrides] = useState<Record<string, number>>(
    existing?.handicapOverrides ?? {}
  );
  const [rules, setRules] = useState<BetRules>(existing?.rules ?? defaultRules);

  const updatePlayer = (id: string, patch: Partial<Player>) =>
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const addPlayer = () =>
    setPlayers((ps) => (ps.length >= 6 ? ps : [...ps, mkPlayer()]));

  const removePlayer = (id: string) =>
    setPlayers((ps) => (ps.length <= 2 ? ps : ps.filter((p) => p.id !== id)));

  const config: GameConfig = useMemo(
    () => ({
      courseName,
      courseTee,
      date,
      teeTime,
      unit,
      players,
      handicapSettle,
      handicapOverrides: overrides,
      rules,
    }),
    [courseName, courseTee, date, teeTime, unit, players, handicapSettle, overrides, rules]
  );

  const namedCount = players.filter((p) => p.name.trim()).length;
  const canSave = namedCount >= 2 && courseName.trim().length > 0;

  const preSettle = useMemo(() => handicapNet(config), [config]);

  // 주는 사람이 항상 왼쪽. 금액만 표시.
  const pairs = useMemo(() => {
    const out: {
      key: string;
      payer: Player;
      receiver: Player;
      magnitude: number;
    }[] = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const key = `${a.id}->${b.id}`;
        const diff =
          overrides[key] != null ? overrides[key] : b.handicap - a.handicap;
        // diff>0 → a가 지급(잘 침), diff<0 → b가 지급
        const payer = diff >= 0 ? a : b;
        const receiver = diff >= 0 ? b : a;
        out.push({ key, payer, receiver, magnitude: Math.abs(diff) });
      }
    }
    return out;
  }, [players, overrides]);

  const setPairMagnitude = (key: string, mag: number) => {
    const [aId, bId] = key.split("->");
    const a = players.find((p) => p.id === aId)!;
    const b = players.find((p) => p.id === bId)!;
    const diff =
      overrides[key] != null ? overrides[key] : b.handicap - a.handicap;
    const sign = diff < 0 ? -1 : 1;
    setOverrides((o) => ({ ...o, [key]: sign * Math.max(0, mag) }));
  };

  return (
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
        <div className="field">
          <label>코스</label>
          <input
            className="input"
            placeholder="예) OUT 코스"
            value={courseTee}
            onChange={(e) => setCourseTee(e.target.value)}
          />
        </div>
        <div className="row2">
          <div className="field">
            <label>날짜</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>티오프 시간</label>
            <input
              className="input"
              type="time"
              value={teeTime}
              onChange={(e) => setTeeTime(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="section-title">타당 금액</div>
      <div className="card">
        <div className="chips">
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
              type="number"
              inputMode="numeric"
              placeholder="금액 입력 (원)"
              value={customUnit}
              onChange={(e) => {
                setCustomUnit(e.target.value);
                setUnit(Number(e.target.value) || 0);
              }}
            />
          </div>
        )}
        <p className="warn-note">
          ⚠️ 과도한 금액 설정은 인간관계에 지장을 줄 수 있습니다.
        </p>
      </div>

      <div className="section-title">참여자 · 핸디</div>
      <div className="card">
        {players.map((p) => (
          <div className="player-card" key={p.id}>
            <div className="player-top">
              <Avatar photoUrl={p.photoUrl} gender={p.gender} size={30} />
              <input
                className="name-input"
                placeholder="이름"
                value={p.name}
                onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
              />
              <div className="gender-seg">
                {(["male", "female"] as Gender[]).map((g) => (
                  <button
                    key={g}
                    className={p.gender === g ? "active" : ""}
                    onClick={() => updatePlayer(p.id, { gender: g })}
                  >
                    {g === "male" ? "남" : "여"}
                  </button>
                ))}
              </div>
              {players.length > 2 && (
                <button className="del-btn" onClick={() => removePlayer(p.id)}>
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
            <div className="player-bottom">
              <div className="avg-box">
                <div className="cap">평균타수</div>
                <input
                  type="number"
                  inputMode="numeric"
                  value={p.avgScore}
                  onChange={(e) => {
                    const avg = Number(e.target.value) || 0;
                    updatePlayer(p.id, { avgScore: avg, handicap: avg - BASE_PAR });
                  }}
                />
              </div>
              <div className="hcap-box">
                <div className="cap">핸디캡 (평균−72)</div>
                <div className="stepper">
                  <button
                    onClick={() =>
                      updatePlayer(p.id, { handicap: p.handicap - 1 })
                    }
                  >
                    −
                  </button>
                  <span className="hval">{p.handicap}</span>
                  <button
                    onClick={() =>
                      updatePlayer(p.id, { handicap: p.handicap + 1 })
                    }
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {players.length < 6 && (
          <button className="add-player" onClick={addPlayer}>
            + 참여자 추가
          </button>
        )}
      </div>

      <div className="section-title">핸디캡 정산</div>
      <div className="card">
        <div className="segmented" style={{ marginBottom: 14 }}>
          <button
            className={handicapSettle === "pre" ? "active" : ""}
            onClick={() => setHandicapSettle("pre")}
          >
            사전 정산
          </button>
          <button
            className={handicapSettle === "post" ? "active" : ""}
            onClick={() => setHandicapSettle("post")}
          >
            사후 정산
          </button>
        </div>
        <div className="hc-row head">
          <span style={{ textAlign: "right" }}>주는 사람</span>
          <span />
          <span>받는 사람</span>
          <span style={{ textAlign: "center" }}>핸디차</span>
          <span style={{ textAlign: "right" }}>금액</span>
        </div>
        {pairs.map(({ key, payer, receiver, magnitude }) => (
          <div className="hc-row" key={key}>
            <span className="payer">{payer.name || "?"}</span>
            <span className="arrow-c">→</span>
            <span className="recv">{receiver.name || "?"}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={magnitude}
              onChange={(e) =>
                setPairMagnitude(key, Number(e.target.value) || 0)
              }
            />
            <span className="money">{won(magnitude * unit)}</span>
          </div>
        ))}
        <p className="hint" style={{ marginTop: 10 }}>
          핸디가 낮은(잘 치는) 사람이 왼쪽입니다.{" "}
          {handicapSettle === "pre"
            ? "사전 정산: 라운드 전에 아래 금액을 주고받습니다."
            : "사후 정산: 최종 결과에 합산됩니다."}
        </p>
      </div>

      {handicapSettle === "pre" && (
        <>
          <div className="section-title">사전 정산 (인별 최소 송금)</div>
          {preSettle.transfers.length === 0 ? (
            <div className="card">
              <div className="empty-note">주고받을 핸디 정산이 없습니다.</div>
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {preSettle.transfers.map((t, i) => {
                const from = players.find((p) => p.id === t.fromId)!;
                const to = players.find((p) => p.id === t.toId)!;
                return (
                  <div className="transfer" key={i}>
                    <span className="from">
                      <Avatar photoUrl={from.photoUrl} gender={from.gender} size={22} />
                      {from.name || "?"}
                    </span>
                    <span className="arrow">
                      <Icon name="chevronRight" size={16} />
                    </span>
                    <span className="to">
                      <Avatar photoUrl={to.photoUrl} gender={to.gender} size={22} />
                      {to.name || "?"}
                    </span>
                    <span className="amt">{won(t.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <div className="section-title">배판 규칙</div>
      <div className="card">
        <RuleToggle
          title="파 페널티 배판 (동시 규칙)"
          sub="파3 더블보기+ · 파4·5 트리플보기+ 이면 배판 (항상 함께 적용)"
          on={rules.parPenalty}
          onToggle={() => setRules((r) => ({ ...r, parPenalty: !r.parPenalty }))}
        />
        <RuleToggle
          title="버디 배판"
          sub="버디(-1) 이상이 나온 홀은 배판 (버디 한 타 추가 정산은 미적용)"
          on={rules.birdieDouble}
          onToggle={() => setRules((r) => ({ ...r, birdieDouble: !r.birdieDouble }))}
        />
        <RuleToggle
          title="동타 배판"
          sub={`${players.length <= 3 ? "2명" : "3명"} 이상 같은 스코어면 배판`}
          on={rules.tie}
          onToggle={() => setRules((r) => ({ ...r, tie: !r.tie }))}
        />
        <p className="hint" style={{ marginTop: 10 }}>
          <Icon name="birdie" size={13} className="inline-ic" /> 배판은 서로 중복되지
          않고 <b>최대 2배</b>까지만 적용됩니다. 버디 배판을 끄면 <b>버디 시 한 타 추가
          정산</b>이 적용돼요. 전원 동타 홀은 다음 홀로 이월되어 배판이 됩니다.
        </p>
      </div>

      <div className="actionbar">
        <button
          className="btn-primary"
          disabled={!canSave}
          onClick={() => {
            saveConfig(config);
            onSaved();
          }}
        >
          {canSave ? "저장하고 시작 준비" : "골프장·참여자 2명 이상 입력"}
        </button>
      </div>
    </div>
  );
}

function RuleToggle({
  title,
  sub,
  on,
  onToggle,
}: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="toggle-row" onClick={onToggle}>
      <div className="tinfo">
        <span className="t">{title}</span>
        <span className="s">{sub}</span>
      </div>
      <div className={`switch ${on ? "on" : ""}`} />
    </div>
  );
}
