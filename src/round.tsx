import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { bundleConfig, bundleHoles } from "./model";
import {
  getRoundBundle,
  leaveOrDeleteRound,
  setPar as apiSetPar,
  setRoundStatus,
  setScore as apiSetScore,
  subscribeRound,
  updateMyPlayer,
  updateRound as apiUpdateRound,
  type RoundBundle,
} from "./rounds";
import type {
  GameConfig,
  HoleScore,
  ParValue,
  RoundPlayerRow,
  RoundRow,
  RoundStatus,
  Session,
} from "./types";

type PlayerPatch = Partial<
  Pick<
    RoundPlayerRow,
    | "name"
    | "gender"
    | "avg_score"
    | "handicap"
    | "photo_url"
    | "is_guest"
    | "bank_name"
    | "bank_account"
  >
>;
type RoundPatch = Partial<Pick<RoundRow, "rules" | "handicap_settle">>;

interface RoundCtx {
  activeRoundId: string | null;
  bundle: RoundBundle | null;
  loading: boolean;
  myUid: string | null;
  isHost: boolean;
  status: RoundStatus | null;
  session: Session | null;
  openRound: (id: string) => void;
  closeRound: () => void;
  refresh: () => Promise<void>;
  updateMe: (patch: PlayerPatch) => Promise<void>;
  /** 방장 전용: 규칙·핸디 정산 시점·기준 인원·핸디 수정 */
  updateRound: (patch: RoundPatch) => Promise<void>;
  start: () => Promise<void>;
  finish: () => Promise<void>;
  leave: () => Promise<void>;
}

const Ctx = createContext<RoundCtx | null>(null);

/** 화면이 꺼졌다 켜지며 페이지가 새로 로드돼도 보던 라운드로 돌아오게 한다. */
const ACTIVE_KEY = "mentalgame-active-round";

const readActive = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};
const writeActive = (id: string | null) => {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* 저장소를 쓸 수 없는 환경: 새로고침 시 홈으로 돌아갈 뿐 */
  }
};

/** 마지막으로 스코어가 입력된 홀: 전원 입력이 끝났으면 다음 홀, 아니면 그 홀 */
function resumeHole(b: RoundBundle): number {
  const last = b.scores.reduce((m, s) => Math.max(m, s.hole_index), -1);
  if (last < 0) return 0;
  const complete = b.players.every((p) =>
    b.scores.some((s) => s.hole_index === last && s.player_uid === p.user_uid)
  );
  return Math.min(b.round.hole_count - 1, complete ? last + 1 : last);
}

