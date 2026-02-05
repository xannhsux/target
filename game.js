// ES6 Module Imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Make THREE available globally for debugging
window.THREE = THREE;

// Game State
let gameState = {
    score: 0,
    shots: 0, // Hit attempts
    hits: 0,
    isPlaying: false,
    handDetected: false,
    isAiming: false,
    isPunching: false
};

// Three.js Scene Setup
let scene, camera, renderer;
let controls; // OrbitControls for mouse interaction
let punchingBag; // Replacing targets array
let targets = []; // Compatibility array for old code
let bullets = []; // Keep for compat, no longer used
let aimingLine;
let crosshair; // Crosshair group attached to camera
let audioCtx;

// Hand Detection
let detector;
let debugCanvas;
let debugCtx;
let animationFrameId;

// Gesture State
let handStates = {
    'Left': { lastSize: null, lastPunchTime: 0 },
    'Right': { lastSize: null, lastPunchTime: 0 }
}; // Stable tracking using Left/Right labels to avoid index swapping
let punchSizeThreshold = 0.04;
let lastPunchTime = 0;

// Custom Photo Target
let customPhotoTexture = null;
let customTargetMesh = null;
let usingCustomTarget = false;

// Cancer Cell Particle Target
let cellParticles = []; // Active particles from cell explosions
let cellTarget = null; // The organic cell sphere
let usingCellTarget = false;
let targetType = 'rabbit'; // 'rabbit', 'photo', or 'cell'

// Initialization
async function init() {
    setupThreeJS();
    setupDebugCanvas();
    await setupHandDetection();
    setupEventListeners();
    createTargets();
    createCellTarget(); // Create the cancer cell target
    animate();
}

// Setup Three.js Scene
function setupThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Pure black background

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.set(0, 1.6, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // CRITICAL: Set pixel ratio for high-DPI displays (Retina, etc.)
    // This makes textures much sharper on modern displays
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for performance

    renderer.shadowMap.enabled = true;

    // Lights - Enhanced for better rabbit visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // Increased ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Increased intensity
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Add a second light from the front for better visibility
    const frontLight = new THREE.DirectionalLight(0xffffff, 0.6);
    frontLight.position.set(0, 5, 10);
    scene.add(frontLight);

    // Create Floor
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000, // Black floor to match background
        roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create Aiming Guide Line (Dashed) - Yellow is more visible
    const lineMaterial = new THREE.LineDashedMaterial({
        color: 0xffff00,
        linewidth: 3,
        scale: 1,
        dashSize: 0.8,
        gapSize: 0.4
    });

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -50)
    ]);

    aimingLine = new THREE.Line(lineGeometry, lineMaterial);
    aimingLine.computeLineDistances();
    aimingLine.visible = false; // Hidden by default
    scene.add(aimingLine);

    // Setup OrbitControls for mouse interaction
    controls = new OrbitControls(camera, renderer.domElement);

    // Configure controls
    controls.enableDamping = true; // Smooth camera movements
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; // Don't allow panning up/down

    // Zoom limits
    controls.minDistance = 2; // Minimum zoom (closer)
    controls.maxDistance = 15; // Maximum zoom (farther)

    // Rotation limits (prevent flipping upside down)
    controls.minPolarAngle = Math.PI / 4; // 45 degrees from top
    controls.maxPolarAngle = Math.PI / 2; // 90 degrees (horizon)

    // Target point (what the camera looks at)
    controls.target.set(0, 1.5, -5); // Look at target area

    controls.update();

    console.log('🖱️ Mouse controls enabled: Drag to rotate, Scroll to zoom');

    // Create Crosshair
    createCrosshair();
}

// Create Crosshair
function createCrosshair() {
    const crosshairGroup = new THREE.Group();

    // Horizontal line
    const hGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.1, 0, -0.5),
        new THREE.Vector3(0.1, 0, -0.5)
    ]);
    const hLine = new THREE.Line(hGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(hLine);

    // Vertical line
    const vGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.1, -0.5),
        new THREE.Vector3(0, 0.1, -0.5)
    ]);
    const vLine = new THREE.Line(vGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    crosshairGroup.add(vLine);

    // Center point
    const dotGeometry = new THREE.CircleGeometry(0.01, 8);
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.z = -0.5;
    crosshairGroup.add(dot);

    camera.add(crosshairGroup);
    crosshair = crosshairGroup;
}

