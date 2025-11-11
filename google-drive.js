/**
 * Google Drive API 연동 모듈
 * - OAuth 2.0 인증
 * - 파일 선택 (Picker API)
 * - 파일 다운로드/업로드
 */

// ===== 설정 =====
const GOOGLE_CONFIG = {
    // OAuth 클라이언트 ID
    CLIENT_ID: '906332453523-or8l93395kamm6sipv4hogn93i2clj3k.apps.googleusercontent.com',
    
    // API 키
    API_KEY: 'AIzaSyAMBSJ39taPtfZgkIocKzIx3rutrCcaMaI',
    
    // OAuth 권한 범위
    SCOPES: [
        'https://www.googleapis.com/auth/drive.file',  // 앱이 생성한 파일만 접근
        'https://www.googleapis.com/auth/drive.readonly'  // 읽기 권한
    ].join(' '),
    
    // 지정된 Google Drive 폴더 ID
    FOLDER_ID: '18NRsrVaR2OUiU4mf5zMseoFM-fij0FWX'
};

// ===== 전역 변수 =====
let gapiInited = false;  // Google API 초기화 상태
let gisInited = false;   // Google Identity Services 초기화 상태
let tokenClient;         // OAuth 토큰 클라이언트
let accessToken = null;  // 액세스 토큰
let pickerInited = false; // Picker API 초기화 상태

// ===== Google API 로드 및 초기화 =====

/**
 * Google API 스크립트 로드 완료 콜백
 * gapi 라이브러리가 로드되면 자동 호출됨
 */
function gapiLoaded() {
    console.log('📦 Google API 로드됨');
    gapi.load('client:picker', initializeGapiClient);
}

/**
 * Google API 클라이언트 초기화
 */
async function initializeGapiClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_CONFIG.API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
        });
        
        gapiInited = true;
        console.log('✅ Google API 초기화 완료');
        maybeEnableButtons();
    } catch (error) {
        console.error('❌ Google API 초기화 실패:', error);
        alert('Google Drive 연결 실패. 페이지를 새로고침해주세요.');
    }
}

/**
 * Google Identity Services (OAuth) 로드 완료 콜백
 */
function gisLoaded() {
    console.log('📦 Google Identity Services 로드됨');
    
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CONFIG.CLIENT_ID,
        scope: GOOGLE_CONFIG.SCOPES,
        callback: '', // 나중에 설정
    });
    
    gisInited = true;
    console.log('✅ OAuth 클라이언트 초기화 완료');
    maybeEnableButtons();
}

/**
 * 모든 API가 준비되면 버튼 활성화
 */
function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        // Google Drive 버튼 활성화
        const driveBtn = document.getElementById('google-drive-btn');
        if (driveBtn) {
            driveBtn.disabled = false;
            driveBtn.textContent = '📂 Google Drive에서 열기';
        }
        
        console.log('✅ Google Drive 기능 준비 완료!');
    }
}

// ===== OAuth 인증 =====

/**
 * 액세스 토큰 요청
 * @param {Function} callback - 토큰 획득 후 실행할 콜백
 */
function requestAccessToken(callback) {
    tokenClient.callback = async (response) => {
        if (response.error !== undefined) {
            console.error('❌ OAuth 오류:', response);
            alert('Google 로그인에 실패했습니다: ' + response.error);
            return;
        }
        
        accessToken = response.access_token;
        console.log('✅ 액세스 토큰 획득 완료');
        
        if (callback) callback();
    };

    // 이미 토큰이 있으면 바로 콜백 실행
    if (accessToken !== null) {
        if (callback) callback();
        return;
    }

    // 토큰 요청 (사용자 로그인 프롬프트)
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * 로그아웃 (토큰 폐기)
 */
function revokeAccessToken() {
    if (accessToken) {
        google.accounts.oauth2.revoke(accessToken, () => {
            console.log('🔓 로그아웃됨');
            accessToken = null;
        });
    }
}

// ===== Google Picker (파일 선택기) =====

/**
 * Google Picker로 DXF 파일 선택
 */
function showDrivePicker() {
    // 인증 확인
    requestAccessToken(() => {
        createPicker();
    });
}

/**
 * Picker UI 생성
 */
function createPicker() {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setParent(GOOGLE_CONFIG.FOLDER_ID)  // 특정 폴더만 표시
        .setMimeTypes('application/dxf,application/octet-stream');  // DXF 파일만

    const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)  // 네비게이션 숨김
        .setAppId('906332453523')
        .setOAuthToken(accessToken)
        .addView(view)
        .setDeveloperKey(GOOGLE_CONFIG.API_KEY)
        .setCallback(pickerCallback)
        .setTitle('📐 DXF 도면 선택')
        .build();
    
    picker.setVisible(true);
}

