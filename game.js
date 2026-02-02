// 游戏状态
let gameState = {
    score: 0,
    shots: 0,
    hits: 0,
    isPlaying: false,
    handDetected: false,
    isAiming: false
};

// Three.js 场景设置
let scene, camera, renderer;
let targets = [];
let bullets = [];
let crosshair;
let aimingLine; // 瞄准辅助线

// Hand Detection
let detector;
let debugCanvas;
let debugCtx;
let animationFrameId;

// 手势状态
let handLandmarks = null;
let lastIndexFingerY = null;
let shootingThreshold = 0.05; // 射击阈值

// 初始化
async function init() {
    setupThreeJS();
    setupDebugCanvas();
    await setupHandDetection();
    setupEventListeners();
    createTargets();
    animate();
}

// 设置Three.js场景
function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    // 相机
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 5);

    // 渲染器
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // 灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // 创建地面
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d2d44,
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // 创建瞄准辅助线（虚线）- 黄色更显眼
    const lineMaterial = new THREE.LineDashedMaterial({
        color: 0xffff00,  // 改为黄色
        linewidth: 3,
        scale: 1,
        dashSize: 0.8,    // 增大虚线段
        gapSize: 0.4
    });

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -50)
    ]);

    aimingLine = new THREE.Line(lineGeometry, lineMaterial);
    aimingLine.computeLineDistances();
    aimingLine.visible = false; // 默认隐藏
    scene.add(aimingLine);

    // 创建准星
    createCrosshair();
}

// 创建准星
function createCrosshair() {
    const crosshairGroup = new THREE.Group();

    // 水平线
    const hGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.1, 0, -0.5),
        new THREE.Vector3(0.1, 0, -0.5)
    ]);
    const hLine = new THREE.Line(hGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(hLine);

    // 垂直线
    const vGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.1, -0.5),
        new THREE.Vector3(0, 0.1, -0.5)
    ]);
    const vLine = new THREE.Line(vGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(vLine);

    // 中心点
    const dotGeometry = new THREE.CircleGeometry(0.01, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.z = -0.5;
    crosshairGroup.add(dot);

    camera.add(crosshairGroup);
    crosshair = crosshairGroup;
}

// 创建靶子（单个大球）
function createTargets() {
    // 创建一个大的发光球体作为目标
    const ballGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6b6b,
        emissive: 0xff0000,
        emissiveIntensity: 0.3,
        metalness: 0.3,
        roughness: 0.7
    });

    const ball = new THREE.Mesh(ballGeometry, ballMaterial);
    ball.position.set(0, 2, -10); // 放在前方10单位，高度2
    ball.castShadow = true;
    ball.userData = {
        isHit: false,
        hitTime: 0
    };
    scene.add(ball);
    targets.push(ball);

    console.log('目标球已创建:', ball.position);
}



// 设置调试画布
function setupDebugCanvas() {
    debugCanvas = document.getElementById('debug-canvas');
    if (debugCanvas) {
        debugCtx = debugCanvas.getContext('2d');
        debugCanvas.width = 320;
        debugCanvas.height = 240;
        debugCanvas.style.position = 'absolute';
        debugCanvas.style.top = '20px';
        debugCanvas.style.right = '20px';
        debugCanvas.style.zIndex = '11';
        debugCanvas.style.border = '2px solid rgba(255, 255, 255, 0.5)';
        debugCanvas.style.borderRadius = '10px';
        debugCanvas.style.transform = 'scaleX(-1)';
    }
}

// 设置手势检测 - 使用TensorFlow.js HandPose
async function setupHandDetection() {
    const videoElement = document.getElementById('video');

    // 获取摄像头流
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;

        // 等待视频加载完成
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });

        updateHandStatus('摄像头已启动，正在加载模型...');
    } catch (err) {
        console.error('无法访问摄像头:', err);
        updateHandStatus('无法访问摄像头，请检查权限');
        return;
    }

    // 等待TensorFlow.js库加载完成
    let retries = 0;
    const maxRetries = 100;

    while (typeof handPoseDetection === 'undefined' && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (typeof handPoseDetection === 'undefined') {
        console.error('TensorFlow.js HandPose库未加载');
        updateHandStatus('HandPose库加载失败，请检查网络连接');
        return;
    }

    // 使用TensorFlow.js HandPose
    try {
        updateHandStatus('正在初始化模型...');

        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'tfjs',
            maxHands: 1,
            modelType: 'full'
        };

        detector = await handPoseDetection.createDetector(model, detectorConfig);
        console.log('HandPose模型已加载');
        updateHandStatus('✅ 模型已加载，等待检测手势...');

        // 开始检测循环
        detectHands();
    } catch (err) {
        console.error('HandPose初始化错误:', err);
        updateHandStatus('模型加载失败: ' + err.message);
        console.error('详细错误:', err);
    }
}