// Create Punching Target (Rabbit GLB Model)
function createTargets() {
    const loader = new GLTFLoader();

    loader.load(
        'rabbit.glb',
        function (gltf) {
            // Successfully loaded the rabbit model
            const rabbitModel = gltf.scene;

            // Mark this as the rabbit target (important for target switching)
            rabbitModel.userData.isRabbitTarget = true;

            // Scale and position the rabbit
            rabbitModel.scale.set(2, 2, 2); // Adjust size as needed
            rabbitModel.position.set(0, 2, -5); // Position in front of camera

            // Enable shadows
            rabbitModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });

            scene.add(rabbitModel);
            punchingBag = rabbitModel;

            // Compatibility with old detection code
            targets = [rabbitModel];

            console.log('✅ Rabbit model loaded successfully!');
        },
        function (xhr) {
            // Loading progress
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function (error) {
            // Error loading model
            console.error('❌ Error loading rabbit.glb:', error);

            // Fallback: create a simple cube as placeholder
            const fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0xff00ff });
            const fallbackMesh = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
            fallbackMesh.position.set(0, 2, -5);
            scene.add(fallbackMesh);
            punchingBag = fallbackMesh;
            targets = [fallbackMesh];
        }
    );
}

// Create Cancer Cell Target (Particle Cloud)
function createCellTarget() {
    // Create a group to hold all the particles
    const particleGroup = new THREE.Group();
    particleGroup.position.set(0, 2, -5);

    // Number of particles forming the initial cloud
    const particleCount = 800; // More particles for denser cloud
    const cloudRadius = 1.5; // Radius of the particle cloud

    // Store particle meshes for animation
    const cloudParticles = [];

    for (let i = 0; i < particleCount; i++) {
        // Create varying particle sizes for depth
        const size = 0.02 + Math.random() * 0.06; // Very small particles: 0.02-0.08
        const particleGeometry = new THREE.SphereGeometry(size, 4, 4);

        // Color variation for organic look
        const colorChoice = Math.random();
        let particleColor;
        if (colorChoice < 0.3) {
            particleColor = 0xff69b4; // Hot pink
        } else if (colorChoice < 0.6) {
            particleColor = 0xff1493; // Deep pink
        } else if (colorChoice < 0.8) {
            particleColor = 0xda70d6; // Orchid
        } else {
            particleColor = 0xffc0cb; // Light pink
        }

        const particleMaterial = new THREE.MeshBasicMaterial({
            color: particleColor,
            transparent: true,
            opacity: 0.6 + Math.random() * 0.4, // Varying opacity
        });

        const particle = new THREE.Mesh(particleGeometry, particleMaterial);

        // Random position within a sphere (using spherical coordinates)
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.pow(Math.random(), 0.7) * cloudRadius; // Denser in center

        particle.position.x = r * Math.sin(phi) * Math.cos(theta);
        particle.position.y = r * Math.sin(phi) * Math.sin(theta);
        particle.position.z = r * Math.cos(phi);

        // Store animation data for floating effect
        particle.userData = {
            originalPos: particle.position.clone(),
            floatSpeed: 0.3 + Math.random() * 0.5,
            floatOffset: Math.random() * Math.PI * 2,
            floatRadius: 0.05 + Math.random() * 0.1
        };

        particleGroup.add(particle);
        cloudParticles.push(particle);
    }

    // Store the group
    cellTarget = particleGroup;
    cellTarget.userData.cloudParticles = cloudParticles;
    cellTarget.userData.isParticleCloud = true;
    cellTarget.visible = false;

    scene.add(particleGroup);
    console.log('🦠 Particle cloud cell target created with', particleCount, 'particles!');
}



// Initialize Audio
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        console.log('🔊 AudioContext created, state:', audioCtx.state);
    }

    // CRITICAL for mobile: Resume audio context if suspended
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => {
            console.log('🔊 AudioContext resumed successfully');
        }).catch(err => {
            console.error('❌ Failed to resume AudioContext:', err);
        });
    }

    return audioCtx;
}

// Create Particle Explosion when Cell is Hit
function createCellExplosion(hitPosition, punchDirection) {
    if (!cellTarget || !cellTarget.userData.cloudParticles) return;

    // Get the existing cloud particles
    const cloudParticles = cellTarget.userData.cloudParticles;

    // Hide the cell target group
    cellTarget.visible = false;

    // Get world position of the cloud
    const cloudWorldPos = new THREE.Vector3();
    cellTarget.getWorldPosition(cloudWorldPos);

    // Transfer particles from group to scene and give them explosion velocities
    cloudParticles.forEach(particle => {
        // Get particle's world position before removing from group
        const worldPos = new THREE.Vector3();
        particle.getWorldPosition(worldPos);

        // Remove from group
        cellTarget.remove(particle);

        // Set absolute position
        particle.position.copy(worldPos);

        // Add to scene
        scene.add(particle);

        // Calculate explosion direction from center
        const particleDir = new THREE.Vector3()
            .subVectors(particle.position, cloudWorldPos)
            .normalize();

        // Mix with punch direction
        const punchInfluence = 0.4;
        const explosionDir = particleDir
            .multiplyScalar(1 - punchInfluence)
            .add(punchDirection.clone().multiplyScalar(punchInfluence))
            .normalize();

        // Add some randomness
        explosionDir.add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * 0.3
        )).normalize();

        // Velocity based on distance from center (outer particles fly faster)
        const distanceFromCenter = particle.position.distanceTo(cloudWorldPos);
        const baseSpeed = 2 + distanceFromCenter * 1.5;
        const speed = baseSpeed + Math.random() * 2;

        // Store explosion physics data
        particle.userData.velocity = explosionDir.multiplyScalar(speed);
        particle.userData.lifetime = 0;
        particle.userData.maxLifetime = 1.5 + Math.random() * 1.5;
        particle.userData.originalOpacity = particle.material.opacity;
        particle.userData.damping = 0.96;

        // Add to active particles list
        cellParticles.push(particle);
    });

    console.log(`💥 Particle cloud exploded! ${cloudParticles.length} particles dispersing!`);

    // Respawn cell after delay (quick respawn for continuous action!)
    setTimeout(() => {
        if (targetType === 'cell') {
            respawnCellTarget();
        }
    }, 600); // Fast respawn - only 0.6 seconds!
}



