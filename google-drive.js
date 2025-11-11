// Google Drive API 관리 클래스

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
        
        // 초기화 완료 여부
        this.initialized = false;
    }

    /**
     * Google Identity Services 초기화
     */
    async initialize() {
        return new Promise((resolve) => {
            // GIS 라이브러리가 로드될 때까지 대기
            const checkGIS = setInterval(() => {
                if (window.google && window.google.accounts) {
                    clearInterval(checkGIS);
                    
                    // Token Client 초기화
                    this.tokenClient = google.accounts.oauth2.initTokenClient({
                        client_id: this.clientId,
                        scope: this.scopes,
                        callback: (response) => {
                            if (response.access_token) {
                                this.accessToken = response.access_token;
                                this.initialized = true;
                                console.log('Google Drive 인증 성공');
                            }
                        },
                    });
                    
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
            // 콜백 재설정 (Promise 방식으로 처리)
            this.tokenClient.callback = (response) => {
                if (response.error) {
                    reject(response);
                    return;
                }
                
                this.accessToken = response.access_token;
                this.initialized = true;
                resolve(this.accessToken);
            };

            // 인증 요청
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    /**
     * 액세스 토큰 확인
     */
    ensureAuthenticated() {
        if (!this.accessToken) {
            throw new Error('인증이 필요합니다. authenticate()를 먼저 호출하세요.');
        }
    }

    /**
     * 지정된 폴더에서 DXF 파일 목록 가져오기
     */
    async listDxfFiles() {
        this.ensureAuthenticated();

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

        return dxfFiles;
    }

    /**
     * 파일 다운로드
     */
    async downloadFile(fileId) {
        this.ensureAuthenticated();

        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${this.apiKey}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error(`파일 다운로드 실패: ${response.statusText}`);
        }

        return await response.text();
    }

    /**
     * 파일 업로드 (멀티파트)
     */
    async uploadFile(fileName, content, mimeType = 'text/plain') {
        this.ensureAuthenticated();

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

        return await response.json();
    }

    /**
     * 기존 파일 업데이트
     */
    async updateFile(fileId, content, mimeType = 'text/plain') {
        this.ensureAuthenticated();

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
            annotations: [],
            lastModified: new Date().toISOString(),
        };
    }
}

export default GoogleDriveManager;

