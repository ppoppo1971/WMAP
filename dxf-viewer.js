/**
 * DXF 뷰어 모듈
 * - Three.js 기반 DXF 파일 렌더링
 * - 터치 제스처 처리 (팬, 줌, 롱프레스)
 * - 마커 관리
 */

class DxfViewer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.container = canvasElement.parentElement;
        
        // Three.js 기본 요소
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.dxfObject = null;
        
        // 카메라 제어
        this.cameraDistance = 1000;
        this.cameraPosition = { x: 0, y: 0 };
        this.minZoom = 0.1;
        this.maxZoom = 10;
        
        // 터치 제스처 상태
        this.touchState = {
            touching: false,
            touchCount: 0,
            startPos: null,
            lastPos: null,
            startDistance: 0,
            longPressTimer: null,
            longPressTriggered: false
        };
        
        // 롱프레스 설정 (800ms)
        this.longPressDuration = 800;
        
        // 마커 데이터
        this.markers = [];
        
        // 도면 경계
        this.bounds = null;
        
        this.init();
    }

    /**
     * 뷰어 초기화
     */
    init() {
        // Scene 생성
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a0a);

        // Camera 생성 (Orthographic - 2D 도면에 적합)
        const aspect = this.container.clientWidth / this.container.clientHeight;
        const frustumSize = 1000;
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            10000
        );
        this.camera.position.set(0, 0, 1000);
        this.camera.lookAt(0, 0, 0);

        // Renderer 생성
        this.renderer = new THREE.WebGLRenderer({ 
            canvas: this.canvas,
            antialias: true 
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        // 조명 추가
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 0, 1);
        this.scene.add(directionalLight);

        // 터치 이벤트 리스너 등록
        this.setupTouchEvents();

        // 윈도우 리사이즈 처리
        window.addEventListener('resize', () => this.onResize());

        // 렌더링 시작
        this.animate();
    }

    /**
     * DXF 파일 로드
     */
    async loadDxf(dxfContent) {
        try {
            // 기존 DXF 오브젝트 제거
            if (this.dxfObject) {
                this.scene.remove(this.dxfObject);
            }

            // three-dxf로 DXF 파싱
            const font = new THREE.Font(); // 기본 폰트
            const dxfParser = new window.DxfParser();
            const dxf = dxfParser.parseSync(dxfContent);

            // DXF 객체를 Three.js 메쉬로 변환
            const helper = new window.ThreeDxf.DxfViewer(dxf, font);
            this.dxfObject = helper.group;
            
            this.scene.add(this.dxfObject);

            // 도면 경계 계산 및 전체보기
            this.calculateBounds();
            this.zoomToFit();

            console.log('DXF 파일 로드 완료');
            return true;
        } catch (error) {
            console.error('DXF 로드 실패:', error);
            throw error;
        }
    }

    /**
     * 도면 경계 계산
     */
    calculateBounds() {
        if (!this.dxfObject) return;

        const box = new THREE.Box3().setFromObject(this.dxfObject);
        this.bounds = {
            min: box.min,
            max: box.max,
            center: box.getCenter(new THREE.Vector3()),
            size: box.getSize(new THREE.Vector3())
        };
    }

    /**
     * 전체보기 (Zoom to Fit)
     */
    zoomToFit() {
        if (!this.bounds) return;

        const aspect = this.container.clientWidth / this.container.clientHeight;
        const size = this.bounds.size;
        
        // 화면에 맞게 카메라 크기 조정
        const maxDim = Math.max(size.x, size.y / aspect);
        const frustumSize = maxDim * 1.2; // 약간의 여백 추가

        this.camera.left = frustumSize * aspect / -2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = frustumSize / -2;
        this.camera.updateProjectionMatrix();

        // 카메라 위치를 도면 중심으로 이동
        this.cameraPosition.x = this.bounds.center.x;
        this.cameraPosition.y = this.bounds.center.y;
        this.camera.position.set(this.cameraPosition.x, this.cameraPosition.y, 1000);
    }

    /**
     * 터치 이벤트 설정
     */
    setupTouchEvents() {
        // 터치 시작
        this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
        
        // 터치 이동
        this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        
        // 터치 종료
        this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
        
        // 터치 취소
        this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
    }

    /**
     * 터치 시작 핸들러
     */
    onTouchStart(e) {
        e.preventDefault();
        
        const touches = e.touches;
        this.touchState.touchCount = touches.length;
        this.touchState.touching = true;
        this.touchState.longPressTriggered = false;

        if (touches.length === 1) {
            // 한 손가락: 팬 또는 롱프레스
            const touch = touches[0];
            this.touchState.startPos = { x: touch.clientX, y: touch.clientY };
            this.touchState.lastPos = { x: touch.clientX, y: touch.clientY };

            // 롱프레스 타이머 시작
            this.touchState.longPressTimer = setTimeout(() => {
                if (this.touchState.touching && !this.touchState.longPressTriggered) {
                    this.onLongPress(touch.clientX, touch.clientY);
                    this.touchState.longPressTriggered = true;
                }
            }, this.longPressDuration);

        } else if (touches.length === 2) {
            // 두 손가락: 핀치 줌
            this.clearLongPressTimer();
            
            const touch1 = touches[0];
            const touch2 = touches[1];
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            this.touchState.startDistance = Math.sqrt(dx * dx + dy * dy);
            
            // 중심점 저장
            this.touchState.startPos = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }
    }

    /**
     * 터치 이동 핸들러
     */
    onTouchMove(e) {
        e.preventDefault();
        
        const touches = e.touches;

        if (touches.length === 1 && !this.touchState.longPressTriggered) {
            // 한 손가락 드래그: 도면 이동
            const touch = touches[0];
            const currentPos = { x: touch.clientX, y: touch.clientY };
            
            // 이동 거리 계산
            const dx = currentPos.x - this.touchState.lastPos.x;
            const dy = currentPos.y - this.touchState.lastPos.y;
            
            // 움직임이 있으면 롱프레스 취소
            const moveThreshold = 10;
            const totalMove = Math.sqrt(
                Math.pow(currentPos.x - this.touchState.startPos.x, 2) +
                Math.pow(currentPos.y - this.touchState.startPos.y, 2)
            );
            
            if (totalMove > moveThreshold) {
                this.clearLongPressTimer();
            }

            // 카메라 이동 (화면 좌표를 월드 좌표로 변환)
            const frustumHeight = this.camera.top - this.camera.bottom;
            const scaleFactor = frustumHeight / this.container.clientHeight;
            
            this.cameraPosition.x -= dx * scaleFactor;
            this.cameraPosition.y += dy * scaleFactor;
            
            this.camera.position.set(this.cameraPosition.x, this.cameraPosition.y, 1000);
            
            this.touchState.lastPos = currentPos;

        } else if (touches.length === 2) {
            // 핀치 줌
            const touch1 = touches[0];
            const touch2 = touches[1];
            const dx = touch2.clientX - touch1.clientX;
            const dy = touch2.clientY - touch1.clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            
            // 줌 스케일 계산
            const scale = currentDistance / this.touchState.startDistance;
            
            // 카메라 프러스텀 크기 조정
            const aspect = this.container.clientWidth / this.container.clientHeight;
            const currentHeight = this.camera.top - this.camera.bottom;
            const newHeight = currentHeight / scale;
            
            // 줌 제한 적용
            const minHeight = 10;
            const maxHeight = 100000;
            const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
            
            this.camera.top = clampedHeight / 2;
            this.camera.bottom = -clampedHeight / 2;
            this.camera.left = clampedHeight * aspect / -2;
            this.camera.right = clampedHeight * aspect / 2;
            this.camera.updateProjectionMatrix();
            
            this.touchState.startDistance = currentDistance;
        }
    }

    /**
     * 터치 종료 핸들러
     */
    onTouchEnd(e) {
        this.touchState.touching = false;
        this.touchState.touchCount = e.touches.length;
        this.clearLongPressTimer();
        
        if (e.touches.length === 0) {
            this.touchState.startPos = null;
            this.touchState.lastPos = null;
        }
    }

    /**
     * 롱프레스 타이머 클리어
     */
    clearLongPressTimer() {
        if (this.touchState.longPressTimer) {
            clearTimeout(this.touchState.longPressTimer);
            this.touchState.longPressTimer = null;
        }
    }

    /**
     * 롱프레스 이벤트 핸들러
     */
    onLongPress(screenX, screenY) {
        console.log('롱프레스 감지:', screenX, screenY);
        
        // 화면 좌표를 월드 좌표로 변환
        const worldPos = this.screenToWorld(screenX, screenY);
        
        // 진동 피드백 (iOS는 제한적)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // 커스텀 이벤트 발생
        const event = new CustomEvent('longpress', {
            detail: {
                screenX,
                screenY,
                worldX: worldPos.x,
                worldY: worldPos.y
            }
        });
        this.canvas.dispatchEvent(event);
    }

    /**
     * 화면 좌표를 월드 좌표로 변환
     */
    screenToWorld(screenX, screenY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((screenX - rect.left) / rect.width) * 2 - 1;
        const y = -((screenY - rect.top) / rect.height) * 2 + 1;
        
        const frustumHeight = this.camera.top - this.camera.bottom;
        const frustumWidth = this.camera.right - this.camera.left;
        
        const worldX = this.cameraPosition.x + (x * frustumWidth / 2);
        const worldY = this.cameraPosition.y + (y * frustumHeight / 2);
        
        return { x: worldX, y: worldY };
    }

    /**
     * 월드 좌표를 화면 좌표로 변환
     */
    worldToScreen(worldX, worldY) {
        const frustumHeight = this.camera.top - this.camera.bottom;
        const frustumWidth = this.camera.right - this.camera.left;
        
        const x = (worldX - this.cameraPosition.x) / (frustumWidth / 2);
        const y = (worldY - this.cameraPosition.y) / (frustumHeight / 2);
        
        const rect = this.canvas.getBoundingClientRect();
        const screenX = ((x + 1) / 2) * rect.width + rect.left;
        const screenY = ((-y + 1) / 2) * rect.height + rect.top;
        
        return { x: screenX, y: screenY };
    }

    /**
     * 마커 추가
     */
    addMarker(worldX, worldY, photoData, memo) {
        const marker = {
            id: Date.now().toString(),
            worldX,
            worldY,
            photoData,
            memo,
            element: null
        };
        
        this.markers.push(marker);
        this.updateMarkers();
        
        return marker;
    }

    /**
     * 마커 삭제
     */
    removeMarker(markerId) {
        const index = this.markers.findIndex(m => m.id === markerId);
        if (index !== -1) {
            const marker = this.markers[index];
            if (marker.element && marker.element.parentNode) {
                marker.element.parentNode.removeChild(marker.element);
            }
            this.markers.splice(index, 1);
        }
    }

    /**
     * 마커 업데이트 (화면 위치 동기화)
     */
    updateMarkers() {
        const markersContainer = document.getElementById('markers-container');
        
        this.markers.forEach(marker => {
            // 마커 엘리먼트가 없으면 생성
            if (!marker.element) {
                marker.element = document.createElement('div');
                marker.element.className = 'photo-marker';
                marker.element.textContent = '📷';
                marker.element.dataset.markerId = marker.id;
                markersContainer.appendChild(marker.element);
                
                // 클릭 이벤트
                marker.element.addEventListener('click', () => {
                    const event = new CustomEvent('markerclick', {
                        detail: { marker }
                    });
                    this.canvas.dispatchEvent(event);
                });
            }
            
            // 월드 좌표를 화면 좌표로 변환
            const screenPos = this.worldToScreen(marker.worldX, marker.worldY);
            
            // 마커 위치 업데이트
            const rect = this.canvas.getBoundingClientRect();
            marker.element.style.left = `${screenPos.x - rect.left}px`;
            marker.element.style.top = `${screenPos.y - rect.top}px`;
        });
    }

    /**
     * 윈도우 리사이즈 처리
     */
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.renderer.setSize(width, height);
        
        const aspect = width / height;
        const frustumHeight = this.camera.top - this.camera.bottom;
        this.camera.left = frustumHeight * aspect / -2;
        this.camera.right = frustumHeight * aspect / 2;
        this.camera.updateProjectionMatrix();
        
        this.updateMarkers();
    }

    /**
     * 애니메이션 루프
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
        this.updateMarkers();
    }

    /**
     * 모든 마커 가져오기
     */
    getMarkers() {
        return this.markers.map(m => ({
            id: m.id,
            worldX: m.worldX,
            worldY: m.worldY,
            photoData: m.photoData,
            memo: m.memo
        }));
    }

    /**
     * 마커 로드
     */
    loadMarkers(markersData) {
        this.markers = [];
        const markersContainer = document.getElementById('markers-container');
        markersContainer.innerHTML = '';
        
        markersData.forEach(data => {
            this.addMarker(data.worldX, data.worldY, data.photoData, data.memo);
        });
    }
}

