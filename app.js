// 메인 애플리케이션 로직

import GoogleDriveManager from './google-drive.js';
import DxfViewer from './dxf-viewer.js';
import AnnotationManager from './photo-manager.js';

class DmapApp {
    constructor() {
        // 관리자 인스턴스
        this.driveManager = new GoogleDriveManager();
        this.viewer = null;
        this.annotationManager = null;

        // UI 요소
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.app = document.getElementById('app');
        this.fileListScreen = document.getElementById('fileListScreen');
        this.viewerScreen = document.getElementById('viewerScreen');
        
        // 현재 상태
        this.currentFile = null;
        this.longPressTimer = null;
        this.longPressPosition = null;

        // 초기화
        this.initialize();
    }

    /**
     * 앱 초기화
     */
    async initialize() {
        try {
            console.log('앱 초기화 중...');

            // 필수 라이브러리 로딩 대기
            await this.waitForLibraries();

            // Google Drive API 초기화
            await this.driveManager.initialize();

            // 로딩 완료
            this.loadingOverlay.classList.add('hidden');
            this.app.classList.remove('hidden');

            // 이벤트 리스너 등록
            this.setupEventListeners();

            // 자동 로그인 시도
            await this.checkAuthentication();

        } catch (error) {
            console.error('초기화 실패:', error);
            alert('앱 초기화에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 필수 라이브러리 로딩 대기
     */
    async waitForLibraries() {
        const maxWait = 10000; // 최대 10초 대기
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const checkLibraries = setInterval(() => {
                // Three.js와 DxfParser 확인
                if (window.THREE && window.DxfParser) {
                    clearInterval(checkLibraries);
                    console.log('라이브러리 로딩 완료');
                    resolve();
                    return;
                }

                // 타임아웃 체크
                if (Date.now() - startTime > maxWait) {
                    clearInterval(checkLibraries);
                    reject(new Error('라이브러리 로딩 시간 초과'));
                }
            }, 100);
        });
    }

    /**
     * 인증 상태 확인
     */
    async checkAuthentication() {
        if (!this.driveManager.accessToken) {
            // 로그인 필요
            await this.showLoginPrompt();
        } else {
            // 이미 로그인됨
            await this.loadFileList();
        }
    }

    /**
     * 로그인 프롬프트
     */
    async showLoginPrompt() {
        if (confirm('Google Drive에 로그인하시겠습니까?')) {
            try {
                this.showLoading('로그인 중...');
                await this.driveManager.authenticate();
                this.hideLoading();
                await this.loadFileList();
            } catch (error) {
                this.hideLoading();
                console.error('로그인 실패:', error);
                alert('로그인에 실패했습니다: ' + error.message);
            }
        }
    }

    /**
     * 파일 목록 불러오기
     */
    async loadFileList() {
        try {
            this.showLoading('파일 목록 불러오는 중...');

            const files = await this.driveManager.listDxfFiles();
            
            this.hideLoading();

            // 파일 목록 표시
            this.renderFileList(files);

        } catch (error) {
            this.hideLoading();
            console.error('파일 목록 불러오기 실패:', error);
            alert('파일 목록을 불러올 수 없습니다: ' + error.message);
        }
    }

    /**
     * 파일 목록 렌더링
     */
    renderFileList(files) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        if (files.length === 0) {
            fileList.innerHTML = '<p class="loading-text">DXF 파일이 없습니다.</p>';
            return;
        }

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            const icon = document.createElement('div');
            icon.className = 'file-icon';
            icon.textContent = '📄';

            const info = document.createElement('div');
            info.className = 'file-info';

            const name = document.createElement('div');
            name.className = 'file-name';
            name.textContent = file.name;

            const date = document.createElement('div');
            date.className = 'file-date';
            date.textContent = new Date(file.modifiedTime).toLocaleString('ko-KR');

            info.appendChild(name);
            info.appendChild(date);

            item.appendChild(icon);
            item.appendChild(info);

            item.addEventListener('click', () => this.openFile(file));

            fileList.appendChild(item);
        });
    }

    /**
     * 파일 열기
     */
    async openFile(file) {
        try {
            this.showLoading('도면 불러오는 중...');

            // DXF 파일 다운로드
            const dxfContent = await this.driveManager.downloadFile(file.id);

            // 뷰어 초기화
            if (!this.viewer) {
                const canvas = document.getElementById('viewerCanvas');
                const annotationLayer = document.getElementById('annotationLayer');
                this.viewer = new DxfViewer(canvas, annotationLayer);
                
                // 어노테이션 매니저 초기화
                this.annotationManager = new AnnotationManager(
                    this.viewer,
                    annotationLayer,
                    this.driveManager
                );

                // 카메라 이동 시 어노테이션 위치 업데이트
                setInterval(() => {
                    if (this.annotationManager) {
                        this.annotationManager.updateAllPositions();
                    }
                }, 100);
            }

            // DXF 로드
            await this.viewer.loadDxf(dxfContent);

            // 어노테이션 설정 및 로드
            this.annotationManager.setDxfFile(file.name);
            await this.annotationManager.loadAnnotations();

            // 현재 파일 저장
            this.currentFile = file;

            // 화면 전환
            this.showViewerScreen();

            this.hideLoading();

        } catch (error) {
            this.hideLoading();
            console.error('파일 열기 실패:', error);
            alert('파일을 열 수 없습니다: ' + error.message);
        }
    }

    /**
     * 화면 전환: 파일 목록
     */
    showFileListScreen() {
        this.fileListScreen.classList.remove('hidden');
        this.viewerScreen.classList.add('hidden');
        document.getElementById('backBtn').classList.add('hidden');
        document.getElementById('appTitle').textContent = 'DMAP';
    }

    /**
     * 화면 전환: 뷰어
     */
    showViewerScreen() {
        this.fileListScreen.classList.add('hidden');
        this.viewerScreen.classList.remove('hidden');
        document.getElementById('backBtn').classList.remove('hidden');
        document.getElementById('appTitle').textContent = this.currentFile?.name || 'DMAP';
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 헤더 버튼
        document.getElementById('backBtn').addEventListener('click', () => {
            this.showFileListScreen();
        });

        document.getElementById('userBtn').addEventListener('click', () => {
            this.showUserMenu();
        });

        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadFileList();
        });

        // 도구 모음
        document.getElementById('fitViewBtn').addEventListener('click', () => {
            if (this.viewer) {
                this.viewer.fitToView();
            }
        });

        document.getElementById('addPhotoBtn').addEventListener('click', () => {
            alert('도면을 길게 눌러 위치를 선택한 후 사진을 추가하세요.');
        });

        document.getElementById('addTextBtn').addEventListener('click', () => {
            alert('도면을 길게 눌러 위치를 선택한 후 텍스트를 추가하세요.');
        });

        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveAnnotations();
        });

        // 롱프레스 설정 (뷰어 캔버스)
        const canvas = document.getElementById('viewerCanvas');
        
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.startLongPress(e.touches[0]);
            }
        });

        canvas.addEventListener('touchmove', () => {
            this.cancelLongPress();
        });

        canvas.addEventListener('touchend', () => {
            this.cancelLongPress();
        });

        // 컨텍스트 메뉴
        document.getElementById('menuPhotoBtn').addEventListener('click', () => {
            this.hideContextMenu();
            this.showPhotoInput();
        });

        document.getElementById('menuTextBtn').addEventListener('click', () => {
            this.hideContextMenu();
            this.showTextInput();
        });

        document.getElementById('menuCancelBtn').addEventListener('click', () => {
            this.hideContextMenu();
        });

        // 사진 모달
        document.getElementById('takePictureBtn').addEventListener('click', () => {
            document.getElementById('cameraInput').click();
        });

        document.getElementById('selectPictureBtn').addEventListener('click', () => {
            document.getElementById('galleryInput').click();
        });

        document.getElementById('cameraInput').addEventListener('change', (e) => {
            this.handlePhotoSelected(e.target.files[0]);
        });

        document.getElementById('galleryInput').addEventListener('change', (e) => {
            this.handlePhotoSelected(e.target.files[0]);
        });

        document.getElementById('confirmPhotoBtn').addEventListener('click', () => {
            this.confirmPhotoAnnotation();
        });

        document.getElementById('cancelPhotoBtn').addEventListener('click', () => {
            this.hidePhotoModal();
        });

        // 텍스트 모달
        document.getElementById('confirmTextBtn').addEventListener('click', () => {
            this.confirmTextAnnotation();
        });

        document.getElementById('cancelTextBtn').addEventListener('click', () => {
            this.hideTextModal();
        });

        // 이미지 뷰어 모달
        document.getElementById('closeImageBtn').addEventListener('click', () => {
            document.getElementById('imageViewerModal').classList.add('hidden');
        });

        document.getElementById('imageViewerModal').addEventListener('click', (e) => {
            if (e.target.id === 'imageViewerModal') {
                document.getElementById('imageViewerModal').classList.add('hidden');
            }
        });
    }

    /**
     * 롱프레스 시작
     */
    startLongPress(touch) {
        this.longPressPosition = {
            x: touch.clientX,
            y: touch.clientY,
        };

        this.longPressTimer = setTimeout(() => {
            this.triggerLongPress();
        }, 500); // 500ms 롱프레스
    }

    /**
     * 롱프레스 취소
     */
    cancelLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    }

    /**
     * 롱프레스 트리거
     */
    triggerLongPress() {
        if (!this.longPressPosition) return;

        // 진동 피드백 (iOS Safari에서는 작동하지 않을 수 있음)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }

        // 컨텍스트 메뉴 표시
        this.showContextMenu(this.longPressPosition.x, this.longPressPosition.y);
    }

    /**
     * 컨텍스트 메뉴 표시
     */
    showContextMenu(x, y) {
        const menu = document.getElementById('contextMenu');
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.classList.remove('hidden');
    }

    /**
     * 컨텍스트 메뉴 숨기기
     */
    hideContextMenu() {
        document.getElementById('contextMenu').classList.add('hidden');
    }

    /**
     * 사진 입력 표시
     */
    showPhotoInput() {
        const modal = document.getElementById('photoModal');
        const preview = document.getElementById('photoPreview');
        
        preview.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    /**
     * 사진 선택 처리
     */
    handlePhotoSelected(file) {
        if (!file) return;

        const preview = document.getElementById('photoPreview');
        const image = document.getElementById('previewImage');

        const reader = new FileReader();
        reader.onload = (e) => {
            image.src = e.target.result;
            preview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);

        this.selectedPhoto = file;
    }

    /**
     * 사진 어노테이션 확인
     */
    async confirmPhotoAnnotation() {
        if (!this.selectedPhoto || !this.longPressPosition) return;

        try {
            this.showLoading('사진 업로드 중...');

            const memo = document.getElementById('photoMemo').value;
            
            // 화면 좌표를 도면 좌표로 변환
            const worldPos = this.viewer.screenToWorld(
                this.longPressPosition.x,
                this.longPressPosition.y
            );

            // 어노테이션 추가
            await this.annotationManager.addPhotoAnnotation(
                worldPos.x,
                worldPos.y,
                this.selectedPhoto,
                memo
            );

            this.hideLoading();
            this.hidePhotoModal();

            // 입력 초기화
            this.selectedPhoto = null;
            document.getElementById('photoMemo').value = '';

        } catch (error) {
            this.hideLoading();
            console.error('사진 추가 실패:', error);
            alert('사진 추가에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 사진 모달 숨기기
     */
    hidePhotoModal() {
        document.getElementById('photoModal').classList.add('hidden');
        document.getElementById('photoPreview').classList.add('hidden');
        document.getElementById('previewImage').src = '';
        document.getElementById('photoMemo').value = '';
        
        // 파일 입력 초기화
        document.getElementById('cameraInput').value = '';
        document.getElementById('galleryInput').value = '';
    }

    /**
     * 텍스트 입력 표시
     */
    showTextInput() {
        const modal = document.getElementById('textModal');
        document.getElementById('textInput').value = '';
        modal.classList.remove('hidden');
    }

    /**
     * 텍스트 어노테이션 확인
     */
    async confirmTextAnnotation() {
        const text = document.getElementById('textInput').value.trim();
        
        if (!text || !this.longPressPosition) return;

        try {
            this.showLoading('텍스트 저장 중...');

            // 화면 좌표를 도면 좌표로 변환
            const worldPos = this.viewer.screenToWorld(
                this.longPressPosition.x,
                this.longPressPosition.y
            );

            // 어노테이션 추가
            await this.annotationManager.addTextAnnotation(
                worldPos.x,
                worldPos.y,
                text
            );

            this.hideLoading();
            this.hideTextModal();

        } catch (error) {
            this.hideLoading();
            console.error('텍스트 추가 실패:', error);
            alert('텍스트 추가에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 텍스트 모달 숨기기
     */
    hideTextModal() {
        document.getElementById('textModal').classList.add('hidden');
        document.getElementById('textInput').value = '';
    }

    /**
     * 어노테이션 저장
     */
    async saveAnnotations() {
        if (!this.annotationManager) return;

        try {
            this.showLoading('저장 중...');
            await this.annotationManager.saveMetadata();
            this.hideLoading();
            alert('저장되었습니다!');
        } catch (error) {
            this.hideLoading();
            console.error('저장 실패:', error);
            alert('저장에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 사용자 메뉴 표시
     */
    showUserMenu() {
        const email = 'user@example.com'; // TODO: 실제 사용자 정보
        alert(`로그인됨: ${email}`);
    }

    /**
     * 로딩 표시
     */
    showLoading(message = '로딩 중...') {
        this.loadingOverlay.querySelector('p').textContent = message;
        this.loadingOverlay.classList.remove('hidden');
    }

    /**
     * 로딩 숨기기
     */
    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }
}

// 앱 시작
window.addEventListener('DOMContentLoaded', () => {
    new DmapApp();
});