// Respawn Cell Target
function respawnCellTarget() {
    if (!cellTarget) return;

    // Clear any remaining particles
    cellParticles.forEach(particle => {
        scene.remove(particle);
        if (particle.geometry) particle.geometry.dispose();
        if (particle.material) particle.material.dispose();
    });
    cellParticles = [];

    // Recreate the cell (with new random deformation)
    scene.remove(cellTarget);
    if (cellTarget.geometry) cellTarget.geometry.dispose();
    if (cellTarget.material) cellTarget.material.dispose();

    createCellTarget();

    // Show the cell if it's still the active target
    if (targetType === 'cell') {
        cellTarget.visible = true;
        punchingBag = cellTarget;
    }

    console.log('🔄 Cell target respawned!');
}

// Update Particles (called every frame)
function updateParticles(deltaTime) {
    for (let i = cellParticles.length - 1; i >= 0; i--) {
        const particle = cellParticles[i];

        // Update lifetime
        particle.userData.lifetime += deltaTime;

        // Update position based on velocity
        particle.position.add(
            particle.userData.velocity.clone().multiplyScalar(deltaTime)
        );

        // Apply damping (gradual slowdown)
        particle.userData.velocity.multiplyScalar(particle.userData.damping);

        // Apply gravity (slight downward pull for organic feel)
        particle.userData.velocity.y -= 2 * deltaTime;

        // Fade out based on lifetime
        const lifeRatio = particle.userData.lifetime / particle.userData.maxLifetime;
        if (lifeRatio > 0.7) {
            // Start fading in last 30% of lifetime
            const fadeAmount = 1 - ((lifeRatio - 0.7) / 0.3);
            particle.material.opacity = particle.userData.originalOpacity * fadeAmount;
        }

        // Remove particle if lifetime exceeded
        if (particle.userData.lifetime >= particle.userData.maxLifetime) {
            scene.remove(particle);
            if (particle.geometry) particle.geometry.dispose();
            if (particle.material) particle.material.dispose();
            cellParticles.splice(i, 1);
        }
    }
}


// Play hit sound
async function playPunchSound() {
    // Initialize audio if not already done
    if (!audioCtx) {
        initAudio();
    }

    // CRITICAL: Aggressively resume audio context on EVERY sound play attempt (for mobile)
    if (audioCtx.state !== 'running') {
        try {
            await audioCtx.resume();
            console.log('🔊 Audio context resumed for sound, state:', audioCtx.state);
        } catch (err) {
            console.error('❌ Failed to resume audio for sound:', err);
            return; // Can't play sound if context won't resume
        }
    }

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);

        // Secondary high-freq sound for impact
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain2.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.05);
    } catch (err) {
        console.error('❌ Error playing punch sound:', err);
    }
}

// Setup Debug Canvas
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

// Setup Hand Detection - Using TensorFlow.js HandPose
async function setupHandDetection() {
    const videoElement = document.getElementById('video');

    // Get camera stream
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });
        videoElement.srcObject = stream;

        // Wait for video to load
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });

        updateHandStatus('Camera started, loading model...');
    } catch (err) {
        console.error('Failed to access camera:', err);
        updateHandStatus('Camera access failed, please check permissions');
        return;
    }

    // Wait for TF.js libraries
    let retries = 0;
    const maxRetries = 100;

    while (typeof handPoseDetection === 'undefined' && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }

    if (typeof handPoseDetection === 'undefined') {
        console.error('TF.js HandPose library not loaded');
        updateHandStatus('HandPose library failed to load, check network');
        return;
    }

    // Use TF.js HandPose (MediaPipe Runtime)
    try {
        updateHandStatus('Initializing model (MediaPipe)...');

        const model = handPoseDetection.SupportedModels.MediaPipeHands;
        const detectorConfig = {
            runtime: 'mediapipe',
            maxHands: 2,
            modelType: 'full',
            solutionPath: `https://cdn.jsdelivr.net/npm/@mediapipe/hands`
        };

        detector = await handPoseDetection.createDetector(model, detectorConfig);
        console.log('HandPose Model (MediaPipe) loaded');
        updateHandStatus('✅ Model loaded, waiting for gestures...');

        // Start detection loop
        detectHands();
    } catch (err) {
        console.error('HandPose (MediaPipe) init error:', err);
        updateHandStatus('Model failed to load: ' + err.message);
    }
}

