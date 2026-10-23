# App Store 심사 제출 준비

멘탈게임 iOS 앱(`kr.mentalgame.golf`, 1.0)을 App Store 심사에 올리기 전에 할 일이에요.
✅ 준비됨 · 👤 직접 해야 함 · ⚠️ 정해야 함

| 파일 | 내용 |
|---|---|
| [metadata.md](metadata.md) | 앱 이름·부제·설명·키워드·심사 메모 (붙여 넣기용) |
| [privacy-and-age-rating.md](privacy-and-age-rating.md) | 앱 개인정보 보호 답안, 연령 등급 답안 |
| [screenshots/](screenshots) | 6.9형 아이폰 화면 사진 (1320×2868) |

## 1. 앱 쪽 준비

| | 할 일 | 상태 |
|---|---|---|
| ✅ | 아이폰 전용, 세로 화면, 앱 아이콘, 시작 화면 | 끝남 |
| ✅ | 수출 규정: `ITSAppUsesNonExemptEncryption = NO` (HTTPS만 써요) | 빌드 설정에 있어요. 빌드마다 묻지 않아요 |
| ✅ | 카메라·사진 권한 안내 문구 | 빌드 설정에 있어요 |
| ✅ | Apple로 로그인 (가이드라인 4.8) | 있어요 |
| ✅ | 앱 안 회원 탈퇴 (가이드라인 5.1.1(v)) | 내 정보 → 이름 옆 회원 탈퇴 |
| ✅ | 탈퇴 때 Apple 토큰 취소 (Apple 계정 삭제 안내) | `api/apple-revoke.ts` + 앱이 인증 코드를 넘김. **빌드 3부터** |
| ✅ | 개인정보처리방침·지원 페이지 | `/privacy`, `/support` |
| 👤 | **빌드 3 올리기** | 토큰 취소 때문에 앱이 바뀌었어요. 빌드 3을 올려서 심사에 골라요 |

## 2. 서버 쪽 (직접)

| | 할 일 | 방법 |
|---|---|---|
| 👤 | Supabase Apple 로그인 켜기 | Authentication → Sign In / Providers → Apple 켜기 → Client IDs에 `kr.mentalgame.golf` |
| 👤 | Apple 토큰 취소 키 만들기 | 아래 '토큰 취소 키' 참고 |
| 👤 | 아직 안 돌린 SQL | SQL Editor에서 `account.sql`, `admin.sql`, `insight.sql`, `ranking.sql` |
| 👤 | 실제 아이폰에서 확인 | TestFlight 빌드 3으로 Apple 로그인 → 라운드 하나 → 회원 탈퇴까지 |

### 토큰 취소 키 (한 번만)

1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → ＋
2. 이름(예: `MentalGame SIWA`) → **Sign in with Apple** 체크 → Configure → Primary App ID `kr.mentalgame.golf` → 저장
3. **.p8 파일 내려받기** (한 번만 받을 수 있어요). 화면의 **Key ID**를 적어 둬요
4. Vercel → mental-game → Settings → Environment Variables 에 넣고 다시 배포:
   - `APPLE_TEAM_ID` = `9UK5E72T2X`
   - `APPLE_KEY_ID` = 3번의 Key ID
   - `APPLE_PRIVATE_KEY` = .p8 파일 내용 전체 (`-----BEGIN PRIVATE KEY-----` 부터 끝까지)

키 파일과 값은 채팅이나 저장소에 올리지 말고 Vercel에만 넣어요. 키가 없어도 탈퇴는 그대로 되고, 토큰 취소만 건너뛰어요.

## 3. App Store Connect 입력 (직접)

| | 화면 | 넣을 것 |
|---|---|---|
| 👤 | 앱 정보 | 이름·부제·카테고리·개인정보처리방침 URL → `metadata.md` |
| 👤 | 가격 및 사용 가능 여부 | 무료, 대한민국 |
| 👤 | 앱 개인정보 보호 | `privacy-and-age-rating.md` 의 표 |
| ⚠️ | 연령 등급 | 대부분 '없음'. **'도박' 항목은 정해야 해요** → `privacy-and-age-rating.md` |
| 👤 | 1.0 버전 | 프로모션 텍스트·설명·키워드·지원 URL·저작권 → `metadata.md` |
| 👤 | 스크린샷 | `screenshots/` 의 6.9형 사진을 'iPhone 6.9형'에 올려요. 다른 크기는 자동으로 줄여서 써요 |
| 👤 | 빌드 | 빌드 3 선택 |
| 👤 | 앱 심사 정보 | 연락처(이름·전화·이메일) + 메모 → `metadata.md` |
| 👤 | 제출 | '심사에 추가' → '심사 제출'. 보통 1~3일 걸려요 |

## 화면 사진 (screenshots/)

6.9형 아이폰(1320×2868, JPEG, 투명 없음) 8장이에요. 올리는 차례대로 번호를 붙였어요.
이름·골프장은 가짜예요 (김도윤, 이준호, 솔밭CC 등). 실제 이용자 정보는 없어요.

| 파일 | 화면 |
|---|---|
| `01-home.jpg` | 홈: 초대 코드로 참여, 진행 중 라운드, 골프 룰 버튼 |
| `02-hole.jpg` | 홀 진행: 스코어 입력, 스킨 획득 |
| `03-settlement.jpg` | 최종 정산: 받을 돈, 보낼 사람별 금액 |
| `04-stats.jpg` | 전적: 평균 타수, 함께 친 사람과 비교 |
| `05-highlights.jpg` | 랭킹 하이라이트 |
| `06-records.jpg` | 라운드 기록 분석 |
| `07-rules-drop.jpg` | 골프 룰: 드롭 |
| `08-rules-penalty-area.jpg` | 골프 룰: 빨간 말뚝 구제 |

테스트 서버 화면을 아이폰 6.9형 크기로 찍었어요. 위쪽 상태 막대(시계·배터리)는 없어요.
상태 막대가 있는 사진을 원하면 시뮬레이터(iPhone 18 Pro Max) 접근을 허락해 주세요. 다시 찍을게요.

## 4. 심사에서 걸릴 수 있는 것

| 가이드라인 | 내용 | 대비 |
|---|---|---|
| 5.3 도박 | 화면에 '내기'가 나와요. 실제 돈 내기 앱으로 보면 허가를 요구할 수 있어요 | 앱은 돈을 받거나 보내지 않고 계산만 한다고 심사 메모에 적었어요. 연령 등급을 사실대로 답해요 |
| 4.2 최소 기능 | 웹을 띄우는 앱이라 '웹사이트 포장'으로 볼 수 있어요 | Apple 로그인, 사진 저장, 공유 시트, iOS 알림 창, 오프라인 화면을 메모에 적었어요 |
| 2.1 완성도 | 심사관이 로그인 뒤 할 게 없으면 거절돼요 | 폰 없는 동반자를 넣어 혼자서도 라운드를 끝까지 해 보는 순서를 메모에 적었어요 |

거절되면 해결 센터(Resolution Center)의 내용을 알려 주세요. 답변이나 수정을 같이 준비할게요.
