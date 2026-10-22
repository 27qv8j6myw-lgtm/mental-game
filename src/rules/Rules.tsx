import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import TopBar, { BackButton } from "../screens/TopBar";

type Props = { onClose: () => void; start?: number };

/** 룰 화면 파일을 받지 못했을 때 (신호 없음 등): 앱이 멈추지 않게 안내만 한다 */
function RulesFailed({ onClose }: Props) {
  useBack(true, onClose);
  return (
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label="골프 룰">
      <div className="guide-inner">
        <TopBar left={<BackButton onClick={onClose} />} />
        <div className="sheet gd-sheet">
          <div className="card">
            <div className="empty-note">골프 룰을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const RulesScreen = lazy(() => import("./RulesScreen").catch(() => ({ default: RulesFailed })));

/** 자주 틀리는 골프 룰 열기. 그림·설명이 길어서 처음 열 때 따로 받는다 */
export default function Rules(props: Props) {
  return (
    <Suspense fallback={<div className="guide-layer" />}>
      <RulesScreen {...props} />
    </Suspense>
  );
}

/** 홈 한 줄 소개 오른쪽 끝: 골프 룰 (타원 버튼). 누르면 첫 쪽부터 넘겨 본다 */
export function RulesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="rules-pill" onClick={() => setOpen(true)}>
        골프 룰
      </button>
      {open && createPortal(<Rules onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
