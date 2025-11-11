// DXF to SVG 변환 뷰어 (dxf-parser 사용)
// 1110 폴더의 작동하는 코드 참조

class DxfSvgViewer {
    constructor(containerElement) {
        this.container = containerElement;
        this.svg = null;
        this.viewBox = { x: 0, y: 0, width: 1000, height: 1000 };
        this.dxfData = null;
        
        // 터치 상태
        this.touchState = {
            isPanning: false,
            isZooming: false,
            lastTouch: null,
            lastDistance: 0,
        };
        
        this.createSvg();
        this.setupEventListeners();
    }

    /**
     * SVG 요소 생성
     */
    createSvg() {
        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.style.width = '100%';
        this.svg.style.height = '100%';
        this.svg.style.background = '#ffffff'; // 흰색 배경
        this.svg.style.touchAction = 'none';
        
        this.updateViewBox();
        this.container.appendChild(this.svg);
    }

    /**
     * ViewBox 업데이트
     */
    updateViewBox() {
        this.svg.setAttribute('viewBox', 
            `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`
        );
    }

    /**
     * DXF 파일 로드 (dxf-parser 라이브러리 사용)
     */
    async loadDxf(dxfString) {
        try {
            console.log('📄 DXF 파싱 시작...');
            
            // 기존 내용 제거
            this.svg.innerHTML = '';
            
            // dxf-parser 라이브러리 확인
            if (typeof DxfParser === 'undefined') {
                throw new Error(
                    'DXF 파서 라이브러리가 로드되지 않았습니다.\n\n' +
                    '해결 방법:\n' +
                    '1. 페이지를 새로고침하세요 (F5)\n' +
                    '2. 인터넷 연결을 확인하세요\n' +
                    '3. CDN이 차단되었다면 관리자에게 문의하세요'
                );
            }
            
            // DXF 파싱 (검증된 라이브러리 사용)
            const parser = new DxfParser();
            this.dxfData = parser.parseSync(dxfString);
            
            if (!this.dxfData) {
                throw new Error('DXF 파일 파싱에 실패했습니다.');
            }
            
            // 엔티티 확인
            if (!this.dxfData.entities || this.dxfData.entities.length === 0) {
                console.warn('⚠️ DXF 파일에 엔티티가 없습니다.');
                throw new Error('도면에 그려진 내용이 없습니다.');
            }
            
            console.log('✅ DXF 파싱 완료');
            console.log('📊 엔티티 개수:', this.dxfData.entities.length);
            console.log('🎨 첫 번째 엔티티:', this.dxfData.entities[0]);
            
            // SVG로 렌더링
            this.renderToSvg();
            
            // 전체보기
            this.fitToView();
            
            console.log('✅ DXF 로드 완료');
        } catch (error) {
            console.error('❌ DXF 로드 실패:', error);
            throw error;
        }
    }

    // parseDxf 함수 제거 - dxf-parser 라이브러리 사용

    /**
     * SVG로 렌더링 (dxf-parser 데이터 사용)
     */
    renderToSvg() {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        let renderedCount = 0;
        let errorCount = 0;
        
        console.log('🎨 SVG 렌더링 시작...');
        
        this.dxfData.entities.forEach((entity, index) => {
            try {
                if (!entity || !entity.type) {
                    console.warn(`엔티티 ${index}: 타입이 없습니다.`);
                    return;
                }
                
                const element = this.createSvgElement(entity);
                
                if (element) {
                    group.appendChild(element);
                    renderedCount++;
                    
                    // 범위 계산 (vertices 사용)
                    if (entity.vertices && Array.isArray(entity.vertices)) {
                        entity.vertices.forEach(v => {
                            if (v && typeof v.x === 'number' && typeof v.y === 'number') {
                                minX = Math.min(minX, v.x);
                                minY = Math.min(minY, v.y);
                                maxX = Math.max(maxX, v.x);
                                maxY = Math.max(maxY, v.y);
                            }
                        });
                    }
                    
                    // CIRCLE/ARC 범위
                    if (entity.type === 'CIRCLE' || entity.type === 'ARC') {
                        if (entity.center && entity.radius) {
                            minX = Math.min(minX, entity.center.x - entity.radius);
                            minY = Math.min(minY, entity.center.y - entity.radius);
                            maxX = Math.max(maxX, entity.center.x + entity.radius);
                            maxY = Math.max(maxY, entity.center.y + entity.radius);
                        }
                    }
                }
            } catch (error) {
                errorCount++;
                if (errorCount <= 5) {
                    console.error(`엔티티 ${index} 렌더링 오류:`, error, entity);
                }
            }
        });
        
        console.log(`✅ SVG 렌더링 완료: ${renderedCount}개 성공, ${errorCount}개 실패`);
        
        // 범위 확인
        if (minX === Infinity) {
            console.error('❌ 유효한 엔티티가 없습니다!');
            this.bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
        } else {
            this.bounds = { minX, minY, maxX, maxY };
            console.log('📏 도면 범위:', this.bounds);
        }
        
        this.svg.appendChild(group);
    }
    