// 持续检测手势
async function detectHands() {
    const videoElement = document.getElementById('video');

    async function detect() {
        if (detector && videoElement.readyState >= 2) {
            try {
                const hands = await detector.estimateHands(videoElement);
                processHandResults(hands);
            } catch (err) {
                console.error('手势检测错误:', err);
            }
        }

        requestAnimationFrame(detect);
    }

    detect();
}

// 处理手势检测结果 - 将TensorFlow格式转换为类似MediaPipe的格式
function processHandResults(hands) {
    const video = document.getElementById('video');

    // 绘制调试信息
    if (debugCtx) {
        debugCtx.save();
        debugCtx.scale(-1, 1);
        debugCtx.translate(-debugCanvas.width, 0);
        debugCtx.drawImage(video, 0, 0, debugCanvas.width, debugCanvas.height);
        debugCtx.restore();
    }

    // 关键修复：添加置信度检查和视频尺寸验证
    if (hands && hands.length > 0) {
        const hand = hands[0];

        // 修复1: 检查hand是否有足够的置信度（score），避免误检测
        const handScore = hand.score || 0;
        if (handScore < 0.7) {
            // 置信度不够，不处理
            handLandmarks = null;
            gameState.handDetected = false;
            updateHandStatus('等待检测手势...');
            return;
        }

        // 修复2: 检查video尺寸是否有效，避免除以0导致NaN
        if (!video.videoWidth || !video.videoHeight) {
            console.warn('Video dimensions not ready:', video.videoWidth, video.videoHeight);
            return;
        }

        // 转换TensorFlow格式到归一化坐标 (0-1范围，与MediaPipe格式一致)
        handLandmarks = hand.keypoints.map(kp => ({
            x: kp.x / video.videoWidth,
            y: kp.y / video.videoHeight,
            z: kp.z || 0
        }));

        gameState.handDetected = true;
        updateHandStatus('✅ 手势已检测 (置信度: ' + Math.round(handScore * 100) + '%' + ')');

        // 绘制手部关键点
        if (debugCtx && handLandmarks) {
            debugCtx.save();
            debugCtx.scale(-1, 1);
            debugCtx.translate(-debugCanvas.width, 0);
            debugCtx.strokeStyle = '#00FF00';
            debugCtx.fillStyle = '#00FF00';
            debugCtx.lineWidth = 2;

            handLandmarks.forEach((landmark) => {
                const x = landmark.x * debugCanvas.width;
                const y = landmark.y * debugCanvas.height;
                debugCtx.beginPath();
                debugCtx.arc(x, y, 3, 0, 2 * Math.PI);
                debugCtx.fill();
            });

            debugCtx.restore();
        }

        // 简化版：用手的位置直接控制相机
        gameState.isAiming = true;
        const indexTip = handLandmarks[8]; // 食指尖端

        if (indexTip && gameState.isPlaying) {
            // 将手部位置映射到相机旋转
            const targetRotationY = (0.5 - indexTip.x) * Math.PI / 2; // 左右 ±45度
            const targetRotationX = (indexTip.y - 0.5) * Math.PI / 3; // 上下 ±30度

            // 修复3: 添加NaN检查，防止无效值破坏相机矩阵
            if (!isNaN(targetRotationY) && !isNaN(targetRotationX) &&
                isFinite(targetRotationY) && isFinite(targetRotationX)) {
                // 平滑过渡
                camera.rotation.y += (targetRotationY - camera.rotation.y) * 0.1;
                camera.rotation.x += (targetRotationX - camera.rotation.x) * 0.1;
            }

            // 显示瞄准线
            if (aimingLine) {
                aimingLine.visible = true;
                aimingLine.position.copy(camera.position);
                aimingLine.quaternion.copy(camera.quaternion);
            }

            updateAimStatus('🎯 瞄准中... (空格键射击)', 'aiming');
        }
    } else {
        handLandmarks = null;
        gameState.handDetected = false;
        gameState.isAiming = false;
        updateHandStatus('等待检测手势...');
        updateAimStatus('');

        // 隐藏瞄准线
        if (aimingLine) aimingLine.visible = false;

        // 清除调试画布
        if (debugCtx) {
            debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
        }
    }
}

