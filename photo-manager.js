// 사진 및 텍스트 어노테이션 관리 클래스

class AnnotationManager {
    constructor(viewer, annotationLayer, driveManager) {
        this.viewer = viewer;
        this.annotationLayer = annotationLayer;
        this.driveManager = driveManager;
        
        // 어노테이션 데이터
        this.annotations = [];
        
        // 현재 DXF 파일명
        this.currentDxfFileName = null;
    }

    /**
     * DXF 파일 설정
     */
    setDxfFile(fileName) {
        this.currentDxfFileName = fileName;
    }

    /**
     * 기존 어노테이션 로드 (메타데이터에서)
     */
    async loadAnnotations() {
        if (!this.currentDxfFileName) return;

        try {
            const metadata = await this.driveManager.loadMetadata(this.currentDxfFileName);
            this.annotations = metadata.annotations || [];
            this.renderAnnotations();
            console.log('어노테이션 로드 완료:', this.annotations.length);
        } catch (error) {
            console.error('어노테이션 로드 실패:', error);
            this.annotations = [];
        }
    }

    /**
     * 사진 어노테이션 추가
     */
    async addPhotoAnnotation(worldX, worldY, imageFile, memo = '') {
        try {
            // 이미지를 Base64로 변환
            const base64Image = await this.fileToBase64(imageFile);

            // Google Drive에 업로드
            const timestamp = Date.now();
            const imageName = `photo_${timestamp}_${imageFile.name}`;
            const uploadResult = await this.driveManager.uploadImage(imageName, base64Image);

            // 어노테이션 데이터 생성
            const annotation = {
                id: `photo_${timestamp}`,
                type: 'photo',
                x: worldX,
                y: worldY,
                imageUrl: base64Image, // 로컬 미리보기용
                imageName: imageName,
                imageId: uploadResult.id,
                memo: memo,
                timestamp: new Date().toISOString(),
            };

            this.annotations.push(annotation);
            
            // 화면에 렌더링
            this.renderAnnotation(annotation);

            // 메타데이터 저장
            await this.saveMetadata();

            console.log('사진 어노테이션 추가:', annotation);
            return annotation;
        } catch (error) {
            console.error('사진 어노테이션 추가 실패:', error);
            throw error;
        }
    }

    /**
     * 텍스트 어노테이션 추가
     */
    async addTextAnnotation(worldX, worldY, text) {
        try {
            const timestamp = Date.now();

            const annotation = {
                id: `text_${timestamp}`,
                type: 'text',
                x: worldX,
                y: worldY,
                text: text,
                timestamp: new Date().toISOString(),
            };

            this.annotations.push(annotation);
            
            // 화면에 렌더링
            this.renderAnnotation(annotation);

            // 메타데이터 저장
            await this.saveMetadata();

            console.log('텍스트 어노테이션 추가:', annotation);
            return annotation;
        } catch (error) {
            console.error('텍스트 어노테이션 추가 실패:', error);
            throw error;
        }
    }

    /**
     * 모든 어노테이션 렌더링
     */
    renderAnnotations() {
        // 기존 어노테이션 제거
        this.annotationLayer.innerHTML = '';

        // 각 어노테이션 렌더링
        this.annotations.forEach(annotation => {
            this.renderAnnotation(annotation);
        });
    }

    /**
     * 단일 어노테이션 렌더링
     */
    renderAnnotation(annotation) {
        const element = document.createElement('div');
        element.className = 'annotation';
        element.dataset.id = annotation.id;

        if (annotation.type === 'photo') {
            // 사진 이모지
            const emoji = document.createElement('span');
            emoji.className = 'annotation-emoji';
            emoji.textContent = '📷';
            emoji.addEventListener('click', () => this.showPhotoViewer(annotation));
            element.appendChild(emoji);
        } else if (annotation.type === 'text') {
            // 텍스트
            const textDiv = document.createElement('div');
            textDiv.className = 'annotation-text';
            textDiv.textContent = annotation.text;
            element.appendChild(textDiv);
        }

        this.annotationLayer.appendChild(element);

        // 위치 업데이트
        this.updateAnnotationPosition(annotation.id);
    }

    /**
     * 어노테이션 위치 업데이트 (도면 좌표 -> 화면 좌표)
     */
    updateAnnotationPosition(annotationId) {
        const annotation = this.annotations.find(a => a.id === annotationId);
        if (!annotation) return;

        const element = this.annotationLayer.querySelector(`[data-id="${annotationId}"]`);
        if (!element) return;

        const screenPos = this.viewer.worldToScreen(annotation.x, annotation.y);
        
        element.style.left = `${screenPos.x}px`;
        element.style.top = `${screenPos.y}px`;
        element.style.transform = 'translate(-50%, -50%)';
    }

    /**
     * 모든 어노테이션 위치 업데이트 (카메라 이동/줌 시)
     */
    updateAllPositions() {
        this.annotations.forEach(annotation => {
            this.updateAnnotationPosition(annotation.id);
        });
    }

    /**
     * 사진 뷰어 표시
     */
    showPhotoViewer(annotation) {
        const modal = document.getElementById('imageViewerModal');
        const image = document.getElementById('fullImage');
        const memo = document.getElementById('imageMemo');

        image.src = annotation.imageUrl;
        memo.textContent = annotation.memo || '(메모 없음)';

        modal.classList.remove('hidden');
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
     * 메타데이터 저장
     */
    async saveMetadata() {
        if (!this.currentDxfFileName) {
            throw new Error('DXF 파일이 설정되지 않았습니다');
        }

        const metadata = {
            dxfFile: this.currentDxfFileName,
            annotations: this.annotations.map(a => ({
                id: a.id,
                type: a.type,
                x: a.x,
                y: a.y,
                text: a.text,
                imageName: a.imageName,
                imageId: a.imageId,
                memo: a.memo,
                timestamp: a.timestamp,
            })),
            lastModified: new Date().toISOString(),
        };

        await this.driveManager.saveMetadata(this.currentDxfFileName, metadata);
        console.log('메타데이터 저장 완료');
    }

    /**
     * 모든 어노테이션 제거
     */
    clearAnnotations() {
        this.annotations = [];
        this.annotationLayer.innerHTML = '';
    }
}

export default AnnotationManager;