    /**
     * SVG 요소 생성 (1110 스타일)
     */
    createSvgElement(entity) {
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
            default:
                // 기타 엔티티는 무시
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
        line.setAttribute('stroke', this.getEntityColor(entity));
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        
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
        polyline.setAttribute('stroke', this.getEntityColor(entity));
        polyline.setAttribute('stroke-width', '2');
        polyline.setAttribute('stroke-linecap', 'round');
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
        circle.setAttribute('stroke', this.getEntityColor(entity));
        circle.setAttribute('stroke-width', '2');
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return circle;
    }
    
    createSvgArc(entity) {
        if (!entity.center || !entity.radius) return null;
        
        const startRad = entity.startAngle * Math.PI / 180;
        const endRad = entity.endAngle * Math.PI / 180;
        
        const x1 = entity.center.x + entity.radius * Math.cos(startRad);
        const y1 = -entity.center.y - entity.radius * Math.sin(startRad);
        const x2 = entity.center.x + entity.radius * Math.cos(endRad);
        const y2 = -entity.center.y - entity.radius * Math.sin(endRad);
        
        const largeArc = (endRad - startRad) > Math.PI ? 1 : 0;
        
        const d = `M ${x1} ${y1} A ${entity.radius} ${entity.radius} 0 ${largeArc} 1 ${x2} ${y2}`;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', this.getEntityColor(entity));
        path.setAttribute('stroke-width', '2');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        
        return path;
    }

    // 기존 함수들 제거됨 - 위의 create함수들로 대체

    /**
     * 엔티티 색상 가져오기 (1110 스타일)
     */
    getEntityColor(entity) {
        // dxf-parser가 이미 RGB 문자열로 변환한 경우
        if (entity.color && typeof entity.color === 'string' && entity.color.startsWith('#')) {
            // 흰색은 검은 배경에 안 보이므로 변환
            if (entity.color.toUpperCase() === '#FFFFFF' || entity.color.toUpperCase() === '#FFF') {
                return '#000000'; // 검은색으로 변경
            }
            return entity.color;
        }
        
        // colorIndex 사용
        if (entity.colorIndex !== undefined) {
            return this.autocadColorIndexToHex(entity.colorIndex);
        }
        
        // 기본값: 검은색
        return '#000000';
    }
    
    /**
     * AutoCAD 색상 인덱스를 Hex로 변환
     */
    autocadColorIndexToHex(index) {
        // AutoCAD 256색 팔레트 (주요 색상만)
        const colorMap = {
            0: '#000000',   // ByBlock
            1: '#FF0000',   // 빨강
            2: '#FFFF00',   // 노랑
            3: '#00FF00',   // 초록
            4: '#00FFFF',   // 시안
            5: '#0000FF',   // 파랑
            6: '#FF00FF',   // 마젠타
            7: '#000000',   // 흰색/검정 (배경과 대비)
            8: '#414141',   // 회색
            9: '#808080',   // 밝은 회색
            256: '#000000', // ByLayer
        };
        
        return colorMap[index] || '#000000';
    }

