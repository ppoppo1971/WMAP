// 라이브러리 로드 확인
if (typeof DxfParser === 'undefined') {
    console.error('DxfParser 라이브러리가 로드되지 않았습니다!');
    console.error('CDN 연결을 확인하세요: https://unpkg.com/dxf-parser@1.2.1/dist/dxf-parser.min.js');
}

// JSZip 제거: Google Drive 자동 저장으로 대체

// DXF 도면 편집기 앱
class DxfPhotoEditor {
    constructor() {
        // 화면 요소
        this.fileListScreen = document.getElementById('file-list-screen');
        this.viewerScreen = document.getElementById('viewer-screen');
        this.viewerUI = document.getElementById('viewer-ui');
        
        console.log('📱 요소 확인:', {
            fileListScreen: !!this.fileListScreen,
            viewerScreen: !!this.viewerScreen,
            viewerUI: !!this.viewerUI
        });
        
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.svg = document.getElementById('svg');
        this.container = document.getElementById('canvas-container');
        this.photoMemoInput = document.getElementById('photo-memo-input');
        
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
        
        // 터치/드래그 상태
        this.touchState = {
            isDragging: false,
            isPinching: false,
            wasDragging: false,  // 터치 종료 후 클릭 이벤트 방지용
            startX: 0,
            startY: 0,
            lastTouch: null,  // { x, y } 객체로 관리
            anchorView: null, // 드래그 시작 시 고정할 도면 좌표
            startViewBox: null,
            lastPinchDistance: 0
        };
        
        this.selectedPhotoId = null;
        this.currentPhotoGroupIndex = 0; // 같은 좌표의 여러 사진 중 현재 인덱스
        
        // 롱프레스 관련
        this.longPressTimer = null;
        this.longPressDuration = 350; // 0.35초 (약간 빠르게)
        this.longPressPosition = { x: 0, y: 0 };
        this.isLongPress = false;
        this.longPressTriggered = false;

        const locationHint = (window.location?.search || '') + (window.location?.hash || '');
        this.debugMode = /debug/i.test(locationHint);
        this.driveStateInitialized = false;
        this.hasPromptedLocalDriveLogin = false;
        this.localDriveRequestInProgress = false;
        this.pendingLocalDriveSync = false;
        this.localSourceFile = null;
        
        // 더블탭 관련
        this.lastTapTime = 0;
        this.lastTapPosition = { x: 0, y: 0 };
        this.doubleTapDelay = 300; // 300ms 이내 두 번 탭
        this.doubleTapDistance = 50; // 50px 이내 같은 위치
        this.tapMoveThreshold = 15; // 탭으로 인정할 최대 이동 거리 (px)
        this.lastTouchTime = 0;
        this.singleTapTimeout = null;
        this.pendingTapAction = null;
        
        // 텍스트 관련
        this.texts = []; // { id, x, y, text, fontSize }
        this.metadataDirty = false;
        
        // 렌더링 최적화
        this.redrawPending = false;
        this.updatePending = false;
        
        // getBoundingClientRect() 캐싱 (성능 최적화)
        this.cachedRect = null;
        this.rectCacheTime = 0;
        this.rectCacheDuration = 100; // 100ms 동안 캐시 유지
        
        // 드래그 감도 설정 (1.0 = 손가락 이동과 동일)
        this.panSensitivity = 1.0;
        
        this.init();
    }

    debugLog(...args) {
        if (!this.debugMode) {
            return;
        }
        console.log(...args);
    }
    
    getEntityColor(entity) {
        if (!this.colorDebugCount) this.colorDebugCount = 0;
        
        let color = null;
        let source = 'default';
        
        // 1. ByLayer 확인 (colorIndex === 256 또는 colorIndex가 없는 경우)
        if (entity.colorIndex === 256 || entity.colorIndex === undefined) {
            // 레이어 색상 찾기
            if (entity.layer && this.dxfData.tables) {
                const layersObj = this.dxfData.tables.layers || this.dxfData.tables.layer;
                
                if (layersObj) {
                    let layer = null;
                    
                    // A. 직접 객체 접근 (예: layers["L_가드펜스"])
                    if (!Array.isArray(layersObj) && typeof layersObj === 'object') {
                        layer = layersObj[entity.layer];
                        if (layer) source = 'layers[name]';
                    }
                    
                    // B. layers.layers 객체 (예: layers.layers["L_가드펜스"]) ⭐ 수정
                    if (!layer && layersObj.layers) {
                        if (Array.isArray(layersObj.layers)) {
                            // 배열인 경우
                            layer = layersObj.layers.find(l => l.name === entity.layer);
                            if (layer) source = 'layers.layers[]';
                        } else if (typeof layersObj.layers === 'object') {
                            // 객체인 경우 ⭐ 새로 추가
                            layer = layersObj.layers[entity.layer];
                            if (layer) source = 'layers.layers[name]';
                        }
                    }
                    
                    // C. 직접 배열 (예: layers[0].name)
                    if (!layer && Array.isArray(layersObj)) {
                        layer = layersObj.find(l => l.name === entity.layer);
                        if (layer) source = 'layers[]';
                    }
                    
                    // 레이어에서 색상 추출
                    if (layer) {
                        // colorIndex 우선
                        if (layer.colorIndex !== undefined && layer.colorIndex !== null) {
                            color = this.autocadColorIndexToHex(layer.colorIndex);
                            source += `.colorIndex(${layer.colorIndex})`;
                        }
                        // color 대체
                        else if (layer.color !== undefined && layer.color !== null) {
                            if (typeof layer.color === 'string') {
                                color = layer.color;
                            } else if (typeof layer.color === 'number') {
                                color = '#' + layer.color.toString(16).padStart(6, '0').toUpperCase();
                            }
                            source += '.color';
                        }
                    }
                }
            }
        }
        // 2. 엔티티 자체의 colorIndex 확인 (ByLayer가 아닌 경우)
        else if (entity.colorIndex !== undefined && entity.colorIndex >= 0 && entity.colorIndex < 256) {
            color = this.autocadColorIndexToHex(entity.colorIndex);
            source = `entity.colorIndex(${entity.colorIndex})`;
        }
        
        // 3. entity.color 확인 (dxf-parser가 이미 변환한 경우)
        if (!color && entity.color !== undefined && entity.color !== null) {
            if (typeof entity.color === 'string') {
                color = entity.color;
                source = 'entity.color(string)';
            } else if (typeof entity.color === 'number') {
                color = '#' + entity.color.toString(16).padStart(6, '0').toUpperCase();
                source = 'entity.color(number)';
            }
        }
        
        // 4. 기본값: 검은색
        if (!color) {
            color = '#000000';
            source = 'default';
        }
        
        // 5. 흰색이면 검은색으로 변경 (배경과 구분)
        if (color.toUpperCase() === '#FFFFFF' || color.toUpperCase() === '#FFF') {
            console.log(`⚪ 흰색→검은색: ${entity.type} layer="${entity.layer}"`);
            color = '#000000';
            source += ' → white→black';
        }
        
        // 디버깅 (처음 20개)
        if (this.debugMode && this.colorDebugCount < 20) {
            this.debugLog(`🎨 [${this.colorDebugCount}] ${entity.type} → ${color} (출처: ${source})`);
            this.debugLog(`   colorIndex=${entity.colorIndex}, layer="${entity.layer}"`);
            this.colorDebugCount++;
        }
        
        return color;
    }
    
    autocadColorIndexToHex(colorIndex) {
        // AutoCAD 표준 색상 팔레트 (256색)
        // dxf-parser 라이브러리의 색상 팔레트와 동일
        const autocadColors = [
            0x000000, 0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0xFF00FF, 0xFFFFFF,
            0x414141, 0x808080, 0xFF0000, 0xFFAAAA, 0xBD0000, 0xBD7E7E, 0x810000, 0x815656,
            0x680000, 0x684545, 0x4F0000, 0x4F3535, 0xFF3F00, 0xFFBFAA, 0xBD2E00, 0xBD8D7E,
            0x811F00, 0x816056, 0x681900, 0x684E45, 0x4F1300, 0x4F3B35, 0xFF7F00, 0xFFD4AA,
            0xBD5E00, 0xBD9D7E, 0x814000, 0x816B56, 0x683400, 0x685645, 0x4F2700, 0x4F4235,
            0xFFBF00, 0xFFEAAA, 0xBD8D00, 0xBDAD7E, 0x816000, 0x817656, 0x684E00, 0x685F45,
            0x4F3B00, 0x4F4935, 0xFFFF00, 0xFFFFAA, 0xBDBD00, 0xBDBD7E, 0x818100, 0x818156,
            0x686800, 0x686845, 0x4F4F00, 0x4F4F35, 0xBFFF00, 0xEAFFAA, 0x8DBD00, 0xADBD7E,
            0x608100, 0x768156, 0x4E6800, 0x5F6845, 0x3B4F00, 0x494F35, 0x7FFF00, 0xD4FFAA,
            0x5EBD00, 0x9DBD7E, 0x408100, 0x6B8156, 0x346800, 0x566845, 0x274F00, 0x424F35,
            0x3FFF00, 0xBFFFAA, 0x2EBD00, 0x8DBD7E, 0x1F8100, 0x608156, 0x196800, 0x4E6845,
            0x134F00, 0x3B4F35, 0x00FF00, 0xAAFFAA, 0x00BD00, 0x7EBD7E, 0x008100, 0x568156,
            0x006800, 0x456845, 0x004F00, 0x354F35, 0x00FF3F, 0xAAFFBF, 0x00BD2E, 0x7EBD8D,
            0x00811F, 0x568160, 0x006819, 0x45684E, 0x004F13, 0x354F3B, 0x00FF7F, 0xAAFFD4,
            0x00BD5E, 0x7EBD9D, 0x008140, 0x56816B, 0x006834, 0x456856, 0x004F27, 0x354F42,
            0x00FFBF, 0xAAFFEA, 0x00BD8D, 0x7EBDAD, 0x008160, 0x568176, 0x00684E, 0x45685F,
            0x004F3B, 0x354F49, 0x00FFFF, 0xAAFFFF, 0x00BDBD, 0x7EBDBD, 0x008181, 0x568181,
            0x006868, 0x456868, 0x004F4F, 0x354F4F, 0x00BFFF, 0xAAEAFF, 0x008DBD, 0x7EADBD,
            0x006081, 0x567681, 0x004E68, 0x455F68, 0x003B4F, 0x35494F, 0x007FFF, 0xAAD4FF,
            0x005EBD, 0x7E9DBD, 0x004081, 0x566B81, 0x003468, 0x455668, 0x00274F, 0x35424F,
            0x003FFF, 0xAABFFF, 0x002EBD, 0x7E8DBD, 0x001F81, 0x566081, 0x001968, 0x454E68,
            0x00134F, 0x353B4F, 0x0000FF, 0xAAAAFF, 0x0000BD, 0x7E7EBD, 0x000081, 0x565681,
            0x000068, 0x454568, 0x00004F, 0x35354F, 0x3F00FF, 0xBFAAFF, 0x2E00BD, 0x8D7EBD,
            0x1F0081, 0x605681, 0x190068, 0x4E4568, 0x13004F, 0x3B354F, 0x7F00FF, 0xD4AAFF,
            0x5E00BD, 0x9D7EBD, 0x400081, 0x6B5681, 0x340068, 0x564568, 0x27004F, 0x42354F,
            0xBF00FF, 0xEAAAFF, 0x8D00BD, 0xAD7EBD, 0x600081, 0x765681, 0x4E0068, 0x5F4568,
            0x3B004F, 0x49354F, 0xFF00FF, 0xFFAAFF, 0xBD00BD, 0xBD7EBD, 0x810081, 0x815681,
            0x680068, 0x684568, 0x4F004F, 0x4F354F, 0xFF00BF, 0xFFAAEA, 0xBD008D, 0xBD7EAD,
            0x810060, 0x815676, 0x68004E, 0x68455F, 0x4F003B, 0x4F3549, 0xFF007F, 0xFFAAD4,
            0xBD005E, 0xBD7E9D, 0x810040, 0x81566B, 0x680034, 0x684556, 0x4F0027, 0x4F3542,
            0xFF003F, 0xFFAABF, 0xBD002E, 0xBD7E8D, 0x81001F, 0x815660, 0x680019, 0x68454E,
            0x4F0013, 0x4F353B, 0x333333, 0x505050, 0x696969, 0x828282, 0xBEBEBE, 0xFFFFFF
        ];
        
        // 유효성 검사
        if (typeof colorIndex !== 'number' || colorIndex < 0 || colorIndex >= 256) {
            console.warn(`⚠️ 잘못된 colorIndex: ${colorIndex}, 기본값(검은색) 반환`);
            return '#000000';
        }
        
        // 배열 길이 확인 (디버깅용, 첫 실행 시에만)
        if (!this._colorArrayChecked) {
            console.log(`✅ AutoCAD 색상 팔레트 크기: ${autocadColors.length}개`);
            this._colorArrayChecked = true;
        }
        
        const rgb = autocadColors[colorIndex];
        const hex = '#' + rgb.toString(16).padStart(6, '0').toUpperCase();
        
        return hex;
    }
    
    hslToHex(h, s, l) {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }
    
    /**
     * getBoundingClientRect() 캐싱 (성능 최적화)
     * 레이아웃 재계산 강제를 최소화
     */
    getCachedRect() {
        const now = Date.now();
        
        // 캐시가 유효하면 재사용
        if (this.cachedRect && (now - this.rectCacheTime) < this.rectCacheDuration) {
            return this.cachedRect;
        }
        
        // 캐시 갱신
        this.cachedRect = this.svg.getBoundingClientRect();
        this.rectCacheTime = now;
        
        return this.cachedRect;
    }

    viewToCanvasCoords(x, y) {
        if (!this.svg) {
            return { x, y };
        }
        
        const rect = this.getCachedRect();
        
        try {
            if (this.svg.createSVGPoint && typeof this.svg.getScreenCTM === 'function') {
                const point = this.svg.createSVGPoint();
                point.x = x;
                point.y = y;
                
                const ctm = this.svg.getScreenCTM();
                if (ctm && typeof ctm === 'object') {
                    const screenPoint = point.matrixTransform(ctm);
                    if (rect) {
                        return {
                            x: screenPoint.x - rect.left,
                            y: screenPoint.y - rect.top
                        };
                    }
                    return { x: screenPoint.x, y: screenPoint.y };
                }
            }
        } catch (error) {
            console.warn('viewToCanvasCoords 변환 실패, 폴백 사용:', error);
        }

        if (!rect) {
            return { x: 0, y: 0 };
        }

        const normX = ((x - this.viewBox.x) / this.viewBox.width) * rect.width;
        const normY = ((y - this.viewBox.y) / this.viewBox.height) * rect.height;
        return { x: normX, y: normY };
    }

