const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

const drawingCanvas = document.getElementById("drawingCanvas");
const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const switchCameraButton = document.getElementById("switchCameraButton");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const switchCameraDeviceButton = document.getElementById("swipCameraButton");

const ctx = drawingCanvas.getContext("2d");
const drawingData = [];

const socket = io();
let isDrawing = false;
let isCameraEnabled = true;
let isAudioEnabled = true;
let currentPath = [];
let drawingPath = null;

let currentFacingMode = "user";

switchCameraDeviceButton.addEventListener("click", () => {
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  switchCameraStream();
});

function switchCameraStream() {
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: currentFacingMode }, audio: true })
    .then((stream) => {
      const localVideo = document.getElementById("localVideo");
      const tracks = localVideo.srcObject.getTracks();

      tracks.forEach((track) => track.stop());

      localVideo.srcObject = stream;

      const sender = peerConnection
        .getSenders()
        .find((s) => s.track.kind === "video");
      sender.replaceTrack(stream.getVideoTracks()[0]);
    })
    .catch((error) => {
      console.error("Error accessing media devices:", error);
    });
}

function isMobileDevice() {
  return (
    typeof window.orientation !== "undefined" ||
    navigator.userAgent.indexOf("IEMobile") !== -1
  );
}

function toggleFullScreen() {
  if (
    !document.fullscreenElement &&
    !document.mozFullScreenElement &&
    !document.webkitFullscreenElement &&
    !document.msFullscreenElement
  ) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) {
      document.documentElement.msRequestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen(
        Element.ALLOW_KEYBOARD_INPUT
      );
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

function showFullScreenPrompt() {
  const fullScreenButton = document.getElementById("fullScreenButton");

  fullScreenButton.addEventListener("click", () => {
    if (isMobileDevice()) {
      const confirmFullScreen = confirm(
        "Do you want to enter fullscreen mode for a better experience?"
      );
      if (confirmFullScreen) {
        toggleFullScreen();
      }
    } else console.log("tas em desktop")
  });
}

showFullScreenPrompt();

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

socket.emit("join-room", roomId);

function resizeCanvas() {
  drawingCanvas.width = window.innerWidth;
  drawingCanvas.height = window.innerHeight;
  redrawDrawings();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

switchCameraButton.addEventListener("click", () => {
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");

  const localVideoStyles = {
    width: localVideo.style.width,
    height: localVideo.style.height,
    position: localVideo.style.position,
    top: localVideo.style.top,
    bottom: localVideo.style.bottom,
    left: localVideo.style.left,
    right: localVideo.style.right,
    marginBottom: localVideo.style.marginBottom,
    marginRight: localVideo.style.marginRight,
  };

  const remoteVideoStyles = {
    width: remoteVideo.style.width,
    height: remoteVideo.style.height,
    position: remoteVideo.style.position,
    top: remoteVideo.style.top,
    bottom: remoteVideo.style.bottom,
    left: remoteVideo.style.left,
    right: remoteVideo.style.right,
    marginBottom: remoteVideo.style.marginBottom,
    marginRight: remoteVideo.style.marginRight,
  };

  const tempStream = localVideo.srcObject;
  localVideo.srcObject = remoteVideo.srcObject;
  remoteVideo.srcObject = tempStream;

  Object.assign(localVideo.style, remoteVideoStyles);
  Object.assign(remoteVideo.style, localVideoStyles);

  if (localVideo.style.transform === "scaleX(-1)") {
    localVideo.style.transform = "";
    remoteVideo.style.transform = "scaleX(-1)";
  } else {
    localVideo.style.transform = "scaleX(-1)";
    remoteVideo.style.transform = "";
  }
});

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

navigator.mediaDevices
  .getUserMedia({ video: true, audio: true })
  .then((stream) => {
    localVideo.srcObject = stream;
    localVideo.style.transform = "scaleX(-1)";

    const peerConnection = new RTCPeerConnection(configuration);

    stream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, stream);
    });

    peerConnection.addEventListener("icecandidate", (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
      }
    });

    peerConnection.addEventListener("track", (event) => {
      if (!remoteVideo.srcObject) {
        remoteVideo.srcObject = new MediaStream();
        remoteVideo.style.transform = "scaleX(-1)";
      }
      remoteVideo.srcObject.addTrack(event.track);
    });

    peerConnection
      .createOffer()
      .then((offer) => {
        socket.emit("offer", offer);
        return peerConnection.setLocalDescription(offer);
      })
      .catch((error) => {
        console.error("Error creating offer:", error);
      });

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

    socket.on("answer", (answer) => {
      peerConnection.setRemoteDescription(answer).catch((error) => {
        console.error("Error setting remote description:", error);
      });
    });

    socket.on("ice-candidate", (candidate) => {
      peerConnection.addIceCandidate(candidate).catch((error) => {
        console.error("Error adding ICE candidate:", error);
      });
    });

    const disableCameraButton = document.getElementById("disableCameraButton");
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

    const muteButton = document.getElementById("muteButton");
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
        drawingData.pop();
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

socket.on("user-connected", (userId) => {});

socket.on("user-disconnected", (userId) => {});