// Continuous Hand Detection
async function detectHands() {
    const videoElement = document.getElementById('video');

    async function detect() {
        if (detector && videoElement.readyState >= 2) {
            try {
                const hands = await detector.estimateHands(videoElement);
                processHandResults(hands);
            } catch (err) {
                console.error('Hand detection error:', err);
            }
        }

        requestAnimationFrame(detect);
    }

    detect();
}

// Process detection results - map TF format to MediaPipe-like format
function processHandResults(hands) {
    const video = document.getElementById('video');

    // Draw video to debug canvas
    if (debugCtx) {
        debugCtx.save();
        debugCtx.scale(-1, 1);
        debugCtx.translate(-debugCanvas.width, 0);
        debugCtx.drawImage(video, 0, 0, debugCanvas.width, debugCanvas.height);
        debugCtx.restore();
    }

    if (hands && hands.length > 0) {
        gameState.handDetected = true;
        let totalHands = hands.length;
        let fistsReady = 0;

        // Process each hand
        hands.forEach((hand) => {
            const handScore = hand.score || 0;
            if (handScore < 0.6) return;

            // Get handedness (Left/Right)
            const label = hand.handedness && hand.handedness[0] ? hand.handedness[0].label : 'Right';

            // Convert coordinates
            const landmarks = hand.keypoints.map(kp => ({
                x: kp.x / video.videoWidth,
                y: kp.y / video.videoHeight,
                z: kp.z || 0
            }));

            // Draw landmarks for debugging
            if (debugCtx) {
                debugCtx.save();
                debugCtx.scale(-1, 1);
                debugCtx.translate(-debugCanvas.width, 0);
                // Use distinct colors for Left/Right hands
                debugCtx.strokeStyle = label === 'Left' ? '#FF3B30' : '#007AFF';
                debugCtx.fillStyle = label === 'Left' ? '#FF3B30' : '#007AFF';
                debugCtx.lineWidth = 2;
                landmarks.forEach((landmark) => {
                    const x = landmark.x * debugCanvas.width;
                    const y = landmark.y * debugCanvas.height;
                    debugCtx.beginPath();
                    debugCtx.arc(x, y, 3, 0, 2 * Math.PI);
                    debugCtx.fill();
                });
                debugCtx.restore();
            }

            // Punching logic
            if (gameState.isPlaying) {
                // If Right hand (or only one hand), control camera rotation
                if (label === 'Right' || totalHands === 1) {
                    const wrist = landmarks[0];
                    const targetRotationY = (0.5 - wrist.x) * Math.PI / 3;
                    const targetRotationX = (wrist.y - 0.5) * Math.PI / 4;
                    if (!isNaN(targetRotationY) && !isNaN(targetRotationX)) {
                        camera.rotation.y += (targetRotationY - camera.rotation.y) * 0.1;
                        camera.rotation.x += (targetRotationX - camera.rotation.x) * 0.1;
                    }
                }

                if (checkIsFist(landmarks)) fistsReady++;
                detectPunchAction(landmarks, label);
            }
        });

        // Update status text
        if (fistsReady > 0) {
            updateHandStatus(`✊ ${fistsReady} Fist(s) Ready! PUNCH!`);
        } else {
            updateHandStatus('✋ Clench your fist...');
        }
    } else {
        gameState.handDetected = false;
        gameState.isAiming = false;
        updateHandStatus('Waiting for gesture...');
        if (debugCtx) debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    }
}

// Check if a hand is clenched in a fist
function checkIsFist(landmarks) {
    if (!landmarks || landmarks.length < 21) return false;

    // Calculate distance from fingertips to wrist
    const distance = (p1, p2) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
    const wrist = landmarks[0];
    const fingerTips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky tips
    const knuckles = [5, 9, 13, 17]; // MCP nodes

    let collapsedCount = 0;
    for (let i = 0; i < fingerTips.length; i++) {
        const tipDist = distance(wrist, landmarks[fingerTips[i]]);
        const knuckleDist = distance(wrist, landmarks[knuckles[i]]);

        // If tip is closer to wrist than knuckle, the finger is curled
        if (tipDist < knuckleDist * 1.3) collapsedCount++;
    }

    return collapsedCount >= 3;
}

