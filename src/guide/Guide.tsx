import { lazy, Suspense } from "react";
import { useBack } from "../back";
import TopBar, { BackButton } from "../screens/TopBar";
import type { TopicId } from "./content";

type Props = { onClose: () => void; topic?: TopicId };

/** 설명서 파일을 받지 못했을 때 (신호 없음 등): 앱이 멈추지 않게 안내만 한다 */
function GuideFailed({ onClose }: Props) {
  useBack(true, onClose);
  return (
    <div className="guide-layer" role="dialog" aria-modal="true" aria-label="사용 방법">
      <div className="guide-inner">
        <TopBar left={<BackButton onClick={onClose} />} />
        <div className="sheet gd-sheet">
          <h2 className="page-title">사용 방법</h2>
          <div className="card">
            <div className="empty-note">사용 방법을 불러오지 못했어요. 연결을 확인하고 앱을 다시 열어 주세요.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const GuideScreen = lazy(() => import("../screens/GuideScreen").catch(() => ({ default: GuideFailed })));

/** 사용 방법 열기. 글이 길어서 처음 열 때 따로 받는다 (메인 번들을 키우지 않게) */
export default function Guide(props: Props) {
  return (
    <Suspense fallback={<div className="guide-layer" />}>
      <GuideScreen {...props} />
    </Suspense>
  );
}