    getDxfBaseName() {
        const driveName = window.currentDriveFile?.name;
        const base = driveName || (this.dxfFileName ? `${this.dxfFileName}.dxf` : 'photo');
        return base.replace(/\.dxf$/i, '');
    }
    
    /**
     * 현재 제스처가 탭에 해당하는지 여부
     */
    isTapGesture(touch) {
        if (!touch) return false;
        
        if (typeof this.touchState.startX !== 'number' || typeof this.touchState.startY !== 'number') {
            return true;
        }
        
        const moveDistance = Math.sqrt(
            Math.pow(touch.clientX - this.touchState.startX, 2) +
            Math.pow(touch.clientY - this.touchState.startY, 2)
        );
        
        return moveDistance < this.tapMoveThreshold;
    }

    queueSingleTapAction(action) {
        if (typeof action !== 'function') return;
        this.clearPendingSingleTap();
        this.pendingTapAction = action;
        this.singleTapTimeout = setTimeout(() => {
            if (this.pendingTapAction) {
                try {
                    this.pendingTapAction();
                } catch (error) {
                    console.error('❌ 단일 탭 액션 실행 오류:', error);
                }
            }
            this.clearPendingSingleTap();
        }, this.doubleTapDelay);
    }

    clearPendingSingleTap() {
        if (this.singleTapTimeout) {
            clearTimeout(this.singleTapTimeout);
            this.singleTapTimeout = null;
        }
        this.pendingTapAction = null;
    }
    
    /**
     * 더블탭 감지 및 줌 처리
     */
    handleDoubleTap(clientX, clientY) {
        const now = Date.now();
        const timeDiff = now - this.lastTapTime;
        
        // 거리 계산
        const distance = Math.sqrt(
            Math.pow(clientX - this.lastTapPosition.x, 2) + 
            Math.pow(clientY - this.lastTapPosition.y, 2)
        );
        
        const isDoubleTap = timeDiff < this.doubleTapDelay && distance < this.doubleTapDistance;
        
        if (isDoubleTap) {
            console.log('🎯🎯 더블탭 감지! 줌 실행...');
            this.clearPendingSingleTap();
            
            // 탭한 위치를 ViewBox 좌표로 변환
            const rect = this.getCachedRect();
            const tapX = ((clientX - rect.left) / rect.width) * this.viewBox.width + this.viewBox.x;
            const tapY = ((clientY - rect.top) / rect.height) * this.viewBox.height + this.viewBox.y;
            
            this.zoomToPoint(tapX, tapY, 2.0);
            
            // 더블탭 정보 초기화 (연속 더블탭 방지)
            this.lastTapTime = 0;
            this.lastTapPosition = { x: 0, y: 0 };
            
            return true;
        }
        
        // 첫 번째 탭 기록
        this.lastTapTime = now;
        this.lastTapPosition = { x: clientX, y: clientY };
        return false;
    }
    
    /**
     * 특정 점으로 줌 (애니메이션)
     * @param {number} targetX - ViewBox 좌표 X
     * @param {number} targetY - ViewBox 좌표 Y
     * @param {number} zoomFactor - 확대 배율 (2.0 = 2배 확대)
     */
    zoomToPoint(targetX, targetY, zoomFactor) {
        this.debugLog(`🔍 zoomToPoint 시작:`);
        this.debugLog(`   타겟: (${targetX.toFixed(1)}, ${targetY.toFixed(1)})`);
        this.debugLog(`   현재 ViewBox: x=${this.viewBox.x.toFixed(1)}, y=${this.viewBox.y.toFixed(1)}, w=${this.viewBox.width.toFixed(1)}, h=${this.viewBox.height.toFixed(1)}`);
        
        // 새로운 ViewBox 크기
        const newWidth = this.viewBox.width / zoomFactor;
        const newHeight = this.viewBox.height / zoomFactor;
        
        this.debugLog(`   새 크기: w=${newWidth.toFixed(1)}, h=${newHeight.toFixed(1)} (${zoomFactor}배)`);
        
        // 최소/최대 크기 제한
        const minSize = (this.originalViewBox?.width || 1000) * 0.01;
        const maxSize = (this.originalViewBox?.width || 1000) * 10;
        
        if (newWidth < minSize || newWidth > maxSize) {
            console.log('⚠️ 줌 제한 초과');
            return;
        }
        
        // 타겟 포인트가 화면 중심에 오도록 ViewBox 조정
        const newX = targetX - newWidth / 2;
        const newY = targetY - newHeight / 2;
        
        this.debugLog(`   새 ViewBox: x=${newX.toFixed(1)}, y=${newY.toFixed(1)}`);
        this.debugLog(`   → 화면 중심 = (${(newX + newWidth / 2).toFixed(1)}, ${(newY + newHeight / 2).toFixed(1)})`);
        
        this.viewBox = {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight
        };
        
        // ViewBox 업데이트
        this.updateViewBox();
        
        this.debugLog(`✅ 줌 완료!`);
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.drawWelcomeScreen();
    }
    
    setupCanvas() {
        const updateCanvasSize = () => {
            const rect = this.container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
                
                // dxfData가 있을 때만 redraw
                if (this.dxfData) {
                    this.redraw();
                }
            }
        };
        
        // 초기 크기 설정 시도
        updateCanvasSize();
        
