// DXF 뷰어 클래스 (Three.js + three-dxf 사용)

class DxfViewer {
    constructor(canvasElement, annotationLayer) {
        this.canvas = canvasElement;
        this.annotationLayer = annotationLayer;
        
        // Three.js 기본 설정
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // 카메라 설정 (OrthographicCamera - 2D 도면에 적합)
        this.camera = new THREE.OrthographicCamera(
            -100, 100, // left, right
            100, -100, // top, bottom
            0.1, 1000  // near, far
        );
        this.camera.position.set(0, 0, 100);
        this.camera.lookAt(0, 0, 0);
        
        // 렌더러 설정
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas,
            antialias: true 
        });
        this.updateRendererSize();
        
        // 조명 추가
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 0, 1);
        this.scene.add(directionalLight);
        
        // DXF 데이터
        this.dxfData = null;
        this.dxfGroup = null;
        
        // 터치/마우스 상태
        this.touchState = {
            isPanning: false,
            isZooming: false,
            lastTouch: null,
            lastDistance: 0,
        };
        
        // 카메라 제어 상태
        this.cameraState = {
            zoom: 1,
            panX: 0,
            panY: 0,
        };
        
        // 이벤트 리스너 등록
        this.setupEventListeners();
        
        // 렌더링 시작
        this.animate();
    }

    /**
     * 캔버스 크기 업데이트
     */
    updateRendererSize() {
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        
        this.renderer.setSize(width, height, false);
        
        // 카메라 비율 조정
        const aspect = width / height;
        const viewSize = 100;
        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
    }

    /**
     * DXF 파일 로드
     */
    async loadDxf(dxfString) {
        try {
            // 기존 DXF 제거
            if (this.dxfGroup) {
                this.scene.remove(this.dxfGroup);
            }

            // three-dxf 라이브러리 확인
            if (typeof window.ThreeDxf === 'undefined') {
                throw new Error('three-dxf 라이브러리가 로드되지 않았습니다.\n' +
                    '인터넷 연결을 확인하거나 페이지를 새로고침하세요.\n\n' +
                    '문제가 계속되면 test.html에서 진단을 실행하세요.');
            }

            console.log('DXF 파싱 시작... (길이:', dxfString.length, '문자)');

            // three-dxf 파서 사용
            const parser = new window.ThreeDxf.Parser();
            
            // 파싱 타임아웃 설정 (큰 파일의 경우)
            const parsePromise = new Promise((resolve, reject) => {
                try {
                    const result = parser.parseSync(dxfString);
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('파싱 시간 초과 (30초)')), 30000);
            });

            this.dxfData = await Promise.race([parsePromise, timeoutPromise]);
            
            console.log('✓ DXF 파싱 완료');
            console.log('  엔티티 수:', this.dxfData.entities ? this.dxfData.entities.length : 0);

            // DXF를 Three.js 객체로 변환
            this.dxfGroup = new THREE.Group();
            
            let entityCount = 0;
            // 모든 레이어 추가
            if (this.dxfData && this.dxfData.entities) {
                this.dxfData.entities.forEach((entity, index) => {
                    try {
                        const mesh = this.createEntityMesh(entity);
                        if (mesh) {
                            this.dxfGroup.add(mesh);
                            entityCount++;
                        }
                    } catch (e) {
                        console.warn(`엔티티 ${index} 처리 실패:`, e.message);
                    }
                });
            }

            console.log('✓ 엔티티 렌더링 완료:', entityCount, '개');

            if (entityCount === 0) {
                console.warn('⚠️ 렌더링된 엔티티가 없습니다.');
                console.warn('  DXF 파일에 지원되지 않는 엔티티만 있을 수 있습니다.');
                console.warn('  지원: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT 등');
            }

            this.scene.add(this.dxfGroup);

            // 전체 보기로 조정
            this.fitToView();

            console.log('✓ DXF 로드 완료');
        } catch (error) {
            console.error('❌ DXF 로드 실패:', error);
            
            // 사용자 친화적 에러 메시지
            if (error.message.includes('three-dxf')) {
                throw new Error('DXF 라이브러리를 로드할 수 없습니다.\n' +
                    '인터넷 연결을 확인하고 페이지를 새로고침하세요.');
            } else if (error.message.includes('시간 초과')) {
                throw new Error('파일이 너무 큽니다.\n' +
                    '더 작은 파일로 시도하거나 파일을 단순화하세요.');
            } else {
                throw new Error('DXF 파일을 읽을 수 없습니다.\n' +
                    '파일이 손상되었거나 지원되지 않는 버전일 수 있습니다.\n\n' +
                    '상세 오류: ' + error.message);
            }
        }
    }

    /**
     * DXF 엔티티를 Three.js Mesh로 변환
     */
    createEntityMesh(entity) {
        // three-dxf가 자동으로 변환한 객체 사용
        if (entity.vertices && entity.vertices.length > 0) {
            // 폴리라인
            const geometry = new THREE.BufferGeometry();
            const positions = [];
            
            entity.vertices.forEach(vertex => {
                positions.push(vertex.x, vertex.y, vertex.z || 0);
            });
            
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            
            const material = new THREE.LineBasicMaterial({ 
                color: entity.color || 0xffffff,
                linewidth: 1 
            });
            
            return new THREE.Line(geometry, material);
        }
        
        // 다른 엔티티 타입도 처리 가능 (원, 호, 텍스트 등)
        return null;
    }

    /**
     * 전체 보기 (Fit to View)
     */
    fitToView() {
        if (!this.dxfGroup) return;

        // Bounding Box 계산
        const box = new THREE.Box3().setFromObject(this.dxfGroup);
        
        if (box.isEmpty()) {
            console.warn('DXF에 표시할 객체가 없습니다');
            return;
        }

        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // 카메라 위치 조정
        const maxDim = Math.max(size.x, size.y);
        const viewSize = maxDim * 0.6; // 여유 공간 추가

        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        
        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.position.set(center.x, center.y, 100);
        this.camera.updateProjectionMatrix();

        // 상태 초기화
        this.cameraState = {
            zoom: 1,
            panX: 0,
            panY: 0,
        };
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 터치 이벤트
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));

        // 마우스 이벤트 (데스크탑 테스트용)
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));

        // 리사이즈
        window.addEventListener('resize', () => this.updateRendererSize());
    }

    /**
     * 터치 시작
     */
    onTouchStart(event) {
        event.preventDefault();
        
        const touches = event.touches;

        if (touches.length === 1) {
            // 한 손가락: 패닝 시작
            this.touchState.isPanning = true;
            this.touchState.lastTouch = {
                x: touches[0].clientX,
                y: touches[0].clientY,
            };
        } else if (touches.length === 2) {
            // 두 손가락: 줌 시작
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
            // 패닝
            const deltaX = touches[0].clientX - this.touchState.lastTouch.x;
            const deltaY = touches[0].clientY - this.touchState.lastTouch.y;

            this.pan(deltaX, deltaY);

            this.touchState.lastTouch = {
                x: touches[0].clientX,
                y: touches[0].clientY,
            };
        } else if (this.touchState.isZooming && touches.length === 2) {
            // 줌
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
     * 마우스 다운 (데스크탑용)
     */
    onMouseDown(event) {
        this.touchState.isPanning = true;
        this.touchState.lastTouch = {
            x: event.clientX,
            y: event.clientY,
        };
    }

    /**
     * 마우스 이동 (데스크탑용)
     */
    onMouseMove(event) {
        if (!this.touchState.isPanning) return;

        const deltaX = event.clientX - this.touchState.lastTouch.x;
        const deltaY = event.clientY - this.touchState.lastTouch.y;

        this.pan(deltaX, deltaY);

        this.touchState.lastTouch = {
            x: event.clientX,
            y: event.clientY,
        };
    }

    /**
     * 마우스 업 (데스크탑용)
     */
    onMouseUp(event) {
        this.touchState.isPanning = false;
    }

    /**
     * 마우스 휠 (데스크탑용)
     */
    onWheel(event) {
        event.preventDefault();
        this.zoom(-event.deltaY * 0.001);
    }

    /**
     * 패닝 처리
     */
    pan(deltaX, deltaY) {
        const panSpeed = 0.5;
        
        this.camera.position.x -= deltaX * panSpeed * (this.camera.right - this.camera.left) / this.canvas.clientWidth;
        this.camera.position.y += deltaY * panSpeed * (this.camera.top - this.camera.bottom) / this.canvas.clientHeight;
    }

    /**
     * 줌 처리
     */
    zoom(delta) {
        const zoomSpeed = 1.0;
        const newZoom = this.cameraState.zoom + delta * zoomSpeed;
        
        // 줌 제한 (0.1배 ~ 10배)
        this.cameraState.zoom = Math.max(0.1, Math.min(10, newZoom));

        const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
        const viewSize = 100 / this.cameraState.zoom;

        this.camera.left = -viewSize * aspect;
        this.camera.right = viewSize * aspect;
        this.camera.top = viewSize;
        this.camera.bottom = -viewSize;
        this.camera.updateProjectionMatrix();
    }

    /**
     * 화면 좌표를 도면 좌표로 변환
     */
    screenToWorld(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        
        // 정규화된 좌표 (-1 ~ 1)
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;

        // 카메라 좌표계로 변환
        const worldX = this.camera.position.x + x * (this.camera.right - this.camera.left) / 2;
        const worldY = this.camera.position.y + y * (this.camera.top - this.camera.bottom) / 2;

        return { x: worldX, y: worldY };
    }

    /**
     * 도면 좌표를 화면 좌표로 변환
     */
    worldToScreen(worldX, worldY) {
        const rect = this.canvas.getBoundingClientRect();
        
        const x = (worldX - this.camera.position.x) / ((this.camera.right - this.camera.left) / 2);
        const y = (worldY - this.camera.position.y) / ((this.camera.top - this.camera.bottom) / 2);

        const screenX = (x + 1) / 2 * rect.width + rect.left;
        const screenY = (-y + 1) / 2 * rect.height + rect.top;

        return { x: screenX, y: screenY };
    }

    /**
     * 애니메이션 루프
     */
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * 정리
     */
    dispose() {
        this.renderer.dispose();
        if (this.dxfGroup) {
            this.scene.remove(this.dxfGroup);
        }
    }
}

export default DxfViewer;

