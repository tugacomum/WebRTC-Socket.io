// Get the room ID from the URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

// Local variables
const drawingCanvas = document.getElementById("drawingCanvas");
const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const switchCameraButton = document.getElementById("switchCameraButton");
const fullScreenButton = document.getElementById("fullScreenButton");
const disableCameraButton = document.getElementById("disableCameraButton");
const muteButton = document.getElementById("muteButton");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const ctx = drawingCanvas.getContext("2d");
const drawingData = [];

// Connect to the Socket.IO server
const socket = io();
let isDrawing = false;
let isCameraEnabled = true;
let isAudioEnabled = true;
let currentPath = [];
let drawingPath = null;

function redrawDrawings() {
  ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  for (const drawing of drawingData) {
    ctx.beginPath();
    for (const point of drawing) {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }
}

function activateFullScreen() {
  const elem = document.documentElement; // Elemento raiz (todo o documento)

  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  } else if (elem.webkitEnterFullscreen) {
    elem.webkitEnterFullscreen();
  }
}

function adjustVideoSizes() {
  const isFullScreen = document.fullscreenElement || document.webkitFullscreenElement;
  if (isFullScreen) {
    remoteVideo.style.width = "100%";
    remoteVideo.style.height = "100%";
    remoteVideo.style.position = "fixed";
    remoteVideo.style.top = "0";
    remoteVideo.style.left = "0";
  } else {
    remoteVideo.style.width = "";
    remoteVideo.style.height = "";
    remoteVideo.style.position = "";
    remoteVideo.style.top = "";
    remoteVideo.style.left = "";
  }
}

fullScreenButton.addEventListener("click", () => {
  activateFullScreen();
});

socket.emit("join-room", roomId);

function resizeCanvas() {
  drawingCanvas.width = window.innerWidth;
  drawingCanvas.height = window.innerHeight;
  redrawDrawings();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function onFullScreenChange() {
  adjustVideoSizes();
}

document.addEventListener("fullscreenchange", onFullScreenChange);
document.addEventListener("webkitfullscreenchange", onFullScreenChange);
document.addEventListener("mozfullscreenchange", onFullScreenChange);
document.addEventListener("MSFullscreenChange", onFullScreenChange);

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:relay1.expressturn.com:3478",
      username: "efIIQSJUEZCHJP1T05",
      credential: "fJormf7nIWyWoY78",
    },
  ],
};

let currentStream = null;
let currentCameraIndex = 0;
let videoDevices = [];

// Get the local video stream
async function getMediaStream(constraints) {
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
}

async function getVideoDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  videoDevices = devices.filter(device => device.kind === 'videoinput');
}

async function switchCamera() {
  if (videoDevices.length > 1) {
    currentCameraIndex = (currentCameraIndex + 1) % videoDevices.length;
    const constraints = {
      video: { deviceId: videoDevices[currentCameraIndex].deviceId },
      audio: true
    };
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    currentStream = await getMediaStream(constraints);
    localVideo.srcObject = currentStream;
  }
}

