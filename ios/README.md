# 멘탈게임 iOS 앱

배포된 웹(https://mental-game-two.vercel.app)을 화면 가득 띄우는 앱이에요. 화면은 웹과 똑같고, **웹을 배포하면 앱도 바로 바뀌어요** (앱 심사를 다시 받을 필요 없음).

앱이 직접 하는 일은 웹뷰로는 안 되거나 불편한 것들뿐이에요.

| 하는 일 | 왜 |
|---|---|
| 카카오·구글 로그인을 **시스템 로그인 창**(ASWebAuthenticationSession)에서 연다 | 구글은 앱 안 웹뷰에서의 로그인을 막아요 (403 disallowed_useragent) |
| 다른 사이트 링크·전화·카카오톡 주소는 **Safari·해당 앱**으로 연다 | 앱 안에서 다른 사이트를 돌아다니지 않게 |
| 웹의 `alert`·`confirm` 을 **iOS 알림 창**으로 | 웹뷰는 그냥 두면 확인 창이 안 떠요 (삭제 확인 등) |
| 내려받은 파일(정산 이미지)을 **공유 시트**로 | 사진에 저장·카톡 보내기 |
| 처음 열 때 연결이 안 되면 **마지막으로 받은 화면**, 그것도 없으면 다시 시도 화면 | 골프장처럼 신호가 약할 때 |

웹은 User-Agent 끝의 `MentalGameApp/버전` 과 `window.webkit.messageHandlers.mg` 로 앱 안인지 알아요 (`src/native.ts`).

## 처음 설정 (한 번만)

1. **Supabase → Authentication → URL Configuration → Redirect URLs** 에
   `kr.mentalgame.golf://login-callback` 을 추가해요. 로그인 창이 끝나고 앱으로 돌아오는 주소예요.
   (안 하면 로그인 창이 웹 첫 화면으로 가 버리고 앱으로 돌아오지 않아요)
2. 웹을 배포해요. 앱 안 로그인은 웹의 `src/native.ts`·`src/auth.tsx` 가 배포돼 있어야 동작해요.

## 열고 실행하기

```bash
open ios/MentalGame.xcodeproj
```

- Xcode 위쪽에서 시뮬레이터(예: iPhone 17 Pro)를 고르고 ▶︎ 를 눌러요.
- **실제 아이폰**: 프로젝트 → MentalGame 타깃 → **Signing & Capabilities** → **Team** 에서 개발자 계정 팀을 골라요.
  아이폰을 Mac 에 연결하고 위쪽에서 그 아이폰을 골라 ▶︎. 처음이면 아이폰 **설정 → 개인정보 보호 및 보안 → 개발자 모드**를 켜요.

### 시뮬레이터에서 이 Mac 의 개발 서버 띄우기

Debug 빌드는 `MG_WEB_URL` 이 있으면 그 주소를 띄워요 (배포 전 웹 수정 확인용).

```bash
xcrun simctl launch --terminate-running-process booted kr.mentalgame.golf
```

위 명령 앞에 `SIMCTL_CHILD_MG_WEB_URL=http://localhost:5180` 을 붙이면 개발 서버를 띄워요. Xcode 에서는 **Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables** 에 `MG_WEB_URL` 을 넣어요.
웹뷰는 Safari **개발자용 → 시뮬레이터** 메뉴에서 검사할 수 있어요 (Debug 빌드).

## 파일

| 파일 | 내용 |
|---|---|
| `MentalGame/App/AppConfig.swift` | 웹 주소(`Config/Base.xcconfig` 의 `MG_WEB_HOST`), 로그인 돌아오는 주소, User-Agent |
| `MentalGame/Web/WebController.swift` | 웹뷰 설정·페이지 이동 규칙·로그인 창·알림 창·내려받기·연결 끊김 |
| `MentalGame/Web/WebScreen.swift` | 화면 (웹뷰 + 시작 로고 + 다시 시도) |
| `MentalGame/Info.plist` | 로그인 돌아오는 주소 스킴, 시작 화면, 카메라·사진 권한 안내 |
| `MentalGame/Resources/ko.lproj/InfoPlist.strings` | 앱 이름 '멘탈게임' |

## 앱스토어 출시 전에 남은 일

- **Apple로 로그인** (심사 가이드라인 4.8: 카카오·구글 로그인이 있으면 함께 있어야 해요)
- **앱 안에서 회원 탈퇴** (5.1.1)
- **개인정보처리방침** 웹 주소, 지원 주소
- 아이콘·스크린샷(6.9인치·6.5인치), 앱 설명('골프 스코어 기록·정산 계산기'), TestFlight
