# Phase 0–2 — 잔액 baseline / 원장 검증

## 1. baseline export

관리자 → 데이터 관리 → **정산 baseline 내보내기**

## 2. 원장 마이그레이션

같은 화면 → **원장 마이그레이션 (useLedger)**

성공 조건: `ledgerSum - legacyAvailable === 0`

불일치 시 `useLedger`는 켜지지 않습니다. 콘솔/알림의 diff로 원인을 확인하세요.

## 3. 활성화 후 확인

```js
await isLedgerModeEnabled()           // true
await getGlobalAvailableFromLedger()  // UI 출금가능액과 동일해야 함
```

허용 오차: **0원**.
