// script.js
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const glassesEl = document.getElementById('glasses');
const frameSelect = document.getElementById('frameSelect');
const orderBtn = document.getElementById('orderBtn');

// Replace with your shop WhatsApp number when deploying (country code + number, no +)
const shopWhatsAppNumber = "8801XXXXXXXXX";

// update order link when frame changes
function updateOrderLink() {
  const frame = frameSelect.value.split('/').pop();
  orderBtn.href = `https://wa.me/${shopWhatsAppNumber}?text=${encodeURIComponent("I want to order this frame: " + frame)}`;
}
frameSelect.addEventListener('change', (e) => {
  glassesEl.src = e.target.value;
  updateOrderLink();
});
updateOrderLink();

// resize overlay to video size
function syncCanvasSize() {
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
}

// map normalized landmark to pixel coords (video is mirrored)
function landmarkToPoint(landmark) {
  return {
    x: (1 - landmark.x) * videoElement.videoWidth, // mirror horizontally
    y: landmark.y * videoElement.videoHeight,
    z: landmark.z
  };
}

// compute angle between two points in degrees
function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

// set transform on glasses element
function positionGlasses(leftEye, rightEye, noseTip) {
  // center point between eyes
  const cx = (leftEye.x + rightEye.x) / 2;
  const cy = (leftEye.y + rightEye.y) / 2;

  // eye distance
  const dx = rightEye.x - leftEye.x;
  const dy = rightEye.y - leftEye.y;
  const eyeDist = Math.hypot(dx, dy);

  // scale factor to apply to base width
  const width = eyeDist * 2.2; // tweak multiplier for fit

  // rotation angle
  const angle = angleBetween(leftEye, rightEye);

  // optional vertical offset using nose tip for better placement
  const vOffset = (noseTip.y - cy) * 0.25;

  // apply styles
  glassesEl.style.width = `${width}px`;
  // translate to pixel position then rotate
  glassesEl.style.left = `${cx}px`;
  glassesEl.style.top = `${cy + vOffset}px`;
  glassesEl.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
  glassesEl.style.opacity = 1;
}

// draw debug points if needed (turn on by setting debug=true)
const debug = false;
function drawDebug(landmarks) {
  if (!debug) return;
  canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height);
  canvasCtx.fillStyle = 'red';
  for (const p of landmarks) {
    canvasCtx.beginPath();
    canvasCtx.arc(p.x, p.y, 2, 0, Math.PI*2);
    canvasCtx.fill();
  }
}

// initialize MediaPipe FaceMesh
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
  if (!videoElement.videoWidth) return;
  syncCanvasSize();

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const lm = results.multiFaceLandmarks[0];

    // common landmark indices: left eye outer ~33, right eye outer ~263, nose tip ~1 (MediaPipe indexing)
    const leftEyeLm = landmarkToPoint(lm[33]);
    const rightEyeLm = landmarkToPoint(lm[263]);
    const noseTipLm = landmarkToPoint(lm[1]);

    positionGlasses(leftEyeLm, rightEyeLm, noseTipLm);

    // debug draw
    drawDebug([leftEyeLm, rightEyeLm, noseTipLm]);
  } else {
    // hide glasses if no face detected
    glassesEl.style.opacity = 0;
    canvasCtx.clearRect(0,0,canvasElement.width,canvasElement.height);
  }
});

// start camera capture using MediaPipe Camera utils
async function startCamera() {
  // request camera
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false
  });
  videoElement.srcObject = stream;

  // wait until metadata loaded so videoWidth/Height exist
  await new Promise(resolve => {
    videoElement.onloadedmetadata = () => resolve();
  });

  // create MediaPipe Camera to send frames to faceMesh
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await faceMesh.send({image: videoElement});
    },
    width: videoElement.videoWidth,
    height: videoElement.videoHeight
  });
  camera.start();
}

startCamera().catch(err => {
  console.error("Camera start failed:", err);
  alert("Camera access is required. Check your browser permissions.");
});