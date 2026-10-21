# DB 깨우기 · 매일 백업 · 복원

Supabase Free 플랜은 1주일 동안 쓰지 않으면 DB가 멈추고, 자동 백업이 없어요. 그래서 두 가지를 따로 돌려요.

| | 하는 일 | 언제 | 어디 |
|---|---|---|---|
| 깨우기 | DB를 한 번 조회해 깨어 있게 | 매일 한국 시간 새벽 3시 | Vercel Cron → `api/keepalive.ts` (`vercel.json` 의 `crons`) |
| 백업 | 역할·구조·데이터 전체를 받아 암호화해 90일 보관 | 매일 한국 시간 새벽 3시 30분 | GitHub Actions → `.github/workflows/db-backup.yml` |

## 처음 한 번 설정

### 1. GitHub 저장소 Secrets 두 개

GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret

- **`SUPABASE_DB_URL`**: Supabase 대시보드 위쪽 **Connect** → **Session pooler** 연결 주소.
  `postgresql://postgres.<프로젝트>:[YOUR-PASSWORD]@aws-....pooler.supabase.com:5432/postgres`
  `[YOUR-PASSWORD]` 자리에 DB 비밀번호를 넣어요. 비밀번호를 모르면 Project Settings → Database 에서 새로 정할 수 있어요
  (바꾸면 이 Secret 도 같이 바꿔요).
- **`BACKUP_PASSWORD`**: 백업 파일을 잠그는 비밀번호. 길게 정하고 **따로 적어 두세요.** 잊으면 백업을 열 수 없어요.

> 이 저장소는 공개(public)라서 백업 파일은 GitHub 계정이 있는 누구나 받을 수 있어요. 그래서 반드시 이 비밀번호로 암호화해서 올려요.

### 2. 첫 백업 돌려 보기

GitHub 저장소 → **Actions** → 왼쪽 **DB 백업** → **Run workflow**.
초록 체크가 뜨면 성공이고, 실행 화면 아래 **Artifacts** 에 `mentalgame-db-날짜` 파일이 생겨요.
실패하면 GitHub 이 메일로 알려 줘요 (대부분 `SUPABASE_DB_URL` 비밀번호가 틀린 경우).

### 3. (선택) 깨우기 주소 잠그기

`/api/keepalive` 는 누가 불러도 가벼운 조회 한 번뿐이라 그대로 둬도 괜찮아요.
막고 싶으면 Vercel 프로젝트 → Settings → Environment Variables 에 `CRON_SECRET` (아무 긴 문자열)을 넣고 다시 배포하면,
Vercel 자동 실행만 받아요.

깨우기가 도는지는 Vercel 프로젝트 → Settings → **Cron Jobs** 에서 볼 수 있어요 (Run 으로 바로 실행도 돼요).

## 백업 받기

GitHub 저장소 → Actions → **DB 백업** → 원하는 날짜 실행 → 아래 **Artifacts** 에서 다운로드 → zip 을 풀면
`mentalgame-db-YYYYMMDD-HHMM.tar.gz.enc` 파일이 나와요. (90일 지난 것은 자동으로 지워져요)

## 백업 열기 (Mac 터미널)

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -in mentalgame-db-YYYYMMDD-HHMM.tar.gz.enc -out backup.tar.gz
```

비밀번호(`BACKUP_PASSWORD`)를 물어보면 입력해요. 그다음:

```bash
mkdir backup && tar -xzf backup.tar.gz -C backup
```

`backup/` 안에 `roles.sql` · `schema.sql` · `data.sql` 이 생겨요.

## 복원 (Supabase 공식 방법)

지금 프로젝트를 덮어쓰지 말고, **새 Supabase 프로젝트**에 복원한 뒤 앱을 그쪽으로 바꿔요.

1. Supabase 에서 새 프로젝트를 만들고, Connect → Session pooler 주소를 받아요.
2. psql 이 없으면 설치해요: `brew install libpq` 후 `export PATH="/opt/homebrew/opt/libpq/bin:$PATH"`
3. 복원:

```bash
cd backup
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "새 프로젝트 Session pooler 주소"
```

4. 새 프로젝트의 로그인 설정을 예전과 같게 맞춰요: Authentication → Providers (구글·카카오), URL Configuration 의 Site URL·Redirect URLs.
5. 앱 연결 바꾸기: Vercel 프로젝트 → Settings → Environment Variables 의 `VITE_SUPABASE_URL` · `VITE_SUPABASE_ANON_KEY` 를
   새 프로젝트 값으로 바꾸고 다시 배포해요. 백업 Secret `SUPABASE_DB_URL` 도 새 주소로 바꿔요.

## 알아 둘 점

- **60일 규칙:** 공개 저장소는 60일 동안 저장소에 아무 변경이 없으면 GitHub 이 예약 실행(매일 백업)을 멈춰요.
  멈추기 전에 메일이 오고, Actions → DB 백업 에서 **Enable workflow** 를 누르면 다시 돌아요.
- 백업은 하루 한 번이라, 복원하면 마지막 백업 이후(최대 하루) 기록은 빠져요.
- `BACKUP_PASSWORD` 를 바꾸면 그 뒤 백업부터 새 비밀번호로 잠겨요. 예전 백업은 예전 비밀번호로 열어요.
