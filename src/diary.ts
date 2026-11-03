import { supabase } from "./supabase";

/*
 * 라운드 일기 · 연습 메모 (내 정보 → 라운드 일기, supabase/diary.sql round_diary).
 * 라운드를 친 날은 라운드마다 일기, 라운드가 없던 날은 그날 연습 메모 하나. 나만 읽고 쓴다.
 * 글이 다 비면(연습한 것도 안 고르면) 행을 지운다
 */

export interface DiaryEntry {
  /** 라운드 일기는 라운드 id, 연습 메모는 practice:YYYY-MM-DD */
  entryKey: string;
  /** YYYY-MM-DD */
  day: string;
  roundId: string | null;
  body: string;
  /** 연습 메모: 연습한 것 */
  tags: string[];
  updatedAt: string;
}

/** 글자 수 상한 (diary.sql 과 같다) */
export const DIARY_MAX = 5000;
/** 연습 메모에서 고르는 연습한 것 */
export const PRACTICE_TAGS = ["드라이버", "우드·유틸", "아이언", "어프로치", "벙커", "퍼팅", "스크린"];

export const practiceKey = (day: string) => `practice:${day}`;
export const isPractice = (e: Pick<DiaryEntry, "entryKey">) => e.entryKey.startsWith("practice:");
export const isEmptyEntry = (e: Pick<DiaryEntry, "body" | "tags">) => !e.body.trim() && e.tags.length === 0;

type Row = {
  entry_key: string;
  day: string;
  round_id: string | null;
  body: string;
  tags: string[] | null;
  updated_at: string;
};
const fromRow = (r: Row): DiaryEntry => ({
  entryKey: r.entry_key,
  day: r.day,
  roundId: r.round_id,
  body: r.body ?? "",
  tags: r.tags ?? [],
  updatedAt: r.updated_at,
});

/** 일기 테이블(diary.sql)을 아직 만들지 않은 DB */
export class DiarySetupError extends Error {}
const isMissingTable = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

/** 이번 실행에서 받은 내 일기 (다시 열 때 바로 보이게) */
let cache: { uid: string; entries: DiaryEntry[] } | null = null;
export const cachedDiary = (uid: string) => (cache?.uid === uid ? cache.entries : null);
const remember = (uid: string, entries: DiaryEntry[]) => {
  cache = { uid, entries };
};

export async function loadDiary(uid: string): Promise<DiaryEntry[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("round_diary")
    .select("entry_key,day,round_id,body,tags,updated_at")
    .eq("user_uid", uid);
  if (error) {
    if (isMissingTable(error)) throw new DiarySetupError("round_diary");
    throw error;
  }
  const entries = ((data as Row[] | null) ?? []).map(fromRow);
  remember(uid, entries);
  return entries;
}

/** 저장 (다 비었으면 지운다). 저장한 모양을 돌려준다 (지웠으면 null) */
export async function saveDiary(
  uid: string,
  e: Pick<DiaryEntry, "entryKey" | "day" | "roundId" | "body" | "tags">
): Promise<DiaryEntry | null> {
  if (!supabase) throw new Error("Supabase가 설정되지 않았습니다.");
  const body = e.body.slice(0, DIARY_MAX);
  let saved: DiaryEntry | null = null;
  if (isEmptyEntry({ body, tags: e.tags })) {
    const { error } = await supabase.from("round_diary").delete().eq("user_uid", uid).eq("entry_key", e.entryKey);
    if (error) throw error;
  } else {
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from("round_diary").upsert(
      {
        user_uid: uid,
        entry_key: e.entryKey,
        day: e.day,
        round_id: e.roundId,
        body,
        tags: e.tags,
        updated_at: updatedAt,
      },
      { onConflict: "user_uid,entry_key" }
    );
    if (error) throw error;
    saved = { ...e, body, updatedAt };
  }
  const rest = (cachedDiary(uid) ?? []).filter((x) => x.entryKey !== e.entryKey);
  remember(uid, saved ? [...rest, saved] : rest);
  return saved;
}
