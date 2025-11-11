# 📐 DMAP - DXF 도면 모바일 웹앱

아이폰 13 Pro용 DXF 도면 뷰어 및 현장 조사 도구입니다. Google Drive와 연동하여 도면을 열고, 현장에서 사진과 메모를 추가하여 자동으로 저장합니다.

## ✨ 주요 기능

### 📂 Google Drive 연동
- Google Drive에서 DXF 도면 직접 열기
- OAuth 2.0 인증으로 안전한 접근
- 편집 내용 자동 저장

### 📷 사진 관리
- **롱프레스 메뉴**: 도면에서 0.5초 길게 누르면 메뉴 표시
  - 📷 카메라로 직접 촬영
  - 🖼️ 갤러리에서 선택
  - 📝 텍스트 입력
- **이모지 표시**: 사진은 📷 아이콘으로 표시
- **터치하여 보기**: 이모지를 터치하면 실제 사진 표시
- **메모 기능**: 각 사진에 메모 추가 가능

### 🎯 도면 조작
- **핀치줌**: 두 손가락으로 확대/축소
- **팬(이동)**: 한 손가락 드래그로 도면 이동
- **전체보기**: 버튼 클릭으로 전체 도면 표시

### 💾 자동 저장
사진/텍스트 추가 시 Google Drive에 자동 저장:
```
도면명_edited/
  ├── metadata.json (위치 정보, 메모)
  ├── photo_1.jpg
  ├── photo_2.jpg
  └── ...
```

## 🚀 배포 방법

### 1. GitHub Pages 설정

1. **저장소 생성**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/ppoppo1971/DMAP.git
   git push -u origin main
   ```

2. **GitHub Pages 활성화**
   - 저장소 → Settings → Pages
   - Source: `main` 브랜치 선택
   - 저장 → URL 확인: `https://ppoppo1971.github.io/DMAP/`

### 2. Google Cloud Console 설정

이미 설정된 OAuth 정보:
- Client ID: `906332453523-or8l93395kamm6sipv4hogn93i2clj3k.apps.googleusercontent.com`
- API Key: `AIzaSyAMBSJ39taPtfZgkIocKzIx3rutrCcaMaI`
- Redirect URI: `https://ppoppo1971.github.io/DMAP`

✅ **이미 설정 완료되어 있으므로 추가 작업 불필요!**

## 📱 사용 방법

### 아이폰에서 실행

1. **Safari 또는 Chrome 브라우저 열기**
   - URL: `https://ppoppo1971.github.io/DMAP/`

2. **Google 로그인**
   - "📂 Google Drive에서 열기" 버튼 클릭
   - Google 계정 선택 및 권한 승인

3. **DXF 도면 열기**
   - 지정된 폴더에서 DXF 파일 선택
   - 자동으로 전체보기로 표시됨

4. **사진/텍스트 추가**
   - 도면에서 원하는 위치를 **0.5초 길게 누르기**
   - 메뉴에서 선택:
     - **📷 사진 촬영**: 카메라 앱 열림
     - **🖼️ 사진 선택**: 갤러리에서 선택
     - **📝 텍스트 입력**: 텍스트 입력 창

5. **사진 확인 및 메모 추가**
   - 📷 아이콘 터치 → 사진 보기 모달
   - "메모 편집" 버튼 → 메모 작성/수정

6. **자동 저장**
   - 사진/텍스트 추가 시 자동으로 Google Drive에 저장
   - 토스트 메시지: "💾 Google Drive에 저장되었습니다"

### 도면 조작

| 동작 | 설명 |
|-----|------|
| 한 손가락 드래그 | 도면 이동 (팬) |
| 두 손가락 핀치 | 확대/축소 (줌) |
| 0.5초 롱프레스 | 컨텍스트 메뉴 표시 |
| 📷 아이콘 터치 | 사진 보기 |
| 전체보기 버튼 | 도면 전체 표시 |

## 🖥️ 데스크탑에서 확인

### Google Drive에서 직접 확인

1. **Google Drive 접속**
   - https://drive.google.com/drive/folders/18NRsrVaR2OUiU4mf5zMseoFM-fij0FWX

