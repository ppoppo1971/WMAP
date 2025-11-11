# 📚 라이브러리 상세 설명

## ✅ **사용 중인 라이브러리**

### 1️⃣ **dxf-parser.min.js** (필수 ✅)

#### 🎯 **주요 기능**
AutoCAD DXF 파일(텍스트 형식)을 JavaScript 객체로 변환하는 파서

#### 📥 **입력 (Input)**
```
DXF 텍스트 파일:
0
SECTION
2
ENTITIES
0
LINE
8
0
10
100.0
20
200.0
11
300.0
21
400.0
...
```

#### 📤 **출력 (Output)**
```javascript
{
  header: {
    $ACADVER: "AC1021"  // AutoCAD 2007
  },
  tables: {
    layers: {
      "0": {
        name: "0",
        colorIndex: 7,
        color: "#FFFFFF"
      }
    }
  },
  entities: [
    {
      type: "LINE",
      layer: "0",
      vertices: [
        {x: 100.0, y: 200.0, z: 0.0},
        {x: 300.0, y: 400.0, z: 0.0}
      ],
      colorIndex: 7,
      color: "#FFFFFF"
    }
  ],
  blocks: {...}
}
```

#### 🔧 **지원 엔티티**

| 엔티티 | 설명 | 프로젝트 사용 |
|--------|------|---------------|
| LINE | 직선 | ✅ |
| POLYLINE | 폴리선 | ✅ |
| LWPOLYLINE | 경량 폴리선 | ✅ |
| CIRCLE | 원 | ✅ |
| ARC | 호 | ✅ |
| ELLIPSE | 타원 | ✅ |
| POINT | 점 | ✅ |
| TEXT | 텍스트 | ✅ |
| MTEXT | 멀티라인 텍스트 | ✅ |
| INSERT | 블록 삽입 | ✅ |
| SPLINE | 스플라인 곡선 | ✅ |
| SOLID | 채워진 도형 | ✅ |
| 3DFACE | 3D 면 | ✅ |

#### 💻 **프로젝트 사용 코드**

```javascript
// DXF 텍스트 파일 → JavaScript 객체
const parser = new DxfParser();
const dxfData = parser.parseSync(dxfText);

// 결과 활용
console.log('엔티티 개수:', dxfData.entities.length);
console.log('첫 번째 엔티티:', dxfData.entities[0]);

// SVG 렌더링
dxfData.entities.forEach(entity => {
  const svgElement = this.createSvgElement(entity);
  svg.appendChild(svgElement);
});
```

#### 📊 **파일 정보**
- **크기**: ~100KB (minified)
- **버전**: 1.2.1
- **라이선스**: MIT
- **소스**: https://github.com/gdsestimating/dxf-parser

---

## ❌ **제거된 라이브러리**

### 2️⃣ **jszip.min.js** (제거됨 ❌)

#### ❓ **왜 제거했나요?**

**이전 방식 (JSZip 사용)**:
```javascript
// 로컬 ZIP 다운로드
const zip = new JSZip();
zip.file('drawing.dxf', dxfFile);
zip.folder('images').file('photo1.jpg', photoBlob);
zip.file('metadata.json', jsonString);

const blob = await zip.generateAsync({type: 'blob'});
downloadFile(blob, 'project.zip');  // 로컬 다운로드
```

**새 방식 (Google Drive 직접 업로드)**:
```javascript
// Google Drive에 개별 파일로 직접 업로드
await uploadFile('metadata.json', jsonString, 'application/json', folderId);
await uploadFile('photo_1.jpg', photoBlob, 'image/jpeg', folderId);
await uploadFile('photo_2.jpg', photoBlob, 'image/jpeg', folderId);
// 자동으로 Google Drive 폴더에 저장됨
```

#### ✅ **제거의 이점**

| 항목 | 개선 |
|------|------|
| **파일 크기** | -100KB (25% 절감) |
| **로딩 속도** | 더 빠름 |
| **데이터 흐름** | 단순화 (중간 ZIP 과정 제거) |
| **실시간성** | 즉시 업로드 (ZIP 생성 대기 불필요) |
| **협업** | 팀원이 바로 Drive에서 확인 가능 |

