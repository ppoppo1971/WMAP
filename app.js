// 전역 변수
let canvas, ctx;
let dxfData = null;
let images = [];
let currentImage = null;
let selectedImage = null;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isDragging = false;
let isResizing = false;
let dragStartX, dragStartY;
let resizeHandle = null;

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('mainCanvas');
    ctx = canvas.getContext('2d');
    
    // 캔버스 크기 설정
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // 이벤트 리스너 등록
    document.getElementById('dxfFile').addEventListener('change', handleDXFUpload);
    document.getElementById('imageFile').addEventListener('change', handleImageUpload);
    document.getElementById('zoomIn').addEventListener('click', () => zoom(1.2));
    document.getElementById('zoomOut').addEventListener('click', () => zoom(0.8));
    document.getElementById('resetView').addEventListener('click', resetView);
    document.getElementById('saveImage').addEventListener('click', saveAsImage);
    document.getElementById('clearAll').addEventListener('click', clearAll);
    
    // 캔버스 이벤트
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('wheel', handleWheel);
    
    // 초기 렌더링
    render();
});

// 캔버스 크기 조정
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
}

// DXF 파일 업로드 처리
function handleDXFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('modeInfo').textContent = 'DXF 파일 로딩 중...';
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const dxfString = e.target.result;
            const parser = new DxfParser();
            dxfData = parser.parseSync(dxfString);
            
            console.log('DXF 데이터:', dxfData);
            document.getElementById('modeInfo').textContent = '도면 로드 완료';
            document.querySelector('.instructions').classList.add('hidden');
            
            // 도면에 맞게 뷰 조정
            fitToView();
            render();
        } catch (error) {
            console.error('DXF 파싱 오류:', error);
            alert('DXF 파일을 읽는 중 오류가 발생했습니다: ' + error.message);
            document.getElementById('modeInfo').textContent = 'DXF 로드 실패';
        }
    };
    reader.readAsText(file);
}

// 이미지 파일 업로드 처리
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            document.getElementById('modeInfo').textContent = '도면을 클릭하여 이미지를 배치하세요';
            canvas.style.cursor = 'crosshair';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 마우스 다운 이벤트
function handleMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // 월드 좌표로 변환
    const worldX = (mouseX - offsetX) / scale;
    const worldY = (mouseY - offsetY) / scale;
    
    // 현재 이미지를 배치하는 모드
    if (currentImage) {
        placeImage(worldX, worldY);
        return;
    }
    
    // 이미지 선택 및 조작
    selectedImage = null;
    resizeHandle = null;
    
    // 리사이즈 핸들 체크
    for (let i = images.length - 1; i >= 0; i--) {
        const handle = getResizeHandle(images[i], worldX, worldY);
        if (handle) {
            selectedImage = images[i];
            resizeHandle = handle;
            isResizing = true;
            dragStartX = worldX;
            dragStartY = worldY;
            return;
        }
    }
    
    // 이미지 선택
    for (let i = images.length - 1; i >= 0; i--) {
        if (isPointInImage(images[i], worldX, worldY)) {
            selectedImage = images[i];
            isDragging = true;
            dragStartX = worldX - selectedImage.x;
            dragStartY = worldY - selectedImage.y;
            render();
            return;
        }
    }
}

// 마우스 이동 이벤트
function handleMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const worldX = (mouseX - offsetX) / scale;
    const worldY = (mouseY - offsetY) / scale;
    
    if (isDragging && selectedImage) {
        selectedImage.x = worldX - dragStartX;
        selectedImage.y = worldY - dragStartY;
        render();
    } else if (isResizing && selectedImage) {
        resizeImage(selectedImage, worldX, worldY);
        render();
    } else {
        // 커서 변경
        let cursor = 'default';
        if (currentImage) {
            cursor = 'crosshair';
        } else {
            for (let img of images) {
                const handle = getResizeHandle(img, worldX, worldY);
                if (handle) {
                    cursor = getResizeCursor(handle);
                    break;
                } else if (isPointInImage(img, worldX, worldY)) {
                    cursor = 'move';
                    break;
                }
            }
        }
        canvas.style.cursor = cursor;
    }
}