        // 윈도우 크기 변경 시 재계산
        window.addEventListener('resize', () => {
            this.cachedRect = null;
            updateCanvasSize();
        });
    }
    
    setupEventListeners() {
        // Google Drive 로그인 버튼
        document.getElementById('login-btn').addEventListener('click', async () => {
            await this.handleLogin();
        });
        
        // 로컬 저장소 버튼 (로컬 파일 선택)
        document.getElementById('local-file-input').addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                this.showViewer();  // 먼저 화면 전환
                await this.loadDxfFile(e.target.files[0]);
                e.target.value = ''; // 초기화
            }
        });
        
        // 햄버거 메뉴 토글
        const hamburgerBtn = document.getElementById('hamburger-btn');
        
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSlideMenu();
        });
        
        // 햄버거 버튼 터치 이벤트에서 롱프레스 방지
        hamburgerBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: false });
        hamburgerBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        
        // 메뉴 오버레이 클릭 시 메뉴 닫기
        document.getElementById('menu-overlay').addEventListener('click', () => {
            this.closeSlideMenu();
        });
        
        // 슬라이딩 메뉴 - 목록으로 돌아가기
        const menuBackBtn = document.getElementById('menu-back-to-list');
        const menuFitViewBtn = document.getElementById('menu-fit-view');
        const menuConsoleBtn = document.getElementById('menu-console');
        
        menuBackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeSlideMenu();
            this.showFileList();
        });
        
        menuFitViewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeSlideMenu();
            this.fitDxfToView();
            this.redraw();
        });
        
        menuConsoleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeSlideMenu();
            // vConsole 토글
            if (window.vConsole) {
                const vcPanel = document.querySelector('.vc-panel');
                if (vcPanel && vcPanel.classList.contains('vc-toggle')) {
                    // 이미 열려있으면 닫기
                    window.vConsole.hidePanel();
                } else {
                    // 닫혀있으면 열기
                    window.vConsole.showPanel();
                }
            }
        });
        
        // 메뉴 아이템들 터치 이벤트에서 롱프레스 방지
        [menuBackBtn, menuFitViewBtn, menuConsoleBtn].forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: false });
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        });
        
        // 사진 추가 버튼 제거 (롱프레스로만 추가)
        
        // 내보내기 버튼 제거됨 (Google Drive 자동 저장 사용)
        
        // SVG 드래그 (팬) - SVG에서 이벤트 받기
        this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // 터치 이벤트 (모바일) - SVG에서 (passive: false로 preventDefault 가능)
        this.svg.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.svg.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.svg.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
        
        // 사진 클릭은 SVG 클릭 이벤트에서 처리 (Canvas는 pointer-events: none 유지)
        this.svg.addEventListener('click', this.onCanvasClick.bind(this));
        
        // 줌 버튼 (좌측 하단 고정)
        const zoomInBtn = document.getElementById('zoom-in');
        const zoomOutBtn = document.getElementById('zoom-out');
        
        zoomInBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.zoom(1.2);
        });
        
        zoomOutBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.zoom(0.8);
        });
        
        // 줌 버튼 터치 이벤트에서 롱프레스 방지
        [zoomInBtn, zoomOutBtn].forEach(btn => {
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: false });
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
        });
        
        // 전체보기는 슬라이딩 메뉴에서 처리됨
        
        // 메모 모달
        const closeMemoBtn = document.getElementById('close-memo');
        if (closeMemoBtn) {
            closeMemoBtn.addEventListener('click', () => {
                this.closeMemoModal();
            });
        } else {
            console.warn('⚠️ close-memo 버튼을 찾을 수 없습니다');
        }
        
        const saveMemoBtn = document.getElementById('save-memo');
        if (saveMemoBtn) {
            saveMemoBtn.addEventListener('click', () => {
                this.saveMemo();
            });
        } else {
            console.warn('⚠️ save-memo 버튼을 찾을 수 없습니다');
        }
        
        const deletePhotoBtn = document.getElementById('delete-photo-btn');
        if (deletePhotoBtn) {
            deletePhotoBtn.addEventListener('click', () => {
                this.deletePhoto();
            });
        } else {
            console.warn('⚠️ delete-photo-btn 버튼을 찾을 수 없습니다');
        }
        
        // 재업로드 버튼
        const reuploadPhotoBtn = document.getElementById('reupload-photo-btn');
        if (reuploadPhotoBtn) {
            reuploadPhotoBtn.addEventListener('click', () => {
                this.reuploadPhoto();
            });
        } else {
            console.warn('⚠️ reupload-photo-btn 버튼을 찾을 수 없습니다');
        }
        
        // 같은 위치에 사진 추가 버튼
        const addPhotoSameLocationBtn = document.getElementById('add-photo-same-location-btn');
        if (addPhotoSameLocationBtn) {
            addPhotoSameLocationBtn.addEventListener('click', () => {
                this.addPhotoAtSameLocation();
            });
        } else {
            console.warn('⚠️ add-photo-same-location-btn 버튼을 찾을 수 없습니다');
        }
        
        // 사진 네비게이션 버튼
        const photoPrevBtn = document.getElementById('photo-prev-btn');
        const photoNextBtn = document.getElementById('photo-next-btn');
        if (photoPrevBtn) {
            photoPrevBtn.addEventListener('click', () => {
                this.navigatePhotoGroup(-1);
            });
        }
        if (photoNextBtn) {
            photoNextBtn.addEventListener('click', () => {
                this.navigatePhotoGroup(1);
            });
        }
        
        // 롱프레스 이벤트 (SVG에 추가)
        this.setupLongPressEvents();
        
        // ⭐ 컨텍스트 메뉴 버튼 이벤트는 showContextMenu에서 등록됨
        // (메뉴가 표시될 때마다 이벤트 리스너를 새로 등록)
        
        // 카메라/갤러리 파일 입력
        document.getElementById('camera-input').addEventListener('change', async (e) => {
            try {
                const file = e.target.files[0];
                console.log('📸 카메라 입력 변경 감지!');
                console.log('   파일:', file);
                console.log('   파일명:', file?.name);
                console.log('   파일 크기:', file?.size, 'bytes');
                console.log('   파일 타입:', file?.type);
                console.log('   롱프레스 위치:', this.longPressPosition);
                
                if (!file) {
                    console.warn('⚠️ 선택된 파일이 없습니다');
                    this.showToast('⚠️ 파일이 선택되지 않았습니다');
                    return;
                }
                
                if (!file.type.startsWith('image/')) {
                    console.error('❌ 이미지 파일이 아닙니다:', file.type);
                    this.showToast('⚠️ 이미지 파일만 선택할 수 있습니다');
                    return;
                }
                
                const position = {
                    x: this.longPressPosition.x,
                    y: this.longPressPosition.y
                };

                this.showToast('📸 사진 처리 중...');
                await this.addPhotoAt(file, position);
                
            } catch (error) {
                console.error('❌ 카메라 입력 처리 오류:', error);
                this.showToast(`⚠️ 사진 추가 실패: ${error.message}`);
            } finally {
                e.target.value = ''; // 초기화
            }
        });
        
        document.getElementById('gallery-input').addEventListener('change', async (e) => {
            try {
                const file = e.target.files[0];
                console.log('🖼️ 갤러리 입력 변경 감지!');
                console.log('   파일:', file);
                console.log('   파일명:', file?.name);
                console.log('   파일 크기:', file?.size, 'bytes');
                console.log('   파일 타입:', file?.type);
                console.log('   롱프레스 위치:', this.longPressPosition);
                
                if (!file) {
                    console.warn('⚠️ 선택된 파일이 없습니다');
                    this.showToast('⚠️ 파일이 선택되지 않았습니다');
                    return;
                }
                
                if (!file.type.startsWith('image/')) {
                    console.error('❌ 이미지 파일이 아닙니다:', file.type);
                    this.showToast('⚠️ 이미지 파일만 선택할 수 있습니다');
                    return;
                }
                
                const position = {
                    x: this.longPressPosition.x,
                    y: this.longPressPosition.y
                };

                this.showToast('🖼️ 사진 처리 중...');
                await this.addPhotoAt(file, position);
                
            } catch (error) {
                console.error('❌ 갤러리 입력 처리 오류:', error);
                this.showToast(`⚠️ 사진 추가 실패: ${error.message}`);
            } finally {
                e.target.value = ''; // 초기화
            }
        });
        
        // 텍스트 입력 모달
        const textCancelBtn = document.getElementById('text-cancel-btn');
        const textSaveBtn = document.getElementById('text-save-btn');
        
        if (textCancelBtn) {
            textCancelBtn.addEventListener('click', () => {
                console.log('❌ 텍스트 입력 취소');
                this.hideTextInputModal();
            });
        }
        
        if (textSaveBtn) {
            textSaveBtn.addEventListener('click', () => {
                console.log('💾 텍스트 저장 시도');
                this.saveTextInput();
            });
        }
        
        // 컨텍스트 메뉴 외부 클릭/터치 시 닫기
        const handleOutsideClick = (e) => {
            const contextMenu = document.getElementById('context-menu');
            
            if (!contextMenu || !contextMenu.classList.contains('active')) {
                return;
            }
            
            // 컨텍스트 메뉴 외부를 클릭한 경우에만 닫기
            if (!contextMenu.contains(e.target)) {
                console.log('👆 메뉴 외부 클릭 - 메뉴 닫기');
                this.hideContextMenu();
            }
        };
        
        // SVG 영역 클릭 시 메뉴 닫기
        this.svg.addEventListener('touchstart', handleOutsideClick);
        this.svg.addEventListener('click', handleOutsideClick);
        
        // 사진 보기 모달 이벤트
        const closePhotoViewBtn = document.getElementById('close-photo-view');
        if (closePhotoViewBtn) {
            closePhotoViewBtn.addEventListener('click', () => {
                this.closePhotoViewModal();
            });
        } else {
            console.warn('⚠️ close-photo-view 버튼을 찾을 수 없습니다');
        }
        
        const deletePhotoViewBtn = document.getElementById('delete-photo-btn');
        if (deletePhotoViewBtn) {
            deletePhotoViewBtn.addEventListener('click', () => {
                this.deletePhoto();
            });
        } else {
            console.warn('⚠️ delete-photo-btn 버튼을 찾을 수 없습니다 (사진 보기 모달)');
        }
        
        // 재저장 버튼 이벤트
        const reuploadPhotoBtn = document.getElementById('reupload-photo-btn');
        if (reuploadPhotoBtn) {
            reuploadPhotoBtn.addEventListener('click', () => {
                this.reuploadPhoto();
            });
        } else {
            console.warn('⚠️ reupload-photo-btn 버튼을 찾을 수 없습니다');
        }

        this.setupPhotoMemoInlineEditing();

        window.addEventListener('drive-auth-changed', (event) => {
            const authenticated = !!event.detail?.authenticated;
            this.setLoginButtonState(authenticated);
            if (!this.driveStateInitialized) {
                this.driveStateInitialized = true;
                return;
            }
            if (!authenticated) {
                this.pendingLocalDriveSync = true;
                this.showToast('Google Drive 로그인이 만료되었습니다. 상단 버튼으로 다시 로그인하세요.');
            } else if (this.pendingLocalDriveSync) {
                this.pendingLocalDriveSync = false;
                this.showToast('Google Drive와 다시 연결되었습니다.');
            }
        });

    }
    
    /**
     * 롱프레스 이벤트 설정
     * 
     * ⚠️ 주의: 터치 이벤트는 setupEventListeners()의 onTouchStart/Move/End에서 통합 처리됨
     * 이 함수는 마우스 이벤트(데스크탑 테스트)만 처리
     */
    setupLongPressEvents() {
        // 마우스 이벤트 (데스크탑 테스트용)
        this.svg.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // 좌클릭만
                this.startLongPress(e.clientX, e.clientY);
            }
        });
        
        this.svg.addEventListener('mousemove', () => {
            if (this.longPressTimer && !this.isDragging) {
                this.cancelLongPress();
            }
        });
        
        this.svg.addEventListener('mouseup', () => {
            this.cancelLongPress();
        });
    }
    
    /**
     * 롱프레스 시작
     */
    startLongPress(clientX, clientY) {
        // 기존 타이머 취소
        this.cancelLongPress();
        this.longPressTriggered = false;
        this.isLongPress = false;
        
        // 스크린 좌표 저장
        this.longPressPosition.screenX = clientX;
        this.longPressPosition.screenY = clientY;
        
        // ViewBox 좌표로 변환 (screenToViewBox 사용으로 정확도 향상)
        const viewCoords = this.screenToViewBox(clientX, clientY);
        
        this.longPressPosition.x = viewCoords.x;
        this.longPressPosition.y = viewCoords.y;
        
        // 타이머 시작
        this.longPressTimer = setTimeout(() => {
            this.onLongPress();
        }, this.longPressDuration);
    }
    
    /**
     * 롱프레스 취소
     */
    cancelLongPress() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.longPressTriggered = false;
        this.isLongPress = false;
    }
    
    /**
     * 롱프레스 완료 시 실행
     */
    onLongPress() {
        console.log('🔔 롱프레스 감지!', this.longPressPosition);
        
        this.isLongPress = true;
        this.longPressTriggered = true;
        this.longPressTimer = null;
        
        // 햅틱 피드백 (지원하는 경우)
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // 컨텍스트 메뉴 표시
        this.showContextMenu(this.longPressPosition.screenX, this.longPressPosition.screenY);
    }
    
    /**
     * 컨텍스트 메뉴 표시
     */
    showContextMenu(screenX, screenY) {
        console.log('📋 컨텍스트 메뉴 표시 시작...');
        const contextMenu = document.getElementById('context-menu');
        
        if (!contextMenu) {
            console.error('❌ 컨텍스트 메뉴 요소를 찾을 수 없음!');
            return;
        }
        
        // 위치 설정 (화면을 벗어나지 않도록)
        const menuWidth = 200;
        const menuHeight = 180;
        
        let left = screenX;
        let top = screenY;
        
        // 오른쪽 벗어남 방지
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 10;
        }
        
        // 아래쪽 벗어남 방지
        if (top + menuHeight > window.innerHeight) {
            top = window.innerHeight - menuHeight - 10;
        }
        
        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
        contextMenu.classList.add('active');
        
        console.log(`✅ 컨텍스트 메뉴 표시됨 (위치: ${left}, ${top})`);
        
        // ⭐ 메뉴 표시 직후 이벤트 리스너 등록
        this.setupContextMenuListeners();
    }
    
    /**
     * 컨텍스트 메뉴 버튼 이벤트 리스너 등록 (메뉴 표시될 때마다 호출)
     */
    setupContextMenuListeners() {
        console.log('🎯 컨텍스트 메뉴 이벤트 리스너 등록 시작...');
        
        const cameraBtn = document.getElementById('camera-btn');
        const galleryBtn = document.getElementById('gallery-btn');
        const textBtn = document.getElementById('text-btn');
        
        if (!cameraBtn || !galleryBtn || !textBtn) {
            console.error('❌ 컨텍스트 메뉴 버튼을 찾을 수 없습니다!');
            return;
        }
        
        console.log('✅ 모든 버튼 요소 발견됨');
        
        // 기존 리스너 제거를 위해 클론 사용 (간단한 방법)
        const newCameraBtn = cameraBtn.cloneNode(true);
        const newGalleryBtn = galleryBtn.cloneNode(true);
        const newTextBtn = textBtn.cloneNode(true);
        
        cameraBtn.parentNode.replaceChild(newCameraBtn, cameraBtn);
        galleryBtn.parentNode.replaceChild(newGalleryBtn, galleryBtn);
        textBtn.parentNode.replaceChild(newTextBtn, textBtn);
        
        // 카메라 버튼
        const handleCamera = (e) => {
            console.log('📷 카메라 버튼 클릭!');
            e.preventDefault();
            e.stopPropagation();
            
            // 롱프레스 위치 확인
            console.log('   롱프레스 위치:', this.longPressPosition);
            
            // 메뉴 닫기
            this.hideContextMenu();
            
            // ⭐ iOS Safari에서는 사용자 제스처에서 직접 호출해야 함
            const cameraInput = document.getElementById('camera-input');
            console.log('📸 카메라 입력 요소:', cameraInput);
            
            if (cameraInput) {
                console.log('📸 카메라 입력 클릭 시도...');
                // 즉시 클릭 (setTimeout 없이)
                cameraInput.click();
                console.log('✅ 카메라 입력 클릭 완료');
            } else {
                console.error('❌ 카메라 입력 요소를 찾을 수 없음!');
            }
        };
        
        newCameraBtn.addEventListener('touchend', handleCamera, { passive: false });
        newCameraBtn.addEventListener('click', handleCamera);
        
        // 갤러리 버튼
        const handleGallery = (e) => {
            console.log('🖼️ 갤러리 버튼 클릭!');
            e.preventDefault();
            e.stopPropagation();
            
            // 롱프레스 위치 확인
            console.log('   롱프레스 위치:', this.longPressPosition);
            
            // 메뉴 닫기
            this.hideContextMenu();
            
            // ⭐ iOS Safari에서는 사용자 제스처에서 직접 호출해야 함
            const galleryInput = document.getElementById('gallery-input');
            console.log('🖼️ 갤러리 입력 요소:', galleryInput);
            
            if (galleryInput) {
                console.log('🖼️ 갤러리 입력 클릭 시도...');
                // 즉시 클릭 (setTimeout 없이)
                galleryInput.click();
                console.log('✅ 갤러리 입력 클릭 완료');
            } else {
                console.error('❌ 갤러리 입력 요소를 찾을 수 없음!');
            }
        };
        
        newGalleryBtn.addEventListener('touchend', handleGallery, { passive: false });
        newGalleryBtn.addEventListener('click', handleGallery);
        
        // 텍스트 버튼
        const handleText = (e) => {
            console.log('📝 텍스트 버튼 클릭!');
            e.preventDefault();
            e.stopPropagation();
            
            // 롱프레스 위치 확인
            console.log('   롱프레스 위치:', this.longPressPosition);
            
            // 메뉴 닫기
            this.hideContextMenu();
            
            // 즉시 텍스트 모달 표시
            console.log('📝 텍스트 모달 표시 시도...');
            this.showTextInputModal();
        };
        
        newTextBtn.addEventListener('touchend', handleText, { passive: false });
        newTextBtn.addEventListener('click', handleText);
        
        console.log('✅ 모든 이벤트 리스너 등록 완료');
    }
    
    /**
     * 컨텍스트 메뉴 숨김
     */
    hideContextMenu() {
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu) {
            contextMenu.classList.remove('active');
        }
        
    }
    
    /**
     * 텍스트 입력 모달 표시
     */
    showTextInputModal() {
        console.log('📝 텍스트 입력 모달 표시 시도...');
        const modal = document.getElementById('text-input-modal');
        const textField = document.getElementById('text-input-field');
        
        if (!modal) {
            console.error('❌ 텍스트 모달 요소를 찾을 수 없음!');
            return;
        }
        
        if (!textField) {
            console.error('❌ 텍스트 입력 필드를 찾을 수 없음!');
            return;
        }
        
        textField.value = '';
        modal.classList.add('active');
        console.log('✅ 텍스트 입력 모달 표시됨');
        
        // 포커스
        setTimeout(() => {
            textField.focus();
            console.log('⌨️ 텍스트 필드 포커스 설정');
        }, 100);
    }
    
    /**
     * 텍스트 입력 모달 숨김
     */
    hideTextInputModal() {
        const modal = document.getElementById('text-input-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    /**
     * 텍스트 저장
     */
    saveTextInput() {
        const textField = document.getElementById('text-input-field');
        const text = textField.value.trim();
        
        if (!text) {
            alert('텍스트를 입력하세요.');
            return;
        }
        
        // 텍스트 객체 생성
        const textObj = {
            id: Date.now(),
            x: this.longPressPosition.x,
            y: this.longPressPosition.y,
            text: text,
            fontSize: this.viewBox.width * 0.02 // ViewBox 크기의 2%
        };
        
        this.texts.push(textObj);
        this.metadataDirty = true;
        
        console.log('📝 텍스트 추가:', textObj);
        
        this.hideTextInputModal();
        this.redraw();
        
        // Google Drive 자동 저장
        this.autoSave();
    }
    
    /**
     * 화면 전환: 파일 목록 표시
     */
    showFileList() {
        this.fileListScreen.classList.remove('hidden');
        this.viewerScreen.classList.add('hidden');
        this.viewerUI.classList.add('hidden'); // UI 버튼들 숨김
        this.closeSlideMenu(); // 메뉴 닫기
    }
    
    /**
     * 화면 전환: 뷰어 표시
     */
    showViewer() {
        console.log('🖼️ 뷰어 화면으로 전환');
        
        this.fileListScreen.classList.add('hidden');
        this.viewerScreen.classList.remove('hidden');
        
        if (this.viewerUI) {
            this.viewerUI.classList.remove('hidden'); // UI 버튼들 표시
            console.log('✅ 뷰어 UI 표시');
        } else {
            console.error('❌ viewerUI 요소를 찾을 수 없음!');
        }
    }
    
    /**
     * 슬라이딩 메뉴 토글
     */
    toggleSlideMenu() {
        const slideMenu = document.getElementById('slide-menu');
        const overlay = document.getElementById('menu-overlay');
        
        if (!slideMenu || !overlay) {
            console.warn('⚠️ 슬라이딩 메뉴 요소를 찾을 수 없습니다');
            return;
        }
        
        const isActive = slideMenu.classList.contains('active');
        
        if (isActive) {
            this.closeSlideMenu();
        } else {
            this.openSlideMenu();
        }
    }
    
    /**
     * 슬라이딩 메뉴 열기
     */
    openSlideMenu() {
        const slideMenu = document.getElementById('slide-menu');
        const overlay = document.getElementById('menu-overlay');
        
        if (slideMenu && overlay) {
            slideMenu.classList.add('active');
            overlay.classList.add('active');
        }
    }
    
    /**
     * 슬라이딩 메뉴 닫기
     */
    closeSlideMenu() {
        const slideMenu = document.getElementById('slide-menu');
        const overlay = document.getElementById('menu-overlay');
        
        if (slideMenu && overlay) {
            slideMenu.classList.remove('active');
            overlay.classList.remove('active');
        }
    }
    
    /**
     * 캐시 삭제 및 현재 도면 새로고침
     */
    async clearCacheAndReload() {
        try {
            console.log('🗑️ 캐시 삭제 시작...');
            this.showLoading(true);
            
            // Service Worker 캐시 삭제
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                console.log(`📦 발견된 캐시: ${cacheNames.length}개`);
                
                for (const cacheName of cacheNames) {
                    await caches.delete(cacheName);
                    console.log(`✅ 캐시 삭제됨: ${cacheName}`);
                }
            }
            
            // 현재 도면 정보 저장
            const currentDxfData = this.dxfData;
            const currentPhotos = [...this.photos];
            const currentViewBox = {...this.viewBox};
            const currentFileName = this.currentFileName;
            const currentFileId = this.currentFileId;
            
            console.log('💾 현재 도면 상태 저장 완료');
            console.log(`  - 파일명: ${currentFileName}`);
            console.log(`  - 사진 개수: ${currentPhotos.length}`);
            
            // 잠시 대기 (캐시 삭제 완료 확인)
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 현재 도면 다시 로드
            if (currentDxfData) {
                console.log('🔄 도면 새로고침 중...');
                
                // 도면 정보 복원
                this.dxfData = currentDxfData;
                this.photos = currentPhotos;
                this.viewBox = currentViewBox;
                this.currentFileName = currentFileName;
                this.currentFileId = currentFileId;
                
                // 화면 다시 그리기
                this.redraw();
                
                console.log('✅ 캐시 삭제 및 새로고침 완료');
                alert('캐시가 삭제되었습니다.');
            } else {
                console.log('⚠️ 현재 열린 도면이 없습니다.');
                alert('캐시가 삭제되었습니다.');
            }
            
            this.showLoading(false);
            
        } catch (error) {
            console.error('❌ 캐시 삭제 실패:', error);
            alert('캐시 삭제 중 오류가 발생했습니다.');
            this.showLoading(false);
        }
    }
    
    /**
     * Google Drive 로그인 처리
     */
    async handleLogin() {
        try {
            this.showLoading(true);
            
            if (!window.driveManager) {
                throw new Error('Google Drive Manager가 초기화되지 않았습니다.\n\n페이지를 새로고침해주세요.');
            }
            
            console.log('🔑 로그인 시도 중...');
            
            // 인증 요청
            const success = await window.authenticateGoogleDrive();
            
            if (!success) {
                throw new Error('인증에 실패했습니다');
            }
            
            console.log('✅ 로그인 성공');
            console.log('액세스 토큰:', window.driveManager.accessToken ? '있음' : '없음');
            
            // 토큰 설정을 위해 짧은 대기
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.showLoading(false);
            
            // 로그인 성공 후 파일 목록 로드
            await this.loadFileList();
            
        } catch (error) {
            this.showLoading(false);
            console.error('❌ 로그인 실패:', error);
            alert('로그인에 실패했습니다.\n\n' + error.message + '\n\n브라우저 팝업 차단을 해제하고 다시 시도해주세요.');
        }
    }
    
    /**
     * 파일 목록 로드 (모든 파일)
     */
    async loadFileList() {
        try {
            this.showLoading(true);
            
            console.log('📂 파일 목록 로드 시작...');
            console.log('driveManager 존재:', !!window.driveManager);
            console.log('accessToken 존재:', !!window.driveManager?.accessToken);
            
            if (!window.driveManager || !window.driveManager.listFiles) {
                throw new Error('Google Drive가 초기화되지 않았습니다.\n\n페이지를 새로고침해주세요.');
            }
            
            if (!window.driveManager.accessToken) {
                throw new Error('로그인이 필요합니다.\n\n먼저 로그인 버튼을 클릭해주세요.');
            }
            
            // 모든 파일 목록 가져오기 (DXF만이 아닌)
            const files = await window.driveManager.listFiles();
            
            console.log('✅ 파일 목록 로드 성공:', files.length + '개');
            
            this.showLoading(false);
            
            // UI 업데이트
            this.renderFileList(files);
            this.setLoginButtonState(true);
            
        } catch (error) {
            this.showLoading(false);
            console.error('❌ 파일 목록 로드 실패:', error);
            console.error('상세 오류:', error.message);
            
            alert('파일 목록을 불러오는데 실패했습니다.\n\n' + error.message + '\n\n다시 로그인해주세요.');
            
            this.setLoginButtonState(false);
        }
    }
    
    setLoginButtonState(isLoggedIn) {
        const btn = document.getElementById('login-btn');
        if (!btn) return;
        btn.textContent = isLoggedIn ? '✅ 로그인됨' : '🔐 Google Drive';
        btn.style.background = isLoggedIn ? '#34C759' : '#4285F4';
    }

    setupPhotoMemoInlineEditing() {
        if (!this.photoMemoInput) {
            console.warn('⚠️ photo-memo-input 요소를 찾을 수 없습니다');
            return;
        }

        this.photoMemoInput.addEventListener('input', () => {
            if (!this.selectedPhotoId) return;
            const photo = this.photos.find(p => p.id === this.selectedPhotoId);
            if (!photo) return;
            photo.memo = this.photoMemoInput.value;
            this.metadataDirty = true;
        });

        this.photoMemoInput.addEventListener('blur', () => {
            this.saveInlineMemo();
        });
    }

    saveInlineMemo() {
        if (!this.photoMemoInput || !this.selectedPhotoId) return;

        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) return;

        const newMemo = this.photoMemoInput.value || '';
        if (photo.memo !== newMemo) {
            photo.memo = newMemo;
            this.metadataDirty = true;
            this.redraw();
        }

        if (this.metadataDirty) {
            this.autoSave();
        }
    }

    /**
     * 파일 목록 UI 렌더링
     */
    renderFileList(files) {
        const fileListDiv = document.getElementById('file-list');
        
        if (!files || files.length === 0) {
            fileListDiv.innerHTML = '<p class="info-text">📭 파일이 없습니다.</p>';
            return;
        }
        
        fileListDiv.innerHTML = '';
        
        files.forEach(file => {
            const isDxf = file.name.toLowerCase().endsWith('.dxf');
            const isImage = /\.(jpg|jpeg|png|gif)$/i.test(file.name);
            const isMetadata = file.name.endsWith('_metadata.json');
            
            // 메타데이터 파일은 숨김
            if (isMetadata) return;
            
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            // 파일 타입별 아이콘
            let icon = '📄';
            if (isDxf) icon = '📐';
            else if (isImage) icon = '🖼️';
            
            fileItem.innerHTML = `
                <div class="file-item-name">${icon} ${file.name}</div>
                <div class="file-item-date">${new Date(file.modifiedTime).toLocaleString('ko-KR')}</div>
            `;
            
            fileItem.addEventListener('click', async () => {
                if (isDxf) {
                    // DXF 파일은 뷰어로 열기
                    await this.openDxfFromDrive(file);
                } else if (isImage) {
                    // 이미지 파일은 현재 탭에서 열기
                    this.showToast('🖼️ 이미지 로딩 중...');
                    try {
                        const blob = await window.driveManager.downloadFileAsBlob(file.id);
                        const blobUrl = URL.createObjectURL(blob);
                        
                        // 현재 탭에서 이미지 열기 (뒤로 가기로 복귀 가능)
                        window.location.href = blobUrl;
                    } catch (error) {
                        console.error('이미지 열기 실패:', error);
                        this.showToast('⚠️ 이미지 열기 실패');
                    }
                } else {
                    // 다른 파일은 현재 탭에서 열기
                    this.showToast('📄 파일 로딩 중...');
                    try {
                        const blob = await window.driveManager.downloadFileAsBlob(file.id);
                        const blobUrl = URL.createObjectURL(blob);
                        
                        // 현재 탭에서 파일 열기 (뒤로 가기로 복귀 가능)
                        window.location.href = blobUrl;
                    } catch (error) {
                        console.error('파일 열기 실패:', error);
                        this.showToast('⚠️ 파일 열기 실패');
                    }
                }
            });
            
            fileListDiv.appendChild(fileItem);
        });
    }
    
    /**
     * Google Drive에서 DXF 파일 열기
     */
    async openDxfFromDrive(file) {
        try {
            // 먼저 뷰어 화면으로 전환
            this.showViewer();
            
            this.showLoading(true);
            
            // 파일 다운로드
            const fileContent = await window.downloadDxfFile(file.id);
            
            // 현재 파일 정보 저장
            window.currentDriveFile = {
                id: file.id,
                name: file.name
            };
            
            console.log('📁 현재 드라이브 파일 설정됨:', window.currentDriveFile);
            
            // 사진/텍스트 데이터 초기화 (메타데이터 로드 전)
            this.photos = [];
            this.texts = [];
            this.metadataDirty = false;
            
            // DXF 파싱 및 렌더링
            this.loadDxfFromText(fileContent, file.name);
            
            // 메타데이터 로드 및 사진/텍스트 표시
            await this.loadMetadataAndDisplay(file.name);
            
            this.showLoading(false);
            
        } catch (error) {
            this.showLoading(false);
            console.error('파일 열기 실패:', error);
            alert('파일을 여는데 실패했습니다: ' + error.message);
            
            // 오류 시 다시 파일 목록으로
            this.showFileList();
        }
    }
    
    /**
     * 메타데이터 로드 및 사진/텍스트 표시
     */
    async loadMetadataAndDisplay(dxfFileName) {
        try {
            console.log('📋 메타데이터 로드 시작:', dxfFileName);
            
            if (!window.driveManager || !window.driveManager.loadMetadata) {
                console.warn('⚠️ Google Drive 메타데이터 기능 없음');
                return;
            }
            
            const metadata = await window.driveManager.loadMetadata(dxfFileName);
            
            if (!metadata || (!metadata.photos && !metadata.texts)) {
                console.log('   메타데이터 없음');
                return;
            }
            
            console.log('✅ 메타데이터 로드 완료:', {
                photosCount: metadata.photos?.length || 0,
                textsCount: metadata.texts?.length || 0
            });
            
            // 사진 로드
            if (metadata.photos && metadata.photos.length > 0) {
                console.log('📷 사진 메타데이터 복원:', metadata.photos.length + '개');
                
                metadata.photos.forEach(photoMeta => {
                    const basePhoto = {
                        id: photoMeta.id,
                        x: photoMeta.position?.x ?? 0,
                        y: photoMeta.position?.y ?? 0,
                        width: photoMeta.size?.width ?? 1,
                        height: photoMeta.size?.height ?? 1,
                        imageData: null,
                        image: null,
                        memo: photoMeta.memo || '',
                        fileName: photoMeta.fileName,
                        uploaded: true
                    };
                    
                    this.photos.push(basePhoto);
                });
                
                console.log('✅ 사진 좌표 복원 완료:', this.photos.length + '개');
            }
            
            // 텍스트 로드
            if (metadata.texts && metadata.texts.length > 0) {
                console.log('📝 텍스트 복원:', metadata.texts.length + '개');
                this.texts = metadata.texts;
            }
            
            // 화면 다시 그리기
            this.redraw();
            
            if (this.photos.length > 0 || this.texts.length > 0) {
                this.showToast(`✅ 데이터 로드 완료 (사진: ${this.photos.length}, 텍스트: ${this.texts.length})`);
            }
            
            this.metadataDirty = false;
            
        } catch (error) {
            console.error('❌ 메타데이터 로드 실패:', error);
            // 실패해도 계속 진행 (선택적 기능)
        }
    }
    
    showLoading(show) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.toggle('active', show);
        }
    }
    
    /**
     * Google Drive에서 가져온 텍스트로 DXF 로드
     * @param {string} text - DXF 파일 텍스트 내용
     * @param {string} fileName - 파일 이름
     */
    loadDxfFromText(text, fileName) {
        this.showLoading(true);
        
        try {
            this._parseDxf(text, fileName);
        } catch (error) {
            console.error('DXF 텍스트 로드 오류:', error);
            alert('DXF 파일 처리 실패: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadDxfFile(file) {
        if (!file) return;
        
        this.showLoading(true);
        
        try {
            // 로컬 파일 정보 기억
            window.currentDriveFile = {
                id: null,
                name: file.name,
                source: 'local'
            };
            this.localSourceFile = file;
            
            // 사진/텍스트 데이터 초기화
            this.photos = [];
            this.texts = [];
            this.metadataDirty = false;
            this.debugLog('   사진/텍스트 데이터 초기화');
            
            await this.ensureDriveContextForLocalFile(file);
            
            // 1. 파일 읽기
            const text = await file.text();
            
            this._parseDxf(text, file.name);
            
            if (window.driveManager?.isAccessTokenValid()) {
                await this.syncLocalDxfToDrive(file);
                await this.loadMetadataAndDisplay(file.name);
            } else {
                this.pendingLocalDriveSync = true;
                this.showToast('Google Drive 로그인 후 사진/메모가 동기화됩니다.');
            }
            
        } catch (error) {
            console.error('DXF 파일 로드 오류:', error);
            alert('DXF 파일을 여는데 실패했습니다.');
        } finally {
            this.showLoading(false);
        }
    }
    
    async ensureDriveContextForLocalFile(file) {
        if (!file) {
            return;
        }
        
        if (!window.driveManager) {
            await window.initGoogleDrive?.();
        }
        
        if (!window.currentDriveFile) {
            window.currentDriveFile = {
                id: null,
                name: file.name,
                source: 'local'
            };
        } else {
            window.currentDriveFile.name = file.name;
            window.currentDriveFile.source = 'local';
        }
        
        if (!window.driveManager) {
            return;
        }
        
        if (window.driveManager.isAccessTokenValid()) {
            this.setLoginButtonState(true);
            return;
        }
        
        if (this.localDriveRequestInProgress) {
            return;
        }
        
        this.localDriveRequestInProgress = true;
        try {
            if (!this.hasPromptedLocalDriveLogin) {
                this.showToast('Google Drive 로그인을 진행하면 로컬 도면도 자동 저장됩니다.');
                this.hasPromptedLocalDriveLogin = true;
            }
            const success = await window.authenticateGoogleDrive();
            if (!success) {
                this.pendingLocalDriveSync = true;
                this.showToast('로그인 후에만 사진/메모가 Drive에 저장됩니다.');
            } else {
                this.setLoginButtonState(true);
            }
        } catch (error) {
            console.warn('로컬 파일을 위한 Google Drive 로그인 실패:', error);
            this.pendingLocalDriveSync = true;
        } finally {
            this.localDriveRequestInProgress = false;
        }
    }
    
    async syncLocalDxfToDrive(file) {
        if (!file || !window.driveManager || !window.driveManager.isAccessTokenValid()) {
            return;
        }
        
        try {
            const existing = await window.driveManager.findFileByName(file.name);
            if (existing) {
                window.currentDriveFile.id = existing.id;
                return;
            }
            
            this.showToast('☁️ 로컬 도면을 Google Drive에 업로드합니다...');
            const uploadResult = await window.driveManager.uploadFile(
                file.name,
                file,
                file.type || 'application/dxf'
            );
            window.currentDriveFile.id = uploadResult.id;
            this.showToast('✅ 도면이 Google Drive에 저장되었습니다.');
        } catch (error) {
            console.warn('로컬 도면 업로드 실패:', error);
            this.showToast('⚠️ 도면 업로드에 실패했습니다. 네트워크를 확인하세요.');
        }
    }
    
    /**
     * DXF 텍스트 파싱 (공통 로직)
     * @param {string} text - DXF 텍스트
     * @param {string} fileName - 파일 이름
     */
    _parseDxf(text, fileName) {
        // 1. Canvas 크기 재설정 (화면 전환 후 크기가 달라질 수 있음)
        const rect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }
        
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
            
        // 레이어 정보 표시 (상세)
        if (this.dxfData.tables) {
            console.log('\nTables 키:', Object.keys(this.dxfData.tables));
            
            // ⭐ 새로 추가: 실제 구조 확인
            console.log('\n🔍 레이어 테이블 실제 구조:');
            const layersObj = this.dxfData.tables.layers || this.dxfData.tables.layer;
            console.log('layersObj 타입:', Array.isArray(layersObj) ? 'Array' : typeof layersObj);
            console.log('layersObj 전체:', layersObj);
            
            // ⭐ 각 가능한 구조 확인
            if (layersObj) {
                // 1. 객체인 경우
                if (!Array.isArray(layersObj) && typeof layersObj === 'object') {
                    console.log('✅ 객체 형태의 레이어 테이블');
                    Object.keys(layersObj).slice(0, 5).forEach(name => {
                        const layer = layersObj[name];
                        console.log(`  "${name}":`, layer);
                    });
                }
                
                // 2. layers 속성이 있는 경우
                if (layersObj.layers) {
                    console.log('✅ layers 속성 발견');
                    console.log('layersObj.layers 타입:', Array.isArray(layersObj.layers) ? 'Array' : typeof layersObj.layers);
                    
                    // 2-1. 객체인 경우 레이어 목록 출력 (처음 10개)
                    if (typeof layersObj.layers === 'object' && !Array.isArray(layersObj.layers)) {
                        const layerNames = Object.keys(layersObj.layers);
                        console.log(`   → 레이어 개수: ${layerNames.length}개`);
                        console.log('   → 레이어 색상 정보 (처음 10개):');
                        layerNames.slice(0, 10).forEach(name => {
                            const layer = layersObj.layers[name];
                            console.log(`      "${name}": colorIndex=${layer.colorIndex}, color=${layer.color}`);
                        });
                    }
                    // 2-2. 배열인 경우
                    else if (Array.isArray(layersObj.layers)) {
                        console.log(`   → 레이어 개수: ${layersObj.layers.length}개`);
                        console.log('   → 레이어 색상 정보 (처음 10개):');
                        layersObj.layers.slice(0, 10).forEach((layer, i) => {
                            console.log(`      [${i}] "${layer.name}": colorIndex=${layer.colorIndex}, color=${layer.color}`);
                        });
                    }
                }
                
                // 3. 배열인 경우
                if (Array.isArray(layersObj)) {
                    console.log('✅ 배열 형태의 레이어 테이블');
                    console.log(`   → 레이어 개수: ${layersObj.length}개`);
                    layersObj.slice(0, 5).forEach((layer, i) => {
                        console.log(`  [${i}] "${layer.name}": colorIndex=${layer.colorIndex}`, layer);
                    });
                }
            }
        }
        
        // 블록 정보 표시
        if (this.dxfData.blocks) {
            const blockNames = Object.keys(this.dxfData.blocks);
            console.log('\n📦 블록 개수:', blockNames.length);
            if (blockNames.length > 0) {
                console.log('블록 목록:', blockNames.slice(0, 10));
                blockNames.slice(0, 5).forEach(name => {
                    const block = this.dxfData.blocks[name];
                    if (block.entities) {
                        console.log(`  - ${name}: ${block.entities.length}개 엔티티`);
                    }
                });
            }
        }
        
        this.dxfFileName = fileName.replace('.dxf', '');
        
        // 파일명 UI 업데이트
        this.updateFileNameDisplay(fileName);
        
        // 캔버스 초기화
        this.photos = [];
        this.scale = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        
        // 디버그 카운터 리셋
        this.colorDebugCount = 0;
        this._polylineDebugCount = 0;
        this._blockDebugCount = 0;
        this._textDebugCount = 0;
        
        // DXF 렌더링
        this.fitDxfToView();
        this.redraw();
        
        // 버튼은 항상 활성화 상태 (disabled 속성 제거)
        
        console.log(`✅ DXF 로드 완료: ${this.dxfData.entities ? this.dxfData.entities.length : 0}개 엔티티`);
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
            
            // 원본 ViewBox 저장 (확대율 계산용)
            this.originalViewBox = {...this.viewBox};
            
            console.log(`ViewBox 설정:`, this.viewBox);
        } else {
            console.warn('도면 크기가 0입니다. 기본 뷰 사용.');
            this.viewBox = { x: -500, y: -500, width: 1000, height: 1000 };
        }
    }
    
    drawWelcomeScreen() {
        // canvas 크기가 0이면 그리지 않음
        if (this.canvas.width === 0 || this.canvas.height === 0) {
            return;
        }
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
    }
    
    /**
     * ViewBox만 빠르게 업데이트 (드래그/줌 중)
     * requestAnimationFrame으로 최적화
     */
    updateViewBox() {
        if (!this.dxfData) return;
        
        // 이미 예약된 업데이트가 있으면 중복 호출 방지
        if (this.updatePending) return;
        
        this.updatePending = true;
        
        requestAnimationFrame(() => {
            this.updatePending = false;
            
            // SVG ViewBox만 업데이트 (SVG는 자동으로 재렌더링됨)
            this.svg.setAttribute('viewBox', 
                `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
            
            // Canvas 사진만 다시 그리기 (빠름)
            this.drawPhotosCanvas();
        });
    }
    
    /**
     * 전체 다시 그리기 (DXF 로드, 사진 추가/삭제 시)
     */
    redraw() {
        // requestAnimationFrame으로 부드러운 렌더링
        if (this.redrawPending) {
            this.debugLog('   ⏸️ redraw 이미 대기 중, 건너뜀');
            return;
        }
        
        this.redrawPending = true;
        this.debugLog('   ▶ redraw 예약됨 (requestAnimationFrame)');
        
        requestAnimationFrame(() => {
            this.redrawPending = false;
            this.debugLog('   🎨 redraw 실행 중...');
            
            if (!this.dxfData) {
                this.debugLog('      DXF 데이터 없음 - 환영 화면 표시');
                this.drawWelcomeScreen();
                this.clearCanvas();
                return;
            }
            
            // 1. SVG로 DXF 렌더링 (벡터)
            this.debugLog('      1️⃣ SVG DXF 그리기...');
            this.drawDxfSvg();
            
            // 2. Canvas로 사진 렌더링 (래스터)
            this.debugLog('      2️⃣ Canvas 사진/텍스트 그리기...');
            this.debugLog('         사진 개수:', this.photos.length);
            this.debugLog('         텍스트 개수:', this.texts.length);
            this.drawPhotosCanvas();
            
            this.debugLog('   ✅ redraw 완료');
        });
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
        
        this.debugLog('🖊️ SVG drawDxf() 시작, 엔티티:', this.dxfData.entities.length);
        
        let drawnCount = 0;
        let errorCount = 0;
        const fragment = document.createDocumentFragment();
        
        this.dxfData.entities.forEach((entity, index) => {
            try {
                if (!entity || !entity.type) {
                    console.warn(`엔티티 ${index}: 타입이 없습니다.`);
                    return;
                }
                
                const element = this.createSvgElement(entity);
                if (element) {
                    fragment.appendChild(element);
                    drawnCount++;
                }
            } catch (error) {
                errorCount++;
                if (errorCount <= 5) {
                    console.error(`엔티티 ${index} 렌더링 오류:`, error);
                }
            }
        });
        
        this.svgGroup.appendChild(fragment);
        this.debugLog(`SVG 렌더링 완료: ${drawnCount}개 성공, ${errorCount}개 실패`);
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
        // stroke-width는 CSS에서 처리
        line.setAttribute('stroke-linecap', 'round');
        
        return line;
    }
    
    createSvgPolyline(entity) {
        if (!entity.vertices || entity.vertices.length < 2) return null;
        
        const validVertices = entity.vertices.filter(v => 
            v && typeof v.x === 'number' && typeof v.y === 'number'
        );
        
        if (validVertices.length < 2) return null;
        
        // ⭐ closed 속성 확인
        const isClosed = entity.closed || entity.shape;
        
        // ⭐ 중복 정점 제거: 마지막 점이 첫 점과 같으면 제거 (polygon은 자동으로 닫힘)
        let finalVertices = [...validVertices];
        if (isClosed && validVertices.length > 2) {
            const first = validVertices[0];
            const last = validVertices[validVertices.length - 1];
            const threshold = 0.0001; // 매우 작은 값
            if (Math.abs(first.x - last.x) < threshold && Math.abs(first.y - last.y) < threshold) {
                finalVertices = validVertices.slice(0, -1); // 마지막 점 제거
            }
        }
        
        const points = finalVertices.map(v => `${v.x},${-v.y}`).join(' ');
        
        const element = document.createElementNS('http://www.w3.org/2000/svg', isClosed ? 'polygon' : 'polyline');
        
        element.setAttribute('points', points);
        element.setAttribute('fill', 'none');
        element.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 강제 적용 (width 무시)
        element.setAttribute('stroke-linejoin', 'round');
        element.setAttribute('stroke-linecap', 'round');
        
        // 디버그: closed 속성 확인 (처음 5개만)
        if (!this._polylineDebugCount) this._polylineDebugCount = 0;
        if (this._polylineDebugCount < 5 && isClosed) {
            console.log(`📐 닫힌 폴리선: closed=${entity.closed}, shape=${entity.shape}, 정점=${validVertices.length}개 → ${finalVertices.length}개 (${validVertices.length !== finalVertices.length ? '중복 제거' : '그대로'})`);
            const first = finalVertices[0];
            const last = finalVertices[finalVertices.length - 1];
            console.log(`   첫 점: (${first.x.toFixed(2)}, ${first.y.toFixed(2)}), 마지막 점: (${last.x.toFixed(2)}, ${last.y.toFixed(2)})`);
            this._polylineDebugCount++;
        }
        
        return element;
    }
    
    createSvgCircle(entity) {
        if (!entity.center || !entity.radius) return null;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.center.x);
        circle.setAttribute('cy', -entity.center.y);
        circle.setAttribute('r', entity.radius);
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', this.getEntityColor(entity)); // 실제 색상
        // stroke-width는 CSS에서 처리
        
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
        // stroke-width는 CSS에서 처리
        
        return path;
    }
    
    createSvgPoint(entity) {
        if (!entity.position) return null;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', entity.position.x);
        circle.setAttribute('cy', -entity.position.y);
        circle.setAttribute('r', '0.15'); // 매우 작게
        circle.setAttribute('fill', this.getEntityColor(entity)); // 실제 색상
        circle.setAttribute('class', 'dxf-point'); // CSS 클래스
        
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
        
        // ⭐ 수평 정렬 처리 (halign: 0=왼쪽, 1=중앙, 2=오른쪽, 3=정렬, 4=중간, 5=맞춤)
        const halign = entity.halign || 0;
        if (halign === 1 || halign === 4) {
            text.setAttribute('text-anchor', 'middle');
        } else if (halign === 2) {
            text.setAttribute('text-anchor', 'end');
        } else {
            text.setAttribute('text-anchor', 'start');
        }
        
        // ⭐ 수직 정렬 처리 (valign: 0=기준선, 1=아래, 2=중앙, 3=위)
        const valign = entity.valign || 0;
        if (valign === 1) {
            text.setAttribute('dominant-baseline', 'text-after-edge');
        } else if (valign === 2) {
            text.setAttribute('dominant-baseline', 'middle');
        } else if (valign === 3) {
            text.setAttribute('dominant-baseline', 'text-before-edge');
        } else {
            text.setAttribute('dominant-baseline', 'alphabetic');
        }
        
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
        
        // 디버그: 텍스트 정보 (처음 3개만)
        if (!this._textDebugCount) this._textDebugCount = 0;
        if (this._textDebugCount < 3) {
            console.log(`📝 텍스트 "${entity.text}": pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}), rotation=${entity.rotation ? (entity.rotation * 180 / Math.PI).toFixed(1) : 0}°`);
            console.log(`   halign=${halign}, valign=${valign}, fontSize=${fontSize}`);
            this._textDebugCount++;
        }
        
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
        
        // ⭐ 변환 적용 (SVG transform 순서 주의)
        const transforms = [];
        
        // 1. 삽입 위치로 이동
        transforms.push(`translate(${entity.position.x}, ${-entity.position.y})`);
        
        // 2. 회전 적용 (라디안 → 각도 변환)
        if (entity.rotation) {
            const rotationDeg = -(entity.rotation * 180 / Math.PI);
            transforms.push(`rotate(${rotationDeg})`);
        }
        
        // 3. Scale 적용 (X만 적용, Y는 반전하지 않음)
        const xScale = entity.xScale || 1;
        const yScale = entity.yScale || 1;
        if (xScale !== 1 || yScale !== 1) {
            transforms.push(`scale(${xScale}, ${yScale})`); // ⭐ Y축 그대로 사용
        }
        
        // 4. 블록 기준점 보정
        if (block.position) {
            transforms.push(`translate(${-block.position.x}, ${block.position.y})`);
        }
        
        // transform 속성 설정
        const transformStr = transforms.join(' ');
        group.setAttribute('transform', transformStr);
        
        // 디버그: 블록 변환 정보 (처음 3개만)
        if (!this._blockDebugCount) this._blockDebugCount = 0;
        if (this._blockDebugCount < 3) {
            console.log(`📦 블록 "${entity.name}": pos=(${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)}), rotation=${entity.rotation ? (entity.rotation * 180 / Math.PI).toFixed(1) : 0}°, scale=(${xScale}, ${yScale})`);
            console.log(`   → transform="${transformStr}"`);
            
            // 블록 내부 엔티티 타입 확인
            const entityTypes = block.entities.map(e => e.type).join(', ');
            console.log(`   → 내부 엔티티: ${entityTypes}`);
            this._blockDebugCount++;
        }
        
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
        // stroke-width는 CSS에서 처리
        
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
        // stroke-width는 CSS에서 처리
        
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
        // stroke-width는 CSS에서 처리
        
        return polygon;
    }
    
    drawPhotosCanvas() {
        this.debugLog('         🖼️ drawPhotosCanvas 시작');
        // Canvas 초기화 (투명) - 한 번에 처리
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.debugLog('            Canvas 초기화 완료 (크기:', this.canvas.width, 'x', this.canvas.height, ')');
        
        // 사진과 텍스트가 없으면 빠르게 리턴
        if (this.photos.length === 0 && this.texts.length === 0) {
            this.debugLog('            사진/텍스트 없음 - 건너뜀');
            return;
        }
        
        // 사진 마커 그리기
        this.debugLog('            사진 그리기 시작 (' + this.photos.length + '개)');
        this.drawPhotos();
        
        // 텍스트 그리기
        this.debugLog('            텍스트 그리기 시작 (' + this.texts.length + '개)');
        this.drawTexts();
        
        this.debugLog('         ✅ drawPhotosCanvas 완료');
    }
    
    /**
     * 텍스트 그리기 (최적화: rect 캐싱)
     */
    drawTexts() {
        this.texts.forEach(textObj => {
            const rect = this.getCachedRect();
            const { x, y } = this.viewToCanvasCoords(textObj.x, textObj.y);
            const fontSize = (textObj.fontSize / this.viewBox.width) * rect.width;
            
            this.ctx.save();
            
            // 텍스트 스타일
            this.ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
            this.ctx.fillStyle = '#FF3B30'; // 빨간색 (잘 보이게)
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // 텍스트 배경 (가독성 향상)
            const textWidth = this.ctx.measureText(textObj.text).width;
            const padding = 5;
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            this.ctx.fillRect(x - textWidth / 2 - padding, y - fontSize / 2 - padding, 
                             textWidth + padding * 2, fontSize + padding * 2);
            
            // 텍스트 그리기
            this.ctx.fillStyle = '#FF3B30';
            this.ctx.fillText(textObj.text, x, y);
            
            this.ctx.restore();
        });
    }
    
    // 기존 Canvas 렌더링 함수들은 제거됨 (SVG로 대체)
    
    /**
     * 사진을 작은 점(●)으로 표시
     * 수정: 
     * - 이모지 대신 작은 점(●) 사용
     * - 크기 15px로 고정 (가시성 확보)
     * - ViewBox 좌표에 완전 고정
     */
    drawPhotos() {
        const rect = this.getCachedRect();
        this.debugLog('               📷 drawPhotos 실행 - 사진 개수:', this.photos.length);
        
        this.photos.forEach((photo, index) => {
            // ViewBox 좌표 → 스크린 좌표 변환
            const { x: screenX, y: screenY } = this.viewToCanvasCoords(photo.x, photo.y);
            
            // 화면 밖에 있으면 그리지 않음
            if (screenX < -50 || screenX > rect.width + 50 || screenY < -50 || screenY > rect.height + 50) {
                return;
            }
            
            this.ctx.save();
            
            // 업로드 상태에 따른 색상 및 크기 결정
            const isUploaded = photo.uploaded === true;
            const hasMemo = photo.memo && photo.memo.trim();
            
            let markerColor;
            let markerRadius;
            
            if (isUploaded) {
                // 업로드 완료 → 빨간점 (작은 크기)
                markerColor = hasMemo ? '#9B51E0' : '#FF0000'; // 보라색(메모) 또는 빨간색
                markerRadius = 3.75; // 직경 7.5px (작음)
            } else {
                // 업로드 실패/대기 → 초록색 (2배 크기) - 사용자 알림
                markerColor = '#00C853'; // 초록색 (주의 필요)
                markerRadius = 7.5; // 직경 15px (2배 크기)
            }
            
            // 원 그리기
            this.ctx.fillStyle = markerColor;
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, markerRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // 테두리 (흰색, 더 잘 보이게)
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            this.ctx.restore();
        });
        
        this.debugLog('               ✅ drawPhotos 완료 - 총', this.photos.length, '개 그림');
    }
    
    /**
     * 특정 위치에 사진 추가
     * @param {File} file - 이미지 파일
     * @param {Object} position - {x, y} ViewBox 좌표
     */
    async addPhotoAt(file, position) {
        this.debugLog('====================================');
        this.debugLog('📷 addPhotoAt 호출됨');
        this.debugLog('   파일:', file);
        this.debugLog('   파일명:', file?.name);
        this.debugLog('   파일 크기:', file?.size, 'bytes');
        this.debugLog('   위치:', position);
        this.debugLog('====================================');
        
        if (!file) {
            console.warn('⚠️ 파일이 없습니다');
            this.showToast('⚠️ 파일이 선택되지 않았습니다');
            return;
        }
        
        if (!position) {
            console.error('❌ 위치 정보가 없습니다');
            this.showToast('⚠️ 위치 정보가 없습니다');
            return;
        }
        
        if (typeof position.x !== 'number' || typeof position.y !== 'number') {
            console.error('❌ 위치 좌표가 올바르지 않습니다:', position);
            this.showToast('⚠️ 위치 좌표가 올바르지 않습니다');
            return;
        }
        
        this.debugLog('▶ 사진 추가 프로세스 시작:', file.name);
        this.debugLog('   위치:', { x: position.x, y: position.y });
        this.showLoading(true);
        
        try {
            // 이미지 로드
            this.debugLog('1️⃣ 이미지 데이터 읽기 시작...');
            const imageData = await this.readFileAsDataURL(file);
            this.debugLog('   ✓ 이미지 데이터 읽기 완료 (길이:', imageData?.length, ')');
            
            this.debugLog('2️⃣ 이미지 객체 생성 시작...');
            const image = await this.loadImage(imageData);
            this.debugLog('   ✓ 이미지 로드 완료 (크기:', image.width, 'x', image.height, ')');
            
            // 이미지 압축 (500KB 이하로)
            this.showToast('🔄 이미지 변환 중...');
            this.debugLog('3️⃣ 이미지 압축 시작...');
            const compressedImageData = await this.compressImage(image, file.name, 500 * 1024); // 500KB
            this.debugLog('   ✓ 이미지 압축 완료 (압축 크기:', compressedImageData.length, ')');
            
            // 변환 완료 토스트
            this.showToast('✅ 변환 완료');
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초 대기
            
            // 사진 객체 생성
            // x, y: ViewBox 좌표계에 고정 (롱프레스한 위치)
            // width, height: 화면 표시용이 아닌 메타데이터 용도 (항상 고정값)
            const photo = {
                id: Date.now(),
                x: position.x,  // ViewBox 좌표 (고정)
                y: position.y,  // ViewBox 좌표 (고정)
                width: 1,       // 더미값 (화면 표시는 픽셀 기준 25px 고정)
                height: 1,      // 더미값 (화면 표시는 픽셀 기준 25px 고정)
                imageData: compressedImageData, // 압축된 이미지 사용
                image: image,
                memo: '',
                fileName: null,
                uploaded: false // 업로드 상태 추적
            };
            
            this.debugLog('4️⃣ 사진 객체 생성 완료:', {
                id: photo.id,
                x: photo.x,
                y: photo.y,
                width: photo.width,
                height: photo.height,
                fileName: photo.fileName
            });
            
            this.photos.push(photo);
            this.metadataDirty = true;
            this.debugLog(`5️⃣ 사진 배열에 추가됨 (총 ${this.photos.length}개)`);
            this.debugLog('   현재 사진 목록:', this.photos.map(p => ({ id: p.id, fileName: p.fileName })));
            
            this.debugLog('6️⃣ 화면 다시 그리기 시작...');
            this.redraw();
            this.debugLog('   ✓ 화면 다시 그리기 완료');
            
            // Google Drive 자동 저장
            this.debugLog('7️⃣ 자동 저장 시작...');
            this.showToast('☁️ 저장 중...');
            await this.autoSave();
            
        } catch (error) {
            console.error('❌❌❌ 사진 추가 오류 ❌❌❌');
            console.error('오류 내용:', error);
            console.error('오류 스택:', error.stack);
            this.showToast(`❌ 사진 추가 실패: ${error.message}`);
            throw error; // 에러를 다시 던져서 상위에서도 처리할 수 있게 함
        } finally {
            this.showLoading(false);
        }
    }
    
    async addPhoto(file) {
        if (!file) return;
        
        // ViewBox 중앙 계산
        const viewCenterX = this.viewBox.x + this.viewBox.width / 2;
        const viewCenterY = this.viewBox.y + this.viewBox.height / 2;
        
        await this.addPhotoAt(file, { x: viewCenterX, y: viewCenterY });
    }
    
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            this.debugLog('   📖 FileReader 시작...');
            const reader = new FileReader();
            reader.onload = (e) => {
                this.debugLog('   ✓ FileReader 완료');
                resolve(e.target.result);
            };
            reader.onerror = (error) => {
                console.error('   ❌ FileReader 오류:', error);
                reject(new Error('파일 읽기 실패: ' + error));
            };
            reader.readAsDataURL(file);
        });
    }
    
    loadImage(src) {
        return new Promise((resolve, reject) => {
            this.debugLog('   🖼️ Image 객체 생성...');
            const img = new Image();
            img.onload = () => {
                this.debugLog('   ✓ Image 로드 성공:', img.width, 'x', img.height);
                resolve(img);
            };
            img.onerror = (error) => {
                console.error('   ❌ Image 로드 오류:', error);
                reject(new Error('이미지 로드 실패'));
            };
            img.src = src;
        });
    }
    
    /**
     * 이미지 압축 (500KB 목표)
     * 참조: 사진변환_참조.html의 compressImageTo100KB 함수 기반
     * @param {Image} image - 원본 이미지 객체
     * @param {string} fileName - 파일 이름
     * @param {number} targetSize - 목표 크기 (bytes)
     * @returns {Promise<string>} 압축된 이미지 Data URL
     */
    async compressImage(image, fileName, targetSize) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // 최대 크기 제한 (긴 쪽 기준 1200px - 참조 파일은 1000px 사용)
                const maxDimension = 1200;
                let width = image.width;
                let height = image.height;
                
                // 비율 유지하며 축소
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.floor((height / width) * maxDimension);
                        width = maxDimension;
                    } else {
                        width = Math.floor((width / height) * maxDimension);
                        height = maxDimension;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                this.debugLog('   압축 캔버스 크기:', width, 'x', height);
                
                // 이미지 그리기
                ctx.drawImage(image, 0, 0, width, height);
                
                // Base64는 원본의 약 1.37배이므로 목표 문자열 길이 계산
                // 500KB = 512000 bytes → Base64 길이는 약 700000자
                const targetLength = Math.floor(targetSize * 1.37);
                
                // 품질을 조절하며 압축 (0.9부터 시작하여 감소)
                let quality = 0.9;
                let compressedData = canvas.toDataURL('image/jpeg', quality);
                
                this.debugLog(`   초기 압축 (품질 ${quality.toFixed(1)}): ${(compressedData.length / 1024).toFixed(2)}KB`);
                
                // 목표 크기보다 크면 품질을 낮춤
                while (compressedData.length > targetLength && quality > 0.1) {
                    quality -= 0.1;
                    compressedData = canvas.toDataURL('image/jpeg', quality);
                    this.debugLog(`   재압축 (품질 ${quality.toFixed(1)}): ${(compressedData.length / 1024).toFixed(2)}KB`);
                }
                
                // 여전히 크면 이미지 크기를 70%로 축소하고 다시 압축
                if (compressedData.length > targetLength) {
                    this.debugLog('   ⚠️ 품질 조정만으로 부족 - 이미지 크기 축소');
                    width = Math.floor(width * 0.7);
                    height = Math.floor(height * 0.7);
                    canvas.width = width;
                    canvas.height = height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.drawImage(image, 0, 0, width, height);
                    compressedData = canvas.toDataURL('image/jpeg', 0.7);
                    this.debugLog(`   크기 축소 후 재압축: ${(compressedData.length / 1024).toFixed(2)}KB`);
                }
                
                const finalSizeKB = (compressedData.length / 1024).toFixed(2);
                this.debugLog(`   ✅ 최종 압축 완료: ${finalSizeKB}KB (품질: ${quality.toFixed(1)})`);
                
                resolve(compressedData);
            } catch (error) {
                console.error('   ❌ 이미지 압축 오류:', error);
                reject(new Error('이미지 압축 실패: ' + error.message));
            }
        });
    }
    
    onMouseDown(e) {
        // 롱프레스 시작
        this.startLongPress(e.clientX, e.clientY);
        
        // 드래그 준비
        this.touchState.startX = e.clientX;
        this.touchState.startY = e.clientY;
        this.touchState.lastTouch = { x: e.clientX, y: e.clientY };
        this.touchState.anchorView = this.screenToViewBox(e.clientX, e.clientY);
        this.touchState.startViewBox = {...this.viewBox};
        this.touchState.isDragging = false; // 아직 시작 안함
    }
    
    onMouseMove(e) {
        if (!this.touchState.lastTouch) return;
        
        // 이동 거리 계산 (롱프레스 취소 판단용)
        const moveDistance = Math.sqrt(
            Math.pow(e.clientX - this.touchState.startX, 2) + 
            Math.pow(e.clientY - this.touchState.startY, 2)
        );
        
        // 5px 이상 이동하면 롱프레스 취소하고 드래그 시작
        if (moveDistance > 5 && this.longPressTimer) {
            this.cancelLongPress();
            this.touchState.isDragging = true;
        }
        
        // 드래그 처리
        if (this.touchState.isDragging && this.touchState.anchorView) {
            const currentView = this.screenToViewBox(e.clientX, e.clientY);
            
            const deltaViewX = (currentView.x - this.touchState.anchorView.x) * this.panSensitivity;
            const deltaViewY = (currentView.y - this.touchState.anchorView.y) * this.panSensitivity;
            
            this.viewBox.x -= deltaViewX;
            this.viewBox.y -= deltaViewY;
            
            this.updateViewBox();
        }
        
        // 현재 위치 저장
        this.touchState.lastTouch = { x: e.clientX, y: e.clientY };
    }
    
    onMouseUp(e) {
        // 드래그 중이었다면 wasDragging 플래그 설정 (클릭 이벤트 방지)
        if (this.touchState.isDragging) {
            this.touchState.wasDragging = true;
            setTimeout(() => {
                this.touchState.wasDragging = false;
            }, 100);
        }
        
        this.touchState.isDragging = false;
        this.touchState.lastTouch = null;
        this.touchState.anchorView = null;
        this.touchState.startViewBox = null;
    }
    
    /**
     * 터치 시작 이벤트 (핀치줌 지원 + 롱프레스 통합)
     */
    onTouchStart(e) {
        // 기본 브라우저 동작 방지 (페이지 확대/축소 방지)
        e.preventDefault();
        this.lastTouchTime = Date.now();
        this.longPressTriggered = false;
        this.clearPendingSingleTap();
        
        const touches = e.touches;
        
        if (touches.length === 1) {
            // 단일 터치: 롱프레스 시작 + 드래그 준비
            const touch = touches[0];
            
            // 롱프레스 시작
            this.startLongPress(touch.clientX, touch.clientY);
            
            // 드래그 상태 초기화
            this.touchState.isDragging = false;
            this.touchState.isPinching = false;
            this.touchState.startX = touch.clientX;
            this.touchState.startY = touch.clientY;
            this.touchState.lastTouch = { x: touch.clientX, y: touch.clientY };
            this.touchState.anchorView = this.screenToViewBox(touch.clientX, touch.clientY);
            this.touchState.startViewBox = {...this.viewBox};
            
        } else if (touches.length === 2) {
            // 두 손가락: 핀치줌 시작
            this.cancelLongPress(); // 롱프레스 취소
            
            this.touchState.isDragging = false;
            this.touchState.isPinching = true;
            this.touchState.anchorView = null;
            
            // 두 손가락 사이 거리 계산
            const touch1 = touches[0];
            const touch2 = touches[1];
            const distance = this.getTouchDistance(touch1, touch2);
            
            this.touchState.lastPinchDistance = distance;
            this.touchState.startViewBox = {...this.viewBox};
        }
    }
    
    /**
     * 터치 이동 이벤트 (단순화된 ViewBox 방식 - 안정적)
     */
    onTouchMove(e) {
        // 항상 기본 동작 방지
        e.preventDefault();
        
        const touches = e.touches;
        
        if (touches.length === 1 && !this.touchState.isPinching) {
            const touch = touches[0];
            
            // 이동 거리 계산
            const moveDistance = Math.sqrt(
                Math.pow(touch.clientX - this.touchState.startX, 2) + 
                Math.pow(touch.clientY - this.touchState.startY, 2)
            );
            
            // 10px 이상 이동하면 롱프레스 취소하고 드래그 시작 (더블탭 안정성 향상)
            if (moveDistance > 10 && this.longPressTimer) {
                this.cancelLongPress();
                this.touchState.isDragging = true;
            }
            
            // 단일 터치: 팬(드래그) - 손가락 방향과 일치
            if (this.touchState.isDragging && this.touchState.lastTouch) {
                // 현재/이전 터치 지점을 ViewBox 좌표로 변환
                const currentView = this.screenToViewBox(touch.clientX, touch.clientY);
                const lastView = this.screenToViewBox(this.touchState.lastTouch.x, this.touchState.lastTouch.y);
                
                const viewDeltaX = (lastView.x - currentView.x) * this.panSensitivity;
                const viewDeltaY = (lastView.y - currentView.y) * this.panSensitivity;
                
                // ViewBox 이동
                this.viewBox.x += viewDeltaX;
                this.viewBox.y += viewDeltaY;
                
                // 즉시 업데이트 (requestAnimationFrame으로 throttle)
                this.updateViewBox();
            }
            
            // 현재 위치 저장
            this.touchState.lastTouch = { x: touch.clientX, y: touch.clientY };
            
        } else if (touches.length === 2 && this.touchState.isPinching) {
            // 두 손가락: 핀치줌
            const touch1 = touches[0];
            const touch2 = touches[1];
            
            // 현재 거리
            const currentDistance = this.getTouchDistance(touch1, touch2);
            
            // 핀치 중심점 (스크린 좌표)
            const centerScreenX = (touch1.clientX + touch2.clientX) / 2;
            const centerScreenY = (touch1.clientY + touch2.clientY) / 2;
            
            if (this.touchState.lastPinchDistance > 0) {
                // 스케일 팩터
                const scaleFactor = currentDistance / this.touchState.lastPinchDistance;
                
                // 중심점을 ViewBox 좌표로 변환
                const rect = this.getCachedRect();
                const centerX = ((centerScreenX - rect.left) / rect.width) * this.viewBox.width + this.viewBox.x;
                const centerY = ((centerScreenY - rect.top) / rect.height) * this.viewBox.height + this.viewBox.y;
                
                // 새로운 ViewBox 크기
                const newWidth = this.viewBox.width / scaleFactor;
                const newHeight = this.viewBox.height / scaleFactor;
                
                // 최소/최대 크기 제한
                const minSize = (this.originalViewBox?.width || 1000) * 0.01;
                const maxSize = (this.originalViewBox?.width || 1000) * 10;
                
                if (newWidth >= minSize && newWidth <= maxSize) {
                    // 중심점 기준으로 ViewBox 재계산
                    const centerRatioX = (centerX - this.viewBox.x) / this.viewBox.width;
                    const centerRatioY = (centerY - this.viewBox.y) / this.viewBox.height;
                    
                    this.viewBox = {
                        x: centerX - newWidth * centerRatioX,
                        y: centerY - newHeight * centerRatioY,
                        width: newWidth,
                        height: newHeight
                    };
                    
                    // 즉시 업데이트
                    this.updateViewBox();
                }
            }
            
            // 거리 업데이트
            this.touchState.lastPinchDistance = currentDistance;
        }
    }
    
    /**
     * 터치 종료 이벤트 (롱프레스 + 더블탭 처리)
     */
    onTouchEnd(e) {
        e.preventDefault();
        
        const touches = e.touches;
        
        if (touches.length === 0) {
            // 모든 터치 종료
            
            // 컨텍스트 메뉴가 열려있고, 드래그하지 않았고, 롱프레스가 아니면 메뉴 닫기
            const contextMenu = document.getElementById('context-menu');
            if (contextMenu.classList.contains('active') && 
                !this.touchState.isDragging && 
                !this.isLongPress) {
                
                // 메뉴 버튼을 터치한 게 아닌지 확인
                const touch = e.changedTouches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (!contextMenu.contains(target)) {
                    this.hideContextMenu();
                }
            }
            
            // 사진 클릭 또는 더블탭 감지
            if (!this.longPressTriggered && e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                const isTap = this.isTapGesture(touch);
                
                if (isTap) {
                    const doubled = this.handleDoubleTap(touch.clientX, touch.clientY);
                    if (doubled) {
                        this.clearPendingSingleTap();
                    } else {
                        const tappedPhoto = this.checkPhotoClick(touch.clientX, touch.clientY, { openModal: false });
                        if (tappedPhoto) {
                            this.queueSingleTapAction(() => this.openPhotoViewModal(tappedPhoto.id));
                        } else {
                            this.clearPendingSingleTap();
                        }
                    }
                } else {
                    this.clearPendingSingleTap();
                }
            }
            
            // 롱프레스 확인
            if (!this.longPressTriggered) {
                this.cancelLongPress();
            } else {
                this.longPressTriggered = false;
                this.isLongPress = false;
                this.clearPendingSingleTap();
            }
            
            // 드래그 중이었다면 wasDragging 플래그 설정 (클릭 이벤트 방지)
            if (this.touchState.isDragging) {
                this.touchState.wasDragging = true;
                setTimeout(() => {
                    this.touchState.wasDragging = false;
                }, 100);
            }
            
            // rect 캐시 무효화 (ViewBox가 변경되었을 수 있음)
            this.cachedRect = null;
            
            // 상태 리셋
            this.touchState.isDragging = false;
            this.touchState.isPinching = false;
            this.touchState.lastTouch = null;
            this.touchState.anchorView = null;
            this.touchState.startViewBox = null;
            
        } else if (touches.length === 1) {
            // 두 손가락에서 한 손가락으로 전환
            this.cancelLongPress();
            
            const touch = touches[0];
            
            // 드래그 재시작 준비
            this.touchState.isDragging = false; // 드래그 재시작 방지 (핀치→팬 전환 시 끊김 방지)
            this.touchState.isPinching = false;
            this.touchState.startX = touch.clientX;
            this.touchState.startY = touch.clientY;
            this.touchState.lastTouch = { x: touch.clientX, y: touch.clientY };
        }
    }
    
    /**
     * 두 터치 포인트 사이의 거리 계산
     */
    getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 화면 좌표를 현재 ViewBox 기준 좌표로 변환
     */
    screenToViewBox(screenX, screenY) {
        if (!this.svg) {
            return { x: screenX, y: screenY };
        }
        
        const point = this.svg.createSVGPoint ? this.svg.createSVGPoint() : { x: screenX, y: screenY };
        point.x = screenX;
        point.y = screenY;
        
        const ctm = this.svg.getScreenCTM();
        if (!ctm || !ctm.inverse) {
            // 폴백: 단순 비율 변환
            const rect = this.svg.getBoundingClientRect();
            const normX = (screenX - rect.left) / rect.width;
            const normY = (screenY - rect.top) / rect.height;
            return {
                x: this.viewBox.x + normX * this.viewBox.width,
                y: this.viewBox.y + normY * this.viewBox.height
            };
        }
        
        const svgPoint = point.matrixTransform(ctm.inverse());
        return { x: svgPoint.x, y: svgPoint.y };
    }
    
    /**
     * 특정 점을 중심으로 줌 (부드러운 확대/축소)
     */
    zoomAt(centerX, centerY, factor) {
        // 새로운 크기 계산
        const newWidth = this.viewBox.width * factor;
        const newHeight = this.viewBox.height * factor;
        
        // 최소/최대 크기 제한
        const minSize = (this.originalViewBox?.width || 1000) * 0.01; // 최대 100배 확대
        const maxSize = (this.originalViewBox?.width || 1000) * 10;   // 최대 10배 축소
        
        if (newWidth < minSize || newWidth > maxSize) {
            return; // 제한을 벗어나면 줌 취소
        }
        
        // 중심점의 상대 위치 계산 (0~1 사이 값)
        const centerRatioX = (centerX - this.viewBox.x) / this.viewBox.width;
        const centerRatioY = (centerY - this.viewBox.y) / this.viewBox.height;
        
        // 새로운 ViewBox 계산 (중심점 유지)
        this.viewBox = {
            x: centerX - newWidth * centerRatioX,
            y: centerY - newHeight * centerRatioY,
            width: newWidth,
            height: newHeight
        };
        
        // 빠른 업데이트 (ViewBox만)
        this.updateViewBox();
    }
    
    /**
     * 사진 클릭 확인 (공통 함수)
     * @returns {boolean} 사진이 클릭되었으면 true, 아니면 false
     */
    checkPhotoClick(clientX, clientY, options = {}) {
        const { openModal = true } = options;
        // 최적화: rect 한 번만 가져오기
        const rect = this.getCachedRect();
        const clickX = clientX - rect.left;
        const clickY = clientY - rect.top;
        
        this.debugLog('👆 사진 클릭 확인:', { clickX, clickY });
        
        // 사진 점 클릭 확인 (원형 영역)
        for (let i = this.photos.length - 1; i >= 0; i--) {
            const photo = this.photos[i];
            
            // 사진 점 위치 계산
            const { x: screenX, y: screenY } = this.viewToCanvasCoords(photo.x, photo.y);
            
            // 클릭 영역 (30px - 터치하기 쉽게)
            const clickRadius = 30;
            
            // 거리 계산 (원형 클릭 영역)
            const distance = Math.sqrt(
                Math.pow(clickX - screenX, 2) + 
                Math.pow(clickY - screenY, 2)
            );
            
            this.debugLog(`   사진 ${i}: 거리=${distance.toFixed(1)}px, 기준=${clickRadius}px`);
            
            if (distance <= clickRadius) {
                this.debugLog(`✅ 사진 ${photo.id} 클릭 감지 (openModal=${openModal})`);
                if (openModal) {
                    this.openPhotoViewModal(photo.id);
                }
                return photo;
            }
        }
        
        this.debugLog('   → 사진이 클릭되지 않음');
        return null;
    }

    /**
     * 캔버스 클릭 이벤트 (이모지 클릭 감지)
     * SVG 클릭 이벤트에서 호출됨
     */
    onCanvasClick(e) {
        if (Date.now() - this.lastTouchTime < 400) {
            return;
        }
        // 드래그 중이거나 방금 드래그가 끝났으면 클릭으로 처리하지 않음
        if (this.touchState.isDragging || this.touchState.wasDragging) {
            return;
        }
        
        // 사진 클릭 확인
        this.checkPhotoClick(e.clientX, e.clientY, { openModal: true });
    }
    
    /**
     * 사진 보기 모달 열기
     */
    async openPhotoViewModal(photoId) {
        const photo = this.photos.find(p => p.id === photoId);
        if (!photo) return;
        
        this.selectedPhotoId = photoId;
        
        const photoImageEl = document.getElementById('photo-view-image');
        if (photoImageEl) {
            photoImageEl.src = '';
        }
        
        let imageData = photo.imageData;
        let fetchedTempData = false;
        
        if (!imageData) {
            if (!photo.fileName) {
                this.showToast('⚠️ 사진 파일 정보를 찾을 수 없습니다.');
                return;
            }
            
            try {
                this.showLoading(true);
                imageData = await window.downloadFileByNameAsDataUrl(photo.fileName);
                fetchedTempData = !!imageData;
            } catch (error) {
                console.error('❌ 사진 다운로드 실패:', error);
                this.showToast('⚠️ 사진을 불러오지 못했습니다.');
            } finally {
                this.showLoading(false);
            }
            
            if (!imageData) {
                return;
            }
        }
        
        if (photoImageEl) {
            photoImageEl.src = imageData;
        }
        this.tempFetchedPhotoData = fetchedTempData ? imageData : null;
        
        // 메모 표시 (인라인 편집)
        if (this.photoMemoInput) {
            this.photoMemoInput.disabled = false;
            this.photoMemoInput.value = photo.memo || '';
            setTimeout(() => {
                this.photoMemoInput.focus({ preventScroll: true });
            }, 50);
        }
        
        // 모달 열기
        document.getElementById('photo-view-modal').classList.add('active');
        
        // 같은 위치의 여러 사진 표시 업데이트
        this.updatePhotoViewModal();
    }
    
    
    /**
     * 줌 (ViewBox 중심점 기준)
     */
    zoom(factor) {
        // ViewBox 중심점 계산
        const centerX = this.viewBox.x + this.viewBox.width / 2;
        const centerY = this.viewBox.y + this.viewBox.height / 2;
        
        // zoomAt 메서드 사용 (중심점 기준 확대)
        this.zoomAt(centerX, centerY, 1 / factor);
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
        const modal = document.getElementById('memo-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.selectedPhotoId = null;
    }
    
    saveMemo() {
        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) return;
        
        photo.memo = document.getElementById('memo-text').value;
        this.metadataDirty = true;
        this.closeMemoModal();
        alert('메모가 저장되었습니다!');
        
        // Google Drive 자동 저장
        this.autoSave();
    }
    
    async deletePhoto(skipConfirm = false) {
        if (!this.selectedPhotoId) return;
        if (!skipConfirm) {
            const confirmMessage = '이 사진과 메모를 삭제하시겠습니까?\n\n삭제 시 Google Drive 사진 파일과 메타데이터에서도 제거됩니다.';
            if (!confirm(confirmMessage)) {
                return;
            }
        }
        
        const photoIndex = this.photos.findIndex(p => p.id === this.selectedPhotoId);
        if (photoIndex === -1) return;
        
        const photoToDelete = this.photos[photoIndex];
        console.log('🗑️ 사진 삭제 시작:', photoToDelete.id);
        
        try {
            // Google Drive에서 사진 파일 삭제
            if (window.currentDriveFile && window.deletePhotoFromDrive && photoToDelete.uploaded) {
                this.showToast('🗑️ 삭제 중...');
                const baseName = this.getDxfBaseName();
                const photoFileName = photoToDelete.fileName || `${baseName}_photo_${photoIndex + 1}.jpg`;
                
                console.log('   Google Drive에서 삭제:', photoFileName);
                await window.deletePhotoFromDrive(photoFileName);
                console.log('   ✅ Google Drive 삭제 완료');
            }
            
            // 로컬 배열에서 제거
            this.photos = this.photos.filter(p => p.id !== this.selectedPhotoId);
            console.log('   ✅ 로컬 배열에서 제거 완료');
            this.metadataDirty = true;
            
            this.redraw();
            
            // 메타데이터 업데이트
            await this.autoSave();
            
            this.showToast('✅ 사진 삭제 완료');
            console.log('✅ 사진 삭제 완료:', photoToDelete.id);
        } catch (error) {
            console.error('❌ 사진 삭제 실패:', error);
            this.showToast('⚠️ 삭제 실패: ' + error.message);
            return;
        }

        this.closePhotoViewModal();
    }
    
    /**
     * 사진 재업로드 (업로드 실패한 사진을 다시 업로드)
     */
    async reuploadPhoto() {
        if (!this.selectedPhotoId) {
            this.showToast('⚠️ 선택된 사진이 없습니다');
            return;
        }
        
        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) {
            this.showToast('⚠️ 사진을 찾을 수 없습니다');
            return;
        }
        
        // 이미 업로드된 경우
        if (photo.uploaded === true) {
            this.showToast('ℹ️ 이미 정상 저장된 사진입니다');
            return;
        }
        
        try {
            this.showToast('📤 재업로드 중...');
            console.log('📤 사진 재업로드 시작:', photo.id);
            
            // Google Drive에 업로드
            if (window.currentDriveFile && window.saveToDrive) {
                const baseName = this.getDxfBaseName();
                const timestamp = new Date().toISOString()
                    .replace(/[-:]/g, '')
                    .replace(/T/, '_')
                    .replace(/\..+/, '')
                    .slice(4, 13); // MMDDHHmmss
                const fileName = `${baseName}_photo_${timestamp}.jpg`;
                
                photo.fileName = fileName;
                
                // 사진만 업로드 (메타데이터는 autoSave에서 처리)
                const appData = {
                    photos: [photo], // 이 사진만
                    allPhotos: this.photos, // 전체 사진 목록
                    texts: this.texts
                };
                
                await window.saveToDrive(appData, window.currentDriveFile.name);
                
                photo.uploaded = true;
                this.metadataDirty = true;
                
                console.log('   ✅ Google Drive 업로드 완료');
                
                // 화면 다시 그리기 (마커 색상 변경)
                this.redraw();
                
                this.showToast('✅ 재업로드 완료');
                console.log('✅ 사진 재업로드 완료:', photo.id);
            } else {
                throw new Error('Google Drive 연결이 필요합니다');
            }
        } catch (error) {
            console.error('❌ 사진 재업로드 실패:', error);
            this.showToast('⚠️ 재업로드 실패: ' + error.message);
        }
    }
    
    /**
     * Google Drive 자동 저장
     */
    async autoSave() {
        // Google Drive에 데이터 저장
        console.log('💾 자동 저장 시도...');
        console.log('   saveToDrive 함수:', typeof window.saveToDrive);
        console.log('   currentDriveFile:', window.currentDriveFile);
        
        if (!window.currentDriveFile && this.localSourceFile) {
            await this.ensureDriveContextForLocalFile(this.localSourceFile);
        }
        
        if (typeof window.saveToDrive !== 'function') {
            console.error('❌ saveToDrive 함수를 찾을 수 없습니다');
            this.showToast('⚠️ 저장 실패: 드라이브 기능을 사용할 수 없습니다');
            return;
        }
        
        if (!window.currentDriveFile) {
            console.warn('⚠️ Google Drive 파일 정보가 없습니다 (로컬 파일 또는 로그인 안 됨)');
            this.showToast('⚠️ 저장 실패: Google Drive에서 파일을 열어주세요');
            return;
        }
        
        try {
            // 업로드되지 않은 사진만 필터링
            const newPhotos = this.photos.filter(p => !p.uploaded);
            const hasNewPhotos = newPhotos.length > 0;
            const needsMetadataUpdate = this.metadataDirty || hasNewPhotos;
            
            console.log('📦 저장할 데이터:', {
                totalPhotosCount: this.photos.length,
                newPhotosCount: newPhotos.length,
                textsCount: this.texts.length,
                fileName: window.currentDriveFile.name
            });
            
            // 새로운 사진이 있거나 메타데이터가 변경되었을 때만 업로드
            if (needsMetadataUpdate) {
                const appData = {
                    photos: newPhotos,  // 새로운 사진만
                    allPhotos: this.photos,  // 전체 사진 목록 (메타데이터용)
                    texts: this.texts
                };
                
                const success = await window.saveToDrive(appData, window.currentDriveFile.name);
                
                if (success) {
                    // 업로드 성공 시 모든 사진을 uploaded: true로 표시하고 메모리 해제
                    newPhotos.forEach(photo => {
                        photo.uploaded = true;
                        photo.imageData = null;
                        photo.image = null;
                    });
                    this.metadataDirty = false;
                    console.log('✅ 자동 저장 완료');
                    this.showToast('✅ 저장 완료');
                } else {
                    console.error('❌ 자동 저장 실패 (false 반환)');
                    this.showToast('⚠️ 저장 실패');
                }
            } else {
                console.log('⏭️ 새로운 사진/메타데이터 변경 없음 - 업로드 스킵');
            }
        } catch (error) {
            console.error('❌ 자동 저장 오류:', error);
            if (error && /로그인/.test(error.message || '')) {
                this.showToast('로그인이 만료되었습니다. Google Drive 버튼으로 다시 로그인하세요.');
            }
            this.showToast(`⚠️ 저장 실패: ${error.message}`);
        }
    }
    
    /**
     * 토스트 메시지 표시
     */
    /**
     * 도면 파일명 표시 업데이트
     */
    updateFileNameDisplay(fileName) {
        const fileNameText = document.getElementById('file-name-text');
        if (fileNameText) {
            fileNameText.textContent = fileName;
        }
    }
    
    showToast(message) {
        // 기존 토스트 제거
        const existingToast = document.querySelector('.toast-message');
        if (existingToast) {
            existingToast.remove();
        }
        
        // 새 토스트 생성
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 12px 24px;
            border-radius: 24px;
            font-size: 15px;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: toastFadeInOut 2.5s ease-in-out forwards;
        `;
        
        // 애니메이션 CSS 추가 (한 번만)
        if (!document.getElementById('toast-animation-style')) {
            const style = document.createElement('style');
            style.id = 'toast-animation-style';
            style.textContent = `
                @keyframes toastFadeInOut {
                    0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    10% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    90% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // 2.5초 후 자동 제거
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 2500);
    }
    
    /**
     * 특정 좌표의 모든 사진 가져오기 (같은 위치에 여러 사진)
     */
    getPhotosAtLocation(x, y, tolerance = 0.1) {
        return this.photos.filter(photo => {
            return Math.abs(photo.x - x) < tolerance && Math.abs(photo.y - y) < tolerance;
        });
    }
    
    /**
     * 같은 위치에 사진 추가 (카메라 촬영)
     */
    async addPhotoAtSameLocation() {
        if (!this.selectedPhotoId) {
            this.showToast('⚠️ 선택된 사진이 없습니다');
            return;
        }
        
        const selectedPhoto = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!selectedPhoto) {
            this.showToast('⚠️ 사진을 찾을 수 없습니다');
            return;
        }
        
        console.log('📷 같은 위치에 사진 추가:', selectedPhoto.x, selectedPhoto.y);
        
        // 위치 저장
        this.longPressPosition = { x: selectedPhoto.x, y: selectedPhoto.y };
        
        // 모달 닫기
        this.closePhotoViewModal();
        
        // 카메라 입력 트리거
        const cameraInput = document.getElementById('camera-input');
        if (cameraInput) {
            cameraInput.click();
        }
    }
    
    /**
     * 같은 위치의 사진들 간 네비게이션
     */
    navigatePhotoGroup(direction) {
        if (!this.selectedPhotoId) return;
        
        const selectedPhoto = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!selectedPhoto) return;
        
        // 같은 위치의 사진들 가져오기
        const photosAtLocation = this.getPhotosAtLocation(selectedPhoto.x, selectedPhoto.y);
        
        if (photosAtLocation.length <= 1) return;
        
        // 현재 인덱스 찾기
        const currentIndex = photosAtLocation.findIndex(p => p.id === this.selectedPhotoId);
        
        // 새 인덱스 계산
        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = photosAtLocation.length - 1;
        if (newIndex >= photosAtLocation.length) newIndex = 0;
        
        // 새 사진 표시
        this.selectedPhotoId = photosAtLocation[newIndex].id;
        this.currentPhotoGroupIndex = newIndex;
        this.updatePhotoViewModal();
    }
    
    /**
     * 사진 뷰어 모달 업데이트 (같은 위치의 여러 사진 표시)
     */
    updatePhotoViewModal() {
        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) return;
        
        // 사진 표시
        const photoImage = document.getElementById('photo-view-image');
        if (photoImage) {
            photoImage.src = photo.imageData;
        }
        
        // 메모 표시
        const photoMemoInput = document.getElementById('photo-memo-input');
        if (photoMemoInput) {
            photoMemoInput.value = photo.memo || '';
        }
        
        // 같은 위치의 사진들 가져오기
        const photosAtLocation = this.getPhotosAtLocation(photo.x, photo.y);
        const currentIndex = photosAtLocation.findIndex(p => p.id === this.selectedPhotoId);
        
        // 개수 표시 업데이트
        const photoCountIndicator = document.getElementById('photo-count-indicator');
        if (photoCountIndicator) {
            if (photosAtLocation.length > 1) {
                photoCountIndicator.textContent = `(${photosAtLocation.length}장)`;
            } else {
                photoCountIndicator.textContent = '';
            }
        }
        
        // 네비게이션 표시/숨김
        const photoNavigation = document.getElementById('photo-navigation');
        if (photoNavigation) {
            if (photosAtLocation.length > 1) {
                photoNavigation.style.display = 'flex';
                
                // 인덱스 표시
                const photoIndexDisplay = document.getElementById('photo-index-display');
                if (photoIndexDisplay) {
                    photoIndexDisplay.textContent = `${currentIndex + 1} / ${photosAtLocation.length}`;
                }
                
                // 이전/다음 버튼 활성화
                const prevBtn = document.getElementById('photo-prev-btn');
                const nextBtn = document.getElementById('photo-next-btn');
                if (prevBtn) prevBtn.disabled = false;
                if (nextBtn) nextBtn.disabled = false;
            } else {
                photoNavigation.style.display = 'none';
            }
        }
    }
    
    /**
     * 사진 뷰어 모달 닫기 (통합 버전)
     */
    closePhotoViewModal() {
        this.saveInlineMemo();
        const modal = document.getElementById('photo-view-modal');
        if (modal) {
            modal.classList.remove('active');
        }
        if (this.photoMemoInput) {
            this.photoMemoInput.blur();
            this.photoMemoInput.disabled = true;
            this.photoMemoInput.value = '';
        }
        const photoImageEl = document.getElementById('photo-view-image');
        if (photoImageEl && this.tempFetchedPhotoData) {
            photoImageEl.src = '';
        }
        this.tempFetchedPhotoData = null;
        this.selectedPhotoId = null;
        this.currentPhotoGroupIndex = 0;
    }
    
    /**
     * 사진 재업로드
     */
    async reuploadPhoto() {
        if (!this.selectedPhotoId) {
            this.showToast('⚠️ 선택된 사진이 없습니다');
            return;
        }
        
        const photo = this.photos.find(p => p.id === this.selectedPhotoId);
        if (!photo) {
            this.showToast('⚠️ 사진을 찾을 수 없습니다');
            return;
        }
        
        // 이미 업로드된 경우
        if (photo.uploaded === true) {
            this.showToast('ℹ️ 이미 정상 저장된 사진입니다');
            return;
        }
        
        try {
            this.showToast('📤 재업로드 중...');
            console.log('📤 사진 재업로드 시작:', photo.id);
            
            // Google Drive에 업로드
            if (window.currentDriveFile && window.saveToDrive) {
                const baseName = this.getDxfBaseName();
                const timestamp = new Date().toISOString()
                    .replace(/[-:]/g, '')
                    .replace(/T/, '_')
                    .replace(/\..+/, '')
                    .slice(4, 13); // MMDDHHmmss
                const fileName = `${baseName}_photo_${timestamp}.jpg`;
                
                photo.fileName = fileName;
                
                // 사진만 업로드 (메타데이터는 autoSave에서 처리)
                const appData = {
                    photos: [photo], // 이 사진만
                    allPhotos: this.photos, // 전체 사진 목록
                    texts: this.texts
                };
                
                await window.saveToDrive(appData, window.currentDriveFile.name);
                
                photo.uploaded = true;
                this.metadataDirty = true;
                
                console.log('   ✅ Google Drive 업로드 완료');
                
                // 화면 다시 그리기 (마커 색상 변경)
                this.redraw();
                
                this.showToast('✅ 재업로드 완료');
                console.log('✅ 사진 재업로드 완료:', photo.id);
            } else {
                throw new Error('Google Drive 연결이 필요합니다');
            }
        } catch (error) {
            console.error('❌ 사진 재업로드 실패:', error);
            this.showToast('⚠️ 재업로드 실패: ' + error.message);
        }
    }
    
    /**
     * ZIP 내보내기 기능 제거됨
     * 
     * 이유: Google Drive 자동 저장으로 대체
     * - 사진/텍스트 추가 시 자동으로 Google Drive에 업로드
     * - JSZip 라이브러리 불필요 (~100KB 절감)
     * 
     * 필요 시 아래 코드 주석 해제하고 JSZip 라이브러리 추가
     */
    
    /*
    async exportToZip() {
        if (!this.dxfData) {
            alert('DXF 파일을 먼저 로드해주세요.');
            return;
        }
        
        if (typeof JSZip === 'undefined') {
            alert('ZIP 라이브러리가 로드되지 않았습니다.');
            return;
        }
        
        // ... ZIP 생성 로직 ...
    }
    
    createModifiedDxf() {
        // DXF 수정본 생성 로직
    }
    */
    
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

async function waitForDriveReady(timeoutMs = 5000) {
    if (window.driveInitPromise) {
        return window.driveInitPromise;
    }

    return new Promise(resolve => {
        const interval = setInterval(() => {
            if (window.driveInitPromise) {
                clearInterval(interval);
                window.driveInitPromise.then(resolve).catch(resolve);
                return;
            }
        }, 100);

        setTimeout(() => {
            clearInterval(interval);
            resolve();
        }, timeoutMs);
    });
}

// Google Drive 준비 대기 후 앱 시작
async function startApp() {
    console.log('📱 앱 시작...');
    
    // Google Drive Manager가 준비될 때까지 대기 (최대 5초)
    let retries = 0;
    while (!window.driveManager && retries < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (window.driveManager) {
        console.log('✅ Google Drive Manager 준비됨');
    } else {
        console.warn('⚠️ Google Drive Manager 초기화 대기 시간 초과');
    }

    await waitForDriveReady();
    
    // 앱 인스턴스 생성
    app = new DxfPhotoEditor();
    console.log('✅ DXF Photo Editor 초기화 완료');

    if (window.driveManager?.isAccessTokenValid()) {
        app.setLoginButtonState(true);
        await app.loadFileList();
    }
}

document.addEventListener('DOMContentLoaded', startApp);

