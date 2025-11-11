/**
 * 메인 애플리케이션 로직
 * - UI 이벤트 처리
 * - 워크플로우 관리
 * - 상태 관리
 */

class App {
    constructor() {
        // 뷰어 인스턴스
        this.viewer = null;
        
        // 현재 상태
        this.state = {
            isLoggedIn: false,
            currentFile: null,
            currentFileName: null,
            selectedPosition: null,
            selectedPhotoBlob: null,
            selectedPhotoBase64: null,
            currentViewingMarker: null
        };
        
        // UI 요소
        this.ui = {
            loadingScreen: document.getElementById('loading-screen'),
            loginBtn: document.getElementById('login-btn'),
            openFileBtn: document.getElementById('open-file-btn'),
            zoomFitBtn: document.getElementById('zoom-fit-btn'),
            userInfo: document.getElementById('user-info'),
            userName: document.getElementById('user-name'),
            userAvatar: document.getElementById('user-avatar'),
            welcomeMessage: document.getElementById('welcome-message'),
            addPhotoModal: document.getElementById('add-photo-modal'),
            viewPhotoModal: document.getElementById('view-photo-modal'),
            cameraBtn: document.getElementById('camera-btn'),
            galleryBtn: document.getElementById('gallery-btn'),
            cameraInput: document.getElementById('camera-input'),
            galleryInput: document.getElementById('gallery-input'),
            photoPreview: document.getElementById('photo-preview'),
            previewImage: document.getElementById('preview-image'),
            memoInput: document.getElementById('memo-input'),
            savePhotoBtn: document.getElementById('save-photo-btn'),
            closeModalBtn: document.getElementById('close-modal-btn'),
            viewPhotoImage: document.getElementById('view-photo-image'),
            viewPhotoMemo: document.getElementById('view-photo-memo'),
            deletePhotoBtn: document.getElementById('delete-photo-btn'),
            closeViewModalBtn: document.getElementById('close-view-modal-btn')
        };
    }

    /**
     * 앱 초기화
     */
    async init() {
        try {
            console.log('앱 초기화 시작...');
            
            // DXF 뷰어 초기화
            const canvas = document.getElementById('dxf-canvas');
            this.viewer = new DxfViewer(canvas);
            
            // Google Drive API 초기화
            await driveManager.init();
            
            // UI 이벤트 리스너 등록
            this.setupEventListeners();
            
            // 로딩 화면 숨기기
            this.ui.loadingScreen.style.display = 'none';
            
            console.log('앱 초기화 완료');
        } catch (error) {
            console.error('앱 초기화 실패:', error);
            alert('앱을 초기화하는 중 오류가 발생했습니다.');
        }
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 로그인 버튼
        this.ui.loginBtn.addEventListener('click', () => this.handleLogin());
        
        // 파일 열기 버튼
        this.ui.openFileBtn.addEventListener('click', () => this.handleOpenFile());
        
        // 전체보기 버튼
        this.ui.zoomFitBtn.addEventListener('click', () => this.viewer.zoomToFit());
        
        // 카메라 버튼
        this.ui.cameraBtn.addEventListener('click', () => this.ui.cameraInput.click());
        
        // 갤러리 버튼
        this.ui.galleryBtn.addEventListener('click', () => this.ui.galleryInput.click());
        
        // 파일 입력 (카메라)
        this.ui.cameraInput.addEventListener('change', (e) => this.handlePhotoSelected(e));
        
        // 파일 입력 (갤러리)
        this.ui.galleryInput.addEventListener('change', (e) => this.handlePhotoSelected(e));
        
        // 저장 버튼
        this.ui.savePhotoBtn.addEventListener('click', () => this.handleSavePhoto());
        
        // 모달 닫기 버튼들
        this.ui.closeModalBtn.addEventListener('click', () => this.closeAddPhotoModal());
        this.ui.closeViewModalBtn.addEventListener('click', () => this.closeViewPhotoModal());
        
        // 삭제 버튼
        this.ui.deletePhotoBtn.addEventListener('click', () => this.handleDeletePhoto());
        
        // 뷰어 이벤트
        const canvas = document.getElementById('dxf-canvas');
        
        // 롱프레스 이벤트
        canvas.addEventListener('longpress', (e) => this.handleLongPress(e));
        
        // 마커 클릭 이벤트
        canvas.addEventListener('markerclick', (e) => this.handleMarkerClick(e));
    }