/**
 * Picker 선택 콜백
 * @param {Object} data - 선택된 파일 정보
 */
async function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        const file = data.docs[0];
        console.log('📄 선택된 파일:', file.name);
        
        // 로딩 표시
        document.getElementById('loading').classList.add('active');
        
        try {
            // 파일 다운로드
            const fileContent = await downloadFile(file.id);
            
            // 앱에 파일 전달 (app.js의 loadDxfFromText 호출)
            if (window.app && window.app.loadDxfFromText) {
                window.app.loadDxfFromText(fileContent, file.name);
                
                // 현재 파일 정보 저장 (나중에 업로드할 때 사용)
                window.currentDriveFile = {
                    id: file.id,
                    name: file.name,
                    folderId: GOOGLE_CONFIG.FOLDER_ID
                };
            }
            
            alert(`✅ ${file.name} 파일을 열었습니다!`);
        } catch (error) {
            console.error('❌ 파일 로드 오류:', error);
            alert('파일을 여는데 실패했습니다: ' + error.message);
        } finally {
            document.getElementById('loading').classList.remove('active');
        }
    }
}

// ===== 파일 다운로드 =====

/**
 * Google Drive에서 파일 다운로드
 * @param {string} fileId - 파일 ID
 * @returns {Promise<string>} 파일 내용 (텍스트)
 */
async function downloadFile(fileId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'  // 파일 내용 다운로드
        });
        
        return response.body;
    } catch (error) {
        console.error('❌ 다운로드 오류:', error);
        throw new Error('파일 다운로드 실패');
    }
}

// ===== 파일 업로드 =====

/**
 * Google Drive에 파일 업로드
 * @param {string} fileName - 파일 이름
 * @param {Blob|string} content - 파일 내용
 * @param {string} mimeType - MIME 타입
 * @param {string} parentFolderId - 부모 폴더 ID (선택)
 * @returns {Promise<Object>} 업로드된 파일 정보
 */
async function uploadFile(fileName, content, mimeType, parentFolderId = null) {
    // 인증 확인
    if (!accessToken) {
        throw new Error('로그인이 필요합니다');
    }
    
    // 메타데이터
    const metadata = {
        name: fileName,
        mimeType: mimeType
    };
    
    // 부모 폴더 설정
    if (parentFolderId) {
        metadata.parents = [parentFolderId];
    }
    
    // FormData 생성 (멀티파트 업로드)
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    
    // 내용이 문자열이면 Blob으로 변환
    if (typeof content === 'string') {
        content = new Blob([content], { type: mimeType });
    }
    form.append('file', content);
    
    // 업로드
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        },
        body: form
    });
    
    if (!response.ok) {
        throw new Error('업로드 실패: ' + response.statusText);
    }
    
    const result = await response.json();
    console.log('✅ 파일 업로드 완료:', result.name);
    return result;
}

/**
 * 기존 파일 업데이트 (덮어쓰기)
 * @param {string} fileId - 파일 ID
 * @param {Blob|string} content - 새 내용
 * @param {string} mimeType - MIME 타입
 * @returns {Promise<Object>} 업데이트된 파일 정보
 */