#### 🔄 **데이터 흐름 비교**

**이전 (JSZip 사용)**:
```
사진 추가 → 메모리 저장 → [수동] 내보내기 버튼 클릭 
→ JSZip으로 압축 → ZIP 다운로드 → 수동으로 Drive 업로드
```

**현재 (Google Drive 직접)**:
```
사진 추가 → 즉시 Google Drive 업로드 ✅
메모 작성 → 즉시 metadata.json 업데이트 ✅
```

---

## 🎯 **최종 라이브러리 목록**

### 필수 라이브러리 (1개)

| 라이브러리 | 용도 | 크기 | 상태 |
|-----------|------|------|------|
| dxf-parser.min.js | DXF 파일 파싱 | ~100KB | ✅ 사용 중 |

### 외부 API (CDN)

| API | 용도 | 로드 방식 |
|-----|------|-----------|
| Google Drive API | 파일 업로드/다운로드 | CDN |
| Google Picker API | 파일 선택 UI | CDN |
| Google Identity Services | OAuth 인증 | CDN |

---

## 💾 **저장 방식 상세 비교**

### 현재 구현 (Google Drive 직접 저장)

```javascript
// google-drive.js의 autoSaveToDrive() 함수

// 1. 폴더 생성
도면명_edited/

// 2. 개별 파일 업로드
metadata.json      ← 위치, 메모 정보
photo_1.jpg        ← 실제 사진
photo_2.jpg
photo_3.jpg

// 3. 데스크탑에서 확인
- Google Drive 웹에서 바로 확인
- metadata.json 다운로드 → AutoCAD 리스프로 읽기
- 사진들도 바로 확인 가능
```

### 이전 방식 (JSZip 사용 시)

```javascript
// 1. 모든 파일을 메모리에 모음
// 2. 내보내기 버튼 클릭
// 3. JSZip으로 압축
// 4. ZIP 파일 다운로드 (폰 저장소)
// 5. 수동으로 Google Drive에 업로드

❌ 단점:
- 수동 작업 필요
- 모바일에서 파일 관리 불편
- 실시간 협업 불가
```

---

## 📱 **모바일 최적화**

### Google Drive 방식이 더 나은 이유

1. **자동화**: 사진 찍으면 즉시 업로드 (버튼 클릭 불필요)
2. **안정성**: 앱이 종료되어도 이미 저장됨
3. **접근성**: PC에서 바로 Drive 접근 가능
4. **백업**: Google Drive = 자동 백업
5. **공유**: 링크만 보내면 팀원과 공유

### JSZip 방식의 문제점 (모바일)

1. ZIP 생성에 시간 소요 (대용량 시)
2. 폰 저장소에 다운로드 (공간 낭비)
3. 수동으로 Drive 업로드 필요
4. 여러 단계 필요 (불편)

---

## 🚀 **결론**

### ✅ **jszip.min.js 제거가 올바른 선택입니다!**

**이유:**
1. ✅ **Google Drive 자동 저장**: 실시간 개별 파일 업로드
2. ✅ **파일 크기 절감**: 100KB 감소
3. ✅ **사용자 경험 개선**: 버튼 클릭 불필요
4. ✅ **모바일 최적화**: 자동화된 워크플로우
5. ✅ **데이터 안정성**: 즉시 클라우드 백업

### 📦 **필요한 라이브러리 (최종)**

```
필수: dxf-parser.min.js (DXF 파일 읽기)
제거: jszip.min.js (Google Drive 자동 저장으로 대체)
```

### 🎉 **최적화된 워크플로우**

```
현장 작업:
1. 아이폰에서 웹앱 열기
2. Google Drive에서 DXF 선택
3. 롱프레스 → 사진 촬영 → 자동 저장 ✅
4. 메모 입력 → 자동 저장 ✅

사무실 작업:
1. PC에서 Google Drive 열기
2. metadata.json 다운로드
3. AutoCAD 리스프 실행
4. 사진 및 텍스트 자동 삽입 ✅
```

**더 이상 ZIP 파일 다운로드/업로드 과정이 필요 없습니다!** 🎉
