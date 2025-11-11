/**
 * Google Drive API 연동 모듈
 * - Google 로그인 처리
 * - DXF 파일 읽기
 * - 메타데이터 JSON 파일 저장
 * - 사진 파일 업로드
 */

class GoogleDriveManager {
    constructor() {
        // Google API 클라이언트 설정
        this.CLIENT_ID = '906332453523-or8l93395kamm6sipv4hogn93i2clj3k.apps.googleusercontent.com';
        this.API_KEY = 'AIzaSyAMBSJ39taPtfZgkIocKzIx3rutrCcaMaI';
        this.DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
        this.SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly';
        
        // 현재 폴더 ID (공유된 드라이브 폴더)
        this.FOLDER_ID = '18NRsrVaR2OUiU4mf5zMseoFM-fij0FWX';
        
        // 인증 토큰
        this.accessToken = null;
        
        // 현재 열린 파일 정보
        this.currentFile = null;
    }

    /**
     * Google API 초기화
     */
    async init() {
        return new Promise((resolve, reject) => {
            gapi.load('client:auth2', async () => {
                try {
                    await gapi.client.init({
                        apiKey: this.API_KEY,
                        clientId: this.CLIENT_ID,
                        discoveryDocs: this.DISCOVERY_DOCS,
                        scope: this.SCOPES
                    });
                    console.log('Google API 초기화 완료');
                    resolve();
                } catch (error) {
                    console.error('Google API 초기화 실패:', error);
                    reject(error);
                }
            });
        });
    }

    /**
     * Google 계정으로 로그인
     */
    async signIn() {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            const user = await authInstance.signIn();
            this.accessToken = user.getAuthResponse().access_token;
            
            const profile = user.getBasicProfile();
            return {
                name: profile.getName(),
                email: profile.getEmail(),
                imageUrl: profile.getImageUrl()
            };
        } catch (error) {
            console.error('로그인 실패:', error);
            throw error;
        }
    }

    /**
     * 로그아웃
     */
    async signOut() {
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        this.accessToken = null;
    }

    /**
     * 폴더 내 DXF 파일 목록 가져오기
     */
    async listDxfFiles() {
        try {
            const response = await gapi.client.drive.files.list({
                q: `'${this.FOLDER_ID}' in parents and (mimeType='application/dxf' or mimeType='application/octet-stream' or name contains '.dxf') and trashed=false`,
                fields: 'files(id, name, mimeType, modifiedTime)',
                orderBy: 'modifiedTime desc'
            });
            return response.result.files;
        } catch (error) {
            console.error('파일 목록 가져오기 실패:', error);
            throw error;
        }
    }

    /**
     * Google Picker를 사용하여 파일 선택
     */
    async pickFile() {
        return new Promise((resolve, reject) => {
            if (!google || !google.picker) {
                reject(new Error('Google Picker API가 로드되지 않았습니다'));
                return;
            }

            const picker = new google.picker.PickerBuilder()
                .addView(
                    new google.picker.DocsView(google.picker.ViewId.DOCS)
                        .setParent(this.FOLDER_ID)
                        .setMimeTypes('application/dxf,application/octet-stream')
                )
                .setOAuthToken(this.accessToken)
                .setDeveloperKey(this.API_KEY)
                .setCallback((data) => {
                    if (data.action === google.picker.Action.PICKED) {
                        const file = data.docs[0];
                        resolve(file);
                    } else if (data.action === google.picker.Action.CANCEL) {
                        reject(new Error('파일 선택이 취소되었습니다'));
                    }
                })
                .build();
            
            picker.setVisible(true);
        });
    }

    /**
     * DXF 파일 다운로드
     */
    async downloadFile(fileId) {
        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, {
                responseType: 'arraybuffer'
            });
            
            // ArrayBuffer를 문자열로 변환 (DXF는 텍스트 파일)
            const decoder = new TextDecoder('utf-8');
            const dxfContent = decoder.decode(response.body);
            
            return dxfContent;
        } catch (error) {
            console.error('파일 다운로드 실패:', error);
            throw error;
        }
    }

    /**
     * 메타데이터 JSON 파일 저장
     * @param {string} dxfFileName - 원본 DXF 파일 이름
     * @param {object} metadata - 저장할 메타데이터 객체
     */
    async saveMetadata(dxfFileName, metadata) {
        try {
            // JSON 파일명 생성 (예: test02.dxf -> test02_metadata.json)
            const jsonFileName = dxfFileName.replace('.dxf', '_metadata.json');
            
            // 메타데이터를 JSON 문자열로 변환
            const jsonContent = JSON.stringify(metadata, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json' });
            
            // 기존 메타데이터 파일이 있는지 확인
            const existingFile = await this.findMetadataFile(dxfFileName);
            
            if (existingFile) {
                // 기존 파일 업데이트
                return await this.updateFile(existingFile.id, blob, jsonFileName);
            } else {
                // 새 파일 생성
                return await this.uploadFile(blob, jsonFileName);
            }
        } catch (error) {
            console.error('메타데이터 저장 실패:', error);
            throw error;
        }
    }

    /**
     * 기존 메타데이터 파일 찾기
     */
    async findMetadataFile(dxfFileName) {
        try {
            const jsonFileName = dxfFileName.replace('.dxf', '_metadata.json');
            const response = await gapi.client.drive.files.list({
                q: `'${this.FOLDER_ID}' in parents and name='${jsonFileName}' and trashed=false`,
                fields: 'files(id, name)'
            });
            
            return response.result.files.length > 0 ? response.result.files[0] : null;
        } catch (error) {
            console.error('메타데이터 파일 검색 실패:', error);
            return null;
        }
    }

    /**
     * 새 파일 업로드
     */
    async uploadFile(blob, fileName) {
        const metadata = {
            name: fileName,
            mimeType: blob.type,
            parents: [this.FOLDER_ID]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);

        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: form
        });

        if (!response.ok) {
            throw new Error('파일 업로드 실패');
        }

        return await response.json();
    }

    /**
     * 기존 파일 업데이트
     */
    async updateFile(fileId, blob, fileName) {
        const form = new FormData();
        form.append('file', blob);

        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: blob
        });

        if (!response.ok) {
            throw new Error('파일 업데이트 실패');
        }

        return await response.json();
    }

    /**
     * 사진 파일 업로드
     * @param {Blob} photoBlob - 사진 파일 Blob
     * @param {string} photoName - 사진 파일 이름
     */
    async uploadPhoto(photoBlob, photoName) {
        try {
            return await this.uploadFile(photoBlob, photoName);
        } catch (error) {
            console.error('사진 업로드 실패:', error);
            throw error;
        }
    }

    /**
     * 메타데이터 파일 로드
     */
    async loadMetadata(dxfFileName) {
        try {
            const metadataFile = await this.findMetadataFile(dxfFileName);
            if (!metadataFile) {
                return null;
            }

            const response = await gapi.client.drive.files.get({
                fileId: metadataFile.id,
                alt: 'media'
            });

            return JSON.parse(response.body);
        } catch (error) {
            console.error('메타데이터 로드 실패:', error);
            return null;
        }
    }

    /**
     * 사진 파일 다운로드 (Base64)
     */
    async downloadPhotoAsBase64(fileId) {
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            const blob = await response.blob();
            return await this.blobToBase64(blob);
        } catch (error) {
            console.error('사진 다운로드 실패:', error);
            throw error;
        }
    }

    /**
     * Blob을 Base64로 변환
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

// 전역 GoogleDriveManager 인스턴스 생성
const driveManager = new GoogleDriveManager();

