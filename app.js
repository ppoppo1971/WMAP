// 라이브러리 로드 확인
if (typeof DxfParser === 'undefined') {
    console.error('DxfParser 라이브러리가 로드되지 않았습니다!');
    console.error('CDN 연결을 확인하세요: https://unpkg.com/dxf-parser@1.2.1/dist/dxf-parser.min.js');
}

if (typeof JSZip === 'undefined') {
    console.error('JSZip 라이브러리가 로드되지 않았습니다!');
    console.error('CDN 연결을 확인하세요: https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
}

// DXF 도면 편집기 앱
class DxfPhotoEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.svg = document.getElementById('svg');
        this.container = document.getElementById('canvas-container');
        
        // SVG 그룹 요소 생성
        this.svgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.svg.appendChild(this.svgGroup);
        
        // 상태 관리
        this.dxfData = null;
        this.dxfFileName = '';
        this.photos = []; // { id, x, y, width, height, imageData, memo, fileName }
        this.viewBox = { x: 0, y: 0, width: 1000, height: 1000 };
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.selectedPhotoId = null;
        
        this.init();
    }
    
    getEntityColor(entity) {
        // 엔티티 색상 가져오기
        let color = entity.color;
        let originalColor = color;
        
        // color가 숫자(RGB)인 경우 16진수로 변환
        if (typeof color === 'number') {
            color = '#' + color.toString(16).padStart(6, '0');
        }
        
        // 색상이 없으면 검은색
        if (!color) {
            color = '#000000';
        }
        
        // 흰색이면 검은색으로 변경 (배경과 구분)
        const isWhite = color.toLowerCase() === '#ffffff' || 
                        color.toLowerCase() === '#fff' ||
                        color.toLowerCase() === 'white' ||
                        entity.colorIndex === 7;
        
        if (isWhite) {
            console.log(`⚪ 흰색 → 검은색 변환: ${entity.type} (원래: ${originalColor || entity.colorIndex})`);
            color = '#000000';
        }
        
        return color;
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
        
        // SVG 드래그 (팬) - SVG에서 이벤트 받기
        this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // 터치 이벤트 (모바일) - SVG에서
        this.svg.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.svg.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.svg.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // 사진 클릭 - Canvas에서
        this.canvas.addEventListener('click', this.onCanvasClick.bind(this));
        this.canvas.style.pointerEvents = 'auto'; // 사진 클릭 위해 활성화
        
        // 줌 버튼
        document.getElementById('zoom-in').addEventListener('click', () => {
            this.zoom(1.2);
        });
        
        document.getElementById('zoom-out').addEventListener('click', () => {
            this.zoom(0.8);
        });
        
        // 전체보기 버튼
        document.getElementById('fit-btn').addEventListener('click', () => {
            console.log('🔍 전체보기 클릭');
            this.fitDxfToView();
            this.redraw();
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
            if (typeof DxfParser === 'undefined') {
                throw new Error('DXF 파서 라이브러리가 로드되지 않았습니다.\n\n페이지를 새로고침(F5)하거나 인터넷 연결을 확인해주세요.');
            }
            
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
            
            // 색상 정보 확인 (처음 5개 엔티티)
            if (this.dxfData.entities && this.dxfData.entities.length > 0) {
                console.log('\n🎨 엔티티 색상 정보 (처음 5개):');
                this.dxfData.entities.slice(0, 5).forEach((entity, i) => {
                    console.log(`  ${i}. ${entity.type}: color=${entity.color}, colorIndex=${entity.colorIndex}`);
                });
            }
            
            // 블록 정보 표시
            if (this.dxfData.blocks) {
                const blockNames = Object.keys(this.dxfData.blocks);
                console.log('\n📦 블록 개수:', blockNames.length);
                if (blockNames.length > 0) {
                    console.log('블록 목록:', blockNames);
                    blockNames.forEach(name => {
                        const block = this.dxfData.blocks[name];
                        if (block.entities) {
                            console.log(`  - ${name}: ${block.entities.length}개 엔티티`);
                        }
                    });
                }
            }
            
            this.dxfFileName = file.name.replace('.dxf', '');
            
            // 캔버스 초기화
            this.photos = [];
            this.scale = 1;
            this.offsetX = 0;
            this.offsetY = 0;
            
            // DXF 렌더링
            this.fitDxfToView();
            this.redraw();
            
            // 버튼 활성화
            document.getElementById('add-photo-btn').disabled = false;
            document.getElementById('export-btn').disabled = false;
            document.getElementById('fit-btn').disabled = false;
            
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
    
    fitDxfToView() {
        if (!this.dxfData) return;
        
        // DXF 경계 계산
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let validPointCount = 0;
        
        const isValidNumber = (n) => {
            return typeof n === 'number' && !isNaN(n) && isFinite(n);
        };
        
        const processEntity = (entity) => {
            try {
                // POLYLINE vertices
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
                }
                
                // LINE startPoint, endPoint
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
                
                // CIRCLE, ARC center + radius
                if (entity.center && isValidNumber(entity.center.x) && isValidNumber(entity.center.y)) {
                    const radius = isValidNumber(entity.radius) ? entity.radius : 0;
                    minX = Math.min(minX, entity.center.x - radius);
                    minY = Math.min(minY, entity.center.y - radius);
                    maxX = Math.max(maxX, entity.center.x + radius);
                    maxY = Math.max(maxY, entity.center.y + radius);
                    validPointCount++;
                }
                
                // POINT, TEXT, INSERT position
                if (entity.position && isValidNumber(entity.position.x) && isValidNumber(entity.position.y)) {
                    minX = Math.min(minX, entity.position.x);
                    minY = Math.min(minY, entity.position.y);
                    maxX = Math.max(maxX, entity.position.x);
                    maxY = Math.max(maxY, entity.position.y);
                    validPointCount++;
                }
                
                // SPLINE controlPoints
                if (entity.controlPoints && Array.isArray(entity.controlPoints)) {
                    entity.controlPoints.forEach(cp => {
                        if (cp && isValidNumber(cp.x) && isValidNumber(cp.y)) {
                            minX = Math.min(minX, cp.x);
                            minY = Math.min(minY, cp.y);
                            maxX = Math.max(maxX, cp.x);
                            maxY = Math.max(maxY, cp.y);
                            validPointCount++;
                        }
                    });
                }
                
                // SOLID, 3DFACE points
                if (entity.points && Array.isArray(entity.points)) {
                    entity.points.forEach(p => {
                        if (p && isValidNumber(p.x) && isValidNumber(p.y)) {
                            minX = Math.min(minX, p.x);
                            minY = Math.min(minY, p.y);
                            maxX = Math.max(maxX, p.x);
                            maxY = Math.max(maxY, p.y);
                            validPointCount++;
                        }
                    });
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
            this.viewBox = { x: -500, y: -500, width: 1000, height: 1000 };
            return;
        }
        
        const dxfWidth = maxX - minX;
        const dxfHeight = maxY - minY;
        
        console.log(`도면 크기: ${dxfWidth} x ${dxfHeight}`);
        
        if (dxfWidth > 0 && dxfHeight > 0) {
            // 여백 추가 (10%)
            const margin = 0.1;
            const paddedWidth = dxfWidth * (1 + margin * 2);
            const paddedHeight = dxfHeight * (1 + margin * 2);
            
            // ViewBox 설정 (SVG는 Y축이 아래로 증가하므로 음수로)
            this.viewBox = {
                x: minX - dxfWidth * margin,
                y: -(maxY + dxfHeight * margin), // Y축 반전
                width: paddedWidth,
                height: paddedHeight
            };
            
            console.log(`ViewBox 설정:`, this.viewBox);
        } else {
            console.warn('도면 크기가 0입니다. 기본 뷰 사용.');
            this.viewBox = { x: -500, y: -500, width: 1000, height: 1000 };
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
        console.log('🎨 redraw() 호출됨');
        
        if (!this.dxfData) {
            this.drawWelcomeScreen();
            this.clearCanvas();
            return;
        }
        
        console.log('📐 ViewBox:', this.viewBox);
        
        // 1. SVG로 DXF 렌더링 (벡터)
        this.drawDxfSvg();
        
        // 2. Canvas로 사진 렌더링 (래스터)
        this.drawPhotosCanvas();
        
        console.log('✅ redraw() 완료');
    }
    
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    drawDxfSvg() {
        // SVG 초기화
        while (this.svgGroup.firstChild) {
            this.svgGroup.removeChild(this.svgGroup.firstChild);
        }
        
        if (!this.dxfData || !this.dxfData.entities) return;
        
        // ViewBox 설정
        this.svg.setAttribute('viewBox', 
            `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
        
        console.log('🖊️ SVG drawDxf() 시작, 엔티티:', this.dxfData.entities.length);
        
        let drawnCount = 0;
        let errorCount = 0;
        
        this.dxfData.entities.forEach((entity, index) => {
            try {
                if (!entity || !entity.type) {
                    console.warn(`엔티티 ${index}: 타입이 없습니다.`);
                    return;
                }
                
                const element = this.createSvgElement(entity);
                if (element) {
                    this.svgGroup.appendChild(element);
                    drawnCount++;
                }
            } catch (error) {
                errorCount++;
                if (errorCount <= 5) {
                    console.error(`엔티티 ${index} 렌더링 오류:`, error);
                }
            }
        });
        
        console.log(`SVG 렌더링 완료: ${drawnCount}개 성공, ${errorCount}개 실패`);
    }
    
    createSvgElement(entity) {
        // 엔티티 타입별로 SVG 요소 생성
        switch (entity.type) {
            case 'LINE':
                return this.createSvgLine(entity);
            case 'POLYLINE':
            case 'LWPOLYLINE':
                return this.createSvgPolyline(entity);
            case 'CIRCLE':
                return this.createSvgCircle(entity);
            case 'ARC':
                return this.createSvgArc(entity);
            case 'POINT':
                return this.createSvgPoint(entity);
            case 'TEXT':
            case 'MTEXT':
                return this.createSvgText(entity);
            case 'INSERT':
                return this.createSvgInsert(entity);
            case 'SPLINE':
                return this.createSvgSpline(entity);
            case 'ELLIPSE':
                return this.createSvgEllipse(entity);
            case 'SOLID':
            case '3DFACE':
                return this.createSvgSolid(entity);
            default:
                return null;
        }
    }
    
    createSvgLine(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', entity.vertices[0].x);
        line.setAttribute('y1', -entity.vertices[0].y); // Y축 반전
        line.setAttribute('x2', entity.vertices[1].x);
        line.setAttribute('y2', -entity.vertices[1].y);
        line.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        line.setAttribute('stroke-width', '0.3'); // 가장 얇게
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('vector-effect', 'non-scaling-stroke'); // 벡터 효과 - 줌해도 선 굵기 유지
        
        return line;
    }
    
    createSvgPolyline(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        
        const validVertices = entity.vertices.filter(v => 
            v && typeof v.x === 'number' && typeof v.y === 'number'
        );
        
        if (validVertices.length < 2) return null;
        
        const points = validVertices.map(v => `${v.x},${-v.y}`).join(' ');
        
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        polyline.setAttribute('stroke-width', '0.3'); // 가장 얇게 (DXF width 무시)
        polyline.setAttribute('stroke-linejoin', 'round');
        polyline.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return polyline;
    }
    
    createSvgCircle(entity) {
        if (!entity.center || !entity.radius) return null;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.center.x);
        circle.setAttribute('cy', -entity.center.y);
        circle.setAttribute('r', entity.radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        circle.setAttribute('stroke-width', '0.3'); // 가장 얇게
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return circle;
    }
    
    createSvgArc(entity) {
        if (!entity.center || !entity.radius) return null;
        
        // Arc를 path로 변환
        const startAngle = entity.startAngle || 0;
        const endAngle = entity.endAngle || 0;
        
        const startX = entity.center.x + entity.radius * Math.cos(startAngle);
        const startY = entity.center.y + entity.radius * Math.sin(startAngle);
        const endX = entity.center.x + entity.radius * Math.cos(endAngle);
        const endY = entity.center.y + entity.radius * Math.sin(endAngle);
        
        const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${startX} ${-startY} A ${entity.radius} ${entity.radius} 0 ${largeArc} 1 ${endX} ${-endY}`;
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        path.setAttribute('stroke-width', '0.3'); // 가장 얇게
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return path;
    }
    
    createSvgPoint(entity) {
        if (!entity.position) return null;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.position.x);
        circle.setAttribute('cy', -entity.position.y);
        circle.setAttribute('r', '0.2'); // 매우 작게 (0.3에서 0.2로)
        circle.setAttribute('fill', this.getEntityColor(entity)); // 실제 색상
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return circle;
    }
    
    createSvgText(entity) {
        if (!entity.text) return null;
        const pos = entity.startPoint || entity.position;
        if (!pos) return null;
        
        const fontSize = entity.textHeight || entity.height || 10;
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('fill', this.getEntityColor(entity)); // 실제 색상
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('font-size', fontSize);
        text.textContent = entity.text;
        
        // SVG는 Y축이 아래로 증가하므로 텍스트 변환 처리
        if (entity.rotation) {
            // 회전이 있는 경우
            const rotationDeg = -entity.rotation * 180 / Math.PI; // 라디안을 각도로, 반전
            text.setAttribute('transform', 
                `translate(${pos.x}, ${-pos.y}) rotate(${rotationDeg})`);
            text.setAttribute('x', 0);
            text.setAttribute('y', 0);
        } else {
            // 회전이 없는 경우
            text.setAttribute('x', pos.x);
            text.setAttribute('y', -pos.y);
        }
        
        // 텍스트 정렬
        text.setAttribute('dominant-baseline', 'text-before-edge'); // 상단 정렬
        
        return text;
    }
    
    createSvgInsert(entity) {
        if (!entity.position || !entity.name) return null;
        
        const block = this.dxfData.blocks && this.dxfData.blocks[entity.name];
        
        if (!block || !block.entities || block.entities.length === 0) {
            return this.createSvgInsertFallback(entity);
        }
        
        // 블록 그룹 생성
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // 변환 적용
        let transform = `translate(${entity.position.x}, ${-entity.position.y})`;
        
        if (entity.rotation) {
            transform += ` rotate(${-entity.rotation})`;
        }
        
        const xScale = entity.xScale || 1;
        const yScale = entity.yScale || 1;
        if (xScale !== 1 || yScale !== 1) {
            transform += ` scale(${xScale}, ${yScale})`;
        }
        
        if (block.position) {
            transform += ` translate(${-block.position.x}, ${block.position.y})`;
        }
        
        group.setAttribute('transform', transform);
        
        // 블록 내부 엔티티 렌더링
        block.entities.forEach(blockEntity => {
            const element = this.createSvgElement(blockEntity);
            if (element) {
                group.appendChild(element);
            }
        });
        
        return group;
    }
    
    createSvgInsertFallback(entity) {
        // 블록을 찾을 수 없을 때
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        const size = 5;
        
        // 십자 표시
        const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line1.setAttribute('x1', entity.position.x - size);
        line1.setAttribute('y1', -entity.position.y);
        line1.setAttribute('x2', entity.position.x + size);
        line1.setAttribute('y2', -entity.position.y);
        line1.setAttribute('stroke', '#FF6600');
        line1.setAttribute('stroke-width', '0.5'); // 얇게
        line1.setAttribute('vector-effect', 'non-scaling-stroke');
        
        const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line2.setAttribute('x1', entity.position.x);
        line2.setAttribute('y1', -entity.position.y - size);
        line2.setAttribute('x2', entity.position.x);
        line2.setAttribute('y2', -entity.position.y + size);
        line2.setAttribute('stroke', '#FF6600');
        line2.setAttribute('stroke-width', '0.5'); // 얇게
        line2.setAttribute('vector-effect', 'non-scaling-stroke');
        
        group.appendChild(line1);
        group.appendChild(line2);
        
        return group;
    }
    
    createSvgSpline(entity) {
        if (!entity.controlPoints || entity.controlPoints.length < 2) return null;
        
        const points = entity.controlPoints
            .filter(cp => cp && typeof cp.x === 'number' && typeof cp.y === 'number')
            .map(cp => `${cp.x},${-cp.y}`)
            .join(' ');
        
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', points);
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        polyline.setAttribute('stroke-width', '0.3'); // 가장 얇게
        polyline.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return polyline;
    }
    
    createSvgEllipse(entity) {
        if (!entity.center || !entity.majorAxisEndPoint) return null;
        
        const cx = entity.center.x;
        const cy = -entity.center.y;
        const rx = Math.sqrt(
            Math.pow(entity.majorAxisEndPoint.x, 2) + 
            Math.pow(entity.majorAxisEndPoint.y, 2)
        );
        const ry = rx * (entity.axisRatio || 1);
        
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', cx);
        ellipse.setAttribute('cy', cy);
        ellipse.setAttribute('rx', rx);
        ellipse.setAttribute('ry', ry);
        ellipse.setAttribute('fill', 'none');
        ellipse.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        ellipse.setAttribute('stroke-width', '0.3'); // 가장 얇게
        ellipse.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return ellipse;
    }
    
    createSvgSolid(entity) {
        if (!entity.points || entity.points.length < 3) return null;
        
        const points = entity.points
            .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number')
            .map(p => `${p.x},${-p.y}`)
            .join(' ');
        
        const color = this.getEntityColor(entity);
        
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points);
        polygon.setAttribute('fill', color + '40'); // 25% 투명도
        polygon.setAttribute('stroke', color); // 실제 색상
        polygon.setAttribute('stroke-width', '0.3'); // 가장 얇게
        polygon.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return polygon;
    }
    
    drawPhotosCanvas() {
        // Canvas 초기화 (투명)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 사진 마커 그리기
        this.drawPhotos();
    }
    
    // 기존 Canvas 렌더링 함수들은 제거됨 (SVG로 대체)
    
    drawPhotos() {
        const rect = this.svg.getBoundingClientRect();
        
        this.photos.forEach(photo => {
            // ViewBox 좌표 → 스크린 좌표 변환
            const x = ((photo.x - this.viewBox.x) / this.viewBox.width) * rect.width;
            const y = ((photo.y - this.viewBox.y) / this.viewBox.height) * rect.height;
            const w = (photo.width / this.viewBox.width) * rect.width;
            const h = (photo.height / this.viewBox.height) * rect.height;
            
            this.ctx.save();
            
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
            const labelHeight = Math.min(25, h * 0.3); // 최대 25px 또는 높이의 30%
            this.ctx.fillStyle = 'rgba(0, 122, 255, 0.9)';
            this.ctx.fillRect(x, y + h - labelHeight, w, labelHeight);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = `${Math.min(12, labelHeight * 0.6)}px -apple-system, sans-serif`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(photo.fileName, x + w / 2, y + h - labelHeight / 2);
            
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
            
            // ViewBox 중앙에 배치
            const viewCenterX = this.viewBox.x + this.viewBox.width / 2;
            const viewCenterY = this.viewBox.y + this.viewBox.height / 2;
            
            // 사진 크기를 ViewBox 크기의 10%로 설정
            const photoWidth = this.viewBox.width * 0.1;
            const photoHeight = (image.height / image.width) * photoWidth;
            
            const photo = {
                id: Date.now(),
                x: viewCenterX - photoWidth / 2,
                y: viewCenterY - photoHeight / 2,
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
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartViewBox = {...this.viewBox};
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        const rect = this.svg.getBoundingClientRect();
        const dx = (e.clientX - this.dragStartX) * (this.viewBox.width / rect.width);
        const dy = (e.clientY - this.dragStartY) * (this.viewBox.height / rect.height);
        
        this.viewBox = {
            x: this.dragStartViewBox.x - dx,
            y: this.dragStartViewBox.y - dy,
            width: this.viewBox.width,
            height: this.viewBox.height
        };
        
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
            this.dragStartX = touch.clientX;
            this.dragStartY = touch.clientY;
            this.dragStartViewBox = {...this.viewBox};
        }
    }
    
    onTouchMove(e) {
        if (e.touches.length === 1 && this.isDragging) {
            e.preventDefault();
            const touch = e.touches[0];
            
            const rect = this.svg.getBoundingClientRect();
            const dx = (touch.clientX - this.dragStartX) * (this.viewBox.width / rect.width);
            const dy = (touch.clientY - this.dragStartY) * (this.viewBox.height / rect.height);
            
            this.viewBox = {
                x: this.dragStartViewBox.x - dx,
                y: this.dragStartViewBox.y - dy,
                width: this.viewBox.width,
                height: this.viewBox.height
            };
            
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
        
        const svgRect = this.svg.getBoundingClientRect();
        
        // 사진 클릭 확인 (ViewBox 좌표계)
        for (let i = this.photos.length - 1; i >= 0; i--) {
            const photo = this.photos[i];
            
            // ViewBox 좌표 → 스크린 좌표 변환
            const x = ((photo.x - this.viewBox.x) / this.viewBox.width) * svgRect.width;
            const y = ((photo.y - this.viewBox.y) / this.viewBox.height) * svgRect.height;
            const w = (photo.width / this.viewBox.width) * svgRect.width;
            const h = (photo.height / this.viewBox.height) * svgRect.height;
            
            if (clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h) {
                this.openMemoModal(photo.id);
                return;
            }
        }
    }
    
    zoom(factor) {
        // ViewBox 중심점 기준으로 줌
        const centerX = this.viewBox.x + this.viewBox.width / 2;
        const centerY = this.viewBox.y + this.viewBox.height / 2;
        
        // 새로운 크기 계산
        const newWidth = this.viewBox.width / factor;
        const newHeight = this.viewBox.height / factor;
        
        // 중심점 유지하면서 ViewBox 조정
        this.viewBox = {
            x: centerX - newWidth / 2,
            y: centerY - newHeight / 2,
            width: newWidth,
            height: newHeight
        };
        
        console.log('🔍 Zoom:', factor, 'ViewBox:', this.viewBox);
        
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
        
        if (typeof JSZip === 'undefined') {
            alert('ZIP 라이브러리가 로드되지 않았습니다.\n\n페이지를 새로고침(F5)하거나 인터넷 연결을 확인해주세요.');
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
        // iOS 감지
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        console.log('다운로드 환경:', {
            isIOS: isIOS,
            isSafari: isSafari,
            userAgent: navigator.userAgent
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        // iOS Safari 특별 처리
        if (isIOS) {
            // iOS에서는 target="_blank" 필요
            a.target = '_blank';
            
            // 파일 크기 확인
            const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
            console.log(`파일 크기: ${sizeMB}MB`);
            
            // 사용자에게 안내
            if (isSafari) {
                // Safari: 파일이 새 탭에서 열림
                console.log('iOS Safari: 파일이 새 탭에서 열립니다.');
            } else {
                // Chrome: 다운로드 폴더로 저장
                console.log('iOS Chrome: 파일이 다운로드됩니다.');
            }
        }
        
        document.body.appendChild(a);
        
        // iOS에서는 사용자 제스처 컨텍스트에서 실행되어야 함
        try {
            a.click();
        } catch (error) {
            console.error('다운로드 클릭 오류:', error);
            // 폴백: 새 창으로 열기
            window.open(url, '_blank');
        }
        
        document.body.removeChild(a);
        
        // iOS에서는 URL을 즉시 해제하면 안됨
        if (isIOS) {
            setTimeout(() => {
                URL.revokeObjectURL(url);
                console.log('URL 해제됨');
            }, 1000);
            
            // iOS 사용자 안내
            setTimeout(() => {
                if (isSafari) {
                    alert('💾 파일 저장 방법:\n\n' +
                          '1. 새 탭이 열리면 화면을 길게 터치\n' +
                          '2. "파일에 다운로드" 선택\n' +
                          '3. "파일" 앱에서 확인\n\n' +
                          '또는:\n' +
                          '공유 버튼(↑) → "파일에 저장"');
                } else {
                    alert('💾 파일이 다운로드되었습니다!\n\n' +
                          '"다운로드" 또는 "파일" 앱에서 확인하세요.');
                }
            }, 500);
        } else {
            // 데스크탑
            setTimeout(() => URL.revokeObjectURL(url), 100);
        }
    }
}

// 앱 시작
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DxfPhotoEditor();
});

