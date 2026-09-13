# Firebase 설정 가이드

현재 앱은 Firestore + **Firebase Authentication**을 사용합니다.
`way_im_manager_site_admin/`은 구버전 스냅샷이며 **사용하지 않습니다.**

## 1. Firebase 프로젝트

프로젝트 ID: `wayxim-v2` (코드의 `firebaseConfig`와 일치해야 함)

## 2. Authentication 활성화 (Phase 1-A 필수)

1. [Firebase Console](https://console.firebase.google.com/) → Authentication → Sign-in method
2. **Anonymous** 사용 설정 (공개 작업요청서 제출용)
3. **Email/Password** 사용 설정 (관리자용)
4. Authentication → Users → **Add user**
   - Email: `admin@wayxim-v2.firebaseapp.com`
   - Password: 앱의 관리자 비밀번호(`ADMIN_PASS`)와 **동일한 값**

> 관리자 UI 비밀번호와 Firebase 비밀번호를 같게 맞춰, 기존 로그인 UX를 유지합니다.
> 비밀번호를 바꾸면 **Console 사용자 비밀번호와 `index.html`의 `ADMIN_PASS`를 함께** 변경하세요.

## 3. Firestore 보안 규칙 배포

로컬에 Firebase CLI가 있으면:

```bash
firebase deploy --only firestore:rules
```

또는 Console → Firestore → Rules에 `firestore.rules` 내용을 붙여넣고 게시.

**규칙 요지**

| 컬렉션 | 읽기 | 쓰기 |
|--------|------|------|
| `submissions` | 로그인(익명 포함) | create: 로그인 / update: 관리자만 / **delete 금지** |
| `withdrawals`, `settlementMeta`, `availableTopUps`, `dataBackups` | 관리자 | 관리자 (delete 금지) |
| `counters`, `nameToCode`, `codeToName` | 로그인 | 로그인 (제출 흐름용) |
| `vendorTypeOverrides` | 로그인 | 관리자 |

관리자 = Email/Password 로그인 (`sign_in_provider == 'password'`).

⚠️ 규칙을 배포하기 **전에** 위 관리자 계정을 만들어 두세요. 계정 없이 규칙만 배포하면 관리 쓰기가 전부 실패합니다.

## 4. 웹 앱 설정

`index.html`의 `firebaseConfig`가 Console의 웹 앱 설정과 일치하는지 확인하세요.

## 5. 컬렉션

자동 생성되는 주요 컬렉션:

- `submissions`, `withdrawals`, `counters`
- `nameToCode`, `codeToName`, `vendorTypeOverrides`
- `settlementMeta`, `availableTopUps`, `dataBackups`
- `settlementBaselines` (Phase 0 잔액 스냅샷)
- `vendors` (불변 vendorId = companyCode, 표시명만 변경)

## 6. 데이터 보존 (Phase 1-A/B/C)

- **전체 삭제(`confirmDeleteAll`)는 제거됨**
- 개별 삭제는 `isDeleted: true` soft-delete만 수행
- soft-delete 직전 Firebase `dataBackups` 백업이 성공해야 진행됨
- Firestore 규칙에서 `submissions`/`withdrawals` **물리 delete는 거부**
- CSV 업로드: **번호 또는 업로드ID**만 자동 병합. 내용만 비슷한 건은 확인 UI
- 업체명 변경: **companyCode/vendorId 유지**, 표시 업체명만 변경

## 7. Phase 0 baseline

관리자 → 데이터 관리 → **정산 baseline 내보내기**  
자세한 내용은 `scripts/README.md` 참고.

## 주의사항

- 프로덕션에서는 관리자 비밀번호를 주기적으로 회전하세요.
- Cloud Functions로의 정산/원장 이전은 Phase 2D에서 진행합니다.
- Firebase 사용량(특히 전체 컬렉션 읽기)에 따라 비용이 발생할 수 있습니다. Phase 3에서 페이지네이션으로 개선합니다.

## 8. Phase 2 원장 + Functions + Phase 3

### 원장 마이그레이션
관리자 → 데이터 관리:
1. **정산 baseline 내보내기**
2. **원장 마이그레이션 (useLedger)** (차이 0원일 때만 활성화)
3. **VENDOR 요약 재구축** (vendorSummary 최초 적재)

`useLedger: true` 이후 UI 출금가능액은 `globalBalance`만 사용합니다.  
레거시 `ledgerResetAt` / `openingAdjustment` 재계산은 `forceLegacy` 마이그레이션 경로에만 남습니다.

### Cloud Functions 배포
```bash
cd functions && npm install
firebase deploy --only functions,firestore:rules,firestore:indexes
```

포함 함수:
- `onSubmissionCreated` — commission_credit + vendorSummary
- `onWithdrawalUpdated` — debit / reversal
- `onTopUpCreated` — manual_credit
- `allocateNextNo` — 번호 트랜잭션 callable

클라와 Functions는 동일 idempotent 키(`type_refId`)를 쓰므로 이중 기록이 안전합니다.

### Phase 3 조회
- 신규/접수 리스트: 최근 6개월 + 50건 페이지네이션 (`loadSubsPage`)
- VENDOR LIST: `vendorSummary` 우선 (없으면 전체 재집계 폴백)
- 주별/월별/일별 정산·관리자 홈: `loadSubsByDateRange` / `loadSubsForYearMonth` (전체 스캔 후 JS filter 제거)
- 복합 인덱스: `accepted + submittedAt` (배포: `firebase deploy --only firestore:indexes`)