    /**
     * 로그인 처리
     */
    async handleLogin() {
        try {
            this.ui.loginBtn.disabled = true;
            this.ui.loginBtn.textContent = '🔐 로그인 중...';
            
            const userProfile = await driveManager.signIn();
            
            this.state.isLoggedIn = true;
            
            // UI 업데이트
            this.ui.loginBtn.style.display = 'none';
            this.ui.userInfo.style.display = 'flex';
            this.ui.userName.textContent = userProfile.name;
            this.ui.userAvatar.src = userProfile.imageUrl;
            this.ui.openFileBtn.disabled = false;
            
            console.log('로그인 성공:', userProfile);
        } catch (error) {
            console.error('로그인 실패:', error);
            alert('로그인에 실패했습니다. 다시 시도해주세요.');
            this.ui.loginBtn.disabled = false;
            this.ui.loginBtn.textContent = '🔐 로그인';
        }
    }

    /**
     * 파일 열기 처리
     */
    async handleOpenFile() {
        try {
            this.ui.openFileBtn.disabled = true;
            this.ui.openFileBtn.textContent = '📂 파일 선택 중...';
            
            // Google Picker로 파일 선택
            const file = await driveManager.pickFile();
            
            if (!file) {
                this.ui.openFileBtn.disabled = false;
                this.ui.openFileBtn.textContent = '📂 파일 열기';
                return;
            }
            
            console.log('선택된 파일:', file);
            
            // 로딩 표시
            this.ui.loadingScreen.style.display = 'flex';
            this.ui.loadingScreen.querySelector('p').textContent = 'DXF 파일 로딩 중...';
            
            // DXF 파일 다운로드
            const dxfContent = await driveManager.downloadFile(file.id);
            
            // 뷰어에 로드
            await this.viewer.loadDxf(dxfContent);
            
            // 메타데이터 로드 (기존에 저장된 마커들)
            const metadata = await driveManager.loadMetadata(file.name);
            if (metadata && metadata.markers) {
                console.log('기존 메타데이터 로드:', metadata);
                
                // 마커 복원
                for (const markerData of metadata.markers) {
                    // 사진 데이터가 파일 ID인 경우 다운로드
                    let photoData = markerData.photoData;
                    if (markerData.photoFileId) {
                        photoData = await driveManager.downloadPhotoAsBase64(markerData.photoFileId);
                    }
                    
                    this.viewer.addMarker(
                        markerData.worldX,
                        markerData.worldY,
                        photoData,
                        markerData.memo
                    );
                }
            }
            
            // 상태 업데이트
            this.state.currentFile = file;
            this.state.currentFileName = file.name;
            
            // UI 업데이트
            this.ui.welcomeMessage.style.display = 'none';
            this.ui.zoomFitBtn.disabled = false;
            this.ui.loadingScreen.style.display = 'none';
            this.ui.openFileBtn.disabled = false;
            this.ui.openFileBtn.textContent = '📂 파일 열기';
            
            console.log('파일 로드 완료');
        } catch (error) {
            console.error('파일 열기 실패:', error);
            alert('파일을 여는 중 오류가 발생했습니다.');
            this.ui.loadingScreen.style.display = 'none';
            this.ui.openFileBtn.disabled = false;
            this.ui.openFileBtn.textContent = '📂 파일 열기';
        }
    }

    /**
     * 롱프레스 처리
     */
    handleLongPress(e) {
        console.log('롱프레스 이벤트:', e.detail);
        
        // 선택된 위치 저장
        this.state.selectedPosition = {
            worldX: e.detail.worldX,
            worldY: e.detail.worldY
        };
        
        // 사진 추가 모달 열기
        this.openAddPhotoModal();
    }

    /**
     * 마커 클릭 처리
     */
    handleMarkerClick(e) {
        console.log('마커 클릭:', e.detail.marker);
        
        this.state.currentViewingMarker = e.detail.marker;
        
        // 사진 보기 모달 열기
        this.openViewPhotoModal(e.detail.marker);
    }

    /**
     * 사진 추가 모달 열기
     */
    openAddPhotoModal() {
        // 모달 초기화
        this.state.selectedPhotoBlob = null;
        this.state.selectedPhotoBase64 = null;
        this.ui.photoPreview.style.display = 'none';
        this.ui.previewImage.src = '';
        this.ui.memoInput.value = '';
        this.ui.savePhotoBtn.disabled = true;
        this.ui.cameraInput.value = '';
        this.ui.galleryInput.value = '';
        
        // 모달 표시
        this.ui.addPhotoModal.style.display = 'flex';
    }

    /**
     * 사진 추가 모달 닫기
     */
    closeAddPhotoModal() {
        this.ui.addPhotoModal.style.display = 'none';
    }

    /**
     * 사진 선택 처리
     */
    async handlePhotoSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // 사진 Blob 저장
            this.state.selectedPhotoBlob = file;
            