// Detect Punch Gesture (based on size surge)
function detectPunchAction(landmarks, handLabel = 'Right') {
    const wrist = landmarks[0];
    const indexMCP = landmarks[5];
    const currentSize = Math.sqrt(Math.pow(indexMCP.x - wrist.x, 2) + Math.pow(indexMCP.y - wrist.y, 2));

    const state = handStates[handLabel];
    if (state && state.lastSize !== null) {
        const deltaSize = currentSize - state.lastSize;
        const now = Date.now();

        // Use 0.04 threshold to require deliberate forward movement
        if (deltaSize > 0.04 && now - state.lastPunchTime > 500) {
            handlePunch();
            state.lastPunchTime = now;
        }
    }
    if (state) state.lastSize = currentSize;
}

// Handle Punch (Guaranteed Hit logic)
function handlePunch() {
    gameState.shots++;
    updateScore();
    updateAimStatus('🥊 ATTACK!', 'shooting');

    // Trigger hit effect immediately upon punch detection
    onBagHit();

    setTimeout(() => {
        if (gameState.isPlaying) updateAimStatus('');
    }, 300);
}

// Handle Bag Hit
function onBagHit() {
    gameState.score += 50;
    gameState.hits++;
    updateScore();
    playPunchSound();

    // Check if we're hitting the cell target
    if (targetType === 'cell' && cellTarget && cellTarget.visible) {
        // Create particle explosion for cell target
        const hitPosition = cellTarget.position.clone();

        // Calculate punch direction (from camera towards target)
        const punchDirection = new THREE.Vector3();
        punchDirection.subVectors(cellTarget.position, camera.position).normalize();

        // Trigger explosion
        createCellExplosion(hitPosition, punchDirection);

        return; // Skip normal animation for cell target
    }

    // Bag animation: Tilt back (for rabbit and photo targets)
    if (punchingBag) {
        punchingBag.rotation.x = -Math.PI / 8;
        punchingBag.userData.velocity = 0.2;

        // Different visual feedback for custom photo vs default model
        if (usingCustomTarget) {
            // For custom photo: Use scale pulse instead of color flash
            const originalScale = punchingBag.scale.clone();

            // Quick shrink
            punchingBag.scale.set(
                originalScale.x * 0.9,
                originalScale.y * 0.9,
                originalScale.z * 0.9
            );

            // Add a colored ring effect behind the photo
            punchingBag.traverse((node) => {
                if (node.isMesh && node.geometry.type === 'BoxGeometry') {
                    // This is the backing board
                    if (node.material) {
                        const originalColor = node.material.color.clone();
                        node.material.color.setHex(0xff3333); // Red flash on backing

                        setTimeout(() => {
                            node.material.color.copy(originalColor);
                        }, 200);
                    }
                }
            });

            // Restore scale
            setTimeout(() => {
                punchingBag.scale.copy(originalScale);
            }, 100);

        } else {
            // For default model: Use emissive red flash
            punchingBag.traverse((node) => {
                if (node.isMesh && node.material) {
                    // Store original emissive if not already stored
                    if (!node.userData.originalEmissive) {
                        node.userData.originalEmissive = node.material.emissive ? node.material.emissive.clone() : new THREE.Color(0x000000);
                    }

                    if (node.material.emissive) {
                        node.material.emissive.setHex(0xff0000);
                        node.material.emissiveIntensity = 0.8;
                    }
                }
            });

            // Reset after flash
            setTimeout(() => {
                punchingBag.traverse((node) => {
                    if (node.isMesh && node.material && node.material.emissive) {
                        node.material.emissiveIntensity = 0;
                    }
                });
            }, 200);
        }
    }
}


// (Legacy/Deprecated functions)
function handleAiming() { }
function shoot() { }

// Update Score Display
function updateScore() {
    const scoreValEl = document.getElementById('score');
    if (scoreValEl) scoreValEl.textContent = gameState.score;

    const accuracyEl = document.getElementById('accuracy');
    const accuracy = gameState.shots > 0
        ? Math.round((gameState.hits / gameState.shots) * 100)
        : 0;
    if (accuracyEl) accuracyEl.textContent = `Accuracy: ${accuracy}%`;

    const shotsEl = document.getElementById('shots');
    if (shotsEl) shotsEl.textContent = `Punches: ${gameState.shots}`;
}

// Update Hand Gesture Status
function updateHandStatus(text) {
    const statusEl = document.getElementById('hand-status');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.className = gameState.handDetected ? 'hand-detected' : '';
    }
}

// Update Aim/Attack Message
function updateAimStatus(text, className = '') {
    const statusEl = document.getElementById('aim-status');
    statusEl.textContent = text;
    statusEl.className = className;
}

