# Firebase 설정 가이드

현재 코드가 localStorage에서 Firebase Firestore로 변경되었습니다. 다음 단계를 따라 Firebase 프로젝트를 설정하세요.

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: wayxim-project)
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

## 2. Firestore 데이터베이스 설정

1. Firebase Console에서 "Firestore Database" 선택
2. "데이터베이스 만들기" 클릭
3. 보안 규칙을 "테스트 모드에서 시작" 선택 (개발용)
4. 위치 선택 (asia-northeast3 - 서울 권장)

## 3. 웹 앱 등록

1. Firebase Console에서 웹 아이콘(</>) 클릭
2. 앱 닉네임 입력 (예: wayxim-web)
3. Firebase SDK 설정 복사

## 4. 코드에 Firebase 설정 적용

`index.html` 파일의 Firebase 설정 부분을 실제 프로젝트 설정으로 교체하세요:

```javascript
const firebaseConfig = {
  apiKey: "실제-api-key",
  authDomain: "실제-프로젝트.firebaseapp.com",
  projectId: "실제-프로젝트-id",
  storageBucket: "실제-프로젝트.appspot.com",
  messagingSenderId: "실제-sender-id",
  appId: "실제-app-id"
};
```

## 5. Firestore 보안 규칙 설정

Firestore 보안 규칙을 다음과 같이 설정하세요:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 모든 읽기/쓰기 허용 (개발용)
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## 6. 데이터베이스 컬렉션 구조

다음 컬렉션들이 자동으로 생성됩니다:

- `submissions`: 작업 요청 데이터
- `nameToCode`: 업체명 → 코드 매핑
- `codeToName`: 코드 → 업체명 매핑
- `vendorTypeOverrides`: 업체 타입 오버라이드
- `counters`: 번호 카운터

## 7. 배포 및 테스트

1. 웹 서버에 파일 업로드
2. 브라우저에서 접속하여 테스트
3. 데이터가 Firebase에 저장되는지 확인

## 주의사항

- 현재 설정은 개발용입니다. 프로덕션 환경에서는 적절한 보안 규칙을 설정하세요.
- Firebase 사용량에 따라 비용이 발생할 수 있습니다.
- 데이터 백업을 정기적으로 수행하세요.
