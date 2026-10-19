import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GameConfig, GameState, HoleScore, ParValue } from "./types";

const STORAGE_KEY = "mentalgame-state-v2";

const emptyState: GameState = {
  config: null,
  started: false,
  holes: [],
  currentHole: 0,
};

function makeHoles(playerIds: string[], count = 18): HoleScore[] {
  return Array.from({ length: count }, () => ({
    par: 4 as ParValue,
    scores: Object.fromEntries(playerIds.map((id) => [id, null])),
  }));
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    return { ...emptyState, ...JSON.parse(raw) };
  } catch {
    return emptyState;
  }
}

interface Ctx {
  state: GameState;
  saveConfig: (config: GameConfig) => void;
  startGame: () => void;
  setPar: (holeIndex: number, par: ParValue) => void;
  setScore: (holeIndex: number, playerId: string, value: number | null) => void;
  goHole: (index: number) => void;
  resetAll: () => void;
  setArchiveId: (id: string) => void;
  loadArchived: (state: Partial<GameState>) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const api = useMemo<Ctx>(
    () => ({
      state,
      saveConfig: (config) =>
        setState((s) => {
          const ids = config.players.map((p) => p.id);
          // 참가자 구성이 바뀌면 홀 스코어 재생성 (게임 시작 전에만 수정 가능)
          const holes =
            s.holes.length > 0 && sameIds(s.holes[0]?.scores, ids)
              ? s.holes
              : makeHoles(ids);
          return { ...s, config, holes };
        }),
      startGame: () => setState((s) => ({ ...s, started: true })),
      setPar: (holeIndex, par) =>
        setState((s) => {
          const holes = s.holes.map((h, i) =>
            i === holeIndex ? { ...h, par } : h
          );
          return { ...s, holes };
        }),
      setScore: (holeIndex, playerId, value) =>
        setState((s) => {
          const holes = s.holes.map((h, i) =>
            i === holeIndex
              ? { ...h, scores: { ...h.scores, [playerId]: value } }
              : h
          );
          return { ...s, holes };
        }),
      goHole: (index) =>
        setState((s) => ({
          ...s,
          currentHole: Math.max(0, Math.min(s.holes.length - 1, index)),
        })),
      resetAll: () => setState(emptyState),
      setArchiveId: (id) => setState((s) => ({ ...s, archiveId: id })),
      loadArchived: (partial) =>
        setState((s) => ({
          ...s,
          started: true,
          currentHole: 0,
          ...partial,
        })),
    }),
    [state]
  );

  return <AppCtx.Provider value={api}>{children}</AppCtx.Provider>;
}

function sameIds(scores: Record<string, unknown> | undefined, ids: string[]) {
  if (!scores) return false;
  const keys = Object.keys(scores);
  return keys.length === ids.length && ids.every((id) => keys.includes(id));
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** 게스트(로컬 store)용 세션 어댑터 */
export function useLocalSession(): import("./types").Session | null {
  const { state, setPar, setScore, goHole } = useApp();
  if (!state.config) return null;
  return {
    config: state.config,
    holes: state.holes,
    currentHole: state.currentHole,
    goHole,
    setPar,
    setScore,
  };
}