// Setup Event Listeners
function setupEventListeners() {
    // Space to start/pause or manual punch
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault();
            initAudio(); // Start audio context on user interaction

            if (gameState.isPlaying) {
                // Manual punch simulation for testing
                handlePunch();
            } else {
                toggleGame();
            }
        }
    });

    // Click/Touch to start game (for mobile devices without space key)
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
        // Handle both click and touch events
        const handleCanvasInteraction = (e) => {
            // CRITICAL: Initialize/resume audio on EVERY user interaction (required for iOS)
            initAudio();

            // Only toggle game if not already playing (avoid accidental punches)
            if (!gameState.isPlaying) {
                toggleGame();
            }
        };

        canvas.addEventListener('click', handleCanvasInteraction);
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent double-firing on mobile
            handleCanvasInteraction(e);
        }, { passive: false });

        // Also add touchend listener to ensure audio is ready
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            // Resume audio context on touch end as well (belt and suspenders approach)
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }, { passive: false });
    }

    // Window Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Photo Upload
    const photoInput = document.getElementById('photo-input');
    const resetBtn = document.getElementById('reset-target-btn');

    if (photoInput) {
        photoInput.addEventListener('change', handlePhotoUpload);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetToDefaultTarget);
    }

    // Target Type Selectors
    const rabbitBtn = document.getElementById('rabbit-target-btn');
    const cellBtn = document.getElementById('cell-target-btn');
    const photoBtn = document.getElementById('photo-target-btn');
    const photoUploadSection = document.getElementById('photo-upload-section');

    if (rabbitBtn) {
        rabbitBtn.addEventListener('click', () => {
            switchToRabbitTarget();
            updateActiveButton('rabbit');
            if (photoUploadSection) photoUploadSection.style.display = 'none';
        });
    }

    if (cellBtn) {
        cellBtn.addEventListener('click', () => {
            switchToCellTarget();
            updateActiveButton('cell');
            if (photoUploadSection) photoUploadSection.style.display = 'none';
        });
    }

    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            updateActiveButton('photo');
            if (photoUploadSection) photoUploadSection.style.display = 'block';
        });
    }

    // Audio Test Button - CRITICAL for iOS/iPad audio unlock
    const audioTestBtn = document.getElementById('audio-test-btn');
    if (audioTestBtn) {
        audioTestBtn.addEventListener('click', async () => {
            console.log('🔊 Audio test button clicked');

            // Initialize audio context
            initAudio();

            // Force resume
            if (audioCtx && audioCtx.state !== 'running') {
                try {
                    await audioCtx.resume();
                    console.log('🔊 Audio context state after resume:', audioCtx.state);
                } catch (err) {
                    console.error('❌ Failed to resume audio:', err);
                }
            }

            // Play a test sound
            await playPunchSound();

            // Give user feedback
            const originalText = audioTestBtn.textContent;
            audioTestBtn.textContent = audioCtx && audioCtx.state === 'running'
                ? '✅ Audio Ready!'
                : '❌ Audio Failed';

            setTimeout(() => {
                audioTestBtn.textContent = originalText;
            }, 1500);
        });
    }
}

// Update Active Target Button
function updateActiveButton(type) {
    const rabbitBtn = document.getElementById('rabbit-target-btn');
    const cellBtn = document.getElementById('cell-target-btn');
    const photoBtn = document.getElementById('photo-target-btn');

    // Remove active class from all
    if (rabbitBtn) rabbitBtn.classList.remove('active');
    if (cellBtn) cellBtn.classList.remove('active');
    if (photoBtn) photoBtn.classList.remove('active');

    // Add active class to selected
    if (type === 'rabbit' && rabbitBtn) rabbitBtn.classList.add('active');
    if (type === 'cell' && cellBtn) cellBtn.classList.add('active');
    if (type === 'photo' && photoBtn) photoBtn.classList.add('active');
}

// Switch to Rabbit Target
function switchToRabbitTarget() {
    targetType = 'rabbit';
    usingCustomTarget = false;
    usingCellTarget = false;

    // Clean up ALL cell-related particles
    // 1. Clean up explosion particles (those in cellParticles array)
    if (cellParticles && cellParticles.length > 0) {
        cellParticles.forEach(particle => {
            scene.remove(particle);
            if (particle.geometry) particle.geometry.dispose();
            if (particle.material) particle.material.dispose();
        });
        cellParticles = []; // Clear the array
    }

    // 2. Hide cell target and its particles
    if (cellTarget) {
        cellTarget.visible = false;
        // Hide all particle clouds if they exist
        if (cellTarget.userData.cloudParticles) {
            cellTarget.userData.cloudParticles.forEach(particle => {
                particle.visible = false;
            });
        }
    }

    // Clean up any explosion particles
    scene.traverse((object) => {
        if (object.userData && object.userData.isExplosionParticle) {
            scene.remove(object);
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        }
    });

    // Remove custom target if exists
    if (customTargetMesh) {
        scene.remove(customTargetMesh);
        if (customTargetMesh.geometry) customTargetMesh.geometry.dispose();
        if (customTargetMesh.material) {
            if (Array.isArray(customTargetMesh.material)) {
                customTargetMesh.material.forEach(m => m.dispose());
            } else {
                customTargetMesh.material.dispose();
            }
        }
        customTargetMesh = null;
    }

    // Show rabbit (find it in scene) - only show objects explicitly marked as rabbit
    scene.traverse((object) => {
        if (object.userData && object.userData.isRabbitTarget) {
            object.visible = true;
            punchingBag = object;
            targets = [object];
        }
    });

    console.log('🐰 Switched to Rabbit target (cleaned up all cell particles)');
}