    /**
     * 전체보기
     */
    fitToView() {
        if (!this.bounds) return;
        
        const { minX, minY, maxX, maxY } = this.bounds;
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = Math.max(width, height) * 0.1;
        
        this.viewBox = {
            x: minX - padding,
            y: -maxY - padding, // Y축 반전
            width: width + padding * 2,
            height: height + padding * 2
        };
        
        this.updateViewBox();
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        this.svg.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.svg.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.svg.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // 마우스 이벤트 (데스크탑용)
        this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.svg.addEventListener('wheel', this.onWheel.bind(this));
    }

    /**
     * 터치 시작
     */
    onTouchStart(event) {
        event.preventDefault();
        const touches = event.touches;

        if (touches.length === 1) {
            this.touchState.isPanning = true;
            this.touchState.lastTouch = {
                x: touches[0].clientX,
                y: touches[0].clientY
            };
        } else if (touches.length === 2) {
            this.touchState.isZooming = true;
            this.touchState.isPanning = false;
            
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            this.touchState.lastDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }

    /**
     * 터치 이동
     */
    onTouchMove(event) {
        event.preventDefault();
        const touches = event.touches;

        if (this.touchState.isPanning && touches.length === 1) {
            const deltaX = touches[0].clientX - this.touchState.lastTouch.x;
            const deltaY = touches[0].clientY - this.touchState.lastTouch.y;

            this.pan(deltaX, deltaY);

            this.touchState.lastTouch = {
                x: touches[0].clientX,
                y: touches[0].clientY
            };
        } else if (this.touchState.isZooming && touches.length === 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const delta = distance - this.touchState.lastDistance;
            this.zoom(delta * 0.01);

            this.touchState.lastDistance = distance;
        }
    }

    /**
     * 터치 종료
     */
    onTouchEnd(event) {
        this.touchState.isPanning = false;
        this.touchState.isZooming = false;
    }

    /**
     * 마우스 다운
     */
    onMouseDown(event) {
        this.touchState.isPanning = true;
        this.touchState.lastTouch = { x: event.clientX, y: event.clientY };
    }

    /**
     * 마우스 이동
     */
    onMouseMove(event) {
        if (!this.touchState.isPanning) return;

        const deltaX = event.clientX - this.touchState.lastTouch.x;
        const deltaY = event.clientY - this.touchState.lastTouch.y;

        this.pan(deltaX, deltaY);

        this.touchState.lastTouch = { x: event.clientX, y: event.clientY };
    }

    /**
     * 마우스 업
     */
    onMouseUp(event) {
        this.touchState.isPanning = false;
    }

    /**
     * 마우스 휠
     */
    onWheel(event) {
        event.preventDefault();
        this.zoom(-event.deltaY * 0.001);
    }

    /**
     * 패닝
     */
    pan(deltaX, deltaY) {
        const scale = this.viewBox.width / this.container.clientWidth;
        this.viewBox.x -= deltaX * scale;
        this.viewBox.y -= deltaY * scale;
        this.updateViewBox();
    }

    /**
     * 줌
     */
    zoom(delta) {
        const scale = 1 - delta;
        const centerX = this.viewBox.x + this.viewBox.width / 2;
        const centerY = this.viewBox.y + this.viewBox.height / 2;
        
        this.viewBox.width *= scale;
        this.viewBox.height *= scale;
        
        this.viewBox.x = centerX - this.viewBox.width / 2;
        this.viewBox.y = centerY - this.viewBox.height / 2;
        
        this.updateViewBox();
    }

    /**
     * 화면 좌표를 SVG 좌표로 변환
     */
    screenToSvg(screenX, screenY) {
        const rect = this.svg.getBoundingClientRect();
        const x = (screenX - rect.left) / rect.width * this.viewBox.width + this.viewBox.x;
        const y = (screenY - rect.top) / rect.height * this.viewBox.height + this.viewBox.y;
        return { x, y: -y }; // Y축 다시 반전
    }
}

export default DxfSvgViewer;

