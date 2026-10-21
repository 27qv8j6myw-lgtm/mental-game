/*
 * 저장 안 한 초안 보관 (홀 수정·내 기록·기록 모드 홀 입력)
 * 폰이 잠기거나 앱이 백그라운드에서 다시 띄워져도 입력하던 내용이 남게 기기에 적어 둔다.
 * 초안은 한 번에 하나만 열 수 있어서(열려 있으면 다른 곳으로 못 감) 하나만 보관한다.
 */

export type DraftKind = "edit" | "rec" | "record";

export interface StoredDraft {
  roundId: string;
  kind: DraftKind;
  hole: number;
  /** 홀 수정: 수정을 시작할 때 그 홀의 version (그 사이 다른 사람이 고쳤는지 확인) */
  version?: number;
  data: unknown;
  /** 적은 때 (오래된 초안은 버린다) */
  at: number;
}

const KEY = "mentalgame-draft";
/** 이보다 오래된 초안은 버린다 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function saveDraft(d: Omit<StoredDraft, "at">) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, at: Date.now() }));
  } catch {
    /* 저장소를 쓸 수 없으면 보관하지 않는다 */
  }
}

export function loadDraft(roundId: string | null): StoredDraft | null {
  if (!roundId) return null;
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as StoredDraft | null;
    if (!d || d.roundId !== roundId) return null;
    if (Date.now() - d.at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

/** 이 라운드의 초안을 지운다 (저장·취소했을 때) */
export function clearDraft(roundId: string | null) {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null") as StoredDraft | null;
    if (d && (!roundId || d.roundId === roundId)) localStorage.removeItem(KEY);
  } catch {
    /* 무시 */
  }
}