            // Base64로 변환하여 미리보기
            const base64 = await this.fileToBase64(file);
            this.state.selectedPhotoBase64 = base64;
            
            // 미리보기 표시
            this.ui.previewImage.src = base64;
            this.ui.photoPreview.style.display = 'block';
            
            // 저장 버튼 활성화
            this.ui.savePhotoBtn.disabled = false;
            
            console.log('사진 선택 완료');
        } catch (error) {
            console.error('사진 처리 실패:', error);
            alert('사진을 처리하는 중 오류가 발생했습니다.');
        }
    }

    /**
     * 파일을 Base64로 변환
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * 사진 저장 처리
     */
    async handleSavePhoto() {
        if (!this.state.selectedPhotoBlob || !this.state.selectedPosition) {
            alert('사진과 위치 정보가 필요합니다.');
            return;
        }
        
        try {
            this.ui.savePhotoBtn.disabled = true;
            this.ui.savePhotoBtn.textContent = '💾 저장 중...';
            
            const memo = this.ui.memoInput.value.trim();
            
            // 사진 파일명 생성 (타임스탬프 기반)
            const timestamp = Date.now();
            const photoFileName = `${this.state.currentFileName.replace('.dxf', '')}_photo_${timestamp}.jpg`;
            
            // 사진 업로드
            console.log('사진 업로드 중...');
            const uploadedPhoto = await driveManager.uploadPhoto(this.state.selectedPhotoBlob, photoFileName);
            
            // 마커 추가
            this.viewer.addMarker(
                this.state.selectedPosition.worldX,
                this.state.selectedPosition.worldY,
                this.state.selectedPhotoBase64,
                memo
            );
            
            // 메타데이터 저장
            await this.saveMetadata(uploadedPhoto.id);
            
            console.log('사진 및 메타데이터 저장 완료');
            
            // 모달 닫기
            this.closeAddPhotoModal();
            
            this.ui.savePhotoBtn.disabled = false;
            this.ui.savePhotoBtn.textContent = '💾 저장';
        } catch (error) {
            console.error('사진 저장 실패:', error);
            alert('사진을 저장하는 중 오류가 발생했습니다.');
            this.ui.savePhotoBtn.disabled = false;
            this.ui.savePhotoBtn.textContent = '💾 저장';
        }
    }

    /**
     * 메타데이터 저장
     */
    async saveMetadata(lastPhotoFileId = null) {
        const markers = this.viewer.getMarkers();
        
        // 메타데이터 구조
        const metadata = {
            version: '1.0',
            dxfFileName: this.state.currentFileName,
            lastModified: new Date().toISOString(),
            markers: markers.map((marker, index) => ({
                id: marker.id,
                worldX: marker.worldX,
                worldY: marker.worldY,
                memo: marker.memo,
                photoFileId: lastPhotoFileId || `photo_${marker.id}`, // 실제로는 각 마커의 파일 ID를 관리해야 함
                // 데스크탑에서 사용할 정보
                text: marker.memo,
                textColor: 'RED', // 빨간색
                textHeight: 1.0, // 크기 1
                insertionPoint: {
                    x: marker.worldX,
                    y: marker.worldY,
                    z: 0
                }
            }))
        };
        
        console.log('메타데이터 저장:', metadata);
        
        await driveManager.saveMetadata(this.state.currentFileName, metadata);
    }

    /**
     * 사진 보기 모달 열기
     */
    openViewPhotoModal(marker) {
        // 사진 및 메모 표시
        this.ui.viewPhotoImage.src = marker.photoData;
        this.ui.viewPhotoMemo.textContent = marker.memo || '(메모 없음)';
        
        // 모달 표시
        this.ui.viewPhotoModal.style.display = 'flex';
    }

    /**
     * 사진 보기 모달 닫기
     */
    closeViewPhotoModal() {
        this.ui.viewPhotoModal.style.display = 'none';
        this.state.currentViewingMarker = null;
    }

    /**
     * 사진 삭제 처리
     */
    async handleDeletePhoto() {
        if (!this.state.currentViewingMarker) return;
        
        const confirmed = confirm('이 사진을 삭제하시겠습니까?');
        if (!confirmed) return;
        
        try {
            // 마커 삭제
            this.viewer.removeMarker(this.state.currentViewingMarker.id);
            
            // 메타데이터 업데이트
            await this.saveMetadata();
            
            console.log('사진 삭제 완료');
            
            // 모달 닫기
            this.closeViewPhotoModal();
        } catch (error) {
            console.error('사진 삭제 실패:', error);
            alert('사진을 삭제하는 중 오류가 발생했습니다.');
        }
    }
}

// 앱 인스턴스 생성 및 초기화
const app = new App();

// DOM 로드 완료 후 앱 시작
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