async function updateFile(fileId, content, mimeType) {
    if (!accessToken) {
        throw new Error('로그인이 필요합니다');
    }
    
    // 내용이 문자열이면 Blob으로 변환
    if (typeof content === 'string') {
        content = new Blob([content], { type: mimeType });
    }
    
    const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': mimeType
        },
        body: content
    });
    
    if (!response.ok) {
        throw new Error('업데이트 실패: ' + response.statusText);
    }
    
    const result = await response.json();
    console.log('✅ 파일 업데이트 완료:', fileId);
    return result;
}

/**
 * 폴더 생성
 * @param {string} folderName - 폴더 이름
 * @param {string} parentFolderId - 부모 폴더 ID
 * @returns {Promise<Object>} 생성된 폴더 정보
 */
async function createFolder(folderName, parentFolderId) {
    const metadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId]
    };
    
    const response = await gapi.client.drive.files.create({
        resource: metadata,
        fields: 'id, name'
    });
    
    console.log('✅ 폴더 생성 완료:', response.result.name);
    return response.result;
}

// ===== 자동 저장 기능 =====

/**
 * 도면 데이터를 Google Drive에 자동 저장
 * @param {Object} appData - 앱 데이터 (photos, texts 등)
 */
async function autoSaveToDrive(appData) {
    if (!accessToken) {
        console.warn('⚠️ 로그인되지 않아 자동 저장을 건너뜁니다');
        return;
    }
    
    try {
        const currentFile = window.currentDriveFile;
        if (!currentFile) {
            console.warn('⚠️ 현재 열린 파일이 없습니다');
            return;
        }
        
        console.log('💾 자동 저장 시작...');
        
        // 1. 프로젝트 폴더 생성 (파일명_edited)
        const projectFolderName = `${currentFile.name.replace('.dxf', '')}_edited`;
        const projectFolder = await createFolder(projectFolderName, currentFile.folderId);
        
        // 2. 메타데이터 JSON 생성
        const metadata = {
            originalFile: currentFile.name,
            editedDate: new Date().toISOString(),
            photos: appData.photos.map((photo, index) => ({
                id: photo.id,
                fileName: `photo_${index + 1}.jpg`,
                position: { x: photo.x, y: photo.y },
                size: { width: photo.width, height: photo.height },
                memo: photo.memo || ''
            })),
            texts: appData.texts || []
        };
        
        // 3. 메타데이터 업로드
        await uploadFile(
            'metadata.json',
            JSON.stringify(metadata, null, 2),
            'application/json',
            projectFolder.id
        );
        
        // 4. 사진 파일들 업로드
        for (let i = 0; i < appData.photos.length; i++) {
            const photo = appData.photos[i];
            const photoFileName = `photo_${i + 1}.jpg`;
            
            // Base64 → Blob 변환
            const base64Data = photo.imageData.split(',')[1];
            const blob = base64ToBlob(base64Data, 'image/jpeg');
            
            await uploadFile(photoFileName, blob, 'image/jpeg', projectFolder.id);
        }
        
        console.log('✅ 자동 저장 완료!');
        
        // UI 피드백
        showToast('💾 Google Drive에 저장되었습니다');
        
    } catch (error) {
        console.error('❌ 자동 저장 실패:', error);
        showToast('⚠️ 저장 실패: ' + error.message);
    }
}

// ===== 유틸리티 함수 =====

/**
 * Base64 → Blob 변환
 */
function base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

/**
 * 토스트 메시지 표시
 */
function showToast(message) {
    // 간단한 토스트 UI
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 20px;
        font-size: 14px;
        z-index: 10000;
        animation: fadeInOut 2s ease-in-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        document.body.removeChild(toast);
    }, 2000);
}

// CSS 애니메이션 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
        20% { opacity: 1; transform: translateX(-50%) translateY(0); }
        80% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
`;
document.head.appendChild(style);

// ===== 전역 함수 노출 =====
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
window.showDrivePicker = showDrivePicker;
window.autoSaveToDrive = autoSaveToDrive;
window.revokeAccessToken = revokeAccessToken;

