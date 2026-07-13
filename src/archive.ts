import { supabase } from "./supabase";
import type { GameConfig, HoleScore } from "./types";

export interface ArchivedGame {
  id: string;
  ownerUid: string;
  config: GameConfig;
  holes: HoleScore[];
  createdAt: number;
}

const TABLE = "games";

interface Row {
  id: string;
  owner_uid: string;
  config: GameConfig;
  holes: HoleScore[];
  created_at: string;
}

const fromRow = (r: Row): ArchivedGame => ({
  id: r.id,
  ownerUid: r.owner_uid,
  config: r.config,
  holes: r.holes,
  createdAt: new Date(r.created_at).getTime(),
});

/** 현재 게임을 아카이브에 저장(신규/갱신) 하고 문서 id 를 반환 */
export async function saveGame(
  ownerUid: string,
  config: GameConfig,
  holes: HoleScore[],
  existingId?: string
): Promise<string> {
  if (!supabase) throw new Error("not configured");

  if (existingId) {
    const { error } = await supabase
      .from(TABLE)
      .update({ config, holes })
      .eq("id", existingId);
    if (error) throw error;
    return existingId;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ owner_uid: ownerUid, config, holes })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** 본인(ownerUid)이 만든 게임 목록 */
export async function listGames(ownerUid: string): Promise<ArchivedGame[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("owner_uid", ownerUid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export async function deleteGame(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