// Switch to Cell Target
function switchToCellTarget() {
    targetType = 'cell';
    usingCustomTarget = false;
    usingCellTarget = true;

    // Hide rabbit and custom targets
    scene.traverse((object) => {
        if (object.isGroup || object.isMesh) {
            if ((object.children.length > 0 && object.children[0].isMesh && !object.userData.isCustomTarget) || object.userData.isCustomTarget) {
                object.visible = false;
            }
        }
    });

    // Remove custom target if exists
    if (customTargetMesh) {
        scene.remove(customTargetMesh);
        if (customTargetMesh.geometry) customTargetMesh.geometry.dispose();
        if (customTargetMesh.material) {
            if (Array.isArray(customTargetMesh.material)) {
                customTargetMesh.material.forEach(m => m.dispose());
            } else {
                customTargetMesh.material.dispose();
            }
        }
        customTargetMesh = null;
    }

    // Show cell target
    if (cellTarget) {
        cellTarget.visible = true;
        punchingBag = cellTarget;
        targets = [cellTarget];
    }

    console.log('🦠 Switched to Cell target');
}


// Toggle Game Play State
async function toggleGame() {
    gameState.isPlaying = !gameState.isPlaying;

    if (gameState.isPlaying) {
        // CRITICAL: Initialize and resume audio IMMEDIATELY when game starts
        initAudio();

        // Force resume audio context for mobile (belt and suspenders)
        if (audioCtx && audioCtx.state === 'suspended') {
            try {
                await audioCtx.resume();
                console.log('🔊 Audio unlocked on game start, state:', audioCtx.state);
            } catch (err) {
                console.error('❌ Failed to unlock audio:', err);
            }
        }

        if (gameState.handDetected) {
            updateHandStatus('Game Active...');
        } else {
            updateHandStatus('Game Active... (Waiting for hands)');
        }
        // Reset targets compatibility
        targets.forEach(target => {
            target.userData.isHit = false;
        });
    } else {
        updateHandStatus('Game Paused');
        updateAimStatus('Tap Screen or Press SPACE to Resume');
    }
}

// Handle Photo Upload
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file!');
        return;
    }

    // Create file reader
    const reader = new FileReader();

    reader.onload = function (e) {
        const imageUrl = e.target.result;

        // Update preview - DISABLED (user doesn't want preview)
        // const previewImg = document.getElementById('preview-img');
        // const previewSection = document.getElementById('photo-preview');
        const resetBtn = document.getElementById('reset-target-btn');

        // Don't show preview
        // if (previewImg && previewSection) {
        //     previewImg.src = imageUrl;
        //     previewSection.style.display = 'block';
        // }

        if (resetBtn) {
            resetBtn.style.display = 'block';
        }

        // Create custom 3D target with the photo
        createCustomPhotoTarget(imageUrl);

        console.log('✅ Photo uploaded successfully!');
    };

    reader.readAsDataURL(file);
}

