/*
 * 아마추어가 자주 틀리는 골프 룰 (골프 규칙 2023년판, R&A·USGA).
 * 자세한 설명·그림은 RulesScreen 에 있다 (처음 열 때 따로 받는다).
 * 순서는 한 홀을 치는 순서대로: 티샷 → OB·분실 → 공 다루기 → 페널티 구역 → 구제 → 벙커 → 그린 → 그 밖
 */

export type PenaltyTone = "free" | "one" | "two" | "info";

export interface Rule {
  id: string;
  /** 쪽 제목 */
  title: string;
  /** 홈 카드 한 줄 */
  short: string;
  /** 쪽 첫 문장 */
  lead: string;
  penalty: { label: string; tone: PenaltyTone };
  /** 골프 규칙 번호 */
  ref: string;
}

export const RULES: Rule[] = [
  {
    id: "tee",
    title: "티샷 위치",
    short: "티 마커 선보다 앞에서 치면 2벌타",
    lead: "티샷은 티잉 구역 안에서 쳐야 해요.",
    penalty: { label: "2벌타", tone: "two" },
    ref: "6.1b",
  },
  {
    id: "ob",
    title: "OB",
    short: "찾아도 못 치고, 친 곳에서 다시",
    lead: "OB로 나간 공은 찾아도 칠 수 없어요.",
    penalty: { label: "1벌타", tone: "one" },
    ref: "18.2",
  },
  {
    id: "provisional",
    title: "잠정구",
    short: "\"잠정구 칠게요\"라고 꼭 말하기",
    lead: "OB나 분실이 걱정되면 잠정구를 쳐요.",
    penalty: { label: "말하고 치기", tone: "info" },
    ref: "18.3",
  },
  {
    id: "provisional-play",
    title: "잠정구가 내 공이 될 때",
    short: "원구보다 앞에서 치면 원구는 끝",
    lead: "잠정구가 내 공이 되면 원구는 찾아도 칠 수 없어요.",
    penalty: { label: "1벌타", tone: "one" },
    ref: "18.3c",
  },
  {
    id: "search",
    title: "공 찾기",
    short: "찾는 시간은 3분까지",
    lead: "공을 찾는 시간은 3분이에요.",
    penalty: { label: "3분", tone: "info" },
    ref: "18.2a",
  },
  {
    id: "wrong-ball",
    title: "다른 사람 공",
    short: "잘못 치면 2벌타, 내 공으로 다시",
    lead: "다른 사람 공을 치면 2벌타예요.",
    penalty: { label: "2벌타", tone: "two" },
    ref: "6.3c",
  },
  {
    id: "ball-moved",
    title: "공이 움직였을 때",
    short: "누가 움직였는지에 따라 달라요",
    lead: "공이 움직이면 누가 움직였는지부터 봐요.",
    penalty: { label: "0·1벌타", tone: "one" },
    ref: "9.3·9.4·9.6",
  },
  {
    id: "improve-lie",
    title: "라이 개선",
    short: "공 뒤 러프 누르면 2벌타",
    lead: "공 뒤 러프를 누르거나 라이를 좋게 만들면 2벌타예요.",
    penalty: { label: "2벌타", tone: "two" },
    ref: "8.1a",
  },
  {
    id: "divot",
    title: "디봇 자국",
    short: "디봇 자국에 들어가도 그대로 치기",
    lead: "공이 디봇 자국에 들어가도 벌타 없이 빼 주지 않아요.",
    penalty: { label: "구제 없음", tone: "info" },
    ref: "16.1·8.1a",
  },
  {
    id: "embedded",
    title: "박힌 공",
    short: "자기 자국에 박힌 공은 무벌타 구제",
    lead: "공이 떨어진 자국에 박히면 벌타 없이 빼고 쳐요.",
    penalty: { label: "벌타 없음", tone: "free" },
    ref: "16.3",
  },
  {
    id: "pa-play",
    title: "페널티 구역",
    short: "공이 있는 그대로 쳐도 돼요",
    lead: "페널티 구역 안의 공도 있는 그대로 칠 수 있어요.",
    penalty: { label: "벌타 없음", tone: "free" },
    ref: "17.1b",
  },
  {
    id: "pa-yellow",
    title: "노란 말뚝 구제",
    short: "넘어간 지점 뒤쪽 선에 드롭",
    lead: "1벌타를 받고, 공이 넘어간 지점 뒤쪽에서 쳐요.",
    penalty: { label: "1벌타", tone: "one" },
    ref: "17.1d",
  },
  {
    id: "pa-red",
    title: "빨간 말뚝 구제",
    short: "넘어간 지점 두 클럽 옆도 돼요",
    lead: "빨간 말뚝은 넘어간 지점 옆에서도 칠 수 있어요.",
    penalty: { label: "1벌타", tone: "one" },
    ref: "17.1d",
  },
  {
    id: "unplayable",
    title: "언플레이어블",
    short: "\"빼고 칠게요\"는 1벌타",
    lead: "\"빼고 칠게요\"는 언플레이어블 선언이라 1벌타예요.",
    penalty: { label: "1벌타", tone: "one" },
    ref: "19.2",
  },
  {
    id: "cart-path",
    title: "카트 도로",
    short: "가장 가까운 쪽 한 클럽 안, 무벌타",
    lead: "카트 도로에 걸리면 벌타 없이 빼고 쳐요.",
    penalty: { label: "벌타 없음", tone: "free" },
    ref: "16.1b",
  },
  {
    id: "wrong-green",
    title: "옆 그린",
    short: "공이 올라가면 반드시 빼고 치기",
    lead: "공이 다른 홀 그린에 올라가면 반드시 빼고 쳐요.",
    penalty: { label: "벌타 없음", tone: "free" },
    ref: "13.1f",
  },
  {
    id: "drop",
    title: "드롭",
    short: "항상 무릎 높이에서",
    lead: "드롭은 항상 무릎 높이에서 해요.",
    penalty: { label: "무릎 높이", tone: "info" },
    ref: "14.3",
  },
  {
    id: "bunker-sand",
    title: "벙커 모래",
    short: "공 앞뒤 모래에 클럽 대면 2벌타",
    lead: "치기 전에 공 앞뒤 모래에 클럽을 대면 2벌타예요.",
    penalty: { label: "2벌타", tone: "two" },
    ref: "12.2b",
  },
  {
    id: "bunker-unplayable",
    title: "벙커 언플레이어블",
    short: "벙커 밖으로 빼면 2벌타",
    lead: "벙커 안으로 빼면 1벌타, 벙커 밖으로 빼면 2벌타예요.",
    penalty: { label: "1·2벌타", tone: "one" },
    ref: "19.3",
  },
  {
    id: "flagstick",
    title: "깃대",
    short: "꽂은 채 퍼트해도 돼요",
    lead: "깃대를 꽂은 채 퍼트해도 벌타가 없어요.",
    penalty: { label: "벌타 없음", tone: "free" },
    ref: "13.2a",
  },
  {
    id: "straddle",
    title: "가랑이 퍼팅",
    short: "퍼트 선을 가랑이에 두면 2벌타",
    lead: "퍼트 선을 가랑이 사이에 두고 치면 2벌타예요.",
    penalty: { label: "2벌타", tone: "two" },
    ref: "10.1c",
  },
  {
    id: "advice",
    title: "클럽 묻기",
    short: "\"몇 번 쳤어요?\" 묻기만 해도 2벌타",
    lead: "\"몇 번 쳤어요?\"라고 묻기만 해도 2벌타예요.",
    penalty: { label: "2벌타", tone: "two" },
    ref: "10.2a",
  },
  {
    id: "double-hit",
    title: "두 번 맞음",
    short: "한 스윙에 두 번 맞아도 1타",
    lead: "한 번 스윙에 공이 두 번 맞아도 1타예요.",
    penalty: { label: "벌타 없음", tone: "free" },
    ref: "10.1a",
  },
];

