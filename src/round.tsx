import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "./auth";
import { bundleConfig, bundleHoleStats, bundleHoles, firstUnsaved, usesHoleSave } from "./model";
import {
  applyOp,
  clearPending,
  pendingHoleKey,
  queueSave,
  setPendingUser,
  subscribeHoleRejections,
  subscribePending,
  waitingCount,
  withPending,
  type SaveOp,
} from "./pending";
import {
  getRoundBundle,
  leaveOrDeleteRound,
  setRoundStatus,
  subscribeRound,
  updateMyPlayer,
  updateRound as apiUpdateRound,
  type RoundBundle,
} from "./rounds";
import type {
  GameConfig,
  HoleScore,
  HoleStat,
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
type RoundPatch = Partial<Pick<RoundRow, "rules" | "handicap_settle" | "unit" | "hole_count">>;

interface RoundCtx {
  activeRoundId: string | null;
  bundle: RoundBundle | null;
  loading: boolean;
  myUid: string | null;
  isHost: boolean;
  status: RoundStatus | null;
  session: Session | null;
  openRound: (id: string) => void;
  /** 라운드 화면 닫기. forget 이면 보관해 둔 화면 데이터도 지운다 */
  closeRound: (forget?: boolean) => void;
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

/** 보던 라운드의 마지막 화면 데이터. 통신이 없는 골프장에서 앱을 다시 열어도 바로 보여준다 */
const CACHE_KEY = "mentalgame-round-cache";

const readCache = (id: string): RoundBundle | null => {
  try {
    const b = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as RoundBundle | null;
    return b?.round?.id === id ? b : null;
  } catch {
    return null;
  }
};
const writeCache = (b: RoundBundle | null) => {
  try {
    if (b) localStorage.setItem(CACHE_KEY, JSON.stringify(b));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* 저장소를 쓸 수 없는 환경: 오프라인으로 다시 열면 불러올 때까지 기다릴 뿐 */
  }
};

/**
 * 라운드를 열 때 보여줄 홀.
 * 홀 저장 방식: 저장 안 된 첫 홀 (모두 저장됐으면 마지막 홀) — 모든 참여자가 같은 홀에서 시작한다.
 * 기록 모드·예전 라운드: 마지막으로 스코어가 입력된 홀 (전원 입력이 끝났으면 다음 홀)
 */
function resumeHole(b: RoundBundle): number {
  if (usesHoleSave(b.round)) {
    const i = firstUnsaved(bundleHoles(b));
    return i < 0 ? b.round.hole_count - 1 : i;
  }
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

  /**
   * 라운드 화면 닫기 (홈으로). 마지막으로 받은 화면 데이터는 남겨 둔다:
   * 통신이 없을 때 홈에서 다시 열어도 바로 보이게. forget 이면 지운다 (로그아웃·삭제·나가기)
   */
  const closeRound = useCallback((forget = false) => {
    activeRef.current = null;
    resumedFor.current = null;
    writeActive(null);
    if (forget) writeCache(null);
    setActiveRoundId(null);
    setBundle(null);
    setCurrentHole(0);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (mode === "signed-out") closeRound(true);
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
          if (activeRef.current === id) setBundle(withPending(b));
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
    // 마지막으로 받은 데이터를 먼저 보여주고, 서버에서 받으면 바꾼다
    const cached = readCache(activeRoundId);
    if (cached) {
      setBundle(withPending(cached));
      setLoading(false);
    }
    getRoundBundle(activeRoundId)
      .then((b) => {
        if (alive) setBundle(withPending(b));
      })
      .catch((e) => {
        console.error("라운드 조회 실패", e);
        // 삭제됐거나 더 이상 참여자가 아닌 라운드: 홈으로
        if (alive && e?.code === "PGRST116") closeRound(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const unsub = subscribeRound(activeRoundId, () => {
      void refresh();
    });
    // 다시 연결되거나 앱이 다시 보이면 다시 불러온다.
    // 오프라인으로 열어 못 불러온 라운드, 꺼져 있던 사이 놓친 다른 사람의 입력을 받는다
    const reload = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [activeRoundId, refresh, closeRound]);

  // 화면에 보이는 그대로(내가 입력한 값 포함) 보관해 두었다가 오프라인으로 다시 열 때 쓴다
  useEffect(() => {
    if (bundle && bundle.round.id === activeRef.current) writeCache(bundle);
  }, [bundle]);

  // 저장 대기열: 로그인한 뒤에만 보내고, 밀려 있던 기록을 다 보내면 서버 값으로 다시 맞춘다
  // (끊긴 사이 다른 사람이 입력한 스코어도 함께 받는다)
  useEffect(() => setPendingUser(myUid), [myUid]);
  useEffect(
    () =>
      subscribePending((recovered) => {
        if (recovered && recovered === activeRef.current) void refresh();
      }),
    [refresh]
  );
  const pendingSaves = useSyncExternalStore(subscribePending, () => waitingCount(activeRoundId));
  const pendingHoleStr = useSyncExternalStore(subscribePending, () => pendingHoleKey(activeRoundId));
  const pendingHoles = useMemo(
    () => new Set(pendingHoleStr ? pendingHoleStr.split(",").map(Number) : []),
    [pendingHoleStr]
  );

  // 알림 한 줄: 내 홀 저장이 거절됐을 때 등
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setNotice(null), [activeRoundId]);
  // 알림은 잠시 보여주고 사라진다 (X 로 바로 닫을 수도 있다)
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 10_000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(
    () =>
      subscribeHoleRejections((r) => {
        if (r.roundId !== activeRef.current) return;
        setNotice(
          r.reason === "conflict"
            ? `${r.hole + 1}번 홀은 다른 사람이 먼저 저장·수정해서 내 저장은 반영되지 않았어요. 저장된 스코어를 확인해 주세요`
            : r.reason === "locked"
            ? `${r.hole + 1}번 홀은 연결이 끊긴 사이 저장돼서, 이 폰에서 넣은 점수는 반영되지 않았어요`
            : `${r.hole + 1}번 홀 저장이 거절됐어요. 저장된 스코어를 확인해 주세요`
        );
        void refresh();
      }),
    [refresh]
  );

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
    if (r.rules.gameMode === "record") return;
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
  const holeStats = useMemo(() => (bundle ? bundleHoleStats(bundle) : []), [bundle]);

  // ---- optimistic mutations ----
  // 화면에 먼저 반영하고 저장 대기열(기기에 보관)을 거쳐 보낸다. 실패하면 대기열에 남아 나중에 다시 보낸다
  const save = useCallback(
    (op: SaveOp) => {
      if (!activeRoundId || !bundle) return;
      const isRecord = bundle.round.rules.gameMode === "record";
      // 상세 기록(퍼트·티샷 등)은 돈과 상관없어 게임 방식·종료와 상관없이 본인 것만
      if (op.kind === "stat") {
        if (op.player !== myUid) return;
      }
      // 기록 모드: 각자 자기 스코어·기록만 (파는 누구나), 종료 뒤에도 고칠 수 있다
      else if (isRecord) {
        if (op.kind === "hole") return;
        if (op.kind !== "par" && op.player !== myUid) return;
        if (op.kind === "par" && bundle.round.status === "done" && bundle.round.host_uid !== myUid)
          return;
      }
      // 내기 라운드 홀 저장: 라운드 중엔 누구나, 종료 후엔 방장만
      else if (op.kind === "hole") {
        if (bundle.round.status === "lobby") return;
        if (bundle.round.status === "done" && bundle.round.host_uid !== myUid) return;
      }
      // 내기 라운드 스코어·파 바로 입력: 진행 중, 아직 저장 안 된 홀만 (저장된 홀·종료 후엔 홀 저장으로만 고친다)
      else {
        if (bundle.round.status === "done") return;
        const row = bundle.holes.find((h) => h.hole_index === op.hole);
        if (usesHoleSave(bundle.round) && row?.saved_at) return;
      }
      setBundle((prev) => (prev ? applyOp(prev, op) : prev));
      queueSave(activeRoundId, op);
    },
    [activeRoundId, bundle, myUid]
  );

  const setScore = useCallback(
    (holeIndex: number, playerId: string, value: number | null) =>
      save({ kind: "score", hole: holeIndex, player: playerId, rel: value }),
    [save]
  );

  const setPar = useCallback(
    (holeIndex: number, par: ParValue) => save({ kind: "par", hole: holeIndex, par }),
    [save]
  );

  const setStat = useCallback(
    (holeIndex: number, playerId: string, stat: HoleStat) =>
      save({ kind: "stat", hole: holeIndex, player: playerId, stat }),
    [save]
  );

  const saveHole = useCallback(
    (
      holeIndex: number,
      par: ParValue,
      scores: Record<string, number>,
      items: string[],
      baseVersion?: number
    ) => {
      if (!bundle || !myUid) return;
      const row = bundle.holes.find((h) => h.hole_index === holeIndex);
      save({
        kind: "hole",
        hole: holeIndex,
        par,
        scores,
        baseVersion: baseVersion ?? row?.version ?? 0,
        items,
        by: myUid,
      });
    },
    [bundle, myUid, save]
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
      holeStats,
      setStat,
      holeSave: !!bundle && usesHoleSave(bundle.round),
      saveHole,
      pendingHoles,
      status,
      isHost,
      pendingSaves,
      notice,
      setNotice,
    };
  }, [
    config,
    holes,
    holeStats,
    currentHole,
    setPar,
    setScore,
    setStat,
    saveHole,
    pendingHoles,
    status,
    isHost,
    bundle,
    pendingSaves,
    notice,
  ]);

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
    clearPending(activeRoundId);
    closeRound(true);
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
