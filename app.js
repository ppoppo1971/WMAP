// DXF 도면 편집기 앱
class DxfPhotoEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.container = document.getElementById('canvas-container');
        
        // 상태 관리
        this.dxfData = null;
        this.dxfFileName = '';
        this.photos = []; // { id, x, y, width, height, imageData, memo, fileName }
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.selectedPhotoId = null;
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.drawWelcomeScreen();
    }
    
    setupCanvas() {
        const updateCanvasSize = () => {
            const rect = this.container.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            this.redraw();
        };
        
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
    }
    
    setupEventListeners() {
        // DXF 파일 열기
        document.getElementById('dxf-input').addEventListener('change', (e) => {
            this.loadDxfFile(e.target.files[0]);
        });
        
        // 사진 추가
        document.getElementById('photo-input').addEventListener('change', (e) => {
            this.addPhoto(e.target.files[0]);
        });
        
        // 내보내기
        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportToZip();
        });
        
        // 캔버스 드래그 (팬)
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // 터치 이벤트 (모바일)
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // 사진 클릭
        this.canvas.addEventListener('click', this.onCanvasClick.bind(this));
        
        // 줌 버튼
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoom(1.2);
        });
        
        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoom(0.8);
        });
        
        // 메모 모달
        document.getElementById('close-memo').addEventListener('click', () => {
            this.closeMemoModal();
        });
        
        document.getElementById('save-memo').addEventListener('click', () => {
            this.saveMemo();
        });
        
        document.getElementById('delete-photo').addEventListener('click', () => {
            this.deletePhoto();
        });
    }
    
    showLoading(show) {
        document.getElementById('loading').classList.toggle('active', show);
    }
    
    async loadDxfFile(file) {
        if (!file) return;
        
        this.showLoading(true);
        
        try {
            // 1. 파일 읽기
            const text = await file.text();
            
            // 2. DXF 파일 유효성 검사
            if (!text.includes('SECTION') || !text.includes('ENTITIES')) {
                throw new Error('올바른 DXF 파일 형식이 아닙니다.');
            }
            
            // 3. DXF 버전 확인
            const versionMatch = text.match(/\$ACADVER[\s\S]*?[\r\n]\s*1[\r\n]\s*AC(\d+)/);
            const version = versionMatch ? versionMatch[1] : 'Unknown';
            console.log('DXF 버전:', version);
            
            // 4. DXF 파싱
            const parser = new DxfParser();
            this.dxfData = parser.parseSync(text);
            
            // 5. 파싱된 데이터 검증
            if (!this.dxfData) {
                throw new Error('DXF 파일 파싱에 실패했습니다.');
            }
            
            // 엔티티가 없는 경우 경고
            if (!this.dxfData.entities || this.dxfData.entities.length === 0) {
                console.warn('DXF 파일에 엔티티가 없습니다.');
                if (!confirm('도면에 그려진 내용이 없는 것 같습니다. 계속하시겠습니까?')) {
                    return;
                }
            }
            
            console.log('DXF 데이터:', this.dxfData);
            console.log('엔티티 개수:', this.dxfData.entities ? this.dxfData.entities.length : 0);
            
            this.dxfFileName = file.name.replace('.dxf', '');
            
            // 캔버스 초기화
            this.photos = [];
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            
            // DXF 렌더링
            this.fitDxfToCanvas();
            this.redraw();
            
            // 버튼 활성화
            document.getElementById('add-photo-btn').disabled = false;
            document.getElementById('export-btn').disabled = false;
            
            alert(`DXF 파일이 로드되었습니다!\n엔티티 개수: ${this.dxfData.entities ? this.dxfData.entities.length : 0}개`);
        } catch (error) {
            console.error('DXF 파일 로드 오류:', error);
            console.error('오류 상세:', error.message);
            console.error('스택:', error.stack);
            
            // 더 자세한 오류 메시지
            let errorMessage = 'DXF 파일을 로드하는데 실패했습니다.\n\n';
            
            if (error.message) {
                errorMessage += `오류: ${error.message}\n\n`;
            }
            
            errorMessage += '해결 방법:\n';
            errorMessage += '1. AutoCAD에서 DXF를 다시 저장해주세요.\n';
            errorMessage += '   - 파일 → 다른 이름으로 저장 → DXF\n';
            errorMessage += '   - 버전: "AutoCAD 2000/LT2000 DXF" 선택\n';
            errorMessage += '   - 또는 "AutoCAD R12/LT12 DXF" 선택\n\n';
            errorMessage += '2. 브라우저 콘솔(F12)을 열어서 자세한 오류를 확인하세요.';
            
            alert(errorMessage);
        } finally {
            this.showLoading(false);
        }
    }
    
    fitDxfToCanvas() {
        if (!this.dxfData) return;
        
        // DXF 경계 계산
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let validPointCount = 0;
        
        const isValidNumber = (n) => {
            return typeof n === 'number' && !isNaN(n) && isFinite(n);
        };
        
        const processEntity = (entity) => {
            try {
                if (entity.vertices && Array.isArray(entity.vertices)) {
                    entity.vertices.forEach(v => {
                        if (v && isValidNumber(v.x) && isValidNumber(v.y)) {
                            minX = Math.min(minX, v.x);
                            minY = Math.min(minY, v.y);
                            maxX = Math.max(maxX, v.x);
                            maxY = Math.max(maxY, v.y);
                            validPointCount++;
                        }
                    });
                } else {
                    if (entity.startPoint && isValidNumber(entity.startPoint.x) && isValidNumber(entity.startPoint.y)) {
                        minX = Math.min(minX, entity.startPoint.x);
                        minY = Math.min(minY, entity.startPoint.y);
                        maxX = Math.max(maxX, entity.startPoint.x);
                        maxY = Math.max(maxY, entity.startPoint.y);
                        validPointCount++;
                    }
                    if (entity.endPoint && isValidNumber(entity.endPoint.x) && isValidNumber(entity.endPoint.y)) {
                        minX = Math.min(minX, entity.endPoint.x);
                        minY = Math.min(minY, entity.endPoint.y);
                        maxX = Math.max(maxX, entity.endPoint.x);
                        maxY = Math.max(maxY, entity.endPoint.y);
                        validPointCount++;
                    }
                    if (entity.center && isValidNumber(entity.center.x) && isValidNumber(entity.center.y)) {
                        const radius = isValidNumber(entity.radius) ? entity.radius : 0;
                        minX = Math.min(minX, entity.center.x - radius);
                        minY = Math.min(minY, entity.center.y - radius);
                        maxX = Math.max(maxX, entity.center.x + radius);
                        maxY = Math.max(maxY, entity.center.y + radius);
                        validPointCount++;
                    }
                }
            } catch (error) {
                console.warn('엔티티 경계 계산 오류:', error);
            }
        };
        
        if (this.dxfData.entities) {
            this.dxfData.entities.forEach(processEntity);
        }
        
        console.log(`경계 계산: 유효한 포인트 ${validPointCount}개`);
        console.log(`경계: minX=${minX}, maxX=${maxX}, minY=${minY}, maxY=${maxY}`);
        
        // 유효한 경계가 없는 경우
        if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
            console.warn('유효한 경계를 계산할 수 없습니다. 기본 뷰 사용.');
            this.scale = 1;
            this.offsetX = this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
            return;
        }
        
        const dxfWidth = maxX - minX;
        const dxfHeight = maxY - minY;
        
        console.log(`도면 크기: ${dxfWidth} x ${dxfHeight}`);
        
        if (dxfWidth > 0 && dxfHeight > 0) {
            const scaleX = (this.canvas.width * 0.8) / dxfWidth;
            const scaleY = (this.canvas.height * 0.8) / dxfHeight;
            this.scale = Math.min(scaleX, scaleY);
            
            // 스케일이 너무 크거나 작으면 제한
            this.scale = Math.max(0.001, Math.min(1000, this.scale));
            
            this.offsetX = (this.canvas.width / 2) - ((minX + maxX) / 2) * this.scale;
            this.offsetY = (this.canvas.height / 2) + ((minY + maxY) / 2) * this.scale;
            
            console.log(`뷰포트 설정: scale=${this.scale}, offset=(${this.offsetX}, ${this.offsetY})`);
        } else {
            console.warn('도면 크기가 0입니다. 기본 뷰 사용.');
            this.scale = 1;
            this.offsetX = this.canvas.width / 2;
            this.offsetY = this.canvas.height / 2;
        }
    }
    
    drawWelcomeScreen() {
        this.ctx.fillStyle = '#f5f5f5';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#999';
        this.ctx.font = '20px -apple-system, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('DXF 파일을 열어주세요', this.canvas.width / 2, this.canvas.height / 2);
    }
    
    redraw() {
        // 캔버스 초기화
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (!this.dxfData) {
            this.drawWelcomeScreen();
            return;
        }
        
        // DXF 그리기
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, -this.scale);
        
        this.drawDxf();
        
        this.ctx.restore();
        
        // 사진 마커 그리기
        this.drawPhotos();
    }
    
    drawDxf() {
        if (!this.dxfData || !this.dxfData.entities) return;
        
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1 / this.scale;
        
        let drawnCount = 0;
        let errorCount = 0;
        
        this.dxfData.entities.forEach((entity, index) => {
            try {
                if (!entity || !entity.type) {
                    console.warn(`엔티티 ${index}: 타입이 없습니다.`);
                    return;
                }
                
                switch (entity.type) {
                    case 'LINE':
                        this.drawLine(entity);
                        drawnCount++;
                        break;
                    case 'POLYLINE':
                    case 'LWPOLYLINE':
                        this.drawPolyline(entity);
                        drawnCount++;
                        break;
                    case 'CIRCLE':
                        this.drawCircle(entity);
                        drawnCount++;
                        break;
                    case 'ARC':
                        this.drawArc(entity);
                        drawnCount++;
                        break;
                    default:
                        // 미지원 엔티티 타입
                        if (index < 10) { // 처음 10개만 로그
                            console.log(`미지원 엔티티 타입: ${entity.type}`);
                        }
                }
            } catch (error) {
                errorCount++;
                if (errorCount <= 5) { // 처음 5개 오류만 로그
                    console.error(`엔티티 ${index} 렌더링 오류:`, error);
                    console.error('엔티티 데이터:', entity);
                }
            }
        });
        
        console.log(`렌더링 완료: ${drawnCount}개 성공, ${errorCount}개 실패`);
    }
    
    drawLine(entity) {
        if (!entity.startPoint || !entity.endPoint) return;
        if (typeof entity.startPoint.x !== 'number' || typeof entity.startPoint.y !== 'number') return;
        if (typeof entity.endPoint.x !== 'number' || typeof entity.endPoint.y !== 'number') return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(entity.startPoint.x, entity.startPoint.y);
        this.ctx.lineTo(entity.endPoint.x, entity.endPoint.y);
        this.ctx.stroke();
    }
    
    drawPolyline(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return;
        
        // 유효한 좌표만 필터링
        const validVertices = entity.vertices.filter(v => 
            v && typeof v.x === 'number' && typeof v.y === 'number' &&
            !isNaN(v.x) && !isNaN(v.y)
        );
        
        if (validVertices.length < 2) return;
        
        this.ctx.beginPath();
        this.ctx.moveTo(validVertices[0].x, validVertices[0].y);
        
        for (let i = 1; i < validVertices.length; i++) {
            this.ctx.lineTo(validVertices[i].x, validVertices[i].y);
        }
        
        this.ctx.stroke();
    }
    
    drawCircle(entity) {
        if (!entity.center || !entity.radius) return;
        if (typeof entity.center.x !== 'number' || typeof entity.center.y !== 'number') return;
        if (typeof entity.radius !== 'number' || entity.radius <= 0) return;
        if (isNaN(entity.center.x) || isNaN(entity.center.y) || isNaN(entity.radius)) return;
        
        this.ctx.beginPath();
        this.ctx.arc(entity.center.x, entity.center.y, entity.radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }
    
    drawArc(entity) {
        if (!entity.center || !entity.radius) return;
        if (typeof entity.center.x !== 'number' || typeof entity.center.y !== 'number') return;
        if (typeof entity.radius !== 'number' || entity.radius <= 0) return;
        if (isNaN(entity.center.x) || isNaN(entity.center.y) || isNaN(entity.radius)) return;
        
        const startAngle = (entity.startAngle || 0) * Math.PI / 180;
        const endAngle = (entity.endAngle || 0) * Math.PI / 180;
        
        if (isNaN(startAngle) || isNaN(endAngle)) return;
        
        this.ctx.beginPath();
        this.ctx.arc(entity.center.x, entity.center.y, entity.radius, startAngle, endAngle);
        this.ctx.stroke();
    }
    
    drawPhotos() {
        this.photos.forEach(photo => {
            // 사진 썸네일 그리기
            this.ctx.save();
            
            const x = photo.x * this.scale + this.offsetX;
            const y = this.canvas.height - (photo.y * this.scale + this.offsetY);
            const w = photo.width * this.scale;
            const h = photo.height * this.scale;
            
            // 테두리
            this.ctx.strokeStyle = '#007AFF';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x, y, w, h);
            
            // 배경
            this.ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
            this.ctx.fillRect(x, y, w, h);
            
            // 이미지 그리기
            if (photo.image) {
                this.ctx.drawImage(photo.image, x, y, w, h);
            }
            
            // 라벨
            this.ctx.fillStyle = 'rgba(0, 122, 255, 0.9)';
            this.ctx.fillRect(x, y + h - 25, w, 25);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px -apple-system, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(photo.fileName, x + w / 2, y + h - 12.5);
            
            this.ctx.restore();
        });
    }
    
    async addPhoto(file) {
        if (!file) return;
        
        this.showLoading(true);
        
        try {
            // 이미지 로드
            const imageData = await this.readFileAsDataURL(file);
            const image = await this.loadImage(imageData);
            
            // 캔버스 중앙에 배치
            const canvasCenterX = (this.canvas.width / 2 - this.offsetX) / this.scale;
            const canvasCenterY = (this.canvas.height / 2 - this.offsetY) / this.scale;
            
            const photoWidth = 100; // DXF 단위
            const photoHeight = (image.height / image.width) * photoWidth;
            
            const photo = {
                id: Date.now(),
                x: canvasCenterX - photoWidth / 2,
                y: canvasCenterY - photoHeight / 2,
                width: photoWidth,
                height: photoHeight,
                imageData: imageData,
                image: image,
                memo: '',
                fileName: file.name
            };
            
            this.photos.push(photo);
            this.redraw();
            
            alert('사진이 추가되었습니다! 사진을 클릭하면 메모를 작성할 수 있습니다.');
        } catch (error) {
            console.error('사진 추가 오류:', error);
            alert('사진을 추가하는데 실패했습니다.');
        } finally {
            this.showLoading(false);
        }
    }
    
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }
    
    onMouseDown(e) {
        this.isDragging = true;
        this.dragStartX = e.clientX - this.offsetX;
        this.dragStartY = e.clientY - this.offsetY;
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        this.offsetX = e.clientX - this.dragStartX;
        this.offsetY = e.clientY - this.dragStartY;
        this.redraw();
    }
    
    onMouseUp(e) {
        this.isDragging = false;
    }
    
    onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            this.isDragging = true;
            this.dragStartX = touch.clientX - this.offsetX;
            this.dragStartY = touch.clientY - this.offsetY;
        }
    }
    
    onTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            this.offsetX = touch.clientX - this.dragStartX;
            this.offsetY = touch.clientY - this.dragStartY;
            this.redraw();
        }
    }
    
    onTouchEnd(e) {
        this.isDragging = false;
    }
    
    onCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // 사진 클릭 확인
        for (let i = this.photos.length - 1; i >= 0; i--) {
            const photo = this.photos[i];
            const x = photo.x * this.scale + this.offsetX;
            const y = this.canvas.height - (photo.y * this.scale + this.offsetY);
            const w = photo.width * this.scale;
            const h = photo.height * this.scale;
            
            if (clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h) {
                this.openMemoModal(photo.id);
                return;
            }
        }
    }
    
    zoom(factor) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.offsetX = centerX - (centerX - this.offsetX) * factor;
        this.offsetY = centerY - (centerY - this.offsetY) * factor;
        this.scale *= factor;
        
        this.redraw();
    }
    
    openMemoModal(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        this.selectedPhotoId = photoId;
        
        document.getElementById('memo-image-preview').src = photo.imageData;
        document.getElementById('memo-text').value = photo.memo;
        document.getElementById('memo-modal').classList.add('active');
    }
    
    closeMemoModal() {
        document.getElementById('memo-modal').classList.remove('active');
        this.selectedPhotoId = null;
    }
    
    saveMemo() {
        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) return;
        
        photo.memo = document.getElementById('memo-text').value;
        this.closeMemoModal();
        alert('메모가 저장되었습니다!');
    }
    
    deletePhoto() {
        if (!confirm('이 사진을 삭제하시겠습니까?')) return;
        
        this.photos = this.photos.filter(p => p.id !== this.selectedPhotoId);
        this.closeMemoModal();
        this.redraw();
    }
    
    async exportToZip() {
        if (!this.dxfData) {
            alert('DXF 파일을 먼저 로드해주세요.');
            return;
        }
        
        this.showLoading(true);
        
        try {
            const zip = new JSZip();
            
            // 1. DXF 파일 생성 (IMAGE 엔티티 포함)
            const modifiedDxf = this.createModifiedDxf();
            zip.file(`${this.dxfFileName}_modified.dxf`, modifiedDxf);
            
            // 2. 사진 파일 추가
            const imagesFolder = zip.folder('images');
            this.photos.forEach((photo, index) => {
                const base64Data = photo.imageData.split(',')[1];
                const ext = photo.fileName.split('.').pop();
                imagesFolder.file(`photo_${index + 1}.${ext}`, base64Data, {base64: true});
            });
            
            // 3. 메모 정보 JSON 파일 추가
            const metadata = {
                dxfFileName: this.dxfFileName,
                photos: this.photos.map((photo, index) => ({
                    id: index + 1,
                    fileName: `photo_${index + 1}.${photo.fileName.split('.').pop()}`,
                    originalFileName: photo.fileName,
                    x: photo.x,
                    y: photo.y,
                    width: photo.width,
                    height: photo.height,
                    memo: photo.memo
                }))
            };
            zip.file('metadata.json', JSON.stringify(metadata, null, 2));
            
            // 4. README 추가
            const readme = `DXF 도면 및 사진 패키지
            
생성 날짜: ${new Date().toLocaleString('ko-KR')}
DXF 파일: ${this.dxfFileName}_modified.dxf
사진 개수: ${this.photos.length}개

사용 방법:
1. ${this.dxfFileName}_modified.dxf 파일을 AutoCAD에서 엽니다.
2. images 폴더의 사진들이 도면에 표시됩니다.
3. metadata.json 파일에 각 사진의 위치와 메모 정보가 저장되어 있습니다.

주의: DXF 파일을 열 때 images 폴더가 같은 디렉토리에 있어야 이미지가 표시됩니다.
`;
            zip.file('README.txt', readme);
            
            // 5. ZIP 생성 및 다운로드
            const blob = await zip.generateAsync({type: 'blob'});
            this.downloadBlob(blob, `${this.dxfFileName}_package.zip`);
            
            alert('ZIP 파일이 생성되었습니다!');
        } catch (error) {
            console.error('내보내기 오류:', error);
            alert('ZIP 파일 생성에 실패했습니다.');
        } finally {
            this.showLoading(false);
        }
    }
    
    createModifiedDxf() {
        // 원본 DXF에 IMAGE 엔티티를 추가
        // 간단한 DXF 형식으로 이미지 참조 추가
        let dxfContent = `0
SECTION
2
ENTITIES
`;
        
        // 사진 엔티티 추가
        this.photos.forEach((photo, index) => {
            const ext = photo.fileName.split('.').pop();
            const imageFileName = `images/photo_${index + 1}.${ext}`;
            
            dxfContent += `0
IMAGE
8
0
10
${photo.x}
20
${photo.y}
30
0.0
11
${photo.width}
21
0.0
31
0.0
12
0.0
22
${photo.height}
32
0.0
340
${index + 1}
`;
        });
        
        dxfContent += `0
ENDSEC
0
EOF
`;
        
        return dxfContent;
    }
    
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 앱 시작
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DxfPhotoEditor();
});

