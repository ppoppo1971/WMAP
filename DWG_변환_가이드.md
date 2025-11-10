# 🔄 DWG 파일을 DXF로 변환하는 방법

## ❌ DWG 파일 직접 열기는 불가능합니다

**이유:**
- DWG는 Autodesk의 독점 파일 형식
- 브라우저에서 파싱할 수 있는 오픈소스 라이브러리 없음
- 파일 구조가 복잡하고 암호화되어 있음

## ✅ 해결 방법: DXF로 변환하기

DWG 파일을 DXF로 변환하면 웹앱에서 사용할 수 있습니다!

---

## 🎯 방법 1: AutoCAD에서 변환 (가장 정확)

### 단계:
1. **AutoCAD에서 DWG 파일 열기**
   ```
   파일 → 열기 → DWG 파일 선택
   ```

2. **DXF로 저장**
   ```
   파일 → 다른 이름으로 저장 → DXF (*.dxf) 선택
   ```

3. **버전 선택 (중요!)**
   ```
   파일 형식: "AutoCAD 2000/LT2000 DXF" 선택
   또는: "AutoCAD R12/LT12 DXF" (가장 호환성 높음)
   ```

4. **저장 → 웹앱에서 열기**

---

## 🎯 방법 2: AutoCAD가 없는 경우

### A. 무료 DWG 뷰어 사용

#### 1) DWG TrueView (Autodesk 공식, 무료)
- **다운로드:** https://www.autodesk.com/products/dwg/viewers
- **기능:** DWG 보기 + DXF 변환
- **장점:** 공식 프로그램, 가장 정확

**사용법:**
```
1. DWG TrueView 다운로드 및 설치
2. DWG 파일 열기
3. 파일 → 다른 이름으로 저장 → DXF 선택
4. 버전: AutoCAD 2000 DXF 선택
5. 저장
```

#### 2) LibreCAD (무료 오픈소스)
- **다운로드:** https://librecad.org/
- **기능:** DWG 보기 + 간단한 편집 + DXF 변환
- **장점:** 완전 무료, 가볍고 빠름

**사용법:**
```
1. LibreCAD 다운로드 및 설치
2. 파일 → 열기 → DWG 파일 선택
3. 파일 → 다른 이름으로 저장 → DXF 선택
4. 저장
```

#### 3) DraftSight (무료 버전 있음)
- **다운로드:** https://www.draftsight.com/
- **기능:** DWG/DXF 편집
- **장점:** AutoCAD와 유사한 인터페이스

---

### B. 온라인 변환 서비스 (인터넷 필요)

#### 1) CloudConvert
- **URL:** https://cloudconvert.com/dwg-to-dxf
- **장점:** 브라우저에서 바로 변환, 설치 불필요
- **단점:** 파일 크기 제한, 개인정보 유출 가능성

**사용법:**
```
1. CloudConvert 웹사이트 접속
2. "Select File" → DWG 파일 업로드
3. 변환 형식: DXF 선택
4. "Convert" 클릭
5. 변환 완료 후 다운로드
```

#### 2) Zamzar
- **URL:** https://www.zamzar.com/convert/dwg-to-dxf/
- **사용법:** CloudConvert와 유사

#### 3) AnyConv
- **URL:** https://anyconv.com/dwg-to-dxf-converter/
- **사용법:** CloudConvert와 유사

⚠️ **주의:** 온라인 변환 시 중요한 도면은 보안상 주의 필요!

---

## 🔄 일괄 변환 (여러 파일)

### AutoCAD Script로 일괄 변환

여러 DWG 파일을 한 번에 DXF로 변환하려면:

**1. 스크립트 파일 생성 (batch_convert.scr):**
```
OPEN "C:\drawings\file1.dwg"
SAVEAS "DXF" "R12" "C:\drawings\file1.dxf"
CLOSE

OPEN "C:\drawings\file2.dwg"
SAVEAS "DXF" "R12" "C:\drawings\file2.dxf"
CLOSE
```

**2. AutoCAD에서 실행:**
```
명령어: SCRIPT
파일 선택: batch_convert.scr
```

### 또는 무료 툴 사용:

**Teigha File Converter (무료)**
- **다운로드:** https://www.opendesign.com/guestfiles/teigha_file_converter
- **기능:** 폴더 전체 일괄 변환
- **장점:** 빠르고 정확

---

## 💡 변환 후 확인사항

변환한 DXF 파일을 웹앱에서 열기 전에 확인:

### 1. 파일 크기 확인
```
✅ 10MB 이하: 최적
⚠️ 10-50MB: 가능 (느릴 수 있음)
❌ 50MB 이상: 분할 권장
```

### 2. 내용 확인
- DWG 뷰어나 AutoCAD에서 열어서 정상인지 확인
- 레이어가 모두 표시되는지 확인

### 3. 버전 확인
- 가능하면 AutoCAD 2000 또는 R12 버전으로 저장

---

## 🛠️ 변환 시 문제 해결

### 문제 1: 변환 후 내용이 안 보임

**원인:** 레이어가 꺼져 있음

