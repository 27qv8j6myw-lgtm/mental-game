import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import { useBack } from "../back";
import { newVersionDeployed, reloadForUpdate, takeReopen } from "../update";
import TopBar, { BackButton } from "../screens/TopBar";

type Props = { onClose: () => void; start?: number };

/** 룰 화면 파일을 받지 못했을 때: 앱이 새로 배포됐으면 새로 불러오게, 아니면 (신호 없음 등) 안내만 한다 */
function RulesFailed({ onClose, updated }: Props & { updated?: boolean }) {
  useBack(true, onClose);
  return (
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label="골프 룰">
      <div className="guide-inner">
        <TopBar left={<BackButton onClick={onClose} />} />
        <div className="sheet gd-sheet">
          <div className="card">
            {updated ? (
              <>
                <div className="empty-note">앱이 새 버전으로 바뀌었어요. 새로 불러오면 골프 룰이 열려요.</div>
                <button className="btn-primary" onClick={() => reloadForUpdate("rules")}>
                  새로 불러오기
                </button>
              </>
            ) : (
              <div className="empty-note">골프 룰을 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const RulesUpdated = (p: Props) => <RulesFailed {...p} updated />;
const RulesScreen = lazy(() =>
  import("./RulesScreen").catch(async () => ({ default: (await newVersionDeployed()) ? RulesUpdated : RulesFailed }))
);

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
  // 룰을 열다가 새 앱으로 다시 불러왔으면 바로 연다
  const [open, setOpen] = useState(() => takeReopen("rules"));
  return (
    <>
      <button className="rules-pill" onClick={() => setOpen(true)}>
        골프 룰
      </button>
      {open && createPortal(<Rules onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