switchCameraButton.addEventListener("click", () => {
  switchCamera();
});

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(async (stream) => {
    currentStream = stream;
    localVideo.srcObject = stream;
    localVideo.style.transform = "scaleX(-1)";
    await getVideoDevices();

    // Create a new WebRTC peer connection
    const peerConnection = new RTCPeerConnection(configuration);

    // Add the local stream to the peer connection
    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    // Listen for ICE candidates and send them to the other peer
    peerConnection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    });

    // Listen for remote tracks and add them to the remote video element
    peerConnection.addEventListener("track", (event) => {
      if (!remoteVideo.srcObject) {
        remoteVideo.srcObject = new MediaStream();
        remoteVideo.style.transform = "scaleX(-1)";
      }
      remoteVideo.srcObject.addTrack(event.track);
    });

    // Send the offer to the other peer
    peerConnection
      .createOffer()
      .then((offer) => {
        socket.emit("offer", offer);
        return peerConnection.setLocalDescription(offer);
      })
      .catch((error) => {
        console.error("Error creating offer:", error);
      });

    // Handle the received offer
    socket.on("offer", (offer) => {
      peerConnection
        .setRemoteDescription(offer)
        .then(() => peerConnection.createAnswer())
        .then((answer) => {
          socket.emit("answer", answer);
          return peerConnection.setLocalDescription(answer);
        })
        .catch((error) => {
          console.error("Error creating answer:", error);
        });
    });

    // Handle the received answer
    socket.on("answer", (answer) => {
      peerConnection.setRemoteDescription(answer).catch((error) => {
        console.error("Error setting remote description:", error);
      });
    });

    // Handle the received ICE candidate
    socket.on("ice-candidate", (candidate) => {
      peerConnection.addIceCandidate(candidate).catch((error) => {
        console.error("Error adding ICE candidate:", error);
      });
    });

    // Disable or enable the camera
    disableCameraButton.addEventListener("click", () => {
      if (isCameraEnabled) {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = false;
        });
        disableCameraButton.querySelector("img").src = "./disable-camera.svg";
      } else {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });
        disableCameraButton.querySelector("img").src = "./enable-camera.svg";
      }
      isCameraEnabled = !isCameraEnabled;
    });

    // Mute/unmute the audio
    muteButton.addEventListener("click", () => {
      if (isAudioEnabled) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        muteButton.querySelector("img").src = "./mute.svg";
      } else {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        muteButton.querySelector("img").src = "./unmute.svg";
      }
      isAudioEnabled = !isAudioEnabled;
    });

    drawingCanvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousedown", {
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
      drawingCanvas.dispatchEvent(mouseEvent);
    });

    drawingCanvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousemove", {
        clientX: touch.clientX,
        clientY: touch.clientY,
      });
      drawingCanvas.dispatchEvent(mouseEvent);
    });

    drawingCanvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      const mouseEvent = new MouseEvent("mouseup", {});
      drawingCanvas.dispatchEvent(mouseEvent);
    });

    // Draw on the canvas
    drawingCanvas.addEventListener("mousemove", (e) => {
      if (isDrawing) {
        draw(e);
      }
    });

    drawingCanvas.addEventListener("mousedown", (e) => {
      currentPath = [];
      isDrawing = true;
      draw(e);
    });

    drawingCanvas.addEventListener("mouseup", () => {
      if (isDrawing) {
        isDrawing = false;
        socket.emit("draw", currentPath.slice());
        drawingData.push(currentPath.slice());
        currentPath = [];
        ctx.beginPath();
      }
    });

    socket.on("draw", (data) => {
      drawingData.push(data);
      redrawDrawings();
    });

    deleteButton.addEventListener("click", () => {
      socket.emit("clear-drawing");
      clearDrawingCanvas();
    });

    socket.on("clear-drawing", () => {
      clearDrawingCanvas();
      redrawDrawings();
    });

    undoButton.addEventListener("click", () => {
      socket.emit("undo-drawing");
    });

    socket.on("undo-drawing", () => {
      undoDrawing();
    });

    function clearDrawingCanvas() {
      for (let i = 0; i < drawingData.length; i++) {
        drawingData[i] = [];
      }
      ctx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }

    function undoDrawing() {
      if (drawingData.length > 0) {
        drawingData.pop(); // Remove the last drawing
        redrawDrawings();
      }
    }

    function draw(e) {
      const rect = drawingCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      ctx.strokeStyle = "red";

      currentPath.push({ x, y });

      ctx.beginPath();
      if (currentPath.length > 1) {
        const prevPoint = currentPath[currentPath.length - 2];
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  })
  .catch((error) => {
    console.error("Error accessing media devices:", error);
  });

// Handle user-connected event
socket.on("user-connected", (userId) => {});

// Handle user-disconnected event
socket.on("user-disconnected", (userId) => {});