**해결:**
```
AutoCAD에서:
1. 명령어: LAYON (모든 레이어 켜기)
2. 명령어: LAYTHW (모든 레이어 해동)
3. 다시 DXF로 저장
```

### 문제 2: 블록이 변환 안됨

**원인:** 블록 참조

**해결:**
```
AutoCAD에서:
1. 명령어: EXPLODE (블록 분해)
2. 모든 블록 선택 후 실행
3. 다시 DXF로 저장
```

### 문제 3: 3D 객체 문제

**원인:** 웹앱은 2D만 지원

**해결:**
```
AutoCAD에서:
1. 명령어: FLATTEN (3D → 2D 변환)
2. 다시 DXF로 저장
```

### 문제 4: 파일이 너무 큼

**원인:** 복잡한 도면, 불필요한 데이터

**해결:**
```
AutoCAD에서:
1. 명령어: PURGE (정리)
2. 명령어: AUDIT (오류 수정)
3. 명령어: OVERKILL (중복 제거)
4. 다시 DXF로 저장
```

---

## 📱 모바일에서 DWG → DXF 변환

### iPhone/iPad 앱:

#### 1) AutoCAD Mobile (무료)
- **다운로드:** App Store
- **기능:** DWG 보기, DXF 변환

#### 2) DWG FastView (무료)
- **다운로드:** App Store
- **기능:** DWG 보기, DXF 내보내기

**사용법:**
```
1. 앱 다운로드
2. DWG 파일 열기
3. 내보내기 → DXF 선택
4. 파일 앱에 저장
5. 웹앱에서 열기
```

### Android 앱:

- AutoCAD Mobile
- DWG FastView
- CAD Reader

---

## 🎯 빠른 가이드 (요약)

### AutoCAD가 있는 경우:
```
1. DWG 파일 열기
2. 파일 → 다른 이름으로 저장 → DXF
3. 버전: AutoCAD 2000 DXF
4. 저장 → 웹앱에서 열기
```

### AutoCAD가 없는 경우:
```
옵션 A: DWG TrueView 다운로드 (가장 정확)
옵션 B: 온라인 변환 (CloudConvert)
옵션 C: LibreCAD 사용 (무료 오픈소스)
```

---

## ⚠️ 중요 사항

### 보안
- 중요한 도면은 온라인 변환 서비스 사용 주의
- 로컬 프로그램 사용 권장 (DWG TrueView, LibreCAD)

### 호환성
- DXF 버전: AutoCAD 2000 또는 R12 권장
- 너무 최신 버전은 웹앱에서 안 열릴 수 있음

### 데이터 손실
- 일부 AutoCAD 전용 기능은 DXF 변환 시 손실 가능
  - 동적 블록
  - 파라메트릭 제약
  - 일부 3D 기능
- 기본 2D 도면은 문제 없음

---

## 💬 자주 묻는 질문

### Q1: DWG를 직접 열 수 없나요?
**A:** 아니요. DWG는 독점 포맷이라 브라우저에서 파싱이 불가능합니다. DXF로 변환 필요합니다.

### Q2: DWG와 DXF의 차이는?
**A:** 
- **DWG:** Autodesk 독점 바이너리 포맷 (압축, 빠름)
- **DXF:** 오픈 텍스트 포맷 (호환성 높음, 약간 큼)

### Q3: 변환하면 데이터가 손실되나요?
**A:** 기본 2D 도면은 손실 없습니다. 고급 기능(동적 블록 등)은 일부 손실 가능합니다.

### Q4: 온라인 변환이 안전한가요?
**A:** 중요하지 않은 도면은 괜찮지만, 중요한 도면은 로컬 프로그램 사용을 권장합니다.

### Q5: 변환 시간은?
**A:** 
- 로컬: 거의 즉시 (파일 크기에 따라)
- 온라인: 1-5분 (업로드/다운로드 포함)

### Q6: 무료로 변환 가능한가요?
**A:** 네! DWG TrueView, LibreCAD 모두 무료입니다.

---

## 🔗 유용한 링크

### 공식 도구:
- **DWG TrueView:** https://www.autodesk.com/products/dwg/viewers
- **LibreCAD:** https://librecad.org/

### 온라인 변환:
- **CloudConvert:** https://cloudconvert.com/dwg-to-dxf
- **Zamzar:** https://www.zamzar.com/convert/dwg-to-dxf/

### 참고 자료:
- **DXF 포맷 설명:** https://www.autodesk.com/techpubs/autocad/dxf/
- **파일 형식 비교:** https://en.wikipedia.org/wiki/AutoCAD_DXF

---

## 📞 도움이 필요하시면

변환 중 문제가 생기면:
1. 파일이 손상되지 않았는지 AutoCAD/뷰어로 확인
2. 더 오래된 DXF 버전(R12)으로 시도
3. 도면을 단순화 (PURGE, EXPLODE)
4. 여러 부분으로 나눠서 변환

---

**마지막 업데이트:** 2025-11-10
**관련 문서:** DXF_호환성_가이드.md

