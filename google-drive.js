/**
 * Google Drive API 관리 클래스
 * 참조: 참조/1111_01_드라이브접속성공/google-drive.js
 * 
 * 주요 기능:
 * - Google Identity Services를 통한 OAuth 인증
 * - DXF 파일 목록 조회
 * - 파일 다운로드/업로드
 * - 메타데이터 저장
 */

class GoogleDriveManager {
    constructor() {
        // OAuth 설정
        this.clientId = '906332453523-or8l93395kamm6sipv4hogn93i2clj3k.apps.googleusercontent.com';
        this.apiKey = 'AIzaSyAMBSJ39taPtfZgkIocKzIx3rutrCcaMaI';
        this.scopes = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive';
        
        // 대상 폴더 ID (제공된 Google Drive 폴더)
        this.targetFolderId = '18NRsrVaR2OUiU4mf5zMseoFM-fij0FWX';
        
        // 액세스 토큰
        this.accessToken = null;
        
        // Token Client
        this.tokenClient = null;
        
        // 초기화 완료 여부
        this.initialized = false;
    }

    /**
     * Google Identity Services 초기화
     */
    async initialize() {
        return new Promise((resolve) => {
            console.log('🔑 Google Identity Services 초기화 중...');
            
            // GIS 라이브러리가 로드될 때까지 대기
            const checkGIS = setInterval(() => {
                if (window.google && window.google.accounts) {
                    clearInterval(checkGIS);
                    
                    console.log('✅ Google Identity Services 로드됨');
                    
                    // Token Client 초기화
                    this.tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: this.clientId,
                        scope: this.scopes,
                        callback: (response) => {
                            if (response.access_token) {
                                this.accessToken = response.access_token;
                                this.initialized = true;
                                console.log('✅ Google Drive 인증 성공');
                            }
                        },
                    });
                    
                    console.log('✅ Token Client 초기화 완료');
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * 사용자 인증 요청
     */
    async authenticate() {
        if (!this.tokenClient) {
            throw new Error('TokenClient가 초기화되지 않았습니다');
        }

        return new Promise((resolve, reject) => {
            console.log('🔐 인증 요청 중...');
            
            // 콜백 재설정 (Promise 방식으로 처리)
            this.tokenClient.callback = (response) => {
                if (response.error) {
                    console.error('❌ 인증 실패:', response.error);
                    reject(response);
                    return;
                }
                
                this.accessToken = response.access_token;
                this.initialized = true;
                console.log('✅ 인증 완료');
                resolve(this.accessToken);
            };

            // 인증 요청 (사용자에게 로그인 창 표시)
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    /**
     * 액세스 토큰 확인
     */
    ensureAuthenticated() {
        if (!this.accessToken) {
            throw new Error('인증이 필요합니다. 먼저 로그인하세요.');
        }
    }

    /**
     * 지정된 폴더에서 DXF 파일 목록 가져오기
     */
    async listDxfFiles() {
        this.ensureAuthenticated();

        console.log('📂 DXF 파일 목록 조회 중...');

        const query = `'${this.targetFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime,mimeType)&orderBy=modifiedTime desc&key=${this.apiKey}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`파일 목록 가져오기 실패: ${response.statusText}`);
        }

        const data = await response.json();
        
        // .dxf 파일만 필터링
        const dxfFiles = data.files.filter(file => 
            file.name.toLowerCase().endsWith('.dxf')
        );

        console.log(`✅ DXF 파일 ${dxfFiles.length}개 발견`);

        return dxfFiles;
    }

    /**
     * 파일 다운로드
     */
    async downloadFile(fileId) {
        this.ensureAuthenticated();

        console.log('📥 파일 다운로드 중...');

        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${this.apiKey}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`파일 다운로드 실패: ${response.statusText}`);
        }

        console.log('✅ 다운로드 완료');
        return await response.text();
    }

    /**
     * 파일 업로드 (멀티파트)
     */
    async uploadFile(fileName, content, mimeType = 'text/plain') {
        this.ensureAuthenticated();

        console.log('📤 파일 업로드 중:', fileName);

        const metadata = {
            name: fileName,
            parents: [this.targetFolderId],
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: mimeType }));

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
            body: form,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`파일 업로드 실패: ${error}`);
        }

        const result = await response.json();
        console.log('✅ 업로드 완료:', result.name);
        return result;
    }

    /**
     * 기존 파일 업데이트
     */
    async updateFile(fileId, content, mimeType = 'text/plain') {
        this.ensureAuthenticated();

        console.log('🔄 파일 업데이트 중...');

        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': mimeType,
            },
            body: content,
        });

        if (!response.ok) {
            throw new Error(`파일 업데이트 실패: ${response.statusText}`);
        }

        console.log('✅ 업데이트 완료');
        return await response.json();
    }

    /**
     * 파일 검색 (이름으로)
     */
    async findFileByName(fileName) {
        this.ensureAuthenticated();

        const query = `name='${fileName}' and '${this.targetFolderId}' in parents and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&key=${this.apiKey}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`파일 검색 실패: ${response.statusText}`);
        }

        const data = await response.json();
        return data.files.length > 0 ? data.files[0] : null;
    }

    /**
     * 이미지 업로드 (Base64에서 변환)
     */
    async uploadImage(fileName, base64Data) {
        // Base64를 Blob으로 변환
        const base64Response = await fetch(base64Data);
        const blob = await base64Response.blob();

        return this.uploadFile(fileName, blob, blob.type);
    }

    /**
     * 메타데이터 JSON 저장
     */
    async saveMetadata(dxfFileName, metadata) {
        const metadataFileName = dxfFileName.replace('.dxf', '_metadata.json');
        const metadataContent = JSON.stringify(metadata, null, 2);

        // 기존 메타데이터 파일이 있는지 확인
        const existingFile = await this.findFileByName(metadataFileName);

        if (existingFile) {
            // 업데이트
            return await this.updateFile(existingFile.id, metadataContent, 'application/json');
        } else {
            // 새로 생성
            return await this.uploadFile(metadataFileName, metadataContent, 'application/json');
        }
    }

    /**
     * 메타데이터 JSON 불러오기
     */
    async loadMetadata(dxfFileName) {
        const metadataFileName = dxfFileName.replace('.dxf', '_metadata.json');
        
        try {
            const file = await this.findFileByName(metadataFileName);
            if (file) {
                const content = await this.downloadFile(file.id);
                return JSON.parse(content);
            }
        } catch (error) {
            console.warn('메타데이터를 불러올 수 없습니다:', error);
        }

        // 메타데이터가 없으면 빈 구조 반환
        return {
            dxfFile: dxfFileName,
            photos: [],
            texts: [],
            lastModified: new Date().toISOString(),
        };
    }

    /**
     * 로그아웃
     */
    logout() {
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('🔓 로그아웃 완료');
            });
        }
        this.accessToken = null;
        this.initialized = false;
    }
}

// 전역 인스턴스 생성
window.driveManager = new GoogleDriveManager();

// 초기화 함수
window.initGoogleDrive = async function() {
    try {
        await window.driveManager.initialize();
        console.log('✅ Google Drive 준비 완료');
        
        // 앱에서 사용할 수 있도록 전역 함수 등록
        window.authenticateGoogleDrive = async () => {
            try {
                await window.driveManager.authenticate();
                return true;
            } catch (error) {
                console.error('인증 실패:', error);
                return false;
            }
        };
        
        window.listDxfFiles = async () => {
            return await window.driveManager.listDxfFiles();
        };
        
        window.downloadDxfFile = async (fileId) => {
            return await window.driveManager.downloadFile(fileId);
        };
        
        window.saveToDrive = async (appData, dxfFileName) => {
            try {
                console.log('💾 Google Drive 저장 중...');
                
                // 1. 메타데이터 저장
                const metadata = {
                    dxfFile: dxfFileName,
                    photos: appData.photos.map((photo, index) => ({
                        id: photo.id,
                        fileName: `${dxfFileName.replace('.dxf', '')}_photo_${index + 1}.jpg`,
                        position: { x: photo.x, y: photo.y },
                        size: { width: photo.width, height: photo.height },
                        memo: photo.memo || ''
                    })),
                    texts: appData.texts || [],
                    lastModified: new Date().toISOString()
                };
                
                await window.driveManager.saveMetadata(dxfFileName, metadata);
                
                // 2. 사진 파일들 업로드
                for (let i = 0; i < appData.photos.length; i++) {
                    const photo = appData.photos[i];
                    const photoFileName = `${dxfFileName.replace('.dxf', '')}_photo_${i + 1}.jpg`;
                    
                    await window.driveManager.uploadImage(photoFileName, photo.imageData);
                }
                
                console.log('✅ 저장 완료!');
                showToast('💾 Google Drive에 저장되었습니다');
                return true;
            } catch (error) {
                console.error('❌ 저장 실패:', error);
                showToast('⚠️ 저장 실패: ' + error.message);
                return false;
            }
        };
        
    } catch (error) {
        console.error('❌ Google Drive 초기화 실패:', error);
    }
};

/**
 * 토스트 메시지 표시 유틸리티
 */
function showToast(message) {
    // 기존 토스트 제거
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 새 토스트 생성
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: white;
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 15px;
        z-index: 99999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: toastFadeInOut 2.5s ease-in-out forwards;
    `;
    
    document.body.appendChild(toast);
    
    // 2.5초 후 자동 제거
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 2500);
}

// CSS 애니메이션 추가
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes toastFadeInOut {
            0% { 
                opacity: 0; 
                transform: translateX(-50%) translateY(20px); 
            }
            15% { 
                opacity: 1; 
                transform: translateX(-50%) translateY(0); 
            }
            85% { 
                opacity: 1; 
                transform: translateX(-50%) translateY(0); 
            }
            100% { 
                opacity: 0; 
                transform: translateX(-50%) translateY(-20px); 
            }
        }
    `;
    document.head.appendChild(style);
}