export function RoundProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useAuth();
  const myUid = user?.uid ?? null;
  const [activeRoundId, setActiveRoundId] = useState<string | null>(readActive);
  const [bundle, setBundle] = useState<RoundBundle | null>(null);
  const [loading, setLoading] = useState(() => readActive() !== null);
  const [currentHole, setCurrentHole] = useState(0);
  const activeRef = useRef(activeRoundId);
  const resumedFor = useRef<string | null>(null);

  const openRound = useCallback((id: string) => {
    activeRef.current = id;
    resumedFor.current = null;
    writeActive(id);
    setActiveRoundId(id);
    setBundle(null);
    setCurrentHole(0);
    setLoading(true);
  }, []);

  const closeRound = useCallback(() => {
    activeRef.current = null;
    resumedFor.current = null;
    writeActive(null);
    setActiveRoundId(null);
    setBundle(null);
    setCurrentHole(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "signed-out") closeRound();
  }, [mode, closeRound]);

  // 진행 중인 조회가 있으면 끝난 뒤 한 번 더 조회한다. (건너뛰면 마지막 변경이 화면에 반영되지 않음)
  const fetching = useRef(false);
  const fetchAgain = useRef(false);
  const refresh = useCallback(async () => {
    if (fetching.current) {
      fetchAgain.current = true;
      return;
    }
    fetching.current = true;
    try {
      do {
        fetchAgain.current = false;
        const id = activeRef.current;
        if (!id) break;
        try {
          const b = await getRoundBundle(id);
          if (activeRef.current === id) setBundle(b);
        } catch (e) {
          console.error("라운드 조회 실패", e);
        }
      } while (fetchAgain.current);
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    if (!activeRoundId) return;
    let alive = true;
    getRoundBundle(activeRoundId)
      .then((b) => {
        if (alive) setBundle(b);
      })
      .catch((e) => {
        console.error("라운드 조회 실패", e);
        // 삭제됐거나 더 이상 참여자가 아닌 라운드: 홈으로
        if (alive && e?.code === "PGRST116") closeRound();
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const unsub = subscribeRound(activeRoundId, () => {
      void refresh();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [activeRoundId, refresh, closeRound]);

  useEffect(() => {
    if (!bundle || resumedFor.current === bundle.round.id) return;
    resumedFor.current = bundle.round.id;
    setCurrentHole(resumeHole(bundle));
  }, [bundle]);

  const isHost = !!bundle && !!myUid && bundle.round.host_uid === myUid;
  const status = bundle?.round.status ?? null;

  // 내 참가자 정보 쓰기는 순서대로 보낸다. 동시에 보내면 늦게 도착한 이전 값이 덮어쓸 수 있다.
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const updateMe = useCallback(
    (patch: PlayerPatch) => {
      const roundId = activeRef.current;
      if (!roundId || !myUid) return Promise.resolve();
      setBundle((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((p) =>
                p.user_uid === myUid ? { ...p, ...patch } : p
              ),
            }
          : prev
      );
      const run = writeQueue.current.then(() => updateMyPlayer(roundId, myUid, patch));
      writeQueue.current = run.catch(() => {});
      return run;
    },
    [myUid]
  );

  const roundQueue = useRef<Promise<unknown>>(Promise.resolve());
  const updateRound = useCallback(
    (patch: RoundPatch) => {
      const roundId = activeRef.current;
      if (!roundId) return Promise.resolve();
      setBundle((prev) => (prev ? { ...prev, round: { ...prev.round, ...patch } } : prev));
      const run = roundQueue.current.then(() => apiUpdateRound(roundId, patch));
      roundQueue.current = run.catch(() => {});
      run.catch((e) => {
        console.error(e);
        void refresh();
      });
      return run;
    },
    [refresh]
  );

  // 로그인 사용자: 내 참가자 정보에 프로필 사진/이름 자동 동기화.
  // 익명(게스트) 사용자: is_guest 플래그를 표시.
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bundle || !myUid || !user) return;
    const me = bundle.players.find((p) => p.user_uid === myUid);
    if (!me) return;
    const key = `${bundle.round.id}:${myUid}`;
    if (syncedRef.current === key) return;
    syncedRef.current = key;

    const patch: PlayerPatch = {};
    if (user.isAnonymous) {
      if (!me.is_guest) patch.is_guest = true;
    } else {
      if (user.photoURL && me.photo_url !== user.photoURL) patch.photo_url = user.photoURL;
      if (user.displayName && (!me.name || me.name === "나")) patch.name = user.displayName;
    }
    if (Object.keys(patch).length > 0) {
      updateMe(patch).catch((e) => console.error("프로필 동기화 실패", e));
    }
  }, [bundle, myUid, user, updateMe]);

  // 계좌이체 라운드: 내 계좌가 비어 있으면 계정에 저장해 둔 계좌로 채운다
  const bankSyncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!bundle || !myUid || !user?.bank) return;
    const r = bundle.round;
    const payment = r.rules.payment ?? (r.handicap_settle === "pre" ? "cash" : "transfer");
    if (payment !== "transfer") return;
    const me = bundle.players.find((p) => p.user_uid === myUid);
    if (!me || me.bank_account) return;
    const key = `${r.id}:${myUid}`;
    if (bankSyncedRef.current === key) return;
    bankSyncedRef.current = key;
    updateMe({ bank_name: user.bank.name, bank_account: user.bank.account }).catch((e) =>
      console.error("계좌 자동 입력 실패", e)
    );
  }, [bundle, myUid, user, updateMe]);

  // ---- derive config + holes ----
  const config = useMemo<GameConfig | null>(() => (bundle ? bundleConfig(bundle) : null), [bundle]);
  const holes = useMemo<HoleScore[]>(() => (bundle ? bundleHoles(bundle) : []), [bundle]);

  // ---- optimistic mutations ----
  const setScore = useCallback(
    (holeIndex: number, playerId: string, value: number | null) => {
      if (!activeRoundId) return;
      // 종료된 라운드는 방장만 수정 가능
      if (bundle?.round.status === "done" && bundle.round.host_uid !== myUid) return;
      setBundle((prev) => {
        if (!prev) return prev;
        const rest = prev.scores.filter(
          (s) => !(s.hole_index === holeIndex && s.player_uid === playerId)
        );
        const scores =
          value === null
            ? rest
            : [...rest, { hole_index: holeIndex, player_uid: playerId, rel: value }];
        return { ...prev, scores };
      });
      apiSetScore(activeRoundId, holeIndex, playerId, value).catch((e) => {
        console.error(e);
        void refresh();
      });
    },
    [activeRoundId, refresh, bundle, myUid]
  );

  const setPar = useCallback(
    (holeIndex: number, par: ParValue) => {
      if (!activeRoundId) return;
      if (bundle?.round.status === "done" && bundle.round.host_uid !== myUid) return;
      setBundle((prev) => {
        if (!prev) return prev;
        const rest = prev.holes.filter((h) => h.hole_index !== holeIndex);
        return { ...prev, holes: [...rest, { hole_index: holeIndex, par }] };
      });
      apiSetPar(activeRoundId, holeIndex, par).catch((e) => {
        console.error(e);
        void refresh();
      });
    },
    [activeRoundId, refresh, bundle, myUid]
  );

  const session = useMemo<Session | null>(() => {
    if (!config || !status) return null;
    return {
      config,
      holes,
      currentHole,
      goHole: (i) =>
        setCurrentHole(Math.max(0, Math.min((bundle?.round.hole_count ?? 18) - 1, i))),
      setPar,
      setScore,
      status,
      isHost,
    };
  }, [config, holes, currentHole, setPar, setScore, status, isHost, bundle]);

  const start = useCallback(async () => {
    if (!activeRoundId) return;
    await setRoundStatus(activeRoundId, "playing");
    await refresh();
  }, [activeRoundId, refresh]);

  const finish = useCallback(async () => {
    if (!activeRoundId) return;
    await setRoundStatus(activeRoundId, "done");
    await refresh();
  }, [activeRoundId, refresh]);

  const leave = useCallback(async () => {
    if (!activeRoundId || !myUid) return;
    await leaveOrDeleteRound(activeRoundId, myUid, isHost);
    closeRound();
  }, [activeRoundId, myUid, isHost, closeRound]);

  const value: RoundCtx = {
    activeRoundId,
    bundle,
    loading,
    myUid,
    isHost,
    status,
    session,
    openRound,
    closeRound,
    refresh,
    updateMe,
    updateRound,
    start,
    finish,
    leave,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRound() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRound must be used within RoundProvider");
  return ctx;
}