// 마우스 업 이벤트
function handleMouseUp() {
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
}

// 마우스 휠 이벤트 (줌)
function handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    zoom(delta);
}

// 이미지 배치
function placeImage(x, y) {
    if (!currentImage) return;
    
    const imageObj = {
        img: currentImage,
        x: x,
        y: y,
        width: currentImage.width / 2,
        height: currentImage.height / 2,
        rotation: 0
    };
    
    images.push(imageObj);
    currentImage = null;
    
    updateImageCount();
    document.getElementById('modeInfo').textContent = '이미지 배치 완료';
    canvas.style.cursor = 'default';
    
    render();
}

// 이미지 내부 체크
function isPointInImage(img, x, y) {
    return x >= img.x && x <= img.x + img.width &&
           y >= img.y && y <= img.y + img.height;
}

// 리사이즈 핸들 가져오기
function getResizeHandle(img, x, y) {
    const handleSize = 10 / scale;
    const corners = [
        { name: 'nw', x: img.x, y: img.y },
        { name: 'ne', x: img.x + img.width, y: img.y },
        { name: 'sw', x: img.x, y: img.y + img.height },
        { name: 'se', x: img.x + img.width, y: img.y + img.height }
    ];
    
    for (let corner of corners) {
        if (Math.abs(x - corner.x) < handleSize && Math.abs(y - corner.y) < handleSize) {
            return corner.name;
        }
    }
    return null;
}

// 리사이즈 커서
function getResizeCursor(handle) {
    const cursors = {
        'nw': 'nw-resize',
        'ne': 'ne-resize',
        'sw': 'sw-resize',
        'se': 'se-resize'
    };
    return cursors[handle] || 'default';
}

// 이미지 리사이즈
function resizeImage(img, mouseX, mouseY) {
    if (resizeHandle === 'se') {
        img.width = mouseX - img.x;
        img.height = mouseY - img.y;
    } else if (resizeHandle === 'sw') {
        img.width = img.x + img.width - mouseX;
        img.height = mouseY - img.y;
        img.x = mouseX;
    } else if (resizeHandle === 'ne') {
        img.width = mouseX - img.x;
        img.height = img.y + img.height - mouseY;
        img.y = mouseY;
    } else if (resizeHandle === 'nw') {
        img.width = img.x + img.width - mouseX;
        img.height = img.y + img.height - mouseY;
        img.x = mouseX;
        img.y = mouseY;
    }
    
    // 최소 크기 제한
    img.width = Math.max(20, img.width);
    img.height = Math.max(20, img.height);
}

// 줌
function zoom(factor) {
    scale *= factor;
    scale = Math.max(0.1, Math.min(scale, 10));
    render();
}

// 뷰 리셋
function resetView() {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    render();
}

// 도면에 맞게 뷰 조정
function fitToView() {
    if (!dxfData) return;
    
    // DXF 경계 계산
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    if (dxfData.entities) {
        dxfData.entities.forEach(entity => {
            if (entity.vertices) {
                entity.vertices.forEach(v => {
                    minX = Math.min(minX, v.x);
                    minY = Math.min(minY, v.y);
                    maxX = Math.max(maxX, v.x);
                    maxY = Math.max(maxY, v.y);
                });
            }
            if (entity.startPoint) {
                minX = Math.min(minX, entity.startPoint.x);
                minY = Math.min(minY, entity.startPoint.y);
                maxX = Math.max(maxX, entity.startPoint.x);
                maxY = Math.max(maxY, entity.startPoint.y);
            }
            if (entity.endPoint) {
                minX = Math.min(minX, entity.endPoint.x);
                minY = Math.min(minY, entity.endPoint.y);
                maxX = Math.max(maxX, entity.endPoint.x);
                maxY = Math.max(maxY, entity.endPoint.y);
            }
        });
    }
    
    const dxfWidth = maxX - minX;
    const dxfHeight = maxY - minY;
    
    if (dxfWidth > 0 && dxfHeight > 0) {
        const scaleX = canvas.width / dxfWidth * 0.8;
        const scaleY = canvas.height / dxfHeight * 0.8;
        scale = Math.min(scaleX, scaleY);
        
        offsetX = (canvas.width - dxfWidth * scale) / 2 - minX * scale;
        offsetY = (canvas.height - dxfHeight * scale) / 2 - minY * scale;
    }
}