2. **편집된 폴더 열기**
   - `도면명_edited/` 폴더 찾기

3. **metadata.json 확인**
   ```json
   {
     "originalFile": "도면.dxf",
     "editedDate": "2025-11-11T...",
     "photos": [
       {
         "id": 1,
         "fileName": "photo_1.jpg",
         "position": { "x": 100, "y": 200 },
         "size": { "width": 50, "height": 40 },
         "memo": "균열 발견"
       }
     ],
     "texts": [
       {
         "id": 2,
         "position": { "x": 300, "y": 400 },
         "text": "보수 필요",
         "fontSize": 20
       }
     ]
   }
   ```

### AutoCAD에서 활용 (리스프/스크립트)

`metadata.json`을 읽어서 AutoCAD에 객체 삽입:

```lisp
; AutoLISP 예제 (개발 필요)
(defun C:IMPORT-PHOTOS ()
  ; 1. metadata.json 읽기
  ; 2. 각 사진 위치에 IMAGE 객체 삽입
  ; 3. 텍스트 위치에 TEXT 객체 삽입
  (princ "\n사진 및 텍스트 가져오기 완료!")
)
```

## 📁 파일 구조

```
DMAP/
├── index.html           # 메인 HTML (UI, 스타일, Google API 로드)
├── app.js              # 메인 앱 로직 (DXF 파싱, 렌더링, 이벤트)
├── google-drive.js     # Google Drive API 연동 (자동 저장)
├── libs/
│   └── dxf-parser.min.js  # DXF 파서 라이브러리
├── client_secret_*.json   # OAuth 인증 정보
└── README.md           # 이 파일
```

## 🔧 기술 스택

- **프론트엔드**: Vanilla JavaScript, HTML5 Canvas, SVG
- **DXF 파싱**: [dxf-parser](https://github.com/gdsestimating/dxf-parser) v1.2.1
- **Google API**:
  - Google Drive API v3
  - Google Picker API
  - Google Identity Services (OAuth 2.0)

## 🎨 주요 특징

### SVG + Canvas 하이브리드 렌더링
- **SVG**: DXF 도면 벡터 렌더링 (무한 확대 가능)
- **Canvas**: 사진 이모지, 텍스트 오버레이

### 모바일 최적화
- 터치 제스처 완벽 지원
- 햅틱 피드백 (롱프레스 시)
- 반응형 UI
- 부드러운 애니메이션

### 자동 저장
- 사진/텍스트 추가 즉시 저장
- 메모 수정 즉시 저장
- 삭제 시에도 자동 업데이트
- **로컬 ZIP 다운로드 불필요**: Google Drive에 실시간 자동 저장

## 🐛 문제 해결

### Google 로그인이 안 되는 경우
1. 팝업 차단 해제
2. 쿠키 허용 확인
3. 다른 브라우저 시도 (Chrome 권장)

### DXF 파일이 안 열리는 경우
1. AutoCAD에서 DXF 재저장:
   - 파일 → 다른 이름으로 저장 → DXF
   - 버전: "AutoCAD 2000/LT2000" 또는 "R12/LT12" 선택

### 사진이 안 보이는 경우
1. 카메라/갤러리 권한 확인
2. 브라우저 권한 설정 확인
3. 파일 크기 확인 (10MB 이하 권장)

### 자동 저장이 안 되는 경우
1. Google 로그인 상태 확인
2. Drive 권한 확인
3. 인터넷 연결 확인
4. 브라우저 콘솔(F12) 확인

## 📞 문의

- **개발자**: ppoppo1971
- **GitHub**: https://github.com/ppoppo1971/DMAP
- **Google Drive 폴더**: https://drive.google.com/drive/folders/18NRsrVaR2OUiU4mf5zMseoFM-fij0FWX

## 📝 라이선스

MIT License - 자유롭게 사용 및 수정 가능

---

**만든 날짜**: 2025년 11월 11일  
**버전**: 1.0.0  
**지원 기기**: iPhone 13 Pro, iOS 크롬 브라우저