// 检测是否是"枪"的手势（食指和拇指伸直，其他手指弯曲）
function isGunGesture(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // 计算两点之间的距离
    const distance = (p1, p2) => {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    };

    // 获取关键点
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const thumbMCP = landmarks[2];
    const indexTip = landmarks[8];
    const indexDIP = landmarks[7];
    const indexPIP = landmarks[6];
    const indexMCP = landmarks[5];
    const middleTip = landmarks[12];
    const middlePIP = landmarks[10];
    const middleMCP = landmarks[9];
    const ringTip = landmarks[16];
    const ringPIP = landmarks[14];
    const pinkyTip = landmarks[20];
    const pinkyPIP = landmarks[18];

    // 食指：计算从指根到指尖的距离，检查是否伸直
    const indexLength = distance(indexMCP, indexTip);
    const indexBendDist = distance(indexMCP, indexPIP) + distance(indexPIP, indexDIP) + distance(indexDIP, indexTip);
    const indexExtended = indexBendDist / indexLength < 1.4; // 放宽阈值，更容易识别

    // 拇指：检查是否伸展开
    const thumbLength = distance(thumbMCP, thumbTip);
    const thumbExtended = thumbLength > 0.06; // 降低阈值，更容易识别

    // 中指、无名指、小指：检查是否弯曲（指尖距离手腕比指根距离手腕更远说明弯曲）
    const middleWristDist = distance(wrist, middleTip);
    const middleMCPWristDist = distance(wrist, middleMCP);
    const middleBent = middleWristDist < middleMCPWristDist + 0.05;

    const ringWristDist = distance(wrist, ringTip);
    const ringMCPWristDist = distance(wrist, landmarks[13]);
    const ringBent = ringWristDist < ringMCPWristDist + 0.05;

    const pinkyWristDist = distance(wrist, pinkyTip);
    const pinkyMCPWristDist = distance(wrist, landmarks[17]);
    const pinkyBent = pinkyWristDist < pinkyMCPWristDist + 0.05;

    // 枪的手势：食指伸直，拇指伸展，中指、无名指、小指弯曲
    // 放宽判断条件，至少两个手指弯曲即可
    const bentFingers = [middleBent, ringBent, pinkyBent].filter(b => b).length;
    const isGun = indexExtended && thumbExtended && bentFingers >= 2;

    // 调试输出
    if (window.debugGesture) {
        console.log('Gesture Debug:', {
            indexExtended,
            thumbExtended,
            bentFingers,
            isGun
        });
    }

    return isGun;
}

// 处理瞄准
function handleAiming() {
    if (!handLandmarks || !gameState.isPlaying || handLandmarks.length < 21) {
        // 隐藏瞄准线
        if (aimingLine) aimingLine.visible = false;
        return;
    }

    const indexTip = handLandmarks[8];
    if (!indexTip) {
        if (aimingLine) aimingLine.visible = false;
        return;
    }

    // 显示并更新瞄准线位置
    if (aimingLine) {
        aimingLine.visible = true;
        aimingLine.position.copy(camera.position);
        aimingLine.quaternion.copy(camera.quaternion);
    }

    // 检测射击动作（食指快速向上移动）
    if (lastIndexFingerY !== null) {
        const deltaY = lastIndexFingerY - indexTip.y;

        if (deltaY > shootingThreshold) {
            shoot();
            updateAimStatus('射击！', 'shooting');
            setTimeout(() => {
                if (gameState.isAiming) {
                    updateAimStatus('🎯 瞄准中...', 'aiming');
                }
            }, 200);
        }
    }

    lastIndexFingerY = indexTip.y;
}

// 射击
function shoot() {
    if (!gameState.isPlaying) return;

    gameState.shots++;
    updateScore();

    // 创建子弹
    const bullet = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );

    bullet.position.copy(camera.position);
    bullet.position.y -= 0.2;

    // 计算射击方向（从相机向前）
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);

    bullet.userData = {
        velocity: direction.multiplyScalar(0.5),
        lifetime: 0
    };

    scene.add(bullet);
    bullets.push(bullet);
}