// Create Custom Photo Target
function createCustomPhotoTarget(imageUrl) {
    // Load image as texture
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load(
        imageUrl,
        function (texture) {
            customPhotoTexture = texture;

            // Debug texture loading
            console.log('📸 Texture loaded:', {
                width: texture.image ? texture.image.width : 'unknown',
                height: texture.image ? texture.image.height : 'unknown',
                format: texture.format,
                type: texture.type
            });

            // CRITICAL: Set high-quality texture settings for sharp display
            // Use trilinear filtering (best quality)
            texture.minFilter = THREE.LinearMipmapLinearFilter; // Best quality when zoomed out
            texture.magFilter = THREE.LinearFilter; // Best quality when zoomed in
            texture.generateMipmaps = true; // Generate mipmaps for better quality
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;

            // Maximize anisotropic filtering for sharpness at angles
            const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
            if (maxAnisotropy > 1) {
                texture.anisotropy = maxAnisotropy; // Usually 16x on modern GPUs
            }

            texture.needsUpdate = true;

            console.log(`🎨 Texture settings: minFilter=LinearMipmapLinear, magFilter=Linear, anisotropy=${texture.anisotropy}x`);

            // Remove old custom target if exists
            if (customTargetMesh) {
                scene.remove(customTargetMesh);
            }

            // Create a humanoid-shaped target (body + head)
            const targetGroup = new THREE.Group();

            // Calculate aspect ratio from photo
            const photoWidth = texture.image.width;
            const photoHeight = texture.image.height;
            const aspectRatio = photoWidth / photoHeight;

            // Set target size - larger for better visibility
            // With high pixel ratio rendering, larger targets still look sharp
            const targetHeight = 5.0; // Increased for better visibility
            const targetWidth = targetHeight * aspectRatio; // Maintain photo aspect ratio

            console.log(`📐 Target dimensions: ${targetWidth.toFixed(2)} x ${targetHeight}m (aspect ratio: ${aspectRatio.toFixed(2)})`);
            console.log(`📸 Photo resolution: ${photoWidth} x ${photoHeight}px`);
            console.log(`🖥️ Renderer pixel ratio: ${renderer.getPixelRatio()}x`);

            // Body (rectangle with photo texture)
            const bodyGeometry = new THREE.PlaneGeometry(targetWidth, targetHeight);

            // Use MeshBasicMaterial - doesn't need lighting, always visible
            const bodyMaterial = new THREE.MeshBasicMaterial({
                map: texture,
                side: THREE.DoubleSide
            });

            const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
            bodyMesh.position.y = 1.25;
            bodyMesh.position.z = 0.06; // Move forward to be in front of backing board
            targetGroup.add(bodyMesh);

            // Add a simple backing board for depth (match photo size)
            const backGeometry = new THREE.BoxGeometry(targetWidth, targetHeight, 0.1);
            const backMaterial = new THREE.MeshStandardMaterial({
                color: 0x333333
            });
            const backMesh = new THREE.Mesh(backGeometry, backMaterial);
            backMesh.position.y = 1.25;
            backMesh.position.z = -0.05;
            backMesh.castShadow = true;
            targetGroup.add(backMesh);

            // Position the target
            targetGroup.position.set(0, 1, -5);

            // Hide default rabbit
            if (punchingBag && !usingCustomTarget) {
                punchingBag.visible = false;
            }

            // Hide cell target
            if (cellTarget) {
                cellTarget.visible = false;
            }

            // Add to scene
            scene.add(targetGroup);
            customTargetMesh = targetGroup;
            punchingBag = targetGroup; // Make this the active target
            targets = [targetGroup];
            usingCustomTarget = true;
            targetType = 'photo'; // Set target type

            console.log('✅ Custom photo target created!');
        },
        undefined,
        function (error) {
            console.error('❌ Error loading photo texture:', error);
            alert('Failed to load photo. Please try again.');
        }
    );
}

// Reset to Default Rabbit Target
function resetToDefaultTarget() {
    // Hide custom target
    if (customTargetMesh) {
        customTargetMesh.visible = false;
    }

    // Show rabbit
    if (punchingBag && usingCustomTarget) {
        // Find the original rabbit in the scene
        scene.traverse((object) => {
            if (object.isGroup && object !== customTargetMesh) {
                // Check if this looks like a loaded GLTF model
                if (object.children.length > 0 && object.children[0].isMesh) {
                    object.visible = true;
                    punchingBag = object;
                    targets = [object];
                }
            }
        });
    }

    usingCustomTarget = false;

    // Hide preview
    const previewSection = document.getElementById('photo-preview');
    const resetBtn = document.getElementById('reset-target-btn');

    if (previewSection) {
        previewSection.style.display = 'none';
    }

    if (resetBtn) {
        resetBtn.style.display = 'none';
    }

    console.log('✅ Reset to default rabbit target');
}


// Animation Loop
let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    // Calculate delta time for physics
    const currentTime = performance.now();
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1); // Cap at 100ms to avoid huge jumps
    lastTime = currentTime;

    // Update OrbitControls for smooth damping
    if (controls) {
        controls.update();
    }

    // Update particle cloud floating animation
    updateCellCloud(currentTime);

    // Update particle system
    updateParticles(deltaTime);

    // Bag physical simulation: Simple sway recovery
    if (punchingBag) {
        punchingBag.rotation.x *= 0.95;
        punchingBag.rotation.z *= 0.95;
    }

    renderer.render(scene, camera);
}

// Update Cell Cloud Floating Animation
function updateCellCloud(time) {
    // Only animate if cell target is visible and is a particle cloud
    if (!cellTarget || !cellTarget.visible || !cellTarget.userData.isParticleCloud) return;

    const cloudParticles = cellTarget.userData.cloudParticles;
    if (!cloudParticles) return;

    // Animate each particle with gentle floating motion
    cloudParticles.forEach(particle => {
        if (!particle.userData.originalPos) return;

        const data = particle.userData;
        const t = time * 0.001; // Convert to seconds

        // Calculate floating offset using sine waves
        const offsetX = Math.sin(t * data.floatSpeed + data.floatOffset) * data.floatRadius;
        const offsetY = Math.cos(t * data.floatSpeed * 0.7 + data.floatOffset) * data.floatRadius;
        const offsetZ = Math.sin(t * data.floatSpeed * 0.5 + data.floatOffset + 1.5) * data.floatRadius;

        // Apply the floating offset to original position
        particle.position.x = data.originalPos.x + offsetX;
        particle.position.y = data.originalPos.y + offsetY;
        particle.position.z = data.originalPos.z + offsetZ;
    });
}



// Initialize the game
init();
