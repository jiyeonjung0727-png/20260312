# 🍕 도미노피자 재고·발주 자동화 시스템

재고를 파악하고 부족 품목을 자동 감지해 담당자에게 발주서 이메일을 발송하는 팀 공유 웹 시스템입니다.

---

## 로컬 실행

```bash
npm install
node server.js
# → http://localhost:3000
# 기본 비밀번호: domino2024
```

---

## Vercel 배포 방법

### 1단계 — Vercel 프로젝트 생성

1. [vercel.com](https://vercel.com) 로그인 → **Add New Project**
2. GitHub 저장소 `20260312` 선택 → **Import**
3. **Deploy** 클릭 (기본 설정 그대로)

### 2단계 — 환경변수 설정

Vercel 프로젝트 → **Settings** → **Environment Variables** 에서 아래 두 개를 추가합니다.

| 이름 | 값 | 설명 |
|------|----|------|
| `TEAM_PASSWORD` | 원하는 비밀번호 | 팀원 로그인 비밀번호 |
| `AUTH_SECRET` | 랜덤 문자열 (예: `abc123xyz`) | 세션 서명 키 |

설정 후 **Redeploy** 하면 새 비밀번호가 적용됩니다.

### 3단계 (선택) — 데이터 영구 저장 (Vercel KV)

> 설정하지 않으면 서버 재시작 시 데이터가 초기값으로 돌아옵니다.

1. Vercel 프로젝트 → **Storage** → **Create Database** → **KV** 선택
2. 데이터베이스 생성 후 프로젝트에 연결하면 환경변수가 자동으로 추가됩니다.
3. **Redeploy** → 이후 재고 변경 내용이 영구 저장됩니다.

---

## 발주서 이메일 발송 (Gmail 앱 비밀번호)

1. [Google 앱 비밀번호](https://myaccount.google.com/apppasswords) → 2단계 인증 후 16자리 생성
2. 웹 **📧 발주서 발송** 메뉴에서 Gmail 계정 + 앱 비밀번호 입력

---

## 기능

| 메뉴 | 설명 |
|------|------|
| 📊 대시보드 | KPI, 발주 필요 품목, 거래처별 현황 |
| ✏️ 재고 입력 | 인라인 편집 테이블로 재고 직접 입력/수정/삭제 |
| 📧 발주서 발송 | 품목 선택 후 HTML 발주서 이메일 발송 |