// 检查是否击中靶子（修复版：球体碰撞，支持简化球体和复杂模型）
function checkHit(bullet) {
    // 修复4: 使用球体碰撞检测，更适合简化版红球目标
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];

        // 跳过已经击中的目标
        if (target.userData.isHit) continue;

        // 计算子弹和目标之间的距离
        const distance = bullet.position.distanceTo(target.position);

        // 如果距离小于目标半径（1.5），则击中
        if (distance < 1.5) {
            // 击中！计算得分（根据距离）
            let points = 0;
            if (distance < 0.5) {
                points = 100; // 正中心
            } else if (distance < 0.8) {
                points = 75;
            } else if (distance < 1.2) {
                points = 50;
            } else {
                points = 25;
            }

            gameState.score += points;
            gameState.hits++;
            target.userData.isHit = true;

            // 变绿色表示击中（支持简化版和复杂版）
            if (target.material) {
                // 简化版：直接修改target.material
                target.material.emissive = new THREE.Color(0x00ff00);
                target.material.emissiveIntensity = 0.8;
            }

            if (target.children && target.children.length > 0) {
                // 复杂版：修改children的material
                target.children.forEach(child => {
                    if (child.material) {
                        child.material.emissive = new THREE.Color(0x00ff00);
                        child.material.emissiveIntensity = 0.8;
                    }
                });
            }

            // 1秒后变回红色并重置
            setTimeout(() => {
                if (target.material) {
                    target.material.emissive = new THREE.Color(0xff0000);
                    target.material.emissiveIntensity = 0.3;
                }
                if (target.children && target.children.length > 0) {
                    target.children.forEach(child => {
                        if (child.material) {
                            child.material.emissive = new THREE.Color(0xff0000);
                            child.material.emissiveIntensity = 0.3;
                        }
                    });
                }
                target.userData.isHit = false;
            }, 1000);

            updateScore();

            // 移除子弹
            const bulletIndex = bullets.indexOf(bullet);
            if (bulletIndex > -1) {
                scene.remove(bullet);
                bullets.splice(bulletIndex, 1);
            }

            // 已找到击中，退出循环
            return;
        }
    }
}

// 更新分数显示
function updateScore() {
    document.getElementById('score').textContent = gameState.score;
    const accuracy = gameState.shots > 0
        ? Math.round((gameState.hits / gameState.shots) * 100)
        : 0;
    document.getElementById('accuracy').textContent = `准确率: ${accuracy}%`;
    document.getElementById('shots').textContent = `射击次数: ${gameState.shots}`;
}

// 更新手势状态显示
function updateHandStatus(text) {
    const statusEl = document.getElementById('hand-status');
    statusEl.textContent = text;
    statusEl.className = gameState.handDetected ? 'hand-detected' : '';
}

// 更新瞄准状态显示
function updateAimStatus(text, className = '') {
    const statusEl = document.getElementById('aim-status');
    statusEl.textContent = text;
    statusEl.className = className;
}

// 设置事件监听
function setupEventListeners() {
    // 空格键射击（如果游戏进行中）或开始游戏
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();

            // 如果游戏正在进行且检测到手，则射击
            if (gameState.isPlaying && handLandmarks) {
                shoot();
            } else if (!gameState.isPlaying) {
                // 否则开始游戏
                toggleGame();
            }
        }
    });

    // 窗口大小调整
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// 切换游戏状态
function toggleGame() {
    gameState.isPlaying = !gameState.isPlaying;

    if (gameState.isPlaying) {
        if (gameState.handDetected) {
            updateHandStatus('游戏进行中...');
        } else {
            updateHandStatus('游戏进行中...（等待检测手势）');
        }
        // 重置所有靶子
        targets.forEach(target => {
            target.userData.isHit = false;
        });
    } else {
        updateHandStatus('游戏已暂停');
        updateAimStatus('按空格键继续');
    }
}

// 动画循环
function animate() {
    requestAnimationFrame(animate);

    // 更新子弹并检查碰撞
    bullets.forEach((bullet, index) => {
        bullet.position.add(bullet.userData.velocity);
        bullet.userData.lifetime++;

        // 检查是否击中靶子
        checkHit(bullet);

        // 移除超出范围的子弹
        if (bullet.userData.lifetime > 100 || bullet.position.z < -20) {
            scene.remove(bullet);
            bullets.splice(index, 1);
        }
    });

    // 旋转靶子（如果未被击中）
    targets.forEach(target => {
        if (!target.userData.isHit) {
            target.rotation.z += 0.01;
        }
    });

    renderer.render(scene, camera);
}

// 启动游戏
init();