// 렌더링
function render() {
    // 캔버스 클리어
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 그리드 그리기
    drawGrid();
    
    // DXF 그리기
    if (dxfData) {
        drawDXF();
    }
    
    // 이미지 그리기
    drawImages();
}

// 그리드 그리기
function drawGrid() {
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 1;
    
    const gridSize = 50 * scale;
    const startX = offsetX % gridSize;
    const startY = offsetY % gridSize;
    
    ctx.beginPath();
    for (let x = startX; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = startY; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
}

// DXF 그리기
function drawDXF() {
    if (!dxfData || !dxfData.entities) return;
    
    ctx.save();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1 / scale;
    
    dxfData.entities.forEach(entity => {
        ctx.beginPath();
        
        if (entity.type === 'LINE') {
            const start = toScreen(entity.startPoint.x, entity.startPoint.y);
            const end = toScreen(entity.endPoint.x, entity.endPoint.y);
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();
        } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            if (entity.vertices && entity.vertices.length > 0) {
                const first = toScreen(entity.vertices[0].x, entity.vertices[0].y);
                ctx.moveTo(first.x, first.y);
                for (let i = 1; i < entity.vertices.length; i++) {
                    const point = toScreen(entity.vertices[i].x, entity.vertices[i].y);
                    ctx.lineTo(point.x, point.y);
                }
                if (entity.shape) {
                    ctx.closePath();
                }
                ctx.stroke();
            }
        } else if (entity.type === 'CIRCLE') {
            const center = toScreen(entity.center.x, entity.center.y);
            ctx.arc(center.x, center.y, entity.radius * scale, 0, Math.PI * 2);
            ctx.stroke();
        } else if (entity.type === 'ARC') {
            const center = toScreen(entity.center.x, entity.center.y);
            ctx.arc(center.x, center.y, entity.radius * scale, 
                    entity.startAngle, entity.endAngle);
            ctx.stroke();
        }
    });
    
    ctx.restore();
}

// 이미지 그리기
function drawImages() {
    images.forEach(imgObj => {
        ctx.save();
        
        const screen = toScreen(imgObj.x, imgObj.y);
        const width = imgObj.width * scale;
        const height = imgObj.height * scale;
        
        // 이미지 그리기
        ctx.drawImage(imgObj.img, screen.x, screen.y, width, height);
        
        // 선택된 이미지 표시
        if (imgObj === selectedImage) {
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(screen.x, screen.y, width, height);
            ctx.setLineDash([]);
            
            // 리사이즈 핸들
            drawResizeHandles(screen.x, screen.y, width, height);
        }
        
        ctx.restore();
    });
}

// 리사이즈 핸들 그리기
function drawResizeHandles(x, y, width, height) {
    const handleSize = 8;
    const handles = [
        { x: x, y: y },
        { x: x + width, y: y },
        { x: x, y: y + height },
        { x: x + width, y: y + height }
    ];
    
    ctx.fillStyle = '#667eea';
    handles.forEach(handle => {
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, 
                     handleSize, handleSize);
    });
}

// 월드 좌표를 스크린 좌표로 변환
function toScreen(x, y) {
    return {
        x: x * scale + offsetX,
        y: y * scale + offsetY
    };
}

// 이미지 카운트 업데이트
function updateImageCount() {
    document.getElementById('imageCount').textContent = `${images.length}개`;
}

// 이미지로 저장
function saveAsImage() {
    const link = document.createElement('a');
    link.download = 'dxf-with-photos.png';
    link.href = canvas.toDataURL();
    link.click();
}

// 전체 지우기
function clearAll() {
    if (confirm('모든 내용을 지우시겠습니까?')) {
        dxfData = null;
        images = [];
        currentImage = null;
        selectedImage = null;
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        
        document.getElementById('fileName').textContent = '파일을 선택하세요';
        document.getElementById('modeInfo').textContent = 'DXF 파일을 업로드하세요';
        document.querySelector('.instructions').classList.remove('hidden');
        
        updateImageCount();
        render();
    }
}

