# 멘탈게임 ⛳

골프 내기 정산 앱. 스코어만 입력하면 배판·버디·핸디캡까지 자동으로 계산하고,
최소 횟수의 송금으로 정산해 줍니다. 미드센추리 모던 스타일의 모바일 UI.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 빌드
```

## 주요 기능

- **세팅**: 골프장/날짜/티오프(기본값: 현재 시각), 타당 금액(1천·2천·5천·직접입력)
- **지불 방법**: 현금 지급(핸디 사전 정산만) / 계좌이체(사후 정산 기본, 사전으로 변경 가능)
- **핸디캡 설정 방식**: 평균타수 입력(핸디 = 평균−72, ± 조정) 또는 기준인원 대비 +5·+10타·직접 입력.
  기준인원 대비 방식은 방장이 대기실에서 기준 인원을 정해야 게임을 시작할 수 있음
- **배판 규칙** (겹쳐도 최대 ×2)
  - 파 페널티(동시 규칙): 파3 더블보기+ / 파4·5 트리플보기+ → ×2
  - 더블파 배판: 더블파 이상 → ×2 (파 페널티와 택1)
  - 동타 배판: 3명(3인 플레이 시 2명) 이상 동타 → ×2
- **버디 추가 정산**: 버디 시 항상 한 타를 더 잡아줌(배판 홀은 2배), 별도 표시
- **게임 화면**: 홀 이동, PAR 선택, 스코어(-2~+5) 입력, 실시간 자동 정산.
  다시 열면 마지막으로 스코어를 입력한 홀의 다음 홀로 이동
- **정산 결과**: 순위(타수·핸디) → ① 게임 순수 → ② 버디(홀별 상세) → ③ 핸디캡 → ④ 최종 송금
  → ⑤ 홀별 검증(1번~마지막 홀을 넘기며 홀별·누적 금액 확인).
  방장은 정산 확정 후에도 스코어와 정산 설정(지불 방법·핸디캡·배판 규칙)을 수정 가능
  (수정 완료 전까지는 저장되지 않고 취소 가능). 확정 후 수정 내역은 결과 화면 맨 아래에 모두에게 공개
- **멀티플레이어 라운드**: 로그인 후 한 명이 라운드를 만들면 **4자리 초대 코드**가 발급되고,
  다른 참여자는 코드로 참여. 각자 대기실에서 본인 정보(이름·평균타수·핸디)를 입력하고
  방장이 게임을 시작. 스코어 입력은 **실시간 동기화**(Supabase Realtime)
- **내 라운드**: 참여한 라운드 목록(대기중/진행중/완료, 참여자 이름) 확인 및 다시 열기. 삭제는 방장만 가능

## 백엔드(Supabase) 연결

구글 로그인과 기록 저장은 **Supabase**(Auth + Postgres)를 사용합니다.

1. [Supabase](https://supabase.com)에서 프로젝트 생성
2. **Authentication → Sign In / Providers → Google** 사용 설정
   - Google Cloud Console에서 OAuth 클라이언트를 만들고 Client ID/Secret 입력
   - **Authentication → URL Configuration** 에서 Site URL과 Redirect URLs 에
     로컬(`http://localhost:5173`, `5174`)과 배포 도메인(`https://<앱>.vercel.app`)을 등록
   - **카카오 로그인**: [Kakao Developers](https://developers.kakao.com)에서 앱 생성 후
     - **앱 설정 → 앱 → 플랫폼 키 → REST API 키** 에서 카카오 로그인 Redirect URI 에
       `https://<프로젝트>.supabase.co/auth/v1/callback` 등록, Client Secret 활성화 후 복사
     - **제품 설정 → 카카오 로그인** 사용 설정 ON, **동의항목**에서 닉네임·프로필 사진 설정
       (앱이 이메일을 요청하지 않으므로 비즈 앱 전환·이메일 동의항목은 필요 없음)
     - REST API 키(Client ID)와 Client Secret 을 Supabase **Providers → Kakao** 에 입력
     - Supabase Kakao 설정의 **Allow users without an email** 을 반드시 켜기
   - **구글·카카오 계정 연결**: **Authentication → Sign In / Providers** 에서
     **Allow manual linking** 을 켜기 (홈 화면 프로필 메뉴의 "로그인 계정 연결"에 필요)
3. **SQL Editor** 에서 `supabase/schema.sql` 을 실행
   (rounds / round_players / round_holes / round_scores 테이블 + RLS + RPC + Realtime publication)
   - 마지막 `alter publication ... add table` 구문은 이미 추가돼 있으면 에러가 날 수 있으니
     그 경우 무시하거나 개별 실행하세요.
4. **Project Settings → API** 의 값을 `.env` 에 입력 (`.env.example` 참고)

```bash
cp .env.example .env
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 채우고 다시 실행
npm run dev
```

RLS 정책으로 **라운드 멤버(방장 또는 참여자)만** 해당 라운드 데이터를 읽고 쓸 수 있어,
초대 코드를 받은 사람만 라운드에 접근할 수 있습니다.

> 앱은 카카오·구글 로그인 후에만 사용할 수 있어, `.env` 설정이 필요합니다.

## Vercel 배포

이 프로젝트는 Vite SPA 로 Vercel에 그대로 배포됩니다 (`vercel.json` 포함).

1. GitHub 저장소에 푸시 후 [Vercel](https://vercel.com)에서 Import
2. Framework Preset: **Vite** (자동 감지) · Build: `npm run build` · Output: `dist`
3. **Settings → Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가
4. 배포 후 도메인을 Supabase의 Redirect URLs / Site URL 에 등록

```bash
# 로컬에서 배포 미리보기 (선택)
npm i -g vercel
vercel        # 프리뷰
vercel --prod # 프로덕션
```

## 정산 로직

두 명씩 비교해 스코어가 나쁜 사람이 좋은 사람에게 `타수차 × 타당금액 × 배판`을
지급하고, 전체 순잔액을 **최소 현금흐름(그리디)** 으로 단순화합니다. 핵심 로직은
`src/betting.ts` 에 있습니다.
