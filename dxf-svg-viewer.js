// 간단한 DXF to SVG 변환 뷰어 (외부 라이브러리 불필요)

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
        this.svg.style.background = '#1a1a1a';
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
     * DXF 파일 로드 (간단한 파싱)
     */
    async loadDxf(dxfString) {
        try {
            console.log('DXF 파싱 시작...');
            
            // 기존 내용 제거
            this.svg.innerHTML = '';
            
            // 간단한 DXF 파싱
            this.dxfData = this.parseDxf(dxfString);
            
            console.log('파싱된 엔티티:', this.dxfData.entities.length);
            
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

    /**
     * 개선된 DXF 파싱 (LINE, LWPOLYLINE, CIRCLE, ARC 지원)
     */
    parseDxf(dxfString) {
        const lines = dxfString.split('\n').map(line => line.trim());
        const entities = [];
        let inEntitiesSection = false;
        let currentEntity = null;
        let i = 0;
        
        console.log('📄 DXF 파일 총 라인 수:', lines.length);
        
        while (i < lines.length) {
            const code = lines[i];
            const value = lines[i + 1] || '';
            
            // 섹션 확인
            if (code === '0') {
                if (value === 'SECTION') {
                    // 다음 섹션 이름 확인
                    if (lines[i + 2] === '2' && lines[i + 3] === 'ENTITIES') {
                        inEntitiesSection = true;
                        console.log('✅ ENTITIES 섹션 발견');
                    }
                } else if (value === 'ENDSEC') {
                    if (inEntitiesSection) {
                        console.log('✅ ENTITIES 섹션 종료');
                        inEntitiesSection = false;
                    }
                } else if (inEntitiesSection) {
                    // 이전 엔티티 저장
                    if (currentEntity && currentEntity.type) {
                        entities.push(currentEntity);
                        console.log(`📐 엔티티 저장: ${currentEntity.type}`, currentEntity);
                    }
                    
                    // 새 엔티티 시작
                    currentEntity = { 
                        type: value,
                        color: 7 // 기본 흰색
                    };
                }
            }
            
            // 엔티티 데이터 파싱
            if (currentEntity && inEntitiesSection) {
                const numValue = parseFloat(value);
                
                switch (code) {
                    case '8':  currentEntity.layer = value; break;
                    case '10': currentEntity.x1 = numValue; break;
                    case '20': currentEntity.y1 = numValue; break;
                    case '30': currentEntity.z1 = numValue; break;
                    case '11': currentEntity.x2 = numValue; break;
                    case '21': currentEntity.y2 = numValue; break;
                    case '31': currentEntity.z2 = numValue; break;
                    case '40': currentEntity.radius = numValue; break;
                    case '50': currentEntity.startAngle = numValue; break;
                    case '51': currentEntity.endAngle = numValue; break;
                    case '62': currentEntity.color = parseInt(value); break;
                    case '70': currentEntity.flags = parseInt(value); break;
                    case '90': currentEntity.vertexCount = parseInt(value); break;
                }
            }
            
            i += 2; // 코드와 값 한 쌍 건너뛰기
        }
        
        // 마지막 엔티티 저장
        if (currentEntity && currentEntity.type) {
            entities.push(currentEntity);
        }
        
        console.log(`✅ 총 ${entities.length}개 엔티티 파싱 완료`);
        
        // 엔티티 타입별 통계
        const stats = {};
        entities.forEach(e => {
            stats[e.type] = (stats[e.type] || 0) + 1;
        });
        console.log('📊 엔티티 타입별 개수:', stats);
        
        return { entities };
    }

    /**
     * SVG로 렌더링
     */
    renderToSvg() {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        let renderedCount = 0;
        
        console.log('🎨 SVG 렌더링 시작...');
        
        this.dxfData.entities.forEach((entity, index) => {
            let element = null;
            
            try {
                switch (entity.type) {
                    case 'LINE':
                        if (entity.x1 !== undefined && entity.y1 !== undefined && 
                            entity.x2 !== undefined && entity.y2 !== undefined) {
                            element = this.createLine(entity);
                            minX = Math.min(minX, entity.x1, entity.x2);
                            minY = Math.min(minY, entity.y1, entity.y2);
                            maxX = Math.max(maxX, entity.x1, entity.x2);
                            maxY = Math.max(maxY, entity.y1, entity.y2);
                        } else {
                            console.warn('LINE 좌표 누락:', entity);
                        }
                        break;
                        
                    case 'CIRCLE':
                        if (entity.x1 !== undefined && entity.y1 !== undefined && entity.radius) {
                            element = this.createCircle(entity);
                            minX = Math.min(minX, entity.x1 - entity.radius);
                            minY = Math.min(minY, entity.y1 - entity.radius);
                            maxX = Math.max(maxX, entity.x1 + entity.radius);
                            maxY = Math.max(maxY, entity.y1 + entity.radius);
                        } else {
                            console.warn('CIRCLE 데이터 누락:', entity);
                        }
                        break;
                        
                    case 'ARC':
                        if (entity.x1 !== undefined && entity.y1 !== undefined && 
                            entity.radius && entity.startAngle !== undefined && entity.endAngle !== undefined) {
                            element = this.createArc(entity);
                            minX = Math.min(minX, entity.x1 - entity.radius);
                            minY = Math.min(minY, entity.y1 - entity.radius);
                            maxX = Math.max(maxX, entity.x1 + entity.radius);
                            maxY = Math.max(maxY, entity.y1 + entity.radius);
                        } else {
                            console.warn('ARC 데이터 누락:', entity);
                        }
                        break;
                        
                    case 'LWPOLYLINE':
                    case 'POLYLINE':
                        console.warn('POLYLINE은 현재 버전에서 제한적 지원');
                        break;
                        
                    default:
                        // 지원하지 않는 엔티티
                        break;
                }
                
                if (element) {
                    group.appendChild(element);
                    renderedCount++;
                }
            } catch (error) {
                console.error(`엔티티 렌더링 실패 [${index}]:`, entity, error);
            }
        });
        
        console.log(`✅ ${renderedCount}/${this.dxfData.entities.length}개 엔티티 렌더링 완료`);
        
        // 범위 확인
        if (minX === Infinity) {
            console.error('❌ 유효한 엔티티가 없습니다!');
            // 기본 범위 설정
            this.bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
        } else {
            this.bounds = { minX, minY, maxX, maxY };
            console.log('📏 도면 범위:', this.bounds);
        }
        
        this.svg.appendChild(group);
    }

    /**
     * LINE 생성
     */
    createLine(entity) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', entity.x1);
        line.setAttribute('y1', -entity.y1); // Y축 반전 (DXF는 Y축이 위로)
        line.setAttribute('x2', entity.x2);
        line.setAttribute('y2', -entity.y2);
        line.setAttribute('stroke', this.getColor(entity.color));
        line.setAttribute('stroke-width', '2'); // 더 굵게 (보이도록)
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('vector-effect', 'non-scaling-stroke'); // 줌해도 선 두께 유지
        
        console.log(`LINE 생성: (${entity.x1},${entity.y1}) → (${entity.x2},${entity.y2}), 색상: ${entity.color}`);
        return line;
    }

    /**
     * CIRCLE 생성
     */
    createCircle(entity) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.x1);
        circle.setAttribute('cy', -entity.y1);
        circle.setAttribute('r', entity.radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', this.getColor(entity.color));
        circle.setAttribute('stroke-width', '2');
        circle.setAttribute('vector-effect', 'non-scaling-stroke');
        
        console.log(`CIRCLE 생성: 중심(${entity.x1},${entity.y1}), 반지름: ${entity.radius}`);
        return circle;
    }

    /**
     * ARC 생성
     */
    createArc(entity) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        
        // 각도를 라디안으로 변환
        const startRad = entity.startAngle * Math.PI / 180;
        const endRad = entity.endAngle * Math.PI / 180;
        
        // 시작점과 끝점 계산
        const x1 = entity.x1 + entity.radius * Math.cos(startRad);
        const y1 = -entity.y1 - entity.radius * Math.sin(startRad);
        const x2 = entity.x1 + entity.radius * Math.cos(endRad);
        const y2 = -entity.y1 - entity.radius * Math.sin(endRad);
        
        // 큰 호 플래그
        const largeArc = (endRad - startRad) > Math.PI ? 1 : 0;
        
        const d = `M ${x1} ${y1} A ${entity.radius} ${entity.radius} 0 ${largeArc} 1 ${x2} ${y2}`;
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', this.getColor(entity.color));
        path.setAttribute('stroke-width', '1');
        return path;
    }

    /**
     * 색상 변환 (AutoCAD 색상 인덱스)
     */
    getColor(colorCode) {
        // AutoCAD 색상 인덱스 매핑
        const colorMap = {
            0: '#ffffff',   // ByBlock
            1: '#ff0000',   // 빨강
            2: '#ffff00',   // 노랑
            3: '#00ff00',   // 초록
            4: '#00ffff',   // 시안
            5: '#0000ff',   // 파랑
            6: '#ff00ff',   // 마젠타
            7: '#ffffff',   // 흰색/검정
            8: '#808080',   // 회색
            9: '#c0c0c0',   // 밝은 회색
            256: '#ffffff', // ByLayer
        };
        
        // 색상 코드가 없거나 ByLayer인 경우 흰색 사용
        const color = colorMap[colorCode] || '#ffffff';
        
        console.log(`색상 변환: ${colorCode} → ${color}`);
        return color;
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

